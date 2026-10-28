const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const state = JSON.parse(d).value;
    const emp = state.employees.find(e => String(e.code) === '1152');
    
    // Let's inspect what unifiedTableRows in printHelper or PayslipPrintModal would generate
    const startCutoff = '2026-09-21';
    const endCutoff = '2026-10-20';

    const cycleDates = [];
    let cur = new Date(startCutoff);
    const endD = new Date(endCutoff);
    while (cur <= endD) {
      const cy = cur.getFullYear();
      const cm = String(cur.getMonth() + 1).padStart(2, '0');
      const cd = String(cur.getDate()).padStart(2, '0');
      cycleDates.push(`${cy}-${cm}-${cd}`);
      cur.setDate(cur.getDate() + 1);
    }

    const empShifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) && s.date >= startCutoff && s.date <= endCutoff);
    const shiftDatesSet = new Set(empShifts.map(s => s.date));

    // Approved leaves
    const fromRequests = (state.requests || []).filter(r => String(r.employeeId) === String(emp.id) && (r.type === 'leave' || r.type === 'leave_request') && r.status === 'approved');
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

    console.log('Cycle dates total:', cycleDates.length);
    console.log('Shifts total:', empShifts.length);
    console.log('Leave dates:', Array.from(leaveDatesSet));

    // Check each cycle date
    cycleDates.forEach((dateStr, idx) => {
      const hasShift = shiftDatesSet.has(dateStr);
      const isLeave = leaveDatesSet.has(dateStr);
      console.log(`Day #${idx + 1} (${dateStr}): shift=${hasShift}, leave=${isLeave}`);
    });
  });
});
