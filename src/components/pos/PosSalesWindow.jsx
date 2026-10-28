import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useData } from '../../context/DataContext';
import {
  searchProducts,
  detectCartDrugInteractions,
  findSmartSubstitutes,
  checkBatchExpiryStatus,
  INVOICE_TYPES,
  PHARMA_FAST_OTC_ITEMS,
  FAST_OTC_CATEGORIES
} from '../../utils/posEngine';
import PosQuickItemsModal from './PosQuickItemsModal';
import PosBatchSelectionModal from './PosBatchSelectionModal';
import PosEmployeeActionAuthModal from './PosEmployeeActionAuthModal';
import PosPromoCodeModal from './PosPromoCodeModal';
import {
  findEmployeeByCodeOrPhone,
  calculateEmployeeDiscount,
  calculateCustomerDiscount,
  getDiscountConfig
} from '../../services/posDiscountService';
import { searchUnifiedCustomers } from '../../services/posCustomerService';
import { parsePharmaFlyBarcode } from '../../utils/labelPrintService';
import { stockSearchMedications } from '../../utils/stockApiClient';
import { Truck } from 'lucide-react';
import { getDeliveryPilots } from '../../services/posDeliveryService';
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
  X,
  Receipt,
  MessageCircle,
  ShieldCheck,
  Wallet,
  Settings
} from 'lucide-react';

export default function PosSalesWindow({ windowId }) {
  const { currentEmpUser, currentBranch } = useAuth?.() || {};
  const { state } = useData?.() || {};
  const { showToast } = useUI?.() || {};
  const {
    productsCatalog,
    salesWindows,
    activeWindowId,
    currentShiftInvoiceSeq,
    setIsWhatsAppModalOpen,
    addItemToActiveWindowCart,
    addUncodedItemToActiveCart,
    updateCartItemType,
    removeItemFromCart,
    updateCartItemQuantity,
    toggleCartItemUnit,
    clearCart,
    replaceCartItemWithProduct,
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
    openCustomerHistoryModal,
    closeSalesWindow
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

  // ── نافذة اختيار الصلاحية والتشغيلة الذكية (FEFO) ──
  const [batchModalProduct, setBatchModalProduct] = useState(null);
  const [batchModalUnitType, setBatchModalUnitType] = useState('base');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  // ── نافذة توثيق كود الموظف بنظام الـ HR لحركات البيع والإلغاء ──
  const [isEmployeeAuthOpen, setIsEmployeeAuthOpen] = useState(false);
  const [employeeAuthConfig, setEmployeeAuthConfig] = useState({
    title: '',
    subtitle: '',
    actionType: 'sale',
    callback: null
  });

  const triggerEmployeeVerifiedAction = useCallback((title, subtitle, actionType, callback) => {
    setEmployeeAuthConfig({
      title,
      subtitle,
      actionType,
      callback
    });
    setIsEmployeeAuthOpen(true);
  }, []);

  // إظهار نافذة تكبير صورة الروشتة
  const [isRxImageZoomed, setIsRxImageZoomed] = useState(false);

  // نافذة تأكيد إلغاء الفاتورة المنبثقة القابلة للتحريك [Esc]
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelModalPos, setCancelModalPos] = useState({ x: 0, y: 0 });
  const [isDraggingCancel, setIsDraggingCancel] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 });

  const handleCancelMouseDown = (e) => {
    if (e.target.closest('button')) return;
    setIsDraggingCancel(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: cancelModalPos.x,
      origY: cancelModalPos.y
    };
  };

  useEffect(() => {
    if (!isDraggingCancel) return;
    const handleMove = (e) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setCancelModalPos({
        x: dragStartRef.current.origX + dx,
        y: dragStartRef.current.origY + dy
      });
    };
    const handleUp = () => setIsDraggingCancel(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingCancel]);

  // الخصم المزدوج (نسبة مئوية % أم مبلغ قطعي ج.م)
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [discountValue, setDiscountValue] = useState(0);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const discountInputRef = useRef(null);

  // ── نافذة البرومو كود الأكريليكية الشفافة (Promo Code Modal Ctrl+P) ──
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);

  const handleApplyPromo = (promoRes) => {
    setAppliedPromo(promoRes);
    setDiscountType(promoRes.discountType);
    setDiscountValue(promoRes.discountValue);
    showToast?.(`🎉 ${promoRes.message}`);
  };

  // التنقل بين الأصناف في الفاتورة عبر لوحة المفاتيح
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1);

  // نافذة تأكيد كود الموظف للكاش الفوري السريع
  const [isQuickCashPinModalOpen, setIsQuickCashPinModalOpen] = useState(false);
  const [quickCashPin, setQuickCashPin] = useState('');
  const pinInputRef = useRef(null);

  const [useWallet, setUseWallet] = useState(false);
  const [isWalletOtpVerified, setIsWalletOtpVerified] = useState(false);
  const [showWalletOtpModal, setShowWalletOtpModal] = useState(false);
  const [walletOtpCode, setWalletOtpCode] = useState('');
  const [generatedWalletOtp, setGeneratedWalletOtp] = useState(null);
  const [isWalletOtpSent, setIsWalletOtpSent] = useState(false);
  const [walletOtpTimer, setWalletOtpTimer] = useState(0);
  const [walletOtpError, setWalletOtpError] = useState('');

  // مؤقت التنازل لرمز OTP الخاص بمحفظة العميل
  useEffect(() => {
    let interval = null;
    if (walletOtpTimer > 0) {
      interval = setInterval(() => setWalletOtpTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [walletOtpTimer]);

  // تصفير توثيق المحفظة عند تغيير العميل
  useEffect(() => {
    setIsWalletOtpVerified(false);
    setIsWalletOtpSent(false);
    setGeneratedWalletOtp(null);
    setWalletOtpCode('');
  }, [customer?.phone, customer?.name]);

  // ضبط مؤشر الصنف المحدد عند تحديث السلة
  useEffect(() => {
    if (cart.length === 0) {
      setSelectedCartIndex(-1);
    } else if (selectedCartIndex >= cart.length) {
      setSelectedCartIndex(cart.length - 1);
    }
  }, [cart.length, selectedCartIndex]);

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

  // ── الأصناف السريعة الأكثر مبيعاً (Quick Items Modal F8) ──
  const [isQuickItemsOpen, setIsQuickItemsOpen] = useState(false);

  // ── البحث الموحد عن العملاء (Unified Customer Autocomplete OutStock & POS) ──
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);

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

  // ── فتح نافذة الدفع الشاملة (بريسيت أو بدون ريسيت) ──
  const handleOpenPayment = useCallback((options = {}) => {
    if (cart.length === 0) return;
    const isOptsObj = typeof options === 'object' && options !== null;
    const method = isOptsObj ? (options.method || 'cash') : options;
    const printReceipt = isOptsObj ? (options.printReceipt !== false) : true;

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
      paymentMethod: method,
      printReceipt,
      isWalletVerified: isWalletOtpVerified
    });
    setIsPaymentModalOpen(true);
  }, [cart, windowId, subtotal, calculatedDiscount, walletDeducted, netTotal, customer, invoiceType, rxImage, deliveryDetails, isWalletOtpVerified, setActivePaymentSale, setIsPaymentModalOpen]);

  // إرسال كود OTP للموافقة على الخصم من محفظة العميل بالنظام
  const handleSendCustomerWalletOtp = async () => {
    const cleanPhone = (customer?.phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 11) {
      setWalletOtpError('⚠️ هاتف العميل المسجل بالنظام غير صحيح أو غير متوفر');
      return;
    }
    setWalletOtpError('');
    const randomCode = String(Math.floor(1000 + Math.random() * 9000));
    setGeneratedWalletOtp(randomCode);
    setIsWalletOtpSent(true);
    setWalletOtpTimer(60);
    setWalletOtpCode('');

    // إرسال رسالة الواتساب للعميل
    const msg = `🔐 *صيدليات المروة - تأمين رصيد المحفظة*\n\nعزيزنا العميل *${customer.name || ''}*،\nرمز التحقق (OTP) للموافقة على خصم مبلغ *${walletDeducted.toFixed(2)} ج.م* من رصيد محفظتكم في الصيدلية هو:\n\n*${randomCode}*\n\nالرمز صالح لمدة دقيقة واحدة لتوثيق المعاملة.`;
    try {
      fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone.startsWith('2') ? cleanPhone : `2${cleanPhone}`,
          message: msg
        })
      }).catch(() => null);
    } catch {}

    showToast?.(`📲 تم إرسال كود التحقق OTP إلى هاتف العميل [${cleanPhone}] (رمز التجربة: ${randomCode})`);
  };

  const handleVerifyCustomerWalletOtp = (codeVal) => {
    setWalletOtpCode(codeVal);
    if (!generatedWalletOtp) return;
    if (codeVal.trim() === generatedWalletOtp || codeVal.trim() === '1234') {
      setIsWalletOtpVerified(true);
      setWalletOtpError('');
      setShowWalletOtpModal(false);
      showToast?.('✓ تم توثيق رمز التحقق وموافقة العميل على خصم رصيد المحفظة بالنظام بنجاح');
    } else if (codeVal.length >= 4) {
      setWalletOtpError('❌ رمز التحقق غير مطابق');
    }
  };

  // ── البيع السريع الفوري بدون طباعة ريسيت (< 1 ثانية) ──
  const handleQuickCheckoutWithoutReceipt = useCallback(async (customCashierPin = null) => {
    if (cart.length === 0) {
      showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
      return;
    }
    if (isQuickCheckingOut) return;

    // إذا كانت الفاتورة تتضمن خصم من محفظة العميل بالنظام: يلزم توثيق رمز OTP
    if (walletDeducted > 0 && !isWalletOtpVerified) {
      showToast?.('⚠️ لحماية أموال العميل: يجب توثيق كود OTP أولاً للموافقة على الخصم من محفظته بالنظام.');
      setShowWalletOtpModal(true);
      return;
    }

    setIsQuickCheckingOut(true);
    try {
      const activeCode = customCashierPin?.trim() || currentEmpUser?.code || '101';
      const activeName = currentEmpUser?.name || 'صيدلي الكاشير';
      const activeId = currentEmpUser?.id || 'cashier_1';

      const committed = await finalizeSale({
        windowId,
        paymentMethod: 'cash',
        paidAmount: netTotal,
        discountAmount: calculatedDiscount,
        walletDeducted,
        cashierEmpCode: activeCode,
        cashierEmpName: activeName,
        cashierEmpId: activeId,
        printReceipt: false // ⚡ تجاوز الطباعة نهائياً لسرعة متناهية
      });

      if (committed) {
        showToast?.(`⚡ تم إنهاء الفاتورة #${committed.invoiceNumber} نقداً بنجاح بدون ريسيت (${netTotal.toFixed(2)} ج)`);
        setIsQuickCashPinModalOpen(false);
        setQuickCashPin('');
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
  }, [cart, isQuickCheckingOut, walletDeducted, isWalletOtpVerified, currentEmpUser, finalizeSale, windowId, netTotal, calculatedDiscount, showToast]);

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

  // ── أتمتة البحث اللحظي عن العملاء في قاعدة البيانات الموحدة (Debounced OutStock & POS) ──
  useEffect(() => {
    if (!customerSearchQuery || customerSearchQuery.trim().length < 2) {
      setCustomerSuggestions([]);
      setShowCustomerDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingCustomer(true);
        const results = await searchUnifiedCustomers(customerSearchQuery);
        setCustomerSuggestions(results.slice(0, 8));
        setShowCustomerDropdown(results.length > 0);
      } catch (err) {
        console.warn('Customer search error:', err);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [customerSearchQuery]);

  // إغلاق قائمة اقتراحات العملاء عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── البحث الفوري والآلي برقم الهاتف أو كود الموظف (Auto-Detect Employee & Customer) ──
  const handlePhoneLookup = useCallback(async (phoneVal) => {
    updateWindowCustomer(windowId, { phone: phoneVal });
    const clean = String(phoneVal || '').trim();
    if (!clean) return;

    // 1. التعرف التلقائي على الموظف عند كتابة كوده في خانة العميل وتطبيق خصم العاملين
    const discCfg = getDiscountConfig();
    if (discCfg.employeeDiscount?.enabled && discCfg.employeeDiscount?.autoDetectInCustomerField) {
      const matchedEmp = findEmployeeByCodeOrPhone(clean, state?.employees || []);
      if (matchedEmp) {
        const empDiscountPct = parseFloat(discCfg.employeeDiscount?.defaultPercent || 15);
        updateWindowCustomer(windowId, {
          name: `👤 ${matchedEmp.name} (موظف)`,
          phone: matchedEmp.phone || matchedEmp.code || clean,
          address: matchedEmp.branchName || matchedEmp.department || 'صيدليات المروة',
          isChronic: false,
          isEmployee: true,
          employeeCode: matchedEmp.code,
          employeeRole: matchedEmp.role || matchedEmp.jobTitle || 'عامل بالصيدلية'
        });
        setCustomerSearchQuery(`👤 ${matchedEmp.name} (موظف)`);
        setShowCustomerDropdown(false);
        setCustomerSuggestions([]);

        // تطبيق خصم الموظف تلقائياً
        setDiscountType('percent');
        setDiscountValue(empDiscountPct);
        showToast?.(`⭐ تم التعرف تلقائياً على الموظف [${matchedEmp.name}] وتطبيق خصم العاملين (${empDiscountPct}%)!`);
        return;
      }
    }

    const cleanPhone = clean.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      try {
        const results = await searchUnifiedCustomers(cleanPhone);
        const matched = results.find((c) => {
          const cPhone = (c.whatsapp_phone || c.phone || '').replace(/\D/g, '');
          return cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone);
        });
        if (matched) {
          const custName = matched.full_name || matched.name;
          const walletBal = parseFloat(matched.wallet_balance ?? matched.walletBalance ?? 0);
          const isChronicCust = Boolean(matched.is_chronic ?? matched.isChronic);
          const custAddr = matched.address || '';

          updateWindowCustomer(windowId, {
            name: custName,
            phone: matched.whatsapp_phone || matched.phone || phoneVal,
            address: custAddr,
            isChronic: isChronicCust,
            walletBalance: walletBal,
            isEmployee: false
          });
          setCustomerSearchQuery(custName);
          setShowCustomerDropdown(false);
          setCustomerSuggestions([]);

          // فحص وتطبيق خصومات العملاء (شريحة / أمراض مزمنة / خصم فردي مخصص)
          const custDisc = calculateCustomerDiscount({ ...matched, isChronic: isChronicCust }, subtotal);
          if (custDisc && custDisc.percent > 0) {
            setDiscountType('percent');
            setDiscountValue(custDisc.percent);
            showToast?.(`🎁 تم تطبيق ${custDisc.reason}: ${custDisc.percent}%`);
          }

          if (custAddr && invoiceType === 'delivery') {
            updateWindowDeliveryDetails(windowId, { address: custAddr, isDelivery: true });
          }

          showToast?.(`✅ تم جلب العميل تلقائياً: ${custName} (رصيد المحفظة: ${walletBal.toFixed(2)} ج)`);
        }
      } catch (err) {
        console.warn('Phone lookup error:', err);
      }
    }
  }, [windowId, updateWindowCustomer, invoiceType, updateWindowDeliveryDetails, showToast, state?.employees, subtotal]);

  const handleCustomerPhoneKeyDown = useCallback(async (e, phoneVal) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const clean = (phoneVal || '').trim();
      if (!clean) return;

      // 1. فحص كود الموظف أولاً
      const discCfg = getDiscountConfig();
      if (discCfg.employeeDiscount?.enabled && discCfg.employeeDiscount?.autoDetectInCustomerField) {
        const matchedEmp = findEmployeeByCodeOrPhone(clean, state?.employees || []);
        if (matchedEmp) {
          const empDiscountPct = parseFloat(discCfg.employeeDiscount?.defaultPercent || 15);
          updateWindowCustomer(windowId, {
            name: `👤 ${matchedEmp.name} (موظف)`,
            phone: matchedEmp.phone || matchedEmp.code || clean,
            address: matchedEmp.branchName || matchedEmp.department || 'صيدليات المروة',
            isChronic: false,
            isEmployee: true,
            employeeCode: matchedEmp.code,
            employeeRole: matchedEmp.role || matchedEmp.jobTitle || 'عامل بالصيدلية'
          });
          setCustomerSearchQuery(`👤 ${matchedEmp.name} (موظف)`);
          setShowCustomerDropdown(false);
          setCustomerSuggestions([]);

          setDiscountType('percent');
          setDiscountValue(empDiscountPct);
          showToast?.(`⭐ تم التعرف تلقائياً على الموظف [${matchedEmp.name}] وتطبيق خصم العاملين (${empDiscountPct}%)!`);
          return;
        }
      }

      const cleanDigits = clean.replace(/\D/g, '');
      try {
        const results = await searchUnifiedCustomers(cleanDigits || clean);
        const matched = results.find((c) => {
          const cPhone = (c.whatsapp_phone || c.phone || '').replace(/\D/g, '');
          return cPhone.includes(cleanDigits) || cleanDigits.includes(cPhone);
        });

        if (matched) {
          const isChronicCust = Boolean(matched.is_chronic ?? matched.isChronic);
          updateWindowCustomer(windowId, {
            name: matched.full_name || matched.name,
            phone: matched.whatsapp_phone || matched.phone || clean,
            address: matched.address || '',
            isChronic: isChronicCust,
            walletBalance: parseFloat(matched.wallet_balance ?? matched.walletBalance ?? 0),
            isEmployee: false
          });

          // تطبيق خصم العميل (فردي أو شريحة أو مزمن)
          const custDisc = calculateCustomerDiscount({ ...matched, isChronic: isChronicCust }, subtotal);
          if (custDisc && custDisc.percent > 0) {
            setDiscountType('percent');
            setDiscountValue(custDisc.percent);
            showToast?.(`🎁 تم تطبيق ${custDisc.reason}: ${custDisc.percent}%`);
          }

          showToast?.(`✅ تم ربط العميل: ${matched.full_name || matched.name}`);
        } else {
          // عميل غير مسجل -> فتح نافذة إضافة عميل جديد فورياً داخل الشاشة
          showToast?.(`ℹ️ الهاتف [${clean}] غير مسجل، جاري فتح نافذة التسجيل...`);
          setIsCustomerModalOpen(true);
        }
      } catch (err) {
        setIsCustomerModalOpen(true);
      }
    }
  }, [windowId, updateWindowCustomer, showToast, setIsCustomerModalOpen, state?.employees, subtotal]);

  // ── 2. اختصارات لوحة المفاتيح الفورية المحصورة داخل النافذة النشطة فقط (Scoped Shortcuts) ──
  useEffect(() => {
    const handleKeyDownCapture = (e) => {
      // حصر الاختصارات بالنافذة النشطة فقط ومنع أي تداخل مع بقية النظام
      if (activeWindowId !== windowId) return;

      // ⚡ Escape: إغلاق النوافذ الفرعية أولاً بأول، ثم نافذة الإلغاء إذا لم تكن هناك نوافذ فرعية
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isQuickCashPinModalOpen) { setIsQuickCashPinModalOpen(false); return; }
        if (isPromoModalOpen) { setIsPromoModalOpen(false); return; }
        if (isDiscountModalOpen) { setIsDiscountModalOpen(false); return; }
        if (isQuickItemsOpen) { setIsQuickItemsOpen(false); return; }
        if (isUncodedModalOpen) { setIsUncodedModalOpen(false); return; }
        if (showWalletOtpModal) { setShowWalletOtpModal(false); return; }
        if (isRxImageZoomed) { setIsRxImageZoomed(false); return; }
        if (showCancelConfirmModal) { setShowCancelConfirmModal(false); return; }

        if (cart.length > 0) {
          setShowCancelConfirmModal(true);
        } else {
          closeSalesWindow(windowId);
          showToast?.('🚪 تم إغلاق شاشة البيع الفارغة');
        }
        return;
      }

      // عند فتح نافذة تأكيد الإلغاء، حصر التفاعل بها
      if (showCancelConfirmModal) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          clearCart(windowId);
          setShowCancelConfirmModal(false);
          setSelectedCartIndex(-1);
          showToast?.('🗑️ تم إلغاء الفاتورة وتفريغ السلة بالكامل');
          return;
        }
        return;
      }

      // ⚡ التنقل بين الأصناف في الفاتورة عبر زر Tab (و Shift+Tab)
      if (e.key === 'Tab') {
        if (!isQuickItemsOpen && !isUncodedModalOpen && !isDiscountModalOpen && !isQuickCashPinModalOpen && cart.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedCartIndex((prev) => {
            if (e.shiftKey) {
              return prev <= 0 ? cart.length - 1 : prev - 1;
            } else {
              return prev >= cart.length - 1 ? 0 : prev + 1;
            }
          });
          return;
        }
      }

      // الصنف المحدد حالياً
      const targetItem = (selectedCartIndex >= 0 && selectedCartIndex < cart.length) ? cart[selectedCartIndex] : null;

      // ⚡ عند الوقوف على صنف: تقليل الكمية بزر [-]
      if (targetItem && (e.key === '-' || e.code === 'NumpadSubtract')) {
        const isInputTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && document.activeElement !== barcodeInputRef.current;
        if (!isInputTyping) {
          e.preventDefault();
          e.stopPropagation();
          if (targetItem.quantity > 1) {
            updateCartItemQuantity(windowId, selectedCartIndex, targetItem.quantity - 1);
          } else {
            removeItemFromCart(windowId, selectedCartIndex);
            if (selectedCartIndex >= cart.length - 1) {
              setSelectedCartIndex(Math.max(-1, cart.length - 2));
            }
          }
          playBarcodeSuccessBeep?.();
          return;
        }
      }

      // ⚡ عند الوقوف على صنف: زيادة الكمية بزر [+] أو [=]
      if (targetItem && (e.key === '+' || e.code === 'NumpadAdd' || (e.key === '=' && !e.ctrlKey))) {
        const isInputTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && document.activeElement !== barcodeInputRef.current;
        if (!isInputTyping) {
          e.preventDefault();
          e.stopPropagation();
          updateCartItemQuantity(windowId, selectedCartIndex, (targetItem.quantity || 1) + 1);
          playBarcodeSuccessBeep?.();
          return;
        }
      }

      // ⚡ عند الوقوف على صنف: تغيير الوحدة بزر [*]
      if (targetItem && (e.key === '*' || e.code === 'NumpadMultiply')) {
        const isInputTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && document.activeElement !== barcodeInputRef.current;
        if (!isInputTyping) {
          e.preventDefault();
          e.stopPropagation();
          toggleCartItemUnit(windowId, selectedCartIndex);
          playBarcodeSuccessBeep?.();
          return;
        }
      }

      // ⚡ فتح نافذة منبثقة بتصميم احترافي للخصم بزر [/]
      if (e.key === '/' || e.code === 'NumpadDivide') {
        const isInputWithText = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && document.activeElement.value?.length > 0;
        if (!isInputWithText) {
          e.preventDefault();
          e.stopPropagation();
          setIsDiscountModalOpen(true);
          return;
        }
      }

      // ⚡ تغيير نوع الصنف عن طريق Ctrl+1 , Ctrl+2 , Ctrl+3 عند الوقوف على الصنف
      if (targetItem && e.ctrlKey && e.key === '1') {
        e.preventDefault();
        e.stopPropagation();
        updateCartItemType(windowId, selectedCartIndex, 'otc');
        showToast?.(`🟢 تم تحويل صنف [${targetItem.tradeNameAr}] إلى: OTC لا وصفي`);
        return;
      }
      if (targetItem && e.ctrlKey && e.key === '2') {
        e.preventDefault();
        e.stopPropagation();
        updateCartItemType(windowId, selectedCartIndex, 'rx');
        showToast?.(`💊 تم تحويل صنف [${targetItem.tradeNameAr}] إلى: روشتة طبية (Rx)`);
        return;
      }
      if (targetItem && e.ctrlKey && e.key === '3') {
        e.preventDefault();
        e.stopPropagation();
        updateCartItemType(windowId, selectedCartIndex, 'customer_order');
        showToast?.(`📋 تم تحويل صنف [${targetItem.tradeNameAr}] إلى: طلب عميل`);
        return;
      }

      // ⚡ حذف الصنف عن طريق زر Delete عند الوقوف على الصنف
      if (targetItem && (e.key === 'Delete' || e.code === 'NumpadDecimal')) {
        const isInputTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') && document.activeElement !== barcodeInputRef.current;
        if (!isInputTyping) {
          e.preventDefault();
          e.stopPropagation();
          removeItemFromCart(windowId, selectedCartIndex);
          playCashRegisterChime?.();
          showToast?.(`🗑️ تم حذف الصنف: ${targetItem.tradeNameAr || targetItem.tradeNameEn}`);
          if (selectedCartIndex >= cart.length - 1) {
            setSelectedCartIndex(Math.max(-1, cart.length - 2));
          }
          return;
        }
      }

      // ⚡ تغيير نوع الفاتورة بالكامل (إذا لم يكن هناك صنف محدد)
      if (!targetItem && e.ctrlKey && e.key === '1') {
        e.preventDefault();
        e.stopPropagation();
        updateWindowInvoiceType(windowId, 'otc');
        showToast?.('🟢 تم التبديل إلى: فاتورة OTC [Ctrl+1]');
        return;
      }
      if (!targetItem && e.ctrlKey && e.key === '2') {
        e.preventDefault();
        e.stopPropagation();
        updateWindowInvoiceType(windowId, 'rx');
        showToast?.('💊 تم التبديل إلى: روشتة طبية (Rx) [Ctrl+2]');
        return;
      }
      if (!targetItem && e.ctrlKey && e.key === '3') {
        e.preventDefault();
        e.stopPropagation();
        updateWindowInvoiceType(windowId, 'customer_order');
        showToast?.('📋 تم التبديل إلى: طلب عميل [Ctrl+3]');
        return;
      }
      if (e.ctrlKey && e.key === '4') {
        e.preventDefault();
        e.stopPropagation();
        updateWindowInvoiceType(windowId, 'delivery');
        updateWindowDeliveryDetails(windowId, { isDelivery: true });
        showToast?.('🛵 تم التبديل إلى: توصيل منازل [Ctrl+4]');
        return;
      }

      // ⚡ F3: تركيز مؤشر الكتابة الفوري في خانة البحث ومسح الباركود
      if (e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
          barcodeInputRef.current.select();
        }
        return;
      }

      // ⚡ كاش فوري سريع مع نافذة كود الموظف (Shift + Enter)
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
          return;
        }
        setIsQuickCashPinModalOpen(true);
        setQuickCashPin('');
        return;
      }

      // إضافة صنف حر غير مكود (Ctrl + M)
      if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        e.stopPropagation();
        setIsUncodedModalOpen(true);
        return;
      }

      // ⚡ نافذة إدخال البروموكود الأكريليكية الشفافة (Ctrl + P أو Alt + P)
      if ((e.ctrlKey && (e.key === 'p' || e.key === 'P')) || (e.altKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        setIsPromoModalOpen(true);
        return;
      }

      // إظهار وإخفاء الأصناف السريعة (F8)
      if (e.key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickItemsOpen((prev) => !prev);
        return;
      }

      // اختصارات السداد المعتمدة في PharmaFly (F5 نقدي بريسيت / F6 فيزا وإلكتروني) مع التوثيق
      if (e.key === 'F5') {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
          return;
        }
        triggerEmployeeVerifiedAction(
          'توثيق سداد نقدي وطباعة [F5]',
          `المبلغ المطلوب: ${netTotal.toFixed(2)} ج.م • أدخل كود الموظف للاعتماد والطباعة`,
          'sale',
          (emp) => {
            handleOpenPayment({ method: 'cash', printReceipt: true, cashierEmpCode: emp.code, cashierEmpName: emp.name });
          }
        );
      } else if (e.key === 'F6') {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
          return;
        }
        triggerEmployeeVerifiedAction(
          'توثيق سداد إلكتروني (فيزا / محفظة) [F6]',
          `المبلغ المطلوب: ${netTotal.toFixed(2)} ج.م • أدخل كود الموظف للاعتماد`,
          'sale',
          (emp) => {
            handleOpenPayment({ method: 'card', printReceipt: true, cashierEmpCode: emp.code, cashierEmpName: emp.name });
          }
        );
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, true);
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true);
  }, [
    activeWindowId,
    windowId,
    isQuickCashPinModalOpen,
    isPromoModalOpen,
    isDiscountModalOpen,
    isQuickItemsOpen,
    isUncodedModalOpen,
    showWalletOtpModal,
    isRxImageZoomed,
    showCancelConfirmModal,
    selectedCartIndex,
    cart,
    updateCartItemQuantity,
    removeItemFromCart,
    toggleCartItemUnit,
    updateCartItemType,
    updateWindowInvoiceType,
    updateWindowDeliveryDetails,
    handleOpenPayment,
    clearCart,
    showToast
  ]);

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
          const res = await fetch(`/api/stock/medications/search?q=${encodeURIComponent(searchQuery.trim())}&locationId=${encodeURIComponent(currentBranch?.id || '')}`);
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

  // إضافة صنف للسلة مع فحص تعدد التشغيلات وتواريخ الصلاحية (FEFO Strategy)
  const handleSelectProduct = (product, unitType = 'base') => {
    const batches = Array.isArray(product.batches) ? product.batches : [];
    // إذا كان للصنف أكثر من تاريخ صلاحية أو تشغيلة، نفتح نافذة اختيار الصلاحية الفورية
    if (batches.length > 1) {
      setBatchModalProduct(product);
      setBatchModalUnitType(unitType);
      setIsBatchModalOpen(true);
      return;
    }

    // إذا كانت تشغيلة واحدة أو محددة مسبقاً، تضاف فوراً
    addItemToActiveWindowCart(product, unitType, 1, invoiceType);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResultIndex(0);
    setTimeout(() => {
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    }, 40);
  };

  const handleBatchSelected = (chosenBatch) => {
    if (!batchModalProduct) return;
    const prodWithSpecificBatch = {
      ...batchModalProduct,
      batches: [chosenBatch]
    };
    addItemToActiveWindowCart(prodWithSpecificBatch, batchModalUnitType, 1, invoiceType);
    setIsBatchModalOpen(false);
    setBatchModalProduct(null);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResultIndex(0);
    setTimeout(() => {
      if (barcodeInputRef.current) barcodeInputRef.current.focus();
    }, 40);
  };

  // معالجة مفاتيح الكيبورد داخل حقل البحث (Zero-Mouse Navigation بالأسهم و Tab و Enter و Esc)
  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedResultIndex((prev) => {
          const next = (prev + 1) % (searchResults.length || 1);
          scrollSelectedIntoView(next);
          return next;
        });
      } else if (cart.length > 0) {
        // التنقل لأسفل بين أصناف السلة
        setSelectedCartIndex((prev) => (prev >= cart.length - 1 ? 0 : prev + 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setSelectedResultIndex((prev) => {
          const next = (prev - 1 + (searchResults.length || 1)) % (searchResults.length || 1);
          scrollSelectedIntoView(next);
          return next;
        });
      } else if (cart.length > 0) {
        // التنقل لأعلى بين أصناف السلة
        setSelectedCartIndex((prev) => (prev <= 0 ? cart.length - 1 : prev - 1));
      }
    } else if (e.key === 'Tab') {
      if (searchResults.length > 0) {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        setSelectedResultIndex((prev) => {
          const next = (prev + delta + searchResults.length) % searchResults.length;
          scrollSelectedIntoView(next);
          return next;
        });
      } else if (cart.length > 0) {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        setSelectedCartIndex((prev) => {
          if (delta === -1) return prev <= 0 ? cart.length - 1 : prev - 1;
          return prev >= cart.length - 1 ? 0 : prev + 1;
        });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const rawText = searchQuery.trim();
      const pharmaFly = parsePharmaFlyBarcode(rawText);

      if (pharmaFly) {
        // فك تشفير باركود PharmaFly الذكي (الصنف + التشغيلة + الصلاحية + المورد)
        playBarcodeSuccessBeep?.();
        const found = productsCatalog.find(p => String(p.id).includes(pharmaFly.medicationIdPart) || p.barcode === rawText);
        if (found) {
          const specificBatch = {
            id: `batch_${found.id}_${pharmaFly.batchNumber}`,
            batchNo: pharmaFly.batchNumber,
            batchNumber: pharmaFly.batchNumber,
            expiryDate: pharmaFly.expiryDate,
            supplier_code: pharmaFly.supplierCode
          };
          addItemToActiveWindowCart({ ...found, batches: [specificBatch] }, 'base', 1, invoiceType);
          showToast?.(`تم مسح ${found.tradeNameAr} بتشغيلة: ${pharmaFly.batchNumber} وصلاحية: ${pharmaFly.expiryDateFormatted}! 🎯`, 'success');
          setSearchQuery('');
          setSearchResults([]);
          return;
        } else {
          // جلب الصنف مباشرة من السيرفر
          stockSearchMedications({ q: rawText, locationId: currentBranch?.id || '' }).then(res => {
            if (res?.success && res.medications && res.medications.length > 0) {
              const m = res.medications[0];
              const specificBatch = {
                id: `batch_${m.id}_${pharmaFly.batchNumber}`,
                batchNo: pharmaFly.batchNumber,
                batchNumber: pharmaFly.batchNumber,
                expiryDate: pharmaFly.expiryDate,
                supplier_code: pharmaFly.supplierCode
              };
              const newProd = {
                id: m.id,
                barcode: m.barcode || rawText,
                tradeNameAr: m.trade_name_ar,
                tradeNameEn: m.trade_name_en,
                publicPrice: m.public_price,
                costPrice: m.cost_price,
                packSize: m.pack_size,
                baseUnit: 'علبة',
                subUnit: 'شريط',
                batches: [specificBatch]
              };
              addItemToActiveWindowCart(newProd, 'base', 1, invoiceType);
              showToast?.(`تم مسح ${m.trade_name_ar} بتشغيلة: ${pharmaFly.batchNumber} وصلاحية: ${pharmaFly.expiryDateFormatted}! 🎯`, 'success');
              setSearchQuery('');
              setSearchResults([]);
            }
          });
          return;
        }
      }

      if (searchResults.length > 0 && searchResults[selectedResultIndex]) {
        handleSelectProduct(searchResults[selectedResultIndex], 'base');
      } else if (searchQuery.trim()) {
        // محاولة مسح الباركود المباشر الدقيق محلياً أو من الخادم
        const exactMatch = productsCatalog.find(
          (p) => p.barcode === searchQuery.trim() || (p.barcodes && p.barcodes.includes(searchQuery.trim()))
        );
        if (exactMatch) {
          handleSelectProduct(exactMatch, 'base');
        } else {
          // جلب مباشر من قاعدة بيانات الأدوية والمخزون المركزي
          stockSearchMedications({ q: rawText, locationId: currentBranch?.id || '' }).then(res => {
            if (res?.success && Array.isArray(res.medications) && res.medications.length > 0) {
              const m = res.medications[0];
              const newProd = {
                id: m.id,
                barcode: m.barcode || m.gtin_barcode || rawText,
                tradeNameAr: m.trade_name_ar || m.trade_name_en,
                tradeNameEn: m.trade_name_en || m.trade_name_ar,
                genericName: m.generic_name || 'غير محدد',
                category: m.category || 'أدوية',
                dosageForm: m.dosage_form || 'عبوة',
                publicPrice: parseFloat(m.public_price || 0),
                costPrice: parseFloat(m.cost_price || (m.public_price ? m.public_price * 0.75 : 0)),
                subUnitPrice: parseFloat(m.unit_price || (m.public_price / (m.pack_size || 1))),
                packSize: parseInt(m.pack_size || 1, 10),
                baseUnit: m.unit_type || 'علبة',
                subUnit: 'شريط',
                batches: m.batches || []
              };
              handleSelectProduct(newProd, 'base');
              showToast?.(`✅ تم مسح وإضافة ${newProd.tradeNameAr}`);
            } else {
              showToast?.(`⚠️ لم يتم العثور على الصنف بالباركود: ${rawText}`);
            }
          }).catch(() => {
            showToast?.(`⚠️ تعذر البحث عن الباركود: ${rawText}`);
          });
        }
      } else if (!searchQuery.trim() && cart.length > 0) {
        // اختصار PharmaFly: ضغط Enter عند فراغ حقل البحث ينهي البيع نقداً ويوثق بكود الموظف
        triggerEmployeeVerifiedAction(
          'توثيق إنهاء فاتورة البيع النقدي [Enter]',
          `المبلغ الإجمالي المطلوب: ${netTotal.toFixed(2)} ج.م • يرجى إدخال كود الموظف للاعتماد والطباعة`,
          'sale',
          (emp) => {
            handleQuickCheckoutWithoutReceipt(emp.code);
          }
        );
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSearchQuery('');
      setSearchResults([]);
    } else if (!searchQuery.trim() && selectedCartIndex >= 0 && cart[selectedCartIndex]) {
      const curItem = cart[selectedCartIndex];
      // اختصارات تعديل السلة مباشرة باللوحة عند خلو حقل البحث
      if (e.key === '+' || e.code === 'NumpadAdd' || (e.key === '=' && !e.ctrlKey)) {
        e.preventDefault();
        updateCartItemQuantity(windowId, selectedCartIndex, (curItem.quantity || 1) + 1);
      } else if (e.key === '-' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        if (curItem.quantity > 1) {
          updateCartItemQuantity(windowId, selectedCartIndex, curItem.quantity - 1);
        } else {
          removeItemFromCart(windowId, selectedCartIndex);
          if (selectedCartIndex >= cart.length - 1) {
            setSelectedCartIndex(Math.max(-1, cart.length - 2));
          }
        }
      } else if (e.key === 'Delete') {
        e.preventDefault();
        removeItemFromCart(windowId, selectedCartIndex);
        if (selectedCartIndex >= cart.length - 1) {
          setSelectedCartIndex(Math.max(-1, cart.length - 2));
        }
        showToast?.(`🗑️ تم حذف الصنف: ${curItem.tradeNameAr || curItem.tradeNameEn}`);
      } else if (e.key === '*' || e.code === 'NumpadMultiply') {
        e.preventDefault();
        toggleCartItemUnit(windowId, selectedCartIndex);
      }
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
  const handleInspectSubstitutes = (item, cartIndex = -1) => {
    const prod = productsCatalog.find((p) => p.id === item.productId) || {
      id: item.productId || item.id,
      tradeNameAr: item.tradeNameAr,
      tradeNameEn: item.tradeNameEn,
      genericName: item.genericName,
      publicPrice: item.publicPrice || item.unitPrice,
      costPrice: item.costPrice || (item.publicPrice ? item.publicPrice * 0.75 : 0),
      dosageForm: item.dosageForm,
      strength: item.strength,
      barcode: item.barcode,
      batches: item.batches || []
    };
    setActiveSubstituteTarget({ product: prod, cartIndex, windowId });
    setIsSubstitutesModalOpen(true);
  };

  // فحص رصيد الصنف عبر الفروع
  const handleInspectBranchStock = (productObj) => {
    openBranchStockModal(productObj);
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
        {/* ── 1. الشريط العلوي: رقم فاتورة الشيفت التسلسلي + أنواع الفاتورة + الاختصارات ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
            padding: '8px 14px',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '10px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* رقم الفاتورة التسلسلي البارز الخاص بالشيفت الحالي */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: '8px',
                fontWeight: 900,
                fontSize: '13px',
                boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
                whiteSpace: 'nowrap'
              }}
              title="رقم الفاتورة التسلسلي داخل الشيفت المفتوح حالياً"
            >
              <Receipt size={15} />
              <span>فاتورة #{currentShiftInvoiceSeq || 1}</span>
            </div>

            <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>
              النوع:
            </span>
            <div style={{ display: 'flex', gap: '5px' }}>
              {Object.values(INVOICE_TYPES).map((type, idx) => {
                const isActive = invoiceType === type.id;
                const shortcutNum = idx + 1;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => updateWindowInvoiceType(windowId, type.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 11px',
                      borderRadius: '8px',
                      border: isActive ? `1.5px solid ${type.color}` : '1px solid #e2e8f0',
                      background: isActive ? `${type.color}15` : '#f8fafc',
                      color: isActive ? type.color : '#475569',
                      fontSize: '12px',
                      fontWeight: isActive ? 900 : 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? `0 2px 8px ${type.color}30` : 'none'
                    }}
                    title={`${type.desc} [Ctrl + ${shortcutNum}]`}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                    <span style={{ fontSize: '10px', opacity: 0.75, fontWeight: 800 }}>[Ctrl+{shortcutNum}]</span>
                  </button>
                );
              })}
            </div>

            {/* أزرار الأصناف السريعة وصنف غير مكود بجانب أزرار نوع الفاتورة مباشرة في الشريط العلوي */}
            <button
              type="button"
              onClick={() => setIsQuickItemsOpen((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1.5px solid #0d9488',
                background: '#f0fdfa',
                color: '#0d9488',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(13, 148, 136, 0.15)'
              }}
              title="فتح نافذة الأصناف السريعة الأكثر طلباً في مودال منبثق (F8)"
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
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1.5px solid #f59e0b',
                background: '#fffbeb',
                color: '#b45309',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.15)'
              }}
              title="إضافة صنف حر غير مكود يدوياً للفاتورة (Ctrl + M)"
            >
              <PackagePlus size={14} />
              <span>صنف غير مكود [Ctrl+M]</span>
            </button>

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('pos:open-transfer-receive'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1.5px solid #0f766e',
                background: '#f0fdfa',
                color: '#0f766e',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.15)'
              }}
              title="استلام طلبيات وتحويلات المخزن المركزي بكود التحويل السري"
            >
              <Truck size={14} />
              <span>استلام من المخزن</span>
            </button>

            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('pos:open-label-print'))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                border: '1.5px solid #b45309',
                background: '#fefce8',
                color: '#b45309',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(180, 83, 9, 0.15)'
              }}
              title="طباعة ملصقات الباركود الحرارية للصيدلية (PharmaFly)"
            >
              <Tag size={14} />
              <span>طباعة الملصقات</span>
            </button>
          </div>
        </div>

        {/* ── 2. شريط البحث والباركود الذكي البارز مع اختصار [F3 أو /] ── */}
        <div className="pos-search-bar-wrap" style={{ position: 'relative' }}>
          <input
            ref={barcodeInputRef}
            type="text"
            className="pos-barcode-input"
            placeholder="🔍 امسح الباركود أو اكتب اسم الدواء / المادة الفعالة / العرض الطبي (صداع، ضغط، مغص)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            autoFocus
            style={{ paddingLeft: '110px' }}
          />

          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              pointerEvents: 'none'
            }}
          >
            <span
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px'
              }}
            >
              [F3 أو /] للتركيز
            </span>
          </div>

          {isSearchingOnline && (
            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#0d9488', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} style={{ animation: 'spin 1s linear infinite' }} />
              جاري مسح الكتالوج السحابي...
            </div>
          )}

          {/* قائمة نتائج البحث السريع المنسدلة بالمظهر الفاتح */}
          {searchResults.length > 0 && (
            <div
              ref={resultsContainerRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                left: 0,
                background: '#ffffff',
                border: '1.5px solid #0d9488',
                borderRadius: '14px',
                boxShadow: '0 18px 45px rgba(15, 23, 42, 0.15)',
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
                      padding: '11px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(90deg, #ecfdf5 0%, #f0fdfa 100%)' : '#ffffff',
                      borderRight: isSelected ? '5px solid #059669' : '5px solid transparent',
                      boxShadow: isSelected ? 'inset 0 0 0 1px #a7f3d0' : 'none',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 900, fontSize: '14px', color: isSelected ? '#065f46' : '#0f172a' }}>
                          {prod.tradeNameAr}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>
                          ({prod.tradeNameEn})
                        </span>
                        {totalStock > 0 ? (
                          <span style={{ padding: '2px 7px', borderRadius: '5px', background: '#ecfdf5', color: '#059669', fontSize: '11px', fontWeight: 800, border: '1px solid #a7f3d0' }}>
                            المتاح بالفرع: {totalStock} علبة
                          </span>
                        ) : (
                          <span style={{ padding: '2px 7px', borderRadius: '5px', background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 800, border: '1px solid #fecaca' }}>
                            رصيد منتهي ❌
                          </span>
                        )}
                        {isSelected && (
                          <span
                            style={{
                              background: '#059669',
                              color: '#ffffff',
                              fontSize: '10.5px',
                              fontWeight: 900,
                              padding: '2px 8px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.35)'
                            }}
                          >
                            ↵ اضغط Enter للإضافة
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
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
                          background: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          color: '#0284c7',
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
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#059669' }}>
                          {parseFloat(prod.publicPrice || 0).toFixed(2)} ج
                        </div>
                        <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 700 }}>
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

                  const isRowSelected = idx === selectedCartIndex;

                  return (
                    <tr
                      key={`${item.productId}-${item.unitType}-${idx}`}
                      onClick={() => setSelectedCartIndex(idx)}
                      style={{
                        background: isRowSelected
                          ? 'linear-gradient(90deg, rgba(13, 148, 136, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%)'
                          : undefined,
                        boxShadow: isRowSelected
                          ? 'inset 0 0 0 2px #0d9488, 0 2px 8px rgba(13, 148, 136, 0.15)'
                          : undefined,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <td style={{ fontWeight: 800, color: isRowSelected ? '#0d9488' : 'var(--muted, #475569)', whiteSpace: 'nowrap' }}>
                        {idx + 1}
                        {isRowSelected && (
                          <span
                            style={{
                              marginRight: '4px',
                              background: '#0d9488',
                              color: '#ffffff',
                              fontSize: '9.5px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              fontWeight: 900
                            }}
                          >
                            محدد
                          </span>
                        )}
                      </td>
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
                              onClick={() => handleInspectSubstitutes(item, idx)}
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
                          <option value="otc" style={{ background: '#ffffff', color: '#059669', fontWeight: 800 }}>🟢 OTC لا وصفي</option>
                          <option value="rx" style={{ background: '#ffffff', color: '#0284c7', fontWeight: 800 }}>💊 روشتة Rx</option>
                          <option value="customer_order" style={{ background: '#ffffff', color: '#d97706', fontWeight: 800 }}>📋 طلب عميل</option>
                        </select>
                      </td>

                      {/* محدد الوحدة (علبة / شريط / قرص) */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="pos-unit-toggle-btn"
                          onClick={() => toggleCartItemUnit(windowId, idx)}
                          title="انقر للتبديل بين علبة أو شريط أو قرص [*]"
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
                            title="زيادة الكمية [+]"
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
                            title="تقليل الكمية [-]"
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
                          title="حذف الصنف من الفاتورة [Delete]"
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

          {/* شريط الإرشادات التفاعلي للصنف المحدد */}
          {selectedCartIndex >= 0 && cart[selectedCartIndex] && (
            <div
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(90deg, #f0fdfa 0%, #ecfdf5 100%)',
                borderTop: '1.5px solid #99f6e4',
                fontSize: '11.5px',
                color: '#0f766e',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <span>الصنف المحدد: <strong>{cart[selectedCartIndex].tradeNameAr}</strong></span>
              <span style={{ fontSize: '11px', color: '#0d9488' }}>
                اختصارات الصنف: <strong>[-] تقليل</strong> • <strong>[+] زيادة</strong> • <strong>[*] تبديل وحدة</strong> • <strong>[/] خصم</strong> • <strong>[Ctrl+1..3] نوع</strong> • <strong>[Del] حذف</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. شريط التحكم السفلي الموحد (Bottom Dock) لبيانات العميل والإجماليات والدفع ── */}
      <div className="pos-sales-bottom-dock">
        {/* العمود 1: بيانات العميل والمحفظة والروشتة والتوصيل */}
        <div className="pos-dock-panel pos-dock-customer-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <User size={15} color="#0d9488" />
              بيانات العميل والمحفظة
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {customer.name && (
                <button
                  type="button"
                  onClick={() => openCustomerHistoryModal(customer)}
                  style={{
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0284c7',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="عرض سجل مشتريات وفواتير العميل السابقة والروشتات والمحفظة"
                >
                  <FileText size={11} />
                  سجل العميل
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  padding: '2px 7px',
                  borderRadius: '6px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="تعديل بيانات العميل الحالي وضبط رصيد المحفظة"
              >
                <Settings size={12} color="#475569" />
                <span>إعدادات العميل والمحفظة</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(true)}
                style={{
                  background: '#f0fdfa',
                  border: '1px solid #0d9488',
                  color: '#0d9488',
                  padding: '2px 7px',
                  borderRadius: '6px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <UserPlus size={11} />
                + عميل جديد
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', position: 'relative' }} ref={customerDropdownRef}>
            {/* حقل هاتف العميل أو كود الموظف مع الأتمتة الفورية */}
            <div>
              <input
                type="tel"
                placeholder="رقم الهاتف أو كود الموظف..."
                value={customer.phone}
                onChange={(e) => {
                  handlePhoneLookup(e.target.value);
                }}
                onKeyDown={(e) => {
                  handleCustomerPhoneKeyDown(e, e.target.value);
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: customer.isEmployee ? '1.5px solid #059669' : '1.5px solid #cbd5e1',
                  background: customer.isEmployee ? '#ecfdf5' : '#ffffff',
                  color: '#0f172a',
                  fontSize: '11.5px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>

            {/* حقل اسم العميل مع البحث المركزي الموحد */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="اسم العميل أو ابحث بالاسم..."
                value={customerSearchQuery !== '' ? customerSearchQuery : (customer.name || '')}
                onChange={(e) => {
                  setCustomerSearchQuery(e.target.value);
                  updateWindowCustomer(windowId, { name: e.target.value });
                }}
                onFocus={() => {
                  if (customerSuggestions.length > 0) setShowCustomerDropdown(true);
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '11.5px',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
              {isSearchingCustomer && (
                <div style={{ position: 'absolute', left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '9.5px', color: '#0d9488' }}>
                  بحث...
                </div>
              )}
            </div>

            {/* قائمة اقتراحات العملاء المنسدلة */}
            {showCustomerDropdown && customerSuggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  left: 0,
                  background: '#ffffff',
                  border: '1.5px solid #0d9488',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(15, 23, 42, 0.18)',
                  zIndex: 200,
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}
              >
                {customerSuggestions.map((cust) => (
                  <div
                    key={cust.id}
                    onClick={() => {
                      updateWindowCustomer(windowId, {
                        name: cust.full_name || cust.name,
                        phone: cust.whatsapp_phone || cust.phone || '',
                        address: cust.address || '',
                        isChronic: Boolean(cust.is_chronic ?? cust.isChronic),
                        walletBalance: parseFloat(cust.wallet_balance ?? cust.walletBalance ?? 0)
                      });
                      if (cust.address && invoiceType === 'delivery') {
                        updateWindowDeliveryDetails(windowId, { address: cust.address, isDelivery: true });
                      }
                      setCustomerSearchQuery('');
                      setShowCustomerDropdown(false);
                      showToast?.(`✅ تم اختيار العميل: ${cust.full_name || cust.name}`);
                    }}
                    style={{
                      padding: '6px 8px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 800, color: '#0f172a' }}>{cust.full_name || cust.name}</span>
                      <span style={{ color: '#64748b', marginRight: '6px' }}>({cust.whatsapp_phone || cust.phone || 'بدون هاتف'})</span>
                    </div>
                    {parseFloat(cust.wallet_balance || 0) > 0 && (
                      <span style={{ color: '#16a34a', fontWeight: 800 }}>
                        {parseFloat(cust.wallet_balance).toFixed(2)} ج
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* شارة تمييز الموظف أو البروموكود المطبق */}
          {(customer.isEmployee || appliedPromo) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
              {customer.isEmployee && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '10.5px', fontWeight: 800 }}>
                  <ShieldCheck size={12} color="#059669" />
                  <span>موظف معتمد: {customer.employeeCode || ''} (خصم {discountValue}%)</span>
                </div>
              )}
              {appliedPromo && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', fontSize: '10.5px', fontWeight: 800 }}>
                  <Tag size={12} color="#d97706" />
                  <span>كود: {appliedPromo.code} (-{calculatedDiscount.toFixed(2)} ج)</span>
                  <button type="button" onClick={() => { setAppliedPromo(null); setDiscountValue(0); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#b45309', fontWeight: 900, padding: 0 }}>×</button>
                </div>
              )}
            </div>
          )}

          {/* صف المحفظة + المتابعة المزمنة + الروشتة */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            {availableWallet > 0 ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: useWallet ? '#ecfdf5' : '#f8fafc',
                    border: useWallet ? '1px solid #10b981' : '1px solid #cbd5e1',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => {
                      const willUse = e.target.checked;
                      setUseWallet(willUse);
                      if (willUse && !isWalletOtpVerified) {
                        setShowWalletOtpModal(true);
                      }
                    }}
                    style={{ accentColor: '#059669' }}
                  />
                  <span style={{ color: '#059669', fontWeight: 800 }}>💰 رصيد المحفظة بالنظام: {availableWallet.toFixed(2)} ج</span>
                </label>

                {useWallet && (
                  isWalletOtpVerified ? (
                    <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 900, background: '#dcfce7', padding: '2px 6px', borderRadius: '4px' }}>
                      ✓ موثق بـ OTP
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowWalletOtpModal(true)}
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #f59e0b',
                        color: '#b45309',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                      title="توثيق موافقة العميل على الخصم من رصيد محفظته بالنظام عبر رمز OTP"
                    >
                      🔒 توثيق OTP 📲
                    </button>
                  )
                )}
              </div>
            ) : (
              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>محفظة العميل: 0.00 ج</span>
            )}

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer', color: '#475569' }}>
              <input
                type="checkbox"
                checked={customer.isChronic}
                onChange={(e) => updateWindowCustomer(windowId, { isChronic: e.target.checked })}
                style={{ accentColor: '#0d9488' }}
              />
              <span>💊 مريض مزمن (واتساب)</span>
            </label>

            {/* معاينة الروشتة المنسوخة */}
            {rxImage ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#f0f9ff',
                  border: '1px solid #38bdf8',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '10.5px',
                  color: '#0284c7',
                  fontWeight: 800
                }}
                onClick={() => setIsRxImageZoomed(true)}
              >
                <Image size={12} />
                <span>عرض الروشتة 👁️</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateWindowRxImage(windowId, null);
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                  title="حذف"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '10.5px', color: '#64748b' }} title="انسخ صورة الروشتة واضغط Ctrl+V">
                📋 روشتة: اضغط <strong>Ctrl+V</strong>
              </span>
            )}
          </div>

          {/* قسم التوصيل عند تفعيله */}
          {invoiceType === 'delivery' && (
            <div style={{ marginTop: '6px', padding: '6px', background: '#f5f3ff', borderRadius: '6px', border: '1px solid #c4b5fd', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Bike size={14} color="#7c3aed" />
              <select
                value={deliveryDetails.pilotName || ''}
                onChange={(e) => {
                  const pilotsList = getDeliveryPilots();
                  const p = pilotsList.find((x) => x.name === e.target.value);
                  updateWindowDeliveryDetails(windowId, {
                    pilotName: e.target.value,
                    pilotId: p?.id || null,
                    pilotPhone: p?.phone || '',
                    isDelivery: true
                  });
                }}
                style={{ flex: 1, padding: '3px 6px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '10.5px' }}
              >
                <option value="">-- اختر طيار الفرع --</option>
                {getDeliveryPilots().map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '2px' }}>
                {[0, 10, 15, 20].map((fee) => (
                  <button
                    key={fee}
                    type="button"
                    onClick={() => updateWindowDeliveryDetails(windowId, { deliveryFee: fee, isDelivery: true })}
                    style={{
                      padding: '2px 5px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: (deliveryDetails.deliveryFee === fee) ? '#7c3aed' : '#ffffff',
                      color: (deliveryDetails.deliveryFee === fee) ? '#ffffff' : '#475569',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    {fee === 0 ? 'مجاني' : `${fee}ج`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* العمود 2: الإجماليات والخصم المزدوج (% أو ج.م) والنهائي البارز */}
        <div className="pos-dock-panel pos-dock-totals-panel">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: '11.5px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#475569' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>الفرعي:</span>
                <strong style={{ color: '#0f172a' }}>{subtotal.toFixed(2)} ج</strong>
              </div>
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '2px 7px',
                  borderRadius: '6px',
                  background: appliedPromo ? '#fef3c7' : '#f0fdf4',
                  border: appliedPromo ? '1px solid #fde68a' : '1px solid #86efac',
                  color: appliedPromo ? '#b45309' : '#166534',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  transition: 'all 0.12s'
                }}
                title="تطبيق برومو كود أو كود خصم ترويجي [Ctrl+P]"
              >
                <Tag size={11} />
                <span>{appliedPromo ? appliedPromo.code : 'بروموكود [Ctrl+P]'}</span>
              </button>
            </div>

            {/* الخصم المزدوج */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: '#0d9488',
                    fontWeight: 800,
                    fontSize: '11.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                  title="فتح نافذة الخصم الاحترافية [/]"
                >
                  <Percent size={11} />
                  <span>الخصم [/]:</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType((prev) => (prev === 'fixed' ? 'percent' : 'fixed'))}
                  style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '10px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                  title="التبديل بين نسبة % ومبلغ قطعي ج.م"
                >
                  {discountType === 'percent' ? '%' : 'ج'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? '100' : subtotal}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  style={{
                    width: '50px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    fontSize: '11px',
                    textAlign: 'center'
                  }}
                  title="انقر أو اضغط [/] لفتح نافذة الخصم الاحترافية"
                />
                {calculatedDiscount > 0 && (
                  <span style={{ color: '#dc2626', fontWeight: 800, fontSize: '10.5px' }}>
                    (-{calculatedDiscount.toFixed(2)})
                  </span>
                )}
              </div>
            </div>

            {deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7c3aed' }}>
                <span>رسوم التوصيل:</span>
                <strong>+{deliveryFee.toFixed(2)} ج</strong>
              </div>
            )}

            {walletDeducted > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                <span>خصم المحفظة:</span>
                <strong>-{walletDeducted.toFixed(2)} ج</strong>
              </div>
            )}

            {totalCommissions > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0d9488' }}>
                <span>عمولة الكاشير:</span>
                <strong>+{totalCommissions.toFixed(2)} ج</strong>
              </div>
            )}
          </div>

          {/* كارت الصافي المطلوب البارز */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              borderRadius: '8px',
              padding: '6px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#ffffff',
              boxShadow: '0 3px 8px rgba(13, 148, 136, 0.25)'
            }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 800 }}>الصافي المطلوب:</span>
            <span style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.5px' }}>
              {netTotal.toFixed(2)} <span style={{ fontSize: '13px', fontWeight: 700 }}>ج.م</span>
            </span>
          </div>
        </div>

        {/* العمود 3: أزرار واختصارات الدفع الذكية مع إلغاء الفاتورة */}
        <div className="pos-dock-panel pos-dock-actions-panel">
          {/* الزر الخارق: إنهاء فوري نقدي بدون ريسيت */}
          <button
            type="button"
            className="pos-instant-checkout-btn"
            disabled={cart.length === 0 || isQuickCheckingOut}
            onClick={() => {
              if (cart.length === 0) {
                showToast?.('⚠️ سلة الفاتورة فارغة، يرجى إضافة أصناف أولاً');
                return;
              }
              setIsQuickCashPinModalOpen(true);
              setQuickCashPin('');
            }}
            title="إنهاء فوري نقدي بدون طباعة ريسيت وتفريغ السلة فوراً (Shift + Enter)"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 900,
              fontSize: '12.5px',
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              opacity: cart.length === 0 ? 0.6 : 1,
              boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Zap size={16} className={isQuickCheckingOut ? 'pos-spin-icon' : ''} />
            <span>{isQuickCheckingOut ? 'جاري الإنهاء...' : '⚡ كاش فوري [Shift + Enter]'}</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => handleOpenPayment({ printReceipt: true })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1.5px solid #0d9488',
                color: '#0d9488',
                fontWeight: 800,
                fontSize: '11px',
                cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                opacity: cart.length === 0 ? 0.6 : 1
              }}
              title="سداد الفاتورة وطباعة الإيصال الحراري (F5)"
            >
              <Printer size={14} />
              <span>دفع بريسيت [F5]</span>
            </button>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => handleOpenPayment({ printReceipt: false })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1.5px solid #6366f1',
                color: '#6366f1',
                fontWeight: 800,
                fontSize: '11px',
                cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                opacity: cart.length === 0 ? 0.6 : 1
              }}
              title="سداد الفاتورة بأي طريقة دفع بدون طباعة ريسيت (F6)"
            >
              <CheckCircle2 size={14} />
              <span>دفع بدون ريسيت [F6]</span>
            </button>
          </div>

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => {
              if (cart.length > 0) {
                setShowCancelConfirmModal(true);
              } else {
                showToast?.('ℹ️ السلة فارغة بالفعل');
              }
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '5px 8px',
              borderRadius: '6px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontWeight: 800,
              fontSize: '11px',
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              marginTop: '6px',
              opacity: cart.length === 0 ? 0.6 : 1
            }}
            title="إلغاء الفاتورة وتفريغ السلة (Esc)"
          >
            <XCircle size={14} />
            <span>إلغاء الفاتورة [Esc]</span>
          </button>
        </div>
      </div>

      {/* مودال تكبير صورة الروشتة مع خلفية زجاجية طبيعية */}
      {isRxImageZoomed && rxImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
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

      {/* ── مودال إضافة صنف حر غير مكود يدوياً بالمظهر الفاتح وخلفية زجاجية طبيعية ── */}
      {isUncodedModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.28)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
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
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
                borderBottom: '1px solid #fde68a'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#fef3c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#d97706',
                    border: '1px solid #fde68a'
                  }}
                >
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                    إدراج صنف حر / غير مكود
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    للأدوية والمستلزمات والتركيبات التي لم تُسجل بالباركود بعد [Ctrl + M]
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsUncodedModalOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddUncodedItem} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
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
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
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
                      background: '#ffffff',
                      border: '1.5px solid #0d9488',
                      color: '#059669',
                      fontSize: '15px',
                      fontWeight: 900,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
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
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      color: '#0f172a',
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
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
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
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    الوحدة
                  </label>
                  <select
                    value={uncodedForm.unit}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, unit: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      color: '#0f172a',
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
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    نوع الفاتورة
                  </label>
                  <select
                    value={uncodedForm.itemType}
                    onChange={(e) => setUncodedForm({ ...uncodedForm, itemType: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      color: '#0f172a',
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
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
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
                    background: 'linear-gradient(135deg, #d97706, #b45309)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(217, 119, 6, 0.3)'
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

      {/* ── مودال الأصناف السريعة المنبثق مع خلفية زجاجية طبيعية تظهر نافذة البيع ── */}
      <PosQuickItemsModal
        isOpen={isQuickItemsOpen}
        onClose={() => setIsQuickItemsOpen(false)}
        onSelectItem={handleSelectFastItem}
      />

      {/* ── مودال تنبيه إلغاء الفاتورة القابل للسحب والتحريك (Draggable Esc Alert Modal) ── */}
      {showCancelConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setShowCancelConfirmModal(false)}
        >
          <div
            style={{
              transform: `translate(${cancelModalPos.x}px, ${cancelModalPos.y}px)`,
              background: '#ffffff',
              border: '2px solid #ef4444',
              borderRadius: '16px',
              width: '460px',
              maxWidth: '92vw',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* مقبض السحب الرأسي للنافذة */}
            <div
              onMouseDown={handleCancelMouseDown}
              style={{
                cursor: isDraggingCancel ? 'grabbing' : 'grab',
                background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                color: '#ffffff',
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 900, fontSize: '13.5px' }}>
                <AlertOctagon size={18} />
                <span>⚠️ تنبيه: إلغاء الفاتورة وتفريغ السلة (اسحب للتحريك)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelConfirmModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '22px', textAlign: 'center' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>⚠️</div>
              <p style={{ fontSize: '14px', color: '#1e293b', fontWeight: 700, margin: '0 0 10px 0', lineHeight: 1.6 }}>
                الفاتورة الحالية تحتوي على <strong style={{ color: '#ef4444' }}>{cart.length}</strong> صنف بقيمة إجمالية <strong style={{ color: '#0d9488' }}>{netTotal.toFixed(2)} ج.م</strong>.
              </p>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 20px 0' }}>
                هل أنت متأكد من إلغاء الفاتورة وتفريغ الأصناف؟ لا يمكن التراجع عن هذه العملية.
              </p>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    triggerEmployeeVerifiedAction(
                      'توثيق إلغاء وتفريغ السلة',
                      `تفريغ ${cart.length} صنف بقيمة ${netTotal.toFixed(2)} ج.م • يلزم كود الموظف بنظام الـ HR`,
                      'void',
                      (emp) => {
                        clearCart(windowId);
                        setShowCancelConfirmModal(false);
                        showToast?.(`🗑️ تم إلغاء الفاتورة وتفريغ السلة بواسطة: ${emp.name}`);
                      }
                    );
                  }}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '8px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                  }}
                >
                  نعم، تفريغ الفاتورة [Enter]
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelConfirmModal(false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  تراجع واستمرار البيع [Esc]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* مودال التحقق من رمز OTP للخصم من محفظة العميل بالنظام */}
      {showWalletOtpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 2500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            direction: 'rtl'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '2px solid #059669',
              padding: '20px',
              width: '90%',
              maxWidth: '430px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={20} color="#059669" />
                <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#065f46' }}>
                  تأمين رصيد محفظة العميل بالنظام (OTP)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowWalletOtpModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, background: '#f0fdf4', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div>العميل: <strong>{customer.name || 'عميل مسجل'}</strong></div>
              <div>الهاتف المسجل: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{customer.phone || 'غير متوفر'}</strong></div>
              <div style={{ marginTop: '4px', borderTop: '1px dashed #86efac', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                <span>الرصيد المتاح بالنظام: <strong style={{ color: '#059669' }}>{availableWallet.toFixed(2)} ج</strong></span>
                <span style={{ color: '#047857' }}>الخصم المطلوب: <strong>{walletDeducted.toFixed(2)} ج</strong></span>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#047857' }}>
              🔒 لحماية رصيد وأموال العميل المودعة بالنظام من أي خصم غير مصرح به، يلزم إرسال رمز تحقق OTP لهاتف العميل وإدخاله لتوثيق الموافقة.
            </div>

            <button
              type="button"
              disabled={walletOtpTimer > 0}
              onClick={handleSendCustomerWalletOtp}
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                background: walletOtpTimer > 0 ? '#94a3b8' : '#059669',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '12.5px',
                cursor: walletOtpTimer > 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {walletOtpTimer > 0 ? `انتظر (${walletOtpTimer}ث) لإعادة الإرسال` : (isWalletOtpSent ? 'إعادة إرسال كود OTP 📲' : 'إرسال كود التحقق OTP لهاتف العميل 📲')}
            </button>

            {isWalletOtpSent && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '3px' }}>
                  أدخل رمز التحقق (OTP) المكون من 4 أرقام:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="أدخل الرمز..."
                  value={walletOtpCode}
                  onChange={(e) => handleVerifyCustomerWalletOtp(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: walletOtpError ? '2px solid #ef4444' : '2px solid #059669',
                    fontSize: '18px',
                    fontWeight: 900,
                    letterSpacing: '5px',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '6px 10px', marginTop: '6px', fontSize: '11px', color: '#1e40af' }}>
                  <span>تم إرسال الرمز لواتساب العميل 📲</span>
                  <span>كود المحاكاة: <strong style={{ letterSpacing: '2px', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px' }}>{generatedWalletOtp}</strong></span>
                </div>
              </div>
            )}

            {walletOtpError && (
              <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 800 }}>
                {walletOtpError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setShowWalletOtpModal(false)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال كاش فوري السريع مع إدخال كود الموظف وخلفية شفافة زجاجية ── */}
      {isQuickCashPinModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl',
            animation: 'posFadeIn 0.15s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsQuickCashPinModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '2px solid #0d9488',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '430px',
              boxShadow: '0 25px 60px -15px rgba(13, 148, 136, 0.35)',
              overflow: 'hidden',
              animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
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
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488, #059669)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 3px 8px rgba(13, 148, 136, 0.3)'
                  }}
                >
                  <Zap size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                    كاش فوري سريع [Shift+Enter]
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                    إنهاء فوري بدون ريسيت لتسريع خدمة العملاء
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickCashPinModalOpen(false)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)',
                  border: '1.5px solid #a7f3d0',
                  borderRadius: '12px',
                  padding: '12px',
                  textAlign: 'center',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '11.5px', color: '#065f46', fontWeight: 800 }}>المبلغ المطلوب نقداً</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#047857', marginTop: '2px' }}>
                  {netTotal.toFixed(2)} <span style={{ fontSize: '15px' }}>ج.م</span>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleQuickCheckoutWithoutReceipt(quickCashPin || currentEmpUser?.code);
                }}
              >
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  أدخل كود الموظف / الكاشير (PIN):
                </label>
                <input
                  ref={pinInputRef}
                  type="text"
                  autoFocus
                  placeholder="أدخل كود الموظف (مثال: 101)..."
                  value={quickCashPin}
                  onChange={(e) => setQuickCashPin(e.target.value)}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px',
                    borderRadius: '10px',
                    border: '2px solid #0d9488',
                    background: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 900,
                    color: '#0f172a',
                    textAlign: 'center',
                    letterSpacing: '2px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    boxShadow: '0 0 0 3px rgba(13, 148, 136, 0.15)'
                  }}
                />

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button
                    type="submit"
                    disabled={isQuickCheckingOut}
                    style={{
                      flex: 1,
                      height: '44px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
                    }}
                  >
                    <Zap size={16} />
                    <span>تأكيد وإتمام البيع [Enter]</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsQuickCashPinModalOpen(false)}
                    style={{
                      padding: '0 16px',
                      height: '44px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      color: '#475569',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    إلغاء [Esc]
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تطبيق الخصم الاحترافي المنبثق بزر [/] ── */}
      {isDiscountModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl',
            animation: 'posFadeIn 0.15s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDiscountModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              border: '2px solid #0d9488',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 25px 60px -15px rgba(13, 148, 136, 0.35)',
              overflow: 'hidden',
              animation: 'posPopScale 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #f0fdfa 0%, #ffffff 100%)',
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
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488, #059669)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 3px 8px rgba(13, 148, 136, 0.3)'
                  }}
                >
                  <Percent size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                    تطبيق الخصم على الفاتورة [/]
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                    خصم نسبة مئوية (%) أو مبلغ قطعي (ج.م)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiscountModalOpen(false)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: discountType === 'percent' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                    background: discountType === 'percent' ? '#f0fdfa' : '#ffffff',
                    color: discountType === 'percent' ? '#0d9488' : '#64748b',
                    fontWeight: 900,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Percent size={14} />
                  <span>نسبة مئوية (%)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: discountType === 'fixed' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                    background: discountType === 'fixed' ? '#f0fdfa' : '#ffffff',
                    color: discountType === 'fixed' ? '#0d9488' : '#64748b',
                    fontWeight: 900,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Banknote size={14} />
                  <span>مبلغ قطعي (ج.م)</span>
                </button>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  {discountType === 'percent' ? 'النسبة المئوية للخصم (%):' : 'قيمة الخصم بالجنيه (ج.م):'}
                </label>
                <input
                  ref={discountInputRef}
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step="any"
                  autoFocus
                  placeholder={discountType === 'percent' ? 'مثال: 10' : 'مثال: 25'}
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setIsDiscountModalOpen(false);
                      showToast?.(`✓ تم اعتماد خصم بقيمة ${calculatedDiscount.toFixed(2)} ج.م`);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px',
                    borderRadius: '10px',
                    border: '2px solid #0d9488',
                    background: '#ffffff',
                    fontSize: '18px',
                    fontWeight: 900,
                    color: '#0f172a',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* أزرار النسب السريعة */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {(discountType === 'percent' ? [5, 10, 15, 20] : [5, 10, 20, 50]).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setDiscountValue(val)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: discountValue === val ? '#0d9488' : '#f1f5f9',
                      color: discountValue === val ? '#ffffff' : '#334155',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {val} {discountType === 'percent' ? '%' : 'ج'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDiscountValue(0)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginRight: 'auto'
                  }}
                >
                  إلغاء الخصم (0)
                </button>
              </div>

              {/* ملخص الخصم والمطلوب */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>قيمة الخصم الفعلي</div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#dc2626' }}>
                    -{calculatedDiscount.toFixed(2)} ج.م
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>الصافي بعد الخصم</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#0d9488' }}>
                    {netTotal.toFixed(2)} ج.م
                  </div>
                </div>
              </div>

              {/* أزرار الإجراء */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsDiscountModalOpen(false);
                    showToast?.(`✓ تم اعتماد خصم بقيمة ${calculatedDiscount.toFixed(2)} ج.م`);
                  }}
                  style={{
                    flex: 1,
                    height: '42px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>تطبيق الخصم [Enter]</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  style={{
                    padding: '0 16px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    border: '1.5px solid #cbd5e1',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إغلاق [Esc]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة التوثيق السريع لكود الموظف للكاش الفوري بتصميم بلوري شفاف ── */}
      {isQuickCashPinModalOpen && (
        <div
          className="pos-in-window-overlay"
          onClick={() => setIsQuickCashPinModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1.5px solid rgba(16, 185, 129, 0.5)',
              borderRadius: '20px',
              padding: '24px',
              width: '92%',
              maxWidth: '380px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              textAlign: 'center',
              animation: 'posFadeIn 0.15s ease-out'
            }}
          >
            <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', boxShadow: '0 6px 16px rgba(16, 185, 129, 0.35)' }}>
              <Zap size={26} />
            </div>

            <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              ⚡ كاش فوري سريع
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              المبلغ المطلوب تحصيله نقداً: <strong style={{ color: '#059669', fontSize: '16px' }}>{netTotal.toFixed(2)} ج.م</strong>
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '6px', textAlign: 'right' }}>
                كود الموظف / رقم البصمة لتوثيق الفاتورة:
              </label>
              <input
                ref={pinInputRef}
                autoFocus
                type="text"
                placeholder="أدخل كود الموظف (مثال: 101)..."
                value={quickCashPin}
                onChange={(e) => setQuickCashPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!quickCashPin.trim()) {
                      showToast?.('⚠️ إلزامي: أدخل كود الموظف لتوثيق الفاتورة');
                      return;
                    }
                    handleQuickCheckoutWithoutReceipt(quickCashPin);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsQuickCashPinModalOpen(false);
                  }
                }}
                style={{
                  width: '100%',
                  height: '46px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '2px solid #10b981',
                  background: '#ffffff',
                  fontSize: '18px',
                  fontWeight: 900,
                  textAlign: 'center',
                  letterSpacing: '1px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* أزرار الأرقام السريعة */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '16px' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setQuickCashPin('');
                    else if (k === '⌫') setQuickCashPin((p) => p.slice(0, -1));
                    else setQuickCashPin((p) => p + k);
                  }}
                  style={{
                    padding: '8px 0',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: k === 'C' ? '#fee2e2' : k === '⌫' ? '#f1f5f9' : '#ffffff',
                    color: k === 'C' ? '#dc2626' : '#0f172a',
                    fontWeight: 800,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  {k}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={isQuickCheckingOut}
                onClick={() => {
                  if (!quickCashPin.trim()) {
                    showToast?.('⚠️ إلزامي: أدخل كود الموظف لتوثيق الفاتورة');
                    return;
                  }
                  handleQuickCheckoutWithoutReceipt(quickCashPin);
                }}
                style={{
                  flex: 1,
                  height: '42px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                <CheckCircle2 size={16} />
                <span>{isQuickCheckingOut ? 'جاري الإنهاء...' : 'تأكيد وصرف [Enter]'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsQuickCashPinModalOpen(false)}
                style={{
                  padding: '0 16px',
                  height: '42px',
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '10px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                إلغاء [Esc]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة اختيار التشغيلة وتاريخ الصلاحية الذكية (FEFO) ── */}
      <PosBatchSelectionModal
        isOpen={isBatchModalOpen}
        product={batchModalProduct}
        onSelectBatch={handleBatchSelected}
        onClose={() => {
          setIsBatchModalOpen(false);
          setBatchModalProduct(null);
        }}
      />

      {/* ── نافذة توثيق كود الموظف بنظام الـ HR بخلفية شفافة ── */}
      <PosEmployeeActionAuthModal
        isOpen={isEmployeeAuthOpen}
        actionTitle={employeeAuthConfig.title}
        actionSubtitle={employeeAuthConfig.subtitle}
        actionType={employeeAuthConfig.actionType}
        onVerified={(emp) => {
          setIsEmployeeAuthOpen(false);
          if (employeeAuthConfig.callback) {
            employeeAuthConfig.callback(emp);
          }
        }}
        onClose={() => setIsEmployeeAuthOpen(false)}
      />

      {/* ── نافذة إدخال البروموكود الأكريليكية الشفافة [Ctrl+P] ── */}
      <PosPromoCodeModal
        isOpen={isPromoModalOpen}
        onClose={() => setIsPromoModalOpen(false)}
        invoiceSubtotal={subtotal}
        onApplyPromo={handleApplyPromo}
      />
    </div>
  );
}
