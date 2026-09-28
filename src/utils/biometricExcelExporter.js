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
  overtimeBg: 'FFFEF3C7',     // Soft amber for overtime
  overtimeText: 'FF92400E',
  borderGray: 'FFCBD5E1',
  textDark: 'FF1E293B',
  textMuted: 'FF64748B',
  summaryBg: 'FFE6FFFA',
  totalHeadBg: 'FF0D9488'
};

const THIN_BORDER = { style: 'thin', color: { argb: STYLES.borderGray } };
const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
const DOUBLE_BOTTOM_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: { style: 'double', color: { argb: 'FF0F766E' } }, right: THIN_BORDER };

/**
 * دالة ذكية لتنقية وفلترة البصمات المكررة (Punch Deduplication Algorithm)
 */
export function deduplicatePunches(punches, windowMinutes = 5) {
  if (!Array.isArray(punches) || punches.length === 0) return [];

  const sorted = [...punches].sort((a, b) => {
    const timeA = new Date(a.punch_time || `${a.date}T${a.time}`).getTime();
    const timeB = new Date(b.punch_time || `${b.date}T${b.time}`).getTime();
    return timeA - timeB;
  });

  const windowMs = windowMinutes * 60 * 1000;
  const filtered = [];
  const lastPunchByEmp = new Map();

  for (const p of sorted) {
    const empId = p.employee_id || p.employeeId || p.device_user_pin || p.pin;
    const pTimeStr = p.punch_time || `${p.date || ''} ${p.time || ''}`;
    const pEpoch = new Date(pTimeStr).getTime() || Date.now();
    const action = p.action_type || p.actionType || (p.raw_punch_state === 1 ? 'check_out' : 'check_in');

    const last = lastPunchByEmp.get(empId);

    if (last && (pEpoch - last.epoch) < windowMs && last.action === action) {
      continue;
    }

    lastPunchByEmp.set(empId, { epoch: pEpoch, action });
    filtered.push({
      ...p,
      _cleanedTime: pTimeStr,
      _epoch: pEpoch,
      _normalizedAction: action
    });
  }

  return filtered.reverse();
}

/**
 * محرك تصدير إكسيل الاحترافي لسجل البصمات البيومترية وساعات العمل والوقت الإضافي
 * يدعم:
 * 1. الفلترة بجهاز بصمة محدد
 * 2. الفلترة بموظف محدد
 * 3. توليد تبويب رئيسي ملخص لكافة الحركات
 * 4. توليد ورقة عمل مستقلة لكل موظف على حدة
 * 5. إدراج معادلات إكسيل الحية لحساب ساعات العمل الفعلية والإضافية
 */
export async function exportBiometricPunchesExcel({
  punches = [],
  companyName = 'مجموعة صيدليات المروة والدكتور سيف',
  title = 'سجل البصمات وساعات العمل والوقت الإضافي',
  dateRangeStr = '',
  branchName = 'كافة الفروع',
  filterEmployeeName = 'كافة الكوادر',
  filterEmployeeId = 'ALL',
  deviceSerial = 'ALL',
  employees = [],
  branches = [],
  devices = [],
  showToast = null,
  enableDeduplication = true,
  dedupMinutes = 5
}) {
  try {
    const ExcelJS = await loadExcelJS(showToast);
    if (!ExcelJS) throw new Error('فشل تحميل محرك ExcelJS');

    // 1. فلترة البيانات الأساسية
    let candidatePunches = [...punches];

    // فلترة بالجهاز المحدد
    if (deviceSerial && deviceSerial !== 'ALL') {
      candidatePunches = candidatePunches.filter(p =>
        String(p.device_serial || p.deviceSerial || '') === String(deviceSerial)
      );
    }

    // فلترة بالموظف المحدد
    if (filterEmployeeId && filterEmployeeId !== 'ALL') {
      candidatePunches = candidatePunches.filter(p =>
        String(p.employee_id || p.employeeId || '') === String(filterEmployeeId)
      );
    }

    // تطبيق خوارزمية منع التكرار
    const finalPunches = enableDeduplication
      ? deduplicatePunches(candidatePunches, dedupMinutes)
      : candidatePunches;

    const deduplicatedCount = candidatePunches.length - finalPunches.length;

    // 2. إنشاء مصنف الإكسيل
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pharma HR Cloud Biometrics';
    wb.lastModifiedBy = 'Pharma HR System';
    wb.created = new Date();
    wb.modified = new Date();

    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    // اسم الجهاز المختار للعرض
    const selectedDevObj = devices.find(d => String(d.serial_number) === String(deviceSerial));
    const deviceLabel = deviceSerial === 'ALL'
      ? 'كافة أجهزة البصمة'
      : `${selectedDevObj?.device_name || 'جهاز'} (${deviceSerial})`;

    // ════════════════════════════════════════════════════════════════════════════
    // ورقة العمل 1: سجل البصمات العام (Master Attendance Log)
    // ════════════════════════════════════════════════════════════════════════════
    const wsMaster = wb.addWorksheet('سجل البصمات العام', {
      views: [{ rightToLeft: true }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    });

    let mRow = 1;

    // الترويسة الرئيسية
    wsMaster.mergeCells(`A${mRow}:J${mRow}`);
    const mTitleCell = wsMaster.getCell(`A${mRow}`);
    mTitleCell.value = `🏛️ ${companyName}`;
    mTitleCell.font = { name: 'Arial', bold: true, size: 16, color: { argb: STYLES.headerText } };
    mTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.headerBg } };
    mTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsMaster.getRow(mRow).height = 36;
    mRow++;

    wsMaster.mergeCells(`A${mRow}:J${mRow}`);
    const mSubCell = wsMaster.getCell(`A${mRow}`);
    mSubCell.value = `${title} | الجهاز: ${deviceLabel} | الفرع: ${branchName} | الفترة: ${dateRangeStr || 'كافة السجلات'}`;
    mSubCell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFE2E8F0' } };
    mSubCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.subHeaderBg } };
    mSubCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsMaster.getRow(mRow).height = 24;
    mRow++;

    // بطاقات المؤشرات الإدارية KPI
    mRow++;
    const kpiRow = mRow;

    wsMaster.mergeCells(`A${kpiRow}:B${kpiRow}`);
    const k1 = wsMaster.getCell(`A${kpiRow}`);
    k1.value = `إجمالي الحركات: ${finalPunches.length}`;
    k1.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF0D9488' } };
    k1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    k1.alignment = { horizontal: 'center', vertical: 'middle' };
    k1.border = CELL_BORDER;

    const uniqueEmpsCount = new Set(finalPunches.map(p => p.employee_id || p.employeeId || p.device_user_pin)).size;
    wsMaster.mergeCells(`C${kpiRow}:D${kpiRow}`);
    const k2 = wsMaster.getCell(`C${kpiRow}`);
    k2.value = `عدد الموظفين: ${uniqueEmpsCount}`;
    k2.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF1E293B' } };
    k2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    k2.alignment = { horizontal: 'center', vertical: 'middle' };
    k2.border = CELL_BORDER;

    wsMaster.mergeCells(`E${kpiRow}:G${kpiRow}`);
    const k3 = wsMaster.getCell(`E${kpiRow}`);
    k3.value = `البصمات المكررة المستبعدة: ${deduplicatedCount} حركة`;
    k3.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF92400E' } };
    k3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    k3.alignment = { horizontal: 'center', vertical: 'middle' };
    k3.border = CELL_BORDER;

    wsMaster.mergeCells(`H${kpiRow}:J${kpiRow}`);
    const k4 = wsMaster.getCell(`H${kpiRow}`);
    k4.value = `الموظف المختار: ${filterEmployeeName}`;
    k4.font = { name: 'Arial', bold: false, size: 10, color: { argb: STYLES.textMuted } };
    k4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
    k4.alignment = { horizontal: 'center', vertical: 'middle' };
    k4.border = CELL_BORDER;
    wsMaster.getRow(kpiRow).height = 28;

    mRow += 2;

    // أعمدة الجدول العام
    const masterHeaders = [
      { text: '#', width: 6 },
      { text: 'التاريخ', width: 14 },
      { text: 'اليوم', width: 12 },
      { text: 'الوقت', width: 12 },
      { text: 'كود الموظف (PIN)', width: 18 },
      { text: 'اسم الموظف', width: 28 },
      { text: 'الفرع التابع له', width: 20 },
      { text: 'نوع الحركة', width: 16 },
      { text: 'وسيلة البصمة', width: 18 },
      { text: 'سيريال الماكينة / ملاحظات', width: 24 }
    ];

    const masterHeadRow = wsMaster.getRow(mRow);
    masterHeadRow.height = 26;
    masterHeaders.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = wsMaster.getCell(`${colLetter}${mRow}`);
      cell.value = h.text;
      cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: STYLES.tableHeadText } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.tableHeadBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = CELL_BORDER;
      wsMaster.getColumn(idx + 1).width = h.width;
    });
    mRow++;

    // صفوف الجدول العام
    finalPunches.forEach((p, idx) => {
      const pRow = wsMaster.getRow(mRow);
      pRow.height = 22;
      const isAlt = idx % 2 === 1;
      const rowBg = isAlt ? STYLES.altRowBg : 'FFFFFFFF';

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

      let verifyLabel = '👆 بصمة الإصبع';
      const vt = String(p.verify_type || p.verifyType || '').toUpperCase();
      if (vt === 'FACE' || p.raw_verify_type === 15) {
        verifyLabel = '👤 بصمة الوجه';
      } else if (vt === 'PASSWORD' || vt === 'PASS') {
        verifyLabel = '🔑 كلمة مرور';
      } else if (vt === 'CARD' || vt === 'RFID') {
        verifyLabel = '💳 كارت ذكي';
      }

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
        const cell = wsMaster.getCell(`${colLetter}${mRow}`);
        cell.value = val;
        cell.font = { name: 'Arial', size: 10, color: { argb: STYLES.textDark } };
        cell.alignment = { horizontal: cIdx === 5 ? 'right' : 'center', vertical: 'middle' };
        cell.border = CELL_BORDER;

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

      mRow++;
    });

    // ════════════════════════════════════════════════════════════════════════════
    // أوراق العمل 2..N: صفحة خاصة لكل موظف على حدة بحساب ساعات العمل والإضافي
    // ════════════════════════════════════════════════════════════════════════════

    // تجميع البصمات لكل موظف
    const punchesByEmp = new Map();
    for (const p of finalPunches) {
      const empId = String(p.employee_id || p.employeeId || p.device_user_pin || p.pin || 'unknown');
      const list = punchesByEmp.get(empId) || [];
      list.push(p);
      punchesByEmp.set(empId, list);
    }

    const createdSheetNames = new Set();

    for (const [empIdKey, empPunches] of punchesByEmp.entries()) {
      // إيجاد بيانات الموظف
      const empObj = employees.find(e =>
        String(e.id) === String(empIdKey) ||
        String(e.code) === String(empIdKey) ||
        empPunches.some(p => String(p.device_user_pin) === String(e.code) || String(p.device_user_pin) === String(e.id))
      );

      const firstPunch = empPunches[0] || {};
      const empName = empObj?.name || firstPunch.employee_name || firstPunch.employeeName || `موظف ${empIdKey}`;
      const empPin = firstPunch.device_user_pin || firstPunch.pin || empObj?.code || empIdKey;
      const branchObj = branches.find(b => String(b.id) === String(empObj?.branchId || firstPunch.branch_id));
      const empBranchName = branchObj?.name || firstPunch.branch_name || 'الإدارة العامة';

      // ساعات العمل الرسمية باللائحة الموضوعة في ملف الموظف (الافتراضي 8 ساعات)
      const officialHours = parseFloat(empObj?.workHoursPerDay || empObj?.workHours) || 8.0;

      // توليد اسم الورقة (بحد أقصى 28 حرف وتطهير الرموز الممنوعة في إكسيل)
      let cleanTabName = empName.replace(/[\/\\?*\[\]:]/g, '-').trim().slice(0, 24);
      if (!cleanTabName) cleanTabName = `موظف ${empPin}`;
      let sheetName = cleanTabName;
      let suffix = 2;
      while (createdSheetNames.has(sheetName)) {
        sheetName = `${cleanTabName}_${suffix}`;
        suffix++;
      }
      createdSheetNames.add(sheetName);

      const wsEmp = wb.addWorksheet(sheetName, {
        views: [{ rightToLeft: true }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
      });

      let eRow = 1;

      // ترويسة صفحة الموظف
      wsEmp.mergeCells(`A${eRow}:I${eRow}`);
      const empHeaderCell = wsEmp.getCell(`A${eRow}`);
      empHeaderCell.value = `🏛️ ${companyName} - كشف حضور وساعات عمل الموظف`;
      empHeaderCell.font = { name: 'Arial', bold: true, size: 15, color: { argb: STYLES.headerText } };
      empHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.headerBg } };
      empHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
      wsEmp.getRow(eRow).height = 34;
      eRow++;

      // بطاقة بيانات الموظف
      wsEmp.mergeCells(`A${eRow}:D${eRow}`);
      const info1 = wsEmp.getCell(`A${eRow}`);
      info1.value = `👤 الموظف: ${empName} (PIN: ${empPin})`;
      info1.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF0F766E' } };
      info1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
      info1.alignment = { horizontal: 'right', vertical: 'middle' };
      info1.border = CELL_BORDER;

      wsEmp.mergeCells(`E${eRow}:G${eRow}`);
      const info2 = wsEmp.getCell(`E${eRow}`);
      info2.value = `🏥 الفرع: ${empBranchName}`;
      info2.font = { name: 'Arial', bold: true, size: 11, color: { argb: STYLES.textDark } };
      info2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
      info2.alignment = { horizontal: 'center', vertical: 'middle' };
      info2.border = CELL_BORDER;

      wsEmp.mergeCells(`H${eRow}:I${eRow}`);
      const info3 = wsEmp.getCell(`H${eRow}`);
      info3.value = `⏱️ الساعات الرسمية: ${officialHours.toFixed(1)} س/يوم`;
      info3.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FF166534' } };
      info3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.cardBg } };
      info3.alignment = { horizontal: 'center', vertical: 'middle' };
      info3.border = CELL_BORDER;
      wsEmp.getRow(eRow).height = 28;
      eRow++;

      eRow++; // سطر فراغ

      // تجميع بصمات الموظف حسب الأيام لحساب أول دخول وآخر خروج
      const daysMap = new Map(); // dateKey => { dateStr, dayName, checkIn, checkOut, device }
      empPunches.forEach(p => {
        const pTimeRaw = p.punch_time || `${p.date || ''} ${p.time || ''}`;
        let dateStr = p.date || '';
        let timeStr = p.time || '';
        let dayName = '-';
        let timeEpoch = 0;

        try {
          const d = new Date(pTimeRaw);
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().slice(0, 10);
            timeStr = d.toTimeString().slice(0, 8);
            dayName = arabicDays[d.getDay()];
            timeEpoch = d.getTime();
          }
        } catch {}

        if (!dateStr) return;

        const dayEntry = daysMap.get(dateStr) || {
          dateStr,
          dayName,
          firstIn: null,
          lastOut: null,
          firstInEpoch: Infinity,
          lastOutEpoch: -Infinity,
          device: p.device_serial || p.deviceSerial || ''
        };

        const action = p._normalizedAction || p.action_type || p.actionType;
        const isCheckIn = action === 'check_in' || action === 'shift_start' || p.raw_punch_state === 0;

        if (isCheckIn) {
          if (timeEpoch < dayEntry.firstInEpoch) {
            dayEntry.firstInEpoch = timeEpoch;
            dayEntry.firstIn = timeStr;
          }
        } else {
          if (timeEpoch > dayEntry.lastOutEpoch) {
            dayEntry.lastOutEpoch = timeEpoch;
            dayEntry.lastOut = timeStr;
          }
        }

        daysMap.set(dateStr, dayEntry);
      });

      // ترتيب الأيام تصاعدياً
      const sortedDays = Array.from(daysMap.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      // أعمدة جدول الموظف التفصيلي
      const empHeaders = [
        { text: '#', width: 6 },
        { text: 'التاريخ', width: 14 },
        { text: 'اليوم', width: 12 },
        { text: 'بصمة الدخول (حضور)', width: 18 },
        { text: 'بصمة الخروج (انصراف)', width: 18 },
        { text: 'ساعات العمل الفعلية', width: 20 },
        { text: 'الساعات الرسمية', width: 18 },
        { text: 'الوقت الإضافي (Overtime)', width: 22 },
        { text: 'الجهاز / ملاحظات', width: 22 }
      ];

      const empHeadRow = wsEmp.getRow(eRow);
      empHeadRow.height = 26;
      empHeaders.forEach((h, idx) => {
        const colLetter = String.fromCharCode(65 + idx);
        const cell = wsEmp.getCell(`${colLetter}${eRow}`);
        cell.value = h.text;
        cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: STYLES.tableHeadText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.tableHeadBg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = CELL_BORDER;
        wsEmp.getColumn(idx + 1).width = h.width;
      });
      eRow++;

      const startDataRow = eRow;

      sortedDays.forEach((day, idx) => {
        const rowNum = eRow;
        const curRow = wsEmp.getRow(rowNum);
        curRow.height = 22;
        const isAlt = idx % 2 === 1;
        const rowBg = isAlt ? STYLES.altRowBg : 'FFFFFFFF';

        const inTime = day.firstIn || '';
        const outTime = day.lastOut || '';

        // عمود #
        const cA = wsEmp.getCell(`A${rowNum}`);
        cA.value = idx + 1;
        cA.alignment = { horizontal: 'center', vertical: 'middle' };
        cA.border = CELL_BORDER;
        cA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // التاريخ
        const cB = wsEmp.getCell(`B${rowNum}`);
        cB.value = day.dateStr;
        cB.alignment = { horizontal: 'center', vertical: 'middle' };
        cB.border = CELL_BORDER;
        cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // اليوم
        const cC = wsEmp.getCell(`C${rowNum}`);
        cC.value = day.dayName;
        cC.alignment = { horizontal: 'center', vertical: 'middle' };
        cC.border = CELL_BORDER;
        cC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // الدخول
        const cD = wsEmp.getCell(`D${rowNum}`);
        cD.value = inTime || '—';
        cD.alignment = { horizontal: 'center', vertical: 'middle' };
        cD.border = CELL_BORDER;
        cD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: inTime ? STYLES.checkInGreenBg : rowBg } };
        cD.font = { name: 'Arial', bold: !!inTime, color: { argb: inTime ? STYLES.checkInGreenText : STYLES.textMuted } };

        // الخروج
        const cE = wsEmp.getCell(`E${rowNum}`);
        cE.value = outTime || '—';
        cE.alignment = { horizontal: 'center', vertical: 'middle' };
        cE.border = CELL_BORDER;
        cE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: outTime ? STYLES.checkOutRedBg : rowBg } };
        cE.font = { name: 'Arial', bold: !!outTime, color: { argb: outTime ? STYLES.checkOutRedText : STYLES.textMuted } };

        // عمود F: ساعات العمل الفعلية (معادلة إكسيل الذكية لحساب الفرق بين الدخول والخروج)
        const cF = wsEmp.getCell(`F${rowNum}`);
        if (inTime && outTime) {
          // معادلة إكسيل تحسب الفرق بالدقائق والساعات مع دعم المناوبات المسائية:
          // =ROUND(IF(TIMEVALUE(E{r})>=TIMEVALUE(D{r}), (TIMEVALUE(E{r})-TIMEVALUE(D{r}))*24, (TIMEVALUE(E{r})+1-TIMEVALUE(D{r}))*24), 2)
          cF.value = {
            formula: `ROUND(IF(TIMEVALUE(E${rowNum})>=TIMEVALUE(D${rowNum}), (TIMEVALUE(E${rowNum})-TIMEVALUE(D${rowNum}))*24, (TIMEVALUE(E${rowNum})+1-TIMEVALUE(D${rowNum}))*24), 2)`
          };
        } else {
          cF.value = 0;
        }
        cF.numFmt = '0.00';
        cF.alignment = { horizontal: 'center', vertical: 'middle' };
        cF.border = CELL_BORDER;
        cF.font = { name: 'Arial', bold: true, color: { argb: 'FF0F766E' } };
        cF.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // عمود G: ساعات العمل الرسمية
        const cG = wsEmp.getCell(`G${rowNum}`);
        cG.value = officialHours;
        cG.numFmt = '0.00';
        cG.alignment = { horizontal: 'center', vertical: 'middle' };
        cG.border = CELL_BORDER;
        cG.font = { name: 'Arial', color: { argb: STYLES.textDark } };
        cG.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // عمود H: الوقت الإضافي (معادلة إكسيل: إذا كان العمل الفعلي > الرسمي -> الفرق)
        const cH = wsEmp.getCell(`H${rowNum}`);
        cH.value = {
          formula: `IF(F${rowNum}>G${rowNum}, ROUND(F${rowNum}-G${rowNum}, 2), 0)`
        };
        cH.numFmt = '0.00';
        cH.alignment = { horizontal: 'center', vertical: 'middle' };
        cH.border = CELL_BORDER;
        cH.font = { name: 'Arial', bold: true, color: { argb: STYLES.overtimeText } };
        cH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.overtimeBg } };

        // عمود I: الماكينة / ملاحظات
        const cI = wsEmp.getCell(`I${rowNum}`);
        cI.value = day.device || 'MB20';
        cI.alignment = { horizontal: 'center', vertical: 'middle' };
        cI.border = CELL_BORDER;
        cI.font = { name: 'Arial', size: 9, color: { argb: STYLES.textMuted } };
        cI.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        eRow++;
      });

      const endDataRow = eRow - 1;

      // صف الإجمالي العام النهائي لكل موظف بمعادلات SUM التلقائية
      if (endDataRow >= startDataRow) {
        const totalRow = wsEmp.getRow(eRow);
        totalRow.height = 28;

        wsEmp.mergeCells(`A${eRow}:E${eRow}`);
        const cTotalLabel = wsEmp.getCell(`A${eRow}`);
        cTotalLabel.value = '🏆 إجمالي ساعات الشهر / الفترة:';
        cTotalLabel.font = { name: 'Arial', bold: true, size: 11, color: { argb: '#FFFFFF' } };
        cTotalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.totalHeadBg } };
        cTotalLabel.alignment = { horizontal: 'center', vertical: 'middle' };
        cTotalLabel.border = DOUBLE_BOTTOM_BORDER;

        // مجموع الساعات الفعلية
        const cTotWorked = wsEmp.getCell(`F${eRow}`);
        cTotWorked.value = { formula: `ROUND(SUM(F${startDataRow}:F${endDataRow}), 2)` };
        cTotWorked.numFmt = '0.00';
        cTotWorked.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF0F766E' } };
        cTotWorked.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.summaryBg } };
        cTotWorked.alignment = { horizontal: 'center', vertical: 'middle' };
        cTotWorked.border = DOUBLE_BOTTOM_BORDER;

        // مجموع الساعات الرسمية
        const cTotOfficial = wsEmp.getCell(`G${eRow}`);
        cTotOfficial.value = { formula: `ROUND(SUM(G${startDataRow}:G${endDataRow}), 2)` };
        cTotOfficial.numFmt = '0.00';
        cTotOfficial.font = { name: 'Arial', bold: true, size: 11, color: { argb: STYLES.textDark } };
        cTotOfficial.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.summaryBg } };
        cTotOfficial.alignment = { horizontal: 'center', vertical: 'middle' };
        cTotOfficial.border = DOUBLE_BOTTOM_BORDER;

        // مجموع الساعات الإضافية
        const cTotOvertime = wsEmp.getCell(`H${eRow}`);
        cTotOvertime.value = { formula: `ROUND(SUM(H${startDataRow}:H${endDataRow}), 2)` };
        cTotOvertime.numFmt = '0.00';
        cTotOvertime.font = { name: 'Arial', bold: true, size: 12, color: { argb: STYLES.overtimeText } };
        cTotOvertime.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.overtimeBg } };
        cTotOvertime.alignment = { horizontal: 'center', vertical: 'middle' };
        cTotOvertime.border = DOUBLE_BOTTOM_BORDER;

        // ملاحظات التذييل
        const cTotNote = wsEmp.getCell(`I${eRow}`);
        cTotNote.value = 'معادلات إكسيل حية';
        cTotNote.font = { name: 'Arial', italic: true, size: 9, color: { argb: STYLES.textMuted } };
        cTotNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STYLES.summaryBg } };
        cTotNote.alignment = { horizontal: 'center', vertical: 'middle' };
        cTotNote.border = DOUBLE_BOTTOM_BORDER;

        eRow++;
      }
    }

    // 3. كتابة ملف الإكسيل وتنزيله في المتصفح
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanFileName = `كشف_البصمات_وساعات_العمل_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.download = cleanFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast?.(`✅ تم تصدير شيت الإكسيل المتطور بنجاح (${finalPunches.length} حركة - مع صفحة مستقلة ومعادلات حية لكل موظف)`);
    return true;
  } catch (err) {
    console.error('[Biometric Excel Export Error]:', err);
    showToast?.(`❌ فشل تصدير الإكسيل: ${err.message}`);
    throw err;
  }
}
