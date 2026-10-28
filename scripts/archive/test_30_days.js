const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const state = JSON.parse(d).value;
    const emp = state.employees.find(e => String(e.code) === '1152');
    
    // Test getEmployeeDaySchedule logic
    const roster = (state.rosters || []).find(r => String(r.employeeId) === String(emp.id) && (r.month === '2026-10' || !r.month));
    console.log('Employee:', emp.name, 'Roster schedule:', roster ? roster.schedule : 'NO ROSTER');

    // Cycle dates from 2026-09-21 to 2026-10-20
    const start = new Date('2026-09-21');
    const end = new Date('2026-10-20');
    const cur = new Date(start);

    const shiftDates = new Set((state.shifts || []).filter(s => String(s.employeeId) === String(emp.id)).map(s => s.date));
    const reqs = (state.requests || []).filter(r => String(r.employeeId) === String(emp.id) && r.status === 'approved');

    console.log('\n--- 30-DAY BREAKDOWN ---');
    let idx = 1;
    while (cur <= end) {
      const cy = cur.getFullYear();
      const cm = String(cur.getMonth() + 1).padStart(2, '0');
      const cd = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${cy}-${cm}-${cd}`;
      const dayOfWeek = cur.getDay(); // 0 is Sunday

      const hasShift = shiftDates.has(dateStr);
      const leave = reqs.find(r => (r.type === 'leave' || r.type === 'leave_request') && (r.date === dateStr || (r.startDate <= dateStr && r.endDate >= dateStr)));
      
      let rosterItem = roster && roster.schedule ? (roster.schedule[dateStr] || roster.schedule[String(dayOfWeek)]) : null;

      console.log(`#${idx} [${dateStr}] (day ${dayOfWeek}): shift=${hasShift}, leave=${leave ? leave.startDate + ' ' + leave.reason : 'none'}, roster=${JSON.stringify(rosterItem)}`);

      cur.setDate(cur.getDate() + 1);
      idx++;
    }
  });
});
