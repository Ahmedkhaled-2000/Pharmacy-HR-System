import React, { useState, useEffect } from 'react';

/**
 * DesktopWindowBar.jsx
 * شريط العنوان والتحكم المكتبي بنمط Windows 11 Fluent Header
 * يتكامل مباشرة مع نافذة نظام الويندوز عبر window.desktopAPI
 */
export default function DesktopWindowBar({
  orgSettings,
  currentRole,
  currentBranch,
  userProfile,
  isSyncing,
  lastSyncTime,
  isOffline,
  pendingSyncCount,
  onTriggerSync,
  liveTime,
  children
}) {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('v1.0.0');

  useEffect(() => {
    if (isDesktop && window.desktopAPI?.getAppVersion) {
      window.desktopAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(`v${v}`);
      }).catch(() => {});
    }

    if (isDesktop && window.desktopAPI?.isMaximized) {
      window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }

    const handleResize = () => {
      if (isDesktop && window.desktopAPI?.isMaximized) {
        window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDesktop]);

  const handleMinimize = () => {
    if (isDesktop && window.desktopAPI?.minimizeWindow) {
      window.desktopAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (isDesktop && window.desktopAPI?.maximizeWindow) {
      window.desktopAPI.maximizeWindow();
      setTimeout(() => {
        if (window.desktopAPI?.isMaximized) {
          window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
        }
      }, 100);
    }
  };

  const handleClose = () => {
    if (isDesktop && window.desktopAPI?.closeWindow) {
      window.desktopAPI.closeWindow();
    }
  };

  const roleTitle = currentRole === 'owner' || userProfile?.isOwner
    ? '👑 المالك (Owner)'
    : currentRole === 'admin'
    ? '🛡️ الإدارة العليا'
    : currentRole === 'branch'
    ? `📍 إدارة ${currentBranch?.name || 'الفرع'}`
    : '👤 موظف';

  return (
    <div
      className="fluent-acrylic-header app-draggable-region"
      style={{
        height: '46px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        userSelect: 'none',
        zIndex: 1000,
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* ── الجانب الأيمن: الشعار، اسم المنظومة، الإصدار، والدور ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="app-no-drag">
        {orgSettings?.logoUrl ? (
          <img
            src={orgSettings.logoUrl}
            alt="Logo"
            style={{ width: '26px', height: '26px', borderRadius: '6px', objectFit: 'contain', background: '#fff', padding: '1px', border: '1px solid var(--border)' }}
          />
        ) : (
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 800,
            boxShadow: '0 2px 5px rgba(13,148,136,0.3)'
          }}>
            🏥
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
            {orgSettings?.orgName || 'منظومة الموارد البشرية'}
          </span>
          <span style={{
            fontSize: '10px',
            padding: '1px 5px',
            borderRadius: '6px',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontWeight: 700
          }}>
            {appVersion}
          </span>
        </div>

        <span style={{ color: 'var(--border)', fontSize: '14px' }}>/</span>

        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--primary-dark)' }}>
          {roleTitle}
        </span>
      </div>

      {/* ── الوسط / إضافات الواجهة المخصصة ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="app-no-drag">
        {children}

        {/* كبسولة المزامنة اللحظية الفورية */}
        <div
          className={`desktop-sync-pill ${isOffline ? 'offline' : isSyncing ? 'syncing' : 'synced'}`}
          title={isOffline ? 'وضع العمل أوفلاين: المنظومة تحفظ على القرص المحلي وتترقب عودة الإنترنت للمزامنة التلقائية' : 'حالة المزامنة المباشرة مع السحابة'}
        >
          <span className={`status-pulse-dot ${isOffline ? 'offline' : isSyncing ? 'syncing' : 'online'}`} />
          <span>
            {isOffline ? (
              <>📴 أوف لاين {pendingSyncCount > 0 && `(${pendingSyncCount} معلق)`}</>
            ) : isSyncing ? (
              <>☁️ جاري المزامنة...</>
            ) : (
              <>🟢 متزامن {lastSyncTime ? `(${lastSyncTime})` : ''}</>
            )}
          </span>

          {onTriggerSync && (
            <button
              type="button"
              onClick={onTriggerSync}
              disabled={isSyncing}
              title="مزامنة فورية الآن"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: isSyncing ? 'wait' : 'pointer',
                padding: '0 2px',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              🔄
            </button>
          )}
        </div>

        {/* التوقيت المباشر الموثق */}
        {liveTime && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '6px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            fontSize: '11px',
            color: 'var(--text)'
          }} title="التوقيت المباشر الموثق">
            <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
              ⏰ {liveTime.formatted12Time || liveTime}
            </span>
          </div>
        )}
      </div>

      {/* ── الجانب الأيسر: أزرار التحكم بالنوافذ في نظام الويندوز ── */}
      {isDesktop && (
        <div className="desktop-window-controls app-no-drag">
          <button
            type="button"
            className="win-control-btn"
            onClick={handleMinimize}
            title="تصغير (Minimize)"
          >
            ―
          </button>
          <button
            type="button"
            className="win-control-btn"
            onClick={handleMaximize}
            title={isMaximized ? 'استعادة الحجم (Restore)' : 'تكبير النافذة (Maximize)'}
          >
            {isMaximized ? '🗗' : '🗖'}
          </button>
          <button
            type="button"
            className="win-control-btn close"
            onClick={handleClose}
            title="إغلاق البرنامج (Close)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
