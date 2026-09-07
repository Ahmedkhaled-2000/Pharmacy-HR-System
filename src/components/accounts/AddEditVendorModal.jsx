import React, { useState, useEffect } from 'react';

/**
 * AddEditVendorModal.jsx
 * نافذة إضافة وتعديل بيانات شركة توزيع أدوية / مورد
 */
export default function AddEditVendorModal({
  isOpen,
  onClose,
  vendorToEdit = null,
  onSaveVendor,
  existingVendorsCount = 6,
}) {
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [creditLimit, setCreditLimit] = useState('200000');
  const [creditDays, setCreditDays] = useState('45');
  const [initialBalance, setInitialBalance] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (vendorToEdit) {
      setNameAr(vendorToEdit.name_ar || '');
      setNameEn(vendorToEdit.name_en || '');
      setCode(vendorToEdit.code || '');
      setContactPerson(vendorToEdit.contact_person || '');
      setPhone(vendorToEdit.phone || '');
      setCreditLimit(String(vendorToEdit.credit_limit || 200000));
      setCreditDays(String(vendorToEdit.credit_days || 45));
      setInitialBalance(String(vendorToEdit.current_balance || 0));
      setNotes(vendorToEdit.notes || '');
    } else {
      setNameAr('');
      setNameEn('');
      setCode(`2110${existingVendorsCount + 1}`);
      setContactPerson('');
      setPhone('');
      setCreditLimit('250000');
      setCreditDays('45');
      setInitialBalance('0');
      setNotes('');
    }
  }, [vendorToEdit, existingVendorsCount, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nameAr.trim() || !code.trim()) {
      alert('يرجى إدخال اسم شركة التوزيع وكود الحساب.');
      return;
    }

    const payload = {
      id: vendorToEdit?.id || `vendor-${Date.now()}`,
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      code: code.trim(),
      account_id: vendorToEdit?.account_id || `acc-vendor-${Date.now()}`,
      contact_person: contactPerson.trim(),
      phone: phone.trim(),
      credit_limit: parseFloat(creditLimit) || 0,
      credit_days: parseInt(creditDays, 10) || 30,
      current_balance: vendorToEdit ? vendorToEdit.current_balance : (parseFloat(initialBalance) || 0),
      notes: notes.trim(),
    };

    onSaveVendor(payload);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div
        className="acc-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="acc-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🏢</span>
              <div>
                <h2>{vendorToEdit ? 'تعديل بيانات شركة التوزيع' : 'إضافة شركة توزيع أدوية جديدة'}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  إدارة بيانات الموزع، حدود الائتمان، وفترة السماح المتفق عليها
                </p>
              </div>
            </div>
            <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body hide-scrollbar">
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>اسم شركة التوزيع (عربي) *:</label>
                <input
                  type="text"
                  className="acc-form-input"
                  placeholder="مثال: المتحدة للصيادلة، ابن سينا..."
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>اسم الشركة (إنجليزي):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  placeholder="e.g. Pharma Care Dist"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>كود الحساب المالي (COA Code) *:</label>
                <input
                  type="text"
                  className="acc-form-input"
                  placeholder="مثال: 21107"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>فترة الائتمان المتفق عليها (أيام):</label>
                <select
                  className="acc-form-select"
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value)}
                >
                  <option value="15">15 يوماً</option>
                  <option value="30">30 يوماً</option>
                  <option value="45">45 يوماً</option>
                  <option value="60">60 يوماً</option>
                  <option value="90">90 يوماً</option>
                </select>
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>سقف التسهيلات والحد الائتماني (ج.م):</label>
                <input
                  type="number"
                  step="1000"
                  className="acc-form-input"
                  placeholder="250000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </div>

              {!vendorToEdit && (
                <div className="acc-form-group">
                  <label>الرصيد الافتتاحي المستحق للمورد (ج.م):</label>
                  <input
                    type="number"
                    step="0.01"
                    className="acc-form-input"
                    placeholder="0.00"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>اسم مسؤول الاتصال / المندوب:</label>
                <input
                  type="text"
                  className="acc-form-input"
                  placeholder="مثال: د. محمد أحمد"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </div>

              <div className="acc-form-group">
                <label>رقم الهاتف / الجوال:</label>
                <input
                  type="tel"
                  className="acc-form-input"
                  placeholder="010XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
              </div>
            </div>

            <div className="acc-form-group">
              <label>ملاحظات وشروط التعامل:</label>
              <textarea
                className="acc-form-textarea"
                rows="2"
                placeholder="أي شروط خصم أو تسويات أو مواعيد دفعات خاصة بهذا الموزع..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="acc-btn acc-btn-primary">
              💾 {vendorToEdit ? 'حفظ التعديلات' : 'إضافة وتثبيت الموزع'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
