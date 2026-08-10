/**
 * deviceAuth.js
 * إدارة تراخيص الأجهزة وبصمة الهاتف والتحقق من الـ IP
 */

const DEVICE_KEY = 'pharmacy_kiosk_device_id';

// توليد أو جلب معرّف أمان فريد للجهاز (Device UUID)
export function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'DEV-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

// الحصول على تفاصيل الجهاز والفيزياء المتاحة
export function getDeviceDetails() {
  const ua = navigator.userAgent;
  let deviceType = 'هاتف / جهاز مخصص';
  if (/Android/i.test(ua)) deviceType = 'هاتف أندرويد (Android)';
  else if (/iPhone|iPad|iPod/i.test(ua)) deviceType = 'هاتف آيفون (iOS)';
  else if (/Windows/i.test(ua)) deviceType = 'جهاز كمبيوتر (Windows)';
  else if (/Macintosh/i.test(ua)) deviceType = 'جهاز ماك (Mac)';

  return {
    deviceId: getOrCreateDeviceId(),
    deviceType,
    userAgent: ua,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    platform: navigator.platform
  };
}

// جلب الـ IP الحالي للجهاز من خدمة خفيفة وموثوقة مع التخزين المؤقت
let cachedIp = null;
let lastIpFetch = 0;

export async function fetchCurrentIP() {
  // استخدام الكاش إن تم الجلب خلال آخر 30 ثانية
  if (cachedIp && Date.now() - lastIpFetch < 30000) {
    return cachedIp;
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      cachedIp = data.ip;
      lastIpFetch = Date.now();
      return cachedIp;
    }
  } catch (err) {
    console.warn('تعذر جلب الـ IP من الخادم الخارجي، جاري استخدام الفحص المحلي:', err);
  }

  return cachedIp || '127.0.0.1 (شبكة محلية)';
}

/**
 * التحقق من ترخيص الجهاز والـ IP الحالي مقارنة بقائمة الراوترات المعتمدة في النظام
 * يدعم الصيغتين القديمة (string[]) والجديدة ({label, ip}[])
 * @param {Object} ipRestrictions - إعدادات تقييد الـ IP { enabled, allowedIps }
 * @param {string} currentIp - الـ IP الحالي للجهاز
 * @returns {Object} { isAuthorized: boolean, reason: string, message: string }
 */
export function checkDeviceAuthorization(ipRestrictions = {}, currentIp) {
  if (ipRestrictions && ipRestrictions.enabled) {
    const rawList = ipRestrictions.allowedIps || [];

    // استخراج الـ IP سواء كان string قديم أو object جديد { label, ip }
    const allowedIpStrings = rawList.map((entry) =>
      typeof entry === 'string' ? entry : entry.ip
    );

    if (
      allowedIpStrings.length > 0 &&
      !allowedIpStrings.includes(currentIp) &&
      currentIp !== '127.0.0.1 (شبكة محلية)'
    ) {
      // ابحث عن اسم الراوتر المطابق (إن وجد) لعرضه في الرسالة
      const routerNames = rawList
        .map((e) => (typeof e === 'string' ? '' : e.label))
        .filter(Boolean)
        .join(' / ');

      return {
        isAuthorized: false,
        reason: 'invalid_ip',
        message: `❌ أنت خارج شبكة الصيدلية المعتمدة.\n` +
          `الـ IP الخاص بك: ${currentIp}\n` +
          (routerNames ? `الراوترات المسموح بها: ${routerNames}` : ''),
      };
    }
  }

  return {
    isAuthorized: true,
    reason: 'authorized',
    message: 'شبكة معتمدة',
  };
}
