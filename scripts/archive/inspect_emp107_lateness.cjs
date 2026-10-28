const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const sqlQuery = `
SELECT json_build_object(
  'employee', (
    SELECT e
    FROM jsonb_array_elements(value_data->'employees') e
    WHERE e->>'code' = '107' OR e->>'id' = 'emp_1789231413527' OR e->>'name' ILIKE '%عبد الرحمن%'
    LIMIT 1
  ),
  'branches', (
    SELECT json_agg(b)
    FROM jsonb_array_elements(value_data->'branches') b
  ),
  'rosters107', (
    SELECT json_agg(r)
    FROM jsonb_array_elements(value_data->'rosters') r
    WHERE r->>'employeeCode' = '107' OR r->>'employeeId' = 'emp_1789231413527'
  ),
  'shifts107', (
    SELECT json_agg(s)
    FROM jsonb_array_elements(value_data->'shifts') s
    WHERE (s->>'employeeCode' = '107' OR s->>'employeeId' = 'emp_1789231413527')
      AND s->>'date' >= '2026-09-20'
  ),
  'lateIncidents107', (
    SELECT json_agg(inc)
    FROM jsonb_array_elements(COALESCE(value_data->'lateIncidents', '[]'::jsonb)) inc
    WHERE inc->>'employeeCode' = '107' OR inc->>'employeeId' = 'emp_1789231413527'
  ),
  'requests107', (
    SELECT json_agg(req)
    FROM jsonb_array_elements(COALESCE(value_data->'requests', '[]'::jsonb)) req
    WHERE req->>'employeeCode' = '107' OR req->>'employeeId' = 'emp_1789231413527'
  ),
  'bylaws', value_data->'bylaws',
  'latePenaltyPolicy', value_data->'latePenaltyPolicy'
)
FROM app_settings
WHERE key_name = 'pharmacy-tracker-data';
`;

fs.writeFileSync('temp_inspect_107.sql', sqlQuery, 'utf8');

try {
  execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_inspect_107.sql ${host}:/tmp/temp_inspect_107.sql`);
  const result = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "cat /tmp/temp_inspect_107.sql | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`).toString();
  
  const data = JSON.parse(result.trim());
  console.log('=== EMPLOYEE 107 ===');
  console.log('Name:', data.employee?.name);
  console.log('Code:', data.employee?.code);
  console.log('ID:', data.employee?.id);
  console.log('BranchId:', data.employee?.branchId);
  console.log('noMonthlySchedule:', data.employee?.noMonthlySchedule);
  console.log('scheduleType:', data.employee?.scheduleType);
  console.log('variableHours:', data.employee?.variableHours);
  console.log('branchesDetails:', JSON.stringify(data.employee?.branchesDetails, null, 2));

  console.log('\n=== ROSTERS FOR 107 ===');
  if (data.rosters107 && data.rosters107.length > 0) {
    data.rosters107.forEach(r => {
      console.log('Roster:', {
        id: r.id,
        branchId: r.branchId,
        branchName: r.branchName,
        month: r.month,
        status: r.status,
        scheduleKeysCount: r.schedule ? Object.keys(r.schedule).length : 0,
        sampleSchedule: r.schedule ? Object.entries(r.schedule).slice(0, 5) : null
      });
    });
  } else {
    console.log('NO ROSTERS FOUND for 107!');
  }

  console.log('\n=== SHIFTS FOR 107 (Since 2026-09-20) ===');
  if (data.shifts107) {
    data.shifts107.sort((a,b) => a.date.localeCompare(b.date));
    data.shifts107.forEach(s => {
      console.log(`[${s.date}] Branch: ${s.branchName || s.branchId} | In: ${s.timeIn || s.punchIn} Out: ${s.timeOut || s.punchOut} | SchedStart: ${s.scheduledStart} SchedEnd: ${s.scheduledEnd} | Lateness: ${s.latenessMinutes} mins | Exempt: ${s.latePenaltyExempt || s.isPenaltyExempt}`);
    });
  } else {
    console.log('NO SHIFTS FOUND!');
  }

  console.log('\n=== LATE INCIDENTS FOR 107 ===');
  console.log(JSON.stringify(data.lateIncidents107, null, 2));

  console.log('\n=== REQUESTS FOR 107 ===');
  if (data.requests107) {
    data.requests107.forEach(req => {
      console.log(`Req: ${req.id} | Type: ${req.type} | SubType: ${req.subType} | Status: ${req.status} | Date: ${req.date || req.startDate} | Desc: ${req.reason || req.notes || req.title}`);
    });
  }

} catch (err) {
  console.error('Error:', err);
} finally {
  if (fs.existsSync('temp_inspect_107.sql')) fs.unlinkSync('temp_inspect_107.sql');
}
