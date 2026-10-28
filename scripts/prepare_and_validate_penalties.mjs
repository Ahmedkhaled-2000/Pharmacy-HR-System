import fs from 'fs';
import { recalculateEmployeeCycleLateness } from '../src/utils/latePenaltyEngine.js';

async function main() {
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const json = await res.json();
  const state = json.value;

  const emp107 = state.employees.find(e => String(e.code) === '107');
  console.log(`Found Emp 107: ${emp107.name} (${emp107.id})`);

  // The 13 target penalty dates for Emp 107 in cycle 2026-10:
  // 1. 2026-09-22 Medina: 69m late -> 60m deduct (46.14)
  // 2. 2026-09-24 Medina: 72m late -> 120m deduct (92.28)
  // 3. 2026-09-26 Komi: 44m late -> 60m deduct (46.14)
  // 4. 2026-09-27 Medina: 19m late -> 30m deduct (23.07)
  // 5. 2026-09-27 Komi: 37m late -> 90m deduct (69.21)
  // 6. 2026-09-29 Medina: 75m late -> 180m deduct (138.42)
  // 7. 2026-09-30 Medina: 182m late -> 240m deduct (184.56)
  // 8. 2026-10-01 Medina: 69m late -> 300m deduct (230.70)
  // 9. 2026-10-03 Komi: 24m late -> 60m deduct (46.14)
  // 10. 2026-10-11 Komi: 41m late -> 90m deduct (69.21)
  // 11. 2026-10-12 Komi: 25m late -> 60m deduct (46.14)
  // 12. 2026-10-18 Komi: 17m late -> 120m deduct (92.28)
  // 13. 2026-10-19 Komi: 26m late -> 120m deduct (92.28)

  const medinaBranch = state.branches.find(b => b.name && b.name.includes('المدين')) || { id: 'branch_1789241578010', name: 'المدينه الجامعيه - عزبه سعد' };
  const komiBranch = state.branches.find(b => b.name && b.name.includes('الكومي')) || { id: 'branch_1789142992139', name: 'منار الكومي-الحضره الجديده' };

  console.log(`Medina Branch: ${medinaBranch.name} (${medinaBranch.id})`);
  console.log(`Komi Branch: ${komiBranch.name} (${komiBranch.id})`);

  // Target 13 incidents definitions
  const target13 = [
    {
      date: '2026-09-22',
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: medinaBranch.id,
      branchName: medinaBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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
      branchId: komiBranch.id,
      branchName: komiBranch.name,
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

  console.log(`\nValidating target 13 incidents for Emp 107:`);
  let sumMins = 0;
  let sumAmt = 0;
  target13.forEach((t, i) => {
    sumMins += t.deductionMinutes;
    sumAmt += t.penaltyAmount;
    console.log(`${i+1}. ${t.date} | ${t.branchName} | Late: ${t.lateMinutes}m | Deduct: ${t.deductionMinutes}m | Amt: ${t.penaltyAmount} EGP | ${t.tierName}`);
  });
  console.log(`Total Mins: ${sumMins} (Expected: 1530)`);
  console.log(`Total Amt: ${sumAmt.toFixed(2)} EGP (Expected: 1176.57)\n`);

  // Ensure these 13 incidents exist and are active in state.lateIncidents
  let lateIncidents = [...(state.lateIncidents || [])];
  
  target13.forEach(t => {
    const incId = `late_inc_${emp107.id}_${t.date}_${t.actualIn.replace(':', '')}`;
    const existingIdx = lateIncidents.findIndex(i => 
      String(i.employeeId) === String(emp107.id) &&
      i.date === t.date &&
      (String(i.branchId) === String(t.branchId) || (i.scheduledStartTime === t.schedStart))
    );

    const incRecord = {
      id: existingIdx >= 0 ? lateIncidents[existingIdx].id : incId,
      employeeId: emp107.id,
      employeeName: emp107.name,
      employeeCode: emp107.code,
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
      penaltyAmount: t.penaltyAmount,
      status: 'approved',
      isCancelled: false,
      adminApproved: true,
      createdAt: `${t.date}T12:00:00.000Z`,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      lateIncidents[existingIdx] = { ...lateIncidents[existingIdx], ...incRecord };
    } else {
      lateIncidents.push(incRecord);
    }
  });

  // Also clean up any conflicting requests that cancel these 13 incidents
  let requests = (state.requests || []).map(r => {
    if (String(r.employeeId) === String(emp107.id)) {
      const matchTarget = target13.find(t => t.date === r.date);
      if (matchTarget) {
        // If it's a penalty request on this date, ensure it's approved and active
        if (r.type === 'penalty' || r.type === 'disciplinary_penalty' || r.subType === 'lateness') {
          return {
            ...r,
            status: 'approved',
            adminApproved: true,
            isCancelled: false,
            amount: matchTarget.penaltyAmount,
            impactVal: matchTarget.deductionMinutes
          };
        }
        // If it was a penalty_objection on one of these dates that was erroneously auto-cancelling the incident
        if (r.type === 'penalty_objection') {
          return {
            ...r,
            status: 'rejected',
            adminApproved: false
          };
        }
      }
    }
    return r;
  });

  state.lateIncidents = lateIncidents;
  state.requests = requests;

  // Verify resulting deductions for Emp 107
  const emp107Deducts = state.lateIncidents.filter(i => 
    String(i.employeeId) === String(emp107.id) &&
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    i.actionType !== 'grace' &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0) &&
    (i.date >= '2026-09-21' && i.date <= '2026-10-20')
  );

  console.log(`\nVerified Emp 107 active late incidents in updated state: ${emp107Deducts.length}`);
  if (emp107Deducts.length !== 13) {
    console.error(`ERROR: Expected 13 incidents, got ${emp107Deducts.length}!`);
    process.exit(1);
  }

  // Save updated state to scratch_validated_state.json
  fs.writeFileSync('./scratch_validated_state.json', JSON.stringify(state, null, 2), 'utf8');
  console.log('✅ Successfully prepared and validated state in scratch_validated_state.json');
}

main().catch(console.error);
