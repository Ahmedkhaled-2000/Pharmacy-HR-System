import React from 'react';
import { AlertOctagon, MessageSquare, LogOut, Clock, ShieldAlert } from 'lucide-react';

export default function AdminSuspensionView({ reason, customMessage, onLogout }) {
  const contactWhatsApp = () => {
    const text = encodeURIComponent('السلام عليكم ورحمة الله، تم إيقاف حساب شركتنا في المنظومة، وأود سداد الاشتراك وتجديد الحساب وتفعيله فوراً.');
    window.open(`https://api.whatsapp.com/send?phone=201000000000&text=${text}`, '_blank');
  };

  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      background: 'radial-gradient(circle at 10% 20%, #1e1b4b 0%, #0f172a 60%, #020617 100%)',
      color: '#ffffff',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      direction: 'rtl',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '560px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1.5px solid rgba(244, 63, 94, 0.4)',
        borderRadius: '24px',
        padding: '36px 30px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '74px',
          height: '74px',
          borderRadius: '50%',
          background: 'rgba(244, 63, 94, 0.15)',
          border: '2px solid #f43f5e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto',
          color: '#f43f5e'
        }}>
          <AlertOctagon size={42} />
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: '24px', fontWeight: 900, color: '#ffffff' }}>
          تم إيقاف حساب الشركة مؤقتاً
        </h2>

        <div style={{
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '14px',
          padding: '16px',
          margin: '18px 0',
          fontSize: '14px',
          color: '#fecdd3',
          lineHeight: '1.7',
          textAlign: 'right'
        }}>
          <div style={{ fontWeight: 800, marginBottom: '6px', color: '#fda4af' }}>
            📌 سبب إيقاف الحساب:
          </div>
          <div>
            {customMessage || reason || 'انتهت فترة الاشتراك المعتمدة وفترة السماح دون سداد مستحقات التجديد. تم تعليق صلاحيات كافة فروع وموظفي المنشأة لحين تسوية الحساب.'}
          </div>
        </div>

        <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: '0 0 24px' }}>
          لإعادة تفعيل الحساب وتشغيل كافة الشاشات والموظفين فوراً، يرجى التواصل مع إدارة النظام عبر الواتساب لتأكيد السداد.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={contactWhatsApp}
            style={{
              background: '#25d366',
              color: '#064e3b',
              border: 'none',
              padding: '13px 20px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 18px rgba(37, 211, 102, 0.4)'
            }}
          >
            <MessageSquare size={18} />
            <span>التواصل عبر واتساب لتجديد وتفعيل الاشتراك فوراً</span>
          </button>

          <button
            onClick={onLogout}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#cbd5e1',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '11px 20px',
              borderRadius: '12px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <LogOut size={16} />
            <span>تسجيل الخروج والعودة لشاشة الدخول</span>
          </button>
        </div>
      </div>
    </div>
  );
}
