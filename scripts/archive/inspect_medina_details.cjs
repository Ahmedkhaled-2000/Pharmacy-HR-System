const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const sqlQuery = `
SELECT json_build_object(
  'medina_roster', (
    SELECT r
    FROM jsonb_array_elements(value_data->'rosters') r
    WHERE (r->>'employeeCode' = '107' OR r->>'employeeId' = 'emp_1789231413527')
      AND r->>'branchName' ILIKE '%المدينه%'
    LIMIT 1
  ),
  'shifts_medina', (
    SELECT json_agg(s)
    FROM jsonb_array_elements(value_data->'shifts') s
    WHERE (s->>'employeeCode' = '107' OR s->>'employeeId' = 'emp_1789231413527')
      AND s->>'branchName' ILIKE '%المدينه%'
  )
)
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_inspect_medina.sql', sqlQuery, 'utf8');

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect_medina.sql ${host}:/tmp/temp_inspect_medina.sql`);
  const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_inspect_medina.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`).toString();
  
  const data = JSON.parse(result.trim());
  console.log('Medina Roster ID:', data.medina_roster?.id);
  console.log('Medina Roster Dates:', Object.keys(data.medina_roster?.schedule || {}));
  
  console.log('\nSchedule entries for 2026-09-21 to 2026-10-04:');
  Object.entries(data.medina_roster?.schedule || {}).forEach(([k, v]) => {
    if (k.startsWith('2026-09-2') || k.startsWith('2026-09-3') || k.startsWith('2026-10-0')) {
      console.log(`[${k}] =>`, v);
    }
  });

  console.log('\nMedina Shifts:');
  (data.shifts_medina || []).forEach(s => {
    console.log(`[${s.date}] In: ${s.timeIn || s.punchIn} | Out: ${s.timeOut || s.punchOut} | SchedStart: ${s.scheduledStart} | SchedEnd: ${s.scheduledEnd}`);
  });

} catch (err) {
  console.error('Error:', err);
} finally {
  if (fs.existsSync('temp_inspect_medina.sql')) fs.unlinkSync('temp_inspect_medina.sql');
}
