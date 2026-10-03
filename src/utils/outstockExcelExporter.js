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

  const category = options.category || 'all'; // 'medication' | 'cosmetics' | 'all'

  let sheetName = 'طلبات الفروع المجمعة';
  let sheetTitle = '📦 كشف طلبات الفروع المجمعة (أدوية ومستحضرات) — إدارة المشتريات والتوريدات';
  let headerColor = THEME.headerBg;

  if (category === 'medication') {
    sheetName = 'طلبات الأدوية المجمعة';
    sheetTitle = '💊 كشف طلبات الأدوية المجمعة للفروع — إدارة المشتريات والتوريدات';
    headerColor = '059669';
  } else if (category === 'cosmetics') {
    sheetName = 'طلبات مستحضرات التجميل المجمعة';
    sheetTitle = '💄 كشف طلبات مستحضرات التجميل والعناية المجمعة للفروع — إدارة المشتريات والتوريدات';
    headerColor = 'BE185D';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // الورقة الأولى: ملخص طلبات الفروع المجمعة (Aggregated Summary)
  // ══════════════════════════════════════════════════════════════════════════════
  const wsSummary = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 6 }]
  });

  // 1. ترويسة التقرير الرئيسية
  wsSummary.mergeCells('A1:J1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = sheetTitle;
  titleCell.font = { name: 'Arial', bold: true, size: 15, color: { argb: THEME.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
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
  let baseFileName = 'طلبات-الفروع-المجمعة';
  if (category === 'medication') baseFileName = 'طلبات-الأدوية-المجمعة';
  else if (category === 'cosmetics') baseFileName = 'طلبات-مستحضرات-التجميل-المجمعة';

  const fileNameClean = `${baseFileName}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.download = fileNameClean;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);

  return true;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * تصدير ملف إكسل فارغ بتصميم احترافي لكتالوج الأدوية وتحديث الأسعار
 * يحتوي على جميع حقول كارتة الصنف مع أمثلة إرشادية وتنسيق ملكي
 * ══════════════════════════════════════════════════════════════════════════════
 */
export async function exportMedicationCatalogTemplateExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  wb.lastModifiedBy = 'المسؤول - هيئة الدواء المصرية ودراج آي';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('تحديث وتعديل أسعار الأدوية', {
    views: [{ rtl: true, showGridLines: true }],
    pageSetup: { orientation: 'landscape', fitToPage: true }
  });

  // ترويسة النموذج الاحترافي
  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '📋 نموذج استيراد وتحديث أسعار الأدوية الرسمي (Bulk Medication Re-Pricer)';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
  ws.getRow(1).height = 36;

  // سطر الإرشادات
  ws.mergeCells('A2:L2');
  const infoCell = ws.getCell('A2');
  infoCell.value = '💡 تعليمات: يرجى إدخال الباركود الدولي أو اسم الدواء مع السعر الجديد وعدد الشرائط بالعلبة. لن يتم تكرار الأصناف وستُحدث الأسعار فور الرفع.';
  infoCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: '134E4A' } };
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'CCFBF1' } };
  ws.getRow(2).height = 24;

  // أعمدة الجدول
  const columns = [
    { key: 'barcode', header: 'الباركود الدولي (GTIN)', width: 22 },
    { key: 'nameAr', header: 'اسم الدواء التجاري (عربي) *', width: 28 },
    { key: 'nameEn', header: 'اسم الدواء التجاري (إنجليزي) *', width: 28 },
    { key: 'generic', header: 'المادة الفعالة (Generic Name)', width: 32 },
    { key: 'dosageForm', header: 'الشكل الصيدلاني (أقراص/كبسول/شراب)', width: 24 },
    { key: 'strength', header: 'التركيز (Strength)', width: 16 },
    { key: 'packSize', header: 'عدد الشرائط بالعلبة *', width: 18 },
    { key: 'unitName', header: 'اسم الوحدة (شريط/أمبول)', width: 18 },
    { key: 'publicPrice', header: 'السعر الرسمي للعلبة (ج.م) *', width: 22 },
    { key: 'manufacturer', header: 'الشركة المصنعة (Manufacturer)', width: 24 },
    { key: 'isTableDrug', header: 'جدول مخدرات (نعم/لا)', width: 18 },
    { key: 'isRefrigerated', header: 'ثلاجة 2-8°C (نعم/لا)', width: 18 }
  ];

  ws.columns = columns;

  // صف الترويسة الرئيسية للأعمدة
  const headerRow = ws.getRow(3);
  headerRow.values = columns.map(c => c.header);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subHeaderBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });

  // إضافة صفوف أمثلة توضيحية لسهولة التعبئة
  const sampleRows = [
    [
      '6221025030733',
      'الفنترن 30 قرص',
      'alphintern 30 f.c.tabs',
      'chymotrypsin+trypsin',
      'أقراص مغلفة',
      '',
      3,
      'شريط',
      87.00,
      'Amoun',
      'لا',
      'لا'
    ],
    [
      '6221025032362',
      'أوجمنتين 1 جم أقراص',
      'Augmentin 1g Tablets',
      'Amoxicillin + Clavulanic Acid',
      'أقراص مغلفة',
      '1000 mg',
      2,
      'شريط',
      130.00,
      'GlaxoSmithKline (GSK)',
      'لا',
      'لا'
    ]
  ];

  sampleRows.forEach((rowValues) => {
    const row = ws.addRow(rowValues);
    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: THEME.textDark } };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle' };

      if (colNumber === 1) {
        cell.numFmt = '@'; // نص لضمان عدم ضياع أصفار الباركود
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber === 7 || colNumber === 9) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colNumber === 9) {
          cell.numFmt = '#,##0.00';
          cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '065F46' } };
        }
      } else if (colNumber === 11 || colNumber === 12) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `نموذج-استيراد-وتحديث-أسعار-الأدوية-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);

  return true;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * قراءة وتحليل ملف الإكسل المسترد لتحديث الأسعار مع منع التكرار
 * ══════════════════════════════════════════════════════════════════════════════
 */
export async function parseMedicationExcelFile(file) {
  if (!file) throw new Error('يرجى اختيار ملف إكسل');

  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('الملف فارغ أو لا يحتوي على أوراق عمل صالحة');

  // استكشاف موقع الترويسة
  let headerRowIndex = 3;
  let barcodeCol = -1;
  let nameArCol = -1;
  let nameEnCol = -1;
  let genericCol = -1;
  let dosageFormCol = -1;
  let packSizeCol = -1;
  let unitNameCol = -1;
  let priceCol = -1;
  let manufacturerCol = -1;
  let tableDrugCol = -1;
  let refrigeratedCol = -1;

  // فحص أول 6 أسطر للبحث عن الترويسات
  for (let r = 1; r <= Math.min(ws.rowCount, 6); r++) {
    const row = ws.getRow(r);
    let foundCount = 0;
    row.eachCell((cell, colNumber) => {
      const txt = String(cell.value || '').trim().toLowerCase();
      if (txt.includes('باركود') || txt.includes('gtin') || txt.includes('barcode')) {
        barcodeCol = colNumber;
        foundCount++;
      } else if (txt.includes('عربي') || (txt.includes('اسم') && txt.includes('دواء'))) {
        nameArCol = colNumber;
        foundCount++;
      } else if (txt.includes('إنجليزي') || txt.includes('trade') || txt.includes('english')) {
        nameEnCol = colNumber;
        foundCount++;
      } else if (txt.includes('فعالة') || txt.includes('generic')) {
        genericCol = colNumber;
        foundCount++;
      } else if (txt.includes('شكل') || txt.includes('dosage')) {
        dosageFormCol = colNumber;
        foundCount++;
      } else if (txt.includes('شرائط') || txt.includes('حجم') || txt.includes('pack')) {
        packSizeCol = colNumber;
        foundCount++;
      } else if (txt.includes('وحدة') || txt.includes('unit')) {
        unitNameCol = colNumber;
        foundCount++;
      } else if (txt.includes('سعر') || txt.includes('price')) {
        priceCol = colNumber;
        foundCount++;
      } else if (txt.includes('شركة') || txt.includes('مصنع') || txt.includes('manufacturer')) {
        manufacturerCol = colNumber;
        foundCount++;
      } else if (txt.includes('جدول') || txt.includes('مخدر')) {
        tableDrugCol = colNumber;
      } else if (txt.includes('ثلاجة') || txt.includes('تبريد')) {
        refrigeratedCol = colNumber;
      }
    });

    if (foundCount >= 2) {
      headerRowIndex = r;
      break;
    }
  }

  // Fallbacks إذا كانت الملفات بأعمدة قياسية
  if (barcodeCol === -1) barcodeCol = 1;
  if (nameArCol === -1) nameArCol = 2;
  if (nameEnCol === -1) nameEnCol = 3;
  if (genericCol === -1) genericCol = 4;
  if (dosageFormCol === -1) dosageFormCol = 5;
  if (packSizeCol === -1) packSizeCol = 7;
  if (unitNameCol === -1) unitNameCol = 8;
  if (priceCol === -1) priceCol = 9;
  if (manufacturerCol === -1) manufacturerCol = 10;
  if (tableDrugCol === -1) tableDrugCol = 11;
  if (refrigeratedCol === -1) refrigeratedCol = 12;

  const parsedItems = [];
  const seenBarcodes = new Set();
  const seenNames = new Set();
  let duplicatesCount = 0;
  const warnings = [];

  for (let r = headerRowIndex + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const getVal = (col) => {
      if (col <= 0) return '';
      const cell = row.getCell(col);
      if (!cell || cell.value === null || cell.value === undefined) return '';
      if (typeof cell.value === 'object' && cell.value.text) return String(cell.value.text).trim();
      if (typeof cell.value === 'object' && cell.value.result !== undefined) return String(cell.value.result).trim();
      return String(cell.value).trim();
    };

    const barcode = getVal(barcodeCol).replace(/\s+/g, '');
    const nameAr = getVal(nameArCol);
    const nameEn = getVal(nameEnCol);
    const rawPrice = getVal(priceCol).replace(/[^\d.-]/g, '');
    const price = parseFloat(rawPrice || 0);

    // تخطي السطور الفارغة تماماً
    if (!barcode && !nameAr && !nameEn && !price) continue;

    // استبعاد تكرار الأصناف داخل نفس الملف
    const uniqueKey = barcode || `${nameAr.toLowerCase()}|${nameEn.toLowerCase()}`;
    if (uniqueKey) {
      if (seenBarcodes.has(uniqueKey) || (barcode && seenBarcodes.has(barcode)) || (nameAr && seenNames.has(nameAr.toLowerCase()))) {
        duplicatesCount++;
        warnings.push(`تم تخطي صنف مكرر بالملف في السطر ${r}: ${nameAr || nameEn || barcode}`);
        continue;
      }
      if (barcode) seenBarcodes.add(barcode);
      if (nameAr) seenNames.add(nameAr.toLowerCase());
      seenBarcodes.add(uniqueKey);
    }

    const rawPackSize = parseInt(getVal(packSizeCol).replace(/[^\d]/g, '') || 1, 10);
    const packSize = Math.max(1, isNaN(rawPackSize) ? 1 : rawPackSize);
    const unitPrice = packSize > 0 ? parseFloat((price / packSize).toFixed(2)) : price;

    const tableVal = getVal(tableDrugCol).toLowerCase();
    const isTableDrug = tableVal.includes('نعم') || tableVal.includes('true') || tableVal.includes('1') || tableVal.includes('جدول');

    const fridgeVal = getVal(refrigeratedCol).toLowerCase();
    const isRefrigerated = fridgeVal.includes('نعم') || fridgeVal.includes('true') || fridgeVal.includes('1') || fridgeVal.includes('ثلاجة');

    parsedItems.push({
      rowNumber: r,
      gtin_barcode: barcode,
      trade_name_ar: nameAr || nameEn,
      trade_name_en: nameEn || nameAr,
      generic_name: getVal(genericCol),
      dosage_form: getVal(dosageFormCol) || 'أقراص',
      pack_size: packSize,
      unit_name: getVal(unitNameCol) || 'شريط',
      public_price: price,
      unit_price: unitPrice,
      manufacturer: getVal(manufacturerCol),
      is_table_drug: isTableDrug,
      is_refrigerated: isRefrigerated
    });
  }

  return {
    success: true,
    items: parsedItems,
    totalRows: parsedItems.length,
    duplicatesCount,
    warnings
  };
}

/**
 * تصدير سجل مسحوبات المورد إلى ملف إكسل احترافي
 */
export async function exportSupplierWithdrawalsExcel(supplier = {}, withdrawals = [], options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  wb.created = new Date();

  const ws = wb.addWorksheet(`مسحوبات ${supplier.name || 'المورد'}`, {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 4 }]
  });

  // ترويسة رئيسية
  ws.mergeCells('A1:J1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `📦 كشف وسجل مسحوبات المورد: ${supplier.name || ''} (${supplier.code || 'بدون كود'})`;
  titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: THEME.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // سطر بيانات المورد
  ws.mergeCells('A2:J2');
  const infoCell = ws.getCell('A2');
  infoCell.value = `نوع الحساب: ${supplier.payment_type === 'credit' ? 'أجل (ائتمان)' : 'نقدي'} | حد الائتمان: ${supplier.credit_limit || 0} ج.م | فترة السداد: ${supplier.credit_term_days || 0} يوم | الرصيد الحالي: ${supplier.current_balance || 0} ج.م | تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`;
  infoCell.font = { name: 'Arial', size: 10.5, color: { argb: THEME.white } };
  infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subHeaderBg } };
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // عناوين الأعمدة
  const headers = [
    'م',
    'رقم الفاتورة',
    'تاريخ الفاتورة',
    'اسم الدواء / الصنف',
    'حجم العبوة',
    'الكمية',
    'سعر الجمهور',
    'نسبة الخصم %',
    'سعر الشراء الصافي',
    'إجمالي القيمة (ج.م)'
  ];

  const headRow = ws.getRow(4);
  headRow.values = headers;
  headRow.height = 28;
  headRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  let rowIdx = 5;
  let totalQty = 0;
  let totalVal = 0;

  withdrawals.forEach((item, idx) => {
    const qty = Number(item.quantity || item.qty || 0);
    const pubPrice = Number(item.public_price || item.unit_price || 0);
    const disc = Number(item.discount_percent || item.discount || 0);
    const buyPrice = Number(item.buy_price || (pubPrice * (1 - disc / 100)) || 0);
    const itemTotal = Number(item.total_price || (qty * buyPrice) || 0);

    totalQty += qty;
    totalVal += itemTotal;

    const row = ws.getRow(rowIdx);
    row.values = [
      idx + 1,
      item.invoice_number || item.invoiceNumber || '-',
      item.invoice_date || item.created_at ? new Date(item.invoice_date || item.created_at).toLocaleDateString('ar-EG') : '-',
      item.medication_name || item.name || '-',
      item.pack_size || 1,
      qty,
      pubPrice,
      disc ? `${disc}%` : '0%',
      buyPrice,
      itemTotal
    ];

    const isEven = idx % 2 === 0;
    row.eachCell((cell, cIdx) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: THEME.textDark } };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: cIdx === 4 ? 'right' : 'center' };
      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.altRowBg } };
      }
    });
    row.height = 24;
    rowIdx++;
  });

  // سطر الإجمالي
  const totRow = ws.getRow(rowIdx);
  totRow.values = ['الإجمالي', '', '', '', '', totalQty, '', '', '', totalVal];
  totRow.height = 30;
  ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
  totRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 14 },
    { width: 32 },
    { width: 12 },
    { width: 10 },
    { width: 13 },
    { width: 13 },
    { width: 16 },
    { width: 18 }
  ];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `مسحوبات-${supplier.name || 'مورد'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  return true;
}

/**
 * تصدير مسحوبات الفروع الشهرية إلى ملف إكسل
 */
export async function exportBranchWithdrawalsExcel(monthPeriod = '', branchesData = [], extraWithdrawals = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  wb.created = new Date();

  // الورقة 1: ملخص الفروع
  const ws1 = wb.addWorksheet(`مسحوبات الفروع ${monthPeriod}`, {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 3 }]
  });

  ws1.mergeCells('A1:F1');
  const t1 = ws1.getCell('A1');
  t1.value = `📊 تقرير مسحوبات الفروع والصيدليات لشهر: ${monthPeriod || new Date().toISOString().slice(0, 7)}`;
  t1.font = { name: 'Arial', bold: true, size: 14, color: { argb: THEME.white } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(1).height = 36;

  const h1 = ['م', 'الفرع / الصيدلية', 'عدد الأصناف المستلمة', 'إجمالي الكميات المسحوبة', 'إجمالي التكلفة (ج.م)', 'آخر عملية توريد'];
  const hr1 = ws1.getRow(3);
  hr1.values = h1;
  hr1.height = 28;
  hr1.eachCell((c) => {
    c.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: THEME.white } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  });

  let r1Idx = 4;
  let totalCostSum = 0;
  let totalQtySum = 0;

  branchesData.forEach((b, idx) => {
    const cost = Number(b.total_cost || b.totalAmount || 0);
    const qty = Number(b.total_quantity || b.itemsCount || 0);
    totalCostSum += cost;
    totalQtySum += qty;

    const row = ws1.getRow(r1Idx);
    row.values = [
      idx + 1,
      b.branch_name || b.name || '-',
      b.items_count || b.distinctItems || 0,
      qty,
      cost,
      b.last_withdrawal_date ? new Date(b.last_withdrawal_date).toLocaleDateString('ar-EG') : '-'
    ];

    row.eachCell((cell, cIdx) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: THEME.textDark } };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: cIdx === 2 ? 'right' : 'center' };
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.altRowBg } };
      }
    });
    row.height = 24;
    r1Idx++;
  });

  // سطر إجمالي الفروع
  const tot1 = ws1.getRow(r1Idx);
  tot1.values = ['الإجمالي العام', '', '', totalQtySum, totalCostSum, ''];
  tot1.height = 30;
  ws1.mergeCells(`A${r1Idx}:C${r1Idx}`);
  tot1.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  });

  ws1.columns = [{ width: 6 }, { width: 30 }, { width: 18 }, { width: 20 }, { width: 22 }, { width: 18 }];

  // الورقة 2: المسحوبات الإضافية
  if (extraWithdrawals.length > 0) {
    const ws2 = wb.addWorksheet('المسحوبات الإضافية', {
      views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 2 }]
    });

    ws2.mergeCells('A1:G1');
    const t2 = ws2.getCell('A1');
    t2.value = '📋 كشف المسحوبات الإضافية والتوريدات الميدانية المباشرة';
    t2.font = { name: 'Arial', bold: true, size: 12, color: { argb: THEME.white } };
    t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentRoyal } };
    t2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 30;

    const h2 = ['م', 'الفرع', 'التاريخ', 'اسم الصنف', 'الكمية', 'سعر التكلفة', 'سبب المسحوب'];
    const hr2 = ws2.getRow(2);
    hr2.values = h2;
    hr2.height = 26;
    hr2.eachCell((c) => {
      c.font = { name: 'Arial', bold: true, size: 10, color: { argb: THEME.white } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = THIN_BORDER;
    });

    extraWithdrawals.forEach((ew, idx) => {
      const r = ws2.getRow(idx + 3);
      r.values = [
        idx + 1,
        ew.branch_name || ew.branchId || '-',
        ew.withdrawal_date ? new Date(ew.withdrawal_date).toLocaleDateString('ar-EG') : '-',
        ew.medication_name || ew.name || '-',
        ew.quantity || 0,
        ew.unit_cost || 0,
        ew.notes || ew.reason || '-'
      ];
      r.eachCell((c) => {
        c.font = { name: 'Arial', size: 9.5, color: { argb: THEME.textDark } };
        c.border = THIN_BORDER;
        c.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      r.height = 22;
    });

    ws2.columns = [{ width: 6 }, { width: 22 }, { width: 14 }, { width: 28 }, { width: 10 }, { width: 14 }, { width: 28 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `مسحوبات-الفروع-${monthPeriod || new Date().toISOString().slice(0, 7)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  return true;
}

/**
 * تحليل واستخراج بنود فاتورة مورد من ملف Excel (.xlsx)
 */
export async function parseSupplierInvoiceExcel(file) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) {
      return { success: false, error: 'الملف فارغ أو لا يحتوي على أوراق عمل' };
    }

    // استكشاف سطر الترويسة
    let headerRowIdx = -1;
    let nameCol = -1;
    let qtyCol = -1;
    let pubPriceCol = -1;
    let discountCol = -1;
    let buyPriceCol = -1;
    let barcodeCol = -1;
    let expiryCol = -1;
    let batchCol = -1;

    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        const val = String(row.getCell(c).value || '').trim().toLowerCase();
        if (val.includes('صنف') || val.includes('دواء') || val.includes('item') || val.includes('product') || val.includes('name') || val.includes('بيان')) {
          nameCol = c;
          headerRowIdx = r;
        }
        if (val.includes('كمية') || val.includes('qty') || val.includes('quantity') || val.includes('العدد')) {
          qtyCol = c;
        }
        if (val.includes('جمهور') || val.includes('public') || val.includes('سعر البيع') || val.includes('price')) {
          pubPriceCol = c;
        }
        if (val.includes('خصم') || val.includes('discount') || val.includes('نسبة')) {
          discountCol = c;
        }
        if (val.includes('شراء') || val.includes('صافي') || val.includes('cost') || val.includes('net') || val.includes('توليد')) {
          buyPriceCol = c;
        }
        if (val.includes('باركود') || val.includes('barcode') || val.includes('gtin') || val.includes('كود')) {
          barcodeCol = c;
        }
        if (val.includes('صلاحية') || val.includes('صلاحيه') || val.includes('expiry') || val.includes('exp') || val.includes('انتهاء')) {
          expiryCol = c;
        }
        if (val.includes('تشغيلة') || val.includes('تشغيله') || val.includes('batch') || val.includes('lot') || val.includes('رقم التشغيلة')) {
          batchCol = c;
        }
      }
      if (nameCol !== -1 && qtyCol !== -1) break;
    }

    if (nameCol === -1) {
      // افتراض أعمدة تلقائية
      nameCol = 1;
      qtyCol = 2;
      pubPriceCol = 3;
      discountCol = 4;
      headerRowIdx = 1;
    }

    const items = [];
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = String(row.getCell(nameCol).value || '').trim();
      if (!name || name === 'الإجمالي' || name === 'Total') continue;

      const rawQty = parseFloat(String(row.getCell(qtyCol).value || '0').replace(/[^\d.-]/g, '')) || 1;
      const rawPub = pubPriceCol !== -1 ? parseFloat(String(row.getCell(pubPriceCol).value || '0').replace(/[^\d.-]/g, '')) || 0 : 0;
      const rawDisc = discountCol !== -1 ? parseFloat(String(row.getCell(discountCol).value || '0').replace(/[^\d.-]/g, '')) || 0 : 0;
      let rawBuy = buyPriceCol !== -1 ? parseFloat(String(row.getCell(buyPriceCol).value || '0').replace(/[^\d.-]/g, '')) || 0 : 0;
      if (!rawBuy && rawPub > 0) {
        rawBuy = rawPub * (1 - (rawDisc / 100));
      }

      let rawExpiry = '';
      if (expiryCol !== -1) {
        const expCell = row.getCell(expiryCol).value;
        if (expCell instanceof Date) {
          const m = String(expCell.getMonth() + 1).padStart(2, '0');
          const y = String(expCell.getFullYear()).slice(-2);
          rawExpiry = `${m}/${y}`;
        } else {
          rawExpiry = String(expCell || '').trim();
        }
      }

      const rawBatch = batchCol !== -1 ? String(row.getCell(batchCol).value || '').trim() : '';

      items.push({
        id: `inv_item_${r}_${Date.now()}`,
        medication_name: name,
        barcode: barcodeCol !== -1 ? String(row.getCell(barcodeCol).value || '').trim() : '',
        pack_size: 1,
        quantity: Math.max(1, rawQty),
        public_price: Math.max(0, rawPub),
        discount_percent: Math.max(0, rawDisc),
        buy_price: Math.max(0, parseFloat(rawBuy.toFixed(2))),
        total_price: parseFloat((rawQty * (rawBuy || rawPub)).toFixed(2)),
        expiry_date: rawExpiry,
        batch_number: rawBatch
      });
    }

    return {
      success: true,
      items,
      count: items.length
    };
  } catch (err) {
    console.error('Error parsing supplier invoice excel:', err);
    return { success: false, error: err.message || 'فشل قراءة ملف الإكسل' };
  }
}

/**
 * تصدير عروض وخصومات منصة i'SUPPLY وشبكة المخازن إلى ملف إكسل احترافي
 * @param {Array} feeds - عروض السوق والموزعين
 * @param {Object} options - خيارات إضافية (عنوان، تصفية المخزن، مخصصة)
 */
export async function exportISupplyMarketFeedsExcel(feeds = [], options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات - iSupply Gateway';
  wb.lastModifiedBy = 'إدارة المشتريات والتوريدات';
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet('عروض iSupply والمخازن', {
    views: [{ rightToLeft: true, state: 'normal' }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const exportDateStr = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const exportTimeStr = new Date().toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit'
  });

  // 1. الترويسة الفاخرة
  ws.mergeCells('A1:L1');
  const titleCell = ws.getCell('A1');
  titleCell.value = options.title || '🌐 كشف عروض وخصومات كبار الموزعين وشبكة المخازن - بوابة i\'SUPPLY المركزية';
  titleCell.font = { name: 'Segoe UI', size: 15, bold: true, color: { argb: THEME.white } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
  ws.getRow(1).height = 36;

  ws.mergeCells('A2:L2');
  const subCell = ws.getCell('A2');
  const warehouseFilterStr = options.selectedWarehouse ? ` | تصفية المخزن: ${options.selectedWarehouse}` : '';
  const scopeStr = options.isSelectedOnly ? ' (أصناف محددة يدوياً من الشاشة)' : ' (كافة عروض السوق المتاحة)';
  subCell.value = `تاريخ الاستخراج: ${exportDateStr} - ${exportTimeStr} | إجمالي الأصناف: ${feeds.length} صنف${scopeStr}${warehouseFilterStr}`;
  subCell.font = { name: 'Segoe UI', size: 10.5, italic: true, color: { argb: 'E0F2FE' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subHeaderBg } };
  ws.getRow(2).height = 24;

  ws.getRow(3).height = 10;

  // 2. عناوين الأعمدة
  const headers = [
    'م',
    'اسم الصنف الدوائي',
    'الاسم التجاري / العلمي',
    'الباركود',
    'سعر الجمهور (ج.م)',
    'أفضل موزع / شركة 👑',
    'المستودع / المخزن المورد',
    'أعلى خصم %',
    'سعر الشراء الصافي (ج.م)',
    'وفر الصنف للعلبة (ج.م)',
    'البوانص والكوتات',
    'حالة التوفر بالسوق'
  ];

  const headerRow = ws.getRow(4);
  headerRow.values = headers;
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentRoyal } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = THIN_BORDER;
  });

  // 3. تعبئة البيانات
  let startRow = 5;
  feeds.forEach((feed, idx) => {
    const r = ws.getRow(startRow + idx);
    const pub = Number(feed.public_price || 0);
    const disc = Number(feed.best_discount_percent || 0);
    const buy = Number(feed.best_buy_price || (pub > 0 ? pub * (1 - disc / 100) : 0));
    const savings = Math.max(0, pub - buy);

    let stockText = 'متوفر بالسوق';
    if (feed.stock_status === 'low_stock') stockText = 'رصيد منخفض ⚠️';
    else if (feed.stock_status === 'out_of_stock') stockText = 'غير متوفر ❌';

    let bonusText = feed.bonus_info || '';
    if (feed.quota_limit) {
      bonusText += (bonusText ? ' | ' : '') + `كوتة: ${feed.quota_limit} علب`;
    }
    if (!bonusText) bonusText = 'متاح بدون قيود';

    r.values = [
      idx + 1,
      feed.medication_name || '-',
      feed.trade_name_ar || feed.trade_name_en || '-',
      feed.barcode || '-',
      pub,
      feed.best_distributor_name || 'غير محدد',
      feed.warehouse_name || 'المستودع الرئيسي',
      disc,
      buy,
      savings,
      bonusText,
      stockText
    ];

    r.height = 22;

    const isAlt = idx % 2 === 1;
    const isTopDiscount = disc >= 24;

    r.eachCell((cell, colNum) => {
      cell.border = THIN_BORDER;
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };

      if (isAlt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.altRowBg } };
      }

      if (colNum === 2 || colNum === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (colNum === 2) cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: THEME.textDark } };
      }

      if (colNum === 5 || colNum === 9 || colNum === 10) {
        cell.numFmt = '#,##0.00';
      }

      if (colNum === 8) {
        cell.numFmt = '0.0"%"';
        if (isTopDiscount) {
          cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: THEME.textGreen } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.highlightGreen } };
        }
      }

      if (colNum === 9) {
        cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: THEME.headerBg } };
      }

      if (colNum === 10 && savings > 0) {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: THEME.textGreen } };
      }
    });
  });

  // 4. صف الإجماليات
  const totalRowIndex = startRow + feeds.length;
  if (feeds.length > 0) {
    const totRow = ws.getRow(totalRowIndex);
    totRow.getCell(1).value = 'الإجمالي والمتوسط العام';
    ws.mergeCells(`A${totalRowIndex}:D${totalRowIndex}`);
    totRow.getCell(5).value = { formula: `AVERAGE(E${startRow}:E${totalRowIndex - 1})` };
    totRow.getCell(5).numFmt = '#,##0.00';
    totRow.getCell(8).value = { formula: `AVERAGE(H${startRow}:H${totalRowIndex - 1})` };
    totRow.getCell(8).numFmt = '0.0"%"';
    totRow.getCell(9).value = { formula: `AVERAGE(I${startRow}:I${totalRowIndex - 1})` };
    totRow.getCell(9).numFmt = '#,##0.00';
    totRow.getCell(10).value = { formula: `SUM(J${startRow}:J${totalRowIndex - 1})` };
    totRow.getCell(10).numFmt = '#,##0.00';

    totRow.height = 26;
    totRow.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: THEME.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = THIN_BORDER;
    });
  }

  // 5. ضبط عروض الأعمدة
  const colWidths = [6, 28, 26, 16, 15, 22, 24, 13, 16, 16, 22, 16];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // 6. التنزيل بالمتصفح
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileNameSuffix = options.isSelectedOnly ? '-محدد' : '';
  a.download = `عروض-سوق-iSupply${fileNameSuffix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * تصدير كشف أصناف الأدوية غير المتوفرة بالسوق (نواقص معلقة) إلى شيت إكسل احترافي
 * @param {Array} items - قائمة الأصناف غير المتوفرة
 * @param {Object} options - خيارات إضافية (orgName, exportTitle)
 */
export async function exportUnavailableItemsExcel(items = [], options = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  wb.lastModifiedBy = 'إدارة المشتريات والتوريدات';
  wb.created = new Date();
  wb.modified = new Date();

  const exportDateStr = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const exportTimeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const ws = wb.addWorksheet('نواقص السوق المعلقة', {
    views: [{ rightToLeft: true, showGridLines: true, state: 'frozen', ySplit: 6 }]
  });

  const headerColor = '991B1B';     // أحمر قرمزي داكن للنواقص
  const subHeaderColor = '7F1D1D';  // قرمزي أعمق

  // 1. ترويسة التقرير الرئيسية
  ws.mergeCells('A1:I1');
  const titleCell = ws.getCell('A1');
  titleCell.value = '❌ كشف أصناف الأدوية غير المتوفرة بالسوق (عجز سوقي معلق) — إدارة المشتريات والتوريدات';
  titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: THEME.white } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // 2. سطر الميتاداتا
  ws.mergeCells('A2:I2');
  const metaCell = ws.getCell('A2');
  metaCell.value = `تاريخ وتوقيت الاستخراج: ${exportDateStr} - ${exportTimeStr}  |  المصدر: منظومة النواقص والمشتريات السحابية`;
  metaCell.font = { name: 'Arial', bold: true, size: 10, color: { argb: THEME.white } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: subHeaderColor } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  // 3. بطاقات إحصائية سريعة
  const totalItemsCount = items.length;
  const totalWantedQty = items.reduce((sum, it) => sum + (Number(it.total_wanted_qty || it.requested_quantity || 1) || 0), 0);
  const totalWaitingCust = items.reduce((sum, it) => sum + (Number(it.customers_waiting_count || it.waiting_customers?.length || 0) || 0), 0);
  const affectedBranchesCount = new Set(items.map(it => it.branch_id || it.branch_name)).size;

  ws.mergeCells('A4:B4');
  const kpi1 = ws.getCell('A4');
  kpi1.value = `إجمالي الأصناف: ${totalItemsCount} صنف`;
  kpi1.font = { name: 'Arial', bold: true, size: 11, color: { argb: '991B1B' } };
  kpi1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
  kpi1.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi1.border = THIN_BORDER;

  ws.mergeCells('C4:D4');
  const kpi2 = ws.getCell('C4');
  kpi2.value = `إجمالي الكميات المطلوبة: ${totalWantedQty}`;
  kpi2.font = { name: 'Arial', bold: true, size: 11, color: { argb: '1E3A8A' } };
  kpi2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFF6FF' } };
  kpi2.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi2.border = THIN_BORDER;

  ws.mergeCells('E4:F4');
  const kpi3 = ws.getCell('E4');
  kpi3.value = `العملاء المنتظرين: ${totalWaitingCust} عميل`;
  kpi3.font = { name: 'Arial', bold: true, size: 11, color: { argb: '92400E' } };
  kpi3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
  kpi3.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi3.border = THIN_BORDER;

  ws.mergeCells('G4:I4');
  const kpi4 = ws.getCell('G4');
  kpi4.value = `الفروع المتأثرة بالعجز: ${affectedBranchesCount} فرع`;
  kpi4.font = { name: 'Arial', bold: true, size: 11, color: { argb: '065F46' } };
  kpi4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
  kpi4.alignment = { horizontal: 'center', vertical: 'middle' };
  kpi4.border = THIN_BORDER;

  ws.getRow(4).height = 28;

  // 4. ترويسة الجدول
  const headers = [
    'م',
    'باركود الصنف الدولي',
    'اسم الدواء / الصنف الناقص بالسوق',
    'الفرع الطالب / النطاق',
    'نوع الوحدة',
    'إجمالي الكمية المطلوبة',
    'عدد العملاء المنتظرين',
    'أسماء وهواتف العملاء المنتظرين',
    'ملاحظات الصنف وسبب النقص'
  ];

  const headerRow = ws.getRow(6);
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 32;

  // 5. تعبئة الصفوف
  let rIdx = 7;
  items.forEach((it, idx) => {
    const row = ws.getRow(rIdx);
    const isAlt = idx % 2 === 1;
    const bg = isAlt ? 'FFF5F5' : THEME.white;

    const customersText = Array.isArray(it.waiting_customers) && it.waiting_customers.length > 0
      ? it.waiting_customers.map(c => `${c.customerName || c.name || ''} (${c.customerPhone || ''})`).join(' | ')
      : '—';

    const unitLabel = it.unit_type === 'strip' ? 'شريط' : 'علبة';

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = it.barcode || '—';
    row.getCell(3).value = it.medication_name || '—';
    row.getCell(4).value = it.branch_name || 'كافة الفروع / الإدارة العامة';
    row.getCell(5).value = unitLabel;
    row.getCell(6).value = Number(it.total_wanted_qty || it.requested_quantity || 1) || 1;
    row.getCell(7).value = Number(it.customers_waiting_count || it.waiting_customers?.length || 0) || 0;
    row.getCell(8).value = customersText;
    row.getCell(9).value = it.notes || (it.source === 'manual' ? 'تسجيل يدوي من المشتريات' : it.source === 'excel_import' ? 'استيراد إكسل' : 'عجز طلبات الفروع');

    row.height = 26;
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 10, bold: c === 3 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = THIN_BORDER;
      if (c === 1 || c === 5 || c === 6 || c === 7) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (c === 2) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: c === 8 || c === 9 };
      }
    }

    rIdx++;
  });

  // 6. صف الإجمالي
  if (items.length > 0) {
    const totRow = ws.getRow(rIdx);
    ws.mergeCells(`A${rIdx}:E${rIdx}`);
    totRow.getCell(1).value = `الإجمالي العام (${items.length} أصناف)`;
    totRow.getCell(6).value = { formula: `SUM(F7:F${rIdx - 1})` };
    totRow.getCell(7).value = { formula: `SUM(G7:G${rIdx - 1})` };
    totRow.getCell(8).value = '';
    totRow.getCell(9).value = '';

    totRow.height = 28;
    for (let c = 1; c <= 9; c++) {
      const cell = totRow.getCell(c);
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: THEME.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    }
  }

  // 7. ضبط عرض الأعمدة
  const colWidths = [6, 18, 36, 26, 12, 16, 16, 36, 28];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // 8. تحميل الملف
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `أصناف_غير_متوفرة_بالسوق_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * تحميل نموذج شيت إكسل فارغ لاستيراد أصناف النواقص
 */
export async function downloadUnavailableItemsTemplateExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'منظومة إدارة النواقص والمشتريات';
  const ws = wb.addWorksheet('قالب استيراد النواقص', {
    views: [{ rightToLeft: true, showGridLines: true }]
  });

  // ترويسة القالب
  ws.mergeCells('A1:F1');
  const tCell = ws.getCell('A1');
  tCell.value = '📋 قالب استيراد أصناف الأدوية غير المتوفرة بالسوق (املأ البيانات وارفع الملف)';
  tCell.font = { name: 'Arial', bold: true, size: 13, color: { argb: 'FFFFFF' } };
  tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  const headers = [
    'اسم الدواء / الصنف * (إلزامي)',
    'الباركود الدولي (اختياري)',
    'نوع الوحدة (علبة أو شريط)',
    'الكمية المطلوبة (افتراضي 1)',
    'اسم الفرع أو الكود (اختياري)',
    'سبب النقص أو ملاحظات المشتريات (اختياري)'
  ];

  const hRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '134E4A' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = THIN_BORDER;
  });
  hRow.height = 30;

  // صفوف تجريبية توضيحية
  const sampleRows = [
    ['Panadol Extra 500mg Tab', '622100000001', 'علبة', 10, 'كافة الفروع', 'شحيح لدى الموزعين'],
    ['Augmentin 1gm 14 Tab', '622100000002', 'علبة', 5, 'فرع المعادي', 'نقص إنتاج بالشركة'],
    ['Cataflam 50mg 20 Tab', '622100000003', 'شريط', 15, 'الفرع الرئيسي', 'متوقع توريده الأسبوع القادم']
  ];

  sampleRows.forEach((r, idx) => {
    const row = ws.getRow(3 + idx);
    r.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Arial', size: 10 };
      cell.alignment = { horizontal: cIdx === 0 || cIdx === 5 ? 'right' : 'center', vertical: 'middle' };
      cell.border = THIN_BORDER;
    });
    row.height = 24;
  });

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 24;
  ws.getColumn(6).width = 34;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `قالب_استيراد_نواقص_السوق.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * تحليل ملف إكسل لاستيراد أصناف النواقص
 * @param {File} file - ملف الإكسل
 * @returns {Promise<{success: boolean, items: Array, error?: string}>}
 */
export async function parseUnavailableItemsExcel(file) {
  try {
    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) {
      return { success: false, error: 'الملف فارغ أو لا يحتوي على أوراق عمل' };
    }

    let nameCol = -1;
    let barcodeCol = -1;
    let unitCol = -1;
    let qtyCol = -1;
    let branchCol = -1;
    let notesCol = -1;
    let headerRowIdx = 1;

    // البحث عن سطر العناوين
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        const val = String(row.getCell(c).value || '').trim().toLowerCase();
        if (val.includes('صنف') || val.includes('دواء') || val.includes('medication') || val.includes('item') || val.includes('name') || val.includes('product')) {
          nameCol = c;
          headerRowIdx = r;
        }
        if (val.includes('باركود') || val.includes('barcode') || val.includes('gtin') || val.includes('كود')) {
          barcodeCol = c;
        }
        if (val.includes('وحدة') || val.includes('unit') || val.includes('نوع الوحدة')) {
          unitCol = c;
        }
        if (val.includes('كمية') || val.includes('qty') || val.includes('quantity') || val.includes('العدد') || val.includes('المطلوب')) {
          qtyCol = c;
        }
        if (val.includes('فرع') || val.includes('branch') || val.includes('صيدلية')) {
          branchCol = c;
        }
        if (val.includes('ملاحظ') || val.includes('note') || val.includes('سبب') || val.includes('reason')) {
          notesCol = c;
        }
      }
      if (nameCol !== -1) break;
    }

    if (nameCol === -1) {
      nameCol = 1;
      barcodeCol = 2;
      unitCol = 3;
      qtyCol = 4;
      branchCol = 5;
      notesCol = 6;
    }

    const items = [];
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameVal = String(row.getCell(nameCol).value || '').trim();
      if (!nameVal || nameVal.startsWith('الإجمالي') || nameVal.startsWith('المجموع') || nameVal === 'م') {
        continue;
      }

      const barcodeVal = barcodeCol !== -1 ? String(row.getCell(barcodeCol).value || '').trim() : '';
      const unitValRaw = unitCol !== -1 ? String(row.getCell(unitCol).value || '').trim() : '';
      const unitType = unitValRaw.includes('شريط') || unitValRaw.toLowerCase().includes('strip') ? 'strip' : 'pack';
      const qtyVal = qtyCol !== -1 ? parseInt(row.getCell(qtyCol).value, 10) : 1;
      const branchVal = branchCol !== -1 ? String(row.getCell(branchCol).value || '').trim() : '';
      const notesVal = notesCol !== -1 ? String(row.getCell(notesCol).value || '').trim() : '';

      items.push({
        medicationName: nameVal,
        barcode: barcodeVal || null,
        unitType,
        requestedQuantity: Math.max(1, isNaN(qtyVal) ? 1 : qtyVal),
        branchName: branchVal || null,
        notes: notesVal || null
      });
    }

    if (items.length === 0) {
      return { success: false, error: 'لم يتم العثور على أي أصناف صالحة في الملف، تأكد من وجود عمود اسم الدواء' };
    }

    return { success: true, items };
  } catch (err) {
    console.error('Parse unavailable items error:', err);
    return { success: false, error: `حدث خطأ أثناء قراءة ملف الإكسل: ${err.message}` };
  }
}

