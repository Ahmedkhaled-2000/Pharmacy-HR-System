import React, { useState, useMemo } from 'react';
import {
  FileText,
  DollarSign,
  Building2,
  Users,
  Search,
  FileSpreadsheet,
  Calendar,
  ExternalLink,
  Eye,
  Trash2,
  Loader2,
  Scan
} from 'lucide-react';
import { apiArchiveDeleteInvoice } from '../../utils/archiveApiClient';
import { loadExcelJS } from '../../utils/excelExport';

export default function ArchiveInvoicesTab({
  invoices = [],
  suppliers = [],
  employees = [],
  isLoading = false,
  onOpenUploadModal,
  onOpenScanModal,
  onSelectInvoice,
  onInvoiceDeleted = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedReceiverId, setSelectedReceiverId] = useState('');
  const [selectedClerkId, setSelectedClerkId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  // Fast In-Memory Filtering
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const suppId = inv.supplierId || inv.supplier_id;
      const recId = inv.receiverId || inv.receiver_id;
      const clkId = inv.entryClerkId || inv.entry_clerk_id;
      const dateStr = inv.invoiceDate || inv.invoice_date || '';

      if (selectedSupplierId && String(suppId) !== String(selectedSupplierId)) return false;
      if (selectedReceiverId && String(recId) !== String(selectedReceiverId)) return false;
      if (selectedClerkId && String(clkId) !== String(selectedClerkId)) return false;

      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate + ' 23:59:59') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = (inv.invoiceNumber || inv.invoice_number || '').toLowerCase().includes(q);
        const supMatch = (inv.supplier?.name || inv.supplier_name || '').toLowerCase().includes(q);
        const notesMatch = (inv.notes || '').toLowerCase().includes(q);
        const itemMatch = inv.items?.some(
          (i) => (i.productName || i.product_name || i.item_name || '').toLowerCase().includes(q) || (i.batchNumber || i.batch_number || '').toLowerCase().includes(q)
        );

        if (!numMatch && !supMatch && !notesMatch && !itemMatch) return false;
      }

      return true;
    });
  }, [invoices, searchQuery, selectedSupplierId, selectedReceiverId, selectedClerkId, startDate, endDate]);

  // Statistics Calculations
  const totalNet = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || inv.total_amount || 0)), 0);

  const handleDeleteInvoice = async (invId, invNumber, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف الفاتورة رقم #${invNumber}؟ سيتم حذف كافة بنودها ومستنداتها نهائياً.`)) return;

    setDeletingId(invId);
    try {
      const res = await apiArchiveDeleteInvoice(invId);
      if (res.success) {
        onInvoiceDeleted(invId);
      } else {
        alert(res.error || 'فشل حذف الفاتورة');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportExcel = async () => {
    if (filteredInvoices.length === 0) {
      alert('لا توجد فواتير لتصديرها');
      return;
    }

    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('فواتير الأرشيف', {
        views: [{ rightToLeft: true }]
      });

      worksheet.columns = [
        { header: '#', key: 'idx', width: 6 },
        { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 18 },
        { header: 'اسم المورد / الشركة', key: 'supplierName', width: 26 },
        { header: 'تاريخ الفاتورة', key: 'invoiceDate', width: 14 },
        { header: 'المستلم', key: 'receiver', width: 18 },
        { header: 'مدخل البيانات', key: 'entryClerk', width: 18 },
        { header: 'عدد الأصناف', key: 'itemsCount', width: 12 },
        { header: 'الصافي (ج.م)', key: 'netAmount', width: 16 },
        { header: 'ملاحظات', key: 'notes', width: 30 }
      ];

      // Header Row Style
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Cairo' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      filteredInvoices.forEach((inv, i) => {
        worksheet.addRow({
          idx: i + 1,
          invoiceNumber: inv.invoiceNumber || inv.invoice_number,
          supplierName: inv.supplier?.name || inv.supplier_name || 'غير محدد',
          invoiceDate: inv.invoiceDate || inv.invoice_date || '',
          receiver: inv.receiver?.name || inv.receiver_name || '-',
          entryClerk: inv.entryClerk?.name || inv.entry_clerk_name || '-',
          itemsCount: inv.items?.length || inv.itemsCount || 0,
          netAmount: parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0),
          notes: inv.notes || ''
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ارشيف_الفواتير_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('حدث خطأ أثناء تصدير ملف الإكسل');
    }
  };

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Top Header & Fast Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Invoices */}
        <div className="glass-card p-5 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium">إجمالي الفواتير المؤرشفة</p>
            <h3 className="text-2xl font-black text-slate-100 mt-1">{invoices.length}</h3>
            <span className="text-[10px] text-blue-400 font-semibold">{filteredInvoices.length} مطابقة للبحث</span>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20 shadow-inner">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Total Net Amount */}
        <div className="glass-card p-5 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium">صافي قيمة الفواتير المعروضة</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">
              {totalNet.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م
            </h3>
            <span className="text-[10px] text-emerald-500 font-semibold">محدث لحظياً</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-inner">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Suppliers Count */}
        <div className="glass-card p-5 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium">الشركات والموردين</p>
            <h3 className="text-2xl font-black text-indigo-400 mt-1">{suppliers.length}</h3>
            <span className="text-[10px] text-indigo-300 font-semibold">دليل الموردين النشط</span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Archive Staff */}
        <div className="glass-card p-5 border border-slate-800 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <p className="text-xs text-slate-400 font-medium">طاقم الاستلام والإدخال</p>
            <h3 className="text-2xl font-black text-cyan-400 mt-1">{employees.length}</h3>
            <span className="text-[10px] text-cyan-300 font-semibold">الموظفين المعتمدين</span>
          </div>
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-2xl border border-cyan-500/20 shadow-inner">
            <Users className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Main Filter & Action Bar */}
      <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4 shadow-xl">
        
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          
          {/* Realtime Instant Search Input */}
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث فوري برقم الفاتورة، اسم المورد، الصنف، رقم التشغيلة..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 shadow-inner"
            />
          </div>

          {/* Quick Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            
            {/* Supplier Filter */}
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">جميع الموردين ({suppliers.length})</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Date Range Filters */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>من:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none border-none"
              />
              <span>إلى:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-200 text-xs focus:outline-none border-none"
              />
            </div>

            {/* Excel Export Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 transition shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير Excel</span>
            </button>

            {/* Auto Folder Scan Button */}
            {onOpenScanModal && (
              <button
                type="button"
                onClick={onOpenScanModal}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 transition shadow-sm cursor-pointer"
              >
                <Scan className="w-3.5 h-3.5 text-cyan-400" />
                <span>فحص مجلد</span>
              </button>
            )}

          </div>

        </div>

      </div>

      {/* Invoices List Table Card */}
      <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        
        {/* Desktop Responsive Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-300 border-collapse">
            <thead className="bg-slate-900/90 text-slate-400 font-bold border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="p-4 w-12 text-center">#</th>
                <th className="p-4">رقم الفاتورة</th>
                <th className="p-4">المورد / الشركة</th>
                <th className="p-4">تاريخ الفاتورة</th>
                <th className="p-4">المستلم / المدخل</th>
                <th className="p-4 text-center">الأصناف</th>
                <th className="p-4 text-left">الصافي</th>
                <th className="p-4 text-center">المستند</th>
                <th className="p-4 text-center w-28">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isLoading && filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      <span>جاري تحميل ومزامنة فواتير الأرشيف...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-500">
                    لا توجد فواتير مطابقة لمعايير البحث الحالية.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => {
                  const invNum = inv.invoiceNumber || inv.invoice_number || '-';
                  const suppName = inv.supplier?.name || inv.supplier_name || 'غير محدد';
                  const dateVal = inv.invoiceDate || inv.invoice_date || '';
                  const formattedDate = dateVal ? new Date(dateVal).toLocaleDateString('ar-EG') : '-';
                  const netVal = parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0);
                  const itemsCount = inv.items?.length || inv.itemsCount || 0;
                  const hasFile = Boolean(inv.hasDocument || inv.fileUrl || inv.file_url || inv.driveFileId);

                  return (
                    <tr
                      key={inv.id || idx}
                      onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                      className="hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      <td className="p-4 text-center font-mono text-slate-500">{idx + 1}</td>

                      {/* Invoice Number */}
                      <td className="p-4">
                        <div className="font-bold text-slate-100 font-mono group-hover:text-blue-300 transition">
                          #{invNum}
                        </div>
                        {inv.notes && (
                          <div className="text-[10px] text-amber-400/90 truncate max-w-[140px] mt-0.5" title={inv.notes}>
                            📝 {inv.notes}
                          </div>
                        )}
                      </td>

                      {/* Supplier */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {suppName.charAt(0)}
                          </div>
                          <span className="font-semibold text-slate-200 truncate max-w-[180px]">{suppName}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="p-4 font-mono text-slate-400">{formattedDate}</td>

                      {/* Receiver & Clerk */}
                      <td className="p-4">
                        <div className="text-slate-300 text-[11px]">
                          استلام: <span className="font-medium text-slate-400">{inv.receiver?.name || inv.receiver_name || '-'}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          إدخال: {inv.entryClerk?.name || inv.entry_clerk_name || '-'}
                        </div>
                      </td>

                      {/* Items count badge */}
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                          {itemsCount} صنف
                        </span>
                      </td>

                      {/* Net Amount */}
                      <td className="p-4 text-left font-mono font-bold text-emerald-400 text-sm">
                        {netVal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                      </td>

                      {/* Attachment Document Status */}
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {hasFile ? (
                          <a
                            href={inv.fileUrl || inv.file_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-400 rounded-lg text-[11px] font-semibold transition"
                            title="فتح الملف المرفوع"
                          >
                            <span>عرض المستند</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-medium">لا يوجد ملف</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30 transition cursor-pointer"
                            title="استعراض تفاصيل وبنود الفاتورة"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={(e) => handleDeleteInvoice(inv.id, invNum, e)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition cursor-pointer disabled:opacity-50"
                            title="حذف الفاتورة"
                          >
                            {deletingId === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Adaptive Mobile Cards View */}
        <div className="md:hidden p-4 space-y-3.5">
          {isLoading && filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              <span>جاري تحميل البيانات...</span>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">لا توجد فواتير مطابقة لمعايير البحث</div>
          ) : (
            filteredInvoices.map((inv, idx) => {
              const invNum = inv.invoiceNumber || inv.invoice_number || '-';
              const suppName = inv.supplier?.name || inv.supplier_name || 'غير محدد';
              const dateVal = inv.invoiceDate || inv.invoice_date || '';
              const formattedDate = dateVal ? new Date(dateVal).toLocaleDateString('ar-EG') : '-';
              const netVal = parseFloat(inv.netAmount || inv.net_amount || inv.totalAmount || 0);

              return (
                <div
                  key={inv.id || idx}
                  onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md active:scale-[0.99] transition"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100 font-mono">#{invNum}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{formattedDate}</span>
                    </div>

                    <p className="text-sm font-black text-emerald-400 font-mono">
                      {netVal.toLocaleString('ar-EG')} ج.م
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px] block">المورد:</span>
                      <span className="font-bold text-blue-300">{suppName}</span>
                    </div>

                    <div className="text-left dir-ltr">
                      <span className="text-slate-500 text-[11px] block text-right">الأصناف:</span>
                      <span className="font-semibold text-cyan-300">{inv.items?.length || 0} صنف</span>
                    </div>
                  </div>

                  {inv.notes && (
                    <div className="p-2 bg-amber-950/30 border border-amber-800/40 rounded-xl text-[11px] text-amber-300">
                      <span className="font-bold text-amber-400">ملاحظة:</span> {inv.notes}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>تفاصيل الفاتورة</span>
                    </button>

                    <button
                      type="button"
                      disabled={deletingId === inv.id}
                      onClick={(e) => handleDeleteInvoice(inv.id, invNum, e)}
                      className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-xl transition border border-red-900/40 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
