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
  Lock
} from 'lucide-react';
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

// بوابات المشتريات
import ProcurementOrdersTab from './procurement/ProcurementOrdersTab';
import ProcurementDeliveryTrackingTab from './procurement/ProcurementDeliveryTrackingTab';
import ProcurementUnavailableTab from './procurement/ProcurementUnavailableTab';

// بوابات المالك
import OwnerBranchOrdersTab from './owner/OwnerBranchOrdersTab';
import OwnerProcurementMonitoringTab from './owner/OwnerProcurementMonitoringTab';
import OwnerCustomersDirectoryTab from './owner/OwnerCustomersDirectoryTab';
import OwnerSettingsTab from './owner/OwnerSettingsTab';

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

  // التبويب النشط
  const [activeTab, setActiveTab] = useState(() => {
    if (userRole === 'branch') return 'orders';
    if (userRole === 'procurement') return 'branch_orders';
    return 'owner_branches';
  });

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

        {/* ── قوائم البوابة حسب الدور ── */}
        <nav className="outstock-nav-tabs">
          {/* 1. قوائم بوابة الصيدلية (4 قوائم) */}
          {userRole === 'branch' && (
            <>
              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'orders' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                <Package size={15} />
                <span>طلبات العملاء</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'customers' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('customers')}
              >
                <Users size={15} />
                <span>العملاء المسجلين</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'procurement_tracking' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('procurement_tracking')}
              >
                <Clock size={15} />
                <span>متابعة طلبات المشتريات</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'deficiencies' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('deficiencies')}
              >
                <AlertTriangle size={15} />
                <span>أدوية النواقص</span>
              </button>
            </>
          )}

          {/* 2. قوائم بوابة إدارة المشتريات (3 قوائم) */}
          {userRole === 'procurement' && (
            <>
              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'branch_orders' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('branch_orders')}
              >
                <Building2 size={15} />
                <span>طلبات الفروع المجمعة</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'delivery_tracking' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('delivery_tracking')}
              >
                <Activity size={15} />
                <span>متابعة تسليم الأصناف</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'unavailable_items' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('unavailable_items')}
              >
                <AlertTriangle size={15} />
                <span>أصناف غير متوفرة بالسوق</span>
              </button>
            </>
          )}

          {/* 3. قوائم بوابة المالك (4 قوائم) */}
          {userRole === 'owner' && (
            <>
              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'owner_branches' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_branches')}
              >
                <Building2 size={15} />
                <span>طلبات الفروع وأرصدتها</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'owner_procurement' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_procurement')}
              >
                <TrendingUp size={15} />
                <span>متابعة إدارة المشتريات</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'owner_customers' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_customers')}
              >
                <Users size={15} />
                <span>دليل العملاء المركزي</span>
              </button>

              <button
                type="button"
                className={`outstock-nav-btn ${activeTab === 'owner_settings' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('owner_settings')}
              >
                <Settings size={15} />
                <span>الإعدادات والصلاحيات</span>
              </button>
            </>
          )}
        </nav>

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

      {/* ── جسم الشاشة ومحتوى التبويبات ── */}
      <main className="outstock-content-body">
        {/* ── أ) تبويبات الصيدلية ── */}
        {userRole === 'branch' && (() => {
          const effectiveBranchId = activeBranch?.id || currentUser?.branchId || currentUser?.branch_id || currentUser?.id || 'main';
          return (
            <>
              {activeTab === 'orders' && (
                <PharmacyOrdersTab
                  branchId={effectiveBranchId}
                  branch={activeBranch}
                  currentPharmacist={currentUser?.fullName || currentUser?.name || 'د. الصيدلي'}
                  showToast={showToast}
                />
              )}

              {activeTab === 'customers' && (
                <PharmacyCustomersTab
                  branchId={effectiveBranchId}
                  showToast={showToast}
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
                  showToast={showToast}
                />
              )}
            </>
          );
        })()}

        {/* ── ب) تبويبات إدارة المشتريات ── */}
        {userRole === 'procurement' && (
          <>
            {activeTab === 'branch_orders' && (
              <ProcurementOrdersTab showToast={showToast} />
            )}

            {activeTab === 'delivery_tracking' && (
              <ProcurementDeliveryTrackingTab />
            )}

            {activeTab === 'unavailable_items' && (
              <ProcurementUnavailableTab showToast={showToast} />
            )}
          </>
        )}

        {/* ── ج) تبويبات المالك ── */}
        {userRole === 'owner' && (
          <>
            {activeTab === 'owner_branches' && (
              <OwnerBranchOrdersTab showToast={showToast} />
            )}

            {activeTab === 'owner_procurement' && (
              <OwnerProcurementMonitoringTab />
            )}

            {activeTab === 'owner_customers' && (
              <OwnerCustomersDirectoryTab />
            )}

            {activeTab === 'owner_settings' && (
              <OwnerSettingsTab showToast={showToast} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
