import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  FileText,
  Settings2,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  Save,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Table
} from 'lucide-react';
import {
  apiArchiveGetSupplierMappings,
  apiArchiveSaveSupplierMappings,
  apiArchiveSaveSupplier,
  apiArchiveDeleteSupplier
} from '../../utils/archiveApiClient';
import { useUI } from '../../context/UIContext';

const STANDARD_FIELDS = [
  { value: 'productName', label: 'اسم الصنف / الدواء' },
  { value: 'quantity', label: 'الكمية' },
  { value: 'unitPrice', label: 'سعر الجمهور' },
  { value: 'discount', label: 'نسبة الخصم %' },
  { value: 'netPrice', label: 'الصافي للوحدة' },
  { value: 'totalPrice', label: 'إجمالي الصافي للسطر' },
  { value: 'bonusQuantity', label: 'البونص / المجاني' },
  { value: 'batchNumber', label: 'رقم التشغيلة (Batch)' },
  { value: 'expiryDate', label: 'تاريخ الصلاحية (Expiry)' }
];

export default function SupplierDetailModal({
  supplier,
  invoices = [],
  onClose,
  onSelectInvoice,
  onSupplierUpdated = () => {},
  onSupplierDeleted = () => {}
}) {
  const { showConfirm } = useUI();
  const [activeTab, setActiveTab] = useState('invoices'); // 'invoices' | 'info' | 'mappings'

  // Info State
  const [name, setName] = useState(supplier?.name || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [email, setEmail] = useState(supplier?.email || '');
  const [address, setAddress] = useState(supplier?.address || '');
  const [taxNumber, setTaxNumber] = useState(supplier?.taxNumber || supplier?.tax_number || '');
  const [notes, setNotes] = useState(supplier?.notes || '');

  // Mappings State
  const [mappings, setMappings] = useState([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  // Supplier Invoices
  const supplierInvoices = invoices.filter(
    (inv) => String(inv.supplierId || inv.supplier_id) === String(supplier?.id)
  );

  const totalSpent = supplierInvoices.reduce(
    (sum, inv) => sum + parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0),
    0
  );

  useEffect(() => {
    if (supplier?.id) {
      loadMappings();
    }
  }, [supplier?.id]);

  if (!supplier) return null;

  const loadMappings = async () => {
    setIsLoadingMappings(true);
    try {
      const res = await apiArchiveGetSupplierMappings(supplier.id);
      if (res.success && Array.isArray(res.mappings)) {
        setMappings(res.mappings);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingMappings(false);
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

  const handleSaveInfo = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setStatusMsg('');
    setIsError(false);

    try {
      const payload = {
        id: supplier.id,
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        taxNumber: taxNumber.trim() || null,
        notes: notes.trim() || null
      };

      const res = await apiArchiveSaveSupplier(payload);
      if (res.success) {
        setStatusMsg('تم حفظ وتحديث بيانات المورد بنجاح!');
        onSupplierUpdated({ ...supplier, ...payload });
      } else {
        setIsError(true);
        setStatusMsg(res.error || 'فشل تحديث بيانات المورد');
      }
    } catch {
      setIsError(true);
      setStatusMsg('حدث خطأ أثناء الحفظ');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMappings = async () => {
    setIsSaving(true);
    setStatusMsg('');
    setIsError(false);

    try {
      const validMappings = mappings.filter((m) => m.rawColumnName.trim());
      const res = await apiArchiveSaveSupplierMappings(supplier.id, validMappings);
      if (res.success) {
        setStatusMsg('تم حفظ وتطبيق تعيينات أعمدة الإكسل لهذا المورد!');
      } else {
        setIsError(true);
        setStatusMsg(res.error || 'فشل حفظ التعيينات');
      }
    } catch {
      setIsError(true);
      setStatusMsg('حدث خطأ أثناء حفظ التعيينات');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSupplier = async () => {
    const isConfirmed = await showConfirm({
      title: 'حذف المورد',
      message: `هل أنت متأكد من حذف المورد "${supplier.name}" نهائياً من الأرشيف؟`,
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🏢'
    });
    if (!isConfirmed) return;

    setIsDeleting(true);
    try {
      const res = await apiArchiveDeleteSupplier(supplier.id);
      if (res.success) {
        onSupplierDeleted(supplier.id);
        onClose();
      } else {
        alert(res.error || 'فشل حذف المورد');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="glass-card rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-xl">
              {(supplier.name || 'م').charAt(0)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
                {supplier.name}
              </h2>
              <p className="text-xs text-slate-400" style={{ margin: '2px 0 0' }}>
                {supplier.phone ? `هاتف: ${supplier.phone}` : 'سجل الشركة والمطابقة الآلية'}
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

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 gap-4 p-5 bg-slate-900/30 border-b border-slate-800">
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-900/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-indigo-400 font-medium">عدد الفواتير المستلمة</span>
              <p className="text-xl font-bold text-slate-100 mt-1">{supplierInvoices.length} فاتورة</p>
            </div>
            <FileText className="w-6 h-6 text-indigo-400" />
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/50 flex items-center justify-between">
            <div>
              <span className="text-xs text-emerald-400 font-medium">إجمالي المسحوبات (الصافي)</span>
              <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">
                {totalSpent.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م
              </p>
            </div>
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
        </div>

        {/* Subtabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'invoices' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>سجل الفواتير ({supplierInvoices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'info' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>بيانات ومعلومات المورد</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mappings')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'mappings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>تعيين أعمدة Excel ({mappings.length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {statusMsg && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              isError ? 'bg-red-950/60 border-red-800 text-red-300' : 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            }`}>
              {isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{statusMsg}</span>
            </div>
          )}

          {/* TAB 1: INVOICES LIST */}
          {activeTab === 'invoices' && (
            <div>
              {supplierInvoices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                  لا توجد فواتير مؤرشفة مسجلة لهذا المورد حتى الآن.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-right text-xs text-slate-300 border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 uppercase">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">رقم الفاتورة</th>
                        <th className="p-3">تاريخ الفاتورة</th>
                        <th className="p-3 text-center">الأصناف</th>
                        <th className="p-3 text-left">الصافي</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {supplierInvoices.map((inv, idx) => (
                        <tr key={inv.id || idx} className="hover:bg-slate-800/30">
                          <td className="p-3 text-center font-mono text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-bold font-mono text-slate-100">
                            #{inv.invoiceNumber || inv.invoice_number}
                          </td>
                          <td className="p-3 font-mono text-slate-400">
                            {inv.invoiceDate || inv.invoice_date || '-'}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[11px]">
                              {inv.items?.length || inv.itemsCount || 0} صنف
                            </span>
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-emerald-400">
                            {parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0).toLocaleString('ar-EG')} ج.م
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                if (onSelectInvoice) onSelectInvoice(inv);
                              }}
                              className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            >
                              عرض الفاتورة
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUPPLIER INFO FORM */}
          {activeTab === 'info' && (
            <form onSubmit={handleSaveInfo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">اسم المورد أو الشركة *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">رقم الهاتف والتواصل</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@company.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">الرقم أو السجل الضريبي</label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="123-456-789"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block">العنوان أو المقر</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الفرع أو عنوان المخزن..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-300 block">ملاحظات إضافية</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي تعليمات أو شروط دفع خاصة بالمورد..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleDeleteSupplier}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-950/40 border border-red-900/40 transition cursor-pointer"
                >
                  {isDeleting ? 'جاري الحذف...' : 'حذف المورد'}
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>حفظ بيانات المورد</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: EXCEL COLUMN MAPPINGS */}
          {activeTab === 'mappings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-300 font-bold" style={{ margin: 0 }}>
                    قواعد استيراد ومطابقة أعمدة الإكسل
                  </p>
                  <p className="text-[11px] text-slate-500" style={{ margin: '2px 0 0' }}>
                    اربط أسماء الأعمدة في شيت إكسل المورد بالحقول القياسية في الأرشيف
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddMapping}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/60 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة عمود</span>
                </button>
              </div>

              {mappings.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800 text-xs">
                  لا توجد قواعد تعيين أعمدة مسجلة لهذا المورد. انقر على "إضافة عمود" لربط شيتات الإكسل.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {mappings.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="flex-1">
                        <label className="text-[10px] text-slate-400 block mb-1">اسم العمود في ملف المورد (كما هو مكتوب بالإكسل)</label>
                        <input
                          type="text"
                          value={m.rawColumnName}
                          onChange={(e) => handleUpdateMapping(idx, 'rawColumnName', e.target.value)}
                          placeholder="مثال: Item_Name أو اسم الصنف"
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                        />
                      </div>

                      <span className="text-slate-500 font-bold mt-4">←</span>

                      <div className="flex-1">
                        <label className="text-[10px] text-slate-400 block mb-1">الحقل القياسي في الأرشيف</label>
                        <select
                          value={m.standardField}
                          onChange={(e) => handleUpdateMapping(idx, 'standardField', e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
                        >
                          {STANDARD_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveMapping(idx)}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition mt-4"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleSaveMappings}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>حفظ تعيينات الأعمدة</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
