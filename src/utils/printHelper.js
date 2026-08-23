import { fmt } from './formatters';

/**
 * printHelper.js
 * مُحرك طباعة احترافي معزول ومستقل بنسبة 100% يمنع تماماً أي ظهور لصفحات بيضاء أو مشاكل في الـ CSS
 */

export function triggerDirectPrint(htmlContent, documentTitle = 'طباعة مستند') {
  // 1. Create or reuse hidden iframe
  const existingIframe = document.getElementById('isolated-print-frame');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'isolated-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>${documentTitle}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
      <style>
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 10px;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: 'Cairo', 'Tajawal', sans-serif;
          direction: rtl;
          font-size: 13px;
          line-height: 1.5;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 5px 8px;
        }
        .header-box {
          border-bottom: 3px double #0f766e;
          padding-bottom: 10px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: bold;
          font-size: 11.5px;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.focus();
            window.print();
          }, 250);
        };
      </script>
    </body>
    </html>
  `);
  doc.close();
}

/**
 * دالة لتوليد HTML كامل ومفصل لنموذج إخلاء الطرف والمخالصة المالية الشاملة
 */
export function generateClearanceSlipHTML({
  emp,
  state,
  terminationDate,
  effectiveReason,
  clearanceNotes,
  settlement,
  handoverChecklist = []
}) {
  const orgSettings = state.orgSettings || {};
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'المدير العام';
  const issueDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const serialNo = `CLR-${emp.code || emp.id}-${(terminationDate || '').replace(/-/g, '')}`;

  // Branches string
  const branchNames = (emp.branchesDetails && emp.branchesDetails.length > 0)
    ? emp.branchesDetails.map(bd => {
        const br = (state.branches || []).find(b => String(b.id) === String(bd.branchId));
        return br ? br.name : `فرع ${bd.branchId}`;
      }).join(' + ')
    : ((state.branches || []).find(b => String(b.id) === String(emp.branchId))?.name || emp.branchName || 'المركز الرئيسي');

  // Lifetime Shifts count & hours
  const empShifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) || (emp.code && String(s.employeeId) === String(emp.code)));
  const totalShiftsCount = empShifts.length;

  return `
    <div style="width: 100%; max-width: 800px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="border-bottom: 3px double #0f766e; padding-bottom: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: right;">
          <h2 style="margin: 0; color: #0f766e; font-size: 19px; font-weight: 800;">🏥 ${orgName}</h2>
          <span style="font-size: 12px; color: #475569; font-weight: 600;">إدارة الموارد البشرية والشؤون الإدارية والمالية</span>
        </div>
        <div style="text-align: center;">
          <div style="background: #f0fdf4; border: 2px solid #0f766e; padding: 4px 16px; border-radius: 8px;">
            <h3 style="margin: 0; color: #0f766e; font-size: 15px; font-weight: 800;">نموذج إخلاء طرف ومخالصة مالية نهائية</h3>
          </div>
          <span style="font-size: 11px; color: #64748b; margin-top: 4px; display: block;">رقم المستند: <strong>${serialNo}</strong></span>
        </div>
        <div style="text-align: left; font-size: 11.5px; color: #475569;">
          <div>تاريخ الإصدار: <strong>${issueDate}</strong></div>
          <div>المدير العام: <strong>${gmName}</strong></div>
        </div>
      </div>

      <!-- Employee Profile Box -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
        <div style="font-weight: 800; color: #0f766e; font-size: 13px; margin-bottom: 6px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px;">
          👤 أولاً: بيانات الموظف والسجل الوظيفي والتعاقدي
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
          <div>اسم الموظف: <strong style="color: #0f172a;">${emp.name}</strong></div>
          <div>كود الموظف: <strong>${emp.code || '—'}</strong></div>
          <div>الرقم القومي: <strong>${settlement?.nationalId || emp.nationalId || emp.national_id || '—'}</strong></div>
          <div>المسمى الوظيفي: <strong>${emp.jobTitle || '—'}</strong></div>
          <div>القسم التابع له: <strong>${emp.department || 'الصيدلية'}</strong></div>
          <div>رقم الهاتف: <strong>${emp.phone || '—'}</strong></div>
          <div>الفرع / الفروع: <strong>${branchNames}</strong></div>
          <div>تاريخ التعيين: <strong>${settlement?.hireDate || emp.hireDate || '—'}</strong></div>
          <div>تاريخ إنهاء الخدمة: <strong style="color: #991b1b;">${terminationDate}</strong></div>
          <div>إجمالي الورديات التاريخية: <strong>${totalShiftsCount} وردية</strong></div>
          <div style="grid-column: span 2;">سبب إنهاء الخدمة: <strong style="color: #991b1b;">${effectiveReason || 'استقالة معتمدة'}</strong></div>
        </div>
      </div>

      <!-- Financial Calculation Tables -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
        <!-- Earnings -->
        <table style="font-size: 11.5px;">
          <thead>
            <tr style="background: #f0fdf4; color: #166534;">
              <th colspan="2" style="text-align: center; padding: 5px; font-weight: 800;">➕ ثانياً: المستحقات المالية المكتسبة</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>أجر الساعات الأساسية (${settlement?.totalRegularHours || 0} س)</td>
              <td style="font-weight: bold; text-align: center; width: 35%;">${fmt(settlement?.totalBaseEarnings || 0)} ج.م</td>
            </tr>
            <tr>
              <td>أجر الوقت الإضافي المعتمد (${settlement?.totalApprovedOvertimeHours || 0} س)</td>
              <td style="font-weight: bold; text-align: center;">+${fmt(settlement?.totalOvertimeEarnings || 0)} ج.م</td>
            </tr>
            <tr>
              <td>إجمالي البدلات الثابتة</td>
              <td style="font-weight: bold; text-align: center;">+${fmt(settlement?.totalAllowances || 0)} ج.م</td>
            </tr>
            <tr>
              <td>المكافآت والحوافز المعتمدة</td>
              <td style="font-weight: bold; text-align: center;">+${fmt(settlement?.totalBonus || 0)} ج.م</td>
            </tr>
            <tr style="background: #dcfce7; font-weight: 800;">
              <td>إجمالي الاستحقاقات المكتسبة</td>
              <td style="color: #166534; text-align: center;">${fmt(settlement?.totalEarnings || 0)} ج.م</td>
            </tr>
          </tbody>
        </table>

        <!-- Deductions -->
        <table style="font-size: 11.5px;">
          <thead>
            <tr style="background: #fef2f2; color: #991b1b;">
              <th colspan="2" style="text-align: center; padding: 5px; font-weight: 800;">➖ ثالثاً: الاستقطاعات والالتزامات والديون</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>كامل رصيد السلف والأدوية المتبقي</td>
              <td style="font-weight: bold; text-align: center; color: #b91c1c; width: 35%;">-${fmt(settlement?.totalRemainingLoansDebt || 0)} ج.م</td>
            </tr>
            <tr>
              <td>خصومات التأخير اللائحي (${settlement?.lateDeductionMinutes || 0} دقيقة)</td>
              <td style="font-weight: bold; text-align: center;">-${fmt(settlement?.lateDeduction || 0)} ج.م</td>
            </tr>
            <tr>
              <td>الجزاءات والخصومات الإدارية</td>
              <td style="font-weight: bold; text-align: center;">-${fmt(settlement?.manualDeduction || 0)} ج.م</td>
            </tr>
            <tr style="background: #fee2e2; font-weight: 800;">
              <td>إجمالي الاستقطاعات والديون</td>
              <td style="color: #991b1b; text-align: center;">-${fmt(settlement?.totalDeductions || 0)} ج.م</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Outstanding Loans Table if exists -->
      ${(settlement?.activeLoans && settlement.activeLoans.length > 0) ? `
        <div style="margin-bottom: 10px; background: #fff; border: 1px solid #fca5a5; border-radius: 6px; padding: 6px 10px;">
          <span style="font-size: 11px; font-weight: bold; color: #991b1b; display: block; margin-bottom: 4px;">
            💳 بيان تفصيلي بمديونيات السلف ومشتريات الأدوية التي تمت تصفيتها بالكامل:
          </span>
          <table style="font-size: 10.5px; text-align: center;">
            <thead>
              <tr style="background: #fee2e2; color: #991b1b;">
                <th style="padding: 3px;">البيان</th>
                <th style="padding: 3px;">التاريخ</th>
                <th style="padding: 3px;">أصل المبلغ</th>
                <th style="padding: 3px;">المسدد مسبقاً</th>
                <th style="padding: 3px;">المتبقي المخصوم بالتصفية</th>
              </tr>
            </thead>
            <tbody>
              ${settlement.activeLoans.map(l => `
                <tr>
                  <td style="padding: 3px;">${l.type}</td>
                  <td style="padding: 3px;">${l.date}</td>
                  <td style="padding: 3px;">${fmt(l.originalAmount)} ج.م</td>
                  <td style="padding: 3px; color: #16a34a;">${fmt(l.paidAmount)} ج.م</td>
                  <td style="padding: 3px; font-weight: bold; color: #b91c1c;">${fmt(l.remainingBalance)} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Net Settlement Box -->
      <div style="background: #f8fafc; border: 2px solid ${settlement?.isPayableToEmployee !== false ? '#059669' : '#dc2626'}; border-radius: 8px; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div>
          <span style="font-size: 12px; color: #475569; font-weight: bold;">رابعاً: النتيجة المالية الصافية للتصفية والمخالصة النهائية:</span>
          <div style="font-size: 13.5px; font-weight: 800; color: ${settlement?.isPayableToEmployee !== false ? '#15803d' : '#b91c1c'}; margin-top: 2px;">
            ${settlement?.settlementStatusLabel || 'صافي المستحقات'}
          </div>
        </div>
        <div style="font-size: 20px; font-weight: 900; color: ${settlement?.isPayableToEmployee !== false ? '#15803d' : '#b91c1c'}; font-family: 'Cairo';">
          ${fmt(Math.abs(settlement?.netSettlement || 0))} ج.م
        </div>
      </div>

      <!-- Administrative Clearance Checklist & Notes -->
      <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; font-size: 11.5px;">
        <div style="font-weight: 800; color: #0f766e; margin-bottom: 4px;">
          📋 خامساً: إخلاء العهد والتسليمات الإدارية:
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 6px;">
          <div>☑️ تسليم العهد والأجهزة</div>
          <div>☑️ تسليم المفاتيح والبطاقات</div>
          <div>☑️ إخلاء حسابات النظام والبريد</div>
          <div>☑️ تسليم المهام والملفات</div>
        </div>
        ${clearanceNotes ? `
          <div style="border-top: 1px dashed #cbd5e1; padding-top: 4px; color: #334155;">
            <strong>ملاحظات الإخلاء الإداري والتسليمات:</strong> ${clearanceNotes}
          </div>
        ` : ''}
      </div>

      <!-- Legal Declaration -->
      <div style="font-size: 11px; line-height: 1.5; color: #1e293b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; margin-bottom: 16px;">
        <strong>إقرار المخالصة وإبراء الذمة:</strong> أقر أنا الموظف الموقع أدناه بأنني قد راجعت واستلمت كافة مستحقاتي المالية عن فترة عملي بالصيدلية/الشركة حتى تاريخ هذا المستند، وسددت كافة التزاماتي وسلفياتي، وأبرأت ذمة الإدارة إبراءً شاملاً ومانعاً لأي مطالبة حالية أو مستقبلية، وتم إخلاء طرفي بالكامل.
      </div>

      <!-- Signatures -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; text-align: center; font-size: 12px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 25px;">توقيع الموظف (المقر بما فيه)</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 11px;">الاسم: ${emp.name}</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 25px;">توقيع الإدارة المالية والمحاسب</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 11px;">الختم والتوقيع المالي</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 25px;">اعتماد الموارد البشرية والمدير العام</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 3px; font-size: 11px;">${gmName}</div>
        </div>
      </div>
    </div>
  `;
}
