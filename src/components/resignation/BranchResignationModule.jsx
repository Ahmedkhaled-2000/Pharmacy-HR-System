import React, { useState } from 'react';
import { arabicWeekday } from '../../utils/formatters';

export default function BranchResignationModule({
  state,
  setState,
  saveState,
  showToast,
  currentBranch
}) {
  const [managerComment, setManagerComment] = useState({});

  const branchRequests = (state.resignationRequests || []).filter(r => 
    r.branchId === currentBranch?.id
  );
  // Sort descending by date
  branchRequests.sort((a, b) => b.requestDate.localeCompare(a.requestDate));

  const handleAction = async (reqId, status) => {
    const comment = managerComment[reqId] || '';
    if (!comment.trim()) {
      showToast('يرجى إضافة تعليق قبل اتخاذ القرار');
      return;
    }

    const updatedReqs = state.resignationRequests.map(r => {
      if (r.id === reqId) {
        return { ...r, managerStatus: status, managerComment: comment };
      }
      return r;
    });

    const updatedState = { ...state, resignationRequests: updatedReqs };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast(status === 'approved' ? 'تمت الموافقة على الطلب من قبل الفرع' : 'تم رفض الطلب من قبل الفرع');
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
