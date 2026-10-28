import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, UserCheck, Lock, AlertCircle, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { outstockVerifyEmployeeCode } from '../../utils/outstockApiClient';

/**
 * PosEmployeeActionAuthModal.jsx
 * نافذة منبثقة بخلفية شفافة (Acrylic / Frosted Glass) لتوثيق كل حركة في نظام الـ POS
 * بربط مباشر وفوري بأكواد الموظفين في نظام الـ HR المعتمد
 */
export default function PosEmployeeActionAuthModal({
  isOpen,
  actionTitle = 'توثيق العملية بكود الموظف',
  actionSubtitle = 'يرجى إدخال كود الموظف المعتمد لإتمام هذه الحركة في النظام',
  actionType = 'general', // 'sale' | 'return' | 'void' | 'shift' | 'discount' | 'scrap' | 'debt'
  onVerified,
  onClose
}) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);
  const inputRef = useRef(null);

  // إعادة ضبط الحالة عند فتح المودال
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setErrorMsg('');
      setVerifiedEmployee(null);
      setIsVerifying(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [isOpen]);

  // إغلاق المودال بـ Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isVerifying) onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isVerifying, onClose]);

  // التحقق من كود الموظف محلياً وعبر السيرفر
  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = String(code || '').trim();
    if (!cleanCode) {
      setErrorMsg('يرجى إدخال كود الموظف');
      inputRef.current?.focus();
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      // 1. الفحص أولاً في بيانات الـ HR المحفوظة محلياً لسرعة الاستجابة الخارقة
      let foundEmp = null;
      try {
        const rawHrData = localStorage.getItem('pharmacy-tracker-data');
        if (rawHrData) {
          const parsed = JSON.parse(rawHrData);
          if (Array.isArray(parsed?.employees)) {
            foundEmp = parsed.employees.find((emp) => {
              const empCode = String(emp.code || emp.employeeCode || emp.emp_code || '').trim();
              const empId = String(emp.id || '').trim();
              return empCode === cleanCode || empId === cleanCode;
            });
          }
        }
      } catch (err) {
        console.warn('Local HR cache lookup warning:', err);
      }

      // 2. إذا لم يُعثر عليه محلياً، التحقق من السيرفر المركزي
      if (!foundEmp) {
        const res = await outstockVerifyEmployeeCode(cleanCode);
        if (res?.success && res.employee) {
          foundEmp = res.employee;
        } else if (res?.error) {
          setErrorMsg(res.error);
          setIsVerifying(false);
          inputRef.current?.focus();
          return;
        }
      }

      if (foundEmp) {
        const employeeData = {
          code: foundEmp.code || foundEmp.employeeCode || cleanCode,
          id: foundEmp.id || cleanCode,
          name: foundEmp.name || foundEmp.full_name || 'موظف معتمد',
          role: foundEmp.role || foundEmp.job_title || 'صيدلي',
          branchId: foundEmp.branchId || foundEmp.branch_id || 'main'
        };
        setVerifiedEmployee(employeeData);

        // توثيق الحركة وتسليم النتيجة
        setTimeout(() => {
          onVerified?.(employeeData);
          onClose?.();
        }, 350);
      } else {
        setErrorMsg('كود الموظف غير مسجل بنظام الـ HR أو تم إيقافه');
        inputRef.current?.focus();
      }
    } catch (err) {
      console.error('Employee verification error:', err);
      setErrorMsg('تعذر التحقق من كود الموظف. تأكد من صحة الكود والاتصال.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.45)', // خلفية شفافة أكريليك
        backdropFilter: 'blur(12px)', // تأثير زجاجي معتم
        WebkitBackdropFilter: 'blur(12px)',
        direction: 'rtl',
        animation: 'posFadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          width: '420px',
          maxWidth: '92vw',
          background: 'rgba(255, 255, 255, 0.92)',
          border: '1.5px solid rgba(255, 255, 255, 0.8)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.5)',
          borderRadius: '20px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          position: 'relative'
        }}
      >
        {/* زر الإغلاق */}
        <button
          type="button"
          onClick={onClose}
          disabled={isVerifying}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '8px'
          }}
        >
          <X size={18} />
        </button>

        {/* رأس المودال */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: verifiedEmployee
                ? '#ecfdf5'
                : 'linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%)',
              border: `1.5px solid ${verifiedEmployee ? '#a7f3d0' : '#99f6e4'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: verifiedEmployee ? '#059669' : '#0d9488',
              flexShrink: 0
            }}
          >
            {verifiedEmployee ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
              {actionTitle}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>
              {actionSubtitle}
            </div>
          </div>
        </div>

        {/* حقل إدخال الكود */}
        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#334155',
                marginBottom: '6px'
              }}
            >
              كود الموظف بنظام الـ HR:
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="أدخل الكود واضغط Enter..."
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErrorMsg('');
                }}
                disabled={isVerifying || Boolean(verifiedEmployee)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  borderRadius: '12px',
                  border: errorMsg ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#0f172a',
                  boxSizing: 'border-box',
                  outline: 'none',
                  letterSpacing: '2px',
                  textAlign: 'center'
                }}
              />
              <Lock
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
          </div>

          {/* رسالة الخطأ */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '8px 10px',
                color: '#b91c1c',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              <AlertCircle size={15} flexShrink={0} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* بيانات الموظف الموثق */}
          {verifiedEmployee && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'posFadeIn 0.15s ease'
              }}
            >
              <UserCheck size={18} color="#16a34a" />
              <div>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#166534' }}>
                  {verifiedEmployee.name}
                </span>
                <span style={{ fontSize: '11px', color: '#15803d', marginRight: '6px' }}>
                  ({verifiedEmployee.role || 'صيدلي معتمد'})
                </span>
              </div>
            </div>
          )}

          {/* الأزرار */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              type="submit"
              disabled={isVerifying || Boolean(verifiedEmployee)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                background: verifiedEmployee
                  ? '#16a34a'
                  : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                border: 'none',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 900,
                cursor: (isVerifying || Boolean(verifiedEmployee)) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              {isVerifying ? (
                <>
                  <RefreshCw size={15} className="pos-spin" />
                  <span>جارٍ التحقق...</span>
                </>
              ) : verifiedEmployee ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>تم التوثيق بنجاح!</span>
                </>
              ) : (
                <>
                  <UserCheck size={16} />
                  <span>تأكيد الحركة [Enter]</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              style={{
                padding: '12px 18px',
                borderRadius: '10px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 800,
                cursor: isVerifying ? 'not-allowed' : 'pointer'
              }}
            >
              إلغاء [Esc]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

