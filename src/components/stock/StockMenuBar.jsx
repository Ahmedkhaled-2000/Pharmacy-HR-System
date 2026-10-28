import React, { useState, useEffect, useRef } from 'react';
import {
  Boxes,
  FilePlus,
  RefreshCw,
  LogOut,
  BarChart3,
  Layers,
  Clock,
  ArrowRightLeft,
  ClipboardCheck,
  FileText,
  AlertTriangle,
  ShieldAlert,
  Sliders,
  Warehouse,
  HelpCircle,
  ChevronDown,
  ChevronLeft,
  Truck,
  Download,
  Printer,
  Sun,
  Moon
} from 'lucide-react';

export default function StockMenuBar({
  activeTab,
  setActiveTab,
  onNewReceipt,
  onNewTransfer,
  onNewCount,
  onRefresh,
  onExit,
  onOpenLocations,
  onReconcileAll,
  onSelectReport,
  themeMode = 'light',
  toggleTheme
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const menubarRef = useRef(null);

  // إغلاق القوائم عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(e) {
      if (menubarRef.current && !menubarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // اختصارات لوحة المفاتيح لسطح المكتب
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewReceipt?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        onNewTransfer?.();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        onNewCount?.();
      } else if (e.key === 'F5') {
        e.preventDefault();
        onRefresh?.();
      } else if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewReceipt, onNewTransfer, onNewCount, onRefresh]);

  const toggleMenu = (name) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  const executeAction = (actionFn) => {
    setOpenMenu(null);
    actionFn?.();
  };

  return (
    <div className="stock-desktop-menubar" ref={menubarRef}>
      {/* شعار نافذة سطح المكتب */}
      <div className="stock-window-brand">
        <Boxes size={18} color="#38bdf8" />
        <span>PharmaOS Stock • إدارة المخازن المركزية</span>
      </div>

      {/* ── 1. قائمة ملف (File) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'file' ? 'active' : ''}`}
          onClick={() => toggleMenu('file')}
        >
          <span>ملف</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'file' && (
          <div className="stock-menu-dropdown">
            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewReceipt)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📥</span>
                <span>استلام مشتريات جديد...</span>
              </div>
              <span className="stock-menu-shortcut">Ctrl+N</span>
            </div>

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewTransfer)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">🔄</span>
                <span>أمر تحويل بين المستودعات...</span>
              </div>
              <span className="stock-menu-shortcut">Ctrl+T</span>
            </div>

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewCount)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📋</span>
                <span>بدء جلسة جرد فعلي...</span>
              </div>
              <span className="stock-menu-shortcut">Ctrl+J</span>
            </div>

            <div className="stock-menu-divider" />

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onRefresh)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">⚡</span>
                <span>تحديث البيانات الحية</span>
              </div>
              <span className="stock-menu-shortcut">F5</span>
            </div>

            <div className="stock-menu-divider" />

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onExit)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">🚪</span>
                <span>إغلاق والعودة لمنظومة العمل</span>
              </div>
              <span className="stock-menu-shortcut">Esc</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. قائمة عرض (View) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'view' ? 'active' : ''}`}
          onClick={() => toggleMenu('view')}
        >
          <span>عرض</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'view' && (
          <div className="stock-menu-dropdown">
            <div
              className={`stock-menu-dropdown-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('dashboard'))}
            >
              <div className="stock-menu-item-left">
                <BarChart3 size={15} color="#38bdf8" />
                <span>لوحة المؤشرات والرقابة</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'balances' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('balances'))}
            >
              <div className="stock-menu-item-left">
                <Layers size={15} color="#10b981" />
                <span>كشاف الأرصدة والمخزون</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'batches' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('batches'))}
            >
              <div className="stock-menu-item-left">
                <Clock size={15} color="#f59e0b" />
                <span>مفتش التشغيلات والصلاحية (FEFO)</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'transfers' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('transfers'))}
            >
              <div className="stock-menu-item-left">
                <Truck size={15} color="#06b6d4" />
                <span>التحويلات وبضاعة الطريق (In-Transit)</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'reorder' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('reorder'))}
            >
              <div className="stock-menu-item-left">
                <BarChart3 size={15} color="#0284c7" />
                <span>تخطيط الاحتياجات وإعادة الطلب (AI)</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'recalls' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('recalls'))}
            >
              <div className="stock-menu-item-left">
                <FileText size={15} color="#ef4444" />
                <span>الاستدعاء الدوائي وحظر التشغيلات (EDA)</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'scrap' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('scrap'))}
            >
              <div className="stock-menu-item-left">
                <FileText size={15} color="#f59e0b" />
                <span>مركز التوالف والهوالك والمرتجعات</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'receipts' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('receipts'))}
            >
              <div className="stock-menu-item-left">
                <FilePlus size={15} color="#10b981" />
                <span>فواتير استلام الموردين</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'counts' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('counts'))}
            >
              <div className="stock-menu-item-left">
                <ClipboardCheck size={15} color="#8b5cf6" />
                <span>جلسات الجرد والتسوية</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('ledger'))}
            >
              <div className="stock-menu-item-left">
                <FileText size={15} color="#94a3b8" />
                <span>دفتر الأستاذ المخزني الدائم</span>
              </div>
            </div>

            <div
              className={`stock-menu-dropdown-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => executeAction(() => setActiveTab('reports'))}
            >
              <div className="stock-menu-item-left">
                <BarChart3 size={15} color="#ec4899" />
                <span>التقارير الإدارية والتحليلية</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. عمليات المخزن (Operations) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'operations' ? 'active' : ''}`}
          onClick={() => toggleMenu('operations')}
        >
          <span>عمليات المخزن</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'operations' && (
          <div className="stock-menu-dropdown">
            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewReceipt)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📥</span>
                <span>استلام وتوريد شحنة مورد</span>
              </div>
            </div>

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewTransfer)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📤</span>
                <span>إصدار تحويل صادر إلى فرع</span>
              </div>
            </div>

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('transfers'))}
            >
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📦</span>
                <span>تأكيد استلام وفحص شحنة واردة</span>
              </div>
            </div>

            <div className="stock-menu-divider" />

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('batches'))}
            >
              <div className="stock-menu-item-left">
                <ShieldAlert size={15} color="#ef4444" />
                <span>حجر تشغيلة دوائية (Quarantine)</span>
              </div>
            </div>

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('balances'))}
            >
              <div className="stock-menu-item-left">
                <Sliders size={15} color="#f59e0b" />
                <span>تسوية وتعديل رصيد صنف</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. الجرد والتسويات (Inventory Counts) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'counts' ? 'active' : ''}`}
          onClick={() => toggleMenu('counts')}
        >
          <span>الجرد والتسويات</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'counts' && (
          <div className="stock-menu-dropdown">
            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onNewCount)}>
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">🆕</span>
                <span>فتح جلسة جرد جديدة (شامل / مفاجئ)</span>
              </div>
            </div>

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('counts'))}
            >
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📊</span>
                <span>مصفوفة مطابقة الفروقات الدفترية والفعلية</span>
              </div>
            </div>

            <div className="stock-menu-divider" />

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => onSelectReport?.('variance_analysis'))}
            >
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">📉</span>
                <span>تقرير العجز والزيادة المالي</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. التقارير مع قوائم فرعية متتالية (Reports with Cascading Submenus) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'reports' ? 'active' : ''}`}
          onClick={() => toggleMenu('reports')}
        >
          <span>التقارير</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'reports' && (
          <div className="stock-menu-dropdown">
            {/* تقارير التقييم والأرصدة */}
            <div className="stock-menu-dropdown-item stock-menu-subitem">
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">💰</span>
                <span>تقارير تقييم الأرصدة المخزنية</span>
              </div>
              <ChevronLeft size={12} />
              <div className="stock-submenu-pane">
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('stock_valuation'))}
                >
                  تقييم المخزون بسعر الشراء (Cost)
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('stock_valuation_public'))}
                >
                  تقييم المخزون بسعر الجمهور (Retail)
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('branch_comparison'))}
                >
                  مقارنة أرصدة الفروع والمستودعات
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('stagnant_stock'))}
                >
                  الأصناف الراكدة وبطيئة الحركة
                </div>
              </div>
            </div>

            {/* تقارير الصلاحية */}
            <div className="stock-menu-dropdown-item stock-menu-subitem">
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">⏳</span>
                <span>تقارير الصلاحية وتلف الأدوية</span>
              </div>
              <ChevronLeft size={12} />
              <div className="stock-submenu-pane">
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('expired_batches'))}
                >
                  الأصناف منتهية الصلاحية كلياً
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('near_expiry_30'))}
                >
                  قريبة الانتهاء خلال 30 يوماً
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('near_expiry_90'))}
                >
                  قريبة الانتهاء خلال 90 يوماً
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('quarantined_items'))}
                >
                  الأصناف المحجورة احترازياً
                </div>
              </div>
            </div>

            {/* تقارير حركة البضاعة والتحويلات */}
            <div className="stock-menu-dropdown-item stock-menu-subitem">
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">🚚</span>
                <span>بضاعة الطريق وحركة التحويلات</span>
              </div>
              <ChevronLeft size={12} />
              <div className="stock-submenu-pane">
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('in_transit_goods'))}
                >
                  بضاعة الطريق قيد الشحن (In-Transit)
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('transfer_damages'))}
                >
                  توالف وعجز تحويلات الفروع
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('frequent_transfers'))}
                >
                  الأصناف الأكثر طلباً للتحويل
                </div>
              </div>
            </div>

            {/* تقارير النواقص وطلبات التوريد */}
            <div className="stock-menu-dropdown-item stock-menu-subitem">
              <div className="stock-menu-item-left">
                <span className="stock-menu-item-icon">⚠️</span>
                <span>تقارير النواقص وحدود إعادة الطلب</span>
              </div>
              <ChevronLeft size={12} />
              <div className="stock-submenu-pane">
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('low_stock_urgent'))}
                >
                  أصناف قاربت على النفاد (Urgent)
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('zero_stock'))}
                >
                  الأصناف منعدمة الرصيد تماماً (Zero)
                </div>
                <div
                  className="stock-menu-dropdown-item"
                  onClick={() => executeAction(() => onSelectReport?.('procurement_suggestions'))}
                >
                  مقترحات الشراء الذكية للفروع
                </div>
              </div>
            </div>

            <div className="stock-menu-divider" />

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('reports'))}
            >
              <div className="stock-menu-item-left">
                <BarChart3 size={15} color="#38bdf8" />
                <span>مركز كافة التقارير المتقدمة (20 تقرير)...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. أدوات المنظومة (Tools) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'tools' ? 'active' : ''}`}
          onClick={() => toggleMenu('tools')}
        >
          <span>أدوات</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'tools' && (
          <div className="stock-menu-dropdown">
            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onOpenLocations)}>
              <div className="stock-menu-item-left">
                <Warehouse size={15} color="#06b6d4" />
                <span>إدارة المستودعات ومواقع التخزين...</span>
              </div>
            </div>

            <div className="stock-menu-dropdown-item" onClick={() => executeAction(onReconcileAll)}>
              <div className="stock-menu-item-left">
                <RefreshCw size={15} color="#10b981" />
                <span>التدقيق الذاتي وإصلاح الأرصدة التلقائي</span>
              </div>
            </div>

            <div className="stock-menu-divider" />

            <div
              className="stock-menu-dropdown-item"
              onClick={() => executeAction(() => setActiveTab('ledger'))}
            >
              <div className="stock-menu-item-left">
                <FileText size={15} color="#94a3b8" />
                <span>فحص سجل الحركات الدائم (Audit Log)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 7. مساعدة (Help) ── */}
      <div className="stock-menu-root-item">
        <button
          type="button"
          className={`stock-menu-trigger-btn ${openMenu === 'help' ? 'active' : ''}`}
          onClick={() => toggleMenu('help')}
        >
          <span>مساعدة</span>
          <ChevronDown size={12} />
        </button>
        {openMenu === 'help' && (
          <div className="stock-menu-dropdown">
            <div
              className="stock-menu-dropdown-item"
              onClick={() =>
                executeAction(() => {
                  alert(
                    'نظام PharmaOS Stock Enterprise v2.5\nنظام إدارة المخازن المركزية وسلاسل الإمداد الصيدلي المتكامل كلياً مع نقاط البيع PharmaOS POS ودفتر الأستاذ غير القابل للتلاعب.'
                  );
                })
              }
            >
              <div className="stock-menu-item-left">
                <HelpCircle size={15} color="#38bdf8" />
                <span>حول نظام المخازن PharmaOS Stock...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* أدوات المظهر والخروج في أقصى اليسار */}
      <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {toggleTheme && (
          <button
            type="button"
            onClick={toggleTheme}
            title={themeMode === 'dark' ? 'التحويل إلى المظهر الفاتح' : 'التحويل إلى المظهر الداكن'}
            style={{
              background: 'var(--stock-surface-2)',
              border: '1px solid var(--stock-border)',
              color: 'var(--stock-text)',
              cursor: 'pointer',
              padding: '4px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              transition: 'all 0.15s ease'
            }}
          >
            {themeMode === 'dark' ? (
              <>
                <Sun size={13} color="#f59e0b" />
                <span>المظهر الفاتح</span>
              </>
            ) : (
              <>
                <Moon size={13} color="#6366f1" />
                <span>المظهر الداكن</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onExit}
          title="العودة لشاشة النظام السابقة (Esc)"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--stock-text-dim)',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--stock-text-dim)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <LogOut size={14} />
          <span>إغلاق</span>
        </button>
      </div>
    </div>
  );
}
