import React from 'react';

/**
 * AccountsNavbar.jsx
 * شريط الرأس وشريط التنقل لمنظومة الحسابات العامة
 */
export default function AccountsNavbar({
  branches = [],
  selectedBranchId,
  onBranchChange,
  fiscalPeriod,
  onPeriodChange,
  onOpenNewEntry,
  onOpenTransfer,
  onOpenCodesCheatsheet,
  onOpenAddAccount,
  isStandalone = false,
  onBackToDashboard,
}) {
  return (
    <header className="acc-topbar">
      {/* Brand & Logo */}
      <div className="acc-brand">
        <div className="acc-brand-icon">
          🏛️
        </div>
        <div className="acc-brand-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>منظومة الحسابات العامة وشجرة الحسابات (ERP)</h1>
            <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
              PRO FINANCIAL
            </span>
          </div>
          <p>نظام القيد المزدوج، مراكز التكلفة، الخزائن ونقاط البيع، والقوائم المالية الختامية</p>
        </div>
      </div>

      {/* Actions and Controls */}
      <div className="acc-topbar-actions">
        {/* Branch Dimension Filter */}
        <select
          className="acc-filter-select"
          value={selectedBranchId}
          onChange={(e) => onBranchChange(e.target.value)}
          title="تحديد الفرع المحاسبي أو كامل المجموعة"
        >
          <option value="">🏢 جميع الفروع (مستوى المجموعة ككل)</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              📍 {b.name}
            </option>
          ))}
        </select>

        {/* Period Filter */}
        <input
          type="month"
          className="acc-filter-select"
          value={fiscalPeriod}
          onChange={(e) => onPeriodChange(e.target.value)}
          title="الفترة المالية المحاسبية"
        />

        {/* Cheatsheet Codes Popup Button (Requested by User!) */}
        <button
          type="button"
          className="acc-btn acc-btn-outline"
          onClick={onOpenCodesCheatsheet}
          title="عرض دليل أكواد شجرة الحسابات في نافذة منبثقة للبحث والنسخ"
        >
          📋 دليل الأكواد
        </button>

        {/* Internal Transfer */}
        <button
          type="button"
          className="acc-btn acc-btn-outline"
          onClick={onOpenTransfer}
          title="تحويل نقدية بين الخزائن والبنوك أو سحب من المحافظ وإنستاباي"
        >
          🔄 تحويل نقدية
        </button>

        {/* Add Account */}
        <button
          type="button"
          className="acc-btn acc-btn-outline"
          onClick={onOpenAddAccount}
          title="إضافة حساب رئيسي أو فرعي جديد"
        >
          ➕ حساب جديد
        </button>

        {/* New Journal Entry */}
        <button
          type="button"
          className="acc-btn acc-btn-primary"
          onClick={onOpenNewEntry}
          title="تسجيل قيد محاسبي يدوي جديد"
        >
          📝 قيد يومية جديد
        </button>

        {/* Back to main Dashboard if opened standalone */}
        {isStandalone && (
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={onBackToDashboard}
            style={{ color: '#94a3b8' }}
          >
            🏠 لوحة التحكم الرئيسية
          </button>
        )}
      </div>
    </header>
  );
}
