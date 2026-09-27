import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getSocket } from '../../utils/socketClient';
import { exportBiometricPunchesExcel, deduplicatePunches } from '../../utils/biometricExcelExporter';

export default function BiometricDevicesCard({ state, showToast }) {
  const [activeSubTab, setActiveSubTab] = useState('devices'); // 'devices' | 'deviceUsers' | 'excelExport' | 'dispatch' | 'multiBranch' | 'hqEnroll' | 'whatsappAlerts' | 'mapping' | 'logs' | 'guide'
  const [devices, setDevices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // مستكشف مستخدمي الأجهزة الفعليين
  const [selectedDeviceSnForUsers, setSelectedDeviceSnForUsers] = useState('');
  const [deviceUsers, setDeviceUsers] = useState([]);
  const [isLoadingDeviceUsers, setIsLoadingDeviceUsers] = useState(false);
  const [editingDeviceUser, setEditingDeviceUser] = useState(null);

  // محرك الإكسيل الذكي المانع للتكرار
  const [excelEmpId, setExcelEmpId] = useState('ALL');
  const [excelBranchId, setExcelBranchId] = useState('ALL');
  const [excelDateFrom, setExcelDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [excelDateTo, setExcelDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [excelPunchType, setExcelPunchType] = useState('ALL'); // 'ALL' | 'check_in' | 'check_out'
  const [excelDedupEnabled, setExcelDedupEnabled] = useState(true);
  const [excelDedupMinutes, setExcelDedupMinutes] = useState(5);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // أكواد الفروع المتعددة للموظف (Multi-Branch Multi-PIN)
  const [branchPins, setBranchPins] = useState([]);
  const [newBranchPinEmpId, setNewBranchPinEmpId] = useState('');
  const [newBranchPinBranchId, setNewBranchPinBranchId] = useState('');
  const [newBranchPinVal, setNewBranchPinVal] = useState('');
  const [newBranchPinAutoDispatch, setNewBranchPinAutoDispatch] = useState(true);
  const [isSavingBranchPin, setIsSavingBranchPin] = useState(false);

  // إعدادات إشعارات واتساب للإدارة العليا
  const [waConfig, setWaConfig] = useState({
    enabled: true,
    notifyCheckIn: true,
    notifyCheckOut: true,
    recipientPhones: []
  });
  const [newWaPhone, setNewWaPhone] = useState('');
  const [isSavingWaConfig, setIsSavingWaConfig] = useState(false);
  const [isTestingWa, setIsTestingWa] = useState(false);

  // حالة مركز الترحيل والتوزيع بين الفروع (Cross-Branch Dispatcher)
  const [selectedDispatchEmps, setSelectedDispatchEmps] = useState([]);
  const [dispatchTargetDevice, setDispatchTargetDevice] = useState('');
  const [dispatchIncludeBiometrics, setDispatchIncludeBiometrics] = useState(true);
  const [dispatchFilterBranch, setDispatchFilterBranch] = useState('ALL');
  const [dispatchSearchTerm, setDispatchSearchTerm] = useState('');
  const [dispatchFilterBioStatus, setDispatchFilterBioStatus] = useState('ALL'); // 'ALL' | 'HAS_TEMPLATE' | 'NO_TEMPLATE'
  const [isDispatching, setIsDispatching] = useState(false);

  // حالة التسجيل المركزي من الإدارة (HQ Enrollment Wizard)
  const [hqEmpId, setHqEmpId] = useState('');
  const [hqDevSerial, setHqDevSerial] = useState('');
  const [isHqSubmitting, setIsHqSubmitting] = useState(false);

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

  // جلب قوالب البصمات الحيوية المحفوظة في الخزنة السحابية
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/templates');
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.warn('Error fetching biometric templates:', e.message);
    }
  }, []);

  // جلب سجلات الترحيل والتوزيع السابقة
  const fetchDispatchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/dispatch-logs?limit=30');
      const data = await res.json();
      if (data.success) {
        setDispatchLogs(data.logs || []);
      }
    } catch (e) {
      console.warn('Error fetching dispatch logs:', e.message);
    }
  }, []);

  // جلب مستخدمي جهاز محدد من الذاكرة
  const fetchDeviceUsers = useCallback(async (sn) => {
    if (!sn) return;
    setIsLoadingDeviceUsers(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${sn}/users`);
      const data = await res.json();
      if (data.success) {
        setDeviceUsers(data.users || []);
      }
    } catch (e) {
      console.warn('Error fetching device users:', e.message);
    } finally {
      setIsLoadingDeviceUsers(false);
    }
  }, []);

  // جلب أكواد الفروع المتعددة
  const fetchBranchPins = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/branch-pins');
      const data = await res.json();
      if (data.success) {
        setBranchPins(data.branchPins || []);
      }
    } catch (e) {
      console.warn('Error fetching branch pins:', e.message);
    }
  }, []);

  // جلب إعدادات إشعارات واتساب
  const fetchWaConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/whatsapp-config');
      const data = await res.json();
      if (data.success && data.config) {
        setWaConfig(data.config);
      }
    } catch (e) {
      console.warn('Error fetching WhatsApp config:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchLogs();
    fetchProfiles();
    fetchTemplates();
    fetchDispatchLogs();
    fetchBranchPins();
    fetchWaConfig();

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

      const onTemplateVaulted = (data) => {
        showToast?.(`🧬 تم التقاط قالب بصمة حيوية للموظف (${data.employeeName || data.pin}) وحفظه في السحابة بنجاح!`);
        fetchTemplates();
        fetchProfiles();
      };

      const onCmdAck = (data) => {
        if (data && data.status) {
          fetchDispatchLogs();
        }
      };

      const onDeviceUsersUpdated = (data) => {
        if (data?.serialNumber) {
          fetchDeviceUsers(data.serialNumber);
          showToast?.(`👥 تم تحديث قائمة مستخدمي الجهاز (${data.serialNumber}) من الذاكرة بنجاح!`);
        }
      };

      socket.on('biometric:device_status', onStatus);
      socket.on('punch:recorded', onPunch);
      socket.on('biometric:template_vaulted', onTemplateVaulted);
      socket.on('biometric:command_ack', onCmdAck);
      socket.on('biometric:device_users_updated', onDeviceUsersUpdated);

      return () => {
        socket.off('biometric:device_status', onStatus);
        socket.off('punch:recorded', onPunch);
        socket.off('biometric:template_vaulted', onTemplateVaulted);
        socket.off('biometric:command_ack', onCmdAck);
        socket.off('biometric:device_users_updated', onDeviceUsersUpdated);
      };
    }
  }, [fetchDevices, fetchLogs, fetchProfiles, fetchTemplates, fetchDispatchLogs, fetchBranchPins, fetchWaConfig, fetchDeviceUsers, showToast]);

  useEffect(() => {
    if (!selectedDeviceSnForUsers && devices.length > 0) {
      setSelectedDeviceSnForUsers(devices[0].serial_number);
    }
  }, [devices, selectedDeviceSnForUsers]);

  useEffect(() => {
    if (selectedDeviceSnForUsers) {
      fetchDeviceUsers(selectedDeviceSnForUsers);
    }
  }, [selectedDeviceSnForUsers, fetchDeviceUsers]);

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

  // سحب قوالب البصمات من الماكينة إلى الخزنة السحابية
  const handlePullTemplates = async (serialNumber) => {
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(serialNumber)}/pull-templates`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`📥 ${data.message}`);
      } else {
        showToast?.(`⚠️ ${data.error || 'تعذر إرسال الأمر'}`);
      }
    } catch {
      showToast?.('❌ فشل إرسال أمر سحب القوالب');
    }
  };

  // ترحيل وتوزيع الموظفين وقوالب بصماتهم للأجهزة المستهدفة
  const handleDispatchEmployees = async (overrideEmpIds = null, overrideTargetDev = null) => {
    const targetEmps = overrideEmpIds || selectedDispatchEmps;
    const targetDev = overrideTargetDev || dispatchTargetDevice;

    if (!targetEmps || targetEmps.length === 0) {
      showToast?.('⚠️ يرجى تحديد موظف واحد على الأقل للترحيل');
      return;
    }
    if (!targetDev) {
      showToast?.('⚠️ يرجى اختيار جهاز البصمة المستهدف');
      return;
    }

    setIsDispatching(true);
    try {
      const res = await fetch('/api/biometrics/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeIds: targetEmps,
          targetDeviceSerials: [targetDev],
          includeBiometrics: dispatchIncludeBiometrics
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🎉 ${data.message}`);
        setSelectedDispatchEmps([]);
        fetchDispatchLogs();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر الترحيل'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الترحيل: ${e.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  // تسجيل بصمة موظف من الإدارة المركزية
  const handleHqEnroll = async () => {
    if (!hqEmpId) {
      showToast?.('⚠️ يرجى اختيار الموظف أولاً');
      return;
    }
    if (!hqDevSerial) {
      showToast?.('⚠️ يرجى اختيار ماكينة الإدارة');
      return;
    }

    setIsHqSubmitting(true);
    try {
      const res = await fetch('/api/biometrics/hq-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: hqEmpId,
          hqDeviceSerial: hqDevSerial
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`✨ ${data.message}`);
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر إرسال الموظف'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الإرسال: ${e.message}`);
    } finally {
      setIsHqSubmitting(false);
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

  // ── وظائف مستكشف مستخدمي الجهاز والتحكم بالذاكرة ─────────────────────────
  const handleSyncDeviceUsers = async () => {
    if (!selectedDeviceSnForUsers) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.('🔄 تم إرسال أمر فحص ذاكرة الجهاز، ستظهر الأسماء فور استقبالها!');
      }
    } catch {
      showToast?.('❌ تعذر إرسال أمر الفحص');
    }
  };

  const handleSaveDeviceUserEdit = async (e) => {
    e.preventDefault();
    if (!editingDeviceUser || !selectedDeviceSnForUsers) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDeviceUser)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم إرسال أمر تحديث المستخدم للجهاز');
        setEditingDeviceUser(null);
        fetchDeviceUsers(selectedDeviceSnForUsers);
      } else {
        showToast?.(`⚠️ ${data.error || 'فشل التحديث'}`);
      }
    } catch (err) {
      showToast?.(`❌ فشل التحديث: ${err.message}`);
    }
  };

  const handleDeleteDeviceUser = async (pin) => {
    if (!confirm(`هل أنت متأكد من مسح المستخدم برقم PIN (${pin}) من ذاكرة الماكينة؟`)) return;
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🗑️ ${data.message}`);
        fetchDeviceUsers(selectedDeviceSnForUsers);
      }
    } catch {
      showToast?.('❌ تعذر مسح المستخدم');
    }
  };

  const handleToggleDeviceUserActive = async (pin, currentActive) => {
    const nextActive = !currentActive;
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, isActive: nextActive })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(data.message);
        fetchDeviceUsers(selectedDeviceSnForUsers);
      }
    } catch {
      showToast?.('❌ تعذر تغيير حالة البصمة');
    }
  };

  // ── وظائف أكواد الفروع المتعددة للموظف ──────────────────────────────────────
  const handleSaveBranchPin = async (e) => {
    e.preventDefault();
    if (!newBranchPinEmpId || !newBranchPinBranchId || !newBranchPinVal.trim()) {
      showToast?.('⚠️ يرجى ملء كافة بيانات كود الفرع');
      return;
    }
    setIsSavingBranchPin(true);
    try {
      const res = await fetch('/api/biometrics/branch-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: newBranchPinEmpId,
          branchId: newBranchPinBranchId,
          deviceUserPin: newBranchPinVal.trim(),
          autoDispatch: newBranchPinAutoDispatch
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🎉 ${data.message}`);
        setNewBranchPinVal('');
        fetchBranchPins();
      } else {
        showToast?.(`⚠️ ${data.error || 'فشل الحفظ'}`);
      }
    } catch (err) {
      showToast?.(`❌ فشل الحفظ: ${err.message}`);
    } finally {
      setIsSavingBranchPin(false);
    }
  };

  const handleDeleteBranchPin = async (id) => {
    if (!confirm('هل أنت متأكد من حذف كود هذا الفرع للموظف؟')) return;
    try {
      const res = await fetch(`/api/biometrics/branch-pins/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast?.('🗑️ تم حذف كود الفرع بنجاح');
        fetchBranchPins();
      }
    } catch {
      showToast?.('❌ تعذر حذف كود الفرع');
    }
  };

  // ── وظائف إشعارات واتساب للإدارة العليا ─────────────────────────────────────
  const handleSaveWaConfig = async () => {
    setIsSavingWaConfig(true);
    try {
      const res = await fetch('/api/biometrics/whatsapp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: waConfig })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ إعدادات إشعارات واتساب للإدارة بنجاح');
      }
    } catch {
      showToast?.('❌ تعذر حفظ إعدادات واتساب');
    } finally {
      setIsSavingWaConfig(false);
    }
  };

  const handleTestWaAlert = async (testPhone) => {
    setIsTestingWa(true);
    try {
      const res = await fetch('/api/biometrics/whatsapp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testPhone: testPhone || (waConfig.recipientPhones?.[0] || '') })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('📲 تم إرسال إشعار تجريبي فوري بنجاح، تحقق من تطبيق واتساب!');
      } else {
        showToast?.(`⚠️ ${data.error || 'فشل الإرسال التجريبي'}`);
      }
    } catch (err) {
      showToast?.(`❌ تعذر الإرسال: ${err.message}`);
    } finally {
      setIsTestingWa(false);
    }
  };

  // ── تصدير إكسيل الاحترافي المانع للتكرار ────────────────────────────────────
  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const raw = logs || [];
      const filtered = raw.filter(p => {
        const pDate = p.punch_time ? p.punch_time.slice(0, 10) : (p.date || '');
        if (excelDateFrom && pDate < excelDateFrom) return false;
        if (excelDateTo && pDate > excelDateTo) return false;
        if (excelEmpId !== 'ALL' && String(p.employee_id || p.employeeId) !== String(excelEmpId)) return false;
        if (excelBranchId !== 'ALL' && String(p.branch_id || p.branchId) !== String(excelBranchId)) return false;
        if (excelPunchType !== 'ALL' && String(p.action_type || p.actionType) !== excelPunchType) return false;
        return true;
      });

      const bObj = branches.find(b => String(b.id) === String(excelBranchId));
      const eObj = employees.find(e => String(e.id) === String(excelEmpId));

      await exportBiometricPunchesExcel({
        punches: filtered,
        companyName: state?.orgSettings?.orgName || 'مجموعة صيدليات المروة والدكتور سيف',
        branchName: bObj?.name || 'كافة الفروع',
        filterEmployeeName: eObj?.name || 'كافة الكوادر',
        showToast,
        enableDeduplication: excelDedupEnabled,
        dedupMinutes: excelDedupMinutes
      });
    } catch (err) {
      showToast?.(`❌ تعذر تصدير الإكسيل: ${err.message}`);
    } finally {
      setIsExportingExcel(false);
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
        <div style={{ display: 'flex', gap: '8px', background: '#f8fafc', padding: '6px', borderRadius: '14px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
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
            🔌 الأجهزة ({devices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('deviceUsers')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'deviceUsers' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'deviceUsers' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'deviceUsers' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            👥 مستخدمو الماكينة والذاكرة ({deviceUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('excelExport')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'excelExport' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'excelExport' ? '#0d9488' : '#64748b',
              boxShadow: activeSubTab === 'excelExport' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            📊 تصدير إكسيل الاحترافي
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatch')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'dispatch' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'dispatch' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'dispatch' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            🌐 ترحيل وتوزيع البصمات
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('multiBranch')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'multiBranch' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'multiBranch' ? '#7c3aed' : '#64748b',
              boxShadow: activeSubTab === 'multiBranch' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            🏢 أكواد الفروع المتعددة ({branchPins.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('hqEnroll')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'hqEnroll' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'hqEnroll' ? '#0284c7' : '#64748b',
              boxShadow: activeSubTab === 'hqEnroll' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            🏢 التسجيل المركزي بالإدارة
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('whatsappAlerts')}
            style={{
              padding: '8px 16px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.88rem',
              fontFamily: 'Cairo',
              background: activeSubTab === 'whatsappAlerts' ? '#ffffff' : 'transparent',
              color: activeSubTab === 'whatsappAlerts' ? '#16a34a' : '#64748b',
              boxShadow: activeSubTab === 'whatsappAlerts' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            💬 إشعارات واتساب الإدارة
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
            📜 السجل الحي ({logs.length})
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

      {/* ── التبويب الجديد 1: مركز ترحيل وتوزيع البصمات عبر الفروع (Enterprise Dispatcher) ── */}
      {activeSubTab === 'dispatch' && (
        <div>
          {/* شريط الإحصائيات السريعة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>👥</span>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>إجمالي الموظفين</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{employees.length}</div>
              </div>
            </div>

            <div style={{ background: '#f0fdf4', padding: '14px 18px', borderRadius: '12px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>🧬</span>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>قوالب بيومترية بالسحابة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>{templates.length}</div>
              </div>
            </div>

            <div style={{ background: '#f0f9ff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>📟</span>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: 600 }}>أجهزة البصمة المتاحة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>{devices.length}</div>
              </div>
            </div>

            <div style={{ background: '#faf5ff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>🚀</span>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#7e22ce', fontWeight: 600 }}>عمليات الترحيل المنفذة</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea' }}>{dispatchLogs.length}</div>
              </div>
            </div>
          </div>

          {/* شريط الفلاتر والبحث */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center', background: '#ffffff', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <input
                type="text"
                placeholder="🔍 بحث باسم الموظف أو الكود..."
                value={dispatchSearchTerm}
                onChange={(e) => setDispatchSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  fontFamily: 'Cairo'
                }}
              />
            </div>

            <div>
              <select
                value={dispatchFilterBranch}
                onChange={(e) => setDispatchFilterBranch(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  fontFamily: 'Cairo',
                  background: '#f8fafc',
                  color: '#334155'
                }}
              >
                <option value="ALL">🏢 كل الفروع</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={dispatchFilterBioStatus}
                onChange={(e) => setDispatchFilterBioStatus(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  fontFamily: 'Cairo',
                  background: '#f8fafc',
                  color: '#334155'
                }}
              >
                <option value="ALL">🧬 كل حالات البصمة</option>
                <option value="HAS_TEMPLATE">🟢 مسجل له قالب بيومتري بالسحابة</option>
                <option value="NO_TEMPLATE">⚪ غير مسجل له قالب بعد</option>
              </select>
            </div>
          </div>

          {/* شريط الإجراء الجماعي التفاعلي (Sticky Batch Action Bar) */}
          <div
            style={{
              background: selectedDispatchEmps.length > 0 ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' : '#f8fafc',
              color: selectedDispatchEmps.length > 0 ? '#ffffff' : '#64748b',
              padding: '14px 18px',
              borderRadius: '14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              border: '1px solid ' + (selectedDispatchEmps.length > 0 ? '#0f172a' : '#e2e8f0'),
              boxShadow: selectedDispatchEmps.length > 0 ? '0 10px 25px rgba(15, 23, 42, 0.2)' : 'none',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{selectedDispatchEmps.length > 0 ? '🎯' : '💡'}</span>
              <div>
                <strong>
                  {selectedDispatchEmps.length > 0
                    ? `تم تحديد ${selectedDispatchEmps.length} موظف للترحيل`
                    : 'حدد الموظفين المراد ترحيلهم لأي جهاز فرع آخر'}
                </strong>
                <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
                  يمكن ترحيل أي موظف إلى ماكينة أي فرع بضغطة زر واحدة مع قالبه البيومتري الكامل
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={dispatchTargetDevice}
                onChange={(e) => setDispatchTargetDevice(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  fontFamily: 'Cairo',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontWeight: 700
                }}
              >
                <option value="">-- اختر ماكينة البصمة المستهدفة --</option>
                {devices.map(d => (
                  <option key={d.serial_number} value={d.serial_number}>
                    {d.device_name || 'MB20'} ({d.branch_name || 'بدون فرع'}) [{d.serial_number}]
                  </option>
                ))}
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={dispatchIncludeBiometrics}
                  onChange={(e) => setDispatchIncludeBiometrics(e.target.checked)}
                />
                <span>🧬 تضمين قوالب البصمة الحيوية (إصبع/وجه)</span>
              </label>

              <button
                type="button"
                disabled={isDispatching || selectedDispatchEmps.length === 0 || !dispatchTargetDevice}
                onClick={() => handleDispatchEmployees()}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  background: (selectedDispatchEmps.length === 0 || !dispatchTargetDevice)
                    ? '#94a3b8'
                    : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: (isDispatching || selectedDispatchEmps.length === 0 || !dispatchTargetDevice) ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {isDispatching ? '⏳ جاري الترحيل...' : '🚀 ترحيل الموظفين المحددين للجهاز'}
              </button>
            </div>
          </div>

          {/* جدول الموظفين وقوالبهم */}
          <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right' }}>
                  <th style={{ padding: '12px 14px', width: '40px' }}>
                    <input
                      type="checkbox"
                      checked={
                        selectedDispatchEmps.length > 0 &&
                        selectedDispatchEmps.length === employees.length
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDispatchEmps(employees.map(emp => emp.id));
                        } else {
                          setSelectedDispatchEmps([]);
                        }
                      }}
                    />
                  </th>
                  <th style={{ padding: '12px' }}>الموظف</th>
                  <th style={{ padding: '12px' }}>الفرع الحالي</th>
                  <th style={{ padding: '12px' }}>رقم PIN</th>
                  <th style={{ padding: '12px' }}>القالب البيومتري السحابي</th>
                  <th style={{ padding: '12px' }}>الإجراء المباشر</th>
                </tr>
              </thead>
              <tbody>
                {employees
                  .filter(emp => {
                    const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
                    const pin = prof?.device_user_pin || emp.code || emp.id || '';
                    const hasTemplate = templates.some(t => String(t.device_user_pin) === String(pin) || String(t.employee_id) === String(emp.id));

                    if (dispatchFilterBranch !== 'ALL' && String(emp.branchId) !== String(dispatchFilterBranch)) {
                      return false;
                    }
                    if (dispatchFilterBioStatus === 'HAS_TEMPLATE' && !hasTemplate) return false;
                    if (dispatchFilterBioStatus === 'NO_TEMPLATE' && hasTemplate) return false;

                    if (dispatchSearchTerm.trim()) {
                      const term = dispatchSearchTerm.toLowerCase();
                      const matchName = (emp.name || '').toLowerCase().includes(term);
                      const matchCode = (emp.code || '').toLowerCase().includes(term);
                      const matchPin = String(pin).includes(term);
                      return matchName || matchCode || matchPin;
                    }
                    return true;
                  })
                  .map(emp => {
                    const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
                    const pin = prof?.device_user_pin || emp.code || emp.id || '';
                    const branchObj = branches.find(b => String(b.id) === String(emp.branchId));
                    const empTemplates = templates.filter(t => String(t.device_user_pin) === String(pin) || String(t.employee_id) === String(emp.id));
                    const isSelected = selectedDispatchEmps.includes(emp.id);

                    return (
                      <tr
                        key={emp.id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isSelected ? '#f0fdf4' : 'transparent',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDispatchEmps(prev => [...prev, emp.id]);
                              } else {
                                setSelectedDispatchEmps(prev => prev.filter(id => id !== emp.id));
                              }
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px' }}>
                          <strong style={{ color: '#0f172a' }}>{emp.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>كود: {emp.code || '—'} {emp.role ? `• ${emp.role}` : ''}</div>
                        </td>
                        <td style={{ padding: '12px', color: '#475569' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '6px', background: '#f1f5f9', fontSize: '0.8rem' }}>
                            {branchObj?.name || 'الفرع الرئيسي'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 800, color: '#0284c7' }}>
                          {pin}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {empTemplates.length > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {empTemplates.map(t => (
                                <span
                                  key={t.id}
                                  title={`المصدر: ${t.source_branch_name || t.source_device_sn || 'الإدارة'} • ${new Date(t.updated_at).toLocaleDateString('ar-EG')}`}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    background: t.template_type === 'FACE' ? '#faf5ff' : '#ecfdf5',
                                    color: t.template_type === 'FACE' ? '#7e22ce' : '#059669',
                                    border: '1px solid ' + (t.template_type === 'FACE' ? '#e9d5ff' : '#a7f3d0')
                                  }}
                                >
                                  {t.template_type === 'FACE' ? '🟣 بصمة وجه' : `🟢 بصمة إصبع #${t.finger_id || 0}`}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              ⚪ لم يُسجل قالب بيومتري بعد
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              disabled={isDispatching || !dispatchTargetDevice}
                              onClick={() => handleDispatchEmployees([emp.id])}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                background: '#f0f9ff',
                                color: '#0284c7',
                                border: '1px solid #bae6fd',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: (isDispatching || !dispatchTargetDevice) ? 'not-allowed' : 'pointer',
                                fontFamily: 'Cairo'
                              }}
                            >
                              🚀 ترحيل للجهاز المختار
                            </button>
                            {empTemplates.length === 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHqEmpId(emp.id);
                                  setActiveSubTab('hqEnroll');
                                }}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  background: '#faf5ff',
                                  color: '#7e22ce',
                                  border: '1px solid #e9d5ff',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo'
                                }}
                              >
                                🏢 تسجيل بالإدارة
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* سجلات الترحيل والتوزيع السابقة */}
          {dispatchLogs.length > 0 && (
            <div style={{ marginTop: '24px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <strong style={{ fontSize: '0.9rem', color: '#334155' }}>📜 آخر عمليات الترحيل بين الفروع</strong>
                <button
                  type="button"
                  onClick={fetchDispatchLogs}
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  🔄 تحديث السجل
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'right', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '6px' }}>الموظف</th>
                      <th style={{ padding: '6px' }}>الجهاز المستهدف</th>
                      <th style={{ padding: '6px' }}>الفرع</th>
                      <th style={{ padding: '6px' }}>القوالب البيومترية</th>
                      <th style={{ padding: '6px' }}>الحالة</th>
                      <th style={{ padding: '6px' }}>الوقت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatchLogs.slice(0, 10).map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px', fontWeight: 700 }}>{log.employee_name || log.device_user_pin}</td>
                        <td style={{ padding: '6px', fontFamily: 'monospace' }}>{log.target_device_serial}</td>
                        <td style={{ padding: '6px' }}>{log.target_branch_name || '—'}</td>
                        <td style={{ padding: '6px' }}>{log.included_biometrics ? `🧬 ${log.templates_count || 1} قالب` : '📄 بيانات فقط'}</td>
                        <td style={{ padding: '6px' }}>
                          <span style={{ padding: '2px 6px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', fontWeight: 800 }}>
                            {log.status === 'QUEUED' ? '⏳ في طابور الجهاز' : '✅ تم الإرسال'}
                          </span>
                        </td>
                        <td style={{ padding: '6px', color: '#94a3b8' }}>{new Date(log.created_at).toLocaleTimeString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── التبويب الجديد 2: التسجيل المركزي بالإدارة (HQ Central Enrollment) ──── */}
      {activeSubTab === 'hqEnroll' && (
        <div>
          {/* بانر التعريف والشرح */}
          <div
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
              color: '#ffffff',
              padding: '20px 24px',
              borderRadius: '16px',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(79, 70, 229, 0.25)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' }}>
              <span style={{ fontSize: '32px' }}>🏢</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>التسجيل المركزي لبصمات الموظفين من الإدارة</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.88rem', opacity: 0.9 }}>
                  سجّل بصمة الموظف لمرة واحدة فقط في مقر الإدارة أو أي فرع رئيسي، وسيقوم النظام بالتقاط القالب وحفظه في السحابة تلقائياً لتتمكن من تعميمه على كافة الفروع بنقرة زر واحدة!
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
            {/* قسم إرسال الموظف لماكينة الإدارة */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>
                1️⃣ تحديد الموظف وماكينة الإدارة:
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    اختر الموظف المراد تسجيل بصمته:
                  </label>
                  <select
                    value={hqEmpId}
                    onChange={(e) => setHqEmpId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'Cairo'
                    }}
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees.map(emp => {
                      const branch = branches.find(b => String(b.id) === String(emp.branchId));
                      const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
                      const pin = prof?.device_user_pin || emp.code || emp.id;
                      const hasTpl = templates.some(t => String(t.device_user_pin) === String(pin) || String(t.employee_id) === String(emp.id));

                      return (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({branch?.name || 'الرئيسي'}) {hasTpl ? '✅ (بصمته مسجلة بالسحابة)' : '⚪ (جديد بدون بصمة)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    اختر ماكينة البصمة الموجودة بالإدارة:
                  </label>
                  <select
                    value={hqDevSerial}
                    onChange={(e) => setHqDevSerial(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'Cairo'
                    }}
                  >
                    <option value="">-- اختر ماكينة التسجيل --</option>
                    {devices.map(d => (
                      <option key={d.serial_number} value={d.serial_number}>
                        {d.device_name || 'MB20'} ({d.branch_name || 'الإدارة'}) [{d.serial_number}]
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={isHqSubmitting || !hqEmpId || !hqDevSerial}
                  onClick={handleHqEnroll}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    background: (!hqEmpId || !hqDevSerial)
                      ? '#94a3b8'
                      : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    cursor: (isHqSubmitting || !hqEmpId || !hqDevSerial) ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)',
                    marginTop: '6px'
                  }}
                >
                  {isHqSubmitting ? '⏳ جاري الإرسال للماكينة...' : '⚡ إرسال الموظف للماكينة للتسجيل الآن'}
                </button>
              </div>
            </div>

            {/* قسم الخطوات العملية لما بعد الإرسال */}
            <div style={{ background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>
                2️⃣ الخطوات العملية على ماكينة البصمة:
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#4f46e5', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                    1
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: '1.6' }}>
                    <strong>وضع الإصبع على الحساس:</strong><br />
                    بمجرد ضغط الزر أعلاه، تم إرسال اسم الموظف ورقم الـ PIN للماكينة. اطلب من الموظف وضع إصبعه على حساس الماكينة 3 مرات متتالية.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#059669', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                    2
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: '1.6' }}>
                    <strong>الالتقاط التلقائي بالسحابة (Auto Vault):</strong><br />
                    فور تأكيد الماكينة للبصمة، تقوم تلقائياً بضخ القالب البيومتري المشفر للسيرفر وحفظه في جدول القوالب السحابي الآمن.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0284c7', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
                    3
                  </span>
                  <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: '1.6' }}>
                    <strong>التعميم على أي فرع بضغطة زر:</strong><br />
                    ادخل على تبويب <strong>"ترحيل وتوزيع البصمات"</strong> واضغط "ترحيل للجهاز" لأي فرع ترغب فيه، وسيبصم الموظف هناك فوراً دون إعادة أخذ بصمته!
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* قائمة القوالب البيومترية المحفوظة في السحابة حالياً */}
          <div style={{ marginTop: '24px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🧬</span>
                <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>
                  خزنة القوالب البيومترية السحابية المتاحة للتعميم ({templates.length} قالب)
                </strong>
              </div>
              <button
                type="button"
                onClick={fetchTemplates}
                style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 700 }}
              >
                🔄 تحديث الخزنة
              </button>
            </div>

            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.9rem' }}>
                لا توجد قوالب بصمات ملتقطة في الخزنة السحابية بعد. عند تسجيل أي موظف على الماكينة أو الضغط على "سحب القوالب من الماكينة"، ستظهر هنا فوراً.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 12px' }}>الموظف</th>
                      <th style={{ padding: '10px 12px' }}>رقم PIN</th>
                      <th style={{ padding: '10px 12px' }}>نوع القالب</th>
                      <th style={{ padding: '10px 12px' }}>ماكينة التسجيل المصدر</th>
                      <th style={{ padding: '10px 12px' }}>تاريخ الحفظ</th>
                      <th style={{ padding: '10px 12px' }}>إجراءات التعميم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(tpl => {
                      const emp = employees.find(e => String(e.id) === String(tpl.employee_id) || String(e.code) === String(tpl.device_user_pin));
                      const empName = emp?.name || tpl.employee_name || 'موظف PIN: ' + tpl.device_user_pin;

                      return (
                        <tr key={tpl.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>{empName}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#0284c7', fontWeight: 800 }}>{tpl.device_user_pin}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '12px', background: tpl.template_type === 'FACE' ? '#faf5ff' : '#ecfdf5', color: tpl.template_type === 'FACE' ? '#7e22ce' : '#059669', fontWeight: 700, fontSize: '0.78rem' }}>
                              {tpl.template_type === 'FACE' ? '🟣 بصمة وجه' : `🟢 بصمة إصبع #${tpl.finger_id || 0}`}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {tpl.source_device_name || tpl.source_device_sn} ({tpl.source_branch_name || 'الإدارة'})
                          </td>
                          <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                            {new Date(tpl.updated_at).toLocaleString('ar-EG')}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (emp) {
                                  setSelectedDispatchEmps([emp.id]);
                                  setActiveSubTab('dispatch');
                                }
                              }}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                background: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                fontFamily: 'Cairo'
                              }}
                            >
                              🌐 تعميم على الفروع
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── التبويب: استعراض وإدارة مستخدمي الجهاز من الذاكرة ── */}
      {activeSubTab === 'deviceUsers' && (
        <div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>📟 اختر الماكينة لمعاينة المسجلين بذاكرتها:</span>
              <select
                value={selectedDeviceSnForUsers}
                onChange={(e) => setSelectedDeviceSnForUsers(e.target.value)}
                style={{
                  padding: '9px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontFamily: 'Cairo',
                  fontWeight: 700,
                  background: '#ffffff'
                }}
              >
                {devices.map(d => (
                  <option key={d.serial_number} value={d.serial_number}>
                    {d.device_name || 'جهاز بصمة'} ({d.branch_name || 'بدون فرع'}) [{d.serial_number}]
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isLoadingDeviceUsers || !selectedDeviceSnForUsers}
              onClick={handleSyncDeviceUsers}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: isLoadingDeviceUsers ? 'not-allowed' : 'pointer',
                fontFamily: 'Cairo',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🔄</span> {isLoadingDeviceUsers ? 'جاري الفحص...' : 'فحص ذاكرة الماكينة ومزامنة المستخدمين'}
            </button>
          </div>

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px', color: '#166534', fontSize: '0.88rem' }}>
            💡 <strong>تحكم كامل عن بُعد:</strong> يتم هنا عرض الموظفين المسجلين على ماكينة البصمة الفعلية. يمكنك تعديل الاسم، الصلاحيات (مستخدم عادي / مدير فرع / سوبر أدمن)، أو إيقاف بصمة الموظف فورياً مع الاحتفاظ بها في السحابة، أو مسحها نهائياً.
          </div>

          <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right' }}>
                  <th style={{ padding: '12px' }}>PIN على الماكينة</th>
                  <th style={{ padding: '12px' }}>الاسم على شاشة الماكينة</th>
                  <th style={{ padding: '12px' }}>الموظف المربوط بالنظام</th>
                  <th style={{ padding: '12px' }}>مستوى الصلاحية</th>
                  <th style={{ padding: '12px' }}>نمط التحقق</th>
                  <th style={{ padding: '12px' }}>حالة البصمة</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات التحكم</th>
                </tr>
              </thead>
              <tbody>
                {deviceUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                      {isLoadingDeviceUsers
                        ? '⏳ جاري قراءة ذاكرة الماكينة...'
                        : 'لم يتم العثور على مستخدمين مسجلين لهذه الماكينة بعد. اضغط "فحص ذاكرة الماكينة ومزامنة المستخدمين" لقراءتها أو قم بترحيل الموظفين إليها.'}
                    </td>
                  </tr>
                ) : (
                  deviceUsers.map(u => {
                    const emp = employees.find(e => String(e.id) === String(u.employee_id));
                    const isNormalUser = Number(u.privilege) === 0;
                    const isManager = Number(u.privilege) === 6;
                    const isSuperAdmin = Number(u.privilege) === 14;

                    return (
                      <tr key={u.id || u.device_user_pin} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 800, color: '#0284c7' }}>
                          {u.device_user_pin}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                          {u.display_name || '—'}
                        </td>
                        <td style={{ padding: '12px', color: '#334155' }}>
                          {emp ? (
                            <span style={{ fontWeight: 700, color: '#059669' }}>
                              ✅ {emp.name} ({emp.code || emp.id})
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>غير مقترن بملف HR</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: isSuperAdmin ? '#fef2f2' : isManager ? '#fffbeb' : '#f0fdf4',
                              color: isSuperAdmin ? '#dc2626' : isManager ? '#d97706' : '#166534',
                              border: `1px solid ${isSuperAdmin ? '#fecaca' : isManager ? '#fde68a' : '#bbf7d0'}`
                            }}
                          >
                            {isSuperAdmin ? '🛡️ سوبر أدمن (14)' : isManager ? '👔 مدير فرع (6)' : '👤 مستخدم عادي (0)'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '0.82rem', color: '#64748b' }}>
                          {Number(u.verify_mode) === 1 ? '👆 بصمة فقط' :
                           Number(u.verify_mode) === 2 ? '🔢 PIN فقط' :
                           Number(u.verify_mode) === 3 ? '🔑 كلمة مرور فقط' :
                           Number(u.verify_mode) === 4 ? '👆+🔑 بصمة + كلمة مرور' :
                           Number(u.verify_mode) === 5 ? '👤 وجه فقط' : '⚡ افتراضي / أي وسيلة'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '0.78rem',
                              fontWeight: 800,
                              background: u.is_active !== false ? '#ecfdf5' : '#f1f5f9',
                              color: u.is_active !== false ? '#059669' : '#64748b',
                              border: `1px solid ${u.is_active !== false ? '#a7f3d0' : '#cbd5e1'}`
                            }}
                          >
                            {u.is_active !== false ? '🟢 نشطة ومفعلة' : '⏸️ موقوفة مؤقتاً'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setEditingDeviceUser({
                                pin: u.device_user_pin,
                                name: u.display_name,
                                privilege: Number(u.privilege) || 0,
                                verifyMode: Number(u.verify_mode) || 0,
                                password: u.device_password || '',
                                cardNumber: u.card_number || ''
                              })}
                              title="تعديل بيانات وصلاحيات المستخدم على الماكينة"
                              style={{
                                padding: '5px 10px',
                                borderRadius: '7px',
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                fontFamily: 'Cairo'
                              }}
                            >
                              ✏️ تعديل
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleDeviceUserActive(u.device_user_pin, u.is_active !== false)}
                              title={u.is_active !== false ? 'إيقاف بصمة الموظف على الماكينة' : 'إعادة تفعيل البصمة على الماكينة'}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '7px',
                                background: u.is_active !== false ? '#fffbeb' : '#ecfdf5',
                                border: `1px solid ${u.is_active !== false ? '#fde68a' : '#a7f3d0'}`,
                                color: u.is_active !== false ? '#d97706' : '#059669',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                fontFamily: 'Cairo'
                              }}
                            >
                              {u.is_active !== false ? '⏸️ إيقاف' : '▶️ تفعيل'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDeviceUser(u.device_user_pin)}
                              title="مسح المستخدم وقوالبه من ذاكرة الماكينة"
                              style={{
                                padding: '5px 10px',
                                borderRadius: '7px',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                fontFamily: 'Cairo'
                              }}
                            >
                              🗑️ مسح
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── التبويب: محرك تصدير إكسيل الاحترافي المانع للتكرار ── */}
      {activeSubTab === 'excelExport' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 14px', color: '#0f172a', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📊</span> فلترة وتخصيص شيت الإكسيل الملكي
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  تحديد الموظف (موظف محدد أو الكل):
                </label>
                <select
                  value={excelEmpId}
                  onChange={(e) => setExcelEmpId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value="ALL">👥 كافة موظفي وكوادر المؤسسة</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.code || emp.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  تحديد الفرع:
                </label>
                <select
                  value={excelBranchId}
                  onChange={(e) => setExcelBranchId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value="ALL">🏥 كافة الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    من تاريخ:
                  </label>
                  <input
                    type="date"
                    value={excelDateFrom}
                    onChange={(e) => setExcelDateFrom(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    إلى تاريخ:
                  </label>
                  <input
                    type="date"
                    value={excelDateTo}
                    onChange={(e) => setExcelDateTo(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  نوع الحركة:
                </label>
                <select
                  value={excelPunchType}
                  onChange={(e) => setExcelPunchType(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', background: '#ffffff' }}
                >
                  <option value="ALL">🔄 كل الحركات (حضور + انصراف)</option>
                  <option value="check_in">🟢 حركات الحضور فقط</option>
                  <option value="check_out">🚪 حركات الانصراف فقط</option>
                </select>
              </div>

              {/* خيارات منع التكرار الذكي */}
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, color: '#065f46', fontSize: '0.9rem', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={excelDedupEnabled}
                    onChange={(e) => setExcelDedupEnabled(e.target.checked)}
                  />
                  <span>🛡️ تفعيل الخوارزمية الذكية لمنع تكرار البصمات (Deduplication)</span>
                </label>
                <div style={{ fontSize: '0.8rem', color: '#047857', marginBottom: '10px', lineHeight: '1.5' }}>
                  عند وضع الموظف إصبعه أكثر من مرة متتالية خلال فترة زمنية قصيرة، يتم احتساب البصمة الأولى فقط واستبعاد البصمات المكررة لضمان دقة ساعات العمل المحسوبة.
                </div>
                {excelDedupEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#065f46' }}>النافذة الزمنية المانعة للتكرار:</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={excelDedupMinutes}
                      onChange={(e) => setExcelDedupMinutes(Number(e.target.value) || 5)}
                      style={{ width: '70px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #6ee7b7', textAlign: 'center', fontWeight: 800, fontSize: '0.9rem' }}
                    />
                    <span style={{ fontSize: '0.82rem', color: '#065f46' }}>دقائق</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={isExportingExcel}
                onClick={handleExportExcel}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  background: isExportingExcel ? '#94a3b8' : 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  cursor: isExportingExcel ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)',
                  marginTop: '6px'
                }}
              >
                <span>📥</span> {isExportingExcel ? 'جاري تجهيز الشيت الملكي...' : 'تصدير شيت إكسيل احترافي وتنزيله الآن'}
              </button>
            </div>
          </div>

          {/* ميزات ومواصفات الشيت الملكي */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ margin: '0 0 12px', color: '#0f172a', fontWeight: 800, fontSize: '1.02rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✨</span> معايير تصميم الشيت الاحترافي
              </h4>
              <ul style={{ paddingRight: '20px', margin: 0, color: '#475569', fontSize: '0.88rem', lineHeight: '2' }}>
                <li>🏛️ <strong>تصميم مؤسسي فاخر (Executive Royal Theme):</strong> ترويسة كحلية أنيقة وشعار المجموعة.</li>
                <li>📊 <strong>بطاقات مؤشرات أداء KPI:</strong> إجمالي البصمات، حركات الحضور، الانصراف، وعدد البصمات المكررة المستبعدة تلقائياً.</li>
                <li>🛡️ <strong>منع التكرار التلقائي:</strong> فلترة دقيقة تمنع ازدواجية السجلات عند التبصيم المتكرر دون قصد.</li>
                <li>🟢 <strong>تمييز بصري فوري:</strong> خلايا الحضور باللون الأخضر وخلايا الانصراف بالأحمر الداكن مع أيقونات إرشادية.</li>
                <li>📑 <strong>دعم اتجاه اليمين لليسار (RTL):</strong> متوافق كلياً مع مايكروسوفت إكسيل، أوفيس 365، وجوجل شيتس.</li>
                <li>🖨️ <strong>إعدادات طباعة جاهزة:</strong> خط Cairo الرسمي وهوامش طباعة منسقة بصيغة A4.</li>
              </ul>
            </div>

            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px dashed #cbd5e1', marginTop: '16px' }}>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                📌 <strong>معلومة:</strong> الشيت المصدّر يصلح مباشرة لتقديمه للجهات الرقابية، الإدارة العليا، أو استيراده في برامج الرواتب ومحاسبة الأجور.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── التبويب: أكواد الفروع المتعددة للموظف ── */}
      {activeSubTab === 'multiBranch' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* نموذج ربط كود جديد لفرع محدد */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 14px', color: '#0f172a', fontWeight: 800, fontSize: '1.02rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🏢</span> تخصيص كود PIN مستقل لموظف يعمل في فرع محدد
            </h4>

            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b', lineHeight: '1.6' }}>
              إذا كان الموظف يعمل في أكثر من فرع (أو يغطي مناوبات)، يمكنك هنا تعيين رقم PIN خاص به على ماكينة ذلك الفرع بشكل منفصل، وترحيل بياناته وقوالبه إليها تلقائياً.
            </p>

            <form onSubmit={handleSaveBranchPin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الموظف <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                <select
                  required
                  value={newBranchPinEmpId}
                  onChange={(e) => setNewBranchPinEmpId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.code || emp.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الفرع المستهدف <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                <select
                  required
                  value={newBranchPinBranchId}
                  onChange={(e) => setNewBranchPinBranchId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value="">-- اختر الفرع --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  رقم PIN على ماكينة هذا الفرع <span style={{ color: '#ef4444' }}>*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={newBranchPinVal}
                  onChange={(e) => setNewBranchPinVal(e.target.value)}
                  placeholder="مثال: 205 أو 1022"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontFamily: 'monospace', fontWeight: 800 }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', fontWeight: 700, userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={newBranchPinAutoDispatch}
                  onChange={(e) => setNewBranchPinAutoDispatch(e.target.checked)}
                />
                <span>🚀 ترحيل فوري للموظف وقوالب بصمته لماكينة هذا الفرع فور الحفظ</span>
              </label>

              <button
                type="submit"
                disabled={isSavingBranchPin}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: isSavingBranchPin ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo',
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)'
                }}
              >
                {isSavingBranchPin ? 'جاري الحفظ والترحيل...' : '💾 حفظ وتعيين كود الفرع'}
              </button>
            </form>
          </div>

          {/* قائمة الأكواد المسجلة */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, color: '#0f172a', fontWeight: 800, fontSize: '1.02rem' }}>
                📋 جدول أكواد الفروع المتعددة ({branchPins.length})
              </h4>
              <button
                type="button"
                onClick={fetchBranchPins}
                style={{ padding: '6px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'Cairo' }}
              >
                🔄 تحديث
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right' }}>
                    <th style={{ padding: '10px' }}>الموظف</th>
                    <th style={{ padding: '10px' }}>الفرع</th>
                    <th style={{ padding: '10px' }}>رقم PIN</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {branchPins.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        لا توجد أكواد فروع متعددة مسجلة بعد. عند تعيين كود مستقل لأي موظف في فرع ثانٍ سيظهر هنا.
                      </td>
                    </tr>
                  ) : (
                    branchPins.map(bp => {
                      const emp = employees.find(e => String(e.id) === String(bp.employee_id));
                      const br = branches.find(b => String(b.id) === String(bp.branch_id));
                      return (
                        <tr key={bp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>
                            {emp?.name || bp.employee_id}
                          </td>
                          <td style={{ padding: '10px', color: '#0284c7', fontWeight: 700 }}>
                            {br?.name || bp.branch_id}
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed' }}>
                            {bp.device_user_pin}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteBranchPin(bp.id)}
                              style={{ padding: '4px 8px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'Cairo' }}
                            >
                              🗑️ حذف
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── التبويب: إشعارات واتساب للإدارة العليا ── */}
      {activeSubTab === 'whatsappAlerts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {/* إعدادات الإشعارات */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 14px', color: '#0f172a', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💬</span> ربط إشعارات الحضور والانصراف بواتساب الإدارة العليا
            </h4>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', color: '#166534', fontSize: '0.85rem', lineHeight: '1.6' }}>
              🟢 <strong>خادم واتساب نشط ومتصل:</strong> يتم إرسال الإشعار اللحظي إلى هواتف الإدارة العليا المسجلة بالأسفل بمجرد أن يضع الموظف إصبعه أو يمرر وجهه أمام جهاز البصمة في أي فرع.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
                <input
                  type="checkbox"
                  checked={waConfig.enabled}
                  onChange={(e) => setWaConfig({ ...waConfig, enabled: e.target.checked })}
                />
                <span>تفعيل نظام إشعارات واتساب اللحظية عند التبصيم</span>
              </label>

              <div style={{ paddingRight: '26px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={waConfig.notifyCheckIn}
                    onChange={(e) => setWaConfig({ ...waConfig, notifyCheckIn: e.target.checked })}
                  />
                  <span>🟢 إرسال إشعار فوري عند بصمة الحضور (Check-In)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={waConfig.notifyCheckOut}
                    onChange={(e) => setWaConfig({ ...waConfig, notifyCheckOut: e.target.checked })}
                  />
                  <span>🚪 إرسال إشعار فوري عند بصمة الانصراف (Check-Out)</span>
                </label>
              </div>

              {/* أرقام هواتف الإدارة المستلمة */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  📱 أرقام هواتف الإدارة العليا (بصيغة دولية مثال: 201080739315):
                </label>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    value={newWaPhone}
                    onChange={(e) => setNewWaPhone(e.target.value)}
                    placeholder="مثال: 201080739315"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'monospace' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newWaPhone.replace(/[^0-9]/g, '');
                      if (!clean || clean.length < 8) {
                        showToast?.('⚠️ يرجى إدخال رقم هاتف صحيح');
                        return;
                      }
                      const existing = waConfig.recipientPhones || [];
                      if (existing.includes(clean)) {
                        showToast?.('⚠️ هذا الرقم مضاف مسبقاً');
                        return;
                      }
                      setWaConfig({ ...waConfig, recipientPhones: [...existing, clean] });
                      setNewWaPhone('');
                    }}
                    style={{ padding: '9px 16px', borderRadius: '8px', background: '#0284c7', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo' }}
                  >
                    ➕ إضافة
                  </button>
                </div>

                {/* قائمة الأرقام المضافة */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '40px', padding: '10px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  {(waConfig.recipientPhones || []).length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                      لم تُضف أرقام مخصصة بعد (سيتم استخدام هاتف الإدارة المسجل بإعدادات المنشأة تلقائياً).
                    </span>
                  ) : (
                    waConfig.recipientPhones.map(ph => (
                      <span
                        key={ph}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          fontSize: '0.82rem',
                          fontFamily: 'monospace',
                          fontWeight: 700
                        }}
                      >
                        <span>📱 {ph}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setWaConfig({
                              ...waConfig,
                              recipientPhones: waConfig.recipientPhones.filter(p => p !== ph)
                            });
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 800, padding: 0 }}
                        >
                          ✕
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={isSavingWaConfig}
                  onClick={handleSaveWaConfig}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: isSavingWaConfig ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}
                >
                  {isSavingWaConfig ? 'جاري الحفظ...' : '💾 حفظ إعدادات واتساب'}
                </button>

                <button
                  type="button"
                  disabled={isTestingWa}
                  onClick={() => handleTestWaAlert()}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: '1px solid #cbd5e1',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: isTestingWa ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  {isTestingWa ? '⏳ جاري الاختبار...' : '📲 إرسال إشعار تجريبي فوري'}
                </button>
              </div>
            </div>
          </div>

          {/* معاينة الرسالة */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px', color: '#0f172a', fontWeight: 800, fontSize: '1.02rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👁️</span> نموذج ومعاينة رسالة الإشعار الحية
            </h4>
            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b' }}>
              هذا الشكل النموذجي للرسالة التي ستصل على هواتف الإدارة العليا فور التبصيم:
            </p>

            <div
              style={{
                background: '#e5ddd5',
                padding: '16px',
                borderRadius: '14px',
                fontFamily: 'Cairo',
                fontSize: '0.88rem',
                lineHeight: '1.7',
                border: '1px solid #cbd5e1',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                  maxWidth: '320px',
                  marginRight: 'auto',
                  borderTopRightRadius: '0'
                }}
              >
                <div style={{ fontWeight: 800, color: '#075e54', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
                  🏢 مجموعة صيدليات المروة والدكتور سيف<br />
                  🔔 إشعار بصمة فوري - حضور
                </div>
                <div>👤 <strong>الموظف:</strong> د. أحمد خالد</div>
                <div>🏥 <strong>الفرع:</strong> فرع المروة الرئيسي</div>
                <div>⏰ <strong>الوقت:</strong> 09:15:32 ص</div>
                <div>📅 <strong>التاريخ:</strong> 27/09/2026</div>
                <div>📟 <strong>الجهاز:</strong> MB20 (SN: EUF7242701836)</div>
                <div>🧬 <strong>وسيلة التحقق:</strong> بصمة إصبع (Fingerprint)</div>
                <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '8px', paddingTop: '6px', fontSize: '0.75rem', color: '#64748b', textAlign: 'left' }}>
                  نظام إدارة الموارد البشرية الذكي ⚡
                </div>
              </div>
            </div>
          </div>
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

              <button
                type="button"
                onClick={() => handlePullTemplates(selectedDeviceForManage.serial_number)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  border: '1px solid #ddd6fe',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                📥 سحب كافة قوالب البصمات المسجلة من الماكينة للخزنة السحابية
              </button>

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

      {/* ── Modal 4: نافذة تعديل مستخدم الماكينة وصلاحياته ─────────────────── */}
      {editingDeviceUser && (
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
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                ✏️ تعديل بيانات وصلاحيات المستخدم على الماكينة
              </h3>
              <button
                type="button"
                onClick={() => setEditingDeviceUser(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDeviceUserEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  رقم الـ PIN على الماكينة (ثابت):
                </label>
                <input
                  type="text"
                  disabled
                  value={editingDeviceUser.pin}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f1f5f9', fontSize: '0.95rem', fontFamily: 'monospace', fontWeight: 800 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  الاسم المعروض على شاشة الماكينة:
                </label>
                <input
                  type="text"
                  required
                  value={editingDeviceUser.name}
                  onChange={(e) => setEditingDeviceUser({ ...editingDeviceUser, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  مستوى الصلاحية على الماكينة:
                </label>
                <select
                  value={editingDeviceUser.privilege}
                  onChange={(e) => setEditingDeviceUser({ ...editingDeviceUser, privilege: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value={0}>👤 مستخدم عادي (Normal User - لا يفتح القائمة)</option>
                  <option value={6}>👔 مشرف فرع (Manager - صلاحيات محدودة)</option>
                  <option value={14}>🛡️ سوبر أدمن (Super Admin - يفتح قائمة الجهاز بالكامل)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  نمط التحقق المطلوب:
                </label>
                <select
                  value={editingDeviceUser.verifyMode}
                  onChange={(e) => setEditingDeviceUser({ ...editingDeviceUser, verifyMode: Number(e.target.value) })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                >
                  <option value={0}>⚡ افتراضي / أي وسيلة (Any / Default)</option>
                  <option value={1}>👆 بصمة إصبع فقط (Fingerprint Only)</option>
                  <option value={2}>🔢 PIN فقط</option>
                  <option value={3}>🔑 كلمة مرور فقط (Password Only)</option>
                  <option value={4}>👆+🔑 بصمة + كلمة مرور</option>
                  <option value={5}>👤 بصمة وجه فقط (Face Only)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  كلمة مرور لوحة المفاتيح (اختياري):
                </label>
                <input
                  type="password"
                  value={editingDeviceUser.password || ''}
                  onChange={(e) => setEditingDeviceUser({ ...editingDeviceUser, password: e.target.value })}
                  placeholder="اتركه فارغاً إن لم ترغب بتعيين كلمة سر"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
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
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  💾 حفظ وإرسال للماكينة
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDeviceUser(null)}
                  style={{
                    padding: '12px 18px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    color: '#475569',
                    border: 'none',
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
    </div>
  );
}
