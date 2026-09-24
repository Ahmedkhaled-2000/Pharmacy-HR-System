import React, { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function OutstockOwnerGate({
  orgSettings = {},
  onUnlocked,
  onCancel,
  showToast
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // جلب بيانات اعتماد المالك الموثوقة
  let savedOwnerUser = '';
  let savedOwnerPass = '';
  try {
    savedOwnerUser = localStorage.getItem('pharmacy_owner_username') || '';
    savedOwnerPass = localStorage.getItem('pharmacy_owner_password') || '';
  } catch {}

  const validOwnerUser = String(orgSettings.ownerUsername || savedOwnerUser || 'owner').trim().toLowerCase();
  const validOwnerPass = String(orgSettings.ownerPassword || savedOwnerPass || 'owner123').trim();

  const handleVerify = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputUser || !inputPass) {
      setErrorMsg('يرجى إدخال اسم مستخدم وكلمة مرور المالك للمتابعة');
      return;
    }

    setIsSubmitting(true);

    const isUserValid = inputUser === validOwnerUser;
    const isPassValid = inputPass === validOwnerPass;

    if (isUserValid && isPassValid) {
      setIsSubmitting(false);
      try {
        sessionStorage.setItem('app_outstock_owner_unlocked', 'true');
        sessionStorage.setItem('app_owner_authenticated', 'true');
      } catch {}
      if (showToast) {
        showToast('👑 تم التحقق من هوية المالك بنجاح. مرحباً بك في نظام النواقص والمشتريات');
      }
      onUnlocked?.();
    } else {
      setIsSubmitting(false);
      setErrorMsg('❌ بيانات دخول المالك غير صحيحة. لا يمكن فتح نظام النواقص من حساب الأدمن إلا بتصريح المالك الصريح.');
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '75vh',
      padding: '24px 16px',
      fontFamily: "'Cairo', 'Tajawal', sans-serif"
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        background: 'var(--surface, #ffffff)',
        border: '1.5px solid var(--border, #e2e8f0)',
        borderRadius: '20px',
        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.12), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease'
      }}>
        {/* Header Ribbon */}
        <div style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 60%, #14b8a6 100%)',
          padding: '28px 24px',
          textAlign: 'center',
          color: '#ffffff',
          position: 'relative'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.18)',
            border: '2px solid rgba(255, 255, 255, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '30px',
            margin: '0 auto 12px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)'
          }}>
            👑
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 800 }}>
            منظومة نواقص الأدوية والطلبات
          </h2>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 12px',
            borderRadius: '20px',
            background: 'rgba(0, 0, 0, 0.18)',
            fontSize: '12px',
            fontWeight: 700
          }}>
            <Lock size={13} />
            <span>منطقة محمية بتصريح المالك حصراً</span>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 26px 28px' }}>
          <p style={{
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--muted, #64748b)',
            margin: '0 0 20px',
            textAlign: 'center'
          }}>
            أنت مسجل حالياً بحساب <strong>الإدارة (Admin)</strong>. يرجى تأكيد هويتك بإدخال بيانات حساب <strong>المالك (Owner)</strong> لفتح شاشة النواقص والتوريدات.
          </p>

          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              padding: '12px 14px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '12px',
              color: '#b91c1c',
              fontSize: '12.5px',
              marginBottom: '18px',
              lineHeight: 1.5
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                اسم مستخدم المالك:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="أدخل اسم مستخدم المالك..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border, #cbd5e1)',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'var(--background, #f8fafc)',
                  color: 'var(--text)',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text)' }}>
                كلمة مرور المالك:
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="أدخل كلمة مرور المالك..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid var(--border, #cbd5e1)',
                    fontSize: '14px',
                    outline: 'none',
                    background: 'var(--background, #f8fafc)',
                    color: 'var(--text)',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1,
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>فتح المنظومة بتصريح المالك</span>
                <span>👑</span>
              </button>

              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: 'var(--surface-muted, #f1f5f9)',
                    color: 'var(--text)',
                    border: '1px solid var(--border, #cbd5e1)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء والعودة
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
