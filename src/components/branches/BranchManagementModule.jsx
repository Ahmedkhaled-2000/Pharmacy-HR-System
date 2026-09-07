import React, { useState } from 'react';
import BranchPhonesDirectoryModal from './BranchPhonesDirectoryModal';
import BranchAddressesModal from './BranchAddressesModal';
import BranchEditorModal from './BranchEditorModal';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function BranchManagementModule({
  state,
  onSaveBranch,
  onDeleteBranch,
  onSwitchSubTab,
  onOpenBranchRoster,
  showToast
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPhonesModalOpen, setIsPhonesModalOpen] = useState(false);
  const [showAddressesModal, setShowAddressesModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const branches = state.branches || [];
  const employees = state.employees || [];

  const handleOpenAdd = () => {
    setEditingBranch(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (branch) => {
    setEditingBranch(branch);
    setIsModalOpen(true);
  };

  const getPhoneBadge = (p) => {
    const isWhatsapp = p.type === 'whatsapp';
    const isLandline = p.type === 'landline';
    const icon = isLandline ? '☎️' : isWhatsapp ? '💬' : '📱';
    const bg = isLandline ? '#e0f2fe' : isWhatsapp ? '#dcfce7' : '#f0fdf4';
    const color = isLandline ? '#0369a1' : isWhatsapp ? '#15803d' : '#166534';
    const border = isLandline ? '#bae6fd' : isWhatsapp ? '#86efac' : '#bbf7d0';

    return (
      <span
        key={p.id || p.number}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: bg,
          color: color,
          border: `1px solid ${border}`,
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 700,
          margin: '2px 3px'
        }}
      >
        <span>{icon}</span>
        <span style={{ direction: 'ltr' }}>{p.number}</span>
      </span>
    );
  };

  return (
    <div className="bylaws-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>🏢 إدارة الفروع وتعيين المديرين</h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            إنشاء وإدارة الفروع وتكليف الموظفين كمديري فروع وإدارة أرقام الهواتف والتواصل
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowAddressesModal(true)}
            style={{
              background: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              fontWeight: 800,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📍</span> عناوين الفروع
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setIsPhonesModalOpen(true)}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid var(--primary-tint)',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> أرقام الفروع
          </button>
          <button type="button" className="btn btn-start" onClick={handleOpenAdd}>
            ➕ إضافة فرع جديد
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الفرع (Branch ID)</th>
              <th>اسم الفرع</th>
              <th>الهواتف والتواصل</th>
              <th>مدير الفرع المكلف</th>
              <th>اسم المستخدم (صفحة الفرع)</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                  لا توجد فروع مسجلة حتى الآن. انقر على "إضافة فرع جديد" للبدء.
                </td>
              </tr>
            ) : (
              branches.map((b) => {
                const manager = employees.find((e) => String(e.id) === String(b.managerId));
                
                // Get all phones
                let branchPhones = [];
                if (Array.isArray(b.phones) && b.phones.length > 0) {
                  branchPhones = b.phones.filter(p => p && p.number);
                } else if (b.phone && b.phone.trim()) {
                  branchPhones = [{ id: '1', number: b.phone.trim(), type: 'landline' }];
                }

                return (
                  <tr key={b.id}>
                    <td>
                      <span className="badge badge-primary">{b.branchCode || b.id}</span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {b.logoUrl || b.photoUrl || b.image ? (
                          <img
                            src={b.logoUrl || b.photoUrl || b.image}
                            alt={b.name}
                            style={{ width: '34px', height: '34px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }}
                          />
                        ) : (
                          <span style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary-dark)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🏢</span>
                        )}
                        <span>{b.name}</span>
                      </div>
                    </td>
                    <td>
                      {branchPhones.length === 0 ? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '260px' }}>
                          {branchPhones.map((p) => getPhoneBadge(p))}
                        </div>
                      )}
                    </td>
                    <td>
                      {manager ? (
                        <span style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                          👤 {manager.name} ({manager.code})
                        </span>
                      ) : (
                        <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          🚫 بدون مدير (مباشر للإدارة)
                        </span>
                      )}
                    </td>
                    <td>
                      <code style={{ background: 'var(--primary-tint)', padding: '2px 8px', borderRadius: '6px' }}>
                        {b.username}
                      </code>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            fontSize: '12px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={() => {
                            if (onOpenBranchRoster) {
                              onOpenBranchRoster(b.id);
                            } else if (onSwitchSubTab) {
                              onSwitchSubTab('roster');
                            }
                          }}
                        >
                          📅 جدول الفرع
                        </button>
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => handleOpenEdit(b)}>
                          ✏️ تعديل
                        </button>
                        <button type="button" className="del-btn" style={{ fontSize: '12px' }} onClick={() => onDeleteBranch(b.id)}>
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Professional Modal for Create/Edit Branch */}
      <BranchEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingBranch={editingBranch}
        branches={branches}
        employees={employees}
        onSaveBranch={onSaveBranch}
        showToast={showToast}
      />

      {/* Branch Phones Directory Modal */}
      <BranchPhonesDirectoryModal
        isOpen={isPhonesModalOpen}
        onClose={() => setIsPhonesModalOpen(false)}
        branches={branches}
        employees={employees}
      />

      {/* Branch Addresses & Locations Directory Modal */}
      <BranchAddressesModal
        isOpen={showAddressesModal}
        onClose={() => setShowAddressesModal(false)}
        branches={branches}
        employees={employees}
        onSaveBranch={onSaveBranch}
        showToast={showToast}
      />
    </div>
  );
}
