import React, { useState, useEffect, useRef } from 'react';

/**
 * AccountsDesktopMenuBar.jsx
 * شريط قوائم سطح المكتب الاحترافي لمنظومة ERP الحسابات العامة
 * يوفر قوائم منسدلة حقيقية (Dropdown Menus)، شريط وصول سريع، وشريط حالة
 */
export default function AccountsDesktopMenuBar({
  branches = [],
  selectedBranchId,
  onBranchChange,
  fiscalPeriod,
  onPeriodChange,
  activeTab,
  onSelectTab,
  onOpenNewEntry,
  onOpenTransfer,
  onOpenCodesCheatsheet,
  onOpenAddAccount,
  onOpenVendorTxModal,
  onOpenPayrollModal,
  onOpenAiPromptModal,
  onOpenAiAuditRadarModal,
  onOpenGuideModal,
  themeMode = 'light',
  toggleTheme,
  isStandalone = false,
  onBackToDashboard,
  searchQuery,
  onSearchChange,
}) {
  const [openMenu, setOpenMenu] = useState(null); // 'file' | 'coa' | 'vendors' | 'payroll' | 'ai' | 'reports' | 'guide' | 'settings'
  const menuBarRef = useRef(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard Shortcuts (Ctrl+N, Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onOpenNewEntry?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('acc-global-search-input');
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenNewEntry]);

  const handleMenuClick = (menuKey) => {
    setOpenMenu(openMenu === menuKey ? null : menuKey);
  };

  const handleAction = (callback) => {
    setOpenMenu(null);
    if (callback) callback();
  };

  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name || 'جميع الفروع (المجموعة ككل)';

  return (
    <div className="acc-desktop-layer" ref={menuBarRef}>
      {/* ── Top Window Bar / Brand Title ── */}
      <div className="acc-window-bar">
        <div className="acc-window-brand">
          <span className="acc-window-icon">🏛️</span>
          <span className="acc-window-title">منظومة الحسابات العامة وشجرة الحسابات (ERP Enterprise)</span>
          <span className="acc-edition-badge">EDITION 2026</span>
          <span className="acc-connected-pill">● متصل لحظياً</span>
        </div>

        <div className="acc-window-controls">
          {toggleTheme && (
            <button
              type="button"
              className="acc-menu-icon-btn"
              onClick={toggleTheme}
              title={themeMode === 'dark' ? 'التبديل للنظام الفاتح' : 'التبديل للنظام الداكن'}
            >
              {themeMode === 'dark' ? '☀️' : '🌙'}
            </button>
          )}

          {isStandalone && onBackToDashboard && (
            <button
              type="button"
              className="acc-menu-link-btn"
              onClick={onBackToDashboard}
              title="العودة للوحة تحكم الإدارة"
            >
              🏠 لوحة التحكم الرئيسية
            </button>
          )}
        </div>
      </div>

      {/* ── Classic ERP Dropdown Menu Bar ── */}
      <nav className="acc-menubar-nav">
        {/* 1. File & Operations */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'file' ? 'active' : ''}`}
            onClick={() => handleMenuClick('file')}
          >
            📁 العمليات والملفات ▾
          </button>
          {openMenu === 'file' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(onOpenNewEntry)}>
                <span>📝 قيد يومية عامة جديد</span>
                <kbd>Ctrl+N</kbd>
              </button>
              <button type="button" onClick={() => handleAction(onOpenTransfer)}>
                <span>🔄 تحويل نقدية بين الخزائن والبنوك</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onOpenVendorTxModal?.('payment'))}>
                <span>💊 سداد دفعة أو شيك لشركة توزيع أدوية</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onOpenVendorTxModal?.('invoice'))}>
                <span>📥 إثبات فاتورة مشتريات أدوية ومستلزمات</span>
              </button>
              <div className="acc-menu-divider"></div>
              <button type="button" onClick={() => handleAction(() => window.print())}>
                <span>🖨️ طباعة الشاشة الحالية</span>
                <kbd>Ctrl+P</kbd>
              </button>
              {isStandalone && onBackToDashboard && (
                <button type="button" onClick={() => handleAction(onBackToDashboard)}>
                  <span>🏠 إغلاق والعودة للوحة الإدارة</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 2. Chart of Accounts & Master Data */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'coa' ? 'active' : ''}`}
            onClick={() => handleMenuClick('coa')}
          >
            🌳 شجرة الحسابات والدليل ▾
          </button>
          {openMenu === 'coa' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(() => onSelectTab('chart'))}>
                <span>🌳 استعراض شجرة الحسابات (COA)</span>
              </button>
              <button type="button" onClick={() => handleAction(onOpenCodesCheatsheet)}>
                <span>📋 دليل الأكواد في نافذة منبثقة</span>
              </button>
              <button type="button" onClick={() => handleAction(onOpenAddAccount)}>
                <span>➕ إضافة حساب رئيسي أو فرعي جديد</span>
              </button>
              <div className="acc-menu-divider"></div>
              <button type="button" onClick={() => handleAction(() => onSelectTab('treasuries'))}>
                <span>🏦 الخزائن والبنوك ونقاط البيع والمحافظ</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onSelectTab('cost-centers'))}>
                <span>🎯 مراكز التكلفة للفروع والإدارة</span>
              </button>
            </div>
          )}
        </div>

        {/* 3. Pharma Vendors */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'vendors' ? 'active' : ''}`}
            onClick={() => handleMenuClick('vendors')}
          >
            💊 شركات الأدوية والموزعين ▾
          </button>
          {openMenu === 'vendors' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(() => onSelectTab('vendors'))}>
                <span>🏢 دليل وحسابات شركات التوزيع (المتحدة، ابن سينا، فارما...)</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onOpenVendorTxModal?.('invoice'))}>
                <span>📥 تسجيل فاتورة مشتريات أدوية جديدة</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onOpenVendorTxModal?.('payment'))}>
                <span>📤 سداد دفعة نقدية أو شيك بنكي لموزع</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onOpenVendorTxModal?.('credit_note'))}>
                <span>🔄 تسجيل إشعار خصم مرتجع إكسباير (Credit Note)</span>
              </button>
              <div className="acc-menu-divider"></div>
              <button type="button" onClick={() => handleAction(() => onSelectTab('vendors'))}>
                <span>📑 استخراج كشف حساب موزع تحليلي</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. Payroll & HR */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'payroll' ? 'active' : ''}`}
            onClick={() => handleMenuClick('payroll')}
          >
            👥 الرواتب والمستحقات ▾
          </button>
          {openMenu === 'payroll' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(onOpenPayrollModal)}>
                <span>📑 مسير الرواتب الشهري وترحيل القيد الآلي</span>
              </button>
              <button type="button" onClick={() => handleAction(onOpenPayrollModal)}>
                <span>💰 تسوية استقطاعات وسلف العاملين</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onSelectTab('cost-centers'))}>
                <span>🏢 تحليل تكلفة أجور ورواتب كل صيدلية</span>
              </button>
            </div>
          )}
        </div>

        {/* 5. AI Suite */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'ai' ? 'active' : ''}`}
            onClick={() => handleMenuClick('ai')}
          >
            🤖 الذكاء الاصطناعي المالي ▾
          </button>
          {openMenu === 'ai' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(onOpenAiPromptModal)}>
                <span>✍️ كتابة قيد بالأوامر النصية الطبيعية (AI Prompt)</span>
              </button>
              <button type="button" onClick={() => handleAction(onOpenAiAuditRadarModal)}>
                <span>🛡️ رادار التدقيق المالي وكشف الشذوذ والنزيف</span>
              </button>
              <button type="button" onClick={() => handleAction(onOpenAiAuditRadarModal)}>
                <span>📈 التنبؤ بالتدفق النقدي والسيولة (30 يوماً)</span>
              </button>
            </div>
          )}
        </div>

        {/* 6. Financial Statements */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'reports' ? 'active' : ''}`}
            onClick={() => handleMenuClick('reports')}
          >
            📊 القوائم والتقارير المالية ▾
          </button>
          {openMenu === 'reports' && (
            <div className="acc-dropdown-menu">
              <button type="button" onClick={() => handleAction(() => onSelectTab('reports'))}>
                <span>⚖️ ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onSelectTab('reports'))}>
                <span>📈 قائمة الدخل والأرباح والخسائر (P&L Statement)</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onSelectTab('reports'))}>
                <span>🏛️ الميزانية العمومية وقائمة المركز المالي</span>
              </button>
              <button type="button" onClick={() => handleAction(() => onSelectTab('reports'))}>
                <span>🔍 دفتر الأستاذ التحليلي وكشف الحساب</span>
              </button>
              <div className="acc-menu-divider"></div>
              <button type="button" onClick={() => handleAction(() => onSelectTab('entries'))}>
                <span>📜 استعراض دفتر قيود اليومية العامة ({'>'}100 قيد)</span>
              </button>
            </div>
          )}
        </div>

        {/* 7. Educational Guide */}
        <div className="acc-menu-item">
          <button
            type="button"
            className={`acc-menu-btn ${openMenu === 'guide' ? 'active' : ''}`}
            onClick={() => handleAction(onOpenGuideModal)}
            style={{ color: '#0284c7', fontWeight: '800' }}
          >
            📖 دليل وشرح المنظومة
          </button>
        </div>
      </nav>

      {/* ── Quick Action Ribbon ── */}
      <div className="acc-action-ribbon">
        <div className="acc-quick-buttons">
          <button
            type="button"
            className="acc-ribbon-btn primary"
            onClick={onOpenNewEntry}
            title="إنشاء قيد يومية عامة جديد (Ctrl+N)"
          >
            <span>➕ قيد جديد</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn"
            onClick={() => onOpenVendorTxModal?.('payment')}
            title="سداد دفعة أو شيك لشركة توزيع أدوية"
          >
            <span>💊 سداد موزع أدوية</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn"
            onClick={onOpenTransfer}
            title="تحويل نقدية بين الخزائن والبنوك أو سحب من المحافظ"
          >
            <span>🔄 تحويل نقدية</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn"
            onClick={onOpenPayrollModal}
            title="استيراد مسير رواتب الشهر وترحيل القيد آلياً"
          >
            <span>👥 قيد الرواتب</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn ai"
            onClick={onOpenAiPromptModal}
            title="كتابة أمر باللغة العامية لتوليد القيد ذكياً"
          >
            <span>🤖 أمر ذكي</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn"
            onClick={onOpenAiAuditRadarModal}
            title="فحص الأرصدة الشاذة ونزيف العمولات والتنبؤ بالسيولة"
          >
            <span>🛡️ رادار التدقيق</span>
          </button>

          <button
            type="button"
            className="acc-ribbon-btn"
            onClick={onOpenCodesCheatsheet}
            title="دليل الأكواد المحاسبية للبحث والنسخ السريع"
          >
            <span>📋 دليل الأكواد</span>
          </button>
        </div>

        {/* Global Quick Search (Ctrl+K) & Dimension Pickers */}
        <div className="acc-ribbon-filters">
          <div className="acc-search-box">
            <span className="acc-search-icon">🔍</span>
            <input
              id="acc-global-search-input"
              type="text"
              placeholder="بحث بالحساب، الكود، أو السند... (Ctrl+K)"
              value={searchQuery || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="acc-search-input"
            />
          </div>

          <select
            className="acc-ribbon-select"
            value={selectedBranchId}
            onChange={(e) => onBranchChange(e.target.value)}
            title="تحديد الفرع المحاسبي أو كامل الفروع"
          >
            <option value="">🏢 جميع الفروع (المجموعة ككل)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                📍 {b.name}
              </option>
            ))}
          </select>

          <input
            type="month"
            className="acc-ribbon-select"
            value={fiscalPeriod}
            onChange={(e) => onPeriodChange(e.target.value)}
            title="الفترة المالية المحاسبية"
          />
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="acc-statusbar">
        <div className="acc-status-left">
          <span className="acc-status-tag success">🟢 ميزان المراجعة متزن 100%</span>
          <span className="acc-status-item">🏢 النطاق: <strong>{selectedBranchName}</strong></span>
          <span className="acc-status-item">📅 الفترة المحاسبية: <strong>{fiscalPeriod}</strong></span>
        </div>
        <div className="acc-status-right">
          <span className="acc-hint-text">💡 اختصارات: <code>Ctrl+N</code> لقيد جديد · <code>Ctrl+K</code> للبحث السريع</span>
        </div>
      </div>
    </div>
  );
}
