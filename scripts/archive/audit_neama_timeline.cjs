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

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[d.getUTCDay()];
}

async function analyze() {
  const state = await fetchState();
  const emp = (state.employees || []).find(e => String(e.code) === '1152');
  const shifts = (state.shifts || []).filter(s => 
    (String(s.employeeCode) === '1152' || (emp && String(s.employeeId) === String(emp.id))) &&
    s.date >= '2026-09-21' && s.date <= '2026-10-20'
  );

  const leaves = (state.requests || []).filter(r => 
    (String(r.employeeCode) === '1152' || (emp && String(r.employeeId) === String(emp.id))) &&
    (r.type === 'leave' || r.leaveType) && r.status === 'approved'
  );

  console.log('=== 30-DAY TIMELINE AUDIT FOR NEAMA (1152) ===');
  
  // Build calendar from 2026-09-21 to 2026-10-20
  const cur = new Date('2026-09-21T00:00:00Z');
  const end = new Date('2026-10-20T00:00:00Z');
  
  while (cur <= end) {
    const dStr = cur.toISOString().slice(0, 10);
    const dayName = getDayName(dStr);
    const isSunday = dayName === 'الأحد';
    
    // Check leave
    const leave = leaves.find(l => {
      const s = l.startDate;
      const e = l.endDate || l.startDate;
      return dStr >= s && dStr <= e;
    });

    // Check shift
    const shift = shifts.find(s => s.date === dStr);

    console.log(`[${dStr}] ${dayName}:`, {
      hasShift: Boolean(shift),
      timeIn: shift ? (shift.timeIn || shift.checkIn || shift.entryTime) : null,
      timeOut: shift ? (shift.timeOut || shift.checkOut || shift.exitTime) : null,
      break: shift?.breakHours || 0,
      actualWorked: shift?.actualWorkedHours || shift?.netHours || shift?.hours,
      schedHours: shift?.scheduledHours,
      regHours: shift?.regularHours,
      otHours: shift?.overtimeHours,
      otStatus: shift?.overtimeStatus,
      isOffDay: shift?.isOffDayWork || shift?.isScheduledOffDay || isSunday,
      leaveReason: leave ? leave.reason : null,
      statusLabel: shift?.statusLabel,
      note: shift?.note?.slice(0, 40)
    });

    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

analyze().catch(console.error);
