import React, { useState } from 'react';
import { arabicWeekday, todayStr, getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function AdminResignationModule({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const [adminComment, setAdminComment] = useState({});
  const [noticeDays, setNoticeDays] = useState({});
  const [noticeStart, setNoticeStart] = useState({});
  const [filterTab, setFilterTab] = useState('pending'); // 'pending' | 'approved' | 'rejected' | 'all'

  // Manual Form State
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualData, setManualData] = useState({
    employeeId: '',
    type: 'resignation',
    reason: '',
    noticeDays: '0',
    noticeStart: todayStr()
  });

  // 1. Gather all resignation & withdraw requests from both stores without duplicates
  const rawList = [];
  const seenIds = new Set();

  (state.resignationRequests || []).forEach(r => {
    if (r && r.id && !seenIds.has(String(r.id))) {
      seenIds.add(String(r.id));
      rawList.push({
        ...r,
        employeeReason: r.employeeReason || r.reason || r.notes || 'طلب استقالة',
        requestDate: r.requestDate || r.date || r.createdAt?.slice(0, 10) || todayStr(),
        managerStatus: r.managerStatus || (r.branchApproved ? 'approved' : (r.branchApprovalStatus || 'pending')),
        adminStatus: r.adminStatus || (r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending')
      });
    }
  });

  (state.requests || []).forEach(r => {
    if (r && (r.type === 'resignation' || r.type === 'withdraw' || r.type === 'resignation_request') && !seenIds.has(String(r.id))) {
      seenIds.add(String(r.id));
      rawList.push({
        ...r,
        employeeReason: r.employeeReason || r.reason || r.notes || 'طلب استقالة',
        requestDate: r.requestDate || r.date || r.createdAt?.slice(0, 10) || todayStr(),
        managerStatus: r.managerStatus || (r.branchApproved ? 'approved' : (r.branchApprovalStatus || 'pending')),
        adminStatus: r.adminStatus || (r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending')
      });
    }
  });

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
    if (r.requestDate) {
      const t = new Date(r.requestDate).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (r.id) {
      const parts = String(r.id).split('_');
      for (const p of parts) {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num > 1000000000000) return num;
      }
    }
    return 0;
  };

  // Sort descending by newest time first
  rawList.sort((a, b) => getReqSortTime(b) - getReqSortTime(a));

  // 2. Filter requests based on selected tab
  const allRequests = rawList.filter(r => {
    const isPending = !r.adminStatus || r.adminStatus === 'pending' || r.status === 'pending' || r.status === 'pending_admin';
    const isApproved = r.adminStatus === 'approved' || r.status === 'approved' || r.adminApproved === true;
    const isRejected = r.adminStatus === 'rejected' || r.status === 'rejected';

    if (filterTab === 'pending' || filterTab === 'ready') {
      return isPending && !r.isCancelled && !r.hiddenFromAdmin;
    }
    if (filterTab === 'approved') {
      return isApproved && !r.isCancelled;
    }
    if (filterTab === 'rejected') {
      return isRejected;
    }
    if (filterTab === 'all') {
      return !r.hiddenFromAdmin;
    }
    return true;
  });

  const handleAction = async (reqId, status) => {
    const comment = adminComment[reqId] || '';
    if (!comment.trim()) {
      showToast('يرجى إضافة تعليق إداري');
      return;
    }

    const targetReq = rawList.find(r => String(r.id) === String(reqId));
    if (!targetReq) return;
    const isWithdraw = targetReq.type === 'withdraw';

    const nDays = isWithdraw ? 0 : (parseInt(noticeDays[reqId], 10) || 0);
    const nStart = noticeStart[reqId] || todayStr();

    const performAction = async () => {
      let updatedResignations = (state.resignationRequests || []).map(r => {
        if (String(r.id) === String(reqId)) {
          return { 
            ...r, 
            status: status,
            adminStatus: status, 
            adminApproved: status === 'approved',
            adminComment: comment,
            conditionsDaysRemaining: (!isWithdraw && status === 'approved') ? nDays : 0,
            conditionsStartDate: (!isWithdraw && status === 'approved' && nDays > 0) ? nStart : '',
            employeeConditionStatus: (!isWithdraw && status === 'approved' && nDays > 0) ? 'pending' : 'accepted',
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      // If it existed in requests but not in resignationRequests, ensure it is added to resignationRequests
      if (!updatedResignations.some(r => String(r.id) === String(reqId))) {
        updatedResignations.push({
          ...targetReq,
          status: status,
          adminStatus: status,
          adminApproved: status === 'approved',
          adminComment: comment,
          updatedAt: new Date().toISOString()
        });
      }

      let updatedGeneralRequests = (state.requests || []).map(r => {
        if (String(r.id) === String(reqId)) {
          return {
            ...r,
            status: status,
            adminStatus: status,
            adminApproved: status === 'approved',
            adminComment: comment,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      let updatedEmployees = state.employees || [];
      let updatedActiveShifts = { ...(state.activeShifts || {}) };
      
      // Case 1: If approved and it is a WITHDRAW request
      if (status === 'approved' && isWithdraw) {
        updatedResignations = updatedResignations.map(r => {
          const isSameEmp = String(r.employeeId) === String(targetReq.employeeId);
          if (isSameEmp && r.type === 'resignation') {
            return {
              ...r,
              isCancelled: true,
              cancelledReason: `تم إلغاء الاستقالة بسبب قبول طلب التراجع عن الاستقالة: ${comment}`,
              adminStatus: 'cancelled',
              status: 'cancelled',
              conditionsDaysRemaining: 0,
              conditionsStartDate: '',
              employeeConditionStatus: 'cancelled',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });

        updatedEmployees = updatedEmployees.map(e => {
          const isTarget = String(e.id) === String(targetReq.employeeId) || (e.code && String(e.code) === String(targetReq.employeeId));
          if (isTarget) {
            return {
              ...e,
              status: 'على رأس العمل',
              is_active: true,
              fingerprint_active: true,
              suspension_reason: '',
              updatedAt: new Date().toISOString()
            };
          }
          return e;
        });
      }

      // Case 2: For resignation requests with 0 notice days (immediate effect)
      if (status === 'approved' && !isWithdraw && nDays === 0) {
        delete updatedActiveShifts[targetReq.employeeId];
        if (targetReq.employeeId) delete updatedActiveShifts[String(targetReq.employeeId)];

        updatedEmployees = updatedEmployees.map(e => {
          const isTarget = String(e.id) === String(targetReq.employeeId) || (e.code && String(e.code) === String(targetReq.employeeId));
          if (isTarget) {
            return {
              ...e,
              status: 'تم الاستقالة',
              is_active: false,
              suspension_reason: `تم قبول الاستقالة فوراً: ${comment}`,
              fingerprint_active: false,
              updatedAt: new Date().toISOString()
            };
          }
          return e;
        });
      }

      const updatedState = { 
        ...state, 
        resignationRequests: updatedResignations,
        requests: updatedGeneralRequests,
        employees: updatedEmployees,
        activeShifts: updatedActiveShifts
      };
      setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast(status === 'approved' 
        ? (isWithdraw ? '✅ تم قبول طلب التراجع وإعادة الموظف على رأس العمل' : '✅ تم اعتماد الاستقالة وتحديث سجلات الموظف') 
        : '❌ تم رفض الطلب من الإدارة العليا'
      );
    };

    if (status === 'approved' && !isWithdraw && executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockTerminateEmployee',
        actionTitle: 'اعتماد وقبول طلب استقالة موظف',
        actionDetails: `الموظف: ${targetReq.employeeName || targetReq.employeeId}`,
        onExecute: performAction
      });
    } else {
      await performAction();
    }
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
    
    const performManualSubmit = async () => {
      const newReq = {
        id: 'res_manual_' + Date.now(),
        employeeId: emp.id,
        branchId: emp.branchId,
        type: manualData.type,
        isAdminCreated: true,
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockTerminateEmployee',
        actionTitle: manualData.type === 'resignation' ? 'تسجيل استقالة يدوية لموظف' : 'إنهاء خدمة موظف',
        actionDetails: `الموظف: ${emp.name}`,
        onExecute: performManualSubmit
      });
    } else {
      await performManualSubmit();
    }
  };

  const readyCount = (state.resignationRequests || []).filter(r => 
    (r.managerStatus === 'approved' || r.managerStatus === 'rejected') && 
    (!r.adminStatus || r.adminStatus === 'pending') && 
    !r.isAdminCreated
  ).length;
  const totalCount = (state.resignationRequests || []).filter(r => 
    r.adminStatus === 'approved' || r.adminStatus === 'rejected' || r.adminStatus === 'cancelled' || r.isCancelled || r.isAdminCreated
  ).length;

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const orgSettings = state.orgSettings || {};
  const [tempNoticeDays, setTempNoticeDays] = useState(orgSettings.resignationNoticeDays || 30);
  const [tempWindowStart, setTempWindowStart] = useState(orgSettings.resignationAllowedWindowStartDay || 1);
  const [tempWindowEnd, setTempWindowEnd] = useState(orgSettings.resignationAllowedWindowEndDay || 31);
  const [tempAllowAnytime, setTempAllowAnytime] = useState(orgSettings.resignationAllowAnytime !== false);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    const updatedSettings = {
      ...orgSettings,
      resignationNoticeDays: parseInt(tempNoticeDays, 10) || 30,
      resignationAllowedWindowStartDay: parseInt(tempWindowStart, 10) || 1,
      resignationAllowedWindowEndDay: parseInt(tempWindowEnd, 10) || 31,
      resignationAllowAnytime: tempAllowAnytime
    };
    const updatedState = { ...state, orgSettings: updatedSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم حفظ إعدادات وضوابط مهلة ونافذة الاستقالة بنجاح');
    setShowSettingsModal(false);
  };

  return (
    <div style={{ padding: '20px', background: 'var(--surface)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <span>🏢</span> طلبات استقالة الموظفين (الإدارة العليا)
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            مهلة الإخطار المعتمدة: <strong>({orgSettings.resignationNoticeDays || 30} يوماً)</strong>
            {orgSettings.resignationAllowAnytime === false && ` · نافذة التقديم: (من يوم ${orgSettings.resignationAllowedWindowStartDay || 1} إلى ${orgSettings.resignationAllowedWindowEndDay || 31} من الشهر)`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="btn btn-ghost"
            style={{ padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', border: '1px solid var(--border)' }}
          >
            ⚙️ ضوابط ومهلة الاستقالة
          </button>
          <button 
            onClick={() => setShowManualForm(!showManualForm)}
            className="btn btn-start"
            style={{ padding: '8px 16px', background: showManualForm ? 'var(--danger)' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
          >
            {showManualForm ? 'إلغاء' : '➕ إضافة إجراء يدوي (استقالة/رفد)'}
          </button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '95%', padding: '24px', borderRadius: '14px', background: 'var(--surface)' }}>
            <h3 style={{ margin: '0 0 14px', color: 'var(--primary)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚙️ ضبط فترة الإخطار ونافذة تقديم الاستقالة
            </h3>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label style={{ fontWeight: 'bold', fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                  فترة الإخطار القانونية المطلوبة لتقديم الاستقالة (بالأيام)
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={tempNoticeDays}
                  onChange={(e) => setTempNoticeDays(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
                <small style={{ color: 'var(--muted)', fontSize: '11.5px', marginTop: '2px', display: 'block' }}>
                  عدد الأيام التي يجب أن يسبق بها تقديم الطلب تاريخ ترك العمل المعتمد (الافتراضي: 30 يوماً).
                </small>
              </div>

              <div style={{ background: 'var(--surface-muted)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={tempAllowAnytime}
                    onChange={(e) => setTempAllowAnytime(e.target.checked)}
                  />
                  السماح بإرسال طلبات الاستقالة في أي يوم طوال الشهر
                </label>

                {!tempAllowAnytime && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold' }}>من يوم (في الشهر):</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={tempWindowStart}
                        onChange={(e) => setTempWindowStart(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى يوم (في الشهر):</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={tempWindowEnd}
                        onChange={(e) => setTempWindowEnd(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn btn-start" style={{ background: 'var(--primary)', color: '#fff' }}>
                  💾 حفظ الإعدادات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Tabs for filtering requests ── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setFilterTab('pending')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: (filterTab === 'pending' || filterTab === 'ready') ? 'var(--primary)' : 'var(--surface-muted)',
            color: (filterTab === 'pending' || filterTab === 'ready') ? '#ffffff' : 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>⏳ طلبات قيد المراجعة والاعتماد</span>
          <span style={{ background: (filterTab === 'pending' || filterTab === 'ready') ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', padding: '1px 6px', borderRadius: '99px', fontSize: '11px' }}>
            {rawList.filter(r => !r.hiddenFromAdmin && !r.isCancelled && (!r.adminStatus || r.adminStatus === 'pending' || r.status === 'pending' || r.status === 'pending_admin')).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('approved')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: filterTab === 'approved' ? 'var(--primary)' : 'var(--surface-muted)',
            color: filterTab === 'approved' ? '#ffffff' : 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🟢 طلبات معتمدة</span>
          <span style={{ background: filterTab === 'approved' ? 'rgba(255,255,255,0.25)' : 'var(--surface)', color: 'var(--text)', padding: '1px 6px', borderRadius: '99px', fontSize: '11px', border: '1px solid var(--border)' }}>
            {rawList.filter(r => !r.isCancelled && (r.adminStatus === 'approved' || r.status === 'approved' || r.adminApproved === true)).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('rejected')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13.5px',
            background: filterTab === 'rejected' ? 'var(--primary)' : 'var(--surface-muted)',
            color: filterTab === 'rejected' ? '#ffffff' : 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>🔴 طلبات مرفوضة</span>
          <span style={{ background: filterTab === 'rejected' ? 'rgba(255,255,255,0.25)' : 'var(--surface)', color: 'var(--text)', padding: '1px 6px', borderRadius: '99px', fontSize: '11px', border: '1px solid var(--border)' }}>
            {rawList.filter(r => r.adminStatus === 'rejected' || r.status === 'rejected').length}
          </span>
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
            color: filterTab === 'all' ? '#ffffff' : 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>📋 كافة الطلبات والسجلات</span>
          <span style={{ background: filterTab === 'all' ? 'rgba(255,255,255,0.25)' : 'var(--surface)', color: 'var(--text)', padding: '1px 6px', borderRadius: '99px', fontSize: '11px', border: '1px solid var(--border)' }}>
            {rawList.filter(r => !r.hiddenFromAdmin).length}
          </span>
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
                    .filter(isEmployeeActive)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        {getEmpDisplayName(e)} - {state.branches?.find(b => b.id === e.branchId)?.name || 'بدون فرع'} (كود: {e.code || '-'})
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
          {(filterTab === 'pending' || filterTab === 'ready') && 'لا توجد طلبات استقالة أو تراجع قيد المراجعة والاعتماد حالياً.'}
          {filterTab === 'approved' && 'لا توجد طلبات استقالة معتمدة في هذا السجل.'}
          {filterTab === 'rejected' && 'لا توجد طلبات استقالة مرفوضة في هذا السجل.'}
          {filterTab === 'all' && 'لا توجد طلبات في السجل العام.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {allRequests.map((req, index) => {
            const emp = state.employees?.find(e => e.id === req.employeeId || e.code === req.employeeCode);
            const branch = state.branches?.find(b => b.id === req.branchId || b.id === emp?.branchId);

            return (
              <div key={req.id || `res_${index}`} style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '15px', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      background: 'linear-gradient(135deg, var(--primary), #0f766e)',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '800',
                      boxShadow: '0 2px 6px rgba(13,148,136,0.3)',
                      flexShrink: 0
                    }}>
                      #{index + 1}
                    </span>
                    <div className="emp-avatar-circle" style={{ width: '45px', height: '45px' }}>
                      {emp?.photoUrl ? <img src={emp.photoUrl} alt={getEmpDisplayName(emp)} /> : <span>{getEmpDisplayName(emp)?.charAt(0) || '?'}</span>}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                        {emp ? getEmpDisplayName(emp) : (req.employeeName || 'موظف محذوف')}
                        {emp?.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'normal', marginRight: '6px' }}>
                            ({emp.name})
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
                        الفرع: <strong>{branch?.name || 'الفرع الرئيسي'}</strong> | كود: {emp?.code || '-'} | {emp?.jobTitle || '-'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
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

                    {req.type === 'resignation' && (
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: req.isNoticeCompliant !== false ? '#dcfce7' : '#fee2e2',
                        color: req.isNoticeCompliant !== false ? '#166534' : '#991b1b',
                        border: `1px solid ${req.isNoticeCompliant !== false ? '#86efac' : '#fca5a5'}`
                      }}>
                        {req.isNoticeCompliant !== false ? '✅ إخطار نظامي متوافق' : '⚠️ إخطار عاجل'} ({req.noticeDaysProvided || 0} يوم)
                        {req.requestedLastWorkingDate && ` · ترك مقترح: ${req.requestedLastWorkingDate}`}
                      </div>
                    )}

                    <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                      تاريخ التقديم: {req.requestDate}
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
                  <div style={{ background: req.type === 'withdraw' ? 'var(--surface-muted)' : 'var(--primary-light)', padding: '15px', borderRadius: '8px', border: req.type === 'withdraw' ? '1px solid var(--border)' : '1px solid var(--primary)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--primary-dark)' }}>
                      {req.type === 'withdraw' ? '↩️ قرار الإدارة العليا بشأن طلب التراجع والعودة للعمل' : '🚪 قرار الإدارة العليا والشروط'}
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: req.type === 'withdraw' ? '1fr' : '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>تعليق الإدارة (مطلوب)</label>
                        <input 
                          type="text" 
                          className="ep-input"
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                          placeholder={req.type === 'withdraw' ? 'أدخل ملاحظات قبول أو رفض التراجع...' : 'ملاحظات الإدارة...'}
                          value={adminComment[req.id] || ''}
                          onChange={(e) => handleInputChange(req.id, 'comment', e.target.value)}
                        />
                      </div>

                      {req.type === 'resignation' && (
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
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => handleAction(req.id, 'approved')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', background: 'var(--success)', color: 'white' }}
                      >
                        {req.type === 'withdraw' ? '✅ قبول التراجع وإعادة الموظف للعمل' : '✅ اعتماد الاستقالة'}
                      </button>
                      <button 
                        onClick={() => handleAction(req.id, 'rejected')}
                        className="btn btn-start" 
                        style={{ flex: 1, padding: '10px', background: 'var(--danger)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                      >
                        {req.type === 'withdraw' ? '❌ رفض طلب التراجع' : '❌ رفض الاستقالة'}
                      </button>
                    </div>
                    {req.type === 'resignation' && (
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px', textAlign: 'center' }}>
                        ملاحظة: عند وضع أيام في فترة الإشعار سيتم إرسال الشروط للموظف للموافقة، وسيتم إيقاف بصمته الإلكترونية خلال تلك الفترة تلقائياً فور قبوله.
                      </div>
                    )}
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
