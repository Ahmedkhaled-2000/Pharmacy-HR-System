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
    employees = [
      {
        id: 'emp_101',
        code: '101',
        username: '101',
        name: 'أحمد محمود',
        phone: '01012345678',
        jobTitle: 'مساعد صيدلي',
        salary: 4000,
        workHoursPerDay: 8,
        workDaysPerMonth: 26,
        password: '123',
        photoUrl: '',
        createdAt: todayStr(),
        devices: []
      }
    ];
  }

  // Ensure existing employees have a devices array
  employees = employees.map(emp => ({
    ...emp,
    devices: toSafeArray(emp.devices)
  }));

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
    employeeId: s.employeeId || s.jobId || (employees[0] ? employees[0].id : 'emp_101')
  }));

  const adjustments = toSafeArray(parsed.adjustments).map((a) => ({
    ...a,
    employeeId: a.employeeId || a.jobId || 'all'
  }));

  const branches = toSafeArray(parsed.branches);
  const requests = toSafeArray(parsed.requests);
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
    leaveRequests,
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
    bylaws
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
