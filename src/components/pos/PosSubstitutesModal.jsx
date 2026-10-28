import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { findSmartSubstitutes } from '../../utils/posEngine';
import {
  Sparkles,
  X,
  Check,
  TrendingUp,
  AlertTriangle,
  Package,
  Search,
  Building2,
  Phone,
  MessageCircle,
  ArrowRightLeft,
  Share2,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  Clock,
  Layers,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export default function PosSubstitutesModal() {
  const {
    isSubstitutesModalOpen,
    setIsSubstitutesModalOpen,
    activeSubstituteTarget,
    productsCatalog,
    addItemToActiveWindowCart,
    replaceCartItemWithProduct,
    activeWindowId,
    salesWindows
  } = usePOS();

  const { currentBranch } = useAuth?.() || {};
  const { showToast } = useUI?.() || {};

  // الصنف المستهدف الأصلي المفحوص
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // حالة جلب البدائل اللحظية من الخادم
  const [loadingSubstitutes, setLoadingSubstitutes] = useState(false);
  const [onlineSubstitutes, setOnlineSubstitutes] = useState([]);
  const [substitutesBranchStock, setSubstitutesBranchStock] = useState({}); // { [medName]: [branches...] }
  const [loadingStocks, setLoadingStocks] = useState({});

  const searchInputRef = useRef(null);

  // تعيين الصنف المختار عند فتح النافذة
  useEffect(() => {
    if (isSubstitutesModalOpen) {
      if (activeSubstituteTarget?.product) {
        setSelectedProduct(activeSubstituteTarget.product);
        setSearchQuery(activeSubstituteTarget.product.tradeNameAr || activeSubstituteTarget.product.tradeNameEn || '');
      } else {
        // إذا فُتحت النافذة بدون تحديد صنف (F2):
        const activeWin = salesWindows?.find(w => w.id === activeWindowId);
        if (activeWin && activeWin.cart.length > 0) {
          const lastItem = activeWin.cart[activeWin.cart.length - 1];
          setSelectedProduct(lastItem);
          setSearchQuery(lastItem.tradeNameAr || lastItem.tradeNameEn || '');
        } else if (productsCatalog && productsCatalog.length > 0) {
          setSelectedProduct(productsCatalog[0]);
          setSearchQuery(productsCatalog[0].tradeNameAr || productsCatalog[0].tradeNameEn || '');
        } else {
          setSelectedProduct(null);
          setSearchQuery('');
        }
      }
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }, 80);
    } else {
      setOnlineSubstitutes([]);
      setSubstitutesBranchStock({});
    }
  }, [isSubstitutesModalOpen, activeSubstituteTarget]);

  // إغلاق النافذة بزر Esc واختصارات الأرقام (1..9)
  useEffect(() => {
    if (!isSubstitutesModalOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsSubstitutesModalOpen(false);
        return;
      }

      // اختيار البديل السريع بالأرقام 1..9 إذا لم يكن مؤشر الكتابة داخل حقل البحث
      if (
        document.activeElement !== searchInputRef.current &&
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)
      ) {
        const idx = parseInt(e.key, 10) - 1;
        if (rankedSubstitutes[idx]) {
          e.preventDefault();
          e.stopPropagation();
          handleApplySubstitute(rankedSubstitutes[idx]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isSubstitutesModalOpen, setIsSubstitutesModalOpen]);

  // البحث المباشر في قاعدة البيانات عند كتابة اسم صنف جديد
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingOnline(true);
        const res = await fetch(`/api/stock/medications/search?q=${encodeURIComponent(searchQuery.trim())}&locationId=${encodeURIComponent(currentBranch?.id || '')}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.medications)) {
            setSearchResults(data.medications.slice(0, 8));
          }
        }
      } catch (err) {
        console.warn('Search substitutes target err:', err);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, currentBranch]);

  // جلب البدائل الرسمية المعتمدة من الخادم و DrugEye
  useEffect(() => {
    if (!isSubstitutesModalOpen || !selectedProduct) return;

    let isMounted = true;
    setLoadingSubstitutes(true);

    const fetchSubs = async () => {
      try {
        const prodName = selectedProduct.tradeNameAr || selectedProduct.tradeNameEn || selectedProduct.name || '';
        const prodId = selectedProduct.id || selectedProduct.productId || '';
        const token = localStorage.getItem('token') || localStorage.getItem('pos_token') || localStorage.getItem('outstock_token');

        const params = new URLSearchParams();
        if (prodId) params.append('medId', prodId);
        if (prodName) params.append('name', prodName);

        const res = await fetch(`/api/outstock/medications/substitutes?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (res.ok) {
          const result = await res.json();
          if (isMounted && result.success && Array.isArray(result.substitutes)) {
            setOnlineSubstitutes(result.substitutes);
            // فحص رصيد الفروع لكل بديل مسترجع
            fetchStockForSubstitutes(result.substitutes);
          }
        }
      } catch (err) {
        console.warn('Live substitutes fetch error:', err);
      } finally {
        if (isMounted) setLoadingSubstitutes(false);
      }
    };

    fetchSubs();

    return () => {
      isMounted = false;
    };
  }, [isSubstitutesModalOpen, selectedProduct]);

  // فحص رصيد الفروع اللحظي للبدائل
  const fetchStockForSubstitutes = async (subsList) => {
    const branchId = currentBranch?.id || 'branch-1';
    for (const sub of subsList.slice(0, 10)) {
      const subName = sub.trade_name_ar || sub.trade_name_en || sub.tradeNameAr || '';
      if (!subName) continue;

      setLoadingStocks(prev => ({ ...prev, [subName]: true }));
      try {
        const queryParams = new URLSearchParams({
          name: subName,
          barcode: sub.barcode || sub.gtin_barcode || '',
          currentBranchId: branchId
        });
        const res = await fetch(`/api/pos/inter-branch-stock?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.branches)) {
            setSubstitutesBranchStock(prev => ({
              ...prev,
              [subName]: data.branches
            }));
          }
        }
      } catch (err) {
        console.warn('Error fetching branch stock for substitute:', subName, err);
      } finally {
        setLoadingStocks(prev => ({ ...prev, [subName]: false }));
      }
    }
  };

  // دمج وترتيب البدائل الذكية: (الأعلى هامش ربح + المتوفر بالفرع + الأقرب للصلاحية)
  const rankedSubstitutes = useMemo(() => {
    if (!selectedProduct) return [];

    // 1. البدائل المسترجعة من الكتالوج المحلي
    const localMatches = findSmartSubstitutes(selectedProduct, productsCatalog);

    // 2. دمج بدائل السيرفر مع بدائل الكتالوج المحلي ومنع التكرار
    const combined = [...localMatches];

    onlineSubstitutes.forEach((onlineSub) => {
      const onlineName = (onlineSub.trade_name_ar || onlineSub.trade_name_en || '').toLowerCase();
      const alreadyExists = combined.some(
        (c) =>
          (c.tradeNameAr && c.tradeNameAr.toLowerCase() === onlineName) ||
          (c.tradeNameEn && c.tradeNameEn.toLowerCase() === onlineName)
      );

      if (!alreadyExists) {
        const pubPrice = parseFloat(onlineSub.public_price || 0);
        const packSize = Math.max(1, parseInt(onlineSub.pack_size || 1, 10));
        const unitPrice = parseFloat(onlineSub.unit_price || (pubPrice / packSize).toFixed(2));
        const estimatedCost = pubPrice * 0.75;
        const profitMargin = Math.max(0, pubPrice - estimatedCost);
        const profitPct = pubPrice > 0 ? (profitMargin / pubPrice) * 100 : 25;

        combined.push({
          id: onlineSub.id,
          tradeNameAr: onlineSub.trade_name_ar || onlineSub.trade_name_en,
          tradeNameEn: onlineSub.trade_name_en || onlineSub.trade_name_ar,
          genericName: onlineSub.generic_name || selectedProduct.genericName || 'نفس المادة الفعالة',
          dosageForm: onlineSub.dosage_form || selectedProduct.dosageForm || 'أقراص',
          strength: onlineSub.strength || selectedProduct.strength || '',
          packSize: packSize,
          publicPrice: pubPrice,
          costPrice: estimatedCost,
          subUnitPrice: unitPrice,
          manufacturer: onlineSub.manufacturer || 'محلية',
          profitMargin,
          profitPct: Math.round(profitPct),
          nearestExpiryDays: 360,
          totalStock: 0,
          batches: [{ id: `b_${onlineSub.id}`, expiryDate: '2028-12-31', qtyBase: 10 }]
        });
      }
    });

    // 3. ترتيب ذكي فائق:
    // أولوية أولى: الصنف المتوفر في الفرع الحالي!
    // أولوية ثانية: الأعلى هامش ربح للصيدلية
    // أولوية ثالثة: الأقرب للصلاحية (FEFO)
    return combined.sort((a, b) => {
      const aBranches = substitutesBranchStock[a.tradeNameAr] || substitutesBranchStock[a.tradeNameEn] || [];
      const bBranches = substitutesBranchStock[b.tradeNameAr] || substitutesBranchStock[b.tradeNameEn] || [];

      const aCurrentStock = aBranches.find(br => br.isCurrent)?.boxes || a.totalStock || 0;
      const bCurrentStock = bBranches.find(br => br.isCurrent)?.boxes || b.totalStock || 0;

      // أولاً: المتوفر بالفرع
      if (aCurrentStock > 0 && bCurrentStock === 0) return -1;
      if (bCurrentStock > 0 && aCurrentStock === 0) return 1;

      // ثانياً: الأعلى هامش ربح
      const profitDiff = (b.profitMargin || 0) - (a.profitMargin || 0);
      if (Math.abs(profitDiff) > 1) return profitDiff;

      // ثالثاً: الأقرب للصلاحية
      return (a.nearestExpiryDays || 999) - (b.nearestExpiryDays || 999);
    });
  }, [selectedProduct, productsCatalog, onlineSubstitutes, substitutesBranchStock]);

  if (!isSubstitutesModalOpen) return null;

  // استبدال الصنف في السلة النشطة مباشرة
  const handleApplySubstitute = (sub) => {
    const targetWinId = activeSubstituteTarget?.windowId || activeWindowId;
    const cartIndex = activeSubstituteTarget?.cartIndex ?? -1;

    const fullProdToInsert = {
      ...sub,
      id: sub.id || `sub_${Date.now()}`,
      barcode: sub.barcode || `SUB-${sub.id}`,
      baseUnit: 'علبة',
      subUnit: 'شريط',
      packSize: sub.packSize || 1,
      batches: sub.batches && sub.batches.length > 0 ? sub.batches : [
        { id: `b_${sub.id}`, batchNo: 'BATCH-SUB', expiryDate: '2028-12-31', qtyBase: 10 }
      ]
    };

    if (cartIndex >= 0 && targetWinId && replaceCartItemWithProduct) {
      // استبدال دقيق للسطر الأصلي بالسلة
      replaceCartItemWithProduct(targetWinId, cartIndex, fullProdToInsert, 'base', 1);
      showToast?.(`✅ تم استبدال الصنف في الفاتورة بنجاح: ${sub.tradeNameAr}`);
    } else {
      // إضافة عادية للسلة النشطة
      addItemToActiveWindowCart(fullProdToInsert, 'base', 1);
      showToast?.(`✅ تم إضافة البديل إلى الفاتورة: ${sub.tradeNameAr}`);
    }

    setIsSubstitutesModalOpen(false);
  };

  // مشاركة تفاصيل البديل للعميل عبر الواتساب
  const handleShareWhatsApp = (sub) => {
    const phone = activeSubstituteTarget?.customerPhone || '';
    const cleanPhone = phone.replace(/\D/g, '');
    const origName = selectedProduct?.tradeNameAr || selectedProduct?.name || 'الدواء المطلوب';
    const subName = sub.tradeNameAr || sub.tradeNameEn;

    const msg =
      `*💊 صيدليات المروة - بدائل الأدوية المعتمدة*\n\n` +
      `تحية طيبة،\nبخصوص استفساركم عن دواء: *${origName}*\n` +
      `نفيدكم بتوفر البديل المعتمد والمطابق طبياً بنفس المادة الفعالة والتركيز:\n\n` +
      `⭐ *الاسم التجاري:* ${subName} (${sub.dosageForm || 'أقراص'})\n` +
      `🧪 *المادة الفعالة:* ${sub.genericName}\n` +
      `💵 *السعر الرسمي:* ${sub.publicPrice.toFixed(2)} ج.م (سعر الشريط: ${sub.subUnitPrice ? sub.subUnitPrice.toFixed(2) : (sub.publicPrice / (sub.packSize || 1)).toFixed(2)} ج)\n` +
      `🏢 *الشركة المصنعة:* ${sub.manufacturer || 'مصرية'}\n\n` +
      `نحن في خدمتكم دائماً بصيدليات المروة. 🌿`;

    if (cleanPhone.length >= 10) {
      const targetPhone = cleanPhone.startsWith('2') ? cleanPhone : `2${cleanPhone}`;
      window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard.writeText(msg);
      showToast?.('📋 تم نسخ تفاصيل البديل للحافظة بنجاح (يمكنك لصقها في واتساب العميل)');
    }
  };

  const origPrice = parseFloat(selectedProduct?.publicPrice || selectedProduct?.unitPrice || 0);
  const origCost = parseFloat(selectedProduct?.costPrice || origPrice * 0.75);
  const origMargin = Math.max(0, origPrice - origCost);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', system-ui, sans-serif"
      }}
    >
      <div
        style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '24px',
          width: '94%',
          maxWidth: '920px',
          maxHeight: '88vh',
          boxShadow: '0 30px 80px -10px rgba(15, 23, 42, 0.4), 0 10px 25px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'posFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* ── 1. رأس النافذة الأكريليكي الفاخر ── */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            borderBottom: '1.5px solid #e2e8f0',
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
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                  رادار البدائل والمثائل الذكية المتصل بالفروع
                </h3>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '99px',
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    fontSize: '11px',
                    fontWeight: 800
                  }}
                >
                  ⚡ فحص لحظي للأرصدة
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontWeight: 600 }}>
                مرتبة آلياً: (المتوفر بالفرع أولاً + الأعلى ربحاً للصيدلية + الأقرب للصلاحية FEFO)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>[Esc للإغلاق]</div>
            <button
              type="button"
              onClick={() => setIsSubstitutesModalOpen(false)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fee2e2';
                e.currentTarget.style.color = '#dc2626';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#475569';
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── 2. حقل البحث السريع عن أي صنف لاستعراض بدائله ── */}
        <div style={{ padding: '12px 24px', background: '#ffffff', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} color="#0d9488" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="🔍 ابحث عن أي دواء أو مادة فعالة لاستعراض البدائل وأرصدة الفروع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '0 44px 0 16px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13.5px',
                fontWeight: 700,
                color: '#0f172a',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => (e.target.style.borderColor = '#0d9488')}
              onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
            />
            {isSearchingOnline && (
              <RefreshCw size={16} color="#0d9488" style={{ position: 'left', left: '14px', top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite' }} />
            )}
          </div>

          {/* قائمة نتائج البحث السريع */}
          {searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: '24px',
                left: '24px',
                background: '#ffffff',
                border: '1.5px solid #0d9488',
                borderRadius: '12px',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
                zIndex: 50,
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '4px'
              }}
            >
              {searchResults.map((sr) => (
                <div
                  key={sr.id}
                  onClick={() => {
                    setSelectedProduct({
                      id: sr.id,
                      tradeNameAr: sr.trade_name_ar || sr.trade_name_en,
                      tradeNameEn: sr.trade_name_en || sr.trade_name_ar,
                      genericName: sr.generic_name,
                      publicPrice: parseFloat(sr.public_price || 0),
                      costPrice: parseFloat(sr.cost_price || sr.public_price * 0.75),
                      dosageForm: sr.dosage_form || 'عبوة',
                      packSize: sr.pack_size || 1
                    });
                    setSearchQuery(sr.trade_name_ar || sr.trade_name_en);
                    setSearchResults([]);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    transition: 'background 0.12s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdfa')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <span style={{ color: '#0f172a' }}>{sr.trade_name_ar}</span>{' '}
                    <span style={{ color: '#64748b', fontSize: '11.5px' }}>({sr.trade_name_en})</span>
                    <div style={{ fontSize: '11px', color: '#0d9488', fontWeight: 600 }}>🧪 {sr.generic_name}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                    {parseFloat(sr.public_price || 0).toFixed(2)} ج
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 3. كارت معلومات الصنف الأصلي المطلوب ── */}
        {selectedProduct && (
          <div
            style={{
              padding: '12px 24px',
              background: '#fffbeb',
              borderBottom: '1.5px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309' }}>
                الصنف الأصلي المطلوب بالروشتة أو الفاتورة:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span style={{ fontWeight: 900, fontSize: '15px', color: '#78350f' }}>
                  {selectedProduct.tradeNameAr || selectedProduct.name}
                </span>
                <span style={{ fontSize: '12.5px', color: '#92400e', fontWeight: 600 }}>
                  ({selectedProduct.tradeNameEn || ''})
                </span>
                <span
                  style={{
                    padding: '1px 8px',
                    borderRadius: '6px',
                    background: '#fef3c7',
                    border: '1px solid #fcd34d',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#92400e'
                  }}
                >
                  🧪 {selectedProduct.genericName || 'مادة فعالة مطابقة'}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>
                {origPrice.toFixed(2)} ج.م
              </div>
              <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 700 }}>
                ربح الصيدلية الأصلي: {origMargin.toFixed(2)} ج
              </div>
            </div>
          </div>
        )}

        {/* ── 4. قائمة البدائل المرتبة مع توفر الأرصدة بالفروع ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#f8fafc' }}>
          {loadingSubstitutes ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
              <RefreshCw size={36} color="#0d9488" style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                جاري استدعاء البدائل المعتمدة وفحص أرصدة الفروع...
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>يتم الفحص المباشر عبر قاعدة بيانات هيئة الدواء وفروع الصيدلية</div>
            </div>
          ) : rankedSubstitutes.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: '#ffffff',
                borderRadius: '16px',
                border: '1.5px dashed #cbd5e1'
              }}
            >
              <Package size={48} color="#94a3b8" style={{ marginBottom: '12px', opacity: 0.6 }} />
              <div style={{ fontWeight: 900, fontSize: '16px', color: '#0f172a' }}>
                لم يتم العثور على مثائل متطابقة مسجلة حالياً
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px', maxWidth: '420px', margin: '4px auto 0 auto' }}>
                لا توجد أدوية أخرى مسجلة تشترك في نفس المادة الفعالة ({selectedProduct?.genericName || 'المحددة'}). يمكنك كتابة اسم الصنف في حقل البحث بالأعلى لتغيير البحث.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>
                  تم العثور على ({rankedSubstitutes.length}) بديل ومثيل مطابق:
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488' }}>
                  اضغط [1..{Math.min(9, rankedSubstitutes.length)}] للاختيار السريع
                </span>
              </div>

              {rankedSubstitutes.map((sub, index) => {
                const profitDiff = (sub.profitMargin || 0) - origMargin;
                const branches = substitutesBranchStock[sub.tradeNameAr] || substitutesBranchStock[sub.tradeNameEn] || [];
                const currentBrData = branches.find((b) => b.isCurrent);
                const currentStockBoxes = currentBrData?.boxes ?? sub.totalStock ?? 0;
                const currentStockStrips = currentBrData?.strips ?? 0;
                const otherBranchesWithStock = branches.filter((b) => !b.isCurrent && (b.boxes > 0 || b.strips > 0));
                const isLoadingThisStock = loadingStocks[sub.tradeNameAr] || loadingStocks[sub.tradeNameEn];

                const isGold = index === 0 && currentStockBoxes > 0;

                return (
                  <div
                    key={sub.id || index}
                    style={{
                      background: isGold ? 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%)' : '#ffffff',
                      border: isGold ? '2px solid #0d9488' : '1.5px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '14px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      boxShadow: isGold
                        ? '0 8px 24px -4px rgba(13, 148, 136, 0.2)'
                        : '0 2px 8px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* السطر العلوي: الشارة + اسم الدواء + الأسعار + زر الاستبدال */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '6px',
                              background: '#1e293b',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 900
                            }}
                          >
                            {index + 1}
                          </span>

                          {isGold && (
                            <span
                              style={{
                                padding: '2px 8px',
                                background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                                color: '#ffffff',
                                borderRadius: '6px',
                                fontSize: '10.5px',
                                fontWeight: 900,
                                boxShadow: '0 2px 6px rgba(13, 148, 136, 0.3)'
                              }}
                            >
                              ⭐ البديل الذهبي الموصى به
                            </span>
                          )}

                          <span style={{ fontWeight: 900, fontSize: '15px', color: '#0f172a' }}>
                            {sub.tradeNameAr}
                          </span>

                          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>
                            ({sub.tradeNameEn})
                          </span>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px' }}>
                          🏢 الشركة: <strong>{sub.manufacturer || 'محلية'}</strong> • الشكل: <strong>{sub.dosageForm} ({sub.strength || ''})</strong>
                        </div>
                      </div>

                      {/* الأسعار وزر الاستبدال */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'left' }}>
                          <div
                            style={{
                              fontSize: '18px',
                              fontWeight: 900,
                              color: '#0d9488',
                              fontVariantNumeric: 'tabular-nums',
                              lineHeight: 1.1
                            }}
                          >
                            {sub.publicPrice.toFixed(2)} ج
                          </div>
                          <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            شريط: {sub.subUnitPrice ? sub.subUnitPrice.toFixed(2) : (sub.publicPrice / (sub.packSize || 1)).toFixed(2)} ج
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* زر واتساب */}
                          <button
                            type="button"
                            onClick={() => handleShareWhatsApp(sub)}
                            title="مشاركة تفاصيل البديل للعميل عبر الواتساب"
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              background: '#f0fdf4',
                              border: '1.5px solid #86efac',
                              color: '#16a34a',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#dcfce7')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                          >
                            <MessageCircle size={18} />
                          </button>

                          {/* زر استبدال في الفاتورة */}
                          <button
                            type="button"
                            onClick={() => handleApplySubstitute(sub)}
                            style={{
                              padding: '9px 16px',
                              background: isGold ? 'linear-gradient(135deg, #0d9488 0%, #059669 100%)' : '#0f172a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '10px',
                              fontWeight: 800,
                              fontSize: '12.5px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
                              transition: 'transform 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                          >
                            <Check size={16} />
                            <span>استبدال في الفاتورة</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* السطر السفلي: رصيد الفرع الحالي + رصيد الفروع الأخرى + الربحية */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        paddingTop: '8px',
                        borderTop: '1px solid #f1f5f9'
                      }}
                    >
                      {/* شارات الرصيد بالفرع والفروع الأخرى */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* رصيد الفرع الحالي */}
                        {isLoadingThisStock ? (
                          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> جاري فحص الرصيد...
                          </span>
                        ) : currentStockBoxes > 0 ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 9px',
                              borderRadius: '7px',
                              background: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              color: '#065f46',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          >
                            <CheckCircle2 size={13} color="#059669" />
                            متوفر بالفرع: {currentStockBoxes} علبة {currentStockStrips > 0 ? `و ${currentStockStrips} شريط` : ''}
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 9px',
                              borderRadius: '7px',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              color: '#991b1b',
                              fontSize: '11.5px',
                              fontWeight: 800
                            }}
                          >
                            <AlertTriangle size={13} color="#dc2626" />
                            غير متوفر بهذا الفرع
                          </span>
                        )}

                        {/* توفر البديل في الفروع الأخرى */}
                        {otherBranchesWithStock.length > 0 && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '3px 9px',
                              borderRadius: '7px',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1e40af',
                              fontSize: '11.5px',
                              fontWeight: 800
                            }}
                            title={otherBranchesWithStock.map((b) => `${b.name}: ${b.boxes} علبة`).join(' • ')}
                          >
                            <Building2 size={13} color="#2563eb" />
                            متوفر في ({otherBranchesWithStock.length}) فروع أخرى:{' '}
                            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {otherBranchesWithStock.map((b) => `${b.name.split('-')[0].trim()} (${b.boxes}ع)`).slice(0, 2).join(' • ')}
                            </strong>
                          </span>
                        )}
                      </div>

                      {/* شارات الربحية والصلاحية */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            background: '#f0fdfa',
                            border: '1px solid #99f6e4',
                            color: '#0f766e',
                            borderRadius: '7px',
                            fontSize: '11px',
                            fontWeight: 800,
                            fontVariantNumeric: 'tabular-nums'
                          }}
                        >
                          <TrendingUp size={12} color="#0d9488" />
                          ربح الصيدلية: {sub.profitMargin.toFixed(2)} ج ({sub.profitPct}%)
                          {profitDiff > 0 && (
                            <span style={{ color: '#059669', fontWeight: 900 }}>
                              (+{profitDiff.toFixed(2)} ج زيادة)
                            </span>
                          )}
                        </span>

                        {sub.nearestExpiryDays < 180 && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              background: '#fffbeb',
                              border: '1px solid #fde68a',
                              color: '#b45309',
                              borderRadius: '7px',
                              fontSize: '11px',
                              fontWeight: 800
                            }}
                          >
                            <Clock size={12} />
                            أقرب صلاحية: {sub.nearestExpiryDays} يوم
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 5. شريط التذييل السريع ── */}
        <div
          style={{
            padding: '12px 24px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b',
            fontWeight: 700
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>💡 نصيحة: تقديم البديل المتوفر فورياً يحافظ على عملاء الصيدلية ويزيد المبيعات</span>
          </div>

          <button
            type="button"
            onClick={() => setIsSubstitutesModalOpen(false)}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '12px'
            }}
          >
            إغلاق [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
