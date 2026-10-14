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
import { outstockGetSettings, outstockGetBranches } from '../../../utils/outstockApiClient';
import {
  resolveBranchThermalDetails,
  executeThermalPrintJob
} from '../../../utils/thermalReceiptEngine';

/**
 * DualCashierReceiptModal.jsx
 * طباعة فاتورة الكاشير الحرارية المزدوجة (نسخة العميل + نسخة الصيدلية)
 * المميزات الاحترافية المضافة:
 * 1. مساحة طباعة آمنة 72mm (80mm) و 48mm (58mm) مانعة تماماً لقص الأرقام أو الأعمدة
 * 2. محرك دمج أرقام هواتف الفرع المعتمدة (أرضي + موبايل + واتساب) وعنوان الفرع بدقة
 * 3. شعار أحادي اللون عالي التباين (1-Bit High-Contrast) يطبع بحدة 100% بدون بهتان
 * 4. أمر قص منفصل (Auto-Cut) لكل نسخة على حدة مع هامش أمان 18mm لحماية الباركود
 * 5. إرسال الفاتورة الرسمية PDF للعميل عبر الواتساب مباشرة بضغطة زر
 */
export default function DualCashierReceiptModal({ order, branch, onClose }) {
  const printAreaRef = useRef(null);
  const [printProfile, setPrintProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_receipt_printer_profile');
      return saved === 'pos58' || saved === 'a4' ? saved : 'pos80';
    } catch {
      return 'pos80';
    }
  });

  const handleSetPrintProfile = (p) => {
    setPrintProfile(p);
    try {
      localStorage.setItem('pos_receipt_printer_profile', p);
    } catch {}
  };

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

  const [branchesList, setBranchesList] = useState([]);

  useEffect(() => {
    outstockGetSettings().then(res => {
      if (res?.success && res.settings) {
        setPharmacySettings(res.settings);
      }
    }).catch(() => {});

    outstockGetBranches().then(res => {
      if (res?.success && Array.isArray(res.branches)) {
        setBranchesList(res.branches);
        try {
          localStorage.setItem('outstock_branches', JSON.stringify(res.branches));
        } catch {}
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

  // دمج واستخراج تفاصيل وهوية وهواتف الفرع والشعار فائق الدقة
  const branchDetails = useMemo(() => {
    return resolveBranchThermalDetails(branch, order, pharmacySettings);
  }, [branch, order, pharmacySettings, branchesList]);

  const branchName = branchDetails.branchName;
  const branchPhone = branchDetails.phonesFormatted;
  const branchAddress = branchDetails.branchAddress;
  const barcodeValue = String(order?.barcode_data || order?.barcodeData || order?.order_number || order?.orderNumber || '00000000');
  const pharmacyLogo = branchDetails.logoUrl;

  // ── 1. محرك الطباعة مع أمر القص التلقائي لكل نسخة على حدة (Sequential Multi-Job Auto-Cut) ──
  const executeIsolatedPrintJob = useCallback((innerHtmlContent, jobTitle = 'Receipt') => {
    return executeThermalPrintJob(innerHtmlContent, jobTitle, printProfile);
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

  // معرف جلسة الواتساب للفرع المقترن بدقة وبدون تكرار لبادئة branch_
  const branchSessionId = useMemo(() => {
    const raw = String(branch?.sessionId || branch?.whatsappSessionId || branch?.id || order?.branch_id || order?.branchId || '').trim();
    if (!raw || raw === 'default' || raw === 'main') return undefined;
    const cleanId = raw.replace(/^(branch_)+/i, '');
    return cleanId ? `branch_${cleanId}` : undefined;
  }, [branch, order]);

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
      const sendRes = await sendInvoicePdfViaWhatsApp({
        order,
        branch,
        waServerUrl,
        sessionId: branchSessionId,
        options: {
          logoUrl: pharmacyLogo,
          slogan: pharmacySettings?.slogan,
          footerNote: pharmacySettings?.invoiceFooter
        }
      });

      setWaSendFeedback({
        type: 'success',
        msg: sendRes?.usedFallback
          ? '⚠️ تم إرسال الفاتورة عبر واتساب الإدارة الاحتياطي لأن جلسة واتساب الفرع لم تكن متصلة.'
          : '✅ تم إرسال الفاتورة PDF للعميل بنجاح عبر واتساب الفرع المقترن!'
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

  // منع تمرير خلفية الصفحة أثناء فتح الفاتورة
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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
                className={'outstock-btn ' + (printProfile === 'pos80' ? 'outstock-btn-primary' : 'outstock-btn-secondary')}
                style={{ padding: '4px 9px', fontSize: '11.5px', borderRadius: '6px' }}
                onClick={() => handleSetPrintProfile('pos80')}
                title="طابعة كاشير حرارية قياسية (80mm) بعرض طباعة آمن 72mm"
              >
                حرارية (80mm)
              </button>
              <button
                type="button"
                className={'outstock-btn ' + (printProfile === 'pos58' ? 'outstock-btn-primary' : 'outstock-btn-secondary')}
                style={{ padding: '4px 9px', fontSize: '11.5px', borderRadius: '6px' }}
                onClick={() => handleSetPrintProfile('pos58')}
                title="طابعة كاشير حرارية صغيرة (58mm) بعرض طباعة آمن 48mm"
              >
                حرارية صغيرة (58mm)
              </button>
              <button
                type="button"
                className={'outstock-btn ' + (printProfile === 'a4' ? 'outstock-btn-primary' : 'outstock-btn-secondary')}
                style={{ padding: '4px 9px', fontSize: '11.5px', borderRadius: '6px' }}
                onClick={() => handleSetPrintProfile('a4')}
                title="ورقة عادية مقاس A4"
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
              <strong>خاصية القص التلقائي (Auto-Cutter) مفعلة:</strong> يتم إرسال أمر قص مستقل لنسخة العميل ثم أمر قص مستقل لنسخة الصيدلية مع هامش حماية أوتوماتيكي.
            </span>
          </div>

          {/* منطقة المعاينة والطباعة الحرارية المباشرة */}
          <div
            ref={printAreaRef}
            className="thermal-receipt-container"
            style={{
              width: printProfile === 'pos58' ? '58mm' : (printProfile === 'pos80' ? '76mm' : '100%'),
              maxWidth: '100%',
              margin: '0 auto',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
              background: '#ffffff',
              padding: printProfile === 'pos58' ? '8px 6px' : '12px 10px',
              fontFamily: "'Cairo', 'Segoe UI', Tahoma, 'Arial Black', Arial, sans-serif",
              fontWeight: '800',
              WebkitTextStroke: '0.35px #000'
            }}
          >
            {/* ── 1. نسخة العميل ── */}
            <div className="receipt-copy" id="receipt-copy-customer">
              <div className="receipt-header" style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1.5px dashed #000', paddingBottom: '6px' }}>
                {pharmacyLogo ? (
                  <div className="receipt-logo-wrapper" style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <img
                      src={pharmacyLogo}
                      alt="شعار الصيدلية"
                      className="receipt-logo-img"
                      style={{
                        maxHeight: printProfile === 'pos58' ? '50px' : '65px',
                        maxWidth: printProfile === 'pos58' ? '130px' : '160px',
                        objectFit: 'contain',
                        display: 'inline-block',
                        filter: 'grayscale(100%) contrast(300%) brightness(90%)',
                        WebkitFilter: 'grayscale(100%) contrast(300%) brightness(90%)',
                        imageRendering: 'crisp-edges'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', marginBottom: '6px' }}>
                    <span style={{ display: 'inline-block', border: '1.5px solid #000', padding: '2px 8px', borderRadius: '4px', fontWeight: '900', fontSize: '12px' }}>
                      ❖ {branchName} ❖
                    </span>
                  </div>
                )}
                <h3 style={{ margin: '0 0 3px', fontSize: printProfile === 'pos58' ? '13px' : '15px', fontWeight: '900' }}>{branchName}</h3>
                <p className="receipt-subtitle" style={{ margin: '2px 0 3px', fontSize: printProfile === 'pos58' ? '9.5px' : '11px', fontWeight: '700' }}>إيصال حجز وتوفير دواء (نسخة العميل)</p>
                {branchPhone && (
                  <p className="receipt-branch-phones" style={{ margin: '3px 0', fontSize: printProfile === 'pos58' ? '9.5px' : '10.5px', fontWeight: '700', lineHeight: 1.35 }}>
                    {branchPhone}
                  </p>
                )}
                {branchAddress && (
                  <p className="receipt-branch-address" style={{ margin: '2px 0 0', fontSize: printProfile === 'pos58' ? '9px' : '10px', color: '#111' }}>
                    📍 {branchAddress}
                  </p>
                )}
              </div>

              <div className="receipt-meta" style={{ marginBottom: '8px', fontSize: printProfile === 'pos58' ? '9.5px' : '11px', lineHeight: 1.4, borderBottom: '1.5px dashed #000', paddingBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>رقم الإيصال:</span>
                  <strong>{order.order_number || order.orderNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>العميل:</span>
                  <strong>{order.customer_name || order.customerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>الهاتف:</span>
                  <span>{order.customer_phone || order.customerPhone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>طريقة التسليم:</span>
                  <strong>
                    {order.delivery_type === 'home_delivery' || order.deliveryType === 'home_delivery'
                      ? '🛵 دليفري للعنوان'
                      : (order.delivery_type === 'other_branch_pickup' || order.deliveryType === 'other_branch_pickup'
                          ? `🔄 استلام من فرع: ${order.delivery_target_branch || order.deliveryTargetBranch || 'فرع آخر'}`
                          : '🏪 استلام من الفرع')}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>التاريخ:</span>
                  <span>{formattedDate}</span>
                </div>
                {order.order_category === 'cosmetics' ? (
                  <div style={{ color: '#be185d', fontWeight: 'bold' }}>التصنيف: 💄 مستحضرات تجميل وعناية</div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>الصيدلي المستلم:</span>
                  <strong>{order.order_receiver_name || order.responsible_pharmacist || order.responsiblePharmacist || 'د. صيدلي'} {order.order_receiver_code ? `(كود: ${order.order_receiver_code})` : ''}</strong>
                </div>
              </div>

              {/* جدول الأصناف الثابت المانع للتداخل والقص */}
              <table className="receipt-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: printProfile === 'pos58' ? '9px' : '10.5px', marginBottom: '8px' }}>
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '17%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="col-name" style={{ textAlign: 'right', padding: '3px 2px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الصنف</th>
                    <th className="col-num" style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الوحدة</th>
                    <th className="col-num" style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الكمية</th>
                    <th className="col-price" style={{ textAlign: 'left', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>السعر</th>
                    <th className="col-price" style={{ textAlign: 'left', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill).map((item, idx) => {
                    const qty = parseInt(item.quantity || 1, 10);
                    const isEstimated = item.is_price_estimated || item.isPriceEstimated;
                    const priceMin = parseFloat(item.price_min || item.priceMin || 0);
                    const priceMax = parseFloat(item.price_max || item.priceMax || priceMin || 0);
                    const rawPrice = parseFloat(item.unitPrice || item.unit_price || 0);
                    const avgPrice = isEstimated && (priceMin > 0 || priceMax > 0)
                      ? ((priceMin + priceMax) / 2)
                      : (rawPrice > 0 ? rawPrice : ((priceMin + priceMax) / 2));
                    const unitPrice = avgPrice;
                    const total = qty * unitPrice;

                    return (
                      <tr key={idx} style={{ borderBottom: '1.5px dashed #000' }}>
                        <td className="col-name" style={{ textAlign: 'right', padding: '3px 2px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          <strong>{item.medicationName || item.medication_name}</strong>
                          {isEstimated ? (
                            <small style={{ display: 'block', color: '#b45309', fontSize: '9px', marginTop: '1px' }}>
                              (سعر تقديري)
                            </small>
                          ) : null}
                        </td>
                        <td className="col-num" style={{ textAlign: 'center', padding: '3px 1px' }}>
                          {item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                        </td>
                        <td className="col-num" style={{ textAlign: 'center', padding: '3px 1px', fontWeight: 'bold' }}>
                          {qty}
                        </td>
                        <td className="col-price" style={{ textAlign: 'left', padding: '3px 1px', direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap', fontSize: isEstimated ? '9px' : undefined }}>
                          {isEstimated ? `${priceMin.toFixed(2)}-${priceMax.toFixed(2)}` : unitPrice.toFixed(2)}
                        </td>
                        <td className="col-price" style={{ textAlign: 'left', padding: '3px 1px', direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: isEstimated ? '9px' : undefined, color: isEstimated ? '#b45309' : undefined }}>
                          {isEstimated ? `${(priceMin * qty).toFixed(2)}-${(priceMax * qty).toFixed(2)}` : total.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* مربعات الإجماليات الآمنة ضد القص الميكانيكي */}
              <div className="receipt-totals" style={{ borderTop: '1.5px dashed #000', paddingTop: '6px', marginBottom: '8px', paddingLeft: '4px', paddingRight: '4px' }}>
                {(() => {
                  const activeItems = (order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill);
                  let totalMin = 0;
                  let totalMax = 0;
                  let totalAvg = 0;
                  let hasEstimated = false;

                  activeItems.forEach(it => {
                    const qty = parseInt(it.quantity || 1, 10);
                    const isEst = it.is_price_estimated || it.isPriceEstimated;
                    const pMin = parseFloat(it.price_min || it.priceMin || 0);
                    const pMax = parseFloat(it.price_max || it.priceMax || pMin || 0);
                    const p = parseFloat(it.unitPrice || it.unit_price || 0);

                    if (isEst && (pMin > 0 || pMax > 0)) {
                      hasEstimated = true;
                      totalMin += qty * pMin;
                      totalMax += qty * pMax;
                      totalAvg += qty * ((pMin + pMax) / 2);
                    } else {
                      totalMin += qty * p;
                      totalMax += qty * p;
                      totalAvg += qty * p;
                    }
                  });

                  if (!hasEstimated && (parseFloat(order.total_amount || order.totalAmount || 0) > 0)) {
                    totalAvg = parseFloat(order.total_amount || order.totalAmount || 0);
                    totalMin = totalAvg;
                    totalMax = totalAvg;
                  }

                  const discVal = parseFloat(order.discount_value || order.discountValue || 0);
                  const isPercent = (order.discount_type || order.discountType) === 'percentage';
                  let discMin = 0, discMax = 0, discAvg = 0;
                  if (isPercent) {
                    discMin = (totalMin * discVal) / 100;
                    discMax = (totalMax * discVal) / 100;
                    discAvg = (totalAvg * discVal) / 100;
                  } else if (discVal > 0) {
                    discMin = discVal;
                    discMax = discVal;
                    discAvg = discVal;
                  }

                  const netMin = Math.max(0, totalMin - discMin);
                  const netMax = Math.max(0, totalMax - discMax);
                  const netAvg = Math.max(0, totalAvg - discAvg);

                  const paid = parseFloat(order.paid_amount || order.paidAmount || 0);
                  const remMin = Math.max(0, netMin - paid);
                  const remMax = Math.max(0, netMax - paid);
                  const remAvg = Math.max(0, netAvg - paid);

                  return (
                    <>
                      <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '3px 0', fontSize: printProfile === 'pos58' ? '9.5px' : '11px' }}>
                        <span style={{ textAlign: 'right' }}>إجمالي الأصناف:</span>
                        <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: '700', paddingLeft: '2px' }}>
                          {hasEstimated ? (
                            <strong style={{ color: '#b45309' }}>
                              من {totalMin.toFixed(2)} إلى {totalMax.toFixed(2)} ج.م
                            </strong>
                          ) : (
                            `${parseFloat(order.total_amount || order.totalAmount || totalAvg || 0).toFixed(2)} ج.م`
                          )}
                        </span>
                      </div>
                      {discVal > 0 && (
                        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '3px 0', fontSize: printProfile === 'pos58' ? '9.5px' : '11px' }}>
                          <span style={{ textAlign: 'right' }}>الخصم:</span>
                          <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: '700', paddingLeft: '2px' }}>
                            {discVal} {isPercent ? '%' : 'ج.م'}
                          </span>
                        </div>
                      )}
                      <div className="row grand-total" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '3px 0', margin: '4px 0', fontWeight: '900', fontSize: printProfile === 'pos58' ? '11px' : '12.5px' }}>
                        <span style={{ textAlign: 'right' }}>الصافي المطلوب:</span>
                        <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: '900', paddingLeft: '2px', fontSize: printProfile === 'pos58' ? '11px' : '12.5px' }}>
                          {hasEstimated ? (
                            <strong style={{ color: '#0f766e' }}>
                              من {netMin.toFixed(2)} إلى {netMax.toFixed(2)} ج.م
                            </strong>
                          ) : (
                            `${parseFloat(order.net_amount || order.netAmount || netAvg || 0).toFixed(2)} ج.م`
                          )}
                        </span>
                      </div>
                      <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '3px 0', fontSize: printProfile === 'pos58' ? '9.5px' : '11px' }}>
                        <span style={{ textAlign: 'right' }}>المبلغ المدفوع (مقدماً):</span>
                        <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: '700', paddingLeft: '2px' }}>
                          {paid.toFixed(2)} ج.م
                        </span>
                      </div>
                      <div className="row remaining-highlight" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1.5px solid #000', padding: '3px 4px', borderRadius: '4px', margin: '4px 0', fontWeight: '900', color: '#b91c1c', fontSize: printProfile === 'pos58' ? '11px' : '12.5px' }}>
                        <span style={{ textAlign: 'right' }}>المتبقي عند الاستلام:</span>
                        <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: '900', paddingLeft: '2px', fontSize: printProfile === 'pos58' ? '11px' : '12.5px' }}>
                          {hasEstimated ? (
                            <strong style={{ color: '#b91c1c' }}>
                              من {remMin.toFixed(2)} إلى {remMax.toFixed(2)} ج.م
                            </strong>
                          ) : (
                            `${parseFloat(order.remaining_amount || order.remainingAmount || remAvg || 0).toFixed(2)} ج.م`
                          )}
                        </span>
                      </div>
                      {(() => {
                        const netTotal = parseFloat(order.net_amount ?? order.netAmount ?? netAvg ?? 0);
                        const refundDue = Math.max(0, paid - netTotal);
                        const refundMin = Math.max(0, paid - netMax);
                        const refundMax = Math.max(0, paid - netMin);

                        if ((!hasEstimated && refundDue > 0) || (hasEstimated && refundMax > 0)) {
                          return (
                            <div className="row" style={{ fontWeight: '900', color: '#059669', background: '#ecfdf5', padding: '3px 6px', borderRadius: '4px', border: '1px dashed #10b981', margin: '3px 0' }}>
                              <span>المتبقي للعميل (مستحق رده):</span>
                              <span style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                {hasEstimated ? (
                                  <strong style={{ color: '#059669' }}>
                                    من {refundMin.toFixed(2)} إلى {refundMax.toFixed(2)} ج.م
                                  </strong>
                                ) : (
                                  `${refundDue.toFixed(2)} ج.م`
                                )}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </>
                  );
                })()}
              </div>

              {order.expected_pickup_date || order.expectedPickupDate ? (
                <div style={{ background: '#f8fafc', padding: '6px', borderRadius: '6px', fontSize: printProfile === 'pos58' ? '9px' : '11px', margin: '6px 0', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  📅 موعد الاستلام المتوقع: <strong>{String(order.expected_pickup_date || order.expectedPickupDate).split('T')[0]}</strong> {order.expected_pickup_time || order.expectedPickupTime ? ('(' + (order.expected_pickup_time || order.expectedPickupTime) + ')') : ''}
                </div>
              ) : null}

              <div className="receipt-barcode" style={{ textAlign: 'center', margin: '8px 0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', margin: '4px 0' }}>
                  <div dangerouslySetInnerHTML={{ __html: generateBarcodeSvgString(barcodeValue, { moduleWidth: printProfile === 'pos58' ? 1.25 : 1.45, height: 42 }) }} />
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
            <div className="receipt-page-cut-line receipt-cut-separator" style={{
              textAlign: 'center',
              fontSize: '10px',
              color: '#475569',
              margin: '16px 0 12px',
              borderTop: '1.5px dashed #000',
              paddingTop: '6px',
              pageBreakAfter: 'always',
              breakAfter: 'page'
            }}>
              ✂️ ----------------- خط القص التلقائي (نسخة الصيدلية) ----------------- ✂️
            </div>

            {/* ── 2. نسخة الصيدلية (مرفقة مع علبة الدواء) ── */}
            <div className="receipt-copy" id="receipt-copy-pharmacy">
              <div className="receipt-header" style={{ textAlign: 'center', marginBottom: '8px', borderBottom: '1.5px dashed #000', paddingBottom: '6px' }}>
                {pharmacyLogo ? (
                  <div className="receipt-logo-wrapper" style={{ textAlign: 'center', marginBottom: '5px' }}>
                    <img
                      src={pharmacyLogo}
                      alt="شعار الصيدلية"
                      className="receipt-logo-img"
                      style={{
                        maxHeight: printProfile === 'pos58' ? '42px' : '52px',
                        maxWidth: printProfile === 'pos58' ? '110px' : '140px',
                        objectFit: 'contain',
                        display: 'inline-block',
                        filter: 'grayscale(100%) contrast(300%) brightness(90%)',
                        WebkitFilter: 'grayscale(100%) contrast(300%) brightness(90%)',
                        imageRendering: 'crisp-edges'
                      }}
                    />
                  </div>
                ) : null}
                <h3 style={{ margin: '0 0 3px', fontSize: printProfile === 'pos58' ? '13px' : '15px', fontWeight: '900' }}>{branchName}</h3>
                <p className="receipt-subtitle" style={{ margin: '2px 0 3px', fontSize: printProfile === 'pos58' ? '9.5px' : '11px', fontWeight: '700' }}>إيصال حجز وتوفير دواء (نسخة الصيدلية)</p>
                {branchPhone && (
                  <p className="receipt-branch-phones" style={{ margin: '2px 0', fontSize: printProfile === 'pos58' ? '9px' : '10px', fontWeight: 'bold' }}>
                    {branchPhone}
                  </p>
                )}
                {branchAddress && (
                  <p className="receipt-branch-address" style={{ margin: '1px 0', fontSize: printProfile === 'pos58' ? '8.5px' : '9.5px' }}>
                    📍 {branchAddress}
                  </p>
                )}
                <small style={{ fontSize: '9.5px', display: 'block', marginTop: '3px' }}>
                  تُحفظ مع علبة الدواء في درج النواقص لحين حضور العميل
                </small>
              </div>

              <div className="receipt-meta" style={{ marginBottom: '8px', fontSize: printProfile === 'pos58' ? '9.5px' : '11px', lineHeight: 1.4, borderBottom: '1.5px dashed #000', paddingBottom: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>رقم الإيصال:</span>
                  <strong>{order.order_number || order.orderNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>العميل:</span>
                  <strong>{order.customer_name || order.customerName} ({order.customer_phone || order.customerPhone})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>طريقة التسليم:</span>
                  <strong>
                    {order.delivery_type === 'home_delivery' || order.deliveryType === 'home_delivery'
                      ? '🛵 دليفري'
                      : (order.delivery_type === 'other_branch_pickup' || order.deliveryType === 'other_branch_pickup'
                          ? `🔄 تحويل استلام لفرع: ${order.delivery_target_branch || order.deliveryTargetBranch || ''}`
                          : '🏪 استلام من الفرع')}
                  </strong>
                </div>
                {(() => {
                  const activeItems = (order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill);
                  let tMin = 0, tMax = 0, tAvg = 0, hasEst = false;
                  activeItems.forEach(it => {
                    const qty = parseInt(it.quantity || 1, 10);
                    const isEst = it.is_price_estimated || it.isPriceEstimated;
                    const pMin = parseFloat(it.price_min || it.priceMin || 0);
                    const pMax = parseFloat(it.price_max || it.priceMax || pMin || 0);
                    const p = parseFloat(it.unitPrice || it.unit_price || 0);
                    if (isEst && (pMin > 0 || pMax > 0)) {
                      hasEst = true;
                      tMin += qty * pMin;
                      tMax += qty * pMax;
                      tAvg += qty * ((pMin + pMax) / 2);
                    } else {
                      tMin += qty * p;
                      tMax += qty * p;
                      tAvg += qty * p;
                    }
                  });
                  const dVal = parseFloat(order.discount_value || order.discountValue || 0);
                  const isPct = (order.discount_type || order.discountType) === 'percentage';
                  let dMin = isPct ? (tMin * dVal) / 100 : (dVal > 0 ? dVal : 0);
                  let dMax = isPct ? (tMax * dVal) / 100 : (dVal > 0 ? dVal : 0);
                  let dAvg = isPct ? (tAvg * dVal) / 100 : (dVal > 0 ? dVal : 0);
                  const netTotal = parseFloat(order.net_amount ?? order.netAmount ?? (tAvg - dAvg) ?? 0);
                  const paid = parseFloat(order.paid_amount || order.paidAmount || 0);
                  const rMin = Math.max(0, tMin - dMin - paid);
                  const rMax = Math.max(0, tMax - dMax - paid);
                  const rAvg = Math.max(0, tAvg - dAvg - paid);

                  const refundDue = Math.max(0, paid - netTotal);
                  const refundMin = Math.max(0, paid - (tMax - dMax));
                  const refundMax = Math.max(0, paid - (tMin - dMin));

                  return (
                    <>
                      <div className="deposit-highlight" style={{ border: '2px solid #000', padding: '5px 7px', borderRadius: '4px', margin: '4px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', color: '#000', fontWeight: '900' }}>
                        <span style={{ fontSize: printProfile === 'pos58' ? '11px' : '12px', color: '#000' }}>العربون المدفوع بالفرع:</span>
                        <strong style={{ fontSize: printProfile === 'pos58' ? '12.5px' : '14px', direction: 'ltr', unicodeBidi: 'isolate', whiteSpace: 'nowrap', color: '#000' }}>
                          {paid.toFixed(2)} ج.م
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0', fontSize: printProfile === 'pos58' ? '9px' : '10.5px', fontWeight: '800' }}>
                        <span>طريقة السداد:</span>
                        <span>{order.payment_method === 'card' || order.paymentMethod === 'card' ? 'بطاقة ائتمانية / فيزا' : order.payment_method === 'wallet' || order.paymentMethod === 'wallet' ? 'محفظة إلكترونية' : order.payment_method === 'instapay' || order.paymentMethod === 'instapay' ? 'إنستاباي (InstaPay)' : 'نقدي (كاش)'}</span>
                      </div>
                      <div className="remaining-info" style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0', fontSize: printProfile === 'pos58' ? '9px' : '10px', color: '#222' }}>
                        <span>المتبقي تحصيله عند التسليم:</span>
                        <strong style={{ direction: 'ltr', unicodeBidi: 'isolate', color: '#000' }}>
                          {hasEst ? `من ${rMin.toFixed(2)} إلى ${rMax.toFixed(2)} ج.م` : `${parseFloat(order.remaining_amount || order.remainingAmount || rAvg || 0).toFixed(2)} ج.م`}
                        </strong>
                      </div>
                      {((!hasEst && refundDue > 0) || (hasEst && refundMax > 0)) && (
                        <div style={{ color: '#000', fontWeight: '900', border: '1.5px dashed #000', padding: '3px 6px', borderRadius: '4px', marginTop: '3px', fontSize: '10.5px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>مستحق رده للعميل من العربون:</span>
                          <strong style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
                            {hasEst ? `من ${refundMin.toFixed(2)} إلى ${refundMax.toFixed(2)} ج.م` : `${refundDue.toFixed(2)} ج.م`}
                          </strong>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <table className="receipt-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: printProfile === 'pos58' ? '9px' : '10.5px' }}>
                <colgroup>
                  <col style={{ width: '60%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="col-name" style={{ textAlign: 'right', padding: '3px 2px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الصنف</th>
                    <th className="col-num" style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>النوع</th>
                    <th className="col-num" style={{ textAlign: 'center', padding: '3px 1px', borderBottom: '1.5px solid #000', fontWeight: '900' }}>الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).filter(i => !i.prunedFromBill && !i.pruned_from_bill).map((item, idx) => {
                    const isEstimated = item.is_price_estimated || item.isPriceEstimated;
                    const priceMin = parseFloat(item.price_min || item.priceMin || 0);
                    const priceMax = parseFloat(item.price_max || item.priceMax || priceMin || 0);
                    const rawPrice = parseFloat(item.unitPrice || item.unit_price || 0);
                    const avgPrice = isEstimated && (priceMin > 0 || priceMax > 0)
                      ? ((priceMin + priceMax) / 2)
                      : (rawPrice > 0 ? rawPrice : ((priceMin + priceMax) / 2));

                    return (
                      <tr key={idx} style={{ borderBottom: '1.5px dashed #000' }}>
                        <td className="col-name" style={{ textAlign: 'right', padding: '3px 2px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          <strong>{item.medicationName || item.medication_name}</strong>
                          {isEstimated ? (
                            <small style={{ display: 'block', color: '#b45309', fontSize: '9px' }}>
                              (سعر تقديري: من {priceMin.toFixed(2)} إلى {priceMax.toFixed(2)} ج.م)
                            </small>
                          ) : null}
                        </td>
                        <td className="col-num" style={{ textAlign: 'center', padding: '3px 1px' }}>
                          {item.unitType === 'strip' || item.unit_type === 'strip' ? 'شريط' : 'علبة'}
                        </td>
                        <td className="col-num" style={{ textAlign: 'center', padding: '3px 1px', fontWeight: 'bold' }}>
                          <strong>{item.quantity}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: '14px', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '11px' }}>
                <p style={{ margin: '0 0 10px' }}>توقيع العميل بالاستلام: ..............................</p>
                <div className="receipt-barcode" style={{ textAlign: 'center' }}>
                  <div dangerouslySetInnerHTML={{ __html: generateBarcodeSvgString(barcodeValue, { moduleWidth: printProfile === 'pos58' ? 1.25 : 1.45, height: 42 }) }} />
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
