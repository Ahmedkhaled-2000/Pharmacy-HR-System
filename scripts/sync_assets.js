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

// قائمة الامتدادات والملفات المستبعدة من تطبيق الأندرويد للوصول لحجم تنزيل فائق الصغر (<15MB)
const EXCLUDED_EXTENSIONS = ['.apk', '.zip', '.map', '.wasm', '.onnx', '.task'];

console.log(`📦 Copying ultra-lightweight web assets from ${srcDir} to ${destDir}...`);

let skippedCount = 0;
let skippedBytes = 0;

fs.cpSync(srcDir, destDir, {
  recursive: true,
  force: true,
  filter: (source) => {
    const baseName = path.basename(source).toLowerCase();
    const ext = path.extname(source).toLowerCase();

    // 1. استبعاد حزم APK والـ ZIP والخرائط
    if (EXCLUDED_EXTENSIONS.includes(ext) || baseName.includes('shard') || baseName.includes('ort.all')) {
      try {
        const stat = fs.statSync(source);
        skippedBytes += stat.size;
        skippedCount++;
        console.log(`⏩ [Excluded] Skipping heavy asset: ${baseName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      } catch {}
      return false;
    }

    return true;
  }
});

console.log(`✨ Optimization complete: Excluded ${skippedCount} heavy files (~${(skippedBytes / 1024 / 1024).toFixed(1)} MB saved)!`);

const capSrc = path.resolve('capacitor.config.json');
const capDest = path.resolve('android/app/src/main/assets/capacitor.config.json');
if (fs.existsSync(capSrc)) {
  fs.copyFileSync(capSrc, capDest);
  console.log('✅ capacitor.config.json synced to Android assets!');
}

console.log('✅ Web assets copied successfully into Android app assets!');
