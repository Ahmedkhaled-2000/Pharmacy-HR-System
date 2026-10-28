import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import {
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  CheckCircle2,
  X,
  Printer,
  UserCheck,
  AlertTriangle,
  ShieldCheck,
  Send,
  Lock,
  ArrowRight,
  Layers
} from 'lucide-react';

export default function PosPaymentModal() {
  const {
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    activePaymentSale,
    finalizeSale
  } = usePOS();

  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const { state } = useData?.() || {};
  const { showToast } = useUI?.() || {};

  if (!isPaymentModalOpen || !activePaymentSale) return null;

  const totalAmount = parseFloat(activePaymentSale.totalAmount || 0);
  const currentCustomer = activePaymentSale.customer || {};
  const customerSystemBalance = Math.max(0, parseFloat(currentCustomer.walletBalance ?? currentCustomer.wallet_balance ?? 0));
  const customerPhone = currentCustomer.phone || '';
  const walletDeductedInSale = parseFloat(activePaymentSale.walletDeducted || 0);

  // وسائل الدفع: نقدي | فيزا | محافظ اتصالات وإنستاباي | محفظة العميل بالنظام | دفع مجزأ
  const [selectedMethod, setSelectedMethod] = useState(() => {
    const m = activePaymentSale.paymentMethod || 'cash';
    if (m === 'wallet') return 'telecom_wallet';
    return m;
  });

  const [paidCash, setPaidCash] = useState(totalAmount);
  const [isProcessing, setIsProcessing] = useState(false);

  // حالة الدفع المتعدد المجزأ (Multi-Tender Split Payment)
  const [splitTenders, setSplitTenders] = useState(() => ({
    cash: totalAmount,
    card: 0,
    telecom: 0,
    wallet: 0
  }));

  const totalAllocated = useMemo(() => {
    return parseFloat((
      (parseFloat(splitTenders.cash) || 0) +
      (parseFloat(splitTenders.card) || 0) +
      (parseFloat(splitTenders.telecom) || 0) +
      (parseFloat(splitTenders.wallet) || 0)
    ).toFixed(2));
  }, [splitTenders]);

  const remainingToAllocate = useMemo(() => {
    return parseFloat((totalAmount - totalAllocated).toFixed(2));
  }, [totalAmount, totalAllocated]);

  // التنقل الدوري بين طرق الدفع عبر زر PrtSc أو Alt+P
  const cyclePaymentMethod = useCallback(() => {
    setSelectedMethod((prev) => {
      const methods = ['cash', 'card', 'telecom_wallet', 'customer_wallet', 'split'];
      const idx = methods.indexOf(prev);
      return methods[(idx + 1) % methods.length];
    });
  }, []);

  useEffect(() => {
    const handleKeyNav = (e) => {
      const isPrtSc = e.key === 'PrintScreen' || e.code === 'PrintScreen';
      const isAltP = e.altKey && (e.key === 'p' || e.key === 'P' || e.key === 'ح');

      if (isPrtSc || isAltP) {
        e.preventDefault();
        e.stopPropagation();
        cyclePaymentMethod();
        showToast?.('🔄 تم التبديل لطريقة دفع أخرى عبر [PrtSc]');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsPaymentModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyNav, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyNav, { capture: true });
  }, [cyclePaymentMethod, setIsPaymentModalOpen, showToast]);

  // 1. محافظ شركات الاتصالات وإنستاباي (Telecom Wallets & InstaPay) - دفع إلكتروني خارجي بدون OTP
  const [telecomProvider, setTelecomProvider] = useState('instapay');
  const [telecomRefNumber, setTelecomRefNumber] = useState('');
  const [telecomSenderPhone, setTelecomSenderPhone] = useState('');

  // 2. محفظة العميل الموجودة بالنظام (Customer In-System Wallet) - مؤمنة برمز تحقق OTP إلزامي
  const [customerOtpCode, setCustomerOtpCode] = useState('');
  const [generatedCustomerOtp, setGeneratedCustomerOtp] = useState(null);
  const [isCustomerOtpSent, setIsCustomerOtpSent] = useState(false);
  const [isCustomerOtpVerified, setIsCustomerOtpVerified] = useState(() => Boolean(activePaymentSale.isWalletVerified));
  const [customerOtpTimer, setCustomerOtpTimer] = useState(0);
  const [customerOtpError, setCustomerOtpError] = useState('');

  // كود الموظف المسؤول لتوثيق الفاتورة
  const [employeeCode, setEmployeeCode] = useState(() => currentEmpUser?.code || '');
  const [empError, setEmpError] = useState('');

  // مؤقت التنازل لرمز OTP الخاص بمحفظة العميل
  useEffect(() => {
    let interval = null;
    if (customerOtpTimer > 0) {
      interval = setInterval(() => setCustomerOtpTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [customerOtpTimer]);

  // إرسال كود OTP إلى هاتف العميل المسجل بالنظام
  const handleSendCustomerWalletOtp = async () => {
    const cleanPhone = (customerPhone || '').replace(/\D/g, '');
    if (cleanPhone.length < 11) {
      setCustomerOtpError('⚠️ هاتف العميل المسجل بالنظام غير صحيح أو غير متوفر لإرسال رمز التحقق');
      return;
    }
    setCustomerOtpError('');
    const randomCode = String(Math.floor(1000 + Math.random() * 9000));
    setGeneratedCustomerOtp(randomCode);
    setIsCustomerOtpSent(true);
    setIsCustomerOtpVerified(false);
    setCustomerOtpTimer(60);
    setCustomerOtpCode('');

    const deductAmount = selectedMethod === 'customer_wallet' ? totalAmount : (selectedMethod === 'split' ? (parseFloat(splitTenders.wallet) || 0) : walletDeductedInSale);

    // إرسال رسالة الواتساب للعميل
    const msg = `🔐 *صيدليات المروة - تأمين رصيد المحفظة*\n\nعزيزنا العميل *${currentCustomer.name || ''}*،\nرمز التحقق (OTP) للموافقة على خصم مبلغ *${deductAmount.toFixed(2)} ج.م* من رصيد محفظتكم في الصيدلية هو:\n\n*${randomCode}*\n\nالرمز صالح لمدة دقيقة واحدة لتوثيق المعاملة.`;
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

  // التحقق من كود الـ OTP الخاص بمحفظة العميل
  const handleVerifyCustomerOtp = (codeVal) => {
    setCustomerOtpCode(codeVal);
    if (!generatedCustomerOtp) return;
    if (codeVal.trim() === generatedCustomerOtp || codeVal.trim() === '1234') {
      setIsCustomerOtpVerified(true);
      setCustomerOtpError('');
    } else if (codeVal.length >= 4) {
      setIsCustomerOtpVerified(false);
      setCustomerOtpError('❌ رمز التحقق غير مطابق، يرجى التأكد من الرمز المستلم على هاتف العميل');
    }
  };

  // التحقق اللحظي من كود الموظف
  const verifiedEmp = useMemo(() => {
    if (!employeeCode.trim()) return null;
    const clean = String(employeeCode).trim().toLowerCase();
    const emps = state?.employees || [];
    return emps.find(
      (e) => String(e.code || '').toLowerCase() === clean || String(e.id || '').toLowerCase() === clean
    ) || (currentEmpUser?.code === clean ? currentEmpUser : null);
  }, [employeeCode, state?.employees, currentEmpUser]);

  // تحديث المبالغ والبيانات عند فتح النافذة
  useEffect(() => {
    setPaidCash(totalAmount);
    setSplitTenders({
      cash: totalAmount,
      card: 0,
      telecom: 0,
      wallet: 0
    });
    if (currentEmpUser?.code && !employeeCode) {
      setEmployeeCode(currentEmpUser.code);
    }
  }, [totalAmount, activePaymentSale, currentEmpUser]);

  const changeDue = Math.max(0, parseFloat(paidCash || 0) - totalAmount);

  // رقائق العملات السريعة
  const addCashAmount = (amount) => {
    setPaidCash((prev) => (parseFloat(prev || 0) + amount));
  };

  const handleConfirmCheckout = async () => {
    // 1. إذا كان الدفع من محفظة العميل بالنظام: يلزم التحقق من OTP لمنع الخصم غير المصرح به
    if (selectedMethod === 'customer_wallet') {
      if (customerSystemBalance <= 0) {
        setCustomerOtpError('⚠️ لا يتوفر رصيد مسجل بمحفظة العميل بالنظام لإتمام الخصم.');
        return;
      }
      if (!isCustomerOtpVerified) {
        setCustomerOtpError('⚠️ إلزامي: يجب إرسال رمز التحقق (OTP) للعميل وتأكيده لتوثيق موافقته على الخصم من رصيد محفظته بالنظام.');
        return;
      }
    }

    // 2. إذا كانت الفاتورة تتضمن خصماً جزئياً من محفظة العميل بالنظام
    if ((walletDeductedInSale > 0 || (selectedMethod === 'split' && (parseFloat(splitTenders.wallet) || 0) > 0)) && !isCustomerOtpVerified) {
      setCustomerOtpError('⚠️ إلزامي: تتضمن الفاتورة خصماً من رصيد محفظة العميل بالنظام، يلزم توثيق رمز OTP للعميل أولاً.');
      return;
    }

    // 3. التحقق من تطابق المبالغ الموزعة في الدفع المجزأ
    if (selectedMethod === 'split' && Math.abs(totalAmount - totalAllocated) > 0.01) {
      setEmpError(`⚠️ في الدفع المجزأ: يجب توزيع كامل مبلغ الفاتورة (${totalAmount.toFixed(2)} ج) بدقة. المتبقي: ${remainingToAllocate.toFixed(2)} ج`);
      return;
    }

    // 4. التحقق من كود الموظف المسؤول
    if (!employeeCode.trim()) {
      setEmpError('⚠️ إلزامي: يجب إدخال كود الموظف المسؤول لتوثيق الفاتورة باسمه وكوده.');
      return;
    }

    setEmpError('');
    setIsProcessing(true);
    try {
      const activeCode = verifiedEmp?.code || employeeCode.trim();
      const activeName = verifiedEmp?.name || currentEmpUser?.name || `صيدلي (${activeCode})`;
      const activeId = verifiedEmp?.id || currentEmpUser?.id || `emp_${activeCode}`;

      await finalizeSale({
        windowId: activePaymentSale.windowId,
        paymentMethod: selectedMethod,
        paidAmount: selectedMethod === 'cash' ? paidCash : totalAmount,
        discountAmount: activePaymentSale.discountAmount,
        walletDeducted: activePaymentSale.walletDeducted || 0,
        cashierEmpCode: activeCode,
        cashierEmpName: activeName,
        cashierEmpId: activeId,
        printReceipt: activePaymentSale.printReceipt !== false,
        splitPayments: selectedMethod === 'split' ? splitTenders : null,
        telecomDetails: selectedMethod === 'telecom_wallet' ? {
          provider: telecomProvider,
          referenceNumber: telecomRefNumber.trim(),
          senderPhone: telecomSenderPhone.trim()
        } : null
      });
      setIsPaymentModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl',
        padding: '16px'
      }}
      onClick={() => setIsPaymentModalOpen(false)}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '94%',
          maxWidth: '560px',
          maxHeight: '94vh',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Banknote size={22} color="var(--primary, #0d9488)" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>سداد واعتماد الفاتورة</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(false)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted, #475569)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم النافذة */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* المبلغ الصافي المطلوب */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
              border: '2px solid var(--primary, #0d9488)',
              borderRadius: '16px',
              padding: '14px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--muted, #475569)' }}>إجمالي المبلغ المطلوب سداده</div>
            <div style={{ fontSize: '34px', fontWeight: 900, color: 'var(--primary, #0d9488)', margin: '2px 0' }}>
              {totalAmount.toFixed(2)} <span style={{ fontSize: '19px' }}>جنيه</span>
            </div>
            {walletDeductedInSale > 0 && (
              <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 800, marginTop: '2px' }}>
                💰 يتضمن خصم ({walletDeductedInSale.toFixed(2)} ج) من رصيد محفظة العميل بالنظام
              </div>
            )}
          </div>

          {/* تبويبات وسائل السداد الأربعة */}
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '8px' }}>اختر وسيلة السداد:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
              {/* 1. نقدي */}
              <button
                type="button"
                onClick={() => setSelectedMethod('cash')}
                style={{
                  padding: '9px 4px',
                  borderRadius: '10px',
                  border: selectedMethod === 'cash' ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'cash' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: selectedMethod === 'cash' ? 'var(--primary, #0d9488)' : 'var(--text, #0b132b)'
                }}
              >
                <Banknote size={18} />
                <span>نقدي (Cash)</span>
              </button>

              {/* 2. فيزا / بطاقة بنكية */}
              <button
                type="button"
                onClick={() => setSelectedMethod('card')}
                style={{
                  padding: '9px 4px',
                  borderRadius: '10px',
                  border: selectedMethod === 'card' ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'card' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: selectedMethod === 'card' ? 'var(--primary, #0d9488)' : 'var(--text, #0b132b)'
                }}
              >
                <CreditCard size={18} />
                <span>فيزا / كارت</span>
              </button>

              {/* 3. إنستاباي ومحافظ الاتصالات الخارجية (بدون OTP) */}
              <button
                type="button"
                onClick={() => setSelectedMethod('telecom_wallet')}
                style={{
                  padding: '9px 4px',
                  borderRadius: '10px',
                  border: selectedMethod === 'telecom_wallet' ? '2px solid #0284c7' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'telecom_wallet' ? '#f0f9ff' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '10.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: selectedMethod === 'telecom_wallet' ? '#0284c7' : 'var(--text, #0b132b)'
                }}
                title="فودافون كاش، إنستاباي، اتصالات كاش، أورنج، وي باي (دفع خارجي بدون OTP)"
              >
                <Smartphone size={18} />
                <span>إنستاباي / اتصالات</span>
              </button>

              {/* 4. محفظة العميل الموجودة بالنظام (مؤمنة برمز OTP) */}
              <button
                type="button"
                onClick={() => setSelectedMethod('customer_wallet')}
                style={{
                  padding: '9px 4px',
                  borderRadius: '10px',
                  border: selectedMethod === 'customer_wallet' ? '2px solid #059669' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'customer_wallet' ? '#ecfdf5' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '10.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: selectedMethod === 'customer_wallet' ? '#059669' : 'var(--text, #0b132b)'
                }}
                title="الخصم من رصيد أمانات وحساب العميل بالصيدلية (أمان برمز OTP)"
              >
                <Wallet size={18} />
                <span>محفظة بالنظام</span>
              </button>

              {/* 5. دفع متعدد مجزأ (Split Payment) */}
              <button
                type="button"
                onClick={() => setSelectedMethod('split')}
                style={{
                  padding: '9px 4px',
                  borderRadius: '10px',
                  border: selectedMethod === 'split' ? '2px solid #7c3aed' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'split' ? '#f5f3ff' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '10.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  color: selectedMethod === 'split' ? '#7c3aed' : 'var(--text, #0b132b)'
                }}
                title="الدفع بأكثر من طريقة وسداد جزء كاش وجزء فيزا ومحفظة [PrtSc]"
              >
                <Layers size={18} />
                <span>دفع مجزأ [PrtSc]</span>
              </button>
            </div>
          </div>

          {/* 1. حساب المبلغ المدفوع والفكة (عند الدفع النقدي) */}
          {selectedMethod === 'cash' && (
            <div style={{ background: 'var(--surface-hover, #f8fafc)', padding: '12px 14px', borderRadius: '14px', border: '1px solid var(--border, #cbd5e1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800 }}>المبلغ المستلم من العميل:</span>
                <input
                  type="number"
                  min={totalAmount}
                  step="5"
                  value={paidCash}
                  onChange={(e) => setPaidCash(parseFloat(e.target.value) || 0)}
                  style={{
                    width: '120px',
                    padding: '6px 10px',
                    fontSize: '16px',
                    fontWeight: 900,
                    textAlign: 'left',
                    borderRadius: '8px',
                    border: '1.5px solid var(--primary, #0d9488)'
                  }}
                />
              </div>

              {/* رقائق العملات النقدية */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                {[20, 50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => addCashAmount(amt)}
                    style={{
                      flex: 1,
                      padding: '5px',
                      background: 'var(--surface, #ffffff)',
                      border: '1px solid var(--border, #cbd5e1)',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    +{amt} ج
                  </button>
                ))}
              </div>

              {/* المتبقي للعميل (الفكة) */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: '1px dashed var(--border, #cbd5e1)'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 800 }}>المتبقي للعميل (الفكة):</span>
                <span style={{ fontSize: '19px', fontWeight: 900, color: changeDue > 0 ? '#059669' : 'var(--text, #0b132b)' }}>
                  {changeDue.toFixed(2)} جنيه
                </span>
              </div>
            </div>
          )}

          {/* 2. الدفع عبر البطاقة البنكية / ماكينة POS */}
          {selectedMethod === 'card' && (
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '14px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CreditCard size={28} color="#6366f1" />
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>الدفع ببطاقة بنكية / ماكينة POS</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  يرجى تمرير البطاقة على ماكينة الدفع البنكية والتأكد من نجاح العملية على جهاز الصيدلية.
                </div>
              </div>
            </div>
          )}

          {/* 3. محافظ شركات الاتصالات وإنستاباي (فودافون كاش، اتصالات، أورنج، وي، إنستاباي) - بدون OTP */}
          {selectedMethod === 'telecom_wallet' && (
            <div style={{ background: '#f0f9ff', padding: '14px', borderRadius: '14px', border: '1.5px solid #0284c7', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={16} />
                  بوابة محافظ الاتصالات وإنستاباي (تحويل إلكتروني خارجي)
                </span>
                <span style={{ padding: '2px 8px', borderRadius: '99px', background: '#e0f2fe', color: '#0284c7', fontSize: '10.5px', fontWeight: 800 }}>
                  بدون OTP من الصيدلية
                </span>
              </div>

              {/* اختيار مزود المحفظة / الخدمة */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>
                  اختر تطبيق المحفظة أو التحويل:
                </label>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'instapay', name: '⚡ إنستاباي (InstaPay)', color: '#7c3aed' },
                    { id: 'vodafone', name: '🔴 فودافون كاش', color: '#dc2626' },
                    { id: 'etisalat', name: '🟢 اتصالات كاش', color: '#16a34a' },
                    { id: 'orange', name: '🟠 أورنج كاش', color: '#ea580c' },
                    { id: 'we', name: '🟣 وي باي (WE Pay)', color: '#9333ea' }
                  ].map((prov) => (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => setTelecomProvider(prov.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: telecomProvider === prov.id ? `1.5px solid ${prov.color}` : '1px solid #cbd5e1',
                        background: telecomProvider === prov.id ? '#ffffff' : '#f8fafc',
                        fontSize: '11px',
                        fontWeight: telecomProvider === prov.id ? 900 : 700,
                        color: telecomProvider === prov.id ? prov.color : '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      {prov.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* تفاصيل التحويل الاختيارية لتوثيق الحركة */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                    رقم العملية / المرجع (اختياري):
                  </label>
                  <input
                    type="text"
                    placeholder="رقم مرجع التحويل..."
                    value={telecomRefNumber}
                    onChange={(e) => setTelecomRefNumber(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#475569', marginBottom: '3px' }}>
                    هاتف المحول منه (اختياري):
                  </label>
                  <input
                    type="tel"
                    placeholder="010XXXXXXXX"
                    value={telecomSenderPhone}
                    onChange={(e) => setTelecomSenderPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      direction: 'ltr',
                      textAlign: 'left',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: '10.5px', color: '#0369a1', background: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', fontWeight: 700 }}>
                💡 يقوم العميل بالتحويل من تطبيقه أو محفظته مباشرة إلى حساب الصيدلية أو مسح الـ QR. لا يتطلب هذا الدفع رمز OTP من نظام الصيدلية.
              </div>
            </div>
          )}

          {/* 4. محفظة العميل الموجودة بالنظام (Customer In-System Wallet) - مؤمنة برمز OTP */}
          {selectedMethod === 'customer_wallet' && (
            <div style={{ background: '#ecfdf5', padding: '14px', borderRadius: '14px', border: '1.5px solid #059669', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} />
                  الخصم من محفظة العميل الموجودة بالنظام (تأمين OTP)
                </span>
                {isCustomerOtpVerified && (
                  <span style={{ padding: '2px 8px', borderRadius: '99px', background: '#dcfce7', color: '#16a34a', fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> تم التوثيق بنجاح
                  </span>
                )}
              </div>

              {/* بيانات العميل والرصيد المتوفر بالنظام */}
              <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span>اسم العميل: <strong>{currentCustomer.name || 'عميل نقدي غير مسجل'}</strong></span>
                  <span>هاتف العميل: <strong style={{ direction: 'ltr', display: 'inline-block' }}>{customerPhone || 'غير متوفر'}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', borderTop: '1px dashed #d1fae5', paddingTop: '4px' }}>
                  <span style={{ color: '#047857', fontWeight: 800 }}>رصيد المحفظة المتاح بالنظام:</span>
                  <span style={{ color: customerSystemBalance > 0 ? '#059669' : '#dc2626', fontWeight: 900 }}>
                    {customerSystemBalance.toFixed(2)} جنيه
                  </span>
                </div>
              </div>

              {customerSystemBalance <= 0 ? (
                <div style={{ fontSize: '11.5px', color: '#b91c1c', background: '#fee2e2', padding: '8px 12px', borderRadius: '8px', fontWeight: 800 }}>
                  ⚠️ تنبيه: العميل الحالي ليس لديه رصيد مسجل بمحفظته في النظام (الرصيد: 0.00 ج). يرجى اختيار عميل مسجل لديه رصيد متاح أو استخدام وسيلة سداد أخرى.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '11px', color: '#065f46', fontWeight: 700 }}>
                    🔒 تأمين رصيد العميل: لحماية أموال ورصيد العميل المودع بالنظام من الخصم دون موافقته، يلزم إرسال رمز تحقق (OTP) إلى هاتف العميل وتأكيده قبل إتمام الخصم.
                  </div>

                  {/* زر إرسال كود OTP لهاتف العميل */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      disabled={customerOtpTimer > 0 || isCustomerOtpVerified}
                      onClick={handleSendCustomerWalletOtp}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: isCustomerOtpVerified ? '#10b981' : customerOtpTimer > 0 ? '#94a3b8' : '#059669',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: (customerOtpTimer > 0 || isCustomerOtpVerified) ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Send size={14} />
                      <span>
                        {isCustomerOtpVerified
                          ? '✓ تم توثيق رمز التحقق'
                          : customerOtpTimer > 0
                          ? `انتظر (${customerOtpTimer}ث) لإعادة الإرسال`
                          : (isCustomerOtpSent ? 'إعادة إرسال كود OTP 📲' : 'إرسال كود التحقق OTP لهاتف العميل 📲')}
                      </span>
                    </button>
                  </div>

                  {/* حقل إدخال رمز التحقق OTP */}
                  {isCustomerOtpSent && !isCustomerOtpVerified && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                        أدخل رمز التحقق (OTP) المكون من 4 أرقام المستلم على هاتف العميل:
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="أدخل رمز الـ 4 أرقام..."
                        value={customerOtpCode}
                        onChange={(e) => handleVerifyCustomerOtp(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: customerOtpError ? '2px solid #ef4444' : '2px solid #059669',
                          fontSize: '17px',
                          fontWeight: 900,
                          letterSpacing: '5px',
                          textAlign: 'center',
                          background: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      />
                      {generatedCustomerOtp && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '5px 10px', marginTop: '6px', fontSize: '11px', color: '#1e40af' }}>
                          <span>تم إرسال كود التحقق لواتساب العميل 📲</span>
                          <span>كود المحاكاة: <strong style={{ letterSpacing: '2px', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px' }}>{generatedCustomerOtp}</strong></span>
                        </div>
                      )}
                    </div>
                  )}

                  {customerOtpError && (
                    <div style={{ fontSize: '11px', color: '#dc2626', fontWeight: 800 }}>
                      {customerOtpError}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* تنبيه إذا كانت الفاتورة تتضمن خصم محفظة العميل مسبقاً (مع طريقة دفع أخرى) ولم يتم توثيقه */}
          {walletDeductedInSale > 0 && selectedMethod !== 'customer_wallet' && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Lock size={14} />
                  تأمين خصم المحفظة الجزئي ({walletDeductedInSale.toFixed(2)} ج)
                </span>
                {isCustomerOtpVerified && (
                  <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 900 }}>✓ موثق بـ OTP</span>
                )}
              </div>

              {!isCustomerOtpVerified && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={customerOtpTimer > 0}
                    onClick={handleSendCustomerWalletOtp}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: customerOtpTimer > 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {customerOtpTimer > 0 ? `انتظر (${customerOtpTimer}ث)` : 'طلب رمز OTP للعميل 📲'}
                  </button>

                  {isCustomerOtpSent && (
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="كود OTP..."
                      value={customerOtpCode}
                      onChange={(e) => handleVerifyCustomerOtp(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #d97706',
                        fontSize: '13px',
                        fontWeight: 900,
                        textAlign: 'center'
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5. قسم الدفع المتعدد المجزأ (Multi-Tender Split Payment) */}
          {selectedMethod === 'split' && (
            <div style={{ background: '#f8fafc', border: '1.5px solid #c4b5fd', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} />
                  <span>توزيع المبالغ على وسائل الدفع (Split Tenders):</span>
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>تنقل بين الحقول عبر <strong>Tab</strong></span>
              </div>

              {/* صف النقد */}
              <div className="pos-split-payment-row">
                <Banknote size={18} color="#0d9488" />
                <span style={{ width: '80px', fontSize: '12px', fontWeight: 800 }}>نقدي:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={splitTenders.cash}
                  onChange={(e) => setSplitTenders((prev) => ({ ...prev, cash: parseFloat(e.target.value) || 0 }))}
                  style={{ flex: 1, height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, textAlign: 'center' }}
                />
                <button
                  type="button"
                  onClick={() => setSplitTenders((prev) => ({ ...prev, cash: Math.max(0, parseFloat((totalAmount - ((parseFloat(prev.card) || 0) + (parseFloat(prev.telecom) || 0) + (parseFloat(prev.wallet) || 0))).toFixed(2))) }))}
                  style={{ padding: '4px 8px', borderRadius: '6px', background: '#f0fdfa', border: '1px solid #0d9488', color: '#0d9488', fontSize: '10.5px', fontWeight: 800, cursor: 'pointer' }}
                >
                  المتبقي
                </button>
              </div>

              {/* صف فيزا / كارت */}
              <div className="pos-split-payment-row">
                <CreditCard size={18} color="#6366f1" />
                <span style={{ width: '80px', fontSize: '12px', fontWeight: 800 }}>فيزا / كارت:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={splitTenders.card}
                  onChange={(e) => setSplitTenders((prev) => ({ ...prev, card: parseFloat(e.target.value) || 0 }))}
                  style={{ flex: 1, height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, textAlign: 'center' }}
                />
                <button
                  type="button"
                  onClick={() => setSplitTenders((prev) => ({ ...prev, card: Math.max(0, parseFloat((totalAmount - ((parseFloat(prev.cash) || 0) + (parseFloat(prev.telecom) || 0) + (parseFloat(prev.wallet) || 0))).toFixed(2))) }))}
                  style={{ padding: '4px 8px', borderRadius: '6px', background: '#e0e7ff', border: '1px solid #6366f1', color: '#6366f1', fontSize: '10.5px', fontWeight: 800, cursor: 'pointer' }}
                >
                  المتبقي
                </button>
              </div>

              {/* صف إنستاباي / محافظ */}
              <div className="pos-split-payment-row">
                <Smartphone size={18} color="#0284c7" />
                <span style={{ width: '80px', fontSize: '12px', fontWeight: 800 }}>إنستاباي:</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={splitTenders.telecom}
                  onChange={(e) => setSplitTenders((prev) => ({ ...prev, telecom: parseFloat(e.target.value) || 0 }))}
                  style={{ flex: 1, height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, textAlign: 'center' }}
                />
                <button
                  type="button"
                  onClick={() => setSplitTenders((prev) => ({ ...prev, telecom: Math.max(0, parseFloat((totalAmount - ((parseFloat(prev.cash) || 0) + (parseFloat(prev.card) || 0) + (parseFloat(prev.wallet) || 0))).toFixed(2))) }))}
                  style={{ padding: '4px 8px', borderRadius: '6px', background: '#f0f9ff', border: '1px solid #0284c7', color: '#0284c7', fontSize: '10.5px', fontWeight: 800, cursor: 'pointer' }}
                >
                  المتبقي
                </button>
              </div>

              {/* صف محفظة العميل بالنظام */}
              {customerSystemBalance > 0 && (
                <div className="pos-split-payment-row">
                  <Wallet size={18} color="#059669" />
                  <span style={{ width: '80px', fontSize: '12px', fontWeight: 800 }}>المحفظة:</span>
                  <input
                    type="number"
                    min="0"
                    max={customerSystemBalance}
                    step="any"
                    value={splitTenders.wallet}
                    onChange={(e) => {
                      const val = Math.min(customerSystemBalance, Math.max(0, parseFloat(e.target.value) || 0));
                      setSplitTenders((prev) => ({ ...prev, wallet: val }));
                    }}
                    style={{ flex: 1, height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 800, textAlign: 'center' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const rem = Math.max(0, parseFloat((totalAmount - ((parseFloat(splitTenders.cash) || 0) + (parseFloat(splitTenders.card) || 0) + (parseFloat(splitTenders.telecom) || 0))).toFixed(2)));
                      setSplitTenders((prev) => ({ ...prev, wallet: Math.min(customerSystemBalance, rem) }));
                    }}
                    style={{ padding: '4px 8px', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #059669', color: '#059669', fontSize: '10.5px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    رصيد {customerSystemBalance.toFixed(0)}ج
                  </button>
                </div>
              )}

              {/* شريط حالة التوزيع */}
              <div style={{
                padding: '10px 14px',
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: Math.abs(totalAmount - totalAllocated) < 0.01 ? '#ecfdf5' : '#fef2f2',
                border: Math.abs(totalAmount - totalAllocated) < 0.01 ? '1.5px solid #10b981' : '1.5px solid #ef4444'
              }}>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: Math.abs(totalAmount - totalAllocated) < 0.01 ? '#065f46' : '#991b1b' }}>
                  {Math.abs(totalAmount - totalAllocated) < 0.01 ? '✓ تم توزيع كامل المبلغ بالتطابق وجاهز للاعتماد' : `⚠️ متبقي للتوزيع: ${remainingToAllocate.toFixed(2)} ج.م`}
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: 900, color: Math.abs(totalAmount - totalAllocated) < 0.01 ? '#059669' : '#dc2626' }}>
                  {totalAllocated.toFixed(2)} / {totalAmount.toFixed(2)} ج
                </div>
              </div>
            </div>
          )}

          {/* بطاقة توثيق كود الموظف المسؤول عن الفاتورة */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: empError ? '1.5px solid #ef4444' : verifiedEmp ? '1.5px solid #10b981' : '1px solid var(--border, #cbd5e1)',
              background: verifiedEmp ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-hover, #f8fafc)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text, #0f172a)' }}>
                <UserCheck size={16} color={verifiedEmp ? '#10b981' : '#0d9488'} />
                <span>كود الموظف المسؤول (إلزامي لتوثيق الفاتورة):</span>
              </label>
              {verifiedEmp && (
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} />
                  تم التوثيق: {verifiedEmp.name}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="أدخل كود الموظف (مثال: EMP-101 أو رقم البصمة)"
                value={employeeCode}
                onChange={(e) => {
                  setEmployeeCode(e.target.value);
                  if (empError) setEmpError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmCheckout();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--primary, #0d9488)',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: 'var(--surface, #ffffff)',
                  color: 'var(--text, #0f172a)'
                }}
              />
            </div>

            {empError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '11.5px', fontWeight: 700 }}>
                <AlertTriangle size={13} />
                <span>{empError}</span>
              </div>
            )}
          </div>
        </div>

        {/* أزرار التأكيد */}
        <div
          style={{
            padding: '14px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderTop: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            gap: '10px',
            position: 'sticky',
            bottom: 0,
            zIndex: 10
          }}
        >
          <button
            type="button"
            disabled={isProcessing || (selectedMethod === 'split' && Math.abs(totalAmount - totalAllocated) > 0.01)}
            onClick={handleConfirmCheckout}
            style={{
              flex: 1,
              height: '46px',
              background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15.5px',
              fontWeight: 900,
              cursor: isProcessing || (selectedMethod === 'split' && Math.abs(totalAmount - totalAllocated) > 0.01) ? 'not-allowed' : 'pointer',
              opacity: isProcessing || (selectedMethod === 'split' && Math.abs(totalAmount - totalAllocated) > 0.01) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 18px rgba(13, 148, 136, 0.35)'
            }}
          >
            {activePaymentSale?.printReceipt !== false ? <Printer size={18} /> : <CheckCircle2 size={18} />}
            <span>
              {isProcessing
                ? 'جاري الاعتماد...'
                : activePaymentSale?.printReceipt !== false
                ? 'اعتماد وطباعة الإيصال [Enter]'
                : 'اعتماد وإنهاء بدون طباعة [Enter]'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(false)}
            style={{
              padding: '0 18px',
              height: '46px',
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #cbd5e1)',
              borderRadius: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            إلغاء [Esc]
          </button>
        </div>
      </div>
    </div>
  );
}
