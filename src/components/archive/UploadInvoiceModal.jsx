import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Bot,
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
    setExtractStatus('جاري فحص وقراءة بيانات الفاتورة بالذكاء الاصطناعي...');
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
        setSuccessMsg(`تم استخراج بيانات الفاتورة و(${data.items?.length || 0}) صنف بنجاح!`);
      }
    } catch (err) {
      setErrorMsg('تعذر استخراج البيانات آلياً، يمكنك ملء البيانات يدوياً.');
    } finally {
      setIsExtracting(false);
      setExtractStatus('');
    }
  };

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
        expiryDate: '',
        bonusQuantity: 0
      }
    ]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...items];
    const row = { ...updated[index], [field]: value };

    // Auto calculate totals
    const qty = parseFloat(row.quantity || 0);
    const pubPrice = parseFloat(row.unitPrice || row.publicPrice || 0);
    const disc = parseFloat(row.discount || 0);
    const gross = qty * pubPrice;
    const net = gross * (1 - disc / 100);

    row.netPrice = parseFloat((pubPrice * (1 - disc / 100)).toFixed(2));
    row.totalPrice = parseFloat(net.toFixed(2));

    updated[index] = row;
    setItems(updated);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Financial Computations
  const totalGross = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || 0)), 0);
  const totalNet = items.reduce((sum, item) => sum + parseFloat(item.totalPrice || (item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100)) || 0), 0);
  const totalDiscount = totalGross - totalNet;

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setErrorMsg('يرجى كتابة رقم الفاتورة');
      return;
    }
    if (!supplierId) {
      setErrorMsg('يرجى اختيار المورد');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      let uploadedFileUrl = null;
      let uploadedDriveId = null;

      // 1. Upload File if selected
      if (selectedFile && fileBase64) {
        setExtractStatus('جاري رفع وأرشفة المستند...');
        const uploadRes = await apiArchiveUploadFile(fileBase64, selectedFile.name, mimeType);
        if (uploadRes.success) {
          uploadedFileUrl = uploadRes.fileUrl || uploadRes.url;
          uploadedDriveId = uploadRes.driveFileId;
        }
      }

      // 2. Save Invoice
      setExtractStatus('جاري حفظ الفاتورة في قاعدة البيانات...');
      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        supplierId,
        invoiceDate,
        receiverId: receiverId || null,
        entryClerkId: entryClerkId || null,
        totalAmount: totalGross,
        discount: totalDiscount,
        netAmount: totalNet,
        notes,
        fileUrl: uploadedFileUrl,
        driveFileId: uploadedDriveId,
        items
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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-lg">
              <FilePlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
                رفع وأرشفة فاتورة أدوية جديدة
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                استخراج فوري عبر الذكاء الاصطناعي (AI OCR)، استيراد شيتات الإكسل، أو الأرشفة اليدوية
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveMode('AI_EXTRACT')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeMode === 'AI_EXTRACT'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>استخراج ذكي بالذكاء الاصطناعي (صور وPDF)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('EXCEL_EXTRACT')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeMode === 'EXCEL_EXTRACT'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>استيراد شيت Excel المورد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('DIRECT_UPLOAD')}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeMode === 'DIRECT_UPLOAD'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>أرشفة وإدخال يدوي</span>
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSaveInvoice} className="flex-1 overflow-y-auto p-5 space-y-6">
          
          {/* File Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileSelected(f);
            }}
            className="border-2 border-dashed border-slate-700 hover:border-blue-500/80 bg-slate-900/40 hover:bg-slate-900/70 rounded-2xl p-6 text-center cursor-pointer transition space-y-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.xlsx,.xls,.csv"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-100 block">{selectedFile.name}</span>
                  <span className="text-xs text-slate-400 block font-mono">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'ملف'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadCloud className="w-10 h-10 text-blue-400 mx-auto animate-bounce" />
                <p className="text-xs font-bold text-slate-200">
                  انقر هنا لاختيار ملف الفاتورة أو قم بسحبه وإسقاطه مباشرة
                </p>
                <p className="text-[11px] text-slate-500">يدعم صيغ: JPG, PNG, PDF, Excel (XLSX/XLS)</p>
              </div>
            )}

            {isExtracting && (
              <div className="pt-2 flex items-center justify-center gap-2 text-xs font-bold text-blue-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{extractStatus}</span>
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Main Invoice Fields */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">بيانات الفاتورة الأساسية</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">رقم الفاتورة *</label>
                <input
                  type="text"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="مثال: INV-10482"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">المورد / الشركة *</label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">تاريخ الفاتورة *</label>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">أمين العهدة المستلم</label>
                <select
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">غير محدد</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role || 'موظف'})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">مدخل البيانات بالأرشيف</label>
                <select
                  value={entryClerkId}
                  onChange={(e) => setEntryClerkId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">غير محدد</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.role || 'موظف'})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">ملاحظات الفاتورة</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات خاصة بالتسليم أو الخصم..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <span>أصناف وبنود الفاتورة ({items.length})</span>
              </h3>

              <button
                type="button"
                onClick={handleAddItemRow}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-950/60 hover:bg-blue-900 border border-blue-800/60 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف</span>
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center bg-slate-900/40 rounded-xl border border-slate-800">
                لا توجد أصناف مضافة. سيتم استخراج الأصناف آلياً عند رفع الملف أو يمكنك النقر على "إضافة صنف".
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs text-slate-300 border-collapse">
                  <thead className="bg-slate-900/80 text-slate-400 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-2 w-8">#</th>
                      <th className="p-2 min-w-[200px]">اسم الصنف / الدواء</th>
                      <th className="p-2 w-20">الكمية</th>
                      <th className="p-2 w-24">سعر الجمهور</th>
                      <th className="p-2 w-20">الخصم %</th>
                      <th className="p-2 w-24">الصافي</th>
                      <th className="p-2 w-28">الإجمالي</th>
                      <th className="p-2 w-24">التشغيلة</th>
                      <th className="p-2 w-28">الصلاحية</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="p-2 font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.productName || item.item_name || ''}
                            onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                            placeholder="اسم الصنف..."
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity || 1}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice || item.publicPrice || 0}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono text-center"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.1"
                            value={item.discount || 0}
                            onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-amber-300 font-mono text-center"
                          />
                        </td>
                        <td className="p-2 font-mono text-slate-300 text-center">
                          {(parseFloat(item.netPrice || 0)).toFixed(2)}
                        </td>
                        <td className="p-2 font-mono font-bold text-emerald-400 text-center">
                          {(parseFloat(item.totalPrice || 0)).toFixed(2)}
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.batchNumber || ''}
                            onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                            placeholder="Batch"
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.expiryDate || ''}
                            onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                            placeholder="MM/YY"
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-500 hover:text-red-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals Breakdown Strip */}
            <div className="flex flex-wrap items-center justify-end gap-6 pt-4 border-t border-slate-800">
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">الإجمالي بالجمهور:</span>
                <span className="text-sm font-mono text-slate-200 font-bold">{totalGross.toFixed(2)} ج.م</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">إجمالي الخصم:</span>
                <span className="text-sm font-mono text-amber-400 font-bold">-{totalDiscount.toFixed(2)} ج.م</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">الصافي المطلوب:</span>
                <span className="text-base font-mono text-emerald-400 font-black">{totalNet.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>

          {/* Footer Submit Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSaving || isExtracting}
              className="px-8 py-3 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-2 shadow-xl cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>حفظ وأرشفة الفاتورة نهائياً</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
