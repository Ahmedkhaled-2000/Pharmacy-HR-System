import React from 'react';

/**
 * 👑 SovereignSimulationBar
 * شريط العودة السيادي اللحظي للمالك عند الدخول بوضع محاكاة أي فرع أو عضو
 * يتيح العودة لبوابة قيادة المالك المركزية بنقرة واحدة دون الحاجة لإعادة كتابة كلمة المرور
 */
export default function SovereignSimulationBar({ simulationTitle = '', onExitSimulation }) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999999,
      background: 'linear-gradient(90deg, #78350f 0%, #b45309 25%, #d97706 50%, #b45309 75%, #78350f 100%)',
      color: '#ffffff',
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '14px',
      direction: 'rtl',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      boxShadow: '0 4px 20px rgba(180, 83, 9, 0.45)',
      borderBottom: '2px solid rgba(254, 240, 138, 0.45)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          boxShadow: 'inset 0 0 8px rgba(254, 240, 138, 0.5)'
        }}>
          👑
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 900, fontSize: '13.5px', color: '#fef08a' }}>
              وضع محاكاة المالك السيادي (Sovereign Owner Simulation):
            </span>
            <span style={{
              background: 'rgba(0, 0, 0, 0.3)',
              color: '#ffffff',
              padding: '2px 10px',
              borderRadius: '99px',
              fontSize: '12px',
              fontWeight: 800,
              border: '1px solid rgba(254, 240, 138, 0.4)'
            }}>
              {simulationTitle || 'وضع تشغيلي مؤقت'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(254, 243, 199, 0.9)', fontWeight: 600 }}>
            تتصفح المنظومة الآن بصلاحيات هذا الدور ميدانياً. يمكنك العودة لكامل صلاحيات المالك المركزية في أي لحظة.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={onExitSimulation}
          style={{
            background: '#ffffff',
            color: '#92400e',
            border: '2px solid #fde68a',
            borderRadius: '10px',
            padding: '7px 18px',
            fontSize: '13px',
            fontWeight: 900,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.background = '#fef3c7';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
        >
          <span>👑</span>
          <span>العودة لبوابة قيادة المالك المركزية</span>
          <span>↩</span>
        </button>
      </div>
    </div>
  );
}
