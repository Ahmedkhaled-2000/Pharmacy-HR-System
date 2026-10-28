const fs = require('fs');

const STATE_FILE = 'scratch_reconciled_full_state.json';
if (!fs.existsSync(STATE_FILE)) {
  console.error(`❌ File ${STATE_FILE} not found!`);
  process.exit(1);
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const empId = 'emp_1789231413527';

console.log('===========================================================');
console.log('🔧 RECONCILING & PURGING EMP 107 PENALTY SUPPRESSIONS');
console.log('===========================================================');

// 1. Remove any tombstones in _deletedIds that target emp 107's late incidents or requests
const originalDeletedCount = (state._deletedIds || []).length;
state._deletedIds = (state._deletedIds || []).filter(id => {
  const s = String(id);
  // Keep tombstones that do NOT belong to emp 107's 13 penalty dates
  if (s.includes(empId) || s.includes('1789231413527')) {
    // Only remove tombstones for the penalty dates
    const targetDates = [
      '2026-09-22', '2026-09-24', '2026-09-26', '2026-09-27',
      '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-03',
      '2026-10-11', '2026-10-12', '2026-10-18', '2026-10-19'
    ];
    const isTargetDate = targetDates.some(d => s.includes(d));
    if (isTargetDate) {
      console.log(`   🗑️ Removed stale tombstone from _deletedIds: ${s}`);
      return false;
    }
  }
  return true;
});
console.log(`✅ Cleaned _deletedIds: reduced from ${originalDeletedCount} to ${state._deletedIds.length}`);

// 2. Canonical definitions of all 13 incidents for emp 107
const canonical13 = [
  {
    id: `late_inc_${empId}_2026-09-22_1209`,
    reqId: `req_late_inc_${empId}_2026-09-22_1209`,
    date: '2026-09-22',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 69,
    deductionMinutes: 60,
    amount: 46.14,
    occurrenceNumber: 1,
    tierName: 'فئة أكثر من 60 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '12:09'
  },
  {
    id: `late_inc_${empId}_2026-09-24_1212`,
    reqId: `req_late_inc_${empId}_2026-09-24_1212`,
    date: '2026-09-24',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 72,
    deductionMinutes: 120,
    amount: 92.28,
    occurrenceNumber: 2,
    tierName: 'فئة أكثر من 60 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '12:12'
  },
  {
    id: `late_inc_${empId}_2026-09-26_1844`,
    reqId: `req_late_inc_${empId}_2026-09-26_1844`,
    date: '2026-09-26',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 44,
    deductionMinutes: 60,
    amount: 46.14,
    occurrenceNumber: 1,
    tierName: 'فئة 31 إلى 60 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:44'
  },
  {
    id: `late_inc_${empId}_2026-09-27_1119`,
    reqId: `req_late_inc_${empId}_2026-09-27_1119`,
    date: '2026-09-27',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 19,
    deductionMinutes: 30,
    amount: 23.07,
    occurrenceNumber: 1,
    tierName: 'فئة 16 إلى 30 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '11:19'
  },
  {
    id: `late_inc_${empId}_2026-09-27_1837`,
    reqId: `req_late_inc_${empId}_2026-09-27_1837`,
    date: '2026-09-27',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 37,
    deductionMinutes: 90,
    amount: 69.21,
    occurrenceNumber: 2,
    tierName: 'فئة 31 إلى 60 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:37'
  },
  {
    id: `late_inc_${empId}_2026-09-29_1215`,
    reqId: `req_late_inc_${empId}_2026-09-29_1215`,
    date: '2026-09-29',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 75,
    deductionMinutes: 180,
    amount: 138.42,
    occurrenceNumber: 3,
    tierName: 'فئة أكثر من 60 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '12:15'
  },
  {
    id: `late_inc_${empId}_2026-09-30_1402`,
    reqId: `req_late_inc_${empId}_2026-09-30_1402`,
    date: '2026-09-30',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 182,
    deductionMinutes: 240,
    amount: 184.56,
    occurrenceNumber: 4,
    tierName: 'فئة أكثر من 60 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '14:02'
  },
  {
    id: `late_inc_${empId}_2026-10-01_1209`,
    reqId: `req_late_inc_${empId}_2026-10-01_1209`,
    date: '2026-10-01',
    branchId: 'branch_1789241578010', // Medina
    branchName: 'المدينه الجامعيه - عزبه سعد',
    lateMinutes: 69,
    deductionMinutes: 300,
    amount: 230.70,
    occurrenceNumber: 5,
    tierName: 'فئة أكثر من 60 دقيقة',
    scheduledStartTime: '11:00',
    actualPunchInTime: '12:09'
  },
  {
    id: `late_inc_${empId}_2026-10-03_1824`,
    reqId: `req_late_inc_${empId}_2026-10-03_1824`,
    date: '2026-10-03',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 24,
    deductionMinutes: 60,
    amount: 46.14,
    occurrenceNumber: 4,
    tierName: 'فئة 16 إلى 30 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:24'
  },
  {
    id: `late_inc_${empId}_2026-10-11_1841`,
    reqId: `req_late_inc_${empId}_2026-10-11_1841`,
    date: '2026-10-11',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 41,
    deductionMinutes: 90,
    amount: 69.21,
    occurrenceNumber: 4,
    tierName: 'فئة 31 إلى 60 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:41'
  },
  {
    id: `late_inc_${empId}_2026-10-12_1825`,
    reqId: `req_late_inc_${empId}_2026-10-12_1825`,
    date: '2026-10-12',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 25,
    deductionMinutes: 60,
    amount: 46.14,
    occurrenceNumber: 5,
    tierName: 'فئة 16 إلى 30 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:25'
  },
  {
    id: `late_inc_${empId}_2026-10-18_1817`,
    reqId: `req_late_inc_${empId}_2026-10-18_1817`,
    date: '2026-10-18',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 17,
    deductionMinutes: 120,
    amount: 92.28,
    occurrenceNumber: 6,
    tierName: 'فئة 16 إلى 30 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:17'
  },
  {
    id: `late_inc_${empId}_2026-10-19_1826`,
    reqId: `req_late_inc_${empId}_2026-10-19_1826`,
    date: '2026-10-19',
    branchId: 'branch_1789142992139', // Komi
    branchName: 'منار الكومي-الحضره الجديده',
    lateMinutes: 26,
    deductionMinutes: 120,
    amount: 92.28,
    occurrenceNumber: 7,
    tierName: 'فئة 16 إلى 30 دقيقة',
    scheduledStartTime: '18:00',
    actualPunchInTime: '18:26'
  }
];

// 3. Ensure all 13 incidents exist in state.lateIncidents with pristine approved status
if (!Array.isArray(state.lateIncidents)) state.lateIncidents = [];
for (const item of canonical13) {
  let existing = state.lateIncidents.find(i => String(i.id) === item.id || (String(i.employeeId) === empId && i.date === item.date && String(i.branchId) === item.branchId));
  if (existing) {
    existing.id = item.id;
    existing.employeeId = empId;
    existing.employeeName = 'عبد الرحمن حسام الدين جلال مرسي محمد بكر';
    existing.employeeCode = '107';
    existing.branchId = item.branchId;
    existing.branchName = item.branchName;
    existing.date = item.date;
    existing.lateMinutes = item.lateMinutes;
    existing.deductionMinutes = item.deductionMinutes;
    existing.penaltyAmount = item.amount;
    existing.occurrenceNumber = item.occurrenceNumber;
    existing.tierName = item.tierName;
    existing.scheduledStartTime = item.scheduledStartTime;
    existing.actualPunchInTime = item.actualPunchInTime;
    existing.actionType = 'deduction';
    existing.actionLabel = `خصم ${item.deductionMinutes} دقيقة`;
    existing.status = 'approved';
    existing.isCancelled = false;
    existing.adminApproved = true;
    existing.objection = null;
  } else {
    state.lateIncidents.push({
      id: item.id,
      employeeId: empId,
      employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
      employeeCode: '107',
      branchId: item.branchId,
      branchName: item.branchName,
      date: item.date,
      lateMinutes: item.lateMinutes,
      deductionMinutes: item.deductionMinutes,
      penaltyAmount: item.amount,
      occurrenceNumber: item.occurrenceNumber,
      tierName: item.tierName,
      scheduledStartTime: item.scheduledStartTime,
      actualPunchInTime: item.actualPunchInTime,
      actionType: 'deduction',
      actionLabel: `خصم ${item.deductionMinutes} دقيقة`,
      status: 'approved',
      isCancelled: false,
      adminApproved: true,
      objection: null,
      createdAt: `${item.date}T${item.actualPunchInTime || '12:00'}:00.000Z`
    });
  }
}

// 4. Ensure all 13 requests exist in state.requests with pristine approved status
if (!Array.isArray(state.requests)) state.requests = [];
// Clean out any conflicting objections for emp 107
state.requests = state.requests.filter(r => {
  if (String(r.employeeId) === empId && (r.type === 'penalty_objection' || r.type === 'objection' || String(r.id).startsWith('obj_'))) {
    console.log(`   🚫 Purging conflicting objection request for Emp 107: ${r.id} (${r.date})`);
    return false;
  }
  return true;
});

for (const item of canonical13) {
  let existingReq = state.requests.find(r => String(r.id) === item.reqId || (String(r.employeeId) === empId && r.date === item.date && String(r.branchId) === item.branchId && (r.subType === 'lateness' || r.type === 'penalty')));
  const reasonText = `تأخر الموظف بمقدار ${item.lateMinutes} دقيقة عن موعد ورديته المحدد (${item.scheduledStartTime}). المرة رقم ${item.occurrenceNumber} في ${item.tierName}. خصم ${item.deductionMinutes >= 60 ? (item.deductionMinutes / 60) + ' ساعة' : item.deductionMinutes + ' دقيقة'} (${item.deductionMinutes} دقيقة) | دقائق الخصم: ${item.deductionMinutes} دقيقة`;
  
  if (existingReq) {
    existingReq.id = item.reqId;
    existingReq.employeeId = empId;
    existingReq.employeeName = 'عبد الرحمن حسام الدين جلال مرسي محمد بكر';
    existingReq.employeeCode = '107';
    existingReq.branchId = item.branchId;
    existingReq.branchName = item.branchName;
    existingReq.date = item.date;
    existingReq.type = 'penalty';
    existingReq.subType = 'lateness';
    existingReq.status = 'approved';
    existingReq.isCancelled = false;
    existingReq.adminApproved = true;
    existingReq.objection = null;
    existingReq.amount = item.amount;
    existingReq.penaltyAmount = item.amount;
    existingReq.latenessMinutes = item.lateMinutes;
    existingReq.deductionMinutes = item.deductionMinutes;
    existingReq.ruleTitle = reasonText;
    existingReq.reason = reasonText;
    existingReq.actionTitle = `خصم ${item.deductionMinutes} دقيقة`;
  } else {
    state.requests.push({
      id: item.reqId,
      employeeId: empId,
      employeeName: 'عبد الرحمن حسام الدين جلال مرسي محمد بكر',
      employeeCode: '107',
      branchId: item.branchId,
      branchName: item.branchName,
      date: item.date,
      type: 'penalty',
      subType: 'lateness',
      status: 'approved',
      isCancelled: false,
      adminApproved: true,
      objection: null,
      amount: item.amount,
      penaltyAmount: item.amount,
      latenessMinutes: item.lateMinutes,
      deductionMinutes: item.deductionMinutes,
      ruleTitle: reasonText,
      reason: reasonText,
      actionTitle: `خصم ${item.deductionMinutes} دقيقة`,
      createdAt: `${item.date}T${item.actualPunchInTime || '12:00'}:00.000Z`,
      source: 'late_penalty_engine'
    });
  }
}

// 5. Verification
const verifiedIncs = state.lateIncidents.filter(i => String(i.employeeId) === empId && i.status === 'approved' && !i.isCancelled);
const verifiedReqs = state.requests.filter(r => String(r.employeeId) === empId && r.status === 'approved' && !r.isCancelled && (r.subType === 'lateness' || r.type === 'penalty'));
const totalIncAmt = verifiedIncs.reduce((sum, i) => sum + (parseFloat(i.penaltyAmount) || 0), 0);
const totalReqAmt = verifiedReqs.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

console.log('\n===========================================================');
console.log(`✅ VERIFICATION SUMMARY FOR EMP 107:`);
console.log(`   - Active late incidents count: ${verifiedIncs.length} / 13`);
console.log(`   - Active late requests count:  ${verifiedReqs.length} / 13`);
console.log(`   - Total incident penalty:      ${totalIncAmt.toFixed(2)} EGP`);
console.log(`   - Total request penalty:       ${totalReqAmt.toFixed(2)} EGP`);
console.log('===========================================================');

if (verifiedIncs.length === 13 && verifiedReqs.length === 13) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  console.log(`💾 Saved updated state to ${STATE_FILE} successfully!`);
} else {
  console.error(`❌ Reconciliation counts mismatch! Aborting save.`);
  process.exit(1);
}
