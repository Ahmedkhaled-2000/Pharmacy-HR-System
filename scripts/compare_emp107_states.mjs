import fs from 'fs';

async function main() {
  const scratchState = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const vpsState = (await res.json()).value;

  const empId = 'emp_1789231413527';

  // Compare shifts for 107
  const scratchShifts = (scratchState.shifts || []).filter(s => String(s.employeeId) === empId);
  const vpsShifts = (vpsState.shifts || []).filter(s => String(s.employeeId) === empId);
  console.log('Emp 107 shifts in scratch:', scratchShifts.length, 'vs in VPS:', vpsShifts.length);

  // Compare lateIncidents
  const scratchIncs = (scratchState.lateIncidents || []).filter(i => String(i.employeeId) === empId);
  const vpsIncs = (vpsState.lateIncidents || []).filter(i => String(i.employeeId) === empId);
  console.log('Emp 107 lateIncidents in scratch:', scratchIncs.length, 'vs in VPS:', vpsIncs.length);

  // Compare requests
  const scratchReqs = (scratchState.requests || []).filter(r => String(r.employeeId) === empId);
  const vpsReqs = (vpsState.requests || []).filter(r => String(r.employeeId) === empId);
  console.log('Emp 107 requests in scratch:', scratchReqs.length, 'vs in VPS:', vpsReqs.length);

  // Compare monthlyRosters
  console.log('scratch monthlyRosters keys:', Object.keys(scratchState.monthlyRosters || {}));
  console.log('VPS monthlyRosters keys:', Object.keys(vpsState.monthlyRosters || {}));

  // Compare shifts dates
  const scratchDates = new Set(scratchShifts.map(s => `${s.date}_${s.branchId}_${s.shiftStart}`));
  const vpsDates = new Set(vpsShifts.map(s => `${s.date}_${s.branchId}_${s.shiftStart}`));

  console.log('\nShifts in scratch but NOT in VPS:');
  scratchShifts.forEach(s => {
    const key = `${s.date}_${s.branchId}_${s.shiftStart}`;
    if (!vpsDates.has(key)) {
      console.log('Scratch only:', s.date, s.branchId, s.shiftStart, s.shiftEnd, s.punchInTime);
    }
  });

  console.log('\nShifts in VPS but NOT in scratch:');
  vpsShifts.forEach(s => {
    const key = `${s.date}_${s.branchId}_${s.shiftStart}`;
    if (!scratchDates.has(key)) {
      console.log('VPS only:', s.date, s.branchId, s.shiftStart, s.shiftEnd, s.punchInTime);
    }
  });

  // Check differences in punches
  scratchShifts.forEach(s => {
    const match = vpsShifts.find(vs => vs.date === s.date && vs.branchId === s.branchId);
    if (match && match.punchInTime !== s.punchInTime) {
      console.log(`Punch difference on ${s.date}: scratch punchIn=${s.punchInTime} vs VPS punchIn=${match.punchInTime}`);
    }
  });

  // Check objections differences
  console.log('\nRequests status comparison:');
  scratchReqs.forEach(sr => {
    const vr = vpsReqs.find(r => r.id === sr.id);
    if (!vr) {
      console.log(`Request in scratch only: [${sr.id}] type=${sr.type} date=${sr.date} status=${sr.status}`);
    } else if (vr.status !== sr.status) {
      console.log(`Request status mismatch [${sr.id}] date=${sr.date}: scratch=${sr.status} vs VPS=${vr.status}`);
    }
  });
}

main().catch(console.error);
