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
    };

    const newNotif = {
      id: 'notif_' + newReq.id,
      type: 'resignation',
      title: `📝 طلب ${requestType === 'resignation' ? 'استقالة' : 'تراجع عن استقالة'} جديد`,
      message: `قام الموظف ${emp.name} بتقديم طلب ${requestType === 'resignation' ? 'استقالة' : 'تراجع عن استقالة'}.`,
      date: todayStr(),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'admin',
      branchId: selectedBranchId || emp.branchId,
    };

    const updatedState = { 
      ...state, 
      resignationRequests: [...(state.resignationRequests || []), newReq],
      notifications: [newNotif, ...(state.notifications || [])]
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    
    // Send email notification to admin
    notifyAdminOnResignationRequest({
      state,
      emp,
      branchName: state.branches?.find(b => b.id === (selectedBranchId || emp.branchId))?.name,
      requestType,
      reason,
      dateStr: todayStr()
    }).catch(err => console.error("Error sending email:", err));

    showToast('تم إرسال الطلب بنجاح');
    setShowForm(false);
    setReason('');
  };

  const handleConditionAction = async (reqId, action) => {
    // action: 'accepted' | 'rejected'
    const target = empRequests.find(r => r.id === reqId);
    if (!target) return;

    if (action === 'rejected') {
      const updatedEmployees = state.employees.map(e => {
        if (e.id === emp.id) {
          return {
            ...e,
            is_active: false,
            suspension_reason: 'تم إيقاف الحساب بسبب رفض شروط الاستقالة',
            fingerprint_active: false
          };
        }
        return e;
      });
      
      const updatedReqs = state.resignationRequests.map(r => 
        r.id === reqId ? { ...r, employeeConditionStatus: 'rejected' } : r
      );

      const updatedState = { ...state, employees: updatedEmployees, resignationRequests: updatedReqs };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      
      showToast('تم رفض الشروط وتم إيقاف الحساب');
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
            fingerprint_active: false // إيقاف البصمة خلال فترة الإشعار
          };
        }
        return e;
      });

      const updatedReqs = state.resignationRequests.map(r => 
        r.id === reqId ? { ...r, employeeConditionStatus: 'accepted' } : r
      );
      
      const updatedState = { ...state, employees: updatedEmployees, resignationRequests: updatedReqs };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast('تم قبول شروط الاستقالة وإيقاف البصمة الإلكترونية');
    }
  };

  return (
    <div className="ep-card" style={{ padding: '1.5rem', background: 'var(--bg-color)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div className="ep-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <h3 className="ep-card-title" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>طلبات الاستقالة</h3>
        {!hasPendingAction && (
          <button className="ep-button" onClick={() => setShowForm(!showForm)} style={{ background: showForm ? 'var(--danger-color, #dc3545)' : 'var(--primary-color)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
            {showForm ? 'إلغاء' : 'تقديم طلب جديد'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="ep-form" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem', background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="ep-form-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>نوع الطلب</label>
              <select className="ep-input" value={requestType} onChange={(e) => setRequestType(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="resignation">طلب استقالة</option>
                <option value="withdraw">تراجع عن استقالة</option>
              </select>
            </div>
            
            <div className="ep-form-group">
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>تاريخ الطلب</label>
              <input type="date" className="ep-input" value={todayStr()} disabled style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5' }} />
            </div>
          </div>

          <div className="ep-form-group" style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>السبب بالتفصيل</label>
            <textarea
              className="ep-input"
              rows="4"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب أسبابك هنا بالتفصيل..."
              required
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            ></textarea>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ep-button" style={{ background: 'var(--primary-color)', color: '#fff', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              إرسال الطلب
            </button>
          </div>
        </form>
      )}

      {empRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
          لا توجد طلبات استقالة أو تراجع مسجلة.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {empRequests.map(req => (
            <div key={req.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.5rem', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.1rem', color: req.type === 'resignation' ? 'var(--danger-color, #dc3545)' : 'var(--primary-color)' }}>
                  {req.type === 'resignation' ? 'طلب استقالة' : 'تراجع عن الاستقالة'}
                </strong>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', background: '#eee', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {req.requestDate}
                </span>
              </div>
              
              <div style={{ marginBottom: '1rem', lineHeight: '1.5' }}>
                <strong style={{ display: 'block', color: 'var(--text-primary)' }}>السبب:</strong> 
                <span style={{ color: 'var(--text-secondary)' }}>{req.employeeReason}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '6px', fontSize: '0.95rem' }}>
                <div>
                  <strong style={{ display: 'block', marginBottom: '0.25rem' }}>رأي مدير الفرع: </strong> 
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    background: req.managerStatus === 'approved' ? '#d1e7dd' : req.managerStatus === 'rejected' ? '#f8d7da' : '#fff3cd',
                    color: req.managerStatus === 'approved' ? '#0f5132' : req.managerStatus === 'rejected' ? '#842029' : '#664d03'
                  }}>
                    {req.managerStatus === 'approved' ? 'موافق' : req.managerStatus === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                  </span>
                  {req.managerComment && <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', border: '1px dashed #ccc' }}><strong>تعليق المدير:</strong> {req.managerComment}</div>}
                </div>
                
                {req.managerStatus !== 'pending' && (
                  <div>
                    <strong style={{ display: 'block', marginBottom: '0.25rem' }}>قرار الإدارة العليا: </strong>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      background: req.adminStatus === 'approved' ? '#d1e7dd' : req.adminStatus === 'rejected' ? '#f8d7da' : '#fff3cd',
                      color: req.adminStatus === 'approved' ? '#0f5132' : req.adminStatus === 'rejected' ? '#842029' : '#664d03'
                    }}>
                      {req.adminStatus === 'approved' ? 'موافق' : req.adminStatus === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                    </span>
                    {req.adminComment && <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '0.5rem', background: '#fff', borderRadius: '4px', border: '1px dashed #ccc' }}><strong>تعليق الإدارة:</strong> {req.adminComment}</div>}
                  </div>
                )}
              </div>

              {/* Conditions Block */}
              {req.adminStatus === 'approved' && req.conditionsDaysRemaining > 0 && req.employeeConditionStatus === 'pending' && (
                <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: '8px', color: '#664d03' }}>
                  <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span>⚠️</span> شروط الإدارة للموافقة</h4>
                  <ul style={{ paddingInlineStart: '1.5rem', marginBottom: '1.5rem', lineHeight: '1.8' }}>
                    <li>تاريخ بداية الاستقالة: <strong>{req.conditionsStartDate}</strong></li>
                    <li>عدد الأيام المتبقية للعمل (فترة الإشعار): <strong>{req.conditionsDaysRemaining} أيام</strong></li>
                  </ul>
                  <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem', fontWeight: 'bold' }}>يرجى قبول الشروط لبدء التنفيذ، وفي حال الرفض سيتم إيقاف الحساب فوراً.</p>
                  
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      onClick={() => handleConditionAction(req.id, 'accepted')}
                      style={{ flex: 1, background: '#198754', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: 'opacity 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.opacity = 0.9}
                      onMouseOut={e => e.currentTarget.style.opacity = 1}
                    >
                      موافق على الشروط
                    </button>
                    <button 
                      onClick={() => handleConditionAction(req.id, 'rejected')}
                      style={{ flex: 1, background: '#dc3545', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: 'opacity 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.opacity = 0.9}
                      onMouseOut={e => e.currentTarget.style.opacity = 1}
                    >
                      رفض وإيقاف الحساب
                    </button>
                  </div>
                </div>
              )}
              
              {req.adminStatus === 'approved' && req.employeeConditionStatus === 'accepted' && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#d1e7dd', color: '#0f5132', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #badbcc' }}>
                  لقد وافقت على الشروط. يبدأ السريان من {req.conditionsStartDate} المتبقي {req.conditionsDaysRemaining} أيام.
                </div>
              )}

              {req.adminStatus === 'rejected' && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8d7da', color: '#842029', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', border: '1px solid #f5c2c7' }}>
                  تم رفض الطلب من قبل الإدارة.
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
