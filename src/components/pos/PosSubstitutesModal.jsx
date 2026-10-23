import React, { useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { findSmartSubstitutes, checkBatchExpiryStatus } from '../../utils/posEngine';
import { Sparkles, X, Check, TrendingUp, AlertTriangle, Package } from 'lucide-react';

export default function PosSubstitutesModal() {
  const {
    isSubstitutesModalOpen,
    setIsSubstitutesModalOpen,
    activeSubstituteTarget,
    productsCatalog,
    addItemToActiveWindowCart,
    activeWindowId
  } = usePOS();

  const targetProduct = activeSubstituteTarget?.product || productsCatalog[0];

  const substitutes = useMemo(() => {
    if (!targetProduct) return [];
    return findSmartSubstitutes(targetProduct, productsCatalog);
  }, [targetProduct, productsCatalog]);

  if (!isSubstitutesModalOpen || !targetProduct) return null;

  const handleApplySubstitute = (sub) => {
    addItemToActiveWindowCart(sub, 'base', 1);
    setIsSubstitutesModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 2100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '92%',
          maxWidth: '820px',
          maxHeight: '85vh',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={22} color="var(--accent, #d97706)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                رادار البدائل والمثائل الذكية (Smart Profit & Clinical AI)
              </h3>
              <div style={{ fontSize: '11.5px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                مرتبة آلياً حسب: (الأعلى هامش ربح للصيدلية + الأقرب لانتهاء الصلاحية بالمخزن FEFO)
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSubstitutesModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* معلومات الصنف المطلوب الأصلي */}
        <div style={{ padding: '14px 20px', background: 'rgba(217, 119, 6, 0.08)', borderBottom: '1px solid rgba(217, 119, 6, 0.2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>الصنف الأصلي المطلوب:</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            <div style={{ fontWeight: 900, fontSize: '15px' }}>
              {targetProduct.tradeNameAr} <span style={{ fontSize: '13px', color: '#666' }}>({targetProduct.tradeNameEn})</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--primary, #0d9488)' }}>
              {targetProduct.publicPrice.toFixed(2)} جنيه
            </div>
          </div>
          <div style={{ fontSize: '11.5px', color: '#555', marginTop: '2px' }}>
            🧪 المادة الفعالة: <strong>{targetProduct.genericName}</strong> • {targetProduct.dosageForm} ({targetProduct.strength})
          </div>
        </div>

        {/* قائمة البدائل المرتبة */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {substitutes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--muted, #475569)' }}>
              <Package size={40} style={{ opacity: 0.4, marginBottom: '8px' }} />
              <div style={{ fontWeight: 800, fontSize: '14px' }}>لا توجد مثائل مطابقة مسجلة بالمخزن حالياً</div>
              <div style={{ fontSize: '12px' }}>لا توجد أدوية أخرى تشترك في نفس المادة الفعالة ({targetProduct.genericName})</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {substitutes.map((sub, index) => {
                const profitDiff = sub.profitMargin - (targetProduct.publicPrice - targetProduct.costPrice);

                return (
                  <div
                    key={sub.id}
                    style={{
                      border: '1.5px solid var(--border, #cbd5e1)',
                      borderRadius: '14px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: index === 0 ? 'rgba(13, 148, 136, 0.04)' : 'var(--surface, #ffffff)',
                      borderColor: index === 0 ? 'var(--primary, #0d9488)' : 'var(--border, #cbd5e1)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {index === 0 && (
                          <span style={{ padding: '2px 8px', background: 'var(--primary, #0d9488)', color: '#fff', borderRadius: '6px', fontSize: '10px', fontWeight: 900 }}>
                            ⭐ البديل الذهبي الموصى به
                          </span>
                        )}
                        <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--text, #0b132b)' }}>
                          {sub.tradeNameAr}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--muted, #475569)' }}>
                          ({sub.tradeNameEn})
                        </span>
                      </div>

                      <div style={{ fontSize: '11.5px', color: 'var(--muted, #475569)', marginTop: '4px' }}>
                        الشركة: <strong>{sub.manufacturer || 'محلية'}</strong> • الرصيد بالمخزن: <strong style={{ color: sub.totalStock > 0 ? '#059669' : '#dc2626' }}>{sub.totalStock} علبة</strong>
                      </div>

                      {/* شارات الربحية والصلاحية */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#ecfdf5', color: '#047857', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                          <TrendingUp size={12} />
                          ربح الصيدلية: {sub.profitMargin.toFixed(2)} ج ({sub.profitPct}%)
                          {profitDiff > 0 && <span style={{ color: '#059669' }}> (+{profitDiff.toFixed(2)} ج زيادة)</span>}
                        </span>

                        {sub.nearestExpiryDays < 180 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#fef3c7', color: '#b45309', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                            <AlertTriangle size={12} />
                            أقرب صلاحية: {sub.nearestExpiryDays} يوم (أولوية تصريف)
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--primary, #0d9488)' }}>
                          {sub.publicPrice.toFixed(2)} ج
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent, #d97706)', fontWeight: 700 }}>
                          شريط: {sub.subUnitPrice.toFixed(2)} ج
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleApplySubstitute(sub)}
                        style={{
                          padding: '10px 18px',
                          background: index === 0 ? 'var(--primary, #0d9488)' : 'var(--surface-hover, #f8fafc)',
                          color: index === 0 ? '#ffffff' : 'var(--text, #0b132b)',
                          border: '1px solid var(--border, #cbd5e1)',
                          borderRadius: '10px',
                          fontWeight: 800,
                          fontSize: '12.5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Check size={15} />
                        <span>استبدال في السلة</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
