import { isManagementJob, isBranchWithoutManager, getJobsList } from './jobsHelper';
import { getActivePayrollMonth } from './periodEngine';
import { getRealDate } from './timeEngine';

export const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function arabicMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${AR_MONTHS[idx]} ${y} (الشهر ${m})`;
}

export function arabicWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return AR_WEEKDAYS[d.getDay()];
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}

/**
 * دالة استخراج دورة الشهر المالية النشطة تلقائياً وفقاً لتاريخ ووقت تقفيل الرواتب
 */
export function getActivePayrollCycleMonth(orgSettings, refDate = getRealDate()) {
  return getActivePayrollMonth(orgSettings, refDate);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function parseArabicFloat(val) {
  if (val === undefined || val === null || val === '') return 0;
  const str = String(val)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/,/g, '.');
  return parseFloat(str) || 0;
}

export function fmt(n) {
  const num = parseArabicFloat(n);
  return (Math.round(num * 100) / 100).toFixed(2);
}

/**
 * الحصول على اسم العرض للموظف في شاشات وجداول النظام
 * إذا تم إدخال "اسم الشهرة" (nickname) يتم عرضه، وإلا يتم عرض الاسم الكامل (name)
 */
export function getEmpDisplayName(emp) {
  if (!emp) return '';
  if (typeof emp === 'string') return emp;
  const nickname = emp.nickname?.trim();
  if (nickname) return nickname;
  return emp.name?.trim() || emp.fullName?.trim() || '—';
}

/**
 * الحصول على الاسم الرسمي الكامل للموظف (لمسير الرواتب ومفردات المرتب الرسمية)
 */
export function getEmpOfficialName(emp) {
  if (!emp) return '';
  if (typeof emp === 'string') return emp;
  return emp.name?.trim() || emp.fullName?.trim() || emp.nickname?.trim() || '—';
}

export function toSafeArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    return Object.values(val).filter((item) => item !== null && typeof item === 'object');
  }
  return [];
}

export function normalizeState(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return parsed;
  }

  let rawEmployees = toSafeArray(parsed.employees);
  let employees = [];
  if (rawEmployees.length > 0) {
    employees = rawEmployees.map((e) => ({
      ...e,
      nickname: e.nickname || '',
      phone: e.phone || '',
      username: e.username || e.code || ''
    }));
  } else if (parsed.jobs && typeof parsed.jobs === 'object') {
    Object.entries(parsed.jobs).forEach(([id, job], idx) => {
      employees.push({
        id,
        code: String(101 + idx),
        username: String(101 + idx),
        name: job.name || (id === 'dataentry' ? 'مدخل بيانات' : 'مساعد صيدلي'),
        nickname: '',
        phone: '01000000000',
        jobTitle: job.name || 'موظف',
        salary: typeof job.salary === 'number' ? job.salary : (parseFloat(job.salary) || 0),
        workHoursPerDay: parseFloat(job.workHoursPerDay) > 0 ? parseFloat(job.workHoursPerDay) : 8,
        workDaysPerMonth: parseFloat(job.workDaysPerMonth) > 0 ? parseFloat(job.workDaysPerMonth) : 26,
        password: '123',
        photoUrl: '',
        createdAt: todayStr()
      });
    });
  } else {
    employees = [];
  }

  // Ensure existing employees have devices array and normalized permissions
  const empPermOverrides = parsed.orgSettings?.empPermissions || {};
  employees = employees.map(emp => {
    const customPerms = empPermOverrides[String(emp.id)] || empPermOverrides[String(emp.code)] || emp.permissions;
    let normalizedPerms = undefined;
    if (customPerms && typeof customPerms === 'object') {
      normalizedPerms = { ...customPerms };
      Object.entries(customPerms).forEach(([k, v]) => {
        let action = k;
        if (k.startsWith('can')) action = k.slice(3);
        else if (k.startsWith('allow')) action = k.slice(5);
        normalizedPerms['can' + action] = Boolean(v);
        normalizedPerms['allow' + action] = Boolean(v);
      });
    }
    return {
      ...emp,
      permissions: normalizedPerms || emp.permissions,
      devices: toSafeArray(emp.devices)
    };
  });

  const savedStartDay = (() => {
    try {
      const v = localStorage.getItem('payroll_payout_start_day');
      if (v !== null && v !== '') return parseInt(v, 10);
    } catch {}
    return null;
  })();

  const savedEndDay = (() => {
    try {
      const v = localStorage.getItem('payroll_payout_end_day');
      if (v !== null && v !== '') return parseInt(v, 10);
    } catch {}
    return null;
  })();

  const savedPeriodType = (() => {
    try {
      const v = localStorage.getItem('payroll_period_type');
      if (v) return v;
    } catch {}
    return null;
  })();

  const savedCustomFrom = (() => {
    try {
      const v = localStorage.getItem('payroll_custom_from');
      if (v) return v;
    } catch {}
    return null;
  })();

  const savedCustomTo = (() => {
    try {
      const v = localStorage.getItem('payroll_custom_to');
      if (v) return v;
    } catch {}
    return null;
  })();

  const effectiveStartDay = (savedStartDay !== null && savedStartDay !== undefined) 
    ? savedStartDay 
    : (parsed.orgSettings?.payrollPayoutStartDay !== undefined ? parseInt(parsed.orgSettings.payrollPayoutStartDay, 10) : 26);

  const effectiveEndDay = (savedEndDay !== null && savedEndDay !== undefined) 
    ? savedEndDay 
    : (parsed.orgSettings?.payrollPayoutEndDay !== undefined ? parseInt(parsed.orgSettings.payrollPayoutEndDay, 10) : 25);

  const effectivePeriodType = savedPeriodType || parsed.orgSettings?.payrollPeriodType || 'cycle';
  const effectiveCustomFrom = (savedCustomFrom !== null && savedCustomFrom !== undefined) ? savedCustomFrom : (parsed.orgSettings?.payrollCustomFrom || '');
  const effectiveCustomTo = (savedCustomTo !== null && savedCustomTo !== undefined) ? savedCustomTo : (parsed.orgSettings?.payrollCustomTo || '');

  const orgSettings = {
    orgName: 'مؤسسة الموارد البشرية والبصمات',
    logoUrl: '',
    waServerUrl: 'https://funny-sloth-89.loca.lt',
    adminUsername: 'admin',
    adminPassword: '123',
    permissions: {},
    empPermissions: {},
    ...(parsed.orgSettings || {}),
    payrollPeriodType: effectivePeriodType,
    payrollPayoutStartDay: effectiveStartDay,
    payrollPayoutEndDay: effectiveEndDay,
    payrollPayoutDay: effectiveEndDay,
    payrollCustomFrom: effectiveCustomFrom,
    payrollCustomTo: effectiveCustomTo
  };

  try {
    localStorage.setItem('payroll_payout_start_day', String(orgSettings.payrollPayoutStartDay));
    localStorage.setItem('payroll_payout_end_day', String(orgSettings.payrollPayoutEndDay));
    localStorage.setItem('payroll_period_type', orgSettings.payrollPeriodType);
    if (orgSettings.payrollCustomFrom) localStorage.setItem('payroll_custom_from', orgSettings.payrollCustomFrom);
    if (orgSettings.payrollCustomTo) localStorage.setItem('payroll_custom_to', orgSettings.payrollCustomTo);
  } catch {}

  const shifts = toSafeArray(parsed.shifts).map((s) => ({
    ...s,
    employeeId: s.employeeId || s.jobId || (employees[0] ? employees[0].id : '')
  }));

  const adjustments = toSafeArray(parsed.adjustments).map((a) => ({
    ...a,
    employeeId: a.employeeId || a.jobId || 'all'
  }));

  const branches = toSafeArray(parsed.branches);
  const requests = toSafeArray(parsed.requests);
  const resignationRequests = toSafeArray(parsed.resignationRequests);
  const leaveRequests = toSafeArray(parsed.leaveRequests);
  const shiftSwaps = toSafeArray(parsed.shiftSwaps);
  const loans = toSafeArray(parsed.loans);
  const evaluations = toSafeArray(parsed.evaluations);
  const notifications = toSafeArray(parsed.notifications);
  const employeeNotes = toSafeArray(parsed.employeeNotes);
  const authorizedDevices = toSafeArray(parsed.authorizedDevices);
  const logs = toSafeArray(parsed.logs);
  const approvalRules = toSafeArray(parsed.approvalRules);
  const rosters = toSafeArray(parsed.rosters);

  const activeShifts = (parsed.activeShifts && typeof parsed.activeShifts === 'object' && !Array.isArray(parsed.activeShifts))
    ? parsed.activeShifts
    : {};
  const ipRestrictions = parsed.ipRestrictions || { enabled: false, allowedIps: [] };
  const bylaws = parsed.bylaws || {
    gracePeriodMinutes: 15,
    resetPeriodDays: 30,
    latePenalties: [],
    earlyExitPenalties: [],
    deductionOptions: []
  };

  return {
    ...parsed,
    orgSettings,
    employees,
    branches,
    shifts,
    activeShifts,
    adjustments,
    requests,
    resignationRequests,
    leaveRequests,
    leaveHistory: toSafeArray(parsed.leaveHistory),
    shiftSwaps,
    loans,
    evaluations,
    notifications,
    employeeNotes,
    authorizedDevices,
    logs,
    approvalRules,
    rosters,
    ipRestrictions,
    bylaws,
    _deletedIds: toSafeArray(parsed._deletedIds || [])
  };
}

export function applyShiftSwapToRosters(targetReq, currentRosters = [], employees = []) {
  if (!targetReq || (targetReq.type !== 'swap' && targetReq.type !== 'shift_swap' && targetReq.type !== 'shift_edit')) {
    return currentRosters;
  }

  const empAId = String(targetReq.requesterEmpId || targetReq.employeeId || '');
  const empBId = String(targetReq.targetEmpId || targetReq.targetEmployeeId || targetReq.peerEmployeeId || '');
  const dateA = targetReq.requesterDate || targetReq.date || targetReq.startDate || todayStr();
  const dateB = targetReq.targetDate || targetReq.targetSwapDate || dateA;

  const monthKeyA = dateA.slice(0, 7);
  const monthKeyB = dateB.slice(0, 7);

  const dayNameA = arabicWeekday(dateA);
  const dayNameB = arabicWeekday(dateB);

  let updatedRosters = [...currentRosters];

  const ensureRoster = (empId, monthKey) => {
    let ros = updatedRosters.find((r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved');
    if (!ros) {
      ros = updatedRosters.find((r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month));
    }
    if (!ros) {
      const empObj = employees.find((e) => String(e.id) === String(empId));
      const defaultSchedule = {
        'السبت': { type: 'shift', start: '08:00', end: '16:00' },
        'الأحد': { type: 'shift', start: '08:00', end: '16:00' },
        'الاثنين': { type: 'shift', start: '08:00', end: '16:00' },
        'الثلاثاء': { type: 'shift', start: '08:00', end: '16:00' },
        'الأربعاء': { type: 'shift', start: '08:00', end: '16:00' },
        'الخميس': { type: 'shift', start: '08:00', end: '16:00' },
        'الجمعة': { type: 'off' }
      };
      ros = {
        id: `ros_${empId}_${monthKey}_${Date.now()}`,
        employeeId: empId,
        branchId: empObj?.branchId || null,
        month: monthKey,
        schedule: defaultSchedule,
        status: 'approved',
        approvedAt: new Date().toISOString()
      };
      updatedRosters.push(ros);
    }
    return ros;
  };

  const getSchedItem = (sched, dayName, dateStr) => {
    if (!sched) return { type: 'shift', start: '08:00', end: '16:00' };
    if (sched[dateStr]) return sched[dateStr];
    if (sched[dayName]) return sched[dayName];
    const alt = dayName.startsWith('ا') ? 'إ' + dayName.slice(1) : (dayName.startsWith('إ') ? 'ا' + dayName.slice(1) : dayName);
    if (sched[alt]) return sched[alt];
    const matchedKey = Object.keys(sched).find(k => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === dayName.replace(/[\u0625\u0623\u0622]/g, 'ا'));
    if (matchedKey) return sched[matchedKey];
    return { type: 'shift', start: '08:00', end: '16:00' };
  };

  if (targetReq.type === 'shift_edit') {
    const ros = ensureRoster(empAId, monthKeyA);
    const newSchedule = { ...(ros.schedule || {}) };
    const updatedDayItem = {
      type: targetReq.newDayType || (targetReq.isOff ? 'off' : 'shift'),
      start: targetReq.newStart || '08:00',
      end: targetReq.newEnd || '16:00',
      hours: targetReq.newHours || 8
    };
    newSchedule[dayNameA] = updatedDayItem;
    newSchedule[dateA] = updatedDayItem;
    const altA = dayNameA.startsWith('ا') ? 'إ' + dayNameA.slice(1) : (dayNameA.startsWith('إ') ? 'ا' + dayNameA.slice(1) : dayNameA);
    newSchedule[altA] = updatedDayItem;

    updatedRosters = updatedRosters.map((r) => r.id === ros.id ? { ...r, schedule: newSchedule, status: 'approved' } : r);
    return updatedRosters;
  }

  if (empAId && empBId) {
    const rosA = ensureRoster(empAId, monthKeyA);
    const rosB = ensureRoster(empBId, monthKeyB);

    const schedA = { ...(rosA.schedule || {}) };
    const schedB = { ...(rosB.schedule || {}) };

    const itemA_on_dateA = getSchedItem(schedA, dayNameA, dateA);
    const itemB_on_dateB = getSchedItem(schedB, dayNameB, dateB);

    // Apply Swap
    if (dateA === dateB) {
      // Both employees on the same date (e.g. Emp A was off, Emp B was working)
      schedA[dayNameA] = { ...itemB_on_dateB };
      schedA[dateA] = { ...itemB_on_dateB };
      const altA = dayNameA.startsWith('ا') ? 'إ' + dayNameA.slice(1) : (dayNameA.startsWith('إ') ? 'ا' + dayNameA.slice(1) : dayNameA);
      schedA[altA] = { ...itemB_on_dateB };

      schedB[dayNameB] = { ...itemA_on_dateA };
      schedB[dateB] = { ...itemA_on_dateA };
      const altB = dayNameB.startsWith('ا') ? 'إ' + dayNameB.slice(1) : (dayNameB.startsWith('إ') ? 'ا' + dayNameB.slice(1) : dayNameB);
      schedB[altB] = { ...itemA_on_dateA };
    } else {
      // Cross dates
      schedA[dayNameA] = { type: 'off' };
      schedA[dateA] = { type: 'off' };
      const altA = dayNameA.startsWith('ا') ? 'إ' + dayNameA.slice(1) : (dayNameA.startsWith('إ') ? 'ا' + dayNameA.slice(1) : dayNameA);
      schedA[altA] = { type: 'off' };

      schedA[dayNameB] = { ...itemB_on_dateB };
      schedA[dateB] = { ...itemB_on_dateB };
      const altB = dayNameB.startsWith('ا') ? 'إ' + dayNameB.slice(1) : (dayNameB.startsWith('إ') ? 'ا' + dayNameB.slice(1) : dayNameB);
      schedA[altB] = { ...itemB_on_dateB };

      schedB[dayNameB] = { type: 'off' };
      schedB[dateB] = { type: 'off' };
      schedB[altB] = { type: 'off' };

      schedB[dayNameA] = { ...itemA_on_dateA };
      schedB[dateA] = { ...itemA_on_dateA };
      schedB[altA] = { ...itemA_on_dateA };
    }

    updatedRosters = updatedRosters.map((r) => {
      if (r.id === rosA.id) return { ...r, schedule: schedA, status: 'approved' };
      if (r.id === rosB.id) return { ...r, schedule: schedB, status: 'approved' };
      return r;
    });
  }

  return updatedRosters;
}

/**
 * Determines whether a request should be visible to and require approval from the Branch Manager,
 * adhering strictly to the Double Approval Rules configured by Higher Management (state.approvalRules).
 * Loans, advances, and credit medicines are strictly administrative and NEVER shown to branch managers.
 */
export function shouldShowRequestToBranch(req, state) {
  if (!req) return false;

  // 1. Loans, Advances, Credit Medicines are strictly Higher Management only
  const isLoanOrCredit = ['loan', 'advance', 'credit_medicine', 'meds'].includes(req.type);
  if (isLoanOrCredit) return false;

  // 2. Direct-to-admin flags
  if (req.targetApproval === 'admin_only' || req.targetApproval === 'admin' || req.branchNotRequired || req.isDirectToAdmin) {
    return false;
  }

  // 3. Evaluations and complaints are direct to upper management
  if (['eval_edit_request', 'complaint'].includes(req.type)) {
    return false;
  }

  // 4. Check if requesting employee holds an administrative/management role (direct to Admin)
  const emp = (state?.employees || []).find(
    (e) => String(e.id) === String(req.employeeId) || (req.employeeCode && String(e.code) === String(req.employeeCode))
  );
  if (emp && isManagementJob(emp.jobTitle, getJobsList(state))) {
    return false;
  }

  // 5. Check if the branch has no assigned manager (direct to Admin)
  const targetBranchId = req.branchId || emp?.branchId || emp?.branchesDetails?.[0]?.branchId;
  if (targetBranchId && isBranchWithoutManager(targetBranchId, state)) {
    return false;
  }

  // 6. Check Double Approval Rules Configured by Higher Management (state.approvalRules)
  const rules = state?.approvalRules || [];
  if (Array.isArray(rules) && rules.length > 0) {
    // A. Check by specific requestType match (e.g. { requestType: 'leave', reqBranch: false })
    const matchedRule = rules.find((r) => {
      if (r.requestType && r.requestType === req.type) return true;
      if (r.id && r.id === `rule_${req.type}`) return true;
      return false;
    });

    if (matchedRule) {
      if (matchedRule.reqBranch === false || matchedRule.requiresBranchManager === false) {
        return false;
      }
      if (matchedRule.reqBranch === true || matchedRule.requiresBranchManager === true) {
        return true;
      }
    }

    // B. Check category rules (like long leave rule vs short leave rule)
    if (req.type === 'leave' || req.type === 'leave_request') {
      const days = parseFloat(req.daysCount || req.days || 1);
      if (days > 3) {
        const longLeaveRule = rules.find((r) => r.id === 'rule_long_leave' || (r.name && r.name.includes('أكثر من ثلاث')));
        if (longLeaveRule && (longLeaveRule.requiresBranchManager === false || longLeaveRule.reqBranch === false)) {
          return false;
        }
      }
    }

    // C. Check general rule if present
    const generalRule = rules.find((r) => r.id === 'rule_general');
    if (generalRule && (generalRule.requiresBranchManager === false || generalRule.reqBranch === false)) {
      return false;
    }
  }

  // 5. Default behavior for standard operational requests (leave <= 3 days, permission, swap, roster_update)
  return true;
}

/**
 * Returns all approved leaves for an employee from all historical and active sources
 * (state.leaveHistory, state.leaveRequests, and state.requests)
 */
export function getEmployeeApprovedLeaves(emp, state) {
  if (!emp) return [];
  const empIdStr = String(emp.id || '');
  const empCodeStr = String(emp.code || '');

  const fromRequests = (state?.requests || []).filter(
    (r) =>
      (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
      (r.type === 'leave' || r.type === 'leave_request')
  );

  const fromLeaveRequests = (state?.leaveRequests || []).filter(
    (r) =>
      String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)
  );

  const fromLeaveHistory = (state?.leaveHistory || []).filter(
    (r) =>
      String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)
  );

  const map = new Map();
  [...fromLeaveHistory, ...fromLeaveRequests, ...fromRequests].forEach((r) => {
    if (!r) return;
    const isApproved = r.status === 'approved' || r.adminApproved || !r.status;
    const key = r.id || `${r.employeeId}_${r.startDate}_${r.endDate}_${r.daysCount || 1}`;
    const existing = map.get(key);
    if (!existing || isApproved) {
      map.set(key, {
        ...r,
        status: isApproved ? 'approved' : (r.status || 'pending')
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const getT = (r) => {
      if (!r) return 0;
      if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
      return 0;
    };
    return getT(b) - getT(a);
  });
}

/**
 * Calculates annual leave total, taken days, and remaining balance for an employee
 */
export function calculateEmployeeLeaveStats(emp, state, targetYear = '') {
  if (!emp) return { annualTotal: 21, takenAnnualDays: 0, remainingAnnualDays: 21, approvedLeaves: [] };
  const year = targetYear || todayStr().slice(0, 4);
  const annualTotal = emp.annualLeaveBalance !== undefined ? parseInt(emp.annualLeaveBalance, 10) : 21;
  const allLeaves = getEmployeeApprovedLeaves(emp, state);

  const approvedAnnualLeaves = allLeaves.filter((r) => {
    const isAnnual = !r.leaveType || r.leaveType === 'annual' || r.type === 'annual_leave';
    const isAppr = r.status === 'approved' || r.adminApproved;
    const start = String(r.startDate || r.date || '');
    const inYear = !year || start.startsWith(year);
    return isAnnual && isAppr && inYear;
  });

  const takenAnnualDays = approvedAnnualLeaves.reduce((acc, r) => acc + (parseInt(r.daysCount || r.days || 1, 10)), 0);
  const remainingAnnualDays = Math.max(0, annualTotal - takenAnnualDays);

  return {
    annualTotal,
    takenAnnualDays,
    remainingAnnualDays,
    approvedLeaves: allLeaves
  };
}

/**
 * Checks whether an employee is currently active (not terminated / resigned).
 * Ensures terminated/resigned employees do not appear when selecting employees in forms, dropdowns, and modals.
 */
export function isEmployeeActive(emp) {
  if (!emp) return false;
  if (emp.is_active === false) return false;
  const s = String(emp.status || '').trim().toLowerCase();
  if (s === 'تم الاستقالة' || s === 'resigned' || s === 'terminated' || s === 'منتهية خدمته' || s === 'مستقيل' || s === 'inactive' || s === 'معلق') return false;
  if (emp.isTerminated === true || emp.isResigned === true) return false;
  if (emp.resignationStatus === 'approved') return false;
  return true;
}


