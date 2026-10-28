/**
 * posDiscountService.js
 * محرك سياسات الخصومات المتقدمة لنظام نقاط البيع الصيدلاني (PharmaOS POS Discount & Promo Engine)
 * يشمل:
 * 1. أكواد الخصم والبروموكود (Promo Codes) مع الشروط المتعددة.
 * 2. خصومات العاملين بالصيدلية (Employee Discounts) والتعرف التلقائي.
 * 3. خصومات العملاء المسجلين والخصومات الفردية المخصصة (Customer Tier & Individual Discounts).
 */

const STORAGE_KEY = 'pharma_pos_discount_config_v1';

// الإعدادات الافتراضية الأولية لمحرك الخصومات
export const DEFAULT_DISCOUNT_CONFIG = {
  // ── 1. سياسة خصم العاملين بالصيدلية ──
  employeeDiscount: {
    enabled: true,
    defaultPercent: 15, // نسبة الخصم المعتمدة للعاملين 15%
    maxDiscountPerInvoice: 150, // الحد الأقصى للخصم في الفاتورة الواحدة
    autoDetectInCustomerField: true, // التعرف التلقائي على الموظف عند كتابة كوده في خانة العميل
    excludePriceRegulated: true, // استثناء الأدوية المسعرة جبرياً وألبان الأطفال عند الرغبة
    notes: 'خصم معتمد لكافة العاملين بالصيدلية والكوادر الطبية'
  },

  // ── 2. قائمة البروموكود وأكواد الحملات الترويجية ──
  promoCodes: [
    {
      id: 'promo_1',
      code: 'PHARMA15',
      title: 'كود افتتاح الصيدلية الترويجي',
      discountType: 'percent', // 'percent' | 'fixed'
      discountValue: 15,
      minInvoiceTotal: 100, // الحد الأدنى للفاتورة 100 ج
      maxDiscountCap: 60, // أقصى خصم 60 ج
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      usageLimit: 500,
      timesUsed: 14,
      isActive: true,
      notes: 'كود خصم 15% بحد أقصى 60 جنيه'
    },
    {
      id: 'promo_2',
      code: 'WELCOME50',
      title: 'خصم ترحيبي للعملاء الجدد',
      discountType: 'fixed',
      discountValue: 50,
      minInvoiceTotal: 300,
      maxDiscountCap: 50,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      usageLimit: 200,
      timesUsed: 28,
      isActive: true,
      notes: 'خصم 50 ج على الفواتير فوق 300 ج'
    },
    {
      id: 'promo_3',
      code: 'VIP2026',
      title: 'كود كبار العملاء السنوي',
      discountType: 'percent',
      discountValue: 10,
      minInvoiceTotal: 50,
      maxDiscountCap: 100,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      usageLimit: 1000,
      timesUsed: 5,
      isActive: true,
      notes: 'خصم 10% لكبار العملاء'
    }
  ],

  // ── 3. سياسة خصومات العملاء المسجلين والخصومات الفردية ──
  customerDiscount: {
    enabled: true,
    // الخصم العام لكافة العملاء المسجلين
    registeredCustomersPercent: 3,
    // خصم أصحاب الأمراض المزمنة
    chronicPatientsPercent: 7,
    // شرائح الولاء للعملاء المسجلين بناءً على عدد الطلبات
    loyaltyTiers: [
      { id: 'bronze', name: 'الفئة البرونزية (جديد)', minOrders: 0, percent: 3 },
      { id: 'silver', name: 'الفئة الفضية (نشط)', minOrders: 5, percent: 5 },
      { id: 'gold', name: 'الفئة الذهبية (مميز)', minOrders: 15, percent: 8 },
      { id: 'vip', name: 'فئة كبار العملاء VIP', minOrders: 30, percent: 10 }
    ],
    // الخصومات الفردية المخصصة لعملاء بعينهم
    individualDiscounts: [
      {
        id: 'cust_disc_1',
        customerName: 'د. طارق محمود',
        phone: '01012345678',
        discountPercent: 12,
        notes: 'طبيب جار الصيدلية - خصم دائم 12%',
        isActive: true
      },
      {
        id: 'cust_disc_2',
        customerName: 'أ. مروان الشريف',
        phone: '01123456789',
        discountPercent: 10,
        notes: 'عميل سنوي - خصم ثابت 10%',
        isActive: true
      }
    ],
    // شروط تطبيق الخصم المتعددة
    conditions: {
      minInvoiceTotal: 40, // الحد الأدنى للفاتورة 40 ج
      nonStackable: true, // عدم الجمع بين الخصومات (يتم تطبيق الخصم الأعلى تلقائياً)
      applyOnlyOnOTCAndCosmetics: false // تطبيق الخصم على الفاتورة بالكامل
    }
  }
};

/**
 * استرجاع إعدادات وسياسات الخصم بالكامل
 */
export function getDiscountConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DISCOUNT_CONFIG));
      return DEFAULT_DISCOUNT_CONFIG;
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DISCOUNT_CONFIG,
      ...parsed,
      employeeDiscount: { ...DEFAULT_DISCOUNT_CONFIG.employeeDiscount, ...(parsed.employeeDiscount || {}) },
      promoCodes: Array.isArray(parsed.promoCodes) ? parsed.promoCodes : DEFAULT_DISCOUNT_CONFIG.promoCodes,
      customerDiscount: {
        ...DEFAULT_DISCOUNT_CONFIG.customerDiscount,
        ...(parsed.customerDiscount || {}),
        conditions: { ...DEFAULT_DISCOUNT_CONFIG.customerDiscount.conditions, ...(parsed.customerDiscount?.conditions || {}) }
      }
    };
  } catch (err) {
    console.error('Error reading discount config:', err);
    return DEFAULT_DISCOUNT_CONFIG;
  }
}

/**
 * حفظ وتحديث إعدادات وسياسات الخصم محلياً وعلى الخادم
 */
export async function saveDiscountConfig(newConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    // بث حدث التحديث اللحظي لكافة شاشات البيع
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos:discounts-updated', { detail: newConfig }));
    }

    // مزامنة مع الخادم السحابي
    try {
      fetch('/api/pos/discounts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: newConfig })
      }).catch(() => null);
    } catch {}

    return true;
  } catch (err) {
    console.error('Error saving discount config:', err);
    return false;
  }
}

/**
 * فحص وتطبيق كود البروموكود على الفاتورة مع التحقق من كافة الشروط
 */
export function validateAndApplyPromoCode(codeStr, invoiceSubtotal, options = {}) {
  const cleanCode = String(codeStr || '').trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, error: 'يرجى إدخال كود الخصم أولاً' };
  }

  const subtotal = Math.max(0, parseFloat(invoiceSubtotal || 0));
  const config = getDiscountConfig();
  const promo = config.promoCodes?.find(
    (p) => String(p.code || '').trim().toUpperCase() === cleanCode
  );

  if (!promo) {
    return { valid: false, error: `كود الخصم [${cleanCode}] غير موجود أو غير صالح.` };
  }

  if (!promo.isActive) {
    return { valid: false, error: `كود الخصم [${cleanCode}] متوقف حالياً.` };
  }

  // فحص تاريخ الصلاحية
  const today = new Date().toISOString().slice(0, 10);
  if (promo.startDate && promo.startDate > today) {
    return { valid: false, error: `كود الخصم [${cleanCode}] يبدأ العمل به من تاريخ ${promo.startDate}.` };
  }
  if (promo.endDate && promo.endDate < today) {
    return { valid: false, error: `كود الخصم [${cleanCode}] انتهت صلاحيته في ${promo.endDate}.` };
  }

  // فحص حد الاستخدام
  if (promo.usageLimit > 0 && (promo.timesUsed || 0) >= promo.usageLimit) {
    return { valid: false, error: `كود الخصم [${cleanCode}] وصل للحد الأقصى لمرات الاستخدام.` };
  }

  // فحص الحد الأدنى لإجمالي الفاتورة
  if (promo.minInvoiceTotal > 0 && subtotal < promo.minInvoiceTotal) {
    return {
      valid: false,
      error: `الحد الأدنى للفاتورة لتطبيق هذا الكود هو ${promo.minInvoiceTotal} ج.م (الإجمالي الحالي: ${subtotal.toFixed(2)} ج.م).`
    };
  }

  // حساب قيمة الخصم
  let discountAmount = 0;
  if (promo.discountType === 'percent') {
    discountAmount = (subtotal * (parseFloat(promo.discountValue) || 0)) / 100;
  } else {
    discountAmount = parseFloat(promo.discountValue) || 0;
  }

  // تطبيق سقف الحد الأقصى للخصم (Cap)
  if (promo.maxDiscountCap > 0 && discountAmount > promo.maxDiscountCap) {
    discountAmount = promo.maxDiscountCap;
  }

  discountAmount = Math.min(subtotal, Math.max(0, parseFloat(discountAmount.toFixed(2))));

  return {
    valid: true,
    promo,
    code: cleanCode,
    discountAmount,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    message: `✓ تم تفعيل كود الخصم: ${promo.title || cleanCode} (خصم: ${discountAmount.toFixed(2)} ج.م)`
  };
}

/**
 * البحث عن الموظف عند إدخال كوده أو هاتفه في خانة العميل
 */
export function findEmployeeByCodeOrPhone(query, employeesList = []) {
  if (!query) return null;
  const clean = String(query).trim().toLowerCase();
  const cleanDigits = clean.replace(/\D/g, '');

  return employeesList.find((emp) => {
    const empCode = String(emp.code || '').trim().toLowerCase();
    const empId = String(emp.id || '').trim().toLowerCase();
    const empPhone = String(emp.phone || '').replace(/\D/g, '');
    const empNationalId = String(emp.national_id || emp.nationalId || '').trim();

    return (
      empCode === clean ||
      empId === clean ||
      (cleanDigits.length >= 2 && empCode === cleanDigits) ||
      (cleanDigits.length >= 8 && empPhone.includes(cleanDigits)) ||
      (cleanDigits.length >= 10 && empNationalId === cleanDigits)
    );
  }) || null;
}

/**
 * حساب خصم العاملين بالصيدلية
 */
export function calculateEmployeeDiscount(employee, invoiceSubtotal, cartItems = []) {
  if (!employee) return 0;
  const config = getDiscountConfig();
  const empConfig = config.employeeDiscount;

  if (!empConfig || !empConfig.enabled) return 0;

  const subtotal = Math.max(0, parseFloat(invoiceSubtotal || 0));
  const percent = parseFloat(empConfig.defaultPercent || 15);
  let discountAmount = (subtotal * percent) / 100;

  // الحد الأقصى للخصم في الفاتورة الواحدة
  if (empConfig.maxDiscountPerInvoice > 0 && discountAmount > empConfig.maxDiscountPerInvoice) {
    discountAmount = empConfig.maxDiscountPerInvoice;
  }

  return Math.min(subtotal, Math.max(0, parseFloat(discountAmount.toFixed(2))));
}

/**
 * حساب خصم العميل (سواء كان عميل عادي مسجل، مريض مزمن، أو عميل له خصم فردي خاص)
 */
export function calculateCustomerDiscount(customer, invoiceSubtotal, cartItems = []) {
  if (!customer) return 0;
  const config = getDiscountConfig();
  const custConfig = config.customerDiscount;

  if (!custConfig || !custConfig.enabled) return 0;

  const subtotal = Math.max(0, parseFloat(invoiceSubtotal || 0));
  const minTotal = parseFloat(custConfig.conditions?.minInvoiceTotal || 0);

  if (minTotal > 0 && subtotal < minTotal) return 0;

  let applicablePercent = 0;
  let reason = '';

  // 1. فحص الخصومات الفردية المخصصة أولاً (الأعلى أولوية)
  const custPhone = String(customer.phone || customer.whatsapp_phone || '').replace(/\D/g, '');
  const custName = String(customer.name || customer.full_name || '').trim().toLowerCase();

  const indDisc = custConfig.individualDiscounts?.find((ind) => {
    if (!ind.isActive) return false;
    const indPhone = String(ind.phone || '').replace(/\D/g, '');
    const indName = String(ind.customerName || '').trim().toLowerCase();
    return (custPhone && indPhone && indPhone === custPhone) || (custName && indName && custName === indName);
  });

  if (indDisc) {
    applicablePercent = parseFloat(indDisc.discountPercent || 0);
    reason = indDisc.notes || `خصم فردي مخصص للعميل (${applicablePercent}%)`;
  } else if (customer.isChronic || customer.is_chronic) {
    // 2. خصم أصحاب الأمراض المزمنة
    applicablePercent = parseFloat(custConfig.chronicPatientsPercent || 7);
    reason = `خصم رعاية الأمراض المزمنة (${applicablePercent}%)`;
  } else {
    // 3. خصم شرائح العملاء المسجلين (Loyalty Tiers)
    const ordersCount = parseInt(customer.total_orders_count || customer.ordersCount || 0, 10);
    const tiers = [...(custConfig.loyaltyTiers || [])].sort((a, b) => b.minOrders - a.minOrders);
    const matchedTier = tiers.find((t) => ordersCount >= t.minOrders);

    if (matchedTier) {
      applicablePercent = parseFloat(matchedTier.percent || 0);
      reason = `شريحة ${matchedTier.name} (${applicablePercent}%)`;
    } else {
      applicablePercent = parseFloat(custConfig.registeredCustomersPercent || 3);
      reason = `خصم عميل مسجل (${applicablePercent}%)`;
    }
  }

  if (applicablePercent <= 0) return 0;

  const discountAmount = Math.min(subtotal, (subtotal * applicablePercent) / 100);
  return {
    percent: applicablePercent,
    amount: parseFloat(discountAmount.toFixed(2)),
    reason
  };
}

