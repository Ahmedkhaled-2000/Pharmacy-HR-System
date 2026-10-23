/**
 * payrollTimelineHelper.js
 * المحرك المركزي الموحد لبناء تسلسل أيام وورديات وراحات وإجازات الشهر بالكامل
 * 
 * المرجع الوحيد لضمان ظهور الشهر بالكامل بالتسلسل الزمني الدقيق (من اليوم الأول للدورة حتى اليوم الأخير)
 * دون إسقاط أي يوم، مع إظهار:
 * 1. ورديات العمل الفعلية وساعات الحضور والانصراف والإضافي.
 * 2. الراحات الأسبوعية المجدولة والتبديلات (مدفوعة ضمن الراتب).
 * 3. الإجازات المعتمدة (سنوية، مرضية، بدون أجر مع بيان السبب والخصم).
 * 4. الأيام السابقة لتاريخ التعيين الرسمي (خارج العمل).
 * 5. أيام الغياب غير المبرر والأيام المتبقية في الدورة.
 */

import { arabicWeekday, fmt, getEmployeeApprovedLeaves, getRealTodayStr } from './formatters.js';
import { getCycleDateRange } from './periodEngine.js';
import { getEmployeeDaySchedule } from './rosterEngine.js';
import { getShiftHoursMetrics, isApprovedPermissionForDate } from './latePenaltyEngine.js';
import { calculateRatesAndSalaries } from './branchMatcher.js';

export function buildEmployeeMonthTimeline({
  emp,
  month,
  state = {},
  startCutoff = '',
  endCutoff = '',
  selectedBranchId = null,
  hourlyRate: passedHourlyRate = null,
  dailyRate: passedDailyRate = null
}) {
  if (!emp) {
    return {
      rows: [],
      stats: {
        totalDays: 0,
        workedShiftsCount: 0,
        restDaysCount: 0,
        restDaysWorkCount: 0,
        leavesCount: 0,
        unpaidLeavesCount: 0,
        paidLeavesCount: 0,
        absenceDaysCount: 0,
        pendingDaysCount: 0,
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        totalPayableHours: 0
      }
    };
  }

  // 1. تحديد نطاق الدورة بدقة
  const effectiveCycle = (!startCutoff || !endCutoff) && month
    ? getCycleDateRange(month, state.orgSettings)
    : null;
  const cycleStart = startCutoff || effectiveCycle?.startDate || '';
  const cycleEnd = endCutoff || effectiveCycle?.endDate || '';

  const cycleDates = [];
  if (cycleStart && cycleEnd) {
    let cur = new Date(cycleStart + 'T00:00:00');
    const endD = new Date(cycleEnd + 'T00:00:00');
    if (!isNaN(cur.getTime()) && !isNaN(endD.getTime()) && cur <= endD) {
      while (cur <= endD) {
        const cy = cur.getFullYear();
        const cm = String(cur.getMonth() + 1).padStart(2, '0');
        const cd = String(cur.getDate()).padStart(2, '0');
        cycleDates.push(`${cy}-${cm}-${cd}`);
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  const today = getRealTodayStr();
  const rawHireDate = emp.hireDate || emp.hiring_date || emp.contractStartDate;
  const hireDate = rawHireDate ? String(rawHireDate).slice(0, 10) : '';

  // 2. تجميع الورديات الخاصة بالموظف في هذا النطاق
  const allShifts = state.shifts || [];
  const empIdStr = String(emp.id || '');
  const empCodeStr = emp.code ? String(emp.code) : '';

  const empShifts = allShifts.filter((s) => {
    if (!s || !s.date) return false;
    const matchEmp = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeId) === empCodeStr);
    if (!matchEmp) return false;
    if (selectedBranchId && String(s.branchId) !== String(selectedBranchId)) return false;
    if (cycleStart && cycleEnd) {
      return s.date >= cycleStart && s.date <= cycleEnd;
    }
    return month ? s.date.startsWith(month) : true;
  });

  // فهرسة الورديات حسب التاريخ (مع دعم الورديات المتعددة في نفس اليوم)
  const shiftsByDate = new Map();
  empShifts.forEach((s) => {
    if (!shiftsByDate.has(s.date)) {
      shiftsByDate.set(s.date, []);
    }
    shiftsByDate.get(s.date).push(s);
  });

  // 3. تجميع الإجازات المعتمدة للموظف
  const cycleFilterFn = (d) => {
    if (cycleStart && cycleEnd) return d >= cycleStart && d <= cycleEnd;
    return month ? d.startsWith(month) : true;
  };
  const empApprovedLeaves = getEmployeeApprovedLeaves(emp, state, cycleFilterFn);

  // فهرسة الإجازات حسب كل تاريخ يقع ضمن فترة الإجازة
  const leavesByDate = new Map();
  empApprovedLeaves.forEach((l) => {
    const lStart = l.startDate || l.date;
    const lEnd = l.endDate || l.date || lStart;
    if (!lStart || !lEnd) return;
    let cur = new Date(lStart + 'T00:00:00');
    const endD = new Date(lEnd + 'T00:00:00');
    if (isNaN(cur.getTime()) || isNaN(endD.getTime())) {
      if (cycleFilterFn(lStart)) leavesByDate.set(lStart, l);
      return;
    }
    while (cur <= endD) {
      const cy = cur.getFullYear();
      const cm = String(cur.getMonth() + 1).padStart(2, '0');
      const cd = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${cy}-${cm}-${cd}`;
      if (cycleFilterFn(dateStr)) {
        leavesByDate.set(dateStr, l);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  // حساب معدلات الأجر المعتمدة بدقة عبر المحرك المركزي calculateRatesAndSalaries
  const targetBranchDetails = selectedBranchId
    ? (emp.branchesDetails?.find((b) => String(b.branchId) === String(selectedBranchId)) || null)
    : (emp.branchesDetails?.[0] || null);
  const baseSalary = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(emp.salary) || 0);
  const workHoursPerDay = targetBranchDetails ? (parseFloat(targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(emp.workHoursPerDay) || 8);
  const workDaysPerMonth = targetBranchDetails ? (parseFloat(targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(emp.workDaysPerMonth) || 26);
  const breakHours = targetBranchDetails ? (parseFloat(targetBranchDetails.breakHours) || 0) : (parseFloat(emp.breakHours) || 0);

  const rates = calculateRatesAndSalaries({
    salaryInput: baseSalary,
    workHoursPerDay,
    workDaysPerMonth,
    breakHours
  });

  const hourlyRate = (passedHourlyRate !== null && passedHourlyRate !== undefined && passedHourlyRate > 0)
    ? parseFloat(passedHourlyRate)
    : (targetBranchDetails?.hourlyRateOverride || emp.hourlyRateOverride || rates.hourlyRate || 0);

  const dailyRate = (passedDailyRate !== null && passedDailyRate !== undefined && passedDailyRate > 0)
    ? parseFloat(passedDailyRate)
    : (rates.dailyRate || (hourlyRate * workHoursPerDay));

  // إحصائيات الدورة
  const stats = {
    totalDays: cycleDates.length,
    workedShiftsCount: 0,
    restDaysCount: 0,
    restDaysWorkCount: 0,
    leavesCount: 0,
    unpaidLeavesCount: 0,
    paidLeavesCount: 0,
    absenceDaysCount: 0,
    pendingDaysCount: 0,
    totalRegularHours: 0,
    totalOvertimeHours: 0,
    totalPayableHours: 0
  };

  const timelineRows = [];

  // 4. البناء المتسلسل الدقيق لكل يوم من اليوم #1 حتى نهاية الدورة
  cycleDates.forEach((dateStr, index) => {
    const seq = index + 1;
    const dayName = arabicWeekday(dateStr);
    const daySched = getEmployeeDaySchedule(emp.id, dateStr, state, selectedBranchId);

    // فحص الراحة المجدولة (من الجدول أو الإعدادات أو أيام الراحة المحددة)
    const isScheduledOff = Boolean(
      (daySched && (daySched.type === 'off' || daySched.isOff)) ||
      (Array.isArray(emp.weeklyRestDays) && emp.weeklyRestDays.some((d) => String(d).trim().replace(/[إأآ]/g, 'ا') === dayName.replace(/[إأآ]/g, 'ا')))
    );

    const dayShifts = shiftsByDate.get(dateStr);
    const dayLeave = leavesByDate.get(dateStr);

    // حالة 1: وجود وردية عمل فعلية مسجلة
    if (dayShifts && dayShifts.length > 0) {
      // نأخذ الوردية الأساسية أو ندمج
      dayShifts.forEach((s, shiftIdx) => {
        const isRejectedPhoto = Boolean(s.isRejectedPhoto || s.status === 'rejected_photo' || (typeof s.statusLabel === 'string' && s.statusLabel.includes('رفض الصورة')));
        const hasPerm = isApprovedPermissionForDate(emp.id, s.date, state);
        const shiftMetrics = getShiftHoursMetrics(s, state);
        const effHours = isRejectedPhoto ? 0 : shiftMetrics.regularHours;
        const otHours = shiftMetrics.overtimeHours;
        const isOtApproved = shiftMetrics.isOvertimeApproved;
        const otStatus = shiftMetrics.overtimeStatus;
        const totalShiftHours = isRejectedPhoto ? 0 : shiftMetrics.payableHours;
        const shiftRate = hourlyRate;
        const shiftEarnings = Math.round(totalShiftHours * shiftRate * 100) / 100;
        const isSwapped = Boolean(daySched && daySched.isSwapped);

        stats.workedShiftsCount += 1;
        if (isScheduledOff) {
          stats.restDaysWorkCount += 1;
        }
        stats.totalRegularHours += effHours;
        if (isOtApproved) {
          stats.totalOvertimeHours += otHours;
        }
        stats.totalPayableHours += totalShiftHours;

        let typeLabel = 'وردية عمل عادية';
        if (isScheduledOff) {
          typeLabel = 'وردية في يوم راحة أسبوعية (إضافي معتمد)';
        } else if (isSwapped) {
          typeLabel = `وردية متبدلة ${daySched?.swappedWithName ? `(مع ${daySched.swappedWithName})` : ''}`;
        }

        timelineRows.push({
          id: `shift_${s.id || s.date}_${shiftIdx}`,
          seq,
          date: dateStr,
          dayName,
          type: 'shift',
          isRestDayWork: isScheduledOff,
          isSwapped,
          swappedWithName: daySched?.swappedWithName || null,
          hasPerm,
          isRejectedPhoto,
          timeIn: s.timeIn || '—',
          timeOut: s.timeOut || '—',
          breakHours: parseFloat(s.breakHours) || 0,
          regularHours: effHours,
          effHours: effHours,
          overtimeHours: otHours,
          otHours: otHours,
          isOtApproved,
          otStatus,
          rejectedOtHours: parseFloat(s.rejectedOvertimeHours || 0) || 0,
          totalHours: totalShiftHours,
          totalShiftHours: totalShiftHours,
          earnings: isRejectedPhoto ? 0 : shiftEarnings,
          typeLabel,
          statusLabel: typeLabel,
          financialStatus: isRejectedPhoto ? '0.00 ج.م (رفض الصورة)' : `+${fmt(shiftEarnings)} ج.م`,
          effectLabel: isRejectedPhoto ? '0.00 ج.م (رفض الصورة)' : `+${fmt(shiftEarnings)} ج.م`,
          effectColor: isRejectedPhoto ? '#dc2626' : '#0f766e',
          reason: isScheduledOff ? 'عمل خلال يوم راحة أسبوعية مجدولة - احتساب الساعات كإضافي معتمد' : (s.notes || s.details || ''),
          shiftObj: s,
          daySched
        });
      });
      return;
    }

    // حالة 2: وجود إجازة رسمية معتمدة (سنوية / مرضية / بدون أجر)
    if (dayLeave) {
      const isWeeklyRest = dayLeave.leaveType === 'weekly_rest' || dayLeave.type === 'weekly_rest';
      const isUnpaid = !isWeeklyRest && (dayLeave.leaveType === 'unpaid' || dayLeave.type === 'unpaid_leave' || dayLeave.isUnpaid === true);
      const isSick = !isWeeklyRest && (dayLeave.leaveType === 'sick' || dayLeave.type === 'sick_leave');
      const isAnnual = !isWeeklyRest && !isUnpaid && !isSick;

      stats.leavesCount += 1;
      if (isUnpaid) {
        stats.unpaidLeavesCount += 1;
      } else {
        stats.paidLeavesCount += 1;
      }

      const singleDayDeduction = 0;
      let typeLabel = isUnpaid ? 'إجازة بدون أجر' : (isSick ? 'إجازة مرضية معتمدة' : (isWeeklyRest ? 'راحة أسبوعية معتمدة' : 'إجازة سنوية اعتيادية'));
      let financialStatus = isUnpaid ? 'غير مدفوعة (لا يُحتسب أجر أو ساعات اليوم)' : 'مدفوعة الأجر بالكامل';
      let effectColor = isUnpaid ? '#64748b' : (isSick ? '#b45309' : (isWeeklyRest ? '#0284c7' : '#15803d'));
      let reasonText = dayLeave.reason || dayLeave.details || dayLeave.notes || (isAnnual ? 'إجازة سنوية اعتيادية معتمدة' : (isUnpaid ? 'إجازة بدون أجر معتمدة' : 'إجازة مرضية'));

      timelineRows.push({
        id: `leave_${dayLeave.id}_${dateStr}`,
        seq,
        date: dateStr,
        dayName,
        type: 'leave',
        leaveType: isUnpaid ? 'unpaid' : (isSick ? 'sick' : (isWeeklyRest ? 'weekly_rest' : 'annual')),
        isUnpaid,
        timeIn: '—',
        timeOut: '—',
        breakHours: 0,
        regularHours: 0,
        effHours: 0,
        overtimeHours: 0,
        otHours: 0,
        isOtApproved: false,
        otStatus: 'none',
        totalHours: 0,
        totalShiftHours: 0,
        earnings: 0,
        typeLabel,
        statusLabel: typeLabel,
        financialStatus,
        effectLabel: financialStatus,
        effectColor,
        reason: reasonText,
        leaveObj: dayLeave,
        daySched
      });
      return;
    }

    // حالة 3: الأيام السابقة لتاريخ التعيين الرسمي (خارج العمل)
    if (hireDate && dateStr < hireDate) {
      timelineRows.push({
        id: `prehire_${dateStr}`,
        seq,
        date: dateStr,
        dayName,
        type: 'pre_hire',
        timeIn: '—',
        timeOut: '—',
        breakHours: 0,
        regularHours: 0,
        effHours: 0,
        overtimeHours: 0,
        otHours: 0,
        isOtApproved: false,
        otStatus: 'none',
        totalHours: 0,
        totalShiftHours: 0,
        earnings: 0,
        typeLabel: 'خارج العمل (قبل تاريخ التعيين)',
        statusLabel: 'خارج العمل (قبل تاريخ التعيين)',
        financialStatus: 'غير مدفوعة (قبل مباشرة العمل)',
        effectLabel: 'غير مدفوعة (قبل مباشرة العمل)',
        effectColor: '#64748b',
        reason: `يوم يسبق تاريخ التعيين الرسمي ومباشرة العمل (${hireDate})`,
        daySched
      });
      return;
    }

    // حالة 4: راحة أسبوعية مجدولة أو راحة متبدلة معتمدة
    if (isScheduledOff) {
      stats.restDaysCount += 1;
      const isSwapRest = Boolean(daySched && daySched.isSwapped);
      const swapPartner = daySched?.swappedWithName || null;

      timelineRows.push({
        id: `rest_${dateStr}`,
        seq,
        date: dateStr,
        dayName,
        type: 'rest',
        isSwapped: isSwapRest,
        swappedWithName: swapPartner,
        timeIn: '—',
        timeOut: '—',
        breakHours: 0,
        regularHours: 0,
        effHours: 0,
        overtimeHours: 0,
        otHours: 0,
        isOtApproved: false,
        otStatus: 'none',
        totalHours: 0,
        totalShiftHours: 0,
        earnings: 0,
        typeLabel: isSwapRest ? `راحة متبدلة مع ${swapPartner || 'الزميل'}` : 'راحة أسبوعية مجدولة',
        statusLabel: isSwapRest ? `راحة متبدلة مع ${swapPartner || 'الزميل'}` : 'راحة أسبوعية مجدولة',
        financialStatus: 'مدفوعة (ضمن الراتب الأساسي)',
        effectLabel: 'مدفوعة (ضمن الراتب الأساسي)',
        effectColor: isSwapRest ? '#d97706' : '#0284c7',
        reason: daySched?.swapNote || (emp.noMonthlySchedule ? 'يوم راحة أسبوعية محدد للموظف' : 'يوم راحة أسبوعية مجدولة بالجدول الشهري'),
        daySched
      });
      return;
    }

    // حالة 5: يوم عمل مجدول ولكن بدون حضور أو إجازة
    if (dateStr < today) {
      // منقضي = غياب بدون إذن
      stats.absenceDaysCount += 1;
      const shiftBranch = daySched?.branchId ? (daySched.branchName || `فرع ${daySched.branchId}`) : '';
      const shiftTime = (daySched?.start && daySched?.end) ? `${daySched.start} - ${daySched.end}` : 'وردية كاملة';

      timelineRows.push({
        id: `abs_${dateStr}`,
        seq,
        date: dateStr,
        dayName,
        type: 'absence',
        timeIn: '—',
        timeOut: '—',
        breakHours: 0,
        regularHours: 0,
        effHours: 0,
        overtimeHours: 0,
        otHours: 0,
        isOtApproved: false,
        otStatus: 'none',
        totalHours: 0,
        totalShiftHours: 0,
        earnings: -dailyRate,
        typeLabel: '🚫 غياب بدون إذن رسمي',
        statusLabel: '🚫 غياب بدون إذن رسمي',
        financialStatus: `مخصوم (-${fmt(dailyRate)} ج.م)`,
        effectLabel: `مخصوم (-${fmt(dailyRate)} ج.م)`,
        effectColor: '#dc2626',
        reason: daySched?.isSwapped
          ? `غياب عن وردية متبدلة معتمدة (${shiftTime}) لتغطية ${daySched.swappedWithName || 'الزميل'}`
          : `غياب عن وردية عمل مجدولة (${shiftTime}${shiftBranch ? ` - ${shiftBranch}` : ''}) لعدم تسجيل بصمة أو تقديم إجازة`,
        daySched
      });
      return;
    }

    // حالة 6: اليوم الحالي أو يوم قادم في الدورة
    stats.pendingDaysCount += 1;
    timelineRows.push({
      id: `pending_${dateStr}`,
      seq,
      date: dateStr,
      dayName,
      type: 'pending',
      timeIn: '—',
      timeOut: '—',
      breakHours: 0,
      regularHours: 0,
      effHours: 0,
      overtimeHours: 0,
      otHours: 0,
      isOtApproved: false,
      otStatus: 'none',
      totalHours: 0,
      totalShiftHours: 0,
      earnings: 0,
      typeLabel: dateStr === today ? '⏳ اليوم الحالي بالدورة' : '⏳ يوم قادم في دورة الرواتب',
      statusLabel: dateStr === today ? '⏳ اليوم الحالي بالدورة' : '⏳ يوم قادم في دورة الرواتب',
      financialStatus: '— (في انتظار التسجيل)',
      effectLabel: '— (في انتظار التسجيل)',
      effectColor: '#64748b',
      reason: (daySched?.start && daySched?.end) ? `وردية مجدولة: ${daySched.start} – ${daySched.end}` : 'يوم عمل متبقي في الدورة',
      daySched
    });
  });

  return {
    rows: timelineRows,
    stats,
    cycleDates,
    cycleRange: {
      startDate: cycleStart,
      endDate: cycleEnd,
      daysCount: cycleDates.length
    }
  };
}
