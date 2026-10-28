const { execSync } = require('child_process');

try {
  const remoteCmd = `docker exec hr-payroll-prod-app node -e "
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
          console.log('Roster schedule sample:', Object.keys(roster.schedule || {}));
        }
        const shifts = s.shifts.filter(sh => String(sh.employeeId) === String(emp.id) && sh.date >= '2026-09-21' && sh.date <= '2026-10-20');
        console.log('Shifts dates in cycle:', shifts.map(sh => sh.date).sort());
        const reqs = (s.requests || []).filter(r => String(r.employeeId) === String(emp.id));
        console.log('Requests:', reqs.map(r => ({ id: r.id, type: r.type, date: r.date, startDate: r.startDate, endDate: r.endDate, status: r.status, daysCount: r.daysCount })));
      });
    });
  "`;

  const output = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "${remoteCmd.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
  console.log(output);
} catch (err) {
  console.error('Error:', err.message, err.stdout, err.stderr);
}
