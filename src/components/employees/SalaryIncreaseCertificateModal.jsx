import React, { useState, useMemo, useEffect } from 'react';
import QRCode from 'qrcode';
import { fmt, getEmpDisplayName, getEmpWhatsAppPhone } from '../../utils/formatters';
import { triggerDirectPrint } from '../../utils/printHelper';
import { getResolvedWhatsAppServerUrl } from '../../utils/systemUrlHelper';
import {
  generateSalaryIncreaseCertificateHtml,
  populateWhatsAppTemplate,
  READY_WHATSAPP_TEMPLATES
} from '../../utils/whatsappTemplates';

function SalaryIncreaseCertificateContent({
  onClose,
  employee: initialEmployee,
  allEmployees = [],
  increaseRecord = null,
  orgSettings = {},
  state = null,
  showToast = (msg) => alert(msg)
}) {
  const [activeTab, setActiveTab] = useState('single'); // 'single' | 'bulk'
  const [currentEmployee, setCurrentEmployee] = useState(initialEmployee);

  // استخراج القيم الابتدائية بدون useEffect
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const inc = useMemo(() => {
    return increaseRecord || currentEmployee?.lastIncrease || (currentEmployee?.salaryIncreases && currentEmployee.salaryIncreases[currentEmployee.salaryIncreases.length - 1]) || {};
  }, [increaseRecord, currentEmployee]);

  const defaultDecDate = inc.decisionDate || inc.issueDate || todayStr;
  const defaultEffDate = inc.effectiveDate || inc.date || defaultDecDate;
  const defaultDecNum = inc.decisionNumber || `INC-${defaultDecDate.replace(/[^0-9]/g, '')}-${currentEmployee?.code || 'EMP'}`;

  // ── 1. الحقول القابلة للتعديل للشهادة الفردية ───────────────────────────
  const [decisionNumber, setDecisionNumber] = useState(defaultDecNum);
  const [increaseType, setIncreaseType] = useState(inc.type || 'annual');
  const [decisionDate, setDecisionDate] = useState(defaultDecDate);
  const [issueDate, setIssueDate] = useState(defaultDecDate);
  const [effectiveDate, setEffectiveDate] = useState(defaultEffDate);
  const [rateBefore, setRateBefore] = useState(() => {
    if (inc.rateBefore !== undefined && inc.rateBefore !== null) return parseFloat(inc.rateBefore) || 0;
    if (currentEmployee?.rateBefore !== undefined) return parseFloat(currentEmployee.rateBefore) || 0;
    return parseFloat(currentEmployee?.salary || 0) || 0;
  });
  const [rateAfter, setRateAfter] = useState(() => {
    if (inc.rateAfter !== undefined && inc.rateAfter !== null) return parseFloat(inc.rateAfter) || 0;
    if (currentEmployee?.rateAfter !== undefined) return parseFloat(currentEmployee.rateAfter) || 0;
    return parseFloat(currentEmployee?.salary || 0) || 0;
  });
  const [jobTitle, setJobTitle] = useState(currentEmployee?.jobTitle || 'عضو الكادر المهني');
  const [branchName, setBranchName] = useState(currentEmployee?.branchName || 'الفرع الرئيسي');

  const [appreciationText, setAppreciationText] = useState(
    inc.notes ||
    'تقديراً لجهودكم المتميزة، وعطائكم المتواصل، وإخلاصكم المشهود في خدمة وتطوير العمل والارتقاء بالأداء العام للمؤسسة، يسرنا منحكم هذه الزيادة متمنين لكم دوام التوفيق والتميز.'
  );

  const [signatory1Title, setSignatory1Title] = useState(orgSettings?.gmTitle || 'المدير العام للمؤسسة');
  const [signatory1Name, setSignatory1Name] = useState(orgSettings?.managerName || orgSettings?.generalManagerName || 'الإدارة العليا');
  const [signatory2Title, setSignatory2Title] = useState('مدير الموارد البشرية (HR)');
  const [signatory2Name, setSignatory2Name] = useState(orgSettings?.hrManagerName || 'شؤون الكوادر البشرية');

  // خيارات إظهار/إخفاء الختم والباركود والشعار
  const [showStamp, setShowStamp] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showLogo, setShowLogo] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // ── 2. إعدادات مراسلة الواتساب الفردية ──────────────────────────────────
  const [recipientPhone, setRecipientPhone] = useState(
    () => getEmpWhatsAppPhone(currentEmployee) || currentEmployee?.phone || ''
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState('promotion_official_certificate');
  const [userCustomWaMessage, setUserCustomWaMessage] = useState(null);
  const [includePdf, setIncludePdf] = useState(true);
  const [isSendingSingle, setIsSendingSingle] = useState(false);
  const [singleSendStatus, setSingleSendStatus] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  // فحص حالة سيرفر الواتساب الحي
  const [serverHealth, setServerHealth] = useState({ status: 'checking', phone: '', message: 'جاري فحص اتصال خادم الواتساب...' });

  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(state), [state]);

  useEffect(() => {
    let isMounted = true;
    fetch(`${waServerUrl}/api/status`, { headers: { 'bypass-tunnel-reminder': 'true' } })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.status === 'CONNECTED') {
          setServerHealth({
            status: 'connected',
            phone: data.phone || '',
            message: `خادم الواتساب متصل (${data.phone ? '+' + data.phone : 'جاهز'})`
          });
        } else if (data.status === 'QR_READY') {
          setServerHealth({
            status: 'qr_ready',
            phone: '',
            message: 'خادم الواتساب بانتظار مسح رمز QR'
          });
        } else {
          setServerHealth({
            status: 'disconnected',
            phone: '',
            message: 'خادم الواتساب غير متصل حالياً'
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setServerHealth({
          status: 'error',
          phone: '',
          message: 'تعذر الاتصال بخادم الواتساب المحلي'
        });
      });
    return () => { isMounted = false; };
  }, [waServerUrl]);

  // توليد كود الـ QR المشفر عند تغير بيانات القرار
  useEffect(() => {
    let isMounted = true;
    const verifyPayload = `قرار زيادة راتب رسمي رقم (${decisionNumber}) | الموظف: ${getEmpDisplayName(currentEmployee)} (كود: ${currentEmployee?.code || 'EMP'}) | سريان: ${effectiveDate} | معتمد بنظام الموارد البشرية`;
    QRCode.toDataURL(verifyPayload, { width: 160, margin: 1, color: { dark: '#064e3b', light: '#ffffff' } })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [decisionNumber, effectiveDate, currentEmployee]);

  // ── 3. إعدادات الإرسال الجماعي ─────────────────────────────────────────
  const eligibleEmployeesForBulk = useMemo(() => {
    return (allEmployees.length > 0 ? allEmployees : [currentEmployee]).filter((e) => {
      return Boolean(e.lastIncrease || (e.salaryIncreases && e.salaryIncreases.length > 0));
    });
  }, [allEmployees, currentEmployee]);

  const [bulkSelectedEmpIds, setBulkSelectedEmpIds] = useState(() => eligibleEmployeesForBulk.map((e) => e.id));
  const [bulkTemplateId, setBulkTemplateId] = useState('promotion_official_certificate');
  const [bulkIncludePdf, setBulkIncludePdf] = useState(true);
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [bulkCompletionReport, setBulkCompletionReport] = useState(null);

  // فلترة قائمة الموظفين للبحث في الإرسال الجماعي
  const displayedBulkEmployees = useMemo(() => {
    if (!bulkSearchTerm.trim()) return eligibleEmployeesForBulk;
    const term = bulkSearchTerm.toLowerCase();
    return eligibleEmployeesForBulk.filter((emp) => {
      const name = getEmpDisplayName(emp).toLowerCase();
      const code = String(emp.code || '').toLowerCase();
      const branch = String(emp.branchName || '').toLowerCase();
      return name.includes(term) || code.includes(term) || branch.includes(term);
    });
  }, [eligibleEmployeesForBulk, bulkSearchTerm]);

  // حساب الفروقات والنسب الحية
  const diffAmount = useMemo(() => {
    const diff = (parseFloat(rateAfter) || 0) - (parseFloat(rateBefore) || 0);
    return diff > 0 ? diff : 0;
  }, [rateBefore, rateAfter]);

  const diffPct = useMemo(() => {
    const b = parseFloat(rateBefore) || 0;
    if (b <= 0) return '0.0';
    return (((diffAmount) / b) * 100).toFixed(1);
  }, [rateBefore, diffAmount]);

  // توليد نص الرسالة الحي تلقائياً عند تغيير الحقول
  const computedWaMessage = useMemo(() => {
    const templateObj = READY_WHATSAPP_TEMPLATES.find((t) => t.id === selectedTemplateId) || READY_WHATSAPP_TEMPLATES.find((t) => t.id === 'promotion_official_certificate');
    const rawTemplateText = templateObj ? templateObj.text : '';

    const promoData = {
      type: increaseType,
      typeLabel: increaseType === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : (increaseType === 'adjustment' ? 'تعديل هيكلي للأجر' : 'زيادة سنوية دورية'),
      effectiveDate,
      rateBefore,
      rateAfter,
      percentage: diffPct,
      decisionNumber,
      appreciationText,
      includePdf
    };

    return populateWhatsAppTemplate(
      rawTemplateText,
      currentEmployee,
      {},
      orgSettings || state?.orgSettings,
      '',
      branchName,
      promoData
    );
  }, [selectedTemplateId, increaseType, effectiveDate, rateBefore, rateAfter, diffPct, decisionNumber, appreciationText, includePdf, currentEmployee, branchName, orgSettings, state]);

  const activeWaMessage = userCustomWaMessage !== null ? userCustomWaMessage : computedWaMessage;

  // توليد HTML الشهادة الحالية وفق الإعدادات المعدلة
  const currentIncreasePayload = useMemo(() => ({
    decisionNumber,
    type: increaseType,
    typeLabel: increaseType === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : (increaseType === 'adjustment' ? 'تعديل هيكلي للأجر' : 'زيادة سنوية دورية'),
    decisionDate,
    issueDate,
    effectiveDate,
    rateBefore,
    rateAfter,
    jobTitle,
    branchName,
    phone: recipientPhone,
    percentage: diffPct,
    appreciationText,
    signatory1Title,
    signatory1Name,
    signatory2Title,
    signatory2Name,
    showStamp,
    showBarcode,
    showLogo,
    qrDataUrl
  }), [decisionNumber, increaseType, decisionDate, issueDate, effectiveDate, rateBefore, rateAfter, jobTitle, branchName, recipientPhone, diffPct, appreciationText, signatory1Title, signatory1Name, signatory2Title, signatory2Name, showStamp, showBarcode, showLogo, qrDataUrl]);

  const certificateHtml = useMemo(() => {
    return generateSalaryIncreaseCertificateHtml(
      currentEmployee,
      currentIncreasePayload,
      orgSettings || state?.orgSettings,
      branchName
    );
  }, [currentEmployee, currentIncreasePayload, orgSettings, state, branchName]);

  // أمر الطباعة المباشر
  const handlePrintCertificate = () => {
    triggerDirectPrint(certificateHtml, `شهادة زيادة راتب - ${getEmpDisplayName(currentEmployee)}`, 'portrait');
    showToast('جاري تحضير الشهادة الرسمية للطباعة...');
  };

  // نسخ نص الرسالة المنسق
  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(activeWaMessage);
      setIsCopied(true);
      showToast('📋 تم نسخ نص الإخطار الرسمي إلى الحافظة بنجاح');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      showToast('❌ تعذر نسخ النص تلقائياً، يرجى التحديد والنسخ يدوياً');
    }
  };

  // إرسال فردي عبر سيرفر الواتساب مع خيار إرفاق الـ PDF
  const handleSendSingleWhatsApp = async () => {
    if (!recipientPhone || recipientPhone.replace(/\D/g, '').length < 10) {
      showToast('❌ برجاء إدخال رقم هاتف واتساب صالح للموظف أولاً');
      return;
    }

    setIsSendingSingle(true);
    setSingleSendStatus({ status: 'sending', msg: 'جاري الإرسال عبر خادم WhatsApp...' });

    try {
      const payload = {
        phone: recipientPhone,
        message: activeWaMessage,
        fileName: `شهادة_زيادة_راتب_${(currentEmployee.code || 'EMP')}_${effectiveDate}.pdf`
      };

      if (includePdf) {
        payload.pdfHtml = certificateHtml;
      }

      const res = await fetch(`${waServerUrl}/api/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSingleSendStatus({
          success: true,
          msg: `✅ تم إرسال الإشعار بنجاح إلى الموظف ${includePdf ? 'مرفقاً معها ملف الشهادة PDF المعتمد' : 'كنص مباشر بدون PDF'}.`
        });
        showToast('✅ تم إرسال إشعار الزيادة بنجاح عبر الواتساب');
      } else {
        throw new Error(data.error || 'تعذر إرسال الرسالة عبر خادم الواتساب');
      }
    } catch (err) {
      console.error('WhatsApp send error:', err);
      setSingleSendStatus({
        success: false,
        msg: `❌ تعذر الإرسال: ${err.message}. يمكنك فتح المحادثة عبر WhatsApp Web بالزر المجاور.`
      });
      showToast(`❌ فشل الإرسال عبر الخادم: ${err.message}`);
    } finally {
      setIsSendingSingle(false);
    }
  };

  // فتح WhatsApp Web كبديل مباشر
  const handleOpenWhatsAppWeb = () => {
    let phone = recipientPhone.replace(/\D/g, '');
    if (phone.startsWith('01')) phone = '2' + phone;
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(activeWaMessage)}`;
    window.open(url, '_blank');
  };

  const handleToggleBulkEmp = (empId) => {
    setBulkSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSelectAllBulk = () => {
    if (bulkSelectedEmpIds.length === eligibleEmployeesForBulk.length) {
      setBulkSelectedEmpIds([]);
    } else {
      setBulkSelectedEmpIds(eligibleEmployeesForBulk.map((e) => e.id));
    }
  };

  // معاينة موظف من قائمة الإرسال الجماعي في التبويب الفردي
  const handleSwitchToEmployeePreview = (emp) => {
    setCurrentEmployee(emp);
    const empInc = emp.lastIncrease || (emp.salaryIncreases && emp.salaryIncreases[emp.salaryIncreases.length - 1]) || {};
    const eff = empInc.effectiveDate || empInc.date || todayStr;
    setDecisionNumber(empInc.decisionNumber || `INC-${eff.replace(/[^0-9]/g, '')}-${emp?.code || 'EMP'}`);
    setIncreaseType(empInc.type || 'annual');
    setEffectiveDate(eff);
    setRateBefore(parseFloat(empInc.rateBefore !== undefined ? empInc.rateBefore : (emp.salary || 0)) || 0);
    setRateAfter(parseFloat(empInc.rateAfter !== undefined ? empInc.rateAfter : (emp.salary || 0)) || 0);
    setJobTitle(emp.jobTitle || 'عضو الكادر المهني');
    setBranchName(emp.branchName || 'الفرع الرئيسي');
    setRecipientPhone(getEmpWhatsAppPhone(emp) || emp.phone || '');
    setUserCustomWaMessage(null);
    setActiveTab('single');
  };

  // تنفيذ الإرسال الجماعي عبر السيرفر
  const handleStartBulkSending = async () => {
    if (bulkSelectedEmpIds.length === 0) {
      showToast('❌ يرجى تحديد موظف واحد على الأقل لإرسال الإشعارات له');
      return;
    }

    setIsSendingBulk(true);
    setBulkCompletionReport(null);
    setBulkProgress({ current: 0, total: bulkSelectedEmpIds.length, success: 0, failed: 0 });

    const templateObj = READY_WHATSAPP_TEMPLATES.find((t) => t.id === bulkTemplateId) || READY_WHATSAPP_TEMPLATES.find((t) => t.id === 'promotion_official_certificate');

    const messagesToSend = [];

    for (const empId of bulkSelectedEmpIds) {
      const emp = (allEmployees.length > 0 ? allEmployees : [currentEmployee]).find((e) => String(e.id) === String(empId));
      if (!emp) continue;

      const empInc = emp.lastIncrease || (emp.salaryIncreases && emp.salaryIncreases[emp.salaryIncreases.length - 1]) || {};
      const phone = getEmpWhatsAppPhone(emp) || emp.phone;
      if (!phone || phone.replace(/\D/g, '').length < 10) continue;

      const bName = emp.branchName || 'الفرع الرئيسي';
      const bEff = empInc.effectiveDate || empInc.date || todayStr;
      const bDec = empInc.decisionNumber || `INC-${bEff.replace(/[^0-9]/g, '')}-${emp.code || 'EMP'}`;

      const promoData = {
        type: empInc.type || 'annual',
        typeLabel: empInc.type === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : 'زيادة سنوية دورية',
        effectiveDate: bEff,
        rateBefore: empInc.rateBefore !== undefined ? empInc.rateBefore : (emp.salary || 0),
        rateAfter: empInc.rateAfter !== undefined ? empInc.rateAfter : (emp.salary || 0),
        percentage: empInc.percentage,
        decisionNumber: bDec,
        appreciationText: empInc.notes || appreciationText,
        includePdf: bulkIncludePdf,
        showStamp,
        showBarcode,
        showLogo
      };

      const populatedText = populateWhatsAppTemplate(
        templateObj.text,
        emp,
        {},
        orgSettings || state?.orgSettings,
        '',
        bName,
        promoData
      );

      const msgItem = {
        phone,
        empName: getEmpDisplayName(emp),
        message: populatedText,
        fileName: `شهادة_زيادة_راتب_${emp.code || 'EMP'}.pdf`
      };

      if (bulkIncludePdf) {
        msgItem.pdfHtml = generateSalaryIncreaseCertificateHtml(
          emp,
          promoData,
          orgSettings || state?.orgSettings,
          bName
        );
      }

      messagesToSend.push(msgItem);
    }

    if (messagesToSend.length === 0) {
      setIsSendingBulk(false);
      showToast('❌ لم يتم العثور على أرقام هواتف صالحة للموظفين المحددين');
      return;
    }

    try {
      const res = await fetch(`${waServerUrl}/api/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({ messages: messagesToSend })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBulkProgress({
          current: messagesToSend.length,
          total: messagesToSend.length,
          success: messagesToSend.length,
          failed: 0
        });
        setBulkCompletionReport({
          success: true,
          count: messagesToSend.length,
          message: data.message || `تم بنجاح جدولة وإطلاق إرسال ${messagesToSend.length} شهادة وإخطار عبر طابور الواتساب الآمن.`
        });
        showToast(`🚀 تم بدء طابور الإرسال الجماعي لـ ${messagesToSend.length} موظف بنجاح.`);
      } else {
        throw new Error(data.error || 'فشلت عملية إطلاق الإرسال الجماعي');
      }
    } catch (err) {
      console.error('Bulk send error:', err);
      setBulkCompletionReport({
        success: false,
        count: 0,
        message: `تعذر الإرسال: ${err.message}`
      });
      showToast(`❌ خطأ في الإرسال الجماعي: ${err.message}`);
    } finally {
      setIsSendingBulk(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '1300px',
        height: '92vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}
    >
      {/* ── رأس النافذة Modal Header ── */}
      <div
        style={{
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #065f46 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 10px rgba(4, 120, 87, 0.25)',
          borderBottom: '2px solid #d97706'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '26px' }}>📜</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, letterSpacing: '0.3px' }}>
                شهادة وإخطار زيادة راتب وترقية مالية معتمدة
              </h3>
              {/* بادج حالة سيرفر الواتساب */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: serverHealth.status === 'connected'
                    ? 'rgba(34, 197, 94, 0.25)'
                    : (serverHealth.status === 'qr_ready' || serverHealth.status === 'checking' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(239, 68, 68, 0.25)'),
                  border: `1px solid ${
                    serverHealth.status === 'connected'
                      ? '#4ade80'
                      : (serverHealth.status === 'qr_ready' || serverHealth.status === 'checking' ? '#facc15' : '#f87171')
                  }`,
                  color: '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title={serverHealth.message}
              >
                <span>{serverHealth.status === 'connected' ? '🟢' : (serverHealth.status === 'qr_ready' ? '🟡' : (serverHealth.status === 'checking' ? '⏳' : '🔴'))}</span>
                <span>
                  {serverHealth.status === 'connected'
                    ? `خادم الواتساب متصل ${serverHealth.phone ? '(+' + serverHealth.phone + ')' : ''}`
                    : (serverHealth.status === 'qr_ready'
                      ? 'بانتظار مسح QR'
                      : (serverHealth.status === 'checking' ? 'جاري فحص الاتصال...' : 'خادم الواتساب غير متصل'))}
                </span>
              </span>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.92, marginTop: '3px' }}>
              الموظف: <strong>{getEmpDisplayName(currentEmployee)}</strong> (كود: {currentEmployee?.code || 'EMP'}) • الفرع: {branchName} • المسمى: {jobTitle}
            </div>
          </div>
        </div>

        {/* تبويبات التبديل بين الشهادة الفردية والإرسال الجماعي */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.15)', padding: '3px', borderRadius: '10px', display: 'flex', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              style={{
                background: activeTab === 'single' ? '#ffffff' : 'transparent',
                color: activeTab === 'single' ? '#065f46' : '#ffffff',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'single' ? '0 2px 5px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              ✏️ تحرير ومعاينة الشهادة
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              style={{
                background: activeTab === 'bulk' ? '#ffffff' : 'transparent',
                color: activeTab === 'bulk' ? '#065f46' : '#ffffff',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: activeTab === 'bulk' ? '0 2px 5px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              🚀 إرسال جماعي لكافة الموظفين ({eligibleEmployeesForBulk.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="إغلاق النافذة"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── جسم النافذة Modal Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#f8fafc' }}>
        {activeTab === 'single' ? (
          /* ═════ التبويب الأول: محرر الشهادة الفردية والمعاينة الحية ═════ */
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(390px, 480px) 1fr', gap: '16px', height: '100%' }}>
            
            {/* العمود الأيمن: عناصر التحكم والتعديل */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                overflowY: 'auto',
                maxHeight: 'calc(92vh - 110px)'
              }}
            >
              {/* بيانات القرار الأساسية */}
              <div style={{ borderBottom: '1.5px solid #f1f5f9', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📝</span> بيانات القرار الإداري والتواريخ
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      رقم القرار الإداري:
                    </label>
                    <input
                      type="text"
                      value={decisionNumber}
                      onChange={(e) => setDecisionNumber(e.target.value)}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12px', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      نوع الزيادة:
                    </label>
                    <select
                      value={increaseType}
                      onChange={(e) => setIncreaseType(e.target.value)}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 6px', fontSize: '12px', fontWeight: 700 }}
                    >
                      <option value="annual">🌱 زيادة سنوية دورية</option>
                      <option value="exceptional">⭐ زيادة استثنائية لكفاءة</option>
                      <option value="adjustment">📊 تعديل هيكلي للأجر</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      تاريخ صدور القرار:
                    </label>
                    <input
                      type="date"
                      value={decisionDate}
                      onChange={(e) => {
                        setDecisionDate(e.target.value);
                        setIssueDate(e.target.value);
                      }}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '11.5px', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#047857', display: 'block', marginBottom: '3px' }}>
                      تاريخ سريان التطبيق: *
                    </label>
                    <input
                      type="date"
                      value={effectiveDate}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1.5px solid #059669', padding: '0 8px', fontSize: '11.5px', fontWeight: 800 }}
                    />
                  </div>
                </div>

                {/* المسمى والفرع القابلين للتعديل على الشهادة */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      المسمى الوظيفي:
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="صيدلي أول / مدير فرع..."
                      style={{ width: '100%', height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '11.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                      الفرع / مقر العمل:
                    </label>
                    <input
                      type="text"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="الفرع الرئيسي..."
                      style={{ width: '100%', height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '11.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* البيانات المالية وأسعار الساعة */}
              <div style={{ borderBottom: '1.5px solid #f1f5f9', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💰</span> تسعير الساعة والفروقات المالية
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '3px' }}>
                      سعر الساعة قبل الزيادة:
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={rateBefore}
                      onChange={(e) => setRateBefore(e.target.value)}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12.5px', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#059669', display: 'block', marginBottom: '3px' }}>
                      سعر الساعة بعد الزيادة: *
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={rateAfter}
                      onChange={(e) => setRateAfter(e.target.value)}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '2px solid #059669', padding: '0 8px', fontSize: '13px', fontWeight: 900, color: '#047857' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '8px', background: '#ecfdf5', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 800, color: '#065f46' }}>
                  <span>مقدار الزيادة: +{fmt(diffAmount)} ج.م / س</span>
                  <span>نسبة الزيادة: +{diffPct}%</span>
                </div>
              </div>

              {/* نص التهنئة والخطاب التقديري */}
              <div style={{ borderBottom: '1.5px solid #f1f5f9', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                    📜 نص الخطاب والتهنئة بالشهادة:
                  </label>
                  <button
                    type="button"
                    onClick={() => setAppreciationText('تقديراً لجهودكم المتميزة، وعطائكم المتواصل، وإخلاصكم المشهود في خدمة وتطوير العمل والارتقاء بالأداء العام للمؤسسة، يسرنا منحكم هذه الزيادة متمنين لكم دوام التوفيق والتميز.')}
                    style={{ background: 'none', border: 'none', color: '#059669', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    استعادة النص القياسي
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={appreciationText}
                  onChange={(e) => setAppreciationText(e.target.value)}
                  style={{ width: '100%', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '6px 8px', fontSize: '11.5px', lineHeight: 1.4, resize: 'vertical' }}
                />
              </div>

              {/* التوقيعات وخيارات المظهر الرسمي */}
              <div style={{ borderBottom: '1.5px solid #f1f5f9', paddingBottom: '12px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✍️</span> بيانات التوقيعات والختم المعتمد
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <input
                      type="text"
                      value={signatory1Title}
                      onChange={(e) => setSignatory1Title(e.target.value)}
                      placeholder="مسمى الموقع 1"
                      style={{ width: '100%', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 6px', fontSize: '11px' }}
                    />
                    <input
                      type="text"
                      value={signatory1Name}
                      onChange={(e) => setSignatory1Name(e.target.value)}
                      placeholder="اسم الموقع 1"
                      style={{ width: '100%', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 6px', fontSize: '11px', marginTop: '4px' }}
                    />
                  </div>

                  <div>
                    <input
                      type="text"
                      value={signatory2Title}
                      onChange={(e) => setSignatory2Title(e.target.value)}
                      placeholder="مسمى الموقع 2"
                      style={{ width: '100%', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 6px', fontSize: '11px' }}
                    />
                    <input
                      type="text"
                      value={signatory2Name}
                      onChange={(e) => setSignatory2Name(e.target.value)}
                      placeholder="اسم الموقع 2"
                      style={{ width: '100%', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 6px', fontSize: '11px', marginTop: '4px' }}
                    />
                  </div>
                </div>

                {/* خيارات إظهار/إخفاء الختم والباركود والشعار */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={showStamp}
                      onChange={(e) => setShowStamp(e.target.checked)}
                      style={{ accentColor: '#059669' }}
                    />
                    ختم الاعتماد
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={showBarcode}
                      onChange={(e) => setShowBarcode(e.target.checked)}
                      style={{ accentColor: '#059669' }}
                    />
                    باركود ورمز التحقق
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={showLogo}
                      onChange={(e) => setShowLogo(e.target.checked)}
                      style={{ accentColor: '#059669' }}
                    />
                    شعار المؤسسة
                  </label>
                </div>
              </div>

              {/* ── قسم مراسلة الواتساب (WhatsApp Dispatch) ── */}
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>💬</span> إرسال الإخطار للموظف عبر WhatsApp
                  </h4>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #86efac',
                      color: '#166534',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="نسخ نص الإخطار الرسمي للحافظة"
                  >
                    <span>{isCopied ? '✓' : '📋'}</span>
                    <span>{isCopied ? 'تم النسخ' : 'نسخ النص'}</span>
                  </button>
                </div>

                {/* رقم الهاتف واختيار القالب */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '3px' }}>
                      رقم هاتف الموظف:
                    </label>
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #86efac', padding: '0 8px', fontSize: '12px', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '3px' }}>
                      قالب الرسالة:
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        setUserCustomWaMessage(null);
                      }}
                      style={{ width: '100%', height: '32px', borderRadius: '6px', border: '1px solid #86efac', padding: '0 6px', fontSize: '11.5px', fontWeight: 700 }}
                    >
                      <option value="promotion_official_certificate">📜 شهادة مفصلة مع القرار</option>
                      <option value="promotion_congrats_brief">🎉 تهنئة موجزة بالزيادة</option>
                    </select>
                  </div>
                </div>

                {/* نص رسالة الواتساب */}
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#166534' }}>
                      نص الرسالة المرسلة:
                    </label>
                    {userCustomWaMessage !== null && (
                      <button
                        type="button"
                        onClick={() => setUserCustomWaMessage(null)}
                        style={{ background: 'none', border: 'none', color: '#047857', fontSize: '10.5px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        إعادة تعيين للنص التلقائي
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={activeWaMessage}
                    onChange={(e) => setUserCustomWaMessage(e.target.value)}
                    style={{ width: '100%', borderRadius: '6px', border: '1px solid #86efac', padding: '6px 8px', fontSize: '11.5px', lineHeight: 1.4 }}
                  />
                </div>

                {/* خيار إرفاق الـ PDF */}
                <div
                  style={{
                    background: includePdf ? '#dcfce7' : '#fef2f2',
                    border: `1.5px solid ${includePdf ? '#22c55e' : '#fca5a5'}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '10px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: includePdf ? '#15803d' : '#991b1b' }}>
                    <input
                      type="checkbox"
                      checked={includePdf}
                      onChange={(e) => setIncludePdf(e.target.checked)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span>📎 إرفاق ملف الشهادة الرسمية كـ PDF مع رسالة الواتساب</span>
                  </label>
                  <div style={{ fontSize: '10.5px', color: includePdf ? '#166534' : '#7f1d1d', marginTop: '2px', paddingRight: '24px' }}>
                    {includePdf
                      ? '✅ سيقوم السيرفر بتوليد شهادة PDF الرسمية بدقة عالية وإرفاقها كمستند معتمد.'
                      : 'ℹ️ سيتم إرسال نص التهنئة والبيانات فقط بدون إرفاق ملف PDF.'}
                  </div>
                </div>

                {/* حالة الإرسال */}
                {singleSendStatus && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      background: singleSendStatus.success ? '#dcfce7' : '#fee2e2',
                      color: singleSendStatus.success ? '#166534' : '#991b1b',
                      border: `1px solid ${singleSendStatus.success ? '#86efac' : '#fca5a5'}`
                    }}
                  >
                    {singleSendStatus.msg}
                  </div>
                )}

                {/* أزرار الإرسال */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSendSingleWhatsApp}
                    disabled={isSendingSingle}
                    style={{
                      flex: 2,
                      background: isSendingSingle ? '#94a3b8' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      cursor: isSendingSingle ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    <span>{isSendingSingle ? '⏳' : '📲'}</span>
                    <span>{isSendingSingle ? 'جاري الإرسال عبر الخادم...' : (includePdf ? 'إرسال الرسالة مع ملف الـ PDF' : 'إرسال الرسالة نصياً فقط')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenWhatsAppWeb}
                    title="فتح في تطبيق أو ويب واتساب"
                    style={{
                      background: '#ffffff',
                      color: '#059669',
                      border: '1.5px solid #059669',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    🌐 Web
                  </button>
                </div>
              </div>

              {/* زر الطباعة المباشرة */}
              <button
                type="button"
                onClick={handlePrintCertificate}
                style={{
                  background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(15, 118, 110, 0.25)'
                }}
              >
                <span>🖨️</span>
                <span>طباعة الشهادة الرسمية الآن (ورق A4 معتمد)</span>
              </button>
            </div>

            {/* العمود الأيسر: المعاينة الحية المباشرة للشهادة */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(92vh - 110px)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>👁️</span> معاينة حية لشكل الشهادة والـ PDF:
                </div>
                <button
                  type="button"
                  onClick={handlePrintCertificate}
                  style={{
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #a7f3d0',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🖨️ طباعة
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  background: '#525659',
                  padding: '16px',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'center',
                  overflowY: 'auto'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: '750px',
                    background: '#ffffff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    borderRadius: '4px'
                  }}
                >
                  <iframe
                    title="Certificate Live Preview"
                    srcDoc={certificateHtml}
                    style={{
                      width: '100%',
                      height: '840px',
                      border: 'none',
                      display: 'block'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ═════ التبويب الثاني: الإرسال الجماعي لكافة الموظفين المشمولين بالزيادة ═════ */
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              height: '100%',
              maxHeight: 'calc(92vh - 110px)',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: '#0f172a' }}>
                  🚀 إرسال إشعارات وشهادات زيادة الراتب لكافة الموظفين دفعة واحدة
                </h4>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  إرسال ذكي عبر خادم الواتساب مع فواصل زمنية متغيرة لتفادي حظر الأرقام وإرفاق الشهادات الرسمية تلقائياً.
                </p>
              </div>

              {/* خيارات الإرسال الجماعي */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <select
                    value={bulkTemplateId}
                    onChange={(e) => setBulkTemplateId(e.target.value)}
                    style={{ height: '34px', borderRadius: '7px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12px', fontWeight: 700 }}
                  >
                    <option value="promotion_official_certificate">📜 شهادة مفصلة مع القرار</option>
                    <option value="promotion_congrats_brief">🎉 تهنئة موجزة بالزيادة</option>
                  </select>
                </div>

                {/* مفتاح الـ PDF للتبويب الجماعي */}
                <div
                  style={{
                    background: bulkIncludePdf ? '#dcfce7' : '#fee2e2',
                    border: `1.5px solid ${bulkIncludePdf ? '#22c55e' : '#fca5a5'}`,
                    borderRadius: '7px',
                    padding: '5px 10px'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 800, color: bulkIncludePdf ? '#15803d' : '#991b1b' }}>
                    <input
                      type="checkbox"
                      checked={bulkIncludePdf}
                      onChange={(e) => setBulkIncludePdf(e.target.checked)}
                      style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                    />
                    <span>📎 إرفاق ملف الـ PDF لكل موظف</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleStartBulkSending}
                  disabled={isSendingBulk || bulkSelectedEmpIds.length === 0}
                  style={{
                    background: isSendingBulk ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '7px 18px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: isSendingBulk || bulkSelectedEmpIds.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 5px rgba(4, 120, 87, 0.25)'
                  }}
                >
                  <span>{isSendingBulk ? '⏳' : '🚀'}</span>
                  <span>{isSendingBulk ? 'جاري الإطلاق...' : `إرسال إلى (${bulkSelectedEmpIds.length}) موظف`}</span>
                </button>
              </div>
            </div>

            {/* شريط التقدم أو تقرير الإرسال */}
            {isSendingBulk && (
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: '#0f172a' }}>
                  <span>جاري تمرير الحزمة لطابور الواتساب الآمن...</span>
                  <span>{bulkProgress.current} من {bulkProgress.total}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`,
                      height: '100%',
                      background: '#059669',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
              </div>
            )}

            {bulkCompletionReport && (
              <div
                style={{
                  background: bulkCompletionReport.success ? '#ecfdf5' : '#fef2f2',
                  border: `1.5px solid ${bulkCompletionReport.success ? '#10b981' : '#f87171'}`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: bulkCompletionReport.success ? '#065f46' : '#991b1b',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{bulkCompletionReport.success ? '✅' : '❌'} {bulkCompletionReport.message}</span>
                <button
                  type="button"
                  onClick={() => setBulkCompletionReport(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* صندوق البحث والإحصائيات */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="text"
                  value={bulkSearchTerm}
                  onChange={(e) => setBulkSearchTerm(e.target.value)}
                  placeholder="🔍 بحث بالاسم أو الكود أو الفرع..."
                  style={{
                    height: '32px',
                    width: '260px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    padding: '0 10px',
                    fontSize: '12px'
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  المحدد: <strong>{bulkSelectedEmpIds.length}</strong> من <strong>{eligibleEmployeesForBulk.length}</strong> موظف
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleSelectAllBulk}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {bulkSelectedEmpIds.length === eligibleEmployeesForBulk.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                </button>
              </div>
            </div>

            {/* جدول الموظفين المشمولين بالزيادة */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '1.5px solid #cbd5e1', fontWeight: 800 }}>
                    <th style={{ padding: '8px 10px', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={eligibleEmployeesForBulk.length > 0 && bulkSelectedEmpIds.length === eligibleEmployeesForBulk.length}
                        onChange={handleSelectAllBulk}
                      />
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>اسم الموظف والكود</th>
                    <th style={{ padding: '8px 10px' }}>الفرع</th>
                    <th style={{ padding: '8px 10px' }}>رقم الواتساب</th>
                    <th style={{ padding: '8px 10px' }}>السعر قبل</th>
                    <th style={{ padding: '8px 10px' }}>السعر بعد</th>
                    <th style={{ padding: '8px 10px' }}>مقدار الزيادة</th>
                    <th style={{ padding: '8px 10px' }}>تاريخ السريان</th>
                    <th style={{ padding: '8px 10px' }}>معاينة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedBulkEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: '24px', color: '#94a3b8', fontSize: '13px' }}>
                        لم يتم العثور على موظفين يطابقون معايير البحث
                      </td>
                    </tr>
                  ) : (
                    displayedBulkEmployees.map((emp, idx) => {
                      const empInc = emp.lastIncrease || (emp.salaryIncreases && emp.salaryIncreases[emp.salaryIncreases.length - 1]) || {};
                      const isSelected = bulkSelectedEmpIds.includes(emp.id);
                      const phone = getEmpWhatsAppPhone(emp) || emp.phone;
                      const hasValidPhone = Boolean(phone && phone.replace(/\D/g, '').length >= 10);
                      const diff = (parseFloat(empInc.rateAfter) || 0) - (parseFloat(empInc.rateBefore) || 0);

                      return (
                        <tr
                          key={emp.id || idx}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: isSelected ? '#f0fdf4' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc')
                          }}
                        >
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasValidPhone}
                              onChange={() => handleToggleBulkEmp(emp.id)}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                            {getEmpDisplayName(emp)}
                            <span style={{ fontSize: '11px', color: '#64748b', marginRight: '6px' }}>({emp.code})</span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#475569' }}>
                            {emp.branchName || 'الرئيسي'}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: hasValidPhone ? '#059669' : '#dc2626' }}>
                            {hasValidPhone ? `💬 ${phone}` : '❌ بدون رقم'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>
                            {fmt(empInc.rateBefore || 0)} ج.م
                          </td>
                          <td style={{ padding: '8px 10px', color: '#047857', fontWeight: 800 }}>
                            {fmt(empInc.rateAfter || 0)} ج.م
                          </td>
                          <td style={{ padding: '8px 10px', color: '#16a34a', fontWeight: 800 }}>
                            +{fmt(diff > 0 ? diff : 0)} ج.م
                          </td>
                          <td style={{ padding: '8px 10px', color: '#0f766e', fontWeight: 700 }}>
                            {empInc.effectiveDate || empInc.date || '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <button
                              type="button"
                              onClick={() => handleSwitchToEmployeePreview(emp)}
                              style={{
                                background: '#ecfdf5',
                                border: '1px solid #10b981',
                                color: '#065f46',
                                borderRadius: '5px',
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="معاينة وتحرير شهادة هذا الموظف بالتحديد"
                            >
                              👁️ معاينة
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SalaryIncreaseCertificateModal({
  isOpen,
  onClose,
  employee,
  allEmployees = [],
  increaseRecord = null,
  orgSettings = {},
  state = null,
  showToast = (msg) => alert(msg)
}) {
  if (!isOpen || !employee) return null;

  const modalKey = `${employee.id}_${increaseRecord?.id || employee.lastIncrease?.effectiveDate || 'latest'}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
    >
      <SalaryIncreaseCertificateContent
        key={modalKey}
        onClose={onClose}
        employee={employee}
        allEmployees={allEmployees}
        increaseRecord={increaseRecord}
        orgSettings={orgSettings}
        state={state}
        showToast={showToast}
      />
    </div>
  );
}
