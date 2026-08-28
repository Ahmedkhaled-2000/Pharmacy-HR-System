import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLiveRealTime } from '../../hooks/useLiveRealTime';
import { getNotificationTargetTab } from '../../utils/notificationEngine';

export default function GlobalNavbar({
  orgSettings,
  isSyncing,
  lastSyncTime,
  themeMode,
  toggleTheme,
  isOffline,
  pendingSyncCount,
  notifications = [],
  onNavigateTab,
  onMarkNotificationRead
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifMenu, setShowNotifMenu] = React.useState(false);
  const liveTime = useLiveRealTime(1000);

  const currentPath = location.pathname;
  const unreadCount = (notifications || []).filter((n) => !n.read).length;

  // إخفاء الـ Navbar تماماً في صفحة البصمة وبوابة الموظف وصفحات التوظيف والمقابلات
  if (
    currentPath === '/kiosk' ||
    currentPath === '/employee' ||
    currentPath === '/careers' ||
    currentPath.startsWith('/careers') ||
    currentPath === '/interview' ||
    currentPath.startsWith('/interview')
  ) {
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Live Authoritative Clock Widget */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--surface-muted)',
          padding: '4px 12px',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          fontSize: '12px'
        }} title={liveTime.isServerSynced ? '🌐 التوقيت الفعلي الموثق من الخادم' : '⏱️ التوقيت المباشر'}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
            boxShadow: liveTime.isServerSynced ? '0 0 6px #22c55e' : 'none'
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '12px' }}>
              ⏰ {liveTime.formatted12Time}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {liveTime.fullArabicDate}
            </span>
          </div>
        </div>
        {/* Notification Bell Icon (Hidden for Branch Manager) */}
        {authRole !== 'branch' && currentPath !== '/branch' && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              title="الإشعارات والتنبيهات الفورية"
              style={{
                position: 'relative',
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: '#dc2626',
                    color: '#ffffff',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(220,38,38,0.4)'
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Menu Overlay */}
            {showNotifMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '48px',
                  left: '0',
                  width: '320px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                  zIndex: 999,
                  padding: '12px',
                  direction: 'rtl'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', color: 'var(--text)' }}>🔔 أحدث الإشعارات</h4>
                  <button
                    onClick={() => {
                      setShowNotifMenu(false);
                      if (onNavigateTab) onNavigateTab('notifications');
                    }}
                    style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    عرض الكل
                  </button>
                </div>

                <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {notifications.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', margin: '14px 0' }}>لا توجد إشعارات حالياً</p>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          setShowNotifMenu(false);
                          if (onMarkNotificationRead) onMarkNotificationRead(n.id);
                          const targetTab = getNotificationTargetTab(n, 'admin');
                          if (onNavigateTab) onNavigateTab(targetTab);
                        }}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: n.read ? 'transparent' : 'rgba(13, 148, 136, 0.08)',
                          borderRight: n.read ? '3px solid transparent' : '3px solid var(--primary)',
                          cursor: 'pointer',
                          fontSize: '12.5px',
                          transition: 'all 0.15s ease'
                        }}
                        className="notif-dropdown-item-hover"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', color: 'var(--text)' }}>
                          <span>{n.icon || '🔔'}</span>
                          <span>{n.title || n.typeLabel || 'إشعار'}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{n.message || n.body || ''}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
