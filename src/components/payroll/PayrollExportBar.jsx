import React from 'react';

export default function PayrollExportBar({ setIsExportModalOpen }) {
  return (
    <div className="export-bar">
      <div>
        <h3>تصدير تقارير Excel الفردية والجماعية</h3>
        <p>اصدار شيتات إكسل منسقة لرواتب الموظفين مع كافة البيانات والمعادلات المحسوبة.</p>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn btn-start" onClick={() => setIsExportModalOpen(true)}>
          ⚙️ تصدير مخصص / شيت موظف فردي
        </button>
      </div>
    </div>
  );
}
