import React, { useState, useMemo } from 'react';

/**
 * AccountCodesCheatsheetModal.jsx
 * نافذة منبثقة تفاعلية لعرض دليل أكواد شجرة الحسابات بالكامل
 * تتيح البحث الفوري، الفلترة حسب النوع، ونسخ الأكواد بنقرة زر واحدة
 */
export default function AccountCodesCheatsheetModal({ isOpen, onClose, accounts = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [copiedCode, setCopiedCode] = useState(null);

  const filteredAccounts = useMemo(() => {
    let list = accounts || [];
    if (selectedType !== 'all') {
      list = list.filter((a) => a.account_type === selectedType);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        (a) =>
          (a.code && a.code.toLowerCase().includes(q)) ||
          (a.name_ar && a.name_ar.toLowerCase().includes(q)) ||
          (a.name_en && a.name_en.toLowerCase().includes(q))
      );
    }
    return list;
  }, [accounts, selectedType, searchTerm]);

  if (!isOpen) return null;

  const handleCopy = (code) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

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

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="acc-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📋</span>
            <div>
              <h2>دليل أكواد شجرة الحسابات العامة (Cheatsheet)</h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                بحث سريع ونسخ أكواد الحسابات لاستخدامها في القيود والتحويلات ({filteredAccounts.length} حساب)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="acc-action-icon-btn"
            onClick={onClose}
            style={{ fontSize: '18px', padding: '6px 10px' }}
          >
            ✕
          </button>
        </div>

        {/* Toolbar & Filter */}
        <div style={{ padding: '16px 24px 8px', display: 'flex', gap: '12px', flexWrap: 'wrap', background: 'rgba(15, 23, 42, 0.4)' }}>
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              className="acc-form-input"
              placeholder="ابحث بالكود (مثلاً: 111 أو 622) أو بالاسم..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
              style={{ width: '100%' }}
            />
          </div>

          <select
            className="acc-filter-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
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

        {/* Table Body */}
        <div className="acc-modal-body" style={{ padding: '8px 24px 20px', maxHeight: '60vh' }}>
          <table className="acc-table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ width: '110px' }}>الكود المحاسبي</th>
                <th>اسم الحساب</th>
                <th style={{ width: '100px' }}>النوع</th>
                <th style={{ width: '80px' }}>الطبيعة</th>
                <th style={{ width: '90px', textAlign: 'center' }}>نسخ الكود</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    لا توجد حسابات مطابقة لمعايير البحث.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id || acc.code}>
                    <td>
                      <span className="acc-code-badge" style={{ fontSize: '13px' }}>
                        {acc.code}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: acc.is_parent ? '800' : '600', color: acc.is_parent ? '#fff' : '#cbd5e1' }}>
                          {acc.name_ar}
                        </span>
                        {acc.is_parent && (
                          <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: '4px', color: '#94a3b8' }}>
                            حساب رئيسي
                          </span>
                        )}
                      </div>
                      {acc.name_en && (
                        <div style={{ fontSize: '11px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                          {acc.name_en}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`acc-node-type-badge ${getTypeBadgeClass(acc.account_type)}`}>
                        {getTypeName(acc.account_type)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '11.5px', color: acc.nature === 'debit' ? '#34d399' : '#f87171', fontWeight: '700' }}>
                        {acc.nature === 'debit' ? 'مدين' : 'دائن'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="acc-btn acc-btn-outline"
                        onClick={() => handleCopy(acc.code)}
                        style={{ padding: '4px 10px', fontSize: '11.5px' }}
                      >
                        {copiedCode === acc.code ? '✅ تم النسخ' : '📋 نسخ'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="acc-modal-footer">
          <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
}
