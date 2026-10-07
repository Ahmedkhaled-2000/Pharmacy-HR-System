import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  UserCheck,
  RefreshCw
} from 'lucide-react';
import { outstockVerifyEmployeeCode } from '../../../utils/outstockApiClient';

/**
 * EmployeeCodeAuthModal.jsx
 * نافذة التحقق المشفرة من كود الموظف
 * تُستخدم عند:
 * 1. تسجيل طلب عميل جديد (لتثبيت اسم وكود الموظف الصيدلي المستلم للطلب)
 * 2. تسليم الطلب للعميل (لتثبيت اسم وكود الموظف المسلم والمحصل على الفاتورة)
 * يتم إدخال الكود مشفراً بنمط كلمة المرور (type="password") مع التحقق اللحظي
 */
export default function EmployeeCodeAuthModal({
  isOpen,
  title = 'التحقق من كود الموظف المسؤول',
  subtitle = 'يرجى إدخال كود الموظف المسجل بنظام الموارد البشرية لمتابعة العملية',
  actionLabel = 'تأكيد الهوية والمتابعة',
  onSuccess,
  onClose
}) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setErrorMsg('');
      setVerifiedEmployee(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (!isVerifying) {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isVerifying, onClose]);

  // منع تمرير خلفية الصفحة
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) {
      setErrorMsg('يرجى إدخال كود الموظف');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const res = await outstockVerifyEmployeeCode(cleanCode);
      if (res?.success && res.employee) {
        setVerifiedEmployee(res.employee);
        setTimeout(() => {
          onSuccess(res.employee);
        }, 500);
      } else {
        setErrorMsg(res?.error || 'كود الموظف غير صحيح أو غير مسجل بالمنظومة');
      }
    } catch (err) {
      setErrorMsg(err.message || 'حدث خطأ في الاتصال بالسيرفر');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overscrollBehavior: 'contain'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '440px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          direction: 'rtl',
          border: '1px solid #e2e8f0',
          animation: 'outstockFadeIn 0.2s ease-out',
          overscrollBehavior: 'contain'
        }}
      >
        {/* رأس النافذة - مظهر فاتح مؤسسي راقي */}
        <div
          style={{
            padding: '18px 20px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            color: '#0f172a',
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
                background: '#e0f2fe',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <KeyRound size={20} color="#0284c7" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{title}</h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                تسجيل حركة مؤكدة بالكود السري للموظف
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* جسم النافذة */}
        <form onSubmit={handleVerify} style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
            {subtitle}
          </p>

          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '10px 14px',
                color: '#b91c1c',
                fontSize: '12.5px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {verifiedEmployee && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <CheckCircle2 size={24} color="#16a34a" />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '900', color: '#166534' }}>
                  {verifiedEmployee.name}
                </div>
                <div style={{ fontSize: '12px', color: '#15803d' }}>
                  الكود: {verifiedEmployee.code} {verifiedEmployee.jobTitle ? `• ${verifiedEmployee.jobTitle}` : ''}
                </div>
              </div>
            </div>
          )}

          {!verifiedEmployee && (
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                كود الموظف السري (Employee Code):
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="password"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="••••••"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    paddingLeft: '40px',
                    borderRadius: '12px',
                    border: '2px solid #cbd5e1',
                    fontSize: '18px',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#0284c7'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                  required
                  autoFocus
                />
                <Lock
                  size={18}
                  color="#94a3b8"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>
          )}

          {/* أزرار الإجراء */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isVerifying || Boolean(verifiedEmployee)}
              style={{
                flex: 1,
                padding: '12px',
                background: verifiedEmployee
                  ? '#16a34a'
                  : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '900',
                cursor: (isVerifying || Boolean(verifiedEmployee)) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}
            >
              {isVerifying ? (
                <>
                  <RefreshCw size={16} className="outstock-spin" />
                  <span>جاري التحقق من المنظومة...</span>
                </>
              ) : verifiedEmployee ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>تم تأكيد الهوية بنجاح</span>
                </>
              ) : (
                <>
                  <UserCheck size={16} />
                  <span>{actionLabel}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              style={{
                padding: '12px 18px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                fontWeight: '800',
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
