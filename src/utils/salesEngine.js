import { loadExcelJS } from './excelExport';

/**
 * salesEngine.js
 * محرك الحسابات المتقدمة والإحصائيات وتصدير التقارير لشاشة مبيعات الفروع والتارجت
 */

export function getDaysInMonth(yearMonthStr) {
  if (!yearMonthStr) return 30;
  const [year, month] = yearMonthStr.split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

export function getDaysElapsed(yearMonthStr, referenceDateStr) {
  const [year, month] = (yearMonthStr || '').split('-').map(Number);
  const now = referenceDateStr ? new Date(referenceDateStr) : new Date();
  
  if (now.getFullYear() === year && (now.getMonth() + 1) === month) {
    return Math.max(1, now.getDate());
  }
  // If in future month
  const targetDate = new Date(year, month - 1, 1);
  if (now < targetDate) return 0;
  // If in past month
  return getDaysInMonth(yearMonthStr);
}

/**
 * حساب إحصائيات المبيعات والتارجت لكل فرع وللمجموعة ككل
 */
export function calculateBranchSalesMetrics({
  branchSales = [],
  branchSalesTargets = {},
  branches = [],
  selectedMonth = '',
  selectedDate = ''
}) {
  const currentMonth = selectedMonth || new Date().toISOString().slice(0, 7);
  const daysInMonth = getDaysInMonth(currentMonth);
  const daysElapsed = getDaysElapsed(currentMonth, selectedDate);
  const daysRemaining = Math.max(1, daysInMonth - daysElapsed);

  // Month target map for quick lookup
  const monthTargets = branchSalesTargets[currentMonth] || {};

  // Filter sales for the selected month
  const monthSales = branchSales.filter((s) => {
    if (!s || !s.date) return false;
    return s.date.slice(0, 7) === currentMonth;
  });

  // Filter sales for selected date (default today)
  const todayStr = selectedDate || new Date().toISOString().slice(0, 10);
  const dateSales = branchSales.filter((s) => s && s.date === todayStr);

  // Yesterday date
  const yesterdayObj = new Date(todayStr);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);
  const yesterdaySales = branchSales.filter((s) => s && s.date === yesterdayStr);

  const todayTotal = dateSales.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
  const yesterdayTotal = yesterdaySales.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
  const monthTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);

  // Total targets across all branches
  let totalMonthlyTarget = 0;
  branches.forEach((b) => {
    const t = parseFloat(monthTargets[b.id]) || 0;
    totalMonthlyTarget += t;
  });

  // Growth rate vs yesterday
  const dayGrowthPct = yesterdayTotal > 0
    ? (((todayTotal - yesterdayTotal) / yesterdayTotal) * 100).toFixed(1)
    : null;

  // Month target achievement %
  const overallAchievementRate = totalMonthlyTarget > 0
    ? ((monthTotal / totalMonthlyTarget) * 100).toFixed(1)
    : 0;

  // Run-rate projection for month
  const dailyRunRate = daysElapsed > 0 ? (monthTotal / daysElapsed) : 0;
  const projectedMonthTotal = dailyRunRate * daysInMonth;
  const projectedAchievementRate = totalMonthlyTarget > 0
    ? ((projectedMonthTotal / totalMonthlyTarget) * 100).toFixed(1)
    : 0;

  // Branch-by-branch analysis
  const branchSummaries = branches.map((branch) => {
    const bId = String(branch.id);
    const bSalesInMonth = monthSales.filter((s) => String(s.branchId) === bId);
    const bSalesInDate = dateSales.filter((s) => String(s.branchId) === bId);

    const bMonthTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
    const bCashTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.cashSales) || 0), 0);
    const bVisaTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.visaSales) || 0), 0);
    const bWalletTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.walletSales ?? s.electronicWalletSales) || 0), 0);
    const bInstapayTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.instapaySales) || 0), 0);
    const bDeliveryTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.deliverySales) || 0), 0);
    const bCreditTotal = bSalesInMonth.reduce((acc, s) => acc + (parseFloat(s.creditSales) || 0), 0);
    const bReceiptsTotal = bSalesInMonth.reduce((acc, s) => acc + (parseInt(s.receiptsCount, 10) || 0), 0);

    const bDateTotal = bSalesInDate.reduce((acc, s) => acc + (parseFloat(s.totalSales) || 0), 0);
    const bTarget = parseFloat(monthTargets[bId]) || 0;

    const bAchievementRate = bTarget > 0 ? ((bMonthTotal / bTarget) * 100) : 0;
    const bRemaining = Math.max(0, bTarget - bMonthTotal);

    // Run-rate projection per branch
    const bRunRate = daysElapsed > 0 ? (bMonthTotal / daysElapsed) : 0;
    const bProjectedTotal = bRunRate * daysInMonth;
    const bProjectedAchievement = bTarget > 0 ? ((bProjectedTotal / bTarget) * 100) : 0;

    // Required daily sales to hit target
    const bRequiredDaily = daysRemaining > 0 ? (bRemaining / daysRemaining) : 0;

    const avgBasket = bReceiptsTotal > 0 ? (bMonthTotal / bReceiptsTotal) : 0;

    return {
      branchId: bId,
      branchName: branch.name || branch.branchName || `فرع ${bId}`,
      branchCode: branch.code || '',
      dateTotal: bDateTotal,
      monthTotal: bMonthTotal,
      cashTotal: bCashTotal,
      visaTotal: bVisaTotal,
      walletTotal: bWalletTotal,
      instapayTotal: bInstapayTotal,
      deliveryTotal: bDeliveryTotal,
      creditTotal: bCreditTotal,
      receiptsTotal: bReceiptsTotal,
      avgBasket,
      target: bTarget,
      achievementRate: parseFloat(bAchievementRate.toFixed(1)),
      remaining: bRemaining,
      runRate: Math.round(bRunRate),
      projectedTotal: Math.round(bProjectedTotal),
      projectedAchievement: parseFloat(bProjectedAchievement.toFixed(1)),
      requiredDaily: Math.round(bRequiredDaily),
      status: bTarget === 0
        ? 'no_target'
        : bAchievementRate >= 100
          ? 'achieved'
          : bProjectedAchievement >= 95
            ? 'on_track'
            : 'lagging'
    };
  });

  const monthCashTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.cashSales) || 0), 0);
  const monthVisaTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.visaSales) || 0), 0);
  const monthWalletTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.walletSales ?? s.electronicWalletSales) || 0), 0);
  const monthInstapayTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.instapaySales) || 0), 0);
  const monthDeliveryTotal = monthSales.reduce((acc, s) => acc + (parseFloat(s.deliverySales) || 0), 0);

  return {
    todayTotal,
    yesterdayTotal,
    dayGrowthPct,
    monthTotal,
    monthCashTotal,
    monthVisaTotal,
    monthWalletTotal,
    monthInstapayTotal,
    monthDeliveryTotal,
    totalMonthlyTarget,
    overallAchievementRate: parseFloat(overallAchievementRate),
    projectedMonthTotal: Math.round(projectedMonthTotal),
    projectedAchievementRate: parseFloat(projectedAchievementRate),
    daysInMonth,
    daysElapsed,
    daysRemaining,
    branchSummaries
  };
}

/**
 * الحصول على ترتيب الفروع للمتصدرين (Leaderboard)
 */
export function getSalesLeaderboard({
  branchSummaries = [],
  branchSales = [],
  branches = [],
  mode = 'month', // 'month' | 'day' | 'achievement'
  topN = 3
}) {
  let list = [...branchSummaries];

  if (mode === 'day') {
    list.sort((a, b) => b.dateTotal - a.dateTotal);
  } else if (mode === 'achievement') {
    list.sort((a, b) => b.achievementRate - a.achievementRate);
  } else {
    // default month total
    list.sort((a, b) => b.monthTotal - a.monthTotal);
  }

  // Assign ranks
  const ranked = list.map((item, idx) => ({
    ...item,
    rank: idx + 1
  }));

  const effectiveN = topN === 'all' ? ranked.length : (parseInt(topN, 10) || 3);
  return {
    topBranches: ranked.slice(0, effectiveN),
    allBranches: ranked,
    winner: ranked[0] || null
  };
}

/**
 * تصدير ملف إكسل رسمي وشامل لمبيعات الفروع والتارجت
 */
export async function exportBranchSalesToExcel({
  branchSales = [],
  branchSummaries = [],
  branches = [],
  selectedMonth = '',
  selectedBranchId = 'all',
  showToast
}) {
  try {
    const ExcelJS = await loadExcelJS(showToast);
    if (!ExcelJS) throw new Error('تعذر تحميل مكتبة ExcelJS');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'منظومة الصيدليات - إدارة مبيعات الفروع';
    wb.created = new Date();

    const monthName = selectedMonth || new Date().toISOString().slice(0, 7);

    // ── ورقة 1: سجل المبيعات اليومية التفصيلي ──
    const ws1 = wb.addWorksheet('سجل المبيعات اليومية', {
      views: [{ rightToLeft: true }]
    });

    // Header Title
    ws1.mergeCells('A1:M1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = `تقرير مبيعات الفروع اليومية - لشهر (${monthName})`;
    titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 30;

    // Table Headers
    const headers1 = [
      'م',
      'التاريخ',
      'الفرع',
      'كاش (ج.م)',
      'فيزا / بطاقة (ج.م)',
      'محفظة إلكترونية (ج.م)',
      'إنستاباي (ج.م)',
      'دليفري (ج.م)',
      'آجل / أخرى (ج.م)',
      'إجمالي المبيعات (ج.م)',
      'عدد الفواتير',
      'متوسط الفاتورة',
      'المسؤول / ملاحظات'
    ];
    const hRow1 = ws1.addRow(headers1);
    hRow1.height = 24;
    hRow1.eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    // Filtered sales
    const filteredSales = branchSales.filter((s) => {
      if (!s || !s.date) return false;
      const mMatch = s.date.slice(0, 7) === monthName;
      const bMatch = selectedBranchId === 'all' || String(s.branchId) === String(selectedBranchId);
      return mMatch && bMatch;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    let sumCash = 0, sumVisa = 0, sumWallet = 0, sumInstapay = 0, sumDeliv = 0, sumCredit = 0, sumTotal = 0, sumReceipts = 0;

    filteredSales.forEach((s, idx) => {
      const c = parseFloat(s.cashSales) || 0;
      const v = parseFloat(s.visaSales) || 0;
      const w = parseFloat(s.walletSales ?? s.electronicWalletSales) || 0;
      const ip = parseFloat(s.instapaySales) || 0;
      const d = parseFloat(s.deliverySales) || 0;
      const cr = parseFloat(s.creditSales) || 0;
      const tot = parseFloat(s.totalSales) || (c + v + w + ip + d + cr);
      const rec = parseInt(s.receiptsCount, 10) || 0;
      const avg = rec > 0 ? (tot / rec) : (parseFloat(s.averageBasket) || 0);

      sumCash += c;
      sumVisa += v;
      sumWallet += w;
      sumInstapay += ip;
      sumDeliv += d;
      sumCredit += cr;
      sumTotal += tot;
      sumReceipts += rec;

      const row = ws1.addRow([
        idx + 1,
        s.date,
        s.branchName || `فرع ${s.branchId}`,
        c,
        v,
        w,
        ip,
        d,
        cr,
        tot,
        rec,
        parseFloat(avg.toFixed(2)),
        [s.shiftManager, s.notes].filter(Boolean).join(' - ')
      ]);

      row.height = 20;
      row.eachCell((cell, colIdx) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        // Format money columns: 4(cash), 5(visa), 6(wallet), 7(instapay), 8(deliv), 9(credit), 10(total), 12(avg)
        if ([4, 5, 6, 7, 8, 9, 10, 12].includes(colIdx)) {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    // Total Row
    const totRow1 = ws1.addRow([
      'الإجمالي',
      '',
      '-',
      sumCash,
      sumVisa,
      sumWallet,
      sumInstapay,
      sumDeliv,
      sumCredit,
      sumTotal,
      sumReceipts,
      sumReceipts > 0 ? parseFloat((sumTotal / sumReceipts).toFixed(2)) : 0,
      'إجمالي الفترة المحددة'
    ]);
    totRow1.height = 24;
    totRow1.eachCell((cell, colIdx) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if ([4, 5, 6, 7, 8, 9, 10, 12].includes(colIdx)) {
        cell.numFmt = '#,##0.00';
      }
    });

    // Auto Column Widths ws1
    ws1.columns.forEach((column) => {
      column.width = 16;
    });
    ws1.getColumn(1).width = 6;
    ws1.getColumn(3).width = 22;
    ws1.getColumn(13).width = 28;

    // ── ورقة 2: ملخص التارجت والأداء المقارن ──
    const ws2 = wb.addWorksheet('ملخص التارجت والأداء', {
      views: [{ rightToLeft: true }]
    });

    ws2.mergeCells('A1:H1');
    const tCell2 = ws2.getCell('A1');
    tCell2.value = `ملخص التارجت ومؤشرات الأداء المقارن للفروع - لشهر (${monthName})`;
    tCell2.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    tCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    tCell2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 30;

    const headers2 = [
      'الترتيب',
      'الفرع',
      'التارجت المستهدف (ج.م)',
      'المبيعات المحققة (ج.م)',
      'نسبة التحقيق',
      'المتبقي للتارجت (ج.م)',
      'المتوقع بنهاية الشهر (ج.م)',
      'تقييم الأداء'
    ];
    const hRow2 = ws2.addRow(headers2);
    hRow2.height = 24;
    hRow2.eachCell((cell) => {
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const sortedSummaries = [...branchSummaries].sort((a, b) => b.monthTotal - a.monthTotal);
    sortedSummaries.forEach((bs, idx) => {
      const statusLabel = bs.status === 'achieved'
        ? 'تم تحقيق التارجت 🏆'
        : bs.status === 'on_track'
          ? 'على المسار المطلوب 🟢'
          : bs.status === 'lagging'
            ? 'متأخر عن التارجت ⚠️'
            : 'لم يحدد تارجت';

      const row = ws2.addRow([
        idx + 1,
        bs.branchName,
        bs.target,
        bs.monthTotal,
        `${bs.achievementRate}%`,
        bs.remaining,
        bs.projectedTotal,
        statusLabel
      ]);

      row.height = 22;
      row.eachCell((cell, colIdx) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Arial', size: 10.5 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        if ([3, 4, 6, 7].includes(colIdx)) {
          cell.numFmt = '#,##0.00';
        }
      });
    });

    ws2.columns.forEach((column) => {
      column.width = 18;
    });
    ws2.getColumn(1).width = 8;
    ws2.getColumn(2).width = 24;
    ws2.getColumn(8).width = 22;

    // Download buffer
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `كشف-مبيعات-الفروع-والتارجت-${monthName}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);

    if (showToast) showToast('تم تنزيل كشف مبيعات الفروع بصيغة Excel بنجاح ✅');
  } catch (err) {
    console.error('Excel Export Error:', err);
    if (showToast) showToast(`فشل تصدير ملف الإكسل: ${err.message || ''}`, 'error');
  }
}
