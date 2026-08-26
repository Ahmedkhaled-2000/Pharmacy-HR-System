import React, { useState } from 'react';
import { todayStr, fmt } from '../../utils/formatters';
import { notifyAdminOnNewRequest } from '../../utils/gmailService';
import { shouldRouteDirectToAdmin } from '../../utils/jobsHelper';

export default function EmployeeLeaveModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedMonth,
  selectedBranchId
}) {
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  React.useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const annualQuota = emp.annualLeaveBalance !== undefined ? Number(emp.annualLeaveBalance) : 21;
  const [leaveType, setLeaveType] = useState(annualQuota > 0 ? 'annual' : 'unpaid'); // 'annual' | 'unpaid'
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Calculate taken annual leaves for the current year
  const currentYear = (selectedMonth || todayStr()).slice(0, 4);
  const employeeLeaveRequests = React.useMemo(() => {
    const empIdStr = String(emp.id);
    const fromRequests = (state.requests || []).filter(
      (r) => String(r.employeeId) === empIdStr && (r.type === 'leave' || r.type === 'leave_request')
    );
    const fromLeaves = (state.leaveRequests || []).filter(
      (r) => String(r.employeeId) === empIdStr
    );
    const fromHistory = (state.leaveHistory || []).filter(
      (r) => String(r.employeeId) === empIdStr
    );

    const map = new Map();
    [...fromLeaves, ...fromHistory, ...fromRequests].forEach((r) => {
      const existing = map.get(r.id);
      if (!existing || r.status === 'approved' || r.adminApproved) {
        map.set(r.id, {
          ...r,
          status: (r.status === 'approved' || r.adminApproved) ? 'approved' : r.status
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const getT = (r) => {
        if (!r) return 0;
        if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
        if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
        return 0;
      };
      return getT(b) - getT(a);
    });
  }, [state.requests, state.leaveRequests, emp.id]);

  const takenAnnualDays = employeeLeaveRequests
    .filter((r) => r.leaveType === 'annual' && r.status === 'approved' && r.startDate.startsWith(currentYear))
    .reduce((acc, r) => acc + (r.daysCount || 1), 0);

  const remainingAnnualDays = Math.max(0, annualQuota - takenAnnualDays);

  // Calculate days in selected date range
  const calcDaysCount = (start, end) => {
    if (!start || !end) return 1;
    const d1 = new Date(start);
    const d2 = new Date(end);
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const currentDaysCount = calcDaysCount(startDate, endDate);

  // Calculate existing leave days requested/approved in the target month (strictly within that month/cycle)
  const targetMonth = (startDate || selectedMonth || todayStr()).slice(0, 7);
  const monthLeaveDaysSoFar = employeeLeaveRequests
    .filter((r) => {
      if (r.status === 'rejected' || r.status === 'cancelled' || r.isCancelled) return false;
      const rStart = r.startDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
      return rStart && rStart.startsWith(targetMonth);
    })
    .reduce((acc, r) => acc + (parseFloat(r.daysCount || r.days) || 1), 0);

  const remainingBranchDaysThisMonth = Math.max(0, 3 - monthLeaveDaysSoFar);
  const willExceedThreeDays = (monthLeaveDaysSoFar + currentDaysCount) > 3;

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      showToast('يرجى تحديد تاريخ البداية والنهاية للإجازة');
      return;
    }
    if (endDate < startDate) {
      showToast('تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية');
      return;
    }

    if (leaveType === 'annual' && annualQuota === 0) {
      showToast('⚠️ لا يوجد لديك رصيد إجازات سنوي لطلب هذه الإجازة');
      return;
    }

    if (leaveType === 'annual' && currentDaysCount > remainingAnnualDays) {
      showToast(`⚠️ رصيد الإجازات السنوية المتبقي (${remainingAnnualDays} يوم) غير كافٍ لطلب ${currentDaysCount} يوم`);
      return;
    }

    const daysCount = currentDaysCount;
    const reqBranchId = selectedBranchId || emp.branchId;
    const isDirectAdmin = shouldRouteDirectToAdmin(emp, reqBranchId, state);
    const targetApproval = (isDirectAdmin || willExceedThreeDays) ? 'admin_only' : 'branch_and_admin';

    const newRequest = {
      id: 'leave_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: reqBranchId,
      type: 'leave',
      leaveType, // 'annual' or 'unpaid'
      startDate,
      endDate,
      daysCount,
      reason: reason.trim(),
      targetApproval, // 'branch_and_admin' or 'admin_only'
      isDirectToAdmin: isDirectAdmin,
      branchNotRequired: isDirectAdmin,
      status: 'pending',
      branchApproved: false,
      adminApproved: false,
      createdAt: new Date().toISOString()
    };

    const updatedLeaveRequests = [newRequest, ...(state.leaveRequests || [])];
    const updatedRequests = [newRequest, ...(state.requests || [])];

    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      requestId: newRequest.id,
      type: 'leave',
      targetRole: willExceedThreeDays ? 'admin' : 'branch_and_admin',
      title: `🏖️ طلب إجازة جديد: ${emp.name}`,
      message: `طلب إجازة (${newRequest.leaveType === 'annual' ? 'سنوية' : newRequest.leaveType === 'sick' ? 'مرضية' : 'اعتيادية'}) لمدة ${daysCount} يوم من ${startDate} إلى ${endDate}. السبب: ${reason.trim() || '—'}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.code,
      branchId: emp.branchId,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedState = {
      ...state,
      leaveRequests: updatedLeaveRequests,
      requests: updatedRequests,
      notifications: [newNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    notifyAdminOnNewRequest({ state: updatedState, newRequest, empName: emp.name });

    setShowForm(false);
    setReason('');
    showToast(
      willExceedThreeDays
        ? 'تم إرسال طلب الإجازة للإدارة العليا فقط (لتجاوزه 3 أيام في الشهر) 🏖️'
        : 'تم إرسال طلب الإجازة لمدير الفرع والإدارة العليا للاعتماد 🏖️'
    );
  };

  return (
    <div className="card ep-tab-content fade-in">
      <div className="ep-section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🏖️</span>
          <div>
            <h3 style={{ margin: 0 }}>إدارة طلبات ورصيد الإجازات</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              متابعة رصيد الإجازات السنوية وغير مدفوعة الأجر وتقديم الطلبات
            </p>
          </div>
        </div>

        <button
          className="btn btn-start"
          onClick={() => setShowForm(!showForm)}
          style={{ fontSize: '13px', padding: '7px 16px' }}
        >
          {showForm ? '✕ إغلاق النموذج' : '+ تقديم طلب إجازة جديد'}
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="ep-summary-grid" style={{ marginTop: '16px', marginBottom: '20px' }}>
        <div className="ep-summary-card">
          <div className="ep-summary-icon">📅</div>
          <div className="ep-summary-body">
            <div className="ep-summary-label">رصيد الإجازات السنوية</div>
            <div className="ep-summary-value">{annualQuota} يوم / سنة</div>
            <div className="ep-summary-sub">الرصيد السنوي المخصص لعام {currentYear}</div>
          </div>
        </div>

        <div className="ep-summary-card">
          <div className="ep-summary-icon">✅</div>
          <div className="ep-summary-body">
            <div className="ep-summary-label">الإجازات السنوية المأخوذة</div>
            <div className="ep-summary-value" style={{ color: 'var(--primary)' }}>{takenAnnualDays} يوم</div>
            <div className="ep-summary-sub">المعتمدة رسمياً خلال العام</div>
          </div>
        </div>

        <div className="ep-summary-card">
          <div className="ep-summary-icon">🌟</div>
          <div className="ep-summary-body">
            <div className="ep-summary-label">رصيد الإجازات المتبقي</div>
            <div className="ep-summary-value" style={{ color: 'var(--success)' }}>{remainingAnnualDays} يوم</div>
            <div className="ep-summary-sub">إجازات سنوية مدفوعة الأجر متبقية</div>
          </div>
        </div>
      </div>

      {/* ── Form Modal / Inline ── */}
      {showForm && (
        <form onSubmit={handleSubmitLeave} className="card settings-card fade-in" style={{ padding: '18px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '15px', color: 'var(--primary)' }}>📝 طلب إجازة جديد</h4>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
            <div className="field" style={{ flex: '1 1 180px' }}>
              <label style={{ fontWeight: '700' }}>نوع الإجازة</label>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                {annualQuota > 0 && (
                  <option value="annual">🌴 إجازة سنوية (مدفوعة الأجر - لا تؤثر على الراتب)</option>
                )}
                <option value="unpaid">💸 إجازة غير مدفوعة الأجر (تخصم من الراتب)</option>
              </select>
            </div>

            <div className="field" style={{ flex: '1 1 140px' }}>
              <label style={{ fontWeight: '700' }}>تاريخ البداية</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 140px' }}>
              <label style={{ fontWeight: '700' }}>تاريخ النهاية</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>

            <div className="field" style={{ flex: '1 1 100px' }}>
              <label style={{ fontWeight: '700' }}>عدد الأيام</label>
              <input type="text" readOnly value={`${currentDaysCount} يوم`} style={{ fontWeight: 'bold', background: '#e2e8f0', textAlign: 'center' }} />
            </div>
          </div>

          <div className="field" style={{ marginTop: '12px' }}>
            <label style={{ fontWeight: '700' }}>سبب الإجازة (اختياري)</label>
            <textarea
              rows="2"
              placeholder="اكتب سبب طلب الإجازة..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Workflow notification hint */}
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: willExceedThreeDays ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.1)', border: `1px solid ${willExceedThreeDays ? '#eab308' : '#3b82f6'}`, fontSize: '13px' }}>
            <div style={{ marginBottom: '4px', fontWeight: '700' }}>
              📅 رصيد الشهر ({targetMonth}): تم استهلاك {monthLeaveDaysSoFar} يوم • المتبقي للاعتماد المباشر من مدير الفرع: {remainingBranchDaysThisMonth} من 3 أيام.
            </div>
            {willExceedThreeDays ? (
              <span style={{ color: '#854d0e', fontWeight: '700' }}>
                ⚠️ تنبيه: مجموع إجازاتك لشهر ({targetMonth}) سيتجاوز 3 أيام ({monthLeaveDaysSoFar + currentDaysCount} أيام). سيتم إرسال الطلب إلى <strong>الإدارة العليا فقط</strong> للاعتماد.
              </span>
            ) : (
              <span style={{ color: '#1e40af', fontWeight: '600' }}>
                ℹ️ سيتم إرسال طلب الإجازة للاعتماد من <strong>مدير الفرع والإدارة العليا</strong>.
              </span>
            )}
            {leaveType === 'unpaid' && (
              <div style={{ marginTop: '4px', color: 'var(--danger)', fontWeight: '700' }}>
                💸 الإجازة غير مدفوعة الأجر: عند الموافقة عليها سيتطلب خصم أجر اليوم تلقائياً من الراتب تحت بند إجازة غير مدفوعة الأجر.
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>إلغاء</button>
            <button type="submit" className="btn btn-start">💾 إرسال طلب الإجازة</button>
          </div>
        </form>
      )}

      {/* ── Leave Requests Table ── */}
      <h4 style={{ margin: '20px 0 12px', fontSize: '15px' }}>📋 سجل طلبات الإجازات المقدمة</h4>
      {isMobileScreen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {employeeLeaveRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              لا توجد طلبات إجازات مسجلة سابقاً
            </div>
          ) : (
            employeeLeaveRequests.map((r, idx) => (
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
                    {r.leaveType === 'annual' ? (
                      <span className="badge success" style={{ fontSize: '11.5px' }}>🌴 سنوي (مدفوعة)</span>
                    ) : (
                      <span className="badge danger" style={{ fontSize: '11.5px' }}>💸 غير مدفوعة الأجر</span>
                    )}
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    {r.createdAt ? r.createdAt.slice(0, 10) : '—'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>فترة الإجازة</span>
                    <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{r.startDate} ➔ {r.endDate}</strong>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>المدة الإجمالية</span>
                    <strong style={{ fontSize: '13.5px', color: 'var(--primary-dark)' }}>{r.daysCount || 1} يوم</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div>
                    {r.targetApproval === 'admin_only' ? (
                      <span className="badge warning" style={{ fontSize: '11px' }}>🏢 الإدارة العليا فقط (&gt;3 أيام)</span>
                    ) : (
                      <span className="badge info" style={{ fontSize: '11px' }}>👥 مدير الفرع + الإدارة</span>
                    )}
                  </div>
                  <div>
                    {r.status === 'approved' && <span className="badge success" style={{ fontSize: '11px' }}>✅ معتمد</span>}
                    {r.status === 'rejected' && <span className="badge danger" style={{ fontSize: '11px' }}>❌ مرفوض</span>}
                    {r.status === 'pending' && <span className="badge warning" style={{ fontSize: '11px' }}>⏳ قيد الانتظار</span>}
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
                <th>نوع الإجازة</th>
                <th>من تاريخ</th>
                <th>إلى تاريخ</th>
                <th>عدد الأيام</th>
                <th>مسار الاعتماد</th>
                <th>حالة الطلب</th>
                <th>السبب</th>
                <th>تاريخ التقديم</th>
              </tr>
            </thead>
            <tbody>
              {employeeLeaveRequests.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="9">لا توجد طلبات إجازات مسجلة سابقاً</td>
                </tr>
              ) : (
                employeeLeaveRequests.map((r, idx) => (
                  <tr key={r.id}>
                    <td>{idx + 1}</td>
                    <td>
                      {r.leaveType === 'annual' ? (
                        <span className="badge success">🌴 سنوي (مدفوعة)</span>
                      ) : (
                        <span className="badge danger">💸 غير مدفوعة الأجر</span>
                      )}
                    </td>
                    <td>{r.startDate}</td>
                    <td>{r.endDate}</td>
                    <td style={{ fontWeight: 'bold' }}>{r.daysCount || 1} يوم</td>
                    <td>
                      {r.targetApproval === 'admin_only' ? (
                        <span className="badge warning" style={{ fontSize: '11px' }}>🏢 الإدارة العليا فقط (&gt;3 أيام)</span>
                      ) : (
                        <span className="badge info" style={{ fontSize: '11px' }}>👥 مدير الفرع + الإدارة</span>
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
      )}
    </div>
  );
}
