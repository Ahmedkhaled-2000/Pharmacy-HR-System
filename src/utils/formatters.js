import { isManagementJob, isBranchWithoutManager, getJobsList } from './jobsHelper';
import { getActivePayrollMonth } from './periodEngine';
export { getRealDate, getRealTodayStr, getRealNowTimeStr } from './timeEngine';
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
  let employees = rawEmployees.map((e) => ({
    ...e,
    nickname: e.nickname || '',
    phone: e.phone || '',
    username: e.username || e.code || ''
  }));

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

  const savedOwnerLocks = (() => {
    try {
      const v = localStorage.getItem('pharmacy-owner-locks');
      if (v) return JSON.parse(v);
    } catch {}
    return null;
  })();

  const effectiveOwnerLocks = {
    ...(savedOwnerLocks || {}),
    ...(parsed.orgSettings?.ownerModificationLocks || {})
  };

  const effectiveStartDay = (parsed.orgSettings?.payrollPayoutStartDay !== undefined)
    ? parseInt(parsed.orgSettings.payrollPayoutStartDay, 10)
    : (savedStartDay !== null && savedStartDay !== undefined ? savedStartDay : 26);

  let rawEndDay = (parsed.orgSettings?.payrollPayoutEndDay !== undefined)
    ? parseInt(parsed.orgSettings.payrollPayoutEndDay, 10)
    : (parsed.orgSettings?.payrollPayoutDay !== undefined
        ? parseInt(parsed.orgSettings.payrollPayoutDay, 10)
        : (savedEndDay !== null && savedEndDay !== undefined ? savedEndDay : 25));

  if (effectiveStartDay > 1 && (rawEndDay === effectiveStartDay || isNaN(rawEndDay))) {
    rawEndDay = effectiveStartDay - 1;
  }
  const effectiveEndDay = rawEndDay;

  const effectivePeriodType = savedPeriodType || parsed.orgSettings?.payrollPeriodType || 'cycle';
  const effectiveCustomFrom = (savedCustomFrom !== null && savedCustomFrom !== undefined) ? savedCustomFrom : (parsed.orgSettings?.payrollCustomFrom || '');
  const effectiveCustomTo = (savedCustomTo !== null && savedCustomTo !== undefined) ? savedCustomTo : (parsed.orgSettings?.payrollCustomTo || '');

  const orgSettings = {
    orgName: 'منظومة إدارة الموارد البشرية والرواتب',
    logoUrl: '',
    waServerUrl: '',
    adminUsername: 'admin',
    adminPassword: '123',
    permissions: {},
    empPermissions: {},
    ...(parsed.orgSettings || {}),
    ownerModificationLocks: effectiveOwnerLocks,
    payrollPeriodType: effectivePeriodType,
    rosterNotificationDay: parsed.orgSettings?.rosterNotificationDay !== undefined ? parseInt(parsed.orgSettings.rosterNotificationDay, 10) : 25,
    rosterNotificationAutoSend: parsed.orgSettings?.rosterNotificationAutoSend !== undefined ? Boolean(parsed.orgSettings.rosterNotificationAutoSend) : true,
    rosterNotificationMessage: (parsed.orgSettings?.rosterNotificationMessage && !parsed.orgSettings.rosterNotificationMessage.includes('تم اعتماد وإصدار الجدول الشهري'))
      ? parsed.orgSettings.rosterNotificationMessage
      : 'يرجى التكرم بالدخول على بوابة الموظف لإعداد وتحديد جدول شفتاتك ومناوبات العمل للشهر الجديد، وإرسال الجدول لمدير الفرع والإدارة للاعتماد.',
    rosterNotificationTarget: (parsed.orgSettings?.rosterNotificationTarget && parsed.orgSettings.rosterNotificationTarget === 'all')
      ? 'all'
      : 'unsubmitted',
    rosterNotificationLastSentMonth: parsed.orgSettings?.rosterNotificationLastSentMonth || '',
    rosterNotificationLastSentDate: parsed.orgSettings?.rosterNotificationLastSentDate || '',
    rosterNotificationLastSentCount: parsed.orgSettings?.rosterNotificationLastSentCount || 0,
    payrollPayoutStartDay: effectiveStartDay,
    payrollPayoutEndDay: effectiveEndDay,
    payrollPayoutDay: effectiveEndDay,
    payrollCustomFrom: effectiveCustomFrom,
    payrollCustomTo: effectiveCustomTo
  };

  try {
    if (Object.keys(effectiveOwnerLocks).length > 0) {
      localStorage.setItem('pharmacy-owner-locks', JSON.stringify(effectiveOwnerLocks));
    }
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
  let requests = toSafeArray(parsed.requests);
  const resignationRequests = toSafeArray(parsed.resignationRequests);
  const leaveRequests = toSafeArray(parsed.leaveRequests);
  const permissionRequests = toSafeArray(parsed.permissionRequests);
  const shiftSwaps = toSafeArray(parsed.shiftSwaps);
  let loans = toSafeArray(parsed.loans);
  const evaluations = toSafeArray(parsed.evaluations);
  // ── Remove old automated cycle reminder spam and keep only management notifications ──
  const notifications = toSafeArray(parsed.notifications).filter((n) => {
    if (!n) return false;
    const isOldAutoReminder = (
      n.title?.includes('تذكير دورة الرواتب') ||
      n.message?.includes('اقتربت/انتهت دورة العمل الحالية')
    ) && n.createdBy !== 'admin';
    return !isOldAutoReminder;
  });
  const employeeNotes = toSafeArray(parsed.employeeNotes);
  const authorizedDevices = toSafeArray(parsed.authorizedDevices);
  const logs = toSafeArray(parsed.logs);
  const approvalRules = toSafeArray(parsed.approvalRules);
  const rosters = toSafeArray(parsed.rosters);
  let lateIncidents = toSafeArray(parsed.lateIncidents);
  let cleanAdjustments = adjustments;

  // ── Auto-synchronize loans and credit medicine requests ──
  // If a loan exists in loans and is approved, paid, partial, or has payment deductions:
  // ensure the corresponding request in requests is also marked approved / paid and not pending!
  if (loans.length > 0) {
    requests = requests.map((r) => {
      if (!r) return r;
      const isLoanType = r.type === 'loan' || r.type === 'meds' || r.type === 'credit_medicine' || r.type === 'advance';
      if (!isLoanType) return r;

      const rIdStr = String(r.id || '');
      const rAmt = parseFloat(r.amount || r.totalAmount) || 0;
      const matchingLoan = loans.find((l) => {
        if (!l) return false;
        if (String(l.id) === rIdStr || String(l.requestId) === rIdStr || String(r.requestId) === String(l.id)) return true;
        if (String(l.employeeId) === String(r.employeeId)) {
          const lAmt = parseFloat(l.amount || l.totalAmount) || 0;
          if (rAmt > 0 && lAmt > 0 && Math.abs(rAmt - lAmt) < 0.01) {
            const rDate = String(r.date || r.createdAt || '').slice(0, 7);
            const lDate = String(l.date || l.createdAt || '').slice(0, 7);
            if (!rDate || !lDate || rDate === lDate) return true;
          }
        }
        return false;
      });

      if (matchingLoan) {
        const isApprovedOrPaid = matchingLoan.status === 'approved' ||
                                 matchingLoan.status === 'paid' ||
                                 matchingLoan.status === 'partial' ||
                                 matchingLoan.adminApproved === true ||
                                 (parseFloat(matchingLoan.paidAmount) > 0) ||
                                 (Array.isArray(matchingLoan.paymentsHistory) && matchingLoan.paymentsHistory.length > 0);

        if (isApprovedOrPaid) {
          const mPaid = Math.max(parseFloat(matchingLoan.paidAmount) || 0, parseFloat(r.paidAmount) || 0);
          const totalAmt = parseFloat(matchingLoan.amount || r.amount || rAmt) || 0;
          const status = mPaid >= totalAmt && totalAmt > 0 ? 'paid' : (mPaid > 0 ? 'partial' : (matchingLoan.status || 'approved'));
          const history = (Array.isArray(matchingLoan.paymentsHistory) && matchingLoan.paymentsHistory.length > 0)
            ? matchingLoan.paymentsHistory
            : (Array.isArray(r.paymentsHistory) ? r.paymentsHistory : []);

          return {
            ...r,
            status,
            adminApproved: true,
            paidAmount: mPaid,
            paymentsHistory: history,
            approvedAt: r.approvedAt || matchingLoan.approvedAt || matchingLoan.createdAt || r.createdAt || new Date().toISOString()
          };
        }
      }
      return r;
    });
  }

  // ── Auto-sanitize approved penalty objections ──
  const approvedObjections = requests.filter(
    (r) =>
      (r.type === 'penalty_objection' || r.type === 'objection') &&
      (r.status === 'approved' || r.adminApproved === true || r.objection?.status === 'approved')
  );

  if (approvedObjections.length > 0) {
    approvedObjections.forEach((objReq) => {
      const penId = objReq.penaltyId || String(objReq.id).replace(/^obj_(inc|adj|req)_/, '');
      const cleanPenId = String(penId).replace(/^req_/, '');

      requests = requests.map((r) => {
        const rIdStr = String(r.id);
        const isTarget =
          rIdStr === String(penId) ||
          rIdStr === `req_${cleanPenId}` ||
          rIdStr === cleanPenId ||
          r.penaltyId === penId ||
          r.penaltyId === cleanPenId ||
          (String(r.employeeId) === String(objReq.employeeId) && r.date === objReq.date && (r.subType === 'lateness' || r.type === 'penalty'));

        if (isTarget && r.id !== objReq.id) {
          return {
            ...r,
            status: 'cancelled',
            isCancelled: true,
            amount: 0,
            deductionMinutes: 0,
            cancellationReason: r.cancellationReason || 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
            objection: {
              ...(r.objection || {}),
              status: 'approved',
              resolvedAt: r.objection?.resolvedAt || objReq.approvedAt || new Date().toISOString()
            }
          };
        }
        return r;
      });

      lateIncidents = lateIncidents.map((inc) => {
        const incIdStr = String(inc.id);
        const isTarget =
          incIdStr === String(penId) ||
          incIdStr === cleanPenId ||
          incIdStr === `late_inc_${cleanPenId}` ||
          (String(inc.employeeId) === String(objReq.employeeId) && inc.date === objReq.date);

        if (isTarget) {
          return {
            ...inc,
            status: 'cancelled',
            isCancelled: true,
            actionType: 'grace',
            actionLabel: 'سماح (تم قبول التظلم وإلغاء الخصم)',
            deductionMinutes: 0,
            deductionHours: 0,
            penaltyAmount: 0,
            cancellationReason: inc.cancellationReason || 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
            objection: {
              ...(inc.objection || {}),
              status: 'approved',
              resolvedAt: inc.objection?.resolvedAt || objReq.approvedAt || new Date().toISOString()
            }
          };
        }
        return inc;
      });

      cleanAdjustments = cleanAdjustments.filter((a) => {
        const aIdStr = String(a.id);
        if (
          aIdStr === String(penId) ||
          aIdStr === cleanPenId ||
          aIdStr === `adj_${penId}` ||
          aIdStr === `adj_disc_${penId}` ||
          aIdStr === `adj_disc_${cleanPenId}` ||
          a.requestId === penId ||
          a.requestId === cleanPenId
        ) return false;
        if (
          String(a.employeeId) === String(objReq.employeeId) &&
          a.date === objReq.date &&
          (a.type === 'penalty' || a.type === 'deduction')
        ) return false;
        return true;
      });
    });
  }

  // ── Auto-sanitize approved permissions against late penalties ──
  const approvedPermissions = requests.filter(
    (r) =>
      (r.type === 'permission' || r.type === 'إذن' || r.type === 'late_permission' || r.type === 'early_leave' || r.permType === 'late' || r.permType === 'early') &&
      (r.status === 'approved' || r.adminApproved === true || (r.branchApproved && r.status !== 'rejected')) &&
      r.status !== 'rejected' &&
      r.status !== 'cancelled'
  );

  if (approvedPermissions.length > 0) {
    approvedPermissions.forEach((permReq) => {
      const pEmpId = String(permReq.employeeId || '');
      const pDate = String(permReq.date || permReq.startDate || (permReq.createdAt ? permReq.createdAt.slice(0, 10) : '')).slice(0, 10);
      if (!pEmpId || !pDate) return;

      requests = requests.map((r) => {
        if (
          String(r.employeeId) === pEmpId &&
          (r.date === pDate || (r.createdAt && r.createdAt.slice(0, 10) === pDate)) &&
          (r.subType === 'lateness' || r.type === 'late_penalty' || String(r.id).startsWith('req_late_inc_'))
        ) {
          return {
            ...r,
            status: 'approved_permission_exempt',
            isCancelled: true,
            amount: 0,
            deductionMinutes: 0,
            actionType: 'grace',
            cancellationReason: `تم إلغاء الجزاء تلقائياً لوجود إذن معتمد بتاريخ ${pDate}`
          };
        }
        return r;
      });

      lateIncidents = lateIncidents.map((inc) => {
        if (String(inc.employeeId) === pEmpId && inc.date === pDate) {
          return {
            ...inc,
            status: 'approved_permission_exempt',
            isCancelled: true,
            actionType: 'grace',
            actionLabel: `سماح (${permReq.permType === 'early' ? 'إذن خروج مبكر معتمد' : 'إذن تأخير معتمد'})`,
            deductionMinutes: 0,
            deductionHours: 0,
            penaltyAmount: 0,
            cancellationReason: `تم إلغاء الجزاء تلقائياً لوجود إذن معتمد بتاريخ ${pDate}`
          };
        }
        return inc;
      });

      cleanAdjustments = cleanAdjustments.filter((a) => {
        if (
          String(a.employeeId) === pEmpId &&
          a.date === pDate &&
          (a.type === 'penalty' || a.type === 'deduction' || String(a.id).startsWith('adj_pen_') || String(a.id).startsWith('adj_disc_'))
        ) {
          return false;
        }
        return true;
      });
    });
  }

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

  // ── Auto-sync approved profile_update requests to employee data ──
  const approvedProfileUpdates = requests.filter(
    (r) =>
      (r.type === 'profile_update' || r.type === 'profile_edit' || r.type === 'profile_update_request' || String(r.type || '').includes('profile')) &&
      (r.status === 'approved' || r.adminApproved === true)
  );

  if (approvedProfileUpdates.length > 0) {
    approvedProfileUpdates.sort((a, b) => new Date(a.approvedAt || a.submittedAt || a.createdAt || 0) - new Date(b.approvedAt || b.submittedAt || b.createdAt || 0));
    approvedProfileUpdates.forEach((req) => {
      const proposed = req.proposedChanges || req.proposed || {};
      const newPhoto = proposed.photoUrl || req.photoUrl;
      const newPhones = proposed.phones || (proposed.phone ? [proposed.phone] : (req.phones || []));
      const newAddress = proposed.address !== undefined ? proposed.address : req.address;
      const newMaritalStatus = proposed.maritalStatus || req.maritalStatus;

      employees = employees.map((emp) => {
        const isMatch = String(emp.id) === String(req.employeeId) || (req.employeeCode && String(emp.code) === String(req.employeeCode));
        if (isMatch) {
          const cleanPhones = Array.isArray(newPhones) && newPhones.length > 0
            ? newPhones.map(p => (typeof p === 'object' && p ? (p.number || '') : String(p))).filter(Boolean)
            : emp.phones;

          return {
            ...emp,
            ...(newPhoto ? { photoUrl: newPhoto, photo: newPhoto } : {}),
            ...(cleanPhones && cleanPhones.length > 0 ? { phones: cleanPhones, phone: cleanPhones[0] } : {}),
            ...(newAddress !== undefined && newAddress !== '' ? { address: newAddress } : {}),
            ...(newMaritalStatus ? { maritalStatus: newMaritalStatus } : {})
          };
        }
        return emp;
      });
    });
  }

  return {
    ...parsed,
    orgSettings,
    employees,
    branches,
    shifts,
    activeShifts,
    adjustments: cleanAdjustments,
    requests,
    lateIncidents,
    resignationRequests,
    leaveRequests,
    permissionRequests,
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
    recruitmentApplications: toSafeArray(parsed.recruitmentApplications),
    jobVacancies: toSafeArray(parsed.jobVacancies),
    _deletedIds: toSafeArray(parsed._deletedIds || [])
  };
}

export { applyShiftSwapToRosters, getDayScheduleFromMap, getEmployeeDaySchedule, findEmployeeRoster, getEmployeeBaseDaySchedule } from './rosterEngine';


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

  // 2. Profile update requests are strictly Higher Management only
  if (['profile_update', 'profile_edit', 'profile_update_request'].includes(req.type) || String(req.type || '').includes('profile')) {
    return false;
  }

  // 3. Direct-to-admin flags
  if (req.targetApproval === 'admin_only' || req.targetApproval === 'admin' || req.branchNotRequired || req.isDirectToAdmin) {
    return false;
  }

  // 4. Evaluations and complaints are direct to upper management
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
  const targetBranchId = req.branchId || emp?.branchesDetails?.[0]?.branchId || emp?.branchId;
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
 * Strictly deduplicates duplicate entries created across state.leaveRequests, state.requests, and state.leaveHistory
 */
export function getEmployeeApprovedLeaves(emp, state, periodFilterFn = null) {
  if (!emp) return [];
  const empIdStr = String(emp.id || '').trim();
  const empCodeStr = String(emp.code || '').trim();

  const fromRequests = (state?.requests || []).filter(
    (r) =>
      (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)) &&
      (r.type === 'leave' || r.type === 'leave_request' || r.type === 'annual_leave' || r.type === 'unpaid_leave' || r.type === 'sick_leave' || r.leaveType)
  );

  const fromLeaveRequests = (state?.leaveRequests || []).filter(
    (r) =>
      String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)
  );

  const fromLeaveHistory = (state?.leaveHistory || []).filter(
    (r) =>
      String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode) === empCodeStr)
  );

  const fromEmpHistory = Array.isArray(emp?.leaveHistory) ? emp.leaveHistory : [];
  const fromEmpLeaves = Array.isArray(emp?.approvedLeaves) ? emp.approvedLeaves : [];

  const candidateList = [...fromLeaveHistory, ...fromEmpHistory, ...fromEmpLeaves, ...fromLeaveRequests, ...fromRequests];
  const uniqueMap = new Map();
  const seenDateKeySet = new Set();

  candidateList.forEach((r) => {
    if (!r) return;
    const isApproved = r.status === 'approved' || r.adminApproved === true || (!r.status && !r.isCancelled);
    if (!isApproved) return;

    const sDate = r.startDate || r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '');
    const eDate = r.endDate || r.date || sDate;
    if (periodFilterFn && sDate) {
      if (!periodFilterFn(sDate) && (!eDate || !periodFilterFn(eDate))) {
        return;
      }
    }

    const cleanLeaveType = (r.leaveType === 'unpaid' || r.type === 'unpaid_leave' || r.isUnpaid)
      ? 'unpaid'
      : (r.leaveType === 'sick' || r.type === 'sick_leave')
      ? 'sick'
      : 'annual';

    // Deduplication signature key by employee + start date + end date + leave type
    const sigKey = `${empIdStr || empCodeStr}_${sDate}_${eDate}_${cleanLeaveType}`;
    if (sDate && seenDateKeySet.has(sigKey)) return;
    if (sDate) seenDateKeySet.add(sigKey);

    const rId = String(r.id || sigKey);
    uniqueMap.set(rId, {
      ...r,
      leaveType: cleanLeaveType,
      startDate: sDate,
      endDate: eDate,
      daysCount: parseFloat(r.daysCount || r.days || 1) || 1,
      status: 'approved'
    });
  });

  return Array.from(uniqueMap.values()).sort((a, b) => {
    const getT = (r) => {
      if (!r) return 0;
      if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
      return 0;
    };
    return getT(b) - getT(a);
  });
}

export const getUniqueApprovedLeavesForEmployee = getEmployeeApprovedLeaves;

/**
 * Calculates annual leave total, taken days, and remaining balance for an employee
 */
export function calculateEmployeeLeaveStats(emp, state, targetYear = '') {
  if (!emp) return { annualTotal: 21, takenAnnualDays: 0, remainingAnnualDays: 21, approvedLeaves: [] };
  const year = targetYear || todayStr().slice(0, 4);
  const annualTotal = emp.annualLeaveBalance !== undefined ? parseInt(emp.annualLeaveBalance, 10) : 21;
  const allLeaves = getEmployeeApprovedLeaves(emp, state);

  const approvedAnnualLeaves = allLeaves.filter((r) => {
    const isAnnual = !r.leaveType || r.leaveType === 'annual' || r.type === 'annual_leave' || r.type === 'leave';
    const isAppr = r.status === 'approved' || r.adminApproved;
    const start = String(r.startDate || r.date || '');
    const inYear = !year || start.startsWith(year);
    return isAnnual && isAppr && inYear;
  });

  const leavesSum = approvedAnnualLeaves.reduce((acc, r) => acc + (parseInt(r.daysCount || r.days || 1, 10)), 0);
  const manualTaken = parseInt(emp.manualTakenAnnualDays || emp.takenAnnualLeaves || emp.usedAnnualDays || 0, 10) || 0;
  const takenAnnualDays = leavesSum + manualTaken;
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
  if (s === 'تم الاستقالة' || s === 'resigned' || s === 'terminated' || s === 'منتهية خدمته' || s === 'مستقيل' || s === 'inactive') return false;
  if (emp.isTerminated === true || emp.isResigned === true) return false;
  if (emp.resignationStatus === 'approved') return false;
  return true;
}

/**
 * مترجم موحد لكافة أنواع الطلبات في النظام لضمان عدم ظهور أي نصوص إنجليزية
 */
export function getRequestTypeArabicName(type, leaveType) {
  const cleanType = String(type || '').trim().toLowerCase();
  const cleanLeaveType = String(leaveType || '').trim().toLowerCase();

  if (cleanType === 'leave' || cleanType === 'leave_request' || cleanType === 'annual_leave' || cleanType === 'sick_leave' || cleanType === 'unpaid_leave') {
    if (cleanLeaveType === 'annual' || cleanType === 'annual_leave') return '🏖️ إجازة سنوية';
    if (cleanLeaveType === 'unpaid' || cleanType === 'unpaid_leave') return '⏱️ إجازة غير مدفوعة';
    if (cleanLeaveType === 'sick' || cleanType === 'sick_leave') return '🏥 إجازة مرضية';
    if (cleanLeaveType === 'casual') return '🌴 إجازة عارضة';
    if (cleanLeaveType === 'marriage') return '💍 إجازة زواج';
    if (cleanLeaveType === 'maternity') return '👶 إجازة وضع';
    if (cleanLeaveType === 'bereavement') return '🖤 إجازة وفاة';
    return '🏖️ طلب إجازة';
  }

  if (cleanType === 'disciplinary_penalty' || cleanType === 'violation' || cleanType === 'disciplinary') {
    return '⚠️ جزاء تأديبي لائحي';
  }
  if (cleanType === 'penalty' || cleanType === 'deduction' || cleanType === 'late_penalty') {
    return '⚠️ خصم / جزاء مالي';
  }
  if (cleanType === 'early_exit' || cleanType === 'early_leave') {
    return '⚠️ انصراف مبكر';
  }
  if (cleanType === 'late_permission' || cleanType === 'late_excuse') {
    return '⏰ إذن تأخير صباحي';
  }
  if (cleanType === 'permission' || cleanType === 'إذن') {
    return '⏰ إذن خروج / تأخير';
  }
  if (cleanType === 'loan' || cleanType === 'advance' || cleanType === 'سلفة') {
    return '💳 سلفة مالية';
  }
  if (cleanType === 'meds' || cleanType === 'credit_medicine' || cleanType === 'أدوية') {
    return '💊 أدوية آجل';
  }
  if (cleanType === 'swap' || cleanType === 'shift_swap' || cleanType === 'تبديل') {
    return '🔄 تبديل وردية';
  }
  if (cleanType === 'roster_update' || cleanType === 'roster_edit' || cleanType === 'roster_edit_request' || cleanType === 'schedule_edit') {
    return '📅 تعديل جدول شهري';
  }
  if (cleanType === 'bonus' || cleanType === 'reward' || cleanType === 'مكافأة') {
    return '🏆 إضافة مكافأة';
  }
  if (cleanType === 'overtime' || cleanType === 'overtime_request' || cleanType === 'إضافي') {
    return '⭐ ساعات إضافية';
  }
  if (cleanType === 'eval_edit_request' || cleanType === 'complaint' || cleanType === 'شكوى') {
    return '📋 شكوى / ملاحظة';
  }
  if (cleanType === 'resignation' || cleanType === 'resignation_request' || cleanType === 'استقالة') {
    return '🚪 طلب استقالة';
  }
  if (cleanType === 'withdraw' || cleanType === 'resignation_withdraw') {
    return '↩️ تراجع عن استقالة';
  }
  if (cleanType === 'punch_correction' || cleanType === 'attendance_punch' || cleanType === 'تأكيد بصمة الوجه') {
    return '📸 تأكيد بصمة الوجه';
  }
  if (cleanType === 'adjustment') {
    return '⚖️ تعديل إداري / مالي';
  }

  if (/[a-zA-Z]/.test(type)) {
    return 'طلب إداري';
  }
  return type || 'طلب إداري';
}

/**
 * Checks if a shift was registered manually
 */
export function isShiftManualPunch(shift) {
  if (!shift) return false;
  if (shift.isManual || shift.manualPunch || shift.source === 'manual' || shift.source === 'manual_admin') {
    return true;
  }
  const note = String(shift.note || '');
  const statusLabel = String(shift.statusLabel || '');
  if (note.includes('بصمة يدوية') || note.includes('تسجيل يدوي') || note.includes('يدوياً') || note.includes('يدوي')) {
    return true;
  }
  if (statusLabel.includes('يدوي') || statusLabel.includes('بصمة يدوية')) {
    return true;
  }
  return false;
}

/**
 * Calculates total manual punches registered for an employee in the specified monthly cycle / filter
 */
export function getEmployeeManualPunchesCount(empId, state, filterFn) {
  if (!empId || !state) return 0;
  const empIdStr = String(empId);
  const emp = (state.employees || []).find(e => String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  const shifts = (state.shifts || []).filter(s => {
    if (!s || !s.date) return false;
    const matchEmp = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode || s.employeeId) === empCodeStr);
    if (!matchEmp) return false;
    if (filterFn && typeof filterFn === 'function' && !filterFn(s.date)) return false;
    return isShiftManualPunch(s);
  });

  return shifts.length;
}


