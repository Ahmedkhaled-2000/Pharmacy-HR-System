import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Search, Calendar, Package, CheckCircle2, Download, Printer, X, RefreshCw, Building2, Eye } from 'lucide-react';
import { stockGetTransfers, stockGetOverview } from '../../utils/stockApiClient';
import { loadExcelJS } from '../../utils/excelExport';

/**
 * PosReceivedInvoicesModal.jsx
 * سجل الفواتير وأذون الاستلام الواردة من المخزن الرئيسي
 */
export default function PosReceivedInvoicesModal({ isOpen, onClose }) {
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const fetchReceivedInvoices = async () => {
    try {
      setIsLoading(true);
      const res = await stockGetTransfers({ status: 'completed' });
      if (res?.success && Array.isArray(res.transfers)) {
        setInvoices(res.transfers);
      } else {
        // فحص الفواتير المسجلة محلياً
        const local = localStorage.getItem('pharma_received_transfers_log');
        if (local) setInvoices(JSON.parse(local));
      }
    } catch (err) {
      console.warn('Failed to fetch received transfers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchReceivedInvoices();
    }
  }, [isOpen]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        !searchQuery.trim() ||
        String(inv.transfer_number || inv.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(inv.source_location_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(inv.received_by_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchDate = !dateFilter || String(inv.received_at || inv.created_at || '').slice(0, 10) === dateFilter;
      return matchSearch && matchDate;
    });
  }, [invoices, searchQuery, dateFilter]);

  // تصدير إكسيل
  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('سجل الفواتير المستلمة');
      worksheet.views = [{ rightToLeft: true }];

      worksheet.columns = [
        { header: 'رقم الإذن / الفاتورة', key: 'transfer_number', width: 22 },
        { header: 'المخزن المحول منه', key: 'source', width: 22 },
        { header: 'تاريخ الاستلام', key: 'date', width: 18 },
        { header: 'مستلم الشحنة', key: 'receiver', width: 20 },
        { header: 'عدد الأصناف', key: 'itemsCount', width: 14 },
        { header: 'إجمالي القيمة', key: 'totalValue', width: 16 }
      ];

      filteredInvoices.forEach((inv) => {
        worksheet.addRow({
          transfer_number: inv.transfer_number || inv.id,
          source: inv.source_location_name || 'المخزن الرئيسي',
          date: String(inv.received_at || inv.created_at || '').slice(0, 16),
          receiver: inv.received_by_name || 'صيدلي الفرع',
          itemsCount: inv.items_count || (Array.isArray(inv.items) ? inv.items.length : 1),
          totalValue: parseFloat(inv.total_cost || inv.total_amount || 0).toFixed(2)
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `سجل_فواتير_استلام_المخزن_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('حدث خطأ أثناء تصدير ملف الإكسيل');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(10px)',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          width: '900px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1.5px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#f0fdfa',
                border: '1.5px solid #99f6e4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0d9488'
              }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                سجل الفواتير وأذون الاستلام من المخزن الرئيسي
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                أرشيف حركة الشحنات والتحويلات الواردة لفرع الصيدلية
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '7px 12px',
                borderRadius: '8px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <Download size={14} />
              <span>تصدير إكسيل</span>
            </button>
            <button
              type="button"
              onClick={fetchReceivedInvoices}
              style={{
                padding: '7px',
                borderRadius: '8px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} className={isLoading ? 'pos-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '7px',
                borderRadius: '8px',
                background: '#fee2e2',
                border: 'none',
                color: '#b91c1c',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '12px 22px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="بحث برقم الإذن، المخزن، أو اسم المستلم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              outline: 'none'
            }}
          />
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {filteredInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Package size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 800 }}>لا توجد فواتير أو أذون استلام مسجلة حالياً</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '10px' }}>رقم الإذن / الفاتورة</th>
                  <th style={{ padding: '10px' }}>المخزن المحول</th>
                  <th style={{ padding: '10px' }}>تاريخ الاستلام</th>
                  <th style={{ padding: '10px' }}>المستلم</th>
                  <th style={{ padding: '10px' }}>الأصناف</th>
                  <th style={{ padding: '10px' }}>القيمة</th>
                  <th style={{ padding: '10px' }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv, idx) => (
                  <tr key={inv.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px', fontWeight: 900, color: '#0d9488' }}>
                      {inv.transfer_number || inv.id}
                    </td>
                    <td style={{ padding: '10px' }}>{inv.source_location_name || 'المخزن الرئيسي'}</td>
                    <td style={{ padding: '10px', color: '#64748b' }}>
                      {String(inv.received_at || inv.created_at || '').slice(0, 16)}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{inv.received_by_name || 'صيدلي الكاشير'}</td>
                    <td style={{ padding: '10px' }}>
                      {inv.items_count || (Array.isArray(inv.items) ? inv.items.length : 1)} صنف
                    </td>
                    <td style={{ padding: '10px', fontWeight: 900, color: '#059669' }}>
                      {parseFloat(inv.total_cost || inv.total_amount || 0).toFixed(2)} ج.م
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#ecfdf5',
                          color: '#059669',
                          fontWeight: 800,
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CheckCircle2 size={12} />
                        تم الاستلام بالفرع
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

