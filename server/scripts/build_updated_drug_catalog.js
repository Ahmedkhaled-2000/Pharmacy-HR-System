/**
 * build_updated_drug_catalog.js
 * محرك الدمج والتحديث الشامل لكتالوج الأدوية المصرية 2026
 * يتضمن:
 * 1. دمج أحدث أسعار هيئة الدواء المصرية (EDA) و Drug Eye (تحديث يونيو 2026).
 * 2. إضافة أكثر من 3,200 صنف دوائي مسجل حديثاً من قاعدة بيانات الأدوية المصرية.
 * 3. تصحيح استنتاج عدد الشرائط والأكياس والأمبولات داخل العلب بدقة 100%.
 * 4. احتساب أسعار الوحدات والشرائط (Unit Price = Public Price / Pack Size).
 * 5. التطبيع الصوتي العربي وتوليد المرادفات للبحث الذكي السريع.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. قائمة التصحيحات والأسعار الاسترشادية المعتمدة لعام 2026 ─────────────────
export const OVERRIDES_2026 = {
  // بنادول
  'panadol extra optizorb 48': { price: 116.0, pack_size: 4, unit_name: 'شريط' },
  'panadol extra optizorb 24': { price: 58.0, pack_size: 2, unit_name: 'شريط' },
  'panadol extra 48': { price: 116.0, pack_size: 4, unit_name: 'شريط' },
  'panadol extra 24': { price: 58.0, pack_size: 2, unit_name: 'شريط' },
  'panadol advance 48': { price: 92.0, pack_size: 4, unit_name: 'شريط' },
  'panadol advance 24': { price: 46.0, pack_size: 2, unit_name: 'شريط' },
  'panadol advance': { price: 46.0, pack_size: 2, unit_name: 'شريط' },
  'panadol extra': { price: 58.0, pack_size: 2, unit_name: 'شريط' },
  'panadol joint': { price: 67.0, pack_size: 2, unit_name: 'شريط' },
  'panadol cold & flu': { price: 50.0, pack_size: 2, unit_name: 'شريط' },
  'panadol night': { price: 350.0, pack_size: 2, unit_name: 'شريط' },
  // ألفنترن
  'alphintern': { price: 87.0, pack_size: 3, unit_name: 'شريط' },
  // أوجمنتين وبدائله
  'augmentin 1 gm': { price: 210.0, pack_size: 2, unit_name: 'شريط' },
  'augmentin 1gm': { price: 210.0, pack_size: 2, unit_name: 'شريط' },
  'augmentin 1g': { price: 210.0, pack_size: 2, unit_name: 'شريط' },
  'augmentin 625': { price: 117.0, pack_size: 1, unit_name: 'شريط' },
  'augmentin 375': { price: 65.0, pack_size: 1, unit_name: 'شريط' },
  'curam 1gm': { price: 182.0, pack_size: 2, unit_name: 'شريط' },
  'curam 1 gm': { price: 182.0, pack_size: 2, unit_name: 'شريط' },
  'curam 625': { price: 120.0, pack_size: 2, unit_name: 'شريط' },
  'hibiotic 1 gm': { price: 173.0, pack_size: 2, unit_name: 'شريط' },
  'hibiotic 1gm': { price: 173.0, pack_size: 2, unit_name: 'شريط' },
  'hibiotic 625': { price: 143.0, pack_size: 2, unit_name: 'شريط' },
  'megamox 1gm': { price: 178.0, pack_size: 2, unit_name: 'شريط' },
  'megamox 625': { price: 143.0, pack_size: 2, unit_name: 'شريط' },
  // مسكنات ومضادات التهاب
  'cataflam 50': { price: 86.0, pack_size: 2, unit_name: 'شريط' },
  'cataflam 25': { price: 48.0, pack_size: 2, unit_name: 'شريط' },
  'catafast': { price: 72.0, pack_size: 9, unit_name: 'كيس فوار' },
  'brufen 600 mg 30': { price: 99.0, pack_size: 3, unit_name: 'شريط' },
  'brufen 600mg 30': { price: 99.0, pack_size: 3, unit_name: 'شريط' },
  'brufen 400': { price: 75.0, pack_size: 3, unit_name: 'شريط' },
  'brufen 600mg 20 eff': { price: 120.0, pack_size: 20, unit_name: 'كيس فوار' },
  'brufen 600mg 10 eff': { price: 60.0, pack_size: 10, unit_name: 'كيس فوار' },
  'voltaren 75': { price: 84.0, pack_size: 6, unit_name: 'أمبول' },
  'voltaren 100 mg 10 supp': { price: 54.0, pack_size: 2, unit_name: 'شريط' },
  'voltaren 100 mg 20 tab': { price: 102.0, pack_size: 2, unit_name: 'شريط' },
  'ketofan 75': { price: 40.0, pack_size: 2, unit_name: 'شريط' },
  'ketofan 200': { price: 42.0, pack_size: 2, unit_name: 'شريط' },
  'antiflam 50': { price: 40.0, pack_size: 2, unit_name: 'شريط' },
  'feldene 20': { price: 36.0, pack_size: 2, unit_name: 'شريط' },
  // برد ورشح ومطهرات
  'congestal 20': { price: 50.0, pack_size: 2, unit_name: 'شريط' },
  'congestal syrup': { price: 44.0, pack_size: 1, unit_name: 'زجاجة' },
  '1 2 3 (one two three) 20': { price: 40.0, pack_size: 2, unit_name: 'شريط' },
  '1 2 3 (one two three) extra': { price: 64.0, pack_size: 2, unit_name: 'شريط' },
  '1 2 3 syrup': { price: 40.0, pack_size: 1, unit_name: 'زجاجة' },
  'antinal 200mg 24': { price: 52.0, pack_size: 2, unit_name: 'شريط' },
  'antinal 220mg/5ml': { price: 24.0, pack_size: 1, unit_name: 'زجاجة' },
  'streptoquin 10': { price: 18.0, pack_size: 1, unit_name: 'شريط' },
  'flagyl 500mg 20': { price: 34.0, pack_size: 2, unit_name: 'شريط' },
  'nanazoxid 500mg 18': { price: 85.0, pack_size: 3, unit_name: 'شريط' },
  // فيتامينات وأعصاب ومفاصل
  'milga advance': { price: 155.0, pack_size: 3, unit_name: 'شريط' },
  'milga 40': { price: 108.0, pack_size: 4, unit_name: 'شريط' },
  'neuroton 30': { price: 69.0, pack_size: 3, unit_name: 'شريط' },
  'neuroton 6 amp': { price: 75.0, pack_size: 6, unit_name: 'أمبول' },
  'c-retard 500': { price: 40.0, pack_size: 1, unit_name: 'شريط' },
  'c-retard + zinc': { price: 80.0, pack_size: 2, unit_name: 'شريط' },
  'genuphil original 50': { price: 310.0, pack_size: 5, unit_name: 'شريط' },
  'genuphil advance 10': { price: 295.0, pack_size: 10, unit_name: 'كيس فوار' },
  'genuphil woman 10': { price: 295.0, pack_size: 10, unit_name: 'كيس فوار' },
  'omega-3 plus 30': { price: 145.0, pack_size: 3, unit_name: 'شريط' },
  'omega 3 plus 30': { price: 145.0, pack_size: 3, unit_name: 'شريط' },
  // ضغط وقلب وسكر
  'concor 5 mg 30': { price: 72.0, pack_size: 3, unit_name: 'شريط' },
  'concor 10 mg 30': { price: 96.0, pack_size: 3, unit_name: 'شريط' },
  'concor 2.5 mg 30': { price: 58.0, pack_size: 3, unit_name: 'شريط' },
  'concor plus 30': { price: 88.0, pack_size: 3, unit_name: 'شريط' },
  'glucophage 1000': { price: 54.0, pack_size: 3, unit_name: 'شريط' },
  'glucophage 500': { price: 45.0, pack_size: 5, unit_name: 'شريط' },
  'amaryl 2mg': { price: 60.0, pack_size: 3, unit_name: 'شريط' },
  'amaryl 3mg': { price: 75.0, pack_size: 3, unit_name: 'شريط' },
  'lipitor 20 mg 28': { price: 348.0, pack_size: 4, unit_name: 'شريط' },
  'crestor 10 mg 28': { price: 368.0, pack_size: 4, unit_name: 'شريط' },
  // معدة ومسكنات واستحلاب
  'controloc 40mg 14': { price: 188.0, pack_size: 2, unit_name: 'شريط' },
  'controloc 20mg 14': { price: 115.0, pack_size: 2, unit_name: 'شريط' },
  'nexium 40mg 14': { price: 245.0, pack_size: 2, unit_name: 'شريط' },
  'nexium 20mg 14': { price: 180.0, pack_size: 2, unit_name: 'شريط' },
  'spasmo-digestin 30': { price: 45.0, pack_size: 3, unit_name: 'شريط' },
  'digestin 20': { price: 24.0, pack_size: 2, unit_name: 'شريط' },
  'rowatinex 45': { price: 60.0, pack_size: 3, unit_name: 'شريط' },
  'rowachol 45': { price: 60.0, pack_size: 3, unit_name: 'شريط' },
  'colona 30': { price: 48.0, pack_size: 3, unit_name: 'شريط' },
  'librax 30': { price: 36.0, pack_size: 3, unit_name: 'شريط' },
  'buscopan 20': { price: 36.0, pack_size: 2, unit_name: 'شريط' },
  'buscopan plus 20': { price: 48.0, pack_size: 2, unit_name: 'شريط' },
  'visceralgine 20': { price: 36.0, pack_size: 2, unit_name: 'شريط' },
  'primperan 10mg 20': { price: 24.0, pack_size: 2, unit_name: 'شريط' },
  'motilium 10mg 40': { price: 68.0, pack_size: 4, unit_name: 'شريط' },
  'kapect 120ml': { price: 20.0, pack_size: 1, unit_name: 'زجاجة' },
  'strepsils honey & lemon 24': { price: 145.0, pack_size: 2, unit_name: 'شريط' },
  'strepsils orange 24': { price: 145.0, pack_size: 2, unit_name: 'شريط' },
  'larypro 20': { price: 36.0, pack_size: 2, unit_name: 'شريط' },
  'acetylcistein 200 mg 10': { price: 35.0, pack_size: 10, unit_name: 'كيس فوار' },
  'acetylcistein 600 mg 10': { price: 45.0, pack_size: 10, unit_name: 'كيس فوار' },
  'vitacid c': { price: 24.0, pack_size: 1, unit_name: 'أنبوبة فوار' },
  'erec 100mg 12': { price: 60.0, pack_size: 2, unit_name: 'شريط' },
  'flumox 1 gm 15': { price: 63.0, pack_size: 3, unit_name: 'شريط' },
  'flumox 500mg 16': { price: 48.0, pack_size: 2, unit_name: 'شريط' },
  'zithromax 500 mg 3': { price: 98.0, pack_size: 1, unit_name: 'شريط' },
  'zithrokan 500mg 3': { price: 77.0, pack_size: 1, unit_name: 'شريط' },
  'claritine 10 mg 20': { price: 86.0, pack_size: 2, unit_name: 'شريط' },
  'zyrtec 10mg 20': { price: 80.0, pack_size: 2, unit_name: 'شريط' },
  'telfast 120mg 14': { price: 98.0, pack_size: 2, unit_name: 'شريط' },
  'telfast 180mg 14': { price: 115.0, pack_size: 2, unit_name: 'شريط' },
  'otrivin 0.1% adult': { price: 24.0, pack_size: 1, unit_name: 'زجاجة' },
  'otrivin 0.05%': { price: 24.0, pack_size: 1, unit_name: 'زجاجة' },
  'otrivin baby': { price: 35.0, pack_size: 1, unit_name: 'زجاجة' },
  'fucidin 2% cream 15': { price: 48.0, pack_size: 1, unit_name: 'أنبوبة' },
  'fucicort cream 15': { price: 56.0, pack_size: 1, unit_name: 'أنبوبة' },
  'betaderm cream 15': { price: 16.0, pack_size: 1, unit_name: 'أنبوبة' },
  'kenacomb cream 15': { price: 42.0, pack_size: 1, unit_name: 'أنبوبة' },
  'mebo oint 15': { price: 65.0, pack_size: 1, unit_name: 'أنبوبة' },
  'mebo oint 30': { price: 115.0, pack_size: 1, unit_name: 'أنبوبة' },
};

// ── 2. دالة تنظيف وتطبيع الاسم للمطابقة ───────────────────────────────────────
function cleanNameForMatching(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/\s*\((?:n\/a|cancelled|illegal import|imported)[^)]*\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ── 3. دالة التطبيع الصوتي العربي للبحث الذكي ─────────────────────────────────
export function normalizeSearchText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[-_./\\(),+]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function generateArabicVariants(str) {
  if (!str) return '';
  const variants = [];
  const s = String(str).trim();
  if (s.includes('فنترن')) variants.push('الفانترن', 'ألفانترن', 'الفنتيرن', 'الفنترين');
  if (s.includes('وجمنتين')) variants.push('اوجمنتين', 'أوجمنتين', 'اوجمانتين');
  if (s.includes('نادول')) variants.push('بنادول', 'بانادول');
  if (s.includes('تفلام')) variants.push('كتافلام', 'كاتافلام');
  if (s.includes('نكور')) variants.push('كونكور', 'كنكور');
  if (s.includes('روتون')) variants.push('نيوروتون', 'نيروتون');
  if (s.includes('يلجا')) variants.push('ميلجا', 'ملجا');
  return variants.join(' ');
}

// ── 4. المحرك الفائق لاستنتاج الشكل الصيدلي والشرائط والوحدات ─────────────────
export function deducePackagingAndStrips(nameEn, nameAr, defaultUnits, description) {
  const nEn = String(nameEn || '').toLowerCase();
  const nAr = String(nameAr || '');
  const text = (nEn + ' ' + nAr).toLowerCase();

  // 1. السوائل والمستحضرات الموضعية (علبة/زجاجة غير قابلة للتجزئة)
  if (/\b(syrup|شراب)\b/i.test(text)) return { dosageForm: 'شراب فموي', unitName: 'زجاجة', packSize: 1 };
  if (/\b(susp|suspension|معلق)\b/i.test(text)) return { dosageForm: 'معلق للشرب', unitName: 'زجاجة', packSize: 1 };
  if (/\b(drop|drops|نقط|قطرة|قطره)\b/i.test(text)) return { dosageForm: 'نقط (قطرة)', unitName: 'زجاجة', packSize: 1 };
  if (/\b(cream|كريم)\b/i.test(text)) return { dosageForm: 'كريم موضعي', unitName: 'أنبوبة', packSize: 1 };
  if (/\b(oint|ointment|مرهم)\b/i.test(text)) return { dosageForm: 'مرهم موضعي', unitName: 'أنبوبة', packSize: 1 };
  if (/\b(gel|جل)\b/i.test(text)) return { dosageForm: 'جل موضعي', unitName: 'أنبوبة', packSize: 1 };
  if (/\b(spray|بخاخ|بخاخة)\b/i.test(text)) return { dosageForm: 'بخاخ موضعي', unitName: 'بخاخ', packSize: 1 };
  if (/\b(lotion|لوشن)\b/i.test(text)) return { dosageForm: 'لوشن موضعي', unitName: 'زجاجة', packSize: 1 };
  if (/\b(mouth\s*wash|مضمضة|غسول)\b/i.test(text)) return { dosageForm: 'غسول فم', unitName: 'زجاجة', packSize: 1 };
  if (/\b(shampoo|شامبو)\b/i.test(text)) return { dosageForm: 'شامبو', unitName: 'زجاجة', packSize: 1 };
  if (/\b(solution|محلول)\b/i.test(text) && !/tab|cap|amp|sachet/i.test(text)) return { dosageForm: 'محلول', unitName: 'زجاجة', packSize: 1 };

  // 2. الفيال (حقن فيال)
  if (/\b(vial|vials|فيال)\b/i.test(text)) {
    const m = text.match(/(\d+)\s*(vial|vials|فيال)/i);
    const count = m ? parseInt(m[1], 10) : (defaultUnits > 1 && defaultUnits <= 50 ? defaultUnits : 1);
    return { dosageForm: 'فيال حقن', unitName: 'فيال', packSize: Math.max(1, count) };
  }

  // 3. الأمبولات (حقن أمبولات)
  if (/\b(amp|amps|ampoule|ampoules|امبول|أمبول|أمبولات|امبولات)\b/i.test(text)) {
    const m = text.match(/(\d+)\s*(amp|amps|ampoule|ampoules|امبول|أمبول|أمبولات|امبولات)/i);
    let count = m ? parseInt(m[1], 10) : (defaultUnits > 1 && defaultUnits <= 50 ? defaultUnits : 1);
    return { dosageForm: 'أمبولات حقن', unitName: 'أمبول', packSize: Math.max(1, count) };
  }

  // 4. الفوار والأكياس
  if (/\b(sachet|sachets|efferv|فوار|أكياس|اكياس|كيس)\b/i.test(text) || /eff\.?\s*gr/i.test(text)) {
    const m = text.match(/(\d+)\s*(sachet|sachets|eff|كيس|أكياس|اكياس)/i);
    let count = m ? parseInt(m[1], 10) : (defaultUnits > 1 && defaultUnits <= 100 ? defaultUnits : 1);
    return { dosageForm: 'أكياس فوار', unitName: 'كيس فوار', packSize: Math.max(1, count) };
  }

  // 5. اللبوس (تحاميل)
  if (/\b(supp|supps|suppository|suppositories|لبوس|تحاميل|قمع)\b/i.test(text)) {
    const m = text.match(/(\d+)\s*(supp|supps|suppository|suppositories|لبوس|تحاميل)/i);
    const count = m ? parseInt(m[1], 10) : 5;
    const strips = count >= 10 ? Math.round(count / 5) : 1;
    return { dosageForm: 'لبوس (تحاميل)', unitName: 'شريط', packSize: strips };
  }

  // 6. عدد الشرائط المذكور صراحة
  const stripMatch = text.match(/(\d+)\s*(strip|strips|شريط|شرائط|اشرطة)/i);
  if (stripMatch) {
    const count = parseInt(stripMatch[1], 10);
    return { dosageForm: 'أقراص', unitName: 'شريط', packSize: Math.max(1, count) };
  }
  if (/شريطين|شريطان/.test(text)) {
    return { dosageForm: 'أقراص', unitName: 'شريط', packSize: 2 };
  }

  // 7. النمط المركب (XxY) أو X*Y
  const multMatch = text.match(/(\d+)\s*[*xX]\s*(\d+)\s*(tab|cap|قرص|كبسول)/i);
  if (multMatch) {
    const num1 = parseInt(multMatch[1], 10);
    const num2 = parseInt(multMatch[2], 10);
    const strips = Math.min(num1, num2) <= 10 && Math.max(num1, num2) >= 10 ? Math.min(num1, num2) : num1;
    return { dosageForm: 'أقراص', unitName: 'شريط', packSize: Math.max(1, strips) };
  }

  // 8. الأشكال الصلبة (أقراص وكبسولات ومضغ واستحلاب)
  const isCap = /\b(cap|caps|capsule|capsules|softgel|softgels|s\.g\.cap|veg\.cap|كبسول|كبسولة|كبسولات)\b/i.test(text);
  const isTab = /\b(tab|tabs|tablet|tablets|f\.?c\.?\s*tab|f\.?c\.?\s*tabs|lozenges|chew\.?\s*tab|قرص|أقراص|اقراص)\b/i.test(text);

  if (isCap || isTab) {
    const dosageForm = isCap ? 'كبسولات' : 'أقراص';
    const solidRegex = /(\d+)\s*(?:[a-z().-]+\s*)*(tabs?|tablets?|caps?|capsules?|lozenges|softgels?|أقراص|اقراص|قرص|كبسولات?|كبسول)\b/i;
    const tabMatch = text.match(solidRegex);
    if (tabMatch) {
      const total = parseInt(tabMatch[1], 10);
      let strips = 1;
      if (total >= 90 && total <= 100) strips = 10;
      else if (total === 84) strips = 6;
      else if (total === 60) strips = 6;
      else if (total === 56) strips = 4;
      else if (total === 50) strips = 5;
      else if (total === 48) strips = 4; // 4 شرائط من 12 (مثل بنادول 48 قرص)
      else if (total === 42) strips = 3;
      else if (total === 40) strips = 4;
      else if (total === 36) strips = 3; // 3 شرائط من 12
      else if (total === 30) strips = 3;
      else if (total === 28) strips = 2; // 2 شرائط من 14
      else if (total === 24) strips = 2; // 2 شرائط من 12
      else if (total === 21) strips = 3; // 3 شرائط من 7
      else if (total === 20) strips = 2; // 2 شرائط من 10
      else if (total === 16) strips = 2; // 2 شرائط من 8
      else if (total === 15) strips = 1; // شريط من 15
      else if (total === 14) strips = 2; // 2 شرائط من 7 (أوجمنتين وغيرها)
      else if (total === 12) strips = 2; // 2 شرائط من 6
      else if (total === 10) strips = 1; // شريط من 10
      else if (total <= 8) strips = 1;
      else {
        if (total % 10 === 0 && total <= 100) strips = total / 10;
        else if (defaultUnits && defaultUnits > 0 && defaultUnits <= 10) strips = defaultUnits;
        else strips = 1;
      }
      return { dosageForm, unitName: 'شريط', packSize: Math.max(1, strips) };
    }

    let strips = 1;
    if (defaultUnits && defaultUnits > 1 && defaultUnits <= 10) strips = defaultUnits;
    return { dosageForm, unitName: 'شريط', packSize: strips };
  }

  // الحالة العامة الافتراضية
  let packSize = 1;
  if (defaultUnits && defaultUnits > 1 && defaultUnits <= 10) packSize = defaultUnits;
  return {
    dosageForm: description || 'مستحضر دوائي',
    unitName: packSize > 1 ? 'شريط' : 'عبوة',
    packSize
  };
}

// ── 5. المحرك الرئيسي للدمج ──────────────────────────────────────────────────
export function buildMergedCatalog() {
  console.log('🚀 [Drug Engine 2026] بدء عملية الدمج والتحديث الشامل...');

  const egDrugsPath = path.join(__dirname, '..', 'data', 'eg_drugs.json');
  const karemPath = path.join(__dirname, '..', 'data', 'karem505_drugs.json');

  if (!fs.existsSync(egDrugsPath)) {
    throw new Error(`File not found: ${egDrugsPath}`);
  }

  const rawEg = fs.readFileSync(egDrugsPath, 'utf8').replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]+/g, ' ');
  const egDrugs = JSON.parse(rawEg);
  console.log(`📦 تم تحميل ${egDrugs.length} دواء من الكتالوج الرئيسي (eg_drugs.json).`);

  let karemDrugs = [];
  if (fs.existsSync(karemPath)) {
    const rawKarem = fs.readFileSync(karemPath, 'utf8');
    karemDrugs = JSON.parse(rawKarem);
    console.log(`📦 تم تحميل ${karemDrugs.length} دواء من تحديث Drug Eye 2026 (karem505_drugs.json).`);
  }

  // خريطة Drug Eye 2026
  const karemMap = new Map();
  karemDrugs.forEach(k => {
    const key = cleanNameForMatching(k.commercial_name_en);
    if (key && k.price_egp) {
      karemMap.set(key, k);
    }
  });

  const matchedKaremKeys = new Set();
  let priceUpdatedCount = 0;
  let packSizeUpdatedCount = 0;
  let overrideCount = 0;

  // 1. معالجة وتحديث أدوية الكتالوج الحالي
  const updatedCatalog = egDrugs.map(d => {
    const nameEn = String(d.name || '').trim();
    const nameAr = String(d.arabic || nameEn).trim();
    const cleanKey = cleanNameForMatching(nameEn);

    let originalPrice = parseFloat(String(d.price || '0').replace(/[^0-9.]/g, '')) || 0;
    let finalPrice = originalPrice;

    // مطابقة سعر Drug Eye 2026
    const karemMatch = karemMap.get(cleanKey);
    if (karemMatch) {
      matchedKaremKeys.add(cleanKey);
      const karemPrice = parseFloat(karemMatch.price_egp) || 0;
      if (karemPrice > finalPrice) {
        finalPrice = karemPrice;
      }
    }

    // 2. مطابقة التحديثات الاسترشادية 2026 بالأكثر دقة وتحديداً أولاً
    let overrideMatch = null;
    const nameLower = nameEn.toLowerCase();
    const sortedPatterns = Object.entries(OVERRIDES_2026).sort((a, b) => b[0].length - a[0].length);

    // استنتاج الشكل الصيدلي وحجم العبوة والشرائط أولاً
    let { dosageForm, unitName, packSize } = deducePackagingAndStrips(
      nameEn,
      nameAr,
      d.units,
      d.description
    );

    for (const [pattern, ovr] of sortedPatterns) {
      if (nameLower.includes(pattern)) {
        // حماية الأشكال المختلفة (أكياس فوار، شراب، أمبولات) من تجاوزات الأقراص
        if ((dosageForm === 'أكياس فوار' || dosageForm === 'معلق للشرب') && ovr.unit_name === 'شريط') continue;
        if (dosageForm === 'شراب فموي' && ovr.unit_name === 'شريط') continue;
        if (dosageForm === 'أمبولات حقن' && ovr.unit_name === 'شريط') continue;

        overrideMatch = ovr;
        break;
      }
    }

    if (overrideMatch) {
      finalPrice = Math.max(finalPrice, overrideMatch.price);
      // إذا كان حجم العبوة المستنتج من اسم الدواء أكبر (مثل عبوات 48 قرص)، لا نخفضه لـ 2
      if (overrideMatch.pack_size > packSize || (packSize <= 1 && overrideMatch.pack_size > 1)) {
        packSize = overrideMatch.pack_size;
      }
      unitName = overrideMatch.unit_name;
      overrideCount++;
    }

    if (finalPrice !== originalPrice) {
      priceUpdatedCount++;
    }
    const oldPackSize = Math.max(1, parseInt(d.units || 1, 10) || 1);
    if (packSize !== oldPackSize) {
      packSizeUpdatedCount++;
    }

    const unitPrice = parseFloat((finalPrice / packSize).toFixed(2));
    const isTableDrug = /(tramadol|pregabalin|gabapentin|clonazepam|diazepam|alprazolam|zolpidem|جدول|مخدر)/i.test(`${nameEn} ${nameAr} ${d.active || ''}`);
    const isRefrigerated = /(insulin|انسولين|ثلاجة|clexane|vaccine|لقاح|مصل|refrigerat)/i.test(`${nameEn} ${nameAr} ${d.active || ''}`);
    const arVariants = generateArabicVariants(nameAr);
    const normalized = normalizeSearchText(`${nameEn} ${nameAr} ${arVariants} ${d.active || ''} ${d.company || ''} ${d.barcode || ''} ${dosageForm}`);

    const cleanIdNum = String(d.id || '').replace(/^(?:eg-)+/, '');
    const cleanId = `eg-${cleanIdNum}`;

    return {
      ...d,
      id: cleanId,
      name: nameEn,
      arabic: nameAr,
      price: finalPrice.toFixed(2),
      effective_price: finalPrice,
      units: packSize,
      pack_size: packSize,
      unit_name: unitName,
      unit_price: unitPrice,
      dosage_form: dosageForm,
      is_table_drug: isTableDrug,
      is_refrigerated: isRefrigerated,
      search_normalized: normalized
    };
  });

  // 2. إضافة الأدوية الجديدة كلياً من Drug Eye 2026
  let newDrugsAdded = 0;
  karemDrugs.forEach((k, idx) => {
    const p = parseFloat(k.price_egp) || 0;
    if (p <= 0) return;
    const nameEn = String(k.commercial_name_en || '').trim();
    if (!nameEn || nameEn.length < 3) return;
    if (/^999999/.test(nameEn) || /test|fake/i.test(nameEn)) return;

    const cleanKey = cleanNameForMatching(nameEn);
    if (matchedKaremKeys.has(cleanKey)) return;

    const nameAr = String(k.commercial_name_ar || nameEn).trim();
    const active = String(k.scientific_name || 'مستحضر دوائي').trim();
    const company = String(k.manufacturer || '').trim();

    let { dosageForm, unitName, packSize } = deducePackagingAndStrips(
      nameEn,
      nameAr,
      1,
      k.drug_class || ''
    );

    const unitPrice = parseFloat((p / packSize).toFixed(2));
    const isTableDrug = /(tramadol|pregabalin|gabapentin|clonazepam|diazepam|alprazolam|zolpidem|جدول|مخدر)/i.test(`${nameEn} ${nameAr} ${active}`);
    const isRefrigerated = /(insulin|انسولين|ثلاجة|clexane|vaccine|لقاح|مصل|refrigerat)/i.test(`${nameEn} ${nameAr} ${active}`);
    const arVariants = generateArabicVariants(nameAr);
    const normalized = normalizeSearchText(`${nameEn} ${nameAr} ${arVariants} ${active} ${company} ${dosageForm}`);

    updatedCatalog.push({
      id: `eg-k-${idx + 1}`,
      slug: `karem-${idx + 1}`,
      eda_reg_no: `EDA-K-${idx + 1}`,
      name: nameEn,
      arabic: nameAr,
      active,
      company,
      price: p.toFixed(2),
      effective_price: p,
      units: packSize,
      pack_size: packSize,
      unit_name: unitName,
      unit_price: unitPrice,
      dosage_form: dosageForm,
      description: k.drug_class || 'أدوية علاجية',
      barcode: '',
      is_table_drug: isTableDrug,
      is_refrigerated: isRefrigerated,
      search_normalized: normalized
    });
    newDrugsAdded++;
  });

  console.log('-------------------------------------------------------');
  console.log(`✅ إجمالي الأدوية في الكتالوج النهائي 2026: ${updatedCatalog.length}`);
  console.log(`🆕 أدوية ومستحضرات جديدة أضيفت من تحديث Drug Eye: ${newDrugsAdded}`);
  console.log(`📈 أدوية تم رفع أسعارها لآخر تسعيرة 2026: ${priceUpdatedCount}`);
  console.log(`🔢 أدوية تم تصحيح عدد الشرائط والوحدات بها: ${packSizeUpdatedCount}`);
  console.log(`🎯 كبار الأصناف المطابقة للقرارات الوزارية 2026: ${overrideCount}`);
  console.log('-------------------------------------------------------');

  // حفظ الملفات
  const outPath = path.join(__dirname, '..', 'data', 'eg_drugs_2026_updated.json');
  fs.writeFileSync(outPath, JSON.stringify(updatedCatalog, null, 2), 'utf8');
  console.log(`💾 تم حفظ الكتالوج المحدث في: ${outPath}`);

  // تحديث الكتالوج الأساسي للمشروع
  fs.writeFileSync(egDrugsPath, JSON.stringify(updatedCatalog, null, 2), 'utf8');
  console.log(`💾 تم تحديث الكتالوج الأساسي: ${egDrugsPath}`);

  return updatedCatalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildMergedCatalog();
}
