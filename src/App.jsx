import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { UIProvider } from './context/UIContext';
import { NotificationProvider } from './context/NotificationContext';
import AppRoutes from './routes/AppRoutes';
import GlobalModalsContainer from './components/modals/GlobalModalsContainer';
import AppUpdateWatcher from './components/common/AppUpdateWatcher';
import UniversalShortcutsController from './components/common/UniversalShortcutsController';
import DesktopSystemTitleBar from './components/layout/DesktopSystemTitleBar';

/**
 * Inner Application shell
 */
function AppContent() {
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.desktopAPI?.isDesktop) {
      document.body.classList.add('is-desktop-mode');
      document.documentElement.classList.add('is-desktop-app');
    }
  }, []);

  return (
    <>
      <DesktopSystemTitleBar />
      <AppRoutes />
      <GlobalModalsContainer />
      <AppUpdateWatcher />
      <UniversalShortcutsController />
    </>
  );
}

/**
 * Main Application Root with Modular Context Architecture
 */
export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <UIProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </UIProvider>
      </DataProvider>
    </AuthProvider>
  );
}
