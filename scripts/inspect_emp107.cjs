const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'ubuntu@63.183.147.199';

const remoteScript = `
const { Client } = require('pg');
async function run() {
  // Let's inspect via docker exec psql
}
`;

// Let's write a python or sql script on remote and execute via ssh
const sqlQuery = `
SELECT json_build_object(
  'version', version,
  'updated_at', updated_at,
  'lastUpdated', value_data->>'lastUpdated',
  'totalShifts', jsonb_array_length(value_data->'shifts'),
  'deletedIdsCount', jsonb_array_length(COALESCE(value_data->'_deletedIds', '[]'::jsonb)),
  'emp107Shifts', (
    SELECT json_agg(s)
    FROM jsonb_array_elements(value_data->'shifts') s
    WHERE s->>'employeeId' = 'emp_1789231413527' OR s->>'employeeCode' = '107'
  ),
  'matchingDeletedIds', (
    SELECT json_agg(d)
    FROM jsonb_array_elements_text(COALESCE(value_data->'_deletedIds', '[]'::jsonb)) d
    WHERE d ILIKE '%107%' OR d ILIKE '%1789231413527%' OR d ILIKE '%2026-09-2%'
  )
)
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_inspect.sql', sqlQuery, 'utf8');

try {
  console.log('Sending query to VPS...');
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect.sql ${host}:/tmp/temp_inspect.sql`);
  const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_inspect.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`).toString();
  
  const parsed = JSON.parse(result.trim());
  console.log('--- DB SUMMARY ---');
  console.log('Last Updated in DB:', parsed.lastUpdated);
  console.log('Total shifts in DB:', parsed.totalShifts);
  console.log('Deleted IDs in DB:', parsed.deletedIdsCount);
  console.log('Matching Deleted IDs for 107/dates:', parsed.matchingDeletedIds);
  
  console.log('\\n--- EMP 107 SHIFTS (' + (parsed.emp107Shifts ? parsed.emp107Shifts.length : 0) + ') ---');
  if (parsed.emp107Shifts) {
    const byBranch = {};
    parsed.emp107Shifts.forEach(s => {
      const b = s.branchName || s.branchId || 'Unknown';
      byBranch[b] = (byBranch[b] || 0) + 1;
      console.log(`[${s.date}] Branch: ${b} | ${s.timeIn || s.punchIn} -> ${s.timeOut || s.punchOut} | Total: ${s.totalHours || s.hoursWorked} hrs | ID: ${s.id}`);
    });
    console.log('\\nShift count by branch:', byBranch);
  }
} catch (e) {
  console.error('Error:', e.message);
  if (e.stdout) console.log('Stdout:', e.stdout.toString());
  if (e.stderr) console.log('Stderr:', e.stderr.toString());
} finally {
  if (fs.existsSync('temp_inspect.sql')) fs.unlinkSync('temp_inspect.sql');
}
