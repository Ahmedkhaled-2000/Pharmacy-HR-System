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
 * Filter notifications meant for a specific employee
 */
export function filterEmployeeNotifications(notifications = [], employeeId = null) {
  if (!employeeId) return [];
  const empIdStr = String(employeeId);
  return (notifications || []).filter((n) => {
    if (!n) return false;
    const targetId = n.targetEmployeeId ? String(n.targetEmployeeId) : (n.employeeId ? String(n.employeeId) : null);
    if (!targetId) return false;
    return targetId === empIdStr;
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
