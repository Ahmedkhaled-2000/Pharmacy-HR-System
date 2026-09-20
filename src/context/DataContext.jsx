import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  STORAGE_KEY,
  WORK_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY
} from '../utils/apiClient';
import {
  fmt,
  nowTimeStr,
  normalizeState,
  getEmployeeApprovedLeaves
} from '../utils/formatters';
import {
  getRealDate,
  getRealTodayStr
} from '../utils/timeEngine';
import {
  getEmployeeDaySchedule
} from '../utils/rosterEngine';
import {
  getActivePayrollMonth,
  getCycleDateRange,
  createDatePredicate
} from '../utils/periodEngine';
import {
  smartSaveState,
  smartLoadState,
  loadLocalStateFast,
  clearLocalDatabase
} from '../utils/offlineSync';
import {
  smartMergeStates
} from '../utils/stateMerger';
import {
  saveAutoBackupOnModification
} from '../utils/backupHelper';
import {
  DEFAULT_JOBS,
  getJobsList,
  isManagementJob
} from '../utils/jobsHelper';
import {
  getEffectiveShiftHours,
  syncAllEmployeesPermissionsAndLateness
} from '../utils/latePenaltyEngine';
import { useAuth } from './AuthContext';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import {
  isBranchMatch,
  calculateRatesAndSalaries,
  getEmployeeBranchAssignment
} from '../utils/branchMatcher';
import {
  initSyncEngine,
  subscribeToSyncEngine,
  enqueueNewRequest,
  enqueueRequestDecision,
  pullDeltaSync,
  processOutbox
} from '../utils/syncEngine';
import {
  getAllLocalRequests,
  putRequestsBatch
} from '../utils/localDatabase';
import { emitEntityChange } from '../utils/socketClient';
import { computeEmployeeLoanDeductionsForPeriod } from '../utils/loansEngine';

/**
 * كاشف التغييرات الذرية فائق السرعة
 * يستخرج الكيان المعدل فقط لبثه عبر WebSockets في أقل من 5 مللي ثانية
 */
function detectEntityDeltas(prevState, nextState) {
  const deltas = [];
  if (!prevState || !nextState) return deltas;

  try {
    // 1. الموظفون
    if (prevState.employees !== nextState.employees) {
      const prevList = Array.isArray(prevState.employees) ? prevState.employees : [];
      const nextList = Array.isArray(nextState.employees) ? nextState.employees : [];
      const prevMap = new Map(prevList.map((e) => [String(e.id || e.code), e]));
      const nextMap = new Map(nextList.map((e) => [String(e.id || e.code), e]));

      for (const [id, nextItem] of nextMap.entries()) {
        const prevItem = prevMap.get(id);
        if (!prevItem) {
          deltas.push({ entityType: 'employee', entityId: id, data: nextItem, action: 'create' });
        } else if (prevItem !== nextItem && (prevItem.updatedAt !== nextItem.updatedAt || JSON.stringify(prevItem) !== JSON.stringify(nextItem))) {
          deltas.push({ entityType: 'employee', entityId: id, data: nextItem, action: 'update' });
        }
      }

      for (const [id] of prevMap.entries()) {
        if (!nextMap.has(id)) {
          deltas.push({ entityType: 'employee', entityId: id, action: 'delete' });
        }
      }
    }

    // 2. الورديات
    if (prevState.shifts !== nextState.shifts) {
      const prevShifts = Array.isArray(prevState.shifts) ? prevState.shifts : [];
      const nextShifts = Array.isArray(nextState.shifts) ? nextState.shifts : [];
      if (nextShifts.length > prevShifts.length && nextShifts[0]) {
        deltas.push({ entityType: 'shift', entityId: nextShifts[0].id, data: nextShifts[0], action: 'create' });
      } else {
        const prevMap = new Map(prevShifts.slice(0, 100).map((s) => [String(s.id), s]));
        for (const nextS of nextShifts.slice(0, 100)) {
          const id = String(nextS.id);
          const prevS = prevMap.get(id);
          if (prevS && prevS !== nextS && JSON.stringify(prevS) !== JSON.stringify(nextS)) {
            deltas.push({ entityType: 'shift', entityId: id, data: nextS, action: 'update' });
            break;
          }
        }
      }
    }

    // 3. الورديات النشطة
    if (prevState.activeShifts !== nextState.activeShifts) {
      deltas.push({ entityType: 'activeShifts', entityId: 'all', data: nextState.activeShifts, action: 'update' });
    }

    // 4. المكافآت والخصومات
    if (prevState.adjustments !== nextState.adjustments) {
      const prevAdj = Array.isArray(prevState.adjustments) ? prevState.adjustments : [];
      const nextAdj = Array.isArray(nextState.adjustments) ? nextState.adjustments : [];
      if (nextAdj.length > prevAdj.length && nextAdj[0]) {
        deltas.push({ entityType: 'adjustment', entityId: nextAdj[0].id, data: nextAdj[0], action: 'create' });
      } else {
        deltas.push({ entityType: 'adjustment', entityId: 'all', data: nextAdj, action: 'update' });
      }
    }

    // 5. الجداول
    if (prevState.rosters !== nextState.rosters) {
      deltas.push({ entityType: 'roster', entityId: 'active', data: nextState.rosters, action: 'update' });
    }

    // 6. الفروع
    if (prevState.branches !== nextState.branches) {
      deltas.push({ entityType: 'branches', entityId: 'all', data: nextState.branches, action: 'update' });
    }

    // 7. اللائحة والإعدادات
    if (prevState.bylaws !== nextState.bylaws) {
      deltas.push({ entityType: 'bylaws', entityId: 'bylaws', data: nextState.bylaws, action: 'update' });
    }
    if (prevState.orgSettings !== nextState.orgSettings) {
      deltas.push({ entityType: 'settings', entityId: 'orgSettings', data: nextState.orgSettings, action: 'update' });
    }
  } catch (err) {
    console.warn('[detectEntityDeltas Warn]:', err);
  }

  return deltas;
}

const DataContext = createContext(null);

export function DataProvider({ children, showToast = () => {} }) {
  const {
    authRole,
    setAuthRole,
    currentBranch,
    setCurrentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    setIsAdminLoggedIn,
    handleLogout,
    validateSessionAgainstData
  } = useAuth();

  // Core Data State with Default Settings
  const [state, setState] = useState({
    orgSettings: {
      orgName: 'منظومة إدارة الموارد البشرية والرواتب',
      logoUrl: '',
      ownerUsername: (() => {
        try {
          return localStorage.getItem('pharmacy_owner_username') || 'owner';
        } catch { return 'owner'; }
      })(),
      ownerPassword: (() => {
        try {
          return localStorage.getItem('pharmacy_owner_password') || 'owner123';
        } catch { return 'owner123'; }
      })(),
      adminUsername: 'admin',
      adminPassword: '123',
      ownerModificationLocks: (() => {
        const defaultLocks = {
          lockEditSalary: false,
          lockEditAllowances: false,
          lockApproveLoans: false,
          lockDirectBonusDeduction: false,
          lockEditCutoffRules: false,
          lockDeleteEmployee: true,
          lockTerminateEmployee: false,
          lockSuspendBiometric: false,
          lockDeleteShifts: true,
          lockEditPastShifts: false,
          lockManualShiftEntry: false,
          lockManageBranches: false,
          lockManageJobs: false,
          lockEditSystemPermissions: false,
          lockApproveRequests: false,
          lockApproveLeaves: false,
          lockApprovePermissions: false,
          lockApproveDisciplinaryPenalties: false,
          lockApproveShiftSwaps: false,
          lockApproveRosters: false,
          lockApproveManualPunches: false,
          lockApproveResignations: false,
          lockApproveBonuses: false,
          lockApproveComplaints: false,
          lockRejectRequests: false,
          lockDeleteRequests: false,
          lockEditEvaluations: false,
          lockDeletePenalties: false,
          lockFactoryReset: true,
          lockRestoreBackup: true,
          lockChangeAdminCredentials: true,
          lockEditOrgSettings: false
        };
        try {
          if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('pharmacy-owner-locks');
            if (saved) return { ...defaultLocks, ...JSON.parse(saved) };
          }
        } catch {}
        return defaultLocks;
      })(),
      payrollPayoutStartDay: (() => {
        try {
          const v = localStorage.getItem('payroll_payout_start_day');
          return v !== null ? parseInt(v, 10) : 26;
        } catch { return 26; }
      })(),
      payrollPayoutEndDay: (() => {
        try {
          const v = localStorage.getItem('payroll_payout_end_day');
          return v !== null ? parseInt(v, 10) : 25;
        } catch { return 25; }
      })(),
      payrollPayoutDay: (() => {
        try {
          const v = localStorage.getItem('payroll_payout_end_day');
          return v !== null ? parseInt(v, 10) : 25;
        } catch { return 25; }
      })(),
      gmailConfig: (() => {
        const defaultCfg = {
          enabled: true,
          userEmail: '',
          appPassword: '',
          targetAdminEmail: '',
          serviceUrl: '',
          sendOnRequest: true,
          sendOnDecision: true,
          sendOnLateness: true,
          sendOnPenalty: true,
          sendDailyDigest: true
        };
        try {
          if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('pharmacy_gmail_config');
            if (saved) return { ...defaultCfg, ...JSON.parse(saved) };
          }
        } catch {}
        return defaultCfg;
      })()
    },
    jobs: DEFAULT_JOBS,
    branches: [],
    employees: [],
    bylaws: {
      gracePeriodMinutes: 15,
      resetPeriodDays: 30,
      latePenalties: [
        { occurrence: 1, action: 'تنبيه', deductionFraction: 0 },
        { occurrence: 2, action: 'إنذار كتابي', deductionFraction: 0 },
        { occurrence: 3, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
        { occurrence: 4, action: 'خصم ½ يوم', deductionFraction: 0.5 },
        { occurrence: 5, action: 'خصم يوم', deductionFraction: 1.0 }
      ],
      earlyExitPenalties: [
        { occurrence: 1, action: 'إنذار', deductionFraction: 0 },
        { occurrence: 2, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
        { occurrence: 3, action: 'خصم ½ يوم', deductionFraction: 0.5 },
        { occurrence: 4, action: 'خصم يوم', deductionFraction: 1.0 }
      ],
      deductionOptions: [
        { label: 'تنبيه / إنذار', value: 0 },
        { label: 'خصم ¼ يوم', value: 0.25 },
        { label: 'خصم ½ يوم', value: 0.5 },
        { label: 'خصم يوم كامل', value: 1.0 },
        { label: 'خصم يومين', value: 2.0 },
        { label: 'خصم ثلاث أيام', value: 3.0 }
      ]
    },
    approvalRules: [
      {
        id: 'rule_leave_over_3_days',
        requestType: 'long_leave',
        name: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)',
        typeLabel: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)',
        reqBranch: false,
        reqAdmin: true,
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: false
      },
      {
        id: 'rule_loan',
        requestType: 'loan',
        name: 'طلبات السلف الشهرية والتعليمات والآجل',
        typeLabel: 'طلبات السلف الشهرية والتعليمات والآجل',
        reqBranch: false,
        reqAdmin: true,
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: false
      },
      {
        id: 'rule_meds',
        requestType: 'credit_medicine',
        name: 'طلبات سحب الأدوية بالآجل',
        typeLabel: 'طلبات سحب الأدوية بالآجل',
        reqBranch: false,
        reqAdmin: true,
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: false
      },
      {
        id: 'rule_leave',
        requestType: 'leave',
        name: 'طلبات الإجازات (سنوية / مرضي / عارضة <= 3 أيام)',
        typeLabel: 'طلبات الإجازات (سنوية / مرضي / عارضة <= 3 أيام)',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_swap',
        requestType: 'swap',
        name: 'طلبات تبديل الشفتات والورديات',
        typeLabel: 'طلبات تبديل الشفتات والورديات',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_roster_edit',
        requestType: 'roster_update',
        name: 'طلبات تعديل الجدول الشهري والورديات والراحات',
        typeLabel: 'طلبات تعديل الجدول الشهري والورديات والراحات',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_permission',
        requestType: 'permission',
        name: 'طلبات أذونات وتأخيرات الموظفين',
        typeLabel: 'طلبات أذونات وتأخيرات الموظفين',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_bonus',
        requestType: 'bonus',
        name: 'طلبات المكافآت والحوافز',
        typeLabel: 'طلبات المكافآت والحوافز',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_biometric_verification',
        requestType: 'biometric_verification',
        name: 'طلبات اعتماد الحضور بالصورة (عند تعذر بصمة الوجه/اليد)',
        typeLabel: 'طلبات اعتماد الحضور بالصورة (عند تعذر بصمة الوجه/اليد)',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_biometric_registration',
        requestType: 'biometric_registration',
        name: 'طلبات اعتماد تسجيل بصمة جديدة ذاتياً',
        typeLabel: 'طلبات اعتماد تسجيل بصمة جديدة ذاتياً',
        reqBranch: false,
        reqAdmin: true,
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_biometric_reset',
        requestType: 'biometric_reset',
        name: 'طلبات إعادة تسجيل ومسح البصمة الإلكترونية',
        typeLabel: 'طلبات إعادة تسجيل ومسح البصمة الإلكترونية',
        reqBranch: false,
        reqAdmin: true,
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      }
    ],
    shifts: [],
    activeShifts: {},
    adjustments: [],
    requests: [],
    resignationRequests: [],
    evaluations: [],
    employeeNotes: [],
    loans: [],
    ipRestrictions: { enabled: false, allowedIps: [] },
    authorizedDevices: [],
    branchDirectives: [],
    adminDirectives: [],
    branchSales: [],
    branchSalesTargets: {},
    branchSalesSettings: {
      allowBranchManagersEntry: false,
      topN: 3
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingWatchdogRef = useRef(null);

  // صمام أمان زمني هندسي: يضمن عدم بقاء الأيقونة زرقاء لأكثر من 6 ثوانٍ تحت أي ظرف
  const startSyncing = useCallback(() => {
    setIsSyncing(true);
    if (isSyncingWatchdogRef.current) clearTimeout(isSyncingWatchdogRef.current);
    isSyncingWatchdogRef.current = setTimeout(() => {
      setIsSyncing(false);
    }, 6000);
  }, []);

  const stopSyncing = useCallback(() => {
    if (isSyncingWatchdogRef.current) clearTimeout(isSyncingWatchdogRef.current);
    setIsSyncing(false);
  }, []);

  const [lastSyncTime, setLastSyncTime] = useState('الآن');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const authRoleRef = useRef(authRole);
  authRoleRef.current = authRole;
  const currentEmpUserRef = useRef(currentEmpUser);
  currentEmpUserRef.current = currentEmpUser;
  const currentBranchRef = useRef(currentBranch);
  currentBranchRef.current = currentBranch;

  // Sync active user session with fresh database data safely without triggering re-render loops
  const syncSessionWithFreshData = useCallback((freshState) => {
    try {
      const activeRole = authRoleRef.current;
      const activeEmp = currentEmpUserRef.current;
      const activeBranch = currentBranchRef.current;

      if (activeRole === 'employee' && activeEmp) {
        const freshEmp = (freshState.employees || []).find(
          (e) => String(e.id) === String(activeEmp.id) || (activeEmp.code && String(e.code) === String(activeEmp.code))
        );
        if (freshEmp) {
          const oldJson = JSON.stringify(activeEmp);
          const newJson = JSON.stringify(freshEmp);
          if (oldJson !== newJson) {
            setCurrentEmpUser(freshEmp);
            localStorage.setItem('app_current_emp_user', newJson);
          }
        }
      } else if (activeRole === 'branch' && activeBranch) {
        const freshBranch = (freshState.branches || []).find(
          (b) => String(b.id) === String(activeBranch.id)
        );
        if (freshBranch) {
          const oldJson = JSON.stringify(activeBranch);
          const newJson = JSON.stringify(freshBranch);
          if (oldJson !== newJson) {
            setCurrentBranch(freshBranch);
            localStorage.setItem('app_current_branch', newJson);
          }
        }
      }
    } catch {}
  }, [setCurrentEmpUser, setCurrentBranch]);

  // Initial Load (Fast Local Cache -> Cloud Sync) - MUST RUN ONCE ON MOUNT
  useEffect(() => {
    let isMounted = true;

    loadLocalStateFast().then((cachedData) => {
      if (cachedData && isMounted) {
        const normalizedCached = normalizeState(cachedData);
        const syncedCached = syncAllEmployeesPermissionsAndLateness(normalizedCached);
        setState(syncedCached);
        syncSessionWithFreshData(syncedCached);
        setIsLoading(false);
      }
    }).catch(() => {});

    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 10000);

    smartLoadState().then(({ data }) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (!data) return;

      const normalized = normalizeState(data);

      // Check Factory Reset or Session Invalidation Epoch
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
        return;
      }

      // التحقق من صلاحية الجلسات ومطابقتها لأحدث بيانات واعتمادات عند تحميل البيانات
      if (validateSessionAgainstData) {
        validateSessionAgainstData(normalized);
      }

      const activeRole = localStorage.getItem('app_auth_role') || authRoleRef.current;
      const activeEmp = currentEmpUserRef.current;
      const activeBranch = currentBranchRef.current;

      if (activeRole === 'owner') {
        const myOwnerPass = localStorage.getItem('app_owner_password_snapshot');
        const myOwnerVer = Number(localStorage.getItem('app_owner_session_version') || 0);
        const srvOwnerPass = normalized?.orgSettings?.ownerPassword;
        const srvOwnerVer = Number(normalized?.orgSettings?.ownerSessionVersion || 0);
        if ((myOwnerPass && srvOwnerPass && myOwnerPass !== srvOwnerPass) ||
            (srvOwnerVer > 0 && srvOwnerVer > myOwnerVer)) {
          if (handleLogout) handleLogout();
          else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_owner_authenticated');
            setAuthRole('none');
            setIsAdminLoggedIn(false);
          }
        }
      } else if (activeRole === 'admin') {
        const myAdminPass = localStorage.getItem('app_admin_password_snapshot');
        const myAdminVer = Number(localStorage.getItem('app_admin_session_version') || 0);
        const srvAdminPass = normalized?.orgSettings?.adminPassword || normalized?.orgSettings?.adminPass;
        const srvAdminVer = Number(normalized?.orgSettings?.adminSessionVersion || 0);
        if ((myAdminPass && srvAdminPass && myAdminPass !== srvAdminPass) ||
            (srvAdminVer > 0 && srvAdminVer > myAdminVer)) {
          if (handleLogout) handleLogout();
          else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_is_admin');
            setAuthRole('none');
            setIsAdminLoggedIn(false);
          }
        }
      } else if (activeRole === 'employee' && activeEmp) {
        const liveEmp = (normalized.employees || []).find(e => String(e.id) === String(activeEmp.id) || String(e.code) === String(activeEmp.code));
        const myEmpPass = localStorage.getItem('app_emp_password_snapshot');
        const myEmpVer = Number(localStorage.getItem('app_emp_session_version') || 0);
        if (!liveEmp || (myEmpPass && liveEmp.password && myEmpPass !== liveEmp.password) ||
            (Number(liveEmp.sessionVersion || 0) > myEmpVer)) {
          if (handleLogout) handleLogout();
          else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_current_emp_user');
            setAuthRole('none');
            setCurrentEmpUser(null);
          }
        }
      } else if (activeRole === 'branch' && activeBranch) {
        const liveBranch = (normalized.branches || []).find(b => String(b.id) === String(activeBranch.id) || String(b.branchCode) === String(activeBranch.branchCode));
        const myBranchPass = localStorage.getItem('app_branch_password_snapshot');
        const myBranchVer = Number(localStorage.getItem('app_branch_session_version') || 0);
        if (!liveBranch || (myBranchPass && liveBranch.password && myBranchPass !== liveBranch.password) ||
            (Number(liveBranch.sessionVersion || 0) > myBranchVer)) {
          if (handleLogout) handleLogout();
          else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_current_branch');
            setAuthRole('none');
            setCurrentBranch(null);
          }
        }
      }

      const synced = syncAllEmployeesPermissionsAndLateness(normalized);
      setState((prev) => normalizeState(smartMergeStates(prev, synced)));
      setLastSyncTime(nowTimeStr());
      syncSessionWithFreshData(synced);

      // ترقية وتغذية متجر IndexedDB بالطلبات السابقة تلقائياً لدعم العمل دون اتصال
      if (Array.isArray(normalized.requests) && normalized.requests.length > 0) {
        putRequestsBatch(normalized.requests).catch(() => {});
      }

      // دمج أي طلبات محلية تم إنشاؤها أوفلاين في الـ State
      getAllLocalRequests().then((localReqs) => {
        if (localReqs && localReqs.length > 0) {
          setState((prev) => {
            const map = new Map((prev.requests || []).map((r) => [String(r.id), r]));
            localReqs.forEach((lr) => {
              if (lr && lr.id) {
                map.set(String(lr.id), { ...(map.get(String(lr.id)) || {}), ...lr });
              }
            });
            return { ...prev, requests: Array.from(map.values()) };
          });
        }
      }).catch(() => {});
    }).catch((err) => {
      if (isMounted) setIsLoading(false);
      console.error('Load error:', err);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  // Unify Document Title and Dynamic Favicon
  useEffect(() => {
    const orgName = state.orgSettings?.orgName;
    if (orgName) {
      document.title = `${orgName} — منظومة إدارة الموارد البشرية`;
    }
    const logoUrl = state.orgSettings?.logoUrl;
    if (logoUrl) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = logoUrl;
    }
  }, [state.orgSettings?.orgName, state.orgSettings?.logoUrl]);

  // تفعيل محرك المزامنة التزايدية الذكي والـ Transactional Outbox
  useEffect(() => {
    initSyncEngine(() => currentBranch?.id);

    const unsubscribe = subscribeToSyncEngine((event) => {
      if (!event) return;

      if (event.type === 'REQUEST_CREATED_OPTIMISTIC' || event.type === 'CROSS_TAB_REQUEST_SYNC') {
        setState((prev) => {
          const existing = prev.requests || [];
          const idx = existing.findIndex((r) => r && String(r.id) === String(event.request.id));
          if (idx >= 0) {
            const updated = [...existing];
            updated[idx] = { ...updated[idx], ...event.request };
            return { ...prev, requests: updated };
          }
          return { ...prev, requests: [event.request, ...existing] };
        });
      } else if (event.type === 'REQUEST_UPDATED_OPTIMISTIC' || event.type === 'REQUEST_SENT_CONFIRMED') {
        setState((prev) => ({
          ...prev,
          requests: (prev.requests || []).map((r) =>
            r && String(r.id) === String(event.request.id) ? { ...r, ...event.request } : r
          )
        }));
      } else if (event.type === 'DELTA_CHANGES_APPLIED') {
        // تحديث تزايدي فائق الخفة (< 2KB) تم تطبيقه على IndexedDB
        getAllLocalRequests().then((localReqs) => {
          if (localReqs && localReqs.length > 0) {
            setState((prev) => {
              const map = new Map((prev.requests || []).map((r) => [String(r.id), r]));
              const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'paid', 'partial', 'cancelled', 'waived', 'completed']);

              localReqs.forEach((lr) => {
                if (lr && lr.id) {
                  const idStr = String(lr.id);
                  const current = map.get(idStr);
                  if (current) {
                    const curStatus = String(current.status || '').toLowerCase();
                    const lrStatus = String(lr.status || '').toLowerCase();
                    // إذا كان الطلب في الحالة الحالية معتمداً أو مرفوضاً، والوارد معلقاً، لا يتم الرجوع للحالة المعلقة أبداً
                    if (TERMINAL_STATUSES.has(curStatus) && !TERMINAL_STATUSES.has(lrStatus)) {
                      map.set(idStr, { ...lr, ...current, status: current.status, adminApproved: current.adminApproved });
                      return;
                    }
                  }
                  map.set(idStr, { ...(current || {}), ...lr });
                }
              });
              return { ...prev, requests: Array.from(map.values()) };
            });
          }
        }).catch(() => {});
      }
    });

    return unsubscribe;
  }, [currentBranch]);

  // Real-Time Push Stream & Adaptive Polling Hook
  useRealtimeSync({
    state,
    setState,
    authRole,
    setAuthRole,
    currentBranch,
    setCurrentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    setIsAdminLoggedIn,
    handleLogout,
    validateSessionAgainstData,
    setIsLoading,
    setIsOffline,
    setPendingSyncCount,
    setLastSyncTime,
    showToast
  });

  // Save State with Optimistic UI, WebSocket Atomic Delta Broadcasting, & Auto-Backup
  const saveState = async (updatedState, deltaHint = null) => {
    // 1. بث ذري فوري عبر WebSockets لكافة الأجهزة والتبويبات (< 20ms)
    try {
      if (deltaHint && deltaHint.entityType) {
        emitEntityChange(deltaHint);
      } else {
        const deltas = detectEntityDeltas(state, updatedState);
        for (const d of deltas.slice(0, 5)) {
          emitEntityChange(d);
        }
      }
    } catch (broadcastErr) {
      console.warn('[Sync] Instant delta broadcast error:', broadcastErr);
    }

    // استخراج sliceKey إن وُجد لتسريع الحفظ السحابي وتفادي إرسال 4.2MB
    const sliceKey = deltaHint?.entityType || null;
    const sliceValue = sliceKey && updatedState[sliceKey] !== undefined ? updatedState[sliceKey] : null;

    startSyncing();
    let result = null;
    try {
      result = await smartSaveState(updatedState, {
        sliceKey,
        sliceValue,
        onSyncSuccess: (finalMerged) => {
          stopSyncing();
          setLastSyncTime(nowTimeStr());
          setPendingSyncCount(0);
        },
        onSyncFail: (msg) => {
          stopSyncing();
          console.error('Database write error:', msg);
          showToast?.('⚠️ تعذر الحفظ في قاعدة البيانات السحابية، تم الحفظ محلياً');
        },
        onQueuedOffline: async () => {
          stopSyncing();
          showToast?.('📴 أنت أوف لاين - تم الحفظ محلياً وسيتم التزامن عند عودة الإنترنت');
        }
      });
    } catch (saveErr) {
      stopSyncing();
      console.warn('[Sync] smartSaveState error:', saveErr);
    }

    // تحديث فوري وسلس لحالة التطبيق بدون أي تجميد
    if (result?.mergedState) {
      setState(result.mergedState);
    } else {
      setState(updatedState);
    }

    saveAutoBackupOnModification(result?.mergedState || updatedState, 'تعديل وحفظ بالمنظومة').catch((e) => {
      console.warn('[AutoBackup] Snapshot trigger skipped:', e);
    });

    return result;
  };


  // Manual Live Sync Trigger with Instant Feedback
  const triggerManualSync = async () => {
    startSyncing();
    try {
      const res = await syncNow((msg) => console.log('[ManualSync]', msg));
      if (res?.success) {
        if (res.mergedState) {
          const normalized = normalizeState(res.mergedState);
          setState(normalized);
        }
        setLastSyncTime(nowTimeStr());
        setPendingSyncCount(0);
        setIsOffline(false);
        showToast('✅ تمت المزامنة اللحظية مع السحابة بنجاح!');
        return true;
      } else {
        if (res?.reason === 'offline') {
          setIsOffline(true);
          showToast('📴 وضع عدم الاتصال - المنظومة تعمل محلياً بكفاءة 100%');
        } else {
          showToast('⚠️ لم تكتمل المزامنة، تم الحفظ والتأمين محلياً');
        }
        return false;
      }
    } catch (e) {
      showToast('⚠️ تعذر إتمام المزامنة: ' + (e?.message || 'خطأ اتصال'));
      return false;
    } finally {
      stopSyncing();
    }
  };

  // بث ذري مباشر لكائن محدد فوراً (< 5ms) عبر WebSockets
  const broadcastEntityChange = useCallback((entityType, entityId, data, action = 'update') => {
    emitEntityChange({ entityType, entityId, data, action });
  }, []);

  // Helper Methods
  const getEmp = useCallback((id) => {
    return (state.employees || []).find((e) => e.id === id || String(e.id) === String(id) || String(e.code) === String(id)) || null;
  }, [state.employees]);

  const getEmpPermission = useCallback((empOrId, permKey) => {
    if ((authRole === 'admin' || authRole === 'owner') && !empOrId) return true;

    let actionName = permKey;
    if (permKey.startsWith('can')) {
      actionName = permKey.slice(3);
    } else if (permKey.startsWith('allow')) {
      actionName = permKey.slice(5);
    }
    const canKey = 'can' + actionName;
    const allowKey = 'allow' + actionName;

    let empId = null;
    let empCode = null;
    let empUsername = null;
    let empObject = null;

    if (typeof empOrId === 'object' && empOrId !== null) {
      empObject = empOrId;
      empId = empOrId.id !== undefined && empOrId.id !== null ? String(empOrId.id) : null;
      empCode = empOrId.code !== undefined && empOrId.code !== null ? String(empOrId.code) : null;
      empUsername = empOrId.username !== undefined && empOrId.username !== null ? String(empOrId.username) : null;
    } else if (empOrId && empOrId !== 'all') {
      empId = String(empOrId);
    }

    const freshEmp = (state.employees || []).find((e) =>
      (empId && (String(e.id) === empId || String(e.code) === empId)) ||
      (empCode && (String(e.id) === empCode || String(e.code) === empCode)) ||
      (empUsername && (String(e.username) === empUsername || String(e.code) === empUsername))
    ) || empObject;

    const targetId = freshEmp?.id !== undefined ? String(freshEmp.id) : empId;
    const targetCode = freshEmp?.code !== undefined ? String(freshEmp.code) : empCode;

    // Helper to check key in a permissions object across all naming variations
    const checkInPermObj = (permObj) => {
      if (!permObj || typeof permObj !== 'object') return undefined;
      if (permObj[canKey] !== undefined) return Boolean(permObj[canKey]);
      if (permObj[allowKey] !== undefined) return Boolean(permObj[allowKey]);
      if (permObj[actionName] !== undefined) return Boolean(permObj[actionName]);
      if (permObj[permKey] !== undefined) return Boolean(permObj[permKey]);
      const lowerKey = actionName.toLowerCase();
      for (const [k, v] of Object.entries(permObj)) {
        const cleanK = k.replace(/^(can|allow)/i, '').toLowerCase();
        if (cleanK === lowerKey && v !== undefined) return Boolean(v);
      }
      return undefined;
    };

    // 1. Employee Specific Overrides in orgSettings.empPermissions (Highest Priority)
    const empOverrides = state.orgSettings?.empPermissions;
    if (empOverrides && typeof empOverrides === 'object') {
      const specificPerms = (targetId && empOverrides[targetId]) || 
                            (targetCode && empOverrides[targetCode]);
      const specificVal = checkInPermObj(specificPerms);
      if (specificVal !== undefined) return specificVal;
    }

    // 2. Global Permissions set by Top Management in orgSettings.permissions
    const globalPerms = state.orgSettings?.permissions;
    const globalVal = checkInPermObj(globalPerms);
    if (globalVal !== undefined) return globalVal;

    // 3. Fallback to Employee Object internal permissions (if any specific legacy override)
    const empPerms = freshEmp?.permissions;
    const empVal = checkInPermObj(empPerms);
    if (empVal !== undefined) return empVal;

    // 4. Default Permission Policies
    // Actions that are restricted/disabled by default (require explicit admin grant)
    const defaultFalseActions = ['addadjustment', 'manualshift', 'editshift'];
    const lowerAction = (actionName || '').toLowerCase();
    if (defaultFalseActions.includes(lowerAction)) {
      return false;
    }

    // All standard employee portal viewing and request actions default to true
    return true;
  }, [authRole, state.employees, state.orgSettings]);

  const getPayrollCutoffRange = useCallback((monthStr) => {
    return getCycleDateRange(monthStr, state.orgSettings);
  }, [state.orgSettings]);

  const getAbsenceDaysCount = useCallback((empId, monthStr) => {
    if (!monthStr || monthStr.length !== 7) return 0;
    const emp = getEmp(empId);
    if (emp?.noMonthlySchedule) return 0;
    const empIdStr = String(empId);
    const empCodeStr = emp?.code ? String(emp.code) : '';
    const range = getPayrollCutoffRange(monthStr);
    let dates = [];

    if (range && range.startDate && range.endDate) {
      let cur = new Date(range.startDate);
      const end = new Date(range.endDate);
      if (!isNaN(cur) && !isNaN(end) && cur <= end) {
        while (cur <= end) {
          const cy = cur.getFullYear();
          const cm = cur.getMonth() + 1;
          const cd = cur.getDate();
          dates.push(`${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`);
          cur.setDate(cur.getDate() + 1);
        }
      }
    } else if (monthStr && monthStr.length === 7) {
      const [y, m] = monthStr.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    const today = getRealTodayStr();
    let count = 0;

    for (const dateStr of dates) {
      if (dateStr >= today) continue;
      const daySchedule = getEmployeeDaySchedule(empIdStr, dateStr, state);
      if (!daySchedule || daySchedule.type === 'off' || daySchedule.isOff) continue;
      const hasShift = (state.shifts || []).some(s => {
        if (!s || s.date !== dateStr) return false;
        if (s.isCancelled || s.status === 'cancelled' || s.isRejectedPhoto || s.status === 'rejected_photo') return false;
        if (typeof s.statusLabel === 'string' && (s.statusLabel.includes('ملغي') || s.statusLabel.includes('مرفوض'))) return false;
        const matchEmp = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode || s.employeeId) === empCodeStr);
        if (!matchEmp) return false;
        const effHours = getEffectiveShiftHours(s, state);
        return effHours > 0 || (s.timeIn && s.timeOut);
      });
      if (hasShift) continue;

      const allLeaveRequests = [...(state.leaveRequests || []), ...(state.requests || [])];
      const hasLeave = allLeaveRequests.some(
        r => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode || r.employeeId) === empCodeStr)) &&
        (r.status === 'approved' || r.adminApproved) &&
        r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;
      count++;
    }
    return count;
  }, [state, getPayrollCutoffRange, getEmp]);

  const computeEmpSummary = useCallback((empId, filterFn, monthStr = null, targetBranchId = null) => {
    const emp = getEmp(empId);
    if (!emp) return { hours: 0, dailyRate: 0, rate: 0, hourlyRate: 0, monthlySalary: 0, contractualMonthlySalary: 0, salary: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

    let effectiveFilterFn = filterFn;
    if (!effectiveFilterFn) {
      if (monthStr && typeof monthStr === 'string' && monthStr.length >= 7) {
        const targetMonth = monthStr.slice(0, 7);
        const range = getPayrollCutoffRange(targetMonth);
        if (range && range.startDate && range.endDate) {
          effectiveFilterFn = (d) => {
            if (!d) return false;
            const dStr = String(d).slice(0, 10);
            return dStr >= range.startDate && dStr <= range.endDate;
          };
        } else {
          effectiveFilterFn = (d) => d && String(d).startsWith(targetMonth);
        }
      } else {
        effectiveFilterFn = () => true;
      }
    }

    const allBranchesList = state.branches || [];
    const targetBranchObj = targetBranchId
      ? allBranchesList.find(b => isBranchMatch(targetBranchId, b)) || { id: targetBranchId }
      : null;

    let branches = [];
    if (emp.branchesDetails && emp.branchesDetails.length > 0) {
      branches = emp.branchesDetails;
    } else {
      branches = [{
        branchId: emp.branchId || 'main',
        salary: emp.salary || 0,
        workHoursPerDay: emp.workHoursPerDay || emp.workHours || WORK_HOURS_PER_DAY,
        workDaysPerMonth: emp.workDaysPerMonth || emp.workDays || WORK_DAYS_PER_MONTH,
        breakHours: emp.breakHours || emp.defaultBreakHours || 0
      }];
    }

    const isTargetFilterActive = Boolean(targetBranchId);
    if (isTargetFilterActive) {
      // البحث عن الفرع المستهدف في قائمة فروع الموظف بمطابقة مرنة
      const matchingBranches = branches.filter(b => isBranchMatch(b.branchId, targetBranchObj));
      if (matchingBranches.length > 0) {
        branches = matchingBranches;
      } else {
        // فحص ما إذا كان الفرع الأساسي للموظف يطابق الفرع المستهدف
        const isPrimary = isBranchMatch(emp.branchId || emp.branchCode || emp.branchName, targetBranchObj);
        if (isPrimary) {
          branches = [{
            branchId: targetBranchId,
            salary: emp.salary || 0,
            workHoursPerDay: emp.workHoursPerDay || emp.workHours || WORK_HOURS_PER_DAY,
            workDaysPerMonth: emp.workDaysPerMonth || emp.workDays || WORK_DAYS_PER_MONTH,
            breakHours: emp.breakHours || emp.defaultBreakHours || 0
          }];
        } else {
          // الموظف غير معين أساسياً بهذا الفرع، ولكنه قد يمتلك بصمات/ورديات متنقلة (roaming) في هذا الفرع
          const defaultDetail = branches[0] || {};
          branches = [{
            branchId: targetBranchId,
            salary: defaultDetail.salary || emp.salary || 0,
            workHoursPerDay: defaultDetail.workHoursPerDay || defaultDetail.workHours || WORK_HOURS_PER_DAY,
            workDaysPerMonth: defaultDetail.workDaysPerMonth || defaultDetail.workDays || WORK_DAYS_PER_MONTH,
            breakHours: defaultDetail.breakHours || 0,
            isRoaming: true
          }];
        }
      }
    }

    let totalHours = 0;
    let totalBaseEarnings = 0;
    let totalApprovedOvertimeHours = 0;
    let totalPendingOvertimeHours = 0;
    let totalOvertimeEarnings = 0;
    let totalAbsenceDaysCount = 0;
    let totalAbsenceDeduction = 0;
    const perBranch = {};

    branches.forEach((b) => {
      const bId = b.branchId;
      const bObj = allBranchesList.find(br => isBranchMatch(bId, br)) || { id: bId };

      const rates = calculateRatesAndSalaries({
        salaryInput: b.salary,
        workHoursPerDay: b.workHoursPerDay || b.workHours || 8,
        workDaysPerMonth: b.workDaysPerMonth || b.workDays || 26,
        breakHours: b.breakHours || 0
      });

      const { dailyRate, hourlyRate: rate, monthlySalary } = rates;

      // حصر ورديات هذا الفرع بدقة بالغة وبدون تسريب ورديات الفروع الأخرى (واستبعاد أي ورديات ملغاة أو مرفوضة نهائياً)
      const bShifts = (state.shifts || []).filter(s => {
        if (!s) return false;
        if (s.status === 'cancelled' || s.status === 'rejected' || s.status === 'rejected_photo' || s.isRejectedPhoto || s.isCancelled || s.rejected) return false;
        if (typeof s.statusLabel === 'string' && (s.statusLabel.includes('ملغي') || s.statusLabel.includes('مرفوض'))) return false;
        if (String(s.employeeId) !== String(empId)) return false;
        if (!effectiveFilterFn(s.date)) return false;
        if (s.branchId) {
          return isBranchMatch(s.branchId, bObj);
        }
        // إذا لم يُسجل فرع في الوردية، تنسب للفرع الأساسي للموظف
        const primaryBId = emp.branchId || branches[0]?.branchId;
        return isBranchMatch(primaryBId, bObj);
      });

      const hours = bShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);
      const baseEarnings = hours * rate;

      const isFlexibleSchedule = Boolean(emp?.noMonthlySchedule);

      const approvedOtHours = isFlexibleSchedule ? 0 : bShifts
        .filter(s => s.overtimeStatus === 'approved' || (parseFloat(s.overtimeHours) > 0 && s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const pendingOtHours = isFlexibleSchedule ? 0 : bShifts
        .filter(s => s.overtimeStatus === 'pending' || (parseFloat(s.overtimeHours) > 0 && !s.overtimeStatus && !s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const otEarnings = Math.round(approvedOtHours * rate * 100) / 100;

      let absenceDaysCount = 0;
      let absenceDeduction = 0;
      // استقطاع الغياب يُحسب على الفرع الأساسي فقط للموظف حتى لا يتكرر (ويُعفى منه الموظف الذي ليس له جدول شهري)
      const isPrimaryBranch = isBranchMatch(emp.branchId || (emp.branchesDetails && emp.branchesDetails[0]?.branchId), bObj);
      if (!isFlexibleSchedule && (isPrimaryBranch || (!isTargetFilterActive && bId === branches[0]?.branchId))) {
        absenceDaysCount = getAbsenceDaysCount(empId, monthStr);
        absenceDeduction = absenceDaysCount * dailyRate;
        totalAbsenceDaysCount += absenceDaysCount;
        totalAbsenceDeduction += absenceDeduction;
      }

      perBranch[bId] = {
        hours,
        baseEarnings,
        rate,
        dailyRate,
        hourlyRate: rate,
        monthlySalary: b.isRoaming ? 0 : monthlySalary,
        contractualMonthlySalary: b.isRoaming ? 0 : monthlySalary,
        absenceDaysCount,
        absenceDeduction,
        approvedOtHours,
        pendingOtHours,
        otEarnings
      };

      totalHours += hours;
      totalBaseEarnings += baseEarnings;
      totalApprovedOvertimeHours += approvedOtHours;
      totalPendingOvertimeHours += pendingOtHours;
      totalOvertimeEarnings += otEarnings;
    });

    const isPrimaryForAdjustments = !isTargetFilterActive || isBranchMatch(emp.branchId || (emp.branchesDetails && emp.branchesDetails[0]?.branchId), targetBranchObj);

    // المكافآت والخصومات
    const empAdjs = (state.adjustments || []).filter(a => {
      if (String(a.employeeId) !== String(empId)) return false;
      if (!effectiveFilterFn(a.date)) return false;
      if (isTargetFilterActive) {
        if (a.branchId) return isBranchMatch(a.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    const totalBonus = empAdjs.filter(a => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
    const manualDeduction = empAdjs.filter(a => a.type === 'deduction').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    // الجزاءات والتأخيرات (لا تطبق على موظف الساعات المتغيرة بدون جدول)
    const isFlexibleSchedule = Boolean(emp?.noMonthlySchedule);
    const empLateIncidents = isFlexibleSchedule ? [] : (state.lateIncidents || []).filter(i => {
      if (String(i.employeeId) !== String(empId)) return false;
      if (!effectiveFilterFn(i.date)) return false;
      if (i.status === 'cancelled') return false;
      if (isTargetFilterActive) {
        if (i.branchId) return isBranchMatch(i.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    const lateDeduction = isFlexibleSchedule ? 0 : empLateIncidents.reduce((acc, i) => acc + (parseFloat(i.penaltyAmount) || 0), 0);
    const lateDeductionMinutes = isFlexibleSchedule ? 0 : empLateIncidents.reduce((acc, i) => acc + (parseFloat(i.deductionMinutes) || 0), 0);

    // السلف والأقساط الشهرية (محسوبة بدقة عبر محرك السلف الموحد loansEngine)
    const activeTargetMonth = (monthStr && typeof monthStr === 'string' && monthStr.length >= 7)
      ? monthStr.slice(0, 7)
      : null;

    const loanCalculation = computeEmployeeLoanDeductionsForPeriod(
      empId,
      activeTargetMonth,
      state,
      targetBranchId || null
    );
    const loanDeduction = loanCalculation.totalDeduction;
    const loansBreakdown = loanCalculation.items;

    // الإجازات المعتمدة
    const empApprovedLeaves = getEmployeeApprovedLeaves(emp, state, effectiveFilterFn);
    let unpaidLeaveDaysCount = 0;
    let annualLeaveDaysCount = 0;

    empApprovedLeaves.forEach((l) => {
      if (isTargetFilterActive) {
        if (l.branchId && !isBranchMatch(l.branchId, targetBranchObj)) return;
        if (!l.branchId && !isPrimaryForAdjustments) return;
      }
      const isUnpaid = l.leaveType === 'unpaid' || l.type === 'unpaid_leave' || l.isUnpaid === true;
      const daysCount = parseFloat(l.daysCount || l.days || 1) || 1;
      if (isUnpaid) unpaidLeaveDaysCount += daysCount;
      else annualLeaveDaysCount += daysCount;
    });

    const primaryBranchId = branches[0]?.branchId;
    const branchRateInfo = perBranch[primaryBranchId] || Object.values(perBranch)[0] || { rate: 0, dailyRate: 0 };
    let rate = branches.length === 1 ? branchRateInfo.rate : (totalHours > 0 ? totalBaseEarnings / totalHours : branchRateInfo.rate);
    let dailyRate = branches.length === 1 ? branchRateInfo.dailyRate : (rate * (parseFloat(branches[0]?.workHoursPerDay) || WORK_HOURS_PER_DAY));
    const unpaidLeaveDeduction = Math.round(unpaidLeaveDaysCount * dailyRate * 100) / 100;

    const totalDeduction = manualDeduction + loanDeduction + totalAbsenceDeduction + lateDeduction + unpaidLeaveDeduction;

    const isMgmt = isManagementJob(emp.jobTitle, getJobsList(state)) || Boolean(emp.isManagement) || (parseFloat(emp.managementAllowance) || 0) > 0;
    let managementAllowance = parseFloat(emp.managementAllowance) || 0;
    let transportAllowance = parseFloat(emp.transportAllowance) || 0;
    let extraAllowance = parseFloat(emp.extraAllowance) || 0;
    if (Array.isArray(emp.extraAllowances) && emp.extraAllowances.length > 0) {
      const sumList = emp.extraAllowances.reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
      if (sumList > 0 || extraAllowance === 0) {
        extraAllowance = sumList;
      }
    }

    // إذا تم تحديد فرع، تُحتسب البدلات العامة مع الفرع الأساسي فقط
    if (isTargetFilterActive && !isPrimaryForAdjustments) {
      managementAllowance = 0;
      transportAllowance = 0;
      extraAllowance = 0;
    }

    // بدل الحضور اليومي (مع استبعاد أي ورديات ملغاة أو مرفوضة من احتساب الحضور)
    const allEmployeeShifts = (state.shifts || []).filter(s =>
      s &&
      s.status !== 'cancelled' &&
      s.status !== 'rejected' &&
      s.status !== 'rejected_photo' &&
      !s.isRejectedPhoto &&
      !s.isCancelled &&
      !s.rejected &&
      !(typeof s.statusLabel === 'string' && (s.statusLabel.includes('ملغي') || s.statusLabel.includes('مرفوض'))) &&
      (String(s.employeeId) === String(empId) || (emp.code && String(s.employeeCode || s.employeeId) === String(emp.code))) &&
      effectiveFilterFn(s.date) &&
      (s.timeIn || s.checkIn || getEffectiveShiftHours(s, state) > 0)
    );

    const firstBranchByDate = {};
    allEmployeeShifts.forEach(s => {
      if (!s.date) return;
      const bId = s.branchId || (branches[0] ? branches[0].branchId : null);
      if (!firstBranchByDate[s.date]) {
        firstBranchByDate[s.date] = { branchId: bId, timeIn: s.timeIn || '99:99', createdAt: s.createdAt || '' };
      } else {
        const currentFirst = firstBranchByDate[s.date];
        const sTime = s.timeIn || '99:99';
        if (sTime < currentFirst.timeIn || (sTime === currentFirst.timeIn && s.createdAt && s.createdAt < currentFirst.createdAt)) {
          firstBranchByDate[s.date] = { branchId: bId, timeIn: sTime, createdAt: s.createdAt || '' };
        }
      }
    });

    const attendedDatesSet = new Set();
    allEmployeeShifts.forEach(s => {
      if (!s.date) return;
      if (s.excludeDailyAllowance) return;
      const firstBranch = firstBranchByDate[s.date];
      const sBranchId = s.branchId || (branches[0] ? branches[0].branchId : null);

      if (isTargetFilterActive) {
        if (isBranchMatch(sBranchId, targetBranchObj) && firstBranch && isBranchMatch(firstBranch.branchId, targetBranchObj)) {
          attendedDatesSet.add(s.date);
        }
      } else {
        attendedDatesSet.add(s.date);
      }
    });
    const attendedDaysCount = attendedDatesSet.size;

    const baseDailyAllowanceAmount = parseFloat(emp.dailyAllowanceAmount) || 0;
    const dailyAllowanceTitle = emp.dailyAllowanceTitle?.trim() || 'بدل يومي';

    let dailyAllowancesList = Array.isArray(emp.dailyAllowances) && emp.dailyAllowances.length > 0
      ? emp.dailyAllowances.filter(a => (parseFloat(a.amount) || 0) > 0)
      : [];

    if (dailyAllowancesList.length === 0 && baseDailyAllowanceAmount > 0) {
      dailyAllowancesList = [{
        id: 'default_daily_allowance',
        title: dailyAllowanceTitle,
        amount: baseDailyAllowanceAmount
      }];
    }

    const totalDailyAllowanceRate = dailyAllowancesList.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0) || baseDailyAllowanceAmount;
    const dailyAllowanceTotal = attendedDaysCount * totalDailyAllowanceRate;

    const dailyAllowancesBreakdown = dailyAllowancesList.map(item => ({
      id: item.id,
      title: item.title || 'بدل يومي',
      dailyRate: parseFloat(item.amount) || 0,
      attendedDaysCount,
      totalAmount: attendedDaysCount * (parseFloat(item.amount) || 0)
    }));

    const totalAllowances = managementAllowance + transportAllowance + extraAllowance + dailyAllowanceTotal;
    const totalEarnings = totalBaseEarnings + totalOvertimeEarnings;
    const netSalary = totalBaseEarnings + totalOvertimeEarnings + totalBonus + totalAllowances - totalDeduction;

    const contractualMonthlySalary = Object.values(perBranch).reduce((acc, b) => acc + (b.contractualMonthlySalary || 0), 0);

    return {
      hours: totalHours,
      totalHours: totalHours + totalApprovedOvertimeHours,
      regularHours: totalHours,
      approvedOvertimeHours: totalApprovedOvertimeHours,
      pendingOvertimeHours: totalPendingOvertimeHours,
      overtimeHours: totalApprovedOvertimeHours,
      overtimeEarnings: totalOvertimeEarnings,
      dailyRate,
      rate,
      hourlyRate: rate,
      monthlySalary: contractualMonthlySalary,
      contractualMonthlySalary,
      salary: contractualMonthlySalary,
      baseEarnings: totalBaseEarnings,
      totalEarnings,
      totalBonus,
      totalAllowances,
      managementAllowance,
      transportAllowance,
      extraAllowance,
      extraAllowances: Array.isArray(emp.extraAllowances) && emp.extraAllowances.length > 0
        ? emp.extraAllowances
        : (extraAllowance > 0 ? [{ id: '1', title: emp.extraAllowanceTitle || 'أجر إضافي', amount: extraAllowance }] : []),
      extraAllowanceTitle: emp.extraAllowanceTitle || '',
      dailyAllowanceAmount: totalDailyAllowanceRate,
      dailyAllowanceTitle,
      attendedDaysCount,
      dailyAllowanceTotal,
      dailyAllowancesBreakdown,
      isManagement: isMgmt,
      noMonthlySchedule: isFlexibleSchedule,
      weeklyRestDays: emp.weeklyRestDays || ['الجمعة'],
      totalDeduction,
      lateDeduction,
      lateDeductionMinutes,
      manualDeduction,
      loanDeduction,
      loansDeduction: loanDeduction,
      loansBreakdown,
      absenceDeduction: totalAbsenceDeduction,
      absenceDaysCount: totalAbsenceDaysCount,
      unpaidLeaveDaysCount,
      unpaidLeaveDeduction,
      annualLeaveDaysCount,
      netSalary,
      perBranch
    };
  }, [state, getEmp, getAbsenceDaysCount, getPayrollCutoffRange]);

  const computeGrandPayroll = useCallback((filterFn, monthStr = null) => {
    const perEmp = {};
    (state.employees || []).forEach((e) => {
      perEmp[e.id] = computeEmpSummary(e.id, filterFn, monthStr);
    });

    const totalHours = Object.values(perEmp).reduce((s, e) => s + e.hours, 0);
    const totalBaseEarnings = Object.values(perEmp).reduce((s, e) => s + e.baseEarnings, 0);
    const totalOvertimeHours = Object.values(perEmp).reduce((s, e) => s + (e.approvedOvertimeHours || 0), 0);
    const totalOvertimeEarnings = Object.values(perEmp).reduce((s, e) => s + (e.overtimeEarnings || 0), 0);
    const totalBonus = Object.values(perEmp).reduce((s, e) => s + e.totalBonus, 0);
    const totalAllowances = Object.values(perEmp).reduce((s, e) => s + (e.totalAllowances || 0), 0);
    const totalDailyAllowances = Object.values(perEmp).reduce((s, e) => s + (e.dailyAllowanceTotal || 0), 0);
    const totalDeduction = Object.values(perEmp).reduce((s, e) => s + e.totalDeduction, 0);
    const totalNetSalary = Object.values(perEmp).reduce((s, e) => s + e.netSalary, 0);

    return {
      perEmp,
      totalHours,
      totalBaseEarnings,
      totalOvertimeHours,
      totalOvertimeEarnings,
      totalBonus,
      totalAllowances,
      totalDailyAllowances,
      totalDeduction,
      totalNetSalary
    };
  }, [state.employees, computeEmpSummary]);

  const value = {
    state,
    setState,
    saveState,
    broadcastEntityChange,
    triggerManualSync,
    isLoading,
    setIsLoading,
    isSyncing,
    lastSyncTime,
    isOffline,
    pendingSyncCount,
    setPendingSyncCount,
    getEmp,
    getEmpPermission,
    getAbsenceDaysCount,
    getPayrollCutoffRange,
    computeEmpSummary,
    computeGrandPayroll,
    enqueueNewRequest,
    enqueueRequestDecision,
    pullDeltaSync,
    processOutbox
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
