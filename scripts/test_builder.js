const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', res => {
  let d = ''; res.on('data', c => d += c);
  res.on('end', () => {
    const state = JSON.parse(d).value;
    const emp = state.employees.find(e => String(e.code) === '1152');

    // Build unified month sequence
    const startCutoff = '2026-09-21';
    const endCutoff = '2026-10-20';
    const today = '2026-10-20';

    const empShifts = (state.shifts || []).filter(s => String(s.employeeId) === String(emp.id) && s.date >= startCutoff && s.date <= endCutoff);
    const shiftsByDate = new Map();
    empShifts.forEach(s => {
      shiftsByDate.set(s.date, s);
    });

    const approvedLeaves = (state.requests || []).filter(r => 
      String(r.employeeId) === String(emp.id) && 
      (r.type === 'leave' || r.type === 'leave_request') && 
      (r.status === 'approved' || r.adminApproved)
    );

    const leavesByDate = new Map();
    approvedLeaves.forEach(l => {
      const s = l.startDate || l.date;
      const e = l.endDate || l.date || s;
      let cur = new Date(s);
      const endD = new Date(e);
      while (cur <= endD) {
        const cy = cur.getFullYear();
        const cm = String(cur.getMonth() + 1).padStart(2, '0');
        const cd = String(cur.getDate()).padStart(2, '0');
        leavesByDate.set(`${cy}-${cm}-${cd}`, l);
        cur.setDate(cur.getDate() + 1);
      }
    });

    const roster = (state.rosters || []).find(r => String(r.employeeId) === String(emp.id) && (r.month === '2026-10' || !r.month));
    const weeklyRestDays = Array.isArray(emp.weeklyRestDays) && emp.weeklyRestDays.length > 0 ? emp.weeklyRestDays : ['الأحد'];

    const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    const cur = new Date(startCutoff);
    const endD = new Date(endCutoff);
    const unifiedRows = [];

    let seq = 1;
    while (cur <= endD) {
      const cy = cur.getFullYear();
      const cm = String(cur.getMonth() + 1).padStart(2, '0');
      const cd = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${cy}-${cm}-${cd}`;
      const dayOfWeek = cur.getDay();
      const arDay = AR_WEEKDAYS[dayOfWeek];

      const shift = shiftsByDate.get(dateStr);
      const leave = leavesByDate.get(dateStr);

      let rosterItem = roster && roster.schedule ? (roster.schedule[dateStr] || roster.schedule[String(dayOfWeek)]) : null;
      const isScheduledOff = rosterItem ? (rosterItem.type === 'off' || rosterItem.isOff) : weeklyRestDays.some(d => d.includes(arDay));

      if (shift) {
        unifiedRows.push({
          seq,
          date: dateStr,
          dayName: arDay,
          type: 'shift',
          isRestDayWork: isScheduledOff,
          shift,
          label: isScheduledOff ? 'وردية في يوم راحة أسبوعية' : 'وردية عمل عادية',
          hours: shift.hours || 8
        });
      } else if (leave) {
        const isUnpaid = leave.leaveType === 'unpaid' || leave.isUnpaid;
        unifiedRows.push({
          seq,
          date: dateStr,
          dayName: arDay,
          type: 'leave',
          leave,
          isUnpaid,
          label: isUnpaid ? 'إجازة بدون أجر' : 'إجازة سنوية معتمدة',
          reason: leave.reason || leave.details || ''
        });
      } else if (isScheduledOff) {
        unifiedRows.push({
          seq,
          date: dateStr,
          dayName: arDay,
          type: 'rest',
          label: 'راحة أسبوعية مجدولة',
          reason: 'راحة أسبوعية مقررة'
        });
      } else {
        if (dateStr < today) {
          unifiedRows.push({
            seq,
            date: dateStr,
            dayName: arDay,
            type: 'absence',
            label: 'غياب بدون إذن',
            reason: 'لم يتم تسجيل بصمة حضور'
          });
        } else {
          unifiedRows.push({
            seq,
            date: dateStr,
            dayName: arDay,
            type: 'pending',
            label: 'يوم جاري / متبقي',
            reason: ''
          });
        }
      }

      cur.setDate(cur.getDate() + 1);
      seq++;
    }

    console.log('Unified rows generated:', unifiedRows.length);
    console.log(unifiedRows.map(r => `#${r.seq} [${r.date} ${r.dayName}] => ${r.label} ${r.reason ? '(' + r.reason + ')' : ''} (type: ${r.type})`).join('\n'));
  });
});
