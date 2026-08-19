import React, { useState } from 'react';
import { apiArchiveSaveEmployee, apiArchiveDeleteEmployee } from '../../utils/archiveApiClient';

export default function ArchiveEmployeesTab({
  employees = [],
  onOpenEmployeeModal,
  onEmployeeSaved = () => {}
}) {
  const [search, setSearch] = useState('');
  const [editingEmp, setEditingEmp] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (e.name || '').toLowerCase().includes(q) || (e.role || '').toLowerCase().includes(q) || (e.phone || '').includes(q);
  });

  const handleToggleActive = async (emp) => {
    try {
      await apiArchiveSaveEmployee({
        id: emp.id,
        name: emp.name,
        role: emp.role,
        phone: emp.phone,
        active: !emp.active
      });
      onEmployeeSaved();
    } catch (err) {
      alert('فشل تحديث حالة الموظف');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    setDeletingId(id);
    try {
      const res = await apiArchiveDeleteEmployee(id);
      if (res.success) {
        onEmployeeSaved();
      } else {
        alert(res.error || 'فشل حذف الموظف');
      }
    } catch (e) {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmp || !editingEmp.name.trim()) return;

    try {
      const res = await apiArchiveSaveEmployee(editingEmp);
      if (res.success) {
        setEditingEmp(null);
        onEmployeeSaved();
      }
    } catch (err) {
      alert('فشل حفظ التعديلات');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Search & Actions Bar */}
      <div className="arch-filter-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="arch-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 ابحث عن موظف بالاسم أو الدور الوظيفي..."
            />
          </div>
          <button
            type="button"
            className="arch-btn-primary"
            onClick={onOpenEmployeeModal}
          >
            ➕ إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="arch-table-card">
        <div className="arch-table-header">
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
            👥 طاقم عمل الأرشيف والاستلام ({filtered.length})
          </h3>
        </div>

        <div className="arch-table-responsive">
          <table className="arch-table">
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>المسمى الوظيفي</th>
                <th>الهاتف</th>
                <th>الحالة</th>
                <th>فواتير استلمها</th>
                <th>فواتير أدخلها</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    لا يوجد موظفين مسجلين في الأرشيف
                  </td>
                </tr>
              ) : (
                filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: 800, color: '#f8fafc' }}>{emp.name}</td>
                    <td>
                      <span className="arch-badge purple">{emp.role || 'أمين مخزن'}</span>
                    </td>
                    <td style={{ color: '#94a3b8' }}>{emp.phone || '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(emp)}
                        className={`arch-badge ${emp.active ? 'green' : 'gray'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="انقر لتغيير الحالة"
                      >
                        {emp.active ? '🟢 نشط' : '⚪ غير نشط'}
                      </button>
                    </td>
                    <td>
                      <span className="arch-badge blue">{emp.received_count || 0} فاتورة</span>
                    </td>
                    <td>
                      <span className="arch-badge amber">{emp.entered_count || 0} فاتورة</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="arch-btn-secondary"
                          onClick={() => setEditingEmp({ ...emp })}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          type="button"
                          className="arch-btn-danger"
                          onClick={() => handleDelete(emp.id)}
                          disabled={deletingId === emp.id}
                        >
                          {deletingId === emp.id ? '⏳' : '🗑️'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="arch-modal-overlay" onClick={() => setEditingEmp(null)}>
          <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="arch-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✏️</span>
                <h3>تعديل بيانات الموظف</h3>
              </div>
              <button className="arch-btn-icon" onClick={() => setEditingEmp(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="arch-input-group">
                  <label className="arch-input-label">اسم الموظف *</label>
                  <input
                    type="text"
                    className="arch-input"
                    value={editingEmp.name || ''}
                    onChange={(e) => setEditingEmp({ ...editingEmp, name: e.target.value })}
                    required
                  />
                </div>

                <div className="arch-input-group">
                  <label className="arch-input-label">المسمى الوظيفي</label>
                  <select
                    className="arch-select"
                    value={editingEmp.role || 'أمين مخزن'}
                    onChange={(e) => setEditingEmp({ ...editingEmp, role: e.target.value })}
                  >
                    <option value="أمين مخزن">أمين مخزن</option>
                    <option value="مدخل بيانات">مدخل بيانات</option>
                    <option value="صيدلي أول">صيدلي أول</option>
                    <option value="مدير فرع">مدير فرع</option>
                    <option value="محاسب">محاسب</option>
                  </select>
                </div>

                <div className="arch-input-group">
                  <label className="arch-input-label">الهاتف</label>
                  <input
                    type="text"
                    className="arch-input"
                    value={editingEmp.phone || ''}
                    onChange={(e) => setEditingEmp({ ...editingEmp, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="arch-modal-footer">
                <button type="button" className="arch-btn-secondary" onClick={() => setEditingEmp(null)}>إلغاء</button>
                <button type="submit" className="arch-btn-primary">💾 حفظ التعديلات</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
