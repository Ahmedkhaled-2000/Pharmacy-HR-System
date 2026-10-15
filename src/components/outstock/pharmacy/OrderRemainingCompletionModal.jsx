import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  Printer,
  Trash2,
  DollarSign,
  CreditCard,
  Send,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowRight
} from 'lucide-react';
import {
  outstockUpdateOrderDeposit,
  outstockCancelOrderItem
} from '../../../utils/outstockApiClient';
import { printRemainingDepositReceipt } from '../../../utils/printRemainingDepositReceipt';
import { getResolvedWhatsAppServerUrl } from '../../../utils/systemUrlHelper';

/**
 * OrderRemainingCompletionModal.jsx
 * نافذة استكمال ومتابعة الطلب المنبثقة تلقائياً بعد التسليم الجزئي للأصناف المتوفرة:
 * 1. إضافة أو تعديل عربون الصنف المتبقي وطباعة إيصال حراري به.
 * 2. زر يدوي صريح لإرسال إشعار الواتساب (بدون أي إرسال تلقائي).
 * 3. خيار إلغاء الصنف المتبقي واستبعاده فورياً ونهائياً من شاشة طلبات المشتريات.
 */
export default function OrderRemainingCompletionModal({
  order,
  deliveredItems = [],
  remainingItems = [],
  initialReservedDeposit = 0,
  branch,
  currentPharmacist = '',
  authenticatedEmployee = null,
  onClose,
  onOrderUpdated,
  showToast = alert
}) {
  const [activeTab, setActiveTab] = useState('deposit'); // 'deposit' | 'cancel'

  // خيارات العربون للصنف المتبقي
  const [additionalDeposit, setAdditionalDeposit] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'wallet'
  const [depositNotes, setDepositNotes] = useState('');
  const [isSavingDeposit, setIsSavingDeposit] = useState(false);

  // خيارات الإلغاء
  const [cancelReason, setCancelReason] = useState('استغناء العميل عن الصنف المتبقي بعد استلام المتوفر');
  const [refundDestination, setRefundDestination] = useState('cash'); // 'cash' | 'wallet'
  const [isCancelling, setIsCancelling] = useState(false);

  // حالة إرسال الواتساب اليدوي
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [waSentStatus, setWaSentStatus] = useState(null);

  // إجمالي العربون الحالي المحجوز للمتبقي
  const currentDeposit = parseFloat(initialReservedDeposit || order?.paid_amount || 0);

  // الحساب المالي للمتبقي
  const addedNum = parseFloat(additionalDeposit || 0);
  const totalReservedDepositAfterAdd = currentDeposit + (addedNum > 0 ? addedNum : 0);

  // إجمالي القيمة التقديرية للأصناف المتبقية
  const remainingItemsEstimatedTotal = useMemo(() => {
    return (remainingItems || []).reduce((acc, it) => {
      const q = parseInt(it.quantity || 1, 10);
      const p = parseFloat(it.unit_price || it.unitPrice || 0);
      return acc + (q * p);
    }, 0);
  }, [remainingItems]);

  const estimatedDueAfterDeposit = Math.max(0, remainingItemsEstimatedTotal - totalReservedDepositAfterAdd);

  // 1. معالجة حفظ وتأكيد عربون الصنف المتبقي وطباعة الإيصال
  const handleConfirmRemainingDeposit = async (e) => {
    if (e) e.preventDefault();
    if (isSavingDeposit) return;

    const finalDepositToSet = totalReservedDepositAfterAdd;

    setIsSavingDeposit(true);
    try {
      const res = await outstockUpdateOrderDeposit(order.id, {
        paidAmount: finalDepositToSet,
        depositAmount: finalDepositToSet,
        paymentMethod,
        notes: [
          depositNotes.trim(),
          addedNum > 0 ? `(تمت إضافة عربون جديد بقيمة ${addedNum.toFixed(2)} ج.م عبر ${paymentMethod === 'cash' ? 'كاش' : paymentMethod})` : ''
        ].filter(Boolean).join(' - ')
      });

      if (res?.success) {
        showToast?.('✅ تم حفظ وتحديث عربون الصنف المتبقي بنجاح!');

        // طباعة إيصال العربون الحراري المزدوج
        try {
          printRemainingDepositReceipt({
            orderNumber: order.order_number || order.orderNumber,
            customerName: order.customer_name || order.customerName,
            customerPhone: order.customer_phone || order.customerPhone,
            remainingItems,
            depositAmount: addedNum > 0 ? addedNum : finalDepositToSet,
            previousDeposit: addedNum > 0 ? currentDeposit : 0,
            totalDepositNow: finalDepositToSet,
            remainingAmountDue: estimatedDueAfterDeposit,
            paymentMethod,
            employeeName: authenticatedEmployee?.name || currentPharmacist,
            employeeCode: authenticatedEmployee?.code || '',
            branchName: branch?.name || 'صيدلية الفرع',
            notes: depositNotes
          });
        } catch (printErr) {
          console.warn('[Print Remaining Deposit Error]:', printErr);
        }

        if (onOrderUpdated) {
          onOrderUpdated({
            ...order,
            paid_amount: finalDepositToSet,
            remaining_amount: estimatedDueAfterDeposit
          });
        }

        onClose();
      } else {
        showToast?.(`⚠️ فشل تحديث العربون: ${res?.error || 'خطأ غير معروف'}`);
      }
    } catch (err) {
      showToast?.(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSavingDeposit(false);
    }
  };

  // 2. زر يدوي لإرسال واتساب للعميل ببيانات الصنف المتبقي والعربون (Manual Send Button)
  const handleManualSendWhatsApp = async () => {
    if (isSendingWhatsApp) return;

    const phone = order?.customer_phone || order?.customerPhone;
    if (!phone || !String(phone).trim()) {
      showToast?.('⚠️ العميل ليس لديه رقم هاتف مسجل لإرسال رسالة الواتساب');
      return;
    }

    const itemsText = (remainingItems || []).map((it, idx) => {
      const name = it.medicationName || it.medication_name || 'صنف دوائي';
      const q = it.quantity || 1;
      const u = it.unitType === 'strip' || it.unit_type === 'strip' ? 'شريط' : 'علبة';
      return `  ${idx + 1}. *${name}* (${q} ${u})`;
    }).join('\n');

    const msg = `أهلاً بك أ/ *${order.customer_name || order.customerName || 'العميل العزيز'}* 🌸\n` +
      `من *${branch?.name || 'صيدليتنا'}*:\n` +
      `نحيطكم علماً بأنه تم تسليم الأصناف المتوفرة من طلبكم #${order.order_number || ''} بنجاح.\n\n` +
      `📦 *الأصناف المتبقية قيد المتابعة مع إدارة المشتريات:*\n` +
      `${itemsText}\n\n` +
      `💰 *العربون المحجوز للصنف المتبقي:* ${totalReservedDepositAfterAdd.toFixed(2)} ج.م\n` +
      `💵 *المبلغ المتبقي المتوقع عند الاستلام:* ${estimatedDueAfterDeposit.toFixed(2)} ج.م\n\n` +
      `🔔 سيتم إشعاركم فور ورود الصنف المتبقي للصيدلية مباشرة.`;

    setIsSendingWhatsApp(true);
    setWaSentStatus(null);
    try {
      const waServerUrl = getResolvedWhatsAppServerUrl();
      let cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = '2' + cleanPhone;
      }

      const res = await fetch(`${waServerUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          message: msg,
          sessionId: 'hr_main'
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        setWaSentStatus('success');
        showToast?.('✅ تم إرسال رسالة تفاصيل الصنف والعربون إلى واتساب العميل بنجاح!');
      } else {
        // Fallback رابط مباشر لواتساب ويب
        setWaSentStatus('direct_link');
        const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        window.open(waLink, '_blank');
        showToast?.('📲 تم فتح محادثة الواتساب المباشرة مع العميل');
      }
    } catch (_) {
      // رابط مباشر
      let cleanPhone = String(phone).replace(/\D/g, '');
      if (cleanPhone.startsWith('01') && cleanPhone.length === 11) cleanPhone = '2' + cleanPhone;
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
      window.open(waLink, '_blank');
      setWaSentStatus('direct_link');
      showToast?.('📲 تم فتح محادثة الواتساب المباشرة مع العميل');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // 3. معالجة إلغاء الصنف المتبقي واستبعاده فورياً من المشتريات
  const handleCancelRemainingItems = async () => {
    if (isCancelling) return;

    if (!window.confirm('هل أنت متأكد من رغبة العميل في إلغاء الصنف المتبقي واستبعاده نهائياً من طلبات المشتريات وتسوية أي عربون؟')) {
      return;
    }

    setIsCancelling(true);
    try {
      let anySuccess = false;
      for (const it of remainingItems) {
        const res = await outstockCancelOrderItem(order.id, {
          itemId: it.id,
          reason: cancelReason,
          refundDestination,
          refundAmount: currentDeposit,
          employeeCode: authenticatedEmployee?.code || '',
          employeeName: authenticatedEmployee?.name || currentPharmacist
        });
        if (res?.success) {
          anySuccess = true;
        }
      }

      if (anySuccess) {
        showToast?.(`✅ تم إلغاء الصنف المتبقي بنجاح واستبعاده من شاشة طلبات المشتريات! ${currentDeposit > 0 ? `(تمت تسوية العربون: ${currentDeposit.toFixed(2)} ج.م)` : ''}`);
        if (onOrderUpdated) {
          onOrderUpdated({
            ...order,
            order_status: 'delivered', // لأن الأصناف السابقة تم تسليمها والأصناف المتبقية أُلغيت
            items: order.items?.map(it => remainingItems.some(r => r.id === it.id) ? { ...it, item_status: 'cancelled_by_customer', pruned_from_bill: true } : it)
          });
        }
        onClose();
      } else {
        showToast?.('⚠️ تعذر إلغاء الصنف المتبقي، يرجى المحاولة لاحقاً');
      }
    } catch (err) {
      showToast?.(`❌ خطأ: ${err.message}`);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(5px)',
        zIndex: 100005,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="outstock-modal-panel"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '640px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          animation: 'outstockModalPop 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
            color: '#ffffff',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.2)', padding: '8px', borderRadius: '10px' }}>
              <Layers size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: '800' }}>
                استكمال الطلب ومتابعة الأصناف المتبقية
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
                طلب رقم: #{order?.order_number || order?.orderNumber} - العميل: <strong>{order?.customer_name || order?.customerName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Alert Banner */}
        <div style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} color="#059669" />
          <span style={{ fontSize: '12.5px', color: '#065f46', fontWeight: '700' }}>
            تم تسليم الأصناف المتوفرة بنجاح! حدد الآن الإجراء المطلوب للأصناف المتبقية قيد المشتريات:
          </span>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* ملخص الأصناف المسلمة للتو */}
          {deliveredItems.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: '#16a34a', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <CheckCircle2 size={14} />
                <span>أصناف تم تسليمها وطباعة فاتورتها للعميل:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {deliveredItems.map((it, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      color: '#15803d',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11.5px',
                      fontWeight: '700',
                      textDecoration: 'line-through',
                      textDecorationColor: '#16a34a',
                      textDecorationThickness: '2px'
                    }}
                  >
                    ✓ {it.medicationName || it.medication_name} ({it.quantity} {it.unitType === 'strip' || it.unit_type === 'strip' ? 'شريط' : 'علبة'})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* الأصناف المتبقية قيد انتظار المشتريات */}
          <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} />
                <span>الأصناف المتبقية (قيد انتظار رد إدارة المشتريات):</span>
              </div>
              <span style={{ fontSize: '11px', background: '#fef3c7', color: '#78350f', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                {remainingItems.length} صنف متبقي
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {remainingItems.map((it, idx) => {
                const name = it.medicationName || it.medication_name;
                const q = it.quantity || 1;
                const u = it.unitType === 'strip' || it.unit_type === 'strip' ? 'شريط' : 'علبة';
                const p = parseFloat(it.unit_price || it.unitPrice || 0);
                return (
                  <div
                    key={idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fcd34d',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12.5px'
                    }}
                  >
                    <div>
                      <strong style={{ color: '#1e293b' }}>{name}</strong>
                      <span style={{ color: '#64748b', marginRight: '6px' }}>({q} {u})</span>
                    </div>
                    <div style={{ fontWeight: '800', color: '#b45309' }}>
                      {p > 0 ? `${(p * q).toFixed(2)} ج.م (تقديري)` : 'قيد التسعير'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#78350f', borderTop: '1px dashed #fde68a', paddingTop: '8px' }}>
              <span>العربون الحالي المحجوز للصنف المتبقي:</span>
              <strong style={{ fontSize: '13.5px', color: '#047857' }}>{currentDeposit.toFixed(2)} ج.م</strong>
            </div>
          </div>

          {/* تبويبات الخيارات (إضافة عربون أم إلغاء الصنف المتبقي) */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('deposit')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderBottom: activeTab === 'deposit' ? '3px solid #047857' : '3px solid transparent',
                background: activeTab === 'deposit' ? '#ecfdf5' : 'transparent',
                color: activeTab === 'deposit' ? '#065f46' : '#64748b',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <DollarSign size={16} />
              <span>تأكيد / إضافة عربون للصنف المتبقي 🖨️</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cancel')}
              style={{
                flex: 1,
                padding: '10px',
                border: 'none',
                borderBottom: activeTab === 'cancel' ? '3px solid #dc2626' : '3px solid transparent',
                background: activeTab === 'cancel' ? '#fef2f2' : 'transparent',
                color: activeTab === 'cancel' ? '#991b1b' : '#64748b',
                fontWeight: '800',
                fontSize: '13px',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={16} />
              <span>إلغاء الصنف المتبقي واسترداد العربون 🗑️</span>
            </button>
          </div>

          {/* محتوى المسار الأول: إضافة العربون */}
          {activeTab === 'deposit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    مبلغ عربون إضافي (ج.م) إن رغب العميل:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={additionalDeposit}
                    onChange={(e) => setAdditionalDeposit(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: '800',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    طريقة دفع العربون الإضافي:
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="cash">نقدي (كاش بالدرج)</option>
                    <option value="card">بطاقة بنكية / فيزا</option>
                    <option value="wallet">محفظة إلكترونية / إنستاباي</option>
                  </select>
                </div>
              </div>

              {/* ملخص الحسبة المالية بعد التعديل */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                <div>
                  إجمالي العربون المحجوز للصنف المتبقي: <strong style={{ color: '#047857', fontSize: '14px' }}>{totalReservedDepositAfterAdd.toFixed(2)} ج.م</strong>
                </div>
                <div>
                  المتبقي المتوقع عند الاستلام: <strong style={{ color: '#1e293b' }}>{estimatedDueAfterDeposit.toFixed(2)} ج.م</strong>
                </div>
              </div>

              {/* أزرار الحفظ والطباعة والواتساب اليدوي */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={handleConfirmRemainingDeposit}
                  disabled={isSavingDeposit}
                  style={{
                    flex: '2 1 200px',
                    background: '#047857',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px 16px',
                    fontWeight: '800',
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isSavingDeposit ? <RefreshCw size={15} className="outstock-spin" /> : <Printer size={15} />}
                  <span>حفظ العربون وطباعة الإيصال الحراري 🖨️</span>
                </button>

                {/* زر يدوي لإرسال واتساب (بدون أي إرسال تلقائي) */}
                <button
                  type="button"
                  onClick={handleManualSendWhatsApp}
                  disabled={isSendingWhatsApp}
                  style={{
                    flex: '1 1 160px',
                    background: '#25D366',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '11px 14px',
                    fontWeight: '800',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  title="إرسال تفاصيل الصنف المحجوز وقيمة العربون للعميل يدوياً"
                >
                  {isSendingWhatsApp ? <RefreshCw size={14} className="outstock-spin" /> : <Send size={14} />}
                  <span>{waSentStatus === 'success' ? '✓ تم الإرسال واتساب' : 'إرسال واتساب 📱'}</span>
                </button>
              </div>
            </div>
          )}

          {/* محتوى المسار الثاني: إلغاء الصنف المتبقي وشطبه من المشتريات */}
          {activeTab === 'cancel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#991b1b', fontSize: '12.5px' }}>
                <strong>⚠️ تنبيه مهم:</strong> عند إلغاء الصنف المتبقي، سيتم استبعاده فورياً ونهائياً من شاشة طلبات المشتريات ولن يظهر كطلب معلق، وسيتم اعتبار الطلب مكتملاً بما سُلِّم سابقاً.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  سبب الإلغاء:
                </label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {currentDeposit > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    طريقة استرداد العربون المحجوز ({currentDeposit.toFixed(2)} ج.م):
                  </label>
                  <select
                    value={refundDestination}
                    onChange={(e) => setRefundDestination(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: '700',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="cash">رد نقدي فوري للعميل من درج الكاشير (كاش)</option>
                    <option value="wallet">إيداع برصيد محفظة العميل بالصيدلية</option>
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={handleCancelRemainingItems}
                disabled={isCancelling}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontWeight: '800',
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '6px'
                }}
              >
                {isCancelling ? <RefreshCw size={15} className="outstock-spin" /> : <Trash2 size={15} />}
                <span>تأكيد إلغاء الصنف المتبقي واستبعاده من المشتريات 🗑️</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '7px 16px', fontSize: '12.5px' }}
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
}
