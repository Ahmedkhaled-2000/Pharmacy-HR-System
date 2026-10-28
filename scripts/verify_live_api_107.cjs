const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
const targets = [
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199' },
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20' }
];

const remoteCheckScript = `
const http = require('http');
http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(raw);
      const state = parsed.value || parsed;
      const empId = 'emp_1789231413527';
      const incs = (state.lateIncidents || []).filter(i => String(i.employeeId) === empId && i.status === 'approved' && !i.isCancelled);
      const reqs = (state.requests || []).filter(r => String(r.employeeId) === empId && r.status === 'approved' && !r.isCancelled && (r.subType === 'lateness' || r.type === 'penalty'));
      const del107 = (state._deletedIds || []).filter(d => d.includes(empId));
      console.log(JSON.stringify({
        activeIncidents: incs.length,
        activeRequests: reqs.length,
        deletedTombstones: del107.length,
        totalIncidentPenalty: incs.reduce((s, i) => s + (parseFloat(i.penaltyAmount) || 0), 0)
      }));
    } catch (e) {
      console.log(JSON.stringify({ error: e.message }));
    }
  });
}).on('error', e => console.log(JSON.stringify({ error: e.message })));
`;

for (const target of targets) {
  try {
    const encoded = Buffer.from(remoteCheckScript).toString('base64');
    const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${target.host} "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
    console.log(`📡 [${target.name}]:`, out);
  } catch (err) {
    console.error(`❌ Error querying ${target.name}:`, err.message);
  }
}
