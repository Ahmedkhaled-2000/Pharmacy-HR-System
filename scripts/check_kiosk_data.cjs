const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  
  // Check any logs or tables that might record kiosk punches
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
  console.log('Tables:', tables.rows.map(t => t.table_name));

  // Check if there is an audit or punch log
  if (tables.rows.some(t => t.table_name === 'biometric_audit_log')) {
    const audit = await pool.query("SELECT * FROM public.biometric_audit_log WHERE created_at >= '2026-10-21 00:00:00' ORDER BY created_at ASC");
    console.log('Audit count today:', audit.rows.length);
  }

  // Check app_settings history or backups
  const backups = await pool.query("SELECT key_name, updated_at FROM public.app_settings ORDER BY updated_at DESC");
  console.log('App settings keys:', backups.rows);

  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
