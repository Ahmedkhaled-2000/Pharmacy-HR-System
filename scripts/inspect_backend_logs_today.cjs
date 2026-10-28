const { execSync } = require('child_process');

try {
  const cmd = `ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no admin@169.58.214.20 'sudo docker logs --since 15h hr-backend-server 2>&1 | grep -E "RECORD-PUNCH|SMART-DIRECTION|WA_LOG|kiosk|check_in|check_out" | tail -n 60'`;
  const out = execSync(cmd).toString();
  console.log(out);
} catch (e) {
  console.error(e.message);
  if (e.stdout) console.log(e.stdout.toString());
}
