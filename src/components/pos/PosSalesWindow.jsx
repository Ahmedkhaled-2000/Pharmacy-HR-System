import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import {
  searchProducts,
  detectCartDrugInteractions,
  findSmartSubstitutes,
  checkBatchExpiryStatus,
  INVOICE_TYPES,
  PHARMA_FAST_OTC_ITEMS,
  FAST_OTC_CATEGORIES
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
  HelpCircle,
  Building2,
  Bike,
  FileText,
  Image,
  Eye,
  Percent,
  Coins,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  UserPlus,
  PackagePlus,
  Tag,
  Layers,
  ShoppingBag,
  SlidersHorizontal,
  X
} from 'lucide-react';

export default function PosSalesWindow({ windowId }) {
  const { currentEmpUser, currentBranch } = useAuth?.() || {};
  const { showToast } = useUI?.() || {};
  const {
    productsCatalog,
    salesWindows,
    activeWindowId,
    addItemToActiveWindowCart,
    addUncodedItemToActiveCart,
    updateCartItemType,
    removeItemFromCart,
    updateCartItemQuantity,
    toggleCartItemUnit,
    clearCart,
    finalizeSale,
    updateWindowCustomer,
    updateWindowInvoiceType,
    updateWindowRxImage,
    updateWindowDeliveryDetails,
    setIsPaymentModalOpen,
    setActivePaymentSale,
    setIsSubstitutesModalOpen,
    setActiveSubstituteTarget,
    openBranchStockModal,
    setIsDeliveryModalOpen,
    setIsCustomerModalOpen,
    openCustomerHistoryModal
  } = usePOS();

  const currentWindow = salesWindows.find((w) => w.id === windowId);
  const cart = currentWindow?.cart || [];
  const customer = currentWindow?.customer || { name: '', phone: '', isChronic: false, walletBalance: 0 };
  const invoiceType = currentWindow?.invoiceType || 'otc';
  const rxImage = currentWindow?.rxImage || null;
  const deliveryDetails = currentWindow?.deliveryDetails || { isDelivery: false, address: '', pilotName: '', deliveryFee: 0 };

  // حقل البحث والباركود
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const barcodeInputRef = useRef(null);
  const resultsContainerRef = useRef(null);

  // إظهار نافذة تكبير صورة الروشتة
  const [isRxImageZoomed, setIsRxImageZoomed] = useState(false);

  // الخصم المزدوج (نسبة مئوية % أم مبلغ قطعي ج.م)
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [discountValue, setDiscountValue] = useState(0);
  const [useWallet, setUseWallet] = useState(false);

  // ── 0. حساب إجماليات السلة والخصم والمحفظة والضرائب في أعلى المكون (منع خطأ TDZ تماماً) ──
  const subtotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  }, [cart]);

  const totalCommissions = useMemo(() => {
    return cart.reduce((sum, it) => sum + (it.instantCommission || 0), 0);
  }, [cart]);

  const calculatedDiscount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === 'percent') {
      return Math.min(subtotal, (subtotal * (Math.min(100, Math.max(0, val)) / 100)));
    }
    return Math.min(subtotal, Math.max(0, val));
  }, [discountType, discountValue, subtotal]);

  const deliveryFee = deliveryDetails.isDelivery ? (parseFloat(deliveryDetails.deliveryFee) || 0) : 0;
  const remainingBeforeWallet = Math.max(0, subtotal - calculatedDiscount + deliveryFee);
  const availableWallet = Math.max(0, parseFloat(customer?.walletBalance || 0));
  const walletDeducted = useWallet ? Math.min(availableWallet, remainingBeforeWallet) : 0;
  const netTotal = Math.max(0, remainingBeforeWallet - walletDeducted);

  // ── الأصناف السريعة الأكثر مبيعاً (Quick Items Drawer) ──
  const [isQuickItemsOpen, setIsQuickItemsOpen] = useState(true);
  const [activeQuickGroup, setActiveQuickGroup] = useState('all');

  const filteredFastItems = useMemo(() => {
    if (activeQuickGroup === 'all') return PHARMA_FAST_OTC_ITEMS;
    return PHARMA_FAST_OTC_ITEMS.filter((item) => item.group === activeQuickGroup);
  }, [activeQuickGroup]);

  // ── نافذة الصنف الغير مكود / اليدوي (Uncoded Item Modal) ──
  const [isUncodedModalOpen, setIsUncodedModalOpen] = useState(false);
  const [uncodedForm, setUncodedForm] = useState({
    name: '',
    price: '',
    costPrice: '',
    qty: '1',
    unit: 'علبة',
    itemType: 'otc'
  });

  // ── حالة البيع السريع الجاري ──
  const [isQuickCheckingOut, setIsQuickCheckingOut] = useState(false);

  // ── فتح نافذة الدفع التقليدية ──
  const handleOpenPayment = useCallback((method = 'cash') => {
    if (cart.length === 0) return;
    setActivePaymentSale({
      windowId,
      cart,
      subtotal,
      discountAmount: calculatedDiscount,
      walletDeducted,
      totalAmount: netTotal,
      customer,
      invoiceType,
      rxImage,
      deliveryDetails,
      paymentMethod: method
    });
    setIsPaymentModalOpen(true);
  }, [cart, windowId, subtotal, calculatedDiscount, walletDeducted, netTotal, customer, invoiceType, rxImage, deliveryDetails, setActivePaymentSale, setIsPaymentModalOpen]);

  // ── البيع السريع الفوري بدون طباعة ريسيت (< 1 ثانية) ──
  const handleQuickCheckoutWithoutReceipt = useCallback(async () => {
    if (cart.length === 0) {
      showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
      return;
    }
    if (isQuickCheckingOut) return;

    setIsQuickCheckingOut(true);
    try {
      const activeCode = currentEmpUser?.code || '101';
      const activeName = currentEmpUser?.name || 'صيدلي الكاشير';
      const activeId = currentEmpUser?.id || 'cashier_1';

      const committed = await finalizeSale({
        windowId,
        paymentMethod: 'cash',
        paidAmount: netTotal,
        discountAmount: calculatedDiscount,
        cashierEmpCode: activeCode,
        cashierEmpName: activeName,
        cashierEmpId: activeId,
        printReceipt: false // ⚡ تجاوز الطباعة نهائياً لسرعة متناهية
      });

      if (committed) {
        showToast?.(`⚡ تم إنهاء الفاتورة #${committed.invoiceNumber} نقداً بنجاح بدون ريسيت (${netTotal.toFixed(2)} ج)`);
      }
    } catch (err) {
      console.error('Quick checkout error:', err);
      showToast?.('❌ حدث خطأ أثناء إتمام الفاتورة السريعة');
    } finally {
      setIsQuickCheckingOut(false);
      setTimeout(() => {
        if (barcodeInputRef.current) barcodeInputRef.current.focus();
      }, 60);
    }
  }, [cart, isQuickCheckingOut, currentEmpUser, finalizeSale, windowId, netTotal, calculatedDiscount, showToast]);

  // إضافة صنف حر غير مكود مباشرة
  const handleAddUncodedItem = (e) => {
    e?.preventDefault();
    if (!uncodedForm.name.trim() || !uncodedForm.price) {
      showToast?.('⚠️ يرجى إدخال اسم الصنف وسعر البيع');
      return;
    }
    const price = Math.max(0, parseFloat(uncodedForm.price) || 0);
    const cost = Math.max(0, parseFloat(uncodedForm.costPrice) || (price * 0.75));
    const qty = Math.max(0.1, parseFloat(uncodedForm.qty) || 1);

    addUncodedItemToActiveCart({
      tradeNameAr: uncodedForm.name.trim(),
      tradeNameEn: uncodedForm.name.trim(),
      publicPrice: price,
      costPrice: cost,
      qty,
      unitName: uncodedForm.unit || 'علبة',
      itemType: uncodedForm.itemType || invoiceType || 'otc'
    });

    showToast?.(`✅ تم إدراج الصنف غير المكود: ${uncodedForm.name.trim()}`);
    setIsUncodedModalOpen(false);
    setUncodedForm({ name: '', price: '', costPrice: '', qty: '1', unit: 'علبة', itemType: 'otc' });
    setTimeout(() => {
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    }, 50);
  };

  // ── إضافة صنف سريع بضغطة واحدة (OTC Fast Item Selection) ──
  const handleSelectFastItem = useCallback((fastItem) => {
    const fullProd = productsCatalog.find((p) => p.id === fastItem.id || p.barcode === fastItem.barcode) || {
      id: fastItem.id,
      tradeNameAr: fastItem.tradeName,
      tradeNameEn: fastItem.tradeNameEn || fastItem.tradeName,
      publicPrice: fastItem.publicPrice,
      subUnitPrice: fastItem.subUnitPrice || (fastItem.publicPrice / (fastItem.packSize || 1)),
      packSize: fastItem.packSize || 1,
      barcode: fastItem.barcode,
      genericName: fastItem.activeIngredient || 'OTC',
      dosageForm: fastItem.dosageForm || 'أقراص',
      strength: fastItem.strength || '',
      batches: [{ id: `batch_${fastItem.id}`, expiryDate: '2028-12-31', qtyBase: 100, batchNumber: 'BATCH-OTC' }]
    };
    addItemToActiveWindowCart(fullProd, 'base', 1, invoiceType);
    showToast?.(`⚡ تم إضافة ${fastItem.tradeName} إلى الفاتورة`);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  }, [productsCatalog, addItemToActiveWindowCart, invoiceType, showToast]);

  // إبقاء مؤشر الكتابة داخل حقل الباركود دائماً عند تنشيط النافذة
  useEffect(() => {
    if (activeWindowId === windowId && barcodeInputRef.current && !isUncodedModalOpen) {
      barcodeInputRef.current.focus();
    }
  }, [activeWindowId, windowId, isUncodedModalOpen]);

  // ── 1. الاستماع لنسخ صورة الروشتة من الحافظة (Ctrl + V Prescription Clipboard Paste) ──
  useEffect(() => {
    const handlePaste = (e) => {
      if (activeWindowId !== windowId) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            updateWindowRxImage(windowId, dataUrl);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeWindowId, windowId, updateWindowRxImage]);

  // ── الاستماع للأحداث الموجهة من الاختصارات المركزية ──
  useEffect(() => {
    if (activeWindowId !== windowId) return;

    const handleQuickCheckoutEvt = () => handleQuickCheckoutWithoutReceipt();
    const handleToggleQuickItemsEvt = () => setIsQuickItemsOpen((prev) => !prev);
    const handleOpenUncodedEvt = () => setIsUncodedModalOpen(true);

    window.addEventListener('pos:quick-cash-checkout', handleQuickCheckoutEvt);
    window.addEventListener('pos:toggle-quick-items', handleToggleQuickItemsEvt);
    window.addEventListener('pos:open-uncoded-modal', handleOpenUncodedEvt);

    return () => {
      window.removeEventListener('pos:quick-cash-checkout', handleQuickCheckoutEvt);
      window.removeEventListener('pos:toggle-quick-items', handleToggleQuickItemsEvt);
      window.removeEventListener('pos:open-uncoded-modal', handleOpenUncodedEvt);
    };
  }, [activeWindowId, windowId, handleQuickCheckoutWithoutReceipt]);

  // ── 2. اختصارات لوحة المفاتيح الخاصة بالنافذة ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeWindowId !== windowId) return;

      // إنهاء فوري بدون ريسيت
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleQuickCheckoutWithoutReceipt();
        return;
      }

      // إضافة صنف حر غير مكود
      if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        e.stopPropagation();
        setIsUncodedModalOpen(true);
        return;
      }

      // إظهار وإخفاء الأصناف السريعة
      if (e.key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickItemsOpen((prev) => !prev);
        return;
      }

      // تبديل نوع الفاتورة بالكامل
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault();
        updateWindowInvoiceType(windowId, 'otc');
      } else if (e.ctrlKey && e.key === '2') {
        e.preventDefault();
        updateWindowInvoiceType(windowId, 'rx');
      } else if (e.ctrlKey && e.key === '3') {
        e.preventDefault();
        updateWindowInvoiceType(windowId, 'customer_order');
      } else if (e.ctrlKey && e.key === '4') {
        e.preventDefault();
        updateWindowInvoiceType(windowId, 'delivery');
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleOpenPayment('cash');
      } else if (e.key === 'F6') {
        e.preventDefault();
        handleOpenPayment('card');
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleQuickCheckoutWithoutReceipt();
      } else if (e.key === 'F10') {
        e.preventDefault();
        setIsUncodedModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWindowId, windowId, updateWindowInvoiceType, handleOpenPayment, handleQuickCheckoutWithoutReceipt]);

  // ── 3. البحث الفوري الثنائي (محلياً + من قاعدة بيانات Outstock السحابية) ──
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedResultIndex(0);
      return;
    }

    // بحث محلي فوري فائق السرعة
    const localResults = searchProducts(productsCatalog, searchQuery);
    setSearchResults(localResults.slice(0, 10));
    setSelectedResultIndex(0);

    // بحث متقدم متصل بكتالوج النواقص والأدوية المصرية (Debounced)
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        try {
          setIsSearchingOnline(true);
          const res = await fetch(`/api/outstock/medications/search?q=${encodeURIComponent(searchQuery.trim())}&limit=12`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.medications) && data.medications.length > 0) {
              // تحويل عناصر قاعدة بيانات النواقص لتطابق هيكل الأصناف المعتمدة
              const mappedOnline = data.medications.map((m) => ({
                id: m.id,
                barcode: m.gtin_barcode || m.id,
                barcodes: [m.gtin_barcode, m.id].filter(Boolean),
                tradeNameAr: m.trade_name_ar || m.trade_name_en,
                tradeNameEn: m.trade_name_en || m.trade_name_ar,
                genericName: m.generic_name || 'غير محدد',
                category: m.category || m.department || 'أدوية',
                dosageForm: m.dosage_form || 'عبوة',
                strength: m.strength || '',
                packSize: parseInt(m.pack_size || 1, 10),
                baseUnit: m.unit_name || 'علبة',
                subUnit: 'شريط',
                piecesPerSubUnit: 10,
                publicPrice: parseFloat(m.public_price || 0),
                costPrice: parseFloat(m.last_cost_price || m.public_price * 0.75),
                subUnitPrice: parseFloat(m.unit_price || (m.public_price / (m.pack_size || 1))),
                isTableDrug: Boolean(m.is_table_drug),
                isChronic: false,
                commissionPct: 2.0,
                batches: [{ id: `b_${m.id}`, batchNo: 'EDA-ONLINE', expiryDate: '2027-12-31', qtyBase: m.current_stock || 15 }]
              }));

              setSearchResults((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const uniqueNew = mappedOnline.filter((m) => !existingIds.has(m.id));
                return [...prev, ...uniqueNew].slice(0, 14);
              });
            }
          }
        } catch (e) {
          // هدوء في حالة عدم توفر الإنترنت
        } finally {
          setIsSearchingOnline(false);
        }
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, productsCatalog]);

  // إضافة صنف للسلة مع توريث نوع الفاتورة الحالي
  const handleSelectProduct = (product, unitType = 'base') => {
    addItemToActiveWindowCart(product, unitType, 1, invoiceType);
    setSearchQuery('');
    setSearchResults([]);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  // معالجة مفاتيح الكيبورد داخل حقل البحث (Zero-Mouse Navigation بالأسهم و Tab و Enter و Esc)
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedResultIndex((prev) => {
        const next = (prev + 1) % (searchResults.length || 1);
        scrollSelectedIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedResultIndex((prev) => {
        const next = (prev - 1 + (searchResults.length || 1)) % (searchResults.length || 1);
        scrollSelectedIntoView(next);
        return next;
      });
    } else if (e.key === 'Tab') {
      if (searchResults.length > 0) {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        setSelectedResultIndex((prev) => {
          const next = (prev + delta + searchResults.length) % searchResults.length;
          scrollSelectedIntoView(next);
          return next;
        });
      }
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
      e.preventDefault();
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const scrollSelectedIntoView = (index) => {
    if (!resultsContainerRef.current) return;
    const items = resultsContainerRef.current.children;
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // ── 4. رادار التفاعلات الدوائية السريرية ──
  const drugInteractions = useMemo(() => {
    return detectCartDrugInteractions(cart);
  }, [cart]);

  // فحص البدائل للصنف
  const handleInspectSubstitutes = (item) => {
    const prod = productsCatalog.find((p) => p.id === item.productId);
    if (prod) {
      setActiveSubstituteTarget({ product: prod, windowId });
      setIsSubstitutesModalOpen(true);
    }
  };

  // فحص رصيد الصنف عبر الفروع
  const handleInspectBranchStock = (productObj) => {
    openBranchStockModal(productObj);
  };

  // البحث السريع عن عميل بالهاتف لجلب رصيد المحفظة
  const handlePhoneLookup = async (phone) => {
    updateWindowCustomer(windowId, { phone });
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 11) {
      try {
        const raw = localStorage.getItem('pharma_pos_customers');
        const localList = raw ? JSON.parse(raw) : [];
        const matched = localList.find((c) => c.phone.replace(/\D/g, '') === cleanPhone);
        if (matched) {
          updateWindowCustomer(windowId, {
            name: matched.name,
            phone: matched.phone,
            isChronic: Boolean(matched.isChronic),
            walletBalance: matched.walletBalance || 45.00
          });
          return;
        }

        // محاولة الاستعلام من API العملاء المركزي
        const res = await fetch(`/api/outstock/customers?phone=${cleanPhone}`);
        if (res.ok) {
          const data = await res.json();
          if (data.customers && data.customers.length > 0) {
            const remoteC = data.customers[0];
            updateWindowCustomer(windowId, {
              name: remoteC.full_name,
              phone: remoteC.whatsapp_phone || phone,
              walletBalance: parseFloat(remoteC.wallet_balance || 0),
              isChronic: Boolean(remoteC.is_chronic)
            });
          }
        }
      } catch (e) {}
    }
  };

  // تبديل تصنيف الصنف الفردي (OTC ↔ روشتة ↔ طلب عميل)
  const handleCycleItemType = (idx, currentType) => {
    const types = ['otc', 'rx', 'customer_order'];
    const nextIndex = (types.indexOf(currentType || 'otc') + 1) % types.length;
    updateCartItemType(windowId, idx, types[nextIndex]);
  };

  return (
    <div className="pos-sales-layout">
      {/* ── الجانب الأيمن: شريط نوع الفاتورة + البحث + جدول السلة ── */}
      <div className="pos-cart-section">
        {/* ── 1. محدد نوع فاتورة البيع المعتمد (OTC / روشتة Rx / طلب عميل / دليفري) ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-hover, rgba(255,255,255,0.03))',
            padding: '8px 14px',
            borderRadius: '12px',
            border: '1px solid var(--border, rgba(255,255,255,0.08))',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted, #94a3b8)' }}>
              نوع الفاتورة:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {Object.values(INVOICE_TYPES).map((type) => {
                const isActive = invoiceType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => updateWindowInvoiceType(windowId, type.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: isActive ? `1.5px solid ${type.color}` : '1px solid var(--border, rgba(255,255,255,0.1))',
                      background: isActive ? `${type.color}25` : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--muted, #94a3b8)',
                      fontSize: '12px',
                      fontWeight: isActive ? 900 : 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? `0 0 12px ${type.color}40` : 'none'
                    }}
                    title={type.desc}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setIsQuickItemsOpen((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: isQuickItemsOpen ? '1.5px solid #0d9488' : '1px solid var(--border, rgba(255,255,255,0.1))',
                background: isQuickItemsOpen ? 'rgba(13, 148, 136, 0.22)' : 'transparent',
                color: isQuickItemsOpen ? '#2dd4bf' : 'var(--muted, #94a3b8)',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isQuickItemsOpen ? '0 0 10px rgba(13, 148, 136, 0.3)' : 'none'
              }}
              title="إظهار / إخفاء رف الأصناف السريعة الأكثر طلباً (F8)"
            >
              <Zap size={14} />
              <span>الأصناف السريعة [F8]</span>
            </button>

            <button
              type="button"
              onClick={() => setIsUncodedModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1.5px solid rgba(245, 158, 11, 0.5)',
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.2)'
              }}
              title="إضافة صنف حر غير مكود يدوياً للفاتورة (Ctrl + M)"
            >
              <PackagePlus size={14} />
              <span>صنف غير مكود [Ctrl+M]</span>
            </button>
          </div>
        </div>

        {/* ── 2. شريط البحث والباركود الذكي ── */}
        <div className="pos-search-bar-wrap">
          <input
            ref={barcodeInputRef}
            type="text"
            className="pos-barcode-input"
            placeholder="🔍 امسح الباركود أو اكتب اسم الدواء / المادة الفعالة / العرض الطبي (صداع، ضغط، مغص)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
          />

          {isSearchingOnline && (
            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} style={{ animation: 'spin 1s linear infinite' }} />
              جاري مسح الكتالوج السحابي...
            </div>
          )}

          {/* قائمة نتائج البحث السريع المنسدلة */}
          {searchResults.length > 0 && (
            <div
              ref={resultsContainerRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                left: 0,
                background: 'var(--surface, #0f172a)',
                border: '1.5px solid var(--primary, #0d9488)',
                borderRadius: '14px',
                boxShadow: '0 18px 45px rgba(0, 0, 0, 0.45)',
                zIndex: 1000,
                maxHeight: '380px',
                overflowY: 'auto'
              }}
            >
              {searchResults.map((prod, idx) => {
                const isSelected = idx === selectedResultIndex;
                const totalStock = prod.batches?.reduce((sum, b) => sum + (parseFloat(b.qtyBase) || 0), 0) || 0;

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
                      background: isSelected ? 'rgba(13, 148, 136, 0.15)' : 'transparent',
                      borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#ffffff' }}>
                          {prod.tradeNameAr}
                        </span>
                        <span style={{ color: 'var(--muted, #94a3b8)', fontSize: '12px' }}>
                          ({prod.tradeNameEn})
                        </span>
                        {totalStock > 0 ? (
                          <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: '10.5px', fontWeight: 800 }}>
                            المتاح بالفرع: {totalStock} علبة
                          </span>
                        ) : (
                          <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '10.5px', fontWeight: 800 }}>
                            رصيد منتهي ❌
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                        🧪 المادة الفعالة: <strong>{prod.genericName}</strong> • {prod.dosageForm} ({prod.strength})
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {/* زر فحص الفروع الأخرى من داخل البحث */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInspectBranchStock(prod);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="فحص توفر هذا الدواء في بقية فروع الصيدلية"
                      >
                        <Building2 size={12} />
                        فحص الفروع
                      </button>

                      <div style={{ textAlign: 'left', minWidth: '70px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--primary, #0d9488)' }}>
                          {parseFloat(prod.publicPrice || 0).toFixed(2)} ج
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--accent, #f59e0b)', fontWeight: 700 }}>
                          شريط: {parseFloat(prod.subUnitPrice || (prod.publicPrice / (prod.packSize || 1))).toFixed(2)} ج
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 2.5 رف / درج الأصناف السريعة الأكثر طلباً (Quick Items Drawer) ── */}
        {isQuickItemsOpen && (
          <div className="pos-quick-items-tray">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} color="var(--primary, #0d9488)" />
                <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--text, #f1f5f9)' }}>
                  الأصناف السريعة والأكثر مبيعاً (OTC Fast Picks)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
                  (نقرة واحدة للإضافة المباشرة للسلة)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsUncodedModalOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '7px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: '#f59e0b',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                  title="إضافة صنف غير مكود يدوياً (Ctrl + M)"
                >
                  <PackagePlus size={13} />
                  <span>صنف غير مكود [Ctrl+M]</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickItemsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted, #94a3b8)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                  title="إخفاء الدرج (F8)"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* تصنيفات الأصناف السريعة */}
            <div className="pos-quick-filter-bar">
              {FAST_OTC_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`pos-quick-filter-chip ${activeQuickGroup === cat.id ? 'active' : ''}`}
                  onClick={() => setActiveQuickGroup(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* شبكة البطاقات السريعة */}
            <div className="pos-quick-items-grid">
              {filteredFastItems.map((item) => (
                <div
                  key={item.id}
                  className="pos-quick-item-card"
                  onClick={() => handleSelectFastItem(item)}
                  title={`إضافة ${item.tradeName} للسلة`}
                >
                  <div className="pos-quick-item-name">{item.tradeName}</div>
                  <div className="pos-quick-item-footer">
                    <span className="pos-quick-item-price">{parseFloat(item.publicPrice || 0).toFixed(2)} ج</span>
                    <span className="pos-quick-item-tag">{item.activeIngredient || 'OTC'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 3. تنبيه رادار التفاعلات الدوائية الخطيرة بالسلة ── */}
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

        {/* ── 4. جدول سلة الفاتورة مع تصنيف الصنف الفردي ── */}
        <div className="pos-cart-table-wrap">
          <table className="pos-cart-table">
            <thead>
              <tr>
                <th style={{ width: '4%' }}>#</th>
                <th style={{ width: '32%' }}>الصنف الدوائي والمادة الفعالة</th>
                <th style={{ width: '13%', textAlign: 'center' }}>نوع الصنف</th>
                <th style={{ width: '12%', textAlign: 'center' }}>الوحدة المباعة</th>
                <th style={{ width: '12%', textAlign: 'center' }}>الكمية</th>
                <th style={{ width: '11%', textAlign: 'left' }}>سعر الوحدة</th>
                <th style={{ width: '12%', textAlign: 'left' }}>الإجمالي</th>
                <th style={{ width: '6%', textAlign: 'center' }}>حذف</th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted, #475569)' }}>
                    <Barcode size={48} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <div style={{ fontWeight: 800, fontSize: '15px' }}>السلة فارغة حالياً</div>
                    <div style={{ fontSize: '12px' }}>امسح باركود الدواء أو ابحث بالاسم لإضافة أول صنف للفاتورة</div>
                  </td>
                </tr>
              ) : (
                cart.map((item, idx) => {
                  const itType = item.itemType || invoiceType || 'otc';
                  const itBadge = {
                    otc: { label: 'OTC لا وصفية', color: '#10b981', icon: '🟢' },
                    rx: { label: 'روشتة Rx', color: '#0ea5e9', icon: '💊' },
                    customer_order: { label: 'طلب عميل', color: '#f59e0b', icon: '📋' }
                  }[itType] || { label: 'OTC', color: '#10b981', icon: '🟢' };

                  return (
                    <tr key={`${item.productId}-${item.unitType}-${idx}`}>
                      <td style={{ fontWeight: 700, color: 'var(--muted, #475569)' }}>{idx + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text, #0b132b)' }}>
                            {item.tradeNameAr}
                          </span>
                          {item.isUncoded && (
                            <span className="pos-uncoded-badge">
                              ✨ صنف حر غير مكود
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted, #475569)' }}>
                          {item.genericName}
                        </div>

                        {!item.isUncoded && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
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
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Sparkles size={12} />
                              فحص البدائل [F2]
                            </button>

                            {/* زر فحص الفروع الأخرى */}
                            <button
                              type="button"
                              onClick={() => {
                                const prod = productsCatalog.find((p) => p.id === item.productId) || item;
                                handleInspectBranchStock(prod);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#0284c7',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <Building2 size={12} />
                              فروع أخرى 🏢
                            </button>
                          </div>
                        )}
                      </td>

                      {/* تصنيف الصنف الفردي (OTC / روشتة / طلب عميل) */}
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={itType}
                          onChange={(e) => updateCartItemType(windowId, idx, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: `${itBadge.color}18`,
                            border: `1.5px solid ${itBadge.color}60`,
                            color: itBadge.color,
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            outline: 'none',
                            textAlign: 'center'
                          }}
                          title="تحديد نوع الصنف في الفاتورة (OTC، روشتة، طلب عميل)"
                        >
                          <option value="otc" style={{ background: '#0f172a', color: '#10b981' }}>🟢 OTC لا وصفي</option>
                          <option value="rx" style={{ background: '#0f172a', color: '#0ea5e9' }}>💊 روشتة Rx</option>
                          <option value="customer_order" style={{ background: '#0f172a', color: '#f59e0b' }}>📋 طلب عميل</option>
                        </select>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── الجانب الأيسر: بيانات العميل والروشتة والإجماليات والدفع ── */}
      <div className="pos-checkout-sidebar">
        {/* بطاقة العميل والمحفظة */}
        <div style={{ background: 'var(--surface-hover, rgba(255,255,255,0.04))', padding: '14px', borderRadius: '14px', border: '1px solid var(--border, rgba(255,255,255,0.1))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 900, color: 'var(--text, #ffffff)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              👤 بيانات العميل والمحفظة
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {customer.name && (
                <button
                  type="button"
                  onClick={() => openCustomerHistoryModal(customer)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="عرض سجل مشتريات وفواتير العميل السابقة والروشتات والمحفظة"
                >
                  <FileText size={12} />
                  📜 سجل العميل
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                style={{
                  background: 'rgba(13, 148, 136, 0.15)',
                  border: '1px solid var(--primary, #0d9488)',
                  color: 'var(--primary, #0d9488)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <UserPlus size={12} />
                + عميل جديد
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="اسم العميل..."
              value={customer.name}
              onChange={(e) => updateWindowCustomer(windowId, { name: e.target.value })}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border, rgba(255,255,255,0.12))',
                background: 'var(--surface, #0f172a)',
                color: 'var(--text, #ffffff)',
                fontSize: '12px'
              }}
            />

            <input
              type="tel"
              placeholder="رقم الهاتف (11 رقم لجلب العميل والمحفظة)..."
              value={customer.phone}
              onChange={(e) => handlePhoneLookup(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border, rgba(255,255,255,0.12))',
                background: 'var(--surface, #0f172a)',
                color: 'var(--text, #ffffff)',
                fontSize: '12px'
              }}
            />

            {/* إذا كان الرقم مدخلاً والعميل غير مسجل */}
            {!customer.name && customer.phone && customer.phone.replace(/\D/g, '').length >= 10 && (
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px dashed #f59e0b',
                  color: '#fbbf24',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <UserPlus size={13} />
                هاتف غير مسجل! انقر لإضافة العميل للقاعدة المركزية
              </button>
            )}

            {/* شارة رصيد المحفظة مع إمكانية الدفع منها */}
            {availableWallet > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: useWallet ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.08)',
                  border: useWallet ? '1.5px solid #10b981' : '1px solid rgba(16,185,129,0.3)',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setUseWallet((prev) => !prev)}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span style={{ color: '#10b981', fontWeight: 800 }}>💰 سداد من المحفظة ({availableWallet.toFixed(2)} ج)</span>
                </label>
                <span style={{ fontWeight: 900, color: useWallet ? '#10b981' : '#94a3b8' }}>
                  {useWallet ? `-${walletDeducted.toFixed(2)} ج` : 'غير مفعل'}
                </span>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', cursor: 'pointer', color: 'var(--muted, #94a3b8)' }}>
              <input
                type="checkbox"
                checked={customer.isChronic}
                onChange={(e) => updateWindowCustomer(windowId, { isChronic: e.target.checked })}
              />
              <span>تفعيل متابعة العلاج المزمن وتذكير الواتساب</span>
            </label>

            {/* زر تحويل الفاتورة لدليفري أو العكس */}
            <button
              type="button"
              onClick={() => {
                const nextType = invoiceType === 'delivery' ? 'otc' : 'delivery';
                updateWindowInvoiceType(windowId, nextType);
                updateWindowDeliveryDetails(windowId, { isDelivery: nextType === 'delivery' });
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                background: invoiceType === 'delivery' ? 'rgba(139, 92, 246, 0.22)' : 'rgba(255, 255, 255, 0.05)',
                border: invoiceType === 'delivery' ? '1.5px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.12)',
                color: invoiceType === 'delivery' ? '#c4b5fd' : 'var(--text-muted, #94a3b8)',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Bike size={14} color={invoiceType === 'delivery' ? '#a78bfa' : '#94a3b8'} />
              <span>{invoiceType === 'delivery' ? '✅ الفاتورة محولة لدليفري' : '🛵 تحويل الفاتورة إلى دليفري'}</span>
            </button>
          </div>
        </div>

        {/* بطاقة صورة الروشتة المنسوخة (Prescription Clipboard Card) */}
        {rxImage ? (
          <div style={{ background: 'var(--surface-hover, rgba(255,255,255,0.04))', padding: '10px', borderRadius: '12px', border: '1px solid #38bdf8' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Image size={13} />
                روشتة طبية مرفقة (Ctrl+V)
              </span>
              <button
                type="button"
                onClick={() => updateWindowRxImage(windowId, null)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                title="حذف الروشتة"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ position: 'relative', height: '70px', borderRadius: '6px', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setIsRxImageZoomed(true)}>
              <img src={rxImage} alt="Prescription" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 700 }}>
                <Eye size={14} style={{ marginLeft: '4px' }} /> تكبير
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px dashed var(--border, rgba(255,255,255,0.15))',
              background: 'rgba(255,255,255,0.02)',
              fontSize: '11px',
              color: 'var(--muted, #94a3b8)',
              textAlign: 'center'
            }}
          >
            📋 الصق صورة الروشتة هنا فوراً عبر <strong>Ctrl + V</strong>
          </div>
        )}

        {/* قسم الدليفري والتوصيل */}
        {invoiceType === 'delivery' && (
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.35)' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#a78bfa', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Bike size={14} />
              تفاصيل التوصيل (دليفري)
            </div>
            <input
              type="text"
              placeholder="عنوان العميل بالتفصيل..."
              value={deliveryDetails.address}
              onChange={(e) => updateWindowDeliveryDetails(windowId, { address: e.target.value, isDelivery: true })}
              style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--surface, #0f172a)', color: '#fff', fontSize: '11.5px', marginBottom: '6px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="اسم الطيار..."
                value={deliveryDetails.pilotName}
                onChange={(e) => updateWindowDeliveryDetails(windowId, { pilotName: e.target.value, isDelivery: true })}
                style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--surface, #0f172a)', color: '#fff', fontSize: '11.5px' }}
              />
              <input
                type="number"
                placeholder="التوصيل ج.م"
                value={deliveryDetails.deliveryFee || ''}
                onChange={(e) => updateWindowDeliveryDetails(windowId, { deliveryFee: parseFloat(e.target.value) || 0, isDelivery: true })}
                style={{ width: '75px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'var(--surface, #0f172a)', color: '#fff', fontSize: '11.5px' }}
              />
            </div>
          </div>
        )}

        {/* صندوق الإجماليات والخصم المزدوج */}
        <div className="pos-totals-box">
          <div className="pos-total-row">
            <span>المجموع الفرعي:</span>
            <span>{subtotal.toFixed(2)} ج</span>
          </div>

          {/* الخصم المزدوج (% أو ج.م) */}
          <div className="pos-total-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>الخصم:</span>
              <button
                type="button"
                onClick={() => setDiscountType((prev) => (prev === 'fixed' ? 'percent' : 'fixed'))}
                style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'var(--surface-hover, rgba(255,255,255,0.1))',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  color: 'var(--text, #ffffff)',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                title="انقر للتبديل بين نسبة مئوية % ومبلغ قطعي ج.م"
              >
                {discountType === 'percent' ? '% نسبة' : 'ج.م قطعي'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input
                type="number"
                min="0"
                max={discountType === 'percent' ? '100' : subtotal}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                style={{
                  width: '65px',
                  textAlign: 'left',
                  padding: '2px 6px',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  background: 'var(--surface, #0f172a)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              {calculatedDiscount > 0 && (
                <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 700 }}>
                  (-{calculatedDiscount.toFixed(2)} ج)
                </span>
              )}
            </div>
          </div>

          {deliveryFee > 0 && (
            <div className="pos-total-row" style={{ color: '#a78bfa' }}>
              <span>خدمة التوصيل:</span>
              <span>+{deliveryFee.toFixed(2)} ج</span>
            </div>
          )}

          {walletDeducted > 0 && (
            <div className="pos-total-row" style={{ color: '#10b981' }}>
              <span>خصم من رصيد المحفظة:</span>
              <span>-{walletDeducted.toFixed(2)} ج</span>
            </div>
          )}

          {totalCommissions > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="pos-spiff-badge">
                <Zap size={12} />
                عمولة الكاشير اللحظية
              </span>
              <span style={{ fontWeight: 800, color: '#10b981', fontSize: '13px' }}>
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
        {/* ⚡ الزر الخارق: إنهاء فوري بدون ريسيت (< 1 ثانية) */}
        <button
          type="button"
          className="pos-instant-checkout-btn"
          disabled={cart.length === 0 || isQuickCheckingOut}
          onClick={handleQuickCheckoutWithoutReceipt}
          title="إنهاء فوري نقدي بدون طباعة ريسيت وتفريغ السلة فوراً (Shift + Enter)"
        >
          <Zap size={22} className={isQuickCheckingOut ? 'pos-spin-icon' : ''} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
            <span style={{ fontSize: '14px', fontWeight: 900 }}>
              {isQuickCheckingOut ? 'جاري الإنهاء اللحظي...' : '⚡ بيع سريع بدون ريسيت'}
            </span>
            <span style={{ fontSize: '11px', opacity: 0.9, fontWeight: 700 }}>
              نقدي فوري [Shift + Enter]
            </span>
          </div>
        </button>

        <button
          type="button"
          className="pos-pay-fast-btn"
          disabled={cart.length === 0}
          onClick={() => handleOpenPayment('cash')}
        >
          <Banknote size={20} />
          <span>دفع نقدي بالريسيت [F5]</span>
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

      {/* مودال تكبير صورة الروشتة */}
      {isRxImageZoomed && rxImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setIsRxImageZoomed(false)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={rxImage} alt="Prescription Full" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
            <button
              type="button"
              onClick={() => setIsRxImageZoomed(false)}
              style={{
                position: 'absolute',
                top: '-15px',
                right: '-15px',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ── مودال إضافة صنف حر غير مكود يدوياً (Uncoded Item Modal) ── */}
      {isUncodedModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsUncodedModalOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--surface, #0f172a)',
              border: '1.5px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(15, 23, 42, 0.8))',
                borderBottom: '1px solid rgba(245, 158, 11, 0.3)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f59e0b'
                  }}
                >
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#f8fafc' }}>
                    إدراج صنف حر / غير مكود
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    للأدوية والمستلزمات والتركيبات التي لم تُسجل بالباركود بعد [Ctrl + M]
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUncodedModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddUncodedItem} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                  اسم الصنف الدوائي / المستلزم <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثال: شاش معقم 10*10، تركيبة مرهم كبريت، قطن طبي 200 جم..."
                  value={uncodedForm.name}
                  onChange={(e) => setUncodedForm({ ...uncodedForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1.5px solid rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                    سعر البيع للجمهور (ج.م) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    placeholder="0.00"
                    value={uncodedForm.price}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, price: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1.5px solid rgba(13, 148, 136, 0.4)',
                      color: '#2dd4bf',
                      fontSize: '15px',
                      fontWeight: 900,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                    سعر التكلفة التقديري (ج.م)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="افتراضي: 75% من البيع"
                    value={uncodedForm.costPrice}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, costPrice: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                    الكمية
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={uncodedForm.qty}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, qty: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                    الوحدة
                  </label>
                  <select
                    value={uncodedForm.unit}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, unit: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#1e293b',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="علبة">علبة</option>
                    <option value="شريط">شريط</option>
                    <option value="قرص">قرص</option>
                    <option value="أمبول">أمبول</option>
                    <option value="قارورة">قارورة</option>
                    <option value="أنبوبة">أنبوبة</option>
                    <option value="كيس">كيس</option>
                    <option value="قطعة">قطعة</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#cbd5e1', marginBottom: '6px' }}>
                    نوع الفاتورة
                  </label>
                  <select
                    value={uncodedForm.itemType}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, itemType: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#1e293b',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="otc">🟢 OTC لا وصفي</option>
                    <option value="rx">💊 روشتة Rx</option>
                    <option value="customer_order">📋 طلب عميل</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsUncodedModalOpen(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء [Esc]
                </button>

                <button
                  type="submit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)'
                  }}
                >
                  <PackagePlus size={16} />
                  <span>إدراج الصنف للفاتورة [Enter]</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
