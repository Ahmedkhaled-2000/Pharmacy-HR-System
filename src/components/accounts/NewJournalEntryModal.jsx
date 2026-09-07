import React, { useState } from 'react';

/**
 * NewJournalEntryModal.jsx
 * نافذة تسجيل سند قيد يومية عامة جديد (Double-Entry General Journal Voucher)
 * فحص لحظي ومباشر لاتزان القيد (Debit = Credit) قبل السماح بالحفظ
 */
export default function NewJournalEntryModal({
  isOpen,
  onClose,
  accounts = [],
  branches = [],
  costCenters = [],
  onSaveEntry,
}) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [docType, setDocType] = useState('manual');
  const [docReference, setDocReference] = useState('');
  const [branchId, setBranchId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [narration, setNarration] = useState('');

  // Initial 2 lines
  const [lines, setLines] = useState([
    { id: 1, account_id: '', debit: '', credit: '', line_desc: '', branch_id: '', cost_center_id: '' },
    { id: 2, account_id: '', debit: '', credit: '', line_desc: '', branch_id: '', cost_center_id: '' },
  ]);

  if (!isOpen) return null;

  // Filter accounts that are non-parent (only posting accounts)
  const postingAccounts = accounts.filter((a) => !a.is_parent);

  const handleLineChange = (index, field, value) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };

      // If user enters debit, clear credit on the same line, and vice-versa
      if (field === 'debit' && value && parseFloat(value) > 0) {
        copy[index].credit = '';
      } else if (field === 'credit' && value && parseFloat(value) > 0) {
        copy[index].debit = '';
      }

      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: Date.now(),
        account_id: '',
        debit: '',
        credit: '',
        line_desc: narration || '',
        branch_id: branchId || '',
        cost_center_id: costCenterId || '',
      },
    ]);
  };

  const removeLine = (index) => {
    if (lines.length <= 2) {
      alert('يجب أن يحتوي القيد على سطرين على الأقل (طرف مدين وطرف دائن)!');
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Balance calculations
  const totalDebit = lines.reduce((acc, l) => acc + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (parseFloat(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isBalanced) {
      alert(`⚠️ القيد غير متزن! يوجد فارق بمقدار ${difference.toFixed(2)} ج.م بين المدين والدائن.`);
      return;
    }

    // Check that all lines have an account selected
    for (const l of lines) {
      if (!l.account_id) {
        alert('يرجى تحديد الحساب المحاسبي لكافة سطور القيد!');
        return;
      }
      const deb = parseFloat(l.debit) || 0;
      const cred = parseFloat(l.credit) || 0;
      if (deb === 0 && cred === 0) {
        alert('يجب تحديد مبلغ مدين أو دائن لكل سطر في القيد!');
        return;
      }
    }

    const cleanLines = lines.map((l) => ({
      id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      account_id: l.account_id,
      cost_center_id: l.cost_center_id || costCenterId || null,
      branch_id: l.branch_id || branchId || null,
      line_desc: l.line_desc || narration || '',
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
    }));

    const newEntry = {
      id: `entry-${Date.now()}`,
      entry_number: `JV-${Date.now().toString().slice(-6)}`,
      entry_date: entryDate,
      doc_type: docType,
      doc_reference: docReference.trim(),
      branch_id: branchId || null,
      cost_center_id: costCenterId || null,
      narration: narration.trim() || 'قيد يومية يدوي',
      total_debit: totalDebit,
      total_credit: totalCredit,
      status: 'posted',
      created_by: 'المدير المالي',
      lines: cleanLines,
    };

    onSaveEntry(newEntry);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="acc-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>📝</span>
              <div>
                <h2>إنشاء سند قيد يومية محاسبي جديد (Journal Voucher)</h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  تسجيل قيود التسويات، الإثبات، تحويلات الخزائن، والمصروفات بالمعايير المزدوجة
                </p>
              </div>
            </div>
            <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body" style={{ maxHeight: '72vh' }}>
            {/* Top row */}
            <div className="acc-form-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="acc-form-group">
                <label>تاريخ القيد:</label>
                <input
                  type="date"
                  className="acc-form-input"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>

              <div className="acc-form-group">
                <label>نوع السند:</label>
                <select className="acc-form-select" value={docType} onChange={(e) => setDocType(e.target.value)}>
                  <option value="manual">قيد يومية يدوي</option>
                  <option value="adjustment">قيد تسوية جردية</option>
                  <option value="opening">قيد افتتاحي</option>
                  <option value="closing">قيد إقفال</option>
                  <option value="transfer">قيد تحويل نقدية</option>
                </select>
              </div>

              <div className="acc-form-group">
                <label>الفرع المرتبط (بُعد تحليلي):</label>
                <select className="acc-form-select" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">-- الإدارة العامة / بدون فرع --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="acc-form-group">
                <label>مركز التكلفة الرئيسي:</label>
                <select className="acc-form-select" value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
                  <option value="">-- اختياري --</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} - {cc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="acc-form-row">
              <div className="acc-form-group" style={{ flex: 2 }}>
                <label>البيان العام / شرح القيد (Narration):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="مثلاً: سداد إيجار صيدلية سموحة لشهر سبتمبر مع استقطاع ضريبة الخصم والإضافة..."
                  required
                />
              </div>

              <div className="acc-form-group" style={{ flex: 1 }}>
                <label>رقم المرجع / المستند (اختياري):</label>
                <input
                  type="text"
                  className="acc-form-input"
                  value={docReference}
                  onChange={(e) => setDocReference(e.target.value)}
                  placeholder="رقم الفاتورة، الشيك، إلخ..."
                />
              </div>
            </div>

            {/* Lines Table */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#f8fafc' }}>
                  تفاصيل وأطراف القيد (المدين والدائن):
                </span>
                <button
                  type="button"
                  className="acc-btn acc-btn-outline"
                  onClick={addLine}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                >
                  ➕ إضافة سطر جديد
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="acc-table" style={{ fontSize: '12.5px', minWidth: '750px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>الحساب المحاسبي</th>
                      <th style={{ width: '15%' }}>مدين (+)</th>
                      <th style={{ width: '15%' }}>دائن (-)</th>
                      <th style={{ width: '25%' }}>شرح السطر</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.id}>
                        <td>
                          <select
                            className="acc-form-select"
                            value={line.account_id}
                            onChange={(e) => handleLineChange(idx, 'account_id', e.target.value)}
                            required
                            style={{ width: '100%', fontSize: '12.5px', padding: '6px 10px' }}
                          >
                            <option value="">-- اختر الحساب المحاسبي --</option>
                            {postingAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.code} - {acc.name_ar}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="acc-form-input"
                            value={line.debit}
                            onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                            placeholder="0.00"
                            style={{ width: '100%', padding: '6px 10px', fontWeight: '700', color: '#34d399' }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="acc-form-input"
                            value={line.credit}
                            onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                            placeholder="0.00"
                            style={{ width: '100%', padding: '6px 10px', fontWeight: '700', color: '#f87171' }}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="acc-form-input"
                            value={line.line_desc}
                            onChange={(e) => handleLineChange(idx, 'line_desc', e.target.value)}
                            placeholder="وصف خاص بالسطر..."
                            style={{ width: '100%', padding: '6px 10px' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="acc-action-icon-btn"
                            onClick={() => removeLine(idx)}
                            style={{ color: '#f43f5e', fontSize: '16px' }}
                            title="حذف هذا السطر"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Live Balance Status Footer */}
            <div className={`acc-entry-balance-status ${isBalanced ? 'balance-matched' : 'balance-unmatched'}`}>
              <div style={{ display: 'flex', gap: '24px' }}>
                <span>إجمالي المدين: <strong>{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</strong></span>
                <span>إجمالي الدائن: <strong>{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</strong></span>
              </div>
              <div>
                {isBalanced ? (
                  <span>✅ القيد متزن 100% ومطابق لمبدأ القيد المزدوج</span>
                ) : (
                  <span>⚠️ غير متزن! الفرق: {difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer">
            <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
              إلغاء
            </button>
            <button
              type="submit"
              className="acc-btn acc-btn-primary"
              disabled={!isBalanced}
              style={{ opacity: isBalanced ? 1 : 0.5, cursor: isBalanced ? 'pointer' : 'not-allowed' }}
            >
              💾 ترحيل وحفظ سند القيد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
