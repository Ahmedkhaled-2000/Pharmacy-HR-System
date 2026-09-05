import React, { useEffect, useState } from 'react';

export default function KioskConfirmModal({ confirmData, onClose }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!confirmData) return;
    const duration = confirmData.autoCloseMs || 3500;
    const intervalTime = 50;
    const step = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          if (onClose) onClose();
          return 0;
        }
        return prev - step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [confirmData, onClose]);

  if (!confirmData) return null;

  const { actionType, empName, branchName, timeStr, dateStr } = confirmData;

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
      onClick={onClose}
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
            {config.greeting}
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
            onClick={onClose}
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
        <div style={{ background: '#e2e8f0', height: '4px', width: '100%' }}>
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
