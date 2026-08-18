import React, { useState, useMemo } from 'react';

export default function BranchPhonesDirectoryModal({ isOpen, onClose, branches = [], employees = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'mobile' | 'landline' | 'whatsapp'
  const [copiedId, setCopiedId] = useState(null);

  // Helper to extract clean digits for tel / whatsapp
  const cleanDigits = (numStr) => String(numStr || '').replace(/\D/g, '');

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPhoneTypeInfo = (type) => {
    switch (type) {
      case 'landline':
        return { label: 'خط أرضي', icon: '☎️', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
      case 'whatsapp':
        return { label: 'واتساب', icon: '💬', bg: '#dcfce7', color: '#15803d', border: '#86efac' };
      case 'mobile':
      default:
        return { label: 'هاتف / محمول', icon: '📱', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
    }
  };

  // Prepare normalized list of branches with all their numbers
  const branchList = useMemo(() => {
    return branches.map((b) => {
      const manager = employees.find((e) => String(e.id) === String(b.managerId));
      
      // Build phone list from phones array or fallback to legacy single phone
      let phoneList = [];
      if (Array.isArray(b.phones) && b.phones.length > 0) {
        phoneList = b.phones.filter((p) => p && p.number && p.number.trim());
      } else if (b.phone && b.phone.trim()) {
        phoneList = [{ id: 'p_legacy', number: b.phone.trim(), type: 'landline' }];
      }

      return {
        ...b,
        managerName: manager?.name || 'غير محدد',
        managerCode: manager?.code || '',
        phoneList
      };
    });
  }, [branches, employees]);

  // Filtered branches
  const filteredBranches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return branchList.filter((b) => {
      // 1. Search Query Match
      const matchesSearch = !q || (
        (b.name && b.name.toLowerCase().includes(q)) ||
        (b.branchCode && b.branchCode.toLowerCase().includes(q)) ||
        (b.address && b.address.toLowerCase().includes(q)) ||
        (b.managerName && b.managerName.toLowerCase().includes(q)) ||
        b.phoneList.some((p) => cleanDigits(p.number).includes(q) || p.number.includes(q))
      );

      // 2. Type Filter Match
      const matchesType = typeFilter === 'all' || b.phoneList.some((p) => (p.type || 'mobile') === typeFilter);

      return matchesSearch && matchesType;
    });
  }, [branchList, searchQuery, typeFilter]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div
        className="modal-card"
        style={{
          maxWidth: '850px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px', background: 'var(--primary-light)', padding: '8px', borderRadius: '12px' }}>📞</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)', fontFamily: 'Cairo' }}>
                دليل أرقام وتواصل الفروع
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                عرض جميع أرقام الهواتف، الخطوط الأرضية، وأرقام الواتساب لكافة الفروع
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '18px', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 ابحث باسم الفرع، الكود، المدير، أو رقم الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ep-input"
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13.5px' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '14px' }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'mobile', label: '📱 محمول' },
              { id: 'landline', label: '☎️ أرضي' },
              { id: 'whatsapp', label: '💬 واتساب' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: typeFilter === t.id ? 'var(--primary)' : 'var(--surface-muted)',
                  color: typeFilter === t.id ? '#ffffff' : 'var(--text)',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Directory List Container */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
          {filteredBranches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>لا توجد فروع أو أرقام مطابقة لبحثك</p>
            </div>
          ) : (
            filteredBranches.map((branch) => {
              const displayPhones = typeFilter === 'all' 
                ? branch.phoneList 
                : branch.phoneList.filter((p) => (p.type || 'mobile') === typeFilter);

              return (
                <div
                  key={branch.id}
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '16px 18px',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  {/* Branch Main Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px', borderBottom: '1px dashed var(--border)', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15.5px', color: 'var(--text)' }}>
                        🏢 {branch.name}
                      </span>
                      <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                        {branch.branchCode || branch.id}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                      👤 مدير الفرع: <strong style={{ color: 'var(--primary-dark)' }}>{branch.managerName}</strong> {branch.managerCode && `(${branch.managerCode})`}
                    </div>
                  </div>

                  {branch.address && (
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '12px' }}>
                      📍 <strong>العنوان:</strong> {branch.address}
                    </div>
                  )}

                  {/* Phone Numbers List */}
                  <div>
                    {displayPhones.length === 0 ? (
                      <div style={{ fontSize: '12.5px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        لا توجد أرقام مسجلة لهذا الفرع في هذا التصنيف.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {displayPhones.map((p, idx) => {
                          const pInfo = getPhoneTypeInfo(p.type);
                          const cleanNum = cleanDigits(p.number);
                          const cardKey = `${branch.id}_phone_${idx}`;
                          const isCopied = copiedId === cardKey;

                          return (
                            <div
                              key={p.id || idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: pInfo.bg,
                                border: `1px solid ${pInfo.border}`,
                                borderRadius: '10px',
                                padding: '6px 12px'
                              }}
                            >
                              <span style={{ fontSize: '14px' }}>{pInfo.icon}</span>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '10px', fontWeight: 'bold', color: pInfo.color }}>
                                  {pInfo.label}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', direction: 'ltr', textAlign: 'right' }}>
                                  {p.number}
                                </span>
                              </div>

                              {/* Quick Actions */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px', borderRight: `1px solid ${pInfo.border}`, paddingRight: '6px' }}>
                                {p.type === 'whatsapp' ? (
                                  <a
                                    href={`https://wa.me/${cleanNum.startsWith('0') ? '2' + cleanNum : cleanNum}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="فتح محادثة واتساب"
                                    style={{
                                      background: '#22c55e',
                                      color: '#fff',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '11.5px',
                                      textDecoration: 'none',
                                      fontWeight: 'bold',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    💬 واتساب
                                  </a>
                                ) : (
                                  <a
                                    href={`tel:${cleanNum}`}
                                    title="اتصال بالرقم"
                                    style={{
                                      background: '#0284c7',
                                      color: '#fff',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '11.5px',
                                      textDecoration: 'none',
                                      fontWeight: 'bold',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    📞 اتصال
                                  </a>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleCopy(p.number, cardKey)}
                                  title="نسخ الرقم"
                                  style={{
                                    background: isCopied ? '#10b981' : 'var(--surface)',
                                    color: isCopied ? '#fff' : 'var(--text)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '11.5px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  {isCopied ? '✓ تم النسخ' : '📋 نسخ'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            إجمالي الفروع: <strong>{branchList.length}</strong> · المعروضة: <strong>{filteredBranches.length}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
