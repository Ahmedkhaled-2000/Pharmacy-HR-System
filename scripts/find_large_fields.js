import fs from 'fs';
import path from 'path';

const backupFile = fs.readdirSync(process.cwd()).find(f => f.startsWith('pharmacy_data_backup_') && f.endsWith('.json'));
const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), backupFile), 'utf-8'));

console.log('Searching for large fields > 10KB anywhere in state:');
function scanObj(obj, currentPath = '') {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.length > 10000) {
      console.log(`- Large string at [${currentPath}]: ${(obj.length / 1024).toFixed(1)} KB (starts with: ${obj.slice(0, 30)}...)`);
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      scanObj(item, `${currentPath}[${idx}]`);
    });
    return;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      scanObj(obj[k], currentPath ? `${currentPath}.${k}` : k);
    }
  }
}
scanObj(data);
