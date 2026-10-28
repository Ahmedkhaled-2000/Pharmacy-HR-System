import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./scratch_reconciled_full_state.json', 'utf8'));
const emp = (state.employees || []).find(e => String(e.code) === '107');

const targetEmpId = emp.id;
const isFlexibleScheduleEmp = Boolean(emp.noMonthlySchedule);

const empLateIncidents = isFlexibleScheduleEmp ? [] : (state.lateIncidents || []).filter(i => {
  if (!i) return false;
  if (String(i.employeeId) !== String(targetEmpId) && String(i.employeeCode) !== String(emp.code)) return false;
  if (i.status === 'cancelled' || i.isCancelled) return false;
  if (i.objection?.status === 'approved') return false;
  return true;
});

const empApprovedLateRequests = (state.requests || []).filter(r => {
  if (!r) return false;
  if (String(r.employeeId) !== String(targetEmpId) && String(r.employeeCode) !== String(emp.code)) return false;
  const isLateType = r.type === 'penalty' || r.type === 'late_penalty' || r.subType === 'lateness';
  if (!isLateType) return false;
  const isApp = (r.status === 'approved' || r.adminApproved === true) && !r.isCancelled && r.status !== 'cancelled' && r.status !== 'rejected';
  if (!isApp) return false;
  if (r.objection?.status === 'approved') return false;
  return true;
});

const matchedDatesOrReqIds = new Set();
let totalLateDedAmt = 0;
let totalLateDedMins = 0;
const lateIncidentsList = [];

empLateIncidents.forEach(inc => {
  const incIdStr = String(inc.id || '');
  const cleanId = incIdStr.replace(/^late_inc_/, '');
  const matchingReq = empApprovedLateRequests.find(r => 
    String(r.id) === `req_${incIdStr}` || 
    String(r.id) === `req_late_inc_${cleanId}` ||
    String(r.penaltyId) === incIdStr ||
    (r.date && r.date === inc.date && (!r.branchId || String(r.branchId) === String(inc.branchId)))
  );

  if (matchingReq) {
    matchedDatesOrReqIds.add(matchingReq.id);
    matchedDatesOrReqIds.add(`${matchingReq.date}_${matchingReq.branchId || ''}`);
  }

  const incAmt = parseFloat(inc.penaltyAmount) || 0;
  const reqAmt = matchingReq ? (parseFloat(matchingReq.amount) || 0) : 0;
  const effAmt = Math.max(incAmt, reqAmt);

  const incMins = parseFloat(inc.deductionMinutes) || 0;
  const reqMins = matchingReq ? (parseFloat(matchingReq.deductionMinutes || matchingReq.impactVal) || 0) : 0;
  const effMins = Math.max(incMins, reqMins);

  totalLateDedAmt += effAmt;
  totalLateDedMins += effMins;

  if (effMins > 0 || effAmt > 0) {
    lateIncidentsList.push({
      ...inc,
      deductionMinutes: effMins,
      penaltyAmount: effAmt
    });
  }
});

empApprovedLateRequests.forEach(req => {
  const reqKey = `${req.date}_${req.branchId || ''}`;
  if (!matchedDatesOrReqIds.has(req.id) && !matchedDatesOrReqIds.has(reqKey)) {
    const reqAmt = parseFloat(req.amount) || 0;
    const reqMins = parseFloat(req.deductionMinutes || req.impactVal) || 0;
    totalLateDedAmt += reqAmt;
    totalLateDedMins += reqMins;

    if (reqMins > 0 || reqAmt > 0) {
      lateIncidentsList.push({
        id: req.id,
        date: req.date,
        branchId: req.branchId || emp.branchId,
        branchName: req.branchName || 'الفرع الرئيسي',
        scheduledStartTime: req.scheduledTime || req.scheduledStartTime || '—',
        actualPunchInTime: req.actualTime || req.actualPunchInTime || '—',
        lateMinutes: req.lateMinutes || reqMins,
        tierName: req.tierName || 'جزاء تأخير معتمد',
        occurrenceNumber: req.occurrence || 1,
        actionLabel: req.actionLabel || `خصم ${reqMins} دقيقة`,
        deductionMinutes: reqMins,
        penaltyAmount: reqAmt,
        status: 'approved'
      });
    }
  }
});

lateIncidentsList.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

console.log('--- PAYROLL MODAL HEADER ---');
console.log(`إجمالي خصم التأخيرات: ${totalLateDedAmt.toFixed(2)} ج.م (${totalLateDedMins} دقيقة)`);
console.log(`عدد الوقائع في الجدول: ${lateIncidentsList.length} واقعة تأخير`);

console.log('\n--- TABLE ROWS RENDERED IN MODAL ---');
lateIncidentsList.forEach((inc, idx) => {
  console.log(`${idx+1}. ${inc.date} | ${inc.branchName} | موعد الشيفت: ${inc.scheduledStartTime} | الحضور الفعلي: ${inc.actualPunchInTime} | تأخير: ${inc.lateMinutes} د | ${inc.tierName} | المرة #${inc.occurrenceNumber} | ${inc.actionLabel} | دقائق الخصم: ${inc.deductionMinutes} د | مبلغ الخصم: -${inc.penaltyAmount} ج.م`);
});
