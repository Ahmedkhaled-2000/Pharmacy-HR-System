import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  STORAGE_KEY,
  WORK_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
  apiSaveSettingsSlice
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
  createDatePredicate,
  reconcileCycleTerminatedBranches
} from '../utils/periodEngine';
import {
  smartSaveState,
  smartLoadState,
  loadLocalStateFast,
  saveStateLocally,
  clearLocalDatabase,
  syncNow
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
  syncAllEmployeesPermissionsAndLateness,
  isVariableScheduleEmployee,
  auditAndCleanFlexibleStaffPenalties
} from '../utils/latePenaltyEngine';
import { calculateShiftMetrics } from '../utils/workHoursEngine';
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
import { emitEntityChange, subscribeToPunchRecorded, subscribeToBatchPunches, joinSyncRoom } from '../utils/socketClient';
import { listenToLocalKioskPunches } from '../utils/kioskOutbox';
import { computeEmployeeLoanDeductionsForPeriod, checkAndAutoSettleExpiredPayrollLoans } from '../utils/loansEngine';
import {
  getAuthoritativeEmployeeRates,
  getAuthoritativeScheduledShift,
  getAuthoritativeShiftMetrics,
  calculateAuthoritativeCycleSummary,
  generateAuthoritativeAuditDossier
} from '../utils/unifiedPayrollEngine';
import {
  runPayrollHealthAudit,
  formatPayrollHealthAlertsForWhatsApp
} from '../utils/payrollWatchdog';

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

    // 7. اللائحة والإعدادات وقواعد الموافقات
    if (prevState.approvalRules !== nextState.approvalRules) {
      deltas.push({ entityType: 'approvalRules', entityId: 'all', data: nextState.approvalRules, action: 'update' });
    }
    if (prevState.bylaws !== nextState.bylaws) {
      deltas.push({ entityType: 'bylaws', entityId: 'bylaws', data: nextState.bylaws, action: 'update' });
    }
    if (prevState.orgSettings !== nextState.orgSettings) {
      deltas.push({ entityType: 'orgSettings', entityId: 'orgSettings', data: nextState.orgSettings, action: 'update' });
    }

    // 8. الطلبات والإجازات والسلف وتظلمات الجزاءات (Instant Delta Broadcast < 5ms)
    if (prevState.requests !== nextState.requests) {
      const prevReqs = Array.isArray(prevState.requests) ? prevState.requests : [];
      const nextReqs = Array.isArray(nextState.requests) ? nextState.requests : [];
      const prevMap = new Map(prevReqs.map(r => [String(r.id), r]));
      for (const nextR of nextReqs.slice(0, 50)) {
        const id = String(nextR.id);
        const prevR = prevMap.get(id);
        if (!prevR) {
          deltas.push({ entityType: 'request', entityId: id, data: nextR, action: 'create' });
        } else if (prevR.status !== nextR.status || prevR.adminApproved !== nextR.adminApproved || prevR.updatedAt !== nextR.updatedAt) {
          deltas.push({ entityType: 'request', entityId: id, data: nextR, action: 'update' });
        }
      }
    }
    if (prevState.leaveRequests !== nextState.leaveRequests) {
      deltas.push({ entityType: 'leaveRequests', entityId: 'all', data: nextState.leaveRequests, action: 'update' });
    }
    if (prevState.loans !== nextState.loans) {
      deltas.push({ entityType: 'loans', entityId: 'all', data: nextState.loans, action: 'update' });
    }
    if (prevState.lateIncidents !== nextState.lateIncidents) {
      deltas.push({ entityType: 'lateIncidents', entityId: 'all', data: nextState.lateIncidents, action: 'update' });
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
      orgName: 'نظام إدارة الصيدليات',
      logoUrl: '',
      ownerUsername: 'saif',
      ownerPassword: (() => {
        try {
          return localStorage.getItem('pharmacy_owner_password') || '181013';
        } catch { return '181013'; }
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
          return v !== null ? parseInt(v, 10) : 21;
        } catch { return 21; }
      })(),
      payrollPayoutEndDay: (() => {
        try {
          const v = localStorage.getItem('payroll_payout_end_day');
          return v !== null ? parseInt(v, 10) : 20;
        } catch { return 20; }
      })(),
      payrollPayoutDay: (() => {
        try {
          const v = localStorage.getItem('payroll_payout_end_day');
          return v !== null ? parseInt(v, 10) : 20;
        } catch { return 20; }
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
      },
      {
        id: 'rule_forgotten_break',
        requestType: 'forgotten_break',
        name: 'طلبات تأكيد وتعديل ساعات نسيان بصمة البريك',
        typeLabel: 'نسيان بصمة بريك',
        reqBranch: true,
        reqAdmin: true,
        requiresBranchManager: true,
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

      if (serverEpoch !== '0' && (!currentKnownEpoch || currentKnownEpoch === '0')) {
        try { localStorage.setItem('last_known_session_epoch', serverEpoch); } catch {}
      }
      if (normalized._systemResetToken && !currentKnownResetToken) {
        try { localStorage.setItem('last_known_reset_token', normalized._systemResetToken); } catch {}
      }

      const effectiveKnownResetToken = localStorage.getItem('last_known_reset_token') || '';
      const effectiveKnownEpoch = localStorage.getItem('last_known_session_epoch') || '0';

      const isResetTriggered = (normalized._systemResetToken && effectiveKnownResetToken && normalized._systemResetToken !== effectiveKnownResetToken) ||
                               (serverEpoch !== '0' && effectiveKnownEpoch !== '0' && serverEpoch !== effectiveKnownEpoch);

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
        const myOwnerUser = String(localStorage.getItem('app_owner_username_snapshot') || '').trim().toLowerCase();
        const myOwnerVer = Number(localStorage.getItem('app_owner_session_version') || 0);

        const systemOwners = Array.isArray(normalized?.orgSettings?.systemOwners) ? normalized.orgSettings.systemOwners : [];
        const matchedOwner = systemOwners.find(o => o && String(o.username || '').trim().toLowerCase() === myOwnerUser);

        if (matchedOwner && matchedOwner.isActive === false) {
          if (handleLogout) handleLogout();
          else {
            localStorage.removeItem('app_auth_role');
            localStorage.removeItem('app_owner_authenticated');
            setAuthRole('none');
            setIsAdminLoggedIn(false);
          }
          return;
        }

        const srvOwnerPass = matchedOwner
          ? matchedOwner.password
          : (normalized?.orgSettings?.ownerPassword || '181013');

        const srvOwnerVer = Number(
          (matchedOwner?.sessionVersion !== undefined
            ? matchedOwner.sessionVersion
            : normalized?.orgSettings?.ownerSessionVersion) || 0
        );

        if (myOwnerVer === 0 && srvOwnerVer > 0) {
          try { localStorage.setItem('app_owner_session_version', String(srvOwnerVer)); } catch {}
        } else if (
          (myOwnerPass && srvOwnerPass && myOwnerPass !== srvOwnerPass) ||
          (myOwnerVer > 0 && srvOwnerVer > 0 && srvOwnerVer > myOwnerVer)
        ) {
          const isStillValidPassword =
            myOwnerPass === (normalized?.orgSettings?.ownerPassword || '181013') ||
            systemOwners.some(o => o && o.isActive !== false && String(o.username || '').trim().toLowerCase() === myOwnerUser && o.password === myOwnerPass);

          const isVersionStale = myOwnerVer > 0 && srvOwnerVer > 0 && srvOwnerVer > myOwnerVer;

          if (!isStillValidPassword || isVersionStale) {
            if (handleLogout) handleLogout();
            else {
              localStorage.removeItem('app_auth_role');
              localStorage.removeItem('app_owner_authenticated');
              setAuthRole('none');
              setIsAdminLoggedIn(false);
            }
          }
        }
      } else if (activeRole === 'admin') {
        const myAdminPass = localStorage.getItem('app_admin_password_snapshot');
        const myAdminVer = Number(localStorage.getItem('app_admin_session_version') || 0);
        const srvAdminPass = normalized?.orgSettings?.adminPassword || normalized?.orgSettings?.adminPass;
        const srvAdminVer = Number(normalized?.orgSettings?.adminSessionVersion || 0);
        if (myAdminVer === 0 && srvAdminVer > 0) {
          try { localStorage.setItem('app_admin_session_version', String(srvAdminVer)); } catch {}
        } else if ((myAdminPass && srvAdminPass && myAdminPass !== srvAdminPass) ||
            (myAdminVer > 0 && srvAdminVer > 0 && srvAdminVer > myAdminVer)) {
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
        if (liveEmp) {
          const srvEmpVer = Number(liveEmp.sessionVersion || 0);
          if (myEmpVer === 0 && srvEmpVer > 0) {
            try { localStorage.setItem('app_emp_session_version', String(srvEmpVer)); } catch {}
          } else if ((myEmpPass && liveEmp.password && myEmpPass !== liveEmp.password) ||
              (myEmpVer > 0 && srvEmpVer > 0 && srvEmpVer > myEmpVer)) {
            if (handleLogout) handleLogout();
            else {
              localStorage.removeItem('app_auth_role');
              localStorage.removeItem('app_current_emp_user');
              setAuthRole('none');
              setCurrentEmpUser(null);
            }
          }
        }
      } else if (activeRole === 'branch' && activeBranch) {
        const liveBranch = (normalized.branches || []).find(b => String(b.id) === String(activeBranch.id) || String(b.branchCode) === String(activeBranch.branchCode));
        const myBranchPass = localStorage.getItem('app_branch_password_snapshot');
        const myBranchVer = Number(localStorage.getItem('app_branch_session_version') || 0);
        if (liveBranch) {
          const srvBranchVer = Number(liveBranch.sessionVersion || 0);
          if (myBranchVer === 0 && srvBranchVer > 0) {
            try { localStorage.setItem('app_branch_session_version', String(srvBranchVer)); } catch {}
          } else if ((myBranchPass && liveBranch.password && myBranchPass !== liveBranch.password) ||
              (myBranchVer > 0 && srvBranchVer > 0 && srvBranchVer > myBranchVer)) {
            if (handleLogout) handleLogout();
            else {
              localStorage.removeItem('app_auth_role');
              localStorage.removeItem('app_current_branch');
              setAuthRole('none');
              setCurrentBranch(null);
            }
          }
        }
      }

      const synced = syncAllEmployeesPermissionsAndLateness(normalized);

      // 💳 صمام الخصم التلقائي لسلف وأقساط أي دورة رواتب منتهية (Auto Loan Settlement)
      const loanAutoRes = checkAndAutoSettleExpiredPayrollLoans(synced);
      const effectiveData = loanAutoRes.shouldUpdate ? loanAutoRes.nextState : synced;

      const rolloverSlices = {};
      if (loanAutoRes.shouldUpdate) {
        rolloverSlices.loans = effectiveData.loans;
        rolloverSlices.requests = effectiveData.requests;
        rolloverSlices.orgSettings = effectiveData.orgSettings;
      }

      // 🔄 فحص وترحيل الفروع المنتهية وتثبيتها فور انقضاء دورتها الشهرية
      const { updatedEmployees: rolledOverEmployees, hasChanges: branchesRolledOver } = reconcileCycleTerminatedBranches(effectiveData.employees || [], effectiveData.orgSettings || {});
      if (branchesRolledOver) {
        effectiveData.employees = rolledOverEmployees;
        rolloverSlices.employees = rolledOverEmployees;
      }

      if (Object.keys(rolloverSlices).length > 0) {
        apiSaveSettingsSlice(rolloverSlices).catch(err => console.warn('[DataContext] Rollover batch slice error:', err));
      }

      setState((prev) => {
        const mergedFinal = normalizeState(smartMergeStates(prev, effectiveData));
        saveStateLocally(mergedFinal).catch(() => {});
        return mergedFinal;
      });
      setLastSyncTime(nowTimeStr());
      syncSessionWithFreshData(effectiveData);

      // ترقية وتغذية متجر IndexedDB بالطلبات السابقة تلقائياً لدعم العمل دون اتصال
      if (Array.isArray(normalized.requests) && normalized.requests.length > 0) {
        putRequestsBatch(normalized.requests).catch(() => {});
      }

      // دمج أي طلبات محلية تم إنشاؤها أوفلاين في الـ State مع حماية كاملة ضد المحذوفات
      getAllLocalRequests().then((localReqs) => {
        if (localReqs && localReqs.length > 0) {
          setState((prev) => {
            const rawSnap = localStorage.getItem('app_deleted_ids_snapshot');
            const snapList = rawSnap ? JSON.parse(rawSnap) : [];
            const deletedSet = new Set([...(prev._deletedIds || []), ...snapList]);
            const clearedTime = Math.max(
              prev._requestsClearedAt ? new Date(prev._requestsClearedAt).getTime() : 0,
              localStorage.getItem('app_requests_cleared_at') ? new Date(localStorage.getItem('app_requests_cleared_at')).getTime() : 0
            );

            const isReqDeleted = (r) => {
              if (!r || !r.id) return true;
              const idStr = String(r.id);
              const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
              if (deletedSet.has(idStr) || deletedSet.has(rawId) || deletedSet.has(`req_${rawId}`) || deletedSet.has(`leave_${rawId}`) || deletedSet.has(`swap_${rawId}`) || deletedSet.has(`loan_${rawId}`)) {
                return true;
              }
              if (clearedTime > 0) {
                const rTime = new Date(r.createdAt || r.date || r.timestamp || 0).getTime();
                if (rTime > 0 && rTime < clearedTime) return true;
              }
              return false;
            };

            const map = new Map((prev.requests || []).filter((r) => !isReqDeleted(r)).map((r) => [String(r.id), r]));
            const toUpdateInDb = [];
            localReqs.forEach((lr) => {
              if (lr && lr.id && !isReqDeleted(lr)) {
                const idStr = String(lr.id);
                const srv = map.get(idStr);
                if (srv) {
                  // السيرفر هو المصدر الموثوق للحالات النهائية (approved, rejected, cancelled, completed)
                  const isSrvFinal = srv.status === 'approved' || srv.status === 'rejected' || srv.status === 'completed' || srv.status === 'cancelled' || srv.adminApproved || srv.branchApproved;
                  const isLrFinal = lr.status === 'approved' || lr.status === 'rejected' || lr.status === 'completed' || lr.status === 'cancelled';
                  
                  if (isSrvFinal) {
                    // السيرفر معتمد أو مرفوض أو به اعتماد، نعتمد بيانات السيرفر ونحدث IndexedDB
                    toUpdateInDb.push({ ...lr, ...srv });
                    map.set(idStr, { ...lr, ...srv });
                  } else if (isLrFinal) {
                    map.set(idStr, { ...srv, ...lr });
                  } else {
                    // كلاهما معلق - ندمج مع إعطاء الأولوية للبيانات القادمة من السيرفر
                    map.set(idStr, { ...lr, ...srv });
                  }
                } else {
                  // طلب محلي غير موجود بالسيرفر: يقبل فقط إذا كان تم إنشاؤه محلياً أو بحاجة للمزامنة
                  if (lr._isLocal || lr._offline || lr.sync_status === 'pending') {
                    map.set(idStr, lr);
                  }
                }
              }
            });
            if (toUpdateInDb.length > 0) {
              putRequestsBatch(toUpdateInDb).catch(() => {});
            }
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
        // تحديث تزايدي فائق الخفة (< 2KB) تم تطبيقه على IndexedDB مع التحقق من المحذوفات
        getAllLocalRequests().then((localReqs) => {
          setState((prev) => {
            const rawSnap = localStorage.getItem('app_deleted_ids_snapshot');
            const snapList = rawSnap ? JSON.parse(rawSnap) : [];
            const deletedSet = new Set([...(prev._deletedIds || []), ...snapList]);
            const clearedTime = Math.max(
              prev._requestsClearedAt ? new Date(prev._requestsClearedAt).getTime() : 0,
              localStorage.getItem('app_requests_cleared_at') ? new Date(localStorage.getItem('app_requests_cleared_at')).getTime() : 0
            );

            const isReqDeleted = (r) => {
              if (!r || !r.id) return true;
              const idStr = String(r.id);
              const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
              if (deletedSet.has(idStr) || deletedSet.has(rawId) || deletedSet.has(`req_${rawId}`) || deletedSet.has(`leave_${rawId}`) || deletedSet.has(`swap_${rawId}`) || deletedSet.has(`loan_${rawId}`)) {
                return true;
              }
              if (clearedTime > 0) {
                const rTime = new Date(r.createdAt || r.date || r.timestamp || 0).getTime();
                if (rTime > 0 && rTime < clearedTime) return true;
              }
              return false;
            };

            const map = new Map((prev.requests || []).filter((r) => !isReqDeleted(r)).map((r) => [String(r.id), r]));
            const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'paid', 'partial', 'cancelled', 'waived', 'completed']);

            (localReqs || []).forEach((lr) => {
              if (lr && lr.id && !isReqDeleted(lr)) {
                const idStr = String(lr.id);
                const current = map.get(idStr);
                if (current) {
                  const curStatus = String(current.status || '').toLowerCase();
                  const lrStatus = String(lr.status || '').toLowerCase();
                  // إذا كان الطلب في الحالة الحالية معتمداً أو مرفوضاً، والوارد معلقاً، لا يتم الرجوع للحالة المعلقة أبداً
                  if (TERMINAL_STATUSES.has(curStatus) && !TERMINAL_STATUSES.has(lrStatus)) {
                    map.set(idStr, {
                      ...lr,
                      ...current,
                      status: current.status,
                      adminApproved: current.adminApproved,
                      branchApproved: current.branchApproved ?? lr.branchApproved,
                      branchDecision: current.branchDecision ?? lr.branchDecision
                    });
                    return;
                  }
                  // حماية قرار مدير الفرع إذا كان معتمداً حالياً لمنع مسحه بالمزامنة التزايدية
                  if (current.branchApproved && !lr.branchApproved) {
                    lr.branchApproved = true;
                    lr.branchDecision = current.branchDecision || 'approved';
                    lr.branchApprovedAt = current.branchApprovedAt || lr.branchApprovedAt;
                  }
                  if (current.branchRejected && !lr.branchRejected) {
                    lr.branchRejected = true;
                    lr.branchDecision = current.branchDecision || 'rejected';
                    lr.branchRejectedAt = current.branchRejectedAt || lr.branchRejectedAt;
                  }
                }
                map.set(idStr, { ...(current || {}), ...lr });
              }
            });
            return { ...prev, requests: Array.from(map.values()) };
          });
        }).catch(() => {});
      }
    });

    return unsubscribe;
  }, [currentBranch]);

  // ══════════════════════════════════════════════════════════════════════
  // 🚀 استماع أحداث البصمات الذرية الفورية من نقطة الاتصال /api/punches/record
  // يضمن ظهور بصمة الكشك فوراً (< 30ms) في لوحة الإدارة والكشاكش الأخرى
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const unsubscribePunch = subscribeToPunchRecorded((punchPayload) => {
      if (!punchPayload || !punchPayload.employeeId) return;
      const { employeeId, actionType, activeShifts: remoteActiveShifts, shiftRecord, time } = punchPayload;

      setState((prev) => {
        const prevActiveShifts = { ...(prev.activeShifts || {}) };
        const empIdStr = String(employeeId);

        // العثور على الموظف للوصول لكوده ومعرفه الفعلي
        const emp = (prev.employees || []).find(e =>
          String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)
        );
        const actualEmpId = emp?.id ? String(emp.id) : empIdStr;
        const empCode = emp?.code ? String(emp.code) : '';

        if (actionType === 'check_in' || actionType === 'start_shift' || actionType === 'check_in_restored') {
          if (remoteActiveShifts && typeof remoteActiveShifts === 'object') {
            const remoteShift = remoteActiveShifts[employeeId] || remoteActiveShifts[empIdStr] || (empCode && remoteActiveShifts[empCode]);
            if (remoteShift) {
              prevActiveShifts[employeeId] = remoteShift;
              prevActiveShifts[empIdStr] = remoteShift;
              if (actualEmpId) prevActiveShifts[actualEmpId] = remoteShift;
              if (empCode) prevActiveShifts[empCode] = remoteShift;
            }
          }

          let updatedShifts = [...(prev.shifts || [])];
          if (shiftRecord && shiftRecord.id) {
            const sIdx = updatedShifts.findIndex(s => s && s.id === shiftRecord.id);
            if (sIdx >= 0) {
              updatedShifts[sIdx] = { ...updatedShifts[sIdx], ...shiftRecord };
            } else {
              updatedShifts = [shiftRecord, ...updatedShifts];
            }
          }

          const cleanedEnded = (prev._endedShiftEmpIds || []).filter(id => {
            const idStr = String(id);
            return idStr !== employeeId && idStr !== empIdStr && idStr !== actualEmpId && idStr !== empCode;
          });

          return {
            ...prev,
            activeShifts: prevActiveShifts,
            shifts: updatedShifts,
            _endedShiftEmpIds: cleanedEnded
          };
        } else if (actionType === 'check_out' || actionType === 'stop_shift') {
          // حذف الوردية من الذاكرة المحلية فوراً بكافة المفاتيح الممكنة
          delete prevActiveShifts[employeeId];
          delete prevActiveShifts[empIdStr];
          if (actualEmpId) delete prevActiveShifts[actualEmpId];
          if (empCode) delete prevActiveShifts[empCode];

          Object.keys(prevActiveShifts).forEach(k => {
            const s = prevActiveShifts[k];
            if (
              k === employeeId || k === empIdStr || k === actualEmpId || k === empCode ||
              (s && (
                String(s.employeeId) === empIdStr ||
                String(s.employeeId) === actualEmpId ||
                (empCode && (String(s.employeeId) === empCode || String(s.employeeCode) === empCode))
              ))
            ) {
              delete prevActiveShifts[k];
            }
          });

          // تحديث مصفوفة shifts فوراً لإغلاق الوردية دون انتظار دورة المزامنة الكاملة
          let updatedShifts = [...(prev.shifts || [])];
          const isMatch = (s) => {
            if (!s) return false;
            const sId = String(s.employeeId || '');
            const sCode = String(s.employeeCode || '');
            return sId === empIdStr || sId === actualEmpId || (empCode && (sId === empCode || sCode === empCode));
          };

          if (shiftRecord && shiftRecord.id) {
            const idx = updatedShifts.findIndex(s => s.id === shiftRecord.id || (isMatch(s) && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)));
            if (idx >= 0) {
              updatedShifts[idx] = { ...updatedShifts[idx], ...shiftRecord, isLiveActive: false, status: 'completed' };
            } else {
              updatedShifts = [{ ...shiftRecord, isLiveActive: false, status: 'completed' }, ...updatedShifts];
            }
          } else {
            // إغلاق أي وردية مفتوحة للموظف في الواجهة فوراً
            updatedShifts = updatedShifts.map(s => {
              if (isMatch(s) && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)) {
                return {
                  ...s,
                  timeOut: time || s.timeOut || new Date().toISOString().slice(11, 16),
                  isLiveActive: false,
                  status: 'completed'
                };
              }
              return s;
            });
          }

          const endedList = Array.from(new Set([
            ...(prev._endedShiftEmpIds || []),
            employeeId,
            empIdStr,
            actualEmpId,
            empCode
          ].filter(Boolean)));

          return {
            ...prev,
            activeShifts: prevActiveShifts,
            shifts: updatedShifts,
            _endedShiftEmpIds: endedList
          };
        }

        return prev;
      });
    });

    return unsubscribePunch;
  }, []);

  // 🚀 الانضمام التلقائي لغرف المزامنة الموزعة بحسب الفرع والدور والموظف
  useEffect(() => {
    joinSyncRoom({
      role: authRole,
      branchId: currentBranch?.id || null,
      employeeId: currentEmpUser?.id || null
    });
  }, [authRole, currentBranch?.id, currentEmpUser?.id]);

  // 🚀 الاستماع لدفعات البصمات المزامنة والبث المحلي الفوري (0ms Cross-Tab Mesh)
  useEffect(() => {
    const unsubBatch = subscribeToBatchPunches((batchPayload) => {
      if (!batchPayload) return;
      setState((prev) => {
        let prevActive = { ...(prev.activeShifts || {}) };
        let prevShifts = [...(prev.shifts || [])];
        const punches = Array.isArray(batchPayload.punches) ? batchPayload.punches : [];

        for (const p of punches) {
          const empId = String(p.employeeId || '');
          const empCode = p.employeeCode ? String(p.employeeCode) : '';

          if (p.actionType === 'check_out') {
            // حذف الموظف من الورديات النشطة فورياً
            delete prevActive[empId];
            if (empCode) delete prevActive[empCode];
            Object.keys(prevActive).forEach(k => {
              const s = prevActive[k];
              if (k === empId || k === empCode || (s && (String(s.employeeId) === empId || (empCode && String(s.employeeCode) === empCode)))) {
                delete prevActive[k];
              }
            });

            // تحديث سجل الوردية في قائمة الورديات
            if (p.shiftRecord && p.shiftRecord.id) {
              const idx = prevShifts.findIndex(s => s.id === p.shiftRecord.id || ((String(s.employeeId) === empId || (empCode && String(s.employeeCode) === empCode)) && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)));
              if (idx >= 0) {
                prevShifts[idx] = { ...prevShifts[idx], ...p.shiftRecord, isLiveActive: false, status: 'completed' };
              } else {
                prevShifts = [{ ...p.shiftRecord, isLiveActive: false, status: 'completed' }, ...prevShifts];
              }
            } else {
              prevShifts = prevShifts.map(s => {
                if ((String(s.employeeId) === empId || (empCode && String(s.employeeCode) === empCode)) && (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.isLiveActive)) {
                  return { ...s, timeOut: p.time || s.timeOut || new Date().toISOString().slice(11, 16), isLiveActive: false, status: 'completed' };
                }
                return s;
              });
            }
          } else if (p.actionType === 'check_in') {
            if (p.shiftData) {
              prevActive[empId] = p.shiftData;
            }
            if (p.shiftRecord) {
              const exists = prevShifts.some(s => s.id === p.shiftRecord.id);
              if (!exists) {
                prevShifts = [{ ...p.shiftRecord, isLiveActive: true }, ...prevShifts];
              }
            }
          }
        }

        // إذا أرسل السيرفر activeShifts صريحة ندمج فقط الورديات النشطة غير المنتهية
        if (batchPayload.activeShifts && typeof batchPayload.activeShifts === 'object') {
          Object.assign(prevActive, batchPayload.activeShifts);
        }

        return {
          ...prev,
          activeShifts: prevActive,
          shifts: prevShifts
        };
      });
    });

    const unsubLocal = listenToLocalKioskPunches((localPunch) => {
      if (!localPunch || !localPunch.employeeId) return;
      console.log('⚡ [Local Mesh] 0ms punch received across tabs:', localPunch.employeeId, localPunch.actionType);
    });

    return () => {
      unsubBatch();
      unsubLocal();
    };
  }, []);
  // ══════════════════════════════════════════════════════════════════════

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
    let detectedDeltas = [];
    // 1. بث ذري فوري عبر WebSockets لكافة الأجهزة والتبويبات (< 20ms)
    try {
      if (deltaHint && deltaHint.entityType) {
        emitEntityChange(deltaHint);
      } else {
        detectedDeltas = detectEntityDeltas(state, updatedState);
        for (const d of detectedDeltas.slice(0, 5)) {
          emitEntityChange(d);
        }
      }
    } catch (broadcastErr) {
      console.warn('[Sync] Instant delta broadcast error:', broadcastErr);
    }

    // قاموس تحويل أسماء الكيانات الذرية إلى مفاتيح الشرائح في الـ State
    const ENTITY_TO_SLICE = {
      employee: 'employees',
      employees: 'employees',
      shift: 'shifts',
      shifts: 'shifts',
      activeShifts: 'activeShifts',
      adjustment: 'adjustments',
      adjustments: 'adjustments',
      roster: 'rosters',
      rosters: 'rosters',
      branches: 'branches',
      branch: 'branches',
      approvalRules: 'approvalRules',
      bylaws: 'bylaws',
      orgSettings: 'orgSettings',
      request: 'requests',
      requests: 'requests',
      leaveRequests: 'leaveRequests',
      loans: 'loans',
      lateIncidents: 'lateIncidents',
      notifications: 'notifications',
      finances: 'finances',
      transactions: 'transactions'
    };

    // استخراج sliceKey أو حزمة شرائح (slices) لتسريع الحفظ السحابي وتفادي إرسال 4.8MB
    let sliceKey = deltaHint?.entityType ? (ENTITY_TO_SLICE[deltaHint.entityType] || deltaHint.entityType) : null;
    let sliceValue = sliceKey && updatedState[sliceKey] !== undefined ? updatedState[sliceKey] : null;
    let slices = null;

    if (!sliceKey && detectedDeltas.length > 0) {
      const sliceKeySet = new Set();
      for (const d of detectedDeltas) {
        const mapped = ENTITY_TO_SLICE[d.entityType] || d.entityType;
        if (mapped && updatedState[mapped] !== undefined) {
          sliceKeySet.add(mapped);
        }
      }

      if (sliceKeySet.size === 1) {
        sliceKey = Array.from(sliceKeySet)[0];
        sliceValue = updatedState[sliceKey];
      } else if (sliceKeySet.size > 1 && sliceKeySet.size <= 8) {
        slices = {};
        for (const k of sliceKeySet) {
          slices[k] = updatedState[k];
        }
      }
    }

    startSyncing();
    let result = null;
    try {
      result = await smartSaveState(updatedState, {
        sliceKey,
        sliceValue,
        slices,
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
    if (isVariableScheduleEmployee(emp)) return 0;
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
    const hireDate = emp?.hireDate || emp?.hiring_date || emp?.contractStartDate;
    let count = 0;

    for (const dateStr of dates) {
      if (dateStr >= today) continue;
      // 🛡️ الحصانة المطلقة لما قبل تاريخ التعيين: لا غياب إطلاقاً قبل مباشرة العمل التعاقدية
      if (hireDate && dateStr < hireDate) continue;
      const daySchedule = getEmployeeDaySchedule(empIdStr, dateStr, state);
      if (!daySchedule || daySchedule.type === 'off' || daySchedule.isOff || daySchedule.variable || daySchedule.isVariable) continue;
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

      const allLeaveRequests = [...(state.leaveRequests || []), ...(state.requests || []), ...(state.leaveHistory || [])];
      const hasLeave = allLeaveRequests.some(r => {
        if (!r) return false;
        const matchesEmp = String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeCode || r.employeeId) === empCodeStr);
        if (!matchesEmp) return false;
        const isAppr = r.status === 'approved' || r.adminApproved;
        if (!isAppr) return false;
        const sDate = r.startDate || r.date;
        const eDate = r.endDate || r.startDate || r.date;
        return Boolean(sDate && eDate && sDate <= dateStr && eDate >= dateStr);
      });
      if (hasLeave) continue;
      count++;
    }
    return count;
  }, [state, getPayrollCutoffRange, getEmp]);

  const computeEmpSummary = useCallback((empId, filterFn, monthStr = null, targetBranchId = null) => {
    const emp = getEmp(empId);
    if (!emp) return { hours: 0, dailyRate: 0, rate: 0, hourlyRate: 0, monthlySalary: 0, contractualMonthlySalary: 0, salary: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

    let effectiveFilterFn = filterFn;
    if (monthStr && typeof monthStr === 'string' && monthStr.length >= 7) {
      const targetMonth = monthStr.slice(0, 7);
      const range = getPayrollCutoffRange(targetMonth);
      if (range && range.startDate && range.endDate) {
        // إذا لم يتم تمرير دالة فلترة، أو تم تمرير دالة startsWith قديمة لا تغطي بداية الدورة الشهرية (مثلاً 21 في الشهر السابق):
        if (!effectiveFilterFn || (typeof effectiveFilterFn === 'function' && !effectiveFilterFn(range.startDate))) {
          effectiveFilterFn = (d) => {
            if (!d) return false;
            const dStr = String(d).slice(0, 10);
            return dStr >= range.startDate && dStr <= range.endDate;
          };
        }
      } else if (!effectiveFilterFn) {
        effectiveFilterFn = (d) => d && String(d).startsWith(targetMonth);
      }
    } else if (!effectiveFilterFn) {
      effectiveFilterFn = () => true;
    }

    const allBranchesList = state.branches || [];
    const targetBranchObj = targetBranchId
      ? allBranchesList.find(b => isBranchMatch(targetBranchId, b)) || { id: targetBranchId }
      : null;

    let branches = [];
    if (emp.branchesDetails && emp.branchesDetails.length > 0) {
      branches = [...emp.branchesDetails];
    } else {
      branches = [{
        branchId: emp.branchId || 'main',
        salary: emp.salary || 0,
        workHoursPerDay: emp.workHoursPerDay || emp.workHours || WORK_HOURS_PER_DAY,
        workDaysPerMonth: emp.workDaysPerMonth || emp.workDays || WORK_DAYS_PER_MONTH,
        breakHours: emp.breakHours || emp.defaultBreakHours || 0
      }];
    }

    const isEmpMatchGlobal = (targetId, targetCode) => {
      const tId = String(targetId || '');
      const tCode = String(targetCode || '');
      const eId = String(emp.id || empId || '');
      const eCode = String(emp.code || '');
      return (
        (eId && (tId === eId || tCode === eId)) ||
        (eCode && (tId === eCode || tCode === eCode))
      );
    };

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

      // 🔀 فحص ما إذا كان الموظف منتدباً لهذا الفرع المستهدف
      const matchingSec = (state.secondments || []).find(sec =>
        sec && sec.status === 'ACTIVE' &&
        isEmpMatchGlobal(sec.employeeId, sec.employeeCode) &&
        isBranchMatch(sec.targetBranchId, targetBranchObj)
      );
      if (matchingSec) {
        const defaultDetail = branches[0] || {};
        const hourlyRateOverride = parseFloat(matchingSec.hourlyRate) || null;
        const secSalary = hourlyRateOverride
          ? hourlyRateOverride * (defaultDetail.workHoursPerDay || WORK_HOURS_PER_DAY) * (defaultDetail.workDaysPerMonth || WORK_DAYS_PER_MONTH)
          : (defaultDetail.salary || emp.salary || 0);
        branches = [{
          branchId: targetBranchId,
          salary: secSalary,
          hourlyRateOverride,
          secondmentAllowance: parseFloat(matchingSec.allowance) || 0,
          workHoursPerDay: defaultDetail.workHoursPerDay || defaultDetail.workHours || WORK_HOURS_PER_DAY,
          workDaysPerMonth: defaultDetail.workDaysPerMonth || defaultDetail.workDays || WORK_DAYS_PER_MONTH,
          breakHours: defaultDetail.breakHours || 0,
          isSecondment: true,
          secondmentId: matchingSec.id,
          secondmentScheduleType: matchingSec.scheduleType || 'variable'
        }];
      }
    } else {
      // 🏢 عند عدم تحديد فرع معين (الحساب الشامل للدورة / كشف الراتب العام):
      // حصر ديناميكي شامل لكافة الفروع التي عمل بها الموظف (سواء فروع معينة رسمياً أو فروع غطاها الموظف بورديات فعلية)
      const defaultDetail = branches[0] || {};
      const empShiftsInPeriod = (state.shifts || []).filter(s => {
        if (!s || !s.date || !effectiveFilterFn(s.date)) return false;
        if (s.status === 'cancelled' || s.status === 'rejected' || s.isCancelled) return false;
        return isEmpMatchGlobal(s.employeeId, s.employeeCode);
      });

      empShiftsInPeriod.forEach(s => {
        if (!s.branchId) return;
        const alreadyInBranches = branches.some(b => isBranchMatch(b.branchId, { id: s.branchId, name: s.branchName }));
        if (!alreadyInBranches) {
          const matchingBranchObj = allBranchesList.find(br => isBranchMatch(s.branchId, br));
          const canonicalBId = matchingBranchObj ? matchingBranchObj.id : s.branchId;
          if (!branches.some(b => String(b.branchId) === String(canonicalBId))) {
            branches.push({
              branchId: canonicalBId,
              salary: defaultDetail.salary || emp.salary || 0,
              workHoursPerDay: defaultDetail.workHoursPerDay || defaultDetail.workHours || WORK_HOURS_PER_DAY,
              workDaysPerMonth: defaultDetail.workDaysPerMonth || defaultDetail.workDays || WORK_DAYS_PER_MONTH,
              breakHours: defaultDetail.breakHours || 0,
              isRoaming: true
            });
          }
        }
      });

      // 🔀 حصر أي فروع منتدب إليها الموظف خلال الدورة
      (state.secondments || []).forEach(sec => {
        if (!sec || sec.status !== 'ACTIVE') return;
        if (!isEmpMatchGlobal(sec.employeeId, sec.employeeCode)) return;
        const secBId = sec.targetBranchId;
        if (!secBId) return;
        const matchingBranchObj = allBranchesList.find(br => isBranchMatch(secBId, br));
        const canonicalBId = matchingBranchObj ? matchingBranchObj.id : secBId;
        const hourlyRateOverride = parseFloat(sec.hourlyRate) || null;
        const existingIndex = branches.findIndex(b => isBranchMatch(b.branchId, { id: canonicalBId }));
        if (existingIndex >= 0) {
          branches[existingIndex] = {
            ...branches[existingIndex],
            isSecondment: true,
            secondmentId: sec.id,
            secondmentScheduleType: sec.scheduleType || 'variable',
            hourlyRateOverride: hourlyRateOverride || branches[existingIndex].hourlyRateOverride,
            secondmentAllowance: (parseFloat(sec.allowance) || 0) + (branches[existingIndex].secondmentAllowance || 0)
          };
        } else {
          const secSalary = hourlyRateOverride
            ? hourlyRateOverride * (defaultDetail.workHoursPerDay || WORK_HOURS_PER_DAY) * (defaultDetail.workDaysPerMonth || WORK_DAYS_PER_MONTH)
            : (defaultDetail.salary || emp.salary || 0);
          branches.push({
            branchId: canonicalBId,
            salary: secSalary,
            hourlyRateOverride,
            secondmentAllowance: parseFloat(sec.allowance) || 0,
            workHoursPerDay: defaultDetail.workHoursPerDay || defaultDetail.workHours || WORK_HOURS_PER_DAY,
            workDaysPerMonth: defaultDetail.workDaysPerMonth || defaultDetail.workDays || WORK_DAYS_PER_MONTH,
            breakHours: defaultDetail.breakHours || 0,
            isSecondment: true,
            secondmentId: sec.id,
            secondmentScheduleType: sec.scheduleType || 'variable'
          });
        }
      });
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

      let { dailyRate, hourlyRate: rate, monthlySalary } = rates;
      if (b.hourlyRateOverride) {
        rate = b.hourlyRateOverride;
        dailyRate = rate * (parseFloat(b.workHoursPerDay || b.workHours) || 8);
        monthlySalary = dailyRate * (parseFloat(b.workDaysPerMonth || b.workDays) || 26);
      }

      const isEmpMatch = (targetId, targetCode) => {
        const tId = String(targetId || '');
        const tCode = String(targetCode || '');
        const eId = String(emp.id || empId || '');
        const eCode = String(emp.code || '');
        return (
          (eId && (tId === eId || tCode === eId)) ||
          (eCode && (tId === eCode || tCode === eCode))
        );
      };

      // حصر ورديات هذا الفرع بدقة بالغة وبدون تسريب ورديات الفروع الأخرى (واستبعاد أي ورديات ملغاة أو مرفوضة نهائياً)
      const bShiftsRaw = (state.shifts || []).filter(s => {
        if (!s) return false;
        if (s.status === 'cancelled' || s.status === 'rejected' || s.status === 'rejected_photo' || s.isRejectedPhoto || s.isCancelled || s.rejected) return false;
        if (typeof s.statusLabel === 'string' && (s.statusLabel.includes('ملغي') || s.statusLabel.includes('مرفوض'))) return false;
        if (!isEmpMatch(s.employeeId, s.employeeCode)) return false;
        if (!effectiveFilterFn(s.date)) return false;
        if (s.branchId) {
          return isBranchMatch(s.branchId, bObj);
        }
        // إذا لم يُسجل فرع في الوردية، تنسب للفرع الأساسي للموظف
        const primaryBId = emp.branchId || branches[0]?.branchId;
        return isBranchMatch(primaryBId, bObj);
      });

      // 🛡️ صمام الأمان المالي لمنع ازدواج صرف الراتب مع دعم كامل للورديات المنفصلة (Smart Shift Deduplication for Payroll):
      // يسمح بعدة ورديات في نفس اليوم للموظف (كوردية صباحية ومسائية) ويدمج فقط السجلات المكررة لنفس الوردية
      const getShiftMinutes = (t) => {
        if (!t) return null;
        const [h, m] = String(t).slice(0, 5).split(':').map(Number);
        return isNaN(h) ? null : h * 60 + (m || 0);
      };

      const shiftClusters = [];
      bShiftsRaw.forEach(s => {
        if (!s || !s.date) return;
        const sInMins = getShiftMinutes(s.timeIn);
        let foundCluster = false;
        for (const cluster of shiftClusters) {
          const rep = cluster[0];
          if (rep.date === s.date) {
            const repInMins = getShiftMinutes(rep.timeIn);
            const isSameTime = (sInMins !== null && repInMins !== null)
              ? Math.abs(sInMins - repInMins) <= 20
              : (!s.timeIn || !rep.timeIn || s.timeIn === rep.timeIn);
            if (isSameTime || (s.id && rep.id && s.id === rep.id)) {
              cluster.push(s);
              foundCluster = true;
              break;
            }
          }
        }
        if (!foundCluster) {
          shiftClusters.push([s]);
        }
      });

      const bShifts = shiftClusters.map(cluster => {
        if (cluster.length === 1) return cluster[0];
        return cluster.sort((a, b) => {
          const aIsManual = Boolean(a.isManual || a.manualPunch || a.adminApproved || a.editedByAdmin);
          const bIsManual = Boolean(b.isManual || b.manualPunch || b.adminApproved || b.editedByAdmin);
          if (aIsManual && !bIsManual) return -1;
          if (!aIsManual && bIsManual) return 1;

          const aHasOut = Boolean(a.timeOut && a.timeOut !== '—' && a.timeOut !== '' && a.timeOut !== 'غير مسجل');
          const bHasOut = Boolean(b.timeOut && b.timeOut !== '—' && b.timeOut !== '' && b.timeOut !== 'غير مسجل');
          if (aHasOut && !bHasOut) return -1;
          if (!aHasOut && bHasOut) return 1;

          const aHrs = parseFloat(a.actualWorkedHours || a.hours || 0);
          const bHrs = parseFloat(b.actualWorkedHours || b.hours || 0);
          return bHrs - aHrs;
        })[0];
      });

      const hours = bShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);
      const baseEarnings = hours * rate;

      // احتساب الساعات الإضافية المعتمدة والمعلقة بدقة متناهية عبر محرك الورديات المركزي
      let approvedOtHours = 0;
      let pendingOtHours = 0;

      bShifts.forEach(s => {
        const metrics = calculateShiftMetrics(s, state);
        if (metrics.isOvertimeApproved && metrics.overtimeHours > 0) {
          approvedOtHours += metrics.overtimeHours;
        } else if (metrics.overtimeStatus === 'pending' && metrics.overtimeHours > 0) {
          pendingOtHours += metrics.overtimeHours;
        }
      });

      // التحقق من أي طلبات إضافي معتمدة مستقلة للموظف (كأيام راحة أو عمل إضافي معتمد لم يرتبط بوردية عادية)
      const matchedShiftDates = new Set(
        bShifts.filter(s => {
          const m = calculateShiftMetrics(s, state);
          return m.isOvertimeApproved && m.overtimeHours > 0;
        }).map(s => s.date)
      );

      const standaloneOtRequests = (state.requests || []).filter(r => {
        if (!r) return false;
        if (!isEmpMatch(r.employeeId, r.employeeCode)) return false;
        const isOtType = r.type === 'overtime' || r.type === 'extra_hours' || r.type === 'طلب اضافي' || r.type === 'إضافي';
        if (!isOtType) return false;
        const isApproved = (r.status === 'approved' || r.adminApproved === true) && r.status !== 'rejected' && !r.isCancelled;
        if (!isApproved) return false;
        const rDate = r.date || r.targetDate;
        if (!rDate || !effectiveFilterFn(rDate)) return false;
        if (r.shiftId && bShifts.some(s => s.id === r.shiftId)) return false;
        if (matchedShiftDates.has(rDate)) return false;
        return true;
      });

      standaloneOtRequests.forEach(r => {
        const otH = parseFloat(r.hours || r.overtimeHours || r.amount) || 0;
        if (otH > 0) {
          approvedOtHours += otH;
        }
      });

      approvedOtHours = Math.round(approvedOtHours * 100) / 100;
      pendingOtHours = Math.round(pendingOtHours * 100) / 100;
      const otEarnings = Math.round(approvedOtHours * rate * 100) / 100;

      let absenceDaysCount = 0;
      let absenceDeduction = 0;
      // استقطاع الغياب يُحسب على الفرع الأساسي فقط للموظف حتى لا يتكرر (ويُعفى منه الموظف الذي ليس له جدول شهري)
      const isFlexibleSchedule = isVariableScheduleEmployee(emp);
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
      if (!isEmpMatchGlobal(a.employeeId, a.employeeCode)) return false;
      if (!effectiveFilterFn(a.date)) return false;
      if (isTargetFilterActive) {
        if (a.branchId) return isBranchMatch(a.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    // Also include any approved penalty requests that might not be mirrored in state.adjustments yet
    const existingAdjReqIds = new Set(
      empAdjs.map(a => a.requestId || a.id).filter(Boolean)
    );

    const unmappedPenaltyRequests = (state.requests || []).filter(r => {
      if (!r) return false;
      if (!isEmpMatchGlobal(r.employeeId, r.employeeCode)) return false;
      const isApproved = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled' && r.status !== 'rejected';
      if (!isApproved) return false;
      if (r.objection?.status === 'approved') return false;

      // 🛡️ صمام أمان صارم: استبعاد أي طلبات أو جزاءات مرتبطة بالحضور أو التأخير اللائحي أو الانصراف المبكر
      // (حيث تُحسب وتُخصم بالكامل عبر لائحة التأخيرات state.lateIncidents لمنع الازدواج المالي والخلط الإداري)
      const idStr = String(r.id || '');
      const isAttendanceOrLate = (
        idStr.startsWith('req_late_inc_') ||
        idStr.startsWith('req_late_') ||
        idStr.startsWith('late_inc_') ||
        idStr.startsWith('req_early_') ||
        r.type === 'lateness' ||
        r.type === 'late_penalty' ||
        r.type === 'early_exit' ||
        r.subType === 'lateness' ||
        r.subType === 'early_exit' ||
        r.source === 'late_penalty_engine' ||
        r.source === 'system_lateness' ||
        (typeof r.ruleTitle === 'string' && r.ruleTitle.includes('تأخير')) ||
        (typeof r.reason === 'string' && (r.reason.includes('تأخر الموظف') || r.reason.includes('جزاء تأخير')))
      );
      if (isAttendanceOrLate) return false;

      const isPen = r.type === 'penalty' || r.type === 'disciplinary_penalty' || r.subType === 'disciplinary_penalty' || r.type === 'violation' || r.type === 'deduction' || idStr.startsWith('disc_');
      if (!isPen) return false;
      // حظر أي جزاءات تأخير أو انصراف مبكر عن الموظف ذي المواعيد المتغيرة
      if (isVariableScheduleEmployee(emp)) {
        const isEarlyOrLate = r.type === 'early_exit' || r.subType === 'early_exit' || r.type === 'lateness' || r.subType === 'lateness' || idStr.startsWith('req_early_') || idStr.startsWith('req_late_');
        if (isEarlyOrLate) return false;
      }
      if (existingAdjReqIds.has(r.id) || existingAdjReqIds.has(`adj_pen_${r.id}`) || existingAdjReqIds.has(`adj_disc_${r.id}`)) return false;
      const rDate = r.date || r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      if (!rDate || !effectiveFilterFn(rDate)) return false;
      if (isTargetFilterActive) {
        if (r.branchId) return isBranchMatch(r.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    const unmappedPenaltyTotal = unmappedPenaltyRequests.reduce((acc, r) => {
      let amt = parseFloat(r.amount || r.penaltyAmount || r.deductionFixedAmount) || 0;
      if (!amt && (r.deductionDays || r.penaltyDays || r.impactType === 'deduction_days')) {
        const days = parseFloat(r.deductionDays || r.penaltyDays || r.impactVal || 1);
        const workDays = parseFloat(emp.workDaysPerMonth || emp.workDays) || 26;
        const salary = parseFloat(emp.salary) || 0;
        const dRate = r.dailyRate ? parseFloat(r.dailyRate) : (workDays > 0 ? salary / workDays : salary / 30);
        amt = Math.round(dRate * days * 100) / 100;
      }
      return acc + amt;
    }, 0);

    const manualDeductionsList = [
      ...empAdjs
        .filter(a => {
          if (!a) return false;
          const aId = String(a.id || '');
          if (aId.startsWith('adj_late_') || aId.startsWith('late_inc_') || a.source === 'late_penalty_engine') return false;
          if (a.reason && (a.reason.includes('تأخير') || a.reason.includes('تأخر'))) return false;
          return a.type === 'deduction' || a.type === 'penalty' || a.type === 'خصم' || a.type === 'shortage';
        })
        .map(a => ({
          id: a.id,
          date: a.date,
          type: a.type,
          typeLabel: (a.type === 'shortage' || (a.reason && (a.reason.includes('عجز') || a.reason.includes('جرد')))) ? '📦 عجز جرد / بضاعة' : '⚖️ جزاء إداري معتمد',
          amount: parseFloat(a.amount) || 0,
          reason: a.reason || a.notes || a.description || 'خصم إداري'
        })),
      ...unmappedPenaltyRequests.map(r => {
        let amt = parseFloat(r.amount || r.penaltyAmount || r.deductionFixedAmount) || 0;
        if (!amt && (r.deductionDays || r.penaltyDays || r.impactType === 'deduction_days')) {
          const days = parseFloat(r.deductionDays || r.penaltyDays || r.impactVal || 1);
          const workDays = parseFloat(emp.workDaysPerMonth || emp.workDays) || 26;
          const salary = parseFloat(emp.salary) || 0;
          const dRate = r.dailyRate ? parseFloat(r.dailyRate) : (workDays > 0 ? salary / workDays : salary / 30);
          amt = Math.round(dRate * days * 100) / 100;
        }
        return {
          id: r.id,
          date: r.date || r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : ''),
          type: r.type,
          typeLabel: (r.type === 'shortage' || (r.reason && (r.reason.includes('عجز') || r.reason.includes('جرد')))) ? '📦 عجز جرد / بضاعة' : '⚖️ جزاء تأديبي إداري',
          amount: amt,
          reason: r.reason || r.ruleTitle || r.details || 'جزاء إداري'
        };
      })
    ];

    const unmappedBonusRequests = (state.requests || []).filter(r => {
      if (!r) return false;
      if (!isEmpMatchGlobal(r.employeeId, r.employeeCode)) return false;
      const isApproved = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled';
      if (!isApproved) return false;
      if (r.type !== 'bonus') return false;
      if (existingAdjReqIds.has(r.id) || existingAdjReqIds.has(`adj_bonus_${r.id}`)) return false;
      const rDate = r.date || r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      if (!rDate || !effectiveFilterFn(rDate)) return false;
      if (isTargetFilterActive) {
        if (r.branchId) return isBranchMatch(r.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });
    const unmappedBonusTotal = unmappedBonusRequests.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);

    const totalBonus = empAdjs.filter(a => a.type === 'bonus' || a.type === 'مكافأة').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0) + unmappedBonusTotal;
    const manualDeduction = empAdjs.filter(a => {
      if (!a) return false;
      const aId = String(a.id || '');
      if (aId.startsWith('adj_late_') || aId.startsWith('late_inc_') || a.source === 'late_penalty_engine') return false;
      if (a.reason && (a.reason.includes('تأخير') || a.reason.includes('تأخر'))) return false;
      return a.type === 'deduction' || a.type === 'penalty' || a.type === 'خصم';
    }).reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0) + unmappedPenaltyTotal;

    // الجزاءات والتأخيرات (لا تطبق على موظف الساعات المتغيرة بدون جدول)
    const isFlexibleSchedule = isVariableScheduleEmployee(emp);
    const isFlexibleScheduleEmp = isFlexibleSchedule;

    // جلب طلبات التأخير المعتمدة في requests لهذا الموظف
    const empApprovedLateRequests = isFlexibleScheduleEmp ? [] : (state.requests || []).filter(r => {
      if (!r) return false;
      if (!isEmpMatchGlobal(r.employeeId, r.employeeCode)) return false;
      const isLateType = (
        String(r.id || '').startsWith('req_late_inc_') ||
        String(r.id || '').startsWith('req_late_') ||
        r.type === 'lateness' ||
        r.type === 'late_penalty' ||
        r.subType === 'lateness' ||
        r.source === 'late_penalty_engine'
      );
      if (!isLateType) return false;
      const isApp = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled' && r.status !== 'rejected';
      if (!isApp) return false;
      if (r.objection?.status === 'approved') return false;
      const rDate = r.date || r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      if (!rDate || !effectiveFilterFn(rDate)) return false;
      if (isTargetFilterActive) {
        if (r.branchId) return isBranchMatch(r.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    // جلب وقائع التأخير في lateIncidents
    const empLateIncidents = isFlexibleScheduleEmp ? [] : (state.lateIncidents || []).filter(i => {
      if (!i) return false;
      if (!isEmpMatchGlobal(i.employeeId, i.employeeCode)) return false;
      if (!effectiveFilterFn(i.date)) return false;
      if (i.status === 'cancelled' || i.isCancelled) return false;
      if (i.objection?.status === 'approved') return false;
      if (isTargetFilterActive) {
        if (i.branchId) return isBranchMatch(i.branchId, targetBranchObj);
        return isPrimaryForAdjustments;
      }
      return true;
    });

    // دمج وتوحيد الخصم اللائحي بين الوقائع والطلبات المعتمدة بدقة متناهية تمنع أي سقوط مالي أو ازدواج
    const matchedDatesOrReqIds = new Set();
    let totalLateDedAmt = 0;
    let totalLateDedMins = 0;
    const lateIncidentsList = [];

    empLateIncidents.forEach(inc => {
      const incIdStr = String(inc.id || '');
      const cleanId = incIdStr.replace(/^late_inc_/, '');
      const matchingReq = empApprovedLateRequests.find(r => 
        String(r.id) === `req_${incIdStr}` || 
        String(r.id) === `req_late_inc_${cleanId}` ||
        String(r.penaltyId) === incIdStr ||
        (r.date && r.date === inc.date && (!r.branchId || String(r.branchId) === String(inc.branchId)))
      );

      if (matchingReq) {
        matchedDatesOrReqIds.add(matchingReq.id);
        matchedDatesOrReqIds.add(`${matchingReq.date}_${matchingReq.branchId || ''}`);
      }

      const incAmt = parseFloat(inc.penaltyAmount) || 0;
      const reqAmt = matchingReq ? (parseFloat(matchingReq.amount) || 0) : 0;
      const effAmt = Math.max(incAmt, reqAmt);

      const incMins = parseFloat(inc.deductionMinutes) || 0;
      const reqMins = matchingReq ? (parseFloat(matchingReq.deductionMinutes || matchingReq.impactVal) || 0) : 0;
      const effMins = Math.max(incMins, reqMins);

      totalLateDedAmt += effAmt;
      totalLateDedMins += effMins;

      if (effMins > 0 || effAmt > 0) {
        lateIncidentsList.push({
          ...inc,
          deductionMinutes: effMins,
          penaltyAmount: effAmt
        });
      }
    });

    // إضافة أي طلبات جزاء تأخير معتمدة لم يتم تسجيل واقعة لها في lateIncidents
    empApprovedLateRequests.forEach(req => {
      const reqKey = `${req.date}_${req.branchId || ''}`;
      if (!matchedDatesOrReqIds.has(req.id) && !matchedDatesOrReqIds.has(reqKey)) {
        const reqAmt = parseFloat(req.amount) || 0;
        const reqMins = parseFloat(req.deductionMinutes || req.impactVal) || 0;
        totalLateDedAmt += reqAmt;
        totalLateDedMins += reqMins;

        if (reqMins > 0 || reqAmt > 0) {
          lateIncidentsList.push({
            id: req.id,
            date: req.date,
            branchId: req.branchId || emp.branchId,
            branchName: req.branchName || 'الفرع الرئيسي',
            scheduledStartTime: req.scheduledTime || req.scheduledStartTime || '—',
            actualPunchInTime: req.actualTime || req.actualPunchInTime || '—',
            lateMinutes: req.lateMinutes || reqMins,
            tierName: req.tierName || 'جزاء تأخير معتمد',
            occurrenceNumber: req.occurrence || 1,
            actionLabel: req.actionLabel || `خصم ${reqMins} دقيقة`,
            deductionMinutes: reqMins,
            penaltyAmount: reqAmt,
            status: 'approved'
          });
        }
      }
    });

    lateIncidentsList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const lateDeduction = isFlexibleScheduleEmp ? 0 : Math.round(totalLateDedAmt * 100) / 100;
    const lateDeductionMinutes = isFlexibleScheduleEmp ? 0 : totalLateDedMins;

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
    const dailyRate = branchRateInfo.dailyRate || (branches.length === 1 ? (branchRateInfo.rate * (parseFloat(branches[0]?.workHoursPerDay) || 8)) : (rate * 8));
    // 🛡️ الإجازات بدون أجر: عدم خصم أي مبالغ نقدية من الراتب، وإنما عدم احتساب ساعات وأجر تلك الأيام فقط
    const unpaidLeaveDeduction = 0;

    const totalDeduction = manualDeduction + loanDeduction + totalAbsenceDeduction + lateDeduction;

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

    const totalSecondmentAllowance = branches.reduce((acc, b) => acc + (parseFloat(b.secondmentAllowance) || 0), 0);
    const totalAllowances = managementAllowance + transportAllowance + extraAllowance + dailyAllowanceTotal + totalSecondmentAllowance;
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
      secondmentAllowance: totalSecondmentAllowance,
      isSecondment: branches.some(b => b.isSecondment),
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
      lateIncidentsCount: lateIncidentsList.length,
      lateIncidentsList,
      manualDeduction,
      manualDeductionsList,
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
    getAuthoritativeEmployeeRates: (emp, bId) => getAuthoritativeEmployeeRates(emp, bId, state),
    getAuthoritativeScheduledShift: (empId, dateStr, bId) => getAuthoritativeScheduledShift(empId, dateStr, state, bId),
    getAuthoritativeShiftMetrics: (shift, bId) => getAuthoritativeShiftMetrics(shift, state, bId),
    calculateAuthoritativeCycleSummary: (args) => calculateAuthoritativeCycleSummary({ ...args, state }),
    generateAuthoritativeAuditDossier: (empId, monthStr) => generateAuthoritativeAuditDossier(empId, monthStr, state),
    runPayrollHealthAudit: (targetMonth) => runPayrollHealthAudit(state, targetMonth),
    formatPayrollHealthAlertsForWhatsApp,
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
