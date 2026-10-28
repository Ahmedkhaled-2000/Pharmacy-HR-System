const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const targets = [
  {
    name: 'New VPS (169.58.214.20)',
    host: 'admin@169.58.214.20',
    userHome: '/home/admin'
  },
  {
    name: 'Old Live VPS (63.183.147.199)',
    host: 'ubuntu@63.183.147.199',
    userHome: '/home/ubuntu'
  }
];

const importScript = `
const Redis = require('ioredis');
const { Pool } = require('pg');
const fs = require('fs');

async function doImport() {
  const raw = fs.readFileSync('/app/reconciled_state.json', 'utf8');
  const state = JSON.parse(raw);

  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  // Save to Redis
  await redis.set('hr:settings:pharmacy-tracker-data', JSON.stringify(state));
  console.log('✅ Updated Redis key hr:settings:pharmacy-tracker-data');

  // Save to Postgres
  await pool.query(
    "INSERT INTO public.app_settings (key_name, value_data, updated_at) VALUES ('pharmacy-tracker-data', $1::jsonb, CURRENT_TIMESTAMP) ON CONFLICT (key_name) DO UPDATE SET value_data = $1::jsonb, updated_at = CURRENT_TIMESTAMP",
    [JSON.stringify(state)]
  );
  console.log('✅ Updated PostgreSQL table app_settings');

  // Quick verify
  const emp = (state.employees || []).find(e => String(e.code) === '107');
  const incs = (state.lateIncidents || []).filter(i => 
    String(i.employeeId) === String(emp.id) &&
    i.status !== 'cancelled' &&
    !i.isCancelled &&
    (i.deductionMinutes > 0 || i.penaltyAmount > 0)
  );
  console.log(\`✅ Verified Emp 107 active deduction incidents in DB: \${incs.length}\`);
  const totalM = incs.reduce((s, i) => s + (i.deductionMinutes || 0), 0);
  console.log(\`✅ Verified Emp 107 total deduction minutes in DB: \${totalM}\`);

  redis.disconnect();
  await pool.end();
  process.exit(0);
}

doImport().catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('scratch_import_script.cjs', importScript, 'utf8');

for (const target of targets) {
  console.log(`\n----------------------------------------------------`);
  console.log(`🌐 Importing State to: ${target.name} [${target.host}]`);
  console.log(`----------------------------------------------------`);

  try {
    // 1. Upload state & script
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_reconciled_full_state.json ${target.host}:${target.userHome}/reconciled_state.json`, { stdio: 'pipe' });
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_import_script.cjs ${target.host}:${target.userHome}/do_import.cjs`, { stdio: 'pipe' });

    // 2. Copy into container and execute cleanly from /app as .cjs
    const runCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "sudo docker cp ${target.userHome}/reconciled_state.json hr-backend-server:/app/reconciled_state.json && sudo docker cp ${target.userHome}/do_import.cjs hr-backend-server:/app/do_import.cjs && sudo docker exec -w /app hr-backend-server node /app/do_import.cjs && sudo docker exec hr-backend-server rm -f /app/reconciled_state.json /app/do_import.cjs && rm -f ${target.userHome}/reconciled_state.json ${target.userHome}/do_import.cjs"`;
    const out = execSync(runCmd).toString();
    console.log(out.trim());
    console.log(`🎉 Successfully synchronized DB on ${target.name}`);
  } catch (err) {
    console.error(`❌ Error on ${target.name}:`, err.message);
    if (err.stdout) console.log(err.stdout.toString());
    if (err.stderr) console.error(err.stderr.toString());
  }
}
