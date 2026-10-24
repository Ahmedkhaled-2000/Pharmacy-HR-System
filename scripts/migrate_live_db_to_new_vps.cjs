const { execSync } = require('child_process');
const fs = require('fs');

const sshKey = 'vps-p-spark-1803.pem';
const host = 'admin@169.58.214.20';

function runRemoteSql(sql) {
  const b64 = Buffer.from(sql, 'utf8').toString('base64');
  const cmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "echo ${b64} | base64 -d | sudo docker exec -i hr-postgres psql -U postgres -d postgres"`;
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('========================================================');
console.log('🔄 MIGRATING LIVE DATABASE SETTINGS TO NEW VPS');
console.log('========================================================\n');

// 1. Fetch current live state
console.log('📥 1. Fetching current pharmacy-tracker-data from VPS PostgreSQL...');
const fetchSql = "SELECT value_data FROM app_settings WHERE key_name = 'pharmacy-tracker-data';";
const b64Fetch = Buffer.from(fetchSql, 'utf8').toString('base64');
const fetchCmd = `ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "echo ${b64Fetch} | base64 -d | sudo docker exec -i hr-postgres psql -U postgres -d postgres -t -A"`;
const rawJson = execSync(fetchCmd, { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' });

let state;
try {
  state = JSON.parse(rawJson);
} catch (e) {
  console.error('Failed to parse state JSON:', e.message);
  process.exit(1);
}

console.log('Current state loaded. Keys count:', Object.keys(state).length);

// 2. Update orgSettings and system URLs
if (!state.orgSettings) state.orgSettings = {};
state.orgSettings.systemUrl = 'https://169-58-214-20.sslip.io';

if (!state.orgSettings.gmailConfig) state.orgSettings.gmailConfig = {};
state.orgSettings.gmailConfig.systemUrl = 'https://169-58-214-20.sslip.io';

state.orgSettings.waServerLanUrl = 'https://169-58-214-20.sslip.io/whatsapp';
state.systemUrl = 'https://169-58-214-20.sslip.io';

// Deep string replacement for any remaining 63-183 / 63.183
let stateString = JSON.stringify(state);
const oldIpMatches = (stateString.match(/63\.183\.147\.199/g) || []).length;
const oldSslipMatches = (stateString.match(/63-183-147-199/g) || []).length;
console.log(`Found ${oldIpMatches} occurrences of old IP and ${oldSslipMatches} of old sslip in state.`);

stateString = stateString
  .replace(/https?:\/\/63-183-147-199\.sslip\.io/g, 'https://169-58-214-20.sslip.io')
  .replace(/https?:\/\/63\.183\.147\.199:5000/g, 'https://169-58-214-20.sslip.io')
  .replace(/https?:\/\/63\.183\.147\.199/g, 'https://169-58-214-20.sslip.io')
  .replace(/63-183-147-199\.sslip\.io/g, '169-58-214-20.sslip.io')
  .replace(/63\.183\.147\.199/g, '169.58.214.20');

state = JSON.parse(stateString);
state.lastUpdated = new Date().toISOString();
state.version = (state.version || 1) + 1;

// 3. Save to temp file and upload to VPS
fs.writeFileSync('temp_migrated_state.json', JSON.stringify(state), 'utf8');

console.log('📤 2. Uploading cleaned state to new VPS...');
execSync(`scp -i ${sshKey} -o StrictHostKeyChecking=no temp_migrated_state.json ${host}:/tmp/temp_migrated_state.json`);
fs.unlinkSync('temp_migrated_state.json');

console.log('💾 3. Updating PostgreSQL app_settings table...');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker cp /tmp/temp_migrated_state.json hr-postgres:/tmp/state.json && rm -f /tmp/temp_migrated_state.json"`);

const updateSql = `
UPDATE app_settings 
SET value_data = pg_read_file('/tmp/state.json')::jsonb, 
    version = version + 1, 
    updated_at = NOW() 
WHERE key_name = 'pharmacy-tracker-data';

UPDATE app_settings 
SET value_data = replace(replace(value_data::text, '63-183-147-199.sslip.io', '169-58-214-20.sslip.io'), '63.183.147.199', '169.58.214.20')::jsonb, 
    updated_at = NOW() 
WHERE key_name IN ('pharmacy_data_store', 'hr_pharmacy_data_live');
`;

console.log(runRemoteSql(updateSql));

console.log('⚡ 4. Purging Redis cache and notifying backend...');
try {
  execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker exec hr-redis redis-cli FLUSHDB"`, { stdio: 'inherit' });
} catch (e) {
  console.log('Redis flush output/note:', e.message);
}

console.log('🔄 5. Restarting hr-backend-server container...');
execSync(`ssh -i ${sshKey} -o StrictHostKeyChecking=no ${host} "sudo docker restart hr-backend-server"`, { stdio: 'inherit' });

console.log('\n✅ DATABASE MIGRATION COMPLETE!');
