/**
 * apiClient.js
 * عميل الاتصال المباشر بـ MariaDB 10.11 & PHP Backend
 * يدعم المزامنة السريعة، الـ Smart Polling، وإدارة البيانات الحيوية
 */

export const STORAGE_KEY = 'pharmacy-tracker-data';
export const WORK_DAYS_PER_MONTH = 26;
export const WORK_HOURS_PER_DAY = 8;

// تحديد رابط الـ API تلقائياً
const getApiBaseUrl = () => {
  // إذا تم تحديد الرابط في متغيرات البيئة (.env)
  if (import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }

  // في بيئة المتصفح الحية
  if (typeof window !== 'undefined' && window.location) {
    const { origin, protocol, hostname } = window.location;
    if (origin && !hostname.includes('localhost') && !hostname.includes('127.0.0.1') && protocol.startsWith('http')) {
      return `${origin}/api`;
    }
  }

  // الرابط الافتراضي للتطوير والتجربة
  return 'https://nodejs-test.apexthunder.com/api';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * دالة مساعدة متقدمة لتنفيذ طلبات الـ HTTP مع مهلة زمنية ذكية وحاجز حماية (Circuit Breaker)
 * لمنع انهيار المتصفح أو تسريب الذاكرة عند حدوث أخطاء سحابية 500
 */
const activeETags = new Map();

// حاجز الحماية السحابي لمنع تكرار الاتصال العقيم بالسيرفر (Circuit Breaker)
let consecutiveServerErrors = 0;
let circuitBreakerCoolingUntil = 0;

export function isBackendHealthy() {
  return Date.now() >= circuitBreakerCoolingUntil;
}

export function resetBackendCircuitBreaker() {
  consecutiveServerErrors = 0;
  circuitBreakerCoolingUntil = 0;
}

async function request(endpoint, options = {}) {
  // إذا كان السيرفر في وضع التبريد والحماية من الانهيار (Circuit Breaker Active)
  if (Date.now() < circuitBreakerCoolingUntil && options.isBackground) {
    throw new Error(`[CircuitBreaker] الخادم قيد إعادة التشغيل والتبريد مؤقتاً.`);
  }

  const maxRetries = options.retries !== undefined ? options.retries : 0; // عدم تكرار الطلبات الخاطئة في نفس الثانية
  const baseTimeoutMs = options.timeout || 10000;
  
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const antiCacheQuery = options.noCache !== false ? `${separator}_t=${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : '';
    const url = `${API_BASE_URL}/${endpoint.replace(/^\/+/, '')}${antiCacheQuery}`;
    const timeoutMs = baseTimeoutMs;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...options.headers,
    };

    if (options.useETag && activeETags.has(url)) {
      headers['If-None-Match'] = activeETags.get(url);
    }

    const config = {
      ...options,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    };

    try {
      const response = await fetch(url, config);
      clearTimeout(timeoutId);

      // استجابة صحيحة -> تصفير عداد الأخطاء
      consecutiveServerErrors = 0;
      circuitBreakerCoolingUntil = 0;

      if (response.status === 304) {
        return { notModified: true, status: 304 };
      }

      const etag = response.headers.get('ETag') || response.headers.get('etag');
      if (etag) {
        activeETags.set(url, etag);
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { /* ignore */ }
        
        // عند حدوث خطأ 500 من الخادم، نقوم بتفعيل حاجز الحماية لتجنب إجهاد الذاكرة
        if (response.status >= 500) {
          consecutiveServerErrors++;
          if (consecutiveServerErrors >= 3) {
            circuitBreakerCoolingUntil = Date.now() + 25000; // تبريد لمدة 25 ثانية
            console.warn(`[ApiClient] خادم السحابة يواجه مشكلة (${response.status}) - تم تفعيل الحفظ المحلي الذكي.`);
          }
        }

        throw new Error(errorJson?.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (error.name !== 'AbortError' && !error.message?.includes('CircuitBreaker')) {
        console.warn(`[ApiClient] ${endpoint}: ${error.message}`);
      }

      if (attempt < maxRetries) {
        const delay = 1000;
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error(`انتهت مهلة الاتصال بالخادم. سيتم الاعتماد على الحفظ المحلي.`);
  }
  throw lastError || new Error(`تعذر الاتصال بالخادم.`);
}

// ── 1. دوال إعدادات وبيانات التطبيق الرئيسية (Settings / State) ────────────────
export async function apiFetchSettings(key = STORAGE_KEY, options = {}) {
  const res = await request(`settings?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    timeout: options.timeout || 8000,
    useETag: options.useETag || false,
    noCache: true,
    isBackground: options.isBackground !== undefined ? options.isBackground : true
  });
  if (res?.notModified) return { notModified: true };
  return res?.value || null;
}

export async function apiSaveSettings(key = STORAGE_KEY, value, options = {}) {
  return await request('settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
    timeout: options.timeout || 20000,
    noCache: true,
    isBackground: false
  });
}

// ── 2. فحص الإصدار للمزامنة الخفيفة (Ultra-Fast Smart Polling & Realtime SSE) ────
export async function apiFetchVersion(key = STORAGE_KEY, options = {}) {
  return await request(`sync/version?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    timeout: options.timeout || 3500,
    noCache: true,
    isBackground: options.isBackground !== undefined ? options.isBackground : true
  });
}

export function apiCreateEventSource(key = STORAGE_KEY, onVersionChange) {
  if (typeof window === 'undefined' || !('EventSource' in window)) return null;
  const url = `${API_BASE_URL}/stream?key=${encodeURIComponent(key)}&_t=${Date.now()}`;
  try {
    const es = new EventSource(url);
    es.addEventListener('version_change', (e) => {
      try {
        const data = JSON.parse(e.data);
        onVersionChange?.(data);
      } catch {}
    });
    es.onerror = () => {
      // إغلاق صامت عند انقطاع الاتصال مع ترك آلية المتصفح تعيد الاتصال
    };
    return es;
  } catch {
    return null;
  }
}

// ── 3. دوال البصمات الحيوية (Biometrics / Faces & Hands) ──────────────────────
export async function apiFetchFaces(employeeId = null) {
  const endpoint = employeeId ? `faces?employee_id=${encodeURIComponent(employeeId)}` : 'faces';
  const res = await request(endpoint, { method: 'GET' });
  return res?.data || (employeeId ? null : []);
}

export async function apiSaveFace(employeeId, data = {}) {
  return await request('faces', {
    method: 'POST',
    body: JSON.stringify({
      employee_id: employeeId,
      descriptor: data.descriptor || null,
      hand_descriptor: data.hand_descriptor || null,
      biometric_type: data.biometric_type || 'face',
    }),
  });
}

export async function apiDeleteFace(employeeId) {
  return await request(`faces?employee_id=${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
  });
}

// ── 4. دوال النسخ الاحتياطي (Full Backup / Restore) ───────────────────────────
export async function apiExportBackup() {
  return await request('backup/export', { method: 'POST' });
}

export async function apiImportBackup(payload) {
  return await request('backup/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── 5. تصفير ومسح السيرفر وقاعدة البيانات بالكامل (Full Factory Reset) ───────
export async function apiSystemReset(wipedState = null, key = STORAGE_KEY) {
  return await request('system/reset', {
    method: 'POST',
    body: JSON.stringify({ key, state: wipedState }),
    timeout: 25000,
    noCache: true
  });
}

// ── 6. فحص سلامة الاتصال (Health Check) ───────────────────────────────────────
export async function apiHealthCheck() {
  return await request('health', { method: 'GET' });
}
