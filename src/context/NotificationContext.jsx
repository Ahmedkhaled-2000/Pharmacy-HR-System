import React, { createContext, useContext, useMemo } from 'react';
import {
  shouldShowRequestToBranch
} from '../utils/formatters';
import {
  isNotificationReadForAdmin,
  isNotificationReadForBranch,
  filterAdminNotifications,
  filterBranchManagerNotifications,
  filterEmployeeNotifications,
  isRequestNotification
} from '../utils/notificationEngine';
import { isApprovedPermissionForDate } from '../utils/latePenaltyEngine';
import { shouldRouteDirectToAdmin } from '../utils/jobsHelper';
import { hardDeleteEntityFast } from '../utils/offlineSync';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { useUI } from './UIContext';

const NotificationContext = createContext(null);

const persistReadNotifId = (id) => {
  try {
    if (!id) return;
    const raw = localStorage.getItem('app_read_notification_ids');
    const set = new Set(raw ? JSON.parse(raw) : []);
    set.add(String(id));
    localStorage.setItem('app_read_notification_ids', JSON.stringify(Array.from(set).slice(-500)));
  } catch (_) {}
};

const persistReadNotifIds = (ids) => {
  try {
    if (!ids || !ids.length) return;
    const raw = localStorage.getItem('app_read_notification_ids');
    const set = new Set(raw ? JSON.parse(raw) : []);
    ids.forEach((id) => { if (id) set.add(String(id)); });
    localStorage.setItem('app_read_notification_ids', JSON.stringify(Array.from(set).slice(-500)));
  } catch (_) {}
};

const persistDeletedNotifId = (id) => {
  try {
    if (!id) return;
    persistReadNotifId(id);
    const raw = localStorage.getItem('app_deleted_notif_ids');
    const set = new Set(raw ? JSON.parse(raw) : []);
    const idStr = String(id);
    set.add(idStr);
    set.add(`notif_${idStr}`);
    localStorage.setItem('app_deleted_notif_ids', JSON.stringify(Array.from(set).slice(-500)));
  } catch (_) {}
};

export function NotificationProvider({ children }) {
  const { authRole, currentBranch, currentEmpUser } = useAuth();
  const { state, setState, saveState } = useData();
  const { currentFilterFn, showToast } = useUI();

  // 1. حساب عدد الطلبات المعلقة (Pending Requests Badge Count)
  const pendingRequestsCount = useMemo(() => {
    if (!state) return 0;
    const deletedIdsSet = new Set((state._deletedIds || []).map(String));
    const loansList = state.loans || [];

    // دالة فحص ما إذا كان الطلب جزاءً تلقائياً معتمداً من النظام (مكانه في شاشة اللائحة وليس الطلبات)
    const isSystemAutoPenalty = (r, idStr) => {
      if (r.type === 'penalty_objection' || idStr.startsWith('obj_')) return false;
      return (
        (r.type === 'penalty' || r.type === 'late_penalty' || r.subType === 'lateness' || idStr.startsWith('req_late_inc_') || idStr.startsWith('req_inc_')) &&
        (r.source === 'system' || r.source === 'late_penalty_engine' || r.subType === 'lateness' || idStr.startsWith('req_late_inc_') || r.adminApproved || r.status === 'approved')
      );
    };

    // دالة فحص ما إذا كان طلب السلفة أو الدواء معتمداً بالفعل في سجل السلف
    const isLoanReconciledApproved = (r, idStr) => {
      const isLoanType = r.type === 'loan' || r.type === 'meds' || r.type === 'credit_medicine' || r.type === 'advance';
      if (!isLoanType) return false;
      const rAmt = parseFloat(r.amount || r.totalAmount) || 0;
      const matchingLoan = loansList.find((l) => {
        if (!l) return false;
        if (String(l.id) === idStr || String(l.requestId) === idStr || String(r.requestId) === String(l.id)) return true;
        if (String(l.employeeId) === String(r.employeeId)) {
          const lAmt = parseFloat(l.amount || l.totalAmount) || 0;
          if (rAmt > 0 && lAmt > 0 && Math.abs(rAmt - lAmt) < 0.01) return true;
        }
        return false;
      });
      if (matchingLoan) {
        return (
          matchingLoan.status === 'approved' ||
          matchingLoan.status === 'paid' ||
          matchingLoan.status === 'partial' ||
          matchingLoan.adminApproved === true ||
          parseFloat(matchingLoan.paidAmount) > 0 ||
          (Array.isArray(matchingLoan.paymentsHistory) && matchingLoan.paymentsHistory.length > 0)
        );
      }
      return parseFloat(r.paidAmount) > 0 || (Array.isArray(r.paymentsHistory) && r.paymentsHistory.length > 0);
    };

    if (authRole === 'branch') {
      const cIdStr = currentBranch?.id ? String(currentBranch.id) : null;
      const branchEmployees = (state.employees || []).filter((e) => {
        if (!cIdStr) return true;
        return (
          (e.branchId && String(e.branchId) === cIdStr) ||
          (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === cIdStr))
        );
      });
      const branchEmpIdSet = new Set(
        branchEmployees.flatMap((e) => [String(e.id), String(e.code || '')]).filter(Boolean)
      );

      const rawList = [];
      const seen = new Set();
      const seenSignatures = new Set();
      const addUnique = (r, defaultType = null) => {
        if (!r || !r.id) return;
        const idStr = String(r.id);
        const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_)/, '');
        if (seen.has(idStr) || seen.has(rawId) || seen.has(`req_${rawId}`)) return;

        const empKey = String(r.employeeId || r.employeeCode || '');
        const typeKey = String(r.type || defaultType || 'gen');
        const dateKey = String(r.date || r.startDate || (r.createdAt ? r.createdAt.substring(0, 10) : ''));
        const timeKey = r.time ? String(r.time).substring(0, 4) : (r.createdAt ? r.createdAt.substring(11, 16) : '');
        const amtKey = String(r.amount || r.totalAmount || r.leaveType || r.targetEmployeeId || '');
        const sigKey = `${empKey}_${typeKey}_${dateKey}_${timeKey}_${amtKey}`;

        if (sigKey.length > 8 && seenSignatures.has(sigKey)) return;

        seen.add(idStr);
        seen.add(rawId);
        if (sigKey.length > 8) seenSignatures.add(sigKey);
        rawList.push(r);
      };

      (state.requests || []).forEach((r) => addUnique(r));
      (state.leaveRequests || []).forEach((lr) => addUnique(lr, 'leave'));
      (state.shiftSwaps || []).forEach((sw) => addUnique(sw, 'swap'));
      (state.loans || []).forEach((ln) => addUnique(ln, 'loan'));

      return rawList.filter((r) => {
        if (!r || !r.id) return false;
        const idStr = String(r.id);
        if (deletedIdsSet.has(idStr)) return false;
        if (r.type === 'resignation' || r.type === 'withdraw' || r.isResignation || idStr.startsWith('res_')) return false;
        if (isSystemAutoPenalty(r, idStr)) return false;
        if (isLoanReconciledApproved(r, idStr)) return false;

        const isApproved = r.status === 'approved' || r.status === 'paid' || r.status === 'partial' || r.adminApproved === true;
        const isRejected = r.status === 'rejected' || r.status === 'rejected_photo' || (typeof r.status === 'string' && r.status.includes('rejected')) || r.isRejected || r.rejected || r.status === 'cancelled' || r.isCancelled;
        if (isApproved || isRejected) return false;

        if (!shouldShowRequestToBranch(r, state)) return false;

        const matchesBranch =
          !cIdStr ||
          (r.branchId && String(r.branchId) === cIdStr) ||
          (r.employeeId && branchEmpIdSet.has(String(r.employeeId))) ||
          (r.employeeCode && branchEmpIdSet.has(String(r.employeeCode)));
        if (!matchesBranch) return false;

        if (r.submittedByBranchManager || r.createdRole === 'branch' || r.createdRole === 'branch_manager') return false;
        if (r.branchApproved || r.branchApprovalStatus === 'approved' || r.branchApprovalStatus === 'rejected') return false;
        if (r.status === 'pending_admin' || r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') return false;

        return r.status === 'pending' || !r.status;
      }).length;
    }

    // Super Admin / Owner
    const rawReqList = [];
    const seen = new Set();
    const seenSignaturesAdmin = new Set();
    const addUniqueAdmin = (r, defaultType = null) => {
      if (!r || !r.id) return;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_)/, '');
      if (seen.has(idStr) || seen.has(rawId) || seen.has(`req_${rawId}`)) return;

      const empKey = String(r.employeeId || r.employeeCode || '');
      const typeKey = String(r.type || defaultType || 'gen');
      const dateKey = String(r.date || r.startDate || (r.createdAt ? r.createdAt.substring(0, 10) : ''));
      const timeKey = r.time ? String(r.time).substring(0, 4) : (r.createdAt ? r.createdAt.substring(11, 16) : '');
      const amtKey = String(r.amount || r.totalAmount || r.leaveType || r.targetEmployeeId || '');
      const sigKey = `${empKey}_${typeKey}_${dateKey}_${timeKey}_${amtKey}`;

      if (sigKey.length > 8 && seenSignaturesAdmin.has(sigKey)) return;

      seen.add(idStr);
      seen.add(rawId);
      if (sigKey.length > 8) seenSignaturesAdmin.add(sigKey);
      rawReqList.push(r);
    };

    (state.requests || []).forEach((r) => addUniqueAdmin(r));
    (state.leaveRequests || []).forEach((lr) => addUniqueAdmin(lr, 'leave'));
    (state.shiftSwaps || []).forEach((sw) => addUniqueAdmin(sw, 'swap'));
    (state.loans || []).forEach((ln) => addUniqueAdmin(ln, 'loan'));

    (state.lateIncidents || []).forEach((inc) => {
      if (inc && inc.objection && (inc.objection.status === 'pending' || inc.status === 'objection_pending')) {
        const objId = `obj_inc_${inc.id}`;
        addUniqueAdmin({ id: objId, status: 'pending', type: 'penalty_objection' });
      }
    });
    (state.adjustments || []).forEach((adj) => {
      if (adj && adj.objection && adj.objection.status === 'pending') {
        const objId = `obj_adj_${adj.id}`;
        addUniqueAdmin({ id: objId, status: 'pending', type: 'adj_objection' });
      }
    });

    return rawReqList.filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      if (deletedIdsSet.has(idStr)) return false;
      // Resignations are managed exclusively in their dedicated module
      if (r.type === 'resignation' || r.type === 'withdraw' || r.isResignation || idStr.startsWith('res_')) return false;
      if (r.hiddenFromAdmin) return false;
      if (isSystemAutoPenalty(r, idStr)) return false;
      if (isLoanReconciledApproved(r, idStr)) return false;

      const isApproved = r.status === 'approved' || r.status === 'paid' || r.status === 'partial' || r.adminApproved === true;
      const isRejected = r.status === 'rejected' || r.status === 'rejected_photo' || (typeof r.status === 'string' && r.status.includes('rejected')) || r.isRejected || r.rejected || r.status === 'cancelled' || r.isCancelled;
      if (isApproved || isRejected) return false;

      // طلبات البصمة الإلكترونية تظهر فورياً في عداد الإدارة طالما لم يتم اعتمادها أو رفضها
      const isBiometricAdminDirect =
        r.type === 'biometric_registration' ||
        r.type === 'biometric_reset' ||
        r.type === 'biometric_verification' ||
        r.type === 'تأكيد بصمة الوجه' ||
        r.type === 'تأكيد بصمة اليد';
      if (isBiometricAdminDirect) {
        return !r.adminApproved;
      }

      const isBranchDone =
        r.branchApproved ||
        r.branchApprovalStatus === 'approved' ||
        r.branchApprovalStatus === 'rejected' ||
        r.submittedByBranchManager ||
        r.isDirectToAdmin ||
        r.branchNotRequired ||
        r.createdRole === 'branch' ||
        r.createdRole === 'admin' ||
        !r.requiresBranchManager;

      return r.status === 'pending_admin' || ((r.status === 'pending' || !r.status) && isBranchDone);
    }).length;
  }, [state, authRole, currentBranch]);

  // 2. حساب عدد طلبات الاستقالة (Resignation Count Badge)
  const resignationCount = useMemo(() => {
    if (!state) return 0;
    const deletedIdsSet = new Set((state._deletedIds || []).map(String));
    const allResignations = state.resignationRequests || [];

    if (authRole === 'branch') {
      const cIdStr = currentBranch?.id ? String(currentBranch.id) : null;
      const cCodeStr = currentBranch?.code || currentBranch?.branchCode ? String(currentBranch.code || currentBranch.branchCode) : null;
      const branchEmployees = (state.employees || []).filter((e) => {
        if (!cIdStr && !cCodeStr) return true;
        return (
          (e.branchId && (String(e.branchId) === cIdStr || String(e.branchId) === cCodeStr)) ||
          (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === cIdStr || String(bd.branchId) === cCodeStr))
        );
      });
      const branchEmpIdSet = new Set(
        branchEmployees.flatMap((e) => [String(e.id), String(e.code || '')]).filter(Boolean)
      );

      return allResignations.filter((r) => {
        if (!r || !r.id) return false;
        const idStr = String(r.id);
        if (deletedIdsSet.has(idStr)) return false;

        const matchesBranch =
          (!cIdStr && !cCodeStr) ||
          (r.branchId && (String(r.branchId) === cIdStr || String(r.branchId) === cCodeStr)) ||
          (r.employeeId && branchEmpIdSet.has(String(r.employeeId))) ||
          (r.employeeCode && branchEmpIdSet.has(String(r.employeeCode)));
        if (!matchesBranch) return false;

        // Direct to admin requests bypass branch manager review
        if (r.isDirectToAdmin) return false;

        // Pending branch manager review
        const isBranchPending = (!r.managerStatus || r.managerStatus === 'pending') && !r.branchApproved;
        const isOverallPending = r.status === 'pending' || !r.status;

        return isBranchPending && isOverallPending;
      }).length;
    }

    // Super Admin / Owner
    return allResignations.filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      if (deletedIdsSet.has(idStr)) return false;
      if (r.hiddenFromAdmin) return false;

      // Status must still be pending final decision
      const isPendingDecision = r.status === 'pending' || r.status === 'pending_admin' || !r.status;
      if (!isPendingDecision) return false;

      // Ready for Admin only if Branch Manager reviewed OR direct to admin
      const emp = (state.employees || []).find(
        (e) => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode))
      );
      const isDirect = Boolean(r.isDirectToAdmin || (emp && shouldRouteDirectToAdmin(emp, r.branchId || emp?.branchId, state, r)));
      const isBranchDone = r.managerStatus === 'approved' || r.managerStatus === 'rejected' || r.branchApproved;

      return isDirect || isBranchDone;
    }).length;
  }, [state, authRole, currentBranch]);

  // 2. حساب عدد مخالفات اللائحة (Bylaws Count Badge)
  const bylawsCount = useMemo(() => {
    if (!state) return 0;

    if (authRole !== 'branch') {
      const branchSubmittedPenalties = (state.requests || []).filter((r) => {
        if (r.type !== 'penalty' && r.type !== 'disciplinary_penalty' && r.type !== 'early_exit') return false;
        if (r.isAdminCreated || r.creatorRole === 'admin' || r.createdBy === 'admin' || r.isManualAdmin || r.hiddenFromAdmin) return false;
        if (r.status === 'approved' || r.status === 'rejected') return false;
        return !r.read && currentFilterFn && currentFilterFn(r.date || r.createdAt?.slice(0, 10));
      }).length;
      return branchSubmittedPenalties;
    }

    const cIdStr = String(currentBranch?.id || '');
    const unreadLate = (state.lateIncidents || []).filter((inc) => {
      if (cIdStr && String(inc.branchId) !== cIdStr) return false;
      return (
        !inc.read &&
        inc.status !== 'cancelled' &&
        inc.status !== 'approved_permission_exempt' &&
        inc.actionType !== 'grace' &&
        !isApprovedPermissionForDate(inc.employeeId, inc.date, state) &&
        (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
        currentFilterFn && currentFilterFn(inc.date)
      );
    }).length;

    const unreadManual = (state.requests || []).filter((r) => {
      if (r.type !== 'penalty' && r.type !== 'early_exit') return false;
      if (cIdStr && String(r.branchId) !== cIdStr) return false;
      return !r.read && currentFilterFn && currentFilterFn(r.date || r.createdAt?.slice(0, 10));
    }).length;

    return unreadLate + unreadManual;
  }, [state, authRole, currentBranch, currentFilterFn]);

  // 3. فلترة الإشعارات بحسب الدور الحالي
  const roleNotifications = useMemo(() => {
    if (!state) return [];

    if (authRole === 'branch') {
      const managerId = (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.id;
      return filterBranchManagerNotifications(state.notifications || [], currentBranch, managerId, state);
    } else if (authRole === 'employee') {
      return filterEmployeeNotifications(state.notifications || [], currentEmpUser, state);
    }
    return filterAdminNotifications(state.notifications || [], state);
  }, [state, authRole, currentBranch, currentEmpUser]);

  // ⚡ فصل إشعارات النظام عن إشعارات الطلبات تماماً
  const systemNotifications = useMemo(() => {
    return (roleNotifications || []).filter((n) => !isRequestNotification(n));
  }, [roleNotifications]);

  const requestNotifications = useMemo(() => {
    return (roleNotifications || []).filter((n) => isRequestNotification(n));
  }, [roleNotifications]);

  const unreadSystemCount = useMemo(() => {
    return (systemNotifications || []).filter((n) => {
      if (authRole === 'admin' || authRole === 'owner') return !isNotificationReadForAdmin(n);
      if (authRole === 'branch' && currentBranch) return !isNotificationReadForBranch(n, currentBranch);
      return !n.read;
    }).length;
  }, [systemNotifications, authRole, currentBranch]);

  const unreadRequestCount = useMemo(() => {
    return (requestNotifications || []).filter((n) => {
      if (authRole === 'admin' || authRole === 'owner') return !isNotificationReadForAdmin(n);
      if (authRole === 'branch' && currentBranch) return !isNotificationReadForBranch(n, currentBranch);
      return !n.read;
    }).length;
  }, [requestNotifications, authRole, currentBranch]);

  // 4. دوال التحكم في الإشعارات
  const handleMarkNotificationRead = async (notifId) => {
    if (!notifId) return;
    const notifIdStr = String(notifId);
    persistReadNotifId(notifIdStr);
    let updatedNotifs = [...(state.notifications || [])];
    const foundIndex = updatedNotifs.findIndex((n) => String(n.id) === notifIdStr || String(n.requestId) === notifIdStr);

    if (foundIndex === -1) {
      updatedNotifs = updatedNotifs.map((n) => (String(n.id) === notifIdStr ? { ...n, read: true } : n));
    } else {
      const existing = updatedNotifs[foundIndex];
      const existingReadBy = Array.isArray(existing.readBy) ? [...existing.readBy] : [];
      const existingReadByBranches = Array.isArray(existing.readByBranches) ? [...existing.readByBranches] : [];
      const existingReadByEmployees = Array.isArray(existing.readByEmployees) ? [...existing.readByEmployees] : [];

      if (authRole === 'admin' || authRole === 'owner') {
        if (!existingReadBy.includes('admin')) existingReadBy.push('admin');
        updatedNotifs[foundIndex] = {
          ...existing,
          readByAdmin: true,
          readBy: existingReadBy
        };
      } else if (authRole === 'branch' && currentBranch) {
        const bId = String(currentBranch.id);
        const bCode = String(currentBranch.branchCode || currentBranch.code || '');
        if (bId && !existingReadByBranches.includes(bId)) existingReadByBranches.push(bId);
        if (bCode && !existingReadByBranches.includes(bCode)) existingReadByBranches.push(bCode);
        if (bId && !existingReadBy.includes(`branch_${bId}`)) existingReadBy.push(`branch_${bId}`);
        updatedNotifs[foundIndex] = {
          ...existing,
          readByBranches: existingReadByBranches,
          readBy: existingReadBy
        };
      } else if (authRole === 'employee' && currentEmpUser) {
        const eId = String(currentEmpUser.id);
        if (!existingReadByEmployees.includes(eId)) existingReadByEmployees.push(eId);
        if (!existingReadBy.includes(`emp_${eId}`)) existingReadBy.push(`emp_${eId}`);
        updatedNotifs[foundIndex] = {
          ...existing,
          read: true,
          readByEmployees: existingReadByEmployees,
          readBy: existingReadBy
        };
      } else {
        updatedNotifs[foundIndex] = { ...existing, read: true };
      }
    }

    const updatedState = { ...state, notifications: updatedNotifs };
    setState(updatedState);
    saveState(updatedState).catch(() => {});
  };

  const handleMarkAllNotificationsRead = async (channel = 'all') => {
    const targetNotifs = channel === 'system'
      ? systemNotifications
      : channel === 'requests'
      ? requestNotifications
      : (roleNotifications || []);

    const allIds = targetNotifs.map((n) => n && n.id).filter(Boolean);
    persistReadNotifIds(allIds);
    const targetIdsSet = new Set(allIds.map(String));

    const updatedNotifs = (state.notifications || []).map((n) => {
      if (!n || !targetIdsSet.has(String(n.id))) return n;
      const existingReadBy = Array.isArray(n.readBy) ? [...n.readBy] : [];
      const existingReadByBranches = Array.isArray(n.readByBranches) ? [...n.readByBranches] : [];
      const existingReadByEmployees = Array.isArray(n.readByEmployees) ? [...n.readByEmployees] : [];

      if (authRole === 'admin' || authRole === 'owner') {
        if (!existingReadBy.includes('admin')) existingReadBy.push('admin');
        return { ...n, readByAdmin: true, readBy: existingReadBy };
      } else if (authRole === 'branch' && currentBranch) {
        const bId = String(currentBranch.id);
        const bCode = String(currentBranch.branchCode || currentBranch.code || '');
        if (bId && !existingReadByBranches.includes(bId)) existingReadByBranches.push(bId);
        if (bCode && !existingReadByBranches.includes(bCode)) existingReadByBranches.push(bCode);
        if (bId && !existingReadBy.includes(`branch_${bId}`)) existingReadBy.push(`branch_${bId}`);
        return { ...n, readByBranches: existingReadByBranches, readBy: existingReadBy };
      } else if (authRole === 'employee' && currentEmpUser) {
        const eId = String(currentEmpUser.id);
        if (!existingReadByEmployees.includes(eId)) existingReadByEmployees.push(eId);
        if (!existingReadBy.includes(`emp_${eId}`)) existingReadBy.push(`emp_${eId}`);
        return { ...n, read: true, readByEmployees: existingReadByEmployees, readBy: existingReadBy };
      }
      return { ...n, read: true };
    });

    const updatedState = { ...state, notifications: updatedNotifs };
    // لا تقم بتعديل الطلبات عند قراءة إشعارات النظام فقط
    if (channel === 'all' || channel === 'requests') {
      updatedState.requests = (state.requests || []).map((r) => ({ ...r, read: true }));
    }
    if (channel === 'all') {
      updatedState.lateIncidents = (state.lateIncidents || []).map((inc) => ({ ...inc, read: true }));
    }

    setState(updatedState);
    saveState(updatedState).catch(() => {});
    showToast(channel === 'system' ? '✅ تم تحديد إشعارات النظام كمقروءة' : (channel === 'requests' ? '✅ تم تحديد إشعارات الطلبات كمقروءة' : '✅ تم تحديد كافة الإشعارات كمقروءة'));
  };

  const handleDeleteNotification = async (notifId) => {
    if (!notifId) return;
    const notifIdStr = String(notifId);
    persistDeletedNotifId(notifIdStr);

    const cleanReqId = notifIdStr.replace(/^(notif_pending_|notif_)/, '');
    const tombstoneIds = [
      notifIdStr,
      `notif_${notifIdStr}`,
      `notif_pending_${notifIdStr}`,
      `notif_${cleanReqId}`,
      `notif_pending_${cleanReqId}`
    ];

    const currentDeleted = state._deletedIds || [];
    const updatedDeletedIds = Array.from(new Set([...currentDeleted, ...tombstoneIds]));

    const updatedNotifs = (state.notifications || []).filter((n) => {
      const nId = String(n.id || '');
      return nId !== notifIdStr && nId !== `notif_${notifIdStr}` && nId !== `notif_pending_${cleanReqId}`;
    });

    const updatedState = {
      ...state,
      notifications: updatedNotifs,
      _deletedIds: updatedDeletedIds
    };

    setState(updatedState);
    saveState(updatedState).catch(() => {});
    hardDeleteEntityFast('notification', notifIdStr).catch(() => {});
    showToast('🗑️ تم حذف الإشعار');
  };

  const handleClearReadNotifications = async (channel = 'all') => {
    const nowIso = new Date().toISOString();
    const readIdsToRecord = [];
    const tombstoneIds = [];

    const targetNotifs = channel === 'system'
      ? systemNotifications
      : channel === 'requests'
      ? requestNotifications
      : (roleNotifications || []);

    const targetIdSet = new Set(targetNotifs.map((n) => n && String(n.id)).filter(Boolean));

    (state.notifications || []).forEach((n) => {
      if (!n || !targetIdSet.has(String(n.id))) return;
      const isRead = (authRole === 'admin' || authRole === 'owner')
        ? isNotificationReadForAdmin(n)
        : (authRole === 'branch' && currentBranch)
        ? isNotificationReadForBranch(n, currentBranch)
        : Boolean(n.read);

      if (isRead) {
        readIdsToRecord.push(n.id);
        tombstoneIds.push(String(n.id));
        tombstoneIds.push(`notif_${n.id}`);
        if (n.requestId) {
          tombstoneIds.push(`notif_${n.requestId}`);
          tombstoneIds.push(`notif_pending_${n.requestId}`);
        }
      }
    });

    persistReadNotifIds(readIdsToRecord);
    readIdsToRecord.forEach(id => persistDeletedNotifId(id));

    const currentDeleted = state._deletedIds || [];
    const updatedDeletedIds = Array.from(new Set([...currentDeleted, ...tombstoneIds]));

    const updatedNotifs = (state.notifications || []).filter((n) => !readIdsToRecord.includes(n.id));

    const updatedState = {
      ...state,
      notifications: updatedNotifs,
      _deletedIds: updatedDeletedIds,
      _notificationsClearedAt: nowIso
    };

    setState(updatedState);
    saveState(updatedState).catch(() => {});
    showToast('🗑️ تم مسح الإشعارات المقروءة بنجاح');
  };

  const value = {
    pendingRequestsCount,
    bylawsCount,
    resignationCount,
    notifications: roleNotifications,
    systemNotifications,
    requestNotifications,
    unreadSystemCount,
    unreadRequestCount,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleDeleteNotification,
    handleClearReadNotifications
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
