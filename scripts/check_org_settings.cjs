const { execSync } = require('child_process');

const remoteScript = `
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: 6379 });

async function main() {
  const dataStr = await redis.get('hr:settings:pharmacy-tracker-data');
  const state = JSON.parse(dataStr || '{}');

  console.log('orgSettings payroll:', {
    payrollPayoutStartDay: state.orgSettings?.payrollPayoutStartDay,
    payrollPayoutEndDay: state.orgSettings?.payrollPayoutEndDay,
    payrollPayoutStartTime: state.orgSettings?.payrollPayoutStartTime,
    payrollPayoutEndTime: state.orgSettings?.payrollPayoutEndTime,
    payrollPeriodType: state.orgSettings?.payrollPeriodType
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
`;

try {
  const b64 = Buffer.from(remoteScript).toString('base64');
  const cmd = `ssh -i vps-p-spark-1803.pem admin@169.58.214.20 "sudo docker exec hr-backend-server node -e \\"eval(Buffer.from('${b64}', 'base64').toString('utf8'))\\""`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e);
}
