import React, { useState, useEffect, useRef } from 'react';

/**
 * SystemLockScreen.jsx
 * شاشة إيقاف وقفل النظام المؤقت الاحترافية (System Lock Screen)
 * تُفعل عند الضغط على مفتاح Scroll Lock أو زر القفل، وتطلب كلمة المرور فقط لإلغاء القفل.
 */
export default function SystemLockScreen({
  authRole = 'admin',
  currentBranch = null,
  currentEmpUser = null,
  state = null,
  onUnlock,
  onLogout,
  themeMode = 'light'
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const inputRef = useRef(null);

  // تحديث الساعة الحية كل ثانية
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // التركيز التلقائي على حقل كلمة المرور
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // تنسيق الوقت والتاريخ باللغة العربية
  const timeStr = currentTime.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const dateStr = currentTime.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // استخراج بيانات الملف الشخصي للمستخدم الحالي
  const userProfile = (() => {
    const orgSettings = state?.orgSettings || {};
    if (authRole === 'owner') {
      return {
        name: 'مالك المنظومة (Owner)',
        jobTitle: 'المشرف العام والمالك',
        roleLabel: 'المالك 👑',
        badgeBg: 'linear-gradient(135deg, #d97706, #b45309)',
        avatarIcon: '👑'
      };
    }
    if (authRole === 'branch') {
      const branchName = currentBranch?.name || 'الفرع';
      const mgrEmp = (state?.employees || []).find((e) => e && (e.id === currentBranch?.managerId || e.code === currentBranch?.managerCode));
      return {
        name: mgrEmp?.name || `مدير فرع ${branchName}`,
        jobTitle: `إدارة فرع ${branchName}`,
        roleLabel: 'مدير فرع 🏢',
        badgeBg: 'linear-gradient(135deg, #0284c7, #0369a1)',
        avatarIcon: '🏢'
      };
    }
    if (authRole === 'employee') {
      return {
        name: currentEmpUser?.name || 'الموظف',
        jobTitle: currentEmpUser?.jobTitle || 'موظف',
        roleLabel: 'بوابة الموظف 👤',
        badgeBg: 'linear-gradient(135deg, #0d9488, #0f766e)',
        avatarIcon: '👤'
      };
    }
    return {
      name: orgSettings.generalManagerName || 'الإدارة العليا',
      jobTitle: 'Super Admin',
      roleLabel: 'الإدارة العليا 🛡️',
      badgeBg: 'linear-gradient(135deg, #4f46e5, #4338ca)',
      avatarIcon: '🛡️'
    };
  })();

  // التحقق من صحة كلمة المرور لفك القفل
  const handleUnlockAttempt = (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    const trimmed = String(password || '').trim();
    if (!trimmed) {
      triggerError('يرجى كتابة كلمة المرور للمتابعة');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const orgSettings = state?.orgSettings || {};
    const ownerPass = String(orgSettings.ownerPassword || 'owner123').trim();
    const adminPass = String(orgSettings.adminPassword || 'admin123').trim();

    let isValid = false;

    // كلمة مرور المالك تفك قفل أي دور كـ Master Key
    if (trimmed === ownerPass) {
      isValid = true;
    } else if (authRole === 'owner') {
      isValid = trimmed === ownerPass;
    } else if (authRole === 'admin') {
      isValid = trimmed === adminPass || trimmed === ownerPass;
    } else if (authRole === 'branch') {
      const bPass = String(currentBranch?.password || currentBranch?.pin || '').trim();
      isValid = (bPass && trimmed === bPass) || trimmed === adminPass || trimmed === ownerPass;
    } else if (authRole === 'employee') {
      const ePin = String(currentEmpUser?.pin || '').trim();
      const ePass = String(currentEmpUser?.password || '').trim();
      isValid = (ePin && trimmed === ePin) || (ePass && trimmed === ePass) || trimmed === adminPass || trimmed === ownerPass;
    } else {
      isValid = trimmed === adminPass || trimmed === ownerPass;
    }

    if (isValid) {
      // فك القفل بنجاح
      onUnlock?.();
    } else {
      triggerError('كلمة المرور غير صحيحة، يرجى المحاولة مجدداً');
      setIsSubmitting(false);
    }
  };

  const triggerError = (msg) => {
    setErrorMsg(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        background: 'rgba(10, 15, 29, 0.88)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        color: '#ffffff',
        fontFamily: "'Cairo', 'Tajawal', -apple-system, sans-serif",
        direction: 'rtl',
        userSelect: 'none',
        animation: 'systemLockFadeIn 0.25s ease-out'
      }}
    >
      <style>{`
        @keyframes systemLockFadeIn {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes systemLockShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .lock-shake-box {
          animation: systemLockShake 0.4s ease-in-out;
        }
        .lock-input::placeholder {
          color: #94a3b8;
          opacity: 0.8;
        }
        .lock-input:focus {
          outline: none;
          border-color: #10b981 !important;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.25) !important;
        }
        .lock-btn-hover:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 10px 25px rgba(16, 185, 129, 0.35) !important;
        }
      `}</style>

      {/* الساعة والتاريخ في الجزء العلوي */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div
          style={{
            fontSize: '44px',
            fontWeight: 900,
            letterSpacing: '1px',
            fontVariantNumeric: 'tabular-nums',
            color: '#f8fafc',
            textShadow: '0 4px 16px rgba(0,0,0,0.5)',
            marginBottom: '4px'
          }}
        >
          {timeStr}
        </div>
        <div style={{ fontSize: '15px', color: '#cbd5e1', fontWeight: 600 }}>
          {dateStr}
        </div>
      </div>

      {/* بطاقة القفل الرئيسية */}
      <div
        className={isShaking ? 'lock-shake-box' : ''}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(30, 41, 59, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          padding: '32px 28px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative'
        }}
      >
        {/* شارة القفل والأيقونة */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <div
            style={{
              width: '74px',
              height: '74px',
              borderRadius: '22px',
              background: userProfile.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '34px',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)',
              border: '2px solid rgba(255,255,255,0.2)'
            }}
          >
            {userProfile.avatarIcon}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: '-4px',
              right: '-4px',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: '#ef4444',
              border: '2.5px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
            }}
            title="النظام متوقف مؤقتاً"
          >
            🔒
          </div>
        </div>

        {/* بيانات المستخدم */}
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: '19px',
            fontWeight: 800,
            color: '#ffffff'
          }}
        >
          {userProfile.name}
        </h3>
        <div
          style={{
            fontSize: '13px',
            color: '#94a3b8',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>{userProfile.jobTitle}</span>
          <span>•</span>
          <span
            style={{
              background: 'rgba(255,255,255,0.1)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#38bdf8'
            }}
          >
            {userProfile.roleLabel}
          </span>
        </div>

        {/* تنبيه حالة الإيقاف المؤقت */}
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fde68a',
            padding: '8px 14px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '20px',
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <span>⏸️</span>
          <span>تم إيقاف النظام مؤقتاً بواسطة (Scroll Lock)</span>
        </div>

        {/* رسالة الخطأ */}
        {errorMsg && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '12.5px',
              fontWeight: 700,
              marginBottom: '16px',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}

        {/* نموذج كلمة المرور */}
        <form onSubmit={handleUnlockAttempt} style={{ width: '100%' }}>
          <div style={{ position: 'relative', marginBottom: '16px' }}>
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="اكتب كلمة المرور لإلغاء القفل..."
              className="lock-input"
              style={{
                width: '100%',
                padding: '13px 42px 13px 14px',
                borderRadius: '14px',
                border: errorMsg ? '1.5px solid #ef4444' : '1.5px solid rgba(255,255,255,0.18)',
                background: 'rgba(15, 23, 42, 0.65)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 700,
                boxSizing: 'border-box',
                transition: 'all 0.2s ease',
                textAlign: 'right'
              }}
            />
            <span
              style={{
                position: 'absolute',
                right: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '16px',
                color: '#94a3b8'
              }}
            >
              🔒
            </span>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                color: '#94a3b8',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
              title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            >
              {showPassword ? '👁️' : '🕶️'}
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="lock-btn-hover"
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: '14px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.2s ease'
            }}
          >
            <span>🔓</span>
            <span>استئناف ومتابعة العمل (Enter)</span>
          </button>
        </form>

        {/* خيار تسجيل الخروج أو تبديل المستخدم */}
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', width: '100%' }}>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('هل تريد تسجيل الخروج بالكامل من الحساب والعودة لشاشة الدخول؟')) {
                onLogout?.();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#cbd5e1',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}
          >
            <span>🚪</span>
            <span>تبديل المستخدم أو تسجيل الخروج بالكامل</span>
          </button>
        </div>
      </div>

      {/* تلميح سفلي لزر الاختصار */}
      <div
        style={{
          marginTop: '24px',
          fontSize: '12px',
          color: '#64748b',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        <span>💡 يمكن قفل أو إيقاف النظام في أي وقت بالضغط على مفتاح</span>
        <kbd
          style={{
            background: 'rgba(255,255,255,0.1)',
            padding: '2px 7px',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#e2e8f0',
            fontFamily: 'monospace',
            border: '1px solid rgba(255,255,255,0.15)'
          }}
        >
          Scroll Lock
        </kbd>
      </div>
    </div>
  );
}
