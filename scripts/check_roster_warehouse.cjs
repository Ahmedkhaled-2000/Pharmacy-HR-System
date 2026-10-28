const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const script = `
const Redis = require('ioredis');
async function run() {
  const redis = new Redis({ host: 'hr-redis', port: 6379 });
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const roster = state.roster || {};
  const hadariRoster = roster['emp_1789240567148'] || roster['112'];
  console.log('Hadari roster Oct 21:', hadariRoster ? hadariRoster['2026-10-21'] : 'none');

  const belalRoster = roster['emp_1789240708342'] || roster['113'];
  console.log('Belal roster Oct 21:', belalRoster ? belalRoster['2026-10-21'] : 'none');

  const nadaRoster = roster['emp_1789243330471'] || roster['119'];
  console.log('Nada roster Oct 21:', nadaRoster ? nadaRoster['2026-10-21'] : 'none');

  // Also check employees details
  const emps = (state.employees || []).filter(e => ['112', '113', '119', '1001', '1146'].includes(String(e.code)));
  for (const e of emps) {
    console.log(e.code, e.name, 'branch:', e.branchId, 'schedType:', e.scheduleType, 'fixedHours:', e.fixedHours);
  }

  redis.disconnect();
}
run().catch(e => console.error(e));
`;

const encoded = Buffer.from(script).toString('base64');
const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
console.log(out);
