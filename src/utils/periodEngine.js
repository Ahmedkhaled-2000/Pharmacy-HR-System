/**
 * periodEngine.js
 * المحرك المركزي الموحد لحساب الفترات الزمنية، دورات الرواتب، وتقفيل الشهور
 * يعالج دورات الرواتب عبر الشهور، والشهور الميلادية، والفترات المخصصة، واختلاف أطوال الشهور
 */

import { getRealDate, getRealTodayStr } from './timeEngine.js';
import { getEmployeeDaySchedule } from './rosterEngine.js';
import { getEmployeeCurrentApprovedLeave } from './formatters.js';

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
          return v !== null ? parseInt(v, 10) : 21;
        } catch {
          return 21;
        }
      })();

  const rawEnd = orgSettings?.payrollPayoutEndDay !== undefined
    ? parseInt(orgSettings.payrollPayoutEndDay, 10)
    : (orgSettings?.payrollPayoutDay !== undefined
        ? parseInt(orgSettings.payrollPayoutDay, 10)
        : (() => {
            try {
              const v = localStorage.getItem('payroll_payout_end_day');
              return v !== null ? parseInt(v, 10) : 20;
            } catch {
              return 20;
            }
          })());

  const startDay = isNaN(sDay) ? 21 : sDay;
  let endDay = isNaN(rawEnd) ? 20 : rawEnd;

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

  // 🛡️ صمام حماية الدورة الشهرية: إذا كانت البداية بعد اليوم الأول (مثال: 21 أو 26)، فالدورة دائماً تعبر شهرين
  // (من الشهر السابق إلى الشهر الحالي) لمنع أي دورات شاذة من 5 أيام داخل نفس الشهر.
  const isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);

  if (isCrossMonth) {
    // الحالة الأولى: دورة عبر شهرين (مثال: من 26 في الشهر السابق إلى 25 في الشهر الحالي، أو من 21 إلى 20)
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
    // الحالة الثانية: دورة في نفس الشهر (حصراً عندما تبدأ من اليوم الأول 1 إلى 30 أو 31)
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
  // 🛡️ ساعة الإغلاق الافتراضية: نهاية اليوم 23:59 لمنع الانتقال المبكر في منتصف ليل اليوم الأخير
  const effectiveEndTime = (!endTime || endTime === '00:00' || endTime === '0:00') ? '23:59' : endTime;
  const isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);

  if (isCrossMonth) {
    // دورة عبر شهرين (مثال: من 21 إلى 20، أو من 26 إلى 25):
    // إذا كان اليوم بعد يوم الإغلاق، أو في نفس يوم الإغلاق بعد ساعة الإغلاق (مثال: 23:59)،
    // فإننا دخلنا في دورة الشهر القادم (M + 1)
    const isPastCutoff = day > endDay || (day === endDay && timeStr >= effectiveEndTime);

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
    const isPastCutoff = day > endDay || (day === endDay && timeStr >= effectiveEndTime);

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

/**
 * تحديد الشهر المالي الذي ينتمي إليه تاريخ معين (YYYY-MM)
 * @param {string} dateStr - بصيغة YYYY-MM-DD
 * @param {object} orgSettings - إعدادات المؤسسة
 * @returns {string} YYYY-MM
 */
export function getPayrollMonthForDate(dateStr, orgSettings = {}) {
  if (!dateStr) return getActivePayrollMonth(orgSettings);
  const clean = String(dateStr).slice(0, 10);
  const [yStr, mStr, dStr] = clean.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return getActivePayrollMonth(orgSettings);

  const settings = extractPayrollSettings(orgSettings);
  if (settings.periodType === 'custom' && settings.customFrom && settings.customTo) {
    if (clean >= settings.customFrom && clean <= settings.customTo) {
      return settings.customFrom.slice(0, 7);
    }
  }

  const { startDay, endDay } = settings;
  if (startDay > endDay) {
    // دورة عبر شهرين (مثلاً: من 26 في الشهر السابق إلى 25 في الشهر الحالي)
    if (d >= startDay) {
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
    // دورة في نفس الشهر (مثلاً: من 1 إلى 30)
    return `${y}-${String(m).padStart(2, '0')}`;
  }
}

/**
 * فحص ما إذا كانت دورة شهر معين مجمدة رسمياً
 * @param {string} monthStr - بصيغة YYYY-MM
 * @param {object} orgSettings - إعدادات المؤسسة
 * @returns {boolean}
 */
export function isPayrollMonthFrozen(monthStr, orgSettings = {}) {
  if (!monthStr) return false;
  return Boolean(
    orgSettings?.payrollPeriodFrozen?.[monthStr]?.isFrozen ||
    orgSettings?.isPeriodFrozen
  );
}

/**
 * فحص ما إذا كان تاريخ معين يقع داخل دورة رواتب مجمدة رسمياً
 * يمنع إرسال طلبات الإجازات والاستئذانات والسلف لأي تاريخ يقع في فترة مجمدة
 * @param {string} dateStr - بصيغة YYYY-MM-DD
 * @param {object} orgSettings - إعدادات المؤسسة
 * @returns {object} { isFrozen: boolean, month: string, reason: string }
 */
export function isPayrollPeriodFrozenForDate(dateStr, orgSettings = {}) {
  if (!dateStr) return { isFrozen: false, month: '', reason: '' };
  const targetMonth = getPayrollMonthForDate(dateStr, orgSettings);
  const frozen = isPayrollMonthFrozen(targetMonth, orgSettings);
  return {
    isFrozen: frozen,
    month: targetMonth,
    reason: frozen ? `دورة رواتب شهر (${targetMonth}) مغلقة ومجمدة رسمياً من الإدارة العليا.` : ''
  };
}

/**
 * التحقق من أن التواريخ المحددة تقع جميعها ضمن دورة الشهر الحالية السارية
 * يمنع تقديم أي طلبات خارج نطاق دورة الرواتب والتشغيل الحالية
 * @param {string|string[]|object} datesInput
 * @param {object} orgSettings
 * @param {Date} [refDate]
 * @returns {object} { isValid: boolean, activeMonth: string, cycleRange: object, invalidDate?: string, errorMsg?: string }
 */
export function validateDatesInActiveCycle(datesInput, orgSettings = {}, refDate = getRealDate()) {
  const activeMonth = getActivePayrollMonth(orgSettings, refDate);
  const cycleRange = getCycleDateRange(activeMonth, orgSettings);

  let dateList = [];
  if (Array.isArray(datesInput)) {
    dateList = datesInput.filter(Boolean);
  } else if (typeof datesInput === 'string' && datesInput.trim()) {
    dateList = [datesInput.trim()];
  } else if (datesInput && typeof datesInput === 'object') {
    // استخراج كافة حقول التواريخ المحتملة من كائن الطلب
    const candidates = [
      datesInput.requesterDate,
      datesInput.targetDate,
      datesInput.swapDate,
      datesInput.targetSwapDate,
      datesInput.startDate,
      datesInput.endDate,
      datesInput.date,
      datesInput.shiftDate,
      datesInput.replacementRestDate,
      datesInput.fromDate,
      datesInput.toDate
    ];

    if (Array.isArray(datesInput.dates)) {
      candidates.push(...datesInput.dates);
    }
    if (datesInput.schedule && typeof datesInput.schedule === 'object') {
      Object.keys(datesInput.schedule).forEach((k) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
          candidates.push(k);
        }
      });
    }

    // إذا تم تحديد شهر الدورة صراحة في الطلب (مثل طلب تعديل الجدول الشهري)
    if (datesInput.month && typeof datesInput.month === 'string' && /^\d{4}-\d{2}$/.test(datesInput.month)) {
      if (datesInput.month !== activeMonth) {
        return {
          isValid: false,
          activeMonth,
          cycleRange,
          invalidDate: datesInput.month,
          errorMsg: `⚠️ لا يمكن إرسال الطلب: شهر الطلب (${datesInput.month}) لا يطابق دورة الشهر الحالية السارية (${activeMonth}).`
        };
      }
    }

    dateList = candidates.filter(Boolean);
  }

  // تصفية السلاسل النصية الصالحة كتواريخ بصيغة YYYY-MM-DD
  const validDateStrings = dateList
    .map((d) => String(d).slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  for (const cleanDate of validDateStrings) {
    if (cleanDate < cycleRange.startDate || cleanDate > cycleRange.endDate) {
      return {
        isValid: false,
        activeMonth,
        cycleRange,
        invalidDate: cleanDate,
        errorMsg: `⚠️ لا يمكن إرسال الطلب: التاريخ المحدد (${cleanDate}) يقع خارج نطاق دورة الشهر السارية (${cycleRange.startDate} إلى ${cycleRange.endDate}). يُسمح فقط بتقديم الطلبات داخل نطاق دورة الشهر الحالية.`
      };
    }
  }

  return {
    isValid: true,
    activeMonth,
    cycleRange
  };
}

/**
 * فحص ما إذا كان الفرع منتهي الخدمة ومقيداً بدورة الشهر الحالية للمراجعة
 * @param {object} branchDetail
 * @returns {boolean}
 */
export function isBranchTerminatedInCycle(branchDetail) {
  if (!branchDetail || typeof branchDetail !== 'object') return false;
  return branchDetail.status === 'cycle_terminated' || Boolean(branchDetail.isTerminatedInCycle);
}

/**
 * فحص وترحيل الفروع التي تم إنهاء خدمتها وانقضت دورتها الشهرية تلقائياً وبدون تدخل بشري
 * عند انتقال النظام لدورة شهرية جديدة (activeCycleMonth > terminatedCycleMonth)،
 * يتم نقل الفرع نهائياً من branchesDetails إلى archivedBranchesDetails.
 *
 * @param {Array} employees
 * @param {object} orgSettings
 * @param {string} [currentMonth]
 * @returns {{ updatedEmployees: Array, hasChanges: boolean }}
 */
export function reconcileCycleTerminatedBranches(employees = [], orgSettings = {}, currentMonth = null) {
  const activeCycleMonth = currentMonth || getActivePayrollMonth(orgSettings);
  const todayStr = getRealDate().toISOString().slice(0, 10);
  let hasChanges = false;

  const updatedEmployees = (employees || []).map((emp) => {
    if (!emp || !Array.isArray(emp.branchesDetails) || emp.branchesDetails.length === 0) {
      return emp;
    }

    const expiredBranches = [];
    const remainingBranches = [];

    emp.branchesDetails.forEach((bd) => {
      const isTerminated = isBranchTerminatedInCycle(bd);
      if (isTerminated) {
        const termMonth = bd.terminatedCycleMonth;
        const termDate = bd.terminationDate || bd.terminatedAt?.slice(0, 10);
        let isExpired = false;

        // 1. إذا كان شهر دورة الإنهاء أقل من شهر الدورة الحالية
        if (termMonth && activeCycleMonth > termMonth) {
          isExpired = true;
        }

        // 2. إذا تجاوز تاريخ اليوم تاريخ نهاية دورة الفرع المحددة
        if (bd.cycleEndDate && todayStr > bd.cycleEndDate) {
          isExpired = true;
        }

        // 3. التحقق الحاسم من دورة تاريخ الإنهاء الفعلي
        if (termDate) {
          const actualTermCycle = getActivePayrollMonth(orgSettings, new Date(termDate + 'T12:00:00'));
          const actualCycleRange = getCycleDateRange(actualTermCycle, orgSettings);
          if (activeCycleMonth > actualTermCycle || todayStr > actualCycleRange.endDate) {
            isExpired = true;
            bd.actualTermCycle = actualTermCycle;
            bd.actualCycleEndDate = actualCycleRange.endDate;
          }
        }

        if (isExpired) {
          expiredBranches.push(bd);
          hasChanges = true;
          return;
        }
      }
      remainingBranches.push(bd);
    });

    if (expiredBranches.length === 0) {
      return emp;
    }

    // تحديث أرشيف الفروع المنتهية بحفظ السجلات الكاملة
    const existingArchived = Array.isArray(emp.archivedBranchesDetails) ? emp.archivedBranchesDetails : [];
    const newArchived = [...existingArchived];

    expiredBranches.forEach((eb) => {
      const termCycleMonth = eb.actualTermCycle || eb.terminatedCycleMonth;
      const cycleEndDate = eb.actualCycleEndDate || eb.cycleEndDate;

      const existingIndex = newArchived.findIndex(
        (a) => String(a.branchId) === String(eb.branchId)
      );

      if (existingIndex === -1) {
        newArchived.push({
          branchId: eb.branchId,
          branchName: eb.branchName || `فرع ${eb.branchId}`,
          terminationDate: eb.terminationDate,
          terminationReason: eb.terminationReason || 'إنهاء خدمة من الفرع',
          finalSettlement: eb.finalSettlement || null,
          terminatedCycleMonth: termCycleMonth,
          cycleEndDate: cycleEndDate,
          archivedAt: new Date().toISOString()
        });
      } else {
        newArchived[existingIndex] = {
          ...newArchived[existingIndex],
          terminationDate: eb.terminationDate || newArchived[existingIndex].terminationDate,
          terminationReason: eb.terminationReason || newArchived[existingIndex].terminationReason,
          finalSettlement: eb.finalSettlement || newArchived[existingIndex].finalSettlement,
          terminatedCycleMonth: termCycleMonth || newArchived[existingIndex].terminatedCycleMonth,
          cycleEndDate: cycleEndDate || newArchived[existingIndex].cycleEndDate
        };
      }
    });

    // تعيين فرع أساسي نشط إن كان الفرع الأساسي الحالي ضمن الفروع المنتهية
    const activeBranches = remainingBranches.filter((b) => !isBranchTerminatedInCycle(b));
    const newPrimaryBranchId = activeBranches[0]?.branchId || remainingBranches[0]?.branchId || emp.branchId || 'main';
    const newPrimarySalary = activeBranches[0]?.salary || remainingBranches[0]?.salary || emp.salary;

    return {
      ...emp,
      branchId: newPrimaryBranchId,
      salary: newPrimarySalary,
      branchesDetails: remainingBranches,
      archivedBranchesDetails: newArchived,
      updatedAt: new Date().toISOString()
    };
  });

  return { updatedEmployees, hasChanges };
}

/**
 * 🌟 حساب تقدم الدورة الشهرية المالية (نسبة الأيام المنقضية، المتبقية، والإجمالي)
 * @param {string} targetMonth - بصيغة YYYY-MM
 * @param {object} orgSettings 
 * @param {Date} refDate 
 * @returns {object}
 */
export function getCycleProgress(targetMonth = null, orgSettings = {}, refDate = getRealDate()) {
  const effectiveMonth = targetMonth || getActivePayrollMonth(orgSettings, refDate);
  const cycleRange = getCycleDateRange(effectiveMonth, orgSettings);
  const todayStr = getRealTodayStr ? getRealTodayStr() : (refDate instanceof Date ? refDate : new Date(refDate)).toISOString().slice(0, 10);

  const start = cycleRange.startDate;
  const end = cycleRange.endDate;
  const totalDays = Math.max(1, cycleRange.daysCount || 30);

  let elapsedDays = 0;
  let remainingDays = 0;

  if (todayStr < start) {
    // لم تبدأ الدورة بعد
    elapsedDays = 0;
    remainingDays = totalDays;
  } else if (todayStr > end) {
    // انتهت الدورة بالكامل
    elapsedDays = totalDays;
    remainingDays = 0;
  } else {
    // داخل الدورة الحالية
    const dStart = new Date(start + 'T00:00:00');
    const dToday = new Date(todayStr + 'T00:00:00');
    elapsedDays = Math.max(1, Math.round((dToday - dStart) / (1000 * 60 * 60 * 24)) + 1);
    remainingDays = Math.max(0, totalDays - elapsedDays);
  }

  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  return {
    month: effectiveMonth,
    startDate: start,
    endDate: end,
    todayStr,
    totalDays,
    elapsedDays,
    remainingDays,
    progressPercent,
    isCurrentMonth: todayStr >= start && todayStr <= end,
    cycleRange
  };
}

/**
 * 🌟 المحرك المركزي الموحد للدورة الشهرية وسجل الحضور والانصراف (Central Cycle Attendance Engine)
 * المسؤول الحصري والمعتمد عن احتساب وتوليد ظهور أيام الدورة الشهرية في سجل البصمات
 * 
 * القواعد الصارمة والذكية:
 * 1. حصر العرض الفعلي فقط على الأيام التي تم الحضور فيها (ورديات فعلية وحية) وأيام الراحة المجدولة والإجازات المعتمدة.
 * 2. استبعاد الأيام المستقبلية (dateStr > todayStr) من جدول البصمات الفعلي، ومنع اعتبارها بصمات أو ورديات وهمية.
 * 3. ترتيب السجلات بالتسلسل الزمني المتصل (sortOrder: 'asc' تصاعدياً من بداية الدورة حتى اليوم)، مع إمكانية التبديل إلى التنازلي.
 * 4. دعم فوري للبصمة الحية النشطة للموظف لليوم الحالي (isLiveActive / قيد العمل الآن).
 * 5. توفير إحصائيات دقيقة وشاملة للدورة (أيام منقضية، أيام متبقية، نسبة الإنجاز، الورديات، الراحات، الغيابات السابقة).
 *
 * @param {object} employee - كائن الموظف
 * @param {Array} shifts - مصفوفة ورديات الموظف
 * @param {object} state - حالة النظام العامة
 * @param {object} options - خيارات التصفية والفرز
 * @returns {Array} مصفوفة السجلات الزمنية مع كائن إحصائيات وملخص متصل
 */
export function buildCycleAttendanceTimeline(employee, shifts = [], state = {}, options = {}) {
  if (!employee) return [];

  const {
    selectedMonth = null,
    monthPicker = null,
    filterMode = 'month',
    customFrom = '',
    customTo = '',
    cycleRange = null,
    sortOrder = 'asc', // 'asc' = بالتسلسل الزمني من بداية الدورة حتى اليوم (الافتراضي) | 'desc' = من الأحدث إلى الأقدم
    includeFutureScheduled = false, // استبعاد الأيام المستقبلية من السجل الفعلي افتراضياً
    includePastAbsences = false, // استبعاد غياب الأيام السابقة افتراضياً (أو إظهاره عند طلبه)
    includeTodayPending = false,
    activePeriodFilter: optActivePeriodFilter = null,
    filterFn = null
  } = options;

  const orgSettings = state?.orgSettings || {};
  const todayStr = getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
  const targetMonth = selectedMonth || monthPicker || getActivePayrollMonth(orgSettings);

  // 1. تحديد نطاق الدورة وتواريخها بدقة
  let startDate = '';
  let endDate = '';
  let effectiveCycleRange = null;

  const isCustomRange = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  if (cycleRange?.startDate && cycleRange?.endDate) {
    startDate = cycleRange.startDate;
    endDate = cycleRange.endDate;
    effectiveCycleRange = cycleRange;
  } else if (isCustomRange) {
    startDate = customFrom <= customTo ? customFrom : customTo;
    endDate = customFrom <= customTo ? customTo : customFrom;
    const d1 = new Date(startDate + 'T00:00:00');
    const d2 = new Date(endDate + 'T00:00:00');
    effectiveCycleRange = {
      startDate,
      endDate,
      daysCount: Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1),
      label: `فترة مخصصة (${startDate} إلى ${endDate})`,
      shortLabel: `${startDate.slice(5)} ➔ ${endDate.slice(5)}`,
      month: targetMonth,
      isCustom: true
    };
  } else {
    try {
      effectiveCycleRange = getCycleDateRange(targetMonth, orgSettings);
      if (effectiveCycleRange?.startDate && effectiveCycleRange?.endDate) {
        startDate = effectiveCycleRange.startDate;
        endDate = effectiveCycleRange.endDate;
      }
    } catch {
      const parts = String(targetMonth).split('-').map(Number);
      if (parts.length >= 2) {
        const lastDay = new Date(parts[0], parts[1], 0).getDate();
        startDate = `${targetMonth}-01`;
        endDate = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;
        effectiveCycleRange = { startDate, endDate, daysCount: lastDay, month: targetMonth };
      }
    }
  }

  // دالة فحص نطاق التاريخ
  const activePeriodFilter = (d) => {
    if (!d) return false;
    const dateStr = String(d).slice(0, 10);
    if (typeof optActivePeriodFilter === 'function') return optActivePeriodFilter(dateStr);
    if (typeof filterFn === 'function') return filterFn(dateStr);
    if (filterMode === 'all') return true;
    if (startDate && endDate) return dateStr >= startDate && dateStr <= endDate;
    return true;
  };

  // 2. تجميع وتوليد قائمة تواريخ الدورة
  const datesList = [];
  const datesSet = new Set();
  if (startDate && endDate && filterMode !== 'all') {
    let curr = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      if (activePeriodFilter(dateStr)) {
        datesList.push(dateStr);
        datesSet.add(dateStr);
      }
      curr.setDate(curr.getDate() + 1);
    }
  }

  // صمام إضافي: إضافة أي تواريخ ورديات فعلية تمر من الفلتر ولم تكن موجودة
  (shifts || []).forEach((s) => {
    const sDate = s?.date || s?.punch_date || s?.attendance_date || s?.punchDate;
    if (sDate && activePeriodFilter(sDate) && !datesSet.has(sDate)) {
      datesList.push(sDate);
      datesSet.add(sDate);
    }
  });

  // 3. فحص البصمة الحية النشطة لليوم الحالي من activeShifts أو activePunches أو shifts
  const empIdStr = String(employee.id || '');
  const empCodeStr = employee.code ? String(employee.code) : '';
  let liveShiftObj = null;

  const activeMap = state?.activeShifts || state?.activePunches || {};
  if (activeMap && typeof activeMap === 'object') {
    const rawLive = activeMap[employee.id] ||
      activeMap[empIdStr] ||
      (empCodeStr && activeMap[empCodeStr]);
    if (rawLive && typeof rawLive === 'object') {
      const rawIn = rawLive.timeIn || rawLive.time_in || rawLive.punch_in || '—';
      const rawDate = rawLive.date || rawLive.punch_date || todayStr;
      liveShiftObj = {
        ...rawLive,
        id: rawLive.id || `active_${empIdStr}_${todayStr}`,
        employeeId: employee.id,
        employeeCode: employee.code || '',
        employeeName: employee.name || '',
        date: rawDate,
        timeIn: rawIn,
        timeOut: 'قيد العمل الآن',
        isLiveActive: true,
        status: 'live_active',
        statusLabel: 'حضور حي نشط (قيد العمل الآن)'
      };
    }
  }

  // 4. تجميع الورديات الفعلية حسب التاريخ مع التوحيد
  const shiftsByDate = new Map();
  (shifts || []).forEach((rawS) => {
    if (!rawS) return;
    const d = rawS.date || rawS.punch_date || rawS.attendance_date || rawS.punchDate;
    if (!d || !activePeriodFilter(d)) return;
    if (rawS.status === 'cancelled' || rawS.isCancelled) return;

    const s = {
      ...rawS,
      date: d,
      timeIn: rawS.timeIn || rawS.time_in || rawS.punch_in || '—',
      timeOut: rawS.timeOut || rawS.time_out || rawS.punch_out || ''
    };

    // التحقق مما إذا كانت هذه الوردية حية نشطة اليوم
    const isLive = Boolean(s.is_live || s.isLiveActive || (d === todayStr && (!s.timeOut || s.timeOut === '—' || s.timeOut === 'قيد العمل الآن' || s.status === 'active')));
    if (isLive) {
      s.isLiveActive = true;
      s.timeOut = 'قيد العمل الآن';
      s.status = 'live_active';
      s.statusLabel = 'حضور حي نشط (قيد العمل الآن)';
    }

    if (!shiftsByDate.has(d)) shiftsByDate.set(d, []);
    shiftsByDate.get(d).push(s);
  });

  // إذا وُجدت وردية حية اليوم ولم تكن مضافة في shiftsByDate، نقوم بإضافتها
  if (liveShiftObj && liveShiftObj.date) {
    const existingDayShifts = shiftsByDate.get(liveShiftObj.date) || [];
    const hasLiveAlready = existingDayShifts.some(s => s.isLiveActive || s.id === liveShiftObj.id);
    if (!hasLiveAlready) {
      shiftsByDate.set(liveShiftObj.date, [liveShiftObj, ...existingDayShifts]);
    }
  }

  const timeline = [];
  const futureScheduledDays = [];
  const pastAbsencesList = [];
  const todayPendingDays = [];

  const rawHireDate = employee.hireDate || employee.hiring_date || employee.contractStartDate;
  const hireDate = rawHireDate ? String(rawHireDate).slice(0, 10) : '';
  const resignationDate = employee.resignationDate || employee.terminationDate ? String(employee.resignationDate || employee.terminationDate).slice(0, 10) : '';

  const scheduleResolver = typeof options.getEmployeeDaySchedule === 'function'
    ? options.getEmployeeDaySchedule
    : getEmployeeDaySchedule;

  const leaveResolver = typeof options.getEmployeeCurrentApprovedLeave === 'function'
    ? options.getEmployeeCurrentApprovedLeave
    : getEmployeeCurrentApprovedLeave;

  // 5. فحص وبناء كل تاريخ في الدورة
  datesList.forEach((dateStr) => {
    // حصانة ما قبل التعيين وما بعد انتهاء الخدمة
    if (hireDate && dateStr < hireDate) return;
    if (resignationDate && dateStr > resignationDate) return;

    const isFuture = dateStr > todayStr;
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;

    const dayShifts = shiftsByDate.get(dateStr);
    const daySchedule = typeof scheduleResolver === 'function' ? scheduleResolver(employee.id, dateStr, state) : null;
    let isScheduledOff = Boolean(daySchedule?.isOff === true || daySchedule?.type === 'off');

    // صمام أمان إضافي للراحات الأسبوعية: فحص أيام الراحة الأسبوعية المحددة في بيانات الموظف
    if (!isScheduledOff || daySchedule?.isFallback || !daySchedule) {
      const jsDay = new Date(dateStr + 'T00:00:00').getDay();
      const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const enDay = dayNamesEn[jsDay].toLowerCase();
      const arDay = dayNamesAr[jsDay];
      const arClean = arDay.replace(/[إأآ]/g, 'ا');

      const empOffs = Array.isArray(employee.weekly_off_days) ? employee.weekly_off_days
        : Array.isArray(employee.weeklyRestDays) ? employee.weeklyRestDays
        : Array.isArray(employee.offDays) ? employee.offDays
        : [];

      if (empOffs.some(d => {
        const str = String(d || '').trim().toLowerCase();
        const strClean = str.replace(/[إأآ]/g, 'ا');
        return str === enDay || str === arDay.toLowerCase() || strClean === arClean;
      })) {
        isScheduledOff = true;
      }
    }

    const approvedLeave = typeof leaveResolver === 'function' ? leaveResolver(employee, dateStr, state) : null;

    if (dayShifts && dayShifts.length > 0) {
      // ── الحالة الأولى: يوجد وردية فعلية أو أكثر في هذا اليوم ──
      dayShifts.forEach((s) => {
        const isLive = Boolean(s.isLiveActive || (isToday && (!s.timeOut || s.timeOut === '—' || s.timeOut === 'قيد العمل الآن')));
        timeline.push({
          ...s,
          recordType: 'shift',
          isLiveActive: isLive,
          timeOut: isLive ? 'قيد العمل الآن' : (s.timeOut || '—'),
          timeIn: s.timeIn || '—',
          isScheduledOffDay: isScheduledOff,
          isWorkOnOffDay: isScheduledOff,
          isOnApprovedLeave: Boolean(approvedLeave),
          approvedLeaveObj: approvedLeave,
          daySchedule,
          isFuture: false
        });
      });
    } else {
      // ── الحالة الثانية: لا توجد بصمات في هذا اليوم ──
      if (approvedLeave) {
        // إجازة معتمدة
        const lType = approvedLeave.leaveType || 'annual';
        let typeName = 'إجازة سنوية';
        let badgeColor = '#0284c7';
        let badgeBg = '#e0f2fe';
        let badgeBorder = '#bae6fd';
        let icon = '🏖️';

        if (lType === 'sick' || approvedLeave.type === 'sick_leave') {
          typeName = 'إجازة مرضية';
          icon = '🩺';
          badgeColor = '#7c3aed';
          badgeBg = '#f5f3ff';
          badgeBorder = '#ddd6fe';
        } else if (lType === 'casual' || approvedLeave.type === 'casual_leave') {
          typeName = 'إجازة عارضة';
          icon = '📋';
          badgeColor = '#b45309';
          badgeBg = '#fef3c7';
          badgeBorder = '#fde68a';
        } else if (lType === 'mission' || approvedLeave.type === 'mission') {
          typeName = 'مأمورية عمل';
          icon = '🚗';
          badgeColor = '#0369a1';
          badgeBg = '#f0f9ff';
          badgeBorder = '#bae6fd';
        } else if (lType === 'unpaid' || approvedLeave.type === 'unpaid_leave') {
          typeName = 'إجازة بدون راتب';
          icon = '⏸️';
          badgeColor = '#475569';
          badgeBg = '#f1f5f9';
          badgeBorder = '#cbd5e1';
        } else if (lType === 'holiday' || approvedLeave.type === 'official_holiday') {
          typeName = 'إجازة رسمية / أعياد';
          icon = '🎈';
          badgeColor = '#059669';
          badgeBg = '#ecfdf5';
          badgeBorder = '#a7f3d0';
        }

        const isUnpaid = lType === 'unpaid' || approvedLeave.type === 'unpaid_leave';
        const paidHrs = isUnpaid ? 0 : parseFloat(employee.workHoursPerDay || employee.workHours || 8);

        const leaveRecord = {
          id: `leave_${employee.id}_${dateStr}_${approvedLeave.id || 'leave'}`,
          date: dateStr,
          recordType: 'leave',
          isApprovedLeaveDay: true,
          leaveType: lType,
          leaveTypeName: typeName,
          leaveBadge: { color: badgeColor, bg: badgeBg, border: badgeBorder, icon },
          leaveObj: approvedLeave,
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: approvedLeave.branchId || employee.branchId || '',
          branchName: approvedLeave.branchName || employee.branchName || '',
          timeIn: '—',
          timeOut: '—',
          hours: paidHrs,
          regularHours: paidHrs,
          payableHours: paidHrs,
          netHours: paidHrs,
          breakHours: 0,
          overtimeHours: 0,
          status: 'approved_leave',
          statusLabel: `${icon} ${typeName} معتمدة`,
          note: approvedLeave.reason || approvedLeave.notes || `${typeName} معتمدة رسمياً`,
          notes: approvedLeave.reason || approvedLeave.notes || `${typeName} معتمدة رسمياً`,
          source: 'leave_system',
          isFuture
        };

        if (!isFuture || includeFutureScheduled) {
          timeline.push(leaveRecord);
        } else {
          futureScheduledDays.push(leaveRecord);
        }
      } else if (isScheduledOff) {
        // راحة أسبوعية مجدولة
        const bId = daySchedule?.branchId || employee.branchId || '';
        const bObj = (state?.branches || []).find((b) => String(b.id) === String(bId));
        const bName = bObj ? bObj.name : (daySchedule?.branchName || employee.branchName || '');

        const offRecord = {
          id: `off_${employee.id}_${dateStr}`,
          date: dateStr,
          recordType: 'off_day',
          isScheduledOffDay: true,
          isOtherBranchShift: Boolean(daySchedule?.isOtherBranchShift),
          otherBranchName: daySchedule?.otherBranchName || '',
          employeeId: employee.id,
          employeeCode: employee.code || '',
          employeeName: employee.name || '',
          branchId: bId,
          branchName: bName,
          timeIn: '—',
          timeOut: '—',
          hours: 0,
          regularHours: 0,
          payableHours: 0,
          netHours: 0,
          breakHours: 0,
          overtimeHours: 0,
          status: 'scheduled_off',
          statusLabel: daySchedule?.isOtherBranchShift
            ? `🏢 مجدول بفرع ${daySchedule.otherBranchName}`
            : '☕ راحة أسبوعية (Off)',
          note: daySchedule?.label || daySchedule?.note || (daySchedule?.isOtherBranchShift ? `مجدول بفرع ${daySchedule.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر'),
          notes: daySchedule?.label || daySchedule?.note || (daySchedule?.isOtherBranchShift ? `مجدول بفرع ${daySchedule.otherBranchName}` : 'راحة أسبوعية حسب جدول الروستر'),
          source: 'roster_schedule',
          daySchedule,
          isFuture
        };

        if (!isFuture) {
          timeline.push(offRecord);
        } else {
          futureScheduledDays.push(offRecord);
          if (includeFutureScheduled) {
            timeline.push(offRecord);
          }
        }
      } else {
        // لا توجد وردية ولا إجازة ولا راحة أسبوعية
        const bId = daySchedule?.branchId || employee.branchId || '';
        const bObj = (state?.branches || []).find((b) => String(b.id) === String(bId));
        const bName = bObj ? bObj.name : (daySchedule?.branchName || employee.branchName || '');
        const shiftStart = daySchedule?.start || '';
        const shiftEnd = daySchedule?.end || '';
        const schedHours = parseFloat(daySchedule?.hours || 8);

        if (isToday) {
          // اليوم الحالي وبانتظار تسجيل البصمة
          const todayRec = {
            id: `today_pending_${employee.id}_${dateStr}`,
            date: dateStr,
            recordType: 'today_pending',
            isTodayPending: true,
            employeeId: employee.id,
            employeeCode: employee.code || '',
            employeeName: employee.name || '',
            branchId: bId,
            branchName: bName,
            timeIn: shiftStart || '—',
            timeOut: shiftEnd || '—',
            hours: 0,
            regularHours: 0,
            payableHours: 0,
            netHours: 0,
            scheduledHours: schedHours,
            status: 'pending_today',
            statusLabel: `⏳ اليوم الحالي — بانتظار تسجيل البصمة (${shiftStart || '—'} إلى ${shiftEnd || '—'})`,
            notes: `يوم عمل مقرر بالجدول الشهري لليوم وبانتظار تسجيل بصمة الحضور`,
            source: 'roster_schedule',
            daySchedule
          };
          todayPendingDays.push(todayRec);
          if (includeTodayPending) {
            timeline.push(todayRec);
          }
        } else if (isPast) {
          // يوم عمل ماضٍ انقضى دون تسجيل بصمة ودون عذر رسمي -> غياب سابق غير مسجل
          const absenceRec = {
            id: `past_absence_${employee.id}_${dateStr}`,
            date: dateStr,
            recordType: 'past_absence',
            isPastAbsence: true,
            employeeId: employee.id,
            employeeCode: employee.code || '',
            employeeName: employee.name || '',
            branchId: bId,
            branchName: bName,
            timeIn: shiftStart || '—',
            timeOut: shiftEnd || '—',
            hours: 0,
            regularHours: 0,
            payableHours: 0,
            netHours: 0,
            scheduledHours: schedHours,
            status: 'unpunched_absence',
            statusLabel: `⚠️ غياب يوم عمل غير مسجل (${shiftStart || '—'} إلى ${shiftEnd || '—'})`,
            notes: `يوم عمل ماضٍ (${dateStr}) لم تُسجل له بصمة حضور ولم يكن يوم راحة أو إجازة`,
            source: 'roster_schedule',
            daySchedule
          };
          pastAbsencesList.push(absenceRec);
          if (includePastAbsences) {
            timeline.push(absenceRec);
          }
        } else {
          // 🛡️ يوم مستقبلي قادم بالدورة (لم يحن بعد): لا يُسجل كبصمة أبداً
          const futureRec = {
            id: `future_sched_${employee.id}_${dateStr}`,
            date: dateStr,
            recordType: 'future_scheduled',
            isFutureScheduled: true,
            isFuture: true,
            employeeId: employee.id,
            employeeCode: employee.code || '',
            employeeName: employee.name || '',
            branchId: bId,
            branchName: bName,
            timeIn: shiftStart || '—',
            timeOut: shiftEnd || '—',
            hours: 0,
            regularHours: 0,
            payableHours: 0,
            netHours: 0,
            scheduledHours: schedHours,
            status: 'future_scheduled',
            statusLabel: `📅 وردية مجدولة مستقبلاً بالروستر (${shiftStart || '—'} إلى ${shiftEnd || '—'})`,
            notes: `وردية عمل مقررة بالجدول الشهري لم يحن موعدها بعد (${shiftStart || '—'} إلى ${shiftEnd || '—'})`,
            source: 'roster_schedule',
            daySchedule
          };
          futureScheduledDays.push(futureRec);
          if (includeFutureScheduled) {
            timeline.push(futureRec);
          }
        }
      }
    }
  });

  // 6. ترتيب السجلات حسب الاختيار (الافتراضي: 'asc' بالتسلسل الزمني المتصل من بداية الدورة)
  timeline.sort((a, b) => {
    const dA = String(a.date || '');
    const dB = String(b.date || '');
    if (dA !== dB) {
      return sortOrder === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
    }
    const tA = String(a.timeIn || '');
    const tB = String(b.timeIn || '');
    return sortOrder === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
  });

  futureScheduledDays.sort((a, b) => {
    const dA = String(a.date || '');
    const dB = String(b.date || '');
    return dA.localeCompare(dB);
  });

  // 7. احتساب الإحصائيات والأرقام المعتمدة للدورة
  let shiftCount = 0;
  let liveShiftCount = 0;
  let leaveCount = 0;
  let offDayCount = 0;
  let pastAbsenceCount = 0;
  let futureCount = futureScheduledDays.length;

  timeline.forEach((item) => {
    if (item.recordType === 'shift') {
      shiftCount++;
      if (item.isLiveActive) liveShiftCount++;
    } else if (item.recordType === 'leave') {
      leaveCount++;
    } else if (item.recordType === 'off_day') {
      offDayCount++;
    } else if (item.recordType === 'past_absence') {
      pastAbsenceCount++;
    }
  });

  const progress = getCycleProgress(targetMonth, orgSettings);

  const counts = {
    all: timeline.length,
    shifts: shiftCount,
    liveShifts: liveShiftCount,
    leaves: leaveCount,
    offDays: offDayCount,
    pastAbsences: pastAbsenceCount + pastAbsencesList.length,
    futureDays: futureCount,
    todayPending: todayPendingDays.length,
    cycleTotalDays: progress.totalDays,
    cycleElapsedDays: progress.elapsedDays,
    cycleRemainingDays: progress.remainingDays,
    progressPercent: progress.progressPercent
  };

  // إرفاق الإحصائيات والأيام المستقبلية كمرفقات بالكائن المعروض
  timeline.counts = counts;
  timeline.futureScheduledDays = futureScheduledDays;
  timeline.pastAbsencesList = pastAbsencesList;
  timeline.todayPendingDays = todayPendingDays;
  timeline.cycleRange = effectiveCycleRange;
  timeline.progress = progress;

  return timeline;
}




