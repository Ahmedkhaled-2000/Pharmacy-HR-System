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
import GmailConfigCard from './GmailConfigCard';

const ALL_REQUEST_TYPES = [
  { type: 'leave', label: 'طلبات الإجازات السنوية والرسمية' },
  { type: 'loan', label: 'طلبات السلف والآجل' },
  { type: 'permission', label: 'طلبات الأذونات والتأخيرات' },
  { type: 'swap', label: 'طلبات تبديل الشفتات والراحات' },
  { type: 'roster_edit', label: 'طلبات تعديل الجداول الشهرية' },
  { type: 'bonus', label: 'طلبات وصرف المكافآت' },
  { type: 'penalty', label: 'طلبات الخصومات والجزاءات' },
  { type: 'complaint', label: 'الشكاوى وملاحظات التقييم' },
  { type: 'punch_correction', label: 'طلبات تأكيد وتصحيح بصمات الوجه واليد' }
];

export default function SettingsModule({
  state,
  setState,
  saveState,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('general'); // 'general' | 'permissions' | 'rules' | 'gmail' | 'ip' | 'backup'

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

  // Approval Rules Configuration & Add Modal States
  const [rules, setRules] = useState(state.approvalRules || [
    { id: '1', requestType: 'leave', typeLabel: 'طلبات الإجازات السنوية', reqBranch: true, reqAdmin: true },
    { id: '2', requestType: 'loan', typeLabel: 'طلبات السلف والآجل', reqBranch: false, reqAdmin: true },
    { id: '3', requestType: 'permission', typeLabel: 'طلبات الأذونات والتأخيرات', reqBranch: true, reqAdmin: true },
    { id: '4', requestType: 'swap', typeLabel: 'طلبات تبديل الشفتات', reqBranch: true, reqAdmin: true }
  ]);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleType, setNewRuleType] = useState('leave');
  const [newRuleLabel, setNewRuleLabel] = useState('طلبات الإجازات السنوية والرسمية');
  const [newRuleReqBranch, setNewRuleReqBranch] = useState(true);
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
      approvedIPs // keeping this for legacy components
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
    const updatedState = { ...state, approvalRules: updatedRules };
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
    Object.keys(permState).forEach((k) => { allTrue[k] = true; });
    SYSTEM_PERMISSION_CATALOG.forEach((p) => { allTrue[p.key] = true; });
    setPermState(allTrue);
    showToast?.('🔓 تم منح وتفعيل كافة الصلاحيات — اضغط حفظ لتطبيقها فوراً');
  };

  const handleSavePermissions = async () => {
    // Generate full expanded permissions map with both canX and allowX
    const expandedPerms = { ...permState };
    Object.keys(permState).forEach((k) => {
      let actionName = k;
      if (k.startsWith('can')) actionName = k.slice(3);
      else if (k.startsWith('allow')) actionName = k.slice(5);
      expandedPerms['can' + actionName] = Boolean(permState[k]);
      expandedPerms['allow' + actionName] = Boolean(permState[k]);
    });

    let updatedOrgSettings = { ...(state.orgSettings || orgSettings) };
    let updatedEmployees = [...(state.employees || [])];

    if (selectedEmpForPerm === 'all') {
      updatedOrgSettings = {
        ...updatedOrgSettings,
        permissions: { ...expandedPerms },
        empPermissions: {}
      };
      updatedEmployees = updatedEmployees.map((e) => ({
        ...e,
        permissions: { ...expandedPerms }
      }));
      showToast?.('💾 تم حفظ ومنح وتطبيق الصلاحيات بنجاح على جميع الموظفين بالنظام');
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
        (String(e.id) === targetId || String(e.code) === targetCode) ? { ...e, permissions: { ...expandedPerms } } : e
      );
      showToast?.(`💾 تم حفظ ومنح وتطبيق الصلاحيات للموظف (${targetEmp?.name || selectedEmpForPerm}) بنجاح`);
    }

    const updatedState = { ...state, orgSettings: updatedOrgSettings, employees: updatedEmployees };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleRevokeAllPermissions = async () => {
    if (!window.confirm('🚨 هل أنت متأكد من رغبتك في إزالة وتجريد جميع الصلاحيات من كافة الموظفين بالنظام؟')) return;

    const allFalse = {};
    Object.keys(permState).forEach((k) => { allFalse[k] = false; });
    SYSTEM_PERMISSION_CATALOG.forEach((p) => { allFalse[p.key] = false; });

    const updatedOrgSettings = {
      ...orgSettings,
      permissions: allFalse,
      empPermissions: {}
    };

    const updatedEmployees = (state.employees || []).map((e) => ({
      ...e,
      permissions: allFalse
    }));

    setPermState(allFalse);

    const updatedState = { ...state, orgSettings: updatedOrgSettings, employees: updatedEmployees };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🚫 تم سحب وإزالة جميع الصلاحيات من كافة الموظفين بنجاح');
  };

  const handleResetDefaultPermissions = async () => {
    const updatedOrgSettings = {
      ...orgSettings,
      permissions: defaultPerms,
      empPermissions: {}
    };

    const updatedEmployees = (state.employees || []).map((e) => {
      const { permissions, ...rest } = e;
      return rest;
    });

    setPermState(defaultPerms);

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
    const updatedState = { ...state, approvalRules: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم إضافة قاعدة موافقة جديدة وتطبيقها بنجاح');
  };

  const handleDeleteRule = async (ruleId) => {
    const updated = rules.filter(r => r.id !== ruleId);
    setRules(updated);
    const updatedState = { ...state, approvalRules: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف قاعدة الموافقة بنجاح');
  };

  const handleSaveAllRules = async () => {
    const updatedState = { ...state, approvalRules: rules };
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
            تعديل اسم وشعار الصيدلية، قواعد التتابع المزدوج للموافقات، الصلاحيات، ومركز النسخ الاحتياطي
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'general' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setActiveTab('general')}>
            🏥 بيانات الصيدلية والمدير العام
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
        </div>
      )}


    </div>
  );
}
