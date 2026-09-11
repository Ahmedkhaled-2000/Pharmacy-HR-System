/**
 * src/utils/whatsappTemplates.js
 * مكتبة القوالب الجاهزة والذكية لرسائل الواتساب
 * - كشوفات تفاصيل المرتب الشاملة
 * - رسائل التهنئة والمناسبات
 * - التنبيهات الإدارية وتذكيرات البصمة
 * - توليد كشف المرتب كـ HTML للتحويل إلى PDF
 */

import { fmt } from './formatters';

export const WHATSAPP_TEMPLATE_CATEGORIES = [
  { id: 'payslips', name: '📄 كشوفات المرتبات والمستحقات', icon: '💰' },
  { id: 'greetings', name: '🎉 رسائل التهنئة والمناسبات', icon: '🎈' },
  { id: 'reminders', name: '⏰ تذكيرات البصمة والدوام', icon: '⏱️' },
  { id: 'admin', name: '📢 تعاميم وتنبيهات إدارية', icon: '📌' }
];

export const READY_WHATSAPP_TEMPLATES = [
  // ── 1. كشوفات المرتبات ───────────────────────────────────────────────────
  {
    id: 'payslip_detailed',
    category: 'payslips',
    title: 'كشف مفردات المرتب التفصيلي الشامل (موصى به)',
    icon: '📊',
    supportsPdf: true,
    text: `السلام عليكم ورحمة الله وبركاته،

عزيزي الزميل: *{اسم_الموظف}* (كود: {كود_الموظف})
تحية طيبة وبعد،،

إليك تفاصيل ومفردات كشف مرتب شهر *{الشهر}*:
🏢 الفرع: {الفرع}
💼 المسمى الوظيفي: {المسمى_الوظيفي}

━━━━━━━━━━━━━━━━━━━━━
💰 *أولاً: المستحقات الإجمالية (+)*
• الراتب الأساسي: {الراتب_الأساسي} ج.م
• ساعات العمل المنجزة: {ساعات_العمل} ساعة
• المكافآت والحوافز: {المكافآت} ج.م
• البدلات والإضافي: {البدلات} ج.م
━━━━━━━━━━━━━━━━━━━━━
🔻 *ثانياً: الاستقطاعات والخصومات (-)*
• خصومات التأخير والغياب: {خصومات_الغياب} ج.م
• السلف والأقساط المستردة: {السلف} ج.م
• إجمالي الاستقطاعات: {إجمالي_الخصومات} ج.م
━━━━━━━━━━━━━━━━━━━━━
⭐ *صافي المرتب المستحق للصرف:*
👉 *{صافي_المرتب} ج.م*
━━━━━━━━━━━━━━━━━━━━━

📌 مرفق كشف المرتب الرسمي كملف PDF معتمد.
شاكرين ومقدرين جهودكم المتميزة وإخلاصكم في العمل.

مع تحيات إدارة: *{اسم_المؤسسة}* 🌸`
  },
  {
    id: 'payslip_summary',
    category: 'payslips',
    title: 'إشعار تحويل وصافي المرتب (مختصر وسريع)',
    icon: '⚡',
    supportsPdf: false,
    text: `السلام عليكم ورحمة الله وبركاته،

عزيزي الزميل: *{اسم_الموظف}* 🌸
نحيطكم علماً بأنه قد تم اعتماد وتجهيز صافي مرتب شهر *{الشهر}*:

💵 صافي المستحق: *{صافي_المرتب} ج.م*
🏢 الفرع: {الفرع}

شاكرين لكم حسن التعاون والالتزام المستمر.
إدارة: *{اسم_المؤسسة}*`
  },

  // ── 2. رسائل التهنئة ────────────────────────────────────────────────────
  {
    id: 'greeting_ramadan',
    category: 'greetings',
    title: 'تهنئة حلول شهر رمضان المبارك 🌙',
    icon: '🌙',
    supportsPdf: false,
    text: `🌙 *تهنئة خاصة بحلول شهر رمضان المبارك* 🌙

الزميل العزيز: *{اسم_الموظف}*
يسر أسرة وإدارة *{اسم_المؤسسة}* أن تتقدم إليكم بأسمى آيات التهاني والتبريكات بمناسبة حلول شهر رمضان المبارك.

سائلين المولى عز وجل أن يتقبل منا ومنكم صالح الأعمال، وأن يعيده عليكم وعلى أسركم الكريمة بالخير واليمن والبركات.

كل عام وأنتم وأحبابكم بألف خير 🌸✨`
  },
  {
    id: 'greeting_eid_fitr',
    category: 'greetings',
    title: 'تهنئة عيد الفطر المبارك 🎈',
    icon: '🎈',
    supportsPdf: false,
    text: `🌸 *عيدكم مبارك وكل عام وأنتم بخير* 🌸

عزيزنا الزميل: *{اسم_الموظف}*
تتقدم إدارة *{اسم_المؤسسة}* بأصدق التهاني وأطيب الأماني بمناسبة حلول *عيد الفطر المبارك*.

تقبل الله طاعاتكم وأتم بالعيد فرحتكم وأسعد قلوبكم.
عيد سعيد مبارك عليكم وعلى عائلاتكم الكريمة 🎉🌷`
  },
  {
    id: 'greeting_eid_adha',
    category: 'greetings',
    title: 'تهنئة عيد الأضحى المبارك 🐑',
    icon: '🐑',
    supportsPdf: false,
    text: `✨ *أضحى مبارك وكل عام وأنتم بخير* ✨

الزميل الفاضل: *{اسم_الموظف}*
بمناسبة حلول *عيد الأضحى المبارك*، يسعدنا أن نبعث إليكم بخالص التهاني القلبية والتمنيات الطيبة.

أعاده الله عليكم بالصحة والعافية وسعة الرزق والبركة.
كل عام وأنتم إلى الله أقرب 🌸🎊`
  },
  {
    id: 'greeting_birthday',
    category: 'greetings',
    title: 'تهنئة عيد ميلاد الموظف 🎂',
    icon: '🎂',
    supportsPdf: false,
    text: `🎂 *عيد ميلاد سعيد* 🎂

الزميل العزيز: *{اسم_الموظف}*
عائلة وإدارة *{اسم_المؤسسة}* تتمنى لك عيد ميلاد سعيد ويوم مميز!

نسأل الله لك عاماً حافلاً بالتوفيق والنجاح، والصحة والعافية، والمزيد من التقدم والازدهار في مسيرتك معنا.

كل عام وأنت بألف خير وسعادة 🎈🎉🎁`
  },
  {
    id: 'greeting_anniversary',
    category: 'greetings',
    title: 'تهنئة بذكرى الانضمام للعمل (Anniversary) 🏆',
    icon: '🏆',
    supportsPdf: false,
    text: `🌟 *شكراً لعطائك المستمر معنا* 🌟

عزيزنا الزميل: *{اسم_الموظف}*
في مثل هذا الوقت تشرفنا بانضمامك إلى فريق عمل *{اسم_المؤسسة}*.

نود أن نعبر عن بالغ فخرنا واعتزازنا بجهودك وتفانيك وإسهاماتك الملموسة في نجاح وتطور المؤسسة.
نتمنى لك مزيداً من الإبداع والتميز لسنوات عديدة قادمة 🌸👏`
  },
  {
    id: 'greeting_star_employee',
    category: 'greetings',
    title: 'تهنئة موظف الشهر المتميز ⭐',
    icon: '⭐',
    supportsPdf: false,
    text: `🏆 *تكريم وتميز - نجم الشهر* 🏆

يسر إدارة *{اسم_المؤسسة}* أن تهنئ الزميل المتميز:
🌟 *{اسم_الموظف}* 🌟

تقديراً لأدائك الاستثنائي، والتزامك العالي، وروح التعاون الإيجابية التي تضفيها على فريق العمل.
أنت نموذج يحتذى به في التفاني والتميز.. فخورون بوجودك معنا دائماً! 👏💐`
  },

  // ── 3. تذكيرات البصمة والدوام ───────────────────────────────────────────
  {
    id: 'reminder_clock_in',
    category: 'reminders',
    title: 'تذكير تسجيل بصمة الحضور ⏰',
    icon: '⏰',
    supportsPdf: false,
    text: `صباح الخير زميلنا العزيز: *{اسم_الموظف}* ☀️
نذكركم بلطف بضرورة تسجيل بصمة الحضور فور الوصول إلى مقر الفرع (*{الفرع}*) لضمان دقة احتساب ساعات العمل والمستحقات اليومية.

نتمنى لك يوماً موفقاً ومثمراً بالصحة والنشاط!
مع تحيات: *{اسم_المؤسسة}*`
  },
  {
    id: 'reminder_clock_out',
    category: 'reminders',
    title: 'تذكير تسجيل بصمة الانصراف 🚪',
    icon: '🚪',
    supportsPdf: false,
    text: `السلام عليكم زميلنا: *{اسم_الموظف}*
نرجو التكرم بالتأكد من تسجيل بصمة الانصراف عند انتهاء ورديتك اليومية بفرع (*{الفرع}*) تجنباً لأي خصومات تلقائية في ساعات العمل.

نشكركم على جهودكم اليوم وتصبحون على خير 🌸`
  },

  // ── 4. تعاميم وتنبيهات إدارية ──────────────────────────────────────────
  {
    id: 'admin_official_holiday',
    category: 'admin',
    title: 'إشعار إجازة رسمية 🏖️',
    icon: '🏖️',
    supportsPdf: false,
    text: `📢 *إشعار إداري - إجازة رسمية*
تحية طيبة لكافة الزملاء،

تعلن إدارة *{اسم_المؤسسة}* عن منح إجازة رسمية بمناسبة [اسم المناسبة]، وذلك يوم [اليوم والتاريخ].
سيكون استئناف العمل كالمعتاد بمشيئة الله اعتباراً من [تاريخ العودة].

مع تمنياتنا للجميع بقضاء أوقات سعيدة وممتعة 🌸`
  },
  {
    id: 'admin_general_announcement',
    category: 'admin',
    title: 'تنبيه إداري وتعميم عام 📌',
    icon: '📌',
    supportsPdf: false,
    text: `📢 *تعميم إداري هام*
من إدارة: *{اسم_المؤسسة}*
إلى الزميل العزيز: *{اسم_الموظف}*

برجاء التكرم بالعلم والالتزام بالتعليمات واللوائح الصادرة بخصوص:
[اكتب موضوع التنبيه والتعليمات هنا]

شاكرين لكم حسن تعاونكم وحرصكم الدائم على الصالح العام.`
  }
];

/**
 * دمج المتغيرات الحية داخل نص القالب
 */
export function populateWhatsAppTemplate(templateText, emp, summary, orgSettings, monthLabel, branchName = '') {
  if (!templateText) return '';

  const orgName = orgSettings?.orgName || 'المؤسسة';
  const empName = emp ? (emp.displayName || emp.name || 'الزميل') : 'عزيزي الموظف';
  const empCode = emp?.code || '---';
  const jobTitle = emp?.jobTitle || 'عضو كادر';
  const branch = branchName || emp?.branchName || 'الفرع الرئيسي';
  const todayStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  const s = summary || {};
  const baseSalary = fmt(s.baseEarnings || emp?.baseSalary || emp?.salary || 0);
  const totalBonus = fmt(s.totalBonus || s.bonus || 0);
  const allowances = fmt(s.allowances || s.transportAllowance || 0);
  const absenceDeduction = fmt(s.absenceDeduction || s.lateDeduction || 0);
  const advances = fmt(s.advances || s.loanDeduction || 0);
  const totalDeductions = fmt(s.totalDeduction || s.deductions || 0);
  const netSalary = fmt(s.netSalary || (Number(emp?.baseSalary || 0) + Number(s.totalBonus || 0) - Number(s.totalDeduction || 0)));
  const hoursWorked = fmt(s.hours || 0);

  return templateText
    .replace(/{اسم_الموظف}/g, empName)
    .replace(/{كود_الموظف}/g, empCode)
    .replace(/{الفرع}/g, branch)
    .replace(/{المسمى_الوظيفي}/g, jobTitle)
    .replace(/{الشهر}/g, monthLabel || 'الحالي')
    .replace(/{ساعات_العمل}/g, hoursWorked)
    .replace(/{الراتب_الأساسي}/g, baseSalary)
    .replace(/{المكافآت}/g, totalBonus)
    .replace(/{البدلات}/g, allowances)
    .replace(/{خصومات_الغياب}/g, absenceDeduction)
    .replace(/{السلف}/g, advances)
    .replace(/{إجمالي_الخصومات}/g, totalDeductions)
    .replace(/{صافي_المرتب}/g, netSalary)
    .replace(/{اسم_المؤسسة}/g, orgName)
    .replace(/{تاريخ_اليوم}/g, todayStr);
}

/**
 * توليد كود HTML متناسق وفخم لكشف المرتب لطباعته كـ PDF وتمريره للواتساب
 */
export function generatePayslipPrintHtml(emp, summary, orgSettings, monthLabel, branchName = '') {
  const orgName = orgSettings?.orgName || 'مؤسسة الصيدليات وإدارة الموارد البشرية';
  const empName = emp ? (emp.displayName || emp.name) : 'الموظف';
  const empCode = emp?.code || '---';
  const jobTitle = emp?.jobTitle || 'كادر وظيفي';
  const branch = branchName || emp?.branchName || 'الفرع العام';
  const printDate = new Date().toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' });

  const s = summary || {};
  const baseSalary = fmt(s.baseEarnings || emp?.baseSalary || emp?.salary || 0);
  const totalBonus = fmt(s.totalBonus || 0);
  const overtime = fmt(s.overtimeEarnings || s.overtime || 0);
  const transport = fmt(s.transportAllowance || 0);
  const totalEarnings = fmt(Number(s.baseEarnings || 0) + Number(s.totalBonus || 0) + Number(s.overtimeEarnings || 0) + Number(s.transportAllowance || 0));

  const absenceDeduction = fmt(s.absenceDeduction || 0);
  const lateDeduction = fmt(s.lateDeduction || 0);
  const advances = fmt(s.advances || 0);
  const penalties = fmt(s.penalties || 0);
  const totalDeductions = fmt(s.totalDeduction || 0);

  const netSalary = fmt(s.netSalary || 0);
  const hours = fmt(s.hours || 0);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف مرتب - ${empName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      padding: 24px;
      line-height: 1.5;
    }
    .payslip-container {
      max-width: 800px;
      margin: 0 auto;
      border: 2px solid #059669;
      border-radius: 16px;
      padding: 28px;
      position: relative;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #10b981;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .org-title {
      font-size: 20px;
      font-weight: 800;
      color: #065f46;
    }
    .doc-badge {
      background: #ecfdf5;
      color: #047857;
      border: 1.5px solid #10b981;
      padding: 6px 14px;
      border-radius: 20px;
      font-weight: 800;
      font-size: 14px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      margin-bottom: 24px;
      font-size: 13.5px;
    }
    .info-item {
      display: flex;
      gap: 8px;
    }
    .info-label {
      font-weight: 700;
      color: #64748b;
    }
    .info-value {
      font-weight: 800;
      color: #0f172a;
    }
    .tables-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      text-align: right;
    }
    th {
      background: #f1f5f9;
      font-weight: 800;
      color: #334155;
    }
    .earnings-table th {
      background: #ecfdf5;
      color: #065f46;
      border-top: 2px solid #10b981;
    }
    .deductions-table th {
      background: #fef2f2;
      color: #991b1b;
      border-top: 2px solid #ef4444;
    }
    .amount {
      direction: ltr;
      text-align: left;
      font-family: monospace;
      font-weight: 700;
    }
    .total-row td {
      font-weight: 800;
      background: #f8fafc;
      border-top: 2px solid #cbd5e1;
    }
    .net-salary-card {
      background: linear-gradient(135deg, #065f46 0%, #047857 100%);
      color: #ffffff;
      padding: 18px 24px;
      border-radius: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      box-shadow: 0 4px 15px rgba(5, 150, 105, 0.25);
    }
    .net-salary-label {
      font-size: 16px;
      font-weight: 700;
    }
    .net-salary-val {
      font-size: 26px;
      font-weight: 900;
      font-family: monospace;
      letter-spacing: 1px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      font-size: 11.5px;
      color: #64748b;
    }
    .stamp-box {
      border: 1.5px dashed #cbd5e1;
      border-radius: 8px;
      padding: 10px 24px;
      text-align: center;
      font-weight: 700;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="payslip-container">
    <div class="header">
      <div>
        <div class="org-title">${orgName}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">قسم الموارد البشرية والشؤون المالية</div>
      </div>
      <div class="doc-badge">
        كشف مرتب شهر: ${monthLabel}
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">اسم الموظف:</span>
        <span class="info-value">${empName}</span>
      </div>
      <div class="info-item">
        <span class="info-label">كود الموظف:</span>
        <span class="info-value">${empCode}</span>
      </div>
      <div class="info-item">
        <span class="info-label">الفرع المخصص:</span>
        <span class="info-value">${branch}</span>
      </div>
      <div class="info-item">
        <span class="info-label">المسمى الوظيفي:</span>
        <span class="info-value">${jobTitle}</span>
      </div>
      <div class="info-item">
        <span class="info-label">إجمالي الساعات:</span>
        <span class="info-value">${hours} ساعة</span>
      </div>
      <div class="info-item">
        <span class="info-label">تاريخ الإصدار:</span>
        <span class="info-value">${printDate}</span>
      </div>
    </div>

    <div class="tables-container">
      <!-- جدول المستحقات -->
      <table class="earnings-table">
        <thead>
          <tr>
            <th>بيان المستحقات (+)</th>
            <th class="amount">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>الراتب الأساسي المعتمد</td>
            <td class="amount">${baseSalary} ج.م</td>
          </tr>
          <tr>
            <td>مكافآت وحوافز التميز</td>
            <td class="amount">${totalBonus} ج.م</td>
          </tr>
          <tr>
            <td>بدل مواصلات وانتقال</td>
            <td class="amount">${transport} ج.م</td>
          </tr>
          <tr>
            <td>ساعات العمل الإضافية</td>
            <td class="amount">${overtime} ج.م</td>
          </tr>
          <tr class="total-row">
            <td>إجمالي المستحقات</td>
            <td class="amount">${totalEarnings} ج.م</td>
          </tr>
        </tbody>
      </table>

      <!-- جدول الاستقطاعات -->
      <table class="deductions-table">
        <thead>
          <tr>
            <th>بيان الاستقطاعات (-)</th>
            <th class="amount">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>خصومات الغياب</td>
            <td class="amount">${absenceDeduction} ج.م</td>
          </tr>
          <tr>
            <td>خصومات التأخير</td>
            <td class="amount">${lateDeduction} ج.م</td>
          </tr>
          <tr>
            <td>سلف وأقساط مستقطعة</td>
            <td class="amount">${advances} ج.م</td>
          </tr>
          <tr>
            <td>جزاءات إدارية</td>
            <td class="amount">${penalties} ج.م</td>
          </tr>
          <tr class="total-row">
            <td>إجمالي الاستقطاعات</td>
            <td class="amount">${totalDeductions} ج.م</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- بطاقة صافي الراتب المستحق -->
    <div class="net-salary-card">
      <div class="net-salary-label">
        ★ صافي المرتب المستحق للصرف النهائي:
      </div>
      <div class="net-salary-val">
        ${netSalary} EGP
      </div>
    </div>

    <div class="footer">
      <div>
        تم توليد هذا المستند إلكترونياً ومطابقته محاسبياً عبر منظومة إدارة الموارد البشرية.
      </div>
      <div class="stamp-box">
        اعتماد الإدارة المالية والشؤون القانونية
      </div>
    </div>
  </div>
</body>
</html>`;
}
