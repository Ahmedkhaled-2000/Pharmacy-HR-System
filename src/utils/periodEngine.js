/**
 * periodEngine.js
 * المحرك المركزي الموحد لحساب الفترات الزمنية، دورات الرواتب، وتقفيل الشهور
 * يعالج دورات الرواتب عبر الشهور، والشهور الميلادية، والفترات المخصصة، واختلاف أطوال الشهور
 */

import { getRealDate } from './timeEngine';

export const AR_MONTHS_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * عدد الأيام في شهر وسنة محددين بدقة (معالجة السنوات الكبيسة وفبراير 28/29)
 */
export function getDaysInMonth(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * ضبط اليوم ليكون صالحاً ضمن عدد أيام الشهر الفعلي
 */
export function clampDayToMonth(year, month, targetDay) {
  const maxDays = getDaysInMonth(year, month);
  const day = parseInt(targetDay, 10) || 1;
  return Math.min(Math.max(1, day), maxDays);
}

/**
 * استخراج إعدادات دورة الرواتب من orgSettings أو التخزين المحلي
 */
export function extractPayrollSettings(orgSettings = {}) {
  const sDay = orgSettings?.payrollPayoutStartDay !== undefined
    ? parseInt(orgSettings.payrollPayoutStartDay, 10)
    : (() => {
        try {
          const v = localStorage.getItem('payroll_payout_start_day');
          return v !== null ? parseInt(v, 10) : 26;
        } catch {
          return 26;
        }
      })();

  const rawEnd = orgSettings?.payrollPayoutEndDay !== undefined
    ? parseInt(orgSettings.payrollPayoutEndDay, 10)
    : (orgSettings?.payrollPayoutDay !== undefined
        ? parseInt(orgSettings.payrollPayoutDay, 10)
        : (() => {
            try {
              const v = localStorage.getItem('payroll_payout_end_day');
              return v !== null ? parseInt(v, 10) : 25;
            } catch {
              return 25;
            }
          })());

  const startDay = isNaN(sDay) ? 26 : sDay;
  let endDay = isNaN(rawEnd) ? 25 : rawEnd;

  // إذا كانت بداية الدورة أكبر من 1 وكانت النهاية مساوية للبداية (مثلاً 21 و 21)، نجعل النهاية تلقائياً 20 (اليوم السابق) لتطابق الدورة الشهرية
  if (startDay > 1 && endDay === startDay) {
    endDay = startDay - 1;
  }

  const sTime = orgSettings?.payrollPayoutStartTime || (() => {
    try { return localStorage.getItem('payroll_payout_start_time') || '00:00'; } catch { return '00:00'; }
  })();

  const eTime = orgSettings?.payrollPayoutEndTime || (() => {
    try { return localStorage.getItem('payroll_payout_end_time') || '23:59'; } catch { return '23:59'; }
  })();

  const pType = orgSettings?.payrollPeriodType || (() => {
    try { return localStorage.getItem('payroll_period_type') || 'cycle'; } catch { return 'cycle'; }
  })();

  const customFrom = orgSettings?.payrollCustomFrom || (() => {
    try { return localStorage.getItem('payroll_custom_from') || ''; } catch { return ''; }
  })();

  const customTo = orgSettings?.payrollCustomTo || (() => {
    try { return localStorage.getItem('payroll_custom_to') || ''; } catch { return ''; }
  })();

  return {
    startDay,
    endDay,
    startTime: sTime,
    endTime: eTime,
    periodType: pType,
    customFrom,
    customTo
  };
}

/**
 * المحرك الرئيسي لحساب تاريخ بداية ونهاية الشهر المالي
 * @param {string} monthStr - بصيغة YYYY-MM
 * @param {object} orgSettings - إعدادات المؤسسة
 * @returns {object} { startDate, endDate, label, shortLabel, daysCount, month, startDay, endDay }
 */
export function getCycleDateRange(monthStr, orgSettings = {}) {
  const settings = extractPayrollSettings(orgSettings);

  // في حالة اختيار فترة مخصصة ثابتة في إعدادات النظام
  if (settings.periodType === 'custom' && settings.customFrom && settings.customTo) {
    const from = settings.customFrom <= settings.customTo ? settings.customFrom : settings.customTo;
    const to = settings.customFrom <= settings.customTo ? settings.customTo : settings.customFrom;
    const d1 = new Date(from + 'T00:00:00');
    const d2 = new Date(to + 'T00:00:00');
    const daysCount = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);

    return {
      startDate: from,
      endDate: to,
      label: `فترة مخصصة (${from} إلى ${to})`,
      shortLabel: `${from.slice(5)} ➔ ${to.slice(5)}`,
      daysCount,
      month: from.slice(0, 7),
      startDay: parseInt(from.slice(8, 10), 10),
      endDay: parseInt(to.slice(8, 10), 10),
      isCustom: true
    };
  }

  // في حالة الدورة الشهرية القياسية
  let targetMonth = monthStr;
  if (!targetMonth || typeof targetMonth !== 'string' || targetMonth.length < 7) {
    targetMonth = getActivePayrollMonth(orgSettings);
  }

  const [yStr, mStr] = targetMonth.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  const { startDay, endDay } = settings;
  let startDate = '';
  let endDate = '';

  if (startDay > endDay) {
    // الحالة الأولى: دورة عبر شهرين (مثال: من 26 في الشهر السابق إلى 25 في الشهر الحالي)
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY = y - 1;
    }

    const clampedStart = clampDayToMonth(prevY, prevM, startDay);
    const clampedEnd = clampDayToMonth(y, m, endDay);

    startDate = `${prevY}-${String(prevM).padStart(2, '0')}-${String(clampedStart).padStart(2, '0')}`;
    endDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedEnd).padStart(2, '0')}`;
  } else {
    // الحالة الثانية: دورة في نفس الشهر (مثال: من 1 إلى 30، أو من 1 إلى 31)
    const clampedStart = clampDayToMonth(y, m, startDay);
    const clampedEnd = clampDayToMonth(y, m, endDay);

    startDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedStart).padStart(2, '0')}`;
    endDate = `${y}-${String(m).padStart(2, '0')}-${String(clampedEnd).padStart(2, '0')}`;
  }

  const d1 = new Date(startDate + 'T00:00:00');
  const d2 = new Date(endDate + 'T00:00:00');
  const daysCount = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);

  const monthIdx = (m - 1 + 12) % 12;
  const monthArabic = AR_MONTHS_NAMES[monthIdx];
  const label = `دورة شهر ${monthArabic} ${y} (من ${startDate} إلى ${endDate})`;
  const shortLabel = `[${startDate.slice(5)} ➔ ${endDate.slice(5)}]`;

  return {
    startDate,
    endDate,
    label,
    shortLabel,
    daysCount,
    month: targetMonth,
    startDay,
    endDay,
    isCustom: false
  };
}

/**
 * تحديد الشهر المالي النشط تلقائياً وفقاً للوقت الفعلي وساعة إغلاق الرواتب
 * @param {object} orgSettings 
 * @param {Date} refDate 
 * @returns {string} YYYY-MM
 */
export function getActivePayrollMonth(orgSettings = {}, refDate = getRealDate()) {
  const settings = extractPayrollSettings(orgSettings);

  if (settings.periodType === 'custom' && settings.customFrom) {
    return settings.customFrom.slice(0, 7);
  }

  const now = refDate instanceof Date ? refDate : new Date(refDate);
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  const { startDay, endDay, endTime } = settings;

  if (startDay > endDay) {
    // دورة عبر شهرين (مثال: من 26 إلى 25):
    // إذا كان اليوم بعد يوم 25، أو في نفس يوم 25 بعد ساعة الإغلاق (مثال: 23:59)،
    // فإننا دخلنا في دورة الشهر القادم (M + 1)
    const isPastCutoff = day > endDay || (day === endDay && timeStr >= endTime);

    if (isPastCutoff) {
      let nextY = y;
      let nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return `${nextY}-${String(nextM).padStart(2, '0')}`;
    } else {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  } else {
    // دورة في نفس الشهر (مثال: من 1 إلى 30):
    const isPastCutoff = day > endDay || (day === endDay && timeStr >= endTime);

    if (isPastCutoff) {
      let nextY = y;
      let nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return `${nextY}-${String(nextM).padStart(2, '0')}`;
    } else {
      return `${y}-${String(m).padStart(2, '0')}`;
    }
  }
}

/**
 * فحص ما إذا كان تاريخ معين يقع داخل نطاق الفترة المحددة
 */
export function isDateInCycleRange(dateStr, range) {
  if (!dateStr || !range || !range.startDate || !range.endDate) return false;
  const cleanDate = String(dateStr).slice(0, 10);
  return cleanDate >= range.startDate && cleanDate <= range.endDate;
}

/**
 * إنشاء دالة تصفية مركزية لكافة مكونات وجداول النظام
 */
export function createDatePredicate({
  filterMode = 'month',
  selectedMonth = null,
  customFrom = '',
  customTo = '',
  orgSettings = {}
}) {
  const effectiveMonth = selectedMonth || getActivePayrollMonth(orgSettings);
  const cycleRange = getCycleDateRange(effectiveMonth, orgSettings);

  return (itemDateStr) => {
    if (!itemDateStr) return false;
    const d = String(itemDateStr).slice(0, 10);

    if (filterMode === 'all') {
      return true;
    }

    if (filterMode === 'custom' || filterMode === 'range') {
      if (customFrom && customTo) {
        const from = customFrom <= customTo ? customFrom : customTo;
        const to = customFrom <= customTo ? customTo : customFrom;
        return d >= from && d <= to;
      }
      if (customFrom && d < customFrom) return false;
      if (customTo && d > customTo) return false;
      return true;
    }

    // الوضع الشهري (دورة الشهر المالية المحددة في الإعدادات)
    return isDateInCycleRange(d, cycleRange);
  };
}

/**
 * حساب الوقت المتبقي لتقفيل الدورة المالية النشطة
 */
export function getCycleRemainingTime(orgSettings = {}, refDate = getRealDate()) {
  const settings = extractPayrollSettings(orgSettings);
  const activeMonth = getActivePayrollMonth(orgSettings, refDate);
  const range = getCycleDateRange(activeMonth, orgSettings);

  const [y, m, d] = range.endDate.split('-').map(Number);
  const [h, min] = (settings.endTime || '23:59').split(':').map(Number);

  const targetDate = new Date(y, m - 1, d, h || 23, min || 59, 59);
  const diffMs = targetDate.getTime() - refDate.getTime();

  if (diffMs <= 0) {
    return {
      isClosed: true,
      remainingText: 'تم إغلاق الدورة المالية',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0
    };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / (24 * 3600));
  const hours = Math.floor((totalSec % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return {
    isClosed: false,
    remainingText: `${days} يوم، ${hours} ساعة، ${minutes} دقيقة`,
    days,
    hours,
    minutes,
    seconds,
    targetDateStr: range.endDate,
    targetTimeStr: settings.endTime || '23:59',
    activeMonth,
    range
  };
}
