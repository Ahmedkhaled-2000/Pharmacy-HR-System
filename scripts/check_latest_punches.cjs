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

  const res = await pool.query("SELECT id, punch_time, device_user_pin, employee_name, action_type FROM public.biometric_raw_punches WHERE id > 1550 ORDER BY id ASC;");
  console.log('Punches > 1550 count:', res.rows.length);
  if (res.rows.length > 0) {
    console.table(res.rows);
  }

  await pool.end();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_check_gt1550.cjs', runnerCode, 'utf8');

const target = { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' };
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_gt1550.cjs ${target.host}:${target.userHome}/check_gt1550.cjs`, { stdio: 'inherit' });
const shCmd = [
  `sudo docker cp ${target.userHome}/check_gt1550.cjs hr-backend-server:/app/check_gt1550.cjs`,
  `sudo docker exec -w /app hr-backend-server node /app/check_gt1550.cjs`,
  `sudo docker exec -w /app hr-backend-server rm -f /app/check_gt1550.cjs`,
  `rm -f ${target.userHome}/check_gt1550.cjs`
].join(' && ');
const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
console.log(output);
fs.unlinkSync('scratch_check_gt1550.cjs');
