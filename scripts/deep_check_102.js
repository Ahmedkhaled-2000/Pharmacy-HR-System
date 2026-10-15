import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  const res = await fetch(url, {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  const json = await res.json();
  const state = json?.value || json;

  const emp = (state.employees || []).find(e => String(e.code) === '102');
  console.log('=== EMPLOYEE 102 DETAILS ===');
  console.log(JSON.stringify(emp, null, 2));

  // Check schedules in state
  console.log('\n=== SCHEDULE / WORK SCHEDULES IN STATE ===');
  const schedules = state.schedules || state.workSchedules || [];
  console.log('Schedules count:', schedules.length);
  const empSchedule = schedules.filter(s =>
    String(s.employeeId) === emp?.id || String(s.employeeCode) === '102' ||
    (s.employeeIds && s.employeeIds.includes(emp?.id))
  );
  console.log('Emp specific schedules:', JSON.stringify(empSchedule, null, 2));

  // Check shifts
  const empShifts = (state.shifts || []).filter(s =>
    String(s.employeeCode) === '102' || String(s.employeeId) === emp?.id
  );

  console.log('\n=== ALL SHIFTS FOR EMP 102 ===');
  empShifts.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timeIn || '').localeCompare(b.timeIn || ''));
  empShifts.forEach((s, i) => {
    console.log(`[Shift ${i+1}] ID: ${s.id}`);
    console.log(`  Date: ${s.date} | Time: ${s.timeIn} -> ${s.timeOut || 'ACTIVE'} | Hours: ${s.hours} (Reg: ${s.regularHours}, OT: ${s.overtimeHours})`);
    console.log(`  Method: ${s.punchMethod} | Source: ${s.source} | Branch: ${s.branch || s.branchName}`);
    console.log(`  Notes: ${s.note || s.notes || ''}`);
    console.log(`  Other flags: manual=${s.isManual}, earlyOvernight=${s.isEarlyOvernightIn}, actualPunchDate=${s.actualPunchDate}`);
    console.log('--------------------------------------------------');
  });

  // Check branch
  const branch = (state.branches || []).find(b => b.id === emp?.branchId || b.name === emp?.branch);
  console.log('\n=== BRANCH INFO ===');
  console.log(JSON.stringify(branch, null, 2));
}

run().catch(console.error);
