import React, { useState, useEffect } from 'react';

/**
 * AddEditAccountModal.jsx
 * نافذة إضافة حساب جديد أو تعديل حساب قائم بشجرة الحسابات
 * توليد الكود التلقائي وفق الحساب الأب، واختيار الطبيعة والنوع
 */
export default function AddEditAccountModal({ isOpen, onClose, parentAccount, accountToEdit, onSave, allAccounts = [] }) {
  const isEditing = Boolean(accountToEdit);

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [accountType, setAccountType] = useState('asset');
  const [nature, setNature] = useState('debit');
  const [isParent, setIsParent] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');

  // Auto-generate next code when adding under a parent
  useEffect(() => {
    if (isEditing && accountToEdit) {
      setCode(accountToEdit.code || '');
      setNameAr(accountToEdit.name_ar || '');
      setNameEn(accountToEdit.name_en || '');
      setAccountType(accountToEdit.account_type || 'asset');
      setNature(accountToEdit.nature || 'debit');
      setIsParent(Boolean(accountToEdit.is_parent));
      setOpeningBalance(String(accountToEdit.opening_balance ?? 0));
      setNotes(accountToEdit.notes || '');
    } else if (parentAccount) {
      // Suggest next child code
      const parentCode = parentAccount.code;
      const siblings = allAccounts.filter((a) => a.parent_id === parentAccount.id);
      let nextSuffix = siblings.length + 1;
      let suggested = '';

      if (parentAccount.level === 1) {
        suggested = `${parentCode}${nextSuffix}`;
      } else if (parentAccount.level === 2) {
        suggested = `${parentCode}${nextSuffix}`;
      } else {
        const padded = String(nextSuffix).padStart(2, '0');
        suggested = `${parentCode}${padded}`;
      }

      setCode(suggested);
      setNameAr('');
      setNameEn('');
      setAccountType(parentAccount.account_type);
      setNature(parentAccount.nature);
      setIsParent(false);
      setOpeningBalance('0');
      setNotes('');
    } else {
      setCode('');
      setNameAr('');
      setNameEn('');
      setAccountType('asset');
      setNature('debit');
      setIsParent(false);
      setOpeningBalance('0');
      setNotes('');
    }
  }, [isEditing, accountToEdit, parentAccount, allAccounts]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim() || !nameAr.trim()) return;

    const payload = {
      id: isEditing ? accountToEdit.id : `acc-${Date.now()}`,
      code: code.trim(),
      name_ar: nameAr.trim(),
      name_en: nameEn.trim(),
      account_type: accountType,
      nature: nature,
      parent_id: isEditing ? accountToEdit.parent_id : (parentAccount ? parentAccount.id : null),
      level: isEditing ? accountToEdit.level : (parentAccount ? parentAccount.level + 1 : 1),
      is_parent: isParent,
      opening_balance: parseFloat(openingBalance) || 0,
      current_balance: isEditing ? (accountToEdit.current_balance || 0) : (parseFloat(openingBalance) || 0),
      notes: notes.trim(),
      is_system: isEditing ? accountToEdit.is_system : false,
    };

    onSave(payload);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="acc-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>{isEditing ? '✏️' : '➕'}</span>
              <div>
                <h2>{isEditing ? `تعديل الحساب (${accountToEdit.name_ar})` : 'إضافة حساب جديد إلى شجرة الحسابات'}</h2>
                {parentAccount && !isEditing && (
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    تحت الحساب الرئيسي: <strong style={{ color: '#38bdf8' }}>{parentAccount.code} - {parentAccount.name_ar}</strong>
                  </p>
                )}
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
                <label>كود الحساب المحاسبي (فريد):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="مثلاً: 11105"
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>نوع الحساب الرئيسي:</label>
                <select
                  className="acc-form-select"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  disabled={Boolean(parentAccount && !isEditing)}
                >
                  <option value="asset">1 - الأصول (Assets)</option>
                  <option value="liability">2 - الالتزامات (Liabilities)</option>
                  <option value="equity">3 - حقوق الملكية (Equity)</option>
                  <option value="revenue">4 - الإيرادات (Revenues)</option>
                  <option value="cogs">5 - تكلفة المبيعات (COGS)</option>
                  <option value="expense">6 - المصروفات (Expenses)</option>
                </select>
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>اسم الحساب باللغة العربية:</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder="مثلاً: خزينة فرع لوران"
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>اسم الحساب باللغة الإنجليزية (اختياري):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="e.g. Laurent Branch Treasury"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group">
                <label>طبيعة الحساب (مدين / دائن):</label>
                <select className="acc-form-select" value={nature} onChange={(e) => setNature(e.target.value)}>
                  <option value="debit">مدين (Debit) - أصول / مصروفات / تكلفة</option>
                  <option value="credit">دائن (Credit) - التزامات / حقوق ملكية / إيرادات</option>
                </select>
              </div>

              <div className="acc-form-group">
                <label>الرصيد الافتتاحي (ج.م):</label>
                <input
                  type="number"
                  step="0.01"
                  className="acc-form-input"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="acc-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <input
                type="checkbox"
                id="chkIsParent"
                checked={isParent}
                onChange={(e) => setIsParent(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="chkIsParent" style={{ cursor: 'pointer', margin: 0 }}>
                حساب رئيسي (يحتوي على حسابات فرعية ولا تُسجل عليه حركات مباشرة)
              </label>
            </div>

            <div className="acc-form-group">
              <label>ملاحظات أو وصف إضافي للحساب:</label>
              <textarea
                className="acc-form-textarea"
                rows="2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أية توضيحات خاصة بالحساب والغرض منه..."
              ></textarea>
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="acc-btn acc-btn-primary">
              💾 حفظ الحساب
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
