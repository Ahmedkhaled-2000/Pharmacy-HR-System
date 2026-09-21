import React, { createContext, useContext, useState, useEffect } from 'react';
import { getValidAuthToken, apiLogin } from '../utils/apiClient';
import { subscribeToSessionRevocations, CLIENT_SESSION_ID } from '../utils/socketClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Theme Mode State ('light' | 'dark')
  const [themeMode, setThemeMode] = useState(() => {
    try { return localStorage.getItem('app-theme') || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', themeMode);
      localStorage.setItem('app-theme', themeMode);
    } catch {}
  }, [themeMode]);

  // ضمان توفر توكن مصادقة سحابي صالح فور فتح التطبيق
  useEffect(() => {
    getValidAuthToken().catch(() => {});
  }, []);

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Unified Role & Navigation States (with localStorage session restoration)
  const [authRole, setAuthRole] = useState(() => {
    try {
      const saved = localStorage.getItem('app_auth_role');
      if (saved && ['owner', 'admin', 'branch', 'employee', 'developer'].includes(saved)) {
        return saved;
      }
      if (localStorage.getItem('app_current_emp_user')) return 'employee';
      if (localStorage.getItem('app_current_branch')) return 'branch';
      if (localStorage.getItem('app_is_admin') === 'true') return 'admin';
      return 'none';
    } catch {
      return 'none';
    }
  });

  const [currentBranch, setCurrentBranch] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_branch');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [currentEmpUser, setCurrentEmpUser] = useState(() => {
    try {
      const saved = localStorage.getItem('app_current_emp_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const [activeNavTab, setActiveNavTab] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location?.search) {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && tabParam !== 'kiosk') return tabParam;
      }
      const saved = localStorage.getItem('app_active_nav_tab');
      return saved && saved !== 'kiosk' ? saved : 'dashboard';
    } catch { return 'dashboard'; }
  });

  // مزامنة التبويب المباشر عند فتح روابط الإيميل التي تحتوي على ?tab=requests أو غيرها
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleCheckUrlTab = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = urlParams.get('tab');
        if (tabParam && tabParam !== 'kiosk') {
          setActiveNavTab(tabParam);
        }
      } catch {}
    };
    handleCheckUrlTab();
    window.addEventListener('popstate', handleCheckUrlTab);
    return () => window.removeEventListener('popstate', handleCheckUrlTab);
  }, []);

  const [activeSubTab, setActiveSubTab] = useState(() => {
    try { return localStorage.getItem('app_active_sub_tab') || 'cards'; } catch { return 'cards'; }
  });

  // Admin Auth State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    try {
      const savedRole = localStorage.getItem('app_auth_role');
      const savedIsAdmin = localStorage.getItem('app_is_admin');
      return savedRole === 'admin' || savedRole === 'owner' || savedIsAdmin === 'true';
    } catch {
      return false;
    }
  });

  // Persist session to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('app_auth_role', authRole);
      if (currentBranch) localStorage.setItem('app_current_branch', JSON.stringify(currentBranch));
      else localStorage.removeItem('app_current_branch');

      if (currentEmpUser) localStorage.setItem('app_current_emp_user', JSON.stringify(currentEmpUser));
      else localStorage.removeItem('app_current_emp_user');

      localStorage.setItem('app_active_nav_tab', activeNavTab);
      localStorage.setItem('app_active_sub_tab', activeSubTab);
      localStorage.setItem('app_is_admin', (authRole === 'admin' || authRole === 'owner' || isAdminLoggedIn) ? 'true' : 'false');
    } catch {}
  }, [authRole, currentBranch, currentEmpUser, activeNavTab, activeSubTab, isAdminLoggedIn]);

  // ── الاستماع اللحظي الفوري لأوامر إبطال وطرد الجلسات عبر WebSockets (< 10ms) ──
  useEffect(() => {
    const unsubscribe = subscribeToSessionRevocations((payload) => {
      if (!payload || !payload.role) return;
      const { role, targetId, targetCode, exceptClientId, reason } = payload;

      // إذا كان هذا التبويب/الجهاز هو المستثنى الصريح
      if (exceptClientId && exceptClientId === CLIENT_SESSION_ID) {
        return;
      }

      const activeRole = localStorage.getItem('app_auth_role') || authRole;

      // 1. طرد فوري للمالك
      if (role === 'owner') {
        const isOwnerActive =
          activeRole === 'owner' ||
          localStorage.getItem('app_owner_authenticated') === 'true' ||
          sessionStorage.getItem('app_owner_authenticated') === 'true' ||
          sessionStorage.getItem('app_settings_owner_tab_unlocked') === 'true';

        const isAdminActive =
          activeRole === 'admin' ||
          localStorage.getItem('app_is_admin') === 'true' ||
          isAdminLoggedIn;

        const shouldKick = isOwnerActive || (Boolean(payload.includeAdmin) && isAdminActive);

        if (shouldKick) {
          console.warn('🔒 [AuthContext] تم استلام أمر طرد فوري لجلسات المالك/الإدارة');
          handleLogout();
          setTimeout(() => {
            alert('🔒 تم إنهاء الجلسات أو تسجيل الخروج من حساب المالك. تم تسجيل الخروج فوراً لحماية الحساب.');
          }, 100);
          return;
        }
      }

      // 2. طرد فوري للأدمن
      if (role === 'admin') {
        const isAdminActive =
          activeRole === 'admin' ||
          localStorage.getItem('app_is_admin') === 'true' ||
          isAdminLoggedIn;

        if (isAdminActive) {
          console.warn('🔒 [AuthContext] تم استلام أمر طرد فوري لجلسات الأدمن');
          handleLogout();
          setTimeout(() => {
            alert('🔒 تم تغيير كلمة مرور حساب الإدارة (الأدمن) أو إنهاء جلسات الأدمن. تم تسجيل الخروج من هذا الجهاز.');
          }, 100);
          return;
        }
      }

      // 3. طرد فوري لمدير الفرع
      if (role === 'branch' && activeRole === 'branch') {
        const bSnapshotId = localStorage.getItem('app_branch_id_snapshot');
        const bCurrId = currentBranch?.id;
        const bCurrCode = currentBranch?.branchCode || currentBranch?.code;
        const isMatch = (targetId && (String(bSnapshotId) === String(targetId) || String(bCurrId) === String(targetId))) ||
                        (targetCode && (String(bCurrCode).toLowerCase() === String(targetCode).toLowerCase()));
        if (isMatch) {
          console.warn('🔒 [AuthContext] تم استلام أمر طرد فوري لحساب الفرع:', targetId || targetCode);
          handleLogout();
          setTimeout(() => {
            alert('🔒 تم تعديل كلمة مرور الفرع. تم تسجيل الخروج من هذا الجهاز.');
          }, 100);
          return;
        }
      }

      // 4. طرد فوري للموظف
      if (role === 'employee' && activeRole === 'employee') {
        const eSnapshotId = localStorage.getItem('app_emp_id_snapshot');
        const eSnapshotCode = localStorage.getItem('app_emp_code_snapshot');
        const eCurrId = currentEmpUser?.id;
        const eCurrCode = currentEmpUser?.code;
        const isMatch = (targetId && (String(eSnapshotId) === String(targetId) || String(eCurrId) === String(targetId))) ||
                        (targetCode && (String(eSnapshotCode).toLowerCase() === String(targetCode).toLowerCase() || String(eCurrCode).toLowerCase() === String(targetCode).toLowerCase()));
        if (isMatch) {
          console.warn('🔒 [AuthContext] تم استلام أمر طرد فوري لحساب الموظف:', targetId || targetCode);
          handleLogout();
          setTimeout(() => {
            alert('🔒 تم تعديل كلمة المرور أو إيقاف حساب الموظف. تم تسجيل الخروج فوراً.');
          }, 100);
          return;
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [authRole, currentBranch, currentEmpUser, isAdminLoggedIn]);

  // التحقق من صحة الجلسة ومطابقتها لحالة البيانات الفعلية وإنهاء الجلسات عند تغيير كلمات المرور
  const validateSessionAgainstData = (latestState) => {
    if (!latestState) return;

    const savedRole = localStorage.getItem('app_auth_role') || authRole;

    // 0. فحص تغيير كلمة مرور المالك أو تقدم رقم الجلسة
    const isOwnerSession =
      savedRole === 'owner' ||
      localStorage.getItem('app_owner_authenticated') === 'true' ||
      sessionStorage.getItem('app_owner_authenticated') === 'true' ||
      sessionStorage.getItem('app_settings_owner_tab_unlocked') === 'true';

    if (isOwnerSession) {
      const myOwnerPass = localStorage.getItem('app_owner_password_snapshot');
      const myOwnerVer = Number(localStorage.getItem('app_owner_session_version') || 0);
      const srvOwnerPass = latestState?.orgSettings?.ownerPassword;
      const srvOwnerVer = Number(latestState?.orgSettings?.ownerSessionVersion || 0);

      if ((myOwnerPass && srvOwnerPass && myOwnerPass !== srvOwnerPass) ||
          (srvOwnerVer > 0 && srvOwnerVer > myOwnerVer)) {
        console.warn('🔒 [AuthContext] انتهاء جلسة المالك بسبب تقدم رقم الجلسة بالسيرفر');
        handleLogout();
        return;
      }
    }

    // 0.5 فحص تغيير كلمة مرور الأدمن أو تقدم رقم الجلسة
    const isAdminSession =
      savedRole === 'admin' ||
      localStorage.getItem('app_is_admin') === 'true' ||
      isAdminLoggedIn;

    if (isAdminSession) {
      const myAdminPass = localStorage.getItem('app_admin_password_snapshot');
      const myAdminVer = Number(localStorage.getItem('app_admin_session_version') || 0);
      const srvAdminPass = latestState?.orgSettings?.adminPassword || latestState?.orgSettings?.adminPass;
      const srvAdminVer = Number(latestState?.orgSettings?.adminSessionVersion || 0);

      if ((myAdminPass && srvAdminPass && myAdminPass !== srvAdminPass) ||
          (srvAdminVer > 0 && srvAdminVer > myAdminVer)) {
        console.warn('🔒 [AuthContext] انتهاء جلسة الأدمن بسبب تقدم رقم الجلسة بالسيرفر');
        handleLogout();
        return;
      }
    }

    // 1. إذا كان الموظف المسجل غير موجود أو تم إيقاف حسابه أو إنهاء خدمته أو تغيير كلمة مروره
    if (currentEmpUser && latestState.employees) {
      const liveEmp = (latestState.employees || []).find(e => String(e.id) === String(currentEmpUser.id) || String(e.code) === String(currentEmpUser.code));
      if (!liveEmp || liveEmp.accountSuspended || liveEmp.status === 'معلق' || liveEmp.isTerminated || liveEmp.status === 'تم الاستقالة' || liveEmp.is_active === false) {
        handleLogout();
        return;
      }
      const myEmpPass = localStorage.getItem('app_emp_password_snapshot');
      const myEmpVer = Number(localStorage.getItem('app_emp_session_version') || 0);
      if ((myEmpPass && liveEmp.password && myEmpPass !== liveEmp.password) ||
          (Number(liveEmp.sessionVersion || 0) > myEmpVer)) {
        handleLogout();
        return;
      }
    }

    // 2. إذا كان الفرع المسجل غير موجود في قائمة الفروع أو تم تغيير كلمة مروره
    if (currentBranch && latestState.branches) {
      const liveBranch = (latestState.branches || []).find(b => b && (String(b.id) === String(currentBranch?.id) || String(b.branchCode) === String(currentBranch?.branchCode)));
      if (!liveBranch) {
        handleLogout();
        return;
      }
      const myBranchPass = localStorage.getItem('app_branch_password_snapshot');
      const myBranchVer = Number(localStorage.getItem('app_branch_session_version') || 0);
      if ((myBranchPass && liveBranch.password && myBranchPass !== liveBranch.password) ||
          (Number(liveBranch.sessionVersion || 0) > myBranchVer)) {
        handleLogout();
        return;
      }
    }
  };

  // Unified Login Handler
  const handleUnifiedLogin = (options = {}) => {
    const role = typeof options === 'string' ? options : (options.role || 'none');
    const user = options.user || null;
    const branch = options.branch || null;
    const redirectTab = options.redirectTab || (role === 'employee' ? 'portal' : role === 'branch' ? 'branch' : 'dashboard');

    setAuthRole(role);
    if (role === 'owner') {
      setIsAdminLoggedIn(true);
      setCurrentBranch(null);
      setCurrentEmpUser(null);
      try {
        localStorage.setItem('app_auth_role', 'owner');
        localStorage.setItem('app_owner_authenticated', 'true');
        sessionStorage.setItem('app_owner_authenticated', 'true');
      } catch {}
    } else if (role === 'admin') {
      setIsAdminLoggedIn(true);
      setCurrentBranch(null);
      setCurrentEmpUser(null);
      try {
        localStorage.setItem('app_auth_role', 'admin');
        localStorage.removeItem('app_owner_authenticated');
        sessionStorage.removeItem('app_owner_authenticated');
        sessionStorage.removeItem('app_settings_owner_tab_unlocked');
      } catch {}
    } else if (role === 'branch') {
      setIsAdminLoggedIn(false);
      setCurrentBranch(branch || user);
      setCurrentEmpUser(null);
      try {
        localStorage.removeItem('app_owner_authenticated');
        sessionStorage.removeItem('app_owner_authenticated');
      } catch {}
    } else if (role === 'employee') {
      setIsAdminLoggedIn(false);
      setCurrentBranch(null);
      setCurrentEmpUser(user);
      try {
        localStorage.removeItem('app_owner_authenticated');
        sessionStorage.removeItem('app_owner_authenticated');
      } catch {}
    } else if (role === 'developer') {
      setIsAdminLoggedIn(false);
      setCurrentBranch(null);
      setCurrentEmpUser(null);
      try {
        localStorage.setItem('app_auth_role', 'developer');
        localStorage.setItem('app_is_developer', 'true');
      } catch {}
    }
    setActiveNavTab(redirectTab);
  };

  // Employee Login
  const handleEmpLogin = (emp, passwordInput) => {
    if (!emp) return { success: false, message: 'الموظف غير موجود' };

    // فحص الإيقاف المؤقت وبصمة وحساب الموظف
    if (emp.accountSuspended || emp.biometricSuspended || emp.punchDisabled || emp.status === 'معلق') {
      const reason = emp.suspensionReason || 'إحالة فورية للتحقيق أو إيقاف مؤقت عن العمل لحين انتهاء التحقيق';
      return {
        success: false,
        message: `⛔ تم إيقاف بصمة وحساب الموظف مؤقتاً (${reason}). يرجى مراجعة إدارة الموارد البشرية.`
      };
    }

    // فحص إنهاء الخدمة
    if (emp.isTerminated || emp.status === 'تم الاستقالة' || emp.is_active === false) {
      return {
        success: false,
        message: `🚫 تم إنهاء خدمة هذا الموظف (${emp.terminationReason || 'استقالة أو إنهاء تعاقد'}) ولا يمكن تسجيل الدخول.`
      };
    }

    const cleanStr = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '').trim();
    const toStdDigits = (s) => cleanStr(s)
      .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
      .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));

    const empPass = cleanStr(emp.password || '123');
    const inputPass = cleanStr(passwordInput);

    const isMatch = empPass === inputPass || toStdDigits(empPass) === toStdDigits(inputPass);
    if (!isMatch) {
      return { success: false, message: 'كلمة المرور غير صحيحة' };
    }

    try {
      localStorage.setItem('app_auth_role', 'employee');
      localStorage.setItem('app_emp_code_snapshot', String(emp.code || ''));
      localStorage.setItem('app_emp_id_snapshot', String(emp.id || ''));
      localStorage.setItem('app_emp_password_snapshot', String(passwordInput || '123'));
    } catch {}

    // استدعاء مصادقة السيرفر للحصول على JWT token رسمي للموظف فورياً
    apiLogin(emp.code || emp.id, passwordInput || '123', 'employee').then((res) => {
      if (res?.token) {
        try { localStorage.setItem('app_auth_token', res.token); } catch {}
      }
    }).catch((e) => {
      console.warn('[AuthContext] Silent employee token fetch notice:', e);
    });

    handleUnifiedLogin({ role: 'employee', user: emp, redirectTab: 'portal' });
    return { success: true };
  };

  // Logout Handler
  const handleLogout = () => {
    try {
      localStorage.removeItem('app_auth_role');
      localStorage.removeItem('app_current_branch');
      localStorage.removeItem('app_current_emp_user');
      localStorage.removeItem('app_is_admin');
      localStorage.removeItem('app_active_nav_tab');
      localStorage.removeItem('app_active_sub_tab');
      localStorage.removeItem('app_owner_authenticated');
      localStorage.removeItem('app_owner_password_snapshot');
      localStorage.removeItem('app_owner_session_version');
      localStorage.removeItem('app_admin_password_snapshot');
      localStorage.removeItem('app_admin_session_version');
      localStorage.removeItem('app_branch_password_snapshot');
      localStorage.removeItem('app_branch_id_snapshot');
      localStorage.removeItem('app_branch_session_version');
      localStorage.removeItem('app_emp_code_snapshot');
      localStorage.removeItem('app_emp_id_snapshot');
      localStorage.removeItem('app_emp_password_snapshot');
      localStorage.removeItem('app_emp_session_version');
      localStorage.removeItem('app_auth_token');
      localStorage.removeItem('pharmacy_owner_password');
      localStorage.removeItem('pharmacy_owner_username');
      sessionStorage.removeItem('app_owner_authenticated');
      sessionStorage.removeItem('app_settings_owner_tab_unlocked');
    } catch {}

    setAuthRole('none');
    setIsAdminLoggedIn(false);
    setCurrentBranch(null);
    setCurrentEmpUser(null);
    setActiveNavTab('dashboard');
  };

  const isOwner = authRole === 'owner' || (() => {
    try {
      return localStorage.getItem('app_auth_role') === 'owner';
    } catch {
      return false;
    }
  })();

  const value = {
    themeMode,
    setThemeMode,
    toggleTheme,
    authRole,
    setAuthRole,
    isOwner,
    currentBranch,
    setCurrentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    activeNavTab,
    setActiveNavTab,
    activeSubTab,
    setActiveSubTab,
    isAdminLoggedIn,
    setIsAdminLoggedIn,
    handleUnifiedLogin,
    handleEmpLogin,
    handleLogout,
    validateSessionAgainstData
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
