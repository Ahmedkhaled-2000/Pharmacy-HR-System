import React, { useState, useEffect, useMemo } from 'react';
import { AR_MONTHS, arabicWeekday, todayStr, fmt, arabicMonthLabel } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';

import EmployeeLeaveModule from './EmployeeLeaveModule';
import EmployeeLoansModule from './EmployeeLoansModule';
import EmployeePermissionsModule from './EmployeePermissionsModule';
import EmployeeRosterModule from './EmployeeRosterModule';
import EmployeeShiftSwapModule from './EmployeeShiftSwapModule';
import EmployeeEvaluationsModule from './EmployeeEvaluationsModule';
import PayslipPrintModal from '../payroll/PayslipPrintModal';

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

const CURRENT_MONTH = todayStr().slice(0, 7);

// Arabic weekday name => JS getDay() index mapping
const WEEKDAY_AR_MAP = {
  'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3,
  'الخميس': 4, 'الجمعة': 5, 'السبت': 6
};

// ─────────────────────────────────────────
//  Summary Card
// ─────────────────────────────────────────
function SummaryCard({ icon, label, value, colorVar, sub }) {
  return (
    <div className="ep-summary-card">
      <div className="ep-summary-icon">{icon}</div>
      <div className="ep-summary-body">
        <div className="ep-summary-label">{label}</div>
        <div className="ep-summary-value" style={colorVar ? { color: `var(${colorVar})` } : {}}>
          {value}
        </div>
        {sub && <div className="ep-summary-sub">{sub}</div>}
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
  { id: 'roster',      icon: '🗓️', label: 'الجدول الشهري' },
  { id: 'swaps',       icon: '🔄', label: 'تبديل الشيفتات' },
  { id: 'evaluations', icon: '⭐', label: 'التقييمات والشكاوي' },
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
  deleteShift
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    try { return localStorage.getItem('emp_selected_month') || CURRENT_MONTH; } catch { return CURRENT_MONTH; }
  });
  const [activeTab, setActiveTab] = useState('dashboard');
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

  useEffect(() => { try { localStorage.setItem('emp_selected_month', selectedMonth); } catch {} }, [selectedMonth]);
  useEffect(() => { try { localStorage.setItem('emp_filter_mode', filterMode); } catch {} }, [filterMode]);
  useEffect(() => { try { localStorage.setItem('emp_range_start', rangeStart); } catch {} }, [rangeStart]);
  useEffect(() => { try { localStorage.setItem('emp_range_end', rangeEnd); } catch {} }, [rangeEnd]);

  // ── Form States for Employee Actions ───────────
  const [showManualForm, setShowManualForm] = useState(false);
  const [empManualDate, setEmpManualDate] = useState(todayStr());
  const [empManualIn, setEmpManualIn] = useState('');
  const [empManualOut, setEmpManualOut] = useState('');
  const [empManualBreak, setEmpManualBreak] = useState('0');
  const [empManualNote, setEmpManualNote] = useState('');

  const [showAdjForm, setShowAdjForm] = useState(false);
  const [empAdjType, setEmpAdjType] = useState('bonus');
  const [empAdjAmount, setEmpAdjAmount] = useState('');
  const [empAdjDate, setEmpAdjDate] = useState(todayStr());
  const [empAdjDesc, setEmpAdjDesc] = useState('');

  // ── Export Excel ──────────────────────────────
  const exportToExcel = async (rangeMode = 'month', customStart = '', customEnd = '') => {
    if (!currentEmpUser) return;
    const empObj = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;
    const canExport = getEmpPermission ? getEmpPermission(empObj.id, 'allowExportExcel') : true;
    if (!canExport) {
      showToast('❌ تم تقييد الصلاحيات: ليس لديك صلاحية لتصدير شيت الإكسل');
      return;
    }
    setExporting(true);
    try {
      const emp = empObj;
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

      const summary = computeEmpSummary(emp.id, filterFn, rangeMode === 'month' ? selectedMonth : null);
      const COLS = 9;

      const wb = new ExcelJS.Workbook();
      wb.creator = (orgSettings && orgSettings.orgName) || 'نظام البصمات';
      wb.created = new Date();
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
          dataRow(ws, r, [
            s.date, arabicWeekday(s.date), s.timeIn, s.timeOut || '—',
            s.breakHours ? fmt(s.breakHours) : '—', fmt(s.hours),
            fmt(summary.rate), fmt(s.hours * summary.rate), s.note || '—'
          ], 1, [4, 5, 6, 7]);
          r++;
        });
      }

      r += 1;
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
      tableHeaderRow(ws, r, ['سعر الساعة الشهرية', 'إجمالي الساعات', 'مستحقات الأساسي', 'إجمالي المكافآت', 'إجمالي الخصومات', 'صافي المرتب النهائي'], 1);
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
      date: empAdjDate || todayStr(),
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
  //  Unauthenticated Login Form
  // ─────────────────────────────────────────
  if (!currentEmpUser) {
    return (
      <div className="employee-view fade-in">
        <div className="emp-login-container card">
          <div className="emp-login-head">
            <div className="user-icon">👤</div>
            <h2>بوابة الموظف الذاتية</h2>
            <p>أدخل كود الموظف وكلمة السر الخاصة بك لمتابعة البصمات والرواتب</p>
          </div>

          <form onSubmit={handleEmpLogin} className="emp-login-form">
            <div className="field">
              <label>كود الموظف أو اسم المستخدم</label>
              <input
                type="text"
                placeholder="مثال: 101"
                value={empLoginCode}
                onChange={(e) => setEmpLoginCode(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>كلمة السر</label>
              <input
                type="password"
                placeholder="••••••••"
                value={empLoginPassword}
                onChange={(e) => setEmpLoginPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-start" style={{ width: '100%', marginTop: '10px' }}>
              تسجيل الدخول لبوابة الموظف
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  //  Logged-in Portal
  // ─────────────────────────────────────────
  const emp = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;

  const canViewSalary = getEmpPermission ? getEmpPermission(emp.id, 'allowViewSalary') : true;
  const canStartEnd = getEmpPermission ? getEmpPermission(emp.id, 'allowStartEnd') : true;
  const canManualShift = getEmpPermission ? getEmpPermission(emp.id, 'allowManualShift') : true;
  const canEditShift = getEmpPermission ? getEmpPermission(emp.id, 'allowEditShift') : true;
  const canAddAdjustment = getEmpPermission ? getEmpPermission(emp.id, 'allowAddAdjustment') : false;
  const canViewAdjustments = getEmpPermission ? getEmpPermission(emp.id, 'allowViewAdjustments') : true;
  const canExportExcel = getEmpPermission ? getEmpPermission(emp.id, 'allowExportExcel') : true;

  const rangeFilterValid = filterMode === 'range' && rangeStart && rangeEnd && rangeStart <= rangeEnd;
  const filterFn = rangeFilterValid
    ? (d) => d >= rangeStart && d <= rangeEnd
    : (d) => d.startsWith(selectedMonth);

  const lbl = monthLabel(selectedMonth);
  const periodLabel = rangeFilterValid ? `من ${rangeStart} إلى ${rangeEnd}` : lbl.raw;

  const summary = computeEmpSummary(emp.id, filterFn, filterMode === 'month' ? selectedMonth : null);

  const empShifts = state.shifts
    .filter((s) => s.employeeId === emp.id && filterFn(s.date))
    .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)));

  const empAdjs = state.adjustments.filter(
    (a) => (a.employeeId === emp.id || a.employeeId === 'all') && filterFn(a.date)
  );

  const bonuses = empAdjs.filter((a) => a.type === 'bonus');
  const deductions = empAdjs.filter((a) => a.type === 'deduction');

  const workHoursPerDay = emp.workHoursPerDay || 8;
  const workDaysPerMonth = emp.workDaysPerMonth || 26;
  const monthlyRequiredHours = workHoursPerDay * workDaysPerMonth;

  // ── Compute automatic absence shifts for the selected month ──
  // Find approved roster to detect work days
  const approvedRoster = (state.rosters || []).find(
    (r) => r.employeeId === emp.id && r.month === selectedMonth && r.status === 'approved'
  );

  // Build list of absence days (work day in roster, no punch recorded, not a leave day)
  const absenceDays = useMemo(() => {
    if (!approvedRoster?.schedule) return [];
    const [y, mo] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    const today = todayStr();
    const results = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (dateStr > today) continue; // future days

      const jsDay = new Date(dateStr).getDay();
      const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
      const daySchedule = approvedRoster.schedule[arDayName];

      if (!daySchedule || daySchedule.type === 'off') continue; // rest day

      // Check if there's a punch for this day
      const hasPunch = state.shifts.some(s => s.employeeId === emp.id && s.date === dateStr);
      if (hasPunch) continue;

      // Check if there's an approved leave for this day
      const hasLeave = (state.leaveRequests || state.requests || []).some(
        r => r.employeeId === emp.id
          && r.status === 'approved'
          && (r.type === 'leave' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave')
          && r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;

      results.push({ date: dateStr, arDayName, daySchedule });
    }
    return results;
  }, [approvedRoster, state.shifts, state.leaveRequests, state.requests, selectedMonth, emp.id]);

  // Absence deduction from computeEmpSummary
  const dailyRate = summary.dailyRate || 0;
  const absenceDeduction = summary.absenceDeduction || 0;

  // ── Inline Sidebar Nav + Main Content Layout ──
  return (
    <div className="ep-layout" style={{
      display: 'flex',
      gap: 0,
      minHeight: '80vh',
      background: 'var(--background)',
      borderRadius: '16px',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)'
    }}>

      {/* ── Sidebar ── */}
      <aside
        className="ep-sidebar"
        style={{
          width: sidebarOpen ? '220px' : '60px',
          minWidth: sidebarOpen ? '220px' : '60px',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s ease, min-width 0.25s ease',
          overflow: 'hidden',
          flexShrink: 0
        }}
      >
        {/* Sidebar Header (Employee Info) */}
        <div style={{
          padding: sidebarOpen ? '18px 16px 14px' : '18px 8px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'nowrap',
          overflow: 'hidden'
        }}>
          <div
            className="emp-avatar-circle"
            style={{ width: '40px', height: '40px', fontSize: '18px', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => setSidebarOpen(v => !v)}
            title={sidebarOpen ? 'طيّ القائمة' : 'توسيع القائمة'}
          >
            {emp.photoUrl
              ? <img src={emp.photoUrl} alt={emp.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : <span>{emp.name.charAt(0)}</span>
            }
          </div>
          {sidebarOpen && (
            <div style={{ overflow: 'hidden', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {emp.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {emp.jobTitle} · {emp.code}
              </div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            // Badge count
            let badge = 0;
            if (item.id === 'adjustments') badge = empAdjs.length;
            if (item.id === 'shifts') badge = empShifts.length;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: sidebarOpen ? '10px 16px' : '10px',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text)',
                  border: 'none',
                  borderRadius: '0',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 700 : 500,
                  transition: 'background 0.15s, color 0.15s',
                  textAlign: 'right',
                  position: 'relative',
                  borderRight: isActive ? '3px solid var(--primary-dark)' : '3px solid transparent',
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--hover)'; } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
              >
                <span style={{ fontSize: '17px', flexShrink: 0 }}>{item.icon}</span>
                {sidebarOpen && (
                  <>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    {badge > 0 && (
                      <span style={{ background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--primary)', color: isActive ? '#fff' : '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', flexShrink: 0 }}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Export button */}
          <button
            onClick={() => {
              if (!canExportExcel) { showToast('❌ تصدير Excel مقيد من الأدمن'); return; }
              setShowExportModal(true);
            }}
            title="تصدير كشف المرتب Excel"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              padding: sidebarOpen ? '8px 12px' : '8px',
              background: 'var(--surface-muted)', border: '1px solid var(--border)',
              borderRadius: '8px', cursor: canExportExcel ? 'pointer' : 'not-allowed',
              opacity: canExportExcel ? 1 : 0.5, fontSize: '12.5px', color: 'var(--text)'
            }}
          >
            <span>📥</span>
            {sidebarOpen && <span>تصدير Excel</span>}
          </button>

          {/* Logout button */}
          <button
            onClick={() => setCurrentEmpUser(null)}
            title="تسجيل الخروج"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              justifyContent: sidebarOpen ? 'flex-start' : 'center',
              padding: sidebarOpen ? '8px 12px' : '8px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--danger)'
            }}
          >
            <span>🚪</span>
            {sidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', fontSize: '16px', color: 'var(--text)' }}
            title={sidebarOpen ? 'إخفاء القائمة' : 'إظهار القائمة'}
          >
            ☰
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
              {NAV_ITEMS.find(n => n.id === activeTab)?.icon}{' '}
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </h2>
          </div>
          {/* Month selector in top bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="month-nav-btn" onClick={() => setSelectedMonth(prevMonth(selectedMonth))} title="الشهر السابق">‹</button>
            <input
              type="month"
              value={selectedMonth}
              max={CURRENT_MONTH}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
            />
            <button
              className="month-nav-btn"
              onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
              disabled={selectedMonth === CURRENT_MONTH}
              style={{ opacity: selectedMonth === CURRENT_MONTH ? 0.4 : 1 }}
            >›</button>
            {selectedMonth !== CURRENT_MONTH && (
              <button className="emp-month-today-btn" onClick={() => setSelectedMonth(CURRENT_MONTH)}>⟳ الحالي</button>
            )}
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

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
                  <div style={{
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
                    flexShrink: 0
                  }}>
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
                      {state.activeShifts[emp.id] ? (
                        state.activeShifts[emp.id].isPaused ? (
                          <span className="badge warning">في استراحة بريك</span>
                        ) : (
                          <span className="badge success">على رأس العمل</span>
                        )
                      ) : (
                        <span className="badge secondary">خارج الشيفت</span>
                      )}
                    </h3>
                    <p style={{ margin: '6px 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                      {state.activeShifts[emp.id]
                        ? `زمن الوردية الحالي: ${getActiveElapsedStr ? getActiveElapsedStr(emp.id) : '—'} ${state.activeShifts[emp.id].isPaused ? `(استراحة: ${getActiveBreakStr ? getActiveBreakStr(emp.id) : '0'})` : ''}`
                        : canStartEnd
                          ? 'يمكنك بدء وردية عملك وتوثيق الحضور والانصراف المباشر بنقرة واحدة'
                          : '🔒 صلاحية بدء الوردية من هذه الصفحة مقيدة — استخدم صفحة البصمة الإلكترونية'}
                    </p>
                  </div>

                  {/* Show shift buttons only when canStartEnd is true */}
                  {canStartEnd && (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {!state.activeShifts[emp.id] ? (
                        <button className="btn btn-start" onClick={() => startShift && startShift(emp.id)}>
                          ▶ بدء الوردية الآن
                        </button>
                      ) : (
                        <>
                          {state.activeShifts[emp.id].isPaused ? (
                            <button className="btn btn-start" onClick={() => resumeShift && resumeShift(emp.id)}>
                              ▶ استئناف العمل
                            </button>
                          ) : (
                            <button className="btn btn-pause" onClick={() => pauseShift && pauseShift(emp.id)}>
                              ☕ بريك
                            </button>
                          )}
                          <button className="btn btn-stop" onClick={() => stopShift && stopShift(emp.id)}>
                            ⏹ إنهاء الوردية
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

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

              {/* Period filter */}
              <div className="ep-period-bar card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)', padding: '6px 14px', borderRadius: '99px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--muted)' }}>📅 تصفية الفترة:</span>

                  <select
                    value={filterMode}
                    onChange={(e) => {
                      setFilterMode(e.target.value);
                      if (e.target.value === 'month') { setRangeStart(''); setRangeEnd(''); }
                    }}
                    style={{ padding: '6px 12px', borderRadius: '99px', fontSize: '13px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
                  >
                    <option value="month">الشهر الحالي ({selectedMonth})</option>
                    <option value="range">فترة مخصصة</option>
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
              <div className="ep-summary-grid">
                <SummaryCard icon="⏱️" label="إجمالي ساعات العمل" value={`${fmt(summary.hours)} ساعة`} sub={`من أصل ${monthlyRequiredHours} ساعة مطلوبة`} />
                <SummaryCard icon="💰" label="سعر الساعة الشهري" value={`${fmt(emp.salary || 0)} ج.م`} sub="سعر الساعة المُدخل من الأدمن" />
                <SummaryCard icon="💵" label="سعر الساعة المحسوب" value={`${fmt(summary.rate)} ج.م`} sub={canViewSalary ? `الراتب الأساسي: ${fmt(emp.salary)} ج.م` : 'أجر الساعة اليومي'} />
                <SummaryCard icon="💰" label="المستحقات الأساسية" value={canViewSalary ? `${fmt(summary.baseEarnings)} ج.م` : '🔒 مقيد'} />
                <SummaryCard icon="🎁" label="إجمالي المكافآت" value={canViewAdjustments ? `+${fmt(summary.totalBonus)} ج.م` : '🔒 مقيد'} colorVar="--success" />
                <SummaryCard icon="✂️" label="إجمالي الخصومات" value={canViewAdjustments ? `-${fmt(summary.totalDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" />
                {absenceDays.length > 0 && (
                  <SummaryCard icon="🚫" label={`خصم الغياب (${absenceDays.length} يوم)`} value={canViewSalary ? `-${fmt(absenceDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" sub="يُلغى عند اعتماد إجازة" />
                )}
                <SummaryCard icon="🏆" label={`صافي المرتب — ${lbl.arabic}`} value={canViewSalary ? `${fmt(summary.netSalary)} ج.م` : '🔒 مقيد'} colorVar="--primary" />
              </div>
            </div>
          )}

          {/* ── Tab: Shifts ── */}
          {activeTab === 'shifts' && (
            <div className="card ep-tab-content fade-in">
              <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3>📋 سجل البصمات والورديات — {lbl.raw}</h3>
                  <span className="ep-count-badge">{empShifts.length} وردية</span>
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
                <div style={{ margin: '16px 0', padding: '12px 16px', background: 'rgba(239,68,68,0.07)', border: '1px dashed rgba(239,68,68,0.4)', borderRadius: '10px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '13px', marginBottom: '8px' }}>
                    🚫 أيام الغياب التلقائية المحسوبة ({absenceDays.length} يوم)
                  </div>
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
                            <td>{ab.daySchedule?.start} – {ab.daySchedule?.end}</td>
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
                </div>
              )}

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
                      empShifts.map((s, idx) => (
                        <tr key={s.id}>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{s.date}</td>
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
                            {fmt(s.hours)} ساعة
                          </td>
                          <td className="money" style={{ color: 'var(--success)', fontWeight: 600 }}>
                            {canViewSalary ? `${fmt(s.hours * summary.rate)} ج.م` : '🔒 مقيد'}
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{s.note || '—'}</td>
                          {canEditShift && (
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px' }} onClick={() => openEditShift && openEditShift(s)} title="تعديل الوردية">✏️</button>
                                <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: '12px', color: 'var(--danger)' }} onClick={() => deleteShift && deleteShift(s.id)} title="حذف الوردية">🗑️</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
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
            </div>
          )}

          {/* ── Tab: Salary Details ── */}
          {activeTab === 'salary' && (
            <div className="card ep-tab-content fade-in">
              <div className="ep-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>💼 تفاصيل المرتب — {lbl.raw}</h3>
                {canViewSalary && (
                  <button className="btn btn-start" onClick={() => setShowPrintModal(true)} style={{ fontSize: '13px', padding: '6px 14px' }}>
                    📄 تصدير PDF / طباعة كشف المرتب
                  </button>
                )}
              </div>

              <PayslipPrintModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                emp={emp}
                month={selectedMonth}
                shifts={state.shifts || []}
                adjustments={state.adjustments || []}
                orgSettings={orgSettings}
              />

              {!canViewSalary ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '16px' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
                  <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>تفاصيل الراتب مقيدة</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '420px', margin: '0 auto' }}>
                    تم تقييد إمكانية مشاهدة التفاصيل المالية والرواتب لهذا الحساب من قِبل إدارة المؤسسة.
                  </p>
                </div>
              ) : (
                <div className="ep-salary-breakdown">
                  <div className="ep-breakdown-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⚙️</span>احتساب سعر الساعة اليومي</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">سعر الساعة الشهرية (الراتب الأساسي)</span><span className="ep-breakdown-value">{fmt(emp.salary)} ج.م</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">ساعات العمل اليومية المحددة</span><span className="ep-breakdown-value">{workHoursPerDay} ساعة / يوم</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">أيام العمل الشهرية المحددة</span><span className="ep-breakdown-value">{workDaysPerMonth} يوم / شهر</span></div>
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">سعر اليوم (المحسوب)</span><span className="ep-breakdown-value">{fmt(summary.dailyRate)} ج.م / يوم</span></div>
                      <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">✅ سعر الساعة اليومي المحسوب</span><span className="ep-breakdown-value highlight">{fmt(summary.rate)} ج.م / ساعة</span></div>
                    </div>
                  </div>

                  <div className="ep-breakdown-section">
                    <div className="ep-breakdown-title"><span className="ep-breakdown-icon">⏱️</span>ساعات العمل والمستحقات</div>
                    <div className="ep-breakdown-rows">
                      <div className="ep-breakdown-row"><span className="ep-breakdown-label">عدد ساعات العمل الفعلية</span><span className="ep-breakdown-value">{fmt(summary.hours)} ساعة</span></div>
                      <div className="ep-breakdown-row ep-breakdown-result"><span className="ep-breakdown-label">✅ المستحقات الأساسية للفترة</span><span className="ep-breakdown-value highlight">{fmt(summary.baseEarnings)} ج.م</span></div>
                    </div>
                  </div>

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
                      <div className="ep-breakdown-row" style={{ color: 'var(--success)' }}><span className="ep-breakdown-label">+ المكافآت ({bonuses.length} بند)</span><span className="ep-breakdown-value">+{fmt(summary.totalBonus)} ج.م</span></div>
                      <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- الخصومات ({deductions.length} بند)</span><span className="ep-breakdown-value">-{fmt(summary.totalDeduction)} ج.م</span></div>
                      {absenceDays.length > 0 && (
                        <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- خصم الغياب ({absenceDays.length} يوم)</span><span className="ep-breakdown-value">-{fmt(absenceDeduction)} ج.م</span></div>
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
                    ) : (
                      <div className="table-responsive">
                        <table>
                          <thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان / السبب</th></tr></thead>
                          <tbody>
                            {bonuses.map((a) => (
                              <tr key={a.id}>
                                <td>{a.date}</td>
                                <td className="money" style={{ color: 'var(--success)', fontWeight: 700 }}>+{fmt(a.amount)} ج.م</td>
                                <td>{a.description || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td>الإجمالي</td>
                              <td style={{ color: 'var(--success)' }}>+{fmt(summary.totalBonus)} ج.م</td>
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
                    ) : (
                      <div className="table-responsive">
                        <table>
                          <thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان / السبب</th></tr></thead>
                          <tbody>
                            {deductions.map((a) => (
                              <tr key={a.id}>
                                <td>{a.date}</td>
                                <td className="money" style={{ color: 'var(--danger)', fontWeight: 700 }}>-{fmt(a.amount)} ج.م</td>
                                <td>{a.description || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 700 }}>
                              <td>الإجمالي</td>
                              <td style={{ color: 'var(--danger)' }}>-{fmt(summary.totalDeduction)} ج.م</td>
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
        </div>
      </main>

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
    </div>
  );
}
