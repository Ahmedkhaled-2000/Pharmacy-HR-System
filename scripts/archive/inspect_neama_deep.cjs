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

async function inspectNeama() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152' || (e.name && e.name.includes('نعمه')));
  console.log('=== EMPLOYEE 1152 INFO ===');
  console.log(JSON.stringify(emp, null, 2));

  console.log('\n=== ROSTER REQUESTS / ROSTER DATA FOR 1152 ===');
  const rosters = (state.rosterRequests || []).filter(r => 
    r.employeeId === emp?.id || 
    r.employeeCode === '1152' || 
    (r.rosterData && (r.rosterData[emp?.id] || r.rosterData['1152']))
  );
  console.log('Roster requests count:', rosters.length);
  rosters.forEach(r => {
    console.log({
      id: r.id,
      month: r.month,
      fromDate: r.fromDate,
      toDate: r.toDate,
      status: r.status,
      branchId: r.branchId,
      branchName: r.branchName
    });
    const empRoster = r.rosterData?.[emp?.id] || r.rosterData?.['1152'] || r.schedule?.[emp?.id];
    if (empRoster) {
      console.log('Sample days in roster:', Object.keys(empRoster).slice(0, 10).map(k => ({ date: k, val: empRoster[k] })));
    }
  });

  console.log('\n=== LEAVE REQUESTS & ALL REQUESTS FOR 1152 ===');
  const reqs = (state.requests || []).filter(r => String(r.employeeId) === String(emp?.id) || String(r.employeeCode) === '1152');
  console.log('Total requests:', reqs.length);
  reqs.forEach(r => {
    console.log({
      id: r.id,
      type: r.type,
      subType: r.subType,
      date: r.date,
      startDate: r.startDate,
      endDate: r.endDate,
      daysCount: r.daysCount,
      leaveType: r.leaveType,
      status: r.status,
      details: r.details,
      notes: r.notes,
      reason: r.reason
    });
  });

  console.log('\n=== SHIFTS FOR 1152 IN CURRENT CYCLE (2026-09-21 to 2026-10-20) ===');
  const shifts = (state.shifts || []).filter(s => 
    (String(s.employeeId) === String(emp?.id) || String(s.employeeCode) === '1152') &&
    s.date >= '2026-09-21' && s.date <= '2026-10-20'
  ).sort((a,b) => a.date.localeCompare(b.date));
  
  console.log('Total shifts in cycle:', shifts.length);
  shifts.forEach(s => {
    console.log({
      date: s.date,
      entryTime: s.entryTime,
      exitTime: s.exitTime,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      breakHours: s.breakHours,
      scheduledHours: s.scheduledHours,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      regularHours: s.regularHours,
      overtimeHours: s.overtimeHours,
      hours: s.hours,
      statusLabel: s.statusLabel,
      isOffDayWork: s.isOffDayWork,
      isLeaveDay: s.isLeaveDay,
      leaveType: s.leaveType,
      note: s.note
    });
  });
}

inspectNeama().catch(console.error);
