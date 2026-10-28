const { execSync } = require('child_process');

const sql = process.argv[2] || `SELECT id, device_serial, device_user_pin, punch_time, verify_type, raw_punch_state, action_type, process_status, process_notes FROM public.biometric_raw_punches WHERE device_user_pin = '115' OR employee_name LIKE '%على شعبان%' ORDER BY punch_time DESC LIMIT 25;`;

const b64 = Buffer.from(sql, 'utf8').toString('base64');
const remoteCmd = `echo ${b64} | base64 -d | sudo docker exec -i hr-postgres psql -U postgres -d postgres`;

try {
  const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "${remoteCmd}"`, { encoding: 'utf8' });
  console.log(out);
} catch (err) {
  console.error('Error running remote sql:', err.message);
  if (err.stdout) console.log('Stdout:', err.stdout);
  if (err.stderr) console.error('Stderr:', err.stderr);
}
