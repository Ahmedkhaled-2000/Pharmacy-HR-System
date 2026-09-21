import React from 'react';
import { Eye, LogOut, ShieldAlert } from 'lucide-react';

export default function GhostModeBanner({ onExitGhostMode, companyName, companyCode }) {
  const handleExit = () => {
    if (onExitGhostMode) {
      onExitGhostMode();
    } else {
      try {
        const backupDevToken = localStorage.getItem('app_dev_backup_token');
        if (backupDevToken) {
          localStorage.setItem('app_auth_token', backupDevToken);
          localStorage.setItem('app_auth_role', 'developer');
          localStorage.removeItem('app_dev_backup_token');
          localStorage.removeItem('app_is_impersonating');
          localStorage.removeItem('app_impersonated_company');
        }
        window.location.href = '/developer';
      } catch {
        window.location.href = '/developer';
      }
    }
  };

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 999999,
      background: 'linear-gradient(90deg, #b45309 0%, #d97706 50%, #b45309 100%)',
      color: '#ffffff',
      padding: '8px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      direction: 'rtl',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      boxShadow: '0 4px 20px rgba(180, 83, 9, 0.45)',
      borderBottom: '2px solid rgba(254, 240, 138, 0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '30px',
          height: '30px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px'
        }}>
          👁️
        </div>
        <div>
          <span style={{ fontWeight: 900, fontSize: '13px', color: '#fef08a' }}>
            وضع محاكاة المطور كمالك شركة (Ghost Mode):
          </span>{' '}
          <span style={{ fontSize: '13px', fontWeight: 800 }}>
            {companyName || 'صيدلية العميل'} ({companyCode || '—'})
          </span>
          <span style={{ fontSize: '11px', opacity: 0.9, marginRight: '10px', display: 'inline-block' }}>
            ⚡ التعديلات والإجراءات هنا حقيقية ومباشرة على حساب وبيانات هذه الشركة
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExit}
        style={{
          padding: '6px 14px',
          borderRadius: '8px',
          background: '#ffffff',
          color: '#b45309',
          border: 'none',
          fontSize: '12px',
          fontWeight: 900,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'transform 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <LogOut size={14} />
        <span>إنهاء المحاكاة والعودة للوحة المطور</span>
      </button>
    </div>
  );
}
