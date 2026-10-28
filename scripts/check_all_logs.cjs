const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  
  // Check app_versions or audit_logs or change_log
  try {
    const av = await pool.query("SELECT id, version, created_at, length(value_data::text) as len FROM public.app_versions ORDER BY version DESC LIMIT 10");
    console.log('=== APP_VERSIONS ===');
    console.log(av.rows);
  } catch (e) { console.log('app_versions error:', e.message); }

  try {
    const cl = await pool.query("SELECT id, entity_name, change_type, created_at FROM public.change_log ORDER BY created_at DESC LIMIT 20");
    console.log('=== CHANGE_LOG ===');
    console.log(cl.rows);
  } catch (e) { console.log('change_log error:', e.message); }

  try {
    const al = await pool.query("SELECT id, action, entity_type, created_at FROM public.audit_logs ORDER BY created_at DESC LIMIT 20");
    console.log('=== AUDIT_LOGS ===');
    console.log(al.rows);
  } catch (e) { console.log('audit_logs error:', e.message); }

  // Check if there are any other tables with data
  const t = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log('=== TABLES ===');
  console.log(t.rows.map(x => x.table_name));

  await pool.end();
}

run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
