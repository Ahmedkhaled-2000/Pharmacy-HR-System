import React, { useState, useMemo } from 'react';

/**
 * ChartOfAccountsTab.jsx
 * شجرة تفاعلية بصرية متقدمة لعرض وإدارة دليل الحسابات
 * تتضمن فلترة وبحث سريع، توسيع وطي الشجرة، وزر فتح دليل الأكواد في نافذة منبثقة
 */
export default function ChartOfAccountsTab({
  accounts = [],
  onOpenAddChild,
  onOpenEditAccount,
  onOpenCodesCheatsheet,
  onOpenNewRootAccount,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(() => {
    // Expand root level (1, 2, 3, 4, 5, 6) by default
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

  // Filter accounts if search query is provided
  const matchingAccountIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const set = new Set();

    accounts.forEach((a) => {
      if (
        (a.code && a.code.toLowerCase().includes(q)) ||
        (a.name_ar && a.name_ar.toLowerCase().includes(q)) ||
        (a.name_en && a.name_en.toLowerCase().includes(q))
      ) {
        set.add(a.id);
        // Also keep parents visible
        let cur = a;
        while (cur && cur.parent_id) {
          set.add(cur.parent_id);
          cur = accounts.find((x) => x.id === cur.parent_id);
        }
      }
    });
    return set;
  }, [accounts, searchQuery]);

  const getTypeBadgeClass = (type) => {
    switch (type) {
      case 'asset': return 'type-asset';
      case 'liability': return 'type-liability';
      case 'equity': return 'type-equity';
      case 'revenue': return 'type-revenue';
      case 'cogs': return 'type-cogs';
      case 'expense': return 'type-expense';
      default: return '';
    }
  };

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

  // Recursive render node
  const renderAccountNode = (account, depth = 0) => {
    const children = childrenMap[account.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = Boolean(expandedNodes[account.id] || matchingAccountIds !== null);

    // If searching, skip non-matching nodes
    if (matchingAccountIds !== null && !matchingAccountIds.has(account.id)) {
      return null;
    }

    const paddingRight = depth * 28 + 14;

    return (
      <div key={account.id} className="acc-tree-node">
        <div
          className="acc-node-row"
          style={{ paddingRight: `${paddingRight}px` }}
          onClick={() => hasChildren && toggleNode(account.id)}
        >
          {/* Left info */}
          <div className="acc-node-left">
            {hasChildren ? (
              <span className="acc-toggle-icon" title={isExpanded ? 'طي الحساب' : 'توسيع الحساب'}>
                {isExpanded ? '▼' : '◀'}
              </span>
            ) : (
              <span className="acc-toggle-icon" style={{ opacity: 0.3 }}>•</span>
            )}

            <span className="acc-code-badge">{account.code}</span>

            <span className="acc-node-name" style={{ fontSize: account.level <= 2 ? '15px' : '13.5px' }}>
              {account.name_ar}
            </span>

            {account.name_en && (
              <span style={{ fontSize: '11px', color: '#64748b', direction: 'ltr' }}>
                ({account.name_en})
              </span>
            )}

            <span className={`acc-node-type-badge ${getTypeBadgeClass(account.account_type)}`}>
              {getTypeName(account.account_type)}
            </span>

            <span style={{ fontSize: '11px', color: account.nature === 'debit' ? '#34d399' : '#f87171', fontWeight: '700' }}>
              ({account.nature === 'debit' ? 'مدين' : 'دائن'})
            </span>
          </div>

          {/* Right actions and balance */}
          <div className="acc-node-right" onClick={(e) => e.stopPropagation()}>
            <div className="acc-node-balance" style={{ color: (account.current_balance || 0) < 0 ? '#f87171' : '#f8fafc' }}>
              {Number(account.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>ج.م</span>
            </div>

            <div className="acc-node-actions">
              <button
                type="button"
                className="acc-action-icon-btn"
                onClick={() => onOpenAddChild(account)}
                title="إضافة حساب فرعي تابع لهذا الحساب"
              >
                ➕ فرعي
              </button>

              <button
                type="button"
                className="acc-action-icon-btn"
                onClick={() => onOpenEditAccount(account)}
                title="تعديل بيانات الحساب"
              >
                ✏️
              </button>
            </div>
          </div>
        </div>

        {/* Children Render */}
        {hasChildren && isExpanded && (
          <div className="acc-tree-children">
            {children.map((child) => renderAccountNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="acc-tree-container">
      {/* Toolbar */}
      <div className="acc-tree-toolbar">
        <div className="acc-search-input-wrap">
          <span className="acc-search-icon">🔍</span>
          <input
            type="text"
            className="acc-search-input"
            placeholder="ابحث بكود الحساب أو بالاسم (عربي أو إنجليزي)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* User Requested Cheatsheet Popup Button! */}
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={onOpenCodesCheatsheet}
            style={{ borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
            title="فتح نافذة منبثقة سريعة للأكواد والبحث والنسخ"
          >
            📋 إظهار الأكواد في نافذة منبثقة
          </button>

          <button type="button" className="acc-btn acc-btn-outline" onClick={expandAll} title="توسيع كافة الفروع">
            توسيع الكل ⊞
          </button>
          <button type="button" className="acc-btn acc-btn-outline" onClick={collapseAll} title="طي الحسابات الفرعية">
            طي الكل ⊟
          </button>
          <button type="button" className="acc-btn acc-btn-primary" onClick={onOpenNewRootAccount}>
            ➕ حساب رئيسي جديد
          </button>
        </div>
      </div>

      {/* Stats Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '14px', fontSize: '13px', color: '#94a3b8' }}>
        <span>
          إجمالي حسابات الشجرة: <strong style={{ color: '#fff' }}>{accounts.length}</strong> حساب
        </span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span style={{ color: '#34d399' }}>● أصول</span>
          <span style={{ color: '#f87171' }}>● التزامات</span>
          <span style={{ color: '#60a5fa' }}>● حقوق ملكية</span>
          <span style={{ color: '#c084fc' }}>● إيرادات</span>
          <span style={{ color: '#fb923c' }}>● تكلفة مبيعات</span>
          <span style={{ color: '#fb7185' }}>● مصروفات</span>
        </div>
      </div>

      {/* Tree Content */}
      <div className="acc-tree-body">
        {rootAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
            لم يتم تهيئة شجرة الحسابات بعد.
          </div>
        ) : (
          rootAccounts.map((root) => renderAccountNode(root, 0))
        )}
      </div>
    </div>
  );
}
