import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileText,
  User,
  DollarSign,
  Package,
  Layers,
  ArrowRight
} from 'lucide-react';
import { outstockCreateOrderReturn } from '../../../utils/outstockApiClient';
import { printReturnReceipt } from '../../../utils/printReturnReceipt';

const RETURN_REASONS = [
  'العميل استغنى عن الصنف',
  'صنف تالف أو به عيب تصنيع',
  'صنف منتهي الصلاحية أو قريب الانتهاء',
  'صرف صنف غير مطابق للطلب',
  'إلغاء الطلب من قبل العميل قبل الاستلام',
  'أخرى (توضيح في الملاحظات)'
];

export default function OrderReturnModal({
  order,
  isOpen,
  onClose,
  onReturnSubmitted,
  branchName = 'الصيدلية',
  showToast,
  authenticatedEmployee = null
}) {
  const [returnType, setReturnType] = useState('partial'); // 'partial' | 'full'
  const [selectedItems, setSelectedItems] = useState({});
  const [generalReason, setGeneralReason] = useState(RETURN_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [employeeCode, setEmployeeCode] = useState(authenticatedEmployee?.code || authenticatedEmployee?.employeeCode || '');
  const [employeeName, setEmployeeName] = useState(authenticatedEmployee?.name || authenticatedEmployee?.employeeName || authenticatedEmployee?.fullName || '');
  const [refundDestination, setRefundDestination] = useState('wallet'); // 'wallet' | 'cash' | 'invoice_deduction'
  const [downPaymentRefund, setDownPaymentRefund] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReturnData, setSubmittedReturnData] = useState(null);

  // تهيئة الأصناف عند فتح النافذة
  useEffect(() => {
    if (isOpen && order) {
      setSubmittedReturnData(null);
      setCustomReason('');
      setGeneralReason(RETURN_REASONS[0]);
      setRefundDestination('wallet');

      if (authenticatedEmployee) {
        setEmployeeCode(authenticatedEmployee.code || authenticatedEmployee.employeeCode || '');
        setEmployeeName(authenticatedEmployee.name || authenticatedEmployee.employeeName || authenticatedEmployee.fullName || '');
      }

      // عربون الطلب إن وجد
      const paid = parseFloat(order.paid_amount || order.paidAmount || 0);
      setDownPaymentRefund(paid > 0 ? paid : 0);

      // استخراج الأصناف
      const rawItems = Array.isArray(order.items) ? order.items : [];
      const initSelected = {};
      rawItems.forEach((it, idx) => {
        const id = it.id || `item_${idx}`;
        const qty = parseInt(it.quantity || 1, 10);
        const price = parseFloat(it.unit_price || it.unitPrice || 0);
        initSelected[id] = {
          selected: false,
          itemId: it.id,
          medicationName: it.medication_name || it.medicationName || 'صنف غير مسمى',
          maxQty: qty,
          quantity: qty,
          unitPrice: price,
          totalPrice: qty * price,
          itemType: it.item_type || it.itemType || 'medication',
          returnReason: RETURN_REASONS[0]
        };
      });
      setSelectedItems(initSelected);
    }
  }, [isOpen, order]);

  // تحديث نوع الإرجاع (كلي / جزئي)
  const handleToggleReturnType = (type) => {
    setReturnType(type);
    setSelectedItems((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = {
          ...next[k],
          selected: type === 'full',
          quantity: next[k].maxQty,
          totalPrice: next[k].maxQty * next[k].unitPrice
        };
      });
      return next;
    });
  };

  // تعديل صنف فردي
  const handleItemSelectToggle = (id) => {
    setSelectedItems((prev) => {
      const item = prev[id];
      if (!item) return prev;
      return {
        ...prev,
        [id]: {
          ...item,
          selected: !item.selected
        }
      };
    });
  };

  const handleItemQtyChange = (id, newQty) => {
    setSelectedItems((prev) => {
      const item = prev[id];
      if (!item) return prev;
      const validQty = Math.max(1, Math.min(item.maxQty, parseInt(newQty || 1, 10)));
      return {
        ...prev,
        [id]: {
          ...item,
          quantity: validQty,
          totalPrice: validQty * item.unitPrice
        }
      };
    });
  };

  const handleItemReasonChange = (id, reason) => {
    setSelectedItems((prev) => {
      const item = prev[id];
      if (!item) return prev;
      return {
        ...prev,
        [id]: {
          ...item,
          returnReason: reason
        }
      };
    });
  };

  if (!isOpen || !order) return null;

  // حساب الإجماليات
  const activeReturnItems = Object.values(selectedItems).filter((i) => i.selected);
  const totalItemsRefund = activeReturnItems.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  const totalRefund = totalItemsRefund;

  // إرسال طلب المرتجع
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    if (activeReturnItems.length === 0) {
      showToast?.('⚠️ يرجى تحديد صنف واحد على الأقل لإرجاعه');
      return;
    }
    if (!employeeCode.trim()) {
      showToast?.('⚠️ يرجى إدخال كود الموظف المسؤول عن تسجيل المرتجع');
      return;
    }

    const finalGeneralReason = generalReason === 'أخرى (توضيح في الملاحظات)'
      ? (customReason.trim() || 'أسباب أخرى')
      : generalReason;

    setIsSubmitting(true);
    try {
      const payload = {
        returnType,
        items: activeReturnItems.map((i) => ({
          itemId: i.itemId,
          medicationName: i.medicationName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          itemType: i.itemType,
          returnReason: i.returnReason
        })),
        totalRefundAmount: totalRefund,
        downPaymentRefund: parseFloat(downPaymentRefund || 0),
        generalReturnReason: finalGeneralReason,
        refundDestination,
        employeeCode: employeeCode.trim(),
        employeeName: employeeName.trim() || 'مسؤول الصيدلية'
      };

      const res = await outstockCreateOrderReturn(order.id, payload);
      if (res?.success) {
        const walletMsg = res.walletCredited ? ' وتم إضافة المبلغ لمحفظة العميل بنجاح 👛' : '';
        showToast?.(`✅ تم تسجيل المرتجع بنجاح${walletMsg} وإشعار إدارة المشتريات 📲`);
        const completeData = {
          ...payload,
          returnId: res.returnId || ('RET-' + Date.now().toString().slice(-6)),
          orderNumber: order.order_number || order.orderNumber,
          branchName,
          customerName: order.customer_name || order.customer?.full_name || 'عميل نقدي',
          customerPhone: order.customer_phone || order.customer?.whatsapp_phone || ''
        };
        setSubmittedReturnData(completeData);
        // طباعة إيصال المرتجع الحراري 80mm تلقائياً
        try {
          printReturnReceipt(completeData);
        } catch (printErr) {
          console.warn('Auto print return receipt error:', printErr);
        }
        onReturnSubmitted?.(completeData);
      } else {
        showToast?.(res?.error || 'تعذر تسجيل طلب المرتجع');
      }
    } catch {
      showToast?.('حدث خطأ في الاتصال بالخادم أثناء تسجيل المرتجع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!submittedReturnData) return;
    printReturnReceipt(submittedReturnData);
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="outstock-modal-card"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotateCcw size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                طلب مرتجع للطلب #{order.order_number || order.orderNumber}
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0 0' }}>
                تسجيل مرتجع مبيعات كامل أو جزئي وتوجيه المسترد للمحفظة أو الخزينة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {submittedReturnData ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}
              >
                <CheckCircle2 size={38} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#166534', marginBottom: '8px' }}>
                تم تسجيل طلب المرتجع بنجاح!
              </h3>
              <p style={{ color: '#4b5563', fontSize: '14px', maxWidth: '480px', margin: '0 auto 20px' }}>
                رقم إشعار المرتجع: <strong>{submittedReturnData.returnId}</strong> بقيمة إجمالية{' '}
                <strong>{submittedReturnData.totalRefundAmount?.toFixed(2)} ج.م</strong>. تم إرسال إشعار فوري لإدارة المشتريات والمالك للاعتماد.
              </p>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 24px',
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  <Printer size={18} />
                  طباعة إيصال استلام مرتجع حراري (80mm)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '12px 20px',
                    background: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  إغلاق النافذة
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitReturn} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* اختيار نوع المرتجع */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '8px' }}>
                  نوع المرتجع
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleReturnType('partial')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: `2px solid ${returnType === 'partial' ? '#dc2626' : '#cbd5e1'}`,
                      background: returnType === 'partial' ? '#fef2f2' : '#ffffff',
                      color: returnType === 'partial' ? '#991b1b' : '#64748b',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    مرتجع جزئي (أصناف محددة)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleReturnType('full')}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: `2px solid ${returnType === 'full' ? '#dc2626' : '#cbd5e1'}`,
                      background: returnType === 'full' ? '#fef2f2' : '#ffffff',
                      color: returnType === 'full' ? '#991b1b' : '#64748b',
                      fontWeight: '700',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    مرتجع كلي للطلب بالكامل
                  </button>
                </div>
              </div>

              {/* قائمة الأصناف */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
                    الأصناف المحددة للإرجاع ({activeReturnItems.length} من {Object.keys(selectedItems).length})
                  </label>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    حدد الصنف والكمية وسبب الإرجاع
                  </span>
                </div>

                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    maxHeight: '260px',
                    overflowY: 'auto'
                  }}
                >
                  {Object.entries(selectedItems).map(([id, item]) => (
                    <div
                      key={id}
                      style={{
                        padding: '12px',
                        borderBottom: '1px solid #f1f5f9',
                        background: item.selected ? '#fef2f2' : '#ffffff',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleItemSelectToggle(id)}
                          style={{ width: '18px', height: '18px', accentColor: '#dc2626', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#0f172a' }}>
                            {item.medicationName}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            سعر الوحدة: {item.unitPrice.toFixed(2)} ج.م | الكمية المتاحة: {item.maxQty}
                          </div>
                        </div>

                        {item.selected && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <label style={{ fontSize: '12px', color: '#64748b' }}>الكمية:</label>
                              <input
                                type="number"
                                min="1"
                                max={item.maxQty}
                                value={item.quantity}
                                onChange={(e) => handleItemQtyChange(id, e.target.value)}
                                style={{
                                  width: '55px',
                                  padding: '4px 6px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  textAlign: 'center',
                                  fontWeight: '700'
                                }}
                              />
                            </div>
                            <div style={{ fontWeight: '800', color: '#dc2626', minWidth: '70px', textAlign: 'left' }} dir="ltr">
                              {item.totalPrice.toFixed(2)} ج.م
                            </div>
                          </div>
                        )}
                      </div>

                      {item.selected && (
                        <div style={{ marginTop: '8px', paddingRight: '28px' }}>
                          <select
                            value={item.returnReason}
                            onChange={(e) => handleItemReasonChange(id, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              fontSize: '12px',
                              color: '#334155'
                            }}
                          >
                            {RETURN_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* وجهة المبلغ المسترد */}
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '8px' }}>
                  طريقة رد القيمة للعميل (وجهة الاسترداد)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px',
                      background: '#ffffff',
                      border: `1.5px solid ${refundDestination === 'wallet' ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      color: refundDestination === 'wallet' ? '#1e40af' : '#475569'
                    }}
                  >
                    <input
                      type="radio"
                      name="refundDest"
                      value="wallet"
                      checked={refundDestination === 'wallet'}
                      onChange={() => setRefundDestination('wallet')}
                      style={{ accentColor: '#2563eb' }}
                    />
                    إضافة لرصيد محفظة العميل (موصى بها)
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px',
                      background: '#ffffff',
                      border: `1.5px solid ${refundDestination === 'cash' ? '#2563eb' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      color: refundDestination === 'cash' ? '#1e40af' : '#475569'
                    }}
                  >
                    <input
                      type="radio"
                      name="refundDest"
                      value="cash"
                      checked={refundDestination === 'cash'}
                      onChange={() => setRefundDestination('cash')}
                      style={{ accentColor: '#2563eb' }}
                    />
                    استرداد نقدي فوري من الخزينة
                  </label>
                </div>
              </div>

              {/* كود الموظف وتأكيد الهوية */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>
                      كود الموظف المستلم للمرتجع *
                    </label>
                    <span style={{ fontSize: '11px', color: '#059669', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <CheckCircle2 size={13} color="#059669" />
                      موثق ومقفل 🔒
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    readOnly
                    disabled
                    placeholder="كود الموظف"
                    value={employeeCode}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1.5px solid #a7f3d0',
                      background: '#f0fdf4',
                      color: '#065f46',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '800',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
                    اسم الموظف المستلم
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    placeholder="اسم الصيدلي / الموظف"
                    value={employeeName}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1.5px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#1e293b',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '700',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>
              </div>

              {/* ملاحظات عامة */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  سبب المرتجع العام / ملاحظات إضافية
                </label>
                <select
                  value={generalReason}
                  onChange={(e) => setGeneralReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '13px',
                    marginBottom: '8px'
                  }}
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {generalReason === 'أخرى (توضيح في الملاحظات)' && (
                  <textarea
                    rows={2}
                    placeholder="اكتب تفاصيل سبب المرتجع هنا..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                  />
                )}
              </div>

              {/* شريط الإجمالي والتأكيد */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: '#f1f5f9',
                  borderRadius: '12px'
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>إجمالي القيمة المستردة للعميل:</div>
                  <div style={{ fontSize: '20px', fontWeight: '900', color: '#dc2626' }}>
                    {totalRefund.toFixed(2)} ج.م
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    style={{
                      padding: '10px 18px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontWeight: '700',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || activeReturnItems.length === 0}
                    style={{
                      padding: '10px 24px',
                      background: '#dc2626',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '700',
                      color: '#ffffff',
                      cursor: isSubmitting || activeReturnItems.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: isSubmitting || activeReturnItems.length === 0 ? 0.6 : 1
                    }}
                  >
                    {isSubmitting ? 'جاري التسجيل...' : 'تأكيد وإرسال طلب المرتجع'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
