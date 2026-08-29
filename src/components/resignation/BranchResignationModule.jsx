import React, { useState } from 'react';
import { arabicWeekday, getRealTodayStr } from '../../utils/formatters';
import { notifyAdminOnResignationRequest } from '../../utils/gmailService';

export default function BranchResignationModule({
  state,
  setState,
  saveState,
  showToast,
  currentBranch
}) {
  const [managerComment, setManagerComment] = useState({});

  const branchRequests = React.useMemo(() => {
    const map = new Map();
    const cIdStr = currentBranch?.id ? String(currentBranch.id) : '';

    const isMatch = (r) => {
      if (!cIdStr) return true;
      if (r.branchId && String(r.branchId) === cIdStr) return true;
      const reqEmp = (state.employees || []).find(e => String(e.id) === String(r.employeeId));
      if (reqEmp) {
        if (reqEmp.branchId && String(reqEmp.branchId) === cIdStr) return true;
        if (reqEmp.branchesDetails && reqEmp.branchesDetails.some(bd => String(bd.branchId) === cIdStr)) return true;
      }
      return false;
    };

    (state.resignationRequests || []).forEach(r => {
      if (r && isMatch(r)) map.set(String(r.id), r);
    });

    (state.requests || []).forEach(r => {
      if (r && (r.type === 'resignation' || r.type === 'withdraw' || r.type === 'resignation_request') && isMatch(r)) {
        if (!map.has(String(r.id))) {
          map.set(String(r.id), r);
        } else {
          map.set(String(r.id), { ...map.get(String(r.id)), ...r });
        }
      }
    });

    return Array.from(map.values());
  }, [state.resignationRequests, state.requests, state.employees, currentBranch]);

  // Helper to extract numeric timestamp for accurate descending sort
  const getReqSortTime = (r) => {
    if (r.createdAt) {
      const t = new Date(r.createdAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.updatedAt) {
      const t = new Date(r.updatedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.id) {
      const parts = String(r.id).split('_');
      for (const p of parts) {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num > 1000000000000) return num;
      }
    }
    if (r.requestDate) {
      const t = new Date(r.requestDate).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    return 0;
  };

  // Sort descending by newest time first
  branchRequests.sort((a, b) => getReqSortTime(b) - getReqSortTime(a));

  const handleAction = async (reqId, status) => {
    const comment = managerComment[reqId] || '';
    if (!comment.trim()) {
      showToast('يرجى إضافة تعليق قبل اتخاذ القرار');
      return;
    }

    const idStr = String(reqId);
    const targetReq = branchRequests.find(r => String(r.id) === idStr) || (state.resignationRequests || []).find(r => String(r.id) === idStr);
    const emp = (state.employees || []).find(e => String(e.id) === String(targetReq?.employeeId));
    const branchName = currentBranch?.name || (state.branches || []).find(b => String(b.id) === String(targetReq?.branchId))?.name || 'الفرع';

    const updatedTargetReq = {
      ...(targetReq || {}),
      managerStatus: status,
      branchApproved: status === 'approved',
      branchRejected: status === 'rejected',
      branchDecision: status,
      managerComment: comment,
      updatedAt: new Date().toISOString()
    };

    let updatedResignations = (state.resignationRequests || []).map(r => {
      if (String(r.id) === idStr) {
        return updatedTargetReq;
      }
      return r;
    });
    if (!updatedResignations.some(r => String(r.id) === idStr)) {
      updatedResignations.unshift(updatedTargetReq);
    }

    let updatedRequests = (state.requests || []).map(r => {
      if (String(r.id) === idStr) {
        return updatedTargetReq;
      }
      return r;
    });
    if (!updatedRequests.some(r => String(r.id) === idStr)) {
      updatedRequests.unshift(updatedTargetReq);
    }

    const newNotif = {
      id: 'notif_mgr_' + reqId + '_' + Date.now(),
      requestId: idStr,
      type: 'resignation',
      title: `👔 رد مدير الفرع على طلب ${targetReq?.type === 'resignation' ? 'الاستقالة' : 'التراجع'} (${status === 'approved' ? 'موافقة' : 'عدم موافقة'})`,
      message: `قام مدير فرع ${branchName} بالرد (${status === 'approved' ? 'موافق' : 'غير موافق'}) على طلب ${emp?.name || 'الموظف'}. تم تحويل الطلب للإدارة العليا للبت النهائي. تعليق: ${comment}`,
      date: getRealTodayStr(),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin',
      branchId: targetReq?.branchId || currentBranch?.id
    };

    const empNotif = {
      id: 'notif_emp_mgr_' + reqId + '_' + Date.now(),
      requestId: idStr,
      employeeId: String(targetReq?.employeeId || ''),
      targetEmployeeId: String(targetReq?.employeeId || ''),
      targetRole: 'employee',
      type: 'resignation',
      action: status === 'approved' ? 'approved' : 'rejected',
      approverRole: 'branch',
      title: status === 'approved' ? '🟢 موافقة مدير الفرع على طلب الاستقالة' : '❌ عدم موافقة مدير الفرع (محال للإدارة العليا)',
      message: `قام مدير الفرع (${branchName}) بتسجيل (${status === 'approved' ? 'الموافقة' : 'عدم الموافقة'}) على طلبك وإحالته للإدارة العليا للبت النهائي.`,
      details: comment,
      date: getRealTodayStr(),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedState = { 
      ...state, 
      resignationRequests: updatedResignations,
      requests: updatedRequests,
      notifications: [empNotif, newNotif, ...(state.notifications || [])]
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);

    // Send email to admin
    notifyAdminOnResignationRequest({
      state,
      emp,
      branchName,
      requestType: targetReq?.type,
      reason: targetReq?.employeeReason,
      managerStatus: status,
      managerComment: comment,
      dateStr: getRealTodayStr()
    }).catch(err => console.error("Error sending email to admin:", err));

    showToast(status === 'approved' ? '✅ تمت الموافقة وإحالة الطلب للإدارة العليا' : '🔴 تم تسجيل الرفض وإحالة الطلب للإدارة العليا');
  };

  const handleCommentChange = (id, value) => {
    setManagerComment(prev => ({ ...prev, [id]: value }));
  };

  return (
    <div style={{ padding: '20px', background: 'var(--surface)', borderRadius: '12px' }}>
      <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span>📝</span> طلبات استقالة موظفي الفرع
      </h2>

      {branchRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'var(--surface-muted)', borderRadius: '12px', color: 'var(--muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>📁</div>
          لا توجد طلبات استقالة أو تراجع في هذا الفرع حالياً.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {branchRequests.map(req => {
            const emp = state.employees.find(e => e.id === req.employeeId);
            return (
              <div key={req.id} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="emp-avatar-circle" style={{ width: '40px', height: '40px' }}>
                      {emp?.photoUrl ? <img src={emp.photoUrl} alt={emp.name} /> : <span>{emp?.name?.charAt(0) || '?'}</span>}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{emp?.name || 'موظف محذوف'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '13px' }}>كود: {emp?.code || '-'} | {emp?.jobTitle || '-'}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ 
                      display: 'inline-block', 
                      padding: '4px 8px', 
                      borderRadius: '6px', 
                      fontSize: '13px', 
                      fontWeight: 'bold',
                      background: req.type === 'resignation' ? 'var(--danger-light)' : 'var(--primary-light)',
                      color: req.type === 'resignation' ? 'var(--danger-dark)' : 'var(--primary-dark)'
                    }}>
                      {req.type === 'resignation' ? 'طلب استقالة' : 'طلب تراجع عن الاستقالة'}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '6px' }}>
                      تاريخ الطلب: {req.requestDate}
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '15px', lineHeight: '1.6' }}>
                  <strong style={{ color: 'var(--text)' }}>سبب الطلب: </strong>
                  <span style={{ color: 'var(--muted)' }}>{req.employeeReason}</span>
                </div>

                {req.managerStatus === 'pending' ? (
                  <div style={{ background: 'var(--surface)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>إضافة تعليق مدير الفرع (مطلوب)</label>
                    <textarea 
                      className="ep-input"
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '10px', minHeight: '60px' }}
                      placeholder="اكتب رأيك أو تعليقك على هذا الطلب..."
                      value={managerComment[req.id] || ''}
                      onChange={(e) => handleCommentChange(req.id, e.target.value)}
                    ></textarea>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => handleAction(req.id, 'approved')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        ✅ موافقة على الطلب
                      </button>
                      <button 
                        onClick={() => handleAction(req.id, 'rejected')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', background: 'var(--danger)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        ❌ رفض الطلب
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', background: 'var(--surface)', padding: '15px', borderRadius: '8px' }}>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '5px' }}>قرار مدير الفرع:</strong>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        background: req.managerStatus === 'approved' ? 'var(--success-light)' : 'var(--danger-light)',
                        color: req.managerStatus === 'approved' ? 'var(--success-dark)' : 'var(--danger-dark)'
                      }}>
                        {req.managerStatus === 'approved' ? 'موافق' : 'مرفوض'}
                      </span>
                      {req.managerComment && (
                        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--muted)', background: 'var(--background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          <strong>التعليق:</strong> {req.managerComment}
                        </div>
                      )}
                    </div>
                    <div>
                      <strong style={{ display: 'block', marginBottom: '5px' }}>قرار الإدارة العليا:</strong>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        background: req.adminStatus === 'approved' ? 'var(--success-light)' : req.adminStatus === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)',
                        color: req.adminStatus === 'approved' ? 'var(--success-dark)' : req.adminStatus === 'rejected' ? 'var(--danger-dark)' : 'var(--warning-dark)'
                      }}>
                        {req.adminStatus === 'approved' ? 'موافق' : req.adminStatus === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                      </span>
                      {req.adminComment && (
                        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--muted)', background: 'var(--background)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                          <strong>التعليق:</strong> {req.adminComment}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {req.adminStatus === 'approved' && req.conditionsDaysRemaining > 0 && (
                  <div style={{ marginTop: '15px', padding: '12px', background: 'var(--primary-light)', color: 'var(--primary-dark)', borderRadius: '8px', fontSize: '13px' }}>
                    <strong>شروط الإدارة:</strong> فترة إشعار تبدأ من {req.conditionsStartDate} ومتبقي {req.conditionsDaysRemaining} أيام. 
                    (رد الموظف: {req.employeeConditionStatus === 'accepted' ? 'موافق' : req.employeeConditionStatus === 'rejected' ? 'مرفوض' : 'في الانتظار'})
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
