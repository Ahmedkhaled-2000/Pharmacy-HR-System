import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Sparkles, Plus, Check, RefreshCw, Pill, Building2, Layers } from 'lucide-react';
import { outstockGetSubstitutes } from '../../../utils/outstockApiClient';

/**
 * ItemUnavailabilityModal.jsx
 * نافذة شطب الصنف وتحديد سبب عدم التوفر مع نظام اقتراح البدائل الذكي التلقائي
 * يتم إرسال البدائل حصرياً إلى واتساب الفرع فقط، مع تمكين الفرع من إرسالها للعميل
 */
export default function ItemUnavailabilityModal({
  isOpen,
  item,
  onClose,
  onConfirm,
  isProcessing = false
}) {
  const [reasonText, setReasonText] = useState('');
  const [substitutesList, setSubstitutesList] = useState([]);
  const [selectedSubstitutes, setSelectedSubstitutes] = useState([]);
  const [customSubInput, setCustomSubInput] = useState('');
  const [isLoadingSubstitutes, setIsLoadingSubstitutes] = useState(false);

  const PRESET_REASONS = [
    'غير متوفر لدى جميع الوكلاء والموزعين',
    'نواقص عامة بالشركة المصنعة / توقف خط الإنتاج',
    'كوتة محدودة جداً وتأخر توريد الشحنات',
    'صنف مستورد وغير متوفر حالياً بالسوق المصري',
    'جاري توفيره خلال دفعة الأسبوع القادم'
  ];

  useEffect(() => {
    if (isOpen && item) {
      setReasonText(PRESET_REASONS[0]);
      setCustomSubInput('');
      fetchSubstitutes(item.medication_name);
    } else {
      setSubstitutesList([]);
      setSelectedSubstitutes([]);
    }
  }, [isOpen, item]);

  const fetchSubstitutes = async (medName) => {
    if (!medName) return;
    setIsLoadingSubstitutes(true);
    try {
      const res = await outstockGetSubstitutes(medName);
      if (res?.success && Array.isArray(res.substitutes) && res.substitutes.length > 0) {
        setSubstitutesList(res.substitutes);
        // التحديد التلقائي للبدائل الثلاثة الأولى الأكثر ملاءمة
        setSelectedSubstitutes(res.substitutes.slice(0, 3));
      } else {
        setSubstitutesList([]);
        setSelectedSubstitutes([]);
      }
    } catch (e) {
      console.warn('Error fetching substitutes:', e);
      setSubstitutesList([]);
      setSelectedSubstitutes([]);
    } finally {
      setIsLoadingSubstitutes(false);
    }
  };

  const handleToggleSubstitute = (sub) => {
    const subName = typeof sub === 'object' ? (sub.trade_name_ar || sub.trade_name_en || sub.name) : sub;
    const exists = selectedSubstitutes.some(s => {
      const sName = typeof s === 'object' ? (s.trade_name_ar || s.trade_name_en || s.name) : s;
      return sName === subName;
    });

    if (exists) {
      setSelectedSubstitutes(prev => prev.filter(s => {
        const sName = typeof s === 'object' ? (s.trade_name_ar || s.trade_name_en || s.name) : s;
        return sName !== subName;
      }));
    } else {
      setSelectedSubstitutes(prev => [...prev, sub]);
    }
  };

  const handleAddCustomSubstitute = () => {
    const trimmed = customSubInput.trim();
    if (!trimmed) return;
    const newSubObj = { name: trimmed, isCustom: true };
    setSubstitutesList(prev => [newSubObj, ...prev]);
    setSelectedSubstitutes(prev => [newSubObj, ...prev]);
    setCustomSubInput('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reasonText.trim()) return;

    onConfirm?.({
      reason: reasonText.trim(),
      substitutes: selectedSubstitutes
    });
  };

  if (!isOpen || !item) return null;

  const unitLabel = item.unit_type === 'strip' ? 'شريط' : 'علبة';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
    >
      <div
        className="outstock-card"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
          border: '1.5px solid #fecaca',
          overflow: 'hidden'
        }}
      >
        {/* ترويسة النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            borderBottom: '1.5px solid #fecaca',
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
                background: '#dc2626',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertCircle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#991b1b' }}>
                تسجيل سبب عدم التوفر واقتراح البدائل 💊
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                شطب الصنف من المشتريات وإرسال البدائل الذكية للفرع
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#991b1b',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* محتوى النافذة القابل للتمرير */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* بطاقة معلومات الصنف المعني */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Pill size={16} color="#dc2626" />
                <span>{item.medication_name}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={13} />
                <span>{item.branch_name || 'الفرع'}</span>
                <span>•</span>
                <span>طلبات: {item.orders_count || 1} عميل</span>
              </div>
            </div>

            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: '4px 10px',
                borderRadius: '8px',
                fontWeight: '900',
                fontSize: '13px'
              }}
            >
              الكمية المطلوبة: {item.total_requested_qty} {unitLabel}
            </div>
          </div>

          {/* أزرار سريعة للأسباب الشائعة */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#334155', marginBottom: '8px' }}>
              اختر سبباً سريعاً أو اكتب توضيحك:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {PRESET_REASONS.map((pReason, idx) => {
                const isSelected = reasonText === pReason;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setReasonText(pReason)}
                    style={{
                      background: isSelected ? '#fee2e2' : '#f1f5f9',
                      color: isSelected ? '#991b1b' : '#475569',
                      border: isSelected ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {pReason}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={2}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="اكتب سبب عدم التوفر بالتفصيل..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                padding: '10px 12px',
                fontSize: '13px',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          {/* نظام اقتراح البدائل الذكي التلقائي (DrugEye) */}
          <div
            style={{
              background: '#f0fdf4',
              border: '1.5px solid #bbf7d0',
              borderRadius: '12px',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#16a34a" />
                <span style={{ fontSize: '13.5px', fontWeight: '900', color: '#166534' }}>
                  البدائل والمثائل الذكية المقترحة (نظام DrugEye)
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchSubstitutes(item.medication_name)}
                disabled={isLoadingSubstitutes}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}
              >
                <RefreshCw size={12} className={isLoadingSubstitutes ? 'animate-spin' : ''} />
                <span>إعادة بحث</span>
              </button>
            </div>

            {isLoadingSubstitutes ? (
              <div style={{ textAlign: 'center', padding: '16px', color: '#16a34a', fontSize: '12.5px' }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px' }} />
                <span>جاري استخراج البدائل المتطابقة من قاعدة بيانات الدواء...</span>
              </div>
            ) : substitutesList.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#4b5563', padding: '8px 0', textAlign: 'center' }}>
                لم يتم العثور على بدائل مسجلة تلقائياً لهذا الصنف. يمكنك كتابة بديل يدوي أدناه.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {substitutesList.map((sub, sIdx) => {
                  const sName = typeof sub === 'object' ? (sub.trade_name_ar || sub.trade_name_en || sub.name) : sub;
                  const sPrice = typeof sub === 'object' && sub.public_price ? `${sub.public_price} ج.م` : '';
                  const isChecked = selectedSubstitutes.some(s => {
                    const existingName = typeof s === 'object' ? (s.trade_name_ar || s.trade_name_en || s.name) : s;
                    return existingName === sName;
                  });

                  return (
                    <label
                      key={sIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: isChecked ? '#dcfce7' : '#ffffff',
                        border: isChecked ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                        cursor: 'pointer',
                        fontSize: '12.5px',
                        fontWeight: 700
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSubstitute(sub)}
                          style={{ cursor: 'pointer', accentColor: '#16a34a' }}
                        />
                        <span style={{ color: '#0f172a' }}>{sName}</span>
                      </div>
                      {sPrice && (
                        <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 800 }}>
                          {sPrice}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* إضافة بديل يدوي إن لم يكن موجوداً */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <input
                type="text"
                value={customSubInput}
                onChange={(e) => setCustomSubInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomSubstitute(); } }}
                placeholder="أضف بديل يدوي مقترح..."
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '12px'
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomSubstitute}
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} />
                <span>إضافة</span>
              </button>
            </div>

            {/* تنبيه خصوصية إرسال البدائل */}
            <div
              style={{
                marginTop: '12px',
                padding: '8px 10px',
                background: '#ffffff',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                fontSize: '11.5px',
                color: '#166534',
                lineHeight: '1.4'
              }}
            >
              🔒 <strong>تنبيه توجيه البدائل:</strong> سيتم إرسال هذه البدائل المعتمدة إلى <strong>واتساب الفرع فقط</strong> لتوجيه الصيادلة، وسيظهر زر في طلب العميل بالفرع لمشاركة البدائل معه عند رغبته.
            </div>
          </div>
        </div>

        {/* أزرار الإجراء السفلية */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="outstock-btn outstock-btn-secondary"
            style={{ fontSize: '13px', padding: '8px 16px' }}
          >
            إلغاء وتراجع
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing || !reasonText.trim()}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
            }}
          >
            <Check size={16} />
            <span>{isProcessing ? 'جاري الشطب...' : 'تأكيد شطب الصنف وإرسال البدائل للفرع'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
