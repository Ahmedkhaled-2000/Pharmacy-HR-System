import React, { useState, useMemo } from 'react';
import {
  Truck,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  Eye,
  Send,
  Printer,
  FileCheck,
  Tag,
  KeyRound,
  FileText
} from 'lucide-react';
import { printTransferInvoicePdf } from '../../utils/transferInvoicePdfGenerator';
import { printThermalLabels } from '../../utils/labelPrintService';

export default function StockTransfersTab({
  transfers = [],
  locations = [],
  isLoading = false,
  onNewTransfer,
  onViewDetails,
  onDispatch,
  onOpenReceive,
  showToast = () => { }
}) {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  const filteredTransfers = useMemo(() => {
    return transfers.filter((tr) => {
      if (selectedStatus && tr.status !== selectedStatus) return false;
      if (selectedLocation && tr.source_location_id !== selectedLocation && tr.destination_location_id !== selectedLocation) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const num = String(tr.transfer_number || '').toLowerCase();
      const vCode = String(tr.verification_code || '').toLowerCase();
      const fromName = String(tr.source_name || tr.from_name || '').toLowerCase();
      const toName = String(tr.destination_name || tr.to_name || '').toLowerCase();

      return num.includes(q) || vCode.includes(q) || fromName.includes(q) || toName.includes(q);
    });
  }, [transfers, search, selectedStatus, selectedLocation]);

  const handlePrintPdf = (tr) => {
    printTransferInvoicePdf(tr, tr.items || []);
  };

  const handlePrintLabels = (tr) => {
    const items = tr.items || [];
    if (items.length === 0) {
      showToast('يرجى فتح تفاصيل التحويل أولاً لتحميل قائمة البنود والتشغيلات', 'warning');
      onViewDetails?.(tr);
      return;
    }
    const labels = items.map(it => ({
      medication_id: it.medication_id,
      trade_name_ar: it.trade_name_ar || it.medication_name,
      trade_name_en: it.trade_name_en,
      public_price: it.public_price,
      batch_number: it.batch_number || 'B-STOCK',
      expiry_date: it.expiry_date,
      supplier_code: it.supplier_code_snapshot || 'MAIN',
      label_barcode: it.label_barcode || `P${it.medication_id}-${it.batch_number || 'B1'}`,
      quantity: Math.round(parseFloat(it.quantity_dispatched || it.quantity_requested || 1))
    }));
    printThermalLabels(labels);
    showToast(`جاري طباعة ملصقات الباركود لـ ${labels.length} صنف... 🏷️`, 'success');
  };

  return (
    <div className="stock-grid-wrapper">
      {/* ── شريط أدوات التحويلات ── */}
      <div className="stock-grid-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
          <div className="stock-search-input-box">
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="ابحث برقم الإذن، كود الاستلام، أو الفرع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="stock-select-filter"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">🚚 كافة حالات التحويل</option>
            <option value="in_transit">🚚 قيد النقل (In-Transit)</option>
            <option value="pending_approval">📝 مسودة قيد التجهيز</option>
            <option value="received_fully">✅ تم الاستلام بنجاح</option>
            <option value="cancelled">❌ ملغي</option>
          </select>

          <select
            className="stock-select-filter"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            <option value="">🏢 طرف التحويل (أي فرع أو مستودع)</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name_ar || loc.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="stock-quick-action-btn primary"
            onClick={onNewTransfer}
          >
            <Plus size={14} />
            <span>إنشاء أمر تحويل جديد</span>
          </button>
        </div>

        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          أوامر التحويل: <strong>{filteredTransfers.length}</strong>
        </div>
      </div>

      {/* ── جدول أوامر التحويل ── */}
      <div className="stock-table-container">
        <table className="stock-data-table">
          <thead>
            <tr>
              <th>رقم الأمر</th>
              <th>كود الاستلام (PIN)</th>
              <th>المستودع المصدر (من)</th>
              <th>المستودع الوجهة (إلى)</th>
              <th>عدد البنود</th>
              <th>تاريخ الصرف</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th>إجراءات وطباعة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  جاري تحميل حركة التحويلات بين الفروع...
                </td>
              </tr>
            ) : filteredTransfers.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  لا توجد أوامر تحويل مطابقة.
                </td>
              </tr>
            ) : (
              filteredTransfers.map((tr) => (
                <tr key={tr.id}>
                  <td style={{ fontWeight: 800, color: '#0f766e', fontFamily: 'monospace', fontSize: '12.5px' }}>
                    {tr.transfer_number}
                  </td>
                  <td>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#f0fdfa',
                      color: '#0f766e',
                      border: '1px solid #ccfbf1',
                      padding: '2px 7px',
                      borderRadius: '5px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '11.5px'
                    }}>
                      <KeyRound size={11} />
                      {tr.verification_code || tr.transfer_number?.slice(-8) || 'TRF-PIN'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{tr.source_name || tr.from_name || tr.source_location_id}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0f766e' }}>{tr.destination_name || tr.to_name || tr.destination_location_id}</div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>
                    {tr.total_requested_items || tr.total_items_count || '—'}
                  </td>
                  <td>{tr.dispatched_at ? new Date(tr.dispatched_at).toLocaleDateString('ar-EG') : new Date(tr.created_at).toLocaleDateString('ar-EG')}</td>
                  <td>
                    {tr.status === 'in_transit' ? (
                      <span className="stock-badge info">🚚 قيد النقل بالطريق</span>
                    ) : tr.status === 'received_fully' || tr.status === 'received' ? (
                      <span className="stock-badge success">✅ تم الاستلام بنجاح</span>
                    ) : tr.status === 'pending_approval' || tr.status === 'draft' ? (
                      <span className="stock-badge warning">📝 مسودة تجهيز</span>
                    ) : (
                      <span className="stock-badge danger">❌ ملغي</span>
                    )}
                  </td>
                  <td style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tr.notes || tr.driver_name ? `سائق: ${tr.driver_name || ''}` : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="stock-menu-trigger-btn"
                        style={{ padding: '4px 7px', fontSize: '11px' }}
                        title="معاينة تفاصيل الأصناف"
                        onClick={() => onViewDetails?.(tr)}
                      >
                        <Eye size={12} />
                        <span>تفاصيل</span>
                      </button>

                      <button
                        type="button"
                        className="stock-menu-trigger-btn"
                        style={{ padding: '4px 7px', fontSize: '11px', color: '#0f766e' }}
                        title="طباعة إذن التحويل PDF"
                        onClick={() => handlePrintPdf(tr)}
                      >
                        <Printer size={12} />
                        <span>فاتورة PDF</span>
                      </button>

                      <button
                        type="button"
                        className="stock-menu-trigger-btn"
                        style={{ padding: '4px 7px', fontSize: '11px', color: '#d97706' }}
                        title="طباعة ملصقات الباركود للشحنة"
                        onClick={() => handlePrintLabels(tr)}
                      >
                        <Tag size={12} />
                        <span>ملصقات</span>
                      </button>

                      {(tr.status === 'draft' || tr.status === 'pending_approval') && (
                        <button
                          type="button"
                          className="stock-quick-action-btn primary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          title="شحن البضاعة ونقلها لحالة In-Transit"
                          onClick={() => onDispatch?.(tr)}
                        >
                          <Send size={12} />
                          <span>صرف</span>
                        </button>
                      )}

                      {tr.status === 'in_transit' && (
                        <button
                          type="button"
                          className="stock-quick-action-btn warning"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          title="فحص واستلام البضاعة بالفرع بالكود"
                          onClick={() => onOpenReceive?.(tr)}
                        >
                          <FileCheck size={12} />
                          <span>استلام</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
