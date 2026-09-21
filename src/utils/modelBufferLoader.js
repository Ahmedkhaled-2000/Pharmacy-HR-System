/**
 * modelBufferLoader.js
 * نظام موحد وفائق الاعتمادية لتحميل وتخزين ملفات ونماذج الذكاء الاصطناعي (MediaPipe & ONNX Runtime Web)
 * 
 * المزايا الهندسية:
 * 1. دعم التحميل المباشر من الذاكرة المحلية لسطح المكتب (Desktop Native IPC Buffer)
 * 2. دعم ذاكرة التخزين الدائم بالمتصفح (CacheStorage API) للعمل الفوري بدون استهلاك للإنترنت (0ms Instant Load)
 * 3. آلية التبديل التلقائي بين مسارات متعددة (Nginx Static, REST API Proxy, Local Base, Cloud CDN)
 * 4. الحماية الصارمة من استلام صفحات الخطأ كملفات نماذج (فحص Content-Type ليس HTML وفحص الحد الأدنى للحجم)
 * 5. استقرار تام لـ WebAssembly SIMD لمنع انهيار محرك Emscripten على هواتف iOS و Android
 */

const CACHE_NAME = 'pharmacy-biometric-models-v2';

/**
 * استخراج النطاق الأساسي لبيئة التشغيل (Electron, Web, Mobile PWA)
 */
export const getAssetBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
    return window.location.origin;
  }
  return '';
};

/**
 * فحص ما إذا كان المتصفح يدعم تعليمات WebAssembly SIMD
 */
export const isWasmSimdSupported = () => {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11
      ]));
  } catch {
    return false;
  }
};

/**
 * جلب بايتات النموذج كـ Uint8Array مع الحماية من أخطاء 403/404 وتخزينها في CacheStorage
 * @param {string} fileName اسم الملف (مثل 'w600k_mbf.onnx' أو 'face_landmarker.task')
 * @param {string[]} extraCandidateUrls روابط إضافية بديلة
 * @param {number} minBytes الحجم الأدنى المقبول للبايتات (لضمان سلامة الملف وعدم كونه صفحة HTML)
 * @returns {Promise<Uint8Array>}
 */
export async function fetchModelBufferWithCache(fileName, extraCandidateUrls = [], minBytes = 500000) {
  // 1. بيئة تطبيق سطح المكتب Electron عبر IPC المباشر
  if (typeof window !== 'undefined' && window.desktopAPI?.readModelBinary) {
    try {
      const buf = await window.desktopAPI.readModelBinary(`models/${fileName}`);
      if (buf && buf.byteLength >= minBytes) {
        console.log(`✅ [ModelLoader] ${fileName} loaded directly from native desktop disk (${buf.byteLength} bytes)`);
        return new Uint8Array(buf);
      }
    } catch (desktopErr) {
      console.warn(`[ModelLoader] Native desktop load fallback for ${fileName}:`, desktopErr);
    }
  }

  // 2. فحص ذاكرة CacheStorage المستمرة في المتصفح / الهاتف (تحميل فوري 0ms وبدون استهلاك للإنترنت)
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await window.caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(fileName);
      if (cachedResponse && cachedResponse.ok) {
        const buffer = await cachedResponse.arrayBuffer();
        if (buffer && buffer.byteLength >= minBytes) {
          console.log(`⚡ [ModelLoader] ${fileName} loaded from persistent CacheStorage (${buffer.byteLength} bytes) [0ms Instant]`);
          return new Uint8Array(buffer);
        } else {
          // ملف تالف أو أصغر من المتوقع، نقوم بحذفه من الكاش لتحديثه
          await cache.delete(fileName);
        }
      }
    } catch (cacheErr) {
      console.warn(`[ModelLoader] CacheStorage lookup note for ${fileName}:`, cacheErr);
    }
  }

  // 3. إعداد الروابط المرشحة بالترتيب الأفضل للأداء والموثوقية
  const baseUrl = getAssetBaseUrl();
  const defaultCandidates = [
    baseUrl ? `${baseUrl}/models/${fileName}` : `/models/${fileName}`,
    `/models/${fileName}`,
    baseUrl ? `${baseUrl}/api/models/${fileName}` : `/api/models/${fileName}`,
    `/api/models/${fileName}`,
    `./models/${fileName}`
  ];

  const allCandidates = Array.from(new Set([...defaultCandidates, ...extraCandidateUrls])).filter(Boolean);

  let lastError = null;

  for (const url of allCandidates) {
    try {
      console.log(`🌐 [ModelLoader] Fetching ${fileName} from: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout for large models

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        cache: 'default',
        headers: {
          'Accept': 'application/octet-stream,application/wasm,*/*'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        throw new Error(`Unexpected HTML response (possible 404/403 rewrite): ${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < minBytes) {
        throw new Error(`Incomplete binary data: got ${arrayBuffer?.byteLength || 0} bytes, expected >= ${minBytes}`);
      }

      const uint8 = new Uint8Array(arrayBuffer);
      console.log(`✅ [ModelLoader] Successfully downloaded ${fileName} (${uint8.byteLength} bytes) from ${url}`);

      // حفظ الملف في CacheStorage لاستخدامه في المرات القادمة بدون أي استهلاك للشبكة
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cache = await window.caches.open(CACHE_NAME);
          await cache.put(
            fileName,
            new Response(arrayBuffer.slice(0), {
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(uint8.byteLength),
                'Cache-Control': 'public, max-age=31536000, immutable'
              }
            })
          );
        } catch (saveErr) {
          console.warn(`[ModelLoader] Could not persist ${fileName} to CacheStorage:`, saveErr);
        }
      }

      return uint8;
    } catch (err) {
      lastError = err;
      console.warn(`[ModelLoader] Candidate failed (${url}):`, err.message || err);
    }
  }

  throw new Error(`تعذر تحميل ملف النموذج (${fileName}) من أي مسار: ${lastError?.message || 'تحقق من اتصال الإنترنت'}`);
}
