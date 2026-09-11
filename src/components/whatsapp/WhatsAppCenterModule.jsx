import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getEmpDisplayName, isEmployeeActive, fmt, getEmpWhatsAppPhone } from '../../utils/formatters';
import {
  WHATSAPP_TEMPLATE_CATEGORIES,
  READY_WHATSAPP_TEMPLATES,
  populateWhatsAppTemplate,
  generatePayslipPrintHtml
} from '../../utils/whatsappTemplates';
import { Send, FileText, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Filter, Users, UserCheck, LogOut, Globe, Network, Copy, Check, ExternalLink } from 'lucide-react';
import { useUI } from '../../context/UIContext';

export default function WhatsAppCenterModule({
  state,
  setState,
  saveState,
  showToast,
  monthPicker,
  computeEmpSummary,
  arabicMonthLabel
}) {
  const { showConfirm } = useUI();
  const [selectedBranch, setSelectedBranch] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  
  // فئات وقوالب الرسائل الجاهزة
  const [selectedCategory, setSelectedCategory] = useState('payslips');
  const [selectedTemplateId, setSelectedTemplateId] = useState('payslip_detailed');
  const [editableMessage, setEditableMessage] = useState('');
  const [attachPdfPayslip, setAttachPdfPayslip] = useState(true);

  // حالة خادم الواتساب الحية
  const [waStatus, setWaStatus] = useState('checking'); // 'checking' | 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
  const [waPhone, setWaPhone] = useState('');
  const [waLiveQr, setWaLiveQr] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isChangingNumber, setIsChangingNumber] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendProgressText, setSendProgressText] = useState('');

  // استكشاف ومعلومات الشبكة للأجهزة الأخرى
  const [networkInfo, setNetworkInfo] = useState(null);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState(state?.orgSettings?.waServerUrl || '');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // احتساب رابط السيرفر ديناميكياً حسب موقع العميل (موبايل، جهاز بالصيدلية، أو السيرفر الرئيسي)
  const serverUrl = useMemo(() => {
    const configured = (state?.orgSettings?.waServerUrl || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location) {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return `http://${host}:3100`;
      }
    }
    return 'http://127.0.0.1:3100';
  }, [state?.orgSettings?.waServerUrl]);
  const orgSettings = state?.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];

  const activeMonth = monthPicker || new Date().toISOString().slice(0, 7);
  const monthLabel = typeof arabicMonthLabel === 'function' ? arabicMonthLabel(activeMonth) : activeMonth;

  // قائمة الموظفين المفلترة حسب الفرع النشط
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (!isEmployeeActive(e)) return false;
      if (selectedBranch && e.branchId !== selectedBranch) return false;
      return true;
    });
  }, [employees, selectedBranch]);

  // الموظف النموذجي للمعاينة المباشرة
  const previewEmp = useMemo(() => {
    if (targetEmpId) {
      return employees.find(e => e.id === targetEmpId) || filteredEmployees[0] || employees[0];
    }
    return filteredEmployees[0] || employees[0] || null;
  }, [targetEmpId, filteredEmployees, employees]);

  // حساب ملخص الموظف للمعاينة
  const getEmpSummaryData = useCallback((empId) => {
    if (typeof computeEmpSummary === 'function') {
      try {
        return computeEmpSummary(empId, (d) => d.startsWith(activeMonth), activeMonth);
      } catch {
        return {};
      }
    }
    return {};
  }, [computeEmpSummary, activeMonth]);

  // القوالب المتاحة بالفئة المختارة
  const currentCategoryTemplates = useMemo(() => {
    return READY_WHATSAPP_TEMPLATES.filter(t => t.category === selectedCategory);
  }, [selectedCategory]);

  const selectedTemplate = useMemo(() => {
    return READY_WHATSAPP_TEMPLATES.find(t => t.id === selectedTemplateId) || READY_WHATSAPP_TEMPLATES[0];
  }, [selectedTemplateId]);

  // تحديث نص الرسالة عند تغيير القالب أو الموظف المستهدف
  useEffect(() => {
    if (!selectedTemplate) return;
    const branchObj = previewEmp ? branches.find(b => b.id === previewEmp.branchId) : null;
    const summary = previewEmp ? getEmpSummaryData(previewEmp.id) : {};
    const populated = populateWhatsAppTemplate(
      selectedTemplate.text,
      previewEmp,
      summary,
      orgSettings,
      monthLabel,
      branchObj?.name
    );
    setEditableMessage(populated);
    setAttachPdfPayslip(Boolean(selectedTemplate.supportsPdf));
  }, [selectedTemplateId, selectedTemplate, previewEmp, orgSettings, monthLabel, branches, getEmpSummaryData]);

  // حفظ وتعميم رابط السيرفر لجميع الأجهزة
  const handleSaveServerUrl = async (newUrl) => {
    const cleanUrl = (newUrl || '').trim().replace(/\/+$/, '');
    if (setState) {
      setState(prev => {
        const nextState = {
          ...prev,
          orgSettings: {
            ...(prev?.orgSettings || {}),
            waServerUrl: cleanUrl
          }
        };
        if (saveState) {
          saveState(nextState);
        }
        return nextState;
      });
    }
    setCustomServerUrl(cleanUrl);
    showToast?.(cleanUrl ? `✅ تم تعميم رابط السيرفر (${cleanUrl}) لجميع الأجهزة بالصيدلية` : '✅ تم ضبط السيرفر على الوضع التلقائي');
    setTimeout(() => {
      fetchWaStatus(false);
    }, 500);
  };

  // فحص حالة الخادم الحقيقية
  const fetchWaStatus = useCallback(async (silent = false) => {
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/status`, {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const data = await res.json();
        setWaStatus(data.status || 'DISCONNECTED');
        setWaPhone(data.phone || '');
        setWaLiveQr(data.qrCodeDataUrl || '');
        if (!silent && data.status === 'CONNECTED') {
          showToast?.(`🟢 خادم الواتساب متصل ومقترن بنجاح (+${data.phone})`);
        }
      } else {
        setWaStatus('DISCONNECTED');
      }
    } catch {
      setWaStatus('DISCONNECTED');
      if (!silent) {
        showToast?.('⚠️ تعذر الوصول لخادم الواتساب، اضغط "ربط الأجهزة والموبايلات" للتحقق من عنوان IP');
      }
    }

    // استكشاف عناوين الشبكة المحلية في الخلفية لمساعدة الأجهزة الأخرى
    try {
      const netRes = await fetch(`${serverUrl.replace(/\/$/, '')}/api/network-info`, {
        headers: { 'bypass-tunnel-reminder': 'true' },
        signal: AbortSignal.timeout(2500)
      });
      if (netRes.ok) {
        const netData = await netRes.json();
        setNetworkInfo(netData);
      }
    } catch {}
  }, [serverUrl, showToast]);

  // فحص دوري
  useEffect(() => {
    fetchWaStatus(true);
    const interval = setInterval(() => {
      fetchWaStatus(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchWaStatus]);

  // إعادة تشغيل خادم الواتساب
  const handleRestartServer = async () => {
    setIsRestarting(true);
    showToast?.('⚡ جاري إعادة تشغيل وتحديث خادم الواتساب في الخلفية...');
    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.restartWhatsAppServer) {
        const res = await window.desktopAPI.restartWhatsAppServer();
        showToast?.(res?.message || 'تمت إعادة تشغيل الخادم بنجاح');
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/restart`, {
          method: 'POST',
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(3000)
        });
        showToast?.('تم إرسال أمر إعادة تشغيل الخادم بنجاح');
      }
    } catch (err) {
      console.warn('Restart trigger warning:', err);
    }

    setTimeout(async () => {
      await fetchWaStatus(true);
      setIsRestarting(false);
    }, 2500);
  };

  // تغيير رقم الواتساب المقترن وفك الارتباط لتوليد رمز QR جديد
  const handleChangeConnectedNumber = async () => {
    const currentPhoneDisplay = waPhone ? `(+${waPhone})` : '';
    let isConfirmed = false;
    if (showConfirm) {
      isConfirmed = await showConfirm({
        title: 'تغيير رقم الواتساب المقترن',
        message: `هل أنت متأكد من رغبتك في تغيير رقم الواتساب المقترن ${currentPhoneDisplay}؟\n\nسيتم إلغاء اقتران الهاتف الحالي وتوليد رمز QR جديد لربط الهاتف الجديد فوراً.`,
        confirmText: 'نعم، فك الارتباط وتغيير الرقم',
        cancelText: 'إلغاء وتراجع',
        type: 'danger',
        icon: '📱'
      });
    } else {
      isConfirmed = window.confirm(
        `هل أنت متأكد من رغبتك في تغيير رقم الواتساب المقترن ${currentPhoneDisplay}؟\n\n` +
        `سيتم إلغاء اقتران الهاتف الحالي وتوليد رمز QR جديد لربط الهاتف الجديد فوراً.`
      );
    }
    if (!isConfirmed) return;

    setIsChangingNumber(true);
    showToast?.('⏳ جاري تسجيل الخروج وفك ارتباط الرقم الحالي...');

    try {
      if (typeof window !== 'undefined' && window.desktopAPI?.logoutWhatsAppServer) {
        await window.desktopAPI.logoutWhatsAppServer();
      } else {
        await fetch(`${serverUrl.replace(/\/$/, '')}/api/logout`, {
          method: 'POST',
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(4000)
        });
      }

      setWaStatus('DISCONNECTED');
      setWaPhone('');
      setWaLiveQr('');
      showToast?.('🔄 تم فك الارتباط بنجاح، جاري توليد وتجهيز رمز الـ QR الجديد...');
    } catch (err) {
      console.warn('Logout WhatsApp error:', err);
      showToast?.('⚠️ حدث خطأ أثناء فك الارتباط، جاري التحقق من الخادم...');
    }

    // استطلاع دوري وسريع للحصول على رمز الـ QR الجديد
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/status`, {
          headers: { 'bypass-tunnel-reminder': 'true' },
          signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data.status || 'DISCONNECTED');
          setWaPhone(data.phone || '');
          setWaLiveQr(data.qrCodeDataUrl || '');

          if (data.status === 'QR_READY' && data.qrCodeDataUrl) {
            clearInterval(pollInterval);
            setIsChangingNumber(false);
            showToast?.('✨ رمز الـ QR الجديد جاهز الآن! امسح الرمز من هاتفك الجديد.');
            return;
          } else if (data.status === 'CONNECTED') {
            clearInterval(pollInterval);
            setIsChangingNumber(false);
            return;
          }
        }
      } catch {}

      if (attempts >= 12) {
        clearInterval(pollInterval);
        setIsChangingNumber(false);
        fetchWaStatus(true);
      }
    }, 1500);
  };

  // توليد PDF Base64 لموظف معين سواء عبر تطبيق الديسكتوب أو خادم الواتساب المحلي
  const generateEmpPdfBase64 = async (emp, summary, htmlInput) => {
    if (!attachPdfPayslip) return null;

    const branchObj = branches.find(b => b.id === emp.branchId);
    const html = htmlInput || generatePayslipPrintHtml(emp, summary, orgSettings, monthLabel, branchObj?.name);

    // 1. أولوية استخدام Electron IPC في تطبيق سطح المكتب
    if (typeof window !== 'undefined' && window.desktopAPI?.generatePdfBase64) {
      try {
        const res = await window.desktopAPI.generatePdfBase64(html);
        if (res?.success && res.pdfBase64) {
          return res.pdfBase64;
        }
      } catch (err) {
        console.warn('Desktop PDF generation error for emp:', emp.name, err);
      }
    }

    // 2. التحويل السريع عبر خادم الواتساب المحلي المتاح على النظام (للمتصفح والديسكتوب)
    try {
      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/render-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({ html })
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.pdfBase64) {
          return data.pdfBase64;
        }
      }
    } catch {}

    return null;
  };

  // بدء عملية الإرسال
  const handleSendBroadcast = async (e) => {
    e.preventDefault();

    if (waStatus !== 'CONNECTED') {
      showToast?.('⚠️ خادم الواتساب غير مقترن بالهاتف حالياً. يرجى مسح رمز الـ QR أدناه أولاً لربط واتساب.');
      return;
    }

    const targetList = targetEmpId
      ? filteredEmployees.filter(emp => emp.id === targetEmpId)
      : filteredEmployees;

    const validRecipients = targetList.filter(emp => {
      const waNum = getEmpWhatsAppPhone(emp);
      return waNum && waNum.length >= 10;
    });

    if (validRecipients.length === 0) {
      showToast?.('❌ لا يوجد موظفون محددون يمتلكون أرقام هواتف صالحة مسجلة للواتساب.');
      return;
    }

    setIsSending(true);
    setSendProgressText(`جاري تحضير وتجهيز ملفات ورسائل ${validRecipients.length} موظف...`);

    try {
      const messagesPayload = [];

      for (let i = 0; i < validRecipients.length; i++) {
        const emp = validRecipients[i];
        const branchObj = branches.find(b => b.id === emp.branchId);
        const summary = getEmpSummaryData(emp.id);

        // تخصيص نص الرسالة لكل موظف إذا كان قالباً، أو استخدام النص المكتوب
        let msgBody = editableMessage;
        if (selectedTemplate) {
          msgBody = populateWhatsAppTemplate(
            selectedTemplate.text,
            emp,
            summary,
            orgSettings,
            monthLabel,
            branchObj?.name
          );
        }

        // إنشاء ملف الـ PDF المشفر إذا كان خيار الـ PDF مفعل
        let pdfBase64 = null;
        let pdfHtml = null;
        if (attachPdfPayslip && selectedTemplate?.supportsPdf) {
          pdfHtml = generatePayslipPrintHtml(
            emp,
            summary,
            orgSettings,
            monthLabel,
            branchObj?.name
          );

          setSendProgressText(`توليد كشف PDF معتمد (${i + 1}/${validRecipients.length}): ${getEmpDisplayName(emp)}...`);
          pdfBase64 = await generateEmpPdfBase64(emp, summary, pdfHtml);
        }

        // استخدام رقم الواتساب المخصص للموظف أو أول رقم صالح في قائمة الأرقام
        const empWaPhone = getEmpWhatsAppPhone(emp);
        messagesPayload.push({
          phone: empWaPhone,
          message: msgBody,
          empName: getEmpDisplayName(emp),
          pdfBase64,
          pdfHtml,
          fileName: `كشف_مرتب_${getEmpDisplayName(emp).replace(/\s+/g, '_')}_${activeMonth}.pdf`
        });
      }

      setSendProgressText('جاري تمرير الحزمة لخادم الواتساب للإرسال الآمن...');

      const res = await fetch(`${serverUrl.replace(/\/$/, '')}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({ messages: messagesPayload })
      });

      if (res.ok) {
        const data = await res.json();
        showToast?.(`🚀 ${data.message || `بدأ إرسال ${messagesPayload.length} رسالة بنجاح عبر الواتساب!`}`);
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast?.(`❌ فشل بدء الإرسال: ${errData.error || 'خطأ في استجابة السيرفر'}`);
      }
    } catch (err) {
      console.error('Send broadcast error:', err);
      showToast?.('❌ تعذر إتمام الإرسال، تأكد من تشغيل خادم الواتساب.');
    } finally {
      setIsSending(false);
      setSendProgressText('');
    }
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* ── الرأس التعريفي ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '22px', fontWeight: 800 }}>
            💬 مركز مراسلات الواتساب الذكي (WhatsApp Center)
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
            كشوفات المرتبات التفصيلية مع ملف PDF معتمد، رسائل التهنئة، وإشعارات الدوام التلقائية على مدار 24 ساعة
          </p>
        </div>

        <button
          type="button"
          className="btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 700,
            padding: '9px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: showNetworkModal ? '#2563eb' : 'var(--surface)',
            color: showNetworkModal ? '#fff' : 'var(--text)',
            cursor: 'pointer',
            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
            transition: 'all 0.2s ease'
          }}
          onClick={() => setShowNetworkModal(!showNetworkModal)}
        >
          <Network style={{ width: '16px', height: '16px', color: showNetworkModal ? '#fff' : '#2563eb' }} />
          <span>🌐 ربط الأجهزة والموبايلات (IP الشبكة)</span>
        </button>
      </div>

      {/* ── لوحة معلومات وإعدادات ربط الأجهزة والموبايلات ──────────────────────── */}
      {showNetworkModal && (
        <div style={{
          background: 'var(--surface)',
          border: '1.5px solid #3b82f6',
          borderRadius: '14px',
          padding: '18px 20px',
          marginBottom: '22px',
          boxShadow: '0 8px 24px rgba(59, 130, 246, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe style={{ width: '18px', height: '18px' }} />
                إعدادات الربط وعناوين خادم الواتساب للأجهزة الأخرى
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                لكي تتمكن الهواتف والأجهزة الأخرى داخل الصيدلية من الاتصال بسيرفر الواتساب دون حظر
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '12.5px', padding: '4px 10px' }}
              onClick={() => setShowNetworkModal(false)}
            >
              ✕ إغلاق
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {/* بطاقة الرابط النشط حالياً */}
            <div style={{ background: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '12px 14px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                الرابط النشط حالياً على هذا الجهاز:
              </span>
              <code style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e40af', direction: 'ltr', display: 'inline-block' }}>
                {serverUrl}
              </code>
            </div>

            {/* بطاقة العناوين المقترحة للشبكة المحلية */}
            {networkInfo?.localIps && networkInfo.localIps.length > 0 && (
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '12px 14px', borderRadius: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#047857', display: 'block', marginBottom: '4px' }}>
                  عناوين IP المكتشفة في شبكة الصيدلية (LAN):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {networkInfo.localIps.map((net, idx) => {
                    const lanUrl = `http://${net.address}:${networkInfo.port || 3100}`;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <code style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', direction: 'ltr' }}>
                          {lanUrl}
                        </code>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            onClick={() => {
                              navigator.clipboard?.writeText(lanUrl);
                              showToast?.('تم نسخ الرابط بنجاح');
                            }}
                          >
                            <Copy style={{ width: '12px', height: '12px' }} />
                          </button>
                          <button
                            type="button"
                            className="btn"
                            style={{ background: '#059669', color: '#fff', fontSize: '11px', padding: '3px 10px', fontWeight: 700, borderRadius: '6px' }}
                            onClick={() => handleSaveServerUrl(lanUrl)}
                            title="تعميم هذا الرابط على كل أجهزة وموبايلات الصيدلية تلقائياً"
                          >
                            ⚡ تعميم كافتراضي
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* حقل تخصيص وحفظ الرابط */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 700 }}>رابط مخصص:</span>
            <input
              type="text"
              value={customServerUrl}
              onChange={(e) => setCustomServerUrl(e.target.value)}
              placeholder="مثال: http://192.168.1.15:3100 أو https://xxxx.loca.lt"
              style={{
                flex: '1 1 240px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                direction: 'ltr',
                textAlign: 'left',
                fontSize: '13px'
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700 }}
              onClick={() => handleSaveServerUrl(customServerUrl)}
            >
              💾 حفظ وتعميم
            </button>
            {Boolean(state?.orgSettings?.waServerUrl) && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '8px 14px', fontSize: '12.5px', color: '#dc2626' }}
                onClick={() => handleSaveServerUrl('')}
              >
                🔄 إعادة للاكتشاف التلقائي
              </button>
            )}
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted)', background: 'var(--bg)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            💡 <strong>تلميح مهم لجدار الحماية (Windows Firewall):</strong> لكي تتمكن الأجهزة الأخرى من الوصول للمنفذ 3100، يرجى تشغيل ملف <code>scripts/allow_firewall_3100.bat</code> كمسؤول (Run as Administrator) مرة واحدة على جهاز السيرفر الرئيسي.
          </div>
        </div>
      )}

      {/* ── شريط حالة خادم الواتساب الحية وزر إعادة التشغيل ─────────────────── */}
      <div style={{
        background: waStatus === 'CONNECTED'
          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
          : waStatus === 'QR_READY'
            ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
        color: '#fff',
        padding: '16px 20px',
        borderRadius: '14px',
        marginBottom: '22px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '15.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {waStatus === 'CONNECTED' && `🟢 خادم الواتساب: متصل ومقترن بنجاح ${waPhone ? `(+${waPhone})` : ''}`}
            {waStatus === 'QR_READY' && '🟡 خادم الواتساب: بانتظار مسح رمز QR للاقتران بالهاتف'}
            {waStatus === 'DISCONNECTED' && '🔴 خادم الواتساب: غير متصل أو قيد الإطلاق'}
            {waStatus === 'checking' && '⏳ جاري فحص حالة اتصال الخادم...'}
          </h4>
          <span style={{ fontSize: '12.5px', opacity: 0.95, fontWeight: 500 }}>
            {waStatus === 'CONNECTED' && 'الخادم يعمل بالخلفية 24/7 ومستعد لإرسال مفردات المرتبات وملفات الـ PDF فوراً وبأمان تام.'}
            {waStatus === 'QR_READY' && 'امسح رمز الـ QR الظاهر بالأسفل من واتساب الهاتف لمرة واحدة فقط لربط الجهازين.'}
            {waStatus === 'DISCONNECTED' && 'اضغط على زر "إعادة تشغيل الخادم" لتشغيله في الخلفية وحل أي تعليق تلقائياً.'}
            {waStatus === 'checking' && 'يتم التحقق من استجابة المقبس الخلفي للواتساب...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* زر تغيير الرقم المتصل (يظهر عند الاتصال أو وجود رقم مسجل) */}
          {(waStatus === 'CONNECTED' || Boolean(waPhone)) && (
            <button
              type="button"
              className="btn"
              disabled={isChangingNumber || isRestarting}
              title="تسجيل الخروج من الرقم الحالي وتوليد رمز QR جديد لربط رقم مختلف"
              style={{
                background: '#dc2626',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '12.5px',
                padding: '7px 15px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                cursor: isChangingNumber ? 'not-allowed' : 'pointer',
                opacity: isChangingNumber ? 0.75 : 1,
                transition: 'all 0.2s ease'
              }}
              onClick={handleChangeConnectedNumber}
            >
              <LogOut style={{ width: '13px', height: '13px' }} className={isChangingNumber ? 'animate-spin' : ''} />
              <span>{isChangingNumber ? 'جاري فك الاقتران...' : '📱 تغيير الرقم المتصل'}</span>
            </button>
          )}

          <button
            type="button"
            className="btn"
            style={{ background: '#ffffff', color: '#0f172a', fontWeight: '800', fontSize: '12.5px', padding: '7px 14px', borderRadius: '8px' }}
            onClick={() => fetchWaStatus(false)}
          >
            📲 فحص الاتصال
          </button>

          <button
            type="button"
            className="btn"
            disabled={isRestarting || isChangingNumber}
            style={{
              background: '#0f172a',
              color: '#ffffff',
              fontWeight: '800',
              fontSize: '12.5px',
              padding: '7px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onClick={handleRestartServer}
          >
            <RefreshCw style={{ width: '13px', height: '13px' }} className={isRestarting ? 'animate-spin' : ''} />
            <span>{isRestarting ? 'جاري الإطلاق...' : 'إعادة تشغيل الخادم'}</span>
          </button>
        </div>
      </div>

      {/* ── بطاقة اقتران QR عند الحاجة ─────────────────────────────────────── */}
      {waStatus === 'QR_READY' && waLiveQr && (
        <div style={{
          background: '#ffffff',
          border: '2px dashed #f59e0b',
          borderRadius: '16px',
          padding: '22px',
          marginBottom: '22px',
          textAlign: 'center',
          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.12)'
        }}>
          <h3 style={{ margin: '0 0 6px 0', color: '#b45309', fontSize: '17px', fontWeight: 800 }}>
            📱 امسح رمز الـ QR لربط هاتف الواتساب بالمنظومة
          </h3>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 14px 0' }}>
            افتح WhatsApp ➔ الأجهزة المرتبطة (Linked Devices) ➔ ربط جهاز ووجّه الكاميرا:
          </p>
          <div style={{ display: 'inline-block', background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <img src={waLiveQr} alt="WhatsApp QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
          </div>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '5px 14px' }}
              onClick={() => handleRestartServer()}
            >
              🔄 تجديد رمز الـ QR
            </button>
          </div>
        </div>
      )}

      {/* ── قسم اختيار القوالب الجاهزة والتخصيص ─────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '22px'
      }}>
        {/* شريط تبويبات فئات القوالب */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>
            اختر فئة القالب الجاهز:
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {WHATSAPP_TEMPLATE_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    const firstInCat = READY_WHATSAPP_TEMPLATES.find(t => t.category === cat.id);
                    if (firstInCat) setSelectedTemplateId(firstInCat.id);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: active ? '1.5px solid #10b981' : '1px solid var(--border)',
                    background: active ? 'linear-gradient(135deg, #059669, #10b981)' : 'var(--card-bg, rgba(255,255,255,0.05))',
                    color: active ? '#ffffff' : 'var(--text)',
                    boxShadow: active ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* شبكة القوالب التابعة للفئة */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>
            القوالب المتاحة:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {currentCategoryTemplates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border)',
                    background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{tpl.icon}</span>
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: isSelected ? '#059669' : 'var(--text)' }}>
                      {tpl.title}
                    </div>
                    {tpl.supportsPdf && (
                      <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <FileText style={{ width: '11px', height: '11px' }} /> يدعم إرفاق PDF
                      </span>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 style={{ width: '18px', height: '18px', color: '#10b981' }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* فلاتر الاستهداف والفرع */}
        <form onSubmit={handleSendBroadcast}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 700 }}>تصفية حسب الفرع</label>
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                <option value="">-- جميع فروع الصيدليات ({employees.length} موظف) --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label style={{ fontSize: '12.5px', fontWeight: 700 }}>تحديد موظف محدد (اختياري)</label>
              <select value={targetEmpId} onChange={(e) => setTargetEmpId(e.target.value)}>
                <option value="">-- إرسال جماعي لكافة موظفي الفرع المختار ({filteredEmployees.length} موظف) --</option>
                {filteredEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{getEmpDisplayName(emp)} ({emp.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* خيار إرفاق ملف الـ PDF المعتمد */}
          {selectedTemplate?.supportsPdf && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1.5px solid rgba(16, 185, 129, 0.35)',
              padding: '12px 16px',
              borderRadius: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={attachPdfPayslip}
                  onChange={(e) => setAttachPdfPayslip(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div>
                  <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                    📄 إرفاق كشف المرتب كملف PDF معتمد مع كل رسالة واتساب
                  </strong>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    يقوم محرك التطبيق المكتبي بتوليد ملف PDF عالي الدقة A4 لكل موظف بمفردات مرتبه وإرساله فوراً كمستند معتمد.
                  </div>
                </div>
              </label>

              {attachPdfPayslip && (
                <span style={{ fontSize: '12px', background: '#10b981', color: '#fff', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  ✓ مفعل
                </span>
              )}
            </div>
          )}

          {/* محرر ومعاينة نص الرسالة */}
          <div className="field" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>
                نص الرسالة (المعاينة الحية والتعديل الحر):
              </label>
              {previewEmp && (
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  المعاينة الحية للموظف: <strong>{getEmpDisplayName(previewEmp)}</strong>
                </span>
              )}
            </div>
            <textarea
              rows="9"
              value={editableMessage}
              onChange={(e) => setEditableMessage(e.target.value)}
              placeholder="اكتب أو عدل نص الرسالة هنا..."
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                fontSize: '13.5px',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                border: '1px solid var(--border)'
              }}
            />
          </div>

          {/* شريط أزرار الإرسال والإحصائيات */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              🛡️ الإرسال محمي تلقائياً بتقنية الفواصل الزمنية (Anti-Ban) لمنع حظر الرقم من WhatsApp.
            </div>

            <button
              type="submit"
              disabled={isSending}
              className="btn btn-start"
              style={{
                padding: '12px 28px',
                fontSize: '15px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                cursor: isSending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Send style={{ width: '16px', height: '16px' }} />
              <span>
                {isSending
                  ? (sendProgressText || 'جاري الإرسال...')
                  : targetEmpId
                  ? `إرسال إلى ${getEmpDisplayName(previewEmp || {})}`
                  : `إرسال إلى كافة موظفي الفرع (${filteredEmployees.length} موظف)`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ── جدول الموظفين المستهدفين وحالة أرقام الهواتف ─────────────────────── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 800 }}>
        👥 قائمة الموظفين المستهدفين بالإرسال ({filteredEmployees.length} موظف)
      </h4>
      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>كود الموظف</th>
              <th>اسم الموظف</th>
              <th>الفرع</th>
              <th>المسمى الوظيفي</th>
              <th>رقم الهاتف</th>
              <th>حالة الواتساب</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                  لا يوجد موظفين مسجلين بهذا الفرع.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const b = branches.find((br) => br.id === emp.branchId);
                const empWaNum = getEmpWhatsAppPhone(emp);
                const hasPhone = empWaNum && empWaNum.length >= 10;
                // تحديد نوع الرقم: هل هو رقم مخصص للواتساب أم رقم افتراضي
                const waPhoneObj = Array.isArray(emp.phones)
                  ? emp.phones.find(p => typeof p === 'object' && p?.type === 'whatsapp' && String(p?.number || '').replace(/\D/g,'').length >= 10)
                  : null;
                const phoneLabel = empWaNum
                  ? (waPhoneObj ? `💬 ${empWaNum}` : `📱 ${empWaNum}`)
                  : '❌ بدون رقم';
                return (
                  <tr key={emp.id}>
                    <td style={{ fontWeight: '700' }}>{emp.code}</td>
                    <td style={{ fontWeight: '800' }}>{getEmpDisplayName(emp)}</td>
                    <td>{b?.name || 'المركز الرئيسي'}</td>
                    <td>{emp.jobTitle || 'عضو كادر'}</td>
                    <td style={{ direction: 'ltr', textAlign: 'right', fontWeight: 700 }}>
                      {phoneLabel}
                    </td>
                    <td>
                      {hasPhone ? (
                        <span className="badge badge-success">🟢 جاهز للاستلام</span>
                      ) : (
                        <span className="badge badge-danger">🔴 غير مسجل رقم</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
