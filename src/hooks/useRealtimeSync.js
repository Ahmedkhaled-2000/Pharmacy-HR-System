import { useEffect, useRef } from 'react';
import {
  STORAGE_KEY,
  apiFetchSettings,
  apiFetchVersion,
  apiCreateEventSource
} from '../utils/apiClient';
import {
  subscribeToLiveState,
  subscribeToSyncHints
} from '../utils/socketClient';
import {
  pullDeltaSync
} from '../utils/syncEngine';
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

    // التحقق من حدوث تصفير شامل لقاعدة البيانات (Factory Reset) أو إبطال فوري للجلسات
    const currentKnownResetToken = localStorage.getItem('last_known_reset_token') || '';
    const currentKnownEpoch = localStorage.getItem('last_known_session_epoch') || '0';
    const serverEpoch = String(normalized?.orgSettings?.sessionInvalidationEpoch || '0');

    const isResetTriggered = (normalized._systemResetToken && normalized._systemResetToken !== currentKnownResetToken) ||
                             (serverEpoch !== '0' && serverEpoch !== currentKnownEpoch);

    if (isResetTriggered) {
      if (normalized._systemResetToken) localStorage.setItem('last_known_reset_token', normalized._systemResetToken);
      if (serverEpoch !== '0') localStorage.setItem('last_known_session_epoch', serverEpoch);
      localStorage.removeItem('app_auth_role');
      localStorage.removeItem('app_current_emp_user');
      localStorage.removeItem('app_current_branch');
      localStorage.removeItem('app_is_admin');
      localStorage.removeItem('app_active_nav_tab');
      localStorage.removeItem('app_active_sub_tab');
      localStorage.removeItem('app_owner_authenticated');
      sessionStorage.clear();
      clearLocalDatabase().catch(() => {});

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

    // ── فحص إبطال الجلسات اللحظي عند تغيير كلمات المرور على أي جهاز ──
    const currentActiveRole = localStorage.getItem('app_auth_role') || authRole;

    if (currentActiveRole === 'owner') {
      const myOwnerPass = localStorage.getItem('app_owner_password_snapshot');
      const myOwnerVer = Number(localStorage.getItem('app_owner_session_version') || 0);
      const srvOwnerPass = normalized?.orgSettings?.ownerPassword;
      const srvOwnerVer = Number(normalized?.orgSettings?.ownerSessionVersion || 0);

      const isRevoked = (myOwnerPass && srvOwnerPass && myOwnerPass !== srvOwnerPass) ||
                        (srvOwnerVer > 0 && myOwnerVer > 0 && srvOwnerVer > myOwnerVer);

      if (isRevoked) {
        localStorage.removeItem('app_auth_role');
        localStorage.removeItem('app_owner_authenticated');
        localStorage.removeItem('app_owner_password_snapshot');
        localStorage.removeItem('app_owner_session_version');
        localStorage.removeItem('app_is_admin');
        sessionStorage.clear();
        setAuthRole('none');
        setIsAdminLoggedIn(false);
        showToast('🔒 تم تغيير كلمة مرور المالك من جهاز آخر. تم تسجيل الخروج تلقائياً لضمان الأمان.');
        return;
      }
    } else if (currentActiveRole === 'admin') {
      const myAdminPass = localStorage.getItem('app_admin_password_snapshot');
      const myAdminVer = Number(localStorage.getItem('app_admin_session_version') || 0);
      const srvAdminPass = normalized?.orgSettings?.adminPassword || normalized?.orgSettings?.adminPass;
      const srvAdminVer = Number(normalized?.orgSettings?.adminSessionVersion || 0);

      const isRevoked = (myAdminPass && srvAdminPass && myAdminPass !== srvAdminPass) ||
                        (srvAdminVer > 0 && myAdminVer > 0 && srvAdminVer > myAdminVer);

      if (isRevoked) {
        localStorage.removeItem('app_auth_role');
        localStorage.removeItem('app_is_admin');
        localStorage.removeItem('app_admin_password_snapshot');
        localStorage.removeItem('app_admin_session_version');
        sessionStorage.clear();
        setAuthRole('none');
        setIsAdminLoggedIn(false);
        showToast('🔒 تم تغيير كلمة مرور الإدارة من جهاز آخر. تم تسجيل الخروج تلقائياً لضمان الأمان.');
        return;
      }
    } else if (currentActiveRole === 'branch' && currentBranch) {
      const myBranchPass = localStorage.getItem('app_branch_password_snapshot');
      const myBranchVer = Number(localStorage.getItem('app_branch_session_version') || 0);
      const liveBranch = (normalized?.branches || []).find(b => b && (String(b.id) === String(currentBranch.id) || String(b.branchCode) === String(currentBranch.branchCode)));

      if (liveBranch) {
        const isRevoked = (myBranchPass && liveBranch.password && myBranchPass !== liveBranch.password) ||
                          (Number(liveBranch.sessionVersion || 0) > myBranchVer && myBranchVer > 0);
        if (isRevoked) {
          localStorage.removeItem('app_auth_role');
          localStorage.removeItem('app_current_branch');
          localStorage.removeItem('app_branch_password_snapshot');
          localStorage.removeItem('app_branch_session_version');
          setAuthRole('none');
          setCurrentBranch(null);
          showToast(`🔒 تم تغيير كلمة مرور الفرع (${liveBranch.name || liveBranch.branchCode}). تم تسجيل الخروج لضمان الأمان.`);
          return;
        }
      }
    } else if (currentActiveRole === 'employee' && currentEmpUser) {
      const myEmpPass = localStorage.getItem('app_emp_password_snapshot');
      const myEmpVer = Number(localStorage.getItem('app_emp_session_version') || 0);
      const liveEmp = (normalized?.employees || []).find(e => e && (String(e.id) === String(currentEmpUser.id) || String(e.code) === String(currentEmpUser.code)));

      if (liveEmp) {
        const isRevoked = (myEmpPass && liveEmp.password && myEmpPass !== liveEmp.password) ||
                          (Number(liveEmp.sessionVersion || 0) > myEmpVer && myEmpVer > 0);
        if (isRevoked) {
          localStorage.removeItem('app_auth_role');
          localStorage.removeItem('app_current_emp_user');
          localStorage.removeItem('app_emp_password_snapshot');
          localStorage.removeItem('app_emp_session_version');
          setAuthRole('none');
          setCurrentEmpUser(null);
          showToast('🔒 تم تغيير كلمة المرور الخاصة بحسابك من الإدارة. تم تسجيل الخروج لضمان الأمان.');
          return;
        }
      }
    }

    setState((prev) => {
      setLastSyncTime(nowTimeStr());
      // دمج ذكي دائم بين الحالة المحلية والحالة السحابية لحماية الموظفين والطلبات من المسح العرضي
      const merged = normalizeState(smartMergeStates(prev, normalized));

      // تأمين أولوية الموظفين المضافين أو المحدثين محلياً حديثاً (خلال آخر 120 ثانية) من ارتداد الكاش السحابي
      const now = Date.now();
      const localRecentEmps = (prev.employees || []).filter(e => {
        if (!e) return false;
        const eTime = new Date(e.updatedAt || e.createdAt || 0).getTime();
        return (now - eTime) < 120000;
      });

      if (localRecentEmps.length > 0) {
        const remoteEmpIds = new Set((merged.employees || []).map(e => String(e.id)));
        const remoteEmpCodes = new Set((merged.employees || []).map(e => String(e.code || '').trim().toLowerCase()).filter(Boolean));
        const missingEmps = [];

        for (const le of localRecentEmps) {
          const leId = String(le.id);
          const leCode = String(le.code || '').trim().toLowerCase();
          const exists = remoteEmpIds.has(leId) || (leCode && remoteEmpCodes.has(leCode));
          if (!exists) {
            missingEmps.push(le);
          }
        }

        if (missingEmps.length > 0) {
          merged.employees = [...(merged.employees || []), ...missingEmps];
        }
      }

      // تحديث بيانات الموظف المسجل حالياً إذا طرأت تغييرات
      setCurrentEmpUser((prevEmp) => {
        if (!prevEmp) return prevEmp;
        const fresh = (merged.employees || []).find(
          (e) => e && (e.id === prevEmp.id || (prevEmp.code && e.code === prevEmp.code))
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
        const fresh = (merged.branches || []).find((b) => b && b.id === prevBranch.id);
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
        showToast('📴 انقطع الإنترنت - سيتم حفظ البيانات محلياً وتفعيل مسبار المزامنة الفوري');
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
      if (isPolling || !isMountedRef.current) return;
      isPolling = true;
      try {
        const versionRes = await apiFetchVersion(STORAGE_KEY, { timeout: 10000, isBackground: true });
        const currentVer = typeof versionRes?.version === 'number' ? versionRes.version : 0;
        const currentUpdated = versionRes?.updated_at || '';

        const isInitial = (lastKnownVersion === -1);
        const hasChanged =
          isInitial ||
          (currentVer > 0 && currentVer !== lastKnownVersion) ||
          (currentUpdated && currentUpdated !== lastKnownUpdatedAt);

        lastKnownVersion = currentVer;
        lastKnownUpdatedAt = currentUpdated;
        pollFailures = 0; // نجاح الاتصال -> تصفير الفشل فوراً
        setIsOffline(false);

        if (hasChanged) {
          // جلب التغييرات التزايدية الخفيفة أولاً
          pullDeltaSync(currentBranch?.id).catch(() => {});

          const remoteData = await apiFetchSettings(STORAGE_KEY, { timeout: 30000, useETag: true, isBackground: true });
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

    // أ) Adaptive Polling مع فترات متكيفة خفيفة لحماية الكوتا (30 ثانية في العرض، 60 ثانية في الخلفية)
    const scheduleNextPoll = (customDelay = null) => {
      if (!isMountedRef.current) return;
      if (timerId) clearTimeout(timerId);

      const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
      let delay = customDelay !== null ? customDelay : (isVisible ? 30000 : 60000);

      if (customDelay === null && pollFailures > 0) {
        delay = Math.min(60000, 20000 * Math.pow(1.5, Math.min(pollFailures, 3)));
      }

      timerId = setTimeout(async () => {
        await poll();
        scheduleNextPoll();
      }, delay);
    };

    scheduleNextPoll(100);

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

    // هـ) إشارات المزامنة التزايدية الذرية السريعة (< 50 bytes)
    const unsubSyncHint = subscribeToSyncHints((hint) => {
      if (!hint || !hint.branch_id || !currentBranch?.id || String(hint.branch_id) === String(currentBranch.id)) {
        pullDeltaSync(currentBranch?.id).catch(() => {});
      }
    });

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        pollFailures = 0; // تصفير الفشل فور تفاعل المستخدم
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
      if (unsubSyncHint) unsubSyncHint();
      unsubBroadcast();
      window.removeEventListener('focus', handleFocusOrVisible);
      window.removeEventListener('online', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);

  // 4. مستمع التنبيهات الصوتية الفورية للطلبات الجديدة الواصلة لحظياً
  useEffect(() => {
    if (!state) return;
    const reqs = [
      ...(state?.requests || []),
      ...(state?.leaveRequests || []),
      ...(state?.loans || []),
      ...(state?.shiftSwaps || []),
      ...(state?.permissionRequests || [])
    ];

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
          e &&
          (String(e.branchId) === String(currentBranchId) ||
            (e.branchesDetails && e.branchesDetails.some((bd) => bd && String(bd.branchId) === String(currentBranchId))))
      );
      const branchEmpIds = new Set(branchEmployees.filter((e) => e && e.id).map((e) => String(e.id)));

      const branchPendingReqs = pendingNewRequests.filter((r) => {
        if (!shouldShowRequestToBranch(r, state)) return false;
        if (r.branchId && String(r.branchId) === String(currentBranchId)) return true;
        if (r.employeeId && branchEmpIds.has(String(r.employeeId))) return true;
        return false;
      });

      if (branchPendingReqs.length > 0) {
        playNotificationChime();
        showToast('🔔 يوجد طلب جديد لموظف بالفرع يحتاج للمراجعة');
      }
    }
  }, [
    state?.requests,
    state?.leaveRequests,
    state?.loans,
    state?.shiftSwaps,
    state?.permissionRequests,
    authRole,
    currentBranch,
    state?.employees,
    showToast
  ]);
}
