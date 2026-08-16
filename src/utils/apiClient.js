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

  // في بيئة المتصفح الحية (على الاستضافة Apex Thunder)
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    // إذا كان يعمل على الدومين المرفوع
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return `${origin}/api`;
    }
  }

  // الرابط الافتراضي للتطوير والتجربة
  return 'https://nodejs-test.apexthunder.com/api';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * دالة مساعدة لتنفيذ طلبات الـ HTTP مع معالجة الأخطاء والتنسيق
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}/${endpoint.replace(/^\/+/, '')}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try { errorJson = JSON.parse(errorText); } catch { /* ignore */ }
      throw new Error(errorJson?.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`[ApiClient] Request to ${endpoint} failed:`, error.message);
    throw error;
  }
}

// ── 1. دوال إعدادات وبيانات التطبيق الرئيسية (Settings / State) ────────────────
export async function apiFetchSettings(key = STORAGE_KEY) {
  const res = await request(`settings?key=${encodeURIComponent(key)}`, { method: 'GET' });
  return res?.value || null;
}

export async function apiSaveSettings(key = STORAGE_KEY, value) {
  return await request('settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

// ── 2. فحص الإصدار للمزامنة الخفيفة (Ultra-Fast Smart Polling) ────────────────
export async function apiFetchVersion(key = STORAGE_KEY) {
  return await request(`sync/version?key=${encodeURIComponent(key)}`, { method: 'GET' });
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

// ── 5. فحص سلامة الاتصال (Health Check) ───────────────────────────────────────
export async function apiHealthCheck() {
  return await request('health', { method: 'GET' });
}
