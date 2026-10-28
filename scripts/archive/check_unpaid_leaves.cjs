const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });
redis.get('hr:settings:pharmacy-tracker-data').then(data => {
  const state = JSON.parse(data);
  const adjs = state.adjustments || [];
  const unpaidAdjs = adjs.filter(a => 
    (a.type === 'deduction' || a.type === 'penalty' || a.type === 'خصم') &&
    (
      String(a.id || '').includes('unpaid') ||
      (a.reason && (a.reason.includes('بدون أجر') || a.reason.includes('بدون راتب') || a.reason.includes('غير مدفوعة')))
    )
  );
  console.log('Unpaid leave adjustments in state.adjustments:', unpaidAdjs.length);
  if (unpaidAdjs.length > 0) {
    console.log(JSON.stringify(unpaidAdjs, null, 2));
  }
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
