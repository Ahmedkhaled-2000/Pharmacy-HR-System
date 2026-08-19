import React, { useState } from 'react';
import { apiArchiveSaveSupplier, apiArchiveDeleteSupplier } from '../../utils/archiveApiClient';

export default function ArchiveSuppliersTab({
  suppliers = [],
  onSelectSupplier,
  onSupplierSaved = () => {}
}) {
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const filteredSuppliers = suppliers.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) || (s.phone || '').includes(q);
  });

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const res = await apiArchiveSaveSupplier({
        name: name.trim(),
        phone,
        email,
        address,
        taxNumber,
        notes
      });
      if (res.success) {
        setName('');
        setPhone('');
        setEmail('');
        setAddress('');
        setTaxNumber('');
        setNotes('');
        setIsAddOpen(false);
        onSupplierSaved();
      } else {
        alert(res.error || 'فشل حفظ المورد');
      }
    } catch (err) {
      alert('حدث خطأ أثناء حفظ المورد');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('هل أنت متأكد من حذف هذا المورد؟')) return;

    setDeletingId(id);
    try {
      const res = await apiArchiveDeleteSupplier(id);
      if (res.success) {
        onSupplierSaved();
      } else {
        alert(res.error || 'فشل حذف المورد');
      }
    } catch (err) {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
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
              placeholder="🔍 ابحث عن مورد أو شركة بالاسم أو رقم الهاتف..."
            />
          </div>
          <button
            type="button"
            className="arch-btn-primary"
            onClick={() => setIsAddOpen(true)}
          >
            ➕ إضافة مورد جديد
          </button>
        </div>
      </div>

      {/* Suppliers Table Card */}
      <div className="arch-table-card">
        <div className="arch-table-header">
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
            🏢 دليل الشركات والموردين ({filteredSuppliers.length})
          </h3>
        </div>

        <div className="arch-table-responsive">
          <table className="arch-table">
            <thead>
              <tr>
                <th>اسم الشركة / المورد</th>
                <th>الهاتف</th>
                <th>البريد الإلكتروني</th>
                <th>الرقم الضريبي</th>
                <th>عدد الفواتير</th>
                <th>إجمالي المعاملات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    لا يوجد موردين مسجلين
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
                  <tr key={s.id} onClick={() => onSelectSupplier(s)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 800, color: '#f8fafc' }}>{s.name}</td>
                    <td style={{ color: '#94a3b8' }}>{s.phone || '—'}</td>
                    <td style={{ color: '#94a3b8' }}>{s.email || '—'}</td>
                    <td>{s.taxNumber || s.tax_number || '—'}</td>
                    <td>
                      <span className="arch-badge blue">{s.invoices_count || 0} فاتورة</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#34d399' }}>
                      {(parseFloat(s.total_invoiced || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="arch-btn-secondary"
                          onClick={() => onSelectSupplier(s)}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          ⚙️ التفاصيل والمطابقة
                        </button>
                        <button
                          type="button"
                          className="arch-btn-danger"
                          onClick={(e) => handleDelete(s.id, e)}
                          disabled={deletingId === s.id}
                        >
                          {deletingId === s.id ? '⏳' : '🗑️'}
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

      {/* Add Supplier Modal */}
      {isAddOpen && (
        <div className="arch-modal-overlay" onClick={() => setIsAddOpen(false)}>
          <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="arch-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢</span>
                <h3>إضافة مورد جديد</h3>
              </div>
              <button className="arch-btn-icon" onClick={() => setIsAddOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="arch-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="arch-input-label">اسم الشركة أو المورد *</label>
                  <input type="text" className="arch-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="شركة المتحدون فارما" required autoFocus />
                </div>
                <div className="arch-input-group">
                  <label className="arch-input-label">الهاتف</label>
                  <input type="text" className="arch-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010xxxxxxxx" />
                </div>
                <div className="arch-input-group">
                  <label className="arch-input-label">البريد الإلكتروني</label>
                  <input type="email" className="arch-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@example.com" />
                </div>
                <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="arch-input-label">الرقم الضريبي</label>
                  <input type="text" className="arch-input" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="السجل الضريبي" />
                </div>
                <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="arch-input-label">العنوان</label>
                  <input type="text" className="arch-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="عنوان المورد" />
                </div>
                <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="arch-input-label">ملاحظات</label>
                  <textarea className="arch-input" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
                </div>
              </div>

              <div className="arch-modal-footer">
                <button type="button" className="arch-btn-secondary" onClick={() => setIsAddOpen(false)}>إلغاء</button>
                <button type="submit" className="arch-btn-primary" disabled={isSaving}>
                  {isSaving ? 'جاري الحفظ...' : '💾 حفظ المورد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
