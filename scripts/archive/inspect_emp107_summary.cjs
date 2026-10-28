const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const sqlQuery = `
SELECT json_build_object(
  'employee', (
    SELECT e
    FROM jsonb_array_elements(value_data->'employees') e
    WHERE e->>'code' = '107' OR e->>'id' = 'emp_1789231413527'
    LIMIT 1
  ),
  'rosters107', (
    SELECT json_agg(r)
    FROM jsonb_array_elements(value_data->'rosters') r
    WHERE r->>'employeeCode' = '107' OR r->>'employeeId' = 'emp_1789231413527'
  ),
  'allRostersForMedina', (
    SELECT json_agg(json_build_object('id', r->>'id', 'month', r->>'month', 'branchId', r->>'branchId', 'branchName', r->>'branchName', 'employeeName', r->>'employeeName', 'employeeCode', r->>'employeeCode', 'status', r->>'status'))
    FROM jsonb_array_elements(value_data->'rosters') r
    WHERE r->>'branchName' ILIKE '%المدينة%' OR r->>'branchId' = 'branch_1789143007629'
  )
)
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_inspect_107_summary.sql', sqlQuery, 'utf8');

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect_107_summary.sql ${host}:/tmp/temp_inspect_107_summary.sql`);
  const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_inspect_107_summary.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`).toString();
  
  const data = JSON.parse(result.trim());
  console.log('=== EMPLOYEE ===');
  console.log(data.employee);
  console.log('=== ROSTERS FOR 107 ===');
  console.log(JSON.stringify(data.rosters107, null, 2));
  console.log('=== MEDINA ROSTERS ===');
  console.log(JSON.stringify(data.allRostersForMedina, null, 2));
} catch (err) {
  console.error('Error:', err);
} finally {
  if (fs.existsSync('temp_inspect_107_summary.sql')) fs.unlinkSync('temp_inspect_107_summary.sql');
}
