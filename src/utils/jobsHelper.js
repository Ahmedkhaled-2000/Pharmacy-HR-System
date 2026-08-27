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
  { id: 'job_1', title: 'صيدلي أول', isManagement: true, department: 'الصيدلية', description: 'إشراف ومتابعة الفرع وإدارة الكادر الطبي' },
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

export function isManagementJob(jobTitle, jobsList = DEFAULT_JOBS) {
  if (!jobTitle) return false;
  const cleanTitle = String(jobTitle).trim();
  const matched = (jobsList || []).find(
    (j) => j.title?.trim() === cleanTitle || j.name?.trim() === cleanTitle || j.id === cleanTitle
  );
  if (matched) return Boolean(matched.isManagement || matched.isAdminRole);
  
  // Fallback heuristics for common management titles
  const lower = cleanTitle.toLowerCase();
  return (
    lower.includes('مدير') ||
    lower.includes('إداري') ||
    lower.includes('مسؤول') ||
    lower.includes('أول') ||
    lower.includes('مشرف') ||
    lower.includes('hr')
  );
}

/**
 * Checks whether a branch exists and has NO assigned manager.
 * If there is no manager (empty or 'none' or null), returns true.
 */
export function isBranchWithoutManager(branchId, state) {
  if (!branchId || !state?.branches || !Array.isArray(state.branches)) return false;
  const targetStr = String(branchId).trim();
  if (!targetStr) return false;

  const branch = state.branches.find(
    (b) => String(b.id) === targetStr || String(b.branchCode) === targetStr || b.name === targetStr
  );
  if (!branch) return false;
  
  // Check if manager is explicitly empty, 'none', or not set
  if (!branch.managerId || branch.managerId === 'none' || String(branch.managerId).trim() === '') {
    return true;
  }
  
  // Verify if assigned manager exists in employees list
  if (state.employees && Array.isArray(state.employees)) {
    const mgrEmp = state.employees.find(e => String(e.id) === String(branch.managerId));
    if (!mgrEmp) return true;
  }

  return false;
}

/**
 * Determines whether requests for a given employee should be routed directly to Upper Management (Admin).
 * Conditions:
 * 1. The employee holds an administrative/management job title (eligible for management allowance).
 * 2. The employee's branch has no assigned manager.
 */
export function shouldRouteDirectToAdmin(emp, branchId, state) {
  if (!emp) return false;
  const jobsList = getJobsList(state);
  
  // 1. Employee holds an administrative job title
  if (isManagementJob(emp.jobTitle, jobsList)) {
    return true;
  }
  
  // 2. Employee's target branch has no manager
  const targetBranchId = branchId || emp.branchesDetails?.[0]?.branchId || emp.branchId;
  if (targetBranchId && isBranchWithoutManager(targetBranchId, state)) {
    return true;
  }
  
  return false;
}

