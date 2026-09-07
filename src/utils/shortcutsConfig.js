/**
 * إعدادات وتعاريف اختصارات لوحة المفاتيح لنظام Pharmacy ERP
 */

export const STORAGE_SHORTCUTS_KEY = 'pharmacy_custom_shortcuts';

export const DEFAULT_SHORTCUTS = [
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
    desc: 'فتح نافذة دليل وشرح اختصارات لوحة المفاتيح',
    category: 'general',
    key: 'F1',
    modifiers: [],
    fallbackKey: 'h',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'quickSearch',
    name: 'البحث السريع العام',
    desc: 'التركيز على حقل البحث العام بالمؤسسة والحسابات',
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
    id: 'newEntry',
    name: 'إضافة جديدة سريعة',
    desc: 'فتح نموذج إضافة موظف أو قيد يومية أو وردية جديدة بحسب الشاشة',
    category: 'actions',
    key: 'n',
    modifiers: ['Alt'],
    fallbackKey: 'n',
    fallbackModifiers: ['Ctrl']
  },
  {
    id: 'saveForm',
    name: 'حفظ النموذج المفتوح',
    desc: 'حفظ البيانات في النافذة المنبثقة النشطة ومنع نافذة حفظ المتصفح',
    category: 'actions',
    key: 's',
    modifiers: ['Ctrl'],
    fallbackKey: 's',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'printView',
    name: 'طباعة التقرير أو السند',
    desc: 'طباعة التقرير الحالي عبر محرك النظام المخصص ومنع طباعة المتصفح الخام',
    category: 'actions',
    key: 'p',
    modifiers: ['Ctrl'],
    fallbackKey: 'p',
    fallbackModifiers: ['Alt']
  },
  {
    id: 'navDashboard',
    name: 'الانتقال إلى لوحة التحكم (1)',
    desc: 'الانتقال المباشر إلى لوحة التحكم والإحصائيات العامة',
    category: 'nav',
    key: '1',
    modifiers: ['Alt']
  },
  {
    id: 'navEmployees',
    name: 'الانتقال إلى شؤون الموظفين (2)',
    desc: 'الانتقال إلى ملفات وبيانات الكادر الوظيفي',
    category: 'nav',
    key: '2',
    modifiers: ['Alt']
  },
  {
    id: 'navAttendance',
    name: 'الانتقال إلى الحضور والورديات (3)',
    desc: 'الانتقال إلى شاشة الحضور والانصراف والورديات',
    category: 'nav',
    key: '3',
    modifiers: ['Alt']
  },
  {
    id: 'navPayroll',
    name: 'الانتقال إلى مسير الرواتب (4)',
    desc: 'الانتقال إلى مسير الرواتب والمستحقات والبدلات',
    category: 'nav',
    key: '4',
    modifiers: ['Alt']
  },
  {
    id: 'navAccounts',
    name: 'الانتقال إلى الحسابات العامة (5)',
    desc: 'الانتقال إلى منظومة الحسابات وشجرة الحسابات',
    category: 'nav',
    key: '5',
    modifiers: ['Alt']
  },
  {
    id: 'navBranches',
    name: 'الانتقال إلى الفروع والمبيعات (6)',
    desc: 'الانتقال إلى إدارة الفروع والصيدليات والمبيعات',
    category: 'nav',
    key: '6',
    modifiers: ['Alt']
  },
  {
    id: 'navLeaves',
    name: 'الانتقال إلى الإجازات والأذونات (7)',
    desc: 'الانتقال إلى مركز طلبات الإجازات والأذونات',
    category: 'nav',
    key: '7',
    modifiers: ['Alt']
  },
  {
    id: 'navBylaws',
    name: 'الانتقال إلى لائحة العمل (8)',
    desc: 'الانتقال إلى لائحة الجزاءات والسياسات المعتمدة',
    category: 'nav',
    key: '8',
    modifiers: ['Alt']
  },
  {
    id: 'navSettings',
    name: 'الانتقال إلى إعدادات النظام (9)',
    desc: 'الانتقال إلى شاشة الإعدادات العامة والصلاحيات',
    category: 'nav',
    key: '9',
    modifiers: ['Alt']
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
  const parts = [];
  if (item.modifiers && item.modifiers.length > 0) {
    item.modifiers.forEach((m) => parts.push(m));
  }
  let keyName = item.key;
  if (keyName === 'Escape') keyName = 'Esc';
  else if (keyName) keyName = keyName.toUpperCase();
  parts.push(keyName);
  return parts.join(' + ');
}
