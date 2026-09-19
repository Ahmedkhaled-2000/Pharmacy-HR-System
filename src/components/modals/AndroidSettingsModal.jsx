import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Sliders,
  Bell,
  Smartphone,
  Upload,
  RotateCcw,
  Volume2,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Fingerprint,
  BatteryCharging,
  Download,
  Image as ImageIcon,
  Zap,
  ShieldCheck
} from 'lucide-react';
import {
  getMobileConfig,
  saveMobileConfig,
  applyMobileScale,
  triggerHaptic,
  compressMobileImage,
  DEFAULT_MOBILE_CONFIG
} from '../../utils/mobileConfigHelper';
import {
  isAndroidNative,
  requestSystemNotificationPermission,
  showSystemNotification,
  startBackgroundNotificationService,
  stopBackgroundNotificationService
} from '../../utils/nativeNotifications';
import {
  checkNativeAppUpdate,
  downloadAndInstallNativeUpdate
} from '../../utils/nativeAppUpdater';

/**
 * AndroidSettingsModal.jsx
 * نافذة إعدادات وتخصيص تطبيق الأندرويد والهاتف بنمط Mobile Bottom Sheet
 * - تخصيص الهوية: اسم بوابة الموظف وشعار الصيدلية من المعرض أو الكاميرا
 * - نسبة تكبير الشاشة والخطوط: تحكم سلس مع معاينة حية فورية
 * - إشعارات أندرويد 13+: تفعيل، خدمة الخلفية 24/7، رنين واهتزاز، وزر فحص تجريبي
 * - الأمان والبطارية: قفل البصمة، التغذية اللمسية، وتحديث الـ APK المدمج
 */
export default function AndroidSettingsModal({ isOpen, onClose, onConfigSaved }) {
  const [activeTab, setActiveTab] = useState('branding'); // 'branding' | 'display' | 'notifications' | 'security'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testNotifSent, setTestNotifSent] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // تحديث الـ APK
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);

  // الحالات التفاعلية
  const [appName, setAppName] = useState('بوابة الموظف');
  const [logoPreview, setLogoPreview] = useState('');
  const [hasCustomLogo, setHasCustomLogo] = useState(false);
  const [fontScale, setFontScale] = useState(1.0);
  const [originalFontScale, setOriginalFontScale] = useState(1.0);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [biometricLock, setBiometricLock] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);
  const [notificationVibration, setNotificationVibration] = useState(true);
  const [backgroundService247, setBackgroundService247] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(true);

  const fileInputRef = useRef(null);

  // تحميل الإعدادات المحفوظة
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setSaveSuccess(false);
    setTestNotifSent(false);
    setCacheCleared(false);
    setUpdateInfo(null);

    const cfg = getMobileConfig();
    setAppName(cfg.appName || 'بوابة الموظف');
    setFontScale(Number(cfg.fontScale) || 1.0);
    setOriginalFontScale(Number(cfg.fontScale) || 1.0);
    setHapticEnabled(cfg.hapticEnabled !== false);
    setBiometricLock(Boolean(cfg.biometricLock));
    setNotificationsEnabled(cfg.notificationsEnabled !== false);
    setNotificationSound(cfg.notificationSound !== false);
    setNotificationVibration(cfg.notificationVibration !== false);
    setBackgroundService247(cfg.backgroundService247 !== false);

    if (cfg.customLogoBase64) {
      setLogoPreview(cfg.customLogoBase64);
      setHasCustomLogo(true);
    } else {
      setLogoPreview('./assets/icon.png');
      setHasCustomLogo(false);
    }

    // فحص إذن الإشعارات في المتصفح أو أندرويد
    if (typeof Notification !== 'undefined') {
      setPermissionGranted(Notification.permission === 'granted');
    }

    setLoading(false);
  }, [isOpen]);

  // إغلاق المودال مع استعادة الحجم الأصلي في حال لم يحفظ المستخدم
  const handleClose = () => {
    triggerHaptic('light');
    applyMobileScale(originalFontScale);
    onClose();
  };

  // تغيير نسبة تكبير الخطوط والواجهة مع معاينة حية لحظية
  const handleScaleChange = (newScale) => {
    const clamped = Math.min(Math.max(Number(newScale), 0.85), 1.25);
    setFontScale(clamped);
    applyMobileScale(clamped);
    triggerHaptic('light');
  };

  // اختيار صورة شعار من ألبوم الهاتف أو الكاميرا
  const handleLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      triggerHaptic('light');
      const base64 = await compressMobileImage(file, 256, 256);
      setLogoPreview(base64);
      setHasCustomLogo(true);
    } catch (err) {
      console.error('Failed to compress mobile logo:', err);
    }
  };

  // استعادة الشعار الافتراضي
  const handleResetLogo = () => {
    triggerHaptic('light');
    setLogoPreview('./assets/icon.png');
    setHasCustomLogo(false);
  };

  // طلب إذن إشعارات أندرويد 13+
  const handleRequestNotificationPermission = async () => {
    triggerHaptic('medium');
    try {
      const granted = await requestSystemNotificationPermission();
      setPermissionGranted(Boolean(granted));
      if (granted) {
        triggerHaptic('success');
      }
    } catch (err) {
      console.warn('Failed to request permission:', err);
    }
  };

  // إرسال إشعار تجريبي لشريط الهاتف
  const handleSendTestNotification = async () => {
    triggerHaptic('medium');
    setTestNotifSent(false);
    try {
      await showSystemNotification({
        title: appName || 'بوابة الموظف',
        body: 'مرحباً بك! إشعارات الأندرويد تعمل بنجاح مع الصوت والاهتزاز.',
        id: `test_${Date.now()}`
      });
      setTestNotifSent(true);
      triggerHaptic('success');
      setTimeout(() => setTestNotifSent(false), 4000);
    } catch (err) {
      console.error('Test mobile notification failed:', err);
    }
  };

  // فحص تحديث APK جديد للموبايل
  const handleCheckApkUpdate = async () => {
    triggerHaptic('medium');
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const info = await checkNativeAppUpdate(false);
      setUpdateInfo(info);
      setCheckingUpdate(false);
      triggerHaptic(info?.hasUpdate ? 'success' : 'light');
    } catch (err) {
      console.error('APK update check failed:', err);
      setCheckingUpdate(false);
    }
  };

  // تنزيل وتثبيت تحديث APK
  const handleInstallApk = async () => {
    if (!updateInfo?.downloadUrl) return;
    triggerHaptic('medium');
    setDownloadingUpdate(true);
    try {
      await downloadAndInstallNativeUpdate(updateInfo.downloadUrl);
      setDownloadingUpdate(false);
    } catch (err) {
      console.error('APK download failed:', err);
      setDownloadingUpdate(false);
    }
  };

  // تنظيف الكاش والبيانات المؤقتة للهاتف
  const handleClearCache = () => {
    triggerHaptic('medium');
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
      setCacheCleared(true);
      triggerHaptic('success');
      setTimeout(() => setCacheCleared(false), 3500);
    } catch (err) {
      console.error('Clear cache failed:', err);
    }
  };

  // حفظ الإعدادات وتطبيقها فورياً
  const handleSaveAndApply = () => {
    triggerHaptic('success');
    setSaving(true);

    const newConfig = {
      appName: appName.trim() || 'بوابة الموظف',
      customLogoBase64: hasCustomLogo ? logoPreview : null,
      fontScale: Number(fontScale) || 1.0,
      hapticEnabled,
      biometricLock,
      notificationsEnabled,
      notificationSound,
      notificationVibration,
      backgroundService247
    };

    saveMobileConfig(newConfig);

    // تفعيل أو إيقاف خدمة الخلفية 24/7
    if (isAndroidNative()) {
      if (backgroundService247) {
        startBackgroundNotificationService().catch(() => {});
      } else {
        stopBackgroundNotificationService().catch(() => {});
      }
    }

    if (onConfigSaved) {
      onConfigSaved(newConfig);
    }

    setSaveSuccess(true);
    setSaving(false);

    // إغلاق بعد نصف ثانية لعرض التأكيد
    setTimeout(() => {
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div
      className="android-settings-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        direction: 'rtl',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) {
          handleClose();
        }
      }}
    >
      {/* ── الكارد بنمط Bottom Sheet الحديث للموبايل ── */}
      <div
        className="android-settings-bottom-sheet"
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderBottom: 'none',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          color: '#f8fafc',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* مقبض السحب اللمسي (Drag Handle) */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px', paddingBottom: '4px' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: 'rgba(255, 255, 255, 0.25)' }} />
        </div>

        {/* ── الرأس (Header) ── */}
        <div
          style={{
            padding: '12px 20px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Smartphone style={{ width: '18px', height: '18px', color: '#ffffff' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                إعدادات وتخصيص التطبيق
              </h3>
              <p style={{ fontSize: '11.5px', margin: '2px 0 0 0', color: '#94a3b8' }}>
                الهوية، تكبير الخطوط والواجهة، وإشعارات الأندرويد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>

        {/* ── شريط التبويبات (Tabs Bar) ── */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 10px',
            background: 'rgba(0, 0, 0, 0.2)',
            overflowX: 'auto',
            gap: '4px'
          }}
        >
          {[
            { id: 'branding', label: 'الهوية والشعار', icon: ImageIcon },
            { id: 'display', label: 'تكبير الخطوط', icon: Sliders },
            { id: 'notifications', label: 'إشعارات الهاتف', icon: Bell },
            { id: 'security', label: 'الأمان والبطارية', icon: ShieldCheck }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(tab.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: isActive ? '#34d399' : '#94a3b8',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon style={{ width: '14px', height: '14px' }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── جسم المحتوى (Content Body) ── */}
        <div
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            flex: 1,
            minHeight: '280px'
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '10px' }}>
              <RefreshCw style={{ width: '22px', height: '22px', color: '#10b981' }} className="animate-spin" />
              <span style={{ color: '#94a3b8', fontSize: '13.5px' }}>جاري تحميل الإعدادات...</span>
            </div>
          ) : (
            <>
              {/* ── 1. تبويب الهوية والشعار ── */}
              {activeTab === 'branding' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* حقل اسم التطبيق */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#e2e8f0' }}>
                      اسم التطبيق / البوابة
                    </label>
                    <input
                      type="text"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="أدخل اسم البوابة (مثل: صيدليات النور - بوابة الموظف)"
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '12px',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '5px' }}>
                      يظهر هذا الاسم في أعلى شاشة الهاتف وعلى رأس كافة إشعارات الأندرويد.
                    </span>
                  </div>

                  {/* رفع الشعار من الهاتف */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '16px'
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#e2e8f0' }}>
                      شعار المنظومة في الهاتف (Logo)
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '14px',
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '2px solid rgba(16, 185, 129, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}
                      >
                        <img
                          src={logoPreview || './assets/icon.png'}
                          alt="Logo Preview"
                          onError={(e) => { e.target.src = './assets/icon.png'; }}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleLogoFileChange}
                        />

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              background: '#10b981',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <Upload style={{ width: '13px', height: '13px' }} />
                            <span>اختيار صورة من الهاتف...</span>
                          </button>

                          {hasCustomLogo && (
                            <button
                              type="button"
                              onClick={handleResetLogo}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                color: '#e2e8f0',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              <RotateCcw style={{ width: '12px', height: '12px' }} />
                              <span>الافتراضي</span>
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          يمكن التقاط صورة بالكاميرا أو اختيار شعار الصيدلية من المعرض.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. تبويب تكبير الواجهة والخطوط ── */}
              {activeTab === 'display' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <label style={{ fontSize: '13.5px', fontWeight: 600, color: '#e2e8f0' }}>
                        حجم الخط وعناصر الشاشة (Mobile Scale)
                      </label>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          padding: '3px 9px',
                          borderRadius: '8px',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        {Math.round(fontScale * 100)}%
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0.85"
                      max="1.25"
                      step="0.02"
                      value={fontScale}
                      onChange={(e) => handleScaleChange(e.target.value)}
                      style={{
                        width: '100%',
                        cursor: 'pointer',
                        accentColor: '#10b981',
                        height: '6px'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                      <span>85% (مضغوط)</span>
                      <span>100% (قياسي)</span>
                      <span>125% (مكبر للوضوح)</span>
                    </div>
                  </div>

                  {/* أزرار سريعة بنقرة واحدة */}
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
                      أحجام جاهزة موصى بها:
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {[
                        { label: '85% (شاشات صغيرة)', value: 0.85 },
                        { label: '100% (الافتراضي)', value: 1.00 },
                        { label: '112% (كبير مريح)', value: 1.12 },
                        { label: '125% (شاشات كبيرة)', value: 1.25 }
                      ].map((preset) => {
                        const isSelected = Math.abs(fontScale - preset.value) < 0.02;
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleScaleChange(preset.value)}
                            style={{
                              padding: '6px 11px',
                              borderRadius: '8px',
                              border: isSelected ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                              background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                              color: isSelected ? '#a7f3d0' : '#cbd5e1',
                              fontSize: '11.5px',
                              fontWeight: isSelected ? 700 : 400,
                              cursor: 'pointer'
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* تنبيه المعاينة اللحظية */}
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Zap style={{ width: '16px', height: '16px', color: '#34d399', flexShrink: 0 }} />
                    <span style={{ fontSize: '11.5px', color: '#a7f3d0' }}>
                      يتم تطبيق حجم الخط فورياً على الصفحة أثناء تحريك الشريط لتجربة القراءة قبل الحفظ.
                    </span>
                  </div>
                </div>
              )}

              {/* ── 3. تبويب إشعارات الهاتف ── */}
              {activeTab === 'notifications' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* طلب إذن إشعارات أندرويد 13+ */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                          صلاحية إشعارات الهاتف
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '6px',
                            background: permissionGranted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: permissionGranted ? '#34d399' : '#f87171'
                          }}
                        >
                          {permissionGranted ? 'مفعل ومصرح' : 'بحاجة للموافقة'}
                        </span>
                      </div>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        مطلوب في Android 13+ لظهور الإشعارات في شريط التنبيهات.
                      </span>
                    </div>

                    {!permissionGranted && (
                      <button
                        type="button"
                        onClick={handleRequestNotificationPermission}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#10b981',
                          color: '#ffffff',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        منح الإذن
                      </button>
                    )}
                  </div>

                  {/* خدمة الخلفية 24/7 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        خدمة الإشعارات 24/7 في الخلفية
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        استمرار وصول إشعارات الورديات والطلبات حتى لو أُغلق التطبيق.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={backgroundService247}
                      onChange={(e) => {
                        triggerHaptic('light');
                        setBackgroundService247(e.target.checked);
                      }}
                      style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                    />
                  </div>

                  {/* زر فحص الإشعارات فوري */}
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px dashed rgba(16, 185, 129, 0.3)',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#e2e8f0' }}>
                        تجربة إشعار الهاتف الآن
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>
                        يرسل إشعاراً حقيقياً لشريط إشعارات الأندرويد بالصوت والاهتزاز.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendTestNotification}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        background: testNotifSent ? '#10b981' : '#0284c7',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {testNotifSent ? (
                        <>
                          <Check style={{ width: '14px', height: '14px' }} />
                          <span>وصل الإشعار!</span>
                        </>
                      ) : (
                        <>
                          <Bell style={{ width: '14px', height: '14px' }} />
                          <span>إرسال إشعار تجريبي</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── 4. تبويب الأمان والبطارية والتحديث ── */}
              {activeTab === 'security' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* قفل التطبيق بالبصمة الحيوية */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        قفل التطبيق بالبصمة الحيوية (Biometric Lock)
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        طلب بصمة الإصبع أو الوجه عند فتح التطبيق لحماية الخصوصية.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={biometricLock}
                      onChange={(e) => {
                        triggerHaptic('light');
                        setBiometricLock(e.target.checked);
                      }}
                      style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                    />
                  </div>

                  {/* التغذية اللمسية الارتجاجية */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        التغذية اللمسية (Haptic Feedback)
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        اهتزاز ناعم عند لمس الأزرار وتسجيل الحضور وحفظ التعديلات.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={hapticEnabled}
                      onChange={(e) => {
                        triggerHaptic('light');
                        setHapticEnabled(e.target.checked);
                      }}
                      style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                    />
                  </div>

                  {/* فحص تحديث APK المدمج */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        تحديث تطبيق الأندرويد (APK Updater)
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        فحص وجود إصدار APK أحدث وتنزيله وتثبيته مباشرة.
                      </span>
                    </div>

                    {updateInfo?.hasUpdate ? (
                      <button
                        type="button"
                        onClick={handleInstallApk}
                        disabled={downloadingUpdate}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#10b981',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <Download style={{ width: '13px', height: '13px' }} />
                        <span>تثبيت v{updateInfo.remoteVersion}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCheckApkUpdate}
                        disabled={checkingUpdate}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#ffffff',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {checkingUpdate ? (
                          <>
                            <RefreshCw style={{ width: '13px', height: '13px' }} className="animate-spin" />
                            <span>جاري الفحص...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw style={{ width: '13px', height: '13px' }} />
                            <span>فحص التحديثات</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* تنظيف الكاش */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        تنظيف كاش الهاتف
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>
                        تفريغ الكاش والبيانات المؤقتة لتسريع التطبيق.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearCache}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: cacheCleared ? '#10b981' : 'rgba(255, 255, 255, 0.06)',
                        color: '#ffffff',
                        fontSize: '11.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {cacheCleared ? 'تم التنظيف!' : 'تنظيف الآن'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── التذييل وزر الحفظ والتطبيق (Footer) ── */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'transparent',
              color: '#cbd5e1',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 22px',
              borderRadius: '10px',
              border: 'none',
              background: saveSuccess ? '#10b981' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
            }}
          >
            {saveSuccess ? (
              <>
                <Check style={{ width: '15px', height: '15px' }} />
                <span>تم الحفظ والتطبيق!</span>
              </>
            ) : (
              <>
                <Check style={{ width: '14px', height: '14px' }} />
                <span>حفظ وتطبيق التغييرات</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
