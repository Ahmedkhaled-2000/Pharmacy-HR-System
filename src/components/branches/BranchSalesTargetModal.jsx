import React, { useState, useEffect } from 'react';
import { getDaysInMonth } from '../../utils/salesEngine';

/**
 * BranchSalesTargetModal.jsx
 * نافذة تحديد وضبط التارجت المستهدف الشهري واليومي لكل فرع
 */
export default function BranchSalesTargetModal({
  isOpen,
  onClose,
  onSaveTargets,
  branches = [],
  currentTargets = {},
  initialMonth = ''
}) {
  const [targetMonth, setTargetMonth] = useState(() => initialMonth || new Date().toISOString().slice(0, 7));
  const [branchTargets, setBranchTargets] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const monthKey = targetMonth || initialMonth || new Date().toISOString().slice(0, 7);
    const existing = currentTargets[monthKey] || {};
    
    const initialMap = {};
    branches.forEach((b) => {
      const bId = String(b.id);
      initialMap[bId] = existing[bId] !== undefined ? String(existing[bId]) : '';
    });
    setBranchTargets(initialMap);
  }, [isOpen, targetMonth, initialMonth, branches, currentTargets]);

  if (!isOpen) return null;

  const daysInMonth = getDaysInMonth(targetMonth);

  const handleTargetChange = (branchId, val) => {
    setBranchTargets((prev) => ({
      ...prev,
      [branchId]: val
    }));
  };

  // Quick helper: Set same target to all
  const handleSetSameToAll = () => {
    const val = prompt('أدخل مبلغ التارجت الشهري لتعميمه على كافة الفروع (ج.م):');
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      alert('يرجى إدخال مبلغ صحيح');
      return;
    }
    const updated = {};
    branches.forEach((b) => {
      updated[String(b.id)] = String(num);
    });
    setBranchTargets(updated);
  };

  // Quick helper: Copy from previous month
  const handleCopyPreviousMonth = () => {
    const [y, m] = targetMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonthKey = prevDate.toISOString().slice(0, 7);
    const prevTargets = currentTargets[prevMonthKey];

    if (!prevTargets || Object.keys(prevTargets).length === 0) {
      alert(`⚠️ لا توجد أهداف تارجت مسجلة للشهر السابق (${prevMonthKey})`);
      return;
    }

    const updated = {};
    branches.forEach((b) => {
      const bId = String(b.id);
      if (prevTargets[bId] !== undefined) {
        updated[bId] = String(prevTargets[bId]);
      }
    });
    setBranchTargets((prev) => ({ ...prev, ...updated }));
    alert(`✅ تم نسخ أهداف التارجت من شهر ${prevMonthKey} بنجاح`);
  };

  // Calculate total monthly target
  let totalTargetSum = 0;
  Object.values(branchTargets).forEach((t) => {
    totalTargetSum += (parseFloat(t) || 0);
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanMap = {};
    Object.entries(branchTargets).forEach(([bId, amt]) => {
      const num = parseFloat(amt) || 0;
      cleanMap[bId] = num;
    });

    onSaveTargets(targetMonth, cleanMap);
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
        maxWidth: '850px',
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px', background: '#ecfdf5', padding: '8px', borderRadius: '12px' }}>🎯</span>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '18px', fontWeight: '800' }}>
                تحديد وضبط التارجت المستهدف للفروع
              </h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12.5px' }}>
                تحديد الهدف البيعي الشهري وحساب التارجت اليومي التقديري لكل صيدلية
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e' }}>📅 شهر التارجت:</label>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
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

        {/* Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleSetSameToAll}
              className="btn btn-ghost"
              style={{ fontSize: '12.5px', padding: '6px 12px', border: '1px solid var(--border)', color: '#0284c7', background: '#f0f9ff' }}
            >
              ⚡ تعميم مبلغ موحد لكافة الفروع
            </button>
            <button
              type="button"
              onClick={handleCopyPreviousMonth}
              className="btn btn-ghost"
              style={{ fontSize: '12.5px', padding: '6px 12px', border: '1px solid var(--border)', color: '#0f766e', background: '#f0fdf4' }}
            >
              📋 نسخ من الشهر السابق
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              أيام الشهر: <strong>{daysInMonth} يوم</strong>
            </span>
            <span style={{ fontSize: '14px', fontWeight: '800', color: '#0f766e', background: '#ecfdf5', padding: '4px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              إجمالي تارجت المجموعة: {totalTargetSum.toLocaleString('ar-EG', { minimumFractionDigits: 0 })} ج.م
            </span>
          </div>
        </div>

        {/* Targets Table */}
        <form onSubmit={handleSubmit}>
          <div className="table-responsive" style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <table className="bylaws-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#0f766e', color: '#ffffff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px', fontSize: '12.5px', textAlign: 'right', minWidth: '180px' }}>الفرع</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '170px' }}>🎯 التارجت الشهري (ج.م)</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '140px' }}>📅 التارجت اليومي التقديري</th>
                  <th style={{ padding: '10px', fontSize: '12.5px', minWidth: '120px' }}>نسبة من إجمالي المجموعة</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b, idx) => {
                  const bId = String(b.id);
                  const currentVal = branchTargets[bId] || '';
                  const numVal = parseFloat(currentVal) || 0;
                  const dailyNeeded = daysInMonth > 0 ? (numVal / daysInMonth).toFixed(0) : 0;
                  const sharePct = totalTargetSum > 0 ? ((numVal / totalTargetSum) * 100).toFixed(1) : 0;

                  return (
                    <tr key={bId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '700', fontSize: '13px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>🏢</span>
                          <div>
                            <div>{b.name || b.branchName || `فرع ${bId}`}</div>
                            {b.branchCode && (
                              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal' }}>كود: {b.branchCode}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="0"
                            value={currentVal}
                            onChange={(e) => handleTargetChange(bId, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              border: '1.5px solid #0d9488',
                              fontSize: '14px',
                              fontWeight: '800',
                              textAlign: 'center',
                              color: '#0f766e',
                              background: '#ffffff'
                            }}
                          />
                          <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: 'var(--muted)', pointerEvents: 'none', fontWeight: 'bold' }}>
                            ج.م
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '8px', fontWeight: '700', fontSize: '13px', color: '#1e293b' }}>
                        {numVal > 0 ? (
                          <span style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            {parseFloat(dailyNeeded).toLocaleString('ar-EG')} ج.م / يوم
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '8px', fontWeight: '700', fontSize: '13px', color: '#0369a1' }}>
                        {totalTargetSum > 0 && numVal > 0 ? `${sharePct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
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
              💾 حفظ تارجت شهر ({targetMonth})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
