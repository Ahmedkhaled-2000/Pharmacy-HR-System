import React, { useState } from 'react';
import { todayStr } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';

export default function EmployeeShiftSwapModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth,
  selectedBranchId
}) {
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [targetEmpId, setTargetEmpId] = useState('');
  const [swapDate, setSwapDate] = useState(todayStr());
  const [targetSwapDate, setTargetSwapDate] = useState(todayStr());
  const [swapNotes, setSwapNotes] = useState('');

  const employees = state.employees || [];
  const currentBranchId = selectedBranchId || emp.branchId;
  const colleagues = employees.filter((e) => e.id !== emp.id && (e.branchId === currentBranchId || (e.branchesDetails && e.branchesDetails.some(bd => bd.branchId === currentBranchId))));

  const empIdStr = String(emp.id || '').trim();
  const empCodeStr = String(emp.code || '').trim();

  // Swap Requests involving this employee
  const swapRequests = (state.shiftSwaps || state.requests || []).filter((r) => {
    const isSwap = r.type === 'shift_swap' || r.type === 'swap';
    if (!isSwap) return false;
    const rReqId = String(r.requesterEmpId || r.employeeId || '');
    const rTarId = String(r.targetEmpId || '');
    const matchesReq = rReqId === empIdStr || (empCodeStr && rReqId === empCodeStr);
    const matchesTar = rTarId === empIdStr || (empCodeStr && rTarId === empCodeStr);
    return matchesReq || matchesTar;
  }).sort((a, b) => {
    const getT = (r) => {
      if (!r) return 0;
      if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.swapDate) { const t = new Date(r.swapDate).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
      return 0;
    };
    return getT(b) - getT(a);
  });

  const incomingSwaps = swapRequests.filter(
    (r) => r.targetEmpId === emp.id && r.status === 'pending_target'
  );

  // Submit Shift Swap Request
  const handleSubmitSwap = async (e) => {
    e.preventDefault();
    if (!targetEmpId) {
      showToast('يرجى اختيار الزميل المراد تبديل الشيفت معه');
      return;
    }
    const targetEmpObj = employees.find((e) => e.id === targetEmpId);

    const newSwapReq = {
      id: 'swap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'shift_swap',
      employeeId: emp.id,
      requesterEmpId: emp.id,
      requesterEmpName: emp.name,
      targetEmpId,
      targetEmpName: targetEmpObj ? targetEmpObj.name : '',
      branchId: currentBranchId,
      requesterDate: swapDate,
      targetDate: targetSwapDate,
      notes: swapNotes.trim(),
      status: 'pending_target',
      createdAt: new Date().toISOString()
    };

    const updatedSwaps = [newSwapReq, ...(state.shiftSwaps || [])];
    const updatedRequests = [newSwapReq, ...(state.requests || [])];
    const updatedState = { ...state, shiftSwaps: updatedSwaps, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newSwapReq, empName: emp.name });

    setShowSwapModal(false);
    setSwapNotes('');
    setTargetEmpId('');
    showToast(`تم إرسال طلب التبديل إلى الزميل ${targetEmpObj ? targetEmpObj.name : ''} للموافقة المبدئية 🔄`);
  };

  // Handle Employee B Action (Accept/Reject incoming swap request)
  const handleTargetSwapAction = async (swapId, action) => {
    const targetStatus = action === 'accept' ? 'pending_admin' : 'rejected';

    const updatedSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === swapId ? { ...s, status: targetStatus, targetRespondedAt: new Date().toISOString() } : s
    );
    const updatedRequests = (state.requests || []).map((r) =>
      r.id === swapId ? { ...r, status: targetStatus, targetRespondedAt: new Date().toISOString() } : r
    );

    const updatedState = { ...state, shiftSwaps: updatedSwaps, requests: updatedRequests };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    const targetSwapReq = (state.shiftSwaps || []).find(s => s.id === swapId);
    if (action === 'accept' && targetSwapReq) {
      notifyAdminOnNewRequest({ state: updatedState, newRequest: targetSwapReq, empName: emp.name });
    }

    showToast(
      action === 'accept'
        ? 'تمت الموافقة على طلب التبديل وإحالته للإدارة العليا ومدير الفرع للاعتماد النهائي ✅'
        : 'تم رفض طلب تبديل الشيفت ❌'
    );
  };

  const statusBadge = (status) => {
    if (status === 'pending_target') return <span className="badge warning">⏳ بانتظار رد الزميل</span>;
    if (status === 'pending_admin') return <span className="badge info">⏳ بانتظار اعتماد الإدارة</span>;
    if (status === 'approved') return <span className="badge success">✅ معتمد</span>;
    if (status === 'rejected') return <span className="badge danger">❌ مرفوض</span>;
    return <span className="badge secondary">{status}</span>;
  };

  return (
    <div className="card ep-tab-content fade-in">
      {/* Header */}
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>🔄</span>
          <div>
            <h3 style={{ margin: 0 }}>تبديل الشيفتات مع الزملاء</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              تقديم طلبات تبديل الشيفت مع الزملاء — يتطلب موافقة الزميل ثم مدير الفرع والإدارة العليا
            </p>
          </div>
        </div>

        <button
          className="btn btn-start"
          onClick={() => setShowSwapModal(!showSwapModal)}
          style={{ fontSize: '13px', padding: '6px 16px' }}
        >
          {showSwapModal ? '✕ إغلاق' : '+ طلب تبديل جديد'}
        </button>
      </div>

      {/* Incoming Swap Requests Alert */}
      {incomingSwaps.length > 0 && (
        <div style={{ margin: '16px 0', padding: '14px', background: 'rgba(234,179,8,0.1)', border: '1px solid #eab308', borderRadius: '10px' }}>
          <h5 style={{ margin: '0 0 10px', color: '#854d0e', fontSize: '14px' }}>
            🔔 طلبات تبديل واردة إليك — بانتظار ردك ({incomingSwaps.length})
          </h5>
          {incomingSwaps.map((s) => (
            <div
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}
            >
              <div>
                <strong style={{ color: 'var(--primary)' }}>{s.requesterEmpName}</strong> يطلب التبديل معك:
                <div style={{ fontSize: '13px', marginTop: '2px' }}>
                  شيفت الزميل يوم <strong>{s.requesterDate}</strong> ↔️ شيفتك يوم <strong>{s.targetDate}</strong>
                </div>
                {s.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>ملاحظات: {s.notes}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-start" onClick={() => handleTargetSwapAction(s.id, 'accept')} style={{ padding: '5px 14px', fontSize: '12.5px' }}>
                  ✅ قبول
                </button>
                <button className="del-btn" onClick={() => handleTargetSwapAction(s.id, 'reject')} style={{ padding: '5px 12px', fontSize: '12.5px' }}>
                  ✕ رفض
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Swap Form */}
      {showSwapModal && (
        <form
          onSubmit={handleSubmitSwap}
          className="card settings-card fade-in"
          style={{ padding: '18px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', margin: '16px 0 20px' }}
        >
          <h5 style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--primary)' }}>🔄 بيانات طلب تبديل الشيفت</h5>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label style={{ fontWeight: '700' }}>الزميل المراد التبديل معه</label>
              <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)} required>
                <option value="">-- اختر الزميل --</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.jobTitle})
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: '1 1 140px' }}>
              <label style={{ fontWeight: '700' }}>تاريخ شيفتك أنت</label>
              <input type="date" value={swapDate} onChange={(e) => setSwapDate(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 140px' }}>
              <label style={{ fontWeight: '700' }}>تاريخ شيفت الزميل</label>
              <input type="date" value={targetSwapDate} onChange={(e) => setTargetSwapDate(e.target.value)} required />
            </div>
          </div>

          <div className="field" style={{ marginTop: '10px' }}>
            <label style={{ fontWeight: '700' }}>سبب التبديل / ملاحظات</label>
            <input
              type="text"
              placeholder="سبب التبديل..."
              value={swapNotes}
              onChange={(e) => setSwapNotes(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', background: 'rgba(59,130,246,0.08)', padding: '8px 12px', borderRadius: '6px' }}>
            ℹ️ مرحلة الموافقة: <strong>1. موافقة الزميل</strong> ➔ <strong>2. اعتماد مدير الفرع + الإدارة العليا</strong> ➔ <strong>3. تحديث الـ Roster تلقائياً</strong>
          </div>

          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowSwapModal(false)}>إلغاء</button>
            <button type="submit" className="btn btn-start">💾 إرسال طلب التبديل</button>
          </div>
        </form>
      )}

      {/* Swap Requests Log Table */}
      <div style={{ marginTop: '20px' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>📋 سجل طلبات التبديل</h4>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الموظف الطالب</th>
                <th>الزميل البديل</th>
                <th>شيفت الطالب</th>
                <th>شيفت البديل</th>
                <th>حالة الطلب</th>
                <th>ملاحظات</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {swapRequests.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="8">لا توجد طلبات تبديل شيفتات مسجلة</td>
                </tr>
              ) : (
                swapRequests.map((s, idx) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 'bold' }}>{s.requesterEmpName || emp.name}</td>
                    <td>{s.targetEmpName || '—'}</td>
                    <td>{s.requesterDate || '—'}</td>
                    <td>{s.targetDate || '—'}</td>
                    <td>{statusBadge(s.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{s.notes || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {s.createdAt ? s.createdAt.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
