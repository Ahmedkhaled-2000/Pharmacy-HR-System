import { fmt, todayStr } from './formatters';
import { getEffectiveShiftHours, computeLatenessFinancialAmount, isApprovedPermissionForDate } from './latePenaltyEngine';
import { isManagementJob, getJobsList } from './jobsHelper';

/**
 * دالة مساعدة لحساب واستخراج فترة وتواريخ دورة الرواتب الدقيقة وفقاً لإعدادات المنظومة
 */
export function getPayrollCycleForDate(refDate = todayStr(), orgSettings = {}) {
  const pType = orgSettings?.payrollPeriodType || 'cycle';
  const customFrom = orgSettings?.payrollCustomFrom || '';
  const customTo = orgSettings?.payrollCustomTo || '';

  if (pType === 'custom' && customFrom && customTo) {
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    return {
      startDate: from,
      endDate: to,
      cycleMonth: from.slice(0, 7),
      periodType: 'custom',
      label: `فترة مخصصة: من ${from} إلى ${to}`
    };
  }

  const sDay = orgSettings?.payrollPayoutStartDay !== undefined ? parseInt(orgSettings.payrollPayoutStartDay, 10) : 21;
  const eDay = orgSettings?.payrollPayoutEndDay !== undefined ? parseInt(orgSettings.payrollPayoutEndDay, 10) : 20;

  const targetDate = new Date(refDate);
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth() + 1; // 1-12
  const day = targetDate.getDate();

  let startYear = y;
  let startMonth = m;
  let endYear = y;
  let endMonth = m;

  if (sDay <= eDay) {
    // دورة في نفس الشهر التقويمي (مثلاً من 1 إلى 30)
    startMonth = m;
    endMonth = m;
  } else {
    // دورة متداخلة بين شهرين (مثلاً من 21 في الشهر السابق إلى 20 في الشهر الحالي)
    if (day >= sDay) {
      startMonth = m;
      startYear = y;
      endMonth = m + 1;
      if (endMonth > 12) {
        endMonth = 1;
        endYear = y + 1;
      }
    } else {
      endMonth = m;
      endYear = y;
      startMonth = m - 1;
      if (startMonth < 1) {
        startMonth = 12;
        startYear = y - 1;
      }
    }
  }

  const startDateStr = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(sDay).padStart(2, '0')}`;
  const endDateStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
  const cycleMonthStr = `${endYear}-${String(endMonth).padStart(2, '0')}`;

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    cycleMonth: cycleMonthStr,
    periodType: 'cycle',
    startDay: sDay,
    endDay: eDay,
    label: `من ${startDateStr} إلى ${endDateStr}`
  };
}

/**
 * حساب التصفية والمخالصة المالية الشاملة للموظف عند إنهاء الخدمة
 * تشمل:
 * 1. المستحقات المكتسبة (ساعات عمل أساسية + وقت إضافي معتمد + بدلات + مكافآت)
 * 2. كامل الالتزامات والديون (كامل رصيد السلف والأدوية المتبقي بالكامل + الخصومات + الجزاءات + الغياب)
 * 3. صافي مستحقات نهاية الخدمة والتصفية
 * 4. سجل الحضور والبصمات التفصيلي لدورة التصفية
 */
export function computeEmployeeFinalSettlement(empId, state, terminationDate = null) {
  if (!empId || !state) return null;

  const emp = (state.employees || []).find((e) => String(e.id) === String(empId));
  if (!emp) return null;

  const termDate = terminationDate || todayStr();
  const orgSettings = state.orgSettings || {};
  const payrollCycle = getPayrollCycleForDate(termDate, orgSettings);

  // الفروع والرواتب
  const branches = (emp.branchesDetails && emp.branchesDetails.length > 0)
    ? emp.branchesDetails
    : [{
        branchId: emp.branchId || 'main',
        salary: emp.salary || 0,
        workHoursPerDay: emp.workHoursPerDay || 8,
        workDaysPerMonth: emp.workDaysPerMonth || 26
      }];

  let totalRegularHours = 0;
  let totalApprovedOvertimeHours = 0;
  let totalPendingOvertimeHours = 0;
  let totalBaseEarnings = 0;
  let totalOvertimeEarnings = 0;
  const branchBreakdown = [];
  const cycleShiftsDetails = [];

  branches.forEach((b) => {
    const bId = b.branchId;
    const hourlyBase = parseFloat(b.salary) || 0;
    const workHoursPerDay = parseFloat(b.workHoursPerDay) || 8;
    const workDaysPerMonth = parseFloat(b.workDaysPerMonth) || 26;

    const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
    const rate = (hourlyBase > 0 && workDaysPerMonth > 0)
      ? (hourlyBase >= 200 ? (hourlyBase / workDaysPerMonth) : ((hourlyBase * workHoursPerDay) / workDaysPerMonth))
      : (workHoursPerDay > 0 ? dailyRate / workHoursPerDay : hourlyBase);

    // Shifts for this branch strictly within payroll cycle up to termination date
    const bShifts = (state.shifts || []).filter(
      (s) =>
        String(s.employeeId) === String(empId) &&
        (s.date >= payrollCycle.startDate && s.date <= termDate) &&
        (s.branchId === bId || !s.branchId || branches.length === 1)
    ).sort((a, b) => (a.date > b.date ? 1 : -1));

    const regularHours = bShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);

    const approvedOtHours = bShifts
      .filter((s) => s.overtimeStatus === 'approved' || (parseFloat(s.overtimeHours) > 0 && s.adminApproved))
      .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

    const pendingOtHours = bShifts
      .filter((s) => s.overtimeStatus === 'pending' || (parseFloat(s.overtimeHours) > 0 && !s.overtimeStatus && !s.adminApproved))
      .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

    const baseEarn = Math.round(regularHours * rate * 100) / 100;
    const otEarn = Math.round(approvedOtHours * rate * 100) / 100;

    totalRegularHours += regularHours;
    totalApprovedOvertimeHours += approvedOtHours;
    totalPendingOvertimeHours += pendingOtHours;
    totalBaseEarnings += baseEarn;
    totalOvertimeEarnings += otEarn;

    const bObj = (state.branches || []).find((br) => String(br.id) === String(bId));
    const branchName = bObj?.name || (bId === 'main' ? 'المركز الرئيسي' : `فرع ${bId}`);

    // Map shifts for attendance log table
    bShifts.forEach((s) => {
      let dayName = '—';
      try {
        const dObj = new Date(s.date + 'T00:00:00');
        dayName = dObj.toLocaleDateString('ar-EG', { weekday: 'long' });
      } catch {}

      cycleShiftsDetails.push({
        id: s.id,
        date: s.date,
        dayName,
        branchName,
        checkIn: s.checkIn || s.actualCheckIn || s.scheduledCheckIn || s.startTime || '—',
        checkOut: s.checkOut || s.actualCheckOut || s.scheduledCheckOut || s.endTime || '—',
        regularHours: getEffectiveShiftHours(s, state),
        overtimeHours: parseFloat(s.overtimeHours) || 0,
        isOvertimeApproved: s.overtimeStatus === 'approved' || Boolean(s.adminApproved),
        delayMinutes: parseInt(s.delayMinutes || s.lateMinutes || 0, 10),
        status: s.status || (s.adminApproved ? 'معتمد' : 'مكتمل')
      });
    });

    branchBreakdown.push({
      branchId: bId,
      branchName,
      hourlyRate: rate,
      regularHours,
      approvedOtHours,
      baseEarnings: baseEarn,
      overtimeEarnings: otEarn,
      shiftCount: bShifts.length
    });
  });

  // البدلات
  const isMgmt = isManagementJob(emp.jobTitle, getJobsList(state)) || Boolean(emp.isManagement) || (parseFloat(emp.managementAllowance) || 0) > 0;
  const managementAllowance = parseFloat(emp.managementAllowance) || 0;
  const transportAllowance = parseFloat(emp.transportAllowance) || 0;

  let extraAllowance = parseFloat(emp.extraAllowance) || 0;
  let extraAllowanceTitle = emp.extraAllowanceTitle?.trim() || 'أجر إضافي';
  let extraAllowancesList = [];

  if (Array.isArray(emp.extraAllowances) && emp.extraAllowances.length > 0) {
    extraAllowancesList = emp.extraAllowances
      .map((a) => ({
        id: a.id,
        title: a.title?.trim() || 'أجر إضافي',
        amount: parseFloat(a.amount) || 0
      }))
      .filter((a) => a.amount > 0 || a.title);
    extraAllowance = extraAllowancesList.reduce((acc, a) => acc + (a.amount || 0), 0);
    extraAllowanceTitle = extraAllowancesList.map((a) => a.title).join(' + ') || extraAllowanceTitle;
  } else if (extraAllowance > 0) {
    extraAllowancesList = [{ id: '1', title: extraAllowanceTitle, amount: extraAllowance }];
  }

  const totalAllowances = managementAllowance + transportAllowance + extraAllowance;

  // المكافآت المسجلة خلال الدورة
  const allAdjs = [...(state.adjustments || []), ...(state.requests || [])].filter(
    (a) =>
      String(a.employeeId) === String(empId) &&
      (a.date ? (a.date >= payrollCycle.startDate && a.date <= termDate) : true) &&
      (a.status === 'approved' || a.adminApproved || !a.status) &&
      a.status !== 'rejected' &&
      a.status !== 'cancelled'
  );

  const bonusesList = allAdjs
    .filter((a) => a.type === 'bonus' || a.subType === 'bonus')
    .map((b) => ({
      id: b.id,
      title: b.description || b.reason || b.title || 'مكافأة تميز',
      amount: parseFloat(b.amount) || 0,
      date: b.date || termDate
    }))
    .filter((b) => b.amount > 0);

  const totalBonus = bonusesList.reduce((acc, b) => acc + b.amount, 0);

  // إجمالي الاستحقاقات
  const totalEarnings = totalBaseEarnings + totalOvertimeEarnings + totalAllowances + totalBonus;

  // ── الاستقطاعات والديون المتبقية ──

  // 1. كامل رصيد السلف والقروض والأدوية المتبقي بالكامل (وليس قسط الشهر فقط)
  const allLoansRaw = [...(state.loans || []), ...(state.requests || [])];
  const activeLoans = allLoansRaw
    .filter(
      (l) =>
        String(l.employeeId) === String(empId) &&
        (l.status === 'approved' || l.adminApproved || l.status === 'partial') &&
        (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine')
    )
    .map((l) => {
      const originalAmount = parseFloat(l.amount) || 0;
      const paidAmount = parseFloat(l.paidAmount) || 0;
      const remainingBalance = Math.max(0, originalAmount - paidAmount);
      return {
        id: l.id,
        type: l.type === 'meds' || l.type === 'credit_medicine' ? 'مشتريات أدوية بالآجل' : 'سلفة نقدية',
        originalAmount,
        paidAmount,
        remainingBalance,
        date: l.date || l.createdAt?.slice(0, 10) || '—',
        notes: l.notes || l.reason || ''
      };
    })
    .filter((l) => l.remainingBalance > 0);

  const totalRemainingLoansDebt = activeLoans.reduce((acc, l) => acc + l.remainingBalance, 0);

  // 2. خصومات التأخير اللائحي خلال الدورة
  const empLateIncidents = (state.lateIncidents || []).filter(
    (inc) =>
      String(inc.employeeId) === String(empId) &&
      inc.status !== 'cancelled' &&
      inc.status !== 'approved_permission_exempt' &&
      inc.actionType !== 'grace' &&
      !isApprovedPermissionForDate(empId, inc.date, state) &&
      (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
      (inc.date ? (inc.date >= payrollCycle.startDate && inc.date <= termDate) : true)
  );

  const lateDeduction = empLateIncidents.reduce((acc, inc) => {
    const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
    return acc + (dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0));
  }, 0);

  const lateDeductionMinutes = empLateIncidents.reduce((acc, inc) => acc + (parseFloat(inc.deductionMinutes) || 0), 0);

  // 3. الخصومات والجزاءات اليدوية خلال الدورة
  const manualDeductionsList = allAdjs
    .filter((a) => a.type === 'deduction' || a.type === 'penalty' || a.subType === 'deduction' || a.subType === 'penalty')
    .map((d) => ({
      id: d.id,
      title: d.description || d.reason || d.title || 'خصم إداري',
      amount: parseFloat(d.amount) || 0,
      date: d.date || termDate
    }))
    .filter((d) => d.amount > 0);

  const manualDeduction = manualDeductionsList.reduce((acc, d) => acc + d.amount, 0);

  // 4. إجمالي الاستقطاعات والديون
  const totalDeductions = totalRemainingLoansDebt + lateDeduction + manualDeduction;

  // 5. صافي التصفية والمخالصة النهائية
  const netSettlement = Math.round((totalEarnings - totalDeductions) * 100) / 100;
  const isPayableToEmployee = netSettlement >= 0;

  return {
    empId,
    empCode: emp.code,
    empName: emp.name,
    jobTitle: emp.jobTitle,
    phone: emp.phone,
    nationalId: emp.nationalId || emp.national_id || '—',
    hireDate: emp.hireDate || emp.hiring_date || '—',
    terminationDate: termDate,
    currentMonthStr: payrollCycle.cycleMonth,
    payrollCycle,
    cycleShiftsDetails,
    
    // Earnings
    totalRegularHours,
    totalApprovedOvertimeHours,
    totalPendingOvertimeHours,
    totalBaseEarnings,
    totalOvertimeEarnings,
    managementAllowance,
    transportAllowance,
    extraAllowance,
    extraAllowanceTitle,
    extraAllowancesList,
    totalAllowances,
    bonusesList,
    totalBonus,
    totalEarnings,
    
    // Deductions & Debt
    activeLoans,
    totalRemainingLoansDebt,
    lateDeduction,
    lateDeductionMinutes,
    lateIncidentsCount: empLateIncidents.length,
    manualDeductionsList,
    manualDeduction,
    totalDeductions,

    // Net Settlement
    netSettlement,
    isPayableToEmployee,
    settlementStatusLabel: isPayableToEmployee ? 'مستحق للصرف للموظف (+)' : 'مديونية مستحقة على الموظف للشركة (-)',
    
    branchBreakdown
  };
}
