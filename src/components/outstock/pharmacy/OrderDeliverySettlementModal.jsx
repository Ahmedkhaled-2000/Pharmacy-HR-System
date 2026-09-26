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
  ShieldCheck
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
  onClose,
  onDeliveredSuccess,
  onOpenReceiptPrint,
  showToast = alert
}) {
  const totalAmount = parseFloat(order?.net_amount || order?.netAmount || order?.total_amount || 0);
  const paidAdvance = parseFloat(order?.paid_amount || order?.paidAmount || 0);
  const initialRemaining = Math.max(0, totalAmount - paidAdvance);

  const [collectedAmount, setCollectedAmount] = useState(String(initialRemaining > 0 ? initialRemaining : 0));
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'wallet' | 'credit'
  const [cashierName, setCashierName] = useState(currentPharmacist || 'د. الصيدلي');
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
        cashierName,
        receiptNumber,
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
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
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
          direction: 'rtl'
        }}
      >
        {/* ── الرأس ── */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
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
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PackageCheck size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                تسليم الطلب وتسوية الحساب
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.9, marginTop: '2px' }}>
                رقم الإيصال: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{order.order_number || order.orderNumber}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ── جسم النافذة القابل للتمرير ── */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                    order.items.map((it, idx) => (
                      <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600', color: '#1e293b' }}>
                          {it.medication_name || it.medicationName}
                          <span style={{ fontSize: '11px', color: '#64748b', marginRight: '6px' }}>
                            ({it.unit_type === 'pack' ? 'عبوة' : 'شريط'})
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                          {it.quantity}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'left', color: '#475569' }}>
                          {parseFloat(it.unit_price || it.unitPrice || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#047857' }}>
                          {parseFloat(it.total_price || it.totalPrice || 0).toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))
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
                <strong style={{ fontSize: '16px', color: '#047857' }}>
                  {totalAmount.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11.5px', color: '#065f46', display: 'block', fontWeight: '600' }}>
                  عربون مدفوع مسبقاً
                </span>
                <strong style={{ fontSize: '16px', color: '#0284c7' }}>
                  {paidAdvance.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>

              <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <span style={{ fontSize: '11.5px', color: '#b91c1c', display: 'block', fontWeight: '600' }}>
                  المتبقي المطلوب
                </span>
                <strong style={{ fontSize: '16px', color: '#dc2626' }}>
                  {initialRemaining.toFixed(2)} <span style={{ fontSize: '11px' }}>ج.م</span>
                </strong>
              </div>
            </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { id: 'cash', label: 'نقدي (كاش)', icon: DollarSign, color: '#16a34a' },
                { id: 'card', label: 'فيزا / بطاقة', icon: CreditCard, color: '#2563eb' },
                { id: 'wallet', label: 'محفظة / إنستاباي', icon: Smartphone, color: '#9333ea' },
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
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '800',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {isSubmitting ? (
                <>جاري إتمام التسليم وتحديث المبيعات...</>
              ) : (
                <>
                  <CheckCircle size={18} />
                  <span>تأكيد التسليم وتحصيل {currentCollectNum.toFixed(2)} ج.م</span>
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
