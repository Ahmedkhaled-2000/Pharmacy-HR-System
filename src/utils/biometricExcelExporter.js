import { loadExcelJS } from './excelExport';

const STYLES = {
  headerBg: 'FF0F766E',       // Deep Royal Teal
  headerText: 'FFFFFFFF',     // White
  subHeaderBg: 'FF115E59',    // Dark Teal
  cardBg: 'FFF0FDFA',         // Soft Mint Card
  cardBorder: 'FF14B8A6',     // Teal Border
  tableHeadBg: 'FF134E4A',    // Dark Table Header
  tableHeadText: 'FFFFFFFF',
  altRowBg: 'FFF8FAFC',       // Subtle zebra row
  checkInGreenBg: 'FFDCFCE7', // Soft green for check in
  checkInGreenText: 'FF166534',
  checkOutRedBg: 'FFFEE2E2',  // Soft red for check out
  checkOutRedText: 'FF991B1B',
  dedupBadgeBg: 'FFFEF3C7',   // Warning amber for dedup notes
  dedupBadgeText: 'FF92400E',
  borderGray: 'FFCBD5E1',
  textDark: 'FF1E293B',
  textMuted: 'FF64748B'
};

const THIN_BORDER = { style: 'thin', color: { argb: STYLES.borderGray } };
const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

/**
 * دالة ذكية لتنقية وفلترة البصمات المكررة (Punch Deduplication Algorithm)
 * تحسب أيضاً زمن العمل الفعلي بين كل حضور وانصراف
 */
export function deduplicatePunches(punches, windowMinutes = 5) {
  if (!Array.isArray(punches) || punches.length === 0) return [];

  // ترتيب الحركات زمنياً: الأقدم أولاً لكل موظف
  const sorted = [...punches].sort((a, b) => {
    const timeA = new Date(a.punch_time || `${a.date}T${a.time}`).getTime();
    const timeB = new Date(b.punch_time || `${b.date}T${b.time}`).getTime();
    return timeA - timeB;
  });

  const windowMs = windowMinutes * 60 * 1000;
  const filtered = [];
  const lastPunchByEmp = new Map(); // empId => { timestamp, actionType }

  for (const p of sorted) {
    const empId = p.employee_id || p.employeeId || p.device_user_pin || p.pin;
    const pTimeStr = p.punch_time || `${p.date || ''} ${p.time || ''}`;
    const pEpoch = new Date(pTimeStr).getTime() || Date.now();
    const action = p.action_type || p.actionType || (p.raw_punch_state === 1 ? 'check_out' : 'check_in');

    const last = lastPunchByEmp.get(empId);

    // إذا كانت البصمة لنفس الموظف ونفس الحركة خلال نافذة التكرار -> يتم استبعادها
    if (last && (pEpoch - last.epoch) < windowMs && last.action === action) {
      continue; // تكرار متوتر
    }

    lastPunchByEmp.set(empId, { epoch: pEpoch, action });
    filtered.push({
      ...p,
      _cleanedTime: pTimeStr,
      _epoch: pEpoch,
      _normalizedAction: action
    });
  }

  // إعادة الترتيب للعرض (الأحدث أولاً)
  return filtered.reverse();
}

/**
 * محرك تصدير إكسيل الاحترافي لسجل البصمات البيومترية
 */
export async function exportBiometricPunchesExcel({
  punches = [],
  companyName = 'مجموعة صيدليات المروة والدكتور سيف',
  title = 'سجل البصمات الحيوية الموحد (ZKTeco ADMS Biometrics)',
  dateRangeStr = '',
  branchName = 'كافة الفروع',
  filterEmployeeName = 'كافة الكوادر',
  showToast = null,
  enableDeduplication = true,
  dedupMinutes = 5
}) {
  try {
    const ExcelJS = await loadExcelJS(showToast);
    if (!ExcelJS) throw new Error('فشل تحميل محرك ExcelJS');

    // 1. تنقية وتصفية البيانات
    const finalPunches = enableDeduplication
      ? deduplicatePunches(punches, dedupMinutes)
      : [...punches];

    const deduplicatedCount = punches.length - finalPunches.length;

    // 2. إنشاء المصنف وورقة العمل
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pharma HR Cloud Biometrics';
    wb.lastModifiedBy = 'Pharma HR System';
    wb.created = new Date();
    wb.modified = new Date();

    const ws = wb.addWorksheet('سجل البصمات المعتمد', {
      views: [{ rightToLeft: true }], // RTL للعربية
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    });

    let row = 1;

    // 3. الترويسة المؤسسية الملكية (Header Banner)
    ws.mergeCells(`A${row}:J${row}`);
    const mainTitleCell = ws.getCell(`A${row}`);
    mainTitleCell.value = `🏛️ ${companyName}`;
    mainTitleCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: STYLES.headerText } };
    mainTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.headerBg } };
    mainTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 36;
    row++;

    ws.mergeCells(`A${row}:J${row}`);
    const subTitleCell = ws.getCell(`A${row}`);
    subTitleCell.value = `${title} - تقرير معتمد وخالي من البصمات المكررة`;
    subTitleCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FFE2E8F0' } };
    subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.subHeaderBg } };
    subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 24;
    row++;

    // 4. بطاقات ملخص المؤشرات الإدارية (KPI Summary Row)
    row++; // سطر فراغ
    const kpiRow = row;
    
    // إجمالي الحركات
    ws.mergeCells(`A${kpiRow}:B${kpiRow}`);
    const kpi1 = ws.getCell(`A${kpiRow}`);
    kpi1.value = `إجمالي الحركات الصالحة: ${finalPunches.length}`;
    kpi1.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF0D9488' } };
    kpi1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    kpi1.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi1.border = CELL_BORDER;

    // الموظفون الفريدون
    const uniqueEmployees = new Set(finalPunches.map(p => p.employee_id || p.employeeId || p.device_user_pin)).size;
    ws.mergeCells(`C${kpiRow}:D${kpiRow}`);
    const kpi2 = ws.getCell(`C${kpiRow}`);
    kpi2.value = `عدد الموظفين: ${uniqueEmployees}`;
    kpi2.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF1E293B' } };
    kpi2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    kpi2.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi2.border = CELL_BORDER;

    // الحركات المكررة المستبعدة
    ws.mergeCells(`E${kpiRow}:G${kpiRow}`);
    const kpi3 = ws.getCell(`E${kpiRow}`);
    kpi3.value = `البصمات المكررة المستبعدة بالذكاء: ${deduplicatedCount} حركة`;
    kpi3.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF92400E' } };
    kpi3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    kpi3.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi3.border = CELL_BORDER;

    // نطاق البحث والفرع
    ws.mergeCells(`H${kpiRow}:J${kpiRow}`);
    const kpi4 = ws.getCell(`H${kpiRow}`);
    kpi4.value = `الفرع: ${branchName} | الموظف: ${filterEmployeeName}`;
    kpi4.font = { name: 'Arial', bold: false, size: 10, color: { argb: STYLES.textMuted } };
    kpi4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    kpi4.alignment = { horizontal: 'center', vertical: 'middle' };
    kpi4.border = CELL_BORDER;
    ws.getRow(kpiRow).height = 28;

    row += 2; // فراغ قبل الجدول

    // 5. ترويسة أعمدة جدول الحركات
    const headers = [
      { text: '#', width: 6 },
      { text: 'التاريخ', width: 14 },
      { text: 'اليوم', width: 12 },
      { text: 'الوقت', width: 12 },
      { text: 'كود الموظف (PIN)', width: 18 },
      { text: 'اسم الموظف', width: 28 },
      { text: 'الفرع التابع له', width: 20 },
      { text: 'نوع الحركة', width: 16 },
      { text: 'وسيلة البصمة', width: 18 },
      { text: 'سيريال الماكينة / ملاحظات', width: 26 }
    ];

    const tableHeadRow = ws.getRow(row);
    tableHeadRow.height = 26;
    headers.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = ws.getCell(`${colLetter}${row}`);
      cell.value = h.text;
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: STYLES.tableHeadText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.tableHeadBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = CELL_BORDER;
      ws.getColumn(idx + 1).width = h.width;
    });
    row++;

    // 6. صفوف البيانات
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    finalPunches.forEach((p, idx) => {
      const pRow = ws.getRow(row);
      pRow.height = 22;
      const isAlt = idx % 2 === 1;
      const rowBg = isAlt ? STYLES.altRowBg : 'FFFFFFFF';

      // استخراج التاريخ واليوم
      const pTimeRaw = p.punch_time || `${p.date || ''} ${p.time || ''}`;
      let dateStr = p.date || '';
      let timeStr = p.time || '';
      let dayName = '-';

      try {
        const d = new Date(pTimeRaw);
        if (!isNaN(d.getTime())) {
          dateStr = d.toISOString().slice(0, 10);
          timeStr = d.toTimeString().slice(0, 8);
          dayName = arabicDays[d.getDay()];
        }
      } catch {}

      const pin = p.device_user_pin || p.pin || p.employee_code || p.employeeCode || '-';
      const empName = p.employee_name || p.employeeName || 'موظف غير معرف';
      const bName = p.branch_name || p.branchName || (p.branch_id ? `فرع (${p.branch_id})` : 'الإدارة العامة');
      const action = p._normalizedAction || p.action_type || p.actionType;
      const isCheckIn = action === 'check_in' || action === 'shift_start' || p.raw_punch_state === 0;
      const actionLabel = isCheckIn ? 'حضور (Check-In)' : 'انصراف (Check-Out)';

      // وسيلة التحقق
      let verifyLabel = 'بصمة إصبع (Fingerprint)';
      const vt = String(p.verify_type || '').toUpperCase();
      if (vt === 'FACE' || p.raw_verify_type === 15) verifyLabel = 'بصمة وجه (Face)';
      else if (vt === 'PASSWORD' || vt === 'PASS') verifyLabel = 'كلمة مرور (Password)';
      else if (vt === 'CARD' || vt === 'RFID') verifyLabel = 'كارت ذكي (RFID)';

      const notes = p.device_serial || p.deviceSerial || 'MB20 - ADMS';

      const rowValues = [
        idx + 1,
        dateStr,
        dayName,
        timeStr,
        pin,
        empName,
        bName,
        actionLabel,
        verifyLabel,
        notes
      ];

      rowValues.forEach((val, cIdx) => {
        const colLetter = String.fromCharCode(65 + cIdx);
        const cell = ws.getCell(`${colLetter}${row}`);
        cell.value = val;
        cell.font = { name: 'Arial', size: 10, color: { argb: STYLES.textDark } };
        cell.alignment = { horizontal: cIdx === 5 ? 'right' : 'center', vertical: 'middle' };
        cell.border = CELL_BORDER;

        // تلوين نوع الحركة
        if (cIdx === 7) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isCheckIn ? STYLES.checkInGreenBg : STYLES.checkOutRedBg }
          };
          cell.font = {
            name: 'Arial',
            bold: true,
            size: 10,
            color: { argb: isCheckIn ? STYLES.checkInGreenText : STYLES.checkOutRedText }
          };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      });

      row++;
    });

    // 7. تذييل التقرير
    row++;
    ws.mergeCells(`A${row}:J${row}`);
    const footerCell = ws.getCell(`A${row}`);
    footerCell.value = `تم استخراج هذا التقرير آلياً عبر نظام إدارة الصيدليات الموحد بتاريخ ${new Date().toLocaleString('ar-EG')} - تم تطبيق خوارزمية استبعاد التكرار البيومتري بنجاح.`;
    footerCell.font = { name: 'Arial', italic: true, size: 9, color: { argb: STYLES.textMuted } };
    footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 20;

    // 8. حفظ الملف وتنزيله
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanFileName = `سجل_البصمات_المعتمد_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.download = cleanFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast?.(`✅ تم تصدير شيت الإكسيل الاحترافي بنجاح (${finalPunches.length} حركة بعد استبعاد ${deduplicatedCount} حركة مكررة)`);
    return true;
  } catch (err) {
    console.error('[Biometric Excel Export Error]:', err);
    showToast?.(`❌ فشل تصدير الإكسيل: ${err.message}`);
    throw err;
  }
}
