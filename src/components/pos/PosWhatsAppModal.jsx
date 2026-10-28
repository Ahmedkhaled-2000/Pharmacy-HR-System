import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { getWhatsAppServerUrl } from '../../utils/systemUrlHelper';
import {
  MessageSquare,
  Send,
  X,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  RefreshCw,
  QrCode,
  Sparkles,
  Bike,
  Clock,
  User,
  ShieldCheck,
  Check,
  Power,
  LogOut,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';

export default function PosWhatsAppModal() {
  const { isWhatsAppModalOpen, setIsWhatsAppModalOpen, salesWindows, activeWindowId } = usePOS();
  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const { state } = useData?.() || {};
  const { showToast, showConfirm } = useUI?.() || {};

  // خادم الواتساب ومعرف الجلسة للفرع
  const waServerUrl = useMemo(() => getWhatsAppServerUrl(state), [state]);
  const branchSessionId = useMemo(() => `branch_${currentBranch?.id || 'main'}`, [currentBranch?.id]);

  // حالة الاتصال والـ QR
  const [waState, setWaState] = useState({
    status: 'CONNECTING', // 'CONNECTED' | 'QR_READY' | 'CONNECTING' | 'DISCONNECTED'
    phone: '',
    deviceName: '',
    qrCodeDataUrl: '',
    sentCount: 0,
    lastError: null
  });
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // التبويبات والمراسلة
  const [activeTab, setActiveTab] = useState('receipt'); // 'qr' | 'receipt' | 'chronic' | 'delivery' | 'custom'
  const [recipientPhone, setRecipientPhone] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // جلب بيانات الفاتورة النشطة الحالية لتجهيز رسالة الريسيت التلقائية
  const activeWin = salesWindows.find((w) => w.id === activeWindowId) || salesWindows[0];
  const activeCustomer = activeWin?.customer;

  useEffect(() => {
    if (activeCustomer?.phone) {
      setRecipientPhone(activeCustomer.phone);
    }
  }, [activeCustomer]);

  // ── 1. فحص حالة الاتصال واسترجاع الـ QR Code الخاص بفرع الصيدلية ──
  const fetchWhatsAppStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingStatus(true);
    try {
      const res = await fetch(`${waServerUrl}/api/status?sessionId=${branchSessionId}`, {
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      if (res.ok) {
        const data = await res.json();
        setWaState({
          status: data.status || 'DISCONNECTED',
          phone: data.phone || '',
          deviceName: data.deviceName || '',
          qrCodeDataUrl: data.qrCodeDataUrl || '',
          sentCount: data.sentCount || 0,
          lastError: data.lastError || null
        });

        // إذا كان السيرفر بانتظار مسح الـ QR ولم نكن في تبويب QR، وجه الصيدلي للـ QR
        if (data.status === 'QR_READY' && data.qrCodeDataUrl && !silent) {
          setActiveTab('qr');
        }
      } else {
        setWaState((prev) => ({
          ...prev,
          status: 'DISCONNECTED',
          lastError: 'استجابة غير صالحة من السيرفر'
        }));
      }
    } catch (err) {
      setWaState((prev) => ({
        ...prev,
        status: 'DISCONNECTED',
        lastError: 'تعذر الاتصال بخادم الواتساب'
      }));
    } finally {
      if (!silent) setIsLoadingStatus(false);
    }
  }, [waServerUrl, branchSessionId]);

  // فحص دوري عند فتح المودال
  useEffect(() => {
    if (!isWhatsAppModalOpen) return;
    fetchWhatsAppStatus();
    const interval = setInterval(() => {
      fetchWhatsAppStatus(true);
    }, waState.status === 'QR_READY' ? 3500 : 12000);

    return () => clearInterval(interval);
  }, [isWhatsAppModalOpen, fetchWhatsAppStatus, waState.status]);

  // ── 2. إجراءات إدارة خادم الواتساب (إعادة تشغيل / تصفير / فك اقتران) ──
  const handleRestartServer = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${waServerUrl}/api/restart?sessionId=${branchSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      const data = await res.json().catch(() => ({}));
      showToast?.(data.message || '⚡ تم إرسال أمر إعادة تشغيل جلسة واتساب الفرع بنجاح');
      setTimeout(() => fetchWhatsAppStatus(false), 2000);
    } catch {
      showToast?.('❌ تعذر إرسال أمر إعادة التشغيل للخادم');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForceReset = async () => {
    setIsActionLoading(true);
    try {
      await fetch(`${waServerUrl}/api/force-reset?sessionId=${branchSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      showToast?.('🔄 تم تصفير الجلسة وتوليد رمز QR جديد...');
      setActiveTab('qr');
      setTimeout(() => fetchWhatsAppStatus(false), 1500);
    } catch {
      showToast?.('❌ تعذر تصفير الجلسة');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogoutServer = async () => {
    const confirmLogout = showConfirm
      ? await showConfirm({
          title: 'فك ارتباط واتساب الفرع',
          message: `هل أنت متأكد من فك ارتباط جلسة واتساب فرع [${currentBranch?.name || 'الفرع'}]؟ يمكنك بعدها مسح الـ QR بهاتف صيدلية آخر.`,
          confirmText: 'نعم، فك الارتباط',
          type: 'danger'
        })
      : window.confirm('هل أنت متأكد من فك ارتباط جلسة واتساب الفرع؟');

    if (!confirmLogout) return;

    setIsActionLoading(true);
    try {
      await fetch(`${waServerUrl}/api/logout?sessionId=${branchSessionId}`, {
        method: 'POST',
        headers: { 'bypass-tunnel-reminder': 'true' }
      });
      showToast?.('✓ تم تسجيل الخروج وفك الارتباط بنجاح. يمكنك الآن مسح الـ QR بهاتف آخر.');
      setActiveTab('qr');
      setTimeout(() => fetchWhatsAppStatus(false), 1500);
    } catch {
      showToast?.('❌ تعذر فك الارتباط');
    } finally {
      setIsActionLoading(false);
    }
  };

  // ── 3. إرسال الرسائل الفورية للعميل ──
  const handleSendInstantMessage = async (type) => {
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showToast?.('⚠️ يرجى إدخال رقم هاتف واتساب صحيح مكون من 11 رقماً');
      return;
    }

    setIsSending(true);
    try {
      let messageContent = customMessage;

      if (type === 'receipt') {
        const itemsList = (activeWin?.cart || [])
          .map((it, idx) => `${idx + 1}. ${it.tradeNameAr || it.tradeNameEn} (×${it.quantity} ${it.unitLabel}) = ${it.lineTotal.toFixed(2)} ج`)
          .join('\n');
        const netTotal = (activeWin?.cart || []).reduce((s, it) => s + (it.lineTotal || 0), 0);

        messageContent = `*مجموعة صيدليات المروة - ${currentBranch?.name || 'الفرع الرئيسي'}* 🏥\n` +
          `عزيزي العميل: *${activeCustomer?.name || 'المحترم'}* 🌷\n` +
          `نشكرك لزيارتنا! إليك تفاصيل فاتورة الشراء الإلكترونية:\n` +
          `──────────────────\n` +
          `${itemsList || 'مبيعات صيدلانية معتمدة'}\n` +
          `──────────────────\n` +
          `💰 *الصافي المطلوب:* ${netTotal.toFixed(2)} جنيه\n` +
          `صيدلي الكاشير: د. ${currentEmpUser?.name || 'صيدلي الفرع'}\n` +
          `نتمنى لكم دوام الصحة والعافية! 💊✨`;
      } else if (type === 'chronic') {
        messageContent = `*تذكير بموعد تجديد العلاج الشهري* 🩺\n` +
          `عزيزي العميل: *${activeCustomer?.name || 'المحترم'}* 🌸\n` +
          `نحيط سيادتكم علماً باقتراب موعد صرف جرعتك الشهرية من أدوية الأمراض المزمنة لدى *${currentBranch?.name || 'صيدليتنا'}*.\n` +
          `تم تجهيز جرعتك وحجزها بالفرع لتسهيل استلامها أو طلب توصيلها مجاناً إلى منزلك 🛵.\n` +
          `للتواصل المباشر مع صيدلي الفرع: ${waState.phone || 'هاتف الفرع'}`;
      } else if (type === 'delivery') {
        messageContent = `*إشعار خروج أوردر دليفري* 🛵\n` +
          `عزيزي العميل، تم تجهيز طلبيتك بنجاح وهي الآن مع كابتن التوصيل في طريقها إليك.\n` +
          `قيمة الأوردر: *${((activeWin?.cart || []).reduce((s, it) => s + (it.lineTotal || 0), 0)).toFixed(2)} ج*\n` +
          `شكراً لثقتكم في صيدليات المروة! ✨`;
      }

      const formattedPhone = cleanPhone.startsWith('2') ? cleanPhone : `2${cleanPhone}`;

      // 1. محاولة الإرسال عبر البوابة المباشرة
      let sentSuccess = false;
      try {
        const res = await fetch(`${waServerUrl}/api/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': branchSessionId
          },
          body: JSON.stringify({
            phone: formattedPhone,
            message: messageContent,
            sessionId: branchSessionId
          })
        });
        if (res.ok) sentSuccess = true;
      } catch {}

      // 2. Fallback عبر API المحلي
      if (!sentSuccess) {
        await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formattedPhone,
            message: messageContent,
            branchId: currentBranch?.id || 'main'
          })
        }).catch(() => null);
      }

      showToast?.(`✅ تم إرسال رسالة الواتساب الفورية بنجاح إلى [${cleanPhone}] 📲`);
      setIsWhatsAppModalOpen(false);
    } catch {
      showToast?.('❌ حدث خطأ أثناء إرسال رسالة الواتساب');
    } finally {
      setIsSending(false);
    }
  };

  if (!isWhatsAppModalOpen) return null;

  const isConnected = waState.status === 'CONNECTED';
  const isQrReady = waState.status === 'QR_READY' && Boolean(waState.qrCodeDataUrl);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 2300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '92%',
          maxWidth: '620px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
          border: '1.5px solid #cbd5e1',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* رأس النافذة */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: '#ffffff',
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
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}
            >
              💬
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900 }}>
                مركز واتساب الفرع لخدمة العملاء والربط
              </h3>
              <div style={{ fontSize: '11px', opacity: 0.95, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isConnected ? '#4ade80' : isQrReady ? '#facc15' : '#f87171',
                    boxShadow: isConnected ? '0 0 8px #4ade80' : 'none'
                  }}
                />
                <span>
                  {isConnected
                    ? `متصل بالرقم (+${waState.phone || 'هاتف الفرع'})`
                    : isQrReady
                    ? 'جاهز للمسح والربط (امسح كود QR)'
                    : waState.status === 'CONNECTING'
                    ? 'جاري الاتصال بالسيرفر...'
                    : 'سيرفر الواتساب غير متصل'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => fetchWhatsAppStatus(false)}
              disabled={isLoadingStatus}
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 800
              }}
              title="فحص الاتصال وتحديث الحالة"
            >
              <RefreshCw size={13} style={{ animation: isLoadingStatus ? 'spin 1s linear infinite' : 'none' }} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={() => setIsWhatsAppModalOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: 'none',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* جسم النافذة والتمرير */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
          {/* تبويبات مركز الواتساب */}
          <div style={{ display: 'flex', gap: '5px', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            {[
              { id: 'qr', label: isConnected ? '📱 إدارة الربط' : '📲 ربط QR', highlight: isQrReady },
              { id: 'receipt', label: '📄 ريسيت إلكتروني' },
              { id: 'chronic', label: '🩺 تذكير مزمن' },
              { id: 'delivery', label: '🛵 دليفري' },
              { id: 'custom', label: '✍️ رسالة حرة' }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '9px',
                    border: 'none',
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#059669' : tab.highlight ? '#d97706' : '#475569',
                    fontWeight: 900,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  {tab.label}
                  {tab.highlight && !isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#f59e0b'
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── 1. تبويب ربط واتساب وعرض الـ QR ── */}
          {activeTab === 'qr' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* حالة الاتصال القائمة */}
              {isConnected ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: '#dcfce7',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px auto'
                    }}
                  >
                    <CheckCircle2 size={28} />
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 900, color: '#166534' }}>
                    واتساب الفرع متصل ومقترن بنجاح! 🚀
                  </h4>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#15803d' }}>
                    الرقم المقترن: <strong style={{ direction: 'ltr', display: 'inline-block' }}>+{waState.phone}</strong> • الجهاز: {waState.deviceName || 'WhatsApp Linked'}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleRestartServer}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: '#ffffff',
                        border: '1px solid #86efac',
                        color: '#15803d',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <RefreshCw size={13} />
                      إعادة تشغيل الجلسة
                    </button>

                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleLogoutServer}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <LogOut size={13} />
                      فك الاقتران وربط هاتف آخر
                    </button>
                  </div>
                </div>
              ) : isQrReady ? (
                /* عرض الـ QR الفعلي للمسح */
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1.5px dashed #f59e0b',
                    borderRadius: '16px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '10px',
                      borderRadius: '14px',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
                      border: '1px solid #fef3c7'
                    }}
                  >
                    <img
                      src={waState.qrCodeDataUrl}
                      alt="WhatsApp QR Code"
                      style={{ width: '190px', height: '190px', display: 'block', borderRadius: '8px' }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 900, color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Smartphone size={17} />
                      <span>امسح الرمز لربط واتساب الفرع:</span>
                    </h4>
                    <ol style={{ margin: 0, paddingRight: '18px', fontSize: '11.5px', color: '#78350f', lineHeight: 1.7 }}>
                      <li>افتح تطبيق <strong>WhatsApp</strong> على هاتف الصيدلية.</li>
                      <li>اضغط على <strong>القائمة (⋮)</strong> ➔ <strong>الأجهزة المرتبطة</strong>.</li>
                      <li>اضغط على <strong>ربط جهاز (Link a Device)</strong>.</li>
                      <li>وجّه كاميرا الهاتف نحو كود الـ QR وسيتم الاقتران فورياً.</li>
                    </ol>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={handleForceReset}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: '#ffffff',
                          border: '1px solid #d97706',
                          color: '#b45309',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RefreshCw size={12} />
                        تحديث رمز الـ QR
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* حالة عدم الاتصال بالسيرفر أو انقطاعه */
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: '#fee2e2',
                      color: '#dc2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px auto'
                    }}
                  >
                    <Power size={22} />
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '14.5px', fontWeight: 900, color: '#0f172a' }}>
                    جاري إيقاظ وتشغيل خادم الواتساب...
                  </h4>
                  <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                    الخادم يعمل على المنفذ 3100. يمكنك محاولة إعادة تشغيله فورياً بالزر أدناه:
                  </p>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleRestartServer}
                      style={{
                        padding: '9px 16px',
                        borderRadius: '9px',
                        background: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                      }}
                    >
                      <Power size={14} />
                      تشغيل / إعادة تشغيل السيرفر ⚡
                    </button>
                    <button
                      type="button"
                      disabled={isActionLoading}
                      onClick={handleForceReset}
                      style={{
                        padding: '9px 14px',
                        borderRadius: '9px',
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      توليد QR فوري 📸
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 2. تبويبات الرسائل (ريسيت، تذكير، دليفري، حرة) ── */}
          {activeTab !== 'qr' && (
            <>
              {/* رقم هاتف العميل المستلم */}
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                  رقم واتساب العميل المستلم (11 رقماً):
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    placeholder="010XXXXXXXX أو 011 / 012 / 015..."
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 800,
                      direction: 'ltr',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                      outline: 'none'
                    }}
                  />
                  <Phone
                    size={16}
                    color="#64748b"
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                </div>
                {activeCustomer?.name && (
                  <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '3px' }}>
                    ✓ العميل المرتبط: {activeCustomer.name}
                  </div>
                )}
              </div>

              {/* معاينة نص الرسالة */}
              {activeTab === 'custom' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#334155', marginBottom: '4px' }}>
                    نص الرسالة المخصصة:
                  </label>
                  <textarea
                    rows={4}
                    placeholder="اكتب رسالتك للعميل هنا..."
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '12.5px',
                      boxSizing: 'border-box',
                      resize: 'none'
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '12px',
                    padding: '12px',
                    fontSize: '11.5px',
                    color: '#334155',
                    lineHeight: 1.6
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#059669', marginBottom: '4px' }}>معاينة قالب الرسالة التلقائية:</div>
                  {activeTab === 'receipt' && (
                    <div>
                      📄 سيتم إرسال فاتورة إلكترونية مفصلة بكافة الأصناف المباعة، الصافي المطلوب، واسم الصيدلي المسؤول.
                    </div>
                  )}
                  {activeTab === 'chronic' && (
                    <div>
                      🩺 رسالة تذكيرية رسمية للعميل بميعاد تجديد علاجه المزمن المحجوز له في الفرع وتوفير خدمة التوصيل.
                    </div>
                  )}
                  {activeTab === 'delivery' && (
                    <div>
                      🛵 إشعار فوري بأن الطلبية في الطريق مع كابتن الدليفري مرفقاً بها رقم الفاتورة والمبلغ المطلوب تحصيله.
                    </div>
                  )}
                </div>
              )}

              {/* زر الإرسال الفوري */}
              <button
                type="button"
                disabled={isSending || !recipientPhone}
                onClick={() => handleSendInstantMessage(activeTab)}
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: isSending || !recipientPhone ? 'not-allowed' : 'pointer',
                  opacity: isSending || !recipientPhone ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)'
                }}
              >
                {isSending ? (
                  <>
                    <RefreshCw size={17} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>جاري الإرسال عبر واتساب الفرع...</span>
                  </>
                ) : (
                  <>
                    <Send size={17} />
                    <span>إرسال الرسالة الآن للعميل [Enter]</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
