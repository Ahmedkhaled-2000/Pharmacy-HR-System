import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  FileText,
  Printer,
  ExternalLink,
  Edit3,
  Save,
  Building,
  Calendar,
  UserCheck,
  UserPen,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  DollarSign,
  AlertCircle,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  UploadCloud,
  Search,
  StickyNote,
  Eye,
  Download
} from 'lucide-react';
import {
  apiArchiveUpdateInvoice,
  apiArchiveDeleteInvoice,
  apiArchiveAttachInvoiceFile,
  apiArchiveRemoveInvoiceFile,
  apiArchiveUploadFile
} from '../../utils/archiveApiClient';
import { useUI } from '../../context/UIContext';

export default function InvoiceDetailModal({
  invoice: initialInvoice,
  onClose,
  suppliers = [],
  employees = [],
  settings = {},
  onInvoiceUpdated = () => {},
  onInvoiceDeleted = () => {}
}) {
  const { showConfirm } = useUI();
  const [currentInvoice, setCurrentInvoice] = useState(initialInvoice || null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editable Form State
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [entryClerkId, setEntryClerkId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);

  // Document Attachment State
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const fileInputRef = useRef(null);

  // Embedded Excel Spreadsheet Viewer State
  const [excelSheets, setExcelSheets] = useState([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [isLoadingExcel, setIsLoadingExcel] = useState(false);
  const [excelError, setExcelError] = useState('');
  const [excelSearchQuery, setExcelSearchQuery] = useState('');
  const [activeViewTab, setActiveViewTab] = useState('items'); // 'items' | 'excel' | 'preview'

  const pharmacyName = settings?.PHARMACY_NAME || 'صيدليات مداواة';
  const pharmacyLogo = settings?.PHARMACY_LOGO || '';

  useEffect(() => {
    if (initialInvoice) {
      setCurrentInvoice(initialInvoice);
      setInvoiceNumber(initialInvoice.invoiceNumber || initialInvoice.invoice_number || '');
      setSupplierId(initialInvoice.supplierId || initialInvoice.supplier_id || initialInvoice.supplier?.id || '');
      setSupplierName(initialInvoice.supplierName || initialInvoice.supplier_name || initialInvoice.supplier?.name || '');
      
      const rawDate = initialInvoice.invoiceDate || initialInvoice.invoice_date;
      setInvoiceDate(rawDate ? new Date(rawDate).toISOString().split('T')[0] : '');
      
      setReceiverId(initialInvoice.receiverId || initialInvoice.receiver_id || '');
      setEntryClerkId(initialInvoice.entryClerkId || initialInvoice.entry_clerk_id || '');
      setNotes(initialInvoice.notes || '');
      setItems(initialInvoice.items || []);
    }
  }, [initialInvoice]);

  // Load and parse attached Excel document if available
  useEffect(() => {
    if (!currentInvoice) return;
    const fileName = currentInvoice.fileName || currentInvoice.file_name || '';
    const fileType = currentInvoice.fileType || currentInvoice.file_type || '';
    const url = currentInvoice.fileUrl || currentInvoice.file_url || '';

    const isExcel =
      /\.(xlsx|xls|csv)/i.test(fileName || url) ||
      fileType.includes('spreadsheet') ||
      fileType.includes('excel') ||
      fileType.includes('csv');

    if (isExcel && url) {
      loadExcelDocument(url);
    } else {
      setExcelSheets([]);
    }
  }, [currentInvoice]);

  const loadExcelDocument = async (fileUrl) => {
    setIsLoadingExcel(true);
    setExcelError('');

    try {
      let workbook;
      if (fileUrl.startsWith('data:')) {
        const base64Data = fileUrl.replace(/^data:[^;]+;base64,/, '');
        workbook = XLSX.read(base64Data, { type: 'base64' });
      } else {
        const res = await fetch(fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      }

      const sheets = [];
      workbook.SheetNames.forEach((name) => {
        const ws = workbook.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows && rows.length > 0) {
          sheets.push({ sheetName: name, rows });
        }
      });

      if (sheets.length > 0) {
        setExcelSheets(sheets);
        setActiveSheetIndex(0);
      }
    } catch (err) {
      console.warn('Failed to parse excel preview:', err);
      setExcelError('تعذر عرض شيتات الإكسل المدمجة.');
    } finally {
      setIsLoadingExcel(false);
    }
  };

  if (!initialInvoice || !currentInvoice) return null;

  // Live calculations
  const totalGross = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity || 0);
    const price = parseFloat(item.unitPrice || item.unit_price || 0);
    return sum + (qty * price);
  }, 0);

  const totalDiscount = items.reduce((sum, item) => {
    return sum + parseFloat(item.discount || 0);
  }, 0);

  const totalNet = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity || 0);
    const price = parseFloat(item.unitPrice || item.unit_price || 0);
    const disc = parseFloat(item.discount || 0);
    const rowTotal = item.totalPrice !== undefined && item.totalPrice !== null && !isNaN(parseFloat(item.totalPrice))
      ? parseFloat(item.totalPrice)
      : (qty * price - disc);
    return sum + (isNaN(rowTotal) ? 0 : rowTotal);
  }, 0);

  const handleItemChange = (idx, field, value) => {
    const next = [...items];
    const row = { ...next[idx], [field]: value };

    const qty = parseFloat(row.quantity || 1);
    const price = parseFloat(row.unitPrice || 0);
    const disc = parseFloat(row.discount || 0);

    if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
      row.totalPrice = Math.round((qty * price - disc) * 100) / 100;
    }

    next[idx] = row;
    setItems(next);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `item_${Date.now()}`,
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

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const selectedSupObj = suppliers.find((s) => String(s.id) === String(supplierId));
      const payload = {
        id: currentInvoice.id,
        invoiceNumber: invoiceNumber.trim(),
        supplierId,
        supplierName: selectedSupObj?.name || supplierName,
        invoiceDate,
        totalAmount: Math.round(totalGross * 100) / 100,
        discount: Math.round(totalDiscount * 100) / 100,
        netAmount: Math.round(totalNet * 100) / 100,
        status: currentInvoice.status || 'ARCHIVED',
        receiverId: receiverId || null,
        entryClerkId: entryClerkId || null,
        notes,
        items
      };

      const res = await apiArchiveUpdateInvoice(payload);
      if (res.success) {
        setIsEditing(false);
        setSuccessMsg('تم حفظ التعديلات بنجاح!');
        setCurrentInvoice((prev) => ({ ...prev, ...payload }));
        onInvoiceUpdated({ ...currentInvoice, ...payload });
      } else {
        setErrorMsg(res.error || 'فشل تحديث بيانات الفاتورة');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await showConfirm({
      title: 'حذف الفاتورة نهائياً',
      message: 'هل أنت متأكد من رغبتك في حذف هذه الفاتورة نهائياً من الأرشيف؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    try {
      const res = await apiArchiveDeleteInvoice(currentInvoice.id);
      if (res.success) {
        onInvoiceDeleted(currentInvoice.id);
        onClose();
      } else {
        setErrorMsg(res.error || 'فشل حذف الفاتورة');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء حذف الفاتورة');
    }
  };

  const handleAttachFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const b64 = event.target?.result;
        let fileUrl = b64;

        try {
          const uploadRes = await apiArchiveUploadFile(file.name, file.type, b64);
          if (uploadRes && uploadRes.fileUrl) {
            fileUrl = uploadRes.fileUrl;
          }
        } catch {}

        const attachRes = await apiArchiveAttachInvoiceFile(currentInvoice.id, {
          fileUrl,
          fileName: file.name,
          fileType: file.type || file.name.split('.').pop()
        });

        if (attachRes.success) {
          setCurrentInvoice((prev) => ({
            ...prev,
            fileUrl,
            fileName: file.name,
            fileType: file.type
          }));
          setSuccessMsg('تم إرفاق الملف بنجاح!');
        } else {
          setErrorMsg(attachRes.error || 'فشل إرفاق الملف');
        }
        setIsUploadingDoc(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErrorMsg('تعذر رفع الملف المرفق');
      setIsUploadingDoc(false);
    }
  };

  const handleRemoveAttachedFile = async () => {
    const isConfirmed = await showConfirm({
      title: 'حذف الملف المرفق',
      message: 'هل تريد حذف الملف المرفق من الفاتورة نهائياً؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    try {
      const res = await apiArchiveRemoveInvoiceFile(currentInvoice.id);
      if (res.success) {
        setCurrentInvoice((prev) => ({
          ...prev,
          fileUrl: null,
          fileName: null,
          fileType: null
        }));
        setSuccessMsg('تم حذف الملف المرفق');
      }
    } catch {
      setErrorMsg('فشل حذف الملف');
    }
  };

  const exportInvoiceToExcel = () => {
    try {
      const exportRows = items.map((it, idx) => ({
        '#': idx + 1,
        'اسم الصنف': it.productName || it.product_name,
        'الكمية': it.quantity,
        'سعر الوحدة': it.unitPrice || it.unit_price,
        'الخصم': it.discount,
        'الإجمالي': it.totalPrice || it.total_price,
        'سعر الجمهور': it.sellingPrice || it.selling_price || '-',
        'رقم التشغيلة': it.batchNumber || it.batch_number || '-',
        'تاريخ الصلاحية': it.expiryDate || it.expiry_date || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Invoice_Items');
      XLSX.writeFile(wb, `فاتورة_${invoiceNumber || currentInvoice.id}.xlsx`);
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredItems = items.filter((it) => {
    if (!itemSearchQuery.trim()) return true;
    const q = itemSearchQuery.toLowerCase();
    const name = (it.productName || it.product_name || '').toLowerCase();
    const batch = (it.batchNumber || it.batch_number || '').toLowerCase();
    return name.includes(q) || batch.includes(q);
  });

  const fileUrl = currentInvoice.fileUrl || currentInvoice.file_url;
  const fileName = currentInvoice.fileName || currentInvoice.file_name;
  const isImage = fileUrl && (/\.(jpg|jpeg|png|webp|gif)/i.test(fileName || fileUrl) || fileUrl.startsWith('data:image'));
  const isPdf = fileUrl && (/\.pdf/i.test(fileName || fileUrl) || fileUrl.startsWith('data:application/pdf'));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isFullscreen ? '0' : '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', sans-serif"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: isFullscreen ? '0' : '24px',
          width: isFullscreen ? '100vw' : '100%',
          maxWidth: isFullscreen ? '100vw' : '1200px',
          height: isFullscreen ? '100vh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to left, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <FileText size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                  فاتورة رقم: {invoiceNumber || currentInvoice.invoiceNumber || currentInvoice.id}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '2px 10px',
                    borderRadius: '999px',
                    fontWeight: '700'
                  }}
                >
                  مؤرشفة
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                المورد: <strong style={{ color: '#cbd5e1' }}>{supplierName || currentInvoice.supplier?.name || 'مورد عام'}</strong> | التاريخ: <strong style={{ color: '#cbd5e1' }}>{invoiceDate || '-'}</strong>
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={exportInvoiceToExcel}
              title="تصدير بنود الفاتورة إلى إكسل"
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #334155',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                color: '#34d399',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <Download size={14} />
              <span>إكسل</span>
            </button>

            <button
              onClick={handlePrint}
              title="طباعة الفاتورة"
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #334155',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                color: '#cbd5e1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <Printer size={14} />
              <span>طباعة</span>
            </button>

            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}
              >
                <Edit3 size={14} />
                <span>تعديل</span>
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: '700'
                }}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                <span>حفظ</span>
              </button>
            )}

            <button
              onClick={handleDelete}
              title="حذف الفاتورة"
              style={{
                padding: '8px',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Trash2 size={16} />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
              style={{
                padding: '8px',
                borderRadius: '10px',
                border: '1px solid #334155',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            <button
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* View Selection Navigation Tabs */}
        <div
          style={{
            padding: '10px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0b1329'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setActiveViewTab('items')}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: activeViewTab === 'items' ? '#2563eb' : 'transparent',
                color: activeViewTab === 'items' ? '#ffffff' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileText size={14} />
              <span>بنود وأصناف الفاتورة ({items.length})</span>
            </button>

            {excelSheets.length > 0 && (
              <button
                onClick={() => setActiveViewTab('excel')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '700',
                  backgroundColor: activeViewTab === 'excel' ? '#059669' : 'transparent',
                  color: activeViewTab === 'excel' ? '#ffffff' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <FileSpreadsheet size={14} />
                <span>شيتات الإكسل التفاعلية ({excelSheets.length})</span>
              </button>
            )}

            {fileUrl && (
              <button
                onClick={() => setActiveViewTab('preview')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '700',
                  backgroundColor: activeViewTab === 'preview' ? '#7c3aed' : 'transparent',
                  color: activeViewTab === 'preview' ? '#ffffff' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Eye size={14} />
                <span>معاينة المستند المرفق</span>
              </button>
            )}
          </div>

          {/* Attachment Quick Status & Attach Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAttachFile}
              style={{ display: 'none' }}
            />
            {fileUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  مرفق: <strong style={{ color: '#38bdf8' }}>{fileName || 'مستند الفاتورة'}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingDoc}
                  style={{
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  استبدال
                </button>
                <button
                  type="button"
                  onClick={handleRemoveAttachedFile}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    padding: '4px',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingDoc}
                style={{
                  background: 'rgba(59, 130, 246, 0.1)',
                  border: '1px dashed #3b82f6',
                  color: '#60a5fa',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isUploadingDoc ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                <span>إرفاق مستند/صورة للفاتورة</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMsg && (
            <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Invoice Summary Cards Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '12px 16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>إجمالي الفاتورة:</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#f8fafc', margin: '4px 0 0 0' }}>
                {(Math.round(totalGross * 100) / 100).toLocaleString()} ج.م
              </p>
            </div>

            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '12px 16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>إجمالي الخصم:</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#f87171', margin: '4px 0 0 0' }}>
                {(Math.round(totalDiscount * 100) / 100).toLocaleString()} ج.م
              </p>
            </div>

            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '12px 16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>صافي المطلوب:</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#34d399', margin: '4px 0 0 0' }}>
                {(Math.round(totalNet * 100) / 100).toLocaleString()} ج.م
              </p>
            </div>

            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '12px 16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>أمين العهدة:</span>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#e2e8f0', margin: '4px 0 0 0' }}>
                {employees.find((e) => String(e.id) === String(receiverId))?.name || currentInvoice.receiver?.name || 'غير محدد'}
              </p>
            </div>

            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '14px', padding: '12px 16px' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>مدخل البيانات:</span>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#e2e8f0', margin: '4px 0 0 0' }}>
                {employees.find((e) => String(e.id) === String(entryClerkId))?.name || currentInvoice.entryClerk?.name || 'غير محدد'}
              </p>
            </div>
          </div>

          {/* Editable Details Form when isEditing is true */}
          {isEditing && (
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid #334155',
                borderRadius: '16px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  رقم الفاتورة:
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  المورد / الشركة:
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  تاريخ الفاتورة:
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  ملاحظات الفاتورة:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                />
              </div>
            </div>
          )}

          {/* TAB 1: Items Table View */}
          {activeViewTab === 'items' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ position: 'relative', width: '280px' }}>
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder="بحث في الأصناف أو التشغيلة..."
                    style={{
                      width: '100%',
                      padding: '8px 32px 8px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Search size={14} style={{ position: 'absolute', right: '10px', top: '10px', color: '#64748b' }} />
                </div>

                {isEditing && (
                  <button
                    type="button"
                    onClick={handleAddItem}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#2563eb',
                      color: '#fff',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={14} />
                    <span>إضافة صنف جديد</span>
                  </button>
                )}
              </div>

              <div style={{ border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#0f172a' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1e293b', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '12px 14px' }}>#</th>
                      <th style={{ padding: '12px 14px' }}>اسم الصنف / الدواء</th>
                      <th style={{ padding: '12px 14px' }}>الكمية</th>
                      <th style={{ padding: '12px 14px' }}>سعر الوحدة</th>
                      <th style={{ padding: '12px 14px' }}>الخصم</th>
                      <th style={{ padding: '12px 14px' }}>الإجمالي</th>
                      <th style={{ padding: '12px 14px' }}>سعر الجمهور</th>
                      <th style={{ padding: '12px 14px' }}>التشغيلة</th>
                      <th style={{ padding: '12px 14px' }}>الصلاحية</th>
                      {isEditing && <th style={{ padding: '12px 14px', textAlign: 'center' }}>إجراءات</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={isEditing ? 10 : 9} style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                          لا توجد بنود مطابقة
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => (
                        <tr
                          key={item.id || idx}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.2)'
                          }}
                        >
                          <td style={{ padding: '10px 14px', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '10px 14px', fontWeight: '600', color: '#f8fafc' }}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={item.productName || item.product_name || ''}
                                onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              item.productName || item.product_name
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                value={item.quantity || 1}
                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              item.quantity
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={item.unitPrice || item.unit_price || 0}
                                onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                                style={{ width: '80px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              `${item.unitPrice || item.unit_price || 0} ج.م`
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#f87171' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={item.discount || 0}
                                onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                                style={{ width: '80px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              `${item.discount || 0} ج.م`
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: '700', color: '#34d399' }}>
                            {item.totalPrice || item.total_price || 0} ج.م
                          </td>
                          <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={item.sellingPrice || item.selling_price || ''}
                                onChange={(e) => handleItemChange(idx, 'sellingPrice', e.target.value)}
                                placeholder="سعر الجمهور"
                                style={{ width: '80px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              item.sellingPrice || item.selling_price ? `${item.sellingPrice || item.selling_price} ج.م` : '-'
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={item.batchNumber || item.batch_number || ''}
                                onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                                placeholder="رقم الباتش"
                                style={{ width: '90px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              item.batchNumber || item.batch_number || '-'
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {isEditing ? (
                              <input
                                type="date"
                                value={item.expiryDate || item.expiry_date || ''}
                                onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                                style={{ width: '120px', padding: '6px 8px', borderRadius: '6px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                              />
                            ) : (
                              item.expiryDate || item.expiry_date || '-'
                            )}
                          </td>
                          {isEditing && (
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                              >
                                <Trash2 size={14} />
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
          )}

          {/* TAB 2: Embedded Interactive Excel Viewer */}
          {activeViewTab === 'excel' && excelSheets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Sheet selection bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', padding: '8px 12px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {excelSheets.map((sh, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveSheetIndex(idx)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        backgroundColor: activeSheetIndex === idx ? '#059669' : 'rgba(15, 23, 42, 0.6)',
                        color: activeSheetIndex === idx ? '#ffffff' : '#94a3b8'
                      }}
                    >
                      {sh.sheetName}
                    </button>
                  ))}
                </div>

                <div style={{ position: 'relative', width: '240px' }}>
                  <input
                    type="text"
                    value={excelSearchQuery}
                    onChange={(e) => setExcelSearchQuery(e.target.value)}
                    placeholder="بحث في خلايا الشيت..."
                    style={{ width: '100%', padding: '6px 28px 6px 10px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '11px' }}
                  />
                  <Search size={12} style={{ position: 'absolute', right: '8px', top: '8px', color: '#64748b' }} />
                </div>
              </div>

              {/* Sheet table */}
              <div style={{ border: '1px solid #1e293b', borderRadius: '14px', overflow: 'auto', maxHeight: '500px', backgroundColor: '#0f172a' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'right' }}>
                  <tbody>
                    {excelSheets[activeSheetIndex]?.rows
                      ?.filter((row) => {
                        if (!excelSearchQuery.trim()) return true;
                        const q = excelSearchQuery.toLowerCase();
                        return row.some((cell) => String(cell || '').toLowerCase().includes(q));
                      })
                      .map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            backgroundColor: rIdx === 0 ? '#1e293b' : rIdx % 2 === 0 ? 'transparent' : 'rgba(30, 41, 59, 0.2)'
                          }}
                        >
                          <td style={{ padding: '8px 10px', color: '#64748b', borderLeft: '1px solid #1e293b', width: '40px' }}>
                            {rIdx + 1}
                          </td>
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              style={{
                                padding: '8px 12px',
                                color: rIdx === 0 ? '#38bdf8' : '#e2e8f0',
                                fontWeight: rIdx === 0 ? '700' : 'normal',
                                borderLeft: '1px solid #1e293b'
                              }}
                            >
                              {String(cell !== undefined && cell !== null ? cell : '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Document Attachment Previewer */}
          {activeViewTab === 'preview' && fileUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', justifyContent: 'center', minHeight: '400px', backgroundColor: '#0b1329', borderRadius: '16px', padding: '20px' }}>
              {isImage ? (
                <img
                  src={fileUrl}
                  alt="Invoice Attachment"
                  style={{ maxWidth: '100%', maxHeight: '600px', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
                />
              ) : isPdf ? (
                <iframe
                  src={fileUrl}
                  title="PDF Preview"
                  style={{ width: '100%', height: '600px', borderRadius: '12px', border: '1px solid #334155' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <FileText size={48} style={{ color: '#38bdf8', margin: '0 auto 16px auto' }} />
                  <p style={{ color: '#f8fafc', fontSize: '14px', fontWeight: '700' }}>
                    {fileName || 'مستند مرفق'}
                  </p>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '8px 16px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '12px', fontWeight: '700' }}
                  >
                    <ExternalLink size={14} />
                    <span>فتح وتنزيل الملف في نافذة جديدة</span>
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
