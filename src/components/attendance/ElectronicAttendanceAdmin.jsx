import React, { useState, useMemo } from 'react';
import FaceRegistrationModal from './FaceRegistrationModal';
import FaceTestModal from './FaceTestModal';
import { saveFaceDescriptor, deleteFaceDescriptor, saveHandDescriptor, deleteHandDescriptor } from '../../utils/faceStorage';

export default function ElectronicAttendanceAdmin({ state, setState, saveState, showToast }) {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'register' | 'test' | null

  // Suspension & Reactivation Modal States
  const [suspendingEmp, setSuspendingEmp] = useState(null);
  const [suspensionReasonInput, setSuspensionReasonInput] = useState('');
  const [reactivatingEmp, setReactivatingEmp] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'suspended' | 'unregistered'

  const employees = state.employees || [];
  const globalBiometricType = state.orgSettings?.biometricType || 'face';

  const copyAttendanceLink = (branchId) => {
    const link = branchId ? `${window.location.origin}/kiosk/${branchId}` : `${window.location.origin}/kiosk`;
    navigator.clipboard.writeText(link);
    if (showToast) {
      showToast('✅ تم نسخ رابط البصمة بنجاح: ' + link);
    } else {
      alert('تم نسخ رابط البصمة بنجاح: ' + link);
    }
  };

  const deletePrint = async (empId, type) => {
    const isHand = type === 'hand';
    if (!window.confirm(`هل أنت متأكد من حذف بصمة ${isHand ? 'اليد' : 'الوجه'} لهذا الموظف؟`)) return;
    
    // Delete from Storage / DB
    if (isHand) {
      await deleteHandDescriptor(empId);
    } else {
      await deleteFaceDescriptor(empId);
    }

    const updatedEmployees = employees.map(emp => {
      if (emp.id === empId) {
        if (isHand) {
          const { hand_descriptor, has_hand_descriptor, ...rest } = emp;
          return rest;
        } else {
          const { face_descriptor, has_face_descriptor, ...rest } = emp;
          return rest;
        }
      }
      return emp;
    });

    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    
    if (showToast) {
      showToast(`🗑️ تم حذف بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح.`);
    } else {
      alert(`تم حذف بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح.`);
    }
  };

  const updatePreferredBiometric = async (empId, type) => {
    const updatedEmployees = employees.map(emp => {
      if (emp.id === empId) {
        return { ...emp, preferred_biometric: type };
      }
      return emp;
    });
    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleRegisterSuccess = async (empId, descriptor, type) => {
    const isHand = type === 'hand';

    // 1. Save to local employee state immediately
    const updatedEmployees = employees.map(e => {
      if (e.id === empId) {
        if (isHand) {
          return { 
            ...e, 
            has_hand_descriptor: true, 
            hand_descriptor: descriptor, 
            preferred_biometric: 'hand' 
          };
        }
        return { 
          ...e, 
          has_face_descriptor: true, 
          face_descriptor: descriptor, 
          preferred_biometric: 'face' 
        };
      }
      return e;
    });
    
    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    // 2. Sync to Database
    const res = isHand 
      ? await saveHandDescriptor(empId, descriptor)
      : await saveFaceDescriptor(empId, descriptor);
      
    if (res.success) {
      const msg = `تم تسجيل وحفظ بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح في قاعدة البيانات! 🎉`;
      if (showToast) showToast(`✅ ${msg}`);
      else alert(msg);
    } else {
      console.error('[ElectronicAttendance] Sync error:', res.error);
      const errMsg = `⚠️ حدث خطأ أثناء الحفظ لبصمة ${isHand ? 'اليد' : 'الوجه'}. يرجى التأكد من اتصال السيرفر.`;
      if (showToast) showToast(errMsg);
      else alert(errMsg);
    }

    setModalMode(null);
  };

  // Suspend Biometric Action
  const handleConfirmSuspend = async () => {
    if (!suspendingEmp) return;
    const reason = suspensionReasonInput.trim() || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق';

    const updatedEmployees = employees.map(emp => {
      if (emp.id === suspendingEmp.id) {
        return {
          ...emp,
          biometricSuspended: true,
          suspensionReason: reason,
          suspendedAt: new Date().toISOString(),
          suspendedBy: 'الإدارة العليا'
        };
      }
      return emp;
    });

    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (showToast) {
      showToast(`⛔ تم إيقاف بصمة الموظف (${suspendingEmp.name}) مؤقتاً بنجاح.`);
    }
    setSuspendingEmp(null);
    setSuspensionReasonInput('');
  };

  // Reactivate Biometric Action
  const handleConfirmReactivate = async () => {
    if (!reactivatingEmp) return;

    const updatedEmployees = employees.map(emp => {
      if (emp.id === reactivatingEmp.id) {
        const { biometricSuspended, suspensionReason, suspendedAt, suspendedBy, punchDisabled, ...rest } = emp;
        return {
          ...rest,
          biometricSuspended: false,
          punchDisabled: false,
          reactivatedAt: new Date().toISOString()
        };
      }
      return emp;
    });

    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (showToast) {
      showToast(`🟢 تم إعادة تفعيل بصمة وصلاحية حضور الموظف (${reactivatingEmp.name}) بنجاح!`);
    }
    setReactivatingEmp(null);
  };

  // Filtered Employees List
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const empBiometricType = emp.preferred_biometric || globalBiometricType;
      const isHand = empBiometricType === 'hand';
      const hasBiometric = isHand 
        ? Boolean(emp.has_hand_descriptor || emp.hand_descriptor)
        : Boolean(emp.has_face_descriptor || emp.face_descriptor);
      const isSuspended = Boolean(emp.biometricSuspended || emp.punchDisabled);

      // Status filter
      if (filterStatus === 'active') {
        if (!hasBiometric || isSuspended) return false;
      } else if (filterStatus === 'suspended') {
        if (!isSuspended) return false;
      } else if (filterStatus === 'unregistered') {
        if (hasBiometric) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (emp.name || '').toLowerCase().includes(q);
        const matchCode = (emp.code || '').toLowerCase().includes(q);
        const matchJob = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchJob) return false;
      }

      return true;
    });
  }, [employees, filterStatus, searchQuery, globalBiometricType]);

  const activeCount = employees.filter(e => !e.biometricSuspended && !e.punchDisabled && (e.has_face_descriptor || e.face_descriptor || e.has_hand_descriptor || e.hand_descriptor)).length;
  const suspendedCount = employees.filter(e => e.biometricSuspended || e.punchDisabled).length;
  const unregisteredCount = employees.filter(e => !e.has_face_descriptor && !e.face_descriptor && !e.has_hand_descriptor && !e.hand_descriptor).length;

  return (
    <div className="module-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="module-title">
          <h2 style={{ margin: 0, fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📸</span> إدارة البصمة الإلكترونية الحيوية وتفعيل الحضور
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            تسجيل واختبار بصمات الوجه واليد، وإدارة إيقاف وتفعيل صلاحيات الحضور الذاتي للموظفين مع تسجيل الأسباب
          </p>
        </div>
        <div className="module-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => copyAttendanceLink()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔗 نسخ الرابط العام لكشك البصمة
          </button>
          {state.branches && state.branches.map(b => (
            <button key={b.id} className="btn btn-ghost" style={{ border: '1px solid var(--border)', fontSize: '12px' }} onClick={() => copyAttendanceLink(b.id)}>
              🔗 كشك {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Stats & Filter Bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn ${filterStatus === 'all' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px' }}
            onClick={() => setFilterStatus('all')}
          >
            📋 كافة الموظفين ({employees.length})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'active' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'active' ? '#16a34a' : 'transparent', color: filterStatus === 'active' ? '#fff' : '#16a34a', border: '1px solid #16a34a' }}
            onClick={() => setFilterStatus('active')}
          >
            🟢 مفعلة ونشطة ({activeCount})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'suspended' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'suspended' ? '#dc2626' : 'transparent', color: filterStatus === 'suspended' ? '#fff' : '#dc2626', border: '1px solid #dc2626' }}
            onClick={() => setFilterStatus('suspended')}
          >
            🔴 موقوفة مؤقتاً ({suspendedCount})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'unregistered' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'unregistered' ? '#64748b' : 'transparent', color: filterStatus === 'unregistered' ? '#fff' : '#64748b', border: '1px solid #94a3b8' }}
            onClick={() => setFilterStatus('unregistered')}
          >
            ⚪ غير مسجلة ({unregisteredCount})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ minWidth: '220px', maxWidth: '300px', width: '100%' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Employees Biometrics Table */}
      <div className="table-responsive" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead style={{ background: 'var(--surface-muted)' }}>
            <tr>
              <th>الموظف</th>
              <th>كود الموظف</th>
              <th>نوع البصمة المفضل</th>
              <th>حالة البصمة والتفعيل</th>
              <th>سبب الإيقاف (إن وجد)</th>
              <th style={{ textAlign: 'center' }}>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                  لا يوجد موظفين مطابقين لخيارات البحث أو التصفية الحالية.
                </td>
              </tr>
            ) : (
              filteredEmployees.map(emp => {
                const empBiometricType = emp.preferred_biometric || globalBiometricType;
                const isHand = empBiometricType === 'hand';
                const hasBiometric = isHand 
                  ? Boolean(emp.has_hand_descriptor || emp.hand_descriptor)
                  : Boolean(emp.has_face_descriptor || emp.face_descriptor);
                const isSuspended = Boolean(emp.biometricSuspended || emp.punchDisabled);
                const isTerminated = emp.status === 'تم الاستقالة' || emp.is_active === false || emp.isTerminated;

                return (
                  <tr key={emp.id} style={{ background: isSuspended ? '#fff5f5' : isTerminated ? '#f8fafc' : 'inherit' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: isSuspended ? '#fee2e2' : hasBiometric ? '#dcfce7' : '#f1f5f9',
                          color: isSuspended ? '#dc2626' : hasBiometric ? '#16a34a' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {emp.name.slice(0, 1)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '14px' }}>{emp.name}</strong>
                          <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)' }}>
                            {emp.jobTitle || 'موظف'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px', background: 'var(--surface-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                        {emp.code || '—'}
                      </span>
                    </td>
                    <td>
                      <select 
                        value={empBiometricType}
                        onChange={(e) => updatePreferredBiometric(emp.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
                      >
                        <option value="face">👤 بصمة الوجه</option>
                        <option value="hand">✋ بصمة اليد</option>
                      </select>
                    </td>
                    <td>
                      {isTerminated ? (
                        <span style={{ color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          🚫 منهي خدمته / استقالة
                        </span>
                      ) : isSuspended ? (
                        <span style={{ color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800', border: '1px solid #fca5a5' }}>
                          🔴 موقوفة مؤقتاً
                        </span>
                      ) : hasBiometric ? (
                        <span style={{ color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          🟢 مفعلة ونشطة ({isHand ? 'يد' : 'وجه'})
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          ⚪ غير مسجلة
                        </span>
                      )}
                    </td>
                    <td>
                      {isSuspended ? (
                        <div style={{ maxWidth: '240px' }}>
                          <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', display: 'block' }}>
                            {emp.suspensionReason || 'إيقاف مؤقت لحين انتهاء التحقيق'}
                          </span>
                          {emp.suspendedAt && (
                            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                              منذ: {new Date(emp.suspendedAt).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons" style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {/* Toggle Suspend / Reactivate Buttons */}
                        {isSuspended ? (
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ fontSize: '11.5px', padding: '4px 10px', background: '#16a34a' }}
                            onClick={() => setReactivatingEmp(emp)}
                          >
                            ▶️ إعادة تفعيل البصمة
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '11.5px', padding: '4px 10px', color: '#dc2626', border: '1px solid #fca5a5' }}
                            onClick={() => {
                              setSuspendingEmp(emp);
                              setSuspensionReasonInput('إيقاف مؤقت عن العمل لحين انتهاء التحقيق');
                            }}
                          >
                            ⏸️ إيقاف مؤقت
                          </button>
                        )}

                        {/* Biometric Register & Test Buttons */}
                        <button 
                          className={`btn ${hasBiometric ? 'btn-outline' : 'btn-start'}`}
                          style={{ fontSize: '11.5px', padding: '4px 10px' }}
                          onClick={() => { setSelectedEmp(emp); setModalMode('register'); }}
                        >
                          {hasBiometric ? '🔄 إعادة التسجيل' : '➕ تسجيل البصمة'}
                        </button>
                        
                        {hasBiometric && (
                          <>
                            <button 
                              className="btn btn-primary"
                              style={{ fontSize: '11.5px', padding: '4px 10px' }}
                              onClick={() => { setSelectedEmp(emp); setModalMode('test'); }}
                            >
                              🔍 اختبار
                            </button>
                            <button 
                              className="btn btn-danger"
                              style={{ fontSize: '11.5px', padding: '4px 8px' }}
                              onClick={() => deletePrint(emp.id, empBiometricType)}
                              title="حذف البصمة"
                            >
                              🗑️
                            </button>
                          </>
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

      {/* ── Modal: Suspend Biometric with Mandatory Reason ── */}
      {suspendingEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content card" style={{ maxWidth: '500px', width: '95%', padding: '24px', borderRadius: '16px', border: '2px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#991b1b', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏸️</span> إيقاف بصمة الموظف مؤقتاً
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setSuspendingEmp(null)}>✕</button>
            </div>

            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text)' }}>
              أنت على وشك إيقاف بصمة وصلاحية تسجيل الحضور للموظف: <strong>{suspendingEmp.name} ({suspendingEmp.code})</strong>.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '6px', color: '#991b1b' }}>
                سبب ومبررات إيقاف البصمة <span style={{ color: 'red' }}>*</span>:
              </label>
              <textarea
                rows={3}
                value={suspensionReasonInput}
                onChange={(e) => setSuspensionReasonInput(e.target.value)}
                placeholder="مثال: إيقاف مؤقت عن العمل لحين انتهاء التحقيق في واقعة معينة..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #f87171', fontSize: '13px', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                * سيتم إظهار هذا السبب للموظف عند محاولته إدخال الكود أو تسجيل الحضور في كشك البصمة.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setSuspendingEmp(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmSuspend}
                disabled={!suspensionReasonInput.trim()}
                style={{ fontWeight: 'bold' }}
              >
                تأكيد إيقاف البصمة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reactivate Biometric ── */}
      {reactivatingEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content card" style={{ maxWidth: '480px', width: '95%', padding: '24px', borderRadius: '16px', border: '2px solid #16a34a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#166534', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>▶️</span> إعادة تفعيل بصمة الموظف
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setReactivatingEmp(null)}>✕</button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text)', lineHeight: '1.6' }}>
              هل ترغب في إعادة تفعيل بصمة الموظف <strong>{reactivatingEmp.name} ({reactivatingEmp.code})</strong> والسماح له بتسجيل الحضور والانصراف بصورة طبيعية؟
            </p>

            {reactivatingEmp.suspensionReason && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#991b1b' }}>
                <strong>سبب الإيقاف السابق:</strong> {reactivatingEmp.suspensionReason}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setReactivatingEmp(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={handleConfirmReactivate}
                style={{ fontWeight: 'bold', background: '#16a34a' }}
              >
                تأكيد إعادة التفعيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Registration Modal */}
      {modalMode === 'register' && selectedEmp && (
        <FaceRegistrationModal 
          employee={selectedEmp}
          onClose={() => setModalMode(null)}
          onSuccess={(descriptor, type) => handleRegisterSuccess(selectedEmp.id, descriptor, type)}
          biometricType={selectedEmp.preferred_biometric || globalBiometricType}
        />
      )}

      {/* Face Test Modal */}
      {modalMode === 'test' && selectedEmp && (
        <FaceTestModal 
          employee={selectedEmp}
          onClose={() => setModalMode(null)}
          biometricType={selectedEmp.preferred_biometric || globalBiometricType}
        />
      )}
    </div>
  );
}
