const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const state = JSON.parse(d).value;
    const emp = state.employees.find(e => String(e.code) === '1152');
    
    // Check what leaves emp has
    const fromRequests = (state.requests || []).filter(r => String(r.employeeId) === String(emp.id) && (r.type === 'leave' || r.type === 'leave_request'));
    console.log('Leaves for Neama:', fromRequests);

    // Check rest day calculation
    const cycleDates = [];
    const start = new Date('2026-09-21');
    const end = new Date('2026-10-20');
    const cur = new Date(start);
    while (cur <= end) {
      const cy = cur.getFullYear();
      const cm = String(cur.getMonth() + 1).padStart(2, '0');
      const cd = String(cur.getDate()).padStart(2, '0');
      cycleDates.push(`${cy}-${cm}-${cd}`);
      cur.setDate(cur.getDate() + 1);
    }

    const shiftDatesSet = new Set((state.shifts || []).filter(s => String(s.employeeId) === String(emp.id)).map(s => s.date));
    const leaveDatesSet = new Set();
    fromRequests.forEach(l => {
      const s = l.startDate || l.date;
      const e = l.endDate || l.date || s;
      let c = new Date(s);
      const ed = new Date(e);
      while (c <= ed) {
        leaveDatesSet.add(`${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}-${String(c.getDate()).padStart(2,'0')}`);
        c.setDate(c.getDate() + 1);
      }
    });

    console.log('Shift dates count:', shiftDatesSet.size);
    console.log('Leave dates count:', leaveDatesSet.size, Array.from(leaveDatesSet));

    const remainingDates = cycleDates.filter(d => !shiftDatesSet.has(d) && !leaveDatesSet.has(d));
    console.log('Remaining dates in cycle:', remainingDates);
  });
});
