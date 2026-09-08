/**
 * electron/main.cjs
 * العملية الرئيسية لنظام سطح المكتب لنظام Windows
 * تشمل إدارة النوافذ، قاعدة البيانات المحلية المحمية، ومحرك التحديث التلقائي الصامت
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, powerMonitor, net } = require('electron');
const path = require('path');
const fs = require('fs');

// محاولة استيراد electron-updater بأمان
let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
} catch (e) {
  console.warn('[AutoUpdater] electron-updater is not yet available in dev mode:', e.message);
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
let mainWindow = null;

// ── 1. إعداد مسارات التخزين المحلية لنظام الويندوز (%APPDATA%/PharmacyHR) ──
const userDataPath = path.join(app.getPath('userData'), 'PharmacyHR_Data');
if (!fs.existsSync(userDataPath)) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
  } catch (err) {
    console.error('Failed to create userData directory:', err);
  }
}

const LOCAL_STATE_FILE = path.join(userDataPath, 'local_state.json');
const LOCAL_BACKUP_FILE = path.join(userDataPath, 'local_state.bak.json');
const LOCAL_PENDING_FILE = path.join(userDataPath, 'pending_queue.json');

// ── 2. قفل النسخة الفردية (Single Instance Lock) ─────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── 3. إنشاء نافذة التطبيق الرئيسية ─────────────────────────────────────
function createMainWindow() {
  const iconPath = path.join(__dirname, '../assets/icon.ico');
  const fallbackIconPath = path.join(__dirname, '../assets/icon.png');
  const resolvedIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIconPath) ? fallbackIconPath : undefined);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'منظومة إدارة الموارد البشرية والرواتب',
    icon: resolvedIcon,
    backgroundColor: '#0f172a',
    frame: false, // نافذة مخصصة لإتاحة وضع عناصر شريط العنوان المكتبي بدقة (عنوان يميناً، أزرار يساراً)
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // للسماح بتحميل نماذج الذكاء الاصطناعي وبصمة الوجه وملفات WASM المحلية
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  // إخفاء شريط القوائم الافتراضي لإعطاء مظهر برمجي عالمي فخم
  Menu.setApplicationMenu(null);

  // إظهار النافذة بسلاسة بمجرد اكتمال تجهيز المحتوى الأولي
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // ضبط نسبة العرض (Zoom Factor) لتكون 92% لضمان المحاذاة التامة والراحة البصرية لجميع الشاشات
    try {
      mainWindow.webContents.setZoomFactor(0.92);
    } catch {}
    if (isDev) {
      // mainWindow.webContents.openDevTools();
    }
    // فحص وجود تحديثات بعد 5 ثوانٍ من تشغيل البرنامج
    setTimeout(() => {
      checkForAppUpdates();
    }, 5000);
  });

  // إرسال حالة التكبير والاستعادة لواجهة المستخدم لتحديث الأيقونات بدقة
  mainWindow.on('maximize', () => {
    try { mainWindow?.webContents?.send('window:maximized-change', true); } catch {}
  });

  mainWindow.on('unmaximize', () => {
    try { mainWindow?.webContents?.send('window:maximized-change', false); } catch {}
  });

  // السماح بالوصول للكاميرا ومكبر الصوت لالتقاط بصمة الوجه والصوت
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'camera' || permission === 'microphone') {
      return true;
    }
    return true;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    return true;
  });

  // تحميل مسار الواجهة
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 4. محرك التحديثات التلقائية (In-App Auto-Updater Engine) ──────────────
function sendUpdateStatus(status, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update:status', { status, ...payload });
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for new updates...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    sendUpdateStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || 'تحديث جديد يتضمن تحسينات ومميزات وإصلاحات برمجية.'
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date.');
    sendUpdateStatus('not-available', { currentVersion: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[AutoUpdater] Download progress: ${progressObj.percent.toFixed(1)}%`);
    sendUpdateStatus('progress', {
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded successfully! Ready to install.');
    sendUpdateStatus('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater Error]:', err.message);
    sendUpdateStatus('error', { error: err.message });
  });
}

function checkForAppUpdates() {
  if (autoUpdater && !isDev) {
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      console.warn('[AutoUpdater] Check failed:', e.message);
    }
  }
}

// فحص دوري للتحديث كل 60 دقيقة
setInterval(() => {
  checkForAppUpdates();
}, 60 * 60 * 1000);

// ── 5. معالجات الـ IPC للتواصل مع الواجهة ──────────────────────────────────

// جلب رقم الإصدار والمسارات
ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-path', () => userDataPath);

// إدارة النافذة
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.handle('window:is-maximized', () => mainWindow ? mainWindow.isMaximized() : false);
ipcMain.handle('app:check-online', () => {
  try {
    return net.isOnline();
  } catch {
    return true;
  }
});

// التخزين المحلي الآمن لحالة المنظومة على القرص بالكتابة الذرية الآمنة (Atomic Safe Write)
ipcMain.handle('local-db:save-state', async (_event, state) => {
  try {
    const jsonStr = JSON.stringify(state);
    const tempFile = LOCAL_STATE_FILE + '.tmp';

    // 1. الكتابة لملف مؤقت أولاً لحماية الملف الأصلي من التلف عند انقطاع الكهرباء
    fs.writeFileSync(tempFile, jsonStr, 'utf8');

    // 2. تحديث النسخة الاحتياطية
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      try {
        fs.copyFileSync(LOCAL_STATE_FILE, LOCAL_BACKUP_FILE);
      } catch {}
    }

    // 3. استبدال ذري (Atomic Rename) في أجزاء من الملي ثانية
    fs.renameSync(tempFile, LOCAL_STATE_FILE);
    return { success: true };
  } catch (err) {
    console.error('[LocalDB Save Error]:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db:load-state', async () => {
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      const data = fs.readFileSync(LOCAL_STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
    if (fs.existsSync(LOCAL_BACKUP_FILE)) {
      const data = fs.readFileSync(LOCAL_BACKUP_FILE, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('[LocalDB Load Error]:', err);
    return null;
  }
});

// طابور العمليات المؤجلة (Pending Offline Queue)
ipcMain.handle('local-db:save-pending', async (_event, queue) => {
  try {
    fs.writeFileSync(LOCAL_PENDING_FILE, JSON.stringify(queue), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-db:load-pending', async () => {
  try {
    if (fs.existsSync(LOCAL_PENDING_FILE)) {
      const data = fs.readFileSync(LOCAL_PENDING_FILE, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (err) {
    return [];
  }
});

ipcMain.handle('local-db:clear', async () => {
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) fs.unlinkSync(LOCAL_STATE_FILE);
    if (fs.existsSync(LOCAL_BACKUP_FILE)) fs.unlinkSync(LOCAL_BACKUP_FILE);
    if (fs.existsSync(LOCAL_PENDING_FILE)) fs.unlinkSync(LOCAL_PENDING_FILE);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// محرك التحديثات عبر الواجهة
ipcMain.handle('app-update:check', async () => {
  if (isDev) {
    return { status: 'dev_mode', message: 'التحديث التلقائي متاح في النسخة المثبتة المنتجة.' };
  }
  if (!autoUpdater) {
    return { status: 'unavailable', error: 'محرك التحديث غير مفعل.' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'ok', updateInfo: result?.updateInfo };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
});

ipcMain.handle('app-update:download', async () => {
  if (autoUpdater) {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'AutoUpdater not ready' };
});

// تطبيق التحديث وإعادة التشغيل الفوري داخل البرنامج بدون معالج تثبيت خارجي
ipcMain.handle('app-update:quit-and-install', () => {
  if (autoUpdater) {
    console.log('[AutoUpdater] Quitting and installing update now...');
    // false = لا ينتظر إغلاق التطبيق يدوياً، true = يعيد فتح البرنامج فور اكتمال التحديث
    autoUpdater.quitAndInstall(false, true);
  }
});

// ── 6. دورة حياة التطبيق (App Lifecycle) ──────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();
  setupAutoUpdater();

  // استشعار استيقاظ الحاسوب من السكون وتنبيه الواجهة للمزامنة الفورية
  try {
    powerMonitor.on('resume', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:system-resume');
      }
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
