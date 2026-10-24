import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  INITIAL_PHARMA_PRODUCTS,
  calculateCartItemLine,
  detectCartDrugInteractions,
  findSmartSubstitutes,
  searchProducts,
  INVOICE_TYPES
} from '../utils/posEngine';
import { commitLocalSale, getLocalOutbox } from '../utils/posOfflineSync';
import { printPosSaleReceipt } from '../utils/posPrintService';
import { playBarcodeSuccessBeep, playCashRegisterChime, playWarningAlertSound } from '../utils/posAudioService';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';

const POSContext = createContext(null);

export function usePOS() {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
}

export function POSProvider({ children }) {
  const { currentBranch, currentEmpUser, authRole } = useAuth?.() || {};
  const { state, setState } = useData?.() || {};

  // ── 1. الدليل الدوائي والمخزون المحلي ──
  const [productsCatalog, setProductsCatalog] = useState(() => {
    try {
      const saved = localStorage.getItem('pharma_pos_products');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_PHARMA_PRODUCTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('pharma_pos_products', JSON.stringify(productsCatalog));
    } catch {}
  }, [productsCatalog]);

  // ── 2. وردية الكاشير النشطة (Active Cashier Shift) ──
  const [currentShift, setCurrentShift] = useState(() => {
    try {
      const saved = localStorage.getItem('pharma_pos_active_shift');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      id: `shift_${Date.now()}`,
      branchId: currentBranch?.id || 'main',
      branchName: currentBranch?.name || 'الفرع الرئيسي',
      cashierName: currentEmpUser?.name || 'صيدلي الكاشير',
      cashierId: currentEmpUser?.id || 'cashier_1',
      startTime: new Date().toISOString(),
      openingCash: 500.00,
      totalSalesAmount: 0,
      salesCount: 0,
      status: 'open'
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('pharma_pos_active_shift', JSON.stringify(currentShift));
    } catch {}
  }, [currentShift]);

  // ── 3. محرك النوافذ المنبثقة العائمة المتعددة (Floating Multi-Window Canvas) ──
  const [salesWindows, setSalesWindows] = useState(() => {
    try {
      const saved = localStorage.getItem('pharma_pos_open_windows');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // نافذة البيع الافتراضية الأولى
    return [
      {
        id: 'win-1',
        title: 'شاشة بيع رئيسية #1',
        invoiceType: 'otc', // 'otc' | 'rx' | 'customer_order' | 'delivery'
        rxImage: null,
        deliveryDetails: { isDelivery: false, address: '', pilotName: '', deliveryFee: 0 },
        cart: [],
        customer: { name: '', phone: '', isChronic: false, walletBalance: 0 },
        position: { x: 30, y: 30 },
        size: { width: 920, height: 600 },
        isMinimized: false,
        isMaximized: false,
        zIndex: 10
      }
    ];
  });

  const [activeWindowId, setActiveWindowId] = useState('win-1');
  const maxZIndexRef = useRef(15);

  useEffect(() => {
    try {
      localStorage.setItem('pharma_pos_open_windows', JSON.stringify(salesWindows));
    } catch {}
  }, [salesWindows]);

  // زيادة zIndex لجلب النافذة للأمام عند النقر عليها
  const bringWindowToFront = useCallback((windowId) => {
    maxZIndexRef.current += 1;
    setActiveWindowId(windowId);
    setSalesWindows((prev) =>
      prev.map((win) =>
        win.id === windowId ? { ...win, zIndex: maxZIndexRef.current, isMinimized: false } : win
      )
    );
  }, []);

  // التبديل بين النوافذ عبر اختصار الكيبورد (Ctrl + Tab / Ctrl + Shift + Tab)
  const cycleActiveSalesWindow = useCallback((direction = 1) => {
    setSalesWindows((prev) => {
      if (!prev || prev.length <= 1) return prev;
      const currentIndex = prev.findIndex((w) => w.id === activeWindowId);
      const nextIndex = (currentIndex + direction + prev.length) % prev.length;
      const nextWin = prev[nextIndex];
      if (nextWin) {
        maxZIndexRef.current += 1;
        setActiveWindowId(nextWin.id);
        return prev.map((w) => (w.id === nextWin.id ? { ...w, zIndex: maxZIndexRef.current, isMinimized: false } : w));
      }
      return prev;
    });
  }, [activeWindowId]);

  // فتح نافذة بيع جديدة مستقلة تماماً (Multi-Customer / Multi-Cart Canvas)
  const openNewSalesWindow = useCallback((customTitle = null) => {
    maxZIndexRef.current += 1;
    const newId = `win-${Date.now()}`;
    const windowNumber = salesWindows.length + 1;
    const defaultTitle = customTitle || `شاشة بيع منبثقة #${windowNumber}`;

    // إزاحة موضع النافذة الجديدة قليلاً لتكون مكدسة بشكل جذاب (Cascading layout)
    const offset = (salesWindows.length % 5) * 28;
    const newX = Math.min(window.innerWidth - 600, 40 + offset);
    const newY = Math.min(window.innerHeight - 500, 40 + offset);

    const newWindow = {
      id: newId,
      title: defaultTitle,
      invoiceType: 'otc',
      rxImage: null,
      deliveryDetails: { isDelivery: false, address: '', pilotName: '', deliveryFee: 0 },
      cart: [],
      customer: { name: '', phone: '', isChronic: false, walletBalance: 0 },
      position: { x: newX, y: newY },
      size: { width: 920, height: 600 },
      isMinimized: false,
      isMaximized: false,
      zIndex: maxZIndexRef.current
    };

    setSalesWindows((prev) => [...prev, newWindow]);
    setActiveWindowId(newId);
    return newId;
  }, [salesWindows]);

  // إغلاق نافذة بيع
  const closeSalesWindow = useCallback((windowId) => {
    setSalesWindows((prev) => {
      const filtered = prev.filter((w) => w.id !== windowId);
      if (filtered.length === 0) {
        // إذا أغلقت كل النوافذ، نفتح تلقائياً نافذة بيع جديدة فارغة
        const fallbackId = `win-${Date.now()}`;
        return [
          {
            id: fallbackId,
            title: 'شاشة بيع رئيسية #1',
            invoiceType: 'otc',
            rxImage: null,
            deliveryDetails: { isDelivery: false, address: '', pilotName: '', deliveryFee: 0 },
            cart: [],
            customer: { name: '', phone: '', isChronic: false, walletBalance: 0 },
            position: { x: 30, y: 30 },
            size: { width: 920, height: 600 },
            isMinimized: false,
            isMaximized: false,
            zIndex: 10
          }
        ];
      }
      return filtered;
    });
  }, []);

  // تصغير النافذة للشريط السفلي
  const minimizeSalesWindow = useCallback((windowId) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, isMinimized: true } : w))
    );
  }, []);

  // تكبير النافذة لملء الشاشة أو استعادتها
  const toggleMaximizeSalesWindow = useCallback((windowId) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, isMaximized: !w.isMaximized } : w))
    );
  }, []);

  // تحديث إحداثيات موضع النافذة أثناء السحب
  const updateWindowPosition = useCallback((windowId, position) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, position } : w))
    );
  }, []);

  // تحديث أبعاد النافذة أثناء تغيير الحجم
  const updateWindowSize = useCallback((windowId, size) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, size } : w))
    );
  }, []);

  // تحديث سلة نافذة بيع معينة
  const updateWindowCart = useCallback((windowId, newCart) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, cart: newCart } : w))
    );
  }, []);

  // تحديث نوع الفاتورة بالكامل (OTC / روشتة / طلب عميل / دليفري) وتحديث تصنيف بنود السلة
  const updateWindowInvoiceType = useCallback((windowId, invoiceType) => {
    setSalesWindows((prev) =>
      prev.map((w) => {
        if (w.id !== windowId) return w;
        const itemTypeTarget = invoiceType === 'delivery' ? 'otc' : invoiceType;
        const updatedCart = (w.cart || []).map((it) => ({
          ...it,
          itemType: itemTypeTarget
        }));
        return { ...w, invoiceType, cart: updatedCart };
      })
    );
  }, []);

  // تحديث صورة الروشتة المنسوخة بالنافذة
  const updateWindowRxImage = useCallback((windowId, rxImage) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, rxImage, invoiceType: rxImage ? 'rx' : w.invoiceType } : w))
    );
  }, []);

  // تحديث تفاصيل الدليفري
  const updateWindowDeliveryDetails = useCallback((windowId, deliveryDetails) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, deliveryDetails: { ...(w.deliveryDetails || {}), ...deliveryDetails } } : w))
    );
  }, []);

  // تحديث بيانات عميل نافذة بيع معينة
  const updateWindowCustomer = useCallback((windowId, customerData) => {
    setSalesWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, customer: { ...w.customer, ...customerData } } : w))
    );
  }, []);

  // ── 4. عمليات السلة الذكية ──
  // إضافة صنف لسلة النافذة النشطة مع تشغيل صوت الباركود الفوري وتحديد نوع الصنف
  const addItemToActiveWindowCart = useCallback((product, unitType = 'base', qty = 1, customItemType = null) => {
    if (!product || !activeWindowId) return;

    // تشغيل نغمة مسح الباركود اللحظية
    playBarcodeSuccessBeep();

    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== activeWindowId) return win;

        const effectiveItemType = customItemType || win.invoiceType || (product.isTableDrug || product.isChronic ? 'rx' : 'otc');
        const currentCart = [...win.cart];
        const existingIndex = currentCart.findIndex(
          (item) => item.productId === product.id && item.unitType === unitType
        );

        if (existingIndex > -1) {
          // زيادة الكمية
          const existingItem = currentCart[existingIndex];
          const updatedQty = existingItem.quantity + qty;
          currentCart[existingIndex] = calculateCartItemLine(
            product,
            unitType,
            updatedQty,
            existingItem.discountPct,
            existingItem.itemType || effectiveItemType
          );
        } else {
          // إضافة سطر جديد
          const newLine = calculateCartItemLine(product, unitType, qty, 0, effectiveItemType);
          currentCart.push(newLine);
        }

        return { ...win, cart: currentCart };
      })
    );
  }, [activeWindowId]);

  // تعديل نوع الصنف الفردي داخل السلة (OTC ↔ Rx ↔ طلب عميل)
  const updateCartItemType = useCallback((windowId, itemIndex, newItemType) => {
    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== windowId) return win;
        const targetItem = win.cart[itemIndex];
        if (!targetItem) return win;

        const newCart = [...win.cart];
        newCart[itemIndex] = { ...targetItem, itemType: newItemType };
        return { ...win, cart: newCart };
      })
    );
  }, []);

  // إزالة صنف من السلة
  const removeItemFromCart = useCallback((windowId, itemIndex) => {
    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== windowId) return win;
        const newCart = win.cart.filter((_, idx) => idx !== itemIndex);
        return { ...win, cart: newCart };
      })
    );
  }, []);

  // تعديل كمية صنف
  const updateCartItemQuantity = useCallback((windowId, itemIndex, newQty) => {
    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== windowId) return win;
        const targetItem = win.cart[itemIndex];
        if (!targetItem) return win;

        const product = productsCatalog.find((p) => p.id === targetItem.productId);
        if (!product) return win;

        const updatedLine = calculateCartItemLine(
          product,
          targetItem.unitType,
          newQty,
          targetItem.discountPct
        );

        const newCart = [...win.cart];
        newCart[itemIndex] = updatedLine;
        return { ...win, cart: newCart };
      })
    );
  }, [productsCatalog]);

  // تبديل وحدة الصنف (علبة ⟵ شريط ⟵ قرص)
  const toggleCartItemUnit = useCallback((windowId, itemIndex) => {
    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== windowId) return win;
        const targetItem = win.cart[itemIndex];
        if (!targetItem) return win;

        const product = productsCatalog.find((p) => p.id === targetItem.productId);
        if (!product) return win;

        // الدورة: علبة -> شريط -> قرص (إن وجد) -> علبة
        let nextUnit = 'base';
        if (targetItem.unitType === 'base') nextUnit = 'sub';
        else if (targetItem.unitType === 'sub') nextUnit = (product.piecesPerSubUnit > 1 ? 'piece' : 'base');
        else nextUnit = 'base';

        const updatedLine = calculateCartItemLine(
          product,
          nextUnit,
          targetItem.quantity,
          targetItem.discountPct
        );

        const newCart = [...win.cart];
        newCart[itemIndex] = updatedLine;
        return { ...win, cart: newCart };
      })
    );
  }, [productsCatalog]);

  // تفريغ سلة النافذة
  const clearCart = useCallback((windowId) => {
    setSalesWindows((prev) =>
      prev.map((win) => (win.id === windowId ? { ...win, cart: [] } : win))
    );
  }, []);

  // ── 5. إتمام وتأكيد الفاتورة المعتمدة (Finalize & Checkout) ──
  const finalizeSale = useCallback(async ({
    windowId,
    paymentMethod = 'cash',
    paidAmount = null,
    discountAmount = 0,
    cashierEmpCode = null,
    cashierEmpName = null,
    cashierEmpId = null
  }) => {
    const targetWindow = salesWindows.find((w) => w.id === windowId);
    if (!targetWindow || targetWindow.cart.length === 0) return null;

    const subtotal = targetWindow.cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
    const finalDiscount = Math.min(subtotal, parseFloat(discountAmount) || 0);
    const netTotal = Math.max(0, subtotal - finalDiscount);
    const finalPaid = paidAmount !== null ? parseFloat(paidAmount) : netTotal;

    const totalCommissions = targetWindow.cart.reduce((sum, it) => sum + (it.instantCommission || 0), 0);

    const salePayload = {
      branchId: currentBranch?.id || 'main',
      branchName: currentBranch?.name || 'الفرع الرئيسي',
      cashierId: cashierEmpId || currentEmpUser?.id || 'cashier_1',
      cashierName: cashierEmpName || currentEmpUser?.name || 'صيدلي الكاشير',
      cashierEmpCode: cashierEmpCode || currentEmpUser?.code || '101',
      shiftId: currentShift.id,
      invoiceType: targetWindow.invoiceType || 'otc', // 'otc' | 'rx' | 'customer_order' | 'delivery'
      rxImage: targetWindow.rxImage || null,
      deliveryDetails: targetWindow.deliveryDetails || null,
      items: targetWindow.cart,
      subtotal,
      discountAmount: finalDiscount,
      totalAmount: netTotal,
      paidAmount: finalPaid,
      remainingAmount: Math.max(0, finalPaid - netTotal),
      paymentMethod,
      customerName: targetWindow.customer?.name || '',
      customerPhone: targetWindow.customer?.phone || '',
      isChronic: Boolean(targetWindow.customer?.isChronic),
      totalCommissions
    };

    // 1. اعتماد الفاتورة محلياً وحفظها في الـ Outbox
    const committed = commitLocalSale(salePayload);

    // تشغيل نغمة فتح الدرج ونجاح إتمام الفاتورة
    playCashRegisterChime();

    // 2. تحديث إحصائيات الوردية الحالية
    setCurrentShift((prev) => ({
      ...prev,
      totalSalesAmount: parseFloat(((prev.totalSalesAmount || 0) + netTotal).toFixed(2)),
      salesCount: (prev.salesCount || 0) + 1
    }));

    // 3. ربط العمولة مع الرواتب إذا كان الموظف مسجلاً
    if (totalCommissions > 0 && currentEmpUser?.id && setState) {
      setState((prev) => {
        if (!prev) return prev;
        const adjustments = prev.adjustments || [];
        const newAdj = {
          id: `spiff_${Date.now()}`,
          employeeId: currentEmpUser.id,
          employeeName: currentEmpUser.name || 'الصيدلي',
          type: 'bonus',
          category: 'sales_commission',
          title: `عمولة مبيعات لحظية - فاتورة #${committed.invoiceNumber} [${targetWindow.invoiceType === 'rx' ? 'روشتة' : 'مباشر'}]`,
          amount: totalCommissions,
          date: new Date().toISOString().slice(0, 10),
          status: 'approved',
          source: 'pos_commission_engine'
        };
        return { ...prev, adjustments: [newAdj, ...adjustments] };
      });
    }

    // 4. طباعة الريسيت الحراري التلقائي
    printPosSaleReceipt(committed, currentBranch, currentEmpUser?.name || 'صيدلي الكاشير');

    // 5. إفراغ سلة النافذة بعد نجاح البيع
    clearCart(windowId);

    return committed;
  }, [salesWindows, currentBranch, currentEmpUser, currentShift, clearCart, setState]);

  // ── 6. حالات المودالات والنوافذ الفرعية ──
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activePaymentSale, setActivePaymentSale] = useState(null);

  const [isSubstitutesModalOpen, setIsSubstitutesModalOpen] = useState(false);
  const [activeSubstituteTarget, setActiveSubstituteTarget] = useState(null);

  // مودال رصيد الفروع الأخرى (Inter-Branch Stock Inspector)
  const [isBranchStockModalOpen, setIsBranchStockModalOpen] = useState(false);
  const [branchStockTarget, setBranchStockTarget] = useState(null);

  const openBranchStockModal = useCallback((product) => {
    setBranchStockTarget(product);
    setIsBranchStockModalOpen(true);
  }, []);

  // مودال طلبات التوصيل والدليفري (Delivery Orders Modal)
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);

  // مودال إدارة العملاء السريع (Quick Customer Register Modal)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isDeadStockModalOpen, setIsDeadStockModalOpen] = useState(false);
  const [isChronicModalOpen, setIsChronicModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isShortcutsGuideOpen, setIsShortcutsGuideOpen] = useState(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);

  // إحصائيات المزامنة الحية
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getLocalOutbox().length);

  useEffect(() => {
    const handleOutboxUpdate = (e) => {
      if (typeof e.detail?.count === 'number') {
        setPendingSyncCount(e.detail.count);
      }
    };
    window.addEventListener('pos:outbox-updated', handleOutboxUpdate);
    return () => window.removeEventListener('pos:outbox-updated', handleOutboxUpdate);
  }, []);

  const value = {
    productsCatalog,
    setProductsCatalog,
    currentShift,
    setCurrentShift,
    salesWindows,
    activeWindowId,
    setActiveWindowId,
    openNewSalesWindow,
    closeSalesWindow,
    minimizeSalesWindow,
    toggleMaximizeSalesWindow,
    bringWindowToFront,
    cycleActiveSalesWindow,
    updateWindowPosition,
    updateWindowSize,
    updateWindowCart,
    updateWindowInvoiceType,
    updateWindowRxImage,
    updateWindowDeliveryDetails,
    updateWindowCustomer,
    addItemToActiveWindowCart,
    updateCartItemType,
    removeItemFromCart,
    updateCartItemQuantity,
    toggleCartItemUnit,
    clearCart,
    finalizeSale,
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    activePaymentSale,
    setActivePaymentSale,
    isSubstitutesModalOpen,
    setIsSubstitutesModalOpen,
    activeSubstituteTarget,
    setActiveSubstituteTarget,
    isBranchStockModalOpen,
    setIsBranchStockModalOpen,
    branchStockTarget,
    setBranchStockTarget,
    openBranchStockModal,
    isDeliveryModalOpen,
    setIsDeliveryModalOpen,
    isCustomerModalOpen,
    setIsCustomerModalOpen,
    isReturnsModalOpen,
    setIsReturnsModalOpen,
    isShiftModalOpen,
    setIsShiftModalOpen,
    isDeadStockModalOpen,
    setIsDeadStockModalOpen,
    isChronicModalOpen,
    setIsChronicModalOpen,
    isOcrModalOpen,
    setIsOcrModalOpen,
    isShortcutsGuideOpen,
    setIsShortcutsGuideOpen,
    isReportsModalOpen,
    setIsReportsModalOpen,
    pendingSyncCount
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}
