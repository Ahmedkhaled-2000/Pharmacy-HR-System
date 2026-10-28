const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', chunk => raw += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.success || !parsed.value) {
        console.log('Error or null value:', parsed);
        return;
      }
      const val = parsed.value;
      const emp107Shifts = (val.shifts || []).filter(s => s && (s.employeeId === 'emp_1789231413527' || s.employeeCode === '107'));
      console.log('API Returned total shifts for 107:', emp107Shifts.length);
      const byBranch = {};
      emp107Shifts.forEach(s => {
        const b = s.branchName || s.branchId || 'Unknown';
        byBranch[b] = (byBranch[b] || 0) + 1;
        console.log(`[${s.date}] ${b} | ${s.timeIn}->${s.timeOut} (${s.hours}h)`);
      });
      console.log('API Shifts count by branch:', byBranch);
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
}).on('error', e => console.error('Request error:', e.message));
