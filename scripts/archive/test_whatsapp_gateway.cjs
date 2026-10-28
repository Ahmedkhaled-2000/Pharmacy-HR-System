/**
 * scripts/test_whatsapp_gateway.cjs
 * أداة الفحص الهندسي والشبكي المتقدمة لخادم الواتساب (WhatsApp Gateway Diagnostics)
 */

const http = require('http');
const os = require('os');
const { execSync } = require('child_process');

console.log('\n================================================================');
console.log(' 🔍 الفحص التشخيصي الشامل لخادم الواتساب والشبكة المحلية');
console.log('================================================================\n');

// 1. فحص كروت الشبكة وعناوين IPv4
console.log('[1/4] 🌐 فحص كروت وعناوين الشبكة المحلية (Local Network Interfaces):');
const interfaces = os.networkInterfaces();
const localIps = [];
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name] || []) {
    if (iface.family === 'IPv4' && !iface.internal) {
      localIps.push({ iface: name, ip: iface.address });
      console.log(`   ✓ كارت [${name}]: IP = http://${iface.address}:3100`);
    }
  }
}
if (localIps.length === 0) {
  console.log('   ⚠️ لا توجد كروت شبكة نشطة سوى 127.0.0.1 (Loopback).');
}

// 2. فحص قاعدة جدار الحماية (Windows Defender Firewall)
console.log('\n[2/4] 🛡️ فحص جدار حماية ويندوز للمنفذ 3100 (Windows Defender Firewall):');
try {
  const fwOut = execSync('netsh advfirewall firewall show rule name="WhatsApp_Server_3100"', { stdio: 'pipe', encoding: 'utf8' });
  if (fwOut && fwOut.includes('WhatsApp_Server_3100')) {
    console.log('   ✓ قاعدة السماح للمنفذ 3100 (WhatsApp_Server_3100) مفعلة وجاهزة!');
  } else {
    console.log('   ⚠️ لم يتم العثور على قاعدة جدار الحماية للمنفذ 3100.');
  }
} catch {
  console.log('   ⚠️ قاعدة جدار الحماية غير مضافة بعد. يمكن تشغيل scripts\\allow_firewall_3100.bat كمسؤول.');
}

// 3. فحص استجابة خادم الواتساب عبر HTTP
console.log('\n[3/4] ⚡ فحص استجابة منافذ الـ HTTP لخادم الواتساب:');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

(async () => {
  try {
    const health = await get('http://127.0.0.1:3100/health');
    console.log(`   ✓ /health: كود الرد ${health.status} - حالة الواتساب: [${health.data.waStatus}]`);

    const status = await get('http://127.0.0.1:3100/api/status');
    console.log(`   ✓ /api/status: كود الرد ${status.status} - حالة الخادم: [${status.data.status}] - رمز QR متوفر: [${Boolean(status.data.qrCodeDataUrl)}]`);

    const netInfo = await get('http://127.0.0.1:3100/api/network-info');
    console.log(`   ✓ /api/network-info: الرابط المقترح للأجهزة الأخرى: [${netInfo.data.suggestedLanUrl}]`);

    console.log('\n================================================================');
    console.log(' 🎉 نتيجة الفحص: خادم الواتساب يعمل بكفاءة تامة على المنفذ 3100!');
    console.log('================================================================\n');
  } catch (err) {
    console.log('   ⚠️ الخادم غير قيد التشغيل حالياً على المنفذ 3100.');
    console.log(`   [التفاصيل]: ${err.message}`);
    console.log('\n   💡 لتشغيل الخادم، قم بتشغيل run_whatsapp_server.bat أو افتح تطبيق الويندوز.');
    console.log('================================================================\n');
  }
})();
