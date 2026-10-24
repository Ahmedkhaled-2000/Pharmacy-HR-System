import fs from 'fs';

const servers = [
  { name: 'Primary VPS Direct API (169.58.214.20:5000)', url: 'http://169.58.214.20:5000/api' },
  { name: 'Primary VPS HTTPS Domain (169-58-214-20.sslip.io)', url: 'https://169-58-214-20.sslip.io/api' }
];

async function checkServer(s) {
  console.log(`\n========================================`);
  console.log(`🔍 Checking Server: ${s.name}`);
  console.log(`========================================`);

  const hRes = await fetch(`${s.url}/health`);
  const health = await hRes.json();
  console.log(`Health Status: ${health.status} | PostgreSQL: ${health.postgres} | Redis: ${health.redis}`);

  const getRes = await fetch(`${s.url}/settings?key=pharmacy-tracker-data`);
  const state = (await getRes.json()).value;

  const emp107 = state.employees.find(e => String(e.code) === '107');
  const incs107 = (state.lateIncidents || []).filter(i => 
    String(i.employeeId) === String(emp107.id) &&
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    i.actionType !== 'grace' &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0) &&
    (i.date >= '2026-09-21' && i.date <= '2026-10-20')
  );

  console.log(`Emp 107 (${emp107.name}): ${incs107.length} penalty incidents.`);
  const totalMins = incs107.reduce((acc, i) => acc + (i.deductionMinutes || 0), 0);
  const totalAmt = incs107.reduce((acc, i) => acc + (parseFloat(i.penaltyAmount) || 0), 0);
  console.log(`   Total late minutes deducted: ${totalMins} دقيقة`);
  console.log(`   Total financial penalties: ${totalAmt.toFixed(2)} ج.م`);

  incs107.sort((a,b) => (a.date||'').localeCompare(b.date||'')).forEach((inc, idx) => {
    console.log(`   ${idx+1}. ${inc.date} | ${inc.branchName} | late: ${inc.lateMinutes}m | deduct: ${inc.deductionMinutes}m | amt: ${inc.penaltyAmount} EGP`);
  });

  // Check other employees
  const otherEmpsWithPenalties = new Set();
  (state.lateIncidents || []).forEach(inc => {
    if (inc.deductionMinutes > 0 && inc.status !== 'cancelled' && !inc.isCancelled && inc.actionType !== 'grace') {
      otherEmpsWithPenalties.add(inc.employeeId);
    }
  });
  console.log(`Total employees with active penalty records: ${otherEmpsWithPenalties.size}`);
}

async function main() {
  for (const s of servers) {
    await checkServer(s);
  }
}

main().catch(console.error);
