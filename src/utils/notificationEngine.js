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
    creatorRole: approverRole,
    isAdminCreated: approverRole === 'admin',
    hiddenFromAdmin: true,
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
 * Strictly prevents self-notifications when Admin executes any action, punch, or adjustment
 */
export function filterAdminNotifications(notifications = []) {
  return (notifications || []).filter((n) => {
    if (!n) return false;

    // 1. Never show notifications marked as hidden from Admin or created by Admin for employees
    if (n.hiddenFromAdmin === true || n.creatorRole === 'admin' || n.createdBy === 'admin' || n.isAdminCreated === true || n.submittedByAdmin === true) {
      return false;
    }

    // 2. Never show employee-targeted notifications or decision confirmations (e.g. approvals, rejections, direct adjustments, manual punches)
    if (n.targetRole === 'employee' || n.targetRole === 'all_employees') {
      return false;
    }
    if (n.targetEmployeeId && (n.action === 'approved' || n.action === 'rejected' || n.action === 'decision' || n.action === 'penalty' || n.action === 'bonus' || n.action === 'punch' || n.action === 'manual_punch')) {
      return false;
    }
    if (n.title && (
      n.title.includes('الخاص بك') ||
      n.message?.includes('الخاص بك') ||
      n.title.includes('موافقة الإدارة العليا') ||
      n.title.includes('رفض الطلب من الإدارة العليا') ||
      n.title.includes('تم تسجيل بصمة') ||
      n.title.includes('تم تطبيق خصم') ||
      n.title.includes('تمت إضافة مكافأة') ||
      n.title.includes('تم اعتماد السلفة') ||
      n.title.includes('تم اعتماد طلب')
    )) {
      return false;
    }

    // 3. Never show branch-only alerts to Senior Admin
    if (n.targetRole === 'branch_manager' || n.targetRole === 'branch') {
      return false;
    }

    // 4. Explicitly targeted to Admin / Owner / Management
    if (n.targetRole === 'admin' || n.targetRole === 'owner' || n.targetRole === 'branch_and_admin') {
      return true;
    }

    // 5. Default incoming request notifications from employees or branch managers (waiting for admin action)
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

/**
 * دالة ذكية لتحديد الصفحة / التبويب المستهدف عند الضغط على أي إشعار
 * تدعم الإدارة العليا، مدير الفرع، وبوابة الموظف
 */
export function getNotificationTargetTab(notification, role = 'admin') {
  if (!notification) {
    return role === 'employee' ? 'dashboard' : 'requests';
  }

  const type = String(notification.type || '').toLowerCase();
  const reqId = String(notification.requestId || '').toLowerCase();
  const title = String(notification.title || '').toLowerCase();
  const msg = String(notification.message || notification.body || '').toLowerCase();

  // 1. بوابة الموظف (Employee Portal)
  if (role === 'employee') {
    if (notification.linkTab && ['leaves', 'permissions', 'loans', 'swaps', 'resignations', 'evaluations', 'salary', 'adjustments', 'shifts', 'roster', 'bylaws', 'dashboard'].includes(notification.linkTab)) {
      return notification.linkTab;
    }
    if (type.includes('leave') || reqId.startsWith('leave_') || title.includes('إجاز') || title.includes('اجاز')) return 'leaves';
    if (type.includes('perm') || reqId.startsWith('perm_') || title.includes('إذن') || title.includes('اذن') || title.includes('استئذان')) return 'permissions';
    if (type.includes('loan') || type.includes('med') || type.includes('advance') || reqId.startsWith('loan_') || reqId.startsWith('medreq_') || title.includes('سلف') || title.includes('أدوي') || title.includes('ادوي') || title.includes('آجل')) return 'loans';
    if (type.includes('swap') || reqId.startsWith('swap_') || title.includes('تبديل') || title.includes('شفت') || title.includes('ورد')) return 'swaps';
    if (type.includes('resign') || reqId.startsWith('res_') || title.includes('استقال')) return 'resignations';
    if (type.includes('eval') || type.includes('complaint') || title.includes('تقييم') || title.includes('شكو')) return 'evaluations';
    if (type.includes('salary') || type.includes('payroll') || type.includes('payslip') || title.includes('مرتب') || title.includes('راتب') || title.includes('أجر') || title.includes('مفردات')) return 'salary';
    if (type.includes('adj') || type.includes('penalty') || type.includes('bonus') || type.includes('deduct') || type.includes('late') || type.includes('early_exit') || type.includes('overtime') || title.includes('مكافأ') || title.includes('خصم') || title.includes('جزاء') || title.includes('تأخير') || title.includes('خروج') || title.includes('إضافي')) return 'adjustments';
    if (type.includes('punch') || type.includes('shift') || title.includes('بصم') || title.includes('حضور')) return 'shifts';
    if (type.includes('roster') || title.includes('جدول')) return 'roster';
    if (type.includes('bylaw') || title.includes('لائح')) return 'bylaws';
    return 'dashboard';
  }

  // 2. الإدارة العليا ومدير الفرع (Admin & Branch Manager)
  if (notification.linkTab) {
    return notification.linkTab;
  }

  // طلبات الموظفين (إجازات، أذونات، سلف، تبديل، استقالة) -> توجيه لمركز الطلبات أو الموافقات
  if (type.includes('leave') || reqId.startsWith('leave_') || title.includes('إجاز') || title.includes('اجاز')) return 'requests';
  if (type.includes('perm') || reqId.startsWith('perm_') || title.includes('إذن') || title.includes('اذن') || title.includes('استئذان')) return 'requests';
  if (type.includes('loan') || type.includes('med') || type.includes('advance') || reqId.startsWith('loan_') || reqId.startsWith('medreq_') || title.includes('سلف') || title.includes('أدوي') || title.includes('ادوي') || title.includes('آجل')) return role === 'branch' ? 'requests' : 'requests';
  if (type.includes('swap') || reqId.startsWith('swap_') || title.includes('تبديل')) return 'requests';
  if (type.includes('resign') || reqId.startsWith('res_') || title.includes('استقال')) return role === 'branch' ? 'requests' : 'requests';

  // التقييمات والشكاوى
  if (type.includes('eval') || type.includes('complaint') || title.includes('تقييم') || title.includes('شكو')) return 'evaluations';

  // الجداول والورديات
  if (type.includes('roster') || title.includes('جدول')) return 'roster';

  // الحضور والبصمات
  if (type.includes('punch') || type.includes('shift') || type.includes('biometric') || title.includes('بصم') || title.includes('حضور')) return 'attendance';

  // لائحة العمل والجزاءات والتأخير
  if (type.includes('late') || type.includes('early_exit') || type.includes('penalty') || type.includes('bylaw') || title.includes('تأخير') || title.includes('خروج') || title.includes('جزاء') || title.includes('لائح')) return 'bylaws';

  // الرواتب
  if (type.includes('payroll') || type.includes('salary') || title.includes('مرتب') || title.includes('راتب')) return 'payroll';

  // الفروع
  if (type.includes('branch') || title.includes('فرع')) return 'branches';

  // الموظفين
  if (type.includes('emp') || title.includes('موظف')) return 'employees';

  // الأرشيف
  if (type.includes('archive') || title.includes('أرشيف') || title.includes('فاتورة')) return 'pharmacy-archive';

  return 'requests';
}

/**
 * الحصول على اسم التبويب بالعربية لرسائل التوجيه
 */
export function getNotificationTabLabel(targetTab, role = 'admin') {
  const labels = {
    leaves: 'قسم الإجازات 🏖️',
    permissions: 'قسم الأذونات ⏰',
    'permissions-management': 'إدارة الأذونات ⏰',
    loans: 'قسم السلف والآجل 💳',
    'loans-meds': 'قسم السلف والأدوية 💳',
    swaps: 'تبديل الشيفتات 🔄',
    resignations: 'طلبات الاستقالة 🚪',
    resignation: 'طلبات الاستقالة 🚪',
    evaluations: 'التقييمات والشكاوى ⭐',
    salary: 'تفاصيل ومفردات المرتب 💼',
    payroll: 'كشف ومسير الرواتب 💰',
    adjustments: 'المكافآت والخصومات 📝',
    'adjustments-module': 'المكافآت والخصومات 📝',
    shifts: 'سجل البصمات والحضور 📋',
    attendance: 'سجل الحضور والانصراف ⏱️',
    'electronic-attendance': 'البصمة الحيوية 📸',
    roster: 'الجداول الشهرية 🗓️',
    bylaws: 'لائحة العمل والجزاءات 📜',
    requests: 'مركز موافقات الطلبات 📋',
    branches: 'إدارة الفروع 🏢',
    employees: 'شؤون الموظفين 👥',
    'pharmacy-archive': 'أرشيف الصيدلية 🗄️',
    dashboard: 'لوحة التحكم 📊'
  };

  return labels[targetTab] || 'القسم المطلوب 🔗';
}

