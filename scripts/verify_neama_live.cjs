const http = require('http');

function fetchState() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:5000/api/settings', (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw).value || {});
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function verify() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152');

  console.log('=== 1. VERIFY LEAVES FOR NEAMA ===');
  const leaves = (state.requests || []).filter(r => 
    (String(r.employeeCode) === '1152' || (emp && String(r.employeeId) === String(emp.id))) &&
    (r.type === 'leave' || r.leaveType) && r.status === 'approved'
  );
  console.log(`Found ${leaves.length} approved leaves:`);
  leaves.forEach(l => {
    console.log(`- [${l.startDate} to ${l.endDate}] (${l.daysCount || l.days} day) Reason: ${l.reason || l.details}`);
  });

  console.log('\n=== 2. VERIFY SHIFTS (TOTAL, REGULAR, OVERTIME) ===');
  const shifts = (state.shifts || []).filter(s => 
    (String(s.employeeCode) === '1152' || (emp && String(s.employeeId) === String(emp.id))) &&
    s.date >= '2026-09-21' && s.date <= '2026-10-20'
  ).sort((a,b) => a.date.localeCompare(b.date));

  console.log(`Total shifts in cycle: ${shifts.length}`);
  
  let totalActual = 0;
  let totalRegular = 0;
  let totalOvertime = 0;
  let rejectedOtCount = 0;

  shifts.forEach(s => {
    totalActual += (s.actualWorkedHours || s.hours || 0);
    totalRegular += (s.regularHours || 0);
    totalOvertime += (s.overtimeHours || 0);
    if (s.overtimeStatus === 'rejected') rejectedOtCount++;
    if (s.date === '2026-10-12' || s.date === '2026-10-11' || s.date === '2026-10-16' || s.date === '2026-10-01') {
      console.log(`Day ${s.date}: In=${s.timeIn}, Out=${s.timeOut}, Worked=${s.actualWorkedHours}h, Reg=${s.regularHours}h, OT=${s.overtimeHours}h (${s.overtimeStatus}), Label=${s.statusLabel}`);
    }
  });

  console.log(`\nTotals: Actual Worked = ${totalActual.toFixed(2)}h, Regular = ${totalRegular.toFixed(2)}h, Overtime = ${totalOvertime.toFixed(2)}h`);
  console.log(`Rejected Overtime Count = ${rejectedOtCount}`);
}

verify().catch(console.error);
