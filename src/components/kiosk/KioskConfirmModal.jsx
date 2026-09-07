import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useUI } from '../../context/UIContext';

export default function KioskConfirmModal({ confirmData, kioskConfirmModal: propKioskConfirmModal, onClose }) {
  let uiContext = null;
  try {
    // Safely attempt to read UIContext if inside UIProvider
    uiContext = useUI();
  } catch (e) {
    uiContext = null;
  }

  const kioskConfirmModal = propKioskConfirmModal || uiContext?.kioskConfirmModal;
  const setKioskConfirmModal = uiContext?.setKioskConfirmModal;

  const [progress, setProgress] = useState(100);

  // Normalize data from either local confirmData or UIContext kioskConfirmModal
  const effectiveData = useMemo(() => {
    if (confirmData && confirmData.open !== false) {
      return {
        actionType: confirmData.actionType || 'shift_start',
        empName: confirmData.empName || '',
        branchName: confirmData.branchName || '',
        timeStr: confirmData.timeStr || '',
        dateStr: confirmData.dateStr || '',
        message: confirmData.message || '',
        autoCloseMs: confirmData.autoCloseMs || 3500
      };
    }
    if (kioskConfirmModal && kioskConfirmModal.open) {
      const typeMap = {
        checkin: 'shift_start',
        shift_start: 'shift_start',
        checkout: 'shift_end',
        shift_end: 'shift_end',
        pause: 'break_start',
        break_start: 'break_start',
        resume: 'break_end',
        break_end: 'break_end'
      };
      const actionType = typeMap[kioskConfirmModal.type] || kioskConfirmModal.actionType || 'shift_start';

      let timeStr = kioskConfirmModal.timestamp || '';
      let dateStr = '';
      if (timeStr && timeStr.includes('·')) {
        const parts = timeStr.split('·').map(s => s.trim());
        dateStr = parts[0] || '';
        timeStr = parts[1] || '';
      }

      return {
        actionType,
        empName: kioskConfirmModal.empName || '',
        branchName: kioskConfirmModal.branchName || '',
        timeStr: timeStr || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        dateStr: dateStr || new Date().toLocaleDateString('ar-EG'),
        message: kioskConfirmModal.message || '',
        autoCloseMs: kioskConfirmModal.autoCloseMs || 3500
      };
    }
    return null;
  }, [
    confirmData,
    kioskConfirmModal?.open,
    kioskConfirmModal?.type,
    kioskConfirmModal?.empName,
    kioskConfirmModal?.branchName,
    kioskConfirmModal?.timestamp,
    kioskConfirmModal?.message,
    kioskConfirmModal?.actionType,
    kioskConfirmModal?.autoCloseMs
  ]);

  // Unified close handler that guarantees state clearance
  const handleClose = useCallback(() => {
    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch (err) {
        console.error('KioskConfirmModal onClose error:', err);
      }
    }
    if (typeof setKioskConfirmModal === 'function') {
      try {
        setKioskConfirmModal({ open: false });
      } catch (err) {
        console.error('KioskConfirmModal setKioskConfirmModal error:', err);
      }
    }
  }, [onClose, setKioskConfirmModal]);

  // Auto-dismiss countdown timer + smooth visual progress bar
  useEffect(() => {
    if (!effectiveData) {
      setProgress(100);
      return;
    }

    setProgress(100);
    const duration = effectiveData.autoCloseMs || 3500;
    const startTime = Date.now();

    // 1. Guaranteed auto-close timeout
    const closeTimer = setTimeout(() => {
      handleClose();
    }, duration);

    // 2. Smooth progress bar decrement based on wall-clock elapsed time
    const intervalTime = 35;
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remainingPct);
      if (remainingPct <= 0) {
        clearInterval(progressTimer);
      }
    }, intervalTime);

    // 3. Escape key listener to close
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(closeTimer);
      clearInterval(progressTimer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [effectiveData, handleClose]);

  if (!effectiveData) return null;

  const { actionType, empName, branchName, timeStr, dateStr, message } = effectiveData;

  const actionConfigs = {
    shift_start: {
      title: 'تم تسجيل الحضور بنجاح!',
      greeting: `أهلاً بك يا ${empName || 'زميلنا'}، نتمنى لك يوماً موفقاً ومباركاً 🌸`,
      badge: '🟢 تسجيل حضور (بداية وردية)',
      gradient: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
      borderColor: '#10b981',
      icon: '✅'
    },
    shift_end: {
      title: 'تم تسجيل الانصراف بنجاح!',
      greeting: `شكراً لجهودك وتفانيك اليوم يا ${empName || 'زميلنا'}، في رعاية الله وحفظه 👋`,
      badge: '🔴 تسجيل انصراف (نهاية وردية)',
      gradient: 'linear-gradient(135deg, #9f1239 0%, #e11d48 100%)',
      borderColor: '#f43f5e',
      icon: '👋'
    },
    break_start: {
      title: 'تم تسجيل بدء البريك بنجاح!',
      greeting: `استراحة هنيئة ومريحة يا ${empName || 'زميلنا'} ☕`,
      badge: '☕ بدء فترة استراحة (بريك)',
      gradient: 'linear-gradient(135deg, #92400e 0%, #d97706 100%)',
      borderColor: '#f59e0b',
      icon: '☕'
    },
    break_end: {
      title: 'تم العودة من البريك بنجاح!',
      greeting: `عوداً حميداً لاستكمال الوردية يا ${empName || 'زميلنا'} ✨`,
      badge: '▶️ عودة من الاستراحة (استئناف عمل)',
      gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
      borderColor: '#14b8a6',
      icon: '▶️'
    }
  };

  const config = actionConfigs[actionType] || actionConfigs.shift_start;
  const displayGreeting = message || config.greeting;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={handleClose}
    >
      <div
        className="fade-in"
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '520px',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          border: `2.5px solid ${config.borderColor}`,
          textAlign: 'center',
          animation: 'popIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Top */}
        <div
          style={{
            background: config.gradient,
            padding: '30px 24px 24px 24px',
            color: '#ffffff',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              fontSize: '36px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
            }}
          >
            {config.icon}
          </div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, fontFamily: 'Cairo, Tajawal, sans-serif' }}>
            {config.title}
          </h2>
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(255, 255, 255, 0.22)',
              padding: '4px 14px',
              borderRadius: '999px',
              fontSize: '12.5px',
              fontWeight: 800
            }}
          >
            {config.badge}
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
          <p
            style={{
              fontSize: '16px',
              fontWeight: 800,
              color: '#1e293b',
              lineHeight: '1.6',
              margin: '0 0 20px 0'
            }}
          >
            {displayGreeting}
          </p>

          {/* Details Pill Strip */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              fontSize: '13.5px',
              color: '#334155',
              marginBottom: '20px'
            }}
          >
            <div>
              <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>الوقت المسجل</span>
              <strong style={{ color: '#0f766e', fontSize: '15px' }}>⏱️ {timeStr || 'الآن'}</strong>
            </div>
            <div style={{ width: '1px', height: '28px', background: '#cbd5e1' }}></div>
            <div>
              <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>الفرع</span>
              <strong style={{ color: '#0f172a' }}>🏢 {branchName || 'الفرع'}</strong>
            </div>
            {dateStr && (
              <>
                <div style={{ width: '1px', height: '28px', background: '#cbd5e1' }}></div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>التاريخ</span>
                  <strong style={{ color: '#475569' }}>📅 {dateStr}</strong>
                </div>
              </>
            )}
          </div>

          {/* Close Button */}
          <button
            type="button"
            className="btn btn-start"
            onClick={handleClose}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 800,
              background: config.gradient,
              border: 'none',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            تم ومتابعة (إغلاق)
          </button>
        </div>

        {/* Progress Bar (Auto-Close) */}
        <div style={{ background: '#e2e8f0', height: '5px', width: '100%', overflow: 'hidden' }}>
          <div
            style={{
              background: config.borderColor,
              height: '100%',
              width: `${progress}%`,
              transition: 'width 0.05s linear'
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}
