import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Calendar,
  CheckSquare,
  Square,
  FileText,
  Building2,
  RefreshCw,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { outstockGetSupplierInvoices } from '../../../utils/outstockApiClient';

/**
 * SelectRegisteredInvoicesModal.jsx
 * نافذة احترافية لتحديد فواتير التوريد المسجلة بالنظام لإدراجها في المسحوبات اليدوية
 */
export default function SelectRegisteredInvoicesModal({
  isOpen,
  suppliers = [],
  initialSupplierId = '',
  onClose,
  onConfirm
}) {
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialSupplierId || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());

  // تحديث المورد الافتراضي عند فتح النافذة
  useEffect(() => {
    if (isOpen) {
      setSelectedSupplierId(initialSupplierId || 'all');
      setSelectedInvoiceIds(new Set());
      setSearchQuery('');
      setDateFrom('');
      setDateTo('');
    }
  }, [isOpen, initialSupplierId]);

  // جلب الفواتير المسجلة من السيرفر
  const fetchInvoices = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = {};
      if (selectedSupplierId && selectedSupplierId !== 'all') {
        params.supplierId = selectedSupplierId;
      }
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await outstockGetSupplierInvoices(params);
      if (res?.success) {
        setInvoices(res.invoices || []);
      }
    } catch (err) {
      console.error('Error fetching registered invoices:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSupplierId, dateFrom, dateTo, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      fetchInvoices();
    }
  }, [isOpen, fetchInvoices]);

  // تبديل اختيار فاتورة مفردة
  const toggleSelectInvoice = (invId) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invId)) next.delete(invId);
      else next.add(invId);
      return next;
    });
  };

  // تبديل تحديد كافة الفواتير المعروضة
  const toggleSelectAll = () => {
    if (selectedInvoiceIds.size === invoices.length && invoices.length > 0) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(invoices.map((i) => i.id)));
    }
  };

  // إحصائيات التحديد اللحظية
  const { selectedCount, selectedTotalAmount, selectedInvoicesList } = useMemo(() => {
    const list = invoices.filter((i) => selectedInvoiceIds.has(i.id));
    const total = list.reduce(
      (sum, i) => sum + (parseFloat(i.net_total_amount || i.subtotal_amount || 0) || 0),
      0
    );
    return {
      selectedCount: list.length,
      selectedTotalAmount: total,
      selectedInvoicesList: list
    };
  }, [invoices, selectedInvoiceIds]);

  const handleConfirmSelection = () => {
    if (selectedInvoicesList.length === 0) return;
    const formattedRows = selectedInvoicesList.map((inv) => ({
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      amount: String(inv.net_total_amount || inv.subtotal_amount || 0),
      supplier_name: inv.supplier_name || ''
    }));
    onConfirm(formattedRows);
    onClose();
  };

  if (!isOpen) return null;

  const isAllSelected = invoices.length > 0 && selectedInvoiceIds.size === invoices.length;

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 110000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          direction: 'rtl',
          border: '1px solid #e2e8f0'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb'
              }}
            >
              <CheckSquare size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                تحديد فواتير التوريد المسجلة
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                اختر الفواتير المطلوبة لإدراجها تلقائياً في كشف المسحوبات اليدوية
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* شريط الفلاتر والبحث */}
        <div
          style={{
            padding: '14px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          {/* فلتر المورد */}
          <div style={{ minWidth: '180px', flex: 1 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              المورد:
            </label>
            <select
              className="outstock-form-select"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              style={{ width: '100%', height: '36px', fontSize: '12px' }}
            >
              <option value="all">كافة الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code || s.supplier_code || '---'})
                </option>
              ))}
            </select>
          </div>

          {/* بحث برقم الفاتورة */}
          <div style={{ minWidth: '180px', flex: 1.2 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              رقم الفاتورة أو الصنف:
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              />
              <input
                type="text"
                className="outstock-form-input"
                placeholder="بحث برقم الفاتورة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingRight: '32px', height: '36px', fontSize: '12px', width: '100%' }}
              />
            </div>
          </div>

          {/* فلتر من تاريخ */}
          <div style={{ minWidth: '130px', flex: 0.8 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              من تاريخ:
            </label>
            <input
              type="date"
              className="outstock-form-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ height: '36px', fontSize: '11.5px', width: '100%' }}
            />
          </div>

          {/* فلتر إلى تاريخ */}
          <div style={{ minWidth: '130px', flex: 0.8 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              إلى تاريخ:
            </label>
            <input
              type="date"
              className="outstock-form-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ height: '36px', fontSize: '11.5px', width: '100%' }}
            />
          </div>

          {/* زر تحديث */}
          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchInvoices}
              title="إعادة تحميل الفواتير"
              style={{ height: '36px', padding: '0 12px' }}
            >
              <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
            </button>
          </div>
        </div>

        {/* جسم جدول الفواتير */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري تحميل فواتير التوريد...</div>
            </div>
          ) : invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              <FileText size={36} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <div style={{ fontWeight: '700' }}>لا توجد فواتير مطابقة لمعايير البحث</div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                جرب تغيير خيارات الفلترة أو المورد المحدد
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5 }}>
                  <th style={{ padding: '10px 14px', width: '45px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={isAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                    >
                      {isAllSelected ? (
                        <CheckSquare size={18} color="#2563eb" />
                      ) : (
                        <Square size={18} color="#94a3b8" />
                      )}
                    </button>
                  </th>
                  <th style={{ padding: '10px 12px' }}>رقم الفاتورة</th>
                  <th style={{ padding: '10px 12px' }}>تاريخ الفاتورة</th>
                  <th style={{ padding: '10px 12px' }}>المورد</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>عدد الأصناف</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>صافي القيمة (ج.م)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>حالة السداد</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isChecked = selectedInvoiceIds.has(inv.id);
                  const netAmount = parseFloat(inv.net_total_amount || inv.subtotal_amount || 0);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => toggleSelectInvoice(inv.id)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isChecked ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {isChecked ? (
                          <CheckSquare size={18} color="#2563eb" />
                        ) : (
                          <Square size={18} color="#cbd5e1" />
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '800', color: '#1e293b' }}>
                        {inv.invoice_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('ar-EG') : '---'}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f766e' }}>
                        {inv.supplier_name || 'مورد عام'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569' }}>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700' }}>
                          {inv.items_count || 1} صنف
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '900', color: '#0369a1' }}>
                        {netAmount.toLocaleString('ar-EG')} ج.م
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '800',
                            background: inv.payment_status === 'paid' ? '#dcfce7' : inv.payment_status === 'partially_paid' ? '#fef3c7' : '#fee2e2',
                            color: inv.payment_status === 'paid' ? '#166534' : inv.payment_status === 'partially_paid' ? '#92400e' : '#991b1b'
                          }}
                        >
                          {inv.payment_status === 'paid' ? 'مدفوعة' : inv.payment_status === 'partially_paid' ? 'جزئي' : 'مستحقة'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* شريط الإجراءات السفلي وملخص التحديد */}
        <div
          style={{
            padding: '14px 20px',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          {/* إحصائيات التحديد */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: selectedCount > 0 ? '#eff6ff' : '#f1f5f9',
                color: selectedCount > 0 ? '#1d4ed8' : '#64748b',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: '800',
                border: '1px solid',
                borderColor: selectedCount > 0 ? '#bfdbfe' : '#e2e8f0'
              }}
            >
              تم تحديد {selectedCount} فاتورة
            </span>

            {selectedCount > 0 && (
              <span
                style={{
                  background: '#f0fdf4',
                  color: '#166534',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: '900',
                  border: '1px solid #bbf7d0'
                }}
              >
                إجمالي المبالغ: {selectedTotalAmount.toLocaleString('ar-EG')} ج.م
              </span>
            )}
          </div>

          {/* أزرار الإجراء */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              إلغاء
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              disabled={selectedCount === 0}
              onClick={handleConfirmSelection}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: selectedCount > 0 ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : '#94a3b8',
                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <CheckCircle2 size={16} />
              <span>إدراج الفواتير المحددة ({selectedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
