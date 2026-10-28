const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  const r1 = (state.rosters || []).find(r => r.id === 'roster_emp_1789231413527_2026-10_b_branch_1789142992139');
  console.log('=== ROSTER 1 (Komi) ===');
  console.log('Created:', r1?.createdAt, 'Updated:', r1?.updatedAt, 'by:', r1?.createdBy);
  console.log('Dates in schedule:', Object.keys(r1?.schedule || {}));
  console.log('Sample dates:', Object.entries(r1?.schedule || {}).slice(0, 10));

  const r2 = (state.rosters || []).find(r => r.id === 'roster_emp_1789231413527_2026-10_b_branch_1789241578010');
  console.log('\\n=== ROSTER 2 (Medina) ===');
  console.log('Created:', r2?.createdAt, 'Updated:', r2?.updatedAt, 'by:', r2?.createdBy);
  console.log('Dates in schedule:', Object.keys(r2?.schedule || {}));
  console.log('Sample dates:', Object.entries(r2?.schedule || {}).slice(0, 10));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  console.log(out);
} catch (e) {
  console.error(e.message);
}
