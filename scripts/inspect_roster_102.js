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

  console.log('rosters type:', typeof state.rosters, Array.isArray(state.rosters) ? `Array length ${state.rosters.length}` : Object.keys(state.rosters || {}));
  if (Array.isArray(state.rosters)) {
    const empRosters = state.rosters.filter(r => r.employeeId === 'emp_1789143997322' || r.employeeCode === '102');
    console.log('Emp 102 rosters:', JSON.stringify(empRosters, null, 2));
  } else if (state.rosters) {
    console.log('Roster keys:', Object.keys(state.rosters));
    for (const [k, v] of Object.entries(state.rosters)) {
      if (k.includes('102') || JSON.stringify(v).includes('102') || JSON.stringify(v).includes('صبري')) {
        console.log(`Match in roster ${k}:`, v);
      }
    }
  }

  // Also check generalSettings, branch rosters, etc.
  if (state.branchRosters) {
    console.log('branchRosters found');
  }
}

run().catch(console.error);
