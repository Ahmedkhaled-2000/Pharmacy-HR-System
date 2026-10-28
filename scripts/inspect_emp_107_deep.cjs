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

  console.log('=== SAMPLE ROSTER ENTRIES (first 3) ===');
  console.log(JSON.stringify((state.rosters || []).slice(0, 3), null, 2));

  // Find all rosters for Medina branch or Employee 107
  const empId = 'emp_1789231413527';
  const medinaBranchId = 'branch_1789241578010';
  const komiBranchId = 'branch_1789142992139';

  const medinaRosters = (state.rosters || []).filter(r => r.branchId === medinaBranchId || (r.branchName && r.branchName.includes('المدينه')));
  console.log('\\n=== MEDINA ROSTERS COUNT ===', medinaRosters.length);
  medinaRosters.forEach(r => {
    console.log('Roster:', { id: r.id, branchId: r.branchId, branchName: r.branchName, month: r.month, year: r.year, period: r.period, updatedAt: r.updatedAt, status: r.status });
    // Check if 107 is in this roster
    const str = JSON.stringify(r);
    console.log('Contains 107 or empId?', str.includes('107') || str.includes(empId));
    if (r.shifts || r.schedule || r.roster || r.days || r.employeeSchedules || r.entries) {
      const keys = Object.keys(r.shifts || r.schedule || r.roster || r.days || r.employeeSchedules || r.entries || {});
      console.log('Roster subkeys/emps:', keys);
    }
  });

  const empRosters = (state.rosters || []).filter(r => JSON.stringify(r).includes('107') || JSON.stringify(r).includes(empId));
  console.log('\\n=== ROSTERS CONTAINING EMP 107 COUNT ===', empRosters.length);
  empRosters.forEach(r => {
    console.log('Emp Roster:', { id: r.id, branchId: r.branchId, branchName: r.branchName, month: r.month, year: r.year, period: r.period });
    // Print what is stored for emp 107 in this roster
    for (const [k, v] of Object.entries(r)) {
      const s = JSON.stringify(v);
      if (s.includes('107') || s.includes(empId)) {
        console.log('Field with 107:', k, typeof v, Array.isArray(v) ? 'array len ' + v.length : Object.keys(v || {}));
        if (typeof v === 'object' && v !== null) {
          if (v[empId] || v['107']) {
            console.log('Direct mapping for emp in ' + k + ':', JSON.stringify(v[empId] || v['107']));
          }
        }
      }
    }
  });

  // Check columns of biometric_raw_punches
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'biometric_raw_punches'");
  console.log('\\n=== BIOMETRIC_RAW_PUNCHES COLUMNS ===', cols.rows.map(c => c.column_name));

  // Check punches for 107
  const punches = await pool.query("SELECT * FROM public.biometric_raw_punches WHERE employee_id = '107' OR employee_id = $1 ORDER BY punch_time DESC LIMIT 20", [empId]);
  console.log('\\n=== RAW PUNCHES FOR 107 ===', punches.rows);

  // Check attendance records in state for 107
  const att107 = (state.attendance || []).filter(a => a.employeeId === empId || a.employeeCode === '107' || a.employeeId === '107');
  console.log('\\n=== ATTENDANCE IN STATE FOR 107 COUNT ===', att107.length);
  console.log('Sample state attendance:', att107.slice(-5));

  // Check branchesDetails[0].schedule for emp 107
  const emp = (state.employees || []).find(e => e.id === empId);
  console.log('\\n=== EMP 107 BRANCHES DETAILS ===');
  console.log(JSON.stringify(emp.branchesDetails, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  console.log(out);
} catch (e) {
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
