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
  Info,
  Lock,
  Search,
  Users
} from 'lucide-react';
import { getResolvedWhatsAppServerUrl } from '../../../utils/systemUrlHelper';
import {
  outstockGetOrders,
  outstockGetCustomers,
  outstockGetSettings,
  outstockSaveSettings,
  outstockGetCosmeticsCustomers,
  outstockSendCosmeticsPromoWhatsapp
} from '../../../utils/outstockApiClient';
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
export default function OutstockWhatsAppCenterTab({ branchId, branch, currentPharmacist = '', showToast, userRole = '', currentUser = null }) {
  // التحقق من صلاحية المالك (تعديل أرقام المشتريات ومسؤول التجميل مقتصر على المالك فقط)
  const isOwner = useMemo(() => {
    if (userRole === 'owner') return true;
    if (currentUser?.role === 'owner' || currentUser?.role === 'outstock_owner') return true;
    try {
      const stored = JSON.parse(localStorage.getItem('outstock_user') || '{}');
      if (stored?.role === 'owner' || stored?.role === 'outstock_owner') return true;
      const appUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      if (appUser?.role === 'owner') return true;
    } catch (_) {}
    return false;
  }, [userRole, currentUser]);

  // مسؤول التسويق ومستحضرات التجميل
  const isCosmeticsOfficer = useMemo(() => {
    if (userRole === 'cosmetics_officer' || userRole === 'outstock_cosmetics_officer' || userRole === 'procurement_cosmetics') return true;
    if (currentUser?.role === 'cosmetics_officer' || currentUser?.role === 'outstock_cosmetics_officer' || currentUser?.originalRole === 'cosmetics_officer' || currentUser?.category_scope === 'cosmetics') return true;
    try {
      const stored = JSON.parse(localStorage.getItem('outstock_user') || '{}');
      if (stored?.role === 'cosmetics_officer' || stored?.category_scope === 'cosmetics') return true;
    } catch (_) {}
    return false;
  }, [userRole, currentUser]);

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

  // ── استهداف عملاء مستحضرات التجميل والتسويق الجماعي ──
  const [cosmSearchTerm, setCosmSearchTerm] = useState('');
  const [cosmCustomers, setCosmCustomers] = useState([]);
  const [selectedCosmCustomerIds, setSelectedCosmCustomerIds] = useState([]);
  const [isLoadingCosmCustomers, setIsLoadingCosmCustomers] = useState(false);
  const [isSendingCosmPromo, setIsSendingCosmPromo] = useState(false);
  const [cosmPromoMessage, setCosmPromoMessage] = useState(
    'أهلاً بك يا {customer_name} 🌸 يسعدنا إعلامك بوصول تشكيلة حصرية وعروض مميزة على مستحضرات التجميل والعناية بصيدليتنا! تفضل بزيارتنا أو اطلب مباشرة عبر الواتساب ✨'
  );

  const handleSearchCosmeticsCustomers = async (searchVal = cosmSearchTerm) => {
    setIsLoadingCosmCustomers(true);
    try {
      const res = await outstockGetCosmeticsCustomers({
        search: searchVal,
        branchId: branchId || 'all'
      });
      if (res?.success && Array.isArray(res.customers)) {
        setCosmCustomers(res.customers);
        setSelectedCosmCustomerIds(res.customers.map(c => c.id));
      } else {
        setCosmCustomers([]);
        setSelectedCosmCustomerIds([]);
      }
    } catch (e) {
      console.warn('Error loading cosmetics customers:', e);
      showToast?.(`⚠️ خطأ في جلب عملاء التجميل: ${e.message}`);
    } finally {
      setIsLoadingCosmCustomers(false);
    }
  };

  const handleToggleSelectAllCosm = () => {
    if (selectedCosmCustomerIds.length === cosmCustomers.length) {
      setSelectedCosmCustomerIds([]);
    } else {
      setSelectedCosmCustomerIds(cosmCustomers.map(c => c.id));
    }
  };

  const handleToggleSelectCosmCustomer = (id) => {
    setSelectedCosmCustomerIds(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleSendCosmeticsPromoBulk = async () => {
    if (!cosmPromoMessage || !cosmPromoMessage.trim()) {
      showToast?.('⚠️ يرجى كتابة نص الرسالة الترويجية أولاً');
      return;
    }
    if (selectedCosmCustomerIds.length === 0) {
      showToast?.('⚠️ يرجى تحديد عميل واحد على الأقل لإرسال الحملة الترويجية');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من إرسال هذا العرض الترويجي لواتساب ${selectedCosmCustomerIds.length} عميل؟`)) {
      return;
    }

    setIsSendingCosmPromo(true);
    try {
      const res = await outstockSendCosmeticsPromoWhatsapp({
        customerIds: selectedCosmCustomerIds,
        message: cosmPromoMessage.trim()
      });
      if (res?.success) {
        showToast?.(`🚀 ${res.message || 'تم إرسال الحملة الترويجية بنجاح!'}`);
      } else {
        showToast?.(`⚠️ فشل إرسال الحملة: ${res?.error || 'حدث خطأ'}`);
      }
    } catch (e) {
      showToast?.(`❌ خطأ: ${e.message}`);
    } finally {
      setIsSendingCosmPromo(false);
    }
  };

  // أرقام واتساب التوجيه الآلي (إدارة المشتريات ومسؤول مستحضرات التجميل)
  const [procurementPhone, setProcurementPhone] = useState('');
  const [cosmeticsPhone, setCosmeticsPhone] = useState('');
  const [isSavingPhones, setIsSavingPhones] = useState(false);
  const [isTestingProcPhone, setIsTestingProcPhone] = useState(false);
  const [isTestingCosmPhone, setIsTestingCosmPhone] = useState(false);

  // عنوان سيرفر الواتساب المعتمد
  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(), []);

  // معرف الجلسة المعزولة الخاصة بهذا الفرع حصراً
  const branchSessionId = useMemo(() => {
    const raw = String(branchId || branch?.id || 'default');
    return raw.startsWith('branch_') ? raw : `branch_${raw}`;
  }, [branchId, branch?.id]);

  // جلب إعدادات المشتريات ومستحضرات التجميل المحفوظة
  useEffect(() => {
    outstockGetSettings()
      .then(res => {
        if (res?.success && res.settings) {
          if (res.settings.procurementWhatsappPhone) {
            setProcurementPhone(res.settings.procurementWhatsappPhone);
          }
          if (res.settings.cosmeticsWhatsappPhone) {
            setCosmeticsPhone(res.settings.cosmeticsWhatsappPhone);
          }
        }
      })
      .catch(() => {});
  }, []);

  // حفظ أرقام واتساب المشتريات ومستحضرات التجميل (للمالك فقط)
  const handleSaveRoutingPhones = async (e) => {
    if (e) e.preventDefault();
    if (!isOwner) {
      showToast?.('🔒 عذراً: تعديل رقم إدارة المشتريات أو مسؤول مستحضرات التجميل متاح لحساب المالك فقط!');
      return;
    }
    const cleanProc = String(procurementPhone || '').replace(/\D/g, '');
    const cleanCosm = String(cosmeticsPhone || '').replace(/\D/g, '');

    if (cleanProc && cleanProc.length !== 11) {
      showToast?.('⚠️ رقم هاتف المشتريات يجب أن يتكون من 11 رقماً (مثال: 01012345678)');
      return;
    }
    if (cleanCosm && cleanCosm.length !== 11) {
      showToast?.('⚠️ رقم هاتف مسؤول التجميل يجب أن يتكون من 11 رقماً (مثال: 01012345678)');
      return;
    }

    setIsSavingPhones(true);
    try {
      const res = await outstockSaveSettings({
        procurementWhatsappPhone: cleanProc,
        cosmeticsWhatsappPhone: cleanCosm
      });
      if (res?.success) {
        showToast?.('✅ تم حفظ وتأمين أرقام واتساب المشتريات ومستحضرات التجميل بنجاح!');
      } else {
        showToast?.(res?.error || 'تعذر حفظ الأرقام');
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء حفظ الأرقام');
    } finally {
      setIsSavingPhones(false);
    }
  };

  // إرسال رسالة تجريبية لرقم إدارة المشتريات عبر جلسة واتساب الفرع المقترنة
  const handleTestProcurementPhone = async () => {
    const clean = String(procurementPhone || '').replace(/\D/g, '');
    if (!clean || clean.length !== 11) {
      showToast?.('⚠️ يرجى كتابة وحفظ رقم هاتف صحيح من 11 رقماً للمشتريات أولاً');
      return;
    }
    setIsTestingProcPhone(true);
    try {
      const normalized = clean.startsWith('01') ? ('2' + clean) : clean;
      const testMsg = `💊 *رسالة اختبار اتصال واتساب لإدارة المشتريات*\n` +
        `🏢 *المرسل:* صيدلية ${branch?.name || branchId}\n` +
        `👤 *المحرر:* ${currentPharmacist || 'صيدلي الفرع'}\n` +
        `✅ الربط الآلي وتوجيه طلبات الأدوية يعمل بنجاح!`;

      const res = await fetch(`${waServerUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: branchSessionId,
          phone: normalized,
          message: testMsg
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast?.('🎉 تم إرسال الرسالة التجريبية إلى رقم إدارة المشتريات بنجاح عبر واتساب الصيدلية!');
      } else {
        showToast?.(`⚠️ لم يتم التسليم: ${data?.error || 'تأكد من اقتران واتساب الصيدلية أولاً'}`);
      }
    } catch (err) {
      showToast?.('تعذر إرسال الرسالة التجريبية لخادم الواتساب');
    } finally {
      setIsTestingProcPhone(false);
    }
  };

  // إرسال رسالة تجريبية لرقم مسؤول مستحضرات التجميل عبر جلسة واتساب الفرع المقترنة
  const handleTestCosmeticsPhone = async () => {
    const clean = String(cosmeticsPhone || '').replace(/\D/g, '');
    if (!clean || clean.length !== 11) {
      showToast?.('⚠️ يرجى كتابة وحفظ رقم هاتف صحيح من 11 رقماً لمسؤول مستحضرات التجميل أولاً');
      return;
    }
    setIsTestingCosmPhone(true);
    try {
      const normalized = clean.startsWith('01') ? ('2' + clean) : clean;
      const testMsg = `💄 *رسالة اختبار اتصال واتساب لمسؤول مستحضرات التجميل*\n` +
        `🏢 *المرسل:* صيدلية ${branch?.name || branchId}\n` +
        `👤 *المحرر:* ${currentPharmacist || 'صيدلي الفرع'}\n` +
        `✅ الربط الآلي وتوجيه طلبات مستحضرات التجميل يعمل بنجاح!`;

      const res = await fetch(`${waServerUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: branchSessionId,
          phone: normalized,
          message: testMsg
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        showToast?.('🎉 تم إرسال الرسالة التجريبية إلى مسؤول مستحضرات التجميل بنجاح عبر واتساب الصيدلية!');
      } else {
        showToast?.(`⚠️ لم يتم التسليم: ${data?.error || 'تأكد من اقتران واتساب الصيدلية أولاً'}`);
      }
    } catch (err) {
      showToast?.('تعذر إرسال الرسالة التجريبية لخادم الواتساب');
    } finally {
      setIsTestingCosmPhone(false);
    }
  };

  // ── 1. فحص حالة الاتصال واسترجاع الـ QR الخاص بجلسة هذا الفرع ───────────────
  const fetchWhatsAppStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await fetch(`${waServerUrl}/api/status?sessionId=${branchSessionId}`, {
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
  }, [waServerUrl, branchSessionId]);

  // فحص دوري كل 4 ثوانٍ عند انتظار مسح الـ QR أو دوري كل 25 ثانية
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

  // ── 2. إجراءات الخادم لجلسة هذا الفرع (إعادة تشغيل / فك الاقتران) ───────────
  const handleRestartServer = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${waServerUrl}/api/restart?sessionId=${branchSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json().catch(() => ({}));
      showToast?.(data.message || `تم إرسال أمر إعادة تشغيل واتساب فرع "${branch?.name || branchId}" بنجاح`);
      setTimeout(fetchWhatsAppStatus, 1500);
    } catch (err) {
      showToast?.('تعذر إعادة تشغيل الخادم');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogoutServer = async () => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في تسجيل الخروج من جلسة واتساب فرع "${branch?.name || branchId}"؟ لن تتأثر باقي الفروع إطلاقاً.`)) return;
    setIsActionLoading(true);
    try {
      await fetch(`${waServerUrl}/api/logout?sessionId=${branchSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      showToast?.('تم تسجيل الخروج بنجاح. يمكنك الآن مسح الـ QR بهاتف صيدلية آخر.');
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
        sessionId: branchSessionId,
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

                <span style={{
                  fontSize: '11px',
                  fontWeight: '800',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#ecfdf5',
                  color: '#065f46',
                  border: '1px solid #a7f3d0'
                }}>
                  📱 جلسة خاصة بالفرع ({branchSessionId})
                </span>
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

      {/* ── 1.5 بطاقات إعدادات وتوجيه إشعارات الواتساب الآلية (المشتريات & مستحضرات التجميل) ── */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #0d9488',
        borderRadius: '18px',
        padding: '20px 22px',
        boxShadow: '0 4px 18px rgba(13, 148, 136, 0.08)'
      }}>
        {/* ترويسة القسم وحالة صلاحيات التعديل */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#f0fdfa',
              color: '#0d9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(13, 148, 136, 0.15)'
            }}>
              <Sparkles size={24} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>توجيه إشعارات الواتساب الآلية للطلبات الجديدة</span>
                <span style={{ fontSize: '12px', color: '#0d9488', fontWeight: '800' }}>[فصل التجميل عن الأدوية 🎯]</span>
              </h4>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                توجيه طلبات الأدوية تلقائياً لإدارة المشتريات، وطلبات مستحضرات التجميل والعناية لمسؤول التجميل مع ضمان سرية بيانات العميل.
              </p>
            </div>
          </div>

          {/* شارة الصلاحيات الأمنية للمالك */}
          {isOwner ? (
            <span style={{
              background: '#dcfce7',
              color: '#15803d',
              border: '1px solid #86efac',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '900',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <ShieldCheck size={15} />
              <span>👑 صلاحية المالك: متاح لتعديل الأرقام وحفظها</span>
            </span>
          ) : (
            <span style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '900',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <Lock size={14} />
              <span>🔒 محمي: التعديل مقتصر على حساب المالك فقط</span>
            </span>
          )}
        </div>

        {/* شبكة البطاقتين: المشتريات + التجميل */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* البطاقة الأولى: إدارة المشتريات (الأدوية) */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💊</span>
                  <span>رقم مدير المشتريات (للأدوية)</span>
                </span>
                {procurementPhone && procurementPhone.length === 11 ? (
                  <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '800' }}>
                    ✓ جاهز
                  </span>
                ) : (
                  <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '800' }}>
                    ⚠️ غير محدد
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: '#64748b' }}>
                تصل إليه إشعارات طلبات الأدوية والنواقص العلاجية تلقائياً من جلسة الصيدلية.
              </p>

              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  value={procurementPhone}
                  onChange={(e) => isOwner && setProcurementPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  readOnly={!isOwner}
                  disabled={!isOwner}
                  placeholder="رقم هاتف المشتريات (01xxxxxxxxx)..."
                  className="outstock-form-input"
                  dir="ltr"
                  style={{
                    textAlign: 'right',
                    height: '42px',
                    fontWeight: 'bold',
                    background: isOwner ? '#ffffff' : '#f1f5f9',
                    cursor: isOwner ? 'text' : 'not-allowed',
                    borderColor: procurementPhone && procurementPhone.length !== 11 ? '#f87171' : undefined
                  }}
                />
                {!isOwner && (
                  <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <Lock size={15} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <button
                type="button"
                onClick={handleTestProcurementPhone}
                disabled={isTestingProcPhone || !procurementPhone || procurementPhone.length !== 11}
                className="outstock-btn outstock-btn-secondary"
                style={{ flex: '1', height: '36px', padding: '0 10px', fontSize: '12px', fontWeight: '700' }}
                title="إرسال رسالة تجريبية فورية للرقم للتحقق من الاتصال عبر واتساب الفرع"
              >
                <Send size={13} />
                <span>{isTestingProcPhone ? 'جاري الإرسال...' : 'اختبار اتصال المشتريات 🧪'}</span>
              </button>
            </div>
          </div>

          {/* البطاقة الثانية: مسؤول مستحضرات التجميل */}
          <div style={{
            background: '#fdf4ff',
            border: '1px solid #f0abfc',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#86198f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💄</span>
                  <span>رقم مسؤول مستحضرات التجميل</span>
                </span>
                {cosmeticsPhone && cosmeticsPhone.length === 11 ? (
                  <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '800' }}>
                    ✓ جاهز
                  </span>
                ) : (
                  <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '800' }}>
                    ⚠️ غير محدد
                  </span>
                )}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: '#a21caf' }}>
                تصل إليه حصرياً طلبات العملاء التي تحتوي على أصناف ومستحضرات تجميل وعناية.
              </p>

              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  value={cosmeticsPhone}
                  onChange={(e) => isOwner && setCosmeticsPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  readOnly={!isOwner}
                  disabled={!isOwner}
                  placeholder="رقم مسؤول التجميل (01xxxxxxxxx)..."
                  className="outstock-form-input"
                  dir="ltr"
                  style={{
                    textAlign: 'right',
                    height: '42px',
                    fontWeight: 'bold',
                    background: isOwner ? '#ffffff' : '#f1f5f9',
                    cursor: isOwner ? 'text' : 'not-allowed',
                    borderColor: cosmeticsPhone && cosmeticsPhone.length !== 11 ? '#f87171' : undefined
                  }}
                />
                {!isOwner && (
                  <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <Lock size={15} />
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <button
                type="button"
                onClick={handleTestCosmeticsPhone}
                disabled={isTestingCosmPhone || !cosmeticsPhone || cosmeticsPhone.length !== 11}
                className="outstock-btn outstock-btn-secondary"
                style={{ flex: '1', height: '36px', padding: '0 10px', fontSize: '12px', fontWeight: '700', borderColor: '#f0abfc', color: '#86198f' }}
                title="إرسال رسالة تجريبية فورية للرقم للتحقق من الاتصال عبر واتساب الفرع"
              >
                <Send size={13} />
                <span>{isTestingCosmPhone ? 'جاري الإرسال...' : 'اختبار اتصال التجميل 🧪'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* شريط الإجراءات وحفظ التعديلات للمالك */}
        {isOwner ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
            <button
              type="button"
              onClick={handleSaveRoutingPhones}
              disabled={isSavingPhones}
              className="outstock-btn outstock-btn-primary"
              style={{ height: '42px', padding: '0 24px', fontSize: '13.5px', fontWeight: '900' }}
            >
              <Check size={17} />
              <span>{isSavingPhones ? 'جاري الحفظ والتأمين...' : 'حفظ وتحديث أرقام التوجيه للمنظومة 💾'}</span>
            </button>
          </div>
        ) : (
          <div style={{
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <Lock size={14} style={{ color: '#dc2626' }} />
            <span>
              <strong>تنبيه أمني:</strong> تعديل أرقام هاتف إدارة المشتريات ومسؤول مستحضرات التجميل مقتصر حصرياً على حساب المالك لحماية مسارات توجيه طلبات الفروع.
            </span>
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

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
            {isCosmeticsOfficer && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRecipientType('cosmetics_promo');
                  if (cosmCustomers.length === 0) handleSearchCosmeticsCustomers('');
                }}
                className={`outstock-btn ${selectedRecipientType === 'cosmetics_promo' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
                style={{
                  flex: 1.2,
                  padding: '6px 8px',
                  fontSize: '12px',
                  background: selectedRecipientType === 'cosmetics_promo' ? 'linear-gradient(135deg, #db2777 0%, #be185d 100%)' : '#fdf2f8',
                  borderColor: '#f472b6',
                  color: selectedRecipientType === 'cosmetics_promo' ? '#ffffff' : '#be185d',
                  fontWeight: '900'
                }}
              >
                <span>🎯 تسويق مستحضرات التجميل 💄</span>
              </button>
            )}
          </div>

          {(isCosmeticsOfficer && selectedRecipientType === 'cosmetics_promo') ? (
            /* قسم استهداف عملاء مستحضرات التجميل */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="ابحث باسم صنف التجميل (سيروم، واقي شمس، لاروش...)"
                  value={cosmSearchTerm}
                  onChange={(e) => setCosmSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchCosmeticsCustomers(cosmSearchTerm)}
                  className="outstock-form-input"
                  style={{ fontSize: '12.5px', height: '36px' }}
                />
                <button
                  type="button"
                  onClick={() => handleSearchCosmeticsCustomers(cosmSearchTerm)}
                  disabled={isLoadingCosmCustomers}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ height: '36px', padding: '0 12px', fontSize: '12px', borderColor: '#f472b6', color: '#db2777' }}
                >
                  <Search size={14} />
                  <span>بحث</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b' }}>
                <span>العملاء الذين طلبوا مستحضرات تجميل ({cosmCustomers.length}):</span>
                {cosmCustomers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAllCosm}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#db2777',
                      fontWeight: '800',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      textDecoration: 'underline'
                    }}
                  >
                    {selectedCosmCustomerIds.length === cosmCustomers.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'} ({selectedCosmCustomerIds.length})
                  </button>
                )}
              </div>

              {isLoadingCosmCustomers ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                  جاري جلب عملاء مستحضرات التجميل...
                </div>
              ) : cosmCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                  لا يوجد عملاء اشتروا هذا الصنف التجميلي حتى الآن.
                </div>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px' }}>
                  {cosmCustomers.map((c) => {
                    const isChecked = selectedCosmCustomerIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        onClick={() => handleToggleSelectCosmCustomer(c.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: isChecked ? '#fdf2f8' : '#ffffff',
                          border: isChecked ? '1px solid #fbcfe8' : '1px solid transparent',
                          marginBottom: '3px',
                          fontSize: '12px'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by div
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '800', color: '#1e293b' }}>{c.full_name || 'عميل'}</div>
                          <div style={{ fontSize: '11px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                            {c.whatsapp_phone} {c.branch_name ? `• ${c.branch_name}` : ''}
                          </div>
                        </div>
                        <span style={{ fontSize: '10.5px', background: '#fae8ff', color: '#a21caf', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {c.total_cosmetics_orders || 1} طلب
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : selectedRecipientType === 'recent_orders' ? (
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

          {/* معاينة العميل المختار في الوضع الفردي */}
          {selectedRecipientType !== 'cosmetics_promo' && recipientPhone && (
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
            <Sparkles size={16} color={selectedRecipientType === 'cosmetics_promo' ? '#db2777' : '#0284c7'} />
            <span>
              {selectedRecipientType === 'cosmetics_promo'
                ? 'صياغة الحملة التسويقية لمستحضرات التجميل 💄'
                : 'صياغة رسالة الواتساب والقوالب الجاهزة'}
            </span>
          </div>

          {selectedRecipientType === 'cosmetics_promo' ? (
            /* محرر الحملات الترويجية لمستحضرات التجميل */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#fdf2f8', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fbcfe8', fontSize: '11.5px', color: '#9d174d' }}>
                💡 <strong>تلميح ذكي:</strong> يمكنك استخدام المتغير <code>{'{customer_name}'}</code> وسيتم استبداله باسم العميل الفعلي تلقائياً لكل محادثة.
              </div>

              <div>
                <label style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                  نص الحملة الترويجية:
                </label>
                <textarea
                  rows={6}
                  value={cosmPromoMessage}
                  onChange={(e) => setCosmPromoMessage(e.target.value)}
                  className="outstock-form-input"
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '12.5px',
                    lineHeight: 1.5,
                    borderRadius: '10px',
                    resize: 'vertical',
                    borderColor: '#f472b6'
                  }}
                />
              </div>

              {/* زر الإرسال الجماعي للتجميل */}
              <button
                type="button"
                onClick={handleSendCosmeticsPromoBulk}
                disabled={isSendingCosmPromo || selectedCosmCustomerIds.length === 0 || waState.status !== 'CONNECTED'}
                className="outstock-btn"
                style={{
                  background: 'linear-gradient(135deg, #db2777 0%, #be185d 100%)',
                  color: '#ffffff',
                  padding: '12px 18px',
                  borderRadius: '10px',
                  fontSize: '13.5px',
                  fontWeight: '900',
                  border: 'none',
                  cursor: isSendingCosmPromo || selectedCosmCustomerIds.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: (selectedCosmCustomerIds.length === 0 || waState.status !== 'CONNECTED') ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(219, 39, 119, 0.25)',
                  marginTop: 'auto'
                }}
              >
                <Send size={16} />
                <span>
                  {isSendingCosmPromo
                    ? 'جاري إرسال الحملة الترويجية...'
                    : `إرسال عرض ترويجي لواتساب كافة عملاء هذا الصنف دفعة واحدة 🚀 (${selectedCosmCustomerIds.length} عميل)`}
                </span>
              </button>
            </div>
          ) : (
            /* المحرر الفردي القياسي */
            <>
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

              {/* أزرار الإرسال الفردي */}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
