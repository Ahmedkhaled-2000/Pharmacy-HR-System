import React, { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../../utils/socketClient';

export default function BiometricDevicesCard({ state, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('devices'); // 'devices' | 'mapping' | 'logs' | 'guide'
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // نصوص وأوضاع النوافذ المنبثقة (Modals)
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceSerial, setNewDeviceSerial] = useState('');
  const [newDeviceBranchId, setNewDeviceBranchId] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('MB20');
  const [newDeviceIp, setNewDeviceIp] = useState('');

  const [selectedDeviceForManage, setSelectedDeviceForManage] = useState(null);
  const [editDeviceName, setEditDeviceName] = useState('');
  const [editDeviceBranchId, setEditDeviceBranchId] = useState('');
  const [isPushingUsers, setIsPushingUsers] = useState(false);
  const [pushScope, setPushScope] = useState('branch'); // 'branch' | 'all'

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

      const onPunch = () => {
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

  const branches = state?.branches || [];
  const employees = state?.employees || [];

  // إضافة جهاز بصمة جديد يدوياً
  const handleAddNewDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceSerial.trim()) {
      showToast?.('⚠️ يرجى إدخال الرقم التسلسلي للجهاز (Serial Number)');
      return;
    }

    try {
      const branchObj = branches.find(b => String(b.id) === String(newDeviceBranchId));
      const res = await fetch('/api/biometrics/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: newDeviceName.trim() || `جهاز بصمة ZKTeco (${newDeviceSerial.trim()})`,
          serialNumber: newDeviceSerial.trim(),
          branchId: newDeviceBranchId || null,
          branchName: branchObj?.name || null,
          ipAddress: newDeviceIp.trim() || null,
          deviceType: newDeviceType
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تسجيل جهاز البصمة الجديد بنجاح');
        setShowAddDeviceModal(false);
        setNewDeviceName('');
        setNewDeviceSerial('');
        setNewDeviceBranchId('');
        setNewDeviceIp('');
        fetchDevices();
      } else {
        showToast?.(`❌ خطأ: ${data.error || 'تعذر إضافة الجهاز'}`);
      }
    } catch (err) {
      showToast?.(`❌ فشل الاتصال: ${err.message}`);
    }
  };

  // فتح نافذة إدارة وتعديل إعدادات الجهاز
  const openManageModal = (dev) => {
    setSelectedDeviceForManage(dev);
    setEditDeviceName(dev.device_name || '');
    setEditDeviceBranchId(dev.branch_id || '');
  };

  // حفظ تعديلات الجهاز
  const handleSaveDeviceSettings = async () => {
    if (!selectedDeviceForManage) return;
    try {
      const branchObj = branches.find(b => String(b.id) === String(editDeviceBranchId));
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(selectedDeviceForManage.serial_number)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: editDeviceName.trim(),
          branchId: editDeviceBranchId,
          branchName: branchObj?.name || ''
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تحديث بيانات وإعدادات الجهاز بنجاح');
        setSelectedDeviceForManage(null);
        fetchDevices();
      }
    } catch {
      showToast?.('❌ تعذر حفظ إعدادات الجهاز');
    }
  };

  // حذف جهاز
  const handleDeleteDevice = async (serialNumber) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف جهاز البصمة (${serialNumber})؟`)) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🗑️ تم حذف الجهاز بنجاح');
        setSelectedDeviceForManage(null);
        fetchDevices();
      }
    } catch {
      showToast?.('❌ تعذر حذف الجهاز');
    }
  };

  // ترحيل بيانات وأسماء الموظفين للجهاز
  const handlePushUsersToDevice = async (serialNumber, scope = 'branch') => {
    setIsPushingUsers(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}/push-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allBranchUsers: scope === 'branch'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🎉 ${data.message} (خلال ثوانٍ سيسحبها الجهاز تلقائياً)`);
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر الترحيل'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الترحيل: ${e.message}`);
    } finally {
      setIsPushingUsers(false);
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

  // إعادة تشغيل الجهاز عن بُعد
  const handleRebootDevice = async (serialNumber) => {
    if (!window.confirm(`هل ترغب في إرسال أمر إعادة تشغيل (Reboot) لجهاز البصمة (${serialNumber})؟`)) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}/reboot`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🔄 تم إرسال أمر إعادة التشغيل للجهاز');
      }
    } catch {
      showToast?.('❌ تعذر إرسال أمر إعادة التشغيل');
    }
  };

  // مسح سجلات الحركات القديمة من الجهاز
  const handleClearDeviceLogs = async (serialNumber) => {
    if (!window.confirm(`تنبيه: سيتم مسح سجل الحركات من ذاكرة جهاز البصمة الداخلي. هل تود المتابعة؟`)) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}/clear-log`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🧹 تم إرسال أمر تفريغ الذاكرة للماكينة');
      }
    } catch {
      showToast?.('❌ تعذر إرسال الأمر');
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
        <div style={{ display: 'flex', gap: '8px', background: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
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
            📖 دليل التشغيل والمحاكي
          </button>
        </div>
      </div>

      {/* ── التبويب 1: الأجهزة المتصلة ────────────────────────────────────────── */}
      {activeSubTab === 'devices' && (
        <div>
          {/* شريط الإجراءات: إضافة جهاز جديد وتحديث */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontWeight: 800, color: '#334155', fontSize: '0.95rem' }}>
              قائمة أجهزة البصمة المربوطة بالسحابة:
            </span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowAddDeviceModal(true)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Cairo',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                }}
              >
                <span>➕</span> إضافة جهاز بصمة جديد
              </button>
              <button
                type="button"
                onClick={fetchDevices}
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔄</span> تحديث
              </button>
            </div>
          </div>

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
                بمجرد تشغيل جهاز ZKTeco MB20 وضبط إعدادات الـ Cloud Server على الدومين الخاص بك، سيتم اكتشاف الجهاز وتسجيله هنا تلقائياً، أو يمكنك إضافته يدوياً بالضغط على زر "إضافة جهاز بصمة جديد".
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
              {devices.map((dev) => {
                const devBranch = branches.find(b => String(b.id) === String(dev.branch_id));
                const branchNameDisplay = devBranch?.name || dev.branch_name || 'غير محدد';

                const lastHbTime = dev.last_heartbeat ? new Date(dev.last_heartbeat).getTime() : 0;
                const isDevOnline = dev.status === 'ONLINE' && (Date.now() - lastHbTime < 150000);

                return (
                  <div
                    key={dev.serial_number}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '18px',
                      background: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
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
                            background: isDevOnline ? '#ecfdf5' : '#fef2f2',
                            color: isDevOnline ? '#059669' : '#dc2626',
                            border: `1px solid ${isDevOnline ? '#a7f3d0' : '#fecaca'}`
                          }}
                        >
                          {isDevOnline ? '🟢 متصل (Online)' : '🔴 غير متصل (Offline)'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px', lineHeight: '1.8', background: '#f8fafc', padding: '10px 12px', borderRadius: '10px' }}>
                        <div>🏥 <strong>الفرع التابع له:</strong> <span style={{ color: '#0284c7', fontWeight: 800 }}>{branchNameDisplay}</span></div>
                        <div>🌐 <strong>عنوان الـ IP:</strong> {dev.ip_address || '127.0.0.1'}</div>
                        <div>📡 <strong>البروتوكول:</strong> {dev.protocol || 'ADMS'} ({dev.device_type || 'MB20'})</div>
                        <div>⏱️ <strong>آخر نبض (Heartbeat):</strong> {dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleTimeString('ar-EG') : 'غير متوفر'}</div>

                        {!isDevOnline && (
                          <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309', fontSize: '0.78rem', fontWeight: 700, lineHeight: '1.6' }}>
                            ⚠️ الماكينة غير متصلة بالسحابة حالياً. اضبط إعداد Cloud Server في الماكينة على IP السيرفر: <strong style={{ color: '#0369a1' }}>63.183.147.199</strong> مع إغلاق البروكسي (Proxy OFF).
                          </div>
                        )}
                      </div>
                    </div>

                    {/* أزرار الإجراءات على بطاقة الجهاز */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          disabled={isPushingUsers}
                          onClick={() => handlePushUsersToDevice(dev.serial_number, 'branch')}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            cursor: isPushingUsers ? 'not-allowed' : 'pointer',
                            fontFamily: 'Cairo',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          📤 ترحيل أسماء موظفي الفرع للجهاز
                        </button>
                        <button
                          type="button"
                          onClick={() => openManageModal(dev)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            fontFamily: 'Cairo'
                          }}
                        >
                          ⚙️ إعدادات الجهاز
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSyncTime(dev.serial_number)}
                        style={{
                          width: '100%',
                          padding: '7px',
                          borderRadius: '8px',
                          background: '#f0f9ff',
                          color: '#0284c7',
                          border: '1px solid #bae6fd',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontFamily: 'Cairo'
                        }}
                      >
                        🕒 مزامنة التوقيت الذري مع السيرفر
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── التبويب 2: ربط أرقام الموظفين PIN ──────────────────────────────────── */}
      {activeSubTab === 'mapping' && (
        <div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '18px', color: '#166534', fontSize: '0.9rem' }}>
            💡 <strong>ملاحظة هامة:</strong> رقم الـ (Device PIN) هو المعرّف الرقمي للموظف على ماكينة البصمة. النظام يربطه تلقائياً بكود الموظف، وبإمكانك هنا تعديله أو تخصيصه لكل موظف بنقرة واحدة، ثم الضغط على زر الترحيل لكي تظهر أسماؤهم على شاشة الماكينة LCD.
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

      {/* ── التبويب 4: دليل التشغيل الشامل والمحاكي ────────────────────────────── */}
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

          {/* الدليل العملي الكامل خطوة بخطوة */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
            <h4 style={{ margin: '0 0 8px', color: '#0f172a', fontWeight: 800 }}>
              📘 الدليل التشغيلي: من إضافة الجهاز إلى تسجيل البصمة الحية:
            </h4>
            
            <div style={{ fontSize: '0.86rem', color: '#334155', lineHeight: '1.9' }}>
              <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#0284c7' }}>
                1️⃣ ترحيل أسماء الموظفين لجهاز البصمة (لتظهر أسماؤهم على الشاشة LCD):
              </p>
              <ul style={{ paddingRight: '18px', margin: '0 0 12px' }}>
                <li>اضغط على زر <strong>"📤 ترحيل أسماء موظفي الفرع للجهاز"</strong> في بطاقة الجهاز.</li>
                <li>خلال ثوانٍ، يقوم السيرفر بإرسال أمر <code>DATA UPDATE USER</code> للجهاز.</li>
                <li>عندما يبصم الموظف، سيظهر اسمه بالكامل على شاشة الجهاز بالصوت والصورة!</li>
              </ul>

              <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#059669' }}>
                2️⃣ تسجيل بصمة الإصبع أو الوجه للموظف على الجهاز (Enrollment):
              </p>
              <ul style={{ paddingRight: '18px', margin: '0 0 12px' }}>
                <li>اضغط مطولاً على زر <strong>M/OK</strong> في ماكينة البصمة لفتح القائمة.</li>
                <li>ادخل إلى <strong>User Mgt (إدارة المستخدمين)</strong> ➔ <strong>New User (مستخدم جديد)</strong>.</li>
                <li>في خانة <strong>User ID</strong>: اكتب نفس رقم الـ <strong>PIN</strong> للموظف (مثال: <code>107</code>).</li>
                <li>اختر <strong>Fingerprint (بصمة الإصبع)</strong> وضع الإصبع 3 مرات حتى تكتمل، أو اختر <strong>Face</strong> لالتقاط بصمة الوجه بالكاميرا.</li>
                <li>اضغط <strong>OK</strong> للحفظ.</li>
              </ul>

              <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#d97706' }}>
                3️⃣ التجربة الحية على أرض الواقع:
              </p>
              <ul style={{ paddingRight: '18px', margin: 0 }}>
                <li>ضع إصبعك على مستشعر الجهاز.</li>
                <li>ستقول الماكينة: <em>"شكراً لك (Thank you)"</em>.</li>
                <li>في نفس اللحظة، ستصدر شاشة كشك الصيدلية صوتاً ترحيبياً وتظهر بطاقة الموظف، ويتحول شريط الوردية إلى اللون الأخضر، ويُسجل الحضور تلقائياً في شيت الحضور ومحرك اللائحة.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 1: نافذة إضافة جهاز بصمة جديد يدوياً ───────────────────────── */}
      {showAddDeviceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                ➕ إضافة جهاز بصمة جديد
              </h3>
              <button
                type="button"
                onClick={() => setShowAddDeviceModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewDevice} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اسم الجهاز (توصيف اختياري):
                </label>
                <input
                  type="text"
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="مثال: جهاز بصمة فرع المروة"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الرقم التسلسلي (Serial Number) <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={newDeviceSerial}
                  onChange={(e) => setNewDeviceSerial(e.target.value)}
                  placeholder="مثال: EUF7242701836"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    fontWeight: 700
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الفرع التابع له الجهاز:
                </label>
                <select
                  value={newDeviceBranchId}
                  onChange={(e) => setNewDeviceBranchId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- اختر الفرع --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  نوع وطراز الجهاز:
                </label>
                <select
                  value={newDeviceType}
                  onChange={(e) => setNewDeviceType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="MB20">ZKTeco MB20 (إصبع + وجه)</option>
                  <option value="K40">ZKTeco K40 / IN01</option>
                  <option value="SilkFP">ZKTeco SilkFP / Live20R</option>
                  <option value="Other">جهاز بصمة شبكي آخر (ADMS)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  عنوان IP المحلي بالفرع (اختياري):
                </label>
                <input
                  type="text"
                  value={newDeviceIp}
                  onChange={(e) => setNewDeviceIp(e.target.value)}
                  placeholder="مثال: 192.168.1.3"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  💾 حفظ الجهاز
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDeviceModal(false)}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: نافذة إعدادات وأوامر الجهاز المتقدمة ───────────────────────── */}
      {selectedDeviceForManage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  ⚙️ إعدادات وأوامر ماكينة البصمة
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>
                  السيريال: {selectedDeviceForManage.serial_number}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDeviceForManage(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اسم الجهاز في المنظومة:
                </label>
                <input
                  type="text"
                  value={editDeviceName}
                  onChange={(e) => setEditDeviceName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الفرع المخصص:
                </label>
                <select
                  value={editDeviceBranchId}
                  onChange={(e) => setEditDeviceBranchId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="">-- اختر الفرع --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleSaveDeviceSettings}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                💾 حفظ الاسم والفرع
              </button>
            </div>

            {/* قسم الأوامر المباشرة عن بُعد */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                🚀 أوامر التحكم الفوري عن بُعد (Remote Commands):
              </strong>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  disabled={isPushingUsers}
                  onClick={() => handlePushUsersToDevice(selectedDeviceForManage.serial_number, 'branch')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    background: '#ecfdf5',
                    color: '#059669',
                    border: '1px solid #a7f3d0',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: isPushingUsers ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📤 ترحيل موظفي الفرع
                </button>
                <button
                  type="button"
                  disabled={isPushingUsers}
                  onClick={() => handlePushUsersToDevice(selectedDeviceForManage.serial_number, 'all')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #86efac',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: isPushingUsers ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  🌐 ترحيل كل الموظفين
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSyncTime(selectedDeviceForManage.serial_number)}
                  style={{
                    padding: '9px 8px',
                    borderRadius: '8px',
                    background: '#f0f9ff',
                    color: '#0284c7',
                    border: '1px solid #bae6fd',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  🕒 مزامنة التوقيت الذري
                </button>
                <button
                  type="button"
                  onClick={() => handleRebootDevice(selectedDeviceForManage.serial_number)}
                  style={{
                    padding: '9px 8px',
                    borderRadius: '8px',
                    background: '#fffbeb',
                    color: '#d97706',
                    border: '1px solid #fde68a',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  🔄 إعادة تشغيل الماكينة
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleClearDeviceLogs(selectedDeviceForManage.serial_number)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '8px',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    border: '1px solid #fecaca',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  🧹 مسح سجلات الحركات القديمة
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteDevice(selectedDeviceForManage.serial_number)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  🗑️ حذف الجهاز
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
