import { loadExcelJS } from './excelExport';

/**
 * financialReportsEngine.js
 * محرك الحسابات المالية المتقدمة، تحليل الأرباح والخسائر، وتصدير التقارير المالية المعتمدة
 */

/**
 * حساب نطاق التواريخ بناءً على وضع الفترة المختار
 */
export function resolveDateRange({
  periodMode = 'month',
  selectedMonth = '',
  customFrom = '',
  customTo = '',
  referenceDate = new Date()
}) {
  const now = new Date(referenceDate);
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1; // 1-12

  let startDate = '';
  let endDate = '';
  let label = '';

  const pad = (n) => String(n).padStart(2, '0');
  const formatYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (periodMode) {
    case 'today': {
      const dStr = formatYMD(now);
      startDate = dStr;
      endDate = dStr;
      label = `اليوم (${dStr})`;
      break;
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const dStr = formatYMD(y);
      startDate = dStr;
      endDate = dStr;
      label = `أمس (${dStr})`;
      break;
    }
    case 'week': {
      // Current week (Sat to Fri in Arab world or last 7 days)
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      startDate = formatYMD(start);
      endDate = formatYMD(now);
      label = `آخر 7 أيام (من ${startDate} إلى ${endDate})`;
      break;
    }
    case 'month': {
      const mStr = selectedMonth || `${currentYear}-${pad(currentMonthNum)}`;
      const [y, m] = mStr.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${pad(m)}-01`;
      endDate = `${y}-${pad(m)}-${pad(lastDay)}`;
      label = `شهر (${mStr})`;
      break;
    }
    case 'last_month': {
      const prevDate = new Date(currentYear, now.getMonth() - 1, 1);
      const y = prevDate.getFullYear();
      const m = prevDate.getMonth() + 1;
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${pad(m)}-01`;
      endDate = `${y}-${pad(m)}-${pad(lastDay)}`;
      label = `الشهر السابق (${y}-${pad(m)})`;
      break;
    }
    case 'quarter': {
      // Current Quarter
      const qIndex = Math.floor((currentMonthNum - 1) / 3); // 0: Q1, 1: Q2, 2: Q3, 3: Q4
      const startMonth = qIndex * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(currentYear, endMonth, 0).getDate();
      startDate = `${currentYear}-${pad(startMonth)}-01`;
      endDate = `${currentYear}-${pad(endMonth)}-${pad(lastDay)}`;
      label = `الربع السنوي Q${qIndex + 1} (${currentYear})`;
      break;
    }
    case 'year': {
      // Year to Date (YTD)
      startDate = `${currentYear}-01-01`;
      endDate = formatYMD(now);
      label = `من بداية العام حتى الآن (${currentYear})`;
      break;
    }
    case 'custom': {
      startDate = customFrom || `${currentYear}-${pad(currentMonthNum)}-01`;
      endDate = customTo || formatYMD(now);
      label = `فترة مخصصة (من ${startDate} إلى ${endDate})`;
      break;
    }
    default: {
      const mStr = selectedMonth || `${currentYear}-${pad(currentMonthNum)}`;
      const [y, m] = mStr.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      startDate = `${y}-${pad(m)}-01`;
      endDate = `${y}-${pad(m)}-${pad(lastDay)}`;
      label = `شهر (${mStr})`;
    }
  }

  return { startDate, endDate, label };
}

/**
 * فحص ما إذا كان التاريخ يقع ضمن النطاق الزمني
 */
export function isDateInRange(dateStr, startDate, endDate) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

/**
 * الحساب الشامل لكافة البيانات والتقارير المالية والأرباح
 */
export function computeComprehensiveFinancialReport({
  state,
  filterBranchId = 'all',
  periodMode = 'month',
  selectedMonth = '',
  customFrom = '',
  customTo = '',
  computeEmpSummary = null
}) {
  const { startDate, endDate, label: periodLabel } = resolveDateRange({
    periodMode,
    selectedMonth,
    customFrom,
    customTo
  });

  const dateFilterFn = (d) => isDateInRange(d, startDate, endDate);

  const branches = state?.branches || [];
  const employees = state?.employees || [];
  const rawSales = state?.branchSales || [];
  const rawFinances = state?.finances || state?.transactions || [];
  const rawAdjustments = state?.adjustments || [];
  const rawLoans = state?.loans || [];

  // Determine active target branches
  const targetBranches = filterBranchId === 'all'
    ? branches
    : branches.filter((b) => String(b.id) === String(filterBranchId));

  const isSingleBranch = filterBranchId !== 'all';
  const singleBranchName = isSingleBranch
    ? (branches.find((b) => String(b.id) === String(filterBranchId))?.name || `فرع ${filterBranchId}`)
    : 'كافة الفروع';

  // ── 1. تجميع المبيعات والإيرادات (Revenues) ──
  const filteredSales = rawSales.filter((s) => {
    if (!s || !s.date) return false;
    if (!dateFilterFn(s.date)) return false;
    if (isSingleBranch && String(s.branchId) !== String(filterBranchId)) return false;
    return true;
  });

  let totalCashSales = 0;
  let totalVisaSales = 0;
  let totalWalletSales = 0;
  let totalInstapaySales = 0;
  let totalDeliverySales = 0;
  let totalCreditSales = 0;
  let totalBranchSales = 0;
  let totalReceiptsCount = 0;

  filteredSales.forEach((s) => {
    const c = parseFloat(s.cashSales) || 0;
    const v = parseFloat(s.visaSales) || 0;
    const w = parseFloat(s.walletSales ?? s.electronicWalletSales) || 0;
    const ip = parseFloat(s.instapaySales) || 0;
    const d = parseFloat(s.deliverySales) || 0;
    const cr = parseFloat(s.creditSales) || 0;
    const tot = parseFloat(s.totalSales) || (c + v + w + ip + d + cr);
    const rec = parseInt(s.receiptsCount, 10) || 0;

    totalCashSales += c;
    totalVisaSales += v;
    totalWalletSales += w;
    totalInstapaySales += ip;
    totalDeliverySales += d;
    totalCreditSales += cr;
    totalBranchSales += tot;
    totalReceiptsCount += rec;
  });

  // Other Incomes from finances module
  const filteredOtherIncomes = rawFinances.filter((f) => {
    if (!f || f.type !== 'income') return false;
    const fDate = f.date || f.createdAt || '';
    if (!dateFilterFn(fDate)) return false;
    if (isSingleBranch && f.branchId && String(f.branchId) !== String(filterBranchId)) return false;
    return true;
  });

  const totalOtherIncome = filteredOtherIncomes.reduce(
    (acc, f) => acc + (parseFloat(f.amount) || 0),
    0
  );

  const totalGrossRevenues = totalBranchSales + totalOtherIncome;

  // ── 2. تجميع المصروفات التشغيلية والنثرية (Operating Expenses) ──
  const filteredExpenses = rawFinances.filter((f) => {
    if (!f || (f.type !== 'expense' && f.type !== 'مصروف')) return false;
    const fDate = f.date || f.createdAt || '';
    if (!dateFilterFn(fDate)) return false;
    if (isSingleBranch && f.branchId && String(f.branchId) !== String(filterBranchId)) return false;
    return true;
  });

  const expenseCategoryMap = {};
  let totalOperatingExpenses = 0;

  filteredExpenses.forEach((exp) => {
    const amt = parseFloat(exp.amount) || 0;
    const cat = (exp.category || 'نثريات ومصروفات عامة').trim();
    totalOperatingExpenses += amt;
    expenseCategoryMap[cat] = (expenseCategoryMap[cat] || 0) + amt;
  });

  const expensesByCategory = Object.entries(expenseCategoryMap).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalOperatingExpenses > 0 ? ((amount / totalOperatingExpenses) * 100).toFixed(1) : 0
  })).sort((a, b) => b.amount - a.amount);

  // ── 3. تجميع كلفة الرواتب ومسير الأجور (Payroll & Wages) ──
  let totalBaseEarnings = 0;
  let totalOvertimeEarnings = 0;
  let totalAllowances = 0;
  let totalGrossPayroll = 0;
  let totalNetPayroll = 0;
  let totalHoursWorked = 0;
  let empBonusesSum = 0;
  let empDeductionsSum = 0;

  const targetEmployees = employees.filter((emp) => {
    if (!emp) return false;
    if (!isSingleBranch) return true;
    const hasBranch = emp.branchId === filterBranchId ||
      (Array.isArray(emp.branchesDetails) && emp.branchesDetails.some((bd) => String(bd.branchId) === String(filterBranchId)));
    return hasBranch;
  });

  targetEmployees.forEach((emp) => {
    if (computeEmpSummary) {
      const summary = computeEmpSummary(
        emp.id,
        dateFilterFn,
        periodMode === 'month' ? selectedMonth : null,
        isSingleBranch ? filterBranchId : null
      );

      const baseEarn = Math.max(0, summary.baseEarnings || 0);
      const otEarn = Math.max(0, summary.overtimeEarnings || 0);
      const allowEarn = Math.max(0, summary.totalAllowances || 0);
      const hours = summary.hours || 0;

      totalBaseEarnings += baseEarn;
      totalOvertimeEarnings += otEarn;
      totalAllowances += allowEarn;
      totalHoursWorked += hours;
      totalGrossPayroll += (baseEarn + otEarn + allowEarn);

      empBonusesSum += Math.max(0, summary.totalBonus || 0);
      empDeductionsSum += Math.max(0, summary.totalDeduction || 0);

      // في الحسابات المالية للمنشأة، صافي الراتب المستحق للموظف لا يمكن أن يكون سالباً في مسير الأجور المنصرف:
      // إذا لم يكن لدى الموظف ساعات عمل أو كانت الاستقطاعات أكبر من مستحقاته، يكون المستحق الصافي المنصرف = 0 ج.م
      const payableSalary = Math.max(0, summary.netSalary || 0);
      totalNetPayroll += payableSalary;
    }
  });

  // ── 4. تجميع المكافآت والخصومات (Adjustments) ──
  const filteredAdjustments = rawAdjustments.filter((adj) => {
    if (!adj || !adj.date) return false;
    if (!dateFilterFn(adj.date)) return false;
    if (isSingleBranch) {
      if (adj.branchId && String(adj.branchId) !== String(filterBranchId)) return false;
      if (!adj.branchId && adj.employeeId && adj.employeeId !== 'all') {
        const emp = employees.find((e) => String(e.id) === String(adj.employeeId));
        if (emp && String(emp.branchId) !== String(filterBranchId)) return false;
      }
    }
    return true;
  });

  let rawBonusSum = 0;
  let rawDeductionSum = 0;

  filteredAdjustments.forEach((adj) => {
    const amt = parseFloat(adj.amount) || 0;
    if (adj.type === 'bonus' || adj.type === 'مكافأة') {
      rawBonusSum += amt;
    } else if (adj.type === 'deduction' || adj.type === 'penalty' || adj.type === 'خصم' || adj.type === 'جزاء') {
      rawDeductionSum += amt;
    }
  });

  const totalBonuses = empBonusesSum > 0 ? empBonusesSum : rawBonusSum;
  // إذا لم يكن هناك ساعات عمل مسجلة، لا تُحتسب استقطاعات الغياب كخصم مسير
  const totalDeductions = totalHoursWorked > 0 ? (empDeductionsSum > 0 ? empDeductionsSum : rawDeductionSum) : rawDeductionSum;

  // ── 5. حركة السلف والأجل (Loans Movement) ──
  const filteredLoans = rawLoans.filter((l) => {
    if (!l) return false;
    const lDate = l.date || l.createdAt || '';
    if (!dateFilterFn(lDate)) return false;
    if (isSingleBranch) {
      if (l.branchId && String(l.branchId) !== String(filterBranchId)) return false;
      if (!l.branchId && l.employeeId) {
        const emp = employees.find((e) => String(e.id) === String(l.employeeId));
        if (emp && String(emp.branchId) !== String(filterBranchId)) return false;
      }
    }
    return true;
  });

  let totalLoansDisbursed = 0;
  let totalLoansRepaid = 0;

  filteredLoans.forEach((l) => {
    const amt = parseFloat(l.amount || l.totalAmount) || 0;
    const paid = parseFloat(l.paidAmount) || 0;
    totalLoansDisbursed += amt;
    totalLoansRepaid += paid;
  });

  // ── 6. الحسابات الصافية وهوامش الربحية (Net Profit & Margins) ──
  // التكاليف والمصروفات قيم موجبة دائماً في القوائم المالية
  const safePayroll = Math.max(0, totalNetPayroll);
  const safeOperatingExpenses = Math.max(0, totalOperatingExpenses);
  const totalOperatingCosts = safePayroll + safeOperatingExpenses;

  // صافي الربح التشغيلي = مجمل الإيرادات - إجمالي التكاليف
  const netProfit = totalGrossRevenues - totalOperatingCosts;
  const profitMargin = totalGrossRevenues > 0
    ? ((netProfit / totalGrossRevenues) * 100)
    : (netProfit < 0 ? -100 : 0);
  const payrollRatio = totalGrossRevenues > 0 ? ((safePayroll / totalGrossRevenues) * 100) : 0;
  const expensesRatio = totalGrossRevenues > 0 ? ((safeOperatingExpenses / totalGrossRevenues) * 100) : 0;

  // ── 7. مقارنة الفروع المعيارية (Branch Benchmark Breakdown) ──
  const branchBenchmarks = branches.map((b) => {
    const bId = String(b.id);
    const bName = b.name || b.branchName || `فرع ${bId}`;

    // Branch Sales
    const bSales = rawSales.filter((s) => s && s.date && dateFilterFn(s.date) && String(s.branchId) === bId);
    const bTotalSales = bSales.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
    const bCash = bSales.reduce((acc, s) => acc + (parseFloat(s.cashSales) || 0), 0);
    const bVisa = bSales.reduce((acc, s) => acc + (parseFloat(s.visaSales) || 0), 0);
    const bWallet = bSales.reduce((acc, s) => acc + (parseFloat(s.walletSales ?? s.electronicWalletSales) || 0), 0);
    const bInstapay = bSales.reduce((acc, s) => acc + (parseFloat(s.instapaySales) || 0), 0);
    const bDelivery = bSales.reduce((acc, s) => acc + (parseFloat(s.deliverySales) || 0), 0);

    // Branch Other Incomes
    const bIncomes = rawFinances.filter((f) => f && f.type === 'income' && dateFilterFn(f.date || f.createdAt) && String(f.branchId) === bId);
    const bOtherIncome = bIncomes.reduce((acc, f) => acc + (parseFloat(f.amount) || 0), 0);
    const bGrossRevenue = bTotalSales + bOtherIncome;

    // Branch Expenses
    const bExpenses = rawFinances.filter((f) => f && (f.type === 'expense' || f.type === 'مصروف') && dateFilterFn(f.date || f.createdAt) && String(f.branchId) === bId);
    const bTotalExpenses = bExpenses.reduce((acc, f) => acc + (parseFloat(f.amount) || 0), 0);

    // Branch Payroll (always non-negative)
    let bPayroll = 0;
    const bEmployees = employees.filter((emp) => {
      if (!emp) return false;
      return emp.branchId === bId || (Array.isArray(emp.branchesDetails) && emp.branchesDetails.some((bd) => String(bd.branchId) === bId));
    });

    bEmployees.forEach((emp) => {
      if (computeEmpSummary) {
        const sum = computeEmpSummary(emp.id, dateFilterFn, periodMode === 'month' ? selectedMonth : null, bId);
        bPayroll += Math.max(0, sum.netSalary || 0);
      }
    });

    const bSafePayroll = Math.max(0, bPayroll);
    const bSafeExpenses = Math.max(0, bTotalExpenses);
    const bTotalCosts = bSafePayroll + bSafeExpenses;
    const bNetProfit = bGrossRevenue - bTotalCosts;
    const bMargin = bGrossRevenue > 0
      ? ((bNetProfit / bGrossRevenue) * 100)
      : (bNetProfit < 0 ? -100 : 0);
    const bPayrollRatio = bGrossRevenue > 0 ? ((bSafePayroll / bGrossRevenue) * 100) : 0;

    return {
      branchId: bId,
      branchName: bName,
      branchCode: b.code || b.branchCode || '',
      sales: bTotalSales,
      cashSales: bCash,
      visaSales: bVisa,
      walletSales: bWallet,
      instapaySales: bInstapay,
      deliverySales: bDelivery,
      otherIncome: bOtherIncome,
      grossRevenue: bGrossRevenue,
      operatingExpenses: bSafeExpenses,
      payroll: bPayroll,
      totalCosts: bTotalCosts,
      netProfit: bNetProfit,
      profitMargin: parseFloat(bMargin.toFixed(1)),
      payrollRatio: parseFloat(bPayrollRatio.toFixed(1)),
      status: bNetProfit >= 0 ? (bMargin >= 15 ? 'healthy' : 'moderate') : 'loss'
    };
  }).sort((a, b) => b.netProfit - a.netProfit);

  // ── 8. تقييم السلامة المالية والمؤشرات التنبيهية ──
  const healthAlerts = [];
  if (totalGrossRevenues > 0 && payrollRatio > 25) {
    healthAlerts.push({
      type: 'warning',
      title: 'ارتفاع نسبة الرواتب عن المعدل الطبيعي',
      message: `تمثل الرواتب حالياً ${payrollRatio.toFixed(1)}% من إجمالي المبيعات، في حين يوصى بألا تتجاوز 18-20% في الصيدليات.`
    });
  }

  const lossBranches = branchBenchmarks.filter((b) => b.netProfit < 0 && b.grossRevenue > 0);
  if (lossBranches.length > 0) {
    healthAlerts.push({
      type: 'danger',
      title: `وجود ${lossBranches.length} فرع يحقق صافي عجز مالي`,
      message: `الفروع (${lossBranches.map((b) => b.branchName).join('، ')}) تتجاوز تكاليف تشغيلها ورواتبها إجمالي مبيعاتها خلال هذه الفترة.`
    });
  }

  if (totalGrossRevenues > 0 && profitMargin >= 15) {
    healthAlerts.push({
      type: 'success',
      title: 'مؤشر أداء مالي ممتاز وفائض ربحي متزن',
      message: `المؤسسة تحقق هامش ربح صافي قدره ${profitMargin.toFixed(1)}% مع توازن إيجابي بين الإيرادات والمصروفات.`
    });
  }

  return {
    periodLabel,
    startDate,
    endDate,
    isSingleBranch,
    singleBranchName,
    filterBranchId,

    // Revenues
    totalBranchSales,
    totalCashSales,
    totalVisaSales,
    totalWalletSales,
    totalInstapaySales,
    totalDeliverySales,
    totalCreditSales,
    totalReceiptsCount,
    totalOtherIncome,
    totalGrossRevenues,

    // Expenses
    totalOperatingExpenses,
    expensesByCategory,

    // Payroll
    totalBaseEarnings,
    totalOvertimeEarnings,
    totalAllowances,
    totalGrossPayroll,
    totalNetPayroll,
    totalHoursWorked,

    // Adjustments
    totalBonuses,
    totalDeductions,

    // Loans
    totalLoansDisbursed,
    totalLoansRepaid,

    // Profit & Margins
    totalOperatingCosts,
    netProfit,
    profitMargin: parseFloat(profitMargin.toFixed(1)),
    payrollRatio: parseFloat(payrollRatio.toFixed(1)),
    expensesRatio: parseFloat(expensesRatio.toFixed(1)),

    // Benchmarks & Alerts
    branchBenchmarks,
    healthAlerts,
    filteredSales,
    filteredExpenses
  };
}

/**
 * تصدير ملف إكسل رسمي متعدد الأوراق لقائمة الدخل والتقارير المالية
 */
export async function exportComprehensiveFinancialToExcel({
  reportData,
  showToast
}) {
  try {
    const ExcelJS = await loadExcelJS(showToast);
    if (!ExcelJS) throw new Error('تعذر تحميل مكتبة ExcelJS');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'منظومة إدارة الموارد البشرية والمالية';
    wb.created = new Date();

    const {
      periodLabel,
      totalBranchSales,
      totalCashSales,
      totalVisaSales,
      totalWalletSales,
      totalInstapaySales,
      totalDeliverySales,
      totalCreditSales,
      totalOtherIncome,
      totalGrossRevenues,
      totalNetPayroll,
      totalOperatingExpenses,
      totalOperatingCosts,
      netProfit,
      profitMargin,
      payrollRatio,
      expensesByCategory,
      branchBenchmarks
    } = reportData;

    // ── ورقة 1: قائمة الدخل والأرباح والخسائر (P&L Income Statement) ──
    const ws1 = wb.addWorksheet('قائمة الدخل والأرباح', {
      views: [{ rightToLeft: true }]
    });

    // Title
    ws1.mergeCells('A1:D1');
    const title = ws1.getCell('A1');
    title.value = `تقرير قائمة الدخل والأرباح والخسائر الشاملة — ${periodLabel}`;
    title.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 32;

    const headers1 = ['البيان المحاسبي', 'القيمة الجزئية (ج.م)', 'القيمة الإجمالية (ج.م)', 'النسبة المئوية %'];
    const hRow1 = ws1.addRow(headers1);
    hRow1.height = 24;
    hRow1.eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const addSection = (titleText) => {
      const r = ws1.addRow([titleText, '', '', '']);
      r.height = 22;
      r.eachCell((cell) => {
        cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      });
    };

    const addRow = (label, partial, total, pct = '', isBold = false) => {
      const r = ws1.addRow([label, partial !== '' ? partial : '', total !== '' ? total : '', pct]);
      r.height = 20;
      r.eachCell((cell, colIdx) => {
        cell.font = { name: 'Arial', size: 10.5, bold: isBold };
        cell.alignment = { horizontal: colIdx === 1 ? 'right' : 'center', vertical: 'middle' };
        if ([2, 3].includes(colIdx) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      });
      return r;
    };

    // Section 1: Revenues
    addSection('1. إجمالي الإيرادات والمبيعات (Revenues)');
    addRow('مبيعات نقدية (كاش)', totalCashSales, '');
    addRow('مبيعات فيزا وبطاقات بنكية', totalVisaSales, '');
    addRow('مبيعات محفظة إلكترونية (فودافون كاش ومحافظ)', totalWalletSales, '');
    addRow('مبيعات إنستاباي وتحويلات IPN', totalInstapaySales, '');
    addRow('مبيعات دليفري وتوصيل', totalDeliverySales, '');
    addRow('مبيعات آجل وشركات', totalCreditSales, '');
    addRow('إجمالي مبيعات الفروع والصيدليات', '', totalBranchSales, '100%', true);
    addRow('إيرادات تشغيلية أخرى متفرقة', '', totalOtherIncome, '');
    const revRow = addRow('صافي مجمل الإيرادات (Gross Revenue)', '', totalGrossRevenues, '100%', true);
    revRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

    // Section 2: Operating Costs & Payroll
    addSection('2. تكاليف الأجور والتشغيل (Operating Costs)');
    addRow('مسير صافي أجور ورواتب الموظفين', '', totalNetPayroll, `${payrollRatio}%`, true);
    addRow('المصروفات التشغيلية والنثرية', '', totalOperatingExpenses, '', true);
    expensesByCategory.forEach((cat) => {
      addRow(`  • ${cat.category}`, cat.amount, '', `${cat.percentage}%`);
    });
    const costRow = addRow('إجمالي التكاليف والمصروفات (Total Costs)', '', totalOperatingCosts, '', true);
    costRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

    // Section 3: Net Profit
    addSection('3. صافي الأرباح التشغيلية (Net Profit)');
    const profitRow = addRow(
      netProfit >= 0 ? '🏆 صافي الربح الفعلي (Net Profit)' : '⚠️ صافي العجز والخسارة (Net Loss)',
      '',
      netProfit,
      `${profitMargin}%`,
      true
    );
    profitRow.height = 26;
    profitRow.getCell(3).font = { name: 'Arial', bold: true, size: 13, color: { argb: netProfit >= 0 ? 'FF15803D' : 'FFDC2626' } };
    profitRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netProfit >= 0 ? 'FFBBF7D0' : 'FFFECACA' } };

    ws1.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 16 }];

    // ── ورقة 2: مقارنة الأداء المالي بين الفروع (Branch Benchmark) ──
    const ws2 = wb.addWorksheet('المقارنة المالية بين الفروع', {
      views: [{ rightToLeft: true }]
    });

    ws2.mergeCells('A1:H1');
    const t2 = ws2.getCell('A1');
    t2.value = `تقرير المقارنة المالية والأرباح بين الصيدليات — ${periodLabel}`;
    t2.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 32;

    const headers2 = ['الترتيب', 'الفرع', 'إجمالي المبيعات (ج.م)', 'مسير الرواتب (ج.م)', 'المصروفات (ج.م)', 'إجمالي التكاليف', 'صافي الربح (ج.م)', 'هامش الربح %'];
    const hRow2 = ws2.addRow(headers2);
    hRow2.height = 24;
    hRow2.eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    branchBenchmarks.forEach((b, idx) => {
      const r = ws2.addRow([
        idx + 1,
        b.branchName,
        b.grossRevenue,
        b.payroll,
        b.operatingExpenses,
        b.totalCosts,
        b.netProfit,
        `${b.profitMargin}%`
      ]);
      r.height = 20;
      r.eachCell((cell, cIdx) => {
        cell.alignment = { horizontal: cIdx === 2 ? 'right' : 'center', vertical: 'middle' };
        if ([3, 4, 5, 6, 7].includes(cIdx)) {
          cell.numFmt = '#,##0.00';
        }
        if (cIdx === 7) {
          cell.font = { bold: true, color: { argb: b.netProfit >= 0 ? 'FF15803D' : 'FFDC2626' } };
        }
      });
    });

    ws2.columns = [{ width: 8 }, { width: 26 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 16 }];

    // Download File
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `التقرير-المالي-الشامل-وصافي-الأرباح-${periodLabel.replace(/\s+/g, '-')}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);

    if (showToast) showToast('تم تنزيل كشف التقرير المالي بصيغة Excel بنجاح ✅');
  } catch (err) {
    console.error('Excel Export Error:', err);
    if (showToast) showToast(`فشل تصدير ملف الإكسل: ${err.message || ''}`, 'error');
  }
}
