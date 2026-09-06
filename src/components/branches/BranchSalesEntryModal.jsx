import React, { useState, useEffect } from 'react';

/**
 * BranchSalesEntryModal.jsx
 * نافذة تسجيل أو تعديل مبيعات فرع ليوم محدد بدقة
 */
export default function BranchSalesEntryModal({
  isOpen,
  onClose,
  onSave,
  branches = [],
  editingSale = null,
  preselectedBranchId = null,
  isBranchManager = false
}) {
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashSales, setCashSales] = useState('');
  const [visaSales, setVisaSales] = useState('');
  const [walletSales, setWalletSales] = useState('');
  const [instapaySales, setInstapaySales] = useState('');
  const [deliverySales, setDeliverySales] = useState('');
  const [creditSales, setCreditSales] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [isManualTotal, setIsManualTotal] = useState(false);
  const [receiptsCount, setReceiptsCount] = useState('');
  const [shiftManager, setShiftManager] = useState('');
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState(null);

  useEffect(() => {
    if (editingSale) {
      setBranchId(String(editingSale.branchId || ''));
      setDate(editingSale.date || new Date().toISOString().slice(0, 10));
      setCashSales(editingSale.cashSales !== undefined ? String(editingSale.cashSales) : '');
      setVisaSales(editingSale.visaSales !== undefined ? String(editingSale.visaSales) : '');
      setWalletSales(editingSale.walletSales !== undefined ? String(editingSale.walletSales) : (editingSale.electronicWalletSales !== undefined ? String(editingSale.electronicWalletSales) : ''));
      setInstapaySales(editingSale.instapaySales !== undefined ? String(editingSale.instapaySales) : '');
      setDeliverySales(editingSale.deliverySales !== undefined ? String(editingSale.deliverySales) : '');
      setCreditSales(editingSale.creditSales !== undefined ? String(editingSale.creditSales) : '');
      setManualTotal(editingSale.totalSales !== undefined ? String(editingSale.totalSales) : '');
      setReceiptsCount(editingSale.receiptsCount !== undefined ? String(editingSale.receiptsCount) : '');
      setShiftManager(editingSale.shiftManager || '');
      setNotes(editingSale.notes || '');
      setAttachment(editingSale.attachment || null);
      setIsManualTotal(Boolean(editingSale.isManualTotal));
    } else {
      const defaultBId = preselectedBranchId || (branches[0] ? String(branches[0].id) : '');
      setBranchId(defaultBId);
      setDate(new Date().toISOString().slice(0, 10));
      setCashSales('');
      setVisaSales('');
      setWalletSales('');
      setInstapaySales('');
      setDeliverySales('');
      setCreditSales('');
      setManualTotal('');
      setIsManualTotal(false);
      setReceiptsCount('');
      setShiftManager('');
      setNotes('');
      setAttachment(null);
    }
  }, [editingSale, isOpen, preselectedBranchId, branches]);

  if (!isOpen) return null;

  // Calculate total automatically
  const calculatedTotal = (
    (parseFloat(cashSales) || 0) +
    (parseFloat(visaSales) || 0) +
    (parseFloat(walletSales) || 0) +
    (parseFloat(instapaySales) || 0) +
    (parseFloat(deliverySales) || 0) +
    (parseFloat(creditSales) || 0)
  );

  const effectiveTotal = isManualTotal
    ? (parseFloat(manualTotal) || 0)
    : calculatedTotal;

  const countNum = parseInt(receiptsCount, 10) || 0;
  const averageBasket = countNum > 0 ? (effectiveTotal / countNum).toFixed(2) : 0;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('⚠️ يرجى اختيار ملف صورة صالح لتقرير Z-Report (PNG, JPG, WebP)');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 4 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachment(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!branchId) {
      alert('يرجى اختيار الفرع');
      return;
    }
    if (!date) {
      alert('يرجى تحديد تاريخ المبيعات');
      return;
    }
    if (effectiveTotal <= 0) {
      const conf = window.confirm('⚠️ إجمالي المبيعات المدخل هو 0 ج.م، هل ترغب في الاستمرار؟');
      if (!conf) return;
    }

    const selectedBranchObj = branches.find((b) => String(b.id) === String(branchId));
    const branchName = selectedBranchObj?.name || selectedBranchObj?.branchName || `فرع ${branchId}`;

    const saleRecord = {
      id: editingSale ? editingSale.id : `sale_${branchId}_${date}`,
      branchId: String(branchId),
      branchName,
      date,
      month: date.slice(0, 7),
      totalSales: parseFloat(effectiveTotal.toFixed(2)),
      cashSales: parseFloat((parseFloat(cashSales) || 0).toFixed(2)),
      visaSales: parseFloat((parseFloat(visaSales) || 0).toFixed(2)),
      walletSales: parseFloat((parseFloat(walletSales) || 0).toFixed(2)),
      instapaySales: parseFloat((parseFloat(instapaySales) || 0).toFixed(2)),
      deliverySales: parseFloat((parseFloat(deliverySales) || 0).toFixed(2)),
      creditSales: parseFloat((parseFloat(creditSales) || 0).toFixed(2)),
      isManualTotal,
      receiptsCount: countNum,
      averageBasket: parseFloat(averageBasket),
      shiftManager: shiftManager.trim(),
      notes: notes.trim(),
      attachment,
      createdAt: editingSale ? editingSale.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: isBranchManager ? 'branch_manager' : 'admin'
    };

    onSave(saleRecord);
    onClose();
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px',
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content card" style={{
        maxWidth: '650px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '24px',
        background: 'var(--surface, #ffffff)',
        direction: 'rtl'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px', background: '#ecfdf5', padding: '8px', borderRadius: '12px' }}>💰</span>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: '800' }}>
                {editingSale ? 'تعديل مبيعات الفرع اليومية' : 'تسجيل مبيعات فرع يومية'}
              </h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12.5px' }}>
                إدخال إيرادات الصيدلية اليومية وتصنيف مصادر الدفع والفواتير
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ fontSize: '18px', padding: '6px 12px', borderRadius: '8px' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Branch & Date Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                🏢 الصيدلية / الفرع <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <select
                className="input-field"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={isBranchManager}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13.5px', fontWeight: '600' }}
                required
              >
                <option value="">-- اختر الفرع --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.branchName || `فرع ${b.id}`} {b.branchCode ? `(${b.branchCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                📅 تاريخ المبيعات <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13.5px', fontWeight: '600' }}
                required
              />
            </div>
          </div>

          {/* Payment Breakdown Section */}
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                💳 تفصيل الإيرادات حسب وسيلة الدفع
              </span>
              <button
                type="button"
                onClick={() => setIsManualTotal(!isManualTotal)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                {isManualTotal ? '🔄 تفعيل الجمع التلقائي للمصادر' : '✏️ إدخال الإجمالي مباشرة بدون تفصيل'}
              </button>
            </div>

            {!isManualTotal ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#15803d' }}>
                    💵 كاش نقدي (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={cashSales}
                    onChange={(e) => setCashSales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#1d4ed8' }}>
                    💳 فيزا وبطاقات (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={visaSales}
                    onChange={(e) => setVisaSales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#7c3aed' }}>
                    📱 محفظة إلكترونية (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="فودافون / اتصالات"
                    value={walletSales}
                    onChange={(e) => setWalletSales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #ddd6fe', background: '#faf5ff', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#0284c7' }}>
                    ⚡ إنستاباي - InstaPay (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="تحويل لحظي"
                    value={instapaySales}
                    onChange={(e) => setInstapaySales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #bae6fd', background: '#f0f9ff', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#b45309' }}>
                    🛵 مبيعات دليفري (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={deliverySales}
                    onChange={(e) => setDeliverySales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: '#6b7280' }}>
                    📑 آجل وشركات (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={creditSales}
                    onChange={(e) => setCreditSales(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', marginBottom: '5px', color: '#0f766e' }}>
                  💰 إجمالي مبيعات اليوم المباشر (ج.م) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="أدخل إجمالي مبيعات اليوم مباشرة"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #0d9488', fontSize: '15px', fontWeight: '800' }}
                  required
                />
              </div>
            )}

            {/* Total Display Banner */}
            <div style={{
              marginTop: '14px',
              padding: '10px 14px',
              background: 'linear-gradient(135deg, #0f766e, #115e59)',
              borderRadius: '10px',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '13px', fontWeight: '700' }}>💎 إجمالي مبيعات اليوم:</span>
              <span style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '0.5px' }}>
                {effectiveTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
              </span>
            </div>
          </div>

          {/* Receipts & Basket Analytics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                🧾 عدد الفواتير (العملاء)
              </label>
              <input
                type="number"
                min="0"
                placeholder="مثال: 145"
                value={receiptsCount}
                onChange={(e) => setReceiptsCount(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13.5px', fontWeight: '600' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                📊 متوسط الفاتورة التلقائي (Average Basket)
              </label>
              <div style={{
                padding: '9px 12px',
                borderRadius: '8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                fontWeight: '800',
                color: '#0f172a'
              }}>
                {countNum > 0 ? `${averageBasket} ج.م / فاتورة` : '—'}
              </div>
            </div>
          </div>

          {/* Shift Manager & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                👤 صيدلي / كاشير الوردية
              </label>
              <input
                type="text"
                placeholder="اسم المسؤول عن التقفيل"
                value={shiftManager}
                onChange={(e) => setShiftManager(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
                📝 ملاحظات إغلاق الوردية
              </label>
              <input
                type="text"
                placeholder="أي ملاحظات تشغيلية أو نواقص أو عروض"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Attachment Z-Report */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '6px', color: 'var(--text)' }}>
              📎 صورة تقرير إغلاق الماكينة (Z-Report)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="file"
                accept="image/*"
                id="z-report-upload"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="z-report-upload"
                className="btn btn-ghost"
                style={{
                  border: '1.5px dashed var(--border)',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '700'
                }}
              >
                <span>📷</span> رفع صورة تقرير الـ Z-Report
              </label>

              {attachment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img
                    src={attachment}
                    alt="Z-Report Preview"
                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #0d9488' }}
                  />
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer', fontWeight: '700' }}
                  >
                    إزالة الصورة ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '9px 18px', fontSize: '13.5px' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-start"
              style={{ padding: '9px 24px', fontSize: '14px', fontWeight: '800', background: '#0f766e' }}
            >
              💾 {editingSale ? 'حفظ التعديلات' : 'تسجيل المبيعات اليومية'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
