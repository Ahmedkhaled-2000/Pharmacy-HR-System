/**
 * apiClient.js
 * عميل الاتصال المباشر بـ MariaDB 10.11 & PHP Backend
 * يدعم المزامنة السريعة، الـ Smart Polling، وإدارة البيانات الحيوية
 */

export const STORAGE_KEY = 'pharmacy-tracker-data';
export const WORK_DAYS_PER_MONTH = 26;
export const WORK_HOURS_PER_DAY = 8;

// تحديد رابط الـ API تلقائياً مع الحماية المطلقة من أخطاء Mixed Content
const getApiBaseUrl = () => {
  // 1. أولوية الرابط المخصص المحفوظ في التخزين المحلي (سواء في تطبيق سطح المكتب أو المتصفح)
  if (typeof window !== 'undefined') {
    try {
      const customApi = localStorage.getItem('app_custom_cloud_api_url');
      if (customApi && customApi.startsWith('http')) {
        let clean = customApi.replace(/\/+$/, '');
        if (window.location?.protocol === 'https:' && clean.startsWith('http:')) {
          clean = clean.replace(/^http:/, 'https:');
        }
        return clean;
      }
    } catch {}
  }

  // 2. في بيئة المتصفح المباشرة: استخدام نفس المنشأ (Same-Origin) دائماً إذا لم نكن على localhost/electron
  if (typeof window !== 'undefined' && window.location) {
    const { origin, hostname, protocol } = window.location;
    const isLocal = !hostname || hostname === 'localhost' || hostname === '127.0.0.1';
    const isApp = protocol === 'app:' || protocol === 'file:' || protocol === 'capacitor:';
    if (!isLocal && !isApp && origin && origin.startsWith('http')) {
      return `${origin}/api`;
    }
  }

  // 3. إذا تم تحديد الرابط في متغيرات البيئة (.env)
  if (import.meta.env?.VITE_API_URL && import.meta.env.VITE_API_URL.startsWith('http')) {
    let envUrl = import.meta.env.VITE_API_URL.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && envUrl.startsWith('http:')) {
      envUrl = envUrl.replace(/^http:/, 'https:');
    }
    return envUrl;
  }

  // 4. الرابط السحابي المركزي الموثوق والمشفر عالمياً (HTTPS)
  return 'https://63-183-147-199.sslip.io/api';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * دالة مساعدة متقدمة لتنفيذ طلبات الـ HTTP مع مهلة زمنية ذكية وحاجز حماية (Circuit Breaker)
 * لمنع انهيار المتصفح أو تسريب الذاكرة عند حدوث أخطاء سحابية 500
 */
const activeETags = new Map();
const inFlightRequests = new Map();

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

export async function getValidAuthToken() {
  if (typeof window === 'undefined') return '';
  try {
    let token = localStorage.getItem('app_auth_token') || localStorage.getItem('archive_token') || '';
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[0]));
          if (payload && payload.exp && payload.exp * 1000 > Date.now() + 60000) {
            return token;
          }
        }
      } catch {}
    }

    // محاولة تجديد أو إنشاء توكن صامت بناءً على بيانات جلسة المالك أو الأدمن أو الموظف أو الفرع
    const role = localStorage.getItem('app_auth_role') || (localStorage.getItem('app_is_admin') === 'true' ? 'admin' : 'owner');
    let username = role;
    let password = '123';

    if (role === 'owner') {
      password = localStorage.getItem('app_owner_password_snapshot') || 'owner123';
      username = 'owner';
    } else if (role === 'admin') {
      password = localStorage.getItem('app_admin_password_snapshot') || '123';
      username = 'admin';
    } else if (role === 'branch') {
      const bObj = (() => { try { return JSON.parse(localStorage.getItem('app_current_branch') || '{}'); } catch { return {}; } })();
      username = localStorage.getItem('app_branch_id_snapshot') || bObj.id || bObj.branchCode || 'branch';
      password = localStorage.getItem('app_branch_password_snapshot') || bObj.password || bObj.managerPin || '1234';
    } else if (role === 'employee' || role === 'kiosk') {
      const eObj = (() => { try { return JSON.parse(localStorage.getItem('app_current_emp_user') || '{}'); } catch { return {}; } })();
      username = localStorage.getItem('app_emp_code_snapshot') || eObj.code || eObj.id || '';
      password = localStorage.getItem('app_emp_password_snapshot') || eObj.password || '123';
    }

    if (username) {
      const cleanUrl = `${API_BASE_URL}/auth/login`;
      const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.token) {
          localStorage.setItem('app_auth_token', data.token);
          return data.token;
        }
      }
    }
  } catch (e) {
    console.warn('[ApiClient] Silent auth token renewal error:', e);
  }
  return localStorage.getItem('app_auth_token') || '';
}

async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const isMutation = method === 'POST' || method === 'PUT' || method === 'DELETE';

  if (isMutation) {
    resetBackendCircuitBreaker();
  }

  // إذا كان السيرفر في وضع التبريد والحماية من الانهيار، نسمح دائماً بعمليات الحفظ
  if (Date.now() < circuitBreakerCoolingUntil && options.isBackground && !isMutation) {
    throw new Error(`[CircuitBreaker] الخادم قيد إعادة التشغيل والتبريد مؤقتاً.`);
  }

  // منع تكرار الطلبات المتطابقة المتزامنة (In-Flight Request De-duplication)
  const dedupeKey = !isMutation ? `${method}:${endpoint}:${Boolean(options.useETag)}` : null;
  if (dedupeKey && inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey);
  }

  const executeRequest = async () => {
    const maxRetries = options.retries !== undefined ? options.retries : (isMutation ? 2 : 1);
    const baseTimeoutMs = options.timeout || (isMutation ? 45000 : 25000);
    
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
      if (!authToken && isMutation && endpoint !== 'auth/login') {
        authToken = await getValidAuthToken();
      }
    } catch {}

    const appRole = (typeof localStorage !== 'undefined' && localStorage.getItem('app_auth_role')) || 'owner';
    let appPass = '123';
    let appEmpCode = '';
    let appBranchId = '';

    if (typeof localStorage !== 'undefined') {
      if (appRole === 'owner') {
        appPass = localStorage.getItem('app_owner_password_snapshot') || 'owner123';
      } else if (appRole === 'admin') {
        appPass = localStorage.getItem('app_admin_password_snapshot') || '123';
      } else if (appRole === 'branch') {
        const bObj = (() => { try { return JSON.parse(localStorage.getItem('app_current_branch') || '{}'); } catch { return {}; } })();
        appBranchId = localStorage.getItem('app_branch_id_snapshot') || bObj.id || '';
        appPass = localStorage.getItem('app_branch_password_snapshot') || bObj.password || bObj.managerPin || '1234';
      } else if (appRole === 'employee' || appRole === 'kiosk') {
        const eObj = (() => { try { return JSON.parse(localStorage.getItem('app_current_emp_user') || '{}'); } catch { return {}; } })();
        appEmpCode = localStorage.getItem('app_emp_code_snapshot') || eObj.code || eObj.id || '';
        appPass = localStorage.getItem('app_emp_password_snapshot') || eObj.password || '123';
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      'X-App-Role': appRole,
      'X-App-Password': appPass,
      ...(appEmpCode ? { 'X-App-Emp-Code': appEmpCode } : {}),
      ...(appBranchId ? { 'X-App-Branch-Id': appBranchId } : {}),
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

      // إذا كان الخطأ 401 في عملية كتابة، نحاول تجديد التوكن وإعادة المحاولة لمرة واحدة
      if (response.status === 401 && isMutation && attempt === 0 && endpoint !== 'auth/login') {
        try {
          localStorage.removeItem('app_auth_token');
          await getValidAuthToken();
        } catch {}
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch { /* ignore */ }
        
        // عند حدوط خطأ 500 متكرر من الخادم
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
  };

  const reqPromise = executeRequest();
  if (dedupeKey) {
    inFlightRequests.set(dedupeKey, reqPromise);
    reqPromise.finally(() => {
      inFlightRequests.delete(dedupeKey);
    });
  }

  return reqPromise;
}

// ── 0. مصادقة وتسجيل الدخول السحابي ─────────────────────────────────────────
export async function apiLogin(usernameOrCreds, password = '', role = 'auto') {
  let targetUser = '';
  let targetPass = '';
  let targetRole = role || 'auto';

  if (typeof usernameOrCreds === 'object' && usernameOrCreds !== null) {
    targetUser = String(usernameOrCreds.username || '').trim();
    targetPass = String(usernameOrCreds.password || '').trim();
    targetRole = usernameOrCreds.role || role || 'auto';
  } else {
    targetUser = String(usernameOrCreds || '').trim();
    targetPass = String(password || '').trim();
    targetRole = role || 'auto';
  }

  let rolesToTry = [targetRole];
  if (targetRole === 'auto') {
    const lower = targetUser.toLowerCase();
    if (lower === 'admin') {
      rolesToTry = ['admin', 'owner'];
    } else if (lower === 'owner') {
      rolesToTry = ['owner', 'admin'];
    } else {
      // بالنسبة لتطبيق بوابة الموظف، الموظفون هم الأغلبية الساحقة
      rolesToTry = ['employee', 'branch', 'admin', 'owner'];
    }
  }

  const cleanUrl = `${API_BASE_URL}/auth/login`;
  let lastResponse = null;

  for (const currentRole of rolesToTry) {
    try {
      const res = await fetch(cleanUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          username: targetUser,
          password: targetPass,
          role: currentRole
        }),
        cache: 'no-store'
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        if (!data.role) data.role = currentRole;
        if (data.token) {
          try {
            localStorage.setItem('app_auth_token', data.token);
          } catch {}
        }
        return data;
      }
      if (res.status === 403 && data?.is_suspended) {
        return data;
      }
      lastResponse = data;
    } catch (err) {
      console.warn('[ApiClient] apiLogin network error:', err);
      return {
        success: false,
        networkError: true,
        error: 'تعذر الاتصال بخادم السحابة، يرجى التأكد من اتصال الهاتف بالإنترنت.'
      };
    }
  }

  return lastResponse || {
    success: false,
    error: 'اسم المستخدم أو كلمة المرور غير صحيحة'
  };
}

// ── 0.1 تعديل وتعيين بيانات دخول المالك ذرّياً مع طرد كافة الأجهزة الأخرى ──────
export async function apiUpdateOwnerCredentials({
  currentPassword = '',
  newUsername = 'owner',
  newPassword = '',
  clientId = '',
  logoutAllDevices = true
} = {}) {
  resetBackendCircuitBreaker();
  const res = await request('auth/owner/update-credentials', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword,
      newUsername,
      newPassword,
      clientId,
      logoutAllDevices
    }),
    timeout: 30000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
  if (res?.token) {
    try {
      localStorage.setItem('app_auth_token', res.token);
    } catch {}
  }
  return res;
}

// ── 0.2 تسجيل خروج المالك الفوري من كافة الأجهزة ────────────────────────────
export async function apiTerminateOwnerSessions({
  currentPassword = '',
  exceptCurrentDevice = false,
  clientId = '',
  terminateAdmin = false
} = {}) {
  resetBackendCircuitBreaker();
  const res = await request('auth/owner/terminate-all-sessions', {
    method: 'POST',
    body: JSON.stringify({
      currentPassword,
      exceptCurrentDevice,
      clientId,
      terminateAdmin
    }),
    timeout: 30000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
  if (res?.token) {
    try {
      localStorage.setItem('app_auth_token', res.token);
    } catch {}
  }
  return res;
}

// ── 1. دوال إعدادات وبيانات التطبيق الرئيسية (Settings / State) ────────────────
export async function apiFetchSettings(key = STORAGE_KEY, options = {}) {
  const res = await request(`settings?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    timeout: options.timeout || 35000,
    retries: options.retries !== undefined ? options.retries : 1,
    useETag: options.useETag !== undefined ? options.useETag : true,
    noCache: options.noCache !== undefined ? options.noCache : false,
    isBackground: options.isBackground !== undefined ? options.isBackground : true
  });
  if (res?.notModified) return { notModified: true };
  let val = res?.value || null;
  if (val && typeof val === 'object') {
    try {
      const sStr = JSON.stringify(val);
      if (sStr.includes('http://63.183.147.199/api/attachments') || sStr.includes('http://63-183-147-199.sslip.io/api/attachments')) {
        val = JSON.parse(sStr.replace(/https?:\/\/(?:63\.183\.147\.199|63-183-147-199\.sslip\.io)\/api\/attachments/g, '/api/attachments'));
      }
    } catch {}
  }
  return val;
}

export async function apiSaveSettings(key = STORAGE_KEY, value, options = {}) {
  resetBackendCircuitBreaker();
  return await request('settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
    timeout: options.timeout || 60000,
    retries: options.retries !== undefined ? options.retries : 2,
    noCache: true,
    isBackground: options.isBackground || false
  });
}

// ── حفظ جزء محدد فقط من البيانات (Slice Saving) بحجم خفيف جداً (< 20KB) وسرعة فائقة ──
export async function apiSaveSettingsSlice(sliceKey, sliceValue, options = {}) {
  resetBackendCircuitBreaker();
  return await request('settings/slice', {
    method: 'POST',
    body: JSON.stringify({ key: STORAGE_KEY, sliceKey, sliceValue }),
    timeout: options.timeout || 20000,
    retries: options.retries !== undefined ? options.retries : 2,
    noCache: true,
    isBackground: options.isBackground || false
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 🚀 apiRecordPunch - نقطة الاتصال الذرية الفائقة الخفة للبصمات
// < 1KB طلب - < 20ms استجابة - 3 إعادة محاولة تلقائية مع تأخر تصاعدي
// هذه هي الطريقة الصحيحة الوحيدة لتسجيل الحضور والانصراف من الكشك!
// ══════════════════════════════════════════════════════════════════════════════
export async function apiRecordPunch(punchData = {}, options = {}) {
  resetBackendCircuitBreaker();
  const {
    employeeId,
    branchId,
    actionType,      // 'check_in' | 'check_out'
    time,            // 'HH:MM'
    date,            // 'YYYY-MM-DD'
    shiftId,
    shiftData,       // كائن بيانات الوردية في activeShifts
    shiftRecord,     // سجل الوردية في shifts[]
    requestId        // معرف طلب فريد لمنع الازدواجية
  } = punchData;

  const body = {
    employeeId,
    branchId: branchId || '',
    actionType: actionType || 'check_in',
    time: time || new Date().toTimeString().slice(0, 5),
    date: date || new Date().toISOString().slice(0, 10),
    shiftId,
    shiftData,
    shiftRecord,
    requestId: requestId || `punch_${employeeId}_${Date.now()}`
  };

  return await request('punches/record', {
    method: 'POST',
    body: JSON.stringify(body),
    timeout: options.timeout || 15000,
    retries: options.retries !== undefined ? options.retries : 3, // 3 إعادات تلقائية لضمان وصول البصمة
    noCache: true,
    isBackground: false // البصمة ليست خلفية - لها أولوية عالية
  });
}
// ══════════════════════════════════════════════════════════════════════════════



// ── 1.1 الإرسال الذري الخفيف للطلبات (< 2KB) لضمان الوصول الفوري دون إرسال كامل قاعدة البيانات ──
export async function apiSubmitRequestAtomic(requestObj, notificationObj = null, key = STORAGE_KEY) {
  resetBackendCircuitBreaker();
  return await request('requests/submit', {
    method: 'POST',
    body: JSON.stringify({ key, request: requestObj, notification: notificationObj }),
    timeout: 25000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
}

// ── 1.1.1 الإرسال الذري لطلبات التعيين والتوظيف العامة من بوابة الوظائف ──
export async function apiSubmitRecruitmentApplication(applicationObj, notificationObj = null, key = STORAGE_KEY) {
  resetBackendCircuitBreaker();
  return await request('recruitment/apply', {
    method: 'POST',
    body: JSON.stringify({ key, application: applicationObj, notification: notificationObj }),
    timeout: 25000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
}

// ── 1.2 الحذف النهائي البات للكيانات (موظف / طلب) من قاعدة البيانات السحابية ──
export async function apiHardDeleteEntity(type, id, key = STORAGE_KEY) {
  resetBackendCircuitBreaker();
  return await request('entity/delete', {
    method: 'POST',
    body: JSON.stringify({ key, type, id }),
    timeout: 20000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
}

// ── 1.2.1 مسح وتطهير سجل الطلبات بالكامل من السيرفر وقاعدة البيانات ──
export async function apiPurgeAllRequests(key = STORAGE_KEY, preservedPending = []) {
  resetBackendCircuitBreaker();
  return await request('requests/purge-all', {
    method: 'POST',
    body: JSON.stringify({ key, preservedPending }),
    timeout: 30000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
}

// ── 1.3 المزامنة التزايدية الذكية للطلبات (Incremental Delta Sync & Batch Push) ──
export async function apiPushSyncBatch(operationsBatch) {
  resetBackendCircuitBreaker();
  return await request('sync/push', {
    method: 'POST',
    body: JSON.stringify({ operations: operationsBatch }),
    timeout: 25000,
    retries: 2,
    noCache: true,
    isBackground: false
  });
}

export async function apiFetchDeltaSync(sinceSequence = 0, branchId = null) {
  const params = new URLSearchParams();
  if (sinceSequence) params.append('since_sequence', String(sinceSequence));
  if (branchId) params.append('branch_id', String(branchId));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return await request(`sync/delta${qs}`, {
    method: 'GET',
    timeout: 25000,
    retries: 2,
    noCache: true,
    isBackground: true
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

export async function apiDeleteFace(employeeId, type = 'all') {
  const query = type && type !== 'all'
    ? `faces?employee_id=${encodeURIComponent(employeeId)}&type=${encodeURIComponent(type)}`
    : `faces?employee_id=${encodeURIComponent(employeeId)}`;
  return await request(query, {
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


export async function apiVerifySession() {
  return await request('auth/session', { method: 'GET' });
}
