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
import BylawsModule from '../bylaws/BylawsModule';
import EmployeeResignationModule from './EmployeeResignationModule';
import { computeLatenessFinancialAmount, isApprovedPermissionForDate, getEffectiveShiftHours } from '../../utils/latePenaltyEngine';

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

  const [selectedMonth, setSelectedMonth] = useState(() => {
    try { return localStorage.getItem('emp_selected_month') || CURRENT_MONTH; } catch { return CURRENT_MONTH; }
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

  useEffect(() => { try { localStorage.setItem('emp_active_tab', activeTab); } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem('emp_selected_month', selectedMonth); } catch {} }, [selectedMonth]);
  useEffect(() => { try { localStorage.setItem('emp_filter_mode', filterMode); } catch {} }, [filterMode]);
  useEffect(() => { try { localStorage.setItem('emp_range_start', rangeStart); } catch {} }, [rangeStart]);
  useEffect(() => { try { localStorage.setItem('emp_range_end', rangeEnd); } catch {} }, [rangeEnd]);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [isBranchSelected, setIsBranchSelected] = useState(false);
  const [punchTargetBranchId, setPunchTargetBranchId] = useState('');

  useEffect(() => {
    if (currentEmpUser) {
      const emp = (state && state.employees && state.employees.find((e) => e.id === currentEmpUser?.id)) || currentEmpUser;
      if (!emp || !emp.branchesDetails || emp.branchesDetails.length <= 1) {
        setSelectedBranchId(emp?.branchId || '');
        setIsBranchSelected(true);
        setPunchTargetBranchId(emp?.branchId || '');
      } else {
        setPunchTargetBranchId(emp.branchesDetails[0]?.branchId || emp.branchId || '');
      }
    }
  }, [currentEmpUser?.id]);

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
        if ((summary.extraAllowance || 0) > 0) {
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
        if ((summary.extraAllowance || 0) > 0) {
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
        tableHeaderRow(ws, r, ['سعر الساعة الشهرية', 'إجمالي الساعات', 'مستحقات الأساسي', 'إجمالي البدلات (+)', 'إجمالي المكافآت (+)', 'إجمالي الخصومات (-)', 'صافي المرتب النهائي'], 1);
        ws.mergeCells(r, 7, r, COLS);
        r++;

        dataRow(ws, r, [fmt(emp.salary), fmt(summary.hours), fmt(summary.baseEarnings), fmt(summary.totalAllowances || 0), fmt(summary.totalBonus), fmt(summary.totalDeduction)], 1, [0, 1, 2, 3, 4, 5]);
        ws.mergeCells(r, 7, r, COLS);
        const netCell = ws.getCell(r, 7);
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
  //  Core Calculations & Hooks (MUST BE UNCONDITIONAL)
  // ─────────────────────────────────────────
  const getPayrollCutoffRange = (monthStr) => {
    const pType = orgSettings?.payrollPeriodType || state?.orgSettings?.payrollPeriodType || (() => { try { return localStorage.getItem('payroll_period_type') || 'cycle'; } catch { return 'cycle'; } })();
    const customFrom = orgSettings?.payrollCustomFrom || state?.orgSettings?.payrollCustomFrom || (() => { try { return localStorage.getItem('payroll_custom_from') || ''; } catch { return ''; } })();
    const customTo = orgSettings?.payrollCustomTo || state?.orgSettings?.payrollCustomTo || (() => { try { return localStorage.getItem('payroll_custom_to') || ''; } catch { return ''; } })();

    if (pType === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo;
      const to = customFrom <= customTo ? customTo : customFrom;
      return { startDate: from, endDate: to };
    }

    if (!monthStr || monthStr.length !== 7) return null;
    const sDay = orgSettings?.payrollPayoutStartDay !== undefined ? parseInt(orgSettings.payrollPayoutStartDay, 10) : (state?.orgSettings?.payrollPayoutStartDay !== undefined ? parseInt(state.orgSettings.payrollPayoutStartDay, 10) : (() => { try { const v = localStorage.getItem('payroll_payout_start_day'); return v ? parseInt(v, 10) : 26; } catch { return 26; } })());
    const eDay = orgSettings?.payrollPayoutEndDay !== undefined ? parseInt(orgSettings.payrollPayoutEndDay, 10) : (state?.orgSettings?.payrollPayoutEndDay !== undefined ? parseInt(state.orgSettings.payrollPayoutEndDay, 10) : (() => { try { const v = localStorage.getItem('payroll_payout_end_day'); return v ? parseInt(v, 10) : 25; } catch { return 25; } })());
    const [y, m] = monthStr.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) { prevM = 12; prevY = y - 1; }
    const startDate = `${prevY}-${String(prevM).padStart(2, '0')}-${String(sDay).padStart(2, '0')}`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
    return { startDate, endDate };
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
    const directAdjs = (state.adjustments || []).filter(
      (a) => (String(a.employeeId) === String(emp.id) || a.employeeId === 'all') && filterFn(a.date)
    );
    const penaltyReqs = (state.requests || [])
      .filter((r) => String(r.employeeId) === String(emp.id) && (r.type === 'penalty' || r.type === 'adjustment') && r.status !== 'cancelled' && r.status !== 'rejected' && r.objection?.status !== 'approved' && !r.isCancelled && filterFn(r.date || r.createdAt?.slice(0, 10)))
      .map((r) => {
        let amt = parseFloat(r.amount) || 0;
        if (!amt && (r.impactType || r.impactVal)) {
          if (r.impactType === 'fixed_amount') {
            amt = parseFloat(r.impactVal) || 0;
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
          date: r.date || r.createdAt?.slice(0, 10),
          reason: r.reason || r.ruleTitle || r.details || r.notes || 'جزاء إداري',
          details: r.reason || r.ruleTitle || r.details || r.notes || 'جزاء إداري',
          createdAt: r.createdAt
        };
      });

    const map = new Map();
    directAdjs.forEach((a) => map.set(String(a.id), a));
    penaltyReqs.forEach((p) => {
      if (!map.has(String(p.id))) map.set(String(p.id), p);
    });
    return Array.from(map.values());
  }, [emp, state.adjustments, state.requests, filterFn]);

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
  const currentMonthlySalary = summary.monthlySalary || (currentHourlyRate * monthlyRequiredHours);

  // ── Active Month Roster Status Check ──
  const activeMonthStr = todayStr().slice(0, 7);
  const activeMonthLabel = monthLabel(activeMonthStr).arabic;

  const hasApprovedRosterForActiveMonth = useMemo(() => {
    if (!emp) return true;
    const empIdStr = String(emp.id);
    const targetBId = selectedBranchId || emp.branchId;

    // Check state.rosters
    const inRosters = (state.rosters || []).some(
      (r) => String(r.employeeId) === empIdStr && (r.month === activeMonthStr || !r.month) && r.status === 'approved' && (String(r.branchId || '') === String(targetBId || '') || !r.branchId)
    );
    if (inRosters) return true;

    // Check state.requests
    const inRequests = (state.requests || []).some(
      (r) =>
        String(r.employeeId) === empIdStr &&
        (r.type === 'roster_update' || r.type === 'roster_edit' || r.type === 'roster_edit_request') &&
        (r.month === activeMonthStr || !r.month) &&
        (r.status === 'approved' || r.adminApproved) &&
        (String(r.branchId || '') === String(targetBId || '') || !r.branchId)
    );
    return inRequests;
  }, [emp, state.rosters, state.requests, selectedBranchId, activeMonthStr]);

  // ── Compute automatic absence shifts for the selected month ──
  const approvedRoster = (state.rosters || []).find(
    (r) => emp && String(r.employeeId) === String(emp.id) && (r.month === selectedMonth || !r.month) && r.status === 'approved'
  );

  // Build list of absence days (work day in roster, no punch recorded, not a leave day)
  const absenceDays = useMemo(() => {
    if (!emp || !approvedRoster?.schedule) return [];
    const today = todayStr();
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

      const jsDay = new Date(dateStr).getDay();
      const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
      const daySchedule = approvedRoster.schedule[dateStr] || approvedRoster.schedule[arDayName] || Object.entries(approvedRoster.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDayName.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];

      if (!daySchedule || daySchedule.type === 'off' || daySchedule.isOff) continue; // rest day

      // Check if there's a punch for this day
      const hasPunch = (state.shifts || []).some(s => s.employeeId === emp.id && s.date === dateStr);
      if (hasPunch) continue;

      // Check if there's an approved leave for this day
      const allLeaveRequests = [...(state.leaveRequests || []), ...(state.requests || [])];
      const hasLeave = allLeaveRequests.some(
        r => String(r.employeeId) === String(emp.id)
          && (r.status === 'approved' || r.adminApproved)
          && (r.type === 'leave' || r.type === 'leave_request' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave')
          && r.startDate <= dateStr && r.endDate >= dateStr
      );
      if (hasLeave) continue;

      results.push({ date: dateStr, arDayName, daySchedule });
    }
    return results;
  }, [emp, approvedRoster, state.shifts, state.leaveRequests, state.requests, selectedMonth]);

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

    const startDateStr = activeReq.conditionsStartDate || activeReq.requestDate || todayStr();
    const sDate = parseDateStr(startDateStr);
    const eDate = new Date(sDate);
    eDate.setDate(eDate.getDate() + noticeDays);
    const endDateStr = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;

    const today = parseDateStr(todayStr());
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

        {/* Nav Items & Direct Actions */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {NAV_ITEMS.filter((item) => {
              const isMultiBranchEmp = emp?.branchesDetails && emp.branchesDetails.length > 1;
              // Requirement 3: When All Branches is selected, ONLY show dashboard, salary, evaluations, bylaws
              if (isMultiBranchEmp && !selectedBranchId) {
                return ['dashboard', 'salary', 'evaluations', 'bylaws'].includes(item.id);
              }
              if (item.id === 'salary' && canViewSalary === false) return false;
              if (item.id === 'adjustments' && canViewAdjustments === false) return false;
              if (item.id === 'loans' && canApplyLoan === false) return false;
              if (item.id === 'leaves' && canApplyLeave === false) return false;
              if (item.id === 'permissions' && canApplyPermission === false) return false;
              if ((item.id === 'swap' || item.id === 'swaps') && canApplySwap === false) return false;
              if (item.id === 'bylaws' && canViewBylaws === false) return false;
              if (item.id === 'evaluations' && canSubmitComplaint === false) return false;
              if (item.id === 'roster' && canViewRoster === false) return false;
              return true;
            }).map((item) => {
              const isActive = activeTab === item.id;
              // Badge count
              let badge = 0;
              if (item.id === 'adjustments') badge = empAdjs.length;
              if (item.id === 'shifts') badge = empShifts.length;
              if (item.id === 'resignations') badge = resignationBadgeCount;

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
          </div>

          {/* Action Buttons directly below menu items */}
          <div style={{
            padding: sidebarOpen ? '12px 10px 8px' : '12px 6px 8px',
            marginTop: '8px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
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
                opacity: canExportExcel ? 1 : 0.5, fontSize: '12.5px', color: 'var(--text)',
                fontWeight: 600, transition: 'all 0.15s'
              }}
            >
              <span>📥</span>
              {sidebarOpen && <span>تصدير Excel</span>}
            </button>

            {/* Logout button */}
            <button
              onClick={() => {
                if (typeof handleLogout === 'function') {
                  handleLogout();
                } else {
                  setCurrentEmpUser(null);
                }
              }}
              title="تسجيل الخروج"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
                padding: sidebarOpen ? '8px 12px' : '8px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--danger)',
                fontWeight: 600, transition: 'all 0.15s'
              }}
            >
              <span>🚪</span>
              {sidebarOpen && <span>تسجيل الخروج</span>}
            </button>
          </div>
        </nav>
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
          
          {/* Branch selector if multiple branches exist */}
          {emp.branchesDetails && emp.branchesDetails.length > 1 && (
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
               <select 
                 value={selectedBranchId}
                 onChange={(e) => setSelectedBranchId(e.target.value)}
                 style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--primary)', background: 'var(--primary-tint)', color: 'var(--primary-dark)', cursor: 'pointer', fontWeight: 600 }}
               >
                 <option value="">جميع الفروع (ملخص شامل)</option>
                 {emp.branchesDetails.map(bd => {
                   const b = state.branches?.find(br => br.id === bd.branchId);
                   const manager = state.employees?.find(e => e.id === b?.managerId);
                   const label = b?.name ? `${b.name} (مدير الفرع: ${manager?.name || 'غير محدد'})` : 'فرع غير معروف';
                   return <option key={bd.branchId} value={bd.branchId}>{label}</option>;
                 })}
               </select>
             </div>
          )}
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

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
                background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
                border: '2px solid #f97316',
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
                <span style={{ fontSize: '32px' }}>🔔</span>
                <div>
                  <div style={{ fontWeight: '900', fontSize: '15px', color: '#c2410c' }}>
                    تنبيه نظام الصيدليات: مطلوب إنشاء وتقديم جدول شهري جديد لشهر ({activeMonthLabel})!
                  </div>
                  <div style={{ fontSize: '13px', color: '#9a3412', marginTop: '3px', lineHeight: '1.5' }}>
                    لقد انتصف/بدأ شهر جديد ولا يوجد جدول شهري معتمد لك لشهر الحالي. يرجى إعداد وتصميم جدول الشيفتات للاعتماد المزدوج.
                  </div>
                </div>
              </div>
              <button
                className="btn"
                style={{
                  background: '#ea580c',
                  color: '#ffffff',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)'
                }}
                onClick={() => setActiveTab('roster')}
              >
                📅 إنشاء وحفظ الجدول الشهري الآن 🔗
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
                    const bMonthlySalary = bSummary.monthlySalary || (bSalary * bReqHours);

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
                          <SummaryCard icon="💰" label="سعر الساعة الشهرية (المدخل)" value={canViewSalary ? `${fmt(bSalary)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? `الراتب الشهري: ${fmt(bMonthlySalary)} ج.م` : '🔒 مقيد'} />
                          <SummaryCard icon="📅" label="سعر اليوم (المحسوب)" value={canViewSalary ? `${fmt(bSummary.dailyRate)} ج.م / يوم` : '🔒 مقيد'} sub={canViewSalary ? `(الراتب الشهري ÷ ${bDaysPerMonth} يوم)` : '🔒 مقيد'} />
                          <SummaryCard icon="💵" label="سعر الساعة اليومي" value={canViewSalary ? `${fmt(bSummary.rate || bSalary)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? "المُدخل من الإدارة العليا" : '🔒 مقيد'} />
                          <SummaryCard icon="💰" label="المستحقات الأساسية (أجر الساعات)" value={canViewSalary ? `${fmt(bSummary.baseEarnings)} ج.م` : '🔒 مقيد'} sub={canViewSalary ? `${fmt(bSummary.hours)} س × ${fmt(bSummary.rate || bSalary)} ج.م` : '🔒 مقيد'} />
                          <SummaryCard icon="🎁" label="إجمالي المكافآت" value={canViewAdjustments ? `+${fmt(bSummary.totalBonus)} ج.م` : '🔒 مقيد'} colorVar="--success" />
                          <SummaryCard icon="✂️" label="إجمالي الخصومات" value={canViewAdjustments ? `-${fmt(bSummary.totalDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" />
                          <SummaryCard icon="🏆" label={`صافي المرتب — فرع ${bName}`} value={canViewSalary ? `${fmt(bSummary.netSalary)} ج.م` : '🔒 مقيد'} colorVar="--primary" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="ep-summary-grid">
                  <SummaryCard icon="⏱️" label="إجمالي ساعات العمل" value={`${fmt(summary.hours)} ساعة`} sub={`من أصل ${monthlyRequiredHours} ساعة مطلوبة شهرياً`} />
                  <SummaryCard icon="💰" label="سعر الساعة الشهرية (المدخل)" value={canViewSalary ? `${fmt(currentHourlyRate)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? `الراتب الشهري: ${fmt(currentMonthlySalary)} ج.م` : '🔒 مقيد'} />
                  <SummaryCard icon="📅" label="سعر اليوم (المحسوب)" value={canViewSalary ? `${fmt(summary.dailyRate)} ج.م / يوم` : '🔒 مقيد'} sub={canViewSalary ? `(الراتب الشهري ÷ ${workDaysPerMonth || 26} يوم)` : '🔒 مقيد'} />
                  <SummaryCard icon="💵" label="سعر الساعة اليومي" value={canViewSalary ? `${fmt(summary.rate || currentHourlyRate)} ج.م / س` : '🔒 مقيد'} sub={canViewSalary ? "المُدخل من الإدارة العليا" : '🔒 مقيد'} />
                  <SummaryCard icon="💰" label="المستحقات الأساسية (أجر الساعات)" value={canViewSalary ? `${fmt(summary.baseEarnings)} ج.م` : '🔒 مقيد'} sub={canViewSalary ? `${fmt(summary.hours)} س × ${fmt(summary.rate || currentHourlyRate)} ج.م` : '🔒 مقيد'} />
                  {summary.totalAllowances > 0 && (
                    <SummaryCard
                      icon="💼"
                      label="إجمالي البدلات الثابتة"
                      value={canViewSalary ? `+${fmt(summary.totalAllowances)} ج.م` : '🔒 مقيد'}
                      colorVar="--success"
                      sub={canViewSalary ? [
                        summary.managementAllowance > 0 && `إدارة: ${fmt(summary.managementAllowance)}`,
                        summary.transportAllowance > 0 && `مواصلات: ${fmt(summary.transportAllowance)}`,
                        summary.extraAllowance > 0 && `${summary.extraAllowanceTitle || 'إضافي'}: ${fmt(summary.extraAllowance)}`
                      ].filter(Boolean).join(' | ') : '🔒 مقيد'}
                    />
                  )}
                  <SummaryCard icon="🎁" label="إجمالي المكافآت" value={canViewAdjustments ? `+${fmt(summary.totalBonus)} ج.م` : '🔒 مقيد'} colorVar="--success" />
                  <SummaryCard icon="✂️" label="إجمالي الخصومات" value={canViewAdjustments ? `-${fmt(summary.totalDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" />
                  {absenceDays.length > 0 && (
                    <SummaryCard icon="🚫" label={`خصم الغياب (${absenceDays.length} يوم)`} value={canViewSalary ? `-${fmt(absenceDeduction)} ج.م` : '🔒 مقيد'} colorVar="--danger" sub="يُلغى عند اعتماد إجازة" />
                  )}
                  <SummaryCard icon="🏆" label={`صافي المرتب — ${lbl.arabic}`} value={canViewSalary ? `${fmt(summary.netSalary)} ج.م` : '🔒 مقيد'} colorVar="--primary" />
                </div>
              )}
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
                                      <td className="money" style={{ color: 'var(--primary-dark)', fontWeight: 700 }}>{fmt(effHours)} ساعة</td>
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
                      </div>
                    );
                  })}
                </div>
              ) : (
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
                      <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- إجمالي الخصومات ({deductions.length} بند)</span><span className="ep-breakdown-value">-{fmt(summary.totalDeduction)} ج.م</span></div>
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
                        {summary.extraAllowance > 0 && (
                          <div className="ep-breakdown-row">
                            <span className="ep-breakdown-label">🏷️ {summary.extraAllowanceTitle || 'أجر إضافي مخصص'}</span>
                            <span className="ep-breakdown-value" style={{ color: '#15803d', fontWeight: 'bold' }}>+{fmt(summary.extraAllowance)} ج.م</span>
                          </div>
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
                      <div className="ep-breakdown-row" style={{ color: 'var(--danger)' }}><span className="ep-breakdown-label">- إجمالي الخصومات الشاملة</span><span className="ep-breakdown-value">-{fmt(summary.totalDeduction)} ج.م</span></div>
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
                                <td>{a.reason || a.description || a.notes || a.details || '—'}</td>
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
                                <td>{a.reason || a.description || a.notes || a.details || '—'}</td>
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
