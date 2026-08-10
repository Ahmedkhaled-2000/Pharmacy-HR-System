import React, { useState, useEffect, useCallback } from 'react';
import { fetchCurrentIP, getOrCreateDeviceId } from '../../utils/deviceAuth';

// ─────────────────────────────────────────────────────────────────────────────
//  DeviceApprovalManager
//
//  طبقتا الأمان:
//    1. IP الراوتر العام (Public IP) — يشترك فيه كل الأجهزة المتصلة بنفس الواي فاي
//    2. تسجيل جهاز محدد (اختياري) — حظر كل الأجهزة إلا أجهزة بعينها
//
//  الـ IP المجلوب من api.ipify.org هو IP الراوتر الخارجي (Public IP)،
//  وليس IP الجهاز المحلي (192.168.x.x).
// ─────────────────────────────────────────────────────────────────────────────

function normalizeRouters(allowedIps = []) {
  return allowedIps.map((entry) =>
    typeof entry === 'string' ? { label: '', ip: entry } : entry
  );
}

const PILL = {
  base: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    padding: '7px 14px', borderRadius: '20px', fontSize: '0.88rem',
    fontWeight: 'bold', border: '1px solid',
  },
  blue:  { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' },
  green: { background: '#dcfce7', color: '#15803d', borderColor: '#86efac' },
  red:   { background: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5' },
};

function Badge({ color = 'blue', children }) {
  return <span style={{ ...PILL.base, ...PILL[color] }}>{children}</span>;
}

export default function DeviceApprovalManager({
  ipRestrictions = { enabled: false, allowedIps: [] },
  onUpdateIpSettings,
}) {
  const [newIp, setNewIp]       = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [currentPublicIp, setCurrentPublicIp] = useState('');
  const [loadingIp, setLoadingIp] = useState(false);
  const [currentDeviceId] = useState(() => getOrCreateDeviceId());

  const routers = normalizeRouters(ipRestrictions.allowedIps || []);

  // جلب IP الراوتر العام
  const refreshPublicIp = useCallback(async () => {
    setLoadingIp(true);
    const ip = await fetchCurrentIP();
    setCurrentPublicIp(ip);
    setLoadingIp(false);
    return ip;
  }, []);

  useEffect(() => { refreshPublicIp(); }, [refreshPublicIp]);

  // ── حفظ قائمة الراوترات ────────────────────────────────────────────────
  const saveRouters = (updatedRouters) => {
    onUpdateIpSettings({
      enabled: ipRestrictions.enabled,
      allowedIps: updatedRouters,
    });
  };

  const handleAddRouter = () => {
    const ip = newIp.trim();
    if (!ip) { alert('يرجى إدخال عنوان الـ IP'); return; }
    if (routers.some((r) => r.ip === ip)) { alert('هذا الـ IP موجود مسبقاً!'); return; }
    const label = newLabel.trim() || `راوتر ${routers.length + 1}`;
    saveRouters([...routers, { label, ip }]);
    setNewIp('');
    setNewLabel('');
  };

  const handleAddCurrentRouter = async () => {
    const ip = await refreshPublicIp();
    if (!ip) return;
    if (routers.some((r) => r.ip === ip)) { alert('IP الراوتر الحالي مضاف مسبقاً!'); return; }
    const label = `راوتر ${routers.length + 1}`;
    saveRouters([...routers, { label, ip }]);
  };

  const handleRemoveRouter = (ip) => {
    saveRouters(routers.filter((r) => r.ip !== ip));
  };

  const handleLabelChange = (ip, newLbl) => {
    saveRouters(routers.map((r) => (r.ip === ip ? { ...r, label: newLbl } : r)));
  };

  const handleToggle = (e) => {
    onUpdateIpSettings({ enabled: e.target.checked, allowedIps: routers });
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="settings-card fade-in" style={{ marginTop: '24px' }}>
      {/* ── Header ── */}
      <div className="card-header">
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🌐</span> قيود الشبكة — راوترات الصيدلية المعتمدة
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)', lineHeight: 1.7 }}>
          كل جهاز يتصل بواي فاي الصيدلية يستخدم <strong>نفس IP الراوتر العام</strong>. أضف IP الراوتر
          هنا وسيُسمح لكل الأجهزة المتصلة به بتسجيل الحضور تلقائياً. يمكنك إضافة أكثر من راوتر.
        </p>
      </div>

      <div className="card-body">
        <div style={{ background: 'var(--bg-card-sub, #f8fafc)', padding: '20px', borderRadius: '14px', border: '1px solid var(--border, #e2e8f0)' }}>

          {/* ── Current Public IP Info Box ── */}
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px', fontSize: '0.9rem' }}>
                📡 IP الراوتر العام لهذا الجهاز الآن
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                هذا هو IP الراوتر الذي يمكن إضافته للسماح لموظفي نفس الشبكة بتسجيل الحضور
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {loadingIp ? (
                <span style={{ color: '#64748b', fontSize: '0.9rem' }}>⏳ جاري الجلب...</span>
              ) : (
                <span style={{
                  background: '#fff',
                  border: '2px solid #3b82f6',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  color: '#1d4ed8',
                  letterSpacing: '0.05em'
                }}>
                  {currentPublicIp || '—'}
                </span>
              )}
              <button
                type="button"
                onClick={refreshPublicIp}
                disabled={loadingIp}
                title="تحديث الـ IP"
                style={{
                  background: '#e0f2fe', border: '1px solid #bae6fd',
                  borderRadius: '8px', padding: '8px 12px',
                  cursor: 'pointer', fontSize: '1rem'
                }}
              >
                🔄
              </button>
            </div>
          </div>

          {/* ── Enable Toggle ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: '20px',
            flexWrap: 'wrap', gap: '10px'
          }}>
            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>
              🔒 تفعيل قفل الحضور على شبكات محددة فقط
            </h4>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
              color: ipRestrictions.enabled ? '#16a34a' : '#94a3b8',
              background: ipRestrictions.enabled ? '#dcfce7' : '#f1f5f9',
              padding: '8px 18px', borderRadius: '20px',
              border: `1px solid ${ipRestrictions.enabled ? '#86efac' : '#e2e8f0'}`,
              transition: 'all 0.2s'
            }}>
              <input
                type="checkbox"
                checked={ipRestrictions.enabled || false}
                onChange={handleToggle}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#16a34a' }}
              />
              {ipRestrictions.enabled ? '✅ القفل مُفعَّل' : '⭕ القفل مُعطَّل'}
            </label>
          </div>

          {/* ── Add Router Form ── */}
          <div style={{
            background: '#fff',
            border: '1.5px dashed #93c5fd',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '20px'
          }}>
            <p style={{ margin: '0 0 14px', fontWeight: 'bold', color: '#1d4ed8', fontSize: '0.9rem' }}>
              ➕ إضافة راوتر جديد
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="اسم الراوتر (مثال: الراوتر الرئيسي)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{
                  flex: '1', minWidth: '180px', padding: '10px 14px',
                  borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem'
                }}
              />
              <input
                type="text"
                placeholder="عنوان IP الراوتر (مثال: 197.34.120.45)"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRouter()}
                style={{
                  flex: '1', minWidth: '180px', padding: '10px 14px',
                  borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '0.9rem', fontFamily: 'monospace'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAddRouter}
                style={{
                  background: '#2563eb', color: '#fff', border: 'none',
                  padding: '10px 22px', borderRadius: '8px',
                  cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'
                }}
              >
                ➕ إضافة هذا الراوتر
              </button>
              <button
                type="button"
                onClick={handleAddCurrentRouter}
                disabled={loadingIp}
                style={{
                  background: '#059669', color: '#fff', border: 'none',
                  padding: '10px 22px', borderRadius: '8px',
                  cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
                  opacity: loadingIp ? 0.7 : 1
                }}
              >
                {loadingIp ? '⏳ جاري الجلب...' : '📍 إضافة راوتري الحالي تلقائياً'}
              </button>
            </div>
          </div>

          {/* ── Router List ── */}
          <div>
            <p style={{ margin: '0 0 14px', fontWeight: 'bold', color: '#374151', fontSize: '0.9rem' }}>
              📋 الراوترات المعتمدة ({routers.length})
            </p>
            {routers.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '24px',
                background: '#fff7ed', borderRadius: '10px',
                border: '1px solid #fed7aa',
                color: '#c2410c', fontSize: '0.9rem'
              }}>
                ⚠️ لم يتم إضافة أي راوتر بعد.{' '}
                {ipRestrictions.enabled
                  ? 'سيؤدي هذا إلى حظر جميع الموظفين من تسجيل الحضور!'
                  : '(القفل مُعطَّل — جميع الشبكات مسموح بها حالياً)'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {routers.map((router, idx) => (
                  <div key={router.ip} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: '#fff', border: '1px solid #e2e8f0',
                    borderRadius: '12px', padding: '12px 16px',
                    flexWrap: 'wrap'
                  }}>
                    <div style={{
                      width: '30px', height: '30px', flexShrink: 0,
                      background: '#dbeafe', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold', color: '#1d4ed8', fontSize: '0.85rem'
                    }}>
                      {idx + 1}
                    </div>
                    <input
                      type="text"
                      value={router.label}
                      onChange={(e) => handleLabelChange(router.ip, e.target.value)}
                      placeholder="اسم الراوتر..."
                      style={{
                        flex: '1', minWidth: '130px', padding: '6px 10px',
                        border: '1px solid #e2e8f0', borderRadius: '6px',
                        fontWeight: 'bold', fontSize: '0.9rem', color: '#1e293b',
                        background: '#f8fafc'
                      }}
                    />
                    <span style={{
                      ...PILL.base, ...PILL.blue,
                      fontFamily: 'monospace', fontSize: '0.9rem', whiteSpace: 'nowrap'
                    }}>
                      🌐 {router.ip}
                    </span>
                    {router.ip === currentPublicIp && (
                      <Badge color="green">✅ شبكتك الحالية</Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveRouter(router.ip)}
                      title="حذف هذا الراوتر"
                      style={{
                        ...PILL.base, ...PILL.red,
                        cursor: 'pointer', border: '1px solid #fca5a5',
                        background: '#fee2e2', fontFamily: 'inherit'
                      }}
                    >
                      🗑 حذف
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Explainer Box ── */}
          <div style={{
            marginTop: '20px', padding: '14px 16px',
            background: '#f0f9ff', borderRadius: '10px',
            border: '1px solid #bae6fd', fontSize: '0.83rem',
            color: '#0369a1', lineHeight: 1.8
          }}>
            <strong>💡 كيف يعمل النظام؟</strong><br/>
            • <strong>IP الراوتر</strong> = العنوان العام المشترك لكل الأجهزة على نفس الواي فاي<br/>
            • عند تفعيل القفل، لا يُسمح بتسجيل الحضور إلا من الأجهزة المتصلة براوتر الصيدلية<br/>
            • يمكن إضافة راوتر رئيسي + راوتر احتياطي لضمان الاستمرارية
          </div>
        </div>
      </div>
    </div>
  );
}
