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

import { arabicWeekday } from './formatters';

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
  const tiers = policy?.tiers || DEFAULT_LATE_PENALTY_POLICY.tiers;

  for (const tier of tiers) {
    const min = tier.minMinutes !== undefined ? tier.minMinutes : 0;
    const max = tier.maxMinutes !== undefined ? tier.maxMinutes : 9999;
    if (minutes >= min && minutes <= max) {
      return tier;
    }
  }

  // إذا تجاوزت كل الحدود، نرجع الفئة الأخيرة
  return tiers[tiers.length - 1] || DEFAULT_LATE_PENALTY_POLICY.tiers[4];
}

/**
 * جلب الجزاء المقابل لرقم التكرار داخل الفئة
 */
export function getPenaltyForOccurrence(tier, occurrenceNumber) {
  if (!tier || !tier.penalties || !tier.penalties.length) {
    return { occurrence: occurrenceNumber, action: 'grace', label: 'سماح', deductionMinutes: 0 };
  }

  const occ = Math.max(1, parseInt(occurrenceNumber, 10) || 1);
  const exact = tier.penalties.find((p) => p.occurrence === occ);
  if (exact) return exact;

  // جلب قاعدة التكرار الأخير (السادسة فأكثر أو أعلى تكرار معرف)
  const defaultBeyond = tier.penalties.find((p) => p.isDefaultBeyond);
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

  const allReqs = [
    ...(state.requests || []),
    ...(state.permissions || []),
    ...(state.employeePermissions || [])
  ];

  return allReqs.find((r) => {
    if (!r) return false;
    const rEmpId = String(r.employeeId || r.empId || '');
    if (rEmpId !== empIdStr) return false;

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
      r.isCancelled === true;

    return isApproved && !isRejected;
  }) || null;
}

/**
 * استخراج بداية الشيفت المجدول للموظف لتاريخ معين من الجداول الشهرية المعتمدة
 */
export function getScheduledShiftForDate(employeeId, dateStr, state) {
  if (!employeeId || !dateStr || !state) return null;

  const empIdStr = String(employeeId);
  const monthKey = String(dateStr).slice(0, 7);

  // 1. فحص طلبات تبديل الورديات المعتمدة أولاً
  const approvedSwaps = (state.shiftSwaps || state.requests || []).filter(
    (s) => (s.type === 'shift_swap' || s.subType === 'shift_swap') &&
      (s.status === 'approved' || s.adminApproved) &&
      s.date === dateStr &&
      (String(s.requesterId || s.employeeId) === empIdStr || String(s.targetEmployeeId) === empIdStr)
  );

  if (approvedSwaps.length > 0) {
    const swap = approvedSwaps[0];
    if (String(swap.requesterId || swap.employeeId) === empIdStr && swap.targetSchedule) {
      return {
        start: swap.targetSchedule.start,
        end: swap.targetSchedule.end,
        type: swap.targetSchedule.type || 'shift',
        branchId: swap.targetBranchId || swap.branchId,
        source: 'swap'
      };
    }
  }

  // 2. البحث في الجداول الشهرية المعتمدة
  const approvedRosters = (state.rosters || []).filter(
    (r) => String(r.employeeId) === empIdStr && (r.month === monthKey || !r.month) && (r.status === 'approved' || !r.status)
  );

  const arDay = arabicWeekday(dateStr);
  const normalizedArDay = arDay.replace(/[\u0625\u0623\u0622]/g, 'ا');

  for (const ros of approvedRosters) {
    if (ros.schedule) {
      let sched = ros.schedule[arDay];
      if (!sched) {
        sched = Object.entries(ros.schedule).find(
          ([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normalizedArDay
        )?.[1];
      }

      if (sched && sched.type !== 'off' && sched.start) {
        return {
          start: sched.start,
          end: sched.end || '',
          type: sched.type || 'work',
          branchId: ros.branchId || sched.branchId || '',
          rosterId: ros.id,
          source: 'roster'
        };
      }
    }
  }

  // 3. فحص طلبات تعديل الروستر المعتمدة في requests
  const approvedRosterReqs = (state.requests || []).filter(
    (r) => String(r.employeeId) === empIdStr &&
      (r.type === 'roster_edit' || r.type === 'roster_update' || r.type === 'roster_edit_request') &&
      (r.month === monthKey || !r.month) &&
      (r.status === 'approved' || r.adminApproved) &&
      r.schedule
  );

  for (const req of approvedRosterReqs) {
    let sched = req.schedule[arDay];
    if (!sched) {
      sched = Object.entries(req.schedule).find(
        ([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normalizedArDay
      )?.[1];
    }
    if (sched && sched.type !== 'off' && sched.start) {
      return {
        start: sched.start,
        end: sched.end || '',
        type: sched.type || 'work',
        branchId: req.branchId || sched.branchId || '',
        rosterId: req.id,
        source: 'roster_request'
      };
    }
  }

  // 4. فحص الجداول العامة للموظف كـ Fallback في حال اختلاف اسم الشهر
  const anyEmpRoster = (state.rosters || []).find(
    (r) => String(r.employeeId) === empIdStr && (r.status === 'approved' || !r.status) && r.schedule
  );
  if (anyEmpRoster && anyEmpRoster.schedule) {
    let sched = anyEmpRoster.schedule[arDay];
    if (!sched) {
      sched = Object.entries(anyEmpRoster.schedule).find(
        ([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === normalizedArDay
      )?.[1];
    }
    if (sched && sched.type !== 'off' && sched.start) {
      return {
        start: sched.start,
        end: sched.end || '',
        type: sched.type || 'work',
        branchId: anyEmpRoster.branchId || sched.branchId || '',
        rosterId: anyEmpRoster.id,
        source: 'roster_fallback'
      };
    }
  }

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

  return Math.max(0, actualTotalMins - schedTotalMins);
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
  const emp = (state.employees || []).find((e) => String(e.id) === empIdStr);
  if (!emp) return { incidents: [], updatedRequests: state.requests || [] };

  const policy = getEffectiveLatePolicy(state);
  if (!policy.enabled) return { incidents: [], updatedRequests: state.requests || [] };

  // 1. جلب جميع الورديات المسجلة للموظف في الدورة مرتبة تصاعدياً
  const empShifts = (state.shifts || [])
    .filter((s) => String(s.employeeId) === empIdStr && (!cycleFilterFn || cycleFilterFn(s.date)))
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
  const existingIncidentsMap = new Map((state.lateIncidents || []).map((inc) => [inc.id, inc]));

  // جلب كافة طلبات الأذونات المعتمدة للموظف (إذن تأخير / إذن خروج مبكر / إذن عام)
  const approvedPermissions = (state.requests || []).filter(
    (r) =>
      String(r.employeeId) === empIdStr &&
      (r.type === 'permission' || r.type === 'إذن' || r.type === 'late_permission' || r.type === 'early_leave') &&
      (r.status === 'approved' || r.adminApproved === true || (r.branchApproved && r.status !== 'rejected' && !r.isRejected)) &&
      r.status !== 'rejected' &&
      r.status !== 'cancelled'
  );

  for (const shift of empShifts) {
    if (!shift.date || !shift.timeIn) continue;

    // استخراج بداية الشيفت المجدول
    const sched = getScheduledShiftForDate(emp.id, shift.date, state);
    if (!sched || !sched.start) continue;

    const diffMinutes = calculateLatenessMinutes(sched.start, shift.timeIn);
    if (diffMinutes <= 0) continue; // حضور في الموعد أو مبكر

    // تحديد الفئة
    const tier = classifyLateTier(diffMinutes, policy);
    const tierKey = tier.id;

    // فحص ما إذا كان هناك إذن معتمد للموظف في هذا التاريخ
    const approvedPerm = isApprovedPermissionForDate(emp.id, shift.date, state);

    const incId = `late_inc_${emp.id}_${shift.date}_${shift.timeIn.replace(':', '')}`;
    const prevInc = existingIncidentsMap.get(incId);

    const effectiveShiftBranchId = shift.branchId || sched.branchId || emp.branchId;
    const branchObj = (state.branches || []).find((b) => b.id === effectiveShiftBranchId);
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    let occurrenceNumber = 0;
    let actionType = 'grace';
    let actionLabel = 'سماح';
    let deductionMins = 0;
    let penaltyAmount = 0;
    let status = 'approved';
    let overrideReason = '';

    if (approvedPerm) {
      // ✅ تم إلغاء الخصم والجزاء لوجود إذن معتمد رسمي
      actionType = 'grace';
      actionLabel = `سماح (${approvedPerm.permType === 'early' ? 'إذن خروج مبكر معتمد' : 'إذن تأخير معتمد'})`;
      deductionMins = 0;
      penaltyAmount = 0;
      status = 'approved_permission_exempt';
      overrideReason = `تم إلغاء الجزاء والخصم تلقائياً لوجود إذن معتمد (${approvedPerm.permType === 'early' ? 'إذن خروج مبكر' : 'إذن تأخير'} من ${approvedPerm.startTime || '—'} إلى ${approvedPerm.endTime || '—'})${approvedPerm.reason ? ' - سبب الإذن: ' + approvedPerm.reason : ''}`;
      occurrenceNumber = 0; // لا يتم احتسابها كواقعة جزائية غير مبررة
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
      status = prevInc?.status && prevInc.status !== 'pending' ? prevInc.status : 'approved';
      overrideReason = prevInc?.overrideReason || '';
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
      overrideReason: overrideReason,
      permissionRequestId: approvedPerm ? approvedPerm.id : null,
      read: prevInc ? Boolean(prevInc.read) : false,
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
    (r) => !(String(r.employeeId) === empIdStr && (r.subType === 'lateness' || r.type === 'late_penalty') && (!cycleFilterFn || cycleFilterFn(r.date)))
  );

  const newLateRequests = newIncidents
    .filter((inc) => inc.status !== 'approved_permission_exempt' && inc.actionType !== 'grace' && (inc.deductionMinutes > 0 || inc.penaltyAmount > 0))
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
    source: 'late_penalty_engine'
  }));

  return {
    incidents: newIncidents,
    updatedRequests: [...newLateRequests, ...otherReqs]
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
 * حساب صافي الساعات الفعلية المستحقة للوردية مع خصم ساعات البريك وتعويض ساعات الإذن المعتمد بالكامل
 */
export function getEffectiveShiftHours(shift, state) {
  if (!shift) return 0;
  
  // Find employee to check default break hours if shift.breakHours is not explicitly set
  const emp = (state?.employees || []).find(
    (e) => String(e.id) === String(shift.employeeId) || (shift.employeeCode && String(e.code) === String(shift.employeeCode))
  );
  const empBreak = emp?.breakHours || emp?.defaultBreakHours || (emp?.branchesDetails && emp.branchesDetails[0]?.breakHours) || 0;
  const breakHours = Math.max(0, parseFloat(shift.breakHours !== undefined && shift.breakHours !== null ? shift.breakHours : empBreak) || 0);

  // 1. حساب الساعات الفعلية المجردة من أوقات الدخول والخروج مع خصم ساعات البريك
  let rawHours = -1;
  const timeIn = shift.timeIn || shift.checkIn || shift.inTime || shift.startTime;
  const timeOut = shift.timeOut || shift.checkOut || shift.outTime || shift.endTime;

  if (timeIn && timeOut && String(timeOut).trim() !== '' && String(timeOut).trim() !== '—') {
    const [inH, inM] = String(timeIn).split(':').map(Number);
    const [outH, outM] = String(timeOut).split(':').map(Number);
    if (!isNaN(inH) && !isNaN(outH)) {
      let start = inH * 60 + (inM || 0);
      let end = outH * 60 + (outM || 0);
      if (end <= start) end += 24 * 60;
      const totalHours = (end - start) / 60;
      rawHours = Math.max(0, Math.round((totalHours - breakHours) * 100) / 100);
    }
  }
  
  if (rawHours < 0) {
    const base = parseFloat(
      shift._baseRawHours !== undefined
        ? shift._baseRawHours
        : shift.actualWorkedHours !== undefined
        ? shift.actualWorkedHours
        : shift.netHours !== undefined
        ? shift.netHours
        : shift.hours !== undefined
        ? shift.hours
        : shift.workHours || 0
    ) || 0;
    rawHours = (shift.actualWorkedHours !== undefined || shift.netHours !== undefined)
      ? Math.max(0, base)
      : Math.max(0, Math.round((base - breakHours) * 100) / 100);
  }

  // 2. فحص الإذن المعتمد لهذا اليوم
  const perm = isApprovedPermissionForDate(shift.employeeId, shift.date, state);
  let permHours = 0;
  if (perm) {
    permHours = parseFloat(perm.hours) || 0;
    if (!permHours && perm.durationMinutes) {
      permHours = Math.round((perm.durationMinutes / 60) * 100) / 100;
    }
    if (!permHours && perm.startTime && perm.endTime) {
      const [h1, m1] = perm.startTime.split(':').map(Number);
      const [h2, m2] = perm.endTime.split(':').map(Number);
      let diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
      if (diff <= 0) diff += 24 * 60;
      permHours = Math.round((diff / 60) * 100) / 100;
    }
  } else if (shift.permissionHours) {
    permHours = parseFloat(shift.permissionHours) || 0;
  }

  if (permHours > 0) {
    // تعويض ساعات الإذن المعتمد فوق ساعات العمل الفعلية (مع بقاء خصم البريك سارياً على ساعات الحضور)
    return Math.round((rawHours + permHours) * 100) / 100;
  }

  // إذا كانت الوردية تحتوي على وقت إضافي، نعتمد الساعات الأساسية المقررة (regularHours)
  // لكي لا يتم صرف الإضافي تلقائياً قبل اعتماد الإدارة، وتجنباً للازدواج المالي عند صرفه في بند الوقت الإضافي
  if ((parseFloat(shift.overtimeHours) > 0 || shift.overtimeStatus) && shift.regularHours !== undefined) {
    return parseFloat(shift.regularHours) || 0;
  }

  return Math.round(rawHours * 100) / 100;
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
      let diff = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
      if (diff <= 0) diff += 24 * 60;
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
  const employees = state.employees || [];

  for (const emp of employees) {
    try {
      const { incidents } = recalculateEmployeeCycleLateness({
        employeeId: emp.id,
        cycleFilterFn: null,
        state: stateWithShifts,
        payrollCycleId: new Date().toISOString().slice(0, 7)
      });
      allIncidents.push(...incidents);
    } catch (e) {
      console.error(`Error recalculating for emp ${emp.id}:`, e);
    }
  }

  return {
    ...stateWithShifts,
    lateIncidents: allIncidents
  };
}
