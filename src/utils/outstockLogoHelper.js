/**
 * outstockLogoHelper.js
 * استخراج وتوفير شعار المؤسسة الرسمي الموضوع من قبل المالك في إعدادات المنظومة
 * لاستخدامه في كافة الإيصالات الحرارية والمطبوعات والسندات بنظام OutStock
 */

export function getEffectiveOrgLogo(fallbackLogo = '') {
  try {
    // 1. فحص الإعدادات المركزية لمنظومة الصيدليات (شعار المالك الرسمي)
    const rawData = localStorage.getItem('pharmacy-tracker-data');
    if (rawData) {
      const parsed = JSON.parse(rawData);
      if (parsed?.orgSettings?.logoUrl) {
        return parsed.orgSettings.logoUrl;
      }
      if (parsed?.orgSettings?.pharmacyLogo) {
        return parsed.orgSettings.pharmacyLogo;
      }
    }

    // 2. فحص إعدادات OutStock المخزنة محلياً
    const outstockSettingsRaw = localStorage.getItem('outstock_settings');
    if (outstockSettingsRaw) {
      const parsedSettings = JSON.parse(outstockSettingsRaw);
      if (parsedSettings?.logoUrl) return parsedSettings.logoUrl;
      if (parsedSettings?.pharmacyLogo) return parsedSettings.pharmacyLogo;
    }

    // 3. فحص مفاتيح الشعار البديلة الشائعة
    const directLogo = localStorage.getItem('companyLogo') || localStorage.getItem('org_logo');
    if (directLogo) return directLogo;
  } catch (e) {
    console.warn('Error resolving effective org logo:', e);
  }

  return fallbackLogo || '';
}

export function getEffectiveOrgName(fallbackName = 'مجموعة الصيدليات') {
  try {
    const rawData = localStorage.getItem('pharmacy-tracker-data');
    if (rawData) {
      const parsed = JSON.parse(rawData);
      if (parsed?.orgSettings?.orgName) {
        return parsed.orgSettings.orgName;
      }
      if (parsed?.orgSettings?.companyName) {
        return parsed.orgSettings.companyName;
      }
    }
  } catch (_) {}
  return fallbackName;
}
