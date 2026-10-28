const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const s = JSON.parse(d).value;
    const emp = s.employees.find(e => String(e.code) === '1152');
    console.log('EMP:', emp.id, emp.name, 'noMonthlySchedule:', emp.noMonthlySchedule, 'weeklyRestDays:', emp.weeklyRestDays);
    const roster = (s.rosters || []).find(r => String(r.employeeId) === String(emp.id) && (r.month === '2026-10' || !r.month));
    console.log('ROSTER found?:', !!roster);
    if (roster) {
      console.log('Roster keys:', Object.keys(roster.schedule || {}));
      console.log('Roster day 0 (Sunday):', roster.schedule['0']);
      console.log('Roster day 1 (Monday):', roster.schedule['1']);
      console.log('Roster day 2 (Tuesday):', roster.schedule['2']);
      console.log('Roster day 6 (Saturday):', roster.schedule['6']);
    }
    const shifts = s.shifts.filter(sh => String(sh.employeeId) === String(emp.id) && sh.date >= '2026-09-21' && sh.date <= '2026-10-20');
    console.log('Shifts dates in cycle (' + shifts.length + '):', shifts.map(sh => sh.date).sort());
    const reqs = (s.requests || []).filter(r => String(r.employeeId) === String(emp.id));
    console.log('Requests:', reqs.map(r => ({ id: r.id, type: r.type, date: r.date, startDate: r.startDate, endDate: r.endDate, status: r.status, reason: r.reason })));
  });
});
