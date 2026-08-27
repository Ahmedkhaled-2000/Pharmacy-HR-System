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
 * Helper to determine if a notification has been read by Senior Management / Admin
 */
export function isNotificationReadForAdmin(notification) {
  if (!notification) return true;
  if (notification.readByAdmin === true) return true;
  if (notification.readByAdmin === false) return false;
  if (notification.clearedByAdmin === true || notification.deletedByAdmin === true || notification.hiddenFromAdmin === true) return true;

  if (Array.isArray(notification.readBy)) {
    if (notification.readBy.includes('admin') || notification.readBy.includes('owner') || notification.readBy.includes('super_admin')) {
      return true;
    }
  }
  if (Array.isArray(notification.readByRoles)) {
    if (notification.readByRoles.includes('admin') || notification.readByRoles.includes('owner')) {
      return true;
    }
  }

  // Fallback for admin-only notifications that have legacy boolean read
  if (notification.targetRole === 'admin' || notification.targetRole === 'owner') {
    return Boolean(notification.read);
  }

  return false;
}

/**
 * Helper to determine if a notification has been read by a specific Branch Manager
 */
export function isNotificationReadForBranch(notification, currentBranch = null) {
  if (!notification) return true;
  const bId = currentBranch?.id ? String(currentBranch.id).trim() : '';
  const bCode = currentBranch?.branchCode ? String(currentBranch.branchCode).trim() : (currentBranch?.code ? String(currentBranch.code).trim() : '');
  const bUser = currentBranch?.username ? String(currentBranch.username).trim().toLowerCase() : '';

  if (Array.isArray(notification.readByBranches)) {
    if (bId && notification.readByBranches.includes(bId)) return true;
    if (bCode && notification.readByBranches.includes(bCode)) return true;
  }

  if (notification.readByBranch && typeof notification.readByBranch === 'object') {
    if (bId && notification.readByBranch[bId]) return true;
    if (bCode && notification.readByBranch[bCode]) return true;
  }

  if (Array.isArray(notification.readBy)) {
    if (bId && (notification.readBy.includes('branch_' + bId) || notification.readBy.includes(bId))) return true;
    if (bCode && (notification.readBy.includes('branch_' + bCode) || notification.readBy.includes(bCode))) return true;
    if (bUser && notification.readBy.includes('branch_' + bUser)) return true;
  }

  // If notification was created solely for this branch and has legacy boolean read
  if ((notification.targetRole === 'branch' || notification.targetRole === 'branch_manager') && (!notification.targetRole || notification.targetRole !== 'branch_and_admin')) {
    if (!notification.targetRole || notification.targetRole === 'branch') {
      return Boolean(notification.read);
    }
  }

  return false;
}

/**
 * Helper to determine if a notification has been read by an Employee
 */
export function isNotificationReadForEmployee(notification, employeeId = null) {
  if (!notification) return true;
  const empIdStr = employeeId ? String(employeeId).trim() : '';

  if (empIdStr && Array.isArray(notification.readByEmployees) && notification.readByEmployees.includes(empIdStr)) {
    return true;
  }
  if (empIdStr && Array.isArray(notification.readBy)) {
    if (notification.readBy.includes('emp_' + empIdStr) || notification.readBy.includes(empIdStr)) {
      return true;
    }
  }

  // If targeted directly to employee, fallback to boolean read
  if (notification.targetRole === 'employee' || notification.targetEmployeeId) {
    return Boolean(notification.read);
  }

  return false;
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
  }).map((n) => ({
    ...n,
    read: isNotificationReadForEmployee(n, employeeId)
  })).sort((a, b) => {
    const tA = new Date(a.timestamp || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.date || 0).getTime();
    return tB - tA;
  });
}

import { shouldShowRequestToBranch } from './formatters';

/**
 * Filter notifications meant for Senior Management / Admins
 * Strictly prevents self-notifications when Admin executes any action, punch, or adjustment
 * Integrates live incoming requests from employees and branches that await Higher Management approval
 * Isolates read / unread status completely from branch managers
 */
export function filterAdminNotifications(notifications = [], state = null) {
  const deletedIdsSet = new Set((state?._deletedIds || []).map(String));

  // 1. Filter explicit notifications from state.notifications
  const explicitNotifs = (notifications || []).filter((n) => {
    if (!n) return false;
    const notifIdStr = String(n.id || '');
    if (deletedIdsSet.has(notifIdStr)) return false;

    // A. Filter out notifications cleared or deleted specifically by Admin
    if (n.clearedByAdmin === true || n.deletedByAdmin === true || n.hiddenFromAdmin === true) {
      return false;
    }

    // B. Never show notifications created by Admin for employees (e.g. self confirmations)
    if (n.creatorRole === 'admin' || n.createdBy === 'admin' || n.isAdminCreated === true || n.submittedByAdmin === true) {
      return false;
    }

    // C. Never show employee-targeted notifications or self decision confirmations
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
      n.title.includes('تم اعتماد السلفة')
    )) {
      return false;
    }

    // D. Never show branch-only alerts to Senior Admin
    if (n.targetRole === 'branch_manager' || n.targetRole === 'branch') {
      return false;
    }

    // E. Explicitly targeted to Admin / Owner / Management
    if (n.targetRole === 'admin' || n.targetRole === 'owner' || n.targetRole === 'branch_and_admin' || !n.targetRole) {
      return true;
    }

    // F. Default incoming request notifications from employees or branch managers (waiting for admin action)
    if (!n.action || n.action === 'pending' || n.action === 'submitted') {
      return true;
    }

    return false;
  }).map((n) => ({
    ...n,
    read: isNotificationReadForAdmin(n)
  }));

  // 2. Dynamically integrate active pending requests waiting for Admin approval if not already in explicit notifications
  const synthesizedPendingNotifs = [];
  if (state) {
    const existingReqIds = new Set(
      explicitNotifs.map((n) => String(n.requestId || n.id || '')).filter(Boolean)
    );
    const seenReqs = new Set();

    const addIfAdminPending = (r, defaultType) => {
      if (!r || !r.id) return;
      const rId = String(r.id);
      if (seenReqs.has(rId) || deletedIdsSet.has(rId)) return;
      seenReqs.add(rId);

      if (r.hiddenFromAdmin || r.clearedByAdmin) return;
      if (r.adminApproved === true || r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') return;

      const isPending = r.status === 'pending' || r.status === 'pending_admin' || !r.status;
      if (isPending) {
        const emp = (state.employees || []).find(
          (e) => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode))
        );
        const empName = emp?.name || r.employeeName || 'موظف';
        const finalType = r.type || defaultType;
        const typeLabel = getRequestTypeArabicLabel(finalType);
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
          resignation: '🚪',
          penalty_objection: '✋'
        };

        if (!existingReqIds.has(rId) && !existingReqIds.has(`notif_pending_${rId}`)) {
          synthesizedPendingNotifs.push({
            id: `notif_pending_${rId}`,
            requestId: r.id,
            type: finalType,
            typeLabel,
            icon: iconMap[finalType] || '📋',
            title: `📋 طلب وارد ينتظر قرار الإدارة: ${empName}`,
            message: `${typeLabel} للموظف (${empName}) ينتظر الاعتماد والمراجعة. ${r.reason || r.details || ''}`,
            employeeId: r.employeeId || emp?.id,
            employeeName: empName,
            employeeCode: r.employeeCode || emp?.code,
            branchId: r.branchId || emp?.branchId,
            date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            timestamp: r.createdAt || new Date().toISOString(),
            read: false,
            targetRole: 'admin'
          });
          existingReqIds.add(rId);
        }
      }
    };

    (state.requests || []).forEach((r) => addIfAdminPending(r, 'request'));
    (state.leaveRequests || []).forEach((r) => addIfAdminPending(r, 'leave'));
    (state.shiftSwaps || []).forEach((r) => addIfAdminPending(r, 'swap'));
    (state.loans || []).forEach((r) => addIfAdminPending(r, 'loan'));
    (state.resignationRequests || []).forEach((r) => addIfAdminPending(r, 'resignation'));

    // Handle late incident objections
    (state.lateIncidents || []).forEach((inc) => {
      if (inc && inc.objection && (inc.objection.status === 'pending' || inc.status === 'objection_pending')) {
        const objId = `obj_inc_${inc.id}`;
        if (!seenReqs.has(objId) && !deletedIdsSet.has(objId)) {
          seenReqs.add(objId);
          addIfAdminPending({
            id: objId,
            type: 'penalty_objection',
            employeeId: inc.employeeId,
            employeeName: inc.employeeName,
            employeeCode: inc.employeeCode,
            branchId: inc.branchId,
            date: inc.date,
            reason: inc.objection.reason || 'تظلم على واقعة تأخير / جزاء لائحى',
            status: 'pending',
            createdAt: inc.objection.submittedAt || inc.date
          }, 'penalty_objection');
        }
      }
    });
  }

  const combined = [...explicitNotifs, ...synthesizedPendingNotifs];
  return combined.sort((a, b) => {
    const tA = new Date(a.timestamp || a.date || 0).getTime();
    const tB = new Date(b.timestamp || b.date || 0).getTime();
    return tB - tA;
  });
}

/**
 * Filter notifications strictly meant for Branch Managers
 * Isolates branch manager notifications completely from Admin / Super Admin and other branches
 * Integrates live incoming branch requests waiting for manager review
 * Isolates read / unread status completely from Senior Management / Admin
 */
export function filterBranchManagerNotifications(notifications = [], currentBranch = null, managerEmpId = null, state = null) {
  const branchIdStr = currentBranch?.id ? String(currentBranch.id).trim() : null;
  const branchCodeStr = currentBranch?.branchCode ? String(currentBranch.branchCode).trim() : (currentBranch?.code ? String(currentBranch.code).trim() : null);
  const branchName = currentBranch?.name ? String(currentBranch.name).trim() : null;
  const branchUsername = currentBranch?.username ? String(currentBranch.username).trim() : null;
  const mgrIdStr = managerEmpId ? String(managerEmpId).trim() : null;

  // Set of employee IDs and codes belonging to this branch
  const branchEmpIds = new Set();
  if (state?.employees && (branchIdStr || branchCodeStr || branchName || branchUsername)) {
    state.employees.forEach((emp) => {
      const eBranch = String(emp.branchId || '').trim();
      const isDirectMatch = (branchIdStr && eBranch === branchIdStr) ||
        (branchCodeStr && eBranch === branchCodeStr) ||
        (branchName && eBranch === branchName) ||
        (branchUsername && eBranch === branchUsername);
      const isMultiBranchMatch = emp.branchesDetails && emp.branchesDetails.some((bd) => {
        const b = String(bd.branchId || '').trim();
        return (branchIdStr && b === branchIdStr) || (branchCodeStr && b === branchCodeStr);
      });
      if (isDirectMatch || isMultiBranchMatch) {
        branchEmpIds.add(String(emp.id).trim());
        if (emp.code) branchEmpIds.add(String(emp.code).trim());
        if (emp.username) branchEmpIds.add(String(emp.username).trim());
      }
    });
  }

  const deletedIdsSet = new Set((state?._deletedIds || []).map(String));

  // 1. Filter explicit notifications from state.notifications
  const explicitNotifs = (notifications || []).filter((n) => {
    if (!n) return false;
    const notifIdStr = String(n.id || '');
    if (deletedIdsSet.has(notifIdStr)) return false;

    // Filter out notifications cleared or deleted by this branch
    if (branchIdStr && (n.clearedForBranches?.includes(branchIdStr) || n.deletedForBranches?.includes(branchIdStr))) {
      return false;
    }
    if (branchCodeStr && (n.clearedForBranches?.includes(branchCodeStr) || n.deletedForBranches?.includes(branchCodeStr))) {
      return false;
    }

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

    // 3. Notifications targeted to branch manager or branch
    if (n.targetRole === 'branch' || n.targetRole === 'branch_manager' || n.targetRole === 'manager' || n.targetRole === 'branch_and_admin' || !n.targetRole) {
      if (!branchIdStr && !branchCodeStr && !branchName) return true;
      if (n.branchId && (String(n.branchId).trim() === branchIdStr || (branchCodeStr && String(n.branchId).trim() === branchCodeStr) || (branchName && String(n.branchId).trim() === branchName))) return true;
      if (n.branchCode && (String(n.branchCode).trim() === branchCodeStr || (branchIdStr && String(n.branchCode).trim() === branchIdStr))) return true;
      if (n.branchName && branchName && n.branchName === branchName) return true;
      if (n.employeeId && branchEmpIds.has(String(n.employeeId).trim())) return true;
      if (n.employeeCode && branchEmpIds.has(String(n.employeeCode).trim())) return true;
      if (!n.branchId && !n.branchName && !n.employeeId) return true; // General branch update
      return false;
    }

    // 4. Branch-specific operational notifications or requests from employees of this branch
    if (n.branchId && (String(n.branchId).trim() === branchIdStr || (branchCodeStr && String(n.branchId).trim() === branchCodeStr))) {
      return true;
    }
    if (n.employeeId && branchEmpIds.has(String(n.employeeId).trim())) {
      return true;
    }

    return false;
  }).map((n) => ({
    ...n,
    read: isNotificationReadForBranch(n, currentBranch)
  }));

  // 2. Dynamically integrate active pending branch requests if not already in explicit notifications
  const synthesizedPendingNotifs = [];
  if (state) {
    const existingReqIds = new Set(
      explicitNotifs.map((n) => String(n.requestId || n.id || '')).filter(Boolean)
    );
    const seenBranchReqs = new Set();

    const matchesBranch = (r) => {
      if (!r || !r.id) return false;
      const rIdStr = String(r.id);
      if (deletedIdsSet.has(rIdStr) || seenBranchReqs.has(rIdStr)) return false;

      // Loans, advances, and credit medicines are strictly for Senior Management
      if (['loan', 'advance', 'credit_medicine', 'meds'].includes(r.type)) return false;

      if (!shouldShowRequestToBranch(r, state)) return false;

      // Status check: must be pending branch review/approval
      if (r.submittedByBranchManager || r.createdRole === 'branch' || r.createdRole === 'branch_manager') return false;
      if (r.branchApproved === true || r.branchApprovalStatus === 'approved' || r.branchApprovalStatus === 'rejected') return false;
      if (r.status === 'pending_admin' || r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') return false;
      if (r.status !== 'pending' && r.status) return false;

      // Branch match
      if (!branchIdStr && !branchCodeStr && !branchName) return true;
      if (r.branchId && (String(r.branchId).trim() === branchIdStr || (branchCodeStr && String(r.branchId).trim() === branchCodeStr) || (branchName && String(r.branchId).trim() === branchName))) return true;
      if (r.employeeId && branchEmpIds.has(String(r.employeeId).trim())) return true;
      if (r.employeeCode && branchEmpIds.has(String(r.employeeCode).trim())) return true;

      const emp = (state.employees || []).find((e) => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode)));
      if (emp) {
        const eBranch = String(emp.branchId || '').trim();
        if ((branchIdStr && eBranch === branchIdStr) || (branchCodeStr && eBranch === branchCodeStr) || (branchName && eBranch === branchName)) return true;
        if (emp.branchesDetails && emp.branchesDetails.some((bd) => (branchIdStr && String(bd.branchId) === branchIdStr) || (branchCodeStr && String(bd.branchId) === branchCodeStr))) return true;
      }

      return false;
    };

    const allBranchRequests = [];
    (state.requests || []).forEach((r) => { if (matchesBranch(r)) { seenBranchReqs.add(String(r.id)); allBranchRequests.push(r); } });
    (state.leaveRequests || []).forEach((r) => { if (matchesBranch(r)) { seenBranchReqs.add(String(r.id)); allBranchRequests.push({ ...r, type: r.type || 'leave' }); } });
    (state.shiftSwaps || []).forEach((r) => { if (matchesBranch(r)) { seenBranchReqs.add(String(r.id)); allBranchRequests.push({ ...r, type: 'swap' }); } });
    (state.resignationRequests || []).forEach((r) => { if (matchesBranch(r)) { seenBranchReqs.add(String(r.id)); allBranchRequests.push({ ...r, type: 'resignation' }); } });

    allBranchRequests.forEach((r) => {
      const rId = String(r.id);
      if (!existingReqIds.has(rId) && !existingReqIds.has(`notif_pending_${rId}`)) {
        const emp = (state.employees || []).find((e) => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode)));
        const empName = emp?.name || r.employeeName || 'موظف';
        const finalType = r.type || 'request';
        const typeLabel = getRequestTypeArabicLabel(finalType);
        const iconMap = { leave: '🏖️', permission: '⏰', swap: '🔄', resignation: '🚪' };

        synthesizedPendingNotifs.push({
          id: `notif_pending_${rId}`,
          requestId: r.id,
          type: finalType,
          typeLabel,
          icon: iconMap[finalType] || '📋',
          title: `📋 طلب جديد ينتظر موافقة الفرع: ${empName}`,
          message: `${typeLabel} للموظف (${empName}) ينتظر مراجعتك واعتمادك في مركز الطلبات. ${r.reason || r.details || ''}`,
          employeeId: r.employeeId || emp?.id,
          employeeName: empName,
          employeeCode: r.employeeCode || emp?.code,
          branchId: r.branchId || branchIdStr,
          date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          timestamp: r.createdAt || new Date().toISOString(),
          read: false,
          targetRole: 'branch'
        });
        existingReqIds.add(rId);
      }
    });
  }

  const combined = [...explicitNotifs, ...synthesizedPendingNotifs];
  return combined.sort((a, b) => {
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

  // طلبات المكافآت والحوافز والجزاءات والخصومات والتسويات -> مركز موافقات الطلبات
  if (type.includes('bonus') || type.includes('penalty') || type.includes('adj') || type.includes('reward') || title.includes('مكافأ') || title.includes('مكافأة') || title.includes('حافز') || title.includes('خصم') || title.includes('جزاء') || reqId.startsWith('adj_') || reqId.startsWith('pen_') || reqId.startsWith('bonus_')) {
    return 'requests';
  }

  // طلبات البصمات وتصحيح البصمة اليدوية
  if (type.includes('manual_punch') || type.includes('punch_correction') || title.includes('طلب بصمة') || title.includes('بصمة يدوي')) {
    return 'requests';
  }

  // طلبات الموظفين العامة (إجازات، أذونات، سلف، تبديل، استقالة) -> توجيه لمركز موافقات الطلبات
  if (type.includes('leave') || reqId.startsWith('leave_') || title.includes('إجاز') || title.includes('اجاز')) return 'requests';
  if (type.includes('perm') || reqId.startsWith('perm_') || title.includes('إذن') || title.includes('اذن') || title.includes('استئذان')) return 'requests';
  if (type.includes('loan') || type.includes('med') || type.includes('advance') || reqId.startsWith('loan_') || reqId.startsWith('medreq_') || title.includes('سلف') || title.includes('أدوي') || title.includes('ادوي') || title.includes('آجل')) return 'requests';
  if (type.includes('swap') || reqId.startsWith('swap_') || title.includes('تبديل')) return 'requests';
  if (type.includes('resign') || reqId.startsWith('res_') || title.includes('استقال')) return 'requests';
  if (type.includes('request') || reqId.startsWith('req_') || title.includes('طلب ')) return 'requests';

  // التقييمات والشكاوى
  if (type.includes('eval') || type.includes('complaint') || title.includes('تقييم') || title.includes('شكو')) return 'evaluations';

  // الجداول والورديات
  if (type.includes('roster') || title.includes('جدول')) return 'roster';

  // الحضور والبصمات
  if (type.includes('punch') || type.includes('shift') || type.includes('biometric') || title.includes('بصم') || title.includes('حضور')) return 'attendance';

  // لائحة العمل والجزاءات والتأخير
  if (type.includes('late') || type.includes('early_exit') || type.includes('bylaw') || title.includes('تأخير') || title.includes('خروج') || title.includes('لائح')) return 'bylaws';

  // الرواتب
  if (type.includes('payroll') || type.includes('salary') || title.includes('مرتب') || title.includes('راتب')) return 'payroll';

  // الفروع
  if (type.includes('branch') || title.includes('فرع')) return 'branches';

  // شؤون الموظفين
  if (type.includes('employee_profile') || title.includes('إضافة موظف') || title.includes('ملف الموظف')) return 'employees';

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
    'branch-sent-requests': 'سجل الطلبات المرسلة للإدارة 📤',
    requests: 'مركز موافقات الطلبات 📋',
    branches: 'إدارة الفروع 🏢',
    employees: 'شؤون الموظفين 👥',
    'pharmacy-archive': 'أرشيف الصيدلية 🗄️',
    dashboard: 'لوحة التحكم 📊'
  };

  return labels[targetTab] || 'القسم المطلوب 🔗';
}

