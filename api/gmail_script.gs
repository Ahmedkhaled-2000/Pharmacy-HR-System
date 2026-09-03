/**
 * =========================================================================
 * ✉️ سكربت Google Apps Script لإرسال إشعارات بريد Gmail ونظام الموارد البشرية
 * =========================================================================
 * 
 * 📌 خطوات التثبيت في 1 دقيقة:
 * 1. افتح https://script.google.com/home/start وسجّل الدخول بحساب الجيميل الخاص بك.
 * 2. اضغط "مشروع جديد" (New project).
 * 3. انسخ هذا الكود بالكامل والصقه في المحرر بدلاً من أي كود افتراضي.
 * 4. اضغط زر "نشر" (Deploy) ➔ "نشر جديد" (New deployment).
 * 5. اضغط على أيقونة الترس ⚙️ بجانب "Select type" واختر "تطبيق ويب" (Web app).
 * 6. اضبط الإعدادات التالية:
 *    - الوصف: HR Pharmacy Gmail Notifier
 *    - تنفيذ التطبيق باسم (Execute as): "أنا" (Me)
 *    - من يمكنه الوصول (Who has access): "أي مستخدم" (Anyone)
 * 7. اضغط "نشر" (Deploy) وامنح الأذونات لحسابك (Authorize access).
 * 8. انسخ "عنوان URL لتطبيق الويب" (Web app URL) وضعه في حقل "رابط Webhook الخدمة" في النظام!
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    
    // اختبار الاتصال السريع
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

    // إرسال الإيميل عبر خدمة MailApp المعتمدة من Google
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
}
