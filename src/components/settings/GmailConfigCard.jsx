import React, { useState, useEffect } from 'react';
import { sendGmailEmail, buildEmailTemplate, generateDailyDigestHTML, resolveAdminRecipients } from '../../utils/gmailService';
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
      dailyDigestTime: stateCfg.dailyDigestTime || localSaved?.dailyDigestTime || '23:59',
      serviceUrl: stateCfg.serviceUrl || localSaved?.serviceUrl || 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec',
      sendOnRequest: stateCfg.sendOnRequest !== undefined ? Boolean(stateCfg.sendOnRequest) : (localSaved?.sendOnRequest ?? true),
      sendOnDecision: stateCfg.sendOnDecision !== undefined ? Boolean(stateCfg.sendOnDecision) : (localSaved?.sendOnDecision ?? true),
      sendOnLateness: stateCfg.sendOnLateness !== undefined ? Boolean(stateCfg.sendOnLateness) : (localSaved?.sendOnLateness ?? true),
      sendOnPenalty: stateCfg.sendOnPenalty !== undefined ? Boolean(stateCfg.sendOnPenalty) : (localSaved?.sendOnPenalty ?? true),
      sendOnBranchNoShow: stateCfg.sendOnBranchNoShow !== undefined ? Boolean(stateCfg.sendOnBranchNoShow) : (localSaved?.sendOnBranchNoShow ?? true),
      sendDailyDigest: stateCfg.sendDailyDigest !== undefined ? Boolean(stateCfg.sendDailyDigest) : (localSaved?.sendDailyDigest ?? true)
    };
  };

  const initialConfig = getEffectiveConfig();
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [userEmail, setUserEmail] = useState(initialConfig.userEmail);
  const [appPassword, setAppPassword] = useState(initialConfig.appPassword);
  const [adminEmails, setAdminEmails] = useState(initialConfig.adminEmails);
  const [dailyDigestTime, setDailyDigestTime] = useState(initialConfig.dailyDigestTime);
  const [serviceUrl, setServiceUrl] = useState(initialConfig.serviceUrl);
  const [sendOnRequest, setSendOnRequest] = useState(initialConfig.sendOnRequest);
  const [sendOnDecision, setSendOnDecision] = useState(initialConfig.sendOnDecision);
  const [sendOnLateness, setSendOnLateness] = useState(initialConfig.sendOnLateness);
  const [sendOnPenalty, setSendOnPenalty] = useState(initialConfig.sendOnPenalty);
  const [sendOnBranchNoShow, setSendOnBranchNoShow] = useState(initialConfig.sendOnBranchNoShow);
  const [sendDailyDigest, setSendDailyDigest] = useState(initialConfig.sendDailyDigest);

  // Sync state if external changes happen
  useEffect(() => {
    const effective = getEffectiveConfig();
    if (effective.enabled !== undefined) setEnabled(effective.enabled);
    if (effective.userEmail) setUserEmail(effective.userEmail);
    if (effective.appPassword) setAppPassword(effective.appPassword);
    if (effective.adminEmails && effective.adminEmails.length > 0) setAdminEmails(effective.adminEmails);
    if (effective.dailyDigestTime) setDailyDigestTime(effective.dailyDigestTime);
    if (effective.serviceUrl) setServiceUrl(effective.serviceUrl);
    if (effective.sendOnRequest !== undefined) setSendOnRequest(effective.sendOnRequest);
    if (effective.sendOnDecision !== undefined) setSendOnDecision(effective.sendOnDecision);
    if (effective.sendOnLateness !== undefined) setSendOnLateness(effective.sendOnLateness);
    if (effective.sendOnPenalty !== undefined) setSendOnPenalty(effective.sendOnPenalty);
    if (effective.sendOnBranchNoShow !== undefined) setSendOnBranchNoShow(effective.sendOnBranchNoShow);
    if (effective.sendDailyDigest !== undefined) setSendDailyDigest(effective.sendDailyDigest);
  }, [state?.orgSettings?.gmailConfig]);

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
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
    if (e) e.preventDefault();
    const nowIso = new Date().toISOString();

    const cleanedAdminEmails = adminEmails.map(s => String(s || '').trim()).filter(Boolean);
    const targetAdminEmailStr = cleanedAdminEmails.join(', ');

    const updatedConfig = {
      enabled,
      userEmail: userEmail.trim(),
      appPassword: appPassword.trim(),
      targetAdminEmail: targetAdminEmailStr,
      targetAdminEmails: cleanedAdminEmails,
      dailyDigestTime: dailyDigestTime.trim() || '23:59',
      serviceUrl: serviceUrl.trim(),
      sendOnRequest,
      sendOnDecision,
      sendOnLateness,
      sendOnPenalty,
      sendOnBranchNoShow,
      sendDailyDigest,
      updatedAt: nowIso
    };

    // 1. حفظ فوري في LocalStorage لضمان بقاء البيانات حتى قبل أو أثناء المزامنة
    try {
      localStorage.setItem('pharmacy_gmail_config', JSON.stringify(updatedConfig));
    } catch (lsErr) {
      console.warn('[GmailConfig] LocalStorage write error:', lsErr);
    }

    const performSave = async () => {
      const currentOrg = state?.orgSettings || {};
      const updatedOrgSettings = {
        ...currentOrg,
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
        orgSettings: updatedOrgSettings,
        updatedAt: nowIso
      };

      if (setState) setState(updatedState);
      if (saveState) {
        try {
          await saveState(updatedState);
        } catch (saveErr) {
          console.warn('[GmailConfig] Cloud save warning (saved locally):', saveErr);
        }
      }
      showToast?.('💾 تم حفظ وتفعيل إعدادات بريد Gmail والتنبيهات بنجاح ✅');
    };

    if (executeWithOwnerGuard && (ownerLocks?.lockEditGmailConfig || state?.orgSettings?.ownerModificationLocks?.lockEditGmailConfig)) {
      executeWithOwnerGuard({
        lockKey: 'lockEditGmailConfig',
        actionTitle: 'تعديل إعدادات بريد Gmail والتنبيهات الفورية',
        actionDetails: 'تحديث حساب بريد الإدارة أو رابط خدمة إرسال الإشعارات البريدية',
        onExecute: performSave
      });
      return;
    }

    await performSave();
  };

  const handleSendTestEmail = async () => {
    const cleanedAdminEmails = adminEmails.map(s => String(s || '').trim()).filter(Boolean);
    if (!userEmail.trim() && cleanedAdminEmails.length === 0) {
      showToast?.('⚠️ يرجى إدخال بريد Gmail المُرسِل وبريد الإدارة أولاً');
      return;
    }

    setIsSendingTest(true);
    const testConfig = {
      enabled,
      userEmail,
      appPassword,
      targetAdminEmail: cleanedAdminEmails.join(', '),
      targetAdminEmails: cleanedAdminEmails,
      serviceUrl
    };

    const targetRecipients = resolveAdminRecipients(testConfig);
    const recipientDisplay = targetRecipients.length > 0 ? targetRecipients.join(' و ') : userEmail;

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
            ستصلكم التنبيهات الفورية لطلبات الموظفين والإنذارات وملخص اليوم الشامل التلقائي (المقرر إرساله يومياً في تمام الساعة <strong>${dailyDigestTime || '23:59'}</strong>) على كافة العناوين المسجلة.
          </p>
        </div>
      `
    });

    const res = await sendGmailEmail({
      gmailConfig: testConfig,
      recipientEmail: targetRecipients.length > 0 ? targetRecipients : userEmail,
      subject: '🧪 اختبار الربط المباشر مع Gmail — نظام إدارة الصيدليات والموارد البشرية',
      htmlContent: html
    });

    setIsSendingTest(false);
    if (res.success) {
      showToast?.(`✅ تم إرسال الإيميل التجريبي بنجاح إلى: (${recipientDisplay})`);
    } else {
      showToast?.(`⚠️ تعذر الإرسال: ${res.reason || res.error || 'تأكد من البيانات'}`);
    }
  };

  const handleOpenPreview = () => {
    const dateToday = getRealTodayStr();
    const digestData = compileDailyDigestData(state, dateToday);
    const html = generateDailyDigestHTML(digestData, state?.orgSettings);
    setPreviewHtml(html);
    setShowPreviewModal(true);
  };

  const handleTriggerDailyDigestNow = async () => {
    setIsSendingDigest(true);
    const dateToday = getRealTodayStr();
    const digestData = compileDailyDigestData(state, dateToday);
    const html = generateDailyDigestHTML(digestData, state?.orgSettings);

    const cleanedAdminEmails = adminEmails.map(s => String(s || '').trim()).filter(Boolean);
    const testConfig = {
      enabled,
      userEmail,
      appPassword,
      targetAdminEmail: cleanedAdminEmails.join(', '),
      targetAdminEmails: cleanedAdminEmails,
      serviceUrl
    };

    const targetRecipients = resolveAdminRecipients(testConfig);
    if (targetRecipients.length === 0) {
      setIsSendingDigest(false);
      showToast?.('⚠️ يرجى تحديد بريد إلكتروني واحد على الأقل للإدارة لتلقي الملخص');
      return;
    }

    const res = await sendGmailEmail({
      gmailConfig: testConfig,
      recipientEmail: targetRecipients,
      subject: `📊 ملخص اليوم الشامل (${dailyDigestTime || '23:59'}) — ${dateToday}`,
      htmlContent: html
    });

    setIsSendingDigest(false);
    if (res.success) {
      showToast?.(`📊 تم إرسال ملخص اليوم الشامل بنجاح إلى: (${targetRecipients.join(', ')})`);
    } else {
      showToast?.(`⚠️ تعذر إرسال الملخص اليومي: ${res.reason || res.error || 'تأكد من بيانات الربط'}`);
    }
  };

  return (
    <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '16px' }}>
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
          <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>⏰</span> موعد الإرسال التلقائي للملخص الشامل
          </label>
          <input
            type="time"
            value={dailyDigestTime}
            onChange={(e) => setDailyDigestTime(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 800 }}
          />
          <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            يتم توليد وإرسال التقرير الشامل تلقائياً في هذا التوقيت يومياً (افتراضي 23:59).
          </span>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🌐</span> رابط Webhook الخدمة (Apps Script URL)
          </label>
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fef2f2', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fca5a5', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendOnBranchNoShow} onChange={(e) => setSendOnBranchNoShow(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b' }}>🚨 إنذار طوارئ: عدم تسجيل أي بصمة حضور بالفرع بعد 30 دقيقة من موعد فتحه</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f0fdf4', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
          <input type="checkbox" checked={sendDailyDigest} onChange={(e) => setSendDailyDigest(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>📊 إرسال إيميل الملخص الشامل التلقائي في موعده المحدد ({dailyDigestTime || '23:59'})</span>
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

          <button type="button" className="btn btn-ghost" onClick={handleTriggerDailyDigestNow} disabled={isSendingDigest} style={{ fontSize: '13px', fontWeight: 700, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>
            {isSendingDigest ? '⏳ جاري تدقيق وإرسال الملخص...' : '📊 إرسال ملخص اليوم الآن'}
          </button>
        </div>

        <button type="submit" className="btn btn-start" style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 800 }}>
          💾 حفظ وتفعيل إعدادات بريد Gmail
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

            <div style={{ padding: '12px 20px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                💡 يتضمن التقرير الشامل: بطاقات الحضور الحية، مبيعات وحركة الخزينة بكل فرع، وجدول كافة طلبات اليوم بمختلف أنواعها.
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setShowPreviewModal(false)} style={{ fontWeight: 700 }}>
                إغلاق المعاينة
              </button>
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
