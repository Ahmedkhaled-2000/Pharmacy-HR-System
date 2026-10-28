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

async function inspectLeaves() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152');
  console.log('Employee:', {
    id: emp?.id,
    name: emp?.name,
    code: emp?.code,
    dailyWorkHours: emp?.dailyWorkHours,
    targetHoursPerDay: emp?.targetHoursPerDay,
    workDaysPerMonth: emp?.workDaysPerMonth,
    salary: emp?.salary,
    branchName: emp?.branchName,
    branchId: emp?.branchId
  });

  console.log('\n=== ALL LEAVE/TIME-OFF REQUESTS FOR 1152 ===');
  const reqs = (state.requests || []).filter(r => 
    (String(r.employeeCode) === '1152' || (emp && String(r.employeeId) === String(emp.id))) &&
    (r.type === 'leave' || r.subType === 'leave' || r.type === 'time_off' || (r.reason && r.reason.includes('مامت')) || (r.notes && r.notes.includes('مامت')) || (r.details && r.details.includes('مامت')))
  );
  reqs.forEach(r => {
    console.log(JSON.stringify(r, null, 2));
  });

  console.log('\n=== ALL SHIFTS MARKED AS LEAVE OR OFF FOR 1152 ===');
  const shifts = (state.shifts || []).filter(s => 
    (String(s.employeeCode) === '1152' || (emp && String(s.employeeId) === String(emp.id))) &&
    s.date >= '2026-09-21' && s.date <= '2026-10-20' &&
    (s.isLeaveDay || s.leaveType || s.isOffDayWork || s.isScheduledOffDay || s.scheduledHours === 0 || (s.note && s.note.includes('مامتها')))
  );
  shifts.forEach(s => {
    console.log(JSON.stringify(s, null, 2));
  });

  console.log('\n=== ROSTER SCHEDULE FOR 1152 ===');
  // Check branch monthly roster
  const rosters = state.branchRosters || state.monthlyRosters || state.rosters || [];
  console.log('Rosters array length:', rosters.length);
  // Also check rosterRequests
  (state.rosterRequests || []).forEach(rr => {
    console.log('RosterRequest:', rr.id, rr.branchName, rr.month, rr.status);
    if (rr.rosterData) {
      const keys = Object.keys(rr.rosterData);
      console.log('  Keys in rosterData:', keys);
      const eData = rr.rosterData[emp?.id] || rr.rosterData['1152'];
      if (eData) {
        console.log('  Found 1152 in rosterData! Sample:', Object.keys(eData).slice(0, 5));
      }
    }
    if (rr.schedule) {
      console.log('  Keys in schedule:', Object.keys(rr.schedule));
    }
  });

  // Also check if employee has schedule directly
  if (emp?.schedule) {
    console.log('Employee direct schedule:', emp.schedule);
  }
}

inspectLeaves().catch(console.error);
