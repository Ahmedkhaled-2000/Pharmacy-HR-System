import React, { useState } from 'react';
import {
  X,
  FileText,
  Printer,
  ExternalLink,
  Edit3,
  Save,
  Building2,
  Calendar,
  User,
  CheckCircle2,
  Trash2,
  Plus,
  Loader2,
  DollarSign,
  AlertCircle
} from 'lucide-react';
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

  const totalGross = items.reduce((sum, item) => sum + (parseFloat(item.quantity || 0) * parseFloat(item.unitPrice || item.unit_price || item.publicPrice || 0)), 0);
  const totalNet = items.reduce((sum, item) => {
    const q = parseFloat(item.quantity || 0);
    const u = parseFloat(item.unitPrice || item.unit_price || item.publicPrice || 0);
    const d = parseFloat(item.discount || 0);
    const rowNet = item.totalPrice !== undefined && item.totalPrice !== null
      ? parseFloat(item.totalPrice)
      : (q * u * (1 - d / 100));
    return sum + (isNaN(rowNet) ? 0 : rowNet);
  }, 0);
  const totalDiscount = totalGross - totalNet;

  const handleItemChange = (idx, field, value) => {
    const next = [...items];
    const row = { ...next[idx], [field]: value };

    const qty = parseFloat(row.quantity || 0);
    const pubPrice = parseFloat(row.unitPrice || row.unit_price || row.publicPrice || 0);
    const disc = parseFloat(row.discount || 0);
    row.totalPrice = parseFloat((qty * pubPrice * (1 - disc / 100)).toFixed(2));

    next[idx] = row;
    setItems(next);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        productName: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        totalPrice: 0,
        batchNumber: '',
        expiryDate: '',
        bonusQuantity: 0
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

    try {
      const payload = {
        id: invoice.id,
        invoiceNumber,
        supplierId,
        invoiceDate,
        receiverId: receiverId || null,
        entryClerkId: entryClerkId || null,
        notes,
        totalAmount: totalGross,
        discount: totalDiscount,
        netAmount: totalNet,
        items
      };

      const res = await apiArchiveUpdateInvoice(payload);
      if (res.success) {
        setIsEditing(false);
        onInvoiceUpdated(res.invoice || { ...invoice, ...payload });
      } else {
        setErrorMsg(res.error || 'فشل تحديث الفاتورة');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentSupplier = suppliers.find(s => String(s.id) === String(supplierId)) || invoice.supplier;
  const currentReceiver = employees.find(e => String(e.id) === String(receiverId)) || invoice.receiver;
  const currentClerk = employees.find(e => String(e.id) === String(entryClerkId)) || invoice.entryClerk;
  const fileUrl = invoice.fileUrl || invoice.file_url;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center font-bold text-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
                فاتورة رقم #{invoiceNumber}
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                المورد: <span className="text-indigo-300 font-bold">{currentSupplier?.name || 'غير محدد'}</span>
                {invoiceDate && ` • التاريخ: ${invoiceDate}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 transition shadow-sm"
              >
                <span>المستند المرفق</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              title="طباعة تقرير الفاتورة A4"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span>طباعة</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/60 transition cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'إلغاء التعديل' : 'تعديل الفاتورة'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area & Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 print-container">
          
          {/* Print Header (Visible only on print) */}
          <div className="hidden print-header text-center border-b pb-4 mb-4">
            <h1 className="text-xl font-bold">تقرير تفاصيل فاتورة الأرشيف</h1>
            <p className="text-xs text-gray-500">صيدليات مداواة • رقم الفاتورة: #{invoiceNumber}</p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2 no-print">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Key Invoice Information Grid */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">رقم الفاتورة:</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                  />
                ) : (
                  <strong className="text-sm font-mono text-slate-100">#{invoiceNumber}</strong>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">اسم المورد / الشركة:</span>
                {isEditing ? (
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-sm text-indigo-300">{currentSupplier?.name || 'مورد عام'}</strong>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">تاريخ الفاتورة:</span>
                {isEditing ? (
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                ) : (
                  <strong className="text-sm font-mono text-slate-300">{invoiceDate || '-'}</strong>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">المستلم / المدخل:</span>
                {isEditing ? (
                  <div className="space-y-1">
                    <select
                      value={receiverId}
                      onChange={(e) => setReceiverId(e.target.value)}
                      className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    >
                      <option value="">اختر المستلم...</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-xs text-slate-300 block">
                    استلام: <strong className="text-cyan-300">{currentReceiver?.name || '-'}</strong> • إدخال: {currentClerk?.name || '-'}
                  </span>
                )}
              </div>

            </div>

            {invoice.notes && (
              <div className="pt-3 border-t border-slate-800/80 text-xs text-amber-300 flex items-center gap-2">
                <span className="font-bold text-amber-400">ملاحظات:</span>
                <span>{invoice.notes}</span>
              </div>
            )}
          </div>

          {/* Items Table */}
          <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                بنود وأصناف الفاتورة ({items.length} صنف)
              </h3>

              {isEditing && (
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3 py-1 rounded-xl text-xs font-bold text-blue-300 bg-blue-950/60 hover:bg-blue-900 border border-blue-800/60 flex items-center gap-1 cursor-pointer no-print"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة صنف جديد</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 uppercase">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">اسم الصنف / الدواء</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">سعر الجمهور</th>
                    <th className="p-3 text-center">الخصم %</th>
                    <th className="p-3 text-left">الصافي</th>
                    <th className="p-3 text-left">الإجمالي</th>
                    <th className="p-3 text-center">التشغيلة</th>
                    <th className="p-3 text-center">الصلاحية</th>
                    {isEditing && <th className="p-3 text-center w-10 no-print"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={isEditing ? 10 : 9} className="p-8 text-center text-slate-500">
                        لا توجد أصناف مسجلة في هذه الفاتورة.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => {
                      const name = item.productName || item.product_name || item.item_name || '';
                      const qty = parseFloat(item.quantity || 0);
                      const unitP = parseFloat(item.unitPrice || item.unit_price || item.publicPrice || 0);
                      const disc = parseFloat(item.discount || 0);
                      const rowTotal = item.totalPrice !== undefined && item.totalPrice !== null
                        ? parseFloat(item.totalPrice)
                        : (qty * unitP * (1 - disc / 100));

                      return (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>

                          <td className="p-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                              />
                            ) : (
                              <strong className="text-slate-100">{name}</strong>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                min="1"
                                value={qty}
                                onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                                className="w-16 px-1 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-center font-mono"
                              />
                            ) : (
                              <span className="font-mono text-slate-200">{qty}</span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.01"
                                value={unitP}
                                onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                                className="w-20 px-1 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-center font-mono"
                              />
                            ) : (
                              <span className="font-mono text-slate-300">{unitP.toFixed(2)}</span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.1"
                                value={disc}
                                onChange={(e) => handleItemChange(idx, 'discount', e.target.value)}
                                className="w-16 px-1 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-center text-amber-300 font-mono"
                              />
                            ) : (
                              <span className="font-mono text-amber-300 font-bold">{disc > 0 ? `${disc}%` : '-'}</span>
                            )}
                          </td>

                          <td className="p-3 text-left font-mono text-slate-300">
                            {(unitP * (1 - disc / 100)).toFixed(2)}
                          </td>

                          <td className="p-3 text-left font-mono font-bold text-emerald-400">
                            {rowTotal.toFixed(2)} ج.م
                          </td>

                          <td className="p-3 text-center font-mono text-slate-400">
                            {isEditing ? (
                              <input
                                type="text"
                                value={item.batchNumber || item.batch_number || ''}
                                onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value)}
                                className="w-20 px-1 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-center"
                              />
                            ) : (
                              item.batchNumber || item.batch_number || '-'
                            )}
                          </td>

                          <td className="p-3 text-center font-mono text-slate-400">
                            {isEditing ? (
                              <input
                                type="text"
                                value={item.expiryDate || item.expiry_date || ''}
                                onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                                className="w-20 px-1 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-center"
                              />
                            ) : (
                              item.expiryDate || item.expiry_date || '-'
                            )}
                          </td>

                          {isEditing && (
                            <td className="p-3 text-center no-print">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div className="flex flex-wrap items-center justify-end gap-6 pt-4 border-t border-slate-800">
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">الإجمالي (سعر الجمهور):</span>
                <span className="text-sm font-mono text-slate-200 font-bold">{totalGross.toFixed(2)} ج.م</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">إجمالي الخصم المكتسب:</span>
                <span className="text-sm font-mono text-amber-400 font-bold">-{totalDiscount.toFixed(2)} ج.م</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 text-[11px] block">صافي الفاتورة المستحق:</span>
                <span className="text-lg font-mono text-emerald-400 font-black">{totalNet.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-900/60 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
          >
            إغلاق
          </button>

          {isEditing && (
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ التعديلات</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
