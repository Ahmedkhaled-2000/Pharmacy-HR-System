import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Minus,
  CheckCircle2,
  Calendar,
  User,
  Phone,
  FileText,
  Printer,
  CreditCard
} from 'lucide-react';
import {
  outstockAdjustCustomerWallet,
  outstockGetCustomerWalletTransactions,
  outstockRequestWalletOtp,
  outstockVerifyWalletOtp
} from '../../../utils/outstockApiClient';
import { printCustomerWalletReceipt as printWalletReceipt } from '../../../utils/printCustomerWalletReceipt';

export default function CustomerWalletModal({
  customer,
  isOpen,
  onClose,
  onBalanceUpdated,
  branchName = 'الفرع الرئيسي',
  showToast
}) {
  const [balance, setBalance] = useState(parseFloat(customer?.wallet_balance || customer?.walletBalance || 0));
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // حقول نموذج الإيداع / الخصم
  const [adjustmentType, setAdjustmentType] = useState('deposit'); // 'deposit' | 'withdraw'
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'instapay' | 'vodafone_cash' | 'card' | 'return_settlement'
  const [employeeCode, setEmployeeCode] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [lastTxReceiptData, setLastTxReceiptData] = useState(null);

  // طبقة الأمان المتقدمة لعمليات السحب (WhatsApp OTP / 2D QR Scanner)
  const [verificationMethod, setVerificationMethod] = useState('employee_code'); // 'employee_code' | 'otp' | 'qr_scanner'
  const [otpCode, setOtpCode] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');

  const handleRequestOtp = async (methodType = 'otp') => {
    if (!customer?.id) return;
    setIsRequestingOtp(true);
    setOtpSentMessage('');
    try {
      const res = await outstockRequestWalletOtp(customer.id, {
        method: methodType,
        amount: parseFloat(amount) || 0
      });
      if (res?.success) {
        const msg = methodType === 'otp'
          ? '✅ تم إرسال كود التحقق (OTP) لواتساب العميل بنجاح'
          : '✅ تم إرسال رمز QR المشفر لواتساب العميل (جاهز للمسح بالـ Hand Scanner)';
        setOtpSentMessage(msg);
        showToast?.(msg);
      } else {
        showToast?.(res?.error || 'تعذر إرسال رمز التحقق');
      }
    } catch {
      showToast?.('حدث خطأ أثناء طلب رمز الأمان');
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const fetchTransactions = useCallback(async () => {
    if (!customer?.id) return;
    setIsLoading(true);
    try {
      const res = await outstockGetCustomerWalletTransactions(customer.id);
      if (res?.success && Array.isArray(res.transactions)) {
        setTransactions(res.transactions);
      }
    } catch (e) {
      console.warn('Failed to fetch wallet transactions:', e);
    } finally {
      setIsLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    if (isOpen && customer?.id) {
      setBalance(parseFloat(customer.wallet_balance || customer.walletBalance || 0));
      fetchTransactions();
      setAmount('');
      setNotes('');
    }
  }, [isOpen, customer, fetchTransactions]);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (!isSubmitting) {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // منع تمرير خلفية الصفحة
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !customer) return null;

  const handleAdjust = async (e) => {
    e.preventDefault();
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast?.('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    if (!employeeCode.trim()) {
      showToast?.('⚠️ يرجى إدخال كود الموظف المسؤول عن العملية');
      return;
    }

    if (adjustmentType === 'withdraw' && numAmt > balance) {
      showToast?.('⚠️ الرصيد المتاح في المحفظة أقل من المبلغ المراد سحبه/خصمه');
      return;
    }

    if (adjustmentType === 'withdraw') {
      if (verificationMethod === 'otp' && !otpCode.trim()) {
        showToast?.('⚠️ يرجى إدخال كود الأمان (OTP) المكون من 4 أرقام والمرسل لواتساب العميل');
        return;
      }
      if (verificationMethod === 'qr_scanner' && !qrToken.trim()) {
        showToast?.('⚠️ يرجى مسح رمز الـ QR من هاتف العميل بالـ Hand Scanner');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await outstockAdjustCustomerWallet(customer.id, {
        amount: numAmt,
        type: adjustmentType,
        paymentMethod,
        employeeCode: employeeCode.trim(),
        verificationMethod: adjustmentType === 'withdraw' ? verificationMethod : 'employee_code',
        otpCode: adjustmentType === 'withdraw' && verificationMethod === 'otp' ? otpCode.trim() : null,
        qrToken: adjustmentType === 'withdraw' && verificationMethod === 'qr_scanner' ? qrToken.trim() : null,
        branchName,
        notes: notes.trim() || (adjustmentType === 'deposit' ? 'شحن رصيد نقدي' : 'سحب / تسوية رصيد')
      });

      if (res?.success) {
        const newBal = parseFloat(res.walletBalance ?? (adjustmentType === 'deposit' ? balance + numAmt : balance - numAmt));
        setBalance(newBal);

        const receiptInfo = {
          receiptNumber: res.receiptNumber || ('RCP-' + Date.now().toString().slice(-6)),
          customer: {
            id: customer.id,
            fullName: customer.full_name || customer.fullName || 'عميل نقدي',
            phone: customer.whatsapp_phone || customer.whatsappPhone || ''
          },
          transactionType: adjustmentType,
          amount: numAmt,
          previousBalance: balance,
          newBalance: newBal,
          balanceAfter: newBal,
          paymentMethod,
          employeeCode: employeeCode.trim(),
          employeeName: employeeCode.trim(),
          branchName,
          notes: notes.trim() || (adjustmentType === 'deposit' ? 'شحن رصيد' : 'سحب رصيد'),
          date: new Date()
        };
        setLastTxReceiptData(receiptInfo);

        setAmount('');
        setNotes('');
        setOtpCode('');
        setQrToken('');
        setOtpSentMessage('');
        showToast?.(`✅ تم ${adjustmentType === 'deposit' ? 'إيداع' : 'خصم'} ${numAmt.toFixed(2)} ج.م بنجاح`);
        fetchTransactions();
        onBalanceUpdated?.(customer.id, newBal);
      } else {
        showToast?.(res?.error || 'تعذر تعديل رصيد المحفظة');
      }
    } catch {
      showToast?.('حدث خطأ في الاتصال أثناء تعديل الرصيد');
    } finally {
      setIsSubmitting(false);
    }
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
        padding: '16px',
        overscrollBehavior: 'contain'
      }}
      onClick={onClose}
    >
      <div
        className="outstock-modal-card"
        style={{
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          direction: 'rtl',
          overscrollBehavior: 'contain'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* الرأس */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
            color: '#ffffff',
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
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wallet size={20} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                محفظة العميل والحساب الدائن 👛
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.9 }}>
                إدارة الرصيد الدائن ومستردات الفائض وحركات السحب
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
              padding: '6px',
              cursor: 'pointer',
              color: '#ffffff'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* بطاقة الرصيد وبيانات العميل */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '800', color: '#1e293b' }}>
                <User size={16} color="#0d9488" />
                <span>{customer.full_name || customer.fullName || 'عميل نقدي'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
                <Phone size={13} />
                <span dir="ltr">{customer.whatsapp_phone || customer.whatsappPhone || '—'}</span>
                {customer.customer_code && (
                  <span style={{ marginRight: '6px', background: '#e2e8f0', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                    {customer.customer_code}
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                background: '#ecfdf5',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                padding: '10px 18px',
                textAlign: 'center'
              }}
            >
              <span style={{ fontSize: '11.5px', color: '#166534', fontWeight: '700', display: 'block' }}>
                الرصيد المتاح حالياً بالصيدلية
              </span>
              <strong style={{ fontSize: '20px', color: '#15803d', fontFamily: 'monospace' }}>
                {balance.toFixed(2)} <span style={{ fontSize: '12px' }}>ج.م</span>
              </strong>
            </div>
          </div>

          {/* نموذج شحن / خصم الرصيد */}
          <form
            onSubmit={handleAdjust}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>إجراء حركة مالية جديدة على المحفظة:</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setAdjustmentType('deposit')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: adjustmentType === 'deposit' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                  background: adjustmentType === 'deposit' ? '#f0fdf4' : '#ffffff',
                  color: adjustmentType === 'deposit' ? '#15803d' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={15} />
                <span>إيداع / شحن رصيد دائن</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustmentType('withdraw')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  border: adjustmentType === 'withdraw' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                  background: adjustmentType === 'withdraw' ? '#fef2f2' : '#ffffff',
                  color: adjustmentType === 'withdraw' ? '#b91c1c' : '#64748b',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Minus size={15} />
                <span>سحب / خصم من الرصيد</span>
              </button>
            </div>

            {/* طريقة الدفع */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
                طريقة الدفع / وسيلة الحركة:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: adjustmentType === 'deposit' ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)', gap: '6px' }}>
                {[
                  { id: 'cash', label: '💵 كاش نقدي' },
                  { id: 'instapay', label: '⚡ انستاباي' },
                  { id: 'vodafone_cash', label: '📱 محفظة إلكترونية' },
                  { id: 'card', label: '💳 فيزا / كارت' },
                  ...(adjustmentType === 'deposit' ? [{ id: 'return_settlement', label: '↩️ تسوية مرتجع' }] : [])
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: paymentMethod === m.id ? '800' : '600',
                      cursor: 'pointer',
                      border: paymentMethod === m.id ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                      background: paymentMethod === m.id ? '#f0fdfa' : '#ffffff',
                      color: paymentMethod === m.id ? '#0f766e' : '#64748b'
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* طبقة الأمان المتقدمة لعمليات السحب (WhatsApp OTP / 2D QR Scanner) */}
            {adjustmentType === 'withdraw' && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>🛡️ طبقة التحقق والأمان لعملية السحب:</span>
                  </label>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>حماية سيادية لأرصدة العملاء</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'employee_code', label: '🔐 كود الموظف المشفر' },
                    { id: 'otp', label: '📱 كود OTP للواتساب' },
                    { id: 'qr_scanner', label: '📷 مسح 2D QR بالماسح' }
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVerificationMethod(v.id)}
                      style={{
                        padding: '6px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: verificationMethod === v.id ? '800' : '600',
                        border: verificationMethod === v.id ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                        background: verificationMethod === v.id ? '#fef2f2' : '#ffffff',
                        color: verificationMethod === v.id ? '#b91c1c' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>

                {verificationMethod === 'otp' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <button
                      type="button"
                      disabled={isRequestingOtp}
                      onClick={() => handleRequestOtp('otp')}
                      className="outstock-btn"
                      style={{ fontSize: '11px', padding: '6px 12px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', whiteSpace: 'nowrap' }}
                    >
                      {isRequestingOtp ? 'جاري الإرسال...' : 'إرسال كود OTP لواتساب العميل 📲'}
                    </button>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="كود الـ OTP (4 أرقام)"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="outstock-form-input"
                      style={{ height: '34px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', flex: 1, letterSpacing: '4px' }}
                    />
                  </div>
                )}

                {verificationMethod === 'qr_scanner' && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <button
                      type="button"
                      disabled={isRequestingOtp}
                      onClick={() => handleRequestOtp('qr_scanner')}
                      className="outstock-btn"
                      style={{ fontSize: '11px', padding: '6px 12px', background: '#7c3aed', color: '#ffffff', border: 'none', borderRadius: '6px', whiteSpace: 'nowrap' }}
                    >
                      {isRequestingOtp ? 'جاري الإرسال...' : 'إرسال QR لواتساب العميل 📲'}
                    </button>
                    <input
                      type="text"
                      autoFocus
                      placeholder="امسح الـ QR من هاتف العميل بالـ Hand Scanner..."
                      value={qrToken}
                      onChange={(e) => setQrToken(e.target.value)}
                      className="outstock-form-input"
                      style={{ height: '34px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', flex: 1 }}
                    />
                  </div>
                )}

                {otpSentMessage && (
                  <span style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: '700' }}>
                    {otpSentMessage}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '110px 110px 1fr auto', gap: '8px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  المبلغ (ج.م) * :
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="outstock-form-input"
                  style={{ fontWeight: 'bold', textAlign: 'center', height: '36px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  كود الموظف * 🔒:
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="outstock-form-input"
                  style={{ fontWeight: 'bold', textAlign: 'center', height: '36px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  البيان / سبب الحركة:
                </label>
                <input
                  type="text"
                  placeholder="مثال: شحن رصيد، مسترد..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="outstock-form-input"
                  style={{ height: '36px', fontSize: '12px' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="outstock-btn"
                style={{
                  height: '36px',
                  padding: '0 14px',
                  fontSize: '12px',
                  fontWeight: '800',
                  background: adjustmentType === 'deposit' ? '#059669' : '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px'
                }}
              >
                {isSubmitting ? 'جاري...' : 'تنفيذ'}
              </button>
            </div>

            {/* بانر نجاح العملية الأحدث مع زر طباعة الإيصال الفوري */}
            {lastTxReceiptData && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#166534', fontWeight: '700' }}>
                  <CheckCircle2 size={16} color="#16a34a" />
                  <span>تم حفظ الحركة بنجاح! الرصيد الحالي: {lastTxReceiptData.balanceAfter.toFixed(2)} ج.م</span>
                </div>
                <button
                  type="button"
                  onClick={() => printWalletReceipt(lastTxReceiptData)}
                  style={{
                    background: '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Printer size={13} />
                  <span>طباعة إيصال حراري 🖨️</span>
                </button>
              </div>
            )}
          </form>

          {/* سجل حركات المحفظة */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={15} color="#0d9488" />
                <span>كشف حركات المحفظة ({transactions.length})</span>
              </div>
              <button
                type="button"
                onClick={fetchTransactions}
                style={{ background: 'none', border: 'none', color: '#0284c7', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                title="تحديث الحركات"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                overflow: 'hidden',
                maxHeight: '230px',
                overflowY: 'auto',
                background: '#ffffff'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right' }}>
                    <th style={{ padding: '8px 10px' }}>التاريخ والوقت</th>
                    <th style={{ padding: '8px 10px' }}>نوع الحركة</th>
                    <th style={{ padding: '8px 10px' }}>المبلغ</th>
                    <th style={{ padding: '8px 10px' }}>البيان</th>
                    <th style={{ padding: '8px 10px' }}>المحرر</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>إيصال</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        لا توجد حركات مسجلة على هذه المحفظة حتى الآن
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t, idx) => {
                      const isDep = t.transaction_type === 'deposit' || t.transaction_type === 'credit';
                      const txReceipt = {
                        txId: t.id || ('TX-' + idx),
                        transactionType: isDep ? 'deposit' : 'withdraw',
                        amount: parseFloat(t.amount || 0),
                        balanceAfter: parseFloat(t.balance_after || t.balanceAfter || balance),
                        paymentMethod: t.payment_method || t.paymentMethod || 'cash',
                        employeeCode: t.created_by || 'الفرع',
                        notes: t.notes || (isDep ? 'شحن رصيد' : 'سحب رصيد'),
                        branchName,
                        customerName: customer.full_name || customer.fullName || 'عميل نقدي',
                        customerPhone: customer.whatsapp_phone || customer.whatsappPhone || '',
                        createdAt: t.created_at
                      };

                      return (
                        <tr key={t.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>
                            {t.created_at ? new Date(t.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              style={{
                                background: isDep ? '#dcfce7' : '#fee2e2',
                                color: isDep ? '#15803d' : '#b91c1c',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '700',
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              {isDep ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                              {isDep ? 'إيداع / دائن' : 'خصم / سحب'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: '900', color: isDep ? '#16a34a' : '#dc2626' }}>
                            {isDep ? `+${parseFloat(t.amount || 0).toFixed(2)}` : `-${parseFloat(t.amount || 0).toFixed(2)}`} ج.م
                          </td>
                          <td style={{ padding: '8px 10px', color: '#334155' }}>
                            {t.notes || '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px' }}>
                            {t.created_by || 'الفرع'}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => printWalletReceipt(txReceipt)}
                              title="طباعة إيصال حراري"
                              style={{
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '4px 6px',
                                cursor: 'pointer',
                                color: '#0f766e',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Printer size={13} />
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
        </div>

        {/* التذييل */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '7px 20px' }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
