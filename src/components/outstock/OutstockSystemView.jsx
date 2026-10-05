import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './outstock.css';
import {
  Package,
  Users,
  Clock,
  AlertTriangle,
  Building2,
  TrendingUp,
  Settings,
  LogOut,
  Moon,
  Sun,
  Shield,
  Activity,
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  Keyboard,
  Lock,
  MessageSquare,
  Search,
  BarChart3,
  Pill,
  Image as ImageIcon,
  MapPin,
  Key,
  Check,
  Truck,
  HelpCircle,
  UserCheck,
  Layers,
  CreditCard,
  FileText,
  Sparkles,
  PackageCheck,
  Server,
  ArrowRightLeft
} from 'lucide-react';
import OutstockNotificationModal from './common/OutstockNotificationModal';
import OutstockCommandPalette from './common/OutstockCommandPalette';
import { outstockGetMe, outstockGetNotificationsSummary } from '../../utils/outstockApiClient';
import {
  initOutstockSyncService,
  subscribeToSyncState,
  syncPendingOfflineOrders
} from '../../utils/outstockSyncService';
import {
  getActiveShortcuts,
  matchesShortcutEvent
} from '../../utils/shortcutsConfig';

// بوابات الصيدلية
import PharmacyOrdersTab from './pharmacy/PharmacyOrdersTab';
import BranchStockOrdersTab from './pharmacy/BranchStockOrdersTab';
import PharmacyCustomersTab from './pharmacy/PharmacyCustomersTab';
import PharmacyProcurementTrackingTab from './pharmacy/PharmacyProcurementTrackingTab';
import PharmacyDeficienciesTab from './pharmacy/PharmacyDeficienciesTab';
import OutstockWhatsAppCenterTab from './pharmacy/OutstockWhatsAppCenterTab';

// بوابات المشتريات
import ProcurementOrdersTab from './procurement/ProcurementOrdersTab';
import ProcurementDeliveryTrackingTab from './procurement/ProcurementDeliveryTrackingTab';
import ProcurementUnavailableTab from './procurement/ProcurementUnavailableTab';
import ProcurementWhatsAppCenterTab from './procurement/ProcurementWhatsAppCenterTab';

import OwnerBranchOrdersTab from './owner/OwnerBranchOrdersTab';
import OwnerProcurementMonitoringTab from './owner/OwnerProcurementMonitoringTab';
import OwnerCustomersDirectoryTab from './owner/OwnerCustomersDirectoryTab';
import OwnerSettingsTab from './owner/OwnerSettingsTab';
import OwnerMedicationsPricingTab from './owner/OwnerMedicationsPricingTab';
import OwnerFinancialReportsTab from './owner/OwnerFinancialReportsTab';
import PharmacyMedicationSearchTab from './pharmacy/PharmacyMedicationSearchTab';

// أقسام النواقص والمشتريات المطورة
import ItemInquiryAndCorrectionTab from './common/ItemInquiryAndCorrectionTab';
import ProcurementSuppliersTab from './procurement/ProcurementSuppliersTab';
import ProcurementTeamTab from './procurement/ProcurementTeamTab';
import PharmacyRestockedItemsTab from './pharmacy/PharmacyRestockedItemsTab';
import OwnerComplaintsModal from './owner/OwnerComplaintsModal';
import ProcurementComplaintsTab from './procurement/ProcurementComplaintsTab';
import PharmacyComplaintsTab from './pharmacy/PharmacyComplaintsTab';
import OwnerComplaintsTab from './owner/OwnerComplaintsTab';

/**
 * OutstockSystemView.jsx
 * الحاوية المركزية الشاملة لنظام النواقص والمشتريات (OutStock Handling System)
 * توفر بوابات مخصصة لـ:
 * 1. الصيدلية / الفرع (Pharmacy Branch Portal)
 * 2. إدارة المشتريات (Procurement Management Portal)
 * 3. المالك والإشراف العام (Owner Executive Portal)
 */
export default function OutstockSystemView({
  initialRole = 'owner', // 'owner' | 'procurement' | 'branch'
  currentBranch = null,
  currentUser = null,
  onLogout,
  themeMode = 'light',
  toggleTheme,
  showToast = alert
}) {
  const isProcurementManager = Boolean(
    initialRole === 'procurement_manager' ||
    initialRole === 'outstock_procurement_manager' ||
    currentUser?.role === 'procurement_manager' ||
    currentUser?.role === 'outstock_procurement_manager' ||
    currentUser?.unifiedAccess?.permissions?.outstockHandling?.role === 'procurement_manager' ||
    currentUser?.outstockRole === 'procurement_manager' ||
    currentUser?.permissions?.role === 'procurement_manager' ||
    currentUser?.allBranchesAccess === true
  );

  const [userRole, setUserRole] = useState(() => {
    let r = initialRole || currentUser?.role || 'owner';
    if (typeof r === 'string' && r.startsWith('outstock_')) {
      r = r.replace('outstock_', '');
    }
    if (r === 'pharmacy') r = 'branch';
    if (
      isProcurementManager ||
      ['procurement_manager', 'procurement_officer', 'cosmetics_officer', 'procurement'].includes(r) ||
      ['procurement_manager', 'procurement_officer', 'cosmetics_officer', 'procurement'].includes(currentUser?.role) ||
      currentUser?.role === 'outstock_cosmetics_officer' ||
      currentUser?.originalRole === 'cosmetics_officer' ||
      currentUser?.username === 'admin-stock' ||
      currentUser?.category_scope === 'cosmetics' ||
      currentUser?.permissions?.category_scope === 'cosmetics'
    ) {
      r = 'procurement';
    }
    return r;
  });

  useEffect(() => {
    let r = initialRole || currentUser?.role || 'owner';
    if (typeof r === 'string' && r.startsWith('outstock_')) {
      r = r.replace('outstock_', '');
    }
    if (r === 'pharmacy') r = 'branch';
    if (
      isProcurementManager ||
      ['procurement_manager', 'procurement_officer', 'cosmetics_officer', 'procurement'].includes(r) ||
      ['procurement_manager', 'procurement_officer', 'cosmetics_officer', 'procurement'].includes(currentUser?.role) ||
      currentUser?.role === 'outstock_cosmetics_officer' ||
      currentUser?.originalRole === 'cosmetics_officer' ||
      currentUser?.username === 'admin-stock' ||
      currentUser?.category_scope === 'cosmetics' ||
      currentUser?.permissions?.category_scope === 'cosmetics'
    ) {
      r = 'procurement';
    }
    setUserRole(r);
  }, [initialRole, currentUser, isProcurementManager]);

  const isProcurementRole = userRole === 'procurement' ||
                            userRole === 'procurement_manager' ||
                            userRole === 'procurement_officer' ||
                            userRole === 'cosmetics_officer' ||
                            userRole === 'outstock_procurement_officer' ||
                            userRole === 'outstock_cosmetics_officer' ||
                            isProcurementManager ||
                            currentUser?.role === 'procurement_manager' ||
                            currentUser?.role === 'procurement_officer' ||
                            currentUser?.role === 'cosmetics_officer' ||
                            currentUser?.role === 'outstock_cosmetics_officer' ||
                            currentUser?.role === 'outstock_procurement_officer' ||
                            currentUser?.originalRole === 'cosmetics_officer' ||
                            currentUser?.originalRole === 'outstock_cosmetics_officer' ||
                            currentUser?.category_scope === 'cosmetics' ||
                            currentUser?.username === 'admin-stock';

  // استخلاص الصلاحيات الدقيقة للمستخدم الحالي
  const effectivePermissions = useMemo(() => {
    const isMgr = isProcurementManager || currentUser?.role === 'procurement_manager' || currentUser?.isProcurementManager || userRole === 'owner';
    const p = currentUser?.permissions || {};
    return {
      can_edit_items: isMgr ? true : (p.can_edit_items !== undefined ? p.can_edit_items : currentUser?.can_edit_items),
      can_view_orders: isMgr ? true : (p.can_view_orders !== undefined ? p.can_view_orders : currentUser?.can_view_orders),
      can_change_status: isMgr ? true : (p.can_change_status !== undefined ? p.can_change_status : currentUser?.can_change_status),
      can_access_suppliers: isMgr ? true : (p.can_access_suppliers !== undefined ? p.can_access_suppliers : currentUser?.can_access_suppliers),
      can_access_supplier_accounts: isMgr ? true : (p.can_access_supplier_accounts !== undefined ? p.can_access_supplier_accounts : currentUser?.can_access_supplier_accounts),
      can_access_order_receiving: isMgr ? true : (p.can_access_order_receiving !== undefined ? p.can_access_order_receiving : currentUser?.can_access_order_receiving),
      can_access_supplier_invoices: isMgr ? true : (p.can_access_supplier_invoices !== undefined ? p.can_access_supplier_invoices : currentUser?.can_access_supplier_invoices),
      can_access_branch_withdrawals: isMgr ? true : (p.can_access_branch_withdrawals !== undefined ? p.can_access_branch_withdrawals : currentUser?.can_access_branch_withdrawals),
      can_access_discounts_comparison: isMgr ? true : (p.can_access_discounts_comparison !== undefined ? p.can_access_discounts_comparison : currentUser?.can_access_discounts_comparison),
      can_access_pharmafly: isMgr ? true : (p.can_access_pharmafly !== undefined ? p.can_access_pharmafly : currentUser?.can_access_pharmafly),
      can_manage_team: isMgr ? true : (p.can_manage_team !== undefined ? p.can_manage_team : currentUser?.can_manage_team),
      category_scope: p.category_scope || currentUser?.category_scope || (currentUser?.role === 'cosmetics_officer' ? 'cosmetics' : 'all')
    };
  }, [currentUser, isProcurementManager, userRole]);

  // مسؤول مستحضرات التجميل (نطاق مخصص للمستحضرات فقط)
  const isCosmeticsOfficer = (
    userRole === 'cosmetics_officer' ||
    userRole === 'outstock_cosmetics_officer' ||
    currentUser?.role === 'cosmetics_officer' ||
    currentUser?.role === 'outstock_cosmetics_officer' ||
    currentUser?.originalRole === 'cosmetics_officer' ||
    currentUser?.originalRole === 'outstock_cosmetics_officer' ||
    effectivePermissions.category_scope === 'cosmetics' ||
    currentUser?.category_scope === 'cosmetics'
  ) && isProcurementRole;

  // هل يملك صلاحية إدارة فريق المشتريات؟ (للمدير والمالك فقط أو من منح صلاحية manage_team)
  const canManageTeam = (
    userRole === 'owner' ||
    currentUser?.role === 'owner' ||
    currentUser?.role === 'procurement_manager' ||
    isProcurementManager ||
    currentUser?.username === 'admin-stock' ||
    effectivePermissions.can_manage_team === true
  );

  const [activeBranch, setActiveBranch] = useState(() => {
    if (isProcurementManager) {
      return { id: 'all', name: 'كافة الفروع (مركزي)' };
    }
    return currentBranch || currentUser?.branchData || {
      id: currentUser?.branchId || currentUser?.branch_id || currentUser?.id || 'main',
      name: currentUser?.fullName || currentUser?.name || 'فرع الصيدلية الرئيسي'
    };
  });

  const effectiveBranchId = isProcurementManager ? 'all' : (activeBranch?.id || currentUser?.branchId || currentUser?.branch_id || currentUser?.id || 'main');

  // التبويب النشط
  const [activeTab, setActiveTab] = useState(() => {
    if (userRole === 'branch') return 'orders';
    if (userRole === 'procurement' || isProcurementRole) return 'branch_orders';
    return 'owner_branches';
  });

  // قائمة أقسام طلبات الصيدلية المنسدلة (طلبات 📦)
  const PHARMACY_ORDERS_SUBSECTIONS = [
    {
      id: 'orders',
      title: 'طلبات العملاء',
      desc: 'تسجيل ومتابعة طلبيات عملاء الصيدلية، الأسعار، والإيصالات',
      icon: Package
    },
    {
      id: 'branch_orders',
      title: 'طلبات الفرع (نواقص ومخزون)',
      desc: 'طلب أدوية ومستحضرات لمخزون الفرع مباشرة بدون عميل أو أسعار وبدون إيصال',
      icon: Building2
    },
    {
      id: 'transferred_orders',
      title: 'طلبات محولة من وإلى 🔄',
      desc: 'متابعة الطلبات والأصناف المحولة بين الفروع أو من وإلى فرعكم',
      icon: ArrowRightLeft
    },
    {
      id: 'procurement_tracking',
      title: 'متابعة طلبات المشتريات',
      desc: 'متابعة الأصناف المتوفرة وجاهزية الاستلام والتوريد بالفرع',
      icon: Clock
    },
    {
      id: 'inquiries',
      title: 'الاستعلام وتصحيح الأصناف',
      desc: 'الاستعلام عن أسعار وتصحيح بيانات الأصناف واعتماد الأدوية الجديدة',
      icon: HelpCircle
    },
    {
      id: 'restocked_items',
      title: 'أصناف أُعيد توافرها',
      desc: 'الأصناف التي كانت ناقصة وتم توفيرها من المشتريات للتواصل مع العملاء لحجزها',
      icon: RefreshCw
    }
  ];

  // قائمة أقسام طلبات الفروع المجمعة المنسدلة
  const PROCUREMENT_BRANCH_ORDERS_SUBSECTIONS = [
    {
      id: 'branch_orders',
      title: 'طلبات الفروع المجمعة',
      desc: 'استعراض ومتابعة وتوريد طلبيات العملاء المحولة من كافة الفروع',
      icon: Building2
    },
    {
      id: 'procurement_inquiries',
      title: 'الاستعلام وتصحيح الأصناف',
      desc: 'الرد على استفسارات الفروع واعتماد وتصحيح أسعار الأدوية الجديدة',
      icon: HelpCircle
    },
    {
      id: 'delivery_tracking',
      title: 'متابعة تسليم الأصناف',
      desc: 'تتبع خط سير تسليم الأدوية والشحن والتسليم الميداني للفروع',
      icon: Activity
    },
    {
      id: 'unavailable_items',
      title: 'أصناف غير متوفرة بالسوق',
      desc: 'إدارة نواقص السوق وحصر الأدوية الشحيحة والبدائل الدوائية',
      icon: AlertTriangle
    }
  ];

  // قائمة أقسام الموردين وفواتير الشراء المنسدلة
  const PROCUREMENT_SUPPLIERS_SUBSECTIONS = [
    {
      id: 'accounts',
      title: 'حسابات الموردين وحدود الائتمان',
      desc: 'إدارة المديونيات وأرصدة الموردين وفترات السداد والتحصيلات',
      icon: CreditCard
    },
    {
      id: 'order_receiving',
      title: 'استلام الطلبات',
      desc: 'تسجيل ومطابقة الأصناف والكميات المستلمة لكل فاتورة توريد',
      icon: PackageCheck
    },
    {
      id: 'invoices',
      title: 'فواتير الموردين ومطابقتها (Drive)',
      desc: 'تسجيل ومراجعة فواتير الشراء ومطابقة الأصناف والأرشفة السحابية',
      icon: FileText
    },
    {
      id: 'withdrawals',
      title: 'مسحوبات الفروع الشهرية',
      desc: 'سجل استلامات ومسحوبات فروع الصيدلية من بضائع الموردين المباشرة',
      icon: Layers
    },
    {
      id: 'discounts_comparison',
      title: 'مقارنة خصومات الموردين و i\'SUPPLY 👑',
      desc: 'رادار أفضل نسبة خصم بين الشركات وبوابة i\'SUPPLY اللحظية',
      icon: Sparkles
    },
    {
      id: 'pharmafly_sync',
      title: 'ربط فارما فلاي 🔄 (PharmaFly ERP)',
      desc: 'المزامنة التلقائية للفواتير، المخزون الحي للفروع، ومسار التفعيل الميداني',
      icon: Server
    }
  ];

  // قائمة الأقسام الفرعية لصفحة الإعدادات والصلاحيات للمالك
  const OWNER_SETTINGS_SUBSECTIONS = [
    {
      id: 'pharmacy_identity',
      title: 'هوية وشعار الصيدلية بالفاتورة',
      desc: 'تخصيص الشعار الرسمي والترويسة وبيانات الفواتير المطبوعة',
      icon: ImageIcon
    },
    {
      id: 'delivery_zones',
      title: 'إدارة مناطق وأحياء التوصيل',
      desc: 'إضافة وتعديل مناطق التوصيل المتاحة وتكاليف الشحن',
      icon: MapPin
    },
    {
      id: 'branches',
      title: 'إدارة وتفعيل الفروع والصيدليات',
      desc: 'ربط بيانات الفروع وتعيين حسابات الدخول وحالات العمل',
      icon: Building2
    },
    {
      id: 'procurement_users',
      title: 'يوزرات إدارة المشتريات والصلاحيات',
      desc: 'إدارة مسؤولي المشتريات وتحديد نطاق وصلاحيات الفروع',
      icon: Users
    },
    {
      id: 'security',
      title: 'تأمين حساب المالك وكلمة المرور',
      desc: 'حماية وتعديل كلمة مرور حساب المالك وبيانات الدخول',
      icon: Key
    },
    {
      id: 'shortcuts',
      title: 'تخصيص اختصارات لوحة المفاتيح',
      desc: 'تعيين مفاتيح سريعة للوصول للعمليات والأقسام فوراً',
      icon: Keyboard
    }
  ];

  // ── نظام الإشعارات المنبثقة الاحترافية داخل النظام ──
  const [activeNotification, setActiveNotification] = useState(null);

  const triggerNotification = useCallback((msgOrObj) => {
    if (!msgOrObj) return;
    if (typeof msgOrObj === 'string') {
      setActiveNotification({ message: msgOrObj });
    } else {
      setActiveNotification(msgOrObj);
    }
  }, []);

  // استماع للحدث الموحد من أي مكان بالنظام
  useEffect(() => {
    const handleOutstockNotify = (e) => {
      const detail = e?.detail || e;
      if (detail) triggerNotification(detail);
    };
    window.addEventListener('outstock:notify', handleOutstockNotify);
    return () => window.removeEventListener('outstock:notify', handleOutstockNotify);
  }, []);

  // ── قسم إعدادات المالك والقائمة المنسدلة الذكية ──
  const [ownerSettingsSection, setOwnerSettingsSection] = useState('pharmacy_identity');
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const settingsButtonRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const [menuCoords, setMenuCoords] = useState({
    top: 0,
    left: 0,
    width: 340,
    maxHeight: 460,
    arrowOffset: 24,
    alignMode: 'right'
  });

  // ── قائمة طلبات الصيدلية المنسدلة الذكية (طلبات) ──
  const [isPharmacyOrdersMenuOpen, setIsPharmacyOrdersMenuOpen] = useState(false);
  const pharmacyOrdersButtonRef = useRef(null);
  const pharmacyOrdersMenuRef = useRef(null);
  const [pharmacyOrdersMenuCoords, setPharmacyOrdersMenuCoords] = useState(null);

  // ── قائمة طلبات الفروع المجمعة المنسدلة الذكية ──
  const [isBranchOrdersMenuOpen, setIsBranchOrdersMenuOpen] = useState(false);
  const branchOrdersButtonRef = useRef(null);
  const branchOrdersMenuRef = useRef(null);
  const [branchOrdersMenuCoords, setBranchOrdersMenuCoords] = useState(null);

  // ── قائمة الموردين وفواتير الشراء المنسدلة الذكية ──
  const [isSuppliersMenuOpen, setIsSuppliersMenuOpen] = useState(false);
  const suppliersButtonRef = useRef(null);
  const suppliersMenuRef = useRef(null);
  const [suppliersMenuCoords, setSuppliersMenuCoords] = useState(null);
  const [suppliersActiveSubTab, setSuppliersActiveSubTab] = useState('accounts');

  // فحص الصلاحيات الدقيقة للأقسام الخمسة لإدارة الموردين
  const canAccessSuppliersTab = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) {
      return true;
    }
    if (effectivePermissions.can_access_suppliers !== true) {
      return false;
    }
    const hasAnySubtab = (
      effectivePermissions.can_access_supplier_accounts === true ||
      effectivePermissions.can_access_order_receiving === true ||
      effectivePermissions.can_access_supplier_invoices === true ||
      effectivePermissions.can_access_branch_withdrawals === true ||
      effectivePermissions.can_access_discounts_comparison === true ||
      effectivePermissions.can_access_pharmafly === true
    );
    return hasAnySubtab;
  }, [userRole, currentUser, effectivePermissions, isProcurementManager]);

  const filteredSuppliersSubsections = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) {
      return PROCUREMENT_SUPPLIERS_SUBSECTIONS;
    }
    return PROCUREMENT_SUPPLIERS_SUBSECTIONS.filter((sub) => {
      if (sub.id === 'accounts') return effectivePermissions.can_access_supplier_accounts === true;
      if (sub.id === 'order_receiving') return effectivePermissions.can_access_order_receiving === true;
      if (sub.id === 'invoices') return effectivePermissions.can_access_supplier_invoices === true;
      if (sub.id === 'withdrawals') return effectivePermissions.can_access_branch_withdrawals === true;
      if (sub.id === 'discounts_comparison') return effectivePermissions.can_access_discounts_comparison === true;
      if (sub.id === 'pharmafly_sync') return effectivePermissions.can_access_pharmafly === true;
      return false;
    });
  }, [userRole, currentUser, effectivePermissions, isProcurementManager]);

  // صلاحيات باقي أقسام المشتريات
  const canAccessBranchOrders = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) return true;
    return effectivePermissions.can_view_orders !== false;
  }, [userRole, currentUser, effectivePermissions, isProcurementManager]);

  const canAccessMedicationsCatalog = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) return true;
    return effectivePermissions.can_edit_items === true;
  }, [userRole, currentUser, effectivePermissions, isProcurementManager]);

  const canAccessProcurementWhatsApp = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) return true;
    return effectivePermissions.can_view_orders !== false;
  }, [userRole, currentUser, effectivePermissions, isProcurementManager]);

  const filteredBranchOrdersSubsections = useMemo(() => {
    if (userRole === 'owner' || currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' || isProcurementManager) {
      return PROCUREMENT_BRANCH_ORDERS_SUBSECTIONS;
    }
    return PROCUREMENT_BRANCH_ORDERS_SUBSECTIONS.filter((sub) => {
      if (sub.id === 'branch_orders') return effectivePermissions.can_view_orders !== false;
      if (sub.id === 'procurement_inquiries') return effectivePermissions.can_view_orders !== false || effectivePermissions.can_edit_items === true;
      if (sub.id === 'delivery_tracking') return effectivePermissions.can_view_orders !== false;
      if (sub.id === 'unavailable_items') return effectivePermissions.can_view_orders !== false;
      return true;
    }).map(sub => {
      if (isCosmeticsOfficer) {
        if (sub.id === 'branch_orders') {
          return { ...sub, title: 'طلبات المستحضرات المجمعة 💄', desc: 'استعراض ومتابعة وتوريد طلبيات مستحضرات التجميل المحولة من الفروع' };
        }
        if (sub.id === 'delivery_tracking') {
          return { ...sub, title: 'متابعة تسليم المستحضرات 💄', desc: 'تتبع خط سير تسليم مستحضرات التجميل والشحن الميداني للفروع' };
        }
        if (sub.id === 'unavailable_items') {
          return { ...sub, title: 'مستحضرات غير متوفرة بالسوق 💄', desc: 'إدارة نواقص مستحضرات التجميل والبدائل المتاحة' };
        }
      }
      return sub;
    });
  }, [userRole, currentUser, effectivePermissions, isCosmeticsOfficer]);

  // قائمة التبويبات المسموح بها للمشتريات
  const allowedProcurementTabs = useMemo(() => {
    if (userRole !== 'procurement' && !isProcurementRole && !isProcurementManager) return [];
    const tabs = [];
    if (canAccessBranchOrders) tabs.push('branch_orders');
    if (effectivePermissions.can_view_orders !== false || effectivePermissions.can_edit_items === true || isProcurementManager) tabs.push('procurement_inquiries');
    if (canAccessBranchOrders) tabs.push('delivery_tracking');
    if (effectivePermissions.can_view_orders !== false || isProcurementManager) tabs.push('unavailable_items');
    if (canAccessSuppliersTab) tabs.push('procurement_suppliers');
    if (canManageTeam) tabs.push('procurement_team');
    if (canAccessProcurementWhatsApp) tabs.push('procurement_whatsapp');
    if (canAccessMedicationsCatalog) tabs.push('procurement_medications');
    tabs.push('procurement_complaints');
    return tabs;
  }, [userRole, isProcurementRole, isProcurementManager, canAccessBranchOrders, effectivePermissions, canAccessSuppliersTab, canManageTeam, canAccessProcurementWhatsApp, canAccessMedicationsCatalog]);

  // التحقق من تعيين قسم فرعي مسموح به تلقائياً في الموردين
  useEffect(() => {
    if (filteredSuppliersSubsections.length > 0 && !filteredSuppliersSubsections.some(s => s.id === suppliersActiveSubTab)) {
      setSuppliersActiveSubTab(filteredSuppliersSubsections[0].id);
    }
  }, [filteredSuppliersSubsections, suppliersActiveSubTab]);

  // التحقق التلقائي من التبويب النشط وفق الصلاحيات الدقيقة
  useEffect(() => {
    if (userRole === 'procurement' || isProcurementRole) {
      if (allowedProcurementTabs.length > 0 && !allowedProcurementTabs.includes(activeTab)) {
        setActiveTab(allowedProcurementTabs[0]);
      }
    }
  }, [userRole, isProcurementRole, allowedProcurementTabs, activeTab]);

  // ── شريط الأوامر السريع المركزي والبحث الشامل (HUD / Command Palette - Ctrl+K) ──
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // ── وضع الكثافة المزدوج (Compact vs. Comfortable Mode) ──
  const [isCompactDensity, setIsCompactDensity] = useState(() => {
    try {
      return localStorage.getItem('outstock_density') === 'compact';
    } catch {
      return false;
    }
  });

  // دالة موحدة لحساب مواضع القوائم المنسدلة الذكية بدقة
  const calculateMenuCoords = useCallback((btnRef, menuWidth = 340) => {
    if (!btnRef?.current) return null;
    const rect = btnRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;
    const width = Math.min(menuWidth, viewportWidth - (margin * 2));
    const top = Math.round(rect.bottom + 6);
    let left = Math.round(rect.right - width);
    let alignMode = 'right';

    if (left < margin) {
      if (rect.left + width <= viewportWidth - margin) {
        left = Math.round(rect.left);
        alignMode = 'left';
      } else {
        left = Math.round(Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)));
        alignMode = 'clamped';
      }
    } else if (left + width > viewportWidth - margin) {
      left = Math.round(viewportWidth - width - margin);
      alignMode = 'right';
    }

    const buttonCenter = rect.left + (rect.width / 2);
    const arrowOffset = Math.round(Math.max(22, Math.min(width - 22, buttonCenter - left)));
    const maxHeight = Math.max(220, viewportHeight - top - 16);

    return { top, left, width, maxHeight, arrowOffset, alignMode };
  }, []);

  // تحديث مواضع القوائم المنسدلة عند فتحها
  useEffect(() => {
    if (isSettingsMenuOpen) {
      setMenuCoords(calculateMenuCoords(settingsButtonRef));
    }
  }, [isSettingsMenuOpen, calculateMenuCoords]);

  useEffect(() => {
    if (isPharmacyOrdersMenuOpen) {
      setPharmacyOrdersMenuCoords(calculateMenuCoords(pharmacyOrdersButtonRef));
    }
  }, [isPharmacyOrdersMenuOpen, calculateMenuCoords]);

  useEffect(() => {
    if (isBranchOrdersMenuOpen) {
      setBranchOrdersMenuCoords(calculateMenuCoords(branchOrdersButtonRef));
    }
  }, [isBranchOrdersMenuOpen, calculateMenuCoords]);

  useEffect(() => {
    if (isSuppliersMenuOpen) {
      setSuppliersMenuCoords(calculateMenuCoords(suppliersButtonRef));
    }
  }, [isSuppliersMenuOpen, calculateMenuCoords]);

  // إدارة أحداث الإغلاق عند النقر الخارجي وتغيير مقاس الشاشة
  useEffect(() => {
    if (!isSettingsMenuOpen && !isBranchOrdersMenuOpen && !isSuppliersMenuOpen && !isPharmacyOrdersMenuOpen) return;

    const handleUpdate = () => {
      if (isSettingsMenuOpen) setMenuCoords(calculateMenuCoords(settingsButtonRef));
      if (isPharmacyOrdersMenuOpen) setPharmacyOrdersMenuCoords(calculateMenuCoords(pharmacyOrdersButtonRef));
      if (isBranchOrdersMenuOpen) setBranchOrdersMenuCoords(calculateMenuCoords(branchOrdersButtonRef));
      if (isSuppliersMenuOpen) setSuppliersMenuCoords(calculateMenuCoords(suppliersButtonRef));
    };

    const handleClickOutside = (e) => {
      if (isSettingsMenuOpen) {
        if (!settingsButtonRef.current?.contains(e.target) && !settingsMenuRef.current?.contains(e.target)) {
          setIsSettingsMenuOpen(false);
        }
      }
      if (isPharmacyOrdersMenuOpen) {
        if (!pharmacyOrdersButtonRef.current?.contains(e.target) && !pharmacyOrdersMenuRef.current?.contains(e.target)) {
          setIsPharmacyOrdersMenuOpen(false);
        }
      }
      if (isBranchOrdersMenuOpen) {
        if (!branchOrdersButtonRef.current?.contains(e.target) && !branchOrdersMenuRef.current?.contains(e.target)) {
          setIsBranchOrdersMenuOpen(false);
        }
      }
      if (isSuppliersMenuOpen) {
        if (!suppliersButtonRef.current?.contains(e.target) && !suppliersMenuRef.current?.contains(e.target)) {
          setIsSuppliersMenuOpen(false);
        }
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsSettingsMenuOpen(false);
        setIsPharmacyOrdersMenuOpen(false);
        setIsBranchOrdersMenuOpen(false);
        setIsSuppliersMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, { capture: true });
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsMenuOpen, isPharmacyOrdersMenuOpen, isBranchOrdersMenuOpen, isSuppliersMenuOpen, calculateMenuCoords]);

  // تحديث التبويب التلقائي عند تبديل الدور أو إذا كان التبويب الحالي غير متوافق
  useEffect(() => {
    if (userRole === 'branch') {
      const branchTabs = ['orders', 'branch_orders', 'transferred_orders', 'customers', 'procurement_tracking', 'deficiencies', 'branch_medication_search', 'inquiries', 'restocked_items', 'pharmacy_complaints', 'whatsapp'];
      if (!branchTabs.includes(activeTab)) {
        setActiveTab('orders');
      }
    } else if (userRole === 'procurement' || isProcurementRole) {
      if (allowedProcurementTabs.length > 0 && !allowedProcurementTabs.includes(activeTab)) {
        setActiveTab(allowedProcurementTabs[0]);
      }
    } else if (userRole === 'owner') {
      const ownerTabs = ['owner_financial_reports', 'owner_branches', 'owner_procurement', 'owner_suppliers', 'owner_complaints', 'owner_inquiries', 'owner_team', 'owner_medications', 'owner_customers', 'owner_whatsapp', 'owner_settings'];
      if (!ownerTabs.includes(activeTab)) {
        setActiveTab('owner_branches');
      }
    }
  }, [userRole, isProcurementRole, isCosmeticsOfficer, activeTab]);

  // ── العدادات التنبيهية الحية للنظام (Notification Badges) ──
  const [notificationsSummary, setNotificationsSummary] = useState({
    pendingBranchOrdersCount: 0,
    pendingInquiriesCount: 0,
    branchRepliedInquiriesCount: 0,
    branchReadyOrdersCount: 0,
    branchRestockedItemsCount: 0,
    ownerPendingComplaintsCount: 0
  });

  // نافذة شكاوى الفروع المصعدة للمالك
  const [isOwnerComplaintsModalOpen, setIsOwnerComplaintsModalOpen] = useState(false);

  const fetchNotificationsSummary = useCallback(async () => {
    try {
      const res = await outstockGetNotificationsSummary(effectiveBranchId);
      if (res?.success && res.counts) {
        setNotificationsSummary(res.counts);
      }
    } catch {
      // quiet fail
    }
  }, [effectiveBranchId]);

  useEffect(() => {
    fetchNotificationsSummary();
    const interval = setInterval(fetchNotificationsSummary, 25000);

    const handleRefresh = () => fetchNotificationsSummary();

    const handleBranchOrderReplied = (e) => {
      fetchNotificationsSummary();
      const detail = e?.detail || e;
      if (userRole === 'branch' && (!detail?.branchId || String(detail.branchId) === String(effectiveBranchId))) {
        triggerNotification({
          title: '💬 رد جديد من إدارة المشتريات',
          message: `ورد رد جديد من إدارة المشتريات على طلب الفرع #${detail?.orderId || ''}. يمكنك مراجعته الآن في تبويبة طلبات الفرع.`,
          type: 'info'
        });
      }
    };

    window.addEventListener('outstock:refresh_notifications', handleRefresh);
    window.addEventListener('outstock:order_created', handleRefresh);
    window.addEventListener('outstock:order_updated', handleRefresh);
    window.addEventListener('outstock:item_status_updated', handleRefresh);
    window.addEventListener('outstock:items_status_updated', handleRefresh);
    window.addEventListener('outstock:branch_order_replied', handleBranchOrderReplied);
    window.addEventListener('outstock:medication_request_created', handleRefresh);
    window.addEventListener('outstock:medication_request_replied', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('outstock:refresh_notifications', handleRefresh);
      window.removeEventListener('outstock:order_created', handleRefresh);
      window.removeEventListener('outstock:order_updated', handleRefresh);
      window.removeEventListener('outstock:item_status_updated', handleRefresh);
      window.removeEventListener('outstock:items_status_updated', handleRefresh);
      window.removeEventListener('outstock:branch_order_replied', handleBranchOrderReplied);
      window.removeEventListener('outstock:medication_request_created', handleRefresh);
      window.removeEventListener('outstock:medication_request_replied', handleRefresh);
    };
  }, [fetchNotificationsSummary, effectiveBranchId, userRole, triggerNotification]);

  // التحقق من صحة المستخدم
  useEffect(() => {
    outstockGetMe().then(res => {
      if (res?.success && res.user) {
        if (res.user.role) {
          let r = res.user.role;
          if (r.startsWith('outstock_')) r = r.replace('outstock_', '');
          if (r === 'pharmacy') r = 'branch';
          if (['procurement_manager', 'procurement_officer'].includes(r) || res.user.username === 'admin-stock' || res.user.role === 'procurement_manager') {
            r = 'procurement';
          }
          setUserRole(r);
        }
        if (res.user.branchData) {
          setActiveBranch(res.user.branchData);
        } else if (res.user.branchId) {
          setActiveBranch(prev => ({
            id: res.user.branchId,
            name: res.user.fullName || res.user.name || prev?.name || 'فرع الصيدلية'
          }));
        }
      }
    }).catch(() => {});
  }, []);

  // ── 4. حالة المزامنة اللحظية والعمل في وضع عدم الاتصال (Offline & Sync) ────
  const [syncState, setSyncState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSocketConnected: false,
    isSyncing: false,
    pendingCount: 0
  });

  useEffect(() => {
    initOutstockSyncService();
    const unsub = subscribeToSyncState(setSyncState);
    return unsub;
  }, []);

  // تنفيذ المزامنة الفورية يدوياً
  const handleManualSync = async () => {
    if (syncState.isSyncing) return;
    if (!navigator.onLine) {
      showToast?.('⚠️ الجهاز في وضع الأوفلاين حالياً. ستتم المزامنة تلقائياً فور توفر الاتصال بالإنترنت.');
      return;
    }
    showToast?.('🔄 جاري ترحيل ومزامنة كافة الطلبات المعلقة محلياً مع الخادم...');
    const res = await syncPendingOfflineOrders();
    if (res?.syncedCount > 0) {
      showToast?.(`✅ تم ترحيل ومزامنة ${res.syncedCount} طلب بنجاح.`);
    } else if (res?.count === 0) {
      showToast?.('⚡ كافة البيانات مطابقة ومحدثة بالكامل مع الخادم.');
    }
  };

  // ── 5. الاستماع لاختصارات لوحة المفاتيح المخصصة للنظام ──────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // تجنب مقاطعة الكتابة داخل الحقول النصية ما لم يكن مفتاحاً وظيفياً خاصاً
      const isInput = ['INPUT', 'TEXTAREA'].includes(e.target?.tagName);
      const isSpecial = e.key === 'Escape' || /^F\d{1,2}$/i.test(e.key) || e.altKey;
      if (isInput && !isSpecial) return;

      const shortcuts = getActiveShortcuts();

      // Ctrl+K أو Cmd+K: شريط الأوامر والبحث السريع المركزي
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }

      // F1: دليل الاختصارات
      const helpItem = shortcuts.find(s => s.id === 'help');
      if (helpItem && matchesShortcutEvent(helpItem, e)) {
        e.preventDefault();
        showToast?.('⌨️ اختصارات لوحة المفاتيح:\n• F2 / Alt+N: تسجيل طلب عميل جديد\n• F3 / Alt+F: بحث سريع بالهاتف والاسم\n• F8 / Alt+P: طباعة الفاتورة\n• F9 / Alt+U: مزامنة فورية\n• Alt+1..4: التنقل السريع بين التبويبات\n• Esc: إغلاق النوافذ');
        return;
      }

      // F2 / Alt+N: طلب جديد
      const newOrderItem = shortcuts.find(s => s.id === 'outstockNewOrder');
      if (newOrderItem && matchesShortcutEvent(newOrderItem, e)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('outstock:shortcut_new_order'));
        return;
      }

      // F3 / Alt+F: بحث عن عميل
      const searchItem = shortcuts.find(s => s.id === 'outstockSearchCustomer');
      if (searchItem && matchesShortcutEvent(searchItem, e)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('outstock:shortcut_focus_search'));
        return;
      }

      // F8 / Alt+P: طباعة الفاتورة
      const printItem = shortcuts.find(s => s.id === 'outstockQuickPrint');
      if (printItem && matchesShortcutEvent(printItem, e)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('outstock:shortcut_quick_print'));
        return;
      }

      // F9 / Alt+U: مزامنة فورية
      const syncItem = shortcuts.find(s => s.id === 'outstockSyncNow');
      if (syncItem && matchesShortcutEvent(syncItem, e)) {
        e.preventDefault();
        handleManualSync();
        return;
      }

      // Alt+1: تبويب 1
      const tab1Item = shortcuts.find(s => s.id === 'outstockTab1');
      if (tab1Item && matchesShortcutEvent(tab1Item, e)) {
        e.preventDefault();
        if (userRole === 'branch') setActiveTab('orders');
        else if (userRole === 'procurement') setActiveTab('branch_orders');
        else if (userRole === 'owner') setActiveTab('owner_branches');
        return;
      }

      // Alt+2: تبويب 2
      const tab2Item = shortcuts.find(s => s.id === 'outstockTab2');
      if (tab2Item && matchesShortcutEvent(tab2Item, e)) {
        e.preventDefault();
        if (userRole === 'branch') setActiveTab('customers');
        else if (userRole === 'procurement') setActiveTab('delivery_tracking');
        else if (userRole === 'owner') setActiveTab('owner_procurement');
        return;
      }

      // Alt+3: تبويب 3
      const tab3Item = shortcuts.find(s => s.id === 'outstockTab3');
      if (tab3Item && matchesShortcutEvent(tab3Item, e)) {
        e.preventDefault();
        if (userRole === 'branch') setActiveTab('procurement_tracking');
        else if (userRole === 'procurement') setActiveTab('unavailable_items');
        else if (userRole === 'owner') setActiveTab('owner_customers');
        return;
      }

      // Alt+4: تبويب 4
      const tab4Item = shortcuts.find(s => s.id === 'outstockTab4');
      if (tab4Item && matchesShortcutEvent(tab4Item, e)) {
        e.preventDefault();
        if (userRole === 'branch') setActiveTab('deficiencies');
        else if (userRole === 'procurement') setActiveTab('procurement_whatsapp');
        else if (userRole === 'owner') setActiveTab('owner_settings');
        return;
      }

      // Esc: إغلاق النوافذ المنبثقة والقوائم المنسدلة
      if (e.key === 'Escape') {
        setIsPharmacyOrdersMenuOpen(false);
        setIsBranchOrdersMenuOpen(false);
        setIsSuppliersMenuOpen(false);
        setIsSettingsMenuOpen(false);
        setIsCommandPaletteOpen(false);
        window.dispatchEvent(new CustomEvent('outstock:close_modal'));
        const closeBtn = document.querySelector('.outstock-modal-card .outstock-btn-close, .outstock-modal-panel .outstock-btn-close, .outstock-btn-close');
        if (closeBtn) closeBtn.click();
        return;
      }

      // التنقل بالأسهم بين تبويبات الشريط العلوي والقوائم المنسدلة
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      if (!isInputFocused) {
        // التنقل بالقوائم المنسدلة بالأسهم لأعلى ولأسفل
        const isDropdownOpen = isPharmacyOrdersMenuOpen || isBranchOrdersMenuOpen || isSuppliersMenuOpen || isSettingsMenuOpen;
        if (isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault();
          const dropItems = Array.from(document.querySelectorAll('.outstock-dropdown-item:not([disabled])'));
          if (dropItems.length > 0) {
            const currentIdx = dropItems.findIndex(item => item === activeEl);
            let nextIdx = 0;
            if (e.key === 'ArrowDown') {
              nextIdx = currentIdx < dropItems.length - 1 ? currentIdx + 1 : 0;
            } else {
              nextIdx = currentIdx > 0 ? currentIdx - 1 : dropItems.length - 1;
            }
            dropItems[nextIdx]?.focus();
          }
          return;
        }

        // إذا كان هناك زر قائمة منسدلة مفعل وضغط السهم لأسفل لفتح القائمة
        if (e.key === 'ArrowDown') {
          const focusedNavBtn = activeEl?.closest('.outstock-subnav-btn');
          if (focusedNavBtn && focusedNavBtn.getAttribute('aria-haspopup') === 'true') {
            e.preventDefault();
            focusedNavBtn.click();
            setTimeout(() => {
              const firstDropItem = document.querySelector('.outstock-dropdown-item:not([disabled])');
              firstDropItem?.focus();
            }, 60);
            return;
          }
        }

        // التنقل بالأسهم يميناً ويساراً بين التبويبات العلوية
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const navBtns = Array.from(document.querySelectorAll('.outstock-sub-navbar-container .outstock-subnav-btn:not([disabled])'));
          if (navBtns.length > 0) {
            e.preventDefault();
            const currentIdx = navBtns.findIndex(b => b === activeEl || b.classList.contains('is-active'));
            let nextIdx = 0;
            // بنية RTL: السهم الأيسر يذهب للتبويب التالي والسهم الأيمن للتبويب السابق
            if (e.key === 'ArrowLeft') {
              nextIdx = currentIdx < navBtns.length - 1 ? currentIdx + 1 : 0;
            } else {
              nextIdx = currentIdx > 0 ? currentIdx - 1 : navBtns.length - 1;
            }
            navBtns[nextIdx]?.focus();
            navBtns[nextIdx]?.click();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole, syncState, isBranchOrdersMenuOpen, isSuppliersMenuOpen, isSettingsMenuOpen]);

  return (
    <div className={`outstock-root-shell ${themeMode === 'dark' ? 'dark-mode' : ''} ${isCompactDensity ? 'density-compact' : ''}`}>
      {/* ── الشريط العلوي الفاخر (Top Navigation Ribbon) ── */}
      <header className="outstock-top-header">
        {/* هوية النظام والشعار */}
        <div className="outstock-brand-badge">
          <div className="outstock-brand-icon">
            💊
          </div>
          <div className="outstock-brand-info">
            <h2>نظام إدارة النواقص والمشتريات</h2>
            <p>
              {userRole === 'owner'
                ? 'بوابة المالك والمشرف العام'
                : isProcurementManager
                ? 'بوابة مدير المشتريات (كافة الفروع 🌐)'
                : userRole === 'procurement'
                ? 'بوابة إدارة المشتريات والتوريدات'
                : `بوابة الصيدلية: ${activeBranch?.name || 'الفرع'}`}
            </p>
          </div>
        </div>

        {/* أدوات التحكم والوضع الليلي وتسجيل الخروج */}
        <div className="outstock-user-controls">
          {/* زر تبديل المنظومة والصفحات المصرح بها */}
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            style={{
              padding: '6px 12px',
              borderRadius: '10px',
              background: 'rgba(13, 148, 136, 0.12)',
              color: '#0d9488',
              border: '1px solid rgba(13, 148, 136, 0.3)',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={() => window.dispatchEvent(new CustomEvent('app:open-workspace-switcher', { detail: { user: currentUser } }))}
            title="التبديل بين المنظومات والصفحات المصرح بها (نظام HR، مدير الفرع، الإدارة العليا)"
          >
            <span>🔄</span>
            <span className="outstock-btn-text-desktop">تبديل المنظومة</span>
          </button>

          {/* زر شريط الأوامر السريع العالمي (Command Palette) */}
          <button
            type="button"
            className="outstock-search-shortcut-btn"
            onClick={() => setIsCommandPaletteOpen(true)}
            title="البحث الشامل والأوامر السريعة (Ctrl+K)"
          >
            <Search size={13} />
            <span className="outstock-btn-text-desktop">بحث شامل...</span>
            <span className="outstock-kbd-badge">Ctrl K</span>
          </button>

          {/* زر التبديل بين وضع الكثافة المكثف والمريح */}
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '6px 10px', borderRadius: '10px' }}
            onClick={() => {
              setIsCompactDensity(prev => {
                const next = !prev;
                try { localStorage.setItem('outstock_density', next ? 'compact' : 'comfortable'); } catch {}
                return next;
              });
            }}
            title={isCompactDensity ? 'التبديل إلى العرض المريح (المسافات القياسية)' : 'التبديل إلى العرض المكثف (أجهزة الكاشير السريعة)'}
          >
            <Layers size={14} />
            <span className="outstock-btn-text-desktop">{isCompactDensity ? 'مكثف' : 'مريح'}</span>
          </button>

          {/* مؤشر حالة المزامنة اللحظية والأوفلاين */}
          <div
            className={`outstock-live-badge ${!syncState.isOnline ? 'offline' : ''}`}
            onClick={handleManualSync}
            title={
              !syncState.isOnline
                ? `وضع العمل دون اتصال (أوفلاين) - ${syncState.pendingCount} طلب محفوظ محلياً. اضغط لإعادة المحاولة`
                : syncState.isSyncing
                ? 'جاري ترحيل ومزامنة الطلبات السحابية...'
                : syncState.pendingCount > 0
                ? `${syncState.pendingCount} طلب محلي بانتظار الترحيل. اضغط للمزامنة الفورية`
                : 'متصل لحظياً بخادم المنظومة - المزامنة فورية'
            }
            style={{
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            {syncState.isSyncing ? (
              <>
                <RefreshCw size={12} className="outstock-spin" />
                <span>جاري المزامنة...</span>
              </>
            ) : !syncState.isOnline ? (
              <>
                <WifiOff size={12} />
                <span>أوفلاين {syncState.pendingCount > 0 ? `(${syncState.pendingCount})` : ''}</span>
              </>
            ) : syncState.pendingCount > 0 ? (
              <>
                <RefreshCw size={12} />
                <span>ترحيل ({syncState.pendingCount}) ⚡</span>
              </>
            ) : (
              <>
                <span className="outstock-pulse-dot" />
                <span>متصل لحظياً</span>
              </>
            )}
          </div>

          {/* زر دليل الاختصارات السريعة */}
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '6px 9px', borderRadius: '10px' }}
            onClick={() => {
              showToast?.('⌨️ اختصارات لوحة المفاتيح:\n• F2 / Alt+N: تسجيل طلب عميل جديد\n• F3 / Alt+F: بحث سريع بالهاتف والاسم\n• F8 / Alt+P: طباعة الفاتورة\n• F9 / Alt+U: مزامنة فورية\n• Alt+1..4: التنقل السريع بين التبويبات\n• Esc: إغلاق النوافذ');
            }}
            title="دليل اختصارات لوحة المفاتيح (F1)"
          >
            <Keyboard size={15} />
          </button>

          {/* محاكاة وتغيير الواجهة للمالك (Executive View Switcher) */}
          {initialRole === 'owner' && (
            <select
              value={userRole}
              onChange={(e) => {
                const nextRole = e.target.value;
                setUserRole(nextRole);
                if (nextRole === 'branch') setActiveTab('orders');
                else if (nextRole === 'procurement') setActiveTab('branch_orders');
                else if (nextRole === 'owner') setActiveTab('owner_branches');
              }}
              className="outstock-form-select"
              style={{
                height: '34px',
                fontSize: '11.5px',
                padding: '2px 6px',
                background: '#f0fdfa',
                borderColor: '#0d9488',
                fontWeight: 'bold',
                maxWidth: '125px'
              }}
            >
              <option value="owner">👑 المالك</option>
              <option value="procurement">📦 المشتريات</option>
              <option value="branch">🏥 الفرع</option>
            </select>
          )}

          <div className="outstock-role-pill">
            <Shield size={12} />
            <span>
              {userRole === 'owner'
                ? 'المالك'
                : isProcurementManager
                ? 'مدير مشتريات (كافة الفروع)'
                : userRole === 'procurement'
                ? 'المشتريات'
                : 'الفرع'}
            </span>
          </div>

          {(() => {
            try {
              return sessionStorage.getItem('app_outstock_owner_unlocked') === 'true';
            } catch { return false; }
          })() && (
            <button
              type="button"
              className="outstock-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecdd3',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
              onClick={() => {
                try {
                  sessionStorage.removeItem('app_outstock_owner_unlocked');
                } catch {}
                window.location.reload();
              }}
              title="قفل شاشة النواقص وإعادة طلب تصريح المالك فوراً"
            >
              <Lock size={12} />
              <span>قفل الجلسة</span>
            </button>
          )}

          {toggleTheme && (
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '6px 8px', borderRadius: '10px' }}
              onClick={toggleTheme}
              title="تبديل المظهر"
            >
              {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '6px 10px', borderRadius: '10px', color: '#dc2626' }}
              onClick={onLogout}
              title="تسجيل الخروج"
            >
              <LogOut size={15} />
              <span className="outstock-btn-text-desktop">خروج</span>
            </button>
          )}
        </div>
      </header>

      {/* ── شريط القوائم والتبويبات المخصص (Sub Navigation Bar) على غرار شريط الإدارة العليا في نظام HR ── */}
      <nav className="outstock-sub-navbar" aria-label="أقسام منظومة النواقص">
        <div className="outstock-sub-navbar-container">
          {/* 1. قوائم بوابة الصيدلية */}
          {userRole === 'branch' && (
            <>
              {/* قائمة طلبات الصيدلية المنسدلة (طلبات العملاء، طلبات الفرع، متابعة طلبات المشتريات، الاستعلامات، أصناف أعيد توفرها) */}
              <button
                ref={pharmacyOrdersButtonRef}
                type="button"
                className={`outstock-subnav-btn ${['orders', 'branch_orders', 'transferred_orders', 'procurement_tracking', 'inquiries', 'restocked_items'].includes(activeTab) ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPharmacyOrdersMenuCoords(calculateMenuCoords(pharmacyOrdersButtonRef));
                  setIsPharmacyOrdersMenuOpen(prev => !prev);
                }}
                title="طلبات العملاء، طلبات الفرع، متابعة المشتريات، الاستعلامات، والأصناف التي أعيد توافرها"
                aria-haspopup="true"
                aria-expanded={isPharmacyOrdersMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Package size={16} />
                <span>طلبات</span>
                {(notificationsSummary.branchReadyOrdersCount + (notificationsSummary.branchRestockedItemsCount || 0) + (notificationsSummary.branchRepliedInquiriesCount || 0)) > 0 && (
                  <span className="outstock-nav-badge success" title={`${notificationsSummary.branchReadyOrdersCount} جاهز، ${notificationsSummary.branchRestockedItemsCount || 0} صنف متوفر، ${notificationsSummary.branchRepliedInquiriesCount || 0} رد استعلام`}>
                    {notificationsSummary.branchReadyOrdersCount + (notificationsSummary.branchRestockedItemsCount || 0) + (notificationsSummary.branchRepliedInquiriesCount || 0)}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  style={{
                    transform: isPharmacyOrdersMenuOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: 0.85
                  }}
                />
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'customers' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('customers')}
              >
                <Users size={16} />
                <span>العملاء المسجلين</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'deficiencies' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('deficiencies')}
              >
                <AlertTriangle size={16} />
                <span>أدوية النواقص</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'branch_medication_search' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('branch_medication_search')}
                title="البحث عن صنف أو بديل، كارتة الصنف، إضافة صنف جديد، وتعديل السعر للأعلى فقط"
              >
                <Search size={16} />
                <span>البحث عن صنف والبدائل</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'inquiries' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('inquiries')}
                title="الاستعلام عن الأسعار وتصحيح بيانات الأصناف واعتماد الأدوية الجديدة"
              >
                <HelpCircle size={16} />
                <span>الاستعلام وتصحيح الأصناف</span>
                {notificationsSummary.branchRepliedInquiriesCount > 0 && (
                  <span className="outstock-nav-badge info" title={`${notificationsSummary.branchRepliedInquiriesCount} استعلام تم الرد عليه من المشتريات`}>
                    {notificationsSummary.branchRepliedInquiriesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'whatsapp' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('whatsapp')}
                title="اتصال الواتساب بالفرع وإرسال الرسائل التلقائية للعملاء"
              >
                <MessageSquare size={16} />
                <span>اتصال الواتساب والرسائل</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'pharmacy_complaints' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('pharmacy_complaints')}
                title="متابعة الشكاوى المصعدة للمالك وتتبع ردود المشتريات والقرارات"
              >
                <AlertTriangle size={16} />
                <span>شكاوى وتصعيد النواقص</span>
              </button>
            </>
          )}

          {/* 2. قوائم بوابة إدارة المشتريات */}
          {(userRole === 'procurement' || isProcurementRole) && (
            <>
              {/* قائمة طلبات الفروع المجمعة / طلبات مستحضرات التجميل المنسدلة الذكية */}
              {filteredBranchOrdersSubsections.length > 0 && (
                <button
                  ref={branchOrdersButtonRef}
                  type="button"
                  className={`outstock-subnav-btn ${['branch_orders', 'procurement_inquiries', 'delivery_tracking', 'unavailable_items'].includes(activeTab) ? 'is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBranchOrdersMenuCoords(calculateMenuCoords(branchOrdersButtonRef));
                    setIsBranchOrdersMenuOpen(prev => !prev);
                    if (isSuppliersMenuOpen) setIsSuppliersMenuOpen(false);
                  }}
                  title={isCosmeticsOfficer ? "طلبات مستحضرات التجميل المجمعة، الاستعلام وتصحيح الأصناف، متابعة التسليم، والأصناف غير المتوفرة بالسوق" : "طلبات الفروع المجمعة، الاستعلام وتصحيح الأصناف، متابعة التسليم، والأصناف غير المتوفرة بالسوق"}
                  aria-haspopup="true"
                  aria-expanded={isBranchOrdersMenuOpen}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isCosmeticsOfficer ? <Sparkles size={16} /> : <Building2 size={16} />}
                  <span>{isCosmeticsOfficer ? 'طلبات مستحضرات التجميل 💄' : 'طلبات الفروع المجمعة'}</span>
                  {(notificationsSummary.pendingBranchOrdersCount + notificationsSummary.pendingInquiriesCount) > 0 && (
                    <span className="outstock-nav-badge" title={`${notificationsSummary.pendingBranchOrdersCount} طلب فرع جديد و ${notificationsSummary.pendingInquiriesCount} استعلام معلق`}>
                      {notificationsSummary.pendingBranchOrdersCount + notificationsSummary.pendingInquiriesCount}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isBranchOrdersMenuOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      opacity: 0.85
                    }}
                  />
                </button>
              )}

              {/* قائمة الموردين وفواتير الشراء المنسدلة الذكية */}
              {canAccessSuppliersTab && (
                <button
                  ref={suppliersButtonRef}
                  type="button"
                  className={`outstock-subnav-btn ${activeTab === 'procurement_suppliers' ? 'is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSuppliersMenuCoords(calculateMenuCoords(suppliersButtonRef));
                    setIsSuppliersMenuOpen(prev => !prev);
                    if (isBranchOrdersMenuOpen) setIsBranchOrdersMenuOpen(false);
                  }}
                  title="حسابات الموردين وحدود الائتمان وفواتير الشراء ومسحوبات الفروع ومقارنة الخصومات و i'SUPPLY"
                  aria-haspopup="true"
                  aria-expanded={isSuppliersMenuOpen}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Truck size={16} />
                  <span>{isCosmeticsOfficer ? 'موردي مستحضرات التجميل والفواتير' : 'الموردين وفواتير الشراء'}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isSuppliersMenuOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                      opacity: 0.85
                    }}
                  />
                </button>
              )}

              {canManageTeam && (
                <button
                  type="button"
                  className={`outstock-subnav-btn ${activeTab === 'procurement_team' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('procurement_team')}
                  title="إدارة أعضاء فريق المشتريات وصلاحية التعديل على الأصناف وقفل وتفعيل أسعار الفروع"
                >
                  <UserCheck size={16} />
                  <span>فريق المشتريات والصلاحيات</span>
                </button>
              )}

              {canAccessProcurementWhatsApp && (
                <button
                  type="button"
                  className={`outstock-subnav-btn ${activeTab === 'procurement_whatsapp' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('procurement_whatsapp')}
                  title="مراسلة هواتف الفروع بالواتساب وإشعارات الشحن والنواقص"
                >
                  <MessageSquare size={16} />
                  <span>واتساب الفروع</span>
                </button>
              )}

              {canAccessMedicationsCatalog && (
                <button
                  type="button"
                  className={`outstock-subnav-btn ${activeTab === 'procurement_medications' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('procurement_medications')}
                  title={isCosmeticsOfficer ? "كتالوج وتسعير مستحضرات التجميل والأصناف" : "كتالوج وتسعير الأدوية وهيئة الدواء ودراج آي"}
                >
                  {isCosmeticsOfficer ? <Sparkles size={16} /> : <Pill size={16} />}
                  <span>{isCosmeticsOfficer ? 'كتالوج مستحضرات التجميل 💄' : 'كتالوج وتسعير الأدوية'}</span>
                </button>
              )}

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'procurement_complaints' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('procurement_complaints')}
                title="استعراض ومتابعة شكاوى الفروع بخصوص تأخر التوريد والرد عليها وتوضيح أسباب التأخير للمالك"
              >
                <AlertTriangle size={16} />
                <span>شكاوى الفروع</span>
              </button>
            </>
          )}

          {/* 3. قوائم بوابة المالك (7 قوائم) */}
          {userRole === 'owner' && (
            <>
              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_financial_reports' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_financial_reports')}
                title="متابعة التقارير المالية ومبيعات الفروع والعربونات ونواقص السوق"
              >
                <BarChart3 size={16} />
                <span>التقارير المالية والأرباح</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_branches' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_branches')}
              >
                <Building2 size={16} />
                <span>طلبات الفروع وأرصدتها</span>
                {notificationsSummary.pendingBranchOrdersCount > 0 && (
                  <span className="outstock-nav-badge" title={`${notificationsSummary.pendingBranchOrdersCount} طلب بانتظار التوريد`}>
                    {notificationsSummary.pendingBranchOrdersCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_procurement' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_procurement')}
              >
                <TrendingUp size={16} />
                <span>متابعة إدارة المشتريات</span>
              </button>

              <button
                ref={userRole === 'owner' ? suppliersButtonRef : undefined}
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_suppliers' ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSuppliersMenuCoords(calculateMenuCoords(suppliersButtonRef));
                  setIsSuppliersMenuOpen(prev => !prev);
                  if (isSettingsMenuOpen) setIsSettingsMenuOpen(false);
                }}
                title="حسابات الموردين وفواتير الشراء والمسحوبات ومقارنة الخصومات و i'SUPPLY"
                aria-haspopup="true"
                aria-expanded={isSuppliersMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Truck size={16} />
                <span>الموردين وفواتير الشراء</span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: isSuppliersMenuOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: 0.85
                  }}
                />
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_complaints' ? 'is-active' : ''}`}
                style={{
                  background: notificationsSummary.ownerPendingComplaintsCount > 0 ? '#fef2f2' : undefined,
                  color: notificationsSummary.ownerPendingComplaintsCount > 0 ? '#b91c1c' : undefined,
                  border: notificationsSummary.ownerPendingComplaintsCount > 0 ? '1.5px solid #fca5a5' : undefined
                }}
                onClick={() => setActiveTab('owner_complaints')}
                title="استعراض ومتابعة شكاوى الفروع المصعدة للمالك بخصوص تأخر الرد أو عدم توفر الصنف"
              >
                <AlertTriangle size={16} color={notificationsSummary.ownerPendingComplaintsCount > 0 ? '#dc2626' : undefined} />
                <span>شكاوى الفروع المصعدة</span>
                {notificationsSummary.ownerPendingComplaintsCount > 0 && (
                  <span className="outstock-nav-badge warning" style={{ background: '#dc2626' }} title={`${notificationsSummary.ownerPendingComplaintsCount} شكوى معلقة`}>
                    {notificationsSummary.ownerPendingComplaintsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_inquiries' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_inquiries')}
                title="استعلامات الفروع وتصحيح الأصناف"
              >
                <HelpCircle size={16} />
                <span>استعلامات وتصحيح الأصناف</span>
                {notificationsSummary.pendingInquiriesCount > 0 && (
                  <span className="outstock-nav-badge warning" title={`${notificationsSummary.pendingInquiriesCount} استعلام معلق`}>
                    {notificationsSummary.pendingInquiriesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_team' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_team')}
                title="فريق المشتريات والصلاحيات"
              >
                <UserCheck size={16} />
                <span>فريق المشتريات والصلاحيات</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_medications' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_medications')}
                title="كتالوج وتسعير الأدوية وهيئة الدواء ودراج آي"
              >
                <Pill size={16} />
                <span>كتالوج وتسعير الأدوية</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_customers' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_customers')}
              >
                <Users size={16} />
                <span>دليل العملاء المركزي</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_whatsapp' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_whatsapp')}
                title="مركز الواتساب والرسائل التلقائية لعملاء الفروع"
              >
                <MessageSquare size={16} />
                <span>مركز الواتساب</span>
              </button>

              {/* تبويبة وقائمة الإعدادات والصلاحيات المنسدلة الذكية */}
              <button
                ref={settingsButtonRef}
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'owner_settings' ? 'is-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeTab !== 'owner_settings') {
                    setActiveTab('owner_settings');
                    setIsSettingsMenuOpen(true);
                  } else {
                    setIsSettingsMenuOpen(prev => !prev);
                  }
                }}
                title="إعدادات وصلاحيات وهوية النظام والفروع"
                aria-haspopup="true"
                aria-expanded={isSettingsMenuOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Settings size={16} />
                <span>الإعدادات والصلاحيات</span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: isSettingsMenuOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: 0.85
                  }}
                />
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── جسم الشاشة ومحتوى التبويبات ── */}
      <main className="outstock-content-body">
        {/* ── أ) تبويبات الصيدلية ── */}
        {userRole === 'branch' && (
          <>
            {activeTab === 'orders' && (
              <PharmacyOrdersTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'branch_orders' && (
              <BranchStockOrdersTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'customers' && (
              <PharmacyCustomersTab
                branchId={effectiveBranchId}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'procurement_tracking' && (
              <PharmacyProcurementTrackingTab
                branchId={effectiveBranchId}
              />
            )}

            {activeTab === 'deficiencies' && (
              <PharmacyDeficienciesTab
                branchId={effectiveBranchId}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'branch_medication_search' && (
              <PharmacyMedicationSearchTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'inquiries' && (
              <ItemInquiryAndCorrectionTab
                userRole="branch"
                branchId={effectiveBranchId}
                currentBranch={activeBranch}
                currentUser={currentUser}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'restocked_items' && (
              <PharmacyRestockedItemsTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'transferred_orders' && (
              <PharmacyOrdersTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
                initialInnerTab="transferred"
              />
            )}

            {activeTab === 'pharmacy_complaints' && (
              <PharmacyComplaintsTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'whatsapp' && (
              <OutstockWhatsAppCenterTab
                branchId={effectiveBranchId}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                showToast={triggerNotification}
              />
            )}
          </>
        )}

        {/* ── ب) تبويبات إدارة المشتريات ── */}
        {(userRole === 'procurement' || isProcurementRole) && (
          <>
            {activeTab === 'branch_orders' && (
              <ProcurementOrdersTab
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'procurement_suppliers' && canAccessSuppliersTab && (
              <ProcurementSuppliersTab
                initialSubTab={suppliersActiveSubTab}
                currentUser={currentUser}
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'procurement_inquiries' && (
              <ItemInquiryAndCorrectionTab
                userRole={currentUser?.role === 'procurement_manager' || currentUser?.username === 'admin-stock' ? 'procurement_manager' : 'procurement_officer'}
                branchId={effectiveBranchId}
                currentBranch={activeBranch}
                currentUser={currentUser}
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'delivery_tracking' && (
              <ProcurementDeliveryTrackingTab
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'unavailable_items' && (
              <ProcurementUnavailableTab
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'procurement_team' && canManageTeam && (
              <ProcurementTeamTab
                showToast={triggerNotification}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'procurement_whatsapp' && canAccessProcurementWhatsApp && (
              <ProcurementWhatsAppCenterTab
                currentOfficer={currentUser?.fullName || currentUser?.name || 'مسؤول المشتريات'}
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'procurement_medications' && canAccessMedicationsCatalog && (
              <OwnerMedicationsPricingTab
                showToast={triggerNotification}
                categoryScope={isCosmeticsOfficer ? 'cosmetics' : null}
              />
            )}

            {activeTab === 'procurement_complaints' && (
              <ProcurementComplaintsTab
                currentUser={currentUser}
                showToast={triggerNotification}
              />
            )}

            {/* حالة عدم وجود أي صفحات مصرح بها للمستخدم */}
            {allowedProcurementTabs.length === 0 && (
              <div style={{
                padding: '60px 24px',
                textAlign: 'center',
                background: '#ffffff',
                borderRadius: '16px',
                margin: '40px auto',
                maxWidth: '560px',
                border: '1.5px dashed #cbd5e1',
                boxShadow: '0 10px 25px rgba(0,0,0,0.03)'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  color: '#64748b'
                }}>
                  <Lock size={32} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', marginBottom: '8px' }}>
                  لا توجد صفحات مفعلة لحسابك حالياً
                </h3>
                <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: '1.6', margin: 0 }}>
                  تم تسجيل دخولك بنجاح ولكن لم يتم تعيين صلاحيات وصول لصفحات المشتريات أو مستحضرات التجميل لحسابك بعد. يرجى مراجعة إدارة المشتريات أو مالك النظام لتفعيل الصلاحيات المناسبة.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── ج) تبويبات المالك لكافة الفروع ── */}
        {userRole === 'owner' && (
          <>
            {activeTab === 'owner_financial_reports' && (
              <OwnerFinancialReportsTab showToast={triggerNotification} />
            )}

            {activeTab === 'owner_complaints' && (
              <OwnerComplaintsTab
                currentUser={currentUser}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'owner_branches' && (
              <OwnerBranchOrdersTab showToast={triggerNotification} />
            )}

            {activeTab === 'owner_procurement' && (
              <OwnerProcurementMonitoringTab />
            )}

            {activeTab === 'owner_suppliers' && (
              <ProcurementSuppliersTab initialSubTab={suppliersActiveSubTab} currentUser={currentUser} showToast={triggerNotification} />
            )}

            {activeTab === 'owner_inquiries' && (
              <ItemInquiryAndCorrectionTab
                userRole="owner"
                branchId={effectiveBranchId}
                currentBranch={activeBranch}
                currentUser={currentUser}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'owner_team' && (
              <ProcurementTeamTab
                showToast={triggerNotification}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'owner_medications' && (
              <OwnerMedicationsPricingTab showToast={triggerNotification} />
            )}

            {activeTab === 'owner_customers' && (
              <OwnerCustomersDirectoryTab />
            )}

            {activeTab === 'owner_whatsapp' && (
              <OutstockWhatsAppCenterTab
                branchId={activeBranch?.id || 'main'}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || currentUser?.name || 'المالك / المدير'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'owner_settings' && (
              <OwnerSettingsTab
                showToast={triggerNotification}
                activeSubSectionProp={ownerSettingsSection}
                onSubSectionChange={setOwnerSettingsSection}
              />
            )}
          </>
        )}
      </main>

      {/* ── قائمة الانتقال لأقسام الإعدادات والصلاحيات المنسدلة الاحترافية (Portal) ── */}
      {isSettingsMenuOpen && createPortal(
        <div
          ref={settingsMenuRef}
          className="outstock-settings-dropdown-portal"
          style={{
            position: 'fixed',
            top: `${menuCoords.top}px`,
            left: `${menuCoords.left}px`,
            width: `${menuCoords.width}px`,
            maxHeight: `${menuCoords.maxHeight}px`,
            zIndex: 99999
          }}
        >
          {/* سهم المؤشر الأنيق المتطابق مع منتصف الزر */}
          <div
            className="outstock-dropdown-arrow"
            style={{
              left: `${menuCoords.arrowOffset}px`
            }}
          />

          {/* ترويسة القائمة المنسدلة */}
          <div className="outstock-dropdown-header">
            <div className="outstock-dropdown-header-title">
              <Settings size={15} className="outstock-dropdown-header-icon" />
              <span>الانتقال إلى قسم إعدادات آخر</span>
            </div>
            <span className="outstock-dropdown-header-badge">
              {OWNER_SETTINGS_SUBSECTIONS.length} أقسام
            </span>
          </div>

          {/* قائمة الأقسام القابلة للتحديد */}
          <div className="outstock-dropdown-list">
            {OWNER_SETTINGS_SUBSECTIONS.map((sub) => {
              const isCurrent = activeTab === 'owner_settings' && ownerSettingsSection === sub.id;
              const IconComp = sub.icon;
              return (
                <button
                  key={sub.id}
                  type="button"
                  className={`outstock-dropdown-item ${isCurrent ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveTab('owner_settings');
                    setOwnerSettingsSection(sub.id);
                    setIsSettingsMenuOpen(false);
                  }}
                >
                  <div className={`outstock-dropdown-item-icon ${isCurrent ? 'is-active' : ''}`}>
                    <IconComp size={18} />
                  </div>
                  <div className="outstock-dropdown-item-text">
                    <span className="outstock-dropdown-item-title">{sub.title}</span>
                    <span className="outstock-dropdown-item-desc">{sub.desc}</span>
                  </div>
                  {isCurrent && (
                    <div className="outstock-dropdown-item-check" title="القسم المعروض حالياً">
                      <Check size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* ── قائمة الانتقال لأقسام طلبات الصيدلية المنسدلة (Portal) ── */}
      {isPharmacyOrdersMenuOpen && (() => {
        const coords = pharmacyOrdersMenuCoords || calculateMenuCoords(pharmacyOrdersButtonRef);
        if (!coords) return null;
        return createPortal(
          <div
            ref={pharmacyOrdersMenuRef}
            className="outstock-settings-dropdown-portal outstock-dropdown-portal"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999
            }}
          >
            <div
              className="outstock-dropdown-arrow"
              style={{
                left: `${coords.arrowOffset}px`
              }}
            />
            <div className="outstock-dropdown-header">
              <div className="outstock-dropdown-header-title">
                <Package size={15} className="outstock-dropdown-header-icon" />
                <span>إدارة طلبات وتوريدات الصيدلية</span>
              </div>
              <span className="outstock-dropdown-header-badge">
                {PHARMACY_ORDERS_SUBSECTIONS.length} أقسام
              </span>
            </div>
            <div className="outstock-dropdown-list">
              {PHARMACY_ORDERS_SUBSECTIONS.map((sub) => {
                const isCurrent = activeTab === sub.id;
                const IconComp = sub.icon;
                const badgeCount = sub.id === 'procurement_tracking'
                  ? notificationsSummary.branchReadyOrdersCount
                  : sub.id === 'inquiries'
                  ? notificationsSummary.branchRepliedInquiriesCount
                  : sub.id === 'restocked_items'
                  ? (notificationsSummary.branchRestockedItemsCount || 0)
                  : 0;

                const badgeType = sub.id === 'inquiries' ? 'info' : 'success';
                const badgeSuffix = sub.id === 'procurement_tracking'
                  ? 'جاهز'
                  : sub.id === 'inquiries'
                  ? 'رد جديد'
                  : 'متوفر';

                return (
                  <button
                    key={sub.id}
                    type="button"
                    className={`outstock-dropdown-item ${isCurrent ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveTab(sub.id);
                      setIsPharmacyOrdersMenuOpen(false);
                    }}
                  >
                    <div className={`outstock-dropdown-item-icon ${isCurrent ? 'is-active' : ''}`}>
                      <IconComp size={18} />
                    </div>
                    <div className="outstock-dropdown-item-text">
                      <span className="outstock-dropdown-item-title">{sub.title}</span>
                      <span className="outstock-dropdown-item-desc">{sub.desc}</span>
                    </div>
                    {badgeCount > 0 && (
                      <span className={`outstock-dropdown-item-badge ${badgeType}`}>
                        {badgeCount} {badgeSuffix}
                      </span>
                    )}
                    {isCurrent && (
                      <div className="outstock-dropdown-item-check" title="القسم المعروض حالياً">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── قائمة الانتقال لأقسام طلبات الفروع المجمعة المنسدلة (Portal) ── */}
      {isBranchOrdersMenuOpen && (() => {
        const coords = branchOrdersMenuCoords || calculateMenuCoords(branchOrdersButtonRef);
        if (!coords) return null;
        return createPortal(
          <div
            ref={branchOrdersMenuRef}
            className="outstock-settings-dropdown-portal outstock-dropdown-portal"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999
            }}
          >
            <div
              className="outstock-dropdown-arrow"
              style={{
                left: `${coords.arrowOffset}px`
              }}
            />
            <div className="outstock-dropdown-header">
              <div className="outstock-dropdown-header-title">
                <Building2 size={15} className="outstock-dropdown-header-icon" />
                <span>إدارة طلبات واستعلامات الفروع</span>
              </div>
              <span className="outstock-dropdown-header-badge">
                {filteredBranchOrdersSubsections.length} أقسام
              </span>
            </div>
            <div className="outstock-dropdown-list">
              {filteredBranchOrdersSubsections.map((sub) => {
                const isCurrent = activeTab === sub.id;
                const IconComp = sub.icon;
                const badgeCount = sub.id === 'branch_orders'
                  ? notificationsSummary.pendingBranchOrdersCount
                  : sub.id === 'procurement_inquiries'
                  ? notificationsSummary.pendingInquiriesCount
                  : 0;

                return (
                  <button
                    key={sub.id}
                    type="button"
                    className={`outstock-dropdown-item ${isCurrent ? 'is-active' : ''}`}
                    onClick={() => {
                      setActiveTab(sub.id);
                      setIsBranchOrdersMenuOpen(false);
                    }}
                  >
                    <div className={`outstock-dropdown-item-icon ${isCurrent ? 'is-active' : ''}`}>
                      <IconComp size={18} />
                    </div>
                    <div className="outstock-dropdown-item-text">
                      <span className="outstock-dropdown-item-title">{sub.title}</span>
                      <span className="outstock-dropdown-item-desc">{sub.desc}</span>
                    </div>
                    {badgeCount > 0 && (
                      <span className={`outstock-dropdown-item-badge ${sub.id === 'procurement_inquiries' ? 'warning' : ''}`}>
                        {badgeCount} جديد
                      </span>
                    )}
                    {isCurrent && (
                      <div className="outstock-dropdown-item-check" title="القسم المعروض حالياً">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── قائمة الانتقال لأقسام الموردين وفواتير الشراء المنسدلة (Portal) ── */}
      {isSuppliersMenuOpen && (() => {
        const coords = suppliersMenuCoords || calculateMenuCoords(suppliersButtonRef);
        if (!coords) return null;
        return createPortal(
          <div
            ref={suppliersMenuRef}
            className="outstock-settings-dropdown-portal outstock-dropdown-portal"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999
            }}
          >
            <div
              className="outstock-dropdown-arrow"
              style={{
                left: `${coords.arrowOffset}px`
              }}
            />
            <div className="outstock-dropdown-header">
              <div className="outstock-dropdown-header-title">
                <Truck size={15} className="outstock-dropdown-header-icon" />
                <span>إدارة الموردين وفواتير الشراء</span>
              </div>
              <span className="outstock-dropdown-header-badge">
                {filteredSuppliersSubsections.length} أقسام
              </span>
            </div>
            <div className="outstock-dropdown-list">
              {filteredSuppliersSubsections.map((sub) => {
                const isCurrent = (activeTab === 'procurement_suppliers' || activeTab === 'owner_suppliers') && suppliersActiveSubTab === sub.id;
                const IconComp = sub.icon;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    className={`outstock-dropdown-item ${isCurrent ? 'is-active' : ''}`}
                    onClick={() => {
                      if (userRole === 'owner') {
                        setActiveTab('owner_suppliers');
                      } else {
                        setActiveTab('procurement_suppliers');
                      }
                      setSuppliersActiveSubTab(sub.id);
                      setIsSuppliersMenuOpen(false);
                    }}
                  >
                    <div className={`outstock-dropdown-item-icon ${isCurrent ? 'is-active' : ''}`}>
                      <IconComp size={18} />
                    </div>
                    <div className="outstock-dropdown-item-text">
                      <span className="outstock-dropdown-item-title">{sub.title}</span>
                      <span className="outstock-dropdown-item-desc">{sub.desc}</span>
                    </div>
                    {isCurrent && (
                      <div className="outstock-dropdown-item-check" title="القسم المعروض حالياً">
                        <Check size={14} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── شريط الأوامر السريع المركزي (Command Palette HUD) ── */}
      <OutstockCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tabId, subTabId) => {
          setActiveTab(tabId);
          if (subTabId) setSuppliersActiveSubTab(subTabId);
        }}
        userRole={userRole}
      />

      {/* ── نافذة الإشعارات والتنبيهات المنبثقة الاحترافية ── */}
      {activeNotification && (
        <OutstockNotificationModal
          notification={activeNotification}
          onClose={() => setActiveNotification(null)}
        />
      )}

      {/* ── نافذة شكاوى الفروع المصعدة للمالك ── */}
      {isOwnerComplaintsModalOpen && (
        <OwnerComplaintsModal
          onClose={() => {
            setIsOwnerComplaintsModalOpen(false);
            fetchNotificationsSummary();
          }}
          showToast={triggerNotification}
        />
      )}
    </div>
  );
}
