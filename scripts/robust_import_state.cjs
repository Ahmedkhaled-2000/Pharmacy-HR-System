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

const runnerScript = `
const Redis = require('ioredis');
const { Pool } = require('pg');
const fs = require('fs');

async function doImport() {
  console.log('Reading /app/reconciled_state.json...');
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
  const totalMins = incs.reduce((s, i) => s + (i.deductionMinutes || 0), 0);
  const totalAmt = incs.reduce((s, i) => s + (parseFloat(i.penaltyAmount) || 0), 0);
  console.log(\`✅ Verified Emp 107 total deduction minutes: \${totalMins}m, total amount: \${totalAmt.toFixed(2)} EGP\`);

  redis.disconnect();
  await pool.end();
  process.exit(0);
}

doImport().catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});
`;

fs.writeFileSync('./scratch_import_runner.cjs', runnerScript, 'utf8');

for (const target of targets) {
  console.log(`====================================================`);
  console.log(`🌐 Pushing state to: ${target.name} [${target.host}]`);
  console.log(`====================================================`);

  try {
    // 1. Upload state & runner script
    console.log('   📤 Uploading state and runner files...');
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_reconciled_full_state.json ${target.host}:${target.userHome}/reconciled_state.json`, { stdio: 'inherit' });
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_import_runner.cjs ${target.host}:${target.userHome}/import_runner.cjs`, { stdio: 'inherit' });

    // 2. Copy into docker container /app and run
    console.log('   🔄 Running import inside hr-backend-server in /app...');
    const shCmd = [
      `sudo docker cp ${target.userHome}/reconciled_state.json hr-backend-server:/app/reconciled_state.json`,
      `sudo docker cp ${target.userHome}/import_runner.cjs hr-backend-server:/app/import_runner.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/import_runner.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/reconciled_state.json /app/import_runner.cjs`,
      `rm -f ${target.userHome}/reconciled_state.json ${target.userHome}/import_runner.cjs`
    ].join(' && ');

    execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { stdio: 'inherit' });
    console.log(`   🎉 Successfully updated DB on ${target.name}!\n`);
  } catch (err) {
    console.error(`   ❌ Failed on ${target.name}:`, err.message);
  }
}
