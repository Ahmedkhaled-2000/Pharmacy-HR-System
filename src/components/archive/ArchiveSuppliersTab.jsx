import React, { useState } from 'react';
import { Building2, Search, Plus, Phone, FileText, ChevronLeft, Loader2 } from 'lucide-react';
import { apiArchiveSaveSupplier } from '../../utils/archiveApiClient';

export default function ArchiveSuppliersTab({
  suppliers = [],
  isLoading = false,
  onSelectSupplier,
  onSupplierSaved = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    const tempName = name.trim();
    const tempPhone = phone.trim();
    if (!tempName) return;

    setIsSaving(true);
    try {
      const res = await apiArchiveSaveSupplier({
        name: tempName,
        phone: tempPhone || null
      });
      if (res.success) {
        setName('');
        setPhone('');
        onSupplierSaved(res.supplier || { id: res.id || 'sup_' + Date.now(), name: tempName, phone: tempPhone });
      } else {
        alert(res.error || 'فشل إضافة المورد');
      }
    } catch {
      alert('حدث خطأ أثناء حفظ المورد');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter((sup) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (sup.name || '').toLowerCase().includes(q) ||
      (sup.phone && sup.phone.includes(q))
    );
  });

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Page Title & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
            <Building2 className="w-6 h-6 text-indigo-400" />
            دليل وشركات الموردين الأرشيفية ({suppliers.length})
          </h1>
          <p className="text-xs text-slate-400 mt-1" style={{ margin: '4px 0 0 0' }}>
            مطابقة شيتات الإكسل الصادرة، السجلات الضريبية وتاريخ الفواتير المستلمة لكل مورد
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث عن اسم المورد أو الهاتف..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
          />
        </div>
      </div>

      {/* Quick Add Supplier Card */}
      <div className="glass-card rounded-2xl p-5 border border-slate-800 shadow-lg">
        <form onSubmit={handleAddSupplier} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم مورد الأدوية أو الشركة الجديد..."
            className="flex-1 w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="رقم الهاتف (اختياري)..."
            className="w-full sm:w-52 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-white gradient-btn flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>إضافة مورد</span>
          </button>
        </form>
      </div>

      {/* Suppliers List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading && suppliers.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card rounded-2xl p-5 border border-slate-800/80 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800/80"></div>
                <div className="space-y-2 flex-1">
                  <div className="w-3/4 h-5 rounded-lg bg-slate-800/80"></div>
                  <div className="w-1/2 h-3 rounded-lg bg-slate-800/50"></div>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800/60 h-8 rounded-lg bg-slate-800/40"></div>
            </div>
          ))
        ) : filteredSuppliers.length === 0 ? (
          <div className="col-span-full text-center text-slate-500 py-16 bg-slate-900/40 rounded-2xl border border-slate-800">
            <Building2 className="w-12 h-12 mx-auto text-slate-700 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-400">لا يوجد موردين مطابقين لبحثك حالياً.</p>
          </div>
        ) : (
          filteredSuppliers.map((sup) => {
            const invoicesCount = sup._count?.invoices || sup.invoicesCount || sup.invoices_count || 0;
            return (
              <div
                key={sup.id}
                onClick={() => onSelectSupplier && onSelectSupplier(sup)}
                className="glass-card rounded-2xl p-5 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition flex flex-col justify-between space-y-4 group shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xl group-hover:scale-105 transition border border-indigo-500/20">
                      {(sup.name || 'م').charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-100 group-hover:text-indigo-300 transition" style={{ margin: 0 }}>
                        {sup.name}
                      </h3>
                      {sup.phone ? (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1" style={{ margin: '4px 0 0 0' }}>
                          <Phone className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="dir-ltr">{sup.phone}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1" style={{ margin: '4px 0 0 0' }}>لا يوجد رقم هاتف مسجل</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    عدد الفواتير المستلمة: <strong className="text-slate-200">{invoicesCount}</strong>
                  </span>
                  <span className="text-indigo-400 font-bold group-hover:translate-x-[-4px] transition flex items-center gap-0.5">
                    <span>التفاصيل</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
