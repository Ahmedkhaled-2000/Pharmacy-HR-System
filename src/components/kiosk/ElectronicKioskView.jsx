import React, { useState, useEffect } from 'react';
import { fetchCurrentIP, checkDeviceAuthorization } from '../../utils/deviceAuth';
import FaceVerificationOverlay from '../attendance/FaceVerificationOverlay';
import '../../kiosk-modern.css';

export default function ElectronicKioskView({
  state,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  submitRequest
}) {
  const { orgSettings, employees, ipRestrictions } = state;
  const [now, setNow] = useState(Date.now());
  const [currentIp, setCurrentIp] = useState('');
  const [authStatus, setAuthStatus] = useState({ isAuthorized: true });
  
  const [inputCode, setInputCode] = useState('');
  const [matchedEmp, setMatchedEmp] = useState(null);
  
  const [activeAction, setActiveAction] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function initDeviceCheck() {
      const ip = await fetchCurrentIP();
      setCurrentIp(ip);

      const auth = checkDeviceAuthorization(
        ipRestrictions || { enabled: false },
        ip
      );
      setAuthStatus(auth);
    }
    initDeviceCheck();
  }, [ipRestrictions]);

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    if (!inputCode) return;
    const emp = employees.find(e => e.code === inputCode.trim());
    if (emp) {
      const empBiometricType = emp.preferred_biometric || orgSettings?.biometricType || 'face';
      const isHand = empBiometricType === 'hand';

      if (isHand) {
        if (!emp.has_hand_descriptor && !emp.hand_descriptor) {
          alert('هذا الموظف ليس لديه بصمة يد مسجلة. يرجى مراجعة الإدارة.');
          return;
        }
      } else {
        if (!emp.has_face_descriptor && !emp.face_descriptor) {
          alert('هذا الموظف ليس لديه بصمة وجه مسجلة. يرجى مراجعة الإدارة.');
          return;
        }
      }
      setMatchedEmp(emp);
    } else {
      alert('كود الموظف غير صحيح.');
      setMatchedEmp(null);
    }
  };

  const handleActionClick = (action) => {
    setActiveAction(action);
  };

  const onVerifySuccess = (actionType) => {
    setActiveAction(null);
    executeAction(actionType);
  };

  const onVerifyFailed = (actionType) => {
    setActiveAction(null);
    const empBiometricType = matchedEmp?.preferred_biometric || orgSettings?.biometricType || 'face';
    const isHand = empBiometricType === 'hand';
    
    const requestData = {
      id: 'REQ-' + Date.now(),
      type: `تأكيد بصمة ${isHand ? 'اليد' : 'الوجه'}`,
      employeeId: matchedEmp.id,
      employeeName: matchedEmp.name,
      targetAction: actionType,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      status: 'pending',
      notes: `فشل التعرف على ${isHand ? 'اليد' : 'الوجه'} 3 مرات متتالية عند محاولة: ${
        actionType === 'shift_start' ? 'بداية الوردية' : 
        actionType === 'shift_end' ? 'نهاية الوردية' : 
        actionType === 'break_start' ? 'بداية بريك' : 'نهاية بريك'
      }`
    };
    if (submitRequest) {
      submitRequest(requestData);
    }
    alert('تم إرسال طلب تأكيد بصمة للإدارة العليا بنجاح.');
    setMatchedEmp(null);
    setInputCode('');
  };

  const executeAction = (actionType) => {
    const empId = matchedEmp.id;
    if (actionType === 'shift_start') startShift(empId, 'kiosk');
    else if (actionType === 'break_start') pauseShift(empId, 'kiosk');
    else if (actionType === 'break_end') resumeShift(empId, 'kiosk');
    else if (actionType === 'shift_end') stopShift(empId, 'kiosk');
    
    setMatchedEmp(null);
    setInputCode('');
  };

  if (!authStatus.isAuthorized) {
    return (
      <div className="kiosk-modern-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="kiosk-glass-panel" style={{ textAlign: 'center', border: '2px solid #ef4444' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🚫</div>
          <h2 style={{ margin: '0 0 12px 0', color: '#991b1b' }}>غير مصرح بالدخول من الشبكة الحالية</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '24px' }}>
            {authStatus.message}
          </p>
          <div className="ip-box" style={{ padding: '16px', borderRadius: '12px', textAlign: 'right', fontSize: '0.85rem', marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>عنوان الـ IP الحالي لجهازك: <strong style={{ color: '#059669' }}>{currentIp}</strong></div>
          </div>
          <button className="kiosk-glass-submit" onClick={() => window.location.reload()}>
            🔄 تحديث الصفحة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="kiosk-modern-container" 
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #0f172a 0%, #0d9488 50%, #0284c7 100%)',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: 'Tajawal, Cairo, sans-serif',
        boxSizing: 'border-box',
        margin: 0,
        position: 'relative'
      }}
    >
      <div 
        className="kiosk-content-wrapper"
        style={{
          zIndex: 10,
          width: '100%',
          maxWidth: '580px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          margin: '0 auto'
        }}
      >
        {/* Modern Glass Header with Clock */}
        <div 
          className="kiosk-glass-header"
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            borderRadius: '28px',
            padding: '1.75rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '0.5rem',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.25)'
          }}
        >
          <div>
            <h1 
              className="kiosk-clock-main"
              style={{
                fontFamily: 'Cairo, sans-serif',
                fontSize: 'clamp(2.8rem, 8vw, 4.2rem)',
                fontWeight: 900,
                letterSpacing: '1px',
                background: 'linear-gradient(135deg, #0f172a 0%, #0d9488 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
                lineHeight: 1.1,
                direction: 'ltr',
                display: 'inline-block'
              }}
            >
              {new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h1>
            <div 
              className="kiosk-date-sub"
              style={{
                fontSize: 'clamp(1rem, 3.5vw, 1.25rem)',
                color: '#059669',
                fontWeight: 700,
                fontFamily: 'Tajawal, sans-serif'
              }}
            >
              {new Date(now).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
            {orgSettings?.orgName || 'منصة الحضور الإلكترونية'} | IP: {currentIp}
          </div>
        </div>

        {/* Dynamic Panel */}
        <div 
          className="kiosk-glass-panel"
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '32px',
            padding: '2.5rem 2rem',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {!matchedEmp ? (
            <div className="kiosk-form" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.5s ease-out' }}>
              <div style={{ fontSize: '3.8rem', textAlign: 'center', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.1))' }}>
                🧑‍💼
              </div>
              <h2 style={{ textAlign: 'center', margin: 0, fontSize: '1.8rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#0f172a' }}>تسجيل الحضور والانصراف</h2>
              <p style={{ textAlign: 'center', color: '#64748B', marginTop: '-10px', fontSize: '1.05rem' }}>يرجى إدخال كود الموظف الخاص بك للبدء</p>
              
              <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                <input 
                  type="password" 
                  placeholder="أدخل كود الموظف..." 
                  className="kiosk-glass-input"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#f8fafc',
                    border: '2px solid #cbd5e1',
                    borderRadius: '18px',
                    padding: '1.2rem 1.5rem',
                    fontSize: '1.6rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    textAlign: 'center',
                    letterSpacing: '6px',
                    outline: 'none',
                    direction: 'ltr',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)'
                  }}
                />
                <button 
                  type="submit" 
                  className="kiosk-glass-submit"
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '18px',
                    padding: '1.25rem 1.5rem',
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    fontFamily: 'Cairo, Tajawal, sans-serif',
                    cursor: 'pointer',
                    boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem'
                  }}
                >
                  متابعة ➔
                </button>
              </form>
            </div>
          ) : (
            <div style={{ width: '100%', animation: 'fadeIn 0.5s ease-out' }}>
              {/* User Banner */}
              <div className="kiosk-user-banner" style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', width: '100%', paddingBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem' }}>
                {matchedEmp.photoUrl ? (
                  <img src={matchedEmp.photoUrl} alt="Employee Avatar" className="kiosk-user-avatar" style={{ width: '75px', height: '75px', borderRadius: '50%', border: '3px solid #10b981', objectFit: 'cover' }} />
                ) : (
                  <div className="kiosk-user-avatar" style={{ width: '75px', height: '75px', borderRadius: '50%', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', border: '3px solid #10b981' }}>🧑‍💼</div>
                )}
                <div className="kiosk-user-info" style={{ flex: 1 }}>
                  <h3 className="kiosk-user-name" style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', margin: 0, color: '#0f172a' }}>أهلاً بك، {matchedEmp.name}</h3>
                  <p className="kiosk-user-role" style={{ fontSize: '1rem', color: '#475569', margin: '4px 0 0 0', fontWeight: 600 }}>{matchedEmp.jobTitle}</p>
                </div>
                <button 
                  className="kiosk-logout-btn" 
                  onClick={() => { setMatchedEmp(null); setInputCode(''); }}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0.7rem 1.2rem', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  تغيير الموظف
                </button>
              </div>

              {/* Actions Grid */}
              <div className="kiosk-action-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', width: '100%' }}>
                <div className="kiosk-action-card start" onClick={() => handleActionClick('shift_start')} style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🟢</div>
                  <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل حضور</div>
                  <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>بدء وردية جديدة</div>
                </div>
                
                <div className="kiosk-action-card end" onClick={() => handleActionClick('shift_end')} style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🔴</div>
                  <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل انصراف</div>
                  <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>إنهاء الوردية الحالية</div>
                </div>

                <div className="kiosk-action-card break-out" onClick={() => handleActionClick('break_start')} style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>☕</div>
                  <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>بدء بريك</div>
                  <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>فترة استراحة</div>
                </div>

                <div className="kiosk-action-card break-in" onClick={() => handleActionClick('break_end')} style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>▶️</div>
                  <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>عودة من البريك</div>
                  <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>استكمال الوردية</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeAction && (
        <FaceVerificationOverlay 
          employee={matchedEmp}
          actionType={activeAction}
          onVerifySuccess={onVerifySuccess}
          onVerifyFailed={onVerifyFailed}
          onCancel={() => setActiveAction(null)}
          biometricType={matchedEmp?.preferred_biometric || orgSettings?.biometricType || 'face'}
        />
      )}
    </div>
  );
}
