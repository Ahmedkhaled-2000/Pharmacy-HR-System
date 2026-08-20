import React, { useState, useRef } from 'react';
import {
  X,
  Scan,
  FolderOpen,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Building,
  Calendar,
  DollarSign,
  Trash2,
  Plus,
  Tag,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon
} from 'lucide-react';
import { parseExcelOrCsvMultiInvoices } from '../../utils/archiveExcelParser';
import { performSmartExtraction } from '../../utils/archiveAiService';
import { apiArchiveSaveBatchInvoices, apiArchiveUploadFile } from '../../utils/archiveApiClient';

export default function FolderScanReviewModal({
  isOpen,
  onClose,
  suppliers = [],
  employees = [],
  settings = {},
  onConfirmBatch = () => {}
}) {
  const [folderPath, setFolderPath] = useState(settings?.AUTO_SCAN_FOLDER_PATH || '');
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [receiverId, setReceiverId] = useState('');
  const [entryClerkId, setEntryClerkId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const folderInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDeviceFolderSelect = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const incomingList = Array.from(files);
      const processedInvoices = [];

      for (let i = 0; i < incomingList.length; i++) {
        const file = incomingList[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const mime = file.type || '';

        const isExcel = ['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv');
        const isImageOrPdf = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) || mime.includes('image') || mime.includes('pdf');

        if (!isExcel && !isImageOrPdf) continue;

        try {
          if (isExcel) {
            const arrayBuffer = await file.arrayBuffer();
            const extracted = await parseExcelOrCsvMultiInvoices(arrayBuffer, file.name);
            extracted.forEach((inv, invIdx) => {
              processedInvoices.push({
                id: `scan_${Date.now()}_${i}_${invIdx}`,
                fileName: file.name,
                fileObj: file,
                invoiceNumber: inv.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
                supplierName: inv.supplierName || 'مورد عام',
                invoiceDate: inv.invoiceDate || new Date().toISOString().split('T')[0],
                totalAmount: inv.totalAmount || 0,
                discount: inv.discount || 0,
                netAmount: inv.netAmount || 0,
                items: inv.items || [],
                selected: true,
                expanded: false,
                isExcel: true
              });
            });
          } else if (isImageOrPdf) {
            const b64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            });

            const singleExt = await performSmartExtraction(file, b64, settings, suppliers);
            if (singleExt) {
              processedInvoices.push({
                id: `scan_${Date.now()}_${i}`,
                fileName: file.name,
                fileObj: file,
                fileBase64: b64,
                invoiceNumber: singleExt.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
                supplierName: singleExt.supplierName || 'مورد عام',
                invoiceDate: singleExt.invoiceDate || new Date().toISOString().split('T')[0],
                totalAmount: singleExt.totalAmount || 0,
                discount: singleExt.discount || 0,
                netAmount: singleExt.netAmount || 0,
                items: singleExt.items || [],
                selected: true,
                expanded: false,
                isExcel: false
              });
            }
          }
        } catch (itemErr) {
          console.warn(`Skipping file ${file.name}:`, itemErr);
        }
      }

      setInvoices(processedInvoices);
      if (processedInvoices.length > 0) {
        setSuccessMsg(`تم فحص واكتشاف (${processedInvoices.length}) فواتير جاهزة للمراجعة والأرشفة!`);
      } else {
        setErrorMsg('لم يتم العثور على أي فواتير صالحة في المجلد المحدد.');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء فحص ملفات المجلد.');
    } finally {
      setIsScanning(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    const selectedInvoices = invoices.filter((inv) => inv.selected);
    if (selectedInvoices.length === 0) {
      setErrorMsg('يرجى اختيار فاتورة واحدة على الأقل للاستيراد.');
      return;
    }

    setIsConfirming(true);
    setErrorMsg('');

    try {
      const payloadList = [];

      for (const inv of selectedInvoices) {
        let fileUrl = '';
        if (inv.fileBase64) {
          try {
            const uploadRes = await apiArchiveUploadFile(inv.fileName, 'image/jpeg', inv.fileBase64);
            if (uploadRes && uploadRes.fileUrl) fileUrl = uploadRes.fileUrl;
            else fileUrl = inv.fileBase64;
          } catch {
            fileUrl = inv.fileBase64;
          }
        }

        payloadList.push({
          invoiceNumber: inv.invoiceNumber,
          supplierName: inv.supplierName,
          invoiceDate: inv.invoiceDate,
          totalAmount: inv.totalAmount,
          discount: inv.discount,
          netAmount: inv.netAmount,
          status: 'ARCHIVED',
          fileName: inv.fileName,
          fileUrl,
          uploadMode: 'AUTO_EXTRACT',
          receiverId: receiverId || null,
          entryClerkId: entryClerkId || null,
          notes: 'استيراد جماعي عبر فاحص المجلدات',
          items: inv.items
        });
      }

      const res = await apiArchiveSaveBatchInvoices(payloadList);
      if (res.success) {
        onConfirmBatch();
        onClose();
      } else {
        setErrorMsg(res.error || 'فشل استيراد الفواتير');
      }
    } catch (err) {
      setErrorMsg('حدث خطأ أثناء استيراد الفواتير.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        fontFamily: "'Cairo', 'Segoe UI', sans-serif"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isScanning && !isConfirming) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '960px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to left, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.9))'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#22d3ee'
              }}
            >
              <Scan size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                الفحص والمطابقة التلقائية لمجلد الفواتير
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                مسح مجلد الفواتير واستخراج ومعالجة الفواتير المتعددة دفعة واحدة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '8px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
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

          {/* Folder Selection Controls */}
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <input
              type="file"
              ref={folderInputRef}
              onChange={handleDeviceFolderSelect}
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
            />

            <div>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                فحص مجلد على جهاز الكمبيوتر:
              </p>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                اختر مجلد الفواتير ليقوم النظام بفحص ملفات Excel و PDF والصور تلقائياً واستخراج بنودها
              </p>
            </div>

            <button
              type="button"
              disabled={isScanning}
              onClick={() => folderInputRef.current?.click()}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#0891b2',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(8, 145, 178, 0.35)',
                opacity: isScanning ? 0.5 : 1
              }}
            >
              {isScanning ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
              <span>{isScanning ? 'جاري فحص واستخراج الفواتير...' : 'اختيار مجلد وفحصه'}</span>
            </button>
          </div>

          {/* Staff Assignment Bar */}
          {invoices.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', backgroundColor: 'rgba(30, 41, 59, 0.5)', padding: '12px 16px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  أمين العهدة المستلم لكافة الفواتير المستوردة:
                </label>
                <select
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                >
                  <option value="">غير محدد</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role || 'أمين مخزن'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#cbd5e1', marginBottom: '4px' }}>
                  مدخل البيانات بالأرشيف:
                </label>
                <select
                  value={entryClerkId}
                  onChange={(e) => setEntryClerkId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '12px' }}
                >
                  <option value="">غير محدد</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role || 'مدخل بيانات'})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Invoices List to Review */}
          {invoices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8' }}>
                  الفواتير المكتشفة ({invoices.length}):
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  المحدد: {invoices.filter((i) => i.selected).length} فاتورة
                </span>
              </div>

              {invoices.map((inv, idx) => (
                <div
                  key={inv.id}
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '14px',
                    border: inv.selected ? '1px solid #0891b2' : '1px solid #334155',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={inv.selected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setInvoices((prev) => prev.map((item, i) => (i === idx ? { ...item, selected: checked } : item)));
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />

                      {inv.isExcel ? (
                        <FileSpreadsheet size={20} style={{ color: '#10b981' }} />
                      ) : (
                        <ImageIcon size={20} style={{ color: '#38bdf8' }} />
                      )}

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                            فاتورة: {inv.invoiceNumber}
                          </strong>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            ({inv.fileName})
                          </span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>
                          المورد: <strong style={{ color: '#cbd5e1' }}>{inv.supplierName}</strong> | التاريخ: <strong style={{ color: '#cbd5e1' }}>{inv.invoiceDate}</strong> | الأصناف: <strong style={{ color: '#cbd5e1' }}>{inv.items?.length || 0} صنف</strong>
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <strong style={{ fontSize: '14px', color: '#34d399' }}>
                        {inv.netAmount.toLocaleString()} ج.م
                      </strong>

                      <button
                        type="button"
                        onClick={() => {
                          setInvoices((prev) => prev.map((item, i) => (i === idx ? { ...item, expanded: !item.expanded } : item)));
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                      >
                        {inv.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Expandable items preview */}
                  {inv.expanded && inv.items && inv.items.length > 0 && (
                    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px', marginTop: '4px' }}>
                      <table style={{ width: '100%', fontSize: '11px', textAlign: 'right', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: '#64748b' }}>
                            <th style={{ padding: '4px 6px' }}>اسم الصنف</th>
                            <th style={{ padding: '4px 6px' }}>الكمية</th>
                            <th style={{ padding: '4px 6px' }}>السعر</th>
                            <th style={{ padding: '4px 6px' }}>الخصم</th>
                            <th style={{ padding: '4px 6px' }}>الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.items.map((it, itIdx) => (
                            <tr key={itIdx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.4)' }}>
                              <td style={{ padding: '6px', color: '#f8fafc' }}>{it.productName}</td>
                              <td style={{ padding: '6px', color: '#cbd5e1' }}>{it.quantity}</td>
                              <td style={{ padding: '6px', color: '#cbd5e1' }}>{it.unitPrice} ج.م</td>
                              <td style={{ padding: '6px', color: '#f87171' }}>{it.discount || 0} ج.م</td>
                              <td style={{ padding: '6px', fontWeight: '700', color: '#34d399' }}>{it.totalPrice} ج.م</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isConfirming}
            style={{ padding: '10px 18px', borderRadius: '12px', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
          >
            إغلاق
          </button>

          {invoices.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isConfirming || invoices.filter((i) => i.selected).length === 0}
              style={{
                padding: '12px 28px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#0891b2',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(8, 145, 178, 0.35)',
                opacity: isConfirming || invoices.filter((i) => i.selected).length === 0 ? 0.5 : 1
              }}
            >
              {isConfirming ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>جاري استيراد الفواتير للأرشيف...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>تأكيد واستيراد ({invoices.filter((i) => i.selected).length}) فواتير</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
