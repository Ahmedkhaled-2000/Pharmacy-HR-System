import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  console.log('Fetching data from VPS...');
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
    console.error('Fetch failed:', res.status, res.statusText);
    return;
  }

  const json = await res.json();
  const state = json?.value || json;

  const emp = (state.employees || []).find(e =>
    String(e.code) === '102' ||
    String(e.deviceUserPin) === '102' ||
    (e.name && e.name.includes('صبري'))
  );

  console.log('Employee found:', emp ? { id: emp.id, name: emp.name, code: emp.code, branch: emp.branch, department: emp.department, shift: emp.shift, schedule: emp.schedule } : 'Not found');

  const empId = emp ? emp.id : null;

  const empShifts = (state.shifts || []).filter(s =>
    String(s.employeeCode) === '102' ||
    (empId && String(s.employeeId) === String(empId)) ||
    (s.employeeName && s.employeeName.includes('صبري'))
  );

  console.log(`\nFound ${empShifts.length} shifts for Sabry Ibrahim (102):`);
  empShifts.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timeIn || '').localeCompare(a.timeIn || ''));

  empShifts.forEach((s, idx) => {
    console.log(`[#${idx + 1}] Date: ${s.date} | In: ${s.timeIn} | Out: ${s.timeOut || 'ACTIVE'} | Hrs: ${s.hours} | Branch: ${s.branch || s.branchName} | Method: ${s.punchMethod || s.source} | ID: ${s.id}`);
  });

  // Check group by date
  const dateMap = {};
  empShifts.forEach(s => {
    dateMap[s.date] = (dateMap[s.date] || []);
    dateMap[s.date].push(s);
  });

  console.log('\n--- Dates with multiple shifts ---');
  for (const [date, shifts] of Object.entries(dateMap)) {
    if (shifts.length > 1) {
      console.log(`Date: ${date} has ${shifts.length} shifts:`);
      shifts.forEach(s => {
        console.log(`   - ID: ${s.id} | In: ${s.timeIn} | Out: ${s.timeOut} | Hrs: ${s.hours} | Note: ${s.note || ''}`);
      });
    }
  }

  // Check late incidents or penalties
  const empLates = (state.lateIncidents || []).filter(inc =>
    String(inc.employeeCode) === '102' || (empId && String(inc.employeeId) === String(empId))
  );
  console.log(`\nFound ${empLates.length} late incidents:`);
  empLates.forEach(inc => {
    console.log(`   - Date: ${inc.date} | In: ${inc.timeIn} | LateMin: ${inc.lateMinutes} | Penalty: ${inc.penaltyAmount || inc.amount} | ID: ${inc.id}`);
  });
}

run().catch(console.error);
