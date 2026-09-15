import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, Sparkles, Smartphone, AlertTriangle, CheckCircle, X } from 'lucide-react';
import DesktopUpdateModal from './DesktopUpdateModal';
import { forceClearCacheAndReload } from '../../utils/cacheManager';
import { isAndroidNative, checkNativeAppUpdate, downloadAndInstallNativeUpdate } from '../../utils/nativeAppUpdater';

/**
 * AppUpdateWatcher
 * مكون ذكي فائق الاحترافية لمراقبة وتطبيق تحديثات المنظومة
 * يدعم 3 بيئات عمل متكاملة:
 * 1. بيئة تطبيق أندرويد (APK): فحص المانيفست، تنزيل وتثبيت آمن عبر FileProvider
 * 2. بيئة تطبيق ويندوز المكتبي (.exe): فحص، تنزيل وتثبيت فوري في ثوانٍ دون إعادة تثبيت يدوي
 * 3. بيئة المتصفح والـ PWA: تفريغ كاش Service Worker وإعادة التحميل الفوري
 */
export default function AppUpdateWatcher() {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);
  const isAndroid = isAndroidNative();

  // حالات تطبيق أندرويد
  const [androidUpdate, setAndroidUpdate] = useState(null);
  const [isAndroidModalOpen, setIsAndroidModalOpen] = useState(false);
  const [androidDownloadState, setAndroidDownloadState] = useState('idle'); // idle | downloading | installing | error
  const [androidProgress, setAndroidProgress] = useState(0);
  const [androidError, setAndroidError] = useState('');

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

  // ── 3. بيئة تطبيق أندرويد (Capacitor Native APK) ─────────────────────────
  useEffect(() => {
    if (!isAndroid) return;
    console.log('📱 [AppUpdateWatcher] Initializing Android Native App Update Watcher...');

    const runCheck = async () => {
      try {
        const update = await checkNativeAppUpdate();
        if (update && update.hasUpdate) {
          console.log('📱 [AppUpdateWatcher] Android update detected:', update);
          setAndroidUpdate(update);
          setIsAndroidModalOpen(true);
        }
      } catch (e) {
        console.warn('[AppUpdateWatcher Android]:', e);
      }
    };

    // فحص أولي بعد ثانيتين من تشغيل التطبيق
    const timer = setTimeout(runCheck, 2500);
    // فحص دوري كل ساعتين
    const interval = setInterval(runCheck, 2 * 60 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isAndroid]);

  const handleStartAndroidUpdate = async () => {
    if (!androidUpdate || !androidUpdate.downloadUrl) return;
    setAndroidDownloadState('downloading');
    setAndroidProgress(0);
    setAndroidError('');

    try {
      await downloadAndInstallNativeUpdate({
        downloadUrl: androidUpdate.downloadUrl,
        sha256Checksum: androidUpdate.sha256Checksum,
        onProgress: (percent) => {
          setAndroidProgress(percent);
          if (percent >= 100) {
            setAndroidDownloadState('installing');
          }
        },
        onError: (err) => {
          setAndroidError(err);
          setAndroidDownloadState('error');
        }
      });
      setAndroidDownloadState('installing');
    } catch (err) {
      setAndroidError(err.message || 'فشل تنزيل وتثبيت التحديث');
      setAndroidDownloadState('error');
    }
  };

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

      {/* 4. نافذة تحديث تطبيق الأندرويد الاحترافية (Native In-App Update Modal) */}
      {isAndroid && isAndroidModalOpen && androidUpdate && (
        <div
          dir="rtl"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 99999999,
            fontFamily: "'Cairo', sans-serif"
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px 24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              position: 'relative'
            }}
          >
            {!androidUpdate.isMandatory && androidDownloadState === 'idle' && (
              <button
                type="button"
                onClick={() => setIsAndroidModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: androidUpdate.isMandatory ? '#fef2f2' : '#f0fdfa',
                  color: androidUpdate.isMandatory ? '#ef4444' : '#0d9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1.5px solid ${androidUpdate.isMandatory ? '#fecaca' : '#99f6e4'}`
                }}
              >
                {androidUpdate.isMandatory ? <AlertTriangle size={28} /> : <Smartphone size={28} />}
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  {androidUpdate.isMandatory ? 'تحديث إلزامي للنظام' : 'إصدار جديد متوفر'}
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                  الإصدار: v{androidUpdate.latestVersionName} (الحالي: v{androidUpdate.currentVersionName})
                </p>
              </div>
            </div>

            {androidUpdate.releaseNotes && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  marginBottom: '18px',
                  fontSize: '13px',
                  color: '#334155',
                  lineHeight: '1.6'
                }}
              >
                <strong style={{ display: 'block', marginBottom: '4px', color: '#0f172a' }}>أبرز ما في التحديث:</strong>
                <div>{androidUpdate.releaseNotes}</div>
              </div>
            )}

            {/* حالة التنزيل والتقدم */}
            {androidDownloadState === 'downloading' && (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: '#0f766e' }}>
                  <span>جاري تنزيل التحديث...</span>
                  <span>{androidProgress}%</span>
                </div>
                <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${androidProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0d9488 0%, #14b8a6 100%)',
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>
              </div>
            )}

            {androidDownloadState === 'installing' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#16a34a',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '18px'
                }}
              >
                <CheckCircle size={18} />
                <span>اكتمل التنزيل بنجاح! يرجى تأكيد التثبيت للمتابعة.</span>
              </div>
            )}

            {androidDownloadState === 'error' && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '18px'
                }}
              >
                ⚠️ {androidError || 'تعذر استكمال التنزيل. يرجى مراجعة الاتصال والمحاولة ثانية.'}
              </div>
            )}

            {/* أزرار الإجراءات */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleStartAndroidUpdate}
                disabled={androidDownloadState === 'downloading' || androidDownloadState === 'installing'}
                style={{
                  flex: 1,
                  height: '46px',
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: (androidDownloadState === 'downloading' || androidDownloadState === 'installing') ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)'
                }}
              >
                <Download size={18} />
                <span>
                  {androidDownloadState === 'downloading' ? 'جاري التنزيل...' : (androidDownloadState === 'error' ? 'إعادة المحاولة' : 'تحديث التطبيق الآن')}
                </span>
              </button>

              {!androidUpdate.isMandatory && androidDownloadState === 'idle' && (
                <button
                  type="button"
                  onClick={() => setIsAndroidModalOpen(false)}
                  style={{
                    padding: '0 16px',
                    height: '46px',
                    background: '#f8fafc',
                    color: '#64748b',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  لاحقاً
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
