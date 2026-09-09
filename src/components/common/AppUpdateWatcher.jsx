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
        <div className="fixed bottom-4 left-4 z-[99999] animate-bounce">
          <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/20">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            <div className="text-sm">
              <p className="font-bold">تحديث جديد جاهز للتثبيت ({updateInfo?.version || 'v1.0.1'})</p>
              <p className="text-xs text-emerald-100">تم تنزيل النسخة الجديدة بنجاح</p>
            </div>
            <button
              onClick={handleInstallDesktopUpdate}
              className="bg-white text-emerald-800 font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-emerald-50 transition shadow active:scale-95 cursor-pointer mr-2 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة التشغيل الآن
            </button>
          </div>
        </div>
      )}

      {/* 3. شريط عائم لبيئة المتصفح */}
      {!isDesktop && webUpdateAvailable && (
        <div className="fixed bottom-4 left-4 z-[99999] animate-bounce">
          <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-3 rounded-xl shadow-2xl border border-white/20">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <div className="text-sm">
              <p className="font-bold">تحديث جديد متوفر للمنظومة</p>
              <p className="text-xs text-emerald-100">تم نشر إصدار محدث من النظام</p>
            </div>
            <button
              onClick={handleApplyWebUpdate}
              className="bg-white text-emerald-800 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-emerald-50 transition shadow active:scale-95 cursor-pointer mr-2"
            >
              تطبيق الآن
            </button>
          </div>
        </div>
      )}
    </>
  );
}
