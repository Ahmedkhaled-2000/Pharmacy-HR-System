import React, { useState } from 'react';
import { usePOS } from '../../context/POSContext';
import { saveUnifiedCustomer } from '../../services/posCustomerService';
import {
  User,
  Phone,
  MapPin,
  Heart,
  X,
  CheckCircle2,
  Building2,
  FileText,
  Save,
  Clock,
  Sparkles
} from 'lucide-react';

/**
 * PosCustomerModal
 * نافذة تسجيل وتعديل بيانات العميل المركزية الموحدة
 * متصلة مباشرة بقاعدة بيانات OutStock و POS الموحدة (public.outstock_customers)
 * تصميم فاتح عالمي أنيق مع خلفية زجاجية طبيعية شفافة
 */
export default function PosCustomerModal() {
  const {
    isCustomerModalOpen,
    setIsCustomerModalOpen,
    activeWindowId,
    updateWindowCustomer,
    salesWindows
  } = usePOS();

  const currentWindow = salesWindows?.find((w) => w.id === activeWindowId);
  const activeCustomer = currentWindow?.customer || {};

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [landlinePhone, setLandlinePhone] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [notes, setNotes] = useState('');
  const [isChronic, setIsChronic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // ملء الحقول تلقائياً إذا كان هناك رقم هاتف أو اسم مكتوب في شاشة البيع
  React.useEffect(() => {
    if (isCustomerModalOpen) {
      setName(activeCustomer.name || '');
      setPhone(activeCustomer.phone || '');
      setAddress(activeCustomer.address || '');
      setIsChronic(Boolean(activeCustomer.isChronic));
      setErrorMsg('');
      setIsSaved(false);
    }
  }, [isCustomerModalOpen, activeCustomer]);

  if (!isCustomerModalOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('⚠️ يرجى إدخال اسم العميل');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErrorMsg('⚠️ يرجى إدخال رقم هاتف صحيح (11 رقم للموبايل)');
      return;
    }

    setIsSaving(true);
    try {
      const branchId = localStorage.getItem('app_pos_branch_id') || 'main';
      const result = await saveUnifiedCustomer({
        name: name.trim(),
        phone: cleanPhone,
        landlinePhone: landlinePhone.trim(),
        address: address.trim(),
        zone: zone.trim(),
        notes: notes.trim(),
        isChronic
      }, branchId);

      if (result.success && result.customer) {
        const unifiedCust = {
          id: result.customer.id,
          name: result.customer.full_name || name.trim(),
          phone: result.customer.whatsapp_phone || cleanPhone,
          address: result.customer.address || address.trim(),
          isChronic: Boolean(result.customer.is_chronic),
          walletBalance: parseFloat(result.customer.wallet_balance || 0),
          customerCode: result.customer.customer_code
        };

        // ربط العميل فورياً بنافذة البيع النشطة
        if (activeWindowId) {
          updateWindowCustomer(activeWindowId, unifiedCust);
        }

        setIsSaved(true);
        setTimeout(() => {
          setIsSaved(false);
          setIsCustomerModalOpen(false);
        }, 800);
      } else {
        setErrorMsg(result.error || 'حدث خطأ أثناء حفظ العميل بقاعدة البيانات');
      }
    } catch (err) {
      console.error('Customer save error:', err);
      setErrorMsg('تعذر حفظ العميل، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        animation: 'posFadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsCustomerModalOpen(false);
      }}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '540px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال */}
        <div
          style={{
            padding: '16px 22px',
            background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
              }}
            >
              <User size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                تسجيل عميل مركزي جديد (OutStock & POS)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                يتم الحفظ في قاعدة البيانات الموحدة ويكون متاحاً في النواقص ونقاط البيع فوراً
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(false)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* نموذج تسجيل العميل */}
        <form onSubmit={handleSave} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* اسم العميل */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
              اسم العميل بالكامل <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                required
                placeholder="أدخل اسم العميل ثلاثي أو الاسم التجاري..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 38px 0 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* رقم الهاتف والواتساب */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                رقم الموبايل / واتساب <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="tel"
                  required
                  placeholder="01xxxxxxxxx (11 رقم)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 38px 0 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '13px',
                    direction: 'ltr',
                    textAlign: 'right',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                الهاتف الأرضي (اختياري)
              </label>
              <input
                type="tel"
                placeholder="02xxxxxxxx"
                value={landlinePhone}
                onChange={(e) => setLandlinePhone(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '13px',
                  direction: 'ltr',
                  textAlign: 'right',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* العنوان والمنطقة */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                العنوان بالتفصيل
              </label>
              <div style={{ position: 'relative' }}>
                <MapPin size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="الشارع، رقم العمارة، الدور، الشقة..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 38px 0 12px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                المنطقة / خط السير
              </label>
              <input
                type="text"
                placeholder="مثال: وسط البلد"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* ميزة متابعة الأمراض المزمنة */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: isChronic ? '#f0fdfa' : '#f8fafc',
              border: isChronic ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onClick={() => setIsChronic(!isChronic)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Heart size={20} color={isChronic ? '#0d9488' : '#94a3b8'} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  عميل علاج شهري ومزمن (Chronic Refill)
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  تفعيل التذكير الآلي عبر الواتساب بميعاد تكرار الروشتة قبل نفاد الدواء
                </div>
              </div>
            </div>

            <input
              type="checkbox"
              checked={isChronic}
              onChange={(e) => setIsChronic(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#0d9488' }}
            />
          </div>

          {/* أزرار الحفظ والإلغاء */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isSaving || isSaved}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '12px',
                background: isSaved
                  ? '#059669'
                  : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 6px 18px rgba(13, 148, 136, 0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              {isSaved ? (
                <>
                  <CheckCircle2 size={18} />
                  <span>تم الحفظ والربط بنجاح!</span>
                </>
              ) : isSaving ? (
                <>
                  <Clock size={18} className="pos-spin-icon" />
                  <span>جاري الحفظ في القاعدة المركزية...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>حفظ العميل وربطه بالفاتورة</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(false)}
              style={{
                padding: '0 18px',
                height: '44px',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 700,
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
