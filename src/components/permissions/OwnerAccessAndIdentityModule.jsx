import React, { useState, useMemo } from 'react';
import { applyBrandIdentityToDOM } from '../../utils/brandThemeEngine';
import { TOP_MGMT_MODULES } from '../../utils/permissionUtils';
import { apiSaveSettingsSlice } from '../../utils/apiClient';

export default function OwnerAccessAndIdentityModule({
  state,
  setState,
  saveState,
  showToast,
  authRole = 'owner',
  onNavigateTab
}) {
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'brand' | 'owners'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterPermissionStatus, setFilterPermissionStatus] = useState('all'); // 'all' | 'custom' | 'standard'

  // نافذة ضبط صلاحيات الموظف
  const [editingEmp, setEditingEmp] = useState(null);
  const [empAccessForm, setEmpAccessForm] = useState(null);
  const [isSavingEmp, setIsSavingEmp] = useState(false);

  // نافذة إضافة/تعديل مالك
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ username: '', password: '', fullName: '', phone: '' });
  const [editingOwnerId, setEditingOwnerId] = useState(null);
  const [isSavingOwner, setIsSavingOwner] = useState(false);

  const orgSettings = state?.orgSettings || {};
  const branches = state?.branches || [];
  const rawEmployees = state?.employees || [];

  // جلب موظفي الـ HR الحقيقيين فقط (استبعاد المحذوفين)
  const employees = useMemo(() => {
    return rawEmployees.filter(e => e && typeof e === 'object' && (e.id || e.code));
  }, [rawEmployees]);

  // خريطة الصلاحيات الموحدة المحفوظة في orgSettings
  const employeeUnifiedAccess = useMemo(() => {
    return orgSettings?.employeeUnifiedAccess || {};
  }, [orgSettings?.employeeUnifiedAccess]);

  // قائمة المالكين المعتمدين (قراءة ديناميكية من orgSettings مع ضمان وجود المالك الأساسي سيف saif)
  const systemOwners = useMemo(() => {
    const rawList = Array.isArray(orgSettings?.systemOwners) ? orgSettings.systemOwners : [];
    const primaryUser = String(orgSettings?.ownerUsername || 'saif').toLowerCase();
    const hasPrimary = rawList.some(o => o && String(o.username || '').toLowerCase() === primaryUser);
    const list = rawList.map(o => {
      const isPri = Boolean(o.isPrimaryOwner || String(o.username || '').toLowerCase() === primaryUser);
      return {
        ...o,
        isPrimaryOwner: isPri,
        password: o.password || (isPri ? (orgSettings?.ownerPassword || '181013') : '')
      };
    });
    if (!hasPrimary) {
      list.unshift({
        id: 'owner_saif',
        username: orgSettings?.ownerUsername || 'saif',
        password: orgSettings?.ownerPassword || '181013',
        fullName: orgSettings?.ownerFullName || 'سيف (المالك الأساسي المعتمد)',
        phone: orgSettings?.ownerPhone || '',
        isActive: true,
        isPrimaryOwner: true
      });
    }
    return list;
  }, [orgSettings?.systemOwners, orgSettings?.ownerUsername, orgSettings?.ownerPassword, orgSettings?.ownerFullName, orgSettings?.ownerPhone]);

  // نموذج هوية النظام
  const [brandForm, setBrandForm] = useState(() => {
    const brand = orgSettings?.brandIdentity || {};
    return {
      systemName: brand.systemName || orgSettings?.orgName || 'نظام إدارة الصيدليات',
      generalManagerName: brand.generalManagerName || orgSettings?.generalManagerName || '',
      logoUrl: brand.logoUrl || orgSettings?.logoUrl || '',
      primaryColor: brand.primaryColor || '#0d9488',
      secondaryColor: brand.secondaryColor || '#0f766e',
      accentGradient: brand.accentGradient || 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
      welcomeMessage: brand.welcomeMessage || ''
    };
  });
  const [isSavingBrand, setIsSavingBrand] = useState(false);

  // إحصائيات سريعة
  const stats = useMemo(() => {
    let configuredCount = 0;
    let branchMgrCount = 0;
    let topMgmtCount = 0;
    let outstockCount = 0;
    let accountsCount = 0;

    employees.forEach(emp => {
      const u = employeeUnifiedAccess[emp.id] || employeeUnifiedAccess[emp.code];
      if (u && u.isEnabled) {
        configuredCount++;
        if (u.permissions?.branchManager?.enabled) branchMgrCount++;
        if (u.permissions?.topManagement?.enabled) topMgmtCount++;
        if (u.permissions?.outstockHandling?.enabled) outstockCount++;
        if (u.permissions?.accountsSystem?.enabled) accountsCount++;
      }
    });

    return {
      total: employees.length,
      configuredCount,
      branchMgrCount,
      topMgmtCount,
      outstockCount,
      accountsCount
    };
  }, [employees, employeeUnifiedAccess]);

  // فلترة الموظفين
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const q = searchQuery.trim().toLowerCase();
      const name = String(emp.name || '').toLowerCase();
      const code = String(emp.code || '').toLowerCase();
      const job = String(emp.jobTitle || '').toLowerCase();

      const matchSearch = !q || name.includes(q) || code.includes(q) || job.includes(q);
      const matchBranch = filterBranch === 'all' || String(emp.branchId) === String(filterBranch);

      const u = employeeUnifiedAccess[emp.id] || employeeUnifiedAccess[emp.code];
      const hasCustom = u && u.isEnabled;

      const matchStatus =
        filterPermissionStatus === 'all' ||
        (filterPermissionStatus === 'custom' && hasCustom) ||
        (filterPermissionStatus === 'standard' && !hasCustom);

      return matchSearch && matchBranch && matchStatus;
    });
  }, [employees, searchQuery, filterBranch, filterPermissionStatus, employeeUnifiedAccess]);

  // ── فتح نافذة تعديل صلاحيات الموظف ──
  const handleOpenEmpPermissions = (emp) => {
    setEditingEmp(emp);
    const existing = employeeUnifiedAccess[emp.id] || employeeUnifiedAccess[emp.code] || null;

    if (existing) {
      const parsed = JSON.parse(JSON.stringify(existing));
      if (parsed.permissions?.topManagement) {
        parsed.permissions.topManagement.canModifyOrExemptPenalties = Boolean(parsed.permissions.topManagement.canModifyOrExemptPenalties);
      }
      if (parsed.permissions?.branchManager) {
        delete parsed.permissions.branchManager.canModifyOrExemptPenalties;
      }
      setEmpAccessForm(parsed);
    } else {
      // إعداد افتراضي نظيف (بدون تفعيل أي صلاحيات تلقائية لحين قيام المالك بمنحها)
      setEmpAccessForm({
        employeeId: emp.id,
        employeeCode: emp.code,
        username: emp.username || emp.code || '',
        password: emp.password || '123',
        isEnabled: false,
        permissions: {
          hrPersonalPortal: { enabled: true },
          branchManager: {
            enabled: false,
            assignedBranchId: emp.branchId || (branches[0]?.id || '')
          },
          topManagement: {
            enabled: false,
            allowedModules: ['dashboard'],
            canModifyOrExemptPenalties: false
          },
          outstockHandling: {
            enabled: false,
            role: 'branch', // 'branch' | 'procurement_manager' | 'procurement_team'
            assignedBranchId: emp.branchId || (branches[0]?.id || ''),
            allBranchesAccess: false,
            assignedBranchIds: emp.branchId ? [emp.branchId] : []
          },
          accountsSystem: {
            enabled: false
          }
        }
      });
    }
  };

  // ── حفظ صلاحيات الموظف ──
  const handleSaveEmpPermissions = async () => {
    if (!editingEmp || !empAccessForm) return;
    setIsSavingEmp(true);

    try {
      const nowIso = new Date().toISOString();
      const isProcMgr = empAccessForm.permissions?.outstockHandling?.enabled && empAccessForm.permissions?.outstockHandling?.role === 'procurement_manager';

      // فحص هل تم تفعيل أي دور أو شاشات لضمان تفعيل مفتاح الحساب الموحد تلقائياً
      const hasAnyRoleEnabled = Boolean(
        empAccessForm.permissions?.topManagement?.enabled ||
        empAccessForm.permissions?.branchManager?.enabled ||
        empAccessForm.permissions?.outstockHandling?.enabled ||
        empAccessForm.permissions?.accountsSystem?.enabled ||
        (empAccessForm.permissions?.hrPersonalPortal?.enabled !== false)
      );

      // تطبيع وتوحيد أسماء وحدات الإدارة العليا بصيغة القياسية (hyphen-based)
      let topMgmtAllowed = empAccessForm.permissions?.topManagement?.allowedModules || ['dashboard'];
      if (!Array.isArray(topMgmtAllowed) || topMgmtAllowed.length === 0) {
        topMgmtAllowed = ['dashboard'];
      }
      topMgmtAllowed = Array.from(new Set(topMgmtAllowed.map(m => String(m).trim().replace(/_/g, '-'))));

      const cleanForm = {
        ...empAccessForm,
        isEnabled: empAccessForm.isEnabled !== undefined ? (empAccessForm.isEnabled || hasAnyRoleEnabled) : hasAnyRoleEnabled,
        permissions: {
          ...empAccessForm.permissions,
          branchManager: {
            ...empAccessForm.permissions?.branchManager
          },
          topManagement: {
            ...empAccessForm.permissions?.topManagement,
            allowedModules: topMgmtAllowed,
            canModifyOrExemptPenalties: Boolean(empAccessForm.permissions?.topManagement?.canModifyOrExemptPenalties)
          },
          outstockHandling: {
            ...empAccessForm.permissions?.outstockHandling,
            ...(isProcMgr ? {
              assignedBranchId: 'all',
              allBranchesAccess: true,
              assignedBranchIds: (branches || []).map(b => b.id)
            } : {})
          }
        }
      };
      const updatedMap = {
        ...employeeUnifiedAccess,
        [String(editingEmp.id)]: {
          ...cleanForm,
          employeeId: String(editingEmp.id),
          employeeCode: String(editingEmp.code || ''),
          updatedAt: nowIso
        }
      };

      const updatedOrg = {
        ...orgSettings,
        employeeUnifiedAccess: updatedMap,
        updatedAt: nowIso
      };

      // تحديث فوري لكائن الموظف داخل قائمة الموظفين لضمان الاستجابة اللحظية في كافة الشاشات
      const updatedEmployees = (state?.employees || []).map(e => {
        if (String(e.id) === String(editingEmp.id) || (editingEmp.code && String(e.code) === String(editingEmp.code))) {
          return {
            ...e,
            unifiedAccess: {
              ...cleanForm,
              employeeId: String(editingEmp.id),
              employeeCode: String(editingEmp.code || ''),
              updatedAt: nowIso
            }
          };
        }
        return e;
      });

      const updatedState = {
        ...state,
        employees: updatedEmployees,
        orgSettings: updatedOrg
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      // مزامنة السيرفر عبر API مخصص
      fetch('/api/auth/permissions/save-employee-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: editingEmp.id,
          accessConfig: updatedMap[String(editingEmp.id)]
        })
      }).catch(() => {});

      showToast?.(`✅ تم تحديث وحفظ صلاحيات الموظف (${editingEmp.name}) بنجاح`);
      setEditingEmp(null);
      setEmpAccessForm(null);
    } catch (err) {
      console.error(err);
      showToast?.('❌ حدث خطأ أثناء حفظ الصلاحيات');
    } finally {
      setIsSavingEmp(false);
    }
  };

  // ── إلغاء الصلاحيات المخصصة للموظف وإعادته للوضع الطبيعي ──
  const handleResetEmpPermissions = async () => {
    if (!editingEmp) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء كافة الصلاحيات المخصصة للموظف (${editingEmp.name}) وإعادته كحساب موظف عادي؟`)) {
      return;
    }
    setIsSavingEmp(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedMap = { ...employeeUnifiedAccess };
      delete updatedMap[String(editingEmp.id)];
      if (editingEmp.code) delete updatedMap[String(editingEmp.code)];

      const updatedOrg = {
        ...orgSettings,
        employeeUnifiedAccess: updatedMap,
        updatedAt: nowIso
      };

      const updatedState = { ...state, orgSettings: updatedOrg };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.(`🔄 تم إلغاء الصلاحيات المخصصة للموظف (${editingEmp.name}) بنجاح`);
      setEditingEmp(null);
      setEmpAccessForm(null);
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء الإلغاء');
    } finally {
      setIsSavingEmp(false);
    }
  };

  // ── حفظ وتعميم هوية النظام ──
  const handleSaveBrandIdentity = async (e) => {
    e?.preventDefault?.();
    setIsSavingBrand(true);
    try {
      const nowIso = new Date().toISOString();
      const updatedOrg = {
        ...orgSettings,
        orgName: brandForm.systemName,
        generalManagerName: brandForm.generalManagerName,
        logoUrl: brandForm.logoUrl,
        brandIdentity: {
          ...brandForm,
          updatedAt: nowIso
        },
        updatedAt: nowIso
      };

      const updatedState = {
        ...state,
        orgSettings: updatedOrg
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      // تطبيق فوري على الـ DOM
      applyBrandIdentityToDOM(brandForm);

      // مزامنة السيرفر
      fetch('/api/system/brand-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandForm)
      }).catch(() => {});

      showToast?.('👑 تم حفظ وتعميم هوية النظام على كافة المنظومات والشاشات بنجاح!');
    } catch (err) {
      console.error(err);
      showToast?.('❌ حدث خطأ أثناء حفظ الهوية');
    } finally {
      setIsSavingBrand(false);
    }
  };

  // ── إدارة المالكين ──
  const handleSaveOwner = async (e) => {
    e?.preventDefault?.();
    const cleanU = String(ownerForm.username || '').trim().toLowerCase();
    const cleanP = String(ownerForm.password || '').trim();

    const existingOwner = editingOwnerId
      ? systemOwners.find(o => o.id === editingOwnerId || String(o.username || '').toLowerCase() === cleanU)
      : null;
    const finalPassword = cleanP || existingOwner?.password || '';

    if (!cleanU || !finalPassword) {
      showToast?.('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    setIsSavingOwner(true);
    try {
      const nowIso = new Date().toISOString();
      let updatedOwners = [...systemOwners];
      let isEditingPrimary = false;

      if (editingOwnerId) {
        // تعديل مالك قائم
        updatedOwners = updatedOwners.map(o => {
          if (o.id === editingOwnerId || o.username === cleanU) {
            const isPri = Boolean(o.isPrimaryOwner || o.username === 'saif');
            if (isPri) isEditingPrimary = true;
            return {
              ...o,
              username: cleanU,
              password: finalPassword,
              fullName: ownerForm.fullName || cleanU,
              phone: ownerForm.phone || '',
              isPrimaryOwner: isPri,
              updatedAt: nowIso
            };
          }
          return o;
        });
      } else {
        // فحص التكرار
        if (updatedOwners.some(o => String(o.username || '').toLowerCase() === cleanU)) {
          showToast?.('⚠️ اسم المستخدم مسجل لمالك آخر بالفعل');
          setIsSavingOwner(false);
          return;
        }
        updatedOwners.push({
          id: `owner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          username: cleanU,
          password: finalPassword,
          fullName: ownerForm.fullName || cleanU,
          phone: ownerForm.phone || '',
          isActive: true,
          isPrimaryOwner: false,
          createdAt: nowIso
        });
      }

      const updatedOrg = {
        ...orgSettings,
        systemOwners: updatedOwners,
        ...(isEditingPrimary ? {
          ownerUsername: cleanU,
          ownerPassword: finalPassword,
          ownerFullName: ownerForm.fullName || cleanU,
          ownerPhone: ownerForm.phone || ''
        } : {}),
        updatedAt: nowIso
      };

      const updatedState = {
        ...state,
        orgSettings: updatedOrg,
        _allowOwnerPasswordChange: true,
        _ownerAuthorized: true
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      // حفظ مباشر في جدول السلايسات بقاعدة البيانات
      try {
        await apiSaveSettingsSlice('orgSettings', updatedOrg);
      } catch (sliceErr) {
        console.warn('[OwnerManagement] Slice save warning:', sliceErr);
      }

      // مزامنة السيرفر
      fetch('/api/auth/owners/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingOwnerId ? 'update' : 'add',
          ownerData: {
            id: editingOwnerId,
            username: cleanU,
            password: finalPassword,
            fullName: ownerForm.fullName,
            phone: ownerForm.phone
          }
        })
      }).catch(err => console.warn('[OwnerManagement] Sync warn:', err));

      showToast?.(`✅ تم ${editingOwnerId ? 'تعديل بيانات' : 'إضافة'} المالك بنجاح`);
      setShowOwnerModal(false);
      setEditingOwnerId(null);
      setOwnerForm({ username: '', password: '', fullName: '', phone: '' });
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء حفظ بيانات المالك');
    } finally {
      setIsSavingOwner(false);
    }
  };

  const handleDeleteOwner = async (owner) => {
    if (owner.username === 'saif' || owner.isPrimaryOwner) {
      showToast?.('⛔ لا يمكن حذف المالك الأساسي saif');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف حساب المالك (${owner.fullName || owner.username})؟`)) {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const updatedOwners = systemOwners.filter(o => o.id !== owner.id && o.username !== owner.username);

      const updatedOrg = { ...orgSettings, systemOwners: updatedOwners, updatedAt: nowIso };
      const updatedState = { ...state, orgSettings: updatedOrg };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      fetch('/api/auth/owners/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ownerId: owner.id })
      }).catch(() => {});

      showToast?.('🗑️ تم حذف حساب المالك بنجاح');
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء الحذف');
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // إدارة محطات نقاط البيع وصلاحيات الفروع (POS Terminals & Branch Permissions)
  // ══════════════════════════════════════════════════════════════════════
  const posTerminals = useMemo(() => {
    return Array.isArray(orgSettings?.posTerminals) ? orgSettings.posTerminals : [];
  }, [orgSettings?.posTerminals]);

  const [selectedTerminalBranch, setSelectedTerminalBranch] = useState('all');
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [editingTerminalId, setEditingTerminalId] = useState(null);
  const [isSavingTerminal, setIsSavingTerminal] = useState(false);

  const initialTerminalForm = {
    terminalCode: '',
    name: '',
    branchId: branches[0]?.id || 'branch-1',
    username: '',
    password: '',
    defaultCashierCode: '',
    isActive: true,
    permissions: {
      canDiscount: true,
      maxDiscountPct: 10,
      canPriceOverride: false,
      canVoidItem: true,
      canVoidInvoice: false,
      canOpenDrawerNoSale: false,
      canRefundVerified: true,
      canRefundBlind: false,
      canViewCosts: false,
      canViewReports: true,
      canCloseShift: true,
      canDeadStockExchange: true,
      canOcrInvoices: true,
      canHoldBill: true,
      canDeliverySettlement: true
    }
  };
  const [terminalForm, setTerminalForm] = useState(initialTerminalForm);

  const handleSaveTerminal = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!terminalForm.terminalCode.trim()) {
      showToast?.('⚠️ يرجى إدخال كود المحطة (مثال: POS-01)');
      return;
    }
    if (!terminalForm.username.trim() || !terminalForm.password.trim()) {
      showToast?.('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور لمحطة نقطة البيع');
      return;
    }
    setIsSavingTerminal(true);
    try {
      const nowIso = new Date().toISOString();
      const cleanTermCode = terminalForm.terminalCode.trim().toUpperCase();
      const cleanU = terminalForm.username.trim().toLowerCase();
      const cleanP = terminalForm.password.trim();

      const existingIndex = posTerminals.findIndex(t => t.id === editingTerminalId);
      const newOrUpdatedTerm = {
        id: editingTerminalId || `term_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        terminalCode: cleanTermCode,
        name: terminalForm.name.trim() || `محطة (${cleanTermCode})`,
        branchId: terminalForm.branchId,
        username: cleanU,
        password: cleanP,
        defaultCashierCode: terminalForm.defaultCashierCode || '',
        isActive: Boolean(terminalForm.isActive),
        permissions: { ...terminalForm.permissions },
        updatedAt: nowIso,
        createdAt: existingIndex >= 0 ? (posTerminals[existingIndex].createdAt || nowIso) : nowIso
      };

      let updatedList = [...posTerminals];
      if (existingIndex >= 0) {
        updatedList[existingIndex] = newOrUpdatedTerm;
      } else {
        updatedList.push(newOrUpdatedTerm);
      }

      const updatedOrg = {
        ...orgSettings,
        posTerminals: updatedList,
        updatedAt: nowIso
      };

      const updatedState = {
        ...state,
        orgSettings: updatedOrg
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      try {
        await apiSaveSettingsSlice('orgSettings', updatedOrg);
      } catch (sliceErr) {
        console.warn('[PosTerminalManagement] Slice save warning:', sliceErr);
      }

      showToast?.(`✅ تم ${editingTerminalId ? 'تعديل بيانات' : 'إضافة'} محطة نقطة البيع وتحديث صلاحيات الفرع بنجاح`);
      setShowTerminalModal(false);
      setEditingTerminalId(null);
      setTerminalForm(initialTerminalForm);
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء حفظ محطة نقطة البيع');
    } finally {
      setIsSavingTerminal(false);
    }
  };

  const handleDeleteTerminal = async (term) => {
    if (!window.confirm(`هل أنت متأكد من حذف محطة نقطة البيع (${term.name || term.terminalCode})؟`)) {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const updatedList = posTerminals.filter(t => t.id !== term.id);
      const updatedOrg = {
        ...orgSettings,
        posTerminals: updatedList,
        updatedAt: nowIso
      };
      const updatedState = { ...state, orgSettings: updatedOrg };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      try {
        await apiSaveSettingsSlice('orgSettings', updatedOrg);
      } catch (sliceErr) {
        console.warn('[PosTerminalManagement] Slice save warning:', sliceErr);
      }
      showToast?.('🗑️ تم حذف محطة نقطة البيع بنجاح');
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء الحذف');
    }
  };

  const handleSeedDefaultTerminals = async () => {
    if (branches.length === 0) {
      showToast?.('⚠️ لا توجد فروع مسجلة لتوليد محطات لها.');
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      const updatedList = [...posTerminals];

      branches.forEach((b, idx) => {
        const hasTerm = updatedList.some(t => String(t.branchId) === String(b.id));
        if (!hasTerm) {
          const bSlug = (b.code || b.name || `branch${idx+1}`).toLowerCase().replace(/[^a-z0-9]/g, '_');
          updatedList.push({
            id: `term_branch_${b.id}`,
            terminalCode: `POS-${b.code || (idx + 1).toString().padStart(2, '0')}`,
            name: `نقطة بيع كاشير 1 (${b.name || 'الفرع'})`,
            branchId: b.id,
            username: `pos_${bSlug}`,
            password: '123',
            defaultCashierCode: '',
            isActive: true,
            permissions: {
              canDiscount: true,
              maxDiscountPct: 10,
              canPriceOverride: false,
              canVoidItem: true,
              canVoidInvoice: false,
              canOpenDrawerNoSale: false,
              canRefundVerified: true,
              canRefundBlind: false,
              canViewCosts: false,
              canViewReports: true,
              canCloseShift: true,
              canDeadStockExchange: true,
              canOcrInvoices: true,
              canHoldBill: true,
              canDeliverySettlement: true
            },
            createdAt: nowIso,
            updatedAt: nowIso
          });
        }
      });

      const updatedOrg = {
        ...orgSettings,
        posTerminals: updatedList,
        updatedAt: nowIso
      };
      const updatedState = { ...state, orgSettings: updatedOrg };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      try {
        await apiSaveSettingsSlice('orgSettings', updatedOrg);
      } catch (sliceErr) {
        console.warn('[PosTerminalManagement] Slice save warning:', sliceErr);
      }
      showToast?.(`✅ تم تهيئة وتوليد محطات نقاط البيع لجميع الفروع بنجاح`);
    } catch (err) {
      showToast?.('❌ حدث خطأ أثناء تهيئة المحطات الافتراضية');
    }
  };

  // قائمة وحدات وتراخيص الإدارة العليا المتوافقة كلياً مع كافة شاشات وأقسام النظام
  const topMgmtModules = TOP_MGMT_MODULES;

  return (
    <div className="owner-access-identity-wrapper" style={{ padding: '16px 22px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Cairo, sans-serif' }}>
      {/* ── ترويسة الصفحة بهوية المالك الفاخرة ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(2, 132, 199, 0.08) 100%)',
        border: '1px solid rgba(13, 148, 136, 0.2)',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: '0 6px 16px rgba(245, 158, 11, 0.35)'
          }}>
            👑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: 'var(--text, #0f172a)' }}>
                بوابة المالك: صلاحيات الموظفين وهوية النظام
              </h1>
              <span style={{
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fde68a',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                سلطة سيادية كاملة
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted, #64748b)' }}>
              إدارة الهوية المركزية لجميع المنظومات وتعيين الصلاحيات الموحدة للموظفين وتعيين المالكين
            </p>
          </div>
        </div>

        {/* أزرار الإجراءات السيادية والتبويبات */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('app:open-owner-launchpad'))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #f59e0b',
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                color: '#92400e',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
                transition: 'all 0.15s ease'
              }}
              title="فتح بوابة قيادة المالك لاختيار منظومة أخرى"
            >
              <span>🔀</span>
              <span>تبديل المنظومة (بوابة المالك)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onNavigateTab) {
                  onNavigateTab('dashboard');
                } else {
                  window.dispatchEvent(new CustomEvent('app:navigate-tab', { detail: 'dashboard' }));
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border, #cbd5e1)',
                background: 'var(--surface, #ffffff)',
                color: 'var(--text, #334155)',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
              title="الانتقال إلى منظومة الموارد البشرية (HR)"
            >
              <span>🏢</span>
              <span>الدخول لمنظومة HR</span>
            </button>
          </div>

          {/* أزرار التبويبات الثلاثة الرئيسية */}
          <div style={{
            display: 'flex',
            background: 'var(--surface, #ffffff)',
            padding: '4px',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            gap: '4px'
          }}>
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'employees' ? 'var(--primary, #0d9488)' : 'transparent',
              color: activeTab === 'employees' ? '#ffffff' : 'var(--text, #334155)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>👥</span>
            <span>صلاحيات الموظفين ({employees.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('brand')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'brand' ? 'var(--primary, #0d9488)' : 'transparent',
              color: activeTab === 'brand' ? '#ffffff' : 'var(--text, #334155)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🎨</span>
            <span>هوية النظام المركزية</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('owners')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'owners' ? 'var(--primary, #0d9488)' : 'transparent',
              color: activeTab === 'owners' ? '#ffffff' : 'var(--text, #334155)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>👑</span>
            <span>إدارة المالكين ({systemOwners.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pos-terminals')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'pos-terminals' ? 'var(--primary, #0d9488)' : 'transparent',
              color: activeTab === 'pos-terminals' ? '#ffffff' : 'var(--text, #334155)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🖥️</span>
            <span>محطات نقاط البيع وصلاحيات الفروع ({posTerminals.length})</span>
          </button>
        </div>
      </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          التبويب الأول: صلاحيات موظفي النظام (Employee Permissions & Access)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'employees' && (
        <div>
          {/* كروت الإحصاءات السريعة */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <div style={{ background: 'var(--surface, #ffffff)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(13,148,136,0.1)', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👥</div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', fontWeight: 600 }}>إجمالي الموظفين</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text, #0f172a)' }}>{stats.total}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface, #ffffff)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59,130,246,0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🔐</div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', fontWeight: 600 }}>صلاحيات موحدة مخصصة</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#2563eb' }}>{stats.configuredCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface, #ffffff)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(168,85,247,0.1)', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏢</div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', fontWeight: 600 }}>مدراء فروع معتمدون</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#9333ea' }}>{stats.branchMgrCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface, #ffffff)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(234,88,12,0.1)', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>💊</div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', fontWeight: 600 }}>نواقص ومشتريات OutStock</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#ea580c' }}>{stats.outstockCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface, #ffffff)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏛️</div>
              <div>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', fontWeight: 600 }}>منظومة الحسابات ERP</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#059669' }}>{stats.accountsCount}</div>
              </div>
            </div>
          </div>

          {/* شريط الفلاتر والبحث */}
          <div style={{
            background: 'var(--surface, #ffffff)',
            padding: '12px 18px',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)',
            marginBottom: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
              <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>🔍</span>
              <input
                type="text"
                placeholder="ابحث بالاسم، الكود، أو المسمى الوظيفي..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #cbd5e1)',
                  fontSize: '13px',
                  fontFamily: 'Cairo',
                  background: 'var(--surface)'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>الفرع:</span>
              <select
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'Cairo' }}
              >
                <option value="all">كافة الفروع ({branches.length})</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>حالة الصلاحية:</span>
              <select
                value={filterPermissionStatus}
                onChange={(e) => setFilterPermissionStatus(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', fontFamily: 'Cairo' }}
              >
                <option value="all">الكل ({employees.length})</option>
                <option value="custom">مخصص من المالك فقط ({stats.configuredCount})</option>
                <option value="standard">موظفون عاديون ({stats.total - stats.configuredCount})</option>
              </select>
            </div>
          </div>

          {/* جدول الموظفين الفاخر */}
          <div style={{ background: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e2e8f0)', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-muted, #475569)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 800 }}>الموظف</th>
                    <th style={{ padding: '12px 16px', fontWeight: 800 }}>الكود</th>
                    <th style={{ padding: '12px 16px', fontWeight: 800 }}>المسمى الوظيفي</th>
                    <th style={{ padding: '12px 16px', fontWeight: 800 }}>الفرع المسجل</th>
                    <th style={{ padding: '12px 16px', fontWeight: 800 }}>الصلاحيات المعتمدة الحالية</th>
                    <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                        لا توجد نتائج مطابقة لبحثك
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const u = employeeUnifiedAccess[emp.id] || employeeUnifiedAccess[emp.code] || null;
                      const hasCustom = u && u.isEnabled;
                      const branch = branches.find(b => String(b.id) === String(emp.branchId));

                      return (
                        <tr
                          key={emp.id}
                          style={{
                            borderBottom: '1px solid var(--border, #f1f5f9)',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover, #f8fafc)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: hasCustom ? 'rgba(13,148,136,0.15)' : 'var(--surface-muted, #e2e8f0)',
                                color: hasCustom ? 'var(--primary, #0d9488)' : 'var(--text, #334155)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '13px'
                              }}>
                                {emp.name?.slice(0, 1) || '👤'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: 'var(--text, #0f172a)' }}>{emp.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>{emp.phone || 'بدون هاتف'}</div>
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary, #0d9488)' }}>
                            {emp.code || '—'}
                          </td>

                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                            {emp.jobTitle || 'موظف'}
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              background: 'var(--surface-muted, #f1f5f9)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 700
                            }}>
                              {branch?.name || 'المركز الرئيسي'}
                            </span>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            {!hasCustom ? (
                              <span style={{ fontSize: '11.5px', color: 'var(--muted, #94a3b8)', fontWeight: 600 }}>
                                موظف عادي (بوابته الشخصية فقط)
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {u.permissions?.hrPersonalPortal?.enabled && (
                                  <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    👤 بوابته بالـ HR
                                  </span>
                                )}
                                {u.permissions?.branchManager?.enabled && (
                                  <span style={{ background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    🏢 مدير فرع: {(branches.find(b => String(b.id) === String(u.permissions?.branchManager?.assignedBranchId))?.name) || 'فرع'}
                                  </span>
                                )}
                                {u.permissions?.topManagement?.enabled && (
                                  <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    🛡️ إدارة عليا ({u.permissions?.topManagement?.allowedModules?.length || 0} شاشات)
                                  </span>
                                )}
                                {u.permissions?.topManagement?.canModifyOrExemptPenalties && (
                                  <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    ⚖️ استثناء وتعديل الجزاءات
                                  </span>
                                )}
                                {u.permissions?.outstockHandling?.enabled && (
                                  <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    💊 OutStock ({u.permissions?.outstockHandling?.role === 'procurement_manager' ? 'مدير مشتريات (كافة الفروع 🌐)' : u.permissions?.outstockHandling?.role === 'cosmetics_officer' ? (u.permissions?.outstockHandling?.assignedBranchId === 'ALL' || !u.permissions?.outstockHandling?.assignedBranchId ? 'مسؤول تجميل (كافة الفروع 🌐)' : `مسؤول تجميل: ${(branches.find(b => String(b.id) === String(u.permissions?.outstockHandling?.assignedBranchId))?.name) || 'فرع'}`) : u.permissions?.outstockHandling?.role === 'procurement_team' ? 'فريق مشتريات عام 🤝' : `صيدلية: ${(branches.find(b => String(b.id) === String(u.permissions?.outstockHandling?.assignedBranchId))?.name) || 'فرع'}`})
                                  </span>
                                )}
                                {u.permissions?.accountsSystem?.enabled && (
                                  <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800 }}>
                                    🏛️ الحسابات ERP
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEmpPermissions(emp)}
                              style={{
                                background: hasCustom ? 'var(--primary-light, rgba(13,148,136,0.1))' : 'var(--surface-muted, #f1f5f9)',
                                color: hasCustom ? 'var(--primary, #0d9488)' : 'var(--text, #334155)',
                                border: hasCustom ? '1px solid var(--primary, #0d9488)' : '1px solid var(--border, #cbd5e1)',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                              }}
                            >
                              <span>⚙️</span>
                              <span>{hasCustom ? 'تعديل الصلاحيات' : 'منح صلاحيات موحدة'}</span>
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

      {/* ══════════════════════════════════════════════════════════════════════
          التبويب الثاني: هوية النظام المركزية (Central Brand & Identity)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'brand' && (
        <div style={{ maxWidth: '840px', margin: '0 auto', background: 'var(--surface, #ffffff)', padding: '28px', borderRadius: '16px', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: '14px' }}>
            <span style={{ fontSize: '28px' }}>🎨</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>
                تثبيت وتعميم هوية النظام على كافة الأنظمة الداخلية
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                يتم تثبيت هذا الشعار والاسم والألوان آلياً وفورياً على: نظام HR، نظام النواقص OutStock، نظام الحسابات ERP، كشك البصمة، وتطبيق الهاتف
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveBrandIdentity}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                  اسم المؤسسة / المنظومة الرسمي:
                </label>
                <input
                  type="text"
                  required
                  value={brandForm.systemName}
                  onChange={(e) => setBrandForm(prev => ({ ...prev, systemName: e.target.value }))}
                  placeholder="مثال: صيدليات الشفاء الحديثة"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'Cairo' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                  اسم المدير العام / المالك المشرف:
                </label>
                <input
                  type="text"
                  value={brandForm.generalManagerName}
                  onChange={(e) => setBrandForm(prev => ({ ...prev, generalManagerName: e.target.value }))}
                  placeholder="مثال: د. سيف خالد"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'Cairo' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                رابط شعار المنظومة (Logo URL):
              </label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={brandForm.logoUrl}
                  onChange={(e) => setBrandForm(prev => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="ضع رابط صورة الشعار هنا (أو اتركه فارغاً للشعار الافتراضي)"
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
                {brandForm.logoUrl && (
                  <div style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', padding: '2px', background: '#fff' }}>
                    <img src={brandForm.logoUrl} alt="معاينة الشعار" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            </div>

            {/* الألوان والسمة */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                  اللون الأساسي للنظام (Primary Accent):
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={brandForm.primaryColor}
                    onChange={(e) => setBrandForm(prev => ({ ...prev, primaryColor: e.target.value }))}
                    style={{ width: '44px', height: '40px', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={brandForm.primaryColor}
                    onChange={(e) => setBrandForm(prev => ({ ...prev, primaryColor: e.target.value }))}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                  اللون الثانوي للنظام (Secondary Accent):
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={brandForm.secondaryColor}
                    onChange={(e) => setBrandForm(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    style={{ width: '44px', height: '40px', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={brandForm.secondaryColor}
                    onChange={(e) => setBrandForm(prev => ({ ...prev, secondaryColor: e.target.value }))}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                رسالة الترحيب الرسمية في شاشات تسجيل الدخول:
              </label>
              <input
                type="text"
                value={brandForm.welcomeMessage}
                onChange={(e) => setBrandForm(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                placeholder="مثال: أهلاً بكم في البوابة الموحدة لمنظومة الرعاية الصحية"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
              />
            </div>

            {/* معاينة حية سريعة للهوية */}
            <div style={{
              background: `linear-gradient(135deg, ${brandForm.primaryColor} 0%, ${brandForm.secondaryColor} 100%)`,
              padding: '16px 20px',
              borderRadius: '12px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {brandForm.logoUrl ? (
                  <img src={brandForm.logoUrl} alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fff', objectFit: 'contain', padding: '2px' }} />
                ) : (
                  <span style={{ fontSize: '28px' }}>🏥</span>
                )}
                <div>
                  <div style={{ fontWeight: 900, fontSize: '15px' }}>{brandForm.systemName}</div>
                  <div style={{ fontSize: '11px', opacity: 0.9 }}>بإشراف: {brandForm.generalManagerName || 'المالك'}</div>
                </div>
              </div>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                معاينة الهوية الموحدة
              </span>
            </div>

            <button
              type="submit"
              disabled={isSavingBrand}
              style={{
                width: '100%',
                background: 'var(--primary, #0d9488)',
                color: '#ffffff',
                border: 'none',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 16px rgba(13,148,136,0.3)'
              }}
            >
              <span>💾</span>
              <span>{isSavingBrand ? 'جاري تثبيت وتعميم الهوية...' : 'حفظ وتثبيت الهوية على جميع الأنظمة فوراً'}</span>
            </button>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          التبويب الثالث: إدارة المالكين المتعددين (Multi-Owner Accounts)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'owners' && (
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--text)' }}>
                قائمة مالكي المنظومة المعتمدين (Multi-Owner Governance)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                يمكنك تعيين أكثر من مالك بصلاحيات سيادية كاملة على كافة الأنظمة
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingOwnerId(null);
                setOwnerForm({ username: '', password: '', fullName: '', phone: '' });
                setShowOwnerModal(true);
              }}
              style={{
                background: 'var(--primary, #0d9488)',
                color: '#fff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>➕</span>
              <span>إضافة مالك جديد</span>
            </button>
          </div>

          <div style={{ background: 'var(--surface, #ffffff)', borderRadius: '14px', border: '1px solid var(--border, #e2e8f0)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>المالك</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>اسم المستخدم (Username)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>الهاتف</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800 }}>الصفة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {systemOwners.map((owner) => {
                  const isSaif = owner.username === 'saif';

                  return (
                    <tr key={owner.id || owner.username} style={{ borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px' }}>{isSaif ? '👑' : '👤'}</span>
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                              {owner.fullName || owner.username}
                              {isSaif && <span style={{ marginRight: '6px', color: '#b45309', fontSize: '11px', fontWeight: 800 }}>(الأساسي)</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              {isSaif ? 'المالك المعتمد للنظام' : 'مالك معتمد'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 800, color: '#0f766e' }}>
                        {owner.username}
                      </td>

                      <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                        {owner.phone || '—'}
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: isSaif ? '#fef3c7' : '#ecfdf5',
                          color: isSaif ? '#92400e' : '#047857',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800
                        }}>
                          {isSaif ? '👑 مالك رئيسي محمي' : 'مالك مشارك'}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOwnerId(owner.id);
                              setOwnerForm({
                                username: owner.username,
                                password: owner.password || '',
                                fullName: owner.fullName || '',
                                phone: owner.phone || ''
                              });
                              setShowOwnerModal(true);
                            }}
                            style={{
                              background: 'var(--surface-muted)',
                              border: '1px solid var(--border)',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            ✏️ تعديل
                          </button>

                          {!isSaif && !owner.isPrimaryOwner && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOwner(owner)}
                              style={{
                                background: '#fee2e2',
                                color: '#dc2626',
                                border: '1px solid #fca5a5',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              🗑️ حذف
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          التبويب الرابع: محطات نقاط البيع وتراخيص الفروع (POS Terminals Governance)
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pos-terminals' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* شريط الإجراءات والترويسة */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>
                🖥️ محطات نقاط البيع وتراخيص الفروع المستقلة (POS Terminals & Branch Governance)
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                إنشاء محطات نقاط بيع مستقلة لكل فرع بيوزر وباسورد مخصص مع ضبط 14+ صلاحية رقابية دقيقة لكل محطة
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSeedDefaultTerminals}
                style={{
                  background: 'rgba(13, 148, 136, 0.1)',
                  color: 'var(--primary, #0d9488)',
                  border: '1.5px solid var(--primary, #0d9488)',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>⚡</span>
                <span>تهيئة محطات افتراضية لجميع الفروع</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTerminalId(null);
                  setTerminalForm({
                    ...initialTerminalForm,
                    branchId: branches[0]?.id || 'branch-1',
                    terminalCode: `POS-${(posTerminals.length + 1).toString().padStart(2, '0')}`
                  });
                  setShowTerminalModal(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, #0d9488 0%, #059669 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
                }}
              >
                <span>➕</span>
                <span>إضافة نقطة بيع جديدة لفرع</span>
              </button>
            </div>
          </div>

          {/* فلتر الفرع */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
            background: 'var(--surface, #ffffff)',
            padding: '10px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border, #e2e8f0)'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--muted)' }}>تصفية حسب الفرع:</span>
            <select
              value={selectedTerminalBranch}
              onChange={(e) => setSelectedTerminalBranch(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                fontSize: '12.5px',
                fontWeight: 700,
                background: 'var(--surface-hover, #f8fafc)'
              }}
            >
              <option value="all">كافة الفروع ({posTerminals.length} محطة)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({posTerminals.filter(t => String(t.branchId) === String(b.id)).length} محطة)
                </option>
              ))}
            </select>
          </div>

          {/* قائمة المحطات */}
          {posTerminals.length === 0 ? (
            <div style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: '16px',
              padding: '40px',
              textAlign: 'center',
              border: '1.5px dashed var(--border, #cbd5e1)'
            }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🖥️</div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px' }}>لا توجد محطات نقاط بيع مسجلة حالياً</h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px' }}>
                يمكنك الضغط على زر "تهيئة محطات افتراضية لجميع الفروع" لإنشاء محطة كاشير مخصصة لكل فرع تلقائياً
              </p>
              <button
                type="button"
                onClick={handleSeedDefaultTerminals}
                style={{
                  background: 'var(--primary, #0d9488)',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                ⚡ تهيئة المحطات الآن
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {posTerminals
                .filter(t => selectedTerminalBranch === 'all' || String(t.branchId) === String(selectedTerminalBranch))
                .map(term => {
                  const branchObj = branches.find(b => String(b.id) === String(term.branchId));
                  const perms = term.permissions || {};
                  const activePermsCount = Object.values(perms).filter(Boolean).length;

                  return (
                    <div
                      key={term.id}
                      style={{
                        background: 'var(--surface, #ffffff)',
                        borderRadius: '16px',
                        border: term.isActive ? '1.5px solid var(--border, #cbd5e1)' : '1.5px solid #fee2e2',
                        padding: '18px',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        position: 'relative'
                      }}
                    >
                      {/* رأس كارت المحطة */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontFamily: 'monospace',
                              fontWeight: 900,
                              fontSize: '14px',
                              background: 'rgba(13, 148, 136, 0.1)',
                              color: 'var(--primary, #0d9488)',
                              padding: '2px 8px',
                              borderRadius: '6px'
                            }}>
                              {term.terminalCode}
                            </span>
                            <span style={{ fontWeight: 900, fontSize: '15px', color: 'var(--text)' }}>
                              {term.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                            📍 الفرع: <strong style={{ color: 'var(--text)' }}>{branchObj?.name || 'الفرع'}</strong>
                          </div>
                        </div>

                        <span style={{
                          padding: '3px 10px',
                          borderRadius: '99px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: term.isActive ? '#ecfdf5' : '#fee2e2',
                          color: term.isActive ? '#047857' : '#b91c1c'
                        }}>
                          {term.isActive ? '● نشطة' : '○ معطلة'}
                        </span>
                      </div>

                      {/* بيانات تسجيل الدخول الخاصة بالمحطة */}
                      <div style={{
                        background: 'var(--surface-hover, #f8fafc)',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border, #e2e8f0)',
                        fontSize: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--muted)' }}>يوزر الدخول:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary, #0d9488)' }}>
                            {term.username}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--muted)' }}>كلمة المرور:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                            {term.password}
                          </span>
                        </div>
                      </div>

                      {/* ملخص الصلاحيات الممنوحة للمحطة */}
                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', marginBottom: '6px' }}>
                          الصلاحيات المفعلة ({activePermsCount} من 15):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {perms.canDiscount && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#e0f2fe', color: '#0369a1', borderRadius: '4px', fontWeight: 700 }}>
                              خصومات ({perms.maxDiscountPct || 10}%)
                            </span>
                          )}
                          {perms.canPriceOverride && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#fef3c7', color: '#b45309', borderRadius: '4px', fontWeight: 700 }}>
                              تعديل السعر
                            </span>
                          )}
                          {perms.canVoidItem && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#f3e8ff', color: '#7e22ce', borderRadius: '4px', fontWeight: 700 }}>
                              حذف بند
                            </span>
                          )}
                          {perms.canVoidInvoice && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontWeight: 700 }}>
                              إلغاء فاتورة
                            </span>
                          )}
                          {perms.canOpenDrawerNoSale && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 700 }}>
                              فتح الدرج بدون بيع
                            </span>
                          )}
                          {perms.canRefundVerified && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#ecfdf5', color: '#047857', borderRadius: '4px', fontWeight: 700 }}>
                              مرتجع بفاتورة
                            </span>
                          )}
                          {perms.canRefundBlind && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', fontWeight: 700 }}>
                              مرتجع حر
                            </span>
                          )}
                          {perms.canViewCosts && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '4px', fontWeight: 700 }}>
                              رؤية التكلفة
                            </span>
                          )}
                          {perms.canViewReports && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#ccfbf1', color: '#0f766e', borderRadius: '4px', fontWeight: 700 }}>
                              مركز التقارير (X)
                            </span>
                          )}
                          {perms.canCloseShift && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#ede9fe', color: '#5b21b6', borderRadius: '4px', fontWeight: 700 }}>
                              إغلاق وردية (Z)
                            </span>
                          )}
                          {perms.canDeadStockExchange && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 700 }}>
                              تبادل الرواكد P2P
                            </span>
                          )}
                          {perms.canOcrInvoices && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#e0f2fe', color: '#0284c7', borderRadius: '4px', fontWeight: 700 }}>
                              قارئ الذكاء الاصطناعي
                            </span>
                          )}
                          {perms.canHoldBill && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontWeight: 700 }}>
                              تعليق الفواتير
                            </span>
                          )}
                          {perms.canDeliverySettlement && (
                            <span style={{ fontSize: '10.5px', padding: '2px 6px', background: '#ffedd5', color: '#c2410c', borderRadius: '4px', fontWeight: 700 }}>
                              تسوية الدليفري
                            </span>
                          )}
                        </div>
                      </div>

                      {/* أزرار الإجراءات */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border, #f1f5f9)' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTerminalId(term.id);
                            setTerminalForm({
                              terminalCode: term.terminalCode || '',
                              name: term.name || '',
                              branchId: term.branchId || branches[0]?.id || '',
                              username: term.username || '',
                              password: term.password || '',
                              defaultCashierCode: term.defaultCashierCode || '',
                              isActive: term.isActive !== false,
                              permissions: {
                                ...initialTerminalForm.permissions,
                                ...(term.permissions || {})
                              }
                            });
                            setShowTerminalModal(true);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: 'var(--surface-hover, #f8fafc)',
                            border: '1px solid var(--border, #cbd5e1)',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          ✏️ تعديل وضبط الصلاحيات
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTerminal(term)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة إضافة/تعديل محطة نقطة بيع وتراخيص الفرع (Terminal Modal)
         ══════════════════════════════════════════════════════════════════════ */}
      {showTerminalModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          direction: 'rtl'
        }}>
          <div style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            border: '1px solid var(--border, #cbd5e1)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* رأس النافذة */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--text)' }}>
                  {editingTerminalId ? '✏️ تعديل محطة نقطة البيع وضبط الصلاحيات' : '➕ إضافة محطة نقطة بيع جديدة للفرع'}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  تخصيص بيانات الدخول وصلاحيات الكاشير الحصرية
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setShowTerminalModal(false); setEditingTerminalId(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}
              >
                ✕
              </button>
            </div>

            {/* النموذج الأساسي */}
            <form onSubmit={handleSaveTerminal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>
                    الفرع التابع له المحطة:
                  </label>
                  <select
                    value={terminalForm.branchId}
                    onChange={(e) => setTerminalForm({ ...terminalForm, branchId: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>
                    كود المحطة (Terminal Code):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: POS-01 أو POS-DOKKI-1"
                    value={terminalForm.terminalCode}
                    onChange={(e) => setTerminalForm({ ...terminalForm, terminalCode: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>
                  اسم المحطة / الوصف:
                </label>
                <input
                  type="text"
                  placeholder="مثال: كاشير 1 - الصالة الرئيسية"
                  value={terminalForm.name}
                  onChange={(e) => setTerminalForm({ ...terminalForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>

              {/* بيانات الدخول المستقلة */}
              <div style={{ background: 'var(--surface-hover, #f8fafc)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border, #cbd5e1)' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 900, marginBottom: '8px', color: 'var(--primary, #0d9488)' }}>
                  🔐 بيانات الدخول المستقلة لنظام الكاشير (Central Login Credentials):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>
                      اسم المستخدم (Username):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: pos_dokki1"
                      value={terminalForm.username}
                      onChange={(e) => setTerminalForm({ ...terminalForm, username: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 800, marginBottom: '4px', display: 'block' }}>
                      كلمة المرور (Password):
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="كلمة مرور المحطة"
                      value={terminalForm.password}
                      onChange={(e) => setTerminalForm({ ...terminalForm, password: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>

              {/* حالة التفعيل */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="termActive"
                  checked={terminalForm.isActive}
                  onChange={(e) => setTerminalForm({ ...terminalForm, isActive: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="termActive" style={{ fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                  تفعيل هذه المحطة والسماح بتسجيل الدخول منها
                </label>
              </div>

              {/* الصلاحيات الرقابية التفصيلية (14+ Granular Permissions) */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 900, color: 'var(--text)' }}>
                  🛡️ الصلاحيات الرقابية الحصرية لنقطة البيع (14 صلاحية):
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {/* canDiscount & maxPct */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        id="canDisc"
                        checked={terminalForm.permissions?.canDiscount}
                        onChange={(e) => setTerminalForm({
                          ...terminalForm,
                          permissions: { ...terminalForm.permissions, canDiscount: e.target.checked }
                        })}
                      />
                      <label htmlFor="canDisc" style={{ fontSize: '12px', fontWeight: 800 }}>منح خصومات نقدية/نسبية</label>
                    </div>
                    {terminalForm.permissions?.canDiscount && (
                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>الحد الأقصى للخصم:</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={terminalForm.permissions?.maxDiscountPct || 10}
                          onChange={(e) => setTerminalForm({
                            ...terminalForm,
                            permissions: { ...terminalForm.permissions, maxDiscountPct: parseFloat(e.target.value) || 0 }
                          })}
                          style={{ width: '60px', padding: '3px 6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}
                        />
                        <span style={{ fontSize: '11px' }}>%</span>
                      </div>
                    )}
                  </div>

                  {/* canPriceOverride */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canPriceOver"
                      checked={terminalForm.permissions?.canPriceOverride}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canPriceOverride: e.target.checked }
                      })}
                    />
                    <label htmlFor="canPriceOver" style={{ fontSize: '12px', fontWeight: 800 }}>تعديل سعر البيع يدوياً</label>
                  </div>

                  {/* canVoidItem */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canVoidItm"
                      checked={terminalForm.permissions?.canVoidItem}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canVoidItem: e.target.checked }
                      })}
                    />
                    <label htmlFor="canVoidItm" style={{ fontSize: '12px', fontWeight: 800 }}>حذف بند من السلة (Line Void)</label>
                  </div>

                  {/* canVoidInvoice */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canVoidInv"
                      checked={terminalForm.permissions?.canVoidInvoice}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canVoidInvoice: e.target.checked }
                      })}
                    />
                    <label htmlFor="canVoidInv" style={{ fontSize: '12px', fontWeight: 800 }}>إلغاء الفاتورة بالكامل</label>
                  </div>

                  {/* canOpenDrawerNoSale */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canDrawer"
                      checked={terminalForm.permissions?.canOpenDrawerNoSale}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canOpenDrawerNoSale: e.target.checked }
                      })}
                    />
                    <label htmlFor="canDrawer" style={{ fontSize: '12px', fontWeight: 800 }}>فتح الدرج بدون بيع (No Sale)</label>
                  </div>

                  {/* canRefundVerified */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canRefVer"
                      checked={terminalForm.permissions?.canRefundVerified}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canRefundVerified: e.target.checked }
                      })}
                    />
                    <label htmlFor="canRefVer" style={{ fontSize: '12px', fontWeight: 800 }}>مرتجع مبيعات بأصل فاتورة</label>
                  </div>

                  {/* canRefundBlind */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canRefBlind"
                      checked={terminalForm.permissions?.canRefundBlind}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canRefundBlind: e.target.checked }
                      })}
                    />
                    <label htmlFor="canRefBlind" style={{ fontSize: '12px', fontWeight: 800 }}>مرتجع حر بدون أصل فاتورة</label>
                  </div>

                  {/* canViewCosts */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canCosts"
                      checked={terminalForm.permissions?.canViewCosts}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canViewCosts: e.target.checked }
                      })}
                    />
                    <label htmlFor="canCosts" style={{ fontSize: '12px', fontWeight: 800 }}>رؤية التكلفة وهوامش الربح</label>
                  </div>

                  {/* canViewReports */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canReps"
                      checked={terminalForm.permissions?.canViewReports}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canViewReports: e.target.checked }
                      })}
                    />
                    <label htmlFor="canReps" style={{ fontSize: '12px', fontWeight: 800 }}>مركز التقارير وطباعة تقرير X</label>
                  </div>

                  {/* canCloseShift */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canCloseSh"
                      checked={terminalForm.permissions?.canCloseShift}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canCloseShift: e.target.checked }
                      })}
                    />
                    <label htmlFor="canCloseSh" style={{ fontSize: '12px', fontWeight: 800 }}>إغلاق الوردية وتقرير Z الأعمى</label>
                  </div>

                  {/* canDeadStockExchange */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canDeadStock"
                      checked={terminalForm.permissions?.canDeadStockExchange}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canDeadStockExchange: e.target.checked }
                      })}
                    />
                    <label htmlFor="canDeadStock" style={{ fontSize: '12px', fontWeight: 800 }}>تبادل الرواكد مع الفروع P2P</label>
                  </div>

                  {/* canOcrInvoices */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canOcr"
                      checked={terminalForm.permissions?.canOcrInvoices}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canOcrInvoices: e.target.checked }
                      })}
                    />
                    <label htmlFor="canOcr" style={{ fontSize: '12px', fontWeight: 800 }}>قراءة الفواتير بالذكاء الاصطناعي</label>
                  </div>

                  {/* canHoldBill */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canHold"
                      checked={terminalForm.permissions?.canHoldBill}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canHoldBill: e.target.checked }
                      })}
                    />
                    <label htmlFor="canHold" style={{ fontSize: '12px', fontWeight: 800 }}>تعليق واسترجاع الفواتير</label>
                  </div>

                  {/* canDeliverySettlement */}
                  <div style={{ background: 'var(--surface-hover)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="checkbox"
                      id="canDeliv"
                      checked={terminalForm.permissions?.canDeliverySettlement}
                      onChange={(e) => setTerminalForm({
                        ...terminalForm,
                        permissions: { ...terminalForm.permissions, canDeliverySettlement: e.target.checked }
                      })}
                    />
                    <label htmlFor="canDeliv" style={{ fontSize: '12px', fontWeight: 800 }}>تسوية حسابات طياري الدليفري</label>
                  </div>
                </div>
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={isSavingTerminal}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'var(--primary, #0d9488)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  {isSavingTerminal ? 'جاري الحفظ...' : 'حفظ وتثبيت بيانات المحطة'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTerminalModal(false)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة ضبط صلاحيات الموظف التفصيلية (Granular Permission Modal)
         ══════════════════════════════════════════════════════════════════════ */}
      {editingEmp && empAccessForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '18px',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid var(--border, #cbd5e1)',
            padding: '24px'
          }}>
            {/* عنوان النافذة */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--text)' }}>
                  تخصيص صلاحيات الدخول الموحد: {editingEmp.name}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  كود الموظف: {editingEmp.code} · الوظيفة: {editingEmp.jobTitle || 'موظف'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setEditingEmp(null); setEmpAccessForm(null); }}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--muted)' }}
              >
                ✕
              </button>
            </div>

            {/* زر التفعيل الرئيسي */}
            <div style={{
              background: empAccessForm.isEnabled ? 'rgba(13,148,136,0.08)' : 'var(--surface-muted)',
              border: `1px solid ${empAccessForm.isEnabled ? 'var(--primary)' : 'var(--border)'}`,
              padding: '14px 16px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
                  تفعيل نظام الدخول الموحد المخصص لهذا الموظف
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  عند التفعيل، سيتم تطبيق مصفوفة الصلاحيات بالأسفل، وإخفاء أي صفحات أخرى غير مصرح بها.
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px' }}>
                <input
                  type="checkbox"
                  checked={empAccessForm.isEnabled}
                  onChange={(e) => setEmpAccessForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: empAccessForm.isEnabled ? 'var(--primary, #0d9488)' : '#cbd5e1',
                  borderRadius: '34px',
                  transition: '0.2s'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '20px',
                    width: '20px',
                    left: empAccessForm.isEnabled ? '24px' : '3px',
                    bottom: '3px',
                    background: '#fff',
                    borderRadius: '50%',
                    transition: '0.2s'
                  }} />
                </span>
              </label>
            </div>

            {/* بيانات تسجيل الدخول الموحد */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  اسم المستخدم للدخول الموحد (أو كود الموظف):
                </label>
                <input
                  type="text"
                  value={empAccessForm.username}
                  onChange={(e) => setEmpAccessForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder={editingEmp.code || 'اسم المستخدم'}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  كلمة المرور للدخول الموحد:
                </label>
                <input
                  type="text"
                  value={empAccessForm.password}
                  onChange={(e) => setEmpAccessForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="كلمة المرور"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>
            </div>

            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 900, color: 'var(--primary)' }}>
              🎯 تحديد الأنظمة والصفحات المسموح الدخول إليها:
            </h4>

            {/* 1. صفحته الشخصية بالـ HR */}
            <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={empAccessForm.permissions?.hrPersonalPortal?.enabled !== false}
                  onChange={(e) => setEmpAccessForm(prev => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      hrPersonalPortal: { enabled: e.target.checked }
                    }
                  }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px' }}>١. صفحته الشخصية التابعة لنظام HR (بوابة الموظف)</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>الاطلاع على وراديته وساعات العمل، كشوف الراتب، وتقديم طلبات الإجازات والأذونات</div>
                </div>
              </label>
            </div>

            {/* 2. صفحة مدير الفرع */}
            <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: empAccessForm.permissions?.branchManager?.enabled ? '10px' : 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(empAccessForm.permissions?.branchManager?.enabled)}
                  onChange={(e) => setEmpAccessForm(prev => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      branchManager: {
                        ...prev.permissions?.branchManager,
                        enabled: e.target.checked
                      }
                    }
                  }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px' }}>٢. صفحة مدير الفرع (Branch Manager View)</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>إدارة الفرع المخصص ومتابعة حضور وانصراف الموظفين والشفتات واعتماد طلبات الفرع</div>
                </div>
              </label>

              {empAccessForm.permissions?.branchManager?.enabled && (
                <div style={{ marginRight: '28px', background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '5px' }}>
                    اختر الفرع الذي سوف يتم الدخول عليه وإدارته:
                  </label>
                  <select
                    value={empAccessForm.permissions?.branchManager?.assignedBranchId || ''}
                    onChange={(e) => setEmpAccessForm(prev => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        branchManager: {
                          ...prev.permissions?.branchManager,
                          assignedBranchId: e.target.value
                        }
                      }
                    }))}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} (كود: {b.code || b.branchCode || b.id})</option>
                    ))}
                  </select>

                  <div style={{ marginTop: '8px', padding: '6px 10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔒</span>
                    <span>تعديل واستثناء الجزاءات والخصومات محجوب تماماً عن مدير الفرع ومحصور بالإدارة العليا المصرح لها فقط.</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. صفحة الإدارة العليا */}
            <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: empAccessForm.permissions?.topManagement?.enabled ? '10px' : 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(empAccessForm.permissions?.topManagement?.enabled)}
                  onChange={(e) => setEmpAccessForm(prev => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      topManagement: {
                        ...prev.permissions?.topManagement,
                        enabled: e.target.checked
                      }
                    }
                  }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px' }}>٣. صفحة الإدارة العليا (Top Management / HR Executive)</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>تحديد الصفحات الداخلية لنظام الإدارة العليا المسموح بالدخول عليها وحجب ما سواها</div>
                </div>
              </label>

              {empAccessForm.permissions?.topManagement?.enabled && (
                <div style={{ marginRight: '28px', background: '#fff', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary, #0d9488)' }}>
                      🛡️ حدد الصفحات والأقسام المصرح له بها في الإدارة العليا:
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = topMgmtModules.map(m => m.id);
                          setEmpAccessForm(prev => ({
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              topManagement: {
                                ...prev.permissions?.topManagement,
                                allowedModules: allIds
                              }
                            }
                          }));
                        }}
                        style={{ background: 'rgba(13, 148, 136, 0.1)', color: 'var(--primary, #0d9488)', border: '1px solid var(--primary, #0d9488)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        ✓ تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmpAccessForm(prev => ({
                            ...prev,
                            permissions: {
                              ...prev.permissions,
                              topManagement: {
                                ...prev.permissions?.topManagement,
                                allowedModules: ['dashboard']
                              }
                            }
                          }));
                        }}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        ✕ إلغاء التحديد
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px', maxHeight: '320px', overflowY: 'auto', padding: '4px' }}>
                    {topMgmtModules.map(mod => {
                      const currentMods = empAccessForm.permissions?.topManagement?.allowedModules || [];
                      const isChecked = currentMods.includes(mod.id) ||
                        (mod.legacyId && currentMods.includes(mod.legacyId)) ||
                        (mod.id.includes('-') && currentMods.includes(mod.id.replace(/-/g, '_')));

                      return (
                        <label
                          key={mod.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: isChecked ? 'rgba(13, 148, 136, 0.06)' : 'transparent',
                            border: isChecked ? '1px solid rgba(13, 148, 136, 0.25)' : '1px solid transparent',
                            transition: 'all 0.15s'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const normId = mod.id;
                              let nextMods = currentMods.filter(m =>
                                m !== normId &&
                                m !== mod.legacyId &&
                                m !== normId.replace(/-/g, '_')
                              );
                              if (e.target.checked) {
                                nextMods.push(normId);
                              }
                              setEmpAccessForm(prev => ({
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  topManagement: {
                                    ...prev.permissions?.topManagement,
                                    allowedModules: nextMods
                                  }
                                }
                              }));
                            }}
                          />
                          <span style={{ fontSize: '15px' }}>{mod.icon}</span>
                          <span style={{ fontWeight: isChecked ? 700 : 500, color: isChecked ? 'var(--primary, #0d9488)' : 'inherit' }}>
                            {mod.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* صلاحية استثناء وتعديل الجزاءات والخصومات */}
                  <div style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    background: empAccessForm.permissions?.topManagement?.canModifyOrExemptPenalties ? 'rgba(239, 68, 68, 0.05)' : '#f8fafc',
                    borderRadius: '8px',
                    border: empAccessForm.permissions?.topManagement?.canModifyOrExemptPenalties ? '1.5px solid #f87171' : '1px solid var(--border)'
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(empAccessForm.permissions?.topManagement?.canModifyOrExemptPenalties)}
                        onChange={(e) => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            topManagement: {
                              ...prev.permissions?.topManagement,
                              canModifyOrExemptPenalties: e.target.checked
                            }
                          }
                        }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#dc2626' }}
                      />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: empAccessForm.permissions?.topManagement?.canModifyOrExemptPenalties ? '#dc2626' : 'var(--text)' }}>
                          ⚖️ إمكانية التعديل أو استثناء الجزاءات (Modify & Exempt Penalties)
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                          منح الموظف صلاحية تعديل الجزاءات والخصومات اللائحية أو استثناء وتخفيف خصومات التأخير والمخالفات في شاشات الإدارة العليا
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 4. نظام OutStock Handling */}
            <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: empAccessForm.permissions?.outstockHandling?.enabled ? '10px' : 0 }}>
                <input
                  type="checkbox"
                  checked={Boolean(empAccessForm.permissions?.outstockHandling?.enabled)}
                  onChange={(e) => setEmpAccessForm(prev => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      outstockHandling: {
                        ...prev.permissions?.outstockHandling,
                        enabled: e.target.checked
                      }
                    }
                  }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px' }}>٤. نظام نواقص الأدوية والمشتريات (OutStock Handling System)</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>إتاحة الدخول لنظام متابعة النواقص وطلبيات الأدوية وتحديد الدور والفروع</div>
                </div>
              </label>

              {empAccessForm.permissions?.outstockHandling?.enabled && (
                <div style={{ marginRight: '28px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>حدد الدور المطلوب في نظام النواقص:</div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="outstock_role"
                        value="branch"
                        checked={empAccessForm.permissions?.outstockHandling?.role === 'branch'}
                        onChange={() => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: { ...prev.permissions?.outstockHandling, role: 'branch' }
                          }
                        }))}
                      />
                      <span>💊 صيدلية / فرع</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="outstock_role"
                        value="procurement_manager"
                        checked={empAccessForm.permissions?.outstockHandling?.role === 'procurement_manager'}
                        onChange={() => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: {
                              ...prev.permissions?.outstockHandling,
                              role: 'procurement_manager',
                              assignedBranchId: 'all',
                              allBranchesAccess: true,
                              assignedBranchIds: (branches || []).map(b => b.id)
                            }
                          }
                        }))}
                      />
                      <span>👔 مدير مشتريات (كافة الفروع)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="outstock_role"
                        value="procurement_team"
                        checked={empAccessForm.permissions?.outstockHandling?.role === 'procurement_team'}
                        onChange={() => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: {
                              ...prev.permissions?.outstockHandling,
                              role: 'procurement_team',
                              assignedBranchId: null
                            }
                          }
                        }))}
                      />
                      <span>🤝 فريق المشتريات (عام)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="outstock_role"
                        value="cosmetics_officer"
                        checked={empAccessForm.permissions?.outstockHandling?.role === 'cosmetics_officer'}
                        onChange={() => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: {
                              ...prev.permissions?.outstockHandling,
                              role: 'cosmetics_officer',
                              assignedBranchId: prev.permissions?.outstockHandling?.assignedBranchId || 'ALL'
                            }
                          }
                        }))}
                      />
                      <span style={{ color: '#db2777', fontWeight: 'bold' }}>💄 مسؤول مستحضرات تجميل</span>
                    </label>
                  </div>

                  {/* تحديد الفرع المسؤول عنه أو إتاحة كافة الفروع لمدير المشتريات / مسؤول التجميل / فريق المشتريات */}
                  {empAccessForm.permissions?.outstockHandling?.role === 'procurement_manager' ? (
                    <div style={{
                      padding: '12px 14px',
                      background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                      border: '1px solid #a7f3d0',
                      borderRadius: '10px',
                      color: '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <span style={{ fontSize: '22px' }}>🌐</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>مسؤول عن كافة الفروع مركزياً (All Branches)</div>
                        <div style={{ fontSize: '11.5px', color: '#047857', marginTop: '2px' }}>
                          بصفته مديراً للمشتريات، يتم فتح كامل أقسام منظومة النواقص وسجل طلبات جميع الفروع والموردين والتقارير المالية دون تقييد بفرع محدد.
                        </div>
                      </div>
                    </div>
                  ) : empAccessForm.permissions?.outstockHandling?.role === 'procurement_team' ? (
                    <div style={{
                      padding: '12px 14px',
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                      border: '1.5px solid #86efac',
                      borderRadius: '10px',
                      color: '#065f46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <span style={{ fontSize: '24px' }}>🤝</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>عضو فريق المشتريات والتوريدات العام</div>
                        <div style={{ fontSize: '12px', color: '#047857', marginTop: '3px', lineHeight: 1.5 }}>
                          تم تعيين الموظف كعضو في فريق المشتريات العام — سيقوم مدير المشتريات بتحديد الفروع التابعة له وتوزيع صلاحيات التوريد التفصيلية من داخل شاشة "إدارة فريق المشتريات".
                        </div>
                      </div>
                    </div>
                  ) : empAccessForm.permissions?.outstockHandling?.role === 'cosmetics_officer' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '5px', color: '#be185d' }}>
                        نطاق فروع مستحضرات التجميل المسندة للمسؤول:
                      </label>
                      <select
                        value={empAccessForm.permissions?.outstockHandling?.assignedBranchId || 'ALL'}
                        onChange={(e) => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: {
                              ...prev.permissions?.outstockHandling,
                              assignedBranchId: e.target.value
                            }
                          }
                        }))}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1.5px solid #f472b6', fontSize: '13px', fontFamily: 'Cairo', background: '#fff' }}
                      >
                        <option value="ALL">🌐 جميع الفروع (إشراف مركزي كامل على مستحضرات التجميل)</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>🏢 صيدلية: {b.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, marginBottom: '5px' }}>
                        الفرع المسؤول عنه في نظام النواقص:
                      </label>
                      <select
                        value={empAccessForm.permissions?.outstockHandling?.assignedBranchId || ''}
                        onChange={(e) => setEmpAccessForm(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            outstockHandling: {
                              ...prev.permissions?.outstockHandling,
                              assignedBranchId: e.target.value
                            }
                          }
                        }))}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 5. صفحة الحسابات العامة */}
            <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(empAccessForm.permissions?.accountsSystem?.enabled)}
                  onChange={(e) => setEmpAccessForm(prev => ({
                    ...prev,
                    permissions: {
                      ...prev.permissions,
                      accountsSystem: { enabled: e.target.checked }
                    }
                  }))}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13.5px' }}>٥. صفحة الحسابات العامة (Accounts & ERP System)</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>إتاحة الدخول لمنظومة الحسابات وشجرة الحسابات والقيود المحاسبية</div>
                </div>
              </label>
            </div>

            {/* أزرار الإجراءات */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button
                type="button"
                onClick={handleResetEmpPermissions}
                disabled={isSavingEmp}
                style={{
                  background: '#fee2e2',
                  color: '#dc2626',
                  border: '1px solid #fca5a5',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                إلغاء التخصيص وإعادته لموظف عادي
              </button>

              <button
                type="button"
                onClick={() => { setEditingEmp(null); setEmpAccessForm(null); }}
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleSaveEmpPermissions}
                disabled={isSavingEmp}
                style={{
                  background: 'var(--primary, #0d9488)',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(13,148,136,0.3)'
                }}
              >
                {isSavingEmp ? 'جاري الحفظ...' : '💾 اعتماد وحفظ الصلاحيات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة إضافة/تعديل مالك جديد (Add / Edit Owner Modal)
         ══════════════════════════════════════════════════════════════════════ */}
      {showOwnerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface, #ffffff)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            border: '1px solid var(--border)',
            padding: '24px'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 900, color: 'var(--text)' }}>
              👑 {editingOwnerId ? 'تعديل بيانات المالك' : 'إضافة مالك جديد للمنظومة'}
            </h3>

            <form onSubmit={handleSaveOwner}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  اسم المالك الكامل:
                </label>
                <input
                  type="text"
                  required
                  value={ownerForm.fullName}
                  onChange={(e) => setOwnerForm(prev => ({ ...prev, fullName: e.target.value }))}
                  placeholder="مثال: د. سيف خالد"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  اسم المستخدم (Username):
                </label>
                <input
                  type="text"
                  required
                  value={ownerForm.username}
                  onChange={(e) => setOwnerForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="اسم المستخدم للدخول"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  كلمة المرور (Password): {editingOwnerId && <span style={{ color: '#059669', fontSize: '11px', fontWeight: 600 }}>(اتركها فارغة للإبقاء على الحالية)</span>}
                </label>
                <input
                  type="text"
                  required={!editingOwnerId}
                  value={ownerForm.password}
                  onChange={(e) => setOwnerForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder={editingOwnerId ? 'اتركها فارغة للحفاظ على كلمة المرور القديمة' : 'كلمة المرور'}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, marginBottom: '5px' }}>
                  رقم الهاتف (اختياري):
                </label>
                <input
                  type="text"
                  value={ownerForm.phone}
                  onChange={(e) => setOwnerForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="رقم الهاتف"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'Cairo' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowOwnerModal(false)}
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingOwner}
                  style={{ background: 'var(--primary, #0d9488)', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}
                >
                  {isSavingOwner ? 'جاري الحفظ...' : 'حفظ بيانات المالك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
