import React, { useState, useMemo } from 'react';

/**
 * JournalEntriesTab.jsx
 * شاشة دفتر قيود اليومية العامة (General Journal Ledger)
 * استعراض القيود المحاسبية، فحص تفاصيل سطور القيد، وطباعة سندات القيد
 */
export default function JournalEntriesTab({
  entries = [],
  accounts = [],
  branches = [],
  costCenters = [],
  onOpenNewEntry,
  onVoidEntry,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [inspectedEntry, setInspectedEntry] = useState(null);

  const getAccountName = (accountId) => {
    const acc = accounts.find((a) => a.id === accountId);
    return acc ? `${acc.code} - ${acc.name_ar}` : accountId;
  };

  const getBranchName = (bId) => {
    if (!bId) return 'عام / بدون فرع';
    const b = branches.find((x) => x.id === bId);
    return b ? b.name : bId;
  };

  const getCostCenterName = (ccId) => {
    if (!ccId) return '—';
    const cc = costCenters.find((x) => x.id === ccId);
    return cc ? `${cc.code} (${cc.name})` : ccId;
  };

  const filteredEntries = useMemo(() => {
    return (entries || []).filter((entry) => {
      if (selectedBranch && entry.branch_id !== selectedBranch) return false;
      if (selectedType !== 'all' && entry.doc_type !== selectedType) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const numMatch = entry.entry_number && entry.entry_number.toLowerCase().includes(q);
        const descMatch = entry.narration && entry.narration.toLowerCase().includes(q);
        const refMatch = entry.doc_reference && entry.doc_reference.toLowerCase().includes(q);
        if (!numMatch && !descMatch && !refMatch) return false;
      }
      return true;
    });
  }, [entries, selectedBranch, selectedType, searchTerm]);

  const handlePrintVoucher = (_entry) => {
    window.print();
  };

  return (
    <div>
      {/* Filters Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="acc-form-input"
            placeholder="بحث برقم السند، البيان، أو المرجع..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />

          <select
            className="acc-filter-select"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="">جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            className="acc-filter-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">جميع أنواع القيود</option>
            <option value="manual">قيد يدوي</option>
            <option value="sale">قيد مبيعات</option>
            <option value="purchase">قيد مشتريات</option>
            <option value="payroll">قيد رواتب</option>
            <option value="transfer">قيد تحويل نقدية</option>
            <option value="expense">قيد مصروفات</option>
          </select>
        </div>

        <button type="button" className="acc-btn acc-btn-primary" onClick={onOpenNewEntry}>
          ➕ إنشاء سند قيد جديد
        </button>
      </div>

      {/* Entries Table */}
      <div className="acc-table-card">
        <table className="acc-table">
          <thead>
            <tr>
              <th style={{ width: '130px' }}>رقم السند</th>
              <th style={{ width: '110px' }}>التاريخ</th>
              <th style={{ width: '100px' }}>النوع</th>
              <th>البيان العام للقيد</th>
              <th style={{ width: '130px' }}>الفرع</th>
              <th style={{ width: '130px' }}>إجمالي القيد</th>
              <th style={{ width: '90px' }}>الحالة</th>
              <th style={{ width: '110px', textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                  لا توجد قيود يومية مسجلة بعد.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="acc-code-badge" style={{ fontSize: '13px' }}>
                      {entry.entry_number}
                    </span>
                  </td>
                  <td>{entry.entry_date}</td>
                  <td>
                    <span style={{ fontSize: '11.5px', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                      {entry.doc_type === 'sale' ? 'مبيعات' :
                       entry.doc_type === 'payroll' ? 'رواتب' :
                       entry.doc_type === 'purchase' ? 'مشتريات' :
                       entry.doc_type === 'transfer' ? 'تحويل نقدية' : 'قيد يدوي'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: '700', color: '#fff' }}>{entry.narration}</div>
                    {entry.doc_reference && (
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>مرجع: {entry.doc_reference}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{getBranchName(entry.branch_id)}</span>
                  </td>
                  <td>
                    <strong style={{ color: '#38bdf8', fontFamily: 'monospace', fontSize: '14px' }}>
                      {Number(entry.total_debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                    <span style={{ fontSize: '10.5px', color: '#64748b', marginRight: '4px' }}>ج.م</span>
                  </td>
                  <td>
                    <span className="status-posted">معتمد مرحل</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="acc-btn acc-btn-outline"
                        onClick={() => setInspectedEntry(entry)}
                        style={{ padding: '4px 8px', fontSize: '11.5px' }}
                        title="معاينة تفاصيل أطراف القيد"
                      >
                        👁️ معاينة
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Entry Detail & Printable Voucher Modal */}
      {inspectedEntry && (
        <div className="acc-modal-overlay" onClick={() => setInspectedEntry(null)}>
          <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="acc-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>📜</span>
                <div>
                  <h2>سند قيد محاسبي: {inspectedEntry.entry_number}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    التاريخ: {inspectedEntry.entry_date} · الفرع: {getBranchName(inspectedEntry.branch_id)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="acc-action-icon-btn"
                onClick={() => setInspectedEntry(null)}
                style={{ fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <div className="acc-modal-body">
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px', borderRadius: '12px', marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>البيان العام للسند:</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#fff', marginTop: '3px' }}>
                  {inspectedEntry.narration}
                </div>
              </div>

              <table className="acc-table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>الحساب المحاسبي</th>
                    <th>مركز التكلفة</th>
                    <th style={{ width: '130px', color: '#34d399' }}>مدين (+)</th>
                    <th style={{ width: '130px', color: '#f87171' }}>دائن (-)</th>
                    <th>شرح السطر</th>
                  </tr>
                </thead>
                <tbody>
                  {(inspectedEntry.lines || []).map((l, i) => (
                    <tr key={i}>
                      <td>
                        <strong style={{ color: '#f8fafc' }}>{getAccountName(l.account_id)}</strong>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{getCostCenterName(l.cost_center_id)}</span>
                      </td>
                      <td style={{ fontWeight: '800', color: l.debit > 0 ? '#34d399' : '#64748b', fontFamily: 'monospace' }}>
                        {l.debit > 0 ? Number(l.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontWeight: '800', color: l.credit > 0 ? '#f87171' : '#64748b', fontFamily: 'monospace' }}>
                        {l.credit > 0 ? Number(l.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{l.line_desc || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.8)', fontWeight: '800' }}>
                    <td colSpan="2" style={{ textAlign: 'left', paddingLeft: '20px' }}>الإجمالي العام للقيد:</td>
                    <td style={{ color: '#34d399', fontFamily: 'monospace', fontSize: '15px' }}>
                      {Number(inspectedEntry.total_debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td style={{ color: '#f87171', fontFamily: 'monospace', fontSize: '15px' }}>
                      {Number(inspectedEntry.total_credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="acc-modal-footer">
              <button
                type="button"
                className="acc-btn acc-btn-outline"
                onClick={() => handlePrintVoucher(inspectedEntry)}
              >
                🖨️ طباعة سند القيد
              </button>
              <button
                type="button"
                className="acc-btn acc-btn-primary"
                onClick={() => setInspectedEntry(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
