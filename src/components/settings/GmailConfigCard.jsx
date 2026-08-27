import React, { useState } from 'react';
import { sendGmailEmail, buildEmailTemplate, generateDailyDigestHTML } from '../../utils/gmailService';
import { fmt, getRealTodayStr } from '../../utils/formatters';

export default function GmailConfigCard({
  state,
  setState,
  saveState,
  showToast
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
    const updatedOrgSettings = { ...orgSettings, gmailConfig: updatedConfig };
    const updatedState = { ...state, orgSettings: updatedOrgSettings };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('💾 تم حفظ وتفعيل إعدادات بريد Gmail والتنبيهات بنجاح');
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: '18px', height: '18px' }} />
          تفعيل خدمة الإشعارات عبر Gmail
        </label>
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
    </form>
  );
}
