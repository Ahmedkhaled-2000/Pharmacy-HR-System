import React, { useEffect } from 'react';
import {
  AlertTriangle,
  Send,
  Trash2,
  CheckCircle,
  HelpCircle,
  X,
  Loader2
} from 'lucide-react';

/**
 * OutstockConfirmModal.jsx
 * نافذة تأكيد منبثقة تفاعلية واحترافية لنظام النواقص والمشتريات
 * تستبدل دالة window.confirm() البدائية بتصميم أنيق يدعم اختصارات الكيبورد (Enter / Esc)
 */
export default function OutstockConfirmModal({
  isOpen,
  title = 'تأكيد الإجراء',
  message = 'هل أنت متأكد من تنفيذ هذا الإجراء؟',
  iconType = 'warning', // 'warning' | 'send' | 'danger' | 'success' | 'help'
  confirmText = 'تأكيد ومتابعة',
  cancelText = 'إلغاء وتراجع',
  confirmBtnStyle = 'primary', // 'primary' | 'danger' | 'success'
  details = null, // array of strings or object { label, value }
  badge = null,
  isProcessing = false,
  onConfirm,
  onClose
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && !isProcessing) {
        // إذا لم يكن المستخدم يكتب في حقل إدخال
        const tag = e.target.tagName?.toLowerCase();
        if (tag !== 'textarea' && tag !== 'input') {
          e.preventDefault();
          onConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onConfirm, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (iconType) {
      case 'send':
        return (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(13, 148, 136, 0.3)'
          }}>
            <Send size={26} />
          </div>
        );
      case 'danger':
        return (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(225, 29, 72, 0.3)'
          }}>
            <Trash2 size={26} />
          </div>
        );
      case 'success':
        return (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(5, 150, 105, 0.3)'
          }}>
            <CheckCircle size={26} />
          </div>
        );
      case 'warning':
      default:
        return (
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 8px 20px rgba(217, 119, 6, 0.3)'
          }}>
            <AlertTriangle size={26} />
          </div>
        );
    }
  };

  const getConfirmBtnClass = () => {
    switch (confirmBtnStyle) {
      case 'danger':
        return 'outstock-btn outstock-btn-danger';
      case 'success':
        return 'outstock-btn outstock-btn-success';
      case 'primary':
      default:
        return 'outstock-btn outstock-btn-primary';
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        zIndex: 10000,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="outstock-modal-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          animation: 'modalSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '24px 24px 18px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            {renderIcon()}
          </div>

          <h3 style={{
            margin: '0 0 8px',
            fontSize: '18px',
            fontWeight: '900',
            color: 'var(--text, #0f172a)'
          }}>
            {title}
          </h3>

          {badge && (
            <div style={{ margin: '0 auto 12px', display: 'inline-block' }}>
              <span className="outstock-badge partial" style={{ fontSize: '12px', padding: '3px 10px' }}>
                {badge}
              </span>
            </div>
          )}

          <p style={{
            margin: 0,
            fontSize: '13.5px',
            lineHeight: 1.6,
            color: 'var(--muted, #64748b)',
            fontWeight: '600'
          }}>
            {message}
          </p>

          {Array.isArray(details) && details.length > 0 && (
            <div style={{
              marginTop: '14px',
              padding: '10px 14px',
              background: 'var(--hover, rgba(13, 148, 136, 0.05))',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              textAlign: 'right',
              fontSize: '12.5px',
              color: 'var(--text, #1e293b)'
            }}>
              {details.map((d, idx) => (
                <div key={idx} style={{ margin: '3px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#0d9488', fontWeight: 'bold' }}>•</span>
                  <span>{typeof d === 'string' ? d : `${d.label}: ${d.value}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 20px',
          background: 'var(--surface-muted, #f8fafc)',
          borderTop: '1px solid var(--border-subtle, #e2e8f0)',
          display: 'flex',
          gap: '10px',
          justifyContent: 'flex-end',
          alignItems: 'center'
        }}>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={onClose}
            disabled={isProcessing}
            style={{ minWidth: '95px' }}
          >
            <X size={15} />
            <span>{cancelText}</span>
          </button>

          <button
            type="button"
            className={getConfirmBtnClass()}
            onClick={onConfirm}
            disabled={isProcessing}
            style={{ minWidth: '130px', fontWeight: '800' }}
            autoFocus
          >
            {isProcessing ? (
              <>
                <Loader2 size={16} className="spinner" />
                <span>جاري التنفيذ...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
