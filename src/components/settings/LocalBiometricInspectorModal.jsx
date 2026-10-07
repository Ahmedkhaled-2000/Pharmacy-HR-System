import React, { useState, useEffect } from 'react';

/**
 * LocalBiometricInspectorModal.jsx
 * خادم وفاحص أجهزة البصمة المحلي المدمج في تطبيق الويندوز
 * يتيح فحص الشبكة المحلية، اكتشاف ماكينات ZKTeco MB20، اختبار الاتصال بالسحابة،
 * ووساطة نقل البصمات محلياً (Local ADMS Bridge) عند وجود قيود على راوتر الفرع.
 */
export default function LocalBiometricInspectorModal({ isOpen, onClose }) {
  const [networkInfo, setNetworkInfo] = useState([]);
  const [cloudStatus, setCloudStatus] = useState(null);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [localServerStatus, setLocalServerStatus] = useState({ isRunning: false, port: 7005, logs: [] });
  const [isScanningLan, setIsScanningLan] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [targetPingIp, setTargetPingIp] = useState('192.168.1.201');
  const [pingResult, setPingResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [livePackets, setLivePackets] = useState([]);

  const isDesktop = typeof window !== 'undefined' && Boolean(window.desktopAPI?.isDesktop);

  useEffect(() => {
    if (!isOpen) return;

    // جلب معلومات الشبكة المحلية
    if (isDesktop && window.desktopAPI?.biometricGetNetworkInfo) {
      window.desktopAPI.biometricGetNetworkInfo().then(res => {
        if (res?.success && Array.isArray(res.interfaces)) {
          setNetworkInfo(res.interfaces);
          if (res.interfaces[0]?.ip) {
            const parts = res.interfaces[0].ip.split('.');
            setTargetPingIp(`${parts[0]}.${parts[1]}.${parts[2]}.201`);
          }
        }
      }).catch(() => {});

      // جلب حالة الخادم المحلي
      window.desktopAPI.biometricGetLocalServerStatus?.().then(res => {
        if (res?.success) {
          setLocalServerStatus(res);
          setLivePackets(res.logs || []);
        }
      }).catch(() => {});

      // الاستماع للحزم الحية
      const unsubscribe = window.desktopAPI.onBiometricLocalPacket?.((pkt) => {
        setLivePackets(prev => [pkt, ...prev].slice(0, 30));
      });

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [isOpen, isDesktop]);

  // اختبار الاتصال بالسيرفر السحابي من هذا الجهاز
  const handleTestCloud = async () => {
    setIsTestingCloud(true);
    setCloudStatus(null);
    try {
      if (isDesktop && window.desktopAPI?.biometricTestCloud) {
        const res = await window.desktopAPI.biometricTestCloud();
        setCloudStatus(res);
      } else {
        // اختبار من المتصفح عبر fetch
        const start = Date.now();
        const testRes = await fetch('https://63-183-147-199.sslip.io/api/health', { mode: 'cors' });
        const latency = Date.now() - start;
        setCloudStatus({
          success: true,
          port80: { open: testRes.ok, latency },
          port5000: { open: testRes.ok, latency }
        });
      }
    } catch (err) {
      setCloudStatus({ success: false, error: err.message });
    } finally {
      setIsTestingCloud(false);
    }
  };

  // فحص الشبكة المحلية واكتشاف الأجهزة
  const handleScanLan = async () => {
    if (!isDesktop || !window.desktopAPI?.biometricScanLan) return;
    setIsScanningLan(true);
    try {
      const activeIf = networkInfo[0];
      const res = await window.desktopAPI.biometricScanLan(activeIf?.subnetBase || '192.168.1');
      if (res?.success && Array.isArray(res.devices)) {
        setDiscoveredDevices(res.devices);
      }
    } catch (err) {
      console.warn('[Scan LAN Error]:', err);
    } finally {
      setIsScanningLan(false);
    }
  };

  // إرسال Ping لجهاز محدد على الشبكة
  const handlePingTarget = async () => {
    if (!isDesktop || !window.desktopAPI?.biometricPingDevice || !targetPingIp) return;
    setIsPinging(true);
    setPingResult(null);
    try {
      const [res4370, res80] = await Promise.all([
        window.desktopAPI.biometricPingDevice(targetPingIp, 4370),
        window.desktopAPI.biometricPingDevice(targetPingIp, 80)
      ]);
      setPingResult({
        ip: targetPingIp,
        port4370: res4370.open,
        port80: res80.open,
        latency: res4370.latency || res80.latency || null,
        error: (!res4370.open && !res80.open) ? (res4370.error || res80.error) : null
      });
    } catch (err) {
      setPingResult({ ip: targetPingIp, error: err.message });
    } finally {
      setIsPinging(false);
    }
  };

  // تشغيل / إيقاف خادم الاستقبال والوساطة المحلي
  const handleToggleLocalServer = async () => {
    if (!isDesktop || !window.desktopAPI?.biometricToggleLocalServer) return;
    const newState = !localServerStatus.isRunning;
    try {
      const res = await window.desktopAPI.biometricToggleLocalServer(newState, 7005);
      if (res?.success) {
        setLocalServerStatus(prev => ({ ...prev, isRunning: newState }));
      }
    } catch (err) {
      console.warn('[Toggle Server Error]:', err);
    }
  };

  if (!isOpen) return null;

  const primaryIp = networkInfo[0]?.ip || '127.0.0.1';
  const primaryGateway = networkInfo[0]?.gatewayGuess || '192.168.1.1';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px',
      fontFamily: 'Cairo, sans-serif'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '18px',
        width: '100%',
        maxWidth: '860px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* شريط العنوان الرأسي */}
        <div style={{
          padding: '16px 22px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛰️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                خادم وفاحص أجهزة البصمة المحلي (Local Biometric Inspector)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                أداة تشخيص شبكة الفرع واكتشاف ماكينات ZKTeco MB20 ووساطة البصمات محلياً
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        {/* محتوى الشاشة الداخلي القابل للتمرير */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 1. بطاقة معلومات شبكة الكومبيوتر المحلي */}
          <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💻</span> بطاقة شبكة هذا الكومبيوتر داخل الصيدلية:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.82rem', color: '#475569' }}>
              <div>🌐 <strong>IP الكومبيوتر المحلي:</strong> <span style={{ color: '#0284c7', fontWeight: 700 }}>{primaryIp}</span></div>
              <div>🚪 <strong>بوابة الراوتر المتوقعة (Gateway):</strong> <span style={{ color: '#059669', fontWeight: 700 }}>{primaryGateway}</span></div>
              <div>🛡️ <strong>قناع الشبكة (Mask):</strong> {networkInfo[0]?.netmask || '255.255.255.0'}</div>
              <div>🔌 <strong>كارت الشبكة:</strong> {networkInfo[0]?.interfaceName || 'LAN Adapter'}</div>
            </div>
          </div>

          {/* 2. فحص اتصال الإنترنت بالسحابة من هذا الكومبيوتر */}
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>☁️</span> فحص اتصال الإنترنت بالسيرفر السحابي (VPS):
              </div>
              <button
                type="button"
                disabled={isTestingCloud}
                onClick={handleTestCloud}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: isTestingCloud ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isTestingCloud ? '⏳ جاري الفحص...' : '🔄 فحص الاتصال الآن'}
              </button>
            </div>

            {cloudStatus && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '10px' }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: cloudStatus.port80?.open ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${cloudStatus.port80?.open ? '#a7f3d0' : '#fecaca'}`,
                  fontSize: '0.82rem'
                }}>
                  <div style={{ fontWeight: 800, color: cloudStatus.port80?.open ? '#059669' : '#dc2626' }}>
                    {cloudStatus.port80?.open ? '🟢 منفذ 80 (HTTP) مفتوح وسليم' : '🔴 منفذ 80 (HTTP) محظور بالراوتر'}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                    {cloudStatus.port80?.open ? `زمن الاستجابة: ${cloudStatus.port80?.latency}ms` : 'الراوتر يمنع أو يحول البورت 80'}
                  </div>
                </div>

                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: cloudStatus.port5000?.open ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${cloudStatus.port5000?.open ? '#a7f3d0' : '#fecaca'}`,
                  fontSize: '0.82rem'
                }}>
                  <div style={{ fontWeight: 800, color: cloudStatus.port5000?.open ? '#059669' : '#dc2626' }}>
                    {cloudStatus.port5000?.open ? '🟢 منفذ 5000 (Direct) مفتوح ومستقر' : '🔴 منفذ 5000 محظور'}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '4px' }}>
                    {cloudStatus.port5000?.open ? `زمن الاستجابة: ${cloudStatus.port5000?.latency}ms (موصى به للماكينات)` : 'المنفذ غير متاح'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. فحص وبحث عن ماكينة البصمة على الشبكة المحلية (LAN Scanner & Ping) */}
          <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔍</span> فحص واكتشاف ماكينات البصمة على الشبكة المحلية:
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '220px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>IP الماكينة:</span>
                <input
                  type="text"
                  value={targetPingIp}
                  onChange={(e) => setTargetPingIp(e.target.value)}
                  placeholder="مثال: 192.168.1.201"
                  style={{
                    flex: 1,
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
              <button
                type="button"
                disabled={isPinging}
                onClick={handlePingTarget}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: isPinging ? 'not-allowed' : 'pointer'
                }}
              >
                {isPinging ? 'جاري الفحص...' : '⚡ فحص استجابة الماكينة (Ping)'}
              </button>
              {isDesktop && (
                <button
                  type="button"
                  disabled={isScanningLan}
                  onClick={handleScanLan}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    background: '#6366f1',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: isScanningLan ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isScanningLan ? 'جاري مسح الشبكة...' : '🔎 كشف أجهزة الشبكة تلقائياً'}
                </button>
              )}
            </div>

            {pingResult && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: (pingResult.open || pingResult.icmp || pingResult.port4370 || pingResult.port80) ? '#ecfdf5' : '#fef2f2',
                border: `1px solid ${(pingResult.open || pingResult.icmp || pingResult.port4370 || pingResult.port80) ? '#a7f3d0' : '#fecaca'}`,
                fontSize: '0.82rem',
                color: (pingResult.open || pingResult.icmp || pingResult.port4370 || pingResult.port80) ? '#065f46' : '#991b1b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <strong>نتيجة الفحص للعنوان ({pingResult.ip}):</strong>{' '}
                  {(pingResult.open || pingResult.icmp || pingResult.port4370 || pingResult.port80)
                    ? `🟢 متصل ومستجيب محلياً! (${pingResult.icmp ? 'Ping: نعم | ' : ''}بورت 4370: ${pingResult.port4370 ? 'مفتوح' : 'مغلق'} | بورت 80: ${pingResult.port80 ? 'مفتوح' : 'مغلق'})`
                    : '🔴 لا يوجد أي استجابة من هذا العنوان (تأكد من كابل الشبكة أو تشغيل الماكينة أو فحص IP 192.168.1.201 الافتراضي).'}
                </div>
                {pingResult.latency && (
                  <span style={{ fontWeight: 800 }}>{pingResult.latency}ms</span>
                )}
              </div>
            )}

            {discoveredDevices.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                  الأجهزة المكتشفة على الشبكة المحلية ({discoveredDevices.length}):
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {discoveredDevices.map((dev, idx) => (
                    <div key={idx} style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: dev.isLikelyZk ? '#f0fdf4' : '#f1f5f9',
                      border: `1px solid ${dev.isLikelyZk ? '#bbf7d0' : '#e2e8f0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>IP:</strong> <span style={{ fontFamily: 'monospace', color: '#0284c7', fontWeight: 800 }}>{dev.ip}</span>
                        {dev.mac && dev.mac !== '—' && (
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>({dev.mac})</span>
                        )}
                        {dev.isLikelyZk && (
                          <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800 }}>
                            ⚡ ماكينة ZKTeco مؤكدة
                          </span>
                        )}
                        {dev.latency > 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#059669' }}>{dev.latency}ms</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setTargetPingIp(dev.ip); handlePingTarget(); }}
                        style={{ padding: '4px 10px', borderRadius: '6px', background: '#0284c7', color: '#fff', border: 'none', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        اختيار وفحص
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. خادم الاستقبال والوساطة المحلي المدمج (Local ADMS Bridge Server) */}
          <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🛡️</span> خادم الاستقبال والوساطة المحلي المدمج (Local ADMS Bridge):
              </div>
              {isDesktop && (
                <button
                  type="button"
                  onClick={handleToggleLocalServer}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: localServerStatus.isRunning ? '#dc2626' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  {localServerStatus.isRunning ? '⏹️ إيقاف الخادم المحلي' : '▶️ تشغيل الخادم المحلي'}
                </button>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: '#15803d', lineHeight: '1.6', marginBottom: '10px' }}>
              إذا كان راوتر الصيدلية يمنع الماكينة من الخروج إلى السحابة، يمكنك ضبط إعداد <strong>Cloud Server</strong> في ماكينة البصمة على:
              <div style={{
                background: '#ffffff',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #86efac',
                marginTop: '6px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#166534'
              }}>
                Server Address: <strong>{primaryIp}</strong> | Server Port: <strong>7005</strong>
              </div>
              وسيقوم برنامج الويندوز باستلام البصمات وتمريرها للسحابة فوراً في أجزاء من الثانية!
            </div>

            {/* سجل الحزم اللحظي */}
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '0.75rem', maxHeight: '140px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>
                📡 سجل النبضات الحية المستلمة محلياً ({livePackets.length} حزمة):
              </div>
              {livePackets.length === 0 ? (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>بانتظار وصول نبضات من ماكينة البصمة على المنفذ 7005...</div>
              ) : (
                livePackets.map((pkt, idx) => (
                  <div key={idx} style={{ fontFamily: 'monospace', borderBottom: '1px solid #1e293b', padding: '2px 0' }}>
                    <span style={{ color: '#4ade80' }}>[{pkt.time}]</span> <span style={{ color: '#38bdf8' }}>{pkt.clientIp}</span> ➔ {pkt.method} {pkt.url} (SN: {pkt.serialNumber})
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* الشريط السفلي للإغلاق */}
        <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: '#334155',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
}
