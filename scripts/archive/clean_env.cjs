const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Kill any existing instances of the app
const killCommands = [
  'taskkill /F /FI "WINDOWTITLE eq *منظومة*" /T',
  'taskkill /F /IM electron.exe /T',
  'powershell -Command "Get-Process -Name \'*منظومة*\',\'electron*\' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"'
];

for (const cmd of killCommands) {
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch (e) {}
}
console.log('App and electron processes cleanly stopped.');


// 2. Remove Service Worker cache from AppData
const appData = process.env.APPDATA || '';
const swDir = path.join(appData, 'منظومة الموارد البشرية', 'Service Worker');
try {
  if (fs.existsSync(swDir)) {
    fs.rmSync(swDir, { recursive: true, force: true });
    console.log('Successfully deleted Service Worker cache directory:', swDir);
  } else {
    console.log('SW cache directory already clear or not present.');
  }
} catch (err) {
  console.warn('Could not delete SW dir:', err.message);
}

// 3. Remove CacheStorage if exists
const cacheDir = path.join(appData, 'منظومة الموارد البشرية', 'Cache');
try {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('Successfully deleted Cache directory:', cacheDir);
  }
} catch (err) {
  console.warn('Could not delete Cache dir:', err.message);
}
console.log('Environment cleanup finished.');

