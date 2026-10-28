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
import { deductCustomerWallet } from '../services/posCustomerService';
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
      cashSalesAmount: 0,
      visaSalesAmount: 0,
      walletSalesAmount: 0,
      otherSalesAmount: 0,
      cashRefunds: 0,
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
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    // بدء النظام بدون فتح أي نافذة بيع إجبارياً
    return [];
  });

  const [activeWindowId, setActiveWindowId] = useState(null);
  const maxZIndexRef = useRef(150);

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
    const defaultTitle = customTitle || `شاشة بيع #${windowNumber}`;

    // حساب أبعاد متناسبة ومريحة تتسع لكامل عناصر النافذة وتملأ الشاشة بدقة
    const optimalW = typeof window !== 'undefined'
      ? Math.max(1050, Math.min(1380, window.innerWidth - 380))
      : 1180;
    const optimalH = typeof window !== 'undefined'
      ? Math.max(680, Math.min(880, window.innerHeight - 80))
      : 760;

    // موضع النافذة الافتراضي
    const offset = salesWindows.length === 0 ? 0 : (salesWindows.length % 5) * 20;
    const newX = 16 + offset;
    const newY = 12 + offset;

    const newWindow = {
      id: newId,
      title: defaultTitle,
      invoiceType: 'otc',
      rxImage: null,
      deliveryDetails: { isDelivery: false, address: '', pilotName: '', deliveryFee: 0 },
      cart: [],
      customer: { name: '', phone: '', isChronic: false, walletBalance: 0 },
      position: { x: newX, y: newY },
      size: { width: optimalW, height: optimalH },
      isMinimized: false,
      isMaximized: false,
      zIndex: maxZIndexRef.current
    };

    setSalesWindows((prev) => [...prev, newWindow]);
    setActiveWindowId(newId);
    return newId;
  }, [salesWindows]);

  // إغلاق نافذة بيع (مع السماح بإغلاق كافة النوافذ بحرية تامة دون إجبار)
  const closeSalesWindow = useCallback((windowId) => {
    setSalesWindows((prev) => {
      const filtered = prev.filter((w) => w.id !== windowId);
      if (filtered.length === 0) {
        setActiveWindowId(null);
        return [];
      }
      setActiveWindowId(filtered[filtered.length - 1].id);
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
        if (!product) {
          // دعم مرن للأصناف غير المكودة أو الأصناف المحملة خارج الكتالوج العام
          const unitPrice = parseFloat(targetItem.unitPrice || targetItem.price || 0);
          const lineSubtotal = parseFloat((unitPrice * newQty).toFixed(2));
          const discountPct = parseFloat(targetItem.discountPct || 0);
          const lineTotal = parseFloat((lineSubtotal * (1 - discountPct / 100)).toFixed(2));

          const updatedLine = {
            ...targetItem,
            quantity: newQty,
            lineSubtotal,
            lineTotal
          };

          const newCart = [...win.cart];
          newCart[itemIndex] = updatedLine;
          return { ...win, cart: newCart };
        }

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
        if (!product) {
          if (targetItem.subUnitsCount > 1) {
            const nextUnit = targetItem.unitType === 'base' ? 'sub' : 'base';
            const unitPrice = nextUnit === 'sub'
              ? parseFloat(((targetItem.basePrice || targetItem.unitPrice) / targetItem.subUnitsCount).toFixed(2))
              : (targetItem.basePrice || targetItem.unitPrice);
            const lineSubtotal = parseFloat((unitPrice * targetItem.quantity).toFixed(2));
            const lineTotal = parseFloat((lineSubtotal * (1 - (targetItem.discountPct || 0) / 100)).toFixed(2));

            const updatedLine = {
              ...targetItem,
              unitType: nextUnit,
              unitName: nextUnit === 'sub' ? 'شريط' : 'علبة',
              unitPrice,
              lineSubtotal,
              lineTotal
            };
            const newCart = [...win.cart];
            newCart[itemIndex] = updatedLine;
            return { ...win, cart: newCart };
          }
          return win;
        }

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

  // إضافة صنف حر / غير مكود لسلة النافذة النشطة مباشرة
  const addUncodedItemToActiveCart = useCallback(({
    tradeNameAr = 'صنف غير مكود',
    tradeNameEn = 'Custom Item',
    publicPrice = 0,
    costPrice = 0,
    qty = 1,
    unitName = 'قطعة',
    itemType = 'otc'
  }) => {
    if (!activeWindowId) return;

    playBarcodeSuccessBeep();

    const priceNum = Math.max(0, parseFloat(publicPrice) || 0);
    const costNum = Math.max(0, parseFloat(costPrice) || (priceNum * 0.75));
    const qtyNum = Math.max(0.1, parseFloat(qty) || 1);
    const uncodedId = `uncoded_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const uncodedProduct = {
      id: uncodedId,
      barcode: uncodedId,
      barcodes: [uncodedId],
      tradeNameAr: tradeNameAr.trim() || 'صنف غير مكود',
      tradeNameEn: tradeNameEn.trim() || 'Custom Item',
      genericName: 'صنف يدوي غير مكود',
      category: 'أصناف حرة',
      dosageForm: unitName || 'قطعة',
      strength: '',
      packSize: 1,
      baseUnit: unitName || 'قطعة',
      subUnit: unitName || 'قطعة',
      piecesPerSubUnit: 1,
      publicPrice: priceNum,
      costPrice: costNum,
      subUnitPrice: priceNum,
      isTableDrug: false,
      isChronic: false,
      isUncoded: true,
      commissionPct: 0,
      batches: [{ id: `b_${uncodedId}`, batchNo: 'MANUAL', expiryDate: '2029-12-31', qtyBase: 999 }]
    };

    setSalesWindows((prev) =>
      prev.map((win) => {
        if (win.id !== activeWindowId) return win;
        const currentCart = [...win.cart];
        const lineTotal = parseFloat((priceNum * qtyNum).toFixed(2));
        const newLine = {
          productId: uncodedProduct.id,
          tradeNameAr: uncodedProduct.tradeNameAr,
          tradeNameEn: uncodedProduct.tradeNameEn,
          genericName: uncodedProduct.genericName,
          barcode: uncodedProduct.barcode,
          category: uncodedProduct.category,
          unitType: 'base',
          unitLabel: unitName || 'قطعة',
          quantity: qtyNum,
          unitPrice: priceNum,
          unitCost: costNum,
          discountPct: 0,
          discountAmount: 0,
          lineTotal,
          instantCommission: 0,
          isChronic: false,
          chronicDailyDose: 1,
          itemType: itemType || win.invoiceType || 'otc',
          isUncoded: true,
          selectedBatch: uncodedProduct.batches[0]
        };
        currentCart.push(newLine);
        return { ...win, cart: currentCart };
      })
    );
  }, [activeWindowId]);

  // ── 5. إتمام وتأكيد الفاتورة المعتمدة (Finalize & Checkout) ──
  const finalizeSale = useCallback(async ({
    windowId,
    paymentMethod = 'cash',
    paidAmount = null,
    discountAmount = 0,
    walletDeducted = 0,
    cashierEmpCode = null,
    cashierEmpName = null,
    cashierEmpId = null,
    printReceipt = true,
    splitPayments = null,
    telecomDetails = null
  }) => {
    const targetWindow = salesWindows.find((w) => w.id === windowId);
    if (!targetWindow || targetWindow.cart.length === 0) return null;

    const subtotal = targetWindow.cart.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
    const finalDiscount = Math.min(subtotal, parseFloat(discountAmount) || 0);

    // احتساب رسوم خدمة التوصيل بدقة
    const isDelivery = targetWindow.invoiceType === 'delivery' || Boolean(targetWindow.deliveryDetails?.isDelivery);
    const deliveryFee = isDelivery ? (parseFloat(targetWindow.deliveryDetails?.deliveryFee) || 0) : 0;

    const remainingBeforeWallet = Math.max(0, parseFloat((subtotal - finalDiscount + deliveryFee).toFixed(2)));
    const finalWalletDeducted = Math.min(remainingBeforeWallet, parseFloat(walletDeducted) || 0);
    const netTotal = Math.max(0, parseFloat((remainingBeforeWallet - finalWalletDeducted).toFixed(2)));
    const finalPaid = paidAmount !== null ? parseFloat(paidAmount) : netTotal;

    const totalCommissions = targetWindow.cart.reduce((sum, it) => sum + (it.instantCommission || 0), 0);

    const nextInvoiceSeq = (currentShift?.salesCount || 0) + 1;
    const sequentialInvoiceNumber = String(nextInvoiceSeq);

    // تفصيل طرق السداد والنقدية لدرج الكاشير
    let tenderCash = 0;
    let tenderVisa = 0;
    let tenderWallet = finalWalletDeducted;
    let tenderOther = 0;

    if (paymentMethod === 'cash') {
      tenderCash = netTotal;
    } else if (paymentMethod === 'visa' || paymentMethod === 'card') {
      tenderVisa = netTotal;
    } else if (paymentMethod === 'customer_wallet' || paymentMethod === 'wallet' || paymentMethod === 'telecom_wallet') {
      tenderWallet += netTotal;
    } else if (paymentMethod === 'split' && splitPayments) {
      tenderCash = parseFloat(splitPayments.cash || 0);
      tenderVisa = parseFloat(splitPayments.visa || 0);
      tenderWallet += parseFloat(splitPayments.wallet || 0);
      tenderOther = parseFloat(splitPayments.other || 0);
    } else {
      tenderCash = netTotal;
    }

    const salePayload = {
      branchId: currentBranch?.id || 'main',
      branchName: currentBranch?.name || 'الفرع الرئيسي',
      cashierId: cashierEmpId || currentEmpUser?.id || 'cashier_1',
      cashierName: cashierEmpName || currentEmpUser?.name || 'صيدلي الكاشير',
      cashierEmpCode: cashierEmpCode || currentEmpUser?.code || '101',
      shiftId: currentShift.id,
      invoiceNumber: sequentialInvoiceNumber,
      sequenceNumber: nextInvoiceSeq,
      invoiceType: targetWindow.invoiceType || 'otc', // 'otc' | 'rx' | 'customer_order' | 'delivery'
      rxImage: targetWindow.rxImage || null,
      deliveryDetails: targetWindow.deliveryDetails || null,
      deliveryFee,
      deliveryStatus: targetWindow.invoiceType === 'delivery' ? 'pending' : null,
      items: targetWindow.cart,
      subtotal,
      discountAmount: finalDiscount,
      walletDeducted: finalWalletDeducted,
      totalAmount: netTotal,
      paidAmount: finalPaid,
      remainingAmount: Math.max(0, parseFloat((finalPaid - netTotal).toFixed(2))),
      paymentMethod,
      splitPayments,
      telecomDetails,
      tenderBreakdown: {
        cash: tenderCash,
        visa: tenderVisa,
        wallet: tenderWallet,
        other: tenderOther
      },
      customerName: targetWindow.customer?.name || '',
      customerPhone: targetWindow.customer?.phone || '',
      customerId: targetWindow.customer?.id || null,
      isChronic: Boolean(targetWindow.customer?.isChronic),
      totalCommissions
    };

    // 1. اعتماد الفاتورة محلياً وحفظها في الـ Outbox
    const committed = commitLocalSale(salePayload);

    // تشغيل نغمة فتح الدرج ونجاح إتمام الفاتورة
    playCashRegisterChime();

    // 2. تحديث إحصائيات الوردية الحالية مع فصل الكاش الفعلي عن الفيزا والمحافظ
    setCurrentShift((prev) => ({
      ...prev,
      totalSalesAmount: parseFloat(((prev?.totalSalesAmount || 0) + (netTotal + finalWalletDeducted)).toFixed(2)),
      cashSalesAmount: parseFloat(((prev?.cashSalesAmount || 0) + tenderCash).toFixed(2)),
      visaSalesAmount: parseFloat(((prev?.visaSalesAmount || 0) + tenderVisa).toFixed(2)),
      walletSalesAmount: parseFloat(((prev?.walletSalesAmount || 0) + tenderWallet).toFixed(2)),
      otherSalesAmount: parseFloat(((prev?.otherSalesAmount || 0) + tenderOther).toFixed(2)),
      salesCount: (prev?.salesCount || 0) + 1
    }));

    // 3. خصم رصيد المحفظة الفعلي من حساب العميل مركزياً ومحلياً
    if (targetWindow.customer?.id && tenderWallet > 0) {
      try {
        deductCustomerWallet({
          customerId: targetWindow.customer.id,
          amount: tenderWallet,
          invoiceNumber: sequentialInvoiceNumber,
          employeeCode: cashierEmpCode || currentEmpUser?.code || '101',
          employeeName: cashierEmpName || currentEmpUser?.name || 'صيدلي الكاشير',
          branchId: currentBranch?.id || 'main',
          branchName: currentBranch?.name || 'الفرع الرئيسي'
        });
      } catch (wErr) {
        console.warn('Customer wallet deduction error:', wErr);
      }
    }

    // 4. ربط العمولة مع الرواتب إذا كان الموظف مسجلاً
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

    // 5. طباعة الريسيت الحراري التلقائي (إذا لم يتم تخطيه للبيع السريع بدون ريسيت)
    if (printReceipt !== false) {
      printPosSaleReceipt(committed, currentBranch, currentEmpUser?.name || 'صيدلي الكاشير');
    }

    // 6. إفراغ سلة النافذة بعد نجاح البيع
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
  const [reportsActiveTab, setReportsActiveTab] = useState('shifts');

  // مودال سجل العميل والمشتريات السابقة والمحفظة (Customer Purchase History & Wallet Modal)
  const [isCustomerHistoryOpen, setIsCustomerHistoryOpen] = useState(false);
  const [customerHistoryTarget, setCustomerHistoryTarget] = useState(null);

  const openCustomerHistoryModal = useCallback((customerObj) => {
    setCustomerHistoryTarget(customerObj);
    setIsCustomerHistoryOpen(true);
  }, []);

  // شاشة ورادار المالك لمتابعة كافة الفروع (Owner Multi-Branch POS Hub)
  const [isOwnerHubOpen, setIsOwnerHubOpen] = useState(false);

  // مركز ومودال رسائل الواتساب الفورية لفرع الصيدلية
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

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

  const currentShiftInvoiceSeq = (currentShift?.salesCount || 0) + 1;

  const value = {
    productsCatalog,
    setProductsCatalog,
    currentShift,
    setCurrentShift,
    currentShiftInvoiceSeq,
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
    addUncodedItemToActiveCart,
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
    reportsActiveTab,
    setReportsActiveTab,
    isCustomerHistoryOpen,
    setIsCustomerHistoryOpen,
    customerHistoryTarget,
    openCustomerHistoryModal,
    isOwnerHubOpen,
    setIsOwnerHubOpen,
    isWhatsAppModalOpen,
    setIsWhatsAppModalOpen,
    pendingSyncCount
  };

  return <POSContext.Provider value={value}>{children}</POSContext.Provider>;
}
