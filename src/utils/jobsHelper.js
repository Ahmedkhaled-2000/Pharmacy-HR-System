export const DEFAULT_DEPARTMENTS = [
  'الصيدلية',
  'المخازن',
  'الإدارة',
  'الحسابات والمالية',
  'المشتريات',
  'الموارد البشرية (HR)',
  'خدمة التوصيل (الدليفري)',
  'تقنية المعلومات والدعم الفني'
];

export const DEFAULT_JOBS = [
  { id: 'job_1', title: 'صيدلي أول', isManagement: false, department: 'الصيدلية', description: 'صيدلي ذو خبرة وإشراف طبي مهني داخل الفرع' },
  { id: 'job_2', title: 'مدير فرع', isManagement: true, department: 'الإدارة', description: 'إدارة العمليات اليومية للفرع والمبيعات' },
  { id: 'job_3', title: 'مدير إداري', isManagement: true, department: 'الإدارة', description: 'إدارة شؤون العاملين والمتابعة الإدارية' },
  { id: 'job_4', title: 'صيدلي', isManagement: false, department: 'الصيدلية', description: 'صرف الأدوية وتقديم المشورة الطبية' },
  { id: 'job_5', title: 'مساعد صيدلي', isManagement: false, department: 'الصيدلية', description: 'مساعدة الصيدلي وترتيب الأدوية والرفوف' },
  { id: 'job_6', title: 'كاشير', isManagement: false, department: 'الحسابات والمالية', description: 'تحصيل الإيرادات وحسابات الصندوق' },
  { id: 'job_7', title: 'مدخل بيانات', isManagement: false, department: 'المخازن', description: 'إدخال الفواتير وتحديث بيانات الأصناف' },
  { id: 'job_8', title: 'مسؤول مخزن', isManagement: false, department: 'المخازن', description: 'جرد البضائع واستلام طلبيات الأدوية' },
  { id: 'job_9', title: 'خدمة توصيل (دليفري)', isManagement: false, department: 'خدمة التوصيل (الدليفري)', description: 'توصيل الطلبات للعملاء' }
];

export function getDepartmentsList(state) {
  if (state?.departments && Array.isArray(state.departments) && state.departments.length > 0) {
    return state.departments;
  }
  if (state?.orgSettings?.departments && Array.isArray(state.orgSettings.departments) && state.orgSettings.departments.length > 0) {
    return state.orgSettings.departments;
  }
  return DEFAULT_DEPARTMENTS;
}

export function getJobsList(state) {
  if (state?.jobs && Array.isArray(state.jobs) && state.jobs.length > 0) {
    return state.jobs;
  }
  if (state?.orgSettings?.jobs && Array.isArray(state.orgSettings.jobs) && state.orgSettings.jobs.length > 0) {
    return state.orgSettings.jobs;
  }
  return DEFAULT_JOBS;
}

/**
 * Checks whether a job title belongs to Upper / Executive Management.
 * Branch staff (pharmacists, senior pharmacists, cashiers, assistants, etc.) are strictly NOT executive management.
 */
export function isManagementJob(jobTitle, jobsList = DEFAULT_JOBS) {
  if (!jobTitle) return false;
  const cleanTitle = String(jobTitle).trim();
  const lower = cleanTitle.toLowerCase();

  // Branch staff exemptions (must report to branch manager)
  if (
    lower.includes('صيدلي') ||
    lower.includes('مساعد صيدلي') ||
    lower.includes('كاشير') ||
    lower.includes('دليفري') ||
    lower.includes('توصيل') ||
    lower.includes('مدخل بيانات') ||
    lower.includes('مسؤول مخزن') ||
    lower.includes('مسئول مخزن') ||
    lower.includes('أمين مخزن') ||
    lower.includes('عامل')
  ) {
    return false;
  }

  const matched = (jobsList || []).find(
    (j) => j.title?.trim() === cleanTitle || j.name?.trim() === cleanTitle || j.id === cleanTitle
  );
  if (matched) {
    if (Boolean(matched.isManagement || matched.isAdminRole)) return true;
    const dept = String(matched.department || '').trim().toLowerCase();
    if (dept.includes('إدارة عليا') || dept.includes('ادارة عليا') || dept.includes('hr') || dept.includes('admin')) {
      return true;
    }
  }

  // True Upper / Executive Management heuristics
  return (
    lower.includes('مدير عام') ||
    lower.includes('رئيس مجلس') ||
    lower.includes('مدير تنفيذي') ||
    lower.includes('مدير إداري') ||
    lower.includes('مدير اداري') ||
    lower.includes('مدير قطاع') ||
    lower.includes('مدير موارد بشرية') ||
    lower.includes('مدير مالي') ||
    lower.includes('مدير تشغيل') ||
    lower.includes('owner') ||
    lower.includes('general manager') ||
    lower.includes('executive') ||
    lower.includes('director') ||
    lower.includes('hr manager')
  );
}

/**
 * Checks whether an employee belongs to Upper Management (Admin / Owner / GM / HR Head).
 */
export function isUpperManagementEmp(emp) {
  if (!emp) return false;
  if (emp.role === 'admin' || emp.role === 'owner') return true;

  const cleanDept = String(emp.department || '').trim().toLowerCase();
  if (
    cleanDept.includes('إدارة عليا') ||
    cleanDept.includes('ادارة عليا') ||
    cleanDept.includes('موارد بشرية') ||
    cleanDept.includes('hr') ||
    cleanDept.includes('الموارد البشرية')
  ) {
    return true;
  }

  if (isManagementJob(emp.jobTitle)) {
    return true;
  }

  return false;
}

/**
 * Checks whether an employee is the assigned Branch Manager of a given branch (or any branch).
 */
export function isEmployeeBranchManager(emp, branchId = null, state = null) {
  if (!emp) return false;

  if (emp.isBranchManager || emp.role === 'branch_manager') {
    return true;
  }

  const cleanTitle = String(emp.jobTitle || '').trim().toLowerCase();
  if (cleanTitle === 'مدير فرع' || cleanTitle === 'مدير الفرع') {
    return true;
  }

  if (state?.branches && Array.isArray(state.branches)) {
    const branchesToCheck = branchId
      ? state.branches.filter((b) => String(b.id) === String(branchId) || String(b.branchCode) === String(branchId))
      : state.branches;

    const isAssigned = branchesToCheck.some(
      (b) =>
        (b.managerId && (String(b.managerId) === String(emp.id) || (emp.code && String(b.managerId) === String(emp.code)))) ||
        (b.managerCode && (String(b.managerCode) === String(emp.code) || String(b.managerCode) === String(emp.id))) ||
        (b.managerName && emp.name && b.managerName.trim() === emp.name.trim())
    );
    if (isAssigned) return true;
  }

  return false;
}

/**
 * Checks whether a branch exists and has NO assigned manager in settings.
 */
export function isBranchWithoutManager(branchId, state) {
  if (!branchId || !state?.branches || !Array.isArray(state.branches)) return false;
  const targetStr = String(branchId).trim();
  if (!targetStr) return false;

  const branch = state.branches.find(
    (b) => String(b.id) === targetStr || String(b.branchCode) === targetStr || b.name === targetStr
  );
  if (!branch) return false;

  if (!branch.managerId || branch.managerId === 'none' || String(branch.managerId).trim() === '') {
    return true;
  }

  if (state.employees && Array.isArray(state.employees)) {
    const mgrEmp = state.employees.find(e => String(e.id) === String(branch.managerId));
    if (!mgrEmp) return true;
  }

  return false;
}

/**
 * Normalizes request type to standard internal keys
 */
export function normalizeRequestType(type) {
  if (!type) return '';
  const clean = String(type).trim().toLowerCase();
  if (['roster_update', 'roster_edit', 'roster_edit_request', 'schedule_edit'].includes(clean)) {
    return 'roster_edit';
  }
  if (['leave', 'leave_request', 'annual_leave', 'casual_leave', 'sick_leave', 'unpaid_leave'].includes(clean)) {
    return 'leave';
  }
  if (['swap', 'shift_swap'].includes(clean)) {
    return 'swap';
  }
  if (['permission', 'delay', 'early_leave', 'delay_incident'].includes(clean)) {
    return 'permission';
  }
  if (['bonus', 'reward'].includes(clean)) {
    return 'bonus';
  }
  if (['overtime', 'extra_hours', 'overtime_request'].includes(clean)) {
    return 'overtime';
  }
  if (['penalty_appeal', 'penalty_objection', 'objection'].includes(clean)) {
    return 'penalty_objection';
  }
  if (['loan', 'advance'].includes(clean)) {
    return 'loan';
  }
  if (['credit_medicine', 'meds'].includes(clean)) {
    return 'credit_medicine';
  }
  if (['resignation', 'resignation_request'].includes(clean)) {
    return 'resignation';
  }
  if (['profile_update', 'profile_edit', 'profile_update_request'].includes(clean)) {
    return 'profile_update';
  }
  return clean;
}

/**
 * Checks whether a request requires Dual Approval (Branch Manager + Higher Management).
 * Adheres strictly to Higher Management double approval rules (state.approvalRules).
 */
export function isDualApprovalRequest(reqOrType, state = null) {
  if (!reqOrType) return false;
  const type = typeof reqOrType === 'string' ? reqOrType : reqOrType.type;
  const normType = normalizeRequestType(type);

  // 1. Inherently Single-Level Admin-Only requests (NEVER dual approval)
  const adminOnlyTypes = [
    'loan',
    'advance',
    'credit_medicine',
    'meds',
    'complaint',
    'eval_edit_request',
    'profile_update',
    'penalty_objection',
    'biometric_registration',
    'biometric_reset'
  ];
  if (adminOnlyTypes.includes(normType)) {
    return false;
  }

  // 2. Check Higher Management double approval rules in state
  const rules = state?.approvalRules || [];
  if (Array.isArray(rules) && rules.length > 0) {
    // Specific rule match
    const matched = rules.find((r) => {
      const rType = normalizeRequestType(r.requestType || r.id?.replace('rule_', ''));
      return rType === normType || (normType === 'roster_edit' && (r.id === 'rule_roster_edit' || r.requestType === 'roster_update'));
    });

    if (matched) {
      const needsBranch = matched.reqBranch !== false && matched.requiresBranchManager !== false;
      const needsAdmin = matched.reqAdmin !== false && matched.requiresSuperAdmin !== false;
      return needsBranch && needsAdmin;
    }

    // Leave threshold rule check (> 3 days vs <= 3 days)
    if (normType === 'leave') {
      const days = typeof reqOrType === 'object' ? parseFloat(reqOrType.daysCount || reqOrType.days || 1) : 1;
      if (days > 3) {
        const longRule = rules.find(r => r.id === 'rule_leave_over_3_days' || r.id === 'rule_long_leave');
        if (longRule && (longRule.reqBranch === false || longRule.requiresBranchManager === false)) {
          return false;
        }
      } else {
        const shortRule = rules.find(r => r.id === 'rule_leave');
        if (shortRule) {
          const needsBranch = shortRule.reqBranch !== false && shortRule.requiresBranchManager !== false;
          const needsAdmin = shortRule.reqAdmin !== false && shortRule.requiresSuperAdmin !== false;
          return needsBranch && needsAdmin;
        }
      }
    }
  }

  // 3. Default Operational Requests requiring Dual Approval:
  // - Monthly Roster Edits / Updates
  // - Leaves (<= 3 days or regular leaves)
  // - Shift Swaps
  // - Permissions & Delays
  // - Bonuses
  // - Overtime hours
  // - Biometric Verification (Photo Punch)
  const defaultDualTypes = [
    'roster_edit',
    'leave',
    'swap',
    'permission',
    'bonus',
    'overtime',
    'biometric_verification'
  ];

  return defaultDualTypes.includes(normType);
}

/**
 * Determines whether requests for a given employee should be routed directly to Upper Management (Admin).
 * When `req` is a Dual Approval request (e.g. roster edit, leave, swap, permission),
 * branch staff requests MUST ALWAYS go to the Branch Manager first!
 * Only requests by the Branch Manager themselves or Upper Management bypass the branch.
 */
export function shouldRouteDirectToAdmin(emp, branchId, state, req = null) {
  if (!emp) return false;

  // If this is a Dual Approval request, staff requests must NEVER route direct to admin
  if (req && isDualApprovalRequest(req, state)) {
    return isEmployeeBranchManager(emp, branchId, state) || isUpperManagementEmp(emp);
  }

  // If employee is Upper Management (Admin / Owner / GM / HR Head)
  if (isUpperManagementEmp(emp)) {
    return true;
  }

  // If employee is the Branch Manager of this branch
  if (isEmployeeBranchManager(emp, branchId, state)) {
    return true;
  }

  return false;
}


