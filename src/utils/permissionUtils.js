/**
 * permissionUtils.js
 * منظومة التحقق المعيارية وتطابق صلاحيات الإدارة العليا والتبديل الموحد
 */

// قائمة وحدات وتراخيص الإدارة العليا المتوافقة بنسبة 100% مع شاشات وتبويبات النظام
export const TOP_MGMT_MODULES = [
  { id: 'dashboard', label: 'لوحة القيادة والمؤشرات (Dashboard)', icon: '📊', group: 'عام' },
  { id: 'employees', label: 'شؤون الموظفين وملفات الكوادر (Employees)', icon: '👥', group: 'الموظفين' },
  { id: 'attendance', label: 'سجل الحضور والانصراف والبصمات (Attendance)', icon: '⏱️', group: 'الموظفين' },
  { id: 'biometrics', label: 'البصمة الحيوية وبصمة الوجه بالذكاء الاصطناعي (Biometrics AI)', icon: '📸', group: 'الموظفين' },
  { id: 'roster', label: 'شفتات العمل والجدول الشهري (Roster)', icon: '📅', group: 'الموظفين' },
  { id: 'recruitment', label: 'بوابة التوظيف وفرز السير الذاتية (Recruitment)', icon: '🎯', group: 'الموظفين' },
  { id: 'branches', label: 'إدارة ومتابعة الفروع والصيدليات (Branches)', icon: '🏢', group: 'الفروع' },
  { id: 'requests', label: 'مركز إدارة واعتماد الطلبات (Requests)', icon: '📋', group: 'الطلبات' },
  { id: 'payroll', label: 'مسير الرواتب المعتمد (Payroll)', icon: '💰', group: 'المالية' },
  { id: 'adjustments-module', legacyId: 'adjustments', label: 'المكافآت والخصومات المالية (Adjustments)', icon: '📝', group: 'المالية' },
  { id: 'loans-meds', label: 'السلف ومشتريات الأدوية (Loans & Meds)', icon: '💳', group: 'المالية' },
  { id: 'income-expenses', legacyId: 'income_expenses', label: 'المصروفات والإيرادات اليومية (Income/Expenses)', icon: '📈', group: 'المالية' },
  { id: 'financial-reports', legacyId: 'financial_reports', label: 'التقارير المالية والأرباح الشاملة (Financials)', icon: '📊', group: 'المالية' },
  { id: 'admin-directives', legacyId: 'directives', label: 'تعليمات وتوجيهات الإدارة العليا (Directives)', icon: '📢', group: 'الاتصالات' },
  { id: 'whatsapp-center', legacyId: 'whatsapp_center', label: 'مركز مراسلات الواتساب التلقائي (WhatsApp)', icon: '💬', group: 'الاتصالات' },
  { id: 'bylaws', label: 'لائحة العمل والجزاءات التأديبية (Bylaws)', icon: '📜', group: 'اللائحة' },
  { id: 'evaluations', label: 'تقييمات الأداء والشكاوى (Evaluations)', icon: '⭐', group: 'التقييم' },
  { id: 'pharmacy-archive', legacyId: 'archive', label: 'أرشيف الفواتير ومطابقة الموردين (Archive)', icon: '🗄️', group: 'الأرشيف' },
  { id: 'settings', label: 'إعدادات النظام والمنظومة (Settings)', icon: '⚙️', group: 'النظام' }
];

/**
 * توحيد صيغة مفاتيح الشاشات (تحويل _ إلى - وحذف الفراغات)
 */
export function normalizeModuleId(id) {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

/**
 * فحص هل الشاشة الحالية مصرح بها للمستخدم وفق قائمة الوحدات المسموحة له
 * @param {string} tab التبويب الرئيسي المطلوب
 * @param {string} subTab التبويب الفرعي المطلوب إن وجد
 * @param {Array<string>} allowedList قائمة الصلاحيات الممنوحة
 */
export function isModuleAllowed(tab, subTab = '', allowedList = []) {
  if (!Array.isArray(allowedList) || allowedList.length === 0) return true; // غير مقيد (أدمن كامل)

  const normTab = normalizeModuleId(tab);
  const normSubTab = normalizeModuleId(subTab);
  const normAllowed = allowedList.map(normalizeModuleId);

  // 1. مطابقة مباشرة لاسم التبويب
  if (normAllowed.includes(normTab)) return true;

  // 2. مطابقة المفتاح المركب (مثل: employees:roster أو employees-roster)
  if (normSubTab) {
    if (
      normAllowed.includes(`${normTab}:${normSubTab}`) ||
      normAllowed.includes(`${normTab}-${normSubTab}`) ||
      normAllowed.includes(`${normTab}_${normSubTab}`)
    ) {
      return true;
    }
  }

  // 3. مطابقة الشاشات الفرعية لـ شؤون الموظفين (Employees)
  if (normTab === 'employees' || normTab === 'attendance' || normTab === 'roster' || normTab === 'recruitment' || normTab === 'biometrics') {
    // إذا كان التبويب العام 'employees' مسموحاً، يُسمح بالدخول
    if (normAllowed.includes('employees')) return true;

    // إذا مُنح 'roster' وتم طلب تبويب الروستر
    if (normAllowed.includes('roster') && (normSubTab === 'roster' || normTab === 'roster')) return true;

    // إذا مُنح 'attendance' وتم طلب تبويب الحضور أو البصمات
    if (normAllowed.includes('attendance') && (normSubTab === 'attendance' || normTab === 'attendance' || normTab === 'emp-punches')) return true;

    // إذا مُنح 'biometrics' وتم طلب البصمة الحيوية
    if (normAllowed.includes('biometrics') && (normSubTab === 'biometrics' || normTab === 'biometrics')) return true;

    // إذا مُنح 'recruitment' وتم طلب التعيينات
    if (normAllowed.includes('recruitment') && (normSubTab === 'recruitment' || normTab === 'recruitment' || normTab === 'careers')) return true;

    // إذا طلب شاشة فرعية أخرى وكانت الشاشة مصرحة كـ cards أو jobs أو contracts
    if (normSubTab && normAllowed.includes(normSubTab)) return true;
  }

  // 4. مطابقة الفروع (Branches)
  if (normTab === 'branches' || normTab.startsWith('branch-')) {
    if (normAllowed.includes('branches')) return true;
    if (normAllowed.includes('roster') && (normSubTab === 'roster' || normTab.includes('roster'))) return true;
  }

  // 5. مطابقة التقارير المالية (Financial Reports)
  if (normTab === 'financial-reports' || normTab === 'financials') {
    if (
      normAllowed.includes('financial-reports') ||
      normAllowed.includes('financial-reports') ||
      normAllowed.includes('financials') ||
      normAllowed.includes('financial_reports')
    ) {
      return true;
    }
  }

  // 6. مركز الواتساب (WhatsApp Center)
  if (normTab === 'whatsapp-center') {
    if (normAllowed.includes('whatsapp-center') || normAllowed.includes('whatsapp_center')) return true;
  }

  // 7. توجيهات الإدارة (Directives)
  if (normTab === 'admin-directives' || normTab === 'branch-directives') {
    if (normAllowed.includes('admin-directives') || normAllowed.includes('directives')) return true;
  }

  // 8. الطلبات والموافقات (Requests Group)
  if (
    normTab === 'requests' ||
    normTab === 'leaves' ||
    normTab === 'leaves-tracking' ||
    normTab === 'permissions-management' ||
    normTab === 'resignation' ||
    normTab === 'branch-sent-requests'
  ) {
    if (normAllowed.includes('requests')) return true;
    if (normAllowed.includes(normTab)) return true;
  }

  // 9. الرواتب والمالية (Payroll Group)
  if (
    normTab === 'payroll' ||
    normTab === 'adjustments-module' ||
    normTab === 'adjustments' ||
    normTab === 'loans-meds' ||
    normTab === 'loans' ||
    normTab === 'income-expenses' ||
    normTab === 'finances'
  ) {
    if (normAllowed.includes(normTab)) return true;
    if (normTab === 'adjustments-module' && normAllowed.includes('adjustments')) return true;
    if (normTab === 'income-expenses' && (normAllowed.includes('income-expenses') || normAllowed.includes('income_expenses') || normAllowed.includes('finances'))) return true;
    if (normTab === 'loans-meds' && (normAllowed.includes('loans-meds') || normAllowed.includes('loans'))) return true;
  }

  // 10. الأرشيف (Archive)
  if (normTab === 'pharmacy-archive' || normTab === 'archive') {
    if (normAllowed.includes('pharmacy-archive') || normAllowed.includes('archive')) return true;
  }

  // 11. اللائحة والجزاءات
  if (normTab === 'bylaws') {
    if (normAllowed.includes('bylaws')) return true;
  }

  // 12. التقييمات
  if (normTab === 'evaluations') {
    if (normAllowed.includes('evaluations') || normAllowed.includes('evals')) return true;
  }

  // 13. الإعدادات
  if (normTab === 'settings') {
    if (normAllowed.includes('settings')) return true;
  }

  return false;
}

/**
 * تحديد التبويب والتبويب الفرعي الصحيح لأول شاشة مسموحة لتجنب التوجيه العشوائي أو شاشات غير موجودة
 */
export function resolveFirstAllowedRoute(allowedList = []) {
  if (!Array.isArray(allowedList) || allowedList.length === 0) {
    return { tab: 'dashboard', subTab: 'cards' };
  }

  const normFirst = normalizeModuleId(allowedList[0]);

  // خرائط التوجيه الدقيق
  switch (normFirst) {
    case 'roster':
      return { tab: 'employees', subTab: 'roster' };
    case 'attendance':
      return { tab: 'employees', subTab: 'attendance' };
    case 'biometrics':
      return { tab: 'employees', subTab: 'biometrics' };
    case 'recruitment':
      return { tab: 'employees', subTab: 'recruitment' };
    case 'employees':
      return { tab: 'employees', subTab: 'cards' };
    case 'financial-reports':
    case 'financial_reports':
    case 'financials':
      return { tab: 'financial-reports', subTab: '' };
    case 'whatsapp-center':
    case 'whatsapp_center':
      return { tab: 'whatsapp-center', subTab: '' };
    case 'admin-directives':
    case 'directives':
      return { tab: 'admin-directives', subTab: '' };
    case 'adjustments-module':
    case 'adjustments':
      return { tab: 'adjustments-module', subTab: '' };
    case 'loans-meds':
    case 'loans':
      return { tab: 'loans-meds', subTab: '' };
    case 'income-expenses':
    case 'income_expenses':
      return { tab: 'income-expenses', subTab: '' };
    case 'bylaws':
      return { tab: 'bylaws', subTab: 'disciplinary_penalties' };
    case 'evaluations':
      return { tab: 'evaluations', subTab: 'evaluations' };
    case 'branches':
      return { tab: 'branches', subTab: 'list' };
    case 'pharmacy-archive':
    case 'archive':
      return { tab: 'pharmacy-archive', subTab: '' };
    case 'settings':
      return { tab: 'settings', subTab: 'general' };
    case 'requests':
      return { tab: 'requests', subTab: '' };
    default:
      return { tab: normFirst || 'dashboard', subTab: '' };
  }
}

/**
 * استخراج كائن الصلاحيات الموحد للموظف مع فحص الإعدادات المؤسسية كـ Fallback
 */
export function resolveEmployeeUnifiedAccess(user, orgSettings = {}) {
  if (!user) return null;
  if (user.unifiedAccess && typeof user.unifiedAccess === 'object') {
    return user.unifiedAccess;
  }
  const empUnified = orgSettings?.employeeUnifiedAccess || {};
  const found = empUnified[String(user.id)] || empUnified[String(user.code)] || null;
  return found;
}

/**
 * فحص استحقاق المستخدم لزر تبديل مسارات العمل / صفحتي
 */
export function isUserEligibleForSwitcher(user, orgSettings = {}, currentRole = '') {
  if (currentRole === 'owner' || user?.isOwner) return true;

  const uAccess = resolveEmployeeUnifiedAccess(user, orgSettings);
  if (!uAccess) return false;

  if (uAccess.isEnabled === false && !uAccess.permissions) return false;

  const perms = uAccess.permissions || {};
  let enabledCount = 0;

  if (perms.hrPersonalPortal?.enabled !== false) enabledCount++;
  if (perms.branchManager?.enabled) enabledCount++;
  if (perms.topManagement?.enabled) enabledCount++;
  if (perms.outstockHandling?.enabled) enabledCount++;
  if (perms.accountsSystem?.enabled) enabledCount++;

  return enabledCount > 1 || uAccess.isEnabled === true;
}
