import React, { useState, useMemo } from 'react';
import { getEmpDisplayName } from '../../utils/formatters';

export default function EmployeePhonesDirectoryModal({
  isOpen,
  onClose,
  employees = [],
  branches = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'mobile' | 'landline' | 'whatsapp' | 'emergency'
  const [copiedId, setCopiedId] = useState(null);

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
      case 'emergency':
        return { label: 'طوارئ / قريب', icon: '🚨', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
      case 'mobile':
      default:
        return { label: 'هاتف / محمول', icon: '📱', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
    }
  };

  const employeeList = useMemo(() => {
    return employees.map((emp) => {
      // Build branch names
      let branchNames = [];
      if (emp.branchesDetails && emp.branchesDetails.length > 0) {
        branchNames = emp.branchesDetails.map((bd) => {
          const b = branches.find((br) => String(br.id) === String(bd.branchId));
          return b ? b.name : `فرع ${bd.branchId}`;
        });
      } else if (emp.branchId) {
        const b = branches.find((br) => String(br.id) === String(emp.branchId));
        if (b) branchNames.push(b.name);
      }
      const branchDisplay = branchNames.length > 0 ? branchNames.join(' · ') : 'غير محدد';

      // Build phone list from phones array or fallback to legacy phone
      let phoneList = [];
      if (Array.isArray(emp.phones) && emp.phones.length > 0) {
        phoneList = emp.phones.filter((p) => p && p.number && p.number.trim());
      } else if (emp.phone && emp.phone.trim()) {
        phoneList = [{ id: 'p_emp_legacy', number: emp.phone.trim(), type: 'mobile' }];
      }

      // Emergency relative phone
      const emPhone = emp.relativePhone || emp.emergencyPhone || '';

      const isActive = emp.is_active !== false && emp.status === 'على رأس العمل';

      return {
        ...emp,
        branchDisplay,
        phoneList,
        emergencyPhoneNum: emPhone,
        isActive
      };
    });
  }, [employees, branches]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return employeeList.filter((emp) => {
      // Status filter
      if (statusFilter === 'active' && !emp.isActive) return false;

      // Branch filter
      if (branchFilter !== 'all') {
        const isInBranch = (emp.branchId && String(emp.branchId) === String(branchFilter)) ||
          (emp.branchesDetails && emp.branchesDetails.some((bd) => String(bd.branchId) === String(branchFilter)));
        if (!isInBranch) return false;
      }

      // Search Query filter
      const matchesSearch = !q || (
        (emp.name && emp.name.toLowerCase().includes(q)) ||
        (emp.nickname && emp.nickname.toLowerCase().includes(q)) ||
        (emp.code && emp.code.toLowerCase().includes(q)) ||
        (emp.jobTitle && emp.jobTitle.toLowerCase().includes(q)) ||
        (emp.branchDisplay && emp.branchDisplay.toLowerCase().includes(q)) ||
        emp.phoneList.some((p) => cleanDigits(p.number).includes(q) || p.number.includes(q)) ||
        (emp.emergencyPhoneNum && (cleanDigits(emp.emergencyPhoneNum).includes(q) || emp.emergencyPhoneNum.includes(q)))
      );
      if (!matchesSearch) return false;

      // Type Filter match
      if (typeFilter !== 'all') {
        if (typeFilter === 'emergency') {
          if (!emp.emergencyPhoneNum || !emp.emergencyPhoneNum.trim()) return false;
        } else {
          const hasType = emp.phoneList.some((p) => (p.type || 'mobile') === typeFilter);
          if (!hasType) return false;
        }
      }

      return true;
    });
  }, [employeeList, searchQuery, branchFilter, statusFilter, typeFilter]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div
        className="modal-card"
        style={{
          maxWidth: '920px',
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
            <span style={{ fontSize: '28px', background: 'var(--primary-light)', padding: '8px', borderRadius: '12px' }}>👥</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)', fontFamily: 'Cairo' }}>
                دليل أرقام وتواصل الموظفين
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                عرض وبحث أرقام الهواتف الشخصية والواتساب وأرقام الطوارئ لكافة العاملين
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <input
                type="text"
                placeholder="🔍 ابحث باسم الموظف، الكود، الوظيفة، أو رقم الهاتف..."
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

            {/* Branch Filter */}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="ep-input"
              style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
            >
              <option value="all">🏢 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ep-input"
              style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13px', background: 'var(--surface)' }}
            >
              <option value="active">🟢 على رأس العمل فقط</option>
              <option value="all">🌐 كافة الموظفين (بما فيهم المستقيلين)</option>
            </select>
          </div>

          {/* Type Filter Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'mobile', label: '📱 محمول' },
              { id: 'whatsapp', label: '💬 واتساب' },
              { id: 'landline', label: '☎️ أرضي' },
              { id: 'emergency', label: '🚨 طوارئ / قريب' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12.5px',
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
          {filteredEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
              <p style={{ margin: 0, fontWeight: 'bold' }}>لا يوجد موظفون أو أرقام مطابقة لبحثك</p>
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const displayPhones = typeFilter === 'all'
                ? emp.phoneList
                : typeFilter === 'emergency'
                  ? []
                  : emp.phoneList.filter((p) => (p.type || 'mobile') === typeFilter);

              const showEmergency = (typeFilter === 'all' || typeFilter === 'emergency') && emp.emergencyPhoneNum && emp.emergencyPhoneNum.trim();

              return (
                <div
                  key={emp.id}
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  {/* Employee Header Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px', borderBottom: '1px dashed var(--border)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="emp-avatar-circle" style={{ width: '40px', height: '40px', flexShrink: 0, fontSize: '15px' }}>
                        {emp.photoUrl ? <img src={emp.photoUrl} alt={getEmpDisplayName(emp)} /> : <span>{getEmpDisplayName(emp)?.charAt(0) || 'م'}</span>}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                            {getEmpDisplayName(emp)}
                          </span>
                          {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface-muted)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                              ({emp.name})
                            </span>
                          )}
                          <span className="badge badge-primary" style={{ fontSize: '11px' }}>
                            {emp.code}
                          </span>
                          {!emp.isActive && (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              تم الاستقالة
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                          💼 {emp.jobTitle || 'موظف'} · 📍 {emp.branchDisplay}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phone Badges & Quick Action Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                    {displayPhones.map((p, idx) => {
                      const pInfo = getPhoneTypeInfo(p.type);
                      const cleanNum = cleanDigits(p.number);
                      const cardKey = `${emp.id}_phone_${idx}`;
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
                                  padding: '3px 8px',
                                  fontSize: '11px',
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
                                  padding: '3px 8px',
                                  fontSize: '11px',
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
                                padding: '3px 8px',
                                fontSize: '11px',
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

                    {/* Emergency Contact Chip */}
                    {showEmergency && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '10px',
                          padding: '6px 12px'
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>🚨</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#b91c1c' }}>
                            طوارئ / قريب
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#7f1d1d', direction: 'ltr', textAlign: 'right' }}>
                            {emp.emergencyPhoneNum}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px', borderRight: '1px solid #fca5a5', paddingRight: '6px' }}>
                          <a
                            href={`tel:${cleanDigits(emp.emergencyPhoneNum)}`}
                            title="اتصال برقم الطوارئ"
                            style={{
                              background: '#dc2626',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              textDecoration: 'none',
                              fontWeight: 'bold'
                            }}
                          >
                            📞 اتصال
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(emp.emergencyPhoneNum, `${emp.id}_emerg`)}
                            title="نسخ رقم الطوارئ"
                            style={{
                              background: copiedId === `${emp.id}_emerg` ? '#10b981' : 'var(--surface)',
                              color: copiedId === `${emp.id}_emerg` ? '#fff' : 'var(--text)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              padding: '3px 8px',
                              fontSize: '11px',
                              cursor: 'pointer',
                              fontWeight: 'bold'
                            }}
                          >
                            {copiedId === `${emp.id}_emerg` ? '✓ تم النسخ' : '📋 نسخ'}
                          </button>
                        </div>
                      </div>
                    )}

                    {displayPhones.length === 0 && !showEmergency && (
                      <div style={{ fontSize: '12.5px', color: 'var(--muted)', fontStyle: 'italic' }}>
                        لا توجد أرقام هواتف مسجلة لهذا الموظف في هذا التصنيف.
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
            إجمالي الموظفين: <strong>{employeeList.length}</strong> · المعروضون: <strong>{filteredEmployees.length}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
