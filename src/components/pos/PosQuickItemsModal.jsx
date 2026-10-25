import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  PHARMA_FAST_OTC_ITEMS,
  FAST_OTC_CATEGORIES
} from '../../utils/posEngine';
import {
  Zap,
  X,
  Search,
  Plus,
  CheckCircle2,
  Package,
  Layers,
  Sparkles
} from 'lucide-react';

/**
 * PosQuickItemsModal
 * نافذة منبثقة عائمة للأصناف السريعة الأكثر مبيعاً (OTC Fast Picks)
 * تظهر فوق نافذة البيع مع خلفية زجاجية شفافة طبيعية تتيح رؤية سلة الفاتورة وشاشة البيع بالكامل
 */
export default function PosQuickItemsModal({ isOpen, onClose, onSelectItem }) {
  const [activeGroup, setActiveGroup] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastAddedId, setLastAddedId] = useState(null);
  const searchInputRef = useRef(null);

  // إغلاق المودال بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // التركيز في حقل البحث الداخلي فور الفتح
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
    } else {
      setSearchQuery('');
      setActiveGroup('all');
      setLastAddedId(null);
    }
  }, [isOpen]);

  // تصفية الأصناف حسب المجموعة ونص البحث
  const filteredItems = useMemo(() => {
    let items = PHARMA_FAST_OTC_ITEMS;
    if (activeGroup !== 'all') {
      items = items.filter((item) => item.group === activeGroup);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter((item) =>
        item.tradeName.toLowerCase().includes(q) ||
        (item.tradeNameEn && item.tradeNameEn.toLowerCase().includes(q)) ||
        (item.activeIngredient && item.activeIngredient.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.includes(q))
      );
    }
    return items;
  }, [activeGroup, searchQuery]);

  if (!isOpen) return null;

  const handleCardClick = (item) => {
    onSelectItem?.(item);
    setLastAddedId(item.id);
    setTimeout(() => {
      setLastAddedId(null);
    }, 600);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99995,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        animation: 'posFadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: '20px',
          width: '95%',
          maxWidth: '880px',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          overflow: 'hidden',
          animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس النافذة المنبثقة */}
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
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                  الأصناف السريعة والأكثر مبيعاً (OTC Fast Picks)
                </h3>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    color: '#0d9488',
                    fontSize: '11px',
                    fontWeight: 800
                  }}
                >
                  اختصار [F8]
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                انقر نقرة واحدة على أي صنف لإضافته فوراً لسلة الفاتورة الحالية دون إغلاق النافذة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="إغلاق النافذة (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* شريط البحث وتصنيفات الأقسام السريعة */}
        <div
          style={{
            padding: '14px 22px',
            background: '#fafafa',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {/* حقل البحث السريع */}
          <div style={{ position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8'
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="ابحث السريع بالاسم أو المادة الفعالة أو الباركود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 42px 0 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '13.5px',
                fontWeight: 600,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0d9488';
                e.target.style.boxShadow = '0 0 0 3px rgba(13, 148, 136, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#cbd5e1';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* أزرار التبويب / التصنيفات */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px'
            }}
          >
            {FAST_OTC_CATEGORIES.map((cat) => {
              const isActive = activeGroup === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveGroup(cat.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '99px',
                    border: isActive ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                    background: isActive ? '#0d9488' : '#ffffff',
                    color: isActive ? '#ffffff' : '#475569',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 3px 10px rgba(13, 148, 136, 0.25)' : 'none'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* شبكة بطاقات الأصناف السريعة */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 22px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px',
            alignContent: 'start',
            background: '#ffffff'
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 20px',
                textAlign: 'center',
                color: '#64748b'
              }}
            >
              <Package size={42} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <div style={{ fontSize: '15px', fontWeight: 800 }}>لا توجد أصناف سريعة مطابقة</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                جرب تغيير التصنيف أو البحث بكلمات أخرى
              </div>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isJustAdded = lastAddedId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  style={{
                    background: isJustAdded ? '#f0fdfa' : '#ffffff',
                    border: isJustAdded ? '2px solid #0d9488' : '1.5px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isJustAdded
                      ? '0 6px 20px rgba(13, 148, 136, 0.25)'
                      : '0 2px 6px rgba(15, 23, 42, 0.03)',
                    transform: isJustAdded ? 'scale(1.02)' : 'none',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isJustAdded) {
                      e.currentTarget.style.borderColor = '#0d9488';
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(13, 148, 136, 0.12)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isJustAdded) {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.03)';
                      e.currentTarget.style.transform = 'none';
                    }
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '6px'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '6px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#64748b'
                        }}
                      >
                        {item.dosageForm || 'علبة'}
                      </span>
                      {isJustAdded && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 900,
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <CheckCircle2 size={13} />
                          تمت الإضافة!
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 900,
                        color: '#0f172a',
                        lineHeight: 1.3,
                        marginBottom: '4px'
                      }}
                    >
                      {item.tradeName}
                    </div>

                    {item.tradeNameEn && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          fontFamily: 'system-ui, sans-serif',
                          marginBottom: '6px'
                        }}
                      >
                        {item.tradeNameEn}
                      </div>
                    )}

                    {item.activeIngredient && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: '#475569',
                          background: '#f8fafc',
                          padding: '3px 6px',
                          borderRadius: '6px',
                          marginBottom: '8px'
                        }}
                      >
                        🧪 {item.activeIngredient}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '8px',
                      marginTop: '4px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#059669' }}>
                        {parseFloat(item.publicPrice || 0).toFixed(2)} ج
                      </div>
                      {item.packSize > 1 && (
                        <div style={{ fontSize: '10.5px', color: '#d97706', fontWeight: 700 }}>
                          شريط: {parseFloat(item.subUnitPrice || (item.publicPrice / item.packSize)).toFixed(2)} ج
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        color: '#0d9488',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="إضافة للسلة"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* شريط التذييل للمودال */}
        <div
          style={{
            padding: '12px 22px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚡ انقر على أي صنف لإضافته فورياً</span>
            <span>•</span>
            <span>النافذة لا تغلق لتتيح لك إضافة أصناف متعددة متتالية</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 18px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            إغلاق (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
