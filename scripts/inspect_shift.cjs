const fs = require('fs');
const { execSync } = require('child_process');

const sql = `
SELECT s
FROM app_settings,
     jsonb_array_elements(value_data->'shifts') s
WHERE key_name = 'pharmacy-tracker-data'
  AND (s->>'employeeId' = 'emp_1789231413527' OR s->>'employeeCode' = '107')
  AND s->>'date' IN ('2026-09-23', '2026-09-24', '2026-09-27');
`;

fs.writeFileSync('temp_q.sql', sql, 'utf8');
try {
  execSync('scp -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no temp_q.sql ubuntu@63.183.147.199:/tmp/temp_q.sql');
  const res = execSync('ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "cat /tmp/temp_q.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"').toString();
  console.log('Shifts on 23, 24, 27:\n', res);
} finally {
  if (fs.existsSync('temp_q.sql')) fs.unlinkSync('temp_q.sql');
}
