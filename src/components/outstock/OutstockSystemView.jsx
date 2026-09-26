import React, { useState, useEffect } from 'react';
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
  Key
} from 'lucide-react';
import OutstockNotificationModal from './common/OutstockNotificationModal';
import { outstockGetMe } from '../../utils/outstockApiClient';
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
  const [userRole, setUserRole] = useState(() => {
    let r = initialRole || 'owner';
    if (r.startsWith('outstock_')) {
      r = r.replace('outstock_', '');
    }
    if (r === 'pharmacy') r = 'branch';
    return r;
  });

  const [activeBranch, setActiveBranch] = useState(currentBranch || currentUser?.branchData || {
    id: currentUser?.branchId || currentUser?.branch_id || currentUser?.id || 'main',
    name: currentUser?.fullName || currentUser?.name || 'فرع الصيدلية الرئيسي'
  });

  const effectiveBranchId = activeBranch?.id || currentUser?.branchId || currentUser?.branch_id || currentUser?.id || 'main';

  // التبويب النشط
  const [activeTab, setActiveTab] = useState(() => {
    if (userRole === 'branch') return 'orders';
    if (userRole === 'procurement') return 'branch_orders';
    return 'owner_branches';
  });

  // قائمة الأقسام الفرعية لصفحة الإعدادات والصلاحيات للمالك
  const OWNER_SETTINGS_SUBSECTIONS = [
    { id: 'pharmacy_identity', title: 'هوية وشعار الصيدلية بالفاتورة', icon: ImageIcon },
    { id: 'delivery_zones', title: 'إدارة مناطق وأحياء التوصيل', icon: MapPin },
    { id: 'branches', title: 'إدارة وتفعيل الفروع والصيدليات', icon: Building2 },
    { id: 'procurement_users', title: 'يوزرات إدارة المشتريات والصلاحيات', icon: Users },
    { id: 'security', title: 'تأمين حساب المالك وكلمة المرور', icon: Key },
    { id: 'shortcuts', title: 'تخصيص اختصارات لوحة المفاتيح', icon: Keyboard }
  ];

  // ── نظام الإشعارات المنبثقة الاحترافية داخل النظام ──
  const [activeNotification, setActiveNotification] = useState(null);

  const triggerNotification = (msgOrObj) => {
    if (!msgOrObj) return;
    if (typeof msgOrObj === 'string') {
      setActiveNotification({ message: msgOrObj });
    } else {
      setActiveNotification(msgOrObj);
    }
  };

  // استماع للحدث الموحد من أي مكان بالنظام
  useEffect(() => {
    const handleOutstockNotify = (e) => {
      const detail = e?.detail || e;
      if (detail) triggerNotification(detail);
    };
    window.addEventListener('outstock:notify', handleOutstockNotify);
    return () => window.removeEventListener('outstock:notify', handleOutstockNotify);
  }, []);

  // قسم إعدادات المالك والقائمة المنسدلة
  const [ownerSettingsSection, setOwnerSettingsSection] = useState('pharmacy_identity');
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const settingsDropdownRef = React.useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target)) {
        setIsSettingsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // تحديث التبويب التلقائي عند تبديل الدور
  useEffect(() => {
    if (userRole === 'branch') {
      setActiveTab('orders');
    } else if (userRole === 'procurement') {
      setActiveTab('branch_orders');
    } else if (userRole === 'owner') {
      setActiveTab('owner_branches');
    }
  }, [userRole]);

  // التحقق من صحة المستخدم
  useEffect(() => {
    outstockGetMe().then(res => {
      if (res?.success && res.user) {
        if (res.user.role) {
          let r = res.user.role;
          if (r.startsWith('outstock_')) r = r.replace('outstock_', '');
          if (r === 'pharmacy') r = 'branch';
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole, syncState]);

  return (
    <div className={`outstock-root-shell ${themeMode === 'dark' ? 'dark-mode' : ''}`}>
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
              {userRole === 'owner' ? 'بوابة المالك والمشرف العام' : userRole === 'procurement' ? 'بوابة إدارة المشتريات والتوريدات' : `بوابة الصيدلية: ${activeBranch?.name || 'الفرع'}`}
            </p>
          </div>
        </div>

        {/* أدوات التحكم والوضع الليلي وتسجيل الخروج */}
        <div className="outstock-user-controls">
          {/* مؤشر حالة المزامنة اللحظية والأوفلاين */}
          <div
            className={`outstock-sync-pill ${!syncState.isOnline ? 'offline' : syncState.isSyncing || syncState.pendingCount > 0 ? 'syncing' : 'online'}`}
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 11px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: '800',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all 0.2s ease',
              border: '1.5px solid',
              background: !syncState.isOnline
                ? '#fef2f2'
                : syncState.isSyncing || syncState.pendingCount > 0
                ? '#fffbeb'
                : '#f0fdf4',
              color: !syncState.isOnline
                ? '#b91c1c'
                : syncState.isSyncing || syncState.pendingCount > 0
                ? '#b45309'
                : '#15803d',
              borderColor: !syncState.isOnline
                ? '#fca5a5'
                : syncState.isSyncing || syncState.pendingCount > 0
                ? '#fcd34d'
                : '#86efac'
            }}
          >
            {syncState.isSyncing ? (
              <>
                <RefreshCw size={13} className="outstock-spin" />
                <span>جاري المزامنة...</span>
              </>
            ) : !syncState.isOnline ? (
              <>
                <WifiOff size={13} />
                <span>أوفلاين {syncState.pendingCount > 0 ? `(${syncState.pendingCount})` : ''}</span>
              </>
            ) : syncState.pendingCount > 0 ? (
              <>
                <RefreshCw size={13} />
                <span>ترحيل ({syncState.pendingCount}) ⚡</span>
              </>
            ) : (
              <>
                <Wifi size={13} />
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
              onChange={(e) => setUserRole(e.target.value)}
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
            <span>{userRole === 'owner' ? 'المالك' : userRole === 'procurement' ? 'المشتريات' : 'الفرع'}</span>
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
          {/* 1. قوائم بوابة الصيدلية (6 قوائم) */}
          {userRole === 'branch' && (
            <>
              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'orders' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                <Package size={16} />
                <span>طلبات العملاء</span>
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
                className={`outstock-subnav-btn ${activeTab === 'procurement_tracking' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('procurement_tracking')}
              >
                <Clock size={16} />
                <span>متابعة طلبات المشتريات</span>
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
                className={`outstock-subnav-btn ${activeTab === 'whatsapp' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('whatsapp')}
                title="اتصال الواتساب بالفرع وإرسال الرسائل التلقائية للعملاء"
              >
                <MessageSquare size={16} />
                <span>اتصال الواتساب والرسائل</span>
              </button>
            </>
          )}

          {/* 2. قوائم بوابة إدارة المشتريات (5 قوائم) */}
          {userRole === 'procurement' && (
            <>
              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'branch_orders' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('branch_orders')}
              >
                <Building2 size={16} />
                <span>طلبات الفروع المجمعة</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'delivery_tracking' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('delivery_tracking')}
              >
                <Activity size={16} />
                <span>متابعة تسليم الأصناف</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'unavailable_items' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('unavailable_items')}
              >
                <AlertTriangle size={16} />
                <span>أصناف غير متوفرة بالسوق</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'procurement_whatsapp' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('procurement_whatsapp')}
                title="مراسلة هواتف الفروع بالواتساب وإشعارات الشحن والنواقص"
              >
                <MessageSquare size={16} />
                <span>واتساب الفروع</span>
              </button>

              <button
                type="button"
                className={`outstock-subnav-btn ${activeTab === 'procurement_medications' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('procurement_medications')}
                title="كتالوج وتسعير الأدوية وهيئة الدواء ودراج آي"
              >
                <Pill size={16} />
                <span>كتالوج وتسعير الأدوية</span>
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

              {/* قائمة الإعدادات والصلاحيات المنسدلة */}
              <div
                ref={settingsDropdownRef}
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={() => setIsSettingsMenuOpen(true)}
                onMouseLeave={() => setIsSettingsMenuOpen(false)}
              >
                <button
                  type="button"
                  className={`outstock-subnav-btn ${activeTab === 'owner_settings' ? 'is-active' : ''}`}
                  onClick={() => {
                    setActiveTab('owner_settings');
                    setIsSettingsMenuOpen(prev => !prev);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Settings size={16} />
                  <span>الإعدادات والصلاحيات</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isSettingsMenuOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease'
                    }}
                  />
                </button>

                {isSettingsMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      minWidth: '260px',
                      background: '#ffffff',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '14px',
                      boxShadow: '0 16px 36px rgba(0, 0, 0, 0.16)',
                      zIndex: 9999,
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      animation: 'outstockFadeIn 0.15s ease'
                    }}
                  >
                    <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: '800', color: '#94a3b8', borderBottom: '1px solid #f1f5f9', marginBottom: '2px' }}>
                      ⚙️ أقسام الإعدادات والصلاحيات:
                    </div>
                    {OWNER_SETTINGS_SUBSECTIONS.map((sub) => {
                      const isCurrent = activeTab === 'owner_settings' && ownerSettingsSection === sub.id;
                      const IconComponent = sub.icon;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            setActiveTab('owner_settings');
                            setOwnerSettingsSection(sub.id);
                            setIsSettingsMenuOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '9px 12px',
                            borderRadius: '9px',
                            border: isCurrent ? '1.5px solid #99f6e4' : '1.5px solid transparent',
                            background: isCurrent ? '#f0fdfa' : 'transparent',
                            color: isCurrent ? '#0f766e' : '#334155',
                            fontWeight: isCurrent ? '800' : '600',
                            fontSize: '12.5px',
                            cursor: 'pointer',
                            textAlign: 'right',
                            width: '100%',
                            transition: 'all 0.12s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isCurrent) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <IconComponent size={16} color={isCurrent ? '#0d9488' : '#64748b'} />
                          <span style={{ flex: 1 }}>{sub.title}</span>
                          {isCurrent && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0d9488' }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
        {userRole === 'procurement' && (
          <>
            {activeTab === 'branch_orders' && (
              <ProcurementOrdersTab showToast={triggerNotification} />
            )}

            {activeTab === 'delivery_tracking' && (
              <ProcurementDeliveryTrackingTab />
            )}

            {activeTab === 'unavailable_items' && (
              <ProcurementUnavailableTab showToast={triggerNotification} />
            )}

            {activeTab === 'procurement_whatsapp' && (
              <ProcurementWhatsAppCenterTab
                currentOfficer={currentUser?.fullName || currentUser?.name || 'مسؤول المشتريات'}
                showToast={triggerNotification}
              />
            )}

            {activeTab === 'procurement_medications' && (
              <OwnerMedicationsPricingTab showToast={triggerNotification} />
            )}
          </>
        )}

        {/* ── ج) تبويبات المالك ── */}
        {userRole === 'owner' && (
          <>
            {activeTab === 'owner_financial_reports' && (
              <OwnerFinancialReportsTab showToast={triggerNotification} />
            )}

            {activeTab === 'owner_branches' && (
              <OwnerBranchOrdersTab showToast={triggerNotification} />
            )}

            {activeTab === 'owner_procurement' && (
              <OwnerProcurementMonitoringTab />
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

      {/* ── نافذة الإشعارات والتنبيهات المنبثقة الاحترافية ── */}
      {activeNotification && (
        <OutstockNotificationModal
          notification={activeNotification}
          onClose={() => setActiveNotification(null)}
        />
      )}
    </div>
  );
}
