import React, { useState } from 'react';
import FaceRegistrationModal from './FaceRegistrationModal';
import FaceTestModal from './FaceTestModal';
import { saveFaceDescriptor, deleteFaceDescriptor, saveHandDescriptor, deleteHandDescriptor } from '../../utils/faceStorage';

export default function ElectronicAttendanceAdmin({ state, setState, saveState }) {
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'register' | 'test' | null

  const employees = state.employees || [];
  const globalBiometricType = state.orgSettings?.biometricType || 'face';

  const copyAttendanceLink = (branchId) => {
    const link = branchId ? `${window.location.origin}/kiosk/${branchId}` : `${window.location.origin}/kiosk`;
    navigator.clipboard.writeText(link);
    alert('تم نسخ رابط البصمة بنجاح: ' + link);
  };

  const deletePrint = async (empId, type) => {
    const isHand = type === 'hand';
    if (!window.confirm(`هل أنت متأكد من حذف بصمة ${isHand ? 'اليد' : 'الوجه'} لهذا الموظف؟`)) return;
    
    // Delete from Supabase
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
    
    alert(`تم حذف بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح.`);
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

    // 2. Sync to Supabase Database
    const res = isHand 
      ? await saveHandDescriptor(empId, descriptor)
      : await saveFaceDescriptor(empId, descriptor);
      
    if (res.success) {
      alert(`تم تسجيل وحفظ بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح في قاعدة البيانات السحابية! 🎉`);
    } else {
      console.error('[ElectronicAttendance] Supabase sync error:', res.error);
      alert(`⚠️ حدث خطأ أثناء الحفظ السحابي لبصمة ${isHand ? 'اليد' : 'الوجه'}. يرجى التأكد من اتصال الإنترنت أو إعدادات قاعدة البيانات.`);
    }

    setModalMode(null);
  };

  return (
    <div className="module-container">
      <div className="module-header">
        <div className="module-title">
          <h2>📸 البصمة الإلكترونية</h2>
          <p>إدارة البصمات (الوجه/اليد) للموظفين</p>
        </div>
        <div className="module-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => copyAttendanceLink()}>
            🔗 نسخ الرابط العام
          </button>
          {state.branches && state.branches.map(b => (
            <button key={b.id} className="btn btn-ghost" style={{ border: '1px solid var(--border)' }} onClick={() => copyAttendanceLink(b.id)}>
              🔗 رابط {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>كود الموظف</th>
              <th>نوع البصمة</th>
              <th>حالة البصمة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>لا يوجد موظفين حالياً.</td>
              </tr>
            ) : (
              employees.map(emp => {
                const empBiometricType = emp.preferred_biometric || globalBiometricType;
                const isHand = empBiometricType === 'hand';
                const hasBiometric = isHand 
                  ? (emp.has_hand_descriptor || emp.hand_descriptor)
                  : (emp.has_face_descriptor || emp.face_descriptor);
                
                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 'bold' }}>{emp.name}</td>
                    <td>{emp.code}</td>
                    <td>
                      <select 
                        value={empBiometricType}
                        onChange={(e) => updatePreferredBiometric(emp.id, e.target.value)}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid var(--border)' }}
                      >
                        <option value="face">بصمة الوجه</option>
                        <option value="hand">بصمة اليد</option>
                      </select>
                    </td>
                    <td>
                      {hasBiometric ? (
                        <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✅ مسجلة ({isHand ? 'يد' : 'وجه'})</span>
                      ) : (
                        <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>❌ غير مسجلة</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className={`btn ${hasBiometric ? 'btn-outline' : 'btn-start'}`}
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                          onClick={() => { setSelectedEmp(emp); setModalMode('register'); }}
                        >
                          {hasBiometric ? 'إعادة التسجيل' : 'تسجيل البصمة'}
                        </button>
                        
                        {hasBiometric && (
                          <>
                            <button 
                              className="btn btn-primary"
                              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                              onClick={() => { setSelectedEmp(emp); setModalMode('test'); }}
                            >
                              اختبار البصمة
                            </button>
                            <button 
                              className="btn btn-danger"
                              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                              onClick={() => deletePrint(emp.id, empBiometricType)}
                            >
                              حذف
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

      {modalMode === 'register' && selectedEmp && (
        <FaceRegistrationModal 
          employee={selectedEmp}
          onClose={() => setModalMode(null)}
          onSuccess={(descriptor, type) => handleRegisterSuccess(selectedEmp.id, descriptor, type)}
          biometricType={selectedEmp.preferred_biometric || globalBiometricType}
        />
      )}

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
