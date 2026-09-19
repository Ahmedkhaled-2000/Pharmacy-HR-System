/**
 * mobileConfigHelper.js
 * محرك إدارة إعدادات وتخصيص تطبيق الأندرويد والهواتف الذكية:
 * - حفظ واسترجاع التفضيلات في الذاكرة الدائمة (localStorage)
 * - تطبيق نسبة تكبير الواجهة والخطوط ديناميكياً (Mobile Scale & Dynamic Font Scaling)
 * - التغذية اللمسية الارتجاجية (Haptic Feedback)
 * - إدارة البصمة الحيوية واستثناء توفير البطارية
 */

const STORAGE_KEY = 'mobile_app_config_v1';

export const DEFAULT_MOBILE_CONFIG = {
  appName: 'بوابة الموظف',
  customLogoBase64: null,
  fontScale: 1.0, // 0.85 to 1.25
  hapticEnabled: true,
  biometricLock: false,
  notificationsEnabled: true,
  notificationSound: true,
  notificationVibration: true,
  backgroundService247: true
};

/**
 * جلب إعدادات الموبايل المحفوظة
 */
export function getMobileConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_MOBILE_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('[MobileConfig] Failed to load mobile config:', e);
  }
  return { ...DEFAULT_MOBILE_CONFIG };
}

/**
 * حفظ إعدادات الموبايل وتطبيقها فورياً
 */
export function saveMobileConfig(newConfig) {
  try {
    const current = getMobileConfig();
    const updated = { ...current, ...newConfig };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    // تطبيق نسبة التكبير إذا تغيرت
    if (updated.fontScale !== undefined) {
      applyMobileScale(updated.fontScale);
    }

    return { success: true, config: updated };
  } catch (e) {
    console.error('[MobileConfig] Failed to save mobile config:', e);
    return { success: false, error: e.message };
  }
}

/**
 * تطبيق نسبة التكبير وحجم الخط على شاشة الهاتف بالكامل
 * يتحكم في الجذر html و root variables لدعم كل شاشات الهواتف من 5 بوصة حتى التابلت
 */
export function applyMobileScale(scale) {
  if (typeof document === 'undefined') return;

  const num = Number(scale) || 1.0;
  const clamped = Math.min(Math.max(num, 0.80), 1.30);

  try {
    // 1. تعيين متغير CSS عام لتعديل حجم الخطوط والأيقونات
    document.documentElement.style.setProperty('--app-font-scale', `${clamped}`);

    // 2. ضبط حجم خط الجذر الرئيسي
    const baseFontSize = 14 * clamped;
    document.documentElement.style.fontSize = `${baseFontSize}px`;

    // 3. إضافة فئة لمعايرة التكبير
    document.body.classList.remove('scale-compact', 'scale-normal', 'scale-large', 'scale-xlarge');
    if (clamped < 0.92) {
      document.body.classList.add('scale-compact');
    } else if (clamped <= 1.05) {
      document.body.classList.add('scale-normal');
    } else if (clamped <= 1.18) {
      document.body.classList.add('scale-large');
    } else {
      document.body.classList.add('scale-xlarge');
    }
  } catch (e) {
    console.warn('[MobileConfig] Failed to apply mobile scale:', e);
  }
}

/**
 * تفعيل التغذية اللمسية الناعمة (Haptic Feedback)
 */
export function triggerHaptic(type = 'light') {
  try {
    const config = getMobileConfig();
    if (!config.hapticEnabled) return;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'light') {
        navigator.vibrate(15);
      } else if (type === 'medium') {
        navigator.vibrate(30);
      } else if (type === 'success') {
        navigator.vibrate([20, 50, 20]);
      } else if (type === 'warning') {
        navigator.vibrate([40, 60, 40]);
      }
    }
  } catch {}
}

/**
 * ضغط الصورة المختارة من الكاميرا أو الاستوديو وتحويلها إلى Base64 خفيف
 */
export function compressMobileImage(file, maxWidth = 256, maxHeight = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('الملف المختار ليس صورة صالحة'));
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/png', 0.85);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('فشل قراءة بيانات الصورة'));
      img.src = readerEvent.target.result;
    };
    reader.onerror = () => reject(new Error('فشل فتح ملف الصورة'));
    reader.readAsDataURL(file);
  });
}
