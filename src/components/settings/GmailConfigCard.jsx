import React, { useState, useEffect } from 'react';
import { sendGmailEmail, buildEmailTemplate, generateDailyDigestHTML, resolveAdminRecipients, getAuthoritativeGmailConfig } from '../../utils/gmailService';
import { compileDailyDigestData } from '../../utils/digestDataEngine';
import { fmt, getRealTodayStr } from '../../utils/formatters';

export default function GmailConfigCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  ownerLocks
}) {
  const getEffectiveConfig = () => {
    let localSaved = null;
    try {
      const saved = localStorage.getItem('pharmacy_gmail_config');
      if (saved) localSaved = JSON.parse(saved);
    } catch {}

    const stateCfg = state?.orgSettings?.gmailConfig || {};

    // Extract admin emails array safely
    let parsedAdminEmails = [];
    if (Array.isArray(stateCfg.targetAdminEmails) && stateCfg.targetAdminEmails.length > 0) {
      parsedAdminEmails = stateCfg.targetAdminEmails;
    } else if (Array.isArray(localSaved?.targetAdminEmails) && localSaved.targetAdminEmails.length > 0) {
      parsedAdminEmails = localSaved.targetAdminEmails;
    } else {
      const fallbackStr = stateCfg.targetAdminEmail || localSaved?.targetAdminEmail || '';
      if (fallbackStr) {
        parsedAdminEmails = fallbackStr.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      }
    }
    if (parsedAdminEmails.length === 0) {
      parsedAdminEmails = [''];
    }

    return {
      enabled: stateCfg.enabled !== undefined ? Boolean(stateCfg.enabled) : (localSaved?.enabled ?? true),
      userEmail: stateCfg.userEmail || localSaved?.userEmail || '',
      appPassword: stateCfg.appPassword || localSaved?.appPassword || '',
      adminEmails: parsedAdminEmails,
      dailyDigestTime: localSaved?.dailyDigestTime !== undefined ? localSaved.dailyDigestTime : (stateCfg.dailyDigestTime || ''),
      systemUrl: stateCfg.systemUrl || localSaved?.systemUrl || (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file:') && !window.location.origin.includes('localhost') ? window.location.origin : 'https://pharmacy-hr-system.vercel.app'),
      serviceUrl: stateCfg.serviceUrl || localSaved?.serviceUrl || '',
      sendOnRequest: stateCfg.sendOnRequest !== undefined ? Boolean(stateCfg.sendOnRequest) : (localSaved?.sendOnRequest ?? true),
      sendOnDecision: stateCfg.sendOnDecision !== undefined ? Boolean(stateCfg.sendOnDecision) : (localSaved?.sendOnDecision ?? true),
      sendOnLateness: stateCfg.sendOnLateness !== undefined ? Boolean(stateCfg.sendOnLateness) : (localSaved?.sendOnLateness ?? true),
      sendOnPenalty: stateCfg.sendOnPenalty !== undefined ? Boolean(stateCfg.sendOnPenalty) : (localSaved?.sendOnPenalty ?? true),
      sendOnBranchNoShow: stateCfg.sendOnBranchNoShow !== undefined ? Boolean(stateCfg.sendOnBranchNoShow) : (localSaved?.sendOnBranchNoShow ?? true),
      branchNoShowGraceMinutes: localSaved?.branchNoShowGraceMinutes !== undefined && localSaved?.branchNoShowGraceMinutes !== '' && !isNaN(parseInt(localSaved.branchNoShowGraceMinutes, 10))
        ? parseInt(localSaved.branchNoShowGraceMinutes, 10)
        : (stateCfg.branchNoShowGraceMinutes !== undefined && stateCfg.branchNoShowGraceMinutes !== '' && !isNaN(parseInt(stateCfg.branchNoShowGraceMinutes, 10))
        ? parseInt(stateCfg.branchNoShowGraceMinutes, 10)
        : ''),
      sendOnEarlyDepartureBeforeClosing: localSaved?.sendOnEarlyDepartureBeforeClosing !== undefined
        ? Boolean(localSaved.sendOnEarlyDepartureBeforeClosing)
        : (stateCfg.sendOnEarlyDepartureBeforeClosing !== undefined ? Boolean(stateCfg.sendOnEarlyDepartureBeforeClosing) : true),
      earlyDepartureBeforeClosingGraceMinutes: localSaved?.earlyDepartureBeforeClosingGraceMinutes !== undefined && localSaved?.earlyDepartureBeforeClosingGraceMinutes !== '' && !isNaN(parseInt(localSaved.earlyDepartureBeforeClosingGraceMinutes, 10))
        ? parseInt(localSaved.earlyDepartureBeforeClosingGraceMinutes, 10)
        : (stateCfg.earlyDepartureBeforeClosingGraceMinutes !== undefined && stateCfg.earlyDepartureBeforeClosingGraceMinutes !== '' && !isNaN(parseInt(stateCfg.earlyDepartureBeforeClosingGraceMinutes, 10))
        ? parseInt(stateCfg.earlyDepartureBeforeClosingGraceMinutes, 10)
        : ''),
      sendDailyDigest: stateCfg.sendDailyDigest !== undefined ? Boolean(stateCfg.sendDailyDigest) : (localSaved?.sendDailyDigest ?? true)
    };
  };

  const initialConfig = getEffectiveConfig();
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [userEmail, setUserEmail] = useState(initialConfig.userEmail);
  const [appPassword, setAppPassword] = useState(initialConfig.appPassword);
  const [adminEmails, setAdminEmails] = useState(initialConfig.adminEmails);
  const [dailyDigestTime, setDailyDigestTime] = useState(initialConfig.dailyDigestTime);
  const [systemUrl, setSystemUrl] = useState(initialConfig.systemUrl);
  const [serviceUrl, setServiceUrl] = useState(initialConfig.serviceUrl);
  const [sendOnRequest, setSendOnRequest] = useState(initialConfig.sendOnRequest);
  const [sendOnDecision, setSendOnDecision] = useState(initialConfig.sendOnDecision);
  const [sendOnLateness, setSendOnLateness] = useState(initialConfig.sendOnLateness);
  const [sendOnPenalty, setSendOnPenalty] = useState(initialConfig.sendOnPenalty);
  const [sendOnBranchNoShow, setSendOnBranchNoShow] = useState(initialConfig.sendOnBranchNoShow);
  const [branchNoShowGraceMinutes, setBranchNoShowGraceMinutes] = useState(initialConfig.branchNoShowGraceMinutes);
  const [sendOnEarlyDepartureBeforeClosing, setSendOnEarlyDepartureBeforeClosing] = useState(initialConfig.sendOnEarlyDepartureBeforeClosing);
  const [earlyDepartureBeforeClosingGraceMinutes, setEarlyDepartureBeforeClosingGraceMinutes] = useState(initialConfig.earlyDepartureBeforeClosingGraceMinutes);
  const [sendDailyDigest, setSendDailyDigest] = useState(initialConfig.sendDailyDigest);
  const [isTestingUrl, setIsTestingUrl] = useState(false);

  // Sync state if external changes happen
  useEffect(() => {
    const effective = getEffectiveConfig();
    if (effective.enabled !== undefined) setEnabled(effective.enabled);
    if (effective.userEmail) setUserEmail(effective.userEmail);
    if (effective.appPassword) setAppPassword(effective.appPassword);
    if (effective.adminEmails && effective.adminEmails.length > 0) setAdminEmails(effective.adminEmails);
    if (effective.dailyDigestTime) setDailyDigestTime(effective.dailyDigestTime);
    if (effective.systemUrl) setSystemUrl(effective.systemUrl);
    if (effective.serviceUrl) setServiceUrl(effective.serviceUrl);
    if (effective.sendOnRequest !== undefined) setSendOnRequest(effective.sendOnRequest);
    if (effective.sendOnDecision !== undefined) setSendOnDecision(effective.sendOnDecision);
    if (effective.sendOnLateness !== undefined) setSendOnLateness(effective.sendOnLateness);
    if (effective.sendOnPenalty !== undefined) setSendOnPenalty(effective.sendOnPenalty);
    if (effective.sendOnBranchNoShow !== undefined) setSendOnBranchNoShow(effective.sendOnBranchNoShow);
    if (effective.branchNoShowGraceMinutes !== undefined) setBranchNoShowGraceMinutes(effective.branchNoShowGraceMinutes);
    if (effective.sendOnEarlyDepartureBeforeClosing !== undefined) setSendOnEarlyDepartureBeforeClosing(effective.sendOnEarlyDepartureBeforeClosing);
    if (effective.earlyDepartureBeforeClosingGraceMinutes !== undefined) setEarlyDepartureBeforeClosingGraceMinutes(effective.earlyDepartureBeforeClosingGraceMinutes);
    if (effective.sendDailyDigest !== undefined) setSendDailyDigest(effective.sendDailyDigest);
  }, [state?.orgSettings?.gmailConfig]);

  // تحديث فوري لتوقيت الملخص وحفظه محلياً لمنع مسحه تلقائياً
  const handleDailyDigestTimeChange = (newVal) => {
    const cleanVal = String(newVal || '').trim();
    setDailyDigestTime(cleanVal);
    try {
      const raw = localStorage.getItem('pharmacy_gmail_config');
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.dailyDigestTime = cleanVal;
      localStorage.setItem('pharmacy_gmail_config', JSON.stringify(cfg));
    } catch (err) {
      console.warn('[GmailConfig] Time write error:', err);
    }
  };

  // تحديث فوري لمهلة فتح الفرع وحفظها محلياً وفق المدخل تماماً
  const handleBranchNoShowGraceMinutesChange = (newVal) => {
    setBranchNoShowGraceMinutes(newVal);
    try {
      const raw = localStorage.getItem('pharmacy_gmail_config');
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.branchNoShowGraceMinutes = newVal !== '' && !isNaN(parseInt(newVal, 10)) ? parseInt(newVal, 10) : newVal;
      localStorage.setItem('pharmacy_gmail_config', JSON.stringify(cfg));
    } catch (err) {
      console.warn('[GmailConfig] Grace minutes write error:', err);
    }
  };

  // تحديث فوري لمهلة الانصراف قبل الإغلاق وحفظها محلياً وفق المدخل تماماً
  const handleEarlyDepartureGraceMinutesChange = (newVal) => {
    setEarlyDepartureBeforeClosingGraceMinutes(newVal);
    try {
      const raw = localStorage.getItem('pharmacy_gmail_config');
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.earlyDepartureBeforeClosingGraceMinutes = newVal !== '' && !isNaN(parseInt(newVal, 10)) ? parseInt(newVal, 10) : newVal;
      localStorage.setItem('pharmacy_gmail_config', JSON.stringify(cfg));
    } catch (err) {
      console.warn('[GmailConfig] Early departure grace write error:', err);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Handle multi-admin email list inputs
  const handleAdminEmailChange = (index, value) => {
    const nextList = [...adminEmails];
    nextList[index] = value;
    setAdminEmails(nextList);
  };

  const handleAddAdminEmail = () => {
    setAdminEmails([...adminEmails, '']);
  };

  const handleRemoveAdminEmail = (index) => {
    if (adminEmails.length <= 1) {
      setAdminEmails(['']);
      return;
    }
    const nextList = adminEmails.filter((_, i) => i !== index);
    setAdminEmails(nextList);
  };

  const gmailScriptCode = `/**
 * ✉️ كود Google Apps Script لإرسال إشعارات بريد Gmail ونظام الموارد البشرية
 * قم بلصقه في https://script.google.com/ وانشره كتطبيق ويب (Web app).
 */
function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    
    if (data.action === 'ping' || data.action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'خدمة بريد Gmail ونظام الموارد البشرية متصلة وتعمل بكفاءة ✅'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var recipient = data.recipient || data.to || data.targetEmail;
    if (Array.isArray(recipient)) {
      recipient = recipient.join(',');
    }
    var subject = data.subject || 'تنبيه من نظام الموارد البشرية للصيدليات';
    var htmlBody = data.htmlBody || data.htmlContent || data.html || data.body;
    var textBody = data.textBody || data.textContent || data.text || 'يرجى تفعيل عرض HTML لعرض تفاصيل الإشعار.';
    var senderName = data.senderName || 'نظام إدارة الصيدليات والموارد البشرية';

    if (!recipient) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'لم يتم تحديد البريد الإلكتروني للمستلم'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: textBody,
      htmlBody: htmlBody,
      name: senderName
    });

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'تم إرسال البريد الإلكتروني بنجاح ✅'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    status: 'online',
    message: 'خدمة إرسال إشعارات بريد Gmail لنظام الموارد البشرية تعمل بكفاءة ✅'
  })).setMimeType(ContentService.MimeType.JSON);
}`;

  const copyScriptToClipboard = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(gmailScriptCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSave = async (e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const nowIso = new Date().toISOString();

    const cleanedAdminEmails = (adminEmails || [])
      .map(s => String(s || '').trim())
      .filter(Boolean);
    const targetAdminEmailStr = cleanedAdminEmails.join(', ');
    const cleanedSystemUrl = String(systemUrl || '').trim();
    const cleanedUserEmail = String(userEmail || '').trim();
    const cleanedAppPassword = String(appPassword || '').trim();
    const cleanedServiceUrl = String(serviceUrl || '').trim();
    const cleanedDigestTime = String(dailyDigestTime || '').trim();

    const updatedConfig = {
      enabled: Boolean(enabled),
      userEmail: cleanedUserEmail,
      appPassword: cleanedAppPassword,
      targetAdminEmail: targetAdminEmailStr,
      targetAdminEmails: cleanedAdminEmails,
      dailyDigestTime: cleanedDigestTime,
      systemUrl: cleanedSystemUrl,
      serviceUrl: cleanedServiceUrl,
      sendOnRequest: Boolean(sendOnRequest),
      sendOnDecision: Boolean(sendOnDecision),
      sendOnLateness: Boolean(sendOnLateness),
      sendOnPenalty: Boolean(sendOnPenalty),
      sendOnBranchNoShow: Boolean(sendOnBranchNoShow),
      branchNoShowGraceMinutes: branchNoShowGraceMinutes !== '' && !isNaN(parseInt(branchNoShowGraceMinutes, 10)) ? parseInt(branchNoShowGraceMinutes, 10) : 0,
      sendOnEarlyDepartureBeforeClosing: Boolean(sendOnEarlyDepartureBeforeClosing),
      earlyDepartureBeforeClosingGraceMinutes: earlyDepartureBeforeClosingGraceMinutes !== '' && !isNaN(parseInt(earlyDepartureBeforeClosingGraceMinutes, 10)) ? parseInt(earlyDepartureBeforeClosingGraceMinutes, 10) : 0,
      sendDailyDigest: Boolean(sendDailyDigest),
      updatedAt: nowIso
    };

    setIsSaving(true);

    // 1. حفظ فوري في LocalStorage لضمان بقاء البيانات حتى قبل أو أثناء المزامنة
    try {
      localStorage.setItem('pharmacy_gmail_config', JSON.stringify(updatedConfig));
      if (cleanedSystemUrl) {
        localStorage.setItem('pharmacy_system_url', cleanedSystemUrl);
      }
    } catch (lsErr) {
      console.warn('[GmailConfig] LocalStorage write error:', lsErr);
    }

    const performSave = () => {
      try {
        const currentOrg = state?.orgSettings || {};
        const updatedOrgSettings = {
          ...currentOrg,
          systemUrl: cleanedSystemUrl || currentOrg.systemUrl,
          gmailConfig: updatedConfig,
          updatedAt: nowIso
        };

        if (!updatedOrgSettings.officialEmail && updatedConfig.userEmail) {
          updatedOrgSettings.officialEmail = updatedConfig.userEmail;
        }
        if (!updatedOrgSettings.email && updatedConfig.userEmail) {
          updatedOrgSettings.email = updatedConfig.userEmail;
        }

        const updatedState = {
          ...state,
          orgSettings: updatedOrgSettings
        };

        // 1. تحديث الحالة المحلية والواجهة فورياً (0ms استجابة لحظية)
        setState(updatedState);
        setIsSaving(false);
        setIsSavedSuccess(true);
        setTimeout(() => setIsSavedSuccess(false), 2500);
        showToast?.('⚡ تم حفظ وتفعيل إعدادات بريد Gmail ورابط المنظومة بنجاح');

        // 2. المزامنة السحابية في الخلفية دون تعطيل واجهة المستخدم
        if (typeof saveState === 'function') {
          saveState(updatedState).catch((err) => {
            console.warn('[GmailConfigCard] Background sync warning:', err);
          });
        }
      } catch (err) {
        console.error('[GmailConfigCard] performSave error:', err);
        setIsSaving(false);
        showToast?.('⚠️ حدث خطأ أثناء الحفظ: ' + (err.message || 'خطأ غير متوقع'));
      }
    };

    try {
      if (executeWithOwnerGuard && (ownerLocks?.lockGmailSettings || state?.orgSettings?.ownerModificationLocks?.lockGmailSettings)) {
        executeWithOwnerGuard({
          lockKey: 'lockGmailSettings',
          actionTitle: 'تحديث إعدادات Gmail والتنبيهات',
          actionDetails: `بريد الإرسال: ${cleanedUserEmail || '—'} · مستلمو الإدارة: ${targetAdminEmailStr || 'غير محدد'}`,
          onExecute: performSave
        });
        setIsSaving(false);
        return;
      }
      performSave();
    } catch (guardErr) {
      console.warn('[GmailConfigCard] executeWithOwnerGuard fallback:', guardErr);
      performSave();
    }
  };

  const handleSendTestEmail = async () => {
    try {
      const authConfig = getAuthoritativeGmailConfig(state);
      const activeSenderEmail = String(userEmail || '').trim() || authConfig.userEmail;
      const activeAppPassword = String(appPassword || '').trim() || authConfig.appPassword;
      const activeServiceUrl = String(serviceUrl || '').trim() || authConfig.serviceUrl || 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec';

      if (!activeSenderEmail) {
        showToast?.('⚠️ يرجى إدخال بريد Gmail المُرْسِل أولاً');
        return;
      }

      setIsSendingTest(true);
      showToast?.('⏳ جاري إرسال إيميل التجربة للإدارة...');

      const cleanedAdminEmails = (adminEmails || []).map(s => String(s || '').trim()).filter(Boolean);
      const testConfig = {
        enabled: true,
        userEmail: activeSenderEmail,
        appPassword: activeAppPassword,
        targetAdminEmail: cleanedAdminEmails.join(', '),
        targetAdminEmails: cleanedAdminEmails,
        systemUrl: String(systemUrl || '').trim() || authConfig.systemUrl,
        serviceUrl: activeServiceUrl
      };

      const targetRecipients = resolveAdminRecipients(testConfig);
      const recipientDisplay = targetRecipients.length > 0 ? targetRecipients.join(' و ') : activeSenderEmail;

      const html = buildEmailTemplate({
        title: '🧪 اختبار الربط المباشر مع Gmail',
        subtitle: 'اختبار توصيل التنبيهات والإشعارات البريدية للإدارة',
        badgeText: 'رسالة اختبار ناجحة',
        badgeColor: '#16a34a',
        bodyContent: `
          <p>مرحباً بكم مسؤولي الإدارة العليا،</p>
          <p>هذه الرسالة تؤكد أن **نظام الربط المباشر مع Gmail** يعمل بكفاءة ومربوط بحسابات الإدارة المعتمدة.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 10px; margin: 12px 0;">
            <p style="margin:0 0 6px; color: #166534; font-weight: bold;">✅ تم توثيق الاتصال بنجاح!</p>
            <p style="margin:0; color: #15803d; font-size: 13.5px;">
              ستصلكم التنبيهات الفورية لطلبات الموظفين والإنذارات وملخص اليوم الشامل ${dailyDigestTime ? `(المقرر إرساله يومياً في تمام الساعة <strong>${dailyDigestTime}</strong>)` : ''} على كافة العناوين المسجلة.
            </p>
          </div>
        `
      });

      const res = await sendGmailEmail({
        gmailConfig: testConfig,
        recipientEmail: targetRecipients.length > 0 ? targetRecipients : activeSenderEmail,
        subject: '🧪 اختبار الربط المباشر مع Gmail — نظام إدارة الصيدليات والموارد البشرية',
        htmlContent: html
      });

      setIsSendingTest(false);
      if (res.success) {
        showToast?.(`✅ تم إرسال الإيميل التجريبي بنجاح إلى: (${recipientDisplay})`);
      } else {
        showToast?.(`⚠️ تعذر الإرسال: ${res.reason || res.error || 'تأكد من البيانات'}`);
      }
    } catch (err) {
      console.error('[GmailConfigCard] handleSendTestEmail error:', err);
      setIsSendingTest(false);
      showToast?.(`❌ تعذر إرسال الإيميل التجريبي: ${err.message || 'خطأ غير متوقع'}`);
    }
  };

  const handleOpenPreview = () => {
    try {
      const dateToday = getRealTodayStr();
      const digestData = compileDailyDigestData(state, dateToday);
      const html = generateDailyDigestHTML(digestData, state?.orgSettings);
      setPreviewHtml(html);
      setShowPreviewModal(true);
    } catch (err) {
      console.error('[GmailConfigCard] handleOpenPreview error:', err);
      showToast?.('⚠️ تعذر تجهيز المعاينة: ' + (err.message || 'خطأ في تجميع البيانات'));
    }
  };

  const handleTestServiceUrl = async () => {
    const targetUrl = String(serviceUrl || '').trim();
    if (!targetUrl) {
      showToast?.('⚠️ يرجى إدخال رابط Webhook الخدمة أولاً لفحصه');
      return;
    }
    if (targetUrl.includes('AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO')) {
      showToast?.('⚠️ هذا الرابط هو معرف تجريبي افتراضي غير منشور. يرجى نشر الكود بحسابك ولصق الرابط الجديد الخاص بك');
      return;
    }

    setIsTestingUrl(true);
    showToast?.('🔍 جاري فحص الرابط واختبار الاتصال مع Google Apps Script...');
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ping' })
      });
      const text = await res.text();
      setIsTestingUrl(false);

      if (text.includes('<!DOCTYPE') || text.includes('accounts.google.com')) {
        showToast?.('⚠️ الرابط يتطلب تسجيل دخول Google! تأكد من اختيار "Anyone" في خانة (Who has access) عند نشر السكربت');
      } else {
        try {
          const json = JSON.parse(text);
          if (json.success) {
            showToast?.('✅ ممتاز! رابط الخدمة يعمل بكفاءة والاتصال بـ Google Apps Script متصل بنجاح.');
          } else {
            showToast?.('⚠️ الرابط استجاب: ' + (json.error || json.message || 'فحص السكربت'));
          }
        } catch {
          showToast?.('✅ تم الاتصال برابط السكربت بنجاح.');
        }
      }
    } catch (err) {
      setIsTestingUrl(false);
      showToast?.('⚠️ تعذر قراءة الاستجابة مباشرة بسبب قيود CORS في المتصفح، ولكن قد يكون الرابط صالحاً.');
    }
  };

  const handleTriggerDailyDigestNow = async () => {
    try {
      setIsSendingDigest(true);
      showToast?.('⏳ جاري تدقيق وتجميع بيانات اليوم وإرسال الملخص الشامل...');

      const authConfig = getAuthoritativeGmailConfig(state);
      const cleanedAdminEmails = (adminEmails || []).map(s => String(s || '').trim()).filter(Boolean);

      const effectiveAdminEmails = cleanedAdminEmails.length > 0
        ? cleanedAdminEmails
        : (authConfig.targetAdminEmails?.length > 0 ? authConfig.targetAdminEmails : resolveAdminRecipients(authConfig));

      const activeServiceUrl = String(serviceUrl || '').trim() || authConfig.serviceUrl;
      const activeSenderEmail = String(userEmail || '').trim() || authConfig.userEmail;

      if (!activeServiceUrl) {
        setIsSendingDigest(false);
        showToast?.('⚠️ يرجى إدخال رابط Webhook الخدمة في الحقل المخصص أعلاه');
        return;
      }

      if (activeServiceUrl.includes('AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO')) {
        setIsSendingDigest(false);
        showToast?.('⚠️ رابط الخدمة الحالي هو معرف افتراضي تجريبي. يرجى لصق رابط السكربت الخاص بك بعد نشره من زر (طريقة التفعيل في دقيقة) أعلاه');
        return;
      }

      let targetRecipients = [...effectiveAdminEmails];
      if (targetRecipients.length === 0 && activeSenderEmail && activeSenderEmail.includes('@')) {
        targetRecipients = [activeSenderEmail];
      }
      if (targetRecipients.length === 0) {
        setIsSendingDigest(false);
        showToast?.('⚠️ يرجى إدخال بريد إلكتروني واحد على الأقل في قائمة إيميلات الإدارة أو بريد الإرسال');
        return;
      }

      const testConfig = {
        enabled: true, // فرض التفعيل للإرسال اليدوي المباشر
        userEmail: activeSenderEmail,
        appPassword: String(appPassword || '').trim() || authConfig.appPassword,
        targetAdminEmail: targetRecipients.join(', '),
        targetAdminEmails: targetRecipients,
        systemUrl: String(systemUrl || '').trim() || authConfig.systemUrl,
        serviceUrl: activeServiceUrl
      };

      const dateToday = getRealTodayStr();
      let digestData = null;
      try {
        digestData = compileDailyDigestData(state, dateToday);
      } catch (compileErr) {
        console.warn('[GmailConfigCard] compileDailyDigestData error:', compileErr);
      }

      const html = generateDailyDigestHTML(digestData, state?.orgSettings);

      const res = await sendGmailEmail({
        gmailConfig: testConfig,
        recipientEmail: targetRecipients,
        subject: `📊 ملخص اليوم الشامل ${dailyDigestTime ? `(${dailyDigestTime}) ` : ''}— ${dateToday}`,
        htmlContent: html
      });

      setIsSendingDigest(false);
      if (res.success) {
        showToast?.(`📊 تم إرسال ملخص اليوم الشامل بنجاح إلى: (${targetRecipients.join(', ')})`);
      } else {
        showToast?.(`⚠️ تعذر إرسال الملخص اليومي: ${res.reason || res.error || 'تأكد من بيانات الربط'}`);
      }
    } catch (err) {
      console.error('[GmailConfigCard] handleTriggerDailyDigestNow error:', err);
      setIsSendingDigest(false);
      showToast?.(`❌ تعذر إرسال الملخص اليومي: ${err.message || 'خطأ غير متوقع'}`);
    }
  };

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); handleSave(e); }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px' }}>
      {/* ── Card Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '17px' }}>
            ✉️ إعدادات بريد Gmail والإشعارات الفورية والملخص اليومي الشامل
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '5px 0 0' }}>
            إرسال إشعارات الطلبات الفورية، إنذارات فتح الفروع، وملخص اليوم التنفيذي الشامل لكافة مسؤولي الإدارة
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowScriptModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
            }}
          >
            <span>📖</span>
            <span>طريقة التفعيل في دقيقة (مع الكود الجاهز)</span>
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            تفعيل خدمة الإشعارات عبر Gmail
          </label>
        </div>
      </div>

      {/* ── Basic Credentials Inputs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📤</span> بريد Gmail المُرْسِل (Sender Gmail)
          </label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="pharmacy.admin@gmail.com"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            حساب Gmail المستخدم في إرسال الإيميلات للجميع.
          </span>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔑</span> كلمة سر التطبيقات (Gmail App Password)
          </label>
          <input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="•••• •••• •••• ••••"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            كلمة مرور تطبيقات جوجل المكونة من 16 حرفاً.
          </span>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <span>🔗</span> رابط المنظومة (أزرار الإيميلات)
            </label>
            {typeof window !== 'undefined' && window.location?.origin && (
              <button
                type="button"
                onClick={() => setSystemUrl(window.location.origin)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary, #0284c7)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '0 4px',
                  textDecoration: 'underline'
                }}
                title="استخدام رابط المتصفح الحالي"
              >
                🔄 الرابط الحالي
              </button>
            )}
          </div>
          <input
            type="text"
            value={systemUrl}
            onChange={(e) => setSystemUrl(e.target.value)}
            placeholder="https://your-domain.vercel.app"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            الرابط الذي تفتح عليه أزرار الإيميل لاتخاذ القرار والدخول المباشر.
          </span>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <span>⏰</span> موعد الإرسال التلقائي للملخص الشامل
            </label>
            {dailyDigestTime && (
              <button
                type="button"
                onClick={() => handleDailyDigestTimeChange('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '0 4px'
                }}
                title="مسح التوقيت وإلغاء الإرسال التلقائي اليومي"
              >
                ✕ مسح التوقيت
              </button>
            )}
          </div>
          <input
            type="time"
            value={dailyDigestTime || ''}
            onChange={(e) => handleDailyDigestTimeChange(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 800 }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            {dailyDigestTime 
              ? `يتم إرسال الملخص الشامل تلقائياً في الساعة (${dailyDigestTime}) يومياً.` 
              : 'اتركه فارغاً للإرسال اليدوي فقط دون أي إرسال تلقائي.'}
          </span>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <span>🌐</span> رابط Webhook الخدمة (Apps Script URL)
            </label>
            <button
              type="button"
              onClick={handleTestServiceUrl}
              disabled={isTestingUrl}
              style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                borderRadius: '6px',
                padding: '2px 8px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="اختبار الاتصال برابط Webhook للتأكد من أنه يعمل ومتاح للجميع"
            >
              {isTestingUrl ? '⏳ جاري الفحص...' : '🔍 فحص الرابط'}
            </button>
          </div>
          <input
            type="text"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface-muted)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            رابط Webhook الآمن لخدمة Google Apps Script.
          </span>
        </div>
      </div>

      {/* ── Multi Admin Recipients Inputs (Dynamic List with + Button) ── */}
      <div style={{ background: 'var(--surface-muted, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', padding: '18px 20px', borderRadius: '14px', marginBottom: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <label style={{ fontWeight: 800, fontSize: '14px', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>👥</span> قائمة إيميلات الإدارة المستلمة للإشعارات والملخص الشامل (Admin Receivers)
            </label>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              يمكنك إضافة أكثر من إيميل في حقول منفصلة ليصل الملخص وطلبات الموظفين والإنذارات لجميع الشركاء ومسؤولي الإدارة في وقت واحد.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddAdminEmail}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <span>➕</span>
            <span>إضافة إيميل إدارة آخر</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {adminEmails.map((email, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--muted)', width: '28px', textAlign: 'center' }}>
                #{idx + 1}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => handleAdminEmailChange(idx, e.target.value)}
                placeholder={`أدخل البريد الإلكتروني للمسؤول ${idx + 1} (مثال: owner@pharmacy.com)`}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '13.5px',
                  fontWeight: 600
                }}
              />
              {adminEmails.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveAdminEmail(idx)}
                  title="حذف هذا البريد"
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    borderRadius: '10px',
                    width: '38px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '15px',
                    flexShrink: 0
                  }}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Notification Events Toggles ── */}
      <h5 style={{ margin: '16px 0 12px', fontFamily: 'Cairo', color: 'var(--primary-dark)', fontSize: '14.5px' }}>
        ⚙️ تحديد الأحداث التي تُطلق إيميل إشعار فوري:
      </h5>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendOnRequest} onChange={(e) => setSendOnRequest(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>📋 إرسال إيميل فوري عند إرسال أي طلب جديد من الموظف</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendOnDecision} onChange={(e) => setSendOnDecision(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>✅ إرسال إيميل فوري للموظف عند اعتماد أو رفض طلبه</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendOnLateness} onChange={(e) => setSendOnLateness(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>⏰ إرسال إيميل فوري عند تأخر الموظف عن موعد الوردية</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendOnPenalty} onChange={(e) => setSendOnPenalty(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>⚠️ إرسال إيميل فوري عند تطبيق وتوثيق جزاء لائحي أو خصم</span>
        </label>

        <div style={{ background: '#fef2f2', padding: '14px 16px', borderRadius: '12px', border: '1px solid #fca5a5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={sendOnBranchNoShow}
              onChange={(e) => setSendOnBranchNoShow(e.target.checked)}
              style={{ width: '17px', height: '17px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#991b1b' }}>
              🚨 إنذار طوارئ: عدم تسجيل أي بصمة حضور بالفرع بعد موعد فتحه
            </span>
          </label>

          {sendOnBranchNoShow && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingRight: '27px', borderTop: '1px dashed #fca5a5', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#7f1d1d' }}>
                  ⏳ مهلة السماح بعد موعد الفتح:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    step="5"
                    value={branchNoShowGraceMinutes}
                    onChange={(e) => handleBranchNoShowGraceMinutesChange(e.target.value)}
                    style={{
                      width: '72px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: '1.5px solid #f87171',
                      background: '#ffffff',
                      color: '#991b1b',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b' }}>دقيقة</span>
                </div>
              </div>

              {/* أزرار سريعة لاختيار المهلة */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {[0, 15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleBranchNoShowGraceMinutesChange(mins)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: Number(branchNoShowGraceMinutes) === mins ? '1.5px solid #dc2626' : '1px solid #fca5a5',
                      background: Number(branchNoShowGraceMinutes) === mins ? '#fee2e2' : '#ffffff',
                      color: Number(branchNoShowGraceMinutes) === mins ? '#991b1b' : '#7f1d1d',
                      fontSize: '11.5px',
                      fontWeight: Number(branchNoShowGraceMinutes) === mins ? 800 : 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {mins} دقيقة
                  </button>
                ))}
              </div>

              <div style={{ width: '100%', fontSize: '11.5px', color: '#7f1d1d', lineHeight: 1.5 }}>
                ℹ️ يتم إرسال إيميل إنذار طوارئ فوري للإدارة تلقائياً إذا مضت <strong>{branchNoShowGraceMinutes !== '' && branchNoShowGraceMinutes !== undefined ? branchNoShowGraceMinutes : 0} دقيقة</strong> من موعد فتح أي فرع دون قيام أي موظف من طاقمه بتسجيل بصمة حضور.
              </div>
            </div>
          )}
        </div>

        <div style={{ background: '#fff7ed', padding: '14px 16px', borderRadius: '12px', border: '1px solid #fdba74', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={sendOnEarlyDepartureBeforeClosing}
              onChange={(e) => setSendOnEarlyDepartureBeforeClosing(e.target.checked)}
              style={{ width: '17px', height: '17px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#c2410c' }}>
              ⚠️ إنذار إداري: تسجيل بصمة انصراف الموظف قبل موعد إغلاق الفرع بمدة غير مسموح بها
            </span>
          </label>

          {sendOnEarlyDepartureBeforeClosing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingRight: '27px', borderTop: '1px dashed #fdba74', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#9a3412' }}>
                  ⏳ فترة السماح قبل موعد الإغلاق:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <input
                    type="number"
                    min="0"
                    max="240"
                    step="5"
                    value={earlyDepartureBeforeClosingGraceMinutes}
                    onChange={(e) => handleEarlyDepartureGraceMinutesChange(e.target.value)}
                    style={{
                      width: '72px',
                      padding: '5px 8px',
                      borderRadius: '8px',
                      border: '1.5px solid #fb923c',
                      background: '#ffffff',
                      color: '#c2410c',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c' }}>دقيقة</span>
                </div>
              </div>

              {/* أزرار سريعة لاختيار المهلة */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {[0, 10, 15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleEarlyDepartureGraceMinutesChange(mins)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: Number(earlyDepartureBeforeClosingGraceMinutes) === mins ? '1.5px solid #ea580c' : '1px solid #fdba74',
                      background: Number(earlyDepartureBeforeClosingGraceMinutes) === mins ? '#ffedd5' : '#ffffff',
                      color: Number(earlyDepartureBeforeClosingGraceMinutes) === mins ? '#c2410c' : '#9a3412',
                      fontSize: '11.5px',
                      fontWeight: Number(earlyDepartureBeforeClosingGraceMinutes) === mins ? 800 : 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {mins} دقيقة
                  </button>
                ))}
              </div>

              <div style={{ width: '100%', fontSize: '11.5px', color: '#9a3412', lineHeight: 1.5 }}>
                ℹ️ يتم إرسال إيميل تنبيه فوري للإدارة تلقائياً إذا قام الموظف بتسجيل بصمة انصراف قبل موعد إغلاق الفرع بأكثر من <strong>{earlyDepartureBeforeClosingGraceMinutes !== '' && earlyDepartureBeforeClosingGraceMinutes !== undefined ? earlyDepartureBeforeClosingGraceMinutes : 0} دقيقة</strong>.
              </div>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0fdf4', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendDailyDigest} onChange={(e) => setSendDailyDigest(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
            📊 إرسال إيميل الملخص الشامل التلقائي {dailyDigestTime ? `في موعده المحدد (${dailyDigestTime})` : '(إرسال يدوي فقط عند الطلب)'}
          </span>
        </label>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={handleSendTestEmail} disabled={isSendingTest} style={{ fontSize: '13px', fontWeight: 700 }}>
            {isSendingTest ? '⏳ جاري الإرسال...' : '🧪 إرسال إيميل تجريبي للإدارة'}
          </button>

          <button type="button" className="btn btn-ghost" onClick={handleOpenPreview} style={{ fontSize: '13px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
            👁️ معاينة شكل الملخص الشامل
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleTriggerDailyDigestNow}
            disabled={isSendingDigest}
            style={{ fontSize: '13px', fontWeight: 700, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}
          >
            {isSendingDigest ? '⏳ جاري تدقيق وإرسال الملخص الشامل...' : '📊 إرسال الملخص اليومي الشامل الآن'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="btn btn-start"
          style={{
            padding: '10px 24px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.85 : 1,
            background: isSavedSuccess ? '#16a34a' : undefined,
            boxShadow: isSavedSuccess ? '0 0 12px rgba(22, 163, 74, 0.4)' : undefined,
            transition: 'all 0.25s ease'
          }}
        >
          {isSaving ? '⏳ جاري الحفظ والتأمين...' : (isSavedSuccess ? '✓ تم الحفظ والتفعيل فورياً' : '💾 حفظ وتفعيل إعدادات بريد Gmail')}
        </button>
      </div>

      {/* ── Live Digest HTML Preview Modal ── */}
      {showPreviewModal && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '840px', width: '95%', height: '88vh', display: 'flex', flexDirection: 'column', background: '#f8fafc', borderRadius: '16px', overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>👁️ معاينة شكل إيميل الملخص اليومي الشامل (Live Preview)</h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
                  هكذا يبدو التقرير الشامل عند وصوله في بريد مسؤولي الإدارة ببيانات اليوم الحقيقية
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <iframe
                title="Preview"
                srcDoc={previewHtml}
                style={{ width: '100%', height: '100%', minHeight: '600px', border: 'none', borderRadius: '10px', background: '#f1f5f9' }}
              />
            </div>

            <div style={{ padding: '12px 20px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                💡 يتضمن التقرير الشامل: بطاقات الحضور الحية، مبيعات وحركة الخزينة بكل فرع، وجدول كافة طلبات اليوم بمختلف أنواعها.
              </span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={async () => {
                    setShowPreviewModal(false);
                    await handleTriggerDailyDigestNow();
                  }}
                  disabled={isSendingDigest}
                  style={{ fontSize: '12.5px', padding: '7px 16px', fontWeight: 700 }}
                >
                  {isSendingDigest ? '⏳ جاري الإرسال...' : '📊 إرسال هذا الملخص الآن للإدارة'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowPreviewModal(false)} style={{ fontWeight: 700 }}>
                  إغلاق المعاينة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Script & Setup Modal for Gmail ── */}
      {showScriptModal && (
        <div className="modal-overlay" onClick={() => setShowScriptModal(false)} style={{ zIndex: 9999 }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px', width: '95%' }}>
            <div className="badge-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>✉️</span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>طريقة تفعيل إعدادات بريد Gmail والإشعارات الفورية مع المنظومة في دقيقة واحدة</h3>
              </div>
              <button type="button" className="close-btn" onClick={() => setShowScriptModal(false)}>✕</button>
            </div>

            <div className="badge-body" style={{ textAlign: 'right', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '18px' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1d4ed8', fontSize: '15px' }}>📌 خطوات الإعداد البسيطة:</h4>
                <ol style={{ margin: 0, paddingRight: '20px', lineHeight: 1.8, fontSize: '13.5px' }}>
                  <li>افتح الرابط: <a href="https://script.google.com/home/start" target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontWeight: 'bold' }}>Google Apps Script</a> بحساب الجيميل الخاص بك.</li>
                  <li>اضغط على <strong>"مشروع جديد" (New project)</strong>.</li>
                  <li>امسح أي كود موجود، واضغط على زر <strong>"نسخ الكود"</strong> بالأسفل والصقه في المحرر.</li>
                  <li>اضغط على زر <strong>"نشر" (Deploy)</strong> بالأعلى ثم اختر <strong>"نشر جديد" (New deployment)</strong>.</li>
                  <li>اضغط على أيقونة الترس ⚙️ واختر <strong>"تطبيق ويب" (Web app)</strong>.</li>
                  <li>في حقل <i>"من يمكنه الوصول" (Who has access)</i> اختر: <strong>"أي مستخدم" (Anyone)</strong>.</li>
                  <li>اضغط <strong>"نشر" (Deploy)</strong> وامنح الأذونات لحسابك (Authorize Access).</li>
                  <li>انسخ رابط <strong>"عنوان URL لتطبيق الويب" (Web app URL)</strong> والصقه في حقل الإعدادات أعلاه!</li>
                </ol>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>كود السكربت الجاهز:</span>
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={copyScriptToClipboard}
                  style={{ padding: '6px 16px', fontSize: '12.5px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  {isCopied ? '✅ تم النسخ!' : '📋 نسخ الكود بالكامل'}
                </button>
              </div>

              <pre style={{
                background: '#0f172a',
                color: '#38bdf8',
                padding: '16px',
                borderRadius: '10px',
                fontSize: '12px',
                lineHeight: 1.5,
                overflowX: 'auto',
                direction: 'ltr',
                textAlign: 'left',
                maxHeight: '260px'
              }}>
                {gmailScriptCode}
              </pre>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowScriptModal(false)} style={{ padding: '8px 20px', borderRadius: '8px', cursor: 'pointer' }}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
