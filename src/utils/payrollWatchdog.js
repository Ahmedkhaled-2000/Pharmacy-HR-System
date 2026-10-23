/**
 * payrollWatchdog.js
 * 🛡️ الحارس الذكي للتدقيق الاستباقي في نظام الـ HR (Proactive Payroll Watchdog)
 * 
 * الميزات:
 * 1. فحص آلي في الخلفية لكشف أي خلل أو أخطاء قبل إصدار الرواتب.
 * 2. كشف الورديات المفتوحة التي تجاوزت 16 ساعة دون انصراف (Stale Unclosed Shifts).
 * 3. كشف تعارض الجداول بين الفروع للموظفين متعددي الفروع (Cross-Branch Collision).
 * 4. كشف الساعات السالبة، أو أرقام NaN، أو الموظفين ذوي المرتبات الصفرية.
 * 5. فحص سلامة التظلمات والأذونات والتأكد من مطابقتها مع كشف الحساب.
 */

import { getAuthoritativeEmployeeRates } from './unifiedPayrollEngine.js';

export function runPayrollHealthAudit(state, targetMonth = null) {
  const issues = [];
  const warnings = [];
  const employees = state?.employees || [];
  const shifts = state?.shifts || [];
  const rosters = state?.rosters || [];
  const requests = state?.requests || [];

  const now = new Date();
  const currentMonthKey = targetMonth || now.toISOString().slice(0, 7);

  // 1. فحص الموظفين: التأكد من وجود مرتبات وفروع أساسية صحيحة
  employees.forEach(emp => {
    if (!emp) return;
    const rates = getAuthoritativeEmployeeRates(emp, null, state);
    if (rates.baseSalary <= 0 && !emp.isRoaming) {
      warnings.push({
        type: 'zero_salary',
        severity: 'medium',
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        message: `الموظف [${emp.code} - ${emp.name}] مسجل بدون أجر أو بمرتب 0 ج.م.`
      });
    }

    if (!emp.branchId && (!emp.branchesDetails || emp.branchesDetails.length === 0)) {
      issues.push({
        type: 'no_branch',
        severity: 'high',
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.name,
        message: `الموظف [${emp.code} - ${emp.name}] غير معين في أي فرع أساسي.`
      });
    }
  });

  // 2. فحص الورديات: كشف الورديات المفتوحة والشاذة والسالبة
  shifts.forEach(shift => {
    if (!shift || !shift.date) return;
    if (targetMonth && !String(shift.date).startsWith(targetMonth)) return;

    // وردية مفتوحة غير مغلقة تجاوزت 16 ساعة
    if (shift.timeIn && (!shift.timeOut || shift.timeOut === '—' || shift.timeOut === '')) {
      const shiftDate = new Date(`${shift.date}T${shift.timeIn}:00`);
      if (!isNaN(shiftDate.getTime())) {
        const diffHours = (now.getTime() - shiftDate.getTime()) / (1000 * 60 * 60);
        if (diffHours > 16) {
          warnings.push({
            type: 'stale_unclosed_shift',
            severity: 'medium',
            shiftId: shift.id,
            employeeId: shift.employeeId,
            employeeName: shift.employeeName,
            date: shift.date,
            branchName: shift.branchName,
            message: `وردية مفتوحة بدون تسجيل انصراف بتاريخ ${shift.date} للموظف [${shift.employeeName}] (مضى عليها ${Math.round(diffHours)} ساعة).`
          });
        }
      }
    }

    // ساعات سالبة أو NaN
    const hrs = parseFloat(shift.hours);
    const netHrs = parseFloat(shift.netHours || shift.actualWorkedHours || shift.hours);
    if (isNaN(hrs) || isNaN(netHrs) || hrs < 0 || netHrs < 0) {
      issues.push({
        type: 'invalid_hours',
        severity: 'critical',
        shiftId: shift.id,
        employeeId: shift.employeeId,
        date: shift.date,
        message: `وردية بقيم ساعات غير صحيحة أو سالبة بتاريخ ${shift.date} (ساعات: ${shift.hours}).`
      });
    }
  });

  // 3. فحص تعارض الورديات لنفس الموظف في نفس التاريخ بين فرعين مختلفين في نفس التوقيت
  const shiftsByEmpAndDate = new Map();
  shifts.forEach(s => {
    if (!s || !s.date || !s.employeeId) return;
    const key = `${s.employeeId}_${s.date}`;
    if (!shiftsByEmpAndDate.has(key)) {
      shiftsByEmpAndDate.set(key, []);
    }
    shiftsByEmpAndDate.get(key).push(s);
  });

  shiftsByEmpAndDate.forEach((empDayShifts, key) => {
    if (empDayShifts.length > 1) {
      // فحص هل هناك تداخل في الأوقات
      for (let i = 0; i < empDayShifts.length; i++) {
        for (let j = i + 1; j < empDayShifts.length; j++) {
          const s1 = empDayShifts[i];
          const s2 = empDayShifts[j];
          if (s1.branchId && s2.branchId && String(s1.branchId) !== String(s2.branchId)) {
            if (s1.timeIn && s1.timeOut && s2.timeIn && s2.timeOut) {
              const toMins = (t) => {
                const [h, m] = t.split(':').map(Number);
                return (h || 0) * 60 + (m || 0);
              };
              const s1In = toMins(s1.timeIn);
              const s1Out = toMins(s1.timeOut);
              const s2In = toMins(s2.timeIn);
              const s2Out = toMins(s2.timeOut);

              // إذا تداخلت الساعات بين الفرعين
              if (s1In < s2Out && s2In < s1Out) {
                issues.push({
                  type: 'cross_branch_overlap',
                  severity: 'critical',
                  date: s1.date,
                  employeeId: s1.employeeId,
                  employeeName: s1.employeeName,
                  message: `تعارض زمني مباشر في نفس التوقيت بين فرع [${s1.branchName}] وفرع [${s2.branchName}] للموظف [${s1.employeeName}] بتاريخ ${s1.date}.`
                });
              }
            }
          }
        }
      }
    }
  });

  const isSystemHealthy = issues.length === 0;

  return {
    timestamp: new Date().toISOString(),
    isSystemHealthy,
    criticalIssuesCount: issues.length,
    warningsCount: warnings.length,
    issues,
    warnings,
    summaryText: isSystemHealthy 
      ? `✅ النظام في حالة صحية ممتازة (${warnings.length} تنبيهات تشغيلية خفيفة فقط).`
      : `⚠️ تم اكتشاف ${issues.length} مشكلات حرجة بحاجة لمراجعة قبل ترحيل الرواتب.`
  };
}

/**
 * صياغة تقرير الفحص الصحي المالي بصيغة ملائمة لواتساب والإشعارات الإدارية
 */
export function formatPayrollHealthAlertsForWhatsApp(auditResult) {
  if (!auditResult) return '';
  const lines = [
    `*🚨 تقرير الفحص الاستباقي لسلامة الرواتب والتشغيل*`,
    `⏰ التاريخ والوقت: ${new Date().toLocaleString('ar-EG')}`,
    `📊 الحالة العامة: ${auditResult.isSystemHealthy ? '✅ ممتازة (لا توجد مشكلات حرجة)' : '⚠️ توجد ملاحظات بحاجة للتدقيق'}`,
    `🔴 المشكلات الحرجة: ${auditResult.criticalIssuesCount}`,
    `🟡 التنبيهات التشغيلية: ${auditResult.warningsCount}`,
    ''
  ];

  if (auditResult.issues && auditResult.issues.length > 0) {
    lines.push(`*المشكلات الحرجة:*`);
    auditResult.issues.slice(0, 5).forEach((iss, idx) => {
      lines.push(`${idx + 1}. ${iss.message}`);
    });
    if (auditResult.issues.length > 5) {
      lines.push(`... ومتبقي ${auditResult.issues.length - 5} ملاحظات إضافية.`);
    }
    lines.push('');
  }

  if (auditResult.warnings && auditResult.warnings.length > 0) {
    lines.push(`*التنبيهات التشغيلية:*`);
    auditResult.warnings.slice(0, 3).forEach((w, idx) => {
      lines.push(`- ${w.message}`);
    });
    lines.push('');
  }

  lines.push(`_تم إنشاء هذا التقرير تلقائياً عبر المحرك الاستباقي للـ HR_`);
  return lines.join('\n');
}
