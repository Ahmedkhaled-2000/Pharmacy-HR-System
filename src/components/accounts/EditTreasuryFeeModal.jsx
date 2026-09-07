import React, { useState, useEffect } from 'react';

/**
 * EditTreasuryFeeModal.jsx
 * نافذة ضبط وتعديل نسب خصم وعمولات البنوك والمحافظ الإلكترونية والتحويل اللحظي
 */
export default function EditTreasuryFeeModal({ isOpen, onClose, treasury, onSave, accounts = [] }) {
  const [feePercentage, setFeePercentage] = useState('0');
  const [feeFixed, setFeeFixed] = useState('0');
  const [commissionAccountId, setCommissionAccountId] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (treasury) {
      setName(treasury.name || '');
      setFeePercentage(String(treasury.fee_percentage ?? 0));
      setFeeFixed(String(treasury.fee_fixed ?? 0));
      setCommissionAccountId(treasury.commission_account_id || '');
    }
  }, [treasury]);

  if (!isOpen || !treasury) return null;

  // Filter commission/expense accounts from COA (typically under 65)
  const expenseAccounts = (accounts || []).filter(
    (a) => a.account_type === 'expense' && !a.is_parent
  );

  // Live simulation for a 1,000 EGP transaction
  const numPct = parseFloat(feePercentage) || 0;
  const numFixed = parseFloat(feeFixed) || 0;
  const sampleAmount = 1000;
  const calculatedFee = (sampleAmount * (numPct / 100)) + numFixed;
  const netReceived = sampleAmount - calculatedFee;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...treasury,
      fee_percentage: numPct,
      fee_fixed: numFixed,
      commission_account_id: commissionAccountId || null,
    });
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="acc-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>⚙️</span>
              <div>
                <h2>تعديل نسبة خصم وعمولة التحصيل ({treasury.name})</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  كود الخزينة/البوابة: <strong style={{ color: '#0284c7' }}>{treasury.code}</strong>
                </p>
              </div>
            </div>
            <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body">
            <div className="acc-form-group">
              <label>اسم وسيلة التحصيل / الخزينة:</label>
              <input type="text" className="acc-form-input" value={name} disabled style={{ opacity: 0.8 }} />
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>نسبة الخصم / العمولة المقتطعة (%):</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="acc-form-input"
                    value={feePercentage}
                    onChange={(e) => setFeePercentage(e.target.value)}
                    placeholder="مثلاً: 1.5"
                    required
                    style={{ width: '100%', paddingLeft: '32px' }}
                  />
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted, #64748b)' }}>
                    %
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
                  مثل: 1.5% لنقاط البيع POS، أو 1.0% للمحافظ الذكية، أو 0% للكاش
                </span>
              </div>

              <div className="acc-form-group">
                <label>مبلغ ثابت إضافي لكل حركة (ج.م):</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="acc-form-input"
                  value={feeFixed}
                  onChange={(e) => setFeeFixed(e.target.value)}
                  placeholder="0.00"
                />
                <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
                  مبلغ مقطوع يُخصم في كل عملية تحويل أو سحب إن وُجد
                </span>
              </div>
            </div>

            <div className="acc-form-group">
              <label>حساب مصروف العمولة البنكية في شجرة الحسابات:</label>
              <select
                className="acc-form-select"
                value={commissionAccountId}
                onChange={(e) => setCommissionAccountId(e.target.value)}
              >
                <option value="">-- اختر حساب العمولة تلقائياً (651 أو 652 أو 653) --</option>
                {expenseAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name_ar}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
                الحساب المحاسبي الذي سيتم تحميل قيمة العمولة المقتطعة عليه تلقائياً كـ (مدين).
              </span>
            </div>

            {/* Live Calculation Preview Box */}
            <div
              style={{
                background: 'var(--surface-subtle, #f8fafc)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '14px',
                padding: '16px',
                marginTop: '6px',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#0284c7', marginBottom: '10px' }}>
                💡 محاكاة حية لمعاملة مبيعات بقيمة 1,000 ج.م:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
                <div style={{ background: '#ffffff', border: '1px solid var(--border, #e2e8f0)', padding: '10px 8px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>إجمالي المعاملة</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>1,000 ج.م</div>
                </div>
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '10px 8px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11.5px', color: '#be123c' }}>عمولة البنك/المحفظة (-)</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#e11d48' }}>{calculatedFee.toFixed(2)} ج.م</div>
                </div>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px 8px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11.5px', color: '#047857' }}>الصافي المودع في الرصيد</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#059669' }}>{netReceived.toFixed(2)} ج.م</div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="acc-btn acc-btn-primary">
              💾 حفظ التعديلات وتطبيقها فوراً
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
