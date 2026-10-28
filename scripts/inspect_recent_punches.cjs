const { execSync } = require('child_process');
const sshKey = 'vps-p-spark-1803.pem';

console.log('=== CHECKING ON OLD LIVE VPS (63.183.147.199) ===');
try {
  const psqlTables = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "sudo docker exec hr-postgres psql -U postgres -d postgres -c '\\dt'"`, { encoding: 'utf8' });
  console.log('Tables:', psqlTables);
} catch(e) {
  console.log('Error psql:', e.message);
}

try {
  const logs = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ubuntu@63.183.147.199 "sudo docker logs hr-backend-server --tail 300"`, { encoding: 'utf8' });
  const matches = logs.split('\n').filter(l => l.includes('صبري') || l.includes('ادهم') || l.includes('00:22') || l.includes('00:28') || l.toLowerCase().includes('punch') || l.includes('MB20'));
  console.log('Matching logs on Old VPS:');
  console.log(matches.slice(-30).join('\n'));
} catch(e) {
  console.log('Error logs:', e.message);
}

console.log('\n=== CHECKING ON NEW VPS (169.58.214.20) ===');
try {
  const logsNew = execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no admin@169.58.214.20 "sudo docker logs hr-backend-server --tail 300"`, { encoding: 'utf8' });
  const matchesNew = logsNew.split('\n').filter(l => l.includes('صبري') || l.includes('ادهم') || l.includes('00:22') || l.includes('00:28') || l.toLowerCase().includes('punch') || l.includes('MB20'));
  console.log('Matching logs on New VPS:');
  console.log(matchesNew.slice(-30).join('\n'));
} catch(e) {
  console.log('Error logs new:', e.message);
}
