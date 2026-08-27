/**
 * timeEngine.js
 * محرك التوقيت الفعلي الموثق (Authoritative Real-Time Engine)
 * يضمن عدم الاعتماد على ساعة جهاز المستخدم المحلية لمنع التلاعب وتوحيد الوقت
 */

import { API_BASE_URL } from './apiClient';

let serverTimeOffsetMs = 0;
let isSyncedWithServer = false;
let lastSyncTimestamp = 0;
let syncPromise = null;

// استرجاع آخر إزاحة محفوظة في الجلسة إن وُجدت
try {
  const savedOffset = sessionStorage.getItem('hr_server_time_offset');
  if (savedOffset !== null) {
    serverTimeOffsetMs = parseInt(savedOffset, 10) || 0;
  }
} catch {
  // Ignore
}

/**
 * مزامنة التوقيت مع الخادم وحساب فرق التوقيت الدقيق
 */
export async function syncRealTime(force = false) {
  const now = Date.now();
  if (!force && isSyncedWithServer && now - lastSyncTimestamp < 5 * 60 * 1000) {
    return serverTimeOffsetMs;
  }

  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const startTime = performance.now();
      let serverUtcMs = null;

      // 1. محاولة الاتصال بالخادم الرئيسي والحصول على هيدر Date أو timestamp
      try {
        const response = await fetch(`${API_BASE_URL}/health?_t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store'
        });
        const endTime = performance.now();
        const roundTrip = (endTime - startTime) / 2;

        const dateHeader = response.headers.get('Date') || response.headers.get('date');
        if (dateHeader) {
          const parsed = Date.parse(dateHeader);
          if (!isNaN(parsed)) {
            serverUtcMs = parsed + roundTrip;
          }
        }
      } catch (err) {
        // Fallback to secondary source
      }

      // 2. إذا لم يتوفر هيدر التاريخ من الخادم الرئيسي، استخدام خادم توقيت بديل
      if (!serverUtcMs) {
        try {
          const fallbackResp = await fetch('https://timeapi.io/api/v1/time/current/zone?timeZone=UTC', {
            cache: 'no-store'
          });
          if (fallbackResp.ok) {
            const data = await fallbackResp.json();
            if (data?.dateTime) {
              serverUtcMs = Date.parse(data.dateTime + 'Z');
            }
          }
        } catch {
          // Ignore
        }
      }

      if (serverUtcMs && !isNaN(serverUtcMs)) {
        const localNow = Date.now();
        serverTimeOffsetMs = Math.round(serverUtcMs - localNow);
        isSyncedWithServer = true;
        lastSyncTimestamp = Date.now();

        try {
          sessionStorage.setItem('hr_server_time_offset', String(serverTimeOffsetMs));
        } catch {}

        console.info(`[TimeEngine] 🌐 تم توثيق التوقيت مع الخادم بنجاح. فرق التوقيت: ${serverTimeOffsetMs}ms`);
      }
    } catch (e) {
      console.warn('[TimeEngine] فشل التحقق من توقيت الخادم، سيتم استخدام التوقيت المخزن/المحلي مؤقتاً:', e);
    } finally {
      syncPromise = null;
    }
    return serverTimeOffsetMs;
  })();

  return syncPromise;
}

// بدء المزامنة تلقائياً عند تحميل الملف
if (typeof window !== 'undefined') {
  setTimeout(() => {
    syncRealTime();
  }, 500);

  // إعادة المزامنة كل 10 دقائق وعند عودة الاتصال
  setInterval(() => syncRealTime(true), 10 * 60 * 1000);
  window.addEventListener('online', () => syncRealTime(true));
}

/**
 * إرجاع كائن Date الموثق الفعلي (مع تطبيق إزاحة الخادم)
 */
export function getRealDate() {
  return new Date(Date.now() + serverTimeOffsetMs);
}

/**
 * إرجاع تاريخ اليوم بصيغة YYYY-MM-DD الموثقة
 */
export function getRealTodayStr() {
  const d = getRealDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * إرجاع الوقت الحالي بصيغة HH:mm:ss الموثقة
 */
export function getRealNowTimeStr(includeSeconds = true) {
  const d = getRealDate();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  if (!includeSeconds) return `${h}:${m}`;
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * إرجاع الوقت بتنسيق 12 ساعة (مثال: 04:15:30 م)
 */
export function getRealFormatted12HourTime(includeSeconds = true) {
  const d = getRealDate();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 => 12
  const formattedHours = String(hours).padStart(2, '0');

  return includeSeconds
    ? `${formattedHours}:${minutes}:${seconds} ${ampm}`
    : `${formattedHours}:${minutes} ${ampm}`;
}

/**
 * التحقق مما إذا كان الوقت موثقاً من الخادم
 */
export function isServerTimeSynced() {
  return isSyncedWithServer;
}

/**
 * الحصول على قيمة الإزاحة الحالية بالمللي ثانية
 */
export function getRealTimeOffset() {
  return serverTimeOffsetMs;
}

export const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * تنسيق التاريخ والوقت العربي الكامل
 */
export function formatArabicFullDateTime(refDate = getRealDate()) {
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const dayName = ARABIC_DAYS[d.getDay()];
  const dayNum = d.getDate();
  const monthName = ARABIC_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}، ${dayNum} ${monthName} ${year}`;
}

/**
 * دالة مساعدة معيارية لإرجاع تاريخ اليوم بصيغة YYYY-MM-DD
 */
export function todayStr() {
  return getRealTodayStr();
}

/**
 * دالة مساعدة معيارية لإرجاع الوقت الحالي بصيغة HH:mm:ss
 */
export function nowTimeStr() {
  return getRealNowTimeStr();
}
