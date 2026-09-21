import React from 'react';
import { Wrench, LogOut, Clock, Building } from 'lucide-react';

export default function StaffSuspensionView({ customMessage, onLogout }) {
  return (
    <div style={{
      minHeight: '100vh',
      minHeight: '100dvh',
      background: 'radial-gradient(circle at 50% 20%, #0f172a 0%, #070a12 70%, #020617 100%)',
      color: '#ffffff',
      fontFamily: "'Cairo', 'Tajawal', sans-serif",
      direction: 'rtl',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: 'rgba(30, 41, 59, 0.65)',
        backdropFilter: 'blur(20px)',
        border: '1.5px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '24px',
        padding: '36px 28px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.15)',
          border: '2px solid #38bdf8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px auto',
          color: '#38bdf8'
        }}>
          <Wrench size={38} />
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 900, color: '#ffffff' }}>
          النظام متوقف مؤقتاً لأعمال المراجعة والصيانة
        </h2>

        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '16px',
          margin: '18px 0',
          fontSize: '14px',
          color: '#cbd5e1',
          lineHeight: '1.7'
        }}>
          {customMessage || 'النظام متوقف حالياً لإجراء تحديثات دورية ومراجعة فنية من قبل إدارة الشركة. يرجى مراجعة إدارة الموارد البشرية أو مدير الفرع للمزيد من التفاصيل.'}
        </div>

        <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '0 0 24px' }}>
          سيتم استئناف تسجيل الحضور والطلبات تلقائياً فور انتهاء إدارة الشركة من أعمال التحديث.
        </p>

        <button
          onClick={onLogout}
          style={{
            width: '100%',
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <LogOut size={16} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}
