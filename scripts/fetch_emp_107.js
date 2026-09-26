import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  console.log('Fetching state from VPS API...');
  const res = await fetch(url, {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  if (!res.ok) {
    console.error('Failed to fetch:', res.status, res.statusText);
    const txt = await res.text();
    console.error('Body:', txt);
    return;
  }

  const json = await res.json();
  const state = json?.value || json;
  console.log('Fetched successfully. State has employees:', (state.employees || []).length);

  const emp = (state.employees || []).find(e => String(e.code) === '107' || e.name?.includes('عبد الرحمن حسام'));
  console.log('Employee 107 info:', {
    id: emp?.id,
    code: emp?.code,
    name: emp?.name,
    branchId: emp?.branchId,
    branchName: emp?.branchName,
    branchesDetails: emp?.branchesDetails,
    workHours: emp?.workHours,
    workHoursPerDay: emp?.workHoursPerDay,
    hourlyRate: emp?.hourlyRate,
    noMonthlySchedule: emp?.noMonthlySchedule
  });

  if (emp) {
    const shifts = (state.shifts || []).filter(s =>
      String(s.employeeId) === String(emp.id) || String(s.employeeCode) === String(emp.code)
    );
    console.log('Total shifts for 107:', shifts.length);
    shifts.forEach(s => {
      console.log('Shift on', s.date, ':', JSON.stringify(s, null, 2));
    });

    const rosters = (state.rosters || []).filter(r =>
      String(r.employeeId) === String(emp.id) || String(r.employeeCode) === String(emp.code)
    );
    console.log('Rosters for 107:', JSON.stringify(rosters, null, 2));
  }
}

run().catch(console.error);
