import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  FilePlus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  Edit2,
  Calendar,
  Building2,
  User,
  Sparkles,
  FileText,
  DollarSign,
  Layers
} from 'lucide-react';
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
  const [activeMode, setActiveMode] = useState('AI_EXTRACT'); // 'AI_EXTRACT' | 'EXCEL_EXTRACT' | 'DIRECT_UPLOAD'

  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [mimeType, setMimeType] = useState('');

  // AI & Processing States
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiverId, setReceiverId] = useState('');
  const [entryClerkId, setEntryClerkId] = useState('');
  const [notes, setNotes] = useState('');

  // Items
  const [items, setItems] = useState([]);

  if (!isOpen) return null;

  const handleFileSelected = (file) => {
    if (!file) return;
    setSelectedFile(file);
    setErrorMsg('');
    setSuccessMsg('');

    const type = file.type || '';
    setMimeType(type);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = e.target?.result;
      setFileBase64(b64);
      setFilePreview(type.startsWith('image/') ? b64 : null);

      // Auto start extraction if not direct upload
      if (activeMode !== 'DIRECT_UPLOAD') {
        runExtraction(file, b64);
      }
    };
    reader.readAsDataURL(file);
  };

  const runExtraction = async (file, b64) => {
    setIsExtracting(true);
    setExtractStatus('جاري فحص وقراءة بيانات الفاتورة واستخراج البنود بالذكاء الاصطناعي...');
    setErrorMsg('');

    try {
      const data = await performSmartExtraction(file, b64, settings, suppliers);
      if (data) {
        if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);
        if (data.invoiceDate) setInvoiceDate(data.invoiceDate.split('T')[0]);
        if (data.supplierId) setSupplierId(data.supplierId);
        if (data.notes) setNotes(data.notes);
        if (Array.isArray(data.items) && data.items.length > 0) {
          setItems(data.items);
        }
        setSuccessMsg(`تم بنجاح استخراج بيانات الفاتورة و(${data.items?.length || 0}) صنف!`);
      }
    } catch (err) {
      console.error('Smart extraction error:', err);
      setErrorMsg('تعذر استخراج بعض البيانات تلقائياً، يمكنك إدخالها يدوياً.');
    } finally {
      setIsExtracting(false);
      setExtractStatus('');
    }
  };

  // Item Table Handlers
  const handleAddItemRow = () => {
    setItems([
      ...items,
      {
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        netPrice: 0,
        totalPrice: 0,
        batchNumber: '',
        expiryDate: ''
      }
    ]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    // Auto-calculate Net & Total
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice || item.publicPrice) || 0;
    const disc = parseFloat(item.discount) || 0;

    const netUnit = price * (1 - disc / 100);
    item.netPrice = Math.round(netUnit * 100) / 100;
    item.totalPrice = Math.round(netUnit * qty * 100) / 100;

    updated[index] = item;
    setItems(updated);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculate totals
  const totalGross = items.reduce((acc, it) => acc + ((parseFloat(it.unitPrice || it.publicPrice) || 0) * (parseFloat(it.quantity) || 0)), 0);
  const totalNet = items.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0);
  const totalDiscount = Math.max(0, totalGross - totalNet);

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setErrorMsg('يرجى كتابة رقم الفاتورة');
      return;
    }
    if (!supplierId) {
      setErrorMsg('يرجى اختيار المورد / الشركة');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let driveFileId = '';
      let driveViewLink = '';

      // Upload file to Google Drive if selected
      if (selectedFile && fileBase64) {
        setExtractStatus('جاري رفع وأرشفة ملف الفاتورة على Google Drive...');
        try {
          const uploadRes = await apiArchiveUploadFile(selectedFile.name, mimeType, fileBase64);
          if (uploadRes.success) {
            driveFileId = uploadRes.fileId;
            driveViewLink = uploadRes.webViewLink;
          }
        } catch (uploadErr) {
          console.warn('File upload to Google Drive skipped or failed:', uploadErr);
        }
      }

      const supplierObj = suppliers.find((s) => String(s.id) === String(supplierId));
      const receiverObj = employees.find((e) => String(e.id) === String(receiverId));
      const entryClerkObj = employees.find((e) => String(e.id) === String(entryClerkId));

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        supplierId,
        supplierName: supplierObj?.name || 'مورد غير محدد',
        invoiceDate,
        receiverId: receiverId || null,
        receiverName: receiverObj?.name || '',
        entryClerkId: entryClerkId || null,
        entryClerkName: entryClerkObj?.name || '',
        notes,
        totalGross: Math.round(totalGross * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        totalNet: Math.round(totalNet * 100) / 100,
        items,
        driveFileId,
        driveViewLink,
        fileName: selectedFile?.name || '',
        mimeType
      };

      const res = await apiArchiveSaveInvoice(payload);
      if (res.success) {
        onInvoiceSaved(res.invoice || payload);
        onClose();
      } else {
        setErrorMsg(res.error || 'فشل حفظ الفاتورة');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      setIsSaving(false);
      setExtractStatus('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', sans-serif"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(37, 99, 235, 0.12)',
          overflow: 'hidden',
          animation: 'archFadeIn 0.2s ease-out'
        }}
      >
        {/* Header (Matching Screenshot 2) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#070b14'
          }}
        >
          {/* Close Button on Left */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#334155';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#1e293b';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <X style={{ width: '18px', height: '18px' }} />
          </button>

          {/* Right Header Title & Cloud Icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'right' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f8fafc', margin: 0, lineHeight: 1.3 }}>
                إضافة واسترداد فواتير جديدة
              </h2>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 0', fontWeight: 500 }}>
                اختر نوع الرفع المطلوب لتحليل وتفكيك المستندات أو الأرشفة المباشرة
              </p>
            </div>

            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.35)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <UploadCloud style={{ width: '24px', height: '24px' }} />
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          
          {/* Section: Choose Processing Method (3 Cards matching Screenshot 2) */}
          <div style={{ marginBottom: '20px', textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '10px' }}>
              اختر طريقة المعالجة والرفع:
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              
              {/* Card 1: Excel Analysis */}
              <div
                onClick={() => setActiveMode('EXCEL_EXTRACT')}
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  backgroundColor: activeMode === 'EXCEL_EXTRACT' ? 'rgba(16, 185, 129, 0.08)' : '#070b14',
                  border: activeMode === 'EXCEL_EXTRACT' ? '2px solid #10b981' : '1px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'right',
                  transition: 'all 0.2s ease',
                  boxShadow: activeMode === 'EXCEL_EXTRACT' ? '0 4px 20px rgba(16, 185, 129, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {activeMode === 'EXCEL_EXTRACT' ? (
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#065f46', color: '#6ee7b7' }}>
                      محدد
                    </span>
                  ) : <div />}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <FileSpreadsheet style={{ width: '18px', height: '18px' }} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    1. تحليل ملفات الإكسل
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#34d399', margin: '4px 0 0', fontWeight: 600 }}>
                    استخراج البيانات والأصناف آلياً. (ملفات Excel فقط)
                  </p>
                </div>
              </div>

              {/* Card 2: AI Analysis (Default Selected) */}
              <div
                onClick={() => setActiveMode('AI_EXTRACT')}
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  backgroundColor: activeMode === 'AI_EXTRACT' ? 'rgba(37, 99, 235, 0.12)' : '#070b14',
                  border: activeMode === 'AI_EXTRACT' ? '2px solid #2563eb' : '1px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'right',
                  transition: 'all 0.2s ease',
                  boxShadow: activeMode === 'AI_EXTRACT' ? '0 4px 20px rgba(37, 99, 235, 0.2)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {activeMode === 'AI_EXTRACT' ? (
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#1d4ed8', color: '#bfdbfe' }}>
                      محدد
                    </span>
                  ) : <div />}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(37, 99, 235, 0.18)',
                      border: '1px solid rgba(37, 99, 235, 0.4)',
                      color: '#60a5fa',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Sparkles style={{ width: '18px', height: '18px' }} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    2. تحليل بالذكاء الاصطناعي
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#38bdf8', margin: '4px 0 0', fontWeight: 600 }}>
                    استخراج البيانات الحسابية الـ 9 آلياً. (صور و PDF فقط)
                  </p>
                </div>
              </div>

              {/* Card 3: Direct Upload */}
              <div
                onClick={() => setActiveMode('DIRECT_UPLOAD')}
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  backgroundColor: activeMode === 'DIRECT_UPLOAD' ? 'rgba(168, 85, 247, 0.08)' : '#070b14',
                  border: activeMode === 'DIRECT_UPLOAD' ? '2px solid #a855f7' : '1px solid #1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'right',
                  transition: 'all 0.2s ease',
                  boxShadow: activeMode === 'DIRECT_UPLOAD' ? '0 4px 20px rgba(168, 85, 247, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {activeMode === 'DIRECT_UPLOAD' ? (
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', backgroundColor: '#6b21a8', color: '#e9d5ff' }}>
                      محدد
                    </span>
                  ) : <div />}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      color: '#c084fc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Layers style={{ width: '18px', height: '18px' }} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                    3. أرشفة ورفع مباشر
                  </h4>
                  <p style={{ fontSize: '0.75rem', color: '#c084fc', margin: '4px 0 0', fontWeight: 600 }}>
                    رفع المستند كما هو دون استخراج. (يدعم جميع أنواع الملفات)
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Section: 9 Data Fields Information Box (Screenshot 2 Match) */}
          {activeMode === 'AI_EXTRACT' && (
            <div
              style={{
                backgroundColor: 'rgba(30, 58, 138, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '20px',
                textAlign: 'right'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#93c5fd', fontWeight: 800, fontSize: '0.775rem', marginBottom: '10px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', color: '#60a5fa', flexShrink: 0 }} />
                <span>البيانات الـ 9 التي يقوم الذكاء الاصطناعي باستخراجها:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  '1. رقم الفاتورة',
                  '2. اسم المورد / الشركة',
                  '3. تاريخ الفاتورة',
                  '4. الكميات',
                  '5. سعر الوحدة',
                  '6. الإجمالي قبل الخصم',
                  '7. الخصم',
                  '8. الصافي',
                  '9. عدد الأصناف'
                ].map((field, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#1e3a8a',
                      border: '1px solid #2563eb',
                      color: '#dbeafe'
                    }}
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Section: Dropzone Container (Screenshot 2 Match) */}
          <div style={{ marginBottom: '24px', textAlign: 'right' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
              {activeMode === 'EXCEL_EXTRACT' ? 'اختر ملف شيت الإكسل:' : 'اختر ملف الفواتير للتحليل:'}
            </label>

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileSelected(f);
              }}
              style={{
                border: '2px dashed rgba(59, 130, 246, 0.4)',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '16px',
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={activeMode === 'EXCEL_EXTRACT' ? '.xlsx,.xls,.csv' : 'image/*,.pdf,.xlsx,.xls,.csv'}
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
                style={{ display: 'none' }}
              />

              {selectedFile ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <CheckCircle2 style={{ width: '32px', height: '32px', color: '#10b981' }} />
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc', display: 'block' }}>{selectedFile.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', fontFamily: 'monospace' }}>
                      {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'ملف'}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '16px',
                      backgroundColor: '#1e3a8a',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px'
                    }}
                  >
                    <UploadCloud style={{ width: '30px', height: '30px' }} />
                  </div>
                  <p style={{ fontSize: '0.925rem', fontWeight: 900, color: '#f8fafc', margin: '0 0 6px' }}>
                    اضغط هنا أو اسحب الملفات لإدراجها في قائمة الرفع
                  </p>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', margin: 0 }}>
                    {activeMode === 'EXCEL_EXTRACT'
                      ? 'يسمح برفع ملفات الإكسل فقط (.xlsx, .xls, .csv)'
                      : 'يسمح برفع الصور والـ PDF فقط (png, jpg, pdf)'}
                  </p>
                </div>
              )}

              {isExtracting && (
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700, color: '#60a5fa' }}>
                  <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                  <span>{extractStatus}</span>
                </div>
              )}
            </div>
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#6ee7b7',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.8rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form Fields & Extracted Data Form */}
          <form onSubmit={handleSaveInvoice}>
            <div
              style={{
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px'
              }}
            >
              <h3 style={{ fontSize: '0.825rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', margin: '0 0 14px', textAlign: 'right' }}>
                📋 بيانات الفاتورة الأساسية
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', textAlign: 'right' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>رقم الفاتورة *</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="مثال: INV-10482"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      fontFamily: 'monospace',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>المورد / الشركة *</label>
                  <select
                    required
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">اختر المورد...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id} style={{ backgroundColor: '#0b1120', color: '#fff' }}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>تاريخ الفاتورة *</label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>أمين العهدة المستلم</label>
                  <select
                    value={receiverId}
                    onChange={(e) => setReceiverId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">غير محدد</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id} style={{ backgroundColor: '#0b1120', color: '#fff' }}>{e.name} ({e.role || 'موظف'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>مدخل البيانات بالأرشيف</label>
                  <select
                    value={entryClerkId}
                    onChange={(e) => setEntryClerkId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">غير محدد</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id} style={{ backgroundColor: '#0b1120', color: '#fff' }}>{e.name} ({e.role || 'موظف'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>ملاحظات الفاتورة</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي ملاحظات خاصة بالتسليم..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: '#0b1120',
                      border: '1px solid #1e293b',
                      color: '#f8fafc',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Items Table Section */}
            <div
              style={{
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '10px',
                    fontSize: '0.775rem',
                    fontWeight: 700,
                    color: '#93c5fd',
                    backgroundColor: 'rgba(30, 58, 138, 0.4)',
                    border: '1px solid #2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <Plus style={{ width: '14px', height: '14px' }} />
                  <span>إضافة صنف</span>
                </button>

                <h3 style={{ fontSize: '0.825rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  أصناف وبنود الفاتورة ({items.length})
                </h3>
              </div>

              {items.length === 0 ? (
                <p style={{ fontSize: '0.775rem', color: '#64748b', padding: '24px', textAlign: 'center', backgroundColor: '#0b1120', borderRadius: '12px', border: '1px solid #1e293b', margin: 0 }}>
                  لا توجد أصناف مضافة. سيتم استخراج الأصناف آلياً عند رفع الملف أو يمكنك النقر على "إضافة صنف".
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.75rem', color: '#cbd5e1' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0b1120', borderBottom: '1px solid #1e293b', color: '#94a3b8', fontWeight: 800 }}>
                        <th style={{ padding: '8px', width: '32px' }}>#</th>
                        <th style={{ padding: '8px', minWidth: '180px' }}>اسم الصنف / الدواء</th>
                        <th style={{ padding: '8px', width: '80px' }}>الكمية</th>
                        <th style={{ padding: '8px', width: '90px' }}>سعر الجمهور</th>
                        <th style={{ padding: '8px', width: '80px' }}>الخصم %</th>
                        <th style={{ padding: '8px', width: '90px' }}>الصافي</th>
                        <th style={{ padding: '8px', width: '100px' }}>الإجمالي</th>
                        <th style={{ padding: '8px', width: '90px' }}>التشغيلة</th>
                        <th style={{ padding: '8px', width: '90px' }}>الصلاحية</th>
                        <th style={{ padding: '8px', width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.6)' }}>
                          <td style={{ padding: '8px', color: '#64748b', fontFamily: 'monospace' }}>{idx + 1}</td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              value={item.productName || item.item_name || ''}
                              onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                              placeholder="اسم الصنف..."
                              style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fff', fontSize: '0.75rem', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity || 1}
                              onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                              style={{ width: '100%', padding: '6px 4px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fff', fontSize: '0.75rem', textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice || item.publicPrice || 0}
                              onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                              style={{ width: '100%', padding: '6px 4px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fff', fontSize: '0.75rem', textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="number"
                              step="0.1"
                              value={item.discount || 0}
                              onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                              style={{ width: '100%', padding: '6px 4px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fbbf24', fontSize: '0.75rem', textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', textAlign: 'center', color: '#f8fafc' }}>
                            {(parseFloat(item.netPrice || 0)).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 800, textAlign: 'center', color: '#34d399' }}>
                            {(parseFloat(item.totalPrice || 0)).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              value={item.batchNumber || ''}
                              onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                              placeholder="Batch"
                              style={{ width: '100%', padding: '6px 4px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fff', fontSize: '0.75rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input
                              type="text"
                              value={item.expiryDate || ''}
                              onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                              placeholder="MM/YY"
                              style={{ width: '100%', padding: '6px 4px', borderRadius: '8px', backgroundColor: '#0b1120', border: '1px solid #1e293b', color: '#fff', fontSize: '0.75rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
                            >
                              <Trash2 style={{ width: '14px', height: '14px' }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals Breakdown */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '24px', paddingTop: '16px', borderTop: '1px solid #1e293b', marginTop: '14px' }}>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>الإجمالي بالجمهور:</span>
                  <span style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 800, fontFamily: 'monospace' }}>{totalGross.toFixed(2)} ج.م</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>إجمالي الخصم:</span>
                  <span style={{ fontSize: '0.9rem', color: '#fbbf24', fontWeight: 800, fontFamily: 'monospace' }}>-{totalDiscount.toFixed(2)} ج.م</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block' }}>الصافي المطلوب:</span>
                  <span style={{ fontSize: '1.05rem', color: '#34d399', fontWeight: 900, fontFamily: 'monospace' }}>{totalNet.toFixed(2)} ج.م</span>
                </div>
              </div>
            </div>

            {/* Submit & Cancel Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid #1e293b' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  color: '#cbd5e1',
                  fontSize: '0.825rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={isSaving || isExtracting}
                style={{
                  padding: '12px 28px',
                  borderRadius: '12px',
                  backgroundColor: '#2563eb',
                  border: '1px solid #3b82f6',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  cursor: (isSaving || isExtracting) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                    <span>جاري الحفظ والأرشفة...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                    <span>حفظ وأرشفة الفاتورة نهائياً</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>
      </div>
    </div>
  );
}
