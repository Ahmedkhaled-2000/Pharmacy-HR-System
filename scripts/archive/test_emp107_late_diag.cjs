const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

// We can fetch state or test directly on remote!
const remoteScript = `
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@hr-postgres:5432/hr_db' });

async function run() {
  const res = await pool.query("SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data'");
  const state = res.rows[0].value_data;
  
  const emp = (state.employees || []).find(e => String(e.code) === '107' || e.id === 'emp_1789231413527');
  console.log('Employee:', emp.name, 'id:', emp.id);
  
  // Let's import or inspect the functions
  // Or check shifts for 107
  const shifts = (state.shifts || []).filter(s => s.employeeId === emp.id || s.employeeCode === emp.code);
  console.log('Total shifts for 107:', shifts.length);
  
  const medinaShifts = shifts.filter(s => s.branchName && s.branchName.includes('المدينه'));
  console.log('Medina shifts count:', medinaShifts.length);
  
  // Check rosters for 107
  const rosters = (state.rosters || []).filter(r => r.employeeId === emp.id || r.employeeCode === emp.code);
  console.log('Rosters for 107:', rosters.map(r => ({ id: r.id, branchName: r.branchName, month: r.month, fromDate: r.fromDate, toDate: r.toDate, status: r.status })));
  
  // Check each medina shift
  medinaShifts.forEach(s => {
    console.log('Shift Date:', s.date, 'In:', s.timeIn, 'Out:', s.timeOut, 'branch:', s.branchName);
  });
  
  await pool.end();
}
run().catch(console.error);
`;

fs.writeFileSync('temp_remote_diag.js', remoteScript, 'utf8');

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_remote_diag.js ${host}:/tmp/temp_remote_diag.js`);
  execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_remote_diag.js hr-backend-server:/tmp/temp_remote_diag.js"`);
  const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker exec hr-backend-server node /tmp/temp_remote_diag.js"`).toString();
  console.log(out);
} catch (e) {
  console.error(e);
} finally {
  if (fs.existsSync('temp_remote_diag.js')) fs.unlinkSync('temp_remote_diag.js');
}
