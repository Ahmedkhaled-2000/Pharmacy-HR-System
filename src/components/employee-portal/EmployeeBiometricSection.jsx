import React, { useState } from 'react';

export default function EmployeeBiometricSection({
  employee,
  state,
  onRequestRegister,
  onRequestTest,
  onSubmitResetRequest,
  showToast
}) {
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const hasBiometric = Boolean(
    employee?.has_face_descriptor || employee?.face_descriptor ||
    employee?.has_hand_descriptor || employee?.hand_descriptor
  );
  const biometricType = employee?.preferred_biometric || state?.orgSettings?.biometricType || 'face';
  const isHand = biometricType === 'hand';

  const empIdStr = String(employee?.id || '').trim();
  const empCodeStr = String(employee?.code || '').trim();

  const isEmpMatch = (r) => {
    if (!r) return false;
    const rId = String(r.employeeId || '').trim();
    const rCode = String(r.employeeCode || '').trim();
    return (
      (empIdStr && (rId === empIdStr || rCode === empIdStr)) ||
      (empCodeStr && (rId === empCodeStr || rCode === empCodeStr))
    );
  };

  // Check pending requests
  const pendingRegistration = (state?.requests || []).find(
    r => isEmpMatch(r) &&
         r.type === 'biometric_registration' &&
         (r.status === 'pending' || r.status === 'pending_admin')
  );

  const pendingReset = (state?.requests || []).find(
    r => isEmpMatch(r) &&
         r.type === 'biometric_reset' &&
         (r.status === 'pending' || r.status === 'pending_admin')
  );

  const handleSendReset = async (e) => {
    e.preventDefault();
    const cleanReason = resetReason.trim();
    if (!cleanReason || cleanReason.length < 5) {
      alert('يرجى توضيح سبب طلب إعادة تسجيل البصمة بالتفصيل (5 أحرف على الأقل).');
      return;
    }

    setIsSubmittingReset(true);
    try {
      if (onSubmitResetRequest) {
        await onSubmitResetRequest(cleanReason);
      }
      setShowResetModal(false);
      setResetReason('');
      if (showToast) showToast('✅ تم إرسال طلب إعادة تسجيل البصمة للإدارة العليا بنجاح');
      else alert('✅ تم إرسال طلب إعادة تسجيل البصمة للإدارة العليا بنجاح. سيتم إشعارك فور اتخاذ القرار.');
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── 1. Hero Status Banner ── */}
      {pendingRegistration ? (
        // حالة: طلب التسجيل قيد المراجعة والاعتماد
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          border: '2px solid #3b82f6',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 16px rgba(59, 130, 246, 0.12)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '38px', lineHeight: 1 }}>⏳</span>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: '#1e40af', fontSize: '18px', fontWeight: 800 }}>
                  طلب تسجيل البصمة قيد مراجعة واعتماد الإدارة العليا
                </h3>
                <span style={{
                  background: '#bfdbfe',
                  color: '#1e3a8a',
                  padding: '3px 10px',
                  borderRadius: '99px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}>
                  قيد الانتظار
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', color: '#1e3a8a', fontSize: '13.5px', lineHeight: '1.7' }}>
                تم التقاط بصمتك بنجاح وحفظ متجهات التحقق، وتم إرسال طلب اعتماد رسمي للإدارة العليا لتفعيل البصمة.
                بمجرد موافقة الإدارة العليا سيتم تفعيلها تلقائياً وستتمكن من استخدامها في أجهزة كشك الصيدلية.
              </p>
              <div style={{ marginTop: '12px', display: 'flex', gap: '14px', fontSize: '12.5px', color: '#3b82f6', fontWeight: 700, flexWrap: 'wrap' }}>
                <span>📅 تاريخ التقديم: {pendingRegistration.date || pendingRegistration.createdAt?.slice(0, 10)}</span>
                <span>⚡ نوع البصمة: {pendingRegistration.biometricType === 'hand' ? 'بصمة اليد' : 'بصمة الوجه'}</span>
                <span>🔒 حالة التعديل: لا يمكن التسجيل مرة أخرى أثناء انتظار الاعتماد</span>
              </div>
            </div>
          </div>
        </div>
      ) : pendingReset ? (
        // حالة: طلب مسح وإعادة التسجيل قيد المراجعة
        <div style={{
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          border: '2px solid #f59e0b',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 16px rgba(245, 158, 11, 0.12)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '38px', lineHeight: 1 }}>🔄</span>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: '#92400e', fontSize: '18px', fontWeight: 800 }}>
                  طلب إعادة تسجيل البصمة قيد مراجعة الإدارة العليا
                </h3>
                <span style={{
                  background: '#fde68a',
                  color: '#78350f',
                  padding: '3px 10px',
                  borderRadius: '99px',
                  fontSize: '11.5px',
                  fontWeight: 800
                }}>
                  بانتظار الموافقة
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', color: '#92400e', fontSize: '13.5px', lineHeight: '1.7' }}>
                لقد تقدمت بطلب لإعادة تسجيل البصمة ومسح بصمتك القديمة بسبب: <strong>"{pendingReset.reason || 'طلب إداري'}"</strong>.
                عند موافقة الإدارة العليا، سيتم مسح البصمة القديمة تلقائياً وسيصلك إشعار لتسجيل بصمتك الجديدة.
              </p>
              <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#b45309', fontWeight: 700 }}>
                📅 تاريخ تقديم الطلب: {pendingReset.date || pendingReset.createdAt?.slice(0, 10)}
              </div>
            </div>
          </div>
        </div>
      ) : hasBiometric ? (
        // حالة: البصمة مسجلة ومعتمدة ونشطة
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          border: '2px solid #22c55e',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 16px rgba(34, 197, 94, 0.12)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#22c55e',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
              }}>
                ✓
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, color: '#15803d', fontSize: '19px', fontWeight: 900 }}>
                    بصمتك الإلكترونية مسجلة ونشطة ومعتمدة رسمياً
                  </h3>
                  <span style={{
                    background: '#22c55e',
                    color: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: 800
                  }}>
                    معتمدة في الكشك
                  </span>
                </div>
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#166534', lineHeight: '1.6' }}>
                  يمكنك استخدام بصمتك لتسجيل الحضور والانصراف والاستراحة في أجهزة كشك البصمة بجميع الفروع المصرحة لك.
                </div>
              </div>
            </div>

            {/* الأزرار التفاعلية */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-start"
                onClick={onRequestTest}
                style={{
                  background: '#0d9488',
                  color: '#ffffff',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13.5px',
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🧪</span>
                <span>اختبار مطابقة البصمة الحية</span>
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowResetModal(true)}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #d97706',
                  color: '#b45309',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔄</span>
                <span>طلب إعادة تسجيل البصمة</span>
              </button>
            </div>
          </div>

          <div style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(34, 197, 94, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#15803d',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span>🧬 نوع البصمة: <strong>{isHand ? 'بصمة اليد' : 'بصمة الوجه الذكية (HD)'}</strong></span>
              <span>🛡️ جهة الاعتماد: <strong>{employee.biometricApprovedBy || 'الإدارة العليا'}</strong></span>
              {employee.biometricApprovedAt && (
                <span>📅 تاريخ الاعتماد: <strong>{employee.biometricApprovedAt.slice(0, 10)}</strong></span>
              )}
            </div>
            <div style={{ color: '#65a30d', fontWeight: 600 }}>
              🔒 لا يمكن مسح البصمة مباشرة إلا بموافقة الإدارة العليا
            </div>
          </div>
        </div>
      ) : (
        // حالة: غير مسجل (مطلوب التسجيل لمرة واحدة)
        <div style={{
          background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
          border: '2.5px solid #ea580c',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 6px 20px rgba(234, 88, 12, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '260px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: '#ea580c',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                flexShrink: 0
              }}>
                📸
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, color: '#9a3412', fontSize: '19px', fontWeight: 900 }}>
                    لم يتم تسجيل بصمتك الإلكترونية بعد!
                  </h3>
                  <span style={{
                    background: '#ea580c',
                    color: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '99px',
                    fontSize: '11px',
                    fontWeight: 800
                  }}>
                    تسجيل لمرة واحدة فقط
                  </span>
                </div>
                <p style={{ margin: '6px 0 0 0', color: '#c2410c', fontSize: '13.5px', lineHeight: '1.6' }}>
                  يجب عليك تسجيل بصمتك الذكية الآن لتتمكن من إثبات حضورك وانصرافك اليومي في الصيدلية عبر الكشك.
                  عملية التسجيل تتم لمرة واحدة فقط وسريعة جداً (التقاط ثلاثي الأبعاد بالكاميرا) ثم تُرسل للاعتماد الفوري من الإدارة العليا.
                </p>
              </div>
            </div>

            <div>
              <button
                type="button"
                className="btn btn-start"
                onClick={onRequestRegister}
                style={{
                  background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                  color: '#ffffff',
                  padding: '14px 28px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  fontSize: '15px',
                  boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <span>📸</span>
                <span>تسجيل البصمة الآن (خطوة واحدة)</span>
                <span>➔</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Information and Quality Guidance Card ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '20px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <h4 style={{ margin: '0 0 14px 0', color: 'var(--text)', fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>💡</span>
          <span>إرشادات وتعليمات البصمة الذكية لضمان أعلى دقة وسرعة:</span>
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', fontSize: '13px' }}>
          <div style={{ background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>☀️ إضاءة واضحة ومباشرة</strong>
            <span style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
              تأكد من وجودك في مكان ذي إضاءة جيدة وتجنب وجود مصدر ضوء قوي أو نافذة ساطعة خلف رأسك مباشرة.
            </span>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>👓 نزع النظارات الشمسية والأقنعة</strong>
            <span style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
              يرجى نزع النظارات الشمسية أو الكمامات لتمكين الذكاء الاصطناعي من استخراج نقاط الملامح بدقة.
            </span>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>🎯 النظر المباشر والالتفات التدريجي</strong>
            <span style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
              انظر أولاً لعدسة الكاميرا مباشرة، ثم التفت يميناً ويساراً بدرجة خفيفة (15°) عند طلب النظام لبناء بروفايل متعدد الزوايا.
            </span>
          </div>

          <div style={{ background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>🔒 أمان وخصوصية البيانات الحيوية</strong>
            <span style={{ color: 'var(--muted)', lineHeight: '1.5' }}>
              يتم تحويل ملامح الوجه إلى متجهات رياضية مشفرة أحادية الاتجاه؛ لا يمكن إعادة إنتاج الصور منها إطلاقاً.
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. Reset Request Modal ── */}
      {showResetModal && (
        <div className="modal-backdrop" onClick={() => !isSubmittingReset && setShowResetModal(false)} style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '520px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#b45309', fontSize: '17px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔄</span>
                <span>طلب إعادة تسجيل البصمة من الإدارة العليا</span>
              </h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => !isSubmittingReset && setShowResetModal(false)}
                disabled={isSubmittingReset}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSendReset}>
              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '10px', padding: '12px 14px', marginBottom: '14px', fontSize: '13px', color: '#92400e', lineHeight: '1.6' }}>
                ℹ️ <strong>تنبيه هام:</strong> تقديم هذا الطلب يعني رغبتك في مسح بصمتك الحالية وإعادة التقاط بصمة جديدة.
                عند موافقة الإدارة العليا على طلبك، سيتم مسح البصمة القديمة آلياً وسيتاح لك التسجيل لمرة واحدة من جديد.
              </div>

              <div className="field">
                <label style={{ fontWeight: 700, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                  سبب طلب إعادة تسجيل البصمة <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="يرجى كتابة سبب طلب إعادة التسجيل (مثال: تغير الملامح، صعوبة التعرف في الكشك، رغبة في التقاط بصمة بجودة أعلى...)"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  required
                  disabled={isSubmittingReset}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border)',
                    fontSize: '13.5px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowResetModal(false)}
                  disabled={isSubmittingReset}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  disabled={isSubmittingReset}
                  style={{
                    background: '#d97706',
                    color: '#ffffff',
                    fontWeight: 800,
                    padding: '9px 20px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSubmittingReset ? 'جاري إرسال الطلب...' : 'إرسال الطلب للإدارة العليا ➔'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
