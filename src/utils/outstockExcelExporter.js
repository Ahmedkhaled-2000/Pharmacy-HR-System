/**
 * outstockExcelExporter.js
 * مُصدر تقارير إكسل الفاخر والشامل لإدارة المشتريات والتوريدات (Outstock Handling)
 * مبني باستخدام مكتبة ExcelJS مع دعم التنسيق العربي الكامل (RTL) والألوان الملكية والمعادلات الحسابية
 */

import ExcelJS from 'exceljs';

const THEME = {
  headerBg: '0F766E',       // زمردي غامق للترويسة الرئيسية
  subHeaderBg: '134E4A',    // زمردي أعمق
  accentRoyal: '1E3A8A',    // أزرق ملكي
  white: 'FFFFFF',
  textDark: '0F172A',
  mutedText: '475569',
  borderGray: 'CBD5E1',
  altRowBg: 'F8FAFC',
  highlightGreen: 'DCFCE7',
  textGreen: '14532D',
  highlightRed: 'FFE4E6',
  textRed: '9F1239',
  highlightAmber: 'FEF3C7',
  textAmber: '92400E',
  kpiCardBg: 'F0FDFA',
  totalBg: '0D9488'
};

const THIN_BORDER = {
  top: { style: 'thin', color: { argb: THEME.borderGray } },
  left: { style: 'thin', color: { argb: THEME.borderGray } },
  bottom: { style: 'thin', color: { argb: THEME.borderGray } },
  right: { style: 'thin', color: { argb: THEME.borderGray } }
};

/**
 * تصدير تقرير طلبات الفروع المجمعة لإدارة المشتريات
 * @param {Array} aggregatedData - الأصناف المجمعة
 * @param {Object} options - خيارات الفلتر (selectedBranchName, orgName, search)
 */
export async function exportProcurementOrdersExcel(aggregatedData = [], options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  wb.lastModifiedBy = 'إدارة المشتريات والتوريدات';
  wb.created = new Date();
  wb.modified = new Date();

  const branchTitle = options.selectedBranchName && options.selectedBranchName !== 'all'
    ? options.selectedBranchName
    : 'كافة الفروع والصيدليات';
  const exportDateStr = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const exportTimeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // ══════════════════════════════════════════════════════════════════════════════
  // الورقة الأولى: ملخص طلبات الفروع المجمعة (Aggregated Summary)
  // ══════════════════════════════════════════════════════════════════════════════
  const wsSummary = wb.addWorksheet('ملخص طلبات الفروع والتوريد', {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 6 }]
  });

  // 1. ترويسة التقرير الرئيسية
  wsSummary.mergeCells('A1:J1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = '💊 كشف طلبات الأصناف والأدوية المجمعة للفروع — إدارة المشتريات والتوريدات';
  titleCell.font = { name: 'Arial', bold: true, size: 15, color: { argb: THEME.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(1).height = 42;

  // 2. سطر الميتاداتا والفرع والتوقيت
  wsSummary.mergeCells('A2:J2');
  const metaCell = wsSummary.getCell('A2');
  metaCell.value = `نطاق البيانات: [ ${branchTitle} ]  |  تاريخ وتوقيت الاستخراج: ${exportDateStr} - ${exportTimeStr}  |  المصدر: منظومة النواقص السحابية`;
  metaCell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: THEME.white } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subHeaderBg } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(2).height = 24;

  // 3. بطاقات الـ KPI الإحصائية السريعة
  const totalItemsCount = aggregatedData.length;
  const totalQuantitySum = aggregatedData.reduce((acc, i) => acc + Number(i.total_requested_qty || 0), 0);
  const totalOrdersCount = aggregatedData.reduce((acc, i) => acc + Number(i.orders_count || 0), 0);
  const uniqueBranchesCount = new Set(aggregatedData.map(i => i.branch_id || i.branch_name)).size;

  wsSummary.mergeCells('A3:B4');
  const kpi1 = wsSummary.getCell('A3');
  kpi1.value = `📦 إجمالي الأصناف\n${totalItemsCount} صنف مطلوب`;
  kpi1.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.textDark } };
  kpi1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.kpiCardBg } };
  kpi1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  kpi1.border = THIN_BORDER;

  wsSummary.mergeCells('C3:E4');
  const kpi2 = wsSummary.getCell('C3');
  kpi2.value = `🔢 إجمالي الكميات المطلوبة\n${totalQuantitySum} وحدة (علبة / شريط)`;
  kpi2.font = { name: 'Arial', bold: true, size: 11, color: { argb: '0E7490' } };
  kpi2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.kpiCardBg } };
  kpi2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  kpi2.border = THIN_BORDER;

  wsSummary.mergeCells('F3:G4');
  const kpi3 = wsSummary.getCell('F3');
  kpi3.value = `👥 عدد طلبات العملاء\n${totalOrdersCount} عميل بانتظار التوفير`;
  kpi3.font = { name: 'Arial', bold: true, size: 11, color: { argb: '7C2D12' } };
  kpi3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.kpiCardBg } };
  kpi3.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  kpi3.border = THIN_BORDER;

  wsSummary.mergeCells('H3:J4');
  const kpi4 = wsSummary.getCell('H3');
  kpi4.value = `🏥 الفروع الطالبة\n${uniqueBranchesCount} فرع وصيدلية`;
  kpi4.font = { name: 'Arial', bold: true, size: 11, color: { argb: '1E3A8A' } };
  kpi4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.kpiCardBg } };
  kpi4.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  kpi4.border = THIN_BORDER;

  // سطر فارغ للفصل
  wsSummary.getRow(5).height = 10;

  // 4. عناوين جدول الأصناف
  const summaryHeaders = [
    'م',
    'اسم الدواء / الصنف',
    'الوحدة',
    'الفرع الطالب',
    'إجمالي الكمية المطلوبة',
    'عدد طلبات العملاء',
    'متوسط السعر (ج.م)',
    'إجمالي القيمة التقديرية (ج.م)',
    'حالة التوفير المقترحة',
    'ملاحظات المشتريات والتوريد'
  ];

  const headerRow = wsSummary.getRow(6);
  headerRow.values = summaryHeaders;
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  // عرض الأعمدة
  wsSummary.columns = [
    { key: 'index', width: 6 },
    { key: 'medication_name', width: 34 },
    { key: 'unit_type', width: 14 },
    { key: 'branch_name', width: 22 },
    { key: 'total_qty', width: 20 },
    { key: 'orders_count', width: 18 },
    { key: 'unit_price', width: 18 },
    { key: 'total_price', width: 22 },
    { key: 'status_label', width: 20 },
    { key: 'procurement_notes', width: 28 }
  ];

  // 5. كتابة صفوف البيانات
  let currentRowIndex = 7;
  aggregatedData.forEach((item, idx) => {
    const isEven = idx % 2 === 0;
    const unitLabel = item.unit_type === 'strip' ? 'شريط' : 'علبة';

    // حساب متوسط السعر إن وجد في تفاصيل الأصناف
    const details = item.item_details || [];
    let avgPrice = 0;
    if (details.length > 0) {
      const sumPrices = details.reduce((sum, d) => sum + parseFloat(d.unitPrice || 0), 0);
      avgPrice = (sumPrices / details.length) || 0;
    }

    const row = wsSummary.getRow(currentRowIndex);
    row.values = [
      idx + 1,
      item.medication_name || '',
      unitLabel,
      item.branch_name || item.branch_id || 'الفرع',
      Number(item.total_requested_qty || 0),
      Number(item.orders_count || 0),
      avgPrice > 0 ? parseFloat(avgPrice.toFixed(2)) : 0,
      { formula: `E${currentRowIndex}*G${currentRowIndex}`, result: (Number(item.total_requested_qty || 0) * avgPrice) },
      'قيد توفير المشتريات',
      ''
    ];
    row.height = 24;

    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10.5, color: { argb: THEME.textDark } };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle' };

      // محاذاة النص والأرقام
      if (colNumber === 1 || colNumber === 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 2) {
        cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: '0F172A' } };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colNumber === 4) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colNumber === 5) {
        cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: '0E7490' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 6) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 7 || colNumber === 8) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      } else if (colNumber === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: THEME.textAmber } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.highlightAmber } };
      }

      if (colNumber !== 9 && !isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.altRowBg } };
      }
    });

    currentRowIndex++;
  });

  // 6. صف المجاميع الإجمالية (Totals Row)
  const totalRow = wsSummary.getRow(currentRowIndex);
  wsSummary.mergeCells(`A${currentRowIndex}:D${currentRowIndex}`);
  const totLabel = wsSummary.getCell(`A${currentRowIndex}`);
  totLabel.value = 'الإجمالي العام لكافة طلبات الأصناف:';
  totLabel.font = { name: 'Arial', bold: true, size: 11.5, color: { argb: THEME.white } };
  totLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totLabel.alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow.getCell(5).value = { formula: `SUM(E7:E${currentRowIndex - 1})` };
  totalRow.getCell(5).font = { name: 'Arial', bold: true, size: 12, color: { argb: THEME.white } };
  totalRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totalRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow.getCell(6).value = { formula: `SUM(F7:F${currentRowIndex - 1})` };
  totalRow.getCell(6).font = { name: 'Arial', bold: true, size: 12, color: { argb: THEME.white } };
  totalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totalRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow.getCell(7).value = '-';
  totalRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totalRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow.getCell(8).value = { formula: `SUM(H7:H${currentRowIndex - 1})` };
  totalRow.getCell(8).font = { name: 'Arial', bold: true, size: 12, color: { argb: THEME.white } };
  totalRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totalRow.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
  totalRow.getCell(8).numFmt = '#,##0.00';

  wsSummary.mergeCells(`I${currentRowIndex}:J${currentRowIndex}`);
  const totEnd = wsSummary.getCell(`I${currentRowIndex}`);
  totEnd.value = 'جاهز للتسليم والشحن المباشر';
  totEnd.font = { name: 'Arial', bold: true, size: 10, color: { argb: THEME.white } };
  totEnd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
  totEnd.alignment = { horizontal: 'center', vertical: 'middle' };

  totalRow.height = 32;
  totalRow.eachCell((c) => { c.border = THIN_BORDER; });

  // ══════════════════════════════════════════════════════════════════════════════
  // الورقة الثانية: التفاصيل الكاملة لطلبات العملاء والفواتير (Drill-Down)
  // ══════════════════════════════════════════════════════════════════════════════
  const wsDetails = wb.addWorksheet('تفاصيل طلبات العملاء بالفروع', {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 2 }]
  });

  // ترويسة الورقة الثانية
  wsDetails.mergeCells('A1:I1');
  const dTitle = wsDetails.getCell('A1');
  dTitle.value = '📋 تفاصيل إيصالات العملاء والأدوية المحجوزة بالفروع (بيانات الاتصال والاستلام)';
  dTitle.font = { name: 'Arial', bold: true, size: 13, color: { argb: THEME.white } };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentRoyal } };
  dTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsDetails.getRow(1).height = 36;

  const detailHeaders = [
    'م',
    'رقم الإيصال',
    'الفرع',
    'اسم الدواء / الصنف',
    'نوع الوحدة',
    'الكمية',
    'اسم العميل',
    'هاتف الواتساب',
    'تاريخ وتوقيت الطلب'
  ];

  const dHeadRow = wsDetails.getRow(2);
  dHeadRow.values = detailHeaders;
  dHeadRow.height = 28;
  dHeadRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  wsDetails.columns = [
    { key: 'idx', width: 6 },
    { key: 'orderNumber', width: 22 },
    { key: 'branch', width: 22 },
    { key: 'medication', width: 30 },
    { key: 'unit', width: 14 },
    { key: 'qty', width: 12 },
    { key: 'customer', width: 24 },
    { key: 'phone', width: 20 },
    { key: 'date', width: 22 }
  ];

  let detailRowIdx = 3;
  let counter = 1;

  aggregatedData.forEach((group) => {
    const details = group.item_details || [];
    details.forEach((d) => {
      const dRow = wsDetails.getRow(detailRowIdx);
      const isEvenD = counter % 2 === 0;
      const orderDate = d.createdAt
        ? new Date(d.createdAt).toLocaleDateString('ar-EG') + ' ' + new Date(d.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : '-';

      dRow.values = [
        counter,
        d.orderNumber || '-',
        group.branch_name || group.branch_id || 'الفرع',
        group.medication_name || '',
        group.unit_type === 'strip' ? 'شريط' : 'علبة',
        Number(d.quantity || 1),
        d.customerName || 'عميل نقدي',
        d.customerPhone || '-',
        orderDate
      ];
      dRow.height = 22;

      dRow.eachCell((c, cIdx) => {
        c.font = { name: 'Arial', size: 10, color: { argb: THEME.textDark } };
        c.border = THIN_BORDER;
        c.alignment = { vertical: 'middle' };

        if (cIdx === 1 || cIdx === 5 || cIdx === 6 || cIdx === 8) {
          c.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (cIdx === 2 || cIdx === 4) {
          c.font = { name: 'Arial', bold: true, size: 10, color: { argb: '0F172A' } };
        }

        if (!isEvenD) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.altRowBg } };
        }
      });

      detailRowIdx++;
      counter++;
    });
  });

  // إنشاء الملف وتنزيله
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const fileNameClean = `طلبات-المشتريات-المجمعة-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.download = fileNameClean;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);

  return true;
}
