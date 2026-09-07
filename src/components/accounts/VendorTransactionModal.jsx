import React, { useState } from 'react';

/**
 * VendorTransactionModal.jsx
 * نافذة تسجيل معاملة مالية لشركة توزيع أدوية (فاتورة مشتريات / سداد دفعة أو شيك / إشعار خصم إكسباير)
 * تقوم بتحديث رصيد المورد وتوليد سند القيد المحاسبي المتزن آلياً
 */
export default function VendorTransactionModal({
  isOpen,
  onClose,
  initialTxType = 'payment',
  vendors = [],
  branches = [],
  treasuries = [],
  onSaveTransaction,
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [txType, setTxType] = useState(initialTxType);
  const [txNumber, setTxNumber] = useState(() => `VTX-${Date.now().toString().slice(-6)}`);
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 45);
    return d.toISOString().slice(0, 10);
  });
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(initialTxType === 'invoice' ? 'credit' : 'cheque');
  const [chequeNumber, setChequeNumber] = useState('');
  const [selectedTreasuryId, setSelectedTreasuryId] = useState(treasuries[0]?.id || '');
  const [narration, setNarration] = useState('');

  if (!isOpen) return null;

  const selectedVendor = vendors.find((v) => v.id === vendorId) || vendors[0];

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount) || 0;
    if (parsedAmount <= 0) {
      alert('يرجى إدخال مبلغ مالي صحيح.');
      return;
    }

    const txPayload = {
      id: `vtx-${Date.now()}`,
      vendor_id: vendorId,
      tx_type: txType,
      tx_number: txNumber.trim(),
      tx_date: txDate,
      due_date: txType === 'invoice' ? dueDate : '',
      branch_id: branchId,
      amount: parsedAmount,
      payment_method: paymentMethod,
      cheque_number: paymentMethod === 'cheque' ? chequeNumber.trim() : '',
      treasury_id: selectedTreasuryId,
      status: txType === 'invoice' ? 'open' : 'completed',
      narration: narration.trim() || (
        txType === 'invoice'
          ? `فاتورة مشتريات أدوية ومستلزمات - ${selectedVendor?.name_ar || ''}`
          : txType === 'payment'
          ? `سداد دفعة/شيك لصالح ${selectedVendor?.name_ar || ''}`
          : `إشعار خصم مرتجع أدوية منتهية الصلاحية (إكسباير) - ${selectedVendor?.name_ar || ''}`
      ),
    };

    onSaveTransaction(txPayload);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="acc-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>💊</span>
              <div>
                <h2>
                  {txType === 'invoice' && 'تسجيل فاتورة مشتريات أدوية جديدة'}
                  {txType === 'payment' && 'سداد دفعة نقدية أو شيك لموزع أدوية'}
                  {txType === 'credit_note' && 'إثبات إشعار خصم مرتجع إكسباير (Credit Note)'}
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  يتم تحديث مديونية شركة التوزيع وتوليد سند القيد المحاسبي المزدوج فورياً
                </p>
              </div>
            </div>
            <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body">
            {/* Type Switcher */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              <button
                type="button"
                className={`acc-btn ${txType === 'payment' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                onClick={() => {
                  setTxType('payment');
                  setPaymentMethod('cheque');
                }}
                style={{ fontSize: '12.5px', justifyContent: 'center' }}
              >
                📤 سداد دفعة / شيك
              </button>
              <button
                type="button"
                className={`acc-btn ${txType === 'invoice' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                onClick={() => {
                  setTxType('invoice');
                  setPaymentMethod('credit');
                }}
                style={{ fontSize: '12.5px', justifyContent: 'center' }}
              >
                📥 فاتورة مشتريات
              </button>
              <button
                type="button"
                className={`acc-btn ${txType === 'credit_note' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                onClick={() => {
                  setTxType('credit_note');
                  setPaymentMethod('credit_adjustment');
                }}
                style={{ fontSize: '12.5px', justifyContent: 'center' }}
              >
                🔄 إشعار خصم إكسباير
              </button>
            </div>

            {/* Vendor and Branch */}
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>شركة توزيع الأدوية / المورد:</label>
                <select
                  className="acc-form-select"
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  required
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name_ar} (رصيد: {Number(v.current_balance || 0).toLocaleString()} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div className="acc-form-group">
                <label>الفرع المستفيد / الصيدلية:</label>
                <select
                  className="acc-form-select"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">🏢 الإدارة العامة / مخزن رئيسي</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      📍 {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount and Reference */}
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>المبلغ الإجمالي (ج.م):</label>
                <input
                  type="number"
                  step="0.01"
                  className="acc-form-input"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  style={{ fontSize: '16px', fontWeight: '800', color: '#0284c7' }}
                />
              </div>

              <div className="acc-form-group">
                <label>رقم الفاتورة / السند:</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={txNumber}
                  onChange={(e) => setTxNumber(e.target.value)}
                  placeholder="INV-99238"
                  required
                />
              </div>
            </div>

            {/* Dates */}
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>تاريخ المعاملة:</label>
                <input
                  type="date"
                  className="acc-form-input"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  required
                />
              </div>

              {txType === 'invoice' && (
                <div className="acc-form-group">
                  <label>تاريخ استحقاق السداد (فترة الائتمان):</label>
                  <input
                    type="date"
                    className="acc-form-input"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Payment Method (for payments) */}
            {txType === 'payment' && (
              <div className="acc-form-row">
                <div className="acc-form-group">
                  <label>طريقة السداد المنفذة:</label>
                  <select
                    className="acc-form-select"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cheque">شيك بنكي (تحت الصرف)</option>
                    <option value="bank_transfer">تحويل بنكي مباشر (سويفت / إلكتروني)</option>
                    <option value="cash">نقداً من الخزينة</option>
                  </select>
                </div>

                {paymentMethod === 'cheque' ? (
                  <div className="acc-form-group">
                    <label>رقم الشيك البنكي الصادر:</label>
                    <input
                      type="text"
                      className="acc-form-input"
                      placeholder="CHQ-889912"
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="acc-form-group">
                    <label>من حساب الخزينة / البنك:</label>
                    <select
                      className="acc-form-select"
                      value={selectedTreasuryId}
                      onChange={(e) => setSelectedTreasuryId(e.target.value)}
                    >
                      {treasuries.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (رصيد: {Number(t.current_balance || 0).toLocaleString()} ج.م)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Narration */}
            <div className="acc-form-group">
              <label>بيان القيد / ملاحظات إضافية:</label>
              <textarea
                className="acc-form-textarea"
                rows="2"
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="أية تفاصيل تخص طلبيات الأدوية أو شروط الخصم..."
              ></textarea>
            </div>

            {/* Accounting Impact Preview */}
            <div style={{
              background: 'var(--surface-subtle, #f8fafc)',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '12px',
              color: 'var(--muted, #64748b)',
            }}>
              <strong>📌 الأثر المحاسبي التلقائي للقيد:</strong>
              {txType === 'payment' && (
                <div style={{ marginTop: '4px', color: '#047857' }}>
                  • مدين (+): حـ/ شركة {selectedVendor?.name_ar || 'التوزيع'} (تخفيض المديونية المستحقة)
                  <br />
                  • دائن (-): حـ/ البنك أو الخزينة (خروج النقدية المسددة)
                </div>
              )}
              {txType === 'invoice' && (
                <div style={{ marginTop: '4px', color: '#0284c7' }}>
                  • مدين (+): حـ/ مخزون الأدوية البشرية (11501) (زيادة بضاعة الصيدليات)
                  <br />
                  • دائن (-): حـ/ شركة {selectedVendor?.name_ar || 'التوزيع'} (إثبات التزام الدين بالآجل)
                </div>
              )}
              {txType === 'credit_note' && (
                <div style={{ marginTop: '4px', color: '#7c3aed' }}>
                  • مدين (+): حـ/ شركة {selectedVendor?.name_ar || 'التوزيع'} (استنزال قيمة الإكسباير من المديونية)
                  <br />
                  • دائن (-): حـ/ تسويات توالف وإكسباير الأدوية (59) (استرداد التكلفة)
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="acc-btn acc-btn-primary">
              💾 حفظ وترحيل القيد آلياً
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
