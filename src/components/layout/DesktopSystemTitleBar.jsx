import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Download, Sparkles, AlertCircle, Info } from 'lucide-react';

/**
 * DesktopSystemTitleBar.jsx
 * شريط العنوان والتحكم المكتبي بنظام Windows 11 Fluent Design
 * - العنوان والشعار وزر الفحص اليدوي للتحديثات ناحية اليمين (RTL)
 * - أزرار التحكم (إغلاق، تكبير/استعادة، تصغير) ناحية اليسار
 * - مظهر متناسق تماماً مع النظام وداعم للتحريك والسحب وتغيير الحجم
 */
export default function DesktopSystemTitleBar() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'dev_mode'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!isDesktop) return;

    // استعلام عن امتلاك البرنامج لكامل الصلاحيات كمسؤول
    if (window.desktopAPI?.isAdmin) {
      window.desktopAPI.isAdmin().then(setIsAdmin).catch(() => {});
    }

    // استعلام مبدئي عن رقم الإصدار الحالي للبرنامج
    if (window.desktopAPI?.getAppVersion) {
      window.desktopAPI.getAppVersion().then((ver) => {
        if (ver) setAppVersion(ver);
      }).catch(() => {});
    }

    // استعلام مبدئي عن حالة التكبير
    if (window.desktopAPI?.isMaximized) {
      window.desktopAPI.isMaximized().then(setIsMaximized).catch(() => {});
    }

    // الاستماع لأحداث التكبير والاستعادة المباشرة من النظام
    let unsubscribeMax = null;
    if (window.desktopAPI?.onMaximizedChange) {
      unsubscribeMax = window.desktopAPI.onMaximizedChange((maxState) => {
        setIsMaximized(maxState);
      });
    }

    // الاستماع المباشر لمحرك التحديثات التلقائية
    let unsubscribeUpdate = null;
    if (window.desktopAPI?.onUpdateStatus) {
      unsubscribeUpdate = window.desktopAPI.onUpdateStatus((data) => {
        const { status, percent, version, releaseNotes, error } = data || {};
        if (status === 'checking') {
          setUpdateStatus('checking');
        } else if (status === 'available') {
          setUpdateStatus('available');
          setUpdateInfo({ version, releaseNotes });
        } else if (status === 'progress') {
          setUpdateStatus('downloading');
          setDownloadPercent(percent || 0);
        } else if (status === 'downloaded') {
          setUpdateStatus('downloaded');
          setUpdateInfo(prev => ({ ...prev, version }));
        } else if (status === 'not-available') {
          setUpdateStatus('not-available');
          setStatusMessage('أنت على أحدث إصدار');
          setTimeout(() => {
            setUpdateStatus('idle');
            setStatusMessage('');
          }, 4500);
        } else if (status === 'error') {
          setUpdateStatus('error');
          setStatusMessage('تعذر فحص التحديث');
          setTimeout(() => {
            setUpdateStatus('idle');
            setStatusMessage('');
          }, 4500);
        }
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
      if (unsubscribeMax) unsubscribeMax();
      if (unsubscribeUpdate) unsubscribeUpdate();
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

  // معالج فحص التحديثات يدوياً
  const handleCheckUpdates = async (e) => {
    e.stopPropagation();

    // إذا كان التحديث قد اكتمل تنزيله، الضغط على الزر يثبته ويعيد تشغيل البرنامج فوراً
    if (updateStatus === 'downloaded') {
      window.desktopAPI?.quitAndInstallUpdate?.();
      return;
    }

    if (updateStatus === 'checking') return;

    setUpdateStatus('checking');
    try {
      const res = await window.desktopAPI?.checkForUpdates?.();
      if (res?.status === 'dev_mode') {
        setUpdateStatus('dev_mode');
        setStatusMessage('بيئة التطوير');
        setTimeout(() => {
          setUpdateStatus('idle');
          setStatusMessage('');
        }, 3500);
      } else if (res?.status === 'error') {
        setUpdateStatus('error');
        setStatusMessage(res.error || 'تعذر الاتصال');
        setTimeout(() => {
          setUpdateStatus('idle');
          setStatusMessage('');
        }, 4000);
      }
    } catch (err) {
      setUpdateStatus('error');
      setStatusMessage('خطأ في الاتصال');
      setTimeout(() => {
        setUpdateStatus('idle');
        setStatusMessage('');
      }, 4000);
    }
  };


  const renderButtonContent = () => {
    if (updateStatus === 'checking') {
      return (
        <>
          <RefreshCw style={{ width: '12px', height: '12px', color: 'currentColor' }} className="animate-spin" />
          <span>جاري الفحص...</span>
        </>
      );
    }
    if (updateStatus === 'not-available') {
      return (
        <>
          <CheckCircle2 style={{ width: '13px', height: '13px', color: 'currentColor' }} />
          <span>{statusMessage || 'أنت على أحدث إصدار'}</span>
        </>
      );
    }
    if (updateStatus === 'available' || updateStatus === 'downloading') {
      return (
        <>
          <Download style={{ width: '13px', height: '13px', color: 'currentColor' }} />
          <span>تنزيل التحديث {downloadPercent > 0 ? `(${downloadPercent}%)` : ''}</span>
        </>
      );
    }
    if (updateStatus === 'downloaded') {
      return (
        <>
          <Sparkles style={{ width: '13px', height: '13px', color: '#ffffff' }} />
          <span>تثبيت التحديث الآن</span>
        </>
      );
    }
    if (updateStatus === 'dev_mode') {
      return (
        <>
          <Info style={{ width: '13px', height: '13px', color: 'currentColor' }} />
          <span>بيئة التطوير</span>
        </>
      );
    }
    if (updateStatus === 'error') {
      return (
        <>
          <AlertCircle style={{ width: '13px', height: '13px', color: 'currentColor' }} />
          <span>{statusMessage || 'خطأ فحص'}</span>
        </>
      );
    }
    return (
      <>
        <RefreshCw style={{ width: '12px', height: '12px', color: 'currentColor' }} />
        <span>فحص التحديثات</span>
      </>
    );
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
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999999,
        borderBottom: '1px solid var(--titlebar-border, rgba(255, 255, 255, 0.08))',
        fontSize: '12px',
        boxSizing: 'border-box'
      }}
    >
      {/* ── الجانب الأيمن: أيقونة البرنامج، الاسم، شارة الإصدار، وزر فحص التحديثات ── */}
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

        {/* شارة الإصدار الحالي */}
        {appVersion && (
          <span
            className="titlebar-ver-badge app-no-drag"
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              padding: '2px 8px',
              borderRadius: '8px',
              letterSpacing: '0.4px',
              WebkitAppRegion: 'no-drag'
            }}
            title={`الإصدار الحالي المثبت: v${appVersion}`}
          >
            v{appVersion}
          </span>
        )}

        {/* شارة كامل الصلاحيات (Admin Privileges) */}
        <span
          className={`titlebar-admin-badge app-no-drag ${isAdmin ? 'admin-yes' : 'admin-no'}`}
          style={{
            fontSize: '11px',
            padding: '2px 9px',
            borderRadius: '8px',
            letterSpacing: '0.2px',
            WebkitAppRegion: 'no-drag',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title={isAdmin ? 'البرنامج يعمل بكامل صلاحيات مدير النظام (Run as Administrator)' : 'البرنامج مفعل بكامل صلاحيات الوصول للأجهزة والكاميرا'}
        >
          <span style={{ fontSize: '11px' }}>🛡️</span>
          <span>{isAdmin ? 'كامل الصلاحيات (مسؤول)' : 'صلاحيات كاملة'}</span>
        </span>

        {/* زر الفحص اليدوي للتحديثات داخل شريط العنوان (Title Bar) */}
        <button
          type="button"
          onClick={handleCheckUpdates}
          disabled={updateStatus === 'checking'}
          className={`titlebar-update-btn app-no-drag status-${updateStatus}`}
          title={
            updateStatus === 'downloaded'
              ? 'تم تنزيل التحديث بنجاح! اضغط لتثبيته وإعادة تشغيل المنظومة الآن'
              : updateStatus === 'checking'
              ? 'جاري التحقق من وجود إصدارات أحدث عبر السحابة...'
              : updateStatus === 'available' || updateStatus === 'downloading'
              ? `يوجد إصدار جديد (v${updateInfo?.version || ''}) - جاري التنزيل (${downloadPercent}%)`
              : 'التحقق يدوياً من وجود تحديثات جديدة للبرنامج عبر GitHub'
          }
          style={{
            WebkitAppRegion: 'no-drag',
            marginRight: '6px'
          }}
        >
          {renderButtonContent()}
        </button>
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
