import { useEffect, useRef } from 'react';
import {
  STORAGE_KEY,
  apiFetchSettings,
  apiFetchVersion,
  apiCreateEventSource
} from '../utils/apiClient';
import {
  subscribeToLiveState,
  subscribeToLiveRequests,
  subscribeToLiveRequestUpdates,
  subscribeToSyncHints,
  subscribeToEntityChanges
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
import { clearAllRequestsLocal } from '../utils/localDatabase';
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
    handleLogout = null,
    validateSessionAgainstData = null,
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

      if (handleLogout) handleLogout();
      else {
        setAuthRole('none');
        setIsAdminLoggedIn(false);
        setCurrentEmpUser(null);
        setCurrentBranch(null);
      }
      setState(normalized);
      showToast('🚨 تم تصفير ومسح قاعدة البيانات بالكامل. تم تسجيل الخروج بنجاح والبدء من جديد.');
      setTimeout(() => {
        window.location.href = '/';
      }, 800);
      return;
    }

    // ── فحص إبطال الجلسات اللحظي عند تغيير كلمات المرور أو ترقية رقم الجلسة ──
    const currentActiveRole = localStorage.getItem('app_auth_role') || authRole;
    const isOutstockRole = typeof currentActiveRole === 'string' && currentActiveRole.startsWith('outstock_');

    const isOwnerActive =
      !isOutstockRole && (
        currentActiveRole === 'owner' ||
        localStorage.getItem('app_owner_authenticated') === 'true' ||
        sessionStorage.getItem('app_owner_authenticated') === 'true' ||
        sessionStorage.getItem('app_settings_owner_tab_unlocked') === 'true'
      );

    const isAdminActive =
      !isOutstockRole && (
        currentActiveRole === 'admin' ||
        localStorage.getItem('app_is_admin') === 'true'
      );

    if (isOwnerActive) {
      const myOwnerPass = localStorage.getItem('app_owner_password_snapshot');
      const myOwnerVer = Number(localStorage.getItem('app_owner_session_version') || 0);
      const srvOwnerPass = normalized?.orgSettings?.ownerPassword;
      const srvOwnerVer = Number(normalized?.orgSettings?.ownerSessionVersion || 0);

      if (myOwnerVer === 0 && srvOwnerVer > 0) {
        try { localStorage.setItem('app_owner_session_version', String(srvOwnerVer)); } catch {}
      } else {
        const isRevoked = (myOwnerPass && srvOwnerPass && myOwnerPass !== srvOwnerPass) ||
                          (myOwnerVer > 0 && srvOwnerVer > 0 && srvOwnerVer > myOwnerVer);

        if (isRevoked) {
          if (handleLogout) {
            handleLogout();
          } else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_owner_authenticated');
            localStorage.removeItem('app_owner_password_snapshot');
            localStorage.removeItem('app_owner_session_version');
            localStorage.removeItem('pharmacy_owner_password');
            localStorage.removeItem('app_is_admin');
            sessionStorage.clear();
            setAuthRole('none');
            setIsAdminLoggedIn(false);
          }
          showToast('🔒 تم إنهاء جلسات المالك أو تغيير كلمة المرور. تم تسجيل الخروج تلقائياً لضمان الأمان.');
          return;
        }
      }
    } else if (isAdminActive) {
      const myAdminPass = localStorage.getItem('app_admin_password_snapshot');
      const myAdminVer = Number(localStorage.getItem('app_admin_session_version') || 0);
      const srvAdminPass = normalized?.orgSettings?.adminPassword || normalized?.orgSettings?.adminPass;
      const srvAdminVer = Number(normalized?.orgSettings?.adminSessionVersion || 0);

      if (myAdminVer === 0 && srvAdminVer > 0) {
        try { localStorage.setItem('app_admin_session_version', String(srvAdminVer)); } catch {}
      } else {
        const isRevoked = (myAdminPass && srvAdminPass && myAdminPass !== srvAdminPass) ||
                          (myAdminVer > 0 && srvAdminVer > 0 && srvAdminVer > myAdminVer);

        if (isRevoked) {
          if (handleLogout) {
            handleLogout();
          } else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_is_admin');
            localStorage.removeItem('app_admin_password_snapshot');
            localStorage.removeItem('app_admin_session_version');
            sessionStorage.clear();
            setAuthRole('none');
            setIsAdminLoggedIn(false);
          }
          showToast('🔒 تم إنهاء جلسات الإدارة من جهاز آخر. تم تسجيل الخروج تلقائياً لضمان الأمان.');
          return;
        }
      }
    } else if (currentActiveRole === 'branch' && currentBranch) {
      const myBranchPass = localStorage.getItem('app_branch_password_snapshot');
      const myBranchVer = Number(localStorage.getItem('app_branch_session_version') || 0);
      const liveBranch = (normalized?.branches || []).find(b => b && (String(b.id) === String(currentBranch.id) || String(b.branchCode) === String(currentBranch.branchCode)));

      if (liveBranch) {
        const isRevoked = (myBranchPass && liveBranch.password && myBranchPass !== liveBranch.password) ||
                          (Number(liveBranch.sessionVersion || 0) > myBranchVer);
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
                          (Number(liveEmp.sessionVersion || 0) > myEmpVer);
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
      // استطلاع متكيف فائق السرعة (3.5 ثوانٍ عند فتح الصفحة لضمان المزامنة في أقل من 5 ثوانٍ دائماً، و 25 ثانية في الخلفية)
      let delay = customDelay !== null ? customDelay : (isVisible ? 3500 : 25000);

      if (customDelay === null && pollFailures > 0) {
        delay = Math.min(30000, 4000 * Math.pow(1.3, Math.min(pollFailures, 4)));
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

    // و) استقبال الطلبات وتحديثات وقرارات الردود اللحظية فوراً (< 5ms) والتحديث المباشر للشاشات
    const handleIncomingRequestPayload = (payload) => {
      if (!payload) return;
      const incomingReq = payload.request;
      const incomingNotif = payload.notification;
      if (!incomingReq || !incomingReq.id) return;

      const reqIdStr = String(incomingReq.id);
      console.log('⚡ [RealtimeSync] معالجة طلب/رد فوري عبر الـ WebSockets:', reqIdStr, incomingReq.status || '');

      setState((prev) => {
        if (!prev) return prev;
        const existingReqs = Array.isArray(prev.requests) ? prev.requests : [];
        const exists = existingReqs.some((r) => r && String(r.id) === reqIdStr);
        
        // تحديث الطلب القائم بحالته الجديدة فورياً أو إدراجه كطلب جديد
        const updatedReqs = exists
          ? existingReqs.map((r) => String(r.id) === reqIdStr ? { ...r, ...incomingReq } : r)
          : [incomingReq, ...existingReqs];

        // تحديث مصفوفات الطلبات التخصصية (الإجازات، السلف، الأذونات، التبديلات) إن وُجدت
        const updateSpecialtyList = (list) => {
          if (!Array.isArray(list)) return list;
          return list.map((item) => (item && String(item.id) === reqIdStr ? { ...item, ...incomingReq } : item));
        };

        let updatedNotifs = Array.isArray(prev.notifications) ? prev.notifications : [];
        if (incomingNotif && incomingNotif.id) {
          updatedNotifs = [incomingNotif, ...updatedNotifs.filter((n) => n && String(n.id) !== String(incomingNotif.id))].slice(0, 300);
        }

        return {
          ...prev,
          requests: updatedReqs,
          leaveRequests: updateSpecialtyList(prev.leaveRequests),
          loans: updateSpecialtyList(prev.loans),
          shiftSwaps: updateSpecialtyList(prev.shiftSwaps),
          permissionRequests: updateSpecialtyList(prev.permissionRequests),
          resignationRequests: updateSpecialtyList(prev.resignationRequests),
          notifications: updatedNotifs,
          _requestsUpdatedAt: new Date().toISOString()
        };
      });
    };

    const unsubRequests = subscribeToLiveRequests(
      handleIncomingRequestPayload,
      (batchPayload) => {
        console.log(`📦 [RealtimeSync] تم اكتمال الحفظ الدفعي لـ (${batchPayload?.count || 0}) طلب على السيرفر (v${batchPayload?.version})`);
      },
      (purgePayload) => {
        console.log('🗑️ [RealtimeSync] استلام إشعار مسح وتطهير سجل الطلبات بالكامل من السيرفر');
        clearAllRequestsLocal().catch(() => {});
        const nowIso = purgePayload?.clearedAt || new Date().toISOString();
        try { localStorage.setItem('app_requests_cleared_at', nowIso); } catch {}
        setState((prev) => ({
          ...prev,
          requests: [],
          leaveRequests: [],
          shiftSwaps: [],
          resignationRequests: [],
          permissionRequests: [],
          notifications: (prev.notifications || []).filter((n) => !n.requestId && !String(n.id || '').startsWith('req_')),
          _requestsClearedAt: nowIso
        }));
      }
    );

    const unsubRequestUpdates = subscribeToLiveRequestUpdates(handleIncomingRequestPayload);

    // ز) استقبال التغييرات الذرية اللحظية لكافة الكيانات فورياً (< 30ms) وتحديث الشاشات مباشرة
    const unsubEntityChanges = subscribeToEntityChanges((payload) => {
      if (!payload || !payload.entityType) return;
      const { entityType, entityId, data, action, timestamp } = payload;
      const nowIso = timestamp || new Date().toISOString();
      console.log(`⚡ [RealtimeSync] استقبال تعديل ذري فوري (${entityType}: ${entityId || action})`);

      // إطلاق وميض بصري لطيف للعنصر المتأثر
      if (typeof window !== 'undefined' && entityId) {
        window.dispatchEvent(new CustomEvent('hr:entity-highlight', {
          detail: { entityType, entityId, action }
        }));
      }

      setState((prev) => {
        if (!prev) return prev;

        switch (entityType) {
          case 'employee':
          case 'employees': {
            const list = Array.isArray(prev.employees) ? [...prev.employees] : [];
            const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
            if (action === 'delete') {
              return {
                ...prev,
                employees: list.filter((e) => e && String(e.id) !== targetId && String(e.code) !== targetId),
                _lastDeltaSyncAt: nowIso
              };
            }
            const idx = list.findIndex((e) => e && (String(e.id) === targetId || (data?.code && String(e.code) === String(data.code))));
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
            } else if (data) {
              list.unshift({ ...data, updatedAt: nowIso });
            }
            return { ...prev, employees: list, _lastDeltaSyncAt: nowIso };
          }

          case 'shift':
          case 'shifts': {
            const list = Array.isArray(prev.shifts) ? [...prev.shifts] : [];
            const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
            if (action === 'delete') {
              return {
                ...prev,
                shifts: list.filter((s) => s && String(s.id) !== targetId),
                _lastDeltaSyncAt: nowIso
              };
            }
            const idx = list.findIndex((s) => s && String(s.id) === targetId);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
            } else if (data) {
              list.unshift({ ...data, updatedAt: nowIso });
            }
            return { ...prev, shifts: list, _lastDeltaSyncAt: nowIso };
          }

          case 'activeShift':
          case 'activeShifts': {
            const active = { ...(prev.activeShifts || {}) };
            if (action === 'delete' || !data) {
              delete active[entityId];
            } else if (entityId === 'all') {
              return { ...prev, activeShifts: { ...data }, _lastDeltaSyncAt: nowIso };
            } else {
              active[entityId] = { ...(active[entityId] || {}), ...data };
            }
            return { ...prev, activeShifts: active, _lastDeltaSyncAt: nowIso };
          }

          case 'roster':
          case 'rosters': {
            if (Array.isArray(prev.rosters)) {
              const list = [...prev.rosters];
              const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
              if (action === 'delete') {
                return { ...prev, rosters: list.filter((r) => r && String(r.id) !== targetId), _lastDeltaSyncAt: nowIso };
              }
              const idx = list.findIndex((r) => r && String(r.id) === targetId);
              if (idx >= 0) {
                list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
              } else if (data) {
                list.push({ ...data, updatedAt: nowIso });
              }
              return { ...prev, rosters: list, _lastDeltaSyncAt: nowIso };
            } else if (typeof prev.rosters === 'object') {
              return {
                ...prev,
                rosters: { ...prev.rosters, ...(entityId === 'active' ? data : { [entityId]: data }) },
                _lastDeltaSyncAt: nowIso
              };
            }
            return prev;
          }

          case 'adjustment':
          case 'adjustments': {
            const list = Array.isArray(prev.adjustments) ? [...prev.adjustments] : [];
            const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
            if (action === 'delete') {
              return { ...prev, adjustments: list.filter((a) => a && String(a.id) !== targetId), _lastDeltaSyncAt: nowIso };
            }
            const idx = list.findIndex((a) => a && String(a.id) === targetId);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
            } else if (data) {
              list.unshift({ ...data, updatedAt: nowIso });
            }
            return { ...prev, adjustments: list, _lastDeltaSyncAt: nowIso };
          }

          case 'loan':
          case 'loans': {
            const list = Array.isArray(prev.loans) ? [...prev.loans] : [];
            const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
            if (action === 'delete') {
              return { ...prev, loans: list.filter((l) => l && String(l.id) !== targetId), _lastDeltaSyncAt: nowIso };
            }
            const idx = list.findIndex((l) => l && String(l.id) === targetId);
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
            } else if (data) {
              list.unshift({ ...data, updatedAt: nowIso });
            }
            return { ...prev, loans: list, _lastDeltaSyncAt: nowIso };
          }

          case 'branch':
          case 'branches': {
            const list = Array.isArray(prev.branches) ? [...prev.branches] : [];
            const targetId = entityId ? String(entityId) : (data?.id ? String(data.id) : null);
            if (action === 'delete') {
              return { ...prev, branches: list.filter((b) => b && String(b.id) !== targetId), _lastDeltaSyncAt: nowIso };
            }
            const idx = list.findIndex((b) => b && (String(b.id) === targetId || (data?.branchCode && String(b.branchCode) === String(data.branchCode))));
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...data, updatedAt: nowIso };
            } else if (data) {
              list.push({ ...data, updatedAt: nowIso });
            }
            return { ...prev, branches: list, _lastDeltaSyncAt: nowIso };
          }

          case 'bylaws': {
            return { ...prev, bylaws: { ...(prev.bylaws || {}), ...data }, _lastDeltaSyncAt: nowIso };
          }

          case 'settings':
          case 'orgSettings': {
            return { ...prev, orgSettings: { ...(prev.orgSettings || {}), ...data }, _lastDeltaSyncAt: nowIso };
          }

          case 'officialLeaves': {
            return { ...prev, officialLeaves: data, _lastDeltaSyncAt: nowIso };
          }

          default:
            return prev;
        }
      });
    });

    const handleHighlightEvent = (e) => {
      const { entityId } = e.detail || {};
      if (!entityId || typeof document === 'undefined') return;
      const el = document.querySelector(`[data-id="${entityId}"], [data-emp-id="${entityId}"], [data-shift-id="${entityId}"], [data-req-id="${entityId}"]`);
      if (el) {
        el.classList.remove('realtime-highlight-row');
        void el.offsetWidth;
        el.classList.add('realtime-highlight-row');
        setTimeout(() => {
          el.classList.remove('realtime-highlight-row');
        }, 2600);
      }
    };
    window.addEventListener('hr:entity-highlight', handleHighlightEvent);

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
      if (unsubRequests) unsubRequests();
      if (unsubRequestUpdates) unsubRequestUpdates();
      if (unsubEntityChanges) unsubEntityChanges();
      unsubBroadcast();
      window.removeEventListener('hr:entity-highlight', handleHighlightEvent);
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
