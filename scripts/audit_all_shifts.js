import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
  const res = await fetch('https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data', {
    headers: { 'Accept': 'application/json', 'X-App-Role': 'admin', 'X-App-Password': '123' },
    agent
  });
  const json = await res.json();
  const state = json?.value || json;
  const shifts = state.shifts || [];
  console.log('Auditing total shifts:', shifts.length);

  // Group shifts by employee + date
  const map = new Map();
  shifts.forEach(s => {
    if (!s || s.status === 'cancelled' || s.isCancelled) return;
    const empKey = String(s.employeeId || s.employeeCode || '');
    const key = empKey + '___' + s.date;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });

  const dupes = [];
  map.forEach((list, key) => {
    if (list.length > 1) {
      const [empKey, date] = key.split('___');
      dupes.push({
        empKey,
        date,
        count: list.length,
        shifts: list.map(s => ({
          id: s.id,
          in: s.timeIn,
          out: s.timeOut,
          hrs: s.hours,
          name: s.employeeName,
          manual: s.isManual
        }))
      });
    }
  });

  console.log('Found ' + dupes.length + ' dates with multiple shifts across all employees:');
  dupes.forEach(d => {
    console.log('Emp: ' + d.shifts[0]?.name + ' (' + d.empKey + ') | Date: ' + d.date + ' | Count: ' + d.count);
    d.shifts.forEach(s => {
      console.log('   - ID: ' + s.id + ' | In: ' + s.in + ' | Out: ' + s.out + ' | Hrs: ' + s.hrs + ' | Manual: ' + s.manual);
    });
  });
}

run();
