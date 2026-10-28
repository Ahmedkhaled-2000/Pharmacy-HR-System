const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const state = JSON.parse(d).value;
    const emp = state.employees.find(e => String(e.code) === '1152');
    const shifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) && s.date >= '2026-09-21' && s.date <= '2026-10-20');
    const shiftDates = shifts.map(s => s.date).sort();
    console.log('Unique shift dates (' + new Set(shiftDates).size + '):', Array.from(new Set(shiftDates)));
    console.log('Total shifts count:', shifts.length);
  });
});
