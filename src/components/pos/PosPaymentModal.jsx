import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  X,
  Printer,
  FileText,
  UserCheck,
  AlertTriangle
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

  if (!isPaymentModalOpen || !activePaymentSale) return null;

  const totalAmount = parseFloat(activePaymentSale.totalAmount || 0);
  const [selectedMethod, setSelectedMethod] = useState(activePaymentSale.paymentMethod || 'cash');
  const [paidCash, setPaidCash] = useState(totalAmount);
  const [isProcessing, setIsProcessing] = useState(false);

  // كود الموظف المسؤول لتوثيق الحركة باسمه وكوده
  const [employeeCode, setEmployeeCode] = useState(() => currentEmpUser?.code || '');
  const [empError, setEmpError] = useState('');

  // التحقق اللحظي من كود الموظف
  const verifiedEmp = useMemo(() => {
    if (!employeeCode.trim()) return null;
    const clean = String(employeeCode).trim().toLowerCase();
    const emps = state?.employees || [];
    return emps.find(
      (e) => String(e.code || '').toLowerCase() === clean || String(e.id || '').toLowerCase() === clean
    ) || (currentEmpUser?.code === clean ? currentEmpUser : null);
  }, [employeeCode, state?.employees, currentEmpUser]);

  // تحديث المبلغ المدفوع تلقائياً عند فتح النافذة
  useEffect(() => {
    setPaidCash(totalAmount);
    if (currentEmpUser?.code && !employeeCode) {
      setEmployeeCode(currentEmpUser.code);
    }
  }, [totalAmount, currentEmpUser]);

  const changeDue = Math.max(0, parseFloat(paidCash || 0) - totalAmount);

  // رقائق النقود السريعة (Quick Banknote Chips)
  const addCashAmount = (amount) => {
    setPaidCash((prev) => (parseFloat(prev || 0) + amount));
  };

  const handleConfirmCheckout = async () => {
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
        paidAmount: paidCash,
        discountAmount: activePaymentSale.discountAmount,
        cashierEmpCode: activeCode,
        cashierEmpName: activeName,
        cashierEmpId: activeId
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
        background: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #ffffff)',
          border: '1.5px solid var(--border, #cbd5e1)',
          borderRadius: '20px',
          width: '92%',
          maxWidth: '540px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
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
            justifyContent: 'space-between'
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* المبلغ الصافي المطلوب */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
              border: '2px solid var(--primary, #0d9488)',
              borderRadius: '16px',
              padding: '16px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted, #475569)' }}>إجمالي المبلغ المطلوب</div>
            <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--primary, #0d9488)', margin: '4px 0' }}>
              {totalAmount.toFixed(2)} <span style={{ fontSize: '20px' }}>جنيه</span>
            </div>
          </div>

          {/* طرق الدفع المتعددة */}
          <div>
            <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '8px' }}>اختر وسيلة السداد:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSelectedMethod('cash')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: selectedMethod === 'cash' ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'cash' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: selectedMethod === 'cash' ? 'var(--primary, #0d9488)' : 'var(--text, #0b132b)'
                }}
              >
                <Banknote size={16} />
                <span>نقدي (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('card')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: selectedMethod === 'card' ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'card' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: selectedMethod === 'card' ? 'var(--primary, #0d9488)' : 'var(--text, #0b132b)'
                }}
              >
                <CreditCard size={16} />
                <span>فيزا / ماستركارد</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('wallet')}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: selectedMethod === 'wallet' ? '2px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                  background: selectedMethod === 'wallet' ? 'var(--primary-light, #f0fdfa)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: selectedMethod === 'wallet' ? 'var(--primary, #0d9488)' : 'var(--text, #0b132b)'
                }}
              >
                <Smartphone size={16} />
                <span>إنستاباي / محفظة</span>
              </button>
            </div>
          </div>

          {/* حساب المبلغ المدفوع والفكة (عند الدفع النقدي) */}
          {selectedMethod === 'cash' && (
            <div style={{ background: 'var(--surface-hover, #f8fafc)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border, #cbd5e1)' }}>
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

              {/* رقائق العملات السريعة في مصر */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
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
                <span style={{ fontSize: '20px', fontWeight: 900, color: changeDue > 0 ? '#059669' : 'var(--text, #0b132b)' }}>
                  {changeDue.toFixed(2)} جنيه
                </span>
              </div>
            </div>
          )}

          {/* بطاقة توثيق كود الموظف المسؤول عن الفاتورة */}
          <div
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: empError ? '1.5px solid #ef4444' : verifiedEmp ? '1.5px solid #10b981' : '1px solid var(--border, #cbd5e1)',
              background: verifiedEmp ? 'rgba(16, 185, 129, 0.05)' : 'var(--surface-hover, #f8fafc)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text, #0f172a)' }}>
                <UserCheck size={16} color={verifiedEmp ? '#10b981' : '#0d9488'} />
                <span>كود الموظف المسؤول (إلزامي لتوثيق الفاتورة):</span>
              </label>
              {verifiedEmp && (
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} />
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
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--primary, #0d9488)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  background: 'var(--surface, #ffffff)',
                  color: 'var(--text, #0f172a)'
                }}
              />
            </div>

            {empError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '12px', fontWeight: 700 }}>
                <AlertTriangle size={14} />
                <span>{empError}</span>
              </div>
            )}

            <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>
              * يتم حفظ كود واسم الموظف رسمياً في تفاصيل الفاتورة وقاعدة البيانات لربط المبيعات ومؤشرات الأداء (KPIs).
            </div>
          </div>
        </div>

        {/* أزرار التأكيد */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--surface-hover, #f8fafc)',
            borderTop: '1px solid var(--border, #cbd5e1)',
            display: 'flex',
            gap: '10px'
          }}
        >
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleConfirmCheckout}
            style={{
              flex: 1,
              height: '48px',
              background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 6px 18px rgba(13, 148, 136, 0.35)'
            }}
          >
            <Printer size={18} />
            <span>{isProcessing ? 'جاري الاعتماد والطباعة...' : 'اعتماد وطباعة الإيصال الفوري [Enter]'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(false)}
            style={{
              padding: '0 20px',
              height: '48px',
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
