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
  { id: 'promotions', name: '📈 شهادات وإخطارات زيادة الراتب', icon: '📈' },
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
  },

  // ── 5. شهادات وإخطارات زيادة الراتب ──────────────────────────────────────
  {
    id: 'promotion_official_certificate',
    category: 'promotions',
    title: 'شهادة وإخطار زيادة راتب رسمية (معتمد ومفصل)',
    icon: '📜',
    supportsPdf: true,
    text: `السلام عليكم ورحمة الله وبركاته،

عزيزنا الزميل: *{اسم_الموظف}* (كود: {كود_الموظف})
🏢 الفرع: {الفرع}
💼 المسمى الوظيفي: {المسمى_الوظيفي}

تحية طيبة وبعد،،
يسر إدارة *{اسم_المؤسسة}* أن تتوجه إليكم بأصدق عبارات الشكر والتقدير لجهودكم وتفانيكم المثمر في خدمة وتطوير العمل.

📜 بناءً على قرار الإدارة رقم ({رقم_القرار})، يسعدنا إخطاركم باعتماد:
⭐ *{نوع_الزيادة}*
━━━━━━━━━━━━━━━━━━━━━
⏱️ سعر الساعة قبل الزيادة: {السعر_قبل} ج.م / س
🚀 سعر الساعة الجديد المعتمد: *{السعر_بعد} ج.م / س*
📈 مقدار الزيادة: +{مقدار_الزيادة} ج.م ({نسبة_الزيادة}%)
📅 تاريخ بدء السريان: {تاريخ_السريان}
━━━━━━━━━━━━━━━━━━━━━

{نص_التهنئة}

{ملاحظة_المرفق_PDF}

مع أطيب تمنياتنا لكم بمزيد من التوفيق والتألق والنجاح المستمر،
إدارة: *{اسم_المؤسسة}* 🌸`
  },
  {
    id: 'promotion_congrats_brief',
    category: 'promotions',
    title: 'تهنئة سريعة وموجزة باعتماد زيادة الراتب',
    icon: '🎉',
    supportsPdf: false,
    text: `السلام عليكم ورحمة الله وبركاته،

عزيزنا الزميل: *{اسم_الموظف}* 🌸
ألف مبروك! يسر إدارة *{اسم_المؤسسة}* تهنئتكم باعتماد *{نوع_الزيادة}* تقديراً لعطائكم المتميز:

💵 سعر الساعة الجديد: *{السعر_بعد} ج.م / س* (بزيادة +{مقدار_الزيادة} ج.م)
📅 اعتباراً من: {تاريخ_السريان}

سائلين الله لكم دوام التوفيق والنجاح 🌟
إدارة: *{اسم_المؤسسة}*`
  }
];

/**
 * دمج المتغيرات الحية داخل نص القالب
 */
export function populateWhatsAppTemplate(templateText, emp, summary, orgSettings, monthLabel, branchName = '', promotionData = {}) {
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

  // بيانات الزيادة والعلاوة
  const p = promotionData || {};
  const incTypeLabel = p.type === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : (p.typeLabel || 'زيادة سنوية دورية');
  const incDate = p.effectiveDate || p.date || todayStr;
  const rateBefore = fmt(p.rateBefore !== undefined ? p.rateBefore : 0);
  const rateAfter = fmt(p.rateAfter !== undefined ? p.rateAfter : 0);
  const diff = (p.rateAfter || 0) - (p.rateBefore || 0);
  const diffFormatted = fmt(diff > 0 ? diff : 0);
  const pctFormatted = p.percentage !== undefined
    ? p.percentage
    : (p.rateBefore > 0 ? (((diff) / p.rateBefore) * 100).toFixed(1) : '0');
  const decisionNum = p.decisionNumber || `INC-${(p.effectiveDate || '').replace(/[^0-9]/g, '') || '2026'}`;
  const appreciation = p.appreciationText || 'تقديراً لجهودكم وتفانيكم المثمر وإسهاماتكم الملموسة في نجاح وتطور المؤسسة.';
  const pdfNote = p.includePdf
    ? '📌 مرفق طيه شهادة زيادة الراتب الرسمية المعتمدة بصيغة PDF.'
    : '';

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
    .replace(/{تاريخ_اليوم}/g, todayStr)
    // وسوم الزيادات
    .replace(/{نوع_الزيادة}/g, incTypeLabel)
    .replace(/{تاريخ_السريان}/g, incDate)
    .replace(/{السعر_قبل}/g, rateBefore)
    .replace(/{السعر_بعد}/g, rateAfter)
    .replace(/{مقدار_الزيادة}/g, diffFormatted)
    .replace(/{نسبة_الزيادة}/g, pctFormatted)
    .replace(/{رقم_القرار}/g, decisionNum)
    .replace(/{نص_التهنئة}/g, appreciation)
    .replace(/{ملاحظة_المرفق_PDF}/g, pdfNote);
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

function generateSvgBarcode(code) {
  const safeStr = String(code || 'INC-2026').replace(/[^a-zA-Z0-9-]/g, '');
  let barsHtml = '';
  let x = 8;
  const barWidths = [1.5, 2.5, 3.2, 1.8, 2.8, 3.6];
  for (let i = 0; i < safeStr.length; i++) {
    const charCode = safeStr.charCodeAt(i);
    const w1 = barWidths[(charCode + i) % barWidths.length];
    const gap = 1.5 + ((charCode % 3) * 0.7);
    barsHtml += `<rect x="${x.toFixed(1)}" y="2" width="${w1.toFixed(1)}" height="26" fill="#0f172a" />`;
    x += w1 + gap;
  }
  barsHtml = `<rect x="2" y="0" width="2" height="30" fill="#065f46" /><rect x="5" y="0" width="1.2" height="30" fill="#065f46" />` +
             barsHtml +
             `<rect x="${(x + 2).toFixed(1)}" y="0" width="1.2" height="30" fill="#065f46" /><rect x="${(x + 4.5).toFixed(1)}" y="0" width="2" height="30" fill="#065f46" />`;
  const totalWidth = Math.max(140, Math.ceil(x + 10));
  return `<svg width="${totalWidth}" height="30" viewBox="0 0 ${totalWidth} 30" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">${barsHtml}</svg>`;
}

/**
 * توليد كود HTML رسمي وفخم لشهادة زيادة الراتب للطباعة أو التوليد كـ PDF وإرساله عبر الواتساب
 */
export function generateSalaryIncreaseCertificateHtml(emp, increaseData = {}, orgSettings = {}, branchName = '') {
  const orgName = orgSettings?.orgName || 'مؤسسة صيدليات د. أحمد خالد';
  const empName = emp ? (emp.displayName || emp.name || 'الموظف') : (increaseData.employeeName || 'الزميل الفاضل');
  const empCode = emp?.code || increaseData.employeeCode || '---';
  const jobTitle = increaseData.jobTitle || emp?.jobTitle || 'عضو الكادر المهني';
  const branch = increaseData.branchName || branchName || emp?.branchName || 'الفرع الرئيسي';
  const empPhone = increaseData.phone || emp?.phone || emp?.phoneNumber || 'غير مسجل';

  const todayStr = new Date().toISOString().slice(0, 10);
  const decisionDate = increaseData.decisionDate || increaseData.issueDate || todayStr;
  const effectiveDate = increaseData.effectiveDate || increaseData.date || decisionDate;
  const issueDate = increaseData.issueDate || decisionDate;
  const decisionNumber = increaseData.decisionNumber || `INC-${(decisionDate || '').replace(/[^0-9]/g, '') || '2026'}`;
  
  const incTypeLabel = increaseData.type === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : (increaseData.type === 'adjustment' ? 'تعديل هيكلي ومواءمة أجور' : (increaseData.typeLabel || 'زيادة سنوية دورية'));
  const rateBefore = fmt(increaseData.rateBefore !== undefined ? increaseData.rateBefore : 0);
  const rateAfter = fmt(increaseData.rateAfter !== undefined ? increaseData.rateAfter : 0);
  const diff = (parseFloat(increaseData.rateAfter) || 0) - (parseFloat(increaseData.rateBefore) || 0);
  const diffFormatted = fmt(diff > 0 ? diff : 0);
  const pctFormatted = increaseData.percentage !== undefined
    ? increaseData.percentage
    : (parseFloat(increaseData.rateBefore) > 0 ? (((diff) / parseFloat(increaseData.rateBefore)) * 100).toFixed(1) : '0');

  const appreciationText = increaseData.appreciationText || 
    'تقديراً لجهودكم المتميزة، وعطائكم المتواصل، وإخلاصكم المشهود في خدمة وتطوير العمل والارتقاء بالأداء العام للمؤسسة، يسر الإدارة اعتماد هذه الزيادة وترقيتكم المالية متمنين لكم دوام التوفيق والتميز.';
  
  const signatory1Title = increaseData.signatory1Title || 'المدير العام للمؤسسة';
  const signatory1Name = increaseData.signatory1Name || orgSettings?.managerName || orgSettings?.generalManagerName || 'الإدارة العليا';
  const signatory2Title = increaseData.signatory2Title || 'مدير الموارد البشرية (HR)';
  const signatory2Name = increaseData.signatory2Name || orgSettings?.hrManagerName || 'شؤون الكوادر البشرية';
  
  const showStamp = increaseData.showStamp !== false;
  const showBarcode = increaseData.showBarcode !== false;
  const showLogo = increaseData.showLogo !== false;
  const logoUrl = orgSettings?.logoUrl || orgSettings?.logo || '';
  const qrDataUrl = increaseData.qrDataUrl || '';
  const barcodeSvg = generateSvgBarcode(decisionNumber);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>شهادة زيادة راتب رسمية - ${empName}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      background: #ffffff;
      color: #0f172a;
      direction: rtl;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      padding: 6px;
    }
    .cert-frame {
      border: 3px solid #064e3b;
      box-shadow: inset 0 0 0 2.5px #ffffff, inset 0 0 0 4.5px #d97706, inset 0 0 0 6.5px #ffffff, inset 0 0 0 8px #10b981;
      border-radius: 14px;
      padding: 20px 24px 18px 24px;
      position: relative;
      background: #ffffff;
      min-height: 270mm;
      max-height: 275mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .corner {
      position: absolute;
      color: #d97706;
      font-size: 15px;
      line-height: 1;
      user-select: none;
      pointer-events: none;
    }
    .corner-tl { top: 10px; left: 12px; }
    .corner-tr { top: 10px; right: 12px; }
    .corner-bl { bottom: 10px; left: 12px; }
    .corner-br { bottom: 10px; right: 12px; }

    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-size: 64px;
      font-weight: 900;
      color: rgba(16, 185, 129, 0.032);
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
    }
    .cert-topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #047857;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .org-section {
      text-align: right;
    }
    .org-name {
      font-size: 21px;
      font-weight: 900;
      color: #064e3b;
      line-height: 1.2;
    }
    .dept-name {
      font-size: 12px;
      color: #047857;
      font-weight: 700;
      margin-top: 2px;
    }
    .sub-dept {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .logo-container {
      text-align: center;
      min-width: 80px;
    }
    .cert-badge-wrap {
      text-align: center;
      margin-bottom: 10px;
    }
    .cert-badge {
      display: inline-block;
      background: linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f766e 100%);
      color: #ffffff;
      padding: 7px 32px;
      border-radius: 24px;
      font-size: 17px;
      font-weight: 900;
      letter-spacing: 0.4px;
      border: 1.5px solid #fbbf24;
      box-shadow: 0 4px 12px rgba(6, 78, 59, 0.2);
    }
    .decision-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .meta-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 10px;
      text-align: center;
    }
    .meta-card-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 2px;
    }
    .meta-card-value {
      font-size: 12px;
      font-weight: 800;
      color: #064e3b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .emp-banner {
      background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
      border: 1.5px solid #a7f3d0;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .emp-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 16px;
      font-size: 13px;
    }
    .grid-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lbl {
      font-weight: 700;
      color: #475569;
      font-size: 12px;
      white-space: nowrap;
    }
    .val {
      font-weight: 800;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .appreciation-box {
      font-size: 13px;
      line-height: 1.8;
      color: #1e293b;
      margin-bottom: 12px;
      text-align: justify;
      background: #ffffff;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      border-right: 4px solid #059669;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    .rates-card {
      margin-bottom: 12px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
    }
    .rates-header {
      background: linear-gradient(to left, #f1f5f9, #f8fafc);
      padding: 8px 14px;
      font-weight: 800;
      font-size: 12.5px;
      color: #334155;
      border-bottom: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .rates-table {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
      font-size: 13px;
    }
    .rates-table th {
      background: #f8fafc;
      padding: 8px;
      font-weight: 800;
      color: #475569;
      border-bottom: 1.5px solid #e2e8f0;
    }
    .rates-table td {
      padding: 10px;
      font-weight: 800;
      border-bottom: 1px solid #e2e8f0;
    }
    .old-rate {
      color: #64748b;
      font-size: 14px;
    }
    .new-rate {
      color: #047857;
      font-size: 16px;
      font-weight: 900;
      background: #ecfdf5;
    }
    .diff-rate {
      color: #16a34a;
      font-size: 14px;
    }
    .effective-box {
      margin-top: 8px;
      padding: 9px 14px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 800;
      color: #065f46;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .signatures-section {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1.5px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      align-items: center;
    }
    .sign-box {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 80px;
    }
    .sign-title {
      font-weight: 800;
      color: #334155;
      margin-bottom: 26px;
    }
    .sign-name {
      font-weight: 700;
      color: #64748b;
    }
    .center-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .seal-box {
      border: 2px dashed #059669;
      border-radius: 50%;
      width: 76px;
      height: 76px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      color: #059669;
      transform: rotate(-6deg);
      line-height: 1.3;
      background: rgba(16, 185, 129, 0.03);
    }
    .qr-verify-box {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px 6px;
    }
    .cert-footer {
      text-align: center;
      font-size: 10.5px;
      color: #94a3b8;
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px dashed #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    @media print {
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        background: #ffffff !important;
        width: 210mm !important;
        height: 297mm !important;
        overflow: hidden !important;
      }
      .cert-frame {
        width: 196mm !important;
        height: 278mm !important;
        max-height: 278mm !important;
        min-height: 278mm !important;
        margin: 6mm auto !important;
        page-break-inside: avoid !important;
        page-break-after: avoid !important;
        page-break-before: avoid !important;
        overflow: hidden !important;
      }
    }
  </style>
</head>
<body>
  <div class="cert-frame">
    <span class="corner corner-tl">❖</span>
    <span class="corner corner-tr">❖</span>
    <span class="corner corner-bl">❖</span>
    <span class="corner corner-br">❖</span>
    
    <div class="watermark">${orgName}</div>

    <!-- Top Section -->
    <div>
      <!-- Header with Logo / Barcode -->
      <div class="cert-topbar">
        <div class="org-section">
          <div class="org-name">${orgName}</div>
          <div class="dept-name">الإدارة العليا • الإدارة العامة للموارد البشرية والمالية</div>
          <div class="sub-dept">سجل وثائق وشؤون الكوادر والكفاءات المهنية</div>
        </div>

        ${showLogo ? `
          <div class="logo-container">
            ${logoUrl ? `
              <img src="${logoUrl}" alt="Logo" style="max-height: 50px; max-width: 130px; object-fit: contain;" />
            ` : `
              <svg width="44" height="44" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 4L7 11V22C7 32.5 14.3 42.2 24 45C33.7 42.2 41 32.5 41 22V11L24 4Z" fill="#047857" stroke="#d97706" stroke-width="2"/>
                <path d="M24 14V34M14 24H34" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
              </svg>
            `}
          </div>
        ` : ''}

        ${showBarcode ? `
          <div style="text-align: left;">
            <div style="font-size: 9px; font-weight: 700; color: #64748b; margin-bottom: 2px;">كود الاعتماد الرقمي</div>
            ${barcodeSvg}
            <div style="font-size: 9.5px; font-weight: 800; color: #047857; text-align: center; font-family: monospace;">${decisionNumber}</div>
          </div>
        ` : ''}
      </div>

      <!-- Badge -->
      <div class="cert-badge-wrap">
        <div class="cert-badge">📜 شهادة زيادة راتب وترقية مالية معتمدة</div>
      </div>

      <!-- Decision Meta Grid (Anti-Collision 4-Columns) -->
      <div class="decision-meta-grid">
        <div class="meta-card">
          <div class="meta-card-label">📋 رقم القرار الإداري</div>
          <div class="meta-card-value">${decisionNumber}</div>
        </div>
        <div class="meta-card">
          <div class="meta-card-label">🏷️ نوع وحالة القرار</div>
          <div class="meta-card-value">${incTypeLabel}</div>
        </div>
        <div class="meta-card">
          <div class="meta-card-label">📅 تاريخ صدور القرار</div>
          <div class="meta-card-value">${decisionDate}</div>
        </div>
        <div class="meta-card">
          <div class="meta-card-label">⏱️ تاريخ سريان التطبيق</div>
          <div class="meta-card-value">${effectiveDate}</div>
        </div>
      </div>

      <!-- Employee Banner -->
      <div class="emp-banner">
        <div class="emp-grid">
          <div class="grid-item">
            <span class="lbl">اسم الموظف:</span>
            <span class="val">${empName}</span>
          </div>
          <div class="grid-item">
            <span class="lbl">الرقم التعريفي:</span>
            <span class="val">${empCode}</span>
          </div>
          <div class="grid-item">
            <span class="lbl">المسمى الوظيفي:</span>
            <span class="val">${jobTitle}</span>
          </div>
          <div class="grid-item">
            <span class="lbl">مقر العمل والفرع:</span>
            <span class="val">${branch}</span>
          </div>
          <div class="grid-item">
            <span class="lbl">رقم الهاتف:</span>
            <span class="val">${empPhone}</span>
          </div>
          <div class="grid-item">
            <span class="lbl">مرجع الاعتماد:</span>
            <span class="val" style="color: #059669;">سجل الموارد البشرية</span>
          </div>
        </div>
      </div>

      <!-- Letter / Appreciation -->
      <div class="appreciation-box">
        ${appreciationText}
      </div>

      <!-- Financial Rates Details -->
      <div class="rates-card">
        <div class="rates-header">
          <span>📊 تفاصيل تعديل الأجر وسعر الساعة المعتمد بالمنظومة:</span>
          <span style="font-size: 11px; color: #059669; font-weight: 800;">مطابق للائحة الأجور والرواتب الرسمية</span>
        </div>
        <table class="rates-table">
          <thead>
            <tr>
              <th>سعر الساعة قبل الزيادة</th>
              <th>مقدار الزيادة بالساعة</th>
              <th>نسبة الزيادة المئوية</th>
              <th>سعر الساعة الجديد المعتمد</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="old-rate">${rateBefore} ج.م / س</td>
              <td class="diff-rate">+${diffFormatted} ج.م / س</td>
              <td class="diff-rate">+${pctFormatted}%</td>
              <td class="new-rate">⭐ ${rateAfter} ج.م / ساعة</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Effective Date Notice -->
      <div class="effective-box">
        <span>⏱️ تاريخ بدء سريان وتطبيق الزيادة رسمياً على كشوف المرتبات:</span>
        <span style="font-size: 13.5px; color: #064e3b; font-weight: 900;">اعتباراً من: ${effectiveDate}</span>
      </div>
    </div>

    <!-- Signatures and Footer -->
    <div>
      <div class="signatures-section">
        <div class="sign-box">
          <div class="sign-title">${signatory2Title}</div>
          <div class="sign-name">${signatory2Name}</div>
        </div>

        <div class="center-col">
          ${showStamp ? `
            <div class="seal-box">
              ختم الاعتماد<br />
              المعتمد رسمياً<br />
              ${new Date().getFullYear()}
            </div>
          ` : ''}

          ${qrDataUrl ? `
            <div class="qr-verify-box" title="امسح الرمز للتحقق من صحة القرار">
              <img src="${qrDataUrl}" alt="QR Code" style="width: 42px; height: 42px; display: block;" />
              <div style="font-size: 8.5px; font-weight: 700; color: #475569; text-align: right; line-height: 1.2;">
                التحقق الرقمي<br />
                <span style="color: #059669;">QR Verified</span>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="sign-box">
          <div class="sign-title">${signatory1Title}</div>
          <div class="sign-name">${signatory1Name}</div>
        </div>
      </div>

      <div class="cert-footer">
        <span>وثيقة رسمية صادرة ومقيدة بالسجل المالي لنظام إدارة الموارد البشرية</span>
        <span style="font-weight: 800; color: #064e3b;">رقم القرار المرجعي: ${decisionNumber}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}


