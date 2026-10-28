const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || 'hr-redis', port: 6379 });

async function check() {
  const d = await redis.get('hr:settings:pharmacy-tracker-data');
  const s = JSON.parse(d);
  const emp107 = (s.employees || []).find(e => String(e.code) === '107');
  console.log('Emp 107:', emp107 ? emp107.name : 'Not found');

  const incs = (s.lateIncidents || []).filter(i => String(i.employeeId) === String(emp107.id));
  console.log('Live lateIncidents count:', incs.length);
  incs.forEach(i => console.log('INC:', { id: i.id, date: i.date, status: i.status, isCancelled: i.isCancelled, amount: i.penaltyAmount, branchId: i.branchId }));

  const reqs = (s.requests || []).filter(r => String(r.employeeId) === String(emp107.id) && (r.subType === 'lateness' || r.type === 'penalty' || r.type?.includes('obj')));
  console.log('Live requests count:', reqs.length);
  reqs.forEach(r => console.log('REQ:', { id: r.id, date: r.date, type: r.type, status: r.status, isCancelled: r.isCancelled, amount: r.amount, objection: r.objection, penaltyId: r.penaltyId }));

  const del = (s._deletedIds || []).filter(k => k.includes(emp107.id) || k.includes('107'));
  console.log('Live _deletedIds for 107 count:', del.length);
  console.log('Live _deletedIds for 107:', del);

  redis.disconnect();
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

fs.writeFileSync('scratch/remote_check_107.cjs', remoteScript);
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no scratch/remote_check_107.cjs ${host}:/tmp/remote_check_107.cjs`);
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/remote_check_107.cjs hr-backend-server:/app/check_107.cjs && sudo docker exec hr-backend-server node /app/check_107.cjs && rm -f /tmp/remote_check_107.cjs && sudo docker exec hr-backend-server rm -f /app/check_107.cjs"`, { stdio: 'inherit' });
