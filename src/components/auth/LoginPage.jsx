import React, { useState } from 'react';

export default function LoginPage({ onLogin, state, themeMode = 'light', toggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgName = state?.orgSettings?.orgName?.trim() || 'مجموعة الصيدليات الطبية';
  const orgLogo = state?.orgSettings?.logoUrl;
  const generalManager = state?.orgSettings?.generalManagerName;

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال اسم المستخدم / الكود وكلمة المرور');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = onLogin(username.trim(), password.trim());
      if (res && typeof res === 'object') {
        if (!res.success) {
          setErrorMsg(res.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
          setIsSubmitting(false);
        }
      } else if (!res) {
        setErrorMsg('اسم المستخدم أو كلمة المرور غير صحيحة');
        setIsSubmitting(false);
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة ثانية');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #f0fdfa 0%, #f8fafc 40%, #e0f2fe 100%)',
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
        direction: 'rtl',
        position: 'relative',
        padding: '20px 14px',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}
    >
      {/* Decorative subtle background elements */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          right: '-120px',
          width: '320px',
          height: '320px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.15) 0%, rgba(20, 184, 166, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-100px',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      {/* Main Login Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '430px',
          background: '#ffffff',
          borderRadius: '24px',
          padding: 'clamp(24px, 5vw, 40px) clamp(20px, 4.5vw, 36px)',
          boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 0 1px 1px rgba(15, 23, 42, 0.04)',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: 'fadeIn 0.3s ease-out'
        }}
      >
        {/* Logo / Brand Header */}
        <div style={{ marginBottom: '18px', textAlign: 'center' }}>
          {orgLogo ? (
            <div
              style={{
                background: '#f8fafc',
                padding: '10px 18px',
                borderRadius: '18px',
                border: '1px solid #e2e8f0',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
                maxWidth: '100%'
              }}
            >
              <img
                src={orgLogo}
                alt={orgName}
                style={{
                  maxHeight: '70px',
                  maxWidth: 'min(200px, 75vw)',
                  objectFit: 'contain'
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                color: '#ffffff',
                boxShadow: '0 10px 22px rgba(13, 148, 136, 0.3)',
                margin: '0 auto'
              }}
            >
              🏥
            </div>
          )}
        </div>

        {/* Organization Name (Dynamic from Settings) */}
        <h1
          style={{
            margin: '0 0 6px 0',
            fontSize: 'clamp(20px, 5.5vw, 24px)',
            fontWeight: 900,
            color: '#0f172a',
            textAlign: 'center',
            lineHeight: '1.35',
            letterSpacing: '-0.3px',
            wordBreak: 'break-word',
            width: '100%'
          }}
        >
          {orgName}
        </h1>

        {/* Subtitle / Management Tag */}
        <p
          style={{
            margin: '0 0 26px 0',
            fontSize: 'clamp(12.5px, 3.4vw, 14px)',
            fontWeight: 600,
            color: '#0d9488',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>🔐</span>
          <span>
            {generalManager ? `إدارة: ${generalManager} · تسجيل الدخول` : 'بوابة تسجيل الدخول والموارد البشرية'}
          </span>
        </p>

        {/* Error Notification */}
        {errorMsg && (
          <div
            style={{
              width: '100%',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '12px 14px',
              fontSize: '13.5px',
              color: '#b91c1c',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              boxSizing: 'border-box',
              lineHeight: '1.5',
              animation: 'shake 0.25s ease-in-out'
            }}
          >
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {/* Username / Code Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
            <label
              style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>👤</span>
              <span>اسم المستخدم / كود الموظف</span>
            </label>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              placeholder="مثال: admin أو كود الموظف (101)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              autoFocus
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '12px',
                border: `1.8px solid ${focusedField === 'username' ? '#0d9488' : '#cbd5e1'}`,
                background: focusedField === 'username' ? '#ffffff' : '#f8fafc',
                padding: '0 16px',
                fontSize: '15px',
                fontFamily: "'Cairo', 'Tajawal', sans-serif",
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s ease',
                boxShadow: focusedField === 'username' ? '0 0 0 3.5px rgba(13, 148, 136, 0.15)' : 'none',
                direction: 'rtl',
                textAlign: 'right'
              }}
            />
          </div>

          {/* Password Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
            <label
              style={{
                fontSize: '13.5px',
                fontWeight: 800,
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🔑</span>
              <span>كلمة المرور</span>
            </label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="أدخل كلمة المرور الخاصة بك"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '12px',
                  border: `1.8px solid ${focusedField === 'password' ? '#0d9488' : '#cbd5e1'}`,
                  background: focusedField === 'password' ? '#ffffff' : '#f8fafc',
                  padding: '0 44px 0 16px',
                  fontSize: '15px',
                  fontFamily: "'Cairo', 'Tajawal', sans-serif",
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease',
                  boxShadow: focusedField === 'password' ? '0 0 0 3.5px rgba(13, 148, 136, 0.15)' : 'none',
                  direction: 'rtl',
                  textAlign: 'right'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  fontSize: '16px',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px'
                }}
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              height: '50px',
              background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontFamily: "'Cairo', sans-serif",
              fontSize: '16.5px',
              fontWeight: 800,
              cursor: isSubmitting ? 'wait' : 'pointer',
              marginTop: '6px',
              boxShadow: '0 6px 18px rgba(13, 148, 136, 0.35)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(13, 148, 136, 0.45)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(13, 148, 136, 0.35)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(1px)';
            }}
          >
            <span>🚪</span>
            <span>{isSubmitting ? 'جاري التحقق والدخول...' : 'تسجيل الدخول للنظام'}</span>
          </button>
        </form>

        {/* Quick Help & Roles hint */}
        <div
          style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid #f1f5f9',
            width: '100%',
            textAlign: 'center',
            fontSize: '12px',
            color: '#64748b',
            fontWeight: 600,
            lineHeight: '1.6'
          }}
        >
          <div>يدعم النظام تسجيل دخول الإدارة، مدراء الفروع، وكافة موظفي المؤسسة</div>
        </div>
      </div>

      {/* Footer Info */}
      <div
        style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b',
          fontWeight: 600,
          zIndex: 1
        }}
      >
        <span>{orgName}</span> · <span>جميع الحقوق محفوظة © {new Date().getFullYear()}</span>
      </div>
    </div>
  );
}

