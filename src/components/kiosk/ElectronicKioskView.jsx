import React, { useState, useEffect } from 'react';
import { fetchCurrentIP, checkDeviceAuthorization } from '../../utils/deviceAuth';
import FaceVerificationOverlay from '../attendance/FaceVerificationOverlay';
import KioskConfirmModal from './KioskConfirmModal';
import { useData } from '../../context/DataContext';
import { uploadBiometricAttendancePhoto } from '../../utils/googleDriveService';
import { sendBiometricAttendanceEmail } from '../../utils/gmailService';
import { preWarmFaceModels } from '../../utils/faceApiHelper';
import '../../kiosk-modern.css';

export default function ElectronicKioskView({
  state,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  submitRequest,
  kioskBranchId
}) {
  const { setState, saveState } = useData();
  const { orgSettings, employees, ipRestrictions } = state;
  const [now, setNow] = useState(Date.now());
  const [currentIp, setCurrentIp] = useState('');
  const [authStatus, setAuthStatus] = useState({ isAuthorized: true });
  
  const [inputCode, setInputCode] = useState('');
  const [matchedEmp, setMatchedEmp] = useState(null);
  const [blockedStatusModal, setBlockedStatusModal] = useState(null);
  const [confirmModalData, setConfirmModalData] = useState(null);
  const [pendingDirectiveModal, setPendingDirectiveModal] = useState(null);
  
  const [activeAction, setActiveAction] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  
  const activeShift = matchedEmp ? state.activeShifts?.[matchedEmp.id] : null;

  useEffect(() => {
    // التحميل الاستباقي لمحرك الوجه في الكشك ليعمل فورياً عند وقوف أي موظف
    preWarmFaceModels();
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
      // 1. Check if employee is Resigned or Terminated
      if (emp.status === 'تم الاستقالة' || emp.is_active === false || emp.isTerminated || emp.resignationStatus === 'approved') {
        setBlockedStatusModal({
          type: 'resigned',
          emp,
          reason: emp.terminationReason || emp.suspensionReason || 'تم إنهاء خدمة الموظف / استقالة رسمية مسجلة بالنظام.',
          date: emp.terminatedAt || null
        });
        setMatchedEmp(null);
        setInputCode('');
        return;
      }

      // 2. Check if employee's biometric or account is temporarily suspended
      if (emp.biometricSuspended || emp.punchDisabled || emp.accountSuspended || emp.status === 'معلق') {
        setBlockedStatusModal({
          type: 'suspended',
          emp,
          reason: emp.suspensionReason || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق',
          date: emp.suspendedAt || null
        });
        setMatchedEmp(null);
        setInputCode('');
        return;
      }

      if (kioskBranchId) {
        const belongsToBranch = emp.branchId === kioskBranchId || (emp.branchesDetails && emp.branchesDetails.some(b => b.branchId === kioskBranchId));
        if (!belongsToBranch) {
          alert('هذا الموظف غير مسموح له بالدخول إلى هذا الفرع.');
          setMatchedEmp(null);
          setInputCode('');
          return;
        }
      }

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
      
      let defaultBranchId = kioskBranchId || emp.branchId || '';
      if (!defaultBranchId && emp.branchesDetails && emp.branchesDetails.length > 0) {
        defaultBranchId = emp.branchesDetails[0].branchId;
      }
      setSelectedBranchId(defaultBranchId);
      setMatchedEmp(emp);

      // Check if there is an active unconfirmed directive requiring kiosk confirmation
      const activeDirs = (state?.adminDirectives || []).filter(d => d.status !== 'archived' && d.requireKioskConfirm !== false);
      const unconfirmed = activeDirs.find(d => {
        const matchesScope = d.scope === 'all' ||
          (d.scope === 'branch' && String(d.targetBranchId) === String(defaultBranchId || emp.branchId)) ||
          (d.scope === 'employee' && String(d.targetEmployeeId) === String(emp.id)) ||
          (d.scope === 'job' && String(d.targetJobTitle || '').trim().toLowerCase() === String(emp.jobTitle || '').trim().toLowerCase());
        if (!matchesScope) return false;
        const alreadyConfirmed = (d.readConfirmations || []).some(c => String(c.employeeId) === String(emp.id));
        return !alreadyConfirmed;
      });

      if (unconfirmed) {
        setPendingDirectiveModal(unconfirmed);
      } else {
        setPendingDirectiveModal(null);
      }
    } else {
      alert('كود الموظف غير صحيح.');
      setMatchedEmp(null);
    }
  };

  const handleActionClick = (action) => {
    if (action === 'shift_start' && activeShift) {
      alert('لديك وردية مفتوحة بالفعل. يرجى تسجيل الانصراف أولاً.');
      return;
    }
    if (action === 'shift_end' && !activeShift) {
      alert('ليس لديك وردية مفتوحة لتسجيل الانصراف.');
      return;
    }
    if (action === 'break_start' && (!activeShift || activeShift.isPaused)) {
      alert('لا يمكنك بدء بريك الآن.');
      return;
    }
    if (action === 'break_end' && (!activeShift || !activeShift.isPaused)) {
      alert('أنت لست في فترة بريك.');
      return;
    }
    setActiveAction(action);
  };

  const onVerifySuccess = (actionType) => {
    setActiveAction(null);
    executeAction(actionType);
  };

  const onVerifyFailed = async (actionType, photoUrl) => {
    setActiveAction(null);
    const empBiometricType = matchedEmp?.preferred_biometric || orgSettings?.biometricType || 'face';
    const isHand = empBiometricType === 'hand';

    const actionLabels = {
      shift_start: 'تسجيل دخول (بداية الوردية)',
      shift_end: 'تسجيل خروج (نهاية الوردية)',
      break_start: 'بدء استراحة (بريك)',
      break_end: 'انتهاء استراحة (بريك)'
    };
    const actionBadges = {
      shift_start: '🟢 بصمة دخول',
      shift_end: '🔴 بصمة خروج',
      break_start: '☕ بدء بريك',
      break_end: '⏱️ انتهاء بريك'
    };
    const actionLabel = actionLabels[actionType] || actionType;
    const actionBadge = actionBadges[actionType] || '📸 بصمة بالصورة';
    const effectiveBranchId = selectedBranchId || matchedEmp?.branchId || kioskBranchId;
    const branchObj = (state?.branches || []).find(b => String(b.id) === String(effectiveBranchId));
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // 1. Upload photo to employee's Google Drive folder if configured
    let driveResult = null;
    const driveConfig = orgSettings?.googleDrive || state?.orgSettings?.googleDrive;
    if (driveConfig && driveConfig.serviceUrl && photoUrl) {
      try {
        driveResult = await uploadBiometricAttendancePhoto({
          employee: matchedEmp,
          photoDataUrl: photoUrl,
          actionType,
          driveConfig
        });
      } catch (driveErr) {
        console.warn('Failed to upload attendance photo to Google Drive:', driveErr);
      }
    }

    // 2. Build standardized Biometric Attendance Request with exact punch action & timestamp
    const requestId = 'REQ-BIO-' + Date.now();
    const requestData = {
      id: requestId,
      type: 'biometric_verification',
      requestType: 'biometric_verification',
      typeLabel: `اعتماد حضور بالصورة: ${actionBadge}`,
      employeeId: matchedEmp.id,
      employeeCode: matchedEmp.code,
      employeeName: matchedEmp.name,
      branchId: effectiveBranchId,
      branchName: branchName,
      targetAction: actionType,
      actionType: actionType,
      actionLabel: actionLabel,
      actionBadge: actionBadge,
      date: dateStr,
      time: timeStr,
      timestamp: now.toISOString(),
      epoch: now.getTime(),
      createdAt: now.toISOString(),
      status: 'pending',
      requiresBranchManager: true,
      requiresSuperAdmin: true,
      branchApproved: false,
      adminApproved: false,
      details: `طلب اعتماد ${actionBadge} (${actionLabel}) بالصورة الحية. وقت التوثيق والطلب: ${timeStr} بتاريخ ${dateStr}.`,
      notes: `تعذر التحقق من بصمة ${isHand ? 'اليد' : 'الوجه'} لـ 3 مرات متتالية عند محاولة (${actionLabel}). تم التقاط صورة حية للموظف في تمام ${timeStr} وإرسالها للاعتماد. لا تُعتمد الوردية إلا بموافقة الإدارة العليا وسيتم بدءها/إنهاؤها في نفس وقت إرسال الطلب (${timeStr}).`,
      photoUrl: photoUrl || null,
      drivePhotoUrl: driveResult?.fileUrl || null,
      driveFileId: driveResult?.fileId || null
    };

    // 3. Create Notification for Higher Management and Branch Manager
    const newNotif = {
      id: 'NOTIF-BIO-' + Date.now(),
      type: 'biometric_verification',
      targetRole: 'branch_and_admin',
      branchId: effectiveBranchId,
      title: `📸 طلب اعتماد [${actionBadge}]: ${matchedEmp.name}`,
      message: `طلب اعتماد ${actionBadge} (${actionLabel}) بالصورة للموظف ${matchedEmp.name} في تمام الساعة ${timeStr} بتاريخ ${dateStr}. لن تُعتمد الوردية إلا بموافقة الإدارة العليا.`,
      requestId: requestId,
      employeeId: matchedEmp.id,
      employeeName: matchedEmp.name,
      targetAction: actionType,
      actionBadge: actionBadge,
      time: timeStr,
      date: dateStr,
      photoUrl: photoUrl || null,
      drivePhotoUrl: driveResult?.fileUrl || null,
      createdAt: now.toISOString(),
      read: false,
      readBy: []
    };

    // 4. Save into state and Supabase / DB (SHIFT IS NOT STARTED/STOPPED UNTIL SUPER ADMIN APPROVAL)
    const currentRequests = state?.requests || [];
    const currentNotifs = state?.notifications || [];
    const updatedState = {
      ...state,
      requests: [requestData, ...currentRequests],
      notifications: [newNotif, ...currentNotifs],
      _requestsUpdatedAt: now.toISOString(),
      _notificationsUpdatedAt: now.toISOString()
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (submitRequest) {
      submitRequest(requestData);
    }

    // 5. Send Gmail Email Notification if configured
    const gmailConfig = orgSettings?.gmailConfig || state?.orgSettings?.gmailConfig;
    if (gmailConfig && gmailConfig.serviceUrl && (gmailConfig.notifyOnAttendanceAnomaly !== false || gmailConfig.notifyOnNewRequest !== false)) {
      sendBiometricAttendanceEmail({
        gmailConfig,
        empName: matchedEmp.name,
        empCode: matchedEmp.code,
        branchName,
        actionType,
        timeStr,
        dateStr,
        drivePhotoUrl: driveResult?.fileUrl || null,
        photoUrl: photoUrl || null
      }).catch(err => console.warn('Gmail biometric notification failed:', err));
    }

    alert(`📸 تم التقاط الصورة وإرسال طلب اعتماد [${actionBadge}] بنجاح!\n\nوقت المحاولة المحفوظ: ${timeStr} بتاريخ ${dateStr}.\n\n⚠️ ملاحظة: لن تُعتمد البصمة في السجلات إلا بعد موافقة الإدارة العليا، وعند الموافقة سيتم احتساب وقت الوردية بنفس وقت التوثيق أعلاه (${timeStr}).\n\n${driveResult?.success ? 'تم حفظ الصورة بمجلد الموظف على Google Drive ☁️' : 'تم إرسال الإشعار للإدارة بنجاح.'}`);
    setMatchedEmp(null);
    setInputCode('');
  };

  const executeAction = async (actionType) => {
    if (!matchedEmp) return;
    const empId = matchedEmp.id;
    const empName = matchedEmp.name;
    const effectiveBranchId = selectedBranchId || matchedEmp.branchId || kioskBranchId;
    const branchObj = (state?.branches || []).find(b => String(b.id) === String(effectiveBranchId)) || state?.branches?.[0];
    const branchName = branchObj ? branchObj.name : 'الفرع';
    const nowD = new Date();
    const timeStr = nowD.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const dateStr = nowD.toLocaleDateString('ar-EG');

    try {
      if (actionType === 'shift_start') {
        if (startShift) await startShift(empId, 'kiosk', effectiveBranchId);
      } else if (actionType === 'break_start') {
        if (pauseShift) await pauseShift(empId, 'kiosk');
      } else if (actionType === 'break_end') {
        if (resumeShift) await resumeShift(empId, 'kiosk');
      } else if (actionType === 'shift_end') {
        if (stopShift) await stopShift(empId, 'kiosk');
      }
    } catch (err) {
      console.error('Kiosk punch execution error:', err);
    }

    setConfirmModalData({
      open: true,
      actionType,
      empName,
      branchName,
      timeStr,
      dateStr,
      autoCloseMs: 3500
    });
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
          {orgSettings?.logoUrl && (
            <div style={{ marginBottom: '6px' }}>
              <img
                src={orgSettings.logoUrl}
                alt="شعار المؤسسة"
                style={{
                  maxHeight: '60px',
                  maxWidth: '160px',
                  objectFit: 'contain',
                  background: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}
              />
            </div>
          )}
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

              {/* ── Admin Directive Interception (Requirement 8) ── */}
              {pendingDirectiveModal ? (
                <div style={{
                  background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                  border: '2px solid #f59e0b',
                  borderRadius: '20px',
                  padding: '24px 20px',
                  boxShadow: '0 10px 30px rgba(245,158,11,0.2)',
                  textAlign: 'center',
                  width: '100%'
                }}>
                  <div style={{ fontSize: '38px', marginBottom: '8px' }}>🚨</div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 900, color: '#92400e', fontFamily: 'Cairo, sans-serif' }}>
                    تعليمات إدارية ملزمة من الإدارة العليا
                  </h3>
                  <div style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 700, marginBottom: '16px' }}>
                    مطلوب قراءة القرار والموافقة عليه قبل إتاحة تسجيل البصمة
                  </div>
                  
                  <div style={{
                    background: '#ffffff',
                    border: '1.5px solid #fde68a',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    textAlign: 'right',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    marginBottom: '16px',
                    fontSize: '13.5px',
                    color: '#1e293b',
                    lineHeight: '1.7'
                  }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px', fontSize: '15px' }}>
                      📌 {pendingDirectiveModal.title}
                    </div>
                    <div style={{ whiteSpace: 'pre-line' }}>
                      {pendingDirectiveModal.content}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={async () => {
                      const newConfirmation = {
                        employeeId: matchedEmp.id,
                        employeeName: matchedEmp.name,
                        employeeCode: matchedEmp.code,
                        confirmedAt: new Date().toISOString()
                      };
                      const updatedDirs = (state?.adminDirectives || []).map(d => {
                        if (d.id === pendingDirectiveModal.id) {
                          return {
                            ...d,
                            readConfirmations: [...(d.readConfirmations || []), newConfirmation]
                          };
                        }
                        return d;
                      });
                      const updatedState = { ...state, adminDirectives: updatedDirs };
                      if (setState) setState(updatedState);
                      if (saveState) await saveState(updatedState);
                      setPendingDirectiveModal(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 900,
                      background: 'linear-gradient(135deg, #059669, #10b981)',
                      border: 'none',
                      color: '#fff',
                      boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ قرأت وفهمت التعليمات وأوافق عليها
                  </button>
                </div>
              ) : (
                /* Actions Grid */
                <div className="kiosk-action-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', width: '100%' }}>
                  <div 
                    className={`kiosk-action-card start ${activeShift ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('shift_start')} 
                    style={{ opacity: activeShift ? 0.5 : 1, pointerEvents: activeShift ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🟢</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل حضور</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>بدء وردية جديدة</div>
                  </div>
                  
                  <div 
                    className={`kiosk-action-card end ${!activeShift ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('shift_end')} 
                    style={{ opacity: !activeShift ? 0.5 : 1, pointerEvents: !activeShift ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🔴</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل انصراف</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>إنهاء الوردية الحالية</div>
                  </div>

                  <div 
                    className={`kiosk-action-card break-out ${(!activeShift || activeShift.isPaused) ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('break_start')} 
                    style={{ opacity: (!activeShift || activeShift.isPaused) ? 0.5 : 1, pointerEvents: (!activeShift || activeShift.isPaused) ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>☕</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>بدء بريك</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>فترة استراحة</div>
                  </div>

                  <div 
                    className={`kiosk-action-card break-in ${(!activeShift || !activeShift.isPaused) ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('break_end')} 
                    style={{ opacity: (!activeShift || !activeShift.isPaused) ? 0.5 : 1, pointerEvents: (!activeShift || !activeShift.isPaused) ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>▶️</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>عودة من البريك</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>استكمال الوردية</div>
                  </div>
                </div>
              )}
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

      {/* ── Blocked / Suspended / Resigned Employee Notification Modal ── */}
      {blockedStatusModal && (
        <div className="modal-backdrop" style={{ zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-content card"
            style={{
              maxWidth: '520px',
              width: '94%',
              padding: '28px',
              borderRadius: '24px',
              border: `2px solid ${blockedStatusModal.type === 'resigned' ? '#450a0a' : '#ef4444'}`,
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              fontFamily: "'Tajawal', sans-serif"
            }}
          >
            {/* Warning Icon Badge */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: blockedStatusModal.type === 'resigned' ? '#fee2e2' : '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 16px auto',
              boxShadow: '0 8px 16px rgba(220, 38, 38, 0.15)'
            }}>
              {blockedStatusModal.type === 'resigned' ? '🚫' : '⛔'}
            </div>

            {/* Title */}
            <h3 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', fontSize: '20px', fontWeight: 800, color: '#991b1b' }}>
              عذراً، لا يمكن تسجيل الدخول أو الحضور
            </h3>
            <span style={{
              display: 'inline-block',
              background: blockedStatusModal.type === 'resigned' ? '#450a0a' : '#fee2e2',
              color: blockedStatusModal.type === 'resigned' ? '#ffffff' : '#b91c1c',
              fontSize: '12px',
              fontWeight: 800,
              padding: '3px 12px',
              borderRadius: '20px',
              marginBottom: '18px'
            }}>
              {blockedStatusModal.type === 'resigned' ? '⚠️ الموظف منهي خدمته / استقالة مسجلة' : '⏸️ تم إيقاف البصمة مؤقتاً'}
            </span>

            {/* Employee Card */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'right' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e2e8f0', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, flexShrink: 0 }}>
                {blockedStatusModal.emp?.photoUrl ? (
                  <img src={blockedStatusModal.emp.photoUrl} alt={blockedStatusModal.emp.name} style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />
                ) : (
                  blockedStatusModal.emp?.name?.slice(0, 1) || '👤'
                )}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '15px', color: '#1e293b', display: 'block' }}>{blockedStatusModal.emp?.name}</strong>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  كود الموظف: <strong style={{ fontFamily: 'monospace' }}>{blockedStatusModal.emp?.code}</strong> · {blockedStatusModal.emp?.jobTitle || 'موظف'}
                </span>
              </div>
            </div>

            {/* Reason Box */}
            <div style={{ background: '#fff5f5', border: '1.5px dashed #fca5a5', borderRadius: '12px', padding: '14px', marginBottom: '18px', textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '13px', marginBottom: '6px' }}>
                📌 سبب منع الدخول:
              </div>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#7f1d1d', fontWeight: 600, lineHeight: '1.6' }}>
                {blockedStatusModal.reason}
              </p>
              {blockedStatusModal.date && (
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '6px' }}>
                  تاريخ تسجيل الإجراء: {new Date(blockedStatusModal.date).toLocaleDateString('ar-EG')}
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 18px 0', fontSize: '12.5px', color: '#64748b' }}>
              * يرجى مراجعة إدارة الموارد البشرية أو الإدارة العليا للاستفسار أو إعادة تفعيل البصمة.
            </p>

            {/* Close Button */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setBlockedStatusModal(null)}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '14px',
                background: '#dc2626',
                border: 'none'
              }}
            >
              حسناً، فهمت ذلك
            </button>
          </div>
        </div>
      )}

      {/* Kiosk Confirmation / Greeting Modal */}
      {confirmModalData && (
        <KioskConfirmModal
          confirmData={confirmModalData}
          onClose={() => {
            setConfirmModalData(null);
            setMatchedEmp(null);
            setInputCode('');
          }}
        />
      )}
    </div>
  );
}
