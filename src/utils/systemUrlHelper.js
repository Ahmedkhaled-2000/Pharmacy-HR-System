/**
 * src/utils/systemUrlHelper.js
 * مزود وموحد الروابط العامة للمنظومة (Public System URL Resolver & Clipboard Formatter)
 * 
 * يضمن دائماً أنه عند نسخ أي رابط داخل تطبيق سطح المكتب (Windows Electron) أو بيئة المتصفح (HTTP/HTTPS)
 * يتم نسخ الرابط العام الحي الرسمي لسيرفر الـ VPS المعتمد (http://63.183.147.199) بدلاً من روابط محليه أو روابط قديمة.
 */

export const DEFAULT_PRODUCTION_URL = 'http://63.183.147.199';

// تنظيف فوري واستباقي لأي قيم قديمة مخزنة في المتصفح للحسابات السابقة
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('pharmacy_system_url');
    if (saved && (saved.includes('apexthunder.com') || saved.includes('172.20.10.3') || saved.includes('vercel.app'))) {
      localStorage.setItem('pharmacy_system_url', DEFAULT_PRODUCTION_URL);
    }
    const localGmail = localStorage.getItem('pharmacy_gmail_config');
    if (localGmail && localGmail.includes('apexthunder.com')) {
      localStorage.setItem('pharmacy_gmail_config', localGmail.replace(/https?:\/\/[^"'\s]*apexthunder\.com/gi, DEFAULT_PRODUCTION_URL));
    }
  }
} catch {}

/**
 * فحص ما إذا كان الرابط أو النطاق محلياً أو قديماً
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
    trimmed.includes('apexthunder.com') ||
    trimmed.includes('172.20.10.3') ||
    trimmed.includes('pharmacy-hr-system.vercel.app')
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
 * جلب النطاق العام الرسمي المعتمد للمنظومة (VPS)
 */
export function getPublicSystemOrigin(stateOrConfig = null) {
  // 1. فحص الإعدادات المباشرة في كائن الحالة (state)
  const stateSystemUrl = 
    stateOrConfig?.orgSettings?.systemUrl ||
    stateOrConfig?.orgSettings?.gmailConfig?.systemUrl ||
    stateOrConfig?.systemUrl;

  if (stateSystemUrl && typeof stateSystemUrl === 'string') {
    const trimmed = stateSystemUrl.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed) && !trimmed.includes('apexthunder.com')) {
      return trimmed;
    }
  }

  // 2. فحص التخزين المحلي الآمن (localStorage)
  try {
    if (typeof localStorage !== 'undefined') {
      const savedSystemUrl = localStorage.getItem('pharmacy_system_url');
      if (savedSystemUrl && typeof savedSystemUrl === 'string') {
        const trimmed = savedSystemUrl.trim().replace(/\/+$/, '');
        if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed) && !trimmed.includes('apexthunder.com')) {
          return trimmed;
        }
      }

      const localGmail = JSON.parse(localStorage.getItem('pharmacy_gmail_config') || '{}');
      if (localGmail?.systemUrl && typeof localGmail.systemUrl === 'string') {
        const trimmed = localGmail.systemUrl.trim().replace(/\/+$/, '');
        if (trimmed.startsWith('http') && !isLocalOrDesktopUrl(trimmed) && !trimmed.includes('apexthunder.com')) {
          return trimmed;
        }
      }
    }
  } catch {}

  // 3. فحص نطاق المتصفح المباشر (مع استبعاد apexthunder و Electron)
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (
      !isElectronDesktop() &&
      origin &&
      origin !== 'null' &&
      !isLocalOrDesktopUrl(origin) &&
      !origin.includes('apexthunder.com')
    ) {
      try {
        localStorage.setItem('pharmacy_system_url', origin);
      } catch {}
      return origin.replace(/\/+$/, '');
    }
  }

  // 4. خادم الـ VPS المركزي المعتمد
  return DEFAULT_PRODUCTION_URL;
}

/**
 * تطهير واستبدال أي نطاقات قديمة فورياً بالنطاق الرسمي للـ VPS
 */
export function sanitizeSystemUrl(text) {
  if (!text || typeof text !== 'string') return text;
  const publicOrigin = getPublicSystemOrigin();
  return text
    .replace(/https?:\/\/[^/]*apexthunder\.com/gi, publicOrigin)
    .replace(/https?:\/\/172\.20\.10\.3(:\d+)?/gi, publicOrigin)
    .replace(/https?:\/\/pharmacy-hr-system\.vercel\.app/gi, publicOrigin)
    .replace(/app:\/\/localhost/gi, publicOrigin)
    .replace(/https?:\/\/localhost:\d+/gi, publicOrigin)
    .replace(/https?:\/\/127\.0\.0\.1:\d+/gi, publicOrigin);
}

/**
 * بناء رابط عام صالح ومباشر لمسار معين
 */
export function getPublicSystemUrl(path = '', stateOrConfig = null) {
  const origin = getPublicSystemOrigin(stateOrConfig);
  if (!path) return origin;
  
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('app://') ||
    path.startsWith('file://')
  ) {
    if (isLocalOrDesktopUrl(path) || path.includes('apexthunder.com')) {
      try {
        const normalized = path.replace(/^(app:\/\/localhost|http:\/\/localhost:\d+|https?:\/\/[^/]*apexthunder\.com)/, 'http://localhost');
        const parsed = new URL(normalized);
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return `${origin}/${path.replace(/^(https?:\/\/[^/]+|app:\/\/localhost|file:\/\/[^/]+)\/?/, '')}`;
      }
    }
    return sanitizeSystemUrl(path);
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}

/**
 * محرك النسخ الشامل للحافظة (يعمل عبر HTTPS و HTTP وجميع البيئات بلا استثناء)
 */
export async function safeCopyToClipboard(text) {
  if (typeof text !== 'string') text = String(text || '');
  const sanitizedText = sanitizeSystemUrl(text);

  // 1. تجربة الـ Modern Clipboard API إذا كانت البيئة Secure Context
  try {
    if (navigator?.clipboard?.writeText && (window.isSecureContext || window.location?.hostname === 'localhost')) {
      await navigator.clipboard.writeText(sanitizedText);
      return true;
    }
  } catch {}

  // 2. البديل العالمي الفوري المتوافق مع HTTP والمتصفحات المقيدة (execCommand Fallback)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = sanitizedText;
    textarea.setAttribute('readonly', '');
    textarea.style.contain = 'strict';
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.fontSize = '12pt';

    const selection = document.getSelection();
    let originalRange = null;
    if (selection && selection.rangeCount > 0) {
      originalRange = selection.getRangeAt(0);
    }

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (originalRange && selection) {
      selection.removeAllRanges();
      selection.addRange(originalRange);
    }
    return successful;
  } catch (err) {
    console.warn('[Clipboard] Copy fallback error:', err);
    return false;
  }
}

/**
 * نسخ الرابط العام للحافظة مع إشعار للمستخدم
 */
export async function copyPublicSystemUrl(urlOrPath, stateOrConfig = null, onSuccess = null) {
  const publicUrl = getPublicSystemUrl(urlOrPath, stateOrConfig);
  const success = await safeCopyToClipboard(publicUrl);
  if (success && typeof onSuccess === 'function') {
    onSuccess(publicUrl);
  }
  return publicUrl;
}

/**
 * تثبيت Polyfill واعتراض عام لـ navigator.clipboard لدعم HTTP وتطهير الروابط القديمة
 */
export function installClipboardUrlSanitizer() {
  if (typeof window === 'undefined') return;

  // 1. حقن Polyfill لـ navigator.clipboard إن لم يكن موجوداً على HTTP
  if (!navigator.clipboard) {
    navigator.clipboard = {
      writeText: async (text) => {
        const publicOrigin = getPublicSystemOrigin();
        let sanitized = String(text || '')
          .replace(/app:\/\/localhost/gi, publicOrigin)
          .replace(/https?:\/\/localhost:\d+/gi, publicOrigin)
          .replace(/https?:\/\/127\.0\.0\.1:\d+/gi, publicOrigin)
          .replace(/https?:\/\/[^/]*apexthunder\.com/gi, publicOrigin)
          .replace(/https?:\/\/172\.20\.10\.3(:\d+)?/gi, publicOrigin);
        return safeCopyToClipboard(sanitized);
      }
    };
    return;
  }

  if (navigator.clipboard._hasUrlSanitizer) return;

  const originalWriteText = navigator.clipboard.writeText?.bind(navigator.clipboard);
  if (!originalWriteText) {
    navigator.clipboard.writeText = async (text) => safeCopyToClipboard(text);
    navigator.clipboard._hasUrlSanitizer = true;
    return;
  }

  navigator.clipboard.writeText = async function (text) {
    let sanitizedText = text;
    if (typeof text === 'string') {
      const publicOrigin = getPublicSystemOrigin();
      sanitizedText = sanitizedText
        .replace(/app:\/\/localhost/gi, publicOrigin)
        .replace(/https?:\/\/localhost:\d+/gi, publicOrigin)
        .replace(/https?:\/\/127\.0\.0\.1:\d+/gi, publicOrigin)
        .replace(/https?:\/\/[^/]*apexthunder\.com/gi, publicOrigin)
        .replace(/https?:\/\/172\.20\.10\.3(:\d+)?/gi, publicOrigin)
        .replace(/https?:\/\/pharmacy-hr-system\.vercel\.app/gi, publicOrigin);
    }
    try {
      if (window.isSecureContext) {
        return await originalWriteText(sanitizedText);
      }
    } catch {}
    return safeCopyToClipboard(sanitizedText);
  };
  navigator.clipboard._hasUrlSanitizer = true;
}
