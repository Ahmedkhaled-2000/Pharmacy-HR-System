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
  console.log('Keys of emp 102:', Object.keys(emp));
  console.log('Full emp 102:', emp);

  // Search if any schedule key exists in state
  const stateKeys = Object.keys(state);
  console.log('State keys containing "sched" or "shift":', stateKeys.filter(k => k.toLowerCase().includes('sched') || k.toLowerCase().includes('shift')));
}

run().catch(console.error);
