import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveRealTime } from '../../hooks/useLiveRealTime';
import { getCycleDateRange } from '../../utils/periodEngine';
import { getNotificationTargetTab } from '../../utils/notificationEngine';

export default function DesktopLayout({
  currentRole,
  currentBranch,
  userProfile,
  orgSettings = {},
  activeTab,
  setActiveTab,
  activeSubTab = 'cards',
  setActiveSubTab,
  onLogout,
  pendingCount = 0,
  resignationCount = 0,
  bylawsCount = 0,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onClearReadNotifications,
  themeMode,
  toggleTheme,
  onExportExcel,
  adminFilterMode = 'month',
  setAdminFilterMode,
  monthPicker,
  setMonthPicker,
  adminCustomFrom,
  setAdminCustomFrom,
  adminCustomTo,
  setAdminCustomTo,
  children
}) {
  const liveTime = useLiveRealTime(1000);
  const currentCycleRange = useMemo(() => {
    return getCycleDateRange(monthPicker, orgSettings);
  }, [monthPicker, orgSettings]);

  const [openDropdown, setOpenDropdown] = useState(null);
  const [hoveredFlyoutId, setHoveredFlyoutId] = useState(null);
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);
  const menuContainerRef = useRef(null);
  const notifDropdownRef = useRef(null);

  const [isMobileScreen, setIsMobileScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768;
    }
    return false;
  });
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [drawerExpandedGroup, setDrawerExpandedGroup] = useState(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const unreadNotificationsCount = (notifications || []).filter(n => !n.read).length + (bylawsCount || 0);

  // Define Desktop Menu Structure for Super Admin
  const adminMenuItems = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      icon: '📊',
      isSingle: true,
      targetTab: 'dashboard'
    },
    {
      id: 'accounts',
      label: 'الحسابات',
      icon: '🏛️',
      isSingle: true,
      targetTab: 'accounts',
      navigateToAccounts: true
    },
    {
      id: 'employees',
      label: 'شؤون الموظفين',
      icon: '👥',
      children: [
        {
          id: 'employees:cards',
          targetTab: 'employees',
          targetSubTab: 'cards',
          label: 'دليل وبطاقات الموظفين',
          icon: '👤',
          desc: 'إدارة ملفات الموظفين، العقود، والأرصدة'
        },
        {
          id: 'employees:attendance',
          targetTab: 'employees',
          targetSubTab: 'attendance',
          label: 'سجل الحضور والانصراف والبصمات',
          icon: '⏱️',
          desc: 'سجل الحضور اليومي، البصمات، والتسجيل اليدوي'
        },
        {
          id: 'employees:biometrics',
          targetTab: 'employees',
          targetSubTab: 'biometrics',
          label: 'البصمة الإلكترونية الحيوية (AI)',
          icon: '📸',
          desc: 'إدارة وتدريب بصمة الوجه واليد بالذكاء الاصطناعي'
        },
        {
          id: 'employees:roster',
          targetTab: 'employees',
          targetSubTab: 'roster',
          label: 'الجداول والورديات الشهرية',
          icon: '📅',
          desc: 'توزيع شفتات العمل ومناوبات الكادر الطبي'
        },
        {
          id: 'employees:jobs',
          targetTab: 'employees',
          targetSubTab: 'jobs',
          label: 'الوظائف والأقسام',
          icon: '💼',
          desc: 'دليل وهيكلة المسميات الوظيفية وتصنيف الكوادر والبدلات'
        },
        {
          id: 'employees:contracts',
          targetTab: 'employees',
          targetSubTab: 'contracts',
          label: 'عقد العمل وبنود اللائحة',
          icon: '📝',
          desc: 'صياغة وتعديل وطباعة عقود العمل الرسمية وفق قانون العمل'
        },
        {
          id: 'employees:recruitment',
          targetTab: 'employees',
          targetSubTab: 'recruitment',
          label: 'التعيينات والتوظيف',
          icon: '🎯',
          desc: 'إدارة طلبات التعيين، الشواغر، المقابلات، وقوائم الانتظار'
        }
      ]
    },
    {
      id: 'branches-group',
      label: 'الفروع',
      icon: '🏢',
      children: [
        {
          id: 'branches:list',
          targetTab: 'branches',
          targetSubTab: 'list',
          label: 'إدارة وبيانات الفروع',
          icon: '🏢',
          desc: 'بيانات الفروع، المديرين المكلفين، وأرقام التواصل'
        },
        {
          id: 'branches:roster',
          targetTab: 'branches',
          targetSubTab: 'roster',
          label: 'الجدول الشهري للفرع',
          icon: '📅',
          desc: 'مواعيد وورديات الموظفين، الحضور، وتغطية الفروع'
        },
        {
          id: 'branches:sales',
          targetTab: 'branches',
          targetSubTab: 'sales',
          label: 'مبيعات الفروع والتارجت',
          icon: '📈',
          desc: 'تسجيل ومتابعة مبيعات الصيدليات اليومية، التارجت، والفرع المتصدر'
        }
      ]
    },
    {
      id: 'requests-group',
      label: 'الطلبات والموافقات',
      icon: '📋',
      badge: pendingCount + resignationCount,
      children: [
        {
          id: 'requests',
          targetTab: 'requests',
          label: 'مركز إدارة واعتماد الطلبات',
          icon: '📋',
          badge: pendingCount,
          desc: 'مراجعة واعتماد طلبات الإجازات والأذونات والسلف'
        },
        {
          id: 'leaves-tracking',
          targetTab: 'leaves-tracking',
          label: 'سجل الإجازات السنوية',
          icon: '🏖️',
          desc: 'تتبع رصيد الإجازات والأيام المستهلكة'
        },
        {
          id: 'permissions-management',
          targetTab: 'permissions-management',
          label: 'أذونات وساعات الاستئذان',
          icon: '⏰',
          desc: 'ساعات الاستئذان الرسمية المعتمدة'
        },
        {
          id: 'resignation',
          targetTab: 'resignation',
          label: 'طلبات استقالة الموظفين',
          icon: '🚪',
          badge: resignationCount,
          desc: 'طلبات الاستقالة وإخلاء الطرف والتسوية'
        }
      ]
    },
    {
      id: 'payroll-group',
      label: 'الرواتب والمالية',
      icon: '💰',
      children: [
        {
          id: 'payroll',
          targetTab: 'payroll',
          label: 'مسير الرواتب المعتمد',
          icon: '💰',
          desc: 'حساب صافي الأجور وطباعة قسائم الرواتب'
        },
        {
          id: 'adjustments-module',
          targetTab: 'adjustments-module',
          label: 'المكافآت والخصومات',
          icon: '📝',
          desc: 'تسجيل الحوافز والجزاءات والخصومات المالية'
        },
        {
          id: 'loans-meds',
          targetTab: 'loans-meds',
          label: 'السلف ومشتريات الأدوية',
          icon: '💳',
          desc: 'متابعة السلف النقدية ومسحوبات الأدوية والتقسيط'
        },
        {
          id: 'income-expenses',
          targetTab: 'income-expenses',
          label: 'المصروفات والإيرادات',
          icon: '📈',
          desc: 'سجل الإيرادات والمصروفات النقدية اليومية'
        },
        {
          id: 'financial-reports',
          targetTab: 'financial-reports',
          label: 'التقارير المالية والأرباح',
          icon: '📊',
          desc: 'التقرير المالي الشامل، المبيعات، الرواتب، المصروفات، وصافي الأرباح'
        },
        {
          id: 'accounts',
          targetTab: 'accounts',
          label: 'الحسابات وشجرة الحسابات (ERP)',
          icon: '🏛️',
          desc: 'شجرة الحسابات، قيود اليومية، الخزائن ونقاط البيع، والقوائم الختامية',
          navigateToAccounts: true
        }
      ]
    },
    {
      id: 'system-group',
      label: 'الاتصالات واللائحة',
      icon: '💬',
      children: [
        {
          id: 'admin-directives',
          targetTab: 'admin-directives',
          label: 'تعليمات وتوجيهات الإدارة',
          icon: '📢',
          desc: 'بث القرارات الإدارية للموظفين وإلزام الموافقة بالكشك'
        },
        {
          id: 'whatsapp-center',
          targetTab: 'whatsapp-center',
          label: 'مركز مراسلات الواتساب',
          icon: '💬',
          desc: 'إرسال الرسائل التلقائية وكشوف الرواتب'
        },
        {
          id: 'bylaws',
          targetTab: 'bylaws',
          targetSubTab: 'disciplinary_penalties',
          label: 'لائحة العمل والجزاءات',
          icon: '📜',
          desc: 'تطبيق بنود لائحة العمل واحتساب الغرامات والخصومات',
          subChildren: [
            {
              id: 'bylaws:disciplinary_penalties',
              targetTab: 'bylaws',
              targetSubTab: 'disciplinary_penalties',
              label: 'لائحة الجزاءات التأديبية وعداد التكرار',
              icon: '⚖️',
              desc: 'نظام عداد تكرار المخالفات واحتساب الغرامات'
            },
            {
              id: 'bylaws:text',
              targetTab: 'bylaws',
              targetSubTab: 'text',
              label: 'نصوص اللائحة الرسمية',
              icon: '📖',
              desc: 'بنود وسياسات لائحة العمل المعتمدة'
            },
            {
              id: 'bylaws:records',
              targetTab: 'bylaws',
              targetSubTab: 'records',
              label: 'سجل الجزاءات والخصومات',
              icon: '📋',
              desc: 'سجل الخصومات والمخالفات المطبقة والمصروفة'
            },
            {
              id: 'bylaws:late_penalties',
              targetTab: 'bylaws',
              targetSubTab: 'late_penalties',
              label: 'جزاءات التأخير',
              icon: '⏱️',
              desc: 'شرائح التأخير واحتساب دقائق الخصم'
            }
          ]
        },
        {
          id: 'evaluations',
          targetTab: 'evaluations',
          targetSubTab: 'evaluations',
          label: 'تقييمات الأداء والشكاوى',
          icon: '⭐',
          desc: 'تقييم أداء الكوادر وملاحظات المديرين',
          subChildren: [
            {
              id: 'evaluations:evaluations',
              targetTab: 'evaluations',
              targetSubTab: 'evaluations',
              label: 'تقييم الأداء والدرجات',
              icon: '⭐',
              desc: 'إنشاء ومتابعة تقييمات الأداء الشهرية'
            },
            {
              id: 'evaluations:notes',
              targetTab: 'evaluations',
              targetSubTab: 'notes',
              label: 'ملاحظات الفروع والردود',
              icon: '💬',
              desc: 'ملاحظات مديري الفروع وردود الإدارة العليا'
            },
            {
              id: 'evaluations:complaints',
              targetTab: 'evaluations',
              targetSubTab: 'complaints',
              label: 'شكاوى الموظفين والردود',
              icon: '📋',
              desc: 'صندوق شكاوى وتظلمات الموظفين ومتابعتها'
            }
          ]
        },
        {
          id: 'pharmacy-archive',
          targetTab: 'pharmacy-archive',
          label: 'أرشيف الفواتير والمستندات',
          icon: '🗄️',
          desc: 'فتح المنظومة السحابية للأرشفة والمستندات',
          openInNewTab: true
        }
      ]
    },
    {
      id: 'settings-group',
      label: 'الإعدادات والتنبيهات',
      icon: '⚙️',
      badge: unreadNotificationsCount,
      children: [
        {
          id: 'notifications',
          targetTab: 'notifications',
          label: 'مركز الإشعارات والتنبيهات',
          icon: '🔔',
          badge: unreadNotificationsCount,
          desc: 'سجل التنبيهات والأحداث اللحظية'
        },
        {
          id: 'settings',
          targetTab: 'settings',
          targetSubTab: 'general',
          label: 'إعدادات المؤسسة والنظام',
          icon: '⚙️',
          desc: 'تخصيص القواعد، الصلاحيات، وربط النظام',
          subChildren: [
            {
              id: 'settings:general',
              targetTab: 'settings',
              targetSubTab: 'general',
              label: 'بيانات الصيدلية والمدير العام',
              icon: '🏢',
              desc: 'الاسم، الشعار، المدير العام، وحساب الأدمن'
            },
            {
              id: 'settings:dates',
              targetTab: 'settings',
              targetSubTab: 'dates',
              label: 'التواريخ والفترات ودورات الرواتب',
              icon: '📅',
              desc: 'ضبط بداية ونهاية دورة الشهر وتقفيل الرواتب'
            },
            {
              id: 'settings:permissions',
              targetTab: 'settings',
              targetSubTab: 'permissions',
              label: 'إدارة الصلاحيات',
              icon: '🔒',
              desc: 'أدوار المستخدمين وصلاحيات الوصول والعمليات'
            },
            {
              id: 'settings:rules',
              targetTab: 'settings',
              targetSubTab: 'rules',
              label: 'قواعد الموافقة المزدوجة',
              icon: '🔐',
              desc: 'شروط ومسارات الاعتماد والمديرين للطلبات'
            },
            {
              id: 'settings:gmail',
              targetTab: 'settings',
              targetSubTab: 'gmail',
              label: 'بريد Gmail والتنبيهات',
              icon: '✉️',
              desc: 'إعدادات الربط بالبريد لإرسال الإشعارات'
            },
            {
              id: 'settings:drive',
              targetTab: 'settings',
              targetSubTab: 'drive',
              label: 'أرشفة Google Drive للموظفين',
              icon: '📁',
              desc: 'مزامنة ملفات الموظفين ومستنداتهم وصور البصمة سحابياً'
            },
            {
              id: 'settings:ip',
              targetTab: 'settings',
              targetSubTab: 'ip',
              label: 'راوترات الفروع وبصمة الأجهزة',
              icon: '🌐',
              desc: 'تحديد نطاقات شبكات الفروع المعتمدة'
            },
            {
              id: 'settings:backup',
              targetTab: 'settings',
              targetSubTab: 'backup',
              label: 'النسخ الاحتياطي وقاعدة البيانات',
              icon: '💾',
              desc: 'تصدير واسترجاع قواعد البيانات وتصفير النظام'
            },
            {
              id: 'settings:owner',
              targetTab: 'settings',
              targetSubTab: 'owner',
              label: 'صلاحيات وتحكم المالك',
              icon: '👑',
              desc: 'أقفال تعديلات الإدارة العليا وبيانات المالك'
            }
          ]
        },
        {
          id: 'settings:owner-shortcut',
          targetTab: 'settings',
          targetSubTab: 'owner',
          label: '👑 صلاحيات وتحكم المالك',
          icon: '👑',
          desc: 'إدارة أقفال تعديلات الإدارة العليا وبيانات المالك'
        }
      ]
    }
  ];

  // Define Desktop Menu Structure for Branch Manager
  const branchMenuItems = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      icon: '📊',
      isSingle: true,
      targetTab: 'dashboard'
    },
    {
      id: 'branch-ops',
      label: 'متابعة الفرع والحضور',
      icon: '👥',
      children: [
        {
          id: 'emp-punches',
          targetTab: 'emp-punches',
          label: 'متابعة حضور وبصمات الفرع',
          icon: '👥',
          desc: 'متابعة الحضور الحي والبصمات لموظفي الفرع'
        },
        {
          id: 'branch-monthly-operational-roster',
          targetTab: 'branch-monthly-operational-roster',
          label: 'الجدول التشغيلي الشهري للفرع',
          icon: '📅',
          desc: 'خريطة الورديات والراحات الأسبوعية للفرع وطباعة A4'
        },
        {
          id: 'branch-roster',
          targetTab: 'branch-roster',
          label: 'الجدول الشهري للموظفين',
          icon: '📋',
          desc: 'جدول ورديات وشفتات الفرع المعتمدة'
        },
        {
          id: 'branch-directives',
          targetTab: 'branch-directives',
          label: 'تعليمات مدير الفرع',
          icon: '📢',
          desc: 'إصدار تعليمات وتوجيهات لموظفي الفرع وإلزام قراءتها في البصمة'
        }
      ]
    },
    {
      id: 'branch-reqs',
      label: 'الطلبات والموافقات',
      icon: '📋',
      badge: pendingCount + resignationCount,
      children: [
        {
          id: 'requests',
          targetTab: 'requests',
          label: 'مركز موافقات الطلبات',
          icon: '📋',
          badge: pendingCount,
          desc: 'موافقة وتوقيع طلبات موظفي الفرع'
        },
        {
          id: 'leaves',
          targetTab: 'leaves',
          label: 'طلبات إجازات الموظفين',
          icon: '🏖️',
          desc: 'متابعة وطلب إجازات موظفي الفرع والأرصدة'
        },
        {
          id: 'permissions-management',
          targetTab: 'permissions-management',
          label: 'أذونات الموظفين',
          icon: '⏰',
          desc: 'تسجيل ومتابعة أذونات وساعات الاستئذان'
        },
        {
          id: 'resignation',
          targetTab: 'resignation',
          label: 'طلبات استقالة الموظفين',
          icon: '📝',
          badge: resignationCount,
          desc: 'مراجعة طلبات استقالة موظفي الفرع'
        },
        {
          id: 'branch-sent-requests',
          targetTab: 'branch-sent-requests',
          label: 'سجل الطلبات المرسلة للإدارة',
          icon: '📤',
          desc: 'متابعة ومعاينة كافة الطلبات المرسلة للإدارة (بصمات، أذونات، إجازات، جزاءات، تقييمات)'
        }
      ]
    },
    {
      id: 'branch-fin',
      label: 'التقييمات والمالية',
      icon: '⭐',
      children: [
        {
          id: 'evaluations',
          targetTab: 'evaluations',
          targetSubTab: 'evaluations',
          label: 'التقييمات والشكاوى',
          icon: '⭐',
          desc: 'تقييم أداء موظفي الفرع وتقديم الملاحظات',
          subChildren: [
            {
              id: 'branch-evaluations:evaluations',
              targetTab: 'evaluations',
              targetSubTab: 'evaluations',
              label: 'تقييم الأداء والدرجات',
              icon: '⭐',
              desc: 'استعراض تقييمات أداء موظفي الفرع'
            },
            {
              id: 'branch-evaluations:notes',
              targetTab: 'evaluations',
              targetSubTab: 'notes',
              label: 'ملاحظات الفرع والردود',
              icon: '💬',
              desc: 'إرسال ملاحظات للإدارة ومتابعة الردود'
            },
            {
              id: 'branch-evaluations:complaints',
              targetTab: 'evaluations',
              targetSubTab: 'complaints',
              label: 'شكاوى الموظفين والردود',
              icon: '📋',
              desc: 'متابعة شكاوى موظفي الفرع'
            }
          ]
        },
        {
          id: 'income-expenses',
          targetTab: 'income-expenses',
          label: 'المصروفات والإيرادات',
          icon: '📈',
          desc: 'تسجيل المصروفات النثرية والإيرادات بالفرع'
        }
      ]
    },
    {
      id: 'bylaws',
      label: 'لائحة العمل والجزاءات',
      icon: '📜',
      isSingle: true,
      targetTab: 'bylaws'
    }
  ];

  const currentMenuItems = currentRole === 'branch' ? branchMenuItems : adminMenuItems;

  // Helper to check if a main menu is active
  const isMenuGroupActive = (menu) => {
    if (menu.isSingle) {
      return activeTab === menu.targetTab;
    }
    if (menu.children) {
      return menu.children.some(child => {
        if (child.subChildren && child.subChildren.length > 0) {
          return child.subChildren.some(subChild => {
            if (subChild.targetTab === activeTab) {
              if (subChild.targetSubTab) return activeSubTab === subChild.targetSubTab;
              return true;
            }
            return false;
          });
        }
        if (child.targetTab === activeTab) {
          if (child.targetSubTab) {
            if (activeTab === 'branches' && child.targetSubTab === 'list' && (!activeSubTab || activeSubTab === 'branches' || activeSubTab === 'list')) {
              return true;
            }
            return activeSubTab === child.targetSubTab;
          }
          return true;
        }
        return false;
      });
    }
    return false;
  };

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target)) {
        setOpenDropdown(null);
        setHoveredFlyoutId(null);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setIsNotifDropdownOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setHoveredFlyoutId(null);
        setIsNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

const handleMenuClick = (menu) => {
if (menu.isSingle) {
  if (menu.openInNewTab || menu.targetTab === 'pharmacy-archive') {
    window.open(window.location.origin + '/archive', '_blank');
  } else if (menu.targetTab === 'accounts' || menu.navigateToAccounts) {
    window.history.pushState({}, '', '/accounts');
    window.dispatchEvent(new PopStateEvent('popstate'));
    setActiveTab('accounts');
  } else {
    setActiveTab(menu.targetTab);
  }
  setOpenDropdown(null);
  setHoveredFlyoutId(null);
} else {
  setOpenDropdown(prev => (prev === menu.id ? null : menu.id));
  setHoveredFlyoutId(null);
}
};

const handleSubItemClick = (subItem) => {
if (subItem.openInNewTab || subItem.targetTab === 'pharmacy-archive') {
  window.open(window.location.origin + '/archive', '_blank');
  setOpenDropdown(null);
  setHoveredFlyoutId(null);
  return;
}
if (subItem.targetTab === 'accounts' || subItem.navigateToAccounts) {
  window.history.pushState({}, '', '/accounts');
  window.dispatchEvent(new PopStateEvent('popstate'));
  setActiveTab('accounts');
  setOpenDropdown(null);
  setHoveredFlyoutId(null);
  return;
}

setActiveTab(subItem.targetTab);
if (subItem.targetSubTab && setActiveSubTab) {
  setActiveSubTab(subItem.targetSubTab);
}
setOpenDropdown(null);
setHoveredFlyoutId(null);
};

const getActiveBreadcrumb = () => {
for (const menu of currentMenuItems) {
  if (menu.isSingle && menu.targetTab === activeTab) {
    return { group: menu.label, item: null, icon: menu.icon };
  }
  if (menu.children) {
    for (const c of menu.children) {
      if (c.subChildren && c.subChildren.length > 0) {
        const foundSub = c.subChildren.find(sub => {
          if (sub.targetTab === activeTab) {
            if (sub.targetSubTab) return activeSubTab === sub.targetSubTab;
            return true;
          }
          return false;
        });
        if (foundSub) {
          return { group: menu.label, item: `${c.label} › ${foundSub.label}`, icon: foundSub.icon || c.icon };
        }
      }
      if (c.targetTab === activeTab) {
        if (c.targetSubTab && activeSubTab !== c.targetSubTab) {
          if (c.targetTab === 'branches' && c.targetSubTab === 'list' && (!activeSubTab || activeSubTab === 'branches' || activeSubTab === 'list')) {
            return { group: menu.label, item: c.label, icon: c.icon };
          }
          continue;
        }
        return { group: menu.label, item: c.label, icon: c.icon };
      }
    }
  }
}
return { group: 'النظام', item: 'لوحة التحكم', icon: '📊' };
};

const breadcrumb = getActiveBreadcrumb();
const profileName = userProfile?.name || ((currentRole === 'owner' || userProfile?.isOwner) ? '👑 المالك' : (currentRole === 'admin' ? 'الإدارة العليا' : (currentBranch?.name ? `مدير فرع - ${currentBranch.name}` : 'مدير الفرع')));
const profileTitle = userProfile?.jobTitle || ((currentRole === 'owner' || userProfile?.isOwner) ? 'Super Root / Owner' : (currentRole === 'admin' ? 'المدير العام' : 'مدير الفرع'));
const firstLetter = profileName.trim().charAt(0) || 'م';

return (
<div className="desktop-app-layout" style={{
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  background: 'var(--background)',
  color: 'var(--text)',
  fontFamily: "'Cairo', 'Tajawal', sans-serif"
}}>

  {isMobileScreen ? (
    <header className="mobile-topbar" style={{
      height: '50px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="فتح القائمة الرئيسية"
        >
          ☰
        </button>

        {orgSettings?.logoUrl ? (
          <img
            src={orgSettings.logoUrl}
            alt="شعار المؤسسة"
            style={{ width: '28px', height: '28px', borderRadius: '7px', objectFit: 'contain', background: '#fff', padding: '2px', border: '1px solid var(--border)', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 900,
            flexShrink: 0
          }}>
            🏥
          </div>
        )}

        <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {currentRole === 'branch' ? `إدارة ${currentBranch?.name || 'الفرع'}` : (orgSettings?.orgName || 'منظومة الموارد البشرية')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ position: 'relative' }} ref={notifDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNotifDropdownOpen(prev => !prev)}
            style={{
              position: 'relative',
              border: isNotifDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--border)',
              background: isNotifDropdownOpen ? 'var(--primary-light)' : 'var(--surface)',
              padding: '4px 7px',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <span>🔔</span>
            {unreadNotificationsCount > 0 && (
              <span style={{
                background: 'var(--danger, #dc2626)',
                color: '#fff',
                padding: '1px 5px',
                borderRadius: '99px',
                fontSize: '9.5px',
                fontWeight: 800,
                marginRight: '2px'
              }}>
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {isNotifDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              width: '320px',
              maxWidth: '92vw',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 12px 35px rgba(0,0,0,0.18)',
              zIndex: 1100,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '8px 12px',
                background: 'var(--surface-muted)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 800, fontSize: '12.5px' }}>🔔 التنبيهات ({unreadNotificationsCount})</span>
                {onMarkAllNotificationsRead && unreadNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ✓ تحديد الكل
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px' }}>
                {(notifications || []).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                    🎉 لا توجد إشعارات حالياً
                  </div>
                ) : (
                  (notifications || []).slice(0, 15).map(n => {
                    const isUnread = !n.read;
                    const handleItemClick = () => {
                      if (isUnread && onMarkNotificationRead) onMarkNotificationRead(n.id);
                      setIsNotifDropdownOpen(false);
                      const target = getNotificationTargetTab(n, currentRole);
                      if (setActiveTab) setActiveTab(target);
                    };

                    return (
                      <div
                        key={n.id}
                        onClick={handleItemClick}
                        style={{
                          padding: '8px 10px',
                          borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))',
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'flex-start',
                          background: isUnread ? 'rgba(13,148,136,0.05)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{n.icon || '🔔'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h5 style={{ margin: 0, fontSize: '12px', fontWeight: isUnread ? 800 : 600 }}>{n.title || n.typeLabel || 'إشعار'}</h5>
                            <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                              {isUnread && onMarkNotificationRead && (
                                <button type="button" onClick={() => onMarkNotificationRead(n.id)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer' }}>✓</button>
                              )}
                              {onDeleteNotification && (
                                <button type="button" onClick={() => onDeleteNotification(n.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer' }}>🗑️</button>
                              )}
                            </div>
                          </div>
                          <p style={{ margin: '2px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.3 }}>{n.message || n.body || ''}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {onClearReadNotifications && (notifications || []).some(n => n.read) && (
                <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <button type="button" onClick={onClearReadNotifications} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                    🗑️ مسح الإشعارات المقروءة
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: '4px 7px',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '12px',
            color: 'var(--text)'
          }}
        >
          <span>{themeMode === 'dark' ? '☀️' : '🌙'}</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          style={{
            border: '1px solid var(--danger-border, #fca5a5)',
            background: 'var(--danger-light, #fee2e2)',
            color: 'var(--danger, #dc2626)',
            padding: '4px 7px',
            borderRadius: '7px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span>🚪</span>
        </button>
      </div>
    </header>
  ) : (
    <header className="desktop-titlebar" style={{
      height: '50px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 18px',
      userSelect: 'none',
      zIndex: 100,
      boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {orgSettings?.logoUrl ? (
          <img
            src={orgSettings.logoUrl}
            alt="شعار المؤسسة"
            style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain', background: '#fff', padding: '2px', border: '1px solid var(--border)', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0d9488, #0f766e)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            fontWeight: 900,
            boxShadow: '0 2px 6px rgba(13,148,136,0.3)',
            flexShrink: 0
          }}>
            🏥
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>
            {currentRole === 'branch' ? `إدارة ${currentBranch?.name || 'الفرع'}` : (orgSettings?.orgName || 'منظومة الموارد البشرية')}
          </span>

          <span style={{ color: 'var(--border)', fontSize: '16px' }}>/</span>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '2px 8px 2px 4px',
            background: (currentRole === 'owner' || userProfile?.isOwner)
              ? 'rgba(245, 158, 11, 0.1)'
              : 'var(--surface-muted)',
            borderRadius: '20px',
            border: (currentRole === 'owner' || userProfile?.isOwner)
              ? '1px solid rgba(245, 158, 11, 0.3)'
              : '1px solid var(--border)'
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              background: (currentRole === 'owner' || userProfile?.isOwner)
                ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
                : 'var(--primary-light)',
              color: (currentRole === 'owner' || userProfile?.isOwner) ? '#ffffff' : 'var(--primary)',
              border: (currentRole === 'owner' || userProfile?.isOwner)
                ? '1.5px solid #fef3c7'
                : '1.5px solid var(--primary)',
              boxShadow: (currentRole === 'owner' || userProfile?.isOwner)
                ? '0 0 8px rgba(245, 158, 11, 0.4)'
                : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: (currentRole === 'owner' || userProfile?.isOwner) ? '13px' : '11px',
              overflow: 'hidden'
            }}>
              {userProfile?.photoUrl ? (
                <img src={userProfile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                (currentRole === 'owner' || userProfile?.isOwner) ? '👑' : firstLetter
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{
                fontSize: '11.5px',
                fontWeight: 800,
                color: (currentRole === 'owner' || userProfile?.isOwner) ? '#b45309' : 'var(--text)'
              }}>
                {(currentRole === 'owner' || userProfile?.isOwner) ? '👑 المالك' : profileName}
              </span>
              <span style={{
                fontSize: '9.5px',
                color: (currentRole === 'owner' || userProfile?.isOwner) ? '#d97706' : 'var(--muted)',
                fontWeight: (currentRole === 'owner' || userProfile?.isOwner) ? 700 : 500
              }}>
                {(currentRole === 'owner' || userProfile?.isOwner) ? 'Super Root / Owner' : profileTitle}
              </span>
            </div>
          </div>

          <span style={{ color: 'var(--border)', fontSize: '16px' }}>/</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--muted)' }}>
            <span>{breadcrumb.icon}</span>
            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{breadcrumb.group}</span>
            {breadcrumb.item && (
              <>
                <span style={{ fontSize: '11px' }}>›</span>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{breadcrumb.item}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--surface)',
          padding: '3px 10px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          fontSize: '11.5px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
        }} title={liveTime.isServerSynced ? '🌐 التوقيت الفعلي الموثق من الخادم' : '⏱️ التوقيت المباشر'}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b',
            boxShadow: liveTime.isServerSynced ? '0 0 6px #22c55e' : 'none',
            flexShrink: 0
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '11.5px' }}>
              ⏰ {liveTime.formatted12Time}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {liveTime.fullArabicDate}
            </span>
          </div>
        </div>

        {setAdminFilterMode && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--surface-muted)',
            padding: '3px 8px',
            borderRadius: '8px',
            border: '1px solid var(--border)'
          }}>
            <select
              value={adminFilterMode}
              onChange={(e) => setAdminFilterMode(e.target.value)}
              style={{
                padding: '3px 6px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                fontSize: '11.5px',
                fontWeight: 'bold',
                background: 'var(--surface)',
                color: 'var(--text)',
                cursor: 'pointer'
              }}
            >
              <option value="month">📅 دورة الرواتب</option>
              <option value="custom">📆 فترة مخصصة</option>
            </select>

            {adminFilterMode === 'month' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {setMonthPicker && (
                  <input
                    type="month"
                    value={monthPicker}
                    onChange={(e) => setMonthPicker(e.target.value)}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontSize: '11.5px',
                      fontWeight: 'bold',
                      background: 'var(--surface)',
                      color: 'var(--text)'
                    }}
                  />
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <input
                  type="date"
                  value={adminCustomFrom}
                  onChange={(e) => setAdminCustomFrom?.(e.target.value)}
                  style={{
                    padding: '2px 4px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '10.5px',
                    background: 'var(--surface)',
                    color: 'var(--text)'
                  }}
                />
                <span>إلى</span>
                <input
                  type="date"
                  value={adminCustomTo}
                  onChange={(e) => setAdminCustomTo?.(e.target.value)}
                  style={{
                    padding: '2px 4px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '10.5px',
                    background: 'var(--surface)',
                    color: 'var(--text)'
                  }}
                />
              </div>
            )}
          </div>
        )}

        {onExportExcel && (
          <button
            type="button"
            onClick={onExportExcel}
            title="تصدير كشف الرواتب Excel"
            style={{
              background: 'var(--success-light)',
              color: 'var(--success-dark)',
              border: '1px solid var(--success-border)',
              padding: '5px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <span>📥</span>
            <span>تصدير Excel</span>
          </button>
        )}

        <div style={{ position: 'relative' }} ref={notifDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNotifDropdownOpen(prev => !prev)}
            title="الإشعارات والتنبيهات"
            style={{
              position: 'relative',
              border: isNotifDropdownOpen ? '1.5px solid var(--primary)' : '1px solid var(--border)',
              background: isNotifDropdownOpen || activeTab === 'notifications' ? 'var(--primary-light)' : 'var(--surface)',
              padding: '5px 9px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>🔔</span>
            {unreadNotificationsCount > 0 && (
              <span style={{
                background: 'var(--danger)',
                color: '#fff',
                padding: '1px 5px',
                borderRadius: '99px',
                fontSize: '10px',
                fontWeight: 800,
                boxShadow: '0 1px 3px rgba(220,38,38,0.4)'
              }}>
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {isNotifDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                width: '360px',
                maxWidth: '92vw',
                background: 'var(--surface, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: '12px',
                boxShadow: '0 15px 35px rgba(0,0,0,0.18)',
                zIndex: 1000,
                overflow: 'hidden',
                direction: 'rtl',
                fontFamily: "'Cairo', 'Tajawal', sans-serif"
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--surface-muted, #f8fafc)',
                  borderBottom: '1px solid var(--border, #e2e8f0)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>🔔 أحدث الإشعارات</span>
                  {unreadNotificationsCount > 0 && (
                    <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px' }}>
                      {unreadNotificationsCount} غير مقروء
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {unreadNotificationsCount > 0 && onMarkAllNotificationsRead && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAllNotificationsRead();
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary, #0f766e)',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '2px 5px'
                      }}
                    >
                      ✓ تحديد الكل
                    </button>
                  )}
                  {onClearReadNotifications && (notifications || []).some(n => n.read) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearReadNotifications();
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--danger, #dc2626)',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        padding: '2px 5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                      title="حذف جميع الإشعارات المقروءة"
                    >
                      <span>🗑️</span>
                      <span>مسح المقروء</span>
                    </button>
                  )}
                </div>
              </div>

              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                {(notifications || []).length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px' }}>
                    🎉 لا توجد إشعارات حالياً
                  </div>
                ) : (
                  (notifications || []).slice(0, 20).map((n) => {
                    const isUnread = !n.read;
                    const handleDesktopItemClick = () => {
                      if (isUnread && onMarkNotificationRead) onMarkNotificationRead(n.id);
                      setIsNotifDropdownOpen(false);
                      const target = getNotificationTargetTab(n, currentRole);
                      if (setActiveTab) setActiveTab(target);
                    };

                    return (
                      <div
                        key={n.id}
                        onClick={handleDesktopItemClick}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                          background: isUnread ? 'rgba(13, 148, 136, 0.06)' : 'transparent',
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'flex-start',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                        className="notif-dropdown-item-hover"
                      >
                        <span style={{ fontSize: '16px', marginTop: '2px' }}>
                          {n.icon || (n.type === 'recruitment' ? '📥' : n.type === 'loan' ? '💳' : n.type === 'leave' ? '🏖️' : n.type === 'permission' ? '⏰' : n.type === 'swap' ? '🔄' : '🔔')}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <h5 style={{ margin: 0, fontSize: '12.5px', fontWeight: isUnread ? 800 : 600, color: 'var(--text)' }}>
                              {n.title || n.typeLabel || (n.type === 'recruitment' ? 'طلب توظيف جديد' : 'إشعار إداري')}
                            </h5>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                              {isUnread && onMarkNotificationRead && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkNotificationRead(n.id);
                                  }}
                                  title="تحديد كمقروء"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--primary, #0f766e)',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    padding: '0 4px',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  ✓ تم
                                </button>
                              )}
                              {onDeleteNotification && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteNotification(n.id);
                                  }}
                                  title="حذف الإشعار"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--muted, #94a3b8)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    padding: '0 3px',
                                    transition: 'color 0.15s'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#dc2626'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted, #94a3b8)'; }}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                          <p style={{ margin: '3px 0', fontSize: '11.5px', color: 'var(--text-muted, #475569)', lineHeight: 1.35 }}>
                            {n.message || n.body || n.details || ''}
                          </p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '10px', color: 'var(--muted, #94a3b8)' }}>
                            <span>🕒 {n.date || (n.timestamp ? n.timestamp.slice(0, 10) : '')}</span>
                            {n.employeeName && <span>👤 {n.employeeName}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--surface-muted, #f8fafc)',
                  borderTop: '1px solid var(--border, #e2e8f0)',
                  textAlign: 'center'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('notifications');
                    setIsNotifDropdownOpen(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary, #0f766e)',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>📂 الانتقال لمركز الإشعارات والرقابة الحية الكامل</span>
                  <span>←</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          title={themeMode === 'dark' ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            padding: '5px 9px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span>{themeMode === 'dark' ? '☀️' : '🌙'}</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          title="تسجيل الخروج"
          style={{
            border: '1px solid var(--danger-border, #fca5a5)',
            background: 'var(--danger-light, #fee2e2)',
            color: 'var(--danger, #dc2626)',
            padding: '5px 10px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#fecaca'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-light, #fee2e2)'; }}
        >
          <span>🚪</span>
          <span>خروج</span>
        </button>
      </div>
    </header>
  )}

  {isMobileScreen && (
    <div className="mobile-subbar" style={{
      background: 'var(--surface-muted, #f8fafc)',
      borderBottom: '1px solid var(--border)',
      padding: '6px 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: '11.5px',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: liveTime.isServerSynced ? '#22c55e' : '#f59e0b'
        }} />
        <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
          ⏰ {liveTime.formatted12Time}
        </span>
      </div>

      {setMonthPicker && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            type="month"
            value={monthPicker}
            onChange={(e) => setMonthPicker(e.target.value)}
            style={{
              padding: '2px 6px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontWeight: 'bold',
              background: 'var(--surface)',
              color: 'var(--text)'
            }}
          />
        </div>
      )}
    </div>
  )}

  {!isMobileScreen && (
    <nav
      ref={menuContainerRef}
      className="desktop-menubar"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '4px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        position: 'sticky',
        top: 0,
        zIndex: 90,
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}
    >
      {currentMenuItems.map((menu) => {
        const isActive = isMenuGroupActive(menu);
        const isOpen = openDropdown === menu.id;

        return (
          <div key={menu.id} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => handleMenuClick(menu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 15px',
                borderRadius: '10px',
                border: 'none',
                background: isActive
                  ? 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)'
                  : isOpen
                  ? 'var(--hover, rgba(13, 148, 136, 0.08))'
                  : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary, #334155)',
                fontSize: '13.5px',
                fontWeight: isActive ? 800 : 700,
                cursor: 'pointer',
                transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? '0 4px 12px rgba(13, 148, 136, 0.28)' : 'none',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isOpen) {
                  e.currentTarget.style.background = 'var(--hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isOpen) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ fontSize: '15px' }}>{menu.icon}</span>
              <span>{menu.label}</span>

              {!menu.isSingle && (
                <span style={{
                  fontSize: '10px',
                  opacity: isActive ? 0.9 : 0.6,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease'
                }}>
                  ▼
                </span>
              )}

              {menu.badge > 0 && (
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--danger)',
                  color: '#ffffff',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '99px',
                  marginRight: '2px'
                }}>
                  {menu.badge}
                </span>
              )}
            </button>

            {!menu.isSingle && isOpen && menu.children && (
              <div
                className="desktop-dropdown-animate"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: '310px',
                  maxWidth: '380px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 35px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}
              >
                {menu.children.map((child) => {
                  const isChildActive = child.targetTab === activeTab && (!child.targetSubTab || activeSubTab === child.targetSubTab || (child.targetTab === 'branches' && child.targetSubTab === 'list' && (!activeSubTab || activeSubTab === 'branches' || activeSubTab === 'list')));
                  const hasSubChildren = child.subChildren && child.subChildren.length > 0;
                  const isFlyoutOpen = hoveredFlyoutId === child.id;

                  return (
                    <div
                      key={child.id}
                      style={{ position: 'relative' }}
                      onMouseEnter={() => {
                        if (hasSubChildren) setHoveredFlyoutId(child.id);
                      }}
                      onMouseLeave={() => {
                        if (hasSubChildren) setHoveredFlyoutId(null);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSubItemClick(child)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: 'none',
                          background: isChildActive ? 'var(--primary-light)' : isFlyoutOpen ? 'var(--hover)' : 'transparent',
                          color: isChildActive ? 'var(--primary-dark)' : 'var(--text)',
                          cursor: 'pointer',
                          textAlign: 'right',
                          width: '100%',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isChildActive && !isFlyoutOpen) {
                            e.currentTarget.style.background = 'var(--hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isChildActive && !isFlyoutOpen) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '18px', marginTop: '1px' }}>
                            {child.icon}
                          </span>
                          {child.badge > 0 && (
                            <span
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: '#dc2626',
                                color: '#ffffff',
                                borderRadius: '50%',
                                minWidth: '16px',
                                height: '16px',
                                padding: '0 3px',
                                fontSize: '10px',
                                fontWeight: '900',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 0 6px rgba(220, 38, 38, 0.6)',
                                border: '1.5px solid var(--surface)'
                              }}
                            >
                              {child.badge > 99 ? '99+' : child.badge}
                            </span>
                          )}
                        </div>

                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '6px'
                          }}>
                            <span style={{
                              fontWeight: isChildActive ? 800 : 700,
                              fontSize: '13px',
                              color: isChildActive ? 'var(--primary)' : 'var(--text)'
                            }}>
                              {child.label}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {child.badge > 0 && (
                                <span style={{
                                  background: 'var(--danger)',
                                  color: '#ffffff',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '99px'
                                }}>
                                  {child.badge}
                                </span>
                              )}

                              {hasSubChildren && (
                                <span style={{
                                  fontSize: '11px',
                                  color: isChildActive ? 'var(--primary)' : 'var(--muted)',
                                  opacity: 0.7,
                                  transform: isFlyoutOpen ? 'translateX(-2px)' : 'none',
                                  transition: 'transform 0.15s ease'
                                }}>
                                  ◀
                                </span>
                              )}
                            </div>
                          </div>

                          {child.desc && (
                            <p style={{
                              margin: '2px 0 0',
                              fontSize: '11px',
                              color: 'var(--muted)',
                              lineHeight: 1.3,
                              whiteSpace: 'normal'
                            }}>
                              {child.desc}
                            </p>
                          )}
                        </div>
                      </button>

                      {hasSubChildren && isFlyoutOpen && (
                        <div
                          className="desktop-flyout-animate"
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: 'calc(100% + 6px)',
                            minWidth: '280px',
                            maxWidth: '340px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 14px 35px rgba(0,0,0,0.22)',
                            padding: '6px',
                            zIndex: 1100,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px'
                          }}
                          onMouseEnter={() => setHoveredFlyoutId(child.id)}
                          onMouseLeave={() => setHoveredFlyoutId(null)}
                        >
                          {child.subChildren.map((subChild) => {
                            const isSubChildActive = subChild.targetTab === activeTab && (!subChild.targetSubTab || activeSubTab === subChild.targetSubTab);

                            return (
                              <button
                                key={subChild.id}
                                type="button"
                                onClick={() => handleSubItemClick(subChild)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: isSubChildActive ? 'var(--primary-light)' : 'transparent',
                                  color: isSubChildActive ? 'var(--primary-dark)' : 'var(--text)',
                                  cursor: 'pointer',
                                  textAlign: 'right',
                                  width: '100%',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSubChildActive) e.currentTarget.style.background = 'var(--hover)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSubChildActive) e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <span style={{ fontSize: '17px', marginTop: '1px', flexShrink: 0 }}>
                                  {subChild.icon}
                                </span>

                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '6px'
                                  }}>
                                    <span style={{
                                      fontWeight: isSubChildActive ? 800 : 700,
                                      fontSize: '12.5px',
                                      color: isSubChildActive ? 'var(--primary)' : 'var(--text)'
                                    }}>
                                      {subChild.label}
                                    </span>
                                  </div>

                                  {subChild.desc && (
                                    <p style={{
                                      margin: '2px 0 0',
                                      fontSize: '11px',
                                      color: 'var(--muted)',
                                      lineHeight: 1.3,
                                      whiteSpace: 'normal'
                                    }}>
                                      {subChild.desc}
                                    </p>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  )}

  {isMobileScreen && isMobileDrawerOpen && (
    <div
      className="mobile-drawer-overlay"
      onClick={() => setIsMobileDrawerOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        justifyContent: 'flex-start',
        animation: 'epFadeIn 0.2s ease'
      }}
    >
      <div
        className="mobile-drawer"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '310px',
          maxWidth: '85vw',
          height: '100%',
          background: 'var(--surface, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 0 40px rgba(0, 0, 0, 0.4)',
          overflowY: 'auto',
          borderLeft: '1px solid var(--border)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{
          padding: '22px 18px 18px',
          background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
          color: '#ffffff',
          position: 'relative',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <button
            type="button"
            onClick={() => setIsMobileDrawerOpen(false)}
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              background: 'rgba(255, 255, 255, 0.25)',
              border: 'none',
              color: '#ffffff',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
            }}
            title="إغلاق القائمة"
          >
            ✕
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: '#ffffff',
              color: '#0d9488',
              border: '2px solid rgba(255,255,255,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '18px',
              overflow: 'hidden',
              flexShrink: 0
            }}>
              {userProfile?.photoUrl ? (
                <img src={userProfile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                firstLetter
              )}
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profileName}
              </h3>
              <div style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.9)' }}>
                <span>{currentRole === 'branch' ? `📍 فرع: ${currentBranch?.name || 'الفرع'}` : profileTitle}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {currentMenuItems.map((menu) => {
            if (menu.isSingle) {
              const isActive = activeTab === menu.targetTab;
              return (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => {
                    handleMenuClick(menu);
                    setIsMobileDrawerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: isActive ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                    color: isActive ? 'var(--primary-dark, #0f766e)' : 'var(--text)',
                    fontSize: '14px',
                    fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer',
                    textAlign: 'right',
                    width: '100%',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{menu.icon}</span>
                  <span style={{ flex: 1 }}>{menu.label}</span>
                </button>
              );
            }

            const isExpanded = drawerExpandedGroup === menu.id;
            const isGroupActive = isMenuGroupActive(menu);

            return (
              <div key={menu.id} style={{ borderBottom: '1px solid var(--border-light, rgba(0,0,0,0.05))', paddingBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => setDrawerExpandedGroup(prev => prev === menu.id ? null : menu.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: isGroupActive ? 'rgba(13, 148, 136, 0.08)' : (isExpanded ? 'var(--hover, rgba(0,0,0,0.03))' : 'transparent'),
                    color: isGroupActive ? 'var(--primary, #0d9488)' : 'var(--text)',
                    fontSize: '14px',
                    fontWeight: isGroupActive ? 800 : 700,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>{menu.icon}</span>
                    <span>{menu.label}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                    ▼
                  </span>
                </button>

                {isExpanded && menu.children && (
                  <div style={{ padding: '4px 10px 8px 14px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {menu.children.map((child) => {
                      const isChildActive = child.targetTab === activeTab && (!child.targetSubTab || activeSubTab === child.targetSubTab || (child.targetTab === 'branches' && child.targetSubTab === 'list' && (!activeSubTab || activeSubTab === 'branches' || activeSubTab === 'list')));
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => {
                            handleSubItemClick(child);
                            setIsMobileDrawerOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '9px 12px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isChildActive ? 'var(--primary-light, #ccfbf1)' : 'transparent',
                            color: isChildActive ? 'var(--primary-dark, #0f766e)' : 'var(--text)',
                            fontSize: '13px',
                            fontWeight: isChildActive ? 800 : 600,
                            cursor: 'pointer',
                            textAlign: 'right',
                            width: '100%',
                            transition: 'all 0.15s ease',
                            fontFamily: 'inherit'
                          }}
                        >
                          <span style={{ fontSize: '16px' }}>{child.icon}</span>
                          <span style={{ flex: 1 }}>{child.label}</span>
                          {child.badge > 0 && (
                            <span style={{ background: 'var(--danger)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '99px' }}>
                              {child.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Drawer Footer (Logout) */}
        <div style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => {
              setIsMobileDrawerOpen(false);
              if (typeof onLogout === 'function') onLogout();
            }}
            style={{
              width: '100%',
              padding: '9px 14px',
              borderRadius: '8px',
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>🚪</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  )}

  {/* ══════════════════════════════════════════════════════════════════════════════ */}
  {/* ── 5. MOBILE BOTTOM NAVIGATION BAR (Fixed at bottom on Mobile Screens) ── */}
  {/* ══════════════════════════════════════════════════════════════════════════════ */}
  {isMobileScreen && (
    <nav className="desktop-bottom-nav" style={{
      display: 'flex',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '60px',
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.08)',
      zIndex: 1000,
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '0 4px calc(env(safe-area-inset-bottom, 0px))',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)'
    }}>
      {/* Button 1: Dashboard */}
      <button
        type="button"
        className={`desktop-bottom-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
        onClick={() => setActiveTab('dashboard')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          height: '100%',
          background: 'none',
          border: 'none',
          color: activeTab === 'dashboard' ? 'var(--primary, #0d9488)' : 'var(--muted)',
          fontSize: '11px',
          fontWeight: activeTab === 'dashboard' ? 800 : 600,
          cursor: 'pointer',
          padding: '4px 0',
          fontFamily: 'inherit'
        }}
      >
        <span style={{ fontSize: '18px' }}>📊</span>
        <span>الرئيسية</span>
      </button>

      {/* Button 2: Operations / Employees */}
      <button
        type="button"
        className={`desktop-bottom-nav-btn ${(activeTab === 'emp-punches' || activeTab === 'employees') ? 'active' : ''}`}
        onClick={() => setActiveTab(currentRole === 'branch' ? 'emp-punches' : 'employees')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          height: '100%',
          background: 'none',
          border: 'none',
          color: (activeTab === 'emp-punches' || activeTab === 'employees') ? 'var(--primary, #0d9488)' : 'var(--muted)',
          fontSize: '11px',
          fontWeight: (activeTab === 'emp-punches' || activeTab === 'employees') ? 800 : 600,
          cursor: 'pointer',
          padding: '4px 0',
          fontFamily: 'inherit'
        }}
      >
        <span style={{ fontSize: '18px' }}>👥</span>
        <span>{currentRole === 'branch' ? 'الحضور' : 'الموظفون'}</span>
      </button>

      {/* Button 3: Requests */}
      <button
        type="button"
        className={`desktop-bottom-nav-btn ${activeTab === 'requests' ? 'active' : ''}`}
        onClick={() => setActiveTab('requests')}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          height: '100%',
          background: 'none',
          border: 'none',
          color: activeTab === 'requests' ? 'var(--primary, #0d9488)' : 'var(--muted)',
          fontSize: '11px',
          fontWeight: activeTab === 'requests' ? 800 : 600,
          cursor: 'pointer',
          padding: '4px 0',
          fontFamily: 'inherit',
          position: 'relative'
        }}
      >
        <span style={{ fontSize: '18px' }}>📋</span>
        <span>الطلبات</span>
        {(pendingCount + resignationCount) > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: 'calc(50% - 18px)',
            background: 'var(--danger)',
            color: '#fff',
            borderRadius: '50%',
            minWidth: '15px',
            height: '15px',
            fontSize: '9px',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {(pendingCount + resignationCount) > 99 ? '99+' : (pendingCount + resignationCount)}
          </span>
        )}
      </button>

      {/* Button 4: More / Drawer */}
      <button
        type="button"
        className="desktop-bottom-nav-btn"
        onClick={() => setIsMobileDrawerOpen(true)}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          height: '100%',
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: '11px',
          fontWeight: 600,
          cursor: 'pointer',
          padding: '4px 0',
          fontFamily: 'inherit'
        }}
      >
        <span style={{ fontSize: '18px' }}>☰</span>
        <span>المزيد</span>
      </button>
    </nav>
  )}

  {/* ══════════════════════════════════════════════════════════════════════════════ */}
  {/* ── 6. MAIN WORKSPACE (Full-Width Responsive Canvas) ── */}
  {/* ══════════════════════════════════════════════════════════════════════════════ */}
  <main className="desktop-workspace" style={{
    flex: 1,
    padding: isMobileScreen ? '12px 10px 85px 10px' : '20px 24px',
    overflowY: 'auto',
    background: 'var(--background)'
  }}>
    {children}
  </main>
</div>
);
}
