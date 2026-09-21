import React, { useState, useEffect } from 'react';
import { Wrench, RefreshCw, AlertTriangle, Shield, ExternalLink, ArrowRight } from 'lucide-react';

/**
 * ScreenMaintenanceView
 * شاشة إشعار الصيانة المؤقتة للشاشات الموقوفة مع إمكانية الدخول في وضع Sandbox للمطور
 */
export default function ScreenMaintenanceView({
  screenId = '',
  screenTitle = 'هذه الصفحة',
  customMessage = '',
  onBypassSandbox = null,
  onNavigateHome = null
}) {
  const [countdown, setCountdown] = useState(15);
  const [isChecking, setIsChecking] = useState(false);
  const [isDevSession, setIsDevSession] = useState(false);

  useEffect(() => {
    try {
      const devToken = localStorage.getItem('app_auth_token') || '';
      const authRole = localStorage.getItem('app_auth_role') || '';
      if (authRole === 'developer' || devToken.includes('developer')) {
        setIsDevSession(true);
      }
    } catch {}
  }, []);

  // عداد إعادة الفحص التلقائي
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleCheckStatus();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/system/maintenance-status', { cache: 'no-store' });
      const data = await res.json();
      if (data?.success) {
        const disabledScreens = data.disabled_screens || [];
        if (!disabledScreens.includes(screenId)) {
          window.location.reload();
        }
      }
    } catch {} finally {
      setTimeout(() => setIsChecking(false), 600);
    }
  };

  const handleActivateSandbox = () => {
    if (onBypassSandbox) {
      onBypassSandbox(screenId);
    } else {
      try {
        sessionStorage.setItem(`sandbox_bypass_${screenId}`, 'true');
        sessionStorage.setItem('sandbox_bypass_global', 'true');
        window.location.reload();
      } catch {}
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        width: '100%',
        padding: '2rem 1.5rem',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          maxWidth: '580px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(245, 158, 11, 0.15)',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* شريط الإشعار العلوي باللون الكهرماني */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #f59e0b, #eab308, #f59e0b)'
          }}
        />

        {/* الأيقونة الحركية */}
        <div
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.9), rgba(253, 230, 138, 0.6))',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.25rem',
            margin: '0 auto 1.5rem auto',
            boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.3)',
            border: '2px solid rgba(245, 158, 11, 0.2)'
          }}
        >
          <Wrench size={38} style={{ animation: 'spin 12s linear infinite' }} />
        </div>

        {/* العناوين */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.82rem',
            fontWeight: '700',
            color: '#b45309',
            background: 'rgba(254, 243, 199, 0.8)',
            padding: '0.3rem 0.85rem',
            borderRadius: '999px',
            marginBottom: '0.85rem',
            border: '1px solid rgba(245, 158, 11, 0.25)'
          }}
        >
          <AlertTriangle size={15} /> خضوع مجدول للصيانة والترقية
        </span>

        <h2
          style={{
            fontSize: '1.45rem',
            fontWeight: '800',
            color: '#1e293b',
            margin: '0 0 0.75rem 0',
            lineHeight: 1.4
          }}
        >
          {screenTitle ? `شاشة (${screenTitle}) تحت الصيانة المؤقتة` : 'هذه الصفحة تخضع لأعمال الصيانة'}
        </h2>

        <p
          style={{
            fontSize: '0.95rem',
            color: '#64748b',
            lineHeight: 1.6,
            margin: '0 0 1.75rem 0'
          }}
        >
          {customMessage ||
            'يقوم فريق التطوير الهندسي حالياً بإجراء تحديثات وتحسينات جذرية على هذه الشاشة لضمان أقصى كفاءة واعتمادية. سيتم إعادة إتاحتها لجميع المستخدمين فور اكتمال الترقية.'}
        </p>

        {/* مؤشر الفحص الدوري التلقائي */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            color: '#94a3b8',
            marginBottom: '1.75rem',
            background: '#f8fafc',
            padding: '0.55rem 1rem',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}
        >
          <RefreshCw
            size={16}
            style={{
              animation: isChecking ? 'spin 1s linear infinite' : 'none',
              color: '#3b82f6'
            }}
          />
          <span>جاري الفحص التلقائي للحالة خلال: </span>
          <strong style={{ color: '#2563eb' }}>{countdown} ثانية</strong>
          <button
            onClick={handleCheckStatus}
            disabled={isChecking}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#2563eb',
              cursor: 'pointer',
              textDecoration: 'underline',
              marginRight: '0.5rem',
              fontSize: '0.82rem',
              fontWeight: '600'
            }}
          >
            فحص الآن
          </button>
        </div>

        {/* أزرار الإجراءات */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* زر دخول وضع Sandbox (بيئة الاختبار للمطور) */}
          <button
            onClick={handleActivateSandbox}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1.25rem',
              borderRadius: '14px',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              background: 'linear-gradient(135deg, #1e40af, #2563eb)',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <Shield size={18} />
            <span>الدخول في وضع فحص المطور (Sandbox Bypass)</span>
          </button>

          {/* زر الرجوع للرئيسية */}
          {onNavigateHome && (
            <button
              onClick={onNavigateHome}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <ArrowRight size={16} />
              <span>العودة إلى لوحة القيادة العامة</span>
            </button>
          )}
        </div>

        {/* ملاحظة المطور */}
        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px dashed #e2e8f0',
            fontSize: '0.78rem',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem'
          }}
        >
          <Shield size={15} style={{ color: '#10b981' }} />
          <span>بيئة المطور المحمية: وضع Sandbox يتيح اختبار وتصحيح الشاشة دون التأثير على العملاء</span>
        </div>
      </div>
    </div>
  );
}
