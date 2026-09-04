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

const DataContext = createContext(null);

export function DataProvider({ children, showToast = () => {} }) {
  const {
    authRole,
    setAuthRole,
    currentBranch,
    setCurrentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    setIsAdminLoggedIn
  } = useAuth();

  // Core Data State with Default Settings
  const [state, setState] = useState({
    orgSettings: {
      orgName: 'منظومة إدارة الموارد البشرية والرواتب',
      logoUrl: '',
      ownerUsername: 'owner',
      ownerPassword: 'owner123',
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
      gmailConfig: {
        enabled: true,
        userEmail: '',
        appPassword: '',
        targetAdminEmail: '',
        serviceUrl: 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec',
        sendOnRequest: true,
        sendOnDecision: true,
        sendOnPenalty: true,
        sendDailyDigest: true
      }
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
    authorizedDevices: []
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
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
        sessionStorage.clear();
        clearLocalDatabase().catch(() => {});
        setAuthRole('none');
        setIsAdminLoggedIn(false);
        setCurrentEmpUser(null);
        setCurrentBranch(null);
        setState(normalized);
        return;
      }

      // التحقق من صلاحية جلسة الموظف أو الفرع
      const activeRole = authRoleRef.current;
      const activeEmp = currentEmpUserRef.current;
      const activeBranch = currentBranchRef.current;

      if (activeRole === 'employee' && activeEmp) {
        const empExists = (normalized.employees || []).some(e => String(e.id) === String(activeEmp.id));
        if (!empExists) {
          localStorage.removeItem('app_auth_role');
          localStorage.removeItem('app_current_emp_user');
          setAuthRole('none');
          setCurrentEmpUser(null);
        }
      } else if (activeRole === 'branch' && activeBranch) {
        const branchExists = (normalized.branches || []).some(b => String(b.id) === String(activeBranch.id));
        if (!branchExists) {
          localStorage.removeItem('app_auth_role');
          localStorage.removeItem('app_current_branch');
          setAuthRole('none');
          setCurrentBranch(null);
        }
      }

      const synced = syncAllEmployeesPermissionsAndLateness(normalized);
      setState((prev) => smartMergeStates(prev, synced));
      setLastSyncTime(nowTimeStr());
      syncSessionWithFreshData(synced);
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
    setIsLoading,
    setIsOffline,
    setPendingSyncCount,
    setLastSyncTime,
    showToast
  });

  // Save State with Optimistic UI & Auto-Backup
  const saveState = async (updatedState) => {
    setIsSyncing(true);
    const result = await smartSaveState(updatedState, {
      onSyncSuccess: (finalMerged) => {
        setLastSyncTime(nowTimeStr());
        setPendingSyncCount(0);
      },
      onSyncFail: (msg) => {
        console.error('Database write error:', msg);
        showToast('⚠️ تعذر الحفظ في قاعدة البيانات السحابية، تم الحفظ محلياً');
      },
      onQueuedOffline: async () => {
        showToast('📴 أنت أوف لاين - تم الحفظ محلياً وسيتم التزامن عند عودة الإنترنت');
      }
    });
    setIsSyncing(false);

    const finalState = result?.mergedState || updatedState;
    if (result?.mergedState) {
      setState((prev) => smartMergeStates(prev, normalizeState(result.mergedState)));
    }

    saveAutoBackupOnModification(finalState, 'تعديل وحفظ بالمنظومة').catch((e) => {
      console.warn('[AutoBackup] Snapshot trigger skipped:', e);
    });

    return result;
  };

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
    const empIdStr = String(empId);
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
      const hasShift = (state.shifts || []).some(s => String(s.employeeId) === empIdStr && s.date === dateStr);
      if (hasShift) continue;

      const allLeaveRequests = [...(state.leaveRequests || []), ...(state.requests || [])];
      const hasLeave = allLeaveRequests.some(
        r => String(r.employeeId) === empIdStr && (r.status === 'approved' || r.adminApproved) &&
        r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;
      count++;
    }
    return count;
  }, [state, getPayrollCutoffRange]);

  const computeEmpSummary = useCallback((empId, filterFn, monthStr = null, targetBranchId = null) => {
    const emp = getEmp(empId);
    if (!emp) return { hours: 0, dailyRate: 0, rate: 0, hourlyRate: 0, monthlySalary: 0, salary: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

    let effectiveFilterFn = filterFn || (() => true);

    let branches = [];
    if (emp.branchesDetails && emp.branchesDetails.length > 0) {
      branches = emp.branchesDetails;
    } else {
      branches = [{
        branchId: emp.branchId || 'main',
        salary: emp.salary || 0,
        workHoursPerDay: emp.workHoursPerDay || WORK_HOURS_PER_DAY,
        workDaysPerMonth: emp.workDaysPerMonth || WORK_DAYS_PER_MONTH
      }];
    }

    if (targetBranchId) {
      branches = branches.filter(b => b.branchId === targetBranchId);
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
      const hourlyBase = parseFloat(b.salary) || 0;
      const workHoursPerDay = parseFloat(b.workHoursPerDay) || 8;
      const workDaysPerMonth = parseFloat(b.workDaysPerMonth) || 26;

      const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;
      const rate = (hourlyBase > 0 && workDaysPerMonth > 0)
        ? (hourlyBase >= 200 ? (hourlyBase / workDaysPerMonth) : ((hourlyBase * workHoursPerDay) / workDaysPerMonth))
        : (workHoursPerDay > 0 ? dailyRate / workHoursPerDay : hourlyBase);

      const monthlySalary = rate * workHoursPerDay * workDaysPerMonth;

      const bShifts = (state.shifts || []).filter(s => String(s.employeeId) === String(empId) && effectiveFilterFn(s.date) && (s.branchId === bId || !s.branchId || branches.length === 1));
      const hours = bShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);
      const baseEarnings = hours * rate;

      const approvedOtHours = bShifts
        .filter(s => s.overtimeStatus === 'approved' || (parseFloat(s.overtimeHours) > 0 && s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const pendingOtHours = bShifts
        .filter(s => s.overtimeStatus === 'pending' || (parseFloat(s.overtimeHours) > 0 && !s.overtimeStatus && !s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const otEarnings = Math.round(approvedOtHours * rate * 100) / 100;

      let absenceDaysCount = 0;
      let absenceDeduction = 0;
      if (bId === branches[0].branchId) {
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
        monthlySalary,
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

    const empAdjs = (state.adjustments || []).filter(a => String(a.employeeId) === String(empId) && effectiveFilterFn(a.date));
    const totalBonus = empAdjs.filter(a => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
    const manualDeduction = empAdjs.filter(a => a.type === 'deduction').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const empLateIncidents = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(empId) && effectiveFilterFn(i.date) && i.status !== 'cancelled');
    const lateDeduction = empLateIncidents.reduce((acc, i) => acc + (parseFloat(i.penaltyAmount) || 0), 0);
    const lateDeductionMinutes = empLateIncidents.reduce((acc, i) => acc + (parseFloat(i.deductionMinutes) || 0), 0);

    // Loans
    const empLoans = (state.loans || []).filter(l => String(l.employeeId) === String(empId) && (l.status === 'approved' || l.adminApproved));
    const loanDeduction = empLoans.reduce((acc, l) => {
      const rem = parseFloat(l.remainingAmount ?? l.amount) || 0;
      if (rem <= 0) return acc;
      const isInstallment = l.type === 'installment_loan' || l.isInstallment === true;
      const monthlyDeduction = parseFloat(l.monthlyDeduction || l.installmentAmount) || rem;
      return isInstallment ? acc + Math.min(rem, monthlyDeduction) : acc + rem;
    }, 0);

    // Approved Leaves
    const empApprovedLeaves = getEmployeeApprovedLeaves(emp, state, effectiveFilterFn);
    let unpaidLeaveDaysCount = 0;
    let annualLeaveDaysCount = 0;

    empApprovedLeaves.forEach((l) => {
      const isUnpaid = l.leaveType === 'unpaid' || l.type === 'unpaid_leave' || l.isUnpaid === true;
      const daysCount = parseFloat(l.daysCount || l.days || 1) || 1;
      if (isUnpaid) unpaidLeaveDaysCount += daysCount;
      else annualLeaveDaysCount += daysCount;
    });

    let rate = branches.length === 1 ? perBranch[branches[0].branchId].rate : (totalHours > 0 ? totalBaseEarnings / totalHours : (parseFloat(branches[0]?.salary) || 0));
    let dailyRate = branches.length === 1 ? perBranch[branches[0].branchId].dailyRate : (rate * (parseFloat(branches[0]?.workHoursPerDay) || WORK_HOURS_PER_DAY));
    const unpaidLeaveDeduction = Math.round(unpaidLeaveDaysCount * dailyRate * 100) / 100;

    const totalDeduction = manualDeduction + loanDeduction + totalAbsenceDeduction + lateDeduction + unpaidLeaveDeduction;
    const isMgmt = isManagementJob(emp.jobTitle, getJobsList(state)) || Boolean(emp.isManagement) || (parseFloat(emp.managementAllowance) || 0) > 0;
    const managementAllowance = parseFloat(emp.managementAllowance) || 0;
    const transportAllowance = parseFloat(emp.transportAllowance) || 0;
    const extraAllowance = parseFloat(emp.extraAllowance) || 0;
    const totalAllowances = managementAllowance + transportAllowance + extraAllowance;

    const totalEarnings = totalBaseEarnings + totalOvertimeEarnings;
    const netSalary = totalBaseEarnings + totalOvertimeEarnings + totalBonus + totalAllowances - totalDeduction;

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
      monthlySalary: Object.values(perBranch).reduce((acc, b) => acc + (b.monthlySalary || 0), 0),
      salary: Object.values(perBranch).reduce((acc, b) => acc + (b.monthlySalary || 0), 0),
      baseEarnings: totalBaseEarnings,
      totalEarnings,
      totalBonus,
      totalAllowances,
      managementAllowance,
      transportAllowance,
      extraAllowance,
      isManagement: isMgmt,
      totalDeduction,
      lateDeduction,
      lateDeductionMinutes,
      manualDeduction,
      loanDeduction,
      absenceDeduction: totalAbsenceDeduction,
      absenceDaysCount: totalAbsenceDaysCount,
      unpaidLeaveDaysCount,
      unpaidLeaveDeduction,
      annualLeaveDaysCount,
      netSalary,
      perBranch
    };
  }, [state, getEmp, getAbsenceDaysCount]);

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
      totalDeduction,
      totalNetSalary
    };
  }, [state.employees, computeEmpSummary]);

  const value = {
    state,
    setState,
    saveState,
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
    computeGrandPayroll
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
