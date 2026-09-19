import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Bell,
  Monitor,
  Upload,
  RotateCcw,
  Volume2,
  VolumeX,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  Image as ImageIcon,
  Zap,
  Power
} from 'lucide-react';

/**
 * DesktopSettingsModal.jsx
 * نافذة إعدادات وتخصيص تطبيق الويندوز المكتبي (Windows 11 Fluent Acrylic Design)
 * - تخصيص الهوية: اسم المنظومة وشعارها المخصص
 * - نسبة التكبير: تحكم فوري بسلايدر وأزرار سريعة مع معاينة حية لحظية
 * - إشعارات ويندوز الأصلية: تفعيل، صوت الرنين، وزر إرسال إشعار تجريبي
 * - سلوك النظام: التشغيل مع إقلاع ويندوز وتنظيف الكاش
 * - الحفظ مع إعادة التشغيل النظيفة للبرنامج (Save & Relaunch)
 */
export default function DesktopSettingsModal({ isOpen, onClose, onConfigSaved }) {
  const [activeTab, setActiveTab] = useState('branding'); // 'branding' | 'display' | 'notifications' | 'system'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testNotifSent, setTestNotifSent] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // الحالة الأصلية عند فتح المودال (لإمكانية التراجع عن المعاينة الحية للزووم عند الإلغاء)
  const [originalConfig, setOriginalConfig] = useState(null);

  // إعدادات النموذج التفاعلي
  const [appName, setAppName] = useState('منظومة إدارة الموارد البشرية والرواتب');
  const [logoPreview, setLogoPreview] = useState('');
  const [hasCustomLogo, setHasCustomLogo] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(0.92);
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [notificationSound, setNotificationSound] = useState(true);
  const [autoLaunch, setAutoLaunch] = useState(false);

  // تحميل الإعدادات الحالية من النظام المكتبي
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setSaveSuccess(false);
    setTestNotifSent(false);
    setCacheCleared(false);

    if (window.desktopAPI?.getDesktopConfig) {
      window.desktopAPI.getDesktopConfig().then((cfg) => {
        if (!isMounted || !cfg) return;
        setOriginalConfig(cfg);
        setAppName(cfg.appName || 'منظومة إدارة الموارد البشرية والرواتب');
        setZoomFactor(Number(cfg.zoomFactor) || 0.92);
        setEnableNotifications(cfg.enableNotifications !== false);
        setNotificationSound(cfg.notificationSound !== false);
        setAutoLaunch(Boolean(cfg.autoLaunch));
        if (cfg.logoBase64) {
          setLogoPreview(cfg.logoBase64);
          setHasCustomLogo(true);
        } else {
          setLogoPreview('./assets/icon.png');
          setHasCustomLogo(Boolean(cfg.customLogoPath));
        }
        setLoading(false);
      }).catch((err) => {
        console.error('Failed to load desktop config:', err);
        if (isMounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // إغلاق المودال مع استعادة الزووم الأصلي في حال لم يحفظ المستخدم
  const handleClose = () => {
    if (originalConfig && originalConfig.zoomFactor) {
      window.desktopAPI?.setZoomFactor?.(Number(originalConfig.zoomFactor) || 0.92);
    }
    onClose();
  };

  // تغيير نسبة التكبير مع معاينة حية لحظية
  const handleZoomChange = (newZoom) => {
    const clamped = Math.min(Math.max(Number(newZoom), 0.6), 1.6);
    setZoomFactor(clamped);
    // معاينة حية فورية في نافذة ويندوز
    try {
      window.desktopAPI?.setZoomFactor?.(clamped);
    } catch {}
  };

  // اختيار ملف شعار جديد للبرنامج
  const handleSelectLogo = async () => {
    if (!window.desktopAPI?.selectLogoFile) return;
    try {
      const res = await window.desktopAPI.selectLogoFile();
      if (res && res.success) {
        setLogoPreview(res.base64Data);
        setHasCustomLogo(true);
      }
    } catch (err) {
      console.error('Failed to select logo:', err);
    }
  };

  // استعادة الشعار الافتراضي
  const handleResetLogo = async () => {
    if (!window.desktopAPI?.resetLogo) return;
    try {
      await window.desktopAPI.resetLogo();
      setLogoPreview('./assets/icon.png');
      setHasCustomLogo(false);
    } catch (err) {
      console.error('Failed to reset logo:', err);
    }
  };

  // إرسال إشعار تجريبي في ويندوز لاختبار البنر والرنين
  const handleSendTestNotification = async () => {
    if (!window.desktopAPI?.showDesktopNotification) return;
    setTestNotifSent(false);
    try {
      await window.desktopAPI.showDesktopNotification({
        title: appName || 'منظومة إدارة الموارد البشرية والرواتب',
        body: 'مرحباً بك! نظام إشعارات ويندوز يعمل بكامل طاقته وصوته مثل الواتساب.',
        silent: !notificationSound
      });
      setTestNotifSent(true);
      setTimeout(() => setTestNotifSent(false), 4000);
    } catch (err) {
      console.error('Test notification failed:', err);
    }
  };

  // تنظيف الكاش والذاكرة المؤقتة للبرنامج
  const handleClearCache = async () => {
    if (!window.desktopAPI?.clearDesktopCache) return;
    try {
      await window.desktopAPI.clearDesktopCache();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3500);
    } catch (err) {
      console.error('Clear cache failed:', err);
    }
  };

  // حفظ الإعدادات وإعادة تشغيل التطبيق تلقائياً
  const handleSaveAndRelaunch = async () => {
    if (!window.desktopAPI?.saveDesktopConfig) return;

    setSaving(true);
    try {
      const newConfig = {
        appName: appName.trim() || 'منظومة إدارة الموارد البشرية والرواتب',
        zoomFactor: Number(zoomFactor) || 0.92,
        enableNotifications,
        notificationSound,
        autoLaunch
      };

      await window.desktopAPI.saveDesktopConfig(newConfig);

      if (onConfigSaved) {
        onConfigSaved(newConfig);
      }

      setSaveSuccess(true);
      setSaving(false);
      setRestarting(true);

      // عد تنازلي ناعم لمدة ثانية واحدة لإظهار تأكيد الحفظ ثم إعادة التشغيل
      setTimeout(async () => {
        try {
          await window.desktopAPI.relaunchApp();
        } catch (e) {
          console.error('Failed to relaunch:', e);
          setRestarting(false);
        }
      }, 1000);
    } catch (err) {
      console.error('Failed to save config:', err);
      setSaving(false);
      setRestarting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="desktop-settings-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
        WebkitAppRegion: 'no-drag'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !restarting) {
          handleClose();
        }
      }}
    >
      <div
        className="desktop-settings-modal-card app-no-drag"
        style={{
          width: '100%',
          maxWidth: '680px',
          background: 'linear-gradient(180deg, rgba(26, 36, 56, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
          borderRadius: '18px',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
          WebkitAppRegion: 'no-drag',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── الرأس (Header) ── */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)'
              }}
            >
              <Settings style={{ width: '20px', height: '20px', color: '#ffffff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                إعدادات وتخصيص تطبيق الويندوز
              </h2>
              <p style={{ fontSize: '12px', margin: '3px 0 0 0', color: '#94a3b8' }}>
                تخصيص الهوية، نسبة العرض والتكبير، وإشعارات ويندوز الأصلية
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={restarting}
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
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = '#94a3b8';
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
            padding: '0 16px',
            background: 'rgba(0, 0, 0, 0.15)',
            gap: '8px'
          }}
        >
          {[
            { id: 'branding', label: 'الهوية والشعار', icon: ImageIcon },
            { id: 'display', label: 'العرض والتكبير', icon: Sliders },
            { id: 'notifications', label: 'إشعارات ويندوز', icon: Bell },
            { id: 'system', label: 'النظام والأداء', icon: Power }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'transparent',
                  color: isActive ? '#60a5fa' : '#94a3b8',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon style={{ width: '15px', height: '15px' }} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── جسم المحتوى (Content Body) ── */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
            minHeight: '320px'
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '10px' }}>
              <RefreshCw style={{ width: '24px', height: '24px', color: '#3b82f6' }} className="animate-spin" />
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>جاري تحميل الإعدادات المكتبية...</span>
            </div>
          ) : (
            <>
              {/* ── 1. تبويب الهوية والشعار ── */}
              {activeTab === 'branding' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* حقل اسم التطبيق */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#e2e8f0' }}>
                      اسم التطبيق أو المنشأة
                    </label>
                    <input
                      type="text"
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="أدخل اسم المنظومة (مثل: صيدليات النور - إدارة الموارد البشرية)"
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '10px',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                      يظهر هذا الاسم في شريط العنوان أعلى النافذة، وفي شريط مهام ويندوز، وعلى رأس جميع الإشعارات.
                    </span>
                  </div>

                  {/* قسم شعار التطبيق */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '16px'
                    }}
                  >
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: '#e2e8f0' }}>
                      شعار التطبيق (Application Icon / Logo)
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      {/* معاينة الشعار */}
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '12px',
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '2px solid rgba(59, 130, 246, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                        }}
                      >
                        <img
                          src={logoPreview || './assets/icon.png'}
                          alt="Logo Preview"
                          onError={(e) => {
                            e.target.src = './assets/icon.png';
                          }}
                          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={handleSelectLogo}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              background: '#3b82f6',
                              border: 'none',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '12.5px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
                          >
                            <Upload style={{ width: '14px', height: '14px' }} />
                            <span>اختيار شعار من الحاسوب...</span>
                          </button>

                          {hasCustomLogo && (
                            <button
                              type="button"
                              onClick={handleResetLogo}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: '8px',
                                color: '#e2e8f0',
                                fontSize: '12.5px',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <RotateCcw style={{ width: '13px', height: '13px' }} />
                              <span>استعادة الافتراضي</span>
                            </button>
                          )}
                        </div>
                        <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          يدعم صور PNG, JPG, ICO, SVG مع خلفية شفافة مفضلة.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* معاينة شريط العنوان */}
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '12px 16px'
                    }}
                  >
                    <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                      معاينة مظهر شريط العنوان بعد التطبيق:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={logoPreview || './assets/icon.png'}
                        alt=""
                        style={{ width: '16px', height: '16px', borderRadius: '3px', objectFit: 'contain' }}
                      />
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f8fafc' }}>
                        {appName || 'منظومة إدارة الموارد البشرية والرواتب'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. تبويب العرض والتكبير (Zoom & Scale) ── */}
              {activeTab === 'display' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <label style={{ fontSize: '13.5px', fontWeight: 600, color: '#e2e8f0' }}>
                        نسبة تكبير / تصغير الواجهة (Zoom Factor)
                      </label>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#60a5fa',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(59, 130, 246, 0.3)'
                        }}
                      >
                        {Math.round(zoomFactor * 100)}%
                      </span>
                    </div>

                    {/* شريط التمرير (Slider) */}
                    <input
                      type="range"
                      min="0.70"
                      max="1.40"
                      step="0.02"
                      value={zoomFactor}
                      onChange={(e) => handleZoomChange(e.target.value)}
                      style={{
                        width: '100%',
                        cursor: 'pointer',
                        accentColor: '#3b82f6',
                        height: '6px'
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#64748b' }}>
                      <span>70% (أصغر حجماً)</span>
                      <span>92% (المتوازن الافتراضي)</span>
                      <span>140% (شاشات الدقة العالية)</span>
                    </div>
                  </div>

                  {/* أزرار سريعة للنسب الشائعة */}
                  <div>
                    <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
                      اختصارات سريعة للنسب الشائعة (معاينة حية فورية):
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[
                        { label: '80% (مضغوط)', value: 0.80 },
                        { label: '90% (موصى به)', value: 0.90 },
                        { label: '92% (افتراضي)', value: 0.92 },
                        { label: '100% (قياسي)', value: 1.00 },
                        { label: '110% (تكبير خفيف)', value: 1.10 },
                        { label: '125% (شاشات كبيرة)', value: 1.25 }
                      ].map((preset) => {
                        const isSelected = Math.abs(zoomFactor - preset.value) < 0.01;
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => handleZoomChange(preset.value)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                              background: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                              color: isSelected ? '#93c5fd' : '#cbd5e1',
                              fontSize: '12px',
                              fontWeight: isSelected ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* تنبيه المعاينة الحية */}
                  <div
                    style={{
                      background: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <Zap style={{ width: '18px', height: '18px', color: '#60a5fa', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#bfdbfe' }}>
                      يتم تطبيق التكبير أمامك لحظياً في الخلفية أثناء تحريك الشريط. اضغط "حفظ وإعادة تشغيل" لتثبيته دائماً.
                    </span>
                  </div>
                </div>
              )}

              {/* ── 3. تبويب إشعارات ويندوز (Native Notifications) ── */}
              {activeTab === 'notifications' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* تفعيل إشعارات ويندوز */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px 16px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        إظهار إشعارات النظام في Windows (Action Center)
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                        ظهور بنرات التنبيه أسفل يمين الشاشة مع تسجيلها في مركز إشعارات ويندوز الجانبي مثل تطبيق الواتساب.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={enableNotifications}
                      onChange={(e) => setEnableNotifications(e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        accentColor: '#3b82f6',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* صوت الرنين */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      opacity: enableNotifications ? 1 : 0.5
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        صوت تنبيه إشعارات الويندوز (System Audio Chime)
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                        تشغيل نغمة رنين ويندوز المعتادة عند استلام إشعار أو طلب جديد.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      disabled={!enableNotifications}
                      checked={notificationSound}
                      onChange={(e) => setNotificationSound(e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        accentColor: '#3b82f6',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* زر فحص الإشعارات فوري */}
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px dashed rgba(59, 130, 246, 0.3)',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                        تجربة إشعار الويندوز المكتبي الآن
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8' }}>
                        اضغط الزر لإرسال إشعار تجريبي فوري واختبار الرنين وشعار التطبيق.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendTestNotification}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '9px 16px',
                        borderRadius: '9px',
                        border: 'none',
                        background: testNotifSent ? '#10b981' : '#3b82f6',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {testNotifSent ? (
                        <>
                          <Check style={{ width: '15px', height: '15px' }} />
                          <span>تم إرسال الإشعار بنجاح!</span>
                        </>
                      ) : (
                        <>
                          <Bell style={{ width: '15px', height: '15px' }} />
                          <span>إرسال إشعار تجريبي للويندوز</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ── 4. تبويب النظام والأداء (System & Performance) ── */}
              {activeTab === 'system' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* التشغيل التلقائي مع إقلاع ويندوز */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px 16px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        التشغيل التلقائي مع إقلاع نظام ويندوز (Launch on Startup)
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                        تشغيل المنظومة تلقائياً بمجرد فتح حاسوب الصيدلية دون الحاجة للتشغيل اليدوي.
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={autoLaunch}
                      onChange={(e) => setAutoLaunch(e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        accentColor: '#3b82f6',
                        cursor: 'pointer'
                      }}
                    />
                  </div>

                  {/* تنظيف الكاش والذاكرة المؤقتة */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: '#f8fafc' }}>
                        تنظيف الذاكرة المؤقتة والكاش المكتبي (Clear Cache & RAM)
                      </span>
                      <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                        تفريغ الكاش ومخازن المتصفح لتسريع البرنامج وتحرير الذاكرة العشوائية.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearCache}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        background: cacheCleared ? '#10b981' : 'rgba(255, 255, 255, 0.07)',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {cacheCleared ? (
                        <>
                          <Check style={{ width: '14px', height: '14px' }} />
                          <span>تم تفريغ الكاش بنجاح!</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw style={{ width: '13px', height: '13px' }} />
                          <span>تنظيف الكاش الآن</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── التذييل وزر الحفظ وإعادة التشغيل (Footer) ── */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            {restarting ? 'جاري إعادة تشغيل التطبيق لتطبيق التغييرات...' : 'يتطلب تطبيق الاسم والشعار إعادة تشغيل سريعة للبرنامج.'}
          </span>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving || restarting}
              style={{
                padding: '9px 18px',
                borderRadius: '9px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'transparent',
                color: '#cbd5e1',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              إلغاء
            </button>

            <button
              type="button"
              onClick={handleSaveAndRelaunch}
              disabled={saving || restarting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                borderRadius: '9px',
                border: 'none',
                background: restarting ? '#10b981' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              {restarting ? (
                <>
                  <RefreshCw style={{ width: '15px', height: '15px' }} className="animate-spin" />
                  <span>جاري إعادة التشغيل...</span>
                </>
              ) : saving ? (
                <>
                  <RefreshCw style={{ width: '15px', height: '15px' }} className="animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Power style={{ width: '14px', height: '14px' }} />
                  <span>حفظ وإعادة تشغيل التطبيق</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
