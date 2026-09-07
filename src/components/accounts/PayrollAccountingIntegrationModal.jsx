import React, { useState, useMemo } from 'react';

/**
 * PayrollAccountingIntegrationModal.jsx
 * نافذة الربط الآلي بمسير رواتب الموظفين وترحيل قيد الرواتب والأجور الشهري إلى اليومية العامة
 */
export default function PayrollAccountingIntegrationModal({
  isOpen,
  onClose,
  state,
  fiscalPeriod,
  computeGrandPayroll,
  treasuries = [],
  accounts = [],
  onPostPayrollEntry,
}) {
  const [selectedMonth, setSelectedMonth] = useState(fiscalPeriod || new Date().toISOString().slice(0, 7));
  const [settlementMethod, setSettlementMethod] = useState('accrued'); // 'accrued' (21201 رواتب مستحقة) | 'cash_bank' (صرف مباشر)
  const [selectedTreasuryId, setSelectedTreasuryId] = useState(treasuries[0]?.id || '');

  // Compute payroll summary for selected month
  const payrollSummary = useMemo(() => {
    if (!computeGrandPayroll) {
      return {
        totalBaseEarnings: 0,
        totalOvertimeEarnings: 0,
        totalBonus: 0,
        totalAllowances: 0,
        totalDailyAllowances: 0,
        totalDeduction: 0,
        totalNetSalary: 0,
        empCount: 0,
      };
    }

    try {
      const res = computeGrandPayroll(null, selectedMonth);
      const empCount = Object.keys(res.perEmp || {}).length;
      return {
        ...res,
        empCount,
      };
    } catch (e) {
      console.error('Error computing grand payroll for accounts:', e);
      return {
        totalBaseEarnings: 0,
        totalOvertimeEarnings: 0,
        totalBonus: 0,
        totalAllowances: 0,
        totalDailyAllowances: 0,
        totalDeduction: 0,
        totalNetSalary: 0,
        empCount: 0,
      };
    }
  }, [computeGrandPayroll, selectedMonth]);

  // Compute cashier shortages allocated for this month to offset against account 11603
  const cashierShortageAdjustments = useMemo(() => {
    return (state?.adjustments || []).filter((a) => {
      const isShortage = a.isCashierShortage || (a.reason && (a.reason.includes('عجز') || a.reason.includes('خزينة')));
      const matchMonth = !selectedMonth || (a.date && a.date.startsWith(selectedMonth));
      return a.type === 'deduction' && isShortage && matchMonth;
    });
  }, [state?.adjustments, selectedMonth]);

  const totalCashierShortageDeductions = useMemo(() => {
    return cashierShortageAdjustments.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [cashierShortageAdjustments]);

  const totalBasicAndAllowances = (payrollSummary.totalBaseEarnings || 0) + (payrollSummary.totalAllowances || 0) + (payrollSummary.totalDailyAllowances || 0);
  const totalOvertime = payrollSummary.totalOvertimeEarnings || 0;
  const totalBonus = payrollSummary.totalBonus || 0;
  const totalGrossPayroll = totalBasicAndAllowances + totalOvertime + totalBonus;
  const totalDeductionsAdvances = payrollSummary.totalDeduction || 0;
  const netPayable = payrollSummary.totalNetSalary || (totalGrossPayroll - totalDeductionsAdvances);

  // Remaining general advances/penalties
  const totalOtherDeductions = Math.max(0, totalDeductionsAdvances - totalCashierShortageDeductions);

  if (!isOpen) return null;

  const handlePostEntry = () => {
    if (totalGrossPayroll <= 0) {
      alert('لا توجد بيانات مسير رواتب مسجلة لهذا الشهر، أو أن إجمالي الرواتب يساوي صفر.');
      return;
    }

    // Find accounts from COA
    const accBaseSalary = accounts.find((a) => a.code === '611') || { id: 'acc-611', code: '611', name_ar: 'رواتب وبدلات أساسية' };
    const accBonus = accounts.find((a) => a.code === '612') || { id: 'acc-612', code: '612', name_ar: 'مكافآت تشجيعية وتارجت' };
    const accOvertime = accounts.find((a) => a.code === '613') || { id: 'acc-613', code: '613', name_ar: 'أجور ساعات عمل إضافي' };
    const accAdvances = accounts.find((a) => a.code === '11601') || { id: 'acc-11601', code: '11601', name_ar: 'سلف العاملين المؤقتة والمستديمة' };
    const accCashierShortage = accounts.find((a) => a.code === '11603') || { id: 'acc-11603', code: '11603', name_ar: 'عجز خزائن الفروع تحت التحصيل من الرواتب' };
    const accAccrued = accounts.find((a) => a.code === '21201') || { id: 'acc-21201', code: '21201', name_ar: 'رواتب وأجور مستحقة للعاملين' };

    const selectedTreasury = treasuries.find((t) => t.id === selectedTreasuryId);
    const creditPayoutAccountId = settlementMethod === 'cash_bank' && selectedTreasury
      ? selectedTreasury.account_id
      : accAccrued.id;

    const lines = [
      // 1. Basic Salaries & Allowances (Debit)
      {
        account_id: accBaseSalary.id,
        debit: totalBasicAndAllowances,
        credit: 0,
        cost_center_id: '',
        line_desc: `رواتب وبدلات أساسية للكادر الطبي والإداري لشهر ${selectedMonth}`,
      },
    ];

    // 2. Overtime (Debit if > 0)
    if (totalOvertime > 0) {
      lines.push({
        account_id: accOvertime.id,
        debit: totalOvertime,
        credit: 0,
        cost_center_id: '',
        line_desc: `أجور ساعات عمل إضافي (Overtime) لشهر ${selectedMonth}`,
      });
    }

    // 3. Bonuses (Debit if > 0)
    if (totalBonus > 0) {
      lines.push({
        account_id: accBonus.id,
        debit: totalBonus,
        credit: 0,
        cost_center_id: '',
        line_desc: `مكافآت تشجيعية وعمولات تارجت المبيعات لشهر ${selectedMonth}`,
      });
    }

    // 4. Advances & General Deductions recovery (Credit)
    if (totalOtherDeductions > 0) {
      lines.push({
        account_id: accAdvances.id,
        debit: 0,
        credit: totalOtherDeductions,
        cost_center_id: '',
        line_desc: `استقطاع وتسوية سلف وخصومات العاملين لشهر ${selectedMonth}`,
      });
    }

    // 5. Cashier Shortage Deductions recovery (Credit to 11603)
    if (totalCashierShortageDeductions > 0) {
      lines.push({
        account_id: accCashierShortage.id,
        debit: 0,
        credit: totalCashierShortageDeductions,
        cost_center_id: '',
        line_desc: `استقطاع عجز خزائن الكاشير للفروع من رواتب العاملين لشهر ${selectedMonth} (تسوية حـ/ 11603)`,
      });
    }

    // 6. Net Salary Payable or Paid (Credit)
    lines.push({
      account_id: creditPayoutAccountId,
      debit: 0,
      credit: netPayable,
      cost_center_id: '',
      line_desc: settlementMethod === 'cash_bank'
        ? `صرف صافي رواتب العاملين لشهر ${selectedMonth} من ${selectedTreasury?.name || 'الخزينة'}`
        : `إثبات استحقاق صافي رواتب العاملين لشهر ${selectedMonth} (حساب دائن مستحق)`,
    });

    const entryPayload = {
      id: `jv-payroll-${selectedMonth}-${Date.now()}`,
      entry_number: `PAY-JV-${selectedMonth.replace('-', '')}`,
      entry_date: new Date().toISOString().slice(0, 10),
      doc_type: 'payroll',
      branch_id: '',
      narration: `قيد مسير رواتب وأجور العاملين لشهر ${selectedMonth} (${payrollSummary.empCount || 0} موظف)`,
      doc_reference: `PAYROLL-${selectedMonth}`,
      total_debit: totalGrossPayroll,
      total_credit: totalGrossPayroll,
      lines,
      is_posted: true,
      created_at: new Date().toISOString(),
    };

    onPostPayrollEntry(entryPayload);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        {/* Header */}
        <div className="acc-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>👥</span>
            <div>
              <h2>الربط بمسير الرواتب وترحيل القيد المحاسبي الآلي</h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                قراءة أجور وبدلات وسلف العاملين مباشرة من محرك الـ HR وتوليد قيد الرواتب المتزن فورياً
              </p>
            </div>
          </div>
          <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="acc-modal-body">
          {/* Month Selector */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-subtle, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            padding: '12px 18px',
            borderRadius: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', display: 'block' }}>
                اختر شهر مسير الرواتب المستهدف:
              </label>
              <input
                type="month"
                className="acc-form-input"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: '180px', marginTop: '4px' }}
              />
            </div>

            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>عدد الموظفين المحسوبين:</div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#0284c7' }}>
                {payrollSummary.empCount} موظفاً
              </div>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '10px',
            marginBottom: '16px',
          }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#166534' }}>الرواتب الأساسية والبدلات:</div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: '#15803d', fontFamily: 'monospace', marginTop: '2px' }}>
                {totalBasicAndAllowances.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
              </div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#1e40af' }}>العمل الإضافي (Overtime):</div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: '#1d4ed8', fontFamily: 'monospace', marginTop: '2px' }}>
                {totalOvertime.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
              </div>
            </div>

            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#6b21a8' }}>المكافآت والتارجت:</div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: '#7e22ce', fontFamily: 'monospace', marginTop: '2px' }}>
                {totalBonus.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
              </div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#991b1b' }}>استقطاعات وسلف مستردة:</div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: '#b91c1c', fontFamily: 'monospace', marginTop: '2px' }}>
                - {totalDeductionsAdvances.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
              </div>
            </div>
          </div>

          {totalCashierShortageDeductions > 0 && (
            <div style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#9f1239',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🔒</span>
                <span>
                  يشمل المسير <strong>{cashierShortageAdjustments.length}</strong> استقطاعات عجز ورديات كاشير صيدليات مسجلة هذا الشهر:
                </span>
              </div>
              <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {totalCashierShortageDeductions.toLocaleString()} ج.م (حـ/ 11603)
              </strong>
            </div>
          )}

          {/* Net Highlight */}
          <div style={{
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            color: '#fff',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)',
          }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.9 }}>صافي الرواتب المستحقة للصرف (Net Payable)</div>
              <div style={{ fontSize: '16px', fontWeight: '800' }}>إجمالي التزامات الرواتب الفعلية للشهر</div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: '900', fontFamily: 'monospace' }}>
              {netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
            </div>
          </div>

          {/* Settlement Method Selection */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text, #0f172a)', display: 'block', marginBottom: '6px' }}>
              طريقة إثبات وتوجيه الطرف الدائن للقيد:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{
                border: settlementMethod === 'accrued' ? '1.5px solid #0284c7' : '1px solid var(--border, #e2e8f0)',
                background: settlementMethod === 'accrued' ? '#e0f2fe' : 'var(--surface-subtle, #f8fafc)',
                padding: '10px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <input
                  type="radio"
                  name="settlement"
                  value="accrued"
                  checked={settlementMethod === 'accrued'}
                  onChange={() => setSettlementMethod('accrued')}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>إثبات استحقاق (حـ/ 21201)</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>إثبات دين الرواتب حتى يتم الصرف لاحقاً</div>
                </div>
              </label>

              <label style={{
                border: settlementMethod === 'cash_bank' ? '1.5px solid #0d9488' : '1px solid var(--border, #e2e8f0)',
                background: settlementMethod === 'cash_bank' ? '#ccfbf1' : 'var(--surface-subtle, #f8fafc)',
                padding: '10px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <input
                  type="radio"
                  name="settlement"
                  value="cash_bank"
                  checked={settlementMethod === 'cash_bank'}
                  onChange={() => setSettlementMethod('cash_bank')}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>صرف فوري من الخزينة/البنك</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>خصم الصافي مباشرة من السيولة</div>
                </div>
              </label>
            </div>

            {settlementMethod === 'cash_bank' && (
              <div style={{ marginTop: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', display: 'block', marginBottom: '4px' }}>
                  حدد حساب الخزينة أو البنك المنفذ للصرف:
                </label>
                <select
                  className="acc-form-select"
                  value={selectedTreasuryId}
                  onChange={(e) => setSelectedTreasuryId(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {treasuries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (رصيد متاح: {Number(t.current_balance || 0).toLocaleString()} ج.م)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Draft Accounting Entry Table Preview */}
          <div style={{
            background: 'var(--surface-subtle, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '10px',
            padding: '12px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text, #0f172a)', marginBottom: '8px' }}>
              📑 معاينة سطور قيد اليومية الآلي المزمع ترحيله:
            </div>
            <table className="acc-table" style={{ fontSize: '11.5px' }}>
              <thead>
                <tr>
                  <th>الحساب المحاسبي</th>
                  <th style={{ width: '110px', color: '#059669' }}>مدين (+)</th>
                  <th style={{ width: '110px', color: '#dc2626' }}>دائن (-)</th>
                  <th>البيان المحاسبي</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>611 - رواتب وبدلات أساسية</strong></td>
                  <td style={{ fontWeight: '800', color: '#059669', fontFamily: 'monospace' }}>{totalBasicAndAllowances.toLocaleString()}</td>
                  <td>—</td>
                  <td>أجور وبدلات الكوادر</td>
                </tr>
                {totalOvertime > 0 && (
                  <tr>
                    <td><strong>613 - أجور ساعات إضافية</strong></td>
                    <td style={{ fontWeight: '800', color: '#059669', fontFamily: 'monospace' }}>{totalOvertime.toLocaleString()}</td>
                    <td>—</td>
                    <td>ساعات إضافية معتمدة</td>
                  </tr>
                )}
                {totalBonus > 0 && (
                  <tr>
                    <td><strong>612 - مكافآت وتارجت</strong></td>
                    <td style={{ fontWeight: '800', color: '#059669', fontFamily: 'monospace' }}>{totalBonus.toLocaleString()}</td>
                    <td>—</td>
                    <td>حوافز تشجيعية</td>
                  </tr>
                )}
                {totalOtherDeductions > 0 && (
                  <tr>
                    <td><strong>11601 - سلف وخصومات العاملين</strong></td>
                    <td>—</td>
                    <td style={{ fontWeight: '800', color: '#dc2626', fontFamily: 'monospace' }}>{totalOtherDeductions.toLocaleString()}</td>
                    <td>استقطاع وتسوية سلف</td>
                  </tr>
                )}
                {totalCashierShortageDeductions > 0 && (
                  <tr style={{ background: '#fff1f2' }}>
                    <td><strong style={{ color: '#9f1239' }}>11603 - عجز خزائن الكاشير (رواتب)</strong></td>
                    <td>—</td>
                    <td style={{ fontWeight: '800', color: '#b91c1c', fontFamily: 'monospace' }}>{totalCashierShortageDeductions.toLocaleString()}</td>
                    <td style={{ color: '#9f1239' }}>استرداد عجز الخزائن المحمل ع الموظفين</td>
                  </tr>
                )}
                <tr>
                  <td><strong>{settlementMethod === 'cash_bank' ? 'حساب الخزينة / البنك' : '21201 - رواتب مستحقة'}</strong></td>
                  <td>—</td>
                  <td style={{ fontWeight: '800', color: '#dc2626', fontFamily: 'monospace' }}>{netPayable.toLocaleString()}</td>
                  <td>صافي مستحق للصرف</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="acc-modal-footer">
          <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="acc-btn acc-btn-primary" onClick={handlePostEntry}>
            🚀 ترحيل قيد الرواتب إلى اليومية العامة
          </button>
        </div>
      </div>
    </div>
  );
}
