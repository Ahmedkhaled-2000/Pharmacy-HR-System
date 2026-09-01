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
  // 1. في بيئة المتصفح الحية على الخادم (Apex Thunder أو أي نطاق/IP مباشر)
  if (typeof window !== 'undefined' && window.location) {
    const { origin, protocol, hostname } = window.location;
    if (origin && !hostname.includes('localhost') && !hostname.includes('127.0.0.1') && protocol.startsWith('http')) {
      return `${origin}/api`;
    }
  }

  // 2. إذا تم تحديد الرابط في متغيرات البيئة (.env) في بيئة التطوير المحلي
  if (import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }

  // 3. الرابط الافتراضي للتطوير والتجربة
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
  const isPostOrSave = options.method === 'POST' || endpoint.includes('settings');

  // إذا كان السيرفر في وضع التبريد والحماية من الانهيار، نسمح دائماً بعمليات الحفظ
  if (Date.now() < circuitBreakerCoolingUntil && options.isBackground && !isPostOrSave) {
    throw new Error(`[CircuitBreaker] الخادم قيد إعادة التشغيل والتبريد مؤقتاً.`);
  }

  const maxRetries = options.retries !== undefined ? options.retries : (isPostOrSave ? 2 : 0);
  const baseTimeoutMs = options.timeout || (isPostOrSave ? 25000 : 10000);
  
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const cleanUrl = `${API_BASE_URL}/${endpoint.replace(/^\/+/, '')}`;
    const separator = endpoint.includes('?') ? '&' : '?';
    const antiCacheQuery = options.useETag ? '' : (options.noCache !== false ? `${separator}_t=${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : '');
    const url = options.useETag ? cleanUrl : `${cleanUrl}${antiCacheQuery}`;
    const timeoutMs = baseTimeoutMs;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);

    let authToken = '';
    try {
      authToken = localStorage.getItem('app_auth_token') || localStorage.getItem('archive_token') || '';
    } catch {}

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      ...options.headers,
    };

    if (options.useETag && activeETags.has(cleanUrl)) {
      headers['If-None-Match'] = activeETags.get(cleanUrl);
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
        activeETags.set(cleanUrl, etag);
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { /* ignore */ }
        
        // عند حدوث خطأ 500 متكرر من الخادم
        if (response.status >= 500) {
          consecutiveServerErrors++;
          if (consecutiveServerErrors >= 4) {
            circuitBreakerCoolingUntil = Date.now() + 15000;
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
        console.warn(`[ApiClient] ${endpoint} (محاولة ${attempt + 1}/${maxRetries + 1}): ${error.message}`);
      }

      if (attempt < maxRetries) {
        const backoffDelay = (attempt + 1) * 350;
        await new Promise((res) => setTimeout(res, backoffDelay));
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
    timeout: options.timeout || 15000,
    retries: options.retries !== undefined ? options.retries : 1,
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
    timeout: options.timeout || 25000,
    retries: options.retries !== undefined ? options.retries : 2,
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
  // تعطيل الـ Long-Lived Stream لتجنب استنزاف حد الاتصالات الـ 5 (5 Connections Limit) على الاستضافة المشتركة
  // يتم الاعتماد على Adaptive Version Polling فائق الخفة والسرعة (< 20ms) وبدون أي اتصالات معلقة
  return null;
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
export async function apiSystemReset(wipedState = null, key = STORAGE_KEY, ownerPassword = '') {
  return await request('system/reset', {
    method: 'POST',
    body: JSON.stringify({ key, state: wipedState, confirm: 'CONFIRM_RESET', ownerPassword }),
    timeout: 25000,
    noCache: true
  });
}

// ── 6. فحص سلامة الاتصال والمصادقة (Auth & Health Check) ──────────────────────
export async function apiHealthCheck() {
  return await request('health', { method: 'GET' });
}

export async function apiLogin(credentials) {
  return await request('auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function apiVerifySession() {
  return await request('auth/session', { method: 'GET' });
}
