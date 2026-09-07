import React, { useState, useMemo } from 'react';

/**
 * ChartOfAccountsTab.jsx
 * شجرة الحسابات المدمجة الاحترافية (Compact Tree Grid View)
 * مصممة على غرار أنظمة ERP العالمية (SAP & Odoo):
 * مظهر رشيق ومضغوط، أعمدة منظمة، فلاتر مستويات سريعة، وتحكم كامل
 */
export default function ChartOfAccountsTab({
  accounts = [],
  onOpenAddChild,
  onOpenEditAccount,
  onOpenCodesCheatsheet,
  onOpenNewRootAccount,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all'); // 'all' | '1' | '2' | '3' | '4'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'asset' | 'liability' | ...

  const [expandedNodes, setExpandedNodes] = useState(() => {
    // By default expand level 1 and 2 for optimal initial density
    const roots = {};
    accounts.filter((a) => a.level <= 2).forEach((a) => {
      roots[a.id] = true;
    });
    return roots;
  });

  const toggleNode = (id) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all = {};
    accounts.forEach((a) => { all[a.id] = true; });
    setExpandedNodes(all);
  };

  const collapseAll = () => {
    const roots = {};
    accounts.filter((a) => a.level === 1).forEach((a) => { roots[a.id] = true; });
    setExpandedNodes(roots);
  };

  // Build tree hierarchy map
  const { rootAccounts, childrenMap } = useMemo(() => {
    const roots = [];
    const map = {};

    accounts.forEach((acc) => {
      if (!acc.parent_id) {
        roots.push(acc);
      } else {
        if (!map[acc.parent_id]) map[acc.parent_id] = [];
        map[acc.parent_id].push(acc);
      }
    });

    // Sort by code
    roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    });

    return { rootAccounts: roots, childrenMap: map };
  }, [accounts]);

  // Filter accounts if search or filters active
  const matchingAccountIds = useMemo(() => {
    const hasSearch = Boolean(searchQuery.trim());
    const hasLevel = levelFilter !== 'all';
    const hasType = typeFilter !== 'all';

    if (!hasSearch && !hasLevel && !hasType) return null;

    const q = searchQuery.trim().toLowerCase();
    const targetLvl = parseInt(levelFilter, 10);
    const set = new Set();

    accounts.forEach((a) => {
      let match = true;
      if (hasSearch) {
        const cMatch = a.code && a.code.toLowerCase().includes(q);
        const arMatch = a.name_ar && a.name_ar.toLowerCase().includes(q);
        const enMatch = a.name_en && a.name_en.toLowerCase().includes(q);
        if (!cMatch && !arMatch && !enMatch) match = false;
      }
      if (hasLevel && a.level !== targetLvl) {
        match = false;
      }
      if (hasType && a.account_type !== typeFilter) {
        match = false;
      }

      if (match) {
        set.add(a.id);
        // Also keep parents visible in tree view
        let cur = a;
        while (cur && cur.parent_id) {
          set.add(cur.parent_id);
          cur = accounts.find((x) => x.id === cur.parent_id);
        }
      }
    });

    return set;
  }, [accounts, searchQuery, levelFilter, typeFilter]);

  const getTypeName = (type) => {
    switch (type) {
      case 'asset': return 'أصول';
      case 'liability': return 'التزامات';
      case 'equity': return 'حقوق ملكية';
      case 'revenue': return 'إيرادات';
      case 'cogs': return 'تكلفة مبيعات';
      case 'expense': return 'مصروفات';
      default: return type;
    }
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case 'asset': return { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
      case 'liability': return { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' };
      case 'equity': return { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' };
      case 'revenue': return { bg: '#faf5ff', color: '#6b21a8', border: '#e9d5ff' };
      case 'cogs': return { bg: '#fffbeb', color: '#92400e', border: '#fde68a' };
      case 'expense': return { bg: '#fff1f2', color: '#9f1239', border: '#fecdd3' };
      default: return { bg: '#f1f5f9', color: '#334155', border: '#e2e8f0' };
    }
  };

  // Compact Row Renderer
  const renderCompactRow = (account, depth = 0) => {
    const children = childrenMap[account.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedNodes[account.id] || matchingAccountIds !== null);

    if (matchingAccountIds !== null && !matchingAccountIds.has(account.id)) {
      return null;
    }

    const typeStyle = getTypeStyle(account.account_type);
    const isParentNode = Boolean(account.is_parent || hasChildren);
    const indentPx = depth * 22;

    return (
      <React.Fragment key={account.id}>
        <tr
          className={`acc-compact-tree-row level-${account.level} ${isParentNode ? 'parent-row' : 'leaf-row'}`}
          style={{
            background: isParentNode ? 'var(--surface-subtle, #f8fafc)' : '#ffffff',
            fontWeight: account.level <= 2 ? '800' : '500',
            fontSize: account.level === 1 ? '13.5px' : account.level === 2 ? '13px' : '12.5px',
          }}
        >
          {/* 1. Code */}
          <td style={{ width: '110px', whiteSpace: 'nowrap' }}>
            <span
              className="acc-code-badge"
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: '700',
                background: account.level === 1 ? '#0284c7' : undefined,
                color: account.level === 1 ? '#fff' : undefined,
              }}
            >
              {account.code}
            </span>
          </td>

          {/* 2. Account Name & Tree Indentation */}
          <td>
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: `${indentPx}px` }}>
              {/* Expand Toggle */}
              {hasChildren ? (
                <button
                  type="button"
                  className="acc-tree-toggle-btn"
                  onClick={() => toggleNode(account.id)}
                  title={isExpanded ? 'طي الحساب' : 'توسيع الحساب'}
                >
                  {isExpanded ? '▼' : '◀'}
                </button>
              ) : (
                <span style={{ display: 'inline-block', width: '18px', textAlign: 'center', color: '#cbd5e1', fontSize: '10px' }}>
                  └─
                </span>
              )}

              {/* Folder/Leaf Icon */}
              <span style={{ marginLeft: '6px', fontSize: '14px', opacity: 0.85 }}>
                {isParentNode ? '📁' : '📄'}
              </span>

              {/* Account Arabic Name */}
              <span style={{ color: 'var(--text, #0f172a)', marginRight: '4px' }}>
                {account.name_ar}
              </span>

              {/* English Name (optional) */}
              {account.name_en && (
                <span style={{ fontSize: '11px', color: 'var(--muted, #64748b)', marginRight: '6px', direction: 'ltr' }}>
                  ({account.name_en})
                </span>
              )}
            </div>
          </td>

          {/* 3. Level */}
          <td style={{ width: '80px', textAlign: 'center' }}>
            <span style={{
              fontSize: '10.5px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--surface-muted, #f1f5f9)',
              color: 'var(--muted, #64748b)',
              fontWeight: '700',
            }}>
              مستوى {account.level}
            </span>
          </td>

          {/* 4. Type */}
          <td style={{ width: '100px', textAlign: 'center' }}>
            <span style={{
              fontSize: '11px',
              background: typeStyle.bg,
              color: typeStyle.color,
              border: `1px solid ${typeStyle.border}`,
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: '700',
            }}>
              {getTypeName(account.account_type)}
            </span>
          </td>

          {/* 5. Nature */}
          <td style={{ width: '80px', textAlign: 'center', fontSize: '11px', fontWeight: '800', color: account.nature === 'debit' ? '#059669' : '#dc2626' }}>
            {account.nature === 'debit' ? 'مدين (+)' : 'دائن (-)'}
          </td>

          {/* 6. Current Balance */}
          <td style={{ width: '150px', textAlign: 'left', direction: 'ltr' }}>
            <strong style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              color: (account.current_balance || 0) < 0 ? '#dc2626' : 'var(--text, #0f172a)',
            }}>
              {Number(account.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </strong>
            <span style={{ fontSize: '10px', color: 'var(--muted, #64748b)', marginLeft: '4px' }}>ج.م</span>
          </td>

          {/* 7. Inline Actions */}
          <td style={{ width: '90px', textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              <button
                type="button"
                className="acc-tree-action-icon"
                onClick={() => onOpenAddChild(account)}
                title="إضافة حساب فرعي تحت هذا الحساب"
              >
                ➕
              </button>
              <button
                type="button"
                className="acc-tree-action-icon"
                onClick={() => onOpenEditAccount(account)}
                title="تعديل الحساب"
              >
                ✏️
              </button>
            </div>
          </td>
        </tr>

        {/* Recursive Children */}
        {hasChildren && isExpanded && (
          children.map((child) => renderCompactRow(child, depth + 1))
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="acc-compact-tree-container">
      {/* ── Top Grid Control Panel ── */}
      <div className="acc-tree-controls-bar">
        <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
          <div className="acc-search-input-wrap" style={{ flex: 1, minWidth: '220px' }}>
            <span className="acc-search-icon">🔍</span>
            <input
              type="text"
              className="acc-search-input"
              placeholder="ابحث بالكود أو الاسم (عربي/إنجليزي)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Type Filter */}
          <select
            className="acc-filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">جميع الأنواع</option>
            <option value="asset">1 - الأصول</option>
            <option value="liability">2 - الالتزامات</option>
            <option value="equity">3 - حقوق الملكية</option>
            <option value="revenue">4 - الإيرادات</option>
            <option value="cogs">5 - تكلفة المبيعات</option>
            <option value="expense">6 - المصروفات</option>
          </select>
        </div>

        {/* Right Buttons: Cheatsheet, Expand, Collapse, Add */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={onOpenCodesCheatsheet}
            title="فتح نافذة دليل الأكواد للبحث والنسخ السريع"
            style={{ borderColor: '#0284c7', color: '#0284c7' }}
          >
            📋 دليل الأكواد
          </button>
          <button type="button" className="acc-btn acc-btn-outline" onClick={expandAll} title="فتح كل المستويات">
            ⊞ فتح الكل
          </button>
          <button type="button" className="acc-btn acc-btn-outline" onClick={collapseAll} title="طي كل المستويات">
            ⊟ طي الكل
          </button>
          <button type="button" className="acc-btn acc-btn-primary" onClick={onOpenNewRootAccount}>
            ➕ حساب رئيسي جديد
          </button>
        </div>
      </div>

      {/* ── Level Filter Ribbon ── */}
      <div className="acc-tree-levels-bar">
        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)' }}>
          تصفية المستويات الشجرية:
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'all', label: 'كافة المستويات' },
            { key: '1', label: 'مستوى 1 (الأم)' },
            { key: '2', label: 'مستوى 2 (المجموعات)' },
            { key: '3', label: 'مستوى 3 (العامة)' },
            { key: '4', label: 'مستوى 4 (الفرعية)' },
          ].map((lvl) => (
            <button
              key={lvl.key}
              type="button"
              className={`acc-level-pill ${levelFilter === lvl.key ? 'active' : ''}`}
              onClick={() => setLevelFilter(lvl.key)}
            >
              {lvl.label}
            </button>
          ))}
        </div>

        <div style={{ marginRight: 'auto', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
          معروض: <strong>{matchingAccountIds !== null ? matchingAccountIds.size : accounts.length}</strong> من أصل {accounts.length} حساب
        </div>
      </div>

      {/* ── Compact Tree Table ── */}
      <div className="acc-table-card" style={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        <table className="acc-compact-tree-table">
          <thead>
            <tr>
              <th style={{ width: '110px' }}>كود الحساب</th>
              <th>اسم الحساب المحاسبي (التسلسل الهرمي)</th>
              <th style={{ width: '80px', textAlign: 'center' }}>المستوى</th>
              <th style={{ width: '100px', textAlign: 'center' }}>النوع</th>
              <th style={{ width: '80px', textAlign: 'center' }}>الطبيعة</th>
              <th style={{ width: '150px', textAlign: 'left' }}>الرصيد الحالي</th>
              <th style={{ width: '90px', textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rootAccounts.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--muted, #64748b)' }}>
                  لم يتم العثور على حسابات مطابقة.
                </td>
              </tr>
            ) : (
              rootAccounts.map((root) => renderCompactRow(root, 0))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
