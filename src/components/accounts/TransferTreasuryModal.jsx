import React, { useState } from 'react';

/**
 * TransferTreasuryModal.jsx
 * نافذة تحويل نقدية بين الخزائن والبنوك والمحافظ
 * مع احتساب عمولة وخصم التحويل اللحظي أو عمولة المحفظة آلياً
 * وتوليد القيد المحاسبي المتزن فورياً
 */
export default function TransferTreasuryModal({
  isOpen,
  onClose,
  treasuries = [],
  preselectedTreasury = null,
  onExecuteTransfer,
}) {
  const [fromTreasuryId, setFromTreasuryId] = useState('');
  const [toTreasuryId, setToTreasuryId] = useState('');

  React.useEffect(() => {
    if (preselectedTreasury) {
      setFromTreasuryId(preselectedTreasury.id);
    }
  }, [preselectedTreasury]);
  const [amount, setAmount] = useState('');
  const [feeRateOverride, setFeeRateOverride] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const fromTreasury = treasuries.find((t) => t.id === fromTreasuryId);
  const toTreasury = treasuries.find((t) => t.id === toTreasuryId);

  // Auto compute fee based on fromTreasury or override
  const numAmount = parseFloat(amount) || 0;
  const effectiveRate = feeRateOverride !== '' ? (parseFloat(feeRateOverride) || 0) : (fromTreasury?.fee_percentage || 0);
  const fixedFee = fromTreasury?.fee_fixed || 0;
  const computedFee = (numAmount * (effectiveRate / 100)) + fixedFee;
  const netTransferred = Math.max(0, numAmount - computedFee);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fromTreasuryId || !toTreasuryId || numAmount <= 0) return;
    if (fromTreasuryId === toTreasuryId) {
      alert('لا يمكن التحويل لنفس الخزينة / الحساب!');
      return;
    }

    onExecuteTransfer({
      fromTreasury,
      toTreasury,
      grossAmount: numAmount,
      feeAmount: computedFee,
      netAmount: netTransferred,
      transferDate,
      notes: notes.trim() || `تحويل نقدية من ${fromTreasury.name} إلى ${toTreasury.name}`,
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
              <span style={{ fontSize: '22px' }}>🔄</span>
              <div>
                <h2>تحويل نقدية بين الخزائن والحسابات</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  توريد نقدية فرع للبنك، تغذية خزينة، أو سحب من المحافظ وإنستاباي
                </p>
              </div>
            </div>
            <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body">
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>التحويل من (الجهة المحول منها / المسحوب منها):</label>
                <select
                  className="acc-form-select"
                  value={fromTreasuryId}
                  onChange={(e) => setFromTreasuryId(e.target.value)}
                  required
                >
                  <option value="">-- اختر الخزينة أو الحساب --</option>
                  {treasuries.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.name} (رصيد: {Number(t.current_balance || 0).toLocaleString()} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div className="acc-form-group">
                <label>التحويل إلى (الجهة المستلمة / المودع فيها):</label>
                <select
                  className="acc-form-select"
                  value={toTreasuryId}
                  onChange={(e) => setToTreasuryId(e.target.value)}
                  required
                >
                  <option value="">-- اختر الحساب أو الخزينة المستلمة --</option>
                  {treasuries
                    .filter((t) => t.id !== fromTreasuryId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} - {t.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>إجمالي المبلغ المراد تحويله (ج.م):</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  className="acc-form-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="مثلاً: 25000"
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>تاريخ التحويل:</label>
                <input
                  type="date"
                  className="acc-form-input"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>نسبة عمولة التحويل المقتطعة (%):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="acc-form-input"
                  value={feeRateOverride !== '' ? feeRateOverride : (fromTreasury?.fee_percentage ?? 0)}
                  onChange={(e) => setFeeRateOverride(e.target.value)}
                  placeholder="نسبة الخصم إن وُجدت"
                />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  النسبة الافتراضية للخزينة: {fromTreasury?.fee_percentage || 0}%
                </span>
              </div>

              <div className="acc-form-group">
                <label>رسوم وعمولة التحويل المحسوبة (ج.م):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={`${computedFee.toFixed(2)} ج.م`}
                  disabled
                  style={{ color: '#fda4af', fontWeight: 'bold' }}
                />
              </div>
            </div>

            {/* Breakdown summary */}
            {numAmount > 0 && (
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: '#94a3b8' }}>المسحوب من {fromTreasury?.name || 'الخزينة الأصل'}:</span>
                  <span style={{ fontWeight: '800', color: '#fff' }}>{numAmount.toLocaleString()} ج.م</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: '#fda4af' }}>عمولة ومصروفات التحويل البنكي/اللحظي (-):</span>
                  <span style={{ fontWeight: '800', color: '#f43f5e' }}>{computedFee.toFixed(2)} ج.م</span>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: '#6ee7b7', fontWeight: '800' }}>الصافي المودع في {toTreasury?.name || 'الجهة المستلمة'}:</span>
                  <span style={{ fontWeight: '800', color: '#10b981' }}>{netTransferred.toLocaleString()} ج.م</span>
                </div>
              </div>
            )}

            <div className="acc-form-group">
              <label>بيان / ملاحظات التحويل:</label>
              <input
                type="text"
                className="acc-form-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="رقم مرجعي للتحويل أو إشعار البنك..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="acc-btn acc-btn-primary">
              🚀 تنفيذ التحويل وإنشاء القيد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
