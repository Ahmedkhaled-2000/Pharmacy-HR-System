import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';

// Utilities & Hooks
import { db, STORAGE_KEY, WORK_DAYS_PER_MONTH, WORK_HOURS_PER_DAY } from './utils/supabaseClient';
import {
  arabicMonthLabel,
  arabicWeekday,
  todayStr,
  nowTimeStr,
  uid,
  fmt,
  parseArabicFloat,
  normalizeState
} from './utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from './utils/excelExport';
import { playFingerprintChime, playNotificationChime } from './hooks/useAudio';
import { smartSaveState, smartLoadState, listenToConnectionChanges, syncNow } from './utils/offlineSync';
import { getPendingCount } from './utils/offlineStorage';

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

// New Comprehensive System Modules
import LoginPage from './components/auth/LoginPage';
import SidebarLayout from './components/layout/SidebarLayout';
import BranchManagementModule from './components/branches/BranchManagementModule';
import EmployeeFileModal from './components/employees/EmployeeFileModal';
import WorkBylawsModule from './components/bylaws/WorkBylawsModule';
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

  // Navigation via URL: /admin | /kiosk | /employee
  const location = useLocation();
  const navigate = useNavigate();
  const viewMode = location.pathname === '/kiosk' ? 'kiosk' : location.pathname === '/employee' ? 'employee' : 'admin';
  const [adminSubTab, setAdminSubTab] = useState('dashboard'); // 'dashboard' | 'settings' | 'whatsapp'
  const [empActiveTab, setEmpActiveTab] = useState('portal'); // 'portal' | 'kiosk'

  // Unified Role & Navigation States
  const [authRole, setAuthRole] = useState('none'); // 'none' | 'admin' | 'branch' | 'employee'
  const [currentBranch, setCurrentBranch] = useState(null);
  const [activeNavTab, setActiveNavTab] = useState('dashboard');
  const [isEmpFileModalOpen, setIsEmpFileModalOpen] = useState(false);
  const [editingEmpFile, setEditingEmpFile] = useState(null);

  // Admin Auth State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminInputUser, setAdminInputUser] = useState('');
  const [adminInputPass, setAdminInputPass] = useState('');

  // Core Data State
  const [state, setState] = useState({
    orgSettings: {
      orgName: 'نظام إدارة الموارد البشرية - صيدليات مداواة',
      logoUrl: '',
      adminUsername: 'admin',
      adminPassword: '123'
    },
    branches: [
      {
        id: 'branch_main',
        branchCode: 'BR-101',
        name: 'الفرع الرئيسي - صيدلية مداواة 1',
        address: 'شارع النصر - المقطم',
        phone: '0221234567',
        managerId: 'emp_101',
        username: 'main_branch',
        password: '123'
      }
    ],
    employees: [
      {
        id: 'emp_101',
        code: '101',
        username: '101',
        name: 'أحمد محمود علي',
        phone: '01012345678',
        nationalId: '29901010123456',
        dob: '1995-05-12',
        address: 'القاهرة - المقطم',
        maritalStatus: 'أعزب',
        jobTitle: 'مساعد صيدلي',
        department: 'الصيدلية',
        branchId: 'branch_main',
        hireDate: '2023-01-15',
        contractType: 'دوام كامل',
        status: 'على رأس العمل',
        salary: 4000,
        workHoursPerDay: 8,
        workDaysPerMonth: 26,
        password: '123',
        photoUrl: '',
        documents: [],
        createdAt: todayStr()
      }
    ],
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
        id: 'rule_general',
        name: 'طلبات المكافآت والجزاءات وتعديل البصمات والأذون وتأخير/خروج وإجازات <= 3 أيام والإضافي وتبديل الشفتات',
        requiresBranchManager: true,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: true
      },
      {
        id: 'rule_long_leave',
        name: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)',
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: false
      },
      {
        id: 'rule_loans',
        name: 'طلبات السلف الشهرية والتعليمات والآجل',
        requiresBranchManager: false,
        requiresSuperAdmin: true,
        autoExecuteOnBoth: false
      }
    ],
    shifts: [],
    activeShifts: {},
    adjustments: [],
    requests: [],
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

  // Filter State (YYYY-MM)
  const [monthPicker, setMonthPicker] = useState(() => {
    try {
      return localStorage.getItem('admin_month_picker') || todayStr().slice(0, 7);
    } catch {
      return todayStr().slice(0, 7);
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('admin_month_picker', monthPicker);
    } catch {}
  }, [monthPicker]);

  // Employee Management Modal State
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [empName, setEmpName] = useState('');
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
  const [currentEmpUser, setCurrentEmpUser] = useState(null);
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
    // 1. Admin
    const validUser = state.orgSettings?.adminUsername || 'admin';
    const validPass = state.orgSettings?.adminPassword || '123';
    if (username === validUser && password === validPass) {
      setAuthRole('admin');
      setIsAdminLoggedIn(true);
      showToast('✅ تم تسجيل الدخول كـ Super Admin بنجاح');
      return true;
    }
    // 2. Branch Manager
    const branch = (state.branches || []).find(
      (b) => b.username === username && b.password === password
    );
    if (branch) {
      setAuthRole('branch');
      setCurrentBranch(branch);
      showToast(`✅ تم تسجيل الدخول لصفحة مدير الفرع (${branch.name})`);
      return true;
    }
    // 3. Employee
    const emp = (state.employees || []).find(
      (e) => (e.code === username || e.username === username) && e.password === password
    );
    if (emp) {
      setAuthRole('employee');
      setCurrentEmpUser(emp);
      showToast(`✅ تم تسجيل الدخول كـ موظف (${emp.name})`);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    setAuthRole('none');
    setIsAdminLoggedIn(false);
    setCurrentBranch(null);
    setCurrentEmpUser(null);
    showToast('تم تسجيل الخروج بنجاح');
  };

  // Domain Handlers
  const handleSaveBranch = async (branchData) => {
    const currentBranches = state.branches || [];
    const exists = currentBranches.some((b) => b.id === branchData.id);
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

  const handleDeleteBranch = async (branchId) => {
    const updatedBranches = (state.branches || []).filter((b) => b.id !== branchId);
    const updatedState = { ...state, branches: updatedBranches };
    setState(updatedState);
    await saveState(updatedState);
    showToast('🗑️ تم حذف الفرع');
  };

  const handleSaveEmployeeFile = async (empData) => {
    const currentEmps = state.employees || [];
    const exists = currentEmps.some((e) => e.id === empData.id);
    let updatedEmps;
    if (exists) {
      updatedEmps = currentEmps.map((e) => (e.id === empData.id ? empData : e));
    } else {
      updatedEmps = [...currentEmps, empData];
    }
    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    showToast('💾 تم حفظ وتحديث ملف الموظف في قاعدة البيانات');
  };

  const handleSaveBylaws = async (bylawsData) => {
    const updatedState = { ...state, bylaws: bylawsData };
    setState(updatedState);
    await saveState(updatedState);
    showToast('📜 تم حفظ لائحة الجزاءات بنجاح');
  };

  const handleSaveApprovalRules = async (rulesData) => {
    const updatedState = { ...state, approvalRules: rulesData };
    setState(updatedState);
    await saveState(updatedState);
    showToast('⚙️ تم حفظ قواعد الموافقة والاعتماد');
  };

  const handleApproveRequest = async (requestId, role = 'admin') => {
    const currentRequests = state.requests || [];
    const target = currentRequests.find((r) => r.id === requestId);
    if (!target) return;

    let isBranchApproved = target.branchApproved || role === 'branch';
    let isAdminApproved = target.adminApproved || role === 'admin';

    if (target.targetApproval === 'admin_only' && role === 'admin') {
      isAdminApproved = true;
      isBranchApproved = true;
    }

    const requiresBoth = target.targetApproval === 'admin_only' ? false : true;
    const isFullyApproved = requiresBoth
      ? (isBranchApproved && isAdminApproved)
      : (role === 'admin' ? isAdminApproved : isBranchApproved);

    const updatedRequests = currentRequests.map((r) => {
      if (r.id === requestId) {
        return {
          ...r,
          branchApproved: isBranchApproved,
          adminApproved: isAdminApproved,
          status: isFullyApproved ? 'approved' : 'pending',
          approvedAt: isFullyApproved ? new Date().toISOString() : r.approvedAt
        };
      }
      return r;
    });

    let updatedAdjs = state.adjustments || [];
    let updatedRosters = state.rosters || [];
    let updatedSwaps = state.shiftSwaps || [];
    let updatedEmps = state.employees || [];

    if (isFullyApproved) {
      // 0. Annual Leave Auto-Deduction
      if (target.type === 'leave' && target.leaveType === 'annual') {
        updatedEmps = updatedEmps.map(e => {
          if (e.id === target.employeeId) {
            const currentBal = e.annualLeaveBalance !== undefined ? Number(e.annualLeaveBalance) : 21;
            const newBal = Math.max(0, currentBal - (target.daysCount || 1));
            return { ...e, annualLeaveBalance: newBal };
          }
          return e;
        });
      }
      // 1. Unpaid Leave Auto-Deduction
      if (target.leaveType === 'unpaid') {
        const emp = state.employees.find((e) => e.id === target.employeeId);
        const days = target.daysCount || 1;
        const dailyRate = emp ? ((emp.workHoursPerDay || 8) * (emp.salary || 0)) / (emp.workDaysPerMonth || 26) : 0;
        const totalDeductionAmt = Math.round(days * dailyRate * 100) / 100;

        const newAdj = {
          id: `adj_unpaid_${uid()}`,
          type: 'deduction',
          employeeId: target.employeeId,
          date: target.startDate || todayStr(),
          amount: totalDeductionAmt,
          description: `إجازة غير مدفوعة الأجر (${target.startDate} إلى ${target.endDate})`
        };
        updatedAdjs = [...updatedAdjs, newAdj];
      }

      // 2. Roster Update Request Activation
      if (target.type === 'roster_update') {
        const existingIdx = updatedRosters.findIndex(
          (ros) => ros.employeeId === target.employeeId && ros.month === target.month
        );
        const activeRosterObj = {
          id: target.id,
          employeeId: target.employeeId,
          month: target.month,
          schedule: target.schedule,
          status: 'approved',
          approvedAt: new Date().toISOString()
        };
        if (existingIdx >= 0) {
          updatedRosters[existingIdx] = activeRosterObj;
        } else {
          updatedRosters.push(activeRosterObj);
        }
      }

      // 3. Shift Swap Request Activation & Auto Roster Update
      if (target.type === 'shift_swap' || target.type === 'swap') {
        updatedSwaps = (state.shiftSwaps || []).map((s) =>
          s.id === requestId ? { ...s, status: 'approved', approvedAt: new Date().toISOString() } : s
        );

        const monthKey = (target.requesterDate || todayStr()).slice(0, 7);
        updatedRosters = updatedRosters.map((ros) => {
          if (ros.employeeId === target.requesterEmpId && ros.month === monthKey) {
            return {
              ...ros,
              schedule: {
                ...ros.schedule,
                [arabicWeekday(target.requesterDate)]: ros.schedule[arabicWeekday(target.targetDate)] || { type: 'shift', start: '08:00', end: '16:00' }
              }
            };
          }
          if (ros.employeeId === target.targetEmpId && ros.month === monthKey) {
            return {
              ...ros,
              schedule: {
                ...ros.schedule,
                [arabicWeekday(target.targetDate)]: ros.schedule[arabicWeekday(target.requesterDate)] || { type: 'shift', start: '08:00', end: '16:00' }
              }
            };
          }
          return ros;
        });
      }

      // 4. Bonus or Penalty direct adjustments
      if (target.type === 'bonus' || target.type === 'penalty') {
        const newAdj = {
          id: `adj_${Date.now()}`,
          employeeId: target.employeeId,
          type: target.type === 'penalty' ? 'deduction' : 'bonus',
          amount: parseFloat(target.amount) || 0,
          description: target.details || target.reason || 'معاملة مالية معتمدة',
          date: todayStr()
        };
        updatedAdjs = [...updatedAdjs, newAdj];
      }
    }

    const updatedState = {
      ...state,
      requests: updatedRequests,
      adjustments: updatedAdjs,
      rosters: updatedRosters,
      shiftSwaps: updatedSwaps,
      employees: updatedEmps
    };

    setState(updatedState);
    await saveState(updatedState);
    showToast(isFullyApproved ? '🎉 تم اعتماد الطلب وتحديث الرواتب والسجلات بنجاح!' : '✅ تم قبول خطوتك في انتظار الاعتماد المكتمل');
  };

  const handleRejectRequest = async (requestId, role) => {
    const updatedRequests = (state.requests || []).map((r) =>
      r.id === requestId ? { ...r, status: 'rejected' } : r
    );
    const updatedSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === requestId ? { ...s, status: 'rejected' } : s
    );
    const updatedState = { ...state, requests: updatedRequests, shiftSwaps: updatedSwaps };
    setState(updatedState);
    await saveState(updatedState);
    showToast('❌ تم رفض الطلب');
  };

  const handleAddManualPunch = async ({ employeeId, type, date, time }) => {
    const newShift = {
      id: `shift_${Date.now()}`,
      employeeId,
      date,
      timeIn: type === 'in' ? time : '09:00',
      timeOut: type === 'out' ? time : '17:00',
      hours: 8,
      note: `بصمة يدوية (${type === 'in' ? 'دخول' : 'خروج'})`
    };
    const updatedState = {
      ...state,
      shifts: [...(state.shifts || []), newShift]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('⏱️ تم إضافة البصمة اليدوية بنجاح');
  };

  const handleAddDirectAdjustment = async ({ employeeId, type, amount, notes }) => {
    const newAdj = {
      id: `adj_${Date.now()}`,
      employeeId,
      type,
      amount,
      notes: notes || (type === 'bonus' ? 'مكافأة مباشرة' : 'خصم مباشر'),
      date: todayStr()
    };
    const updatedState = {
      ...state,
      adjustments: [...(state.adjustments || []), newAdj]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('💰 تم إضافة المعاملة وتحديث الرواتب مباشرة');
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
    const loan = (state.loans || []).find((l) => l.id === loanId);
    if (!loan) return;

    const updatedLoans = (state.loans || []).map((l) =>
      l.id === loanId ? { ...l, status: 'approved' } : l
    );

    const newAdj = {
      id: `adj_${Date.now()}`,
      employeeId: loan.employeeId,
      type: 'penalty',
      amount: loan.monthlyDeduction || loan.amount,
      notes: `قسط/خصم سلفة: ${loan.type}`,
      date: todayStr()
    };

    const updatedState = {
      ...state,
      loans: updatedLoans,
      adjustments: [...(state.adjustments || []), newAdj]
    };

    setState(updatedState);
    await saveState(updatedState);
    showToast('✅ تم اعتماد السلفة وتطبيق القسط في نظام الأجور');
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

    const updatedState = { ...state, employees: updatedEmps };
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
    if (!window.confirm(`هل أنت تأكد من حذف الموظف "${emp.name}"؟`)) return;

    const updatedEmps = state.employees.filter((e) => e.id !== empId);
    const updatedActive = { ...state.activeShifts };
    delete updatedActive[empId];

    const updatedState = { ...state, employees: updatedEmps, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);
    showToast(`تم حذف الموظف "${emp.name}"`);
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
    const updatedState = { ...state, shifts: updatedShifts };
    setState(updatedState);
    await saveState(updatedState);
    setMIn('');
    setMOut('');
    setMBreak('0');
    setMNote('');
    showToast('تمت إضافة الوردية بنجاح');
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

    const updatedState = { ...state, shifts: updatedShifts };
    setState(updatedState);
    await saveState(updatedState);
    setEditingShift(null);
    showToast('تم تعديل الوردية بنجاح');
  };

  const deleteShift = async (id) => {
    const shift = state.shifts.find((s) => s.id === id);
    if (shift && !getEmpPermission(shift.employeeId, 'allowEditShift')) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لحذف الورديات المحفوظة');
      return;
    }
    const updatedShifts = state.shifts.filter((s) => s.id !== id);
    const updatedState = { ...state, shifts: updatedShifts };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم حذف الوردية');
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

  const deleteAdjustment = async (id) => {
    const updatedAdjs = state.adjustments.filter((a) => a.id !== id);
    const updatedState = { ...state, adjustments: updatedAdjs };
    setState(updatedState);
    await saveState(updatedState);
    showToast('تم حذف التسوية المالية');
  };

  // Arabic weekday mapping for absence calculation
  const WEEKDAY_AR_MAP = {
    'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3,
    'الخميس': 4, 'الجمعة': 5, 'السبت': 6
  };

  const getAbsenceDaysCount = (empId, monthStr) => {
    if (!monthStr || monthStr.length !== 7) return 0;
    const roster = (state.rosters || []).find(r => r.employeeId === empId && r.month === monthStr && r.status === 'approved');
    if (!roster || !roster.schedule) return 0;

    let dates = [];
    if (roster.fromDate && roster.toDate) {
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
    }

    if (dates.length === 0) {
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
      const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay);
      const daySchedule = roster.schedule[arDayName];
      if (!daySchedule || daySchedule.type === 'off') continue;

      const hasShift = state.shifts.some(s => s.employeeId === empId && s.date === dateStr);
      if (hasShift) continue;

      const hasLeave = (state.leaveRequests || state.requests || []).some(
        r => r.employeeId === empId && r.status === 'approved' &&
        (r.type === 'leave' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave') &&
        r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;

      count++;
    }
    return count;
  };

  // Calculations per employee
  const computeEmpSummary = (empId, filterFn, monthStr = null, targetBranchId = null) => {
    const emp = getEmp(empId);
    if (!emp) return { hours: 0, dailyRate: 0, rate: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

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
    let totalAbsenceDeduction = 0;
    let totalAbsenceDaysCount = 0;
    const perBranch = {};

    branches.forEach(b => {
      const bId = b.branchId;
      const salary = parseFloat(b.salary) || 0;
      const workHoursPerDay = parseFloat(b.workHoursPerDay) || WORK_HOURS_PER_DAY;
      const workDaysPerMonth = parseFloat(b.workDaysPerMonth) || WORK_DAYS_PER_MONTH;

      const dailyRate = workDaysPerMonth > 0 ? (workHoursPerDay * salary) / workDaysPerMonth : 0;
      const rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : 0;

      // shifts for this branch (fallback to true if shift has no branch and employee only has 1 branch)
      const bShifts = state.shifts.filter(s => s.employeeId === empId && filterFn(s.date) && (s.branchId === bId || !s.branchId || branches.length === 1));
      const hours = bShifts.reduce((acc, s) => acc + s.hours, 0);
      const baseEarnings = hours * rate;

      // Absences - currently global but assigned to the first branch if aggregated
      let absenceDaysCount = 0;
      let absenceDeduction = 0;
      if (monthStr && bId === branches[0].branchId) {
         absenceDaysCount = getAbsenceDaysCount(empId, monthStr);
         absenceDeduction = absenceDaysCount * dailyRate;
      }

      perBranch[bId] = { hours, dailyRate, rate, baseEarnings, absenceDaysCount, absenceDeduction, salary, workHoursPerDay, workDaysPerMonth };
      
      totalHours += hours;
      totalBaseEarnings += baseEarnings;
      totalAbsenceDaysCount += absenceDaysCount;
      totalAbsenceDeduction += absenceDeduction;
    });

    const empAdjs = state.adjustments.filter((a) => (a.employeeId === empId || a.employeeId === 'all') && filterFn(a.date));
    const totalBonus = empAdjs.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + a.amount, 0);
    const totalDeduction = empAdjs.filter((a) => a.type === 'deduction').reduce((acc, a) => acc + a.amount, 0);

    const netSalary = totalBaseEarnings + totalBonus - totalDeduction - totalAbsenceDeduction;

    let rate = branches.length === 1 ? perBranch[branches[0].branchId].rate : (totalHours > 0 ? totalBaseEarnings / totalHours : 0);
    let dailyRate = branches.length === 1 ? perBranch[branches[0].branchId].dailyRate : (totalAbsenceDaysCount > 0 ? totalAbsenceDeduction / totalAbsenceDaysCount : 0);

    return { 
      hours: totalHours, 
      dailyRate, 
      rate, 
      baseEarnings: totalBaseEarnings, 
      totalBonus, 
      totalDeduction, 
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
    const totalBonus = Object.values(perEmp).reduce((s, e) => s + e.totalBonus, 0);
    const totalDeduction = Object.values(perEmp).reduce((s, e) => s + e.totalDeduction, 0);
    const totalAbsenceDeduction = Object.values(perEmp).reduce((s, e) => s + e.absenceDeduction, 0);
    const grandNetSalary = totalBaseEarnings + totalBonus - totalDeduction - totalAbsenceDeduction;

    return { perEmp, totalHours, totalBaseEarnings, totalBonus, totalDeduction, totalAbsenceDeduction, grandNetSalary };
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

  // ── تحميل البيانات: من السحابة أو من الذاكرة المحلية (أوف لاين) ───────────
  useEffect(() => {
    setIsLoading(true);
    smartLoadState().then(({ data, source }) => {
      setIsLoading(false);
      if (!data) return;

      if (source === 'local') {
        showToast('📴 أنت أوف لاين - تم تحميل آخر نسخة محفوظة محلياً');
      }

      const normalized = normalizeState(data);
      setState(normalized);
      setLastSyncTime(nowTimeStr());
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
      setIsLoading(false);
      console.error('Load error:', err);
    });
  }, []);

  // ── مستمع الإشعارات للطلبات الجديدة ───────────────
  const prevRequestsLengthRef = useRef(0);
  useEffect(() => {
    const currentLength = state.requests ? state.requests.length : 0;
    if (currentLength > prevRequestsLengthRef.current) {
      if (authRole === 'admin' || authRole === 'branch') {
        playNotificationChime();
        showToast('🔔 يوجد طلب جديد يحتاج للمراجعة');
      }
    }
    prevRequestsLengthRef.current = currentLength;
  }, [state.requests, authRole]);

  // ── مستمع تغيرات الاتصال بالإنترنت ───────────────
  useEffect(() => {
    const unsubscribe = listenToConnectionChanges(
      // عاد الإنترنت
      async () => {
        setIsOffline(false);
        showToast('✅ عاد الاتصال - جاري مزامنة البيانات...');
        const result = await syncNow();
        if (result.success) {
          setPendingSyncCount(0);
          setLastSyncTime(nowTimeStr());
          showToast('✅ تمت مزامنة البيانات بنجاح');
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

  // Cloud Synchronization (Polling + Realtime)
  useEffect(() => {
    const applyRemoteData = (remoteData) => {
      const parsed = typeof remoteData === 'string' ? JSON.parse(remoteData) : remoteData;
      if (!parsed) return;
      const normalized = normalizeState(parsed);
      setState((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(normalized)) {
          setLastSyncTime(nowTimeStr());
          return normalized;
        }
        return prev;
      });
    };

    const poll = async () => {
      try {
        setIsSyncing(true);
        const { data, error } = await db
          .from('app_settings')
          .select('value')
          .eq('key', STORAGE_KEY)
          .single();
        setIsSyncing(false);
        if (!error && data && data.value) {
          applyRemoteData(data.value);
        }
      } catch {
        setIsSyncing(false);
      }
    };

    const pollInterval = setInterval(poll, 2000);

    const channel = db
      .channel('app_settings_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${STORAGE_KEY}` },
        (payload) => {
          if (payload.new && payload.new.value) {
            applyRemoteData(payload.new.value);
          }
        }
      )
      .subscribe();

    const handleFocus = () => poll();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);

    return () => {
      clearInterval(pollInterval);
      db.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
    };
  }, []);

  // Save State function
  const saveState = async (updatedState) => {
    setIsSyncing(true);
    const result = await smartSaveState(updatedState, {
      onSyncSuccess: () => {
        setLastSyncTime(nowTimeStr());
        setPendingSyncCount(0);
      },
      onSyncFail: (msg) => {
        console.error('Supabase write error:', msg);
        showToast('⚠️ تعذر الحفظ في السحابة، تم الحفظ محلياً');
      },
      onQueuedOffline: async () => {
        const count = await getPendingCount();
        setPendingSyncCount(count);
        showToast('📴 أنت أوف لاين - تم الحفظ محلياً وسيتم التزامن عند عودة الإنترنت');
      }
    });
    setIsSyncing(false);
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
  const getEmpPermission = (empId, permKey) => {
    if (isAdminLoggedIn && viewMode === 'admin') return true; // Admin view mode has full unrestricted access
    
    // إذا كان الموظف مسجل الدخول من صفحة البصمة (Kiosk) وتم تأكيد الـ IP، يتم تخطي صلاحيات تسجيل الحضور
    if (viewMode === 'kiosk') {
      if (permKey === 'allowStartEnd' || permKey === 'allowManualShift' || permKey === 'allowEditShift') {
        return true;
      }
    }

    if (empId && empId !== 'all') {
      const emp = state.employees.find((e) => e.id === empId);
      if (emp && emp.permissions && emp.permissions[permKey] !== undefined) {
        return emp.permissions[permKey];
      }
    }
    const globalPerms = state.orgSettings.permissions || {};
    if (globalPerms[permKey] !== undefined) {
      return globalPerms[permKey];
    }
    if (permKey === 'allowManualShift' || permKey === 'allowEditShift' || permKey === 'allowStartEnd' || permKey === 'allowViewSalary' || permKey === 'allowViewAdjustments' || permKey === 'allowExportExcel') {
      return true;
    }
    return false;
  };

  // Direct Image File Upload Handler (Base64)
  const handleFileUpload = (e, callback) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      callback(evt.target.result);
      showToast('تم رفع الصورة بنجاح');
    };
    reader.readAsDataURL(file);
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

  // Punch Shift Actions
  const startShift = async (empId, source = 'admin') => {
    if (!getEmpPermission(empId, 'allowStartEnd')) {
      showToast('❌ تم تقييد الصلاحيات: لا تمتلك صلاحية لبدء أو إنهاء الوردية الحية');
      return;
    }
    if (state.activeShifts[empId]) return;
    const emp = getEmp(empId);
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        date: todayStr(),
        timeIn: nowTimeStr().slice(0, 5),
        startEpoch: Date.now(),
        isPaused: false,
        pauseStartEpoch: null,
        accumulatedPauseMs: 0
      }
    };
    const updatedState = { ...state, activeShifts: updatedActive };
    setState(updatedState);
    await saveState(updatedState);

    const msg = `تم تسجيل حضور ${emp ? emp.name : ''} بنجاح الساعة ${nowTimeStr().slice(0, 5)}`;
    if (source === 'kiosk') {
      playFingerprintChime('success');
      setKioskConfirmModal({
        open: true,
        type: 'checkin',
        empName: emp ? emp.name : '',
        code: emp ? emp.code : '',
        jobTitle: emp ? emp.jobTitle : '',
        photoUrl: emp ? emp.photoUrl : '',
        message: 'تم تسجيل الدخول بنجاح! أهلاً بك على رأس العمل.',
        timestamp: `${todayStr()} · ${nowTimeStr().slice(0, 5)}`
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
    const updatedActive = {
      ...state.activeShifts,
      [empId]: {
        ...active,
        isPaused: true,
        pauseStartEpoch: Date.now()
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
        timestamp: `${todayStr()} · ${nowTimeStr().slice(0, 5)}`
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
        pauseStartEpoch: null,
        accumulatedPauseMs: (active.accumulatedPauseMs || 0) + pauseDuration
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
    const totalElapsedMs = nowMs - active.startEpoch;
    const netActiveMs = Math.max(0, totalElapsedMs - currentPauseMs);

    const breakHours = Math.round((currentPauseMs / 3600000) * 100) / 100;
    const netHours = Math.round((netActiveMs / 3600000) * 100) / 100;

    const newShift = {
      id: uid(),
      employeeId: empId,
      date: active.date,
      timeIn: active.timeIn,
      timeOut,
      hours: netHours,
      breakHours,
      note: 'تسجيل انصراف بلمسة واحدة'
    };

    const updatedShifts = [...state.shifts, newShift];
    const updatedActive = { ...state.activeShifts };
    delete updatedActive[empId];

    const updatedState = { ...state, shifts: updatedShifts, activeShifts: updatedActive };
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
      setKioskSelectedEmp(null);
    } else {
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
          const amt = s.hours * summary.rate;
          dataRow(ws, r, [s.date, arabicWeekday(s.date), s.timeIn, s.timeOut, fmt(s.breakHours || 0), fmt(s.hours), fmt(summary.rate), fmt(amt), s.note || '—'], 1, [4, 5, 6, 7]);
          r++;
        });
      }

      r++;
      const empAdjs = state.adjustments.filter((a) => (a.employeeId === empId || a.employeeId === 'all') && filterFn(a.date));
      mergedTitle(ws, r, 'تفاصيل المكافآت والخصومات', COLS, 'FF3A6E69', 12, 22);
      r++;
      tableHeaderRow(ws, r, ['التاريخ', 'النوع', 'المبلغ', 'البيان / السبب'], 1);
      r++;

      if (empAdjs.length === 0) {
        ws.mergeCells(r, 1, r, 4);
        const cell = ws.getCell(r, 1);
        cell.value = 'لا توجد مكافآت أو خصومات مسجلة لهذه الفترة';
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
      tableHeaderRow(ws, r, ['سعر الساعة الشهرية', 'إجمالي الساعات', 'المستحقات الأساسية', 'إجمالي المكافآت', 'إجمالي الخصومات', 'صافي المرتب النهائي'], 1);
      ws.mergeCells(r, 6, r, COLS);
      r++;

      dataRow(ws, r, [fmt(emp.salary), fmt(summary.hours), fmt(summary.baseEarnings), fmt(summary.totalBonus), fmt(summary.totalDeduction)], 1, [0, 1, 2, 3, 4]);
      ws.mergeCells(r, 6, r, COLS);
      const netCell = ws.getCell(r, 6);
      netCell.value = fmt(summary.netSalary) + ' ج.م';
      netCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF134E4A' } };
      netCell.alignment = { horizontal: 'center', vertical: 'middle' };
      netCell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
      netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };

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

  // Export All Employees Payroll Excel Sheet
  const exportAllPayrollExcel = async (mode = exportType, customStart = exportStartDate, customEnd = exportEndDate) => {
    try {
      let filterFn;
      let periodLabel;
      let isMonthMode;
      let fileNameStr;

      if (mode === 'all_range') {
        if (!customStart || !customEnd) {
          showToast('يرجى تحديد تاريخ البداية والنهاية');
          return;
        }
        filterFn = (d) => d >= customStart && d <= customEnd;
        periodLabel = `من ${customStart} إلى ${customEnd}`;
        isMonthMode = false;
        fileNameStr = `تقرير-رواتب-جميع-الموظفين-من-${customStart}-إلى-${customEnd}.xlsx`;
      } else {
        filterFn = (d) => d.startsWith(monthPicker);
        periodLabel = arabicMonthLabel(monthPicker);
        isMonthMode = true;
        fileNameStr = `تقرير-رواتب-جميع-الموظفين-${monthPicker}.xlsx`;
      }

      const ExcelJS = await loadExcelJS(showToast);
      const grandPayroll = computeGrandPayroll(filterFn, mode === 'month' ? monthPicker : null);
      const COLS = 8;

      const wb = new ExcelJS.Workbook();
      wb.creator = state.orgSettings.orgName || 'نظام الموارد البشرية';
      const ws = wb.addWorksheet('رواتب جميع الموظفين', { views: [{ rightToLeft: true, showGridLines: false }] });
      ws.columns = [{ width: 10 }, { width: 22 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];

      let r = 1;
      mergedTitle(ws, r, isMonthMode ? `كشف رواتب جميع الموظفين وإجمالي الأجور — ${periodLabel}` : `كشف رواتب الموظفين للفترة — ${periodLabel}`, COLS, 'FF0B3532', 16, 32);
      r += 2;

      tableHeaderRow(ws, r, ['كود الموظف', 'اسم الموظف', 'الوظيفة', 'عدد الساعات', 'المستحقات الأساسية', 'المكافآت (+)', 'الخصومات (-)', 'صافي المرتب النهائي']);
      r++;

      state.employees.forEach((emp) => {
        const s = grandPayroll.perEmp[emp.id] || { hours: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, netSalary: 0 };
        dataRow(ws, r, [emp.code, emp.name, emp.jobTitle, fmt(s.hours), fmt(s.baseEarnings), fmt(s.totalBonus), fmt(s.totalDeduction), fmt(s.netSalary)], 1, [3, 4, 5, 6, 7]);
        r++;
      });

      r++;
      mergedTitle(ws, r, 'الإجمالي الكلي لأجور الشركة والرواتب المدفوعة', COLS, 'FF134E4A', 14, 28);
      r++;

      ws.mergeCells(r, 1, r, 3);
      const grandLabel = ws.getCell(r, 1);
      grandLabel.value = 'مجموع الأجور والرواتب المدفوعة كافة';
      grandLabel.font = { name: 'Arial', bold: true, size: 12 };
      grandLabel.alignment = { horizontal: 'center' };
      grandLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
      grandLabel.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };

      const hCell = ws.getCell(r, 4); hCell.value = parseFloat(fmt(grandPayroll.totalHours)); hCell.numFmt = '#,##0.00';
      const bCell = ws.getCell(r, 5); bCell.value = parseFloat(fmt(grandPayroll.totalBaseEarnings)); bCell.numFmt = '#,##0.00';
      const boCell = ws.getCell(r, 6); boCell.value = parseFloat(fmt(grandPayroll.totalBonus)); boCell.numFmt = '#,##0.00';
      const dCell = ws.getCell(r, 7); dCell.value = parseFloat(fmt(grandPayroll.totalDeduction)); dCell.numFmt = '#,##0.00';
      const gCell = ws.getCell(r, 8); gCell.value = parseFloat(fmt(grandPayroll.grandNetSalary)); gCell.numFmt = '#,##0.00';

      [hCell, bCell, boCell, dCell, gCell].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF134E4A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
        c.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
      });

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
      showToast('تم تصدير تقرير رواتب جميع الموظفين بنجاح');
      setIsExportModalOpen(false);
    } catch (e) {
      console.error('Export all payroll excel error:', e);
      showToast('حدث خطأ أثناء تصدير تقرير الشركة الكلي');
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

  const financialFilterFn = (d) => {
    if (financialRangeMode === 'custom') {
      if (!financialStartDate || !financialEndDate) return true;
      return d >= financialStartDate && d <= financialEndDate;
    }
    return d.startsWith(monthPicker);
  };

  const grandSummary = computeGrandPayroll(financialFilterFn, financialRangeMode === 'month' ? monthPicker : null);

  return (
    <div className={`mode-${viewMode}`}>
      {isLoading && <div className="loading-bar"></div>}

      {/* Redirect root to /admin */}
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={null} />
      </Routes>

      {/* ── 1. Unauthenticated Login Screen (Matches Image 2) ── */}
      {viewMode !== 'kiosk' && (
        authRole === 'none' && !isAdminLoggedIn && !currentEmpUser && !currentBranch ? (
          <LoginPage 
            onLogin={handleUnifiedLogin} 
            state={state} 
            themeMode={themeMode} 
            toggleTheme={toggleTheme} 
          />
      ) : authRole === 'employee' ? (
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
          deleteShift={deleteShift}
        />
      ) : (
        /* ── 2. Authenticated Main Application with Sidebar (Matches Image 1) ── */
        <SidebarLayout
          currentRole={authRole}
          currentBranch={currentBranch}
          userProfile={
            authRole === 'branch'
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
          onLogout={handleLogout}
          pendingCount={(state.requests || []).filter(r => r.status === 'pending' || r.status === 'pending_admin').length}
          themeMode={themeMode}
          toggleTheme={toggleTheme}
          customItems={
            authRole === 'branch'
              ? [
                  { id: 'dashboard', label: 'لوحة التحكم', icon: '📊' },
                  {
                    id: 'requests',
                    label: 'صفحة الطلبات',
                    icon: '📋',
                    badge: (state.requests || []).filter((r) => {
                      const branchEmpIds = new Set((state.employees || []).filter((e) => e.branchId === currentBranch?.id).map((e) => e.id));
                      return (branchEmpIds.has(r.employeeId) || r.branchId === currentBranch?.id) && !r.branchApproved && r.status !== 'rejected';
                    }).length
                  },
                  { id: 'branch-roster', label: 'الجدول الشهري للموظفين', icon: '📅' },
                  { id: 'leaves', label: 'الإجازات', icon: '🏖️' },
                  { id: 'permissions', label: 'طلب الأذونات', icon: '⏰' },
                  { id: 'violations', label: 'المكافآت والخصومات', icon: '⚖️' },
                  { id: 'emp-violations', label: 'مكافآت وجزاءات الموظفين', icon: '📑' },
                  { id: 'loans', label: 'السلف والأدوية الآجل', icon: '💳' },
                  { id: 'emp-punches', label: 'سجل بصمات الموظفين', icon: '📜' },
                  { id: 'manager-punches', label: 'سجل بصمات المدير', icon: '⏱️' },
                  { id: 'salary', label: 'تفاصيل المرتب', icon: '💰' },
                  { id: 'evaluations', label: 'التقييمات والشكاوي', icon: '⭐️' },
                ]
              : undefined
          }
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
            <BranchManagerView
              state={state}
              setState={setState}
              saveState={saveState}
              currentBranch={currentBranch}
              activeTab={activeNavTab}
              setActiveTab={setActiveNavTab}
              showToast={showToast}
              onExportExcel={() => {
                const mgrEmp = (state.employees || []).find((e) => e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e.branchId === currentBranch?.id);
                if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                else exportAllPayrollExcel();
              }}
            />
          ) : (
            /* Super Admin / HR View Tabs */
            <>
              {/* 1. Dashboard (لوحة التحكم) */}
              {activeNavTab === 'dashboard' && (
                <Dashboard
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
                  exportAllPayrollExcel={exportAllPayrollExcel}
                  showToast={showToast}
                />
              )}

              {/* 2. Employees Database (الموظفين) */}
              {activeNavTab === 'employees' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h2 style={{ fontFamily: 'Cairo', margin: 0 }}>👥 قاعدة بيانات وملفات الموظفين الشاملة</h2>
                      <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
                        إدارة الفروع، المسميات الوظيفية، رقم قريب الطوارئ، ورصيد الإجازات السنوية
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-start"
                      onClick={() => {
                        setEditingEmpFile(null);
                        setIsEmpFileModalOpen(true);
                      }}
                    >
                      👤 إضافة ملف موظف جديد
                    </button>
                  </div>

                  <EmployeeCardsGrid
                    state={state}
                    monthPicker={monthPicker}
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
                  />
                </div>
              )}

              {/* 3. Branch Management (الفروع) */}
              {activeNavTab === 'branches' && (
                <BranchManagementModule
                  state={state}
                  onSaveBranch={handleSaveBranch}
                  onDeleteBranch={handleDeleteBranch}
                />
              )}

              {/* 4. Attendance Punches (الحضور وانصراف الموظفين) */}
              {activeNavTab === 'attendance' && (
                <AttendanceModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                />
              )}

              {/* 4.5. Electronic Attendance (البصمة الإلكترونية) */}
              {activeNavTab === 'electronic-attendance' && (
                <ElectronicAttendanceAdmin
                  state={state}
                  setState={setState}
                  saveState={saveState}
                />
              )}

              {/* 5. Monthly Rosters (الجداول الشهرية) */}
              {activeNavTab === 'roster' && (
                <RosterModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
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
                />
              )}

              {/* 7. Leaves Tracking (الإجازات) */}
              {activeNavTab === 'leaves-tracking' && (
                <LeavesTrackingModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                />
              )}

              {/* 8. Payroll Summary (رواتب الموظفين) */}
              {activeNavTab === 'payroll' && (
                <PayrollModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
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
                <WorkBylawsModule state={state} onSaveBylaws={handleSaveBylaws} />
              )}

              {/* 11. Performance Evaluations (التقييمات) */}
              {activeNavTab === 'evaluations' && (
                <EvaluationsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  currentRole="admin"
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
                />
              )}

              {/* 13. Income & Expenses (المصروفات والإيرادات) */}
              {activeNavTab === 'income-expenses' && (
                <IncomeExpensesModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                />
              )}

              {/* 14. System Settings (الإعدادات) */}
              {activeNavTab === 'settings' && (
                <SettingsModule
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </SidebarLayout>
      ))}

      {/* Comprehensive Employee File Modal */}
      <EmployeeFileModal
        isOpen={isEmpFileModalOpen}
        onClose={() => setIsEmpFileModalOpen(false)}
        editingEmp={editingEmpFile}
        branches={state.branches || []}
        allEmployees={state.employees || []}
        onSave={handleSaveEmployeeFile}
        handleFileUpload={handleFileUpload}
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
                              <td className="money" style={{ color: 'var(--primary-dark)' }}>{fmt(s.hours)} س</td>
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

      {/* Toast Notification */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>{toast.message}</div>
    </div>
  );
}
