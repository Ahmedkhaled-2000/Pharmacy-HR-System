const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
const Redis = require('ioredis');

async function check() {
  const pool = new Pool({
    host: 'hr-postgres',
    database: 'postgres',
    user: 'postgres',
    password: 'postgres_hr_2026_super_secure'
  });
  const redis = new Redis({ host: 'hr-redis', port: 6379 });

  console.log('=== SYNC LOGS TODAY (2026-10-21) ===');
  const syncLogs = await pool.query("SELECT * FROM public.sync_logs WHERE created_at >= '2026-10-21 00:00:00' ORDER BY created_at DESC LIMIT 100");
  console.log('Total sync logs today:', syncLogs.rows.length);
  syncLogs.rows.slice(0, 30).forEach(r => console.log(r.created_at, r.action_type, r.entity_key));

  console.log('\\n=== REDIS ACTIVE SHIFTS / LIVE ATTENDANCE ===');
  const rawState = await redis.get('hr:settings:pharmacy-tracker-data');
  if (rawState) {
    const state = JSON.parse(rawState);
    const today = '2026-10-21';
    const todayShifts = (state.shifts || []).filter(s => s.date === today);
    console.log('Today shifts count in Redis state:', todayShifts.length);
    todayShifts.forEach(s => console.log('  Shift:', s.employeeName, s.branchName, s.timeIn, s.timeOut));

    const activeShifts = state.activeShifts || {};
    console.log('ActiveShifts object keys count:', Object.keys(activeShifts).length);
    Object.entries(activeShifts).forEach(([k, v]) => console.log('  ActiveShift:', k, v?.employeeName, v?.branchName, v?.timeIn));
  }

  redis.disconnect();
  await pool.end();
}

check().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
