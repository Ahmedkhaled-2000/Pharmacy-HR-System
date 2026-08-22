import React, { useState, useRef, useEffect } from 'react';
import { fetchCurrentIP } from '../../utils/deviceAuth';
import {
  exportFullBackup,
  restoreFullBackup,
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  getCustomBackupPath,
  setCustomBackupPath,
  pickBackupDirectory,
  fetchSnapshotsList,
  removeSnapshot
} from '../../utils/backupHelper';
import { apiFetchFaces, apiDeleteFace } from '../../utils/apiClient';
import GmailConfigCard from './GmailConfigCard';
import { DEFAULT_JOBS, getJobsList, DEFAULT_DEPARTMENTS, getDepartmentsList } from '../../utils/jobsHelper';

const ALL_REQUEST_TYPES = [
  { type: 'long_leave', label: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)' },
  { type: 'leave', label: 'طلبات الإجازات (سنوية / مرضي / عارضة <= 3 أيام)' },
  { type: 'loan', label: 'طلبات السلف الشهرية والتعليمات والآجل' },
  { type: 'credit_medicine', label: 'طلبات سحب الأدوية بالآجل' },
  { type: 'permission', label: 'طلبات أذونات وتأخيرات الموظفين' },
  { type: 'swap', label: 'طلبات تبديل الشفتات والورديات' },
  { type: 'roster_edit', label: 'طلبات تعديل الجداول الشهرية' },
  { type: 'bonus', label: 'طلبات وصرف المكافآت والحوافز' },
  { type: 'penalty', label: 'طلبات الخصومات والجزاءات' },
  { type: 'resignation', label: 'طلبات استقالة الموظفين' },
  { type: 'complaint', label: 'الشكاوى وملاحظات التقييم' },
  { type: 'punch_correction', label: 'طلبات تأكيد وتصحيح بصمات الوجه واليد' }
];

export default function SettingsModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'jobs' | 'permissions' | 'rules' | 'gmail' | 'ip' | 'backup'

  // Jobs & Roles Management State
  const jobsList = getJobsList(state);
  const departmentsList = getDepartmentsList(state);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [jobTitleInput, setJobTitleInput] = useState('');
  const [jobDeptInput, setJobDeptInput] = useState('');
  const [jobIsMgmtInput, setJobIsMgmtInput] = useState(false);
  const [jobDescInput, setJobDescInput] = useState('');
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [jobDeptFilter, setJobDeptFilter] = useState('all');

  // Departments Management State
  const [showDeptSection, setShowDeptSection] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [editingDeptName, setEditingDeptName] = useState(null);
  const [renameDeptInput, setRenameDeptInput] = useState('');

  const orgSettings = state.orgSettings || {};
  const [orgName, setOrgName] = useState(orgSettings.orgName || 'مجموعة الصيدليات الطبية');
  const [gmName, setGmName] = useState(orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات');
  const [logoUrl, setLogoUrl] = useState(orgSettings.logoUrl || '');
  const [adminUser, setAdminUser] = useState(orgSettings.adminUser || 'admin');
  const [adminPass, setAdminPass] = useState(orgSettings.adminPass || 'admin123');
  const [biometricType, setBiometricType] = useState(orgSettings.biometricType || 'face');

  // Monthly Loan Rules Settings
  const [loanRequestStartDay, setLoanRequestStartDay] = useState(orgSettings.loanRequestStartDay !== undefined ? orgSettings.loanRequestStartDay : 1);
  const [loanRequestEndDay, setLoanRequestEndDay] = useState(orgSettings.loanRequestEndDay !== undefined ? orgSettings.loanRequestEndDay : 10);
  const [maxMonthlyLoanSalaryPercent, setMaxMonthlyLoanSalaryPercent] = useState(orgSettings.maxMonthlyLoanSalaryPercent !== undefined ? orgSettings.maxMonthlyLoanSalaryPercent : 50);

  // Router IP Restrictions
  const ipRestrictions = state.ipRestrictions || { enabled: false, allowedIps: [] };
  const [ipEnabled, setIpEnabled] = useState(ipRestrictions.enabled);
  const [approvedIPs, setApprovedIPs] = useState(
    ipRestrictions.allowedIps.length > 0 
      ? ipRestrictions.allowedIps.map(ipObj => typeof ipObj === 'string' ? ipObj : ipObj.ip) 
      : (orgSettings.approvedIPs || ['192.168.1.1', '10.0.0.1'])
  );
  const [newIP, setNewIP] = useState('');
  const [isFetchingIp, setIsFetchingIp] = useState(false);

  // Backup State & Auto-Backup
  const fileInputRef = useRef(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [autoBackupOn, setAutoBackupOn] = useState(isAutoBackupEnabled());
  const [backupPath, setBackupPath] = useState(getCustomBackupPath());
  const [snapshots, setSnapshots] = useState([]);
  const [isPickingDir, setIsPickingDir] = useState(false);

  useEffect(() => {
    if (activeTab === 'backup') {
      fetchSnapshotsList().then((list) => setSnapshots(list || []));
    }
  }, [activeTab]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchSnapshotsList().then((list) => setSnapshots(list || []));
    };
    window.addEventListener('auto-backup-updated', handleUpdate);
    return () => window.removeEventListener('auto-backup-updated', handleUpdate);
  }, []);

  // Factory Reset / Data Wipe States
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmPassword, setWipeConfirmPassword] = useState('');
  const [wipeAutoBackup, setWipeAutoBackup] = useState(true);
  const [isWiping, setIsWiping] = useState(false);
  const [showWipePasswordText, setShowWipePasswordText] = useState(false);

  const handleExecuteFullDataWipe = async () => {
    const currentAdminPass = state.orgSettings?.adminPassword || state.orgSettings?.adminPass || '123';
    if (!wipeConfirmPassword || wipeConfirmPassword.trim() !== String(currentAdminPass).trim()) {
      showToast?.('❌ كلمة المرور غير صحيحة! يرجى إدخال كلمة مرور الإدارة العليا لتأكيد المسح.');
      return;
    }

    try {
      setIsWiping(true);
      showToast?.('⏳ جاري البدء في مسح وتصفير بيانات النظام...');

      // 1. If auto backup before wipe is checked, export full backup JSON
      if (wipeAutoBackup) {
        try {
          await exportFullBackup(state);
          showToast?.('💾 تم تنزيل نسخة أمان احتياطية تلقائياً قبل المسح.');
        } catch (bErr) {
          console.warn('Backup before wipe skipped or failed:', bErr);
        }
      }

      // 2. Clear all biometric face/hand descriptors from database
      try {
        const faces = await apiFetchFaces();
        if (Array.isArray(faces) && faces.length > 0) {
          for (const face of faces) {
            if (face.employee_id) {
              await apiDeleteFace(face.employee_id);
            }
          }
        }
      } catch (fErr) {
        console.warn('Error clearing biometric faces:', fErr);
      }

      // 3. Construct clean wiped state preserving Higher Management credentials
      const preservedAdminUser = state.orgSettings?.adminUsername || state.orgSettings?.adminUser || 'admin';
      const preservedAdminPass = state.orgSettings?.adminPassword || state.orgSettings?.adminPass || '123';
      const preservedOrgName = state.orgSettings?.orgName || 'مجموعة الصيدليات الطبية';
      const preservedGmName = state.orgSettings?.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
      const preservedLogo = state.orgSettings?.logoUrl || '';

      const wipedState = {
        employees: [],
        branches: [],
        shifts: [],
        activeShifts: {},
        adjustments: [],
        requests: [],
        resignationRequests: [],
        leaveRequests: [],
        leaveHistory: [],
        shiftSwaps: [],
        loans: [],
        evaluations: [],
        notifications: [],
        employeeNotes: [],
        authorizedDevices: [],
        logs: [],
        rosters: [],
        lateIncidents: [],
        breakLogs: [],
        permissionRequests: [],
        pendingDeviceRegistrations: [],
        approvedDevices: [],
        orgSettings: {
          ...(state.orgSettings || {}),
          adminUsername: preservedAdminUser,
          adminPassword: preservedAdminPass,
          adminUser: preservedAdminUser,
          adminPass: preservedAdminPass,
          orgName: preservedOrgName,
          generalManagerName: preservedGmName,
          logoUrl: preservedLogo
        },
        approvalRules: state.approvalRules || [],
        bylaws: state.bylaws || {
          gracePeriodMinutes: 15,
          resetPeriodDays: 30,
          latePenalties: [],
          earlyExitPenalties: [],
          deductionOptions: []
        },
        ipRestrictions: { enabled: false, allowedIps: [] },
        customJobs: state.customJobs || [],
        customDepartments: state.customDepartments || [],
        _deletedIds: [],
        _wipedAt: new Date().toISOString()
      };

      // 4. Save locally and sync to Cloud/MariaDB
      setState(wipedState);
      if (saveState) {
        await saveState(wipedState);
      }

      showToast?.('✅ تم مسح وتصفير كافة بيانات النظام وقاعدة البيانات بنجاح! تم الاحتفاظ ببيانات دخول الإدارة العليا.');
      setShowWipeModal(false);
      setWipeConfirmPassword('');
    } catch (err) {
      console.error('Data wipe failed:', err);
      showToast?.('❌ حدث خطأ أثناء مسح البيانات: ' + (err.message || err));
    } finally {
      setIsWiping(false);
    }
  };

  // Approval Rules Configuration & Add Modal States
  const [rules, setRules] = useState(() => (state.approvalRules && state.approvalRules.length > 0 ? state.approvalRules : [
    { id: 'rule_leave_over_3_days', requestType: 'long_leave', typeLabel: 'طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)', reqBranch: false, reqAdmin: true },
    { id: 'rule_loan', requestType: 'loan', typeLabel: 'طلبات السلف الشهرية والتعليمات والآجل', reqBranch: false, reqAdmin: true },
    { id: 'rule_meds', requestType: 'credit_medicine', typeLabel: 'طلبات سحب الأدوية بالآجل', reqBranch: false, reqAdmin: true },
    { id: 'rule_leave', requestType: 'leave', typeLabel: 'طلبات الإجازات (سنوية / مرضي / عارضة <= 3 أيام)', reqBranch: true, reqAdmin: true },
    { id: 'rule_swap', requestType: 'swap', typeLabel: 'طلبات تبديل الشفتات والورديات', reqBranch: true, reqAdmin: true },
    { id: 'rule_permission', requestType: 'permission', typeLabel: 'طلبات أذونات وتأخيرات الموظفين', reqBranch: true, reqAdmin: true },
    { id: 'rule_bonus', requestType: 'bonus', typeLabel: 'طلبات المكافآت والحوافز', reqBranch: true, reqAdmin: true }
  ]));
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleType, setNewRuleType] = useState('long_leave');
  const [newRuleLabel, setNewRuleLabel] = useState('طلبات الإجازة أكثر من ثلاث أيام في الشهر (سنوية أو بدون أجر)');
  const [newRuleReqBranch, setNewRuleReqBranch] = useState(false);
  const [newRuleReqAdmin, setNewRuleReqAdmin] = useState(true);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    const updatedSettings = {
      ...orgSettings,
      orgName: orgName.trim(),
      generalManagerName: gmName.trim(),
      logoUrl,
      adminUser: adminUser.trim(),
      adminPass: adminPass.trim(),
      biometricType,
      loanRequestStartDay: parseInt(loanRequestStartDay, 10) || 1,
      loanRequestEndDay: parseInt(loanRequestEndDay, 10) || 10,
      maxMonthlyLoanSalaryPercent: parseFloat(maxMonthlyLoanSalaryPercent) || 50,
      approvedIPs, // keeping this for legacy components
      updatedAt: Date.now()
    };
    const updatedIpRestrictions = {
      enabled: ipEnabled,
      allowedIps: approvedIPs.map(ip => ({ label: `راوتر`, ip }))
    };
    const updatedState = { ...state, orgSettings: updatedSettings, ipRestrictions: updatedIpRestrictions };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم حفظ إعدادات المؤسسة وضوابط السلف وحماية النظام بنجاح');
  };

  const handleToggleRule = async (ruleId, field) => {
    const updatedRules = rules.map((r) => {
      if (r.id === ruleId) {
        return { ...r, [field]: !r[field] };
      }
      return r;
    });
    setRules(updatedRules);
    const updatedState = {
      ...state,
      approvalRules: updatedRules,
      _approvalRulesUpdatedAt: new Date().toISOString()
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم التحديث والتأثير على قواعد التسلسل والموافقات');
  };

  const handleAddIP = () => {
    if (!newIP.trim()) return;
    if (approvedIPs.includes(newIP.trim())) return;
    const updated = [...approvedIPs, newIP.trim()];
    setApprovedIPs(updated);
    setNewIP('');
  };

  const handleAddCurrentIP = async () => {
    setIsFetchingIp(true);
    const ip = await fetchCurrentIP();
    if (ip && !approvedIPs.includes(ip)) {
      setApprovedIPs([...approvedIPs, ip]);
      showToast?.('✅ تم التقاط عنوان الـ IP الحالي بنجاح!');
    }
    setIsFetchingIp(false);
  };

  // System Permission Catalog
  const SYSTEM_PERMISSION_CATALOG = [
    { key: 'canViewSalary', label: '💵 مشاهدة تفاصيل الراتب ورصيد الحساب وصافي المستحقات', category: 'الرواتب والماليات', defaultVal: true },
    { key: 'canViewAdjustments', label: '📊 مشاهدة سجل السلف والمكافآت والخصومات', category: 'الرواتب والماليات', defaultVal: true },
    { key: 'canAddAdjustment', label: '➕ تسجيل وتوثيق مكافأة أو خصم مباشر', category: 'الرواتب والماليات', defaultVal: false },
    { key: 'canApplyLoan', label: '💳 إمكانية تقديم طلبات السلف المالية وشراء الأدوية آجل', category: 'الطلبات والخدمات', defaultVal: true },
    { key: 'canApplyLeave', label: '🏖️ إمكانية تقديم طلبات الإجازات (سنوية / مرضية / عارضة)', category: 'الطلبات والخدمات', defaultVal: true },
    { key: 'canApplyPermission', label: '⏰ إمكانية تقديم طلبات الأذونات والخروج المؤقت', category: 'الطلبات والخدمات', defaultVal: true },
    { key: 'canApplySwap', label: '🔄 إمكانية تقديم طلبات تبديل وتنازل عن الشيفتات', category: 'الطلبات والخدمات', defaultVal: true },
    { key: 'canViewBylaws', label: '📜 استعراض نصوص لائحة العمل وجدول الجزاءات', category: 'اللائحة والانضباط', defaultVal: true },
    { key: 'canSubmitComplaint', label: '📋 إرسال تقييمات وملاحظات وشكاوى للإدارة', category: 'اللائحة والانضباط', defaultVal: true },
    { key: 'canViewRoster', label: '📅 استعراض ومتابعة الجدول الشهري والورديات', category: 'الحضور والانصراف', defaultVal: true },
    { key: 'canStartEnd', label: '📸 تسجيل الحضور والانصراف بلمسة واحدة عبر البوابة', category: 'الحضور والانصراف', defaultVal: true },
    { key: 'canLivePunch', label: '👤 إمكانية بداية الوردية عبر البصمة الحية (الوجه / الكاميرا)', category: 'الحضور والانصراف', defaultVal: true },
    { key: 'canManualShift', label: '⏱️ تسجيل وردية يدوية وتوثيق ساعات العمل', category: 'الحضور والانصراف', defaultVal: false },
    { key: 'canEditShift', label: '✏️ تعديل وتصحيح ساعات الورديات المسجلة', category: 'الحضور والانصراف', defaultVal: false },
    { key: 'canExportExcel', label: '📥 تصدير واستخراج كشوفات وشيتات Excel الرسمية', category: 'التقارير والإكسل', defaultVal: true }
  ];

  const defaultPerms = SYSTEM_PERMISSION_CATALOG.reduce((acc, p) => ({ ...acc, [p.key]: p.defaultVal }), {});

  const [selectedEmpForPerm, setSelectedEmpForPerm] = useState('all'); // 'all' or empId
  const [permState, setPermState] = useState(() => {
    return { ...defaultPerms, ...(orgSettings.permissions || {}) };
  });
  const [showAddPermModal, setShowAddPermModal] = useState(false);
  const [selectedCatalogPermKey, setSelectedCatalogPermKey] = useState('');
  const [customPermKey, setCustomPermKey] = useState('');
  const [customPermLabel, setCustomPermLabel] = useState('');

  const normalizePermObject = (rawObj) => {
    if (!rawObj || typeof rawObj !== 'object') return {};
    const out = {};
    Object.entries(rawObj).forEach(([k, v]) => {
      let action = k;
      if (k.startsWith('can')) action = k.slice(3);
      else if (k.startsWith('allow')) action = k.slice(5);
      out['can' + action] = Boolean(v);
      out['allow' + action] = Boolean(v);
      out[k] = Boolean(v);
    });
    return out;
  };

  const getResolvedPerms = (empIdOrAll) => {
    const merged = { ...defaultPerms };
    if (empIdOrAll === 'all') {
      const globalNorm = normalizePermObject(state.orgSettings?.permissions);
      SYSTEM_PERMISSION_CATALOG.forEach((p) => {
        let action = p.key.startsWith('can') ? p.key.slice(3) : p.key;
        if (globalNorm['can' + action] !== undefined) merged[p.key] = globalNorm['can' + action];
        else if (globalNorm[p.key] !== undefined) merged[p.key] = globalNorm[p.key];
      });
    } else {
      const emp = (state.employees || []).find((e) => String(e.id) === String(empIdOrAll) || String(e.code) === String(empIdOrAll));
      const targetId = emp ? String(emp.id) : String(empIdOrAll);
      const targetCode = emp ? String(emp.code) : String(empIdOrAll);
      const empCustom = state.orgSettings?.empPermissions?.[targetId] || state.orgSettings?.empPermissions?.[targetCode] || emp?.permissions;
      if (empCustom) {
        const customNorm = normalizePermObject(empCustom);
        SYSTEM_PERMISSION_CATALOG.forEach((p) => {
          let action = p.key.startsWith('can') ? p.key.slice(3) : p.key;
          if (customNorm['can' + action] !== undefined) merged[p.key] = customNorm['can' + action];
          else if (customNorm[p.key] !== undefined) merged[p.key] = customNorm[p.key];
        });
      } else {
        const globalNorm = normalizePermObject(state.orgSettings?.permissions);
        SYSTEM_PERMISSION_CATALOG.forEach((p) => {
          let action = p.key.startsWith('can') ? p.key.slice(3) : p.key;
          if (globalNorm['can' + action] !== undefined) merged[p.key] = globalNorm['can' + action];
          else if (globalNorm[p.key] !== undefined) merged[p.key] = globalNorm[p.key];
        });
      }
    }
    return merged;
  };

  // Synchronize permissions state when selecting an employee or when state updates
  useEffect(() => {
    setPermState(getResolvedPerms(selectedEmpForPerm));
  }, [selectedEmpForPerm, state.orgSettings?.permissions, state.orgSettings?.empPermissions, state.employees]);

  const handleSelectEmpForPerm = (empId) => {
    setSelectedEmpForPerm(empId);
    setPermState(getResolvedPerms(empId));
  };

  const handleAddPermissionToActive = () => {
    if (selectedCatalogPermKey) {
      const catalogItem = SYSTEM_PERMISSION_CATALOG.find((p) => p.key === selectedCatalogPermKey);
      if (catalogItem) {
        setPermState({ ...permState, [catalogItem.key]: true });
        showToast?.(`✅ تمت إضافة وتفعيل صلاحية (${catalogItem.label}) في القائمة`);
      }
    } else if (customPermKey.trim() && customPermLabel.trim()) {
      const cleanKey = customPermKey.trim().replace(/\s+/g, '_');
      setPermState({ ...permState, [cleanKey]: true });
      showToast?.(`✅ تمت إضافة وتفعيل الصلاحية المخصصة (${customPermLabel}) في القائمة`);
    }
    setShowAddPermModal(false);
    setSelectedCatalogPermKey('');
    setCustomPermKey('');
    setCustomPermLabel('');
  };

  const handleRemovePermissionFromActive = (permKey) => {
    const updated = { ...permState };
    delete updated[permKey];
    setPermState(updated);
    showToast?.(`🗑️ تم حذف الصلاحية من القائمة`);
  };

  const handleGrantAllPermissions = () => {
    const allTrue = {};
    SYSTEM_PERMISSION_CATALOG.forEach((p) => {
      allTrue[p.key] = true;
      let actionName = p.key.startsWith('can') ? p.key.slice(3) : p.key;
      allTrue['can' + actionName] = true;
      allTrue['allow' + actionName] = true;
    });
    setPermState(allTrue);
    showToast?.('🔓 تم تفعيل وتحديد كافة الصلاحيات — اضغط حفظ لتطبيقها فوراً');
  };

  const handleSavePermissions = async () => {
    // Generate full expanded permissions map with both canX and allowX
    const expandedPerms = {};
    SYSTEM_PERMISSION_CATALOG.forEach((p) => {
      const isChecked = permState[p.key] !== false;
      let actionName = p.key.startsWith('can') ? p.key.slice(3) : p.key;
      expandedPerms['can' + actionName] = isChecked;
      expandedPerms['allow' + actionName] = isChecked;
      expandedPerms[p.key] = isChecked;
      expandedPerms[actionName] = isChecked;
    });

    Object.keys(permState).forEach((k) => {
      let actionName = k;
      if (k.startsWith('can')) actionName = k.slice(3);
      else if (k.startsWith('allow')) actionName = k.slice(5);
      const isChecked = Boolean(permState[k]);
      expandedPerms['can' + actionName] = isChecked;
      expandedPerms['allow' + actionName] = isChecked;
      expandedPerms[k] = isChecked;
      expandedPerms[actionName] = isChecked;
    });

    const nowTime = Date.now();
    let updatedOrgSettings = { ...(state.orgSettings || orgSettings), updatedAt: nowTime };
    let updatedEmployees = [...(state.employees || [])];

    if (selectedEmpForPerm === 'all') {
      updatedOrgSettings = {
        ...updatedOrgSettings,
        permissions: { ...expandedPerms },
        empPermissions: {}
      };
      updatedEmployees = updatedEmployees.map((e) => ({
        ...e,
        permissions: { ...expandedPerms },
        updatedAt: nowTime
      }));
      showToast?.('💾 تم حفظ وتطبيق الصلاحيات بنجاح على جميع الموظفين بالنظام');
    } else {
      const targetEmp = updatedEmployees.find((e) => String(e.id) === String(selectedEmpForPerm) || String(e.code) === String(selectedEmpForPerm));
      const targetId = targetEmp ? String(targetEmp.id) : String(selectedEmpForPerm);
      const targetCode = targetEmp ? String(targetEmp.code) : String(selectedEmpForPerm);

      const updatedEmpPerms = {
        ...(updatedOrgSettings.empPermissions || {}),
        [targetId]: { ...expandedPerms },
        [targetCode]: { ...expandedPerms }
      };
      updatedOrgSettings = {
        ...updatedOrgSettings,
        empPermissions: updatedEmpPerms
      };
      updatedEmployees = updatedEmployees.map((e) =>
        (String(e.id) === targetId || String(e.code) === targetCode) ? { ...e, permissions: { ...expandedPerms }, updatedAt: nowTime } : e
      );
      showToast?.(`💾 تم حفظ وتطبيق الصلاحيات للموظف (${targetEmp?.name || selectedEmpForPerm}) بنجاح`);
    }

    const updatedState = { ...state, orgSettings: updatedOrgSettings, employees: updatedEmployees };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleRevokeAllPermissions = async () => {
    if (!window.confirm('🚨 هل أنت متأكد من رغبتك في إيقاف وتعطيل جميع الصلاحيات لنطاق الموظفين المحدد؟')) return;

    const allFalse = {};
    SYSTEM_PERMISSION_CATALOG.forEach((p) => {
      let actionName = p.key.startsWith('can') ? p.key.slice(3) : p.key;
      allFalse['can' + actionName] = false;
      allFalse['allow' + actionName] = false;
      allFalse[p.key] = false;
      allFalse[actionName] = false;
    });
    setPermState(allFalse);

    let updatedOrgSettings = { ...(state.orgSettings || orgSettings) };
    let updatedEmployees = [...(state.employees || [])];

    if (selectedEmpForPerm === 'all') {
      updatedOrgSettings = {
        ...updatedOrgSettings,
        permissions: { ...allFalse },
        empPermissions: {}
      };
      updatedEmployees = updatedEmployees.map((e) => ({
        ...e,
        permissions: { ...allFalse }
      }));
      showToast?.('🚫 تم إيقاف وتعطيل جميع الصلاحيات لجميع الموظفين بالنظام');
    } else {
      const targetEmp = updatedEmployees.find((e) => String(e.id) === String(selectedEmpForPerm) || String(e.code) === String(selectedEmpForPerm));
      const targetId = targetEmp ? String(targetEmp.id) : String(selectedEmpForPerm);
      const targetCode = targetEmp ? String(targetEmp.code) : String(selectedEmpForPerm);

      const updatedEmpPerms = {
        ...(updatedOrgSettings.empPermissions || {}),
        [targetId]: { ...allFalse },
        [targetCode]: { ...allFalse }
      };
      updatedOrgSettings = {
        ...updatedOrgSettings,
        empPermissions: updatedEmpPerms
      };
      updatedEmployees = updatedEmployees.map((e) =>
        (String(e.id) === targetId || String(e.code) === targetCode) ? { ...e, permissions: { ...allFalse } } : e
      );
      showToast?.(`🚫 تم إيقاف وتعطيل جميع الصلاحيات للموظف (${targetEmp?.name || selectedEmpForPerm}) بنجاح`);
    }

    const updatedState = { ...state, orgSettings: updatedOrgSettings, employees: updatedEmployees };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleResetDefaultPermissions = async () => {
    const standardPerms = {};
    SYSTEM_PERMISSION_CATALOG.forEach((p) => {
      let actionName = p.key.startsWith('can') ? p.key.slice(3) : p.key;
      standardPerms['can' + actionName] = p.defaultVal;
      standardPerms['allow' + actionName] = p.defaultVal;
      standardPerms[p.key] = p.defaultVal;
      standardPerms[actionName] = p.defaultVal;
    });
    setPermState(standardPerms);

    let updatedOrgSettings = { ...(state.orgSettings || orgSettings) };
    let updatedEmployees = [...(state.employees || [])];

    if (selectedEmpForPerm === 'all') {
      updatedOrgSettings = {
        ...updatedOrgSettings,
        permissions: { ...standardPerms },
        empPermissions: {}
      };
      updatedEmployees = updatedEmployees.map((e) => {
        const { permissions, ...rest } = e;
        return { ...rest, permissions: { ...standardPerms } };
      });
      showToast?.('🔄 تمت استعادة الصلاحيات القياسية لجميع الموظفين');
    } else {
      const targetEmp = updatedEmployees.find((e) => String(e.id) === String(selectedEmpForPerm) || String(e.code) === String(selectedEmpForPerm));
      const targetId = targetEmp ? String(targetEmp.id) : String(selectedEmpForPerm);
      const targetCode = targetEmp ? String(targetEmp.code) : String(selectedEmpForPerm);

      const updatedEmpPerms = { ...(updatedOrgSettings.empPermissions || {}) };
      delete updatedEmpPerms[targetId];
      delete updatedEmpPerms[targetCode];

      updatedOrgSettings = {
        ...updatedOrgSettings,
        empPermissions: updatedEmpPerms
      };
      updatedEmployees = updatedEmployees.map((e) => {
        if (String(e.id) === targetId || String(e.code) === targetCode) {
          const { permissions, ...rest } = e;
          return rest;
        }
        return e;
      });
      showToast?.(`🔄 تمت استعادة الصلاحيات الافتراضية للموظف (${targetEmp?.name || selectedEmpForPerm})`);
    }

    const updatedState = { ...state, orgSettings: updatedOrgSettings, employees: updatedEmployees };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleAddRule = async () => {
    if (rules.some(r => r.requestType === newRuleType)) {
      showToast?.('⚠️ توجد قاعدة معرفة مسبقاً لهذا النوع من الطلبات');
      return;
    }
    const newRule = {
      id: String(Date.now()),
      requestType: newRuleType,
      typeLabel: newRuleLabel,
      reqBranch: newRuleReqBranch,
      reqAdmin: newRuleReqAdmin
    };
    const updated = [...rules, newRule];
    setRules(updated);
    setShowAddRuleModal(false);
    const updatedState = {
      ...state,
      approvalRules: updated,
      _approvalRulesUpdatedAt: new Date().toISOString()
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم إضافة قاعدة موافقة جديدة وتطبيقها بنجاح');
  };

  const handleDeleteRule = async (ruleId) => {
    const updated = rules.filter(r => r.id !== ruleId);
    setRules(updated);
    const updatedState = {
      ...state,
      approvalRules: updated,
      _approvalRulesUpdatedAt: new Date().toISOString()
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف قاعدة الموافقة بنجاح');
  };

  const handleSaveAllRules = async () => {
    const updatedState = {
      ...state,
      approvalRules: rules,
      _approvalRulesUpdatedAt: new Date().toISOString()
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('💾 تم حفظ وتحسين وتطبيق كافة قواعد الموافقة المزدوجة بنجاح');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⚙️ إعدادات منظومة الموارد البشرية والأجهزة والأدمن
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تعديل اسم وشعار الصيدلية، دليل الوظائف والكوادر، قواعد التتابع المزدوج للموافقات، الصلاحيات، ومركز النسخ الاحتياطي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'general' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('general')}>
            🏥 بيانات الصيدلية والمدير العام
          </button>
          <button className={`btn ${activeTab === 'jobs' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('jobs')}>
            💼 الوظائف والكوادر
          </button>
          <button className={`btn ${activeTab === 'permissions' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('permissions')}>
            🔒 إدارة الصلاحيات
          </button>
          <button className={`btn ${activeTab === 'rules' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('rules')}>
            🔐 قواعد الموافقة المزدوجة
          </button>
          <button className={`btn ${activeTab === 'gmail' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('gmail')}>
            ✉️ بريد Gmail والتنبيهات
          </button>
          <button className={`btn ${activeTab === 'ip' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('ip')}>
            🌐 راوترات الفروع
          </button>
          <button className={`btn ${activeTab === 'backup' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('backup')}>
            💾 النسخ الاحتياطي
          </button>
        </div>
      </div>

      {/* Tab: Gmail Config & Notifications */}
      {activeTab === 'gmail' && (
        <GmailConfigCard
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
        />
      )}

      {/* Tab 1: General Org & Admin Settings */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveGeneral} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <h4 style={{ margin: '0 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            🏥 إعدادات اسم المؤسسة واسم المدير العام والشعار
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <div className="field">
              <label>اسم الصيدلية / مجموعة الصيدليات</label>
              <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
            </div>

            <div className="field">
              <label>اسم المدير العام للصيدليات</label>
              <input type="text" value={gmName} onChange={(e) => setGmName(e.target.value)} required />
            </div>

            <div className="field grow" style={{ width: '100%' }}>
              <label>طريقة البصمة الافتراضية للشركة (Biometric Type)</label>
              <select
                value={biometricType}
                onChange={(e) => setBiometricType(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
              >
                <option value="face">بصمة الوجه (Face Recognition & Liveness)</option>
                <option value="hand">بصمة اليد (Hand Geometry 3D)</option>
              </select>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                اختر التقنية المعتمدة لتوثيق حضور الموظفين في المنصة.
              </p>
            </div>

            <div className="field">
              <label>رابط الشعار (Logo URL)</label>
              <input type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
            </div>
          </div>

          <h4 style={{ margin: '20px 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
            🔐 بيانات دخول المدير العام وحماية اللوحة
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div className="field">
              <label>اسم المستخدم للأدمن (Admin Username)</label>
              <input type="text" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} required />
            </div>

            <div className="field">
              <label>كلمة سر الإدارة العليا</label>
              <input type="text" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start">💾 حفظ كافة الإعدادات</button>
          </div>
        </form>
      )}

      {/* Tab: Permissions Management */}
      {activeTab === 'permissions' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', fontSize: '17px' }}>
                🔒 تفويض وإدارة صلاحيات الموظفين الصارمة بالنظام
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0' }}>
                تحكم صارم وديناميكي في إضافة وحذف صلاحيات النظام للموظفين أو لجميع كوادر المؤسسة:
              </p>
            </div>
            <button
              type="button"
              className="btn btn-start"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setShowAddPermModal(true)}
            >
              ➕ إضافة صلاحية من قائمة النظام
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px', background: 'var(--surface-muted)', padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <div style={{ flex: '1', minWidth: '240px', maxWidth: '420px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>👤 تحديد نطاق الصلاحية (الموظف المستهدف):</label>
              <select
                value={selectedEmpForPerm}
                onChange={(e) => handleSelectEmpForPerm(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', fontWeight: 'bold' }}
              >
                <option value="all">👥 جميع الموظفين بالمنظومة (الصلاحيات العامة الافتراضية)</option>
                {(state.employees || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.code}) {emp.permissions ? '⭐ [صلاحية مخصصة]' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)', flex: '2', minWidth: '200px' }}>
              {selectedEmpForPerm === 'all'
                ? 'ℹ️ التعديل هنا ينطبق كقواعد عامة صارمة على جميع الموظفين مالم يتم تخصيص صلاحيات فردية.'
                : `ℹ️ يتم الآن تخصيص الصلاحيات الصارمة فقط للموظف المعين (${(state.employees || []).find(e => e.id === selectedEmpForPerm)?.name})`}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {Object.keys(permState).map((key) => {
              const catalogItem = SYSTEM_PERMISSION_CATALOG.find((p) => p.key === key);
              const label = catalogItem ? catalogItem.label : key;
              const category = catalogItem ? catalogItem.category : 'صلاحية مخصصة';
              const isEnabled = permState[key] !== false;

              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    background: isEnabled ? '#f0fdf4' : '#f8fafc',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: isEnabled ? '1px solid #86efac' : '1px solid var(--border)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setPermState({ ...permState, [key]: e.target.checked })}
                      style={{ width: '19px', height: '19px', cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13.5px', color: isEnabled ? '#15803d' : 'var(--muted)' }}>
                        {label}
                      </div>
                      <span style={{ fontSize: '11px', background: isEnabled ? '#dcfce7' : '#e2e8f0', color: isEnabled ? '#166534' : '#64748b', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>
                        {category} • {isEnabled ? 'مفعلة ✅' : 'مقيدة ومحظورة 🚫'}
                      </span>
                    </div>
                  </label>

                  <button
                    type="button"
                    title="حذف هذه الصلاحية من القائمة"
                    onClick={() => handleRemovePermissionFromActive(key)}
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ حذف
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" style={{ color: '#16a34a', borderColor: '#86efac' }} onClick={handleGrantAllPermissions}>
                🔓 منح وتفعيل كافة الصلاحيات
              </button>
              <button type="button" className="btn btn-outline" style={{ color: '#dc2626', borderColor: '#fca5a5' }} onClick={handleRevokeAllPermissions}>
                🔒 إيقاف وتعطيل جميع الصلاحيات
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleResetDefaultPermissions}>
                🔄 استعادة الصلاحيات القياسية
              </button>
            </div>

            <button type="button" className="btn btn-start" onClick={handleSavePermissions}>
              💾 حفظ وتطبيق الصلاحيات الصارمة
            </button>
          </div>

          {/* Add Permission Modal */}
          {showAddPermModal && (
            <div className="modal-overlay" onClick={() => setShowAddPermModal(false)} style={{ zIndex: 1200 }}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px', width: '90%', padding: '24px', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', color: 'var(--primary-dark)' }}>➕ إضافة صلاحية من قائمة صلاحيات النظام</h3>
                  <button className="btn btn-ghost" onClick={() => setShowAddPermModal(false)}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                      📋 اختر الصلاحية من قائمة النظام المعتمدة:
                    </label>
                    <select
                      value={selectedCatalogPermKey}
                      onChange={(e) => {
                        setSelectedCatalogPermKey(e.target.value);
                        if (e.target.value) {
                          setCustomPermKey('');
                          setCustomPermLabel('');
                        }
                      }}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                    >
                      <option value="">-- اختر من الكتالوج الرسمي للصلاحيات --</option>
                      {SYSTEM_PERMISSION_CATALOG.filter(p => !Object.keys(permState).includes(p.key)).map((p) => (
                        <option key={p.key} value={p.key}>
                          [{p.category}] {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ textAlign: 'center', margin: '4px 0', fontSize: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>
                    ── أو أضف صلاحية مخصصة جديدة ──
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold' }}>مفتاح الصلاحية (Key بالإنجليزية):</label>
                      <input
                        type="text"
                        placeholder="canManageInventory"
                        value={customPermKey}
                        onChange={(e) => {
                          setCustomPermKey(e.target.value);
                          if (e.target.value) setSelectedCatalogPermKey('');
                        }}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 'bold' }}>اسم ووصف الصلاحية (بالعربية):</label>
                      <input
                        type="text"
                        placeholder="إدارة الجرد والمخزون"
                        value={customPermLabel}
                        onChange={(e) => setCustomPermLabel(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAddPermModal(false)}>إلغاء</button>
                  <button type="button" className="btn btn-start" onClick={handleAddPermissionToActive}>
                    ➕ إضافة وتثبيت الصلاحية
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Approval Rules Config */}
      {activeTab === 'rules' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🔐 تحديد وتخصيص قواعد موافقات الطلبات لكل نوع
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0' }}>
                إضافة وتعديل قواعد التسلسل لجميع أنواع طلبات النظام (موافقة الفرع + موافقة الإدارة العليا):
              </p>
            </div>
            <button className="btn btn-start" onClick={() => setShowAddRuleModal(true)}>
              ➕ إضافة قاعدة موافقة جديدة
            </button>
          </div>

          <div className="table-responsive">
            <table className="bylaws-table">
              <thead>
                <tr>
                  <th>نوع الطلب</th>
                  <th>موافقة مدير الفرع</th>
                  <th>موافقة الإدارة العليا</th>
                  <th>حالة القاعدة والتطبيق</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td style={{ fontWeight: '800' }}>{rule.typeLabel || rule.name || rule.requestType}</td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={rule.reqBranch !== false}
                          onChange={() => handleToggleRule(rule.id, 'reqBranch')}
                        />
                        <span>مطلوبة</span>
                      </label>
                    </td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={rule.reqAdmin !== false}
                          onChange={() => handleToggleRule(rule.id, 'reqAdmin')}
                        />
                        <span>مطلوبة</span>
                      </label>
                    </td>
                    <td>
                      {rule.reqBranch && rule.reqAdmin ? (
                        <span className="badge badge-success">🟢 موافقة مزدوجة معتمدة</span>
                      ) : (
                        <span className="badge badge-warning">🟡 موافقة مباشرة واحدة</span>
                      )}
                    </td>
                    <td>
                      <button
                        style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}
                        onClick={() => handleDeleteRule(rule.id)}
                        title="حذف القاعدة"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button className="btn btn-start" onClick={handleSaveAllRules}>
              💾 حفظ وتحسين وتطبيق التعديلات والقواعد
            </button>
          </div>

          {/* Modal for adding rule */}
          {showAddRuleModal && (
            <div className="modal-backdrop" onClick={() => setShowAddRuleModal(false)}>
              <div className="modal-card" style={{ maxWidth: '750px', width: '96%' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: 'var(--primary-dark)' }}>
                  ➕ إضافة قاعدة موافقة جديدة للطلبات
                </h3>

                <div className="field" style={{ marginBottom: '14px' }}>
                  <label>اختر نوع الطلب من القائمة الشاملة:</label>
                  <select
                    value={newRuleType}
                    onChange={(e) => {
                      const selected = ALL_REQUEST_TYPES.find(t => t.type === e.target.value);
                      setNewRuleType(e.target.value);
                      if (selected) setNewRuleLabel(selected.label);
                    }}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                  >
                    {ALL_REQUEST_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ marginBottom: '16px' }}>
                  <label>مسمى الطلب العرضي:</label>
                  <input type="text" value={newRuleLabel} onChange={(e) => setNewRuleLabel(e.target.value)} required />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newRuleReqBranch} onChange={(e) => setNewRuleReqBranch(e.target.checked)} />
                    <span style={{ fontWeight: 'bold' }}>تطلب موافقة مدير الفرع أولاً</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={newRuleReqAdmin} onChange={(e) => setNewRuleReqAdmin(e.target.checked)} />
                    <span style={{ fontWeight: 'bold' }}>تطلب موافقة الإدارة العليا</span>
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setShowAddRuleModal(false)}>إلغاء</button>
                  <button className="btn btn-start" onClick={handleAddRule}>💾 حفظ القاعدة</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: IP Restrictions */}
      {activeTab === 'ip' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <h4 style={{ margin: '0 0 10px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                🌐 قيود الشبكة — عناوين راوترات الصيدليات المعتمدة (Approved IPs)
              </h4>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                منع تسجيل الحضور والانصراف إلا عند الاتصال بشركة أو شبكة راوتر الفرع المعتمدة.
              </p>
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--primary-tint)', padding: '8px 16px', borderRadius: '30px' }}>
              <input 
                type="checkbox" 
                checked={ipEnabled} 
                onChange={(e) => setIpEnabled(e.target.checked)} 
                style={{ width: '18px', height: '18px' }}
              />
              <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>تفعيل قيود الـ IP</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="مثال: 192.168.1.100"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', flex: 1, minWidth: '200px' }}
            />
            <button className="btn btn-start" onClick={handleAddIP}>➕ إضافة راوتر معتمد</button>
            <button 
              className="btn btn-outline" 
              onClick={handleAddCurrentIP}
              disabled={isFetchingIp}
            >
              {isFetchingIp ? '⏳ جاري التقاط الـ IP...' : '📡 التقاط الـ IP للجهاز الحالي'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {approvedIPs.map((ip, idx) => (
              <div key={idx} style={{ background: '#f1f5f9', border: '1px solid var(--border)', padding: '8px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>🌐 {ip}</span>
                <button
                  style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
                  onClick={() => setApprovedIPs(approvedIPs.filter((_, i) => i !== idx))}
                  title="حذف"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
          
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-start" onClick={handleSaveGeneral} style={{ padding: '10px 24px', fontSize: '15px' }}>
              💾 حفظ الإعدادات وتطبيق القيود
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: Backup Center */}
      {activeTab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 1: Auto-Backup & Path Settings */}
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '22px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚡ الحفظ والنسخ الاحتياطي التلقائي عند أي تعديل
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  يقوم النظام بحفظ لقطة احتياطية كاملة وتحديثها فورياً على جهازك عند إجراء أي عملية تعديل أو إضافة أو اعتماد.
                </p>
              </div>
              <button
                type="button"
                className={`btn ${autoBackupOn ? 'btn-start' : 'btn-ghost'}`}
                style={{ padding: '8px 18px', fontSize: '13.5px', fontWeight: 'bold' }}
                onClick={() => {
                  const nextVal = !autoBackupOn;
                  setAutoBackupOn(nextVal);
                  setAutoBackupEnabled(nextVal);
                  showToast?.(nextVal ? '🟢 تم تفعيل النسخ الاحتياطي التلقائي الفوري' : '⚪ تم تعطيل النسخ التلقائي');
                }}
              >
                {autoBackupOn ? '✅ النسخ التلقائي مُفعل' : '❌ النسخ التلقائي معطل'}
              </button>
            </div>

            {/* Custom Path Section */}
            <div style={{ background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                📁 مسار ومجلد الحفظ التلقائي على الجهاز:
              </label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, minWidth: '240px', background: '#f8fafc', fontSize: '13px' }}
                  value={backupPath}
                  onChange={(e) => {
                    setBackupPath(e.target.value);
                    setCustomBackupPath(e.target.value);
                  }}
                  placeholder="حدد اسم المجلد أو المسار (مثل: D:/Pharmacy_Backups/)"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', border: '1px solid #cbd5e1' }}
                  disabled={isPickingDir}
                  onClick={async () => {
                    setIsPickingDir(true);
                    const res = await pickBackupDirectory();
                    setIsPickingDir(false);
                    if (res.success) {
                      setBackupPath(res.name);
                      showToast?.(`✅ تم تعيين المجلد: ${res.name} للحفظ التلقائي المباشر`);
                    } else if (res.notSupported) {
                      showToast?.(res.message);
                    }
                  }}
                >
                  {isPickingDir ? '⏳ جاري التحديد...' : '📂 اختيار مجلد على الجهاز'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748b' }}>
                💡 يتم حفظ اللقطات الاحتياطية في التخزين المحلي الآمن وقاعدة البيانات الداخلية فورياً، بالإضافة إلى التحديث المباشر للمجلد المختار.
              </p>
            </div>
          </div>

          {/* Card 2: Manual Export & Restore Actions */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '14px' }}>
            <h4 style={{ margin: '0 0 16px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
              💾 أدوات النسخ اليدوي وتصدير واسترجاع الملفات
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
              {/* Export Section */}
              <div style={{ padding: '18px', border: '1px solid #10b981', borderRadius: '12px', background: '#ecfdf5', textAlign: 'center' }}>
                <h4 style={{ color: '#047857', margin: '0 0 8px', fontSize: '15px' }}>أخذ نسخة احتياطية فورية (Export)</h4>
                <p style={{ fontSize: '12.5px', color: '#065f46', marginBottom: '14px' }}>
                  تجميع وحفظ كل بيانات المنظومة الحالية في ملف JSON مستقل على جهازك.
                </p>
                <button 
                  type="button"
                  className="btn btn-start" 
                  style={{ width: '100%', background: '#10b981', color: '#fff', border: 'none' }}
                  disabled={isBackingUp}
                  onClick={async () => {
                    setIsBackingUp(true);
                    showToast?.('⏳ جاري استخراج ملف النسخ الاحتياطي...');
                    const res = await exportFullBackup(state);
                    if (res.success) {
                      showToast?.('✅ تم استخراج وتنزيل النسخة الاحتياطية بنجاح!');
                    } else {
                      showToast?.('❌ حدث خطأ: ' + res.error);
                    }
                    setIsBackingUp(false);
                  }}
                >
                  {isBackingUp ? '⏳ جاري التحميل...' : '📥 تحميل ملف النسخة الاحتياطية'}
                </button>
              </div>

              {/* Import Section */}
              <div style={{ padding: '18px', border: '1px solid #f59e0b', borderRadius: '12px', background: '#fffbeb', textAlign: 'center' }}>
                <h4 style={{ color: '#b45309', margin: '0 0 8px', fontSize: '15px' }}>استرجاع بيانات من ملف (Restore)</h4>
                <p style={{ fontSize: '12.5px', color: '#92400e', marginBottom: '14px' }}>
                  استعادة جميع البيانات والورديات والبصمات من ملف نسخة احتياطية سابق.
                </p>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      setIsRestoring(true);
                      showToast?.('⏳ جاري استرجاع البيانات... قد يستغرق ذلك بضع ثوانٍ.');
                      const res = await restoreFullBackup(event.target.result, setState, saveState);
                      if (res.success) {
                        showToast?.('✅ تمت استعادة جميع البيانات بنجاح!');
                      } else {
                        showToast?.('❌ فشل الاسترجاع: ' + res.error);
                      }
                      setIsRestoring(false);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    };
                    reader.readAsText(file);
                  }}
                />
                <button 
                  type="button"
                  className="btn btn-ghost" 
                  style={{ width: '100%', border: '1px solid #f59e0b', color: '#b45309' }}
                  disabled={isRestoring}
                  onClick={() => {
                    if (window.confirm('هل أنت متأكد من رغبتك في استرجاع البيانات من ملف خارجي؟ سيتم استبدال البيانات بالبيانات الموجودة في الملف.')) {
                      fileInputRef.current.click();
                    }
                  }}
                >
                  {isRestoring ? '⏳ جاري الاسترجاع...' : '📤 اختيار ملف النسخة لاسترجاعه'}
                </button>
              </div>
            </div>
          </div>

          {/* Card 3: Live Automatic Snapshots Archive */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⏱️ سجل اللقطات الاحتياطية التلقائية الحية (آخر {snapshots.length} لقطة محفوظة)
              </h4>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '12px', padding: '4px 10px' }}
                onClick={() => fetchSnapshotsList().then((list) => setSnapshots(list || []))}
              >
                🔄 تحديث السجل
              </button>
            </div>

            {snapshots.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '10px', fontSize: '13px' }}>
                لا توجد لقطات احتياطية مسجلة بعد. سيتم تسجيل لقطات تلقائية فور قيامك بأي تعديل في النظام.
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>تاريخ ووقت اللقطة</th>
                      <th>سبب التعديل واللقطة</th>
                      <th>إحصائيات البيانات</th>
                      <th>إجراءات الاسترجاع والتحميل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((snap, idx) => (
                      <tr key={snap.id || idx}>
                        <td>{idx + 1}</td>
                        <td>
                          <strong>{snap.isoDate ? snap.isoDate.replace('T', ' ').slice(0, 19) : new Date(snap.timestamp).toLocaleString('ar-EG')}</strong>
                        </td>
                        <td>
                          <span style={{ color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                            {snap.trigger || 'تعديل بيانات'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '12px', color: '#475569' }}>
                            👥 {snap.stats?.employeesCount || 0} موظف • 📑 {snap.stats?.requestsCount || 0} طلب • 🏢 {snap.stats?.branchesCount || 0} فرع
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-start"
                              style={{ padding: '4px 10px', fontSize: '11.5px' }}
                              onClick={async () => {
                                if (window.confirm(`هل أنت متأكد من رغبتك في استرجاع هذه اللقطة الاحتياطية المأخوذة في ${snap.isoDate || ''}؟`)) {
                                  if (snap.appState) {
                                    setState(snap.appState);
                                    await saveState(snap.appState);
                                    showToast?.('✅ تم استرجاع اللقطة الاحتياطية بنجاح!');
                                  }
                                }
                              }}
                            >
                              🔄 استرجاع
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              onClick={() => {
                                const dataStr = JSON.stringify(snap, null, 2);
                                const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                                const a = document.createElement('a');
                                a.href = dataUri;
                                a.download = `Snapshot_${snap.id}.json`;
                                a.click();
                              }}
                            >
                              💾 تنزيل
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              style={{ padding: '4px 8px', fontSize: '11.5px' }}
                              onClick={async () => {
                                await removeSnapshot(snap.id);
                                const updated = await fetchSnapshotsList();
                                setSnapshots(updated || []);
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Card 4: Danger Zone - Factory Reset & Full Data Wipe */}
          <div style={{
            background: '#fff5f5',
            border: '2px solid #f87171',
            borderRadius: '14px',
            padding: '22px',
            boxShadow: '0 4px 14px rgba(239,68,68,0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🚨</span>
                  <h4 style={{ margin: 0, fontFamily: 'Cairo', color: '#991b1b', fontSize: '16px', fontWeight: 800 }}>
                    منطقة العمليات الحساسة: مسح وتصفير قاعدة البيانات بالكامل (Factory Reset)
                  </h4>
                  <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: 900, padding: '2px 8px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
                    إجراء نهائي
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#7f1d1d', lineHeight: '1.6', maxWidth: '820px' }}>
                  يتيح هذا الإجراء تفريغ ومسح كافة بيانات المنظومة بالكامل من قاعدة البيانات والسيرفر (يشمل: جميع ملفات الموظفين، الفروع، الورديات، بصمات الوجه، سجلات الحضور والانصراف، الجداول الشهرية، السلف والمديونيات، والأذونات والإجازات)، مع <strong>الاحتفاظ الحصري باسم مستخدم وكلمة مرور الإدارة العليا</strong> وإعدادات المنظومة الأساسية للبدء من جديد.
                </p>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => {
                  setWipeConfirmPassword('');
                  setShowWipeModal(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>🗑️</span>
                <span>مسح وتصفير بيانات السيستم بالكامل</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Tab: Jobs & Roles Management */}
      {activeTab === 'jobs' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header & Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo', fontSize: '18px' }}>
                💼 دليل ومسميات الوظائف والكوادر وهيكلة الأقسام
              </h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13px' }}>
                تعريف الوظائف وتوزيعها على الأقسام وتصنيفها إلى (وظائف إدارية) تمنح أحقية بدل الإدارة أو (كوادر تشغيلية).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${showDeptSection ? 'btn-start' : 'btn-ghost'}`}
                onClick={() => setShowDeptSection(!showDeptSection)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>🏢</span>
                <span>إدارة الأقسام ({departmentsList.length})</span>
                <span>{showDeptSection ? '▲' : '▼'}</span>
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={() => {
                  setEditingJob(null);
                  setJobTitleInput('');
                  setJobDeptInput(departmentsList[0] || 'الصيدلية');
                  setJobIsMgmtInput(false);
                  setJobDescInput('');
                  setShowJobModal(true);
                }}
              >
                ➕ إضافة وظيفة جديدة
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  if (window.confirm('هل تريد استعادة قائمة الوظائف والأقسام القياسية الافتراضية؟')) {
                    const updatedState = { ...state, jobs: DEFAULT_JOBS, departments: DEFAULT_DEPARTMENTS };
                    setState(updatedState);
                    if (saveState) await saveState(updatedState);
                    showToast?.('🔄 تمت استعادة قائمة الوظائف والأقسام الافتراضية بنجاح');
                  }
                }}
              >
                🔄 استعادة الافتراضي
              </button>
            </div>
          </div>

          {/* Quick Statistics Banner */}
          {(() => {
            const allEmps = state.employees || [];
            const totalJobs = jobsList.length;
            const mgmtJobs = jobsList.filter(j => j.isManagement || j.isAdminRole).length;
            const operationalJobs = totalJobs - mgmtJobs;

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إجمالي الأقسام</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-dark)', marginTop: '4px' }}>
                    🏢 {departmentsList.length} قسم
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إجمالي الوظائف المعرفة</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--primary-dark)', marginTop: '4px' }}>
                    💼 {totalJobs} وظيفة
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#166534' }}>👔 وظائف إدارية (بدل إدارة)</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
                    {mgmtJobs} وظيفة
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#1e40af' }}>🏬 كوادر تشغيلية وفنية</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1d4ed8', marginTop: '4px' }}>
                    {operationalJobs} كادر
                  </div>
                </div>

                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '14px' }}>
                  <span style={{ fontSize: '12px', color: '#6b21a8' }}>👥 الموظفون المسجلون</span>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#7e22ce', marginTop: '4px' }}>
                    {allEmps.length} موظف
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Collapsible Departments Management Card */}
          {showDeptSection && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#166534', fontFamily: 'Cairo', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🏢</span> إدارة وهيكلة الأقسام بالصيدلية
                  </h4>
                  <p style={{ margin: '4px 0 0 0', color: '#15803d', fontSize: '12.5px' }}>
                    أضف أو عدل أو احذف الأقسام لتظهر في القوائم المنسدلة عند تسجيل الوظائف وملفات الموظفين.
                  </p>
                </div>

                {/* Add New Department Form */}
                <div style={{ display: 'flex', gap: '8px', flex: '1', maxWidth: '400px', minWidth: '260px' }}>
                  <input
                    type="text"
                    placeholder="اسم القسم الجديد (مثال: التسويق)"
                    value={newDeptInput}
                    onChange={(e) => setNewDeptInput(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac', background: '#fff' }}
                  />
                  <button
                    type="button"
                    className="btn btn-start"
                    style={{ padding: '8px 14px', fontSize: '13px' }}
                    onClick={async () => {
                      if (!newDeptInput.trim()) {
                        showToast?.('⚠️ يرجى كتابة اسم القسم');
                        return;
                      }
                      const cleanName = newDeptInput.trim();
                      if (departmentsList.includes(cleanName)) {
                        showToast?.('⚠️ هذا القسم موجود بالفعل');
                        return;
                      }
                      const updatedDepts = [...departmentsList, cleanName];
                      const updatedState = { ...state, departments: updatedDepts };
                      setState(updatedState);
                      setNewDeptInput('');
                      showToast?.(`✅ تمت إضافة قسم (${cleanName}) بنجاح`);
                      if (saveState) await saveState(updatedState);
                    }}
                  >
                    ➕ إضافة قسم
                  </button>
                </div>
              </div>

              {/* Department Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px', marginTop: '6px' }}>
                {departmentsList.map((dept) => {
                  const linkedJobs = jobsList.filter(j => j.department === dept);
                  const linkedEmps = (state.employees || []).filter(e => e.department === dept);
                  const isEditing = editingDeptName === dept;

                  return (
                    <div
                      key={dept}
                      style={{
                        background: '#fff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="text"
                            value={renameDeptInput}
                            onChange={(e) => setRenameDeptInput(e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--primary)' }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={async () => {
                              const cleanRename = renameDeptInput.trim();
                              if (!cleanRename) return;
                              if (cleanRename === dept) {
                                setEditingDeptName(null);
                                return;
                              }
                              if (departmentsList.includes(cleanRename)) {
                                showToast?.('⚠️ يوجد قسم آخر بهذا الاسم');
                                return;
                              }
                              const updatedDepts = departmentsList.map(d => d === dept ? cleanRename : d);
                              const updatedJobs = jobsList.map(j => j.department === dept ? { ...j, department: cleanRename } : j);
                              const updatedEmps = (state.employees || []).map(e => e.department === dept ? { ...e, department: cleanRename } : e);
                              const updatedState = { ...state, departments: updatedDepts, jobs: updatedJobs, employees: updatedEmps };
                              setState(updatedState);
                              setEditingDeptName(null);
                              showToast?.(`✅ تم تعديل اسم القسم إلى (${cleanRename})`);
                              if (saveState) await saveState(updatedState);
                            }}
                          >
                            حفظ
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onClick={() => setEditingDeptName(null)}
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)', fontSize: '14px' }}>
                            🏢 {dept}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={() => {
                                setEditingDeptName(dept);
                                setRenameDeptInput(dept);
                              }}
                              title="تعديل اسم القسم"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={async () => {
                                if (linkedJobs.length > 0 || linkedEmps.length > 0) {
                                  const confirmed = window.confirm(
                                    `⚠️ تنبيه: يوجد (${linkedJobs.length}) وظيفة و (${linkedEmps.length}) موظف مسجلين بقسم (${dept}). هل أنت متأكد من حذف هذا القسم؟`
                                  );
                                  if (!confirmed) return;
                                } else {
                                  if (!window.confirm(`هل أنت متأكد من حذف قسم (${dept})؟`)) return;
                                }
                                const updatedDepts = departmentsList.filter(d => d !== dept);
                                const updatedState = { ...state, departments: updatedDepts };
                                setState(updatedState);
                                showToast?.(`🗑️ تم حذف قسم (${dept})`);
                                if (saveState) await saveState(updatedState);
                              }}
                              title="حذف القسم"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', fontSize: '11.5px', color: 'var(--muted)' }}>
                        <span>💼 {linkedJobs.length} وظيفة</span>
                        <span>•</span>
                        <span>👥 {linkedEmps.length} موظف</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search & Department Filter Bar */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="🔍 بحث باسم الوظيفة أو الوصف..."
              value={jobSearchQuery}
              onChange={(e) => setJobSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold', margin: 0 }}>🏢 تصفية بالقسم:</label>
              <select
                value={jobDeptFilter}
                onChange={(e) => setJobDeptFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold', fontSize: '13px' }}
              >
                <option value="all">كل الأقسام ({jobsList.length})</option>
                {departmentsList.map(d => (
                  <option key={d} value={d}>
                    {d} ({jobsList.filter(j => j.department === d).length})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Jobs Table */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px' }}>#</th>
                  <th style={{ padding: '12px' }}>المسمى الوظيفي</th>
                  <th style={{ padding: '12px' }}>القسم التابع له</th>
                  <th style={{ padding: '12px' }}>تصنيف الوظيفة</th>
                  <th style={{ padding: '12px' }}>الوصف والمهام</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>الموظفون الحاليون</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {jobsList
                  .filter(j => {
                    const matchSearch = !jobSearchQuery || j.title.toLowerCase().includes(jobSearchQuery.toLowerCase()) || (j.description && j.description.toLowerCase().includes(jobSearchQuery.toLowerCase()));
                    const matchDept = jobDeptFilter === 'all' || j.department === jobDeptFilter;
                    return matchSearch && matchDept;
                  })
                  .map((j, idx) => {
                    const isMgmt = Boolean(j.isManagement || j.isAdminRole);
                    const assignedEmps = (state.employees || []).filter(e => e.jobTitle?.trim() === j.title?.trim());

                    return (
                      <tr key={j.id || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)' }}>
                        <td style={{ padding: '12px', color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--primary-dark)', fontSize: '14px' }}>
                          💼 {j.title}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            🏢 {j.department || 'عام / غير محدد'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {isMgmt ? (
                            <span style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              👔 وظيفة إدارية (تمنح بدل إدارة)
                            </span>
                          ) : (
                            <span style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              🏬 كادر تشغيلي / فني
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--muted)', fontSize: '12.5px', maxWidth: '280px' }}>
                          {j.description || '—'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ background: assignedEmps.length > 0 ? '#e0f2fe' : '#f1f5f9', color: assignedEmps.length > 0 ? '#0369a1' : '#94a3b8', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>
                            {assignedEmps.length} موظف
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={() => {
                                setEditingJob(j);
                                setJobTitleInput(j.title);
                                setJobDeptInput(j.department || departmentsList[0] || 'الصيدلية');
                                setJobIsMgmtInput(Boolean(j.isManagement || j.isAdminRole));
                                setJobDescInput(j.description || '');
                                setShowJobModal(true);
                              }}
                              title="تعديل الوظيفة"
                            >
                              ✏️ تعديل
                            </button>
                            <button
                              type="button"
                              className="del-btn"
                              style={{ padding: '4px 8px', fontSize: '12px' }}
                              onClick={async () => {
                                if (assignedEmps.length > 0) {
                                  const confirmed = window.confirm(`⚠️ تنبيه: يوجد عدد (${assignedEmps.length}) موظف مسجلين حالياً على وظيفة (${j.title}). هل أنت متأكد من حذف هذه الوظيفة من قائمة الخيارات؟`);
                                  if (!confirmed) return;
                                } else {
                                  if (!window.confirm(`هل أنت متأكد من حذف وظيفة (${j.title})؟`)) return;
                                }

                                const updatedJobs = jobsList.filter(item => item.id !== j.id && item.title !== j.title);
                                const updatedState = { ...state, jobs: updatedJobs };
                                setState(updatedState);
                                showToast?.(`🗑️ تم حذف وظيفة (${j.title}) بنجاح`);
                                if (saveState) {
                                  saveState(updatedState).catch(err => console.error('Delete job error:', err));
                                }
                              }}
                              title="حذف الوظيفة"
                            >
                              🗑️ حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Add / Edit Job Modal */}
          {showJobModal && (
            <div className="modal-backdrop" style={{ zIndex: 1100 }}>
              <div className="modal-content card" style={{ maxWidth: '540px', width: '92%', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                  <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo' }}>
                    {editingJob ? '✏️ تعديل بيانات الوظيفة' : '➕ إضافة مسمى وظيفي جديد'}
                  </h3>
                  <button className="btn btn-ghost" onClick={() => setShowJobModal(false)}>✕</button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!jobTitleInput.trim()) {
                      showToast?.('⚠️ يرجى إدخال اسم المسمى الوظيفي');
                      return;
                    }

                    const cleanTitle = jobTitleInput.trim();
                    const isExisting = jobsList.some(j => j.title.toLowerCase() === cleanTitle.toLowerCase() && j.id !== editingJob?.id);
                    if (isExisting) {
                      showToast?.('⚠️ هذا المسمى الوظيفي موجود بالفعل في القائمة');
                      return;
                    }

                    const selectedDept = jobDeptInput || departmentsList[0] || 'الصيدلية';

                    let updatedJobs;
                    let updatedEmployees = [...(state.employees || [])];

                    if (editingJob) {
                      // Update existing job
                      updatedJobs = jobsList.map(j => {
                        if (j.id === editingJob.id || j.title === editingJob.title) {
                          return {
                            ...j,
                            title: cleanTitle,
                            department: selectedDept,
                            isManagement: jobIsMgmtInput,
                            isAdminRole: jobIsMgmtInput,
                            description: jobDescInput.trim()
                          };
                        }
                        return j;
                      });

                      // Update jobTitle & department in employees if title changed
                      if (editingJob.title !== cleanTitle) {
                        updatedEmployees = updatedEmployees.map(emp => {
                          if (emp.jobTitle === editingJob.title) {
                            return { ...emp, jobTitle: cleanTitle };
                          }
                          return emp;
                        });
                      }
                    } else {
                      // Add new job
                      const newJobObj = {
                        id: 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        title: cleanTitle,
                        department: selectedDept,
                        isManagement: jobIsMgmtInput,
                        isAdminRole: jobIsMgmtInput,
                        description: jobDescInput.trim()
                      };
                      updatedJobs = [...jobsList, newJobObj];
                    }

                    const updatedState = { ...state, jobs: updatedJobs, employees: updatedEmployees };
                    setState(updatedState);
                    setShowJobModal(false);
                    showToast?.(editingJob ? `✅ تم تعديل وظيفة (${cleanTitle}) بنجاح` : `✅ تمت إضافة وظيفة (${cleanTitle}) بنجاح`);

                    if (saveState) {
                      saveState(updatedState).catch(err => console.error('Save job error:', err));
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                >
                  <div className="field">
                    <label style={{ fontWeight: 'bold' }}>المسمى الوظيفي *</label>
                    <input
                      type="text"
                      value={jobTitleInput}
                      onChange={(e) => setJobTitleInput(e.target.value)}
                      placeholder="مثال: صيدلي أول / مدير فرع / مسؤول تسويق"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 'bold' }}>القسم التابع له المسمى الوظيفي *</label>
                    <select
                      value={jobDeptInput}
                      onChange={(e) => setJobDeptInput(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold' }}
                      required
                    >
                      {departmentsList.map((dept) => (
                        <option key={dept} value={dept}>
                          🏢 {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 'bold' }}>تصنيف طبيعة الوظيفة</label>
                    <div style={{ background: jobIsMgmtInput ? '#f0fdf4' : '#f8fafc', border: `1px solid ${jobIsMgmtInput ? '#86efac' : '#cbd5e1'}`, padding: '12px 14px', borderRadius: '10px', marginTop: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={jobIsMgmtInput}
                          onChange={(e) => setJobIsMgmtInput(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 'bold', fontSize: '13.5px', color: jobIsMgmtInput ? '#166534' : 'var(--text)' }}>
                          👔 هذه الوظيفة مصنفة كـ (وظيفة إدارية / إشرافية)
                        </span>
                      </label>
                      <p style={{ margin: '6px 0 0 28px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>
                        * عند تحديد هذا الخيار، سيظهر حقل مالي ديناميكي باسم <strong>(بدل إدارة)</strong> في ملف الموظف لتسجيل قيمة البدل وإضافتها في مسير الرواتب، وتوجيه كافة طلبات الموظف للإدارة العليا مباشرة.
                      </p>
                    </div>
                  </div>

                  <div className="field">
                    <label style={{ fontWeight: 'bold' }}>الوصف والمهام الوظيفية (اختياري)</label>
                    <textarea
                      value={jobDescInput}
                      onChange={(e) => setJobDescInput(e.target.value)}
                      placeholder="اكتب نبذة مختصرة عن مهام ومسؤوليات هذه الوظيفة..."
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', minHeight: '70px', background: 'var(--surface)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setShowJobModal(false)}>
                      إلغاء
                    </button>
                    <button type="submit" className="btn btn-start">
                      {editingJob ? '💾 حفظ التعديلات' : '➕ إضافة الوظيفة'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Security Modal: Factory Reset & Data Wipe Confirmation ── */}
      {showWipeModal && (
        <div className="modal-backdrop" style={{ zIndex: 1400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-content card"
            style={{
              maxWidth: '650px',
              width: '95%',
              padding: '28px',
              borderRadius: '20px',
              border: '2px solid #ef4444',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              background: 'var(--surface)'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                  ⚠️
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#991b1b', fontSize: '17px', fontWeight: 800 }}>
                    تأكيد مسح وتصفير بيانات النظام بالكامل
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>عملية حساسة ولا يمكن التراجع عنها</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  if (!isWiping) setShowWipeModal(false);
                }}
                disabled={isWiping}
                style={{ fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            {/* Impact Details Box */}
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
              <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '13.5px', marginBottom: '8px' }}>
                📌 تفاصيل ومحتويات عملية المسح والتصفير:
              </div>
              <ul style={{ margin: 0, paddingRight: '20px', fontSize: '12.5px', color: '#7f1d1d', lineHeight: '1.8' }}>
                <li><strong>سيتم حذف ومسح:</strong> كافة ملفات الموظفين، الفروع، الورديات، بصمات الوجه، سجلات الحضور والانصراف، الجداول الشهرية، السلف والديون، والطلبات بالكامل.</li>
                <li><strong>سيتم الاحتفاظ بـ:</strong> اسم مستخدم الإدارة العليا وكلمة المرور الحالية واسم المؤسسة للتمكن من تسجيل الدخول وإعادة التهيئة مباشرة.</li>
              </ul>
            </div>

            {/* Safe Auto-Backup Checkbox */}
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '12px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="wipe_auto_backup"
                checked={wipeAutoBackup}
                onChange={(e) => setWipeAutoBackup(e.target.checked)}
                disabled={isWiping}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="wipe_auto_backup" style={{ fontSize: '13px', color: '#065f46', fontWeight: 700, cursor: 'pointer' }}>
                💾 تنزيل نسخة احتياطية كاملة (JSON) تلقائياً على جهازي قبل تنفيذ المسح (موصى به كإجراء أمان)
              </label>
            </div>

            {/* Password Verification Field */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>
                🔒 أدخل كلمة مرور الإدارة العليا الحالية لتأكيد هويتك وتنفيذ المسح:
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showWipePasswordText ? 'text' : 'password'}
                  placeholder="كلمة مرور الإدارة العليا..."
                  value={wipeConfirmPassword}
                  onChange={(e) => setWipeConfirmPassword(e.target.value)}
                  disabled={isWiping}
                  style={{
                    width: '100%',
                    padding: '11px 40px 11px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && wipeConfirmPassword && !isWiping) {
                      handleExecuteFullDataWipe();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowWipePasswordText(!showWipePasswordText)}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: '#64748b'
                  }}
                >
                  {showWipePasswordText ? '👁️' : '🔒'}
                </button>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                * لن يتم قبول العملية إلا إذا تطابقت كلمة المرور المدخلة مع كلمة مرور الإدارة العليا الحالية.
              </span>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowWipeModal(false)}
                disabled={isWiping}
                style={{ padding: '9px 18px', fontWeight: 700 }}
              >
                إلغاء وتراجع
              </button>

              <button
                type="button"
                className="btn"
                onClick={handleExecuteFullDataWipe}
                disabled={isWiping || !wipeConfirmPassword}
                style={{
                  background: isWiping || !wipeConfirmPassword ? '#94a3b8' : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13.5px',
                  cursor: isWiping || !wipeConfirmPassword ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(220,38,38,0.25)'
                }}
              >
                {isWiping ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px' }}></span>
                    <span>جاري مسح وتصفير قاعدة البيانات...</span>
                  </>
                ) : (
                  <>
                    <span>🔥</span>
                    <span>تأكيد مسح وتصفير البيانات نهائياً</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
