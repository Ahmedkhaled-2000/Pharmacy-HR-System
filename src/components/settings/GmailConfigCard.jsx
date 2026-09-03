import React, { useState } from 'react';
import { sendGmailEmail, buildEmailTemplate, generateDailyDigestHTML } from '../../utils/gmailService';
import { fmt, getRealTodayStr } from '../../utils/formatters';

export default function GmailConfigCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  ownerLocks
}) {
  const orgSettings = state.orgSettings || {};
  const currentConfig = orgSettings.gmailConfig || {
    enabled: true,
    userEmail: '',
    appPassword: '',
    targetAdminEmail: '',
    serviceUrl: 'https://script.google.com/macros/s/AKfycbzAHjkD2l2MvE5G6XLLj3jNM3k3B5e4SJ_kXdJtD2L-rUVUnh9BWlDSC0wCIqAk5syO/exec',
    sendOnRequest: true,
    sendOnDecision: true,
    sendOnPenalty: true,
    sendDailyDigest: true
  };

  const [enabled, setEnabled] = useState(currentConfig.enabled ?? true);
  const [userEmail, setUserEmail] = useState(currentConfig.userEmail || '');
  const [appPassword, setAppPassword] = useState(currentConfig.appPassword || '');
  const [targetAdminEmail, setTargetAdminEmail] = useState(currentConfig.targetAdminEmail || '');
  const [serviceUrl, setServiceUrl] = useState(currentConfig.serviceUrl || '');
  const [sendOnRequest, setSendOnRequest] = useState(currentConfig.sendOnRequest ?? true);
  const [sendOnDecision, setSendOnDecision] = useState(currentConfig.sendOnDecision ?? true);
  const [sendOnPenalty, setSendOnPenalty] = useState(currentConfig.sendOnPenalty ?? true);
  const [sendDailyDigest, setSendDailyDigest] = useState(currentConfig.sendDailyDigest ?? true);

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
    e.preventDefault();
    const updatedConfig = {
      enabled,
      userEmail: userEmail.trim(),
      appPassword: appPassword.trim(),
      targetAdminEmail: targetAdminEmail.trim(),
      serviceUrl: serviceUrl.trim(),
      sendOnRequest,
      sendOnDecision,
      sendOnPenalty,
      sendDailyDigest
    };

    const performSave = async () => {
      const updatedOrgSettings = { ...orgSettings, gmailConfig: updatedConfig };
      const updatedState = { ...state, orgSettings: updatedOrgSettings };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('💾 تم حفظ وتفعيل إعدادات بريد Gmail والتنبيهات بنجاح');
    };

    if (executeWithOwnerGuard && (ownerLocks?.lockEditGmailConfig || state.orgSettings?.ownerModificationLocks?.lockEditGmailConfig || state.orgSettings?.ownerModificationLocks?.lockEditOrgSettings)) {
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
    if (!userEmail.trim() && !targetAdminEmail.trim()) {
      showToast?.('⚠️ يرجى أدخال بريد Gmail المُرسِل وبريد الإدارة أولاً');
      return;
    }
    setIsSendingTest(true);
    const testConfig = { enabled, userEmail, appPassword, targetAdminEmail, serviceUrl };
    const html = buildEmailTemplate({
      title: '🧪 اختبار الربط المباشر مع Gmail',
      subtitle: 'اختبار توصيل التنبيهات والإشعارات البريدية',
      badgeText: 'رسالة اختبار ناجحة',
      badgeColor: '#16a34a',
      bodyContent: `
        <p>مرحباً بك!</p>
        <p>هذه الرسالة تؤكد أن **نظام الربط المباشر مع Gmail** يعمل بكفاءة ومربوط بحساب الإدارة العليا بالنظام.</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 12px 0;">
          <p style="margin:0; color: #166534;">✅ تم توثيق الاتصال بنجاح. ستصلك التنبيهات الفورية والملخص اليومي (23:59) على هذا البريد الإلكتروني.</p>
        </div>
      `
    });

    const res = await sendGmailEmail({
      gmailConfig: testConfig,
      recipientEmail: targetAdminEmail || userEmail,
      subject: '🧪 اختبار الربط المباشر مع Gmail — نظام إدارة الصيدليات',
      htmlContent: html
    });

    setIsSendingTest(false);
    if (res.success) {
      showToast?.('✅ تم إرسال الإيميل التجريبي بنجاح! يرجى مراجعة صندوق الوارد (Inbox)');
    } else {
      showToast?.(`⚠️ تعذر الإرسال: ${res.reason || res.error || 'تأكد من البيانات'}`);
    }
  };

  const handleTriggerDailyDigestNow = async () => {
    setIsSendingDigest(true);
    const dateToday = getRealTodayStr();
    const employees = state.employees || [];
    const shifts = (state.shifts || []).filter(s => s.date === dateToday);
    const requests = (state.requests || []).filter(r => r.date === dateToday || r.createdAt?.startsWith(dateToday));
    const adjustments = (state.adjustments || []).filter(a => a.date === dateToday);

    const presentEmpIds = new Set(shifts.map(s => s.employeeId));
    const presentCount = presentEmpIds.size;
    const absentCount = Math.max(0, employees.length - presentCount);
    const totalHoursToday = shifts.reduce((acc, s) => acc + (s.hours || 0), 0);

    const pendingRequests = (state.requests || []).filter(r => r.status === 'pending_admin' || !r.branchApproved);
    const approvedRequestsToday = requests.filter(r => r.status === 'approved');

    const bonusTotalToday = adjustments.filter(a => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
    const deductionTotalToday = adjustments.filter(a => a.type === 'deduction').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

    const html = generateDailyDigestHTML({
      dateStr: dateToday,
      employeesCount: employees.length,
      presentCount,
      absentCount,
      lateCount: 0,
      totalHoursToday,
      pendingRequestsCount: pendingRequests.length,
      approvedRequestsCount: approvedRequestsToday.length,
      bonusTotalToday,
      deductionTotalToday
    });

    const testConfig = { enabled, userEmail, appPassword, targetAdminEmail, serviceUrl };
    const res = await sendGmailEmail({
      gmailConfig: testConfig,
      recipientEmail: targetAdminAdminEmail(targetAdminEmail, userEmail),
      subject: `📊 ملخص اليوم الشامل (23:59) — ${dateToday}`,
      htmlContent: html
    });

    setIsSendingDigest(false);
    if (res.success) {
      showToast?.('📊 تم إرسال ملخص نهاية اليوم (23:59) بنجاح للإيميل المعتمد');
    } else {
      showToast?.('⚠️ تعذر إرسال الملخص اليومي، تأكد من بيانات الربط');
    }
  };

  function targetAdminAdminEmail(target, user) {
    return target || user || '';
  }

  return (
    <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ✉️ ربط وتعديل إعدادات بريد Gmail والإشعارات الفورية
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0' }}>
            إرسال تنبيهات الطلبات والجزاءات وملخص اليوم التلقائي (الساعة 23:59) مباشرة لإيميل الإدارة
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div className="field">
          <label>بريد Gmail المُرْسِل (Sender Gmail)</label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="pharmacy.admin@gmail.com"
          />
        </div>

        <div className="field">
          <label>كلمة سر التطبيقات (Gmail App Password)</label>
          <input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="•••• •••• •••• ••••"
          />
        </div>

        <div className="field">
          <label>بريد الإدارة المستلِم للتنبيهات (Admin Receiver)</label>
          <input
            type="email"
            value={targetAdminEmail}
            onChange={(e) => setTargetAdminEmail(e.target.value)}
            placeholder="manager@pharmacy.com"
          />
        </div>

        <div className="field">
          <label>رابط Webhook الخدمة (اختياري / Apps Script Service)</label>
          <input
            type="text"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/..."
          />
        </div>
      </div>

      <h5 style={{ margin: '16px 0 12px', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
        ⚙️ تحديد وحكم الأحداث التي تُرسل إيميل فوري:
      </h5>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <input type="checkbox" checked={sendOnRequest} onChange={(e) => setSendOnRequest(e.target.checked)} />
          <span>📋 إرسال إيميل فوري عند إرسال طلب جديد من الموظف</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <input type="checkbox" checked={sendOnDecision} onChange={(e) => setSendOnDecision(e.target.checked)} />
          <span>✅ إرسال إيميل فوري للموظف عند اعتماد/رفض الطلب</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <input type="checkbox" checked={sendOnPenalty} onChange={(e) => setSendOnPenalty(e.target.checked)} />
          <span>⚠️ إرسال إيميل فوري عند توثيق وتطبيق جزاء لائحي</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <input type="checkbox" checked={sendDailyDigest} onChange={(e) => setSendDailyDigest(e.target.checked)} />
          <span>📊 إرسال إيميل الملخص اليومي الشامل (23:59)</span>
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={handleSendTestEmail} disabled={isSendingTest}>
            {isSendingTest ? '⏳ جاري الإرسال...' : '🧪 إرسال إيميل تجريبي'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleTriggerDailyDigestNow} disabled={isSendingDigest}>
            {isSendingDigest ? '⏳ جاري توليد وتدقيق الملخص...' : '📊 إرسال ملخص اليوم الآن (23:59)'}
          </button>
        </div>

        <button type="submit" className="btn btn-start">
          💾 حفظ وتفعيل إعدادات بريد Gmail
        </button>
      </div>

      {/* ── Script & Setup Modal for Gmail (Exact match to Drive Modal) ── */}
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
