import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function main() {
  const url = 'https://63-183-147-199.sslip.io/api/settings?key=pharmacy-tracker-data';
  const res = await fetch(url, {
    // @ts-ignore
    agent,
    headers: {
      'Accept': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123'
    }
  });

  const json = await res.json();
  const state = json?.value || json;
  const shifts = (state.shifts || []).filter(s => s && s.status !== 'cancelled' && !s.isCancelled);
  const employees = state.employees || [];
  const empMap = new Map();
  employees.forEach(e => {
    empMap.set(String(e.id), e);
    if (e.code) empMap.set(String(e.code), e);
  });

  console.log(`Loaded ${shifts.length} active shifts across ${employees.length} employees.`);

  // Group by (empId/empCode) + date
  const groups = new Map();
  shifts.forEach(s => {
    const e = empMap.get(String(s.employeeId)) || empMap.get(String(s.employeeCode));
    const empKey = e ? String(e.id) : String(s.employeeId || s.employeeCode);
    const empName = e?.name || s.employeeName || 'غير معروف';
    const empCode = e?.code || s.employeeCode || '';
    const date = s.date || 'unknown';
    const key = `${empKey}___${date}`;

    if (!groups.has(key)) {
      groups.set(key, { empKey, empName, empCode, date, list: [] });
    }
    groups.get(key).list.push(s);
  });

  const duplicates = [];
  groups.forEach(g => {
    if (g.list.length > 1) {
      duplicates.push(g);
    }
  });

  console.log(`\n=== FOUND ${duplicates.length} CASES OF MULTIPLE SHIFTS ON THE SAME DATE ===\n`);

  duplicates.sort((a, b) => b.date.localeCompare(a.date));

  duplicates.forEach((d, idx) => {
    console.log(`[#${idx + 1}] الموظف: ${d.empName} (كود: ${d.empCode}) | التاريخ: ${d.date} | عدد الورديات: ${d.list.length}`);
    d.list.forEach((s, sIdx) => {
      console.log(`   (${sIdx + 1}) ID: ${s.id} | دخول: ${s.timeIn} | خروج: ${s.timeOut || '—'} | خروج تاريخ: ${s.timeOutDate || '—'} | ساعات: ${s.hours} (فعلي: ${s.actualWorkedHours || s.netHours}) | نوع: ${s.isManual ? 'يدوي' : 'بصمة'} | مصدر: ${s.source || s.punchSource || '—'}`);
    });
  });
}

main().catch(console.error);
