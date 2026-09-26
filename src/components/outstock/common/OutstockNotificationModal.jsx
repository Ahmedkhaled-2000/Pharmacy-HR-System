import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Sparkles,
  X,
  Keyboard
} from 'lucide-react';

/**
 * OutstockNotificationModal.jsx
 * نافذة إشعارات منبثقة تفاعلية واحترافية لكافة تنبيهات وإشعارات النظام
 * تستبدل الـ alert() التقليدي بنافذة عصرية زجاجية مع تحكم بالألوان، الأيقونات، والمدة.
 */
export default function OutstockNotificationModal({
  notification = null,
  onClose
}) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);
  const progressTimerRef = useRef(null);

  if (!notification || !notification.message) return null;

  const rawMsg = String(notification.message || '');
  let detectedType = notification.type || 'info';

  if (!notification.type) {
    if (rawMsg.includes('✅') || rawMsg.includes('بنجاح') || rawMsg.includes('تم حفظ') || rawMsg.includes('تم إضافة')) {
      detectedType = 'success';
    } else if (rawMsg.includes('❌') || rawMsg.includes('خطأ') || rawMsg.includes('فشل') || rawMsg.includes('تعذر')) {
      detectedType = 'error';
    } else if (rawMsg.includes('⚠️') || rawMsg.includes('تحذير') || rawMsg.includes('يرجى') || rawMsg.includes('تنبيه')) {
      detectedType = 'warning';
    } else if (rawMsg.includes('⌨️') || rawMsg.includes('اختصارات')) {
      detectedType = 'shortcuts';
    }
  }

  // إزالة الرموز التعبيرية المكررة من بداية النص لتنسيق أنيق
  const cleanMessage = rawMsg.replace(/^[✅❌⚠️ℹ️⌨️📊🔍\s]+/, '').trim();
  const title = notification.title || (
    detectedType === 'success' ? 'تمت العملية بنجاح' :
    detectedType === 'error' ? 'تنبيه خطأ' :
    detectedType === 'warning' ? 'تنبيه هـام' :
    detectedType === 'shortcuts' ? 'دليل اختصارات لوحة المفاتيح' : 'إشعار النظام'
  );

  const isMultiLine = cleanMessage.includes('\n');
  const lines = isMultiLine ? cleanMessage.split('\n').filter(Boolean) : [cleanMessage];
  const autoCloseDuration = notification.duration !== undefined ? notification.duration : (isMultiLine ? 7000 : 3800);

  // إغلاق تلقائي مع شريط تقدم
  useEffect(() => {
    if (autoCloseDuration <= 0) return;

    const intervalStep = 50;
    const decrement = (intervalStep / autoCloseDuration) * 100;

    progressTimerRef.current = setInterval(() => {
      if (!isPaused) {
        setProgress((prev) => {
          if (prev <= 0) {
            clearInterval(progressTimerRef.current);
            onClose?.();
            return 0;
          }
          return Math.max(0, prev - decrement);
        });
      }
    }, intervalStep);

    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, [autoCloseDuration, isPaused, onClose]);

  // إغلاق بزر Esc أو Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // الألوان والسمات البصرية
  const themeConfig = {
    success: {
      color: '#059669',
      bgColor: '#f0fdf4',
      borderColor: '#86efac',
      glow: 'rgba(16, 185, 129, 0.25)',
      icon: <CheckCircle2 size={24} color="#059669" />
    },
    error: {
      color: '#dc2626',
      bgColor: '#fef2f2',
      borderColor: '#fca5a5',
      glow: 'rgba(239, 68, 68, 0.25)',
      icon: <XCircle size={24} color="#dc2626" />
    },
    warning: {
      color: '#d97706',
      bgColor: '#fffbeb',
      borderColor: '#fde68a',
      glow: 'rgba(245, 158, 11, 0.25)',
      icon: <AlertTriangle size={24} color="#d97706" />
    },
    shortcuts: {
      color: '#7c3aed',
      bgColor: '#faf5ff',
      borderColor: '#ddd6fe',
      glow: 'rgba(124, 58, 237, 0.25)',
      icon: <Keyboard size={24} color="#7c3aed" />
    },
    info: {
      color: '#0284c7',
      bgColor: '#f0f9ff',
      borderColor: '#bae6fd',
      glow: 'rgba(2, 132, 199, 0.25)',
      icon: <Info size={24} color="#0284c7" />
    }
  };

  const currentTheme = themeConfig[detectedType] || themeConfig.info;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(5px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'outstockFadeIn 0.18s ease-out'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: `1.5px solid ${currentTheme.borderColor}`,
          boxShadow: `0 20px 45px -10px ${currentTheme.glow}, 0 10px 25px rgba(0, 0, 0, 0.15)`,
          maxWidth: isMultiLine ? '520px' : '440px',
          width: '100%',
          overflow: 'hidden',
          direction: 'rtl',
          animation: 'outstockModalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* شريط التقدم الزمني العلوي */}
        {autoCloseDuration > 0 && (
          <div style={{ height: '4px', background: '#f1f5f9', width: '100%', position: 'relative' }}>
            <div
              style={{
                height: '100%',
                background: currentTheme.color,
                width: `${progress}%`,
                transition: 'width 0.05s linear'
              }}
            />
          </div>
        )}

        <div style={{ padding: '20px 24px' }}>
          {/* رأس التنبيه */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: currentTheme.bgColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${currentTheme.borderColor}`
                }}
              >
                {currentTheme.icon}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: '900', color: '#0f172a' }}>
                  {title}
                </h4>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  إشعار تلقائي من نظام النواقص والمشتريات
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '8px',
                color: '#64748b',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
            >
              <X size={16} />
            </button>
          </div>

          {/* محتوى الرسالة */}
          <div
            style={{
              background: currentTheme.bgColor,
              borderRadius: '12px',
              padding: '14px 16px',
              border: `1px solid ${currentTheme.borderColor}`,
              fontSize: '13.5px',
              lineHeight: '1.65',
              color: '#1e293b',
              fontWeight: '600'
            }}
          >
            {isMultiLine ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lines.map((line, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ color: currentTheme.color, fontWeight: '900' }}>•</span>
                    <span style={{ flex: 1 }}>{line.replace(/^•\s*/, '')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0 }}>{cleanMessage}</p>
            )}
          </div>

          {/* زر الإغلاق والتأكيد */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 24px',
                borderRadius: '10px',
                background: currentTheme.color,
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                fontSize: '13.5px',
                cursor: 'pointer',
                boxShadow: `0 4px 12px ${currentTheme.glow}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'transform 0.12s ease'
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <span>حسناً، فهمت</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
