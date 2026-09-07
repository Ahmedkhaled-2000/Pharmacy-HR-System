import React, { useState } from 'react';

/**
 * CostCentersTab.jsx
 * دليل مراكز التكلفة للفروع والأقسام (Cost Centers Management)
 */
export default function CostCentersTab({
  costCenters = [],
  branches = [],
  onSaveCostCenter,
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getBranchName = (bId) => {
    if (!bId) return 'عام / بدون فرع';
    const found = branches.find((b) => b.id === bId);
    return found ? found.name : `فرع #${bId}`;
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    onSaveCostCenter({
      id: `cc-${Date.now()}`,
      code: code.trim(),
      name: name.trim(),
      branch_id: branchId || null,
      is_active: true,
    });

    setCode('');
    setName('');
    setBranchId('');
    setIsModalOpen(false);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#fff' }}>
            دليل مراكز التكلفة والأبعاد التحليلية ({costCenters.length})
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            توزيع المصروفات والإيرادات على مستوى الفروع والأقسام (صيدليات، مخازن، إدارة)
          </p>
        </div>

        <button
          type="button"
          className="acc-btn acc-btn-primary"
          onClick={() => {
            const nextNum = costCenters.length + 1;
            setCode(`CC-${String(nextNum).padStart(3, '0')}`);
            setIsModalOpen(true);
          }}
        >
          ➕ إضافة مركز تكلفة جديد
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {costCenters.map((cc) => (
          <div
            key={cc.id}
            style={{
              background: 'rgba(30, 41, 59, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '18px 20px',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span className="acc-code-badge">{cc.code}</span>
              <span style={{ fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                نشط
              </span>
            </div>

            <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '800', color: '#fff' }}>
              {cc.name}
            </h4>

            <div style={{ fontSize: '12.5px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏢 الفرع المرتبط:</span>
              <strong style={{ color: '#cbd5e1' }}>{getBranchName(cc.branch_id)}</strong>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="acc-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreate}>
              <div className="acc-modal-header">
                <h2>إضافة مركز تكلفة جديد</h2>
                <button type="button" className="acc-action-icon-btn" onClick={() => setIsModalOpen(false)}>
                  ✕
                </button>
              </div>

              <div className="acc-modal-body">
                <div className="acc-form-group">
                  <label>كود مركز التكلفة:</label>
                  <input
                    type="text"
                    className="acc-form-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                </div>

                <div className="acc-form-group">
                  <label>اسم مركز التكلفة (الفرع / القسم):</label>
                  <input
                    type="text"
                    className="acc-form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثلاً: صيدلية فرع سيدي بشر"
                    required
                  />
                </div>

                <div className="acc-form-group">
                  <label>الفرع التابع له:</label>
                  <select
                    className="acc-form-select"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">-- عام / الإدارة المركزية --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="acc-modal-footer">
                <button type="button" className="acc-btn acc-btn-outline" onClick={() => setIsModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="acc-btn acc-btn-primary">
                  💾 حفظ مركز التكلفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
