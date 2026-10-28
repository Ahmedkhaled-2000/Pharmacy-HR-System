const { execSync } = require('child_process');
const fs = require('fs');

const scriptContent = `
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres_hr_2026_super_secure@postgres:5432/postgres' });

async function check() {
  const cmds = await pool.query("SELECT * FROM biometric_device_commands WHERE id >= 1556 ORDER BY id ASC;");
  console.log('Commands >= 1556:', cmds.rows);

  const punches = await pool.query("SELECT * FROM biometric_raw_punches ORDER BY id DESC LIMIT 5;");
  console.log('Latest punches:', punches.rows.map(p => ({ id: p.id, pin: p.device_user_pin, name: p.employee_name, time: p.punch_time, dev: p.device_serial })));
}
check().then(() => pool.end()).catch(console.error);
`;

fs.writeFileSync('temp_check_emp.cjs', scriptContent);

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_check_emp.cjs ${host}:/tmp/temp_check_emp.cjs`, { stdio: 'inherit' });
  execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_check_emp.cjs hr-backend-server:/app/temp_check_emp.cjs && sudo docker exec hr-backend-server node /app/temp_check_emp.cjs"`, { stdio: 'inherit' });
} finally {
  if (fs.existsSync('temp_check_emp.cjs')) fs.unlinkSync('temp_check_emp.cjs');
}
