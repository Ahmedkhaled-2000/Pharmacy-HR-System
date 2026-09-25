import React, { Suspense, lazy, useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { getPublicSystemUrl } from '../utils/systemUrlHelper';

import ErrorBoundary from '../components/common/ErrorBoundary';
import LoginPage from '../components/auth/LoginPage';
import DesktopLayout from '../components/layout/DesktopLayout';
import Dashboard from '../components/dashboard/Dashboard';
import EmployeesHubModule from '../components/employees/EmployeesHubModule';
// Lazy Loaded Independent Systems (Code-Splitting for Lightning Speed)
const BranchManagementModule = lazy(() => import('../components/branches/BranchManagementModule'));
const BranchMonthlyRosterModule = lazy(() => import('../components/branches/BranchMonthlyRosterModule'));
const BranchSalesModule = lazy(() => import('../components/branches/BranchSalesModule'));
const RequestsModule = lazy(() => import('../components/requests/RequestsModule'));
const LeavesTrackingModule = lazy(() => import('../components/leaves/LeavesTrackingModule'));
const EmployeePermissionsManagementModule = lazy(() => import('../components/permissions/EmployeePermissionsManagementModule'));
const PayrollModule = lazy(() => import('../components/payroll/PayrollModule'));
const AdjustmentsModule = lazy(() => import('../components/adjustments/AdjustmentsModule'));
const WhatsAppCenterModule = lazy(() => import('../components/whatsapp/WhatsAppCenterModule'));
const AdminDirectivesModule = lazy(() => import('../components/directives/AdminDirectivesModule'));
const BylawsModule = lazy(() => import('../components/bylaws/BylawsModule'));
const AdminResignationModule = lazy(() => import('../components/resignation/AdminResignationModule'));
const EvaluationsModule = lazy(() => import('../components/evaluations/EvaluationsModule'));
const LoansMedsModule = lazy(() => import('../components/loans/LoansMedsModule'));
const IncomeExpensesModule = lazy(() => import('../components/finance/IncomeExpensesModule'));
const FinancialReportsModule = lazy(() => import('../components/finance/FinancialReportsModule'));
const SettingsModule = lazy(() => import('../components/settings/SettingsModule'));
const NotificationCenterModule = lazy(() => import('../components/notifications/NotificationCenterModule'));
const ApprovalCenterModule = lazy(() => import('../components/approvals/ApprovalCenterModule'));

// Lazy Loaded Independent Systems (Code-Splitting for Lightning Speed)
const EmployeePortalView = lazy(() => import('../components/employee-portal/EmployeePortalView'));
const BranchManagerView = lazy(() => import('../components/branch-manager/BranchManagerView'));
const ArchiveSystemView = lazy(() => import('../components/archive/ArchiveSystemView'));
const AccountsSystemView = lazy(() => import('../components/accounts/AccountsSystemView'));
const PublicCandidateApplyPortal = lazy(() => import('../components/recruitment/PublicCandidateApplyPortal'));
const InterviewerEvaluationPortal = lazy(() => import('../components/recruitment/InterviewerEvaluationPortal'));
const ElectronicKioskView = lazy(() => import('../components/kiosk/ElectronicKioskView'));
const DeveloperPortalView = lazy(() => import('../components/developer/DeveloperPortalView'));
const CompanyRegisterPage = lazy(() => import('../components/auth/CompanyRegisterPage'));
const OutstockSystemView = lazy(() => import('../components/outstock/OutstockSystemView'));
import OutstockOwnerGate from '../components/outstock/OutstockOwnerGate';
import AdminSuspensionView from '../components/auth/AdminSuspensionView';
import StaffSuspensionView from '../components/auth/StaffSuspensionView';
import GhostModeBanner from '../components/common/GhostModeBanner';
import SystemLockScreen from '../components/common/SystemLockScreen';
import ScreenMaintenanceView from '../components/common/ScreenMaintenanceView';

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useNotifications } from '../context/NotificationContext';
import { useAttendanceEngine } from '../hooks/useAttendanceEngine';
import { useRequestsManager } from '../hooks/useRequestsManager';
import { useExcelOperations } from '../hooks/useExcelOperations';
import { useDailyDigestCron } from '../hooks/useDailyDigestCron';
import { arabicMonthLabel, fmt, getEmpWhatsAppPhone, normalizeState } from '../utils/formatters';
import { fetchRemoteState, saveStateLocally } from '../utils/offlineSync';
import { smartMergeStates } from '../utils/stateMerger';
import { apiLogin } from '../utils/apiClient';
import { outstockLogin, outstockGetBranches } from '../utils/outstockApiClient';

export default function AppRoutes() {
  const location = useLocation();
  const [selectedRosterBranchId, setSelectedRosterBranchId] = useState('');

  // حالة إيقاف النظام مؤقتاً (Scroll Lock) - تستمر سارية حتى بعد إغلاق التطبيق أو المتصفح أو إعادة تشغيل الجهاز
  const [isSystemLocked, setIsSystemLocked] = useState(() => {
    try {
      return localStorage.getItem('app_system_locked') === 'true' || sessionStorage.getItem('app_system_locked') === 'true';
    } catch {
      return false;
    }
  });

  const {
    themeMode,
    toggleTheme,
    authRole,
    currentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    activeNavTab,
    setActiveNavTab,
    activeSubTab,
    setActiveSubTab,
    isAdminLoggedIn,
    handleUnifiedLogin,
    handleEmpLogin,
    handleLogout
  } = useAuth();

  const {
    state,
    setState,
    saveState,
    triggerManualSync,
    isLoading,
    isSyncing,
    lastSyncTime,
    isOffline,
    pendingSyncCount,
    getEmp,
    getEmpPermission,
    computeEmpSummary,
    computeGrandPayroll
  } = useData();

  // ── فحص حالة إيقاف الشركة أو تعليق الحساب (Tenant Suspension State) ──
  const [tenantSuspension, setTenantSuspension] = useState(() => {
    try {
      const saved = localStorage.getItem('app_tenant_suspension');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleStatusChange = (e) => {
      const data = e?.detail || e;
      if (!data) return;
      if (data.status === 'suspended' || data.status === 'expired' || data.isSuspended) {
        const suspObj = {
          isSuspended: true,
          reason: data.suspension_reason || data.reason || 'تم تعليق حساب المنظومة',
          customAdminMsg: data.custom_admin_msg || data.customAdminMsg || '',
          customStaffMsg: data.custom_staff_msg || data.customStaffMsg || ''
        };
        setTenantSuspension(suspObj);
        try { localStorage.setItem('app_tenant_suspension', JSON.stringify(suspObj)); } catch {}
      } else if (data.status === 'active') {
        setTenantSuspension(null);
        try { localStorage.removeItem('app_tenant_suspension'); } catch {}
      }
    };

    window.addEventListener('app:tenant-suspended', handleStatusChange);
    return () => {
      window.removeEventListener('app:tenant-suspended', handleStatusChange);
    };
  }, []);

  // ── فحص حالة صيانة شاشات المنظومة وبيئة Sandbox ──
  const [maintenanceStatus, setMaintenanceStatus] = useState(() => {
    try {
      const saved = localStorage.getItem('app_maintenance_status');
      return saved ? JSON.parse(saved) : { disabled_screens: [], screen_messages: {}, is_global_outage: false };
    } catch {
      return { disabled_screens: [], screen_messages: {}, is_global_outage: false };
    }
  });

  const [sandboxBypassedScreens, setSandboxBypassedScreens] = useState(() => {
    try {
      const isGlobal = sessionStorage.getItem('sandbox_bypass_global') === 'true';
      return { global: isGlobal };
    } catch {
      return {};
    }
  });

  // مزامنة حالة الصيانة الدورية مع السيرفر
  useEffect(() => {
    const fetchMaintenance = async () => {
      try {
        const res = await fetch('/api/system/maintenance-status', { cache: 'no-store' });
        const data = await res.json();
        if (data && data.success) {
          setMaintenanceStatus(data);
          try { localStorage.setItem('app_maintenance_status', JSON.stringify(data)); } catch {}
        }
      } catch {}
    };

    fetchMaintenance();
    const interval = setInterval(fetchMaintenance, 20000);
    return () => clearInterval(interval);
  }, []);

  const tabTitles = useMemo(() => ({
    dashboard: 'لوحة القيادة الرئيسية والورديات',
    employees: 'الموظفين والحضور',
    attendance: 'سجل الحضور والانصراف',
    'electronic-attendance': 'البصمة الحيوية وبصمة الوجه',
    roster: 'شفتات العمل والجدول',
    branches: 'إدارة الفروع والصيدليات',
    payroll: 'مسير الرواتب المعتمد',
    requests: 'مركز الطلبات والموافقات',
    bylaws: 'لائحة العمل والجزاءات التأديبية',
    accounts: 'شجرة الحسابات والمالية (ERP)',
    financials: 'المصروفات والإيرادات والتقارير المالية',
    income_expenses: 'المصروفات والإيرادات اليومية',
    archive: 'أرشيف الفواتير ومطابقة الموردين',
    pharmacy_archive: 'أرشيف الفواتير السحابي',
    careers: 'بوابة التوظيف والمقابلات',
    recruitment: 'بوابة التوظيف وفرز السير الذاتية',
    whatsapp_center: 'مركز مراسلات الواتساب التلقائي',
    outstock: 'نظام متابعة نواقص وطلبات أدوية العملاء والفروع (OutStock Handling)'
  }), []);

  const isScreenInMaintenance = useCallback((tabKey, subTabKey = '') => {
    if (authRole === 'developer') return false;
    if (sandboxBypassedScreens.global) return false;
    if (sandboxBypassedScreens[tabKey] || (subTabKey && sandboxBypassedScreens[subTabKey])) {
      return false;
    }

    const disabledList = maintenanceStatus?.disabled_screens || [];
    if (!Array.isArray(disabledList) || disabledList.length === 0) return false;

    const keyMap = {
      dashboard: ['dashboard'],
      employees: ['dashboard'],
      attendance: ['dashboard'],
      'electronic-attendance': ['biometrics', 'dashboard'],
      roster: ['dashboard'],
      branches: ['branches'],
      payroll: ['payroll'],
      requests: ['requests'],
      bylaws: ['bylaws'],
      accounts: ['accounts'],
      income_expenses: ['income_expenses'],
      financials: ['income_expenses'],
      archive: ['pharmacy_archive'],
      careers: ['recruitment'],
      recruitment: ['recruitment'],
      whatsapp_center: ['whatsapp_center']
    };

    const targetModules = keyMap[tabKey] || [tabKey];
    return targetModules.some(modId => disabledList.includes(modId));
  }, [authRole, sandboxBypassedScreens, maintenanceStatus]);

  const handleSandboxBypass = (screenId) => {
    setSandboxBypassedScreens(prev => ({ ...prev, [screenId]: true, global: true }));
    try {
      sessionStorage.setItem(`sandbox_bypass_${screenId}`, 'true');
      sessionStorage.setItem('sandbox_bypass_global', 'true');
    } catch {}
    showToast?.('🧪 تم تفعيل وضع تجربة المطور (Sandbox) بنجاح');
  };

  // ── وضع محاكاة المطور كمالك شركة (Tenant Impersonation / Ghost Mode) ──
  const [isImpersonating, setIsImpersonating] = useState(() => {
    try {
      return localStorage.getItem('app_is_impersonating') === 'true';
    } catch {
      return false;
    }
  });

  const impersonatedCompany = useMemo(() => {
    try {
      const raw = localStorage.getItem('app_impersonated_company');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [isImpersonating]);

  // ── مصيدة الأخطاء اللحظية وإرسالها لمركز رصد المطور (Telemetry Bug Sentry) ──
  useEffect(() => {
    const handleWindowError = (event) => {
      try {
        const errorMsg = event.message || event.error?.message || String(event);
        const errorStack = event.error?.stack || '';
        const companyId = state?.orgSettings?.companyId || '';
        const companyCode = state?.orgSettings?.companyCode || '';
        fetch('/api/telemetry/report-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error_message: errorMsg,
            error_stack: errorStack,
            screen_name: location.pathname + (location.search || ''),
            company_id: companyId,
            company_code: companyCode,
            user_role: authRole
          })
        }).catch(() => {});
      } catch {}
    };

    window.addEventListener('error', handleWindowError);
    return () => window.removeEventListener('error', handleWindowError);
  }, [state?.orgSettings, authRole, location.pathname]);

  const {
    showToast,
    adminFilterMode,
    setAdminFilterMode,
    monthPicker,
    setMonthPicker,
    adminCustomFrom,
    setAdminCustomFrom,
    adminCustomTo,
    setAdminCustomTo,
    currentFilterFn,
    executeWithOwnerGuard,
    openEmpCard,
    openEditShift,
    setInspectedEmp,
    openEmpFileModal,
    openEmpPhonesModal,
    setEditingEmpFile,
    setIsEmpFileModalOpen
  } = useUI();

  const {
    pendingRequestsCount,
    bylawsCount,
    resignationCount,
    notifications,
    systemNotifications,
    requestNotifications,
    unreadSystemCount,
    unreadRequestCount,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleDeleteNotification,
    handleClearReadNotifications
  } = useNotifications();

  const {
    getActiveElapsedStr,
    getActiveBreakStr,
    startShift,
    pauseShift,
    resumeShift,
    stopShift,
    deleteShift,
    handleDeleteEmp,
    handleKioskDeviceRequest
  } = useAttendanceEngine();

  const {
    handleApproveRequest,
    handleRejectRequest,
    handleSendEarlyExitEmail,
    handleWaiveEarlyExit,
    handleSaveApprovalRules
  } = useRequestsManager();

  const {
    exportEmpExcel,
    exportAllPayrollExcel,
    handleExcelImport,
    exportEmployeesDirectoryExcel
  } = useExcelOperations();

  // Run Daily Digest & Alert Background Automated Cron
  useDailyDigestCron();

  // تفعيل إيقاف وقفل النظام مؤقتاً عبر زر Scroll Lock أو حدث app:lock-system (حفظ دائم)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ScrollLock' || e.code === 'ScrollLock' || e.keyCode === 145) {
        e.preventDefault();
        if (authRole && authRole !== 'none') {
          setIsSystemLocked(true);
          try {
            localStorage.setItem('app_system_locked', 'true');
            sessionStorage.setItem('app_system_locked', 'true');
          } catch {}
        }
      }
    };

    const handleLockEvent = () => {
      if (authRole && authRole !== 'none') {
        setIsSystemLocked(true);
        try {
          localStorage.setItem('app_system_locked', 'true');
          sessionStorage.setItem('app_system_locked', 'true');
        } catch {}
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('app:lock-system', handleLockEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('app:lock-system', handleLockEvent);
    };
  }, [authRole]);

  // Auto-heal activeNavTab if it was previously set to 'kiosk'
  useEffect(() => {
    if (activeNavTab === 'kiosk') {
      setActiveNavTab('dashboard');
    }
  }, [activeNavTab, setActiveNavTab]);

  // Guarantee null-safe arrays for all child components and modules
  const sanitizedState = useMemo(() => {
    if (!state) return state;
    return {
      ...state,
      employees: (state.employees || []).filter((e) => e && typeof e === 'object' && (e.id || e.code)),
      branches: (state.branches || []).filter((b) => b && typeof b === 'object' && b.id),
      shifts: (state.shifts || []).filter((s) => s && typeof s === 'object' && (s.id || s.date || s.timestamp)),
      requests: (state.requests || []).filter((r) => r && typeof r === 'object' && r.id),
      leaveRequests: (state.leaveRequests || []).filter((r) => r && typeof r === 'object' && r.id),
      lateIncidents: (state.lateIncidents || []).filter((i) => i && typeof i === 'object' && i.id),
      adjustments: (state.adjustments || []).filter((a) => a && typeof a === 'object' && a.id),
      loans: (state.loans || []).filter((l) => l && typeof l === 'object' && l.id),
      evaluations: (state.evaluations || []).filter((e) => e && typeof e === 'object' && e.id),
      rosters: (state.rosters || []).filter((r) => r && typeof r === 'object' && r.id)
    };
  }, [state]);

  // Navigation mode via URL
  const viewMode = location.pathname.startsWith('/developer')
    ? 'developer'
    : location.pathname.startsWith('/register') || location.pathname.startsWith('/subscribe')
    ? 'register'
    : location.pathname.startsWith('/careers')
    ? 'careers'
    : location.pathname.startsWith('/interview')
    ? 'interview'
    : location.pathname.startsWith('/archive')
    ? 'archive'
    : location.pathname.startsWith('/accounts')
    ? 'accounts'
    : location.pathname.startsWith('/kiosk')
    ? 'kiosk'
    : location.pathname.startsWith('/outstock')
    ? 'outstock'
    : location.pathname === '/employee'
    ? 'employee'
    : 'admin';

  const kioskBranchId = (() => {
    if (location.pathname.startsWith('/kiosk/')) {
      const seg = location.pathname.split('/')[2];
      if (seg) return decodeURIComponent(seg.split('?')[0].split('#')[0].trim());
    }
    try {
      const q = new URLSearchParams(location.search);
      const bParam = q.get('branchId') || q.get('branch');
      if (bParam) return decodeURIComponent(bParam.trim());
    } catch {}
    return null;
  })();

  const [outstockUnlockedEpoch, setOutstockUnlockedEpoch] = useState(0);

  // Domain Handlers
  const handleSaveBranch = async (branchData) => {
    const currentBranches = state.branches || [];
    const exists = currentBranches.some((b) => b && b.id === branchData.id);

    if (branchData.username && String(branchData.username).trim()) {
      const cleanUsername = String(branchData.username).trim().toLowerCase();
      const duplicateBranch = currentBranches.find(
        (b) => b && b.id !== branchData.id && (b.username && String(b.username).trim().toLowerCase() === cleanUsername)
      );
      if (duplicateBranch) {
        showToast(`⚠️ خطأ: اسم المستخدم (${branchData.username}) مستخدم بالفعل لفرع "${duplicateBranch.name}"!`);
        return;
      }
      const duplicateEmp = (state.employees || []).find(
        (e) => e && ((e.code && String(e.code).trim().toLowerCase() === cleanUsername) ||
               (e.username && String(e.username).trim().toLowerCase() === cleanUsername))
      );
      if (duplicateEmp) {
        showToast(`⚠️ خطأ: اسم المستخدم (${branchData.username}) مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})!`);
        return;
      }

      // التحقق من عدم استخدام هذا الاسم في نظام النواقص والمشتريات (OutStock)
      try {
        const outRes = await outstockGetBranches();
        if (outRes?.success && Array.isArray(outRes.branches)) {
          const outDuplicate = outRes.branches.find(
            (ob) => ob && ob.username && String(ob.username).trim().toLowerCase() === cleanUsername
          );
          if (outDuplicate) {
            showToast(`⛔ لا يمكن استخدام اسم المستخدم (${branchData.username}) لأنه مستخدم بالفعل في نظام النواقص (OutStock) لفرع "${outDuplicate.name}". يرجى اختيار اسم مستخدم مخصص للـ HR.`);
            return;
          }
        }
      } catch (e) {}
    }

    const performSaveBranch = async () => {
      let updatedBranches;
      const latestBranches = state?.branches || currentBranches;
      const alreadyExists = latestBranches.some((b) => b && b.id === branchData.id);
      if (alreadyExists) {
        updatedBranches = latestBranches.map((b) => (b && b.id === branchData.id ? { ...b, ...branchData } : b));
      } else {
        updatedBranches = [...latestBranches, branchData];
      }
      const updatedState = { ...state, branches: updatedBranches };
      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم حفظ بيانات الفرع بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: exists ? `تعديل بيانات فرع (${branchData.name})` : `إضافة فرع جديد (${branchData.name})`,
      actionDetails: `اسم الفرع: ${branchData.name} · الكود: ${branchData.branchCode || branchData.code || '—'}`,
      onExecute: performSaveBranch
    });
  };

  const handleDeleteBranch = async (branchId) => {
    const branch = (state.branches || []).find((b) => b.id === branchId);
    const performDeleteBranch = async () => {
      const updatedBranches = (state.branches || []).filter((b) => b.id !== branchId);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(branchId), `branch_${branchId}`])).slice(-2000);
      // تسكين أي موظف كان تابعاً للفرع المحذوف على المركز الرئيسي تلقائياً
      const updatedEmployees = (state.employees || []).map((emp) => {
        if (!emp) return emp;
        const bId = emp.branchId ? String(emp.branchId) : '';
        if (bId === String(branchId)) {
          return { ...emp, branchId: '' };
        }
        return emp;
      });
      const updatedState = { ...state, branches: updatedBranches, employees: updatedEmployees, _deletedIds: updatedDeletedIds };
      setState(updatedState);
      await saveState(updatedState);
      showToast('🗑️ تم حذف الفرع ونقل موظفيه للمركز الرئيسي بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: `حذف فرع (${branch?.name || branchId})`,
      actionDetails: 'حذف الفرع نهائياً من قاعدة البيانات',
      onExecute: performDeleteBranch
    });
  };

  const handleSaveEvaluation = async (evalData) => {
    const performSaveEval = async () => {
      const updatedState = {
        ...state,
        evaluations: [...(state.evaluations || []), evalData]
      };
      setState(updatedState);
      await saveState(updatedState);
      showToast('⭐ تم حفظ التقييم الدوري بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditEvaluations',
        actionTitle: 'إضافة / تعديل تقييم أداء لموظف',
        actionDetails: `الموظف: ${evalData?.employeeName || evalData?.employeeId || ''}`,
        onExecute: performSaveEval
      });
    } else {
      await performSaveEval();
    }
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

  const handleApproveLoan = async (loanId) => {
    handleApproveRequest(loanId, 'admin');
  };

  const handleRejectLoan = async (loanId) => {
    handleRejectRequest(loanId, 'admin');
  };

  const sendWhatsAppMsg = (empId, text) => {
    const emp = getEmp(empId);
    if (!emp) return;
    // استخدام رقم الواتساب المخصص أو أول رقم صالح في بيانات الموظف
    const rawPhone = getEmpWhatsAppPhone(emp);
    if (!rawPhone || rawPhone.length < 10) {
      showToast('❌ لا يوجد رقم هاتف صالح مسجل لهذا الموظف');
      return;
    }
    let cleanPhone = rawPhone;
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`جاري فتح WhatsApp لمراسلة ${emp.name}...`);
  };

  const generatePayslipMsg = (empId, targetMonth = monthPicker) => {
    const emp = getEmp(empId);
    if (!emp) return '';
    const summary = computeEmpSummary(empId, (d) => d.startsWith(targetMonth), targetMonth);
    const monthLabel = arabicMonthLabel(targetMonth);
    const orgName = state.orgSettings?.orgName || 'المؤسسة';

    return `السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: ${emp.name} (كود: ${emp.code})\nإليك تفاصيل مرتب شهر ${monthLabel}:\n\n• ساعات العمل المسجلة: ${fmt(summary.hours)} ساعة\n• المستحقات الأساسية: ${fmt(summary.baseEarnings)} ج.م\n• إجمالي المكافآت (+): ${fmt(summary.totalBonus)} ج.م\n• إجمالي الخصومات (-): ${fmt(summary.totalDeduction)} ج.م\n-----------------------------------------\n★ صافي المرتب المستحق: ${fmt(summary.netSalary)} ج.م\n\nمع تحيات إدارة ${orgName}.`;
  };

  const handleLogin = async (username, password) => {
    // ── دوال مساعدة لتنقية المدخلات وتوحيد الأرقام والمحارف الخفية ──
    const cleanStr = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '')
        .trim();
    };

    const toStdDigits = (str) => {
      if (!str) return '';
      return cleanStr(str)
        .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
        .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
    };

    const normCode = (c) => {
      return toStdDigits(c).toLowerCase().replace(/^(emp|e)[\-_]?/, '').trim();
    };

    const normPhone = (p) => {
      if (!p) return '';
      const digits = toStdDigits(p).replace(/\D/g, '');
      return digits.replace(/^20/, '').replace(/^0+/, '');
    };

    const isPasswordMatch = (savedPass, inputPass) => {
      const s = cleanStr(savedPass);
      const i = cleanStr(inputPass);
      if (s === i) return true;
      if (toStdDigits(s) === toStdDigits(i)) return true;
      return false;
    };

    const rawUser = cleanStr(username);
    const rawPass = cleanStr(password);
    const cleanUser = rawUser.toLowerCase();
    const stdUser = toStdDigits(cleanUser);
    const cleanPass = rawPass;

    if (!cleanUser || !cleanPass) {
      return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
    }

    // الدخول المباشر لنظام إدارة النواقص والمشتريات (OutStock Handling)
    if (cleanUser === 'out' || cleanUser.startsWith('outstock')) {
      try {
        const outRes = await outstockLogin(cleanUser, cleanPass);
        if (outRes?.success && outRes?.user) {
          const oUser = outRes.user;
          const targetRole = 'outstock_' + (oUser.role || 'owner');
          if (outRes.token) {
            try {
              localStorage.setItem('outstock_token', outRes.token);
              localStorage.setItem('app_auth_token', outRes.token);
            } catch {}
          }
          handleUnifiedLogin({
            role: targetRole,
            user: oUser,
            branch: oUser.branch_id || oUser.branchData?.id || oUser.id ? {
              id: oUser.branch_id || oUser.branchData?.id || oUser.id,
              name: oUser.branch_name || oUser.branchData?.name || oUser.full_name || oUser.name
            } : null,
            redirectTab: 'outstock'
          });
          return { success: true, role: targetRole };
        } else if (outRes?.error && !outRes?.networkError) {
          return { success: false, error: outRes.error };
        }
      } catch (err) {
        console.warn('[Outstock Login Direct Error]:', err);
      }
    }

    const checkMatch = (currentState) => {
      const org = currentState?.orgSettings || {};
      let savedOwnerUser = '';
      let savedOwnerPass = '';
      try {
        savedOwnerUser = localStorage.getItem('pharmacy_owner_username') || '';
        savedOwnerPass = localStorage.getItem('pharmacy_owner_password') || '';
      } catch {}

      const ownerUser = cleanStr(org.ownerUsername || savedOwnerUser || 'owner').toLowerCase();
      const ownerPass = cleanStr(org.ownerPassword || savedOwnerPass || 'owner123');
      const adminUser = cleanStr(org.adminUsername || org.adminUser || 'admin').toLowerCase();
      const adminPass = cleanStr(org.adminPassword || org.adminPass || '123');

      // 0. Check Developer (يوزر مطور النظام السيادي)
      const isDevUserMatch = cleanUser === 'developer';
      const isDevPassMatch = isPasswordMatch('Dev@Master#2026', cleanPass) ||
                             isPasswordMatch('developer123', cleanPass) ||
                             isPasswordMatch('Dev@Admin#2026!', cleanPass);
      if (isDevUserMatch && isDevPassMatch) {
        return { role: 'developer', matched: true };
      }

      // 1. Check Owner (يوزر المالك)
      const isOwnerUserMatch = cleanUser === ownerUser || stdUser === toStdDigits(ownerUser);
      if (isOwnerUserMatch && isPasswordMatch(ownerPass, cleanPass)) {
        return { role: 'owner', matched: true, org };
      }

      // 2. Check Admin (يوزر الأدمن)
      const isAdminUserMatch = cleanUser === adminUser || stdUser === toStdDigits(adminUser);
      const isAdminPassMatch = isPasswordMatch(adminPass, cleanPass) ||
        ((adminPass === '123' || adminPass === 'admin123') && (cleanPass === '123' || cleanPass === 'admin123' || stdUser === '123'));
      if (isAdminUserMatch && isAdminPassMatch) {
        return { role: 'admin', matched: true, org };
      }

      // 3. Check Branch Manager (مدير الفرع)
      const branches = currentState?.branches || [];
      const matchedBranch = branches.find((b) => {
        if (!b) return false;
        const bUser = cleanStr(b.username || '').toLowerCase();
        const bCode = cleanStr(b.code || b.branchCode || '').toLowerCase();
        const bId = cleanStr(b.id || '').toLowerCase();
        const bPass = cleanStr(b.password || '');
        const bPin = cleanStr(b.managerPin || '');
        const isBUserMatch = cleanUser === bUser || cleanUser === bCode || cleanUser === bId ||
          (stdUser && (stdUser === toStdDigits(bUser) || stdUser === toStdDigits(bCode) || stdUser === toStdDigits(bId)));
        const isPassOk = isPasswordMatch(bPass, cleanPass) || (bPin && isPasswordMatch(bPin, cleanPass)) || (!bPass && !bPin && (cleanPass === '1234' || cleanPass === '123'));
        return isBUserMatch && isPassOk;
      });
      if (matchedBranch) {
        return { role: 'branch', matched: true, branch: matchedBranch };
      }

      // 4. Check Employee (الموظف)
      const employees = currentState?.employees || [];
      const userPhoneNorm = normPhone(cleanUser);
      const userCodeNorm = normCode(cleanUser);

      const matchedEmp = employees.find((e) => {
        if (!e) return false;
        const eCode = cleanStr(e.code || '').toLowerCase();
        const eUser = cleanStr(e.username || '').toLowerCase();
        const ePhone = cleanStr(e.phone || '');
        const ePass = cleanStr(e.password || '123');

        // مطابقة الكود
        const isCodeMatch = eCode === cleanUser ||
          toStdDigits(eCode) === stdUser ||
          (userCodeNorm && normCode(eCode) === userCodeNorm);

        // مطابقة اسم المستخدم
        const isUsernameMatch = eUser && (eUser === cleanUser || toStdDigits(eUser) === stdUser);

        // مطابقة رقم الهاتف
        const ePhoneNorm = normPhone(ePhone);
        const isPhoneMatch = (userPhoneNorm && ePhoneNorm && userPhoneNorm.length >= 7 && ePhoneNorm === userPhoneNorm) ||
          ePhone === cleanUser || toStdDigits(ePhone) === stdUser;

        const isUserMatch = isCodeMatch || isUsernameMatch || isPhoneMatch;
        return isUserMatch && isPasswordMatch(ePass, cleanPass);
      });

      if (matchedEmp) {
        if (matchedEmp.accountSuspended || matchedEmp.biometricSuspended || matchedEmp.punchDisabled || matchedEmp.status === 'معلق') {
          return {
            matched: true,
            suspended: true,
            reason: matchedEmp.suspensionReason || 'إيقاف مؤقت لحين المراجعة',
            user: matchedEmp
          };
        }
        if (matchedEmp.isTerminated || matchedEmp.status === 'تم الاستقالة' || matchedEmp.is_active === false) {
          return {
            matched: true,
            terminated: true,
            reason: matchedEmp.terminationReason || 'إنهاء تعاقد أو استقالة',
            user: matchedEmp
          };
        }
        return { role: 'employee', matched: true, user: matchedEmp };
      }

      return { matched: false };
    };

    let authResult = checkMatch(state);

    // إذا لم يتطابق محلياً (مثل أول تثبيت للتطبيق على الهاتف أو عدم مزامنة البيانات بعد):
    // نقوم بالمصادقة المباشرة أولاً عبر API الخادم السحابي
    if (!authResult.matched) {
      try {
        const loginRes = await apiLogin({ username: cleanUser, password: cleanPass, role: 'auto' });
        if (loginRes?.is_suspended) {
          const suspObj = {
            isSuspended: true,
            reason: loginRes.suspension_reason || 'تم تعليق حساب المنظومة',
            customAdminMsg: loginRes.custom_admin_msg || loginRes.suspension_reason || '',
            customStaffMsg: loginRes.custom_staff_msg || loginRes.suspension_reason || ''
          };
          setTenantSuspension(suspObj);
          try { localStorage.setItem('app_tenant_suspension', JSON.stringify(suspObj)); } catch {}
          return {
            success: false,
            error: loginRes.error || 'تم إيقاف حساب هذه المنظومة من قبل المطور.'
          };
        }
        if (loginRes && loginRes.success && loginRes.user) {
          if (loginRes.token) {
            try {
              localStorage.setItem('app_auth_token', loginRes.token);
              localStorage.setItem('outstock_token', loginRes.token);
            } catch {}
          }
          const sRole = loginRes.role || 'employee';
          const sUser = loginRes.user;

          if (sRole === 'employee') {
            if (sUser.accountSuspended || sUser.biometricSuspended || sUser.punchDisabled || sUser.status === 'معلق') {
              return {
                success: false,
                error: `⛔ تم إيقاف بصمة وحساب الموظف مؤقتاً (${sUser.suspensionReason || 'إيقاف مؤقت لحين المراجعة'}). يرجى مراجعة إدارة الموارد البشرية.`
              };
            }
            if (sUser.isTerminated || sUser.status === 'تم الاستقالة' || sUser.is_active === false) {
              return {
                success: false,
                error: `🚫 تم إنهاء خدمة هذا الموظف (${sUser.terminationReason || 'إنهاء تعاقد أو استقالة'}) ولا يمكن تسجيل الدخول.`
              };
            }
            authResult = { role: 'employee', matched: true, user: sUser };
            setState((prev) => {
              const emps = Array.isArray(prev?.employees) ? [...prev.employees] : [];
              const idx = emps.findIndex((e) => String(e.id) === String(sUser.id) || String(e.code) === String(sUser.code));
              if (idx >= 0) emps[idx] = { ...emps[idx], ...sUser };
              else emps.push(sUser);
              return { ...prev, employees: emps };
            });
          } else if (sRole === 'branch') {
            authResult = { role: 'branch', matched: true, branch: sUser };
            setState((prev) => {
              const branches = Array.isArray(prev?.branches) ? [...prev.branches] : [];
              const idx = branches.findIndex((b) => String(b.id) === String(sUser.id) || String(b.code || b.branchCode) === String(sUser.code || sUser.branchCode));
              if (idx >= 0) branches[idx] = { ...branches[idx], ...sUser };
              else branches.push(sUser);
              return { ...prev, branches };
            });
          } else if (sRole.startsWith('outstock_')) {
            const targetRole = sRole;
            if (loginRes.token) {
              try {
                localStorage.setItem('outstock_token', loginRes.token);
                localStorage.setItem('app_auth_token', loginRes.token);
              } catch {}
            }
            handleUnifiedLogin({
              role: targetRole,
              user: sUser,
              branch: sUser.branch_id || sUser.branchId || sUser.id ? {
                id: sUser.branch_id || sUser.branchId || sUser.id,
                name: sUser.name || sUser.fullName || sUser.full_name
              } : null,
              redirectTab: 'outstock'
            });
            return { success: true, role: targetRole };
          } else if (sRole === 'admin') {
            authResult = { role: 'admin', matched: true, org: state?.orgSettings || {} };
          } else if (sRole === 'owner') {
            authResult = { role: 'owner', matched: true, org: state?.orgSettings || {} };
          }

          // مزامنة حالة التطبيق بالكامل في الخلفية دون تعطيل أو تأخير الدخول
          fetchRemoteState({ timeout: 15000, isBackground: true })
            .then((freshCloud) => {
              if (freshCloud && typeof freshCloud === 'object' && !freshCloud.notModified) {
                const freshNormalized = normalizeState(freshCloud);
                setState((prev) => normalizeState(smartMergeStates(prev, freshNormalized)));
                saveStateLocally(freshNormalized).catch(() => {});
              }
            })
            .catch(() => {});
        } else if (loginRes && loginRes.networkError) {
          // تعذر الاتصال بالخادم، نحاول جلب ملف الحالة كحل أخير
          try {
            const freshCloud = await fetchRemoteState({ timeout: 6000, useETag: false, isBackground: false });
            if (freshCloud && typeof freshCloud === 'object' && !freshCloud.notModified) {
              const freshNormalized = normalizeState(freshCloud);
              const cloudAuthResult = checkMatch(freshNormalized);
              if (cloudAuthResult.matched) {
                authResult = cloudAuthResult;
                setState((prev) => normalizeState(smartMergeStates(prev, freshNormalized)));
                saveStateLocally(freshNormalized).catch(() => {});
              }
            }
          } catch (e) {
            console.warn('[Login Cloud Fetch Warning]:', e);
          }
          if (!authResult.matched) {
            return {
              success: false,
              error: 'تعذر الاتصال بالخادم، يرجى التأكد من اتصال الإنترنت على الهاتف والمحاولة مرة أخرى.'
            };
          }
        } else if (loginRes && loginRes.error) {
          // جرب outstockLogin كإجراء بديل قبل إظهار الخطأ (للدخول المباشر لنظام النواقص)
          try {
            const outRes = await outstockLogin(cleanUser, cleanPass);
            if (outRes?.success && outRes?.user) {
              const oUser = outRes.user;
              const targetRole = (oUser.role === 'branch' || oUser.role === 'outstock_branch') ? 'outstock_branch' : ('outstock_' + (oUser.role || 'owner'));
              if (outRes.token) {
                try {
                  localStorage.setItem('outstock_token', outRes.token);
                  localStorage.setItem('app_auth_token', outRes.token);
                  localStorage.setItem('outstock_user', JSON.stringify(oUser));
                } catch {}
              }
              handleUnifiedLogin({
                role: targetRole,
                user: oUser,
                branch: oUser.branchData || (oUser.branch_id ? { id: oUser.branch_id, name: oUser.branch_name || oUser.full_name } : null),
                redirectTab: 'outstock'
              });
              return { success: true, role: targetRole };
            } else {
              return {
                success: false,
                error: loginRes.error || 'اسم المستخدم أو كلمة المرور غير صحيحة'
              };
            }
          } catch (outErr) {
            return {
              success: false,
              error: loginRes.error || 'اسم المستخدم أو كلمة المرور غير صحيحة'
            };
          }
        }
      } catch (err) {
        console.warn('[apiLogin direct call error]:', err);
        // Fallback: try fetching remote state
        try {
          const freshCloud = await fetchRemoteState({ timeout: 8000, useETag: false, isBackground: false });
          if (freshCloud && typeof freshCloud === 'object' && !freshCloud.notModified) {
            const freshNormalized = normalizeState(freshCloud);
            const cloudAuthResult = checkMatch(freshNormalized);
            if (cloudAuthResult.matched) {
              authResult = cloudAuthResult;
              setState((prev) => normalizeState(smartMergeStates(prev, freshNormalized)));
              saveStateLocally(freshNormalized).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[Login Cloud Fetch Warning]:', e);
        }
      }
    }

    if (authResult.matched) {
      if (authResult.suspended) {
        return {
          success: false,
          error: `⛔ تم إيقاف بصمة وحساب الموظف مؤقتاً (${authResult.reason}). يرجى مراجعة إدارة الموارد البشرية.`
        };
      }
      if (authResult.terminated) {
        return {
          success: false,
          error: `🚫 تم إنهاء خدمة هذا الموظف (${authResult.reason}) ولا يمكن تسجيل الدخول.`
        };
      }

      const { role, org, branch, user } = authResult;

      // إصدار وحفظ توكن JWT رسمي من السيرفر للمصادقة وتفويض العمليات الحساسة
      try {
        apiLogin({ username: cleanUser, password: cleanPass, role: role || 'auto' })
          .then((res) => {
            if (res && res.token) {
              localStorage.setItem('app_auth_token', res.token);
            }
            if (res?.company) {
              localStorage.setItem('app_company_subscription', JSON.stringify(res.company));
            }
            if (res?.isSuspended) {
              const suspObj = {
                isSuspended: true,
                reason: res.suspensionReason || 'تم إيقاف حساب الشركة مؤقتاً',
                customAdminMsg: res.customMsg || '',
                customStaffMsg: res.customMsg || ''
              };
              setTenantSuspension(suspObj);
              try { localStorage.setItem('app_tenant_suspension', JSON.stringify(suspObj)); } catch {}
            }
          })
          .catch(() => {
            // صامت في حالة عدم توفر الاتصال للحفاظ على ميزة العمل دون اتصال
          });
      } catch {}

      try {
        const currentOrgEpoch = String(org?.sessionInvalidationEpoch || state?.orgSettings?.sessionInvalidationEpoch || '0');
        if (currentOrgEpoch !== '0') {
          localStorage.setItem('last_known_session_epoch', currentOrgEpoch);
        }
        const currentResetTok = state?._systemResetToken || '';
        if (currentResetTok) {
          localStorage.setItem('last_known_reset_token', currentResetTok);
        }
      } catch {}

      if (role === 'developer') {
        handleUnifiedLogin({ role: 'developer', redirectTab: 'overview' });
        try {
          localStorage.setItem('app_auth_role', 'developer');
          localStorage.setItem('app_is_developer', 'true');
        } catch {}
        return { success: true, role: 'developer' };
      }

      if (role === 'owner') {
        handleUnifiedLogin({ role: 'owner', redirectTab: 'dashboard' });
        try {
          localStorage.setItem('app_auth_role', 'owner');
          localStorage.setItem('app_owner_authenticated', 'true');
          localStorage.setItem('app_owner_password_snapshot', cleanPass);
          localStorage.setItem('app_owner_session_version', String(org?.ownerSessionVersion || 1));
          sessionStorage.setItem('app_owner_authenticated', 'true');
        } catch {}
        return { success: true, role: 'owner' };
      }

      if (role === 'admin') {
        handleUnifiedLogin({ role: 'admin', redirectTab: 'dashboard' });
        try {
          localStorage.setItem('app_auth_role', 'admin');
          localStorage.setItem('app_admin_password_snapshot', cleanPass);
          localStorage.setItem('app_admin_session_version', String(org?.adminSessionVersion || 1));
          localStorage.removeItem('app_owner_authenticated');
          sessionStorage.removeItem('app_owner_authenticated');
          sessionStorage.removeItem('app_settings_owner_tab_unlocked');
        } catch {}
        return { success: true, role: 'admin' };
      }

      if (role === 'branch') {
        handleUnifiedLogin({ role: 'branch', branch, redirectTab: 'branch' });
        try {
          localStorage.setItem('app_branch_password_snapshot', cleanPass);
          localStorage.setItem('app_branch_session_version', String(branch?.sessionVersion || 1));
        } catch {}
        return { success: true, role: 'branch' };
      }

      if (role === 'employee') {
        handleUnifiedLogin({ role: 'employee', user, redirectTab: 'portal' });
        try {
          localStorage.setItem('app_emp_password_snapshot', cleanPass);
          localStorage.setItem('app_emp_session_version', String(user?.sessionVersion || 1));
        } catch {}
        return { success: true, role: 'employee' };
      }
    }

    // Fallback: فحص الدخول عبر نظام إدارة النواقص والمشتريات
    try {
      const outRes = await outstockLogin(cleanUser, cleanPass);
      if (outRes?.success && outRes?.user) {
        const oUser = outRes.user;
        const targetRole = (oUser.role === 'branch' || oUser.role === 'outstock_branch') ? 'outstock_branch' : ('outstock_' + (oUser.role || 'pharmacy'));
        if (outRes.token) {
          try {
            localStorage.setItem('outstock_token', outRes.token);
            localStorage.setItem('app_auth_token', outRes.token);
            localStorage.setItem('outstock_user', JSON.stringify(oUser));
          } catch {}
        }
        handleUnifiedLogin({
          role: targetRole,
          user: oUser,
          branch: oUser.branchData || (oUser.branch_id ? { id: oUser.branch_id, name: oUser.branch_name || oUser.full_name } : null),
          redirectTab: 'outstock'
        });
        return { success: true, role: targetRole };
      }
    } catch {}

    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  };

  return (
    <div className={`mode-${viewMode}`}>
      {/* 0. Initial Loading Spinner with Organization Logo */}
      {isLoading && (() => {
        const effectiveLogo = state?.orgSettings?.logoUrl ||
          (() => {
            try {
              const saved = localStorage.getItem('pharmacy-tracker-data');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.orgSettings?.logoUrl) return parsed.orgSettings.logoUrl;
              }
            } catch {}
            return '/icons/logo_512x512.png';
          })();

        const effectiveOrgName = state?.orgSettings?.orgName ||
          (() => {
            try {
              const saved = localStorage.getItem('pharmacy-tracker-data');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.orgSettings?.orgName) return parsed.orgSettings.orgName;
              }
            } catch {}
            return 'منظومة إدارة الموارد البشرية والرواتب';
          })();

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #064e3b 100%)',
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
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '24px',
              padding: '40px 48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 24px 50px rgba(0, 0, 0, 0.35)',
              maxWidth: '90%',
              textAlign: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              {/* Organization Logo Card */}
              <div style={{
                marginBottom: '20px',
                background: '#ffffff',
                padding: '10px 20px',
                borderRadius: '18px',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={effectiveLogo}
                  alt={effectiveOrgName}
                  style={{
                    maxHeight: '75px',
                    maxWidth: 'min(220px, 70vw)',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/icons/logo_512x512.png';
                  }}
                />
              </div>

              <div className="spinner" style={{
                width: '42px',
                height: '42px',
                borderWidth: '3.5px',
                borderColor: 'rgba(255,255,255,0.2)',
                borderTopColor: '#38bdf8',
                marginBottom: '18px'
              }}></div>

              <h2 style={{ margin: '0 0 8px', fontSize: '21px', fontWeight: '800', color: '#ffffff' }}>
                {effectiveOrgName}
              </h2>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#94a3b8' }}>
                جاري الاتصال بقاعدة البيانات ومزامنة السجلات الحية...
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── الشريط الذهبي العائم لوضع محاكاة المطور (Ghost Impersonation Mode) ── */}
      {isImpersonating && (
        <GhostModeBanner
          companyName={impersonatedCompany?.name}
          companyCode={impersonatedCompany?.code}
          onExitGhostMode={() => {
            try {
              const backupDevToken = localStorage.getItem('app_dev_backup_token');
              if (backupDevToken) {
                localStorage.setItem('app_auth_token', backupDevToken);
                localStorage.setItem('app_auth_role', 'developer');
                localStorage.removeItem('app_dev_backup_token');
                localStorage.removeItem('app_is_impersonating');
                localStorage.removeItem('app_impersonated_company');
              }
              window.location.href = '/developer';
            } catch {
              window.location.href = '/developer';
            }
          }}
        />
      )}

      {/* ── 1. Standalone Systems ── */}
      {viewMode === 'archive' && (
        isScreenInMaintenance('pharmacy_archive') ? (
          <ScreenMaintenanceView
            screenId="pharmacy_archive"
            screenTitle="أرشيف الفواتير السحابي"
            customMessage={maintenanceStatus?.screen_messages?.['pharmacy_archive'] || ''}
            onBypassSandbox={() => handleSandboxBypass('pharmacy_archive')}
            onNavigateHome={() => { window.location.href = '/'; }}
          />
        ) : (
          <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
            <Suspense fallback={<div className="loading-fallback">جاري تحميل الأرشيف...</div>}>
              <ArchiveSystemView isStandalone={true} />
            </Suspense>
          </ErrorBoundary>
        )
      )}

      {viewMode === 'accounts' && (
        isScreenInMaintenance('accounts') ? (
          <ScreenMaintenanceView
            screenId="accounts"
            screenTitle="منظومة الحسابات العامة (ERP)"
            customMessage={maintenanceStatus?.screen_messages?.['accounts'] || ''}
            onBypassSandbox={() => handleSandboxBypass('accounts')}
            onNavigateHome={() => { window.location.href = '/'; }}
          />
        ) : (
          <ErrorBoundary fallbackTitle="حدث خطأ في منظومة الحسابات العامة">
            <Suspense fallback={<div className="loading-fallback">جاري تحميل منظومة الحسابات...</div>}>
              <AccountsSystemView
                isStandalone={true}
                themeMode={themeMode}
                toggleTheme={toggleTheme}
                state={state}
                setState={setState}
                saveState={saveState}
                showToast={showToast}
                computeGrandPayroll={computeGrandPayroll}
                authRole={authRole}
              />
            </Suspense>
          </ErrorBoundary>
        )
      )}

      {viewMode === 'careers' && (
        isScreenInMaintenance('recruitment') ? (
          <ScreenMaintenanceView
            screenId="recruitment"
            screenTitle="بوابة التوظيف العامة"
            customMessage={maintenanceStatus?.screen_messages?.['recruitment'] || ''}
            onBypassSandbox={() => handleSandboxBypass('recruitment')}
            onNavigateHome={() => { window.location.href = '/'; }}
          />
        ) : (
          <ErrorBoundary fallbackTitle="حدث خطأ في بوابة التوظيف">
            <Suspense fallback={<div className="loading-fallback">جاري تحميل بوابة التوظيف...</div>}>
              <PublicCandidateApplyPortal state={state} setState={setState} saveState={saveState} showToast={showToast} />
            </Suspense>
          </ErrorBoundary>
        )
      )}

      {viewMode === 'interview' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في تقييم المقابلات">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل شاشة المقابلات...</div>}>
            <InterviewerEvaluationPortal state={state} setState={setState} saveState={saveState} showToast={showToast} />
          </Suspense>
        </ErrorBoundary>
      )}

      {viewMode === 'kiosk' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في كشك البصمة والحضور">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل كشك البصمة...</div>}>
            <ElectronicKioskView
              orgSettings={state.orgSettings}
              state={state}
              startShift={startShift}
              pauseShift={pauseShift}
              resumeShift={resumeShift}
              stopShift={stopShift}
              onKioskDeviceRequest={handleKioskDeviceRequest}
              kioskBranchId={kioskBranchId}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Developer Super Admin Portal ── */}
      {(viewMode === 'developer' || authRole === 'developer') && (
        <ErrorBoundary fallbackTitle="حدث خطأ في لوحة مطور النظام">
          <Suspense fallback={<div className="loading-fallback">جاري فتح لوحة مطور النظام...</div>}>
            <DeveloperPortalView
              onLogout={handleLogout}
              showToast={showToast}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Company Public Registration ── */}
      {viewMode === 'register' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في صفحة تسجيل الشركة">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل صفحة التسجيل...</div>}>
            <CompanyRegisterPage
              onLoginSuccess={(data) => {
                handleUnifiedLogin({ role: 'owner', redirectTab: 'dashboard' });
                window.location.href = '/';
              }}
              onBackToLogin={() => {
                window.location.href = '/';
              }}
              showToast={showToast}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── Outstock Handling System (نظام متابعة نواقص وطلبات أدوية العملاء والفروع) ── */}
      {(viewMode === 'outstock' || (typeof authRole === 'string' && authRole.startsWith('outstock_'))) && (
        <ErrorBoundary fallbackTitle="حدث خطأ في منظومة نواقص الأدوية والطلبات">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل منظومة النواقص والمشتريات...</div>}>
            <OutstockSystemView
              initialRole={authRole}
              currentBranch={currentBranch}
              currentUser={currentEmpUser}
              onLogout={handleLogout}
              themeMode={themeMode}
              toggleTheme={toggleTheme}
              showToast={showToast}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── 2. Authenticated / Unauthenticated App Views ── */}
      {viewMode !== 'kiosk' && viewMode !== 'archive' && viewMode !== 'accounts' && viewMode !== 'careers' && viewMode !== 'interview' && viewMode !== 'developer' && viewMode !== 'register' && viewMode !== 'outstock' && authRole !== 'developer' && !(typeof authRole === 'string' && authRole.startsWith('outstock_')) && (
        (!isAdminLoggedIn && !currentEmpUser && !currentBranch) || authRole === 'none' ? (
          <ErrorBoundary fallbackTitle="حدث خطأ في شاشة تسجيل الدخول">
            <LoginPage
              onLogin={handleLogin}
              onOpenRegister={() => { window.location.href = '/register'; }}
              onOpenDeveloper={() => { window.location.href = '/developer'; }}
              state={state}
              themeMode={themeMode}
              toggleTheme={toggleTheme}
            />
          </ErrorBoundary>
        ) : tenantSuspension?.isSuspended ? (
          (authRole === 'owner' || authRole === 'admin') ? (
            <AdminSuspensionView
              reason={tenantSuspension.reason}
              customMessage={tenantSuspension.customAdminMsg}
              onLogout={() => {
                try { localStorage.removeItem('app_tenant_suspension'); } catch {}
                setTenantSuspension(null);
                handleLogout();
              }}
            />
          ) : (
            <StaffSuspensionView
              customMessage={tenantSuspension.customStaffMsg}
              onLogout={() => {
                try { localStorage.removeItem('app_tenant_suspension'); } catch {}
                setTenantSuspension(null);
                handleLogout();
              }}
            />
          )
        ) : (authRole === 'employee' && currentEmpUser) ? (
          <ErrorBoundary fallbackTitle="حدث خطأ في عرض بوابة الموظف">
            <Suspense fallback={<div className="loading-fallback">جاري تحميل بوابة الموظف...</div>}>
              <EmployeePortalView
                currentEmpUser={currentEmpUser}
                setCurrentEmpUser={setCurrentEmpUser}
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
                themeMode={themeMode}
                toggleTheme={toggleTheme}
                notifications={state.notifications || []}
                onMarkNotificationRead={handleMarkNotificationRead}
                onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
                onDeleteNotification={handleDeleteNotification}
                onClearReadNotifications={handleClearReadNotifications}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DesktopLayout
            currentRole={authRole}
            currentBranch={currentBranch}
            isSyncing={isSyncing}
            lastSyncTime={lastSyncTime}
            isOffline={isOffline}
            pendingSyncCount={pendingSyncCount}
            onTriggerSync={triggerManualSync}
            notifications={notifications}
            systemNotifications={systemNotifications}
            requestNotifications={requestNotifications}
            unreadSystemCount={unreadSystemCount}
            unreadRequestCount={unreadRequestCount}
            onMarkNotificationRead={handleMarkNotificationRead}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            onDeleteNotification={handleDeleteNotification}
            onClearReadNotifications={handleClearReadNotifications}
            userProfile={
              authRole === 'owner'
                ? { name: 'المالك (Owner)', jobTitle: 'مالك المنظومة والمشرف العام', code: 'OWNER', isOwner: true }
                : authRole === 'branch'
                ? {
                    name: (state.employees || []).find((e) => e && e.id === currentBranch?.managerId)?.name || (currentBranch?.name ? `مدير فرع ${currentBranch.name}` : 'مدير الفرع'),
                    jobTitle: (state.employees || []).find((e) => e && e.id === currentBranch?.managerId)?.jobTitle || 'مدير فرع',
                    code: (state.employees || []).find((e) => e && e.id === currentBranch?.managerId)?.code || 'MGR',
                    photoUrl: (state.employees || []).find((e) => e && e.id === currentBranch?.managerId)?.photoUrl || ''
                  }
                : { name: 'الإدارة العليا', jobTitle: 'Super Admin', code: 'ADMIN' }
            }
            activeTab={activeNavTab}
            setActiveTab={setActiveNavTab}
            activeSubTab={activeSubTab}
            setActiveSubTab={setActiveSubTab}
            onLogout={handleLogout}
            pendingCount={pendingRequestsCount}
            resignationCount={resignationCount}
            bylawsCount={bylawsCount}
            themeMode={themeMode}
            toggleTheme={toggleTheme}
            adminFilterMode={adminFilterMode}
            setFilterMode={setAdminFilterMode}
            monthPicker={monthPicker}
            setMonthPicker={setMonthPicker}
            adminCustomFrom={adminCustomFrom}
            setAdminCustomFrom={setAdminCustomFrom}
            adminCustomTo={adminCustomTo}
            setAdminCustomTo={setAdminCustomTo}
            onExportExcel={
              authRole === 'branch'
                ? () => {
                    const mgrEmp = (state.employees || []).find((e) => e && e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e && e.branchId === currentBranch?.id);
                    if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                    else exportAllPayrollExcel();
                  }
                : undefined
            }
          >
            {authRole === 'branch' ? (
              <ErrorBoundary fallbackTitle="حدث خطأ في عرض لوحة مدير الفرع">
                <Suspense fallback={<div className="loading-fallback">جاري تحميل لوحة مدير الفرع...</div>}>
                  <BranchManagerView
                    state={sanitizedState}
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
                      const mgrEmp = (sanitizedState.employees || []).find((e) => e && e.id === currentBranch?.managerId) || (sanitizedState.employees || []).find((e) => e && e.branchId === currentBranch?.id);
                      if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                      else exportAllPayrollExcel();
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            ) : isScreenInMaintenance(activeNavTab, activeSubTab) ? (
              <ScreenMaintenanceView
                screenId={activeNavTab}
                screenTitle={tabTitles[activeNavTab] || activeNavTab}
                customMessage={maintenanceStatus?.screen_messages?.[activeNavTab] || ''}
                onBypassSandbox={() => handleSandboxBypass(activeNavTab)}
                onNavigateHome={() => setActiveNavTab('dashboard')}
              />
            ) : (
              <ErrorBoundary fallbackTitle="حدث خطأ في عرض هذا القسم">
                <Suspense fallback={<div className="loading-fallback" style={{ padding: '60px 20px', textAlign: 'center', fontSize: '15px', color: 'var(--muted, #64748b)' }}>⏳ جاري تحميل بيانات القسم...</div>}>
                {/* 1. Dashboard */}
                {activeNavTab === 'dashboard' && (
                  <Dashboard
                    state={sanitizedState}
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

                {/* 2. Employees Hub */}
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
                    state={sanitizedState}
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
                    importEmployeesFromExcel={handleExcelImport}
                    exportEmployeesToExcel={exportEmployeesDirectoryExcel}
                    openAddEmpModal={() => {
                      setEditingEmpFile(null);
                      setIsEmpFileModalOpen(true);
                    }}
                    openEmpPhonesModal={openEmpPhonesModal}
                    setIsEmpPhonesModalOpen={openEmpPhonesModal}
                    setEditingEmpFile={setEditingEmpFile}
                    setIsEmpFileModalOpen={setIsEmpFileModalOpen}
                  />
                )}

                {/* 3. Branch Management & Branch Monthly Roster & Branch Sales */}
                {activeNavTab === 'branches' && (
                  activeSubTab === 'sales' ? (
                    <BranchSalesModule
                      state={sanitizedState}
                      setState={setState}
                      saveState={saveState}
                      showToast={showToast}
                      onSwitchSubTab={setActiveSubTab}
                    />
                  ) : activeSubTab === 'roster' ? (
                    <BranchMonthlyRosterModule
                      state={sanitizedState}
                      setState={setState}
                      saveState={saveState}
                      showToast={showToast}
                      initialBranchId={selectedRosterBranchId}
                      onNavigateTab={setActiveNavTab}
                      onSwitchSubTab={setActiveSubTab}
                    />
                  ) : (
                    <BranchManagementModule
                      state={sanitizedState}
                      onSaveBranch={handleSaveBranch}
                      onDeleteBranch={handleDeleteBranch}
                      onSwitchSubTab={setActiveSubTab}
                      showToast={showToast}
                      onOpenBranchRoster={(branchId) => {
                        setSelectedRosterBranchId(branchId);
                        setActiveSubTab('roster');
                      }}
                    />
                  )
                )}

                {/* 4. Requests Center */}
                {activeNavTab === 'requests' && (
                  <RequestsModule
                    state={sanitizedState}
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
                    currentRole={authRole === 'branch' ? 'branch' : 'admin'}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 5. Leaves Tracking */}
                {activeNavTab === 'leaves-tracking' && (
                  <LeavesTrackingModule
                    state={sanitizedState}
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

                {/* 6. Employee Permissions Management */}
                {activeNavTab === 'permissions-management' && (
                  <EmployeePermissionsManagementModule
                    state={sanitizedState}
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
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 7. Payroll Summary */}
                {activeNavTab === 'payroll' && (
                  <PayrollModule
                    state={{ ...sanitizedState, computeEmpSummary }}
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

                {/* 8. Adjustments & Bonuses/Deductions */}
                {activeNavTab === 'adjustments-module' && (
                  <AdjustmentsModule
                    state={sanitizedState}
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

                {/* 8.5. Admin Directives */}
                {activeNavTab === 'admin-directives' && (
                  <AdminDirectivesModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                  />
                )}

                {activeNavTab === 'branch-directives' && (
                  <AdminDirectivesModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    initialTab="branch_directives"
                  />
                )}

                {/* 9. WhatsApp Center */}
                {activeNavTab === 'whatsapp-center' && (
                  <WhatsAppCenterModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    monthPicker={monthPicker}
                    computeEmpSummary={computeEmpSummary}
                    arabicMonthLabel={arabicMonthLabel}
                  />
                )}

                {/* 10. Work Bylaws */}
                {activeNavTab === 'bylaws' && (
                  <BylawsModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    userRole={authRole === 'branch' ? 'branch' : 'admin'}
                    currentBranch={currentBranch}
                    currentBranchId={currentBranch?.id}
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

                {/* 11. Resignation Module */}
                {activeNavTab === 'resignation' && (
                  <AdminResignationModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 12. Performance Evaluations */}
                {activeNavTab === 'evaluations' && (
                  <EvaluationsModule
                    subTab={activeSubTab}
                    onSubTabChange={setActiveSubTab}
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    currentRole={authRole === 'branch' ? 'branch' : 'admin'}
                    currentBranchId={currentBranch?.id}
                    onSaveEvaluation={handleSaveEvaluation}
                    onSaveEmployeeNote={handleSaveEmployeeNote}
                    onReplyToNote={handleReplyToNote}
                    showToast={showToast}
                  />
                )}

                {/* 13. Loans & Credit Meds */}
                {activeNavTab === 'loans-meds' && (
                  <LoansMedsModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 14. Income & Expenses */}
                {activeNavTab === 'income-expenses' && (
                  <IncomeExpensesModule
                    state={sanitizedState}
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

                {/* 14.5. Financial Reports & Comprehensive P&L */}
                {activeNavTab === 'financial-reports' && (
                  authRole !== 'branch' ? (
                    <FinancialReportsModule
                      state={{ ...sanitizedState, computeEmpSummary }}
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
                    />
                  ) : (
                    <div className="card settings-card" style={{ padding: '30px', textAlign: 'center' }}>
                      <h3 style={{ color: '#dc2626' }}>⛔ غير مصرح بالدخول</h3>
                      <p style={{ color: 'var(--muted)' }}>التقارير المالية والأرباح مخصصة حصرياً للإدارة العليا والمالك.</p>
                    </div>
                  )
                )}

                {/* 15. System Settings */}
                {activeNavTab === 'settings' && (
                  <SettingsModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    authRole={authRole}
                    activeSubTab={activeSubTab}
                    setActiveSubTab={setActiveSubTab}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 16. Notification Center */}
                {activeNavTab === 'notifications' && (
                  <NotificationCenterModule
                    state={sanitizedState}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    onNavigateTab={setActiveNavTab}
                    onNavigateSubTab={setActiveSubTab}
                    setActiveSubTab={setActiveSubTab}
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

                {/* 17. Dual Approval Rules */}
                {(activeNavTab === 'approval-rules' || activeNavTab === 'approvals') && (
                  <ApprovalCenterModule
                    state={sanitizedState}
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

                {/* 18. Pharmacy Archive System */}
                {activeNavTab === 'pharmacy-archive' && (
                  <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
                    <Suspense fallback={<div className="loading-fallback">جاري تحميل الأرشيف...</div>}>
                      <ArchiveSystemView isStandalone={false} />
                    </Suspense>
                  </ErrorBoundary>
                )}

                {/* 19. General Accounts & Chart of Accounts System */}
                {activeNavTab === 'accounts' && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '65vh',
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: 'var(--surface, #ffffff)',
                    borderRadius: '16px',
                    border: '1px solid var(--border, #e2e8f0)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                    maxWidth: '680px',
                    margin: '30px auto',
                  }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      marginBottom: '16px',
                      boxShadow: '0 8px 16px rgba(13, 148, 136, 0.25)',
                    }}>
                      🏛️
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text, #0f172a)', margin: '0 0 8px' }}>
                      منظومة الحسابات العامة وشجرة الحسابات (ERP)
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', maxWidth: '480px', lineHeight: '1.6', margin: '0 0 20px' }}>
                      تعمل منظومة الحسابات العامة في بيئة سطح مكتب احترافية منفصلة تماماً (مثل الأرشيف الإلكتروني) لمنحك أقصى قدر من السرعة والتركيز وسهولة مراجعة القيود والتقارير.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          window.open(getPublicSystemUrl('/accounts'), '_blank');
                          setActiveNavTab('dashboard');
                        }}
                        style={{
                          padding: '10px 24px',
                          fontSize: '14px',
                          fontWeight: '800',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#0d9488',
                          borderColor: '#0f766e',
                        }}
                      >
                        🚀 فتح منظومة الحسابات في صفحة منفصلة
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setActiveNavTab('dashboard')}
                        style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '10px' }}
                      >
                        العودة للوحة التحكم
                      </button>
                    </div>
                  </div>
                )}

                {/* 20. Fingerprint Kiosk Mode System */}
                {activeNavTab === 'kiosk' && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '65vh',
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: 'var(--surface, #ffffff)',
                    borderRadius: '16px',
                    border: '1px solid var(--border, #e2e8f0)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                    maxWidth: '680px',
                    margin: '30px auto',
                  }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '32px',
                      marginBottom: '16px',
                      boxShadow: '0 8px 16px rgba(16, 185, 129, 0.25)',
                    }}>
                      📱
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text, #0f172a)', margin: '0 0 8px' }}>
                      شاشة كشك البصمة السريعة (Kiosk Mode)
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--muted, #64748b)', maxWidth: '480px', lineHeight: '1.6', margin: '0 0 20px' }}>
                      تعمل شاشة كشك البصمة في صفحة مستقلة كاملة مخصصة للموظفين لتسجيل الحضور والانصراف بالوجه واليد، مع بقاء لوحة تحكم الإدارة قيد العمل في صفحتك الحالية دون مقاطعة.
                    </p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = getPublicSystemUrl('/kiosk');
                          link.target = '_blank';
                          link.rel = 'noopener noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          setActiveNavTab('dashboard');
                        }}
                        style={{
                          padding: '10px 24px',
                          fontSize: '14px',
                          fontWeight: '800',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#10b981',
                          borderColor: '#059669',
                        }}
                      >
                        🚀 فتح كشك البصمة في صفحة جديدة ↗
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setActiveNavTab('dashboard')}
                        style={{ padding: '10px 18px', fontSize: '13px', borderRadius: '10px' }}
                      >
                        العودة للوحة التحكم
                      </button>
                    </div>
                  </div>
                )}

                {/* 21. OutStock Handling System (نظام النواقص والمشتريات) */}
                {activeNavTab === 'outstock' && (
                  <ErrorBoundary fallbackTitle="حدث خطأ في نظام نواقص الأدوية والطلبات">
                    <Suspense fallback={<div className="loading-fallback">جاري تحميل نظام النواقص والمشتريات...</div>}>
                      {authRole === 'admin' && !((() => {
                        try {
                          return localStorage.getItem('app_auth_role') === 'owner' ||
                                 localStorage.getItem('app_owner_authenticated') === 'true' ||
                                 sessionStorage.getItem('app_owner_authenticated') === 'true' ||
                                 sessionStorage.getItem('app_outstock_owner_unlocked') === 'true';
                        } catch {
                          return false;
                        }
                      })()) ? (
                        <OutstockOwnerGate
                          orgSettings={state?.orgSettings}
                          onUnlocked={() => {
                            setOutstockUnlockedEpoch(Date.now());
                          }}
                          onCancel={() => {
                            setActiveNavTab('dashboard');
                          }}
                          showToast={showToast}
                        />
                      ) : (
                        <OutstockSystemView
                          key={outstockUnlockedEpoch}
                          initialRole={authRole === 'owner' ? 'outstock_owner' : authRole === 'branch' ? 'outstock_pharmacy' : 'outstock_owner'}
                          currentBranch={currentBranch}
                          currentUser={currentEmpUser}
                          onLogout={handleLogout}
                          themeMode={themeMode}
                          toggleTheme={toggleTheme}
                          showToast={showToast}
                        />
                      )}
                    </Suspense>
                  </ErrorBoundary>
                )}

                {/* Fallback for Unknown Tab */}
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
                  'admin-directives',
                  'branch-directives',
                  'financial-reports',
                  'whatsapp-center',
                  'bylaws',
                  'evaluations',
                  'loans-meds',
                  'income-expenses',
                  'pharmacy-archive',
                  'accounts',
                  'permissions-management',
                  'settings',
                  'notifications',
                  'approval-rules',
                  'approvals',
                  'resignation',
                  'kiosk',
                  'outstock'
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
                </Suspense>
              </ErrorBoundary>
            )}
          </DesktopLayout>
        )
      )}

      {/* ── System Temporary Lock Overlay (Scroll Lock) ── */}
      {isSystemLocked && authRole && authRole !== 'none' && (
        <SystemLockScreen
          authRole={authRole}
          currentBranch={currentBranch}
          currentEmpUser={currentEmpUser}
          state={state}
          onUnlock={() => {
            setIsSystemLocked(false);
            try {
              localStorage.removeItem('app_system_locked');
              sessionStorage.removeItem('app_system_locked');
            } catch {}
          }}
          onLogout={() => {
            setIsSystemLocked(false);
            try {
              localStorage.removeItem('app_system_locked');
              sessionStorage.removeItem('app_system_locked');
            } catch {}
            handleLogout();
          }}
          themeMode={themeMode}
        />
      )}

      {/* ── Sandbox Mode Floating Pill Indicator ── */}
      {sandboxBypassedScreens.global && (
        <div style={{
          position: 'fixed',
          bottom: '22px',
          left: '24px',
          zIndex: 999999,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: '#f59e0b',
          padding: '8px 16px',
          borderRadius: '999px',
          fontSize: '0.82rem',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          border: '1.5px solid rgba(245, 158, 11, 0.45)',
          direction: 'rtl'
        }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span>🧪 وضع تجربة المطور (Sandbox) مفعل</span>
          <button
            onClick={() => {
              sessionStorage.removeItem('sandbox_bypass_global');
              setSandboxBypassedScreens({});
              window.location.reload();
            }}
            style={{
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fef3c7',
              borderRadius: '6px',
              padding: '3px 9px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '700'
            }}
          >
            إنهاء الفحص
          </button>
        </div>
      )}
    </div>
  );
}
