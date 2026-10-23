/**
 * secondmentEngine.js
 * محرك إدارة الانتدابات والنقل بين الفروع في نظام الـ HR
 * 
 * الميزات:
 * 1. استعلام الانتدابات النشطة والمحددة زمنياً أو المفتوحة
 * 2. التحقق من انتماء الموظف للفرع المنتدب إليه خلال فترة الانتداب
 * 3. استخراج جداول الانتداب أو تعيين نظام المواعيد المتغيرة
 * 4. حساب ساعات العمل المنجزة في الفرع المنتدب إليه والأجر المستحق وبدل الانتداب
 */

import { fmt, getRealTodayStr } from './formatters.js';

/**
 * جلب وثيقة الانتداب النشطة لموظف في تاريخ معين (أو اليوم)
 */
export function getActiveSecondment(employeeId, dateStr = null, state = null) {
  if (!employeeId || !state || !state.secondments) return null;
  const targetDate = dateStr ? String(dateStr).slice(0, 10) : (typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10));
  const empIdStr = String(employeeId);

  return (state.secondments || []).find((sec) => {
    if (!sec || sec.status !== 'ACTIVE') return false;
    const matchEmp = String(sec.employeeId) === empIdStr || (sec.employeeCode && String(sec.employeeCode) === empIdStr);
    if (!matchEmp) return false;

    // فحص فترة الانتداب
    const start = sec.startDate ? String(sec.startDate).slice(0, 10) : null;
    const end = sec.endDate ? String(sec.endDate).slice(0, 10) : null;

    if (start && start > targetDate) return false; // لم يبدأ بعد
    if (end && end < targetDate) return false;     // انتهى

    return true;
  }) || null;
}

/**
 * فحص ما إذا كان الموظف في حالة انتداب نشطة حالياً
 */
export function isEmployeeSeconded(employeeId, dateStr = null, state = null) {
  return Boolean(getActiveSecondment(employeeId, dateStr, state));
}

/**
 * جلب جميع الموظفين المنتدبين حالياً لفرع معين
 */
export function getSecondedEmployeesForBranch(branchId, dateStr = null, state = null) {
  if (!branchId || !state || !state.secondments) return [];
  const targetDate = dateStr ? String(dateStr).slice(0, 10) : (typeof getRealTodayStr === 'function' ? getRealTodayStr() : new Date().toISOString().slice(0, 10));
  const bIdStr = String(branchId);

  const activeSecs = (state.secondments || []).filter((sec) => {
    if (!sec || sec.status !== 'ACTIVE') return false;
    if (String(sec.targetBranchId) !== bIdStr) return false;
    const start = sec.startDate ? String(sec.startDate).slice(0, 10) : null;
    const end = sec.endDate ? String(sec.endDate).slice(0, 10) : null;
    if (start && start > targetDate) return false;
    if (end && end < targetDate) return false;
    return true;
  });

  const employees = state.employees || [];
  return activeSecs.map((sec) => {
    const emp = employees.find((e) => String(e.id) === String(sec.employeeId) || (sec.employeeCode && String(e.code) === String(sec.employeeCode)));
    return {
      ...emp,
      secondment: sec,
      isSeconded: true,
      secondedToBranchId: sec.targetBranchId,
      secondedToBranchName: sec.targetBranchName,
      secondmentStartDate: sec.startDate,
      secondmentEndDate: sec.endDate,
      secondmentScheduleType: sec.scheduleType || 'variable'
    };
  }).filter(Boolean);
}

/**
 * فحص شامل لما إذا كان الموظف ينتمي للفرع (أساسي، متعدد، أو منتدب)
 */
export function isEmployeeInBranchWithSecondment(employee, branchId, dateStr = null, state = null) {
  if (!employee || !branchId) return false;
  const bIdStr = String(branchId);

  // 1. فرع أساسي
  if (String(employee.branchId) === bIdStr) return true;

  // 2. فروع إضافية
  if (employee.branchesDetails && employee.branchesDetails.some((bd) => String(bd.branchId) === bIdStr)) {
    return true;
  }

  // 3. انتداب نشط
  if (state) {
    const sec = getActiveSecondment(employee.id, dateStr, state);
    if (sec && String(sec.targetBranchId) === bIdStr) {
      return true;
    }
  }

  return false;
}

/**
 * استخراج جدول الانتداب لتاريخ معين إن وجد
 */
export function getSecondmentScheduleForDate(employeeId, dateStr, state) {
  const sec = getActiveSecondment(employeeId, dateStr, state);
  if (!sec) return null;

  // إذا كان الانتداب بمواعيد متغيرة (بدون جدول)
  if (sec.scheduleType === 'variable') {
    return {
      type: 'variable',
      isVariable: true,
      isOff: false,
      branchId: sec.targetBranchId,
      branchName: sec.targetBranchName,
      hourlyRate: parseFloat(sec.hourlyRate) || null,
      label: 'دوام متغير (انتداب)',
      secondmentId: sec.id
    };
  }

  // إذا كان بجدول محدد
  if (sec.schedule && sec.schedule[dateStr]) {
    const daySch = sec.schedule[dateStr];
    return {
      ...daySch,
      branchId: sec.targetBranchId,
      branchName: sec.targetBranchName,
      hourlyRate: parseFloat(sec.hourlyRate) || null,
      label: daySch.label || 'وردية عمل (انتداب)',
      secondmentId: sec.id
    };
  }

  return null;
}

/**
 * حساب ساعات العمل والرواتب للفرع المنتدب إليه
 */
export function calculateSecondmentBranchEarnings({
  employee,
  secondment,
  shifts = [],
  fromDate = null,
  toDate = null
}) {
  if (!employee || !secondment) {
    return { totalHours: 0, shiftsCount: 0, baseEarnings: 0, allowance: 0, netSecondmentPay: 0 };
  }

  const bIdStr = String(secondment.targetBranchId);
  const empIdStr = String(employee.id);
  const empCodeStr = employee.code ? String(employee.code) : '';

  // فلترة الشفتات المنفذة في الفرع المنتدب إليه ضمن نطاق التاريخ وفترة الانتداب
  const targetShifts = shifts.filter((s) => {
    if (!s || !s.date) return false;
    const matchEmp = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr);
    if (!matchEmp) return false;

    // الفرع
    const matchBranch = String(s.branchId) === bIdStr;
    if (!matchBranch) return false;

    // فترة الانتداب
    if (secondment.startDate && s.date < secondment.startDate) return false;
    if (secondment.endDate && s.date > secondment.endDate) return false;

    // نطاق الفحص
    if (fromDate && s.date < fromDate) return false;
    if (toDate && s.date > toDate) return false;

    return true;
  });

  // حساب إجمالي الساعات
  const totalHours = targetShifts.reduce((acc, s) => {
    const h = parseFloat(s.hours || s.actualWorkedHours || s.regularHours) || 0;
    return acc + h;
  }, 0);

  // تحديد أجر الساعة
  let hourlyRate = parseFloat(secondment.hourlyRate) || 0;
  if (!hourlyRate) {
    // استنتاج سعر الساعة من الراتب الأساسي
    const baseSal = parseFloat(employee.salary) || 0;
    const workDays = parseFloat(employee.workDaysPerMonth || employee.workDays) || 26;
    const workHours = parseFloat(employee.workHoursPerDay || employee.workHours) || 8;
    if (baseSal >= 200) {
      hourlyRate = workDays > 0 ? (baseSal / workDays) / workHours : 0;
    } else {
      hourlyRate = baseSal > 0 ? baseSal : 0;
    }
  }

  const baseEarnings = Math.round(totalHours * hourlyRate * 100) / 100;
  const allowance = parseFloat(secondment.secondmentAllowance) || 0;
  const netSecondmentPay = Math.round((baseEarnings + allowance) * 100) / 100;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    shiftsCount: targetShifts.length,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    baseEarnings,
    allowance,
    netSecondmentPay
  };
}

/**
 * تنسيق فترة الانتداب لعرضها في الشارات والجداول
 */
export function formatSecondmentPeriodText(sec) {
  if (!sec) return '';
  if (sec.assignmentType === 'permanent_transfer' || sec.status === 'TRANSFERRED') {
    return `نقل نهائي اعتباراً من ${sec.startDate || '—'}`;
  }
  if (sec.assignmentType === 'open_ended' || !sec.endDate) {
    return `من ${sec.startDate || '—'} (فترة مفتوحة)`;
  }
  return `من ${sec.startDate || '—'} حتى ${sec.endDate || '—'}`;
}
