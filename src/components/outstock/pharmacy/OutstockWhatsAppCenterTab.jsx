import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  Send,
  Phone,
  User,
  FileText,
  Clock,
  ExternalLink,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Check,
  Info
} from 'lucide-react';
import { getResolvedWhatsAppServerUrl } from '../../../utils/systemUrlHelper';
import { outstockGetOrders, outstockGetCustomers } from '../../../utils/outstockApiClient';
import { buildInvoicePdfHtml } from '../../../utils/invoicePdfGenerator';

/**
 * OutstockWhatsAppCenterTab.jsx
 * مركز اتصال الواتساب الخاص بالصيدلية/الفرع (Pharmacy WhatsApp Automation Hub)
 * يسمح لفرع الصيدلية بـ:
 * 1. الاقتران بواتساب الصيدلية عبر مسح رمز الـ QR المباشر
 * 2. إرسال إشعارات الفواتير وتأكيد الحجز وتوفر الأدوية والنواقص تلقائياً
 * 3. إرسال رسائل مخصصة مع إمكانية إرفاق ملفات الـ PDF
 * 4. التحويل المباشر لـ WhatsApp Web كخيار بديل فوري
 */
export default function OutstockWhatsAppCenterTab({ branchId, branch, currentPharmacist = '', showToast }) {
  // حالة اتصال خادم الواتساب
  const [waState, setWaState] = useState({
    status: 'CHECKING', // 'CHECKING' | 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
    phone: '',
    deviceName: '',
    qrCodeDataUrl: '',
    sentCount: 0,
    logs: [],
    lastError: null
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // بيانات المراسلة السريعة
  const [selectedRecipientType, setSelectedRecipientType] = useState('recent_orders'); // 'recent_orders' | 'custom'
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('order_arrived');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // طلبات الفرع الأخيرة لتسهيل اختيار العميل
  const [recentOrders, setRecentOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [attachPdf, setAttachPdf] = useState(true);

  // عنوان سيرفر الواتساب المعتمد
  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(), []);

  // ── 1. فحص حالة الاتصال واسترجاع الـ QR ─────────────────────────────────────
  const fetchWhatsAppStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await fetch(`${waServerUrl}/api/status`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json();
      setWaState({
        status: data.status || 'DISCONNECTED',
        phone: data.phone || '',
        deviceName: data.deviceName || '',
        qrCodeDataUrl: data.qrCodeDataUrl || '',
        sentCount: data.sentCount || 0,
        logs: Array.isArray(data.logs) ? data.logs : [],
        lastError: data.lastError || null
      });
    } catch (err) {
      setWaState(prev => ({
        ...prev,
        status: 'DISCONNECTED',
        lastError: 'تعذر الوصول لخادم الواتساب'
      }));
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  }, [waServerUrl]);

  // فحص دوري كل 5 ثوانٍ عند انتظار مسح الـ QR أو دوري كل 25 ثانية
  useEffect(() => {
    fetchWhatsAppStatus();
    const interval = setInterval(() => {
      fetchWhatsAppStatus(true);
    }, waState.status === 'QR_READY' ? 4000 : 25000);

    return () => clearInterval(interval);
  }, [fetchWhatsAppStatus, waState.status]);

  // جلب الطلبات الأخيرة لربط المراسلة
  useEffect(() => {
    if (branchId) {
      outstockGetOrders({ branchId, limit: 20 })
        .then(res => {
          if (res?.success && Array.isArray(res.orders)) {
            setRecentOrders(res.orders);
            if (res.orders.length > 0) {
              const first = res.orders[0];
              setSelectedOrder(first);
              setRecipientPhone(first.customer_phone || first.customerPhone || '');
              setRecipientName(first.customer_name || first.customerName || '');
            }
          }
        })
        .catch(() => {});
    }
  }, [branchId]);

  // ── 2. إجراءات الخادم (إعادة تشغيل / فك الاقتران) ───────────────────────────
  const handleRestartServer = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${waServerUrl}/api/restart`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json().catch(() => ({}));
      showToast?.(data.message || 'تم إرسال أمر إعادة تشغيل محرك الواتساب بنجاح');
      setTimeout(fetchWhatsAppStatus, 1500);
    } catch (err) {
      showToast?.('تعذر إعادة تشغيل الخادم');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogoutServer = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من جلسة الواتساب وفك الاقتران؟')) return;
    setIsActionLoading(true);
    try {
      await fetch(`${waServerUrl}/api/logout`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      showToast?.('تم تسجيل الخروج بنجاح. يمكنك الآن مسح الـ QR بهاتف آخر.');
      setTimeout(fetchWhatsAppStatus, 1500);
    } catch (err) {
      showToast?.('تعذر تسجيل الخروج');
    } finally {
      setIsActionLoading(false);
    }
  };

  // ── 3. قوالب الرسائل التلقائية للنواقص والصيدليات ──────────────────────────
  const messageTemplates = useMemo(() => {
    const bName = branch?.name || 'صيدلية النوبية';
    const cName = recipientName || 'عميلنا العزيز';
    const oNum = selectedOrder?.order_number || selectedOrder?.orderNumber || '0000';
    const remaining = selectedOrder ? parseFloat(selectedOrder.remaining_amount || selectedOrder.remainingAmount || 0).toFixed(2) : '0.00';
    const pickupDate = selectedOrder?.expected_pickup_date || selectedOrder?.expectedPickupDate || 'اليوم';

    return {
      order_confirmation: {
        title: '📦 تأكيد حجز طلب دواء وعربون',
        text: `السلام عليكم ورحمة الله وبركاته،\n\nأهلاً بك أستاذ/ة *${cName}* 🌸\nنود تأكيد استلام طلب حجز وتوفير الأدوية رقم (*#${oNum}*) لدى *${bName}*.\n\nالمتبقي عند الاستلام: *${remaining} ج.م*\nموعد التوفر المتوقع: *${pickupDate}*\n\nسوف نقوم بإشعاركم فور وصول الدواء للفرع مباشرة. نشكر ثقتكم بنا 💊`
      },
      order_arrived: {
        title: '🎉 إشعار توفر الدواء وجاهزيته بالفرع',
        text: `السلام عليكم ورحمة الله وبركاته،\n\nبشرى سارة أستاذ/ة *${cName}* ✨\nيسعدنا إبلاغك بأن طلبك الدوائي رقم (*#${oNum}*) أصبح متوفراً الآن لدى *${bName}* وجاهز للاستلام في أي وقت!\n\nالمبلغ المتبقي للتحصيل: *${remaining} ج.م*\nيرجى إبراز هذا الإيصال عند الحضور.\n\nدمتم بصحة وعافية دائماً 🌿`
      },
      substitute_suggestion: {
        title: '💡 اقتراح مثائل وبدائل مسجلة (Drug Eye)',
        text: `السلام عليكم ورحمة الله وبركاته،\n\nأهلاً بك أستاذ/ة *${cName}*،\nبخصوص طلبكم رقم (*#${oNum}*)، نظراً لنقص الصنف الأصلي حالياً لدى الوكلاء والموزعين، نود إحاطتكم بتوفر بدائل رسمية ومثيلة معتمدة من هيئة الدواء بنفس المادة الفعالة والتركيز والفعالية العلاجية تماماً وبسعر مناسب.\n\nيسعدنا تواصلكم معنا لاختيار البديل الأنسب لكم 🏥`
      },
      chronic_reminder: {
        title: '⏰ تذكير شهري بتجهيز أدوية الأمراض المزمنة',
        text: `السلام عليكم ورحمة الله وبركاته،\n\nعزيزنا أستاذ/ة *${cName}*،\nحرصاً من *${bName}* على استمرار ختتكم العلاجية وصحتكم الغالية، نود تذكيركم بقرب موعد تجديد جرعتكم الشهرية من علاجكم الدائم.\n\nتم تجهيز حصتكم مسبقاً في الفرع لتفادي أي نقص في السوق، ويسعدنا زيارتكم أو طلب التوصيل في أي وقت 🩺`
      }
    };
  }, [branch, recipientName, selectedOrder]);

  // تحديث نص الرسالة عند اختيار القالب
  useEffect(() => {
    if (messageTemplates[selectedTemplate]) {
      setCustomMessage(messageTemplates[selectedTemplate].text);
    }
  }, [selectedTemplate, messageTemplates]);

  // عند اختيار طلب من القائمة
  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    setRecipientPhone(order.customer_phone || order.customerPhone || '');
    setRecipientName(order.customer_name || order.customerName || '');
  };

  // ── 4. إرسال الرسالة للعميل (خادم تلقائي أو WhatsApp Web) ───────────────────
  const handleSendAutomated = async () => {
    const cleanPhone = String(recipientPhone || '').replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 9) {
      showToast?.('⚠️ يرجى إدخال رقم هاتف واتساب صالح للعميل');
      return;
    }

    if (!customMessage.trim()) {
      showToast?.('⚠️ يرجى كتابة نص الرسالة قبل الإرسال');
      return;
    }

    if (waState.status !== 'CONNECTED') {
      showToast?.('⚠️ خادم الواتساب غير مقترن حالياً. يرجى مسح الـ QR أو استخدام زر "الفتح عبر WhatsApp Web".');
      return;
    }

    setIsSending(true);
    try {
      const payload = {
        phone: cleanPhone,
        message: customMessage
      };

      if (selectedOrder && attachPdf) {
        payload.pdfHtml = buildInvoicePdfHtml(selectedOrder, branch);
        payload.fileName = `فاتورة_طلب_${selectedOrder.order_number || selectedOrder.id || 'receipt'}.pdf`;
      }

      const res = await fetch(`${waServerUrl}/api/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showToast?.(`✅ تم إرسال الرسالة بنجاح إلى العميل: ${recipientName || cleanPhone}`);
        fetchWhatsAppStatus(true);
      } else {
        showToast?.(`⚠️ فشل الإرسال: ${data.error || 'حدث خطأ في الخادم'}`);
      }
    } catch (err) {
      showToast?.('تعذر الاتصال بخادم الواتساب للإرسال');
    } finally {
      setIsSending(false);
    }
  };

  // فتح المحادثة مباشرة في WhatsApp Web كخيار Fallback دائم
  const handleOpenWhatsAppWeb = () => {
    let cleanPhone = String(recipientPhone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '2' + cleanPhone;
    }
    if (!cleanPhone) {
      showToast?.('⚠️ يرجى إدخال رقم الهاتف أولاً');
      return;
    }

    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(customMessage)}`;
    window.open(url, '_blank');
    showToast?.(`📲 جاري فتح محادثة العميل على WhatsApp Web`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── 1. بطاقة حالة ربط الواتساب والاقتران المباشر بالـ QR ── */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: waState.status === 'CONNECTED' ? '#dcfce7' : waState.status === 'QR_READY' ? '#fef9c3' : '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: waState.status === 'CONNECTED' ? '#16a34a' : waState.status === 'QR_READY' ? '#ca8a04' : '#dc2626'
            }}>
              <MessageSquare size={24} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                  بوابة واتساب فرع: {branch?.name || 'الصيدلية'}
                </h3>
                {waState.status === 'CONNECTED' && (
                  <span style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <CheckCircle2 size={12} />
                    متصل ونشط
                  </span>
                )}
                {waState.status === 'QR_READY' && (
                  <span style={{
                    background: '#ca8a04',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <QrCode size={12} />
                    بانتظار المسح (Scan QR)
                  </span>
                )}
                {waState.status === 'DISCONNECTED' && (
                  <span style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '800'
                  }}>
                    غير متصل
                  </span>
                )}
              </div>

              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                {waState.status === 'CONNECTED'
                  ? `مرتبط بالهاتف: +${waState.phone || 'مسجل'} ${waState.deviceName ? `(${waState.deviceName})` : ''} • تم إرسال ${waState.sentCount} رسالة للعملاء`
                  : 'امسح رمز الاستجابة السريعة (QR) من تطبيق واتساب بهاتف الصيدلية لبدء الإرسال التلقائي للعملاء.'}
              </p>
            </div>
          </div>

          {/* أزرار التحكم بالخادم */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => fetchWhatsAppStatus()}
              disabled={isLoadingStatus}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              title="تحديث الحالة الآن"
            >
              <RefreshCw size={14} className={isLoadingStatus ? 'animate-spin' : ''} style={{ animation: isLoadingStatus ? 'spin 1s linear infinite' : 'none' }} />
              <span>فحص الاتصال</span>
            </button>

            <button
              type="button"
              onClick={handleRestartServer}
              disabled={isActionLoading}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              title="إعادة تشغيل محرك الواتساب"
            >
              <Power size={14} />
              <span>إعادة التشغيل</span>
            </button>

            {waState.status === 'CONNECTED' && (
              <button
                type="button"
                onClick={handleLogoutServer}
                disabled={isActionLoading}
                className="outstock-btn"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca'
                }}
                title="تسجيل الخروج لربط هاتف صيدلية آخر"
              >
                <span>فك الاقتران</span>
              </button>
            )}
          </div>
        </div>

        {/* ── حالة انتظار الـ QR Code (Scan Section) ── */}
        {waState.status === 'QR_READY' && waState.qrCodeDataUrl && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: '#fffbeb',
            border: '1.5px dashed #f59e0b',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            flexWrap: 'wrap'
          }}>
            <div style={{
              background: '#ffffff',
              padding: '10px',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              border: '1px solid #e2e8f0'
            }}>
              <img
                src={waState.qrCodeDataUrl}
                alt="WhatsApp QR Code"
                style={{ width: '200px', height: '200px', display: 'block' }}
              />
            </div>

            <div style={{ maxWidth: '380px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '900', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={18} />
                <span>خطوات ربط هاتف الصيدلية:</span>
              </h4>
              <ol style={{ margin: 0, paddingRight: '20px', fontSize: '12.5px', color: '#78350f', lineHeight: 1.6 }}>
                <li>افتح تطبيق <strong>WhatsApp</strong> على هاتف الصيدلية أو مسؤول الشيفت.</li>
                <li>اضغط على <strong>القائمة (⋮)</strong> أو الإعدادات ➔ <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
                <li>اضغط على <strong>ربط جهاز (Link a Device)</strong>.</li>
                <li>وجّه كاميرا الهاتف نحو مربع الـ QR المقابل ليتم الاتصال فورياً.</li>
              </ol>
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#b45309' }}>
                ⏳ يتجدد الرمز تلقائياً كل بضع ثوانٍ لحمايتك.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. قسم إرسال الرسائل التلقائية لعملاء الصيدلية ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '16px'
      }}>
        {/* العمود الأيمن: اختيار العميل أو الطلب */}
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={16} color="#0d9488" />
            <span>بيانات العميل والطلب المستهدف</span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setSelectedRecipientType('recent_orders')}
              className={`outstock-btn ${selectedRecipientType === 'recent_orders' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
              style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
            >
              من طلبات النواقص الأخيرة
            </button>
            <button
              type="button"
              onClick={() => setSelectedRecipientType('custom')}
              className={`outstock-btn ${selectedRecipientType === 'custom' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
              style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
            >
              إدخال رقم مباشر
            </button>
          </div>

          {selectedRecipientType === 'recent_orders' ? (
            <div>
              <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                اختر العميل من أحدث الطلبات:
              </label>
              {recentOrders.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px', textAlign: 'center' }}>
                  لا توجد طلبات نواقص مسجلة للفرع بعد.
                </div>
              ) : (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px' }}>
                  {recentOrders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => handleSelectOrder(o)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: selectedOrder?.id === o.id ? '#f0fdfa' : '#ffffff',
                        border: selectedOrder?.id === o.id ? '1px solid #99f6e4' : '1px solid transparent',
                        marginBottom: '4px',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{o.customer_name || o.customerName}</span>
                        <span style={{ color: '#0d9488' }}>#{o.order_number || o.orderNumber}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                        <span>{o.customer_phone || o.customerPhone}</span>
                        <span>متبقي: {parseFloat(o.remaining_amount || o.remainingAmount || 0).toFixed(2)} ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  اسم العميل:
                </label>
                <input
                  type="text"
                  placeholder="اسم العميل..."
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="outstock-form-input"
                  style={{ minHeight: '38px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  رقم الواتساب:
                </label>
                <input
                  type="tel"
                  placeholder="01xxxxxxxxx"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="outstock-form-input"
                  dir="ltr"
                  style={{ minHeight: '38px', fontSize: '13px', textAlign: 'right' }}
                />
              </div>
            </div>
          )}

          {/* معاينة العميل المختار */}
          {recipientPhone && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <strong>{recipientName || 'عميل'}</strong>: <span dir="ltr">{recipientPhone}</span>
              </div>
              <span style={{ color: '#0d9488', fontWeight: 'bold' }}>جاهز للإرسال ✅</span>
            </div>
          )}
        </div>

        {/* العمود الأيسر: صياغة الرسالة واختيار القالب والإرسال */}
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={16} color="#0284c7" />
            <span>صياغة رسالة الواتساب والقوالب الجاهزة</span>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
              اختر نوع الإشعار التلقائي:
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="outstock-form-select"
              style={{ minHeight: '38px', fontSize: '12.5px', fontWeight: '700' }}
            >
              <option value="order_arrived">🎉 إشعار توفر الدواء وجاهزيته للاستلام بالفرع</option>
              <option value="order_confirmation">📦 تأكيد استلام حجز الدواء وقيمة العربون</option>
              <option value="substitute_suggestion">💡 اقتراح المثائل والبدائل المسجلة (Drug Eye)</option>
              <option value="chronic_reminder">⏰ تذكير شهري بتجهيز أدوية الأمراض المزمنة</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
              نص الرسالة التي ستصل للعميل:
            </label>
            <textarea
              rows={6}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="outstock-form-input"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '12.5px',
                lineHeight: 1.5,
                borderRadius: '10px',
                resize: 'vertical'
              }}
            />
          </div>

          {selectedOrder && (
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#0f766e',
              fontWeight: 'bold',
              background: '#f0fdf4',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
              />
              <FileText size={15} />
              <span>إرفاق الفاتورة الرسمية كملف PDF مع الرسالة تلقائياً للطلب #{selectedOrder.order_number || selectedOrder.orderNumber}</span>
            </label>
          )}

          {/* أزرار الإرسال */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
            <button
              type="button"
              onClick={handleSendAutomated}
              disabled={isSending || waState.status !== 'CONNECTED'}
              className="outstock-btn outstock-btn-whatsapp"
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: '800',
                opacity: waState.status !== 'CONNECTED' ? 0.6 : 1
              }}
            >
              <Send size={16} />
              <span>{isSending ? 'جاري الإرسال عبر الخادم...' : 'إرسال تلقائي عبر خادم الواتساب ⚡'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '10px 14px', fontSize: '12.5px' }}
              title="فتح المحادثة مباشرة في WhatsApp Web"
            >
              <ExternalLink size={15} />
              <span>فتح WhatsApp Web</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
