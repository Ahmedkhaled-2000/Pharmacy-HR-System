import React, { useState, useEffect } from 'react';
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
  Zap
} from 'lucide-react';
import { outstockSettleAndDeliverOrder } from '../../../utils/outstockApiClient';

/**
 * OrderDeliverySettlementModal.jsx
 * نافذة تسليم الطلب للعميل وتسوية باقي المبلغ وإدراجه في مبيعات الفرع اليومية
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
  const totalAmount = parseFloat(order?.net_amount || order?.netAmount || order?.total_amount || 0);
  const paidAdvance = parseFloat(order?.paid_amount || order?.paidAmount || 0);
  const initialRemaining = Math.max(0, totalAmount - paidAdvance);
  const refundDue = Math.max(0, paidAdvance - totalAmount);

  const [collectedAmount, setCollectedAmount] = useState(String(initialRemaining > 0 ? initialRemaining : 0));
  const [refundOption, setRefundOption] = useState('cash'); // 'cash' | 'wallet'
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'wallet' | 'credit'
  const [cashierName, setCashierName] = useState(deliveredBy?.name || currentPharmacist || 'د. الصيدلي');
  const [receiptNumber, setReceiptNumber] = useState(`REC-${order?.order_number || Date.now().toString().slice(-6)}`);
  const [notes, setNotes] = useState('');
  const [shouldPrintReceipt, setShouldPrintReceipt] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order) {
      const tot = parseFloat(order.net_amount || order.netAmount || order.total_amount || 0);
      const paid = parseFloat(order.paid_amount || order.paidAmount || 0);
      const rem = Math.max(0, tot - paid);
      setCollectedAmount(String(rem > 0 ? rem : 0));
      setReceiptNumber(`REC-${order.order_number || Date.now().toString().slice(-6)}`);
    }
  }, [order]);

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
  const calculatedRemainingAfter = Math.max(0, totalAmount - (paidAdvance + currentCollectNum));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await outstockSettleAndDeliverOrder(order.id, {
        collectedAmount: currentCollectNum,
        paymentMethod,
        cashierName: deliveredBy?.name || cashierName,
        deliveredByCode: deliveredBy?.code || null,
        deliveredByName: deliveredBy?.name || cashierName,
        receiptNumber,
        refundToWallet: refundOption === 'wallet',
        notes: notes.trim() || `تسليم طلب العميل ${order.customer_name || ''}`
      });

      if (res?.success) {
        showToast(
          `✅ تم تسليم الطلب بنجاح! تم تحصيل ${currentCollectNum.toFixed(2)} ج.م وإدراجها في مبيعات الفرع اليومية.`
        );

        if (onDeliveredSuccess) {
          onDeliveredSuccess({
            ...order,
            order_status: 'delivered',
            paid_amount: paidAdvance + currentCollectNum,
            remaining_amount: calculatedRemainingAfter
          });
        }

        if (shouldPrintReceipt && onOpenReceiptPrint) {
          onOpenReceiptPrint({
            ...order,
            order_status: 'delivered',
            paid_amount: paidAdvance + currentCollectNum,
            remaining_amount: calculatedRemainingAfter,
            justCollectedAmount: currentCollectNum,
            deliveryPaymentMethod: paymentMethod,
            deliveredAt: new Date().toISOString()
          });
        }

        onClose();
      } else {
        showToast(`⚠️ فشل تسليم الطلب: ${res?.error || 'حدث خطأ أثناء الاتصال'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
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
          maxWidth: '620px',
          maxHeight: '92vh',
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
            background: '#ffffff',
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
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PackageCheck size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>
                تسليم الطلب وتسوية الحساب
              </h3>
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
          {deliveredBy && (
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
          )}

          {/* كارت معلومات العميل والطلب */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              fontSize: '13px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>اسم العميل</span>
                <strong style={{ color: '#1e293b' }}>{order.customer_name || order.customerName || 'عميل نقدي'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={16} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>رقم الهاتف / الواتساب</span>
                <span style={{ color: '#1e293b', direction: 'ltr', display: 'inline-block', fontFamily: 'monospace' }}>
                  {order.customer_phone || order.customerPhone || 'غير مسجل'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="#64748b" />
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>تاريخ الطلب</span>
                <span style={{ color: '#1e293b' }}>
                  {order.created_at ? new Date(order.created_at).toLocaleDateString('ar-EG') : 'اليوم'}
                </span>
              </div>
            </div>
          </div>

          {/* جدول الأصناف المسلمة */}
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13.5px', color: '#334155', fontWeight: '700' }}>
              الأصناف الجاهزة للتسليم للعميل:
            </h4>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                overflow: 'hidden',
                background: '#ffffff'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'right' }}>
                    <th style={{ padding: '8px 12px' }}>الصنف</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>الكمية</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>السعر</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((it, idx) => {
                      const isUnavailable = Boolean(
                        it?.status === 'unavailable' ||
                        it?.status === 'unavailable_in_market' ||
                        it?.itemStatus === 'unavailable_in_market' ||
                        it?.item_status === 'unavailable_in_market' ||
                        it?.decision === 'unavailable' ||
                        it?.procurement_status === 'unavailable' ||
                        it?.prunedFromBill === true ||
                        it?.pruned_from_bill === true ||
                        it?.is_available === false ||
                        it?.available === false
                      );

                      return (
                        <tr
                          key={it.id || idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isUnavailable ? '#fef2f2' : 'transparent',
                            transition: 'background-color 0.15s ease'
                          }}
                        >
                          <td style={{ padding: '8px 12px', fontWeight: '600', color: isUnavailable ? '#991b1b' : '#1e293b' }}>
                            <span style={{ textDecoration: isUnavailable ? 'line-through' : 'none' }}>
                              {it.medication_name || it.medicationName}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: isUnavailable ? '#b91c1c' : '#64748b',
                                marginRight: '6px',
                                textDecoration: isUnavailable ? 'line-through' : 'none'
                              }}
                            >
                              ({it.unit_type === 'pack' ? 'عبوة' : 'شريط'})
                            </span>
                            {isUnavailable && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginRight: '8px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  color: '#dc2626',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  textDecoration: 'none'
                                }}
                              >
                                ✕ غير متوفر من المشتريات
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              textAlign: 'center',
                              fontWeight: 'bold',
                              color: isUnavailable ? '#991b1b' : 'inherit',
                              textDecoration: isUnavailable ? 'line-through' : 'none'
                            }}
                          >
                            {it.quantity}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              color: isUnavailable ? '#991b1b' : '#475569',
                              textDecoration: isUnavailable ? 'line-through' : 'none'
                            }}
                          >
                            {parseFloat(it.unit_price || it.unitPrice || 0).toFixed(2)}
                          </td>
                          <td
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontWeight: 'bold',
                              color: isUnavailable ? '#991b1b' : '#047857',
                              textDecoration: isUnavailable ? 'line-through' : 'none'
                            }}
                          >
                            {parseFloat(it.total_price || it.totalPrice || 0).toFixed(2)} ج.م
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: '#64748b' }}>
                        تفاصيل الأصناف مسجلة بالطلب
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* بطاقة الحسابات المالية الاحترافية */}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center' }}>
              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11.5px', color: '#065f46', display: 'block', fontWeight: '600' }}>
                  إجمالي الفاتورة
                </span>
                <strong className="tabular-nums" style={{ fontSize: '16px', color: '#047857', fontFamily: 'var(--outstock-font-mono)' }}>
                  {totalAmount.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11.5px', color: '#065f46', display: 'block', fontWeight: '600' }}>
                  عربون مدفوع مسبقاً
                </span>
                <strong className="tabular-nums" style={{ fontSize: '16px', color: '#0284c7', fontFamily: 'var(--outstock-font-mono)' }}>
                  {paidAdvance.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11.5px', color: '#b91c1c', display: 'block', fontWeight: '600' }}>
                  {refundDue > 0 ? 'فائض مسترد للعميل' : 'المتبقي المطلوب'}
                </span>
                <strong className="tabular-nums" style={{ fontSize: '16px', color: refundDue > 0 ? '#059669' : '#dc2626', fontFamily: 'var(--outstock-font-mono)' }}>
                  {refundDue > 0 ? `+${refundDue.toFixed(2)}` : initialRemaining.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>
            </div>

            {/* تنبيه وخيارات استرداد الفائض للعميل (كاش أو محفظة) */}
            {refundDue > 0 && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1.5px solid #f59e0b',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} color="#b45309" />
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#92400e' }}>
                    يوجد فارغ مستحق استرداده للعميل بقيمة ({refundDue.toFixed(2)} ج.م)
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#78350f' }}>
                  العربون المدفوع سابقاً أكبر من إجمالي الأصناف المسلمة. يرجى اختيار طريقة التسوية:
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer', color: '#78350f' }}>
                    <input
                      type="radio"
                      name="settlementRefundChoice"
                      value="cash"
                      checked={refundOption === 'cash'}
                      onChange={() => setRefundOption('cash')}
                    />
                    <span>💵 إرجاع نقدي للعميل كاش من الدرج</span>
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: '800', cursor: 'pointer', color: '#047857' }}>
                    <input
                      type="radio"
                      name="settlementRefundChoice"
                      value="wallet"
                      checked={refundOption === 'wallet'}
                      onChange={() => setRefundOption('wallet')}
                    />
                    <span>👛 إيداع في محفظة العميل كرصيد دائم</span>
                  </label>
                </div>
              </div>
            )}

            {/* حقل إدخال المبلغ المحصل الآن */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: '#065f46' }}>
                المبلغ المستلم والمحصل الآن من العميل (ج.م):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max={totalAmount}
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
              {calculatedRemainingAfter > 0 && (
                <span style={{ fontSize: '12px', color: '#b45309', fontWeight: '600' }}>
                  ⚠️ سينتقل باقي مبلغ ({calculatedRemainingAfter.toFixed(2)} ج.م) كحساب آجل على العميل.
                </span>
              )}
            </div>
          </div>

          {/* طريقة الدفع والتحصيل */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '8px' }}>
              طريقة استلام المبلغ:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
              {[
                { id: 'cash', label: 'نقدي (كاش)', icon: DollarSign, color: '#16a34a' },
                { id: 'card', label: 'فيزا / بطاقة', icon: CreditCard, color: '#2563eb' },
                { id: 'wallet', label: 'محفظة إلكترونية', icon: Smartphone, color: '#9333ea' },
                { id: 'instapay', label: 'إنستاباي ⚡', icon: Zap, color: '#d97706' },
                { id: 'credit', label: 'آجل / حساب', icon: Clock, color: '#ea580c' }
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      padding: '10px 6px',
                      borderRadius: '10px',
                      border: isSelected ? `2px solid ${m.color}` : '1.5px solid #cbd5e1',
                      background: isSelected ? '#f8fafc' : '#ffffff',
                      color: isSelected ? m.color : '#475569',
                      fontWeight: isSelected ? '800' : '600',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={18} color={isSelected ? m.color : '#64748b'} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* حقول الكاشير والملاحظات */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                الصيدلي / الكاشير المستلم:
              </label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
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
              placeholder="مثال: تم الاستلام بمعرفة العميل شخصياً / خصم خاص..."
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
              <span>طباعة إيصال تسليم نهائي للعميل فور التأكيد</span>
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
              ⚡ يتم إدراج مبلغ الطلب والتحصيل تلقائياً في <strong>مبيعات الفرع اليومية</strong> بمنظومة الـ HR وكشف تقفيل الوردية.
            </span>
          </div>

          {/* ── أزرار الإجراءات ── */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '12px 18px',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14.5px',
                fontWeight: '800',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              {isSubmitting ? (
                <>جاري إتمام التسليم وتحديث المبيعات...</>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>تأكيد التسليم وتحصيل <span className="tabular-nums" style={{ fontFamily: 'var(--outstock-font-mono)' }}>{currentCollectNum.toFixed(2)}</span> ج.م</span>
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
