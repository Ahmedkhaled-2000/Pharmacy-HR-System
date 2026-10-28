const { execSync } = require('child_process');
const fs = require('fs');

const runnerScript = `
const Redis = require('ioredis');
const { Pool } = require('pg');

async function main() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  console.log('--- 1. BIOMETRIC RAW PUNCHES (2026-10-21) ---');
  const rawPunches = await pool.query(
    "SELECT * FROM biometric_raw_punches WHERE punch_time::date = '2026-10-21' ORDER BY punch_time ASC"
  );
  console.log('Count:', rawPunches.rows.length);
  for (const r of rawPunches.rows) {
    console.log(JSON.stringify(r));
  }

  console.log('\\n--- 2. CURRENT ACTIVE SHIFTS IN REDIS ---');
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');
  console.log('activeShifts keys:', Object.keys(state.activeShifts || {}));
  for (const [k, v] of Object.entries(state.activeShifts || {})) {
    console.log(k, '=>', JSON.stringify({
      employeeId: v.employeeId,
      employeeName: v.employeeName,
      branchId: v.branchId,
      branchName: v.branchName,
      timeIn: v.timeIn,
      date: v.date
    }));
  }

  console.log('\\n--- 3. SHIFTS FOR 2026-10-21 IN STATE ---');
  const todayShifts = (state.shifts || []).filter(s => String(s.date || '').slice(0, 10) === '2026-10-21');
  console.log('Count:', todayShifts.length);
  for (const s of todayShifts) {
    console.log(s.id, s.employeeName || s.employeeId, s.timeIn, '->', s.timeOut, 'hours:', s.hours, 'branch:', s.branchName || s.branchId);
  }

  redis.disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
`;

fs.writeFileSync('temp_inspect_runner.cjs', runnerScript);

try {
  execSync('scp -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no temp_inspect_runner.cjs admin@169.58.214.20:/home/admin/temp_inspect_runner.cjs');
  const out = execSync('ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker cp /home/admin/temp_inspect_runner.cjs hr-backend-server:/app/temp_inspect_runner.cjs && sudo docker exec hr-backend-server node /app/temp_inspect_runner.cjs && sudo docker exec hr-backend-server rm -f /app/temp_inspect_runner.cjs && rm -f /home/admin/temp_inspect_runner.cjs"').toString();
  console.log(out);
} finally {
  if (fs.existsSync('temp_inspect_runner.cjs')) fs.unlinkSync('temp_inspect_runner.cjs');
}
