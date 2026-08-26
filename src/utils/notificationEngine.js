/**
 * Notification Engine for HR Pharmacy System
 * Handles creation, filtering, and marking of notifications across Admin, Branch, and Employee Portals.
 */

export const REQUEST_TYPE_LABELS = {
  leave: 'طلب إجازة',
  leave_request: 'طلب إجازة',
  permission: 'طلب إذن استئذان',
  loan: 'طلب سلفة نقدية',
  advance: 'طلب سلفة نقدية',
  meds: 'طلب مشتريات أدوية آجل',
  credit_medicine: 'طلب مشتريات أدوية آجل',
  swap: 'طلب تبديل وردية',
  shift_swap: 'طلب تبديل وردية',
  roster: 'الجدول الشهري',
  roster_update: 'تحديث الجدول الشهري',
  roster_edit: 'تعديل الجدول الشهري',
  resignation: 'طلب استقالة',
  overtime: 'طلب ساعات إضافي',
  bonus: 'مكافأة مالية',
  penalty: 'خصم جزاء لائحى',
  early_exit: 'إذن خروج مبكر',
  manual_punch: 'طلب تسجيل بصمة يدوية'
};

export function getRequestTypeArabicLabel(type) {
  if (!type) return 'طلب إداري';
  return REQUEST_TYPE_LABELS[type] || type;
}

/**
 * Creates a standard notification object for approval/rejection decisions
 */
export function createRequestDecisionNotification({
  requestId,
  employeeId,
  type = 'request',
  action = 'approved', // 'approved' | 'rejected'
  approverRole = 'admin', // 'admin' | 'branch'
  approverName = '',
  details = '',
  customTitle = '',
  customMessage = ''
}) {
  const isApproved = action === 'approved';
  const roleName = approverRole === 'admin' ? 'الإدارة العليا' : (approverName || 'مدير الفرع');
  const typeName = getRequestTypeArabicLabel(type);

  let title = customTitle;
  if (!title) {
    title = isApproved ? `✅ موافقة ${roleName}` : `❌ رفض الطلب من ${roleName}`;
  }

  let message = customMessage;
  if (!message) {
    if (isApproved) {
      message = `تمت الموافقة واعتماد (${typeName}) الخاص بك بنجاح من قِبل ${roleName}.${details ? ` التفاصيل: ${details}` : ''}`;
    } else {
      message = `تم رفض (${typeName}) الخاص بك من قِبل ${roleName}.${details ? ` السبب: ${details}` : ''}`;
    }
  }

  const iconMap = {
    leave: '🏖️',
    leave_request: '🏖️',
    permission: '⏰',
    loan: '💳',
    advance: '💳',
    meds: '💊',
    credit_medicine: '💊',
    swap: '🔄',
    shift_swap: '🔄',
    roster: '📅',
    roster_update: '📅',
    roster_edit: '📅',
    resignation: '🚪',
    overtime: '⭐',
    bonus: '🎁',
    penalty: '⚖️',
    early_exit: '🚪',
    manual_punch: '⏱️'
  };

  const icon = iconMap[type] || (isApproved ? '✅' : '❌');

  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    requestId: requestId || null,
    employeeId: employeeId ? String(employeeId) : null,
    targetEmployeeId: employeeId ? String(employeeId) : null,
    targetRole: 'employee',
    type: type || 'request',
    typeLabel: typeName,
    icon,
    action,
    approverRole,
    title,
    message,
    details: details || '',
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
    read: false,
    readBy: []
  };
}

/**
 * Filter notifications strictly meant for a specific employee
 */
export function filterEmployeeNotifications(notifications = [], employeeId = null) {
  if (!employeeId) return [];
  const empIdStr = String(employeeId).trim();
  return (notifications || []).filter((n) => {
    if (!n) return false;

    // 1. Explicit admin or branch manager operational alerts should NEVER show to employees
    if (n.targetRole === 'admin' || n.targetRole === 'owner' || n.targetRole === 'branch' || n.targetRole === 'branch_manager' || n.targetRole === 'manager' || n.targetRole === 'branch_and_admin') {
      return false;
    }
    if (n.targetApproval === 'admin_only' || n.submittedByBranchManager) {
      return false;
    }

    // 2. Direct match by targetEmployeeId (standard for employee decision notifications and shift swaps)
    if (n.targetEmployeeId && String(n.targetEmployeeId).trim() === empIdStr) {
      return true;
    }

    // 3. Targeted specifically to employee role
    if (n.targetRole === 'employee') {
      if (n.targetEmployeeId && String(n.targetEmployeeId).trim() === empIdStr) return true;
      if (n.employeeId && String(n.employeeId).trim() === empIdStr) return true;
      return false;
    }

    // 4. Decision notifications (approvals / rejections) for this employee
    if ((n.action === 'approved' || n.action === 'rejected' || n.action === 'decision') && (String(n.employeeId).trim() === empIdStr || String(n.targetEmployeeId).trim() === empIdStr)) {
      return true;
    }

    // 5. Broadcasts to all employees
    if (n.targetRole === 'all_employees' || n.type === 'broadcast' || n.type === 'announcement') {
      return true;
    }

    return false;
  }).sort((a, b) => {
    const tA = new Date(a.timestamp || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.date || 0).getTime();
    return tB - tA;
  });
}

/**
 * Filter notifications meant for Senior Management / Admins
 */
export function filterAdminNotifications(notifications = []) {
  return (notifications || []).filter((n) => {
    if (!n) return false;

    // 1. Never show employee-targeted decision confirmations (e.g. "موافقة الإدارة العليا... الخاص بك") to Admin
    if (n.targetRole === 'employee' || n.targetRole === 'all_employees') {
      return false;
    }
    if (n.targetEmployeeId && (n.action === 'approved' || n.action === 'rejected' || n.action === 'decision')) {
      return false;
    }
    if (n.title && (n.title.includes('الخاص بك') || n.message?.includes('الخاص بك') || n.title.includes('موافقة الإدارة العليا') || n.title.includes('رفض الطلب من الإدارة العليا'))) {
      return false;
    }

    // 2. Never show branch-only alerts to Senior Admin
    if (n.targetRole === 'branch_manager' || n.targetRole === 'branch') {
      return false;
    }

    // 3. Explicitly targeted to Admin / Owner / Management
    if (n.targetRole === 'admin' || n.targetRole === 'owner' || n.targetRole === 'branch_and_admin') {
      return true;
    }

    // 4. Default incoming request notifications (without decision action)
    if (!n.action || n.action === 'pending' || n.action === 'submitted') {
      return true;
    }

    return false;
  }).sort((a, b) => {
    const tA = new Date(a.timestamp || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.date || 0).getTime();
    return tB - tA;
  });
}

/**
 * Filter notifications strictly meant for Branch Managers
 * Isolates branch manager notifications completely from Admin / Super Admin and other branches
 */
export function filterBranchManagerNotifications(notifications = [], currentBranch = null, managerEmpId = null, state = null) {
  const branchIdStr = currentBranch?.id ? String(currentBranch.id).trim() : null;
  const branchName = currentBranch?.name ? currentBranch.name.trim() : null;
  const mgrIdStr = managerEmpId ? String(managerEmpId).trim() : null;

  // Set of employee IDs belonging to this branch
  const branchEmpIds = new Set();
  if (state?.employees && branchIdStr) {
    state.employees.forEach((emp) => {
      if (String(emp.branchId) === branchIdStr || (emp.branchesDetails && emp.branchesDetails.some(bd => String(bd.branchId) === branchIdStr))) {
        branchEmpIds.add(String(emp.id));
        if (emp.code) branchEmpIds.add(String(emp.code));
      }
    });
  }

  return (notifications || []).filter((n) => {
    if (!n) return false;

    // 1. Strictly block notifications aimed exclusively at senior management / super admin / owner
    if (n.targetRole === 'admin' || n.targetRole === 'owner' || n.targetApproval === 'admin_only') {
      return false;
    }

    // 2. Block general employee personal decisions unless targeted to this manager directly
    if (n.targetRole === 'employee') {
      if (mgrIdStr && (String(n.targetEmployeeId).trim() === mgrIdStr || String(n.employeeId).trim() === mgrIdStr)) {
        return true;
      }
      return false;
    }

    // 3. Notifications explicitly targeted to branch manager
    if (n.targetRole === 'branch' || n.targetRole === 'branch_manager' || n.targetRole === 'manager') {
      if (!branchIdStr) return true;
      if (n.branchId && String(n.branchId).trim() === branchIdStr) return true;
      if (n.branchName && branchName && n.branchName === branchName) return true;
      if (n.employeeId && branchEmpIds.has(String(n.employeeId).trim())) return true;
      if (!n.branchId && !n.branchName) return true; // General branch update
      return false;
    }

    // 4. Branch-specific operational notifications or requests from employees of this branch
    if (n.branchId && branchIdStr && String(n.branchId).trim() === branchIdStr) {
      return true;
    }
    if (n.employeeId && branchEmpIds.has(String(n.employeeId).trim())) {
      return true;
    }

    return false;
  }).sort((a, b) => {
    const tA = new Date(a.timestamp || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.date || 0).getTime();
    return tB - tA;
  });
}

/**
 * Count unread notifications for a specific employee
 */
export function countUnreadEmployeeNotifications(notifications = [], employeeId = null) {
  const empNotifs = filterEmployeeNotifications(notifications, employeeId);
  return empNotifs.filter((n) => !n.read).length;
}

/**
 * Count unread notifications for a branch manager
 */
export function countUnreadBranchManagerNotifications(notifications = [], currentBranch = null, managerEmpId = null, state = null) {
  const branchNotifs = filterBranchManagerNotifications(notifications, currentBranch, managerEmpId, state);
  return branchNotifs.filter((n) => !n.read).length;
}

