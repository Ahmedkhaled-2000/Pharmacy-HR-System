import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { User, Phone, MapPin, Heart, X, CheckCircle2 } from 'lucide-react';

export default function PosCustomerModal() {
  const { isCustomerModalOpen, setIsCustomerModalOpen, activeWindowId, updateWindowCustomer } = usePOS();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isChronic, setIsChronic] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  if (!isCustomerModalOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    const newCustomer = {
      id: `cust_${Date.now()}`,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      isChronic,
      walletBalance: 0
    };

    // حفظ في الذاكرة المحلية للعملاء
    try {
      const raw = localStorage.getItem('pharma_pos_customers');
      const customers = raw ? JSON.parse(raw) : [];
      customers.unshift(newCustomer);
      localStorage.setItem('pharma_pos_customers', JSON.stringify(customers));
    } catch {}

    // ربط العميل بالنافذة النشطة
    if (activeWindowId) {
      updateWindowCustomer(activeWindowId, newCustomer);
    }

    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      setIsCustomerModalOpen(false);
      setName('');
      setPhone('');
      setAddress('');
      setIsChronic(false);
    }, 900);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
      onClick={() => setIsCustomerModalOpen(false)}
    >
      <div
        style={{
          background: 'var(--surface, #0f172a)',
          color: 'var(--text, #f8fafc)',
          border: '1.5px solid rgba(13, 148, 136, 0.4)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '500px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.55)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(13,148,136,0.18) 0%, rgba(15,23,42,0.95) 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(13,148,136,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#14b8a6'
              }}
            >
              <User size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                إضافة وتسجيل عميل جديد (Quick Customer CRM)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                تسجيل العميل لربط المحفظة، تذكير الروشتات، وخدمة التوصيل
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              color: '#94a3b8',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* نموذج الإدخال */}
        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isSaved && (
            <div
              style={{
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>تم تسجيل العميل وربطه بالفاتورة الحالية بنجاح! ✅</span>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#cbd5e1' }}>
              اسم العميل بالكامل *
            </label>
            <input
              type="text"
              required
              placeholder="مثال: أحمد عبد الله..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#cbd5e1' }}>
              رقم الهاتف / الواتساب (11 رقم) *
            </label>
            <input
              type="tel"
              required
              placeholder="مثال: 01012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#cbd5e1' }}>
              عنوان التوصيل (اختياري)
            </label>
            <input
              type="text"
              placeholder="مثال: 15 شارع الطيران، الدور الرابع، شقة 8..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ffffff',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              background: 'rgba(13,148,136,0.1)',
              borderRadius: '8px',
              cursor: 'pointer',
              border: '1px solid rgba(13,148,136,0.2)'
            }}
          >
            <input
              type="checkbox"
              checked={isChronic}
              onChange={(e) => setIsChronic(e.target.checked)}
            />
            <Heart size={16} color="#ef4444" />
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f8fafc' }}>
              عميل علاج مزمن (تفعيل جدول إعادة الصرف وتذكير الواتساب التلقائي)
            </span>
          </label>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: '#0d9488',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              حفظ وربط العميل فوراً
            </button>
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(false)}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: '#cbd5e1',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
