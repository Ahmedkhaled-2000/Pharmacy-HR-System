const fs = require('fs');
const path = require('path');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const inputPng = path.join(__dirname, '../assets/icon.png');
const outputIco = path.join(__dirname, '../assets/icon.ico');

console.log('🔄 جاري تحويل أيقونة النظام assets/icon.png إلى assets/icon.ico...');

pngToIco(inputPng)
  .then(buf => {
    fs.writeFileSync(outputIco, buf);
    console.log('✅ تم توليد أيقونة سطح المكتب Windows بنجاح:', outputIco, `(الحجم: ${buf.length} بايت)`);
  })
  .catch(err => {
    console.error('❌ خطأ أثناء توليد الأيقونة:', err);
    process.exit(1);
  });
