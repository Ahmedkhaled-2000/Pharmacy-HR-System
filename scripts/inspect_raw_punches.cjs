const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'biometric_raw_punches'");
  console.log('biometric_raw_punches columns:', cols.rows.map(x => x.column_name));

  const punches = await pool.query("SELECT * FROM public.biometric_raw_punches ORDER BY punch_time DESC LIMIT 50");
  console.log('Recent raw punches count:', punches.rows.length);
  punches.rows.forEach(p => console.log(p.punch_time, p.employee_id || p.user_id, p.device_sn || p.device_id, p.punch_type || p.status));

  await pool.end();
}

run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
