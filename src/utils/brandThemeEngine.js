/**
 * brandThemeEngine.js
 * محرك توحيد وتثبيت هوية النظام المركزية (Central Brand & Identity Engine)
 * يتولى حقن متغيرات الألوان والشعار واسم المنظومة على مستوى DOM و CSS Variables
 * لتنعكس الهوية المعتمدة من المالك فورياً على كافة الأنظمة الداخلية
 */

export const DEFAULT_BRAND_IDENTITY = {
  systemName: 'نظام إدارة الصيدليات',
  generalManagerName: '',
  logoUrl: '',
  primaryColor: '#0d9488',
  secondaryColor: '#0f766e',
  accentGradient: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
  welcomeMessage: ''
};

/**
 * تطبيق هوية النظام على كائن document.documentElement
 */
export function applyBrandIdentityToDOM(brandIdentity) {
  if (typeof document === 'undefined' || !brandIdentity) return;

  const root = document.documentElement;
  const prim = brandIdentity.primaryColor || '#0d9488';
  const sec = brandIdentity.secondaryColor || '#0f766e';
  const grad = brandIdentity.accentGradient || `linear-gradient(135deg, ${prim} 0%, ${sec} 100%)`;

  try {
    root.style.setProperty('--primary', prim);
    root.style.setProperty('--primary-dark', sec);
    root.style.setProperty('--brand-primary', prim);
    root.style.setProperty('--brand-gradient', grad);

    // تحديث عنوان التبويب إذا كان مخصصاً
    if (brandIdentity.systemName && typeof document !== 'undefined') {
      const currentTitle = document.title || '';
      if (!currentTitle.includes('(')) {
        document.title = brandIdentity.systemName;
      }
    }
  } catch (e) {
    console.warn('[BrandThemeEngine Apply Error]:', e);
  }
}

/**
 * استرجاع الهوية المحفوظة محلياً أو من حالة النظام
 */
export function getEffectiveBrandIdentity(state) {
  const org = state?.orgSettings || {};
  const brand = org.brandIdentity || {};

  return {
    systemName: brand.systemName || org.orgName || DEFAULT_BRAND_IDENTITY.systemName,
    generalManagerName: brand.generalManagerName || org.generalManagerName || '',
    logoUrl: brand.logoUrl || org.logoUrl || '',
    primaryColor: brand.primaryColor || '#0d9488',
    secondaryColor: brand.secondaryColor || '#0f766e',
    accentGradient: brand.accentGradient || DEFAULT_BRAND_IDENTITY.accentGradient,
    welcomeMessage: brand.welcomeMessage || ''
  };
}
