import React, { useEffect, useState, useRef } from 'react';
import { Calendar, Package, AlertTriangle, CheckCircle2, X, Zap, Clock, Sparkles } from 'lucide-react';
import { checkBatchExpiryStatus } from '../../utils/posEngine';

/**
 * PosBatchSelectionModal.jsx
 * نافذة منبثقة سريعة لاختيار تشغيلة وتاريخ صلاحية الصنف (FEFO Strategy)
 * تنبثق فقط عند إدخال الباركود العالمي أو الاختيار اليدوي إذا كان للصنف أكثر من تاريخ صلاحية في الفرع
 * تدعم الاختيار الفوري عبر لوحة المفاتيح بالأرقام (1, 2, 3...) أو الأسهم + Enter
 */
export default function PosBatchSelectionModal({
  isOpen,
  product,
  onSelectBatch,
  onClose
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  const batches = React.useMemo(() => {
    if (!product || !Array.isArray(product.batches) || product.batches.length === 0) {
      return [];
    }
    // ترتيب التشغيلات تصاعدياً بالأقرب انتهاءً أولاً (FEFO)
    return [...product.batches].sort((a, b) => {
      const dateA = new Date(a.expiryDate || '2099-12-31').getTime();
      const dateB = new Date(b.expiryDate || '2099-12-31').getTime();
      return dateA - dateB;
    });
  }, [product]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // إدارة اختصارات الكيبورد (1..9, Arrows, Enter, Esc)
  useEffect(() => {
    if (!isOpen || batches.length === 0) return;

    const handleKeyDown = (e) => {
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10) - 1;
        if (batches[num]) {
          e.preventDefault();
          onSelectBatch?.(batches[num]);
          return;
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % batches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + batches.length) % batches.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (batches[selectedIndex]) {
          onSelectBatch?.(batches[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, batches, selectedIndex, onSelectBatch, onClose]);

  if (!isOpen || !product || batches.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        direction: 'rtl',
        animation: 'posFadeIn 0.15s ease-out'
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '540px',
          maxWidth: '94vw',
          maxHeight: '85vh',
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1.5px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          borderRadius: '20px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* زر الإغلاق */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px'
          }}
        >
          <X size={18} />
        </button>

        {/* رأس المودال ومعلومات الصنف */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%)',
              border: '1.5px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
              اختيار تشغيلة وتاريخ الصلاحية (FEFO)
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
              الصنف: <strong style={{ color: '#0f766e' }}>{product.tradeNameAr}</strong> ({product.tradeNameEn})
            </div>
          </div>
        </div>

        {/* شريط الإرشاد السريع */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '8px 12px',
            fontSize: '11.5px',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 700
          }}
        >
          <span>💡 اضغط رقم التشغيلة [1..9] أو استخدم الأسهم ثم [Enter] للاختيار الفوري</span>
          <span style={{ color: '#059669', fontWeight: 900 }}>الأقرب انتهاءً موصى به أولاً</span>
        </div>

        {/* قائمة التشغيلات */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '340px',
            overflowY: 'auto',
            padding: '2px'
          }}
        >
          {batches.map((batch, idx) => {
            const isSelected = selectedIndex === idx;
            const isFirst = idx === 0;
            const expiryStatus = checkBatchExpiryStatus(batch.expiryDate);
            const batchNo = batch.batchNo || batch.batchNumber || `B-${idx + 1}`;
            const qty = batch.qtyBase !== undefined ? batch.qtyBase : (batch.quantity || 0);

            return (
              <div
                key={batch.id || `b_${idx}`}
                onClick={() => onSelectBatch?.(batch)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: isSelected
                    ? '2px solid #0d9488'
                    : isFirst
                    ? '1.5px solid #a7f3d0'
                    : '1px solid #e2e8f0',
                  background: isSelected
                    ? 'linear-gradient(90deg, #f0fdfa 0%, #ecfdf5 100%)'
                    : '#ffffff',
                  boxShadow: isSelected
                    ? '0 4px 12px rgba(13, 148, 136, 0.15)'
                    : '0 1px 3px rgba(0,0,0,0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* الجانب الأيمن: رقم الترتيب ورقم التشغيلة */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '8px',
                      background: isSelected ? '#0d9488' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#475569',
                      fontSize: '12px',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {idx + 1}
                  </span>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#0f172a' }}>
                        تشغيلة: {batchNo}
                      </span>
                      {isFirst && (
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '6px',
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: '10px',
                            fontWeight: 900
                          }}
                        >
                          ★ موصى به للبيع
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '11.5px', color: '#64748b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Calendar size={12} color="#0d9488" />
                        صلاحية: <strong style={{ color: expiryStatus.isNearExpiry ? '#d97706' : '#0f172a' }}>{batch.expiryDate || 'غير محدد'}</strong>
                      </span>
                      <span>•</span>
                      <span>الرصيد: <strong style={{ color: '#059669' }}>{qty}</strong> {product.baseUnit || 'علبة'}</span>
                    </div>
                  </div>
                </div>

                {/* الجانب الأيسر: حالة الصلاحية وزر الاختيار */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: expiryStatus.isExpired
                        ? '#fef2f2'
                        : expiryStatus.isNearExpiry
                        ? '#fffbeb'
                        : '#f0fdf4',
                      color: expiryStatus.isExpired
                        ? '#b91c1c'
                        : expiryStatus.isNearExpiry
                        ? '#b45309'
                        : '#15803d',
                      border: `1px solid ${
                        expiryStatus.isExpired
                          ? '#fecaca'
                          : expiryStatus.isNearExpiry
                          ? '#fde68a'
                          : '#bbf7d0'
                      }`
                    }}
                  >
                    {expiryStatus.label}
                  </span>

                  <button
                    type="button"
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: isSelected ? '#0d9488' : '#f1f5f9',
                      color: isSelected ? '#ffffff' : '#334155',
                      border: 'none',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    اختيار [{idx + 1}]
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ذيل المودال */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            إلغاء [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}

