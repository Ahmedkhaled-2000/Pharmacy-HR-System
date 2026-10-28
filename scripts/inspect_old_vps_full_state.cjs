const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('/app/old_full_state.json', 'utf8'));
console.log('full_state.json size:', fs.statSync('/app/old_full_state.json').size);
console.log('Today shifts in full_state.json:');
const s21 = (state.shifts || []).filter(s => s.date === '2026-10-21');
console.log('Count:', s21.length);
s21.forEach(s => console.log(s.id, s.employeeCode, s.employeeName, s.branchName, s.timeIn, s.timeOut));

console.log('Active shifts keys in full_state.json:');
console.log(Object.keys(state.activeShifts || {}));
for (const [k, v] of Object.entries(state.activeShifts || {})) {
  console.log('  ', k, v?.employeeName, v?.branchName, v?.timeIn);
}
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "sudo docker cp /home/ubuntu/full_state.json hr-backend-server:/app/old_full_state.json && sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
