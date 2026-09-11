import React from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles, ShieldCheck, Zap, ArrowRight } from 'lucide-react';

/**
 * DesktopUpdateModal.jsx
 * نافذة التحديثات التلقائية المباشرة لتطبيق ويندوز المكتبي (.exe)
 * مصممة بنظام Windows 11 Fluent Design الراقي وبأعلى معايير الجمالية البصرية (Glassmorphism)
 * - لا تعتمد على كلاسات Tailwind غير المضمنة، وتستخدم تنسيق فانيلا أصيل ومحكم 100%
 */
export default function DesktopUpdateModal({
  isOpen,
  onClose,
  updateStatus,
  updateInfo,
  downloadProgress,
  onInstallNow,
  onCheckAgain,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(7, 11, 20, 0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '20px',
        animation: 'winModalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      <div
        dir="rtl"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '520px',
          background: 'linear-gradient(165deg, #131c2e 0%, #0d1322 100%)',
          color: '#f8fafc',
          borderRadius: '22px',
          boxShadow: '0 25px 65px -15px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.12), 0 0 35px rgba(16, 185, 129, 0.15)',
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        }}
      >
        {/* شريط الإضاءة الملون العلوي (Top Glow Bar) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%)'
          }}
        />

        {/* زر الإغلاق ✕ ناحية اليسار (في الاتجاه العربي RTL) */}
        {updateStatus !== 'progress' && (
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
            title="إغلاق"
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>
        )}

        <div style={{ padding: '28px 28px 24px' }}>
          {/* رأس النافذة: الأيقونة المضيئة والعنوان والإصدار */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background:
                  updateStatus === 'downloaded'
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.12))'
                    : updateStatus === 'progress'
                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(37, 99, 235, 0.12))'
                    : updateStatus === 'error'
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(220, 38, 38, 0.12))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.12))',
                border:
                  updateStatus === 'downloaded'
                    ? '1.5px solid rgba(16, 185, 129, 0.45)'
                    : updateStatus === 'progress'
                    ? '1.5px solid rgba(59, 130, 246, 0.45)'
                    : updateStatus === 'error'
                    ? '1.5px solid rgba(239, 68, 68, 0.45)'
                    : '1.5px solid rgba(245, 158, 11, 0.45)',
                boxShadow:
                  updateStatus === 'downloaded'
                    ? '0 0 20px rgba(16, 185, 129, 0.3)'
                    : updateStatus === 'progress'
                    ? '0 0 20px rgba(59, 130, 246, 0.3)'
                    : 'none'
              }}
            >
              {updateStatus === 'downloaded' ? (
                <CheckCircle2 style={{ width: '28px', height: '28px', color: '#34d399' }} />
              ) : updateStatus === 'progress' ? (
                <Download style={{ width: '28px', height: '28px', color: '#60a5fa' }} />
              ) : updateStatus === 'error' ? (
                <AlertCircle style={{ width: '28px', height: '28px', color: '#f87171' }} />
              ) : (
                <Sparkles style={{ width: '28px', height: '28px', color: '#fbbf24' }} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '19px',
                    fontWeight: 800,
                    letterSpacing: '0.2px',
                    color: '#ffffff'
                  }}
                >
                  تحديث جديد للمنظومة
                </h3>
                {updateInfo?.version && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      padding: '2px 9px',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.16)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      letterSpacing: '0.4px'
                    }}
                  >
                    v{updateInfo.version}
                  </span>
                )}
              </div>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '12.5px',
                  color: '#94a3b8',
                  fontWeight: 500
                }}
              >
                تحديث تلقائي فوري وسلس دون الحاجة لإعادة تثبيت البرنامج
              </p>
            </div>
          </div>

          {/* محتوى الحالة (Body Details) */}
          <div style={{ marginBottom: '22px' }}>
            {/* الحالة 1: تم تنزيل التحديث وهو جاهز لإعادة التشغيل والتطبيق */}
            {updateStatus === 'downloaded' && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%)',
                  border: '1.5px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '16px',
                  padding: '18px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '15px' }}>🎉</span>
                  <strong style={{ fontSize: '14px', color: '#34d399', fontWeight: 800 }}>
                    تم تنزيل النسخة الجديدة بنجاح!
                  </strong>
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#e2e8f0',
                    lineHeight: '1.7',
                    fontWeight: 500
                  }}
                >
                  اضغط على الزر الأخضر أدناه لإعادة تشغيل المنظومة وتطبيق الإصدار الجديد فورياً في ثوانٍ معدودة دون فقدان أي بيانات أو تعديلات.
                </p>

                {/* شارات الضمان والسرعة */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(16, 185, 129, 0.2)',
                    fontSize: '11.5px',
                    color: '#a7f3d0'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Zap style={{ width: '13px', height: '13px', color: '#34d399' }} />
                    تطبيق فوري خلال 5 ثوانٍ
                  </span>
                  <span style={{ opacity: 0.4 }}>•</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck style={{ width: '13px', height: '13px', color: '#34d399' }} />
                    أمان تام لكافة البيانات
                  </span>
                </div>
              </div>
            )}

            {/* الحالة 2: جاري تنزيل ملفات التحديث */}
            {updateStatus === 'progress' && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
                    جاري تنزيل حزمة التحديث في الخلفية...
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '14px', color: '#60a5fa' }}>
                    {downloadProgress || 0}%
                  </span>
                </div>

                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginBottom: '10px'
                  }}
                >
                  <div
                    style={{
                      width: `${downloadProgress || 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)',
                      borderRadius: '8px',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>

                <p style={{ margin: 0, fontSize: '11.5px', color: '#94a3b8', textAlign: 'center' }}>
                  يمكنك مواصلة استخدام المنظومة كالمعتاد، سيتم إشعارك فور اكتمال التنزيل.
                </p>
              </div>
            )}

            {/* الحالة 3: جاري الفحص */}
            {updateStatus === 'checking' && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <RefreshCw style={{ width: '20px', height: '20px', color: '#60a5fa' }} className="animate-spin" />
                <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 600 }}>
                  جاري التحقق من وجود إصدارات أحدث عبر السحابة...
                </span>
              </div>
            )}

            {/* الحالة 4: تم العثور على إصدار جديد وجاري البدء */}
            {updateStatus === 'available' && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '16px',
                  padding: '18px'
                }}
              >
                <p style={{ margin: '0 0 10px 0', fontSize: '13.5px', color: '#fde68a', fontWeight: 700 }}>
                  🎉 تم العثور على إصدار جديد (v{updateInfo?.version || ''}) وجاري بدء التنزيل...
                </p>
                {updateInfo?.releaseNotes && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#cbd5e1',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      padding: '10px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      whiteSpace: 'pre-line',
                      lineHeight: '1.6'
                    }}
                  >
                    <strong style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>ملاحظات التحديث:</strong>
                    {updateInfo.releaseNotes}
                  </div>
                )}
              </div>
            )}

            {/* الحالة 5: أنت على أحدث إصدار */}
            {updateStatus === 'not-available' && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <CheckCircle2 style={{ width: '20px', height: '20px', color: '#34d399', flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#34d399', fontWeight: 600 }}>
                  أنت تستخدم أحدث إصدار متوفر للمنظومة بالفعل! لا توجد تحديثات جديدة حالياً.
                </span>
              </div>
            )}

            {/* الحالة 6: خطأ */}
            {updateStatus === 'error' && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '16px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
                  <AlertCircle style={{ width: '18px', height: '18px' }} />
                  <span>تعذر فحص أو تنزيل التحديث. يرجى التحقق من اتصال الإنترنت أو المحاولة لاحقاً.</span>
                </div>
              </div>
            )}
          </div>

          {/* أزرار الإجراءات (Action Buttons) */}
          <div>
            {updateStatus === 'downloaded' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  onClick={onInstallNow}
                  style={{
                    width: '100%',
                    padding: '14px 22px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '15px',
                    fontWeight: 800,
                    letterSpacing: '0.3px',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px -4px rgba(16, 185, 129, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.15) inset',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'brightness(1.1)';
                    e.currentTarget.style.transform = 'translateY(-1.5px)';
                    e.currentTarget.style.boxShadow = '0 12px 30px -4px rgba(16, 185, 129, 0.75)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 8px 24px -4px rgba(16, 185, 129, 0.55)';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'scale(0.98)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <RefreshCw style={{ width: '18px', height: '18px' }} />
                  <span>تطبيق التحديث وإعادة التشغيل الفوري</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'transparent',
                    color: '#94a3b8',
                    border: 'none',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'color 0.15s ease',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ffffff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                  }}
                >
                  المتابعة لاحقاً (يمكنك التثبيت بأي وقت من الشريط العلوي)
                </button>
              </div>
            ) : updateStatus === 'progress' ? (
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
              >
                المتابعة في الخلفية
              </button>
            ) : updateStatus === 'error' ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={onCheckAgain}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: '#3b82f6',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    outline: 'none'
                  }}
                >
                  <RefreshCw style={{ width: '14px', height: '14px' }} />
                  إعادة المحاولة
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                إغلاق
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
