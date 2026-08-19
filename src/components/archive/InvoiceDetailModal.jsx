import React, { useState } from 'react';
import { apiArchiveUpdateInvoice } from '../../utils/archiveApiClient';

export default function InvoiceDetailModal({
  invoice,
  onClose,
  suppliers = [],
  employees = [],
  onInvoiceUpdated = () => {}
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber || invoice?.invoice_number || '');
  const [supplierId, setSupplierId] = useState(invoice?.supplierId || invoice?.supplier_id || '');
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const d = invoice?.invoiceDate || invoice?.invoice_date;
    return d ? new Date(d).toISOString().split('T')[0] : '';
  });
  const [receiverId, setReceiverId] = useState(invoice?.receiverId || invoice?.receiver_id || '');
  const [entryClerkId, setEntryClerkId] = useState(invoice?.entryClerkId || invoice?.entry_clerk_id || '');
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [items, setItems] = useState(invoice?.items || []);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!invoice) return null;

  const calculatedTotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || item.unit_price || 0)), 0);
  const calculatedDiscount = items.reduce((sum, item) => sum + (parseFloat(item.discount || 0)), 0);
  const calculatedNet = calculatedTotal - calculatedDiscount;

  const handleUpdateItem = (idx, field, value) => {
    const next = [...items];
    next[idx][field] = value;
    if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
      const q = parseFloat(next[idx].quantity) || 0;
      const u = parseFloat(next[idx].unitPrice || next[idx].unit_price) || 0;
      const d = parseFloat(next[idx].discount) || 0;
      next[idx].totalPrice = (q * u) - d;
    }
    setItems(next);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `item_${Date.now()}_${items.length}`,
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        totalPrice: 0,
        sellingPrice: null,
        batchNumber: '',
        expiryDate: ''
      }
    ]);
  };

  const handleRemoveItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        id: invoice.id,
        invoiceNumber,
        supplierId,
        invoiceDate,
        totalAmount: calculatedTotal,
        discount: calculatedDiscount,
        netAmount: calculatedNet,
        status: invoice.status || 'ARCHIVED',
        receiverId: receiverId || null,
        entryClerkId: entryClerkId || null,
        notes,
        items
      };

      const res = await apiArchiveUpdateInvoice(payload);
      if (res.success) {
        onInvoiceUpdated();
        setIsEditing(false);
      } else {
        setErrorMsg(res.error || 'فشل تحديث الفاتورة');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsSaving(false);
    }
  };

  const supplierName = invoice.supplier?.name || suppliers.find(s => s.id === supplierId)?.name || 'مورد عام';
  const receiverName = invoice.receiver?.name || employees.find(e => e.id === receiverId)?.name || '—';
  const clerkName = invoice.entryClerk?.name || employees.find(e => e.id === entryClerkId)?.name || '—';
  const fileUrl = invoice.fileUrl || invoice.file_url;

  return (
    <div className="arch-modal-overlay" onClick={onClose}>
      <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '980px' }}>
        
        {/* Header */}
        <div className="arch-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div>
              <h3>فاتورة رقم: {invoiceNumber}</h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                المورد: {supplierName} · التاريخ: {invoiceDate}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={isEditing ? 'arch-btn-secondary' : 'arch-btn-primary'}
              onClick={() => setIsEditing(!isEditing)}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              {isEditing ? 'إلغاء التعديل' : '✏️ تعديل الفاتورة'}
            </button>
            <button className="arch-btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {errorMsg && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '10px 16px', color: '#f87171', fontSize: '0.85rem' }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Invoice Info Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.5)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #334155'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '3px' }}>رقم الفاتورة</div>
              {isEditing ? (
                <input type="text" className="arch-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              ) : (
                <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '0.95rem' }}>{invoiceNumber}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '3px' }}>المورد</div>
              {isEditing ? (
                <select className="arch-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <div style={{ fontWeight: 800, color: '#60a5fa', fontSize: '0.95rem' }}>{supplierName}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '3px' }}>تاريخ الفاتورة</div>
              {isEditing ? (
                <input type="date" className="arch-input" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              ) : (
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>{invoiceDate}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '3px' }}>أمين العهدة المستلم</div>
              {isEditing ? (
                <select className="arch-select" value={receiverId} onChange={(e) => setReceiverId(e.target.value)}>
                  <option value="">-- غير محدد --</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              ) : (
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>{receiverName}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '3px' }}>مدخل البيانات</div>
              {isEditing ? (
                <select className="arch-select" value={entryClerkId} onChange={(e) => setEntryClerkId(e.target.value)}>
                  <option value="">-- غير محدد --</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              ) : (
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>{clerkName}</div>
              )}
            </div>

            {fileUrl && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="arch-btn-secondary"
                  style={{ width: '100%', textDecoration: 'none', padding: '8px 12px', fontSize: '0.8rem' }}
                >
                  👁️ استعراض الملف المرفوع
                </a>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                📦 بنود وأصناف الفاتورة ({items.length})
              </h4>
              {isEditing && (
                <button type="button" className="arch-btn-secondary" onClick={handleAddItem} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                  ➕ إضافة صنف
                </button>
              )}
            </div>

            <div className="arch-table-responsive" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table className="arch-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الكمية</th>
                    <th>سعر الوحدة</th>
                    <th>الخصم</th>
                    <th>الإجمالي</th>
                    <th>سعر البيع</th>
                    <th>الباتش</th>
                    <th>الصلاحية</th>
                    {isEditing && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={isEditing ? 9 : 8} style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                        لا توجد بنود مفصلة لهذه الفاتورة
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td style={{ fontWeight: 700 }}>
                          {isEditing ? (
                            <input
                              type="text"
                              className="arch-input"
                              value={item.productName || item.product_name || ''}
                              onChange={(e) => handleUpdateItem(idx, 'productName', e.target.value)}
                            />
                          ) : (
                            item.productName || item.product_name
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              className="arch-input"
                              value={item.quantity}
                              onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              className="arch-input"
                              value={item.unitPrice || item.unit_price || 0}
                              onChange={(e) => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                              step="0.01"
                            />
                          ) : (
                            parseFloat(item.unitPrice || item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              className="arch-input"
                              value={item.discount || 0}
                              onChange={(e) => handleUpdateItem(idx, 'discount', e.target.value)}
                              step="0.01"
                            />
                          ) : (
                            parseFloat(item.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
                          )}
                        </td>
                        <td style={{ fontWeight: 800, color: '#60a5fa' }}>
                          {(parseFloat(item.totalPrice || item.total_price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {item.sellingPrice || item.selling_price ? `${parseFloat(item.sellingPrice || item.selling_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td>{item.batchNumber || item.batch_number || '—'}</td>
                        <td>{item.expiryDate || item.expiry_date || '—'}</td>
                        {isEditing && (
                          <td>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              🗑️
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            background: 'rgba(15, 23, 42, 0.7)',
            padding: '14px 20px',
            borderRadius: '14px',
            border: '1px solid #334155'
          }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              المجموع قبل الخصم: <strong style={{ color: '#f8fafc' }}>{calculatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</strong>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              إجمالي الخصم: <strong style={{ color: '#fbbf24' }}>{calculatedDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</strong>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399' }}>
              صافي الفاتورة: {calculatedNet.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="arch-modal-footer">
          {isEditing && (
            <button
              type="button"
              className="arch-btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'جاري الحفظ...' : '💾 حفظ التعديلات'}
            </button>
          )}
          <button type="button" className="arch-btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
