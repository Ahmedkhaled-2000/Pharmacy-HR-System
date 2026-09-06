import React, { useState, useEffect } from 'react';

/**
 * BranchBatchSalesModal.jsx
 * نافذة الإدخال السريع المجمع لمبيعات كافة الفروع ليوم محدد في جدول مصفوفي ذكي
 */
export default function BranchBatchSalesModal({
  isOpen,
  onClose,
  onSaveBatch,
  branches = [],
  existingSales = []
}) {
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);

  // Initialize or re-populate rows when targetDate or isOpen changes
  useEffect(() => {
    if (!isOpen) return;

    // Find any existing sales recorded for this date
    const dateSalesMap = {};
    existingSales.forEach((s) => {
      if (s && s.date === targetDate) {
        dateSalesMap[String(s.branchId)] = s;
      }
    });

    const initialRows = branches.map((b) => {
      const bId = String(b.id);
      const existing = dateSalesMap[bId];
      return {
        branchId: bId,
        branchName: b.name || b.branchName || `فرع ${bId}`,
        branchCode: b.code || b.branchCode || '',
        cashSales: existing?.cashSales !== undefined ? String(existing.cashSales) : '',
        visaSales: existing?.visaSales !== undefined ? String(existing.visaSales) : '',
        walletSales: existing?.walletSales !== undefined ? String(existing.walletSales) : (existing?.electronicWalletSales !== undefined ? String(existing.electronicWalletSales) : ''),
        instapaySales: existing?.instapaySales !== undefined ? String(existing.instapaySales) : '',
        deliverySales: existing?.deliverySales !== undefined ? String(existing.deliverySales) : '',
        totalSales: existing?.totalSales !== undefined ? String(existing.totalSales) : '',
        receiptsCount: existing?.receiptsCount !== undefined ? String(existing.receiptsCount) : '',
        notes: existing?.notes || ''
      };
    });

    setRows(initialRows);
  }, [isOpen, targetDate, branches, existingSales]);

  if (!isOpen) return null;

  const handleRowChange = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      const r = { ...next[index], [field]: value };

      // Auto-compute total if any payment channel changes
      if (['cashSales', 'visaSales', 'walletSales', 'instapaySales', 'deliverySales'].includes(field)) {
        const c = parseFloat(field === 'cashSales' ? value : r.cashSales) || 0;
        const v = parseFloat(field === 'visaSales' ? value : r.visaSales) || 0;
        const w = parseFloat(field === 'walletSales' ? value : r.walletSales) || 0;
        const ip = parseFloat(field === 'instapaySales' ? value : r.instapaySales) || 0;
        const d = parseFloat(field === 'deliverySales' ? value : r.deliverySales) || 0;
        const sum = c + v + w + ip + d;
        if (sum > 0 || (r.cashSales !== '' || r.visaSales !== '' || r.walletSales !== '' || r.instapaySales !== '' || r.deliverySales !== '')) {
          r.totalSales = sum > 0 ? String(sum) : '';
        }
      }

      next[index] = r;
      return next;
    });
  };

  // Quick helper: Clear all fields
  const handleClearAll = () => {
    if (!window.confirm('هل أنت متأكد من مسح كافة القيم المدخلة في الجدول؟')) return;
    setRows((prev) => prev.map((r) => ({
      ...r,
      cashSales: '',
      visaSales: '',
      walletSales: '',
      instapaySales: '',
      deliverySales: '',
      totalSales: '',
      receiptsCount: '',
      notes: ''
    })));
  };

  const handleSave = (e) => {
    e.preventDefault();

    // Filter rows that have at least some entry
    const validSalesToSave = [];
    rows.forEach((r) => {
      const tot = parseFloat(r.totalSales) || (
        (parseFloat(r.cashSales) || 0) +
        (parseFloat(r.visaSales) || 0) +
        (parseFloat(r.walletSales) || 0) +
        (parseFloat(r.instapaySales) || 0) +
        (parseFloat(r.deliverySales) || 0)
      );

      if (tot > 0 || r.totalSales !== '' || r.cashSales !== '' || r.visaSales !== '' || r.walletSales !== '' || r.instapaySales !== '') {
        const c = parseFloat(r.cashSales) || 0;
        const v = parseFloat(r.visaSales) || 0;
        const w = parseFloat(r.walletSales) || 0;
        const ip = parseFloat(r.instapaySales) || 0;
        const d = parseFloat(r.deliverySales) || 0;
        const rec = parseInt(r.receiptsCount, 10) || 0;
        const avg = rec > 0 ? parseFloat((tot / rec).toFixed(2)) : 0;

        validSalesToSave.push({
          id: `sale_${r.branchId}_${targetDate}`,
          branchId: r.branchId,
          branchName: r.branchName,
          date: targetDate,
          month: targetDate.slice(0, 7),
          totalSales: parseFloat(tot.toFixed(2)),
          cashSales: parseFloat(c.toFixed(2)),
          visaSales: parseFloat(v.toFixed(2)),
          walletSales: parseFloat(w.toFixed(2)),
          instapaySales: parseFloat(ip.toFixed(2)),
          deliverySales: parseFloat(d.toFixed(2)),
          creditSales: 0,
          receiptsCount: rec,
          averageBasket: avg,
          shiftManager: '',
          notes: r.notes.trim(),
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: 'admin_batch'
        });
      }
    });

    if (validSalesToSave.length === 0) {
      alert('⚠️ لم يتم إدخال أي مبيعات لأي فرع لحفظها');
      return;
    }

    onSaveBatch(validSalesToSave);
    onClose();
  };

  // Grand total calculation for this batch
  const batchGrandTotal = rows.reduce((acc, r) => {
    const tot = parseFloat(r.totalSales) || (
      (parseFloat(r.cashSales) || 0) +
      (parseFloat(r.visaSales) || 0) +
      (parseFloat(r.walletSales) || 0) +
      (parseFloat(r.instapaySales) || 0) +
      (parseFloat(r.deliverySales) || 0)
    );
    return acc + tot;
  }, 0);

  const batchReceiptsTotal = rows.reduce((acc, r) => acc + (parseInt(r.receiptsCount, 10) || 0), 0);

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
        maxWidth: '1050px',
        width: '100%',
        maxHeight: '94vh',
        overflowY: 'auto',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '24px',
        background: 'var(--surface, #ffffff)',
        direction: 'rtl'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px', background: '#eff6ff', padding: '8px', borderRadius: '12px' }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: '800' }}>
                الإدخال السريع المجمع لمبيعات الفروع
              </h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12.5px' }}>
                تسجيل مبيعات كل صيدليات المجموعة ليوم محدد في شاشة واحدة بضغطة زر
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e' }}>📅 يوم الإدخال:</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
              />
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
        </div>

        {/* Action / Helper Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleClearAll}
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              🧹 تفريغ الحقول
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              الفروع: <strong>{branches.length}</strong>
            </span>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f766e', background: '#ecfdf5', padding: '4px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              إجمالي مبيعات اليوم: {batchGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
            </span>
          </div>
        </div>

        {/* Matrix Grid Table */}
        <form onSubmit={handleSave}>
          <div className="table-responsive" style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <table className="bylaws-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#0f766e', color: '#ffffff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '150px' }}>الفرع</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '105px' }}>💵 كاش (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '105px' }}>💳 فيزا (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '105px' }}>📱 محفظة (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '105px' }}>⚡ إنستاباي (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '105px' }}>🛵 دليفري (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '125px', background: '#115e59' }}>💎 الإجمالي (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '85px' }}>🧾 الفواتير</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '130px' }}>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.branchId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px', fontWeight: '700', fontSize: '13px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>🏢</span>
                        <span>{row.branchName}</span>
                      </div>
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.cashSales}
                        onChange={(e) => handleRowChange(idx, 'cashSales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.visaSales}
                        onChange={(e) => handleRowChange(idx, 'visaSales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.walletSales}
                        onChange={(e) => handleRowChange(idx, 'walletSales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #ddd6fe', background: '#faf5ff', fontSize: '13px', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.instapaySales}
                        onChange={(e) => handleRowChange(idx, 'instapaySales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #bae6fd', background: '#f0f9ff', fontSize: '13px', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.deliverySales}
                        onChange={(e) => handleRowChange(idx, 'deliverySales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center', fontWeight: '700' }}
                      />
                    </td>

                    <td style={{ padding: '6px', background: '#f0fdf4' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.totalSales}
                        onChange={(e) => handleRowChange(idx, 'totalSales', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1.5px solid #16a34a', fontSize: '13.5px', textAlign: 'center', fontWeight: '800', color: '#166534', background: '#ffffff' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={row.receiptsCount}
                        onChange={(e) => handleRowChange(idx, 'receiptsCount', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', textAlign: 'center' }}
                      />
                    </td>

                    <td style={{ padding: '6px' }}>
                      <input
                        type="text"
                        placeholder="ملاحظات..."
                        value={row.notes}
                        onChange={(e) => handleRowChange(idx, 'notes', e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Buttons & Footer Summary */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              💡 يمكنك إدخال الكاش، الفيزا، المحفظة الإلكترونية، إنستاباي، والدليفري ليتم احتساب الإجمالي آلياً، أو إدخال الإجمالي مباشرة في خانته الخضراء.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
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
                💾 حفظ مبيعات كافة الفروع ({targetDate})
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
