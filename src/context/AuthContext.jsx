import React, { createContext, useContext, useState, useEffect } from 'react';

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

  const toggleTheme = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Unified Role & Navigation States (with localStorage session restoration)
  const [authRole, setAuthRole] = useState(() => {
    try {
      const saved = localStorage.getItem('app_auth_role');
      if (saved && ['owner', 'admin', 'branch', 'employee'].includes(saved)) {
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
    try { return localStorage.getItem('app_active_nav_tab') || 'dashboard'; } catch { return 'dashboard'; }
  });

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

  // Unified Login Handler
  const handleUnifiedLogin = ({ role, user, branch, redirectTab = 'dashboard' }) => {
    setAuthRole(role);
    if (role === 'owner') {
      setIsAdminLoggedIn(true);
      setCurrentBranch(null);
      setCurrentEmpUser(null);
    } else if (role === 'admin') {
      setIsAdminLoggedIn(true);
      setCurrentBranch(null);
      setCurrentEmpUser(null);
    } else if (role === 'branch') {
      setIsAdminLoggedIn(false);
      setCurrentBranch(branch || user);
      setCurrentEmpUser(null);
    } else if (role === 'employee') {
      setIsAdminLoggedIn(false);
      setCurrentBranch(null);
      setCurrentEmpUser(user);
    }
    setActiveNavTab(redirectTab);
  };

  // Employee Login
  const handleEmpLogin = (emp, passwordInput) => {
    if (!emp) return { success: false, message: 'الموظف غير موجود' };
    const empPass = String(emp.password || '123').trim();
    if (String(passwordInput || '').trim() !== empPass) {
      return { success: false, message: 'كلمة المرور غير صحيحة' };
    }
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
    } catch {}

    setAuthRole('none');
    setIsAdminLoggedIn(false);
    setCurrentBranch(null);
    setCurrentEmpUser(null);
    setActiveNavTab('dashboard');
  };

  const value = {
    themeMode,
    setThemeMode,
    toggleTheme,
    authRole,
    setAuthRole,
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
    handleLogout
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
