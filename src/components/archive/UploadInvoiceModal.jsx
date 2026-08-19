import React, { useState, useRef } from 'react';
import { performSmartExtraction } from '../../utils/archiveAiService';
import { apiArchiveSaveInvoice, apiArchiveUploadFile } from '../../utils/archiveApiClient';

export default function UploadInvoiceModal({
  isOpen,
  onClose,
  suppliers = [],
  employees = [],
  settings = {},
  onInvoiceSaved = () => {}
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [mimeType, setMimeType] = useState('');

  // AI Extraction status
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Invoice Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiverId, setReceiverId] = useState('');
  const [entryClerkId, setEntryClerkId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadMode, setUploadMode] = useState('AUTO_EXTRACT');

  // Items List
  const [items, setItems] = useState([]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file) => {
    setSelectedFile(file);
    setMimeType(file.type || 'image/jpeg');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result;
      setFileBase64(base64);
      setFilePreview(file.type.startsWith('image/') ? base64 : null);

      // Auto trigger AI extraction if image or PDF
      if (uploadMode === 'AUTO_EXTRACT') {
        runAiExtraction(base64, file.type, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const runAiExtraction = async (base64, type, fileName) => {
    setIsExtracting(true);
    setExtractStatus('جاري التحليل واستخراج البنود بالذكاء الاصطناعي...');
    setErrorMsg('');

    try {
      const extracted = await performSmartExtraction(base64, type, settings, (msg) => setExtractStatus(msg));

      if (extracted) {
        if (extracted.invoiceNumber) setInvoiceNumber(extracted.invoiceNumber);
        if (extracted.invoiceDate) setInvoiceDate(extracted.invoiceDate);
        if (extracted.supplierName) {
          setSupplierName(extracted.supplierName);
          const foundSup = suppliers.find(s => s.name.toLowerCase().includes(extracted.supplierName.toLowerCase()) || extracted.supplierName.toLowerCase().includes(s.name.toLowerCase()));
          if (foundSup) setSupplierId(foundSup.id);
        }

        if (Array.isArray(extracted.items) && extracted.items.length > 0) {
          setItems(extracted.items);
        } else {
          // Add default empty row
          setItems([{
            id: `item_1`,
            productName: 'صنف فاتورة',
            quantity: 1,
            unitPrice: extracted.netAmount || extracted.totalAmount || 0,
            discount: extracted.discount || 0,
            totalPrice: extracted.netAmount || extracted.totalAmount || 0,
            sellingPrice: null,
            batchNumber: '',
            expiryDate: ''
          }]);
        }
      }
    } catch (err) {
      console.error('AI extraction error:', err);
      setErrorMsg('تعذر الاستخراج الآلي الكامل، يمكنك إدخال البيانات يدوياً');
    } finally {
      setIsExtracting(false);
      setExtractStatus('');
    }
  };

  // Item Management
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

  const handleUpdateItem = (idx, field, value) => {
    const next = [...items];
    next[idx][field] = value;

    if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
      const q = parseFloat(next[idx].quantity) || 0;
      const u = parseFloat(next[idx].unitPrice) || 0;
      const d = parseFloat(next[idx].discount) || 0;
      next[idx].totalPrice = (q * u) - d;
    }

    setItems(next);
  };

  const handleRemoveItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  // Calculations
  const calculatedTotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)), 0);
  const calculatedDiscount = items.reduce((sum, item) => sum + (parseFloat(item.discount || 0)), 0);
  const calculatedNet = calculatedTotal - calculatedDiscount;

  // Submit Handler
  const handleSave = async () => {
    setErrorMsg('');

    if (!invoiceNumber.trim()) {
      setErrorMsg('يرجى إدخال رقم الفاتورة');
      return;
    }

    setIsSaving(true);
    try {
      let savedFileUrl = '';
      if (selectedFile) {
        const uploadRes = await apiArchiveUploadFile(selectedFile, selectedFile.name);
        if (uploadRes.success) {
          savedFileUrl = uploadRes.fileUrl;
        }
      }

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        supplierId: supplierId || null,
        supplierName: supplierName || 'مورد عام',
        invoiceDate,
        totalAmount: calculatedTotal,
        discount: calculatedDiscount,
        netAmount: calculatedNet,
        status: 'ARCHIVED',
        fileUrl: savedFileUrl || fileBase64 || null,
        fileName: selectedFile?.name || 'invoice.pdf',
        fileType: mimeType || 'application/pdf',
        uploadMode,
        receiverId: receiverId || null,
        entryClerkId: entryClerkId || null,
        notes,
        items
      };

      const res = await apiArchiveSaveInvoice(payload);
      if (res.success) {
        onInvoiceSaved();
        onClose();
      } else {
        setErrorMsg(res.error || 'فشل حفظ الفاتورة');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء حفظ الفاتورة في قاعدة البيانات');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="arch-modal-overlay" onClick={onClose}>
      <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '960px' }}>
        
        {/* Header */}
        <div className="arch-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>➕</span>
            <div>
              <h3>رفع وأرشفة فاتورة جديدة</h3>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                استخراج ذكي بالذكاء الاصطناعي أو إدخال يدوي مباشر
              </span>
            </div>
          </div>
          <button className="arch-btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '10px 16px',
              color: '#f87171',
              fontSize: '0.85rem'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            className="arch-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,application/pdf,.csv,.xlsx,.xls"
              style={{ display: 'none' }}
            />
            
            <div className="arch-dropzone-icon">
              {isExtracting ? '⏳' : selectedFile ? '📄' : '📤'}
            </div>

            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc', marginBottom: '4px' }}>
                {selectedFile ? selectedFile.name : 'اضغط لاختيار ملف الفاتورة أو اسحبه إلى هنا'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                يدعم ملفات PDF، صور الأدوية (PNG/JPG)، وشيتات الإكسل (XLSX/CSV)
              </div>
            </div>

            {isExtracting && (
              <div style={{ color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="arch-animate-pulse">✨</span>
                <span>{extractStatus}</span>
              </div>
            )}
          </div>

          {/* Invoice Header Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            background: 'rgba(15, 23, 42, 0.4)',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid #334155'
          }}>
            
            <div className="arch-input-group">
              <label className="arch-input-label">رقم الفاتورة *</label>
              <input
                type="text"
                className="arch-input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-12345"
                required
              />
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">المورد / الشركة *</label>
              <select
                className="arch-select"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  const sel = suppliers.find(s => s.id === e.target.value);
                  if (sel) setSupplierName(sel.name);
                }}
              >
                <option value="">-- اختر أو اكتب المورد --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {!supplierId && (
              <div className="arch-input-group">
                <label className="arch-input-label">اسم المورد الجديد</label>
                <input
                  type="text"
                  className="arch-input"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="شركة ابن سينا فارما"
                />
              </div>
            )}

            <div className="arch-input-group">
              <label className="arch-input-label">تاريخ الفاتورة *</label>
              <input
                type="date"
                className="arch-input"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">الموظف المستلم (أمين العهدة)</label>
              <select
                className="arch-select"
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
              >
                <option value="">-- اختياري --</option>
                {employees.filter(e => e.active).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            <div className="arch-input-group">
              <label className="arch-input-label">مدخل البيانات</label>
              <select
                className="arch-select"
                value={entryClerkId}
                onChange={(e) => setEntryClerkId(e.target.value)}
              >
                <option value="">-- اختياري --</option>
                {employees.filter(e => e.active).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Line Items Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#f8fafc' }}>
                📦 بنود وأصناف الفاتورة ({items.length})
              </h4>
              <button
                type="button"
                className="arch-btn-secondary"
                onClick={handleAddItem}
                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
              >
                ➕ إضافة صنف
              </button>
            </div>

            <div className="arch-table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table className="arch-table">
                <thead>
                  <tr>
                    <th>اسم الصنف / الدواء</th>
                    <th style={{ width: '80px' }}>الكمية</th>
                    <th style={{ width: '100px' }}>سعر الوحدة</th>
                    <th style={{ width: '90px' }}>الخصم</th>
                    <th style={{ width: '110px' }}>الإجمالي</th>
                    <th style={{ width: '110px' }}>سعر البيع</th>
                    <th style={{ width: '100px' }}>الباتش</th>
                    <th style={{ width: '120px' }}>الصلاحية</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                        لا توجد بنود مضافة بعد. اضغط على "إضافة صنف" أو ارفع الفاتورة للاستخراج التلقائي.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>
                          <input
                            type="text"
                            className="arch-input"
                            style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            value={item.productName || ''}
                            onChange={(e) => handleUpdateItem(idx, 'productName', e.target.value)}
                            placeholder="اسم الدواء"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                            min="1"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateItem(idx, 'unitPrice', e.target.value)}
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.discount}
                            onChange={(e) => handleUpdateItem(idx, 'discount', e.target.value)}
                            step="0.01"
                          />
                        </td>
                        <td style={{ fontWeight: 800, color: '#60a5fa' }}>
                          {(item.totalPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <input
                            type="number"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.sellingPrice || ''}
                            onChange={(e) => handleUpdateItem(idx, 'sellingPrice', e.target.value)}
                            placeholder="اختياري"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.batchNumber || ''}
                            onChange={(e) => handleUpdateItem(idx, 'batchNumber', e.target.value)}
                            placeholder="Batch"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            className="arch-input"
                            style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                            value={item.expiryDate || ''}
                            onChange={(e) => handleUpdateItem(idx, 'expiryDate', e.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                            title="حذف البند"
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

          {/* Totals Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '14px 20px',
            borderRadius: '14px',
            border: '1px solid #334155'
          }}>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              الإجمالي قبل الخصم: <strong style={{ color: '#f8fafc' }}>{calculatedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</strong>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              إجمالي الخصم: <strong style={{ color: '#fbbf24' }}>{calculatedDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</strong>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#34d399' }}>
              صافي الفاتورة المستحق: {calculatedNet.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="arch-modal-footer">
          <button type="button" className="arch-btn-secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className="arch-btn-primary"
            onClick={handleSave}
            disabled={isSaving || isExtracting}
          >
            {isSaving ? 'جاري حفظ الفاتورة...' : '💾 حفظ الفاتورة في الأرشيف'}
          </button>
        </div>

      </div>
    </div>
  );
}
