import React from 'react';
import { useUI } from '../../context/UIContext';

export default function WhatsAppStatusCard({
  waServerStatus,
  setWaServerStatus,
  waLiveQr,
  setWaLiveQr,
  waServerUrlInput,
  setWaServerUrlInput,
  handleCopyWaServerUrl,
  handleTestWaServerConnection,
  handleSaveOrgSettings,
  showToast
}) {
  const { showConfirm } = useUI();
  const isPrivateLanIp = (hostname) => {
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    return /^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/.test(hostname);
  };

  const getResolvedServerUrl = () => {
    try {
      const localDevice = (localStorage.getItem('PHARMACY_DEVICE_WA_URL') || '').trim();
      if (localDevice && !localDevice.includes('apexthunder.com')) return localDevice.replace(/\/+$/, '');
    } catch {}
    if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop) {
      return 'http://127.0.0.1:3100';
    }
    const custom = (waServerUrlInput || '').trim();
    if (custom && !custom.includes('apexthunder.com') && !custom.includes('localhost:3001')) return custom.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const host = window.location.hostname;
      if (isPrivateLanIp(host) && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:3100`;
      }
    }
    return 'http://127.0.0.1:3100';
  };

  const triggerServerWakeup = () => {
    showToast?.('⚡ جاري إيقاظ وتشغيل خادم الواتساب في الخلفية تلقائياً...');
    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.restartWhatsAppServer) {
        window.desktopAPI.restartWhatsAppServer();
      } else {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'hr-whatsapp://start';
        document.body.appendChild(iframe);
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 4000);
      }
      setWaServerStatus('checking');
      setTimeout(() => {
        handleTestWaServerConnection();
      }, 3000);
    } catch {
      showToast?.('تعذر إرسال إشارة الإيقاظ');
    }
  };

  return (
    <div className="whatsapp-sec-card settings-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '22px' }}>🟢</span>
        <h3 style={{ margin: 0, fontSize: '18px' }}>إدارة خادم الواتساب (Local WhatsApp Server)</h3>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 20px' }}>
        ربط وتشغيل سيرفر الواتساب المحلي المرفق بالمشروع لإرسال مفردات وإشعارات المرتبات المباشرة.
      </p>

      {/* Live Server Status & QR Pairing Box */}
      <div className="settings-inner-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>حالة الاتصال والخدمة الحية:</h4>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
              {waServerStatus === 'CONNECTED' && <span style={{ color: 'var(--success)' }}>🟢 متصل ومتزامن بالواتساب</span>}
              {waServerStatus === 'DISCONNECTED' && <span style={{ color: 'var(--danger)' }}>🔴 غير متصل - يرجى تشغيل الخادم والاقتران</span>}
              {waServerStatus === 'QR_READY' && <span style={{ color: 'var(--accent)' }}>🟡 بانتظار مسح رمز الـ QR للاقتران</span>}
              {waServerStatus === 'checking' && <span style={{ color: 'var(--muted)' }}>⏳ جاري فحص الخدمة...</span>}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {waServerStatus === 'DISCONNECTED' && (
              <button
                className="btn btn-ghost"
                style={{
                  fontSize: '13px',
                  padding: '8px 16px',
                  background: '#dcfce7',
                  color: '#15803d',
                  borderColor: '#86efac',
                  fontWeight: '700'
                }}
                onClick={triggerServerWakeup}
              >
                🚀 إيقاظ وتشغيل السيرفر تلقائياً
              </button>
            )}
            {waServerStatus === 'CONNECTED' && (
              <button
                className="btn btn-ghost"
                style={{
                  fontSize: '13px',
                  padding: '8px 16px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: '700',
                  borderRadius: '8px'
                }}
                onClick={async () => {
                  let confirmed = false;
                  if (showConfirm) {
                    confirmed = await showConfirm({
                      title: 'تغيير رقم الواتساب المتصل',
                      message: 'هل أنت متأكد من رغبتك في تغيير رقم الواتساب المتصل وفك ارتباط الهاتف الحالي؟\n\nسيتم توليد رمز QR جديد لربط الهاتف الجديد فوراً.',
                      confirmText: 'نعم، فك الارتباط وتغيير الرقم',
                      cancelText: 'إلغاء وتراجع',
                      type: 'danger',
                      icon: '📱'
                    });
                  } else {
                    confirmed = window.confirm('هل أنت متأكد من رغبتك في تغيير رقم الواتساب المتصل وفك ارتباط الهاتف الحالي؟ سيتم توليد رمز QR جديد لربط الهاتف الجديد.');
                  }
                  if (!confirmed) return;
                  showToast?.('⏳ جاري تسجيل الخروج وإلغاء اقتران الرقم الحالي...');
                  try {
                    const serverUrl = getResolvedServerUrl();
                    if (typeof window !== 'undefined' && window.desktopAPI?.logoutWhatsAppServer) {
                      await window.desktopAPI.logoutWhatsAppServer();
                    } else {
                      await fetch(`${serverUrl.replace(/\/$/, '')}/api/logout`, {
                        method: 'POST',
                        headers: { 'bypass-tunnel-reminder': 'true' }
                      });
                    }
                    setWaServerStatus('DISCONNECTED');
                    setWaLiveQr('');
                    showToast?.('🔄 تم فك الارتباط بنجاح، جاري تجهيز رمز الـ QR الجديد...');
                    setTimeout(() => {
                      handleTestWaServerConnection();
                    }, 2500);
                  } catch {
                    showToast?.('تعذر تسجيل الخروج من خادم الواتساب');
                  }
                }}
              >
                📱 تغيير الرقم المتصل
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: '13px', padding: '8px 16px' }} onClick={handleTestWaServerConnection}>
              🔄 فحص الاتصال بالخادم
            </button>
            <button
              className="btn btn-ghost"
              style={{
                fontSize: '13px',
                padding: '8px 16px',
                background: '#fef08a',
                color: '#854d0e',
                borderColor: '#eab308',
                fontWeight: '700'
              }}
              onClick={async () => {
                let confirmed = false;
                if (showConfirm) {
                  confirmed = await showConfirm({
                    title: 'تصفير جلسة الواتساب وتوليد رمز اقتران جديد',
                    message: 'هل أنت متأكد من رغبتك في تصفير مفاتيح الجلسة وتوليد رمز QR جديد فوراً؟',
                    confirmText: 'نعم، تصفير الجلسة',
                    cancelText: 'إلغاء',
                    type: 'danger',
                    icon: '⚡'
                  });
                } else {
                  confirmed = window.confirm('هل أنت متأكد من رغبتك في تصفير مفاتيح الجلسة وتوليد رمز QR جديد فوراً؟');
                }
                if (!confirmed) return;
                showToast?.('⚡ جاري تصفير الجلسة وتوليد رمز اقتران جديد...');
                try {
                  if (typeof window !== 'undefined' && window.desktopAPI?.forceResetWhatsAppServer) {
                    const res = await window.desktopAPI.forceResetWhatsAppServer();
                    showToast?.(res?.message || 'تم تصفير الجلسة بنجاح');
                  } else {
                    const serverUrl = getResolvedServerUrl();
                    await fetch(`${serverUrl.replace(/\/$/, '')}/api/force-reset`, {
                      method: 'POST',
                      headers: { 'bypass-tunnel-reminder': 'true' }
                    });
                    showToast?.('تم إرسال أمر التصفير بنجاح');
                  }
                  setWaServerStatus('checking');
                  setWaLiveQr('');
                  setTimeout(() => {
                    handleTestWaServerConnection();
                  }, 2000);
                } catch {
                  showToast?.('تعذر إرسال أمر التصفير');
                }
              }}
            >
              ⚡ تصفير وتوليد QR
            </button>
            <button
              className="btn btn-ghost"
              style={{
                fontSize: '13px',
                padding: '8px 16px',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#dc2626',
                borderColor: '#fca5a5',
                fontWeight: '700'
              }}
              onClick={async () => {
                showToast?.('⚡ جاري إعادة تشغيل خادم الواتساب في الخلفية...');
                try {
                  if (typeof window !== 'undefined' && window.desktopAPI?.restartWhatsAppServer) {
                    const res = await window.desktopAPI.restartWhatsAppServer();
                    showToast?.(res?.message || 'تمت إعادة تشغيل الخادم بنجاح');
                  } else {
                    const serverUrl = getResolvedServerUrl();
                    await fetch(`${serverUrl.replace(/\/$/, '')}/api/restart`, {
                      method: 'POST',
                      headers: { 'bypass-tunnel-reminder': 'true' }
                    });
                    showToast?.('تم إرسال أمر إعادة تشغيل الخادم بنجاح');
                  }
                  setTimeout(() => {
                    handleTestWaServerConnection();
                  }, 2500);
                } catch {
                  showToast?.('تعذر إرسال أمر إعادة التشغيل، تأكد من تشغيل النظام');
                }
              }}
            >
              ⚡ إعادة تشغيل الخادم
            </button>
          </div>
        </div>

        {/* QR Code Display Container */}
        {waServerStatus !== 'CONNECTED' && waLiveQr && (
          <div style={{ marginTop: '16px', background: '#fff', padding: '16px', borderRadius: '14px', textAlign: 'center', width: 'fit-content', margin: '16px auto 0' }}>
            <img src={waLiveQr} alt="WhatsApp QR Code" style={{ width: '200px', height: '200px' }} />
            <p style={{ color: '#1E293B', fontSize: '12.5px', fontWeight: 'bold', margin: '8px 0 0' }}>
              افتح WhatsApp على هاتفك ➔ الأجهزة المقترنة ➔ امسح الكود
            </p>
          </div>
        )}

        {waServerStatus === 'CONNECTED' && (
          <div style={{ marginTop: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', padding: '12px 16px', borderRadius: '12px', color: 'var(--success)', fontSize: '13px', fontWeight: 'bold' }}>
            🎉 تم اقتران خادم الواتساب بنجاح! يمكن الآن إرسال إشعارات كشوف المرتبات بنقرة واحدة.
          </div>
        )}

        <button
          className="btn btn-ghost"
          style={{ marginTop: '14px', fontSize: '12.5px', padding: '6px 14px' }}
          onClick={async () => {
            setWaServerStatus('QR_READY');
            const serverUrl = getResolvedServerUrl();
            try {
              const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/reconnect`, {
                method: 'POST',
                headers: { 'bypass-tunnel-reminder': 'true' }
              });
              if (res.ok) {
                const data = await res.json();
                if (data.qrCodeDataUrl) setWaLiveQr(data.qrCodeDataUrl);
              }
            } catch {
              // Fallback
            }
            showToast('جاري طلب وإظهار رمز الـ QR للاقتران...');
          }}
        >
          📷 إظهار / تحديث رمز الـ QR للاقتران
        </button>
      </div>

      {/* WhatsApp Server URL Section */}
      <div className="wa-url-box settings-inner-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span>🌐</span>
          <strong style={{ fontSize: '15px' }}>رابط سيرفر الواتساب العام (المحلي أو الإنترنت)</strong>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '0 0 14px' }}>
          ضع هنا رابط سيرفر الواتساب (مثال: <code>https://xxxx.loca.lt</code> للمشرفين خارج الشبكة أو <code>http://192.168.1.X:3100</code> للأجهزة المحلية).
        </p>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <input
            type="text"
            value={waServerUrlInput}
            onChange={(e) => setWaServerUrlInput(e.target.value)}
            placeholder="https://funny-sloth-89.loca.lt"
            style={{ flex: '1 1 280px', width: '100%', direction: 'ltr', textAlign: 'left' }}
          />
          <button className="btn btn-ghost" style={{ padding: '10px 18px' }} onClick={handleCopyWaServerUrl}>
            📋 نسخ
          </button>
          <button className="btn btn-accent" style={{ padding: '10px 18px' }} onClick={handleTestWaServerConnection}>
            ⚡ اختبار
          </button>
          <button
            type="button"
            className="btn"
            style={{ padding: '10px 16px', background: '#059669', color: '#fff', borderRadius: '8px', fontWeight: 700 }}
            onClick={() => {
              const clean = (waServerUrlInput || '').trim().replace(/\/+$/, '');
              try {
                if (clean) localStorage.setItem('PHARMACY_DEVICE_WA_URL', clean);
                else localStorage.removeItem('PHARMACY_DEVICE_WA_URL');
              } catch {}
              showToast?.(clean ? `📌 تم حفظ رابط السيرفر (${clean}) لهذا الجهاز فقط` : '🔄 تم إلغاء الحفظ المحلي');
              handleTestWaServerConnection?.();
            }}
            title="تثبيت هذا الرابط لهذا الجهاز / المتصفح فقط دون التأثير على بقية الأجهزة"
          >
            📌 حفظ للجهاز
          </button>
          <button className="btn btn-start" style={{ padding: '10px 22px' }} onClick={handleSaveOrgSettings} title="تعميم هذا الرابط على جميع أجهزة المنظومة">
            💾 حفظ وتعميم
          </button>
        </div>
      </div>
    </div>
  );
}
