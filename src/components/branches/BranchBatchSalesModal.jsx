import React, { useState, useEffect } from 'react';

/**
 * BranchBatchSalesModal.jsx
 * نافذة الإدخال السريع المجمع لمبيعات كافة الفروع ليوم محدد في مصفوفة ذكية واحترافية
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
        existingSaleId: existing?.id || null,
        cashSales: existing?.cashSales !== undefined && existing?.cashSales !== 0 ? String(existing.cashSales) : '',
        visaSales: existing?.visaSales !== undefined && existing?.visaSales !== 0 ? String(existing.visaSales) : '',
        walletSales: existing?.walletSales !== undefined && existing?.walletSales !== 0
          ? String(existing.walletSales)
          : (existing?.electronicWalletSales !== undefined && existing?.electronicWalletSales !== 0 ? String(existing.electronicWalletSales) : ''),
        instapaySales: existing?.instapaySales !== undefined && existing?.instapaySales !== 0 ? String(existing.instapaySales) : '',
        deliverySales: existing?.deliverySales !== undefined && existing?.deliverySales !== 0 ? String(existing.deliverySales) : '',
        totalSales: existing?.totalSales !== undefined && existing?.totalSales !== 0 ? String(existing.totalSales) : '',
        receiptsCount: existing?.receiptsCount !== undefined && existing?.receiptsCount !== 0 ? String(existing.receiptsCount) : '',
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
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        cashSales: '',
        visaSales: '',
        walletSales: '',
        instapaySales: '',
        deliverySales: '',
        totalSales: '',
        receiptsCount: '',
        notes: ''
      }))
    );
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
          id: r.existingSaleId || `sale_${r.branchId}_${targetDate}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
          notes: (r.notes || '').trim(),
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
    <div
      className="modal-overlay"
      style={{
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
        backdropFilter: 'blur(6px)'
      }}
    >
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '1280px',
          width: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          padding: '0',
          background: '#ffffff',
          direction: 'rtl',
          overflow: 'hidden'
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '24px',
                background: 'rgba(255,255,255,0.2)',
                padding: '10px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ⚡
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#ffffff' }}>
                الإدخال السريع المجمع لمبيعات الفروع
              </h3>
              <p style={{ margin: '3px 0 0 0', opacity: 0.9, fontSize: '12.5px', color: '#ccfbf1' }}>
                تسجيل ومطابقة مبيعات كافة فروع وصيدليات المجموعة ليوم محدد في شاشة واحدة منظمة
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(4px)',
                padding: '6px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.3)'
              }}
            >
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#ffffff' }}>📅 تاريخ المبيعات:</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: '800',
                  color: '#0f766e',
                  background: '#ffffff',
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              style={{
                color: '#ffffff',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: '16px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                cursor: 'pointer'
              }}
              title="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Quick Summary & Helpers Bar */}
        <div
          style={{
            padding: '12px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleClearAll}
              className="btn btn-ghost"
              style={{
                fontSize: '12px',
                fontWeight: '700',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                color: '#475569',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <span>🧹</span> تفريغ الحقول
            </button>

            <span style={{ fontSize: '13px', color: '#64748b' }}>
              عدد الفروع: <strong style={{ color: '#0f172a' }}>{branches.length}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '13px',
                color: '#475569',
                background: '#ffffff',
                padding: '5px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}
            >
              🧾 إجمالي الفواتير: <strong style={{ color: '#0f766e' }}>{batchReceiptsTotal}</strong>
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: '900',
                color: '#065f46',
                background: '#dcfce7',
                padding: '6px 16px',
                borderRadius: '10px',
                border: '1px solid #86efac',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.15)'
              }}
            >
              💎 إجمالي مبيعات اليوم: {batchGrandTotal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
            </span>
          </div>
        </div>

        {/* Matrix Grid Table Container */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            className="table-responsive"
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              padding: '16px 24px',
              background: '#ffffff'
            }}
          >
            <table
              className="bylaws-table"
              style={{
                width: '100%',
                minWidth: '1160px',
                borderCollapse: 'separate',
                borderSpacing: '0',
                textAlign: 'center',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden'
              }}
            >
              <thead>
                <tr
                  style={{
                    background: '#0f766e',
                    color: '#ffffff',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <th style={{ padding: '12px 10px', fontSize: '13px', fontWeight: '800', width: '180px', minWidth: '180px', textAlign: 'right' }}>
                    🏢 الفرع
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '105px', minWidth: '105px' }}>
                    💵 كاش (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '105px', minWidth: '105px' }}>
                    💳 فيزا (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '105px', minWidth: '105px' }}>
                    📱 محفظة (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '105px', minWidth: '105px' }}>
                    ⚡ إنستاباي (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '105px', minWidth: '105px' }}>
                    🛵 دليفري (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '900', width: '130px', minWidth: '130px', background: '#115e59' }}>
                    💎 الإجمالي (ج.م)
                  </th>
                  <th style={{ padding: '12px 6px', fontSize: '13px', fontWeight: '800', width: '85px', minWidth: '85px' }}>
                    🧾 الفواتير
                  </th>
                  <th style={{ padding: '12px 10px', fontSize: '13px', fontWeight: '800', width: '185px', minWidth: '185px', textAlign: 'right' }}>
                    📝 ملاحظات
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.branchId}
                    style={{
                      background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    {/* Branch Name */}
                    <td style={{ padding: '8px 12px', fontWeight: '800', fontSize: '13px', textAlign: 'right', color: '#0f172a', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px' }}>🏢</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.branchName}>
                          {row.branchName}
                        </span>
                      </div>
                    </td>

                    {/* Cash */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.cashSales}
                        onChange={(e) => handleRowChange(idx, 'cashSales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #86efac',
                          background: '#f0fdf4',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#166534',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Visa */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.visaSales}
                        onChange={(e) => handleRowChange(idx, 'visaSales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #93c5fd',
                          background: '#eff6ff',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#1e40af',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Wallet */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.walletSales}
                        onChange={(e) => handleRowChange(idx, 'walletSales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #d8b4fe',
                          background: '#faf5ff',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#6b21a8',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* InstaPay */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.instapaySales}
                        onChange={(e) => handleRowChange(idx, 'instapaySales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #7dd3fc',
                          background: '#f0f9ff',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#0369a1',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Delivery */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.deliverySales}
                        onChange={(e) => handleRowChange(idx, 'deliverySales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #fcd34d',
                          background: '#fffbeb',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#b45309',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Total (Highlighted) */}
                    <td style={{ padding: '6px 4px', background: '#ecfdf5', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={row.totalSales}
                        onChange={(e) => handleRowChange(idx, 'totalSales', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '2px solid #059669',
                          fontSize: '13.5px',
                          textAlign: 'center',
                          fontWeight: '900',
                          color: '#065f46',
                          background: '#ffffff',
                          boxShadow: '0 1px 3px rgba(5, 150, 105, 0.2)',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Receipts Count */}
                    <td style={{ padding: '6px 4px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={row.receiptsCount}
                        onChange={(e) => handleRowChange(idx, 'receiptsCount', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 6px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '13px',
                          textAlign: 'center',
                          fontWeight: '700',
                          color: '#334155',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>

                    {/* Notes */}
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>
                      <input
                        type="text"
                        placeholder="ملاحظات الفرع..."
                        value={row.notes}
                        onChange={(e) => handleRowChange(idx, 'notes', e.target.value)}
                        style={{
                          width: '100%',
                          height: '36px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: '12.5px',
                          color: '#1e293b',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Buttons & Footer Summary */}
          <div
            style={{
              padding: '14px 24px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
              <span style={{ fontSize: '16px' }}>💡</span>
              <span>
                يمكنك إدخال قنوات التحصيل (كاش، فيزا، محفظة، إنستاباي، دليفري) ليُحسب الإجمالي آلياً، أو كتابة الإجمالي مباشرة في خانته الخضراء.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                style={{
                  padding: '9px 20px',
                  fontSize: '13.5px',
                  fontWeight: '700',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="btn btn-start"
                style={{
                  padding: '9px 26px',
                  fontSize: '14px',
                  fontWeight: '900',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(15, 118, 110, 0.3)',
                  cursor: 'pointer'
                }}
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
