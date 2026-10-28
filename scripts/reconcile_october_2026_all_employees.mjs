import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  isVariableScheduleEmployee,
  getScheduledShiftForDate,
  computeLatenessFinancialAmount,
  recalculateEmployeeCycleLateness,
  reconcileEmployeeScheduleOrPunchChange,
  getEffectiveLatePolicy
} from '../src/utils/latePenaltyEngine.js';
import { calculateShiftMetrics } from '../src/utils/workHoursEngine.js';
import { getEmployeeDaySchedule } from '../src/utils/rosterEngine.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const apiUrl = process.env.VITE_API_URL || 'https://169-58-214-20.sslip.io/api';

async function runOctoberRecalculation() {
  console.log('========================================================================');
  console.log('🚀 محرك التدقيق وإعادة الاحتساب الشامل لشهر أكتوبر 2026 لجميع موظفي المنظومة');
  console.log(`🔗 الاتصال بسيرفر الإنتاج: ${apiUrl}`);
  console.log('========================================================================\n');

  // 1. جلب الحالة الكاملة الحية من السيرفر
  console.log('1. جلب أحدث بيانات النظام من السيرفر...');
  const res = await fetch(`${apiUrl}/settings?key=pharmacy-tracker-data`, {
    headers: { 'Cache-Control': 'no-cache' }
  });
  const json = await res.json();
  if (!json.success || !json.value) {
    throw new Error('فشل جلب بيانات النظام من السيرفر: ' + JSON.stringify(json));
  }

  const state = json.value;

  // 2. أخذ نسخة احتياطية محلية فورية قبل أي تعديل
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `backup_before_oct2026_master_recalc_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(state, null, 2), 'utf8');
  console.log(`✅ تم إنشاء نسخة احتياطية آمنة في: ${backupPath}\n`);

  const employees = state.employees || [];
  const initialShifts = state.shifts || [];
  const initialLateIncidents = state.lateIncidents || [];
  const initialRequests = state.requests || [];
  const initialRosters = state.rosters || [];

  console.log(`📊 إحصائيات النظام الحالية:`);
  console.log(`   - إجمالي الموظفين: ${employees.length}`);
  console.log(`   - إجمالي الجداول الشهرية المسجلة: ${initialRosters.length}`);
  console.log(`   - إجمالي الشفتات: ${initialShifts.length}`);
  console.log(`   - إجمالي وقائع التأخير: ${initialLateIncidents.length}`);
  console.log(`   - إجمالي الطلبات: ${initialRequests.length}\n`);

  let currentState = { ...state };
  const auditReport = [];
  let totalEliminatedIncidents = 0;
  let totalWaivedMinutes = 0;
  let totalWaivedAmount = 0;
  let totalConfirmedActiveIncidents = 0;
  let totalConfirmedPenaltyMinutes = 0;
  let totalConfirmedPenaltyAmount = 0;
  let totalOvertimeHoursOct = 0;
  let totalReconciledShiftsOct = 0;

  console.log('2. بدء تدقيق ومطابقة شفتات وبصمات أكتوبر 2026 مع الجداول الشهرية...');

  for (let idx = 0; idx < employees.length; idx++) {
    const emp = employees[idx];
    const empIdStr = String(emp.id || '').trim();
    const empCodeStr = emp.code ? String(emp.code).trim() : '';
    const isFlex = isVariableScheduleEmployee(emp);

    // شفتات شهر أكتوبر للموظف
    const empOctShifts = (currentState.shifts || []).filter(s => {
      if (!s) return false;
      const isMatch = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr);
      if (!isMatch) return false;
      const d = s.date || '';
      return d.startsWith('2026-10') || s.month === '2026-10';
    });

    // جمع التواريخ المتأثرة في أكتوبر
    const octDates = Array.from(new Set(empOctShifts.map(s => s.date).filter(Boolean)));

    // وقائع التأخير السابقة للموظف لشهر أكتوبر
    const prevOctIncidents = (currentState.lateIncidents || []).filter(inc => {
      if (!inc) return false;
      const isMatch = String(inc.employeeId) === empIdStr || (empCodeStr && String(inc.employeeCode) === empCodeStr);
      if (!isMatch) return false;
      const d = inc.date || '';
      return d.startsWith('2026-10') || inc.month === '2026-10';
    });

    const prevActiveOctIncidents = prevOctIncidents.filter(
      i => i.status !== 'cancelled' && !i.isCancelled && i.actionType !== 'grace' && (parseFloat(i.deductionMinutes) || 0) > 0
    );

    // استدعاء محرك التسوية الشامل
    const { updatedState: reconciledState, summary } = reconcileEmployeeScheduleOrPunchChange({
      employeeId: emp.id,
      state: currentState,
      changedDates: octDates.length > 0 ? octDates : undefined,
      options: {
        reason: 'إعادة احتساب شاملة لشهر أكتوبر 2026 وفق الجدول الشهري المعتمد ولائحة الجزاءات',
        clearPenaltiesOnChangedDates: false
      }
    });

    currentState = reconciledState;

    // الوقائع الجديدة المؤكدة للموظف في أكتوبر
    const newOctIncidents = (currentState.lateIncidents || []).filter(inc => {
      if (!inc) return false;
      const isMatch = String(inc.employeeId) === empIdStr || (empCodeStr && String(inc.employeeCode) === empCodeStr);
      if (!isMatch) return false;
      const d = inc.date || '';
      return d.startsWith('2026-10') || inc.month === '2026-10';
    });

    const newActiveOctIncidents = newOctIncidents.filter(
      i => i.status !== 'cancelled' && !i.isCancelled && i.actionType !== 'grace' && (parseFloat(i.deductionMinutes) || 0) > 0
    );

    // حساب إجمالي ساعات الإضافي لشهر أكتوبر بعد التسوية
    const empReconciledOctShifts = (currentState.shifts || []).filter(s => {
      if (!s) return false;
      const isMatch = String(s.employeeId) === empIdStr || (empCodeStr && String(s.employeeCode) === empCodeStr);
      if (!isMatch) return false;
      const d = s.date || '';
      return d.startsWith('2026-10') || s.month === '2026-10';
    });

    let empOtHours = 0;
    empReconciledOctShifts.forEach(s => {
      const ot = parseFloat(s.overtimeHours) || 0;
      if (ot > 0 && (s.isOvertimeApproved || s.overtimeStatus === 'approved')) {
        empOtHours += ot;
      }
    });

    let empActivePenMins = 0;
    let empActivePenAmt = 0;
    newActiveOctIncidents.forEach(inc => {
      empActivePenMins += parseFloat(inc.deductionMinutes) || 0;
      empActivePenAmt += parseFloat(inc.penaltyAmount) || 0;
    });

    totalEliminatedIncidents += summary.eliminatedIncidentsCount || 0;
    totalWaivedMinutes += summary.waivedDeductionMinutes || 0;
    totalWaivedAmount += summary.waivedAmount || 0;
    totalConfirmedActiveIncidents += newActiveOctIncidents.length;
    totalConfirmedPenaltyMinutes += empActivePenMins;
    totalConfirmedPenaltyAmount += empActivePenAmt;
    totalOvertimeHoursOct += empOtHours;
    totalReconciledShiftsOct += empReconciledOctShifts.length;

    auditReport.push({
      id: emp.id,
      code: emp.code,
      name: emp.name,
      jobTitle: emp.jobTitle || 'موظف',
      branch: emp.branchName || emp.branchId || '—',
      isFlex,
      octShiftsCount: empReconciledOctShifts.length,
      overtimeHours: empOtHours,
      prevActiveIncidentsCount: prevActiveOctIncidents.length,
      newActiveIncidentsCount: newActiveOctIncidents.length,
      eliminatedCount: summary.eliminatedIncidentsCount || 0,
      waivedMinutes: summary.waivedDeductionMinutes || 0,
      waivedAmount: summary.waivedAmount || 0,
      confirmedPenaltyMinutes: empActivePenMins,
      confirmedPenaltyAmount: empActivePenAmt,
      activeIncidents: newActiveOctIncidents.map(inc => ({
        date: inc.date,
        punchIn: inc.actualPunchInTime,
        schedStart: inc.scheduledStartTime,
        lateMinutes: inc.lateMinutes,
        tier: inc.tierName,
        deductionMinutes: inc.deductionMinutes,
        penaltyAmount: inc.penaltyAmount
      }))
    });
  }

  console.log('------------------------------------------------------------------------');
  console.log('📋 تقرير الفحص والتدقيق الفردي لشهر أكتوبر 2026:');
  console.log('------------------------------------------------------------------------');
  auditReport.forEach(r => {
    console.log(`[كود ${r.code || '—'}] ${r.name} (${r.jobTitle} - ${r.branch}):`);
    if (r.isFlex) {
      console.log(`   ✨ نظام دوام حر / بدون جدول: معفى تماماً من التأخيرات (0 مخالفات).`);
    } else {
      console.log(`   شفتات أكتوبر: ${r.octShiftsCount} | ساعات إضافي معتمد: ${r.overtimeHours.toFixed(1)} س`);
      console.log(`   جزاءات سابقة: ${r.prevActiveIncidentsCount} | مخالفات مؤكدة بعد إعادة الاحتساب: ${r.newActiveIncidentsCount}`);
      if (r.eliminatedCount > 0) {
        console.log(`   🎯 تم إسقاط ${r.eliminatedCount} مخالفة ملغاة / غير مستحقة (${r.waivedMinutes} دقيقة خصم، وفر ${r.waivedAmount.toFixed(2)} ج.م)`);
      }
      if (r.activeIncidents.length > 0) {
        console.log(`   ⚠️ المخالفات النظامية الثابتة وفق اللائحة:`);
        r.activeIncidents.forEach(inc => {
          console.log(`      - ${inc.date}: حضور ${inc.punchIn} (جدول: ${inc.schedStart}) | تأخير ${inc.lateMinutes} د | جزاء ${inc.deductionMinutes} د (${inc.penaltyAmount} ج.م) [${inc.tier}]`);
        });
      } else {
        console.log(`   ✅ لا توجد أي مخالفات تأخير - الحضور متطابق 100% مع الجدول.`);
      }
    }
    console.log('');
  });

  console.log('========================================================================');
  console.log('📊 ملخص النتائج العامة لإعادة الاحتساب لشهر أكتوبر 2026:');
  console.log('========================================================================');
  console.log(`- إجمالي الشفتات التي تمت مطابقتها وتحديثها: ${totalReconciledShiftsOct}`);
  console.log(`- إجمالي ساعات العمل الإضافي المعتمد لشهر أكتوبر: ${totalOvertimeHoursOct.toFixed(1)} ساعة`);
  console.log(`- إجمالي المخالفات المسقطة لعدم الاستحقاق: ${totalEliminatedIncidents}`);
  console.log(`- إجمالي دقائق الخصم المسقطة: ${totalWaivedMinutes} دقيقة`);
  console.log(`- إجمالي المبالغ المسقطة: ${totalWaivedAmount.toFixed(2)} ج.م`);
  console.log(`- إجمالي المخالفات النظامية المؤكدة المتبقية: ${totalConfirmedActiveIncidents}`);
  console.log(`- إجمالي دقائق الخصم المؤكدة: ${totalConfirmedPenaltyMinutes} دقيقة`);
  console.log(`- إجمالي مبالغ الجزاءات المؤكدة: ${totalConfirmedPenaltyAmount.toFixed(2)} ج.م`);
  console.log('========================================================================\n');

  // 4. حفظ البيانات المعتمدة والمدققة نهائياً على سيرفر VPS
  console.log('3. حفظ واعتماد الحالة المدققة على السيرفر (Atomic Update)...');
  const postRes = await fetch(`${apiUrl}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123',
      'x-device-token': 'desktop-app-sync-token-2026',
      'x-app-version': '1.2.69'
    },
    body: JSON.stringify({ key: 'pharmacy-tracker-data', value: currentState })
  });

  const postJson = await postRes.json();
  if (!postJson.success) {
    throw new Error('فشل حفظ البيانات المحدثة على السيرفر: ' + JSON.stringify(postJson));
  }

  console.log(`✅ تم الحفظ والاعتماد بنجاح تام! الإصدار الحالي: ${postJson.version || 'v1.2.69'}`);
  console.log('🎉 اكتملت عملية إعادة الاحتساب الشاملة بنجاح 100%!');
}

runOctoberRecalculation().catch(err => {
  console.error('❌ حدث خطأ غير متوقع أثناء إعادة الاحتساب:', err);
  process.exit(1);
});
