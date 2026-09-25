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
  Building2,
  FileText,
  Clock,
  ExternalLink,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Check,
  Truck,
  Package,
  Search,
  Users,
  AlertCircle,
  Copy
} from 'lucide-react';
import { getResolvedWhatsAppServerUrl } from '../../../utils/systemUrlHelper';
import { outstockGetBranches, outstockGetProcurementAggregated } from '../../../utils/outstockApiClient';

/**
 * ProcurementWhatsAppCenterTab.jsx
 * مركز اتصال الواتساب الخاص بإدارة المشتريات والتوريدات
 * يسمح لمدير المشتريات بـ:
 * 1. الربط بهاتف إدارة المشتريات عبر رمز الـ QR أو استخدام الخادم المشترك
 * 2. دليل هواتف كافة فروع الصيدليات مع إمكانية التعديل الفوري للأرقام
 * 3. إرسال إشعارات خروج شحنات النواقص، النواقص الحرجة، والبدائل المعتمدة
 * 4. إمكانية الإرسال لفرع محدد أو التعميم الجماعي لكافة الفروع بضغطة زر
 * 5. محاكاة فاصل زمني بشري (1.2 ثانية) لمنع حظر الرقم أثناء الإرسال الجماعي
 */
export default function ProcurementWhatsAppCenterTab({ currentOfficer = 'مسؤول المشتريات', showToast }) {
  // حالة خادم الواتساب
  const [waState, setWaState] = useState({
    status: 'CHECKING', // 'CHECKING' | 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
    phone: '',
    deviceName: '',
    qrCodeDataUrl: '',
    sentCount: 0,
    lastError: null
  });

  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // قائمة الفروع
  const [branches, setBranches] = useState([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchSearch, setBranchSearch] = useState('');

  // وضع الإرسال: لفرع محدد أو تعميم جماعي
  const [dispatchMode, setDispatchMode] = useState('single'); // 'single' | 'broadcast'
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);

  // بيانات التعديل الفوري لهاتف الفرع
  const [branchPhoneOverride, setBranchPhoneOverride] = useState('');

  // قالب الرسالة المختار
  const [selectedTemplate, setSelectedTemplate] = useState('shipment_dispatched'); // 'shipment_dispatched' | 'items_available' | 'market_shortage' | 'substitute_advice' | 'general_announcement'

  // حقول بيانات الشحنة / التوريد
  const [shipmentDetails, setShipmentDetails] = useState({
    driverName: '',
    driverPhone: '',
    deliveryReceiptNo: '',
    arrivalEstimate: 'خلال ساعتين',
    medicationsSummary: ''
  });

  // حقول النقص الحرج والبدائل
  const [shortageDetails, setShortageDetails] = useState({
    medicationName: '',
    suggestedSubstitute: '',
    expectedRestockDate: 'الأسبوع القادم',
    shortageReason: 'نقص عام من الشركة المصنعة'
  });

  // نص الرسالة القابل للتعديل
  const [customMessage, setCustomMessage] = useState('');

  // حالة الإرسال والتقدم
  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, currentTarget: '' });
  const [dispatchLog, setDispatchLog] = useState([]);

  // عنوان سيرفر الواتساب المعتمد
  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(), []);
  const procurementSessionId = 'procurement';

  // ── 1. جلب وفحص حالة خادم الواتساب الخاص بإدارة المشتريات ──────────────────
  const fetchWhatsAppStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await fetch(`${waServerUrl}/api/status?sessionId=${procurementSessionId}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json();
      setWaState({
        status: data.status || 'DISCONNECTED',
        phone: data.phone || '',
        deviceName: data.deviceName || '',
        qrCodeDataUrl: data.qrCodeDataUrl || '',
        sentCount: data.sentCount || 0,
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

  useEffect(() => {
    fetchWhatsAppStatus();
    const interval = setInterval(() => {
      fetchWhatsAppStatus(true);
    }, waState.status === 'QR_READY' ? 4000 : 25000);

    return () => clearInterval(interval);
  }, [fetchWhatsAppStatus, waState.status]);

  // ── 2. جلب فروع الصيدليات ──────────────────────────────────────────────────
  const fetchBranches = useCallback(async () => {
    setIsLoadingBranches(true);
    try {
      const res = await outstockGetBranches();
      if (res?.success && Array.isArray(res.branches)) {
        setBranches(res.branches);
        if (res.branches.length > 0) {
          const first = res.branches[0];
          setSelectedBranchId(first.id);
          setBranchPhoneOverride(first.phone || '');
          setSelectedBranchIds(res.branches.map(b => b.id));
        }
      }
    } catch (err) {
      console.warn('Fetch branches error:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // الفرع المختار حالياً
  const currentSelectedBranch = useMemo(() => {
    return branches.find(b => String(b.id) === String(selectedBranchId)) || null;
  }, [branches, selectedBranchId]);

  // تحديث هاتف الفرع عند تغيير الاختيار
  useEffect(() => {
    if (currentSelectedBranch) {
      setBranchPhoneOverride(currentSelectedBranch.phone || '');
    }
  }, [currentSelectedBranch]);

  // ── 3. قوالب الرسائل الاحترافية لمدير المشتريات ─────────────────────────────
  useEffect(() => {
    const bName = currentSelectedBranch?.name || 'الفرع';
    const dateStr = new Date().toLocaleDateString('ar-EG');
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    let msg = '';

    if (selectedTemplate === 'shipment_dispatched') {
      msg = `🚚 *إشعار شحن وتوريد نواقص أدوية إلى ${bName}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `تحية طيبة زملاءنا الأفاضل بصيدلية *${bName}*،\n` +
        `نفيدكم بخروج شحنة توريد النواقص المطلوبة لفرعكم وجاري التوصيل الآن.\n\n` +
        `📋 *بيانات الشحنة:*\n` +
        `• رقم إذن التوريد: *${shipmentDetails.deliveryReceiptNo || 'DISP-' + Math.floor(1000 + Math.random() * 9000)}*\n` +
        `• مندوب التوصيل: *${shipmentDetails.driverName || 'مندوب المشتريات'}*\n` +
        (shipmentDetails.driverPhone ? `• هاتف المندوب: ${shipmentDetails.driverPhone}\n` : '') +
        `• وقت الوصول المتوقع: *${shipmentDetails.arrivalEstimate || 'خلال ساعتين'}*\n` +
        (shipmentDetails.medicationsSummary ? `\n📦 *أبرز الأصناف المحملة:*\n${shipmentDetails.medicationsSummary}\n` : '') +
        `\nيرجى مطابقة الأصناف مع إذن الاستلام وتأكيد الاستلام فور وصول الشحنة.\n\n` +
        `مع تحيات إدارة المشتريات والتوريدات 🌸\n` +
        `📅 ${dateStr} - ⏰ ${timeStr}`;
    } else if (selectedTemplate === 'items_available') {
      msg = `📦 *إشعار توفير وتجهيز نواقص مطلوبة - صيدلية ${bName}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `الزملاء الصيادلة بفرع *${bName}*،\n` +
        `نود إبلاغكم بنجاح توفير أصناف النواقص التي تم تسجيلها لعملاء فرعكم عبر المنظومة.\n\n` +
        (shipmentDetails.medicationsSummary ? `💊 *الأصناف التي تم توفيرها:*\n${shipmentDetails.medicationsSummary}\n\n` : '') +
        `جاري إدراجها ضمن خطة الشحن والتوزيع للفرع.\n` +
        `يرجى مراجعة شاشة النواقص لتحديث حالة الطلبات.\n\n` +
        `إدارة المشتريات 🌸`;
    } else if (selectedTemplate === 'market_shortage') {
      msg = `⚠️ *تنبيه بنقص صنف دوائي حرج في السوق المصري*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `عناية السادة الصيادلة بفرع *${bName}*،\n` +
        `نحيطكم علماً بوجود نقص عام من الشركة الموردة في الصنف:\n` +
        `👉 *${shortageDetails.medicationName || 'الصنف الدوائي'}*\n` +
        `• سبب النقص: ${shortageDetails.shortageReason || 'نقص عام من المصدر'}\n` +
        `• موعد التوريد المتوقع: ${shortageDetails.expectedRestockDate || 'غير محدد حالياً'}\n\n` +
        (shortageDetails.suggestedSubstitute ? `💡 *البديل الموصى به طبياً (Drug Eye):*\n${shortageDetails.suggestedSubstitute}\n\n` : '') +
        `⚠️ يُرجى عدم إعطاء مواعيد قريبة للعملاء لحين التأكيد الرسمي من المشتريات.\n\n` +
        `إدارة المشتريات والتوريدات 🩺`;
    } else if (selectedTemplate === 'substitute_advice') {
      msg = `💡 *تعميم بدائل ومثائل معتمدة متاحة بالمخزن الرئيسي*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `الزملاء الأعزاء بفرع *${bName}*،\n` +
        `نظراً لنقص بعض الأصناف، نود إعلامكم بتوفر البدائل والمثائل المعتمدة التالية في المخزن الرئيسي وجاهزة للصرف:\n\n` +
        `• الصنف الناقص: *${shortageDetails.medicationName || 'الصنف الناقص'}*\n` +
        `• البديل المتاح: *${shortageDetails.suggestedSubstitute || 'البديل المعتمد بالاسم والتركيز'}*\n\n` +
        `يمكنكم عرض البديل المعتمد على المرضى لتلبية احتياجاتهم الطبية فوراً.\n\n` +
        `إدارة المشتريات والتوريدات ✨`;
    } else {
      msg = `📢 *تعميم إداري من إدارة المشتريات*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `إلى صيدلية *${bName}*،\n\n` +
        `نرجو من حضراتكم التكرم بمراجعة رصيد النواقص وتأكيد الطلبيات المعلقة قبل موعد التوريد.\n\n` +
        `شاكرين ومقدرين حسن تعاونكم الدائم.\n` +
        `إدارة المشتريات والتوريدات - ${currentOfficer}`;
    }

    setCustomMessage(msg);
  }, [selectedTemplate, currentSelectedBranch, shipmentDetails, shortageDetails, currentOfficer]);

  // ── 4. إجراءات الخادم لجلسة المشتريات (إعادة تشغيل / فك الاقتران) ────────
  const handleRestartServer = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${waServerUrl}/api/restart?sessionId=${procurementSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json().catch(() => ({}));
      showToast?.(data.message || 'تم إرسال أمر إعادة تشغيل واتساب المشتريات بنجاح');
      setTimeout(fetchWhatsAppStatus, 1500);
    } catch (err) {
      showToast?.('تعذر إعادة تشغيل الخادم');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogoutServer = async () => {
    if (!window.confirm('هل أنت متأكد من تسجيل الخروج وفك اقتران واتساب المشتريات؟ لن تتأثر باقي الفروع أو شؤون العاملين.')) return;
    setIsActionLoading(true);
    try {
      await fetch(`${waServerUrl}/api/logout?sessionId=${procurementSessionId}`, {
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

  // ── 5. إرسال الرسالة لفرع واحد أو تعميم جماعي لكافة الفروع ───────────────────
  const handleDispatch = async () => {
    if (!customMessage.trim()) {
      showToast?.('⚠️ يرجى كتابة نص الرسالة قبل الإرسال');
      return;
    }

    if (waState.status !== 'CONNECTED') {
      showToast?.('⚠️ خادم الواتساب غير متصل حالياً. يرجى مسح رمز الـ QR أو استخدام زر "الفتح عبر WhatsApp Web".');
      return;
    }

    // تحديد قائمة الفروع المستهدفة
    let targetBranches = [];
    if (dispatchMode === 'single') {
      if (!currentSelectedBranch) {
        showToast?.('⚠️ يرجى اختيار الفرع المستهدف');
        return;
      }
      const phoneToUse = (branchPhoneOverride || currentSelectedBranch.phone || '').trim();
      if (!phoneToUse) {
        showToast?.(`⚠️ لا يوجد رقم هاتف مسجل لفرع ${currentSelectedBranch.name}. يرجى إدخال الرقم.`);
        return;
      }
      targetBranches = [{ ...currentSelectedBranch, targetPhone: phoneToUse }];
    } else {
      targetBranches = branches
        .filter(b => selectedBranchIds.includes(b.id))
        .map(b => ({ ...b, targetPhone: (b.phone || '').trim() }))
        .filter(b => b.targetPhone.length >= 9);

      if (targetBranches.length === 0) {
        showToast?.('⚠️ لم يتم العثور على فروع بأرقام هواتف مسجلة ضمن الفروع المحددة');
        return;
      }
    }

    setIsSending(true);
    setSendProgress({ current: 0, total: targetBranches.length, currentTarget: '' });

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targetBranches.length; i++) {
      const b = targetBranches[i];
      let cleanPhone = b.targetPhone.replace(/\D/g, '');
      if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
        cleanPhone = '2' + cleanPhone;
      }

      setSendProgress({
        current: i + 1,
        total: targetBranches.length,
        currentTarget: b.name
      });

      // تخصيص نص الرسالة باسم الفرع تلقائياً في التعميم الجماعي
      let finalMsg = customMessage;
      if (dispatchMode === 'broadcast') {
        finalMsg = customMessage.replace(new RegExp(currentSelectedBranch?.name || 'الفرع', 'g'), b.name);
      }

      try {
        const res = await fetch(`${waServerUrl}/api/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({
            sessionId: procurementSessionId,
            phone: cleanPhone,
            message: finalMsg
          })
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          successCount++;
          setDispatchLog(prev => [
            {
              id: Date.now() + Math.random(),
              branchName: b.name,
              phone: cleanPhone,
              status: 'success',
              time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
            },
            ...prev
          ]);
        } else {
          failedCount++;
          setDispatchLog(prev => [
            {
              id: Date.now() + Math.random(),
              branchName: b.name,
              phone: cleanPhone,
              status: 'error',
              error: data.error || 'فشل الإرسال',
              time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
            },
            ...prev
          ]);
        }
      } catch (err) {
        failedCount++;
      }

      // فاصل زمني 1.2 ثانية بين الفروع لمنع خوارزميات الحظر
      if (i < targetBranches.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    setIsSending(false);
    fetchWhatsAppStatus(true);

    if (successCount > 0) {
      showToast?.(`✅ تم إرسال الرسائل بنجاح إلى ${successCount} فرع ${failedCount > 0 ? `(وتعذر ${failedCount})` : ''}`);
    } else {
      showToast?.('⚠️ تعذر إرسال الرسائل للفروع. يرجى التحقق من اتصال الخادم وأرقام الهواتف.');
    }
  };

  // فتح WhatsApp Web كبديل مباشر
  const handleOpenWhatsAppWeb = () => {
    let raw = (branchPhoneOverride || currentSelectedBranch?.phone || '').trim();
    let cleanPhone = raw.replace(/\D/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '2' + cleanPhone;
    }
    if (!cleanPhone) {
      showToast?.('⚠️ يرجى إدخال رقم هاتف الفرع أولاً');
      return;
    }

    const url = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(customMessage)}`;
    window.open(url, '_blank');
  };

  // تصفية الفروع بالبحث
  const filteredBranches = useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(b =>
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.phone && b.phone.includes(q)) ||
      (b.address && b.address.toLowerCase().includes(q))
    );
  }, [branches, branchSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── 1. بطاقة حالة خادم الواتساب والربط بالـ QR ── */}
      <div style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: '16px',
        padding: '16px 20px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: waState.status === 'CONNECTED' ? '#dcfce7' : waState.status === 'QR_READY' ? '#fef3c7' : '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: waState.status === 'CONNECTED' ? '#15803d' : waState.status === 'QR_READY' ? '#b45309' : '#dc2626'
          }}>
            <MessageSquare size={24} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                مركز واتساب إدارة المشتريات والتوريدات
              </h3>
              <span style={{
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: '800',
                background: waState.status === 'CONNECTED' ? '#ecfdf5' : waState.status === 'QR_READY' ? '#fffbeb' : '#fef2f2',
                color: waState.status === 'CONNECTED' ? '#065f46' : waState.status === 'QR_READY' ? '#92400e' : '#991b1b',
                border: `1px solid ${waState.status === 'CONNECTED' ? '#a7f3d0' : waState.status === 'QR_READY' ? '#fde68a' : '#fecaca'}`
              }}>
                {waState.status === 'CONNECTED' ? '● متصل ومقترن بالهاتف' : waState.status === 'QR_READY' ? '⏳ بانتظار مسح الـ QR' : '○ غير متصل'}
              </span>

              <span style={{
                fontSize: '11px',
                fontWeight: '800',
                padding: '3px 10px',
                borderRadius: '12px',
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe'
              }}>
                📱 جلسة مستقلة للمشتريات (procurement)
              </span>
            </div>

            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>
              {waState.status === 'CONNECTED'
                ? `الهاتف المقترن: ${waState.phone || 'هاتف المشتريات'} (${waState.deviceName || 'WhatsApp Web'}) - تم إرسال ${waState.sentCount} رسالة`
                : 'امسح رمز الاستجابة السريعة (QR) بهاتف المشتريات لإرسال الرسائل تلقائياً لكافة هواتف الفروع'}
            </p>
          </div>
        </div>

        {/* أزرار التحكم بالخادم */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={() => fetchWhatsAppStatus(false)}
            disabled={isLoadingStatus}
            style={{ padding: '7px 12px', fontSize: '12px' }}
            title="تحديث حالة الاتصال اللحظية"
          >
            <RefreshCw size={13} className={isLoadingStatus ? 'outstock-spin' : ''} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={handleRestartServer}
            disabled={isActionLoading}
            style={{ padding: '7px 12px', fontSize: '12px' }}
            title="إعادة تشغيل محرك الواتساب في حال التعليق"
          >
            <Power size={13} />
            <span>إعادة تشغيل</span>
          </button>

          {waState.status === 'CONNECTED' && (
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleLogoutServer}
              disabled={isActionLoading}
              style={{ padding: '7px 12px', fontSize: '12px', color: '#dc2626' }}
              title="فك الاقتران والربط برقم آخر"
            >
              <span>فك الاقتران</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. نافذة الـ QR المباشر إذا كان الخادم بانتظار الاقتران ── */}
      {waState.status === 'QR_READY' && waState.qrCodeDataUrl && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
          border: '2px dashed #059669',
          borderRadius: '16px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: '800', fontSize: '15px' }}>
            <QrCode size={20} />
            <span>امسح رمز الـ QR بهاتف إدارة المشتريات لربط النظام فوراً</span>
          </div>

          <div style={{
            background: '#ffffff',
            padding: '12px',
            borderRadius: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0'
          }}>
            <img
              src={waState.qrCodeDataUrl}
              alt="WhatsApp QR Code"
              style={{ width: '220px', height: '220px', display: 'block', borderRadius: '8px' }}
            />
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: '#475569', maxWidth: '440px' }}>
            افتح تطبيق واتساب على الهاتف ⟵ الإعدادات (أو النقاط الثلاث) ⟵ <strong>الأجهزة المرتبطة</strong> ⟵ <strong>ربط جهاز</strong> ⟵ وجه الكاميرا نحو الرمز أعلاه.
          </p>
        </div>
      )}

      {/* ── 3. جسم الشاشة: دليل الفروع على اليمين + صياغة الرسائل على اليسار ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* العمود الأيمن: دليل هواتف الفروع واختيار المستهدف */}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={16} color="#0d9488" />
              <span>دليل هواتف فروع الصيدليات</span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0d9488', background: '#ecfdf5', padding: '2px 8px', borderRadius: '8px' }}>
              {branches.length} فروع مسجلة
            </span>
          </div>

          {/* تبديل نمط الإرسال (فرع محدد vs تعميم جماعي) */}
          <div style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '10px'
          }}>
            <button
              type="button"
              onClick={() => setDispatchMode('single')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                background: dispatchMode === 'single' ? '#ffffff' : 'transparent',
                color: dispatchMode === 'single' ? '#0d9488' : '#64748b',
                boxShadow: dispatchMode === 'single' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              فرع محدد 🎯
            </button>
            <button
              type="button"
              onClick={() => setDispatchMode('broadcast')}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                background: dispatchMode === 'broadcast' ? '#ffffff' : 'transparent',
                color: dispatchMode === 'broadcast' ? '#0d9488' : '#64748b',
                boxShadow: dispatchMode === 'broadcast' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              تعميم جماعي لكافة الفروع 📢
            </button>
          </div>

          {/* حقل البحث في الفروع */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 ابحث باسم الفرع أو رقم الهاتف..."
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              className="outstock-form-input"
              style={{ paddingRight: '12px', fontSize: '12px', minHeight: '34px' }}
            />
          </div>

          {/* قائمة الفروع */}
          <div style={{
            maxHeight: '340px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {isLoadingBranches ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>
                جاري تحميل الفروع...
              </div>
            ) : filteredBranches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>
                لم يتم العثور على فروع مطابقة للبحث
              </div>
            ) : (
              filteredBranches.map(branch => {
                const isSelected = dispatchMode === 'single'
                  ? String(branch.id) === String(selectedBranchId)
                  : selectedBranchIds.includes(branch.id);

                return (
                  <div
                    key={branch.id}
                    onClick={() => {
                      if (dispatchMode === 'single') {
                        setSelectedBranchId(branch.id);
                      } else {
                        setSelectedBranchIds(prev =>
                          prev.includes(branch.id) ? prev.filter(id => id !== branch.id) : [...prev, branch.id]
                        );
                      }
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${isSelected ? '#0d9488' : '#e2e8f0'}`,
                      background: isSelected ? '#f0fdfa' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {dispatchMode === 'broadcast' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                        )}
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>{branch.name}</strong>
                      </div>
                      <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                        {branch.branchCode || branch.code || ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11.5px' }}>
                      <span style={{ color: branch.phone ? '#059669' : '#dc2626', fontWeight: 'bold' }} dir="ltr">
                        {branch.phone || '⚠️ لا يوجد رقم هاتف'}
                      </span>
                      {branch.address && (
                        <span style={{ color: '#64748b', fontSize: '11px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {branch.address}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* تعديل هاتف الفرع الفوري في وضع الفرع الفردي */}
          {dispatchMode === 'single' && currentSelectedBranch && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <label style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#475569' }}>
                رقم واتساب الفرع المستهدف للإرسال:
              </label>
              <input
                type="tel"
                placeholder="01xxxxxxxxx"
                value={branchPhoneOverride}
                onChange={(e) => setBranchPhoneOverride(e.target.value)}
                className="outstock-form-input"
                dir="ltr"
                style={{ textAlign: 'right', fontSize: '13px', minHeight: '36px' }}
              />
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                يمكنك كتابة رقم مباشر أو رقم هاتف مدير الفرع.
              </span>
            </div>
          )}

          {/* ملخص الإرسال الجماعي */}
          {dispatchMode === 'broadcast' && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#1e40af'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '4px' }}>
                <span>الفروع المحددة للإرسال:</span>
                <span>{selectedBranchIds.length} من {branches.length} فرع</span>
              </div>
              <p style={{ margin: 0, fontSize: '11px' }}>
                ⚡ يتم الإرسال المتتابع مع فاصل 1.2 ثانية بين كل فرع لمنع قيود الواتساب.
              </p>
            </div>
          )}
        </div>

        {/* العمود الأيسر: اختيار القالب وصياغة الرسالة والتنفيذ */}
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          padding: '18px 20px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={18} color="#0284c7" />
              <span>صياغة رسالة المشتريات والقوالب الجاهزة</span>
            </div>

            <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: 'bold' }}>
              {dispatchMode === 'single' ? `المستلم: صيدلية ${currentSelectedBranch?.name || ''}` : `تعميم إلى ${selectedBranchIds.length} فروع`}
            </div>
          </div>

          {/* نوع الإشعار */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>
              اختر نوع الإشعار التلقائي للمشتريات:
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="outstock-form-select"
              style={{ fontSize: '13px', fontWeight: '700', minHeight: '40px' }}
            >
              <option value="shipment_dispatched">🚚 إشعار خروج شحنة توريد نواقص أدوية للفرع</option>
              <option value="items_available">📦 إشعار توفير وتجهيز نواقص مطلوبة لفرعكم</option>
              <option value="market_shortage">⚠️ تنبيه بنقص صنف دوائي حرج في السوق المصري</option>
              <option value="substitute_advice">💡 تعميم بدائل ومثائل معتمدة (Drug Eye) متاحة بالمخزن</option>
              <option value="general_announcement">📢 تعميم إداري دوري لجميع فروع الصيدليات</option>
            </select>
          </div>

          {/* حقول مساعدة بحسب القالب */}
          {selectedTemplate === 'shipment_dispatched' && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '10px'
            }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  اسم مندوب الشحن:
                </label>
                <input
                  type="text"
                  placeholder="مثال: كابتن أحمد محمود"
                  value={shipmentDetails.driverName}
                  onChange={(e) => setShipmentDetails(prev => ({ ...prev, driverName: e.target.value }))}
                  className="outstock-form-input"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  هاتف المندوب:
                </label>
                <input
                  type="tel"
                  placeholder="01xxxxxxxxx"
                  value={shipmentDetails.driverPhone}
                  onChange={(e) => setShipmentDetails(prev => ({ ...prev, driverPhone: e.target.value }))}
                  className="outstock-form-input"
                  dir="ltr"
                  style={{ minHeight: '34px', fontSize: '12px', textAlign: 'right' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  وقت الوصول المتوقع:
                </label>
                <input
                  type="text"
                  placeholder="مثال: خلال ساعتين / الساعة 4 مساءً"
                  value={shipmentDetails.arrivalEstimate}
                  onChange={(e) => setShipmentDetails(prev => ({ ...prev, arrivalEstimate: e.target.value }))}
                  className="outstock-form-input"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                />
              </div>

              <div style={{ gridColumn: 'span 3' }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  ملخص الأصناف المحملة في هذه الشحنة:
                </label>
                <input
                  type="text"
                  placeholder="مثال: 5 علب كونكور 5 مجم + 3 علب جانوميت 50/1000 + 4 علب أوجمنتين 1 جم"
                  value={shipmentDetails.medicationsSummary}
                  onChange={(e) => setShipmentDetails(prev => ({ ...prev, medicationsSummary: e.target.value }))}
                  className="outstock-form-input"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                />
              </div>
            </div>
          )}

          {(selectedTemplate === 'market_shortage' || selectedTemplate === 'substitute_advice') && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px'
            }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  اسم الصنف الدوائي:
                </label>
                <input
                  type="text"
                  placeholder="مثال: بنادول أزرق أقراص / كليكسان 40"
                  value={shortageDetails.medicationName}
                  onChange={(e) => setShortageDetails(prev => ({ ...prev, medicationName: e.target.value }))}
                  className="outstock-form-input"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>
                  البديل أو المثيل المعتمد (Drug Eye):
                </label>
                <input
                  type="text"
                  placeholder="مثال: بارامول 500 مجم / إنوكسا 40"
                  value={shortageDetails.suggestedSubstitute}
                  onChange={(e) => setShortageDetails(prev => ({ ...prev, suggestedSubstitute: e.target.value }))}
                  className="outstock-form-input"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                />
              </div>
            </div>
          )}

          {/* محرر الرسالة المباشر */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>
              معاينة وتعديل نص الرسالة قبل الإرسال:
            </label>
            <textarea
              rows={8}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="outstock-form-input"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '13px',
                lineHeight: 1.5,
                borderRadius: '10px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* مؤشر تقدم الإرسال المتتابع */}
          {isSending && (
            <div style={{
              background: '#ecfdf5',
              border: '1px solid #86efac',
              borderRadius: '10px',
              padding: '12px 14px',
              color: '#065f46'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', marginBottom: '6px' }}>
                <span>جاري الإرسال للفروع...</span>
                <span>{sendProgress.current} من {sendProgress.total}</span>
              </div>
              <div style={{ height: '6px', background: '#bbf7d0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: '#059669',
                  width: `${(sendProgress.current / (sendProgress.total || 1)) * 100}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <small style={{ fontSize: '11px', display: 'block', marginTop: '4px' }}>
                المستهدف الحالي: {sendProgress.currentTarget}
              </small>
            </div>
          )}

          {/* أزرار الإجراءات */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
            <button
              type="button"
              onClick={handleDispatch}
              disabled={isSending || waState.status !== 'CONNECTED'}
              className="outstock-btn outstock-btn-whatsapp"
              style={{
                flex: 1,
                padding: '11px 18px',
                fontSize: '13.5px',
                fontWeight: '800',
                opacity: waState.status !== 'CONNECTED' ? 0.6 : 1
              }}
            >
              <Send size={16} />
              <span>
                {isSending
                  ? 'جاري الإرسال المتتابع...'
                  : dispatchMode === 'single'
                  ? 'إرسال لهاتف الفرع عبر خادم الواتساب ⚡'
                  : `إرسال تعميم لكافة الفروع المحددة (${selectedBranchIds.length}) 📢`}
              </span>
            </button>

            {dispatchMode === 'single' && (
              <button
                type="button"
                onClick={handleOpenWhatsAppWeb}
                className="outstock-btn outstock-btn-secondary"
                style={{ padding: '11px 16px', fontSize: '13px' }}
                title="فتح المحادثة مباشرة في تطبيق أو موقع WhatsApp Web"
              >
                <ExternalLink size={15} />
                <span>WhatsApp Web</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. سجل إرسال الرسائل الحية لهذه الجلسة ── */}
      {dispatchLog.length > 0 && (
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
        }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>
            سجل الرسائل المرسلة لهواتف الفروع في هذه الجلسة ({dispatchLog.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {dispatchLog.map(item => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: item.status === 'success' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${item.status === 'success' ? '#bbf7d0' : '#fecaca'}`,
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {item.status === 'success' ? <CheckCircle2 size={15} color="#15803d" /> : <AlertCircle size={15} color="#dc2626" />}
                  <strong>{item.branchName}</strong>
                  <span dir="ltr" style={{ color: '#64748b' }}>({item.phone})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: item.status === 'success' ? '#15803d' : '#dc2626', fontWeight: 'bold' }}>
                    {item.status === 'success' ? 'تم الإرسال بنجاح' : `فشل: ${item.error || ''}`}
                  </span>
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
