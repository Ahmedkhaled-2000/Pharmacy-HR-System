const { execSync } = require('child_process');

const sshKey = 'vps-p-spark-1803.pem';
try {
  const out = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "ls -lat /home/ubuntu/*.json /home/ubuntu/backups/"`).toString();
  console.log(out);
} catch (e) {
  if (e.stdout) console.log(e.stdout.toString());
  if (e.stderr) console.error(e.stderr.toString());
}
