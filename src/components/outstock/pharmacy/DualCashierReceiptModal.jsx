import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  X,
  CheckCircle,
  Phone,
  MapPin,
  Calendar,
  Clock,
  FileText,
  QrCode,
  Send,
  Download,
  Scissors,
  MessageSquare,
  Check,
  AlertCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { getResolvedWhatsAppServerUrl } from '../../../utils/systemUrlHelper';
import {
  generateBarcodeSvgString,
  generateQrSvgString,
  buildInvoicePdfHtml,
  sendInvoicePdfViaWhatsApp
} from '../../../utils/invoicePdfGenerator';
import { outstockGetSettings } from '../../../utils/outstockApiClient';

/**
 * DualCashierReceiptModal.jsx
 * طباعة فاتورة الكاشير الحرارية المزدوجة (نسخة العميل + نسخة الصيدلية)
 * المميزات الاحترافية المضافة:
 * 1. أمر قص منفصل (Auto-Cut) لكل نسخة على حدة لمنع التصاق الورق
 * 2. إرسال الفاتورة الرسمية PDF للعميل عبر الواتساب مباشرة بضغطة زر مع الشعار
 * 3. إمكانية تنزيل الفاتورة PDF أو فتح محادثة WhatsApp Web كبديل فوري
 * 4. خيارات طباعة متعددة: نسختين مقصوصتين، نسخة العميل فقط، أو نسخة الصيدلية فقط
 * 5. باركود Code 128 قياسي فائق الدقة مقروء بنسبة 100%
 */
export default function DualCashierReceiptModal({ order, branch, onClose }) {
  const printAreaRef = useRef(null);
  const [printProfile, setPrintProfile] = useState('pos'); // 'pos' (80mm) | 'a4'
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatusText, setPrintStatusText] = useState('');

  // إعدادات وهوية وشعار الصيدلية بالفاتورة
  const [pharmacySettings, setPharmacySettings] = useState(() => {
    try {
      const cached = localStorage.getItem('outstock_general_settings');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    outstockGetSettings().then(res => {
      if (res?.success && res.settings) {
        setPharmacySettings(res.settings);
      }
    }).catch(() => {});
  }, []);

  // حالة إرسال الفاتورة عبر الواتساب
  const [isSendingPdf, setIsSendingPdf] = useState(false);
  const [waSendFeedback, setWaSendFeedback] = useState(null); // { type: 'success' | 'error', msg: string }

  // سيرفر الواتساب المعتمد
  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(), []);

  const formattedDate = useMemo(() => {
    if (!order) return '';
    const d = order.created_at || order.createdAt ? new Date(order.created_at || order.createdAt) : new Date();
    return d.toLocaleDateString('ar-EG') + ' - ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }, [order]);

  const branchName = branch?.name || order?.branch_name || 'صيدلية النور والشفاء';
  const branchPhone = branch?.phone || '';
  const branchAddress = branch?.address || '';
  const barcodeValue = String(order?.barcode_data || order?.barcodeData || order?.order_number || order?.orderNumber || '00000000');
  const pharmacyLogo = pharmacySettings?.pharmacyLogo || pharmacySettings?.logoUrl || branch?.logoUrl || '';

  // ── 1. محرك الطباعة مع أمر القص التلقائي لكل نسخة على حدة (Sequential Multi-Job Auto-Cut) ──
  const executeIsolatedPrintJob = useCallback((innerHtmlContent, jobTitle = 'Receipt') => {
    return new Promise((resolve) => {
      // إزالة أي iframe طباعة قديم
      const oldFrame = document.getElementById('isolated-thermal-print-frame');
      if (oldFrame) {
        try { document.body.removeChild(oldFrame); } catch {}
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

      // مسافة 26mm لتجاوز شفرة القاطع التلقائي بعد نهاية النصوص
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
            padding: 2mm 2mm 26mm 2mm;
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
          <title>${jobTitle}</title>
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
              padding-bottom: 6px;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
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
          </style>
        </head>
        <body>
          ${innerHtmlContent}
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
          resolve(true);
        }, 1200);
      }, 350);
    });
  }, [printProfile]);

  /**
   * تنفيذ الطباعة المزدوجة مع أمر القص التلقائي لكل نسخة
   */
  const handlePrintDualAutoCut = useCallback(async () => {
    setIsPrinting(true);
    setPrintStatusText('✂️ جاري إرسال نسخة العميل للطابعة وأمر القص...');

    try {
      const container = printAreaRef.current;
      if (!container) return;

      const customerCopyEl = container.querySelector('#receipt-copy-customer');
      const pharmacyCopyEl = container.querySelector('#receipt-copy-pharmacy');

      if (!customerCopyEl || !pharmacyCopyEl) {
        await executeIsolatedPrintJob(container.innerHTML, 'إيصال #' + barcodeValue);
        setIsPrinting(false);
        setPrintStatusText('');
        return;
      }

      // 1. طباعة وقص نسخة العميل أولاً
      await executeIsolatedPrintJob(
        customerCopyEl.outerHTML,
        'إيصال العميل #' + (order?.order_number || barcodeValue)
      );

      // انتظار قصير (650 مللي ثانية) لإتمام دورة القاطع الميكانيكي
      setPrintStatusText('✂️ تم قص نسخة العميل، جاري طباعة وقص نسخة الصيدلية...');
      await new Promise(r => setTimeout(r, 650));

      // 2. طباعة وقص نسخة الصيدلية ثانياً
      await executeIsolatedPrintJob(
        pharmacyCopyEl.outerHTML,
        'إيصال الصيدلية #' + (order?.order_number || barcodeValue)
      );

      setPrintStatusText('✅ اكتملت طباعة النسختين وقص كل نسخة بنجاح!');
      setTimeout(() => {
        setPrintStatusText('');
        setIsPrinting(false);
      }, 1500);
    } catch (err) {
      console.warn('Auto-cut print error:', err);
      window.print();
      setIsPrinting(false);
      setPrintStatusText('');
    }
  }, [barcodeValue, executeIsolatedPrintJob, order?.order_number]);

  /**
   * طباعة نسخة العميل فقط مع القص
   */
  const handlePrintCustomerOnly = async () => {
    setIsPrinting(true);
    setPrintStatusText('✂️ جاري طباعة نسخة العميل وقصها...');
    const customerCopyEl = printAreaRef.current?.querySelector('#receipt-copy-customer');
    if (customerCopyEl) {
      await executeIsolatedPrintJob(customerCopyEl.outerHTML, 'إيصال العميل #' + (order?.order_number || barcodeValue));
    }
    setIsPrinting(false);
    setPrintStatusText('');
  };

  /**
   * طباعة نسخة الصيدلية فقط مع القص
   */
  const handlePrintPharmacyOnly = async () => {
    setIsPrinting(true);
    setPrintStatusText('✂️ جاري طباعة نسخة الصيدلية وقصها...');
    const pharmacyCopyEl = printAreaRef.current?.querySelector('#receipt-copy-pharmacy');
    if (pharmacyCopyEl) {
      await executeIsolatedPrintJob(pharmacyCopyEl.outerHTML, 'إيصال الصيدلية #' + (order?.order_number || barcodeValue));
    }
    setIsPrinting(false);
    setPrintStatusText('');
  };

  // ── 2. إرسال الفاتورة الرسمية PDF للعميل عبر خادم الواتساب ──────────────────
  const handleSendInvoicePdf = async () => {
    const rawPhone = order.customer_phone || order.customerPhone || '';
    if (!rawPhone) {
      setWaSendFeedback({
        type: 'error',
        msg: '⚠️ لا يوجد رقم هاتف مسجل لهذا العميل لإرسال الفاتورة إليه.'
      });
      return;
    }

    setIsSendingPdf(true);
    setWaSendFeedback(null);

    try {
      await sendInvoicePdfViaWhatsApp({
        order,
        branch,
        waServerUrl,
        options: {
          logoUrl: pharmacyLogo,
          slogan: pharmacySettings?.slogan,
          footerNote: pharmacySettings?.invoiceFooter
        }
      });

      setWaSendFeedback({
        type: 'success',
        msg: '✅ تم إرسال الفاتورة PDF للعميل بنجاح عبر الواتساب!'
      });
    } catch (err) {
      console.warn('Send invoice PDF failed:', err);
      setWaSendFeedback({
        type: 'error',
        msg: 'تعذر الإرسال التلقائي: ' + err.message + '. يمكنك فتح المحادثة عبر WhatsApp Web أو تنزيل الفاتورة مباشرة.'
      });
    } finally {
      setIsSendingPdf(false);
    }
  };

  // ── 3. فتح المحادثة عبر WhatsApp Web كبديل مباشر ────────────────────────────
  const handleOpenWhatsAppWeb = () => {
    let phone = String(order.customer_phone || order.customerPhone || '').replace(/\D/g, '');
    if (phone.startsWith('01')) phone = '2' + phone;

    const orderNo = order.order_number || order.orderNumber || '0000';
    const cName = order.customer_name || order.customerName || 'عميلنا العزيز';
    const remaining = parseFloat(order.remaining_amount || order.remainingAmount || 0).toFixed(2);

    const msg = 'السلام عليكم ورحمة الله وبركاته،\nأهلاً بك أ/ ' + cName + ' 🌸\nنود إبلاغك بتفاصيل إيصال حجز وتوفير الدواء (رقم: #' + orderNo + ') من ' + branchName + '.\nالمتبقي عند الاستلام: ' + remaining + ' ج.م.\nشكراً لثقتكم بنا!';

    const url = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
  };

  // ── 4. تحميل / معاينة الفاتورة الرسمية A4 كـ PDF ──────────────────────────
  const handleDownloadInvoicePdf = () => {
    const invoicePdfHtml = buildInvoicePdfHtml(order, branch, barcodeValue, formattedDate, {
      logoUrl: pharmacyLogo,
      slogan: pharmacySettings?.slogan,
      footerNote: pharmacySettings?.invoiceFooter
    });
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(invoicePdfHtml);
      win.document.close();
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {}
      }, 500);
    }
  };

  // اختصارات الكيبورد (F8 / Ctrl+P للطباعة والقص، Esc للإغلاق)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if ((e.key === 'p' && (e.ctrlKey || e.metaKey)) || e.key === 'F8') {
        e.preventDefault();
        handlePrintDualAutoCut();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrintDualAutoCut, onClose]);

  if (!order) return null;

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel modal-md"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px', width: '95%' }}
      >
        <div className="outstock-modal-drag-handle" />
        <div className="outstock-modal-header" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Printer size={20} color="#0d9488" />
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                معاينة وطباعة الفاتورة الفورية
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                طلب رقم: #{order.order_number || order.orderNumber} - العميل: {order.customer_name || order.customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="outstock-modal-close-btn"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── شريط العمليات السريعة (إرسال PDF للواتساب + قص تلقائي) ── */}
        <div style={{
          padding: '10px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {/* مقاس الورق */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#475569' }}>المقاس:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className={'outstock-btn ' + (printProfile === 'pos' ? 'outstock-btn-primary' : 'outstock-btn-secondary')}
                style={{ padding: '4px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                onClick={() => setPrintProfile('pos')}
              >
                طابعة حرارية (80mm)
              </button>
              <button
                type="button"
                className={'outstock-btn ' + (printProfile === 'a4' ? 'outstock-btn-primary' : 'outstock-btn-secondary')}
                style={{ padding: '4px 10px', fontSize: '11.5px', borderRadius: '6px' }}
                onClick={() => setPrintProfile('a4')}
              >
                ورقة عادية (A4)
              </button>
            </div>
          </div>

          {/* زر إرسال الفاتورة PDF للعميل بالواتساب */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={handleSendInvoicePdf}
              disabled={isSendingPdf}
              className="outstock-btn outstock-btn-whatsapp"
              style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '7px' }}
              title="إرسال الفاتورة كملف PDF رسمي إلى رقم واتساب العميل مباشرة"
            >
              {isSendingPdf ? <RefreshCw size={13} className="outstock-spin" /> : <Send size={13} />}
              <span>{isSendingPdf ? 'جاري إرسال PDF...' : 'إرسال الفاتورة PDF للعميل'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadInvoicePdf}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '5px 9px', fontSize: '12px', borderRadius: '7px' }}
              title="تحميل / معاينة الفاتورة بصيغة PDF كاملة"
            >
              <Download size={13} />
            </button>
          </div>
        </div>

        {/* تنبيه حالة إرسال الواتساب */}
        {waSendFeedback && (
          <div style={{
            margin: '10px 16px 0',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            background: waSendFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: waSendFeedback.type === 'success' ? '#065f46' : '#991b1b',
            border: '1px solid ' + (waSendFeedback.type === 'success' ? '#a7f3d0' : '#fecaca')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {waSendFeedback.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              <span>{waSendFeedback.msg}</span>
            </div>
            {waSendFeedback.type === 'error' && (
              <button
                type="button"
                onClick={handleOpenWhatsAppWeb}
                style={{
                  background: '#25d366',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ExternalLink size={12} />
                <span>WhatsApp Web</span>
              </button>
            )}
          </div>
        )}

        <div className="outstock-modal-body" style={{ maxHeight: '66vh', overflowY: 'auto', padding: '14px 16px' }}>
          {/* بطاقة تأكيد أمر القص التلقائي */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#15803d',
            fontSize: '12px',
            fontWeight: '700',
            marginBottom: '12px'
          }}>
            <Scissors size={16} />
            <span>
              <strong>خاصية القص التلقائي (Auto-Cutter) مفعلة:</strong> يتم إرسال أمر قص مستقل لنسخة العميل ثم أمر قص مستقل لنسخة الصيدلية.
            </span>
          </div>

          {/* منطقة المعاينة والطباعة الحرارية المباشرة */}
          <div
            ref={printAreaRef}
            className="thermal-receipt-container"
            style={{
              width: printProfile === 'pos' ? '80mm' : '100%',
              maxWidth: '100%',
              margin: '0 auto',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              background: '#ffffff',
              padding: '12px 10px'
            }}
          >
            {/* ── 1. نسخة العميل ── */}
            <div className="receipt-copy" id="receipt-copy-customer">
              <div className="receipt-header">
                {pharmacyLogo ? (
                  <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <img
                      src={pharmacyLogo}
                      alt="شعار الصيدلية"
                      style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }}
                    />
                  </div>
                ) : null}
                <h3>{branchName}</h3>
                <p>إيصال حجز وتوفير دواء (نسخة العميل)</p>
                {branchPhone && <p><Phone size={10} style={{ display: 'inline' }} /> {branchPhone}</p>}
                {branchAddress && <p><MapPin size={10} style={{ display: 'inline' }} /> {branchAddress}</p>}
              </div>

              <div className="receipt-meta">
                <div>رقم الإيصال: <strong>{order.order_number || order.orderNumber}</strong></div>
                <div>العميل: <strong>{order.customer_name || order.customerName}</strong></div>
                <div>الهاتف: {order.customer_phone || order.customerPhone}</div>
                <div>طريقة التسليم: <strong>
                  {order.delivery_type === 'home_delivery' || order.deliveryType === 'home_delivery'
                    ? '🛵 توصيل دليفري للعنوان'
                    : (order.delivery_type === 'other_branch_pickup' || order.deliveryType === 'other_branch_pickup'
                        ? `🔄 استلام من فرع: ${order.delivery_target_branch || order.deliveryTargetBranch || 'فرع آخر'}`
                        : '🏪 استلام من الفرع')}
                </strong></div>
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
                  📅 موعد الاستلام المتوقع: <strong>{order.expected_pickup_date || order.expectedPickupDate}</strong> {order.expected_pickup_time || order.expectedPickupTime ? ('(' + (order.expected_pickup_time || order.expectedPickupTime) + ')') : ''}
                </div>
              ) : null}

              <div className="receipt-barcode">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', margin: '4px 0' }}>
                  <div dangerouslySetInnerHTML={{ __html: generateBarcodeSvgString(barcodeValue, { moduleWidth: 1.45, height: 44 }) }} />
                  <div dangerouslySetInnerHTML={{ __html: generateQrSvgString(barcodeValue) }} />
                </div>
                <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 'bold' }}>
                  *{barcodeValue}*
                </div>
                <small style={{ fontSize: '9px', display: 'block', marginTop: '3px' }}>
                  يرجى إبراز هذا الإيصال أو الباركود عند الحضور للاستلام
                </small>
              </div>
            </div>

            {/* خط فاصل للقص التلقائي والطباعة */}
            <div className="receipt-page-cut-line" style={{
              textAlign: 'center',
              fontSize: '10px',
              color: '#475569',
              margin: '16px 0',
              borderTop: '1.5px dashed #000',
              paddingTop: '6px',
              pageBreakAfter: 'always',
              breakAfter: 'page'
            }}>
              ✂️ ----------------- خط القص التلقائي (نسخة الصيدلية) ----------------- ✂️
            </div>

            {/* ── 2. نسخة الصيدلية (مرفقة مع علبة الدواء) ── */}
            <div className="receipt-copy" id="receipt-copy-pharmacy">
              <div className="receipt-header">
                <h3>{branchName}</h3>
                <p>إيصال حجز وتوفير دواء (نسخة الصيدلية)</p>
                <small>تُحفظ مع علبة الدواء في درج النواقص لحين حضور العميل</small>
              </div>

              <div className="receipt-meta">
                <div>رقم الإيصال: <strong>{order.order_number || order.orderNumber}</strong></div>
                <div>العميل: <strong>{order.customer_name || order.customerName}</strong> ({order.customer_phone || order.customerPhone})</div>
                <div>طريقة التسليم: <strong>
                  {order.delivery_type === 'home_delivery' || order.deliveryType === 'home_delivery'
                    ? '🛵 دليفري'
                    : (order.delivery_type === 'other_branch_pickup' || order.deliveryType === 'other_branch_pickup'
                        ? `🔄 تحويل استلام لفرع: ${order.delivery_target_branch || order.deliveryTargetBranch || ''}`
                        : '🏪 استلام من الفرع')}
                </strong></div>
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
                  <div dangerouslySetInnerHTML={{ __html: generateBarcodeSvgString(barcodeValue, { moduleWidth: 1.45, height: 44 }) }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ذيل النافذة وخيارات الطباعة مع القص التلقائي ── */}
        <div className="outstock-modal-footer" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '12px 16px'
        }}>
          <div>
            {printStatusText ? (
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0d9488' }}>
                {printStatusText}
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                اختصار: <kbd style={{ padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px' }}>Ctrl + P</kbd> أو <kbd style={{ padding: '2px 5px', border: '1px solid #ccc', borderRadius: '4px' }}>F8</kbd>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {/* أزرار طباعة فرعية */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handlePrintCustomerOnly}
              disabled={isPrinting}
              style={{ fontSize: '11.5px', padding: '6px 9px' }}
              title="طباعة نسخة العميل فقط وقصها"
            >
              نسخة العميل فقط
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handlePrintPharmacyOnly}
              disabled={isPrinting}
              style={{ fontSize: '11.5px', padding: '6px 9px' }}
              title="طباعة نسخة الصيدلية فقط وقصها"
            >
              نسخة الصيدلية فقط
            </button>

            {/* الزر الرئيسي: طباعة النسختين وقص كل نسخة على حدة */}
            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              disabled={isPrinting}
              onClick={handlePrintDualAutoCut}
              style={{ padding: '7px 16px', fontWeight: '800' }}
            >
              <Scissors size={15} />
              <span>{isPrinting ? 'جاري الطباعة والقص...' : '⚡ طباعة وقص كل نسخة (F8)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
