const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const src = path.join(rootDir, 'pharma_employee_app', 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');

if (!fs.existsSync(src)) {
  console.error('APK not found at:', src);
  process.exit(1);
}

const dests = [
  path.join(rootDir, 'pharma_employee_app.apk'),
  path.join(rootDir, 'بوابة_الموظف_flutter.apk'),
  path.join(os.homedir(), 'Desktop', 'pharma_employee_app.apk'),
  path.join(os.homedir(), 'Desktop', 'بوابة_الموظف_flutter.apk'),
];

dests.forEach(d => {
  try {
    fs.copyFileSync(src, d);
    const sizeMb = Math.round(fs.statSync(d).size / (1024 * 1024) * 10) / 10;
    console.log('Successfully deployed APK to:', d, '(' + sizeMb + ' MB)');
  } catch (err) {
    console.error('Failed to copy to:', d, err.message);
  }
});
