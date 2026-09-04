import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AR_MONTHS, arabicWeekday, fmt, arabicMonthLabel, getActivePayrollCycleMonth, getEmpDisplayName, getEmployeeManualPunchesCount, isShiftManualPunch, getEmployeeApprovedLeaves } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';
import { getCycleDateRange, createDatePredicate, getActivePayrollMonth } from '../../utils/periodEngine';
import { getRealDate, getRealTodayStr, getRealNowTimeStr } from '../../utils/timeEngine';
import { filterEmployeeNotifications, countUnreadEmployeeNotifications, getNotificationTargetTab, getNotificationTabLabel } from '../../utils/notificationEngine';

import EmployeeLeaveModule from './EmployeeLeaveModule';
import EmployeeLoansModule from './EmployeeLoansModule';
import EmployeePermissionsModule from './EmployeePermissionsModule';
import EmployeeRosterModule, { getResolvedEmployeeRoster } from './EmployeeRosterModule';
import EmployeeShiftSwapModule from './EmployeeShiftSwapModule';
import EmployeeEvaluationsModule from './EmployeeEvaluationsModule';
import PayslipPrintModal from '../payroll/PayslipPrintModal';
import BylawsModule from '../bylaws/BylawsModule';
import EmployeeResignationModule from './EmployeeResignationModule';
import EmployeeBiometricSection from './EmployeeBiometricSection';
import FaceRegistrationModal from '../attendance/FaceRegistrationModal';
import FaceTestModal from '../attendance/FaceTestModal';
import { preWarmFaceModels } from '../../utils/faceApiHelper';
import { uploadBiometricAttendancePhoto } from '../../utils/googleDriveService';
import { sendBiometricRegistrationRequestEmail, sendBiometricResetRequestEmail } from '../../utils/gmailService';
import { computeLatenessFinancialAmount, isApprovedPermissionForDate, getEffectiveShiftHours } from '../../utils/latePenaltyEngine';
import { getEmployeeDaySchedule, checkAndTriggerCycleEndRosterReminder } from '../../utils/rosterEngine';
import { printEmployeePayslipDirect } from '../../utils/printHelper';
import { useLiveRealTime } from '../../hooks/useLiveRealTime';
import '../../portal.css';

// ─────────────────────────────────────────
//  Month navigation helpers
// ─────────────────────────────────────────
function monthLabel(monthStr) {
  if (!monthStr) return { arabic: '', num: '', raw: '' };
  const [y, m] = monthStr.split('-');
  const idx = parseInt(m, 10) - 1;
  return {
    arabic: `${AR_MONTHS[idx]} ${y}`,
    num: `(الشهر ${m})`,
    raw: `${AR_MONTHS[idx]} ${y} (الشهر ${m})`
  };
}

function prevMonth(m) {
  const d = new Date(m + '-01');
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function nextMonth(m) {
  const d = new Date(m + '-01');
  d.setMonth(d.getMonth() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// Arabic weekday name => JS getDay() index mapping
const WEEKDAY_AR_MAP = {
  'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3,
  'الخميس': 4, 'الجمعة': 5, 'السبت': 6
};

// ─────────────────────────────────────────
//  Summary Card
// ─────────────────────────────────────────
function SummaryCard({ icon, label, value, colorVar, sub, isPrivacy = false }) {
  return (
    <div className="ep-summary-card">
      <div className="ep-summary-icon">{icon}</div>
      <div className="ep-summary-body">
        <div className="ep-summary-label">{label}</div>
        <div className={`ep-summary-value ${isPrivacy ? 'ep-privacy-blurred' : ''}`} style={colorVar ? { color: `var(${colorVar})` } : {}}>
          {value}
        </div>
        {sub && <div className={`ep-summary-sub ${isPrivacy ? 'ep-privacy-blurred' : ''}`}>{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
//  Navigation menu items
// ─────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',   icon: '📊', label: 'لوحة التحكم' },
  { id: 'salary',      icon: '💼', label: 'تفاصيل المرتب' },
  { id: 'adjustments', icon: '📝', label: 'المكافآت والخصومات' },
  { id: 'leaves',      icon: '🏖️', label: 'الإجازات' },
  { id: 'loans',       icon: '💳', label: 'السلف والأدوية الآجل' },
  { id: 'permissions', icon: '⏰', label: 'طلب الأذونات' },
  { id: 'shifts',      icon: '📋', label: 'سجل البصمات' },
  { id: 'biometric',   icon: '📸', label: 'البصمة الإلكترونية' },
  { id: 'roster',      icon: '🗓️', label: 'الجدول الشهري' },
  { id: 'swaps',       icon: '🔄', label: 'تبديل الشيفتات' },
  { id: 'evaluations', icon: '⭐', label: 'التقييمات والشكاوي' },
  { id: 'bylaws',      icon: '📜', label: 'لائحة العمل والجزاءات' },
  { id: 'resignations',icon: '🚪', label: 'طلبات الاستقالة' },
];

// ─────────────────────────────────────────
//  Main Employee Portal View
// ─────────────────────────────────────────
export default function EmployeePortalView({
  currentEmpUser,
  setCurrentEmpUser,
  empLoginCode,
  setEmpLoginCode,
  empLoginPassword,
  setEmpLoginPassword,
  handleEmpLogin,
  state,
  setState,
  saveState,
  computeEmpSummary,
  getEmpPermission,
  showToast,
  orgSettings,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  getActiveElapsedStr,
  getActiveBreakStr,
  openEditShift,
  handleLogout,
  deleteShift,
  themeMode,
  toggleTheme,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onClearReadNotifications,
}) {
  const emp = useMemo(() => {
    if (!currentEmpUser) return null;
    const found = (state?.employees || []).find((e) =>
      (currentEmpUser.id && (String(e.id) === String(currentEmpUser.id) || String(e.code) === String(currentEmpUser.id))) ||
      (currentEmpUser.code && (String(e.code) === String(currentEmpUser.code) || String(e.id) === String(currentEmpUser.code))) ||
      (currentEmpUser.username && (String(e.username) === String(currentEmpUser.username) || String(e.code) === String(currentEmpUser.username)))
    );
    return found || currentEmpUser;
  }, [state?.employees, currentEmpUser]);

  const activeAutoCycleMonth = useMemo(() => {
    return getActivePayrollMonth(orgSettings || state?.orgSettings, getRealDate());
  }, [
    state?.orgSettings?.payrollPayoutStartDay,
    state?.orgSettings?.payrollPayoutEndDay,
    state?.orgSettings?.payrollPayoutStartTime,
    state?.orgSettings?.payrollPayoutEndTime,
    state?.orgSettings?.payrollPeriodType,
    orgSettings?.payrollPayoutStartDay,
    orgSettings?.payrollPayoutEndDay,
    orgSettings?.payrollPayoutStartTime,
    orgSettings?.payrollPayoutEndTime,
    orgSettings?.payrollPeriodType
  ]);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      const activeAutoCycle = getActivePayrollMonth(orgSettings || state?.orgSettings, getRealDate());
      return activeAutoCycle || localStorage.getItem('emp_selected_month') || getRealTodayStr().slice(0, 7);
    } catch { return getRealTodayStr().slice(0, 7); }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('emp_active_tab') || 'dashboard'; } catch { return 'dashboard'; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [exportRangeMode, setExportRangeMode] = useState('current');
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [filterMode, setFilterMode] = useState(() => {
    try { return localStorage.getItem('emp_filter_mode') || 'month'; } catch { return 'month'; }
  });
  const [rangeStart, setRangeStart] = useState(() => {
    try { return localStorage.getItem('emp_range_start') || ''; } catch { return ''; }
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    try { return localStorage.getItem('emp_range_end') || ''; } catch { return ''; }
  });
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [autoOpenRosterModal, setAutoOpenRosterModal] = useState(false);
  const [showBiometricRegisterModal, setShowBiometricRegisterModal] = useState(false);
  const [showBiometricTestModal, setShowBiometricTestModal] = useState(false);

  // Modern Navigation & UI States
  const [openDropdown, setOpenDropdown] = useState(null);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [drawerExpandedGroup, setDrawerExpandedGroup] = useState(null);
  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    try { return typeof window !== 'undefined' && window.innerWidth <= 768; } catch { return false; }
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // التحميل الاستباقي في الخلفية لمحرك التعرف على الوجه ليعمل فورياً دون تأخير
  useEffect(() => {
    const timer = setTimeout(() => {
      preWarmFaceModels();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const [isPrivacyMode, setIsPrivacyMode] = useState(() => {
    try { return localStorage.getItem('emp_privacy_mode') === 'true'; } catch { return false; }
  });

  const togglePrivacyMode = () => {
    setIsPrivacyMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('emp_privacy_mode', String(next)); } catch {}
      return next;
    });
  };

  const liveTime = useLiveRealTime(1000);
  const menuContainerRef = useRef(null);
  const notifDropdownRef = useRef(null);

  // Close menus on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setIsNotifDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setIsNotifDropdownOpen(false);
        setIsMobileDrawerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Auto-sync selectedMonth with active payroll cycle when cutoff settings change
  useEffect(() => {
    if (activeAutoCycleMonth && filterMode === 'month' && !localStorage.getItem('emp_month_manually_locked')) {
      if (activeAutoCycleMonth !== selectedMonth) {
        setSelectedMonth(activeAutoCycleMonth);
      }
    }
  }, [activeAutoCycleMonth, filterMode]);

  useEffect(() => { try { localStorage.setItem('emp_active_tab', activeTab); } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem('emp_selected_month', selectedMonth); } catch {} }, [selectedMonth]);
  useEffect(() => { try { localStorage.setItem('emp_filter_mode', filterMode); } catch {} }, [filterMode]);
  useEffect(() => { try { localStorage.setItem('emp_range_start', rangeStart); } catch {} }, [rangeStart]);
  useEffect(() => { try { localStorage.setItem('emp_range_end', rangeEnd); } catch {} }, [rangeEnd]);

  const empCycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, orgSettings || state?.orgSettings);
  }, [selectedMonth, orgSettings, state?.orgSettings]);

  const primaryEmpBranchId = emp?.branchesDetails?.[0]?.branchId || emp?.branchId || '';
  const [selectedBranchId, setSelectedBranchId] = useState(primaryEmpBranchId);
  const [isBranchSelected, setIsBranchSelected] = useState(Boolean(primaryEmpBranchId));
  const [punchTargetBranchId, setPunchTargetBranchId] = useState(primaryEmpBranchId);

  useEffect(() => {
    if (currentEmpUser) {
      const currentEmp = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;
      const primaryBId = currentEmp?.branchesDetails?.[0]?.branchId || currentEmp?.branchId || '';
      if (!currentEmp || !currentEmp.branchesDetails || currentEmp.branchesDetails.length <= 1) {
        setSelectedBranchId(primaryBId);
        setIsBranchSelected(true);
        setPunchTargetBranchId(primaryBId);
      } else {
        setPunchTargetBranchId(primaryBId);
        if (!selectedBranchId && primaryBId) {
          setSelectedBranchId(primaryBId);
        }
      }
    }
  }, [currentEmpUser?.id, emp?.branchesDetails, emp?.branchId]);

  // When multi-branch employee is on "All Branches" (selectedBranchId === ''), only allowed tabs are accessible
  useEffect(() => {
    const isMultiBranchEmp = emp?.branchesDetails && emp.branchesDetails.length > 1;
    if (isMultiBranchEmp && !selectedBranchId) {
      const allowedAllBranchTabs = ['dashboard', 'salary', 'evaluations', 'bylaws'];
      if (!allowedAllBranchTabs.includes(activeTab)) {
        setActiveTab('dashboard');
      }
    }
  }, [selectedBranchId, emp?.branchesDetails, activeTab]);

  // ── Auto-trigger reminder notification when payroll cycle end is near/finished and no roster submitted ──
  useEffect(() => {
    if (!emp || !state || !setState) return;
    try {
      const newNotif = checkAndTriggerCycleEndRosterReminder(state, emp);
      if (newNotif) {
        const updatedState = {
          ...state,
          notifications: [newNotif, ...(state.notifications || [])]
        };
        setState(updatedState);
        if (typeof saveState === 'function') {
          saveState(updatedState);
        }
      }
    } catch (err) {
      console.warn('Error checking cycle end roster reminder:', err);
    }
  }, [emp?.id, state?.orgSettings, state?.rosters?.length, state?.requests?.length]);

  // ── Form States for Employee Actions ───────────
  const [showManualForm, setShowManualForm] = useState(false);
  const [empManualDate, setEmpManualDate] = useState(() => getRealTodayStr());
  const [empManualIn, setEmpManualIn] = useState('');
  const [empManualOut, setEmpManualOut] = useState('');
  const [empManualBreak, setEmpManualBreak] = useState('0');
  const [empManualNote, setEmpManualNote] = useState('');

  const [showAdjForm, setShowAdjForm] = useState(false);
  const [empAdjType, setEmpAdjType] = useState('bonus');
  const [empAdjAmount, setEmpAdjAmount] = useState('');
  const [empAdjDate, setEmpAdjDate] = useState(() => getRealTodayStr());
  const [empAdjDesc, setEmpAdjDesc] = useState('');

  // ── Export Excel ──────────────────────────────
  const exportToExcel = async (rangeMode = 'month', customStart = '', customEnd = '') => {
    if (!currentEmpUser || !emp) return;
    const canExport = getEmpPermission ? getEmpPermission(emp, 'allowExportExcel') : true;
    if (!canExport) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتصدير شيت الإكسل');
      return;
    }
    setExporting(true);
    try {
      const ExcelJS = await loadExcelJS(showToast);

      let filterFn;
      let periodLabel;
      let fileNameStr;

      if (rangeMode === 'custom') {
        if (!customStart || !customEnd) {
          showToast('يرجى تحديد تاريخ البداية وتاريخ النهاية');
          setExporting(false);
          return;
        }
        filterFn = (d) => d >= customStart && d <= customEnd;
        periodLabel = `من ${customStart} إلى ${customEnd}`;
        fileNameStr = `كشف-مرتب-${emp.name}-من-${customStart}-إلى-${customEnd}.xlsx`;
      } else {
        filterFn = (d) => d.startsWith(selectedMonth);
        periodLabel = monthLabel(selectedMonth).raw;
        fileNameStr = `كشف-مرتب-${emp.name}-${selectedMonth}.xlsx`;
      }

      const summary = computeEmpSummary(emp.id, filterFn, rangeMode === 'month' ? selectedMonth : null, selectedBranchId || null);
      const COLS = 9;

      const wb = new ExcelJS.Workbook();
      wb.creator = (orgSettings && orgSettings.orgName) || 'نظام البصمات';
      wb.created = new Date();

      const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;

      if (isMultiBranch) {
        // ── Multi-Branch Employee: Generate separate sheet for each branch + summary sheet ──
        emp.branchesDetails.forEach((bd, bdIdx) => {
          const bId = bd.branchId;
          const bObj = (state.branches || []).find((b) => b.id === bId);
          const bName = bObj ? bObj.name : `فرع ${bdIdx + 1}`;
          const cleanSheetName = `فرع ${bName}`.replace(/[\*\?\/\\\[\]]/g, '').slice(0, 30);

          const bSummary = computeEmpSummary(emp.id, filterFn, rangeMode === 'month' ? selectedMonth : null, bId);
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
          mergedTitle(ws, r, `كشف تفاصيل مفردات مرتب الموظف — ${emp.name} (📍 فرع: ${bName})`, COLS, 'FF0B3532', 16, 32);
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
            .filter((s) => s.employeeId === emp.id && filterFn(s.date) && (s.branchId === bId || (!s.branchId && bdIdx === 0)))
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
          // ── Late Penalty Incidents Table for this Branch ──
          const bLateIncidents = (state.lateIncidents || []).filter(
            (inc) =>
              String(inc.employeeId) === String(emp.id) &&
              inc.status !== 'cancelled' &&
              inc.status !== 'approved_permission_exempt' &&
              inc.actionType !== 'grace' &&
              !isApprovedPermissionForDate(emp.id, inc.date, state) &&
              (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
              filterFn(inc.date) &&
              (inc.branchId === bId || (!inc.branchId && bdIdx === 0))
          );

          if (bLateIncidents.length > 0) {
            mergedTitle(ws, r, `تفاصيل وقائع التأخير وخصم لائحة الجزاءات (${bLateIncidents.length} واقعة تأخير) — فرع ${bName}`, COLS, 'FFC2410C', 12, 24);
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
            (a) => (a.employeeId === emp.id || a.employeeId === 'all') && filterFn(a.date) && (a.branchId === bId || (!a.branchId && bdIdx === 0))
          );

          mergedTitle(ws, r, `تفاصيل المكافآت والخصومات — فرع ${bName}`, COLS, 'FF3A6E69', 12, 22);
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
          const bSummary = computeEmpSummary(emp.id, filterFn, rangeMode === 'month' ? selectedMonth : null, bId);

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
        // Single Branch sheet
        const ws = wb.addWorksheet(`مرتب ${emp.name}`, { views: [{ rightToLeft: true, showGridLines: false }] });
        ws.columns = [
          { width: 13 }, { width: 11 }, { width: 11 }, { width: 11 },
          { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 30 }
        ];

        let r = 1;
        mergedTitle(ws, r, `كشف مفردات مرتب الموظف — ${emp.name} (${(orgSettings && orgSettings.orgName) || ''})`, COLS, 'FF0B3532', 16, 32);
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
        infoCell.value = `اسم الموظف: ${emp.name}   |   كود الموظف: ${emp.code}   |   الوظيفة: ${emp.jobTitle}   |   الفترة: ${periodLabel}   |   الراتب الأساسي: ${fmt(emp.salary)} ج.م   |   أجر الساعة المحسوب: ${fmt(summary.rate)} ج.م`;
        infoCell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF1D2624' } };
        infoCell.alignment = { horizontal: 'center' };
        infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
        r += 2;

        tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'وقت الدخول', 'وقت الخروج', 'البريك (ساعة)', 'ساعات العمل', 'سعر الساعة', 'المبلغ المستحق', 'الملاحظات']);
        r++;

        const empShifts = state.shifts
          .filter((s) => s.employeeId === emp.id && filterFn(s.date))
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
            dataRow(ws, r, [
              s.date, arabicWeekday(s.date), s.timeIn, s.timeOut || '—',
              s.breakHours ? fmt(s.breakHours) : '—', fmt(effHours),
              fmt(summary.rate), fmt(effHours * summary.rate), s.note || '—'
            ], 1, [4, 5, 6, 7]);
            r++;
          });
        }

        r += 1;
        // ── Allowances Breakdown Table ──
        const allowanceItems = [];
        if ((summary.managementAllowance || 0) > 0) {
          allowanceItems.push(['بدل إدارة شهري', `بدل إدارة معتمد لوظيفة (${emp.jobTitle})`, parseFloat(fmt(summary.managementAllowance))]);
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

        // ── Late Penalty Incidents Table ──
        const empLateIncidents = (state.lateIncidents || []).filter(
          (inc) =>
            String(inc.employeeId) === String(emp.id) &&
            inc.status !== 'cancelled' &&
            inc.status !== 'approved_permission_exempt' &&
            inc.actionType !== 'grace' &&
            !isApprovedPermissionForDate(emp.id, inc.date, state) &&
            (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
            filterFn(inc.date) &&
            (!selectedBranchId || String(inc.branchId) === String(selectedBranchId))
        );

        if (empLateIncidents.length > 0) {
          mergedTitle(ws, r, `تفاصيل وقائع التأخير وخصم لائحة الجزاءات (${empLateIncidents.length} واقعة تأخير)`, COLS, 'FFC2410C', 12, 24);
          r++;
          tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'الشيفت المجدول', 'الحضور الفعلي', 'دقائق التأخير', 'فئة التأخير', 'التكرار', 'الجزاء اللائحي', 'دقائق الخصم', 'مبلغ الخصم لليوم (ج.م)'], 1);
          r++;
          empLateIncidents.forEach((inc) => {
            const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || selectedBranchId);
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

        const empAdjs = state.adjustments.filter(
          (a) => (a.employeeId === emp.id || a.employeeId === 'all') && filterFn(a.date)
        );

        mergedTitle(ws, r, 'تفاصيل المكافآت والخصومات', COLS, 'FF3A6E69', 12, 22);
        r++;
        tableHeaderRow(ws, r, ['التاريخ', 'النوع', 'المبلغ', 'البيان / السبب'], 1);
        r++;

        if (empAdjs.length === 0) {
          ws.mergeCells(r, 1, r, COLS);
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
        tableHeaderRow(ws, r, ['سعر الساعة الشهرية', 'إجمالي الساعات', 'مستحقات الأساسي', 'الوقت الإضافي (+)', 'إجمالي البدلات (+)', 'إجمالي المكافآت (+)', 'إجمالي الخصومات (-)', 'صافي المرتب النهائي'], 1);
        ws.mergeCells(r, 8, r, COLS);
        r++;

        dataRow(ws, r, [fmt(emp.salary), fmt(summary.hours), fmt(summary.baseEarnings), fmt(summary.overtimeEarnings || 0), fmt(summary.totalAllowances || 0), fmt(summary.totalBonus), fmt(summary.totalDeduction)], 1, [0, 1, 2, 3, 4, 5, 6]);
        ws.mergeCells(r, 8, r, COLS);
        const netCell = ws.getCell(r, 8);
        netCell.value = fmt(summary.netSalary) + ' ج.م';
        netCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF134E4A' } };
        netCell.alignment = { horizontal: 'center', vertical: 'middle' };
        netCell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
        netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameStr;
      a.click();
      window.URL.revokeObjectURL(url);

      showToast('تم تصدير شيت المرتب بنجاح 📥');
    } catch (err) {
      console.error('Excel export error:', err);
      showToast('حدث خطأ أثناء تصدير شيت الإكسل: ' + (err.message || err));
    } finally {
      setExporting(false);
    }
  };

  const handleExportSubmit = () => {
    setShowExportModal(false);
    exportToExcel(exportRangeMode, exportStart, exportEnd);
  };

  // ── Employee Action Handlers ──
  const handleEmpAddManualShift = async () => {
    if (!empManualDate || !empManualIn || !empManualOut) {
      showToast('يرجى تعبئة التاريخ ووقتي الدخول والخروج');
      return;
    }
    const emp = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;
    const parsedBreak = Math.max(0, parseFloat(empManualBreak) || 0);
    const [inH, inM] = empManualIn.split(':').map(Number);
    const [outH, outM] = empManualOut.split(':').map(Number);
    let start = inH * 60 + inM;
    let end = outH * 60 + outM;
    if (end <= start) end += 24 * 60;
    const totalHours = (end - start) / 60;
    const netHours = Math.round(Math.max(0, totalHours - parsedBreak) * 100) / 100;

    const newShift = {
      id: 'shift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      date: empManualDate,
      timeIn: empManualIn,
      timeOut: empManualOut,
      hours: netHours,
      breakHours: Math.round(parsedBreak * 100) / 100,
      note: empManualNote.trim()
    };

    const updatedShifts = [...state.shifts, newShift];
    const updatedState = { ...state, shifts: updatedShifts };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    setShowManualForm(false);
    setEmpManualIn('');
    setEmpManualOut('');
    setEmpManualBreak('0');
    setEmpManualNote('');
    showToast('تمت إضافة الوردية بنجاح ⏱️');
  };

  const handleEmpAddAdjustment = async () => {
    const amount = parseFloat(empAdjAmount);
    if (!amount || amount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح');
      return;
    }
    const emp = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;
    const newAdj = {
      id: 'adj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: empAdjType,
      employeeId: emp.id,
      date: empAdjDate || getRealTodayStr(),
      amount,
      description: empAdjDesc.trim()
    };
    const updatedAdjs = [...state.adjustments, newAdj];
    const updatedState = { ...state, adjustments: updatedAdjs };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    setShowAdjForm(false);
    setEmpAdjAmount('');
    setEmpAdjDesc('');
    showToast('تمت إضافة التسوية بنجاح 📝');
  };

  // ─────────────────────────────────────────
  //  Core Calculations & Hooks (MUST BE UNCONDITIONAL)
  // ─────────────────────────────────────────
  const getPayrollCutoffRange = (monthStr) => {
    return getCycleDateRange(monthStr, orgSettings || state?.orgSettings);
  };

  const isPermActive = (permKey, defaultVal = true) => {
    let actionName = permKey;
    if (permKey.startsWith('can')) actionName = permKey.slice(3);
    else if (permKey.startsWith('allow')) actionName = permKey.slice(5);
    const canKey = 'can' + actionName;
    const allowKey = 'allow' + actionName;

    const targetId = emp ? String(emp.id) : (currentEmpUser ? String(currentEmpUser.id) : null);
    const targetCode = emp ? String(emp.code) : (currentEmpUser ? String(currentEmpUser.code) : null);

    // 1. فحص الصلاحيات المخصصة للموظف المحدد في empPermissions
    const empOverrides = state?.orgSettings?.empPermissions || orgSettings?.empPermissions;
    if (empOverrides && typeof empOverrides === 'object') {
      const specific = (targetId && empOverrides[targetId]) || (targetCode && empOverrides[targetCode]);
      if (specific && typeof specific === 'object') {
        if (specific[canKey] !== undefined) return Boolean(specific[canKey]);
        if (specific[allowKey] !== undefined) return Boolean(specific[allowKey]);
        if (specific[actionName] !== undefined) return Boolean(specific[actionName]);
        if (specific[permKey] !== undefined) return Boolean(specific[permKey]);
      }
    }

    // 2. فحص الصلاحيات المسجلة داخل كائن الموظف نفسه emp.permissions
    const empPerms = emp?.permissions || currentEmpUser?.permissions;
    if (empPerms && typeof empPerms === 'object' && Object.keys(empPerms).length > 0) {
      if (empPerms[canKey] !== undefined) return Boolean(empPerms[canKey]);
      if (empPerms[allowKey] !== undefined) return Boolean(empPerms[allowKey]);
      if (empPerms[actionName] !== undefined) return Boolean(empPerms[actionName]);
      if (empPerms[permKey] !== undefined) return Boolean(empPerms[permKey]);
    }

    // 3. فحص الصلاحيات العامة للمؤسسة في orgSettings.permissions
    const globalPerms = state?.orgSettings?.permissions || orgSettings?.permissions;
    if (globalPerms && typeof globalPerms === 'object') {
      if (globalPerms[canKey] !== undefined) return Boolean(globalPerms[canKey]);
      if (globalPerms[allowKey] !== undefined) return Boolean(globalPerms[allowKey]);
      if (globalPerms[actionName] !== undefined) return Boolean(globalPerms[actionName]);
      if (globalPerms[permKey] !== undefined) return Boolean(globalPerms[permKey]);
    }

    // 4. استدعاء دالة getEmpPermission الممررة
    if (typeof getEmpPermission === 'function') {
      return Boolean(getEmpPermission(emp || currentEmpUser, permKey));
    }

    return defaultVal;
  };

  const canViewSalary = isPermActive('canViewSalary', true);
  const canStartEnd = isPermActive('canStartEnd', true);
  const canLivePunch = isPermActive('canLivePunch', true);
  const canManualShift = isPermActive('canManualShift', false);
  const canEditShift = isPermActive('canEditShift', false);
  const canAddAdjustment = isPermActive('canAddAdjustment', false);
  const canViewAdjustments = isPermActive('canViewAdjustments', true);
  const canExportExcel = isPermActive('canExportExcel', true);
  const canApplyLoan = isPermActive('canApplyLoan', true);
  const canApplyLeave = isPermActive('canApplyLeave', true);
  const canApplyPermission = isPermActive('canApplyPermission', true);
  const canApplySwap = isPermActive('canApplySwap', true);
  const canViewBylaws = isPermActive('canViewBylaws', true);
  const canSubmitComplaint = isPermActive('canSubmitComplaint', true);
  const canViewRoster = isPermActive('canViewRoster', true);

  const isCustomMode = filterMode === 'range' || filterMode === 'custom';
  const effectiveStart = (rangeStart && rangeEnd) ? (rangeStart <= rangeEnd ? rangeStart : rangeEnd) : (rangeStart || rangeEnd);
  const effectiveEnd = (rangeStart && rangeEnd) ? (rangeStart <= rangeEnd ? rangeEnd : rangeStart) : (rangeEnd || rangeStart);
  const rangeFilterValid = isCustomMode && Boolean(effectiveStart || effectiveEnd);

  const filterFn = (d) => {
    if (!d) return false;
    const dateOnly = String(d).slice(0, 10);
    if (isCustomMode) {
      if (effectiveStart && dateOnly < effectiveStart) return false;
      if (effectiveEnd && dateOnly > effectiveEnd) return false;
      return true;
    }
    const range = getPayrollCutoffRange(selectedMonth);
    if (range) return dateOnly >= range.startDate && dateOnly <= range.endDate;
    return dateOnly.startsWith(selectedMonth);
  };

  const lbl = monthLabel(selectedMonth);
  const cutoffInfo = getPayrollCutoffRange(selectedMonth);
  const periodLabel = rangeFilterValid 
    ? `من ${effectiveStart || '—'} إلى ${effectiveEnd || '—'}` 
    : (cutoffInfo ? `من ${cutoffInfo.startDate} إلى ${cutoffInfo.endDate} (${lbl.arabic})` : lbl.raw);

  const summary = emp 
    ? computeEmpSummary(emp.id, filterFn, filterMode === 'month' ? selectedMonth : null, selectedBranchId || null)
    : { hours: 0, dailyRate: 0, rate: 0, hourlyRate: 0, monthlySalary: 0, salary: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, absenceDaysCount: 0, perBranch: {} };

  const empShifts = emp
    ? (state.shifts || [])
        .filter((s) => s.employeeId === emp.id && filterFn(s.date) && (!selectedBranchId || s.branchId === selectedBranchId || !s.branchId))
        .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)))
    : [];

  const empAdjs = useMemo(() => {
    if (!emp) return [];

    const map = new Map();

    const bDetail = selectedBranchId
      ? emp.branchesDetails?.find((b) => String(b.branchId) === String(selectedBranchId))
      : (emp?.branchesDetails && emp.branchesDetails.length === 1 ? emp.branchesDetails[0] : null);
    const hrRate = bDetail ? (parseFloat(bDetail.salary) || 0) : (parseFloat(emp?.salary) || 0);
    const wHours = bDetail ? (parseFloat(bDetail.workHoursPerDay) || 8) : (parseFloat(emp?.workHoursPerDay) || 8);
    const wDays = bDetail ? (parseFloat(bDetail.workDaysPerMonth) || 26) : (parseFloat(emp?.workDaysPerMonth) || 26);
    const calcDailyRate = wDays > 0 ? (hrRate * wHours) / wDays : (hrRate * wHours);

    // 1. Direct Adjustments (state.adjustments)
    const directAdjs = (state.adjustments || []).filter(
      (a) => (String(a.employeeId) === String(emp.id) || a.employeeId === 'all') && filterFn(a.date)
    );
    directAdjs.forEach((a) => map.set(String(a.id), a));

    // 2. Penalty & Adjustment Requests (state.requests)
    const penaltyReqs = (state.requests || [])
      .filter((r) => String(r.employeeId) === String(emp.id) && (r.type === 'penalty' || r.type === 'adjustment') && r.status !== 'cancelled' && r.status !== 'rejected' && r.objection?.status !== 'approved' && !r.isCancelled && !String(r.id).startsWith('req_late_inc_') && !String(r.id).startsWith('req_late_') && r.subType !== 'lateness' && r.type !== 'late_penalty' && filterFn(r.date || r.createdAt?.slice(0, 10)))
      .map((r) => {
        let amt = parseFloat(r.amount) || 0;
        if (!amt && (r.impactType || r.impactVal)) {
          if (r.impactType === 'fixed_amount') {
            amt = parseFloat(r.impactVal) || 0;
          } else if (r.impactType === 'deduction_days') {
            amt = Math.round(calcDailyRate * (parseFloat(r.impactVal) || 1) * 100) / 100;
          }
        }
        return {
          id: r.id,
          employeeId: r.employeeId,
          type: r.subType === 'bonus' ? 'bonus' : 'deduction',
          amount: amt,
          date: r.date || r.createdAt?.slice(0, 10),
          reason: r.reason || r.ruleTitle || r.details || r.notes || 'جزاء إداري',
          details: r.reason || r.ruleTitle || r.details || r.notes || 'جزاء إداري',
          createdAt: r.createdAt
        };
      });
    penaltyReqs.forEach((p) => {
      if (!map.has(String(p.id))) map.set(String(p.id), p);
    });

    // 3. Approved Unpaid Leaves (Strictly deduplicated)
    const approvedUnpaidLeaves = getEmployeeApprovedLeaves(emp, state, filterFn).filter(
      (r) => r.leaveType === 'unpaid'
    );
    approvedUnpaidLeaves.forEach((l) => {
      let daysInPeriod = 0;
      if (l.startDate && l.endDate) {
        let cur = new Date(l.startDate);
        const end = new Date(l.endDate);
        if (!isNaN(cur) && !isNaN(end) && cur <= end) {
          while (cur <= end) {
            const cy = cur.getFullYear();
            const cm = cur.getMonth() + 1;
            const cd = cur.getDate();
            const dStr = `${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`;
            if (filterFn(dStr)) {
              daysInPeriod++;
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      } else if (filterFn(l.date || l.createdAt?.slice(0, 10))) {
        daysInPeriod = parseFloat(l.daysCount || l.days || 1) || 1;
      }

      if (daysInPeriod > 0) {
        const amt = Math.round(daysInPeriod * calcDailyRate * 100) / 100;
        const leaveId = `unpaid_leave_${l.id}`;
        if (!map.has(leaveId)) {
          map.set(leaveId, {
            id: leaveId,
            employeeId: emp.id,
            type: 'deduction',
            amount: amt,
            date: l.startDate || l.date || l.createdAt?.slice(0, 10),
            reason: `💸 إجازة غير مدفوعة (${daysInPeriod} يوم)`,
            details: `خصم عدد (${daysInPeriod}) يوم إجازة غير مدفوعة الأجر بسعر اليوم (${fmt(calcDailyRate)} ج.م)`,
            createdAt: l.createdAt
          });
        }
      }
    });

    // 4. Late Incidents & Bylaws Penalties (وقائع وتأخيرات البصمة والجزاءات اللائحية)
    const empLateIncidents = (state.lateIncidents || []).filter(
      (inc) =>
        String(inc.employeeId) === String(emp.id) &&
        inc.status !== 'cancelled' &&
        !inc.isCancelled &&
        inc.objection?.status !== 'approved' &&
        inc.status !== 'approved_permission_exempt' &&
        inc.actionType !== 'grace' &&
        !isApprovedPermissionForDate(emp.id, inc.date, state) &&
        !(state.requests || []).some(
          (r) =>
            (r.type === 'penalty_objection' || r.type === 'objection') &&
            (r.status === 'approved' || r.adminApproved) &&
            (r.penaltyId === inc.id || r.id === `obj_inc_${inc.id}` || (String(r.employeeId) === String(emp.id) && r.date === inc.date))
        ) &&
        (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
        (!selectedBranchId || String(inc.branchId) === String(selectedBranchId)) &&
        filterFn(inc.date)
    );
    empLateIncidents.forEach((inc) => {
      const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId || selectedBranchId);
      const amt = dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0);
      if (amt > 0) {
        const lateId = `late_inc_${inc.id}`;
        if (!map.has(lateId)) {
          map.set(lateId, {
            id: lateId,
            employeeId: emp.id,
            type: 'deduction',
            amount: amt,
            date: inc.date,
            reason: `⏱️ تأخير بصمة (${inc.deductionMinutes || inc.delayMinutes || 0} دقيقة) - ${inc.tierName || inc.penaltyDescription || 'لائحة الجزاءات'}`,
            details: `خصم تأخير طبقاً للائحة الجزاءات المعتمدة`,
            createdAt: inc.date
          });
        }
      }
    });

    // 5. Absence Deductions (غياب بدون إذن)
    if (summary.absenceDaysCount > 0 && summary.absenceDeduction > 0) {
      const absId = `abs_summary_${selectedMonth}`;
      if (!map.has(absId)) {
        map.set(absId, {
          id: absId,
          employeeId: emp.id,
          type: 'deduction',
          amount: summary.absenceDeduction,
          date: `${selectedMonth}-28`,
          reason: `🚫 غياب بدون إذن (${summary.absenceDaysCount} يوم)`,
          details: `خصم عدد (${summary.absenceDaysCount}) يوم غياب بدون إذن عن الورديات المجدولة بسعر اليوم (${fmt(calcDailyRate)} ج.م)`,
          createdAt: `${selectedMonth}-01`
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [emp, state.adjustments, state.requests, state.leaveRequests, state.lateIncidents, state.loans, summary.absenceDaysCount, summary.absenceDeduction, filterFn, selectedBranchId, selectedMonth]);

  const bonuses = empAdjs.filter((a) => a.type === 'bonus');
  const deductions = empAdjs.filter((a) => a.type === 'deduction' || a.type === 'penalty');

  const branchDetail = emp && selectedBranchId
    ? emp.branchesDetails?.find((b) => String(b.branchId) === String(selectedBranchId))
    : (emp?.branchesDetails && emp.branchesDetails.length === 1 ? emp.branchesDetails[0] : null);

  const currentHourlyRate = branchDetail
    ? (parseFloat(branchDetail.salary) || 0)
    : (parseFloat(emp?.salary) || 0);

  const workHoursPerDay = branchDetail
    ? (parseFloat(branchDetail.workHoursPerDay) || 8)
    : (parseFloat(emp?.workHoursPerDay) || 8);

  const workDaysPerMonth = branchDetail
    ? (parseFloat(branchDetail.workDaysPerMonth) || 26)
    : (parseFloat(emp?.workDaysPerMonth) || 26);

  const monthlyRequiredHours = workHoursPerDay * workDaysPerMonth;
  const currentMonthlySalary = summary.monthlySalary || (summary.dailyRate ? summary.dailyRate * workDaysPerMonth : currentHourlyRate * workHoursPerDay);

  // ── Active Month Roster Status Check ──
  const activeMonthStr = getRealTodayStr().slice(0, 7);
  const activeMonthLabel = monthLabel(activeMonthStr).arabic;

  const hasApprovedRosterForActiveMonth = useMemo(() => {
    if (!emp) return true;
    const targetBId = selectedBranchId || (emp.branchesDetails?.[0]?.branchId) || emp.branchId;
    const empIdStr = String(emp.id || emp.code || '');

    // 1. Check resolved roster for active calendar month
    const resolvedActive = getResolvedEmployeeRoster(emp, targetBId, activeMonthStr, state);
    if (resolvedActive && resolvedActive.schedule && Object.keys(resolvedActive.schedule).length > 0) return true;

    // 2. Check resolved roster for selectedMonth
    if (selectedMonth && selectedMonth !== activeMonthStr) {
      const resolvedSelected = getResolvedEmployeeRoster(emp, targetBId, selectedMonth, state);
      if (resolvedSelected && resolvedSelected.schedule && Object.keys(resolvedSelected.schedule).length > 0) return true;
    }

    // 3. Check any approved roster in state covering activeMonthStr or selectedMonth
    const anyApprovedRoster = (state?.rosters || []).some(
      (r) =>
        (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeCode) === String(emp.code))) &&
        r.status === 'approved' &&
        (r.month === activeMonthStr || r.month === selectedMonth) &&
        r.schedule && Object.keys(r.schedule).length > 0
    );
    if (anyApprovedRoster) return true;

    const anyApprovedReq = (state?.requests || []).some(
      (r) =>
        (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeCode) === String(emp.code))) &&
        (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
        (r.status === 'approved' || r.adminApproved) &&
        (r.month === activeMonthStr || r.month === selectedMonth)
    );
    return anyApprovedReq;
  }, [emp, state?.rosters, state?.requests, selectedBranchId, activeMonthStr, selectedMonth]);

  const hasPendingRosterReqForMonth = useMemo(() => {
    if (!emp) return false;
    const empIdStr = String(emp.id || emp.code || '');
    return (state?.requests || []).some(
      (r) =>
        (String(r.employeeId) === empIdStr || (emp.code && String(r.employeeCode) === String(emp.code))) &&
        (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
        (r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_branch') &&
        (r.month === activeMonthStr || r.month === selectedMonth)
    );
  }, [emp, state?.requests, activeMonthStr, selectedMonth]);

  // ── Compute automatic absence shifts for the selected month ──
  const approvedRoster = useMemo(() => {
    const targetBId = selectedBranchId || (emp?.branchesDetails?.[0]?.branchId) || emp?.branchId;
    return getResolvedEmployeeRoster(emp, targetBId, selectedMonth, state);
  }, [emp, selectedBranchId, selectedMonth, state.rosters, state.requests]);

  // Build list of absence days (work day in roster/swaps, no punch recorded, not a leave day)
  const absenceDays = useMemo(() => {
    if (!emp) return [];
    const today = getRealTodayStr();
    const results = [];
    const dates = [];

    const isCustom = filterMode === 'range' || filterMode === 'custom';
    const effStart = (rangeStart && rangeEnd) ? (rangeStart <= rangeEnd ? rangeStart : rangeEnd) : (rangeStart || rangeEnd);
    const effEnd = (rangeStart && rangeEnd) ? (rangeStart <= rangeEnd ? rangeEnd : rangeStart) : (rangeEnd || rangeStart);
    const cutoff = isCustom && (effStart || effEnd)
      ? { startDate: effStart || effEnd, endDate: effEnd || effStart }
      : getPayrollCutoffRange(selectedMonth);

    if (cutoff && cutoff.startDate && cutoff.endDate) {
      let cur = new Date(cutoff.startDate);
      const end = new Date(cutoff.endDate);
      while (cur <= end) {
        const cy = cur.getFullYear();
        const cm = cur.getMonth() + 1;
        const cd = cur.getDate();
        dates.push(`${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`);
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const [y, mo] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(y, mo, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    for (const dateStr of dates) {
      if (dateStr >= today) continue; // future/today days

      // Dynamic day schedule taking into account shift swaps and off swaps
      const daySchedule = getEmployeeDaySchedule(emp.id, dateStr, state);
      if (!daySchedule || daySchedule.type === 'off' || daySchedule.isOff) continue; // rest day / swapped off

      // Check if there's a punch for this day
      const hasPunch = (state.shifts || []).some(s => String(s.employeeId) === String(emp.id) && s.date === dateStr);
      if (hasPunch) continue;

      // Check if there's an approved leave for this day (Strictly deduplicated)
      const empLeaves = getEmployeeApprovedLeaves(emp, state);
      const hasLeave = empLeaves.some(
        r => r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;

      const arDayName = arabicWeekday(dateStr);
      results.push({ date: dateStr, arDayName, daySchedule });
    }
    return results;
  }, [emp, state.shifts, state.leaveRequests, state.requests, state.shiftSwaps, state.rosters, selectedMonth, filterMode, rangeStart, rangeEnd]);

  // Absence deduction from computeEmpSummary
  const dailyRate = summary.dailyRate || 0;
  const absenceDeduction = summary.absenceDeduction || 0;

  // Resignation Notice Period Calculation for top banner across all pages
  const activeResignationNotice = useMemo(() => {
    if (!emp) return null;
    const empIdStr = String(emp.id || '').trim();
    const empCodeStr = String(emp.code || '').trim();
    const empUserStr = String(emp.username || '').trim();

    const parseDateStr = (s) => {
      if (!s) return new Date();
      const c = String(s).slice(0, 10);
      const p = c.split('-');
      if (p.length === 3) return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
      return new Date(s);
    };

    // Get all requests for this employee sorted newest first
    const empReqs = (state?.resignationRequests || [])
      .filter(r => {
        const rEmpId = String(r.employeeId || '').trim();
        return rEmpId === empIdStr || (empCodeStr && rEmpId === empCodeStr) || (empUserStr && rEmpId === empUserStr);
      })
      .sort((a, b) => {
        const tB = new Date(b.createdAt || b.updatedAt || b.requestDate || 0).getTime();
        const tA = new Date(a.createdAt || a.updatedAt || a.requestDate || 0).getTime();
        return tB - tA;
      });

    if (empReqs.length === 0) return null;

    // If the newest request is an approved withdraw request, do NOT show resignation notice
    const latestReq = empReqs[0];
    if (latestReq && latestReq.type === 'withdraw' && (latestReq.adminStatus === 'approved' || latestReq.managerStatus === 'approved')) {
      return null;
    }

    // Find the latest active resignation request approved by admin
    const activeReq = empReqs.find(r => 
      r.type === 'resignation' &&
      r.adminStatus === 'approved' &&
      !r.isCancelled &&
      r.adminStatus !== 'cancelled' &&
      r.employeeConditionStatus !== 'rejected'
    );
    if (!activeReq) return null;

    const noticeDays = parseInt(activeReq.conditionsDaysRemaining, 10) || 0;
    if (noticeDays <= 0) return null;

    const startDateStr = activeReq.conditionsStartDate || activeReq.requestDate || getRealTodayStr();
    const sDate = parseDateStr(startDateStr);
    const eDate = new Date(sDate);
    eDate.setDate(eDate.getDate() + noticeDays);
    const endDateStr = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;

    const today = parseDateStr(getRealTodayStr());
    const diffMs = eDate.getTime() - today.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    if (remainingDays <= 0) return null;

    return {
      startDate: startDateStr,
      endDate: endDateStr,
      remainingDays,
      totalDays: noticeDays,
      adminComment: activeReq.adminComment,
      conditionStatus: activeReq.employeeConditionStatus
    };
  }, [emp, state?.resignationRequests]);

  // Resignation badge count for sidebar
  const resignationBadgeCount = useMemo(() => {
    if (!emp) return 0;
    const empIdStr = String(emp.id || '').trim();
    const empCodeStr = String(emp.code || '').trim();
    const empUserStr = String(emp.username || '').trim();

    const myRes = (state?.resignationRequests || []).filter(r => {
      const rId = String(r.employeeId || '').trim();
      return rId === empIdStr || (empCodeStr && rId === empCodeStr) || (empUserStr && rId === empUserStr);
    });

    // ONLY count requests that are actively awaiting the employee's decision / response
    return myRes.filter(r => 
      r.adminStatus === 'approved' &&
      r.conditionsDaysRemaining > 0 &&
      r.employeeConditionStatus === 'pending' &&
      !r.isCancelled
    ).length;
  }, [emp, state?.resignationRequests]);

  // ── Employee Notifications Logic ──
  const empNotifications = useMemo(() => {
    return filterEmployeeNotifications(notifications || state?.notifications || [], emp?.id);
  }, [notifications, state?.notifications, emp?.id]);

  const empUnreadNotifsCount = useMemo(() => {
    return empNotifications.filter(n => !n.read).length;
  }, [empNotifications]);

  const empReadNotifsCount = useMemo(() => {
    return empNotifications.filter(n => n.read).length;
  }, [empNotifications]);

  const handleMarkNotifRead = async (notifId) => {
    if (typeof onMarkNotificationRead === 'function') {
      onMarkNotificationRead(notifId);
    } else {
      const updated = (state.notifications || []).map(n => n.id === notifId ? { ...n, read: true } : n);
      const updatedState = { ...state, notifications: updated };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
    }
  };

  const handleMarkAllNotifsRead = async () => {
    if (typeof onMarkAllNotificationsRead === 'function') {
      onMarkAllNotificationsRead();
    } else {
      const updated = (state.notifications || []).map(n => {
        if (String(n.targetEmployeeId) === String(emp?.id) || String(n.employeeId) === String(emp?.id)) {
          return { ...n, read: true };
        }
        return n;
      });
      const updatedState = { ...state, notifications: updated };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
    }
  };

  const handleDeleteNotif = async (notifId) => {
    const updated = (state.notifications || []).filter(n => n.id !== notifId);
    const updatedState = { ...state, notifications: updated };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف الإشعار بنجاح');
  };

  const handleClearReadNotifs = async () => {
    const empNotifIdsToDelete = new Set(
      empNotifications.filter(n => n.read).map(n => n.id)
    );
    if (empNotifIdsToDelete.size === 0) return;
    const updated = (state.notifications || []).filter(n => !empNotifIdsToDelete.has(n.id));
    const updatedState = { ...state, notifications: updated };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`🗑️ تم مسح ${empNotifIdsToDelete.size} إشعار مقروء`);
  };

  // Penalties count for bylaws badge
  const empPenaltiesCount = useMemo(() => {
    if (!emp?.id) return 0;
    return (state.lateIncidents || []).filter(inc => 
      String(inc.employeeId) === String(emp.id) &&
      inc.status !== 'cancelled' &&
      inc.status !== 'approved_permission_exempt' &&
      inc.actionType !== 'grace' &&
      (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
      filterFn(inc.date)
    ).length;
  }, [state.lateIncidents, emp?.id, filterFn]);

  const isEmpRequestMatch = (r, targetEmp) => {
    if (!r || !targetEmp) return false;
    const rId = String(r.employeeId || '').trim();
    const rCode = String(r.employeeCode || '').trim();
    const eId = String(targetEmp.id || '').trim();
    const eCode = String(targetEmp.code || '').trim();
    const eUser = String(targetEmp.username || '').trim();
    return (
      (eId && (rId === eId || rCode === eId)) ||
      (eCode && (rId === eCode || rCode === eCode)) ||
      (eUser && (rId === eUser || rCode === eUser))
    );
  };

  // ── Biometric Self-Registration & Reset Handlers ──
  const handleRegisterBiometricSuccess = async (descriptors, type, photoUrl) => {
    try {
      const activeEmp = emp || currentEmpUser || {};
      const empId = activeEmp.id || activeEmp.code || 'emp_' + Date.now();
      const empCode = activeEmp.code || activeEmp.id || '';
      const empName = activeEmp.name || 'موظف';
      const empBranchId = activeEmp.branchId || selectedBranchId || null;

      const hasBioAlready = Boolean(
        activeEmp.has_face_descriptor || activeEmp.face_descriptor ||
        activeEmp.has_hand_descriptor || activeEmp.hand_descriptor
      );

      if (hasBioAlready) {
        setShowBiometricRegisterModal(false);
        alert('بصمتك مسجلة بالفعل ولا يمكن إعادة تسجيلها إلا بعد مسحها أو موافقة الإدارة العليا.');
        return;
      }

      const hasPending = (state?.requests || []).some(
        r => isEmpRequestMatch(r, activeEmp) &&
             r.type === 'biometric_registration' &&
             (r.status === 'pending' || r.status === 'pending_admin')
      );
      if (hasPending) {
        setShowBiometricRegisterModal(false);
        alert('لديك طلب تسجيل بصمة قيد المراجعة لدى الإدارة العليا بالفعل.');
        return;
      }

      // Close modal now that validation passed
      setShowBiometricRegisterModal(false);

      // Clean and sanitize descriptor arrays to pure number lists
      const cleanDescriptors = Array.isArray(descriptors)
        ? descriptors.map(d => {
            if (d instanceof Float32Array || Array.isArray(d)) return Array.from(d);
            if (d && typeof d === 'object') return Object.values(d).map(Number);
            return [];
          })
        : [];

      // Create compressed thumbnail (< 15KB) to prevent storage quota exhaustion
      let thumbnailPhoto = photoUrl;
      if (photoUrl && photoUrl.length > 40000) {
        try {
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = photoUrl;
          });
          if (img.width && img.height) {
            const canvas = document.createElement('canvas');
            const maxDim = 160;
            const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            thumbnailPhoto = canvas.toDataURL('image/jpeg', 0.65);
          }
        } catch (thumbErr) {
          console.warn('Thumbnail generation skipped:', thumbErr);
        }
      }

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const branchObj = (state?.branches || []).find(b => String(b.id) === String(empBranchId));
      const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

      const requestId = 'REQ-BIO-REG-' + Date.now();
      const bioLabel = type === 'hand' ? 'بصمة اليد' : 'بصمة الوجه';
      const requestData = {
        id: requestId,
        type: 'biometric_registration',
        requestType: 'biometric_registration',
        typeLabel: `تسجيل ${bioLabel} جديدة (ذاتي)`,
        employeeId: empId,
        employeeCode: empCode,
        employeeName: empName,
        branchId: empBranchId,
        branchName: branchName,
        biometricType: type || 'face',
        descriptors: cleanDescriptors,
        photoUrl: thumbnailPhoto || null,
        date: dateStr,
        createdAt: now.toISOString(),
        status: 'pending',
        requiresSuperAdmin: true,
        requiresBranchManager: false,
        adminApproved: false,
        notes: `قام الموظف ${empName} بتسجيل ${bioLabel} ذاتياً من حسابه وبانتظار مراجعة واعتماد الإدارة العليا لتفعيلها.`
      };

      const newNotif = {
        id: 'NOTIF-BIO-REG-' + Date.now(),
        type: 'biometric_registration',
        targetRole: 'admin',
        title: `📸 تسجيل بصمة جديدة: ${empName}`,
        message: `قام الموظف ${empName} بالتقاط ${bioLabel} ذاتياً وبانتظار اعتماد الإدارة العليا.`,
        requestId: requestId,
        employeeId: empId,
        employeeName: empName,
        photoUrl: thumbnailPhoto || null,
        createdAt: now.toISOString(),
        read: false,
        readBy: []
      };

      const updatedState = {
        ...state,
        requests: [requestData, ...(state.requests || [])],
        notifications: [newNotif, ...(state.notifications || [])],
        _requestsUpdatedAt: now.toISOString()
      };

      setState(updatedState);
      if (showToast) {
        showToast('🎉 تم التقاط البصمة بنجاح وإرسالها للإدارة العليا للاعتماد!');
      }

      if (saveState) {
        saveState(updatedState).catch(err => console.warn('Save state background warning:', err));
      }

      // Non-blocking background sync for Drive upload & Gmail notification
      (async () => {
        try {
          let driveResult = null;
          const driveConfig = orgSettings?.googleDrive || state?.orgSettings?.googleDrive;
          if (driveConfig && driveConfig.serviceUrl && photoUrl) {
            driveResult = await uploadBiometricAttendancePhoto({
              employee: activeEmp,
              photoDataUrl: photoUrl,
              actionType: 'تسجيل_بصمة',
              driveConfig
            });
          }

          if (driveResult?.fileUrl) {
            setState(prev => ({
              ...prev,
              requests: (prev.requests || []).map(r => r.id === requestId ? {
                ...r,
                drivePhotoUrl: driveResult.fileUrl,
                driveFileId: driveResult.fileId || null
              } : r)
            }));
          }

          const gmailConfig = orgSettings?.gmailConfig || state?.orgSettings?.gmailConfig;
          if (gmailConfig && gmailConfig.serviceUrl) {
            sendBiometricRegistrationRequestEmail({
              gmailConfig,
              empName,
              empCode,
              branchName,
              biometricType: type || 'face',
              dateStr,
              drivePhotoUrl: driveResult?.fileUrl || null
            }).catch(err => console.warn('Gmail biometric notification skipped:', err));
          }
        } catch (bgErr) {
          console.warn('Background sync error:', bgErr);
        }
      })();

    } catch (err) {
      console.error('Error during biometric self-registration submission:', err);
      alert('حدث خطأ أثناء حفظ طلب البصمة، يرجى المحاولة مرة أخرى: ' + (err.message || ''));
    }
  };

  const handleSubmitResetRequest = async (reason) => {
    try {
      const activeEmp = emp || currentEmpUser || {};
      const empId = activeEmp.id || activeEmp.code || 'emp_' + Date.now();
      const empCode = activeEmp.code || activeEmp.id || '';
      const empName = activeEmp.name || 'موظف';
      const empBranchId = activeEmp.branchId || selectedBranchId || null;

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const branchObj = (state?.branches || []).find(b => String(b.id) === String(empBranchId));
      const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

      const requestId = 'REQ-BIO-RESET-' + Date.now();
      const requestData = {
        id: requestId,
        type: 'biometric_reset',
        requestType: 'biometric_reset',
        typeLabel: 'طلب إعادة تسجيل بصمة الوجه/اليد',
        employeeId: empId,
        employeeCode: empCode,
        employeeName: empName,
        branchId: empBranchId,
        branchName: branchName,
        reason: reason,
        date: dateStr,
        createdAt: now.toISOString(),
        status: 'pending',
        requiresSuperAdmin: true,
        requiresBranchManager: false,
        adminApproved: false,
        notes: `طلب الموظف ${empName} مسح بصمته الحالية وإعادة تسجيل بصمة جديدة. السبب: ${reason}`
      };

      const newNotif = {
        id: 'NOTIF-BIO-RESET-' + Date.now(),
        type: 'biometric_reset',
        targetRole: 'admin',
        title: `🔄 طلب إعادة تسجيل بصمة: ${empName}`,
        message: `طلب الموظف ${empName} مسح بصمته وإعادة التسجيل. السبب: ${reason}`,
        requestId: requestId,
        employeeId: empId,
        employeeName: empName,
        createdAt: now.toISOString(),
        read: false,
        readBy: []
      };

      const updatedState = {
        ...state,
        requests: [requestData, ...(state.requests || [])],
        notifications: [newNotif, ...(state.notifications || [])],
        _requestsUpdatedAt: now.toISOString()
      };

      setState(updatedState);
      if (showToast) showToast('✅ تم إرسال طلب إعادة تسجيل البصمة للإدارة العليا بنجاح');
      if (saveState) {
        saveState(updatedState).catch(err => console.warn('Save state warning:', err));
      }

      const gmailConfig = orgSettings?.gmailConfig || state?.orgSettings?.gmailConfig;
      if (gmailConfig && gmailConfig.serviceUrl) {
        sendBiometricResetRequestEmail({
          gmailConfig,
          empName,
          empCode,
          branchName,
          reason,
          dateStr
        }).catch(err => console.warn('Gmail biometric reset notification failed:', err));
      }
    } catch (err) {
      console.error('Error submitting reset request:', err);
      alert('حدث خطأ أثناء إرسال طلب إعادة التسجيل');
    }
  };

  // Categorized Menu Items (Matching Senior Management Style)
  const employeeMenuItems = useMemo(() => {
    return [
      {
        id: 'dashboard',
        label: 'لوحة التحكم',
        icon: '📊',
        isSingle: true,
        targetTab: 'dashboard'
      },
      {
        id: 'finance-group',
        label: 'الرواتب والمالية',
        icon: '💼',
        children: [
          {
            id: 'salary',
            targetTab: 'salary',
            label: 'تفاصيل ومسير الراتب',
            icon: '💵',
            desc: 'حساب صافي الأجور والبدلات وأجر الساعات الحية',
            visible: canViewSalary !== false
          },
          {
            id: 'adjustments',
            targetTab: 'adjustments',
            label: 'المكافآت والخصومات والتسويات',
            icon: '🎁',
            badge: empAdjs.length,
            desc: 'سجل الحوافز والمكافآت والخصومات المعتمدة',
            visible: canViewAdjustments !== false
          },
          {
            id: 'loans',
            targetTab: 'loans',
            label: 'السلف ومشتريات الأدوية الآجل',
            icon: '💳',
            desc: 'تقديم ومتابعة السلف النقدية والأقساط والأدوية',
            visible: canApplyLoan !== false
          },
          {
            id: 'payslip_action',
            action: 'print_payslip',
            label: 'طباعة ومعاينة قسيمة الراتب',
            icon: '📄',
            desc: 'استعراض وتحميل قسيمة الراتب الرسمية بتنسيق معتمد',
            visible: canViewSalary !== false
          }
        ].filter(item => item.visible !== false)
      },
      {
        id: 'attendance-group',
        label: 'الدوام والورديات',
        icon: '⏱️',
        children: [
          {
            id: 'shifts',
            targetTab: 'shifts',
            label: 'سجل البصمات وساعات العمل',
            icon: '📋',
            badge: empShifts.length,
            desc: 'سجل الحضور والانصراف، البريك، واحتساب ساعات العمل',
            visible: true
          },
          {
            id: 'biometric',
            targetTab: 'biometric',
            label: 'البصمة الإلكترونية والتحقق الذاتي',
            icon: '📸',
            badge: (!emp?.has_face_descriptor && !emp?.has_hand_descriptor) ? 1 : 0,
            desc: 'تسجيل البصمة لمرة واحدة، اختبار المطابقة، ومتابعة الاعتماد',
            visible: true
          },
          {
            id: 'roster',
            targetTab: 'roster',
            label: 'الجدول الشهري ومناوبات العمل',
            icon: '🗓️',
            desc: 'استعراض وتصميم جدول الورديات ومناوبات الفرع',
            visible: canViewRoster !== false
          },
          {
            id: 'swaps',
            targetTab: 'swaps',
            label: 'تبديل ونقل الشيفتات',
            icon: '🔄',
            desc: 'تقديم ومتابعة طلبات تبديل الورديات مع الزملاء',
            visible: canApplySwap !== false
          }
        ].filter(item => item.visible !== false)
      },
      {
        id: 'requests-group',
        label: 'الطلبات والإجازات',
        icon: '📋',
        badge: resignationBadgeCount,
        children: [
          {
            id: 'leaves',
            targetTab: 'leaves',
            label: 'رصيد وسجل الإجازات',
            icon: '🏖️',
            desc: 'تقديم ومتابعة الإجازات السنوية والرصيد المتبقي',
            visible: canApplyLeave !== false
          },
          {
            id: 'permissions',
            targetTab: 'permissions',
            label: 'أذونات وساعات الاستئذان',
            icon: '⏰',
            desc: 'طلب إذن استئذان رسمي وتتبع الساعات المعتمدة',
            visible: canApplyPermission !== false
          },
          {
            id: 'resignations',
            targetTab: 'resignations',
            label: 'طلبات الاستقالة وإخلاء الطرف',
            icon: '🚪',
            badge: resignationBadgeCount,
            desc: 'تقديم طلب الاستقالة ومتابعة فترة الإشعار',
            visible: true
          }
        ].filter(item => item.visible !== false)
      },
      {
        id: 'bylaws-group',
        label: 'التقييمات واللائحة',
        icon: '📜',
        badge: empPenaltiesCount,
        children: [
          {
            id: 'evaluations',
            targetTab: 'evaluations',
            label: 'تقييمات الأداء والشكاوى',
            icon: '⭐',
            desc: 'متابعة تقييم الأداء الشهري وتقديم الشكاوى والتظلمات',
            visible: canSubmitComplaint !== false
          },
          {
            id: 'bylaws',
            targetTab: 'bylaws',
            label: 'لائحة العمل والجزاءات',
            icon: '⚖️',
            badge: empPenaltiesCount,
            desc: 'بنود اللائحة المعتمدة، شرائح التأخير، وسجل المخالفات',
            visible: canViewBylaws !== false
          }
        ].filter(item => item.visible !== false)
      }
    ];
  }, [
    emp,
    selectedBranchId,
    canViewSalary,
    canViewAdjustments,
    canApplyLoan,
    canViewRoster,
    canApplySwap,
    canApplyLeave,
    canApplyPermission,
    canSubmitComplaint,
    canViewBylaws,
    empAdjs.length,
    empShifts.length,
    resignationBadgeCount,
    empPenaltiesCount
  ]);

  const handleMenuClick = (menu) => {
    if (menu.isSingle) {
      setActiveTab(menu.targetTab);
      setOpenDropdown(null);
    } else {
      setOpenDropdown(prev => (prev === menu.id ? null : menu.id));
    }
  };

  const handleSubItemClick = (subItem) => {
    if (subItem.action === 'print_payslip') {
      setShowPrintModal(true);
      setOpenDropdown(null);
      setIsMobileDrawerOpen(false);
      return;
    }
    if (subItem.targetTab) {
      setActiveTab(subItem.targetTab);
      setOpenDropdown(null);
      setIsMobileDrawerOpen(false);
    }
  };

  const isMenuGroupActive = (menu) => {
    if (menu.isSingle) {
      return activeTab === menu.targetTab;
    }
    if (menu.children) {
      return menu.children.some(child => child.targetTab === activeTab);
    }
    return false;
  };

  const getActiveBreadcrumb = () => {
    if (activeTab === 'dashboard') return { group: 'لوحة التحكم', item: 'الرئيسية', icon: '📊' };
    if (['salary', 'adjustments', 'loans'].includes(activeTab)) {
      const itemMap = {
        salary: { name: 'تفاصيل ومسير الراتب', icon: '💵' },
        adjustments: { name: 'المكافآت والخصومات والتسويات', icon: '🎁' },
        loans: { name: 'السلف والأدوية الآجل', icon: '💳' }
      };
      return { group: 'الرواتب والمالية', item: itemMap[activeTab]?.name || activeTab, icon: itemMap[activeTab]?.icon || '💼' };
    }
    if (['shifts', 'roster', 'swaps', 'biometric'].includes(activeTab)) {
      const itemMap = {
        shifts: { name: 'سجل البصمات وساعات العمل', icon: '📋' },
        biometric: { name: 'البصمة الإلكترونية والتحقق الذاتي', icon: '📸' },
        roster: { name: 'الجدول الشهري ومناوبات العمل', icon: '🗓️' },
        swaps: { name: 'تبديل ونقل الشيفتات', icon: '🔄' }
      };
      return { group: 'الدوام والورديات', item: itemMap[activeTab]?.name || activeTab, icon: itemMap[activeTab]?.icon || '⏱️' };
    }
    if (['leaves', 'permissions', 'resignations'].includes(activeTab)) {
      const itemMap = {
        leaves: { name: 'رصيد وسجل الإجازات', icon: '🏖️' },
        permissions: { name: 'أذونات وساعات الاستئذان', icon: '⏰' },
        resignations: { name: 'طلبات الاستقالة وإخلاء الطرف', icon: '🚪' }
      };
      return { group: 'الطلبات والإجازات', item: itemMap[activeTab]?.name || activeTab, icon: itemMap[activeTab]?.icon || '📋' };
    }
    if (['evaluations', 'bylaws'].includes(activeTab)) {
      const itemMap = {
        evaluations: { name: 'تقييمات الأداء والشكاوى', icon: '⭐' },
        bylaws: { name: 'لائحة العمل والجزاءات', icon: '⚖️' }
      };
      return { group: 'التقييمات واللائحة', item: itemMap[activeTab]?.name || activeTab, icon: itemMap[activeTab]?.icon || '📜' };
    }
    return { group: 'بوابة الموظف', item: activeTab, icon: '👤' };
  };

  const breadcrumb = getActiveBreadcrumb();

  // ─────────────────────────────────────────
  //  Conditional Renders
  // ─────────────────────────────────────────
  if (!currentEmpUser || !emp) {
    return null;
  }

  // ── Pre-entry Branch Selection Screen ──
  if (emp.branchesDetails && emp.branchesDetails.length > 1 && !isBranchSelected) {
    return (
      <div className="ep-layout" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh',
        background: 'var(--background)', borderRadius: '16px', border: '1px solid var(--border)'
      }}>
        <div style={{ background: 'var(--surface)', padding: '40px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <h2 style={{ margin: '0 0 10px', color: 'var(--text)' }}>مرحباً {emp.name}</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>أنت مسجل في أكثر من فرع. يرجى اختيار الفرع الذي ترغب بمتابعة بياناتك وطلباتك من خلاله:</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              className="btn btn-outline"
              style={{ justifyContent: 'center', padding: '12px', fontSize: '15px' }}
              onClick={() => { setSelectedBranchId(''); setIsBranchSelected(true); }}
            >
              🌐 جميع الفروع (ملخص شامل)
            </button>
            {emp.branchesDetails.map(bd => {
              const b = state.branches?.find(br => br.id === bd.branchId);
              return (
                <button
                  key={bd.branchId}
                  className="btn btn-start"
                  style={{ justifyContent: 'center', padding: '12px', fontSize: '15px' }}
                  onClick={() => { setSelectedBranchId(bd.branchId); setIsBranchSelected(true); }}
                >
                  📍 {b?.name || 'فرع غير معروف'}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Employee Portal Modern Titlebar + Menubar + Drawer + Content Layout ──
  return (
    <div className="ep-app-container" style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      minHeight: '100vh',
      background: 'var(--background)',
      color: 'var(--text)',
      boxSizing: 'border-box'
    }}>

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 1. TOP HEADER (Responsive Desktop vs Mobile) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {isMobileScreen ? (
        <>
          {/* 📱 Mobile Clean Minimal Top Bar */}
          <header style={{
            height: '50px',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            userSelect: 'none',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
          }}>
            {/* Right: Hamburger + Logo + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                style={{
                  background: 'var(--surface-muted, #f8fafc)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '6px 9px',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="فتح القائمة"
              >
                ☰
              </button>

              {(orgSettings?.logoUrl || state?.orgSettings?.logoUrl) ? (
                <img
                  src={orgSettings?.logoUrl || state?.orgSettings?.logoUrl}
                  alt="شعار المؤسسة"
                  style={{ width: '28px', height: '28px', borderRadius: '7px', objectFit: 'contain', background: '#fff', padding: '2px', border: '1px solid var(--border)', flexShrink: 0 }}
                />
              ) : (
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '7px',
                  background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 900,
                  flexShrink: 0
                }}>
                  🏥
                </div>
              )}

              <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {orgSettings?.orgName || state?.orgSettings?.orgName || 'بوابة الموظف'}
              </span>
            </div>

            {/* Left: Notifs + Theme + Logout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Notification Bell */}
              <div style={{ position: 'relative' }} ref={notifDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsNotifDropdownOpen(prev => !prev)}
                  style={{
                    position: 'relative',
                    border: isNotifDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    background: isNotifDropdownOpen ? 'var(--primary-light)' : 'var(--surface)',
                    padding: '5px 8px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: 'var(--text)',
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="الإشعارات"
                >
                  🔔
                  {empUnreadNotifsCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: 'var(--danger, #dc2626)',
                      color: '#ffffff',
                      padding: '1px 5px',
                      borderRadius: '99px',
                      fontSize: '9px',
                      fontWeight: 800,
                      boxShadow: '0 1px 3px rgba(220,38,38,0.4)'
                    }}>
                      {empUnreadNotifsCount}
                    </span>
                  )}
                </button>

                {isNotifDropdownOpen && (
                  <div style={{
                    position: 'fixed',
                    top: '56px',
                    left: '10px',
                    right: '10px',
                    maxWidth: '420px',
                    margin: '0 auto',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 12px 35px rgba(0,0,0,0.2)',
                    zIndex: 1100,
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--surface-muted)',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                          🔔 إشعارات الموظف
                        </span>
                        {empUnreadNotifsCount > 0 && (
                          <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '10.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px' }}>
                            {empUnreadNotifsCount} غير مقروء
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {empUnreadNotifsCount > 0 && (
                          <button
                            type="button"
                            onClick={handleMarkAllNotifsRead}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--primary, #0f766e)',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              padding: '2px 5px'
                            }}
                          >
                            ✓ تحديد الكل
                          </button>
                        )}
                        {empReadNotifsCount > 0 && (
                          <button
                            type="button"
                            onClick={handleClearReadNotifs}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--danger, #dc2626)',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              padding: '2px 5px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}
                          >
                            <span>🗑️</span>
                            <span>مسح المقروء</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '6px' }}>
                      {empNotifications.length === 0 ? (
                        <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px' }}>
                          🎉 لا توجد إشعارات حالياً
                        </div>
                      ) : (
                        empNotifications.slice(0, 20).map((n) => {
                          const isUnread = !n.read;
                          const targetTab = getNotificationTargetTab(n, 'employee');
                          const tabLabel = getNotificationTabLabel(targetTab, 'employee');

                          const handleEmpNotifClick = () => {
                            if (isUnread) handleMarkNotifRead(n.id);
                            setIsNotifDropdownOpen(false);
                            setActiveTab(targetTab);
                            showToast?.(`الانتقال إلى: ${tabLabel}`);
                          };

                          return (
                            <div
                              key={n.id}
                              onClick={handleEmpNotifClick}
                              style={{
                                display: 'flex',
                                gap: '10px',
                                padding: '10px',
                                borderRadius: '8px',
                                background: isUnread ? 'rgba(15, 118, 110, 0.05)' : 'transparent',
                                borderRight: isUnread ? '3px solid var(--primary)' : '3px solid transparent',
                                marginBottom: '4px',
                                borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease'
                              }}
                              className="notif-dropdown-item-hover"
                            >
                              <span style={{ fontSize: '18px', marginTop: '2px' }}>
                                {n.icon || (n.type === 'loan' ? '💳' : n.type === 'leave' ? '🏖️' : n.type === 'permission' ? '⏰' : n.type === 'swap' ? '🔄' : '🔔')}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                  <h5 style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>
                                    <span>{n.title || n.typeLabel || 'إشعار إداري'}</span>
                                    {n.approverRole && (
                                      <span style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: '6px',
                                        background: n.action === 'rejected' ? '#fee2e2' : '#dcfce7',
                                        color: n.action === 'rejected' ? '#dc2626' : '#15803d',
                                        marginRight: '6px'
                                      }}>
                                        {n.approverRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع'}
                                      </span>
                                    )}
                                  </h5>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                    {isUnread && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleMarkNotifRead(n.id);
                                        }}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: 'var(--primary, #0f766e)',
                                          fontSize: '11px',
                                          cursor: 'pointer',
                                          padding: '0 4px',
                                          fontWeight: 'bold',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        ✓ تم
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteNotif(n.id);
                                      }}
                                      title="حذف الإشعار"
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--muted, #94a3b8)',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        padding: '0 3px'
                                      }}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                                <p style={{ margin: '3px 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                  {n.message || n.body || n.details || ''}
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                                  <span>🕒 {n.date || (n.timestamp ? n.timestamp.slice(0, 10) : '')}</span>
                                  <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>• فتح: {tabLabel}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {empReadNotifsCount > 0 && (
                      <div style={{ padding: '8px 12px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={handleClearReadNotifs}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger, #dc2626)',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>🗑️</span>
                          <span>حذف كافة الإشعارات المقروءة ({empReadNotifsCount})</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {toggleTheme && (
                <button
                  type="button"
                  onClick={toggleTheme}
                  style={{
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    padding: '4px 6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: 1
                  }}
                >
                  {themeMode === 'dark' ? '☀️' : '🌙'}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (typeof handleLogout === 'function') handleLogout();
                  else setCurrentEmpUser(null);
                }}
                style={{
                  border: '1px solid #fca5a5',
                  background: '#fee2e2',
                  color: '#dc2626',
                  padding: '4px 7px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  lineHeight: 1
                }}
                title="تسجيل الخروج"
              >
                🚪
              </button>
            </div>
          </header>

          {/* 📱 Mobile Secondary Status & Period Bar */}
          <div style={{
            background: 'var(--surface-muted)',
            borderBottom: '1px solid var(--border)',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '11px',
            boxSizing: 'border-box'
          }}>
            {/* Realtime Live Clock */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
                flexShrink: 0
              }} />
              <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                ⏰ {liveTime.formatted12Time}
              </span>
            </div>

            {/* Month Navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button className="month-nav-btn" style={{ width: '22px', height: '22px', fontSize: '0.9rem' }} onClick={() => setSelectedMonth(prevMonth(selectedMonth))}>‹</button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                style={{ padding: '1px 4px', borderRadius: '5px', fontSize: '11px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 'bold' }}
              />
              <button className="month-nav-btn" style={{ width: '22px', height: '22px', fontSize: '0.9rem' }} onClick={() => setSelectedMonth(nextMonth(selectedMonth))}>›</button>
              {selectedMonth !== activeAutoCycleMonth && (
                <button
                  className="emp-month-today-btn"
                  style={{ padding: '1px 5px', fontSize: '10px', borderRadius: '4px' }}
                  onClick={() => setSelectedMonth(activeAutoCycleMonth)}
                >
                  ⟳
                </button>
              )}
            </div>

            {/* Multi Branch Selector if any */}
            {emp.branchesDetails && emp.branchesDetails.length > 1 && (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{
                  padding: '2px 6px',
                  borderRadius: '6px',
                  fontSize: '10.5px',
                  border: '1px solid var(--primary)',
                  background: 'var(--primary-tint)',
                  color: 'var(--primary-dark)',
                  maxWidth: '105px'
                }}
              >
                <option value="">🌐 الكل</option>
                {emp.branchesDetails.map((bd) => {
                  const b = state.branches?.find((br) => br.id === bd.branchId);
                  return <option key={bd.branchId} value={bd.branchId}>📍 {b?.name || bd.branchId}</option>;
                })}
              </select>
            )}
          </div>
        </>
      ) : (
        /* 💻 Desktop Titlebar (Only on Desktop Screens) */
        <header className="ep-titlebar" style={{
          height: '52px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 18px',
          userSelect: 'none',
          zIndex: 100,
          width: '100%',
          boxSizing: 'border-box',
          boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
        }}>
          {/* Right Side: Brand, Profile Badge & Breadcrumb */}
          <div className="ep-titlebar-right" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {(orgSettings?.logoUrl || state?.orgSettings?.logoUrl) ? (
              <img
                src={orgSettings?.logoUrl || state?.orgSettings?.logoUrl}
                alt="شعار المؤسسة"
                style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain', background: '#fff', padding: '2px', border: '1px solid var(--border)', flexShrink: 0 }}
              />
            ) : (
              <div className="ep-logo-badge" style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 900,
                boxShadow: '0 2px 6px rgba(13,148,136,0.3)',
                flexShrink: 0
              }}>
                🏥
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {orgSettings?.orgName || state?.orgSettings?.orgName || 'منظومة الموارد البشرية'}
              </span>



              {/* Multi-Branch Selector if applicable */}
              {emp.branchesDetails && emp.branchesDetails.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      border: '1px solid var(--primary)',
                      background: 'var(--primary-tint)',
                      color: 'var(--primary-dark)',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    <option value="">🌐 جميع الفروع (ملخص شامل)</option>
                    {emp.branchesDetails.map((bd) => {
                      const b = state.branches?.find((br) => br.id === bd.branchId);
                      return <option key={bd.branchId} value={bd.branchId}>📍 فرع {b?.name || bd.branchId}</option>;
                    })}
                  </select>
                </div>
              )}

              <span style={{ color: 'var(--border)', fontSize: '15px' }} className="ep-breadcrumb-bar">/</span>

              {/* Active Breadcrumb */}
              <div className="ep-breadcrumb-bar" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--muted)' }}>
                <span>{breadcrumb.icon}</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{breadcrumb.group}</span>
                {breadcrumb.item && (
                  <>
                    <span style={{ fontSize: '11px' }}>›</span>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{breadcrumb.item}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Left Side: Live Synced Clock, Period Filter, Notifs, Theme, Logout */}
          <div className="ep-titlebar-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Synced Real-time Live Clock */}
            <div className="ep-live-clock" title={liveTime.isServerSynced ? '🌐 التوقيت الفعلي الموثق من الخادم' : '⏱️ التوقيت المباشر'} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--surface)',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <span className="ep-clock-dot" style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
                boxShadow: liveTime.isServerSynced ? '0 0 6px #22c55e' : '0 0 6px #f59e0b',
                flexShrink: 0
              }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '11px' }}>
                  ⏰ {liveTime.formatted12Time}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '9.5px' }}>
                  {liveTime.fullArabicDate}
                </span>
              </div>
            </div>

            {/* Month / Period Picker in Titlebar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--surface-muted)',
              padding: '3px 8px',
              borderRadius: '8px',
              border: '1px solid var(--border)'
            }}>
              <button className="month-nav-btn" style={{ width: '24px', height: '24px', fontSize: '1rem' }} onClick={() => setSelectedMonth(prevMonth(selectedMonth))} title="الشهر السابق">‹</button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                style={{ padding: '2px 6px', borderRadius: '6px', fontSize: '11.5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 'bold' }}
              />
              <button className="month-nav-btn" style={{ width: '24px', height: '24px', fontSize: '1rem' }} onClick={() => setSelectedMonth(nextMonth(selectedMonth))} title="الشهر التالي">›</button>
              {selectedMonth !== activeAutoCycleMonth && (
                <button
                  className="emp-month-today-btn"
                  style={{ padding: '2px 8px', fontSize: '11px', borderRadius: '6px' }}
                  onClick={() => setSelectedMonth(activeAutoCycleMonth)}
                >
                  ⟳ الدورة
                </button>
              )}
            </div>

            {/* 🔔 Notification Bell & Interactive Dropdown Menu */}
            <div style={{ position: 'relative' }} ref={notifDropdownRef}>
              <button
                type="button"
                onClick={() => setIsNotifDropdownOpen(prev => !prev)}
                title="الإشعارات والتنبيهات"
                style={{
                  position: 'relative',
                  border: isNotifDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                  background: isNotifDropdownOpen ? 'var(--primary-light)' : 'var(--surface)',
                  padding: '5px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🔔</span>
                {empUnreadNotifsCount > 0 && (
                  <span style={{
                    background: 'var(--danger, #dc2626)',
                    color: '#ffffff',
                    padding: '1px 6px',
                    borderRadius: '99px',
                    fontSize: '10px',
                    fontWeight: 800,
                    boxShadow: '0 1px 4px rgba(220,38,38,0.4)',
                    animation: 'pulse 2s infinite'
                  }}>
                    {empUnreadNotifsCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {isNotifDropdownOpen && (
                <div className="ep-notif-panel" style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  width: '360px',
                  maxWidth: '92vw',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 35px rgba(0,0,0,0.15)',
                  zIndex: 1100,
                  overflow: 'hidden'
                }}>
                  <div className="ep-notif-header" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--surface-muted)',
                    borderBottom: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                        🔔 إشعارات الموظف
                      </span>
                      {empUnreadNotifsCount > 0 && (
                        <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '10.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px' }}>
                          {empUnreadNotifsCount} غير مقروء
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {empUnreadNotifsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllNotifsRead}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--primary, #0f766e)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            padding: '2px 5px'
                          }}
                          title="تحديد كافة الإشعارات كمقروءة"
                        >
                          ✓ تحديد الكل
                        </button>
                      )}
                      {empReadNotifsCount > 0 && (
                        <button
                          type="button"
                          onClick={handleClearReadNotifs}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger, #dc2626)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            padding: '2px 5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                          title="حذف جميع الإشعارات المقروءة"
                        >
                          <span>🗑️</span>
                          <span>مسح المقروء</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="ep-notif-list" style={{ maxHeight: '340px', overflowY: 'auto', padding: '6px' }}>
                    {empNotifications.length === 0 ? (
                      <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px' }}>
                        🎉 لا توجد إشعارات حالياً
                      </div>
                    ) : (
                      empNotifications.slice(0, 20).map((n) => {
                        const isUnread = !n.read;
                        const targetTab = getNotificationTargetTab(n, 'employee');
                        const tabLabel = getNotificationTabLabel(targetTab, 'employee');

                        const handleEmpNotifClick = () => {
                          if (isUnread) handleMarkNotifRead(n.id);
                          setIsNotifDropdownOpen(false);
                          setActiveTab(targetTab);
                          if (n.autoOpenModal || n.type === 'roster_reminder') {
                            setAutoOpenRosterModal(true);
                          }
                          showToast?.(`الانتقال إلى: ${tabLabel}`);
                        };

                        return (
                          <div
                            key={n.id}
                            className={`ep-notif-card ${isUnread ? 'unread' : ''}`}
                            onClick={handleEmpNotifClick}
                            style={{
                              display: 'flex',
                              gap: '10px',
                              padding: '10px',
                              borderRadius: '8px',
                              background: isUnread ? 'rgba(15, 118, 110, 0.05)' : 'transparent',
                              borderRight: isUnread ? '3px solid var(--primary)' : '3px solid transparent',
                              marginBottom: '4px',
                              borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.04))',
                              cursor: 'pointer',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: '18px', marginTop: '2px' }}>
                              {n.icon || (n.type === 'loan' ? '💳' : n.type === 'leave' ? '🏖️' : n.type === 'permission' ? '⏰' : n.type === 'swap' ? '🔄' : '🔔')}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                <h5 className="ep-notif-title" style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>
                                  <span>{n.title || n.typeLabel || 'إشعار إداري'}</span>
                                  {n.approverRole && (
                                    <span style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '1px 6px',
                                      borderRadius: '6px',
                                      background: n.action === 'rejected' ? '#fee2e2' : '#dcfce7',
                                      color: n.action === 'rejected' ? '#dc2626' : '#15803d',
                                      marginRight: '6px'
                                    }}>
                                      {n.approverRole === 'admin' ? 'الإدارة العليا' : 'مدير الفرع'}
                                    </span>
                                  )}
                                </h5>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                  {isUnread && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkNotifRead(n.id);
                                      }}
                                      title="تحديد كمقروء"
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--primary, #0f766e)',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        fontWeight: 'bold',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      ✓ تم
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteNotif(n.id);
                                    }}
                                    title="حذف الإشعار"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: 'var(--muted, #94a3b8)',
                                      fontSize: '12px',
                                      cursor: 'pointer',
                                      padding: '0 3px',
                                      transition: 'color 0.15s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted, #94a3b8)'; }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                              <p className="ep-notif-body" style={{ margin: '3px 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                {n.message || n.body || n.details || ''}
                              </p>
                              <div className="ep-notif-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '10px', color: 'var(--muted)' }}>
                                <span>🕒 {n.date || (n.timestamp ? n.timestamp.slice(0, 10) : '')}</span>
                                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>• فتح: {tabLabel}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer (Clear all read notifications) */}
                  {empReadNotifsCount > 0 && (
                    <div style={{
                      padding: '8px 12px',
                      background: 'var(--surface-muted)',
                      borderTop: '1px solid var(--border)',
                      textAlign: 'center'
                    }}>
                      <button
                        type="button"
                        onClick={handleClearReadNotifs}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--danger, #dc2626)',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>🗑️</span>
                        <span>حذف كافة الإشعارات المقروءة ({empReadNotifsCount})</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme Toggle Button */}
            {toggleTheme && (
              <button
                type="button"
                onClick={toggleTheme}
                title={themeMode === 'dark' ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: '5px 9px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span>{themeMode === 'dark' ? '☀️' : '🌙'}</span>
              </button>
            )}

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => {
                if (typeof handleLogout === 'function') handleLogout();
                else setCurrentEmpUser(null);
              }}
              title="تسجيل الخروج"
              style={{
                border: '1px solid var(--danger-border, #fca5a5)',
                background: 'var(--danger-light, #fee2e2)',
                color: 'var(--danger, #dc2626)',
                padding: '5px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s'
              }}
            >
              <span>🚪</span>
              <span className="ep-btn-label">خروج</span>
            </button>
          </div>
        </header>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 2. TOP RIBBON MENUBAR (Strictly Desktop Only) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {!isMobileScreen && (
        <nav ref={menuContainerRef} className="ep-menubar" style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '4px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          position: 'sticky',
          top: 0,
          zIndex: 90,
          width: '100%',
          boxSizing: 'border-box',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          {employeeMenuItems.map((menu) => {
            const isActive = isMenuGroupActive(menu);
            const isOpen = openDropdown === menu.id;

            return (
              <div key={menu.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={`ep-menu-btn ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
                  onClick={() => handleMenuClick(menu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 13px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isActive ? 'var(--primary, #0f766e)' : (isOpen ? 'var(--hover, rgba(0,0,0,0.05))' : 'transparent'),
                    color: isActive ? '#ffffff' : 'var(--text)',
                    fontSize: '13px',
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    fontFamily: 'inherit',
                    boxShadow: isActive ? '0 2px 6px rgba(13, 148, 136, 0.3)' : 'none'
                  }}
                >
                  <span style={{ fontSize: '15px' }}>{menu.icon}</span>
                  <span>{menu.label}</span>

                  {!menu.isSingle && (
                    <span style={{
                      fontSize: '10px',
                      opacity: isActive ? 0.9 : 0.6,
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease'
                    }}>
                      ▼
                    </span>
                  )}

                  {menu.badge > 0 && (
                    <span className="ep-menu-badge" style={{
                      background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--danger)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '99px'
                    }}>
                      {menu.badge}
                    </span>
                  )}
                </button>

                {/* Dropdown Popup Menu */}
                {!menu.isSingle && isOpen && menu.children && (
                  <div className="ep-dropdown-panel" style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    minWidth: '290px',
                    maxWidth: '350px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 12px 35px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px'
                  }}>
                    {menu.children.map((child) => {
                      const isChildActive = child.targetTab === activeTab;

                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`ep-dropdown-item ${isChildActive ? 'active' : ''}`}
                          onClick={() => handleSubItemClick(child)}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isChildActive ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                            color: isChildActive ? 'var(--primary-dark, #0f766e)' : 'var(--text)',
                            textAlign: 'right',
                            width: '100%',
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                            fontFamily: 'inherit'
                          }}
                        >
                          <span className="ep-dropdown-item-icon" style={{ fontSize: '16px', marginTop: '2px' }}>{child.icon}</span>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div className="ep-dropdown-item-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: isChildActive ? 800 : 700, fontSize: '13px' }}>
                              <span>{child.label}</span>
                              {child.badge > 0 && (
                                <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '99px' }}>
                                  {child.badge}
                                </span>
                              )}
                            </div>
                            {child.desc && (
                              <p className="ep-dropdown-item-desc" style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)', fontWeight: 500, lineHeight: 1.3 }}>{child.desc}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 3. MOBILE OFF-CANVAS DRAWER ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {isMobileDrawerOpen && (
        <div
          className="ep-drawer-overlay"
          onClick={() => setIsMobileDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'flex-start',
            animation: 'epFadeIn 0.2s ease'
          }}
        >
          <div
            className="ep-drawer"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '310px',
              maxWidth: '85vw',
              height: '100%',
              background: 'var(--surface, #ffffff)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0 40px rgba(0, 0, 0, 0.4)',
              overflowY: 'auto',
              borderLeft: '1px solid var(--border)',
              boxSizing: 'border-box'
            }}
          >
            {/* Drawer Header (Solid Gradient with White Text) */}
            <div style={{
              padding: '22px 18px 18px',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              color: '#ffffff',
              position: 'relative',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
            }}>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '14px',
                  background: 'rgba(255, 255, 255, 0.25)',
                  border: 'none',
                  color: '#ffffff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold'
                }}
                title="إغلاق القائمة"
              >
                ✕
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    color: '#0d9488',
                    border: '2px solid rgba(255,255,255,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '18px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    cursor: (emp?.photoUrl || emp?.photo) ? 'pointer' : 'default'
                  }}
                  onClick={() => {
                    if (emp?.photoUrl || emp?.photo) setShowPhotoPreview(true);
                  }}
                  title={emp?.photoUrl || emp?.photo ? '🔍 انقر لمعاينة وتكبير صورتك الشخصية' : ''}
                >
                  {emp.photoUrl ? (
                    <img src={emp.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    getEmpDisplayName(emp).charAt(0)
                  )}
                </div>

                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getEmpDisplayName(emp)}
                  </h3>
                  <div style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.9)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{emp.jobTitle}</span>
                    <span>·</span>
                    <span>🆔 {emp.code}</span>
                  </div>

                  {/* Leave balance badge inside drawer */}
                  <div style={{
                    marginTop: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '2px 8px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#ffffff'
                  }}>
                    <span>🏖️ رصيد الإجازات:</span>
                    <span>{emp.annualLeaveBalance !== undefined ? emp.annualLeaveBalance : 21} يوم</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Body (Navigation Items) */}
            <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {employeeMenuItems.map((menu) => {
                if (menu.isSingle) {
                  const isActive = activeTab === menu.targetTab;
                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(menu.targetTab);
                        setIsMobileDrawerOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isActive ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                        color: isActive ? 'var(--primary-dark, #0f766e)' : 'var(--text)',
                        fontSize: '14px',
                        fontWeight: isActive ? 800 : 600,
                        cursor: 'pointer',
                        textAlign: 'right',
                        width: '100%',
                        transition: 'all 0.15s ease',
                        fontFamily: 'inherit'
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>{menu.icon}</span>
                      <span style={{ flex: 1 }}>{menu.label}</span>
                    </button>
                  );
                }

                const isExpanded = drawerExpandedGroup === menu.id;
                const isGroupActive = isMenuGroupActive(menu);

                return (
                  <div key={menu.id} style={{ borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))', paddingBottom: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setDrawerExpandedGroup(prev => prev === menu.id ? null : menu.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isGroupActive ? 'rgba(13, 148, 136, 0.08)' : (isExpanded ? 'var(--hover, rgba(0,0,0,0.03))' : 'transparent'),
                        color: isGroupActive ? 'var(--primary, #0d9488)' : 'var(--text)',
                        fontSize: '14px',
                        fontWeight: isGroupActive ? 800 : 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        fontFamily: 'inherit'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '18px' }}>{menu.icon}</span>
                        <span>{menu.label}</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                        ▼
                      </span>
                    </button>

                    {isExpanded && menu.children && (
                      <div style={{ padding: '4px 10px 8px 14px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {menu.children.map((child) => {
                          const isChildActive = child.targetTab === activeTab;
                          return (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => {
                                handleSubItemClick(child);
                                setIsMobileDrawerOpen(false);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isChildActive ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                                color: isChildActive ? 'var(--primary-dark, #0f766e)' : 'var(--text)',
                                fontSize: '13px',
                                fontWeight: isChildActive ? 800 : 600,
                                cursor: 'pointer',
                                textAlign: 'right',
                                width: '100%',
                                transition: 'all 0.15s ease',
                                fontFamily: 'inherit'
                              }}
                            >
                              <span style={{ fontSize: '16px' }}>{child.icon}</span>
                              <span style={{ flex: 1 }}>{child.label}</span>
                              {child.badge > 0 && (
                                <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '99px' }}>
                                  {child.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Drawer Footer (Logout) */}
            <div style={{ padding: '14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  if (typeof handleLogout === 'function') handleLogout();
                  else setCurrentEmpUser(null);
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>🚪</span>
                <span>تسجيل الخروج</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 4. MOBILE BOTTOM NAVIGATION BAR (Fixed at bottom on Mobile Screens) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {isMobileScreen && (
        <nav className="ep-bottom-nav" style={{
          display: 'flex',
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
          zIndex: 1000,
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 4px calc(env(safe-area-inset-bottom, 0px))',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}>
          <button
            type="button"
            className={`ep-bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              color: activeTab === 'dashboard' ? 'var(--primary, #0d9488)' : 'var(--muted)',
              fontSize: '11px',
              fontWeight: activeTab === 'dashboard' ? 800 : 600,
              cursor: 'pointer',
              padding: '4px 0',
              fontFamily: 'inherit',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '18px' }}>🏠</span>
            <span>الرئيسية</span>
          </button>

          <button
            type="button"
            className={`ep-bottom-nav-btn ${activeTab === 'shifts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shifts')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              color: activeTab === 'shifts' ? 'var(--primary, #0d9488)' : 'var(--muted)',
              fontSize: '11px',
              fontWeight: activeTab === 'shifts' ? 800 : 600,
              cursor: 'pointer',
              padding: '4px 0',
              fontFamily: 'inherit',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '18px' }}>⏱️</span>
            <span>الدوام</span>
          </button>

          <button
            type="button"
            className={`ep-bottom-nav-btn ${activeTab === 'salary' ? 'active' : ''}`}
            onClick={() => setActiveTab('salary')}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              color: activeTab === 'salary' ? 'var(--primary, #0d9488)' : 'var(--muted)',
              fontSize: '11px',
              fontWeight: activeTab === 'salary' ? 800 : 600,
              cursor: 'pointer',
              padding: '4px 0',
              fontFamily: 'inherit',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '18px' }}>💰</span>
            <span>الراتب</span>
          </button>

          <button
            type="button"
            className="ep-bottom-nav-btn"
            onClick={() => setIsMobileDrawerOpen(true)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              height: '100%',
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 0',
              fontFamily: 'inherit',
              position: 'relative'
            }}
          >
            <span style={{ fontSize: '18px' }}>☰</span>
            <span>المزيد</span>
          </button>
        </nav>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 5. MAIN WORKSPACE CANVAS ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      <main className="ep-workspace" style={{
        flex: 1,
        padding: isMobileScreen ? '12px 10px 85px 10px' : '16px 20px',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>

          {/* ── Universal Biometric Registration Reminder Banner (Across ALL employee tabs) ── */}
          {(() => {
            const hasBio = Boolean(
              emp?.has_face_descriptor || emp?.face_descriptor ||
              emp?.has_hand_descriptor || emp?.hand_descriptor
            );
            const pendingBioReg = (state?.requests || []).find(
              r => isEmpRequestMatch(r, emp) &&
                   r.type === 'biometric_registration' &&
                   (r.status === 'pending' || r.status === 'pending_admin')
            );

            if (!hasBio && !pendingBioReg) {
              return (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                    border: '2px solid #ea580c',
                    borderRadius: '16px',
                    padding: '16px 22px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                    boxShadow: '0 4px 14px rgba(234, 88, 12, 0.15)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '32px' }}>📸</span>
                    <div>
                      <div style={{ fontWeight: '900', fontSize: '15px', color: '#9a3412' }}>
                        تنبيه نظام البصمة: لم يتم تسجيل بصمتك الإلكترونية بعد!
                      </div>
                      <div style={{ fontSize: '13px', color: '#c2410c', marginTop: '3px', lineHeight: '1.5' }}>
                        ينبغي عليك تسجيل بصمتك الذكية (لمرة واحدة فقط) لتتمكن من إثبات حضورك وانصرافك اليومي عبر كشك الصيدلية.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => setShowBiometricRegisterModal(true)}
                    style={{
                      background: '#ea580c',
                      color: '#ffffff',
                      padding: '10px 20px',
                      fontSize: '13.5px',
                      fontWeight: 'bold',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📸</span>
                    <span>تسجيل البصمة الآن (خطوة واحدة)</span>
                    <span>➔</span>
                  </button>
                </div>
              );
            }

            if (pendingBioReg) {
              return (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    border: '1.5px solid #3b82f6',
                    borderRadius: '14px',
                    padding: '12px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.1)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '26px' }}>⏳</span>
                    <div style={{ fontSize: '13px', color: '#1e40af' }}>
                      <strong>بصمتك قيد المراجعة:</strong> تم إرسال بصمتك بنجاح بتاريخ ({pendingBioReg.date || pendingBioReg.createdAt?.slice(0, 10)}) وهي الآن بانتظار اعتماد الإدارة العليا لتفعيلها.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setActiveTab('biometric')}
                    style={{ fontSize: '12px', padding: '5px 12px', background: '#bfdbfe', color: '#1e3a8a', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    عرض التفاصيل ➔
                  </button>
                </div>
              );
            }

            return null;
          })()}

          {/* ── Active Resignation Notice Period Banner ── */}
          {activeResignationNotice && activeResignationNotice.remainingDays > 0 && (
            <div
              style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '2px solid #f59e0b',
                borderRadius: '16px',
                padding: '16px 22px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '32px' }}>⏳</span>
                <div>
                  <div style={{ fontWeight: '900', fontSize: '15px', color: '#92400e' }}>
                    تنبيه: فترة إشعار الاستقالة سارية المفعول
                  </div>
                  <div style={{ fontSize: '13px', color: '#b45309', marginTop: '3px', lineHeight: '1.6' }}>
                    أنت حالياً في فترة إشعار الاستقالة المعتمدة من الإدارة.
                    المتبقي: <strong style={{ color: '#92400e', fontSize: '14px' }}>{activeResignationNotice.remainingDays} يوم عمل</strong>
                    {' '}· تاريخ نهاية المدة: <strong style={{ color: '#92400e', fontSize: '14px' }}>{activeResignationNotice.endDate}</strong>
                  </div>
                </div>
              </div>
              <div style={{
                background: '#f59e0b',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '10px',
                fontWeight: '900',
                fontSize: '13.5px',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)'
              }}>
                متبقي {activeResignationNotice.remainingDays} يوم
              </div>
            </div>
          )}

          {/* ── Active Month New Roster Alert Banner ── */}
          {!hasApprovedRosterForActiveMonth && (
            <div
              style={{
                background: hasPendingRosterReqForMonth
                  ? 'linear-gradient(135deg, #eff6ff, #dbeafe)'
                  : 'linear-gradient(135deg, #fff7ed, #ffedd5)',
                border: hasPendingRosterReqForMonth ? '2px solid #3b82f6' : '2px solid #f97316',
                borderRadius: '16px',
                padding: '16px 22px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.15)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ fontSize: '32px' }}>{hasPendingRosterReqForMonth ? '⏳' : '🔔'}</span>
                <div>
                  <div style={{ fontWeight: '900', fontSize: '15px', color: hasPendingRosterReqForMonth ? '#1d4ed8' : '#c2410c' }}>
                    {hasPendingRosterReqForMonth
                      ? `طلب اعتماد الجدول الشهري لشهر (${selectedMonth || activeMonthLabel}) قيد المراجعة!`
                      : `تنبيه نظام الصيدليات: مطلوب إنشاء وتقديم جدول شهري لشهر (${selectedMonth || activeMonthLabel})!`}
                  </div>
                  <div style={{ fontSize: '13px', color: hasPendingRosterReqForMonth ? '#1e40af' : '#9a3412', marginTop: '3px', lineHeight: '1.5' }}>
                    {hasPendingRosterReqForMonth
                      ? 'تم إرسال جدولك بنجاح وهو الآن قيد المراجعة والموافقة من مدير الفرع والإدارة العليا.'
                      : 'لا يوجد جدول تشغيلي معتمد لك لهذا الشهر حتى الآن. يرجى إعداد وتصميم مواعيد وردياتك وإرسالها للاعتماد المزدوج.'}
                  </div>
                </div>
              </div>
              <button
                className="btn"
                style={{
                  background: hasPendingRosterReqForMonth ? '#2563eb' : '#ea580c',
                  color: '#ffffff',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: hasPendingRosterReqForMonth
                    ? '0 2px 8px rgba(37, 99, 235, 0.3)'
                    : '0 2px 8px rgba(234, 88, 12, 0.3)'
                }}
                onClick={() => {
                  setActiveTab('roster');
                  if (!hasPendingRosterReqForMonth) {
                    setAutoOpenRosterModal(true);
                  }
                }}
              >
                {hasPendingRosterReqForMonth ? '📋 عرض تفاصيل الجدول والطلب 🔗' : '📅 إنشاء وتحديد الجدول الشهري الآن 🔗'}
              </button>
            </div>
          )}

          {/* ── Period Freeze Banner ── */}
          {Boolean(state.orgSettings?.payrollPeriodFrozen?.[selectedMonth]?.isFrozen || state.orgSettings?.isPeriodFrozen) && (
            <div
              style={{
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '2px solid #3b82f6',
                borderRadius: '16px',
                padding: '14px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)'
              }}
            >
              <span style={{ fontSize: '30px' }}>🔒</span>
              <div>
                <div style={{ fontWeight: '900', fontSize: '15px', color: '#1e40af' }}>
                  دورة رواتب شهر ({selectedMonth}) مقفلة ومجمدة رسمياً
                </div>
                <div style={{ fontSize: '13px', color: '#1e3a8a', marginTop: '2px' }}>
                  تم اعتماد وإغلاق سجلات وبصمات هذا الشهر من قبل الإدارة العليا لضمان دقة وصرف المستحقات.
                </div>
              </div>
            </div>
          )}

          {/* ── Active Lateness Penalty Alert Banner for Employee ── */}
          {(() => {
            if (!emp?.id) return null;
            const empPenalties = (state.lateIncidents || []).filter((inc) => {
              if (String(inc.employeeId) !== String(emp.id)) return false;
              if (inc.status === 'cancelled' || inc.status === 'approved_permission_exempt' || inc.actionType === 'grace') return false;
              if (filterFn && !filterFn(inc.date)) return false;
              return (inc.deductionMinutes > 0 || inc.penaltyAmount > 0);
            });
            if (empPenalties.length === 0) return null;
            const totalMins = empPenalties.reduce((sum, i) => sum + (i.deductionMinutes || 0), 0);
            const totalCash = empPenalties.reduce((sum, i) => sum + (i.penaltyAmount || 0), 0);

            return (
              <div
                style={{
                  background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
                  border: '2px solid #9333ea',
                  borderRadius: '16px',
                  padding: '14px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '32px' }}>📜</span>
                  <div>
                    <div style={{ fontWeight: '900', fontSize: '15px', color: '#6b21a8' }}>
                      تنبيه لائحة العمل والجزاءات: تم تسجيل ({empPenalties.length}) واقعة تأخير / جزاء بدورة الشهر
                    </div>
                    <div style={{ fontSize: '13px', color: '#7e22ce', marginTop: '2px' }}>
                      إجمالي خصومات اللائحة: <strong>{totalMins} دقيقة</strong> ({totalCash} ج.م). يمكنك الاطلاع على تفاصيل كل يوم وتقديم تظلم للإدارة.
                    </div>
                  </div>
                </div>
                <button
                  className="btn"
                  style={{
                    background: '#7c3aed',
                    color: '#ffffff',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer'
                  }}
                  onClick={() => setActiveTab('bylaws')}
                >
                  عرض سجل اللائحة 📜
                </button>
              </div>
            );
          })()}

          {/* ── 1. Tab: Dashboard ── */}
          {activeTab === 'dashboard' && (
            <div className="fade-in">

              {/* ── Top Profile Card (Header) ── */}
              <div style={{
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                borderRadius: '16px',
                padding: '20px 24px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '20px',
                boxShadow: '0 6px 20px rgba(13,148,136,0.25)',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: '#ffffff',
                      color: '#0d9488',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      fontWeight: '800',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      flexShrink: 0,
                      cursor: (emp?.photoUrl || emp?.photo) ? 'pointer' : 'default',
                      transition: 'transform 0.15s ease'
                    }}
                    onClick={() => {
                      if (emp?.photoUrl || emp?.photo) setShowPhotoPreview(true);
                    }}
                    title={emp?.photoUrl || emp?.photo ? '🔍 انقر لمعاينة وتكبير صورتك الشخصية' : ''}
                  >
                    {emp.photoUrl ? (
                      <img src={emp.photoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      emp.name.trim().charAt(0)
                    )}
                  </div>
                  <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>{emp.name}</h2>
                    <p style={{ margin: 0, opacity: 0.9, fontSize: '13.5px', fontWeight: '500' }}>
                      🏢 {emp.jobTitle} &nbsp;|&nbsp; 🆔 كود: {emp.code} &nbsp;|&nbsp; 📍 {state.branches?.find(b => b.id === emp.branchId)?.name || 'الفرع الرئيسي'}
                    </p>
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px 18px', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '12px', display: 'block', opacity: 0.85 }}>رصيد الإجازات السنوية</span>
                  <span style={{ fontSize: '20px', fontWeight: '800' }}>{emp.annualLeaveBalance !== undefined ? emp.annualLeaveBalance : 21} يوم</span>
                </div>
              </div>

              {/* ── Live Punch Clock Widget (always shown, button hidden if permission revoked) ── */}
              {(() => {
                const activeShift = state.activeShifts[emp.id];
                const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;
                const activeBranchObj = activeShift ? (state.branches || []).find((b) => String(b.id) === String(activeShift.branchId)) : null;
                const activeBranchName = activeBranchObj ? activeBranchObj.name : (emp.branchName || 'الفرع الرئيسي');

                return (
                  <div
                    className="card live-clock-widget fade-in"
                    style={{
                      marginBottom: '20px',
                      background: 'linear-gradient(135deg, var(--surface), var(--background))',
                      border: '1px solid var(--border)',
                      padding: '18px 22px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          ⏱️ البصمة الحية للموظف (الحالية)
                          {activeShift ? (
                            activeShift.isPaused || activeShift.isOnBreak ? (
                              <span className="badge warning">في استراحة بريك {isMultiBranch ? `(فرع ${activeBranchName})` : ''}</span>
                            ) : (
                              <span className="badge success">على رأس العمل {isMultiBranch ? `(فرع ${activeBranchName})` : ''}</span>
                            )
                          ) : (
                            <span className="badge secondary">خارج الشيفت</span>
                          )}
                        </h3>
                        <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                          {activeShift
                            ? `زمن الوردية الحالي: ${getActiveElapsedStr ? getActiveElapsedStr(emp.id) : '—'} ${(activeShift.isPaused || activeShift.isOnBreak) ? `(استراحة: ${getActiveBreakStr ? getActiveBreakStr(emp.id) : '0'})` : ''}`
                            : canStartEnd
                              ? 'يمكنك بدء وردية عملك وتوثيق الحضور والانصراف المباشر بنقرة واحدة'
                              : '🔒 صلاحية بدء الوردية من هذه الصفحة مقيدة — استخدم صفحة البصمة الإلكترونية'}
                        </p>
                      </div>

                      {/* Show shift buttons only when canStartEnd is true */}
                      {canStartEnd && (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {!activeShift ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {isMultiBranch && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>📍 اختر الفرع:</label>
                                  <select
                                    value={punchTargetBranchId || emp.branchesDetails[0]?.branchId || ''}
                                    onChange={(e) => setPunchTargetBranchId(e.target.value)}
                                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 'bold' }}
                                  >
                                    {emp.branchesDetails.map((bd) => {
                                      const b = (state.branches || []).find((br) => String(br.id) === String(bd.branchId));
                                      return <option key={bd.branchId} value={bd.branchId}>فرع {b?.name || bd.branchId}</option>;
                                    })}
                                  </select>
                                </div>
                              )}
                              <button
                                className="btn btn-start"
                                onClick={() => {
                                  if (!canStartEnd || !canLivePunch) {
                                    showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لبدء الوردية عبر البصمة الحية');
                                    return;
                                  }
                                  const targetBId = punchTargetBranchId || (isMultiBranch ? emp.branchesDetails[0]?.branchId : emp.branchId);
                                  startShift && startShift(emp.id, 'employee', targetBId);
                                }}
                              >
                                ▶ بدء الوردية الآن
                              </button>
                            </div>
                          ) : (
                            <>
                              {activeShift.isPaused || activeShift.isOnBreak ? (
                                <button className="btn btn-start" onClick={() => resumeShift && resumeShift(emp.id)}>
                                  ▶ استئناف العمل
                                </button>
                              ) : (
                                <button className="btn btn-pause" onClick={() => pauseShift && pauseShift(emp.id)}>
                                  ☕ بريك
                                </button>
                              )}
                              <button className="btn btn-stop" onClick={() => stopShift && stopShift(emp.id)}>
                                ⏹ إنهاء الوردية {isMultiBranch ? `(فرع ${activeBranchName})` : ''}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Absence Alert */}
              {absenceDays.length > 0 && (
                <div style={{
                  marginBottom: '20px',
                  padding: '14px 18px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: '6px', fontSize: '14px' }}>
                      ⚠️ تنبيه غيابات مسجلة — {absenceDays.length} يوم غياب بدون إذن
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {absenceDays.map(ab => (
                        <span key={ab.date} style={{ display: 'inline-block', margin: '2px 4px', padding: '1px 8px', background: 'rgba(239,68,68,0.12)', borderRadius: '99px', color: 'var(--danger)', fontWeight: 600 }}>
                          {ab.date} ({ab.arDayName})
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px', fontWeight: 600 }}>
                      إجمالي الخصم المحسوب: {fmt(absenceDeduction)} ج.م
                      <span style={{ fontWeight: 400, color: 'var(--muted)', marginRight: '8px' }}>
                        (في حال تقديم إجازة تُلغى تلقائياً)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Period filter & Active Payroll Cutoff Badge */}
              <div className="ep-period-bar card" style={{ marginBottom: '20px', padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--primary-dark)' }}>🗓️ فترة احتساب وتفاصيل الراتب:</span>
                  <span style={{ fontSize: '13px', background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '99px', fontWeight: 'bold', border: '1px solid #86efac' }}>
                    {periodLabel}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <select
                    value={filterMode}
                    onChange={(e) => {
                      setFilterMode(e.target.value);
                      if (e.target.value === 'month') { setRangeStart(''); setRangeEnd(''); }
                    }}
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    <option value="month">📅 الفترة المعتمدة للرواتب ({selectedMonth})</option>
                    <option value="range">📆 تصفية فترة مخصصة</option>
                  </select>

                  {filterMode === 'range' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <input type="date" value={rangeStart} max={rangeEnd || undefined} onChange={(e) => setRangeStart(e.target.value)} style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إلى</span>
                      <input type="date" value={rangeEnd} min={rangeStart || undefined} onChange={(e) => setRangeEnd(e.target.value)} style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
                      {rangeFilterValid && (
                        <button onClick={() => { setRangeStart(''); setRangeEnd(''); setFilterMode('month'); }} style={{ padding: '4px 10px', borderRadius: '99px', fontSize: '12px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer' }}>✕ مسح</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Cards Grid */}
              {emp.branchesDetails && emp.branchesDetails.length > 1 && !selectedBranchId ? (
                <div>
                  <h4 style={{ margin: '16px 0 12px 0', fontSize: '16px', color: 'var(--primary-dark)' }}>
                    🏢 تفاصيل رواتب وساعات العمل لكل فرع على حدة
                  </h4>
                  {emp.branchesDetails.map((bd) => {
                    const bId = bd.branchId;
                    const bObj = (state.branches || []).find((b) => String(b.id) === String(bId));
                    const bName = bObj ? bObj.name : `فرع ${bId}`;
                    const bSummary = computeEmpSummary(emp.id, filterFn, filterMode === 'month' ? selectedMonth : null, bId);
                    const bSalary = parseFloat(bd.salary) || 0; // سعر الساعة الشهرية بالفرع
                    const bHoursPerDay = parseFloat(bd.workHoursPerDay) || 8;
                    const bDaysPerMonth = parseFloat(bd.workDaysPerMonth) || 26;
                    const bReqHours = bDaysPerMonth * bHoursPerDay;
                    const bMonthlySalary = bSummary.monthlySalary || (bSummary.dailyRate ? bSummary.dailyRate * bDaysPerMonth : bSalary * bHoursPerDay);

                    const activeShift = state.activeShifts[emp.id];
                    const isThisBranchActive = activeShift && String(activeShift.branchId || emp.branchId) === String(bId);
                    const isOtherBranchActive = activeShift && !isThisBranchActive;

                    return (
                      <div key={bId} style={{ marginBottom: '24px', background: 'var(--surface)', border: isThisBranchActive ? '2px solid #10b981' : '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '2px solid var(--primary)', paddingBottom: '6px', flexWrap: 'wrap', gap: '10px' }}>
                          <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px' }}>📍 فرع {bName}</h4>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isThisBranchActive ? (
                              <span className="badge success" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 'bold' }}>
                                🟢 البصمة الحية نشطة حالياً بهذا الفرع {activeShift.isPaused ? '(بريك)' : ''}
                              </span>
                            ) : isOtherBranchActive ? (
                              <span className="badge secondary" style={{ background: '#f1f5f9', color: '#64748b' }}>
                                ⚪ خارج الشيفت بهذا الفرع (نشط بفرع آخر)
                              </span>
                            ) : (
                              <span className="badge secondary" style={{ background: '#f8fafc', color: '#64748b' }}>
                                ⚪ خارج الشيفت بهذا الفرع
                              </span>
                            )}

                            {canStartEnd && (
                              <div>
                                {isThisBranchActive ? (
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {activeShift.isPaused ? (
                                      <button className="btn btn-start" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => resumeShift && resumeShift(emp.id)}>▶ استئناف</button>
                                    ) : (
                                      <button className="btn btn-pause" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => pauseShift && pauseShift(emp.id)}>☕ بريك</button>
                                    )}
                                    <button className="btn btn-stop" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => stopShift && stopShift(emp.id)}>⏹ إنهاء الوردية</button>
                                  </div>
                                ) : !activeShift && (
                                  <button className="btn btn-start" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => startShift && startShift(emp.id, 'employee', bId)}>
                                    ▶ بدء الوردية بهذا الفرع
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="ep-summary-grid">
                          <SummaryCard icon="⏱️" label="إجمالي ساعات العمل" value={`${fmt(bSummary.hours)} ساعة`} sub={`من أصل ${bReqHours} ساعة مطلوبة بالفرع`} />
                          <SummaryCard icon="💰" label="سعر الساعة الشهرية (المدخل)" value={canViewSalary ? `${fmt(bSalary)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? `الراتب الشهري: ${fmt(bMonthlySalary)} ج.م` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="📅" label="سعر اليوم (المحسوب)" value={canViewSalary ? `${fmt(bSummary.dailyRate)} ج.م / يوم` : '🔒 مقيد'} sub={canViewSalary ? `(الراتب الشهري ÷ ${bDaysPerMonth} يوم)` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="💵" label="سعر الساعة اليومي" value={canViewSalary ? `${fmt(bSummary.rate || bSalary)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? "المُدخل من الإدارة العليا" : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="💰" label="المستحقات الأساسية (أجر الساعات)" value={canViewSalary ? `${fmt(bSummary.baseEarnings)} ج.م` : '🔒 مقيد'} sub={canViewSalary ? `${fmt(bSummary.hours)} س × ${fmt(bSummary.rate || bSalary)} ج.م` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="🎁" label="إجمالي المكافآت" value={canViewAdjustments ? `+${fmt(bSummary.totalBonus)} ج.م` : '🔒 مقيد'} colorVar="--success" isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="✂️" label="إجمالي الخصومات" value={canViewAdjustments ? `-${fmt(bSummary.totalDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" isPrivacy={isPrivacyMode} />
                          <SummaryCard icon="🏆" label={`صافي المرتب — فرع ${bName}`} value={canViewSalary ? `${fmt(bSummary.netSalary)} ج.م` : '🔒 مقيد'} colorVar="--primary" isPrivacy={isPrivacyMode} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ep-summary-grid">
                  <SummaryCard icon="⏱️" label="إجمالي ساعات العمل" value={`${fmt(summary.hours)} ساعة`} sub={`من أصل ${monthlyRequiredHours} ساعة مطلوبة شهرياً`} />
                  <SummaryCard icon="💰" label="سعر الساعة الشهرية (المدخل)" value={canViewSalary ? `${fmt(currentHourlyRate)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? `الراتب الشهري: ${fmt(currentMonthlySalary)} ج.م` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                  <SummaryCard icon="📅" label="سعر اليوم (المحسوب)" value={canViewSalary ? `${fmt(summary.dailyRate)} ج.م / يوم` : '🔒 مقيد'} sub={canViewSalary ? `(الراتب الشهري ÷ ${workDaysPerMonth || 26} يوم)` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                  <SummaryCard icon="💵" label="سعر الساعة اليومي" value={canViewSalary ? `${fmt(summary.rate || currentHourlyRate)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? "المُدخل من الإدارة العليا" : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                  <SummaryCard icon="💰" label="المستحقات الأساسية (أجر الساعات)" value={canViewSalary ? `${fmt(summary.baseEarnings)} ج.م` : '🔒 مقيد'} sub={canViewSalary ? `${fmt(summary.hours)} س × ${fmt(summary.rate || currentHourlyRate)} ج.م` : '🔒 مقيد'} isPrivacy={isPrivacyMode} />
                  {(summary.approvedOvertimeHours > 0 || summary.pendingOvertimeHours > 0) && (
                    <SummaryCard
                      icon="⭐"
                      label="الوقت الإضافي"
                      value={canViewSalary ? (summary.approvedOvertimeHours > 0 ? `+${fmt(summary.overtimeEarnings)} ج.م` : 'معلق') : '🔒 مقيد'}
                      colorVar="--success"
                      isPrivacy={isPrivacyMode}
                      sub={canViewSalary ? (
                        [
                          summary.approvedOvertimeHours > 0 && `معتمد: ${fmt(summary.approvedOvertimeHours)} س (+${fmt(summary.overtimeEarnings)} ج.م)`,
                          summary.pendingOvertimeHours > 0 && `⏳ معلق: ${fmt(summary.pendingOvertimeHours)} س`
                        ].filter(Boolean).join(' | ')
                      ) : '🔒 مقيد'}
                    />
                  )}
                  {summary.totalAllowances > 0 && (
                    <SummaryCard
                      icon="💼"
                      label="إجمالي البدلات الثابتة"
                      value={canViewSalary ? `+${fmt(summary.totalAllowances)} ج.م` : '🔒 مقيد'}
                      colorVar="--success"
                      isPrivacy={isPrivacyMode}
                      sub={canViewSalary ? [
                        summary.managementAllowance > 0 && `إدارة: ${fmt(summary.managementAllowance)}`,
                        summary.transportAllowance > 0 && `مواصلات: ${fmt(summary.transportAllowance)}`,
                        Array.isArray(summary.extraAllowances) && summary.extraAllowances.length > 0
                          ? summary.extraAllowances.map(a => `${a.title || 'إضافي'}: ${fmt(a.amount)}`).join(' | ')
                          : (summary.extraAllowance > 0 && `${summary.extraAllowanceTitle || 'إضافي'}: ${fmt(summary.extraAllowance)}`)
                      ].filter(Boolean).join(' | ') : '🔒 مقيد'}
                    />
                  )}
                  <SummaryCard icon="🎁" label="إجمالي المكافآت" value={canViewAdjustments ? `+${fmt(summary.totalBonus)} ج.م` : '🔒 مقيد'} colorVar="--success" isPrivacy={isPrivacyMode} />
                  <SummaryCard icon="✂️" label="إجمالي الخصومات" value={canViewAdjustments ? `-${fmt(summary.totalDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" isPrivacy={isPrivacyMode} />
                  {summary.unpaidLeaveDaysCount > 0 && (
                    <SummaryCard
                      icon="💸"
                      label={`إجازة غير مدفوعة (${summary.unpaidLeaveDaysCount} يوم)`}
                      value={canViewSalary ? `-${fmt(summary.unpaidLeaveDeduction)} ج.م` : '🔒 مقيد'}
                      colorVar="--danger"
                      sub={canViewSalary ? `مخصومة بسعر اليوم (${fmt(summary.dailyRate)} ج.م)` : '🔒 مقيد'}
                      isPrivacy={isPrivacyMode}
                    />
                  )}
                  {absenceDays.length > 0 && (
                    <SummaryCard icon="🚫" label={`خصم الغياب (${absenceDays.length} يوم)`} value={canViewSalary ? `-${fmt(absenceDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" sub="يُلغى عند اعتماد إجازة" isPrivacy={isPrivacyMode} />
                  )}
                  <SummaryCard icon="🏆" label={`صافي المرتب — ${lbl.arabic}`} value={canViewSalary ? `${fmt(summary.netSalary)} ج.م` : '🔒 مقيد'} colorVar="--primary" isPrivacy={isPrivacyMode} />
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Shifts ── */}
          {activeTab === 'shifts' && (
            <div className="card ep-tab-content fade-in">
              <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h3>📋 سجل البصمات والورديات — {lbl.raw}</h3>
                  <span className="ep-count-badge">{empShifts.length} وردية</span>
                  {(() => {
                    const empManualCount = getEmployeeManualPunchesCount(emp.id, state, filterFn);
                    return (
                      <span style={{ background: empManualCount > 0 ? '#fef3c7' : '#f1f5f9', color: empManualCount > 0 ? '#b45309' : '#64748b', border: '1px solid ' + (empManualCount > 0 ? '#fcd34d' : '#e2e8f0'), padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                        🖐️ تسجيل البصمات يدوياً هذا الشهر: {empManualCount}
                      </span>
                    );
                  })()}
                </div>
                {canManualShift && (
                  <button className="btn btn-start" onClick={() => setShowManualForm(!showManualForm)} style={{ fontSize: '13px', padding: '6px 14px' }}>
                    {showManualForm ? '✕ إغلاق النموذج' : '+ تسجيل وردية يدوياً'}
                  </button>
                )}
              </div>

              {canManualShift && showManualForm && (
                <div className="card settings-card fade-in" style={{ marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--primary-tint)', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>⏱️ إضافة وردية عمل يدوية جديدة</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '1 1 130px' }}>
                      <label>التاريخ</label>
                      <input type="date" value={empManualDate} onChange={(e) => setEmpManualDate(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: '1 1 110px' }}>
                      <label>وقت الدخول</label>
                      <input type="time" value={empManualIn} onChange={(e) => setEmpManualIn(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: '1 1 110px' }}>
                      <label>وقت الخروج</label>
                      <input type="time" value={empManualOut} onChange={(e) => setEmpManualOut(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: '1 1 100px' }}>
                      <label>البريك (ساعات)</label>
                      <input type="number" step="0.25" min="0" value={empManualBreak} onChange={(e) => setEmpManualBreak(e.target.value)} />
                    </div>
                    <div className="field grow" style={{ flex: '2 1 160px' }}>
                      <label>ملاحظات (اختياري)</label>
                      <input type="text" placeholder="مثال: وردية إضافية..." value={empManualNote} onChange={(e) => setEmpManualNote(e.target.value)} />
                    </div>
                    <button className="btn btn-start" onClick={handleEmpAddManualShift} style={{ height: '38px', padding: '0 18px', whiteSpace: 'nowrap' }}>
                      💾 حفظ الوردية
                    </button>
                  </div>
                </div>
              )}

              {/* Absence days in shifts view */}
              {absenceDays.length > 0 && (
                <div style={{ margin: '16px 0', padding: '12px 14px', background: 'rgba(239,68,68,0.07)', border: '1px dashed rgba(239,68,68,0.4)', borderRadius: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--danger)', fontSize: '13px', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>🚫 أيام الغياب التلقائية المحسوبة ({absenceDays.length} يوم)</span>
                    {canViewSalary && (
                      <span style={{ color: 'var(--danger)', fontWeight: 800 }}>
                        إجمالي: -{fmt(absenceDeduction)} ج.م
                      </span>
                    )}
                  </div>
                  {isMobileScreen ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {absenceDays.map(ab => (
                        <div key={ab.date} style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                          <div>
                            <span style={{ fontWeight: 800, color: 'var(--danger)' }}>{ab.date}</span>
                            <span style={{ color: 'var(--muted)', marginRight: '6px' }}>({ab.arDayName})</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              الشيفت المفروض: {ab.daySchedule?.start || '—'} – {ab.daySchedule?.end || '—'}
                              {ab.daySchedule?.isSwapped && (
                                <span style={{ color: '#b45309', fontWeight: 600, marginRight: '4px' }}>
                                  ({ab.daySchedule?.swapNote || `متبدلة مع ${ab.daySchedule?.swappedWithName || 'الزميل'}`})
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'left' }}>
                            <span className="badge danger" style={{ fontSize: '10.5px' }}>🚫 غياب</span>
                            {canViewSalary && (
                              <div style={{ color: 'var(--danger)', fontWeight: 800, fontSize: '11.5px', marginTop: '2px' }}>
                                -{fmt(dailyRate)} ج.م
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table style={{ fontSize: '12.5px' }}>
                        <thead>
                          <tr>
                            <th>التاريخ</th>
                            <th>اليوم</th>
                            <th>وقت الشيفت المفروض</th>
                            <th>الحالة</th>
                            <th>الخصم</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absenceDays.map(ab => (
                            <tr key={ab.date} style={{ background: 'rgba(239,68,68,0.04)' }}>
                              <td style={{ fontWeight: 600, color: 'var(--danger)' }}>{ab.date}</td>
                              <td>{ab.arDayName}</td>
                              <td>
                                {ab.daySchedule?.start} – {ab.daySchedule?.end}
                                {ab.daySchedule?.isSwapped && (
                                  <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                                    {ab.daySchedule?.swapNote || `🔄 وردية متبدلة مع ${ab.daySchedule?.swappedWithName || 'الزميل'}`}
                                  </div>
                                )}
                              </td>
                              <td><span className="badge danger">🚫 غياب</span></td>
                              <td style={{ color: 'var(--danger)', fontWeight: 700 }}>
                                {canViewSalary ? `-${fmt(dailyRate)} ج.م` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 700 }}>
                            <td colSpan={4} style={{ textAlign: 'right', paddingRight: '8px' }}>إجمالي خصم الغياب</td>
                            <td style={{ color: 'var(--danger)' }}>{canViewSalary ? `-${fmt(absenceDeduction)} ج.م` : '—'}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Multi-Branch vs Single Branch Shifts */}
              {emp.branchesDetails && emp.branchesDetails.length > 1 && !selectedBranchId ? (
                <div>
                  {emp.branchesDetails.map((bd) => {
                    const bId = bd.branchId;
                    const bObj = (state.branches || []).find((b) => b.id === bId);
                    const bName = bObj ? bObj.name : `فرع ${bId}`;
                    const bShifts = empShifts.filter((s) => s.branchId === bId || (!s.branchId && emp.branchesDetails[0].branchId === bId));
                    const bRate = (summary.perBranch?.[bId]?.rate) || 0;

                    return (
                      <div key={bId} style={{ marginTop: '18px', padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: 'var(--primary-dark)', fontSize: '15px' }}>
                          📋 بصمات فرع {bName} ({bShifts.length} وردية)
                        </h4>
                        {isMobileScreen ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {bShifts.length === 0 ? (
                              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px', background: 'var(--surface)', borderRadius: '10px' }}>
                                لا توجد ورديات مسجلة لهذا الفرع في هذا الشهر
                              </div>
                            ) : (
                              bShifts.map((s, idx) => {
                                const perm = isApprovedPermissionForDate(emp.id, s.date, state);
                                const hasPerm = s.hasApprovedPermission || !!perm;
                                const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);
                                const effHours = getEffectiveShiftHours(s, state);

                                return (
                                  <div key={s.id} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.3)' : 'var(--surface)', border: hasPerm ? '1.5px solid #fcd34d' : '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))', paddingBottom: '6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--muted)', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>#{idx + 1}</span>
                                        <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{s.date}</span>
                                        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>({arabicWeekday(s.date)})</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ background: 'var(--primary-light, #ccfbf1)', color: 'var(--primary-dark, #0f766e)', fontWeight: 800, fontSize: '11.5px', padding: '2px 6px', borderRadius: '6px' }}>
                                          ⏱️ {fmt(effHours)} س
                                        </span>
                                        {canViewSalary && (
                                          <span style={{ background: '#f0fdf4', color: '#15803d', fontWeight: 800, fontSize: '11.5px', padding: '2px 6px', borderRadius: '6px' }}>
                                            💵 {fmt(effHours * bRate)} ج.م
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {hasPerm && (
                                      <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800, alignSelf: 'flex-start' }}>
                                        ⏰ معدلة بإذن (+{permHours} س)
                                      </span>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', background: 'var(--surface-muted)', padding: '6px 8px', borderRadius: '8px', textAlign: 'center' }}>
                                      <div><div style={{ fontSize: '10px', color: 'var(--muted)' }}>🟢 دخول</div><div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--success, #16a34a)', fontFamily: 'monospace' }}>{s.timeIn || '—'}</div></div>
                                      <div style={{ borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }}><div style={{ fontSize: '10px', color: 'var(--muted)' }}>🔴 خروج</div><div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--danger, #dc2626)', fontFamily: 'monospace' }}>{s.timeOut || '—'}</div></div>
                                      <div><div style={{ fontSize: '10px', color: 'var(--muted)' }}>☕ بريك</div><div style={{ fontSize: '12px', fontWeight: 800 }}>{(s.breakHours || 0) > 0 ? `${fmt(s.breakHours)} س` : '—'}</div></div>
                                    </div>
                                    {(s.note || canEditShift) && (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '11px', color: 'var(--muted)', paddingTop: '2px' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.note ? `📝 ${s.note}` : ''}</span>
                                        {canEditShift && (
                                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '11px' }} onClick={() => openEditShift && openEditShift(s)}>✏️</button>
                                            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => deleteShift && deleteShift(s.id)}>🗑️</button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table>
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>التاريخ</th>
                                  <th>اليوم</th>
                                  <th>وقت الدخول</th>
                                  <th>وقت الخروج</th>
                                  <th>ساعات البريك</th>
                                  <th>صافي ساعات العمل</th>
                                  <th>المبلغ المستحق</th>
                                  <th>الملاحظات</th>
                                  {canEditShift && <th>الإجراءات</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {bShifts.length === 0 ? (
                                  <tr className="empty-row">
                                    <td colSpan={canEditShift ? 10 : 9}>لا توجد ورديات مسجلة لهذا الفرع في هذا الشهر</td>
                                  </tr>
                                ) : (
                                  bShifts.map((s, idx) => {
                                    const perm = isApprovedPermissionForDate(emp.id, s.date, state);
                                    const hasPerm = s.hasApprovedPermission || !!perm;
                                    const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);
                                    const effHours = getEffectiveShiftHours(s, state);

                                    return (
                                      <tr key={s.id} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent' }}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                                        <td style={{ fontWeight: 600 }}>
                                          {s.date}
                                          {hasPerm && (
                                            <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                              ⏰ معدلة بإذن (+{permHours} س)
                                            </span>
                                          )}
                                        </td>
                                        <td>{arabicWeekday(s.date)}</td>
                                        <td><span className="ep-time-badge ep-time-in">{s.timeIn}</span></td>
                                        <td><span className="ep-time-badge ep-time-out">{s.timeOut || '—'}</span></td>
                                        <td>{(s.breakHours || 0) > 0 ? <span className="ep-break-badge">{fmt(s.breakHours)} س</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                        <td className="money" style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>
                                          {fmt(effHours)} ساعة
                                        </td>
                                        <td className="money" style={{ color: 'var(--success)', fontWeight: 600 }}>{canViewSalary ? `${fmt(effHours * bRate)} ج.م` : '🔒 مقيد'}</td>
                                        <td style={{ color: hasPerm ? '#047857' : 'var(--text-muted)', fontSize: '0.88rem' }}>
                                          {hasPerm ? (
                                            <div>
                                              <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                                              {s.note && !s.note.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.note}</div>}
                                            </div>
                                          ) : (
                                            s.note || '—'
                                          )}
                                        </td>
                                        {canEditShift && (
                                          <td>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                              <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px' }} onClick={() => openEditShift && openEditShift(s)} title="تعديل الوردية">✏️</button>
                                              <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--danger)' }} onClick={() => deleteShift && deleteShift(s.id)} title="حذف الوردية">🗑️</button>
                                            </div>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : isMobileScreen ? (
                /* 📱 MOBILE SHIFT CARDS - ZERO HORIZONTAL SCROLLBAR, ZERO NESTED SCROLLBAR */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                  {empShifts.length === 0 ? (
                    <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', fontSize: '13px' }}>
                      🎉 لا توجد ورديات مسجلة لهذا الشهر
                    </div>
                  ) : (
                    empShifts.map((s, idx) => {
                      const perm = isApprovedPermissionForDate(emp.id, s.date, state);
                      const hasPerm = s.hasApprovedPermission || !!perm;
                      const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);
                      const effHours = getEffectiveShiftHours(s, state);
                      const branchRate = (summary.perBranch?.[s.branchId]?.rate || summary.rate) || 0;

                      return (
                        <div
                          key={s.id}
                          style={{
                            background: hasPerm ? 'rgba(254, 243, 199, 0.3)' : 'var(--surface)',
                            border: hasPerm ? '1.5px solid #fcd34d' : '1px solid var(--border)',
                            borderRadius: '14px',
                            padding: '12px 14px',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}
                        >
                          {/* Top Row: Date, Day, Effective Hours & Gross Amount */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))', paddingBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--muted)', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>
                                #{idx + 1}
                              </span>
                              <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>
                                {s.date}
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                                ({arabicWeekday(s.date)})
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ background: 'var(--primary-light, #ccfbf1)', color: 'var(--primary-dark, #0f766e)', fontWeight: 800, fontSize: '12px', padding: '3px 8px', borderRadius: '8px' }}>
                                ⏱️ {fmt(effHours)} س
                              </span>
                              {canViewSalary && (
                                <span style={{ background: '#f0fdf4', color: '#15803d', fontWeight: 800, fontSize: '12px', padding: '3px 8px', borderRadius: '8px' }}>
                                  💵 {fmt(effHours * branchRate)} ج.م
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Badges Row (if any) */}
                          {(hasPerm || isShiftManualPunch(s) || s.overtimeStatus) && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {hasPerm && (
                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                                  ⏰ معدلة بإذن (+{permHours} س)
                                </span>
                              )}
                              {isShiftManualPunch(s) && (
                                <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                                  🖐️ بصمة يدوية معتمدة
                                </span>
                              )}
                              {s.overtimeStatus === 'approved' && (
                                <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                                  ⭐ إضافي معتمد (+{s.overtimeHours} س)
                                </span>
                              )}
                              {s.overtimeStatus === 'pending' && (
                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 6px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                                  ⏳ إضافي (+{s.overtimeHours} س) قيد المراجعة
                                </span>
                              )}
                            </div>
                          )}

                          {/* Timing Grid: Entry, Exit, Break */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: 'var(--surface-muted)', padding: '8px 10px', borderRadius: '10px' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 }}>🟢 الدخول</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--success, #16a34a)', marginTop: '2px', fontFamily: 'monospace' }}>
                                {s.timeIn || '—'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'center', borderRight: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }}>
                              <div style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 }}>🔴 الخروج</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--danger, #dc2626)', marginTop: '2px', fontFamily: 'monospace' }}>
                                {s.timeOut || '—'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 }}>☕ البريك</div>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                                {(s.breakHours || 0) > 0 ? `${fmt(s.breakHours)} س` : '—'}
                              </div>
                            </div>
                          </div>

                          {/* Notes & Actions */}
                          {(s.note || canEditShift) && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '11.5px', color: 'var(--muted)', paddingTop: '2px' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {s.note ? `📝 ${s.note}` : ''}
                              </span>
                              {canEditShift && (
                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                  <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px' }} onClick={() => openEditShift && openEditShift(s)} title="تعديل الوردية">✏️</button>
                                  <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--danger)' }} onClick={() => deleteShift && deleteShift(s.id)} title="حذف الوردية">🗑️</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Summary footer card on mobile */}
                  {empShifts.length > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, var(--surface), var(--surface-muted))', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                        📊 الإجمالي ({empShifts.length} وردية)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--primary-dark)' }}>
                          {fmt(summary.hours)} ساعة
                        </span>
                        {canViewSalary && (
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--success)' }}>
                            {fmt(summary.baseEarnings)} ج.م
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* 💻 Desktop Full Table */
                <div className="table-responsive" style={{ marginTop: '14px' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>التاريخ</th>
                        <th>اليوم</th>
                        <th>وقت الدخول</th>
                        <th>وقت الخروج</th>
                        <th>ساعات البريك</th>
                        <th>صافي ساعات العمل</th>
                        <th>المبلغ المستحق</th>
                        <th>الملاحظات</th>
                        {canEditShift && <th>الإجراءات</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {empShifts.length === 0 ? (
                        <tr className="empty-row">
                          <td colSpan={canEditShift ? 10 : 9}>لا توجد ورديات مسجلة لهذا الشهر</td>
                        </tr>
                      ) : (
                        empShifts.map((s, idx) => {
                          const perm = isApprovedPermissionForDate(emp.id, s.date, state);
                          const hasPerm = s.hasApprovedPermission || !!perm;
                          const permHours = s.permissionHours || perm?.hours || (perm?.durationMinutes ? Math.round((perm.durationMinutes / 60) * 100) / 100 : 0);

                          const effHours = getEffectiveShiftHours(s, state);

                          return (
                            <tr key={s.id} style={{ background: hasPerm ? 'rgba(254, 243, 199, 0.25)' : 'transparent' }}>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                              <td style={{ fontWeight: 600 }}>
                                {s.date}
                                {hasPerm && (
                                  <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                    ⏰ معدلة بإذن (+{permHours} س)
                                  </span>
                                )}
                                {isShiftManualPunch(s) && (
                                  <span style={{ display: 'block', marginTop: '2px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                    🖐️ بصمة يدوية معتمدة
                                  </span>
                                )}
                                {s.overtimeStatus === 'approved' && (
                                  <span style={{ display: 'block', marginTop: '2px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                    ⭐ وقت إضافي معتمد (+{s.overtimeHours} س)
                                  </span>
                                )}
                                {s.overtimeStatus === 'pending' && (
                                  <span style={{ display: 'block', marginTop: '2px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                    ⏳ إضافي (+{s.overtimeHours} س) بانتظار الاعتماد
                                  </span>
                                )}
                                {s.overtimeStatus === 'rejected' && (
                                  <span style={{ display: 'block', marginTop: '2px', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
                                    ❌ إضافي مستبعد
                                  </span>
                                )}
                              </td>
                              <td>{arabicWeekday(s.date)}</td>
                              <td><span className="ep-time-badge ep-time-in">{s.timeIn}</span></td>
                              <td><span className="ep-time-badge ep-time-out">{s.timeOut || '—'}</span></td>
                              <td>
                                {(s.breakHours || 0) > 0
                                  ? <span className="ep-break-badge">{fmt(s.breakHours)} س</span>
                                  : <span style={{ color: 'var(--text-muted)' }}>—</span>
                                }
                              </td>
                              <td className="money" style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>
                                {fmt(effHours)} ساعة
                                {hasPerm && permHours > 0 && (
                                  <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, marginTop: '2px' }}>
                                    (فعلي: {fmt(Math.max(0, effHours - permHours))} س + إذن: {fmt(permHours)} س)
                                  </div>
                                )}
                              </td>
                              <td className="money" style={{ color: 'var(--success)', fontWeight: 600 }}>
                                {canViewSalary ? `${fmt(effHours * (summary.perBranch?.[s.branchId]?.rate || summary.rate))} ج.م` : '🔒 مقيد'}
                              </td>
                              <td style={{ color: hasPerm ? '#047857' : 'var(--text-muted)', fontSize: '0.88rem' }}>
                                {hasPerm ? (
                                  <div>
                                    <span style={{ fontWeight: 700 }}>⏰ معدلة باحتساب ساعات الإذن المعتمد ({perm?.startTime || '—'} إلى {perm?.endTime || '—'})</span>
                                    {s.note && !s.note.includes('⏰ تم تعديل البصمة') && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.note}</div>}
                                  </div>
                                ) : (
                                  s.note || '—'
                                )}
                              </td>
                              {canEditShift && (
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px' }} onClick={() => openEditShift && openEditShift(s)} title="تعديل الوردية">✏️</button>
                                    <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--danger)' }} onClick={() => deleteShift && deleteShift(s.id)} title="حذف الوردية">🗑️</button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {empShifts.length > 0 && (
                      <tfoot>
                        <tr style={{ fontWeight: 700 }}>
                          <td colSpan="5" style={{ textAlign: 'right', paddingRight: '12px', color: 'var(--text-muted)' }}>
                            الإجمالي ({empShifts.length} وردية)
                          </td>
                          <td><span className="ep-break-badge">{fmt(empShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0))} س</span></td>
                          <td style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>{fmt(summary.hours)} ساعة</td>
                          <td style={{ color: 'var(--success)', fontWeight: 700 }}>{canViewSalary ? `${fmt(summary.baseEarnings)} ج.م` : '🔒 مقيد'}</td>
                          <td></td>
                          {canEditShift && <td></td>}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Salary Details ── */}
          {activeTab === 'salary' && (
            <div className="card ep-tab-content fade-in">
              <div className="ep-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <h3>💼 تفاصيل المرتب — {lbl.raw}</h3>
                {canViewSalary && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-start"
                      onClick={() => {
                        printEmployeePayslipDirect({
                          emp,
                          month: selectedMonth,
                          shifts: state.shifts || [],
                          adjustments: state.adjustments || [],
                          branches: state.branches || [],
                          orgSettings,
                          computeEmpSummary,
                          selectedBranchId: selectedBranchId || null,
                          state
                        });
                      }}
                      style={{ fontSize: '13px', padding: '6px 14px' }}
                    >
                      🖨️ طباعة كشف المرتب (PDF)
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowPrintModal(true)}
                      style={{ fontSize: '12.5px', padding: '6px 12px' }}
                    >
                      👁️ معاينة الكشف
                    </button>
                  </div>
                )}
              </div>

              <PayslipPrintModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                emp={emp}
                month={selectedMonth}
                shifts={state.shifts || []}
                adjustments={state.adjustments || []}
                branches={state.branches || []}
                orgSettings={orgSettings}
                computeEmpSummary={computeEmpSummary}
                selectedBranchId={selectedBranchId || null}
                state={state}
              />

              {!canViewSalary ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>تفاصيل الراتب مقيدة</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '420px', margin: '0 auto' }}>
                    تم تقييد إمكانية مشاهدة التفاصيل المالية والرواتب لهذا الحساب من قِبل إدارة المؤسسة.
                  </p>
                </div>
              ) : emp.branchesDetails && emp.branchesDetails.length > 1 && !selectedBranchId ? (
                /* Multi-branch breakdown when All Branches selected */
                <div className="ep-salary-breakdown">
                  {emp.branchesDetails.map((bd) => {
                    const bId = bd.branchId;
                    const bObj = (state.branches || []).find((b) => b.id === bId);
                    const bName = bObj ? bObj.name : `فرع ${bId}`;
                    const bSummary = summary.perBranch?.[bId] || { salary: bd.salary || 0, workHoursPerDay: bd.workHoursPerDay || 8, workDaysPerMonth: bd.workDaysPerMonth || 26, dailyRate: 0, rate: 0, hours: 0, baseEarnings: 0 };

                    return (
                      <div key={bId} style={{ marginBottom: '24px', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--surface-muted)' }}>
                        <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary-dark)', fontSize: '16px' }}>
                          📍 تفاصيل راتب فرع {bName}
                        </h4>
                        <div className="ep-breakdown-section">
                          <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⚙️</span>احتساب سعر الساعة وأجر اليوم بالفرع</div>
                          <div className="ep-breakdown-rows">
                            <div className="ep-breakdown-row"><span className="ep-breakdown-label">1. سعر الساعة الشهري بالفرع (المدخل من الإدارة)</span><span className="ep-breakdown-value">{fmt(bd.salary)} ج.م</span></div>
                            <div className="ep-breakdown-row"><span className="ep-breakdown-label">2. عدد ساعات عمل الموظف بالفرع</span><span className="ep-breakdown-value">{bd.workHoursPerDay || 8} ساعة / يوم</span></div>
                            <div className="ep-breakdown-row"><span className="ep-breakdown-label">3. عدد أيام عمل الموظف بالفرع</span><span className="ep-breakdown-value">{bd.workDaysPerMonth || 26} يوم / شهر</span></div>
                            <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">4. سعر اليوم = ({fmt(bd.salary)} × {bd.workHoursPerDay || 8}) ÷ {bd.workDaysPerMonth || 26}</span><span className="ep-breakdown-value highlight">{fmt(bSummary.dailyRate)} ج.م / يوم</span></div>
                            <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">5. سعر الساعة اليومي = {fmt(bSummary.dailyRate)} ÷ {bd.workHoursPerDay || 8}</span><span className="ep-breakdown-value highlight">{fmt(bSummary.rate || bd.salary)} ج.م / ساعة</span></div>
                            <div className="ep-breakdown-row"><span className="ep-breakdown-label">الراتب الأساسي الشهري بالفرع ({fmt(bSummary.dailyRate)} × {bd.workDaysPerMonth || 26} يوم)</span><span className="ep-breakdown-value">{fmt(bSummary.monthlySalary || ((parseFloat(bd.salary) || 0) * (parseFloat(bd.workHoursPerDay) || 8)))} ج.م</span></div>
                          </div>
                        </div>

                        <div className="ep-breakdown-section" style={{ marginTop: '12px' }}>
                          <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⏱️</span>ساعات العمل والمستحقات بالفرع</div>
                          <div className="ep-breakdown-rows">
                            <div className="ep-breakdown-row"><span className="ep-breakdown-label">عدد ساعات العمل الفعلية بالفرع</span><span className="ep-breakdown-value">{fmt(bSummary.hours)} ساعة</span></div>
                            <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">✅ المستحقات الأساسية للفرع</span><span className="ep-breakdown-value highlight">{fmt(bSummary.baseEarnings)} ج.م</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="ep-breakdown-section ep-breakdown-net-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">🏆</span>الملخص المالي الكلي لجميع الفروع</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">إجمالي المستحقات الأساسية لكافة الفروع</span><span className="ep-breakdown-value">{fmt(summary.baseEarnings)} ج.م</span></div>
                      {summary.totalAllowances > 0 && (
                        <div className="ep-breakdown-row" style={{ color: '#166534', fontWeight: 'bold' }}>
                          <span className="ep-breakdown-label">+ إجمالي البدلات الثابتة والأجور الإضافية</span>
                          <span className="ep-breakdown-value">+{fmt(summary.totalAllowances)} ج.م</span>
                        </div>
                      )}
                      <div className="ep-breakdown-row" style={{ color: 'var(--success)' }}><span className="ep-breakdown-label">+ إجمالي المكافآت ({bonuses.length} بند)</span><span className="ep-breakdown-value">+{fmt(summary.totalBonus)} ج.م</span></div>
                      <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- إجمالي الخصومات والجزاءات ({deductions.length} بند)</span><span className="ep-breakdown-value">-{fmt(summary.totalDeduction)} ج.م</span></div>
                      {summary.loansDeduction > 0 && (
                        <div className="ep-breakdown-row" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                          <span className="ep-breakdown-label">- إجمالي السلف وأقساط الشهر المعتمدة</span>
                          <span className="ep-breakdown-value">-{fmt(summary.loansDeduction)} ج.م</span>
                        </div>
                      )}
                      {absenceDays.length > 0 && (
                        <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- خصم الغياب الكلي ({absenceDays.length} يوم)</span><span className="ep-breakdown-value">-{fmt(absenceDeduction)} ج.م</span></div>
                      )}
                      <div className="ep-net-salary-box">
                        <div className="ep-net-label">إجمالي صافي المرتب المستحق لكافة الفروع</div>
                        <div className="ep-net-month">{lbl.arabic}</div>
                        <div className="ep-net-amount">{fmt(summary.netSalary)}<span className="ep-net-currency"> ج.م</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ep-salary-breakdown">
                  <div className="ep-breakdown-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⚙️</span>احتساب سعر الساعة وأجر اليوم وفق المعادلة المعتمدة</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">1. سعر الساعة الشهري (الراتب الأساسي المدخل من الإدارة)</span><span className="ep-breakdown-value">{fmt(currentHourlyRate)} ج.م</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">2. عدد ساعات عمل الموظف المدخلة من الإدارة</span><span className="ep-breakdown-value">{workHoursPerDay} ساعة / يوم</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">3. عدد أيام عمل الموظف المدخلة من الإدارة</span><span className="ep-breakdown-value">{workDaysPerMonth || 26} يوم / شهر</span></div>
                      <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">4. سعر اليوم = ({fmt(currentHourlyRate)} × {workHoursPerDay}) ÷ {workDaysPerMonth || 26}</span><span className="ep-breakdown-value highlight">{fmt(summary.dailyRate)} ج.م / يوم</span></div>
                      <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">5. سعر الساعة اليومي = {fmt(summary.dailyRate)} ÷ {workHoursPerDay}</span><span className="ep-breakdown-value highlight">{fmt(summary.rate || currentHourlyRate)} ج.م / ساعة</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">الراتب الأساسي الشهري المقدر ({fmt(summary.dailyRate)} × {workDaysPerMonth || 26} يوم)</span><span className="ep-breakdown-value">{fmt(currentMonthlySalary)} ج.م</span></div>
                    </div>
                  </div>

                  <div className="ep-breakdown-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⏱️</span>احتساب أجر اليوم / المستحقات الفعلية</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">عدد الساعات الموضوعة في الجدول الشهري / المسجلة</span><span className="ep-breakdown-value">{fmt(summary.hours)} ساعة</span></div>
                      <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">✅ أجر اليوم / المستحقات المعتمدة ({fmt(summary.rate || currentHourlyRate)} ج.م × {fmt(summary.hours)} ساعة)</span><span className="ep-breakdown-value highlight">{fmt(summary.baseEarnings)} ج.م</span></div>
                    </div>
                  </div>

                  {/* ── Allowances Detailed Section ── */}
                  {summary.totalAllowances > 0 && (
                    <div className="ep-breakdown-section" style={{ borderColor: '#86efac', background: '#f0fdf4' }}>
                      <div className="ep-breakdown-title" style={{ color: '#166534' }}>
                        <span className="ep-breakdown-icon">💼</span>تفاصيل البدلات الثابتة والأجور الإضافية
                      </div>
                      <div className="ep-breakdown-rows">
                        {summary.managementAllowance > 0 && (
                          <div className="ep-breakdown-row">
                            <span className="ep-breakdown-label">👔 بدل إدارة شهري معتمد ({emp.jobTitle})</span>
                            <span className="ep-breakdown-value" style={{ color: '#15803d', fontWeight: 'bold' }}>+{fmt(summary.managementAllowance)} ج.م</span>
                          </div>
                        )}
                        {summary.transportAllowance > 0 && (
                          <div className="ep-breakdown-row">
                            <span className="ep-breakdown-label">🚗 بدل انتقال ومواصلات شهري</span>
                            <span className="ep-breakdown-value" style={{ color: '#15803d', fontWeight: 'bold' }}>+{fmt(summary.transportAllowance)} ج.م</span>
                          </div>
                        )}
                        {Array.isArray(summary.extraAllowances) && summary.extraAllowances.length > 0 ? (
                          summary.extraAllowances.filter(a => (parseFloat(a.amount) || 0) > 0).map((a, i) => (
                            <div key={a.id || i} className="ep-breakdown-row">
                              <span className="ep-breakdown-label">🏷️ {a.title || 'أجر إضافي مخصص'}</span>
                              <span className="ep-breakdown-value" style={{ color: '#15803d', fontWeight: 'bold' }}>+{fmt(a.amount)} ج.م</span>
                            </div>
                          ))
                        ) : (
                          summary.extraAllowance > 0 && (
                            <div className="ep-breakdown-row">
                              <span className="ep-breakdown-label">🏷️ {summary.extraAllowanceTitle || 'أجر إضافي مخصص'}</span>
                              <span className="ep-breakdown-value" style={{ color: '#15803d', fontWeight: 'bold' }}>+{fmt(summary.extraAllowance)} ج.م</span>
                            </div>
                          )
                        )}
                        <div className="ep-breakdown-row ep-breakdown-result">
                          <span className="ep-breakdown-label">✅ إجمالي البدلات الثابتة المستحقة</span>
                          <span className="ep-breakdown-value highlight" style={{ color: '#166534' }}>+{fmt(summary.totalAllowances)} ج.م</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {absenceDays.length > 0 && (
                    <div className="ep-breakdown-section" style={{ borderColor: 'var(--danger)', background: 'rgba(239,68,68,0.04)' }}>
                      <div className="ep-breakdown-title" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-icon">🚫</span>خصم الغيابات ({absenceDays.length} يوم)</div>
                      <div className="ep-breakdown-rows">
                        <div className="ep-breakdown-row"><span className="ep-breakdown-label">عدد أيام الغياب</span><span className="ep-breakdown-value" style={{ color: 'var(--danger)' }}>{absenceDays.length} يوم</span></div>
                        <div className="ep-breakdown-row"><span className="ep-breakdown-label">سعر اليوم</span><span className="ep-breakdown-value">{fmt(dailyRate)} ج.م</span></div>
                        <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">🚫 إجمالي خصم الغياب</span><span className="ep-breakdown-value" style={{ color: 'var(--danger)' }}>-{fmt(absenceDeduction)} ج.م</span></div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '4px 0' }}>ملاحظة: يُلغى هذا الخصم تلقائياً عند اعتماد طلب إجازة لأي يوم غياب.</div>
                      </div>
                    </div>
                  )}

                  <div className="ep-breakdown-section ep-breakdown-net-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">🏆</span>الملخص المالي النهائي</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">المستحقات الأساسية</span><span className="ep-breakdown-value">{fmt(summary.baseEarnings)} ج.م</span></div>
                      {summary.totalAllowances > 0 && (
                        <div className="ep-breakdown-row" style={{ color: '#166534', fontWeight: 'bold' }}>
                          <span className="ep-breakdown-label">+ إجمالي البدلات الثابتة</span>
                          <span className="ep-breakdown-value">+{fmt(summary.totalAllowances)} ج.م</span>
                        </div>
                      )}
                      <div className="ep-breakdown-row" style={{ color: 'var(--success)' }}><span className="ep-breakdown-label">+ المكافآت ({bonuses.length} بند)</span><span className="ep-breakdown-value">+{fmt(summary.totalBonus)} ج.م</span></div>
                      {summary.lateDeduction > 0 && (
                        <div className="ep-breakdown-row" style={{ color: '#ea580c', fontWeight: 'bold' }}>
                          <span className="ep-breakdown-label">- خصم التأخيرات اللائحية ({summary.lateIncidentsCount} مرة / {summary.lateDeductionMinutes} دقيقة)</span>
                          <span className="ep-breakdown-value">-{fmt(summary.lateDeduction)} ج.م</span>
                        </div>
                      )}
                      {absenceDays.length > 0 && (
                        <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- خصم الغياب ({absenceDays.length} يوم)</span><span className="ep-breakdown-value">-{fmt(absenceDeduction)} ج.م</span></div>
                      )}
                      <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- إجمالي الخصومات والجزاءات ({deductions.length} بند)</span><span className="ep-breakdown-value">-{fmt(summary.totalDeduction)} ج.م</span></div>
                      {summary.loansDeduction > 0 && (
                        <div className="ep-breakdown-row" style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                          <span className="ep-breakdown-label">- إجمالي السلف وأقساط الشهر المعتمدة</span>
                          <span className="ep-breakdown-value">-{fmt(summary.loansDeduction)} ج.م</span>
                        </div>
                      )}
                      <div className="ep-net-salary-box">
                        <div className="ep-net-label">صافي المرتب المستحق</div>
                        <div className="ep-net-month">{lbl.arabic}</div>
                        <div className="ep-net-amount">{fmt(summary.netSalary)}<span className="ep-net-currency"> ج.م</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Adjustments ── */}
          {activeTab === 'adjustments' && (
            <div className="card ep-tab-content fade-in">
              <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3>📝 تفاصيل المكافآت والخصومات — {lbl.raw}</h3>
                  {canViewAdjustments && <span className="ep-count-badge">{empAdjs.length} بند</span>}
                </div>
                {canAddAdjustment && (
                  <button className="btn btn-start" onClick={() => setShowAdjForm(!showAdjForm)} style={{ fontSize: '13px', padding: '6px 14px' }}>
                    {showAdjForm ? '✕ إغلاق النموذج' : '+ إضافة تسوية / مكافأة / خصم'}
                  </button>
                )}
              </div>

              {!canViewAdjustments ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>عرض المكافآت والخصومات مقيد</h3>
                </div>
              ) : (
                <>
                  {canAddAdjustment && showAdjForm && (
                    <div className="card settings-card fade-in" style={{ marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--primary-tint)', padding: '16px' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>📝 إضافة تسوية مالية جديدة</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                        <div className="field" style={{ flex: '1 1 120px' }}>
                          <label>نوع التسوية</label>
                          <select value={empAdjType} onChange={(e) => setEmpAdjType(e.target.value)}>
                            <option value="bonus">🎁 مكافأة (+)</option>
                            <option value="deduction">✂️ خصم (-)</option>
                          </select>
                        </div>
                        <div className="field" style={{ flex: '1 1 120px' }}>
                          <label>المبلغ (ج.م)</label>
                          <input type="number" min="1" placeholder="مثال: 150" value={empAdjAmount} onChange={(e) => setEmpAdjAmount(e.target.value)} />
                        </div>
                        <div className="field" style={{ flex: '1 1 130px' }}>
                          <label>التاريخ</label>
                          <input type="date" value={empAdjDate} onChange={(e) => setEmpAdjDate(e.target.value)} />
                        </div>
                        <div className="field grow" style={{ flex: '2 1 160px' }}>
                          <label>البيان / السبب</label>
                          <input type="text" placeholder="مثال: مكافأة تميز..." value={empAdjDesc} onChange={(e) => setEmpAdjDesc(e.target.value)} />
                        </div>
                        <button className="btn btn-start" onClick={handleEmpAddAdjustment} style={{ height: '38px', padding: '0 18px', whiteSpace: 'nowrap' }}>
                          💾 إضافة التسوية
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '16px' }}>
                    <div className="ep-adj-sub-title" style={{ color: 'var(--success)' }}>🎁 المكافآت ({bonuses.length})</div>
                    {bonuses.length === 0 ? (
                      <p className="ep-empty-msg">لا توجد مكافآت مسجلة لهذا الشهر</p>
                    ) : isMobileScreen ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {bonuses.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid rgba(22,163,74,0.2)',
                              borderRadius: '12px',
                              padding: '12px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>
                                {a.reason || a.description || a.notes || a.details || 'مكافأة'}
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>📅 {a.date}</span>
                            </div>
                            <div style={{ color: 'var(--success)', fontWeight: 800, fontSize: '14px' }}>
                              +{fmt(a.amount)} ج.م
                            </div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-muted)', borderRadius: '10px', fontWeight: 800 }}>
                          <span>إجمالي المكافآت:</span>
                          <span style={{ color: 'var(--success)', fontSize: '15px' }}>+{fmt(bonuses.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0))} ج.م</span>
                        </div>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table>
                          <thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان / السبب</th></tr></thead>
                          <tbody>
                            {bonuses.map((a) => (
                              <tr key={a.id}>
                                <td>{a.date}</td>
                                <td className="money" style={{ color: 'var(--success)', fontWeight: 700 }}>+{fmt(a.amount)} ج.م</td>
                                <td>{a.reason || a.description || a.notes || a.details || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td>الإجمالي</td>
                              <td style={{ color: 'var(--success)' }}>+{fmt(bonuses.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0))} ج.م</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '28px' }}>
                    <div className="ep-adj-sub-title" style={{ color: 'var(--danger)' }}>✂️ الخصومات ({deductions.length})</div>
                    {deductions.length === 0 ? (
                      <p className="ep-empty-msg">لا توجد خصومات مسجلة لهذا الشهر</p>
                    ) : isMobileScreen ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {deductions.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid rgba(220,38,38,0.2)',
                              borderRadius: '12px',
                              padding: '12px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>
                                {a.reason || a.description || a.notes || a.details || 'خصم'}
                              </div>
                              <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>📅 {a.date}</span>
                            </div>
                            <div style={{ color: 'var(--danger)', fontWeight: 800, fontSize: '14px' }}>
                              -{fmt(a.amount)} ج.م
                            </div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-muted)', borderRadius: '10px', fontWeight: 800 }}>
                          <span>إجمالي الخصومات:</span>
                          <span style={{ color: 'var(--danger)', fontSize: '15px' }}>-{fmt(deductions.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0))} ج.م</span>
                        </div>
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table>
                          <thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان / السبب</th></tr></thead>
                          <tbody>
                            {deductions.map((a) => (
                              <tr key={a.id}>
                                <td>{a.date}</td>
                                <td className="money" style={{ color: 'var(--danger)', fontWeight: 700 }}>-{fmt(a.amount)} ج.م</td>
                                <td>{a.reason || a.description || a.notes || a.details || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td>الإجمالي</td>
                              <td style={{ color: 'var(--danger)' }}>-{fmt(deductions.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0))} ج.م</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── 4. Tab: Leaves ── */}
          {activeTab === 'leaves' && (
            <EmployeeLeaveModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedMonth={selectedMonth}
              selectedBranchId={selectedBranchId || null}
            />
          )}

          {/* ── 5. Tab: Loans ── */}
          {activeTab === 'loans' && (
            <EmployeeLoansModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedBranchId={selectedBranchId || null}
            />
          )}

          {/* ── 6. Tab: Permissions ── */}
          {activeTab === 'permissions' && (
            <EmployeePermissionsModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedBranchId={selectedBranchId || null}
            />
          )}

          {/* ── 8. Tab: Monthly Roster ── */}
          {activeTab === 'roster' && (
            <EmployeeRosterModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedMonth={selectedMonth}
              selectedBranchId={selectedBranchId || null}
              autoOpenRosterModal={autoOpenRosterModal}
              setAutoOpenRosterModal={setAutoOpenRosterModal}
            />
          )}

          {/* ── 9. Tab: Shift Swaps ── */}
          {activeTab === 'swaps' && (
            <EmployeeShiftSwapModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedMonth={selectedMonth}
              selectedBranchId={selectedBranchId || null}
            />
          )}

          {/* ── 10. Tab: Evaluations ── */}
          {activeTab === 'evaluations' && (
            <EmployeeEvaluationsModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedMonth={selectedMonth}
            />
          )}

          {/* ── 11. Tab: Work Bylaws ── */}
          {activeTab === 'bylaws' && (
            <BylawsModule
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              userRole="employee"
              currentEmpId={emp.id}
              currentBranchId={selectedBranchId || emp.branchId}
              monthPicker={selectedMonth}
              filterFn={filterFn}
            />
          )}

          {/* ── 12. Tab: Resignations ── */}
          {activeTab === 'resignations' && (
            <EmployeeResignationModule
              emp={emp}
              state={state}
              setState={setState}
              saveState={saveState}
              showToast={showToast}
              selectedBranchId={selectedBranchId || null}
            />
          )}

          {/* ── 13. Tab: Biometric (البصمة الإلكترونية) ── */}
          {activeTab === 'biometric' && (
            <EmployeeBiometricSection
              employee={emp}
              state={state}
              onRequestRegister={() => setShowBiometricRegisterModal(true)}
              onRequestTest={() => setShowBiometricTestModal(true)}
              onSubmitResetRequest={handleSubmitResetRequest}
              showToast={showToast}
            />
          )}
        </main>

        {/* ── Payslip Print Modal (Global to portal) ── */}
        <PayslipPrintModal
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
          emp={emp}
          month={selectedMonth}
          shifts={state.shifts || []}
          adjustments={state.adjustments || []}
          branches={state.branches || []}
          orgSettings={orgSettings}
          computeEmpSummary={computeEmpSummary}
          selectedBranchId={selectedBranchId || null}
          state={state}
        />

        {/* ── Biometric Self-Registration Modal ── */}
        {showBiometricRegisterModal && (
          <FaceRegistrationModal
            employee={emp}
            onClose={() => setShowBiometricRegisterModal(false)}
            onSuccess={handleRegisterBiometricSuccess}
            biometricType={emp.preferred_biometric || orgSettings?.biometricType || state?.orgSettings?.biometricType || 'face'}
          />
        )}

        {/* ── Biometric Live Matching Test Modal ── */}
        {showBiometricTestModal && (
          <FaceTestModal
            employee={emp}
            onClose={() => setShowBiometricTestModal(false)}
            biometricType={emp.preferred_biometric || orgSettings?.biometricType || state?.orgSettings?.biometricType || 'face'}
          />
        )}

        {/* ── Export Modal ── */}
        {showExportModal && (
          <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
            <div className="modal-card" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
              <div className="badge-header">
                <h3>📥 تصدير كشف المرتب — {emp.name}</h3>
                <button className="close-btn" onClick={() => setShowExportModal(false)}>✕</button>
              </div>
              <div style={{ padding: '20px 0 8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="field">
                  <label>نوع التصدير</label>
                  <select value={exportRangeMode} onChange={(e) => setExportRangeMode(e.target.value)}>
                    <option value="month">الشهر المحدد حالياً ({lbl.arabic})</option>
                    <option value="custom">فترة مخصصة</option>
                  </select>
                </div>
                {exportRangeMode === 'custom' && (
                  <>
                    <div className="field"><label>تاريخ البداية</label><input type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} /></div>
                    <div className="field"><label>تاريخ النهاية</label><input type="date" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} /></div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="btn btn-ghost" onClick={() => setShowExportModal(false)}>إلغاء</button>
                <button className="btn btn-start" onClick={handleExportSubmit} disabled={exporting}>
                  {exporting ? '⏳ جاري التصدير...' : '📥 تصدير الملف'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Employee Profile Photo Preview Lightbox Modal ── */}
        {showPhotoPreview && (emp?.photoUrl || emp?.photo) && (
          <div
            className="modal-backdrop"
            style={{
              zIndex: 1500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              padding: '20px'
            }}
            onClick={() => setShowPhotoPreview(false)}
          >
            <div
              className="modal-content"
              style={{
                maxWidth: '460px',
                width: '100%',
                background: 'var(--surface)',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--border)',
                animation: 'scaleUp 0.2s ease-out'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-muted)'
              }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                    👤 {getEmpDisplayName(emp)}
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    كود: {emp.code} · {emp.jobTitle}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowPhotoPreview(false)}
                  style={{ fontSize: '16px', padding: '4px 10px', borderRadius: '8px' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '16px', textAlign: 'center', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px' }}>
                <img
                  src={emp.photoUrl || emp.photo}
                  alt={getEmpDisplayName(emp)}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '420px',
                    objectFit: 'contain',
                    borderRadius: '12px'
                  }}
                />
              </div>

              <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  📍 {state.branches?.find(b => b.id === emp.branchId)?.name || 'الفرع الرئيسي'}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowPhotoPreview(false)}
                  style={{ fontSize: '12.5px', fontWeight: 'bold' }}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
