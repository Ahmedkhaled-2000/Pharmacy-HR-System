import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('dist');
const destDir = path.resolve('android/app/src/main/assets/public');

if (!fs.existsSync(srcDir)) {
  console.error('❌ dist directory does not exist. Run npm run build first.');
  process.exit(1);
}

if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

console.log(`📦 Copying web assets from ${srcDir} to ${destDir}...`);
fs.cpSync(srcDir, destDir, { recursive: true, force: true });
console.log('✅ Web assets copied successfully into Android app assets!');
