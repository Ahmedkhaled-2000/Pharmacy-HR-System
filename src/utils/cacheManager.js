/**
 * cacheManager.js
 * وحدة متخصصة لمسح الكاش القديم وإجبار المتصفح على إعادة تحميل الصفحة بالكامل (Hard Reload & Purge Cache)
 */

let isPurging = false;

/**
 * إظهار واجهة مرئية فورية تفيد بجاري مسح الكاش
 */
function showPurgeOverlay() {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById('app-cache-purge-overlay');
  if (existing) return existing;

  const overlay = document.createElement('div');
  overlay.id = 'app-cache-purge-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Cairo', 'Tajawal', sans-serif;
    direction: rtl;
    color: #ffffff;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  `;

  overlay.innerHTML = `
    <div style="
      background: rgba(30, 41, 59, 0.95);
      border: 2px solid #0d9488;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5), 0 0 30px rgba(13, 148, 136, 0.4);
      border-radius: 24px;
      padding: 32px 28px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      animation: purgeModalPop 0.3s ease-out forwards;
    ">
      <div style="
        font-size: 52px;
        margin-bottom: 16px;
        display: inline-block;
        animation: purgeRotate 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      ">🧹</div>
      <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #5eead4;">
        جاري مسح الكاش القديم بالكامل
      </h3>
      <p style="margin: 0 0 20px 0; font-size: 13.5px; color: #cbd5e1; line-height: 1.6;">
        يتم الآن إلغاء Service Worker وحذف كافة ملفات التخزين المؤقت وإجبار المتصفح على جلب أحدث كود للنظام...
      </p>
      <div style="
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 12px 14px;
        text-align: right;
        font-size: 12px;
        color: #94a3b8;
        display: flex;
        flex-direction: column;
        gap: 6px;
      ">
        <div style="display: flex; align-items: center; gap: 8px; color: #34d399;">
          <span>✓</span> <span>إلغاء تسجيل برمجيات الـ Service Worker</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; color: #34d399;">
          <span>✓</span> <span>تفريغ ملفات CacheStorage المؤقتة</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; color: #38bdf8;">
          <span style="display: inline-block; animation: purgeSpin 1s linear infinite;">🔄</span> <span>إجبار المتصفح على إعادة التحميل المباشر...</span>
        </div>
      </div>
    </div>
    <style>
      @keyframes purgeRotate {
        0% { transform: rotate(0deg) scale(1); }
        50% { transform: rotate(-25deg) scale(1.15); }
        100% { transform: rotate(0deg) scale(1); }
      }
      @keyframes purgeSpin {
        100% { transform: rotate(360deg); }
      }
      @keyframes purgeModalPop {
        0% { transform: scale(0.9); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
    </style>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
  });

  return overlay;
}

/**
 * دالة مسح الكاش القديم وإجبار المتصفح على إعادة التحميل
 * @param {Object} options
 * @param {boolean} options.showOverlay - إظهار واجهة التحميل أثناء المسح (الافتراضي: true)
 */
export async function forceClearCacheAndReload(options = { showOverlay: true }) {
  if (isPurging) return;
  isPurging = true;

  try {
    if (options.showOverlay) {
      showPurgeOverlay();
    }

    // 1. إلغاء تسجيل جميع Service Workers النشطة في المتصفح
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations && registrations.length > 0) {
          await Promise.all(registrations.map((reg) => reg.unregister()));
        }
      } catch (swErr) {
        console.warn('[CachePurge] ServiceWorker unregister error:', swErr);
      }
    }

    // 2. مسح كافة ملفات التخزين المؤقت في CacheStorage
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        if (cacheKeys && cacheKeys.length > 0) {
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }
      } catch (cacheErr) {
        console.warn('[CachePurge] CacheStorage delete error:', cacheErr);
      }
    }

    // 3. مسح التخزين المؤقت للجلسة sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        sessionStorage.clear();
      } catch (sessErr) {
        console.warn('[CachePurge] SessionStorage clear error:', sessErr);
      }
    }

    // 4. حذف مؤشرات PWA المؤقتة إن وجدت دون لمس بيانات المؤسسة
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('app_version_cache');
        localStorage.removeItem('vite-plugin-pwa-cache');
      }
    } catch {}

    // فاصل زمني وجيز لضمان إنهاء عمليات الحذف في نظام التشغيل قبل التنقل
    await new Promise((resolve) => setTimeout(resolve, 350));
  } catch (err) {
    console.error('[CachePurge] Unexpected purge error:', err);
  }

  // 5. إجبار المتصفح على إعادة التحميل متجاوزاً الكاش مع Cache-Buster فريد
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_v', Date.now().toString());
    url.searchParams.set('_purge', '1');
    window.location.replace(url.toString());
  } catch (navErr) {
    window.location.reload(true);
  }
}

// إتاحة الدالة في نطاق window للاختبار المباشر عبر الكونسول
if (typeof window !== 'undefined') {
  window.forceClearCacheAndReload = forceClearCacheAndReload;
}
