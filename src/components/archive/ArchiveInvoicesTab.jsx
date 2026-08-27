import { getRealTodayStr } from '../../utils/timeEngine';
import React, { useState, useMemo } from 'react';
import {
  FileText,
  Building2,
  DollarSign,
  Search,
  RotateCcw,
  Calendar,
  Eye,
  Trash2,
  ExternalLink,
  Loader2,
  Scan,
  Download
} from 'lucide-react';
import { apiArchiveDeleteInvoice } from '../../utils/archiveApiClient';

export default function ArchiveInvoicesTab({
  invoices = [],
  suppliers = [],
  employees = [],
  isLoading = false,
  onOpenUploadModal,
  onOpenScanModal,
  onSelectInvoice,
  onSelectSupplier,
  onInvoiceDeleted = () => {}
}) {
  const [selectedSupplierId, setSelectedSupplierId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickDateFilter, setQuickDateFilter] = useState('all'); // 'all' | 'today' | 'week' | 'month'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [receiverFilter, setReceiverFilter] = useState('all');
  const [entryClerkFilter, setEntryClerkFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  // Quick Date Handlers
  const handleQuickDate = (mode) => {
    setQuickDateFilter(mode);
    const now = new Date();
    if (mode === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (mode === 'today') {
      const getRealTodayStr = now.toISOString().split('T')[0];
      setDateFrom(getRealTodayStr);
      setDateTo(getRealTodayStr);
    } else if (mode === 'week') {
      const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
      const lastDay = new Date(now.setDate(now.getDate() - now.getDay() + 6));
      setDateFrom(firstDay.toISOString().split('T')[0]);
      setDateTo(lastDay.toISOString().split('T')[0]);
    } else if (mode === 'month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setDateFrom(`${y}-${m}-01`);
      const lastDate = new Date(y, now.getMonth() + 1, 0).getDate();
      setDateTo(`${y}-${m}-${String(lastDate).padStart(2, '0')}`);
    }
  };

  // Filter Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Supplier Filter
      if (selectedSupplierId !== 'all') {
        const sId = String(inv.supplierId || inv.supplier_id || '');
        if (sId !== String(selectedSupplierId)) return false;
      }

      // 2. Receiver Filter
      if (receiverFilter !== 'all') {
        const rId = String(inv.receiverId || inv.receiver_id || '');
        if (rId !== String(receiverFilter)) return false;
      }

      // 3. Entry Clerk Filter
      if (entryClerkFilter !== 'all') {
        const cId = String(inv.entryClerkId || inv.entry_clerk_id || '');
        if (cId !== String(entryClerkFilter)) return false;
      }

      // 4. Date Range Filter
      const invDate = inv.invoiceDate || inv.invoice_date || inv.date || '';
      if (dateFrom && invDate && invDate < dateFrom) return false;
      if (dateTo && invDate && invDate > dateTo) return false;

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const num = String(inv.invoiceNumber || inv.invoice_number || '').toLowerCase();
        const sName = String(inv.supplierName || inv.supplier_name || '').toLowerCase();
        const notes = String(inv.notes || '').toLowerCase();
        const rName = String(inv.receiverName || inv.receiver_name || '').toLowerCase();
        const cName = String(inv.entryClerkName || inv.entry_clerk_name || '').toLowerCase();
        
        let itemMatch = false;
        if (inv.items && Array.isArray(inv.items)) {
          itemMatch = inv.items.some((item) => {
            const pName = String(item.productName || item.product_name || item.name || '').toLowerCase();
            const bNum = String(item.batchNumber || item.batch_number || '').toLowerCase();
            return pName.includes(q) || bNum.includes(q);
          });
        }

        if (!num.includes(q) && !sName.includes(q) && !notes.includes(q) && !rName.includes(q) && !cName.includes(q) && !itemMatch) {
          return false;
        }
      }

      return true;
    });
  }, [invoices, selectedSupplierId, receiverFilter, entryClerkFilter, dateFrom, dateTo, searchQuery]);

  // Statistics calculation
  const totalInvoicesCount = invoices.length;
  const totalNetSum = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (parseFloat(inv.totalNet || inv.total_net || inv.totalAmount || inv.total_amount || 0) || 0), 0);
  }, [invoices]);
  const totalSuppliersCount = suppliers.length;

  // Export Excel / CSV
  const handleExportExcel = () => {
    if (filteredInvoices.length === 0) {
      alert('لا توجد فواتير لتصديرها');
      return;
    }
    const headers = ['رقم الفاتورة', 'المورد / الشركة', 'تاريخ الفاتورة', 'مستلم الفاتورة', 'مدخل البيانات', 'الصافي المطلوب (ج.م)', 'إجمالي الجمهور (ج.م)', 'إجمالي الخصم (ج.م)', 'عدد الأصناف', 'الملاحظات'];
    const rows = filteredInvoices.map((inv) => [
      inv.invoiceNumber || inv.invoice_number || '—',
      inv.supplierName || inv.supplier_name || '—',
      inv.invoiceDate || inv.invoice_date || '—',
      inv.receiverName || inv.receiver_name || '—',
      inv.entryClerkName || inv.entry_clerk_name || '—',
      parseFloat(inv.totalNet || inv.total_net || 0).toFixed(2),
      parseFloat(inv.totalGross || inv.total_gross || 0).toFixed(2),
      parseFloat(inv.totalDiscount || inv.total_discount || 0).toFixed(2),
      (inv.items || []).length,
      (inv.notes || '').replace(/"/g, '""')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `أرشيف_فواتير_الصيدلية_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Delete Invoice
  const handleDeleteInvoice = async (inv, e) => {
    e.stopPropagation();
    if (!window.confirm(`هل أنت متأكد من حذف الفاتورة رقم "${inv.invoiceNumber || inv.invoice_number || '—'}" نهائياً من الأرشيف؟`)) {
      return;
    }
    setDeletingId(inv.id);
    try {
      const res = await apiArchiveDeleteInvoice(inv.id);
      if (res.success) {
        onInvoiceDeleted(inv.id);
      } else {
        alert(res.error || 'فشل حذف الفاتورة');
      }
    } catch {
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.75rem 1.5rem 3.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* ── 1. Top 3 KPI Stat Cards (Match Screenshot 2 Exactly) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        
        {/* Card 1: Total Archived Invoices */}
        <div style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '20px',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
        }}>
          <div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.375rem' }}>
              إجمالي الفواتير المؤرشفة
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              {totalInvoicesCount} <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#cbd5e1' }}>فاتورة</span>
            </div>
          </div>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            border: '1px solid rgba(37, 99, 235, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#60a5fa'
          }}>
            <FileText style={{ width: '26px', height: '26px' }} />
          </div>
        </div>

        {/* Card 2: Total Net Invoices Value */}
        <div style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '20px',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
        }}>
          <div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.375rem' }}>
              إجمالي قيمة الفواتير الصافية
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#10b981', letterSpacing: '-0.02em', direction: 'ltr', textAlign: 'right' }}>
              {totalNetSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>ج.م</span>
            </div>
          </div>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#34d399'
          }}>
            <DollarSign style={{ width: '26px', height: '26px' }} />
          </div>
        </div>

        {/* Card 3: Total Pharma Companies */}
        <div style={{
          backgroundColor: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: '20px',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
        }}>
          <div>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.375rem' }}>
              إجمالي شركات الأدوية
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.02em' }}>
              {totalSuppliersCount} <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#cbd5e1' }}>شركة</span>
            </div>
          </div>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <Building2 style={{ width: '26px', height: '26px' }} />
          </div>
        </div>

      </div>

      {/* ── 2. Multi-Row Filter Container (Match Screenshot 2 Exactly) ── */}
      <div style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '20px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        
        {/* Row 1: Supplier Dropdown + Instant Search Input */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: '100%', maxWidth: '260px' }}>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.625rem 1rem',
                borderRadius: '12px',
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                fontSize: '0.8125rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">جميع الشركات والموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="البحث الشامل الفوري (رقم الفاتورة، اسم المورد، الدواء، الباتش، الموظف.. أو الملاحظات)..."
              style={{
                width: '100%',
                padding: '0.625rem 2.5rem 0.625rem 1rem',
                borderRadius: '12px',
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                fontSize: '0.8125rem',
                outline: 'none'
              }}
            />
            <Search style={{
              position: 'absolute',
              right: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#64748b'
            }} />
          </div>
        </div>

        {/* Row 2: Quick Dates + Custom Date Range */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.875rem' }}>
          
          {/* Quick Date Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleQuickDate('all')}
              title="تفريغ التواريخ"
              style={{
                padding: '0.5rem 0.65rem',
                borderRadius: '10px',
                backgroundColor: quickDateFilter === 'all' ? '#2563eb' : '#070b14',
                border: '1px solid ' + (quickDateFilter === 'all' ? '#3b82f6' : '#1e293b'),
                color: quickDateFilter === 'all' ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotateCcw style={{ width: '14px', height: '14px' }} />
            </button>

            {[
              { id: 'all', label: 'الكل' },
              { id: 'today', label: 'اليوم' },
              { id: 'week', label: 'هذا الأسبوع' },
              { id: 'month', label: 'هذا الشهر' },
            ].map((tab) => {
              const isActive = quickDateFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleQuickDate(tab.id)}
                  style={{
                    padding: '0.45rem 0.9rem',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: isActive ? '#2563eb' : '#070b14',
                    border: '1px solid ' + (isActive ? '#3b82f6' : '#1e293b'),
                    color: isActive ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>من تاريخ:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setQuickDateFilter('custom');
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '10px',
                  backgroundColor: '#070b14',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '0.75rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>إلى تاريخ:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setQuickDateFilter('custom');
                }}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '10px',
                  backgroundColor: '#070b14',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: '0.75rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

        </div>

        {/* Row 3: Receiver and Entry Clerk Dropdowns */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.25rem', paddingTop: '0.5rem', borderTop: '1px solid #1e293b' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>فلترة المستلم:</span>
            <select
              value={receiverFilter}
              onChange={(e) => setReceiverFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">الكل</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>فلترة مدخل البيانات:</span>
            <select
              value={entryClerkFilter}
              onChange={(e) => setEntryClerkFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                backgroundColor: '#070b14',
                border: '1px solid #1e293b',
                color: '#f8fafc',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">الكل</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

        </div>

      </div>

      {/* ── 3. Invoices Table Box (Match Screenshot 2 Exactly) ── */}
      <div style={{
        backgroundColor: '#0b1120',
        border: '1px solid #1e293b',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
      }}>
        
        {/* Table Top Header Bar */}
        <div style={{
          padding: '1.125rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e293b',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📁</span>
            <span>أرشيف الفواتير المرفوعة والمستردة ({filteredInvoices.length})</span>
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <button
              type="button"
              onClick={onOpenScanModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#38bdf8',
                backgroundColor: '#070b14',
                border: '1px solid #0284c7',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(2, 132, 199, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#070b14';
              }}
            >
              <Scan style={{ width: '14px', height: '14px' }} />
              <span>فحص مجلد الفواتير</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.5rem 1rem',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#34d399',
                backgroundColor: '#070b14',
                border: '1px solid #059669',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(5, 150, 105, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#070b14';
              }}
            >
              <Download style={{ width: '14px', height: '14px' }} />
              <span>تصدير الأرشيف شيت إكسل</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b' }}>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>رقم الفاتورة</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>اسم المورد / الشركة</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>تاريخ الفاتورة</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>مستلم الفاتورة</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>إجمالي الصافي</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>الأصناف</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap' }}>الملاحظات</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>Google Drive</th>
                <th style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && invoices.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#94a3b8' }}>
                    <Loader2 style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem', animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
                    <span>جاري تحميل فواتير الأرشيف...</span>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                    <FileText style={{ width: '36px', height: '36px', margin: '0 auto 0.75rem', strokeWidth: 1.5, color: '#334155' }} />
                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>لا توجد فواتير مؤرشفة تطابق خيارات التصفية.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const driveLink = inv.driveViewLink || inv.drive_view_link;
                  const isDel = deletingId === inv.id;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                      style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(30, 41, 59, 0.4)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontWeight: 700, color: '#60a5fa' }}>
                        #{inv.invoiceNumber || inv.invoice_number || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#f8fafc' }}>
                        {inv.supplierName || inv.supplier_name || 'مورد عام'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1', fontSize: '0.75rem' }}>
                        {inv.invoiceDate || inv.invoice_date || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#cbd5e1', fontSize: '0.75rem' }}>
                        {inv.receiverName || inv.receiver_name || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontWeight: 900, color: '#10b981', direction: 'ltr', textAlign: 'right' }}>
                        {(parseFloat(inv.totalNet || inv.total_net || 0)).toFixed(2)} ج.م
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          backgroundColor: '#070b14',
                          border: '1px solid #1e293b',
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          color: '#94a3b8'
                        }}>
                          {(inv.items || []).length} صنف
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontSize: '0.75rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.notes || '—'}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        {driveLink ? (
                          <a
                            href={driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.35rem 0.65rem',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(37, 99, 235, 0.15)',
                              border: '1px solid rgba(37, 99, 235, 0.3)',
                              color: '#60a5fa',
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              textDecoration: 'none'
                            }}
                          >
                            <span>فتح</span>
                            <ExternalLink style={{ width: '12px', height: '12px' }} />
                          </a>
                        ) : (
                          <span style={{ color: '#475569', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
                          <button
                            type="button"
                            onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                            title="معاينة وتعديل"
                            style={{
                              padding: '0.35rem 0.5rem',
                              borderRadius: '8px',
                              backgroundColor: '#070b14',
                              border: '1px solid #1e293b',
                              color: '#cbd5e1',
                              cursor: 'pointer'
                            }}
                          >
                            <Eye style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteInvoice(inv, e)}
                            disabled={isDel}
                            title="حذف الفاتورة"
                            style={{
                              padding: '0.35rem 0.5rem',
                              borderRadius: '8px',
                              backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                              cursor: 'pointer'
                            }}
                          >
                            {isDel ? <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} /> : <Trash2 style={{ width: '14px', height: '14px' }} />}
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
