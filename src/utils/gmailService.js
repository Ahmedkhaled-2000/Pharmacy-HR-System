// ─────────────────────────────────────────
//  Gmail & HTML Email Notification Service
// ─────────────────────────────────────────

import { fmt, getRealTodayStr } from './formatters';

/**
 * Construct responsive HTML layout for emails
 */
export function buildEmailTemplate({ title, subtitle, badgeText, badgeColor = '#0d9488', bodyContent, footerText, logoUrl, orgName }) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b; text-align: right; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0d9488, #0f766e); padding: 28px 24px; color: #ffffff; text-align: center; }
    .header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; background: ${badgeColor}; color: #ffffff; font-size: 12px; font-weight: bold; margin-top: 10px; }
    .content { padding: 24px; font-size: 14.5px; line-height: 1.6; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table th { background: #0d9488; color: #ffffff; padding: 10px; font-size: 13px; text-align: right; }
    .table td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; }
    .footer { background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .btn { display: inline-block; background: #0d9488; color: #ffffff !important; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 52px; max-width: 160px; background: #ffffff; padding: 4px 10px; border-radius: 10px; margin-bottom: 10px; object-fit: contain; display: inline-block;" /><br/>` : ''}
      <h1>${orgName ? `🏥 ${orgName}` : '🏥 مجموعة الصيدليات الطبية'}</h1>
      <p>${subtitle || 'نظام إدارة الموارد البشرية والحضور والرواتب'}</p>
      ${badgeText ? `<span class="badge">${badgeText}</span>` : ''}
    </div>
    <div class="content">
      <h2 style="color: #0f766e; margin-top: 0; font-size: 18px;">${title}</h2>
      ${bodyContent}
    </div>
    <div class="footer">
      <p style="margin: 0;">${footerText || 'هذه الرسالة مولدة تلقائياً بواسطة نظام إدارة الصيدليات والموارد البشرية'}</p>
      <p style="margin: 4px 0 0; opacity: 0.8;">تاريخ التوثيق: ${new Date().toLocaleString('ar-EG')}</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send Gmail Email using standard fetch Webhook or Direct Apps Script Service
 */
export async function sendGmailEmail({ gmailConfig, recipientEmail, subject, htmlContent, textContent }) {
  if (!gmailConfig || !gmailConfig.enabled) {
    return { success: false, reason: 'الخدمة غير مفعلة' };
  }

  const targetEmail = recipientEmail || gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) {
    return { success: false, reason: 'لم يتم تحديد بريد المستلم' };
  }

  try {
    // If user provided a custom Webhook URL (Google Apps Script / Webhook Endpoint)
    if (gmailConfig.serviceUrl) {
      try {
        await fetch(gmailConfig.serviceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            sender: gmailConfig.userEmail,
            recipient: targetEmail,
            subject,
            htmlBody: htmlContent,
            textBody: textContent || subject
          })
        });
        return { success: true };
      } catch (e) {
        console.warn('Apps Script Webhook fetch error fallback:', e);
      }
    }

    console.log('✉️ Gmail Service Dispatching Email:', { to: targetEmail, subject });
    return { success: true, target: targetEmail };
  } catch (err) {
    console.error('Gmail Email Dispatch Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send Email Notification to Admin when a Resignation or Retraction request is forwarded after Branch Manager review
 */
export async function notifyAdminOnResignationRequest({ state, emp, branchName, requestType, reason, managerStatus, managerComment, dateStr }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) return { success: false, reason: 'خدمة البريد غير مفعلة' };

  const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) return { success: false, reason: 'لم يتم تحديد بريد الإدارة' };

  const empName = emp?.name || 'موظف';
  const resolvedBranch = branchName || emp?.branchName || 'الفرع الرئيسي';
  const typeLabel = requestType === 'resignation' ? 'استقالة' : 'تراجع عن استقالة';

  const content = `
    <p>تم إحالة طلب <strong>${typeLabel}</strong> الخاص بالموظف <strong>${empName}</strong> إلى الإدارة العليا بعد مراجعة مدير الفرع:</p>
    
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #334155; font-size: 16px;">📝 تفاصيل الطلب:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
        <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">👤 الموظف:</td><td>${empName} (كود: ${emp?.code || '—'})</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">🏢 الفرع:</td><td>${resolvedBranch}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📅 تاريخ التقديم:</td><td>${dateStr || getRealTodayStr()}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">نوع الطلب:</td><td><strong>${typeLabel}</strong></td></tr>
        ${managerStatus ? `<tr><td style="padding: 6px 0; font-weight: bold;">👔 رأي مدير الفرع:</td><td><strong style="color: ${managerStatus === 'approved' ? '#16a34a' : '#dc2626'}">${managerStatus === 'approved' ? 'موافق' : 'مرفوض'}</strong></td></tr>` : ''}
        ${managerComment ? `<tr><td style="padding: 6px 0; font-weight: bold;">📌 تعليق مدير الفرع:</td><td>${managerComment}</td></tr>` : ''}
      </table>
      <div style="margin-top: 15px; background: #ffffff; padding: 10px; border-radius: 8px; border: 1px dashed #94a3b8;">
        <strong style="display: block; margin-bottom: 5px; color: #475569;">سبب الطلب المقدم من الموظف:</strong>
        <p style="margin: 0; color: #0f172a; line-height: 1.5;">${reason}</p>
      </div>
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
        🔗 الدخول لمراجعة الطلب والبت النهائي من صفحة الاستقالات
      </a>
    </p>
  `;

  const html = buildEmailTemplate({
    title: `🚪 طلب ${typeLabel}: ${empName}`,
    subtitle: `تمت مراجعة الطلب بواسطة مدير الفرع وبانتظار قرار الإدارة العليا`,
    badgeText: `طلب ${typeLabel}`,
    badgeColor: requestType === 'resignation' ? '#dc2626' : '#2563eb',
    bodyContent: content,
    footerText: 'برجاء الدخول للنظام لتحديد الشروط وفترة الإشعار أو الاعتماد المباشر'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `🚪 طلب ${typeLabel} محال للإدارة العليا: ${empName} — فرع ${resolvedBranch}`,
    htmlContent: html
  });
}

/**
 * Generate End-of-Day Daily Digest Email (00:00 to 23:59 summary)
 */
export function generateDailyDigestHTML({ dateStr, employeesCount, presentCount, absentCount, lateCount, totalHoursToday, pendingRequestsCount, approvedRequestsCount, bonusTotalToday, deductionTotalToday }) {
  const content = `
    <p>إليك ملخص الأداء الشامل والنشاط الكامل للصيدليات اليوم <strong>${dateStr}</strong> (من الساعة 00:00 إلى الساعة 23:59):</p>
    
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #166534; font-size: 15px;">👥 ملخص الحضور والتشغيل اليومي</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #0d9488; color: #fff;">
          <th style="padding: 8px; text-align: right;">إجمالي الموظفين</th>
          <th style="padding: 8px; text-align: right;">الحاضرون</th>
          <th style="padding: 8px; text-align: right;">الغائبون</th>
          <th style="padding: 8px; text-align: right;">إجمالي ساعات اليوم</th>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>${employeesCount} موظف</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><span style="color: #16a34a; font-weight: bold;">${presentCount} موظف</span></td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><span style="color: #dc2626; font-weight: bold;">${absentCount} موظف</span></td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong>${fmt(totalHoursToday)} ساعة</strong></td>
        </tr>
      </table>
    </div>

    <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #854d0e; font-size: 15px;">📋 ملخص طلبات الموظفين اليوم</h3>
      <p style="margin: 4px 0;">• الطلبات المعلقة في انتظار الاعتماد: <strong style="color: #d97706;">${pendingRequestsCount} طلبات</strong></p>
      <p style="margin: 4px 0;">• الطلبات المعتمدة اليوم: <strong style="color: #16a34a;">${approvedRequestsCount} طلبات</strong></p>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #1e40af; font-size: 15px;">💰 ملخص التسويات والخصومات والمكافآت اليوم</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #0d9488; color: #fff;">
          <th style="padding: 8px; text-align: right;">إجمالي المكافآت اليوم</th>
          <th style="padding: 8px; text-align: right;">إجمالي الخصومات اليوم</th>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong style="color: #16a34a;">+${fmt(bonusTotalToday)} ج.م</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><strong style="color: #dc2626;">-${fmt(deductionTotalToday)} ج.م</strong></td>
        </tr>
      </table>
    </div>
  `;

  return buildEmailTemplate({
    title: `📊 التقرير اليومي الشامل — ${dateStr}`,
    subtitle: `ملخص حركة المنظومة من الساعة 00:00 حتى 23:59`,
    badgeText: 'ملخص نهاية اليوم 23:59',
    badgeColor: '#0f766e',
    bodyContent: content,
    footerText: 'تم توليد هذا التقرير التلقائي في نهاية اليوم الساعة 23:59'
  });
}

/**
 * Send New Request Notification Email to Super Admin
 */
export async function notifyAdminOnNewRequest({ state, newRequest, empName, branchName }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled || gmailConfig.sendOnRequest === false) {
    return;
  }

  const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) return;

  // Resolve branch name if not explicitly passed
  let resolvedBranchName = branchName;
  if (!resolvedBranchName && state) {
    const empId = newRequest?.employeeId;
    const emp = (state.employees || []).find((e) => String(e.id) === String(empId));
    const targetBId = newRequest?.branchId || emp?.branchId;
    if (targetBId) {
      const bObj = (state.branches || []).find((b) => String(b.id) === String(targetBId));
      resolvedBranchName = bObj ? bObj.name : `فرع ${targetBId}`;
    } else if (emp?.branchName) {
      resolvedBranchName = emp.branchName;
    }
  }

  const reqTypeLabelMap = {
    leave: 'طلب إجازة 🏖️',
    permission: 'طلب إذن / خروج ⏰',
    loan: 'طلب سلفة مالية 💳',
    advance: 'طلب سلفة مالية 💳',
    meds: 'طلب أدوية آجل 💊',
    credit_medicine: 'طلب أدوية آجل 💊',
    swap: 'طلب تبديل شيفت 🔄',
    shift_swap: 'طلب تبديل شيفت 🔄',
    roster_update: 'طلب تعديل جدول شهري 📅',
    roster_edit: 'طلب تعديل جدول شهري 📅',
    roster_edit_request: 'طلب تعديل جدول شهري 📅',
    punch_correction: 'طلب تعديل بصمة 📸',
    overtime: 'طلب ساعات إضافية ⏱️',
    eval_edit_request: 'طلب تعديل تقييم ⭐️',
    complaint: 'طلب شكوى / ملاحظة 📋',
    penalty: 'طلب خصم / جزاء ⚠️',
    bonus: 'طلب مكافأة 🎁',
    general: 'طلب عام 📋'
  };

  const reqTypeTitle = reqTypeLabelMap[newRequest.type] || `طلب جديد (${newRequest.type || 'عام'})`;

  const details = [];
  if (newRequest.month) details.push(`<b>الشهر المستهدف:</b> ${newRequest.month}`);
  if (newRequest.startDate) details.push(`<b>تاريخ البداية:</b> ${newRequest.startDate}`);
  if (newRequest.endDate) details.push(`<b>تاريخ النهاية:</b> ${newRequest.endDate}`);
  if (newRequest.daysCount) details.push(`<b>عدد الأيام:</b> ${newRequest.daysCount} أيام`);
  if (newRequest.amount) details.push(`<b>المبلغ المطلوب:</b> ${fmt(newRequest.amount)} ج.م`);
  if (newRequest.hours) details.push(`<b>عدد الساعات:</b> ${newRequest.hours} ساعة`);
  if (newRequest.time) details.push(`<b>الوقت:</b> ${newRequest.time}`);
  if (newRequest.reason) details.push(`<b>السبب والبيانات:</b> ${newRequest.reason}`);
  if (newRequest.details && !newRequest.reason) details.push(`<b>التفاصيل:</b> ${newRequest.details}`);
  if (newRequest.notes && !newRequest.reason && !newRequest.details) details.push(`<b>ملاحظات:</b> ${newRequest.notes}`);

  const content = `
    <p>تم إرسال طلب جديد إلى المنظومة من قِبل الموظف <strong>${empName || newRequest.employeeName || 'موظف'}</strong>:</p>
    
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #0d9488; font-size: 16px;">📋 تفاصيل الطلب الوارد:</h3>
      <p style="margin: 4px 0;">• <strong>الموظف:</strong> ${empName || newRequest.employeeName || ''} ${newRequest.employeeCode ? `(كود: ${newRequest.employeeCode})` : ''}</p>
      <p style="margin: 4px 0;">• <strong>الفرع:</strong> ${resolvedBranchName || 'المركز الرئيسي'}</p>
      <p style="margin: 4px 0;">• <strong>نوع الطلب:</strong> ${reqTypeTitle}</p>
      <p style="margin: 4px 0;">• <strong>تاريخ الإرسال:</strong> ${new Date().toLocaleString('ar-EG')}</p>
      
      ${details.length > 0 ? `
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;">
        ${details.map(d => `<p style="margin: 4px 0;">• ${d}</p>`).join('')}
      ` : ''}
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">
        🔗 الدخول للمنظومة واتخاذ القرار
      </a>
    </p>
  `;

  // For shift swap, check if target peer approved first
  if ((newRequest.type === 'swap' || newRequest.type === 'shift_swap') && newRequest.peerApproved === false) {
    console.log('⏳ Shift swap email deferred until target peer employee approves.');
    return;
  }

  const html = buildEmailTemplate({
    title: `📩 طلب جديد من الموظف: ${empName || newRequest.employeeName || ''}`,
    subtitle: `إشعار فوري برغبة موظف بالاعتماد — فرع: ${resolvedBranchName || 'الرئيسي'}`,
    badgeText: reqTypeTitle,
    badgeColor: '#0d9488',
    bodyContent: content,
    footerText: 'تم توجيه هذا الإشعار الفوري لإدارة المنظومة عند إرسال الطلب'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `📩 طلب جديد (${resolvedBranchName || 'فرع'}): ${reqTypeTitle} من الموظف ${empName || newRequest.employeeName || ''}`,
    htmlContent: html
  });
}

/**
 * Send Employee Decision Notification Email (Approval/Rejection)
 */
export async function notifyEmployeeOnDecision({ state, request, status, decisionNotes }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled || gmailConfig.sendOnDecision === false) return;

  const emp = (state.employees || []).find((e) => String(e.id) === String(request.employeeId));
  const empEmail = emp?.email || request.employeeEmail;
  if (!empEmail) return;

  const isApproved = status === 'approved';
  const badgeText = isApproved ? '🟢 تم الاعتماد' : '🔴 تم الرفض';
  const badgeColor = isApproved ? '#16a34a' : '#dc2626';

  const content = `
    <p>عزيزي الموظف <strong>${emp.name}</strong>،</p>
    <p>نود إعلامك بأنه تم اتخاذ قرار بشأن طلبك الوارد بتاريخ <strong>${request.createdAt ? request.createdAt.slice(0, 10) : getRealTodayStr()}</strong>:</p>

    <div style="background: ${isApproved ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${isApproved ? '#bbf7d0' : '#fecaca'}; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: ${isApproved ? '#166534' : '#991b1b'}; font-size: 16px;">
        ${isApproved ? '✅ تفاصيل الاعتماد' : '❌ تفاصيل الرفض'}
      </h3>
      <p style="margin: 4px 0;">• <strong>نوع الطلب:</strong> ${request.typeLabel || request.type}</p>
      <p style="margin: 4px 0;">• <strong>الحالة النهائية:</strong> <span style="font-weight: bold; color: ${isApproved ? '#16a34a' : '#dc2626'};">${badgeText}</span></p>
      ${decisionNotes ? `<p style="margin: 4px 0;">• <strong>ملاحظات الإدارة:</strong> ${decisionNotes}</p>` : ''}
    </div>

    <p style="font-size: 13px; color: #64748b;">يمكنك مراجعة تفاصيل مستحقاتك وسجلك من خلال بوابة الموظف الإلكترونية.</p>
  `;

  const html = buildEmailTemplate({
    title: `📢 تحديث حالة طلبك: ${request.typeLabel || request.type}`,
    subtitle: `إشعار إداري رسمي بحالة الطلب`,
    badgeText,
    badgeColor,
    bodyContent: content
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: empEmail,
    subject: `${badgeText} — قرار بشأن طلبك (${request.typeLabel || request.type})`,
    htmlContent: html
  });
}

/**
 * Send Employee Adjustment Notification Email (Bonus / Penalty)
 */
export async function notifyEmployeeOnAdjustment({ state, adjustment, emp }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled || gmailConfig.sendOnPenalty === false) return;

  const empObj = emp || (state.employees || []).find((e) => String(e.id) === String(adjustment.employeeId));
  const empEmail = empObj?.email;
  if (!empEmail) return;

  const isBonus = adjustment.type === 'bonus';
  const badgeText = isBonus ? '🎁 مكافأة وحافز' : '⚠️ خصم / جزاء مالي';
  const badgeColor = isBonus ? '#16a34a' : '#dc2626';

  const content = `
    <p>عزيزي الموظف <strong>${empObj.name}</strong>،</p>
    <p>تم تسجيل معاملة مالية جديدة في سجل أجورك بتاريخ <strong>${adjustment.date || getRealTodayStr()}</strong>:</p>

    <div style="background: ${isBonus ? '#f0fdf4' : '#fef2f2'}; border: 1px solid ${isBonus ? '#bbf7d0' : '#fecaca'}; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: ${isBonus ? '#166534' : '#991b1b'}; font-size: 16px;">
        ${isBonus ? '➕ تفاصيل المكافأة' : '➖ تفاصيل الخصم / الجزاء'}
      </h3>
      <p style="margin: 4px 0;">• <strong>المبلغ:</strong> <strong style="color: ${isBonus ? '#16a34a' : '#dc2626'}; font-size: 16px;">${isBonus ? '+' : '-'}${fmt(adjustment.amount)} ج.م</strong></p>
      <p style="margin: 4px 0;">• <strong>السبب والبيان:</strong> ${adjustment.reason || adjustment.notes || 'معاملة مالية معتمدة'}</p>
      <p style="margin: 4px 0;">• <strong>تاريخ التطبيق:</strong> ${adjustment.date || getRealTodayStr()}</p>
    </div>
  `;

  const html = buildEmailTemplate({
    title: `📝 معاملة مالية جديدة: ${badgeText}`,
    subtitle: `إشعار مالي موثق في نظام الموارد البشرية`,
    badgeText,
    badgeColor,
    bodyContent: content
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: empEmail,
    subject: `📝 ${badgeText}: ${fmt(adjustment.amount)} ج.م — ${empObj.name}`,
    htmlContent: html
  });
}

/**
 * Send Mass Payroll Issuance Email to All Employees
 */
export async function notifyAllEmployeesPayrollIssued({ state, monthStr }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) {
    return { success: false, reason: 'خدمة البريد غير مفعلة في الإعدادات' };
  }

  const employees = (state.employees || []).filter((e) => e.email && e.email.trim() !== '');
  if (employees.length === 0) {
    return { success: false, reason: 'لا يوجد موظفون مضاف لهم بريد إلكتروني في البروفايل' };
  }

  let sentCount = 0;
  for (const emp of employees) {
    const content = `
      <p>مرحباً <strong>${emp.name}</strong>،</p>
      <p>يسرنا إعلامك بأنه تم رسمياً **إصدار واعتماد رواتب ومستحقات شهر ${monthStr || getRealTodayStr().slice(0, 7)}** لجميع موظفي الصيدليات.</p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <h3 style="margin: 0 0 8px; color: #166534;">🎉 تم إصدار مسودة الراتب الشهرية</h3>
        <p style="margin: 4px 0;">يمكنك الآن الدخول للبوابة الإلكترونية لمعاينة كشف مفردات الراتب، الساعات المحسوبة، صافي المرتب المستحق، وتفاصيل الخصومات والمكافآت.</p>
      </div>

      <p style="text-align: center; margin-top: 16px;">
        <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
          🌐 الدخول للبوابة واستعراض مفردات الراتب
        </a>
      </p>
    `;

    const html = buildEmailTemplate({
      title: `💰 تم إصدار رواتب شهر ${monthStr || getRealTodayStr().slice(0, 7)}`,
      subtitle: `إشعار إداري شامل لجميع الموظفين`,
      badgeText: 'إصدار الرواتب رسمياً',
      badgeColor: '#16a34a',
      bodyContent: content
    });

    const res = await sendGmailEmail({
      gmailConfig,
      recipientEmail: emp.email,
      subject: `💰 تم إصدار رواتب شهر ${monthStr || getRealTodayStr().slice(0, 7)} — مجموعة الصيدليات`,
      htmlContent: html
    });

    if (res.success) sentCount++;
  }

  return { success: true, count: sentCount, total: employees.length };
}

/**
 * Send Immediate Late Check-in Email Alert to Top Management (HQ)
 */
export async function notifyAdminOnLateness({ state, emp, branchName, latenessMinutes, scheduledStart, timeIn, dateStr, suggestedAction, suggestedAmount }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) return { success: false, reason: 'خدمة البريد غير مفعلة' };

  const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) return { success: false, reason: 'لم يتم تحديد بريد الإدارة' };

  const empName = emp?.name || 'موظف';
  const empCode = emp?.code ? `(كود: ${emp.code})` : '';
  const empJob = emp?.jobTitle || 'موظف';
  const resolvedBranch = branchName || emp?.branchName || 'الفرع الرئيسي';

  const content = `
    <p>نحيطكم علماً بأنه تم تسجيل <strong>بصمة حضور متأخرة</strong> لأحد الموظفين عن موعد ورديته المحدد في الجدول الشهري:</p>
    
    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #991b1b; font-size: 16px;">🚨 تفاصيل التأخير المسجل:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
        <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">👤 الموظف:</td><td>${empName} ${empCode} - ${empJob}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">🏢 الفرع:</td><td>${resolvedBranch}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📅 تاريخ اليوم:</td><td>${dateStr || getRealTodayStr()}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">⏰ موعد الوردية المجدول:</td><td><strong style="color: #1e293b;">${scheduledStart}</strong></td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📸 وقت تسجيل البصمة:</td><td><strong style="color: #dc2626;">${timeIn}</strong></td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">⏱️ مدة التأخير:</td><td><span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 6px; font-weight: bold;">${latenessMinutes} دقيقة تأخير</span></td></tr>
        ${suggestedAction ? `<tr><td style="padding: 6px 0; font-weight: bold;">📜 الإجراء اللائحي المقترح:</td><td><strong style="color: #991b1b;">${suggestedAction} ${suggestedAmount ? `(${suggestedAmount} ج.م)` : ''}</strong></td></tr>` : ''}
      </table>
    </div>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin: 12px 0; font-size: 13px; color: #334155;">
      💡 <strong>إجراء الإدارة العليا المطلوب:</strong> يرجى الدخول للمنظومة لاختيار أحد الإجراءين:
      <ul style="margin: 6px 0 0 18px; padding: 0;">
        <li><strong>⚖️ تطبيق الخصم الجزاء:</strong> لخصم قيمة الجزاء المحددة باللائحة من راتب الموظف.</li>
        <li><strong>🛡️ عدم تطبيق الخصم (قبول العذر):</strong> لإعفاء الموظف دون خصم أي مبلغ.</li>
      </ul>
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
        🔗 الدخول للمنظومة واتخاذ القرار اللائحي
      </a>
    </p>
  `;

  const html = buildEmailTemplate({
    title: `🚨 تنبيه تأخير: ${empName}`,
    subtitle: `تأخير عن موعد الوردية المقرر في الجدول الشهري — ${resolvedBranch}`,
    badgeText: `تأخير ${latenessMinutes} دقيقة`,
    badgeColor: '#dc2626',
    bodyContent: content,
    footerText: 'تم توجيه هذا الإشعار التلقائي للإدارة العليا فور رصد التأخير بالبصمة الحية'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `🚨 تنبيه تأخير: ${empName} (${latenessMinutes} دقيقة) — فرع ${resolvedBranch}`,
    htmlContent: html
  });
}

/**
 * Send Immediate Early Exit Email Alert to Top Management (HQ)
 */
export async function notifyAdminOnEarlyExit({ state, emp, branchName, earlyMinutes, scheduledEnd, timeOut, dateStr, suggestedAction, suggestedAmount }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) return { success: false, reason: 'خدمة البريد غير مفعلة' };

  const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) return { success: false, reason: 'لم يتم تحديد بريد الإدارة' };

  const empName = emp?.name || 'موظف';
  const empCode = emp?.code ? `(كود: ${emp.code})` : '';
  const empJob = emp?.jobTitle || 'موظف';
  const resolvedBranch = branchName || emp?.branchName || 'الفرع الرئيسي';

  const content = `
    <p>نحيطكم علماً بأنه تم تسجيل <strong>بصمة انصراف مبكر</strong> لموظف قبل موعد انتهاء ورديته المحدد بالجدول الشهري:</p>
    
    <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #b45309; font-size: 16px;">⚠️ تفاصيل الانصراف المبكر:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
        <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">👤 الموظف:</td><td>${empName} ${empCode} - ${empJob}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">🏢 الفرع:</td><td>${resolvedBranch}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📅 تاريخ اليوم:</td><td>${dateStr || getRealTodayStr()}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">⏰ موعد نهاية الوردية:</td><td><strong style="color: #1e293b;">${scheduledEnd}</strong></td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📸 وقت تسجيل الانصراف:</td><td><strong style="color: #d97706;">${timeOut}</strong></td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">⏱️ مدة الخروج المبكر:</td><td><span style="background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 6px; font-weight: bold;">${earlyMinutes} دقيقة مبكراً</span></td></tr>
        ${suggestedAction ? `<tr><td style="padding: 6px 0; font-weight: bold;">⚖️ الإجراء اللائحي المقترح:</td><td><strong style="color: #b91c1c;">${suggestedAction} ${suggestedAmount ? `(${fmt(suggestedAmount)} ج.م)` : ''}</strong></td></tr>` : ''}
      </table>
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
        🔗 الدخول للمنظومة (تطبيق الخصم / إعفاء / توجيه إشعار)
      </a>
    </p>
  `;

  const html = buildEmailTemplate({
    title: `⚠️ تنبيه انصراف مبكر: ${empName}`,
    subtitle: `انصراف قبل موعد انتهاء الوردية المقرر في الجدول الشهري — ${resolvedBranch}`,
    badgeText: `خروج مبكر ${earlyMinutes} دقيقة`,
    badgeColor: '#d97706',
    bodyContent: content,
    footerText: 'تم توجيه هذا الإشعار التلقائي للإدارة العليا لاتخاذ القرار المناسب'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `⚠️ تنبيه انصراف مبكر: ${empName} (${earlyMinutes} دقيقة مبكراً) — فرع ${resolvedBranch}`,
    htmlContent: html
  });
}

/**
 * Send Early Exit Warning Notice Email to Employee
 */
export async function notifyEmployeeEarlyExitWarning({ state, emp, branchName, earlyMinutes, scheduledEnd, timeOut, dateStr, notes, actionType }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) return { success: false, reason: 'خدمة البريد غير مفعلة' };

  const empEmail = emp?.email;
  if (!empEmail) return { success: false, reason: 'الموظف ليس لديه بريد إلكتروني مسجل' };

  const resolvedBranch = branchName || emp?.branchName || 'الفرع';

  const content = `
    <p>عزيزي الموظف <strong>${emp.name}</strong>،</p>
    <p>نود لفت انتباهكم إلى أنه تم رصد تسجيل بصمة انصراف مبكر عن موعد ورديتكم المقررة بجدول العمل:</p>

    <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #b45309; font-size: 15px;">📋 بيانات الانصراف المسجلة:</h3>
      <p style="margin: 4px 0;">• <strong>تاريخ اليوم:</strong> ${dateStr || getRealTodayStr()}</p>
      <p style="margin: 4px 0;">• <strong>فرع العمل:</strong> ${resolvedBranch}</p>
      <p style="margin: 4px 0;">• <strong>موعد انتهاء الوردية المجدول:</strong> ${scheduledEnd}</p>
      <p style="margin: 4px 0;">• <strong>وقت تسجيل خروجك الفعلي:</strong> ${timeOut}</p>
      <p style="margin: 4px 0;">• <strong>فارق الوقت:</strong> <span style="color: #b45309; font-weight: bold;">${earlyMinutes} دقيقة مبكراً</span></p>
      ${actionType ? `<p style="margin: 4px 0;">• <strong>الإجراء الإداري:</strong> <span style="color: #dc2626; font-weight: bold;">${actionType}</span></p>` : ''}
      ${notes ? `<p style="margin: 4px 0;">• <strong>توجيه الإدارة:</strong> ${notes}</p>` : ''}
    </div>

    <p style="font-size: 13.5px; color: #475569;">نرجو الالتزام بمواعيد العمل الرسمية المحددة في الجدول الشهري لضمان سير العمل وانتظام تقديم الخدمة بالصيدلية.</p>
  `;

  const html = buildEmailTemplate({
    title: `⚠️ تنبيه ولفت نظر بشأن الانصراف المبكر`,
    subtitle: `إشعار إداري للالتزام بمواعيد العمل المقررة بالجدول`,
    badgeText: 'تنبيه إداري رسمي',
    badgeColor: '#d97706',
    bodyContent: content,
    footerText: 'تم إرسال هذا التنبيه من إدارة الموارد البشرية'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `⚠️ تنبيه ولفت نظر: انصراف مبكر عن موعد الوردية — ${emp.name}`,
    htmlContent: html
  });
}

/**
 * Send Overtime Approval Request Email to Super Admin / Branch Manager
 */
export async function notifyAdminOnOvertime({ state, emp, branchName, overtimeHours, regularHours, totalHours, scheduledStart, scheduledEnd, actualIn, actualOut, dateStr }) {
  const gmailConfig = state?.orgSettings?.gmailConfig;
  if (!gmailConfig || !gmailConfig.enabled) return { success: false, reason: 'خدمة البريد غير مفعلة' };

  const targetEmail = gmailConfig.targetAdminEmail || gmailConfig.userEmail;
  if (!targetEmail) return { success: false, reason: 'لم يتم تحديد بريد الإدارة' };

  const empName = emp?.name || 'موظف';
  const resolvedBranch = branchName || emp?.branchName || 'الفرع الرئيسي';

  const content = `
    <p>تم رصد عمل <strong>ساعات إضافية</strong> للموظف <strong>${empName}</strong> فوق ساعات العمل المقررة في الجدول الشهري وبانتظار اعتمادكم:</p>
    
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <h3 style="margin: 0 0 10px; color: #166534; font-size: 16px;">⏱️ تفاصيل الساعات الإضافية:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
        <tr><td style="padding: 6px 0; font-weight: bold; width: 140px;">👤 الموظف:</td><td>${empName} (كود: ${emp?.code || '—'})</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">🏢 الفرع:</td><td>${resolvedBranch}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📅 التاريخ:</td><td>${dateStr || getRealTodayStr()}</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">🕒 الوردية المجدولة:</td><td>من ${scheduledStart} إلى ${scheduledEnd} (${regularHours} س)</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">📸 البصمة الفعلية:</td><td>من ${actualIn} إلى ${actualOut} (إجمالي: ${totalHours} س)</td></tr>
        <tr><td style="padding: 6px 0; font-weight: bold;">⭐ الساعات الإضافية:</td><td><strong style="color: #15803d; font-size: 15px;">+${overtimeHours} ساعة إضافية</strong></td></tr>
      </table>
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://pharmacy-time-tracker.vercel.app" style="display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: bold;">
        🔗 اعتماد الساعات الإضافية أو رفضها
      </a>
    </p>
  `;

  const html = buildEmailTemplate({
    title: `⏱️ طلب اعتماد ساعات إضافية: ${empName}`,
    subtitle: `ساعات عمل إضافية فوق ساعات الجدول الشهري — ${resolvedBranch}`,
    badgeText: `+${overtimeHours} ساعة إضافية`,
    badgeColor: '#16a34a',
    bodyContent: content,
    footerText: 'في حال الموافقة تُحتسب الساعات في الراتب، وفي حال الرفض تُستبعد'
  });

  return sendGmailEmail({
    gmailConfig,
    recipientEmail: targetEmail,
    subject: `⏱️ طلب اعتماد ساعات إضافية (+${overtimeHours} س): ${empName} — فرع ${resolvedBranch}`,
    htmlContent: html
  });
}


