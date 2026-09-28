import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getSocket } from '../../utils/socketClient';
import { exportBiometricPunchesExcel, deduplicatePunches } from '../../utils/biometricExcelExporter';

export default function BiometricDevicesCard({ state, showToast }) {
  const branches = state?.branches || [];
  const employees = state?.employees || [];

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
  const [allDeviceUsers, setAllDeviceUsers] = useState([]);
  const [isLoadingDeviceUsers, setIsLoadingDeviceUsers] = useState(false);
  const [editingDeviceUser, setEditingDeviceUser] = useState(null);

  // محرك الإكسيل الذكي المانع للتكرار
  const [excelDeviceSn, setExcelDeviceSn] = useState('ALL');
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

  // قائمة الموظفين المفلوترين لصفحة تصدير إكسيل وفق الماكينة والفرع
  const filteredExcelEmployees = useMemo(() => {
    if (excelDeviceSn === 'ALL') {
      if (excelBranchId === 'ALL') return employees;
      return employees.filter(e => String(e.branchId || e.branch_id) === String(excelBranchId));
    }
    const dev = devices.find(d => d.serial_number === excelDeviceSn);
    const targetBranch = dev?.branch_id || branches.find(b => b.name === dev?.branch_name)?.id;

    return employees.filter(e => {
      // 1. يطابق فرع الماكينة
      if (targetBranch && String(e.branchId || e.branch_id) === String(targetBranch)) return true;
      // 2. يمتلك PIN مخصص لهذا الفرع
      if (targetBranch && branchPins.some(bp => String(bp.employee_id) === String(e.id) && String(bp.branch_id) === String(targetBranch))) return true;
      // 3. مسجل على الماكينة أو له قالب بيومتري مصدره هذه الماكينة
      if (templates.some(t => String(t.employee_id) === String(e.id) && t.source_device_sn === excelDeviceSn)) return true;
      return false;
    });
  }, [excelDeviceSn, excelBranchId, employees, devices, branches, branchPins, templates]);


  // القالب الافتراضي لإشعارات واتساب للإدارة
  const DEFAULT_WA_ADMIN_TEMPLATE = `🔔 *إشعار حضور وانصراف بيومتري لحظي*
━━━━━━━━━━━━━━━━━━━━━━
👤 *الموظف:* {employee_name}
🏢 *الفرع:* {branch_name}
🕒 *الوقت:* {time} | {date}
📌 *الحركة:* {action_icon} *{action}*
🧬 *وسيلة التحقق:* {verify_type}
📟 *الماكينة:* {device_name}
━━━━━━━━━━━━━━━━━━━━━━
🏛️ _{company_name}_`;

  // إعدادات إشعارات واتساب للإدارة العليا
  const [waConfig, setWaConfig] = useState({
    enabled: true,
    notifyCheckIn: true,
    notifyCheckOut: true,
    recipientPhones: [],
    adminMessageTemplate: DEFAULT_WA_ADMIN_TEMPLATE
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
  const [hqEnrollType, setHqEnrollType] = useState('both'); // 'fingerprint' | 'face' | 'both'
  const [hqNameMode, setHqNameMode] = useState('english'); // 'english' | 'arabic'
  const [isHqSubmitting, setIsHqSubmitting] = useState(false);

  // حالة نافذة تهيئة الفلاشة USB Config
  const [showUsbConfigModal, setShowUsbConfigModal] = useState(false);
  const [usbConfigData, setUsbConfigData] = useState(null);
  const [isLoadingUsbConfig, setIsLoadingUsbConfig] = useState(false);

  // حالات الخصائص الجديدة (تسجيل الأصابع المتعددة، النبض، الخلفيات، الاختبارات، مسح السجل)
  const [hqFingerIndex, setHqFingerIndex] = useState(1); // 0-9
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isPingingDevices, setIsPingingDevices] = useState(false);
  const [isPullingTemplates, setIsPullingTemplates] = useState(false);
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [selectedWallpaperTheme, setSelectedWallpaperTheme] = useState('luxury_pharmacy');
  const [showTestModal, setShowTestModal] = useState(false);
  const [testDeviceSn, setTestDeviceSn] = useState('');
  const [isTestingDevice, setIsTestingDevice] = useState(false);

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

  // خزنة القوالب البيومترية وإدارتها
  const [isSyncingVault, setIsSyncingVault] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editTplEmpId, setEditTplEmpId] = useState('');
  const [editTplName, setEditTplName] = useState('');
  const [editTplPin, setEditTplPin] = useState('');
  const [isSavingTplEdit, setIsSavingTplEdit] = useState(false);
  const [dispatchModalTpl, setDispatchModalTpl] = useState(null);
  const [dispatchTargetDeviceSn, setDispatchTargetDeviceSn] = useState('');
  const [isDispatchingSingleTpl, setIsDispatchingSingleTpl] = useState(false);

  // إعادة تسجيل البصمة على ماكينة الإدارة
  const [reEnrollModalTpl, setReEnrollModalTpl] = useState(null);
  const [reEnrollTargetDeviceSn, setReEnrollTargetDeviceSn] = useState('');
  const [reEnrollFingerId, setReEnrollFingerId] = useState(0);
  const [isSubmittingReEnroll, setIsSubmittingReEnroll] = useState(false);

  // إلغاء وتفريغ الأوامر المعلقة وفك تعليق الماكينة
  const [isClearingCommands, setIsClearingCommands] = useState({});

  // حذف بصمات/مستخدم الماكينة بنطاق محدد
  const [deleteUserModalData, setDeleteUserModalData] = useState(null);
  const [deleteScope, setDeleteScope] = useState('full_user'); // 'single_finger' | 'all_fingers' | 'full_user'
  const [deleteFingerId, setDeleteFingerId] = useState(0);
  const [isDeletingUserScope, setIsDeletingUserScope] = useState(false);

  // حقول البحث والفلترة لربط PIN
  const [pinSearchTerm, setPinSearchTerm] = useState('');
  const [pinBranchFilter, setPinBranchFilter] = useState('ALL');

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

  // جلب كافة مستخدمي الأجهزة المسجلين عبر كافة الماكينات
  const fetchAllDeviceUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/biometrics/device-users');
      const data = await res.json();
      if (data.success) {
        setAllDeviceUsers(data.users || []);
      }
    } catch (e) {
      console.warn('Error fetching all device users:', e.message);
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
    fetchAllDeviceUsers();

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
        fetchAllDeviceUsers();
      };

      const onCmdAck = (data) => {
        if (data && data.status) {
          fetchDispatchLogs();
        }
      };

      const onDeviceUsersUpdated = (data) => {
        if (data?.serialNumber) {
          fetchDeviceUsers(data.serialNumber);
          fetchAllDeviceUsers();
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
  }, [fetchDevices, fetchLogs, fetchProfiles, fetchTemplates, fetchDispatchLogs, fetchBranchPins, fetchWaConfig, fetchDeviceUsers, fetchAllDeviceUsers, showToast]);

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

  // إلغاء وتفريغ الأوامر المعلقة أو العالقة وفك تعليق الماكينة
  const handleClearDeviceCommands = async (serialNumber) => {
    const isAll = !serialNumber || serialNumber.toLowerCase() === 'all';
    const targetKey = isAll ? 'all' : serialNumber;

    if (!window.confirm(
      isAll 
        ? 'هل ترغب في إلغاء وتفريغ كافة الأوامر المعلقة والعالقة في جميع أجهزة البصمة وإعادة تهيئة الحساسات؟'
        : `هل ترغب في إلغاء أي أمر معلق أو واجه خطأ في التنفيذ لماكينة البصمة (${serialNumber}) وفك تعليق الحساس؟`
    )) return;

    setIsClearingCommands(prev => ({ ...prev, [targetKey]: true }));
    try {
      showToast?.(`⏳ جاري إلغاء الأوامر المعلقة وإعادة تهيئة الحساس (${isAll ? 'كافة الأجهزة' : serialNumber})...`);
      const endpoint = isAll 
        ? '/api/biometrics/devices/all/clear-commands'
        : `/api/biometrics/devices/${encodeURIComponent(serialNumber)}/clear-commands`;

      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.(`✨ ${data.message || 'تم تفريغ الأوامر المعلقة وفك تعليق الجهاز بنجاح'}`);
        fetchDevices();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر إلغاء الأوامر'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الاتصال بالسيرفر: ${e.message}`);
    } finally {
      setIsClearingCommands(prev => ({ ...prev, [targetKey]: false }));
    }
  };

  // سحب قوالب البصمات من الماكينة إلى الخزنة السحابية
  const handlePullTemplates = async (serialNumber, pin = null) => {
    try {
      const url = `/api/biometrics/devices/${encodeURIComponent(serialNumber)}/pull-templates${pin ? `?pin=${encodeURIComponent(pin)}` : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin || undefined })
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
          hqDeviceSerial: hqDevSerial,
          enrollmentType: hqEnrollType,
          nameMode: hqNameMode,
          fingerIndex: hqFingerIndex
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
    setIsLoadingDeviceUsers(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.('🔄 تم إرسال أمر فحص ذاكرة الجهاز بنجاح. جاري قراءة وتحديث قائمة المستخدمين...');
        // فحص تدريجي بعد إرسال الأمر كل 2.5 ثانية لتحديث الجدول تلقائياً فور استجابة الماكينة
        let attempts = 0;
        const intervalId = setInterval(async () => {
          attempts++;
          await fetchDeviceUsers(selectedDeviceSnForUsers);
          if (attempts >= 5) {
            clearInterval(intervalId);
            setIsLoadingDeviceUsers(false);
          }
        }, 2500);
      } else {
        setIsLoadingDeviceUsers(false);
        showToast?.(`⚠️ ${data.error || 'تعذر إرسال أمر الفحص'}`);
      }
    } catch {
      setIsLoadingDeviceUsers(false);
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

  const handleOpenDeleteUserModal = (user) => {
    const userTpls = templates.filter(t => String(t.device_user_pin) === String(user.device_user_pin));
    setDeleteUserModalData({ user, userTpls });
    if (userTpls.length > 1) {
      setDeleteScope('single_finger');
      setDeleteFingerId(userTpls[0].finger_id ?? 0);
    } else {
      setDeleteScope('full_user');
      setDeleteFingerId(userTpls[0]?.finger_id ?? 0);
    }
  };

  const handleConfirmDeleteUserScope = async () => {
    if (!deleteUserModalData) return;
    const { user } = deleteUserModalData;
    setIsDeletingUserScope(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/users/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: user.device_user_pin,
          deleteScope,
          fingerId: deleteFingerId
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🗑️ ${data.message}`);
        setDeleteUserModalData(null);
        fetchDeviceUsers(selectedDeviceSnForUsers);
        fetchTemplates();
      } else {
        showToast?.(`⚠️ ${data.error || 'تعذر مسح البصمة/المستخدم'}`);
      }
    } catch {
      showToast?.('❌ تعذر مسح البصمة/المستخدم');
    } finally {
      setIsDeletingUserScope(false);
    }
  };

  const handleDeleteDeviceUser = async (pin) => {
    const dummyUser = deviceUsers.find(u => String(u.device_user_pin) === String(pin)) || { device_user_pin: pin };
    handleOpenDeleteUserModal(dummyUser);
  };

  // مسح السجل الحي للحركات بالكامل
  const handleClearLogs = async () => {
    if (!confirm('هل أنت متأكد من رغبتك في مسح وتفريغ السجل الحي للحركات بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    setIsClearingLogs(true);
    try {
      const res = await fetch('/api/biometrics/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        showToast?.('🗑️ ' + data.message);
      } else {
        showToast?.('❌ ' + (data.error || 'تعذر مسح السجل'));
      }
    } catch (err) {
      showToast?.('❌ خطأ في الاتصال: ' + err.message);
    } finally {
      setIsClearingLogs(false);
    }
  };

  // إرسال نبض فحص الاتصال الفوري للأجهزة المربوطة بالسحابة
  const handlePingAllDevices = async () => {
    setIsPingingDevices(true);
    showToast?.('📡 جاري إرسال نبض فحص الاتصال وتأكيد حالة الأونلاين للماكينات...');
    try {
      const res = await fetch('/api/biometrics/devices/ping-all', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.('⚡ ' + data.message);
        setTimeout(fetchDevices, 1500);
      }
    } catch (err) {
      console.warn('Ping error:', err.message);
    } finally {
      setTimeout(() => setIsPingingDevices(false), 2000);
    }
  };

  // سحب كافة القوالب الحيوية من الماكينات للخزنة السحابية
  const handlePullAllTemplates = async () => {
    setIsPullingTemplates(true);
    showToast?.('⏳ جاري إرسال أوامر استيراد كافة قوالب البصمة والوجه من الماكينات للسحابة...');
    try {
      const res = await fetch('/api/biometrics/pull-all-templates', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.('📥 ' + data.message);
        setTimeout(() => {
          fetchTemplates();
          if (selectedDeviceSnForUsers) fetchDeviceUsers(selectedDeviceSnForUsers);
        }, 3000);
      } else {
        showToast?.('⚠️ ' + (data.error || 'تعذر سحب القوالب'));
      }
    } catch (err) {
      showToast?.('❌ خطأ في الاتصال: ' + err.message);
    } finally {
      setIsPullingTemplates(false);
    }
  };

  // إرسال أمر فحص واختبار تشخيصي للماكينة
  const handleSendTestCommand = async (testType, targetSn) => {
    const sn = targetSn || selectedDeviceSnForUsers || devices[0]?.serial_number;
    if (!sn) {
      showToast?.('⚠️ يرجى اختيار ماكينة أولاً');
      return;
    }
    setIsTestingDevice(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(sn)}/test-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType, pin: '1' })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🧪 ' + data.message);
      } else {
        showToast?.('❌ ' + (data.error || 'فشل إرسال أمر الفحص'));
      }
    } catch (err) {
      showToast?.('❌ خطأ في الاتصال: ' + err.message);
    } finally {
      setIsTestingDevice(false);
    }
  };

  // إرسال أمر تعيين خلفية وشعار الماكينة
  const handleSetDeviceWallpaper = async (targetSn, theme) => {
    const sn = targetSn || selectedDeviceSnForUsers || devices[0]?.serial_number;
    if (!sn) {
      showToast?.('⚠️ يرجى اختيار ماكينة أولاً');
      return;
    }
    try {
      const res = await fetch(`/api/biometrics/devices/${encodeURIComponent(sn)}/wallpaper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallpaperType: theme || selectedWallpaperTheme })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('🖼️ ' + data.message);
        setShowWallpaperModal(false);
      } else {
        showToast?.('❌ ' + (data.error || 'تعذر تغيير الخلفية'));
      }
    } catch (err) {
      showToast?.('❌ خطأ: ' + err.message);
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

  const handleOpenUsbConfig = async () => {
    if (!selectedDeviceSnForUsers) {
      showToast?.('⚠️ يرجى اختيار ماكينة أولاً لتجهيز ملفات الفلاشة لها');
      return;
    }
    setIsLoadingUsbConfig(true);
    setShowUsbConfigModal(true);
    try {
      const res = await fetch(`/api/biometrics/devices/${selectedDeviceSnForUsers}/usb-config`);
      const data = await res.json();
      if (data.success) {
        setUsbConfigData(data);
        fetchDevices(); // تحديث الأجهزة لأن الماكينة تم تسجيلها تلقائياً
      }
    } catch (e) {
      console.warn('Error loading USB config:', e.message);
    } finally {
      setIsLoadingUsbConfig(false);
    }
  };

  const handleDownloadUsbFile = (filename, content) => {
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast?.(`✅ تم تنزيل ملف ${filename} بنجاح`);
    } catch (e) {
      showToast?.(`❌ فشل التنزيل: ${e.message}`);
    }
  };

  const handleDownloadAllUsbFiles = () => {
    if (!usbConfigData?.files) return;
    Object.entries(usbConfigData.files).forEach(([fname, content], i) => {
      setTimeout(() => {
        handleDownloadUsbFile(fname, content);
      }, i * 350);
    });
    showToast?.('📦 جاري تنزيل حزمة ملفات الفلاشة بالكامل...');
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

  // ── وظائف إدارة الخزنة السحابية وتوزيع البصمات ─────────────────────────────
  const handleSyncVault = async () => {
    setIsSyncingVault(true);
    showToast?.('⏳ جاري إرسال أوامر فحص الأجهزة ومزامنة قوالب البصمات السحابية...');
    try {
      const res = await fetch('/api/biometrics/sync-vault', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast?.('⚡ ' + data.message);
        setTimeout(async () => {
          await fetchTemplates();
          setIsSyncingVault(false);
        }, 2000);
      } else {
        showToast?.('⚠️ ' + (data.error || 'تعذر تحديث الخزنة'));
        setIsSyncingVault(false);
      }
    } catch (err) {
      showToast?.('❌ خطأ في الاتصال: ' + err.message);
      setIsSyncingVault(false);
    }
  };

  const handleBroadcastTemplate = async (tpl) => {
    if (!tpl) return;
    const targetSerials = devices.map(d => d.serial_number);
    if (targetSerials.length === 0) {
      showToast?.('⚠️ لا توجد أجهزة مربوطة بالسحابة للتعميم عليها');
      return;
    }
    const emp = employees.find(e => String(e.id) === String(tpl.employee_id) || String(e.code) === String(tpl.device_user_pin));
    const empName = emp?.name || tpl.employee_name || `موظف PIN: ${tpl.device_user_pin}`;

    if (!confirm(`هل ترغب في تعميم قالب بصمة الموظف (${empName}) برقم PIN (${tpl.device_user_pin}) على كافة الأجهزة (${targetSerials.length} جهاز)؟`)) {
      return;
    }

    try {
      showToast?.(`🌐 جاري تعميم البصمة للموظف (${empName}) على كافة الفروع...`);
      const res = await fetch(`/api/biometrics/templates/${tpl.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeviceSerials: targetSerials })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`🎉 ${data.message}`);
        fetchDispatchLogs();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر التعميم'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل التعميم: ${e.message}`);
    }
  };

  const handleOpenDispatchModal = (tpl) => {
    setDispatchModalTpl(tpl);
    const nonSource = devices.find(d => d.serial_number !== tpl.source_device_sn);
    setDispatchTargetDeviceSn(nonSource ? nonSource.serial_number : (devices[0]?.serial_number || ''));
  };

  const handleDispatchTemplateToSingleBranch = async () => {
    if (!dispatchModalTpl || !dispatchTargetDeviceSn) {
      showToast?.('⚠️ يرجى اختيار الجهاز/الفرع المستهدف');
      return;
    }
    setIsDispatchingSingleTpl(true);
    try {
      const res = await fetch(`/api/biometrics/templates/${dispatchModalTpl.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeviceSerials: [dispatchTargetDeviceSn] })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`✅ ${data.message}`);
        setDispatchModalTpl(null);
        fetchDispatchLogs();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر الإرسال'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الإرسال: ${e.message}`);
    } finally {
      setIsDispatchingSingleTpl(false);
    }
  };

  const handleOpenEditTemplateModal = (tpl) => {
    setEditingTemplate(tpl);
    setEditTplEmpId(tpl.employee_id || '');
    setEditTplName(tpl.employee_name || '');
    setEditTplPin(tpl.device_user_pin || '');
  };

  const handleSaveTemplateEdit = async (e) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setIsSavingTplEdit(true);
    try {
      const res = await fetch(`/api/biometrics/templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: editTplEmpId,
          employeeName: editTplName,
          deviceUserPin: editTplPin
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم تحديث بيانات القالب البيومتري بنجاح');
        setEditingTemplate(null);
        fetchTemplates();
        fetchProfiles();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر الحفظ'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل التعديل: ${e.message}`);
    } finally {
      setIsSavingTplEdit(false);
    }
  };

  const handleDeleteTemplate = async (tpl) => {
    if (!tpl) return;
    const emp = employees.find(e => String(e.id) === String(tpl.employee_id) || String(e.code) === String(tpl.device_user_pin));
    const empName = emp?.name || tpl.employee_name || `موظف PIN: ${tpl.device_user_pin}`;
    if (!confirm(`هل أنت متأكد من حذف قالب البصمة للموظف (${empName}) رقم PIN (${tpl.device_user_pin}) من الخزنة السحابية نهائياً؟`)) {
      return;
    }
    try {
      const res = await fetch(`/api/biometrics/templates/${tpl.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast?.('🗑️ تم حذف القالب من الخزنة السحابية بنجاح');
        fetchTemplates();
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر الحذف'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الحذف: ${e.message}`);
    }
  };

  const handleOpenReEnrollModal = (tpl) => {
    if (!tpl) return;
    setReEnrollModalTpl(tpl);
    // Find HQ device if exists, otherwise tpl source device or first device
    const hqDev = devices.find(d => 
      (d.device_name || '').includes('إدارة') || 
      (d.device_name || '').includes('ادارة') || 
      (d.branch_name || '').includes('إدارة') || 
      (d.branch_name || '').includes('ادارة')
    );
    const defaultSn = hqDev?.serial_number || tpl.source_device_sn || devices[0]?.serial_number || '';
    setReEnrollTargetDeviceSn(defaultSn);
    setReEnrollFingerId(tpl.finger_id !== undefined ? tpl.finger_id : 0);
  };

  const handleConfirmReEnroll = async () => {
    if (!reEnrollModalTpl || !reEnrollTargetDeviceSn) {
      showToast?.('⚠️ يرجى اختيار ماكينة البصمة المستهدفة');
      return;
    }
    setIsSubmittingReEnroll(true);
    try {
      showToast?.(`🔄 جاري إرسال أمر فتح حساس البصمة لإعادة التسجيل على الجهاز (${reEnrollTargetDeviceSn})...`);
      const res = await fetch(`/api/biometrics/templates/${reEnrollModalTpl.id}/re-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          targetDeviceSerial: reEnrollTargetDeviceSn,
          fingerId: reEnrollFingerId
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`✨ ${data.message}`);
        setReEnrollModalTpl(null);
      } else {
        showToast?.(`⚠️ خطأ: ${data.error || 'تعذر إعادة التسجيل'}`);
      }
    } catch (e) {
      showToast?.(`❌ فشل الطلب: ${e.message}`);
    } finally {
      setIsSubmittingReEnroll(false);
    }
  };

  const handleReEnrollTemplate = async (tpl) => {
    handleOpenReEnrollModal(tpl);
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
        if (excelDeviceSn !== 'ALL' && String(p.device_serial || p.deviceSerial) !== String(excelDeviceSn)) return false;
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
        filterEmployeeId: excelEmpId,
        deviceSerial: excelDeviceSn,
        employees,
        branches,
        devices,
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                disabled={isPingingDevices}
                onClick={handlePingAllDevices}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: isPingingDevices ? '#eff6ff' : '#f8fafc',
                  color: isPingingDevices ? '#2563eb' : '#475569',
                  border: `1px solid ${isPingingDevices ? '#93c5fd' : '#cbd5e1'}`,
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: isPingingDevices ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Cairo'
                }}
              >
                <span style={{ display: 'inline-block', animation: isPingingDevices ? 'spin 1s linear infinite' : 'none' }}>
                  {isPingingDevices ? '📡' : '🔄'}
                </span>
                {isPingingDevices ? 'جاري إرسال النبض...' : 'تحديث وفحص الاتصال (Ping)'}
              </button>

              <button
                type="button"
                disabled={isClearingCommands['all']}
                onClick={() => handleClearDeviceCommands('all')}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: isClearingCommands['all'] ? '#fff1f2' : '#ffffff',
                  color: '#e11d48',
                  border: '1px solid #fecdd3',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: isClearingCommands['all'] ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Cairo',
                  boxShadow: '0 1px 3px rgba(225, 29, 72, 0.08)'
                }}
                title="إلغاء كافة الأوامر المعلقة والعالقة في جميع الماكينات وفك تعليق الحساسات"
              >
                <span>🛑</span>
                {isClearingCommands['all'] ? 'جاري تفريغ كافة الأوامر...' : 'تفريغ الأوامر المعلقة (كافة الأجهزة)'}
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

                      <button
                        type="button"
                        disabled={isClearingCommands[dev.serial_number]}
                        onClick={() => handleClearDeviceCommands(dev.serial_number)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: '#fff1f2',
                          color: '#e11d48',
                          border: '1px solid #fecdd3',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: isClearingCommands[dev.serial_number] ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          fontFamily: 'Cairo',
                          transition: 'all 0.2s',
                          boxShadow: '0 1px 3px rgba(225, 29, 72, 0.08)'
                        }}
                        title="إلغاء أي أمر معلق أو واجه خطأ في التنفيذ وفك تعليق حساس الماكينة فوراً"
                      >
                        <span>🛑</span>
                        {isClearingCommands[dev.serial_number] ? 'جاري فك التعليق والإلغاء...' : 'إلغاء وتفريغ الأوامر المعلقة (Unblock)'}
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
                <option value="DEVICE_ONLY">📟 مسجل بذاكرة ماكينة فقط (بحاجة سحب)</option>
                <option value="NO_TEMPLATE">⚪ غير مسجل له قالب بعد</option>
              </select>
            </div>

            <div style={{ marginRight: 'auto' }}>
              <button
                type="button"
                disabled={isPullingTemplates}
                onClick={handlePullAllTemplates}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontFamily: 'Cairo',
                  fontWeight: 800,
                  cursor: isPullingTemplates ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.2)'
                }}
              >
                <span>📥</span> {isPullingTemplates ? 'جاري سحب القوالب...' : 'سحب ومزامنة كافة القوالب للسحابة'}
              </button>
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
                    const enrolledOnDevice = allDeviceUsers.find(u => String(u.device_user_pin) === String(pin) || String(u.employee_id) === String(emp.id));

                    if (dispatchFilterBranch !== 'ALL' && String(emp.branchId) !== String(dispatchFilterBranch)) {
                      return false;
                    }
                    if (dispatchFilterBioStatus === 'HAS_TEMPLATE' && !hasTemplate) return false;
                    if (dispatchFilterBioStatus === 'DEVICE_ONLY' && (!enrolledOnDevice || hasTemplate)) return false;
                    if (dispatchFilterBioStatus === 'NO_TEMPLATE' && (hasTemplate || enrolledOnDevice)) return false;

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
                    const enrolledOnDevice = allDeviceUsers.find(u => String(u.device_user_pin) === String(pin) || String(u.employee_id) === String(emp.id));
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
                          ) : enrolledOnDevice ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span
                                title={`مسجل على ماكينة: ${enrolledOnDevice.device_name || enrolledOnDevice.device_serial} (${enrolledOnDevice.dev_branch_name || 'الفرع'})`}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                📟 مسجل بذاكرة ماكينة ({enrolledOnDevice.device_name || enrolledOnDevice.device_serial})
                              </span>
                              <button
                                type="button"
                                disabled={isPullingTemplates}
                                onClick={async () => {
                                  const targetPin = enrolledOnDevice.device_user_pin || emp.code || emp.id;
                                  await handlePullTemplates(enrolledOnDevice.device_serial, targetPin);
                                  setTimeout(() => {
                                    fetchTemplates();
                                    fetchAllDeviceUsers();
                                  }, 2500);
                                }}
                                title="سحب القالب وحفظه في الخزنة السحابية فوراً ليتاح الترحيل لكافة الفروع"
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                  color: '#ffffff',
                                  border: 'none',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  cursor: isPullingTemplates ? 'not-allowed' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                                }}
                              >
                                📥 سحب القالب للسحابة
                              </button>
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

          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            {/* قسم إرسال الموظف لماكينة الإدارة */}
            <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>
                🎯 تحديد الموظف وماكينة الإدارة للتسجيل المركزي:
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    نوع البصمة المراد تسجيلها:
                  </label>
                  <select
                    value={hqEnrollType}
                    onChange={(e) => setHqEnrollType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'Cairo'
                    }}
                  >
                    <option value="both">👆 + 👤 بصمة وجه وإصبع معاً (هجين - موصى به)</option>
                    <option value="face">👤 بصمة وجه فقط (Face Recognition)</option>
                    <option value="fingerprint">👆 بصمة إصبع فقط (Fingerprint)</option>
                  </select>
                </div>

                {hqEnrollType !== 'face' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                      رقم وتحديد الإصبع المراد تسجيله (يدعم تسجيل عدة أصابع للموظف):
                    </label>
                    <select
                      value={hqFingerIndex}
                      onChange={(e) => setHqFingerIndex(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        fontFamily: 'Cairo',
                        fontWeight: 700
                      }}
                    >
                      <option value={1}>👉 السبابة اليمنى (Finger 1 - افتراضي أساسي)</option>
                      <option value={0}>👍 الإبهام الأيمن (Finger 0)</option>
                      <option value={2}>🖕 الوسطى اليمنى (Finger 2)</option>
                      <option value={3}>💍 البنصر الأيمن (Finger 3)</option>
                      <option value={4}>🖐️ الخنصر الأيمن (Finger 4)</option>
                      <option value={6}>👈 السبابة اليسرى (Finger 6 - بصمة بديلة احتياطية)</option>
                      <option value={5}>👍 الإبهام الأيسر (Finger 5)</option>
                      <option value={7}>🖕 الوسطى اليسرى (Finger 7)</option>
                      <option value={8}>💍 البنصر الأيسر (Finger 8)</option>
                      <option value={9}>🖐️ الخنصر الأيسر (Finger 9)</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    طريقة عرض الاسم على شاشة الماكينة:
                  </label>
                  <select
                    value={hqNameMode}
                    onChange={(e) => setHqNameMode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'Cairo'
                    }}
                  >
                    <option value="english">🌐 إنجليزي معرّب (موصى به - يظهر بوضوح 100% على كافة الماكينات: Ahmed Khaled)</option>
                    <option value="arabic">🔤 عربي أصلي (للأجهزة ذات الروم العربي الكامل: أحمد خالد)</option>
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
                disabled={isSyncingVault}
                onClick={handleSyncVault}
                style={{
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  color: '#0284c7',
                  fontSize: '0.82rem',
                  cursor: isSyncingVault ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'Cairo'
                }}
              >
                <span>{isSyncingVault ? '⏳' : '🔄'}</span>
                {isSyncingVault ? 'جاري سحب ومزامنة القوالب...' : 'تحديث الخزنة من الأجهزة'}
              </button>
            </div>

            {templates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.9rem' }}>
                لا توجد قوالب بصمات ملتقطة في الخزنة السحابية بعد. عند تسجيل أي موظف على الماكينة أو الضغط على "تحديث الخزنة من الأجهزة"، ستظهر هنا فوراً.
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
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>إجراءات التوزيع والتحكم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.map(tpl => {
                      const emp = employees.find(e => String(e.id) === String(tpl.employee_id) || String(e.code) === String(tpl.device_user_pin));
                      const empName = emp?.name || tpl.employee_name || 'موظف PIN: ' + tpl.device_user_pin;

                      return (
                        <tr key={tpl.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{empName}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenEditTemplateModal(tpl)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', padding: '2px 4px' }}
                                title="تعديل اسم الموظف أو ربطه بكود محدد"
                              >
                                ✏️
                              </button>
                            </div>
                          </td>
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
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenDispatchModal(tpl)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="إرسال البصمة إلى فرع أو ماكينة محددة"
                              >
                                🏢 إرسال لفرع
                              </button>
                              <button
                                type="button"
                                onClick={() => handleBroadcastTemplate(tpl)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  background: '#f0fdf4',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تعميم البصمة فوراً على كافة ماكينات الفروع"
                              >
                                🌐 تعميم على الفروع
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditTemplateModal(tpl)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  background: '#f8fafc',
                                  color: '#475569',
                                  border: '1px solid #cbd5e1',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo'
                                }}
                                title="تعديل التخصيص أو الاسم أو كود PIN"
                              >
                                ✏️ تعديل
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReEnrollModal(tpl)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  background: '#fffbeb',
                                  color: '#b45309',
                                  border: '1px solid #fde68a',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo'
                                }}
                                title="إعادة فتح حساس البصمة على الماكينة لإعادة التسجيل"
                              >
                                🔄 إعادة تسجيل
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTemplate(tpl)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  color: '#b91c1c',
                                  border: '1px solid #fecaca',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  fontFamily: 'Cairo'
                                }}
                                title="حذف القالب من الخزنة السحابية"
                              >
                                🗑️
                              </button>
                            </div>
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

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleOpenUsbConfig}
                style={{
                  padding: '9px 16px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontFamily: 'Cairo',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)'
                }}
              >
                <span>💾</span> ضبط الفلاشة (USB Config)
              </button>

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
        <div style={{ maxWidth: '780px', margin: '0 auto' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <span style={{ fontSize: '26px' }}>📊</span>
              <div>
                <h4 style={{ margin: 0, color: '#0f172a', fontWeight: 800, fontSize: '1.15rem' }}>
                  تصدير كشف البصمات وساعات العمل والوقت الإضافي (Excel)
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                  توليد شيت إكسيل بمعادلات حية لحساب ساعات العمل والإضافي مع صفحة مستقلة لكل موظف
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    تحديد جهاز البصمة (Device Filter):
                  </label>
                  <select
                    value={excelDeviceSn}
                    onChange={(e) => {
                      const sn = e.target.value;
                      setExcelDeviceSn(sn);
                      if (sn !== 'ALL') {
                        const dev = devices.find(d => d.serial_number === sn);
                        const bId = dev?.branch_id || branches.find(b => b.name === dev?.branch_name)?.id || 'ALL';
                        setExcelBranchId(String(bId));
                      }
                      setExcelEmpId('ALL');
                    }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                  >
                    <option value="ALL">📟 كافة أجهزة البصمة بالسحابة</option>
                    {devices.map(d => (
                      <option key={d.serial_number} value={d.serial_number}>
                        {d.device_name || 'MB20'} ({d.branch_name || 'بدون فرع'}) [{d.serial_number}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    تحديد الموظف داخل الماكينة / الفرع:
                  </label>
                  <select
                    value={excelEmpId}
                    onChange={(e) => setExcelEmpId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', fontWeight: 700, background: '#ffffff' }}
                  >
                    {filteredExcelEmployees.length === 0 ? (
                      <option value="ALL">⚠️ لا يوجد موظفين مسجلين بهذه الماكينة</option>
                    ) : (
                      <option value="ALL">
                        {excelDeviceSn !== 'ALL' 
                          ? `👥 كافة موظفي هذه الماكينة (${filteredExcelEmployees.length} موظف)` 
                          : '👥 كافة موظفي وكوادر المؤسسة'}
                      </option>
                    )}
                    {filteredExcelEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.code || emp.id})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>
                    الفرع المرتبط بالماكينة:
                  </label>
                  {excelDeviceSn !== 'ALL' && (
                    <span style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 800, background: '#f0f9ff', padding: '2px 8px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                      🔒 تم التحديد التلقائي وقفل الفرع للمحافظة على دقة الكشف
                    </span>
                  )}
                </div>
                <select
                  value={excelBranchId}
                  onChange={(e) => setExcelBranchId(e.target.value)}
                  disabled={excelDeviceSn !== 'ALL'}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    background: excelDeviceSn !== 'ALL' ? '#f8fafc' : '#ffffff',
                    color: excelDeviceSn !== 'ALL' ? '#64748b' : '#0f172a',
                    cursor: excelDeviceSn !== 'ALL' ? 'not-allowed' : 'default'
                  }}
                >
                  <option value="ALL">🏥 كافة الفروع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    من تاريخ:
                  </label>
                  <input
                    type="date"
                    value={excelDateFrom}
                    onChange={(e) => setExcelDateFrom(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo' }}
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
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo' }}
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
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'Cairo', background: '#ffffff' }}
                >
                  <option value="ALL">🔄 كل الحركات (حضور + انصراف)</option>
                  <option value="check_in">🟢 حركات الحضور فقط</option>
                  <option value="check_out">🚪 حركات الانصراف فقط</option>
                </select>
              </div>

              {/* خيارات منع التكرار الذكي */}
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '14px' }}>
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
                  fontSize: '1rem',
                  cursor: isExportingExcel ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)',
                  marginTop: '8px'
                }}
              >
                <span>📥</span> {isExportingExcel ? 'جاري تجهيز الشيت المطور...' : 'تصدير شيت إكسيل احترافي وتنزيله الآن'}
              </button>
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

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 800, color: '#15803d', marginTop: '6px' }}>
                  <input
                    type="checkbox"
                    checked={waConfig.notifyEmployee !== false}
                    onChange={(e) => setWaConfig({ ...waConfig, notifyEmployee: e.target.checked })}
                  />
                  <span>📲 إرسال إشعار فوري إلى هاتف الموظف نفسه عند تبصيمه (على رقم الواتساب المسجل بملفه)</span>
                </label>

                <div style={{ background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: '10px', padding: '8px 12px', fontSize: '0.82rem', color: '#166534', marginRight: '24px', lineHeight: '1.5' }}>
                  🌟 <strong>التعرف اللحظي التلقائي:</strong> عند تبصيم أي موظف (حضور أو انصراف) بجهاز البصمة أو كشك البصمة، يتعرف النظام على هويته ويرسل له رسالة ترحيبية فورية مع توثيق وقت وبصمة الحضور/الانصراف والفرع.
                </div>
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

          {/* نموذج ومعاينة رسالة الإشعار الحية مع إمكانية التعديل الكامل */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '22px', marginTop: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <h4 style={{ margin: 0, color: '#0f172a', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✏️</span> تخصيص ومعاينة قالب رسالة إشعار الواتساب الحية
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  يمكنك تعديل نص الرسالة وإضافة أو حذف المتغيرات الذكية، وستشاهد المعاينة الحية مباشرة أدناه:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWaConfig({ ...waConfig, adminMessageTemplate: DEFAULT_WA_ADMIN_TEMPLATE })}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                🔄 استعادة النموذج الافتراضي
              </button>
            </div>

            {/* أزرار إدراج المتغيرات الذكية */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                اضغط على أي متغير لإدراجه في نص الرسالة:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { tag: '{employee_name}', label: '👤 اسم الموظف' },
                  { tag: '{branch_name}', label: '🏢 الفرع' },
                  { tag: '{action}', label: '📌 نوع الحركة (حضور/انصراف)' },
                  { tag: '{action_icon}', label: '🟢 أيقونة الحركة' },
                  { tag: '{time}', label: '🕒 الوقت' },
                  { tag: '{date}', label: '📅 التاريخ' },
                  { tag: '{verify_type}', label: '🧬 وسيلة التحقق' },
                  { tag: '{device_name}', label: '📟 اسم الماكينة' },
                  { tag: '{company_name}', label: '🏛️ اسم المؤسسة' }
                ].map(item => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => {
                      const cur = waConfig.adminMessageTemplate || DEFAULT_WA_ADMIN_TEMPLATE;
                      setWaConfig({
                        ...waConfig,
                        adminMessageTemplate: cur + '\n' + item.tag
                      });
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#15803d',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Cairo'
                    }}
                    title={`إدراج ${item.tag}`}
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* محرر نص القالب */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  محرر نص القالب (Template Editor):
                </label>
                <textarea
                  rows={10}
                  value={waConfig.adminMessageTemplate !== undefined ? waConfig.adminMessageTemplate : DEFAULT_WA_ADMIN_TEMPLATE}
                  onChange={(e) => setWaConfig({ ...waConfig, adminMessageTemplate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.88rem',
                    fontFamily: 'Cairo',
                    lineHeight: '1.6',
                    direction: 'rtl',
                    background: '#fafafa',
                    boxSizing: 'border-box'
                  }}
                  placeholder="اكتب قالب رسالة الواتساب هنا..."
                />
              </div>

              {/* المعاينة الحية لشات واتساب */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  معاينة شات واتساب الحية (Live WhatsApp Preview):
                </label>
                <div
                  style={{
                    background: '#e5ddd5',
                    padding: '16px',
                    borderRadius: '14px',
                    border: '1px solid #cbd5e1',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
                    minHeight: '220px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start'
                  }}
                >
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '14px 16px',
                      borderRadius: '10px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                      maxWidth: '340px',
                      width: '100%',
                      marginRight: 'auto',
                      borderTopRightRadius: '0',
                      fontSize: '0.85rem',
                      lineHeight: '1.7',
                      color: '#111827',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'Cairo',
                      wordBreak: 'break-word'
                    }}
                  >
                    {(waConfig.adminMessageTemplate || DEFAULT_WA_ADMIN_TEMPLATE)
                      .replace(/{employee_name}/g, 'د. أحمد خالد')
                      .replace(/{branch_name}/g, 'فرع المدينة الجامعية')
                      .replace(/{action}/g, 'تسجيل حضور')
                      .replace(/{action_icon}/g, '🟢')
                      .replace(/{time}/g, '09:15:30 ص')
                      .replace(/{date}/g, '28/09/2026')
                      .replace(/{verify_type}/g, 'بصمة إصبع (MB20)')
                      .replace(/{device_name}/g, 'جهاز بصمة الإدارة')
                      .replace(/{company_name}/g, state?.orgSettings?.orgName || 'مجموعة صيدليات المروة والدكتور سيف')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── التبويب 2: ربط أرقام الموظفين PIN ──────────────────────────────────── */}
      {activeSubTab === 'mapping' && (() => {
        const filteredMappingEmps = employees.filter(emp => {
          const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
          const currentPin = prof?.device_user_pin || emp.code || emp.id || '';
          if (pinBranchFilter !== 'ALL' && String(emp.branchId) !== String(pinBranchFilter)) {
            return false;
          }
          if (pinSearchTerm.trim()) {
            const q = pinSearchTerm.trim().toLowerCase();
            const matchName = (emp.name || '').toLowerCase().includes(q);
            const matchCode = String(emp.code || '').toLowerCase().includes(q);
            const matchPin = String(currentPin).toLowerCase().includes(q);
            if (!matchName && !matchCode && !matchPin) return false;
          }
          return true;
        });

        return (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '18px', color: '#166534', fontSize: '0.9rem' }}>
              💡 <strong>ملاحظة هامة:</strong> رقم الـ (Device PIN) هو المعرّف الرقمي للموظف على ماكينة البصمة. النظام يربطه تلقائياً بكود الموظف، وبإمكانك هنا تعديله أو تخصيصه لكل موظف بنقرة واحدة، ثم الضغط على زر الترحيل لكي تظهر أسماؤهم على شاشة الماكينة LCD.
            </div>

            {/* شريط البحث والفلترة بالفرع */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
              <div style={{ flex: '1 1 260px', position: 'relative' }}>
                <input
                  type="text"
                  value={pinSearchTerm}
                  onChange={(e) => setPinSearchTerm(e.target.value)}
                  placeholder="🔍 بحث باسم الموظف أو الكود أو رقم PIN..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo'
                  }}
                />
                {pinSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setPinSearchTerm('')}
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 800, fontSize: '0.95rem' }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div style={{ flex: '0 1 240px' }}>
                <select
                  value={pinBranchFilter}
                  onChange={(e) => setPinBranchFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    background: '#ffffff'
                  }}
                >
                  <option value="ALL">🏥 كافة الفروع ({branches.length})</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ padding: '6px 12px', background: '#e2e8f0', borderRadius: '8px', fontSize: '0.82rem', color: '#334155', fontWeight: 700 }}>
                عرض {filteredMappingEmps.length} من {employees.length} موظف
              </div>
            </div>

            <div style={{ overflowX: 'auto', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'right' }}>
                    <th style={{ padding: '12px' }}>اسم الموظف</th>
                    <th style={{ padding: '12px' }}>كود الموظف بالـ HR</th>
                    <th style={{ padding: '12px' }}>الفرع</th>
                    <th style={{ padding: '12px' }}>رقم PIN على ماكينة البصمة</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>الإجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMappingEmps.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                        لم يتم العثور على أي موظف يطابق البحث أو الفرع المختار.
                      </td>
                    </tr>
                  ) : (
                    filteredMappingEmps.map(emp => {
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
                          <td style={{ padding: '12px', textAlign: 'center' }}>
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── التبويب 3: السجل الحي اللحظي ────────────────────────────────────────── */}
      {activeSubTab === 'logs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>
              🔴 تدفق الحركات اللحظية المباشرة من الأجهزة (Live Event Stream):
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                disabled={isClearingLogs}
                onClick={handleClearLogs}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  cursor: isClearingLogs ? 'not-allowed' : 'pointer',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {isClearingLogs ? '⏳ جاري التفريغ...' : '🗑️ مسح وتفريغ السجل الحي'}
              </button>
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
                        {log.verify_type === 'FACE' ? (
                          <span style={{
                            background: '#f0fdf4',
                            color: '#166534',
                            border: '1px solid #86efac',
                            padding: '3px 9px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            👤 جهاز بصمة الوجه (MB20)
                          </span>
                        ) : (
                          <span style={{
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            padding: '3px 9px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            👆 جهاز بصمة الإصبع (MB20)
                          </span>
                        )}
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



      {/* ── Modal 0: نافذة تحميل ملفات الفلاشة USB وضبط الجهاز السريع ────────────── */}
      {showUsbConfigModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '26px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '26px' }}>💾</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    تهيئة ماكينة البصمة بملف الفلاشة USB أو الضبط السريع
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                    الماكينة: <strong>{selectedDeviceSnForUsers}</strong> | خادم السحابة: <strong>63.183.147.199:80</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowUsbConfigModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {/* الخيار 1: تحميل ملفات الفلاشة مباشرة */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', marginBottom: '18px' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.96rem', color: '#1e293b', fontWeight: 800 }}>
                📁 الخيار الأول: تنزيل ملفات الفلاشة الجاهزة (Plug & Play)
              </h4>
              <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: '#475569', lineHeight: '1.6' }}>
                قم بتنزيل الملفات التالية وضعها في الفلاشة مباشرة (Root Directory)، ثم وصّلها بالماكينة واستورد التهيئة:
              </p>

              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>✅</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#065f46' }}>
                  تم تسجيل الماكينة تلقائياً في قاعدة بيانات النظام والسحابة بحالة جاهزية للربط (Configured & Registered).
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={handleDownloadAllUsbFiles}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
                  }}
                >
                  📦 تنزيل حزمة الملفات بالكامل (5 ملفات دفعة واحدة)
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUsbFile('zkhost.cfg', usbConfigData?.files?.['zkhost.cfg'] || `[ADMS_SERVER]\r\nServerURL=http://63-183-147-199.sslip.io\r\nServerIP=63.183.147.199\r\nServerPort=80\r\nServerPath=/iclock/cdata\r\nPushEnabled=1\r\nDeviceSerial=${selectedDeviceSnForUsers}\r\nHeartbeatInterval=5\r\n`)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📥 zkhost.cfg
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUsbFile('sys.cfg', usbConfigData?.files?.['sys.cfg'] || `ServerIP=63.183.147.199\r\nServerPort=80\r\nDeviceSerial=${selectedDeviceSnForUsers}\r\nPushProtocol=ADMS\r\n`)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📥 sys.cfg
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUsbFile('options.cfg', usbConfigData?.files?.['options.cfg'] || `~DeviceLogo=1\r\nDisplayLogo=1\r\nServerIP=63.183.147.199\r\nServerPort=80\r\nPushServerIP=63.183.147.199\r\nPushServerPort=80\r\nPushServerPath=/iclock/cdata\r\nPushProtocol=ADMS\r\n`)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📥 options.cfg
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUsbFile('adms_config.ini', usbConfigData?.files?.['adms_config.ini'] || `[ADMS_SERVER]\r\nServerURL=http://63-183-147-199.sslip.io\r\nServerIP=63.183.147.199\r\nServerPort=80\r\nServerPath=/iclock/cdata\r\nPushEnabled=1\r\nDeviceSerial=${selectedDeviceSnForUsers}\r\nHeartbeatInterval=5\r\n`)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#7c3aed',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📥 adms_config.ini
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadUsbFile('COMM.CFG', usbConfigData?.files?.['COMM.CFG'] || `[COMM]\r\nIPAddress=192.168.1.201\r\nNetMask=255.255.255.0\r\nGATEIPAddress=192.168.1.1\r\nServerIP=63.183.147.199\r\nServerPort=80\r\n`)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#475569',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  📥 COMM.CFG
                </button>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#64748b', background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', lineHeight: '1.6' }}>
                📌 <strong>طريقة التشغيل على الماكينة:</strong><br />
                1. انسخ الملفات لفلاشة مفرمتة <strong>FAT32</strong>.<br />
                2. وصّل الفلاشة بمنفذ USB في ماكينة البصمة ZKTeco.<br />
                3. من قائمة الماكينة (M/OK) ➔ اختر <strong>إدارة USB (USB Mgt)</strong> ➔ <strong>استيراد التهيئة (Upload Data/Config)</strong>.
              </div>
            </div>

            {/* الخيار 2: الضبط اليدوي على الشاشة في 30 ثانية (الأسهل والأسرع) */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.96rem', color: '#1e40af', fontWeight: 800 }}>
                  ⚡ الخيار الثاني: الضبط من شاشة الماكينة في 30 ثانية (موصى به)
                </h4>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#1e3a8a', lineHeight: '1.6' }}>
                لا تحتاج لفلاشة! يمكنك إدخال بيانات السحابة مباشرة على شاشة الماكينة بضغطة زر:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>عنوان الخادم (Server IP / Domain)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <code style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>63.183.147.199</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('63.183.147.199');
                        showToast?.('📋 تم نسخ عنوان السيرفر');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                      title="نسخ"
                    >
                      📋
                    </button>
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>المنفذ (Server Port)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <code style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>80</code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('80');
                        showToast?.('📋 تم نسخ المنفذ');
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                      title="نسخ"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#1e3a8a', lineHeight: '1.7' }}>
                <strong>الخطوات من أزرار الماكينة:</strong><br />
                1. اضغط <strong>M/OK</strong> ➔ ادخل على <strong>الاتصال (Comm.)</strong> ➔ <strong>خادم السحابة (Cloud Server / ADMS)</strong>.<br />
                2. فعّل خيار <strong>Enable Cloud Server = ON</strong>.<br />
                3. اكتب عنوان الخادم: <strong>63.183.147.199</strong> والمنفذ: <strong>80</strong>.<br />
                4. ارجع للشاشة الرئيسية، ستظهر علامة الكرة الأرضية أو السحابة خضراء 🌐 وتتصل الماكينة فوراً بالنظام!
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => setShowUsbConfigModal(false)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                إغلاق
              </button>
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

              <button
                type="button"
                disabled={isClearingCommands[selectedDeviceForManage.serial_number]}
                onClick={() => handleClearDeviceCommands(selectedDeviceForManage.serial_number)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: '#fff1f2',
                  color: '#e11d48',
                  border: '1px solid #fecdd3',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: isClearingCommands[selectedDeviceForManage.serial_number] ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontFamily: 'Cairo',
                  boxShadow: '0 1px 3px rgba(225, 29, 72, 0.08)'
                }}
              >
                <span>🛑</span>
                {isClearingCommands[selectedDeviceForManage.serial_number] ? 'جاري إلغاء الأوامر وفك التعليق...' : 'إلغاء أي أمر معلق وتفريغ طابور الماكينة (Unblock)'}
              </button>

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
      {/* ── Modal 5: تخصيص وتحديث خلفية / لوجو شاشة ماكينة البصمة ─────────────────── */}
      {showWallpaperModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '26px' }}>🖼️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    تخصيص خلفية وشعار شاشة ماكينة البصمة (ZKTeco Screen Wallpaper)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    الماكينة المستهدفة: <strong>{testDeviceSn || selectedDeviceSnForUsers || devices[0]?.serial_number}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWallpaperModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            {/* تقرير خبير الأجهزة: الدعم الفني لخلفيات ZKTeco MB20 */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.82rem', color: '#334155', lineHeight: '1.6' }}>
              <div style={{ fontWeight: 800, color: '#0369a1', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔍 تقرير خبير أجهزة ZKTeco MB20:</span>
              </div>
              <ul style={{ margin: 0, paddingRight: '18px' }}>
                <li><strong>التحكم السحابي (ADMS):</strong> يقوم بتغيير سمة الألوان (Theme)، شعار المؤسسة، واسم الصيدلية المعروض على شريط الحالة العلوي للماكينة فوراً.</li>
                <li><strong>صورة الخلفية التامة (Custom Wallpaper):</strong> ماكينات ZKTeco MB20 بمعالج ZLM60 تدعم تحميل صورة خلفية عبر <strong>فلاشة USB</strong>: ضع صورة بأبعاد <code>320x240</code> بكسل، صيغة <code>JPG</code> وحجم أقل من 30KB داخل مجلد <code>wallpaper</code> في فلاشة FAT32، ثم استوردها من قائمة: <em>USB Mgt ➔ Upload ➔ Wallpaper</em>.</li>
              </ul>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                اختر جهاز البصمة المراد تعيين الخلفية له:
              </label>
              <select
                value={testDeviceSn}
                onChange={(e) => setTestDeviceSn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontFamily: 'Cairo',
                  fontWeight: 700
                }}
              >
                {devices.map(d => (
                  <option key={d.serial_number} value={d.serial_number}>
                    {d.device_name || 'MB20'} ({d.branch_name || 'الفرع'}) [{d.serial_number}]
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                اختر قالب وتصميم الخلفية المفضل:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { id: 'luxury_pharmacy', title: '🏥 صيدلية فاخرة وحديثة', desc: 'مظهر احترافي فائق بألوان زرقاء وطبية أنيقة' },
                  { id: 'medical_emblem', title: '⚕️ الشعار الطبي العصري', desc: 'خلفية داكنة مع رمز الصيدلية والدواء الذهبي' },
                  { id: 'corporate_clean', title: '🏢 مؤسسي كلاسيكي نظيف', desc: 'تصميم بسيط ومريح للعين مع درجات الرصاصي والأزرق' },
                  { id: 'custom', title: '✨ الشعار المخصص للصيدلية', desc: 'عرض شعار الصيدلية الرسمي كشاشة توقف وشاشة رئيسية' }
                ].map(theme => (
                  <div
                    key={theme.id}
                    onClick={() => setSelectedWallpaperTheme(theme.id)}
                    style={{
                      border: '2px solid ' + (selectedWallpaperTheme === theme.id ? '#0284c7' : '#e2e8f0'),
                      background: selectedWallpaperTheme === theme.id ? '#f0f9ff' : '#ffffff',
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', marginBottom: '4px' }}>{theme.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: '1.4' }}>{theme.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* معاينة الشاشة الافتراضية */}
            <div style={{ background: '#0f172a', borderRadius: '14px', padding: '16px', color: '#ffffff', textAlign: 'center', marginBottom: '18px', border: '3px solid #334155', position: 'relative' }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '6px' }}>📱 محاكاة شاشة ماكينة ZKTeco TFT Color</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'monospace', color: '#38bdf8' }}>
                12:45<span style={{ fontSize: '1rem', color: '#94a3b8' }}>:00</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '2px' }}>
                {selectedWallpaperTheme === 'luxury_pharmacy' && '🏥 صيدلية النخبة التخصصية'}
                {selectedWallpaperTheme === 'medical_emblem' && '⚕️ رعاية طبية متكاملة 24/7'}
                {selectedWallpaperTheme === 'corporate_clean' && '🏢 نظام الحضور الذكي الموحد'}
                {selectedWallpaperTheme === 'custom' && '✨ شعار وهوية الصيدلية المعتمدة'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: '6px' }}>● متصل بالسحابة (ADMS Online)</div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleSetDeviceWallpaper(testDeviceSn, selectedWallpaperTheme)}
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
                🚀 تطبيق وإرسال الخلفية لشاشة الماكينة فوراً
              </button>
              <button
                type="button"
                onClick={() => setShowWallpaperModal(false)}
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
          </div>
        </div>
      )}

      {/* ── Modal 6: الفحص والاختبار التفاعلي الذاتي للماكينة ──────────────────────── */}
      {showTestModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '26px' }}>🧪</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    الفحص والتشخيص التفاعلي الذاتي للماكينة (Hardware Self-Test)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    الماكينة: <strong>{testDeviceSn || selectedDeviceSnForUsers || devices[0]?.serial_number}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                اختر جهاز البصمة المستهدف للفحص:
              </label>
              <select
                value={testDeviceSn}
                onChange={(e) => setTestDeviceSn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontFamily: 'Cairo',
                  fontWeight: 700
                }}
              >
                {devices.map(d => (
                  <option key={d.serial_number} value={d.serial_number}>
                    {d.device_name || 'MB20'} ({d.branch_name || 'الفرع'}) [{d.serial_number}]
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>🔊 فحص مكبر الصوت (Voice: شكراً لك)</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إرسال أمر النبرة الصوتية "Thank You" للتحقق من سلامة السماعة (أمر صوتي آمن لا يعيد تشغيل الماكينة)</div>
                </div>
                <button
                  type="button"
                  disabled={isTestingDevice}
                  onClick={() => handleSendTestCommand('voice_thankyou', testDeviceSn)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: isTestingDevice ? 'not-allowed' : 'pointer' }}
                >
                  اختبار الصوت
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>👆 فحص حساس بصمة الإصبع (Sensor Check)</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إضاءة حساس البصمة والتأكد من سلامة كاشف السيليكون الضوئي</div>
                </div>
                <button
                  type="button"
                  disabled={isTestingDevice}
                  onClick={() => handleSendTestCommand('sensor', testDeviceSn)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#059669', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: isTestingDevice ? 'not-allowed' : 'pointer' }}
                >
                  فحص الحساس
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>📺 فحص شاشة العرض LCD والألوان</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>اختبار إضاءة شاشة العرض TFT ووضوح عناصر واجهة الماكينة</div>
                </div>
                <button
                  type="button"
                  disabled={isTestingDevice}
                  onClick={() => handleSendTestCommand('lcd', testDeviceSn)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: isTestingDevice ? 'not-allowed' : 'pointer' }}
                >
                  فحص الشاشة
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>⚡ نبض فحص الاتصال الفوري (Live Pulse Ping)</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إرسال نبضة CHECK للتأكد من استجابة بروتوكول ADMS ومزامنة التوقيت</div>
                </div>
                <button
                  type="button"
                  disabled={isTestingDevice}
                  onClick={() => handleSendTestCommand('ping', testDeviceSn)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#d97706', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: isTestingDevice ? 'not-allowed' : 'pointer' }}
                >
                  إرسال النبضة
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 7: نافذة إرسال قالب البصمة لفرع/ماكينة محددة ──────────────────────── */}
      {dispatchModalTpl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🏢</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    إرسال قالب البصمة إلى فرع محدد
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    الموظف: <strong>{(() => {
                      const emp = employees.find(e => String(e.id) === String(dispatchModalTpl.employee_id) || String(e.code) === String(dispatchModalTpl.device_user_pin));
                      return emp?.name || dispatchModalTpl.employee_name || `موظف PIN: ${dispatchModalTpl.device_user_pin}`;
                    })()}</strong> (PIN: {dispatchModalTpl.device_user_pin})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchModalTpl(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                اختر الفرع / ماكينة البصمة المستهدفة:
              </label>
              <select
                value={dispatchTargetDeviceSn}
                onChange={(e) => setDispatchTargetDeviceSn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  fontFamily: 'Cairo',
                  fontWeight: 700,
                  background: '#ffffff'
                }}
              >
                {devices.map(d => {
                  const bName = d.branch_name || branches.find(b => b.id === d.branch_id)?.name || 'الفرع';
                  const isSource = d.serial_number === dispatchModalTpl.source_device_sn;
                  return (
                    <option key={d.serial_number} value={d.serial_number}>
                      {d.device_name || 'ماكينة'} - {bName} [{d.serial_number}] {isSource ? '(ماكينة التسجيل الأصلية)' : ''}
                    </option>
                  );
                })}
              </select>
              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                💡 سيقوم السيرفر بترحيل بيانات الموظف والقالب البيومتري فوراً للماكينة المختارة عبر بروتوكول ADMS.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                disabled={isDispatchingSingleTpl || !dispatchTargetDeviceSn}
                onClick={handleDispatchTemplateToSingleBranch}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: (isDispatchingSingleTpl || !dispatchTargetDeviceSn) ? 'not-allowed' : 'pointer',
                  fontFamily: 'Cairo'
                }}
              >
                {isDispatchingSingleTpl ? '⏳ جاري الإرسال...' : '🚀 إرسال البصمة للفرع المختار'}
              </button>
              <button
                type="button"
                onClick={() => setDispatchModalTpl(null)}
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
          </div>
        </div>
      )}

      {/* ── Modal 8: نافذة تعديل بيانات قالب البصمة في الخزنة السحابية ───────────────── */}
      {editingTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>✏️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    تعديل بيانات القالب في الخزنة السحابية
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    معرف القالب: <strong>#{editingTemplate.id}</strong> | النوع: <strong>{editingTemplate.bio_type === 9 ? 'بصمة وجه' : `بصمة إصبع #${editingTemplate.finger_id ?? 0}`}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplateEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  ربط القالب بموظف من النظام:
                </label>
                <select
                  value={editTplEmpId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setEditTplEmpId(selId);
                    if (selId) {
                      const emp = employees.find(em => String(em.id) === String(selId));
                      if (emp) {
                        setEditTplName(emp.name);
                        const prof = profiles.find(p => String(p.employee_id) === String(emp.id));
                        if (prof?.device_user_pin) {
                          setEditTplPin(prof.device_user_pin);
                        } else if (emp.code) {
                          setEditTplPin(emp.code);
                        }
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    background: '#ffffff'
                  }}
                >
                  <option value="">-- غير مرتبط بموظف محدد (حر) --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.code || 'بدون كود'}) - {branches.find(b => b.id === emp.branchId)?.name || 'الفرع الرئيسي'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اسم الموظف المعروض (Display Name):
                </label>
                <input
                  type="text"
                  required
                  value={editTplName}
                  onChange={(e) => setEditTplName(e.target.value)}
                  placeholder="مثال: د. أحمد محمد"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo',
                    fontWeight: 700
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  رقم الـ PIN على ماكينة البصمة:
                </label>
                <input
                  type="text"
                  required
                  value={editTplPin}
                  onChange={(e) => setEditTplPin(e.target.value)}
                  placeholder="مثال: 107"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.95rem',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    textAlign: 'center'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingTplEdit}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: isSavingTplEdit ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo'
                  }}
                >
                  {isSavingTplEdit ? '⏳ جاري الحفظ...' : '💾 حفظ التعديلات'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
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
      {/* ── Modal: إعادة تسجيل البصمة على ماكينة الإدارة ── */}
      {reEnrollModalTpl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
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
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🔄</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  إعادة تسجيل البصمة على ماكينة الإدارة
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReEnrollModalTpl(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', border: '1px solid #e2e8f0', fontSize: '0.88rem' }}>
              <div>👤 <strong>الموظف:</strong> {reEnrollModalTpl.employee_name || 'غير محدد'} (PIN: {reEnrollModalTpl.device_user_pin})</div>
              <div>🧬 <strong>نوع القالب:</strong> {reEnrollModalTpl.template_type === 'face' ? '👤 بصمة وجه' : `👆 بصمة إصبع #${reEnrollModalTpl.finger_id ?? 0}`}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  اختر ماكينة البصمة (بصمة الإدارة المستهدفة):
                </label>
                <select
                  value={reEnrollTargetDeviceSn}
                  onChange={(e) => setReEnrollTargetDeviceSn(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontFamily: 'Cairo',
                    fontWeight: 700,
                    background: '#ffffff'
                  }}
                >
                  {devices.map(d => {
                    const isHq = (d.device_name || '').includes('إدارة') || (d.device_name || '').includes('ادارة') || (d.branch_name || '').includes('إدارة') || (d.branch_name || '').includes('ادارة');
                    return (
                      <option key={d.serial_number} value={d.serial_number}>
                        {isHq ? '⭐ [ماكينة الإدارة] ' : ''}{d.device_name || 'MB20'} ({d.branch_name || 'بدون فرع'}) [{d.serial_number}]
                      </option>
                    );
                  })}
                </select>
              </div>

              {reEnrollModalTpl.template_type !== 'face' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    رقم الإصبع المراد إعادة تسجيله:
                  </label>
                  <select
                    value={reEnrollFingerId}
                    onChange={(e) => setReEnrollFingerId(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontFamily: 'Cairo',
                      fontWeight: 700,
                      background: '#ffffff'
                    }}
                  >
                    <option value={0}>👍 الإبهام الأيمن (Finger 0)</option>
                    <option value={1}>👉 السبابة اليمنى (Finger 1 - أساسي)</option>
                    <option value={2}>🖕 الوسطى اليمنى (Finger 2)</option>
                    <option value={3}>💍 البنصر الأيمن (Finger 3)</option>
                    <option value={4}>🖐️ الخنصر الأيمن (Finger 4)</option>
                    <option value={5}>👍 الإبهام الأيسر (Finger 5)</option>
                    <option value={6}>👈 السبابة اليسرى (Finger 6 - بديل)</option>
                    <option value={7}>🖕 الوسطى اليسرى (Finger 7)</option>
                    <option value={8}>💍 البنصر الأيسر (Finger 8)</option>
                    <option value={9}>🖐️ الخنصر الأيسر (Finger 9)</option>
                  </select>
                </div>
              )}

              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '10px', padding: '10px 12px', fontSize: '0.82rem', color: '#92400e', lineHeight: 1.6 }}>
                💡 <strong>تعليمات الماكينة:</strong> فور إرسال الأمر، ستضيء ماكينة البصمة ويطلب من الموظف وضع إصبعه على الحساس 3 مرات. يتم التقاط البصمة وتحديث الخزنة السحابية تلقائياً.
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  disabled={isSubmittingReEnroll || !reEnrollTargetDeviceSn}
                  onClick={handleConfirmReEnroll}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: (isSubmittingReEnroll || !reEnrollTargetDeviceSn) ? 'not-allowed' : 'pointer',
                    fontFamily: 'Cairo',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)'
                  }}
                >
                  {isSubmittingReEnroll ? '⏳ جاري إرسال الأمر للماكينة...' : '🚀 إرسال أمر إعادة التسجيل للماكينة'}
                </button>
                <button
                  type="button"
                  onClick={() => setReEnrollModalTpl(null)}
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
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: خيارات مسح بصمات أو مستخدم الماكينة ── */}
      {deleteUserModalData && (() => {
        const { user, userTpls = [] } = deleteUserModalData;
        const FINGER_NAMES = {
          0: '👍 الإبهام الأيمن (Finger #0)',
          1: '👉 السبابة اليمنى (Finger #1)',
          2: '🖕 الوسطى اليمنى (Finger #2)',
          3: '💍 البنصر الأيمن (Finger #3)',
          4: '🖐️ الخنصر الأيمن (Finger #4)',
          5: '👍 الإبهام الأيسر (Finger #5)',
          6: '👈 السبابة اليسرى (Finger #6)',
          7: '🖕 الوسطى اليسرى (Finger #7)',
          8: '💍 البنصر الأيسر (Finger #8)',
          9: '🖐️ الخنصر الأيسر (Finger #9)'
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(5px)',
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
                borderRadius: '20px',
                padding: '24px',
                width: '100%',
                maxWidth: '540px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                direction: 'rtl'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px' }}>🗑️</span>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#991b1b' }}>
                    تحديد نطاق مسح البصمة / المستخدم
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteUserModalData(null)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ background: '#fef2f2', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', border: '1px solid #fecaca', fontSize: '0.88rem', color: '#991b1b' }}>
                <div>👤 <strong>الموظف:</strong> {user.display_name || user.name || 'مستخدم'} (PIN: {user.device_user_pin})</div>
                <div>📟 <strong>الماكينة:</strong> {selectedDeviceSnForUsers}</div>
                <div>🧬 <strong>عدد البصمات المسجلة له بالسحابة:</strong> {userTpls.length} بصمة</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#334155' }}>
                  اختر الإجراء المطلوب تنفيذه على الماكينة:
                </span>

                {/* خيار 1: حذف إصبع محدد */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '10px', border: `1px solid ${deleteScope === 'single_finger' ? '#dc2626' : '#e2e8f0'}`, background: deleteScope === 'single_finger' ? '#fff5f5' : '#ffffff', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="deleteScope"
                    value="single_finger"
                    checked={deleteScope === 'single_finger'}
                    onChange={() => setDeleteScope('single_finger')}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: '0.88rem', color: '#111827', display: 'block' }}>
                      👆 حذف بصمة إصبع محدد فقط
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      إزالة بصمة إصبع معين من الماكينة وترك باقي أصابع الموظف وحسابه سليماً.
                    </span>

                    {deleteScope === 'single_finger' && (
                      <div style={{ marginTop: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                          اختر الإصبع المراد حذفه:
                        </label>
                        <select
                          value={deleteFingerId}
                          onChange={(e) => setDeleteFingerId(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.85rem',
                            fontFamily: 'Cairo',
                            fontWeight: 700,
                            background: '#ffffff'
                          }}
                        >
                          {userTpls.length > 0 ? (
                            userTpls.map(t => (
                              <option key={t.finger_id} value={t.finger_id}>
                                {FINGER_NAMES[t.finger_id] || `بصمة إصبع #${t.finger_id}`}
                              </option>
                            ))
                          ) : (
                            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fid => (
                              <option key={fid} value={fid}>{FINGER_NAMES[fid]}</option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                </label>

                {/* خيار 2: حذف كافة بصمات الموظف فقط */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '10px', border: `1px solid ${deleteScope === 'all_fingers' ? '#dc2626' : '#e2e8f0'}`, background: deleteScope === 'all_fingers' ? '#fff5f5' : '#ffffff', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="deleteScope"
                    value="all_fingers"
                    checked={deleteScope === 'all_fingers'}
                    onChange={() => setDeleteScope('all_fingers')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: '#111827', display: 'block' }}>
                      🖐️ حذف جميع بصمات الموظف (مع إبقاء حسابه وسجلاته)
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      مسح كافة قوالب الأصابع للموظف على الماكينة مع بقاء اسمه وكود PIN في قائمة المستخدمين لتسجيل بصمة جديدة له لاحقاً.
                    </span>
                  </div>
                </label>

                {/* خيار 3: حذف كامل للمستخدم وكافة بصماته */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', borderRadius: '10px', border: `1px solid ${deleteScope === 'full_user' ? '#dc2626' : '#e2e8f0'}`, background: deleteScope === 'full_user' ? '#fff5f5' : '#ffffff', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="deleteScope"
                    value="full_user"
                    checked={deleteScope === 'full_user'}
                    onChange={() => setDeleteScope('full_user')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: '#dc2626', display: 'block' }}>
                      ⚠️ حذف المستخدم بالكامل من الماكينة (حذف شامل)
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      مسح ملف الموظف، اسمه، كود PIN، وكافة بصماته الحيوية نهائياً من ذاكرة جهاز البصمة.
                    </span>
                  </div>
                </label>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    disabled={isDeletingUserScope}
                    onClick={handleConfirmDeleteUserScope}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: isDeletingUserScope ? 'not-allowed' : 'pointer',
                      fontFamily: 'Cairo',
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
                    }}
                  >
                    {isDeletingUserScope ? '⏳ جاري تنفيذ أمر الحذف...' : '🗑️ تأكيد الحذف من الماكينة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteUserModalData(null)}
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
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
