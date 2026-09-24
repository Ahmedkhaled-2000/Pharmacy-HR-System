import React, { useRef } from 'react';
import { Printer, X, CheckCircle, Phone, MapPin, Calendar, Clock } from 'lucide-react';

/**
 * DualCashierReceiptModal.jsx
 * طباعة فاتورة الكاشير الحرارية المزدوجة (نسخة العميل + نسخة الصيدلية)
 * قياس 80mm / 57mm مع باركود بارز لسرعة الاسترجاع بالماسح الضوئي
 */
export default function DualCashierReceiptModal({ order, branch, onClose }) {
  const printAreaRef = useRef(null);

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const branchName = branch?.name || order.branch_name || 'صيدلية النور والشفاء';
  const branchPhone = branch?.phone || '';
  const branchAddress = branch?.address || '';

  // دالة بسيطة لتوليد خطوط الباركود كـ SVG لضمان العمل أوفلاين دون حزم إضافية
  const renderSvgBarcode = (code) => {
    const cleanCode = String(code || '00000000').replace(/[^a-zA-Z0-9-]/g, '');
    const bars = [];
    for (let i = 0; i < cleanCode.length; i++) {
      const charCode = cleanCode.charCodeAt(i);
      const isThick = charCode % 2 === 0;
      bars.push(
        <rect
          key={i}
          x={i * 7}
          y={0}
          width={isThick ? 4.5 : 2}
          height={38}
          fill="#000000"
        />
      );
    }
    return (
      <svg width={cleanCode.length * 7 + 10} height="42" viewBox={`0 0 ${cleanCode.length * 7 + 10} 42`}>
        {bars}
      </svg>
    );
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel"
        style={{ maxWidth: '520px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="outstock-modal-header">
          <h3>🖨️ طباعة إيصال الكاشير (نسختين)</h3>
          <button className="outstock-modal-close" onClick={onClose}>
            <X size={19} />
          </button>
        </div>

        <div className="outstock-modal-body" style={{ background: '#f8fafc' }}>
          {/* إشعار التجهيز */}
          <div style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#065f46',
            fontSize: '13px',
            fontWeight: '700'
          }}>
            <CheckCircle size={18} />
            <span>جاهز للطباعة على طابعة الكاشير الحرارية (نسخة للعميل + نسخة للصيدلية)</span>
          </div>

          {/* منطقة المعاينة والطباعة الحرارية المباشرة */}
          <div ref={printAreaRef} className="thermal-receipt-container" style={{
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
          }}>
            {/* ── 1. نسخة العميل ── */}
            <div className="receipt-copy">
              <div className="receipt-header">
                <h3>{branchName}</h3>
                <p>إيصال حجز وتوفير دواء (نسخة العميل)</p>
                {branchPhone && <p><Phone size={10} style={{ display: 'inline' }} /> {branchPhone}</p>}
                {branchAddress && <p><MapPin size={10} style={{ display: 'inline' }} /> {branchAddress}</p>}
              </div>

              <div className="receipt-meta">
                <div>رقم الإيصال: <strong>{order.order_number || order.orderNumber}</strong></div>
                <div>العميل: <strong>{order.customer_name || order.customerName}</strong></div>
                <div>الهاتف: {order.customer_phone || order.customerPhone}</div>
                <div>التاريخ: {new Date(order.created_at || order.createdAt || Date.now()).toLocaleDateString('ar-EG')} - {new Date(order.created_at || order.createdAt || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>الصيدلي المسؤول: {order.responsible_pharmacist || order.responsiblePharmacist || 'د. صيدلي'}</div>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الوحدة</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill).map((item, idx) => (
                    <tr key={idx}>
                      <td><strong>{item.medicationName || item.medication_name}</strong></td>
                      <td>{item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                      <td>{item.quantity}</td>
                      <td>{parseFloat(item.unitPrice || item.unit_price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>إجمالي القيمة:</span>
                  <strong>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>العربون المدفوع:</span>
                  <strong style={{ color: '#059669' }}>{parseFloat(order.paid_amount || order.paidAmount || 0).toFixed(2)} ج.م</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid #000', paddingTop: '3px' }}>
                  <span>المتبقي عند الاستلام:</span>
                  <strong style={{ color: '#dc2626' }}>{parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2)} ج.م</strong>
                </div>
                {order.expected_pickup_date && (
                  <div style={{ marginTop: '4px', fontSize: '11px', color: '#1e293b' }}>
                    <Calendar size={10} style={{ display: 'inline' }} /> موعد الاستلام: {order.expected_pickup_date || order.expectedPickupDate} {order.expected_pickup_time || order.expectedPickupTime ? `(${order.expected_pickup_time || order.expectedPickupTime})` : ''}
                  </div>
                )}
              </div>

              <div className="receipt-barcode">
                {renderSvgBarcode(order.barcode_data || order.barcodeData)}
                <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 'bold' }}>
                  *{order.barcode_data || order.barcodeData}*
                </div>
                <small style={{ fontSize: '9px', display: 'block', marginTop: '3px' }}>
                  يرجى إبراز هذا الإيصال أو الباركود عند الحضور للاستلام
                </small>
              </div>
            </div>

            {/* خط فاصل للقص التلقائي */}
            <div className="receipt-page-cut-line">
              - - - - - - - - - خط القص (نسخة الصيدلية بالأسفل) - - - - - - - - -
            </div>

            {/* ── 2. نسخة الصيدلية (مرفقة مع علبة الدواء) ── */}
            <div className="receipt-copy">
              <div className="receipt-header">
                <h3>{branchName}</h3>
                <p>إيصال حجز وتوفير دواء (نسخة الصيدلية)</p>
                <small>تُحفظ مع علبة الدواء في درج النواقص لحين حضور العميل</small>
              </div>

              <div className="receipt-meta">
                <div>رقم الإيصال: <strong>{order.order_number || order.orderNumber}</strong></div>
                <div>العميل: <strong>{order.customer_name || order.customerName}</strong> ({order.customer_phone || order.customerPhone})</div>
                <div>المتبقي تحصيله: <strong style={{ color: '#dc2626', fontSize: '13px' }}>{parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2)} ج.م</strong></div>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr><th>الصنف</th><th>النوع</th><th>الكمية</th></tr>
                </thead>
                <tbody>
                  {(order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill).map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.medicationName || item.medication_name}</td>
                      <td>{item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                      <td><strong>{item.quantity}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '14px', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '11px' }}>
                <p style={{ margin: '0 0 10px' }}>توقيع العميل بالاستلام: ..............................</p>
                <div className="receipt-barcode">
                  {renderSvgBarcode(order.barcode_data || order.barcodeData)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="outstock-modal-footer">
          <button className="outstock-btn outstock-btn-secondary" onClick={onClose}>
            إلغاء
          </button>
          <button className="outstock-btn outstock-btn-primary" onClick={handlePrint}>
            <Printer size={16} />
            <span>طباعة الإيصالين الآن (Print)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
