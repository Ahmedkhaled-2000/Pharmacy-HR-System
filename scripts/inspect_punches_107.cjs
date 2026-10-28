const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const { Pool } = require('pg');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });
const pool = new Pool({
  host: process.env.DB_HOST || 'hr-postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres_hr_2026_super_secure'
});

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const empId = 'emp_1789231413527';
  const empCode = '107';

  console.log('=== SHIFTS IN STATE FOR EMP 107 ===');
  const shifts107 = (state.shifts || []).filter(s => String(s.employeeId) === empId || String(s.employeeId) === empCode || String(s.employeeCode) === empCode);
  console.log('Shifts count:', shifts107.length);
  shifts107.sort((a,b) => (a.date || '').localeCompare(b.date || '')).slice(-15).forEach(s => {
    console.log({
      id: s.id,
      date: s.date,
      branchId: s.branchId,
      branchName: s.branchName,
      timeIn: s.timeIn,
      timeOut: s.timeOut,
      hours: s.hours,
      effectiveHours: s.effectiveHours
    });
  });

  console.log('\\n=== BIOMETRIC RAW PUNCHES IN DB ===');
  const punches = await pool.query(
    "SELECT * FROM public.biometric_raw_punches WHERE employee_id = '107' OR employee_id = $1 ORDER BY punch_time ASC",
    [empId]
  );
  console.log('Raw punches count:', punches.rows.length);
  punches.rows.slice(-15).forEach(p => {
    console.log(p);
  });

  console.log('\\n=== LATE INCIDENTS IN STATE ===');
  const lateIncidents = (state.lateIncidents || []).filter(l => String(l.employeeId) === empId || String(l.employeeCode) === empCode);
  console.log('lateIncidents count:', lateIncidents.length);
  lateIncidents.forEach(l => console.log(l));

  console.log('\\n=== LATE PENALTIES IN STATE.REQUESTS ===');
  const lateReqs = (state.requests || []).filter(r => (String(r.employeeId) === empId || String(r.employeeCode) === empCode) && (r.type === 'penalty' || r.type === 'lateness' || r.type === 'late_penalty' || (r.reason && r.reason.includes('تأخير'))));
  console.log('late penalty requests count:', lateReqs.length);
  lateReqs.forEach(r => console.log({ id: r.id, date: r.date, type: r.type, reason: r.reason, amount: r.amount, status: r.status }));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
