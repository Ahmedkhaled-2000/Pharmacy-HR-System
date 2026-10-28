const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  
  const res = await pool.query("SELECT * FROM public.audit_logs WHERE timestamp >= '2026-10-21 00:00:00' ORDER BY timestamp ASC LIMIT 50");
  console.log('Audit logs count:', res.rows.length);
  for (const r of res.rows) {
    console.log(r.timestamp, r.action, r.entity, r.user_id, JSON.stringify(r.details || {}));
  }

  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
