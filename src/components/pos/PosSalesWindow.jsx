import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import {
  searchProducts,
  detectCartDrugInteractions,
  findSmartSubstitutes,
  checkBatchExpiryStatus
} from '../../utils/posEngine';
import {
  Search,
  Barcode,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  AlertOctagon,
  CreditCard,
  Banknote,
  Clock,
  User,
  Phone,
  Zap,
  Printer,
  XCircle,
  HelpCircle
} from 'lucide-react';

export default function PosSalesWindow({ windowId }) {
  const {
    productsCatalog,
    salesWindows,
    activeWindowId,
    addItemToActiveWindowCart,
    removeItemFromCart,
    updateCartItemQuantity,
    toggleCartItemUnit,
    clearCart,
    updateWindowCustomer,
    setIsPaymentModalOpen,
    setActivePaymentSale,
    setIsSubstitutesModalOpen,
    setActiveSubstituteTarget
  } = usePOS();

  const currentWindow = salesWindows.find((w) => w.id === windowId);
  const cart = currentWindow?.cart || [];
  const customer = currentWindow?.customer || { name: '', phone: '', isChronic: false };

  // حقل البحث والباركود
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const barcodeInputRef = useRef(null);

  // إبقاء مؤشر الكتابة داخل حقل الباركود دائماً
  useEffect(() => {
    if (activeWindowId === windowId && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [activeWindowId, windowId]);

  // البحث الفوري التلقائي عند كتابة نص
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedResultIndex(0);
      return;
    }
    const results = searchProducts(productsCatalog, searchQuery);
    setSearchResults(results.slice(0, 8)); // إظهار أفضل 8 نتائج
    setSelectedResultIndex(0);
  }, [searchQuery, productsCatalog]);

  // إضافة صنف للسلة
  const handleSelectProduct = (product, unitType = 'base') => {
    addItemToActiveWindowCart(product, unitType, 1);
    setSearchQuery('');
    setSearchResults([]);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  // معالجة مفاتيح الكيبورد داخل حقل البحث والباركود (Zero-Mouse Navigation)
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev + 1) % (searchResults.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => (prev - 1 + (searchResults.length || 1)) % (searchResults.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0 && searchResults[selectedResultIndex]) {
        handleSelectProduct(searchResults[selectedResultIndex], 'base');
      } else if (searchQuery.trim()) {
        // محاولة مسح الباركود المباشر الدقيق
        const exactMatch = productsCatalog.find(
          (p) => p.barcode === searchQuery.trim() || (p.barcodes && p.barcodes.includes(searchQuery.trim()))
        );
        if (exactMatch) {
          handleSelectProduct(exactMatch, 'base');
        }
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  // ── رادار التفاعلات الدوائية الخطيرة بالسلة ──
  const drugInteractions = useMemo(() => {
    return detectCartDrugInteractions(cart);
  }, [cart]);

  // إجماليات السلة
  const subtotal = cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  const totalCommissions = cart.reduce((sum, it) => sum + (it.instantCommission || 0), 0);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const netTotal = Math.max(0, subtotal - parseFloat(globalDiscount || 0));

  // فتح نافذة الدفع
  const handleOpenPayment = (method = 'cash') => {
    if (cart.length === 0) return;
    setActivePaymentSale({
      windowId,
      cart,
      subtotal,
      discountAmount: globalDiscount,
      totalAmount: netTotal,
      customer,
      paymentMethod: method
    });
    setIsPaymentModalOpen(true);
  };

  // فحص البدائل للصنف
  const handleInspectSubstitutes = (item) => {
    const prod = productsCatalog.find((p) => p.id === item.productId);
    if (prod) {
      setActiveSubstituteTarget({ product: prod, windowId });
      setIsSubstitutesModalOpen(true);
    }
  };

  return (
    <div className="pos-sales-layout">
      {/* ── الجانب الأيمن: حقل البحث وسلة الأصناف ── */}
      <div className="pos-cart-section">
        {/* شريط البحث والباركود */}
        <div className="pos-search-bar-wrap">
          <input
            ref={barcodeInputRef}
            type="text"
            className="pos-barcode-input"
            placeholder="🔍 امسح الباركود أو اكتب اسم الدواء / المادة الفعالة بالعربي أو الإنجليزي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />

          {/* قائمة نتائج البحث السريع المنسدلة */}
          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                left: 0,
                background: 'var(--surface, #ffffff)',
                border: '1.5px solid var(--primary, #0d9488)',
                borderRadius: '12px',
                boxShadow: '0 14px 40px rgba(0, 0, 0, 0.22)',
                zIndex: 100,
                maxHeight: '360px',
                overflowY: 'auto'
              }}
            >
              {searchResults.map((prod, idx) => {
                const isSelected = idx === selectedResultIndex;
                const isNearExp = prod.batches?.some((b) => checkBatchExpiryStatus(b.expiryDate).isNearExpiry);

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleSelectProduct(prod, 'base')}
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--primary-light, #f0fdfa)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text, #0b132b)' }}>
                        {prod.tradeNameAr} <span style={{ color: 'var(--muted, #475569)', fontSize: '12px' }}>({prod.tradeNameEn})</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #475569)', marginTop: '2px' }}>
                        🧪 المادة الفعالة: <strong>{prod.genericName}</strong> • {prod.dosageForm} ({prod.strength})
                      </div>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--primary, #0d9488)' }}>
                        {prod.publicPrice.toFixed(2)} ج
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--accent, #d97706)', fontWeight: 700 }}>
                        شريط: {prod.subUnitPrice?.toFixed(2) || (prod.publicPrice / prod.packSize).toFixed(2)} ج
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* تنبيه رادار التفاعلات الدوائية الخطيرة بالسلة */}
        {drugInteractions.length > 0 && (
          <div className="pos-interaction-alert-banner">
            <AlertOctagon size={24} color="#dc2626" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: '13px' }}>
                تحذير سريري حرج: تعارض وتفاعل دوائي خطير بالسلة!
              </div>
              {drugInteractions.map((inter, i) => (
                <div key={i} style={{ fontSize: '11.5px', marginTop: '2px' }}>
                  • تعارض بين <strong>[{inter.item1}]</strong> و <strong>[{inter.item2}]</strong>: {inter.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* جدول سلة الفاتورة */}
        <div className="pos-cart-table-wrap">
          <table className="pos-cart-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>#</th>
                <th style={{ width: '36%' }}>الصنف الدوائي والمادة الفعالة</th>
                <th style={{ width: '14%', textAlign: 'center' }}>الوحدة المباعة</th>
                <th style={{ width: '14%', textAlign: 'center' }}>الكمية</th>
                <th style={{ width: '12%', textAlign: 'left' }}>سعر الوحدة</th>
                <th style={{ width: '14%', textAlign: 'left' }}>الإجمالي</th>
                <th style={{ width: '6%', textAlign: 'center' }}>حذف</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted, #475569)' }}>
                    <Barcode size={48} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <div style={{ fontWeight: 800, fontSize: '15px' }}>السلة فارغة حالياً</div>
                    <div style={{ fontSize: '12px' }}>امسح باركود الدواء أو ابحث بالاسم لإضافة أول صنف للفاتورة</div>
                  </td>
                </tr>
              ) : (
                cart.map((item, idx) => (
                  <tr key={`${item.productId}-${item.unitType}-${idx}`}>
                    <td style={{ fontWeight: 700, color: 'var(--muted, #475569)' }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text, #0b132b)' }}>
                        {item.tradeNameAr}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #475569)' }}>
                        {item.genericName}
                      </div>

                      {/* شارة فحص البدائل الذكية */}
                      <button
                        type="button"
                        onClick={() => handleInspectSubstitutes(item)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent, #d97706)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          marginTop: '3px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Sparkles size={12} />
                        فحص البدائل والربحية [F2]
                      </button>
                    </td>

                    {/* محدد الوحدة (علبة / شريط / قرص) */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="pos-unit-toggle-btn"
                        onClick={() => toggleCartItemUnit(windowId, idx)}
                        title="انقر للتبديل بين علبة أو شريط أو قرص"
                      >
                        {item.unitLabel} 🔄
                      </button>
                    </td>

                    {/* كمية الصنف */}
                    <td style={{ textAlign: 'center' }}>
                      <div className="pos-qty-control">
                        <button
                          type="button"
                          className="pos-qty-btn"
                          onClick={() => updateCartItemQuantity(windowId, idx, item.quantity + 1)}
                        >
                          +
                        </button>
                        <span className="pos-qty-val">{item.quantity}</span>
                        <button
                          type="button"
                          className="pos-qty-btn"
                          onClick={() => {
                            if (item.quantity > 1) {
                              updateCartItemQuantity(windowId, idx, item.quantity - 1);
                            } else {
                              removeItemFromCart(windowId, idx);
                            }
                          }}
                        >
                          -
                        </button>
                      </div>
                    </td>

                    {/* سعر الوحدة */}
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>
                      {item.unitPrice.toFixed(2)} ج
                    </td>

                    {/* الإجمالي */}
                    <td style={{ textAlign: 'left', fontWeight: 900, color: 'var(--primary, #0d9488)', fontSize: '14px' }}>
                      {item.lineTotal.toFixed(2)} ج
                    </td>

                    {/* حذف السطر */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeItemFromCart(windowId, idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── الجانب الأيسر: بيانات العميل والإجماليات والدفع ── */}
      <div className="pos-checkout-sidebar">
        {/* بيانات العميل */}
        <div style={{ background: 'var(--surface, #ffffff)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border, #cbd5e1)' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: 'var(--muted, #475569)' }}>
            👤 بيانات العميل والوصفة
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="اسم العميل (اختياري)..."
              value={customer.name}
              onChange={(e) => updateWindowCustomer(windowId, { name: e.target.value })}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                fontSize: '12px'
              }}
            />
            <input
              type="text"
              placeholder="رقم هاتف العميل (للتوصيل/واتساب)..."
              value={customer.phone}
              onChange={(e) => updateWindowCustomer(windowId, { phone: e.target.value })}
              style={{
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                fontSize: '12px'
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={customer.isChronic}
                onChange={(e) => updateWindowCustomer(windowId, { isChronic: e.target.checked })}
              />
              <span>تفعيل متابعة العلاج المزمن وتذكير الواتساب</span>
            </label>
          </div>
        </div>

        {/* صندوق الإجماليات */}
        <div className="pos-totals-box">
          <div className="pos-total-row">
            <span>المجموع الفرعي:</span>
            <span>{subtotal.toFixed(2)} ج</span>
          </div>

          <div className="pos-total-row">
            <span>الخصم المباشر:</span>
            <input
              type="number"
              min="0"
              value={globalDiscount}
              onChange={(e) => setGlobalDiscount(e.target.value)}
              style={{
                width: '75px',
                textAlign: 'left',
                padding: '2px 6px',
                border: '1px solid var(--border, #cbd5e1)',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
          </div>

          {totalCommissions > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="pos-spiff-badge">
                <Zap size={12} />
                عمولة الكاشير اللحظية
              </span>
              <span style={{ fontWeight: 800, color: '#059669', fontSize: '13px' }}>
                +{totalCommissions.toFixed(2)} ج
              </span>
            </div>
          )}

          <div className="pos-grand-total-row">
            <span>الصافي المطلوب:</span>
            <span>{netTotal.toFixed(2)} ج</span>
          </div>
        </div>

        {/* أزرار السداد السريع */}
        <button
          type="button"
          className="pos-pay-fast-btn"
          disabled={cart.length === 0}
          onClick={() => handleOpenPayment('cash')}
        >
          <Banknote size={22} />
          <span>دفع نقدي سريع [F5]</span>
        </button>

        <div className="pos-secondary-actions-grid">
          <button
            type="button"
            className="pos-secondary-btn"
            disabled={cart.length === 0}
            onClick={() => handleOpenPayment('card')}
          >
            <CreditCard size={15} />
            <span>دفع متعدد [F6]</span>
          </button>

          <button
            type="button"
            className="pos-secondary-btn"
            disabled={cart.length === 0}
            onClick={() => clearCart(windowId)}
            style={{ color: '#dc2626' }}
          >
            <XCircle size={15} />
            <span>إلغاء الفاتورة [Esc]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
