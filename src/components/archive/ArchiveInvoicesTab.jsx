import React, { useState, useMemo } from 'react';
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
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedReceiver, setSelectedReceiver] = useState('');
  const [selectedClerk, setSelectedClerk] = useState('');
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

      if (selectedSupplier && suppId !== selectedSupplier) return false;
      if (selectedReceiver && recId !== selectedReceiver) return false;
      if (selectedClerk && clkId !== selectedClerk) return false;

      if (startDate && dateStr && dateStr < startDate) return false;
      if (endDate && dateStr && dateStr > endDate + ' 23:59:59') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = (inv.invoiceNumber || inv.invoice_number || '').toLowerCase().includes(q);
        const supMatch = (inv.supplier?.name || inv.supplier_name || '').toLowerCase().includes(q);
        const notesMatch = (inv.notes || '').toLowerCase().includes(q);
        const itemMatch = inv.items?.some(
          (i) => (i.productName || i.product_name || '').toLowerCase().includes(q) || (i.batchNumber || i.batch_number || '').toLowerCase().includes(q)
        );

        if (!numMatch && !supMatch && !notesMatch && !itemMatch) return false;
      }

      return true;
    });
  }, [invoices, searchQuery, selectedSupplier, selectedReceiver, selectedClerk, startDate, endDate]);

  // Totals calculations
  const totalGross = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || inv.total_amount || 0)), 0);
  const totalDiscount = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.discount || 0)), 0);
  const totalNet = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.netAmount || inv.net_amount || 0)), 0);

  const handleDelete = async (invId, e) => {
    e.stopPropagation();
    if (!window.confirm('هل أنت متأكد من حذف هذه الفاتورة وبنودها نهائياً من الأرشيف؟')) return;

    setDeletingId(invId);
    try {
      const res = await apiArchiveDeleteInvoice(invId);
      if (res.success) {
        onInvoiceDeleted();
      } else {
        alert(res.error || 'فشل حذف الفاتورة');
      }
    } catch (err) {
      alert('حدث خطأ أثناء حذف الفاتورة');
    } finally {
      setDeletingId(null);
    }
  };

  // Export to Excel using ExcelJS
  const handleExportExcel = async () => {
    if (filteredInvoices.length === 0) {
      alert('لا توجد فواتير لتصديرها');
      return;
    }

    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('أرشيف الفواتير', {
        views: [{ rightToLeft: true }]
      });

      // Headers
      worksheet.columns = [
        { header: 'م', key: 'index', width: 6 },
        { header: 'رقم الفاتورة', key: 'number', width: 16 },
        { header: 'تاريخ الفاتورة', key: 'date', width: 14 },
        { header: 'المورد / الشركة', key: 'supplier', width: 26 },
        { header: 'المستلم', key: 'receiver', width: 18 },
        { header: 'مدخل البيانات', key: 'clerk', width: 18 },
        { header: 'عدد الأصناف', key: 'itemsCount', width: 12 },
        { header: 'الإجمالي (ج.م)', key: 'gross', width: 16 },
        { header: 'الخصم (ج.م)', key: 'discount', width: 14 },
        { header: 'الصافي المستحق (ج.م)', key: 'net', width: 18 },
        { header: 'ملاحظات', key: 'notes', width: 24 }
      ];

      // Styling Header Row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' } // Dark blue
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      // Add Data Rows
      filteredInvoices.forEach((inv, idx) => {
        worksheet.addRow({
          index: idx + 1,
          number: inv.invoiceNumber || inv.invoice_number,
          date: (inv.invoiceDate || inv.invoice_date || '').split('T')[0],
          supplier: inv.supplier?.name || inv.supplier_name || 'مورد عام',
          receiver: inv.receiver?.name || inv.receiver_name || '—',
          clerk: inv.entryClerk?.name || inv.entry_clerk_name || '—',
          itemsCount: inv.items?.length || inv.items_count || 0,
          gross: parseFloat(inv.totalAmount || inv.total_amount || 0),
          discount: parseFloat(inv.discount || 0),
          net: parseFloat(inv.netAmount || inv.net_amount || 0),
          notes: inv.notes || ''
        });
      });

      // Format Numbers
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { horizontal: 'center', vertical: 'middle' };
          row.getCell(8).numFmt = '#,##0.00';
          row.getCell(9).numFmt = '#,##0.00';
          row.getCell(10).numFmt = '#,##0.00';
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير_أرشيف_الفواتير_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('حدث خطأ أثناء تصدير ملف الإكسل');
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSupplier('');
    setSelectedReceiver('');
    setSelectedClerk('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Statistics Cards */}
      <div className="arch-stats-grid">
        <div className="arch-stat-card">
          <div className="arch-stat-info">
            <div className="arch-stat-label">إجمالي الفواتير المفلترة</div>
            <div className="arch-stat-value">{totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ج.م</span></div>
          </div>
          <div className="arch-stat-icon blue">💰</div>
        </div>

        <div className="arch-stat-card">
          <div className="arch-stat-info">
            <div className="arch-stat-label">إجمالي الخصومات المكتسبة</div>
            <div className="arch-stat-value" style={{ color: '#fbbf24' }}>{totalDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ج.م</span></div>
          </div>
          <div className="arch-stat-icon amber">🏷️</div>
        </div>

        <div className="arch-stat-card">
          <div className="arch-stat-info">
            <div className="arch-stat-label">الصافي المستحق النهائي</div>
            <div className="arch-stat-value" style={{ color: '#34d399' }}>{totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>ج.م</span></div>
          </div>
          <div className="arch-stat-icon green">✨</div>
        </div>

        <div className="arch-stat-card">
          <div className="arch-stat-info">
            <div className="arch-stat-label">عدد الفواتير المعروضة</div>
            <div className="arch-stat-value" style={{ color: '#a78bfa' }}>{filteredInvoices.length} <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>فاتورة</span></div>
          </div>
          <div className="arch-stat-icon purple">📑</div>
        </div>
      </div>

      {/* 2. Filter and Search Bar */}
      <div className="arch-filter-card">
        <div className="arch-filter-grid">
          
          {/* Search Box */}
          <div className="arch-input-group">
            <label className="arch-input-label">البحث الشامل في الأرشيف (رقم الفاتورة، الصنف، المورد، الباتش)</label>
            <input
              type="text"
              className="arch-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 ابحث برقم الفاتورة أو اسم الدواء..."
            />
          </div>

          {/* Supplier Filter */}
          <div className="arch-input-group">
            <label className="arch-input-label">المورد</label>
            <select
              className="arch-select"
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
            >
              <option value="">جميع الموردين</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Receiver Filter */}
          <div className="arch-input-group">
            <label className="arch-input-label">أمين العهدة المستلم</label>
            <select
              className="arch-select"
              value={selectedReceiver}
              onChange={(e) => setSelectedReceiver(e.target.value)}
            >
              <option value="">الكل</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="arch-input-group">
            <label className="arch-input-label">من تاريخ</label>
            <input
              type="date"
              className="arch-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* End Date */}
          <div className="arch-input-group">
            <label className="arch-input-label">إلى تاريخ</label>
            <input
              type="date"
              className="arch-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="arch-btn-secondary"
              onClick={handleResetFilters}
              title="إعادة تعيين الفلاتر"
            >
              🔄
            </button>
            <button
              type="button"
              className="arch-btn-secondary"
              onClick={handleExportExcel}
              title="تصدير شيت إكسل"
            >
              📥 إكسل
            </button>
          </div>

        </div>
      </div>

      {/* 3. Invoices Data Table */}
      <div className="arch-table-card">
        <div className="arch-table-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
              📋 قائمة الفواتير المؤرشفة ({filteredInvoices.length})
            </h3>
          </div>
          <button
            type="button"
            className="arch-btn-primary"
            onClick={onOpenUploadModal}
            style={{ padding: '7px 14px', fontSize: '0.8rem' }}
          >
            ➕ رفع فاتورة جديدة
          </button>
        </div>

        <div className="arch-table-responsive">
          <table className="arch-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th>
                <th>التاريخ</th>
                <th>المورد / الشركة</th>
                <th>المستلم / المدخل</th>
                <th>الأصناف</th>
                <th>المبلغ الإجمالي</th>
                <th>الخصم</th>
                <th>الصافي المستحق</th>
                <th>المرفق</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    <div className="arch-animate-pulse" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
                    <div>جاري تحميل فواتير الأرشيف...</div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🗂️</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#94a3b8' }}>لا توجد فواتير تطابق شروط البحث</div>
                    <p style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>جرب تعديل خيارات البحث أو اضغط على "رفع فاتورة جديدة"</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const invId = inv.id;
                  const invNumber = inv.invoiceNumber || inv.invoice_number;
                  const invDate = (inv.invoiceDate || inv.invoice_date || '').split('T')[0];
                  const suppName = inv.supplier?.name || inv.supplier_name || 'مورد عام';
                  const recName = inv.receiver?.name || inv.receiver_name;
                  const clerkName = inv.entryClerk?.name || inv.entry_clerk_name;
                  const itemsCount = inv.items?.length || inv.items_count || 0;
                  const gross = parseFloat(inv.totalAmount || inv.total_amount || 0);
                  const disc = parseFloat(inv.discount || 0);
                  const net = parseFloat(inv.netAmount || inv.net_amount || 0);
                  const fileUrl = inv.fileUrl || inv.file_url;

                  return (
                    <tr
                      key={invId}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onSelectInvoice(inv)}
                    >
                      <td style={{ fontWeight: 800, color: '#f8fafc' }}>
                        {invNumber}
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        {invDate}
                      </td>
                      <td style={{ fontWeight: 700, color: '#60a5fa' }}>
                        {suppName}
                      </td>
                      <td>
                        {recName ? (
                          <span className="arch-badge blue">📥 {recName}</span>
                        ) : clerkName ? (
                          <span className="arch-badge purple">✍️ {clerkName}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span className="arch-badge gray">{itemsCount} صنف</span>
                      </td>
                      <td style={{ color: '#cbd5e1' }}>
                        {gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: '#fbbf24' }}>
                        {disc > 0 ? `-${disc.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '0.00'}
                      </td>
                      <td style={{ fontWeight: 800, color: '#34d399', fontSize: '0.95rem' }}>
                        {net.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                      </td>
                      <td>
                        {fileUrl ? (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="arch-badge green"
                            style={{ textDecoration: 'none' }}
                          >
                            📎 معاينة
                          </a>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>لا يوجد</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="arch-btn-secondary"
                            onClick={() => onSelectInvoice(inv)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            👁️ تفاصيل
                          </button>
                          <button
                            type="button"
                            className="arch-btn-danger"
                            onClick={(e) => handleDelete(invId, e)}
                            disabled={deletingId === invId}
                            title="حذف الفاتورة"
                          >
                            {deletingId === invId ? '⏳' : '🗑️'}
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
