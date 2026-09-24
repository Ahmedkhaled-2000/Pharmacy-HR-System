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
 * التحقق من ترخيص الجهاز والـ IP الحالي مقارنة بقائمة الراوترات المعتمدة للفرع وللمنظومة ككل
 * يدعم الربط المخصص لكل فرع بالـ IP الخاص به، وكشف محاولات البصمة من فرع لفرع آخر
 * @param {Object} ipRestrictions - إعدادات تقييد الـ IP العامة للمؤسسة { enabled, allowedIps }
 * @param {string} currentIp - الـ IP الحالي للجهاز
 * @param {Object|null} targetBranch - كائن الفرع المخصص لكشك البصمة الحالي
 * @param {Array} allBranches - قائمة كافة فروع المؤسسة لكشف محاولات التلاعب بين الفروع
 * @returns {Object} { isAuthorized: boolean, reason: string, message: string, targetBranchName?: string, detectedBranchName?: string, currentIp?: string }
 */
export function checkDeviceAuthorization(ipRestrictions = {}, currentIp, targetBranch = null, allBranches = []) {
  if (!currentIp || currentIp === '127.0.0.1 (شبكة محلية)' || currentIp === 'localhost') {
    return { isAuthorized: true, reason: 'authorized', message: 'شبكة محلية' };
  }

  const cleanIp = String(currentIp).trim();

  // ── 1. أولاً: التحقق الجغرافي الصارم لشبكة الفرع المخصص (Per-Branch IP Geofencing) ──
  if (targetBranch) {
    const branchAllowed = targetBranch.allowedIps || targetBranch.routerIPs || [];
    const isBranchIpEnabled = targetBranch.ipRestrictionEnabled !== false && Array.isArray(branchAllowed) && branchAllowed.length > 0;

    if (isBranchIpEnabled) {
      const branchIpStrings = branchAllowed.map((e) =>
        (typeof e === 'string' ? e : e?.ip || '').trim()
      ).filter(Boolean);

      const isMatch = branchIpStrings.some((allowed) => {
        if (allowed === cleanIp) return true;
        // دعم النطاقات الفرعية (مثل 197.35.40.*)
        if (allowed.endsWith('.*')) {
          const prefix = allowed.slice(0, -2);
          return cleanIp.startsWith(prefix);
        }
        return false;
      });

      if (!isMatch) {
        // فحص ذكي عبقري: هل هذا الـ IP يخص فرعاً آخر داخل المنظومة؟
        const detectedOtherBranch = (allBranches || []).find((b) => {
          if (!b || String(b.id) === String(targetBranch.id)) return false;
          const otherList = b.allowedIps || b.routerIPs || [];
          return otherList.some((e) => {
            const oIp = (typeof e === 'string' ? e : e?.ip || '').trim();
            if (oIp === cleanIp) return true;
            if (oIp.endsWith('.*')) return cleanIp.startsWith(oIp.slice(0, -2));
            return false;
          });
        });

        if (detectedOtherBranch) {
          return {
            isAuthorized: false,
            reason: 'wrong_branch_ip',
            targetBranchName: targetBranch.name,
            detectedBranchName: detectedOtherBranch.name,
            currentIp: cleanIp,
            message: `🚫 لا يمكنك فتح كشك [${targetBranch.name}] أثناء التواجد في [${detectedOtherBranch.name}].\n` +
              `أنت متصل حالياً من شبكة راوتر فرع: [${detectedOtherBranch.name}].\n` +
              `يرجى فتح رابط كشك الفرع المتواجد به حالياً للبصمة.`
          };
        }

        const routerNames = branchAllowed
          .map((e) => (typeof e === 'string' ? '' : e?.label))
          .filter(Boolean)
          .join(' / ');

        return {
          isAuthorized: false,
          reason: 'unauthorized_branch_ip',
          targetBranchName: targetBranch.name,
          currentIp: cleanIp,
          message: `❌ غير مصرح بفتح كشك [${targetBranch.name}] من هذه الشبكة.\n` +
            `عنوان الـ IP الحالي (${cleanIp}) غير مسجل في شبكة راوتر هذا الفرع.` +
            (routerNames ? `\nالراوتر المعتمد للفرع: ${routerNames}` : '')
        };
      }
    }
  }

  // ── 2. ثانياً: الفحص العام على مستوى المنظومة ككل (Global IP Restriction) ──
  if (ipRestrictions && ipRestrictions.enabled) {
    const rawList = ipRestrictions.allowedIps || [];
    const allowedIpStrings = rawList.map((entry) =>
      (typeof entry === 'string' ? entry : entry?.ip || '').trim()
    ).filter(Boolean);

    if (allowedIpStrings.length > 0) {
      const isGlobalMatch = allowedIpStrings.some((allowed) => {
        if (allowed === cleanIp) return true;
        if (allowed.endsWith('.*')) return cleanIp.startsWith(allowed.slice(0, -2));
        return false;
      });

      if (!isGlobalMatch) {
        const routerNames = rawList
          .map((e) => (typeof e === 'string' ? '' : e?.label))
          .filter(Boolean)
          .join(' / ');

        return {
          isAuthorized: false,
          reason: 'invalid_ip',
          currentIp: cleanIp,
          message: `❌ أنت خارج شبكة الصيدلية المعتمدة للمؤسسة.\n` +
            `الـ IP الخاص بك: ${cleanIp}\n` +
            (routerNames ? `الراوترات المسموح بها: ${routerNames}` : '')
        };
      }
    }
  }

  return {
    isAuthorized: true,
    reason: 'authorized',
    message: 'شبكة معتمدة'
  };
}
