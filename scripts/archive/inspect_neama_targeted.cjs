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

async function inspect() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152');
  console.log('--- EMP RECORD ---');
  console.log({
    id: emp?.id,
    code: emp?.code,
    name: emp?.name,
    salary: emp?.salary,
    workDaysPerMonth: emp?.workDaysPerMonth,
    workDays: emp?.workDays,
    dailyWorkHours: emp?.dailyWorkHours,
    dailyHours: emp?.dailyHours,
    targetHoursPerDay: emp?.targetHoursPerDay,
    workHours: emp?.workHours,
    targetWorkHoursPerDay: emp?.targetWorkWorkHoursPerDay,
    schedule: emp?.schedule,
    defaultBranchId: emp?.defaultBranchId,
    branchId: emp?.branchId
  });

  console.log('--- ALL REQUESTS FOR 1152 ---');
  const reqs = (state.requests || []).filter(r => String(r.employeeCode) === '1152' || (emp && String(r.employeeId) === String(emp.id)));
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
      notes: r.notes || r.details || r.reason
    });
  });

  console.log('--- ROSTER ASSIGNMENT FOR 1152 ---');
  // Check in rosterRequests or monthlyRosters or whatever structure is used
  const rosters = (state.rosterRequests || []);
  rosters.forEach(r => {
    const data = r.rosterData || r.schedule || {};
    const empData = data[emp?.id] || data['1152'];
    if (empData) {
      console.log('Roster found:', r.id, r.month, r.branchName, 'Days count:', Object.keys(empData).length);
      // print first 5 days and any off/leave days
      Object.keys(empData).forEach(d => {
        const item = empData[d];
        if (item.isOff || item.off || item.isLeave || item.type === 'leave' || item.type === 'off') {
          console.log('  Special day:', d, item);
        }
      });
    }
  });

  console.log('--- SHIFTS SUMMARY FOR 1152 (date, checkIn, checkOut, scheduledStart, scheduledEnd, scheduledHours, regularHours, overtimeHours, hours, note) ---');
  const shifts = (state.shifts || []).filter(s => (String(s.employeeCode) === '1152' || (emp && String(s.employeeId) === String(emp.id))) && s.date >= '2026-09-21' && s.date <= '2026-10-20');
  shifts.sort((a,b) => a.date.localeCompare(b.date));
  shifts.forEach(s => {
    console.log(s.date, '| in:', s.checkIn || s.entryTime || s.timeIn || s.punchIn, '| out:', s.checkOut || s.exitTime || s.timeOut || s.punchOut, '| sched:', s.scheduledHours, `(${s.scheduledStart}-${s.scheduledEnd})`, '| reg:', s.regularHours, '| ot:', s.overtimeHours, '| hrs:', s.hours, '| note:', (s.note || '').slice(0, 50));
  });
}

inspect().catch(console.error);
