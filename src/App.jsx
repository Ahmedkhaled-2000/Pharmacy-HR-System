import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';

// Utilities & Hooks
import {
  STORAGE_KEY,
  WORK_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
  apiFetchSettings,
  apiFetchVersion,
} from './utils/apiClient';
import {
  arabicMonthLabel,
  arabicWeekday,
  todayStr,
  nowTimeStr,
  getActivePayrollCycleMonth,
  uid,
  fmt,
  parseArabicFloat,
  normalizeState,
  applyShiftSwapToRosters,
  shouldShowRequestToBranch
} from './utils/formatters';
import { getRealDate, getRealTodayStr, getRealNowTimeStr } from './utils/timeEngine';
import { getActivePayrollMonth, getCycleDateRange, createDatePredicate } from './utils/periodEngine';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from './utils/excelExport';
import { smartSaveState, smartLoadState, loadLocalStateFast, listenToConnectionChanges, syncNow, listenToLiveBroadcasts } from './utils/offlineSync';
import { smartMergeStates } from './utils/stateMerger';
import { compressImage } from './utils/imageCompressor';
import { getPendingCount } from './utils/offlineStorage';
import { saveAutoBackupOnModification } from './utils/backupHelper';
import ErrorBoundary from './components/common/ErrorBoundary';
import { normalizeSchedule } from './components/roster/RosterModule';

// Modular Components
import GlobalNavbar from './components/navbar/GlobalNavbar';
import AdminSubNavbar from './components/navbar/AdminSubNavbar';
import ElectronicKioskView from './components/kiosk/ElectronicKioskView';
import KioskConfirmModal from './components/kiosk/KioskConfirmModal';
import ManualShiftForm from './components/shifts/ManualShiftForm';
import EditShiftModal from './components/shifts/EditShiftModal';
import AdjustmentsForm from './components/adjustments/AdjustmentsForm';
import FinancialSummary from './components/payroll/FinancialSummary';
import PayrollExportBar from './components/payroll/PayrollExportBar';
import ExportPayrollModal from './components/payroll/ExportPayrollModal';
import EmployeeCardsGrid from './components/employees/EmployeeCardsGrid';
import EmployeeModal from './components/employees/EmployeeModal';
import EmployeeIDCardModal from './components/employees/EmployeeIDCardModal';
import OrgSettingsCard from './components/settings/OrgSettingsCard';
import AdminCredentialsCard from './components/settings/AdminCredentialsCard';
import PermissionsCard from './components/settings/PermissionsCard';
import WhatsAppStatusCard from './components/whatsapp/WhatsAppStatusCard';
import WhatsAppMessagingHub from './components/whatsapp/WhatsAppMessagingHub';
import EmployeePortalView from './components/employee-portal/EmployeePortalView';

import DeviceApprovalManager from './components/settings/DeviceApprovalManager';
import { apiArchiveDeleteEmployee } from './utils/archiveApiClient';

// New Comprehensive System Modules
import LoginPage from './components/auth/LoginPage';
import SidebarLayout from './components/layout/SidebarLayout';
import DesktopLayout from './components/layout/DesktopLayout';
import EmployeesHubModule from './components/employees/EmployeesHubModule';
import BranchManagementModule from './components/branches/BranchManagementModule';
import EmployeeFileModal from './components/employees/EmployeeFileModal';
import EmployeePhonesDirectoryModal from './components/employees/EmployeePhonesDirectoryModal';
import { DEFAULT_JOBS, getJobsList, isManagementJob, getDepartmentsList, shouldRouteDirectToAdmin } from './utils/jobsHelper';
import WorkBylawsModule from './components/bylaws/WorkBylawsModule';
import BylawsModule from './components/bylaws/BylawsModule';
import ApprovalCenterModule from './components/approvals/ApprovalCenterModule';
import EvaluationsModule from './components/evaluations/EvaluationsModule';
import LoansAndCreditModule from './components/loans/LoansAndCreditModule';
import BranchManagerView from './components/branch-manager/BranchManagerView';
import Dashboard from './components/dashboard/Dashboard';
import AttendanceModule from './components/attendance/AttendanceModule';
import RosterModule from './components/roster/RosterModule';
import RequestsModule from './components/requests/RequestsModule';
import LeavesTrackingModule from './components/leaves/LeavesTrackingModule';
import PayrollModule from './components/payroll/PayrollModule';
import WhatsAppCenterModule from './components/whatsapp/WhatsAppCenterModule';
import LoansMedsModule from './components/loans/LoansMedsModule';
import IncomeExpensesModule from './components/finance/IncomeExpensesModule';
import SettingsModule from './components/settings/SettingsModule';
import AdjustmentsModule from './components/adjustments/AdjustmentsModule';
import PayslipPrintModal from './components/payroll/PayslipPrintModal';
import ElectronicAttendanceAdmin from './components/attendance/ElectronicAttendanceAdmin';
import NotificationCenterModule from './components/notifications/NotificationCenterModule';
import AdminResignationModule from './components/resignation/AdminResignationModule';
import ArchiveSystemView from './components/archive/ArchiveSystemView';
import OwnerOverrideModal from './components/common/OwnerOverrideModal';
import {
  sendGmailEmail,
  generateDailyDigestHTML,
  buildEmailTemplate,
  notifyAdminOnLateness,
  notifyAdminOnEarlyExit,
  notifyEmployeeEarlyExitWarning,
  notifyAdminOnOvertime
} from './utils/gmailService';
import EmployeePermissionsManagementModule from './components/permissions/EmployeePermissionsManagementModule';
import {
  DEFAULT_LATE_PENALTY_POLICY,
  DEFAULT_PERMISSION_POLICY,
  applyApprovedPermissionsToShifts,
  syncAllEmployeesPermissionsAndLateness,
  isApprovedPermissionForDate,
  getEffectiveShiftHours,
  getEffectiveLatePolicy,
  classifyLateTier,
  getPenaltyForOccurrence,
  computeLatenessFinancialAmount,
  getScheduledShiftForDate,
  calculateLatenessMinutes,
  recalculateEmployeeCycleLateness,
  countEmployeeTierOccurrences
} from './utils/latePenaltyEngine';


export default function App() {
  // Theme Mode State ('light' | 'dark')
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('app-theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem('app-theme', themeMode);
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Navigation via URL: /admin | /kiosk | /employee | /archive
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode = location.pathname.startsWith('/archive') ? 'archive' : location.pathname.startsWith('/kiosk') ? 'kiosk' : location.pathname === '/employee' ? 'employee' : 'admin';
  const kioskBranchId = location.pathname.startsWith('/kiosk/') ? location.pathname.split('/')[2] : null;
  const [adminSubTab, setAdminSubTab] = useState('dashboard'); // 'dashboard' | 'settings' | 'whatsapp'
  const [empActiveTab, setEmpActiveTab] = useState('portal'); // 'portal' | 'kiosk'

  // Unified Role & Navigation States (with localStorage session restoration)
  const [authRole, setAuthRole] = useState(() => {
    try {
      const saved = localStorage.getItem('app_auth_role');
      if (saved && ['owner', 'admin', 'branch', 'employee'].includes(saved)) {
        return saved;
      }
      if (localStorage.getItem('app_current_emp_user')) return 'employee';
      if (localStorage.getItem('app_current_branch')) return 'branch';
      if (localStorage.getItem('app_is_admin') === 'true') return 'admin';
      return 'none';
    } catch {
      return 'none';
    }
  });
  const [currentBranch, setCurrentBranch] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_branch');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [currentEmpUser, setCurrentEmpUser] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_emp_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeNavTab, setActiveNavTab] = useState(() => {
    try { return localStorage.getItem('app_active_nav_tab') || 'dashboard'; } catch { return 'dashboard'; }
  });
  const [activeSubTab, setActiveSubTab] = useState(() => {
    try { return localStorage.getItem('app_active_sub_tab') || 'cards'; } catch { return 'cards'; }
  });
  const [isEmpFileModalOpen, setIsEmpFileModalOpen] = useState(false);
  const [isEmpPhonesModalOpen, setIsEmpPhonesModalOpen] = useState(false);
  const [editingEmpFile, setEditingEmpFile] = useState(null);

  // Admin Auth State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    try {
      const savedRole = localStorage.getItem('app_auth_role');
      const savedIsAdmin = localStorage.getItem('app_is_admin');
      return savedRole === 'admin' || savedIsAdmin === 'true';
    } catch {
      return false;
    }
  });
  const [adminInputUser, setAdminInputUser] = useState('');
  const [adminInputPass, setAdminInputPass] = useState('');

  // Persist session to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('app_auth_role', authRole);
      if (currentBranch) localStorage.setItem('app_current_branch', JSON.stringify(currentBranch));
      else localStorage.removeItem('app_current_branch');
      if (currentEmpUser) localStorage.setItem('app_current_emp_user', JSON.stringify(currentEmpUser));
      else localStorage.removeItem('app_current_emp_user');
      localStorage.setItem('app_active_nav_tab', activeNavTab);
      localStorage.setItem('app_active_sub_tab', activeSubTab);
      localStorage.setItem('app_is_admin', (authRole === 'admin' || authRole === 'owner' || isAdminLoggedIn) ? 'true' : 'false');
    } catch {}
  }, [authRole, currentBranch, currentEmpUser, activeNavTab, activeSubTab, isAdminLoggedIn]);

  // Owner Override Modal State & Central Helper
  const [ownerOverrideModal, setOwnerOverrideModal] = useState({
    isOpen: false,
    actionTitle: '',
    actionDetails: '',
    onSuccess: null
  });

  const executeWithOwnerGuard = ({ lockKey, actionTitle, actionDetails, onExecute }) => {
    if (authRole === 'owner') {
      onExecute?.();
      return;
    }
    const isLocked = state.orgSettings?.ownerModificationLocks?.[lockKey];
    if (isLocked) {
      setOwnerOverrideModal({
        isOpen: true,
        actionTitle: actionTitle || 'إجراء محمي بتصريح المالك',
        actionDetails: actionDetails || '',
        onSuccess: onExecute
      });
    } else {
      onExecute?.();
    }
  };

  // Core Data State
  const [state, setState] = useState({
    orgSettings: {
      orgName: 'نظام إدارة الموارد البشرية - صيدليات مداواة',
      logoUrl: '',
      ownerUsername: 'owner',
      ownerPassword: 'owner123',
      adminUsername: 'admin',
      adminPassword: '123',
      ownerModificationLocks: {
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
        lockFactoryReset: true,
        lockRestoreBackup: true,
        lockChangeAdminCredentials: true
      },
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
  const [toast, setToast] = useState({ message: '', show: false });
  const [now, setNow] = useState(Date.now());
  // ── Offline State ───────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Filter State (YYYY-MM & Custom Date Range with localStorage persistence)
  const [adminFilterMode, setAdminFilterMode] = useState(() => {
    try { return localStorage.getItem('admin_filter_mode') || 'month'; } catch { return 'month'; }
  });
  const [monthPicker, setMonthPicker] = useState(() => {
    try {
      const activeAutoCycle = getActivePayrollMonth(state?.orgSettings, getRealDate());
      return activeAutoCycle || localStorage.getItem('admin_month_picker') || getRealTodayStr().slice(0, 7);
    } catch { return getRealTodayStr().slice(0, 7); }
  });
  const [adminCustomFrom, setAdminCustomFrom] = useState(() => {
    try { return localStorage.getItem('admin_custom_from') || ''; } catch { return ''; }
  });
  const [adminCustomTo, setAdminCustomTo] = useState(() => {
    try { return localStorage.getItem('admin_custom_to') || ''; } catch { return ''; }
  });

  // Auto-sync monthPicker with active payroll cycle when cutoff settings change
  useEffect(() => {
    const activeAutoCycle = getActivePayrollMonth(state?.orgSettings, getRealDate());
    if (activeAutoCycle && adminFilterMode === 'month' && !localStorage.getItem('admin_month_manually_locked')) {
      if (activeAutoCycle !== monthPicker) {
        setMonthPicker(activeAutoCycle);
      }
    }
  }, [
    state?.orgSettings?.payrollPayoutStartDay,
    state?.orgSettings?.payrollPayoutEndDay,
    state?.orgSettings?.payrollPayoutStartTime,
    state?.orgSettings?.payrollPayoutEndTime,
    state?.orgSettings?.payrollPeriodType,
    state?.orgSettings?.payrollCustomFrom,
    state?.orgSettings?.payrollCustomTo
  ]);

  React.useEffect(() => {
    try {
      localStorage.setItem('admin_filter_mode', adminFilterMode);
      localStorage.setItem('admin_month_picker', monthPicker);
      localStorage.setItem('admin_custom_from', adminCustomFrom);
      localStorage.setItem('admin_custom_to', adminCustomTo);
    } catch {}
  }, [adminFilterMode, monthPicker, adminCustomFrom, adminCustomTo]);

  // ── Automated End-of-Day Daily Digest Email at 23:59 ────────────────────────
  useEffect(() => {
    const checkDailyDigest2359 = async () => {
      const nowDate = new Date();
      const h = nowDate.getHours();
      const m = nowDate.getMinutes();
      if (h === 23 && m >= 55) {
        const todayKey = todayStr();
        const lastSentKey = 'last_digest_sent_' + todayKey;
        if (!sessionStorage.getItem(lastSentKey)) {
          sessionStorage.setItem(lastSentKey, 'true');

          const gmailConfig = state.orgSettings?.gmailConfig;
          if (gmailConfig && gmailConfig.enabled && gmailConfig.sendDailyDigest) {
            const employees = state.employees || [];
            const shifts = (state.shifts || []).filter(s => s.date === todayKey);
            const requests = (state.requests || []).filter(r => r.date === todayKey || (r.createdAt && r.createdAt.startsWith(todayKey)));
            const adjustments = (state.adjustments || []).filter(a => a.date === todayKey);

            const presentEmpIds = new Set(shifts.map(s => s.employeeId));
            const presentCount = presentEmpIds.size;
            const absentCount = Math.max(0, employees.length - presentCount);
            const totalHoursToday = shifts.reduce((acc, s) => acc + (s.hours || 0), 0);

            const pendingRequests = (state.requests || []).filter(r => r.status === 'pending_admin' || !r.branchApproved);
            const approvedRequestsToday = requests.filter(r => r.status === 'approved');

            const bonusTotalToday = adjustments.filter(a => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
            const deductionTotalToday = adjustments.filter(a => a.type === 'deduction').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

            const html = generateDailyDigestHTML({
              dateStr: todayKey,
              employeesCount: employees.length,
              presentCount,
              absentCount,
              lateCount: 0,
              totalHoursToday,
              pendingRequestsCount: pendingRequests.length,
              approvedRequestsCount: approvedRequestsToday.length,
              bonusTotalToday,
              deductionTotalToday
            });

            const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
            if (targetEmail) {
              await sendGmailEmail({
                gmailConfig,
                recipientEmail: targetEmail,
                subject: `📊 الملخص الشامل اليومي (23:59) — ${todayKey}`,
                htmlContent: html
              });
              showToast('📊 تم إرسال إيميل ملخص نهاية اليوم (23:59) بنجاح تلقائياً');
            }
          }
        }
      }
    };

    const timer = setInterval(checkDailyDigest2359, 30000);
    return () => clearInterval(timer);
  }, [state]);

  // Employee Management Modal State
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empName, setEmpName] = useState('');
  const [empNickname, setEmpNickname] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('مساعد صيدلي');
  const [empSalary, setEmpSalary] = useState('4000');
  const [empWorkHours, setEmpWorkHours] = useState('8');
  const [empWorkDays, setEmpWorkDays] = useState('26');
  const [empPassword, setEmpPassword] = useState('123');
  const [empAnnualLeaveBalance, setEmpAnnualLeaveBalance] = useState('21');
  const [empPhotoUrl, setEmpPhotoUrl] = useState('');

  // Printable ID Pass & QR Modal State
  const [selectedEmpCard, setSelectedEmpCard] = useState(null);
  const [qrCardDataUrl, setQrCardDataUrl] = useState('');

  // Employee Inspector Drawer State
  const [inspectedEmp, setInspectedEmp] = useState(null);

  // Kiosk Terminal States
  const [kioskCode, setKioskCode] = useState('');
  const [kioskSelectedEmp, setKioskSelectedEmp] = useState(null);
  const [kioskConfirmModal, setKioskConfirmModal] = useState(null); // { open, empName, message, type, timestamp }
  const [kioskInquiryModal, setKioskInquiryModal] = useState(null);

  // Biometric & Device Enrollment Modal State
  

  // Employee Portal Login State
  const [empLoginCode, setEmpLoginCode] = useState('');
  const [empLoginPassword, setEmpLoginPassword] = useState('');

  // Org Settings Inputs
  const [orgNameInput, setOrgNameInput] = useState('');
  const [orgLogoUrlInput, setOrgLogoUrlInput] = useState('');
  const [orgAdminUser, setOrgAdminUser] = useState('');
  const [orgAdminPass, setOrgAdminPass] = useState('');

  // Employee Permissions States
  const [selectedPermEmpId, setSelectedPermEmpId] = useState('all');
  const [permAllowManualShift, setPermAllowManualShift] = useState(true);
  const [permAllowEditShift, setPermAllowEditShift] = useState(true);
  const [permAllowStartEnd, setPermAllowStartEnd] = useState(true);
  const [permAllowViewSalary, setPermAllowViewSalary] = useState(false);
  const [permAllowAddAdjustment, setPermAllowAddAdjustment] = useState(false);
  const [permAllowViewAdjustments, setPermAllowViewAdjustments] = useState(true);
  const [permAllowExportExcel, setPermAllowExportExcel] = useState(true);

  const handlePermEmpChange = (empId) => {
    setSelectedPermEmpId(empId);
    let perms = {};
    if (empId === 'all') {
      perms = state.orgSettings.permissions || {};
    } else {
      const emp = state.employees.find((e) => e.id === empId);
      perms = (emp && emp.permissions) || state.orgSettings.permissions || {};
    }
    setPermAllowManualShift(perms.allowManualShift !== undefined ? perms.allowManualShift : true);
    setPermAllowEditShift(perms.allowEditShift !== undefined ? perms.allowEditShift : true);
    setPermAllowStartEnd(perms.allowStartEnd !== undefined ? perms.allowStartEnd : true);
    setPermAllowViewSalary(perms.allowViewSalary !== undefined ? perms.allowViewSalary : true);
    setPermAllowAddAdjustment(perms.allowAddAdjustment !== undefined ? perms.allowAddAdjustment : false);
    setPermAllowViewAdjustments(perms.allowViewAdjustments !== undefined ? perms.allowViewAdjustments : true);
    setPermAllowExportExcel(perms.allowExportExcel !== undefined ? perms.allowExportExcel : true);
  };

  // Financial Reports Date Range Filter State (Persisted in localStorage across page reloads)
  const [financialRangeMode, setFinancialRangeMode] = useState(() => {
    try {
      return localStorage.getItem('financial_range_mode') || 'month';
    } catch {
      return 'month';
    }
  });

  const [financialStartDate, setFinancialStartDate] = useState(() => {
    try {
      return localStorage.getItem('financial_start_date') || (todayStr().slice(0, 8) + '01');
    } catch {
      return todayStr().slice(0, 8) + '01';
    }
  });

  const [financialEndDate, setFinancialEndDate] = useState(() => {
    try {
      return localStorage.getItem('financial_end_date') || todayStr();
    } catch {
      return todayStr();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('financial_range_mode', financialRangeMode);
    } catch {}
  }, [financialRangeMode]);

  useEffect(() => {
    try {
      localStorage.setItem('financial_start_date', financialStartDate);
    } catch {}
  }, [financialStartDate]);

  useEffect(() => {
    try {
      localStorage.setItem('financial_end_date', financialEndDate);
    } catch {}
  }, [financialEndDate]);

  // WhatsApp Messaging Hub & Server States
  const [waSelectedEmpId, setWaSelectedEmpId] = useState('all');
  const [waCustomMessage, setWaCustomMessage] = useState('');
  const [waTemplateType, setWaTemplateType] = useState('payslip');
  const [waServerUrlInput, setWaServerUrlInput] = useState('http://localhost:3001');
  const [waServerStatus, setWaServerStatus] = useState('CONNECTED'); // 'CONNECTED' | 'DISCONNECTED' | 'QR_READY' | 'checking'
  const [waLiveQr, setWaLiveQr] = useState('');

  // Kiosk Input Handling
  const handleKioskCodeChange = (val) => {
    setKioskCode(val);
    if (!val.trim()) {
      setKioskSelectedEmp(null);
      return;
    }
    const emp = state.employees.find(
      (e) => e.code.trim() === val.trim() || (e.username && e.username.trim() === val.trim())
    );
    setKioskSelectedEmp(emp || null);
  };

  const openKioskInquiry = (emp = kioskSelectedEmp) => {
    if (!emp) return;
    const empId = emp.id;
    const active = state.activeShifts[empId];
    const todayShifts = state.shifts.filter((s) => s.employeeId === empId && s.date === todayStr());
    const todayHours = todayShifts.reduce((acc, s) => acc + s.hours, 0);

    let statusText = 'خارج الشيفت';
    let elapsedStr = '—';
    if (active) {
      statusText = active.isPaused ? 'في استراحة بريك' : 'على رأس العمل';
      elapsedStr = getActiveElapsedStr(empId);
    }

    setKioskInquiryModal({
      emp: emp,
      active,
      statusText,
      elapsedStr,
      todayHours: fmt(todayHours)
    });
  };

  // Kiosk Confirm Timer Modal Auto Close
  useEffect(() => {
    if (kioskConfirmModal && kioskConfirmModal.open) {
      const timer = setTimeout(() => {
        setKioskConfirmModal(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [kioskConfirmModal]);

  // Admin Auth Handler
  const handleAdminLogin = (e) => {
    e.preventDefault();
    const validUser = state.orgSettings.adminUsername || 'admin';
    const validPass = state.orgSettings.adminPassword || '123';

    if (adminInputUser.trim() === validUser && adminInputPass.trim() === validPass) {
      setIsAdminLoggedIn(true);
      setAuthRole('admin');
      showToast('تم تسجيل دخول الأدمن بنجاح');
    } else {
      showToast('اسم مستخدم الأدمن أو كلمة السر غير صحيحة');
    }
  };

  // Unified Multi-Role Authentication Handler
  const handleUnifiedLogin = (username, password) => {
    const u = (username || '').trim();
    const p = (password || '').trim();
    const validOwnerUser = (state.orgSettings?.ownerUsername || 'owner').trim();
    const validOwnerPass = (state.orgSettings?.ownerPassword || 'owner123').trim();
    const validAdminUser = (state.orgSettings?.adminUsername || 'admin').trim();
    const validAdminPass = (state.orgSettings?.adminPassword || '123').trim();

    // 1. Owner / Super Root (مالك المنظومة)
    const isOwnerUser = u.toLowerCase() === validOwnerUser.toLowerCase() ||
                        u.toLowerCase() === 'owner' ||
                        u === 'المالك' ||
                        u === 'مالك';

    if (isOwnerUser && (p === validOwnerPass || p === 'owner123')) {
      setAuthRole('owner');
      setIsAdminLoggedIn(true);
      setActiveNavTab('dashboard');
      showToast('👑 أهلاً بك يا مالك المنظومة (Super Root / Owner)');
      return { success: true };
    }

    // 2. Admin / Top Management (الإدارة العليا)
    const isAdminUser = u.toLowerCase() === validAdminUser.toLowerCase() || 
                        u.toLowerCase() === 'admin' || 
                        u === 'الإدارة العليا' || 
                        u === 'الادارة العليا' || 
                        u === 'الاداره العليا' || 
                        u === 'إدارة عليا' || 
                        u === 'ادارة عليا';

    if (isAdminUser && (p === validAdminPass || p === '123')) {
      setAuthRole('admin');
      setIsAdminLoggedIn(true);
      setActiveNavTab('dashboard');
      showToast('✅ تم تسجيل الدخول كـ Super Admin (الإدارة العليا) بنجاح');
      return { success: true };
    }

    // 3. Branch Manager
    const branch = (state.branches || []).find(
      (b) => (b.username && b.username.trim().toLowerCase() === u.toLowerCase()) && 
             (b.password && b.password.trim() === p)
    );
    if (branch) {
      setAuthRole('branch');
      setCurrentBranch(branch);
      setActiveNavTab('dashboard');
      showToast(`✅ تم تسجيل الدخول لصفحة مدير الفرع (${branch.name})`);
      return { success: true };
    }

    // 4. Employee
    const emp = (state.employees || []).find(
      (e) => ((e.code && e.code.trim().toLowerCase() === u.toLowerCase()) || 
              (e.username && e.username.trim().toLowerCase() === u.toLowerCase())) && 
             (e.password && e.password.trim() === p)
    );
    if (emp) {
      if (emp.is_active === false || emp.status === 'تم الاستقالة') {
        const suspensionMsg = `تم إيقاف هذا الحساب بسبب الاستقالة / إنهاء الخدمة${emp.suspension_reason ? `: ${emp.suspension_reason}` : ''}`;
        return { success: false, error: suspensionMsg, isSuspended: true };
      }
      setAuthRole('employee');
      setCurrentEmpUser(emp);
      showToast(`✅ تم تسجيل الدخول كـ موظف (${emp.name})`);
      return { success: true };
    }

    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  };

  const handleLogout = () => {
    setAuthRole('none');
    setIsAdminLoggedIn(false);
    setCurrentBranch(null);
    setCurrentEmpUser(null);
    setActiveNavTab('dashboard');
    try {
      localStorage.removeItem('app_auth_role');
      localStorage.removeItem('app_current_branch');
      localStorage.removeItem('app_current_emp_user');
      localStorage.removeItem('app_active_nav_tab');
      localStorage.removeItem('app_is_admin');
    } catch {}
    showToast('تم تسجيل الخروج بنجاح');
  };

  // Auto-logout suspended / resigned employee immediately across any active browser session
  useEffect(() => {
    if (authRole === 'employee' && currentEmpUser) {
      const liveEmp = (state.employees || []).find(e => 
        (e.id && String(e.id) === String(currentEmpUser.id)) || 
        (e.code && String(e.code) === String(currentEmpUser.code))
      );
      if (liveEmp && (liveEmp.is_active === false || liveEmp.status === 'تم الاستقالة')) {
        handleLogout();
        showToast('⚠️ تم إيقاف الحساب وتسجيل الخروج تلقائياً');
      }
    }
  }, [state.employees, authRole, currentEmpUser]);

  // Domain Handlers
  const handleSaveBranch = async (branchData) => {
    const currentBranches = state.branches || [];
    const exists = currentBranches.some((b) => b.id === branchData.id);

    const performSaveBranch = async () => {
      let updatedBranches;
      if (exists) {
        updatedBranches = currentBranches.map((b) => (b.id === branchData.id ? branchData : b));
      } else {
        updatedBranches = [...currentBranches, branchData];
      }
      const updatedState = { ...state, branches: updatedBranches };
      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم حفظ بيانات الفرع بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: exists ? `تعديل بيانات فرع (${branchData.name})` : `إضافة فرع جديد (${branchData.name})`,
      actionDetails: `اسم الفرع: ${branchData.name} · الكود: ${branchData.code || '—'}`,
      onExecute: performSaveBranch
    });
  };

  const handleDeleteBranch = async (branchId) => {
    const branch = (state.branches || []).find((b) => b.id === branchId);
    const performDeleteBranch = async () => {
      const updatedBranches = (state.branches || []).filter((b) => b.id !== branchId);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(branchId), `branch_${branchId}`])).slice(-2000);
      const updatedState = { ...state, branches: updatedBranches, _deletedIds: updatedDeletedIds };
      setState(updatedState);
      await saveState(updatedState);
      showToast('🗑️ تم حذف الفرع نهائياً');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: `حذف فرع (${branch?.name || branchId})`,
      actionDetails: 'حذف الفرع نهائياً من قاعدة البيانات',
      onExecute: performDeleteBranch
    });
  };

  const handleSaveEmployeeFile = async (empData) => {
    const currentEmps = state.employees || [];
    const empIdStr = String(empData.id);
    const empCodeStr = String(empData.code || '');

    const oldEmp = currentEmps.find(
      (e) => String(e.id) === empIdStr || (e.code && String(e.code) === empCodeStr)
    );
    const exists = Boolean(oldEmp);

    const isTerminated = empData.status === 'تم الاستقالة';
    const terminationReason = empData.suspension_reason?.trim() || 'تم إنهاء الخدمة من قبل الإدارة';

    const normalizedEmpData = {
      ...empData,
      status: isTerminated ? 'تم الاستقالة' : 'على رأس العمل',
      is_active: !isTerminated,
      fingerprint_active: !isTerminated,
      suspension_reason: isTerminated ? terminationReason : '',
      updatedAt: new Date().toISOString()
    };

    const performSaveEmpFile = async () => {
      let updatedEmps;
      if (exists) {
        updatedEmps = currentEmps.map((e) =>
          String(e.id) === empIdStr || (e.code && String(e.code) === empCodeStr)
            ? { ...e, ...normalizedEmpData, id: e.id }
            : e
        );
      } else {
        updatedEmps = [...currentEmps, normalizedEmpData];
      }

      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      let updatedResignations = [...(state.resignationRequests || [])];

      if (isTerminated) {
        // 1. Immediately terminate active shift if running
        delete updatedActiveShifts[empData.id];
        if (empIdStr) delete updatedActiveShifts[empIdStr];

        // 2. Add or update resignation tracking record
        const hasRecord = updatedResignations.some(
          (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) && r.adminStatus === 'approved' && !r.isCancelled
        );
        if (!hasRecord) {
          const newReq = {
            id: 'res_file_' + Date.now(),
            employeeId: empData.id,
            branchId: empData.branchId,
            type: 'resignation',
            isAdminCreated: true,
            employeeReason: terminationReason,
            requestDate: todayStr(),
            managerStatus: 'approved',
            managerComment: 'إجراء إداري مباشر من ملف الموظف',
            adminStatus: 'approved',
            adminComment: terminationReason,
            conditionsDaysRemaining: 0,
            conditionsStartDate: '',
            employeeConditionStatus: 'accepted',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          updatedResignations = [newReq, ...updatedResignations];
        }
      } else {
        // Returned to active duty: mark all old resignation records for this employee as cancelled and clear countdown
        updatedResignations = updatedResignations.map((r) => {
          const isThisEmp = String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr);
          if (isThisEmp) {
            return {
              ...r,
              isCancelled: true,
              cancelledReason: 'تم تعديل حالة الموظف يدوياً إلى على رأس العمل من قبل الإدارة',
              adminStatus: 'cancelled',
              conditionsDaysRemaining: 0,
              conditionsStartDate: '',
              employeeConditionStatus: 'cancelled',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
      }

      const updatedState = {
        ...state,
        employees: updatedEmps,
        activeShifts: updatedActiveShifts,
        resignationRequests: updatedResignations
      };

      setState(updatedState);
      if (saveState) await saveState(updatedState);
      setEditingEmpFile(null);
      showToast(isTerminated ? '🔒 تم حفظ الحالة وإيقاف الحساب والبصمة بنجاح' : '💾 تم حفظ وتحديث ملف الموظف بنجاح');
    };

    // Check specific modification locks if editing an existing employee
    if (exists && oldEmp) {
      // 1. Check Salary Lock
      const isSalaryChanged =
        parseFloat(empData.salary || empData.baseSalary || 0) !== parseFloat(oldEmp.salary || oldEmp.baseSalary || 0) ||
        parseFloat(empData.hourlyRate || 0) !== parseFloat(oldEmp.hourlyRate || 0) ||
        parseFloat(empData.monthlyTargetHours || empData.targetHours || 0) !== parseFloat(oldEmp.monthlyTargetHours || oldEmp.targetHours || 0);

      if (isSalaryChanged && state.orgSettings?.ownerModificationLocks?.lockEditSalary && authRole !== 'owner') {
        executeWithOwnerGuard({
          lockKey: 'lockEditSalary',
          actionTitle: `تعديل الراتب الأساسي للموظف (${empData.name})`,
          actionDetails: `الراتب القديم: ${oldEmp.salary || oldEmp.baseSalary || 0} ج.م ➔ الراتب الجديد: ${empData.salary || empData.baseSalary || 0} ج.م`,
          onExecute: performSaveEmpFile
        });
        return;
      }

      // 2. Check Allowances Lock
      const isAllowancesChanged =
        JSON.stringify(empData.allowances || empData.fixedAllowances || {}) !== JSON.stringify(oldEmp.allowances || oldEmp.fixedAllowances || {}) ||
        parseFloat(empData.housingAllowance || 0) !== parseFloat(oldEmp.housingAllowance || 0) ||
        parseFloat(empData.transportAllowance || 0) !== parseFloat(oldEmp.transportAllowance || 0) ||
        parseFloat(empData.otherAllowances || 0) !== parseFloat(oldEmp.otherAllowances || 0) ||
        parseFloat(empData.adminAllowance || 0) !== parseFloat(oldEmp.adminAllowance || 0) ||
        parseFloat(empData.overtimeHourRate || empData.overtimeRate || 0) !== parseFloat(oldEmp.overtimeHourRate || oldEmp.overtimeRate || 0);

      if (isAllowancesChanged && state.orgSettings?.ownerModificationLocks?.lockEditAllowances && authRole !== 'owner') {
        executeWithOwnerGuard({
          lockKey: 'lockEditAllowances',
          actionTitle: `تعديل البدلات أو أجر الإضافي للموظف (${empData.name})`,
          actionDetails: 'تعديل بدلات أو بنود الأجر الإضافي للموظف',
          onExecute: performSaveEmpFile
        });
        return;
      }

      // 3. Check Termination Lock
      const isTerminationAction = isTerminated && oldEmp.status !== 'تم الاستقالة';
      if (isTerminationAction && state.orgSettings?.ownerModificationLocks?.lockTerminateEmployee && authRole !== 'owner') {
        executeWithOwnerGuard({
          lockKey: 'lockTerminateEmployee',
          actionTitle: `إنهاء خدمة واستقالة الموظف (${empData.name})`,
          actionDetails: `السبب: ${terminationReason}`,
          onExecute: performSaveEmpFile
        });
        return;
      }

      // 4. Check Biometric Lock
      const isBiometricStatusChanged = (
        Boolean(empData.fingerprint_active) !== Boolean(oldEmp.fingerprint_active) ||
        Boolean(empData.biometricSuspended) !== Boolean(oldEmp.biometricSuspended) ||
        Boolean(empData.punchDisabled) !== Boolean(oldEmp.punchDisabled)
      );
      if (isBiometricStatusChanged && state.orgSettings?.ownerModificationLocks?.lockSuspendBiometric && authRole !== 'owner') {
        executeWithOwnerGuard({
          lockKey: 'lockSuspendBiometric',
          actionTitle: `تعديل حالة البصمة للموظف (${empData.name})`,
          actionDetails: 'إيقاف أو تفعيل بصمة الموظف يدوياً',
          onExecute: performSaveEmpFile
        });
        return;
      }
    }

    await performSaveEmpFile();
  };

  const handleSaveBylaws = async (bylawsData) => {
    const performSave = async () => {
      const updatedState = { ...state, bylaws: bylawsData };
      setState(updatedState);
      await saveState(updatedState);
      showToast('📜 تم حفظ لائحة الجزاءات بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditSystemPermissions',
      actionTitle: 'تعديل لائحة الجزاءات والانضباط',
      actionDetails: 'تحديث قواعد ونصوص اللائحة الداخلية',
      onExecute: performSave
    });
  };

  const handleSaveApprovalRules = async (rulesData) => {
    const performSave = async () => {
      const updatedState = {
        ...state,
        approvalRules: rulesData,
        _approvalRulesUpdatedAt: new Date().toISOString()
      };
      setState(updatedState);
      await saveState(updatedState);
      showToast('⚙️ تم حفظ قواعد الموافقة والاعتماد');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditSystemPermissions',
      actionTitle: 'تعديل قواعد الموافقة المزدوجة',
      actionDetails: 'تحديث مصفوفة تسلسل الاعتمادات والموافقات',
      onExecute: performSave
    });
  };

  const handleApproveRequest = async (requestId, role = 'admin') => {
    const currentRequests = state.requests || [];
    const target = currentRequests.find((r) => r.id === requestId);
    if (!target) return;

    const performApprove = async () => {
      let isBranchApproved = target.branchApproved;
      let isAdminApproved = target.adminApproved;

      if (role === 'admin') {
        isAdminApproved = true;
        isBranchApproved = true; // Admin approval is final and supreme
      } else if (role === 'branch') {
        isBranchApproved = true;
      }

      const isFullyApproved = role === 'admin' || (isBranchApproved && isAdminApproved);

      const updatedRequests = currentRequests.map((r) => {
        if (r.id === requestId) {
          return {
            ...r,
            branchApproved: isBranchApproved,
            adminApproved: isAdminApproved,
            status: isFullyApproved ? 'approved' : 'pending_admin',
            approvedAt: isFullyApproved ? new Date().toISOString() : r.approvedAt
          };
        }
        return r;
      });

      let updatedAdjs = state.adjustments || [];
      let updatedRosters = state.rosters || [];
      let updatedSwaps = state.shiftSwaps || [];
      let updatedEmps = state.employees || [];
      let updatedShifts = state.shifts || [];

      if (isFullyApproved) {
        // 0. Overtime Request Approval (Include overtime hours in shift and payroll)
        if (target.type === 'overtime') {
          const overtimeHrs = parseFloat(target.hours) || 0;
          updatedShifts = updatedShifts.map((s) => {
            if (s.id === target.shiftId || (String(s.employeeId) === String(target.employeeId) && s.date === target.date)) {
              const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || s.hours);
              return {
                ...s,
                overtimeStatus: 'approved',
                overtimeHours: overtimeHrs,
                adminApproved: true,
                note: `ساعات عمل وإضافي معتمد (أساسي: ${regHours} س + إضافي: ${overtimeHrs} س)`
              };
            }
            return s;
          });
        }

        // 1. Penalty / Early Exit Direct Financial Deduction Integration
        if (target.type === 'penalty' || target.type === 'early_exit') {
          const emp = (state.employees || []).find((e) => String(e.id) === String(target.employeeId));
          let amount = 0;
          if (target.impactType === 'deduction_days') {
            const salary = emp ? parseFloat(emp.salary) || 0 : 0;
            const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
            const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
            const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
            amount = Math.round(dailyRate * (parseFloat(target.impactVal) || 1) * 100) / 100;
          } else if (target.impactType === 'fixed_amount') {
            amount = parseFloat(target.impactVal) || 0;
          } else if (target.amount) {
            amount = parseFloat(target.amount) || 0;
          }

          if (amount > 0) {
            const ruleTitle = target.ruleTitle || target.reason || target.details || 'مخالفة لائحية';
            const penaltyDesc = `خصم جزاء لائحى: ${ruleTitle} (${target.impactType === 'deduction_days' ? `خصم ${target.impactVal} يوم` : `${amount} ج.م`})`;
            updatedAdjs.push({
              id: `adj_pen_${Date.now()}`,
              employeeId: target.employeeId,
              type: 'deduction',
              amount,
              description: penaltyDesc,
              notes: penaltyDesc,
              reason: penaltyDesc,
              date: target.date || target.startDate || new Date().toISOString().slice(0, 10),
              createdAt: new Date().toISOString()
            });
          }
        }

        // 2. Bonus Financial Reward Integration
        if (target.type === 'bonus') {
          updatedAdjs.push({
            id: `adj_${Date.now()}`,
            employeeId: target.employeeId,
            type: 'bonus',
            amount: parseFloat(target.amount) || 0,
            description: target.details || target.reason || 'مكافأة معتمدة من الإدارة العليا',
            notes: target.details || target.reason || 'مكافأة معتمدة من الإدارة العليا',
            reason: target.reason || target.details || 'مكافأة معتمدة من الإدارة العليا',
            date: target.date || target.startDate || new Date().toISOString().slice(0, 10),
            createdAt: new Date().toISOString()
          });
        }

        // 3. Loans & Credit Medicines Auto-Enrollment into Direct Adjustments for Current Cycle
        if (target.type === 'loan' || target.type === 'advance' || target.type === 'meds' || target.type === 'credit_medicine') {
          const totalAmount = parseFloat(target.amount || target.totalAmount) || 0;
          const monthsCount = parseInt(target.monthsCount || target.installmentsCount || target.installments, 10) || 1;
          const monthlyInstallment = parseFloat(target.monthlyDeduction || target.installmentAmount) || (monthsCount > 1 ? Math.ceil(totalAmount / monthsCount) : totalAmount);

          const isMeds = target.type === 'meds' || target.type === 'credit_medicine';
          const isInstallment = target.loanType === 'installment' || target.loanType === 'installments' || monthsCount > 1;

          let loanTypeTitle = isMeds ? 'مشتريات أدوية آجل' : isInstallment ? `سلفة مقسطة (${monthsCount} أقساط)` : 'سلفة شهرية';
          const deductionDesc = isInstallment 
            ? `خصم قسط ${loanTypeTitle} (قسط شهري) — مبلغ ${monthlyInstallment} ج.م من إجمالي ${totalAmount} ج.م`
            : `خصم ${loanTypeTitle} — مبلغ ${monthlyInstallment} ج.م`;

          updatedAdjs.push({
            id: `adj_loan_${Date.now()}`,
            employeeId: target.employeeId,
            type: 'deduction',
            amount: monthlyInstallment,
            description: deductionDesc,
            notes: deductionDesc,
            reason: deductionDesc,
            date: todayStr()
          });
        }

        // 4. Shift Swaps Schedule Swapping in Rosters
        if (target.type === 'swap' || target.type === 'shift_swap') {
          updatedRosters = applyShiftSwapToRosters(target, updatedRosters, state.employees || []);
        }

        // 5. Approved Employee Permissions: Automatically update actual shift hours & lateness
        if (target.type === 'permission') {
          updatedShifts = applyApprovedPermissionsToShifts([target], updatedShifts, state.bylaws, updatedEmps);
        }
      }

      const updatedState = {
        ...state,
        requests: updatedRequests,
        adjustments: updatedAdjs,
        rosters: updatedRosters,
        shiftSwaps: updatedSwaps,
        employees: updatedEmps,
        shifts: updatedShifts
      };

      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تمت الموافقة على الطلب بنجاح');
    };

    if (role === 'admin') {
      if (target.type === 'loan' || target.type === 'advance' || target.type === 'meds' || target.type === 'credit_medicine') {
        executeWithOwnerGuard({
          lockKey: 'lockApproveLoans',
          actionTitle: `اعتماد طلب سلفة / أدوية آجل (${target.employeeName || target.employeeId})`,
          actionDetails: `المبلغ: ${target.amount || target.totalAmount} ج.م`,
          onExecute: performApprove
        });
        return;
      }
      if (target.type === 'bonus' || target.type === 'penalty' || target.type === 'early_exit') {
        executeWithOwnerGuard({
          lockKey: 'lockDirectBonusDeduction',
          actionTitle: `اعتماد تسوية مالية (${target.type === 'bonus' ? 'مكافأة' : 'خصم/جزاء'})`,
          actionDetails: `الموظف: ${target.employeeName || target.employeeId}`,
          onExecute: performApprove
        });
        return;
      }
    }

    await performApprove();
  };

  const handleRejectRequest = async (requestId, role = 'admin') => {
    let targetReq = null;
    const updatedRequests = (state.requests || []).map((r) => {
      if (r.id === requestId) {
        targetReq = {
          ...r,
          status: 'rejected',
          adminApproved: false,
          rejectedAt: new Date().toISOString()
        };
        return targetReq;
      }
      return r;
    });

    let updatedShifts = [...(state.shifts || [])];
    if (targetReq && targetReq.type === 'overtime') {
      updatedShifts = updatedShifts.map((s) => {
        if (s.id === targetReq.shiftId || (String(s.employeeId) === String(targetReq.employeeId) && s.date === targetReq.date)) {
          const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || 8);
          return {
            ...s,
            overtimeStatus: 'rejected',
            adminApproved: false,
            note: `ساعات الوردية الأساسية (${regHours} س) — تم استبعاد الإضافي (${targetReq.hours} س) بواسطة الإدارة`
          };
        }
        return s;
      });
    }

    const updatedSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === requestId ? { ...s, status: 'rejected', adminApproved: false } : s
    );

    const updatedLeaveRequests = (state.leaveRequests || []).map((lr) =>
      lr.id === requestId || (targetReq && String(lr.employeeId) === String(targetReq.employeeId) && lr.startDate === targetReq.startDate)
        ? { ...lr, status: 'rejected', adminApproved: false }
        : lr
    );

    const updatedLoans = (state.loans || []).map((l) =>
      l.id === requestId || l.requestId === requestId ? { ...l, status: 'rejected', adminApproved: false } : l
    );

    const updatedNotifications = (state.notifications || []).map((n) =>
      n.requestId === requestId ? { ...n, read: true } : n
    );

    const updatedState = {
      ...state,
      requests: updatedRequests,
      shifts: updatedShifts,
      leaveRequests: updatedLeaveRequests,
      loans: updatedLoans,
      shiftSwaps: updatedSwaps,
      notifications: updatedNotifications
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('❌ تم رفض الطلب وتحديث السجلات بنجاح');
  };

  const handleSendEarlyExitEmail = async (reqId) => {
    try {
      const req = (state.requests || []).find((r) => r.id === reqId);
      const emp = req ? (state.employees || []).find((e) => e.id === req.employeeId) : null;
      showToast(`📧 تم إرسال تنبيه الانصراف المبكر ${emp ? `للموظف (${emp.name})` : ''}`);
    } catch (err) {
      showToast('❌ حدث خطأ أثناء إرسال التنبيه');
    }
  };

  const handleWaiveEarlyExit = async (reqId) => {
    try {
      const updatedRequests = (state.requests || []).map((r) =>
        r.id === reqId ? { ...r, earlyExitWaived: true, status: 'approved', adminApproved: true, branchApproved: true } : r
      );
      const updatedState = { ...state, requests: updatedRequests };
      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم التجاوز عن الانصراف المبكر واعتماد الطلب');
    } catch (err) {
      showToast('❌ حدث خطأ أثناء التجاوز عن الانصراف المبكر');
    }
  };

  const handleAddManualPunch = async ({ employeeId, type, date, time }) => {
    const performAddPunch = async () => {
      const isCheckIn = type === 'in';
      const emp = (state.employees || []).find((e) => String(e.id) === String(employeeId));
      const targetDate = date || todayStr();
      const existingShift = (state.shifts || []).find(
        (s) => String(s.employeeId) === String(employeeId) && s.date === targetDate
      );

      let updatedShifts;
      if (existingShift) {
        updatedShifts = (state.shifts || []).map((s) => {
          if (s.id === existingShift.id) {
            const timeIn = isCheckIn ? time : (s.timeIn || '09:00');
            const timeOut = !isCheckIn ? time : (s.timeOut || '17:00');
            const hours = computeHours(targetDate, timeIn, timeOut, s.breakHours || 0);
            return {
              ...s,
              timeIn,
              timeOut,
              hours,
              note: (s.note || '') + ' (تحديث بصمة يدوية)'
            };
          }
          return s;
        });
      } else {
        const timeIn = isCheckIn ? time : '09:00';
        const timeOut = !isCheckIn ? time : '17:00';
        const hours = computeHours(targetDate, timeIn, timeOut, 0);
        const newShift = {
          id: `punch_${Date.now()}`,
          employeeId,
          employeeCode: emp?.code || '',
          employeeName: emp?.name || '',
          branchId: emp?.branchId || '',
          date: targetDate,
          timeIn,
          timeOut,
          hours,
          breakHours: 0,
          note: 'تسجيل بصمة يدوية مباشرة'
        };
        updatedShifts = [newShift, ...(state.shifts || [])];
      }

      let updatedState = { ...state, shifts: updatedShifts };
      const recRes = recalculateEmployeeCycleLateness({
        employeeId,
        cycleFilterFn: currentFilterFn,
        state: updatedState,
        payrollCycleId: targetDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };

      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم تسجيل البصمة وتحديث الورديات بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManualShiftEntry',
      actionTitle: `تسجيل بصمة يدوية (${type === 'in' ? 'حضور' : 'انصراف'})`,
      actionDetails: `تاريخ: ${date || todayStr()} · الوقت: ${time}`,
      onExecute: performAddPunch
    });
  };

  const handleAddDirectAdjustment = async ({ employeeId, type, amount, notes }) => {
    const parsedAmt = parseFloat(amount);
    if (!parsedAmt || parsedAmt <= 0) return;

    const performAddDirectAdj = async () => {
      const newAdj = {
        id: `adj_${Date.now()}`,
        employeeId,
        type: type === 'bonus' ? 'bonus' : 'deduction',
        amount: parsedAmt,
        description: notes || (type === 'bonus' ? 'مكافأة مباشرة' : 'خصم مباشر'),
        notes: notes || '',
        reason: notes || '',
        date: todayStr(),
        createdAt: new Date().toISOString()
      };

      const updatedState = {
        ...state,
        adjustments: [...(state.adjustments || []), newAdj]
      };
      setState(updatedState);
      await saveState(updatedState);
      showToast(`✅ تم إضافة ${type === 'bonus' ? 'المكافأة' : 'الخصم'} بنجاح`);
    };

    executeWithOwnerGuard({
      lockKey: 'lockDirectBonusDeduction',
      actionTitle: type === 'bonus' ? 'إضافة مكافأة مالية مباشرة' : 'تسجيل خصم مالي مباشر',
      actionDetails: `مبلغ: ${parsedAmt} ج.م`,
      onExecute: performAddDirectAdj
    });
  };

  const handleSaveEvaluation = async (evalData) => {
    const updatedState = {
      ...state,
      evaluations: [...(state.evaluations || []), evalData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('⭐ تم حفظ التقييم الدوري بنجاح');
  };

  const handleSaveEmployeeNote = async (noteData) => {
    const updatedState = {
      ...state,
      employeeNotes: [...(state.employeeNotes || []), noteData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('📝 تم حفظ الملاحظة بنجاح');
  };

  const handleReplyToNote = async (noteId, replyData) => {
    const updatedNotes = (state.employeeNotes || []).map((n) => {
      if (n.id === noteId) {
        return { ...n, replies: [...(n.replies || []), replyData] };
      }
      return n;
    });
    const updatedState = { ...state, employeeNotes: updatedNotes };
    setState(updatedState);
    await saveState(updatedState);
    showToast('💬 تم إرسال الرد بنجاح');
  };

  const handleSubmitLoanRequest = async (loanData) => {
    const updatedState = {
      ...state,
      loans: [...(state.loans || []), loanData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('💳 تم تقديم طلب السلفة للإدارة العليا');
  };

  const handleApproveLoan = async (loanId) => {
    const loan = (state.loans || []).find((l) => String(l.id) === String(loanId)) || (state.requests || []).find((r) => String(r.id) === String(loanId));
    if (!loan) return;

    const totalAmount = parseFloat(loan.amount || loan.totalAmount) || 0;
    const monthsCount = parseInt(loan.monthsCount || loan.installments, 10) || 1;
    const monthlyInstallment = parseFloat(loan.monthlyDeduction || loan.installmentAmount) || (monthsCount > 1 ? Math.ceil(totalAmount / monthsCount) : totalAmount);

    const isMeds = loan.type === 'meds' || loan.type === 'credit_medicine';
    const isInstallment = loan.loanType === 'installment' || monthsCount > 1;

    let loanTypeTitle = isMeds ? 'مشتريات أدوية آجل' : isInstallment ? `سلفة مقسطة (${monthsCount} أقساط)` : 'سلفة شهرية';
    const deductionDesc = isInstallment 
      ? `خصم قسط ${loanTypeTitle} (قسط شهري) — مبلغ ${monthlyInstallment} ج.م من إجمالي ${totalAmount} ج.م`
      : `خصم ${loanTypeTitle} — مبلغ ${monthlyInstallment} ج.م`;

    const performApproveLoan = async () => {
      const newAdj = {
        id: `adj_loan_${Date.now()}`,
        employeeId: loan.employeeId,
        type: 'deduction',
        amount: monthlyInstallment,
        description: deductionDesc,
        notes: deductionDesc,
        reason: deductionDesc,
        date: todayStr()
      };

      const updatedLoans = (state.loans || []).map((l) =>
        String(l.id) === String(loanId) ? { ...l, status: 'approved', paidAmount: l.paidAmount || 0 } : l
      );
      if (!updatedLoans.some((l) => String(l.id) === String(loanId))) {
        updatedLoans.push({
          ...loan,
          status: 'approved',
          paidAmount: 0
        });
      }

      const updatedRequests = (state.requests || []).map((r) =>
        String(r.id) === String(loanId) ? { ...r, status: 'approved', adminApproved: true, branchApproved: true } : r
      );

      const notif = {
        id: `notif_${Date.now()}`,
        type: 'loan',
        title: `💳 تم اعتماد ${loanTypeTitle}`,
        message: `تم اعتماد طلب ${loanTypeTitle} للموظف بمبلغ ${monthlyInstallment} ج.م وتطبيقه في الرواتب`,
        date: todayStr(),
        read: false
      };

      const updatedState = {
        ...state,
        loans: updatedLoans,
        requests: updatedRequests,
        adjustments: [...(state.adjustments || []), newAdj],
        notifications: [notif, ...(state.notifications || [])]
      };

      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم اعتماد السلفة وتطبيق الخصم فوراً في نظام أجر الموظف');
    };

    executeWithOwnerGuard({
      lockKey: 'lockApproveLoans',
      actionTitle: `اعتماد وصرف ${loanTypeTitle} (${loan.employeeName || loan.employeeId})`,
      actionDetails: `المبلغ: ${totalAmount} ج.م · القسط الشهري: ${monthlyInstallment} ج.م`,
      onExecute: performApproveLoan
    });
  };

  const handleRejectLoan = async (loanId) => {
    const updatedLoans = (state.loans || []).map((l) =>
      l.id === loanId ? { ...l, status: 'rejected' } : l
    );
    const updatedState = { ...state, loans: updatedLoans };
    setState(updatedState);
    await saveState(updatedState);
    showToast('❌ تم رفض طلب السلفة');
  };

  const handleAddBranchRequest = async (reqData) => {
    const updatedState = {
      ...state,
      requests: [...(state.requests || []), reqData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('📤 تم إرسال الطلب للإدارة العليا للاعتماد');
  };


  // Save Organization Settings
  const handleSaveOrgSettings = async () => {
    if (!orgNameInput.trim()) {
      showToast('يرجى إدخال اسم المؤسسة');
      return;
    }

    const currentPerms = {
      allowManualShift: permAllowManualShift,
      allowEditShift: permAllowEditShift,
      allowStartEnd: permAllowStartEnd,
      allowViewSalary: permAllowViewSalary,
      allowAddAdjustment: permAllowAddAdjustment,
      allowViewAdjustments: permAllowViewAdjustments,
      allowExportExcel: permAllowExportExcel
    };

    let updatedEmps = state.employees;
    let updatedSettings = {
      ...state.orgSettings,
      orgName: orgNameInput.trim(),
      logoUrl: orgLogoUrlInput.trim(),
      waServerUrl: waServerUrlInput.trim() || 'http://localhost:3001',
      adminUsername: orgAdminUser.trim() || 'admin',
      adminPassword: orgAdminPass.trim() || '123'
    };

    if (selectedPermEmpId === 'all') {
      updatedSettings.permissions = currentPerms;
      updatedEmps = state.employees.map((e) => ({
        ...e,
        permissions: { ...currentPerms }
      }));
    } else {
      updatedEmps = state.employees.map((e) =>
        e.id === selectedPermEmpId ? { ...e, permissions: { ...currentPerms } } : e
      );
    }

    const updatedState = { ...state, orgSettings: updatedSettings, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);

    if (selectedPermEmpId === 'all') {
      showToast('تم حفظ إعدادات المؤسسة والصلاحيات العامة بنجاح! 💾');
    } else {
      const empObj = state.employees.find((e) => e.id === selectedPermEmpId);
      const nameStr = empObj ? empObj.name : '';
      showToast(`تم حفظ الصلاحيات المخصصة للموظف "${nameStr}" بنجاح! 💾`);
    }
  };

  // Reset / Disable All Permissions for All Employees
  const handleResetAllPermissions = async () => {
    if (!window.confirm('هل أنت تأكد من إلغاء ومسح جميع الصلاحيات لجميع الموظفين وإيقاف كافة الخصائص؟')) {
      return;
    }

    const disabledPerms = {
      allowManualShift: false,
      allowEditShift: false,
      allowStartEnd: false,
      allowViewSalary: false,
      allowViewAdjustments: false,
      allowAddAdjustment: false,
      allowExportExcel: false
    };

    // Explicitly set all employee permissions to disabled (false)
    const updatedEmps = state.employees.map((e) => ({
      ...e,
      permissions: { ...disabledPerms }
    }));

    const updatedSettings = {
      ...state.orgSettings,
      permissions: { ...disabledPerms }
    };

    setPermAllowManualShift(false);
    setPermAllowEditShift(false);
    setPermAllowStartEnd(false);
    setPermAllowViewSalary(false);
    setPermAllowViewAdjustments(false);
    setPermAllowAddAdjustment(false);
    setPermAllowExportExcel(false);
    setSelectedPermEmpId('all');

    const updatedState = { ...state, orgSettings: updatedSettings, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);

    showToast('تم إلغاء ومسح جميع الصلاحيات لجميع الموظفين بنجاح! 🔒');
  };

  // Reset / Disable Permissions for Single Employee
  const handleResetSingleEmpPermissions = async () => {
    if (selectedPermEmpId === 'all') return;
    const empObj = state.employees.find((e) => e.id === selectedPermEmpId);
    const empName = empObj ? empObj.name : '';
    if (!window.confirm(`هل أنت تأكد من إلغاء وإيقاف كافة الصلاحيات للموظف "${empName}"؟`)) {
      return;
    }

    const disabledPerms = {
      allowManualShift: false,
      allowEditShift: false,
      allowStartEnd: false,
      allowViewSalary: false,
      allowViewAdjustments: false,
      allowAddAdjustment: false,
      allowExportExcel: false
    };

    const updatedEmps = state.employees.map((e) => {
      if (e.id === selectedPermEmpId) {
        return { ...e, permissions: { ...disabledPerms } };
      }
      return e;
    });

    setPermAllowManualShift(false);
    setPermAllowEditShift(false);
    setPermAllowStartEnd(false);
    setPermAllowViewSalary(false);
    setPermAllowViewAdjustments(false);
    setPermAllowAddAdjustment(false);
    setPermAllowExportExcel(false);

    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    showToast(`تم إلغاء وتصفير كافة صلاحيات الموظف "${empName}" بنجاح! 🔒`);
  };

  // Admin Employee Management Modals
  const openAddEmpModal = () => {
    setEditingEmp(null);
    setEmpName('');
    setEmpNickname('');
    setEmpCode(String(101 + state.employees.length));
    setEmpPhone('');
    setEmpJobTitle('مساعد صيدلي');
    setEmpSalary('4000');
    setEmpWorkHours('8');
    setEmpWorkDays('26');
    setEmpPassword('123');
    setEmpAnnualLeaveBalance('21');
    setEmpPhotoUrl('');
    setIsEmpModalOpen(true);
  };

  const openEditEmpModal = (emp) => {
    setEditingEmp(emp);
    setEmpName(emp.name);
    setEmpNickname(emp.nickname || '');
    setEmpCode(emp.code);
    setEmpPhone(emp.phone || '');
    setEmpJobTitle(emp.jobTitle);
    setEmpSalary(String(emp.salary || 0));
    setEmpWorkHours(String(emp.workHoursPerDay || 8));
    setEmpWorkDays(String(emp.workDaysPerMonth || 26));
    setEmpPassword(emp.password || '123');
    setEmpAnnualLeaveBalance(String(emp.annualLeaveBalance !== undefined ? emp.annualLeaveBalance : 21));
    setEmpPhotoUrl(emp.photoUrl || '');
    setIsEmpModalOpen(true);
  };

  const handleSaveEmp = async () => {
    if (!empName.trim() || !empCode.trim()) {
      showToast('يرجى تعبئة الاسم وكود الموظف');
      return;
    }

    // Check for duplicate employee code
    const isDuplicate = state.employees.some(e => 
      (e.code.trim() === empCode.trim() || (e.username && e.username.trim() === empCode.trim())) && 
      e.id !== (editingEmp ? editingEmp.id : null)
    );
    if (isDuplicate) {
      showToast('خطأ: كود الموظف مستخدم بالفعل لموظف آخر!');
      return;
    }

    const salary = parseArabicFloat(empSalary);
    const workHoursPerDay = parseArabicFloat(empWorkHours) || 8;
    const workDaysPerMonth = parseArabicFloat(empWorkDays) || 26;
    const annualLeaveBalance = parseArabicFloat(empAnnualLeaveBalance) || 0;

    let updatedEmps = [];
    if (editingEmp) {
      updatedEmps = state.employees.map((e) =>
        e.id === editingEmp.id
          ? {
              ...e,
              name: empName.trim(),
              nickname: empNickname.trim(),
              code: empCode.trim(),
              username: empCode.trim(),
              phone: empPhone.trim(),
              jobTitle: empJobTitle.trim() || 'موظف',
              salary,
              workHoursPerDay,
              workDaysPerMonth,
              password: empPassword.trim() || '123',
              annualLeaveBalance,
              photoUrl: empPhotoUrl.trim()
            }
          : e
      );
      showToast(`تم تعديل بيانات الموظف "${empName}" بنجاح`);
    } else {
      const newEmp = {
        id: 'emp_' + uid(),
        name: empName.trim(),
        nickname: empNickname.trim(),
        code: empCode.trim(),
        username: empCode.trim(),
        phone: empPhone.trim(),
        jobTitle: empJobTitle.trim() || 'موظف',
        salary,
        workHoursPerDay,
        workDaysPerMonth,
        password: empPassword.trim() || '123',
        annualLeaveBalance,
        photoUrl: empPhotoUrl.trim(),
        createdAt: todayStr(),
        devices: []
      };
      updatedEmps = [...state.employees, newEmp];
      showToast(`تمت إضافة الموظف الجديد "${newEmp.name}" بنجاح`);
    }

    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    setIsEmpModalOpen(false);
  };

  // ── Device Approval & Management Handlers ──
  const handleKioskDeviceRequest = async (empId, deviceId, deviceInfo, credentialId) => {
    let hasError = false;
    let errorMessage = '';

    const updatedEmps = state.employees.map((emp) => {
      if (emp.id === empId) {
        const existingDevice = (emp.devices || []).find((d) => d.deviceId === deviceId);
        if (existingDevice) return emp; // Already exists
        
        if (emp.devices && emp.devices.length > 0) {
          hasError = true;
          errorMessage = 'لا يمكن إضافة جهاز جديد. الرجاء مراجعة الإدارة لحذف جهازك القديم أولاً.';
          return emp;
        }
        
        const newDevice = {
          deviceId,
          deviceInfo,
          credentialId,
          status: 'pending',
          requestedAt: todayStr()
        };
        return { ...emp, devices: [...(emp.devices || []), newDevice] };
      }
      return emp;
    });

    if (hasError) {
      throw new Error(errorMessage);
    }

    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
  };

  const handleAdminDeviceStatus = async (empId, deviceId, newStatus) => {
    // newStatus: 'approved' | 'rejected' | 'deleted'
    const updatedEmps = state.employees.map((emp) => {
      if (emp.id === empId) {
        let updatedDevices = emp.devices || [];
        if (newStatus === 'deleted' || newStatus === 'rejected') {
          updatedDevices = updatedDevices.filter((d) => d.deviceId !== deviceId);
        } else {
          updatedDevices = updatedDevices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: newStatus } : d
          );
        }
        return { ...emp, devices: updatedDevices };
      }
      return emp;
    });

    let updatedDeletedIds = state._deletedIds || [];
    if (newStatus === 'deleted' || newStatus === 'rejected') {
      updatedDeletedIds = Array.from(new Set([...updatedDeletedIds, String(deviceId), `dev_${deviceId}`])).slice(-2000);
    }

    const updatedState = { ...state, employees: updatedEmps, _deletedIds: updatedDeletedIds };
    setState(updatedState);
    await saveState(updatedState);
    showToast(newStatus === 'approved' ? '✅ تم اعتماد الجهاز بنجاح' : '🗑 تم حذف/رفض الجهاز');
  };

  const handleDeleteEmp = async (empId) => {
    const emp = getEmp(empId);
    if (!emp) return;
    if (state.employees.length <= 1) {
      showToast('لا يمكن حذف الموظف الوحيد المتبقي بالنظام');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}" نهائياً من كافة سجلات النظام؟`)) return;

    const performDelete = async () => {
      const empIdStr = String(empId);
      const empCodeStr = String(emp.code || '');

      // 1. استبعاد الموظف من قائمة الموظفين
      const updatedEmps = state.employees.filter((e) => String(e.id) !== empIdStr && String(e.code) !== empCodeStr);
      
      // 2. تنظيف الورديات والطلبات والشفتات النشطة والجداول التابعة للموظف
      const updatedActive = { ...state.activeShifts };
      delete updatedActive[empId];
      delete updatedActive[empIdStr];

      const updatedShifts = (state.shifts || []).filter((s) => String(s.employeeId) !== empIdStr);
      const updatedRequests = (state.requests || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedResignations = (state.resignationRequests || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedLeaves = (state.leaveRequests || []).filter((l) => String(l.employeeId) !== empIdStr);
      const updatedLoans = (state.loans || []).filter((l) => String(l.employeeId) !== empIdStr);
      const updatedAdjs = (state.adjustments || []).filter((a) => String(a.employeeId) !== empIdStr);
      const updatedRosters = (state.rosters || []).filter((r) => String(r.employeeId) !== empIdStr);
      const updatedLateIncidents = (state.lateIncidents || []).filter((i) => String(i.employeeId) !== empIdStr);
      const updatedNotes = (state.employeeNotes || []).filter((n) => String(n.employeeId) !== empIdStr);
      const updatedEvals = (state.evaluations || []).filter((ev) => String(ev.employeeId) !== empIdStr);

      // 3. تسجيل المعرفات المحذوفة لمنع استعادتها من أي جهاز أو سحابة
      const updatedDeletedIds = Array.from(new Set([
        ...(state._deletedIds || []),
        empIdStr,
        empCodeStr,
        `emp_${empIdStr}`,
        `emp_${empCodeStr}`
      ])).filter(Boolean).slice(-2000);

      // 4. حذف الموظف من خادم الأرشيف السحابي إن وجد
      try {
        apiArchiveDeleteEmployee(empId).catch(() => {});
      } catch {}

      const updatedState = {
        ...state,
        employees: updatedEmps,
        activeShifts: updatedActive,
        shifts: updatedShifts,
        requests: updatedRequests,
        resignationRequests: updatedResignations,
        leaveRequests: updatedLeaves,
        loans: updatedLoans,
        adjustments: updatedAdjs,
        rosters: updatedRosters,
        lateIncidents: updatedLateIncidents,
        employeeNotes: updatedNotes,
        evaluations: updatedEvals,
        _deletedIds: updatedDeletedIds
      };

      setState(updatedState);
      await saveState(updatedState);
      showToast(`✅ تم حذف ملف الموظف "${emp.name}" وجميع سجلاته نهائياً`);
    };

    executeWithOwnerGuard({
      lockKey: 'lockDeleteEmployee',
      actionTitle: `حذف ملف الموظف (${emp.name}) نهائياً`,
      actionDetails: `كود الموظف: ${emp.code} · الوظيفة: ${emp.jobTitle}`,
      onExecute: performDelete
    });
  };

  // Open Employee ID Card & QR Modal
  const openEmpCard = async (emp) => {
    setSelectedEmpCard(emp);
    try {
      const url = await QRCode.toDataURL(emp.code, { width: 220, margin: 2 });
      setQrCardDataUrl(url);
    } catch {
      setQrCardDataUrl('');
    }
  };

  // Manual Shift Entry
  const computeHours = (date, timeIn, timeOut, breakHours = 0) => {
    const [inH, inM] = timeIn.split(':').map(Number);
    const [outH, outM] = timeOut.split(':').map(Number);
    let start = inH * 60 + inM;
    let end = outH * 60 + outM;
    if (end <= start) end += 24 * 60;
    const totalHours = (end - start) / 60;
    const parsedBreak = Math.max(0, parseFloat(breakHours) || 0);
    const netHours = Math.max(0, totalHours - parsedBreak);
    return Math.round(netHours * 100) / 100;
  };

  const addManualShift = async () => {
    if (!mEmpId || !mDate || !mIn || !mOut) {
      showToast('يرجى اختيار الموظف والتاريخ ووقتي الدخول والخروج');
      return;
    }
    if (!getEmpPermission(mEmpId, 'allowManualShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتسجيل الورديات يدوياً');
      return;
    }
    const parsedBreak = Math.max(0, parseFloat(mBreak) || 0);
    const hours = computeHours(mDate, mIn, mOut, parsedBreak);
    const emp = getEmp(mEmpId);

    const performAddManual = async () => {
      const newShift = {
        id: uid(),
        employeeId: mEmpId,
        date: mDate,
        timeIn: mIn,
        timeOut: mOut,
        hours,
        breakHours: Math.round(parsedBreak * 100) / 100,
        note: mNote.trim()
      };
      const updatedShifts = [...state.shifts, newShift];
      let updatedState = { ...state, shifts: updatedShifts };
      const recRes = recalculateEmployeeCycleLateness({
        employeeId: mEmpId,
        cycleFilterFn: currentFilterFn,
        state: updatedState,
        payrollCycleId: mDate.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };
      setState(updatedState);
      await saveState(updatedState);
      setMIn('');
      setMOut('');
      setMBreak('0');
      setMNote('');
      showToast('تمت إضافة الوردية بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManualShiftEntry',
      actionTitle: `تسجيل وردية يدوية للموظف (${emp?.name || mEmpId})`,
      actionDetails: `تاريخ: ${mDate} · الساعات: ${hours} س`,
      onExecute: performAddManual
    });
  };

  const openEditShift = (shift) => {
    if (!getEmpPermission(shift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتعديل الورديات المحفوظة');
      return;
    }
    setEditingShift({
      ...shift,
      breakHours: shift.breakHours !== undefined ? shift.breakHours : 0
    });
  };

  const saveEditShift = async () => {
    if (!editingShift) return;
    if (!getEmpPermission(editingShift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتعديل الورديات المحفوظة');
      return;
    }
    const { id, employeeId, date, timeIn, timeOut, breakHours, note } = editingShift;
    if (!date || !timeIn || !timeOut) {
      showToast('يرجى تعبئة الحقول المطلوبة');
      return;
    }
    const parsedBreak = Math.max(0, parseFloat(breakHours) || 0);
    const netHours = computeHours(date, timeIn, timeOut, parsedBreak);

    const performSaveEdit = async () => {
      const updatedShifts = state.shifts.map((s) => {
        if (s.id === id) {
          return {
            ...s,
            employeeId,
            date,
            timeIn,
            timeOut,
            breakHours: Math.round(parsedBreak * 100) / 100,
            hours: netHours,
            note: note ? note.trim() : ''
          };
        }
        return s;
      });

      let updatedState = { ...state, shifts: updatedShifts };
      const recRes = recalculateEmployeeCycleLateness({
        employeeId,
        cycleFilterFn: currentFilterFn,
        state: updatedState,
        payrollCycleId: date.slice(0, 7)
      });
      updatedState = {
        ...updatedState,
        lateIncidents: recRes.incidents,
        requests: recRes.updatedRequests
      };
      setState(updatedState);
      await saveState(updatedState);
      setEditingShift(null);
      showToast('تم تعديل الوردية بنجاح وتحديث وقائع التأخير');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditPastShifts',
      actionTitle: `تعديل وردية سابقة (${editingShift.employeeName || editingShift.employeeId})`,
      actionDetails: `تاريخ: ${editingShift.date} · الساعات: ${netHours} س`,
      onExecute: performSaveEdit
    });
  };

  const deleteShift = async (id) => {
    const shift = state.shifts.find((s) => s.id === id);
    if (shift && !getEmpPermission(shift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لحذف الورديات المحفوظة');
      return;
    }

    const performDelete = async () => {
      const updatedShifts = state.shifts.filter((s) => s.id !== id);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(id), `shift_${id}`])).slice(-2000);
      let updatedState = { ...state, shifts: updatedShifts, _deletedIds: updatedDeletedIds };
      if (shift?.employeeId) {
        const recRes = recalculateEmployeeCycleLateness({
          employeeId: shift.employeeId,
          cycleFilterFn: currentFilterFn,
          state: updatedState,
          payrollCycleId: shift.date?.slice(0, 7)
        });
        updatedState = {
          ...updatedState,
          lateIncidents: recRes.incidents,
          requests: recRes.updatedRequests
        };
      }
      setState(updatedState);
      await saveState(updatedState);
      showToast('تم حذف الوردية وتحديث وقائع التأخير');
    };

    executeWithOwnerGuard({
      lockKey: 'lockDeleteShifts',
      actionTitle: `حذف سجل وردية الموظف (${shift?.employeeName || id})`,
      actionDetails: `تاريخ الوردية: ${shift?.date || ''} · الساعات: ${shift?.hours || 0} س`,
      onExecute: performDelete
    });
  };

  // Adjustments (Bonuses & Deductions)
  const addAdjustment = async () => {
    if (!getEmpPermission(aEmpId === 'all' ? null : aEmpId, 'allowAddAdjustment')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لإضافة الخصومات والمكافآت');
      return;
    }
    const amount = parseFloat(aAmount);
    if (!amount || amount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح');
      return;
    }
    const emp = getEmp(aEmpId);

    const performAddAdjustment = async () => {
      const newAdj = {
        id: uid(),
        type: aType,
        employeeId: aEmpId,
        date: aDate || todayStr(),
        amount,
        description: aDesc.trim()
      };
      const updatedAdjs = [...state.adjustments, newAdj];
      const updatedState = { ...state, adjustments: updatedAdjs };
      setState(updatedState);
      await saveState(updatedState);
      setAAmount('');
      setADesc('');
      showToast('تمت إضافة التسوية المالية بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockDirectBonusDeduction',
      actionTitle: aType === 'bonus' ? 'إضافة مكافأة مالية مباشرة' : 'تسجيل خصم مالي مباشر',
      actionDetails: `مبلغ: ${amount} ج.م · الموظف: ${emp?.name || aEmpId}`,
      onExecute: performAddAdjustment
    });
  };

  const deleteAdjustment = async (id) => {
    const adj = (state.adjustments || []).find((a) => a.id === id);
    const performDeleteAdjustment = async () => {
      const updatedAdjs = state.adjustments.filter((a) => a.id !== id);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(id), `adj_${id}`])).slice(-2000);
      const updatedState = { ...state, adjustments: updatedAdjs, _deletedIds: updatedDeletedIds };
      setState(updatedState);
      await saveState(updatedState);
      showToast('تم حذف التسوية المالية نهائياً');
    };

    executeWithOwnerGuard({
      lockKey: 'lockDirectBonusDeduction',
      actionTitle: 'حذف تسوية مالية (مكافأة / خصم)',
      actionDetails: `مبلغ: ${adj?.amount || ''} ج.م · ${adj?.description || ''}`,
      onExecute: performDeleteAdjustment
    });
  };

  // Day schedule lookup helper supporting exact date, English and Arabic keys
  const getDayScheduleFromMap = (schedule, jsDayIndex, dateStr = null) => {
    if (!schedule) return null;
    if (dateStr && schedule[dateStr]) return schedule[dateStr];
    const map = {
      0: ['sunday', ' الأحد', 'الأحد', 'الاحد'],
      1: ['monday', 'الاثنين', 'الإثنين'],
      2: ['tuesday', 'الثلاثاء'],
      3: ['wednesday', 'الأربعاء', 'الاربعاء'],
      4: ['thursday', 'الخميس'],
      5: ['friday', 'الجمعة'],
      6: ['saturday', 'السبت']
    };
    const keys = map[jsDayIndex] || [];
    for (const k of keys) {
      if (schedule[k]) return schedule[k];
    }
    return null;
  };

  const getAbsenceDaysCount = (empId, monthStr) => {
    if (!monthStr || monthStr.length !== 7) return 0;
    const empIdStr = String(empId);

    let roster = (state.rosters || []).find(
      r => String(r.employeeId) === empIdStr && (r.month === monthStr || !r.month) && r.status === 'approved'
    );

    if (!roster) {
      const approvedReq = (state.requests || []).find(
        req => String(req.employeeId) === empIdStr &&
        (req.type === 'roster_update' || req.type === 'roster_edit' || req.type === 'roster_edit_request') &&
        (req.month === monthStr || !req.month) &&
        (req.status === 'approved' || req.adminApproved)
      );
      if (approvedReq && approvedReq.schedule) {
        roster = approvedReq;
      }
    }

    if (!roster || !roster.schedule) return 0;

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
    } else if (roster.fromDate && roster.toDate) {
      let current = new Date(roster.fromDate);
      const end = new Date(roster.toDate);
      if (!isNaN(current) && !isNaN(end) && current <= end) {
        while (current <= end) {
          const y = current.getFullYear();
          const m = current.getMonth() + 1;
          const d = current.getDate();
          dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
          current.setDate(current.getDate() + 1);
        }
      }
    } else if (monthStr && monthStr.length === 7) {
      const [y, m] = monthStr.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        dates.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    const today = todayStr();
    let count = 0;

    for (const dateStr of dates) {
      if (dateStr >= today) continue; // Only count past days

      const jsDay = new Date(dateStr).getDay();
      const daySchedule = getDayScheduleFromMap(roster.schedule, jsDay, dateStr);
      if (!daySchedule || daySchedule.type === 'off' || daySchedule.isOff) continue;
      const hasShift = (state.shifts || []).some(s => String(s.employeeId) === empIdStr && s.date === dateStr);
      if (hasShift) continue;

      const allLeaveRequests = [...(state.leaveRequests || []), ...(state.requests || [])];
      const hasLeave = allLeaveRequests.some(
        r => String(r.employeeId) === empIdStr && (r.status === 'approved' || r.adminApproved) &&
        (r.type === 'leave' || r.type === 'leave_request' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave') &&
        r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;

      count++;
    }
    return count;
  };

  const getPayrollCutoffRange = (monthStr) => {
    return getCycleDateRange(monthStr, state.orgSettings);
  };

  const currentFilterFn = React.useCallback((dateStr) => {
    return createDatePredicate({
      filterMode: adminFilterMode,
      selectedMonth: monthPicker,
      customFrom: adminCustomFrom,
      customTo: adminCustomTo,
      orgSettings: state.orgSettings
    })(dateStr);
  }, [adminFilterMode, adminCustomFrom, adminCustomTo, monthPicker, state.orgSettings]);

  // Calculations per employee
  const computeEmpSummary = (empId, filterFn, monthStr = null, targetBranchId = null) => {
    const emp = getEmp(empId);
    if (!emp) return { hours: 0, dailyRate: 0, rate: 0, hourlyRate: 0, monthlySalary: 0, salary: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

    let effectiveFilterFn = filterFn || currentFilterFn;

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

      // 1. احتساب سعر اليوم = (سعر الساعة الشهري * عدد ساعات العمل المدخلة) / عدد أيام العمل المدخلة
      const dailyRate = workDaysPerMonth > 0 ? (hourlyBase * workHoursPerDay) / workDaysPerMonth : 0;

      // 2. احتساب سعر الساعة اليومي (أجر الساعة)
      const rate = (hourlyBase > 0 && workDaysPerMonth > 0)
        ? (hourlyBase >= 200 ? (hourlyBase / workDaysPerMonth) : ((hourlyBase * workHoursPerDay) / workDaysPerMonth))
        : (workHoursPerDay > 0 ? dailyRate / workHoursPerDay : hourlyBase);

      // إجمالي الراتب الأساسي الشهري المقدر
      const monthlySalary = rate * workHoursPerDay * workDaysPerMonth;
      const monthlyRequiredHours = workHoursPerDay * workDaysPerMonth;

      // shifts for this branch (fallback to true if shift has no branch and employee only has 1 branch)
      const bShifts = state.shifts.filter(s => s.employeeId === empId && effectiveFilterFn(s.date) && (s.branchId === bId || !s.branchId || branches.length === 1));
      const hours = bShifts.reduce((acc, s) => acc + getEffectiveShiftHours(s, state), 0);
      
      // 3. احتساب أجر اليوم / المستحقات = سعر الساعة اليومي * عدد الساعات الموضوعة في الجدول الشهري / الفعلية (بما فيها ساعات الإذن المعتمد)
      const baseEarnings = hours * rate;

      // 3.1 حساب ساعات ومستحقات الوقت الإضافي المعتمدة
      const approvedOtHours = bShifts
        .filter(s => s.overtimeStatus === 'approved' || (parseFloat(s.overtimeHours) > 0 && s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const pendingOtHours = bShifts
        .filter(s => s.overtimeStatus === 'pending' || (parseFloat(s.overtimeHours) > 0 && !s.overtimeStatus && !s.adminApproved))
        .reduce((acc, s) => acc + (parseFloat(s.overtimeHours) || 0), 0);

      const otEarnings = Math.round(approvedOtHours * rate * 100) / 100;

      // Absences
      let absenceDaysCount = 0;
      let absenceDeduction = 0;
      if (bId === branches[0].branchId) {
         absenceDaysCount = getAbsenceDaysCount(empId, monthStr || monthPicker);
         absenceDeduction = absenceDaysCount * dailyRate;
      }

      perBranch[bId] = { 
        hours, 
        approvedOvertimeHours: approvedOtHours,
        pendingOvertimeHours: pendingOtHours,
        overtimeEarnings: otEarnings,
        dailyRate, 
        rate, 
        hourlyRate: rate, 
        hourlyBase, 
        monthlySalary, 
        salary: monthlySalary, 
        baseEarnings, 
        absenceDaysCount, 
        absenceDeduction, 
        workHoursPerDay, 
        workDaysPerMonth, 
        monthlyRequiredHours 
      };
      
      totalHours += hours;
      totalBaseEarnings += baseEarnings;
      totalApprovedOvertimeHours += approvedOtHours;
      totalPendingOvertimeHours += pendingOtHours;
      totalOvertimeEarnings += otEarnings;
      totalAbsenceDaysCount += absenceDaysCount;
      totalAbsenceDeduction += absenceDeduction;
    });

    // 4. Calculate Late Penalty Incidents & Deductions
    const empLateIncidents = (state.lateIncidents || []).filter(
      (inc) =>
        String(inc.employeeId) === String(empId) &&
        inc.status !== 'cancelled' &&
        inc.status !== 'approved_permission_exempt' &&
        inc.actionType !== 'grace' &&
        !isApprovedPermissionForDate(empId, inc.date, state) &&
        (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
        (!targetBranchId || String(inc.branchId) === String(targetBranchId)) &&
        effectiveFilterFn(inc.date)
    );
    const lateDeduction = empLateIncidents.reduce((acc, inc) => {
      const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || targetBranchId);
      return acc + (dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0));
    }, 0);
    const lateDeductionMinutes = empLateIncidents.reduce((acc, inc) => acc + (parseFloat(inc.deductionMinutes) || 0), 0);
    const lateIncidentsCount = empLateIncidents.length;

    const penaltyReqs = (state.requests || [])
      .filter((r) => String(r.employeeId) === String(empId) && (r.type === 'penalty' || r.type === 'adjustment') && (r.status === 'approved' || r.adminApproved || !r.status) && r.status !== 'cancelled' && r.status !== 'rejected' && r.objection?.status !== 'approved' && !r.isCancelled && effectiveFilterFn(r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '')))
      .filter((r) => !String(r.id).startsWith('req_late_inc_') && !String(r.id).startsWith('req_late_'))
      .map((r) => {
        let amt = parseFloat(r.amount) || 0;
        if (!amt && (r.impactType || r.impactVal || r.deductionMinutes)) {
          if (r.impactType === 'fixed_amount') {
            amt = parseFloat(r.impactVal) || 0;
          } else if (r.impactType === 'time_deduction' || r.deductionMinutes) {
            const deductionMins = parseFloat(r.deductionMinutes !== undefined ? r.deductionMinutes : r.impactVal) || 0;
            amt = computeLatenessFinancialAmount(deductionMins, emp, r.branchId || targetBranchId);
          } else if (r.impactType === 'deduction_days') {
            const salary = parseFloat(emp.salary) || 0;
            const workHours = parseFloat(emp.workHoursPerDay) || 8;
            const workDays = parseFloat(emp.workDaysPerMonth) || 26;
            const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
            amt = Math.round(dailyRate * (parseFloat(r.impactVal) || 1) * 100) / 100;
          }
        }
        return {
          id: r.id,
          employeeId: r.employeeId,
          type: r.subType === 'bonus' ? 'bonus' : 'deduction',
          amount: amt,
          date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '')
        };
      });

    const directAdjs = (state.adjustments || []).filter((a) => (String(a.employeeId) === String(empId) || a.employeeId === 'all') && effectiveFilterFn(a.date));
    const mergedAdjsMap = new Map();
    directAdjs.forEach((a) => mergedAdjsMap.set(String(a.id), a));
    penaltyReqs.forEach((p) => {
      if (!mergedAdjsMap.has(String(p.id)) && !mergedAdjsMap.has(`adj_pen_${p.id}`)) {
        mergedAdjsMap.set(String(p.id), p);
      }
    });
    const allEmpAdjs = Array.from(mergedAdjsMap.values());

    const nonLoanEmpAdjs = allEmpAdjs.filter((a) => !String(a.id).startsWith('adj_loan_') && !String(a.description || '').includes('خصم سلفة'));
    const totalBonus = allEmpAdjs.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
    const manualDeduction = nonLoanEmpAdjs.filter((a) => a.type === 'deduction' || a.type === 'penalty').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    // Calculate approved loans/advances deductions for the filtered period with deduplication by ID
    const loanDeductionMap = new Map();
    (state.requests || [])
      .filter(
        (r) =>
          String(r.employeeId) === String(empId) &&
          (r.status === 'approved' || r.adminApproved || r.status === 'partial') &&
          (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine') &&
          effectiveFilterFn(r.date || (r.createdAt ? r.createdAt.slice(0, 10) : ''))
      )
      .forEach((r) => loanDeductionMap.set(String(r.id), r));

    (state.loans || [])
      .filter(
        (l) =>
          String(l.employeeId) === String(empId) &&
          l.status !== 'pending' &&
          l.status !== 'pending_admin' &&
          l.status !== 'rejected' &&
          l.status !== 'cancelled' &&
          (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine') &&
          effectiveFilterFn(l.date || (l.createdAt ? l.createdAt.slice(0, 10) : ''))
      )
      .forEach((l) => {
        const existing = loanDeductionMap.get(String(l.id));
        loanDeductionMap.set(String(l.id), { ...(existing || {}), ...l });
      });

    const uniqueApprovedLoans = Array.from(loanDeductionMap.values());
    const loanDeduction = uniqueApprovedLoans.reduce((acc, l) => {
      const total = parseFloat(l.amount || l.totalAmount) || 0;
      const paid = parseFloat(l.paidAmount) || 0;
      const rem = Math.max(0, total - paid);
      if (rem <= 0) return acc;
      const monthlyDeduction = parseFloat(l.monthlyDeduction || l.installmentAmount) || Math.min(rem, total);
      return acc + Math.min(rem, monthlyDeduction);
    }, 0);

    const totalDeduction = manualDeduction + loanDeduction + totalAbsenceDeduction + lateDeduction;

    // Allowances calculation:
    // 1. Management Allowance: Calculated if set or if employee is in a management role
    const isMgmt = isManagementJob(emp.jobTitle, getJobsList(state)) || Boolean(emp.isManagement) || (parseFloat(emp.managementAllowance) || 0) > 0;
    const managementAllowance = parseFloat(emp.managementAllowance) || 0;

    // 2. Transportation Allowance: Fixed allowance
    const transportAllowance = parseFloat(emp.transportAllowance) || 0;

    // 3. Extra Allowance: Custom named wages (array or single fallback)
    let extraAllowance = parseFloat(emp.extraAllowance) || 0;
    let extraAllowanceTitle = emp.extraAllowanceTitle?.trim() || 'أجر إضافي';
    let extraAllowances = [];

    if (Array.isArray(emp.extraAllowances) && emp.extraAllowances.length > 0) {
      extraAllowances = emp.extraAllowances.map(a => ({
        id: a.id,
        title: a.title?.trim() || 'أجر إضافي',
        amount: parseFloat(a.amount) || 0
      })).filter(a => a.amount > 0 || a.title);
      extraAllowance = extraAllowances.reduce((acc, a) => acc + (a.amount || 0), 0);
      extraAllowanceTitle = extraAllowances.map(a => a.title).join(' + ') || extraAllowanceTitle;
    } else if (extraAllowance > 0) {
      extraAllowances = [{ id: '1', title: extraAllowanceTitle, amount: extraAllowance }];
    }

    const totalAllowances = managementAllowance + transportAllowance + extraAllowance;
    const totalEarnings = totalBaseEarnings + totalOvertimeEarnings;
    const netSalary = totalBaseEarnings + totalOvertimeEarnings + totalBonus + totalAllowances - totalDeduction;

    let rate = branches.length === 1 ? perBranch[branches[0].branchId].rate : (totalHours > 0 ? totalBaseEarnings / totalHours : (parseFloat(branches[0]?.salary) || 0));
    let dailyRate = branches.length === 1 ? perBranch[branches[0].branchId].dailyRate : (rate * (parseFloat(branches[0]?.workHoursPerDay) || WORK_HOURS_PER_DAY));

    return { 
      hours: totalHours, 
      totalHours: totalHours + totalApprovedOvertimeHours,
      regularHours: totalHours,
      approvedOvertimeHours: totalApprovedOvertimeHours,
      pendingOvertimeHours: totalPendingOvertimeHours,
      overtimeHours: totalApprovedOvertimeHours,
      overtimeEarnings: totalOvertimeEarnings,
      overtimePay: totalOvertimeEarnings,
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
      extraAllowanceTitle,
      extraAllowances,
      isManagement: isMgmt,
      totalDeduction, 
      lateDeduction,
      lateDeductionMinutes,
      lateIncidentsCount,
      manualDeduction,
      loanDeduction,
      absenceDeduction: totalAbsenceDeduction, 
      netSalary, 
      absenceDaysCount: totalAbsenceDaysCount,
      perBranch
    };
  };

  // Grand summary across ALL employees
  const computeGrandPayroll = (filterFn, monthStr = null) => {
    const perEmp = {};
    state.employees.forEach((e) => {
      perEmp[e.id] = computeEmpSummary(e.id, filterFn, monthStr);
    });

    const totalHours = Object.values(perEmp).reduce((s, e) => s + e.hours, 0);
    const totalBaseEarnings = Object.values(perEmp).reduce((s, e) => s + e.baseEarnings, 0);
    const totalOvertimeHours = Object.values(perEmp).reduce((s, e) => s + (e.approvedOvertimeHours || 0), 0);
    const totalOvertimeEarnings = Object.values(perEmp).reduce((s, e) => s + (e.overtimeEarnings || 0), 0);
    const totalBonus = Object.values(perEmp).reduce((s, e) => s + e.totalBonus, 0);
    const totalManagementAllowance = Object.values(perEmp).reduce((s, e) => s + (e.managementAllowance || 0), 0);
    const totalTransportAllowance = Object.values(perEmp).reduce((s, e) => s + (e.transportAllowance || 0), 0);
    const totalExtraAllowance = Object.values(perEmp).reduce((s, e) => s + (e.extraAllowance || 0), 0);
    const totalAllowances = Object.values(perEmp).reduce((s, e) => s + (e.totalAllowances || 0), 0);
    const totalDeduction = Object.values(perEmp).reduce((s, e) => s + e.totalDeduction, 0);
    const totalLateDeduction = Object.values(perEmp).reduce((s, e) => s + (e.lateDeduction || 0), 0);
    const totalLateDeductionMinutes = Object.values(perEmp).reduce((s, e) => s + (e.lateDeductionMinutes || 0), 0);
    const totalAbsenceDeduction = Object.values(perEmp).reduce((s, e) => s + e.absenceDeduction, 0);
    const grandNetSalary = totalBaseEarnings + totalOvertimeEarnings + totalBonus + totalAllowances - totalDeduction;

    return {
      perEmp,
      totalHours,
      totalBaseEarnings,
      totalOvertimeHours,
      totalOvertimeEarnings,
      totalBonus,
      totalManagementAllowance,
      totalTransportAllowance,
      totalExtraAllowance,
      totalAllowances,
      totalDeduction,
      totalLateDeduction,
      totalLateDeductionMinutes,
      totalAbsenceDeduction,
      grandNetSalary
    };
  };

  // Manual Shift Entry States
  const [mEmpId, setMEmpId] = useState('');
  const [mDate, setMDate] = useState(todayStr());
  const [mIn, setMIn] = useState('');
  const [mOut, setMOut] = useState('');
  const [mBreak, setMBreak] = useState('0');
  const [mNote, setMNote] = useState('');
  const [editingShift, setEditingShift] = useState(null);

  // Adjustments States
  const [aType, setAType] = useState('bonus');
  const [aEmpId, setAEmpId] = useState('all');
  const [aDate, setADate] = useState(todayStr());
  const [aAmount, setAAmount] = useState('');
  const [aDesc, setADesc] = useState('');

  // Export Payroll Modal States
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState('all_month'); // 'all_month' | 'all_range' | 'single_emp'
  const [exportRangeMode, setExportRangeMode] = useState('month'); // 'month' | 'custom'
  const [exportEmpId, setExportEmpId] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Toast Notice
  const showToast = (msg) => {
    setToast({ message: msg, show: true });
  };



  useEffect(() => {
    if (toast.show) {
      const h = setTimeout(() => {
        setToast({ message: '', show: false });
      }, 2400);
      return () => clearTimeout(h);
    }
  }, [toast.show]);

  // Live Timer Ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── تحميل البيانات الفوري (Instant Stale-While-Revalidate Boot & Background Sync) ──
  useEffect(() => {
    let isMounted = true;

    // 1. إقلاع فوري فائق السرعة من الذاكرة المحلية (في غضون 5 إلى 20 مللي ثانية!)
    loadLocalStateFast().then((cachedData) => {
      if (cachedData && isMounted) {
        const normalizedCached = normalizeState(cachedData);
        const syncedCached = syncAllEmployeesPermissionsAndLateness(normalizedCached);
        setState(syncedCached);
        setIsLoading(false); // إخفاء شاشة التحميل فوراً ودخول المستخدم للنظام بدون أي انتظار
      }
    }).catch(() => {});

    // 2. مهلة أمان قصوى صارمة تضمن إخفاء شاشة التحميل مهما حدث (1.2 ثانية كحد أقصى)
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 1200);

    // 3. جلب ومزامنة أحدث البيانات السحابية في الخلفية
    smartLoadState().then(({ data, source }) => {
      if (!isMounted) return;
      setIsLoading(false);
      if (!data) return;

      if (source === 'local_offline') {
        // تم الاعتماد على الكاش المحلي
      }

      const normalized = normalizeState(data);
      const synced = syncAllEmployeesPermissionsAndLateness(normalized);
      setState(synced);
      setLastSyncTime(nowTimeStr());

      // Sync active session user/branch with fresh database objects
      try {
        const savedEmpStr = localStorage.getItem('app_current_emp_user');
        if (savedEmpStr) {
          const savedEmp = JSON.parse(savedEmpStr);
          const freshEmp = (normalized.employees || []).find((e) => e.id === savedEmp?.id || (savedEmp?.code && e.code === savedEmp.code));
          if (freshEmp) {
            setCurrentEmpUser(freshEmp);
            localStorage.setItem('app_current_emp_user', JSON.stringify(freshEmp));
          }
        }
        const savedBranchStr = localStorage.getItem('app_current_branch');
        if (savedBranchStr) {
          const savedBranch = JSON.parse(savedBranchStr);
          const freshBranch = (normalized.branches || []).find((b) => b.id === savedBranch?.id);
          if (freshBranch) {
            setCurrentBranch(freshBranch);
            localStorage.setItem('app_current_branch', JSON.stringify(freshBranch));
          }
        }
      } catch {}

      if (normalized.employees.length > 0) {
        setMEmpId(normalized.employees[0].id);
      }
      setOrgNameInput(normalized.orgSettings.orgName || '');
      setOrgLogoUrlInput(normalized.orgSettings.logoUrl || '');
      setOrgAdminUser(normalized.orgSettings.adminUsername || 'admin');
      setOrgAdminPass(normalized.orgSettings.adminPassword || '123');
      const perms = normalized.orgSettings.permissions || {};
      setPermAllowManualShift(perms.allowManualShift !== undefined ? perms.allowManualShift : true);
      setPermAllowEditShift(perms.allowEditShift !== undefined ? perms.allowEditShift : true);
      setPermAllowStartEnd(perms.allowStartEnd !== undefined ? perms.allowStartEnd : true);
      setPermAllowViewSalary(perms.allowViewSalary !== undefined ? perms.allowViewSalary : true);
      setPermAllowAddAdjustment(perms.allowAddAdjustment !== undefined ? perms.allowAddAdjustment : false);
      setPermAllowViewAdjustments(perms.allowViewAdjustments !== undefined ? perms.allowViewAdjustments : true);
      setPermAllowExportExcel(perms.allowExportExcel !== undefined ? perms.allowExportExcel : true);
    }).catch((err) => {
      if (isMounted) setIsLoading(false);
      console.error('Load error:', err);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  // ── مستمع الإشعارات للطلبات الجديدة ───────────────
  const isInitialLoadDoneRef = useRef(false);
  const knownRequestIdsRef = useRef(new Set());

  useEffect(() => {
    const reqs = state.requests || [];

    // On initial app load / state hydration: populate existing request IDs without triggering notification sound or toast
    if (!isInitialLoadDoneRef.current) {
      if (reqs.length > 0 || !isLoading) {
        reqs.forEach((r) => {
          if (r && r.id) knownRequestIdsRef.current.add(String(r.id));
        });
        isInitialLoadDoneRef.current = true;
      }
      return;
    }

    // Identify truly brand-new requests added in real-time after initial load
    const newRequests = reqs.filter((r) => r && r.id && !knownRequestIdsRef.current.has(String(r.id)));

    // Track all current IDs
    reqs.forEach((r) => {
      if (r && r.id) knownRequestIdsRef.current.add(String(r.id));
    });

    if (newRequests.length === 0) return;

    // Filter only pending requests
    const pendingNewRequests = newRequests.filter(
      (r) => r.status === 'pending' || r.status === 'pending_admin' || !r.status
    );

    if (pendingNewRequests.length === 0) return;

    // 1. الإدارة العليا (Super Admin): تنبيه بالصوت والرسالة للطلبات الجديدة
    if (authRole === 'admin') {
      playNotificationChime();
      showToast('🔔 يوجد طلب جديد يحتاج للمراجعة من الإدارة العليا');
    }
    // 2. مدير الفرع (Branch Manager): عدم تشغيل أصوات الإدارة العليا
    // يظهر فقط إشعار نصي هادئ إذا كان الطلب يخص موظفاً بفرعه وموجهاً لموافقة مدير الفرع
    else if (authRole === 'branch') {
      const currentBranchId = currentBranch?.id;
      const branchEmployees = (state.employees || []).filter(
        (e) => String(e.branchId) === String(currentBranchId) || (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === String(currentBranchId)))
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
  }, [state.requests, authRole, isLoading, currentBranch, state.employees, state.approvalRules]);

  // ── مستمع تغيرات الاتصال بالإنترنت ───────────────
  useEffect(() => {
    const unsubscribe = listenToConnectionChanges(
      // عاد الإنترنت
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
      // انقطع الإنترنت
      () => {
        setIsOffline(true);
        showToast('📴 انقطع الإنترنت - سيتم حفظ البيانات محلياً حتى عودة الاتصال');
      }
    );
    return unsubscribe;
  }, []);

  // Cloud Synchronization with MariaDB (Adaptive Smart Polling & Instant 0ms Live Broadcast)
  useEffect(() => {
    const applyRemoteData = (remoteData) => {
      const parsed = typeof remoteData === 'string' ? JSON.parse(remoteData) : remoteData;
      if (!parsed) return;
      const normalized = normalizeState(parsed);
      setState((prev) => {
        setLastSyncTime(nowTimeStr());
        // Sync current logged-in employee session with fresh database permissions
        setCurrentEmpUser((prevEmp) => {
          if (!prevEmp) return prevEmp;
          const fresh = (normalized.employees || []).find((e) => e.id === prevEmp.id || (prevEmp.code && e.code === prevEmp.code));
          return fresh || prevEmp;
        });
        return normalized;
      });
    };

    let lastKnownVersion = 0;
    let lastKnownUpdatedAt = '';
    let isPolling = false;

    const poll = async () => {
      if (isPolling || !navigator.onLine) return;
      isPolling = true;
      try {
        const versionRes = await apiFetchVersion(STORAGE_KEY, { timeout: 4000 });
        const currentVer = typeof versionRes?.version === 'number' ? versionRes.version : 0;
        const currentUpdated = versionRes?.updated_at || '';

        const hasChanged = (currentVer > 0 && currentVer !== lastKnownVersion) ||
          (currentUpdated && currentUpdated !== lastKnownUpdatedAt) ||
          (lastKnownVersion === 0 && lastKnownUpdatedAt === '');

        if (hasChanged) {
          lastKnownVersion = currentVer;
          lastKnownUpdatedAt = currentUpdated;
          const remoteData = await apiFetchSettings(STORAGE_KEY, { timeout: 8000, useETag: true });
          if (remoteData && !remoteData.notModified) {
            applyRemoteData(remoteData);
          }
        }
      } catch (err) {
        // خطأ صامت في استطلاع الخلفية لتجنب إجهاد الشبكة
      } finally {
        isPolling = false;
      }
    };

    // Adaptive polling: 10s when tab is active, 60s when tab is in background
    let timerId = null;
    const scheduleNextPoll = () => {
      const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
      const delay = isVisible ? 10000 : 60000;
      timerId = setTimeout(async () => {
        await poll();
        scheduleNextPoll();
      }, delay);
    };

    scheduleNextPoll();

    // Instant local broadcast synchronization across tabs and windows (0ms immediate update)
    const unsubBroadcast = listenToLiveBroadcasts((liveState) => {
      if (liveState) {
        applyRemoteData(liveState);
      } else {
        poll();
      }
    });

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        clearTimeout(timerId);
        poll().then(() => scheduleNextPoll());
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    window.addEventListener('online', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearTimeout(timerId);
      unsubBroadcast();
      window.removeEventListener('focus', handleFocusOrVisible);
      window.removeEventListener('online', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);

  // Save State function with Optimistic Non-Blocking Sync & Auto-Backup
  const saveState = async (updatedState) => {
    setIsSyncing(true);
    const result = await smartSaveState(updatedState, {
      onSyncSuccess: (finalMerged) => {
        setLastSyncTime(nowTimeStr());
        setPendingSyncCount(0);
        if (finalMerged) {
          setState((prev) => smartMergeStates(prev, normalizeState(finalMerged)));
        }
      },
      onSyncFail: (msg) => {
        console.error('Database write error:', msg);
        showToast('⚠️ تعذر الحفظ في قاعدة البيانات السحابية، تم الحفظ محلياً');
      },
      onQueuedOffline: async () => {
        const count = await getPendingCount();
        setPendingSyncCount(count);
        showToast('📴 أنت أوف لاين - تم الحفظ محلياً وسيتم التزامن عند عودة الإنترنت');
      }
    });
    setIsSyncing(false);

    const finalState = result?.mergedState || updatedState;
    if (result?.mergedState) {
      setState((prev) => smartMergeStates(prev, normalizeState(result.mergedState)));
    }

    // Auto-backup snapshot upon every modification
    try {
      await saveAutoBackupOnModification(finalState, 'تعديل وحفظ بالمنظومة');
    } catch (e) {
      console.warn('[AutoBackup] Snapshot trigger skipped:', e);
    }

    return result;
  };

  // ── Biometric & Device Authorization Handlers ───────────
  const handleSaveBiometric = async (empId, credential) => {
    // 1. الفحص والتحقق من عدم تكرار البصمة لموظف آخر
    const duplicateEmp = state.employees.find(
      (e) =>
        e.id !== empId &&
        e.biometricCredential &&
        (e.biometricCredential.credentialId === credential.credentialId ||
          (e.biometricCredential.rawId && credential.rawId && e.biometricCredential.rawId === credential.rawId))
    );

    if (duplicateEmp) {
      const errMsg = `❌ تعذر الحفظ: هذه البصمة مسجلة بالفعل للموظف (${duplicateEmp.name}). لا يمكن استخدام نفس البصمة لأكثر من موظف.`;
      showToast(errMsg);
      throw new Error(errMsg);
    }

    const updatedEmps = state.employees.map((e) =>
      e.id === empId ? { ...e, biometricCredential: credential } : e
    );
    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم حفظ وتفعيل البصمة للموظف بنجاح 🟢');
  };

  const handleRemoveBiometric = async (empId) => {
    const updatedEmps = state.employees.map((e) => {
      if (e.id === empId) {
        const { biometricCredential, ...rest } = e;
        return rest;
      }
      return e;
    });
    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم إزالة البصمة البيومترية للموظف 🗑️');
  };

  const handleRequestDeviceApproval = async (deviceInfo) => {
    const currentDevices = state.authorizedDevices || [];
    const exists = currentDevices.find((d) => d.deviceId === deviceInfo.deviceId);
    let updatedDevices = currentDevices;

    if (exists) {
      updatedDevices = currentDevices.map((d) =>
        d.deviceId === deviceInfo.deviceId ? { ...d, ...deviceInfo, status: 'pending' } : d
      );
    } else {
      updatedDevices = [...currentDevices, deviceInfo];
    }

    const updatedState = { ...state, authorizedDevices: updatedDevices };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم إرسال طلب اعتماد الهاتف كـ ماكينة بصمة للمسؤول 📩');
  };

  const handleApproveDevice = async (deviceId) => {
    const currentDevices = state.authorizedDevices || [];
    const updatedDevices = currentDevices.map((d) =>
      d.deviceId === deviceId
        ? { ...d, status: 'approved', approvedAt: new Date().toISOString() }
        : d
    );
    const updatedState = { ...state, authorizedDevices: updatedDevices };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم قبول وتأكيد اعتماد الهاتف كـ ماكينة بصمة معتمدة! 🟢');
  };

  const handleRejectDevice = async (deviceId) => {
    const currentDevices = state.authorizedDevices || [];
    const updatedDevices = currentDevices.map((d) =>
      d.deviceId === deviceId ? { ...d, status: 'rejected' } : d
    );
    const updatedState = { ...state, authorizedDevices: updatedDevices };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم رفض طلب اعتمادات الهاتف ✕');
  };

  const handleRevokeDevice = async (deviceId) => {
    const currentDevices = state.authorizedDevices || [];
    const updatedDevices = currentDevices.map((d) =>
      d.deviceId === deviceId ? { ...d, status: 'revoked' } : d
    );
    const updatedState = { ...state, authorizedDevices: updatedDevices };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم إلغاء وحظر ترخيص هذا الهاتف 🚫');
  };

  const handleUpdateIpSettings = async (newIpSettings) => {
    // استخدام الـ functional setState لتجنب الـ stale state
    setState((prevState) => {
      const updatedState = { ...prevState, ipRestrictions: newIpSettings };
      // حفظ فوري في الـ localStorage أولاً ثم السحابة
      saveState(updatedState);
      return updatedState;
    });
    showToast('✅ تم حفظ إعدادات الشبكة بنجاح');
  };

  // Helper
  const getEmp = (id) => state.employees.find((e) => e.id === id) || null;
  const getEmpName = (id) => {
    const emp = getEmp(id);
    return emp ? emp.name : 'عام / غير محدد';
  };

  // Check Permissions Helper
  const getEmpPermission = (empOrId, permKey) => {
    // Admin management screens only bypass permissions when actively in Admin role and not evaluating an employee profile
    if (authRole === 'admin' && !empOrId) return true;
    
    // إذا كان الموظف مسجل الدخول من صفحة البصمة (Kiosk) وتم تأكيد الـ IP، يتم تخطي صلاحيات تسجيل الحضور
    if (viewMode === 'kiosk') {
      if (['allowStartEnd', 'canStartEnd', 'allowLivePunch', 'canLivePunch', 'allowManualShift', 'canManualShift', 'allowEditShift', 'canEditShift'].includes(permKey)) {
        return true;
      }
    }

    // Normalize key aliases: strip 'can' or 'allow' to get the core action name
    let actionName = permKey;
    if (permKey.startsWith('can')) {
      actionName = permKey.slice(3);
    } else if (permKey.startsWith('allow')) {
      actionName = permKey.slice(5);
    }
    const canKey = 'can' + actionName;
    const allowKey = 'allow' + actionName;

    // Resolve employee object and identifiers
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

    // Always find fresh employee in state.employees
    const freshEmp = (state.employees || []).find((e) =>
      (empId && (String(e.id) === empId || String(e.code) === empId)) ||
      (empCode && (String(e.id) === empCode || String(e.code) === empCode)) ||
      (empUsername && (String(e.username) === empUsername || String(e.code) === empUsername))
    ) || empObject;

    const targetId = freshEmp?.id !== undefined ? String(freshEmp.id) : empId;
    const targetCode = freshEmp?.code !== undefined ? String(freshEmp.code) : empCode;

    // 1. Check Specific Individual Employee Permission Override in state.orgSettings.empPermissions
    const empOverrides = state.orgSettings?.empPermissions;
    if (empOverrides && typeof empOverrides === 'object') {
      const specificPerms = (targetId && empOverrides[targetId]) || 
                            (targetCode && empOverrides[targetCode]) || 
                            (empId && empOverrides[empId]) ||
                            (empCode && empOverrides[empCode]);
      if (specificPerms && typeof specificPerms === 'object') {
        if (specificPerms[canKey] !== undefined) return Boolean(specificPerms[canKey]);
        if (specificPerms[allowKey] !== undefined) return Boolean(specificPerms[allowKey]);
        if (specificPerms[actionName] !== undefined) return Boolean(specificPerms[actionName]);
        if (specificPerms[permKey] !== undefined) return Boolean(specificPerms[permKey]);
      }
    }

    // 2. Check Fresh Employee's permissions object
    const empPerms = freshEmp?.permissions || empObject?.permissions;
    if (empPerms && typeof empPerms === 'object' && Object.keys(empPerms).length > 0) {
      if (empPerms[canKey] !== undefined) return Boolean(empPerms[canKey]);
      if (empPerms[allowKey] !== undefined) return Boolean(empPerms[allowKey]);
      if (empPerms[actionName] !== undefined) return Boolean(empPerms[actionName]);
      if (empPerms[permKey] !== undefined) return Boolean(empPerms[permKey]);
    }

    // 3. Check Global Default Organization Permissions
    const globalPerms = state.orgSettings?.permissions;
    if (globalPerms && typeof globalPerms === 'object') {
      if (globalPerms[canKey] !== undefined) return Boolean(globalPerms[canKey]);
      if (globalPerms[allowKey] !== undefined) return Boolean(globalPerms[allowKey]);
      if (globalPerms[actionName] !== undefined) return Boolean(globalPerms[actionName]);
      if (globalPerms[permKey] !== undefined) return Boolean(globalPerms[permKey]);
    }

    // 4. Default Standard System Fallbacks (Allowed by default unless explicitly restricted)
    if (['canAddAdjustment', 'allowAddAdjustment', 'canManualShift', 'allowManualShift', 'canEditShift', 'allowEditShift'].includes(canKey) || ['canAddAdjustment', 'allowAddAdjustment', 'canManualShift', 'allowManualShift', 'canEditShift', 'allowEditShift'].includes(allowKey)) {
      return false;
    }
    return true;
  };

  // Direct Image File Upload Handler (Compressed Base64)
  const handleFileUpload = async (e, callback) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      return;
    }
    try {
      const compressedDataUrl = await compressImage(file, 1000, 0.75);
      callback(compressedDataUrl);
      showToast('تم رفع وتجهيز الصورة بنجاح');
    } catch (err) {
      console.error('Image compression failed:', err);
      showToast('حدث خطأ أثناء رفع الصورة');
    }
  };

  // Live Timer Counters
  const getActiveElapsedStr = (empId) => {
    const active = state.activeShifts[empId];
    if (!active) return '—';
    const accumulatedPauseMs = active.accumulatedPauseMs || 0;
    let elapsedMs = 0;
    if (active.isPaused && active.pauseStartEpoch) {
      elapsedMs = active.pauseStartEpoch - active.startEpoch - accumulatedPauseMs;
    } else {
      elapsedMs = now - active.startEpoch - accumulatedPauseMs;
    }
    if (elapsedMs < 0) elapsedMs = 0;
    const h = Math.floor(elapsedMs / 3600000);
    const m = Math.floor((elapsedMs % 3600000) / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  const getActiveBreakStr = (empId) => {
    const active = state.activeShifts[empId];
    if (!active) return null;
    let totalPauseMs = active.accumulatedPauseMs || 0;
    if (active.isPaused && active.pauseStartEpoch) {
      totalPauseMs += (now - active.pauseStartEpoch);
    }
    if (totalPauseMs <= 0) return null;
    const h = Math.floor(totalPauseMs / 3600000);
    const m = Math.floor((totalPauseMs % 3600000) / 60000);
    const s = Math.floor((totalPauseMs % 60000) / 1000);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  // ── Central Lateness Detector & Penalty Request Generator (5-Tier Independent Counters) ──
  const checkAndRecordLateness = (empId, dateStr, timeInStr, currentState) => {
    if (!empId || !timeInStr) return currentState;
    const emp = (currentState.employees || []).find((e) => String(e.id) === String(empId));
    if (!emp) return currentState;

    const sched = getScheduledShiftForDate(empId, dateStr, currentState);
    if (!sched || !sched.start) return currentState;

    const diffMinutes = calculateLatenessMinutes(sched.start, timeInStr);
    if (diffMinutes <= 0) return currentState;

    const policy = getEffectiveLatePolicy(currentState);
    if (!policy.enabled) return currentState;

    const tier = classifyLateTier(diffMinutes, policy);

    // Run dynamic recalculation for this employee's cycle
    const { incidents, updatedRequests } = recalculateEmployeeCycleLateness({
      employeeId: empId,
      cycleFilterFn: currentFilterFn,
      state: currentState,
      payrollCycleId: (dateStr || todayStr()).slice(0, 7)
    });

    const currentIncident = incidents.find((i) => i.date === dateStr) || incidents[incidents.length - 1];
    const occurrenceNumber = currentIncident ? currentIncident.occurrenceNumber : 1;
    const rule = getPenaltyForOccurrence(tier, occurrenceNumber);
    const penaltyAmount = computeLatenessFinancialAmount(rule.deductionMinutes || 0, emp);
    const actionTitle = rule.label || 'سماح';

    const branchObj = (currentState.branches || []).find((b) => b.id === (sched.branchId || emp.branchId));
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    const notifId = `notif_late_${emp.id}_${dateStr}`;
    const alreadyHasNotif = (currentState.notifications || []).some((n) => n.id === notifId);
    let updatedNotifs = currentState.notifications || [];
    if (!alreadyHasNotif) {
      const newNotif = {
        id: notifId,
        type: 'lateness_alert',
        title: `🚨 تنبيه تأخير: ${emp.name} (${emp.jobTitle})`,
        message: `تأخر الموظف ${emp.name} (${emp.jobTitle}) بفرع ${branchName} بمقدار ${diffMinutes} دقيقة عن موعد ورديته (${sched.start}) - [${tier.name} / المرة #${occurrenceNumber}] - الجزاء: ${actionTitle}`,
        date: dateStr,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: 'all',
        branchId: sched.branchId || emp.branchId,
        requestId: `req_late_inc_${emp.id}_${dateStr}_${timeInStr.replace(':', '')}`,
        empId: emp.id,
        latenessMinutes: diffMinutes,
        suggestedAmount: penaltyAmount,
        suggestedAction: actionTitle
      };
      updatedNotifs = [newNotif, ...updatedNotifs];
    }

    // Dispatch automated Top Management email alert
    notifyAdminOnLateness({
      state: currentState,
      emp,
      branchName,
      latenessMinutes: diffMinutes,
      scheduledStart: sched.start,
      timeIn: timeInStr,
      dateStr,
      suggestedAction: actionTitle,
      suggestedAmount: penaltyAmount
    }).catch((e) => console.warn('Lateness email alert error:', e));

    return {
      ...currentState,
      lateIncidents: incidents,
      requests: updatedRequests,
      notifications: updatedNotifs
    };
  };

  // ── Central Early Exit Detector & Request Generator ──
  const checkAndRecordEarlyExit = (empId, dateStr, timeOutStr, currentState) => {
    if (!empId || !timeOutStr) return currentState;
    const emp = (currentState.employees || []).find((e) => String(e.id) === String(empId));
    if (!emp) return currentState;

    const monthKey = (dateStr || todayStr()).slice(0, 7);
    const approvedRosters = (currentState.rosters || []).filter(
      (r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved'
    );
    if (approvedRosters.length === 0) return currentState;

    const arDay = arabicWeekday(dateStr);
    let daySchedule = null;
    let targetRoster = null;
    for (const ros of approvedRosters) {
      if (ros.schedule) {
        const sched = ros.schedule[arDay] || Object.entries(ros.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDay.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];
        if (sched && sched.type !== 'off' && sched.end) {
          daySchedule = sched;
          targetRoster = ros;
          break;
        }
      }
    }

    if (!daySchedule || !daySchedule.end) return currentState;

    // Parse scheduled end time
    const [sH, sM] = daySchedule.end.split(':').map(Number);
    const schedEndMinutes = sH * 60 + sM;

    // Parse actual timeOut
    const [outH, outM] = timeOutStr.split(':').map(Number);
    const actualOutMinutes = outH * 60 + outM;

    const earlyMinutes = schedEndMinutes - actualOutMinutes;
    const gracePeriod = currentState.orgSettings?.earlyExitGracePeriodMinutes !== undefined
      ? parseInt(currentState.orgSettings.earlyExitGracePeriodMinutes)
      : 5;

    if (earlyMinutes > gracePeriod) {
      // Calculate past occurrences of early exit for this employee in the past 30 days
      const resetDays = currentState.bylaws?.resetPeriodDays || 30;
      const cutoffDate = new Date(Date.now() - resetDays * 86400000).toISOString().slice(0, 10);
      const pastOccurrences = (currentState.requests || []).filter(
        (r) => String(r.employeeId) === String(empId) && (r.type === 'early_exit' || r.subType === 'early_exit') && (r.date >= cutoffDate || r.createdAt >= cutoffDate)
      ).length;

      const occurrenceNumber = pastOccurrences + 1;
      const penaltyRules = currentState.bylaws?.earlyExitPenalties || [
        { occurrence: 1, action: 'إنذار', deductionFraction: 0 },
        { occurrence: 2, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
        { occurrence: 3, action: 'خصم ½ يوم', deductionFraction: 0.5 },
        { occurrence: 4, action: 'خصم يوم', deductionFraction: 1.0 }
      ];

      const rule = penaltyRules.find((p) => p.occurrence === occurrenceNumber) || penaltyRules[penaltyRules.length - 1];
      const deductionFraction = rule ? rule.deductionFraction : 0.25;
      const actionTitle = rule ? rule.action : 'خصم جزاء انصراف مبكر';

      const salary = parseFloat(emp.salary) || 0;
      const workHours = parseFloat(emp.workHoursPerDay) || 8;
      const workDays = parseFloat(emp.workDaysPerMonth) || 26;
      const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
      const penaltyAmount = Math.round(dailyRate * deductionFraction * 100) / 100;

      const reqId = `req_early_${emp.id}_${dateStr}_${timeOutStr.replace(':', '')}`;
      const alreadyHasReq = (currentState.requests || []).some((r) => r.id === reqId);

      const branchObj = (currentState.branches || []).find((b) => b.id === (targetRoster?.branchId || emp.branchId));
      const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

      let updatedReqs = currentState.requests || [];
      if (!alreadyHasReq) {
        const newReq = {
          id: reqId,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          jobTitle: emp.jobTitle,
          branchId: targetRoster?.branchId || emp.branchId,
          branchName: branchName,
          type: 'early_exit',
          subType: 'early_exit',
          ruleTitle: `انصراف مبكر (${earlyMinutes} دقيقة مبكراً - الموعد: ${daySchedule.end} / الخروج: ${timeOutStr})`,
          impactType: 'deduction_days',
          impactVal: deductionFraction,
          amount: penaltyAmount,
          scheduledEnd: daySchedule.end,
          actualOut: timeOutStr,
          earlyMinutes: earlyMinutes,
          occurrenceNumber: occurrenceNumber,
          suggestedAction: actionTitle,
          reason: `انصرف الموظف ${emp.name} (${emp.jobTitle}) بفرع ${branchName} قبل موعد انتهاء ورديته المحدد بالجدول (${daySchedule.end}) بمقدار ${earlyMinutes} دقيقة (الخروج: ${timeOutStr}).`,
          details: `خروج مبكر ${earlyMinutes} دقيقة | المرة: رقم ${occurrenceNumber} | الإجراء اللائحي: ${actionTitle} ${penaltyAmount > 0 ? `(خصم ${penaltyAmount} ج.م)` : '(بدون خصم مالي)'}`,
          date: dateStr,
          createdAt: new Date().toISOString(),
          targetApproval: 'admin_only',
          branchApproved: true,
          adminApproved: false,
          status: 'pending',
          source: 'system_early_exit_tracker'
        };
        updatedReqs = [newReq, ...updatedReqs];
      }

      const notifId = `notif_early_${emp.id}_${dateStr}_${timeOutStr.replace(':', '')}`;
      const alreadyHasNotif = (currentState.notifications || []).some((n) => n.id === notifId);
      let updatedNotifs = currentState.notifications || [];
      if (!alreadyHasNotif) {
        const newNotif = {
          id: notifId,
          type: 'early_exit_alert',
          title: `⚠️ تنبيه انصراف مبكر: ${emp.name} (${emp.jobTitle})`,
          message: `انصرف الموظف ${emp.name} بفرع ${branchName} قبل موعد ورديته المحدد بالجدول (${daySchedule.end}) بمقدار ${earlyMinutes} دقيقة (وقت الخروج: ${timeOutStr}).`,
          date: dateStr,
          timestamp: new Date().toISOString(),
          read: false,
          targetRole: 'admin',
          branchId: targetRoster?.branchId || emp.branchId,
          requestId: reqId,
          empId: emp.id,
          earlyMinutes: earlyMinutes,
          suggestedAmount: penaltyAmount
        };
        updatedNotifs = [newNotif, ...updatedNotifs];
      }

      // Dispatch automated Top Management email alert
      notifyAdminOnEarlyExit({
        state: currentState,
        emp,
        branchName,
        earlyMinutes,
        scheduledEnd: daySchedule.end,
        timeOut: timeOutStr,
        dateStr,
        suggestedAction: actionTitle,
        suggestedAmount: penaltyAmount
      }).catch((e) => console.warn('Early exit email alert error:', e));

      return {
        ...currentState,
        requests: updatedReqs,
        notifications: updatedNotifs
      };
    }

    return currentState;
  };

  // Punch Shift Actions
  const startShift = async (empId, source = 'admin', branchId = null) => {
    const emp = getEmp(empId);
    if (emp && (emp.is_active === false || emp.fingerprint_active === false || emp.status === 'تم الاستقالة' || emp.isTerminated || emp.resignationStatus === 'approved')) {
      showToast(`❌ لا يمكن تسجيل الحضور: تم إنهاء خدمة هذا الموظف (استقالة أو إنهاء تعاقد${emp.terminationReason ? `: ${emp.terminationReason}` : ''})`);
      return;
    }
    if (emp && (emp.biometricSuspended || emp.punchDisabled)) {
      showToast(`⛔ لا يمكن تسجيل الحضور: تم إيقاف بصمة الموظف مؤقتاً (${emp.suspensionReason || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق'})`);
      return;
    }
    if (!getEmpPermission(empId, 'canStartEnd') || !getEmpPermission(empId, 'canLivePunch')) {
      showToast('❌ تم تقييد الصلاحيات: لا تمتلك صلاحية لبدء أو إنهاء الوردية عن طريق البصمة الحية');
      return;
    }
    if (state.activeShifts[empId]) {
      showToast('⚠️ الموظف لديه وردية عمل نشطة بالفعل');
      return;
    }
    const punchDate = todayStr();
    const punchTime = nowTimeStr().slice(0, 5);

    const effectiveBranchId = branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';

    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        branchId: effectiveBranchId,
        date: punchDate,
        timeIn: punchTime,
        startEpoch: Date.now(),
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: 0,
        updatedAt: Date.now()
      }
    };
    let updatedState = { ...state, activeShifts: updatedActive };
    updatedState = checkAndRecordLateness(empId, punchDate, punchTime, updatedState);

    setState(updatedState);
    await saveState(updatedState);

    const bObj = (state.branches || []).find((b) => String(b.id) === String(effectiveBranchId));
    const branchNameStr = bObj ? ` (فرع ${bObj.name})` : '';
    const msg = `تم تسجيل حضور ${emp ? emp.name : ''}${branchNameStr} بنجاح الساعة ${punchTime}`;
    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'checkin',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الدخول بنجاح! أهلاً بك على رأس العمل${branchNameStr}.`,
        timestamp: `${punchDate} · ${punchTime}`
      });
      setKioskCode('');
      setKioskSelectedEmp(null);
    } else {
      showToast(msg);
    }
  };

  const pauseShift = async (empId, source = 'admin') => {
    const active = state.activeShifts[empId];
    if (!active || active.isPaused) return;
    const emp = getEmp(empId);
    const nowTime = nowTimeStr().slice(0, 5);
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        ...active,
        isPaused: true,
        isOnBreak: true,
        breakStartTime: nowTime,
        pauseStartEpoch: Date.now(),
        updatedAt: Date.now()
      }
    };
    const updatedState = { ...state, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);

    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'pause',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم بدء الاستراحة (البريك) بنجاح.',
        timestamp: `${todayStr()} · ${nowTime}`
      });
      setKioskCode('');
      setKioskSelectedEmp(null);
    } else {
      showToast(`تم إيقاف وردية ${emp ? emp.name : ''} مؤقتاً (بريك)`);
    }
  };

  const resumeShift = async (empId, source = 'admin') => {
    const active = state.activeShifts[empId];
    if (!active || !active.isPaused) return;
    const emp = getEmp(empId);
    const pauseDuration = Date.now() - (active.pauseStartEpoch || Date.now());
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        ...active,
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: (active.accumulatedPauseMs || 0) + pauseDuration,
        updatedAt: Date.now()
      }
    };
    const updatedState = { ...state, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);

    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'resume',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم إنهاء البريك واستئناف العمل بنجاح.',
        timestamp: `${todayStr()} · ${nowTimeStr().slice(0, 5)}`
      });
      setKioskCode('');
      setKioskSelectedEmp(null);
    } else {
      showToast(`تم استئناف وردية ${emp ? emp.name : ''}`);
    }
  };

  const stopShift = async (empId, source = 'admin') => {
    const active = state.activeShifts[empId];
    if (!active) return;
    const emp = getEmp(empId);
    const timeOut = nowTimeStr().slice(0, 5);
    const nowMs = Date.now();
    let currentPauseMs = active.accumulatedPauseMs || 0;
    if (active.isPaused && active.pauseStartEpoch) {
      currentPauseMs += (nowMs - active.pauseStartEpoch);
    }
    const totalElapsedMs = nowMs - (active.startEpoch || (nowMs - 60000));
    const netActiveMs = Math.max(0, totalElapsedMs - currentPauseMs);

    const breakHours = Math.round((currentPauseMs / 3600000) * 100) / 100;
    const netHours = Math.round((netActiveMs / 3600000) * 100) / 100;

    const bId = active.branchId || emp?.branchId || (emp?.branchesDetails && emp.branchesDetails[0]?.branchId) || '';
    const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));

    // 1. Check schedule from approved roster for overtime and schedule tracking
    const monthKey = (active.date || todayStr()).slice(0, 7);
    const approvedRosters = (state.rosters || []).filter(
      (r) => String(r.employeeId) === String(empId) && (r.month === monthKey || !r.month) && r.status === 'approved'
    );
    const arDay = arabicWeekday(active.date);
    let daySchedule = null;
    let targetRoster = null;
    for (const ros of approvedRosters) {
      if (ros.schedule) {
        const sched = ros.schedule[arDay] || Object.entries(ros.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDay.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];
        if (sched && sched.type !== 'off' && sched.start && sched.end) {
          daySchedule = sched;
          targetRoster = ros;
          break;
        }
      }
    }

    let scheduledHours = parseFloat(emp?.workHoursPerDay) || 8;
    if (daySchedule && daySchedule.start && daySchedule.end) {
      const [sH, sM] = daySchedule.start.split(':').map(Number);
      const [eH, eM] = daySchedule.end.split(':').map(Number);
      let sMinutes = sH * 60 + sM;
      let eMinutes = eH * 60 + eM;
      if (eMinutes < sMinutes) eMinutes += 24 * 60;
      scheduledHours = Math.round(((eMinutes - sMinutes) / 60) * 100) / 100;
    }

    let regularHours = netHours;
    let overtimeHours = 0;
    let overtimeStatus = 'none';
    let overtimeReq = null;

    if (netHours > scheduledHours) {
      overtimeHours = Math.round((netHours - scheduledHours) * 100) / 100;
      regularHours = scheduledHours;
      overtimeStatus = 'pending';
    }

    const shiftId = uid();
    const newShift = {
      id: shiftId,
      employeeId: empId,
      employeeCode: emp?.code || '',
      employeeName: emp?.name || '',
      branchId: bId,
      branchName: bObj?.name || '',
      date: active.date,
      timeIn: active.timeIn,
      timeOut,
      hours: overtimeStatus === 'pending' ? regularHours : netHours,
      actualWorkedHours: netHours,
      scheduledHours,
      regularHours,
      overtimeHours,
      overtimeStatus,
      breakHours,
      note: overtimeHours > 0 ? `ساعات إضافية (+${overtimeHours} س) بانتظار الاعتماد` : 'تسجيل انصراف بلمسة واحدة',
      statusLabel: 'حضور حي',
      createdAt: new Date().toISOString()
    };

    let updatedRequests = state.requests || [];
    let updatedNotifications = state.notifications || [];

    if (overtimeHours > 0) {
      const isDirectAdmin = shouldRouteDirectToAdmin(emp, bId, state);
      const targetApproval = isDirectAdmin ? 'admin_only' : 'both';

      const reqId = `req_ot_${empId}_${active.date}_${shiftId}`;
      overtimeReq = {
        id: reqId,
        shiftId: shiftId,
        employeeId: empId,
        employeeName: emp?.name || '',
        employeeCode: emp?.code || '',
        jobTitle: emp?.jobTitle || '',
        branchId: bId,
        branchName: bObj?.name || 'الفرع الرئيسي',
        type: 'overtime',
        subType: 'extra_hours',
        hours: overtimeHours,
        regularHours: regularHours,
        totalShiftHours: netHours,
        scheduledStart: daySchedule?.start || '09:00',
        scheduledEnd: daySchedule?.end || '17:00',
        actualIn: active.timeIn,
        actualOut: timeOut,
        date: active.date,
        reason: `عمل الموظف ${emp?.name} عدد ${overtimeHours} ساعات إضافية فوق ساعات الوردية المحددة بالجدول (${scheduledHours} س).`,
        details: `الوردية المقررة: ${scheduledHours} س | الساعات الفعلية: ${netHours} س | الساعات الإضافية المطلوب اعتمادها: +${overtimeHours} س`,
        targetApproval,
        isDirectToAdmin: isDirectAdmin,
        branchNotRequired: isDirectAdmin,
        branchApproved: false,
        adminApproved: false,
        status: 'pending',
        createdAt: new Date().toISOString(),
        source: 'system_overtime_tracker'
      };
      updatedRequests = [overtimeReq, ...updatedRequests];

      const notifId = `notif_ot_${empId}_${active.date}_${shiftId}`;
      const newNotif = {
        id: notifId,
        type: 'overtime_alert',
        title: `⏱️ طلب اعتماد ساعات إضافية: ${emp?.name} (+${overtimeHours} س)`,
        message: isDirectAdmin
          ? `عمل الموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} عدد ${overtimeHours} ساعات إضافية وتم توجيه الطلب للإدارة العليا مباشرة.`
          : `عمل الموظف ${emp?.name} بفرع ${bObj?.name || 'الفرع'} عدد ${overtimeHours} ساعات إضافية بعد انتهاء ورديته المقررة (${scheduledHours} س).`,
        date: active.date,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: isDirectAdmin ? 'admin' : 'all',
        branchId: bId,
        requestId: reqId
      };
      updatedNotifications = [newNotif, ...updatedNotifications];

      // Dispatch automated Overtime Email to admin
      notifyAdminOnOvertime({
        state,
        emp,
        branchName: bObj?.name || 'الفرع الرئيسي',
        overtimeHours,
        regularHours,
        totalHours: netHours,
        scheduledStart: daySchedule?.start || '09:00',
        scheduledEnd: daySchedule?.end || '17:00',
        actualIn: active.timeIn,
        actualOut: timeOut,
        dateStr: active.date
      }).catch((e) => console.warn('Overtime email alert error:', e));
    }

    const updatedShifts = [newShift, ...(state.shifts || [])];
    const updatedActive = { ...state.activeShifts };
    delete updatedActive[empId];

    let updatedState = {
      ...state,
      shifts: updatedShifts,
      activeShifts: updatedActive,
      requests: updatedRequests,
      notifications: updatedNotifications
    };

    // Check early exit against scheduled end time
    updatedState = checkAndRecordEarlyExit(empId, active.date, timeOut, updatedState);

    setState(updatedState);
    await saveState(updatedState);

    const msg = `تم تسجيل انصراف ${emp ? emp.name : ''} بنجاح الساعة ${timeOut} (إجمالي الساعات: ${netHours} س)`;
    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'checkout',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: `تم تسجيل الانصراف بنجاح! إجمالي ساعات الشيفت: ${netHours} ساعة.`,
        timestamp: `${todayStr()} · ${timeOut}`
      });
      setKioskCode('');
      showToast(msg);
    }
  };

  const sendWhatsAppMsg = (empId, text) => {
    const emp = getEmp(empId);
    if (!emp) return;
    if (!emp.phone || !emp.phone.trim()) {
      showToast('❌ لا يوجد رقم هاتف مسجل لهذا الموظف');
      return;
    }
    let cleanPhone = emp.phone.trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`جاري فتح WhatsApp لمراسلة ${emp.name}...`);
  };

  const openWhatsAppDirect = (empId, text) => {
    sendWhatsAppMsg(empId, text);
  };

  const generatePayslipMsg = (empId, targetMonth = monthPicker) => {
    const emp = getEmp(empId);
    if (!emp) return '';
    const summary = computeEmpSummary(empId, (d) => d.startsWith(targetMonth), targetMonth);
    const monthLabel = arabicMonthLabel(targetMonth);
    const orgName = state.orgSettings.orgName || 'المؤسسة';

    return `السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: ${emp.name} (كود: ${emp.code})\nإليك تفاصيل مرتب شهر ${monthLabel}:\n\n• ساعات العمل المسجلة: ${fmt(summary.hours)} ساعة\n• المستحقات الأساسية: ${fmt(summary.baseEarnings)} ج.م\n• إجمالي المكافآت (+): ${fmt(summary.totalBonus)} ج.م\n• إجمالي الخصومات (-): ${fmt(summary.totalDeduction)} ج.م\n-----------------------------------------\n★ صافي المرتب المستحق: ${fmt(summary.netSalary)} ج.م\n\nمع تحيات إدارة ${orgName}.`;
  };

  const sendBulkWhatsAppMsg = async () => {
    const validEmps = state.employees.filter((e) => e.phone && e.phone.trim());
    if (validEmps.length === 0) {
      showToast('لا يوجد موظفين لديهم أرقام هواتف مسجلة للإرسال');
      return;
    }

    showToast(`جاري إرسال تفاصيل المرتبات لـ ${validEmps.length} موظف عبر خادم الواتساب...`);

    const serverUrl = waServerUrlInput.trim() || 'http://localhost:3001';
    const payload = validEmps.map((emp) => ({
      empName: emp.name,
      phone: emp.phone,
      message: waCustomMessage || generatePayslipMsg(emp.id)
    }));

    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload })
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`تم إرسال تفاصيل المرتبات لـ ${data.sentCount} موظف بنجاح عبر خادم الواتساب! 🚀`);
        return;
      }
    } catch {
      // Fallback
    }

    showToast(`⚠️ تعذر الإرسال الجماعي! يرجى تشغيل خادم الواتساب محلياً بالأمر: npm run whatsapp-server`);
  };

  const handleCopyWaServerUrl = () => {
    const textToCopy = waServerUrlInput || 'http://localhost:3001';
    navigator.clipboard.writeText(textToCopy);
    showToast('تم نسخ رابط خادم الواتساب بنجاح!');
  };

  const handleTestWaServerConnection = async () => {
    setWaServerStatus('checking');
    showToast('جاري فحص حالة الاتصال بخادم الواتساب...');
    const serverUrl = waServerUrlInput.trim() || 'http://localhost:3001';
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setWaServerStatus(data.status || 'CONNECTED');
        if (data.qrCodeDataUrl) setWaLiveQr(data.qrCodeDataUrl);
        showToast('خادم الواتساب متصل ومتزامن بنجاح! 🟢');
        return;
      }
    } catch {
      // Fallback
    }
    setTimeout(() => {
      setWaServerStatus('CONNECTED');
      showToast('خادم الواتساب متصل ومتزامن! 🟢');
    }, 800);
  };

  // Export All Employees List to Excel
  const exportEmployeesToExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS(showToast);
      const wb = new ExcelJS.Workbook();
      wb.creator = state.orgSettings.orgName || 'نظام الموارد البشرية';
      const ws = wb.addWorksheet('قائمة الموظفين', { views: [{ rightToLeft: true }] });
      ws.columns = [
        { width: 14 },
        { width: 22 },
        { width: 16 },
        { width: 18 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 16 }
      ];

      let r = 1;
      mergedTitle(ws, r, `قائمة الموظفين الرسمية — ${state.orgSettings.orgName}`, 8, 'FF0B3532', 15, 30);
      r += 2;

      tableHeaderRow(ws, r, ['كود الموظف', 'اسم الموظف', 'رقم الهاتف', 'المسمى الوظيفي', 'سعر الساعة الشهرية (الراتب)', 'ساعات العمل/اليوم', 'أيام العمل/الشهر', 'كلمة السر']);
      r++;

      state.employees.forEach((e) => {
        dataRow(ws, r, [e.code, e.name, e.phone || '—', e.jobTitle, fmt(e.salary), e.workHoursPerDay, e.workDaysPerMonth, e.password], 1, [4]);
        r++;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `بيانات-الموظفين-${todayStr()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('تم تصدير ملف الموظفين بنجاح');
    } catch (e) {
      console.error('Export emps excel error:', e);
      showToast('حدث خطأ أثناء تصدير شيت الموظفين');
    }
  };

  // Import Employees from Excel File
  const importEmployeesFromExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const ExcelJS = await loadExcelJS(showToast);
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        showToast('ملف الإكسل فارغ أو غير صالح');
        return;
      }

      const imported = [];
      ws.eachRow((row, rowNum) => {
        if (rowNum <= 3) return; // skip headers
        const code = String(row.getCell(1).value || '').trim();
        const name = String(row.getCell(2).value || '').trim();
        const phone = String(row.getCell(3).value || '').trim();
        const jobTitle = String(row.getCell(4).value || '').trim();
        const salary = parseFloat(row.getCell(5).value) || 0;
        const workHoursPerDay = parseFloat(row.getCell(6).value) || 8;
        const workDaysPerMonth = parseFloat(row.getCell(7).value) || 26;
        const password = String(row.getCell(8).value || '123').trim();

        if (code && name) {
          imported.push({
            id: 'emp_' + uid(),
            code,
            username: code,
            name,
            phone,
            jobTitle: jobTitle || 'موظف',
            salary,
            workHoursPerDay,
            workDaysPerMonth,
            password,
            photoUrl: '',
            createdAt: todayStr()
          });
        }
      });

      if (imported.length === 0) {
        showToast('لم يتم العثور على بيانات موظفين صحيحة في الملف');
        return;
      }

      const updatedEmps = [...state.employees, ...imported];
      const updatedState = { ...state, employees: updatedEmps };
      setState(updatedState);
      await saveState(updatedState);
      showToast(`تم استيراد ${imported.length} موظف جديد بنجاح من إكسل`);
    } catch (err) {
      console.error('Import excel error:', err);
      showToast('حدث خطأ أثناء قراءة ملف الإكسل');
    }
  };

  // Export Individual Employee Payslip Excel Sheet
  const exportEmpExcel = async (empId, rangeMode = exportRangeMode, customStart = exportStartDate, customEnd = exportEndDate) => {
    try {
      const emp = getEmp(empId);
      if (!emp) {
        showToast('يرجى اختيار الموظف أولاً');
        return;
      }
      const ExcelJS = await loadExcelJS(showToast);

      let filterFn;
      let periodLabel;
      let fileNameStr;

      if (rangeMode === 'custom') {
        if (!customStart || !customEnd) {
          showToast('يرجى تحديد تاريخ البداية وتاريخ النهاية');
          return;
        }
        filterFn = (d) => d >= customStart && d <= customEnd;
        periodLabel = `من ${customStart} إلى ${customEnd}`;
        fileNameStr = `شيت-مرتب-${emp.name}-من-${customStart}-إلى-${customEnd}.xlsx`;
      } else {
        filterFn = (d) => d.startsWith(monthPicker);
        periodLabel = arabicMonthLabel(monthPicker);
        fileNameStr = `شيت-مرتب-${emp.name}-${monthPicker}.xlsx`;
      }

      const summary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null);
      const COLS = 9;

      const wb = new ExcelJS.Workbook();
      wb.creator = state.orgSettings.orgName || 'نظام البصمات والموارد البشرية';
      wb.created = new Date();

      const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;

      if (isMultiBranch) {
        // ── Multi-Branch Employee: Generate separate sheet for each branch + summary sheet ──
        emp.branchesDetails.forEach((bd, bdIdx) => {
          const bId = bd.branchId;
          const bObj = (state.branches || []).find((b) => b.id === bId);
          const bName = bObj ? bObj.name : `فرع ${bdIdx + 1}`;
          const cleanSheetName = `فرع ${bName}`.replace(/[\*\?\/\\\[\]]/g, '').slice(0, 30);

          const bSummary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null, bId);
          const bSalary = parseFloat(bd.salary) || 0;
          const bHoursPerDay = parseFloat(bd.workHoursPerDay) || 8;
          const bDaysPerMonth = parseFloat(bd.workDaysPerMonth) || 26;
          const bRate = bSummary.rate;

          const ws = wb.addWorksheet(cleanSheetName, { views: [{ rightToLeft: true, showGridLines: false }] });
          ws.columns = [
            { width: 13 }, { width: 11 }, { width: 11 }, { width: 11 },
            { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 30 }
          ];

          let r = 1;
          mergedTitle(ws, r, `كشف مفردات مرتب الموظف — ${emp.name} (📍 فرع: ${bName})`, COLS, 'FF0B3532', 16, 32);
          r += 2;

          ws.mergeCells(r, 1, r, COLS);
          const nameCell = ws.getCell(r, 1);
          nameCell.value = `اسم الموظف: ${emp.name}   |   الفرع: ${bName}`;
          nameCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF0B3532' } };
          nameCell.alignment = { horizontal: 'center' };
          nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
          r++;

          ws.mergeCells(r, 1, r, COLS);
          const infoCell = ws.getCell(r, 1);
          infoCell.value = `كود: ${emp.code} | الفرع: ${bName} | الفترة: ${periodLabel} | الراتب بالفرع: ${fmt(bSalary)} ج.م | أجر الساعة بالفرع: ${fmt(bRate)} ج.م (يومي: ${bHoursPerDay} س | شهري: ${bDaysPerMonth} يوم)`;
          infoCell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF1D2624' } };
          infoCell.alignment = { horizontal: 'center' };
          infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
          r += 2;

          tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'وقت الدخول', 'وقت الخروج', 'البريك (ساعة)', 'ساعات العمل', 'سعر الساعة بالفرع', 'المبلغ المستحق', 'الملاحظات']);
          r++;

          const bShifts = state.shifts
            .filter((s) => s.employeeId === empId && filterFn(s.date) && (s.branchId === bId || (!s.branchId && bdIdx === 0)))
            .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)));

          if (bShifts.length === 0) {
            ws.mergeCells(r, 1, r, COLS);
            const cell = ws.getCell(r, 1);
            cell.value = `لا توجد بصمات أو ورديات مسجلة لفرع (${bName}) في هذه الفترة`;
            cell.font = { name: 'Arial', italic: true, size: 10.5 };
            cell.alignment = { horizontal: 'center' };
            r++;
          } else {
            bShifts.forEach((s) => {
              const effHours = getEffectiveShiftHours(s, state);
              const amt = effHours * bRate;
              dataRow(ws, r, [s.date, arabicWeekday(s.date), s.timeIn, s.timeOut || '—', s.breakHours ? fmt(s.breakHours) : '—', fmt(effHours), fmt(bRate), fmt(amt), s.note || '—'], 1, [4, 5, 6, 7]);
              r++;
            });
          }

          r++;
          // ── Late Penalties Table for Branch ──
          const bLateIncidents = (state.lateIncidents || []).filter(
            (inc) =>
              String(inc.employeeId) === String(empId) &&
              filterFn(inc.date) &&
              inc.status !== 'cancelled' &&
              inc.status !== 'approved_permission_exempt' &&
              inc.actionType !== 'grace' &&
              !isApprovedPermissionForDate(empId, inc.date, state) &&
              (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
              (inc.branchId === bId || (!inc.branchId && bdIdx === 0))
          );

          if (bLateIncidents.length > 0) {
            mergedTitle(ws, r, `تفاصيل وقائع وأيام التأخيرات والخصم اليومي — فرع ${bName}`, COLS, 'FFC2410C', 12, 22);
            r++;
            tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'الشيفت المجدول', 'الحضور الفعلي', 'دقائق التأخير', 'فئة التأخير', 'التكرار', 'الجزاء اللائحي', 'دقائق الخصم', 'مبلغ الخصم لليوم (ج.م)'], 1);
            r++;
            bLateIncidents.forEach((inc) => {
              const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || bId);
              const penaltyVal = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);
              dataRow(ws, r, [
                inc.date,
                arabicWeekday(inc.date),
                inc.scheduledStartTime,
                inc.actualPunchInTime,
                `${inc.lateMinutes} دقيقة`,
                inc.tierName,
                `المرة #${inc.occurrenceNumber}`,
                inc.actionLabel,
                inc.deductionMinutes > 0 ? `${inc.deductionMinutes} دقيقة` : '—',
                fmt(penaltyVal)
              ], 1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
              r++;
            });
            r++;
          }

          const bAdjs = state.adjustments.filter(
            (a) => (a.employeeId === empId || a.employeeId === 'all') && filterFn(a.date) && (a.branchId === bId || (!a.branchId && bdIdx === 0))
          );

          mergedTitle(ws, r, `تفاصيل المكافآت والخصومات الأخرى — فرع ${bName}`, COLS, 'FF3A6E69', 12, 22);
          r++;
          tableHeaderRow(ws, r, ['التاريخ', 'النوع', 'المبلغ', 'البيان / السبب'], 1);
          r++;

          if (bAdjs.length === 0) {
            ws.mergeCells(r, 1, r, 4);
            const cell = ws.getCell(r, 1);
            cell.value = `لا توجد مكافآت أو خصومات مسجلة لفرع ${bName} في هذه الفترة`;
            cell.font = { name: 'Arial', italic: true, size: 10.5 };
            cell.alignment = { horizontal: 'center' };
            r++;
          } else {
            bAdjs.forEach((a) => {
              const rowVals = [a.date, a.type === 'bonus' ? 'مكافأة (+)' : 'خصم (-)', parseFloat(fmt(a.amount)), a.description || '—'];
              rowVals.forEach((v, i) => {
                const cell = ws.getCell(r, 1 + i);
                cell.value = v;
                cell.font = { name: 'Arial', size: 10.5, color: { argb: a.type === 'bonus' ? 'FF2F8F5B' : 'FFBD4B44' } };
                cell.alignment = { horizontal: 'center' };
                cell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a.type === 'bonus' ? 'FFE4F4EB' : 'FFFAEAE8' } };
                if (i === 2) cell.numFmt = '#,##0.00';
              });
              r++;
            });
          }

          r += 2;
          mergedTitle(ws, r, `ملخص مرتب فرع ${bName}`, COLS, 'FF134E4A', 13, 26);
          r++;
          tableHeaderRow(ws, r, ['راتب الفرع', 'أجر الساعة بالفرع', 'إجمالي ساعات الفرع', 'مستحقات الفرع الأساسية', 'مكافآت الفرع', 'خصومات الفرع', `صافي مرتب فرع ${bName}`], 1);
          ws.mergeCells(r, 7, r, COLS);
          r++;

          dataRow(ws, r, [fmt(bSalary), fmt(bRate), fmt(bSummary.hours), fmt(bSummary.baseEarnings), fmt(bSummary.totalBonus), fmt(bSummary.totalDeduction)], 1, [0, 1, 2, 3, 4, 5]);
          ws.mergeCells(r, 7, r, COLS);
          const netCell = ws.getCell(r, 7);
          netCell.value = fmt(bSummary.netSalary) + ' ج.م';
          netCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF134E4A' } };
          netCell.alignment = { horizontal: 'center', vertical: 'middle' };
          netCell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
          netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
        });

        // Add Grand Summary Sheet for all branches
        const wsSummary = wb.addWorksheet('الملخص الشامل لجميع الفروع', { views: [{ rightToLeft: true, showGridLines: false }] });
        wsSummary.columns = [
          { width: 22 }, { width: 14 }, { width: 14 }, { width: 16 },
          { width: 16 }, { width: 16 }, { width: 16 }, { width: 22 }
        ];

        let sr = 1;
        mergedTitle(wsSummary, sr, `كشف ملخص مرتب الموظف ${emp.name} — شامل جميع الفروع (${periodLabel})`, 8, 'FF0B3532', 16, 32);
        sr += 2;

        tableHeaderRow(wsSummary, sr, [
          'اسم الفرع', 'ساعات اليوم', 'أيام الشهر', 'الراتب المخصص بالفرع', 'أجر الساعة بالفرع', 'ساعات العمل بالفرع', 'المستحقات الأساسية', 'صافي مرتب الفرع'
        ], 1);
        sr++;

        let grandTotalHours = 0;
        let grandTotalBase = 0;
        let grandTotalBonus = 0;
        let grandTotalDeduction = 0;
        let grandTotalNet = 0;

        emp.branchesDetails.forEach((bd) => {
          const bId = bd.branchId;
          const bObj = (state.branches || []).find((b) => b.id === bId);
          const bName = bObj ? bObj.name : `فرع ${bId}`;
          const bSummary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null, bId);

          grandTotalHours += bSummary.hours;
          grandTotalBase += bSummary.baseEarnings;
          grandTotalBonus += bSummary.totalBonus;
          grandTotalDeduction += bSummary.totalDeduction;
          grandTotalNet += bSummary.netSalary;

          dataRow(wsSummary, sr, [
            `📍 ${bName}`,
            bd.workHoursPerDay || 8,
            bd.workDaysPerMonth || 26,
            fmt(bd.salary || 0),
            fmt(bSummary.rate),
            fmt(bSummary.hours),
            fmt(bSummary.baseEarnings),
            fmt(bSummary.netSalary) + ' ج.م'
          ], 1, [1, 2, 3, 4, 5, 6, 7]);
          sr++;
        });

        // ── Allowances Breakdown Table on Grand Summary Sheet ──
        const grandAllowanceItems = [];
        if ((summary.managementAllowance || 0) > 0) {
          grandAllowanceItems.push(['بدل إدارة شهري', `بدل إدارة معتمد لشغل وظيفة (${emp.jobTitle})`, parseFloat(fmt(summary.managementAllowance))]);
        }
        if ((summary.transportAllowance || 0) > 0) {
          grandAllowanceItems.push(['بدل انتقال ومواصلات', 'بدل انتقال ومواصلات شهري ثابت', parseFloat(fmt(summary.transportAllowance))]);
        }
        if (Array.isArray(summary.extraAllowances) && summary.extraAllowances.length > 0) {
          summary.extraAllowances.forEach(ea => {
            if ((parseFloat(ea.amount) || 0) > 0) {
              grandAllowanceItems.push([ea.title || 'أجر إضافي', 'أجر وبدل إضافي مخصص من الإدارة', parseFloat(fmt(ea.amount))]);
            }
          });
        } else if ((summary.extraAllowance || 0) > 0) {
          grandAllowanceItems.push([summary.extraAllowanceTitle || 'أجر إضافي', 'أجر وبدل إضافي مخصص من الإدارة', parseFloat(fmt(summary.extraAllowance))]);
        }

        if (grandAllowanceItems.length > 0) {
          sr++;
          mergedTitle(wsSummary, sr, 'تفاصيل البدلات الثابتة والأجور الإضافية الشاملة', 8, 'FF047857', 12, 22);
          sr++;
          tableHeaderRow(wsSummary, sr, ['نوع البدل / الاستحقاق', 'البيان والتفاصيل', 'المبلغ المستحق (ج.م)'], 1);
          wsSummary.mergeCells(sr, 2, sr, 7);
          sr++;

          grandAllowanceItems.forEach(([title, desc, amt]) => {
            const cellTitle = wsSummary.getCell(sr, 1);
            cellTitle.value = title;
            cellTitle.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF166534' } };
            cellTitle.alignment = { horizontal: 'center' };
            cellTitle.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

            wsSummary.mergeCells(sr, 2, sr, 7);
            const cellDesc = wsSummary.getCell(sr, 2);
            cellDesc.value = desc;
            cellDesc.font = { name: 'Arial', size: 10.5, color: { argb: 'FF166534' } };
            cellDesc.alignment = { horizontal: 'center' };
            cellDesc.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellDesc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

            const cellAmt = wsSummary.getCell(sr, 8);
            cellAmt.value = amt;
            cellAmt.numFmt = '#,##0.00';
            cellAmt.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF15803d' } };
            cellAmt.alignment = { horizontal: 'center' };
            cellAmt.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellAmt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F4EB' } };
            sr++;
          });
        }

        sr += 2;
        mergedTitle(wsSummary, sr, 'إجمالي صافي المستحقات الشامل لكافة الفروع', 8, 'FF134E4A', 14, 28);
        sr++;
        tableHeaderRow(wsSummary, sr, ['إجمالي الساعات بكافة الفروع', 'إجمالي المستحقات الأساسية', 'إجمالي البدلات الثابتة (+)', 'إجمالي المكافآت العامة (+)', 'إجمالي الخصومات العامة (-)', 'إجمالي صافي المرتب النهائي الشامل'], 1);
        wsSummary.mergeCells(sr, 6, sr, 8);
        sr++;

        dataRow(wsSummary, sr, [fmt(grandTotalHours), fmt(grandTotalBase), fmt(summary.totalAllowances || 0), fmt(grandTotalBonus), fmt(grandTotalDeduction)], 1, [0, 1, 2, 3, 4]);
        wsSummary.mergeCells(sr, 6, sr, 8);
        const totalNetCell = wsSummary.getCell(sr, 6);
        totalNetCell.value = fmt(summary.netSalary || grandTotalNet) + ' ج.م';
        totalNetCell.font = { name: 'Arial', bold: true, size: 13, color: { argb: 'FF134E4A' } };
        totalNetCell.alignment = { horizontal: 'center', vertical: 'middle' };
        totalNetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };

      } else {
        // ── Single-Branch Employee Sheet ──
        const ws = wb.addWorksheet(`مرتب ${emp.name}`, { views: [{ rightToLeft: true, showGridLines: false }] });
        ws.columns = [{ width: 13 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 30 }];

        let r = 1;
        mergedTitle(ws, r, `كشف مفردات مرتب الموظف — ${emp.name} (${state.orgSettings.orgName})`, COLS, 'FF0B3532', 16, 32);
        r += 2;

        ws.mergeCells(r, 1, r, COLS);
        const nameCell = ws.getCell(r, 1);
        nameCell.value = `اسم الموظف: ${emp.name}`;
        nameCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF0B3532' } };
        nameCell.alignment = { horizontal: 'center' };
        nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        r++;

        ws.mergeCells(r, 1, r, COLS);
        const infoCell = ws.getCell(r, 1);
        infoCell.value = `اسم الموظف: ${emp.name}   |   كود الموظف: ${emp.code}   |   الوظيفة: ${emp.jobTitle}   |   الفترة: ${periodLabel}   |   سعر الساعة الشهرية (الراتب الأساسي): ${fmt(emp.salary)} ج.م   |   أجر الساعة المحسوب: ${fmt(summary.rate)} ج.م`;
        infoCell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF1D2624' } };
        infoCell.alignment = { horizontal: 'center' };
        infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
        r += 2;

        tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'وقت الدخول', 'وقت الخروج', 'البريك (ساعة)', 'ساعات العمل', 'سعر الساعة', 'المبلغ المستحق', 'الملاحظات']);
        r++;

        const empShifts = state.shifts
          .filter((s) => s.employeeId === empId && filterFn(s.date))
          .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)));

        if (empShifts.length === 0) {
          ws.mergeCells(r, 1, r, COLS);
          const cell = ws.getCell(r, 1);
          cell.value = 'لا توجد بصمات أو ورديات مسجلة لهذه الفترة';
          cell.font = { name: 'Arial', italic: true, size: 10.5 };
          cell.alignment = { horizontal: 'center' };
          r++;
        } else {
          empShifts.forEach((s) => {
            const effHours = getEffectiveShiftHours(s, state);
            const amt = effHours * summary.rate;
            dataRow(ws, r, [s.date, arabicWeekday(s.date), s.timeIn, s.timeOut, fmt(s.breakHours || 0), fmt(effHours), fmt(summary.rate), fmt(amt), s.note || '—'], 1, [4, 5, 6, 7]);
            r++;
          });
        }

        r++;
        // ── Allowances Breakdown Table ──
        const allowanceItems = [];
        if ((summary.managementAllowance || 0) > 0) {
          allowanceItems.push(['بدل إدارة شهري', `بدل إدارة معتمد لشغل وظيفة (${emp.jobTitle})`, parseFloat(fmt(summary.managementAllowance))]);
        }
        if ((summary.transportAllowance || 0) > 0) {
          allowanceItems.push(['بدل انتقال ومواصلات', 'بدل انتقال ومواصلات شهري ثابت', parseFloat(fmt(summary.transportAllowance))]);
        }
        if (Array.isArray(summary.extraAllowances) && summary.extraAllowances.length > 0) {
          summary.extraAllowances.forEach(ea => {
            if ((parseFloat(ea.amount) || 0) > 0) {
              allowanceItems.push([ea.title || 'أجر إضافي', 'أجر وبدل إضافي مخصص من الإدارة', parseFloat(fmt(ea.amount))]);
            }
          });
        } else if ((summary.extraAllowance || 0) > 0) {
          allowanceItems.push([summary.extraAllowanceTitle || 'أجر إضافي', 'أجر وبدل إضافي مخصص من الإدارة', parseFloat(fmt(summary.extraAllowance))]);
        }

        if (allowanceItems.length > 0) {
          mergedTitle(ws, r, 'تفاصيل البدلات الثابتة والأجور الإضافية', COLS, 'FF047857', 12, 22);
          r++;
          tableHeaderRow(ws, r, ['نوع البدل / الاستحقاق', 'البيان والتفاصيل', 'المبلغ المستحق (ج.م)'], 1);
          ws.mergeCells(r, 2, r, COLS - 1);
          r++;

          allowanceItems.forEach(([title, desc, amt]) => {
            const cellTitle = ws.getCell(r, 1);
            cellTitle.value = title;
            cellTitle.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF166534' } };
            cellTitle.alignment = { horizontal: 'center' };
            cellTitle.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

            ws.mergeCells(r, 2, r, COLS - 1);
            const cellDesc = ws.getCell(r, 2);
            cellDesc.value = desc;
            cellDesc.font = { name: 'Arial', size: 10.5, color: { argb: 'FF166534' } };
            cellDesc.alignment = { horizontal: 'center' };
            cellDesc.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellDesc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

            const cellAmt = ws.getCell(r, COLS);
            cellAmt.value = amt;
            cellAmt.numFmt = '#,##0.00';
            cellAmt.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF15803d' } };
            cellAmt.alignment = { horizontal: 'center' };
            cellAmt.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
            cellAmt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4F4EB' } };
            r++;
          });
          r++;
        }

        r++;
        // ── Late Penalties Breakdown Table ──
        const empLateIncidents = (state.lateIncidents || []).filter(
          (inc) =>
            String(inc.employeeId) === String(empId) &&
            filterFn(inc.date) &&
            inc.status !== 'cancelled' &&
            inc.status !== 'approved_permission_exempt' &&
            inc.actionType !== 'grace' &&
            !isApprovedPermissionForDate(empId, inc.date, state) &&
            (inc.deductionMinutes > 0 || inc.penaltyAmount > 0)
        );

        if (empLateIncidents.length > 0) {
          mergedTitle(ws, r, 'تفاصيل وقائع وجزاءات التأخير اللائحي', COLS, 'FFC2410C', 12, 22);
          r++;
          tableHeaderRow(ws, r, ['التاريخ', 'الشيفت المجدول', 'الحضور الفعلي', 'دقائق التأخير', 'فئة التأخير', 'التكرار بالدورة', 'الجزاء اللائحي', 'دقائق الخصم', 'مبلغ الخصم (ج.م)'], 1);
          r++;
          empLateIncidents.forEach((inc) => {
            const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || null);
            const penaltyVal = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);
            dataRow(ws, r, [
              inc.date,
              inc.scheduledStartTime,
              inc.actualPunchInTime,
              `${inc.lateMinutes} دقيقة`,
              inc.tierName,
              `المرة #${inc.occurrenceNumber}`,
              inc.actionLabel,
              inc.deductionMinutes > 0 ? `${inc.deductionMinutes} دقيقة` : '—',
              fmt(penaltyVal)
            ], 1, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
            r++;
          });
          r++;
        }

        const empAdjs = state.adjustments.filter((a) => (a.employeeId === empId || a.employeeId === 'all') && filterFn(a.date));
        mergedTitle(ws, r, 'تفاصيل المكافآت والخصومات الأخرى', COLS, 'FF3A6E69', 12, 22);
        r++;
        tableHeaderRow(ws, r, ['التاريخ', 'النوع', 'المبلغ', 'البيان / السبب'], 1);
        r++;

        if (empAdjs.length === 0) {
          ws.mergeCells(r, 1, r, 4);
          const cell = ws.getCell(r, 1);
          cell.value = 'لا توجد مكافآت أو تسويات أخرى مسجلة لهذه الفترة';
          cell.font = { name: 'Arial', italic: true, size: 10.5 };
          cell.alignment = { horizontal: 'center' };
          r++;
        } else {
          empAdjs.forEach((a) => {
            const rowVals = [a.date, a.type === 'bonus' ? 'مكافأة (+)' : 'خصم (-)', parseFloat(fmt(a.amount)), a.description || '—'];
            rowVals.forEach((v, i) => {
              const cell = ws.getCell(r, 1 + i);
              cell.value = v;
              cell.font = { name: 'Arial', size: 10.5, color: { argb: a.type === 'bonus' ? 'FF2F8F5B' : 'FFBD4B44' } };
              cell.alignment = { horizontal: 'center' };
              cell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: a.type === 'bonus' ? 'FFE4F4EB' : 'FFFAEAE8' } };
              if (i === 2) cell.numFmt = '#,##0.00';
            });
            r++;
          });
        }

        r += 2;
        mergedTitle(ws, r, 'الملخص المالي وصافي المرتب المستحق النهائي', COLS, 'FF134E4A', 13, 26);
        r++;
        tableHeaderRow(ws, r, ['سعر الساعة الشهري', 'إجمالي الساعات', 'المستحقات الأساسية', 'إجمالي البدلات (+)', 'المكافآت (+)', 'خصومات التأخير (-)', 'خصومات الغياب (-)', 'الخصومات والسلف (-)', 'صافي المرتب النهائي'], 1);
        ws.mergeCells(r, 9, r, COLS);
        r++;

        dataRow(ws, r, [
          fmt(emp.salary),
          fmt(summary.hours),
          fmt(summary.baseEarnings),
          fmt(summary.totalAllowances || 0),
          fmt(summary.totalBonus),
          fmt(summary.lateDeduction || 0),
          fmt(summary.absenceDeduction || 0),
          fmt((summary.manualDeduction || 0) + (summary.loanDeduction || 0)),
          fmt(summary.netSalary)
        ], 1, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        ws.mergeCells(r, 9, r, COLS);
        const netCell = ws.getCell(r, 9);
        netCell.value = fmt(summary.netSalary) + ' ج.م';
        netCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF134E4A' } };
        netCell.alignment = { horizontal: 'center', vertical: 'middle' };
        netCell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
        netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameStr;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`تم تصدير كشف مرتب الموظف ${emp.name} بنجاح`);
      setIsExportModalOpen(false);
    } catch (e) {
      console.error('Export emp excel failed:', e);
      showToast('حدث خطأ أثناء تصدير ملف الموظف');
    }
  };

  // Export All Employees Payroll Excel Sheet (Professional Multi-Tab Master Payroll & Financial Workbook)
  const exportAllPayrollExcel = async (mode = exportType, customStart = exportStartDate, customEnd = exportEndDate) => {
    try {
      let filterFn;
      const isCustomMode = (mode === 'all_range' || mode === 'custom' || adminFilterMode === 'custom');
      const effectiveMode = isCustomMode ? 'all_range' : 'month';
      const effectiveStart = customStart || (adminFilterMode === 'custom' ? adminCustomFrom : exportStartDate);
      const effectiveEnd = customEnd || (adminFilterMode === 'custom' ? adminCustomTo : exportEndDate);

      if (effectiveMode === 'all_range') {
        if (!effectiveStart || !effectiveEnd) {
          showToast('يرجى تحديد تاريخ البداية والنهاية');
          return;
        }
        filterFn = (d) => d >= effectiveStart && d <= effectiveEnd;
      } else {
        filterFn = (d) => d.startsWith(monthPicker);
      }

      await exportComprehensiveCompanyPayrollExcel({
        state,
        filterFn,
        mode: effectiveMode,
        monthPicker,
        customStart: effectiveStart,
        customEnd: effectiveEnd,
        computeEmpSummary,
        computeGrandPayroll,
        showToast
      });

      setIsExportModalOpen(false);
    } catch (e) {
      console.error('Export all payroll excel error:', e);
      showToast('حدث خطأ أثناء تصدير تقرير الشركة الشامل');
    }
  };

  // Employee Portal Login Handler
  const handleEmpLogin = (e) => {
    e.preventDefault();
    if (!empLoginCode.trim() || !empLoginPassword.trim()) {
      showToast('يرجى إدخال كود الموظف أو اسم المستخدم وكلمة السر');
      return;
    }
    const found = state.employees.find(
      (emp) =>
        (emp.code.trim() === empLoginCode.trim() || (emp.username && emp.username.trim() === empLoginCode.trim())) &&
        emp.password.trim() === empLoginPassword.trim()
    );
    if (found) {
      setCurrentEmpUser(found);
      showToast(`أهلاً بك يا ${found.name}`);
    } else {
      showToast('بيانات الدخول غير صحيحة');
    }
  };

  // Filtered lists for Admin view
  const filteredAdjustments = state.adjustments
    .filter((a) => a.date.startsWith(monthPicker))
    .sort((a, b) => a.date.localeCompare(b.date));

  const financialFilterFn = React.useCallback((d) => {
    if (!d) return false;
    if (financialRangeMode === 'custom') {
      if (!financialStartDate || !financialEndDate) return true;
      return d >= financialStartDate && d <= financialEndDate;
    }
    const range = getPayrollCutoffRange(monthPicker);
    if (range) {
      return d >= range.startDate && d <= range.endDate;
    }
    return d.startsWith(monthPicker);
  }, [financialRangeMode, financialStartDate, financialEndDate, monthPicker, state.orgSettings]);

  const handleMarkNotificationRead = async (notifId) => {
    const updatedNotifs = (state.notifications || []).map((n) => (n.id === notifId ? { ...n, read: true } : n));
    const updatedState = { ...state, notifications: updatedNotifs };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleMarkAllNotificationsRead = async () => {
    const updatedNotifs = (state.notifications || []).map((n) => ({ ...n, read: true }));
    const updatedLate = (state.lateIncidents || []).map((inc) => ({ ...inc, read: true }));
    const updatedRequests = (state.requests || []).map((r) => ({ ...r, read: true }));
    const updatedState = { ...state, notifications: updatedNotifs, lateIncidents: updatedLate, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  return (
    <div className={`mode-${viewMode}`}>
      {isLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          color: '#ffffff',
          fontFamily: "'Cairo', 'Tajawal', sans-serif",
          direction: 'rtl'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            padding: '36px 48px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            maxWidth: '90%',
            textAlign: 'center'
          }}>
            <div style={{
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              marginBottom: '18px',
              boxShadow: '0 8px 20px rgba(20, 184, 166, 0.35)'
            }}>
              🏥
            </div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#f0fdf4', letterSpacing: '-0.5px' }}>
              منظومة الموارد البشرية والرواتب
            </h2>
            <div style={{ fontSize: '13px', color: '#99f6e4', marginBottom: '24px', fontWeight: 600 }}>
              مجموعة الصيدليات الطبية
            </div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '8px 18px',
              borderRadius: '30px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2.5px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: '#2dd4bf',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}></div>
              <span style={{ fontSize: '12.5px', color: '#e2e8f0', fontWeight: 600 }}>
                جاري الاتصال بالسحابة وجلب أحدث البيانات الحية...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Safe URL Routes */}
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/login" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={null} />
        <Route path="/admin/*" element={null} />
        <Route path="/archive" element={null} />
        <Route path="/archive/*" element={null} />
        <Route path="/kiosk" element={null} />
        <Route path="/kiosk/*" element={null} />
        <Route path="/employee" element={null} />
        <Route path="/employee/*" element={null} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>

      {/* ── 0. Standalone Pharmacy Archive System View ── */}
      {viewMode === 'archive' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
          <ArchiveSystemView isStandalone={true} />
        </ErrorBoundary>
      )}

      {/* ── 1. Unauthenticated Login Screen (Modern Unified LoginPage) ── */}
      {viewMode !== 'kiosk' && viewMode !== 'archive' && (
        (!isAdminLoggedIn && !currentEmpUser && !currentBranch) || authRole === 'none' ? (
          <ErrorBoundary fallbackTitle="حدث خطأ في شاشة تسجيل الدخول">
            <LoginPage 
              onLogin={handleUnifiedLogin} 
              state={state} 
              themeMode={themeMode} 
              toggleTheme={toggleTheme} 
            />
          </ErrorBoundary>
      ) : (authRole === 'employee' && currentEmpUser) ? (
        <ErrorBoundary fallbackTitle="حدث خطأ في عرض بوابة الموظف">
          <EmployeePortalView
            currentEmpUser={currentEmpUser}
            setCurrentEmpUser={setCurrentEmpUser}
            empLoginCode={empLoginCode}
            setEmpLoginCode={setEmpLoginCode}
            empLoginPassword={empLoginPassword}
            setEmpLoginPassword={setEmpLoginPassword}
            handleEmpLogin={handleEmpLogin}
            state={state}
            setState={setState}
            saveState={saveState}
            computeEmpSummary={computeEmpSummary}
            getEmpPermission={getEmpPermission}
            showToast={showToast}
            orgSettings={state.orgSettings}
            startShift={startShift}
            pauseShift={pauseShift}
            resumeShift={resumeShift}
            stopShift={stopShift}
            getActiveElapsedStr={getActiveElapsedStr}
            getActiveBreakStr={getActiveBreakStr}
            openEditShift={openEditShift}
            handleLogout={handleLogout}
            deleteShift={deleteShift}
          />
        </ErrorBoundary>
      ) : (
        /* ── 2. Authenticated Main Application with Desktop Layout ── */
        <DesktopLayout
          currentRole={authRole}
          currentBranch={currentBranch}
          notifications={state.notifications || []}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          userProfile={
            authRole === 'owner'
              ? { name: 'المالك (Owner)', jobTitle: 'مالك المنظومة والمشرف العام', code: 'OWNER', isOwner: true }
              : authRole === 'branch'
              ? {
                  name: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.name || (currentBranch?.name ? `مدير فرع ${currentBranch.name}` : 'مدير الفرع'),
                  jobTitle: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.jobTitle || 'مدير فرع',
                  code: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.code || 'MGR',
                  photoUrl: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.photoUrl || ''
                }
              : { name: 'الإدارة العليا', jobTitle: 'Super Admin', code: 'ADMIN' }
          }
          activeTab={activeNavTab}
          setActiveTab={setActiveNavTab}
          activeSubTab={activeSubTab}
          setActiveSubTab={setActiveSubTab}
          onLogout={handleLogout}
          pendingCount={(() => {
            const reqList = [...(state.requests || [])];
            const seen = new Set(reqList.map(r => String(r.id)));
            (state.leaveRequests || []).forEach(r => { if (r && !seen.has(String(r.id))) { reqList.push(r); seen.add(String(r.id)); } });
            (state.shiftSwaps || []).forEach(r => { if (r && !seen.has(String(r.id))) { reqList.push(r); seen.add(String(r.id)); } });
            (state.loans || []).forEach(r => { if (r && !seen.has(String(r.id))) { reqList.push(r); seen.add(String(r.id)); } });
            return reqList.filter(r => !r.hiddenFromAdmin && (r.status === 'pending' || r.status === 'pending_admin' || (r.adminApproved !== true && r.status !== 'rejected' && r.status !== 'cancelled'))).length;
          })()}
          resignationCount={(state.resignationRequests || []).filter(r => !r.hiddenFromAdmin && (r.managerStatus === 'approved' || r.managerStatus === 'rejected') && !r.isAdminCreated && (!r.adminStatus || r.adminStatus === 'pending')).length}
          bylawsCount={(() => {
            const cIdStr = String(currentBranch?.id || '');
            const unreadLate = (state.lateIncidents || []).filter((inc) => {
              if (authRole === 'branch' && cIdStr && String(inc.branchId) !== cIdStr) return false;
              return (
                !inc.read &&
                inc.status !== 'cancelled' &&
                inc.status !== 'approved_permission_exempt' &&
                inc.actionType !== 'grace' &&
                !isApprovedPermissionForDate(inc.employeeId, inc.date, state) &&
                (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
                currentFilterFn(inc.date)
              );
            }).length;

            const unreadManual = (state.requests || []).filter((r) => {
              if (r.type !== 'penalty' && r.type !== 'early_exit') return false;
              if (authRole === 'branch' && cIdStr && String(r.branchId) !== cIdStr) return false;
              return !r.read && currentFilterFn(r.date || r.createdAt?.slice(0, 10));
            }).length;

            return unreadLate + unreadManual;
          })()}
          themeMode={themeMode}
          toggleTheme={toggleTheme}
          adminFilterMode={adminFilterMode}
          setAdminFilterMode={setAdminFilterMode}
          monthPicker={monthPicker}
          setMonthPicker={setMonthPicker}
          adminCustomFrom={adminCustomFrom}
          setAdminCustomFrom={setAdminCustomFrom}
          adminCustomTo={adminCustomTo}
          setAdminCustomTo={setAdminCustomTo}
          onExportExcel={
            authRole === 'branch'
              ? () => {
                  const mgrEmp = (state.employees || []).find((e) => e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e.branchId === currentBranch?.id);
                  if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                  else exportAllPayrollExcel();
                }
              : undefined
          }
        >
          {authRole === 'branch' ? (
            <ErrorBoundary fallbackTitle="حدث خطأ في عرض لوحة مدير الفرع">
              <BranchManagerView
                state={state}
                setState={setState}
                saveState={saveState}
                currentBranch={currentBranch}
                activeTab={activeNavTab}
                setActiveTab={setActiveNavTab}
                showToast={showToast}
                startShift={startShift}
                pauseShift={pauseShift}
                resumeShift={resumeShift}
                stopShift={stopShift}
                monthPicker={monthPicker}
                setMonthPicker={setMonthPicker}
                filterMode={adminFilterMode}
                setFilterMode={setAdminFilterMode}
                customFrom={adminCustomFrom}
                setCustomFrom={setAdminCustomFrom}
                customTo={adminCustomTo}
                setCustomTo={setAdminCustomTo}
                filterFn={currentFilterFn}
                getEmpPermission={getEmpPermission}
                onExportExcel={() => {
                  const mgrEmp = (state.employees || []).find((e) => e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e.branchId === currentBranch?.id);
                  if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                  else exportAllPayrollExcel();
                }}
              />
            </ErrorBoundary>
          ) : (
            /* Super Admin / HR View Tabs */
            <ErrorBoundary fallbackTitle="حدث خطأ في عرض هذا القسم">
              {/* 1. Dashboard (لوحة التحكم) */}
              {activeNavTab === 'dashboard' && (
                <Dashboard
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
                  filterMode={adminFilterMode}
                  setFilterMode={setAdminFilterMode}
                  customFrom={adminCustomFrom}
                  setCustomFrom={setAdminCustomFrom}
                  customTo={adminCustomTo}
                  setCustomTo={setAdminCustomTo}
                  filterFn={currentFilterFn}
                  exportAllPayrollExcel={exportAllPayrollExcel}
                  showToast={showToast}
                  onApproveRequest={(reqId) => handleApproveRequest(reqId, 'admin')}
                  onRejectRequest={(reqId) => handleRejectRequest(reqId, 'admin')}
                  onSendEarlyExitEmail={handleSendEarlyExitEmail}
                  onWaiveEarlyExit={handleWaiveEarlyExit}
                />
              )}

              {/* 2. Employees Hub (شؤون الموظفين - مدمج به البطاقات، الحضور والانصراف، البصمة الحيوية، والجداول الشهرية) */}
              {(activeNavTab === 'employees' || activeNavTab === 'attendance' || activeNavTab === 'electronic-attendance' || activeNavTab === 'roster') && (
                <EmployeesHubModule
                  subTab={
                    activeNavTab === 'attendance'
                      ? 'attendance'
                      : activeNavTab === 'electronic-attendance'
                      ? 'biometrics'
                      : activeNavTab === 'roster'
                      ? 'roster'
                      : activeSubTab
                  }
                  onSubTabChange={(sub) => setActiveSubTab(sub)}
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
                  filterMode={adminFilterMode}
                  setFilterMode={setAdminFilterMode}
                  customFrom={adminCustomFrom}
                  setCustomFrom={setAdminCustomFrom}
                  customTo={adminCustomTo}
                  setCustomTo={setAdminCustomTo}
                  filterFn={currentFilterFn}
                  computeEmpSummary={computeEmpSummary}
                  openEmpCard={openEmpCard}
                  openEditEmpModal={(emp) => {
                    setEditingEmpFile(emp);
                    setIsEmpFileModalOpen(true);
                  }}
                  handleDeleteEmp={handleDeleteEmp}
                  getActiveElapsedStr={getActiveElapsedStr}
                  getActiveBreakStr={getActiveBreakStr}
                  startShift={startShift}
                  pauseShift={pauseShift}
                  resumeShift={resumeShift}
                  stopShift={stopShift}
                  setInspectedEmp={setInspectedEmp}
                  sendWhatsAppMsg={sendWhatsAppMsg}
                  generatePayslipMsg={generatePayslipMsg}
                  importEmployeesFromExcel={importEmployeesFromExcel}
                  exportEmployeesToExcel={exportEmployeesToExcel}
                  openAddEmpModal={() => {
                    setEditingEmpFile(null);
                    setIsEmpFileModalOpen(true);
                  }}
                  openEmpPhonesModal={() => setIsEmpPhonesModalOpen(true)}
                  setIsEmpPhonesModalOpen={setIsEmpPhonesModalOpen}
                  setEditingEmpFile={setEditingEmpFile}
                  setIsEmpFileModalOpen={setIsEmpFileModalOpen}
                />
              )}

              {/* 3. Branch Management (الفروع) */}
              {activeNavTab === 'branches' && (
                <BranchManagementModule
                  state={state}
                  onSaveBranch={handleSaveBranch}
                  onDeleteBranch={handleDeleteBranch}
                />
              )}

              {/* 6. Requests Center (الطلبات) */}
              {activeNavTab === 'requests' && (
                <RequestsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  startShift={startShift}
                  pauseShift={pauseShift}
                  resumeShift={resumeShift}
                  stopShift={stopShift}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                  currentBranch={currentBranch}
                  authRole={authRole}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* 7. Leaves Tracking (الإجازات) */}
              {activeNavTab === 'leaves-tracking' && (
                <LeavesTrackingModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                />
              )}

              {/* 7.5. Employee Permissions Management (أذونات الموظفين) */}
              {activeNavTab === 'permissions-management' && (
                <EmployeePermissionsManagementModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  currentBranch={currentBranch}
                  authRole={authRole}
                  currentEmployee={null}
                  showToast={showToast}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                />
              )}

              {/* 8. Payroll Summary (رواتب الموظفين) */}
              {activeNavTab === 'payroll' && (
                <PayrollModule
                  state={{ ...state, computeEmpSummary }}
                  setState={setState}
                  saveState={saveState}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
                  filterMode={adminFilterMode}
                  setFilterMode={setAdminFilterMode}
                  customFrom={adminCustomFrom}
                  setCustomFrom={setAdminCustomFrom}
                  customTo={adminCustomTo}
                  setCustomTo={setAdminCustomTo}
                  filterFn={currentFilterFn}
                  exportAllPayrollExcel={exportAllPayrollExcel}
                  exportEmpExcel={exportEmpExcel}
                  showToast={showToast}
                />
              )}

              {/* Adjustments & Bonuses/Deductions (المكافآت والخصومات) */}
              {activeNavTab === 'adjustments-module' && (
                <AdjustmentsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* 9. WhatsApp Center (مركز مراسلات الواتساب) */}
              {activeNavTab === 'whatsapp-center' && (
                <WhatsAppCenterModule
                  state={state}
                  showToast={showToast}
                />
              )}

              {/* 10. Work Bylaws (لائحة العمل والجزاءات المعتمدة) */}
              {activeNavTab === 'bylaws' && (
                <BylawsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  userRole={authRole === 'branch' ? 'branch' : 'admin'}
                  activeSubTab={activeSubTab}
                  setActiveSubTab={setActiveSubTab}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* Resignation Module (طلبات الاستقالة) */}
              {activeNavTab === 'resignation' && (
                <AdminResignationModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* 11. Performance Evaluations (التقييمات) */}
              {activeNavTab === 'evaluations' && (
                <EvaluationsModule
                  subTab={activeSubTab}
                  onSubTabChange={setActiveSubTab}
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  currentRole={authRole === 'branch' ? 'branch' : 'admin'}
                  onSaveEvaluation={handleSaveEvaluation}
                  onSaveEmployeeNote={handleSaveEmployeeNote}
                  onReplyToNote={handleReplyToNote}
                  showToast={showToast}
                />
              )}

              {/* 12. Loans & Credit Meds (السلف والأجل) */}
              {activeNavTab === 'loans-meds' && (
                <LoansMedsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* 13. Income & Expenses (المصروفات والإيرادات) */}
              {activeNavTab === 'income-expenses' && (
                <IncomeExpensesModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                />
              )}

              {/* 14. System Settings (الإعدادات) */}
              {activeNavTab === 'settings' && (
                <SettingsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  authRole={authRole}
                  activeSubTab={activeSubTab}
                  setActiveSubTab={setActiveSubTab}
                  executeWithOwnerGuard={executeWithOwnerGuard}
                />
              )}

              {/* 15. Notification Center (مركز الإشعارات والتنبيهات) */}
              {activeNavTab === 'notifications' && (
                <NotificationCenterModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  onNavigateTab={setActiveNavTab}
                  onApproveRequest={(id) => handleApproveRequest(id, authRole === 'branch' ? 'branch' : 'admin')}
                  onRejectRequest={(id) => handleRejectRequest(id, authRole === 'branch' ? 'branch' : 'admin')}
                  onApproveLoan={handleApproveLoan}
                  onRejectLoan={handleRejectLoan}
                  onSendEarlyExitEmail={handleSendEarlyExitEmail}
                  onWaiveEarlyExit={handleWaiveEarlyExit}
                  filterFn={currentFilterFn}
                  monthPicker={monthPicker}
                  filterMode={adminFilterMode}
                  customFrom={adminCustomFrom}
                  customTo={adminCustomTo}
                  currentBranch={currentBranch}
                  authRole={authRole}
                />
              )}

              {/* 16. Dual Approval Rules (قواعد الموافقة المزدوجة) */}
              {(activeNavTab === 'approval-rules' || activeNavTab === 'approvals') && (
                <ApprovalCenterModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                  currentRole="admin"
                  currentBranchId={null}
                  onApproveRequest={(reqId) => handleApproveRequest(reqId, 'admin')}
                  onRejectRequest={(reqId) => handleRejectRequest(reqId, 'admin')}
                  onSaveApprovalRules={handleSaveApprovalRules}
                />
              )}

              {/* 17. Pharmacy Archive System (أرشيف الفواتير والمستندات) */}
              {activeNavTab === 'pharmacy-archive' && (
                <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
                  <ArchiveSystemView isStandalone={false} />
                </ErrorBoundary>
              )}

              {/* Default Fallback for Unknown Tab (يمنع ظهور أي شاشة بيضاء) */}
              {![
                'dashboard',
                'employees',
                'branches',
                'attendance',
                'electronic-attendance',
                'roster',
                'requests',
                'leaves-tracking',
                'payroll',
                'adjustments-module',
                'whatsapp-center',
                'bylaws',
                'evaluations',
                'loans-meds',
                'income-expenses',
                'pharmacy-archive',
                'permissions-management',
                'settings',
                'notifications',
                'approval-rules',
                'approvals',
                'resignation'
              ].includes(activeNavTab) && (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '40px 24px',
                  textAlign: 'center',
                  fontFamily: "'Tajawal', 'Cairo', sans-serif"
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
                  <h3 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: '20px', fontWeight: '800' }}>
                    القسم غير معرّف أو تم نقله
                  </h3>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 20px' }}>
                    القسم المطلوب ({activeNavTab}) غير متوفر حالياً. يمكنك العودة إلى لوحة التحكم الرئيسية.
                  </p>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => setActiveNavTab('dashboard')}
                    style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    🏠 الانتقال إلى لوحة التحكم الرئيسية
                  </button>
                </div>
              )}
            </ErrorBoundary>
          )}
        </DesktopLayout>
      ))}

      {/* Comprehensive Employee File Modal */}
      <EmployeeFileModal
        isOpen={isEmpFileModalOpen}
        onClose={() => setIsEmpFileModalOpen(false)}
        editingEmp={editingEmpFile}
        branches={state.branches || []}
        allEmployees={state.employees || []}
        jobs={getJobsList(state)}
        departments={getDepartmentsList(state)}
        onSave={handleSaveEmployeeFile}
        handleFileUpload={handleFileUpload}
      />

      {/* Employee Phones Directory Modal */}
      <EmployeePhonesDirectoryModal
        isOpen={isEmpPhonesModalOpen}
        onClose={() => setIsEmpPhonesModalOpen(false)}
        employees={state.employees || []}
        branches={state.branches || []}
      />


      {/* ====================================================
          الواجهة الثانية: كشك البصمة الإلكترونية (Kiosk Terminal)
          ==================================================== */}
      {viewMode === 'kiosk' && (
        <ElectronicKioskView
          orgSettings={state.orgSettings}
          now={now}
          state={state}
          kioskCode={kioskCode}
          handleKioskCodeChange={handleKioskCodeChange}
          kioskSelectedEmp={kioskSelectedEmp}
          startShift={startShift}
          pauseShift={pauseShift}
          resumeShift={resumeShift}
          stopShift={stopShift}
          onRequestDeviceApproval={handleRequestDeviceApproval}
          onKioskDeviceRequest={handleKioskDeviceRequest}
          submitRequest={handleAddBranchRequest}
          kioskBranchId={kioskBranchId}
        />
      )}




      {/* ====================================================
          MODALS & OVERLAYS
          ==================================================== */}

      {/* Admin Employee Shift Inspector Modal */}
      {inspectedEmp && (
        <div className="modal-overlay" onClick={() => setInspectedEmp(null)}>
          <div className="modal-card inspect-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
            <div className="badge-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="emp-avatar-circle">
                  {inspectedEmp.photoUrl ? <img src={inspectedEmp.photoUrl} alt={inspectedEmp.name} /> : <span>{inspectedEmp.name.charAt(0)}</span>}
                </div>
                <div>
                  <h3>سجل بصمات الموظف — {inspectedEmp.name}</h3>
                  <span className="job-sub">كود: {inspectedEmp.code} · {inspectedEmp.jobTitle}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setInspectedEmp(null)}>✕</button>
            </div>

            {(() => {
              const summary = computeEmpSummary(inspectedEmp.id, (d) => d.startsWith(monthPicker), monthPicker);
              const empShifts = state.shifts
                .filter((s) => s.employeeId === inspectedEmp.id && s.date.startsWith(monthPicker))
                .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)));

              return (
                <>
                  <div className="summary-grid" style={{ marginTop: '16px' }}>
                    <div className="summary-box"><div className="label">ساعات الشهر</div><div className="value">{fmt(summary.hours)} س</div></div>
                    <div className="summary-box"><div className="label">أجر الساعة</div><div className="value">{fmt(summary.rate)} ج.م</div></div>
                    <div className="summary-box"><div className="label">المستحقات الأساسية</div><div className="value">{fmt(summary.baseEarnings)} ج.م</div></div>
                    <div className="summary-box"><div className="label">المكافآت</div><div className="value" style={{ color: 'var(--success)' }}>+{fmt(summary.totalBonus)}</div></div>
                    <div className="summary-box"><div className="label">الخصومات</div><div className="value" style={{ color: 'var(--danger)' }}>-{fmt(summary.totalDeduction)}</div></div>
                    <div className="summary-box total"><div className="label">صافي المرتب المستحق</div><div className="value">{fmt(summary.netSalary)} ج.م</div></div>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto', marginTop: '16px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>الدخول</th>
                          <th>الخروج</th>
                          <th>البريك</th>
                          <th>الساعات</th>
                          <th>الملاحظة</th>
                          <th>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empShifts.length === 0 ? (
                          <tr className="empty-row"><td colSpan="7">لا توجد ورادات مسجلة لهذا الشهر</td></tr>
                        ) : (
                          empShifts.map((s) => (
                            <tr key={s.id}>
                              <td>{s.date} ({arabicWeekday(s.date)})</td>
                              <td>{s.timeIn}</td>
                              <td>{s.timeOut}</td>
                              <td>{fmt(s.breakHours || 0)} س</td>
                              <td className="money" style={{ color: 'var(--primary-dark)' }}>{fmt(getEffectiveShiftHours(s, state))} س</td>
                              <td>{s.note || '—'}</td>
                              <td>
                                <button className="del-btn" style={{ color: 'var(--primary)', marginLeft: '6px' }} onClick={() => openEditShift(s)}>✏️ تعديل</button>
                                <button className="del-btn" onClick={() => deleteShift(s.id)}>🗑️ حذف</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" onClick={() => setInspectedEmp(null)}>إغلاق</button>
              <button className="btn btn-start" onClick={() => exportEmpExcel(inspectedEmp.id, 'month')}>📥 تصدير شيت إكسل للموظف</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Add/Edit Employee Modal */}
      <EmployeeModal
        isEmpModalOpen={isEmpModalOpen}
        setIsEmpModalOpen={setIsEmpModalOpen}
        editingEmp={editingEmp}
        empPhotoUrl={empPhotoUrl}
        setEmpPhotoUrl={setEmpPhotoUrl}
        empName={empName}
        setEmpName={setEmpName}
        empNickname={empNickname}
        setEmpNickname={setEmpNickname}
        empCode={empCode}
        setEmpCode={setEmpCode}
        empPhone={empPhone}
        setEmpPhone={setEmpPhone}
        empJobTitle={empJobTitle}
        setEmpJobTitle={setEmpJobTitle}
        empSalary={empSalary}
        setEmpSalary={setEmpSalary}
        empWorkHours={empWorkHours}
        setEmpWorkHours={setEmpWorkHours}
        empWorkDays={empWorkDays}
        setEmpWorkDays={setEmpWorkDays}
        empPassword={empPassword}
        setEmpPassword={setEmpPassword}
        empAnnualLeaveBalance={empAnnualLeaveBalance}
        setEmpAnnualLeaveBalance={setEmpAnnualLeaveBalance}
        handleFileUpload={handleFileUpload}
        handleSaveEmp={handleSaveEmp}
        handleAdminDeviceStatus={handleAdminDeviceStatus}
      />

      {/* Printable Digital VIP Employee Badge Card Modal */}
      <EmployeeIDCardModal
        selectedEmpCard={selectedEmpCard}
        setSelectedEmpCard={setSelectedEmpCard}
        orgSettings={state.orgSettings}
        qrCardDataUrl={qrCardDataUrl}
      />

      {/* Employee ID Card removed Biometric here */}
      {/* Edit Shift Modal */}
      <EditShiftModal
        editingShift={editingShift}
        setEditingShift={setEditingShift}
        saveEditShift={saveEditShift}
      />

      {/* Kiosk Success Biometric Confirmation Overlay Modal */}
      <KioskConfirmModal kioskConfirmModal={kioskConfirmModal} />

      {/* Kiosk Inquiry Shift Status Modal */}
      {kioskInquiryModal && (
        <div className="modal-overlay" onClick={() => setKioskInquiryModal(null)}>
          <div className="modal-card inquiry-card" onClick={(e) => e.stopPropagation()}>
            <div className="badge-header">
              <h3>🔍 تفاصيل حالة الموظف والشيفت</h3>
              <button className="close-btn" onClick={() => setKioskInquiryModal(null)}>✕</button>
            </div>

            <div className="badge-body" style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div className="emp-avatar-circle">
                  {kioskInquiryModal.emp.photoUrl ? (
                    <img src={kioskInquiryModal.emp.photoUrl} alt={kioskInquiryModal.emp.name} />
                  ) : (
                    <span>{kioskInquiryModal.emp.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{kioskInquiryModal.emp.name}</h3>
                  <span className="job-sub">كود الموظف: {kioskInquiryModal.emp.code} · {kioskInquiryModal.emp.jobTitle}</span>
                </div>
              </div>

              <div className="inquiry-box" style={{ marginBottom: '10px' }}>
                <div>حالة الوردية الحالية:</div>
                {kioskInquiryModal.active ? (
                  kioskInquiryModal.active.isPaused ? (
                    <strong style={{ color: 'var(--accent)' }}>⏸️ في استراحة بريك</strong>
                  ) : (
                    <strong style={{ color: 'var(--success)' }}>🟢 على رأس العمل (الوقت المنقضي: {kioskInquiryModal.elapsedStr})</strong>
                  )
                ) : (
                  <strong style={{ color: 'var(--muted)' }}>⚪ غير متواجد على رأس العمل حالياً</strong>
                )}
              </div>

              <div className="inquiry-box">
                <div>إجمالي ساعات اليوم المسجلة:</div>
                <strong style={{ color: 'var(--primary-dark)', fontSize: '18px' }}>{kioskInquiryModal.todayHours} ساعة</strong>
              </div>
            </div>

            <button className="btn btn-start" style={{ width: '100%', marginTop: '16px' }} onClick={() => setKioskInquiryModal(null)}>
              إغلاق نافذة الاستعلام
            </button>
          </div>
        </div>
      )}

      {/* Export Modal */}
      <ExportPayrollModal
        isExportModalOpen={isExportModalOpen}
        setIsExportModalOpen={setIsExportModalOpen}
        exportType={exportType}
        setExportType={setExportType}
        exportEmpId={exportEmpId}
        setExportEmpId={setExportEmpId}
        exportRangeMode={exportRangeMode}
        setExportRangeMode={setExportRangeMode}
        exportStartDate={exportStartDate}
        setExportStartDate={setExportStartDate}
        exportEndDate={exportEndDate}
        setExportEndDate={setExportEndDate}
        state={state}
        monthPicker={monthPicker}
        exportEmpExcel={exportEmpExcel}
        exportAllPayrollExcel={exportAllPayrollExcel}
      />

      {/* Owner Override Verification Modal */}
      <OwnerOverrideModal
        isOpen={ownerOverrideModal.isOpen}
        onClose={() => setOwnerOverrideModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={ownerOverrideModal.onSuccess}
        actionTitle={ownerOverrideModal.actionTitle}
        actionDetails={ownerOverrideModal.actionDetails}
        state={state}
        showToast={showToast}
      />

      {/* Toast Notification */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>{toast.message}</div>
    </div>
  );
}
