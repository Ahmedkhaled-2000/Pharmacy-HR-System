import React, { useState } from 'react';
import { fmt } from '../../utils/formatters';
import { getRealTodayStr } from '../../utils/timeEngine';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { shouldRouteDirectToAdmin } from '../../utils/jobsHelper';

export default function EmployeePermissionsModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  React.useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [permType, setPermType] = useState('late'); // 'late' | 'early'
  const [date, setDate] = useState(() => getRealTodayStr());
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

  const permPolicy = state.permissionPolicy || { maxHoursPerPermission: 2, maxPermissionsPerMonth: 2 };
  const maxHours = parseFloat(permPolicy.maxHoursPerPermission) || 2;
  const maxMonthlyCount = parseInt(permPolicy.maxPermissionsPerMonth, 10) || 2;

  // Compute used permissions in the active cycle for this employee
  const currentMonthKey = date.slice(0, 7);
  const usedPermCount = employeePermRequests.filter(
    (r) => r.status === 'approved' && (r.date || r.createdAt)?.startsWith(currentMonthKey)
  ).length;
  const remainingPermCount = Math.max(0, maxMonthlyCount - usedPermCount);

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

    if (durationObj.minutes > maxHours * 60) {
      showToast(`⚠️ تنبيه: الحد الأقصى المسموح به للإذن الواحد هو ${maxHours} ساعة (${maxHours * 60} دقيقة)`);
      return;
    }

    if (remainingPermCount <= 0) {
      if (!window.confirm(`⚠️ تنبيه: لقد استنفذت الحد الشهري للأذونات المتاحة (${maxMonthlyCount} أذونات لشهر ${currentMonthKey}). هل ترغب في إرسال الطلب كطلب استثنائي يحتاج موافقة الإدارة العليا؟`)) {
        return;
      }
    }

    const reqBranchId = selectedBranchId || emp.branchesDetails?.[0]?.branchId || emp.branchId;
    const isDirectAdmin = shouldRouteDirectToAdmin(emp, reqBranchId, state);
    const targetApproval = isDirectAdmin ? 'admin_only' : 'branch_and_admin';

    const newPermReq = {
      id: 'perm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: reqBranchId,
      type: 'permission',
      permType, // 'late' or 'early'
      date,
      startTime,
      endTime,
      hours: Math.round((durationObj.minutes / 60) * 100) / 100,
      durationMinutes: durationObj.minutes,
      durationText: durationObj.text,
      reason: reason.trim(),
      isExceptional: remainingPermCount <= 0,
      targetApproval,
      isDirectToAdmin: isDirectAdmin,
      branchNotRequired: isDirectAdmin,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const newPermNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newPermReq.id,
      type: 'permission',
      targetRole: isDirectAdmin ? 'admin' : 'branch_and_admin',
      title: `⏰ طلب إذن جديد: ${emp.name}`,
      message: `طلب إذن ${permType === 'late' ? 'تأخير صباحي' : 'خروج مبكر'} لمدة ${durationObj.text} بتاريخ ${date} (${startTime} - ${endTime}). السبب: ${reason.trim() || '—'}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: reqBranchId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedRequests = [newPermReq, ...(state.requests || [])];
    const updatedState = {
      ...state,
      requests: updatedRequests,
      notifications: [newPermNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    setShowForm(false);
    setReason('');
    showToast('تم إرسال طلب الإذن للاعتماد (لا يؤثر على الراتب وتحتسب وردية كاملة عند الموافقة) ⏰');

    // مزامنة خلفية فورية دون تأخير استجابة الزر
    if (saveState) {
      saveState(updatedState).catch((err) => {
        console.warn('[Permission] Background sync warning:', err);
      });
    }
    notifyAdminOnNewRequest({ state: updatedState, newRequest: newPermReq, empName: emp.name });
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

      {/* Policy Guidelines Box */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(13,148,136,0.06), rgba(13,148,136,0.12))',
        border: '1px solid rgba(13,148,136,0.3)',
        borderRadius: '12px',
        padding: '12px 18px',
        marginTop: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>📜</span>
          <div>
            <div style={{ fontWeight: '800', fontSize: '13.5px', color: 'var(--primary-dark)' }}>
              ضوابط وسياسة الأذونات الشهرية المعتمدة
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              الحد الأقصى للإذن الواحد: <strong>{maxHours} ساعة</strong> · الحد الأقصى شهرياً: <strong>{maxMonthlyCount} مرات</strong>
            </div>
          </div>
        </div>

        <div style={{
          background: remainingPermCount > 0 ? '#10b981' : '#ef4444',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: '8px',
          fontWeight: '800',
          fontSize: '12px'
        }}>
          الرصيد المتاح لك هذا الشهر: {remainingPermCount} من {maxMonthlyCount} أذونات
        </div>
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
      {isMobileScreen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {employeePermRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              لا توجد طلبات أذونات مسجلة سابقاً
            </div>
          ) : (
            employeePermRequests.map((r, idx) => (
              <div
                key={r.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--muted)' }}>#{idx + 1}</span>
                    {r.permType === 'late' ? (
                      <span className="badge warning" style={{ fontSize: '11.5px' }}>🚶‍♂️ إذن تأخير</span>
                    ) : (
                      <span className="badge info" style={{ fontSize: '11.5px' }}>🏃‍♂️ إذن خروج مبكر</span>
                    )}
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    {r.createdAt ? r.createdAt.slice(0, 10) : '—'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>التاريخ والموعد</span>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>📅 {r.date} ({r.startTime} ➔ {r.endTime})</strong>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>المدة</span>
                    <strong style={{ fontSize: '13px', color: 'var(--primary-dark)' }}>{r.durationText || `${r.durationMinutes} دقيقة`}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    {(r.status === 'approved' || r.adminApproved) ? (
                      <span className="badge success" style={{ fontSize: '11px' }}>🟢 محتسبة كاملة (لا خصم)</span>
                    ) : r.status === 'rejected' ? (
                      <span className="badge danger" style={{ fontSize: '11px' }}>🔴 غير معتمد (تخصم الساعات)</span>
                    ) : (
                      <span className="badge secondary" style={{ fontSize: '11px' }}>قيد الاعتماد</span>
                    )}
                  </div>
                  <div>
                    {(r.status === 'approved' || r.adminApproved) && <span className="badge success" style={{ fontSize: '11px' }}>✅ معتمد</span>}
                    {r.status === 'rejected' && <span className="badge danger" style={{ fontSize: '11px' }}>❌ مرفوض</span>}
                    {r.status !== 'approved' && !r.adminApproved && r.status !== 'rejected' && (
                      (r.branchApproved || r.branchApprovalStatus === 'approved' || r.branchDecision === 'approved') ? (
                        <span className="badge info" style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af' }}>🟡 موافقة الفرع (بانتظار الإدارة)</span>
                      ) : (r.branchRejected || r.branchApprovalStatus === 'rejected' || r.managerStatus === 'rejected' || r.branchDecision === 'rejected' || (r.branchApproved === false && r.branchDecision)) ? (
                        <span className="badge warning" style={{ fontSize: '11px', background: '#ffedd5', color: '#c2410c' }}>⏳ قيد نظر الإدارة (لم يوافق الفرع)</span>
                      ) : (
                        <span className="badge warning" style={{ fontSize: '11px' }}>⏳ قيد الانتظار</span>
                      )
                    )}
                  </div>
                </div>

                {r.reason && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--surface)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed var(--border)' }}>
                    💬 <strong>السبب:</strong> {r.reason}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
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
                      {(r.status === 'approved' || r.adminApproved) ? (
                        <span className="badge success">🟢 محتسبة وردية كاملة (لا خصم)</span>
                      ) : r.status === 'rejected' ? (
                        <span className="badge danger">🔴 غير معتمد (تخصم الساعات)</span>
                      ) : (
                        <span className="badge secondary">قيد الاعتماد</span>
                      )}
                    </td>
                    <td>
                      {(r.status === 'approved' || r.adminApproved) && <span className="badge success">✅ معتمد</span>}
                      {r.status === 'rejected' && <span className="badge danger">❌ مرفوض</span>}
                      {r.status !== 'approved' && !r.adminApproved && r.status !== 'rejected' && (
                        (r.branchApproved || r.branchApprovalStatus === 'approved' || r.branchDecision === 'approved') ? (
                          <span className="badge info" style={{ background: '#dbeafe', color: '#1e40af' }}>🟡 موافقة الفرع (بانتظار الإدارة)</span>
                        ) : (r.branchRejected || r.branchApprovalStatus === 'rejected' || r.managerStatus === 'rejected' || r.branchDecision === 'rejected' || (r.branchApproved === false && r.branchDecision)) ? (
                          <span className="badge warning" style={{ background: '#ffedd5', color: '#c2410c' }}>⏳ قيد نظر الإدارة (لم يوافق الفرع)</span>
                        ) : (
                          <span className="badge warning">⏳ قيد الانتظار</span>
                        )
                      )}
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
      )}
    </div>
  );
}
