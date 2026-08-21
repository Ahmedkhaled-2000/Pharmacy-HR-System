import { fmt, todayStr } from './formatters';
import { getEffectiveShiftHours, computeLatenessFinancialAmount, isApprovedPermissionForDate } from './latePenaltyEngine';
import { isManagementJob, getJobsList } from './jobsHelper';

/**
 * حساب التصفية والمخالصة المالية الشاملة للموظف عند إنهاء الخدمة
 * تشمل:
 * 1. المستحقات المكتسبة (ساعات عمل أساسية + وقت إضافي معتمد + بدلات + مكافآت)
 * 2. كامل الالتزامات والديون (كامل رصيد السلف والأدوية المتبقي بالكامل + الخصومات + الجزاءات + الغياب)
 * 3. صافي مستحقات نهاية الخدمة والتصفية
 */
export function computeEmployeeFinalSettlement(empId, state, terminationDate = null) {
  if (!empId || !state) return null;

  const emp = (state.employees || []).find((e) => String(e.id) === String(empId));
  if (!emp) return null;

  const termDate = terminationDate || todayStr();
  const currentMonthStr = termDate.slice(0, 7);

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

  branches.forEach((b) => {
    const bId = b.branchId;
    const hourlyBase = parseFloat(b.salary) || 0;
    const workHoursPerDay = parseFloat(b.workHoursPerDay) || 8;
    const workDaysPerMonth = parseFloat(b.workDaysPerMonth) || 26;

    const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
    const rate = (hourlyBase > 0 && workDaysPerMonth > 0)
      ? (hourlyBase >= 200 ? (hourlyBase / workDaysPerMonth) : ((hourlyBase * workHoursPerDay) / workDaysPerMonth))
      : (workHoursPerDay > 0 ? dailyRate / workHoursPerDay : hourlyBase);

    // Shifts for this branch up to termination date
    const bShifts = (state.shifts || []).filter(
      (s) =>
        String(s.employeeId) === String(empId) &&
        (s.date <= termDate) &&
        (s.date.slice(0, 7) === currentMonthStr) &&
        (s.branchId === bId || !s.branchId || branches.length === 1)
    );

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
    branchBreakdown.push({
      branchId: bId,
      branchName: bObj?.name || (bId === 'main' ? 'المركز الرئيسي' : `فرع ${bId}`),
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

  // المكافآت المسجلة
  const allAdjs = [...(state.adjustments || []), ...(state.requests || [])].filter(
    (a) =>
      String(a.employeeId) === String(empId) &&
      (a.date ? a.date.slice(0, 7) === currentMonthStr : true) &&
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

  // 2. خصومات التأخير اللائحي
  const empLateIncidents = (state.lateIncidents || []).filter(
    (inc) =>
      String(inc.employeeId) === String(empId) &&
      inc.status !== 'cancelled' &&
      inc.status !== 'approved_permission_exempt' &&
      inc.actionType !== 'grace' &&
      !isApprovedPermissionForDate(empId, inc.date, state) &&
      (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
      (inc.date ? inc.date.slice(0, 7) === currentMonthStr : true)
  );

  const lateDeduction = empLateIncidents.reduce((acc, inc) => {
    const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
    return acc + (dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0));
  }, 0);

  const lateDeductionMinutes = empLateIncidents.reduce((acc, inc) => acc + (parseFloat(inc.deductionMinutes) || 0), 0);

  // 3. الخصومات والجزاءات اليدوية
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
    currentMonthStr,
    
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
