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

  console.log('All state keys:', Object.keys(state));

  // Check state.rosters, monthlyRosters, schedule, workSchedule, etc.
  for (const k of Object.keys(state)) {
    if (Array.isArray(state[k]) && state[k].length > 0) {
      const sample = state[k][0];
      if (sample && (sample.employeeId || sample.shiftType || sample.workingHours || sample.shiftName || sample.roster)) {
        console.log(`Potential schedule key: ${k} (count: ${state[k].length}), sample:`, sample);
      }
    }
  }

  // Check state.monthlyRosters or rosters
  if (state.rosters || state.monthlyRosters || state.monthlySchedules) {
    console.log('rosters found');
  }
}

run().catch(console.error);
