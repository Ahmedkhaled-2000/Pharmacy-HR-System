import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, Sparkles } from 'lucide-react';
import DesktopUpdateModal from './DesktopUpdateModal';
import { forceClearCacheAndReload } from '../../utils/cacheManager';

/**
 * AppUpdateWatcher
 * مكون ذكي فائق الاحترافية لمراقبة وتطبيق تحديثات المنظومة
 * يدعم بيئتي العمل:
 * 1. بيئة تطبيق ويندوز المكتبي (.exe): فحص، تنزيل وتثبيت فوري في ثوانٍ دون إعادة تثبيت يدوي
 * 2. بيئة المتصفح والـ PWA: تفريغ كاش Service Worker وإعادة التحميل الفوري
 */
export default function AppUpdateWatcher() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);

  // حالات تطبيق سطح المكتب
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle | checking | available | progress | downloaded | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // حالات بيئة الويب والمتصفح
  const [webUpdateAvailable, setWebUpdateAvailable] = useState(false);

  useEffect(() => {
    // ── 1. بيئة تطبيق ويندوز المكتبي (Electron) ────────────────────────────
    if (isDesktop && window.desktopAPI?.onUpdateStatus) {
      console.log('🖥️ [AppUpdateWatcher] Initializing Windows Desktop Update Watcher...');

      const unsubscribe = window.desktopAPI.onUpdateStatus((data) => {
        const { status, percent, version, releaseNotes, error } = data || {};
        console.log('🖥️ [AppUpdateWatcher] Desktop Update Event:', status, data);

        if (status === 'checking') {
          setUpdateStatus('checking');
        } else if (status === 'available') {
          setUpdateStatus('available');
          setUpdateInfo({ version, releaseNotes });
          setIsModalOpen(true);
        } else if (status === 'progress') {
          setUpdateStatus('progress');
          setDownloadProgress(percent || 0);
        } else if (status === 'downloaded') {
          setUpdateStatus('downloaded');
          setUpdateInfo(prev => ({ ...prev, version }));
          setIsModalOpen(true);
        } else if (status === 'error') {
          setUpdateStatus('error');
        } else if (status === 'not-available') {
          setUpdateStatus('not-available');
        }
      });

      // ── أ) فحص فوري للتحديثات بمجرد فتح البرنامج بعد تحميل الواجهة ──
      const initialTimer = setTimeout(() => {
        if (window.desktopAPI?.checkForUpdates) {
          console.log('🖥️ [AppUpdateWatcher] 🚀 Auto-triggering startup update check...');
          window.desktopAPI.checkForUpdates().catch(() => {});
        }
      }, 1500);

      // ── ب) فحص دوري كل دقيقة (Watchdog Interval) لضمان الفحص المستمر ──
      const periodicTimer = setInterval(() => {
        if (window.desktopAPI?.checkForUpdates && document.visibilityState !== 'hidden') {
          console.log('🖥️ [AppUpdateWatcher] ⏱️ Auto-triggering 1-minute periodic update check...');
          window.desktopAPI.checkForUpdates().catch(() => {});
        }
      }, 60 * 1000);

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
        clearTimeout(initialTimer);
        clearInterval(periodicTimer);
      };
    }

    // ── 2. بيئة المتصفح والـ PWA ──────────────────────────────────────────
    if ('serviceWorker' in navigator) {
      const handleMessage = (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[AppUpdateWatcher] New version detected via SW:', event.data.version);
          setWebUpdateAvailable(true);
        }
      };

      navigator.serviceWorker.addEventListener('message', handleMessage);

      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          if (reg.waiting) setWebUpdateAvailable(true);
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setWebUpdateAvailable(true);
                }
              });
            }
          });
        }
      }).catch(() => {});

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
  }, [isDesktop]);

  // تنفيذ التحديث الفوري لتطبيق ويندوز
  const handleInstallDesktopUpdate = () => {
    if (window.desktopAPI?.quitAndInstallUpdate) {
      window.desktopAPI.quitAndInstallUpdate();
    }
  };

  // فحص يدوي
  const handleCheckAgain = () => {
    setUpdateStatus('checking');
    if (window.desktopAPI?.checkForUpdates) {
      window.desktopAPI.checkForUpdates();
    }
  };

  // تنفيذ تحديث المتصفح ومسح الكاش إجبارياً
  const handleApplyWebUpdate = () => {
    forceClearCacheAndReload();
  };

  return (
    <>
      {/* 1. نافذة التحديث التفصيلية لتطبيق سطح المكتب */}
      {isDesktop && (
        <DesktopUpdateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          updateStatus={updateStatus}
          updateInfo={updateInfo}
          downloadProgress={downloadProgress}
          onInstallNow={handleInstallDesktopUpdate}
          onCheckAgain={handleCheckAgain}
        />
      )}

      {/* 2. شريط عائم سفلي خفيف عند اكتمال تنزيل التحديث في سطح المكتب بعد إغلاق النافذة */}
      {isDesktop && updateStatus === 'downloaded' && !isModalOpen && (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 9999999,
            animation: 'winFloatPulse 3s ease-in-out infinite'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
              color: '#ffffff',
              padding: '12px 18px',
              borderRadius: '16px',
              boxShadow: '0 12px 35px -5px rgba(5, 150, 105, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2)',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            <Sparkles style={{ width: '22px', height: '22px', color: '#fef08a' }} />
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>
                تحديث جديد جاهز للتثبيت ({updateInfo?.version ? `v${updateInfo.version}` : 'الإصدار الجديد'})
              </p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#d1fae5' }}>
                تم التنزيل بنجاح، اضغط للتطبيق الفوري
              </p>
            </div>
            <button
              type="button"
              onClick={handleInstallDesktopUpdate}
              style={{
                marginRight: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <RefreshCw style={{ width: '13px', height: '13px' }} />
              إعادة التشغيل الآن
            </button>
          </div>
        </div>
      )}

      {/* 3. شريط عائم لبيئة المتصفح */}
      {!isDesktop && webUpdateAvailable && (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: 9999999
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              padding: '12px 18px',
              borderRadius: '16px',
              boxShadow: '0 12px 35px -5px rgba(2, 132, 199, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2)',
              fontFamily: 'system-ui, sans-serif'
            }}
          >
            <RefreshCw style={{ width: '20px', height: '20px' }} className="animate-spin" />
            <div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>تحديث جديد متوفر للمنظومة</p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#e0f2fe' }}>تم نشر إصدار محدث من النظام</p>
            </div>
            <button
              type="button"
              onClick={handleApplyWebUpdate}
              style={{
                marginRight: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#0369a1',
                border: 'none',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
            >
              تطبيق الآن
            </button>
          </div>
        </div>
      )}
    </>
  );
}
