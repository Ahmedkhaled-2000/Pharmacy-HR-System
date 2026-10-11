import React, { useState, useMemo } from 'react';
import {
  X,
  Send,
  Sparkles,
  Phone,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Users,
  Copy,
  Check,
  RefreshCw
} from 'lucide-react';
import { outstockSendCosmeticsPromoWhatsapp } from '../../../utils/outstockApiClient';

const PRESET_TEMPLATES = [
  {
    id: 'new_arrivals',
    title: '🌟 وصول تشكيلة تجميل وعناية حصرية',
    text: `أهلاً بحضرتك {اسم_العميل} 🌸
يسعدنا إبلاغك بوصول تشكيلة حصرية وجديدة من أرقى مستحضرات العناية بالبشرة والشعر والتجميل العالمية في صيدليتنا ✨
بإمكانكِ زيارة الفرع أو طلب التوصيل الفوري، مع هدايا وعينات مجانية حصرية 💄🎁`
  },
  {
    id: 'beauty_consult',
    title: '💄 استشارة تجميلية وروتين عناية مخصص مجاناً',
    text: `عزيزتنا {اسم_العميل} 🌸
يسر خبيرة التجميل والعناية بالبشرة في صيدليتنا تقديم استشارة متخصصة مجاناً لتحديد روتين العناية اليومي الأنسب لبشرتكِ وشعركِ 💆‍♀️✨
يسعدنا تواصلك معنا لحجز استشارتك والاستفادة من عروضنا الخاصة 💖`
  },
  {
    id: 'special_discount',
    title: '🎁 خصم حصري لعملاء مستحضرات التجميل المميزين',
    text: `تحية طيبة {اسم_العميل} ✨
تقديراً لثقتكِ الغالية، يسعدنا تقديم خصم حصري 15% على كافة مستحضرات التجميل والعناية بالبشرة والشعر المختارة هذا الأسبوع 🛍️💄
العرض سارٍ لفترة محدودة، نتشرف بخدمتك دائماً 🌸`
  },
  {
    id: 'product_available',
    title: '🧴 توفر مستحضر التجميل المطلوب',
    text: `مرحباً {اسم_العميل} 🌸
يسعدنا إبلاغكِ بتوفر مستحضر التجميل والعناية الذي قمتِ بالسؤال عنه مسبقاً في صيدليتنا ✨
الكمية محدودة، يسعدنا حجز طلبكِ فوراً أو إرساله لكِ مع خدمة التوصيل السريع 🚚💄`
  }
];

export default function CosmeticsWhatsAppBroadcastModal({
  isOpen,
  onClose,
  selectedCustomers = [],
  showToast
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState('new_arrivals');
  const [messageText, setMessageText] = useState(PRESET_TEMPLATES[0].text);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [copiedCustomerPhone, setCopiedCustomerPhone] = useState(null);

  // اختيار قالب جاهز
  const handleSelectTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setMessageText(template.text);
  };

  // إدراج وسم تلقائي
  const handleInsertTag = (tag) => {
    setMessageText(prev => prev + tag);
  };

  // معاينة الرسالة للعميل الأول
  const previewCustomer = selectedCustomers[0] || { full_name: 'سارة أحمد', customer_code: 'CUST-102' };
  const previewMessage = useMemo(() => {
    let preview = messageText;
    const name = previewCustomer.full_name || previewCustomer.name || 'عميلنا العزيز';
    const code = previewCustomer.customer_code || '—';
    preview = preview.replace(/{اسم_العميل}/g, name);
    preview = preview.replace(/{customer_name}/g, name);
    preview = preview.replace(/{كود_العميل}/g, code);
    preview = preview.replace(/{customer_code}/g, code);
    return preview;
  }, [messageText, previewCustomer]);

  // إرسال الحملة الترويجية عبر النظام
  const handleSendBroadcast = async () => {
    if (!messageText.trim()) {
      showToast?.('يرجى كتابة نص الرسالة أو اختيار قالب');
      return;
    }
    if (selectedCustomers.length === 0) {
      showToast?.('لم يتم تحديد أي عميل لإرسال الحملة');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const customerIds = selectedCustomers.map(c => c.id).filter(Boolean);
      // تحويل الوسم العربي {اسم_العميل} للوسم المعتمد في الباك إند {customer_name}
      const backendMessage = messageText
        .replace(/{اسم_العميل}/g, '{customer_name}')
        .replace(/{كود_العميل}/g, '{customer_code}');

      const res = await outstockSendCosmeticsPromoWhatsapp({
        customerIds,
        message: backendMessage
      });

      if (res?.success) {
        setSendResult({
          success: true,
          sentCount: res.sentCount || customerIds.length,
          message: res.message || `تم إرسال الحملة بنجاح إلى ${customerIds.length} عميل`
        });
        showToast?.(`✅ تم إرسال رسائل الواتساب بنجاح إلى ${customerIds.length} عميل`);
      } else {
        setSendResult({
          success: false,
          error: res?.error || 'تعذر الإرسال الآلي للواتساب، يمكنك استخدام خيار الإرسال المباشر أدناه'
        });
      }
    } catch (e) {
      console.warn('Broadcast error:', e);
      setSendResult({
        success: false,
        error: 'حدث خطأ أثناء الإرسال الآلي، يمكنك إرسال الرسائل عبر واتساب ويب مباشرة'
      });
    } finally {
      setIsSending(false);
    }
  };

  // فتح واتساب ويب يدوي لعميل محدد
  const handleOpenDirectWhatsApp = (customer) => {
    let phone = customer.whatsapp_phone || customer.phone || '';
    phone = String(phone).replace(/\D/g, '');
    if (phone.startsWith('01') && phone.length === 11) phone = '2' + phone;
    const personalized = messageText
      .replace(/{اسم_العميل}/g, customer.full_name || customer.name || 'عميلنا العزيز')
      .replace(/{customer_name}/g, customer.full_name || customer.name || 'عميلنا العزيز')
      .replace(/{كود_العميل}/g, customer.customer_code || '')
      .replace(/{customer_code}/g, customer.customer_code || '');

    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(personalized)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'outstockFadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          direction: 'rtl'
        }}
      >
        {/* ── الرأس ── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #831843 0%, #be185d 100%)',
            padding: '18px 24px',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900' }}>
                حملة واتساب ترويجية فاخرة - قسم مستحضرات التجميل 💄✨
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
                إرسال رسائل مخصصة وأنيقة لعملاء التجميل المحددين ({selectedCustomers.length} عميل)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              color: '#ffffff',
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── المحتوى ── */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          {/* معلومات العملاء المحددين */}
          <div
            style={{
              background: '#fdf2f8',
              borderRadius: '12px',
              padding: '12px 16px',
              border: '1px solid #fbcfe8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="#be185d" />
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#831843' }}>
                المستلمون المستهدفون: {selectedCustomers.length} عميل
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '450px' }}>
              {selectedCustomers.slice(0, 4).map((c, i) => (
                <span
                  key={c.id || i}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #f472b6',
                    color: '#9d174d',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: '700'
                  }}
                >
                  {c.full_name || c.name || 'عميل'}
                </span>
              ))}
              {selectedCustomers.length > 4 && (
                <span
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#64748b',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '11px'
                  }}
                >
                  +{selectedCustomers.length - 4} آخرين
                </span>
              )}
            </div>
          </div>

          {/* قوالب الرسائل الجاهزة */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '800', color: '#334155', marginBottom: '8px' }}>
              اختيار نموذج رسالة ترويجي جاهز:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
              {PRESET_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tmpl)}
                    style={{
                      background: isSelected ? '#fdf2f8' : '#f8fafc',
                      border: isSelected ? '2px solid #be185d' : '1px solid #e2e8f0',
                      color: isSelected ? '#831843' : '#334155',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: isSelected ? '900' : '700',
                      cursor: 'pointer',
                      textAlign: 'right',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {tmpl.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* محرر نص الرسالة */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155' }}>
                نص الرسالة الترويجية (يدعم المتغيرات الذكية):
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleInsertTag(' {اسم_العميل} ')}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  title="إدراج اسم العميل المخصص"
                >
                  + {`{اسم_العميل}`}
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertTag(' {كود_العميل} ')}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                  title="إدراج كود العميل"
                >
                  + {`{كود_العميل}`}
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="اكتب رسالتك الترويجية هنا..."
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1.5px solid #f472b6',
                fontSize: '13px',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          {/* ── معاينة الواتساب الواقعية ── */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '800', color: '#64748b', marginBottom: '6px' }}>
              معاينة مظهر الرسالة في تطبيق واتساب العميل (تجربة نموذجية لـ {previewCustomer.full_name || 'العميل'}):
            </label>
            <div
              style={{
                background: '#e5ddd5',
                backgroundImage: 'radial-gradient(#d1c7bc 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'flex-start'
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '12px 12px 0 12px',
                  padding: '12px 16px',
                  maxWidth: '85%',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  color: '#111827',
                  whiteSpace: 'pre-wrap',
                  position: 'relative'
                }}
              >
                {previewMessage}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    marginTop: '6px',
                    fontSize: '10px',
                    color: '#6b7280'
                  }}
                >
                  <span>10:30 م</span>
                  <span style={{ color: '#38bdf8' }}>✓✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* نتائج الإرسال إن وجدت */}
          {sendResult && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: sendResult.success ? '#ecfdf5' : '#fff1f2',
                border: `1px solid ${sendResult.success ? '#a7f3d0' : '#fecdd3'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              {sendResult.success ? (
                <CheckCircle2 size={20} color="#059669" />
              ) : (
                <AlertTriangle size={20} color="#e11d48" />
              )}
              <span style={{ fontSize: '13px', fontWeight: '800', color: sendResult.success ? '#065f46' : '#9f1239' }}>
                {sendResult.success ? sendResult.message : sendResult.error}
              </span>
            </div>
          )}

          {/* قائمة الإرسال السريع المباشر (Direct WhatsApp Web Sender) */}
          <div style={{ marginTop: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: '#64748b', marginBottom: '8px' }}>
              الإرسال الفردي السريع (واتساب ويب):
            </div>
            <div
              style={{
                maxHeight: '120px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                border: '1px solid #f1f5f9',
                borderRadius: '10px',
                padding: '6px'
              }}
            >
              {selectedCustomers.map((cust, i) => (
                <div
                  key={cust.id || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{cust.full_name || cust.name}</span>
                    <span style={{ color: '#64748b', direction: 'ltr' }}>{cust.whatsapp_phone || cust.phone || '—'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDirectWhatsApp(cust)}
                    style={{
                      background: '#25d366',
                      border: 'none',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <ExternalLink size={12} />
                    <span>فتح محادثة واتساب</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── أسفل النافذة ── */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #f1f5f9',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="outstock-btn"
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              padding: '9px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            إغلاق
          </button>

          <button
            type="button"
            onClick={handleSendBroadcast}
            disabled={isSending || selectedCustomers.length === 0}
            className="outstock-btn"
            style={{
              background: 'linear-gradient(135deg, #831843 0%, #be185d 100%)',
              border: 'none',
              color: '#ffffff',
              padding: '10px 22px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '900',
              cursor: isSending || selectedCustomers.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isSending || selectedCustomers.length === 0 ? 0.7 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(190, 24, 93, 0.35)'
            }}
          >
            {isSending ? (
              <>
                <RefreshCw size={16} className="outstock-spin" />
                <span>جاري إرسال الحملة إلى {selectedCustomers.length} عميل...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>إرسال الحملة لكافة المحددين ({selectedCustomers.length}) 🚀</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
