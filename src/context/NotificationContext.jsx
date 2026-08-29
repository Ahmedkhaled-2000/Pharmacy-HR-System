import React, { createContext, useContext, useMemo } from 'react';
import {
  shouldShowRequestToBranch
} from '../utils/formatters';
import {
  isNotificationReadForAdmin,
  isNotificationReadForBranch,
  filterAdminNotifications,
  filterBranchManagerNotifications,
  filterEmployeeNotifications
} from '../utils/notificationEngine';
import { isApprovedPermissionForDate } from '../utils/latePenaltyEngine';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { useUI } from './UIContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { authRole, currentBranch, currentEmpUser } = useAuth();
  const { state, setState, saveState } = useData();
  const { currentFilterFn, showToast } = useUI();

  // 1. حساب عدد الطلبات المعلقة (Pending Requests Badge Count)
  const pendingRequestsCount = useMemo(() => {
    if (!state) return 0;

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
      const deletedIdsSet = new Set((state._deletedIds || []).map(String));

      const rawList = [...(state.requests || [])];
      const seen = new Set(rawList.map((r) => String(r.id)));
      (state.leaveRequests || []).forEach((r) => {
        if (r && !seen.has(String(r.id))) {
          rawList.push(r);
          seen.add(String(r.id));
        }
      });
      (state.shiftSwaps || []).forEach((r) => {
        if (r && !seen.has(String(r.id))) {
          rawList.push(r);
          seen.add(String(r.id));
        }
      });

      return rawList.filter((r) => {
        if (!r || !r.id) return false;
        const idStr = String(r.id);
        if (deletedIdsSet.has(idStr)) return false;

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

        return r.status === 'pending';
      }).length;
    }

    // Super Admin / Owner
    const rawReqList = [...(state.requests || [])];
    const seen = new Set(rawReqList.map((r) => String(r.id)));
    (state.leaveRequests || []).forEach((r) => {
      if (r && !seen.has(String(r.id))) {
        rawReqList.push(r);
        seen.add(String(r.id));
      }
    });
    (state.shiftSwaps || []).forEach((r) => {
      if (r && !seen.has(String(r.id))) {
        rawReqList.push(r);
        seen.add(String(r.id));
      }
    });
    (state.loans || []).forEach((r) => {
      if (r && !seen.has(String(r.id))) {
        rawReqList.push(r);
        seen.add(String(r.id));
      }
    });
    (state.lateIncidents || []).forEach((inc) => {
      if (inc && inc.objection && (inc.objection.status === 'pending' || inc.status === 'objection_pending')) {
        const objId = `obj_inc_${inc.id}`;
        if (!seen.has(objId)) {
          rawReqList.push({ id: objId, status: 'pending', type: 'penalty_objection' });
          seen.add(objId);
        }
      }
    });
    (state.adjustments || []).forEach((adj) => {
      if (adj && adj.objection && adj.objection.status === 'pending') {
        const objId = `obj_adj_${adj.id}`;
        if (!seen.has(objId)) {
          rawReqList.push({ id: objId, status: 'pending', type: 'adj_objection' });
          seen.add(objId);
        }
      }
    });

    const deletedIdsSet = new Set((state._deletedIds || []).map(String));
    return rawReqList.filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      if (deletedIdsSet.has(idStr)) return false;
      if (r.hiddenFromAdmin) return false;

      if (r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') return false;

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

      return r.status === 'pending_admin' || (r.status === 'pending' && isBranchDone);
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

  // 4. دوال التحكم في الإشعارات
  const handleMarkNotificationRead = async (notifId) => {
    if (!notifId) return;
    const notifIdStr = String(notifId);
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

  const handleMarkAllNotificationsRead = async () => {
    const updatedNotifs = (state.notifications || []).map((n) => {
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

    const updatedLate = (state.lateIncidents || []).map((inc) => ({ ...inc, read: true }));
    const updatedRequests = (state.requests || []).map((r) => ({ ...r, read: true }));
    const updatedState = { ...state, notifications: updatedNotifs, lateIncidents: updatedLate, requests: updatedRequests };
    setState(updatedState);
    saveState(updatedState).catch(() => {});
    showToast('✅ تم تحديد كافة الإشعارات كمقروءة');
  };

  const handleDeleteNotification = async (notifId) => {
    if (!notifId) return;
    const notifIdStr = String(notifId);
    let updatedNotifs = [];

    if (authRole === 'admin' || authRole === 'owner') {
      updatedNotifs = (state.notifications || []).map((n) => {
        if (String(n.id) === notifIdStr || String(n.requestId) === notifIdStr) {
          return { ...n, deletedByAdmin: true, hiddenFromAdmin: true };
        }
        return n;
      }).filter((n) => {
        if ((String(n.id) === notifIdStr || String(n.requestId) === notifIdStr) && (n.targetRole === 'admin' || n.targetRole === 'owner')) return false;
        return true;
      });
    } else if (authRole === 'branch' && currentBranch) {
      const bId = String(currentBranch.id);
      const bCode = String(currentBranch.branchCode || currentBranch.code || '');
      updatedNotifs = (state.notifications || []).map((n) => {
        if (String(n.id) === notifIdStr || String(n.requestId) === notifIdStr) {
          const deletedBranches = Array.isArray(n.deletedForBranches) ? [...n.deletedForBranches] : [];
          if (bId && !deletedBranches.includes(bId)) deletedBranches.push(bId);
          if (bCode && !deletedBranches.includes(bCode)) deletedBranches.push(bCode);
          return { ...n, deletedForBranches: deletedBranches };
        }
        return n;
      });
    } else {
      updatedNotifs = (state.notifications || []).filter((n) => String(n.id) !== notifIdStr && String(n.requestId) !== notifIdStr);
    }

    const updatedState = { ...state, notifications: updatedNotifs };
    setState(updatedState);
    saveState(updatedState).catch(() => {});
    showToast('🗑️ تم حذف الإشعار');
  };

  const handleClearReadNotifications = async () => {
    let updatedNotifs = [];

    if (authRole === 'admin' || authRole === 'owner') {
      updatedNotifs = (state.notifications || []).map((n) => {
        const isAdminRead = isNotificationReadForAdmin(n);
        if (isAdminRead) {
          return { ...n, clearedByAdmin: true, hiddenFromAdmin: true };
        }
        return n;
      }).filter((n) => {
        if ((n.targetRole === 'admin' || n.targetRole === 'owner') && n.clearedByAdmin) return false;
        return true;
      });
    } else if (authRole === 'branch' && currentBranch) {
      const bId = String(currentBranch.id);
      const bCode = String(currentBranch.branchCode || currentBranch.code || '');
      updatedNotifs = (state.notifications || []).map((n) => {
        const isBranchRead = isNotificationReadForBranch(n, currentBranch);
        if (isBranchRead) {
          const clearedBranches = Array.isArray(n.clearedForBranches) ? [...n.clearedForBranches] : [];
          if (bId && !clearedBranches.includes(bId)) clearedBranches.push(bId);
          if (bCode && !clearedBranches.includes(bCode)) clearedBranches.push(bCode);
          return { ...n, clearedForBranches: clearedBranches };
        }
        return n;
      });
    } else {
      updatedNotifs = (state.notifications || []).filter((n) => !n.read);
    }

    const updatedState = { ...state, notifications: updatedNotifs };
    setState(updatedState);
    saveState(updatedState).catch(() => {});
    showToast('🗑️ تم مسح الإشعارات المقروءة بنجاح');
  };

  const value = {
    pendingRequestsCount,
    bylawsCount,
    notifications: roleNotifications,
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
