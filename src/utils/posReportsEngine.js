/**
 * 📊 محرك تقارير نقطة البيع الصيدلية الحصري (PharmaOS POS-Only Reports Engine)
 * 
 * محرك تجميع وحسابات دقيقة لحركة الكاشير، الورديات، الفواتير، المرتجعات، 
 * الرقابة الأمنية، الدليفري، الأرباح، وتصدير إكسيل والطباعة الحرارية.
 */

import { loadExcelJS } from './excelExport';

/**
 * 1. حساب تقارير الورديات والدرج (X-Report & Z-Report & Tenders)
 */
export function calculateShiftReports(sales = [], shift = {}, returns = [], auditLogs = [], filterParams = {}) {
  const targetShiftId = shift?.id;
  const filteredSales = sales.filter((s) => {
    if (targetShiftId && s.shiftId && s.shiftId !== targetShiftId) return false;
    if (filterParams.branchId && filterParams.branchId !== 'all' && s.branchId !== filterParams.branchId) return false;
    if (filterParams.dateFrom && s.createdAt && s.createdAt.slice(0, 10) < filterParams.dateFrom) return false;
    if (filterParams.dateTo && s.createdAt && s.createdAt.slice(0, 10) > filterParams.dateTo) return false;
    return true;
  });

  const filteredReturns = returns.filter((r) => {
    if (targetShiftId && r.shiftId && r.shiftId !== targetShiftId) return false;
    if (filterParams.branchId && filterParams.branchId !== 'all' && r.branchId !== filterParams.branchId) return false;
    return true;
  });

  // حساب وسائل الدفع
  let cashSales = 0;
  let cardSales = 0;
  let instapaySales = 0;
  let vodafoneCashSales = 0;
  let insuranceCreditSales = 0;
  let otherSales = 0;

  filteredSales.forEach((s) => {
    const total = parseFloat(s.totalAmount || s.netTotal || 0);
    const method = String(s.paymentMethod || 'cash').toLowerCase();

    if (method === 'cash') cashSales += total;
    else if (method === 'card' || method === 'visa') cardSales += total;
    else if (method === 'instapay') instapaySales += total;
    else if (method === 'vodafone_cash' || method === 'wallet') vodafoneCashSales += total;
    else if (method === 'insurance' || method === 'credit') insuranceCreditSales += total;
    else otherSales += total;
  });

  const totalSalesNet = cashSales + cardSales + instapaySales + vodafoneCashSales + insuranceCreditSales + otherSales;
  const totalReturnsCash = filteredReturns.reduce((sum, r) => sum + (parseFloat(r.refundAmount || r.totalRefund || 0)), 0);

  const openingCash = parseFloat(shift?.openingCash || 0);
  const pettyExpenses = parseFloat(shift?.pettyExpenses || 0);
  const safeDrops = parseFloat(shift?.safeDrops || 0);

  // النقدية المحسوبة المفترض وجودها بالدرج (Expected Cash)
  const expectedCashInDrawer = openingCash + cashSales - totalReturnsCash - pettyExpenses - safeDrops;
  const countedCash = shift?.physicalCash !== undefined && shift?.physicalCash !== null ? parseFloat(shift.physicalCash) : null;
  const cashDifference = countedCash !== null ? (countedCash - expectedCashInDrawer) : 0;

  return {
    shiftId: shift?.id || 'live_shift',
    branchId: shift?.branchId || filterParams.branchId || 'main',
    branchName: shift?.branchName || 'الفرع الرئيسي',
    cashierName: shift?.cashierName || 'صيدلي الكاشير',
    cashierId: shift?.cashierId || 'cashier_1',
    cashierEmpCode: shift?.cashierEmpCode || '101',
    startTime: shift?.startTime || new Date().toISOString(),
    endTime: shift?.endTime || null,
    status: shift?.status || 'OPEN',
    openingCash,
    cashSales,
    cardSales,
    instapaySales,
    vodafoneCashSales,
    insuranceCreditSales,
    otherSales,
    totalSalesNet,
    totalReturnsCash,
    pettyExpenses,
    safeDrops,
    expectedCashInDrawer,
    countedCash,
    cashDifference,
    invoicesCount: filteredSales.length,
    returnsCount: filteredReturns.length
  };
}

/**
 * 2. شريط المبيعات الكرونولوجي اليومي (Daily Sales Journal)
 */
export function calculateDailySalesJournal(sales = [], filterParams = {}) {
  return sales
    .filter((s) => {
      if (filterParams.branchId && filterParams.branchId !== 'all' && s.branchId !== filterParams.branchId) return false;
      if (filterParams.cashierEmpCode && filterParams.cashierEmpCode !== 'all' && s.cashierEmpCode !== filterParams.cashierEmpCode) return false;
      if (filterParams.paymentMethod && filterParams.paymentMethod !== 'all' && s.paymentMethod !== filterParams.paymentMethod) return false;
      if (filterParams.invoiceType && filterParams.invoiceType !== 'all' && (s.invoiceType || 'otc') !== filterParams.invoiceType) return false;
      if (filterParams.dateFrom && s.createdAt && s.createdAt.slice(0, 10) < filterParams.dateFrom) return false;
      if (filterParams.dateTo && s.createdAt && s.createdAt.slice(0, 10) > filterParams.dateTo) return false;
      if (filterParams.search) {
        const q = filterParams.search.toLowerCase();
        const num = String(s.invoiceNumber || '').toLowerCase();
        const cust = String(s.customerName || '').toLowerCase();
        const phone = String(s.customerPhone || '').toLowerCase();
        const type = String(s.invoiceType || 'otc').toLowerCase();
        if (!num.includes(q) && !cust.includes(q) && !phone.includes(q) && !type.includes(q)) return false;
      }
      return true;
    })
    .map((s) => {
      const subtotal = parseFloat(s.subtotal || 0);
      const discount = parseFloat(s.discountAmount || 0);
      const total = parseFloat(s.totalAmount || s.netTotal || 0);
      const profit = parseFloat(s.actualGrossProfit || (total * 0.22)); // تقدير ربح إن لم يكن مسجلاً
      const invoiceType = s.invoiceType || 'otc';
      const invoiceTypeLabel = {
        otc: '🟢 OTC (لا وصفية)',
        rx: '💊 روشتة (Rx)',
        customer_order: '📋 طلب عميل',
        delivery: '🛵 دليفري'
      }[invoiceType] || '🟢 OTC';

      return {
        id: s.id || s.invoiceNumber,
        invoiceNumber: s.invoiceNumber,
        createdAt: s.createdAt || new Date().toISOString(),
        cashierEmpCode: s.cashierEmpCode || '101',
        cashierEmpName: s.cashierEmpName || s.cashierName || 'الصيدلي',
        customerName: s.customerName || 'عميل نقدي',
        customerPhone: s.customerPhone || '-',
        itemsCount: (s.items || []).length,
        subtotal,
        discountAmount: discount,
        netTotal: total,
        paymentMethod: s.paymentMethod || 'cash',
        invoiceType,
        invoiceTypeLabel,
        grossProfit: profit,
        isChronic: Boolean(s.isChronic),
        deliveryPilotName: s.deliveryPilotName || null,
        items: s.items || []
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 3. تقرير مبيعات الأصناف التفصيلي والتجزئة (POS Itemized Sales)
 */
export function calculateItemizedSales(sales = [], filterParams = {}) {
  const itemsMap = new Map();

  sales.forEach((sale) => {
    if (filterParams.branchId && filterParams.branchId !== 'all' && sale.branchId !== filterParams.branchId) return;
    if (filterParams.dateFrom && sale.createdAt && sale.createdAt.slice(0, 10) < filterParams.dateFrom) return;
    if (filterParams.dateTo && sale.createdAt && sale.createdAt.slice(0, 10) > filterParams.dateTo) return;

    (sale.items || []).forEach((item) => {
      const prodId = item.productId || item.tradeNameAr || item.name;
      const key = `${prodId}_${item.unitType || 'base'}`;

      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          productId: prodId,
          tradeNameAr: item.tradeNameAr || item.name || 'دواء',
          barcode: item.barcode || '-',
          category: item.category || 'أدوية',
          unitType: item.unitType || 'base',
          unitLabel: item.unitLabel || (item.unitType === 'piece' ? 'قرص/أمبول' : item.unitType === 'sub' ? 'شريط' : 'علبة كاملة'),
          unitPrice: parseFloat(item.unitPrice || 0),
          totalQuantitySold: 0,
          totalRevenue: 0,
          totalProfit: 0,
          timesSold: 0
        });
      }

      const record = itemsMap.get(key);
      const qty = parseFloat(item.quantity || 1);
      const total = parseFloat(item.lineTotal || (qty * item.unitPrice) || 0);
      const profit = parseFloat(item.lineProfit || (total * 0.25));

      record.totalQuantitySold += qty;
      record.totalRevenue += total;
      record.totalProfit += profit;
      record.timesSold += 1;
    });
  });

  return Array.from(itemsMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

/**
 * 4. تقرير ساعات الذروة وكثافة الكاشير (Hourly POS Traffic)
 */
export function calculateHourlyTraffic(sales = [], filterParams = {}) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i === 0 ? '12' : i > 12 ? i - 12 : i}:00 ${i >= 12 ? 'مساءً' : 'صباحاً'}`,
    invoicesCount: 0,
    totalSales: 0
  }));

  sales.forEach((s) => {
    if (filterParams.branchId && filterParams.branchId !== 'all' && s.branchId !== filterParams.branchId) return;
    if (filterParams.dateFrom && s.createdAt && s.createdAt.slice(0, 10) < filterParams.dateFrom) return;
    if (filterParams.dateTo && s.createdAt && s.createdAt.slice(0, 10) > filterParams.dateTo) return;

    const date = new Date(s.createdAt || Date.now());
    const h = date.getHours();
    if (hours[h]) {
      hours[h].invoicesCount += 1;
      hours[h].totalSales += parseFloat(s.totalAmount || s.netTotal || 0);
    }
  });

  return hours;
}

/**
 * 5. تقرير الرقابة الأمنية وكشف التلاعب (Security Audit & Anti-Skimming)
 */
export function calculateSecurityAudit(auditLogs = [], filterParams = {}) {
  return auditLogs
    .filter((log) => {
      if (filterParams.branchId && filterParams.branchId !== 'all' && log.branchId !== filterParams.branchId) return false;
      if (filterParams.actionType && filterParams.actionType !== 'all' && log.actionType !== filterParams.actionType) return false;
      if (filterParams.cashierEmpCode && filterParams.cashierEmpCode !== 'all' && log.cashierEmpCode !== filterParams.cashierEmpCode) return false;
      if (filterParams.dateFrom && log.timestamp && log.timestamp.slice(0, 10) < filterParams.dateFrom) return false;
      if (filterParams.dateTo && log.timestamp && log.timestamp.slice(0, 10) > filterParams.dateTo) return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * 6. تقرير كفاءة البائعين ومتوسط السلة (Cashier KPIs)
 */
export function calculateCashierKpis(sales = [], employees = [], filterParams = {}) {
  const cashierMap = new Map();

  sales.forEach((s) => {
    if (filterParams.branchId && filterParams.branchId !== 'all' && s.branchId !== filterParams.branchId) return;
    if (filterParams.dateFrom && s.createdAt && s.createdAt.slice(0, 10) < filterParams.dateFrom) return;
    if (filterParams.dateTo && s.createdAt && s.createdAt.slice(0, 10) > filterParams.dateTo) return;

    const code = s.cashierEmpCode || '101';
    const name = s.cashierEmpName || s.cashierName || 'كاشير';

    if (!cashierMap.has(code)) {
      cashierMap.set(code, {
        cashierCode: code,
        cashierName: name,
        invoicesCount: 0,
        totalSales: 0,
        totalItemsCount: 0,
        totalCommissions: 0
      });
    }

    const rec = cashierMap.get(code);
    rec.invoicesCount += 1;
    rec.totalSales += parseFloat(s.totalAmount || s.netTotal || 0);
    rec.totalItemsCount += (s.items || []).reduce((sum, it) => sum + (parseFloat(it.quantity) || 1), 0);
    rec.totalCommissions += parseFloat(s.totalCommissions || 0);
  });

  return Array.from(cashierMap.values()).map((c) => ({
    ...c,
    averageBasketValue: c.invoicesCount > 0 ? parseFloat((c.totalSales / c.invoicesCount).toFixed(2)) : 0,
    itemsPerTicket: c.invoicesCount > 0 ? parseFloat((c.totalItemsCount / c.invoicesCount).toFixed(2)) : 0
  })).sort((a, b) => b.totalSales - a.totalSales);
}

/**
 * 7. تصدير أي تقرير إكسيل باحترافية وتنسيق عربي (Export POS Report to Excel)
 */
export async function exportPosReportToExcel({
  reportTitle = 'تقرير نقاط البيع',
  fileName = 'تقرير-نقاط-البيع',
  columns = [],
  rows = [],
  summaryRows = []
}) {
  const ExcelJS = await loadExcelJS();
  if (!ExcelJS) throw new Error('تعذر تحميل محرك ExcelJS');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PharmaOS POS';
  wb.lastModifiedBy = 'PharmaOS POS Terminal';
  wb.created = new Date();

  const ws = wb.addWorksheet('تقرير نقطة البيع', {
    views: [{ rightToLeft: true }]
  });

  // 1. عنوان التقرير الرئيسي
  const titleRow = ws.addRow([reportTitle]);
  titleRow.height = 36;
  ws.mergeCells(1, 1, 1, Math.max(columns.length, 4));
  const titleCell = ws.getCell('A1');
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. ترويسة البيانات الإضافية
  const metaRow = ws.addRow([
    `تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')} - ${new Date().toLocaleTimeString('ar-EG')}`,
    '',
    `نظام: PharmaOS POS Enterprise Engine`
  ]);
  metaRow.height = 22;
  ws.mergeCells(2, 1, 2, Math.max(columns.length, 4));
  const metaCell = ws.getCell('A2');
  metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.addRow([]); // فراغ

  // 3. رؤوس الأعمدة
  const headerColLabels = columns.map((c) => c.header);
  const headerRow = ws.addRow(headerColLabels);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111A28' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // 4. صفوف البيانات
  rows.forEach((rowObj, rIdx) => {
    const rowValues = columns.map((col) => {
      const val = rowObj[col.key];
      return val !== undefined && val !== null ? val : '';
    });
    const dataRow = ws.addRow(rowValues);
    dataRow.height = 22;
    const isAlt = rIdx % 2 === 1;

    dataRow.eachCell((cell, colIdx) => {
      cell.font = { name: 'Arial', size: 10.5, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: columns[colIdx - 1]?.align || 'center', vertical: 'middle' };
      if (isAlt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // 5. صفوف الإجماليات إن وجدت
  summaryRows.forEach((sRow) => {
    const sValues = columns.map((col) => sRow[col.key] || '');
    const summaryDataRow = ws.addRow(sValues);
    summaryDataRow.height = 25;
    summaryDataRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });

  // تعديل أبعاد الأعمدة تلقائياً
  columns.forEach((col, idx) => {
    ws.getColumn(idx + 1).width = Math.max(col.width || 15, 14);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * 8. محرك طباعة الريسيت الحراري لتقارير X و Z (Thermal 80mm ESC/POS Text Formatter)
 */
export function formatThermalShiftReport(reportData, isZReport = false) {
  const line = '------------------------------------------------';
  const doubleLine = '================================================';
  const typeTitle = isZReport ? '*** تقرير إغلاق الوردية (Z-REPORT) ***' : '*** قراءة الوردية اللحظية (X-REPORT) ***';

  return `
               صيدليات الشفاء الطبية
             نظام نقاط البيع PharmaOS POS
${doubleLine}
${typeTitle}
الفرع: ${reportData.branchName}
رقم الوردية: #${reportData.shiftId}
الكاشير: ${reportData.cashierName} (كود: ${reportData.cashierEmpCode})
وقت البداية: ${new Date(reportData.startTime).toLocaleTimeString('ar-EG')} ${new Date(reportData.startTime).toLocaleDateString('ar-EG')}
وقت التقرير: ${new Date().toLocaleTimeString('ar-EG')} ${new Date().toLocaleDateString('ar-EG')}
${line}
(1) حركة المبيعات وطرق الدفع:
- مبيعات نقدية (Cash):           ${reportData.cashSales.toFixed(2)} ج.م
- بطاقات ائتمان (Visa/Master):     ${reportData.cardSales.toFixed(2)} ج.م
- إنستاباي ومحافظ (InstaPay):     ${(reportData.instapaySales + reportData.vodafoneCashSales).toFixed(2)} ج.م
- تعاقدات وتأمين طبي:             ${reportData.insuranceCreditSales.toFixed(2)} ج.م
------------------------------------------------
صافي إجمالي المبيعات:             ${reportData.totalSalesNet.toFixed(2)} ج.م
عدد الفواتير الصادرة:             ${reportData.invoicesCount} فاتورة
${line}
(2) حركة الخزينة ودرج النقدية:
+ رصيد افتتاح الدرج (العهدة):      ${reportData.openingCash.toFixed(2)} ج.م
+ النقدية المحصلة بالدرج:         ${reportData.cashSales.toFixed(2)} ج.م
- المرتجعات النقدية المدفوعة:       ${reportData.totalReturnsCash.toFixed(2)} ج.م
- نثريات ومصروفات الدرج:          ${reportData.pettyExpenses.toFixed(2)} ج.م
- توريدات للخزينة (Safe Drops):    ${reportData.safeDrops.toFixed(2)} ج.م
------------------------------------------------
النقدية الدفترية المفترضة بالدرج:  ${reportData.expectedCashInDrawer.toFixed(2)} ج.م
${isZReport ? `
العد الفعلي (التقفيل الأعمى):      ${(reportData.countedCash || 0).toFixed(2)} ج.م
فارق الدرج (عجز/زيادة):           ${reportData.cashDifference >= 0 ? '+' : ''}${reportData.cashDifference.toFixed(2)} ج.م
الحالة: ${reportData.cashDifference === 0 ? 'مطابق تماماً [0.00]' : reportData.cashDifference > 0 ? 'زيادة بالدرج' : 'عجز بالدرج'}
` : ''}
${doubleLine}
تم التوثيق بواسطة: ${reportData.cashierName} (${reportData.cashierEmpCode})
${isZReport ? '*** تم إقفال الوردية وترحيل العهدة بنجاح ***' : '*** قراءة استعلامية - الوردية ما زالت مفتوحة ***'}
`.trim();
}
