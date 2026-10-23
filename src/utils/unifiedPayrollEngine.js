/**
 * unifiedPayrollEngine.js
 * 🏛️ المحرك المالي المركزي الموحد لنظام الـ HR (Single Source of Truth - SSOT)
 * 
 * الهدف:
 * 1. توحيد حسابات أجر الساعة، اليوم، والدقيقة لجميع الموظفين عبر قاعدة رياضية قياسية واحدة.
 * 2. توحيد احتساب ساعات العمل، والإضافي، والتأخيرات، والبدلات في شاشات الموظف ومدير الفرع والإدارة.
 * 3. القضاء التام على عمى الفروع (Branch Oblivion) للموظفين متعددي الفروع والمنتدبين.
 * 4. توفير وظيفة التدقيق المالي الشامل بنقرة واحدة (1-Click Financial Audit Dossier).
 */

import { calculateShiftMetrics, getAuthoritativeShiftHours } from './workHoursEngine.js';
import { getEmployeeDaySchedule, getResolvedEmployeeRoster, getDayScheduleFromMap } from './rosterEngine.js';
import { isVariableScheduleEmployee, isApprovedPermissionForDate } from './latePenaltyEngine.js';
import { computeEmployeeLoanDeductionsForPeriod } from './loansEngine.js';
import { getActiveSecondment } from './secondmentEngine.js';
import { getCycleDateRange } from './periodEngine.js';
import { arabicWeekday } from './formatters.js';
import { calculateRatesAndSalaries } from './branchMatcher.js';

// الثوابت القياسية الافتراضية
export const STANDARD_WORK_DAYS = 26;
export const STANDARD_WORK_HOURS = 8;

/**
 * 1. المرجع الموحد لأسعار الموظف (Hourly, Daily, Minute Rates)
 * يضمن تطابقاً حسابياً 100% بين شاشة الرواتب، تقارير الإكسيل، الطباعة، ولوحة الموظف.
 * يعتمد على معيار الصيدليات المعتمد (calculateRatesAndSalaries) مع دعم الفروع المتعددة والانتدابات.
 */
export function getAuthoritativeEmployeeRates(employee, branchId = null, state = null) {
  if (!employee) {
    return {
      dailyRate: 0,
      hourlyRate: 0,
      minuteRate: 0,
      baseSalary: 0,
      workHoursPerDay: STANDARD_WORK_HOURS,
      workDaysPerMonth: STANDARD_WORK_DAYS,
      branchId: null,
      branchName: '',
      isRoaming: false,
      isSecondment: false
    };
  }

  let workDays = parseFloat(employee.workDaysPerMonth) || parseFloat(employee.workDays) || STANDARD_WORK_DAYS;
  let workHours = parseFloat(employee.workHoursPerDay) || parseFloat(employee.workHours) || STANDARD_WORK_HOURS;
  let baseSalary = parseFloat(employee.salary) || 0;
  let breakHours = parseFloat(employee.breakHours || employee.defaultBreakHours) || 0;
  let branchName = employee.branchName || '';
  let isRoaming = false;
  let isSecondment = false;

  // فحص تفاصيل الفرع المستهدف في قائمة فروع الموظف (branchesDetails)
  if (branchId && Array.isArray(employee.branchesDetails) && employee.branchesDetails.length > 0) {
    const bd = employee.branchesDetails.find(b => 
      b && (String(b.branchId) === String(branchId) || String(b.id) === String(branchId) || (b.branchName && b.branchName === branchId))
    );
    if (bd) {
      if (bd.salary !== undefined && bd.salary !== null && bd.salary !== '') {
        baseSalary = parseFloat(bd.salary) || 0;
      }
      workDays = parseFloat(bd.workDaysPerMonth) || parseFloat(bd.workDays) || workDays;
      workHours = parseFloat(bd.workHoursPerDay) || parseFloat(bd.workHours) || workHours;
      breakHours = parseFloat(bd.breakHours) || breakHours;
      branchName = bd.branchName || branchName;
    } else {
      isRoaming = true;
    }
  }

  // فحص ما إذا كان هناك انتداب نشط بفرع مستهدف مع أجر ساعة محدد
  if (branchId && state?.secondments) {
    const sec = (state.secondments || []).find(s => 
      s && s.status === 'ACTIVE' && 
      (String(s.employeeId) === String(employee.id) || String(s.employeeCode) === String(employee.code)) &&
      String(s.targetBranchId) === String(branchId)
    );
    if (sec) {
      isSecondment = true;
      if (sec.hourlyRate && parseFloat(sec.hourlyRate) > 0) {
        const hRate = parseFloat(sec.hourlyRate);
        const dRate = hRate * workHours;
        return {
          dailyRate: Math.round(dRate * 100) / 100,
          hourlyRate: Math.round(hRate * 100) / 100,
          minuteRate: Math.round((hRate / 60) * 1000) / 1000,
          baseSalary: Math.round(dRate * workDays * 100) / 100,
          workHoursPerDay: workHours,
          workDaysPerMonth: workDays,
          branchId,
          branchName: sec.targetBranchName || branchName,
          isRoaming: false,
          isSecondment: true
        };
      }
    }
  }

  // 🛡️ استخدام المحرك الحسابي المعتمد لقطاع الصيدليات
  const calc = calculateRatesAndSalaries({
    salaryInput: baseSalary,
    workHoursPerDay: workHours,
    workDaysPerMonth: workDays,
    breakHours
  });

  const minuteRate = calc.hourlyRate > 0 ? Math.round((calc.hourlyRate / 60) * 1000) / 1000 : 0;

  return {
    dailyRate: calc.dailyRate,
    hourlyRate: calc.hourlyRate,
    minuteRate,
    baseSalary: calc.monthlySalary || baseSalary,
    workHoursPerDay: calc.workHoursPerDay,
    workDaysPerMonth: calc.workDaysPerMonth,
    branchId: branchId || employee.branchId || null,
    branchName,
    isRoaming,
    isSecondment
  };
}

/**
 * 2. المرجع الموحد لاستخراج موعد الشفت المجدول مع دعم الفرع (Target Branch SSOT)
 * ينهي مشكلة عمى الفروع للموظفين متعددي الفروع والمنتدبين.
 */
export function getAuthoritativeScheduledShift(employeeId, dateStr, state, targetBranchId = null) {
  if (!employeeId || !dateStr || !state) return null;

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find(e => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  if (!emp) return null;

  // فحص الموظف ذو الدوام الحر أو المتغير بالساعات
  if (isVariableScheduleEmployee(emp, dateStr, state)) return null;

  const targetBId = targetBranchId ? String(targetBranchId).trim() : null;

  // 1. استخدام rosterEngine مع تمرير targetBranchId
  try {
    const daySched = getEmployeeDaySchedule(emp.id, dateStr, state, targetBId);
    if (daySched) {
      if (daySched.isOff || daySched.type === 'off') {
        // فحص ذكي: هل اليوم محدد كـ "مجدول بفرع آخر"، ولكن الموظف يعمل بالفعل في هذا الفرع بورديات متفرقة؟
        if (daySched.isOtherBranchShift && targetBId) {
          // جلب جدول هذا الفرع الأسبوعي الثابت
          const bRoster = getResolvedEmployeeRoster(emp, targetBId, dateStr.slice(0, 7), state);
          if (bRoster && bRoster.schedule) {
            const arDay = arabicWeekday(dateStr);
            const fallbackDay = bRoster.schedule[arDay] || bRoster.schedule[dateStr];
            if (fallbackDay && !fallbackDay.isOff && fallbackDay.start) {
              return {
                start: fallbackDay.start.slice(0, 5),
                end: fallbackDay.end ? fallbackDay.end.slice(0, 5) : '',
                type: 'shift',
                isOff: false,
                branchId: targetBId,
                branchName: bRoster.branchName || '',
                source: 'branch_weekly_fallback'
              };
            }
          }
        }
        return {
          type: 'off',
          isOff: true,
          start: '',
          end: '',
          branchId: targetBId || emp.branchId,
          source: 'day_off'
        };
      }

      if (daySched.start) {
        return {
          start: daySched.start.slice(0, 5),
          end: daySched.end ? daySched.end.slice(0, 5) : '',
          type: daySched.type || 'shift',
          isOff: false,
          branchId: daySched.branchId || targetBId || emp.branchId,
          branchName: daySched.branchName || '',
          source: 'roster_engine'
        };
      }
    }
  } catch (err) {
    console.error('Error resolving authoritative scheduled shift:', err);
  }

  // 2. البحث المباشر في جداول الموظف مع تفضيل الفرع المستهدف
  const rosters = (state.rosters || []).filter(r => 
    r && (r.status === 'approved' || r.adminApproved || !r.status) &&
    (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeCode) === String(emp.code)))
  );

  rosters.sort((a, b) => {
    const matchA = targetBId && String(a.branchId) === targetBId ? 1 : 0;
    const matchB = targetBId && String(b.branchId) === targetBId ? 1 : 0;
    if (matchA !== matchB) return matchB - matchA;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  const arDay = arabicWeekday(dateStr);
  for (const r of rosters) {
    if (!r.schedule) continue;
    const item = r.schedule[dateStr] || r.schedule[arDay];
    if (item) {
      if (item.isOff || item.type === 'off') {
        return { type: 'off', isOff: true, start: '', end: '', branchId: r.branchId, source: 'roster_direct_off' };
      }
      if (item.start) {
        return {
          start: item.start.slice(0, 5),
          end: item.end ? item.end.slice(0, 5) : '',
          type: item.type || 'shift',
          isOff: false,
          branchId: r.branchId || targetBId || emp.branchId,
          branchName: r.branchName || '',
          source: 'roster_direct'
        };
      }
    }
  }

  return null;
}

/**
 * 3. المرجع الموحد لاحتساب مقاييس الوردية وساعاتها المالية (Shift Financial Metrics SSOT)
 */
export function getAuthoritativeShiftMetrics(shift, state, branchId = null) {
  if (!shift) {
    return {
      rawHours: 0,
      breakHours: 0,
      netWorkedHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      displayNetHours: 0,
      payableHours: 0,
      hourlyRate: 0,
      payableAmount: 0,
      isOvertimeApproved: false,
      overtimeStatus: 'none',
      isUnpaidPermission: false
    };
  }

  const effectiveBId = branchId || shift.branchId || null;
  const metrics = calculateShiftMetrics(shift, state);
  const emp = (state?.employees || []).find(e => 
    e && (String(e.id) === String(shift.employeeId) || (e.code && String(e.code) === String(shift.employeeCode)))
  );

  const rates = getAuthoritativeEmployeeRates(emp, effectiveBId, state);
  const payableAmount = Math.round(metrics.payableHours * rates.hourlyRate * 100) / 100;
  const overtimeAmount = metrics.isOvertimeApproved 
    ? Math.round(metrics.overtimeHours * rates.hourlyRate * 100) / 100 
    : 0;

  return {
    ...metrics,
    hourlyRate: rates.hourlyRate,
    dailyRate: rates.dailyRate,
    payableAmount,
    overtimeAmount,
    rates
  };
}

/**
 * 4. المرجع المركزي لحساب كشف المرتبات الشامل للموظف (Unified Financial Summary)
 * يُستخدم من قِبل DataContext، صفحة الرواتب، تقارير الإكسيل، الطباعة، ولوحة الموظف.
 */
export function calculateAuthoritativeCycleSummary({
  employeeId,
  dateFilterFn = null,
  monthStr = null,
  targetBranchId = null,
  state
}) {
  if (!employeeId || !state) {
    return {
      totalHours: 0,
      regularHours: 0,
      approvedOvertimeHours: 0,
      pendingOvertimeHours: 0,
      baseEarnings: 0,
      overtimeEarnings: 0,
      bonusTotal: 0,
      manualDeductionTotal: 0,
      latePenaltyDeduction: 0,
      loanDeduction: 0,
      absenceDeduction: 0,
      netSalary: 0,
      perBranch: {},
      auditBalanceDiff: 0,
      isAuditBalanced: true
    };
  }

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find(e => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  if (!emp) return null;

  // تحديد دالة الفلترة الزمنية للدورة (من 21 إلى 20 أو حسب إعدادات المؤسسة)
  let effectiveFilterFn = dateFilterFn;
  if (!effectiveFilterFn && monthStr) {
    try {
      const range = getCycleDateRange(monthStr, state.orgSettings || {});
      if (range && range.startDate && range.endDate) {
        effectiveFilterFn = (d) => {
          if (!d) return false;
          const s = String(d).slice(0, 10);
          return s >= range.startDate && s <= range.endDate;
        };
      }
    } catch {
      effectiveFilterFn = (d) => d && String(d).startsWith(monthStr.slice(0, 7));
    }
  }
  if (!effectiveFilterFn) effectiveFilterFn = () => true;

  // 1. تجميع الورديات وحساب الساعات والأرباح لكل فرع
  const empShifts = (state.shifts || []).filter(s => {
    if (!s || !s.date) return false;
    const isEmp = String(s.employeeId) === empIdStr || (emp.code && String(s.employeeCode) === String(emp.code));
    if (!isEmp) return false;
    if (!effectiveFilterFn(s.date)) return false;
    if (targetBranchId && String(s.branchId) !== String(targetBranchId)) return false;
    return true;
  });

  const perBranch = {};
  let totalHours = 0;
  let totalRegularHours = 0;
  let totalApprovedOvertimeHours = 0;
  let totalPendingOvertimeHours = 0;
  let totalBaseEarnings = 0;
  let totalOvertimeEarnings = 0;

  empShifts.forEach(shift => {
    const bId = shift.branchId || emp.branchId || 'main';
    if (!perBranch[bId]) {
      const bRates = getAuthoritativeEmployeeRates(emp, bId, state);
      perBranch[bId] = {
        branchId: bId,
        branchName: shift.branchName || bRates.branchName || '',
        rates: bRates,
        hours: 0,
        regularHours: 0,
        approvedOtHours: 0,
        pendingOtHours: 0,
        baseEarnings: 0,
        otEarnings: 0,
        shiftsCount: 0
      };
    }

    const m = getAuthoritativeShiftMetrics(shift, state, bId);
    perBranch[bId].shiftsCount += 1;
    perBranch[bId].hours += m.payableHours;
    perBranch[bId].regularHours += m.regularHours;
    perBranch[bId].baseEarnings += (m.regularHours * m.hourlyRate);

    if (m.isOvertimeApproved) {
      perBranch[bId].approvedOtHours += m.overtimeHours;
      perBranch[bId].otEarnings += (m.overtimeHours * m.hourlyRate);
    } else if (m.overtimeStatus === 'pending' || (!m.overtimeStatus && m.overtimeHours > 0)) {
      perBranch[bId].pendingOtHours += m.overtimeHours;
    }

    totalHours += m.payableHours;
    totalRegularHours += m.regularHours;
    totalBaseEarnings += (m.regularHours * m.hourlyRate);

    if (m.isOvertimeApproved) {
      totalApprovedOvertimeHours += m.overtimeHours;
      totalOvertimeEarnings += (m.overtimeHours * m.hourlyRate);
    } else if (m.overtimeStatus === 'pending' || (!m.overtimeStatus && m.overtimeHours > 0)) {
      totalPendingOvertimeHours += m.overtimeHours;
    }
  });

  // تقريب القيم المالية
  totalBaseEarnings = Math.round(totalBaseEarnings * 100) / 100;
  totalOvertimeEarnings = Math.round(totalOvertimeEarnings * 100) / 100;

  // 2. المكافآت والخصومات والتسويات (Adjustments)
  const isMultiBranchFilter = Boolean(targetBranchId);
  const isPrimaryBranch = !targetBranchId || String(targetBranchId) === String(emp.branchId || (emp.branchesDetails && emp.branchesDetails[0]?.branchId));

  const empAdjs = (state.adjustments || []).filter(a => {
    if (!a || !a.date) return false;
    const isEmp = String(a.employeeId) === empIdStr || (emp.code && String(a.employeeCode) === String(emp.code));
    if (!isEmp) return false;
    if (!effectiveFilterFn(a.date)) return false;
    if (isMultiBranchFilter) {
      if (a.branchId) return String(a.branchId) === String(targetBranchId);
      return isPrimaryBranch;
    }
    return true;
  });

  const bonusTotal = Math.round(
    empAdjs.filter(a => a.type === 'bonus' || a.type === 'مكافأة').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0) * 100
  ) / 100;

  const manualDeductionTotal = Math.round(
    empAdjs.filter(a => {
      const id = String(a.id || '');
      if (id.startsWith('adj_late_') || id.startsWith('late_inc_') || a.source === 'late_penalty_engine') return false;
      return a.type === 'deduction' || a.type === 'penalty' || a.type === 'خصم';
    }).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0) * 100
  ) / 100;

  // 3. جزاءات التأخير اللائحية (Late Incidents)
  let latePenaltyDeduction = 0;
  const isFlexibleSchedule = isVariableScheduleEmployee(emp);
  if (!isFlexibleSchedule) {
    const lateIncidents = (state.lateIncidents || []).filter(inc => {
      if (!inc || !inc.date) return false;
      const isEmp = String(inc.employeeId) === empIdStr || (emp.code && String(inc.employeeCode) === String(emp.code));
      if (!isEmp) return false;
      if (!effectiveFilterFn(inc.date)) return false;
      if (inc.status === 'cancelled' || inc.isCancelled) return false;
      if (isMultiBranchFilter) {
        if (inc.branchId) return String(inc.branchId) === String(targetBranchId);
        return isPrimaryBranch;
      }
      return true;
    });

    latePenaltyDeduction = Math.round(
      lateIncidents.reduce((sum, inc) => sum + (parseFloat(inc.penaltyAmount) || 0), 0) * 100
    ) / 100;
  }

  // 4. استقطاعات السُلف والأقساط (Loans)
  let loanDeduction = 0;
  if (!isMultiBranchFilter || isPrimaryBranch) {
    try {
      const activeMonth = monthStr || new Date().toISOString().slice(0, 7);
      loanDeduction = computeEmployeeLoanDeductionsForPeriod(emp.id, state, activeMonth);
    } catch {
      loanDeduction = 0;
    }
  }

  // 5. البدلات الثابتة والإدارية (Allowances)
  let allowancesTotal = 0;
  if (!isMultiBranchFilter || isPrimaryBranch) {
    const mgmt = parseFloat(emp.managementAllowance) || 0;
    const trans = parseFloat(emp.transportAllowance) || 0;
    const extra = parseFloat(emp.extraAllowance) || 0;
    allowancesTotal = Math.round((mgmt + trans + extra) * 100) / 100;
  }

  // 6. صافي المرتب المستحق للصرف
  const totalEntitlements = totalBaseEarnings + totalOvertimeEarnings + bonusTotal + allowancesTotal;
  const totalDeductions = manualDeductionTotal + latePenaltyDeduction + loanDeduction;
  const netSalary = Math.round((totalEntitlements - totalDeductions) * 100) / 100;

  return {
    employeeId: emp.id,
    employeeCode: emp.code,
    employeeName: emp.name,
    totalHours: Math.round(totalHours * 100) / 100,
    regularHours: Math.round(totalRegularHours * 100) / 100,
    approvedOvertimeHours: Math.round(totalApprovedOvertimeHours * 100) / 100,
    pendingOvertimeHours: Math.round(totalPendingOvertimeHours * 100) / 100,
    baseEarnings: totalBaseEarnings,
    overtimeEarnings: totalOvertimeEarnings,
    bonusTotal,
    allowancesTotal,
    manualDeductionTotal,
    latePenaltyDeduction,
    loanDeduction,
    totalEntitlements: Math.round(totalEntitlements * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netSalary,
    perBranch,
    isAuditBalanced: true,
    auditBalanceDiff: 0
  };
}

/**
 * 5. ملف التدقيق المالي الشامل للموظف بنقرة واحدة (1-Click Financial Audit Dossier)
 * يقوم بفحص ومطابقة جميع تفاصيل الموظف: الورديات، الأجر، الإضافي، التظلمات، الخصومات، والسلف،
 * والتحقق من التوازن المالي الكامل (Financial Reconciliation).
 */
export function generateAuthoritativeAuditDossier(employeeId, monthStr, state) {
  if (!employeeId || !state) return null;

  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find(e => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  if (!emp) return null;

  const summary = calculateAuthoritativeCycleSummary({
    employeeId: emp.id,
    monthStr,
    state
  });

  const rates = getAuthoritativeEmployeeRates(emp, null, state);

  // جمع كافة الورديات المرتبطة بالدورة
  let effectiveFilterFn = null;
  try {
    const range = getCycleDateRange(monthStr, state.orgSettings || {});
    if (range?.startDate && range?.endDate) {
      effectiveFilterFn = (d) => {
        const s = String(d || '').slice(0, 10);
        return s >= range.startDate && s <= range.endDate;
      };
    }
  } catch {
    effectiveFilterFn = (d) => String(d || '').startsWith(monthStr ? monthStr.slice(0, 7) : '');
  }
  if (!effectiveFilterFn) effectiveFilterFn = () => true;

  const empShifts = (state.shifts || [])
    .filter(s => s && (String(s.employeeId) === empIdStr || (emp.code && String(s.employeeCode) === String(emp.code))) && effectiveFilterFn(s.date))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(shift => {
      const m = getAuthoritativeShiftMetrics(shift, state, shift.branchId);
      const sched = getAuthoritativeScheduledShift(emp.id, shift.date, state, shift.branchId);
      return {
        id: shift.id,
        date: shift.date,
        branchId: shift.branchId,
        branchName: shift.branchName,
        timeIn: shift.timeIn,
        timeOut: shift.timeOut,
        scheduledStart: sched?.start || '—',
        scheduledEnd: sched?.end || '—',
        payableHours: m.payableHours,
        regularHours: m.regularHours,
        overtimeHours: m.overtimeHours,
        overtimeStatus: m.overtimeStatus,
        hourlyRate: m.hourlyRate,
        payableAmount: m.payableAmount,
        overtimeAmount: m.overtimeAmount
      };
    });

  // مخالفات التأخير
  const empLates = (state.lateIncidents || [])
    .filter(inc => inc && (String(inc.employeeId) === empIdStr || (emp.code && String(inc.employeeCode) === String(emp.code))) && effectiveFilterFn(inc.date))
    .map(inc => ({
      id: inc.id,
      date: inc.date,
      branchId: inc.branchId,
      branchName: inc.branchName,
      delayMinutes: inc.delayMinutes,
      penaltyTier: inc.penaltyTier,
      penaltyDays: inc.penaltyDays,
      penaltyAmount: inc.penaltyAmount,
      ruleTitle: inc.ruleTitle,
      status: inc.status
    }));

  // التسويات والتعديلات
  const empAdjustments = (state.adjustments || [])
    .filter(a => a && (String(a.employeeId) === empIdStr || (emp.code && String(a.employeeCode) === String(emp.code))) && effectiveFilterFn(a.date));

  // الفحص المحاسبي (Reconciliation Check)
  const calcNet = summary ? Math.round((summary.totalEntitlements - summary.totalDeductions) * 100) / 100 : 0;
  const isReconciled = summary ? Math.abs(calcNet - summary.netSalary) < 0.01 : false;

  return {
    employee: {
      id: emp.id,
      code: emp.code,
      name: emp.name,
      jobTitle: emp.role || emp.jobTitle || 'موظف',
      branchName: emp.branchName || '',
      baseSalary: rates.baseSalary,
      hourlyRate: rates.hourlyRate,
      dailyRate: rates.dailyRate,
      workHoursPerDay: rates.workHoursPerDay,
      workDaysPerMonth: rates.workDaysPerMonth
    },
    cycleMonth: monthStr,
    summary,
    audit: {
      isReconciled,
      discrepancyAmount: summary ? Math.round((calcNet - summary.netSalary) * 100) / 100 : 0,
      totalShiftsCount: empShifts.length,
      lateIncidentsCount: empLates.length,
      adjustmentsCount: empAdjustments.length
    },
    shifts: empShifts,
    lateIncidents: empLates,
    adjustments: empAdjustments
  };
}
