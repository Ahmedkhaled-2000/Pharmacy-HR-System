/**
 * timeEngine.js
 * محرك التوقيت الفعلي الموثق (Authoritative Real-Time Engine)
 * يضمن عدم الاعتماد على ساعة جهاز المستخدم المحلية لمنع التلاعب وتوحيد الوقت
 */

import { API_BASE_URL } from './apiClient.js';

let serverTimeOffsetMs = 0;
let isSyncedWithServer = false;
let lastSyncTimestamp = 0;
let syncPromise = null;

// مرساة التوقيت المونوتوني الفائق (Monotonic Performance Anchor)
let anchorPerfNow = typeof performance !== 'undefined' ? performance.now() : 0;
let anchorServerUtc = null;
let anchorLocalEpoch = Date.now();

// إعداد الساعة المنطقية الهجينة (Hybrid Logical Clock - HLC)
let hlcLastPhysical = 0;
let hlcCounter = 0;
const DEVICE_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID().slice(0, 8)
  : `dev_${Math.random().toString(36).slice(2, 8)}`;

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
 * مزامنة التوقيت مع الخادم وحساب فرق التوقيت الدقيق وتثبيت المرساة المونوتونية
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

      // 1. محاولة الاتصال بالخادم الرئيسي (مسار ping السريع أو health)
      const endpointsToTry = [
        `${API_BASE_URL}/ping`,
        `${API_BASE_URL}/health?_t=${Date.now()}`
      ];

      for (const endpoint of endpointsToTry) {
        try {
          const response = await fetch(endpoint, {
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
              break;
            }
          }
        } catch {
          // جرب المسار التالي
        }
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

        // تثبيت المرساة المونوتونية (Monotonic Anchor Point)
        anchorPerfNow = typeof performance !== 'undefined' ? performance.now() : 0;
        anchorServerUtc = serverUtcMs;
        anchorLocalEpoch = localNow;

        try {
          sessionStorage.setItem('hr_server_time_offset', String(serverTimeOffsetMs));
        } catch {}

        console.info(`[TimeEngine] 🌐 تم توثيق التوقيت المونوتوني مع الخادم. إزاحة: ${serverTimeOffsetMs}ms (Anchor calibrated)`);
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
 * إرجاع الوقت المونوتوني الموثق بالمللي ثانية (محمي من تغيير ساعة النظام اليدوي)
 */
export function getMonotonicServerEpoch() {
  if (anchorServerUtc && typeof performance !== 'undefined') {
    const elapsedPerfMs = performance.now() - anchorPerfNow;
    return Math.round(anchorServerUtc + elapsedPerfMs);
  }
  return Date.now() + serverTimeOffsetMs;
}

/**
 * فحص ما إذا كان هناك تلاعب أو قفزة مفاجئة في ساعة الجهاز الفيزيائية
 */
export function checkClockTampering() {
  if (!anchorServerUtc || typeof performance === 'undefined') {
    return { tampered: false, driftMs: 0 };
  }
  const expectedLocalDelta = performance.now() - anchorPerfNow;
  const actualLocalDelta = Date.now() - anchorLocalEpoch;
  const driftMs = Math.abs(actualLocalDelta - expectedLocalDelta);
  return {
    tampered: driftMs > 60000, // فارق أكثر من دقيقة يدل على تغيير يدوي لساعة الجهاز
    driftMs: Math.round(driftMs)
  };
}

/**
 * 🚀 توليد طابع زمني منطقي هجين (Hybrid Logical Clock - HLC)
 * يضمن الترتيب السببي المطلق للعمليات عبر الأجهزة الموزعة حتى في نفس المللي ثانية أو عند انقطاع النت
 */
export function generateHlcTimestamp(customEpoch = null) {
  const physicalMs = customEpoch !== null ? Number(customEpoch) : getMonotonicServerEpoch();

  if (physicalMs > hlcLastPhysical) {
    hlcLastPhysical = physicalMs;
    hlcCounter = 0;
  } else {
    // حدث في نفس المللي ثانية أو ساعة الجهاز تأخرت -> زيادة العداد المنطقي
    hlcCounter++;
  }

  const paddedCounter = String(hlcCounter).padStart(4, '0');
  const isoTime = new Date(hlcLastPhysical).toISOString();
  // صيغة الـ HLC: YYYY-MM-DDTHH:mm:ss.sssZ_COUNTER_DEVICEID
  return `${isoTime}_${paddedCounter}_${DEVICE_ID}`;
}

/**
 * معايرة الساعة المنطقية المحلية مع طابع زمني مستلم من جهاز آخر أو الخادم (Lamport Causality)
 */
export function calibrateHlcWithRemote(remoteHlcString) {
  if (!remoteHlcString || typeof remoteHlcString !== 'string') return;
  const parsed = parseHlc(remoteHlcString);
  if (!parsed) return;

  const currentLocal = getMonotonicServerEpoch();
  const maxPhysical = Math.max(currentLocal, hlcLastPhysical, parsed.physicalMs);

  if (maxPhysical === hlcLastPhysical && maxPhysical === parsed.physicalMs) {
    hlcCounter = Math.max(hlcCounter, parsed.counter) + 1;
  } else if (maxPhysical === parsed.physicalMs) {
    hlcLastPhysical = maxPhysical;
    hlcCounter = parsed.counter + 1;
  } else {
    hlcLastPhysical = maxPhysical;
    hlcCounter = 0;
  }
}

/**
 * تفكيك طابع الـ HLC لمكوناته الفيزيائية والمنطقية
 */
export function parseHlc(hlcString) {
  if (!hlcString || typeof hlcString !== 'string') return null;
  const parts = hlcString.split('_');
  if (parts.length < 3) return null;
  const iso = parts[0];
  const counter = parseInt(parts[1], 10) || 0;
  const deviceId = parts[2] || '';
  const physicalMs = new Date(iso).getTime();
  return {
    iso,
    physicalMs,
    counter,
    deviceId
  };
}

/**
 * مقارنة طابعين HLC لحسم النزاعات التلقائية والترتيب الدقيق (Deterministic Tie-breaking)
 * returns -1 if a < b, 1 if a > b, 0 if equal
 */
export function compareHlc(hlcA, hlcB) {
  if (!hlcA && !hlcB) return 0;
  if (!hlcA) return -1;
  if (!hlcB) return 1;

  const pA = parseHlc(hlcA);
  const pB = parseHlc(hlcB);

  if (!pA || !pB) return String(hlcA).localeCompare(String(hlcB));

  if (pA.physicalMs !== pB.physicalMs) {
    return pA.physicalMs < pB.physicalMs ? -1 : 1;
  }
  if (pA.counter !== pB.counter) {
    return pA.counter < pB.counter ? -1 : 1;
  }
  return pA.deviceId.localeCompare(pB.deviceId);
}

/**
 * إرجاع كائن Date الموثق الفعلي (مع تطبيق المرساة المونوتونية المقاومة للتلاعب)
 */
export function getRealDate() {
  return new Date(getMonotonicServerEpoch());
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

