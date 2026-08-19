import React, { useState, useEffect } from 'react';
import { apiArchiveGetSupplierMappings, apiArchiveSaveSupplierMappings, apiArchiveSaveSupplier } from '../../utils/archiveApiClient';

export default function SupplierDetailModal({
  supplier,
  onClose,
  onSupplierUpdated = () => {}
}) {
  const [activeSubTab, setActiveSubTab] = useState('info'); // 'info' | 'mappings'
  const [name, setName] = useState(supplier?.name || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [email, setEmail] = useState(supplier?.email || '');
  const [address, setAddress] = useState(supplier?.address || '');
  const [taxNumber, setTaxNumber] = useState(supplier?.taxNumber || supplier?.tax_number || '');
  const [notes, setNotes] = useState(supplier?.notes || '');

  // Column Mappings
  const [mappings, setMappings] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (supplier?.id) {
      loadMappings();
    }
  }, [supplier?.id]);

  if (!supplier) return null;

  const loadMappings = async () => {
    try {
      const res = await apiArchiveGetSupplierMappings(supplier.id);
      if (res.success && Array.isArray(res.mappings)) {
        setMappings(res.mappings);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddMapping = () => {
    setMappings([...mappings, { rawColumnName: '', standardField: 'productName' }]);
  };

  const handleUpdateMapping = (idx, field, value) => {
    const next = [...mappings];
    next[idx][field] = value;
    setMappings(next);
  };

  const handleRemoveMapping = (idx) => {
    setMappings(mappings.filter((_, i) => i !== idx));
  };

  const handleSaveInfo = async () => {
    setIsSaving(true);
    setMsg('');
    try {
      const res = await apiArchiveSaveSupplier({
        id: supplier.id,
        name,
        phone,
        email,
        address,
        taxNumber,
        notes
      });
      if (res.success) {
        setMsg('✅ تم حفظ بيانات المورد بنجاح');
        onSupplierUpdated();
      }
    } catch (e) {
      setMsg('❌ فشل حفظ البيانات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMappings = async () => {
    setIsSaving(true);
    setMsg('');
    try {
      const res = await apiArchiveSaveSupplierMappings(supplier.id, mappings);
      if (res.success) {
        setMsg('✅ تم حفظ تعيين الأعمدة بنجاح');
        onSupplierUpdated();
      }
    } catch (e) {
      setMsg('❌ فشل حفظ التعيين');
    } finally {
      setIsSaving(false);
    }
  };

  const standardFieldOptions = [
    { value: 'productName', label: 'اسم الصنف / الدواء' },
    { value: 'quantity', label: 'الكمية' },
    { value: 'unitPrice', label: 'سعر الشراء / الوحدة' },
    { value: 'discount', label: 'الخصم' },
    { value: 'totalPrice', label: 'إجمالي السعر' },
    { value: 'sellingPrice', label: 'سعر الجمهور / البيع' },
    { value: 'batchNumber', label: 'رقم التشغيلة / الباتش' },
    { value: 'expiryDate', label: 'تاريخ الصلاحية' },
  ];

  return (
    <div className="arch-modal-overlay" onClick={onClose}>
      <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        
        {/* Header */}
        <div className="arch-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🏢</span>
            <div>
              <h3>تفاصيل المورد: {supplier.name}</h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                عدد الفواتير: {supplier.invoices_count || 0} · إجمالي المعاملات: {(parseFloat(supplier.total_invoiced || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
              </span>
            </div>
          </div>
          <button className="arch-btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px 24px', borderBottom: '1px solid #334155', background: 'rgba(15, 23, 42, 0.4)' }}>
          <button
            type="button"
            className={`arch-nav-btn ${activeSubTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('info')}
          >
            📋 البيانات الأساسية
          </button>
          <button
            type="button"
            className={`arch-nav-btn ${activeSubTab === 'mappings' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('mappings')}
          >
            📊 تعيين أعمدة الإكسل (Column Mappings)
          </button>
        </div>

        {/* Body */}
        <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {msg && (
            <div style={{
              background: msg.startsWith('✅') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${msg.startsWith('✅') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '12px',
              padding: '10px 16px',
              color: msg.startsWith('✅') ? '#34d399' : '#f87171',
              fontSize: '0.85rem'
            }}>
              {msg}
            </div>
          )}

          {activeSubTab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="arch-input-group">
                <label className="arch-input-label">اسم الشركة / المورد *</label>
                <input type="text" className="arch-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="arch-input-group">
                <label className="arch-input-label">رقم الهاتف</label>
                <input type="text" className="arch-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010xxxxxxxx" />
              </div>

              <div className="arch-input-group">
                <label className="arch-input-label">البريد الإلكتروني</label>
                <input type="email" className="arch-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="supplier@example.com" />
              </div>

              <div className="arch-input-group">
                <label className="arch-input-label">السجل أو الرقم الضريبي</label>
                <input type="text" className="arch-input" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="123-456-789" />
              </div>

              <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="arch-input-label">العنوان</label>
                <input type="text" className="arch-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان أو الفرع" />
              </div>

              <div className="arch-input-group" style={{ gridColumn: '1 / -1' }}>
                <label className="arch-input-label">ملاحظات إضافية</label>
                <textarea className="arch-input" rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات المورد..." />
              </div>
            </div>
          )}

          {activeSubTab === 'mappings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                يمكنك هنا مطابقة أسماء الأعمدة في شيتات الإكسل الصادرة من هذا المورد لتسهيل قراءتها واستخراج بنود الفواتير تلقائياً دون أخطاء.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="arch-btn-secondary" onClick={handleAddMapping} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                  ➕ إضافة مطابقة عمود
                </button>
              </div>

              <div className="arch-table-responsive">
                <table className="arch-table">
                  <thead>
                    <tr>
                      <th>اسم العمود في ملف المورد (Raw Column)</th>
                      <th>الحقل المعياري المقابل في النظام</th>
                      <th style={{ width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>
                          لم يتم تحديد مطابقة أعمدة خاصة بعد. النظام سيستخدم المطابقة الذكية الافتراضية.
                        </td>
                      </tr>
                    ) : (
                      mappings.map((m, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="text"
                              className="arch-input"
                              value={m.rawColumnName || m.raw_column_name || ''}
                              onChange={(e) => handleUpdateMapping(idx, 'rawColumnName', e.target.value)}
                              placeholder="مثال: Item Name أو اسم الصنف"
                            />
                          </td>
                          <td>
                            <select
                              className="arch-select"
                              value={m.standardField || m.standard_field || 'productName'}
                              onChange={(e) => handleUpdateMapping(idx, 'standardField', e.target.value)}
                            >
                              {standardFieldOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleRemoveMapping(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="arch-modal-footer">
          {activeSubTab === 'info' ? (
            <button type="button" className="arch-btn-primary" onClick={handleSaveInfo} disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : '💾 حفظ بيانات المورد'}
            </button>
          ) : (
            <button type="button" className="arch-btn-primary" onClick={handleSaveMappings} disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : '💾 حفظ تعيين الأعمدة'}
            </button>
          )}
          <button type="button" className="arch-btn-secondary" onClick={onClose}>إغلاق</button>
        </div>

      </div>
    </div>
  );
}
