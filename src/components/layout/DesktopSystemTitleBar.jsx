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
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error' | 'dev_mode'
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!isDesktop) return;

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

  const getButtonBorder = () => {
    switch (updateStatus) {
      case 'checking':
        return '1px solid rgba(59, 130, 246, 0.4)';
      case 'not-available':
        return '1px solid rgba(16, 185, 129, 0.4)';
      case 'available':
      case 'downloading':
        return '1px solid rgba(245, 158, 11, 0.4)';
      case 'downloaded':
        return '1px solid #10b981';
      case 'error':
        return '1px solid rgba(239, 68, 68, 0.4)';
      default:
        return '1px solid var(--titlebar-border, rgba(255, 255, 255, 0.14))';
    }
  };

  const getButtonBackground = () => {
    switch (updateStatus) {
      case 'checking':
        return 'rgba(59, 130, 246, 0.15)';
      case 'not-available':
        return 'rgba(16, 185, 129, 0.15)';
      case 'available':
      case 'downloading':
        return 'rgba(245, 158, 11, 0.15)';
      case 'downloaded':
        return 'linear-gradient(135deg, #059669, #10b981)';
      case 'error':
        return 'rgba(239, 68, 68, 0.15)';
      default:
        return 'rgba(255, 255, 255, 0.06)';
    }
  };

  const getButtonColor = () => {
    switch (updateStatus) {
      case 'checking':
        return '#93c5fd';
      case 'not-available':
        return '#6ee7b7';
      case 'available':
      case 'downloading':
        return '#fde68a';
      case 'downloaded':
        return '#ffffff';
      case 'error':
        return '#fca5a5';
      default:
        return 'var(--titlebar-color, #e2e8f0)';
    }
  };

  const renderButtonContent = () => {
    if (updateStatus === 'checking') {
      return (
        <>
          <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
          <span>جاري الفحص...</span>
        </>
      );
    }
    if (updateStatus === 'not-available') {
      return (
        <>
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>{statusMessage || 'أنت على أحدث إصدار'}</span>
        </>
      );
    }
    if (updateStatus === 'available' || updateStatus === 'downloading') {
      return (
        <>
          <Download className="w-3 h-3 text-amber-400 animate-bounce" />
          <span>تنزيل التحديث {downloadPercent > 0 ? `(${downloadPercent}%)` : ''}</span>
        </>
      );
    }
    if (updateStatus === 'downloaded') {
      return (
        <>
          <Sparkles className="w-3 h-3 text-white animate-pulse" />
          <span>تثبيت التحديث الآن</span>
        </>
      );
    }
    if (updateStatus === 'dev_mode') {
      return (
        <>
          <Info className="w-3 h-3 text-cyan-400" />
          <span>بيئة التطوير</span>
        </>
      );
    }
    if (updateStatus === 'error') {
      return (
        <>
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>{statusMessage || 'خطأ فحص'}</span>
        </>
      );
    }
    return (
      <>
        <RefreshCw className="w-3 h-3 opacity-80" />
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
            className="app-no-drag"
            style={{
              fontSize: '10.5px',
              fontFamily: 'monospace',
              padding: '1px 7px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--titlebar-color, #94a3b8)',
              border: '1px solid var(--titlebar-border, rgba(255, 255, 255, 0.1))',
              letterSpacing: '0.4px',
              WebkitAppRegion: 'no-drag'
            }}
            title={`الإصدار الحالي المثبت: v${appVersion}`}
          >
            v{appVersion}
          </span>
        )}

        {/* زر الفحص اليدوي للتحديثات داخل شريط العنوان (Title Bar) */}
        <button
          type="button"
          onClick={handleCheckUpdates}
          disabled={updateStatus === 'checking'}
          className={`titlebar-update-btn app-no-drag ${updateStatus}`}
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            height: '22px',
            padding: '0 9px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: updateStatus === 'checking' ? 'wait' : 'pointer',
            border: getButtonBorder(),
            background: getButtonBackground(),
            color: getButtonColor(),
            boxShadow: updateStatus === 'downloaded' ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none',
            transition: 'all 0.2s ease',
            outline: 'none',
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
