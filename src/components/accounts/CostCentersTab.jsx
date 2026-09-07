import React, { useState } from 'react';

/**
 * CostCentersTab.jsx
 * دليل مراكز التكلفة للفروع والأقسام (Cost Centers Management)
 * يدعم إضافة، تعديل، وحذف مراكز التكلفة بشكل كامل
 */
export default function CostCentersTab({
  costCenters = [],
  branches = [],
  onSaveCostCenter,
  onDeleteCostCenter,
}) {
  const [editingCostCenter, setEditingCostCenter] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getBranchName = (bId) => {
    if (!bId) return 'عام / بدون فرع';
    const found = branches.find((b) => b.id === bId);
    return found ? found.name : `فرع #${bId}`;
  };

  const handleOpenAdd = () => {
    setEditingCostCenter(null);
    const nextNum = costCenters.length + 1;
    setCode(`CC-${String(nextNum).padStart(3, '0')}`);
    setName('');
    setBranchId('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cc) => {
    setEditingCostCenter(cc);
    setCode(cc.code || '');
    setName(cc.name || '');
    setBranchId(cc.branch_id || '');
    setIsActive(cc.is_active !== false);
    setIsModalOpen(true);
  };

  const handleDelete = (cc) => {
    const ok = window.confirm(`هل أنت متأكد من حذف مركز التكلفة (${cc.name} - ${cc.code})؟\nيرجى التأكد من عدم وجود قيود محاسبية معلقة عليه.`);
    if (ok && onDeleteCostCenter) {
      onDeleteCostCenter(cc.id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    onSaveCostCenter({
      id: editingCostCenter ? editingCostCenter.id : `cc-${Date.now()}`,
      code: code.trim(),
      name: name.trim(),
      branch_id: branchId || null,
      is_active: isActive,
    });

    setIsModalOpen(false);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
            دليل مراكز التكلفة والأبعاد التحليلية ({costCenters.length})
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
            توزيع المصروفات والإيرادات على مستوى الفروع والأقسام (صيدليات، مخازن، إدارة)
          </p>
        </div>

        <button
          type="button"
          className="acc-btn acc-btn-primary"
          onClick={handleOpenAdd}
        >
          ➕ إضافة مركز تكلفة جديد
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
        {costCenters.map((cc) => (
          <div
            key={cc.id}
            style={{
              background: 'var(--surface, #ffffff)',
              border: '1px solid var(--border, #e2e8f0)',
              borderTop: '3.5px solid #0d9488',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: 'var(--acc-shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span className="acc-code-badge">{cc.code}</span>
                <span style={{
                  fontSize: '11px',
                  background: cc.is_active !== false ? '#ecfdf5' : '#fef2f2',
                  color: cc.is_active !== false ? '#047857' : '#b91c1c',
                  border: `1px solid ${cc.is_active !== false ? '#a7f3d0' : '#fecaca'}`,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: '700',
                }}>
                  {cc.is_active !== false ? 'نشط' : 'معطل'}
                </span>
              </div>

              <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
                {cc.name}
              </h4>

              <div style={{ fontSize: '12.5px', color: 'var(--muted, #64748b)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                <span>🏢 الفرع المرتبط:</span>
                <strong style={{ color: 'var(--text-secondary, #334155)' }}>{getBranchName(cc.branch_id)}</strong>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: '12px' }}>
              <button
                type="button"
                className="acc-btn acc-btn-outline"
                style={{ flex: 1, padding: '6px 10px', fontSize: '12px', justifyContent: 'center' }}
                onClick={() => handleOpenEdit(cc)}
                title="تعديل بيانات مركز التكلفة"
              >
                ✏️ تعديل
              </button>
              <button
                type="button"
                className="acc-btn"
                style={{ padding: '6px 12px', fontSize: '12px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                onClick={() => handleDelete(cc)}
                title="حذف مركز التكلفة"
              >
                🗑️ حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="acc-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <form onSubmit={handleSubmit}>
              <div className="acc-modal-header">
                <h2>{editingCostCenter ? 'تعديل مركز التكلفة' : 'إضافة مركز تكلفة جديد'}</h2>
                <button type="button" className="acc-action-icon-btn" onClick={() => setIsModalOpen(false)}>
                  ✕
                </button>
              </div>

              <div className="acc-modal-body hide-scrollbar">
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
                    placeholder="مثلاً: صيدلية فرع سموحة"
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
                        📍 {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="acc-form-group">
                  <label>حالة النشاط:</label>
                  <select
                    className="acc-form-select"
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                  >
                    <option value="true">نشط (يقبل ترحيل قيود)</option>
                    <option value="false">معطل / موقوف مؤقتاً</option>
                  </select>
                </div>
              </div>

              <div className="acc-modal-footer">
                <button type="button" className="acc-btn acc-btn-outline" onClick={() => setIsModalOpen(false)}>
                  إلغاء
                </button>
                <button type="submit" className="acc-btn acc-btn-primary">
                  💾 {editingCostCenter ? 'حفظ التعديلات' : 'إضافة المركز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
