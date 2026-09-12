/**
 * electron/preload.cjs
 * جسر التواصل الآمن والمحمي (Secure Context Bridge) بين واجهة React ونظام التشغيل Windows
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,

  // 1. معلومات التطبيق والنظام والصلاحيات
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getAppDataPath: () => ipcRenderer.invoke('app:get-path'),
  isAdmin: () => ipcRenderer.invoke('app:is-admin'),
  readModelBinary: (modelPath) => ipcRenderer.invoke('app:read-model-binary', modelPath),

  // 2. إدارة نافذة البرنامج
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },
  toggleFullScreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  setFullScreen: (flag) => ipcRenderer.send('window:set-fullscreen', flag),
  isFullScreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  onFullScreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, isFs) => callback(isFs);
    ipcRenderer.on('window:fullscreen-change', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-change', listener);
  },

  // 3. قاعدة البيانات المحلية على قرص الويندوز (Offline-First Persistent Storage)
  saveStateLocally: (state) => ipcRenderer.invoke('local-db:save-state', state),
  loadStateLocally: () => ipcRenderer.invoke('local-db:load-state'),
  savePendingQueue: (queue) => ipcRenderer.invoke('local-db:save-pending', queue),
  loadPendingQueue: () => ipcRenderer.invoke('local-db:load-pending'),
  clearLocalCache: () => ipcRenderer.invoke('local-db:clear'),

  // 4. محرك التحديثات التلقائية داخل البرنامج (In-App Auto-Updater)
  checkForUpdates: () => ipcRenderer.invoke('app-update:check'),
  startDownloadUpdate: () => ipcRenderer.invoke('app-update:download'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('app-update:quit-and-install'),

  // 5. الاستماع لأحداث التحديث المباشرة
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('app-update:status', listener);
    return () => ipcRenderer.removeListener('app-update:status', listener);
  },

  // 6. أحداث حالة الاتصال والمزامنة
  notifySyncCompleted: (syncInfo) => ipcRenderer.send('app-sync:completed', syncInfo),
  checkOnline: () => ipcRenderer.invoke('app:check-online'),
  onSystemResume: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('app:system-resume', listener);
    return () => ipcRenderer.removeListener('app:system-resume', listener);
  },

  // 7. إدارة خادم الواتساب التلقائي (24/7 WhatsApp Gateway)
  restartWhatsAppServer: () => ipcRenderer.invoke('whatsapp:restart-server'),
  logoutWhatsAppServer: () => ipcRenderer.invoke('whatsapp:logout'),
  getWhatsAppServerHealth: () => ipcRenderer.invoke('whatsapp:get-health'),
  getWhatsAppServerStatus: () => ipcRenderer.invoke('whatsapp:get-status'),
  getNetworkInfo: () => ipcRenderer.invoke('whatsapp:get-network-info'),
  onWhatsAppNetworkInfo: (listener) => {
    ipcRenderer.on('whatsapp:network-info', (e, data) => listener(data));
  },

  // 8. توليد ملفات الـ PDF البرمجية
  generatePdfBase64: (htmlContent, printOptions) => ipcRenderer.invoke('print:generate-pdf-base64', htmlContent, printOptions)
});
