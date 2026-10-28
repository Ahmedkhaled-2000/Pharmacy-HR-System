import React, { useState, useEffect, useRef } from 'react';
import { validateAndApplyPromoCode, getDiscountConfig } from '../../services/posDiscountService';
import { Tag, X, Check, Sparkles, AlertCircle, ArrowRight, Percent, Coins, ShieldCheck } from 'lucide-react';

export default function PosPromoCodeModal({
  isOpen,
  onClose,
  invoiceSubtotal = 0,
  onApplyPromo
}) {
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  const discountConfig = getDiscountConfig();
  const availablePromos = (discountConfig?.promoCodes || []).filter((p) => p.isActive);

  useEffect(() => {
    if (isOpen) {
      setPromoCodeInput('');
      setValidationResult(null);
      setErrorMsg('');
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleInputChange = (val) => {
    const uppercase = val.toUpperCase().trim();
    setPromoCodeInput(uppercase);
    setErrorMsg('');

    if (uppercase.length >= 3) {
      const res = validateAndApplyPromoCode(uppercase, invoiceSubtotal);
      if (res.valid) {
        setValidationResult(res);
        setErrorMsg('');
      } else {
        setValidationResult(null);
      }
    } else {
      setValidationResult(null);
    }
  };

  const handleApply = (e) => {
    e?.preventDefault();
    if (!promoCodeInput.trim()) {
      setErrorMsg('⚠️ يرجى إدخال كود الخصم أولاً');
      return;
    }

    const res = validateAndApplyPromoCode(promoCodeInput.trim(), invoiceSubtotal);
    if (res.valid) {
      onApplyPromo?.(res);
      onClose?.();
    } else {
      setErrorMsg(res.error || 'كود الخصم غير صالح');
      setValidationResult(null);
    }
  };

  const handleSelectPredefined = (promo) => {
    setPromoCodeInput(promo.code);
    const res = validateAndApplyPromoCode(promo.code, invoiceSubtotal);
    if (res.valid) {
      setValidationResult(res);
      setErrorMsg('');
      onApplyPromo?.(res);
      onClose?.();
    } else {
      setErrorMsg(res.error);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', system-ui, sans-serif",
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1.5px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 60px -10px rgba(15, 23, 42, 0.35), 0 10px 25px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'posFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          backdropFilter: 'blur(16px)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* رأس النافذة الأكريليكي */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
            borderBottom: '1px solid #e2e8f0',
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
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
              }}
            >
              <Tag size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                تطبيق كود الخصم (Promo Code)
              </h3>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '1px' }}>
                إجمالي الفاتورة الحالي: <strong style={{ color: '#0d9488', fontVariantNumeric: 'tabular-nums' }}>{invoiceSubtotal.toFixed(2)} ج.م</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* نموذج إدخال البروموكود */}
        <form onSubmit={handleApply} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
              أدخل كود الخصم الترويجي:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="مثال: PHARMA15 أو WELCOME50"
                value={promoCodeInput}
                onChange={(e) => handleInputChange(e.target.value)}
                style={{
                  width: '100%',
                  height: '48px',
                  padding: '0 16px',
                  borderRadius: '12px',
                  border: validationResult ? '2px solid #059669' : errorMsg ? '2px solid #dc2626' : '2px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 900,
                  color: '#0f172a',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  outline: 'none',
                  boxSizing: 'border-box',
                  boxShadow: validationResult ? '0 0 0 3px rgba(5, 150, 105, 0.15)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              />
              {validationResult && (
                <div
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#ecfdf5',
                    color: '#047857',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800
                  }}
                >
                  <Check size={13} />
                  <span>كود فعال</span>
                </div>
              )}
            </div>

            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#dc2626',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  marginTop: '6px'
                }}
              >
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* بطاقة المعاينة اللحظية للخصم */}
          {validationResult && (
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1.5px solid #86efac',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#166534' }}>
                  {validationResult.promo.title || validationResult.code}
                </div>
                <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '2px' }}>
                  نوع الخصم: {validationResult.discountType === 'percent' ? `${validationResult.discountValue}% خصم نسبي` : `${validationResult.discountValue} ج.م خصم ثابت`}
                  {validationResult.promo.maxDiscountCap > 0 && ` (سقف أقصى: ${validationResult.promo.maxDiscountCap} ج)`}
                </div>
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                  -{validationResult.discountAmount.toFixed(2)} ج.م
                </div>
                <div style={{ fontSize: '10.5px', color: '#166534', fontWeight: 700 }}>
                  قيمة الخصم المستحقة
                </div>
              </div>
            </div>
          )}

          {/* أكواد الخصم النشطة الجاهزة للاختيار السريع */}
          {availablePromos.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>
                ⭐ أكواد خصم متاحة للاختيار السريع:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {availablePromos.map((p) => {
                  const isEligible = !p.minInvoiceTotal || invoiceSubtotal >= p.minInvoiceTotal;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPredefined(p)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: promoCodeInput === p.code ? '#dcfce7' : '#f8fafc',
                        border: promoCodeInput === p.code ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                        color: promoCodeInput === p.code ? '#166534' : isEligible ? '#0f172a' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        transition: 'all 0.12s'
                      }}
                    >
                      <Tag size={12} color={promoCodeInput === p.code ? '#16a34a' : '#0d9488'} />
                      <span>{p.code}</span>
                      <span style={{ fontSize: '10.5px', opacity: 0.8 }}>
                        ({p.discountType === 'percent' ? `${p.discountValue}%` : `${p.discountValue}ج`})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* أزرار الإجراءات */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              disabled={!promoCodeInput.trim()}
              style={{
                flex: 1,
                height: '44px',
                borderRadius: '12px',
                background: promoCodeInput.trim() ? 'linear-gradient(135deg, #0d9488 0%, #059669 100%)' : '#cbd5e1',
                color: '#ffffff',
                border: 'none',
                fontWeight: 900,
                fontSize: '13.5px',
                cursor: promoCodeInput.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: promoCodeInput.trim() ? '0 4px 14px rgba(13, 148, 136, 0.3)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <Check size={17} />
              <span>تطبيق الخصم على الفاتورة [Enter]</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0 18px',
                height: '44px',
                borderRadius: '12px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              إلغاء [Esc]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

