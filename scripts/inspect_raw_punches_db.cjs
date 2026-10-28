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

  console.log('--- Last 20 raw punches in biometric_raw_punches ---');
  const res = await pool.query(\`
    SELECT id, device_serial, device_user_pin, punch_time, employee_id, employee_name, branch_id, action_type, process_status, process_notes, created_at 
    FROM public.biometric_raw_punches 
    ORDER BY id DESC LIMIT 20
  \`);
  console.table(res.rows);

  console.log('--- Punches specifically for Sabry or Adham or pins 102/104 ---');
  const filterRes = await pool.query(\`
    SELECT id, device_serial, device_user_pin, punch_time, employee_id, employee_name, action_type, process_status, process_notes, created_at 
    FROM public.biometric_raw_punches 
    WHERE employee_name LIKE '%صبري%' OR employee_name LIKE '%ادهم%' OR device_user_pin IN ('102', '104')
    ORDER BY id DESC LIMIT 15
  \`);
  console.table(filterRes.rows);

  await pool.end();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_inspect_raw.cjs', runnerCode, 'utf8');

const targets = [
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' },
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199', userHome: '/home/ubuntu' }
];

for (const target of targets) {
  console.log(`\n====================================================`);
  console.log(`Inspecting biometric_raw_punches on ${target.name}`);
  console.log(`====================================================`);
  try {
    execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_inspect_raw.cjs ${target.host}:${target.userHome}/inspect_raw.cjs`, { stdio: 'inherit' });
    const shCmd = [
      `sudo docker cp ${target.userHome}/inspect_raw.cjs hr-backend-server:/app/inspect_raw.cjs`,
      `sudo docker exec -w /app hr-backend-server node /app/inspect_raw.cjs`,
      `sudo docker exec -w /app hr-backend-server rm -f /app/inspect_raw.cjs`,
      `rm -f ${target.userHome}/inspect_raw.cjs`
    ].join(' && ');
    const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
    console.log(output);
  } catch(e) {
    console.error('Error on', target.name, e.message);
  }
}
fs.unlinkSync('scratch_inspect_raw.cjs');
