const { execSync } = require('child_process');

const remoteScript = `
const { Pool } = require('pg');
const pool = new Pool({ host: process.env.DB_HOST || 'hr-postgres', port: 5432, database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure' });

async function run() {
  const q = "SELECT * FROM public.biometric_raw_punches WHERE (employee_id = 'emp_1789143997322' OR device_user_pin = '102') AND punch_time >= '2026-09-20' AND punch_time <= '2026-09-28' ORDER BY punch_time ASC";
  const res = await pool.query(q);
  console.log('Punches between 20-28 Sept:', res.rows.length);
  res.rows.forEach(r => {
    console.log(r.id, r.punch_time, r.action_type, r.device_serial, r.branch_id, r.raw_payload);
  });
  await pool.end();
}

run().catch(console.error);
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const out = execSync(`ssh -i vps-p-spark-1803.pem ubuntu@63.183.147.199 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`).toString();
console.log(out);
