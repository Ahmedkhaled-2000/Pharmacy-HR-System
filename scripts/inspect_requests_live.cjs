const { execSync } = require('child_process');

console.log('--- 1. Checking Redis requests ---');
const cmdRedis = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get hr:settings:pharmacy-tracker-data"`;
const raw = execSync(cmdRedis, { maxBuffer: 100 * 1024 * 1024 }).toString();
const state = JSON.parse(raw);

const reqs = state.requests || [];
const leaveReqs = state.leaveRequests || [];
const loans = state.loans || [];
const swaps = state.shiftSwaps || [];

console.log(`state.requests count: ${reqs.length}`);
reqs.slice(0, 15).forEach(r => {
  console.log(`  ID: ${r.id} | Type: ${r.type} | Emp: ${r.employeeName || r.employeeId} | Status: ${r.status} | adminApproved: ${r.adminApproved} | branchApproved: ${r.branchApproved} | updatedAt: ${r.updatedAt}`);
});

console.log('\n--- 2. Checking Postgres public.requests table ---');
const cmdPg = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-postgres psql -U hr_user -d hr_db -c 'SELECT id, status, employee_id, request_type, created_at, updated_at FROM public.requests ORDER BY created_at DESC LIMIT 10;'"`;
const pgOut = execSync(cmdPg).toString();
console.log(pgOut);
