import React, { useState } from 'react';

export default function LoginPage({ onLogin, state, themeMode, toggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const isDark = themeMode === 'dark';

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    const success = onLogin(username.trim(), password.trim());
    if (!success) {
      setErrorMsg('اسم المستخدم أو كلمة المرور غير صحيحة');
    }
  };

  const S = {
    page: {
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isDark ? '#0f172a' : '#f1f5f9',
      fontFamily: "'Tajawal', 'Cairo', sans-serif",
      direction: 'rtl',
      position: 'relative',
    },
    themeBtn: {
      position: 'absolute',
      top: '20px',
      left: '20px',
      background: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#94a3b8' : '#64748b',
      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
      borderRadius: '10px',
      padding: '8px 14px',
      cursor: 'pointer',
      fontFamily: "'Tajawal', sans-serif",
      fontSize: '13px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    },
    card: {
      background: isDark ? '#1e293b' : '#ffffff',
      borderRadius: '20px',
      width: '100%',
      maxWidth: '420px',
      padding: '40px 36px',
      boxShadow: isDark
        ? '0 20px 60px rgba(0,0,0,0.5)'
        : '0 8px 40px rgba(0,0,0,0.10)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      margin: '20px',
      boxSizing: 'border-box',
    },
    logo: {
      width: '64px',
      height: '64px',
      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#ffffff',
      fontFamily: "'Cairo', sans-serif",
      fontWeight: '800',
      fontSize: '24px',
      boxShadow: '0 8px 20px rgba(13,148,136,0.35)',
      marginBottom: '20px',
    },
    title: {
      fontFamily: "'Cairo', sans-serif",
      fontSize: '30px',
      fontWeight: '800',
      color: isDark ? '#f1f5f9' : '#0f172a',
      margin: '0 0 6px 0',
      textAlign: 'center',
    },
    subtitle: {
      fontSize: '13px',
      color: isDark ? '#64748b' : '#94a3b8',
      fontWeight: '500',
      margin: '0 0 32px 0',
      textAlign: 'center',
    },
    form: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    },
    fieldGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
      textAlign: 'right',
    },
    label: {
      fontSize: '14px',
      fontWeight: '700',
      color: isDark ? '#94a3b8' : '#374151',
      fontFamily: "'Tajawal', sans-serif",
    },
    input: (fieldName) => ({
      width: '100%',
      height: '48px',
      border: `1.5px solid ${focusedField === fieldName ? '#0d9488' : isDark ? '#334155' : '#e2e8f0'}`,
      borderRadius: '12px',
      padding: '0 16px',
      fontSize: '15px',
      fontFamily: "'Tajawal', sans-serif",
      color: isDark ? '#f1f5f9' : '#0f172a',
      background: isDark ? '#0f172a' : '#f8fafc',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: focusedField === fieldName ? '0 0 0 3px rgba(13,148,136,0.15)' : 'none',
      textAlign: 'right',
      direction: 'rtl',
    }),
    submitBtn: {
      width: '100%',
      height: '50px',
      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
      color: '#ffffff',
      border: 'none',
      borderRadius: '12px',
      fontFamily: "'Cairo', sans-serif",
      fontSize: '17px',
      fontWeight: '700',
      cursor: 'pointer',
      marginTop: '8px',
      boxShadow: '0 4px 16px rgba(13,148,136,0.30)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      letterSpacing: '0.5px',
    },
    error: {
      background: isDark ? '#450a0a' : '#fef2f2',
      color: isDark ? '#fca5a5' : '#b91c1c',
      padding: '10px 14px',
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: '600',
      width: '100%',
      boxSizing: 'border-box',
      textAlign: 'center',
      border: `1px solid ${isDark ? '#7f1d1d' : '#fecaca'}`,
    },
  };

  return (
    <div style={S.page}>
      {/* Theme Toggle */}
      <button style={S.themeBtn} type="button" onClick={toggleTheme}>
        {isDark ? '☀️ فاتح' : '🌙 داكن'}
      </button>

      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>HR</div>

        {/* Titles */}
        <h1 style={S.title}>تسجيل الدخول</h1>
        <p style={S.subtitle}>نظام إدارة الموارد البشرية - صيدليات مداواة</p>

        {/* Error */}
        {errorMsg && <div style={S.error}>⚠️ {errorMsg}</div>}

        {/* Form */}
        <form style={S.form} onSubmit={handleSubmit}>
          <div style={S.fieldGroup}>
            <label style={S.label}>اسم المستخدم</label>
            <input
              type="text"
              style={S.input('username')}
              placeholder="أدخل اسم المستخدم"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              autoFocus
            />
          </div>

          <div style={S.fieldGroup}>
            <label style={S.label}>كلمة المرور</label>
            <input
              type="password"
              style={S.input('password')}
              placeholder="أدخل كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
          </div>

          <button
            type="submit"
            style={S.submitBtn}
            onMouseOver={(e) => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 20px rgba(13,148,136,0.4)'; }}
            onMouseOut={(e) => { e.target.style.transform = ''; e.target.style.boxShadow = '0 4px 16px rgba(13,148,136,0.30)'; }}
          >
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
