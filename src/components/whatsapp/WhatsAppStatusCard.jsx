import React from 'react';

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

          <button className="btn btn-ghost" style={{ fontSize: '13px', padding: '8px 16px' }} onClick={handleTestWaServerConnection}>
            🔄 فحص الاتصال بالخادم
          </button>
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
            const serverUrl = waServerUrlInput.trim() || 'http://localhost:3001';
            try {
              const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/reconnect`, { method: 'POST' });
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
          ضع هنا رابط سيرفر الواتساب (مثال: <code>https://xxxx.loca.lt</code> للمشرفين خارج الشبكة أو <code>http://192.168.1.X:3001</code> للأجهزة المحلية).
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
          <button className="btn btn-start" style={{ padding: '10px 22px' }} onClick={handleSaveOrgSettings}>
            💾 حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
