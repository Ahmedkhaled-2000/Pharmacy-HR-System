import React from 'react';
import { arabicMonthLabel, isEmployeeActive } from '../../utils/formatters';

export default function ExportPayrollModal({
  isExportModalOpen,
  setIsExportModalOpen,
  exportType,
  setExportType,
  exportEmpId,
  setExportEmpId,
  exportRangeMode,
  setExportRangeMode,
  exportStartDate,
  setExportStartDate,
  exportEndDate,
  setExportEndDate,
  state,
  monthPicker,
  exportEmpExcel,
  exportAllPayrollExcel
}) {
  if (!isExportModalOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3>تصدير تقرير الإكسل المخصص</h3>
        <div className="field" style={{ marginBottom: '14px' }}>
          <label>نوع التقرير</label>
          <select value={exportType} onChange={(e) => setExportType(e.target.value)}>
            <option value="all_month">رواتب جميع الموظفين (الشهر المحدد)</option>
            <option value="all_range">رواتب جميع الموظفين (فترة مخصصة)</option>
            <option value="single_emp">كشف مفردات مرتب موظف واحد</option>
          </select>
        </div>

        {exportType === 'single_emp' && (
          <>
            <div className="field" style={{ marginBottom: '14px' }}>
              <label>اختر الموظف</label>
              <select value={exportEmpId} onChange={(e) => setExportEmpId(e.target.value)}>
                {(state.employees || []).filter(isEmployeeActive).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.jobTitle})
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ marginBottom: '14px' }}>
              <label>فترة الشيت للموظف</label>
              <select value={exportRangeMode} onChange={(e) => setExportRangeMode(e.target.value)}>
                <option value="month">الشهر المحدد ({arabicMonthLabel(monthPicker)})</option>
                <option value="custom">فترة مخصصة (تاريخ بداية ونهاية)</option>
              </select>
            </div>
          </>
        )}

        {(exportType === 'all_range' || (exportType === 'single_emp' && exportRangeMode === 'custom')) && (
          <div className="form-row" style={{ marginBottom: '14px' }}>
            <div className="field">
              <label>تاريخ البداية</label>
              <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>تاريخ النهاية</label>
              <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} />
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setIsExportModalOpen(false)}>إلغاء</button>
          <button
            className="btn btn-start"
            onClick={() => {
              if (exportType === 'single_emp') {
                exportEmpExcel(
                  exportEmpId || (state.employees[0] ? state.employees[0].id : ''),
                  exportRangeMode,
                  exportStartDate,
                  exportEndDate
                );
              } else {
                exportAllPayrollExcel(exportType, exportStartDate, exportEndDate);
              }
            }}
          >
            تنزيل ملف الإكسل
          </button>
        </div>
      </div>
    </div>
  );
}
