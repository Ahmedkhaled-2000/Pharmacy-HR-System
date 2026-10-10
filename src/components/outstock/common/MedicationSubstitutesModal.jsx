import React, { useState, useEffect } from 'react';

/**
 * MedicationSubstitutesModal.jsx
 * نافذة الذكاء الاصطناعي لاقتراح ومقارنة البدائل والمثائل الدوائية (AI Drug Eye Alternative Recommender)
 */
export default function MedicationSubstitutesModal({
  isOpen,
  onClose,
  medicationName,
  medicationId,
  customerPhone = null,
  customerName = null,
  branchName = null
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (isOpen && (medicationName || medicationId)) {
      setSearchTerm(medicationName || '');
      fetchSubstitutes(medicationName, medicationId);
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, medicationName, medicationId]);

  const fetchSubstitutes = async (nameQuery, idQuery) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('outstock_token') || localStorage.getItem('token');
      const params = new URLSearchParams();
      if (idQuery) params.append('medId', idQuery);
      if (nameQuery) params.append('name', nameQuery);

      const res = await fetch(`/api/outstock/medications/substitutes?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await res.json();
      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'تعذر جلب البدائل الدوائية');
      }
    } catch (err) {
      setError(err.message || 'خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      fetchSubstitutes(searchTerm.trim(), null);
    }
  };

  const copySubstituteToClipboard = (sub) => {
    const text = `💊 *بديل مقترح:* ${sub.trade_name_ar || sub.trade_name_en} (${sub.dosage_form || 'أقراص'})\n💵 *السعر الرسمي:* ${sub.public_price} ج.م | *سعر الشريط:* ${sub.unit_price} ج.م\n🏢 *الشركة:* ${sub.manufacturer || 'مصرية'}`;
    navigator.clipboard.writeText(text);
    setCopiedId(sub.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const shareToWhatsApp = (sub) => {
    const custTxt = customerName ? `عزيزنا العميل (${customerName})،\n` : 'تحية طيبة زميلنا العزيز،\n';
    const brTxt = branchName ? `بصيدلية ${branchName}` : 'بالصيدلية';
    const msg = `${custTxt}` +
      `بخصوص استفساركم عن دواء: *${medicationName || searchTerm}*\n` +
      `نفيدكم بتوفر البديل المعتمد بنفس المادة الفعالة والتركيز ${brTxt}:\n\n` +
      `⭐ *الاسم التجاري:* ${sub.trade_name_ar || sub.trade_name_en} (${sub.dosage_form || 'أقراص'})\n` +
      `💵 *السعر الرسمي:* ${sub.public_price} ج.م\n` +
      (sub.unit_price ? `🏷️ *سعر الوحدة/الشريط:* ${sub.unit_price} ج.م\n` : '') +
      `🏢 *الشركة المصنعة:* ${sub.manufacturer || 'معتمدة من هيئة الدواء'}\n\n` +
      `يمكنكم تأكيد حجز الصنف أو استلامه مباشرة 🌸`;

    let cleanPhone = customerPhone ? String(customerPhone).replace(/\D/g, '') : '';
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '2' + cleanPhone;
    }
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: 'Cairo, Tajawal, system-ui, sans-serif'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px'
              }}
            >
              🔄
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                رادار البدائل والمثائل الدوائية (AI Drug Eye)
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.9 }}>
                مطابقة فورية للمادة الفعالة والتركيز وقاعدة بيانات هيئة الدواء المصرية
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              color: '#ffffff',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search Bar & Target Drug Banner */}
        <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم الدواء أو المادة الفعالة..."
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                background: '#0d9488',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {loading ? 'جاري الفحص...' : 'فحص البدائل 🔍'}
            </button>
          </form>

          {data?.medication && (
            <div
              style={{
                background: '#ffffff',
                padding: '12px 16px',
                borderRadius: '14px',
                border: '1px solid #ccfbf1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>الصنف الأصلي المطلوب:</span>
                <div style={{ fontWeight: '800', color: '#0f766e', fontSize: '15px' }}>
                  {data.medication.trade_name_ar || data.medication.trade_name_en || searchTerm}
                </div>
              </div>
              {data.genericName && (
                <div style={{ textAlign: 'left', direction: 'ltr' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Active Ingredient:</span>
                  <div style={{ fontWeight: '700', color: '#be185d', fontSize: '13px' }}>
                    🧬 {data.genericName}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  border: '4px solid #ccfbf1',
                  borderTopColor: '#0d9488',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px'
                }}
              />
              <p style={{ margin: 0, color: '#64748b', fontWeight: '700' }}>
                جاري مطابقة المادة الفعالة واستخراج البدائل الرسمية...
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                background: '#fef2f2',
                color: '#991b1b',
                padding: '16px',
                borderRadius: '12px',
                textAlign: 'center',
                fontWeight: '700'
              }}
            >
              ⚠️ {error}
            </div>
          ) : !data?.substitutes || data.substitutes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>🔍</div>
              <h4 style={{ margin: '0 0 6px', color: '#334155' }}>
                لم يتم العثور على بدائل مباشرة مسجلة
              </h4>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                تأكد من كتابة الاسم التجاري بدقة أو جرب البحث بالمادة الفعالة مباشرة.
              </p>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>
                  المثائل والبدائل المتاحة ({data.substitutes.length})
                </div>
                <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: '700' }}>
                  ✓ تطابق تام في المادة الفعالة (Same Active Ingredient)
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                {data.substitutes.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    style={{
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '14px 18px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      transition: 'all 0.2s',
                      background: '#ffffff'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#ccfbf1',
                            color: '#0f766e',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          #{idx + 1}
                        </span>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                          {sub.trade_name_ar || sub.trade_name_en}
                        </h4>
                        {sub.trade_name_en && sub.trade_name_ar && (
                          <span style={{ fontSize: '12px', color: '#64748b', direction: 'ltr' }}>
                            ({sub.trade_name_en})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                        {sub.dosage_form && <span>💊 {sub.dosage_form}</span>}
                        {sub.manufacturer && <span>🏢 {sub.manufacturer}</span>}
                        {sub.pack_size > 1 && <span>📦 عبوة {sub.pack_size} {sub.unit_name || 'شريط'}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '17px', fontWeight: '900', color: '#0f766e' }}>
                          {sub.public_price} <span style={{ fontSize: '12px' }}>ج.م</span>
                        </div>
                        {sub.unit_price > 0 && sub.pack_size > 1 && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {sub.unit_price} ج.م / {sub.unit_name || 'شريط'}
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => copySubstituteToClipboard(sub)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '10px',
                            background: copiedId === sub.id ? '#dcfce7' : '#f1f5f9',
                            color: copiedId === sub.id ? '#15803d' : '#334155',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                          title="نسخ بيانات البديل للحافظة"
                        >
                          {copiedId === sub.id ? 'تم النسخ ✓' : 'نسخ 📋'}
                        </button>

                        <button
                          onClick={() => shareToWhatsApp(sub)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            background: '#25d366',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="إرسال بيانات البديل للعميل بالواتساب"
                        >
                          واتساب 💬
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#64748b'
          }}
        >
          <span>💡 مصادق طبقاً للتسعيرة الجبرية وقواعد بيانات هيئة الدواء المصرية</span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              background: '#e2e8f0',
              border: 'none',
              fontWeight: '700',
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
