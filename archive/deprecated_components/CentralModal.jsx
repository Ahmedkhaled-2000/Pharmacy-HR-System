import React, { useEffect } from 'react';

/**
 * 💎 CentralModal - المحرك المركزي الموحد لجميع النوافذ المنبثقة
 * يضمن:
 * 1. احتواء كامل لمحتويات النافذة وعدم قص أي أزرار أو حقول نهائياً
 * 2. تمرير رأسي ذكي (Smart Responsive Scroll) لجميع مقاسات الشاشات والهواتف
 * 3. ثبات أزرار الإجراءات في الأسفل (Sticky Actions Footer)
 * 4. إغلاق سلس بزر Escape ومنع تمرير الصفحة الخلفية
 */
export default function CentralModal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  badge,
  maxWidth = '540px',
  children,
  footer,
  theme = 'default', // 'default' | 'royal-gold' | 'danger' | 'success' | 'primary'
  showCloseBtn = true,
  closeOnOverlayClick = true,
  zIndex = 2200,
  style = {}
}) {
  useEffect(() => {
    if (!isOpen) return;

    // منع تمرير محتوى الصفحة الخلفية أثناء فتح النافذة
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // إعدادات المظهر اللوني حسب الثيم
  const getThemeStyles = () => {
    switch (theme) {
      case 'royal-gold':
        return {
          headerBg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          headerColor: '#f8fafc',
          borderColor: '#f59e0b',
          iconBg: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
          iconBorder: '#fef3c7',
          shadow: '0 25px 50px -12px rgba(245, 158, 11, 0.25)',
          badgeColor: '#fbbf24',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeBorder: 'rgba(245, 158, 11, 0.4)'
        };
      case 'danger':
        return {
          headerBg: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
          headerColor: '#991b1b',
          borderColor: '#ef4444',
          iconBg: '#fee2e2',
          iconBorder: '#fca5a5',
          shadow: '0 25px 50px -12px rgba(239, 68, 68, 0.2)',
          badgeColor: '#b91c1c',
          badgeBg: '#fef2f2',
          badgeBorder: '#fca5a5'
        };
      case 'success':
        return {
          headerBg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          headerColor: '#166534',
          borderColor: '#22c55e',
          iconBg: '#dcfce7',
          iconBorder: '#86efac',
          shadow: '0 25px 50px -12px rgba(34, 197, 94, 0.2)',
          badgeColor: '#15803d',
          badgeBg: '#f0fdf4',
          badgeBorder: '#86efac'
        };
      case 'primary':
        return {
          headerBg: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
          headerColor: '#ffffff',
          borderColor: '#14b8a6',
          iconBg: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)',
          iconBorder: '#ccfbf1',
          shadow: '0 25px 50px -12px rgba(20, 184, 166, 0.25)',
          badgeColor: '#2dd4bf',
          badgeBg: 'rgba(45, 212, 191, 0.15)',
          badgeBorder: 'rgba(45, 212, 191, 0.4)'
        };
      case 'default':
      default:
        return {
          headerBg: 'var(--surface, #ffffff)',
          headerColor: 'var(--text, #0f172a)',
          borderColor: 'var(--border, #e2e8f0)',
          iconBg: 'var(--surface-muted, #f1f5f9)',
          iconBorder: 'var(--border, #cbd5e1)',
          shadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          badgeColor: 'var(--primary, #0d9488)',
          badgeBg: 'var(--primary-tint, #f0fdfa)',
          badgeBorder: 'var(--border, #ccfbf1)'
        };
    }
  };

  const themeStyles = getThemeStyles();

  return (
    <div
      className="central-modal-backdrop"
      style={{
        zIndex,
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        padding: 'clamp(12px, 3vh, 28px) clamp(8px, 2vw, 20px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box'
      }}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className="central-modal-card"
        style={{
          width: '100%',
          maxWidth,
          maxHeight: 'calc(100dvh - 28px)',
          background: 'var(--surface, #ffffff)',
          borderRadius: '24px',
          border: `2px solid ${themeStyles.borderColor}`,
          boxShadow: themeStyles.shadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: 'auto',
          boxSizing: 'border-box',
          position: 'relative',
          ...style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        {(title || icon || badge || showCloseBtn) && (
          <div
            style={{
              background: themeStyles.headerBg,
              color: themeStyles.headerColor,
              padding: '18px 22px 16px',
              borderBottom: `1.5px solid ${themeStyles.borderColor}`,
              position: 'relative',
              textAlign: 'center',
              flexShrink: 0
            }}
          >
            {showCloseBtn && (
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '14px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0, 0, 0, 0.08)',
                  color: themeStyles.headerColor,
                  fontSize: '16px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                ✕
              </button>
            )}

            {icon && (
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: themeStyles.iconBg,
                  border: `2px solid ${themeStyles.iconBorder}`,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  margin: '0 auto 10px auto',
                  boxShadow: '0 8px 16px rgba(0, 0, 0, 0.15)'
                }}
              >
                {icon}
              </div>
            )}

            {title && (
              <h3
                style={{
                  margin: 0,
                  fontFamily: 'Cairo',
                  fontSize: '18px',
                  fontWeight: 800,
                  color: themeStyles.headerColor,
                  lineHeight: '1.4'
                }}
              >
                {title}
              </h3>
            )}

            {subtitle && (
              <div
                style={{
                  fontSize: '13px',
                  opacity: 0.85,
                  marginTop: '4px',
                  color: themeStyles.headerColor
                }}
              >
                {subtitle}
              </div>
            )}

            {badge && (
              <div style={{ marginTop: '8px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    background: themeStyles.badgeBg,
                    color: themeStyles.badgeColor,
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: '20px',
                    border: `1px solid ${themeStyles.badgeBorder}`
                  }}
                >
                  {badge}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Scrollable Modal Content */}
        <div
          className="central-modal-body"
          style={{
            padding: '20px 22px',
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            boxSizing: 'border-box'
          }}
        >
          {children}
        </div>

        {/* Sticky Action Footer */}
        {footer && (
          <div
            className="central-modal-footer"
            style={{
              padding: '14px 22px',
              background: 'var(--surface, #ffffff)',
              borderTop: '1px solid var(--border, #f1f5f9)',
              position: 'sticky',
              bottom: 0,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              flexShrink: 0,
              boxSizing: 'border-box'
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
