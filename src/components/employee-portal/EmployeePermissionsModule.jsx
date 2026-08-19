import React, { useState } from 'react';
import { todayStr, fmt } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';

export default function EmployeePermissionsModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
  const [permType, setPermType] = useState('late'); // 'late' | 'early'
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [reason, setReason] = useState('');
  const [showForm, setShowForm] = useState(false);

  const empIdStr = String(emp.id || '').trim();
  const empCodeStr = String(emp.code || '').trim();

  const employeePermRequests = (state.requests || []).filter(
    (r) => (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr)) && r.type === 'permission'
  ).sort((a, b) => {
    const getT = (r) => {
      if (!r) return 0;
      if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
      return 0;
    };
    return getT(b) - getT(a);
  });

  // Calculate duration in minutes/hours
  const calcDuration = () => {
    if (!startTime || !endTime) return { minutes: 0, text: '0 دقيقة' };
    const [h1, m1] = startTime.split(':').map(Number);
    const [h2, m2] = endTime.split(':').map(Number);
    let start = h1 * 60 + m1;
    let end = h2 * 60 + m2;
    if (end <= start) end += 24 * 60;
    const diff = end - start;
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    let text = '';
    if (hrs > 0) text += `${hrs} ساعة `;
    if (mins > 0) text += `${mins} دقيقة`;
    return { minutes: diff, text: text || '0 دقيقة' };
  };

  const durationObj = calcDuration();

  const handleSubmitPermission = async (e) => {
    e.preventDefault();
    if (!date || !startTime || !endTime) {
      showToast('يرجى تحديد التاريخ والوقت من وإلى');
      return;
    }

    if (durationObj.minutes <= 0) {
      showToast('مدة الإذن يجب أن تكون أكبر من صفر');
      return;
    }

    const newPermReq = {
      id: 'perm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: selectedBranchId || emp.branchId,
      type: 'permission',
      permType, // 'late' or 'early'
      date,
      startTime,
      endTime,
      durationMinutes: durationObj.minutes,
      durationText: durationObj.text,
      reason: reason.trim(),
      targetApproval: 'branch_and_admin',
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const updatedRequests = [newPermReq, ...(state.requests || [])];
    const updatedState = { ...state, requests: updatedRequests };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newPermReq, empName: emp.name });

    setShowForm(false);
    setReason('');
    showToast('تم إرسال طلب الإذن للاعتماد (لا يؤثر على الراتب وتحتسب وردية كاملة عند الموافقة) ⏰');
  };

  return (
    <div className="card ep-tab-content fade-in">
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>⏰</span>
          <div>
            <h3 style={{ margin: 0 }}>طلب الأذونات (تأخير / خروج مبكر)</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              عند موافقة الإدارة لا يتأثر الراتب بهذا الوقت وتحتسب وردية كاملة
            </p>
          </div>
        </div>

        <button
          className="btn btn-start"
          onClick={() => setShowForm(!showForm)}
          style={{ fontSize: '13px', padding: '7px 16px' }}
        >
          {showForm ? '✕ إغلاق النموذج' : '+ تقديم طلب إذن جديد'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmitPermission} className="card settings-card fade-in" style={{ padding: '16px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginTop: '16px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '15px', color: 'var(--primary)' }}>⏰ طلب إذن جديد</h4>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label style={{ fontWeight: '700' }}>نوع الإذن</label>
              <select value={permType} onChange={(e) => setPermType(e.target.value)}>
                <option value="late">🚶‍♂️ إذن تأخير عن الحضور</option>
                <option value="early">🏃‍♂️ إذن خروج مبكر</option>
              </select>
            </div>

            <div className="field" style={{ flex: '1 1 140px' }}>
              <label style={{ fontWeight: '700' }}>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 120px' }}>
              <label style={{ fontWeight: '700' }}>من الساعة</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 120px' }}>
              <label style={{ fontWeight: '700' }}>إلى الساعة</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 120px' }}>
              <label style={{ fontWeight: '700' }}>المدة المحسوبة</label>
              <input type="text" readOnly value={durationObj.text} style={{ fontWeight: 'bold', background: '#e2e8f0', textAlign: 'center' }} />
            </div>
          </div>

          <div className="field" style={{ marginTop: '12px' }}>
            <label style={{ fontWeight: '700' }}>سبب الإذن (اختياري)</label>
            <input
              type="text"
              placeholder="اكتب سبب طلب الإذن..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', fontSize: '13px', color: '#047857', fontWeight: '600' }}>
            ✨ تنبيه: عند اعتماده من قبل الإدارة، لا يتم الخصم من الراتب عن هذا الوقت وتحتسب وردية العمل كاملة.
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>إلغاء</button>
            <button type="submit" className="btn btn-start">💾 إرسال طلب الإذن</button>
          </div>
        </form>
      )}

      {/* ── Table of Permission Requests ── */}
      <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل طلبات الأذونات المقدمة</h4>
      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>نوع الإذن</th>
              <th>التاريخ</th>
              <th>من - إلى</th>
              <th>المدة</th>
              <th>حالة الأثر المالي</th>
              <th>حالة الطلب</th>
              <th>السبب</th>
              <th>تاريخ التقديم</th>
            </tr>
          </thead>
          <tbody>
            {employeePermRequests.length === 0 ? (
              <tr className="empty-row">
                <td colSpan="9">لا توجد طلبات أذونات مسجلة سابقاً</td>
              </tr>
            ) : (
              employeePermRequests.map((r, idx) => (
                <tr key={r.id}>
                  <td>{idx + 1}</td>
                  <td>
                    {r.permType === 'late' ? (
                      <span className="badge warning">🚶‍♂️ إذن تأخير</span>
                    ) : (
                      <span className="badge info">🏃‍♂️ إذن خروج مبكر</span>
                    )}
                  </td>
                  <td>{r.date}</td>
                  <td style={{ fontWeight: 'bold' }}>{r.startTime} ➔ {r.endTime}</td>
                  <td>{r.durationText || `${r.durationMinutes} دقيقة`}</td>
                  <td>
                    {r.status === 'approved' ? (
                      <span className="badge success">🟢 محتسبة وردية كاملة (لا خصم)</span>
                    ) : (
                      <span className="badge secondary">قيد الاعتماد</span>
                    )}
                  </td>
                  <td>
                    {r.status === 'approved' && <span className="badge success">✅ معتمد</span>}
                    {r.status === 'rejected' && <span className="badge danger">❌ مرفوض</span>}
                    {r.status === 'pending' && <span className="badge warning">⏳ قيد الانتظار</span>}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{r.reason || '—'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                    {r.createdAt ? r.createdAt.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
