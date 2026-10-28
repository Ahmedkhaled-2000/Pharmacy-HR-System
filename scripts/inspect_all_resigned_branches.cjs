const { execSync } = require('child_process');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get hr:settings:pharmacy-tracker-data"`;
const raw = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
const state = JSON.parse(raw);

const employees = state.employees || [];
const requests = state.requests || [];
const branches = state.branches || [];

console.log('=== AUDITING RESIGNATIONS AND BRANCH ASSIGNMENTS ===');

// 1. Check all resignation requests
const resignationRequests = requests.filter(r =>
  r && (
    r.type === 'resignation' ||
    r.type === 'end_service' ||
    r.requestType === 'resignation' ||
    r.requestType === 'end_service' ||
    String(r.type || '').includes('resign') ||
    String(r.id || '').includes('resig')
  )
);
console.log(`Found ${resignationRequests.length} resignation requests in state.requests:`);
resignationRequests.forEach(r => {
  console.log(`  Req: ${r.id} | Emp: ${r.employeeName} (${r.employeeCode || r.employeeId}) | Branch: ${r.branchName || r.branchId} | Status: ${r.status} | Date: ${r.date || r.resignationDate || r.createdAt}`);
});

// 2. Check all employees with branchesDetails
console.log('\n=== EMPLOYEES WITH MULTIPLE BRANCHES OR RESIGNED BRANCHES ===');
employees.forEach(emp => {
  const bDetails = emp.branchesDetails || [];
  const archived = emp.archivedBranchesDetails || [];
  const resignedList = emp.resignedBranches || [];
  
  const hasInactiveBranch = bDetails.some(bd => 
    bd.isResigned || bd.resigned || bd.status === 'resigned' || bd.status === 'cycle_terminated' || bd.status === 'terminated' || bd.isTerminatedInCycle || bd.terminationDate
  );

  if (bDetails.length > 1 || archived.length > 0 || resignedList.length > 0 || hasInactiveBranch) {
    console.log(`\nEmployee: [${emp.code}] ${emp.name} (id: ${emp.id})`);
    console.log(`  isMultiBranch: ${emp.isMultiBranch}, status: ${emp.status}, mainBranch: ${emp.branchId}`);
    console.log(`  branchesDetails (${bDetails.length}):`);
    bDetails.forEach(bd => {
      console.log(`    - Branch: ${bd.branchName || bd.branchId} (id: ${bd.branchId}) | status: ${bd.status} | isResigned: ${bd.isResigned} | resigned: ${bd.resigned} | termDate: ${bd.terminationDate || bd.resignationDate}`);
    });
    if (archived.length > 0) {
      console.log(`  archivedBranchesDetails (${archived.length}):`);
      archived.forEach(bd => console.log(`    - Archived Branch: ${bd.branchName || bd.branchId} (id: ${bd.branchId})`));
    }
    if (resignedList.length > 0) {
      console.log(`  resignedBranches:`, resignedList);
    }
  }
});
