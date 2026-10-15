/**
 * latePenaltyEngine.js
 * محرك لائحة جزاءات التأخير المتكامل لنظام الـ HR
 * 
 * الميزات:
 * 1. حساب دقائق التأخير بدقة مقارنة بالجدول الشهري المعتمد (Roster Schedule)
 * 2. تقسيم التأخير إلى 5 فئات رئيسية مع عداد تكرار مستقل تماماً لكل فئة
 * 3. تطبيق مصفوفة جزاءات ديناميكية وقابلة للتخصيص بالكامل من واجهة المستخدم
 * 4. إعادة الحساب التلقائي (Auto-Recalculation) عند تعديل البصمات والورديات بأثر رجعي داخل دورة المرتب
 * 5. الفصل المحاسبي بين الجزاء الزمني (دقائق/ساعات) والخصم المالي في مسير الرواتب
 */

import { arabicWeekday } from './formatters.js';
import { getEmployeeDaySchedule } from './rosterEngine.js';
import { getAuthoritativeShiftHours, calculateShiftMetrics, calcRawDurationMinutes } from './workHoursEngine.js';

/**
 * فحص ما إذا كان الموظف يعمل بنظام الدوام الحر/المتغير (ليس له جدول شهري ثابت)
 */
export function isVariableScheduleEmployee(emp) {
  if (!emp) return false;
  return Boolean(
    emp.noMonthlySchedule === true ||
    emp.noMonthlySchedule === 'true' ||
    emp.noMonthlySchedule === 1 ||
    emp.isVariableHours === true ||
    emp.variableHours === true ||
    emp.hasNoRoster === true ||
    emp.scheduleType === 'flexible' ||
    emp.scheduleType === 'variable'
  );
}

// ── السياسة الافتراضية المعتمدة للائحة جزاءات التأخير ──
export const DEFAULT_LATE_PENALTY_POLICY = {
  version: '2.0',
  enabled: true,
  resetScope: 'payroll_cycle', // تصفير العدادات مع كل دورة مرتب
  tiers: [
    {
      id: 'tier_0_10',
      key: 'late_0_10',
      name: 'فئة 0 إلى 10 دقائق',
      minMinutes: 0,
      maxMinutes: 10,
      color: '#10b981', // أخضر
      badgeBg: 'rgba(16, 185, 129, 0.12)',
      badgeText: '#059669',
      penalties: [
        { occurrence: 1, action: 'grace', label: 'سماح', deductionMinutes: 0, note: 'تسجيل في السجل بدون خصم' },
        { occurrence: 2, action: 'grace', label: 'سماح', deductionMinutes: 0, note: 'تسجيل في السجل بدون خصم' },
        { occurrence: 3, action: 'grace', label: 'سماح', deductionMinutes: 0, note: 'تسجيل في السجل بدون خصم' },
        { occurrence: 4, action: 'grace', label: 'سماح', deductionMinutes: 0, note: 'تسجيل في السجل بدون خصم' },
        { occurrence: 5, action: 'grace', label: 'سماح', deductionMinutes: 0, note: 'تسجيل في السجل بدون خصم' },
        { occurrence: 6, action: 'grace', label: 'سماح (السادسة فأكثر)', deductionMinutes: 0, note: 'تسجيل بدون خصم', isDefaultBeyond: true }
      ]
    },
    {
      id: 'tier_11_15',
      key: 'late_11_15',
      name: 'فئة 11 إلى 15 دقيقة',
      minMinutes: 11,
      maxMinutes: 15,
      color: '#3b82f6', // أزرق
      badgeBg: 'rgba(59, 130, 246, 0.12)',
      badgeText: '#2563eb',
      penalties: [
        { occurrence: 1, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 2, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 3, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 4, action: 'deduction', label: 'خصم 15 دقيقة', deductionMinutes: 15 },
        { occurrence: 5, action: 'deduction', label: 'خصم 15 دقيقة', deductionMinutes: 15 },
        { occurrence: 6, action: 'deduction', label: 'خصم 30 دقيقة (السادسة فأكثر)', deductionMinutes: 30, isDefaultBeyond: true }
      ]
    },
    {
      id: 'tier_16_30',
      key: 'late_16_30',
      name: 'فئة 16 إلى 30 دقيقة',
      minMinutes: 16,
      maxMinutes: 30,
      color: '#f59e0b', // برتقالي
      badgeBg: 'rgba(245, 158, 11, 0.12)',
      badgeText: '#d97706',
      penalties: [
        { occurrence: 1, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 2, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 3, action: 'deduction', label: 'خصم 30 دقيقة', deductionMinutes: 30 },
        { occurrence: 4, action: 'deduction', label: 'خصم ساعة (60 دقيقة)', deductionMinutes: 60 },
        { occurrence: 5, action: 'deduction', label: 'خصم ساعة (60 دقيقة)', deductionMinutes: 60 },
        { occurrence: 6, action: 'deduction', label: 'خصم ساعتين (120 دقيقة - السادسة فأكثر)', deductionMinutes: 120, isDefaultBeyond: true }
      ]
    },
    {
      id: 'tier_31_60',
      key: 'late_31_60',
      name: 'فئة 31 إلى 60 دقيقة',
      minMinutes: 31,
      maxMinutes: 60,
      color: '#ea580c', // أحمر برتقالي
      badgeBg: 'rgba(234, 88, 12, 0.12)',
      badgeText: '#c2410c',
      penalties: [
        { occurrence: 1, action: 'grace', label: 'سماح', deductionMinutes: 0 },
        { occurrence: 2, action: 'deduction', label: 'خصم ساعة (60 دقيقة)', deductionMinutes: 60 },
        { occurrence: 3, action: 'deduction', label: 'خصم ساعة ونصف (90 دقيقة)', deductionMinutes: 90 },
        { occurrence: 4, action: 'deduction', label: 'خصم ساعة ونصف (90 دقيقة)', deductionMinutes: 90 },
        { occurrence: 5, action: 'deduction', label: 'خصم ساعتين (120 دقيقة)', deductionMinutes: 120 },
        { occurrence: 6, action: 'deduction', label: 'خصم 3 ساعات (180 دقيقة - السادسة فأكثر)', deductionMinutes: 180, isDefaultBeyond: true }
      ]
    },
    {
      id: 'tier_over_60',
      key: 'late_over_60',
      name: 'فئة أكثر من 60 دقيقة',
      minMinutes: 61,
      maxMinutes: 9999,
      color: '#dc2626', // أحمر داكن
      badgeBg: 'rgba(220, 38, 38, 0.12)',
      badgeText: '#b91c1c',
      penalties: [
        { occurrence: 1, action: 'deduction', label: 'خصم ساعة (60 دقيقة)', deductionMinutes: 60 },
        { occurrence: 2, action: 'deduction', label: 'خصم ساعتين (120 دقيقة)', deductionMinutes: 120 },
        { occurrence: 3, action: 'deduction', label: 'خصم 3 ساعات (180 دقيقة)', deductionMinutes: 180 },
        { occurrence: 4, action: 'deduction', label: 'خصم 4 ساعات (240 دقيقة)', deductionMinutes: 240 },
        { occurrence: 5, action: 'deduction', label: 'خصم 5 ساعات (300 دقيقة)', deductionMinutes: 300 },
        { occurrence: 6, action: 'termination', label: 'فصل / تحقيق إداري وإنهاء خدمة (السادسة فأكثر)', deductionMinutes: 0, isDefaultBeyond: true }
      ]
    }
  ]
};

/**
 * جلب السياسة المعتمدة من كائن الحالة مع الرجوع للقيم الافتراضية
 */
export function getEffectiveLatePolicy(state) {
  if (state?.latePenaltyPolicy?.tiers?.length) {
    return state.latePenaltyPolicy;
  }
  if (state?.bylaws?.latePenaltyPolicy?.tiers?.length) {
    return state.bylaws.latePenaltyPolicy;
  }
  if (state?.orgSettings?.latePenaltyPolicy?.tiers?.length) {
    return state.orgSettings.latePenaltyPolicy;
  }
  return DEFAULT_LATE_PENALTY_POLICY;
}

/**
 * تصنيف دقائق التأخير ضمن الفئة الصحيحة
 */
export function classifyLateTier(diffMinutes, policy = DEFAULT_LATE_PENALTY_POLICY) {
  const minutes = Math.max(0, Math.round(Number(diffMinutes) || 0));
  const rawTiers = policy?.tiers?.length ? policy.tiers : DEFAULT_LATE_PENALTY_POLICY.tiers;
  const tiers = (rawTiers || []).filter(Boolean);

  for (const tier of tiers) {
    if (!tier) continue;
    const min = tier.minMinutes !== undefined ? tier.minMinutes : 0;
    const max = tier.maxMinutes !== undefined ? tier.maxMinutes : 9999;
    if (minutes >= min && minutes <= max) {
      return tier;
    }
  }

  // إذا تجاوزت كل الحدود، نرجع الفئة الأخيرة
  return tiers[tiers.length - 1] || DEFAULT_LATE_PENALTY_POLICY.tiers[4] || DEFAULT_LATE_PENALTY_POLICY.tiers[0];
}

/**
 * جلب الجزاء المقابل لرقم التكرار داخل الفئة
 */
export function getPenaltyForOccurrence(tier, occurrenceNumber) {
  if (!tier || !tier.penalties || !tier.penalties.length) {
    return { occurrence: occurrenceNumber, action: 'grace', label: 'سماح', deductionMinutes: 0 };
  }

  const occ = Math.max(1, parseInt(occurrenceNumber, 10) || 1);
  const exact = (tier.penalties || []).find((p) => p && p.occurrence === occ);
  if (exact) return exact;

  // جلب قاعدة التكرار الأخير (السادسة فأكثر أو أعلى تكرار معرف)
  const defaultBeyond = (tier.penalties || []).find((p) => p && p.isDefaultBeyond);
  if (defaultBeyond) return defaultBeyond;

  return tier.penalties[tier.penalties.length - 1];
}

/**
 * حساب أجر الساعة والدقيقة وقيمة الخصم المالي للموظف
 * المعادلة المعتمدة في النظام:
 * 1. سعر اليوم = (سعر الساعة الشهري المدخل * ساعات العمل اليومية) / أيام العمل الشهرية
 * 2. سعر الساعة اليومي = سعر اليوم / ساعات العمل اليومية = (سعر الساعة الشهري المدخل) / أيام العمل الشهرية
 * 3. سعر الدقيقة = سعر الساعة اليومي / 60
 * 4. قيمة الخصم المالي = دقائق الخصم * سعر الدقيقة
 */
export function computeLatenessFinancialAmount(deductionMinutes, employee, branchId = null) {
  const mins = Math.max(0, parseFloat(deductionMinutes) || 0);
  if (mins === 0 || !employee) return 0;

  let hourlyBase = parseFloat(employee.salary) || 0;
  let workDays = parseFloat(employee.workDaysPerMonth) || parseFloat(employee.workDays) || 26;
  let workHours = parseFloat(employee.workHoursPerDay) || parseFloat(employee.workHours) || 8;

  if (branchId && employee.branchesDetails && employee.branchesDetails.length > 0) {
    const bd = employee.branchesDetails.find((b) => String(b.branchId) === String(branchId));
    if (bd) {
      hourlyBase = parseFloat(bd.salary) || hourlyBase;
      workDays = parseFloat(bd.workDaysPerMonth) || parseFloat(bd.workDays) || workDays;
      workHours = parseFloat(bd.workHoursPerDay) || parseFloat(bd.workHours) || workHours;
    }
  }

  // 1. سعر اليوم = (سعر الساعة الشهري * ساعات اليوم) / أيام الشهر
  const dailyRate = workDays > 0 ? (hourlyBase * workHours) / workDays : (hourlyBase * workHours);

  // 2. سعر الساعة اليومي (أجر الساعة):
  // إذا كان hourlyBase مدخل كسعر ساعة (مثلاً 75) أو سعر شهري مدخل (مثلاً 600 أو 650):
  // - إذا كان hourlyBase >= 200: سعر الساعة اليومي = hourlyBase / workDays (مثال: 600 / 26 = 23.08 ج.م / ساعة)
  // - إذا كان hourlyBase < 200: سعر الساعة اليومي = (hourlyBase * workHours) / workDays (مثال: (75 * 8) / 26 = 23.08 ج.م / ساعة)
  let hourlyRate = 0;
  if (hourlyBase > 0 && workDays > 0) {
    if (hourlyBase >= 200) {
      hourlyRate = hourlyBase / workDays;
    } else {
      hourlyRate = (hourlyBase * workHours) / workDays;
    }
  } else {
    hourlyRate = dailyRate > 0 ? dailyRate : hourlyBase;
  }

  // 3. سعر الدقيقة
  const minuteRate = hourlyRate / 60;

  return Math.round(mins * minuteRate * 100) / 100;
}

/**
 * فحص ما إذا كان هناك إذن معتمد رسمي (تأخير / خروج مبكر / إذن عام / إذن استثنائي) للموظف لتاريخ معين
 */
export function isApprovedPermissionForDate(employeeId, dateStr, state) {
  if (!employeeId || !dateStr || !state) return null;
  const empIdStr = String(employeeId);
  const targetDate = String(dateStr).slice(0, 10);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  const allReqs = [
    ...(state.requests || []),
    ...(state.permissions || []),
    ...(state.employeePermissions || [])
  ];

  return allReqs.find((r) => {
    if (!r) return false;
    const rEmpId = String(r.employeeId || r.empId || '');
    if (rEmpId !== empIdStr && (!empCodeStr || rEmpId !== empCodeStr)) return false;

    // فحص التاريخ بمرونة
    const rDate = String(r.date || r.startDate || r.effectiveDate || r.reqDate || (r.createdAt ? r.createdAt.slice(0, 10) : '')).slice(0, 10);
    if (rDate !== targetDate) return false;

    // فحص نوع الطلب (أذونات بكافة مسمياتها)
    const t = String(r.type || r.requestType || r.subType || '').toLowerCase();
    const isPermType =
      t.includes('perm') ||
      t.includes('إذن') ||
      t.includes('اذن') ||
      r.permType === 'late' ||
      r.permType === 'early' ||
      t === 'late_permission' ||
      t === 'early_leave' ||
      t === 'permission';
    if (!isPermType) return false;

    // فحص حالة الاعتماد
    const isApproved =
      r.status === 'approved' ||
      r.adminApproved === true ||
      r.branchApproved === true ||
      r.managerStatus === 'approved' ||
      r.isApproved === true ||
      r.status === 'approved_permission_exempt';

    const isRejected =
      r.status === 'rejected' ||
      r.isRejected === true ||
      r.status === 'cancelled' ||
      r.isCancelled === true ||
      r.voidedOnShiftDelete === true;

    return isApproved && !isRejected;
  }) || null;
}

/**
 * استخراج بداية الشيفت المجدول للموظف لتاريخ معين من الجداول الشهرية المعتمدة والتبديلات
 */
export function getScheduledShiftForDate(employeeId, dateStr, state) {
  if (!employeeId || !dateStr || !state) return null;

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  // الموظف الذي ليس له جدول شهري أو مواعيد متغيرة لا يمتلك مواعيد شفتات محددة أو ملزمة
  if (isVariableScheduleEmployee(emp)) return null;

  // 🛡️ القاعدة الذهبية المركزية: الحصانة المطلقة لما قبل تاريخ التعيين الرسمي للموظف
  const hireDate = emp?.hireDate || emp?.hiring_date || emp?.contractStartDate;
  if (hireDate && dateStr && dateStr < hireDate) {
    return {
      type: 'off',
      isOff: true,
      isPreHire: true,
      start: '',
      end: '',
      branchId: emp?.branchId || '',
      source: 'pre_hire_immunity'
    };
  }

  // 1. فحص طلبات تعديل الشيفت المعتمدة أولاً (Shift Adjustment Requests)
  const approvedShiftAdj = (state.requests || []).find(
    (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) &&
      (r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_update' || r.type === 'roster_edit_request' || r.type === 'schedule_edit') &&
      (r.status === 'approved' || r.adminApproved || (r.branchApproved && r.isDirectToAdmin)) &&
      (r.date === dateStr || (Array.isArray(r.dates) && r.dates.includes(dateStr)) || (r.schedule && r.schedule[dateStr]) || (r.newSchedule && r.newSchedule[dateStr]) || r.replacementRestDate === dateStr)
  );

  if (approvedShiftAdj) {
    const schedItem = (approvedShiftAdj.schedule && approvedShiftAdj.schedule[dateStr]) ||
                      (approvedShiftAdj.newSchedule && approvedShiftAdj.newSchedule[dateStr]);
    if (schedItem) {
      const isOff = schedItem.type === 'off' || schedItem.isOff === true;
      if (isOff) {
        return { type: 'off', isOff: true, start: '', end: '', branchId: emp?.branchId || '', source: 'shift_adjustment' };
      }
      return {
        start: schedItem.start?.slice(0, 5) || '',
        end: schedItem.end?.slice(0, 5) || '',
        type: schedItem.type || 'work',
        isOff: false,
        branchId: approvedShiftAdj.branchId || schedItem.branchId || emp?.branchId || '',
        rosterId: approvedShiftAdj.id,
        source: 'shift_adjustment'
      };
    }
    if (approvedShiftAdj.actionType === 'set_rest_day' || approvedShiftAdj.replacementRestDate === dateStr) {
      return { type: 'off', isOff: true, start: '', end: '', branchId: emp?.branchId || '', source: 'shift_adjustment' };
    }
    if (approvedShiftAdj.newStartTime) {
      return {
        start: approvedShiftAdj.newStartTime?.slice(0, 5),
        end: approvedShiftAdj.newEndTime?.slice(0, 5) || '',
        type: 'work',
        isOff: false,
        branchId: approvedShiftAdj.branchId || emp?.branchId || '',
        rosterId: approvedShiftAdj.id,
        source: 'shift_adjustment'
      };
    }
  }

  // 2. فحص طلبات تبديل الورديات المعتمدة (Shift Swaps)
  const allSwaps = [...(state.shiftSwaps || []), ...(state.requests || [])];
  const approvedSwap = allSwaps.find(
    (s) => (s.type === 'shift_swap' || s.subType === 'shift_swap' || s.type === 'swap') &&
      (s.status === 'approved' || s.adminApproved) &&
      (s.date === dateStr || s.requesterDate === dateStr || s.targetDate === dateStr || s.targetSwapDate === dateStr) &&
      (String(s.requesterId || s.employeeId || s.requesterEmpId) === empIdStr || String(s.targetEmployeeId || s.targetEmpId || s.peerEmployeeId) === empIdStr || (empCodeStr && (String(s.employeeCode || s.requesterEmpCode) === empCodeStr || String(s.targetEmpCode) === empCodeStr)))
  );

  if (approvedSwap) {
    const isRequester = String(approvedSwap.requesterId || approvedSwap.employeeId || approvedSwap.requesterEmpId) === empIdStr;
    const schedObj = isRequester ? (approvedSwap.targetSchedule || approvedSwap.schedule) : (approvedSwap.requesterSchedule || approvedSwap.schedule);
    if (schedObj) {
      const isOff = schedObj.type === 'off' || schedObj.isOff === true;
      if (isOff) return { type: 'off', isOff: true, start: '', end: '', source: 'swap' };
      if (schedObj.start) {
        return {
          start: schedObj.start?.slice(0, 5),
          end: schedObj.end?.slice(0, 5) || '',
          type: schedObj.type || 'shift',
          isOff: false,
          branchId: approvedSwap.targetBranchId || approvedSwap.branchId || emp?.branchId || '',
          source: 'swap'
        };
      }
    }
  }

  // 3. جدول الموظف المركزي من rosterEngine مع مراعاة كافة التبديلات والتعديلات
  try {
    const daySchedule = getEmployeeDaySchedule(empIdStr, dateStr, state);
    if (daySchedule) {
      const isOff = daySchedule.type === 'off' || daySchedule.isOff === true;
      if (isOff) {
        // حاسم: اليوم راحة معتمدة، يُعاد كراحة حتى لا يتم تطبيق موعد افتراضي 08:00
        return {
          type: 'off',
          isOff: true,
          start: '',
          end: '',
          branchId: daySchedule.branchId || emp?.branchId || '',
          source: 'roster_engine_off'
        };
      }
      if (daySchedule.start) {
        return {
          start: daySchedule.start?.slice(0, 5),
          end: daySchedule.end?.slice(0, 5) || '',
          type: daySchedule.type || 'work',
          isOff: false,
          branchId: daySchedule.branchId || emp?.branchId || '',
          source: 'roster_engine'
        };
      }
    }
  } catch (e) {
    console.error('Error fetching employee day schedule in getScheduledShiftForDate:', e);
  }

  // 4. فحص الجداول المعتمدة مباشرة مع دعم نطاق التواريخ الكامل (fromDate <= dateStr <= toDate)
  const allEmpRosters = (state.rosters || []).filter(
    (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
      (r.status === 'approved' || r.adminApproved || !r.status) &&
      r.schedule
  );

  // فرز الجداول: التي تحتوي على التاريخ الدقيق أولاً، ثم التي في نطاق fromDate/toDate، ثم حسب حداثة التحديث
  allEmpRosters.sort((a, b) => {
    const hasDateA = a.schedule && a.schedule[dateStr] ? 1 : 0;
    const hasDateB = b.schedule && b.schedule[dateStr] ? 1 : 0;
    if (hasDateA !== hasDateB) return hasDateB - hasDateA;
    const inRangeA = a.fromDate && a.toDate && dateStr >= a.fromDate && dateStr <= a.toDate ? 1 : 0;
    const inRangeB = b.fromDate && b.toDate && dateStr >= b.fromDate && dateStr <= b.toDate ? 1 : 0;
    if (inRangeA !== inRangeB) return inRangeB - inRangeA;
    const tA = new Date(a.updatedAt || a.approvedAt || a.createdAt || 0).getTime() || 0;
    const tB = new Date(b.updatedAt || b.approvedAt || b.createdAt || 0).getTime() || 0;
    return tB - tA;
  });

  const arDay = arabicWeekday(dateStr);
  const normalizedArDay = arDay.replace(/[\u0625\u0623\u0622]/g, 'ا');

  for (const ros of allEmpRosters) {
    let sched = ros.schedule[dateStr] || ros.schedule[arDay];
    if (!sched) {
      sched = Object.entries(ros.schedule).find(
        ([k]) => k === dateStr || k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normalizedArDay
      )?.[1];
    }
    if (sched) {
      const isOff = sched.type === 'off' || sched.isOff === true;
      if (isOff) {
        return {
          type: 'off',
          isOff: true,
          start: '',
          end: '',
          branchId: ros.branchId || sched.branchId || emp?.branchId || '',
          rosterId: ros.id,
          source: 'roster_direct_off'
        };
      }
      if (sched.start) {
        return {
          start: sched.start?.slice(0, 5),
          end: sched.end?.slice(0, 5) || '',
          type: sched.type || 'work',
          isOff: false,
          branchId: ros.branchId || sched.branchId || emp?.branchId || '',
          rosterId: ros.id,
          source: 'roster_direct'
        };
      }
    }
  }

  // إذا لم يتوفر أي جدول إطلاقاً، نرجع null منعاً لفرض جزاء 08:00 تلقائي على الموظف
  return null;
}

/**
 * حساب دقائق التأخير بين وقت الحضور الفعلي وموعد بداية الشيفت
 */
export function calculateLatenessMinutes(scheduledStartTime, actualPunchInTime) {
  if (!scheduledStartTime || !actualPunchInTime) return 0;

  const [sH, sM] = scheduledStartTime.split(':').map((v) => parseInt(v, 10) || 0);
  const [aH, aM] = actualPunchInTime.split(':').map((v) => parseInt(v, 10) || 0);

  const schedTotalMins = sH * 60 + sM;
  const actualTotalMins = aH * 60 + aM;

  let diff = actualTotalMins - schedTotalMins;

  // معالجة الورديات الدائرية وعابرة منتصف الليل (Circular 24-hour clock)
  // إذا كان الفارق أكثر من 12 ساعة (720 دقيقة):
  // مثل: بداية الوردية 00:00 وحضر الموظف 23:56 (فارق 1436 دقيقة) -> يعتبر حضوراً مبكراً بـ 4 دقائق (تأخير = 0)
  if (diff > 720) {
    diff -= 1440;
  } else if (diff < -720) {
    diff += 1440;
  }

  return Math.max(0, diff);
}

/**
 * حساب عدادات التكرار الخمسة المستقلة لموظف داخل دورة مرتب
 */
export function countEmployeeTierOccurrences(employeeId, cycleFilterFn, lateIncidents = []) {
  const empIdStr = String(employeeId);
  const counts = {
    late_0_10: 0,
    late_11_15: 0,
    late_16_30: 0,
    late_31_60: 0,
    late_over_60: 0,
    totalIncidents: 0,
    totalDeductionMinutes: 0
  };

  const filtered = (lateIncidents || []).filter((inc) => {
    if (String(inc.employeeId) !== empIdStr) return false;
    if (inc.status === 'cancelled') return false;
    if (cycleFilterFn && typeof cycleFilterFn === 'function') {
      return cycleFilterFn(inc.date);
    }
    return true;
  });

  filtered.forEach((inc) => {
    const key = inc.tierKey || inc.tierId;
    if (counts[key] !== undefined) {
      counts[key] += 1;
    } else if (inc.lateMinutes <= 10) {
      counts.late_0_10 += 1;
    } else if (inc.lateMinutes <= 15) {
      counts.late_11_15 += 1;
    } else if (inc.lateMinutes <= 30) {
      counts.late_16_30 += 1;
    } else if (inc.lateMinutes <= 60) {
      counts.late_31_60 += 1;
    } else {
      counts.late_over_60 += 1;
    }

    counts.totalIncidents += 1;
    counts.totalDeductionMinutes += (parseFloat(inc.deductionMinutes) || 0);
  });

  return counts;
}

/**
 * محرك إعادة الحساب الذاتي الشامل لتأخيرات موظف داخل دورة مرتب
 * يُستخدم عند تعديل وقت بصمة أو تعديل شيفت أو حذف وردية لإعادة ترتيب التكرارات والجزاءات زمنياً
 */
export function recalculateEmployeeCycleLateness({
  employeeId,
  cycleFilterFn,
  state,
  payrollCycleId = null
}) {
  if (!employeeId || !state) return { incidents: [], updatedRequests: state.requests || [] };

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  if (!emp) return { incidents: [], updatedRequests: state.requests || [] };

  const empCodeStr = emp?.code ? String(emp.code) : '';

  // لا يتم تطبيق لائحة التأخيرات على الموظف الذي ليس له جدول شهري أو مواعيد متغيرة
  if (isVariableScheduleEmployee(emp)) return { incidents: [], updatedRequests: state.requests || [] };

  const policy = getEffectiveLatePolicy(state);
  if (!policy.enabled) return { incidents: [], updatedRequests: state.requests || [] };

  // 1. جلب جميع الورديات المسجلة للموظف في الدورة مرتبة تصاعدياً
  const empShifts = (state.shifts || [])
    .filter((s) => (String(s.employeeId) === empIdStr || (empCodeStr && (String(s.employeeCode) === empCodeStr || String(s.employeeId) === empCodeStr))) && (!cycleFilterFn || cycleFilterFn(s.date)))
    .sort((a, b) => (a.date === b.date ? (a.timeIn || '').localeCompare(b.timeIn || '') : a.date.localeCompare(b.date)));

  // عدادات تكرار مستقلة تبدأ من صفر لكل فئة
  const tierCounters = {
    tier_0_10: 0,
    tier_11_15: 0,
    tier_16_30: 0,
    tier_31_60: 0,
    tier_over_60: 0
  };

  const newIncidents = [];
  const supersededIncidentIds = [];
  const existingIncidentsMap = new Map();
  const existingIncidentsByDate = new Map();
  const existingIncidentsByShift = new Map();

  (state.lateIncidents || []).forEach((inc) => {
    if (!inc || !inc.id) return;
    existingIncidentsMap.set(String(inc.id), inc);
    const dateKey = `${inc.employeeId}_${inc.date}`;
    if (!existingIncidentsByDate.has(dateKey)) {
      existingIncidentsByDate.set(dateKey, inc);
    }
    if (inc.shiftId) {
      existingIncidentsByShift.set(`${inc.employeeId}_${inc.shiftId}`, inc);
    }
  });

  // جلب كافة طلبات الأذونات المعتمدة للموظف (إذن تأخير / إذن خروج مبكر / إذن عام)
  const approvedPermissions = (state.requests || []).filter(
    (r) =>
      (String(r.employeeId) === empIdStr || (empCodeStr && (String(r.employeeCode) === empCodeStr || String(r.employeeId) === empCodeStr))) &&
      (r.type === 'permission' || r.type === 'إذن' || r.type === 'late_permission' || r.type === 'early_leave') &&
      (r.status === 'approved' || r.adminApproved === true || (r.branchApproved && r.status !== 'rejected' && !r.isRejected)) &&
      r.status !== 'rejected' &&
      r.status !== 'cancelled'
  );

  for (const shift of empShifts) {
    if (!shift.date || !shift.timeIn) continue;

    // استخراج بداية الشيفت المجدول
    const sched = getScheduledShiftForDate(emp.id, shift.date, state);
    if (!sched || sched.isOff || sched.type === 'off' || !sched.start) continue;

    const diffMinutes = calculateLatenessMinutes(sched.start, shift.timeIn);
    if (diffMinutes <= 0) continue; // حضور في الموعد أو مبكر

    // فحص ذكي: هل البصمة هي بصمة انصراف عند نهاية الوردية سجلت خطأ كحضور؟
    if (sched.end) {
      const [eH, eM] = sched.end.split(':').map((v) => parseInt(v, 10) || 0);
      const [aH, aM] = shift.timeIn.split(':').map((v) => parseInt(v, 10) || 0);
      let endDiff = Math.abs((aH * 60 + aM) - (eH * 60 + eM));
      if (endDiff > 720) endDiff = 1440 - endDiff;
      // إذا كانت البصمة خلال 60 دقيقة من موعد نهاية الوردية والفارق عن البداية أكثر من 3 ساعات:
      // فهذه بصمة انصراف حتمية وليست بصمة حضور متأخر!
      if (endDiff <= 60 && diffMinutes > 180) continue;
    }

    // تحديد الفئة
    const tier = classifyLateTier(diffMinutes, policy);
    const tierKey = tier.id;

    // فحص ما إذا كان هناك إذن معتمد للموظف في هذا التاريخ
    const approvedPerm = isApprovedPermissionForDate(emp.id, shift.date, state);

    const incId = `late_inc_${emp.id}_${shift.date}_${shift.timeIn.replace(':', '')}`;
    const canonicalDateKey = `${emp.id}_${shift.date}`;
    const shiftKey = shift.id ? `${emp.id}_${shift.id}` : null;
    
    // مطابقة ذكية: البحث عن واقعة سابقة بالمعرف المباشر أولاً، ثم بالوردية، ثم بتاريخ اليوم
    const prevInc = existingIncidentsMap.get(incId) || (shiftKey && existingIncidentsByShift.get(shiftKey)) || existingIncidentsByDate.get(canonicalDateKey);
    if (prevInc && prevInc.id && String(prevInc.id) !== incId) {
      supersededIncidentIds.push(String(prevInc.id));
    }

    const effectiveShiftBranchId = shift.branchId || sched.branchId || emp.branchId;
    const branchObj = (state.branches || []).find((b) => b && b.id === effectiveShiftBranchId);
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    // فحص ما إذا كان هناك تظلم معتمد أو إلغاء رسمي للواقعة
    const approvedObjReq = (state.requests || []).find(
      (r) =>
        (String(r.employeeId) === empIdStr || (empCodeStr && (String(r.employeeCode) === empCodeStr || String(r.employeeId) === empCodeStr))) &&
        (r.type === 'penalty_objection' || r.type === 'objection' || r.type === 'penalty') &&
        (r.status === 'approved' || r.adminApproved || r.objection?.status === 'approved') &&
        (r.penaltyId === incId || r.id === `obj_inc_${incId}` || r.id === `req_${incId}` || (r.date === shift.date && (r.subType === 'lateness' || r.type === 'penalty')))
    );

    const isObjectionApproved = Boolean(
      prevInc?.objection?.status === 'approved' ||
      prevInc?.isCancelled ||
      prevInc?.status === 'cancelled' ||
      prevInc?.status === 'waived' ||
      (approvedObjReq && (approvedObjReq.type === 'penalty_objection' || approvedObjReq.isCancelled || approvedObjReq.status === 'cancelled' || approvedObjReq.objection?.status === 'approved'))
    );

    const isObjectionPending = Boolean(
      !isObjectionApproved &&
      (prevInc?.objection?.status === 'pending' ||
       prevInc?.status === 'objection_pending' ||
       (state.requests || []).some(
         (r) =>
           (String(r.employeeId) === empIdStr || (empCodeStr && (String(r.employeeCode) === empCodeStr || String(r.employeeId) === empCodeStr))) &&
           (r.type === 'penalty_objection' || r.type === 'objection') &&
           r.status === 'pending' &&
           (r.penaltyId === incId || r.id === `obj_inc_${incId}` || (r.date === shift.date && r.subType === 'lateness'))
       ))
    );

    let occurrenceNumber = 0;
    let actionType = 'grace';
    let actionLabel = 'سماح';
    let deductionMins = 0;
    let penaltyAmount = 0;
    let status = 'approved';
    let overrideReason = '';
    let isCancelled = false;
    let cancellationReason = '';
    let objectionData = prevInc?.objection || null;

    // فحص ما إذا كان هناك طلب تعديل شيفت معتمد لهذا الموظف وهذا التاريخ
    const approvedShiftAdj = (state.requests || []).find(
      (r) =>
        (String(r.employeeId) === empIdStr || (empCodeStr && (String(r.employeeCode) === empCodeStr || String(r.employeeId) === empCodeStr))) &&
        r.type === 'shift_adjustment' &&
        (r.status === 'approved' || r.adminApproved) &&
        (r.date === shift.date || (Array.isArray(r.dates) && r.dates.includes(shift.date)) || (r.schedule && r.schedule[shift.date]))
    );

    if (approvedPerm) {
      // ✅ تم إلغاء الخصم والجزاء لوجود إذن معتمد رسمي
      actionType = 'grace';
      actionLabel = `سماح (${approvedPerm.permType === 'early' ? 'إذن خروج مبكر معتمد' : 'إذن تأخير معتمد'})`;
      deductionMins = 0;
      penaltyAmount = 0;
      status = 'approved_permission_exempt';
      overrideReason = `تم إلغاء الجزاء والخصم تلقائياً لوجود إذن معتمد (${approvedPerm.permType === 'early' ? 'إذن خروج مبكر' : 'إذن تأخير'} من ${approvedPerm.startTime || '—'} إلى ${approvedPerm.endTime || '—'})${approvedPerm.reason ? ' - سبب الإذن: ' + approvedPerm.reason : ''}`;
      occurrenceNumber = 0;
    } else if (approvedShiftAdj) {
      // ✅ تم إلغاء الجزاء والخصم رسمياً لاعتماد طلب تعديل الشيفت
      actionType = 'grace';
      actionLabel = 'سماح (تعديل شيفت معتمد)';
      deductionMins = 0;
      penaltyAmount = 0;
      status = 'cancelled';
      isCancelled = true;
      cancellationReason = `تم إلغاء الجزاء لاعتماد طلب تعديل الشيفت (${approvedShiftAdj.id || ''})`;
      overrideReason = 'تم اعتماد تعديل موعد الشيفت وإلغاء أي جزاء تأخير';
      occurrenceNumber = 0;
    } else if (isObjectionApproved) {
      // ✅ تم قبول التظلم والاعتراض رسمياً من الإدارة العليا وإلغاء الخصم المالي
      actionType = 'grace';
      actionLabel = 'سماح (تم قبول التظلم وإلغاء الخصم)';
      deductionMins = 0;
      penaltyAmount = 0;
      status = 'cancelled';
      isCancelled = true;
      cancellationReason = prevInc?.cancellationReason || approvedObjReq?.reason || 'تم قبول تظلم الموظف وإلغاء الجزاء والخصم التأديبي';
      objectionData = {
        ...(prevInc?.objection || approvedObjReq?.objection || {}),
        status: 'approved',
        resolvedAt: prevInc?.objection?.resolvedAt || new Date().toISOString()
      };
      occurrenceNumber = 0;
    } else {
      // زيادة عداد الفئة وتحديد رقم التكرار للوقائع غير المأذونة
      tierCounters[tierKey] = (tierCounters[tierKey] || 0) + 1;
      occurrenceNumber = tierCounters[tierKey];

      // جلب قاعدة الجزاء المقابلة
      const rule = getPenaltyForOccurrence(tier, occurrenceNumber);

      const isOverridden = prevInc && (prevInc.status === 'overridden' || prevInc.overrideReason);
      actionType = isOverridden ? prevInc.actionType : rule.action;
      actionLabel = isOverridden ? prevInc.actionLabel : rule.label;
      deductionMins = isOverridden ? (parseFloat(prevInc.deductionMinutes) || 0) : (rule.deductionMinutes || 0);
      penaltyAmount = computeLatenessFinancialAmount(deductionMins, emp, effectiveShiftBranchId);
      status = isObjectionPending ? 'objection_pending' : (prevInc?.status && prevInc.status !== 'pending' ? prevInc.status : 'approved');
      overrideReason = prevInc?.overrideReason || '';
      if (isObjectionPending) {
        objectionData = prevInc?.objection || { status: 'pending', submittedAt: new Date().toISOString() };
      }
    }

    const incident = {
      id: incId,
      employeeId: emp.id,
      employeeCode: emp.code || '',
      employeeName: emp.name || '',
      jobTitle: emp.jobTitle || '',
      branchId: effectiveShiftBranchId,
      branchName: branchName,
      shiftId: shift.id,
      date: shift.date,
      scheduledStartTime: sched.start,
      actualPunchInTime: shift.timeIn,
      lateMinutes: diffMinutes,
      tierId: tier.id,
      tierKey: tier.key || tier.id,
      tierName: tier.name,
      tierColor: tier.color,
      occurrenceNumber: occurrenceNumber,
      actionType: actionType,
      actionLabel: actionLabel,
      deductionMinutes: deductionMins,
      deductionHours: Math.round((deductionMins / 60) * 100) / 100,
      penaltyAmount: penaltyAmount,
      payrollCycleId: payrollCycleId || shift.date.slice(0, 7),
      status: status,
      isCancelled: isCancelled,
      cancellationReason: cancellationReason,
      objection: objectionData,
      overrideReason: overrideReason,
      permissionRequestId: approvedPerm ? approvedPerm.id : null,
      acknowledgedByAdmin: Boolean(prevInc?.acknowledgedByAdmin || shift.isManual || shift.manualPunch || shift.createdBy === 'admin' || shift.creatorRole === 'admin'),
      isAdminCreated: Boolean(prevInc?.isAdminCreated || shift.createdBy === 'admin' || shift.creatorRole === 'admin'),
      creatorRole: (prevInc?.creatorRole || shift.creatorRole || (shift.createdBy === 'admin' ? 'admin' : undefined)),
      read: prevInc ? Boolean(prevInc.read) : Boolean(shift.isManual || shift.manualPunch || shift.createdBy === 'admin' || shift.creatorRole === 'admin'),
      readAt: prevInc?.readAt || null,
      modifiedBy: prevInc?.modifiedBy || null,
      modifiedAt: prevInc?.modifiedAt || null,
      createdAt: prevInc?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    newIncidents.push(incident);
  }

  // 2. تحديث الطلبات والتسويات (Requests) لتعكس الجزاءات المحدثة
  const existingReqs = state.requests || [];
  const otherReqs = existingReqs.filter(
    (r) => !((String(r.employeeId) === empIdStr || (empCodeStr && (String(r.employeeCode) === empCodeStr || String(r.employeeId) === empCodeStr))) && (r.subType === 'lateness' || r.type === 'late_penalty') && (!cycleFilterFn || cycleFilterFn(r.date)))
  );

  const newLateRequests = newIncidents
    .filter((inc) => inc.status !== 'approved_permission_exempt' && inc.status !== 'cancelled' && !inc.isCancelled && inc.objection?.status !== 'approved' && inc.actionType !== 'grace' && (inc.deductionMinutes > 0 || inc.penaltyAmount > 0))
    .map((inc) => ({
      id: `req_${inc.id}`,
      employeeId: inc.employeeId,
      employeeName: inc.employeeName,
      employeeCode: inc.employeeCode,
      jobTitle: inc.jobTitle,
      branchId: inc.branchId,
      branchName: inc.branchName,
      type: 'penalty',
      subType: 'lateness',
      ruleTitle: `جزاء تأخير: ${inc.tierName} (${inc.lateMinutes} دقيقة - المرة ${inc.occurrenceNumber})`,
      impactType: 'time_deduction',
      deductionMinutes: inc.deductionMinutes,
      impactVal: inc.deductionMinutes,
      amount: inc.penaltyAmount,
      scheduledStart: inc.scheduledStartTime,
      actualIn: inc.actualPunchInTime,
      latenessMinutes: inc.lateMinutes,
      occurrenceNumber: inc.occurrenceNumber,
      suggestedAction: inc.actionLabel,
      reason: `تأخر الموظف بمقدار ${inc.lateMinutes} دقيقة عن موعد ورديته المحدد (${inc.scheduledStartTime}). المرة رقم ${inc.occurrenceNumber} في ${inc.tierName}.`,
      details: `${inc.actionLabel} | دقائق الخصم: ${inc.deductionMinutes} دقيقة (${inc.penaltyAmount} ج.م)`,
      date: inc.date,
      payrollCycleId: inc.payrollCycleId,
      createdAt: inc.createdAt,
      targetApproval: 'admin_only',
      branchApproved: true,
      adminApproved: inc.status === 'approved',
      status: inc.status || 'approved',
      read: Boolean(inc.read || inc.acknowledgedByAdmin || inc.isAdminCreated),
      hiddenFromAdmin: Boolean(inc.acknowledgedByAdmin || inc.isAdminCreated),
      isAdminCreated: Boolean(inc.isAdminCreated),
      creatorRole: inc.isAdminCreated ? 'admin' : undefined,
      source: 'late_penalty_engine'
    }));

  return {
    incidents: newIncidents,
    updatedRequests: [...newLateRequests, ...otherReqs],
    supersededIncidentIds
  };
}

// ── سياسة وضوابط الأذونات الافتراضية ──
export const DEFAULT_PERMISSION_POLICY = {
  maxHoursPerPermission: 2, // الحد الأقصى لساعات الإذن للمرة الواحدة (2 ساعة)
  maxPermissionsPerMonth: 2, // الحد الأقصى لعدد مرات الإذن شهرياً للموظف (2 مرات)
  requireReason: true,
  allowExceptions: true,
  autoAdjustPunches: true,
  autoWaiveLatePenalties: true
};

/**
 * حساب صافي الساعات الفعلية المستحقة للوردية مع تحصين ضد أخطاء البصمات المزدوجة والتسمم بـ NaN
 * تم توحيدها واعتمادها من المحرك المركزي Authoritative Work Hours Engine
 */
export function getEffectiveShiftHours(shift, state) {
  return getAuthoritativeShiftHours(shift, state);
}

/**
 * المحرك المركزي الموحد لحساب وتفصيل ساعات الوردية:
 * 1. يحسب صافي ساعات العمل الفعلية المجردة (actualWorkedHours) من وقت الدخول إلى الخروج مع حماية البصمة المزدوجة وخصم البريك.
 * 2. يقسم الساعات إلى: أساسي مقرّر (regularHours) وإضافي (overtimeHours).
 * 3. يحدد بدقة حالة الاعتماد للإضافي (overtimeStatus): approved | pending | rejected | none.
 * 4. يحدد الساعات المستحقة للصرف المالي الفعلي (payableHours).
 * 5. يوفر نصوصاً وشارات دقيقة للعرض في كافة الجداول والشاشات لمنع اختفاء أي دقيقة عمل للموظف.
 */
export function getShiftHoursMetrics(shift, state) {
  return calculateShiftMetrics(shift, state);
}

/**
 * يقوم بمزامنة الأذونات المعتمدة مع سجل البصمات (shifts):
 * 1. تعويض ساعات الإذن المعتمدة في صافي ساعات العمل لليوم المعني.
 * 2. وضع إشعار وملاحظة واضحة على البصمة بأنها معدلة بإذن معتمد.
 * 3. تمكين ظهورها في شاشات الإدارة والفرع والموظف.
 */
export function applyApprovedPermissionsToShifts(stateOrPerms, maybeShifts, maybeBylaws, maybeEmps) {
  let state;
  if (Array.isArray(stateOrPerms)) {
    state = {
      requests: stateOrPerms,
      shifts: maybeShifts || [],
      bylaws: maybeBylaws || {},
      employees: maybeEmps || []
    };
  } else {
    state = stateOrPerms;
  }

  if (!state || !state.shifts) return state?.shifts || [];

  return (state.shifts || []).map((shift) => {
    if (!shift.employeeId || !shift.date) return shift;
    const perm = isApprovedPermissionForDate(shift.employeeId, shift.date, state);
    if (!perm) return shift;

    // حساب ساعات الإذن
    let permHours = parseFloat(perm.hours) || 0;
    if (!permHours && perm.durationMinutes) {
      permHours = Math.round((perm.durationMinutes / 60) * 100) / 100;
    }
    if (!permHours && perm.startTime && perm.endTime) {
      const [h1, m1] = perm.startTime.split(':').map(Number);
      const [h2, m2] = perm.endTime.split(':').map(Number);
      let diff = 0;
      if (h1 === h2 && (m1 || 0) === (m2 || 0)) {
        diff = 0;
      } else {
        diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
        if (diff < 0) diff += 24 * 60;
      }
      permHours = Math.round((diff / 60) * 100) / 100;
    }

    const permTypeLabel = perm.permType === 'early' ? 'إذن انصراف مبكر' : (perm.isExceptional ? 'إذن استثنائي معتمد' : 'إذن تأخير عن الوردية');
    const noteText = `⏰ تم تعديل البصمة واحتساب ساعات ${permTypeLabel} المعتمد (${perm.startTime || '—'} إلى ${perm.endTime || '—'}) [${permHours} س]${perm.reason ? ' - ' + perm.reason : ''}`;

    const effectiveHours = getEffectiveShiftHours(shift, state);

    return {
      ...shift,
      hours: effectiveHours,
      workHours: effectiveHours,
      netHours: effectiveHours,
      actualWorkedHours: Math.max(0, Math.round((effectiveHours - permHours) * 100) / 100),
      hasApprovedPermission: true,
      permissionId: perm.id,
      permissionType: perm.permType || 'late',
      permissionHours: permHours,
      permissionTimeRange: `من ${perm.startTime || '—'} إلى ${perm.endTime || '—'}`,
      permissionNotes: noteText,
      notes: shift.notes && shift.notes.includes('⏰ تم تعديل البصمة') ? shift.notes : `${noteText}${shift.notes ? ' | ' + shift.notes : ''}`
    };
  });
}

/**
 * مزامنة كاملة لكافة الموظفين لربط الأذونات المعتمدة وتحديث وقائع التأخير والبصمات
 */
export function syncAllEmployeesPermissionsAndLateness(state) {
  if (!state) return state;
  const updatedShifts = applyApprovedPermissionsToShifts(state);
  const stateWithShifts = { ...state, shifts: updatedShifts };

  const allIncidents = [];
  const employees = (state.employees || []).filter((e) => e && e.id);

  for (const emp of employees) {
    if (!emp || !emp.id) continue;
    try {
      const { incidents } = recalculateEmployeeCycleLateness({
        employeeId: emp.id,
        cycleFilterFn: null,
        state: stateWithShifts,
        payrollCycleId: new Date().toISOString().slice(0, 7)
      });
      allIncidents.push(...incidents);
    } catch (e) {
      console.error(`Error recalculating for emp ${emp?.id}:`, e);
    }
  }

  const syncedState = {
    ...stateWithShifts,
    lateIncidents: allIncidents
  };

  return auditAndCleanFlexibleStaffPenalties(syncedState);
}

/**
 * فحص وتدقيق موظفي الدوام الحر والمتغير وإلغاء أي جزاءات تأخير أو خروج مبكر سابقة مسجلة لهم
 */
export function auditAndCleanFlexibleStaffPenalties(state) {
  if (!state || !Array.isArray(state.employees)) return state;

  const flexibleEmpIds = new Set();
  state.employees.forEach((emp) => {
    if (isVariableScheduleEmployee(emp)) {
      if (emp.id) flexibleEmpIds.add(String(emp.id));
      if (emp.code) flexibleEmpIds.add(String(emp.code));
    }
  });

  if (flexibleEmpIds.size === 0) return state;

  // 1. تصفية وإلغاء وقائع التأخير السابقة لهؤلاء الموظفين
  const cleanedIncidents = (state.lateIncidents || []).filter((inc) => {
    if (!inc) return false;
    const incEmpId = String(inc.employeeId || inc.empId || '');
    const incEmpCode = String(inc.employeeCode || '');
    const isFlex = flexibleEmpIds.has(incEmpId) || (incEmpCode && flexibleEmpIds.has(incEmpCode));
    return !isFlex;
  });

  // 2. إلغاء أي طلبات جزاءات تأخير أو انصراف مبكر مسجلة بحق هؤلاء الموظفين
  const cleanedRequests = (state.requests || []).filter((r) => {
    if (!r) return false;
    const rEmpId = String(r.employeeId || r.empId || '');
    const rEmpCode = String(r.employeeCode || '');
    const isFlex = flexibleEmpIds.has(rEmpId) || (rEmpCode && flexibleEmpIds.has(rEmpCode));
    if (isFlex) {
      const isEarly = r.type === 'early_exit' || r.subType === 'early_exit' || String(r.id || '').startsWith('req_early_');
      const isLate = r.type === 'lateness' || r.subType === 'lateness' || (r.type === 'penalty' && String(r.id || '').includes('late')) || String(r.id || '').startsWith('req_late_');
      if (isEarly || isLate) {
        return false;
      }
    }
    return true;
  });

  // 3. تنظيف أي إشعارات تنبيهية قديمة للتأخير أو الانصراف المبكر لهؤلاء الموظفين
  const cleanedNotifications = (state.notifications || []).filter((n) => {
    if (!n) return false;
    const nEmpId = String(n.empId || n.employeeId || '');
    if (flexibleEmpIds.has(nEmpId)) {
      if (n.type === 'early_exit_alert' || n.type === 'lateness_alert') {
        return false;
      }
    }
    return true;
  });

  return {
    ...state,
    lateIncidents: cleanedIncidents,
    requests: cleanedRequests,
    notifications: cleanedNotifications
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚡ محرك التسوية التفاعلي الذكي اللحظي بين الجداول الشهرية وبصمات الحضور الفعلي
 * (Bi-Directional Attendance & Roster Reactive Reconciliation Engine)
 * ══════════════════════════════════════════════════════════════════════════════
 * يُستدعى تلقائياً عند:
 *  1. تعديل مواعيد عمل يوم أو شهر كامل في الجدول الشهري للموظف (من الإدارة أو الفرع).
 *  2. اعتماد أو تعديل طلبات الروستر أو تعديل الورديات أو التبديل.
 *  3. تعديل بصمة حضور أو انصراف يدوي أو حذفها أو تسجيل بصمة جديدة.
 *
 * المنطق الهندسي:
 *  - يقارن التغيير الحادث في الجدول بمواعيد الحضور الفعلي المسجلة.
 *  - إذا أصبح الحضور مطابقاً للموعد الجديد (أو كان الفارق ضمن فترة السماح أو أصبح اليوم راحة)، يُلغى جزاء التأخير فوراً وتُصفر دقائق الخصم والمبلغ المالي.
 *  - تسوية أو إلغاء أي طلبات جزاءات مرتبطة في requests.
 *  - إعادة احتساب تسلسل تكرار المخالفات (Occurrence Multiplier) لكامل الدورة لضمان عدم مضاعفة الجزاءات لاحقاً بالخطأ.
 *  - دعم كامل لدورات المرتبات الممتدة بين شهرين (مثل 21 سبتمبر إلى 20 أكتوبر).
 */
export function reconcileEmployeeScheduleOrPunchChange({
  employeeId,
  changedDates = null,
  state,
  options = {}
}) {
  if (!employeeId || !state) {
    return {
      updatedState: state,
      summary: { hasChanges: false, waivedDeductionMinutes: 0, waivedAmount: 0, eliminatedIncidentsCount: 0 }
    };
  }

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  if (!emp) {
    return {
      updatedState: state,
      summary: { hasChanges: false, waivedDeductionMinutes: 0, waivedAmount: 0, eliminatedIncidentsCount: 0 }
    };
  }

  // 1. حساب دقائق الخصم والمبالغ السابقة لهذا الموظف قبل التسوية
  const isFlex = isVariableScheduleEmployee(emp);
  let prevDedMins = 0;
  let prevMoney = 0;
  const prevEmpIncidents = (state.lateIncidents || []).filter(
    (inc) => inc && (String(inc.employeeId) === empIdStr || (emp.code && String(inc.employeeCode) === String(emp.code)))
  );
  prevEmpIncidents.forEach((inc) => {
    if (inc.status !== 'cancelled' && (parseFloat(inc.deductionMinutes) || 0) > 0) {
      prevDedMins += parseFloat(inc.deductionMinutes);
      prevMoney += parseFloat(inc.penaltyAmount) || 0;
    }
  });

  // 2. إعادة احتساب وقائع التأخير للدورة كاملة وفق الجداول والبصمات المحدثة
  const recRes = isFlex
    ? { incidents: [], updatedRequests: state.requests || [], supersededIncidentIds: [] }
    : recalculateEmployeeCycleLateness({
        employeeId: emp.id,
        cycleFilterFn: null,
        state,
        payrollCycleId: null
      });

  const newIncidentsForEmp = isFlex ? [] : (recRes.incidents || []);
  const newIncidentsMap = new Map(newIncidentsForEmp.map((i) => [i.id, i]));

  // 3. تحديد الوقائع التي ألغيت أو تم تصفير خصمها لتسوية طلبات الجزاء المقابلة لها
  const eliminatedOrWaivedIncidents = [];
  prevEmpIncidents.forEach((oldInc) => {
    if (isFlex) {
      eliminatedOrWaivedIncidents.push(oldInc);
      return;
    }
    const newInc = newIncidentsMap.get(oldInc.id) || newIncidentsForEmp.find(i => i.date === oldInc.date);
    const oldDed = parseFloat(oldInc.deductionMinutes) || 0;
    const newDed = newInc ? (parseFloat(newInc.deductionMinutes) || 0) : 0;
    if (!newInc || (oldDed > 0 && newDed === 0) || (newInc && (newInc.actionType === 'grace' || newInc.status === 'cancelled'))) {
      eliminatedOrWaivedIncidents.push(oldInc);
    }
  });

  // 4. استبدال وقائع هذا الموظف فقط في مصفوفة lateIncidents
  const otherEmployeesIncidents = (state.lateIncidents || []).filter(
    (inc) => inc && String(inc.employeeId) !== empIdStr && (!emp.code || String(inc.employeeCode) !== String(emp.code))
  );
  const updatedLateIncidents = isFlex ? otherEmployeesIncidents : [...otherEmployeesIncidents, ...newIncidentsForEmp];

  // 5. تسوية وإلغاء طلبات الجزاء المرتبطة في requests
  const waivedIncidentIds = new Set(eliminatedOrWaivedIncidents.map((i) => i.id));
  const waivedDates = new Set(eliminatedOrWaivedIncidents.map((i) => i.date));

  const updatedRequests = (recRes.updatedRequests || state.requests || []).map((req) => {
    if (!req) return req;
    const isEmpMatch = String(req.employeeId) === empIdStr || (emp.code && String(req.employeeCode) === String(emp.code));
    if (!isEmpMatch) return req;

    const isPenaltyReq = req.type === 'penalty' || req.type === 'lateness' || req.subType === 'lateness' || String(req.id || '').startsWith('req_late_inc_');
    if (!isPenaltyReq) return req;

    if (isFlex) {
      return {
        ...req,
        status: 'cancelled',
        isCancelled: true,
        amount: 0,
        deductionMinutes: 0,
        cancelledAt: new Date().toISOString(),
        cancellationReason: 'معفى تماماً من لائحة التأخيرات (ليس له جدول شهري - مواعيد متغيرة)',
        adminNote: (req.adminNote ? req.adminNote + ' | ' : '') + 'ملغى آلياً: نظام دوام مرن'
      };
    }

    const reqIncId = req.penaltyId || (String(req.id || '').startsWith('req_') ? req.id.replace('req_', '') : null);
    const isTargetIncident = (reqIncId && waivedIncidentIds.has(reqIncId)) || (req.date && waivedDates.has(req.date));

    if (isTargetIncident && req.status !== 'cancelled') {
      return {
        ...req,
        status: 'cancelled',
        isCancelled: true,
        amount: 0,
        deductionMinutes: 0,
        cancelledAt: new Date().toISOString(),
        cancellationReason: options.reason
          ? `تم إلغاء الجزاء تلقائياً لتطابق الحضور الفعلي مع (${options.reason})`
          : 'تم إلغاء الجزاء تلقائياً لتطابق الحضور الفعلي مع تعديل الجدول/البصمة',
        adminNote: (req.adminNote ? req.adminNote + ' | ' : '') + 'ملغى آلياً بواسطة محرك التسوية الذكي'
      };
    }
    return req;
  });

  // 6. تجميع الشواهد المحذوفة (Tombstones) لمنع قيامة السجلات القديمة عند المزامنة
  const tombstoneIds = new Set(Array.isArray(state._deletedIds) ? state._deletedIds : []);
  eliminatedOrWaivedIncidents.forEach((oldInc) => {
    if (oldInc && oldInc.id) {
      tombstoneIds.add(String(oldInc.id));
      tombstoneIds.add(`req_${oldInc.id}`);
      tombstoneIds.add(`adj_${oldInc.id}`);
      tombstoneIds.add(`notif_late_${emp.id}_${oldInc.date}`);
    }
  });
  (recRes.supersededIncidentIds || []).forEach((oldId) => {
    if (oldId) {
      tombstoneIds.add(String(oldId));
      tombstoneIds.add(`req_${oldId}`);
      tombstoneIds.add(`adj_${oldId}`);
    }
  });

  // 7. حساب دقائق الخصم والمبالغ بعد التسوية
  let newDedMins = 0;
  let newMoney = 0;
  newIncidentsForEmp.forEach((inc) => {
    if (inc.status !== 'cancelled' && (parseFloat(inc.deductionMinutes) || 0) > 0) {
      newDedMins += parseFloat(inc.deductionMinutes);
      newMoney += parseFloat(inc.penaltyAmount) || 0;
    }
  });

  const waivedMins = Math.max(0, prevDedMins - newDedMins);
  const waivedMoney = Math.max(0, Math.round((prevMoney - newMoney) * 100) / 100);

  const updatedState = {
    ...state,
    lateIncidents: updatedLateIncidents,
    requests: updatedRequests,
    _deletedIds: Array.from(tombstoneIds)
  };

  return {
    updatedState,
    summary: {
      employeeId: emp.id,
      employeeName: emp.name,
      previousIncidentsCount: prevEmpIncidents.length,
      newIncidentsCount: newIncidentsForEmp.length,
      eliminatedIncidentsCount: eliminatedOrWaivedIncidents.length,
      waivedDeductionMinutes: waivedMins,
      waivedAmount: waivedMoney,
      hasChanges: Boolean(eliminatedOrWaivedIncidents.length > 0 || waivedMins > 0 || Math.abs(prevDedMins - newDedMins) > 0)
    }
  };
}

/**
 * تسوية ذكية لعدة موظفين دفعة واحدة (Bulk Reconciliation)
 */
export function reconcileMultipleEmployeesScheduleChange({
  employeeIds = null,
  state,
  options = {}
}) {
  if (!state) return { updatedState: state, summary: { totalWaivedMinutes: 0, totalWaivedAmount: 0, affectedCount: 0 } };

  let currentState = state;
  let totalWaivedMinutes = 0;
  let totalWaivedAmount = 0;
  let affectedEmployees = [];

  const targetEmps = Array.isArray(employeeIds) && employeeIds.length > 0
    ? (state.employees || []).filter(e => employeeIds.map(String).includes(String(e.id)) || (e.code && employeeIds.map(String).includes(String(e.code))))
    : (state.employees || []);

  for (const emp of targetEmps) {
    if (!emp || !emp.id) continue;
    const { updatedState, summary } = reconcileEmployeeScheduleOrPunchChange({
      employeeId: emp.id,
      state: currentState,
      options
    });
    currentState = updatedState;
    if (summary.hasChanges) {
      totalWaivedMinutes += summary.waivedDeductionMinutes;
      totalWaivedAmount += summary.waivedAmount;
      affectedEmployees.push(summary);
    }
  }

  return {
    updatedState: currentState,
    summary: {
      totalWaivedMinutes,
      totalWaivedAmount: Math.round(totalWaivedAmount * 100) / 100,
      affectedCount: affectedEmployees.length,
      affectedEmployees
    }
  };
}
