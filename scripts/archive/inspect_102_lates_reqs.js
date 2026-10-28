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

  const empLates = (state.lateIncidents || []).filter(inc =>
    String(inc.employeeCode) === '102' || String(inc.employeeId) === 'emp_1789143997322'
  );

  console.log('=== LATE INCIDENTS FOR SABRY (102) ===');
  empLates.forEach(inc => {
    console.log(JSON.stringify(inc, null, 2));
  });

  // Check requests for Sabry
  const empReqs = (state.requests || []).filter(req =>
    String(req.employeeCode) === '102' || String(req.employeeId) === 'emp_1789143997322'
  );
  console.log('\n=== REQUESTS FOR SABRY (102) ===');
  empReqs.forEach(req => {
    console.log(JSON.stringify({
      id: req.id,
      type: req.type,
      date: req.date,
      status: req.status,
      reason: req.reason,
      penaltyAmount: req.penaltyAmount,
      hours: req.hours,
      createdAt: req.createdAt
    }, null, 2));
  });
}

run().catch(console.error);
