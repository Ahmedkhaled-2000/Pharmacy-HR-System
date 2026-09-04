import React, { useState, useMemo } from 'react';
import { getResolvedEmployeeRoster } from '../roster/RosterModule';
import { getEmpDisplayName, isEmployeeActive, getRealTodayStr, arabicMonthLabel } from '../../utils/formatters';
import { loadExcelJS, mergedTitle, tableHeaderRow, dataRow } from '../../utils/excelExport';
import { getCycleDateRange } from '../../utils/periodEngine';
import { getJobsList } from '../../utils/jobsHelper';
import { triggerDirectPrint } from '../../utils/printHelper';

const monthLabel = (monthStr) => {
  return { arabic: arabicMonthLabel(monthStr), raw: monthStr };
};

export const DAYS_OF_WEEK = [
  { key: 'saturday', label: 'السبت', short: 'سبت', dayIndex: 6 },
  { key: 'sunday', label: 'الأحد', short: 'أحد', dayIndex: 0 },
  { key: 'monday', label: 'الاثنين', short: 'اثنين', dayIndex: 1 },
  { key: 'tuesday', label: 'الثلاثاء', short: 'ثلاثاء', dayIndex: 2 },
  { key: 'wednesday', label: 'الأربعاء', short: 'أربعاء', dayIndex: 3 },
  { key: 'thursday', label: 'الخميس', short: 'خميس', dayIndex: 4 },
  { key: 'friday', label: 'الجمعة', short: 'جمعة', dayIndex: 5 }
];

/**
 * تحويل الوقت من نظام 24 ساعة إلى نظام 12 ساعة للعرض الشكلي والتصميم فقط
 * مثال: 08:00 -> 08:00 ص | 16:00 -> 04:00 م | 00:00 -> 12:00 ص | 12:00 -> 12:00 م
 */
export function formatTime12H(time24) {
  if (!time24 || typeof time24 !== 'string') return '';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return time24;
  let h = parseInt(parts[0], 10);
  const m = parts[1].padStart(2, '0');
  if (isNaN(h)) return time24;

  const period = h >= 12 ? 'م' : 'ص';
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, '0')}:${m} ${period}`;
}

export function formatShiftRange12H(start24, end24) {
  if (!start24 || !end24) return '';
  return `${formatTime12H(start24)} - ${formatTime12H(end24)}`;
}

/**
 * توليد كود HTML متكامل ومعزول لخريطة الورديات الأسبوعية وتوزيع الكادر
 * جاهز للطباعة المباشرة بصيغة A4 Landscape مع توقيعات الاعتماد الرسمية
 */
function generateOfficialWeeklyShiftsHTML({
  currentBranch,
  selectedMonth,
  cycleRange,
  dayRosterMap,
  branchMetrics,
  staffSchedules = [],
  orgSettings
}) {
  const companyName = orgSettings?.companyName || 'مجموعة صيدليات د. منار الكومي';
  const branchName = currentBranch?.name || 'الفرع';
  const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const printTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // 1. Staff Matrix Rows (Detailed breakdown of each employee's schedule)
  const staffMatrixRowsHTML = (staffSchedules || []).map(({ employee, schedule, isApproved, totalWeeklyHours, workDaysCount }) => {
    const isPharm = (employee?.jobTitle || '').includes('صيدل');
    const dayCells = DAYS_OF_WEEK.map(d => {
      if (!isApproved || !schedule) {
        return `<td style="border:1.5px solid #cbd5e1; padding:6px 4px; text-align:center; color:#94a3b8; font-size:10px;">—</td>`;
      }
      const dayConf = schedule[d.label];
      const isShift = dayConf && dayConf.type === 'shift' && dayConf.start && dayConf.end;
      if (isShift) {
        return `
          <td style="border:1.5px solid #cbd5e1; padding:6px 4px; text-align:center; background:#f0fdf4;">
            <div style="font-weight:800; color:#15803d; font-size:10.5px; white-space:nowrap; direction:rtl;">
              من ${formatTime12H(dayConf.start)} إلى ${formatTime12H(dayConf.end)}
            </div>
          </td>
        `;
      } else {
        return `
          <td style="border:1.5px solid #cbd5e1; padding:6px 4px; text-align:center; background:#fffbeb;">
            <span style="color:#92400e; font-weight:800; font-size:10.5px;">راحة أسبوعية</span>
          </td>
        `;
      }
    }).join('');

    return `
      <tr>
        <td style="border:1.5px solid #cbd5e1; padding:6px 8px; text-align:right;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span style="font-weight:900; color:#0f172a; font-size:12px;">${getEmpDisplayName(employee)}</span>
            ${isPharm ? '<span style="color:#15803d; font-size:9.5px; background:#dcfce7; padding:2px 6px; border-radius:4px; font-weight:800; border:1px solid #86efac;">صيدلي</span>' : ''}
          </div>
          <div style="font-size:10px; color:#475569; font-weight:600; margin-top:2px;">${employee.jobTitle || 'موظف'}</div>
        </td>
        ${dayCells}
        <td style="border:1.5px solid #cbd5e1; padding:6px 4px; text-align:center; font-weight:900; color:#0f766e; font-size:11px; white-space:nowrap; background:#f8fafc;">
          ${totalWeeklyHours} ساعة
          <div style="font-size:9.5px; color:#64748b; font-weight:normal; margin-top:2px;">(${workDaysCount} أيام عمل)</div>
        </td>
      </tr>
    `;
  }).join('');

  // 2. 7-Days Operational Cards Grid
  const daysHTML = DAYS_OF_WEEK.map(day => {
    const dayData = dayRosterMap[day.key] || { shiftGroups: [], offStaff: [], totalWorking: 0, totalOff: 0 };
    const isFriday = day.key === 'friday';

    const shiftGroupsHTML = dayData.shiftGroups.length === 0
      ? `<div class="empty-shift-box">🚫 لا توجد ورديات مجدولة</div>`
      : dayData.shiftGroups.map(group => {
          const isConcurrent = group.staff.length > 1;
          const staffHTML = group.staff.map(st => {
            const isPharm = (st.employee.jobTitle || '').includes('صيدل');
            return `
              <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; padding:5px 7px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:4px; box-shadow:0 1px 2px rgba(0,0,0,0.02); gap:4px;">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; flex:1;">
                  <span style="font-weight:800; color:#0f172a; font-size:11px;">${getEmpDisplayName(st.employee)}</span>
                </div>
                ${isPharm ? `
                  <span style="background:#dcfce7; color:#15803d; font-size:9px; font-weight:800; padding:2px 5px; border-radius:4px; flex-shrink:0; border:1px solid #86efac;">
                    صيدلي
                  </span>
                ` : `
                  <span style="background:#f1f5f9; color:#475569; font-size:9px; font-weight:700; padding:2px 5px; border-radius:4px; flex-shrink:0; border:1px solid #cbd5e1;">
                    ${st.employee.jobTitle || 'كادر'}
                  </span>
                `}
              </div>
            `;
          }).join('');

          return `
            <div style="background:#f8fafc; border:1.5px solid ${isConcurrent ? '#10b981' : '#cbd5e1'}; border-radius:7px; padding:6px 6px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; border-bottom:1px solid #e2e8f0; padding-bottom:3px; gap:4px;">
                <div style="font-weight:900; color:${isConcurrent ? '#047857' : '#0f766e'}; font-size:10.5px; white-space:nowrap; direction:rtl;">
                  ⏰ ${formatTime12H(group.start)} – ${formatTime12H(group.end)}
                </div>
                <div style="font-size:9px; color:#334155; font-weight:800; background:#e2e8f0; padding:1px 5px; border-radius:4px; white-space:nowrap;">
                  ${group.hours} س
                </div>
              </div>
              ${isConcurrent ? `<div style="font-size:8.5px; color:#047857; font-weight:700; margin-bottom:4px;">👥 وردية مشتركة (${group.staff.length} موظفين)</div>` : ''}
              <div>${staffHTML}</div>
            </div>
          `;
        }).join('');

    const offHTML = dayData.offStaff.length > 0 ? `
      <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:5px 6px; margin-top:auto;">
        <div style="font-size:10px; font-weight:900; color:#92400e; margin-bottom:3px; display:flex; justify-content:space-between; align-items:center;">
          <span>🏖️ راحة أسبوعية</span>
          <span style="background:#fef3c7; border:1px solid #fcd34d; border-radius:4px; padding:1px 5px; font-size:9px;">${dayData.offStaff.length}</span>
        </div>
        <div style="font-size:9.5px; color:#78350f; font-weight:700; line-height:1.4;">
          ${dayData.offStaff.map(s => `• ${getEmpDisplayName(s.employee)}`).join('<br>')}
        </div>
      </div>
    ` : '';

    return `
      <div class="day-card">
        <div style="background:${isFriday ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)'}; padding:7px 8px; border-bottom:2px solid #cbd5e1; display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:900; font-size:12.5px; color:${isFriday ? '#92400e' : '#166534'};">
            ${isFriday ? '🕌' : '🗓️'} ${day.label}
          </div>
          <div style="display:flex; gap:3px;">
            <span style="background:#ffffff; color:#166534; font-size:9px; font-weight:800; padding:2px 6px; border-radius:6px; border:1px solid #bbf7d0;">
              🟢 ${dayData.totalWorking}
            </span>
            ${dayData.totalOff > 0 ? `
              <span style="background:#ffffff; color:#b45309; font-size:9px; font-weight:800; padding:2px 6px; border-radius:6px; border:1px solid #fde68a;">
                🏖️ ${dayData.totalOff}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="day-card-body">
          ${shiftGroupsHTML}
          ${offHTML}
        </div>
      </div>
    `;
  }).join('');

  return `
    <style>
      @page {
        size: A4 landscape !important;
        margin: 6mm 8mm !important;
      }
      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Cairo', 'Tajawal', sans-serif !important;
        color: #0f172a !important;
        background: #ffffff !important;
        direction: rtl !important;
        width: 100% !important;
      }
      .print-landscape-wrapper {
        box-sizing: border-box;
        width: 100%;
        max-width: 281mm;
        min-height: 195mm;
        margin: 0 auto;
        padding: 4px 6px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      @media screen {
        body {
          background: #f1f5f9 !important;
          padding: 14px 10px !important;
        }
        .print-landscape-wrapper {
          min-width: 980px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          border-radius: 10px;
          margin-top: 10px;
          margin-bottom: 20px;
          padding: 16px 20px;
        }
      }
      @media print {
        html, body {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        .print-landscape-wrapper {
          width: 100% !important;
          min-width: 100% !important;
          max-width: none !important;
          height: 195mm !important;
          min-height: 195mm !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print { display: none !important; }
      }
      .print-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 6px;
        align-items: stretch;
        margin: 6px 0;
        flex: 1;
        min-height: 190px;
      }
      .day-card {
        border: 1.5px solid #cbd5e1;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        page-break-inside: avoid;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        min-height: 180px;
      }
      .day-card-body {
        padding: 6px 5px;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 5px;
        background: #fafafa;
      }
      .empty-shift-box {
        text-align: center;
        padding: 14px 4px;
        color: #94a3b8;
        font-size: 10px;
        background: #f8fafc;
        border-radius: 6px;
        border: 1px dashed #cbd5e1;
      }
      .staff-matrix-table {
        width: 100%;
        border-collapse: collapse;
        margin: 6px 0 4px 0;
        page-break-inside: avoid;
        background: #ffffff;
      }
      .staff-matrix-table th {
        background: #f1f5f9;
        font-weight: 900;
        border: 1.5px solid #94a3b8;
        padding: 6px 6px;
        font-size: 11px;
        color: #1e293b;
      }
      .staff-matrix-table td {
        border: 1.5px solid #cbd5e1;
        padding: 6px 6px;
        vertical-align: middle;
      }
      .print-signatures-footer {
        margin-top: 8px;
        border-top: 2px solid #94a3b8;
        padding-top: 6px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        text-align: center;
        page-break-inside: avoid;
      }
      .signature-box {
        border: 1.5px dashed #94a3b8;
        border-radius: 8px;
        padding: 6px 8px;
        background: #f8fafc;
        min-height: 75px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
    </style>

    <div class="print-landscape-wrapper">
      <!-- Header Banner -->
      <div style="border-bottom:2.5px solid #0f766e; padding-bottom:5px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:900; color:#0f766e;">${companyName}</div>
          <h1 style="margin:2px 0 0 0; font-size:16.5px; font-weight:900; color:#0f172a;">
            خريطة الورديات الأسبوعية وتوزيع الكادر التشغيلي — فرع ${branchName}
          </h1>
          <div style="font-size:11px; color:#475569; margin-top:2px;">
            دورة التشغيل المعتمدة: <strong>${cycleRange?.label || monthLabel(selectedMonth).arabic}</strong>
          </div>
        </div>
        <div style="text-align:left; background:#f8fafc; border:1.5px solid #cbd5e1; padding:6px 12px; border-radius:8px;">
          <div style="font-size:10px; color:#475569;">
            تاريخ الطباعة: <strong>${printDate}</strong> (${printTime})
          </div>
          <div style="font-size:10px; color:#0f766e; font-weight:800; margin-top:2px;">
            الاعتماد: معتمد من إدارة التشغيل والموارد البشرية
          </div>
        </div>
      </div>

      <!-- KPI Metrics Strip -->
      <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px; padding:5px 12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; font-size:10.5px;">
        <div>👥 <strong>قوة الكادر:</strong> ${branchMetrics?.totalStaff || (staffSchedules || []).length} موظف</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>⏱️ <strong>ساعات التغطية الأسبوعية:</strong> ${branchMetrics?.totalWeeklyScheduledHours || 0} ساعة</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>💊 <strong>تغطية الصيدلي القانونية:</strong> ${branchMetrics?.daysWithPharmacist || 0} من 7 أيام</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>🏢 <strong>الفرع:</strong> ${branchName} | <strong>المدينة:</strong> ${currentBranch?.city || '—'}</div>
      </div>

      <!-- 7 Days Grid -->
      <div class="print-grid">
        ${daysHTML}
      </div>

      <!-- Detailed Staff Schedule Matrix Table (Directly Below Grid) -->
      ${(staffSchedules || []).length > 0 ? `
        <div style="margin-top:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
            <span style="font-weight:900; font-size:11px; color:#0f766e;">📋 تفصيل جدول وساعات عمل كادر الفرع (المصفوفة التشغيلية):</span>
            <span style="font-size:9.5px; color:#64748b; font-weight:600;">(توزيع الورديات والراحات الأسبوعية لكل موظف)</span>
          </div>
          <table class="staff-matrix-table">
            <thead>
              <tr>
                <th style="width:20%; text-align:right;">الموظف / الوظيفة</th>
                ${DAYS_OF_WEEK.map(d => `<th style="text-align:center;">${d.label}</th>`).join('')}
                <th style="width:11%; text-align:center;">إجمالي الأسبوع</th>
              </tr>
            </thead>
            <tbody>
              ${staffMatrixRowsHTML}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Operational Governance Instructions Note -->
      <div style="background:#eff6ff; border:1.5px solid #93c5fd; border-radius:6px; padding:5px 10px; margin-top:6px; font-size:9px; color:#1e40af; line-height:1.4;">
        <strong style="color:#1e3a8a;">📌 ضوابط تشغيلية ملزمة:</strong> (1) الالتزام بالحضور قبل بداية الوردية بـ 10 دقائق لضمان التسليم والتسلم الدقيق. (2) يمنع تبديل الورديات أو الراحات إلا بإذن كتابي مسبق ومعتمد من إدارة الموارد البشرية. (3) يُحظر مغادرة مقر العمل أثناء الوردية دون تواجد صيدلي بديل مرخص.
      </div>

      <!-- Signatures Footer -->
      <div class="print-signatures-footer">
        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">
            توقيع مدير الفرع
          </div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">التاريخ: .... / .... / 2026 م</div>
        </div>

        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">
            اعتماد إدارة الموارد البشرية (HR)
          </div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">التاريخ: .... / .... / 2026 م</div>
        </div>

        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">
            اعتماد الإدارة العليا والتشغيل
          </div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">الختم والتوقيع الرسمي</div>
        </div>
      </div>

      <!-- Legal Watermark Note -->
      <div style="text-align:center; margin-top:4px; font-size:8.5px; color:#94a3b8;">
        وثيقة تشغيلية رسمية صادرة آلياً من المنظومة الإدارية — ${companyName} — أي كشط أو تعديل يدوي يلغي العمل بهذه الوثيقة.
      </div>
    </div>
  `;
}

/**
 * توليد كود HTML متكامل ومعزول لمصفوفة موظفي الفرع وجدول وردياتهم الأسبوعية
 * جاهز للطباعة المباشرة بصيغة A4 Landscape مع توقيعات الاعتماد الرسمية
 */
function generateOfficialMatrixHTML({
  currentBranch,
  selectedMonth,
  cycleRange,
  staffSchedules = [],
  branchMetrics,
  orgSettings
}) {
  const companyName = orgSettings?.companyName || 'مجموعة صيدليات د. منار الكومي';
  const branchName = currentBranch?.name || 'الفرع';
  const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const printTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const rowsHTML = (staffSchedules || []).map(({ employee, schedule, isApproved, totalWeeklyHours, workDaysCount }) => {
    const isPharm = (employee.jobTitle || '').includes('صيدل');
    const daysCells = DAYS_OF_WEEK.map(d => {
      if (!isApproved || !schedule) {
        return `<td style="border:1.5px solid #cbd5e1; padding:8px 6px; text-align:center; color:#94a3b8; font-size:10.5px;">غير معتمد</td>`;
      }
      const dInfo = schedule[d.label];
      const isShift = dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end;
      return `
        <td style="border:1.5px solid #cbd5e1; padding:8px 6px; text-align:center; background:${isShift ? '#f0fdf4' : '#fffbeb'};">
          ${isShift ? `
            <div style="font-weight:800; color:#15803d; font-size:11px; white-space:nowrap; direction:rtl;">
              من ${formatTime12H(dInfo.start)} إلى ${formatTime12H(dInfo.end)}
            </div>
            <div style="font-size:9px; color:#166534; margin-top:2px; font-weight:700;">وردية عمل</div>
          ` : `
            <div style="font-weight:800; color:#92400e; font-size:11px;">راحة أسبوعية</div>
          `}
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td style="border:1.5px solid #cbd5e1; padding:8px 10px; text-align:right;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span style="font-weight:900; color:#0f172a; font-size:12.5px;">${getEmpDisplayName(employee)}</span>
            ${isPharm ? '<span style="color:#15803d; font-size:9.5px; background:#dcfce7; padding:2px 6px; border-radius:4px; font-weight:800; border:1px solid #86efac;">صيدلي</span>' : ''}
          </div>
          <div style="font-size:10.5px; color:#475569; font-weight:600; margin-top:3px;">${employee.jobTitle || 'موظف'}</div>
        </td>
        ${daysCells}
        <td style="border:1.5px solid #cbd5e1; padding:8px 6px; text-align:center; font-weight:900; color:#0f766e; font-size:11.5px; white-space:nowrap; background:#f8fafc;">
          ${totalWeeklyHours} ساعة
          <div style="font-size:9.5px; color:#64748b; font-weight:normal; margin-top:2px;">(${workDaysCount} أيام عمل)</div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <style>
      @page {
        size: A4 landscape !important;
        margin: 6mm 8mm !important;
      }
      * {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        font-family: 'Cairo', 'Tajawal', sans-serif !important;
        color: #0f172a !important;
        background: #ffffff !important;
        direction: rtl !important;
        width: 100% !important;
      }
      .print-landscape-wrapper {
        box-sizing: border-box;
        width: 100%;
        max-width: 281mm;
        min-height: 195mm;
        margin: 0 auto;
        padding: 4px 6px;
        background: #ffffff;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      @media screen {
        body {
          background: #f1f5f9 !important;
          padding: 14px 10px !important;
        }
        .print-landscape-wrapper {
          min-width: 980px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          border-radius: 10px;
          margin-top: 10px;
          margin-bottom: 20px;
          padding: 16px 20px;
        }
      }
      @media print {
        html, body {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        .print-landscape-wrapper {
          width: 100% !important;
          min-width: 100% !important;
          max-width: none !important;
          height: 195mm !important;
          min-height: 195mm !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
        }
        .no-print { display: none !important; }
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
        page-break-inside: avoid;
        background: #ffffff;
        flex: 1;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      th {
        background: #f1f5f9;
        font-weight: 900;
        border: 1.5px solid #94a3b8;
        padding: 8px 6px;
        font-size: 11.5px;
        color: #1e293b;
      }
      td {
        border: 1.5px solid #cbd5e1;
        padding: 8px 6px;
        vertical-align: middle;
      }
      .print-signatures-footer {
        margin-top: 10px;
        border-top: 2px solid #94a3b8;
        padding-top: 8px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        text-align: center;
        page-break-inside: avoid;
      }
      .signature-box {
        border: 1.5px dashed #94a3b8;
        border-radius: 8px;
        padding: 8px 10px;
        background: #f8fafc;
        min-height: 75px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
    </style>
    <div class="print-landscape-wrapper">
      <!-- Header Banner -->
      <div style="border-bottom:2.5px solid #0f766e; padding-bottom:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12.5px; font-weight:900; color:#0f766e;">${companyName}</div>
          <h1 style="margin:2px 0 0 0; font-size:17px; font-weight:900; color:#0f172a;">
            مصفوفة مواعيد وورديات العمل الرسمية — فرع ${branchName}
          </h1>
          <div style="font-size:11px; color:#475569; margin-top:2px;">
            دورة التشغيل: <strong>${cycleRange?.label || monthLabel(selectedMonth).arabic}</strong>
          </div>
        </div>
        <div style="text-align:left; background:#f8fafc; border:1.5px solid #cbd5e1; padding:6px 12px; border-radius:8px; font-size:10px; color:#475569;">
          <div>تاريخ الطباعة: <strong>${printDate}</strong> (${printTime})</div>
          <div style="font-size:10px; color:#0f766e; font-weight:800; margin-top:2px;">الاعتماد: معتمد من الإدارة</div>
        </div>
      </div>

      <!-- KPI Metrics Strip -->
      <div style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px; padding:6px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; font-size:11px;">
        <div>👥 <strong>قوة الكادر:</strong> ${branchMetrics?.totalStaff || (staffSchedules || []).length} موظف</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>⏱️ <strong>ساعات التغطية الأسبوعية:</strong> ${branchMetrics?.totalWeeklyScheduledHours || 0} ساعة</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>💊 <strong>تغطية الصيدلي:</strong> ${branchMetrics?.daysWithPharmacist || 0} من 7 أيام</div>
        <div style="border-right:1.5px solid #cbd5e1; height:14px;"></div>
        <div>🏢 <strong>الفرع:</strong> ${branchName} | <strong>المدينة:</strong> ${currentBranch?.city || '—'}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:20%; text-align:right;">الموظف / الوظيفة</th>
            ${DAYS_OF_WEEK.map(d => `<th style="text-align:center;">${d.label}</th>`).join('')}
            <th style="width:11%; text-align:center;">إجمالي الأسبوع</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>

      <!-- Operational Governance Instructions Note -->
      <div style="background:#eff6ff; border:1.5px solid #93c5fd; border-radius:6px; padding:6px 10px; margin-top:8px; font-size:9.5px; color:#1e40af; line-height:1.4;">
        <strong style="color:#1e3a8a;">📌 ضوابط تشغيلية ملزمة:</strong> (1) الالتزام بالحضور قبل بداية الوردية بـ 10 دقائق لضمان التسليم والتسلم الدقيق. (2) يمنع تبديل الورديات أو الراحات إلا بإذن كتابي مسبق ومعتمد من مدير الفرع وإدارة الموارد البشرية. (3) يُحظر مغادرة مقر العمل أثناء الوردية دون تواجد صيدلي بديل مرخص.
      </div>

      <div class="print-signatures-footer">
        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">توقيع مدير الفرع</div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">التاريخ: .... / .... / 2026 م</div>
        </div>
        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">اعتماد إدارة الموارد البشرية (HR)</div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">التاريخ: .... / .... / 2026 م</div>
        </div>
        <div class="signature-box">
          <div style="font-weight:900; font-size:11px; color:#0f172a;">اعتماد الإدارة العليا والتشغيل</div>
          <div style="border-bottom:1.5px dashed #94a3b8; width:75%; margin:16px auto 4px auto;"></div>
          <div style="font-size:9.5px; color:#64748b;">الختم والتوقيع الرسمي</div>
        </div>
      </div>

      <!-- Legal Watermark Note -->
      <div style="text-align:center; margin-top:5px; font-size:8.5px; color:#94a3b8;">
        وثيقة تشغيلية رسمية صادرة آلياً من المنظومة الإدارية — ${companyName} — أي كشط أو تعديل يدوي يلغي العمل بهذه الوثيقة.
      </div>
    </div>
  `;
}

export default function BranchMonthlyRosterModule({
  state,
  initialBranchId = '',
  onNavigateTab,
  onSwitchSubTab
}) {
  const branches = state.branches || [];
  const employees = state.employees || [];

  // Active state
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    if (initialBranchId && branches.some(b => String(b.id) === String(initialBranchId))) {
      return String(initialBranchId);
    }
    return branches[0] ? String(branches[0].id) : '';
  });

  const [selectedMonth, setSelectedMonth] = useState(() => getRealTodayStr().slice(0, 7));
  const [viewMode, setViewMode] = useState('board'); // 'board' | 'matrix' | 'calendar'
  const [jobFilter, setJobFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printLayout, setPrintLayout] = useState('board'); // 'board' | 'matrix'

  // Selected Branch Object
  const currentBranch = useMemo(() => {
    return branches.find(b => String(b.id) === String(selectedBranchId)) || branches[0] || null;
  }, [branches, selectedBranchId]);

  // Branch Employees (primary branch or secondary branchDetails)
  const branchEmployees = useMemo(() => {
    if (!currentBranch) return [];
    const bIdStr = String(currentBranch.id);
    return employees.filter(emp => {
      if (!isEmployeeActive(emp)) return false;
      const isPrimary = String(emp.branchId || '') === bIdStr;
      const isSecondary = Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(bd => String(bd.branchId) === bIdStr);
      return isPrimary || isSecondary;
    });
  }, [employees, currentBranch]);

  // 1. Dynamic Jobs List from registered system jobs & branch employees
  const systemJobs = useMemo(() => {
    const jobs = getJobsList(state);
    const titles = new Set();
    jobs.forEach(j => {
      const t = typeof j === 'string' ? j : (j.title || j.name || '');
      if (t && t.trim()) titles.add(t.trim());
    });
    branchEmployees.forEach(e => {
      if (e.jobTitle && e.jobTitle.trim()) titles.add(e.jobTitle.trim());
    });
    return Array.from(titles).sort();
  }, [state, branchEmployees]);

  // Filtered Branch Employees by Search & Job
  const filteredEmployees = useMemo(() => {
    return branchEmployees.filter(emp => {
      if (jobFilter !== 'all') {
        if ((emp.jobTitle || '').trim() !== jobFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (emp.name || '').toLowerCase().includes(q);
        const nickMatch = (emp.nickname || '').toLowerCase().includes(q);
        const codeMatch = String(emp.code || '').toLowerCase().includes(q);
        const jobMatch = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!nameMatch && !nickMatch && !codeMatch && !jobMatch) return false;
      }
      return true;
    });
  }, [branchEmployees, jobFilter, searchQuery]);

  // 2. Check Approved Rosters for Selected Month & Branch (Prevent showing fake schedules for unapproved months)
  const resolvedRostersMap = useMemo(() => {
    if (!currentBranch) return new Map();
    const map = new Map();
    branchEmployees.forEach(emp => {
      const r = getResolvedEmployeeRoster(emp, currentBranch.id, state, selectedMonth);
      map.set(String(emp.id), r);
      if (emp.code) map.set(`code_${emp.code}`, r);
    });
    return map;
  }, [branchEmployees, currentBranch, state, selectedMonth]);

  const approvedRostersCount = useMemo(() => {
    let count = 0;
    branchEmployees.forEach(emp => {
      const r = resolvedRostersMap.get(String(emp.id));
      if (r !== null && r?.schedule) count++;
    });
    return count;
  }, [branchEmployees, resolvedRostersMap]);

  const hasApprovedRosters = approvedRostersCount > 0;

  // Staff members in this branch without an approved roster for this month
  const unapprovedStaff = useMemo(() => {
    if (!currentBranch) return [];
    return branchEmployees.filter(emp => !resolvedRostersMap.get(String(emp.id))?.schedule);
  }, [branchEmployees, currentBranch, resolvedRostersMap]);

  // Map each employee to their resolved schedule for this branch and month
  const staffSchedules = useMemo(() => {
    if (!currentBranch) return [];
    return filteredEmployees.map(emp => {
      const rosterObj = resolvedRostersMap.get(String(emp.id)) || (emp.code ? resolvedRostersMap.get(`code_${emp.code}`) : null) || null;
      const isApproved = Boolean(rosterObj && rosterObj.schedule);
      const schedule = isApproved ? rosterObj.schedule : null;

      let totalWeeklyHours = 0;
      let workDaysCount = 0;

      if (schedule) {
        DAYS_OF_WEEK.forEach(d => {
          const dayInfo = schedule[d.label] || { type: 'off' };
          if (dayInfo.type === 'shift' && dayInfo.start && dayInfo.end) {
            workDaysCount++;
            const [sh, sm] = dayInfo.start.split(':').map(Number);
            const [eh, em] = dayInfo.end.split(':').map(Number);
            let h = eh - sh + (em - sm) / 60;
            if (h <= 0) h += 24;
            totalWeeklyHours += h;
          }
        });
      }

      return {
        employee: emp,
        rosterObj,
        schedule,
        isApproved,
        totalWeeklyHours: Math.round(totalWeeklyHours * 10) / 10,
        workDaysCount
      };
    });
  }, [filteredEmployees, currentBranch, resolvedRostersMap]);

  // Day-by-Day Roster Structure
  const dayRosterMap = useMemo(() => {
    const map = {};
    DAYS_OF_WEEK.forEach(day => {
      const workingStaff = [];
      const offStaff = [];

      staffSchedules.forEach(({ employee, schedule, isApproved }) => {
        if (!isApproved || !schedule) return;

        const dayInfo = schedule[day.label] || { type: 'off', start: '', end: '' };
        if (dayInfo.type === 'shift' && dayInfo.start && dayInfo.end) {
          const shiftKey = `${dayInfo.start} - ${dayInfo.end}`;
          const [sh, sm] = dayInfo.start.split(':').map(Number);
          const [eh, em] = dayInfo.end.split(':').map(Number);
          let h = eh - sh + (em - sm) / 60;
          if (h <= 0) h += 24;

          workingStaff.push({
            employee,
            shiftKey,
            start: dayInfo.start,
            end: dayInfo.end,
            hours: Math.round(h * 10) / 10,
            isPharmacist: (employee.jobTitle || '').includes('صيدل')
          });
        } else {
          offStaff.push({
            employee,
            isOff: true,
            isPharmacist: (employee.jobTitle || '').includes('صيدل')
          });
        }
      });

      // Group working staff by exact shift interval
      const shiftGroups = {};
      workingStaff.forEach(st => {
        if (!shiftGroups[st.shiftKey]) {
          shiftGroups[st.shiftKey] = {
            shiftKey: st.shiftKey,
            start: st.start,
            end: st.end,
            hours: st.hours,
            staff: []
          };
        }
        shiftGroups[st.shiftKey].staff.push(st);
      });

      // Sort shift groups chronologically by start time (24h)
      const sortedShiftGroups = Object.values(shiftGroups).sort((a, b) => a.start.localeCompare(b.start));

      map[day.key] = {
        day,
        totalWorking: workingStaff.length,
        totalOff: offStaff.length,
        hasPharmacist: workingStaff.some(s => s.isPharmacist),
        shiftGroups: sortedShiftGroups,
        workingStaff,
        offStaff
      };
    });
    return map;
  }, [staffSchedules]);

  // Days with no legal pharmacist coverage
  const unstaffedPharmacistDays = useMemo(() => {
    return DAYS_OF_WEEK.filter(d => !dayRosterMap[d.key]?.hasPharmacist);
  }, [dayRosterMap]);

  // Overall Branch Metrics
  const branchMetrics = useMemo(() => {
    const totalStaff = branchEmployees.length;
    let totalWeeklyScheduledHours = 0;
    let totalShiftsCount = 0;

    if (hasApprovedRosters) {
      Object.values(dayRosterMap).forEach(d => {
        totalShiftsCount += d.totalWorking;
        d.workingStaff.forEach(s => {
          totalWeeklyScheduledHours += s.hours;
        });
      });
    }

    const avgHoursPerEmp = totalStaff > 0 ? Math.round((totalWeeklyScheduledHours / totalStaff) * 10) / 10 : 0;
    const daysWithPharmacist = hasApprovedRosters ? Object.values(dayRosterMap).filter(d => d.hasPharmacist).length : 0;

    return {
      totalStaff,
      totalWeeklyScheduledHours: Math.round(totalWeeklyScheduledHours * 10) / 10,
      totalMonthlyEstimatedHours: Math.round(totalWeeklyScheduledHours * 4.2),
      avgHoursPerEmp,
      daysWithPharmacist
    };
  }, [branchEmployees, dayRosterMap, hasApprovedRosters]);

  // 3. Cycle Date Range from periodEngine (Following Management Approved Payroll/Roster Cycle)
  const cycleRange = useMemo(() => {
    return getCycleDateRange(selectedMonth, state?.orgSettings);
  }, [selectedMonth, state?.orgSettings]);

  // Calendar dates generator according to the cycle date range
  const calendarDays = useMemo(() => {
    if (!cycleRange || !cycleRange.startDate || !cycleRange.endDate) return [];
    const days = [];
    const curr = new Date(cycleRange.startDate + 'T00:00:00');
    const end = new Date(cycleRange.endDate + 'T00:00:00');

    while (curr <= end) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const dayOfWeek = curr.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

      const dayMapIndex = [
        DAYS_OF_WEEK[1], // Sunday (0)
        DAYS_OF_WEEK[2], // Monday (1)
        DAYS_OF_WEEK[3], // Tuesday (2)
        DAYS_OF_WEEK[4], // Wednesday (3)
        DAYS_OF_WEEK[5], // Thursday (4)
        DAYS_OF_WEEK[6], // Friday (5)
        DAYS_OF_WEEK[0]  // Saturday (6)
      ][dayOfWeek];

      days.push({
        dayNum: curr.getDate(),
        monthNum: curr.getMonth() + 1,
        year: y,
        dateStr,
        dayInfo: dayMapIndex,
        rosterData: dayRosterMap[dayMapIndex.key] || { shiftGroups: [], offStaff: [], totalWorking: 0 }
      });

      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [cycleRange, dayRosterMap]);

  // 4. Print Handler using isolated triggerDirectPrint (Supports Board or Matrix layout)
  const handlePrint = (overrideLayout) => {
    if (!currentBranch) return;
    const targetLayout = overrideLayout || printLayout;
    if (targetLayout === 'matrix') {
      const html = generateOfficialMatrixHTML({
        currentBranch,
        selectedMonth,
        cycleRange,
        staffSchedules,
        branchMetrics,
        orgSettings: state?.orgSettings
      });
      triggerDirectPrint(html, `مصفوفة_ورديات_فرع_${currentBranch.name.replace(/\s+/g, '_')}_${selectedMonth}`, 'landscape');
    } else {
      const html = generateOfficialWeeklyShiftsHTML({
        currentBranch,
        selectedMonth,
        cycleRange,
        dayRosterMap,
        branchMetrics,
        staffSchedules,
        orgSettings: state?.orgSettings
      });
      triggerDirectPrint(html, `خريطة_ورديات_فرع_${currentBranch.name.replace(/\s+/g, '_')}_${selectedMonth}`, 'landscape');
    }
  };

  // Export to Excel handler using ExcelJS
  const handleExportExcel = async () => {
    if (!currentBranch) return;
    try {
      const Excel = await loadExcelJS();
      const wb = new Excel.Workbook();

      // Sheet 1: مصفوفة موظفي الفرع
      const wsMatrix = wb.addWorksheet('مصفوفة موظفي الفرع', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      mergedTitle(wsMatrix, 1, `جدول تشغيل فرع ${currentBranch.name} — شهر ${monthLabel(selectedMonth).arabic} (${cycleRange?.label || ''})`, 11, 'FF0F766E', 14, 28);

      const matrixHeaders = [
        'كود الموظف',
        'اسم الموظف',
        'المسمى الوظيفي',
        ...DAYS_OF_WEEK.map(d => d.label),
        'إجمالي ساعات الأسبوع',
        'أيام العمل'
      ];
      tableHeaderRow(wsMatrix, 2, matrixHeaders);

      staffSchedules.forEach((item, idx) => {
        const rowVals = [
          item.employee.code,
          getEmpDisplayName(item.employee),
          item.employee.jobTitle || '—',
          ...DAYS_OF_WEEK.map(d => {
            if (!item.isApproved || !item.schedule) return 'غير معتمد';
            const dInfo = item.schedule[d.label];
            return (dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end)
              ? `${formatTime12H(dInfo.start)} إلى ${formatTime12H(dInfo.end)}`
              : 'راحة أسبوعية';
          }),
          item.totalWeeklyHours,
          item.workDaysCount
        ];
        dataRow(wsMatrix, 3 + idx, rowVals);
      });

      wsMatrix.columns.forEach(col => {
        col.width = 18;
      });

      // Sheet 2: ملخص الورديات اليومية
      const wsShifts = wb.addWorksheet('ملخص خريطة الورديات', {
        views: [{ rightToLeft: true, showGridLines: true }]
      });

      mergedTitle(wsShifts, 1, `ملخص الورديات والتواجد المتزامن — فرع ${currentBranch.name}`, 5, 'FF134E4A', 14, 28);
      tableHeaderRow(wsShifts, 2, ['اليوم', 'توقيت الوردية (12 ساعة)', 'المدة (ساعات)', 'عدد الكادر', 'الموظفون المكلفون']);

      let sRow = 3;
      DAYS_OF_WEEK.forEach(d => {
        const dData = dayRosterMap[d.key];
        dData.shiftGroups.forEach(sg => {
          dataRow(wsShifts, sRow++, [
            d.label,
            formatShiftRange12H(sg.start, sg.end),
            sg.hours,
            sg.staff.length,
            sg.staff.map(s => `${s.employee.name} (${s.employee.jobTitle || 'موظف'})`).join(' | ')
          ]);
        });
        if (dData.offStaff.length > 0) {
          dataRow(wsShifts, sRow++, [
            d.label,
            'راحة أسبوعية',
            0,
            dData.offStaff.length,
            dData.offStaff.map(s => `${s.employee.name} (${s.employee.jobTitle || 'موظف'})`).join(' | ')
          ]);
        }
      });

      wsShifts.columns.forEach(col => {
        col.width = 22;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `جدول_تشغيل_فرع_${currentBranch.name.replace(/\s+/g, '_')}_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export error:', err);
      alert('⚠️ حدث خطأ أثناء تصدير ملف الإكسل.');
    }
  };

  return (
    <div className="branch-monthly-roster-module" style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl', fontFamily: 'Cairo, Tajawal, sans-serif' }}>
      
      {/* ── Top Header & Sub-Nav Tabs ── */}
      <div style={{ background: 'var(--surface)', padding: '18px 24px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🏢</span>
              <h2 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '20px', fontWeight: 800 }}>
                منظومة الفروع: الجدول التشغيلي الشهري للفرع
              </h2>
            </div>
            <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13.5px' }}>
              استعراض خريطة حضور وتوزيع موظفي كل فرع على الورديات والراحات اليومية والتغطيات المتزامنة
            </p>
          </div>

          {/* Sub-Nav Toggle Tabs */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0', gap: '4px' }}>
            <button
              type="button"
              onClick={() => onSwitchSubTab ? onSwitchSubTab('list') : (onNavigateTab && onNavigateTab('branches'))}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🏢</span> إدارة وبيانات الفروع
            </button>
            <button
              type="button"
              style={{
                border: 'none',
                background: '#ffffff',
                color: '#0f766e',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'default',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📅</span> الجدول الشهري للفرع
            </button>
          </div>
        </div>

        {/* Filters & Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '14px', borderTop: '1px dashed #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Branch Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>📍 اختر الفرع:</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--primary-light, #bfdbfe)',
                  background: '#f8fafc',
                  color: 'var(--text)',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({employees.filter(e => isEmployeeActive(e) && (String(e.branchId) === String(b.id) || (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(b.id))))).length} موظف)
                  </option>
                ))}
              </select>
            </div>

            {/* Month Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>🗓️ الشهر:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: '#fff',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              />
            </div>

            {/* Job Filter - Dynamic Registered System Jobs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>💼 التخصص:</label>
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  background: '#fff',
                  fontSize: '13px',
                  fontWeight: 600
                }}
              >
                <option value="all">جميع الوظائف ({branchEmployees.length})</option>
                {systemJobs.map(job => {
                  const count = branchEmployees.filter(e => (e.jobTitle || '').trim() === job).length;
                  return (
                    <option key={job} value={job}>
                      {job} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 بحث باسم الموظف أو الكود..."
                style={{
                  padding: '7px 12px',
                  borderRadius: '10px',
                  border: '1.5px solid var(--border)',
                  fontSize: '13px',
                  width: '190px'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', left: '8px', top: '7px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* View Modes & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            
            {/* View Mode Toggle */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                style={{
                  border: 'none',
                  background: viewMode === 'board' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'board' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض خريطة الورديات الأسبوعية"
              >
                📊 خريطة الورديات
              </button>
              <button
                type="button"
                onClick={() => setViewMode('matrix')}
                style={{
                  border: 'none',
                  background: viewMode === 'matrix' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'matrix' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض مصفوفة الموظفين"
              >
                📋 مصفوفة الموظفين
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                style={{
                  border: 'none',
                  background: viewMode === 'calendar' ? 'var(--primary, #0d9488)' : 'transparent',
                  color: viewMode === 'calendar' ? '#fff' : '#64748b',
                  padding: '5px 12px',
                  borderRadius: '7px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="عرض التقويم الشهري"
              >
                🗓️ تقويم الشهر
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setIsPrintModalOpen(true)}
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="معاينة وطباعة خريطة الورديات A4 بنظام معزول"
            >
              🖨️ طباعة الجدول A4
            </button>

            {/* Excel Export Button */}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExportExcel}
              style={{
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #86efac',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="تصدير جدول الفرع إلى إكسيل"
            >
              📥 تصدير Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Branch KPI Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            👥
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>إجمالي قوة موظفي الفرع</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0369a1', marginTop: '2px' }}>
              {branchMetrics.totalStaff} موظف
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            ⏱️
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>ساعات التغطية الأسبوعية</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
              {branchMetrics.totalWeeklyScheduledHours} ساعة / أسبوع
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            📈
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>متوسط ساعات عمل الموظف</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
              {branchMetrics.avgHoursPerEmp} س / أسبوع
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', padding: '14px 18px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: branchMetrics.daysWithPharmacist === 7 ? '#dcfce7' : '#fee2e2', color: branchMetrics.daysWithPharmacist === 7 ? '#15803d' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
            💊
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>تغطية وجود الصيدلي القانوني</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: branchMetrics.daysWithPharmacist === 7 ? '#15803d' : '#dc2626', marginTop: '2px' }}>
              {branchMetrics.daysWithPharmacist} من 7 أيام
            </div>
          </div>
        </div>
      </div>

      {/* ── Empty State 1: No employees in branch ── */}
      {branchEmployees.length === 0 ? (
        <div style={{ background: '#fff', padding: '48px 24px', borderRadius: '16px', border: '2px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏢</div>
          <h3 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>لا يوجد موظفون معينون بهذا الفرع حالياً</h3>
          <p style={{ margin: 0, fontSize: '14px', maxWidth: '460px', marginInline: 'auto' }}>
            يرجى تعيين موظفين في فرع <strong>"{currentBranch?.name}"</strong> من خلال شاشة ملفات الموظفين أو إضافة فرع إضافي لهم لعرض جدولهم التشغيلي هنا.
          </p>
        </div>
      ) : !hasApprovedRosters ? (
        /* ── Empty State 2: No approved roster for this month in this branch ── */
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '2px dashed #f59e0b',
          padding: '48px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.08)'
        }}>
          <div style={{ fontSize: '50px', marginBottom: '14px' }}>📋⚠️</div>
          <h3 style={{ margin: '0 0 10px 0', color: '#92400e', fontSize: '20px', fontWeight: 800 }}>
            لم يتم اعتماد جدول تشغيلي لهذا الشهر حتى الآن
          </h3>
          <p style={{ margin: '0 auto 20px auto', fontSize: '14px', color: '#64748b', maxWidth: '560px', lineHeight: '1.7' }}>
            لا توجد جداول تشغيل أو ورديات عمل معتمدة رسمياً لموظفي فرع <strong>"{currentBranch?.name}"</strong> خلال دورة شهر <strong>{monthLabel(selectedMonth).arabic} ({selectedMonth})</strong>.
            <br />
            للحفاظ على دقة العمل المؤسسي، لن يتم عرض أي ورديات افتراضية. يرجى اعتماد جداول موظفي الفرع من شاشة <strong>إدارة الجداول والورديات</strong>.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onNavigateTab ? onNavigateTab('roster') : null}
              style={{
                background: 'linear-gradient(135deg, #0f766e, #0d9488)',
                color: '#fff',
                border: 'none',
                padding: '10px 22px',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '13.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
              }}
            >
              <span>📅</span> الانتقال لاعتماد جدول الورديات (Roster)
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedMonth(getRealTodayStr().slice(0, 7))}
              style={{
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '10px 20px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>🔄</span> العودة للشهر الحالي
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Legal Compliance Warning Banner (Pharmacist Gaps) */}
          {hasApprovedRosters && unstaffedPharmacistDays.length > 0 && (
            <div style={{
              background: '#fff1f2',
              border: '1.5px solid #fecdd3',
              borderRadius: '12px',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              boxShadow: '0 2px 6px rgba(225, 29, 72, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>💊⚠️</span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#9f1239' }}>
                    تنبيه التغطية الصيدلية القانونية (تفتيش الصيدلة):
                  </div>
                  <div style={{ fontSize: '12px', color: '#be123c', marginTop: '2px' }}>
                    يوجد أيام بالفرع لا يغطيها أي صيدلي مسجل: <strong>{unstaffedPharmacistDays.map(d => `يوم ${d.label}`).join('، ')}</strong>. يُرجى مراجعة وتعديل الجدول لضمان تواجد صيدلي قانوني طوال أيام العمل.
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '11.5px', background: '#ffe4e6', color: '#be123c', padding: '4px 10px', borderRadius: '8px', fontWeight: 800, border: '1px solid #fecdd3' }}>
                عجز صيدلي: {unstaffedPharmacistDays.length} أيام
              </span>
            </div>
          )}

          {/* Unapproved Employees Banner */}
          {hasApprovedRosters && unapprovedStaff.length > 0 && (
            <div style={{
              background: '#fffbeb',
              border: '1.5px solid #fde68a',
              borderRadius: '12px',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              boxShadow: '0 2px 6px rgba(217, 119, 6, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}>👥⏳</span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#92400e' }}>
                    تنبيه كادر غير معتمد ({unapprovedStaff.length} من إجمالي {branchEmployees.length} موظف):
                  </div>
                  <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                    الموظفون التاليون لم يتم اعتماد جداولهم بعد لهذا الشهر: <strong>{unapprovedStaff.map(e => getEmpDisplayName(e)).join('، ')}</strong>.
                  </div>
                </div>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('roster')}
                  style={{
                    background: '#fef3c7',
                    color: '#78350f',
                    border: '1px solid #f59e0b',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  اعتماد جداولهم الآن ➔
                </button>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 1: WEEKLY SHIFTS BOARD (خريطة الورديات الأسبوعية)                         */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'board' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'start' }}>
              {DAYS_OF_WEEK.map(day => {
                const dayData = dayRosterMap[day.key];
                const isFriday = day.key === 'friday';

                return (
                  <div
                    key={day.key}
                    style={{
                      background: 'var(--surface)',
                      borderRadius: '16px',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    {/* Day Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        background: isFriday ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        borderBottom: '1.5px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{isFriday ? '🕌' : '🗓️'}</span>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: isFriday ? '#92400e' : '#166534' }}>
                          يوم {day.label}
                        </h4>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ fontSize: '11px', background: '#fff', color: '#166534', padding: '2px 8px', borderRadius: '99px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
                          🟢 {dayData.totalWorking} حضور
                        </span>
                        {dayData.totalOff > 0 && (
                          <span style={{ fontSize: '11px', background: '#fff', color: '#b45309', padding: '2px 8px', borderRadius: '99px', fontWeight: 700, border: '1px solid #fde68a' }}>
                            🏖️ {dayData.totalOff} راحة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Day Body Content */}
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      
                      {/* Active Shifts Groups */}
                      {dayData.shiftGroups.length === 0 ? (
                        <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', border: '1px dashed #cbd5e1' }}>
                          🚫 لا توجد ورديات عمل مجدولة في هذا اليوم
                        </div>
                      ) : (
                        dayData.shiftGroups.map((group, gIdx) => {
                          const isConcurrent = group.staff.length > 1;

                          return (
                            <div
                              key={gIdx}
                              style={{
                                background: '#f8fafc',
                                border: isConcurrent ? '1.5px solid #6ee7b7' : '1px solid #e2e8f0',
                                borderRadius: '12px',
                                overflow: 'hidden'
                              }}
                            >
                              {/* Shift Timing Header with 12H display */}
                              <div
                                style={{
                                  padding: '8px 12px',
                                  background: isConcurrent ? '#ecfdf5' : '#f1f5f9',
                                  borderBottom: '1px solid #e2e8f0',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '14px' }}>⏱️</span>
                                  <span style={{ fontSize: '13px', fontWeight: 800, color: isConcurrent ? '#047857' : '#334155' }}>
                                    {formatTime12H(group.start)} إلى {formatTime12H(group.end)}
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>({group.hours} س)</span>
                                </div>

                                {isConcurrent ? (
                                  <span style={{ fontSize: '11px', background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: '6px', fontWeight: 800 }}>
                                    👥 تواجد متزامن ({group.staff.length})
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: '6px', fontWeight: 700 }}>
                                    👤 موظف واحد
                                  </span>
                                )}
                              </div>

                              {/* Staff in this shift */}
                              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {group.staff.map(st => {
                                  const isPharm = (st.employee.jobTitle || '').includes('صيدل');
                                  return (
                                    <div
                                      key={st.employee.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: '#fff',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {st.employee.photoUrl ? (
                                          <img
                                            src={st.employee.photoUrl}
                                            alt=""
                                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                          />
                                        ) : (
                                          <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: isPharm ? '#dcfce7' : '#e0f2fe', color: isPharm ? '#15803d' : '#0369a1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
                                            {st.employee.name.trim().charAt(0)}
                                          </span>
                                        )}
                                        <div>
                                          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                                            {getEmpDisplayName(st.employee)}
                                          </div>
                                          <div style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                                            {st.employee.jobTitle || 'موظف'}
                                          </div>
                                        </div>
                                      </div>

                                      {isPharm ? (
                                        <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                          💊 صيدلي
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: '10.5px', background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                          🩺 كادر
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Days Off List */}
                      {dayData.offStaff.length > 0 && (
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 10px' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#92400e', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🏖️</span>
                            <span>راحة أسبوعية ({dayData.offStaff.length} موظف):</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {dayData.offStaff.map(st => (
                              <span
                                key={st.employee.id}
                                style={{
                                  fontSize: '11.5px',
                                  background: '#fff',
                                  color: '#78350f',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #fde68a',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <span>👤 {getEmpDisplayName(st.employee)}</span>
                                <span style={{ fontSize: '9.5px', color: '#a16207' }}>({st.employee.jobTitle || 'موظف'})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 2: STAFF MATRIX VIEW (مصفوفة الموظفين الأفقية)                           */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'matrix' && (
            <div className="table-responsive" style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <table className="bylaws-table" style={{ margin: 0, fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ minWidth: '180px' }}>الموظف والتخصص</th>
                    {DAYS_OF_WEEK.map(d => (
                      <th key={d.key} style={{ textAlign: 'center', minWidth: '130px' }}>
                        {d.label}
                      </th>
                    ))}
                    <th style={{ textAlign: 'center', minWidth: '110px' }}>إجمالي الأسبوع</th>
                  </tr>
                </thead>
                <tbody>
                  {staffSchedules.map(({ employee, schedule, isApproved, totalWeeklyHours, workDaysCount }) => {
                    const isPharm = (employee.jobTitle || '').includes('صيدل');

                    return (
                      <tr key={employee.id}>
                        {/* Employee Details Column */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {employee.photoUrl ? (
                              <img src={employee.photoUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: isPharm ? '#dcfce7' : '#e0f2fe', color: isPharm ? '#15803d' : '#0369a1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                                {employee.name.trim().charAt(0)}
                              </span>
                            )}
                            <div>
                              <div style={{ fontWeight: 800, color: 'var(--text)' }}>
                                {getEmpDisplayName(employee)}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {employee.jobTitle || 'موظف'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 7 Days Columns */}
                        {DAYS_OF_WEEK.map(d => {
                          if (!isApproved || !schedule) {
                            return (
                              <td key={d.key} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>لم يُعتمد جدول</span>
                              </td>
                            );
                          }

                          const dInfo = schedule[d.label];
                          const isShift = dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end;

                          return (
                            <td key={d.key} style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                              {isShift ? (
                                <div
                                  style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    borderRadius: '8px',
                                    padding: '6px 4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                >
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#166534', direction: 'ltr' }}>
                                    {formatShiftRange12H(dInfo.start, dInfo.end)}
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#15803d', fontWeight: 600 }}>
                                    🟢 وردية عمل
                                  </span>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    background: '#fffbeb',
                                    border: '1px solid #fde68a',
                                    borderRadius: '8px',
                                    padding: '6px 4px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                >
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                                    🏖️ راحة
                                  </span>
                                  <span style={{ fontSize: '10px', color: '#b45309' }}>
                                    إجازة أسبوعية
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Weekly Totals */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: '14px' }}>
                            {totalWeeklyHours} ساعة
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                            ({workDaysCount} أيام عمل)
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {/* MODE 3: MONTHLY CALENDAR VIEW (التقويم الشهري الكامل)                          */}
          {/* ══════════════════════════════════════════════════════════════════════════════ */}
          {viewMode === 'calendar' && (
            <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px', fontWeight: 800 }}>
                    🗓️ روزنامة تشغيل فرع {currentBranch?.name} — {cycleRange.label}
                  </h4>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'block', marginTop: '3px' }}>
                    توزيع المناوبات والورديات اليومية طبقا للدورة التشغيلية المحددة من الإدارة ({calendarDays.length} يوم: من {cycleRange.startDate} إلى {cycleRange.endDate})
                  </span>
                </div>
                <div style={{ fontSize: '12px', background: '#f0fdf4', color: '#166534', padding: '4px 10px', borderRadius: '8px', border: '1px solid #86efac', fontWeight: 700 }}>
                  دورة معتمدة: {cycleRange.shortLabel}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                {calendarDays.map(cd => {
                  const isFriday = cd.dayInfo.key === 'friday';
                  const data = cd.rosterData;

                  return (
                    <div
                      key={cd.dateStr}
                      style={{
                        background: '#f8fafc',
                        border: isFriday ? '1.5px solid #fde68a' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: isFriday ? '#b45309' : '#0f766e' }}>
                            {cd.dayNum}
                          </span>
                          <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                            ({cd.dateStr.slice(5)})
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                            {cd.dayInfo.label}
                          </span>
                        </div>
                        <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {data.totalWorking} موظف
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                        {data.shiftGroups.map((sg, idx) => (
                          <div key={idx} style={{ background: '#fff', padding: '4px 6px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}>
                            <div style={{ fontWeight: 800, color: '#0369a1', fontSize: '10.5px', direction: 'ltr', textAlign: 'right' }}>
                              ⏱️ {formatShiftRange12H(sg.start, sg.end)} ({sg.staff.length})
                            </div>
                            <div style={{ color: '#334155', fontSize: '10px', marginTop: '1px' }}>
                              {sg.staff.map(s => s.employee.name).join('، ')}
                            </div>
                          </div>
                        ))}
                        {data.offStaff.length > 0 && (
                          <div style={{ fontSize: '10px', color: '#92400e', background: '#fef3c7', padding: '3px 6px', borderRadius: '4px' }}>
                            🏖️ راحة: {data.offStaff.map(s => s.employee.name.split(' ')[0]).join('، ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── High-Res Isolated Print Preview Modal ── */}
      {isPrintModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content card" style={{ maxWidth: '1150px', width: '96%', padding: '24px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid #0f766e', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f766e', fontSize: '18px', fontWeight: 800 }}>
                  🖨️ معاينة وطباعة جدول تشغيل الفرع A4
                </h3>
                <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  الفرع: <strong>{currentBranch?.name}</strong> | الدورة: <strong>{cycleRange?.label || monthLabel(selectedMonth).arabic}</strong>
                </span>
              </div>

              {/* Layout Switcher Tabs */}
              <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: '3px', borderRadius: '10px', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setPrintLayout('board')}
                  style={{
                    border: 'none',
                    background: printLayout === 'board' ? '#0f766e' : 'transparent',
                    color: printLayout === 'board' ? '#fff' : '#475569',
                    padding: '5px 14px',
                    borderRadius: '7px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: printLayout === 'board' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  📊 خريطة الورديات (الرسمية)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('matrix')}
                  style={{
                    border: 'none',
                    background: printLayout === 'matrix' ? '#0f766e' : 'transparent',
                    color: printLayout === 'matrix' ? '#fff' : '#475569',
                    padding: '5px 14px',
                    borderRadius: '7px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: printLayout === 'matrix' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  📋 مصفوفة الموظفين
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={() => handlePrint()}
                  style={{
                    fontSize: '13px',
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #0f766e, #0d9488)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(15, 118, 110, 0.25)'
                  }}
                >
                  🖨️ طباعة الآن (Print A4)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsPrintModalOpen(false)}
                  style={{ fontSize: '13px', padding: '8px 14px', borderRadius: '8px' }}
                >
                  ✕ إغلاق
                </button>
              </div>
            </div>

            {/* Live Visual Preview Container */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
              <div style={{ textAlign: 'center', marginBottom: '14px', borderBottom: '2px solid #0f766e', paddingBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '17px', color: '#0f172a', fontWeight: 900 }}>
                  {printLayout === 'board' ? 'خريطة الورديات الأسبوعية وتوزيع الكادر التشغيلي' : 'مصفوفة مواعيد وورديات العمل الرسمية'} — فرع {currentBranch?.name}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#475569' }}>
                  دورة التشغيل: {cycleRange?.label || monthLabel(selectedMonth).arabic} | تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}
                </p>
              </div>

              {printLayout === 'board' ? (
                /* 7 Days Preview Columns */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', alignItems: 'stretch' }}>
                  {DAYS_OF_WEEK.map(day => {
                    const dayData = dayRosterMap[day.key];
                    const isFriday = day.key === 'friday';

                    return (
                      <div
                        key={day.key}
                        style={{
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#fff',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        <div style={{ background: isFriday ? '#fef3c7' : '#f0fdf4', padding: '6px 8px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, fontSize: '12px', color: isFriday ? '#92400e' : '#166534' }}>
                            {day.label}
                          </span>
                          <span style={{ fontSize: '9px', background: '#fff', padding: '1px 5px', borderRadius: '6px', fontWeight: 700, color: '#166534' }}>
                            🟢 {dayData.totalWorking}
                          </span>
                        </div>

                        <div style={{ padding: '6px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {dayData.shiftGroups.map((sg, idx) => (
                            <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 800, color: '#0f766e', direction: 'ltr', textAlign: 'right' }}>
                                ⏱️ {formatShiftRange12H(sg.start, sg.end)}
                              </div>
                              <div style={{ fontSize: '9.5px', color: '#334155', marginTop: '2px' }}>
                                {sg.staff.map(s => s.employee.name).join('، ')}
                              </div>
                            </div>
                          ))}
                          {dayData.offStaff.length > 0 && (
                            <div style={{ fontSize: '9px', color: '#92400e', background: '#fffbeb', padding: '3px 4px', borderRadius: '4px' }}>
                              🏖️ راحة: {dayData.offStaff.map(s => s.employee.name.split(' ')[0]).join('، ')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Matrix Table Preview */
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ border: '1px solid #cbd5e1', padding: '6px', width: '18%', textAlign: 'right' }}>الموظف / الوظيفة</th>
                      {DAYS_OF_WEEK.map(d => (
                        <th key={d.key} style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{d.label}</th>
                      ))}
                      <th style={{ border: '1px solid #cbd5e1', padding: '6px', width: '9%' }}>إجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffSchedules.map(({ employee, schedule, isApproved, totalWeeklyHours, workDaysCount }) => {
                      const isPharm = (employee.jobTitle || '').includes('صيدل');
                      return (
                        <tr key={employee.id}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'right', fontWeight: 'bold' }}>
                            <div>{getEmpDisplayName(employee)} {isPharm && <span style={{ color: '#166534', fontSize: '9px' }}>[صيدلي]</span>}</div>
                            <div style={{ fontSize: '9.5px', color: '#64748b' }}>{employee.jobTitle || 'موظف'}</div>
                          </td>
                          {DAYS_OF_WEEK.map(d => {
                            if (!isApproved || !schedule) {
                              return <td key={d.key} style={{ border: '1px solid #cbd5e1', padding: '4px', color: '#94a3b8', fontSize: '9.5px' }}>غير معتمد</td>;
                            }
                            const dInfo = schedule[d.label];
                            const isShift = dInfo && dInfo.type === 'shift' && dInfo.start && dInfo.end;
                            return (
                              <td key={d.key} style={{ border: '1px solid #cbd5e1', padding: '4px', background: isShift ? '#f0fdf4' : '#fffbeb' }}>
                                {isShift ? (
                                  <div style={{ fontWeight: 'bold', color: '#166534', direction: 'ltr', fontSize: '10px' }}>
                                    {formatShiftRange12H(dInfo.start, dInfo.end)}
                                  </div>
                                ) : (
                                  <div style={{ color: '#92400e', fontWeight: 'bold', fontSize: '10px' }}>راحة</div>
                                )}
                              </td>
                            );
                          })}
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontWeight: 'bold', color: '#0f766e' }}>
                            {totalWeeklyHours} س
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Signatures Preview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px', paddingTop: '10px', borderTop: '1px solid #cbd5e1', textAlign: 'center', fontSize: '11px', color: '#475569' }}>
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>توقيع مدير الفرع</div>
                  <div>........................................</div>
                </div>
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>اعتماد الموارد البشرية (HR)</div>
                  <div>........................................</div>
                </div>
                <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>اعتماد الإدارة العليا</div>
                  <div>........................................</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

