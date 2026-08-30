import { useEffect, useRef } from 'react';
import {
  STORAGE_KEY,
  apiFetchSettings,
  apiFetchVersion,
  apiCreateEventSource
} from '../utils/apiClient';
import {
  subscribeToLiveState
} from '../utils/socketClient';
import {
  smartMergeStates
} from '../utils/stateMerger';
import {
  normalizeState,
  nowTimeStr,
  shouldShowRequestToBranch
} from '../utils/formatters';
import {
  listenToLiveBroadcasts,
  listenToConnectionChanges,
  syncNow
} from '../utils/offlineSync';
import {
  syncAllEmployeesPermissionsAndLateness
} from '../utils/latePenaltyEngine';
import {
  playNotificationChime
} from './useAudio';

/**
 * useRealtimeSync
 * المحرك المتقدم للمزامنة اللحظية فائقة السرعة (< 100ms)
 * يدمج SSE Push Stream مع 0ms Local BroadcastChannel و Adaptive Micro-Polling
 */
export function useRealtimeSync(props = {}) {
  const {
    state,
    setState,
    authRole = 'none',
    setAuthRole = () => {},
    currentBranch = null,
    setCurrentBranch = () => {},
    currentEmpUser = null,
    setCurrentEmpUser = () => {},
    setIsAdminLoggedIn = () => {},
    setIsLoading = () => {},
    setIsOffline = () => {},
    setPendingSyncCount = () => {},
    setLastSyncTime = () => {},
    showToast = () => {}
  } = props || {};
  const isInitialLoadDoneRef = useRef(false);
  const knownRequestIdsRef = useRef(new Set());
  const isMountedRef = useRef(true);

  // 1. معالجة البيانات القادمة من السحابة أو التبويبات الأخرى
  const applyRemoteData = (remoteData) => {
    if (!isMountedRef.current) return;
    const parsed = typeof remoteData === 'string' ? JSON.parse(remoteData) : remoteData;
    if (!parsed) return;
    const normalized = normalizeState(parsed);

    // التحقق من حدوث تصفير شامل لقاعدة البيانات (Factory Reset)
    const currentKnownResetToken = localStorage.getItem('last_known_reset_token') || '';
    if (normalized._systemResetToken && normalized._systemResetToken !== currentKnownResetToken) {
      localStorage.setItem('last_known_reset_token', normalized._systemResetToken);
      localStorage.removeItem('app_auth_role');
      localStorage.removeItem('app_current_emp_user');
      localStorage.removeItem('app_current_branch');
      localStorage.removeItem('app_is_admin');
      localStorage.removeItem('app_active_nav_tab');
      localStorage.removeItem('app_active_sub_tab');
      sessionStorage.clear();

      setAuthRole('none');
      setIsAdminLoggedIn(false);
      setCurrentEmpUser(null);
      setCurrentBranch(null);
      setState(normalized);
      showToast('🚨 تم تصفير ومسح قاعدة البيانات بالكامل. تم تسجيل الخروج بنجاح والبدء من جديد.');
      setTimeout(() => {
        window.location.href = '/';
      }, 800);
      return;
    }

    setState((prev) => {
      setLastSyncTime(nowTimeStr());
      const merged = smartMergeStates(prev, normalized);

      // تحديث بيانات الموظف المسجل حالياً إذا طرأت تغييرات
      setCurrentEmpUser((prevEmp) => {
        if (!prevEmp) return prevEmp;
        const fresh = (merged.employees || []).find(
          (e) => e.id === prevEmp.id || (prevEmp.code && e.code === prevEmp.code)
        );
        if (!fresh && (merged.employees || []).length === 0) {
          localStorage.removeItem('app_current_emp_user');
          localStorage.removeItem('app_auth_role');
          setAuthRole('none');
          return null;
        }
        return fresh || prevEmp;
      });

      // تحديث بيانات الفرع المسجل حالياً
      setCurrentBranch((prevBranch) => {
        if (!prevBranch) return prevBranch;
        const fresh = (merged.branches || []).find((b) => b.id === prevBranch.id);
        if (!fresh && (merged.branches || []).length === 0) {
          localStorage.removeItem('app_current_branch');
          localStorage.removeItem('app_auth_role');
          setAuthRole('none');
          return null;
        }
        return fresh || prevBranch;
      });

      return merged;
    });
  };

  // 2. مستمع حالة الاتصال بالإنترنت
  useEffect(() => {
    const unsubscribe = listenToConnectionChanges(
      // عودة الإنترنت
      async (mergedFromOnline) => {
        setIsOffline(false);
        showToast('✅ عاد الاتصال - جاري مزامنة ودمج البيانات...');
        if (mergedFromOnline) {
          setState((prev) => normalizeState(smartMergeStates(prev, normalizeState(mergedFromOnline))));
        }
        const result = await syncNow();
        if (result.success && result.mergedState) {
          setState((prev) => normalizeState(smartMergeStates(prev, normalizeState(result.mergedState))));
          setPendingSyncCount(0);
          setLastSyncTime(nowTimeStr());
          showToast('✅ تمت مزامنة ودمج البيانات بنجاح');
        }
      },
      // انقطاع الإنترنت
      () => {
        setIsOffline(true);
        showToast('📴 انقطع الإنترنت - سيتم حفظ البيانات محلياً حتى عودة الاتصال');
      }
    );
    return unsubscribe;
  }, [setState, setIsOffline, setPendingSyncCount, setLastSyncTime, showToast]);

  // 3. مستمع التدفق السحابي المباشر (SSE) + البث المحلي (0ms Broadcast) + الاستطلاع المتكيف
  useEffect(() => {
    isMountedRef.current = true;
    let lastKnownVersion = -1;
    let lastKnownUpdatedAt = '';
    let isPolling = false;
    let pollFailures = 0;
    let timerId = null;

    const poll = async () => {
      if (isPolling || !navigator.onLine || !isMountedRef.current) return;
      isPolling = true;
      try {
        const versionRes = await apiFetchVersion(STORAGE_KEY, { timeout: 3500, isBackground: true });
        const currentVer = typeof versionRes?.version === 'number' ? versionRes.version : 0;
        const currentUpdated = versionRes?.updated_at || '';

        const isInitial = (lastKnownVersion === -1);
        const hasChanged =
          isInitial ||
          (currentVer > 0 && currentVer !== lastKnownVersion) ||
          (currentUpdated && currentUpdated !== lastKnownUpdatedAt);

        lastKnownVersion = currentVer;
        lastKnownUpdatedAt = currentUpdated;
        pollFailures = 0; // نجاح الاتصال -> تصفير الفشل

        if (hasChanged) {
          const remoteData = await apiFetchSettings(STORAGE_KEY, { timeout: 6000, useETag: false, isBackground: true });
          if (remoteData && !remoteData.notModified) {
            applyRemoteData(remoteData);
          }
        }
      } catch (err) {
        pollFailures++;
        // خطأ صامت في استطلاع الخلفية مع تفعيل التراجع الأسي
      } finally {
        isPolling = false;
      }
    };

    // أ) Adaptive Polling مع تراجع أسي ذكي عند تعثر السيرفر لمنع تسريب الذاكرة
    const scheduleNextPoll = () => {
      if (!isMountedRef.current) return;
      if (timerId) clearTimeout(timerId);

      const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
      let delay = isVisible ? 3500 : 15000;

      // في حال تعثر السيرفر (500 أو انقطاع)، التراجع أسي (6ث -> 12ث -> 24ث -> 45ث) لمنع إرهاق المتصفح
      if (pollFailures > 0) {
        delay = Math.min(45000, 3000 * Math.pow(1.8, Math.min(pollFailures, 6)));
      }

      timerId = setTimeout(async () => {
        await poll();
        scheduleNextPoll();
      }, delay);
    };

    scheduleNextPoll();

    // ب) Real-Time Server-Sent Events (SSE) Stream
    const eventSource = apiCreateEventSource(STORAGE_KEY, () => {
      poll();
    });

    // ج) 0ms Local BroadcastChannel across tabs in same browser
    const unsubBroadcast = listenToLiveBroadcasts((liveState) => {
      if (liveState) {
        applyRemoteData(liveState);
      } else {
        poll();
      }
    });

    // د) Direct Socket.io WebSockets Stream (< 5ms Zero Latency across all devices)
    const unsubSocket = subscribeToLiveState((remoteData) => {
      if (remoteData) {
        applyRemoteData(remoteData);
      }
    }, STORAGE_KEY);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        if (timerId) clearTimeout(timerId);
        poll().then(() => scheduleNextPoll());
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    window.addEventListener('online', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      isMountedRef.current = false;
      if (timerId) clearTimeout(timerId);
      if (eventSource) eventSource.close();
      if (unsubSocket) unsubSocket();
      unsubBroadcast();
      window.removeEventListener('focus', handleFocusOrVisible);
      window.removeEventListener('online', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);

  // 4. مستمع التنبيهات الصوتية الفورية للطلبات الجديدة الواصلة لحظياً
  useEffect(() => {
    if (!state) return;
    const reqs = state?.requests || [];

    if (!isInitialLoadDoneRef.current) {
      if (reqs.length > 0) {
        reqs.forEach((r) => {
          if (r && r.id) knownRequestIdsRef.current.add(String(r.id));
        });
        isInitialLoadDoneRef.current = true;
      }
      return;
    }

    const newRequests = reqs.filter((r) => r && r.id && !knownRequestIdsRef.current.has(String(r.id)));

    reqs.forEach((r) => {
      if (r && r.id) knownRequestIdsRef.current.add(String(r.id));
    });

    if (newRequests.length === 0) return;

    const pendingNewRequests = newRequests.filter(
      (r) => r.status === 'pending' || r.status === 'pending_admin' || !r.status
    );

    if (pendingNewRequests.length === 0) return;

    // تنبيه الإدارة العليا والمالك
    if (authRole === 'admin' || authRole === 'owner') {
      playNotificationChime();
      showToast('🔔 يوجد طلب جديد يحتاج للمراجعة من الإدارة العليا');
    }
    // تنبيه مدير الفرع إذا كان الطلب يخص فرعه
    else if (authRole === 'branch') {
      const currentBranchId = currentBranch?.id;
      const branchEmployees = (state?.employees || []).filter(
        (e) =>
          String(e.branchId) === String(currentBranchId) ||
          (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === String(currentBranchId)))
      );
      const branchEmpIds = new Set(branchEmployees.map((e) => String(e.id)));

      const branchPendingReqs = pendingNewRequests.filter((r) => {
        if (!shouldShowRequestToBranch(r, state)) return false;
        if (r.branchId && String(r.branchId) === String(currentBranchId)) return true;
        if (r.employeeId && branchEmpIds.has(String(r.employeeId))) return true;
        return false;
      });

      if (branchPendingReqs.length > 0) {
        showToast('🔔 يوجد طلب جديد لموظف بالفرع يحتاج للمراجعة');
      }
    }
  }, [state?.requests, authRole, currentBranch, state?.employees, showToast]);
}
