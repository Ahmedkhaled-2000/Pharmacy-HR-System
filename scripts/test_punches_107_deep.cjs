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
  const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

  console.log('=== EMP 107 INFO ===');
  console.log('Name:', emp.name, 'Code:', emp.code, 'Id:', emp.id);
  console.log('Schedule type:', emp.scheduleType, 'noMonthlySchedule:', emp.noMonthlySchedule, 'isVariableHours:', emp.isVariableHours);

  // Raw biometric punches in Postgres
  const punches = await pool.query(
    "SELECT * FROM public.biometric_raw_punches WHERE employee_id = '107' OR employee_id = $1 ORDER BY punch_time ASC",
    [empId]
  );
  console.log('\\n=== RAW PUNCHES IN POSTGRES COUNT ===', punches.rows.length);
  punches.rows.forEach(p => {
    console.log(p.punch_time, 'type:', p.punch_type, 'sn:', p.device_sn, 'branch:', p.branch_id);
  });

  // Shifts in state.shifts for 107
  const shifts107 = (state.shifts || []).filter(s => (s.employeeId === empId || s.employeeCode === '107'));
  console.log('\\n=== SHIFTS IN STATE.SHIFTS COUNT ===', shifts107.length);
  shifts107.forEach(s => {
    console.log({
      id: s.id,
      date: s.date,
      branchId: s.branchId,
      branchName: s.branchName,
      punchIn: s.punchIn,
      punchOut: s.punchOut,
      shiftStart: s.shiftStart,
      shiftEnd: s.shiftEnd,
      scheduledStart: s.scheduledStart,
      lateMinutes: s.lateMinutes,
      lateTier: s.lateTier,
      isLate: s.isLate
    });
  });

  // Late incidents in state.lateIncidents for 107
  const lates = (state.lateIncidents || []).filter(l => l.employeeId === empId || l.employeeCode === '107');
  console.log('\\n=== LATE INCIDENTS IN STATE.LATEINCIDENTS COUNT ===', lates.length);
  lates.forEach(l => {
    console.log(l);
  });

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
