import { useCallback } from 'react';
import { uid, fmt, arabicWeekday, arabicMonthLabel, isEmployeeActive } from '../utils/formatters';
import { getRealTodayStr } from '../utils/timeEngine';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../utils/excelExport';
import { getJobsList, getDepartmentsList } from '../utils/jobsHelper';
import { exportComprehensiveCompanyPayrollExcel } from '../utils/grandPayrollExcelExporter';
import { getEffectiveShiftHours, isApprovedPermissionForDate, computeLatenessFinancialAmount } from '../utils/latePenaltyEngine';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useExcelOperations() {
  const {
    state,
    setState,
    saveState,
    getEmp,
    computeEmpSummary,
    computeGrandPayroll
  } = useData();

  const {
    monthPicker,
    adminFilterMode,
    adminCustomFrom,
    adminCustomTo,
    exportType,
    exportRangeMode,
    exportStartDate,
    exportEndDate,
    setIsExportModalOpen,
    showToast
  } = useUI();

  // 1. استيراد وتحديث بيانات الموظفين الذكي من ملف إكسل (Smart Two-Way Upsert)
  const handleExcelImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('جاري قراءة ومعالجة ملف الإكسل...');
      const ExcelJS = await loadExcelJS(showToast);
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      
      const ws = wb.worksheets.find(s => s.name === 'سجل الموظفين') || wb.worksheets[0];
      if (!ws) {
        showToast('ملف الإكسل فارغ أو غير صالح');
        if (e.target) e.target.value = '';
        return;
      }

      // 1. التعرف الديناميكي على صف العناوين وخريطة الأعمدة
      let headerRowIndex = 0;
      const colMap = {};
      for (let r = 1; r <= 10; r++) {
        const row = ws.getRow(r);
        let foundCode = false;
        let foundName = false;
        row.eachCell((cell, colNum) => {
          const val = String(cell.value || '').trim();
          if (/كود|code/i.test(val)) foundCode = true;
          if (/اسم|الاسم|name/i.test(val)) foundName = true;
        });

        if (foundCode && foundName) {
          headerRowIndex = r;
          row.eachCell((cell, colNum) => {
            const val = String(cell.value || '').trim();
            if (/كود.*موظف|كود|code/i.test(val) && !colMap.code) colMap.code = colNum;
            else if (/اسم.*موظف|الاسم|name/i.test(val) && !colMap.name) colMap.name = colNum;
            else if (/شهرة|لقب|nickname/i.test(val) && !colMap.nickname) colMap.nickname = colNum;
            else if (/قومي|هوية|بطاقة|national/i.test(val) && !colMap.nationalId) colMap.nationalId = colNum;
            else if (/هاتف.*أساسي|هاتف|موبايل|phone|mobile/i.test(val) && !colMap.phone) colMap.phone = colNum;
            else if (/طوارئ|إضافي|ثاني|قريب|emergency/i.test(val) && !colMap.relativePhone) colMap.relativePhone = colNum;
            else if (/بريد|إيميل|email/i.test(val) && !colMap.email) colMap.email = colNum;
            else if (/مسمى|وظيفة|job/i.test(val) && !colMap.jobTitle) colMap.jobTitle = colNum;
            else if (/قسم|إدارة|dept|department/i.test(val) && !colMap.department) colMap.department = colNum;
            else if (/فرع.*أساسي|الفرع|branch/i.test(val) && !colMap.branchName) colMap.branchName = colNum;
            else if (/كود.*فرع/i.test(val) && !colMap.branchCode) colMap.branchCode = colNum;
            else if (/فروع.*إضافية/i.test(val) && !colMap.extraBranches) colMap.extraBranches = colNum;
            else if (/راتب|مرتب|salary/i.test(val) && !colMap.salary) colMap.salary = colNum;
            else if (/ساعات.*عمل|ساعات|hours/i.test(val) && !colMap.workHours) colMap.workHours = colNum;
            else if (/أيام.*عمل|أيام|days/i.test(val) && !colMap.workDays) colMap.workDays = colNum;
            else if (/بدل.*إدارة/i.test(val) && !colMap.managementAllowance) colMap.managementAllowance = colNum;
            else if (/بدل.*انتقال/i.test(val) && !colMap.transportAllowance) colMap.transportAllowance = colNum;
            else if (/بدل.*إضافي/i.test(val) && !colMap.extraAllowance) colMap.extraAllowance = colNum;
            else if (/مسمى.*بدل/i.test(val) && !colMap.extraAllowanceTitle) colMap.extraAllowanceTitle = colNum;
            else if (/تعيين|hire/i.test(val) && !colMap.hireDate) colMap.hireDate = colNum;
            else if (/عقد|contract/i.test(val) && !colMap.contractType) colMap.contractType = colNum;
            else if (/إجازات|leave/i.test(val) && !colMap.annualLeaveBalance) colMap.annualLeaveBalance = colNum;
            else if (/حالة.*وظيفية|حالة|status/i.test(val) && !colMap.status) colMap.status = colNum;
            else if (/ميلاد|dob|birth/i.test(val) && !colMap.dob) colMap.dob = colNum;
            else if (/اجتماعية|marital/i.test(val) && !colMap.maritalStatus) colMap.maritalStatus = colNum;
            else if (/عنوان|address/i.test(val) && !colMap.address) colMap.address = colNum;
            else if (/مرور|password/i.test(val) && !colMap.password) colMap.password = colNum;
          });
          break;
        }
      }

      // خريطة افتراضية في حال عدم التعرف على الترويسة
      if (headerRowIndex === 0) {
        headerRowIndex = 3;
        colMap.code = 1;
        colMap.name = 2;
        colMap.phone = 3;
        colMap.jobTitle = 4;
        colMap.salary = 5;
        colMap.workHours = 6;
        colMap.workDays = 7;
        colMap.password = 8;
      }

      const branches = state.branches || [];
      const currentEmps = [...(state.employees || [])];
      let updatedCount = 0;
      let addedCount = 0;

      const getCellVal = (row, col) => {
        if (!col) return '';
        const raw = row.getCell(col).value;
        if (raw && typeof raw === 'object') {
          if (raw.result !== undefined) return String(raw.result).trim();
          if (raw.text !== undefined) return String(raw.text).trim();
        }
        return raw !== null && raw !== undefined ? String(raw).trim() : '';
      };

      ws.eachRow((row, rowNum) => {
        if (rowNum <= headerRowIndex) return;

        const code = getCellVal(row, colMap.code);
        const name = getCellVal(row, colMap.name);
        if (!code || !name) return; // تخطي الصفوف الفارغة

        const cleanCode = code.toLowerCase();
        const branchNameRaw = getCellVal(row, colMap.branchName);
        const branchCodeRaw = getCellVal(row, colMap.branchCode);

        // مطابقة الفرع بالاسم أو الكود
        let matchedBranch = null;
        if (branchNameRaw) {
          matchedBranch = branches.find(b => b.name?.trim().toLowerCase() === branchNameRaw.toLowerCase() || String(b.id) === branchNameRaw || String(b.branchCode).toLowerCase() === branchNameRaw.toLowerCase());
        }
        if (!matchedBranch && branchCodeRaw) {
          matchedBranch = branches.find(b => String(b.branchCode).toLowerCase() === branchCodeRaw.toLowerCase() || String(b.id) === branchCodeRaw || b.name?.trim().toLowerCase() === branchCodeRaw.toLowerCase());
        }

        const resolvedBranchId = matchedBranch ? matchedBranch.id : (branches[0] ? branches[0].id : '');
        const resolvedBranchName = matchedBranch ? matchedBranch.name : (branches[0] ? branches[0].name : '');

        const salary = parseFloat(getCellVal(row, colMap.salary)) || 0;
        const workHoursPerDay = parseFloat(getCellVal(row, colMap.workHours)) || 8;
        const workDaysPerMonth = parseFloat(getCellVal(row, colMap.workDays)) || 26;
        const managementAllowance = parseFloat(getCellVal(row, colMap.managementAllowance)) || 0;
        const transportAllowance = parseFloat(getCellVal(row, colMap.transportAllowance)) || 0;
        const extraAllowance = parseFloat(getCellVal(row, colMap.extraAllowance)) || 0;
        const extraAllowanceTitle = getCellVal(row, colMap.extraAllowanceTitle);

        const nationalId = getCellVal(row, colMap.nationalId);
        const phone = getCellVal(row, colMap.phone);
        const relativePhone = getCellVal(row, colMap.relativePhone);
        const nickname = getCellVal(row, colMap.nickname);
        const email = getCellVal(row, colMap.email);
        const jobTitle = getCellVal(row, colMap.jobTitle) || 'موظف';
        const department = getCellVal(row, colMap.department) || 'الصيدلية';
        const hireDate = getCellVal(row, colMap.hireDate);
        const contractType = getCellVal(row, colMap.contractType) || 'دوام كامل';
        const annualLeaveBalance = parseFloat(getCellVal(row, colMap.annualLeaveBalance)) || 21;
        const status = getCellVal(row, colMap.status) || 'على رأس العمل';
        const dob = getCellVal(row, colMap.dob);
        const maritalStatus = getCellVal(row, colMap.maritalStatus) || 'أعزب';
        const address = getCellVal(row, colMap.address);
        const password = getCellVal(row, colMap.password) || '123';

        // البحث عن الموظف إن كان مسجلاً بالكود أو الرقم القومي
        const existingIdx = currentEmps.findIndex(e => 
          (e.code && String(e.code).trim().toLowerCase() === cleanCode) ||
          (e.username && String(e.username).trim().toLowerCase() === cleanCode) ||
          (nationalId && nationalId.length >= 10 && e.nationalId && String(e.nationalId).trim() === nationalId)
        );

        if (existingIdx !== -1) {
          // تحديث موظف حالي (UPDATE)
          const existing = currentEmps[existingIdx];
          const updatedEmp = {
            ...existing,
            code,
            username: code,
            name,
            nickname: nickname !== '' ? nickname : (existing.nickname || ''),
            nationalId: nationalId !== '' ? nationalId : (existing.nationalId || ''),
            phone: phone !== '' ? phone : (existing.phone || ''),
            relativePhone: relativePhone !== '' ? relativePhone : (existing.relativePhone || existing.emergencyPhone || ''),
            emergencyPhone: relativePhone !== '' ? relativePhone : (existing.emergencyPhone || existing.relativePhone || ''),
            email: email !== '' ? email : (existing.email || ''),
            jobTitle: jobTitle !== '' ? jobTitle : (existing.jobTitle || 'موظف'),
            department: department !== '' ? department : (existing.department || 'الصيدلية'),
            branchId: resolvedBranchId || existing.branchId,
            branchName: resolvedBranchName || existing.branchName,
            salary,
            workHoursPerDay,
            workDaysPerMonth,
            managementAllowance,
            transportAllowance,
            extraAllowance,
            extraAllowanceTitle: extraAllowanceTitle !== '' ? extraAllowanceTitle : (existing.extraAllowanceTitle || ''),
            hireDate: hireDate !== '' ? hireDate : (existing.hireDate || ''),
            contractType: contractType !== '' ? contractType : (existing.contractType || 'دوام كامل'),
            annualLeaveBalance,
            status: status !== '' ? status : (existing.status || 'على رأس العمل'),
            dob: dob !== '' ? dob : (existing.dob || ''),
            maritalStatus: maritalStatus !== '' ? maritalStatus : (existing.maritalStatus || 'أعزب'),
            address: address !== '' ? address : (existing.address || ''),
            password: password !== '' ? password : (existing.password || '123'),
            updatedAt: new Date().toISOString()
          };

          // تحديث فروع الموظف
          if (Array.isArray(existing.branchesDetails) && existing.branchesDetails.length > 0) {
            updatedEmp.branchesDetails = existing.branchesDetails.map((bd, i) => {
              if (i === 0 || String(bd.branchId) === String(resolvedBranchId)) {
                return { ...bd, branchId: resolvedBranchId, salary, workHours: workHoursPerDay, workDays: workDaysPerMonth };
              }
              return bd;
            });
          } else {
            updatedEmp.branchesDetails = [{
              id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
              branchId: resolvedBranchId,
              salary,
              workHours: workHoursPerDay,
              workDays: workDaysPerMonth,
              breakHours: 0
            }];
          }

          currentEmps[existingIdx] = updatedEmp;
          updatedCount++;
        } else {
          // إضافة موظف جديد (INSERT)
          const newEmp = {
            id: 'emp_' + uid(),
            code,
            username: code,
            name,
            nickname,
            nationalId,
            phone,
            phones: phone ? [{ id: '1', number: phone, type: 'mobile' }] : [],
            relativePhone,
            emergencyPhone: relativePhone,
            email,
            jobTitle,
            department,
            branchId: resolvedBranchId,
            branchName: resolvedBranchName,
            branchesDetails: [{
              id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
              branchId: resolvedBranchId,
              salary,
              workHours: workHoursPerDay,
              workDays: workDaysPerMonth,
              breakHours: 0
            }],
            salary,
            workHoursPerDay,
            workDaysPerMonth,
            managementAllowance,
            transportAllowance,
            extraAllowance,
            extraAllowanceTitle,
            hireDate: hireDate || getRealTodayStr(),
            contractType,
            annualLeaveBalance,
            status,
            dob,
            maritalStatus,
            address,
            password,
            photoUrl: '',
            createdAt: getRealTodayStr()
          };

          currentEmps.push(newEmp);
          addedCount++;
        }
      });

      if (updatedCount === 0 && addedCount === 0) {
        showToast('لم يتم العثور على بيانات موظفين صالحة في الملف');
        if (e.target) e.target.value = '';
        return;
      }

      const updatedState = { ...state, employees: currentEmps };
      setState(updatedState);
      await saveState(updatedState);

      const successParts = [];
      if (updatedCount > 0) successParts.push(`تحديث (${updatedCount}) موظف`);
      if (addedCount > 0) successParts.push(`إضافة (${addedCount}) موظف جديد`);
      showToast(`✅ تم بنجاح من ملف الإكسل: ${successParts.join(' و ')}`);

    } catch (err) {
      console.error('Import excel error:', err);
      showToast('حدث خطأ أثناء قراءة ملف الإكسل');
    } finally {
      if (e?.target) e.target.value = '';
    }
  }, [state, setState, saveState, showToast]);

  // 2. تصدير شيت إكسل احترافي لقاعدة بيانات الموظفين (مع قوائم منسدلة وملء تلقائي لكود الفرع)
  const exportEmployeesDirectoryExcel = useCallback(async () => {
    try {
      showToast('جاري إنشاء وتنسيق شيت إكسل الموظفين المنسدل...');
      const ExcelJS = await loadExcelJS(showToast);
      const wb = new ExcelJS.Workbook();
      wb.creator = state.orgSettings?.name || 'Pharmacy HR System';

      const currentEmps = state.employees || [];
      const branches = state.branches || [];
      const jobs = getJobsList(state);
      const departments = getDepartmentsList(state);

      // Sheet 1: ورقة البيانات المرجعية للقوائم المنسدلة والـ VLOOKUP
      const wsLists = wb.addWorksheet('قوائم_النظام', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      wsLists.getCell('A1').value = 'اسم الفرع';
      wsLists.getCell('B1').value = 'كود الفرع';
      branches.forEach((b, idx) => {
        wsLists.getCell(`A${idx + 2}`).value = b.name;
        wsLists.getCell(`B${idx + 2}`).value = b.branchCode || b.id;
      });

      wsLists.getCell('D1').value = 'المسميات الوظيفية';
      jobs.forEach((j, idx) => {
        wsLists.getCell(`D${idx + 2}`).value = j.title || j.name;
      });

      wsLists.getCell('F1').value = 'الأقسام';
      departments.forEach((d, idx) => {
        wsLists.getCell(`F${idx + 2}`).value = typeof d === 'string' ? d : (d.name || d.title);
      });

      wsLists.getCell('H1').value = 'أنواع العقود';
      ['دوام كامل', 'دوام جزئي', 'تدريب', 'مؤقت'].forEach((c, idx) => {
        wsLists.getCell(`H${idx + 2}`).value = c;
      });

      wsLists.getCell('J1').value = 'الحالة الوظيفية';
      ['على رأس العمل', 'تم الاستقالة', 'معلق'].forEach((s, idx) => {
        wsLists.getCell(`J${idx + 2}`).value = s;
      });

      wsLists.getCell('L1').value = 'الحالة الاجتماعية';
      ['أعزب', 'متزوج', 'متزوج ويعول', 'مطلق', 'أرمل'].forEach((m, idx) => {
        wsLists.getCell(`L${idx + 2}`).value = m;
      });

      // تنسيق رؤوس ورقة القوائم
      ['A1', 'B1', 'D1', 'F1', 'H1', 'J1', 'L1'].forEach(cellRef => {
        const c = wsLists.getCell(cellRef);
        c.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      wsLists.columns.forEach(col => { col.width = 24; });

      // Sheet 2: ورقة سجل الموظفين الرئيسية
      const ws = wb.addWorksheet('سجل الموظفين', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      const activeCount = currentEmps.filter(e => isEmployeeActive(e)).length;
      const resignedCount = currentEmps.length - activeCount;

      // صف 1: العنوان الرئيسي
      ws.mergeCells('A1:AB1');
      const titleCell = ws.getCell('A1');
      titleCell.value = `📋 سجل وقاعدة بيانات موظفي الصيدليات — ${state.orgSettings?.name || 'إدارة الموارد البشرية'}`;
      titleCell.font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3532' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 32;

      // صف 2: التوجيهات والإحصائيات
      ws.mergeCells('A2:AB2');
      const subCell = ws.getCell('A2');
      subCell.value = `💡 إجمالي الكادر: ${currentEmps.length} موظف | على رأس العمل: ${activeCount} | تم الاستقالة/معلق: ${resignedCount} | تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG')} — اختر الفرع والمسمى والقسم من القوائم المنسدلة (سيتم ملء كود الفرع تلقائياً).`;
      subCell.font = { name: 'Arial', size: 10, color: { argb: 'FFFFFFFF' } };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
      subCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 24;

      // صف 3: عناوين الأعمدة الـ 28
      const headers = [
        'كود الموظف',                  // Col A (1)
        'اسم الموظف الكامل',           // Col B (2)
        'اسم الشهرة / اللقب',         // Col C (3)
        'الرقم القومي (14 رقم)',      // Col D (4)
        'رقم الهاتف الأساسي',          // Col E (5)
        'هاتف إضافي / طوارئ',         // Col F (6)
        'البريد الإلكتروني',          // Col G (7)
        'المسمى الوظيفي',             // Col H (8) [قائمة منسدلة]
        'القسم / الإدارة',             // Col I (9) [قائمة منسدلة]
        'الفرع الأساسي',              // Col J (10) [قائمة منسدلة]
        'كود الفرع',                  // Col K (11) [معادلة ملء تلقائي]
        'الفروع الإضافية',            // Col L (12)
        'الراتب الأساسي',             // Col M (13)
        'ساعات العمل اليومية',         // Col N (14)
        'أيام العمل الشهرية',          // Col O (15)
        'بدل إدارة (+)',              // Col P (16)
        'بدل انتقال (+)',             // Col Q (17)
        'بدل إضافي (+)',              // Col R (18)
        'مسمى البدل الإضافي',         // Col S (19)
        'إجمالي الباقة الشهرية',      // Col T (20) [معادلة المجموع]
        'تاريخ التعيين',              // Col U (21)
        'نوع العقد',                  // Col V (22) [قائمة منسدلة]
        'رصيد الإجازات السنوية',      // Col W (23)
        'الحالة الوظيفية',            // Col X (24) [قائمة منسدلة]
        'تاريخ الميلاد',              // Col Y (25)
        'الحالة الاجتماعية',          // Col Z (26) [قائمة منسدلة]
        'العنوان السكني بالتفصيل',    // Col AA (27)
        'كلمة المرور'                 // Col AB (28)
      ];

      const headerRow = ws.getRow(3);
      headerRow.height = 28;
      headers.forEach((h, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF134E4A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });

      const numBranches = Math.max(branches.length, 1);
      const numJobs = Math.max(jobs.length, 1);
      const numDepts = Math.max(departments.length, 1);

      let rowIdx = 4;
      currentEmps.forEach((emp) => {
        const r = ws.getRow(rowIdx);
        r.height = 22;

        const branchObj = branches.find(b => String(b.id) === String(emp.branchId) || b.name === emp.branchName);
        const resolvedBranchName = branchObj ? branchObj.name : (emp.branchName || '');
        const resolvedBranchCode = branchObj ? (branchObj.branchCode || branchObj.id) : (emp.branchCode || '');

        let extraBranchesStr = '';
        if (Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 1) {
          extraBranchesStr = emp.branchesDetails
            .filter(bd => String(bd.branchId) !== String(emp.branchId))
            .map(bd => {
              const b = branches.find(br => String(br.id) === String(bd.branchId));
              return `${b ? b.name : bd.branchId} (${bd.salary || 0} ج.م - ${bd.workHours || 8}س)`;
            })
            .join(' | ');
        }

        r.getCell(1).value = String(emp.code || '');
        r.getCell(2).value = emp.name || '';
        r.getCell(3).value = emp.nickname || '';
        r.getCell(4).value = String(emp.nationalId || '');
        r.getCell(5).value = String(emp.phone || '');
        r.getCell(6).value = String(emp.relativePhone || emp.emergencyPhone || '');
        r.getCell(7).value = emp.email || '';
        r.getCell(8).value = emp.jobTitle || '';
        r.getCell(9).value = emp.department || '';
        r.getCell(10).value = resolvedBranchName;

        // معادلة الملء التلقائي لكود الفرع مع القيمة المحسوبة
        r.getCell(11).value = {
          formula: `IFERROR(VLOOKUP(J${rowIdx}, قوائم_النظام!$A$2:$B$${numBranches + 1}, 2, FALSE), "")`,
          result: resolvedBranchCode
        };

        r.getCell(12).value = extraBranchesStr;
        r.getCell(13).value = Number(emp.salary) || 0;
        r.getCell(14).value = Number(emp.workHoursPerDay) || 8;
        r.getCell(15).value = Number(emp.workDaysPerMonth) || 26;
        r.getCell(16).value = Number(emp.managementAllowance) || 0;
        r.getCell(17).value = Number(emp.transportAllowance) || 0;
        r.getCell(18).value = Number(emp.extraAllowance) || 0;
        r.getCell(19).value = emp.extraAllowanceTitle || '';

        const totalPkg = (Number(emp.salary) || 0) + (Number(emp.managementAllowance) || 0) + (Number(emp.transportAllowance) || 0) + (Number(emp.extraAllowance) || 0);
        r.getCell(20).value = {
          formula: `M${rowIdx}+P${rowIdx}+Q${rowIdx}+R${rowIdx}`,
          result: totalPkg
        };

        r.getCell(21).value = emp.hireDate || '';
        r.getCell(22).value = emp.contractType || 'دوام كامل';
        r.getCell(23).value = Number(emp.annualLeaveBalance) || 21;
        r.getCell(24).value = emp.status || 'على رأس العمل';
        r.getCell(25).value = emp.dob || '';
        r.getCell(26).value = emp.maritalStatus || 'أعزب';
        r.getCell(27).value = emp.address || '';
        r.getCell(28).value = String(emp.password || '123');

        // تنسيقات الخلايا
        r.getCell(1).numFmt = '@';
        r.getCell(4).numFmt = '@';
        r.getCell(5).numFmt = '@';
        r.getCell(6).numFmt = '@';
        r.getCell(11).numFmt = '@';
        r.getCell(13).numFmt = '#,##0.00';
        r.getCell(16).numFmt = '#,##0.00';
        r.getCell(17).numFmt = '#,##0.00';
        r.getCell(18).numFmt = '#,##0.00';
        r.getCell(20).numFmt = '#,##0.00';

        // القوائم المنسدلة (Data Validation Dropdowns)
        r.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$D$2:$D$${numJobs + 1}`] };
        r.getCell(9).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$F$2:$F$${numDepts + 1}`] };
        r.getCell(10).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$A$2:$A$${numBranches + 1}`] };
        r.getCell(22).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$H$2:$H$5'] };
        r.getCell(24).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$J$2:$J$4'] };
        r.getCell(26).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$L$2:$L$6'] };

        const isEven = rowIdx % 2 === 0;
        for (let c = 1; c <= 28; c++) {
          const cell = r.getCell(c);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          if (!isEven) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
          if (c === 2) {
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        }

        rowIdx++;
      });

      // إضافة 50 صفاً فارغاً مجهزاً بالقوائم المنسدلة والمعادلات لإدخال موظفين جدد بسهولة
      for (let bIdx = 0; bIdx < 50; bIdx++) {
        const r = ws.getRow(rowIdx);
        r.height = 22;

        r.getCell(11).value = {
          formula: `IFERROR(VLOOKUP(J${rowIdx}, قوائم_النظام!$A$2:$B$${numBranches + 1}, 2, FALSE), "")`
        };
        r.getCell(14).value = 8;
        r.getCell(15).value = 26;
        r.getCell(20).value = {
          formula: `M${rowIdx}+P${rowIdx}+Q${rowIdx}+R${rowIdx}`
        };
        r.getCell(22).value = 'دوام كامل';
        r.getCell(23).value = 21;
        r.getCell(24).value = 'على رأس العمل';
        r.getCell(26).value = 'أعزب';
        r.getCell(28).value = '123';

        r.getCell(1).numFmt = '@';
        r.getCell(4).numFmt = '@';
        r.getCell(5).numFmt = '@';
        r.getCell(6).numFmt = '@';
        r.getCell(11).numFmt = '@';
        r.getCell(13).numFmt = '#,##0.00';
        r.getCell(16).numFmt = '#,##0.00';
        r.getCell(17).numFmt = '#,##0.00';
        r.getCell(18).numFmt = '#,##0.00';
        r.getCell(20).numFmt = '#,##0.00';

        r.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$D$2:$D$${numJobs + 1}`] };
        r.getCell(9).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$F$2:$F$${numDepts + 1}`] };
        r.getCell(10).dataValidation = { type: 'list', allowBlank: true, formulae: [`قوائم_النظام!$A$2:$A$${numBranches + 1}`] };
        r.getCell(22).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$H$2:$H$5'] };
        r.getCell(24).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$J$2:$J$4'] };
        r.getCell(26).dataValidation = { type: 'list', allowBlank: true, formulae: ['قوائم_النظام!$L$2:$L$6'] };

        for (let c = 1; c <= 28; c++) {
          const cell = r.getCell(c);
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        rowIdx++;
      }

      // ضبط عرض الأعمدة
      const colWidths = [12, 24, 16, 18, 16, 16, 22, 18, 18, 24, 14, 20, 14, 12, 12, 14, 14, 14, 18, 16, 14, 14, 12, 14, 14, 14, 26, 14];
      colWidths.forEach((w, i) => {
        ws.getColumn(i + 1).width = w;
      });

      // تجميد الألواح عند صف العناوين وتفعيل التصفية التلقائية
      ws.views = [{ state: 'frozen', ySplit: 3, rightToLeft: true, showGridLines: true }];
      ws.autoFilter = 'A3:AB3';

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `سجل_موظفي_الصيدليات_${getRealTodayStr()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('✅ تم تصدير سجل الموظفين بنجاح');
    } catch (err) {
      console.error('Export employees directory error:', err);
      showToast('حدث خطأ أثناء تصدير شيت الموظفين');
    }
  }, [state, showToast]);

  // 2. تصدير شيت إكسل مفردات مرتب موظف فردي
  const exportEmpExcel = useCallback(async (empId, rangeMode = exportRangeMode, customStart = exportStartDate, customEnd = exportEndDate) => {
    try {
      const emp = getEmp(empId);
      if (!emp) {
        showToast('يرجى اختيار الموظف أولاً');
        return;
      }
      const ExcelJS = await loadExcelJS(showToast);

      let filterFn;
      let periodLabel;
      let fileNameStr;

      if (rangeMode === 'custom') {
        if (!customStart || !customEnd) {
          showToast('يرجى تحديد تاريخ البداية وتاريخ النهاية');
          return;
        }
        filterFn = (d) => d >= customStart && d <= customEnd;
        periodLabel = `من ${customStart} إلى ${customEnd}`;
        fileNameStr = `شيت-مرتب-${emp.name}-من-${customStart}-إلى-${customEnd}.xlsx`;
      } else {
        filterFn = (d) => d.startsWith(monthPicker);
        periodLabel = arabicMonthLabel(monthPicker);
        fileNameStr = `شيت-مرتب-${emp.name}-${monthPicker}.xlsx`;
      }

      const summary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null);
      const COLS = 9;

      const wb = new ExcelJS.Workbook();
      wb.creator = state.orgSettings?.orgName || 'نظام البصمات والموارد البشرية';
      wb.created = new Date();

      const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;

      if (isMultiBranch) {
        // Multi-Branch Employee
        emp.branchesDetails.forEach((bd, bdIdx) => {
          const bId = bd.branchId;
          const bObj = (state.branches || []).find((b) => b.id === bId);
          const bName = bObj ? bObj.name : `فرع ${bdIdx + 1}`;
          const cleanSheetName = `فرع ${bName}`.replace(/[\*\?\/\\\[\]]/g, '').slice(0, 30);

          const bSummary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null, bId);
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
          mergedTitle(ws, r, `كشف مفردات مرتب الموظف — ${emp.name} (📍 فرع: ${bName})`, COLS, 'FF0B3532', 16, 32);
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

          const bShifts = (state.shifts || [])
            .filter((s) => s.employeeId === empId && filterFn(s.date) && (s.branchId === bId || (!s.branchId && bdIdx === 0)))
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

        // Summary Sheet for All Branches
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
          const bSummary = computeEmpSummary(empId, filterFn, rangeMode === 'month' ? monthPicker : null, bId);

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
        // Single-Branch Employee Sheet
        const ws = wb.addWorksheet(`مرتب ${emp.name}`, { views: [{ rightToLeft: true, showGridLines: false }] });
        ws.columns = [{ width: 13 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 30 }];

        let r = 1;
        mergedTitle(ws, r, `كشف مفردات مرتب الموظف — ${emp.name} (${state.orgSettings?.orgName || ''})`, COLS, 'FF0B3532', 16, 32);
        r += 2;

        ws.mergeCells(r, 1, r, COLS);
        const infoCell = ws.getCell(r, 1);
        infoCell.value = `اسم الموظف: ${emp.name}   |   كود الموظف: ${emp.code}   |   الوظيفة: ${emp.jobTitle}   |   الفترة: ${periodLabel}   |   الراتب الأساسي: ${fmt(emp.salary)} ج.م   |   أجر الساعة: ${fmt(summary.rate)} ج.م`;
        infoCell.font = { name: 'Arial', bold: true, size: 10.5, color: { argb: 'FF1D2624' } };
        infoCell.alignment = { horizontal: 'center' };
        infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
        r += 2;

        tableHeaderRow(ws, r, ['التاريخ', 'اليوم', 'وقت الدخول', 'وقت الخروج', 'البريك (ساعة)', 'ساعات العمل', 'سعر الساعة', 'المبلغ المستحق', 'الملاحظات']);
        r++;

        const empShifts = (state.shifts || [])
          .filter((s) => s.employeeId === empId && filterFn(s.date))
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
            const amt = effHours * summary.rate;
            dataRow(ws, r, [s.date, arabicWeekday(s.date), s.timeIn, s.timeOut || '—', fmt(s.breakHours || 0), fmt(effHours), fmt(summary.rate), fmt(amt), s.note || '—'], 1, [4, 5, 6, 7]);
            r++;
          });
        }

        r += 2;
        mergedTitle(ws, r, 'الملخص المالي وصافي المرتب المستحق النهائي', COLS, 'FF134E4A', 13, 26);
        r++;
        tableHeaderRow(ws, r, ['سعر الساعة الشهري', 'إجمالي الساعات', 'المستحقات الأساسية', 'إجمالي البدلات (+)', 'المكافآت (+)', 'خصومات التأخير (-)', 'خصومات الغياب (-)', 'الخصومات والسلف (-)', 'صافي المرتب النهائي'], 1);
        ws.mergeCells(r, 9, r, COLS);
        r++;

        dataRow(ws, r, [
          fmt(emp.salary),
          fmt(summary.hours),
          fmt(summary.baseEarnings),
          fmt(summary.totalAllowances || 0),
          fmt(summary.totalBonus),
          fmt(summary.lateDeduction || 0),
          fmt(summary.absenceDeduction || 0),
          fmt((summary.manualDeduction || 0) + (summary.loanDeduction || 0)),
          fmt(summary.netSalary)
        ], 1, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
        ws.mergeCells(r, 9, r, COLS);
        const netCell = ws.getCell(r, 9);
        netCell.value = fmt(summary.netSalary) + ' ج.م';
        netCell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF134E4A' } };
        netCell.alignment = { horizontal: 'center', vertical: 'middle' };
        netCell.border = { top: { style: 'thin', color: { argb: 'FFCFC9B8' } }, left: { style: 'thin', color: { argb: 'FFCFC9B8' } }, bottom: { style: 'thin', color: { argb: 'FFCFC9B8' } }, right: { style: 'thin', color: { argb: 'FFCFC9B8' } } };
        netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE4EEEC' } };
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileNameStr;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`تم تصدير كشف مرتب الموظف ${emp.name} بنجاح`);
      setIsExportModalOpen(false);
    } catch (e) {
      console.error('Export emp excel failed:', e);
      showToast('حدث خطأ أثناء تصدير ملف الموظف');
    }
  }, [state, getEmp, computeEmpSummary, monthPicker, exportRangeMode, exportStartDate, exportEndDate, setIsExportModalOpen, showToast]);

  // 3. تصدير مسير الرواتب الشامل للشركة بالكامل
  const exportAllPayrollExcel = useCallback(async (mode = exportType, customStart = exportStartDate, customEnd = exportEndDate) => {
    try {
      let filterFn;
      const isCustomMode = (mode === 'all_range' || mode === 'custom' || adminFilterMode === 'custom');
      const effectiveMode = isCustomMode ? 'all_range' : 'month';
      const effectiveStart = customStart || (adminFilterMode === 'custom' ? adminCustomFrom : exportStartDate);
      const effectiveEnd = customEnd || (adminFilterMode === 'custom' ? adminCustomTo : exportEndDate);

      if (effectiveMode === 'all_range') {
        if (!effectiveStart || !effectiveEnd) {
          showToast('يرجى تحديد تاريخ البداية والنهاية');
          return;
        }
        filterFn = (d) => d >= effectiveStart && d <= effectiveEnd;
      } else {
        filterFn = (d) => d.startsWith(monthPicker);
      }

      await exportComprehensiveCompanyPayrollExcel({
        state,
        filterFn,
        mode: effectiveMode,
        monthPicker,
        customStart: effectiveStart,
        customEnd: effectiveEnd,
        computeEmpSummary,
        computeGrandPayroll,
        showToast
      });

      setIsExportModalOpen(false);
    } catch (e) {
      console.error('Export all payroll excel error:', e);
      showToast('حدث خطأ أثناء تصدير تقرير الشركة الشامل');
    }
  }, [state, exportType, adminFilterMode, adminCustomFrom, adminCustomTo, exportStartDate, exportEndDate, monthPicker, computeEmpSummary, computeGrandPayroll, setIsExportModalOpen, showToast]);

  return {
    handleExcelImport,
    exportEmpExcel,
    exportAllPayrollExcel,
    exportEmployeesDirectoryExcel
  };
}
