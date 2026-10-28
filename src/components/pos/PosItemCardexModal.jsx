import React, { useState, useEffect, useMemo } from 'react';
import { Search, Clock, ArrowDownLeft, ArrowUpRight, RotateCcw, X, Filter, Download, Package, RefreshCw, Barcode } from 'lucide-react';
import { stockGetLedger, stockSearchMedications } from '../../utils/stockApiClient';
import { loadExcelJS } from '../../utils/excelExport';

/**
 * PosItemCardexModal.jsx
 * كارت الصنف ومراجعة حركة الأصناف بالفرع (Item Cardex / Movement Audit)
 */
export default function PosItemCardexModal({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [movementType, setMovementType] = useState('all'); // 'all' | 'sale' | 'receipt' | 'return' | 'scrap'
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLedger = async () => {
    try {
      setIsLoading(true);
      const res = await stockGetLedger({ limit: 100 });
      if (res?.success && Array.isArray(res.ledger)) {
        setLedgerEntries(res.ledger);
      } else {
        // فحص السجل المحلي للـ POS
        const local = localStorage.getItem('pharma_pos_sales_history');
        if (local) {
          const sales = JSON.parse(local);
          const localEntries = [];
          sales.forEach((s) => {
            (s.cart || []).forEach((it) => {
              localEntries.push({
                id: `mov_${s.id}_${it.productId}`,
                medication_name: it.tradeNameAr,
                barcode: it.barcode,
                movement_type: 'sale',
                quantity: it.quantity,
                unit_price: it.unitPrice,
                created_at: s.createdAt,
                reference_number: s.invoiceNumber || s.id,
                created_by: s.cashierName || 'كاشير'
              });
            });
          });
          setLedgerEntries(localEntries);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch ledger:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchLedger();
  }, [isOpen]);

  const filteredEntries = useMemo(() => {
    return ledgerEntries.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(item.medication_name || item.tradeNameAr || '').toLowerCase().includes(q) ||
        String(item.barcode || '').includes(q) ||
        String(item.reference_number || '').toLowerCase().includes(q);
      const matchType = movementType === 'all' || item.movement_type === movementType;
      return matchSearch && matchType;
    });
  }, [ledgerEntries, searchQuery, movementType]);

  const handleExportExcel = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('حركة الأصناف');
      ws.views = [{ rightToLeft: true }];

      ws.columns = [
        { header: 'اسم الصنف', key: 'name', width: 25 },
        { header: 'الباركود', key: 'barcode', width: 18 },
        { header: 'نوع الحركة', key: 'type', width: 14 },
        { header: 'الكمية', key: 'qty', width: 10 },
        { header: 'السعر', key: 'price', width: 12 },
        { header: 'رقم الإشعار / الفاتورة', key: 'ref', width: 20 },
        { header: 'التاريخ', key: 'date', width: 18 },
        { header: 'المستخدم', key: 'user', width: 16 }
      ];

      filteredEntries.forEach((e) => {
        ws.addRow({
          name: e.medication_name || e.tradeNameAr,
          barcode: e.barcode,
          type: e.movement_type === 'sale' ? 'مبيعات' : e.movement_type === 'return' ? 'مرتجع' : 'وارد',
          qty: e.quantity,
          price: e.unit_price,
          ref: e.reference_number,
          date: String(e.created_at || '').slice(0, 16),
          user: e.created_by
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `كارت_حركة_الأصناف_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
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
          width: '920px',
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
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb'
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                مراجعة حركة الأصناف وكارت الصنف (Item Cardex)
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                تتبع حركة الأدوية والمستلزمات (وارد، مبيعات، مرتجعات، توالف)
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
              onClick={fetchLedger}
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
              placeholder="بحث باسم الدواء، الباركود، أو رقم الفاتورة..."
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

          <select
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '12.5px',
              outline: 'none',
              fontWeight: 700
            }}
          >
            <option value="all">كافة الحركات</option>
            <option value="sale">مبيعات نقدية وآجلة</option>
            <option value="return">مرتجع مبيعات</option>
            <option value="receipt">وارد من المخزن الرئيسي</option>
            <option value="scrap">توالف وهوالك</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Package size={36} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 800 }}>لا توجد حركات مسجلة مطابقة للبحث</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 800 }}>
                  <th style={{ padding: '10px' }}>اسم الصنف</th>
                  <th style={{ padding: '10px' }}>الباركود</th>
                  <th style={{ padding: '10px' }}>نوع الحركة</th>
                  <th style={{ padding: '10px' }}>الكمية</th>
                  <th style={{ padding: '10px' }}>السعر</th>
                  <th style={{ padding: '10px' }}>رقم الإشعار</th>
                  <th style={{ padding: '10px' }}>التاريخ</th>
                  <th style={{ padding: '10px' }}>المستخدم</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((row, idx) => {
                  const isSale = row.movement_type === 'sale';
                  const isReturn = row.movement_type === 'return';
                  return (
                    <tr key={row.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontWeight: 800, color: '#0f172a' }}>
                        {row.medication_name || row.tradeNameAr}
                      </td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#64748b' }}>{row.barcode || '-'}</td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: isSale ? '#f0fdf4' : isReturn ? '#fef2f2' : '#eff6ff',
                            color: isSale ? '#15803d' : isReturn ? '#b91c1c' : '#1d4ed8'
                          }}
                        >
                          {isSale ? <ArrowDownLeft size={12} /> : isReturn ? <RotateCcw size={12} /> : <ArrowUpRight size={12} />}
                          {isSale ? 'بيع' : isReturn ? 'مرتجع' : 'وارد'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', fontWeight: 900 }}>{row.quantity}</td>
                      <td style={{ padding: '10px', color: '#059669', fontWeight: 800 }}>
                        {parseFloat(row.unit_price || 0).toFixed(2)} ج.م
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{row.reference_number || '-'}</td>
                      <td style={{ padding: '10px', color: '#64748b' }}>{String(row.created_at || '').slice(0, 16)}</td>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{row.created_by || 'الكاشير'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

