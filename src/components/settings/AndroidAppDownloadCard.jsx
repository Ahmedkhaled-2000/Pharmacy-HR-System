import React, { useState } from 'react';
import {
  triggerAndroidApkDownload,
  getAndroidApkDownloadUrl,
  LATEST_ANDROID_VERSION,
  LATEST_ANDROID_APK_FILENAME
} from '../../utils/nativeAppUpdater';

export default function AndroidAppDownloadCard({ showToast, isCompact = false }) {
  const [copied, setCopied] = useState(false);
  const apkUrl = getAndroidApkDownloadUrl();
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(apkUrl)}`;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(apkUrl);
      setCopied(true);
      showToast?.('✅ تم نسخ رابط تحميل التطبيق إلى الحافظة');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      showToast?.('⚠️ تعذر نسخ الرابط تلقائياً');
    }
  };

  if (isCompact) {
    return (
      <div
        className="card settings-card"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '1px solid #a7f3d0',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)',
              flexShrink: 0
            }}
          >
            📱
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#065f46', fontWeight: '800' }}>
                تطبيق الأندرويد للهواتف الذكية (Android APK)
              </h4>
              <span
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '99px'
                }}
              >
                v{LATEST_ANDROID_VERSION}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#047857' }}>
              متاح للتنزيل المباشر للموظفين ومديري الفروع مع دعم المزامنة اللحظية والتحديث الذاتي
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={triggerAndroidApkDownload}
            style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
            }}
          >
            <span>📥</span>
            <span>تنزيل ملف APK</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              background: '#ffffff',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              padding: '9px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <span>{copied ? '✅' : '📋'}</span>
            <span>{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card settings-card fade-in"
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
      }}
    >
      {/* Top Banner Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border, #e2e8f0)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
              flexShrink: 0
            }}
          >
            📱
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '19px', fontWeight: '800', color: 'var(--text, #1e293b)' }}>
                تطبيق الأندرويد للهواتف الذكية (Android Mobile App)
              </h3>
              <span
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: '800',
                  padding: '3px 10px',
                  borderRadius: '99px'
                }}
              >
                الإصدار v{LATEST_ANDROID_VERSION}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--muted, #64748b)', fontSize: '13.5px' }}>
              تطبيق مخصص للهواتف يتيح للموظفين ومديري الفروع تسجيل البصمة، متابعة الورديات، وتقديم الطلبات مع المزامنة اللحظية
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={triggerAndroidApkDownload}
            style={{
              background: 'linear-gradient(135deg, #059669, #10b981)',
              color: '#ffffff',
              border: 'none',
              padding: '11px 22px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
              transition: 'transform 0.15s ease'
            }}
          >
            <span style={{ fontSize: '18px' }}>📥</span>
            <span>تحميل ملف APK مباشرة</span>
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              background: 'var(--surface-muted, #f8fafc)',
              color: 'var(--text, #334155)',
              border: '1px solid var(--border, #cbd5e1)',
              padding: '11px 16px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{copied ? '✅' : '📋'}</span>
            <span>{copied ? 'تم النسخ' : 'نسخ رابط التحميل'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Grid: QR Code & Specifications */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '22px'
        }}
      >
        {/* QR Code Card for Scanning from Mobile */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              padding: '10px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              marginBottom: '12px'
            }}
          >
            <img
              src={qrCodeUrl}
              alt="QR Code for Android APK Download"
              style={{ width: '160px', height: '160px', display: 'block', borderRadius: '6px' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
          <h5 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '800', color: 'var(--text, #1e293b)' }}>
            📷 امسح الرمز بكاميرا هاتفك
          </h5>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted, #64748b)' }}>
            وجّه كاميرا الهاتف نحو الرمز لبدء تنزيل التطبيق فوراً على الهاتف
          </p>
        </div>

        {/* Technical Specs & Version Info */}
        <div
          style={{
            background: 'var(--surface-muted, #f8fafc)',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <h5 style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: '800', color: '#0f766e' }}>
            ℹ️ بيانات حزمة التطبيق (Package Details)
          </h5>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted, #64748b)' }}>اسم الملف:</span>
            <span style={{ fontWeight: '700', direction: 'ltr' }}>{LATEST_ANDROID_APK_FILENAME}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted, #64748b)' }}>رقم الإصدار:</span>
            <span style={{ fontWeight: '800', color: '#059669' }}>v{LATEST_ANDROID_VERSION} (Build 5)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted, #64748b)' }}>حجم الملف:</span>
            <span style={{ fontWeight: '700' }}>~94.5 ميجابايت</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted, #64748b)' }}>اسم الحزمة:</span>
            <span style={{ fontWeight: '600', direction: 'ltr', fontSize: '12px' }}>com.pharmacy.employee</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted, #64748b)' }}>التوافق:</span>
            <span style={{ fontWeight: '700' }}>أندرويد 8.0 (Oreo) فما فوق</span>
          </div>
        </div>

        {/* Installation Instructions */}
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <h5 style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: '800', color: '#1d4ed8' }}>
            🚀 خطوات تثبيت التطبيق على الهاتف
          </h5>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: '#1e40af' }}>
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>1</span>
            <span>اضغط زر <strong>تحميل ملف APK</strong> أو امسح رمز الـ QR أعلاه.</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: '#1e40af' }}>
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>2</span>
            <span>افتح الملف بعد اكتمال التحميل من شريط الإشعارات أو مدير الملفات.</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: '#1e40af' }}>
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>3</span>
            <span>في حال ظهور رسالة أمان، اختر <strong>السماح بتثبيت التطبيقات غير المعروفة</strong> لهذا المتصفح.</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12.5px', color: '#1e40af' }}>
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', flexShrink: 0 }}>4</span>
            <span>افتح التطبيق وسجّل الدخول بكود الموظف وكلمة المرور الخاصة بك.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
