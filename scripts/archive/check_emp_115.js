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
    return;
  }

  const json = await res.json();
  const state = json?.value || json;
  console.log('Fetched successfully.');

  const emp = (state.employees || []).find(e => String(e.code) === '115' || e.name?.includes('شعبان'));
  console.log('Employee 115 info:', {
    id: emp?.id,
    code: emp?.code,
    name: emp?.name,
    branchId: emp?.branchId,
    branchName: emp?.branchName,
    workHours: emp?.workHours,
    workHoursPerDay: emp?.workHoursPerDay
  });

  if (!emp) {
    console.log('Employee 115 not found!');
    return;
  }

  const shifts = (state.shifts || []).filter(s =>
    String(s.employeeId) === String(emp.id) || String(s.employeeCode) === String(emp.code)
  );
  console.log('Total shifts for 115 in state.shifts:', shifts.length);

  shifts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  console.log('--- ALL SHIFTS FOR EMP 115 ---');
  shifts.forEach((s, idx) => {
    console.log(`[#${idx + 1}] Date: ${s.date} | In: ${s.timeIn} | Out: ${s.timeOut} | Hours: ${s.hours} | Method: ${s.punchMethod || s.method} | IsManual: ${s.isManual} | Branch: ${s.branchName || s.branchId} | ID: ${s.id} | Status: ${s.status} | CreatedAt: ${s.createdAt || s.created_at || 'N/A'}`);
  });

  // Check requests
  console.log('--- REQUESTS FOR 115 ---');
  const reqs = (state.requests || []).filter(r =>
    String(r.employeeCode) === '115' || String(r.employeeId) === String(emp.id) || r.employeeName?.includes('شعبان')
  );
  console.log('Total requests for 115:', reqs.length);
  reqs.forEach((r, idx) => {
    console.log(`[#${idx+1}] ID: ${r.id} | Type: ${r.type} | Date: ${r.date || JSON.stringify(r.dates)} | Status: ${r.status} | Reason: ${r.reason} | Created: ${r.createdAt}`);
  });
}

run();
