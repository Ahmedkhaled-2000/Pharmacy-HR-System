/**
 * إعدادات وتعاريف اختصارات لوحة المفاتيح لنظام Pharmacy ERP
 */

export const STORAGE_SHORTCUTS_KEY = 'pharmacy_custom_shortcuts';

export const DEFAULT_SHORTCUTS = [
  // ── 1. أمان وتحكم النظام (System & Security) ───────────────────────────
  {
    id: 'lockSystem',
    name: 'إيقاف وقفل النظام مؤقتاً',
    desc: 'قفل النظام فوراً وطلب كلمة المرور لحماية الشاشة والبيانات عند مغادرة المكتب',
    category: 'system',
    key: 'ScrollLock',
    modifiers: [],
    fallbackKey: 'l',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'toggleFullscreen',
    name: 'تكبير وتصغير الشاشة (ملء الشاشة)',
    desc: 'تبديل وضع ملء الشاشة أو استعادة حجم نافذة النظام',
    category: 'system',
    key: 'F11',
    modifiers: []
  },
  {
    id: 'refreshData',
    name: 'تحديث ومزامنة البيانات الفورية',
    desc: 'إعادة مزامنة وتحديث سجلات الحضور والبصمات والبيانات السحابية لحظياً',
    category: 'system',
    key: 'F5',
    modifiers: [],
    fallbackKey: 'r',
    fallbackModifiers: ['Ctrl']
  },
  {
    id: 'clearCacheReload',
    name: 'مسح الكاش القديم وإعادة تحميل الصفحة إجبارياً',
    desc: 'إلغاء برمجيات Service Worker وحذف ملفات التخزين المؤقت (CacheStorage) وإجبار المتصفح على تنزيل أحدث كود للنظام وإعادة التحميل بالكامل',
    category: 'system',
    key: 'r',
    modifiers: ['Ctrl', 'Shift'],
    fallbackKey: 'F5',
    fallbackModifiers: ['Ctrl']
  },

  // ── 2. اختصارات عامة والتنقل بالقوائم والبحث (General & Menus) ─────────
  {
    id: 'closeModal',
    name: 'إغلاق النوافذ المنبثقة والقوائم',
    desc: 'إغلاق أي نافذة منبثقة أو قائمة منسدلة فوراً في كامل النظام',
    category: 'general',
    key: 'Escape',
    modifiers: [],
    isFixed: true
  },
  {
    id: 'help',
    name: 'دليل واختصارات النظام',
    desc: 'فتح نافذة دليل وشرح اختصارات لوحة المفاتيح السريعة',
    category: 'general',
    key: 'F1',
    modifiers: [],
    fallbackKey: 'h',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'quickSearch',
    name: 'البحث السريع العام',
    desc: 'التركيز المباشر على حقل البحث العام بالمؤسسة والحسابات',
    category: 'general',
    key: 'k',
    modifiers: ['Ctrl'],
    fallbackKey: 'k',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'findInTable',
    name: 'البحث وتصفية الجدول النشط',
    desc: 'التركيز على خانة البحث والفلترة في الجدول المعروض حالياً',
    category: 'general',
    key: 'f',
    modifiers: ['Ctrl'],
    fallbackKey: 'f',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'focusMenuBar',
    name: 'التركيز على شريط القوائم العلوي',
    desc: 'تفعيل شريط القوائم للتنقل بين الأقسام والخيارات بالأسهم دون ماوس',
    category: 'general',
    key: 'F10',
    modifiers: [],
    fallbackKey: 'Alt',
    fallbackModifiers: []
  },
  {
    id: 'menuNavigation',
    name: 'التنقل بالأسهم داخل القوائم',
    desc: 'استخدام مفاتيح الأسهم للتبديل والتنقل السلس داخل القوائم والبنود المنسدلة',
    category: 'general',
    key: 'Arrows',
    modifiers: [],
    isFixed: true
  },
  {
    id: 'toggleNotifications',
    name: 'مركز الإشعارات والتنبيهات',
    desc: 'فتح أو إغلاق قائمة الإشعارات والتنبيهات الإدارية اللحظية',
    category: 'general',
    key: 'i',
    modifiers: ['Alt'],
    fallbackKey: 'o',
    fallbackModifiers: ['Alt']
  },

  // ── 3. الإدخال والعمليات وحفظ البيانات (Actions & Data) ─────────────────
  {
    id: 'newEntry',
    name: 'إضافة جديدة سريعة',
    desc: 'فتح نموذج إضافة موظف أو قيد يومية أو وردية جديدة بحسب الشاشة المعروضة',
    category: 'actions',
    key: 'n',
    modifiers: ['Alt'],
    fallbackKey: 'n',
    fallbackModifiers: ['Ctrl']
  },
  {
    id: 'saveForm',
    name: 'حفظ النموذج المفتوح',
    desc: 'حفظ البيانات في النافذة المنبثقة النشطة ومنع نافذة حفظ المتصفح الخام',
    category: 'actions',
    key: 's',
    modifiers: ['Ctrl'],
    fallbackKey: 's',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'printView',
    name: 'طباعة التقرير أو السند',
    desc: 'طباعة التقرير الحالي عبر محرك الطباعة المخصص ومنع طباعة المتصفح الخام',
    category: 'actions',
    key: 'p',
    modifiers: ['Ctrl'],
    fallbackKey: 'p',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'exportExcel',
    name: 'تصدير البيانات إلى Excel',
    desc: 'تصدير بيانات الجدول أو الكشف المفتوح حالياً إلى ملف إكسيل فوري',
    category: 'actions',
    key: 'e',
    modifiers: ['Alt'],
    fallbackKey: 'x',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'confirmAction',
    name: 'تأكيد الحوارات والعمليات',
    desc: 'تأكيد الرسائل التحذيرية ومربعات الحوار بزر Enter دون استخدام الماوس',
    category: 'actions',
    key: 'Enter',
    modifiers: [],
    isFixed: true
  },

  // ── 4. التنقل السريع بين الأقسام الرئيسية (Navigation) ──────────────────
  {
    id: 'navDashboard',
    name: 'الانتقال إلى لوحة التحكم (1)',
    desc: 'الانتقال المباشر إلى لوحة التحكم والإحصائيات العامة للمؤسسة',
    category: 'nav',
    key: '1',
    modifiers: ['Alt']
  },
  {
    id: 'navEmployees',
    name: 'الانتقال إلى شؤون الموظفين (2)',
    desc: 'الانتقال إلى ملفات وبيانات وسجلات الكادر الوظيفي',
    category: 'nav',
    key: '2',
    modifiers: ['Alt']
  },
  {
    id: 'navAttendance',
    name: 'الانتقال إلى الحضور والورديات (3)',
    desc: 'الانتقال إلى شاشة الحضور والانصراف والورديات وسجلات البصمات',
    category: 'nav',
    key: '3',
    modifiers: ['Alt']
  },
  {
    id: 'navPayroll',
    name: 'الانتقال إلى مسير الرواتب (4)',
    desc: 'الانتقال إلى مسير الرواتب والمستحقات والبدلات الشهرية',
    category: 'nav',
    key: '4',
    modifiers: ['Alt']
  },
  {
    id: 'navAccounts',
    name: 'الانتقال إلى الحسابات العامة (5)',
    desc: 'الانتقال إلى منظومة الحسابات وشجرة الحسابات (ERP)',
    category: 'nav',
    key: '5',
    modifiers: ['Alt']
  },
  {
    id: 'navBranches',
    name: 'الانتقال إلى الفروع والمبيعات (6)',
    desc: 'الانتقال إلى إدارة الفروع والصيدليات ومتابعة المبيعات',
    category: 'nav',
    key: '6',
    modifiers: ['Alt']
  },
  {
    id: 'navRequests',
    name: 'الانتقال إلى الطلبات والموافقات (7)',
    desc: 'الانتقال المباشر إلى مركز اعتماد طلبات الإجازات والأذونات والسلف',
    category: 'nav',
    key: '7',
    modifiers: ['Alt']
  },
  {
    id: 'navLeaves',
    name: 'الانتقال إلى سجل الإجازات والأذونات (8)',
    desc: 'الانتقال إلى مركز تتبع أرصدة الإجازات وساعات الاستئذان',
    category: 'nav',
    key: '8',
    modifiers: ['Alt']
  },
  {
    id: 'navBylaws',
    name: 'الانتقال إلى لائحة العمل (9)',
    desc: 'الانتقال إلى لائحة الجزاءات التأديبية والسياسات المعتمدة',
    category: 'nav',
    key: '9',
    modifiers: ['Alt']
  },
  {
    id: 'navSettings',
    name: 'الانتقال إلى إعدادات النظام (0)',
    desc: 'الانتقال إلى شاشة الإعدادات العامة والصلاحيات والنسخ الاحتياطي',
    category: 'nav',
    key: '0',
    modifiers: ['Alt']
  },
  {
    id: 'kioskMode',
    name: 'شاشة كشك البصمة السريعة',
    desc: 'الانتقال المباشر لشاشة تسجيل البصمة والحضور الذاتي للموظفين',
    category: 'nav',
    key: 'k',
    modifiers: ['Alt', 'Shift'],
    fallbackKey: 'k',
    fallbackModifiers: ['Ctrl', 'Alt']
  }
];

export function getActiveShortcuts(customList) {
  if (Array.isArray(customList) && customList.length > 0) {
    // Merge custom overrides over defaults
    return DEFAULT_SHORTCUTS.map((def) => {
      const match = customList.find((c) => c.id === def.id);
      return match ? { ...def, ...match } : def;
    });
  }

  try {
    const raw = localStorage.getItem(STORAGE_SHORTCUTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return DEFAULT_SHORTCUTS.map((def) => {
          const match = parsed.find((c) => c.id === def.id);
          return match ? { ...def, ...match } : def;
        });
      }
    }
  } catch {}

  return DEFAULT_SHORTCUTS;
}

export function formatShortcutDisplay(item) {
  if (!item) return '';
  const parts = [];
  if (item.modifiers && item.modifiers.length > 0) {
    item.modifiers.forEach((m) => parts.push(m));
  }
  let keyName = item.key;
  if (keyName === 'Escape') keyName = 'Esc';
  else if (keyName === 'ScrollLock') keyName = 'Scroll Lock';
  else if (keyName === 'Enter') keyName = 'Enter ↵';
  else if (keyName === 'Arrows') keyName = '← ↑ → ↓';
  else if (/^F\d{1,2}$/i.test(keyName)) keyName = keyName.toUpperCase();
  else if (keyName) keyName = keyName.toUpperCase();
  parts.push(keyName);
  return parts.join(' + ');
}

export function formatShortcutFallback(item) {
  if (!item || !item.fallbackKey) return '';
  const parts = [];
  if (item.fallbackModifiers && item.fallbackModifiers.length > 0) {
    item.fallbackModifiers.forEach((m) => parts.push(m));
  }
  let keyName = item.fallbackKey;
  if (keyName === 'Escape') keyName = 'Esc';
  else if (keyName === 'ScrollLock') keyName = 'Scroll Lock';
  else if (/^F\d{1,2}$/i.test(keyName)) keyName = keyName.toUpperCase();
  else if (keyName) keyName = keyName.toUpperCase();
  parts.push(keyName);
  return parts.join(' + ');
}

/**
 * Normalizes keyboard event key into a layout-independent lowercase letter or digit
 * Handles English, Arabic keyboard layouts, Numpad, and physical hardware key codes
 */
export function normalizeKeyFromEvent(e) {
  if (!e) return '';

  // 1. Check physical code first (immune to keyboard language switch!)
  if (e.code) {
    if (e.code.startsWith('Key') && e.code.length === 4) {
      return e.code.slice(3).toLowerCase(); // 'KeyS' -> 's', 'KeyN' -> 'n', 'KeyP' -> 'p'
    }
    if (e.code.startsWith('Digit') && e.code.length === 6) {
      return e.code.slice(5); // 'Digit1' -> '1'
    }
    if (e.code.startsWith('Numpad') && /^Numpad\d$/.test(e.code)) {
      return e.code.slice(6); // 'Numpad1' -> '1'
    }
    if (/^F\d{1,2}$/i.test(e.code)) {
      return e.code.toUpperCase(); // 'F1'
    }
    if (e.code === 'Escape') return 'Escape';
    if (e.code === 'ScrollLock') return 'scrolllock';
    if (e.code === 'Enter') return 'enter';
    if (e.code === 'Slash') return '/';
  }

  // 2. Direct key checks
  if (e.key === 'Escape') return 'Escape';
  if (e.key === 'ScrollLock' || e.keyCode === 145) return 'scrolllock';
  if (e.key === 'Enter') return 'enter';
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toUpperCase();
  if (e.key === '/' || e.key === '؟' || e.key === 'ظ') return '/';

  // 3. Arabic layout character dictionary fallback (Arabic 101/102 keyboard layout)
  const ARABIC_TO_LATIN = {
    'ش': 'a',
    'لا': 'b', 'لآ': 'b', 'لأ': 'b', 'لإ': 'b',
    'ؤ': 'c',
    'ي': 'd',
    'ث': 'e',
    'ب': 'f',
    'ل': 'g',
    'ا': 'h', 'أ': 'h', 'إ': 'h', 'آ': 'h',
    'ه': 'i',
    'ت': 'j',
    'ن': 'k',
    '،': 'k', // Shift + ن on Arabic keyboard
    'م': 'l',
    'ة': 'm',
    'ى': 'n',
    'خ': 'o',
    'ح': 'p',
    'ض': 'q',
    'ق': 'r',
    'س': 's',
    'ف': 't',
    'ع': 'u',
    'ر': 'v',
    'ص': 'w',
    'ء': 'x',
    'غ': 'y',
    'ئ': 'z',
    '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5',
    '٦': '6', '٧': '7', '٨': '8', '٩': '9', '٠': '0'
  };

  const rawKey = (e.key || '').toLowerCase();
  if (ARABIC_TO_LATIN[rawKey]) {
    return ARABIC_TO_LATIN[rawKey];
  }

  return rawKey;
}

/**
 * Checks if a keyboard event matches a configured shortcut item
 */
export function matchesShortcutEvent(item, e) {
  if (!item) return false;

  const eventChar = (normalizeKeyFromEvent(e) || '').toLowerCase();
  const targetKey = (item.key || '').toLowerCase();

  const isCtrl = Boolean(e.ctrlKey || e.metaKey);
  const isAlt = Boolean(e.altKey);
  const isShift = Boolean(e.shiftKey);

  const mods = item.modifiers || [];
  const reqCtrl = mods.includes('Ctrl');
  const reqAlt = mods.includes('Alt');
  const reqShift = mods.includes('Shift');

  const primaryMatch =
    eventChar === targetKey &&
    isCtrl === reqCtrl &&
    isAlt === reqAlt &&
    isShift === reqShift;

  if (primaryMatch) return true;

  // Check fallback definition
  if (item.fallbackKey) {
    const fallbackTarget = (item.fallbackKey || '').toLowerCase();
    const fbMods = item.fallbackModifiers || [];
    const fbCtrl = fbMods.includes('Ctrl');
    const fbAlt = fbMods.includes('Alt');
    const fbShift = fbMods.includes('Shift');
    if (
      eventChar === fallbackTarget &&
      isCtrl === fbCtrl &&
      isAlt === fbAlt &&
      isShift === fbShift
    ) {
      return true;
    }
  }

  return false;
}
