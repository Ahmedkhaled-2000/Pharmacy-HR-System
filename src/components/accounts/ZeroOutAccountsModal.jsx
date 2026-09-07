import React, { useState } from 'react';

/**
 * ZeroOutAccountsModal.jsx
 * نافذة تصفير نظام الحسابات بالكامل وإعادة ضبطه إلى الصفر (Factory Reset for Accounts)
 * محمية بالكامل باشتراط التحقق الصارم من اسم مستخدم وكلمة مرور المالك (Owner) حصراً
 */
export default function ZeroOutAccountsModal({
  isOpen,
  onClose,
  onZeroOut,
  orgSettings = {},
  state = {},
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmKeyword, setConfirmKeyword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirmReset = (e) => {
    e.preventDefault();
    setErrorMsg('');

    // 1. Get official owner credentials from system configuration
    const effectiveOwnerUser = String(
      orgSettings.ownerUsername || state?.orgSettings?.ownerUsername || 'owner'
    ).trim().toLowerCase();

    const effectiveOwnerPass = String(
      orgSettings.ownerPassword || state?.orgSettings?.ownerPassword || 'owner123'
    ).trim();

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    // 2. Validate Owner Username (allowing Arabic aliases 'المالك' or 'مالك' for default owner)
    const isUserMatch =
      inputUser === effectiveOwnerUser ||
      (effectiveOwnerUser === 'owner' && (inputUser === 'المالك' || inputUser === 'مالك'));

    if (!isUserMatch) {
      setErrorMsg('اسم مستخدم المالك غير صحيح! يتطلب هذا الإجراء حصراً بيانات حساب المالك الحقيقي.');
      return;
    }

    // 3. Validate Owner Password
    if (inputPass !== effectiveOwnerPass) {
      setErrorMsg('كلمة مرور المالك غير صحيحة! يرجى إدخال كلمة سر المالك المعتمدة.');
      return;
    }

    // 4. Validate Confirmation Keyword ("تصفير" or "RESET")
    const cleanConfirm = confirmKeyword.trim().toLowerCase();
    if (cleanConfirm !== 'تصفير' && cleanConfirm !== 'reset') {
      setErrorMsg('يرجى كتابة كلمة (تصفير) في حقل التأكيد لإتمام العملية.');
      return;
    }

    // 5. Final Alert confirmation
    const finalConfirm = window.confirm(
      '⚠️ تحذير نهائي من المالك: هل أنت متأكد تماماً من تصفير منظومة الحسابات العامة بالكامل؟ سيتم مسح كافة القيود والفواتير وتقفيلات الورديات وتصفير جميع الأرصدة فوراً.'
    );
    if (!finalConfirm) return;

    setIsProcessing(true);
    try {
      onZeroOut();
      setUsername('');
      setPassword('');
      setConfirmKeyword('');
      setErrorMsg('');
      onClose();
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء تصفير المنظومة: ' + (err.message || String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div
        className="acc-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '620px', border: '2px solid #ef4444' }}
      >
        <form onSubmit={handleConfirmReset}>
          {/* Header */}
          <div
            className="acc-modal-header"
            style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  fontSize: '26px',
                  background: '#fee2e2',
                  padding: '6px 10px',
                  borderRadius: '12px',
                }}
              >
                ⚠️
              </span>
              <div>
                <h2 style={{ color: '#991b1b', margin: 0, fontSize: '18px', fontWeight: '800' }}>
                  تصفير نظام الحسابات بالكامل (إعادة ضبط شاملة)
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                  خاص بالمالك حصراً · يتطلب التحقق الأمني من اسم المستخدم وكلمة المرور
                </p>
              </div>
            </div>
            <button
              type="button"
              className="acc-action-icon-btn"
              onClick={onClose}
              style={{ fontSize: '18px', color: '#991b1b' }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="acc-modal-body">
            {/* Critical Warning Box */}
            <div
              style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '12px',
                padding: '14px 18px',
                fontSize: '13px',
                color: '#9f1239',
                lineHeight: '1.6',
              }}
            >
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
                🚨 إشعار أمني شديد الأهمية:
              </strong>
              هذا الإجراء يقوم بتفريغ وتصفير النظام المالي وإعادته إلى الحالة الصفرية النظيفة.
              يشمل الإجراء الآتي:
              <ul style={{ margin: '8px 0 0', paddingRight: '20px', fontSize: '12px' }}>
                <li>حذف جميع سندات قيود اليومية العامة (Journal Vouchers) بالكامل.</li>
                <li>حذف جميع معاملات وفواتير وسندات شركات توزيع الأدوية.</li>
                <li>حذف جميع تقفيلات ورديات الكاشير والعجز والزيادة.</li>
                <li>تصفير جميع أرصدة شجرة الحسابات (الأصول، الخصوم، الإيرادات، المصروفات) إلى 0.00 ج.م.</li>
                <li>تصفير أرصدة جميع الخزائن والبنوك ونقاط البيع والمحافظ إلى 0.00 ج.م.</li>
                <li>تصفير مديونيات وأرصدة كافة شركات الأدوية إلى 0.00 ج.م.</li>
                <li>إلغاء أية استقطاعات عجز كاشير مرتبطة من مسير الرواتب.</li>
              </ul>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: '#b91c1c',
                  fontWeight: '700',
                }}
              >
                ❌ {errorMsg}
              </div>
            )}

            {/* Form Fields: Owner Username & Password */}
            <div className="acc-form-row">
              <div className="acc-form-group">
                <label style={{ fontWeight: '800', color: '#1e293b' }}>
                  👑 اسم مستخدم المالك (Owner Username):
                </label>
                <input
                  type="text"
                  className="acc-form-input"
                  placeholder="مثال: owner"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  style={{ direction: 'ltr', textAlign: 'left', fontWeight: '700' }}
                />
              </div>

              <div className="acc-form-group">
                <label style={{ fontWeight: '800', color: '#1e293b' }}>
                  🔒 كلمة مرور المالك (Owner Password):
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="acc-form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ direction: 'ltr', textAlign: 'left', paddingLeft: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      color: '#64748b',
                    }}
                    title={showPassword ? 'إخفاء' : 'إظهار'}
                  >
                    {showPassword ? '👁️' : '🔒'}
                  </button>
                </div>
              </div>
            </div>

            {/* Explicit Confirmation Input */}
            <div className="acc-form-group">
              <label style={{ fontWeight: '800', color: '#991b1b' }}>
                ✍️ اكتب كلمة (تصفير) في الحقل أدناه لتأكيد الإجراء:
              </label>
              <input
                type="text"
                className="acc-form-input"
                placeholder="اكتب كلمة: تصفير"
                value={confirmKeyword}
                onChange={(e) => setConfirmKeyword(e.target.value)}
                required
                style={{
                  borderColor: '#fca5a5',
                  background: '#fef2f2',
                  fontSize: '15px',
                  fontWeight: '800',
                  color: '#991b1b',
                  textAlign: 'center',
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div
            className="acc-modal-footer"
            style={{ background: '#fef2f2', borderTop: '1px solid #fecaca' }}
          >
            <button
              type="button"
              className="acc-btn acc-btn-outline"
              onClick={onClose}
              disabled={isProcessing}
            >
              إلغاء التراجع
            </button>
            <button
              type="submit"
              className="acc-btn"
              disabled={isProcessing || !username.trim() || !password.trim() || !confirmKeyword.trim()}
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                padding: '10px 22px',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                cursor:
                  isProcessing || !username.trim() || !password.trim() || !confirmKeyword.trim()
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  isProcessing || !username.trim() || !password.trim() || !confirmKeyword.trim()
                    ? 0.6
                    : 1,
              }}
            >
              {isProcessing ? 'جاري التصفير...' : '⚠️ تأكيد تصفير نظام الحسابات بالكامل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
