const { execSync } = require('child_process');
const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "docker exec hr-redis redis-cli get hr:settings:pharmacy-tracker-data"`;
const raw = execSync(cmd, { maxBuffer: 100 * 1024 * 1024 }).toString();
const state = JSON.parse(raw);

const emp107 = state.employees.find(e => e.code === '107');
console.log('107 archivedBranchesDetails:', JSON.stringify(emp107.archivedBranchesDetails, null, 2));

const emp109 = state.employees.find(e => e.code === '109');
console.log('109 archivedBranchesDetails:', JSON.stringify(emp109.archivedBranchesDetails, null, 2));
