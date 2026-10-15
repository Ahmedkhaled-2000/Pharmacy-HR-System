import https from 'https';

const agent = new https.Agent({
  rejectUnauthorized: false
});

async function run() {
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
  const shifts = state.shifts || [];

  console.log(`Auditing all ${shifts.length} shifts across the entire company...`);

  // Group by employee and date
  const empDateMap = {};
  shifts.forEach(s => {
    const key = `${s.employeeId || s.employeeCode}_${s.date}`;
    empDateMap[key] = empDateMap[key] || [];
    empDateMap[key].push(s);
  });

  console.log('\n=== EMPLOYEES WITH MULTIPLE SHIFTS ON THE SAME DATE ===');
  let duplicateGroupsCount = 0;
  for (const [key, list] of Object.entries(empDateMap)) {
    if (list.length > 1) {
      duplicateGroupsCount++;
      const [empId, date] = key.split('_');
      const empName = list[0].employeeName || empId;
      console.log(`\n[Group #${duplicateGroupsCount}] Emp: ${empName} (${list[0].employeeCode || empId}) | Date: ${date} (${list.length} shifts):`);
      list.forEach((s, idx) => {
        console.log(`   #${idx+1} ID: ${s.id} | In: ${s.timeIn} | Out: ${s.timeOut || 'ACTIVE'} | Hrs: ${s.hours} | Branch: ${s.branch || s.branchName} | Note: ${s.note || s.notes || '—'}`);
      });
    }
  }

  if (duplicateGroupsCount === 0) {
    console.log('No duplicate shifts found anywhere in the system!');
  } else {
    console.log(`\nTotal dates with multiple shifts found: ${duplicateGroupsCount}`);
  }
}

run().catch(console.error);
