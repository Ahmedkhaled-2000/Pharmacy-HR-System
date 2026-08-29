import React, { useEffect } from 'react';

export default function ConfirmDialogModal({
  isOpen,
  title = 'تأكيد الإجراء',
  message = 'هل أنت متأكد من تنفيذ هذا الإجراء؟',
  confirmText = 'تأكيد الحذف',
  cancelText = 'إلغاء وتراجع',
  type = 'danger', // 'danger' | 'warning' | 'info' | 'primary'
  icon = null,
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  // Icon & Theme Styling based on type
  const getThemeConfig = () => {
    switch (type) {
      case 'warning':
        return {
          defaultIcon: '⚠️',
          iconBg: '#fef3c7',
          iconColor: '#d97706',
          iconBorder: '#fde68a',
          confirmBtnBg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
          confirmBtnShadow: '0 8px 20px rgba(217, 119, 6, 0.35)',
          titleColor: '#92400e'
        };
      case 'info':
      case 'primary':
        return {
          defaultIcon: 'ℹ️',
          iconBg: '#eff6ff',
          iconColor: '#2563eb',
          iconBorder: '#bfdbfe',
          confirmBtnBg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
          confirmBtnShadow: '0 8px 20px rgba(13, 148, 136, 0.35)',
          titleColor: '#0f766e'
        };
      case 'danger':
      default:
        return {
          defaultIcon: '🗑️',
          iconBg: '#fee2e2',
          iconColor: '#dc2626',
          iconBorder: '#fecaca',
          confirmBtnBg: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
          confirmBtnShadow: '0 8px 20px rgba(239, 68, 68, 0.35)',
          titleColor: '#991b1b'
        };
    }
  };

  const theme = getThemeConfig();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
        padding: '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          borderRadius: '24px',
          padding: '28px 26px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
          border: '1px solid var(--border, #e2e8f0)',
          textAlign: 'center',
          boxSizing: 'border-box',
          animation: 'scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Visual Badge Header */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: theme.iconBg,
            border: `2px solid ${theme.iconBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px auto',
            boxShadow: `0 8px 20px ${theme.iconBg}`
          }}
        >
          {icon || theme.defaultIcon}
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 10px 0',
            fontSize: '19px',
            fontWeight: '900',
            color: 'var(--text, #0f172a)'
          }}
        >
          {title}
        </h3>

        {/* Message */}
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '14.5px',
            color: 'var(--text-secondary, #475569)',
            lineHeight: '1.6',
            fontWeight: '500',
            wordBreak: 'break-word',
            whiteSpace: 'pre-line'
          }}
        >
          {message}
        </p>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            onClick={onConfirm}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '12px 20px',
              borderRadius: '12px',
              border: 'none',
              background: theme.confirmBtnBg,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: theme.confirmBtnShadow,
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <span>✓</span>
            <span>{confirmText}</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              minWidth: '110px',
              padding: '12px 18px',
              borderRadius: '12px',
              border: '1px solid var(--border, #e2e8f0)',
              background: 'var(--surface-muted, #f8fafc)',
              color: 'var(--text-secondary, #475569)',
              fontSize: '14px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--border, #e2e8f0)';
              e.currentTarget.style.color = 'var(--text, #0f172a)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-muted, #f8fafc)';
              e.currentTarget.style.color = 'var(--text-secondary, #475569)';
            }}
          >
            <span>✕</span>
            <span>{cancelText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
