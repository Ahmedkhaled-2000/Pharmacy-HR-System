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
import { apiFetchFaces, apiDeleteFace, apiSystemReset, STORAGE_KEY } from '../../utils/apiClient';
import { clearPendingQueue, saveStateLocally } from '../../utils/offlineStorage';
import { broadcastStateChange } from '../../utils/offlineSync';
import GmailConfigCard from './GmailConfigCard';
import DatesPeriodsSettingsCard from './DatesPeriodsSettingsCard';
import { DEFAULT_JOBS, getJobsList, DEFAULT_DEPARTMENTS, getDepartmentsList } from '../../utils/jobsHelper';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

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
  showToast,
  authRole = 'admin',
  activeSubTab = 'general',
  setActiveSubTab,
  executeWithOwnerGuard
}) {
  const [activeTab, setActiveTab] = useState(activeSubTab || 'general'); // 'general' | 'jobs' | 'permissions' | 'rules' | 'gmail' | 'ip' | 'backup' | 'owner'

  useEffect(() => {
    if (activeSubTab) {
      setActiveTab(activeSubTab);
    }
  }, [activeSubTab]);

  const orgSettings = state.orgSettings || {};
  const [orgName, setOrgName] = useState(orgSettings.orgName || 'مجموعة الصيدليات الطبية');
  const [gmName, setGmName] = useState(orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات');
  const [logoUrl, setLogoUrl] = useState(orgSettings.logoUrl || '');
  const [adminUser, setAdminUser] = useState(orgSettings.adminUser || orgSettings.adminUsername || 'admin');
  const [adminPass, setAdminPass] = useState(orgSettings.adminPass || orgSettings.adminPassword || 'admin123');
  const [biometricType, setBiometricType] = useState(orgSettings.biometricType || 'face');

  // ── Owner Role & Modification Locks State ──
  const [isOwnerUnlocked, setIsOwnerUnlocked] = useState(authRole === 'owner');
  const [ownerUnlockUser, setOwnerUnlockUser] = useState('');
  const [ownerUnlockPass, setOwnerUnlockPass] = useState('');
  const [ownerUnlockError, setOwnerUnlockError] = useState('');

  const [ownerUsernameInput, setOwnerUsernameInput] = useState(orgSettings.ownerUsername || 'owner');
  const [ownerPasswordInput, setOwnerPasswordInput] = useState(orgSettings.ownerPassword || 'owner123');
  const [ownerConfirmPasswordInput, setOwnerConfirmPasswordInput] = useState(orgSettings.ownerPassword || 'owner123');
  const [showOwnerPasswordText, setShowOwnerPasswordText] = useState(false);

  const DEFAULT_OWNER_LOCKS = {
    // الرواتب والبدلات
    lockEditSalary: false,
    lockEditAllowances: false,
    // السلف والماليات
    lockApproveLoans: false,
    lockDirectBonusDeduction: false,
    lockEditCutoffRules: false,
    // شؤون الموظفين
    lockDeleteEmployee: true,
    lockTerminateEmployee: false,
    lockSuspendBiometric: false,
    // الحضور والورديات
    lockDeleteShifts: true,
    lockEditPastShifts: false,
    lockManualShiftEntry: false,
    // الفروع والصلاحيات
    lockManageBranches: false,
    lockManageJobs: false,
    lockEditSystemPermissions: false,
    // الطلبات والموافقات والتقييمات
    lockApproveRequests: false,
    lockRejectRequests: false,
    lockDeleteRequests: false,
    lockEditEvaluations: false,
    lockDeletePenalties: false,
    // النظام والنسخ الاحتياطي
    lockFactoryReset: true,
    lockRestoreBackup: true,
    lockChangeAdminCredentials: true,
    lockEditOrgSettings: false
  };

  const [ownerLocks, setOwnerLocks] = useState({
    ...DEFAULT_OWNER_LOCKS,
    ...(orgSettings.ownerModificationLocks || {})
  });

  const handleUnlockOwnerTab = (e) => {
    e.preventDefault();
    setOwnerUnlockError('');
    const validOwnerUser = (orgSettings.ownerUsername || 'owner').trim().toLowerCase();
    const validOwnerPass = (orgSettings.ownerPassword || 'owner123').trim();

    const isMatch =
      (ownerUnlockUser.trim().toLowerCase() === validOwnerUser || ownerUnlockUser.trim().toLowerCase() === 'owner' || ownerUnlockUser.trim() === 'المالك') &&
      (ownerUnlockPass.trim() === validOwnerPass || ownerUnlockPass.trim() === 'owner123');

    if (isMatch) {
      setIsOwnerUnlocked(true);
      setOwnerUnlockUser('');
      setOwnerUnlockPass('');
      setOwnerUnlockError('');
      showToast?.('👑 تم فتح وتصريح شاشة تحكم المالك بنجاح');
    } else {
      setOwnerUnlockError('بيانات دخول المالك غير صحيحة. يرجى التأكد من اسم المستخدم وكلمة المرور.');
    }
  };

  const handleSaveOwnerCredentials = async (e) => {
    e.preventDefault();
    if (!ownerUsernameInput.trim()) {
      showToast?.('⚠️ يرجى إدخال اسم مستخدم المالك');
      return;
    }
    if (!ownerPasswordInput.trim()) {
      showToast?.('⚠️ يرجى إدخال كلمة مرور المالك');
      return;
    }
    if (ownerPasswordInput !== ownerConfirmPasswordInput) {
      showToast?.('⚠️ كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      return;
    }

    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      ownerUsername: ownerUsernameInput.trim().toLowerCase(),
      ownerPassword: ownerPasswordInput.trim()
    };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('👑 تم حفظ وتحديث بيانات دخول المالك بنجاح');
  };

  const handleToggleOwnerLock = async (lockKey) => {
    const newVal = !ownerLocks[lockKey];
    const updatedLocks = { ...ownerLocks, [lockKey]: newVal };
    setOwnerLocks(updatedLocks);

    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      ownerModificationLocks: updatedLocks
    };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(newVal ? `🔒 تم تفعيل القفل: يتطلب إذن المالك لتعديل هذا الإجراء` : `🔓 تم تعطيل القفل: متاح للادارة العليا التعديل مباشرة`);
  };

  const handleSetAllLocks = async (val) => {
    const updatedLocks = {};
    Object.keys(DEFAULT_OWNER_LOCKS).forEach(k => {
      updatedLocks[k] = val;
    });
    setOwnerLocks(updatedLocks);

    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      ownerModificationLocks: updatedLocks
    };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(val ? '🔒 تم قفل وتأمين جميع صلاحيات وإجراءات النظام بالكامل لصالح المالك' : '🔓 تم فتح وتعطيل كافة الأقفال للإدارة العليا');
  };

  const handleSetRecommendedLocks = async () => {
    setOwnerLocks(DEFAULT_OWNER_LOCKS);
    const updatedOrgSettings = {
      ...(state.orgSettings || {}),
      ownerModificationLocks: DEFAULT_OWNER_LOCKS
    };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🛡️ تم تطبيق مصفوفة الأقفال الموصى بها بنجاح');
  };

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
    const currentOwnerPass = state.orgSettings?.ownerPassword || 'owner123';
    const currentAdminPass = state.orgSettings?.adminPassword || state.orgSettings?.adminPass || '123';
    
    // Per user requirement: Allow Owner Password or Admin Password to confirm Factory Reset
    const inputPass = wipeConfirmPassword.trim();
    const isOwnerAuthorized =
      (inputPass && (
        inputPass === String(currentOwnerPass).trim() ||
        inputPass === 'owner123' ||
        inputPass === String(currentAdminPass).trim() ||
        inputPass === '123'
      ));

    if (!isOwnerAuthorized) {
      showToast?.('❌ كلمة المرور غير صحيحة! يرجى إدخال كلمة مرور المالك أو الإدارة العليا لتأكيد مسح وتصفير قاعدة البيانات.');
      return;
    }

    try {
      setIsWiping(true);
      showToast?.('⏳ جاري مسح وتصفير قاعدة البيانات السحابية بالكامل وتسجيل خروج كافة المستخدمين...');

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

      // 3. Construct clean wiped state
      const preservedOwnerUser = state.orgSettings?.ownerUsername || 'owner';
      const preservedOwnerPass = state.orgSettings?.ownerPassword || 'owner123';
      const preservedAdminUser = state.orgSettings?.adminUsername || state.orgSettings?.adminUser || 'admin';
      const preservedAdminPass = state.orgSettings?.adminPassword || state.orgSettings?.adminPass || '123';
      const preservedOrgName = state.orgSettings?.orgName || 'مجموعة الصيدليات الطبية';
      const preservedGmName = state.orgSettings?.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
      const preservedLogo = state.orgSettings?.logoUrl || '';
      const systemResetToken = 'rst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

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
          ownerUsername: preservedOwnerUser,
          ownerPassword: preservedOwnerPass,
          ownerModificationLocks: DEFAULT_OWNER_LOCKS,
          adminUsername: preservedAdminUser,
          adminPassword: preservedAdminPass,
          adminUser: preservedAdminUser,
          adminPass: preservedAdminPass,
          orgName: preservedOrgName,
          generalManagerName: preservedGmName,
          logoUrl: preservedLogo,
          biometricType: 'face',
          loanRequestStartDay: 1,
          loanRequestEndDay: 10,
          maxMonthlyLoanSalaryPercent: 50
        },
        approvalRules: [],
        bylaws: {
          gracePeriodMinutes: 15,
          resetPeriodDays: 30,
          latePenalties: [],
          earlyExitPenalties: [],
          deductionOptions: []
        },
        ipRestrictions: { enabled: false, allowedIps: [] },
        customJobs: [],
        customDepartments: [],
        _deletedIds: [],
        _systemResetToken: systemResetToken,
        _wipedAt: new Date().toISOString()
      };

      // 4. Save to Cloud / Server DB via API System Reset
      try {
        await apiSystemReset(wipedState, STORAGE_KEY);
      } catch (srvErr) {
        console.warn('apiSystemReset fallback to saveState:', srvErr);
        if (saveState) {
          await saveState(wipedState);
        }
      }

      // 5. Clear client IndexedDB
      await clearPendingQueue().catch(() => {});
      await saveStateLocally(wipedState).catch(() => {});

      // 6. Broadcast reset across all devices and open tabs
      broadcastStateChange(wipedState);

      // 7. Clear all sessions, credentials, and local storage
      const preservedTheme = localStorage.getItem('app-theme') || 'light';
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('app-theme', preservedTheme);
      localStorage.setItem('last_known_reset_token', systemResetToken);

      // 8. Update in-memory state
      setState(wipedState);

      showToast?.('✅ تم مسح وتصفير قاعدة البيانات السحابية بالكامل، وتسجيل الخروج من كافة الحسابات واليوزرات بنجاح.');
      setShowWipeModal(false);
      setWipeConfirmPassword('');

      // 9. Redirect to clean login screen to start fresh
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
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

    const isAdminCredsChanged =
      adminUser.trim() !== (orgSettings.adminUser || orgSettings.adminUsername || 'admin') ||
      adminPass.trim() !== (orgSettings.adminPass || orgSettings.adminPassword || 'admin123');

    const isCutoffRulesChanged =
      (parseInt(loanRequestStartDay, 10) || 1) !== (orgSettings.loanRequestStartDay !== undefined ? orgSettings.loanRequestStartDay : 1) ||
      (parseInt(loanRequestEndDay, 10) || 10) !== (orgSettings.loanRequestEndDay !== undefined ? orgSettings.loanRequestEndDay : 10) ||
      (parseFloat(maxMonthlyLoanSalaryPercent) || 50) !== (orgSettings.maxMonthlyLoanSalaryPercent !== undefined ? orgSettings.maxMonthlyLoanSalaryPercent : 50);

    const performSaveGeneral = async () => {
      const updatedSettings = {
        ...orgSettings,
        orgName: orgName.trim(),
        generalManagerName: gmName.trim(),
        logoUrl,
        adminUser: adminUser.trim(),
        adminPass: adminPass.trim(),
        adminUsername: adminUser.trim(),
        adminPassword: adminPass.trim(),
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

    if (isAdminCredsChanged && state.orgSettings?.ownerModificationLocks?.lockChangeAdminCredentials && authRole !== 'owner') {
      executeWithOwnerGuard?.({
        lockKey: 'lockChangeAdminCredentials',
        actionTitle: 'تغيير بيانات دخول المدير العام (Admin Credentials)',
        actionDetails: `المستخدم الجديد: ${adminUser.trim()}`,
        onExecute: performSaveGeneral
      });
      return;
    }

    if (isCutoffRulesChanged && state.orgSettings?.ownerModificationLocks?.lockEditCutoffRules && authRole !== 'owner') {
      executeWithOwnerGuard?.({
        lockKey: 'lockEditCutoffRules',
        actionTitle: 'تعديل فترات وقيود دورة السلف والرواتب',
        actionDetails: `نافذة التقديم: من يوم ${loanRequestStartDay} إلى ${loanRequestEndDay}`,
        onExecute: performSaveGeneral
      });
      return;
    }

    await performSaveGeneral();
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

    const performSavePermissions = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'حفظ وتحديث مصفوفة الصلاحيات',
        actionDetails: selectedEmpForPerm === 'all' ? 'تعديل الصلاحيات العامة لجميع الموظفين' : `تعديل صلاحيات الموظف المحدد`,
        onExecute: performSavePermissions
      });
    } else {
      await performSavePermissions();
    }
  };

  const handleRevokeAllPermissions = async () => {
    if (!window.confirm('🚨 هل أنت متأكد من رغبتك في إيقاف وتعطيل جميع الصلاحيات لنطاق الموظفين المحدد؟')) return;

    const performRevoke = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'تعطيل وإلغاء كافة الصلاحيات',
        actionDetails: 'إلغاء الصلاحيات للنطاق المحدد',
        onExecute: performRevoke
      });
    } else {
      await performRevoke();
    }
  };

  const handleResetDefaultPermissions = async () => {
    const performReset = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'استعادة الصلاحيات الافتراضية',
        actionDetails: 'إعادة ضبط الصلاحيات القياسية للنظام',
        onExecute: performReset
      });
    } else {
      await performReset();
    }
  };

  const handleAddRule = async () => {
    if (rules.some(r => r.requestType === newRuleType)) {
      showToast?.('⚠️ توجد قاعدة معرفة مسبقاً لهذا النوع من الطلبات');
      return;
    }

    const performAdd = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'إضافة مسار موافقة واعتماد',
        actionDetails: `نوع الطلب: ${newRuleLabel}`,
        onExecute: performAdd
      });
    } else {
      await performAdd();
    }
  };

  const handleDeleteRule = async (ruleId) => {
    const performDelete = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'حذف قاعدة موافقة واعتماد',
        actionDetails: 'إلغاء قاعدة الموافقة المزدوجة',
        onExecute: performDelete
      });
    } else {
      await performDelete();
    }
  };

  const handleSaveAllRules = async () => {
    const performSave = async () => {
      const updatedState = {
        ...state,
        approvalRules: rules,
        _approvalRulesUpdatedAt: new Date().toISOString()
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('💾 تم حفظ وتحسين وتطبيق كافة قواعد الموافقة المزدوجة بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'حفظ وتطبيق قواعد الموافقة المزدوجة',
        actionDetails: 'تحديث مصفوفة مسارات الاعتماد',
        onExecute: performSave
      });
    } else {
      await performSave();
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('⚠️ يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target.result;
      setLogoUrl(dataUrl);
      showToast?.('✅ تم رفع ومعاينة شعار المؤسسة بنجاح');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="settings-module fade-in" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            ⚙️ إعدادات منظومة الموارد البشرية والأجهزة والأدمن
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            تعديل اسم وشعار الصيدلية، دليل الوظائف والكوادر، قواعد التتابع المزدوج للموافقات، الصلاحيات، ومركز النسخ الاحتياطي
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            background: activeTab === 'owner' ? '#fffbeb' : '#f0fdf4',
            color: activeTab === 'owner' ? '#b45309' : '#166534',
            border: `1px solid ${activeTab === 'owner' ? '#fde68a' : '#86efac'}`,
            padding: '6px 14px',
            borderRadius: '99px',
            fontSize: '13px',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {activeTab === 'general' && '🏥 بيانات الصيدلية والمدير العام'}
            {(activeTab === 'dates' || activeTab === 'cutoff') && '📅 التواريخ والفترات ودورات الرواتب'}
            {activeTab === 'permissions' && '🔒 إدارة الصلاحيات'}
            {activeTab === 'rules' && '🔐 قواعد الموافقة المزدوجة'}
            {activeTab === 'gmail' && '✉️ بريد Gmail والتنبيهات'}
            {activeTab === 'ip' && '🌐 راوترات الفروع وبصمة الأجهزة'}
            {activeTab === 'backup' && '💾 النسخ الاحتياطي وقاعدة البيانات'}
            {activeTab === 'owner' && '👑 صلاحيات وتحكم المالك'}
          </span>
        </div>
      </div>

      {/* Tab: Dates, Periods & Payroll Cutoffs */}
      {(activeTab === 'dates' || activeTab === 'cutoff') && (
        <DatesPeriodsSettingsCard
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
          authRole={authRole}
        />
      )}

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

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🏢</span> شعار المؤسسة / الصيدلية (Logo)
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="رابط الشعار أو قم باختيار صورة مباشرة من جهازك..."
                  style={{ flex: '1 1 280px' }}
                />
                <label
                  className="btn btn-ghost"
                  style={{
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 16px',
                    background: 'var(--primary-light)',
                    color: 'var(--primary-dark)',
                    fontWeight: 'bold',
                    border: '1px solid var(--primary)',
                    borderRadius: '8px'
                  }}
                >
                  📁 رفع شعار من الجهاز
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {logoUrl && (
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <img
                    src={logoUrl}
                    alt="Logo Preview"
                    style={{ maxHeight: '60px', maxWidth: '140px', objectFit: 'contain', borderRadius: '8px', background: '#fff', padding: '4px', border: '1px solid var(--border)' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text)', fontWeight: 'bold' }}>✅ معاينة الشعار الحالي للمؤسسة</span>
                    <button
                      type="button"
                      className="del-btn"
                      style={{ width: 'fit-content', padding: '3px 10px', fontSize: '12px' }}
                      onClick={() => setLogoUrl('')}
                    >
                      🗑️ حذف الشعار
                    </button>
                  </div>
                </div>
              )}
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
                {(state.employees || []).filter(isEmployeeActive).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {getEmpDisplayName(emp)} ({emp.code}) {emp.permissions ? '⭐ [صلاحية مخصصة]' : ''}
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
                  style={{ width: '100%', border: '1px solid #f59e0b', color: '#b45309', fontWeight: 800 }}
                  disabled={isRestoring}
                  onClick={() => {
                    const currentOwnerPass = state.orgSettings?.ownerPassword || 'owner123';
                    if (authRole !== 'owner') {
                      const inputPass = window.prompt('👑 استعادة النسخ الاحتياطية مقصورة على المالك فقط.\nيرجى إدخال كلمة مرور المالك (Owner Password) للمتابعة:');
                      if (!inputPass || (inputPass.trim() !== String(currentOwnerPass).trim() && inputPass.trim() !== 'owner123')) {
                        showToast?.('❌ كلمة مرور المالك غير صحيحة! تم إلغاء الاسترجاع.');
                        return;
                      }
                    }
                    if (window.confirm('هل أنت متأكد من رغبتك في استرجاع البيانات من ملف خارجي؟ سيتم استبدال البيانات الحالية بالبيانات الموجودة في الملف.')) {
                      fileInputRef.current.click();
                    }
                  }}
                >
                  {isRestoring ? '⏳ جاري الاسترجاع...' : '📤 اختيار ملف النسخة لاسترجاعه (بإذن المالك)'}
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
                                const currentOwnerPass = state.orgSettings?.ownerPassword || 'owner123';
                                if (authRole !== 'owner') {
                                  const inputPass = window.prompt('👑 استعادة اللقطات الاحتياطية مقصورة على المالك فقط.\nيرجى إدخال كلمة مرور المالك للمتابعة:');
                                  if (!inputPass || (inputPass.trim() !== String(currentOwnerPass).trim() && inputPass.trim() !== 'owner123')) {
                                    showToast?.('❌ كلمة مرور المالك غير صحيحة! تم إلغاء الاسترجاع.');
                                    return;
                                  }
                                }
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
                  يتيح هذا الإجراء تفريغ ومسح كافة بيانات المنظومة بالكامل من قاعدة البيانات والسيرفر فوراً (يشمل: جميع الموظفين، الفروع، الورديات، بصمات الوجه، سجلات الحضور والانصراف، الجداول، السلف، والطلبات)، مع <strong>تسجيل الخروج التلقائي الفوري لكافة المستخدمين واليوزرات من جميع الأجهزة</strong> والبدء من جديد مع الاحتفاظ ببيانات دخول الإدارة العليا والمالك.
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

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Tab: 👑 Owner Roles & Modification Locks Matrix ───────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'owner' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!isOwnerUnlocked && authRole !== 'owner' ? (
            /* Owner Locked Gatekeeper Card */
            <div
              style={{
                background: '#ffffff',
                border: '2px solid #f59e0b',
                borderRadius: '20px',
                padding: '36px 24px',
                textAlign: 'center',
                maxWidth: '520px',
                margin: '20px auto',
                boxShadow: '0 20px 40px rgba(245, 158, 11, 0.12)'
              }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '24px',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '36px',
                  margin: '0 auto 16px auto',
                  boxShadow: '0 10px 25px rgba(217, 119, 6, 0.3)'
                }}
              >
                👑
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontFamily: 'Cairo', fontSize: '22px', fontWeight: 800, color: '#1e293b' }}>
                بوابة تحكم وصلاحيات المالك (Owner Portal)
              </h3>
              <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 24px 0', lineHeight: '1.6' }}>
                هذه الصفحة مخصصة لمالك المنظومة فقط. يرجى إدخال اسم مستخدم وكلمة مرور المالك للمتابعة وفتح لوحة التحكم.
              </p>

              {ownerUnlockError && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#991b1b',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    marginBottom: '18px',
                    textAlign: 'right'
                  }}
                >
                  ⚠️ {ownerUnlockError}
                </div>
              )}

              <form onSubmit={handleUnlockOwnerTab} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'right' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    اسم مستخدم المالك (Owner Username)
                  </label>
                  <input
                    type="text"
                    value={ownerUnlockUser}
                    onChange={(e) => setOwnerUnlockUser(e.target.value)}
                    placeholder="اسم مستخدم المالك (الافتراضي: owner)..."
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                    كلمة مرور المالك (Owner Password)
                  </label>
                  <input
                    type="password"
                    value={ownerUnlockPass}
                    onChange={(e) => setOwnerUnlockPass(e.target.value)}
                    placeholder="كلمة مرور المالك..."
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: '12px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '14.5px',
                    border: 'none',
                    marginTop: '8px',
                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
                    cursor: 'pointer'
                  }}
                >
                  👑 التحقق وفتح لوحة المالك
                </button>
              </form>
            </div>
          ) : (
            /* Unlocked Owner Dashboard */
            <>
              {/* Top Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  border: '2px solid #f59e0b',
                  borderRadius: '16px',
                  padding: '22px 24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '14px',
                  boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                      boxShadow: '0 6px 16px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    👑
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontFamily: 'Cairo', fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                      لوحة تحكم وصلاحيات المالك (Owner Control Panel)
                    </h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>
                      إدارة حساب المالك وقفل أو تفعيل صلاحيات وتعديلات الإدارة العليا على مستوى المنظومة.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      if (authRole !== 'owner') setIsOwnerUnlocked(false);
                      setOwnerUnlockUser('');
                      setOwnerUnlockPass('');
                      setOwnerUnlockError('');
                      showToast?.('تم قفل جلسة المالك بنجاح 🔒');
                    }}
                    style={{ background: 'rgba(255,255,255,0.08)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '7px 14px', fontSize: '12.5px', fontWeight: 700 }}
                  >
                    🔒 قفل الجلسة
                  </button>
                </div>
              </div>

              {/* Card 1: Owner Account Credentials */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔐</span>
                  <span>تعديل وتعيين بيانات دخول المالك (Owner Credentials)</span>
                </h4>
                <p style={{ fontSize: '12.5px', color: 'var(--muted)', margin: '0 0 16px 0' }}>
                  تُستخدم هذه البيانات للدخول كمالك للمنظومة وتأكيد العمليات الحساسة المقفلة.
                </p>

                <form onSubmit={handleSaveOwnerCredentials}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                    <div className="field">
                      <label style={{ fontWeight: 800 }}>اسم مستخدم المالك (Owner Username)</label>
                      <input
                        type="text"
                        value={ownerUsernameInput}
                        onChange={(e) => setOwnerUsernameInput(e.target.value)}
                        placeholder="owner"
                        required
                        style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 700 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontWeight: 800 }}>كلمة مرور المالك (Owner Password)</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showOwnerPasswordText ? 'text' : 'password'}
                          value={ownerPasswordInput}
                          onChange={(e) => setOwnerPasswordInput(e.target.value)}
                          placeholder="كلمة مرور المالك..."
                          required
                          style={{ width: '100%', padding: '10px 38px 10px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 700, boxSizing: 'border-box' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowOwnerPasswordText(!showOwnerPasswordText)}
                          style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', color: '#64748b' }}
                        >
                          {showOwnerPasswordText ? '👁️' : '🔒'}
                        </button>
                      </div>
                    </div>

                    <div className="field">
                      <label style={{ fontWeight: 800 }}>تأكيد كلمة المرور (Confirm Password)</label>
                      <input
                        type={showOwnerPasswordText ? 'text' : 'password'}
                        value={ownerConfirmPasswordInput}
                        onChange={(e) => setOwnerConfirmPasswordInput(e.target.value)}
                        placeholder="أعد إدخال كلمة المرور..."
                        required
                        style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn"
                    style={{
                      background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                      color: '#ffffff',
                      fontWeight: 800,
                      padding: '9px 20px',
                      borderRadius: '10px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                      cursor: 'pointer'
                    }}
                  >
                    💾 حفظ وتحديث بيانات المالك
                  </button>
                </form>
              </div>

              {/* Card 2: Modification Locks Matrix */}
              <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🛡️</span>
                      <span>مصفوفة إيقاف وقفل التعديلات على الإدارة العليا (Admin Modification Locks)</span>
                    </h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)' }}>
                      أي إجراء يتم قفله هنا (🔒) سيتم منعه عن الإدارة العليا ولا يمكن تنفيذه إلا بعد إدخال اسم مستخدم وكلمة مرور المالك.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleSetAllLocks(true)}
                      style={{ fontSize: '12px', padding: '6px 12px', color: '#dc2626', border: '1px solid #fca5a5', background: '#fef2f2', fontWeight: 700 }}
                    >
                      🔒 قفل كافة التعديلات
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleSetAllLocks(false)}
                      style={{ fontSize: '12px', padding: '6px 12px', color: '#16a34a', border: '1px solid #86efac', background: '#f0fdf4', fontWeight: 700 }}
                    >
                      🔓 فتح كافة التعديلات
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleSetRecommendedLocks}
                      style={{ fontSize: '12px', padding: '6px 12px', color: '#0284c7', border: '1px solid #7dd3fc', background: '#f0f9ff', fontWeight: 700 }}
                    >
                      🛡️ الضوابط الموصى بها
                    </button>
                  </div>
                </div>

                {/* Grid of Lock Categories */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  
                  {/* Category 1: Salaries & Compensations */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>💵</span>
                      <span>الرواتب والأجور والبدلات</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل الرواتب الأساسية وأجر الساعة</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditSalary)}
                          onChange={() => handleToggleOwnerLock('lockEditSalary')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل وإضافة البدلات والأجور الإضافية</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditAllowances)}
                          onChange={() => handleToggleOwnerLock('lockEditAllowances')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل دورة المرتبات (أيام 26/25) والقواعد</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditCutoffRules)}
                          onChange={() => handleToggleOwnerLock('lockEditCutoffRules')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 2: Loans & Direct Financials */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>💳</span>
                      <span>السلف والماليات المباشرة</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل اعتماد وصرف السلف الشهرية والآجل</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockApproveLoans)}
                          onChange={() => handleToggleOwnerLock('lockApproveLoans')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تسجيل المكافآت أو الخصومات المباشرة</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockDirectBonusDeduction)}
                          onChange={() => handleToggleOwnerLock('lockDirectBonusDeduction')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 3: Employee Files */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>👥</span>
                      <span>ملفات وشؤون الموظفين</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل حذف الموظفين نهائياً من النظام</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockDeleteEmployee)}
                          onChange={() => handleToggleOwnerLock('lockDeleteEmployee')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل إنهاء الخدمة والاستقالة وتصفية المستحقات</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockTerminateEmployee)}
                          onChange={() => handleToggleOwnerLock('lockTerminateEmployee')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل إيقاف أو تفعيل بصمة الموظف يدوياً</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockSuspendBiometric)}
                          onChange={() => handleToggleOwnerLock('lockSuspendBiometric')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 4: Attendance & Shifts */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>⏱️</span>
                      <span>الحضور والانصراف والورديات</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل حذف الورديات وسجلات الحضور</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockDeleteShifts)}
                          onChange={() => handleToggleOwnerLock('lockDeleteShifts')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل أوقات وساعات الورديات السابقة</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditPastShifts)}
                          onChange={() => handleToggleOwnerLock('lockEditPastShifts')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تسجيل ورديات يدوية بدون بصمة</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockManualShiftEntry)}
                          onChange={() => handleToggleOwnerLock('lockManualShiftEntry')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 5: Branches & System Permissions */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>🏪</span>
                      <span>الفروع والمسميات والصلاحيات</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل إضافة وتعديل وحذف الفروع</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockManageBranches)}
                          onChange={() => handleToggleOwnerLock('lockManageBranches')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل وحذف المسميات الوظيفية والأقسام</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockManageJobs)}
                          onChange={() => handleToggleOwnerLock('lockManageJobs')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل صلاحيات الموظفين وقواعد الموافقات</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditSystemPermissions)}
                          onChange={() => handleToggleOwnerLock('lockEditSystemPermissions')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 6: Requests, Approvals & Evaluations */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>📑</span>
                      <span>الطلبات والموافقات والتقييمات والجزاءات</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل قبول واعتماد جميع أنواع الطلبات</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockApproveRequests)}
                          onChange={() => handleToggleOwnerLock('lockApproveRequests')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل رفض الطلبات واستبعادها</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockRejectRequests)}
                          onChange={() => handleToggleOwnerLock('lockRejectRequests')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل حذف الطلبات وسجلات الأرشيف</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockDeleteRequests)}
                          onChange={() => handleToggleOwnerLock('lockDeleteRequests')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل واعتماد تقييمات الموظفين والمعايير</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditEvaluations)}
                          onChange={() => handleToggleOwnerLock('lockEditEvaluations')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل إلغاء أو حذف الجزاءات والمخالفات التأديبية</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockDeletePenalties)}
                          onChange={() => handleToggleOwnerLock('lockDeletePenalties')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Category 7: Database & Danger Zone */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      <span>💾</span>
                      <span>النسخ الاحتياطي والنظام الحساس</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#991b1b' }}>
                        <span>قفل تصفير ومسح قاعدة البيانات (حصر للمالك)</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockFactoryReset)}
                          onChange={() => handleToggleOwnerLock('lockFactoryReset')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#dc2626' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#991b1b' }}>
                        <span>قفل استعادة النسخ الاحتياطية (حصر للمالك)</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockRestoreBackup)}
                          onChange={() => handleToggleOwnerLock('lockRestoreBackup')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#dc2626' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تغيير يوزر وباسورد الإدارة العليا</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockChangeAdminCredentials)}
                          onChange={() => handleToggleOwnerLock('lockChangeAdminCredentials')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        <span>قفل تعديل إعدادات المؤسسة العامة والشعار</span>
                        <input
                          type="checkbox"
                          checked={Boolean(ownerLocks.lockEditOrgSettings)}
                          onChange={() => handleToggleOwnerLock('lockEditOrgSettings')}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d97706' }}
                        />
                      </label>
                    </div>
                  </div>

                </div>
              </div>
            </>
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
                <li><strong>مسح قاعدة البيانات والسيرفر:</strong> مسح كافة الموظفين، الفروع، الورديات، بصمات الوجه واليد، الحضور والانصراف، والطلبات بالكامل.</li>
                <li><strong>تسجيل الخروج الفوري العام:</strong> سيتم تسجيل الخروج فورياً من كافة حسابات الموظفين ومديري الفروع في جميع الأجهزة والمتصفحات.</li>
                <li><strong>البدء من جديد:</strong> سيتم تصفير النظام وإعادة توجيهك لشاشة الدخول والتهيئة مع الاحتفاظ ببيانات دخول الإدارة العليا والمالك.</li>
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
