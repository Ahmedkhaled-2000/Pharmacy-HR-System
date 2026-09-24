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
  ChevronDown
} from 'lucide-react';
import { outstockGetMe } from '../../utils/outstockApiClient';

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
    if (initialRole.startsWith('outstock_')) {
      return initialRole.replace('outstock_', '');
    }
    return initialRole || 'owner';
  });

  const [activeBranch, setActiveBranch] = useState(currentBranch || currentUser?.branchData || {
    id: currentUser?.branchId || 'main',
    name: currentUser?.fullName || 'فرع الصيدلية الرئيسي'
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
          setUserRole(res.user.role);
        }
        if (res.user.branchData) {
          setActiveBranch(res.user.branchData);
        }
      }
    }).catch(() => {});
  }, []);

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
          {/* محاكاة وتغيير الواجهة للمالك (Executive View Switcher) */}
          {initialRole === 'owner' && (
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              className="outstock-form-select"
              style={{
                height: '36px',
                fontSize: '12px',
                padding: '4px 8px',
                background: '#f0fdfa',
                borderColor: '#0d9488',
                fontWeight: 'bold'
              }}
            >
              <option value="owner">👑 وضع المالك (Executive)</option>
              <option value="procurement">📦 وضع إدارة المشتريات</option>
              <option value="branch">🏥 وضع الفرع / الصيدلية</option>
            </select>
          )}

          <div className="outstock-role-pill">
            <Shield size={13} />
            <span>{userRole === 'owner' ? 'المالك' : userRole === 'procurement' ? 'المشتريات' : 'الفرع'}</span>
          </div>

          {toggleTheme && (
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '8px', borderRadius: '10px' }}
              onClick={toggleTheme}
              title="تبديل المظهر"
            >
              {themeMode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '8px 14px', borderRadius: '10px', color: '#dc2626' }}
              onClick={onLogout}
              title="تسجيل الخروج"
            >
              <LogOut size={16} />
              <span>خروج</span>
            </button>
          )}
        </div>
      </header>

      {/* ── جسم الشاشة ومحتوى التبويبات ── */}
      <main className="outstock-content-body">
        {/* ── أ) تبويبات الصيدلية ── */}
        {userRole === 'branch' && (
          <>
            {activeTab === 'orders' && (
              <PharmacyOrdersTab
                branchId={activeBranch?.id || 'main'}
                branch={activeBranch}
                currentPharmacist={currentUser?.fullName || 'د. الصيدلي'}
                showToast={showToast}
              />
            )}

            {activeTab === 'customers' && (
              <PharmacyCustomersTab
                branchId={activeBranch?.id || 'main'}
                showToast={showToast}
              />
            )}

            {activeTab === 'procurement_tracking' && (
              <PharmacyProcurementTrackingTab
                branchId={activeBranch?.id || 'main'}
              />
            )}

            {activeTab === 'deficiencies' && (
              <PharmacyDeficienciesTab
                branchId={activeBranch?.id || 'main'}
                currentPharmacist={currentUser?.fullName || 'د. الصيدلي'}
                showToast={showToast}
              />
            )}
          </>
        )}

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
