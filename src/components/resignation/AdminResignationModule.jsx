import React, { useState } from 'react';
import { arabicWeekday, todayStr } from '../../utils/formatters';

export default function AdminResignationModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [adminComment, setAdminComment] = useState({});
  const [noticeDays, setNoticeDays] = useState({});
  const [noticeStart, setNoticeStart] = useState({});
  const [filterTab, setFilterTab] = useState('ready'); // 'ready' | 'pending_branch' | 'all'

  // Manual Form State
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualData, setManualData] = useState({
    employeeId: '',
    type: 'resignation',
    reason: '',
    noticeDays: '0',
    noticeStart: todayStr()
  });

  // Filter requests based on selected tab
  const allRequests = (state.resignationRequests || []).filter(r => {
    if (filterTab === 'ready') {
      return r.managerStatus === 'approved' || r.managerStatus === 'rejected';
    }
    if (filterTab === 'pending_branch') {
      return !r.managerStatus || r.managerStatus === 'pending';
    }
    return true; // 'all'
  });
  // Sort descending by date
  allRequests.sort((a, b) => (b.requestDate || '').localeCompare(a.requestDate || ''));

  const handleAction = async (reqId, status) => {
    const comment = adminComment[reqId] || '';
    if (!comment.trim()) {
      showToast('يرجى إضافة تعليق إداري');
      return;
    }

    const nDays = parseInt(noticeDays[reqId], 10) || 0;
    const nStart = noticeStart[reqId] || todayStr();

    let reqObj = null;

    const updatedReqs = (state.resignationRequests || []).map(r => {
      if (r.id === reqId) {
        reqObj = { 
          ...r, 
          adminStatus: status, 
          adminComment: comment,
          conditionsDaysRemaining: status === 'approved' ? nDays : 0,
          conditionsStartDate: status === 'approved' && nDays > 0 ? nStart : '',
          employeeConditionStatus: (status === 'approved' && nDays > 0) ? 'pending' : 'accepted' // auto accept if no conditions
        };
        return reqObj;
      }
      return r;
    });

    let updatedEmployees = state.employees || [];
    let updatedActiveShifts = { ...(state.activeShifts || {}) };
    
    // If approved and NO notice days (immediate effect), deactivate the employee and stop fingerprint & active shift right away
    if (status === 'approved' && nDays === 0 && reqObj) {
      delete updatedActiveShifts[reqObj.employeeId];
      updatedEmployees = updatedEmployees.map(e => {
        if (String(e.id) === String(reqObj.employeeId)) {
          return {
            ...e,
            status: 'تم الاستقالة',
            is_active: false,
            suspension_reason: `تم قبول الاستقالة فوراً: ${comment}`,
            fingerprint_active: false
          };
        }
        return e;
      });
    }

    const updatedState = { 
      ...state, 
      resignationRequests: updatedReqs, 
      employees: updatedEmployees,
      activeShifts: updatedActiveShifts
    };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast(status === 'approved' ? '✅ تم اعتماد القرار من الإدارة العليا وتحديث سجلات الموظف' : '❌ تم رفض الطلب من الإدارة العليا');
  };

  const handleInputChange = (id, field, value) => {
    if (field === 'comment') setAdminComment(prev => ({ ...prev, [id]: value }));
    if (field === 'days') setNoticeDays(prev => ({ ...prev, [id]: value }));
    if (field === 'start') setNoticeStart(prev => ({ ...prev, [id]: value }));
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualData.employeeId || !manualData.reason.trim()) {
      showToast('يرجى اختيار الموظف وكتابة السبب');
      return;
    }

    const nDays = parseInt(manualData.noticeDays, 10) || 0;
    const nStart = manualData.noticeStart || todayStr();

    const emp = (state.employees || []).find(e => String(e.id) === String(manualData.employeeId));
    if (!emp) return;
    
    const newReq = {
      id: 'res_manual_' + Date.now(),
      employeeId: emp.id,
      branchId: emp.branchId,
      type: manualData.type,
      employeeReason: 'تم الإنشاء يدوياً بواسطة الإدارة العليا: ' + manualData.reason,
      requestDate: todayStr(),
      managerStatus: 'approved',
      managerComment: 'إجراء إداري مباشر من الإدارة العليا',
      adminStatus: 'approved',
      adminComment: 'إجراء إداري مباشر: ' + manualData.reason,
      conditionsDaysRemaining: nDays,
      conditionsStartDate: nDays > 0 ? nStart : '',
      employeeConditionStatus: 'accepted'
    };

    let updatedEmployees = state.employees || [];
    let updatedActiveShifts = { ...(state.activeShifts || {}) };
    
    // If immediate (nDays === 0) -> stop account and fingerprint and shift
    if (nDays === 0) {
      delete updatedActiveShifts[emp.id];
    }

    updatedEmployees = updatedEmployees.map(e => {
      if (String(e.id) === String(emp.id)) {
        if (nDays === 0) {
          return {
            ...e,
            status: 'تم الاستقالة',
            is_active: false,
            suspension_reason: `تم ${manualData.type === 'resignation' ? 'قبول الاستقالة' : 'إنهاء الخدمة'} يدوياً: ${manualData.reason}`,
            fingerprint_active: false
          };
        } else {
          return {
            ...e,
            fingerprint_active: false // Disable fingerprint during notice
          };
        }
      }
      return e;
    });

    const updatedState = { 
      ...state, 
      resignationRequests: [newReq, ...(state.resignationRequests || [])],
      employees: updatedEmployees,
      activeShifts: updatedActiveShifts
    };

    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast('تم تطبيق الإجراء اليدوي بنجاح');
    setShowManualForm(false);
    setManualData({ employeeId: '', type: 'resignation', reason: '', noticeDays: '0', noticeStart: todayStr() });
  };

  const readyCount = (state.resignationRequests || []).filter(r => r.managerStatus === 'approved' || r.managerStatus === 'rejected').length;
  const pendingBranchCount = (state.resignationRequests || []).filter(r => !r.managerStatus || r.managerStatus === 'pending').length;
  const totalCount = (state.resignationRequests || []).length;

  return (
    <div style={{ padding: '20px', background: 'var(--surface)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
          <span>🏢</span> طلبات استقالة الموظفين (الإدارة العليا)
        </h2>
        <button 
          onClick={() => setShowManualForm(!showManualForm)}
          className="btn btn-start"
          style={{ padding: '8px 16px', background: showManualForm ? 'var(--danger)' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}
        >
          {showManualForm ? 'إلغاء' : '➕ إضافة إجراء يدوي (استقالة/رفد)'}
        </button>
      </div>

      {/* ── Tabs for filtering requests ── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setFilterTab('ready')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: filterTab === 'ready' ? 'var(--primary)' : 'var(--surface-muted)',
            color: filterTab === 'ready' ? '#ffffff' : 'var(--text)'
          }}
        >
          📥 طلبات محالة من الفرع ({readyCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('pending_branch')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: filterTab === 'pending_branch' ? 'var(--primary)' : 'var(--surface-muted)',
            color: filterTab === 'pending_branch' ? '#ffffff' : 'var(--text)'
          }}
        >
          ⏳ بانتظار رد مدير الفرع ({pendingBranchCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: filterTab === 'all' ? 'var(--primary)' : 'var(--surface-muted)',
            color: filterTab === 'all' ? '#ffffff' : 'var(--text)'
          }}
        >
          📋 كافة الطلبات ({totalCount})
        </button>
      </div>

      {showManualForm && (
        <div style={{ background: 'var(--surface-muted)', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text)' }}>إنشاء إجراء استقالة أو إنهاء خدمة</h3>
          <form onSubmit={handleManualSubmit} style={{ display: 'grid', gap: '15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>اختيار الموظف</label>
                <select 
                  className="ep-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  value={manualData.employeeId}
                  onChange={(e) => setManualData({...manualData, employeeId: e.target.value})}
                  required
                >
                  <option value="">-- اختر موظف --</option>
                  {(state.employees || [])
                    .filter(e => e.is_active !== false && e.status !== 'تم الاستقالة')
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        {e.name} - {state.branches?.find(b => b.id === e.branchId)?.name || 'بدون فرع'} (كود: {e.code || '-'})
                      </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>نوع الإجراء</label>
                <select 
                  className="ep-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  value={manualData.type}
                  onChange={(e) => setManualData({...manualData, type: e.target.value})}
                >
                  <option value="resignation">استقالة</option>
                  <option value="termination">إنهاء خدمة (رفد)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>السبب / المبرر (يظهر في السجل وعند الإيقاف)</label>
              <textarea 
                className="ep-input"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', minHeight: '60px' }}
                value={manualData.reason}
                onChange={(e) => setManualData({...manualData, reason: e.target.value})}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>فترة الإشعار (بالأيام - صفر للإيقاف الفوري)</label>
                <input 
                  type="number"
                  min="0"
                  className="ep-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  value={manualData.noticeDays}
                  onChange={(e) => setManualData({...manualData, noticeDays: e.target.value})}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>تاريخ البدء</label>
                <input 
                  type="date"
                  className="ep-input"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  value={manualData.noticeStart}
                  onChange={(e) => setManualData({...manualData, noticeStart: e.target.value})}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-start" style={{ background: 'var(--danger)', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontWeight: 'bold', marginTop: '10px' }}>
              تنفيذ الإجراء وإيقاف البصمة/الحساب فوراً
            </button>
          </form>
        </div>
      )}

      {allRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: 'var(--surface-muted)', borderRadius: '12px', color: 'var(--muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '10px' }}>📁</div>
          {filterTab === 'ready' && 'لا توجد طلبات استقالة محالة من مديري الفروع حالياً.'}
          {filterTab === 'pending_branch' && 'لا توجد طلبات معلقة بانتظار رد مدير الفرع.'}
          {filterTab === 'all' && 'لا توجد أي طلبات استقالة مسجلة بالنظام.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {allRequests.map(req => {
            const emp = state.employees.find(e => e.id === req.employeeId);
            const branch = state.branches?.find(b => b.id === req.branchId);

            return (
              <div key={req.id} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="emp-avatar-circle" style={{ width: '45px', height: '45px' }}>
                      {emp?.photoUrl ? <img src={emp.photoUrl} alt={emp.name} /> : <span>{emp?.name?.charAt(0) || '?'}</span>}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{emp?.name || 'موظف محذوف'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                        الفرع: <strong>{branch?.name || 'الرئيسي'}</strong> | كود: {emp?.code || '-'} | {emp?.jobTitle || '-'}
                      </div>
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
                      {req.requestDate}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <div style={{ background: 'var(--surface)', padding: '15px', borderRadius: '8px' }}>
                    <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '5px' }}>سبب الطلب (من الموظف):</strong>
                    <span style={{ color: 'var(--muted)', lineHeight: '1.6' }}>{req.employeeReason}</span>
                  </div>
                  
                  <div style={{ background: 'var(--surface)', padding: '15px', borderRadius: '8px' }}>
                    <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '5px' }}>موقف مدير الفرع:</strong>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      marginBottom: '8px',
                      background: req.managerStatus === 'approved' ? 'var(--success-light)' : req.managerStatus === 'rejected' ? 'var(--danger-light)' : 'var(--warning-light)',
                      color: req.managerStatus === 'approved' ? 'var(--success-dark)' : req.managerStatus === 'rejected' ? 'var(--danger-dark)' : 'var(--warning-dark)'
                    }}>
                      {req.managerStatus === 'approved' ? 'موافق' : req.managerStatus === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                    </span>
                    {req.managerComment && (
                      <div style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px', background: 'var(--background)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        {req.managerComment}
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Action Area */}
                {req.adminStatus === 'pending' ? (
                  <div style={{ background: 'var(--primary-light)', padding: '15px', borderRadius: '8px', border: '1px solid var(--primary)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--primary-dark)' }}>قرار الإدارة العليا والشروط</h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>تعليق الإدارة (مطلوب)</label>
                        <input 
                          type="text" 
                          className="ep-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                          placeholder="ملاحظات الإدارة..."
                          value={adminComment[req.id] || ''}
                          onChange={(e) => handleInputChange(req.id, 'comment', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>فترة الإشعار (بالأيام)</label>
                          <input 
                            type="number" 
                            className="ep-input"
                            min="0"
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            placeholder="0 للتنفيذ الفوري"
                            value={noticeDays[req.id] || ''}
                            onChange={(e) => handleInputChange(req.id, 'days', e.target.value)}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>تاريخ بدء الإشعار</label>
                          <input 
                            type="date" 
                            className="ep-input"
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                            value={noticeStart[req.id] || todayStr()}
                            onChange={(e) => handleInputChange(req.id, 'start', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => handleAction(req.id, 'approved')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'var(--success)', color: 'white' }}
                      >
                        ✅ اعتماد الاستقالة
                      </button>
                      <button 
                        onClick={() => handleAction(req.id, 'rejected')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', background: 'var(--danger)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        ❌ رفض الاستقالة
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px', textAlign: 'center' }}>
                      ملاحظة: عند وضع أيام في فترة الإشعار سيتم إرسال الشروط للموظف للموافقة، وسيتم إيقاف بصمته الإلكترونية خلال تلك الفترة تلقائياً فور قبوله.
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text)' }}>القرار النهائي للإدارة</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        background: req.adminStatus === 'approved' ? 'var(--success-light)' : 'var(--danger-light)',
                        color: req.adminStatus === 'approved' ? 'var(--success-dark)' : 'var(--danger-dark)'
                      }}>
                        {req.adminStatus === 'approved' ? 'تم الاعتماد' : 'مرفوض'}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{req.adminComment}</span>
                    </div>

                    {req.adminStatus === 'approved' && req.conditionsDaysRemaining > 0 && (
                      <div style={{ padding: '10px', background: 'var(--warning-light)', color: 'var(--warning-dark)', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <strong>شروط الإدارة:</strong> فترة إشعار تبدأ من {req.conditionsStartDate} ومتبقي {req.conditionsDaysRemaining} أيام.
                        </div>
                        <div style={{ fontWeight: 'bold' }}>
                          رد الموظف: {req.employeeConditionStatus === 'accepted' ? '✅ وافق على الشروط' : req.employeeConditionStatus === 'rejected' ? '❌ رفض الشروط وتم الإيقاف' : '⏳ بانتظار رد الموظف'}
                        </div>
                      </div>
                    )}
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
