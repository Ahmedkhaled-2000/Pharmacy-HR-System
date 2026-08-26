import { fmt, arabicWeekday, AR_MONTHS } from './formatters';
import { getEffectiveShiftHours, isApprovedPermissionForDate } from './latePenaltyEngine';
import { getCycleDateRange } from './periodEngine';

/**
 * printHelper.js
 * مُحرك طباعة احترافي معزول ومستقل بنسبة 100% يمنع تماماً أي ظهور لصفحات بيضاء أو مشاكل في الـ CSS
 */

export function triggerDirectPrint(htmlContent, documentTitle = 'طباعة كشف المرتب') {
  const fullDocumentHTML = `
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
          margin: 6mm 8mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          margin: 0;
          padding: 8px 12px;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: 'Cairo', 'Tajawal', sans-serif;
          direction: rtl;
          font-size: 11px;
          line-height: 1.4;
          width: 100%;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          page-break-inside: avoid;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 3px 5px;
        }
        .header-box {
          border-bottom: 3px double #0f766e;
          padding-bottom: 8px;
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 6px;
          font-weight: bold;
          font-size: 11px;
        }
        .no-print {
          display: none !important;
        }
        @media print {
          body {
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <script>
        window.onload = function() {
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function() {
              setTimeout(function() {
                try {
                  window.focus();
                  window.print();
                } catch(e) {
                  console.error(e);
                }
              }, 200);
            });
          } else {
            setTimeout(function() {
              try {
                window.focus();
                window.print();
              } catch(e) {
                console.error(e);
              }
            }, 300);
          }
        };
      </script>
    </body>
    </html>
  `;

  // 1. Try opening a clean popup window first (most reliable on desktop browsers & prevents any clipping)
  try {
    const printWin = window.open('', '_blank', 'width=950,height=800,top=40,left=40,menubar=no,toolbar=no,location=no,status=no');
    if (printWin && !printWin.closed) {
      printWin.document.open();
      printWin.document.write(fullDocumentHTML);
      printWin.document.close();
      printWin.focus();
      return;
    }
  } catch (e) {
    console.warn('Popup print blocked, falling back to off-screen iframe:', e);
  }

  // 2. Fallback: Full-size offscreen iframe with standard A4 viewport dimensions
  const existingIframe = document.getElementById('isolated-print-frame');
  if (existingIframe) {
    existingIframe.remove();
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'isolated-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.top = '-10000px';
  iframe.style.left = '-10000px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(fullDocumentHTML);
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
        <div style="font-weight: 800; color: #0f766e; font-size: 13px; margin-bottom: 6px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span>👤 أولاً: بيانات الموظف والسجل الوظيفي والتعاقدي</span>
          <span style="font-size: 11px; color: #0f766e; background: #e6fffa; border: 1px solid #99f6e4; padding: 2px 8px; borderRadius: 6px;">
            📅 فترة التصفية: <strong>${settlement?.payrollCycle?.startDate || '—'}</strong> إلى <strong>${settlement?.payrollCycle?.endDate || terminationDate}</strong>
          </span>
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
              <th colspan="2" style="text-align: center; padding: 5px; font-weight: 800;">➕ ثانياً: المستحقات المالية المكتسبة (عن دورة التصفية)</th>
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

      <!-- Detailed Punches & Shifts Table -->
      <div style="margin-bottom: 10px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
        <div style="font-weight: 800; color: #0f766e; font-size: 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>⏱️ رابعاً: سجل البصمات والحضور والانصراف لدورة التصفية (${settlement?.cycleShiftsDetails?.length || 0} وردية):</span>
          <span style="font-size: 10.5px; color: #64748b; font-weight: 600;">
            فترة الاحتساب: من ${settlement?.payrollCycle?.startDate || '—'} إلى ${settlement?.payrollCycle?.endDate || terminationDate}
          </span>
        </div>
        ${(settlement?.cycleShiftsDetails && settlement.cycleShiftsDetails.length > 0) ? `
          <table style="font-size: 10.5px; text-align: center; width: 100%;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; font-weight: 800;">
                <th style="padding: 4px; width: 5%;">#</th>
                <th style="padding: 4px; width: 22%;">اليوم والتاريخ</th>
                <th style="padding: 4px; width: 20%;">الفرع</th>
                <th style="padding: 4px; width: 11%;">حضور</th>
                <th style="padding: 4px; width: 11%;">انصراف</th>
                <th style="padding: 4px; width: 11%;">الساعات</th>
                <th style="padding: 4px; width: 10%;">إضافي</th>
                <th style="padding: 4px; width: 10%;">تأخير</th>
              </tr>
            </thead>
            <tbody>
              ${settlement.cycleShiftsDetails.map((sh, idx) => `
                <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 3px;">${idx + 1}</td>
                  <td style="padding: 3px; font-weight: bold;">${sh.dayName} ${sh.date}</td>
                  <td style="padding: 3px;">${sh.branchName}</td>
                  <td style="padding: 3px; color: #0f766e; font-weight: bold;">${sh.checkIn}</td>
                  <td style="padding: 3px; color: #0f766e; font-weight: bold;">${sh.checkOut}</td>
                  <td style="padding: 3px; font-weight: bold;">${sh.regularHours} س</td>
                  <td style="padding: 3px; color: ${sh.overtimeHours > 0 ? '#16a34a' : '#64748b'};">${sh.overtimeHours > 0 ? `+${sh.overtimeHours} س` : '—'}</td>
                  <td style="padding: 3px; color: ${sh.delayMinutes > 0 ? '#dc2626' : '#64748b'};">${sh.delayMinutes > 0 ? `${sh.delayMinutes} د` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="background: #e2e8f0; font-weight: 800; font-size: 11px;">
                <td colspan="5" style="text-align: right; padding: 4px 8px;">إجمالي ساعات وحضور دورة التصفية:</td>
                <td style="padding: 4px; color: #0f766e;">${settlement?.totalRegularHours || 0} س</td>
                <td style="padding: 4px; color: #16a34a;">+${settlement?.totalApprovedOvertimeHours || 0} س</td>
                <td style="padding: 4px; color: #dc2626;">${settlement?.lateDeductionMinutes || 0} د</td>
              </tr>
            </tfoot>
          </table>
        ` : `
          <div style="text-align: center; color: #64748b; padding: 8px; font-size: 11px; background: #f8fafc; border-radius: 6px;">
            لا توجد بصمات أو ورديات مسجلة للموظف خلال فترة هذه الدورة المالية.
          </div>
        `}
      </div>

      <!-- Net Settlement Box -->
      <div style="background: #f8fafc; border: 2px solid ${settlement?.isPayableToEmployee !== false ? '#059669' : '#dc2626'}; border-radius: 8px; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <div>
          <span style="font-size: 12px; color: #475569; font-weight: bold;">خامساً: النتيجة المالية الصافية للتصفية والمخالصة النهائية:</span>
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
          📋 سادساً: إخلاء العهد والتسليمات الإدارية:
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

/**
 * دالة لتوليد HTML احترافي لكشف المرتب والبصمات الرسمي المتوافق مع معايير A4
 */
export function generateOfficialPayslipHTML({
  emp,
  month,
  shifts = [],
  adjustments = [],
  branches = [],
  orgSettings = {},
  summary = {},
  startCutoff = '',
  endCutoff = '',
  fullMonthLabel = '',
  selectedBranchId = null,
  state = {},
  printFitMode = 'single_page'
}) {
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

  const isMultiBranch = emp?.branchesDetails && emp.branchesDetails.length > 1;
  const assignedBranches = (emp?.branchesDetails && emp.branchesDetails.length > 0)
    ? emp.branchesDetails
    : (emp?.branchId ? [{ branchId: emp.branchId, salary: emp.salary, workHoursPerDay: emp.workHoursPerDay, workDaysPerMonth: emp.workDaysPerMonth }] : []);
  const showPerBranchBreakdown = isMultiBranch && !selectedBranchId;

  const targetBranchDetails = selectedBranchId
    ? emp.branchesDetails?.find((b) => String(b.branchId) === String(selectedBranchId))
    : (emp.branchesDetails?.[0] || null);

  const baseSalary = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(emp?.salary) || 0);
  const workHoursPerDay = targetBranchDetails ? (parseFloat(targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(emp?.workHoursPerDay) || 8);
  const workDaysPerMonth = targetBranchDetails ? (parseFloat(targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(emp?.workDaysPerMonth) || 26);

  const getBranchName = (bId) => {
    if (!bId || bId === 'undefined' || bId === 'null') return emp?.branchName || 'الفرع الرئيسي';
    const b = (branches || orgSettings.branches || state?.branches || []).find((br) => String(br.id) === String(bId));
    return b ? b.name : (String(bId) === String(emp?.branchId) ? (emp?.branchName || 'الفرع الرئيسي') : `فرع ${bId}`);
  };

  const branchNames = selectedBranchId
    ? getBranchName(selectedBranchId)
    : (isMultiBranch
      ? emp.branchesDetails.map(bd => getBranchName(bd.branchId)).join(' + ')
      : (emp?.branchName || 'المركز الرئيسي'));

  const totalHours = summary.hours || 0;
  const totalBreakHours = Math.round((shifts || []).reduce((acc, s) => acc + (parseFloat(s.breakHours) || 0), 0) * 100) / 100;
  const hourlyRate = summary.rate || (parseFloat(baseSalary) || 0);
  const dailyRate = summary.dailyRate || (hourlyRate * workHoursPerDay);
  const baseEarnings = summary.baseEarnings || 0;
  const totalBonus = summary.totalBonus || 0;
  const totalDeduction = summary.totalDeduction || 0;
  const netSalary = summary.netSalary || 0;

  const mgmtAllowance = summary.managementAllowance !== undefined ? summary.managementAllowance : (parseFloat(emp?.managementAllowance) || 0);
  const transAllowance = summary.transportAllowance !== undefined ? summary.transportAllowance : (parseFloat(emp?.transportAllowance) || 0);
  const extAllowance = summary.extraAllowance !== undefined ? summary.extraAllowance : (parseFloat(emp?.extraAllowance) || 0);
  const extTitle = summary.extraAllowanceTitle || emp?.extraAllowanceTitle || 'أجر إضافي';
  const totalAllowances = summary.totalAllowances !== undefined ? summary.totalAllowances : (mgmtAllowance + transAllowance + extAllowance);

  // 1. Allowances breakdown
  const allowanceItems = [];
  if (mgmtAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_mgmt',
      date: `${month} (شهري)`,
      typeLabel: '👔 بدل إدارة شهري',
      amount: mgmtAllowance,
      isPositive: true,
      details: `بدل إدارة معتمد لشغل وظيفة (${emp?.jobTitle || 'موظف'})`,
      color: '#15803d'
    });
  }
  if (transAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_trans',
      date: `${month} (شهري)`,
      typeLabel: '🚗 بدل مواصلات شهري',
      amount: transAllowance,
      isPositive: true,
      details: 'بدل انتقال ومواصلات شهري ثابت',
      color: '#15803d'
    });
  }
  const extraAllowancesList = summary.extraAllowances || emp?.extraAllowances || [];
  if (Array.isArray(extraAllowancesList) && extraAllowancesList.length > 0) {
    extraAllowancesList.forEach((ea, idx) => {
      if ((parseFloat(ea.amount) || 0) > 0) {
        allowanceItems.push({
          id: `allowance_extra_${ea.id || idx}`,
          date: `${month} (شهري)`,
          typeLabel: `🏷️ ${ea.title || 'أجر إضافي'}`,
          amount: parseFloat(ea.amount) || 0,
          isPositive: true,
          details: 'أجر وبدل إضافي مخصص من قبل الإدارة',
          color: '#15803d'
        });
      }
    });
  } else if (extAllowance > 0) {
    allowanceItems.push({
      id: 'allowance_extra',
      date: `${month} (شهري)`,
      typeLabel: `🏷️ ${extTitle}`,
      amount: extAllowance,
      isPositive: true,
      details: 'أجر وبدل إضافي مخصص من قبل الإدارة',
      color: '#15803d'
    });
  }

  // 2. Adjustments (Bonuses and Penalties)
  const manualItems = (adjustments || [])
    .filter((a) => !String(a.id).startsWith('adj_loan_') && !String(a.description || a.notes || a.reason || '').includes('خصم سلفة'))
    .map((a) => ({
      id: a.id,
      date: a.date || month,
      typeLabel: a.type === 'bonus' ? '➕ مكافأة / حافز تميز' : '➖ خصم / جزاء إداري',
      amount: parseFloat(a.amount) || 0,
      isPositive: a.type === 'bonus',
      details: a.reason || a.details || a.description || '—',
      color: a.type === 'bonus' ? '#16a34a' : '#dc2626'
    }));

  // 3. Late Incidents (التأخيرات)
  const empLateIncidents = (state?.lateIncidents || []).filter(
    (inc) =>
      String(inc.employeeId) === String(emp?.id) &&
      inc.status !== 'cancelled' &&
      inc.status !== 'approved_permission_exempt' &&
      inc.actionType !== 'grace' &&
      (inc.deductionMinutes > 0 || inc.penaltyAmount > 0) &&
      (!selectedBranchId || String(inc.branchId) === String(selectedBranchId)) &&
      (inc.date >= startCutoff && inc.date <= endCutoff)
  );

  const latePenaltyItems = empLateIncidents.map((inc) => {
    const penaltyVal = (parseFloat(inc.penaltyAmount) || 0) > 0 ? parseFloat(inc.penaltyAmount) : ((parseFloat(inc.deductionMinutes) || 0) * (dailyRate / (workHoursPerDay * 60)));
    return {
      id: inc.id,
      date: inc.date,
      scheduledStartTime: inc.scheduledStartTime || '—',
      actualPunchInTime: inc.actualPunchInTime || '—',
      lateMinutes: inc.lateMinutes || 0,
      tierName: inc.tierName || 'فئة عامة',
      occurrenceNumber: inc.occurrenceNumber || 1,
      actionLabel: inc.actionLabel || 'خصم لائحي',
      deductionMinutes: inc.deductionMinutes || 0,
      amount: Math.round(penaltyVal * 100) / 100
    };
  });

  // 4. Loans & Credit Medicine (السلف ومشتريات الأدوية)
  const loanBreakdownMap = new Map();
  (state?.requests || [])
    .filter(
      (r) =>
        String(r.employeeId) === String(emp?.id) &&
        (r.status === 'approved' || r.adminApproved || r.status === 'partial') &&
        (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine') &&
        (r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '')).startsWith(month)
    )
    .forEach((r) => loanBreakdownMap.set(String(r.id), r));

  (state?.loans || [])
    .filter(
      (l) =>
        String(l.employeeId) === String(emp?.id) &&
        l.status !== 'pending' &&
        l.status !== 'pending_admin' &&
        l.status !== 'rejected' &&
        l.status !== 'cancelled' &&
        (l.type === 'loan' || l.type === 'advance' || l.type === 'meds' || l.type === 'credit_medicine') &&
        (l.date || (l.createdAt ? l.createdAt.slice(0, 10) : '')).startsWith(month)
    )
    .forEach((l) => {
      const existing = loanBreakdownMap.get(String(l.id));
      loanBreakdownMap.set(String(l.id), { ...(existing || {}), ...l });
    });

  const empLoans = Array.from(loanBreakdownMap.values()).map((l) => {
    const total = parseFloat(l.amount || l.totalAmount) || 0;
    const paid = parseFloat(l.paidAmount) || 0;
    const rem = Math.max(0, total - paid);
    const monthlyDeduction = parseFloat(l.monthlyDeduction || l.installmentAmount) || Math.min(rem, total);
    const isInstallment = l.loanType === 'installment' || parseInt(l.installmentsCount || l.monthsCount, 10) > 1;

    return {
      id: l.id,
      date: l.date || (l.createdAt ? l.createdAt.slice(0, 10) : month + '-01'),
      typeLabel: (l.type === 'meds' || l.type === 'credit_medicine')
        ? '💊 مشتريات أدوية بالآجل'
        : isInstallment
        ? `💳 قسط سلفة مقسطة (${l.currentInstallmentNumber || 1}/${l.installmentsCount || l.monthsCount || 1})`
        : '💳 سلفة نقدية شهرية',
      totalAmount: total,
      paidAmount: paid,
      deductedThisMonth: monthlyDeduction,
      remainingBalance: Math.max(0, rem - monthlyDeduction),
      notes: l.reason || l.details || l.notes || '—'
    };
  });

  // 5. Absence deductions (الغياب)
  const absenceDaysCount = summary.absenceDaysCount || 0;
  const absenceDeductionTotal = summary.absenceDeduction || 0;
  const absenceItem = absenceDaysCount > 0 ? [{
    id: 'absence_summary',
    date: `${month} (غيابات الشهر)`,
    typeLabel: '🚫 غياب بدون إذن رسمي',
    amount: absenceDeductionTotal,
    isPositive: false,
    details: `خصم عدد (${absenceDaysCount}) يوم غياب بدون إذن عن الورديات بسعر اليوم (${fmt(dailyRate)} ج.م)`,
    color: '#b91c1c'
  }] : [];

  // 6. Leaves (إجازات الشهر المعتمدة - السنوية وغير المدفوعة)
  const allLeaveRequests = [...(state?.leaveRequests || []), ...(state?.requests || [])];
  const empApprovedLeaves = allLeaveRequests.filter(
    (r) =>
      (String(r.employeeId) === String(emp?.id) || (emp.code && String(r.employeeId) === String(emp.code))) &&
      (r.status === 'approved' || r.adminApproved) &&
      (r.type === 'leave' || r.type === 'leave_request' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave' || r.type === 'unpaid_leave') &&
      ((r.startDate && r.startDate <= endCutoff && r.endDate >= startCutoff) || (r.date && r.date >= startCutoff && r.date <= endCutoff) || (r.createdAt && r.createdAt.slice(0, 7) === month))
  );

  const mappedLeaves = empApprovedLeaves.map((l) => {
    const isUnpaid = l.leaveType === 'unpaid' || l.type === 'unpaid_leave' || l.isUnpaid === true;
    const days = parseFloat(l.daysCount || l.days || 1) || 1;
    const deductionAmt = isUnpaid ? Math.round(days * dailyRate * 100) / 100 : 0;

    return {
      id: l.id,
      leaveType: l.leaveType || (isUnpaid ? 'unpaid' : 'annual'),
      leaveTypeLabel: isUnpaid ? '💸 إجازة غير مدفوعة الأجر' : (l.leaveType === 'sick' ? '🤒 إجازة مرضية' : '🌴 إجازة سنوية اعتيادية'),
      startDate: l.startDate || l.date || '—',
      endDate: l.endDate || l.date || '—',
      daysCount: days,
      isUnpaid,
      deductionAmt,
      effectLabel: isUnpaid ? `🔴 مخصوم (-${fmt(deductionAmt)} ج.م)` : '🟢 مدفوعة الأجر (لا خصم)',
      reason: l.reason || l.details || l.notes || '—'
    };
  });

  const unpaidLeavesCount = summary.unpaidLeaveDaysCount || mappedLeaves.filter(l => l.isUnpaid).reduce((acc, l) => acc + l.daysCount, 0);
  const unpaidLeaveDeductionTotal = summary.unpaidLeaveDeduction !== undefined ? summary.unpaidLeaveDeduction : Math.round(unpaidLeavesCount * dailyRate * 100) / 100;

  const unpaidLeaveItem = (unpaidLeavesCount > 0 || unpaidLeaveDeductionTotal > 0) ? [{
    id: 'unpaid_leave_summary',
    date: `${month} (إجازة غير مدفوعة)`,
    typeLabel: '💸 إجازة غير مدفوعة الأجر',
    amount: unpaidLeaveDeductionTotal,
    isPositive: false,
    details: `خصم عدد (${unpaidLeavesCount}) يوم إجازة غير مدفوعة الأجر بسعر اليوم (${fmt(dailyRate)} ج.م)`,
    color: '#dc2626'
  }] : [];

  const generalFinancialItems = [...allowanceItems, ...manualItems, ...absenceItem, ...unpaidLeaveItem];
  const isCompact = printFitMode === 'single_page';

  return `
    <div style="width: 100%; max-width: 800px; margin: 0 auto; background: #fff; font-family: 'Cairo', 'Tajawal', sans-serif; line-height: 1.4; color: #0f172a; font-size: ${isCompact ? '10.5px' : '11.5px'};">
      
      <!-- Header -->
      <div style="border-bottom: 2.5px double #0f766e; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div style="text-align: right;">
          <h2 style="margin: 0; color: #0f766e; font-size: 17px; font-weight: 800;">🏥 ${orgName}</h2>
          <span style="font-size: 11px; color: #475569; font-weight: 600;">${gmName}</span>
        </div>
        <div style="text-align: center;">
          <div style="background: #f0fdf4; border: 2px solid #0f766e; padding: 3px 14px; border-radius: 6px;">
            <h3 style="margin: 0; color: #0f766e; font-size: 13.5px; font-weight: 800;">كشف مرتب وبصمات شهر ${fullMonthLabel}</h3>
          </div>
          <span style="font-size: 10px; color: #0f766e; font-weight: bold; margin-top: 2px; display: block;">
            الفترة: من ${startCutoff} إلى ${endCutoff}
          </span>
        </div>
        <div style="text-align: left; font-size: 10px; color: #475569;">
          <div>تاريخ الطباعة: <strong>${printDate}</strong></div>
          <div>كود الموظف: <strong>${emp?.code || '—'}</strong></div>
        </div>
      </div>

      <!-- Employee Info Box -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 10.5px;">
          <div>اسم الموظف: <strong style="color: #0f766e; font-size: 11.5px;">${emp?.name}</strong></div>
          <div>المسمى الوظيفي: <strong>${emp?.jobTitle || '—'}</strong></div>
          <div>الفرع / الفروع: <strong>${branchNames}</strong></div>
          <div>رقم الهاتف: <strong>${emp?.phone || '—'}</strong></div>
        </div>
      </div>

      <!-- Calculation & Earnings Section (Single Branch or Multi-Branch Breakdown) -->
      ${showPerBranchBreakdown ? `
        <!-- Multi-Branch Full Breakdown -->
        <div style="margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid;">
          <div style="background: #0f766e; color: #fff; padding: 4px 10px; border-radius: 6px 6px 0 0; font-weight: 800; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
            <span>🏢 تفاصيل احتساب الأجر وسعر الساعة وساعات العمل لكل فرع على حدة (${assignedBranches.length} فروع):</span>
            <span style="font-size: 9.5px; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 4px;">موظف متعدد الفروع</span>
          </div>
          
          <div style="border: 1.5px solid #0f766e; border-top: none; padding: 6px; background: #f8fafc; display: grid; grid-template-columns: repeat(${assignedBranches.length > 2 ? '3' : '2'}, 1fr); gap: 6px;">
            ${assignedBranches.map((bd, idx) => {
              const bId = bd.branchId;
              const bName = getBranchName(bId);
              const bSum = summary.perBranch?.[bId] || {};
              const bSalary = parseFloat(bd.salary) || (parseFloat(emp?.salary) || 0);
              const bWorkHours = parseFloat(bd.workHours || bd.workHoursPerDay) || (parseFloat(emp?.workHoursPerDay) || 8);
              const bWorkDays = parseFloat(bd.workDays || bd.workDaysPerMonth) || (parseFloat(emp?.workDaysPerMonth) || 26);
              const bDailyRate = bSum.dailyRate || (bWorkDays > 0 ? (bSalary * bWorkHours) / bWorkDays : 0);
              const bHourlyRate = bSum.rate || bSum.hourlyRate || (bWorkHours > 0 ? bDailyRate / bWorkHours : bSalary);
              const bHours = bSum.hours || 0;
              const bBaseEarn = bSum.baseEarnings || (bHours * bHourlyRate);
              const bOtHours = bSum.approvedOvertimeHours || 0;
              const bOtEarn = bSum.overtimeEarnings || 0;

              return `
                <div style="border: 1.5px solid #bbf7d0; border-radius: 6px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                  <div style="background: #f0fdf4; padding: 4px 8px; color: #047857; font-weight: 800; font-size: 10.5px; border-bottom: 1.5px solid #bbf7d0; display: flex; justify-content: space-between; align-items: center;">
                    <span>📍 ${bName}</span>
                    <span style="font-size: 9px; background: #dcfce7; padding: 1px 5px; border-radius: 4px; color: #166534;">فرع #${idx + 1}</span>
                  </div>
                  <div style="padding: 5px 8px; display: flex; flex-direction: column; gap: 3px; font-size: 9.5px;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px;">
                      <span>1. سعر الساعة (الإدارة):</span>
                      <strong style="direction: ltr;">${fmt(bSalary)} ج.م</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px;">
                      <span>2. ساعات اليوم / أيام الشهر:</span>
                      <strong>${bWorkHours} س · ${bWorkDays} يوم</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px;">
                      <span>3. سعر اليوم:</span>
                      <strong style="color: #047857;">${fmt(bDailyRate)} ج.م/يوم</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px; color: #047857; font-weight: bold;">
                      <span>✅ 4. سعر الساعة المعتمد:</span>
                      <span>${fmt(bHourlyRate)} ج.م/س</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px; color: #1e293b;">
                      <span>5. الساعات المسجلة بالفرع:</span>
                      <strong style="font-size: 10px;">${fmt(bHours)} ساعة</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: #047857; font-weight: 800; font-size: 10px; ${bOtHours > 0 ? 'border-bottom: 1px dotted #cbd5e1; padding-bottom: 2px;' : ''}">
                      <span>6. المستحقات بالفرع:</span>
                      <span>${fmt(bBaseEarn)} ج.م</span>
                    </div>
                    ${bOtHours > 0 ? `
                      <div style="display: flex; justify-content: space-between; color: #166534; font-weight: 800; font-size: 9.5px;">
                        <span>⭐ إضافي الفرع (${fmt(bOtHours)} س):</span>
                        <span>+${fmt(bOtEarn)} ج.م</span>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Overall Multi-branch Summary Strip -->
          <div style="background: #f0fdf4; border: 1.5px solid #0f766e; border-top: none; padding: 4px 10px; border-radius: 0 0 6px 6px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; font-weight: 800; color: #047857;">
            <span>إجمالي ساعات العمل بكافة الفروع: <strong style="color: #0f172a;">${fmt(totalHours)} ساعة</strong></span>
            <span>إجمالي المستحقات الأساسية: <strong style="color: #0f172a;">${fmt(baseEarnings)} ج.م</strong></span>
            ${summary.approvedOvertimeHours > 0 ? `<span>إجمالي الإضافي: <strong>+${fmt(summary.overtimeEarnings)} ج.م</strong></span>` : ''}
          </div>
        </div>
      ` : `
        <!-- Single Branch Standard Calculation Boxes -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; direction: rtl;">
          <!-- Right Box: احتساب سعر الساعة وأجر اليوم -->
          <div style="border: 1.5px solid #bbf7d0; border-radius: 8px; overflow: hidden; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            <div style="background: #f0fdf4; padding: 6px 12px; color: #047857; font-weight: 800; font-size: 11.5px; border-bottom: 1.5px solid #bbf7d0; display: flex; align-items: center; gap: 6px; font-family: 'Cairo', sans-serif;">
              <span>⚙️</span>
              <span>احتساب سعر الساعة وأجر اليوم وفق المعادلة المعتمدة</span>
            </div>
            <div style="padding: 8px 12px; display: flex; flex-direction: column; gap: 5px; font-size: 10.5px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #cbd5e1; padding-bottom: 4px;">
                <span style="color: #334155;">1. سعر الساعة الشهري (المدخل من الإدارة)</span>
                <strong style="color: #0f172a; direction: ltr;">${fmt(baseSalary)} ج.م</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #cbd5e1; padding-bottom: 4px;">
                <span style="color: #334155;">2. ساعات العمل اليومية المدخلة</span>
                <strong style="color: #0f172a;">${workHoursPerDay} س / يوم</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #cbd5e1; padding-bottom: 4px;">
                <span style="color: #334155;">3. أيام العمل الشهرية المدخلة</span>
                <strong style="color: #0f172a;">${workDaysPerMonth} يوم / شهر</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #cbd5e1; padding-bottom: 4px;">
                <span style="color: #334155;">4. سعر اليوم = (${fmt(baseSalary)} × ${workHoursPerDay}) ÷ ${workDaysPerMonth}</span>
                <strong style="color: #047857;">${fmt(dailyRate)} ج.م / يوم</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; color: #047857; font-weight: 800; font-size: 11px; padding-top: 2px;">
                <span>✅ 5. سعر الساعة اليومي = ${fmt(dailyRate)} ÷ ${workHoursPerDay}</span>
                <span>${fmt(hourlyRate)} ج.م / ساعة</span>
              </div>
            </div>
          </div>

          <!-- Left Box: ساعات العمل وأجر اليوم / المستحقات -->
          <div style="border: 1.5px solid #bbf7d0; border-radius: 8px; overflow: hidden; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            <div style="background: #f0fdf4; padding: 6px 12px; color: #047857; font-weight: 800; font-size: 11.5px; border-bottom: 1.5px solid #bbf7d0; display: flex; align-items: center; gap: 6px; font-family: 'Cairo', sans-serif;">
              <span>⏱️</span>
              <span>ساعات العمل وأجر اليوم / المستحقات</span>
            </div>
            <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; font-size: 10.5px; flex: 1; justify-content: center;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dotted #cbd5e1; padding-bottom: 6px;">
                <span style="color: #334155; font-weight: 600;">عدد ساعات العمل الأساسية المسجلة</span>
                <strong style="color: #0f172a; font-size: 11px;">${fmt(totalHours)} ساعة</strong>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; color: #047857; font-weight: 800; font-size: 11px; ${summary.approvedOvertimeHours > 0 ? 'border-bottom: 1px dotted #cbd5e1; padding-bottom: 6px;' : ''}">
                <span>المستحقات الأساسية (${fmt(totalHours)} س × ${fmt(hourlyRate)} ج.م)</span>
                <span style="font-size: 11.5px;">${fmt(baseEarnings)} ج.م</span>
              </div>
              ${summary.approvedOvertimeHours > 0 ? `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #166534; font-weight: 800; font-size: 11px;">
                  <span>⭐ أجر الوقت الإضافي (${fmt(summary.approvedOvertimeHours)} س × ${fmt(hourlyRate)} ج.م)</span>
                  <span>+${fmt(summary.overtimeEarnings)} ج.م</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `}

      <!-- Punches & Shifts Section (Separate Table for Each Branch if Multi-Branch) -->
      ${(showPerBranchBreakdown) ? `
        <!-- Separate Punch Table for Each Branch Individually -->
        <div style="margin-bottom: 8px;">
          <div style="font-weight: 800; color: #0f766e; font-size: 11px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>📋 أولاً: سجلات وبصمات الحضور مفصلة لكل فرع على حدة (${(shifts || []).length} وردية):</span>
            <span style="font-size: 9.5px; color: #0f766e; font-weight: bold;">إجمالي كافة الفروع: ${fmt(totalHours)} س | ${fmt(baseEarnings)} ج.م</span>
          </div>

          ${(() => {
            const branchMap = {};
            (assignedBranches || []).forEach(bd => {
              branchMap[String(bd.branchId)] = [];
            });
            (shifts || []).forEach(s => {
              const bKey = String(s.branchId || emp?.branchId || assignedBranches[0]?.branchId || 'default');
              if (!branchMap[bKey]) branchMap[bKey] = [];
              branchMap[bKey].push(s);
            });

            return Object.entries(branchMap).map(([bId, bShifts]) => {
              if (!bShifts || bShifts.length === 0) return '';
              const bName = getBranchName(bId);
              const bSum = summary.perBranch?.[bId] || {};
              const bRate = bSum.rate || bSum.hourlyRate || (hourlyRate || (parseFloat(emp?.salary) || 0));
              const bTotalHours = bShifts.reduce((acc, s) => acc + (parseFloat(s.hours || s.regularHours) || 0), 0);
              const bTotalBreak = bShifts.reduce((acc, s) => acc + (parseFloat(s.breakHours) || 0), 0);
              const bTotalEarn = bShifts.reduce((acc, s) => acc + ((parseFloat(s.hours || s.regularHours) || 0) * bRate), 0);

              return `
                <div style="margin-bottom: 6px; page-break-inside: avoid; break-inside: avoid; border: 1.5px solid #0f766e; border-radius: 6px; overflow: hidden; background: #fff;">
                  <div style="background: #f0fdf4; padding: 4px 8px; border-bottom: 1.5px solid #0f766e; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: #0f766e; font-size: 10.5px;">
                      🏢 جدول بصمات: <strong>${bName}</strong> (${bShifts.length} وردية)
                    </span>
                    <span style="font-size: 9.5px; color: #166534; font-weight: bold;">
                      سعر الساعة بالفرع: ${fmt(bRate)} ج.م/س
                    </span>
                  </div>
                  <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
                    <thead>
                      <tr style="background: #f1f5f9; color: #334155; font-weight: 800;">
                        <th style="padding: 2px; width: 5%;">#</th>
                        <th style="padding: 2px; width: 25%;">اليوم والتاريخ</th>
                        <th style="padding: 2px; width: 15%;">وقت الدخول</th>
                        <th style="padding: 2px; width: 15%;">وقت الخروج</th>
                        <th style="padding: 2px; width: 12%;">البريك</th>
                        <th style="padding: 2px; width: 13%;">ساعات العمل</th>
                        <th style="padding: 2px; width: 15%;">المستحق بالفرع</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${bShifts.map((s, idx) => {
                        const effHours = parseFloat(s.hours || s.regularHours) || 0;
                        const hasPerm = s.hasPermission || false;
                        return `
                          <tr style="background: ${hasPerm ? '#fefce8' : (idx % 2 === 0 ? '#fff' : '#f8fafc')};">
                            <td style="padding: 2px;">${idx + 1}</td>
                            <td style="padding: 2px; font-weight: bold;">${s.dayName || ''} ${s.date}</td>
                            <td style="padding: 2px; color: #16a34a;">${s.timeIn || '—'}</td>
                            <td style="padding: 2px; color: #dc2626;">${s.timeOut || '—'}</td>
                            <td style="padding: 2px;">${fmt(s.breakHours)} س</td>
                            <td style="padding: 2px; font-weight: bold;">${fmt(effHours)} س</td>
                            <td style="padding: 2px; font-weight: bold; color: #0d9488;">${fmt(effHours * bRate)} ج.م</td>
                          </tr>
                        `;
                      }).join('')}
                    </tbody>
                    <tfoot>
                      <tr style="background: #e2e8f0; font-weight: 800; font-size: 9.5px;">
                        <td colspan="4" style="padding: 2px 6px; text-align: right; color: #0f766e;">إجمالي فرع (${bName}):</td>
                        <td style="padding: 2px;">${fmt(bTotalBreak)} س</td>
                        <td style="padding: 2px; color: #0f766e;">${fmt(bTotalHours)} س</td>
                        <td style="padding: 2px; color: #0d9488;">${fmt(bTotalEarn)} ج.م</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              `;
            }).join('');
          })()}

          <!-- Multi-Branch Grand Total Summary Bar -->
          <div style="background: #0f766e; color: #ffffff; padding: 4px 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 10px; margin-top: 4px;">
            <span>📊 إجمالي البصمات وساعات العمل بكافة الفروع (${(shifts || []).length} وردية):</span>
            <span>إجمالي الساعات: ${fmt(totalHours)} س | إجمالي المستحق: ${fmt(baseEarnings)} ج.م</span>
          </div>
        </div>
      ` : `
        <!-- Single Branch Shifts Table -->
        <div style="margin-bottom: 8px;">
          <div style="font-weight: 800; color: #0f766e; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
            <span>📋 أولاً: تفاصيل سجل الحضور والبصمات (${(shifts || []).length} وردية):</span>
            <span style="font-size: 9.5px; color: #64748b;">إجمالي الساعات: ${fmt(totalHours)} س</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; font-weight: 800;">
                <th style="padding: 2.5px; width: 5%;">#</th>
                <th style="padding: 2.5px; width: 25%;">اليوم والتاريخ</th>
                <th style="padding: 2.5px; width: 15%;">وقت الدخول</th>
                <th style="padding: 2.5px; width: 15%;">وقت الخروج</th>
                <th style="padding: 2.5px; width: 12%;">البريك</th>
                <th style="padding: 2.5px; width: 13%;">ساعات العمل</th>
                <th style="padding: 2.5px; width: 15%;">الأجر المستحق</th>
              </tr>
            </thead>
            <tbody>
              ${(shifts && shifts.length > 0) ? shifts.map((s, idx) => {
                const shiftRate = (summary.perBranch?.[s.branchId]?.rate) || hourlyRate;
                const effHours = parseFloat(s.hours || s.regularHours) || 0;
                const hasPerm = s.hasPermission || false;
                return `
                  <tr style="background: ${hasPerm ? '#fefce8' : (idx % 2 === 0 ? '#fff' : '#f8fafc')};">
                    <td style="padding: 2px;">${idx + 1}</td>
                    <td style="padding: 2px; font-weight: bold;">${s.dayName || ''} ${s.date}</td>
                    <td style="padding: 2px; color: #16a34a;">${s.timeIn || '—'}</td>
                    <td style="padding: 2px; color: #dc2626;">${s.timeOut || '—'}</td>
                    <td style="padding: 2px;">${fmt(s.breakHours)} س</td>
                    <td style="padding: 2px; font-weight: bold;">${fmt(effHours)} س</td>
                    <td style="padding: 2px; font-weight: bold; color: #0d9488;">${fmt(effHours * shiftRate)} ج.م</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" style="padding: 6px; color: #94a3b8;">لا توجد بصمات مسجلة للموظف عن هذا الشهر</td>
                </tr>
              `}
            </tbody>
            ${(shifts && shifts.length > 0) ? `
              <tfoot>
                <tr style="background: #e2e8f0; font-weight: 800; font-size: 10px;">
                  <td colspan="4" style="padding: 2.5px 6px; text-align: right;">الإجمالي:</td>
                  <td style="padding: 2.5px;">${fmt(totalBreakHours)} س</td>
                  <td style="padding: 2.5px; color: #0f766e;">${fmt(totalHours)} س</td>
                  <td style="padding: 2.5px; color: #0d9488;">${fmt(baseEarnings)} ج.م</td>
                </tr>
              </tfoot>
            ` : ''}
          </table>
        </div>
      `}

      <!-- Late Penalties Table (If exists) -->
      ${latePenaltyItems.length > 0 ? `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="font-weight: 800; color: #c2410c; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
            <span>⏱️ ثانياً: وقائع وجزاءات التأخير اللائحي (${latePenaltyItems.length} واقعة):</span>
            <span style="font-size: 9.5px; color: #c2410c; font-weight: bold;">إجمالي الخصم: -${fmt(summary.lateDeduction || 0)} ج.م (${summary.lateDeductionMinutes || 0} دقيقة)</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
            <thead>
              <tr style="background: #ffedd5; color: #9a3412; font-weight: 800;">
                <th style="padding: 2.5px;">التاريخ</th>
                <th style="padding: 2.5px;">الشيفت</th>
                <th style="padding: 2.5px;">الحضور</th>
                <th style="padding: 2.5px;">التأخير</th>
                <th style="padding: 2.5px;">الفئة</th>
                <th style="padding: 2.5px;">الجزاء اللائحي</th>
                <th style="padding: 2.5px;">دقائق الخصم</th>
                <th style="padding: 2.5px;">مبلغ الخصم</th>
              </tr>
            </thead>
            <tbody>
              ${latePenaltyItems.map((inc) => `
                <tr>
                  <td style="padding: 2px; border: 1px solid #fed7aa; font-weight: bold;">${inc.date}</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa; color: #2563eb;">${inc.scheduledStartTime}</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa; font-weight: bold;">${inc.actualPunchInTime}</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa; color: #ea580c; font-weight: bold;">${inc.lateMinutes} د</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa;">${inc.tierName} (#${inc.occurrenceNumber})</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa; color: ${inc.deductionMinutes > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">${inc.actionLabel}</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa;">${inc.deductionMinutes > 0 ? `${inc.deductionMinutes} د` : '—'}</td>
                  <td style="padding: 2px; border: 1px solid #fed7aa; font-weight: bold; color: #dc2626;">-${fmt(inc.amount)} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Loans and Credit Meds Table (If exists) -->
      ${empLoans.length > 0 ? `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="font-weight: 800; color: #991b1b; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
            <span>💳 ثالثاً: السلف ومشتريات الأدوية والأقساط (${empLoans.length} بند):</span>
            <span style="font-size: 9.5px; color: #991b1b; font-weight: bold;">إجمالي المخصوم بالشهر: -${fmt(summary.loansDeduction || 0)} ج.م</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
            <thead>
              <tr style="background: #fee2e2; color: #991b1b; font-weight: 800;">
                <th style="padding: 2.5px;">البيان</th>
                <th style="padding: 2.5px;">التاريخ</th>
                <th style="padding: 2.5px;">أصل المبلغ</th>
                <th style="padding: 2.5px;">المسدد سابقاً</th>
                <th style="padding: 2.5px;">المخصوم بهذا الشهر</th>
                <th style="padding: 2.5px;">المتبقي بعد الخصم</th>
              </tr>
            </thead>
            <tbody>
              ${empLoans.map((l) => `
                <tr>
                  <td style="padding: 2px; border: 1px solid #fca5a5; font-weight: bold;">${l.typeLabel}</td>
                  <td style="padding: 2px; border: 1px solid #fca5a5;">${l.date}</td>
                  <td style="padding: 2px; border: 1px solid #fca5a5;">${fmt(l.totalAmount)} ج.م</td>
                  <td style="padding: 2px; border: 1px solid #fca5a5; color: #16a34a;">${fmt(l.paidAmount)} ج.م</td>
                  <td style="padding: 2px; border: 1px solid #fca5a5; font-weight: bold; color: #dc2626;">-${fmt(l.deductedThisMonth)} ج.م</td>
                  <td style="padding: 2px; border: 1px solid #fca5a5; font-weight: bold; color: #b91c1c;">${fmt(l.remainingBalance)} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Leaves Record Table (If exists) -->
      ${mappedLeaves.length > 0 ? `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="font-weight: 800; color: #0284c7; font-size: 11px; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center;">
            <span>🌴 رابعاً: سجل الإجازات المعتمدة بالشهر (${mappedLeaves.length} طلب):</span>
            <span style="font-size: 9.5px; color: #0284c7; font-weight: bold;">
              ${unpaidLeavesCount > 0 ? `إجازات غير مدفوعة: ${unpaidLeavesCount} يوم (خصم -${fmt(unpaidLeaveDeductionTotal)} ج.م)` : 'جميع الإجازات مدفوعة بالكامل'}
            </span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
            <thead>
              <tr style="background: #e0f2fe; color: #0369a1; font-weight: 800;">
                <th style="padding: 2.5px; width: 22%;">نوع الإجازة</th>
                <th style="padding: 2.5px; width: 15%;">من تاريخ</th>
                <th style="padding: 2.5px; width: 15%;">إلى تاريخ</th>
                <th style="padding: 2.5px; width: 12%;">عدد الأيام</th>
                <th style="padding: 2.5px; width: 22%;">الأثر المالي</th>
                <th style="padding: 2.5px; width: 14%;">السبب / البيان</th>
              </tr>
            </thead>
            <tbody>
              ${mappedLeaves.map((l) => `
                <tr style="background: ${l.isUnpaid ? '#fef2f2' : '#f0fdf4'};">
                  <td style="padding: 2px; border: 1px solid #bae6fd; font-weight: bold; color: ${l.isUnpaid ? '#dc2626' : '#15803d'};">${l.leaveTypeLabel}</td>
                  <td style="padding: 2px; border: 1px solid #bae6fd;">${l.startDate}</td>
                  <td style="padding: 2px; border: 1px solid #bae6fd;">${l.endDate}</td>
                  <td style="padding: 2px; border: 1px solid #bae6fd; font-weight: bold;">${l.daysCount} يوم</td>
                  <td style="padding: 2px; border: 1px solid #bae6fd; font-weight: bold; color: ${l.isUnpaid ? '#dc2626' : '#15803d'};">
                    ${l.effectLabel}
                  </td>
                  <td style="padding: 2px; border: 1px solid #bae6fd; font-size: 9px;">${l.reason}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Allowances, Bonuses, & Deductions Table (If exists) -->
      ${generalFinancialItems.length > 0 ? `
        <div style="margin-bottom: 8px; page-break-inside: avoid;">
          <div style="font-weight: 800; color: #0f766e; font-size: 11px; margin-bottom: 3px;">
            📝 خامساً: بيان البدلات الثابتة والمكافآت والجزاءات والغياب والإجازات (${generalFinancialItems.length} بند):
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center;">
            <thead>
              <tr style="background: #f1f5f9; color: #334155; font-weight: 800;">
                <th style="padding: 2.5px; width: 22%;">نوع البند</th>
                <th style="padding: 2.5px; width: 18%;">الفترة / التاريخ</th>
                <th style="padding: 2.5px; width: 18%;">المبلغ</th>
                <th style="padding: 2.5px; width: 42%;">البيان والتفاصيل</th>
              </tr>
            </thead>
            <tbody>
              ${generalFinancialItems.map((item) => `
                <tr>
                  <td style="padding: 2px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.color};">${item.typeLabel}</td>
                  <td style="padding: 2px; border: 1px solid #cbd5e1;">${item.date}</td>
                  <td style="padding: 2px; border: 1px solid #cbd5e1; font-weight: bold; color: ${item.isPositive ? '#16a34a' : '#dc2626'};">
                    ${item.isPositive ? '+' : '-'}${fmt(item.amount)} ج.م
                  </td>
                  <td style="padding: 2px; border: 1px solid #cbd5e1; text-align: right; padding-right: 6px;">${item.details}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Financial Final Summary Box -->
      <div style="background: #0f766e; color: #fff; border-radius: 6px; padding: 6px 12px; margin-bottom: 8px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.25); padding-bottom: 3px; margin-bottom: 3px;">
          <span style="font-size: 11.5px; font-weight: 800;">🏆 الملخص المالي النهائي لشهر ${fullMonthLabel}:</span>
          <span style="font-size: 13.5px; font-weight: 900; background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 4px;">
            صافي المرتب المستحق: ${fmt(netSalary)} ج.م
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; font-size: 10px;">
          <div>الأساسي: <strong>${fmt(baseEarnings)} ج.م</strong></div>
          <div>الإضافي: <strong>+${fmt(summary.overtimeEarnings || 0)} ج.م</strong></div>
          <div>البدلات: <strong>+${fmt(totalAllowances)} ج.م</strong></div>
          <div>المكافآت: <strong>+${fmt(totalBonus)} ج.م</strong></div>
          <div>تأخيرات: <strong>-${fmt(summary.lateDeduction || 0)} ج.م</strong></div>
          <div>غيابات: <strong>-${fmt(summary.absenceDeduction || 0)} ج.م</strong></div>
          <div>سلف وأدوية: <strong>-${fmt(summary.loansDeduction || 0)} ج.م</strong></div>
          <div>إجمالي الخصومات: <strong>-${fmt(totalDeduction)} ج.م</strong></div>
        </div>
      </div>

      <!-- Signatures Block -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; font-size: 10.5px; margin-top: 6px; page-break-inside: avoid;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 18px;">توقيع الموظف المستلم</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 2px; font-size: 10px;">${emp?.name}</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 18px;">توقيع الإدارة المالية</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 2px; font-size: 10px;">المحاسب المالي والختم</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px;">
          <div style="font-weight: 800; color: #0f172a; margin-bottom: 18px;">اعتماد المدير العام</div>
          <div style="border-top: 1px dotted #94a3b8; padding-top: 2px; font-size: 10px;">${gmName}</div>
        </div>
      </div>

    </div>
  `;
}

/**
 * دالة الطباعة المباشرة لكشف مفردات المرتب والبصمات في نافذة منعزلة نظيفة تماماً
 * مطابقة لنظام طباعة عقد العمل الفردي الموحد بنسبة 100%
 */
export function printEmployeePayslipDirect({
  emp,
  month,
  shifts = [],
  adjustments = [],
  branches = [],
  orgSettings = {},
  summary = null,
  computeEmpSummary = null,
  selectedBranchId = null,
  state = {},
  printFitMode = 'single_page'
}) {
  if (!emp) return;

  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const [y, m] = targetMonth.split('-');
  const monthName = AR_MONTHS[parseInt(m, 10) - 1] || m;
  const fullMonthLabel = `${monthName} ${y}`;

  // Cutoff dates calculation via Period Engine
  const cycleRange = getCycleDateRange(targetMonth, orgSettings || state?.orgSettings);
  const startCutoff = cycleRange.startDate;
  const endCutoff = cycleRange.endDate;

  // Filter shifts and adjustments
  const allShifts = shifts.length > 0 ? shifts : (state.shifts || []);
  const empShifts = allShifts.filter((s) =>
    (String(s.employeeId) === String(emp.id) || (emp.code && String(s.employeeId) === String(emp.code))) &&
    s.date >= startCutoff &&
    s.date <= endCutoff &&
    (!selectedBranchId || String(s.branchId) === String(selectedBranchId))
  );

  const allAdjs = adjustments.length > 0 ? adjustments : (state.adjustments || []);
  const empAdjs = allAdjs.filter((a) =>
    (String(a.employeeId) === String(emp.id) || a.employeeId === 'all') &&
    a.date >= startCutoff &&
    a.date <= endCutoff
  );

  // Compute summary if not provided
  let calculatedSummary = summary;
  if (!calculatedSummary && typeof computeEmpSummary === 'function') {
    calculatedSummary = computeEmpSummary(emp.id, null, targetMonth, selectedBranchId);
  } else if (!calculatedSummary && typeof state.computeEmpSummary === 'function') {
    calculatedSummary = state.computeEmpSummary(emp.id, null, targetMonth, selectedBranchId);
  }

  if (!calculatedSummary) {
    calculatedSummary = { hours: 0, dailyRate: 0, rate: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, perBranch: {} };
  }

  const mappedShiftsForPrint = empShifts.map((s) => {
    const effHours = getEffectiveShiftHours(s, state);
    const hasPerm = isApprovedPermissionForDate(emp.id, s.date, state);
    return {
      ...s,
      dayName: arabicWeekday(s.date),
      hours: effHours,
      regularHours: effHours,
      hasPermission: hasPerm
    };
  });

  const html = generateOfficialPayslipHTML({
    emp,
    month: targetMonth,
    shifts: mappedShiftsForPrint,
    adjustments: empAdjs,
    branches: branches.length > 0 ? branches : (state.branches || []),
    orgSettings: Object.keys(orgSettings).length > 0 ? orgSettings : (state.orgSettings || {}),
    summary: calculatedSummary,
    startCutoff,
    endCutoff,
    fullMonthLabel,
    selectedBranchId,
    state,
    printFitMode
  });

  triggerDirectPrint(html, `كشف مرتب - ${emp.name} - ${fullMonthLabel}`);
}



