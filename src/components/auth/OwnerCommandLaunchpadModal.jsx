import React from 'react';

export default function OwnerCommandLaunchpadModal({
  isOpen,
  onClose,
  ownerName = 'سيف',
  onSelectSystem,
  isGateMode = false
}) {
  if (!isOpen) return null;

  const systems = [
    {
      id: 'hr',
      title: 'منظومة الموارد البشرية والعمليات (HR)',
      icon: '🏢',
      desc: 'لوحة القيادة، شؤون الموظفين، شفتات الفروع، البصمات، مسير الرواتب المعتمد، ومركز الطلبات والاعتمادات.',
      badge: 'المنظومة الرئيسية',
      gradient: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
      lightBg: 'rgba(13, 148, 136, 0.08)',
      borderColor: 'rgba(13, 148, 136, 0.3)',
      actionText: 'الدخول لمنظومة HR'
    },
    {
      id: 'outstock',
      title: 'نظام نواقص الأدوية والمشتريات (OutStock)',
      icon: '💊',
      desc: 'متابعة نواقص وطلبيات أدوية الفروع والعملاء، دورة التوريد، كتالوج الأدوية، وحركة المشتريات اليومية.',
      badge: 'النواقص والطلبيات',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      lightBg: 'rgba(234, 88, 12, 0.08)',
      borderColor: 'rgba(234, 88, 12, 0.3)',
      actionText: 'فتح نظام النواقص'
    },
    {
      id: 'accounts',
      title: 'منظومة الحسابات العامة (ERP)',
      icon: '🏛️',
      desc: 'شجرة الحسابات المالية، قيود اليومية، ميزان المراجعة، الأرباح والخسائر، وتقارير الإيرادات والمصروفات.',
      badge: 'المالية والحسابات',
      gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      lightBg: 'rgba(37, 99, 235, 0.08)',
      borderColor: 'rgba(37, 99, 235, 0.3)',
      actionText: 'فتح منظومة الحسابات'
    },
    {
      id: 'permissions',
      title: 'صلاحيات الموظفين وهوية النظام',
      icon: '👑',
      desc: 'تثبيت هوية النظام على كافة المنظومات، إدارة صلاحيات الدخول الموحد لموظفي HR، وإدارة المالكين المتعددين.',
      badge: 'إدارة سيادية',
      gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      lightBg: 'rgba(217, 119, 6, 0.08)',
      borderColor: 'rgba(217, 119, 6, 0.3)',
      actionText: 'إدارة الصلاحيات والهوية'
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div style={{
        background: 'var(--surface, #ffffff)',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '920px',
        maxHeight: '94vh',
        overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1px solid var(--border, #e2e8f0)',
        padding: '32px'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px', position: 'relative' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fde68a',
            padding: '4px 14px',
            borderRadius: '99px',
            fontSize: '12px',
            fontWeight: 800,
            marginBottom: '10px'
          }}>
            <span>👑</span>
            <span>بوابة قيادة المالك المركزية · Central Command Launchpad</span>
          </div>

          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: 'var(--text, #0f172a)' }}>
            أهلاً بك يا {ownerName}، إلى أي منظومة ترغب بالدخول؟
          </h2>
          <p style={{ margin: '6px auto 0', fontSize: '14px', color: 'var(--muted, #64748b)', maxWidth: '580px' }}>
            بصفتك مالك المنظومة، لديك وصول سيادي غير مشروط لكافة الأنظمة، ويمكنك التبديل اللحظي بينها في أي وقت دون إعادة تسجيل الدخول.
          </p>

          <button
            type="button"
            onClick={onClose}
            title={isGateMode ? "إلغاء الدخول والعودة لشاشة الدخول" : "إغلاق"}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              background: 'var(--surface-muted, #f1f5f9)',
              border: 'none',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              fontSize: '16px',
              cursor: 'pointer',
              color: 'var(--muted, #64748b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* 4 System Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {systems.map((sys) => (
            <div
              key={sys.id}
              onClick={() => onSelectSystem(sys.id)}
              style={{
                background: sys.lightBg,
                border: `1.5px solid ${sys.borderColor}`,
                borderRadius: '16px',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: sys.gradient,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}>
                    {sys.icon}
                  </div>
                  <span style={{
                    background: '#fff',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    border: '1px solid var(--border)'
                  }}>
                    {sys.badge}
                  </span>
                </div>

                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                  {sys.title}
                </h3>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted, #475569)', lineHeight: 1.5 }}>
                  {sys.desc}
                </p>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <span style={{
                  background: sys.gradient,
                  color: '#fff',
                  padding: '7px 16px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <span>{sys.actionText}</span>
                  <span>←</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: isGateMode ? '#fee2e2' : 'none',
              border: isGateMode ? '1px solid #fca5a5' : 'none',
              color: isGateMode ? '#dc2626' : 'var(--muted, #64748b)',
              padding: isGateMode ? '8px 18px' : '4px 10px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isGateMode ? (
              <>
                <span>✕</span>
                <span>إلغاء الدخول والعودة لشاشة تسجيل الدخول</span>
              </>
            ) : (
              <span>العودة للشاشة السابقة ↩</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
