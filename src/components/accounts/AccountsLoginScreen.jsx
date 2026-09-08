import React, { useState, useRef, useEffect } from 'react';

/**
 * AccountsLoginScreen.jsx
 * بوابة تسجيل دخول منظومة الحسابات العامة وشجرة الحسابات (ERP Accounts)
 * تطلب اسم المستخدم وكلمة المرور الخاصة بالحسابات (أو بيانات المالك الماستر)
 */
export default function AccountsLoginScreen({
  state,
  onLoginSuccess,
  onBack,
  themeMode = 'light'
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameInputRef = useRef(null);

  useEffect(() => {
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []);

  const orgSettings = state?.orgSettings || {};
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';

  const handleLogin = (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const trimmedUser = String(username || '').trim().toLowerCase();
    const trimmedPass = String(password || '').trim();

    if (!trimmedUser) {
      triggerError('يرجى إدخال اسم مستخدم الحسابات');
      return;
    }
    if (!trimmedPass) {
      triggerError('يرجى إدخال كلمة مرور الحسابات');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    // بيانات الحسابات المحددة في إعدادات المؤسسة
    const expectedAccountsUser = String(orgSettings.accountsUsername || 'accounts').trim().toLowerCase();
    const expectedAccountsPass = String(orgSettings.accountsPassword || '123456').trim();

    // بيانات المالك (Master Credentials)
    const ownerUser = String(orgSettings.ownerUsername || 'owner').trim().toLowerCase();
    const ownerPass = String(orgSettings.ownerPassword || 'owner123').trim();

    const isAccountsMatch = trimmedUser === expectedAccountsUser && trimmedPass === expectedAccountsPass;
    const isOwnerMatch = trimmedUser === ownerUser && trimmedPass === ownerPass;

    if (isAccountsMatch || isOwnerMatch) {
      try {
        sessionStorage.setItem('accounts_session_unlocked', 'true');
      } catch {}
      onLoginSuccess?.();
    } else {
      triggerError('اسم المستخدم أو كلمة المرور غير صحيحة');
      setIsSubmitting(false);
    }
  };

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const isDark = themeMode === 'dark';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: isDark
          ? 'radial-gradient(circle at center, #0f172a 0%, #020617 100%)'
          : 'radial-gradient(circle at center, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: "'Cairo', 'Tajawal', -apple-system, sans-serif",
        direction: 'rtl',
        color: isDark ? '#f8fafc' : '#0f172a',
        userSelect: 'none'
      }}
    >
      <style>{`
        @keyframes accLoginShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .acc-shake-box {
          animation: accLoginShake 0.4s ease-in-out;
        }
        .acc-input:focus {
          outline: none;
          border-color: #0284c7 !important;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.25) !important;
        }
      `}</style>

      {/* كارت تسجيل دخول الحسابات */}
      <div
        className={isShaking ? 'acc-shake-box' : ''}
        style={{
          width: '100%',
          maxWidth: '430px',
          background: isDark ? 'rgba(30, 41, 59, 0.85)' : '#ffffff',
          backdropFilter: 'blur(20px)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1',
          borderRadius: '24px',
          padding: '36px 32px',
          boxShadow: isDark
            ? '0 25px 60px rgba(0, 0, 0, 0.6)'
            : '0 20px 45px rgba(15, 23, 42, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}
      >
        {/* أيقونة المنظومة المالية والشعار */}
        <div
          style={{
            width: '78px',
            height: '78px',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '38px',
            color: '#fff',
            boxShadow: '0 12px 28px rgba(2, 132, 199, 0.35)',
            marginBottom: '18px'
          }}
        >
          📊
        </div>

        <h2
          style={{
            margin: '0 0 6px 0',
            fontSize: '21px',
            fontWeight: 900,
            color: isDark ? '#ffffff' : '#0f172a'
          }}
        >
          منظومة الحسابات العامة (ERP)
        </h2>

        <p
          style={{
            margin: '0 0 20px 0',
            fontSize: '13.5px',
            color: isDark ? '#94a3b8' : '#64748b',
            lineHeight: '1.5'
          }}
        >
          {orgName} · شجرة الحسابات، الخزائن، وسندات القيود
        </p>

        {/* إشعار الأمان */}
        <div
          style={{
            background: isDark ? 'rgba(2, 132, 199, 0.15)' : '#f0f9ff',
            border: isDark ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid #bae6fd',
            color: isDark ? '#7dd3fc' : '#0369a1',
            padding: '9px 14px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '20px',
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>🔐</span>
          <span>يتطلب الدخول حساب مسؤول الحسابات أو حساب المالك</span>
        </div>

        {/* رسالة الخطأ */}
        {errorMsg && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              color: '#dc2626',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              fontWeight: 700,
              marginBottom: '16px',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleLogin} style={{ width: '100%', textAlign: 'right' }}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 800,
                color: isDark ? '#cbd5e1' : '#334155',
                marginBottom: '6px'
              }}
            >
              اسم مستخدم الحسابات (Username)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={usernameInputRef}
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="اسم المستخدم (الافتراضي: accounts)..."
                className="acc-input"
                style={{
                  width: '100%',
                  padding: '12px 38px 12px 14px',
                  borderRadius: '12px',
                  border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                  background: isDark ? '#0f172a' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  fontSize: '14px',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                  transition: 'all 0.15s'
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '15px',
                  color: '#94a3b8'
                }}
              >
                👤
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 800,
                color: isDark ? '#cbd5e1' : '#334155',
                marginBottom: '6px'
              }}
            >
              كلمة المرور (Password)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="كلمة مرور الحسابات..."
                className="acc-input"
                style={{
                  width: '100%',
                  padding: '12px 38px 12px 38px',
                  borderRadius: '12px',
                  border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                  background: isDark ? '#0f172a' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  fontSize: '14px',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                  transition: 'all 0.15s'
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '15px',
                  color: '#94a3b8'
                }}
              >
                🔑
              </span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#94a3b8',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={showPassword ? 'إخفاء' : 'إظهار'}
              >
                {showPassword ? '👁️' : '🕶️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            <span>🚪</span>
            <span>دخول منظومة الحسابات (Enter)</span>
          </button>
        </form>

        {/* زر العودة للوحة التحكم */}
        <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9', width: '100%' }}>
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
              else window.location.href = '/';
            }}
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#94a3b8' : '#64748b',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%'
            }}
          >
            <span>↩️</span>
            <span>العودة للوحة التحكم الرئيسية</span>
          </button>
        </div>
      </div>
    </div>
  );
}
