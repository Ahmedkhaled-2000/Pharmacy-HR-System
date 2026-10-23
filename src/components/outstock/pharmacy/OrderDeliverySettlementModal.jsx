import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle,
  DollarSign,
  CreditCard,
  Smartphone,
  Clock,
  Printer,
  User,
  Phone,
  FileText,
  AlertCircle,
  PackageCheck,
  TrendingUp,
  ShieldCheck,
  Zap,
  Wallet,
  Lock,
  Layers,
  HelpCircle,
  Check
} from 'lucide-react';
import { outstockSettleAndDeliverOrder } from '../../../utils/outstockApiClient';
import { printCustomerWalletReceipt } from '../../../utils/printCustomerWalletReceipt';

/**
 * OrderDeliverySettlementModal.jsx
 * نافذة تسليم الطلب للعميل (تسليم كلي أو تسليم جزئي للأصناف المتوفرة)
 * مع محرك خيارات توزيع العربون:
 * 1. سحب كامل العربون المتاح للأصناف المتوفرة
 * 2. الاحتفاظ بالعربون بالكامل للأصناف المتبقية قيد الرد
 * 3. تخصيص مبلغ يدوي من العربون
 */
export default function OrderDeliverySettlementModal({
  order,
  branch,
  currentPharmacist = '',
  deliveredBy = null, // { code: string, name: string }
  onClose,
  onDeliveredSuccess,
  onOpenReceiptPrint,
  showToast = alert
}) {
  const allOrderItems = useMemo(() => Array.isArray(order?.items) ? order.items : [], [order]);

  // تصنيف الأصناف:
  // 1. الأصناف المتوفرة الجاهزة للتسليم (ردت المشتريات عليها بالتوفر الفعلي وليست قيد التجهيز)
  const availableItems = useMemo(() => {
    return allOrderItems.filter((it) => {
      const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
      const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
      const isDelivered = itmStatus === 'delivered';
      const isInPreparation = itmStatus === 'in_preparation';
      const isAvailable = itmStatus === 'available_by_procurement' || itmStatus === 'available';
      return !isPruned && !isDelivered && !isInPreparation && isAvailable;
    });
  }, [allOrderItems]);

  // 1.5 الأصناف قيد التجهيز من المشتريات (غير متاحة للتسليم)
  const inPreparationItems = useMemo(() => {
    return allOrderItems.filter((it) => {
      const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
      const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
      return !isPruned && itmStatus === 'in_preparation';
    });
  }, [allOrderItems]);

  // 2. الأصناف المعلقة بانتظار رد المشتريات
  const pendingItems = useMemo(() => {
    return allOrderItems.filter((it) => {
      const isPruned = Boolean(it.pruned_from_bill || it.prunedFromBill);
      const itmStatus = String(it.item_status || it.itemStatus || it.status || '').toLowerCase();
      const isDelivered = itmStatus === 'delivered';
      const isReplied = Boolean(it.procurement_replied_at);
      return !isPruned && !isDelivered && !isReplied && (itmStatus === 'pending' || !itmStatus);
    });
  }, [allOrderItems]);

  // 3. الأصناف المسلمة سابقاً (إن وجدت)
  const previouslyDeliveredItems = useMemo(() => {
    return allOrderItems.filter((it) => String(it.item_status || it.itemStatus || '').toLowerCase() === 'delivered');
  }, [allOrderItems]);

  // 4. الأصناف المشطوبة لعدم التوفر بالسوق
  const prunedItems = useMemo(() => {
    return allOrderItems.filter((it) => Boolean(it.pruned_from_bill || it.prunedFromBill));
  }, [allOrderItems]);

  // الأصناف المختارة للتسليم الآن (افتراضياً: كل الأصناف المتوفرة)
  const [selectedItemIds, setSelectedItemIds] = useState(() => availableItems.map((it) => it.id));

  useEffect(() => {
    setSelectedItemIds(availableItems.map((it) => it.id));
  }, [availableItems]);

  const toggleItemSelection = (id) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) {
          showToast?.('⚠️ يجب اختيار صنف واحد على الأقل لتسليمه للعميل');
          return prev;
        }
        return prev.filter((x) => x !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // كائنات الأصناف المختارة للتسليم
  const deliveringItems = useMemo(() => {
    return availableItems.filter((it) => selectedItemIds.includes(it.id));
  }, [availableItems, selectedItemIds]);

  // إجمالي قيمة الأصناف المختارة للتسليم
  const deliveringItemsTotal = useMemo(() => {
    return deliveringItems.reduce((acc, it) => {
      const qty = parseInt(it.quantity || 1, 10);
      const price = parseFloat(it.unit_price || it.unitPrice || 0);
      return acc + (qty * price);
    }, 0);
  }, [deliveringItems]);

  // إجمالي قيمة الأصناف المتبقية قيد الرد
  const remainingPendingTotal = useMemo(() => {
    return pendingItems.reduce((acc, it) => {
      const qty = parseInt(it.quantity || 1, 10);
      const price = parseFloat(it.unit_price || it.unitPrice || 0);
      return acc + (qty * price);
    }, 0);
  }, [pendingItems]);

  // العربون المدفوع مسبقاً والمتاح في هذا الطلب
  const paidAdvance = parseFloat(order?.paid_amount || order?.paidAmount || 0);

  // خيارات توزيع العربون:
  // 'full_deposit': سحب كامل العربون المتاح للأصناف المتوفرة الآن
  // 'keep_for_pending': الاحتفاظ بالعربون بالكامل للأصناف المتبقية قيد الرد
  // 'custom': تخصيص يدوي لمبلغ العربون المستقطع
  const [depositOption, setDepositOption] = useState('full_deposit');
  const [customDepositAmount, setCustomDepositAmount] = useState('');

  // احتساب العربون المستقطع فعلياً لهذه الأصناف المسلمة
  const depositUsed = useMemo(() => {
    if (depositOption === 'keep_for_pending') {
      return 0;
    }
    if (depositOption === 'custom') {
      const cNum = parseFloat(customDepositAmount) || 0;
      return Math.min(paidAdvance, Math.min(deliveringItemsTotal, Math.max(0, cNum)));
    }
    // full_deposit
    return Math.min(paidAdvance, deliveringItemsTotal);
  }, [depositOption, customDepositAmount, paidAdvance, deliveringItemsTotal]);

  // العربون المتبقي المحجوز للأصناف قيد الرد
  const remainingReservedDeposit = Math.max(0, paidAdvance - depositUsed);

  // المطلوب تحصيله الآن للأصناف المتوفرة
  const calculatedDueNow = Math.max(0, deliveringItemsTotal - depositUsed);
  const downPaymentExcess = Math.max(0, depositUsed - deliveringItemsTotal);

  const [collectedAmount, setCollectedAmount] = useState(String(calculatedDueNow));
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [refundOption, setRefundOption] = useState('cash'); // 'cash' | 'wallet' | 'ewallet' | 'instapay'
  const [deliveryAuthCode, setDeliveryAuthCode] = useState('');
  const [refundEmployeeCode, setRefundEmployeeCode] = useState('');
  const [ewalletPhone, setEwalletPhone] = useState(order?.customer_phone || '');
  const [instapayAccount, setInstapayAccount] = useState(order?.customer_phone || '');
  const [printWalletReceiptAfter, setPrintWalletReceiptAfter] = useState(true);

  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'wallet' | 'credit'
  const [cashierName, setCashierName] = useState(deliveredBy?.name || currentPharmacist || 'د. الصيدلي');
  const [receiptNumber, setReceiptNumber] = useState(`REC-${order?.order_number || Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState('');
  const [shouldPrintReceipt, setShouldPrintReceipt] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // تحديث المبلغ المطلوب عند تغير خيارات العربون أو الأصناف
  useEffect(() => {
    setCollectedAmount(String(calculatedDueNow > 0 ? calculatedDueNow : 0));
  }, [calculatedDueNow]);

  // منع تمرير خلفية الصفحة أثناء فتح النافذة
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (!isSubmitting) {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmitting]);

  if (!order) return null;

  // احتساب المتبقي بعد التحصيل الحالي
  const currentCollectNum = Math.max(0, parseFloat(collectedAmount) || 0);

  // احتساب الباقي والفائض المستحق للعميل
  const tenderedNum = parseFloat(tenderedAmount || 0);
  const tenderedExcess = (paymentMethod === 'cash' && tenderedNum > currentCollectNum) ? (tenderedNum - currentCollectNum) : 0;
  const customerChangeDue = downPaymentExcess > 0 ? downPaymentExcess : tenderedExcess;

  const isPartialDelivery = pendingItems.length > 0 || (availableItems.length > deliveringItems.length);
  const hasNoAvailableItems = availableItems.length === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (hasNoAvailableItems) {
      showToast?.('🚫 لا توجد أي أصناف جاهزة للتسليم حالياً في هذا الطلب بانتظار رد وموافقة المشتريات');
      return;
    }

    if (deliveringItems.length === 0) {
      showToast?.('⚠️ يرجى تحديد صنف واحد على الأقل لتسليمه للعميل');
      return;
    }

    const finalDeliverCode = (deliveredBy?.code || deliveryAuthCode || '').trim();
    if (!finalDeliverCode) {
      showToast?.('⚠️ يرجى إدخال كود الموظف المشفر لتوثيق التسليم للعميل 🔒');
      return;
    }

    const finalRefundCode = (deliveredBy?.code || refundEmployeeCode || deliveryAuthCode || '').trim();

    // التحقق من خيارات استرداد الباقي للعميل
    if (customerChangeDue > 0) {
      if (refundOption === 'wallet' && !finalRefundCode) {
        showToast?.('⚠️ يرجى إدخال كود الموظف المشفر لتوثيق إيداع الباقي في محفظة العميل 🔒');
        return;
      }
      if (refundOption === 'ewallet' && !ewalletPhone.trim()) {
        showToast?.('⚠️ يرجى إدخال رقم المحفظة الإلكترونية المحول إليها الباقي');
        return;
      }
      if (refundOption === 'instapay' && !instapayAccount.trim()) {
        showToast?.('⚠️ يرجى إدخال معرف إنستاباي أو رقم الهاتف المحول إليه الباقي');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const refundAccountDesc = refundOption === 'ewallet' ? ewalletPhone : (refundOption === 'instapay' ? instapayAccount : null);
      const refundNotesSuffix = customerChangeDue > 0
        ? `[رد باقي: ${customerChangeDue.toFixed(2)} ج.م عبر ${
            refundOption === 'cash'
              ? 'كاش نقدي'
              : refundOption === 'wallet'
              ? 'إيداع بالمحفظة'
              : refundOption === 'ewallet'
              ? `محفظة إلكترونية (${ewalletPhone})`
              : `إنستاباي (${instapayAccount})`
          }]`
        : '';

      const res = await outstockSettleAndDeliverOrder(order.id, {
        collectedAmount: currentCollectNum,
        paymentMethod,
        cashierName: deliveredBy?.name || cashierName,
        deliveredByCode: finalDeliverCode,
        deliveredByName: deliveredBy?.name || cashierName,
        receiptNumber,
        deliveredItemIds: deliveringItems.map((it) => it.id),
        depositUsed,
        refundToWallet: refundOption === 'wallet' ? customerChangeDue : 0,
        refundMethod: refundOption,
        refundAccount: refundAccountDesc,
        refundEmployeeCode: finalRefundCode || null,
        notes: [
          notes.trim() || `تسليم ${isPartialDelivery ? 'جزئي' : 'كلي'} لطلب العميل ${order.customer_name || ''}`,
          isPartialDelivery ? `(تم استقطاع ${depositUsed.toFixed(2)} ج.م من العربون، والمتبقي المحجوز ${remainingReservedDeposit.toFixed(2)} ج.م)` : '',
          refundNotesSuffix
        ].filter(Boolean).join(' - ')
      });

      if (res?.success) {
        showToast?.(
          isPartialDelivery
            ? `✅ تم التسليم الجزئي بنجاح (${deliveringItems.length} صنف)! تم تحصيل ${currentCollectNum.toFixed(2)} ج.م والعربون المحفوظ للصنف المتبقي: ${remainingReservedDeposit.toFixed(2)} ج.م.`
            : `✅ تم تسليم الطلب بالكامل بنجاح! تم تحصيل ${currentCollectNum.toFixed(2)} ج.م وإدراجها في مبيعات الفرع اليومية.`
        );

        // طباعة إيصال المحفظة الحراري تلقائياً إذا اختار إيداع الباقي بالمحفظة
        if (customerChangeDue > 0 && refundOption === 'wallet' && printWalletReceiptAfter) {
          try {
            printCustomerWalletReceipt({
              receiptNumber: `WAL-${order.order_number || Date.now().toString().slice(-6)}`,
              customer: {
                id: order.customer_id,
                full_name: order.customer_name,
                whatsapp_phone: order.customer_phone
              },
              transactionType: 'deposit',
              amount: customerChangeDue,
              paymentMethod: 'return_settlement',
              employeeCode: finalRefundCode || 'PHARMACIST',
              employeeName: deliveredBy?.name || cashierName,
              branchName: branch?.name || 'صيدلية الفرع',
              notes: `إيداع باقي حساب تسليم طلب #${order.order_number || ''}`
            });
          } catch (pErr) {
            console.warn('Wallet receipt print error:', pErr);
          }
        }

        // إعداد بيانات الإيصال للأصناف المسلمة فقط
        const receiptOrderPayload = {
          ...order,
          items: deliveringItems,
          order_status: isPartialDelivery ? 'partially_delivered' : 'delivered',
          total_amount: deliveringItemsTotal,
          net_amount: deliveringItemsTotal,
          paid_amount: depositUsed,
          remaining_amount: 0,
          justCollectedAmount: currentCollectNum,
          deliveryPaymentMethod: paymentMethod,
          deliveredAt: new Date().toISOString(),
          isPartialDelivery,
          remainingReservedDeposit,
          pendingItemsCount: pendingItems.length,
          deliveredByEmployee: deliveredBy?.name || cashierName
        };

        if (shouldPrintReceipt && onOpenReceiptPrint) {
          onOpenReceiptPrint(receiptOrderPayload);
        }

        if (onDeliveredSuccess) {
          onDeliveredSuccess(
            {
              ...order,
              order_status: isPartialDelivery ? 'partially_delivered' : 'delivered',
              paid_amount: remainingReservedDeposit,
              remaining_amount: Math.max(0, remainingPendingTotal - remainingReservedDeposit),
              items: allOrderItems.map((it) =>
                deliveringItems.some((d) => d.id === it.id)
                  ? { ...it, item_status: 'delivered', is_delivered: true, delivered_at: new Date().toISOString() }
                  : it
              )
            },
            {
              wasPartial: isPartialDelivery,
              deliveredItems: deliveringItems,
              remainingPendingItems: pendingItems,
              reservedDeposit: remainingReservedDeposit
            }
          );
        }

        onClose();
      } else {
        showToast?.(`⚠️ فشل تسليم الطلب: ${res?.error || 'حدث خطأ أثناء الاتصال'}`);
      }
    } catch (err) {
      showToast?.(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
        overscrollBehavior: 'contain'
      }}
    >
      <div
        className="outstock-settlement-modal"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          direction: 'rtl',
          overscrollBehavior: 'contain'
        }}
      >
        {/* ── الرأس المؤسسي ── */}
        <div
          style={{
            padding: '16px 24px',
            background: isPartialDelivery ? '#f8fafc' : '#ffffff',
            borderBottom: '1px solid var(--outstock-border-subtle, #e2e8f0)',
            color: '#0f172a',
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
                borderRadius: '10px',
                background: isPartialDelivery ? '#eff6ff' : '#ecfdf5',
                border: `1px solid ${isPartialDelivery ? '#bfdbfe' : '#a7f3d0'}`,
                color: isPartialDelivery ? '#1d4ed8' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PackageCheck size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>
                  {isPartialDelivery ? 'تسليم الأصناف المتوفرة (تسليم جزئي)' : 'تسليم الطلب للعميل وتسوية الحساب'}
                </h3>
                {isPartialDelivery && (
                  <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                    تسليم جزئي 📦
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                رقم الإيصال: <span className="tabular-nums" style={{ fontFamily: 'var(--outstock-font-mono)', fontWeight: 'bold' }}>{order.order_number || order.orderNumber}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── جسم النافذة القابل للتمرير ── */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* إشعار وتنبيه الأصناف المعلقة بانتظار رد المشتريات */}
          {hasNoAvailableItems ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1.5px solid #ef4444',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}
            >
              <AlertCircle size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: '800', fontSize: '13.5px' }}>
                  🚫 محظور تسليم الطلب حالياً!
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px', lineHeight: '1.5' }}>
                  جميع أصناف هذا الطلب ({pendingItems.length} صنف) ما زالت قيد الرد والموافقة من قِبل إدارة المشتريات. لا يمكن تسليم الطلب حتى يتوفر صنف واحد على الأقل.
                </div>
              </div>
            </div>
          ) : pendingItems.length > 0 ? (
            <div
              style={{
                background: '#eff6ff',
                border: '1.5px solid #93c5fd',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#1e40af',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}
            >
              <Layers size={20} color="#2563eb" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: '800', fontSize: '13.5px' }}>
                  ⚡ تسليم جزئي مدعوم (أصناف متوفرة وأخرى قيد الرد)
                </div>
                <div style={{ fontSize: '12px', marginTop: '4px', lineHeight: '1.5' }}>
                  يتوفر ({availableItems.length}) صنف جاهز للتسليم الفوري للعميل، بينما هناك ({pendingItems.length}) صنف قيد الرد من المشتريات:
                  <strong style={{ display: 'block', marginTop: '2px', color: '#1d4ed8' }}>
                    {pendingItems.map((it) => it.medication_name || it.item_name || it.medicationName).join(' ، ')}
                  </strong>
                  يمكنك تسليم الأصناف المتوفرة الآن، وتحديد سياسة استقطاع العربون، ثم متابعة الصنف المتبقي فور وروده.
                </div>
              </div>
            </div>
          ) : null}

          {/* توثيق هوية الموظف المسلّم بالكود المشفر */}
          {deliveredBy?.code ? (
            <div
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '10px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <ShieldCheck size={18} color="#16a34a" />
              <div style={{ fontSize: '12.5px' }}>
                <span style={{ color: '#166534', fontWeight: '700' }}>الموظف المسلّم (موثق بالرمز الأمني 🔒): </span>
                <strong style={{ color: '#14532d' }}>{deliveredBy.name}</strong>
                <span style={{ marginRight: '6px', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 'bold', color: '#15803d' }}>
                  كود: {deliveredBy.code}
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="#64748b" />
                <span>كود الموظف السري (إلزامي لتوثيق التسليم الأمني 🔒):</span>
              </label>
              <input
                type="password"
                placeholder="أدخل كود الموظف المسؤول عن التسليم"
                value={deliveryAuthCode}
                onChange={(e) => setDeliveryAuthCode(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid #94a3b8',
                  fontSize: '13px',
                  fontWeight: '700',
                  letterSpacing: '2px',
                  outline: 'none'
                }}
                required
              />
            </div>
          )}

          {/* كارت معلومات العميل */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              fontSize: '12.5px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={15} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>اسم العميل</span>
                <strong style={{ color: '#1e293b' }}>{order.customer_name || order.customerName || 'عميل نقدي'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={15} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>رقم الهاتف / الواتساب</span>
                <span style={{ color: '#1e293b', direction: 'ltr', display: 'inline-block', fontFamily: 'monospace' }}>
                  {order.customer_phone || order.customerPhone || 'غير مسجل'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={15} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>تاريخ الطلب</span>
                <span style={{ color: '#1e293b' }}>
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('ar-EG') : 'اليوم'}
                </span>
              </div>
            </div>
          </div>

          {/* ── 1. جدول الأصناف المتوفرة الجاهزة للتسليم ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '13.5px', color: '#0f172a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} color="#16a34a" />
                <span>الأصناف المتوفرة للتسليم الآن ({deliveringItems.length} من {availableItems.length} متوفر):</span>
              </h4>
              <span style={{ fontSize: '12px', color: '#047857', fontWeight: '800' }}>
                إجمالي المتوفر: {deliveringItemsTotal.toFixed(2)} ج.م
              </span>
            </div>

            <div style={{ border: '1px solid #bbf7d0', borderRadius: '10px', overflow: 'hidden', background: '#ffffff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f0fdf4', color: '#166534', textAlign: 'right', borderBottom: '1px solid #bbf7d0' }}>
                    <th style={{ padding: '8px 10px', width: '36px', textAlign: 'center' }}>تحديد</th>
                    <th style={{ padding: '8px 10px' }}>الصنف المتوفر</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>الكمية</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>السعر</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {availableItems.length > 0 ? (
                    availableItems.map((it, idx) => {
                      const isChecked = selectedItemIds.includes(it.id);
                      const unitPrice = parseFloat(it.unit_price || it.unitPrice || 0);
                      const totalP = parseInt(it.quantity || 1, 10) * unitPrice;

                      return (
                        <tr
                          key={it.id || idx}
                          onClick={() => toggleItemSelection(it.id)}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isChecked ? '#ffffff' : '#f8fafc',
                            cursor: 'pointer',
                            opacity: isChecked ? 1 : 0.6
                          }}
                        >
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleItemSelection(it.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: '700', color: '#1e293b' }}>
                            {it.medication_name || it.medicationName}
                            <span style={{ fontSize: '11px', color: '#64748b', marginRight: '6px' }}>
                              ({it.unit_type === 'pack' ? 'عبوة' : 'شريط'})
                            </span>
                            <span style={{ marginRight: '6px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '800' }}>
                              ✓ متوفر
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>
                            {it.quantity}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>
                            {unitPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', color: '#047857' }}>
                            {totalP.toFixed(2)} ج.م
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '14px', textAlign: 'center', color: '#94a3b8' }}>
                        لا توجد أصناف متوفرة للتسليم بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 2. عرض الأصناف المتبقية قيد الرد (إن وُجدت) ── */}
          {pendingItems.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} />
                  <span>أصناف متبقية قيد الرد من المشتريات ({pendingItems.length} صنف):</span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#b45309' }}>
                  إجمالي قيمتها التقديرية: {remainingPendingTotal.toFixed(2)} ج.م
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pendingItems.map((it, idx) => (
                  <span
                    key={it.id || idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fcd34d',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      color: '#78350f',
                      fontWeight: '700'
                    }}
                  >
                    ⏳ {it.medication_name || it.medicationName} × {it.quantity} ({parseFloat(it.total_price || it.totalPrice || 0).toFixed(2)} ج.م)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── 3. محرك تخصيص وتوزيع العربون (سحب كامل العربون أم الاحتفاظ به) ── */}
          {paidAdvance > 0 && (
            <div
              style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wallet size={18} color="#0284c7" />
                  <span style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>
                    تحديد سياسة خصم العربون المدفوع مسبقاً ({paidAdvance.toFixed(2)} ج.م):
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  رغبة العميل والصيدلية
                </span>
              </div>

              {/* بطاقات الخيارات الثلاثة */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                
                {/* الخيار الأول: سحب كامل العربون */}
                <div
                  onClick={() => setDepositOption('full_deposit')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: depositOption === 'full_deposit' ? '2px solid #059669' : '1px solid #cbd5e1',
                    background: depositOption === 'full_deposit' ? '#ecfdf5' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: depositOption === 'full_deposit' ? '#065f46' : '#1e293b' }}>
                      سحب كامل العربون الآن
                    </span>
                    {depositOption === 'full_deposit' && <Check size={16} color="#059669" />}
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    خصم العربون كاملاً من الأصناف المسلمة حالياً (يخصم حتى {Math.min(paidAdvance, deliveringItemsTotal).toFixed(2)} ج.م) والعميل يدفع الباقي.
                  </p>
                </div>

                {/* الخيار الثاني: الاحتفاظ بالعربون للصنف المتبقي */}
                <div
                  onClick={() => setDepositOption('keep_for_pending')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: depositOption === 'keep_for_pending' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    background: depositOption === 'keep_for_pending' ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: depositOption === 'keep_for_pending' ? '#0369a1' : '#1e293b' }}>
                      الاحتفاظ بالعربون للصنف المتبقي
                    </span>
                    {depositOption === 'keep_for_pending' && <Check size={16} color="#0284c7" />}
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    العميل يدفع ثمن الأصناف المتوفرة بالكامل ({deliveringItemsTotal.toFixed(2)} ج.م)، ويظل كامل العربون ({paidAdvance.toFixed(2)} ج.م) محجوزاً للصنف المتبقي.
                  </p>
                </div>

                {/* الخيار الثالث: تخصيص مبلغ محدد */}
                <div
                  onClick={() => setDepositOption('custom')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: depositOption === 'custom' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                    background: depositOption === 'custom' ? '#f5f3ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '800', color: depositOption === 'custom' ? '#6d28d9' : '#1e293b' }}>
                      تخصيص مبلغ محدد يدوياً
                    </span>
                    {depositOption === 'custom' && <Check size={16} color="#7c3aed" />}
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    تحديد المبلغ المراد استقطاعه من العربون يدوياً وإبقاء الباقي محجوزاً.
                  </p>
                </div>
              </div>

              {depositOption === 'custom' && (
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>
                    مبلغ العربون المراد سحبه الآن:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={Math.min(paidAdvance, deliveringItemsTotal)}
                    step="0.5"
                    value={customDepositAmount}
                    onChange={(e) => setCustomDepositAmount(e.target.value)}
                    placeholder={`بحد أقصى ${Math.min(paidAdvance, deliveringItemsTotal).toFixed(2)}`}
                    style={{
                      width: '140px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #7c3aed',
                      fontWeight: 'bold',
                      outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>ج.م</span>
                </div>
              )}
            </div>
          )}

          {/* ── 4. بطاقة الحسابات المالية الاحترافية ── */}
          <div
            style={{
              background: '#ecfdf5',
              border: '1.5px solid #a7f3d0',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center' }}>
              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11px', color: '#065f46', display: 'block', fontWeight: '600' }}>
                  قيمة الأصناف المسلمة
                </span>
                <strong className="tabular-nums" style={{ fontSize: '15px', color: '#047857', fontFamily: 'var(--outstock-font-mono)' }}>
                  {deliveringItemsTotal.toFixed(2)} <span style={{ fontSize: '10px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11px', color: '#065f46', display: 'block', fontWeight: '600' }}>
                  عربون مستقطع الآن
                </span>
                <strong className="tabular-nums" style={{ fontSize: '15px', color: '#0284c7', fontFamily: 'var(--outstock-font-mono)' }}>
                  -{depositUsed.toFixed(2)} <span style={{ fontSize: '10px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11px', color: '#b91c1c', display: 'block', fontWeight: '700' }}>
                  المطلوب دفعه الآن
                </span>
                <strong className="tabular-nums" style={{ fontSize: '16px', color: '#dc2626', fontFamily: 'var(--outstock-font-mono)' }}>
                  {calculatedDueNow.toFixed(2)} <span style={{ fontSize: '10px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11px', color: '#0284c7', display: 'block', fontWeight: '700' }}>
                  عربون محجوز للمتبقي
                </span>
                <strong className="tabular-nums" style={{ fontSize: '15px', color: '#0369a1', fontFamily: 'var(--outstock-font-mono)' }}>
                  {remainingReservedDeposit.toFixed(2)} <span style={{ fontSize: '10px' }}>ج.م</span>
                </strong>
              </div>
            </div>

            {/* حقل إدخال المبلغ المحصل الآن */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#065f46' }}>
                المبلغ المطلوب تحصيله الآن لتسوية هذه الأصناف (ج.م):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max={deliveringItemsTotal}
                  value={collectedAmount}
                  onChange={(e) => setCollectedAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    fontWeight: '800',
                    color: '#047857',
                    border: '2px solid #059669',
                    borderRadius: '8px',
                    outline: 'none',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>
            </div>

            {/* حقل المبلغ المدفوع كاش لاحتساب الباقي تلقائياً */}
            {paymentMethod === 'cash' && downPaymentExcess <= 0 && currentCollectNum > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>
                  المبلغ المستلم كاش من يد العميل (لحساب الفكة/الباقي تلقائياً):
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder={`أدخل المبلغ المستلم (مثال: ${(Math.ceil(currentCollectNum / 50) * 50 || currentCollectNum + 50)})`}
                  value={tenderedAmount}
                  onChange={(e) => setTenderedAmount(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #94a3b8',
                    fontSize: '14px',
                    fontWeight: '700',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            {/* تنبيه وخيارات استرداد الباقي أو الفائض للعميل */}
            {customerChangeDue > 0 && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #bbf7d0', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={20} color="#15803d" />
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#166534', display: 'block' }}>
                        يوجد باقي / فائض مستحق للعميل بقيمة ({customerChangeDue.toFixed(2)} ج.م)
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#15803d' }}>
                        يرجى تحديد الطريقة المعتمدة لرد الباقي للعميل:
                      </span>
                    </div>
                  </div>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '13px' }}>
                    {customerChangeDue.toFixed(2)} ج.م
                  </span>
                </div>

                {/* شبكة الخيارات الأربعة لرد الباقي */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  {[
                    { id: 'cash', label: 'كاش نقدي', desc: 'من درج الكاشير', icon: DollarSign, color: '#16a34a' },
                    { id: 'wallet', label: 'إيداع بالمحفظة', desc: 'رصيد دائم موثق', icon: Wallet, color: '#047857' },
                    { id: 'ewallet', label: 'محفظة إلكترونية', desc: 'Vodafone / Orange', icon: Smartphone, color: '#7c3aed' },
                    { id: 'instapay', label: 'إنستاباي', desc: 'InstaPay فوري', icon: Zap, color: '#d97706' }
                  ].map((opt) => {
                    const isSel = refundOption === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setRefundOption(opt.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '10px 8px',
                          borderRadius: '10px',
                          border: isSel ? `2px solid ${opt.color}` : '1px solid #cbd5e1',
                          background: isSel ? '#ffffff' : '#f8fafc',
                          boxShadow: isSel ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Icon size={18} color={isSel ? opt.color : '#64748b'} />
                        <span style={{ fontSize: '12px', fontWeight: isSel ? '800' : '600', color: isSel ? opt.color : '#334155' }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {refundOption === 'wallet' && (
                  <div style={{ background: '#ecfdf5', padding: '10px 12px', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#047857', fontWeight: '700', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={printWalletReceiptAfter}
                        onChange={(e) => setPrintWalletReceiptAfter(e.target.checked)}
                      />
                      <span>🖨️ طباعة إيصال إيداع حراري للمحفظة (80mm / 58mm) تلقائياً</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 5. طرق الدفع المعتمدة ── */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '8px' }}>
              طريقة تحصيل المبلغ المتبقي ({currentCollectNum.toFixed(2)} ج.م):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              {[
                { id: 'cash', label: 'نقدي (كاش)', icon: DollarSign, color: '#16a34a' },
                { id: 'card', label: 'فيزا / بطاقة', icon: CreditCard, color: '#2563eb' },
                { id: 'wallet', label: 'محفظة إلكترونية', icon: Smartphone, color: '#7c3aed' },
                { id: 'credit', label: 'آجل / حساب عميل', icon: FileText, color: '#b45309' }
              ].map((m) => {
                const isSelected = paymentMethod === m.id;
                const IconComponent = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '10px 8px',
                      borderRadius: '10px',
                      border: isSelected ? `2px solid ${m.color}` : '1px solid #cbd5e1',
                      background: isSelected ? '#ffffff' : '#f8fafc',
                      boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <IconComponent size={18} color={isSelected ? m.color : '#64748b'} />
                    <span style={{ fontSize: '12px', fontWeight: isSelected ? '800' : '600', color: isSelected ? m.color : '#334155' }}>
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* الصيدلي ورقم الحركة والملاحظات */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <span>الصيدلي / الكاشير المستلم:</span>
                <span style={{ fontSize: '11px', color: '#0d9488', fontWeight: 'bold' }}>🔒 موثق بالنظام</span>
              </label>
              <input
                type="text"
                value={cashierName}
                readOnly={true}
                tabIndex={-1}
                title="اسم الصيدلي المستلم موثق بنظام الصلاحيات وغير قابل للتعديل اليدوي"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#1e293b',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'not-allowed',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                رقم الإيصال / الحركة:
              </label>
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
              ملاحظات التحصيل والتسليم:
            </label>
            <input
              type="text"
              placeholder="مثال: تسليم جزئي للأصناف المتوفرة بطلب العميل..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* خيار طباعة الفاتورة */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#334155' }}>
              <input
                type="checkbox"
                checked={shouldPrintReceipt}
                onChange={(e) => setShouldPrintReceipt(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#059669', cursor: 'pointer' }}
              />
              <span>طباعة إيصال تسليم نهائي للأصناف المستلمة فور التأكيد</span>
            </label>
            <Printer size={18} color="#059669" />
          </div>

          {/* تنبيه الإدراج التلقائي في مبيعات الفرع */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          >
            <TrendingUp size={16} />
            <span>
              ⚡ يتم إدراج مبلغ الطلب والتحصيل ({currentCollectNum.toFixed(2)} ج.م) تلقائياً في <strong>مبيعات الفرع اليومية</strong> بمنظومة الـ HR وكشف الوردية.
            </span>
          </div>

          {/* ── أزرار الإجراءات ── */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isSubmitting || hasNoAvailableItems}
              style={{
                flex: 1,
                padding: '12px 18px',
                background: hasNoAvailableItems ? '#94a3b8' : (isPartialDelivery ? '#0284c7' : '#059669'),
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14.5px',
                fontWeight: '800',
                cursor: (isSubmitting || hasNoAvailableItems) ? 'not-allowed' : 'pointer',
                opacity: (isSubmitting || hasNoAvailableItems) ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: hasNoAvailableItems ? 'none' : '0 2px 6px rgba(5, 150, 105, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              {isSubmitting ? (
                <>جاري إتمام التسليم وتحديث المبيعات...</>
              ) : hasNoAvailableItems ? (
                <>
                  <AlertCircle size={18} />
                  <span>محظور التسليم (لا توجد أصناف متوفرة)</span>
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>
                    تأكيد {isPartialDelivery ? 'التسليم الجزئي' : 'تسليم الطلب'} وتحصيل{' '}
                    <span className="tabular-nums" style={{ fontFamily: 'var(--outstock-font-mono)' }}>
                      {currentCollectNum.toFixed(2)}
                    </span>{' '}
                    ج.م
                  </span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '12px 20px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
