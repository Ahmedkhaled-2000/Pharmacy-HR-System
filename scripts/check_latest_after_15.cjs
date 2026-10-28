const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  const res = await pool.query("SELECT * FROM public.biometric_raw_punches WHERE punch_time >= '2026-10-21 15:00:00' ORDER BY punch_time ASC");
  console.log('Punches after 15:00 count:', res.rows.length);
  res.rows.forEach(r => console.log(r.id, r.punch_time, r.employee_name, r.action_type, r.branch_id));
  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
