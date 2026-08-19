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
  Scan,
  RotateCcw,
  CloudUpload
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
  const [quickDateFilter, setQuickDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month'
  const [deletingId, setDeletingId] = useState(null);

  const handleQuickDateSelect = (mode) => {
    setQuickDateFilter(mode);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (mode === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (mode === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (mode === 'week') {
      const firstDay = new Date(today);
      firstDay.setDate(today.getDate() - today.getDay());
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (mode === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

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
        const recMatch = (inv.receiver?.name || inv.receiver_name || '').toLowerCase().includes(q);
        const clkMatch = (inv.entryClerk?.name || inv.entry_clerk_name || '').toLowerCase().includes(q);
        const itemMatch = inv.items?.some(
          (i) => (i.productName || i.product_name || i.item_name || '').toLowerCase().includes(q) || (i.batchNumber || i.batch_number || '').toLowerCase().includes(q)
        );

        if (!numMatch && !supMatch && !notesMatch && !recMatch && !clkMatch && !itemMatch) return false;
      }

      return true;
    });
  }, [invoices, searchQuery, selectedSupplierId, selectedReceiverId, selectedClerkId, startDate, endDate]);

  // Financial Computations
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
        { header: 'مستلم الفاتورة', key: 'receiver', width: 18 },
        { header: 'مدخل البيانات', key: 'entryClerk', width: 18 },
        { header: 'عدد الأصناف', key: 'itemsCount', width: 12 },
        { header: 'إجمالي الصافي (ج.م)', key: 'netAmount', width: 16 },
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
      
      {/* ── 1. TOP 3 KPI STAT CARDS (Screenshot 2 Match) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Total Archived Invoices */}
        <div className="p-6 rounded-2xl flex items-center justify-between shadow-xl" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
          <div>
            <p className="text-xs text-slate-400 font-semibold" style={{ margin: 0 }}>إجمالي الفواتير المؤرشفة</p>
            <h3 className="text-3xl font-black text-slate-100 mt-2" style={{ margin: '8px 0 0' }}>
              {invoices.length} <span className="text-xl font-bold">فاتورة</span>
            </h3>
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner" style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #334155' }}>
            <FileText className="w-7 h-7" />
          </div>
        </div>

        {/* Card 2: Total Net Amount */}
        <div className="p-6 rounded-2xl flex items-center justify-between shadow-xl" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
          <div>
            <p className="text-xs text-slate-400 font-semibold" style={{ margin: 0 }}>إجمالي قيمة الفواتير الصافية</p>
            <h3 className="text-3xl font-black text-emerald-400 mt-2" style={{ margin: '8px 0 0', color: '#10b981' }}>
              {totalNet.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span className="text-lg font-bold">ج.م</span>
            </h3>
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner" style={{ background: 'rgba(6, 78, 59, 0.4)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <DollarSign className="w-7 h-7" />
          </div>
        </div>

        {/* Card 3: Pharma Companies Count */}
        <div className="p-6 rounded-2xl flex items-center justify-between shadow-xl" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
          <div>
            <p className="text-xs text-slate-400 font-semibold" style={{ margin: 0 }}>إجمالي شركات الأدوية</p>
            <h3 className="text-3xl font-black text-cyan-400 mt-2" style={{ margin: '8px 0 0', color: '#38bdf8' }}>
              {suppliers.length} <span className="text-xl font-bold">شركة</span>
            </h3>
          </div>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner" style={{ background: 'rgba(12, 74, 110, 0.4)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <Building2 className="w-7 h-7" />
          </div>
        </div>

      </div>

      {/* ── 2. FILTER & SEARCH SECTION (Screenshot 2 Match) ── */}
      <div className="rounded-2xl p-5 space-y-4 shadow-xl text-right" style={{ background: '#0b1120', border: '1px solid #1e293b' }}>
        
        {/* Filter Row 1: Suppliers Dropdown & Comprehensive Realtime Search */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1">
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              style={{ background: '#070b14', border: '1px solid #334155' }}
            >
              <option value="">جميع الشركات والموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث الشامل الفوري (رقم الفاتورة، اسم المورد، الدواء، الباتش، الموظف.. أو الملاحظات)..."
              className="w-full pl-11 pr-4 py-3 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-right"
              style={{ background: '#070b14', border: '1px solid #334155' }}
            />
          </div>
        </div>

        {/* Filter Row 2: Quick Dates Pills & Date Range Picker */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          
          {/* Quick Date Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleQuickDateSelect('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                quickDateFilter === 'all' && !startDate && !endDate
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                background: quickDateFilter === 'all' && !startDate && !endDate ? '#2563eb' : '#070b14',
                border: '1px solid #334155'
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>الكل</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDateSelect('today')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                quickDateFilter === 'today'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                background: quickDateFilter === 'today' ? '#2563eb' : '#070b14',
                border: '1px solid #334155'
              }}
            >
              اليوم
            </button>

            <button
              type="button"
              onClick={() => handleQuickDateSelect('week')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                quickDateFilter === 'week'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                background: quickDateFilter === 'week' ? '#2563eb' : '#070b14',
                border: '1px solid #334155'
              }}
            >
              هذا الأسبوع
            </button>

            <button
              type="button"
              onClick={() => handleQuickDateSelect('month')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                quickDateFilter === 'month'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{
                background: quickDateFilter === 'month' ? '#2563eb' : '#070b14',
                border: '1px solid #334155'
              }}
            >
              هذا الشهر
            </button>
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-300">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: '#070b14', border: '1px solid #334155' }}>
              <span className="text-slate-400 font-semibold">من تاريخ:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setQuickDateFilter('custom');
                }}
                className="bg-transparent text-slate-200 text-xs focus:outline-none border-none font-mono"
              />
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: '#070b14', border: '1px solid #334155' }}>
              <span className="text-slate-400 font-semibold">إلى تاريخ:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setQuickDateFilter('custom');
                }}
                className="bg-transparent text-slate-200 text-xs focus:outline-none border-none font-mono"
              />
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
          </div>

        </div>

        {/* Filter Row 3: Receiver & Clerk Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t" style={{ borderColor: '#1e293b' }}>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">فلترة المستلم:</label>
            <select
              value={selectedReceiverId}
              onChange={(e) => setSelectedReceiverId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              style={{ background: '#070b14', border: '1px solid #334155' }}
            >
              <option value="">الكل</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.role || 'موظف'})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">فلترة مدخل البيانات:</label>
            <select
              value={selectedClerkId}
              onChange={(e) => setSelectedClerkId(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              style={{ background: '#070b14', border: '1px solid #334155' }}
            >
              <option value="">الكل</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.role || 'موظف'})</option>
              ))}
            </select>
          </div>
        </div>

      </div>

      {/* ── 3. INVOICES TABLE SECTION (Screenshot 2 Match) ── */}
      <div className="rounded-2xl border overflow-hidden shadow-2xl" style={{ background: '#0b1120', borderColor: '#1e293b' }}>
        
        {/* Table Header Bar */}
        <div className="flex items-center justify-between p-5 border-b flex-wrap gap-3" style={{ background: '#070b14', borderColor: '#1e293b' }}>
          
          <div className="flex items-center gap-2.5">
            {onOpenScanModal && (
              <button
                type="button"
                onClick={onOpenScanModal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                style={{ background: '#0f172a', border: '1px solid #0284c7', color: '#38bdf8' }}
              >
                <Scan className="w-4 h-4" />
                <span>فحص مجلد الفواتير</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              style={{ background: '#0f172a', border: '1px solid #059669', color: '#34d399' }}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير الأرشيف شيت إكسل</span>
            </button>
          </div>

          <h3 className="text-base font-black text-slate-100 flex items-center gap-2" style={{ margin: 0 }}>
            <span>📁 أرشيف الفواتير المرفوعة والمستردة ({filteredInvoices.length})</span>
          </h3>

        </div>

        {/* Desktop Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs text-slate-300 border-collapse">
            <thead className="text-slate-400 font-bold border-b uppercase tracking-wider" style={{ background: '#070b14', borderColor: '#1e293b' }}>
              <tr>
                <th className="p-4">رقم الفاتورة</th>
                <th className="p-4">اسم المورد / الشركة</th>
                <th className="p-4">تاريخ الفاتورة</th>
                <th className="p-4">مستلم الفاتورة</th>
                <th className="p-4 text-left">إجمالي الصافي</th>
                <th className="p-4 text-center">الأصناف</th>
                <th className="p-4">الملاحظات</th>
                <th className="p-4 text-center">Google Drive</th>
                <th className="p-4 text-center w-28">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#1e293b' }}>
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
                      className="hover:bg-slate-800/30 transition cursor-pointer group"
                    >
                      {/* 1. Invoice Number */}
                      <td className="p-4">
                        <div className="font-bold text-slate-100 font-mono group-hover:text-blue-300 transition">
                          #{invNum}
                        </div>
                      </td>

                      {/* 2. Supplier */}
                      <td className="p-4">
                        <span className="font-semibold text-slate-200 truncate max-w-[180px] block">{suppName}</span>
                      </td>

                      {/* 3. Invoice Date */}
                      <td className="p-4 font-mono text-slate-400">{formattedDate}</td>

                      {/* 4. Receiver */}
                      <td className="p-4">
                        <span className="text-slate-300 font-medium">{inv.receiver?.name || inv.receiver_name || '-'}</span>
                      </td>

                      {/* 5. Net Amount */}
                      <td className="p-4 text-left font-mono font-bold text-emerald-400 text-sm">
                        {netVal.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                      </td>

                      {/* 6. Items Count */}
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ background: '#082f49', color: '#38bdf8', border: '1px solid #0369a1' }}>
                          {itemsCount} صنف
                        </span>
                      </td>

                      {/* 7. Notes */}
                      <td className="p-4 text-slate-400 text-xs truncate max-w-[160px]">
                        {inv.notes || '-'}
                      </td>

                      {/* 8. Google Drive Link */}
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {hasFile ? (
                          <a
                            href={inv.fileUrl || inv.file_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition"
                            style={{ background: 'rgba(6, 78, 59, 0.4)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                            title="فتح مستند الفاتورة"
                          >
                            <span>فتح الملف</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-medium">غير متوفر</span>
                        )}
                      </td>

                      {/* 9. Actions */}
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                            className="p-2 rounded-xl transition cursor-pointer"
                            style={{ background: '#1e293b', border: '1px solid #334155', color: '#60a5fa' }}
                            title="معاينة تفاصيل الفاتورة"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={(e) => handleDeleteInvoice(inv.id, invNum, e)}
                            className="p-2 rounded-xl transition cursor-pointer disabled:opacity-50"
                            style={{ background: '#1e293b', border: '1px solid #7f1d1d', color: '#f87171' }}
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

      </div>

    </div>
  );
}
