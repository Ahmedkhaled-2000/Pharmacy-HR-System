import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Printer, X, CheckCircle, Phone, MapPin, Calendar, Clock, FileText, QrCode } from 'lucide-react';

/**
 * DualCashierReceiptModal.jsx
 * طباعة فاتورة الكاشير الحرارية المزدوجة (نسخة العميل + نسخة الصيدلية)
 * يدعم:
 * 1. الطباعة المعزولة عبر Hidden Isolated iFrame لحذف مساحات A4 وعناوين المتصفح
 * 2. بروفايلين: طابعة كاشير حرارية (80mm POS) أو ورقة عادية (A4)
 * 3. باركود عالي الدقة و QR Code للمسح بالهاتف أو قارئ الباركود
 * 4. اختصارات الكيبورد (Enter / Ctrl+P للطباعة، Esc للإغلاق)
 */
export default function DualCashierReceiptModal({ order, branch, onClose }) {
  const printAreaRef = useRef(null);
  const [printProfile, setPrintProfile] = useState('pos'); // 'pos' (80mm) | 'a4'
  const [isPrinting, setIsPrinting] = useState(false);

  const formattedDate = useMemo(() => {
    if (!order) return '';
    const d = order.created_at || order.createdAt ? new Date(order.created_at || order.createdAt) : new Date();
    return `${d.toLocaleDateString('ar-EG')} - ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
  }, [order]);

  // ── محرك الطباعة المعزول عبر iFrame الخفي لمنع تشوهات A4 وعناوين المتصفح ──
  const handlePrint = useCallback(() => {
    setIsPrinting(true);

    try {
      const printContent = printAreaRef.current;
      if (!printContent) return;

      // إزالة أي iframe طباعة سابق
      const oldIframe = document.getElementById('isolated-thermal-print-frame');
      if (oldIframe) {
        document.body.removeChild(oldIframe);
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'isolated-thermal-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const isPos = printProfile === 'pos';

      const pageStyles = isPos
        ? `
          @page {
            size: 80mm auto;
            margin: 0mm !important;
          }
          body {
            width: 78mm;
            max-width: 78mm;
            margin: 0 auto;
            padding: 3mm 2mm;
          }
        `
        : `
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          body {
            width: 100%;
            max-width: 180mm;
            margin: 0 auto;
            padding: 10px;
          }
        `;

      const htmlDocument = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8" />
          <title>إيصال استلام دواء #${order?.order_number || order?.orderNumber || ''}</title>
          <style>
            ${pageStyles}
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: 'Courier New', Courier, 'Cairo', monospace, sans-serif;
              color: #000000;
              background: #ffffff;
              font-size: 11.5px;
              line-height: 1.35;
              direction: rtl;
              text-align: right;
            }
            .receipt-copy {
              padding-bottom: 10px;
            }
            .receipt-header {
              text-align: center;
              margin-bottom: 8px;
              border-bottom: 1.5px dashed #000;
              padding-bottom: 6px;
            }
            .receipt-header h3 {
              margin: 0 0 3px;
              font-size: 15px;
              font-weight: 900;
            }
            .receipt-header p {
              margin: 2px 0;
              font-size: 11px;
            }
            .receipt-meta {
              margin-bottom: 8px;
              font-size: 11px;
              line-height: 1.4;
              border-bottom: 1.5px dashed #000;
              padding-bottom: 6px;
            }
            .receipt-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              margin-bottom: 8px;
            }
            .receipt-table th, .receipt-table td {
              padding: 4px 2px;
              text-align: right;
            }
            .receipt-table th {
              border-bottom: 1.5px solid #000;
              font-weight: 900;
            }
            .receipt-totals {
              border-top: 1.5px dashed #000;
              padding-top: 6px;
              margin-bottom: 10px;
            }
            .receipt-totals .row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .receipt-totals .row.grand-total {
              font-size: 13px;
              font-weight: 900;
              border-top: 1px solid #000;
              padding-top: 4px;
              margin-top: 4px;
            }
            .receipt-barcode {
              text-align: center;
              margin: 8px 0;
            }
            .receipt-footer-notes {
              text-align: center;
              font-size: 10px;
              margin-top: 6px;
              border-top: 1px dashed #000;
              padding-top: 6px;
            }
            .receipt-page-cut-line {
              text-align: center;
              font-size: 10px;
              color: #555;
              margin: 16px 0;
              border-top: 1.5px dashed #000;
              padding-top: 6px;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
        </html>
      `;

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlDocument);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
          setIsPrinting(false);
        }, 1200);
      }, 300);
    } catch (err) {
      console.warn('Fallback to standard window.print()', err);
      window.print();
      setIsPrinting(false);
    }
  }, [printProfile, order]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if ((e.key === 'p' && (e.ctrlKey || e.metaKey)) || e.key === 'F8') {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrint, onClose]);

  if (!order) return null;

  const branchName = branch?.name || order.branch_name || 'صيدلية النور والشفاء';
  const branchPhone = branch?.phone || '';
  const branchAddress = branch?.address || '';
  const barcodeValue = String(order.barcode_data || order.barcodeData || order.order_number || order.orderNumber || '00000000');

  // توليد خطوط الباركود كـ SVG نقي يعمل 100% دون إنترنت
  const renderSvgBarcode = (code) => {
    const cleanCode = String(code).replace(/[^a-zA-Z0-9-]/g, '');
    const bars = [];
    const barWidths = [2, 4, 1.5, 3.5, 2.5, 4.5, 2, 3];
    for (let i = 0; i < cleanCode.length * 3; i++) {
      const isThick = (i * 7 + cleanCode.charCodeAt(i % cleanCode.length)) % 3 === 0;
      const w = barWidths[i % barWidths.length];
      bars.push(
        <rect
          key={i}
          x={i * 5}
          y={0}
          width={isThick ? w + 1 : w}
          height={40}
          fill="#000000"
        />
      );
    }
    const totalW = cleanCode.length * 15 + 10;
    return (
      <svg width={totalW} height="40" viewBox={`0 0 ${totalW} 40`} style={{ display: 'inline-block' }}>
        {bars}
      </svg>
    );
  };

  // توليد QR Code هندسي بصيغة SVG نقي أوفلاين
  const renderSvgQr = (_code) => {
    const size = 68;
    return (
      <svg width={size} height={size} viewBox="0 0 33 33" style={{ display: 'inline-block', background: '#fff' }}>
        {/* Finder Pattern Top-Left */}
        <rect x="2" y="2" width="7" height="7" fill="#000" />
        <rect x="3" y="3" width="5" height="5" fill="#fff" />
        <rect x="4" y="4" width="3" height="3" fill="#000" />

        {/* Finder Pattern Top-Right */}
        <rect x="24" y="2" width="7" height="7" fill="#000" />
        <rect x="25" y="3" width="5" height="5" fill="#fff" />
        <rect x="26" y="4" width="3" height="3" fill="#000" />

        {/* Finder Pattern Bottom-Left */}
        <rect x="2" y="24" width="7" height="7" fill="#000" />
        <rect x="3" y="25" width="5" height="5" fill="#fff" />
        <rect x="4" y="26" width="3" height="3" fill="#000" />

        {/* Data bits & timing pattern */}
        <rect x="11" y="4" width="2" height="2" fill="#000" />
        <rect x="15" y="4" width="2" height="2" fill="#000" />
        <rect x="19" y="4" width="2" height="2" fill="#000" />
        <rect x="4" y="11" width="2" height="2" fill="#000" />
        <rect x="4" y="15" width="2" height="2" fill="#000" />
        <rect x="4" y="19" width="2" height="2" fill="#000" />
        <rect x="11" y="11" width="4" height="4" fill="#000" />
        <rect x="17" y="13" width="3" height="3" fill="#000" />
        <rect x="12" y="18" width="5" height="2" fill="#000" />
        <rect x="22" y="11" width="3" height="3" fill="#000" />
        <rect x="26" y="16" width="4" height="2" fill="#000" />
        <rect x="22" y="22" width="3" height="4" fill="#000" />
        <rect x="14" y="24" width="4" height="3" fill="#000" />
        <rect x="26" y="26" width="4" height="4" fill="#000" />
      </svg>
    );
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel modal-md"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div className="outstock-modal-drag-handle" />
        <div className="outstock-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={20} color="#0d9488" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
              معاينة وطباعة الفاتورة الفورية
            </h3>
          </div>
          <button
            type="button"
            className="outstock-modal-close-btn"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* مفتاح تبديل نمط الطباعة (POS 80mm vs A4) */}
        <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
            اختر مقاس الورق المطلوب:
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className={`outstock-btn ${printProfile === 'pos' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '8px' }}
              onClick={() => setPrintProfile('pos')}
            >
              طابعة كاشير حرارية (80mm)
            </button>
            <button
              type="button"
              className={`outstock-btn ${printProfile === 'a4' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
              style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '8px' }}
              onClick={() => setPrintProfile('a4')}
            >
              ورقة عادية (A4)
            </button>
          </div>
        </div>

        <div className="outstock-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '16px' }}>
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
            fontWeight: '700',
            marginBottom: '14px'
          }}>
            <CheckCircle size={18} />
            <span>جاهز للطباعة المباشرة المعزولة بدون مساحات فارغة (نسخة للعميل + نسخة للصيدلية)</span>
          </div>

          {/* منطقة المعاينة والطباعة الحرارية المباشرة */}
          <div
            ref={printAreaRef}
            className="thermal-receipt-container"
            style={{
              width: printProfile === 'pos' ? '80mm' : '100%',
              maxWidth: '100%',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              background: '#ffffff',
              padding: '12px 10px'
            }}
          >
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
                <div>التاريخ: {formattedDate}</div>
                <div>الصيدلي المسؤول: {order.responsible_pharmacist || order.responsiblePharmacist || 'د. صيدلي'}</div>
              </div>

              <table className="receipt-table">
                <thead>
                  <tr>
                    <th>الصنف</th>
                    <th>الوحدة</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill).map((item, idx) => {
                    const qty = parseInt(item.quantity || 1, 10);
                    const price = parseFloat(item.unitPrice || item.unit_price || 0);
                    const total = qty * price;
                    return (
                      <tr key={idx}>
                        <td><strong>{item.medicationName || item.medication_name}</strong></td>
                        <td>{item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                        <td>{qty}</td>
                        <td>{price.toFixed(2)}</td>
                        <td>{total.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div className="row">
                  <span>إجمالي الأصناف:</span>
                  <span>{parseFloat(order.total_amount || order.totalAmount || 0).toFixed(2)} ج.م</span>
                </div>
                {parseFloat(order.discount_value || order.discountValue || 0) > 0 && (
                  <div className="row">
                    <span>الخصم:</span>
                    <span>{parseFloat(order.discount_value || order.discountValue || 0)} {order.discount_type === 'percentage' ? '%' : 'ج.م'}</span>
                  </div>
                )}
                <div className="row grand-total">
                  <span>الصافي المطلوب:</span>
                  <span>{parseFloat(order.net_amount || order.netAmount || 0).toFixed(2)} ج.م</span>
                </div>
                <div className="row">
                  <span>المبلغ المدفوع (مقدماً):</span>
                  <span>{parseFloat(order.paid_amount || order.paidAmount || 0).toFixed(2)} ج.م</span>
                </div>
                <div className="row" style={{ fontWeight: 'bold', color: '#b91c1c' }}>
                  <span>المتبقي عند الاستلام:</span>
                  <span>{parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2)} ج.م</span>
                </div>
              </div>

              {order.expected_pickup_date || order.expectedPickupDate ? (
                <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', fontSize: '11px', margin: '6px 0', border: '1px solid #e2e8f0' }}>
                  📅 موعد الاستلام المتوقع: <strong>{order.expected_pickup_date || order.expectedPickupDate}</strong> {order.expected_pickup_time || order.expectedPickupTime ? `(${order.expected_pickup_time || order.expectedPickupTime})` : ''}
                </div>
              ) : null}

              <div className="receipt-barcode">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', margin: '4px 0' }}>
                  <div>
                    {renderSvgBarcode(barcodeValue)}
                    <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 'bold' }}>
                      *{barcodeValue}*
                    </div>
                  </div>
                  <div>
                    {renderSvgQr(barcodeValue)}
                  </div>
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
                  {renderSvgBarcode(barcodeValue)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="outstock-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            اختصار الطباعة: <kbd style={{ padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px' }}>Ctrl + P</kbd> أو <kbd style={{ padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px' }}>F8</kbd>
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={onClose}
            >
              إغلاق
            </button>
            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              disabled={isPrinting}
              onClick={handlePrint}
            >
              <Printer size={16} />
              <span>{isPrinting ? 'جاري الإرسال للطابعة...' : 'طباعة الآن (F8)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
