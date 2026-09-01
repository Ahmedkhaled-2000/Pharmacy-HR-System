import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { UIProvider } from './context/UIContext';
import { NotificationProvider } from './context/NotificationContext';
import AppRoutes from './routes/AppRoutes';
import GlobalModalsContainer from './components/modals/GlobalModalsContainer';
import AppUpdateWatcher from './components/common/AppUpdateWatcher';

/**
 * Inner Application shell
 */
function AppContent() {
  return (
    <>
      <AppRoutes />
      <GlobalModalsContainer />
      <AppUpdateWatcher />
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
