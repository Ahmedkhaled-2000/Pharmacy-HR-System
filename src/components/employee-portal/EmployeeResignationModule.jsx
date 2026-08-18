import React, { useState } from 'react';
import { todayStr, uid } from '../../utils/formatters';
import { notifyAdminOnResignationRequest } from '../../utils/gmailService';

export default function EmployeeResignationModule({
  emp,
  state,
  setState,
  saveState,
  showToast,
  selectedBranchId
}) {
  const [showForm, setShowForm] = useState(false);
  const [requestType, setRequestType] = useState('resignation'); // 'resignation' | 'withdraw'
  const [reason, setReason] = useState('');
  
  const empRequests = (state.resignationRequests || []).filter(r => r.employeeId === emp.id);
  // Sort descending by date
  empRequests.sort((a, b) => b.requestDate.localeCompare(a.requestDate));

  const hasPendingAction = empRequests.some(r => r.adminStatus === 'approved' && r.employeeConditionStatus === 'pending');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      showToast('يرجى كتابة السبب بالتفصيل');
      return;
    }

    const newReq = {
      id: 'res_' + Date.now() + '_' + uid(),
      employeeId: emp.id,
      branchId: selectedBranchId || emp.branchId,
      type: requestType,
      employeeReason: reason,
      requestDate: todayStr(),
      managerStatus: 'pending',
      managerComment: '',
      adminStatus: 'pending',
      adminComment: '',
      conditionsDaysRemaining: 0,
      conditionsStartDate: '',
      employeeConditionStatus: 'pending', // Will only be active if admin sets conditions
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newNotif = {
      id: 'notif_' + newReq.id,
      type: 'resignation',
      title: `📝 طلب ${requestType === 'resignation' ? 'استقالة' : 'تراجع عن استقالة'} جديد`,
      message: `قام الموظف ${emp.name} بتقديم طلب ${requestType === 'resignation' ? 'استقالة' : 'تراجع عن استقالة'} وبانتظار رد مدير الفرع.`,
      date: todayStr(),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'branch',
      branchId: selectedBranchId || emp.branchId,
    };

    const updatedState = { 
      ...state, 
      resignationRequests: [newReq, ...(state.resignationRequests || [])],
      notifications: [newNotif, ...(state.notifications || [])]
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast('تم إرسال الطلب لمدير الفرع للمراجعة أولاً ✅');
    setShowForm(false);
    setReason('');
  };

  const handleConditionAction = async (reqId, action) => {
    const target = empRequests.find(r => r.id === reqId);
    if (!target) return;

    if (action === 'rejected') {
      const updatedEmployees = state.employees.map(e => {
        if (e.id === emp.id) {
          return {
            ...e,
            status: 'تم الاستقالة',
            is_active: false,
            suspension_reason: 'تم إيقاف الحساب بسبب رفض شروط الاستقالة',
            fingerprint_active: false,
            updatedAt: new Date().toISOString()
          };
        }
        return e;
      });
      
      const updatedActiveShifts = { ...(state.activeShifts || {}) };
      delete updatedActiveShifts[emp.id];

      const updatedReqs = state.resignationRequests.map(r => 
        r.id === reqId ? { ...r, employeeConditionStatus: 'rejected', updatedAt: new Date().toISOString() } : r
      );

      const updatedState = { 
        ...state, 
        employees: updatedEmployees, 
        activeShifts: updatedActiveShifts,
        resignationRequests: updatedReqs 
      };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      
      try {
        localStorage.removeItem('app_auth_role');
        localStorage.removeItem('app_current_branch');
        localStorage.removeItem('app_current_emp_user');
        localStorage.removeItem('app_active_nav_tab');
        localStorage.removeItem('app_is_admin');
      } catch {}

      showToast('تم رفض الشروط وتم إيقاف الحساب وتسجيل الخروج');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      return;
    }

    if (action === 'accepted') {
      const updatedEmployees = state.employees.map(e => {
        if (e.id === emp.id) {
          return {
            ...e,
            fingerprint_active: false, // إيقاف البصمة خلال فترة الإشعار
            updatedAt: new Date().toISOString()
          };
        }
        return e;
      });

      const updatedReqs = state.resignationRequests.map(r => 
        r.id === reqId ? { ...r, employeeConditionStatus: 'accepted', updatedAt: new Date().toISOString() } : r
      );
      
      const updatedState = { ...state, employees: updatedEmployees, resignationRequests: updatedReqs };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast('تم قبول شروط الاستقالة وإيقاف البصمة الإلكترونية');
    }
  };

  return (
    <div className="card ep-tab-content fade-in" style={{ padding: '20px' }}>
      <div className="ep-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>🚪</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>طلبات الاستقالة والتراجع</h3>
            <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
              تقديم طلب استقالة رسمي أو طلب تراجع ومتابعة قرارات الإدارة
            </p>
          </div>
        </div>

        {!hasPendingAction && (
          <button
            type="button"
            className="btn btn-start"
            onClick={() => setShowForm(!showForm)}
            style={{
              fontSize: '13px',
              padding: '8px 18px',
              background: showForm ? '#dc2626' : 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
            }}
          >
            {showForm ? '✕ إلغاء' : '➕ تقديم طلب استقالة / تراجع'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card settings-card fade-in" style={{ padding: '18px', background: 'var(--surface-muted)', border: '1px solid var(--primary-tint)', borderRadius: '12px', marginTop: '10px', marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 14px', fontSize: '15px', color: 'var(--primary)', fontWeight: 'bold' }}>
            📝 نموذج تقديم طلب جديد
          </h4>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label style={{ fontWeight: '700', display: 'block', marginBottom: '6px' }}>نوع الطلب</label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'Cairo, sans-serif' }}
              >
                <option value="resignation">🚪 طلب تقديم استقالة</option>
                <option value="withdraw">↩️ طلب تراجع عن الاستقالة</option>
              </select>
            </div>

            <div className="field" style={{ flex: '1 1 160px' }}>
              <label style={{ fontWeight: '700', display: 'block', marginBottom: '6px' }}>تاريخ تقديم الطلب</label>
              <input
                type="date"
                value={todayStr()}
                disabled
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface-muted)', cursor: 'not-allowed', color: 'var(--muted)', fontFamily: 'Cairo, sans-serif' }}
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: '14px' }}>
            <label style={{ fontWeight: '700', display: 'block', marginBottom: '6px' }}>
              السبب بالتفصيل (يرجى توضيح الأسباب للإدارة) <span style={{ color: 'red' }}>*</span>
            </label>
            <textarea
              rows="4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب أسباب تقديم الاستقالة أو التراجع بالتفصيل..."
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'Cairo, sans-serif', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-start"
              style={{ padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🚀 إرسال الطلب
            </button>
          </div>
        </form>
      )}

      {empRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', marginTop: '10px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '42px', marginBottom: '10px' }}>📄</div>
          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '15px', color: 'var(--text)' }}>لا توجد طلبات استقالة أو تراجع مسجلة</p>
          <p style={{ margin: '6px 0 0', fontSize: '13px' }}>يمكنك الضغط على الزر الأخضر بالأعلى <strong>"➕ تقديم طلب استقالة / تراجع"</strong> لتقديم طلبك مباشرة.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px', marginTop: '10px' }}>
          {empRequests.map(req => (
            <div key={req.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <strong style={{ fontSize: '1.05rem', color: req.type === 'resignation' ? 'var(--danger, #dc2626)' : 'var(--primary)' }}>
                  {req.type === 'resignation' ? '🚪 طلب استقالة' : '↩️ طلب تراجع عن الاستقالة'}
                </strong>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)', background: 'var(--surface-muted)', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  📅 تاريخ التقديم: {req.requestDate}
                </span>
              </div>
              
              <div style={{ marginBottom: '14px', lineHeight: '1.6' }}>
                <strong style={{ display: 'block', color: 'var(--text)', fontSize: '13px' }}>سبب الطلب:</strong> 
                <span style={{ color: 'var(--muted)', fontSize: '14px' }}>{req.employeeReason}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', background: 'var(--surface-muted)', padding: '12px', borderRadius: '8px', fontSize: '0.92rem' }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '4px' }}>رأي مدير الفرع: </strong> 
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    background: req.managerStatus === 'approved' ? 'var(--success-light, #d1e7dd)' : req.managerStatus === 'rejected' ? 'var(--danger-light, #f8d7da)' : '#fff3cd',
                    color: req.managerStatus === 'approved' ? 'var(--success-dark, #0f5132)' : req.managerStatus === 'rejected' ? 'var(--danger-dark, #842029)' : '#664d03'
                  }}>
                    {req.managerStatus === 'approved' ? '✅ موافق' : req.managerStatus === 'rejected' ? '❌ مرفوض' : '⏳ قيد الانتظار'}
                  </span>
                  {req.managerComment && <div style={{ marginTop: '6px', color: 'var(--text)', fontSize: '0.88rem', padding: '6px 10px', background: 'var(--surface)', borderRadius: '6px', border: '1px dashed var(--border)' }}><strong>تعليق المدير:</strong> {req.managerComment}</div>}
                </div>
                
                {req.managerStatus !== 'pending' && (
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px' }}>قرار الإدارة العليا: </strong>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      background: req.adminStatus === 'approved' ? 'var(--success-light, #d1e7dd)' : req.adminStatus === 'rejected' ? 'var(--danger-light, #f8d7da)' : '#fff3cd',
                      color: req.adminStatus === 'approved' ? 'var(--success-dark, #0f5132)' : req.adminStatus === 'rejected' ? 'var(--danger-dark, #842029)' : '#664d03'
                    }}>
                      {req.adminStatus === 'approved' ? '✅ موافق' : req.adminStatus === 'rejected' ? '❌ مرفوض' : '⏳ قيد الانتظار'}
                    </span>
                    {req.adminComment && <div style={{ marginTop: '6px', color: 'var(--text)', fontSize: '0.88rem', padding: '6px 10px', background: 'var(--surface)', borderRadius: '6px', border: '1px dashed var(--border)' }}><strong>تعليق الإدارة:</strong> {req.adminComment}</div>}
                  </div>
                )}
              </div>

              {/* Conditions Block */}
              {req.adminStatus === 'approved' && req.conditionsDaysRemaining > 0 && req.employeeConditionStatus === 'pending' && (
                <div style={{ marginTop: '14px', padding: '14px', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: '8px', color: '#664d03' }}>
                  <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}><span>⚠️</span> شروط الإدارة للموافقة</h4>
                  <ul style={{ paddingInlineStart: '20px', marginBottom: '12px', lineHeight: '1.8' }}>
                    <li>تاريخ بداية الاستقالة: <strong>{req.conditionsStartDate}</strong></li>
                    <li>عدد الأيام المتبقية للعمل (فترة الإشعار): <strong>{req.conditionsDaysRemaining} أيام</strong></li>
                  </ul>
                  <p style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}>يرجى قبول الشروط لبدء التنفيذ، وفي حال الرفض سيتم إيقاف الحساب فوراً.</p>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => handleConditionAction(req.id, 'accepted')}
                      style={{ flex: 1, background: '#198754', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}
                    >
                      ✅ موافق على الشروط
                    </button>
                    <button 
                      onClick={() => handleConditionAction(req.id, 'rejected')}
                      style={{ flex: 1, background: '#dc3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}
                    >
                      ❌ رفض وإيقاف الحساب
                    </button>
                  </div>
                </div>
              )}
              
              {req.adminStatus === 'approved' && req.employeeConditionStatus === 'accepted' && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'var(--success-light, #d1e7dd)', color: 'var(--success-dark, #0f5132)', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', border: '1px solid var(--border)' }}>
                  لقد وافقت على الشروط. يبدأ السريان من {req.conditionsStartDate} المتبقي {req.conditionsDaysRemaining} أيام.
                </div>
              )}

              {req.adminStatus === 'rejected' && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'var(--danger-light, #f8d7da)', color: 'var(--danger-dark, #842029)', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', border: '1px solid var(--border)' }}>
                  تم رفض الطلب من قبل الإدارة.
                </div>
              )}

              {(req.isCancelled || req.adminStatus === 'cancelled') && (
                <div style={{ marginTop: '12px', padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger, #dc2626)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🚫</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '13.5px' }}>تم إلغاء هذا الطلب</div>
                    <div style={{ fontSize: '12.5px', marginTop: '2px', color: 'var(--text)' }}>{req.cancelledReason || 'تم إلغاء الاستقالة بناءً على قبول طلب التراجع عن الاستقالة.'}</div>
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

