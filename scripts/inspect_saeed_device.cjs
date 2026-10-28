const { execSync } = require('child_process');

const remoteScript = `
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres_hr_2026_super_secure',
    database: process.env.POSTGRES_DB || 'postgres'
  });

  const res = await pool.query(\`
    UPDATE public.biometric_device_commands 
    SET status = 'CANCELLED', response_payload = 'تم الإلغاء لتنظيف الطابور وفك التعليق عن الجهاز'
    WHERE device_serial = 'EUF7242701598' AND status IN ('PENDING', 'SENT')
    RETURNING id, command_text
  \`);
  console.log('✅ Cancelled commands count:', res.rowCount);
  console.log(JSON.stringify(res.rows, null, 2));

  await pool.end();
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
`;

const b64 = Buffer.from(remoteScript).toString('base64');
const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;

console.log(execSync(cmd, { encoding: 'utf8' }));
