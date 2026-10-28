const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  const res = await pool.query("SELECT * FROM public.sync_logs WHERE created_at >= '2026-10-21 00:00:00' AND action_type LIKE '%PUNCH%' ORDER BY created_at ASC");
  console.log('Sync logs with PUNCH count:', res.rows.length);
  res.rows.forEach(r => {
    console.log(r.created_at, r.action_type, r.entity_key);
  });
  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
