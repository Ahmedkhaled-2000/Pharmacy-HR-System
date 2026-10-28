import fs from 'fs';

async function main() {
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const state = (await res.json()).value;
  const empId = 'emp_1789231413527';

  const dates = ['2026-09-22', '2026-09-26', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-03'];

  dates.forEach(d => {
    console.log(`\n=== Date: ${d} ===`);
    const reqs = (state.requests || []).filter(r => String(r.employeeId) === empId && r.date === d);
    console.log('Requests for date:', reqs.length);
    reqs.forEach(r => {
      console.log(`  Req [${r.id}] type=${r.type} subType=${r.subType} status=${r.status} adminApproved=${r.adminApproved} isCancelled=${r.isCancelled} reason=${r.reason || r.ruleTitle}`);
    });

    const incs = (state.lateIncidents || []).filter(i => String(i.employeeId) === empId && i.date === d);
    console.log('Late incidents for date:', incs.length);
    incs.forEach(i => {
      console.log(`  Inc [${i.id}] branch=${i.branchId} late=${i.lateMinutes} deduct=${i.deductionMinutes} status=${i.status} actionType=${i.actionType} isCancelled=${i.isCancelled} label=${i.actionLabel}`);
    });
  });
}

main().catch(console.error);
