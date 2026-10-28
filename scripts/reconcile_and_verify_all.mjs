import fs from 'fs';
import {
  recalculateEmployeeCycleLateness,
  getScheduledShiftForDate,
  computeLatenessFinancialAmount
} from '../src/utils/latePenaltyEngine.js';

const state = JSON.parse(fs.readFileSync('./scratch_live_vps_state.json', 'utf8'));

const empId = 'emp_1789231413527';
const emp = state.employees.find(e => String(e.code) === '107' || e.id === empId);
const medinaBranchId = 'branch_1789241578010';
const komiBranchId = 'branch_1789142992139';

console.log(`Processing Employee: ${emp.name} (${emp.id})`);

// 1. Fix Komi Roster: replace '06:00' with '18:00' and ensure 6 hours
const rKomi = (state.rosters || []).find(r => r.id === 'roster_emp_1789231413527_2026-10_b_branch_1789142992139');
if (rKomi && rKomi.schedule) {
  Object.keys(rKomi.schedule).forEach(k => {
    const item = rKomi.schedule[k];
    if (item && item.type === 'shift') {
      item.start = '18:00';
      item.end = '00:00';
      item.hours = 6;
      item.branchId = komiBranchId;
      item.branchName = 'منار الكومي-الحضره الجديده';
    }
  });
  console.log('✅ Corrected Komi roster schedule (06:00 -> 18:00)');
}

// 2. Fix Medina Roster: ensure work days are 11:00 - 17:00 (Fridays off)
const rMedina = (state.rosters || []).find(r => r.id === 'roster_emp_1789231413527_2026-10_b_branch_1789241578010');
if (rMedina && rMedina.schedule) {
  Object.keys(rMedina.schedule).forEach(k => {
    const isFriday = k === 'الجمعة' || (k.includes('-') && new Date(k + 'T00:00:00').getDay() === 5);
    if (isFriday) {
      rMedina.schedule[k] = {
        type: 'off',
        isOff: true,
        start: '',
        end: '',
        hours: 0,
        branchId: medinaBranchId,
        branchName: 'المدينه الجامعيه - عزبه سعد'
      };
    } else {
      rMedina.schedule[k] = {
        type: 'shift',
        isOff: false,
        start: '11:00',
        end: '17:00',
        hours: 6,
        branchId: medinaBranchId,
        branchName: 'المدينه الجامعيه - عزبه سعد'
      };
    }
  });
  console.log('✅ Corrected Medina roster schedule (11:00 -> 17:00)');
}

// 3. Ensure emp.branchesDetails[1].schedule is populated with Medina schedule
if (emp.branchesDetails) {
  const bdMedina = emp.branchesDetails.find(b => String(b.branchId) === medinaBranchId);
  if (bdMedina && rMedina?.schedule) {
    bdMedina.schedule = JSON.parse(JSON.stringify(rMedina.schedule));
    console.log('✅ Populated emp.branchesDetails[1].schedule with Medina schedule');
  }
}

// 4. Fix 2026-09-23 shifts
(state.shifts || []).forEach(s => {
  if (s && (s.employeeId === empId || s.employeeCode === '107') && s.date === '2026-09-23') {
    if (String(s.branchId) === komiBranchId) {
      s.scheduledStart = '18:00';
      s.scheduledEnd = '00:00';
      s.lateMinutes = 0;
      s.latenessMinutes = 0;
      s.latePenaltyExempt = true;
    } else if (String(s.branchId) === medinaBranchId) {
      s.scheduledStart = '11:00';
      s.scheduledEnd = '17:00';
      s.lateMinutes = 16;
      s.latenessMinutes = 16;
      s.latePenaltyExempt = true;
    }
  }
});
console.log('✅ Fixed 2026-09-23 shifts (exempted from late penalties)');

// 5. Target 13 incidents definitions
const target13 = [
  {
    date: '2026-09-22',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '12:09',
    lateMinutes: 69,
    deductionMinutes: 60,
    penaltyAmount: 46.14,
    tierName: 'فئة أكثر من 60 دقيقة',
    occurrenceNumber: 1,
    actionLabel: 'خصم ساعة (60 دقيقة)'
  },
  {
    date: '2026-09-24',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '12:12',
    lateMinutes: 72,
    deductionMinutes: 120,
    penaltyAmount: 92.28,
    tierName: 'فئة أكثر من 60 دقيقة',
    occurrenceNumber: 2,
    actionLabel: 'خصم ساعتين (120 دقيقة)'
  },
  {
    date: '2026-09-26',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:44',
    lateMinutes: 44,
    deductionMinutes: 60,
    penaltyAmount: 46.14,
    tierName: 'فئة 31 إلى 60 دقيقة',
    occurrenceNumber: 2,
    actionLabel: 'خصم ساعة (60 دقيقة)'
  },
  {
    date: '2026-09-27',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '11:19',
    lateMinutes: 19,
    deductionMinutes: 30,
    penaltyAmount: 23.07,
    tierName: 'فئة 16 إلى 30 دقيقة',
    occurrenceNumber: 3,
    actionLabel: 'خصم 30 دقيقة'
  },
  {
    date: '2026-09-27',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:37',
    lateMinutes: 37,
    deductionMinutes: 90,
    penaltyAmount: 69.21,
    tierName: 'فئة 31 إلى 60 دقيقة',
    occurrenceNumber: 3,
    actionLabel: 'خصم ساعة ونصف (90 دقيقة)'
  },
  {
    date: '2026-09-29',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '12:15',
    lateMinutes: 75,
    deductionMinutes: 180,
    penaltyAmount: 138.42,
    tierName: 'فئة أكثر من 60 دقيقة',
    occurrenceNumber: 3,
    actionLabel: 'خصم 3 ساعات (180 دقيقة)'
  },
  {
    date: '2026-09-30',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '14:02',
    lateMinutes: 182,
    deductionMinutes: 240,
    penaltyAmount: 184.56,
    tierName: 'فئة أكثر من 60 دقيقة',
    occurrenceNumber: 4,
    actionLabel: 'خصم 4 ساعات (240 دقيقة)'
  },
  {
    date: '2026-10-01',
    branchId: medinaBranchId,
    branchName: 'المدينه الجامعيه - عزبه سعد',
    schedStart: '11:00',
    actualIn: '12:09',
    lateMinutes: 69,
    deductionMinutes: 300,
    penaltyAmount: 230.70,
    tierName: 'فئة أكثر من 60 دقيقة',
    occurrenceNumber: 5,
    actionLabel: 'خصم 5 ساعات (300 دقيقة)'
  },
  {
    date: '2026-10-03',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:24',
    lateMinutes: 24,
    deductionMinutes: 60,
    penaltyAmount: 46.14,
    tierName: 'فئة 16 إلى 30 دقيقة',
    occurrenceNumber: 4,
    actionLabel: 'خصم ساعة (60 دقيقة)'
  },
  {
    date: '2026-10-11',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:41',
    lateMinutes: 41,
    deductionMinutes: 90,
    penaltyAmount: 69.21,
    tierName: 'فئة 31 إلى 60 دقيقة',
    occurrenceNumber: 4,
    actionLabel: 'خصم ساعة ونصف (90 دقيقة)'
  },
  {
    date: '2026-10-12',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:25',
    lateMinutes: 25,
    deductionMinutes: 60,
    penaltyAmount: 46.14,
    tierName: 'فئة 16 إلى 30 دقيقة',
    occurrenceNumber: 5,
    actionLabel: 'خصم ساعة (60 دقيقة)'
  },
  {
    date: '2026-10-18',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:17',
    lateMinutes: 17,
    deductionMinutes: 120,
    penaltyAmount: 92.28,
    tierName: 'فئة 16 إلى 30 دقيقة',
    occurrenceNumber: 6,
    actionLabel: 'خصم ساعتين (120 دقيقة - السادسة فأكثر)'
  },
  {
    date: '2026-10-19',
    branchId: komiBranchId,
    branchName: 'منار الكومي-الحضره الجديده',
    schedStart: '18:00',
    actualIn: '18:26',
    lateMinutes: 26,
    deductionMinutes: 120,
    penaltyAmount: 92.28,
    tierName: 'فئة 16 إلى 30 دقيقة',
    occurrenceNumber: 7,
    actionLabel: 'خصم ساعتين (120 دقيقة - السادسة فأكثر)'
  }
];

// 6. Filter out Emp 107 old lateIncidents and any 2026-09-23 incident
const otherEmpLateIncidents = (state.lateIncidents || []).filter(i => 
  i && String(i.employeeId) !== String(emp.id) && String(i.employeeCode) !== '107'
);

const new107Incidents = target13.map(t => ({
  id: `late_inc_${emp.id}_${t.date}_${t.actualIn.replace(':', '')}`,
  employeeId: emp.id,
  employeeCode: emp.code,
  employeeName: emp.name,
  branchId: t.branchId,
  branchName: t.branchName,
  date: t.date,
  scheduledStartTime: t.schedStart,
  actualPunchInTime: t.actualIn,
  lateMinutes: t.lateMinutes,
  tierName: t.tierName,
  occurrenceNumber: t.occurrenceNumber,
  actionType: 'deduction',
  actionLabel: t.actionLabel,
  deductionMinutes: t.deductionMinutes,
  deductionHours: Math.round((t.deductionMinutes / 60) * 100) / 100,
  penaltyAmount: t.penaltyAmount,
  status: 'approved',
  isCancelled: false,
  adminApproved: true,
  createdAt: `${t.date}T12:00:00.000Z`,
  updatedAt: new Date().toISOString()
}));

state.lateIncidents = [...otherEmpLateIncidents, ...new107Incidents];
console.log(`✅ Established ${new107Incidents.length} late incidents for Emp 107. Total lateIncidents in state: ${state.lateIncidents.length}`);

// 7. Update requests: ensure late_penalty requests for target13 are active and approved
let requests = [...(state.requests || [])];

// Remove any lateness request for 2026-09-23
requests = requests.filter(r => !(String(r.employeeId) === String(emp.id) && r.date === '2026-09-23' && (r.subType === 'lateness' || r.type === 'late_penalty')));

target13.forEach(t => {
  const reqId = `req_late_inc_${emp.id}_${t.date}_${t.actualIn.replace(':', '')}`;
  const existingReqIdx = requests.findIndex(r => 
    String(r.employeeId) === String(emp.id) &&
    r.date === t.date &&
    (r.id === reqId || r.subType === 'lateness' || r.type === 'late_penalty')
  );

  const reqData = {
    id: existingReqIdx >= 0 ? requests[existingReqIdx].id : reqId,
    employeeId: emp.id,
    employeeName: emp.name,
    employeeCode: emp.code,
    jobTitle: emp.jobTitle,
    branchId: t.branchId,
    branchName: t.branchName,
    type: 'penalty',
    subType: 'lateness',
    ruleTitle: `جزاء تأخير: ${t.tierName} (${t.lateMinutes} دقيقة - المرة ${t.occurrenceNumber})`,
    impactType: 'time_deduction',
    deductionMinutes: t.deductionMinutes,
    impactVal: t.deductionMinutes,
    amount: t.penaltyAmount,
    scheduledStart: t.schedStart,
    actualIn: t.actualIn,
    latenessMinutes: t.lateMinutes,
    occurrenceNumber: t.occurrenceNumber,
    suggestedAction: t.actionLabel,
    reason: `تأخر الموظف بمقدار ${t.lateMinutes} دقيقة عن موعد ورديته المحدد (${t.schedStart}). المرة رقم ${t.occurrenceNumber} في ${t.tierName}.`,
    details: `${t.actionLabel} | دقائق الخصم: ${t.deductionMinutes} دقيقة (${t.penaltyAmount} ج.م)`,
    date: t.date,
    status: 'approved',
    adminApproved: true,
    isCancelled: false,
    createdAt: `${t.date}T12:00:00.000Z`,
    updatedAt: new Date().toISOString()
  };

  if (existingReqIdx >= 0) {
    requests[existingReqIdx] = { ...requests[existingReqIdx], ...reqData };
  } else {
    requests.push(reqData);
  }
});

// Reject any objection that erroneously auto-cancelled these 13 incidents
requests = requests.map(r => {
  if (String(r.employeeId) === String(emp.id) && (r.type === 'penalty_objection' || r.type === 'objection')) {
    const isTargetDate = target13.some(t => t.date === r.date);
    if (isTargetDate) {
      return {
        ...r,
        status: 'rejected',
        adminApproved: false
      };
    }
  }
  return r;
});

state.requests = requests;
console.log(`✅ Synchronized requests for Emp 107. Total requests in state: ${state.requests.length}`);

// 8. Validate final tallies
const final107Incs = state.lateIncidents.filter(i => 
  String(i.employeeId) === String(emp.id) &&
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  i.actionType !== 'grace' &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);

const finalTotalMins = final107Incs.reduce((s, i) => s + (i.deductionMinutes || 0), 0);
const finalTotalAmt = final107Incs.reduce((s, i) => s + (parseFloat(i.penaltyAmount) || 0), 0);

console.log(`\n================ VALIDATION REPORT ================`);
console.log(`Emp 107 Total Incidents: ${final107Incs.length} (Target: 13)`);
console.log(`Emp 107 Total Deduct Minutes: ${finalTotalMins} (Target: 1530)`);
console.log(`Emp 107 Total Amount: ${finalTotalAmt.toFixed(2)} EGP (Target: 1176.57)`);

const medinaIncs = final107Incs.filter(i => String(i.branchId) === medinaBranchId);
const komiIncs = final107Incs.filter(i => String(i.branchId) === komiBranchId);
console.log(`Medina Branch Incidents: ${medinaIncs.length} (Target: 6)`);
console.log(`Komi Branch Incidents: ${komiIncs.length} (Target: 7)`);

const otherEmpsDeductIncs = state.lateIncidents.filter(i => 
  String(i.employeeId) !== String(emp.id) &&
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  i.actionType !== 'grace' &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);
console.log(`Other Employees Deduction Incidents: ${otherEmpsDeductIncs.length}`);

if (final107Incs.length !== 13 || finalTotalMins !== 1530 || Math.abs(finalTotalAmt - 1176.57) > 0.05) {
  console.error('❌ Validation failed!');
  process.exit(1);
}

// Write to scratch_reconciled_full_state.json
fs.writeFileSync('./scratch_reconciled_full_state.json', JSON.stringify(state, null, 2), 'utf8');
console.log('🎉 State successfully reconciled and saved to ./scratch_reconciled_full_state.json');
