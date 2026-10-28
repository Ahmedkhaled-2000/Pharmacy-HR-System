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

async function run() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152');
  const reqs = (state.requests || []).filter(r => 
    (String(r.employeeCode) === '1152' || (emp && String(r.employeeId) === String(emp.id))) &&
    (r.type === 'leave' || r.leaveType)
  );
  console.log('Leaves count:', reqs.length);
  reqs.forEach((r, idx) => {
    console.log(`[Leave ${idx + 1}]`, {
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      daysCount: r.daysCount || r.days,
      leaveType: r.leaveType,
      reason: r.reason || r.details,
      status: r.status,
      createdAt: r.createdAt
    });
  });

  // Also print employee work hours settings
  console.log('Emp dailyWorkHours:', emp.dailyWorkHours, 'targetHoursPerDay:', emp.targetHoursPerDay, 'workDaysPerMonth:', emp.workDaysPerMonth);
}

run().catch(console.error);
