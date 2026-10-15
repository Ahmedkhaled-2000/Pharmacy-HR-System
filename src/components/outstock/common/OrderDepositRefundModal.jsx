import React, { useState } from 'react';
import {
  DollarSign,
  Wallet,
  AlertTriangle,
  CheckCircle,
  X,
  CreditCard,
  Building,
  User,
  Phone,
  FileText,
  Lock
} from 'lucide-react';

/**
 * OrderDepositRefundModal.jsx
 * نافذة احترافية لتسوية واسترداد العربون قبل حذف أو إلغاء الطلب
 * - الاختيار بين استرداد نقدي فوري (الافتراضي) أو إيداع بمحفظة العميل
 * - إظهار كود الموظف وتفاصيل الطلب والمبلغ المستحق رده
 */
export default function OrderDepositRefundModal({
  isOpen,
  onClose,
  order,
  onConfirmRefund,
  currentPharmacist = ''
}) {
  const [refundDestination, setRefundDestination] = useState('cash'); // الافتراضي: استرداد نقدي
  const [employeeCode, setEmployeeCode] = useState('');
  const [notes, setNotes] = useState('إلغاء الطلب لعدم توافر الصنف بالسوق واسترداد العربون');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !order) return null;

  const paidAmount = parseFloat(order.paid_amount || order.paidAmount || 0);
  const customerName = order.customer_name || order.customerName || 'عميل نقدي';
  const customerPhone = order.customer_phone || order.customerPhone || '—';
  const orderNumber = order.order_number || order.orderNumber || '—';
  const currentWalletBalance = parseFloat(order.customer_wallet_balance || order.wallet_balance || 0);
  const newWalletBalance = currentWalletBalance + paidAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeCode.trim()) {
      alert('يرجى إدخال كود الموظف المسؤول لتأكيد العملية والرقابة المالية');
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirmRefund({
        refundDestination,
        employeeCode: employeeCode.trim(),
        employeeName: currentPharmacist,
        notes: notes.trim(),
        paidAmount
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: 'Cairo, Tajawal, system-ui, sans-serif'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
            padding: '18px 24px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DollarSign size={24} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>
                تسوية واسترداد العربون قبل حذف الطلب
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', opacity: 0.9 }}>
                يوجد عربون مدفوع مسبقاً مسجل لهذا الطلب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {/* Summary Box */}
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #fecaca',
              borderRadius: '14px',
              padding: '14px 18px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#991b1b', fontWeight: '700' }}>
                رقم الطلب: <strong style={{ fontFamily: 'monospace', fontSize: '14px' }}>#{orderNumber}</strong>
              </span>
              <div
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: '900',
                  letterSpacing: '0.5px'
                }}
              >
                مبلغ العربون: {paidAmount.toFixed(2)} ج.م
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#475569' }}>
              <span>👤 <strong>{customerName}</strong></span>
              <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>📞 {customerPhone}</span>
            </div>
          </div>

          {/* Refund Method Selection */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>
              اختر طريقة رد العربون للعميل:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* Option 1: Cash (Default) */}
              <div
                onClick={() => setRefundDestination('cash')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: refundDestination === 'cash' ? '2.5px solid #059669' : '1.5px solid #cbd5e1',
                  background: refundDestination === 'cash' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: refundDestination === 'cash' ? '#059669' : '#e2e8f0',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px'
                    }}
                  >
                    💵
                  </div>
                  <strong style={{ fontSize: '14px', color: refundDestination === 'cash' ? '#065f46' : '#334155' }}>
                    استرداد نقدي فوري
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.3 }}>
                  إخراج المبلغ كاش من درج الكاشير وتسليمه للعميل مباشرة (الافتراضي)
                </p>
                {refundDestination === 'cash' && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: '#059669',
                      color: '#ffffff',
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      fontWeight: '800'
                    }}
                  >
                    ✓ محدد
                  </span>
                )}
              </div>

              {/* Option 2: Wallet */}
              <div
                onClick={() => setRefundDestination('wallet')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: refundDestination === 'wallet' ? '2.5px solid #0284c7' : '1.5px solid #cbd5e1',
                  background: refundDestination === 'wallet' ? '#f0f9ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: refundDestination === 'wallet' ? '#0284c7' : '#e2e8f0',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px'
                    }}
                  >
                    💳
                  </div>
                  <strong style={{ fontSize: '14px', color: refundDestination === 'wallet' ? '#0369a1' : '#334155' }}>
                    محفظة العميل
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: 1.3 }}>
                  إيداع في رصيد محفظة العميل للاستخدام في طلبات وفواتير لاحقة
                </p>
                {refundDestination === 'wallet' && (
                  <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#0369a1', fontWeight: '700' }}>
                    الرصيد بعد الإيداع: {newWalletBalance.toFixed(2)} ج.م
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>
              سبب إلغاء الطلب واسترداد العربون:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب سبب الإلغاء والاسترداد..."
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Employee Code Verification */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#b91c1c', marginBottom: '6px' }}>
              🔒 كود الموظف المسؤول لتأكيد التسوية والرقابة:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="أدخل كود الموظف..."
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #f87171',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: '#fff5f5',
                  fontWeight: '700',
                  letterSpacing: '1px'
                }}
              />
            </div>
            <small style={{ color: '#64748b', fontSize: '11.5px', marginTop: '4px', display: 'block' }}>
              يتم تسجيل كود الموظف في السجل الرقابي والمالي لوردية الكاشير
            </small>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              تراجع وإلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
              }}
            >
              {isSubmitting ? 'جاري التسوية والحذف...' : '✓ تأكيد رد العربون وحذف الطلب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
