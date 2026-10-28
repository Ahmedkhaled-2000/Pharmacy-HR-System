const { execSync } = require('child_process');

const targets = [
  { name: 'Old Live VPS (63.183.147.199)', host: 'ubuntu@63.183.147.199' },
  { name: 'New VPS (169.58.214.20)', host: 'admin@169.58.214.20' }
];

const script = `
const http = require('http');

http.get('http://127.0.0.1:5000/api/settings', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const json = parsed.value || parsed;
      const activeShifts = json.activeShifts || {};
      console.log(JSON.stringify({
        activeCount: Object.keys(activeShifts).length,
        activeKeys: Object.keys(activeShifts),
        sabryPresent: Boolean(activeShifts['102'] || activeShifts['emp_1789143997322']),
        aliPresent: Boolean(activeShifts['115'] || activeShifts['emp_1789242190413']),
        jihadPresent: Boolean(activeShifts['109'] || activeShifts['emp_1789231620535']),
        mahmoudPresent: Boolean(activeShifts['1156'] || activeShifts['emp_1792340313632_8qlbo']),
        asmaaPresent: Boolean(activeShifts['1148'] || activeShifts['emp_1789327409504_d16gd']),
        rawanPresent: Boolean(activeShifts['103'] || activeShifts['emp_1789144674736'])
      }));
    } catch (e) {
      console.error('Error parsing:', e.message);
    }
  });
}).on('error', err => console.error('Request error:', err.message));
`;

for (const target of targets) {
  const encoded = Buffer.from(script).toString('base64');
  const out = execSync(`ssh -i vps-p-spark-1803.pem -o StrictHostKeyChecking=no ${target.host} "sudo docker exec -i hr-backend-server node -e \\"eval(Buffer.from('${encoded}', 'base64').toString())\\""`).toString().trim();
  console.log(`[${target.name}]:`, out);
}
