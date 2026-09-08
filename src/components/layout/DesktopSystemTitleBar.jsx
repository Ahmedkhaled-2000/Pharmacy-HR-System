import React, { useState, useEffect } from 'react';

/**
 * DesktopSystemTitleBar.jsx
 * شريط العنوان والتحكم المكتبي بنظام Windows 11 Fluent Design
 * - العنوان والشعار ناحية اليمين (RTL)
 * - أزرار التحكم (إغلاق، تكبير/استعادة، تصغير) ناحية اليسار
 * - مظهر متناسق تماماً مع النظام وداعم للتحريك والسحب وتغيير الحجم
 */
export default function DesktopSystemTitleBar() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;

    // استعلام مبدئي عن حالة التكبير
    if (window.desktopAPI?.isMaximized) {
      window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }

    // الاستماع لأحداث التكبير والاستعادة المباشرة من النظام
    let unsubscribe = null;
    if (window.desktopAPI?.onMaximizedChange) {
      unsubscribe = window.desktopAPI.onMaximizedChange((maxState) => {
        setIsMaximized(maxState);
      });
    }

    const handleResize = () => {
      if (window.desktopAPI?.isMaximized) {
        window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (unsubscribe) unsubscribe();
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  const handleMinimize = (e) => {
    e.stopPropagation();
    window.desktopAPI?.minimizeWindow?.();
  };

  const handleToggleMaximize = (e) => {
    e.stopPropagation();
    window.desktopAPI?.maximizeWindow?.();
    setTimeout(() => {
      window.desktopAPI?.isMaximized?.().then(setIsMaximized).catch(() => {});
    }, 100);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    window.desktopAPI?.closeWindow?.();
  };

  const handleDoubleClick = () => {
    handleToggleMaximize({ stopPropagation: () => {} });
  };

  return (
    <header
      className="desktop-native-titlebar"
      onDoubleClick={handleDoubleClick}
      style={{
        height: '32px',
        background: 'var(--titlebar-bg, #0f172a)',
        color: 'var(--titlebar-color, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        direction: 'rtl',
        width: '100%',
        padding: 0,
        margin: 0,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999999,
        borderBottom: '1px solid var(--titlebar-border, rgba(255, 255, 255, 0.08))',
        fontSize: '12px',
        boxSizing: 'border-box'
      }}
    >
      {/* ── الجانب الأيمن: أيقونة البرنامج واسم المنظومة باللغة العربية ── */}
      <div
        className="desktop-window-title-right app-no-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingRight: '12px',
          height: '100%',
          WebkitAppRegion: 'drag'
        }}
      >
        {/* أيقونة المنظومة الرسمية المصغرة */}
        <img
          src="./assets/icon.png"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
          alt=""
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            objectFit: 'contain'
          }}
        />

        <span
          style={{
            fontSize: '12.5px',
            fontWeight: 700,
            letterSpacing: '0.2px',
            color: 'inherit'
          }}
        >
          منظومة إدارة الموارد البشرية والرواتب
        </span>
      </div>

      {/* ── الجانب الأيسر: أزرار التحكم بالنافذة (― تصغير، 🗖/🗗 تكبير/استعادة، ✕ إغلاق) ── */}
      <div
        className="desktop-window-controls-left app-no-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          WebkitAppRegion: 'no-drag',
          direction: 'ltr'
        }}
      >
        {/* زر الإغلاق ✕ */}
        <button
          type="button"
          onClick={handleClose}
          className="native-win-btn close"
          title="إغلاق البرنامج (Close)"
          style={{
            width: '46px',
            height: '32px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.15s ease, color 0.15s ease',
            outline: 'none',
            padding: 0
          }}
        >
          ✕
        </button>

        {/* زر التكبير / الاستعادة 🗖 / 🗗 */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="native-win-btn"
          title={isMaximized ? 'استعادة الحجم (Restore)' : 'تكبير النافذة (Maximize)'}
          style={{
            width: '46px',
            height: '32px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.15s ease',
            outline: 'none',
            padding: 0
          }}
        >
          {isMaximized ? '🗗' : '🗖'}
        </button>

        {/* زر التصغير ― */}
        <button
          type="button"
          onClick={handleMinimize}
          className="native-win-btn"
          title="تصغير النافذة (Minimize)"
          style={{
            width: '46px',
            height: '32px',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.15s ease',
            outline: 'none',
            padding: 0
          }}
        >
          ―
        </button>
      </div>
    </header>
  );
}
