/**
 * src/utils/systemUrlHelper.js
 * مزود وموحد الروابط العامة للمنظومة (Public System URL Resolver & Clipboard Formatter)
 * 
 * يضمن دائماً أنه عند نسخ أي رابط داخل تطبيق سطح المكتب (Windows Electron) أو بيئة التطوير
 * يتم نسخ الرابط العام الحي الرسمي للمنظومة (الذي يمكن للأجهزة الخارجية، هواتف الموظفين،
 * والشاشات، والفروع فتحه والاتصال به) بدلاً من نسخ رابط محلي مغلق مثل app://localhost أو localhost.
 */

export const DEFAULT_PRODUCTION_URL = 'https://nodejs-test.apexthunder.com';

/**
 * فحص ما إذا كان الرابط أو النطاق محلياً أو مخصصاً لسطح المكتب فقط
 */
export function isLocalOrDesktopUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('app://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('electron://') ||
    trimmed.includes('localhost') ||
    trimmed.includes('127.0.0.1') ||
    trimmed.includes('0.0.0.0') ||
    trimmed.includes('pharmacy-hr-system.vercel.app') // الرابط القديم المستبدل
  );
}

/**
 * فحص هل نحن داخل تطبيق سطح المكتب Electron
 */
export function isElectronDesktop() {
  if (typeof window === 'undefined') return false;
  if (window.desktopAPI?.isDesktop) return true;
  if (window.location?.protocol === 'app:' || window.location?.protocol === 'file:') return true;
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) {
    return true;
  }
  return false;
}

/**
 * جلب النطاق العام الرسمي المعتمد للمنظومة بدون أي مسارات زائدة أو شرطة مائلة في النهاية
 */
export function getPublicSystemOrigin(stateOrConfig = null) {
  // 1. فحص الإعدادات المباشرة في كائن الحالة (state)
  const stateSystemUrl = 
    stateOrConfig?.orgSettings?.systemUrl ||
    stateOrConfig?.orgSettings?.gmailConfig?.systemUrl ||
    stateOrConfig?.systemUrl;

  if (stateSystemUrl && typeof stateSystemUrl === 'string') {
    const trimmed = stateSystemUrl.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed)) {
      return trimmed;
    }
  }

  // 2. فحص التخزين المحلي الآمن (localStorage)
  try {
    if (typeof localStorage !== 'undefined') {
      const savedSystemUrl = localStorage.getItem('pharmacy_system_url');
      if (savedSystemUrl && typeof savedSystemUrl === 'string') {
        const trimmed = savedSystemUrl.trim().replace(/\/+$/, '');
        if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed)) {
          return trimmed;
        }
      }

      const localGmail = JSON.parse(localStorage.getItem('pharmacy_gmail_config') || '{}');
      if (localGmail?.systemUrl && typeof localGmail.systemUrl === 'string') {
        const trimmed = localGmail.systemUrl.trim().replace(/\/+$/, '');
        if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed)) {
          return trimmed;
        }
      }
    }
  } catch {}

  // 3. فحص نطاق المتصفح المباشر (فقط إذا كان متصفح ويب عام وحي، وليس تطبيق ويندوز ولا لوكال)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (
      !isElectronDesktop() &&
      origin &&
      origin !== 'null' &&
      !isLocalOrDesktopUrl(origin)
    ) {
      try {
        localStorage.setItem('pharmacy_system_url', origin);
      } catch {}
      return origin.replace(/\/+$/, '');
    }
  }

  // 4. الدومين الرسمي المعتمد للمنظومة
  return DEFAULT_PRODUCTION_URL;
}

/**
 * بناء رابط عام صالح وكامل لمسار معين (مثل /kiosk أو /careers أو /interview)
 */
export function getPublicSystemUrl(path = '', stateOrConfig = null) {
  const origin = getPublicSystemOrigin(stateOrConfig);
  if (!path) return origin;
  
  // إذا كان المسار رابطاً كاملاً بالفعل
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('app://') ||
    path.startsWith('file://')
  ) {
    if (isLocalOrDesktopUrl(path)) {
      // استبدال النطاق المحلي بالنطاق العام الرسمي
      try {
        const normalized = path.replace(/^app:\/\/localhost/, 'http://localhost');
        const parsed = new URL(normalized);
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return `${origin}/${path.replace(/^(https?:\/\/[^/]+|app:\/\/localhost|file:\/\/[^/]+)\/?/, '')}`;
      }
    }
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}

/**
 * نسخ الرابط العام للحافظة مع إشعار للمستخدم
 */
export async function copyPublicSystemUrl(urlOrPath, stateOrConfig = null, onSuccess = null) {
  const publicUrl = getPublicSystemUrl(urlOrPath, stateOrConfig);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(publicUrl);
    } else {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = publicUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  } catch (err) {
    console.warn('Failed to copy using standard clipboard:', err);
  }

  if (typeof onSuccess === 'function') {
    onSuccess(publicUrl);
  }
  return publicUrl;
}

/**
 * تثبيت اعتراض عام وذكي لـ navigator.clipboard.writeText في بيئة سطح المكتب
 * بحيث لو حاول أي مكون برمجياً نسخ رابط يبدأ بـ app://localhost أو localhost:5173
 * يتم تحويله تلقائياً وبشكل صامت إلى الرابط العام الرسمي المعتمد!
 */
export function installClipboardUrlSanitizer() {
  if (typeof window === 'undefined' || !navigator?.clipboard) return;
  
  // نتأكد من عدم التثبيت أكثر من مرة
  if (navigator.clipboard._hasUrlSanitizer) return;

  const originalWriteText = navigator.clipboard.writeText?.bind(navigator.clipboard);
  if (!originalWriteText) return;

  navigator.clipboard.writeText = async function (text) {
    let sanitizedText = text;
    if (typeof text === 'string') {
      const publicOrigin = getPublicSystemOrigin();
      sanitizedText = sanitizedText
        .replace(/app:\/\/localhost/gi, publicOrigin)
        .replace(/https?:\/\/localhost:5173/gi, publicOrigin)
        .replace(/https?:\/\/127\.0\.0\.1:5173/gi, publicOrigin)
        .replace(/https?:\/\/pharmacy-hr-system\.vercel\.app/gi, publicOrigin);
    }
    return originalWriteText(sanitizedText);
  };
  navigator.clipboard._hasUrlSanitizer = true;
}
