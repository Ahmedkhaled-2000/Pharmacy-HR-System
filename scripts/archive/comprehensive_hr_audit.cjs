const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const sqlQuery = `
SELECT json_build_object(
  'totalEmployees', jsonb_array_length(value_data->'employees'),
  'totalShifts', jsonb_array_length(value_data->'shifts'),
  'totalRosters', jsonb_array_length(value_data->'rosters'),
  'totalRequests', jsonb_array_length(value_data->'requests'),
  'totalLateIncidents', jsonb_array_length(COALESCE(value_data->'lateIncidents', '[]'::jsonb)),
  
  -- 1. Employees with missing or irregular contracts / rates
  'employeesWithZeroSalary', (
    SELECT json_agg(json_build_object('id', e->>'id', 'code', e->>'code', 'name', e->>'name', 'branch', e->>'branchName', 'salary', e->>'salary'))
    FROM jsonb_array_elements(value_data->'employees') e
    WHERE (e->>'salary')::numeric <= 0 OR e->>'salary' IS NULL
  ),
  
  -- 2. Shifts with abnormal hours (< 0 or > 24 or NaN)
  'abnormalShifts', (
    SELECT json_agg(json_build_object('id', s->>'id', 'empCode', s->>'employeeCode', 'empName', s->>'employeeName', 'date', s->>'date', 'in', s->>'timeIn', 'out', s->>'timeOut', 'hours', s->>'hours', 'netHours', s->>'netHours'))
    FROM jsonb_array_elements(value_data->'shifts') s
    WHERE (s->>'hours')::numeric < 0 OR (s->>'hours')::numeric > 24 OR (s->>'netHours')::numeric < 0 OR s->>'hours' = 'NaN'
  ),

  -- 3. Potential duplicate shifts (same employee, same date, overlapping time or multiple shifts)
  'duplicateShiftsCount', (
    SELECT COUNT(*) FROM (
      SELECT s->>'employeeId' as empId, s->>'date' as sDate, COUNT(*)
      FROM jsonb_array_elements(value_data->'shifts') s
      WHERE s->>'date' >= '2026-09-21'
      GROUP BY s->>'employeeId', s->>'date'
      HAVING COUNT(*) > 1
    ) sub
  ),
  
  -- 4. Multi-branch employees
  'multiBranchEmployees', (
    SELECT json_agg(json_build_object('code', e->>'code', 'name', e->>'name', 'branches', e->'branchesDetails'))
    FROM jsonb_array_elements(value_data->'employees') e
    WHERE jsonb_array_length(COALESCE(e->'branchesDetails', '[]'::jsonb)) > 1
  ),

  -- 5. Late incidents breakdown
  'lateIncidentsBreakdown', (
    SELECT json_agg(json_build_object('branch', inc->>'branchName', 'empCode', inc->>'employeeCode', 'date', inc->>'date', 'lateMins', inc->>'lateMinutes', 'action', inc->>'actionLabel', 'deductionMins', inc->>'deductionMinutes', 'status', inc->>'status'))
    FROM jsonb_array_elements(COALESCE(value_data->'lateIncidents', '[]'::jsonb)) inc
    WHERE inc->>'date' >= '2026-09-21'
  )
)
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_comp_audit.sql', sqlQuery, 'utf8');

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_comp_audit.sql ${host}:/tmp/temp_comp_audit.sql`);
  const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_comp_audit.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`).toString();
  
  const report = JSON.parse(result.trim());
  console.log('=== SYSTEM AUDIT SUMMARY ===');
  console.log('Employees:', report.totalEmployees);
  console.log('Shifts:', report.totalShifts);
  console.log('Rosters:', report.totalRosters);
  console.log('Requests:', report.totalRequests);
  console.log('Late Incidents:', report.totalLateIncidents);
  console.log('Duplicate Shifts in Current Cycle:', report.duplicateShiftsCount);
  console.log('Abnormal Shifts count:', report.abnormalShifts ? report.abnormalShifts.length : 0);
  console.log('Employees with 0 or missing salary:', report.employeesWithZeroSalary ? report.employeesWithZeroSalary.length : 0);
  if (report.employeesWithZeroSalary) console.log(report.employeesWithZeroSalary);
  console.log('Multi-branch employees count:', report.multiBranchEmployees ? report.multiBranchEmployees.length : 0);
  if (report.multiBranchEmployees) console.log(JSON.stringify(report.multiBranchEmployees, null, 2));
  console.log('Late incidents count in current cycle:', report.lateIncidentsBreakdown ? report.lateIncidentsBreakdown.length : 0);

} catch (err) {
  console.error('Audit Error:', err);
} finally {
  if (fs.existsSync('temp_comp_audit.sql')) fs.unlinkSync('temp_comp_audit.sql');
}
