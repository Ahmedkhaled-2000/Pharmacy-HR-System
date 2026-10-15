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
  const shifts = state.shifts || [];

  const cycleShifts = shifts.filter(s => {
    const d = s.date || '';
    return d >= '2026-09-21' && d <= '2026-10-20';
  });

  const map = {};
  cycleShifts.forEach(s => {
    const key = `${s.employeeCode || s.employeeId}_${s.date}`;
    map[key] = map[key] || [];
    map[key].push(s);
  });

  let count = 0;
  for (const [k, list] of Object.entries(map)) {
    if (list.length > 1) {
      count++;
      if (count <= 13) {
        const emp = list[0].employeeName || list[0].employeeCode;
        console.log(`\n[Cycle Dup #${count}] ${emp} (Code: ${list[0].employeeCode}) on ${list[0].date} (${list.length} shifts):`);
        list.forEach((s, idx) => {
          console.log(`   #${idx+1} [${s.id}] In: ${s.timeIn} | Out: ${s.timeOut || 'ACTIVE'} | Hrs: ${s.hours} | Branch: ${s.branch || s.branchName} | Note: ${s.note || s.notes || '—'}`);
        });
      }
    }
  }
}

run().catch(console.error);
