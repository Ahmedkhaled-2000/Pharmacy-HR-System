import React, { useState } from 'react';
import { syncNow } from '../../utils/offlineSync';

export default function OfflineStateOverlay({
  isOffline,
  pendingCount = 0,
  onRetrySync,
  showToast
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!isOffline) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetrySync) {
        await onRetrySync();
      } else {
        const res = await syncNow();
        if (res.success) {
          showToast?.('✅ تم استعادة الاتصال ومزامنة البيانات بنجاح!');
        } else {
          showToast?.('⚠️ ما زال الجهاز غير متصل بالإنترنت');
        }
      }
    } catch (e) {
      showToast?.('⚠️ تعذر الاتصال: ' + (e.message || 'خطأ في الشبكة'));
    } finally {
      setIsRetrying(false);
    }
  };

  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 99999,
          background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
          color: '#ffffff',
          padding: '10px 18px',
          borderRadius: '30px',
          boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          fontFamily: "'Cairo', 'Tajawal', sans-serif",
          fontSize: '0.9rem',
          fontWeight: '700',
          animation: 'pulse 2s infinite'
        }}
      >
        <span>📴</span>
        <span>وضع عدم الاتصال بالإنترنت</span>
        {pendingCount > 0 && (
          <span
            style={{
              background: '#ffffff',
              color: '#b91c1c',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '0.8rem',
              fontWeight: '900'
            }}
          >
            {pendingCount} معلق
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          color: 'var(--text, #0f172a)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: '24px',
          padding: '36px 32px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          textAlign: 'center',
          position: 'relative'
        }}
      >
        <button
          onClick={() => setIsMinimized(true)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'none',
            border: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            color: 'var(--muted, #64748b)',
            padding: '6px'
          }}
          title="تصغير الإشعار"
        >
          ✕
        </button>

        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '38px',
            margin: '0 auto 20px'
          }}
        >
          📴
        </div>

        <h3
          style={{
            margin: '0 0 10px',
            fontSize: '1.4rem',
            fontWeight: '800',
            color: 'var(--text, #0f172a)'
          }}
        >
          انقطع الاتصال بالإنترنت
        </h3>

        <p
          style={{
            margin: '0 0 20px',
            color: 'var(--muted, #64748b)',
            fontSize: '0.95rem',
            lineHeight: '1.6'
          }}
        >
          أنت الآن في وضع عدم الاتصال. يمكنك متابعة العمل وتسجيل البصمات، حيث يتم حفظ كافة الإجراءات محلياً وسيتم رفعها للسيرفر فور عودة الاتصال.
        </p>

        {pendingCount > 0 && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '10px 14px',
              marginBottom: '22px',
              fontSize: '0.88rem',
              color: '#d97706',
              fontWeight: '600'
            }}
          >
            ⏳ يوجد ({pendingCount}) عملية معلقة بانتظار المزامنة السحابية.
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: isRetrying ? 0.7 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            <span>{isRetrying ? '⏳' : '🔄'}</span>
            <span>{isRetrying ? 'جاري فحص الاتصال...' : 'إعادة فحص الاتصال الآن'}</span>
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            style={{
              background: 'var(--bg, #f1f5f9)',
              color: 'var(--text, #334155)',
              border: '1px solid var(--border, #cbd5e1)',
              borderRadius: '12px',
              padding: '12px 18px',
              fontSize: '0.92rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            متابعة أوف لاين
          </button>
        </div>
      </div>
    </div>
  );
}
