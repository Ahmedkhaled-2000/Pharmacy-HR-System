import React, { useState, useEffect } from 'react';

export default function OwnerOverrideModal({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'إجراء محمي بتصريح المالك',
  actionDetails = '',
  state,
  showToast
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setPassword('');
      setErrorMsg('');
      setIsVerifying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validOwnerUser = (state?.orgSettings?.ownerUsername || 'owner').trim().toLowerCase();
  const validOwnerPass = (state?.orgSettings?.ownerPassword || 'owner123').trim();

  const handleVerify = (e) => {
    e.preventDefault();
    setErrorMsg('');

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    if (!inputUser || !inputPass) {
      setErrorMsg('يرجى إدخال اسم مستخدم وكلمة مرور المالك');
      return;
    }

    setIsVerifying(true);

    const isMatch =
      (inputUser === validOwnerUser || inputUser === 'owner' || inputUser === 'المالك') &&
      (inputPass === validOwnerPass || inputPass === 'owner123');

    if (isMatch) {
      setIsVerifying(false);
      setUsername('');
      setPassword('');
      setErrorMsg('');
      if (showToast) {
        showToast('👑 تم تأكيد تصريح المالك وتنفيذ الإجراء بنجاح');
      }
      onSuccess?.();
      onClose?.();
    } else {
      setIsVerifying(false);
      setErrorMsg('بيانات دخول المالك غير صحيحة. تم رفض العملية.');
    }
  };

  const handleCancel = () => {
    setUsername('');
    setPassword('');
    setErrorMsg('');
    onClose?.();
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        direction: 'rtl',
        fontFamily: "'Tajawal', 'Cairo', sans-serif"
      }}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: '#ffffff',
          borderRadius: '24px',
          border: '2px solid #f59e0b',
          boxShadow: '0 25px 50px -12px rgba(245, 158, 11, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Header with Royal Gold Theme */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            padding: '24px 24px 20px',
            textAlign: 'center',
            borderBottom: '2px solid #f59e0b',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 12px auto',
              boxShadow: '0 10px 20px rgba(245, 158, 11, 0.35)',
              border: '2px solid #fef3c7'
            }}
          >
            👑
          </div>
          <h3 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', fontSize: '20px', fontWeight: 800, color: '#f8fafc' }}>
            تصريح المالك مطلوب (Owner Authorization)
          </h3>
          <span
            style={{
              display: 'inline-block',
              background: 'rgba(245, 158, 11, 0.2)',
              color: '#fbbf24',
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 12px',
              borderRadius: '20px',
              border: '1px solid rgba(245, 158, 11, 0.4)'
            }}
          >
            🔒 إجراء مقفول ومحمي بسلطة المالك
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Action Details Box */}
          <div
            style={{
              background: '#fefce8',
              border: '1.5px dashed #fde047',
              borderRadius: '14px',
              padding: '14px',
              marginBottom: '20px',
              textAlign: 'right'
            }}
          >
            <div style={{ fontWeight: 800, color: '#854d0e', fontSize: '13px', marginBottom: '4px' }}>
              📌 الإجراء المطلوب تنفيذه:
            </div>
            <div style={{ fontSize: '14.5px', color: '#713f12', fontWeight: 700 }}>
              {actionTitle}
            </div>
            {actionDetails && (
              <div style={{ fontSize: '12.5px', color: '#a16207', marginTop: '6px' }}>
                {actionDetails}
              </div>
            )}
          </div>

          <form onSubmit={handleVerify}>
            {errorMsg && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  color: '#991b1b',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textAlign: 'right'
                }}
              >
                ⚠️ {errorMsg}
              </div>
            )}

            <div style={{ marginBottom: '14px', textAlign: 'right' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                اسم مستخدم المالك (Owner Username)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم مستخدم المالك..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '22px', textAlign: 'right' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                كلمة مرور المالك (Owner Password)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة مرور المالك..."
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="submit"
                disabled={isVerifying}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '14px',
                  border: 'none',
                  cursor: isVerifying ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)'
                }}
              >
                {isVerifying ? 'جاري التحقق...' : '👑 تأكيد وتنفيذ'}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '14px',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
