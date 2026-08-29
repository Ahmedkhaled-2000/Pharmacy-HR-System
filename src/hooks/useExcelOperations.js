import { useCallback } from 'react';
import { uid, fmt, arabicWeekday, arabicMonthLabel } from '../utils/formatters';
import { getRealTodayStr } from '../utils/timeEngine';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../utils/excelExport';
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

  // 1. استيراد بيانات الموظفين من ملف إكسل
  const handleExcelImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('جاري قراءة ومعالجة ملف الإكسل...');
      const ExcelJS = await loadExcelJS(showToast);
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) {
        showToast('ملف الإكسل فارغ أو غير صالح');
        return;
      }

      const imported = [];
      const skippedDuplicates = [];
      const currentEmps = state.employees || [];
      const currentBranches = state.branches || [];

      ws.eachRow((row, rowNum) => {
        if (rowNum <= 3) return; // skip headers
        const code = String(row.getCell(1).value || '').trim();
        const name = String(row.getCell(2).value || '').trim();
        const phone = String(row.getCell(3).value || '').trim();
        const jobTitle = String(row.getCell(4).value || '').trim();
        const salary = parseFloat(row.getCell(5).value) || 0;
        const workHoursPerDay = parseFloat(row.getCell(6).value) || 8;
        const workDaysPerMonth = parseFloat(row.getCell(7).value) || 26;
        const password = String(row.getCell(8).value || '123').trim();

        if (code && name) {
          const cleanCode = code.toLowerCase();
          const isTakenByEmp = currentEmps.some(e => 
            (e.code && String(e.code).trim().toLowerCase() === cleanCode) || 
            (e.username && String(e.username).trim().toLowerCase() === cleanCode)
          ) || imported.some(i => i.code.toLowerCase() === cleanCode);
          
          const isTakenByBranch = currentBranches.some(b => 
            b.username && String(b.username).trim().toLowerCase() === cleanCode
          );

          if (isTakenByEmp || isTakenByBranch) {
            skippedDuplicates.push({ code, name, reason: isTakenByBranch ? 'مطابق لاسم مستخدم فرع' : 'كود موظف مكرر' });
            return;
          }

          imported.push({
            id: 'emp_' + uid(),
            code,
            username: code,
            name,
            phone,
            jobTitle: jobTitle || 'موظف',
            salary,
            workHoursPerDay,
            workDaysPerMonth,
            password,
            photoUrl: '',
            createdAt: getRealTodayStr()
          });
        }
      });

      if (imported.length === 0) {
        if (skippedDuplicates.length > 0) {
          showToast(`⚠️ تم تخطي جميع السجلات (${skippedDuplicates.length}) لتطابق أكوادها مع موظفين أو فروع مسجلة مسبقاً`);
        } else {
          showToast('لم يتم العثور على بيانات موظفين صحيحة في الملف');
        }
        return;
      }

      const updatedEmps = [...state.employees, ...imported];
      const updatedState = { ...state, employees: updatedEmps };
      setState(updatedState);
      await saveState(updatedState);
      let successMsg = `تم استيراد ${imported.length} موظف جديد بنجاح من إكسل`;
      if (skippedDuplicates.length > 0) {
        successMsg += ` (تم تخطي ${skippedDuplicates.length} مكرر)`;
      }
      showToast(successMsg);
    } catch (err) {
      console.error('Import excel error:', err);
      showToast('حدث خطأ أثناء قراءة ملف الإكسل');
    }
  }, [state, setState, saveState, showToast]);

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
    exportAllPayrollExcel
  };
}
