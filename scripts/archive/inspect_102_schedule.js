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
  console.log('=== EMPLOYEE 102 ===');
  console.log('ID:', emp.id);
  console.log('Name:', emp.name);
  console.log('Shift:', emp.shift);
  console.log('Schedule:', emp.schedule);
  console.log('AssignedShift:', emp.assignedShift);
  console.log('WorkingHours:', emp.workingHours);
  console.log('CustomSchedules:', emp.customSchedules);
  console.log('WorkSchedule:', emp.workSchedule);

  // Check schedules array
  const schedules = state.schedules || [];
  const empSchedules = schedules.filter(s => s.employeeId === emp.id || s.employeeCode === '102' || (s.employeeIds && s.employeeIds.includes(emp.id)));
  console.log('\n=== EMP SCHEDULES in state.schedules ===', empSchedules);

  // Check shifts definition in state.shiftsConfig / shiftSettings / etc.
  console.log('\n=== SHIFT CONFIGS in state ===');
  console.log('state.shiftsConfig:', state.shiftsConfig);
  console.log('state.shiftSettings:', state.shiftSettings);
  console.log('state.generalSettings?.shifts:', state.generalSettings?.shifts);
  console.log('state.workShifts:', state.workShifts);
}

run().catch(console.error);
