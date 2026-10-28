const { execSync } = require('child_process');
const fs = require('fs');
const sshKey = 'vps-p-spark-1803.pem';

const runnerCode = `
const Redis = require('ioredis');
const { Pool } = require('pg');

async function run() {
  const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });
  const raw = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(raw);

  const islam = (state.employees || []).find(e => String(e.code) === '14');
  console.log('Islam emp:', islam ? { id: islam.id, code: islam.code, name: islam.name } : 'Not found');

  const islamShifts = (state.shifts || []).filter(s => String(s.employeeCode) === '14' || s.employeeId === islam?.id);
  console.log('Islam last 5 shifts:', islamShifts.slice(-5));

  const pool = new Pool({
    host: process.env.DB_HOST || 'hr-postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
  });

  const rawP = await pool.query(\`
    SELECT id, punch_time, device_user_pin, employee_name, action_type, raw_payload
    FROM public.biometric_raw_punches 
    WHERE device_user_pin = '14' 
    ORDER BY id DESC LIMIT 5
  \`);
  console.log('Islam raw punches in DB:');
  console.table(rawP.rows);

  redis.disconnect();
  await pool.end();
}

run().catch(console.error);
`;

fs.writeFileSync('scratch_check_islam.cjs', runnerCode, 'utf8');

const target = { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20', userHome: '/home/admin' };
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch_check_islam.cjs ${target.host}:${target.userHome}/check_islam.cjs`, { stdio: 'inherit' });
const shCmd = [
  `sudo docker cp ${target.userHome}/check_islam.cjs hr-backend-server:/app/check_islam.cjs`,
  `sudo docker exec -w /app hr-backend-server node /app/check_islam.cjs`,
  `sudo docker exec -w /app hr-backend-server rm -f /app/check_islam.cjs`,
  `rm -f ${target.userHome}/check_islam.cjs`
].join(' && ');
const output = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "${shCmd}"`, { encoding: 'utf8' });
console.log(output);
fs.unlinkSync('scratch_check_islam.cjs');
