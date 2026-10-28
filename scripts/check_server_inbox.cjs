const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'server_inbox'");
  console.log('server_inbox columns:', cols.rows.map(x => x.column_name));
  const res = await pool.query("SELECT * FROM public.server_inbox ORDER BY created_at DESC LIMIT 10");
  console.log('server_inbox rows count:', res.rows.length);
  res.rows.forEach(r => console.log(r.created_at, r.message_type || r.type, r.id));
  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
