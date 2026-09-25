import React from 'react';
import { fmt } from '../../utils/formatters';

export default function FinancialSummary({
  financialRangeMode,
  setFinancialRangeMode,
  financialStartDate,
  setFinancialStartDate,
  financialEndDate,
  setFinancialEndDate,
  monthPicker,
  grandSummary
}) {
  return (
    <>
      {/* Section 4: Payroll Financial Summary & Excel Exports for ALL Employees */}
      <div className="section-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
          <h2>إجمالي الرواتب والتقارير المالية لجميع الموظفين بالشركة</h2>

          {/* Date Range Filter Selector Controls */}
          <div className="range-filter-box" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)', padding: '6px 14px', borderRadius: '99px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--muted)' }}>📅 تصفية الفترة:</span>
            
            <select
              value={financialRangeMode}
              onChange={(e) => setFinancialRangeMode(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '99px', fontSize: '13px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
            >
              <option value="month">الشهر الحالي ({monthPicker})</option>
              <option value="custom">فترة مخصصة (من - إلى)</option>
            </select>

            {financialRangeMode === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="date"
                  value={financialStartDate}
                  onChange={(e) => setFinancialStartDate(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إلى</span>
                <input
                  type="date"
                  value={financialEndDate}
                  onChange={(e) => setFinancialEndDate(e.target.value)}
                  style={{ padding: '5px 10px', borderRadius: '8px', fontSize: '12.5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
                />
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--primary)', fontWeight: '700' }}>
          {financialRangeMode === 'custom' ? (
            <span>📊 إحصائيات وتقارير الشركة للفترة من <strong>{financialStartDate || '...'}</strong> إلى <strong>{financialEndDate || '...'}</strong></span>
          ) : (
            <span>📊 إحصائيات وتقارير الشركة لشهر <strong>{monthPicker}</strong></span>
          )}
        </div>
      </div>
      <div className="summary-grid">
        <div className="summary-box">
          <div className="label">إجمالي ساعات العمل</div>
          <div className="value">{fmt(grandSummary.totalHours)} ساعة</div>
        </div>
        <div className="summary-box">
          <div className="label">إجمالي المستحقات الأساسية</div>
          <div className="value">{fmt(grandSummary.totalBaseEarnings)} ج.م</div>
        </div>
        <div className="summary-box">
          <div className="label">إجمالي المكافآت</div>
          <div className="value" style={{ color: 'var(--success)' }}>+{fmt(grandSummary.totalBonus)} ج.م</div>
        </div>
        <div className="summary-box">
          <div className="label">إجمالي الخصومات</div>
          <div className="value" style={{ color: 'var(--danger)' }}>-{fmt(grandSummary.totalDeduction)} ج.م</div>
        </div>
        <div className="summary-box total" style={{ gridColumn: 'span 2' }}>
          <div className="label">إجمالي رواتب الشركة المدفوعة (صافي المرتبات)</div>
          <div className="value">{fmt(grandSummary.grandNetSalary)} ج.م</div>
        </div>
      </div>
    </>
  );
}
