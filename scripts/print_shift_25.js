import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

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
  const emp = (state.employees || []).find(e => String(e.code) === '107' || e.name?.includes('عبد الرحمن حسام'));
  
  const shift25 = (state.shifts || []).filter(s =>
    (String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === String(emp?.code)) &&
    s.date === '2026-09-25'
  );

  console.log('Shift on 2026-09-25 for emp 107:', JSON.stringify(shift25, null, 2));

  // Check branchesDetails
  console.log('branchesDetails:', JSON.stringify(emp?.branchesDetails, null, 2));
}

run().catch(console.error);
