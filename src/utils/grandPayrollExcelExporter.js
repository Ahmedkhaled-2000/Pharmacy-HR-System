import { loadExcelJS } from './excelExport';
import { fmt, arabicMonthLabel } from './formatters';
import { getEffectiveShiftHours, computeLatenessFinancialAmount, isApprovedPermissionForDate } from './latePenaltyEngine';

const XLSX_STYLES = {
  headerBg: 'FF0F766E',      // Deep Teal Header
  subHeaderBg: 'FF115E59',   // Dark Teal Subheader
  kpiBg: 'FFF0FDFA',         // Light Mint Card
  kpiBorder: 'FF0D9488',     // Teal Border
  tableHeadBg: 'FF134E4A',   // Table Header Teal
  tableHeadAlt: 'FF0B3532',  // Table Header Dark Teal
  altRowBg: 'FFF8FAFC',      // Alternating Row Very Light Slate
  highlightGreen: 'FFDCFCE7',// Light Green
  textGreen: 'FF15803d',     // Green Text
  highlightRed: 'FFFEE2E2',  // Light Red
  textRed: 'FFB91C1C',       // Red Text
  highlightPurple: 'FFF5F3FF', // Light Purple
  textPurple: 'FF7C3AED',    // Purple Text
  totalBg: 'FF0F766E',       // Totals Row Deep Teal
  totalText: 'FFFFFFFF',     // White
  white: 'FFFFFFFF',
  textDark: 'FF1E293B',
  borderGray: 'FFCBD5E1',
  borderSubtle: 'FFE2E8F0'
};

const THIN_BORDER = { style: 'thin', color: { argb: XLSX_STYLES.borderGray } };
const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const HEADER_BORDER = { top: { style: 'medium', color: { argb: 'FF0F766E' } }, left: THIN_BORDER, bottom: { style: 'medium', color: { argb: 'FF0F766E' } }, right: THIN_BORDER };

const MONEY_FORMAT = '#,##0.00';
const HOURS_FORMAT = '#,##0.00';
const INT_FORMAT = '#,##0';

/**
 * Auto-fits columns based on cell text content length
 */
function autoFitWorksheetColumns(ws, minWidths = {}) {
  ws.columns.forEach((col, idx) => {
    let maxLen = 0;
    col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      // Don't size based on title rows
      if (rowNumber <= 3) return;
      const valStr = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
      if (valStr.length > maxLen && valStr.length < 60) {
        maxLen = valStr.length;
      }
    });
    const colNumber = idx + 1;
    const minW = minWidths[colNumber] || 12;
    col.width = Math.max(minW, Math.min(maxLen + 5, 42));
  });
}

/**
 * Creates formatted Banner Title
 */
function createTitleBanner(ws, startRow, titleText, subtitleText, colSpan) {
  // Title Row
  ws.mergeCells(startRow, 1, startRow, colSpan);
  const titleCell = ws.getCell(startRow, 1);
  titleCell.value = titleText;
  titleCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: XLSX_STYLES.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(startRow).height = 36;

  // Subtitle Row
  ws.mergeCells(startRow + 1, 1, startRow + 1, colSpan);
  const subCell = ws.getCell(startRow + 1, 1);
  subCell.value = subtitleText;
  subCell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFE6FFFA' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.subHeaderBg } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(startRow + 1).height = 24;
}

/**
 * Creates table headers
 */
function applyTableHeaders(ws, rowIdx, headers, bgArgb = XLSX_STYLES.tableHeadBg) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(rowIdx, i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = HEADER_BORDER;
  });
  ws.getRow(rowIdx).height = 28;
}

/**
 * Writes data row with styles
 */
function writeDataRow(ws, rowIdx, values, options = {}) {
  const { moneyCols = [], hourCols = [], intCols = [], isAlt = false, highlightCol = null, highlightColor = null } = options;

  values.forEach((v, i) => {
    const colIdx = i + 1;
    const cell = ws.getCell(rowIdx, colIdx);
    cell.value = v;
    cell.font = { name: 'Arial', size: 10.5, color: { argb: XLSX_STYLES.textDark } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = CELL_BORDER;

    if (isAlt) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.altRowBg } };
    }

    if (colIdx === highlightCol && highlightColor) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: highlightColor.bg } };
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: highlightColor.text } };
    }

    if (moneyCols.includes(colIdx)) {
      cell.numFmt = MONEY_FORMAT;
    } else if (hourCols.includes(colIdx)) {
      cell.numFmt = HOURS_FORMAT;
    } else if (intCols.includes(colIdx)) {
      cell.numFmt = INT_FORMAT;
    }
  });
  ws.getRow(rowIdx).height = 22;
}

/**
 * Generates the Comprehensive Multi-Tab Master Payroll & Financial Excel Workbook
 */
export async function exportComprehensiveCompanyPayrollExcel({
  state,
  filterFn,
  mode = 'month',
  monthPicker,
  customStart,
  customEnd,
  computeEmpSummary,
  computeGrandPayroll,
  showToast
}) {
  try {
    const ExcelJS = await loadExcelJS(showToast);
    const orgName = state?.orgSettings?.orgName || 'مجموعة صيدليات الشركة';
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const formattedNow = `${formattedDate} ${formattedTime}`;

    let periodLabel;
    let fileNameStr;
    const isCustom = mode === 'all_range' || mode === 'custom';

    if (isCustom && customStart && customEnd) {
      periodLabel = `من ${customStart} إلى ${customEnd}`;
      fileNameStr = `كشف-الرواتب-والتقارير-المالية-الشاملة-من-${customStart}-إلى-${customEnd}.xlsx`;
    } else {
      periodLabel = arabicMonthLabel(monthPicker || formattedDate.slice(0, 7));
      fileNameStr = `كشف-الرواتب-والتقارير-المالية-الشاملة-${monthPicker || formattedDate.slice(0, 7)}.xlsx`;
    }

    const employees = state.employees || [];
    const branches = state.branches || [];
    const shifts = (state.shifts || []).filter((s) => s.date && filterFn(s.date));
    const lateIncidents = (state.lateIncidents || []).filter((inc) => inc.date && filterFn(inc.date));
    const adjustments = (state.adjustments || []).filter((a) => a.date && filterFn(a.date));
    const requests = (state.requests || []).filter((r) => {
      const rDate = r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      return rDate && filterFn(rDate);
    });
    const loans = state.loans || [];
    const finances = (state.finances || state.incomeExpenses || []).filter((f) => f.date && filterFn(f.date));

    // Compute Grand Payroll
    const grandPayroll = computeGrandPayroll(filterFn, !isCustom ? monthPicker : null);

    const wb = new ExcelJS.Workbook();
    wb.creator = orgName;
    wb.lastModifiedBy = 'نظام إدارة الموارد البشرية والرواتب';
    wb.created = now;
    wb.modified = now;

    // =========================================================================
    // SHEET 1: ملخص الرواتب والأجور الشامل (Executive Summary & Master Payroll)
    // =========================================================================
    const ws1 = wb.addWorksheet('📊 ملخص الرواتب والأجور', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S1 = 21;
    let r1 = 1;

    // Title
    createTitleBanner(
      ws1,
      r1,
      `🏥 ${orgName} — كشف الرواتب والتقرير المالي الشامل لجميع الموظفين`,
      `📅 الفترة الزمنية: ${periodLabel}  |  🕒 تاريخ الإصدار: ${formattedNow}  |  👥 إجمالي القوى العاملة: ${employees.length} موظف`,
      COLS_S1
    );
    r1 += 3;

    // KPI Summary Cards Block (Rows r1 to r1+1)
    const kpiRow1 = r1;
    const kpiRow2 = r1 + 1;

    // KPI 1: Total Work Hours
    ws1.mergeCells(kpiRow1, 1, kpiRow1, 4);
    ws1.mergeCells(kpiRow2, 1, kpiRow2, 4);
    const kpi1Title = ws1.getCell(kpiRow1, 1);
    kpi1Title.value = '⏱️ إجمالي ساعات العمل الفعلية';
    kpi1Title.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF0F766E' } };
    kpi1Title.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi1Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    kpi1Title.border = CELL_BORDER;

    const kpi1Val = ws1.getCell(kpiRow2, 1);
    kpi1Val.value = `${fmt(grandPayroll.totalHours)} ساعة`;
    kpi1Val.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF0F766E' } };
    kpi1Val.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi1Val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    kpi1Val.border = CELL_BORDER;

    // KPI 2: Total Base Earnings
    ws1.mergeCells(kpiRow1, 5, kpiRow1, 8);
    ws1.mergeCells(kpiRow2, 5, kpiRow2, 8);
    const kpi2Title = ws1.getCell(kpiRow1, 5);
    kpi2Title.value = '💰 إجمالي المستحقات الأساسية';
    kpi2Title.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF0369A1' } };
    kpi2Title.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi2Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    kpi2Title.border = CELL_BORDER;

    const kpi2Val = ws1.getCell(kpiRow2, 5);
    kpi2Val.value = `${fmt(grandPayroll.totalBaseEarnings)} ج.م`;
    kpi2Val.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF0369A1' } };
    kpi2Val.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi2Val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
    kpi2Val.border = CELL_BORDER;

    // KPI 3: Total Bonuses & Allowances
    ws1.mergeCells(kpiRow1, 9, kpiRow1, 12);
    ws1.mergeCells(kpiRow2, 9, kpiRow2, 12);
    const kpi3Title = ws1.getCell(kpiRow1, 9);
    kpi3Title.value = '🎁 إجمالي البدلات والمكافآت (+)';
    kpi3Title.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF15803D' } };
    kpi3Title.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi3Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    kpi3Title.border = CELL_BORDER;

    const kpi3Val = ws1.getCell(kpiRow2, 9);
    kpi3Val.value = `+${fmt(grandPayroll.totalAllowances + grandPayroll.totalBonus)} ج.م`;
    kpi3Val.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF15803D' } };
    kpi3Val.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi3Val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    kpi3Val.border = CELL_BORDER;

    // KPI 4: Total Deductions
    ws1.mergeCells(kpiRow1, 13, kpiRow1, 16);
    ws1.mergeCells(kpiRow2, 13, kpiRow2, 16);
    const kpi4Title = ws1.getCell(kpiRow1, 13);
    kpi4Title.value = '🔻 إجمالي الخصومات والاستقطاعات (-)';
    kpi4Title.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FFB91C1C' } };
    kpi4Title.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi4Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    kpi4Title.border = CELL_BORDER;

    const kpi4Val = ws1.getCell(kpiRow2, 13);
    kpi4Val.value = `-${fmt(grandPayroll.totalDeduction)} ج.م`;
    kpi4Val.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFB91C1C' } };
    kpi4Val.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi4Val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    kpi4Val.border = CELL_BORDER;

    // KPI 5: Net Payable Payroll
    ws1.mergeCells(kpiRow1, 17, kpiRow1, COLS_S1);
    ws1.mergeCells(kpiRow2, 17, kpiRow2, COLS_S1);
    const kpi5Title = ws1.getCell(kpiRow1, 17);
    kpi5Title.value = '💳 صافي رواتب الشركة المستحقة (Net Payroll)';
    kpi5Title.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF134E4A' } };
    kpi5Title.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi5Title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFFA' } };
    kpi5Title.border = CELL_BORDER;

    const kpi5Val = ws1.getCell(kpiRow2, 17);
    kpi5Val.value = `${fmt(grandPayroll.grandNetSalary)} ج.م`;
    kpi5Val.font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FF0F766E' } };
    kpi5Val.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi5Val.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFFA' } };
    kpi5Val.border = CELL_BORDER;

    ws1.getRow(kpiRow1).height = 22;
    ws1.getRow(kpiRow2).height = 28;
    r1 += 3;

    // Section Header: Master Table
    ws1.mergeCells(r1, 1, r1, COLS_S1);
    const tblHeadBanner = ws1.getCell(r1, 1);
    tblHeadBanner.value = '📋 كشف رواتب الموظفين التفصيلي الشامل ومفردات المرتبات';
    tblHeadBanner.font = { name: 'Arial', bold: true, size: 12, color: { argb: XLSX_STYLES.white } };
    tblHeadBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.subHeaderBg } };
    tblHeadBanner.alignment = { horizontal: 'right', vertical: 'middle' };
    ws1.getRow(r1).height = 26;
    r1++;

    // Table 1 Column Headers
    const headers1 = [
      'م',
      'كود الموظف',
      'اسم الموظف',
      'المسمى الوظيفي',
      'الفرع',
      'عدد الورديات',
      'ساعات العمل (شاملة الأذونات)',
      'سعر الساعة (ج.م)',
      'المستحقات الأساسية (ج.م)',
      'بدل إدارة (+)',
      'بدل انتقال (+)',
      'أجر إضافي (+)',
      'المكافآت (+)',
      'إجمالي الاستحقاقات (+)',
      'خصم التأخير (-)',
      'خصم الغياب (-)',
      'خصومات أخرى (-)',
      'أقساط السلف والأدوية (-)',
      'إجمالي الاستقطاعات (-)',
      'صافي المرتب المستحق (ج.م)',
      'توقيع الاستلام / ملاحظات'
    ];
    applyTableHeaders(ws1, r1, headers1);
    r1++;

    const startDataRow1 = r1;

    employees.forEach((emp, index) => {
      const summary = grandPayroll.perEmp[emp.id] || {
        hours: 0,
        rate: 0,
        baseEarnings: 0,
        managementAllowance: 0,
        transportAllowance: 0,
        extraAllowance: 0,
        totalAllowances: 0,
        totalBonus: 0,
        lateDeduction: 0,
        absenceDeduction: 0,
        manualDeduction: 0,
        loanDeduction: 0,
        totalDeduction: 0,
        netSalary: 0
      };

      const empShifts = shifts.filter((s) => String(s.employeeId) === String(emp.id));
      const shiftCount = empShifts.length;
      const branchNames = (emp.branchesDetails && emp.branchesDetails.length > 0)
        ? emp.branchesDetails.map((b) => b.branchName || (branches.find((br) => br.id === b.branchId)?.name) || 'فرع').join(' + ')
        : (branches.find((br) => br.id === emp.branchId)?.name || 'الفرع الرئيسي');

      const totalAdditions = (summary.baseEarnings || 0) + (summary.totalAllowances || 0) + (summary.totalBonus || 0);
      const isAlt = index % 2 === 1;

      const rowVals = [
        index + 1,
        emp.code || '—',
        emp.name || 'موظف',
        emp.jobTitle || 'كادر',
        branchNames,
        shiftCount,
        parseFloat(fmt(summary.hours)),
        parseFloat(fmt(summary.rate || summary.hourlyRate || 0)),
        parseFloat(fmt(summary.baseEarnings)),
        parseFloat(fmt(summary.managementAllowance || 0)),
        parseFloat(fmt(summary.transportAllowance || 0)),
        parseFloat(fmt(summary.extraAllowance || 0)),
        parseFloat(fmt(summary.totalBonus || 0)),
        parseFloat(fmt(totalAdditions)),
        parseFloat(fmt(summary.lateDeduction || 0)),
        parseFloat(fmt(summary.absenceDeduction || 0)),
        parseFloat(fmt(summary.manualDeduction || 0)),
        parseFloat(fmt(summary.loanDeduction || 0)),
        parseFloat(fmt(summary.totalDeduction || 0)),
        parseFloat(fmt(summary.netSalary)),
        summary.netSalary <= 0 ? 'مستنفذ / رصيد سالب' : ''
      ];

      writeDataRow(ws1, r1, rowVals, {
        moneyCols: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        hourCols: [7],
        intCols: [1, 6],
        isAlt,
        highlightCol: 20,
        highlightColor: summary.netSalary >= 0
          ? { bg: XLSX_STYLES.highlightGreen, text: XLSX_STYLES.textGreen }
          : { bg: XLSX_STYLES.highlightRed, text: XLSX_STYLES.textRed }
      });
      r1++;
    });

    // Master Table Totals Row
    const endDataRow1 = r1 - 1;
    ws1.mergeCells(r1, 1, r1, 5);
    const totLabel1 = ws1.getCell(r1, 1);
    totLabel1.value = 'الإجمالي العام لكافة موظفي الشركة (Grand Total)';
    totLabel1.font = { name: 'Arial', bold: true, size: 11.5, color: { argb: XLSX_STYLES.white } };
    totLabel1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
    totLabel1.alignment = { horizontal: 'center', vertical: 'middle' };
    totLabel1.border = CELL_BORDER;

    // Shift count total
    const totShiftsCell = ws1.getCell(r1, 6);
    totShiftsCell.value = { formula: `SUM(F${startDataRow1}:F${endDataRow1})` };
    totShiftsCell.numFmt = INT_FORMAT;

    // Hours total
    const totHoursCell = ws1.getCell(r1, 7);
    totHoursCell.value = { formula: `SUM(G${startDataRow1}:G${endDataRow1})` };
    totHoursCell.numFmt = HOURS_FORMAT;

    // Avg Rate
    const avgRateCell = ws1.getCell(r1, 8);
    avgRateCell.value = { formula: `AVERAGE(H${startDataRow1}:H${endDataRow1})` };
    avgRateCell.numFmt = MONEY_FORMAT;

    // Base Earnings
    const totBaseCell = ws1.getCell(r1, 9);
    totBaseCell.value = { formula: `SUM(I${startDataRow1}:I${endDataRow1})` };
    totBaseCell.numFmt = MONEY_FORMAT;

    // Mgmt
    const totMgmtCell = ws1.getCell(r1, 10);
    totMgmtCell.value = { formula: `SUM(J${startDataRow1}:J${endDataRow1})` };
    totMgmtCell.numFmt = MONEY_FORMAT;

    // Transport
    const totTransCell = ws1.getCell(r1, 11);
    totTransCell.value = { formula: `SUM(K${startDataRow1}:K${endDataRow1})` };
    totTransCell.numFmt = MONEY_FORMAT;

    // Extra
    const totExtraCell = ws1.getCell(r1, 12);
    totExtraCell.value = { formula: `SUM(L${startDataRow1}:L${endDataRow1})` };
    totExtraCell.numFmt = MONEY_FORMAT;

    // Bonus
    const totBonusCell = ws1.getCell(r1, 13);
    totBonusCell.value = { formula: `SUM(M${startDataRow1}:M${endDataRow1})` };
    totBonusCell.numFmt = MONEY_FORMAT;

    // Total Additions
    const totAddCell = ws1.getCell(r1, 14);
    totAddCell.value = { formula: `SUM(N${startDataRow1}:N${endDataRow1})` };
    totAddCell.numFmt = MONEY_FORMAT;

    // Late
    const totLateCell = ws1.getCell(r1, 15);
    totLateCell.value = { formula: `SUM(O${startDataRow1}:O${endDataRow1})` };
    totLateCell.numFmt = MONEY_FORMAT;

    // Absence
    const totAbsCell = ws1.getCell(r1, 16);
    totAbsCell.value = { formula: `SUM(P${startDataRow1}:P${endDataRow1})` };
    totAbsCell.numFmt = MONEY_FORMAT;

    // Other Ded
    const totOtherCell = ws1.getCell(r1, 17);
    totOtherCell.value = { formula: `SUM(Q${startDataRow1}:Q${endDataRow1})` };
    totOtherCell.numFmt = MONEY_FORMAT;

    // Loans
    const totLoansCell = ws1.getCell(r1, 18);
    totLoansCell.value = { formula: `SUM(R${startDataRow1}:R${endDataRow1})` };
    totLoansCell.numFmt = MONEY_FORMAT;

    // Total Ded
    const totDedCell = ws1.getCell(r1, 19);
    totDedCell.value = { formula: `SUM(S${startDataRow1}:S${endDataRow1})` };
    totDedCell.numFmt = MONEY_FORMAT;

    // Net Salary Grand Total
    const totNetCell = ws1.getCell(r1, 20);
    totNetCell.value = { formula: `SUM(T${startDataRow1}:T${endDataRow1})` };
    totNetCell.numFmt = MONEY_FORMAT;

    const blankSignCell = ws1.getCell(r1, 21);
    blankSignCell.value = '';

    [
      totShiftsCell, totHoursCell, avgRateCell, totBaseCell, totMgmtCell,
      totTransCell, totExtraCell, totBonusCell, totAddCell, totLateCell,
      totAbsCell, totOtherCell, totLoansCell, totDedCell, totNetCell, blankSignCell
    ].forEach((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = CELL_BORDER;
    });

    ws1.getRow(r1).height = 26;

    autoFitWorksheetColumns(ws1, {
      1: 6, 2: 12, 3: 24, 4: 18, 5: 18, 6: 12, 7: 16, 8: 14, 9: 16,
      10: 13, 11: 13, 12: 13, 13: 13, 14: 16, 15: 14, 16: 14, 17: 14,
      18: 16, 19: 16, 20: 18, 21: 20
    });

    // =========================================================================
    // SHEET 2: سجل الحضور والانصراف والبصمات التفصيلي (Attendance & Punches)
    // =========================================================================
    const ws2 = wb.addWorksheet('⏱️ تفاصيل الورديات والبصمات', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S2 = 15;
    let r2 = 1;

    createTitleBanner(
      ws2,
      r2,
      `⏱️ سجل الورديات وبصمات الحضور والانصراف التفصيلي — ${orgName}`,
      `📅 الفترة: ${periodLabel}  |  📊 إجمالي عدد الورديات المسجلة: ${shifts.length} وردية`,
      COLS_S2
    );
    r2 += 3;

    const headers2 = [
      'م',
      'التاريخ',
      'اليوم',
      'كود الموظف',
      'اسم الموظف',
      'المسمى الوظيفي',
      'الفرع',
      'وقت الدخول',
      'وقت الخروج',
      'البريك (ساعة)',
      'ساعات العمل المعتمدة (شاملة الأذونات)',
      'أجر الساعة (ج.م)',
      'المبلغ المستحق للوردية (ج.م)',
      'حالة الإذن والتعديل',
      'ملاحظات وبيان الوردية'
    ];
    applyTableHeaders(ws2, r2, headers2);
    r2++;

    const startDataRow2 = r2;

    // Sort shifts chronologically
    const sortedShifts = [...shifts].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    sortedShifts.forEach((s, idx) => {
      const emp = employees.find((e) => String(e.id) === String(s.employeeId)) || {};
      const branchObj = branches.find((b) => String(b.id) === String(s.branchId || emp.branchId));
      const bName = branchObj?.name || 'الفرع الرئيسي';
      
      const d = s.date ? new Date(s.date) : null;
      const dayName = d && !isNaN(d.getTime()) ? arabicDays[d.getDay()] : '—';

      const effHours = getEffectiveShiftHours(s, state);
      
      // Hourly rate for this employee & branch
      const bDetails = (emp.branchesDetails || []).find((bd) => String(bd.branchId) === String(s.branchId));
      const hourlyBase = parseFloat(bDetails?.salary || emp.salary) || 0;
      const workHours = parseFloat(bDetails?.workHoursPerDay || emp.workHoursPerDay) || 8;
      const workDays = parseFloat(bDetails?.workDaysPerMonth || emp.workDaysPerMonth) || 26;
      const dailyRate = workDays > 0 ? (hourlyBase * workHours) / workDays : 0;
      const rate = (hourlyBase > 0 && workDays > 0)
        ? (hourlyBase >= 200 ? (hourlyBase / workDays) : ((hourlyBase * workHours) / workDays))
        : (workHours > 0 ? dailyRate / workHours : hourlyBase);

      const shiftEarned = effHours * rate;
      const isAlt = idx % 2 === 1;

      let permStatus = 'بصمة قياسية';
      if (s.hasApprovedPermission || s.permissionNotes || (s.notes && s.notes.includes('⏰ تم تعديل البصمة'))) {
        permStatus = '⏰ معدلة بإذن رسمي معتمد (+ساعات الإذن)';
      }

      const rowVals = [
        idx + 1,
        s.date || '—',
        dayName,
        emp.code || '—',
        emp.name || s.employeeName || 'موظف',
        emp.jobTitle || 'كادر',
        bName,
        s.timeIn || '—',
        s.timeOut || '—',
        parseFloat(fmt(s.breakHours || 0)),
        parseFloat(fmt(effHours)),
        parseFloat(fmt(rate)),
        parseFloat(fmt(shiftEarned)),
        permStatus,
        s.notes || s.permissionNotes || ''
      ];

      writeDataRow(ws2, r2, rowVals, {
        moneyCols: [12, 13],
        hourCols: [10, 11],
        intCols: [1],
        isAlt,
        highlightCol: 11,
        highlightColor: { bg: 'FFF0FDFA', text: 'FF0F766E' }
      });
      r2++;
    });

    if (sortedShifts.length > 0) {
      const endDataRow2 = r2 - 1;
      ws2.mergeCells(r2, 1, r2, 10);
      const totLabel2 = ws2.getCell(r2, 1);
      totLabel2.value = 'إجمالي ساعات ومستحقات الورديات المسجلة';
      totLabel2.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      totLabel2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      totLabel2.alignment = { horizontal: 'center', vertical: 'middle' };
      totLabel2.border = CELL_BORDER;

      const totH = ws2.getCell(r2, 11);
      totH.value = { formula: `SUM(K${startDataRow2}:K${endDataRow2})` };
      totH.numFmt = HOURS_FORMAT;

      const avgR = ws2.getCell(r2, 12);
      avgR.value = { formula: `AVERAGE(L${startDataRow2}:L${endDataRow2})` };
      avgR.numFmt = MONEY_FORMAT;

      const totEarned = ws2.getCell(r2, 13);
      totEarned.value = { formula: `SUM(M${startDataRow2}:M${endDataRow2})` };
      totEarned.numFmt = MONEY_FORMAT;

      const c14 = ws2.getCell(r2, 14); c14.value = '';
      const c15 = ws2.getCell(r2, 15); c15.value = '';

      [totH, avgR, totEarned, c14, c15].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = CELL_BORDER;
      });
      ws2.getRow(r2).height = 24;
    }

    autoFitWorksheetColumns(ws2, {
      1: 6, 2: 13, 3: 11, 4: 12, 5: 22, 6: 18, 7: 18, 8: 12, 9: 12,
      10: 12, 11: 16, 12: 14, 13: 16, 14: 26, 15: 26
    });

    // =========================================================================
    // SHEET 3: وقائع التأخير وجزاءات لائحة العمل (Bylaws Late Incidents Log)
    // =========================================================================
    const ws3 = wb.addWorksheet('📜 وقائع تأخيرات اللائحة', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S3 = 15;
    let r3 = 1;

    createTitleBanner(
      ws3,
      r3,
      `📜 سجل وقائع التأخير وجزاءات لائحة العمل والجزاءات — ${orgName}`,
      `📅 الفترة: ${periodLabel}  |  ⚠️ إجمالي وقائع التأخير المسجلة: ${lateIncidents.length} واقعة`,
      COLS_S3
    );
    r3 += 3;

    const headers3 = [
      'م',
      'تاريخ الوردية',
      'كود الموظف',
      'اسم الموظف',
      'الفرع',
      'بداية الشيفت المجدول',
      'الحضور الفعلي',
      'دقائق التأخير',
      'فئة التأخير اللائحية',
      'رقم التكرار بالدورة',
      'الإجراء والجزاء المعتمد',
      'دقائق الخصم',
      'مبلغ الخصم المعتمد (ج.م)',
      'حالة الجزاء',
      'بيان وتفاصيل الجزاء'
    ];
    applyTableHeaders(ws3, r3, headers3, XLSX_STYLES.tableHeadAlt);
    r3++;

    const startDataRow3 = r3;

    lateIncidents.forEach((inc, idx) => {
      const emp = employees.find((e) => String(e.id) === String(inc.employeeId)) || {};
      const branchObj = branches.find((b) => String(b.id) === String(inc.branchId || emp.branchId));
      const bName = branchObj?.name || inc.branchName || 'الفرع الرئيسي';

      const isPermExempt = inc.status === 'approved_permission_exempt' || isApprovedPermissionForDate(inc.employeeId, inc.date, state);
      const isGrace = inc.actionType === 'grace';
      const isDeducted = (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) && !isPermExempt && !isGrace;

      let statusDesc = '🟢 معتمد ومخصوم لائحياً';
      if (isPermExempt) statusDesc = '⏰ إذن رسمي معتمد (معفى من الخصم)';
      else if (isGrace) statusDesc = '🟢 سماح لائحى (بدون خصم)';
      else if (inc.status === 'overridden') statusDesc = '✏️ تسوية إدارية معدلة';

      const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
      const finalAmt = dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0);

      const rowVals = [
        idx + 1,
        inc.date || '—',
        emp.code || inc.employeeCode || '—',
        emp.name || inc.employeeName || 'موظف',
        bName,
        inc.scheduledStartTime || '—',
        inc.actualPunchInTime || '—',
        parseFloat(fmt(inc.lateMinutes || 0)),
        inc.tierName || '—',
        inc.occurrenceNumber ? `المرة ${inc.occurrenceNumber}` : '—',
        inc.actionLabel || '—',
        isPermExempt ? 0 : parseFloat(fmt(inc.deductionMinutes || 0)),
        isPermExempt ? 0 : parseFloat(fmt(finalAmt)),
        statusDesc,
        inc.overrideReason || (isDeducted ? `تأخر ${inc.lateMinutes} دقيقة - خصم ${inc.deductionMinutes} دقيقة` : '')
      ];

      writeDataRow(ws3, r3, rowVals, {
        moneyCols: [13],
        hourCols: [8, 12],
        intCols: [1],
        isAlt: idx % 2 === 1,
        highlightCol: 13,
        highlightColor: isDeducted
          ? { bg: XLSX_STYLES.highlightRed, text: XLSX_STYLES.textRed }
          : { bg: XLSX_STYLES.highlightGreen, text: XLSX_STYLES.textGreen }
      });
      r3++;
    });

    if (lateIncidents.length > 0) {
      const endDataRow3 = r3 - 1;
      ws3.mergeCells(r3, 1, r3, 7);
      const totLabel3 = ws3.getCell(r3, 1);
      totLabel3.value = 'إجمالي وقائع ودقائق التأخير ومبالغ الخصم اللائحي';
      totLabel3.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      totLabel3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      totLabel3.alignment = { horizontal: 'center', vertical: 'middle' };
      totLabel3.border = CELL_BORDER;

      const totLateMins = ws3.getCell(r3, 8);
      totLateMins.value = { formula: `SUM(H${startDataRow3}:H${endDataRow3})` };
      totLateMins.numFmt = INT_FORMAT;

      const c9 = ws3.getCell(r3, 9); c9.value = '';
      const c10 = ws3.getCell(r3, 10); c10.value = '';
      const c11 = ws3.getCell(r3, 11); c11.value = '';

      const totDedMins = ws3.getCell(r3, 12);
      totDedMins.value = { formula: `SUM(L${startDataRow3}:L${endDataRow3})` };
      totDedMins.numFmt = INT_FORMAT;

      const totDedAmt = ws3.getCell(r3, 13);
      totDedAmt.value = { formula: `SUM(M${startDataRow3}:M${endDataRow3})` };
      totDedAmt.numFmt = MONEY_FORMAT;

      const c14 = ws3.getCell(r3, 14); c14.value = '';
      const c15 = ws3.getCell(r3, 15); c15.value = '';

      [totLateMins, c9, c10, c11, totDedMins, totDedAmt, c14, c15].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = CELL_BORDER;
      });
      ws3.getRow(r3).height = 24;
    }

    autoFitWorksheetColumns(ws3, {
      1: 6, 2: 13, 3: 12, 4: 22, 5: 18, 6: 14, 7: 14, 8: 14, 9: 18,
      10: 14, 11: 22, 12: 14, 13: 16, 14: 24, 15: 28
    });

    // =========================================================================
    // SHEET 4: المكافآت والخصومات والتسويات الإدارية (Adjustments & Penalties)
    // =========================================================================
    const ws4 = wb.addWorksheet('📝 المكافآت والخصومات', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S4 = 9;
    let r4 = 1;

    createTitleBanner(
      ws4,
      r4,
      `📝 سجل المكافآت والخصومات والتسويات الإدارية — ${orgName}`,
      `📅 الفترة: ${periodLabel}  |  📊 إجمالي القيود والتسويات المسجلة: ${adjustments.length} قيد`,
      COLS_S4
    );
    r4 += 3;

    const headers4 = [
      'م',
      'التاريخ',
      'كود الموظف',
      'اسم الموظف',
      'الفرع',
      'نوع القيد',
      'المبلغ المالي (ج.م)',
      'السبب والبيان التوضيحي',
      'مصؤول الإضافة / القيد'
    ];
    applyTableHeaders(ws4, r4, headers4);
    r4++;

    const startDataRow4 = r4;

    adjustments.forEach((adj, idx) => {
      const emp = employees.find((e) => String(e.id) === String(adj.employeeId)) || {};
      const branchObj = branches.find((b) => String(b.id) === String(adj.branchId || emp.branchId));
      const bName = branchObj?.name || 'الفرع الرئيسي';

      const isBonus = adj.type === 'bonus' || adj.subType === 'bonus';
      const typeLabel = isBonus ? '🎁 مكافأة (+)' : '🔻 خصم / جزاء إداري (-)';

      const rowVals = [
        idx + 1,
        adj.date || adj.createdAt?.slice(0, 10) || '—',
        emp.code || '—',
        emp.name || (adj.employeeId === 'all' ? 'جميع الموظفين' : 'موظف'),
        bName,
        typeLabel,
        parseFloat(fmt(adj.amount || 0)),
        adj.description || adj.reason || adj.notes || '—',
        adj.addedBy || 'الإدارة العليا'
      ];

      writeDataRow(ws4, r4, rowVals, {
        moneyCols: [7],
        intCols: [1],
        isAlt: idx % 2 === 1,
        highlightCol: 7,
        highlightColor: isBonus
          ? { bg: XLSX_STYLES.highlightGreen, text: XLSX_STYLES.textGreen }
          : { bg: XLSX_STYLES.highlightRed, text: XLSX_STYLES.textRed }
      });
      r4++;
    });

    if (adjustments.length > 0) {
      const endDataRow4 = r4 - 1;
      ws4.mergeCells(r4, 1, r4, 6);
      const totLabel4 = ws4.getCell(r4, 1);
      totLabel4.value = 'إجمالي مبالغ المكافآت والخصومات المسجلة';
      totLabel4.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      totLabel4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      totLabel4.alignment = { horizontal: 'center', vertical: 'middle' };
      totLabel4.border = CELL_BORDER;

      const totAmt4 = ws4.getCell(r4, 7);
      totAmt4.value = { formula: `SUM(G${startDataRow4}:G${endDataRow4})` };
      totAmt4.numFmt = MONEY_FORMAT;

      const c8 = ws4.getCell(r4, 8); c8.value = '';
      const c9 = ws4.getCell(r4, 9); c9.value = '';

      [totAmt4, c8, c9].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = CELL_BORDER;
      });
      ws4.getRow(r4).height = 24;
    }

    autoFitWorksheetColumns(ws4, {
      1: 6, 2: 13, 3: 12, 4: 22, 5: 18, 6: 18, 7: 18, 8: 30, 9: 20
    });

    // =========================================================================
    // SHEET 5: سجل السلف ومشتريات الأدوية الآجل (Loans & Credit Medicine)
    // =========================================================================
    const ws5 = wb.addWorksheet('💳 السلف والأدوية الآجل', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S5 = 11;
    let r5 = 1;

    createTitleBanner(
      ws5,
      r5,
      `💳 سجل السلف النقدية ومشتريات الأدوية الآجل — ${orgName}`,
      `📅 الفترة: ${periodLabel}  |  💳 إجمالي طلبات السلف المسجلة: ${loans.length} طلب`,
      COLS_S5
    );
    r5 += 3;

    const headers5 = [
      'م',
      'تاريخ الطلب',
      'كود الموظف',
      'اسم الموظف',
      'الفرع',
      'نوع المعاملة',
      'إجمالي المبلغ المستدان (ج.م)',
      'الخصم المطبق بالفترة (ج.م)',
      'إجمالي المسدد حتى تاريخه (ج.م)',
      'الرصيد المتبقي (ج.م)',
      'حالة السداد'
    ];
    applyTableHeaders(ws5, r5, headers5);
    r5++;

    const startDataRow5 = r5;

    loans.forEach((loan, idx) => {
      const emp = employees.find((e) => String(e.id) === String(loan.employeeId)) || {};
      const branchObj = branches.find((b) => String(b.id) === String(loan.branchId || emp.branchId));
      const bName = branchObj?.name || 'الفرع الرئيسي';

      const totalAmt = parseFloat(loan.amount) || 0;
      const paidAmt = parseFloat(loan.paidAmount) || 0;
      const remAmt = Math.max(0, totalAmt - paidAmt);
      const periodDed = Math.min(remAmt, parseFloat(loan.monthlyDeduction || loan.installmentAmount) || remAmt);

      let typeName = 'سلفة نقدية';
      if (loan.type === 'meds' || loan.type === 'credit_medicine') typeName = '💊 مشتريات أدوية آجل';
      else if (loan.loanType === 'installment') typeName = '💳 سلفة مقسطة';

      const statusDesc = remAmt === 0 ? '🟢 تم السداد بالكامل' : (paidAmt > 0 ? '⏳ سداد جزئي جاري' : '🔴 مستحق السداد');

      const rowVals = [
        idx + 1,
        loan.date || loan.createdAt?.slice(0, 10) || '—',
        emp.code || '—',
        emp.name || loan.employeeName || 'موظف',
        bName,
        typeName,
        parseFloat(fmt(totalAmt)),
        parseFloat(fmt(periodDed)),
        parseFloat(fmt(paidAmt)),
        parseFloat(fmt(remAmt)),
        statusDesc
      ];

      writeDataRow(ws5, r5, rowVals, {
        moneyCols: [7, 8, 9, 10],
        intCols: [1],
        isAlt: idx % 2 === 1,
        highlightCol: 10,
        highlightColor: remAmt === 0
          ? { bg: XLSX_STYLES.highlightGreen, text: XLSX_STYLES.textGreen }
          : { bg: 'FFF5F3FF', text: 'FF7C3AED' }
      });
      r5++;
    });

    if (loans.length > 0) {
      const endDataRow5 = r5 - 1;
      ws5.mergeCells(r5, 1, r5, 6);
      const totLabel5 = ws5.getCell(r5, 1);
      totLabel5.value = 'إجمالي مبالغ السلف والأدوية والمسدد والمتبقي';
      totLabel5.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      totLabel5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      totLabel5.alignment = { horizontal: 'center', vertical: 'middle' };
      totLabel5.border = CELL_BORDER;

      const tTotal = ws5.getCell(r5, 7);
      tTotal.value = { formula: `SUM(G${startDataRow5}:G${endDataRow5})` };
      tTotal.numFmt = MONEY_FORMAT;

      const tPeriod = ws5.getCell(r5, 8);
      tPeriod.value = { formula: `SUM(H${startDataRow5}:H${endDataRow5})` };
      tPeriod.numFmt = MONEY_FORMAT;

      const tPaid = ws5.getCell(r5, 9);
      tPaid.value = { formula: `SUM(I${startDataRow5}:I${endDataRow5})` };
      tPaid.numFmt = MONEY_FORMAT;

      const tRem = ws5.getCell(r5, 10);
      tRem.value = { formula: `SUM(J${startDataRow5}:J${endDataRow5})` };
      tRem.numFmt = MONEY_FORMAT;

      const c11 = ws5.getCell(r5, 11); c11.value = '';

      [tTotal, tPeriod, tPaid, tRem, c11].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = CELL_BORDER;
      });
      ws5.getRow(r5).height = 24;
    }

    autoFitWorksheetColumns(ws5, {
      1: 6, 2: 13, 3: 12, 4: 22, 5: 18, 6: 20, 7: 18, 8: 18, 9: 18, 10: 18, 11: 20
    });

    // =========================================================================
    // SHEET 6: المصروفات والإيرادات التشغيلية (Income & Expenses)
    // =========================================================================
    const ws6 = wb.addWorksheet('📈 المصروفات والإيرادات', {
      views: [{ rightToLeft: true, showGridLines: true }]
    });

    const COLS_S6 = 8;
    let r6 = 1;

    createTitleBanner(
      ws6,
      r6,
      `📈 التقرير المالي العام للمصروفات والإيرادات التشغيلية — ${orgName}`,
      `📅 الفترة: ${periodLabel}  |  💵 إجمالي الحركات المالية المسجلة: ${finances.length} حركة`,
      COLS_S6
    );
    r6 += 3;

    const headers6 = [
      'م',
      'التاريخ',
      'النوع',
      'الفرع',
      'البند / التصنيف',
      'المبلغ المالي (ج.م)',
      'البيان والتفاصيل',
      'طريقة السداد / القيد'
    ];
    applyTableHeaders(ws6, r6, headers6);
    r6++;

    const startDataRow6 = r6;

    finances.forEach((f, idx) => {
      const branchObj = branches.find((b) => String(b.id) === String(f.branchId));
      const bName = branchObj?.name || 'الفرع الرئيسي';

      const isIncome = f.type === 'income' || f.type === 'إيراد';
      const typeLabel = isIncome ? '🟢 إيراد وارد (+)' : '🔴 مصروف منصرف (-)';

      const rowVals = [
        idx + 1,
        f.date || '—',
        typeLabel,
        bName,
        f.category || f.item || 'عام',
        parseFloat(fmt(f.amount || 0)),
        f.description || f.notes || '—',
        f.paymentMethod || 'نقدي (كاش)'
      ];

      writeDataRow(ws6, r6, rowVals, {
        moneyCols: [6],
        intCols: [1],
        isAlt: idx % 2 === 1,
        highlightCol: 6,
        highlightColor: isIncome
          ? { bg: XLSX_STYLES.highlightGreen, text: XLSX_STYLES.textGreen }
          : { bg: XLSX_STYLES.highlightRed, text: XLSX_STYLES.textRed }
      });
      r6++;
    });

    if (finances.length > 0) {
      const endDataRow6 = r6 - 1;
      ws6.mergeCells(r6, 1, r6, 5);
      const totLabel6 = ws6.getCell(r6, 1);
      totLabel6.value = 'إجمالي الحركات المالية بالفترة';
      totLabel6.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
      totLabel6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
      totLabel6.alignment = { horizontal: 'center', vertical: 'middle' };
      totLabel6.border = CELL_BORDER;

      const totFin = ws6.getCell(r6, 6);
      totFin.value = { formula: `SUM(F${startDataRow6}:F${endDataRow6})` };
      totFin.numFmt = MONEY_FORMAT;

      const c7 = ws6.getCell(r6, 7); c7.value = '';
      const c8 = ws6.getCell(r6, 8); c8.value = '';

      [totFin, c7, c8].forEach((c) => {
        c.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_STYLES.white } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLES.totalBg } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = CELL_BORDER;
      });
      ws6.getRow(r6).height = 24;
    }

    autoFitWorksheetColumns(ws6, {
      1: 6, 2: 13, 3: 18, 4: 18, 5: 20, 6: 18, 7: 30, 8: 18
    });

    // =========================================================================
    // EXPORT WORKBOOK FILE DOWNLOAD
    // =========================================================================
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameStr;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast?.(`✓ تم تصدير شيت الرواتب والتقرير المالي الشامل (${fileNameStr}) بنجاح`);
    return true;
  } catch (error) {
    console.error('Error generating grand payroll excel:', error);
    showToast?.('⚠️ حدث خطأ أثناء تصدير شيت الإكسل الشامل');
    throw error;
  }
}
