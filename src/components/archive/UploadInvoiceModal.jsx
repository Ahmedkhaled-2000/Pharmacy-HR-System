import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  UploadCloud,
  Sparkles,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserCheck,
  UserPen,
  Calendar,
  DollarSign,
  Building,
  Trash2,
  Hash,
  Info,
  StickyNote,
  Layers,
  Plus,
  Edit2
} from 'lucide-react';
import { performSmartExtraction } from '../../utils/archiveAiService';
import { parseExcelOrCsvMultiInvoices } from '../../utils/archiveExcelParser';
import {
  apiArchiveSaveInvoice,
  apiArchiveSaveBatchInvoices,
  apiArchiveUploadFile
} from '../../utils/archiveApiClient';

export default function UploadInvoiceModal({
  isOpen,
  onClose,
  suppliers = [],
  employees = [],
  settings = {},
  onInvoiceSaved = () => {}
}) {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('AI_EXTRACT'); // 'AI_EXTRACT' | 'EXCEL_EXTRACT' | 'DIRECT_UPLOAD'
  const [fileList, setFileList] = useState([]);

  // Staff & Supplier assignments
  const [receiverId, setReceiverId] = useState('');
  const [entryClerkId, setEntryClerkId] = useState('');
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [notes, setNotes] = useState('');

  // Manual inputs for DIRECT_UPLOAD mode
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Status & Notifications
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [globalSuccess, setGlobalSuccess] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileList([]);
      setGlobalError('');
      setGlobalSuccess('');
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setInvoiceNumber('');
      setTotalAmount('');
      setNotes('');
      setReceiverId('');
      setEntryClerkId('');
      setSelectedSupplierName('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper to validate file type for active mode
  const validateFileForMode = (file, targetMode) => {
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = (file.type || '').toLowerCase();

    if (targetMode === 'EXCEL_EXTRACT') {
      return ['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv');
    }

    if (targetMode === 'AI_EXTRACT') {
      return ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) || mime.includes('image') || mime.includes('pdf');
    }

    // DIRECT_UPLOAD accepts any document
    return true;
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setGlobalError('');
    setGlobalSuccess('');

    const incompatible = fileList.filter((f) => !validateFileForMode(f.file, newMode));
    if (incompatible.length > 0) {
      setGlobalError(`تنبيه: تم استبعاد ${incompatible.length} ملفات غير متوافقة مع النمط المختار.`);
      setFileList((prev) => prev.filter((f) => validateFileForMode(f.file, newMode)));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const incomingFiles = Array.from(e.target.files);
      const validFiles = [];
      const rejectedFiles = [];

      incomingFiles.forEach((file) => {
        if (validateFileForMode(file, mode)) {
          validFiles.push({
            file,
            status: 'PENDING',
            message: '',
            extractedInvoices: null,
            extractedSummary: null
          });
        } else {
          rejectedFiles.push(file.name);
        }
      });

      if (rejectedFiles.length > 0) {
        setGlobalError(`تم تجاهل ${rejectedFiles.length} ملفات لعدم توافق صيغتها مع نمط الرفع الحالي.`);
      } else {
        setGlobalError('');
      }

      setFileList((prev) => [...prev, ...validFiles]);
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index) => {
    setFileList((prev) => prev.filter((_, i) => i !== index));
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');
    setGlobalSuccess('');

    if (mode !== 'DIRECT_UPLOAD' && fileList.length === 0) {
      setGlobalError('يرجى اختيار ملف فاتورة واحد على الأقل للرفع والتحليل.');
      return;
    }

    if (mode === 'DIRECT_UPLOAD' && fileList.length === 0 && !invoiceNumber.trim()) {
      setGlobalError('يرجى إدخال رقم الفاتورة عند الأرشفة المباشرة بدون ملف.');
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;
    const allExtractedAndSavedInvoices = [];

    try {
      // 1. Process DIRECT_UPLOAD without file attached
      if (mode === 'DIRECT_UPLOAD' && fileList.length === 0) {
        const singleInvoice = {
          invoiceNumber: invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
          supplierName: selectedSupplierName.trim() || 'مورد عام',
          invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
          totalAmount: parseFloat(totalAmount) || 0,
          discount: 0,
          netAmount: parseFloat(totalAmount) || 0,
          status: 'ARCHIVED',
          uploadMode: 'DIRECT_UPLOAD',
          receiverId: receiverId || null,
          entryClerkId: entryClerkId || null,
          notes: notes || '',
          items: []
        };

        const res = await apiArchiveSaveInvoice(singleInvoice);
        if (res.success) {
          setGlobalSuccess('تم حفظ وأرشفة الفاتورة بنجاح!');
          onInvoiceSaved(res.invoice || singleInvoice);
          setTimeout(() => {
            onClose();
          }, 800);
        } else {
          setGlobalError(res.error || 'فشل حفظ الفاتورة');
        }
        setIsUploading(false);
        return;
      }

      // 2. Process file list queue
      for (let i = 0; i < fileList.length; i++) {
        const item = fileList[i];
        if (item.status === 'SUCCESS') continue;

        // Update status to UPLOADING
        setFileList((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'UPLOADING', message: 'جاري التحليل والمعالجة...' } : f))
        );

        try {
          let extractedInvoices = [];
          const ext = (item.file.name || '').split('.').pop()?.toLowerCase() || '';
          let fileBase64 = '';
          let fileUrl = '';

          // Step A: Read file
          fileBase64 = await readFileAsBase64(item.file);
          fileUrl = fileBase64;

          // Step B: Upload file to server storage if supported
          try {
            const uploadRes = await apiArchiveUploadFile(item.file.name, item.file.type, fileBase64);
            if (uploadRes && uploadRes.fileUrl) {
              fileUrl = uploadRes.fileUrl;
            }
          } catch (uploadErr) {
            console.warn('Storage upload fallback to Base64:', uploadErr);
          }

          // Step C: Extraction based on active mode
          if (mode === 'EXCEL_EXTRACT') {
            const arrayBuffer = await readFileAsArrayBuffer(item.file);
            extractedInvoices = await parseExcelOrCsvMultiInvoices(arrayBuffer, item.file.name, {
              defaultSupplierName: selectedSupplierName.trim() || undefined
            });
          } else if (mode === 'AI_EXTRACT') {
            const singleExtracted = await performSmartExtraction(
              item.file,
              fileBase64,
              settings,
              suppliers,
              (statusText) => {
                setFileList((prev) =>
                  prev.map((f, idx) => (idx === i ? { ...f, message: statusText } : f))
                );
              }
            );
            if (singleExtracted) {
              extractedInvoices = [singleExtracted];
            }
          } else {
            // DIRECT_UPLOAD with file attached
            extractedInvoices = [
              {
                invoiceNumber: invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
                supplierName: selectedSupplierName.trim() || 'مورد عام',
                invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
                totalAmount: parseFloat(totalAmount) || 0,
                discount: 0,
                netAmount: parseFloat(totalAmount) || 0,
                itemsCount: 0,
                items: []
              }
            ];
          }

          // Step D: Format and Save each extracted invoice into Archive DB
          const invoicesToSave = extractedInvoices.map((inv) => ({
            invoiceNumber: inv.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
            supplierName: inv.supplierName || selectedSupplierName.trim() || 'مورد عام',
            invoiceDate: inv.invoiceDate || invoiceDate || new Date().toISOString().split('T')[0],
            totalAmount: inv.totalAmount || 0,
            discount: inv.discount || 0,
            netAmount: inv.netAmount || (inv.totalAmount - (inv.discount || 0)) || 0,
            status: 'ARCHIVED',
            fileUrl: fileUrl,
            fileName: item.file.name,
            fileType: item.file.type || ext,
            uploadMode: mode,
            receiverId: receiverId || null,
            entryClerkId: entryClerkId || null,
            notes: notes || '',
            items: inv.items || []
          }));

          let saveRes;
          if (invoicesToSave.length === 1) {
            saveRes = await apiArchiveSaveInvoice(invoicesToSave[0]);
          } else {
            saveRes = await apiArchiveSaveBatchInvoices(invoicesToSave);
          }

          if (saveRes.success) {
            successCount++;
            allExtractedAndSavedInvoices.push(...invoicesToSave);
            const firstInv = invoicesToSave[0];
            setFileList((prev) =>
              prev.map((f, idx) =>
                idx === i
                  ? {
                      ...f,
                      status: 'SUCCESS',
                      message: invoicesToSave.length > 1 ? `تم حفظ ${invoicesToSave.length} فواتير` : 'تم الحفظ بنجاح',
                      extractedSummary: {
                        invoiceNumber: firstInv.invoiceNumber,
                        supplierName: firstInv.supplierName,
                        invoiceDate: firstInv.invoiceDate,
                        itemsCount: invoicesToSave.reduce((sum, inv) => sum + (inv.items?.length || 0), 0),
                        totalAmount: firstInv.totalAmount,
                        discount: firstInv.discount,
                        netAmount: firstInv.netAmount
                      }
                    }
                  : f
              )
            );
          } else {
            failCount++;
            setFileList((prev) =>
              prev.map((f, idx) =>
                idx === i ? { ...f, status: 'ERROR', message: saveRes.error || 'فشل حفظ الفاتورة' } : f
              )
            );
          }
        } catch (itemErr) {
          console.error(`Error processing file ${item.file.name}:`, itemErr);
          failCount++;
          setFileList((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: 'ERROR', message: itemErr?.message || 'فشل التحليل' } : f
            )
          );
        }
      }

      if (successCount > 0) {
        setGlobalSuccess(`تمت معالجة وأرشفة (${successCount}) ملف بنجاح!`);
        onInvoiceSaved(allExtractedAndSavedInvoices[0]);
        if (failCount === 0) {
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } else if (failCount > 0) {
        setGlobalError('تعذر حفظ بعض أو كل الفواتير. يرجى مراجعة رسائل الخطأ الموضحة.');
      }
    } catch (globalErr) {
      console.error('Upload modal general error:', globalErr);
      setGlobalError(globalErr?.message || 'حدث خطأ عام أثناء معالجة الفواتير');
    } finally {
      setIsUploading(false);
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
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '840px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to left, rgba(30, 41, 59, 0.5), rgba(15, 23, 42, 0.8))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6'
              }}
            >
              <UploadCloud size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                إضافة واسترداد فواتير جديدة
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                اختر نوع الرفع المطلوب للتحليل وتفكيك المستندات أو الأرشفة المباشرة
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Mode Selector Tabs (3 Modes) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              padding: '6px',
              borderRadius: '16px',
              border: '1px solid #1e293b'
            }}
          >
            <button
              type="button"
              onClick={() => handleModeChange('AI_EXTRACT')}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: '700',
                transition: 'all 0.2s',
                backgroundColor: mode === 'AI_EXTRACT' ? '#2563eb' : 'transparent',
                color: mode === 'AI_EXTRACT' ? '#ffffff' : '#94a3b8',
                boxShadow: mode === 'AI_EXTRACT' ? '0 10px 15px -3px rgba(37, 99, 235, 0.3)' : 'none'
              }}
            >
              <Sparkles size={16} />
              <span>تحليل ذكي (AI/صور/PDF)</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('EXCEL_EXTRACT')}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: '700',
                transition: 'all 0.2s',
                backgroundColor: mode === 'EXCEL_EXTRACT' ? '#059669' : 'transparent',
                color: mode === 'EXCEL_EXTRACT' ? '#ffffff' : '#94a3b8',
                boxShadow: mode === 'EXCEL_EXTRACT' ? '0 10px 15px -3px rgba(5, 150, 105, 0.3)' : 'none'
              }}
            >
              <FileSpreadsheet size={16} />
              <span>استيراد إكسل (Excel/CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('DIRECT_UPLOAD')}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: '700',
                transition: 'all 0.2s',
                backgroundColor: mode === 'DIRECT_UPLOAD' ? '#7c3aed' : 'transparent',
                color: mode === 'DIRECT_UPLOAD' ? '#ffffff' : '#94a3b8',
                boxShadow: mode === 'DIRECT_UPLOAD' ? '0 10px 15px -3px rgba(124, 58, 237, 0.3)' : 'none'
              }}
            >
              <FolderPlus size={16} />
              <span>أرشفة مباشرة (يدوي)</span>
            </button>
          </div>

          {/* Mode Guidance Alert */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.8)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '12px',
              color: '#cbd5e1'
            }}
          >
            <Info size={16} style={{ color: '#38bdf8', shrink: 0, marginTop: '2px' }} />
            <div>
              {mode === 'AI_EXTRACT' && (
                <span>
                  <strong>نمط الذكاء الاصطناعي:</strong> يدعم صور الفواتير (JPG, PNG) وملفات PDF. يقوم محرك Groq و Gemini باستخراج الأصناف، الأسعار، الخصومات، والكميات تلقائياً.
                </span>
              )}
              {mode === 'EXCEL_EXTRACT' && (
                <span>
                  <strong>نمط استيراد الإكسل:</strong> يدعم ملفات Excel (.xlsx, .xls) و CSV. يقوم بكشف الأعمدة وتفكيك الشيتات وتجميع الأصناف حسب رقم الفاتورة تلقائياً.
                </span>
              )}
              {mode === 'DIRECT_UPLOAD' && (
                <span>
                  <strong>نمط الأرشفة المباشرة:</strong> إدخال بيانات الفاتورة يدوياً مع إمكانية إرفاق أي ملف مستند ليتم حفظه في الأرشيف مباشرة.
                </span>
              )}
            </div>
          </div>

          {/* Global Error & Success Alerts */}
          {globalError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertCircle size={16} />
              <span>{globalError}</span>
            </div>
          )}

          {globalSuccess && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} />
              <span>{globalSuccess}</span>
            </div>
          )}

          {/* Dropzone Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed #334155',
              borderRadius: '20px',
              padding: '30px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              transition: 'all 0.2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept={
                mode === 'EXCEL_EXTRACT'
                  ? '.xlsx,.xls,.csv'
                  : mode === 'AI_EXTRACT'
                  ? '.jpg,.jpeg,.png,.webp,.pdf,image/*,application/pdf'
                  : '*/*'
              }
              style={{ display: 'none' }}
            />

            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                backgroundColor:
                  mode === 'EXCEL_EXTRACT'
                    ? 'rgba(5, 150, 105, 0.15)'
                    : mode === 'AI_EXTRACT'
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(124, 58, 237, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: mode === 'EXCEL_EXTRACT' ? '#10b981' : mode === 'AI_EXTRACT' ? '#3b82f6' : '#a855f7'
              }}
            >
              {mode === 'EXCEL_EXTRACT' ? (
                <FileSpreadsheet size={28} />
              ) : mode === 'AI_EXTRACT' ? (
                <Sparkles size={28} />
              ) : (
                <UploadCloud size={28} />
              )}
            </div>

            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#f1f5f9', margin: '0 0 4px 0' }}>
                اضغط هنا لاختيار الملفات أو اسحبها وأفلتها هنا
              </p>
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
                {mode === 'EXCEL_EXTRACT' && 'الصيغ المدعومة: XLSX, XLS, CSV (يمكنك رفع عدة ملفات معاً)'}
                {mode === 'AI_EXTRACT' && 'الصيغ المدعومة: JPG, PNG, PDF, WEBP (استخراج ذكي لبنود الأدوية)'}
                {mode === 'DIRECT_UPLOAD' && 'جميع الصيغ مقبولة كملفات مرفقة'}
              </p>
            </div>
          </div>

          {/* File Queue List */}
          {fileList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>
                  الملفات المحددة في قائمة الانتظار ({fileList.length}):
                </span>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => setFileList([])}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#f87171',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={12} />
                    مسح الكل
                  </button>
                )}
              </div>

              {fileList.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} style={{ color: '#38bdf8' }} />
                      <div>
                        <p style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                          {item.file.name}
                        </p>
                        <p style={{ fontSize: '10px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                          {(item.file.size / 1024).toFixed(1)} كيلوبايت
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.status === 'PENDING' && (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: '#334155',
                            color: '#94a3b8',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: '600'
                          }}
                        >
                          في الانتظار
                        </span>
                      )}
                      {item.status === 'UPLOADING' && (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Loader2 size={12} className="animate-spin" />
                          {item.message || 'جاري التحليل...'}
                        </span>
                      )}
                      {item.status === 'SUCCESS' && (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#34d399',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <CheckCircle2 size={12} />
                          {item.message || 'تمت الأرشفة'}
                        </span>
                      )}
                      {item.status === 'ERROR' && (
                        <span
                          style={{
                            fontSize: '11px',
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            padding: '3px 10px',
                            borderRadius: '999px',
                            fontWeight: '600'
                          }}
                        >
                          {item.message || 'فشلت المعالجة'}
                        </span>
                      )}

                      {!isUploading && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Badge for Extracted Data */}
                  {item.extractedSummary && (
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#0f172a',
                        borderRadius: '10px',
                        border: '1px solid #334155',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '8px',
                        fontSize: '11px',
                        color: '#cbd5e1'
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748b' }}>رقم الفاتورة: </span>
                        <strong>{item.extractedSummary.invoiceNumber}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>المورد: </span>
                        <strong>{item.extractedSummary.supplierName}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>الأصناف: </span>
                        <strong>{item.extractedSummary.itemsCount} صنف</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>الصافي: </span>
                        <strong style={{ color: '#34d399' }}>{item.extractedSummary.netAmount} ج.م</strong>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Manual Input Fields for DIRECT_UPLOAD */}
          {mode === 'DIRECT_UPLOAD' && (
            <div
              style={{
                backgroundColor: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid #1e293b',
                borderRadius: '16px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px'
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  رقم الفاتورة: *
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="مثال: INV-1002"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  تاريخ الفاتورة:
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  المبلغ الإجمالي (الصافي):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          )}

          {/* Supplier, Staff & Notes Assignments */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '14px',
              paddingTop: '12px',
              borderTop: '1px solid #1e293b'
            }}
          >
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                <Building size={14} style={{ color: '#38bdf8' }} />
                المورد / الشركة:
              </label>
              <input
                type="text"
                list="suppliers-list-modal"
                value={selectedSupplierName}
                onChange={(e) => setSelectedSupplierName(e.target.value)}
                placeholder="اسم المورد أو الشركة..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
              <datalist id="suppliers-list-modal">
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.name} />
                ))}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                <UserCheck size={14} style={{ color: '#34d399' }} />
                أمين العهدة المستلم:
              </label>
              <select
                value={receiverId}
                onChange={(e) => setReceiverId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none'
                }}
              >
                <option value="">غير محدد</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `(${emp.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                <UserPen size={14} style={{ color: '#818cf8' }} />
                مدخل البيانات بالأرشيف:
              </label>
              <select
                value={entryClerkId}
                onChange={(e) => setEntryClerkId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none'
                }}
              >
                <option value="">غير محدد</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `(${emp.role})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                <StickyNote size={14} style={{ color: '#fbbf24' }} />
                ملاحظات الفاتورة:
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid #1e293b'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isUploading || (mode !== 'DIRECT_UPLOAD' && fileList.length === 0)}
              style={{
                padding: '12px 28px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor:
                  mode === 'EXCEL_EXTRACT' ? '#059669' : mode === 'AI_EXTRACT' ? '#2563eb' : '#7c3aed',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
                opacity: isUploading || (mode !== 'DIRECT_UPLOAD' && fileList.length === 0) ? 0.5 : 1
              }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري معالجة وحفظ الفواتير...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={16} />
                  <span>
                    {mode === 'DIRECT_UPLOAD' && fileList.length === 0
                      ? 'حفظ الفاتورة بالأرشيف'
                      : `بدء رفع ومعالجة (${fileList.length}) ملفات`}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
