import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function GlobalNavbar({
  orgSettings,
  isSyncing,
  lastSyncTime,
  themeMode,
  toggleTheme,
  isOffline,
  pendingSyncCount,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const currentPath = location.pathname;

  // إخفاء الـ Navbar تماماً في صفحة البصمة وبوابة الموظف
  if (currentPath === '/kiosk' || currentPath === '/employee') {
    return null;
  }

  return (
    <div className="global-navbar">
      <div className="brand">
        {orgSettings.logoUrl ? (
          <img src={orgSettings.logoUrl} alt="Company Logo" className="org-logo-img" />
        ) : (
          <div className="brand-mark">HR</div>
        )}
        <div>
          <h1>{orgSettings.orgName || 'نظام البصمات الإلكترونية والموارد البشرية'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
            <span className="sync-indicator">
              {isOffline ? (
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  📴 أوف لاين
                  {pendingSyncCount > 0 && <span style={{ marginRight: '6px', background: '#ef4444', color: 'white', borderRadius: '12px', padding: '1px 8px', fontSize: '11px' }}>{pendingSyncCount} في الانتظار</span>}
                </span>
              ) : isSyncing ? (
                <span style={{ color: 'var(--accent)' }}>☁️ جاري المزامنة مع الأجهزة...</span>
              ) : (
                <span style={{ color: 'var(--success)' }}>🟢 متصل بالسحابة (آخر مزامنة: {lastSyncTime})</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button className="theme-toggle-btn" onClick={toggleTheme} title="تبديل وضع الألوان">
          {themeMode === 'light' ? '🌙 الوضع الداكن' : '☀️ الوضع الفاتح'}
        </button>

        <div className="view-switcher">
          <button
            className={`switch-btn ${currentPath === '/admin' || currentPath === '/' ? 'active' : ''}`}
            onClick={() => navigate('/admin')}
          >
            🏢 لوحة HR / الأدمن
          </button>
          <button
            className={`switch-btn ${currentPath === '/employee' ? 'active' : ''}`}
            onClick={() => navigate('/employee')}
          >
            👤 بوابة الموظف
          </button>
        </div>
      </div>
    </div>
  );
}
