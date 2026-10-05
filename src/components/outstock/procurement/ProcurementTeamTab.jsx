import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  Unlock,
  Building2,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Plus,
  User,
  Phone,
  Eye,
  Settings,
  Pill,
  Save,
  Check,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import {
  outstockGetProcurementTeam,
  outstockAddProcurementTeamMember,
  outstockUpdateProcurementTeamMember,
  outstockDeleteProcurementTeamMember,
  outstockUpdateProcurementManagerProfile,
  outstockGetBranchPermissions,
  outstockSaveBranchPermissions,
  outstockGetBranches,
  outstockGetEmployees
} from '../../../utils/outstockApiClient';

/**
 * ProcurementTeamTab.jsx
 * شاشة إدارة فريق المشتريات، الصلاحيات الدقيقة، وحساب مدير المشتريات،
 * وضبط صلاحيات تعديل أسعار وبيانات الأصناف لفروع الصيدليات
 */
export default function ProcurementTeamTab({ showToast = alert, currentUser = null }) {
  const [activeSection, setActiveSection] = useState('team'); // 'team' | 'manager_profile' | 'branch_permissions'

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. فريق المشتريات والأعضاء
  // ══════════════════════════════════════════════════════════════════════════════
  const [teamMembers, setTeamMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  const [memberForm, setMemberForm] = useState({
    username: '',
    password: '',
    fullName: '',
    phone: '',
    role: 'procurement_officer', // 'procurement_officer' | 'cosmetics_officer'
    category_scope: 'all', // 'all' | 'cosmetics'
    allowed_branches: [], // empty = all branches
    can_edit_items: true, // صلاحية التعديل على الأصناف (الشرط الأساسي)
    can_view_orders: true,
    can_change_status: true,
    can_access_suppliers: true,
    can_access_supplier_accounts: true,
    can_access_order_receiving: true,
    can_access_supplier_invoices: true,
    can_access_branch_withdrawals: true,
    can_access_discounts_comparison: true
  });

  const [selectedBranchForEmp, setSelectedBranchForEmp] = useState('');
  const [branchEmployees, setBranchEmployees] = useState([]);
  const [isLoadingBranchEmps, setIsLoadingBranchEmps] = useState(false);

  const showToastRef = React.useRef(showToast);
  React.useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const loadTeam = useCallback(async () => {
    try {
      setIsLoadingTeam(true);
      const [teamRes, branchRes] = await Promise.all([
        outstockGetProcurementTeam(),
        outstockGetBranches()
      ]);
      if (teamRes?.success) {
        const normalized = (teamRes.team || [])
          .filter(m => m.username !== 'admin-stock')
          .map(m => {
            const p = m.permissions || {};
            const isManager = m.role === 'procurement_manager' || p.can_manage_team === true;
            const isCosmetics = !isManager && (m.role === 'cosmetics_officer' || p.category_scope === 'cosmetics');
            return {
              ...m,
              role: isManager ? 'procurement_manager' : (isCosmetics ? 'cosmetics_officer' : (m.role || 'procurement_officer')),
              category_scope: isCosmetics ? 'cosmetics' : (p.category_scope || 'all'),
              allowed_branches: m.assigned_branches || m.allowed_branches || [],
              can_edit_items: isManager ? true : (p.can_edit_items === true),
              can_view_orders: isManager ? true : (p.can_view_orders !== false),
              can_change_status: isManager ? true : (p.can_change_status === true),
              can_access_suppliers: isManager ? true : (p.can_access_suppliers === true),
              can_access_supplier_accounts: isManager ? true : (p.can_access_supplier_accounts === true),
              can_access_order_receiving: isManager ? true : (p.can_access_order_receiving === true),
              can_access_supplier_invoices: isManager ? true : (p.can_access_supplier_invoices === true),
              can_access_branch_withdrawals: isManager ? true : (p.can_access_branch_withdrawals === true),
              can_access_discounts_comparison: isManager ? true : (p.can_access_discounts_comparison === true),
              can_manage_team: isManager
            };
          });
        setTeamMembers(normalized);
      }
      if (branchRes?.success) {
        setBranches(branchRes.branches || []);
      }
    } catch (err) {
      console.error('Error fetching procurement team:', err);
      showToastRef.current?.('تعذر تحميل بيانات فريق المشتريات');
    } finally {
      setIsLoadingTeam(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleBranchSelectForEmployee = async (branchId) => {
    setSelectedBranchForEmp(branchId);
    setBranchEmployees([]);
    if (!branchId) return;
    setIsLoadingBranchEmps(true);
    try {
      const res = await outstockGetEmployees(branchId);
      if (res?.success && Array.isArray(res.employees)) {
        setBranchEmployees(res.employees);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBranchEmps(false);
    }
  };

  const handleEmployeeChosen = (empId) => {
    const emp = branchEmployees.find((e) => String(e.id || e._id) === String(empId));
    if (!emp) return;
    setMemberForm((prev) => ({
      ...prev,
      fullName: emp.name || emp.full_name || '',
      phone: emp.phone || '',
      username: emp.code ? `proc_${emp.code}` : (emp.username || prev.username),
      allowed_branches: selectedBranchForEmp ? [selectedBranchForEmp] : prev.allowed_branches
    }));
  };

  const handleOpenAddMember = () => {
    setEditingMember(null);
    setSelectedBranchForEmp('');
    setBranchEmployees([]);
    setMemberForm({
      username: '',
      password: '',
      fullName: '',
      phone: '',
      role: 'procurement_officer',
      category_scope: 'all',
      allowed_branches: [],
      can_edit_items: false,
      can_view_orders: true,
      can_change_status: false,
      can_access_suppliers: false,
      can_access_supplier_accounts: false,
      can_access_order_receiving: false,
      can_access_supplier_invoices: false,
      can_access_branch_withdrawals: false,
      can_access_discounts_comparison: false
    });
    setIsMemberModalOpen(true);
  };

  const handleOpenEditMember = (member) => {
    if (member.is_hr_integrated || member.role === 'procurement_manager') {
      showToast?.('هذا الحساب مرتبط بمنظومة الموارد البشرية، ويتم تعديل بياناته وصلاحياته من شاشة إدارة صلاحيات الموظفين للمالك.');
      return;
    }
    setEditingMember(member);
    const p = member.permissions || {};
    const isCosmetics = member.role === 'cosmetics_officer' || member.category_scope === 'cosmetics' || p.category_scope === 'cosmetics';
    const branches = member.assigned_branches || member.allowed_branches || [];
    setMemberForm({
      username: member.username || '',
      password: '', // leave empty if not changing
      fullName: member.full_name || member.fullName || member.name || '',
      phone: member.phone || '',
      role: isCosmetics ? 'cosmetics_officer' : (member.role || 'procurement_officer'),
      category_scope: isCosmetics ? 'cosmetics' : (member.category_scope || p.category_scope || 'all'),
      allowed_branches: Array.isArray(branches) ? branches : [],
      can_edit_items: member.can_edit_items === true || p.can_edit_items === true,
      can_view_orders: member.can_view_orders !== false && p.can_view_orders !== false,
      can_change_status: member.can_change_status === true || p.can_change_status === true,
      can_access_suppliers: member.can_access_suppliers === true || p.can_access_suppliers === true,
      can_access_supplier_accounts: member.can_access_supplier_accounts === true || p.can_access_supplier_accounts === true,
      can_access_order_receiving: member.can_access_order_receiving === true || p.can_access_order_receiving === true,
      can_access_supplier_invoices: member.can_access_supplier_invoices === true || p.can_access_supplier_invoices === true,
      can_access_branch_withdrawals: member.can_access_branch_withdrawals === true || p.can_access_branch_withdrawals === true,
      can_access_discounts_comparison: member.can_access_discounts_comparison === true || p.can_access_discounts_comparison === true
    });
    setIsMemberModalOpen(true);
  };

  const handleToggleBranchScope = (branchId) => {
    setMemberForm((prev) => {
      const current = prev.allowed_branches || [];
      if (current.includes(branchId)) {
        return { ...prev, allowed_branches: current.filter((id) => id !== branchId) };
      } else {
        return { ...prev, allowed_branches: [...current, branchId] };
      }
    });
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (!memberForm.username?.trim()) {
      showToast?.('يرجى إدخال اسم المستخدم');
      return;
    }
    if (!editingMember && !memberForm.password?.trim()) {
      showToast?.('يرجى إدخال كلمة المرور للعضو الجديد');
      return;
    }

    const isCosmetics = memberForm.role === 'cosmetics_officer' || memberForm.category_scope === 'cosmetics';
    const cleanPerms = {
      can_edit_items: Boolean(memberForm.can_edit_items),
      can_view_orders: memberForm.can_view_orders !== false,
      can_change_status: Boolean(memberForm.can_change_status),
      can_access_suppliers: Boolean(memberForm.can_access_suppliers),
      can_access_supplier_accounts: Boolean(memberForm.can_access_supplier_accounts),
      can_order_receiving: Boolean(memberForm.can_access_order_receiving),
      can_access_order_receiving: Boolean(memberForm.can_access_order_receiving),
      can_access_supplier_invoices: Boolean(memberForm.can_access_supplier_invoices),
      can_access_branch_withdrawals: Boolean(memberForm.can_access_branch_withdrawals),
      can_access_discounts_comparison: Boolean(memberForm.can_access_discounts_comparison),
      category_scope: isCosmetics ? 'cosmetics' : 'all'
    };

    const payload = {
      username: memberForm.username,
      password: memberForm.password || undefined,
      fullName: memberForm.fullName,
      phone: memberForm.phone,
      role: isCosmetics ? 'cosmetics_officer' : 'procurement_officer',
      category_scope: isCosmetics ? 'cosmetics' : 'all',
      assignedBranches: memberForm.allowed_branches || [],
      allowed_branches: memberForm.allowed_branches || [],
      permissions: cleanPerms,
      ...cleanPerms
    };

    try {
      if (editingMember) {
        const res = await outstockUpdateProcurementTeamMember(editingMember.id, payload);
        if (res?.success) {
          showToast?.('تم تحديث بيانات وصلاحيات العضو بنجاح');
          setIsMemberModalOpen(false);
          loadTeam();
        } else {
          showToast?.(res?.error || 'فشل التحديث');
        }
      } else {
        const res = await outstockAddProcurementTeamMember(payload);
        if (res?.success) {
          showToast?.('تم إضافة عضو جديد لفريق المشتريات بنجاح');
          setIsMemberModalOpen(false);
          loadTeam();
        } else {
          showToast?.(res?.error || 'فشل إضافة العضو');
        }
      }
    } catch (err) {
      console.error(err);
      showToast?.('حدث خطأ أثناء حفظ بيانات العضو');
    }
  };

  const handleDeleteMember = async (member) => {
    if (member.is_hr_integrated || member.role === 'procurement_manager') {
      showToast?.('لا يمكن حذف حساب مرتبط بالموارد البشرية من هنا. يرجى تعديله أو إلغاء صلاحياته من شاشة صلاحيات الموظفين للمالك.');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف حساب "${member.fullName || member.username}" من فريق المشتريات؟`)) {
      return;
    }
    try {
      const res = await outstockDeleteProcurementTeamMember(member.id);
      if (res?.success) {
        showToast?.('تم حذف العضو بنجاح');
        loadTeam();
      } else {
        showToast?.(res?.error || 'فشل الحذف');
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء الحذف');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. إدارة وتأمين حساب مدير المشتريات (admin-stock)
  // ══════════════════════════════════════════════════════════════════════════════
  const [managerProfile, setManagerProfile] = useState({
    username: 'admin-stock',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    fullName: 'مدير المشتريات الرئيسي',
    phone: ''
  });
  const [isUpdatingManager, setIsUpdatingManager] = useState(false);

  const handleUpdateManagerProfile = async (e) => {
    e.preventDefault();
    if (managerProfile.newPassword && managerProfile.newPassword !== managerProfile.confirmPassword) {
      showToast?.('كلمة المرور الجديدة غير متطابقة مع التأكيد');
      return;
    }

    try {
      setIsUpdatingManager(true);
      const res = await outstockUpdateProcurementManagerProfile(managerProfile);
      if (res?.success) {
        showToast?.('تم تحديث بيانات وتأمين حساب مدير المشتريات بنجاح');
        setManagerProfile((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
      } else {
        showToast?.(res?.error || 'فشل تحديث الحساب');
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء التحديث');
    } finally {
      setIsUpdatingManager(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // 3. ضبط صلاحيات تعديل الأسعار وبيانات الأدوية والخصومات لفروع الصيدليات
  // ══════════════════════════════════════════════════════════════════════════════
  const [branchPerms, setBranchPerms] = useState({
    allow_global_price_edit: true,
    allow_global_discounts: true,
    branch_overrides: {} // branchId -> { can_edit_price: bool, can_edit_data: bool, can_apply_discount: bool }
  });
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);
  const [isSavingPerms, setIsSavingPerms] = useState(false);

  const loadBranchPermissions = useCallback(async () => {
    try {
      setIsLoadingPerms(true);
      const res = await outstockGetBranchPermissions();
      if (res?.success && res.permissions) {
        const p = res.permissions;
        setBranchPerms({
          allow_global_price_edit: p.allow_global_price_edit !== false && !p.global_price_edit_disabled,
          allow_global_discounts: !p.global_discounts_disabled,
          branch_overrides: p.branch_overrides || p.branch_rules || {}
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingPerms(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'branch_permissions') {
      loadBranchPermissions();
    }
  }, [activeSection, loadBranchPermissions]);

  const handleToggleGlobalPriceEdit = () => {
    setBranchPerms((prev) => ({
      ...prev,
      allow_global_price_edit: !prev.allow_global_price_edit
    }));
  };

  const handleToggleGlobalDiscounts = () => {
    setBranchPerms((prev) => ({
      ...prev,
      allow_global_discounts: !prev.allow_global_discounts
    }));
  };

  const handleToggleBranchPermission = (branchId, key) => {
    setBranchPerms((prev) => {
      const overrides = { ...(prev.branch_overrides || {}) };
      const current = overrides[branchId] || {
        can_edit_price: prev.allow_global_price_edit,
        can_edit_data: true,
        can_apply_discount: prev.allow_global_discounts
      };
      overrides[branchId] = {
        ...current,
        [key]: !current[key]
      };
      return { ...prev, branch_overrides: overrides };
    });
  };

  const handleSavePermissions = async () => {
    try {
      setIsSavingPerms(true);
      const payload = {
        global_price_edit_disabled: !branchPerms.allow_global_price_edit,
        global_discounts_disabled: !branchPerms.allow_global_discounts,
        allow_global_price_edit: branchPerms.allow_global_price_edit,
        allow_global_discounts: branchPerms.allow_global_discounts,
        branch_rules: branchPerms.branch_overrides,
        branch_overrides: branchPerms.branch_overrides
      };
      const res = await outstockSaveBranchPermissions(payload);
      if (res?.success) {
        showToastRef.current?.('تم حفظ إعدادات صلاحيات الأسعار والخصومات بالفروع بنجاح');
      } else {
        showToastRef.current?.(res?.error || 'فشل حفظ الإعدادات');
      }
    } catch (err) {
      showToastRef.current?.('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingPerms(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // واجهة العرض (JSX)
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="procurement-team-tab-container" style={{ padding: '16px', direction: 'rtl' }}>
      {/* ── شريط التنقل الفرعي ── */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          className={`outstock-btn ${activeSection === 'team' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
          onClick={() => setActiveSection('team')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 'bold' }}
        >
          <Users size={17} />
          <span>أعضاء فريق المشتريات والصلاحيات</span>
          <span
            style={{
              background: activeSection === 'team' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px'
            }}
          >
            {teamMembers.length}
          </span>
        </button>

        <button
          type="button"
          className={`outstock-btn ${activeSection === 'branch_permissions' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
          onClick={() => setActiveSection('branch_permissions')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: 'bold' }}
        >
          <Lock size={17} />
          <span>صلاحيات تعديل الأسعار بالفروع</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الأول: أعضاء فريق المشتريات والصلاحيات
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'team' && (
        <div>
          {/* شريط الإجراءات */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>أعضاء فريق المشتريات المعتمدين</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                يمكن لمدير المشتريات منح صلاحيات دقيقة للأعضاء، بما في ذلك صلاحية التعديل على الأصناف ونطاق الفروع
              </p>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={handleOpenAddMember}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UserPlus size={16} />
              <span>إضافة عضو جديد</span>
            </button>
          </div>

          {/* جدول الأعضاء */}
          {isLoadingTeam ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري تحميل أعضاء الفريق...</div>
            </div>
          ) : teamMembers.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Users size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>لا يوجد أعضاء مضافين بعد</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                اضغط على زر "إضافة عضو جديد" لإنشاء حسابات لمسؤولي ومساعدي المشتريات
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>اسم المستخدم / الاسم الكامل</th>
                    <th style={{ padding: '12px 14px' }}>الهاتف</th>
                    <th style={{ padding: '12px 14px' }}>نطاق الفروع المصرح بها</th>
                    <th style={{ padding: '12px 14px' }}>صلاحية تعديل الأصناف</th>
                    <th style={{ padding: '12px 14px' }}>الصلاحيات التشغيلية</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((m, idx) => {
                    const branchScope = Array.isArray(m.allowed_branches) && m.allowed_branches.length > 0
                      ? m.allowed_branches
                      : null;
                    return (
                      <tr
                        key={m.id || idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 1 ? '#fafafa' : '#fff'
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{m.fullName || m.name || m.username}</span>
                            {m.role === 'procurement_manager' ? (
                              <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                                👑 مدير إدارة المشتريات
                              </span>
                            ) : (m.role === 'cosmetics_officer' || m.category_scope === 'cosmetics') ? (
                              <span style={{ fontSize: '10.5px', background: '#fce7f3', color: '#be185d', padding: '1px 7px', borderRadius: '6px', fontWeight: '800' }}>
                                💄 مستحضرات تجميل
                              </span>
                            ) : (
                              <span style={{ fontSize: '10.5px', background: '#e0f2fe', color: '#0369a1', padding: '1px 7px', borderRadius: '6px', fontWeight: '800' }}>
                                📦 مشتريات عام
                              </span>
                            )}
                            {m.is_hr_integrated && (
                              <span style={{ fontSize: '10px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold' }}>
                                🔗 موظف معتمد بالنظام
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 'bold' }}>@{m.username}</div>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>{m.phone || '-'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          {branchScope ? (
                            <span
                              style={{
                                background: '#fef3c7',
                                color: '#b45309',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              محدد بـ {branchScope.length} فروع
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              كافة الفروع والصيدليات
                            </span>
                          )}
                        </td>
                        {/* صلاحية التعديل على الأصناف (الشرط المحدد) */}
                        <td style={{ padding: '12px 14px' }}>
                          {m.can_edit_items === true ? (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#15803d',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11.5px',
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <CheckCircle2 size={13} />
                              <span>مفعلة ✅</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                background: '#fee2e2',
                                color: '#b91c1c',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11.5px',
                                fontWeight: 'bold',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <XCircle size={13} />
                              <span>معطلة ❌</span>
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {m.can_view_orders !== false && (
                              <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '700' }}>
                                استعراض الطلبات
                              </span>
                            )}
                            {m.can_change_status === true && (
                              <span style={{ background: '#f1f5f9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '700' }}>
                                توريد وتغيير الحالة
                              </span>
                            )}
                            {(m.role === 'cosmetics_officer' || m.category_scope === 'cosmetics') ? (
                              <span style={{ background: '#fce7f3', color: '#be185d', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '800' }}>
                                معزول عن الموردين 💄
                              </span>
                            ) : m.can_access_suppliers === true ? (
                              <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {m.can_access_supplier_accounts === true && (
                                  <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    حساب الموردين
                                  </span>
                                )}
                                {m.can_access_order_receiving === true && (
                                  <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    استلام طلبية
                                  </span>
                                )}
                                {m.can_access_supplier_invoices === true && (
                                  <span style={{ background: '#fdf4ff', color: '#a21caf', border: '1px solid #f5d0fe', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    فواتير الموردين
                                  </span>
                                )}
                                {m.can_access_branch_withdrawals === true && (
                                  <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    مسحوبات الفروع
                                  </span>
                                )}
                                {m.can_access_discounts_comparison === true && (
                                  <span style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
                                    مقارنة الخصومات
                                  </span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {(m.is_hr_integrated || m.role === 'procurement_manager') ? (
                              <span style={{ fontSize: '11px', color: '#0369a1', background: '#f0f9ff', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bae6fd', fontWeight: 'bold' }}>
                                حساب مدار من شاشة الموظفين
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="outstock-btn outstock-btn-secondary"
                                  onClick={() => handleOpenEditMember(m)}
                                  title="تعديل البيانات والصلاحيات"
                                  style={{ padding: '5px 8px' }}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="outstock-btn outstock-btn-secondary"
                                  onClick={() => handleDeleteMember(m)}
                                  title="حذف الحساب"
                                  style={{ padding: '5px 8px', color: '#dc2626' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
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
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          القسم الثاني: صلاحيات تعديل الأسعار بالفروع (Branch Price Lock/Unlock)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSection === 'branch_permissions' && (
        <div style={{ maxWidth: '820px' }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>
                  المفتاح العام: تفعيل أو إيقاف تعديل أسعار الأدوية بكافة الفروع
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  عند إيقاف هذا الخيار، سيتم قفل إمكانية تعديل سعر أو بيانات الصنف من شاشة البحث في الصيدلية، إلا للفروع المستثناة أدناه
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleGlobalPriceEdit}
                style={{
                  border: 'none',
                  background: branchPerms.allow_global_price_edit ? '#10b981' : '#cbd5e1',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                {branchPerms.allow_global_price_edit ? (
                  <>
                    <Unlock size={14} />
                    <span>مسموح للجميع</span>
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    <span>مقفل على الجميع</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* جدول الفروع والاستثناءات الخاصة */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
            {/* بطاقات الضبط الشامل العام */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13.5px' }}>
                    تعديل أسعار الأدوية للأعلى بالصيدليات
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    السماح للصيدلي بتحديث السعر الرسمي للأعلى فقط
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleGlobalPriceEdit}
                  style={{
                    border: 'none',
                    background: branchPerms.allow_global_price_edit ? '#dcfce7' : '#fee2e2',
                    color: branchPerms.allow_global_price_edit ? '#15803d' : '#b91c1c',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {branchPerms.allow_global_price_edit ? 'مفعل عام ✅' : 'معطل عام 🔒'}
                </button>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13.5px' }}>
                    منح الخصومات للعملاء في طلبات الصيدليات
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    إقفال أو فتح إمكانية الخصم للصيدلي في نافذة الطلب
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleGlobalDiscounts}
                  style={{
                    border: 'none',
                    background: branchPerms.allow_global_discounts ? '#dcfce7' : '#fee2e2',
                    color: branchPerms.allow_global_discounts ? '#15803d' : '#b91c1c',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {branchPerms.allow_global_discounts ? 'الخصم متاح 🟢' : 'الخصم مقفل 🔒'}
                </button>
              </div>
            </div>

            <h4 style={{ margin: '0 0 12px 0', fontSize: '14.5px', color: '#0f172a' }}>
              تخصيص الصلاحيات لكل فرع على حدة:
            </h4>

            {branches.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '12px' }}>لا توجد فروع مسجلة بالنظام</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '10px 12px' }}>الفرع</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>تعديل سعر الدواء</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>تعديل بيانات الصنف</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>صلاحية الخصم للعملاء</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => {
                    const override = branchPerms.branch_overrides?.[b.id];
                    const canEditPrice = override?.can_edit_price !== undefined
                      ? override.can_edit_price
                      : branchPerms.allow_global_price_edit;
                    const canEditData = override?.can_edit_data !== undefined
                      ? override.can_edit_data
                      : true;
                    const canApplyDiscount = override?.can_apply_discount !== undefined
                      ? override.can_apply_discount
                      : branchPerms.allow_global_discounts;

                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{b.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleBranchPermission(b.id, 'can_edit_price')}
                            style={{
                              border: 'none',
                              background: canEditPrice ? '#dcfce7' : '#fee2e2',
                              color: canEditPrice ? '#15803d' : '#b91c1c',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            {canEditPrice ? 'متاح ✅' : 'مقفل 🔒'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleBranchPermission(b.id, 'can_edit_data')}
                            style={{
                              border: 'none',
                              background: canEditData ? '#dcfce7' : '#fee2e2',
                              color: canEditData ? '#15803d' : '#b91c1c',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            {canEditData ? 'متاح ✅' : 'مقفل 🔒'}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleBranchPermission(b.id, 'can_apply_discount')}
                            style={{
                              border: 'none',
                              background: canApplyDiscount ? '#dcfce7' : '#fee2e2',
                              color: canApplyDiscount ? '#15803d' : '#b91c1c',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer'
                            }}
                          >
                            {canApplyDiscount ? 'الخصم متاح 🟢' : 'الخصم مقفل 🔒'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={handleSavePermissions}
                disabled={isSavingPerms}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isSavingPerms ? <RefreshCw size={14} className="outstock-spin" /> : <Save size={14} />}
                <span>حفظ التعديلات في الصلاحيات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          نافذة إضافة / تعديل عضو فريق مشتريات
      ══════════════════════════════════════════════════════════════════════════ */}
      {isMemberModalOpen && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '540px', width: '92%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16.5px', color: '#0f172a' }}>
                {editingMember ? 'تعديل بيانات وصلاحيات العضو' : 'إضافة عضو جديد لفريق المشتريات'}
              </h3>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => setIsMemberModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMember}>
              {/* قسم اختيار موظف من فرع معين للربط التلقائي السريع */}
              {!editingMember && (
                <div
                  style={{
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Building2 size={15} />
                    <span>تحديد موظف من فرع معين للربط السريع (اختياري):</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="outstock-form-label" style={{ fontSize: '11px' }}>اختر الفرع:</label>
                      <select
                        className="outstock-form-select"
                        value={selectedBranchForEmp}
                        onChange={(e) => handleBranchSelectForEmployee(e.target.value)}
                      >
                        <option value="">-- اختر الفرع --</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="outstock-form-label" style={{ fontSize: '11px' }}>اختر الموظف:</label>
                      <select
                        className="outstock-form-select"
                        disabled={!selectedBranchForEmp || isLoadingBranchEmps}
                        onChange={(e) => handleEmployeeChosen(e.target.value)}
                      >
                        <option value="">{isLoadingBranchEmps ? 'جاري تحميل الموظفين...' : '-- اختر الموظف بالفرع --'}</option>
                        {branchEmployees.map((emp) => (
                          <option key={emp.id || emp._id} value={emp.id || emp._id}>
                            {emp.name || emp.full_name} {emp.code ? `(${emp.code})` : ''} - {emp.jobTitle || 'موظف'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">اسم المستخدم (Login Username)</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={memberForm.username}
                    onChange={(e) => setMemberForm({ ...memberForm, username: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="outstock-form-label">
                    {editingMember ? 'كلمة المرور (اتركه فارغاً للإبقاء عليها)' : 'كلمة المرور'}
                  </label>
                  <input
                    type="password"
                    className="outstock-form-input"
                    value={memberForm.password}
                    onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })}
                    required={!editingMember}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label className="outstock-form-label">الاسم الكامل للموظف</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={memberForm.fullName}
                    onChange={(e) => setMemberForm({ ...memberForm, fullName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="outstock-form-label">رقم الهاتف</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    value={memberForm.phone}
                    onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                  />
                </div>
              </div>

              {/* تحديد الدور الوظيفي والتخصص (مسؤول عام أو مسؤول مستحضرات تجميل) */}
              <div
                style={{
                  marginBottom: '14px',
                  background: memberForm.role === 'cosmetics_officer' ? '#fdf2f8' : '#f0fdfa',
                  border: memberForm.role === 'cosmetics_officer' ? '1.5px solid #f472b6' : '1px solid #99f6e4',
                  borderRadius: '10px',
                  padding: '12px',
                  transition: 'all 0.2s ease'
                }}
              >
                <label className="outstock-form-label" style={{ fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
                  الدور الوظيفي ونطاق التخصص:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setMemberForm((prev) => ({
                      ...prev,
                      role: 'procurement_officer',
                      category_scope: 'all'
                    }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      textAlign: 'right',
                      border: memberForm.role !== 'cosmetics_officer' ? '2px solid #0d9488' : '1px solid #cbd5e1',
                      background: memberForm.role !== 'cosmetics_officer' ? '#ccfbf1' : '#ffffff',
                      color: memberForm.role !== 'cosmetics_officer' ? '#0f766e' : '#64748b',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pill size={15} />
                      <span>مسؤول مشتريات عام 📦</span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#475569', marginTop: '3px', lineHeight: 1.3 }}>
                      استلام وتوريد كافة الأدوية والمستحضرات وباقي الصلاحيات
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMemberForm((prev) => ({
                      ...prev,
                      role: 'cosmetics_officer',
                      category_scope: 'cosmetics'
                    }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      textAlign: 'right',
                      border: memberForm.role === 'cosmetics_officer' ? '2px solid #db2777' : '1px solid #cbd5e1',
                      background: memberForm.role === 'cosmetics_officer' ? '#fce7f3' : '#ffffff',
                      color: memberForm.role === 'cosmetics_officer' ? '#be185d' : '#64748b',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={15} />
                      <span>مسؤول مستحضرات تجميل 💄</span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 'normal', color: '#831843', marginTop: '3px', lineHeight: 1.3 }}>
                      نطاق مخصص لمستحضرات التجميل والعناية، وتعمل معه كافة الصلاحيات الممنوحة أدناه
                    </div>
                  </button>
                </div>
              </div>

              {/* الصلاحيات الدقيقة */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '14px'
                }}
              >
                <label className="outstock-form-label" style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0f172a' }}>
                  الصلاحيات الممنوحة للعضو:
                </label>

                {/* صلاحية التعديل على الأصناف - الشرط الأساسي */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '8px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={memberForm.can_edit_items}
                    onChange={(e) => setMemberForm({ ...memberForm, can_edit_items: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                  />
                  <div>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#15803d' }}>
                      صلاحية التعديل على الأصناف والأدوية (تعديل السعر والبيانات)
                    </span>
                    <div style={{ fontSize: '11px', color: '#166534' }}>
                      تسمح للعضو بتعديل بيانات الأصناف وكارتة الصنف وأسعارها بالكتالوج
                    </div>
                  </div>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={memberForm.can_view_orders}
                      onChange={(e) => setMemberForm({ ...memberForm, can_view_orders: e.target.checked })}
                      style={{ accentColor: '#0f766e' }}
                    />
                    <span>صلاحية استعراض طلبات الفروع المجمعة</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={memberForm.can_change_status}
                      onChange={(e) => setMemberForm({ ...memberForm, can_change_status: e.target.checked })}
                      style={{ accentColor: '#0f766e' }}
                    />
                    <span>صلاحية توريد وشحن الطلبات وتغيير الحالات</span>
                  </label>

                  {memberForm.role === 'cosmetics_officer' && (
                    <div style={{ marginTop: '8px', marginBottom: '8px', padding: '10px 12px', background: '#fdf2f8', border: '1.5px dashed #f472b6', borderRadius: '8px', fontSize: '12px', color: '#be185d', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={16} />
                      <span>💄 مسؤول مستحضرات التجميل: يختص بإدارة وتوريد مستحضرات التجميل، ويمكنك تفعيل أو تقييد صلاحيات الموردين والعمليات له حسب رغبتك:</span>
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={memberForm.can_access_suppliers}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMemberForm({
                              ...memberForm,
                              can_access_suppliers: checked,
                              can_access_supplier_accounts: checked,
                              can_access_order_receiving: checked,
                              can_access_supplier_invoices: checked,
                              can_access_branch_withdrawals: checked,
                              can_access_discounts_comparison: checked
                            });
                          }}
                          style={{ accentColor: '#0f766e' }}
                        />
                        <span style={{ fontWeight: 'bold', color: '#0f766e' }}>صلاحية إدارة الموردين والعمليات المالية</span>
                      </label>

                      {/* التقسيم الدقيق لخمس صلاحيات لإدارة الموردين */}
                      {memberForm.can_access_suppliers && (
                        <div style={{ marginTop: '6px', marginRight: '22px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
                            اختر الأقسام المسموح للعضو بالوصول إليها:
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={memberForm.can_access_supplier_accounts}
                                onChange={(e) => setMemberForm({ ...memberForm, can_access_supplier_accounts: e.target.checked })}
                                style={{ accentColor: '#0f766e' }}
                              />
                              <span>حساب الموردين</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={memberForm.can_access_order_receiving}
                                onChange={(e) => setMemberForm({ ...memberForm, can_access_order_receiving: e.target.checked })}
                                style={{ accentColor: '#0f766e' }}
                              />
                              <span>استلام طلبية</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={memberForm.can_access_supplier_invoices}
                                onChange={(e) => setMemberForm({ ...memberForm, can_access_supplier_invoices: e.target.checked })}
                                style={{ accentColor: '#0f766e' }}
                              />
                              <span>فواتير الموردين</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={memberForm.can_access_branch_withdrawals}
                                onChange={(e) => setMemberForm({ ...memberForm, can_access_branch_withdrawals: e.target.checked })}
                                style={{ accentColor: '#0f766e' }}
                              />
                              <span>مسحوبات الفروع</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={memberForm.can_access_discounts_comparison}
                                onChange={(e) => setMemberForm({ ...memberForm, can_access_discounts_comparison: e.target.checked })}
                                style={{ accentColor: '#0f766e' }}
                              />
                              <span>مقارنة الخصومات</span>
                            </label>
                          </div>
                        </div>
                      )}
                </div>
              </div>

              {/* تحديد الفروع المسموح بها */}
              <div style={{ marginBottom: '16px' }}>
                <label className="outstock-form-label" style={{ fontWeight: 'bold' }}>
                  نطاق الفروع المصرح بها (اتركه فارغاً لتمكين كافة الفروع):
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxHeight: '120px', overflowY: 'auto' }}>
                  {branches.map((b) => {
                    const isSelected = memberForm.allowed_branches?.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => handleToggleBranchScope(b.id)}
                        style={{
                          border: isSelected ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                          background: isSelected ? '#f0fdfa' : '#fff',
                          color: isSelected ? '#0f766e' : '#475569',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{b.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsMemberModalOpen(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="outstock-btn outstock-btn-primary">
                  {editingMember ? 'حفظ التعديلات' : 'إضافة العضو'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
