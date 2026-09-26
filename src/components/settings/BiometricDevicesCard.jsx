import React, { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../../utils/socketClient';

export default function BiometricDevicesCard({ state, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('devices'); // 'devices' | 'mapping' | 'logs' | 'guide'
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // حقول محاكي الاختبار
  const [simPin, setSimPin] = useState('107');
  const [simVerifyType, setSimVerifyType] = useState('FINGERPRINT');
  const [simActionType, setSimActionType] = useState('check_in');

  // جلب قائمة الأجهزة
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/devices');
      const data = await res.json();
      if (data.success) {
        setDevices(data.devices || []);
      }
    } catch (e) {
      console.warn('Error fetching biometric devices:', e.message);
    }
  }, []);

  // جلب سجلات البصمات الحية
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/logs?limit=50');
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Error fetching biometric logs:', e.message);
    }
  }, []);

  // جلب ملفات ربط الموظفين
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/profiles');
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles || []);
      }
    } catch (e) {
      console.warn('Error fetching biometric profiles:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchLogs();
    fetchProfiles();

    // الاستماع لنبض الجهاز ولحظية البصمات عبر Socket.io
    const socket = getSocket();
    if (socket) {
      const onStatus = (statusPayload) => {
        setDevices(prev => {
          const idx = prev.findIndex(d => d.serial_number === statusPayload.serialNumber);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], status: 'ONLINE', last_heartbeat: statusPayload.lastHeartbeat };
            return updated;
          } else {
            return [{
              id: `dev_${statusPayload.serialNumber.toLowerCase()}`,
              device_name: `جهاز بصمة ZKTeco (${statusPayload.serialNumber})`,
              serial_number: statusPayload.serialNumber,
              status: 'ONLINE',
              last_heartbeat: statusPayload.lastHeartbeat,
              device_type: 'MB20',
              protocol: 'ADMS'
            }, ...prev];
          }
        });
      };

      const onPunch = (punchPayload) => {
        fetchLogs();
      };

      socket.on('biometric:device_status', onStatus);
      socket.on('punch:recorded', onPunch);

      return () => {
        socket.off('biometric:device_status', onStatus);
        socket.off('punch:recorded', onPunch);
      };
    }
  }, [fetchDevices, fetchLogs, fetchProfiles]);

  // تحديث فرع الجهاز
  const handleAssignBranch = async (serialNumber, branchId) => {
    try {
      const branchObj = (state?.branches || []).find(b => String(b.id) === String(branchId));
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId,
          branchName: branchObj?.name || 'الفرع المحدد'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم ربط جهاز البصمة بالفرع بنجاح');
        fetchDevices();
      }
    } catch {
      showToast?.('❌ تعذر حفظ إعدادات الجهاز');
    }
  };

  // إرسال أمر مزامنة التوقيت للجهاز
  const handleSyncTime = async (serialNumber) => {
    try {
      const res = await fetch(`/api/biometrics/sync-time/${encodeURIComponent(serialNumber)}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('⏳ تم إرسال أمر مزامنة التوقيت الذري للجهاز بنجاح');
      }
    } catch {
      showToast?.('❌ تعذر إرسال أمر المزامنة');
    }
  };

  // ربط PIN موظف
  const handleMapPin = async (empId, pinVal) => {
    if (!pinVal) return;
    try {
      const res = await fetch('/api/biometrics/map-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: empId,
          pin: pinVal.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ رقم البصمة للموظف بنجاح');
        fetchProfiles();
      }
    } catch {
      showToast?.('❌ تعذر حفظ رقم البصمة');
    }
  };

  // تنفيذ محاكاة بصمة
  const handleSimulatePunch = async () => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/biometrics/simulate-punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: simPin,
          actionType: simActionType,
          verifyType: simVerifyType,
          serialNumber: devices[0]?.serial_number || 'EUF7242701836'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🎉 تم إرسال بصمة محاكاة ومعالجتها لحظياً بنجاح!');
        fetchLogs();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر المحاكاة'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الاتصال: ${e.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const branches = state?.branches || [];
  const employees = state?.employees || [];

  return (
    <div
      className="card settings-card"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
        direction: 'rtl'
      }}
    >
      {/* الرأس الرئيسي للبطاقة */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '18px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              boxShadow: '0 6px 16px rgba(2, 132, 199, 0.3)',
              flexShrink: 0
            }}
          >
            📟
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', fontFamily: 'Cairo' }}>
              منظومة أجهزة بصمة الإصبع والوجه الحيوية (ZKTeco ADMS)
            </h3>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', fontWeight: 600 }}>
              ربط سحابي لحظي ومباشر للأجهزة الجدارية والمكتبية عبر بروتوكول Push Service
            </p>
          </div>
        </div>

        {/* أزرار التبويبات الداخلية */}
        <div style={{ display: 'flex', gap: '8px', background: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('devices')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'devices' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'devices' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'devices' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            🔌 الأجهزة المتصلة ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('mapping')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'mapping' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'mapping' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'mapping' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            👤 ربط أرقام الموظفين (PIN)
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('logs')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'logs' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'logs' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'logs' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            📜 السجل الحي اللحظي
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('guide')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'guide' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'guide' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'guide' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            🛠️ دليل الضبط والمحاكي
          </button>
        </div>
      </div>

      {/* ── التبويب 1: الأجهزة المتصلة ────────────────────────────────────────── */}
      {activeSubTab === 'devices' && (
        <div>
          {devices.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: '#f8fafc',
                borderRadius: '14px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>📡</div>
              <h4 style={{ margin: '0 0 6px', color: '#334155', fontWeight: 800 }}>لا توجد أجهزة متصلة مسجلة بعد</h4>
              <p style={{ margin: '0 auto 16px', maxWidth: '520px', color: '#64748b', fontSize: '0.9rem' }}>
                بمجرد تشغيل جهاز ZKTeco MB20 وضبط إعدادات الـ Cloud Server على الدومين الخاص بك، سيتم اكتشاف الجهاز وتسجيله هنا تلقائياً دون أي إدخال يدوي!
              </p>
              <button
                type="button"
                onClick={fetchDevices}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🔄 إعادة فحص الأجهزة المتصلة
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {devices.map((dev) => (
                <div
                  key={dev.serial_number}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px',
                    background: '#ffffff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.4rem' }}>📟</span>
                        <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{dev.device_name || 'ZKTeco MB20'}</strong>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#64748b', fontFamily: 'monospace' }}>
                        SN: {dev.serial_number}
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        background: dev.status === 'ONLINE' ? '#ecfdf5' : '#fef2f2',
                        color: dev.status === 'ONLINE' ? '#059669' : '#dc2626',
                        border: `1px solid ${dev.status === 'ONLINE' ? '#a7f3d0' : '#fecaca'}`
                      }}
                    >
                      {dev.status === 'ONLINE' ? '🟢 متصل (Online)' : '🔴 غير متصل'}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px', lineHeight: '1.8' }}>
                    <div>🌐 <strong>الـ IP:</strong> {dev.ip_address || 'غير محدد'}</div>
                    <div>📡 <strong>البروتوكول:</strong> {dev.protocol || 'ADMS'}</div>
                    <div>⏱️ <strong>آخر نبض:</strong> {dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleTimeString('ar-EG') : 'الآن'}</div>
                  </div>

                  {/* تحديد الفرع التابع له الجهاز */}
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      🏥 الفرع المخصص لهذا الجهاز:
                    </label>
                    <select
                      value={dev.branch_id || ''}
                      onChange={(e) => handleAssignBranch(dev.serial_number, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontFamily: 'Cairo',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        background: '#f8fafc'
                      }}
                    >
                      <option value="">-- اختر الفرع التابع له الجهاز --</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSyncTime(dev.serial_number)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '8px',
                        background: '#f0f9ff',
                        color: '#0284c7',
                        border: '1px solid #bae6fd',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        fontFamily: 'Cairo'
                      }}
                    >
                      🕒 مزامنة التوقيت الذري
                    </button>
                    <button
                      type="button"
                      onClick={fetchDevices}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        color: '#64748b',
                        border: '1px solid #cbd5e1',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      🔄
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── التبويب 2: ربط أرقام الموظفين PIN ──────────────────────────────────── */}
      {activeSubTab === 'mapping' && (
        <div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '18px', color: '#166534', fontSize: '0.9rem' }}>
            💡 <strong>ملاحظة هامة:</strong> رقم الـ (Device PIN) هو الرقم الذي يُسجل به الموظف على شاشة ماكينة البصمة (مثلاً 107 أو 1). النظام يقوم تلقائياً بمطابقة كود الموظف أو يمكنك تحديد PIN مخصص لكل موظف هنا.
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right' }}>
                  <th style={{ padding: '12px' }}>اسم الموظف</th>
                  <th style={{ padding: '12px' }}>كود الموظف بالـ HR</th>
                  <th style={{ padding: '12px' }}>الفرع</th>
                  <th style={{ padding: '12px' }}>رقم PIN على ماكينة البصمة</th>
                  <th style={{ padding: '12px' }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => {
                  const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
                  const currentPin = prof?.device_user_pin || emp.code || emp.id || '';
                  const branchObj = branches.find(b => b.id === emp.branchId);

                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>{emp.name}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', color: '#0284c7' }}>{emp.code || '—'}</td>
                      <td style={{ padding: '12px', color: '#64748b' }}>{branchObj?.name || 'الفرع الرئيسي'}</td>
                      <td style={{ padding: '12px' }}>
                        <input
                          type="text"
                          defaultValue={currentPin}
                          id={`pin_input_${emp.id}`}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            width: '120px',
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            textAlign: 'center',
                            fontSize: '0.95rem'
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const val = document.getElementById(`pin_input_${emp.id}`)?.value;
                            handleMapPin(emp.id, val);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            background: '#0284c7',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontFamily: 'Cairo'
                          }}
                        >
                          💾 حفظ PIN
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── التبويب 3: السجل الحي اللحظي ────────────────────────────────────────── */}
      {activeSubTab === 'logs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
              🔴 تدفق الحركات اللحظية المباشرة من الأجهزة (Live Event Stream):
            </span>
            <button
              type="button"
              onClick={fetchLogs}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.82rem'
              }}
            >
              🔄 تحديث السجل
            </button>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '10px' }}>وقت البصمة</th>
                  <th style={{ padding: '10px' }}>الموظف</th>
                  <th style={{ padding: '10px' }}>رقم PIN</th>
                  <th style={{ padding: '10px' }}>النوع</th>
                  <th style={{ padding: '10px' }}>وسيلة التحقق</th>
                  <th style={{ padding: '10px' }}>سيريال الجهاز</th>
                  <th style={{ padding: '10px' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      لم تُسجل أي حركات حتى الآن. بمجرد وضع الإصبع على الجهاز ستظهر هنا بالثواني!
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                        {new Date(log.punch_time).toLocaleTimeString('ar-EG')} - {new Date(log.punch_time).toLocaleDateString('ar-EG')}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 800, color: '#0f172a' }}>
                        {log.employee_name || 'غير مربوط'}
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#0284c7' }}>{log.device_user_pin}</td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            background: log.action_type === 'check_out' ? '#fef2f2' : '#ecfdf5',
                            color: log.action_type === 'check_out' ? '#dc2626' : '#059669'
                          }}
                        >
                          {log.action_type === 'check_out' ? '🚪 انصراف' : '🟢 حضور'}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {log.verify_type === 'FACE' ? '👤 بصمة وجه' : '👆 بصمة إصبع'}
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
                        {log.device_serial}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: log.process_status === 'PROCESSED' ? '#ecfdf5' : '#fffbeb',
                            color: log.process_status === 'PROCESSED' ? '#059669' : '#d97706'
                          }}
                        >
                          {log.process_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── التبويب 4: دليل الضبط والمحاكي ────────────────────────────────────── */}
      {activeSubTab === 'guide' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* محاكي الاختبار الفوري */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 800 }}>
              🧪 محاكي البصمة الفوري (Instant Hardware Simulator)
            </h4>
            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#64748b' }}>
              اختبر وصول البصمة فوراً ومعاينتها على شاشة الكشك وتحديث الحضور اللحظي في قاعدة البيانات:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  رقم PIN الموظف:
                </label>
                <input
                  type="text"
                  value={simPin}
                  onChange={(e) => setSimPin(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    fontFamily: 'monospace'
                  }}
                  placeholder="مثال: 107"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  وسيلة التحقق:
                </label>
                <select
                  value={simVerifyType}
                  onChange={(e) => setSimVerifyType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'Cairo',
                    fontWeight: 700
                  }}
                >
                  <option value="FINGERPRINT">👆 بصمة الإصبع (Fingerprint VX10)</option>
                  <option value="FACE">👤 بصمة الوجه (Face VX7)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  نوع الحركة:
                </label>
                <select
                  value={simActionType}
                  onChange={(e) => setSimActionType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'Cairo',
                    fontWeight: 700
                  }}
                >
                  <option value="check_in">🟢 تسجيل حضور (Check-In)</option>
                  <option value="check_out">🚪 تسجيل انصراف (Check-Out)</option>
                </select>
              </div>

              <button
                type="button"
                disabled={isSimulating}
                onClick={handleSimulatePunch}
                style={{
                  marginTop: '6px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: isSimulating ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: isSimulating ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                  fontFamily: 'Cairo'
                }}
              >
                {isSimulating ? '⏳ جاري الإرسال...' : '🚀 إرسال بصمة محاكاة الآن'}
              </button>
            </div>
          </div>

          {/* خطوات ضبط الجهاز الميدانية */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 800 }}>
              📋 خطوات التأكيد على شاشة ZKTeco MB20:
            </h4>
            <ol style={{ paddingRight: '20px', margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: '2' }}>
              <li>
                <strong>شاشة Ethernet:</strong> تأكد أن <code>DHCP: ON</code> لضمان أخذ IP متصل بالإنترنت من راوتر الفرع.
              </li>
              <li>
                <strong>شاشة Cloud Server Setting:</strong>
                <ul style={{ paddingRight: '18px' }}>
                  <li><code>Server Mode:</code> <strong>ADMS</strong></li>
                  <li><code>Enable Domain Name:</code> <strong>ON</strong></li>
                  <li><code>Server Address:</code> <strong>63-183-147-199.sslip.io</strong></li>
                  <li><code>Server Port:</code> <strong>5000</strong> (أو 443 بحسب منفذ الـ Reverse Proxy)</li>
                  <li><code>HTTPS:</code> <strong>OFF</strong> (أو ON إذا كان الـ SSL يعمل على المنفذ)</li>
                </ul>
              </li>
              <li>
                <strong>اختبار الاتصال:</strong> بمجرد الحفظ، ستظهر أيقونة السحابة ☁️ على شاشة الماكينة وسيظهر السيريال <code>EUF7242701836</code> متصلاً بلون أخضر في تبويب "الأجهزة المتصلة" أعلاه!
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
