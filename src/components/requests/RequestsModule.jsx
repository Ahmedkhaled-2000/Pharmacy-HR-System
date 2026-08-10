import React, { useState } from 'react';

export function getFormattedRequestBadge(type, leaveType) {
  if (type === 'leave') {
    if (leaveType === 'annual') return <span className="badge badge-success">🏖️ إجازات سنوية</span>;
    if (leaveType === 'unpaid') return <span className="badge badge-warning">⏱️ أذونات / إجازة غير مدفوعة</span>;
    return <span className="badge badge-success">🏖️ إجازات</span>;
  }
  if (type === 'loan' || type === 'advance') return <span className="badge badge-primary">💰 سلف شخصية</span>;
  if (type === 'permission') return <span className="badge badge-warning">⏱️ أذونات وتأخيرات</span>;
  if (type === 'swap' || type === 'shift_swap') return <span className="badge badge-primary">🔄 تبديل شفتات</span>;
  if (type === 'roster_edit') return <span className="badge badge-warning">📅 تعديل جدول شهري</span>;
  if (type === 'bonus') return <span className="badge badge-success">🏆 إضافة مكافأة</span>;
  if (type === 'penalty') return <span className="badge badge-danger">⚠️ خصم / جزاء مالي</span>;
  if (type === 'eval_edit_request') return <span className="badge badge-warning">⭐ تعديل تقييم أداء</span>;
  if (type === 'تأكيد بصمة الوجه') return <span className="badge badge-primary">📸 تأكيد بصمة الوجه</span>;
  return <span className="badge badge-primary">{type || 'طلب إداري'}</span>;
}

export default function RequestsModule({
  state,
  setState,
  saveState,
  showToast,
  startShift,
  pauseShift,
  resumeShift,
  stopShift
}) {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const requests = state.requests || [];
  const employees = state.employees || [];

  const filteredRequests = requests.filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    return true;
  });

  const handleApprove = async (reqId) => {
    let targetReq = null;
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        targetReq = { ...r, status: 'approved', adminApproved: true };
        return targetReq;
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم اعتماد الموافقة على الطلب بنجاح');
    
    if (targetReq && targetReq.type === 'تأكيد بصمة الوجه') {
      const empId = targetReq.employeeId;
      const actionType = targetReq.targetAction;
      
      // Execute the pending action
      if (actionType === 'shift_start' && startShift) startShift(empId, 'admin');
      else if (actionType === 'break_start' && pauseShift) pauseShift(empId, 'admin');
      else if (actionType === 'break_end' && resumeShift) resumeShift(empId, 'admin');
      else if (actionType === 'shift_end' && stopShift) stopShift(empId, 'admin');
      
      showToast?.('تم تسجيل إجراء الحضور والانصراف للموظف بناءً على توقيت الطلب.');
    }
  };

  const handleReject = async (reqId) => {
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        return { ...r, status: 'rejected', adminApproved: false };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🔴 تم رفض الطلب');
  };

  const handleDeleteOldRequest = async (reqId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب القديم نهائياً من السجل؟')) return;
    const updatedRequests = requests.filter((r) => r.id !== reqId);
    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف الطلب القديم بنجاح');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📋 مركز إدارة جميع طلبات الموظفين ومديري الفروع
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            مراجعة واعتماد الطلبات (إجازات - سلف - أذونات - تبديل شفتات) مع إمكانية إزالة الطلبات القديمة
          </p>
        </div>
      </div>

      {/* Filter Options */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', background: 'var(--surface)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>نوع الطلب:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <option value="all">-- جميع أنواع الطلبات --</option>
            <option value="leave">🏖️ إجازات</option>
            <option value="loan">💰 سلف شخصية</option>
            <option value="permission">⏱️ أذونات وتأخيرات</option>
            <option value="swap">🔄 تبديل شفتات</option>
            <option value="roster_edit">📅 تعديل جدول شهري</option>
            <option value="bonus">🏆 مكافآت</option>
            <option value="penalty">⚠️ خصومات وجزاءات</option>
            <option value="تأكيد بصمة الوجه">📸 تأكيد بصمة الوجه</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>حالة الاعتماد:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <option value="all">-- جميع الحالات --</option>
            <option value="pending">⏳ قيد الاعتماد</option>
            <option value="pending_admin">🟡 بانتظار الإدارة العليا</option>
            <option value="approved">🟢 معتمد نهائياً</option>
            <option value="rejected">🔴 مرفوض</option>
          </select>
        </div>
      </div>

      {/* Requests Table */}
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الموظف المقدم</th>
              <th>نوع الطلب</th>
              <th>التفاصيل والسبب</th>
              <th>موافقة مدير الفرع</th>
              <th>حالة الإدارة العليا</th>
              <th>الإجراءات والعمليات</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد طلبات تطابق خيارات التصفية.</td></tr>
            ) : (
              filteredRequests.map((req) => {
                const isOldProcessed = req.status === 'approved' || req.status === 'rejected';

                return (
                  <tr key={req.id}>
                    <td style={{ fontSize: '12.5px' }}>{req.createdAt ? req.createdAt.slice(0, 10) : req.startDate || '—'}</td>
                    <td style={{ fontWeight: '800' }}>{req.employeeName || 'موظف'}</td>
                    <td>{getFormattedRequestBadge(req.type, req.leaveType)}</td>
                    <td style={{ fontSize: '13px' }}>{req.reason || req.details || '—'}</td>
                    <td>
                      {req.branchApproved ? (
                        <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من الفرع</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار الفرع</span>
                      )}
                    </td>
                    <td>
                      {req.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد نهائياً</span>}
                      {req.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 قيد اعتماد الإدارة العليا</span>}
                      {req.status === 'pending' && <span className="approval-status-badge pending">⏳ قيد المراجعة</span>}
                      {req.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {req.status !== 'approved' && (
                          <button
                            className="btn btn-start"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => handleApprove(req.id)}
                          >
                            ✓ موافقة
                          </button>
                        )}

                        {req.status !== 'rejected' && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                            onClick={() => handleReject(req.id)}
                          >
                            ✕ رفض
                          </button>
                        )}

                        {/* Delete Old Processed Requests */}
                        {isOldProcessed && (
                          <button
                            className="del-btn"
                            style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            title="حذف الطلب القديم من السجل"
                            onClick={() => handleDeleteOldRequest(req.id)}
                          >
                            🗑️ حذف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
