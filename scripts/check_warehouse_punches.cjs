const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const { Pool } = require('pg');
const Redis = require('ioredis');

async function run() {
  const pool = new Pool({
    host: 'hr-postgres', database: 'postgres', user: 'postgres', password: 'postgres_hr_2026_super_secure'
  });
  const redis = new Redis({ host: 'hr-redis', port: 6379 });

  const res = await pool.query("SELECT id, employee_id, device_user_pin, employee_name, punch_time, punch_type, action_type, branch_id FROM public.biometric_raw_punches WHERE employee_id IN ('emp_1789240567148', 'emp_1789240708342', 'emp_1789243330471', 'emp_1789297446904_4w6jk', 'emp_1789320128545_iz83s') OR device_user_pin IN ('112', '113', '119', '1001', '1146') ORDER BY punch_time DESC LIMIT 20");
  console.log('Warehouse raw punches count:', res.rows.length);
  for (const r of res.rows) {
    console.log(r.punch_time, r.device_user_pin, r.employee_name, r.action_type);
  }

  // Check state in Redis
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  console.log('\\n--- Warehouse employees in state.shifts (recent) ---');
  const whIds = new Set(['emp_1789240567148', 'emp_1789240708342', 'emp_1789243330471', 'emp_1789297446904_4w6jk', 'emp_1789320128545_iz83s', '112', '113', '119', '1001', '1146']);
  const whShifts = (state.shifts || []).filter(s => whIds.has(String(s.employeeId)) || whIds.has(String(s.employeeCode)));
  const recentWh = whShifts.filter(s => s.date >= '2026-10-19');
  for (const s of recentWh) {
    console.log(s.date, s.employeeName, s.employeeCode || s.employeeId, s.timeIn, '->', s.timeOut, 'hours:', s.hours, 'branch:', s.branchName || s.branchId);
  }

  redis.disconnect();
  await pool.end();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
