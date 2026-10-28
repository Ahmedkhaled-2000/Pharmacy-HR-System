const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runnerCode = `
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  const res = await pool.query(\`
    SELECT id, device_serial, device_user_pin, punch_time, employee_id, employee_name, branch_id, action_type, process_status, created_at, raw_payload
    FROM public.biometric_raw_punches 
    WHERE created_at >= '2026-10-20 18:00:00'
    ORDER BY id ASC
  \`);
  console.log(\`Found \${res.rows.length} punches created since 18:00 UTC on 2026-10-20:\`);
  console.table(res.rows.map(r => ({
    id: r.id,
    time: r.punch_time,
    pin: r.device_user_pin,
    name: r.employee_name,
    action: r.action_type,
    created: r.created_at
  })));

  await pool.end();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_check_evening_punches.cjs', runnerCode, 'utf8');

const target = { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' };
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_evening_punches.cjs ${target.host}:${target.userHome}/check_evening.cjs`, { stdio: 'inherit' });
const shCmd = [
  `sudo docker cp ${target.userHome}/check_evening.cjs hr-backend-server:/app/check_evening.cjs`,
  `sudo docker exec -w /app hr-backend-server node /app/check_evening.cjs`,
  `sudo docker exec -w /app hr-backend-server rm -f /app/check_evening.cjs`,
  `rm -f ${target.userHome}/check_evening.cjs`
].join(' && ');
const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
console.log(output);
fs.unlinkSync('scratch_check_evening_punches.cjs');
