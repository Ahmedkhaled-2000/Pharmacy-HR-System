const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || 'hr-redis';
  console.log(`Connecting to Redis at ${host}...`);
  const r = new Redis({
    host: host,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: 5000
  });

  try {
    const raw = await r.get('hr:settings:pharmacy-tracker-data');
    if (!raw) {
      console.log('No data found in Redis for key hr:settings:pharmacy-tracker-data');
      return;
    }
    const state = JSON.parse(raw);
    const emp = state.employees.find(e => String(e.code) === '107' || (e.name && e.name.includes('عبد الرحمن')));
    console.log('Employee:', emp?.id, emp?.name, 'Code:', emp?.code, 'branchId:', emp?.branchId);
    console.log('Active branches:', emp?.branchesDetails?.map(b => `${b.branchName} (${b.branchId})`));

    const allIncs = (state.lateIncidents || []).filter(i => String(i.employeeId) === String(emp?.id));
    console.log(`\nTotal late incidents for Emp 107 in state: ${allIncs.length}`);

    const deductIncs = allIncs.filter(i => 
      (i.deductionMinutes > 0 || i.penaltyAmount > 0) &&
      i.actionType !== 'grace' &&
      i.status !== 'cancelled' &&
      !i.isCancelled
    );
    console.log(`Financial deduction incidents for Emp 107: ${deductIncs.length}`);
    
    deductIncs.forEach((inc, idx) => {
      console.log(`${idx + 1}. Date: ${inc.date} | Late: ${inc.lateMinutes}m | Deduct: ${inc.deductionMinutes}m | Branch: ${inc.branchId} | Tier: ${inc.tierName} | Status: ${inc.status}`);
    });

    console.log('\n--- Checking other employees with penalties in state.lateIncidents ---');
    const allDeductIncs = (state.lateIncidents || []).filter(i => 
      (i.deductionMinutes > 0 || i.penaltyAmount > 0) &&
      i.actionType !== 'grace' &&
      i.status !== 'cancelled' &&
      !i.isCancelled
    );
    const empsWithPenalties = new Map();
    allDeductIncs.forEach(inc => {
      const e = state.employees.find(emp => String(emp.id) === String(inc.employeeId));
      const key = inc.employeeId;
      if (!empsWithPenalties.has(key)) {
        empsWithPenalties.set(key, {
          id: inc.employeeId,
          code: e?.code || '—',
          name: e?.name || inc.employeeName || '—',
          count: 0,
          totalMinutes: 0
        });
      }
      const record = empsWithPenalties.get(key);
      record.count++;
      record.totalMinutes += (inc.deductionMinutes || 0);
    });

    console.log(`Total late incidents across all employees: ${allDeductIncs.length}`);
    console.log(`Number of employees with late penalties: ${empsWithPenalties.size}`);
    Array.from(empsWithPenalties.values()).forEach(e => {
      console.log(`- Emp [${e.code}] ${e.name}: ${e.count} incidents (${e.totalMinutes} deduct mins)`);
    });

    console.log('\n--- Checking disciplinary penalty requests in state.requests ---');
    const discReqs = (state.requests || []).filter(r => 
      (r.type === 'penalty' || r.type === 'disciplinary_penalty') &&
      r.status !== 'cancelled' && r.status !== 'rejected'
    );
    console.log(`Total disciplinary penalties in requests: ${discReqs.length}`);
    discReqs.forEach(r => {
      const e = state.employees.find(emp => String(emp.id) === String(r.employeeId));
      console.log(`- Request [${r.id}] Emp [${e?.code || '—'}] ${e?.name || r.employeeName}: ${r.reason || r.ruleTitle} (${r.amount || r.impactVal || 0})`);
    });

    console.log('\n--- Checking direct adjustments in state.adjustments ---');
    const penaltyAdjs = (state.adjustments || []).filter(a => 
      (a.type === 'deduction' || a.type === 'penalty')
    );
    console.log(`Total penalty/deduction adjustments: ${penaltyAdjs.length}`);
    penaltyAdjs.slice(0, 10).forEach(a => {
      const e = state.employees.find(emp => String(emp.id) === String(a.employeeId));
      console.log(`- Adj [${a.id}] Emp [${e?.code || '—'}] ${e?.name || a.employeeName}: ${a.reason || a.description} (${a.amount})`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    r.disconnect();
  }
}

main();
