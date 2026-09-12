/**
 * electron/main.cjs
 * العملية الرئيسية لنظام سطح المكتب لنظام Windows
 * تشمل إدارة النوافذ، قاعدة البيانات المحلية المحمية، ومحرك التحديث التلقائي الصامت
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, powerMonitor, net, protocol, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

// ── تهيئة سويتشات الكروميوم للصلاحيات الكاملة والـ WASM ومعالجة الذاكرة ──────
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('ignore-certificate-errors');

// ── تسجيل بروتوكول app المخصص الآمن فائق السرعة لدعم نماذج الذكاء الاصطناعي و fetch محلياً ──
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      stream: true
    }
  }
]);

// محاولة استيراد electron-updater بأمان
let autoUpdater = null;
try {
  const updaterModule = require('electron-updater');
  autoUpdater = updaterModule.autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.forceDevUpdateConfig = true; // للسماح بالفحص التلقائي حتى في وضع التطوير
  autoUpdater.logger = console; // طباعة سجلات التحديث في الكونسول للمتابعة الدقيقة
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
    // فحص فوري للتحديثات بعد ثانية واحدة من ظهور النافذة
    setTimeout(() => {
      checkForAppUpdates(false);
    }, 1200);
  });

  // فحص وجود تحديثات وإرسال معلومات شبكة الواتساب فور اكتمال تحميل محتوى الواجهة التفاعلية
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      checkForAppUpdates(false);
      try {
        const netInfo = getSystemNetworkInfo();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('whatsapp:network-info', netInfo);
        }
      } catch {}
    }, 1500);
  });

  // فحص ذكي عند إعادة تركيز النافذة (Window Focus) إذا مضى أكثر من 30 ثانية
  mainWindow.on('focus', () => {
    if (Date.now() - lastUpdateCheckTime > 30 * 1000) {
      checkForAppUpdates(false);
    }
  });

  // إرسال حالة التكبير والاستعادة لواجهة المستخدم لتحديث الأيقونات بدقة
  mainWindow.on('maximize', () => {
    try { mainWindow?.webContents?.send('window:maximized-change', true); } catch {}
  });

  mainWindow.on('unmaximize', () => {
    try { mainWindow?.webContents?.send('window:maximized-change', false); } catch {}
  });

  // إرسال أحداث وضع الشاشة الكاملة (F11) لإخفاء/إظهار شريط العنوان وشريط المهام
  mainWindow.on('enter-full-screen', () => {
    try { mainWindow?.webContents?.send('window:fullscreen-change', true); } catch {}
  });

  mainWindow.on('leave-full-screen', () => {
    try { mainWindow?.webContents?.send('window:fullscreen-change', false); } catch {}
  });

  // اعتراض اختصار F11 لتحويل التطبيق لوضع ملء الشاشة الكاملة وإخفاء شريط العنوان وشريط المهام
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || input.code === 'F11')) {
      event.preventDefault();
      if (mainWindow) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
      }
    }
  });

  // السماح بكامل الصلاحيات للكاميرا ومكبر الصوت وأجهزة الوسائط لالتقاط بصمة الوجه واليد دون قيود
  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, _permission) => {
    return true;
  });

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true); // منح الصلاحيات تلقائياً وفورياً
  });

  mainWindow.webContents.session.setDevicePermissionHandler((_details) => {
    return true;
  });

  // تحميل مسار الواجهة عبر البروتوكول الآمن أو خادم التطوير
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL('app://localhost/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── 4. محرك التحديثات التلقائية فائق الدقة (In-App Auto-Updater Engine) ─────
let isCheckingForUpdate = false;
let isUpdateDownloading = false;
let lastUpdateCheckTime = 0;

function sendUpdateStatus(status, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-update:status', { status, ...payload });
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    isCheckingForUpdate = true;
    console.log('[AutoUpdater] 🔍 Checking for new updates on GitHub Releases...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    isCheckingForUpdate = false;
    isUpdateDownloading = true;
    console.log('[AutoUpdater] 🎉 Update available:', info.version);
    sendUpdateStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || 'تحديث جديد يتضمن تحسينات ومميزات وإصلاحات برمجية.'
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    isCheckingForUpdate = false;
    isUpdateDownloading = false;
    console.log('[AutoUpdater] 🟢 App is up to date.');
    sendUpdateStatus('not-available', { currentVersion: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    isUpdateDownloading = true;
    console.log(`[AutoUpdater] ⬇️ Download progress: ${progressObj.percent.toFixed(1)}%`);
    sendUpdateStatus('progress', {
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    isCheckingForUpdate = false;
    isUpdateDownloading = false;
    console.log('[AutoUpdater] ✅ Update downloaded successfully! Ready to install.');
    sendUpdateStatus('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (err) => {
    isCheckingForUpdate = false;
    isUpdateDownloading = false;
    console.error('[AutoUpdater Error]:', err.message);
    sendUpdateStatus('error', { error: err.message });
  });
}

async function checkForAppUpdates(isManual = false) {
  if (!autoUpdater) {
    console.warn('[AutoUpdater] autoUpdater module not available.');
    return { status: 'unavailable', error: 'محرك التحديث غير متوفر.' };
  }

  // منع الفحص المتزامن أثناء تنزيل التحديث أو أثناء فحص جارٍ
  if (isCheckingForUpdate || isUpdateDownloading) {
    console.log('[AutoUpdater] ⏳ Update check/download already active. Skipping duplicate check.');
    return { status: 'busy', message: 'جاري فحص أو تنزيل التحديث بالفعل.' };
  }

  // التحقق الذكي من الاتصال بالإنترنت لتفادي أخطاء الشبكة
  try {
    if (net && !net.isOnline()) {
      console.log('[AutoUpdater] 📴 Offline: network unavailable, skipping update check.');
      return { status: 'offline', message: 'لا يوجد اتصال بالإنترنت.' };
    }
  } catch {}

  try {
    isCheckingForUpdate = true;
    lastUpdateCheckTime = Date.now();
    console.log(`[AutoUpdater] 🚀 Initiating update check (${isManual ? 'Manual User Trigger' : 'Automatic Trigger'})...`);
    sendUpdateStatus('checking');
    const result = await autoUpdater.checkForUpdates();
    return { status: 'ok', updateInfo: result?.updateInfo };
  } catch (err) {
    console.warn('[AutoUpdater] Check failed:', err.message);
    sendUpdateStatus('error', { error: err.message });
    return { status: 'error', error: err.message };
  } finally {
    isCheckingForUpdate = false;
  }
}

// ── فحص دوري دقيق كل دقيقة واحدة (1 Minute Periodic Poll) ──
const AUTO_UPDATE_INTERVAL_MS = 60 * 1000; // 60 ثانية = 1 دقيقة
setInterval(() => {
  checkForAppUpdates(false);
}, AUTO_UPDATE_INTERVAL_MS);

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
ipcMain.on('window:toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});
ipcMain.on('window:set-fullscreen', (_event, flag) => {
  if (mainWindow) {
    mainWindow.setFullScreen(Boolean(flag));
  }
});
ipcMain.handle('window:is-fullscreen', () => mainWindow ? mainWindow.isFullScreen() : false);
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

// محرك التحديثات عبر الواجهة (الفحص اليدوي)
ipcMain.handle('app-update:check', async () => {
  return await checkForAppUpdates(true);
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

// قراءة ملفات نماذج الذكاء الاصطناعي وبصمة الوجه واليد مباشرة من القرص الصلب كـ Binary Buffer
ipcMain.handle('app:read-model-binary', async (_event, modelRelativePath) => {
  try {
    const cleanPath = String(modelRelativePath || '').replace(/^\/+/, '');
    const possibleDirs = [
      path.join(__dirname, '../dist'),
      path.join(__dirname, '../public'),
      path.join(process.resourcesPath || '', 'app', 'dist'),
      path.join(process.resourcesPath || '', 'dist')
    ];
    for (const dir of possibleDirs) {
      const fullPath = path.join(dir, cleanPath);
      if (fs.existsSync(fullPath)) {
        const fileBuffer = await fs.promises.readFile(fullPath);
        return fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
      }
    }
    console.warn('[IPC read-model-binary] Model file not found:', modelRelativePath);
    return null;
  } catch (err) {
    console.error('[IPC read-model-binary error]:', err);
    return null;
  }
});

// التحقق من امتلاك البرنامج لكامل صلاحيات المسؤول (Administrator Execution Status)
ipcMain.handle('app:is-admin', async () => {
  try {
    if (process.platform !== 'win32') return true;
    const { execSync } = require('child_process');
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});

// ── 5.5. إدارة خادم الواتساب التلقائي على مدار 24 ساعة (Auto 24/7 WhatsApp Gateway) ──
const http = require('http');
const os = require('os');
const { spawn, exec } = require('child_process');

function getSystemNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  const primaryIp = ips[0]?.address || '127.0.0.1';
  return {
    port: 3100,
    localIps: ips,
    primaryIp,
    suggestedLanUrl: `http://${primaryIp}:3100`
  };
}

function checkWhatsAppServerHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3100/health', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ online: res.statusCode === 200, ...json });
        } catch {
          resolve({ online: res.statusCode === 200 });
        }
      });
    });
    req.on('error', () => resolve({ online: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ online: false });
    });
  });
}

let waChildProcess = null;
let isWhatsAppServerStarting = false;
let isWhatsAppServerStarted = false;

function resolveWhatsAppServerScript() {
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'server', 'whatsapp-server.js'),
    path.join(__dirname, '../server/whatsapp-server.js'),
    path.join(process.resourcesPath || '', 'app', 'server', 'whatsapp-server.js'),
    path.join(process.resourcesPath || '', 'server', 'whatsapp-server.js'),
    path.join(app.getAppPath(), 'server', 'whatsapp-server.js')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../server/whatsapp-server.js');
}

async function startWhatsAppServerInProcess() {
  if (isWhatsAppServerStarted) return true;
  if (isWhatsAppServerStarting) return false;
  try {
    isWhatsAppServerStarting = true;
    const scriptPath = resolveWhatsAppServerScript();
    if (!fs.existsSync(scriptPath)) {
      console.warn('[WhatsApp Gateway] Script file not found for in-process start:', scriptPath);
      isWhatsAppServerStarting = false;
      return false;
    }
    const waAuthDir = path.join(userDataPath, 'whatsapp-auth');
    if (!fs.existsSync(waAuthDir)) {
      try { fs.mkdirSync(waAuthDir, { recursive: true }); } catch {}
    }
    process.env.PORT = process.env.PORT || '3100';
    process.env.WA_AUTH_PATH = process.env.WA_AUTH_PATH || waAuthDir;
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    const scriptUrl = url.pathToFileURL(scriptPath).href;
    console.log('[WhatsApp Gateway] 🚀 Starting in-process via dynamic import:', scriptUrl);
    await import(scriptUrl);
    isWhatsAppServerStarted = true;
    isWhatsAppServerStarting = false;
    console.log('[WhatsApp Gateway] ✅ In-process WhatsApp server active on port 3100.');
    return true;
  } catch (err) {
    isWhatsAppServerStarting = false;
    console.warn('[WhatsApp Gateway] In-process start failed or fell back:', err.message);
    return false;
  }
}

function launchWhatsAppServerProcess() {
  try {
    const scriptPath = resolveWhatsAppServerScript();
    if (!fs.existsSync(scriptPath)) {
      console.warn('[WhatsApp Gateway] Script not found:', scriptPath);
      return false;
    }
    console.log('[WhatsApp Gateway] 🚀 Auto-launching WhatsApp server process:', scriptPath);

    const waAuthDir = path.join(userDataPath, 'whatsapp-auth');
    if (!fs.existsSync(waAuthDir)) {
      try { fs.mkdirSync(waAuthDir, { recursive: true }); } catch {}
    }

    const env = {
      ...process.env,
      PORT: '3100',
      WA_AUTH_PATH: waAuthDir,
      NODE_ENV: 'production'
    };

    if (waChildProcess) {
      try {
        if (typeof waChildProcess.kill === 'function') waChildProcess.kill();
      } catch {}
      waChildProcess = null;
    }

    // 1. الأولوية الأولى: utilityProcess من Electron (محرك Node مدمج 100% ولا يحتاج Node.js على الويندوز)
    if (utilityProcess && typeof utilityProcess.fork === 'function') {
      try {
        console.log('[WhatsApp Gateway] Spawning via Electron utilityProcess...');
        waChildProcess = utilityProcess.fork(scriptPath, [], {
          env,
          cwd: path.dirname(scriptPath),
          stdio: 'pipe',
          serviceName: 'PharmacyHR-WhatsApp-Server'
        });

        waChildProcess.stdout?.on('data', (data) => {
          console.log(`[WhatsApp Server]: ${data}`);
        });

        waChildProcess.stderr?.on('data', (data) => {
          console.error(`[WhatsApp Server ERR]: ${data}`);
        });

        waChildProcess.on('exit', (code) => {
          console.warn(`[WhatsApp Gateway] Child process exited with code ${code}`);
          waChildProcess = null;
        });

        return true;
      } catch (errUtility) {
        console.warn('[WhatsApp Gateway] utilityProcess.fork failed, falling back to process.execPath:', errUtility.message);
      }
    }

    // 2. الأولوية الثانية: تشغيل محرك Electron كـ Node عبر process.execPath مع ELECTRON_RUN_AS_NODE=1
    try {
      console.log('[WhatsApp Gateway] Spawning via process.execPath (ELECTRON_RUN_AS_NODE)...');
      const child = spawn(process.execPath, [scriptPath], {
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        cwd: path.dirname(scriptPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false
      });
      child.unref();
      waChildProcess = child;
      return true;
    } catch (errExec) {
      console.warn('[WhatsApp Gateway] process.execPath spawn failed, falling back to node:', errExec.message);
    }

    // 3. الأولوية الثالثة: fallback على أمر node الخارجي (لبيئة التطوير)
    const child = spawn('node', [scriptPath], {
      env,
      cwd: path.dirname(scriptPath),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false
    });
    child.unref();
    waChildProcess = child;
    return true;
  } catch (err) {
    console.error('[WhatsApp Gateway Auto-Launch Error]:', err);
    return false;
  }
}

async function ensureWhatsAppServerRunning() {
  try {
    const health = await checkWhatsAppServerHealth();
    if (health.online) {
      console.log('[WhatsApp Gateway] 🟢 WhatsApp Server is already running.');
      return { success: true, alreadyRunning: true, health };
    }

    // الأولوية 1: الإقلاع الداخلي السريع (In-Process Dynamic Import)
    const inProcStarted = await startWhatsAppServerInProcess();
    if (inProcStarted) {
      await new Promise(r => setTimeout(r, 1200));
      const inProcHealth = await checkWhatsAppServerHealth();
      if (inProcHealth.online) {
        return { success: true, inProcess: true, health: inProcHealth };
      }
    }

    // الأولوية 2: الإطلاق كعملية فرعية (Sub-Process)
    const started = launchWhatsAppServerProcess();
    return { success: started, alreadyRunning: false };
  } catch (err) {
    console.error('[WhatsApp Gateway Check Error]:', err);
    return { success: false, error: err.message };
  }
}

// مراقبة دورية كل 30 ثانية لضمان بقاء خادم الواتساب قيد التشغيل وإعادة إطلاقه تلقائياً عند أي سقوط مفاجئ
setInterval(async () => {
  try {
    const health = await checkWhatsAppServerHealth();
    if (!health.online) {
      console.log('[WhatsApp Gateway Watchdog] ⚠️ Server is offline, auto-recovering...');
      ensureWhatsAppServerRunning();
    }
  } catch {}
}, 30000);

async function killAndRestartWhatsAppServer() {
  console.log('[WhatsApp Gateway] 🔄 Killing and restarting WhatsApp server...');
  return new Promise((resolve) => {
    // محاولة ناعمة لإعادة التشغيل عبر HTTP أولاً
    try {
      const postReq = http.request('http://127.0.0.1:3100/api/restart', { method: 'POST', timeout: 2500 }, (res) => {
        if (res.statusCode === 200) {
          setTimeout(async () => {
            const h = await checkWhatsAppServerHealth();
            resolve({ success: true, message: 'تمت إعادة تشغيل وتحديث اتصال الواتساب بنجاح', health: h });
          }, 1500);
          return;
        }
        hardKillAndSpawn();
      });
      postReq.on('error', () => hardKillAndSpawn());
      postReq.on('timeout', () => { postReq.destroy(); hardKillAndSpawn(); });
      postReq.end();
    } catch {
      hardKillAndSpawn();
    }

    function hardKillAndSpawn() {
      if (process.platform === 'win32') {
        exec('powershell -Command "Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', () => {
          setTimeout(async () => {
            isWhatsAppServerStarted = false;
            await ensureWhatsAppServerRunning();
            setTimeout(async () => {
              const h = await checkWhatsAppServerHealth();
              resolve({ success: true, message: 'تم إطلاق وتشغيل خادم الواتساب بنجاح', health: h });
            }, 1800);
          }, 800);
        });
      } else {
        isWhatsAppServerStarted = false;
        ensureWhatsAppServerRunning();
        setTimeout(async () => {
          const h = await checkWhatsAppServerHealth();
          resolve({ success: true, health: h });
        }, 1500);
      }
    }
  });
}

// تسجيل معالجات الـ IPC لخادم الواتساب ومعلومات الشبكة
ipcMain.handle('whatsapp:get-network-info', async () => {
  return getSystemNetworkInfo();
});

ipcMain.handle('whatsapp:get-health', async () => {
  return await checkWhatsAppServerHealth();
});

ipcMain.handle('whatsapp:get-status', async () => {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3100/api/status', { timeout: 2500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ status: 'DISCONNECTED' });
        }
      });
    });
    req.on('error', () => resolve({ status: 'DISCONNECTED' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'DISCONNECTED' }); });
  });
});

ipcMain.handle('whatsapp:restart-server', async () => {
  return await killAndRestartWhatsAppServer();
});

ipcMain.handle('whatsapp:logout', async () => {
  return new Promise((resolve) => {
    try {
      const postReq = http.request('http://127.0.0.1:3100/api/logout', { method: 'POST', timeout: 3500 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ success: true, message: 'تم تسجيل الخروج وإعادة ضبط رمز الاقتران' });
          }
        });
      });
      postReq.on('error', (err) => resolve({ success: false, error: err.message }));
      postReq.on('timeout', () => { postReq.destroy(); resolve({ success: false, error: 'Timeout' }); });
      postReq.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
});

// توليد ملف PDF مشفر كـ Base64 من كود HTML لإرفاقه مباشرة عبر الواتساب
ipcMain.handle('print:generate-pdf-base64', async (_event, htmlContent, printOptions = {}) => {
  let pdfWindow = null;
  try {
    pdfWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 1000,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      marginsType: 0,
      printBackground: true,
      pageSize: 'A4',
      landscape: false,
      ...printOptions
    });

    return {
      success: true,
      pdfBase64: pdfBuffer.toString('base64')
    };
  } catch (err) {
    console.error('[Generate PDF Base64 Error]:', err);
    return { success: false, error: err.message };
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }
  }
});

// ── 6. دورة حياة التطبيق (App Lifecycle) ──────────────────────────────────
app.whenReady().then(() => {
  // تشغيل خادم الواتساب تلقائياً في الخلفية فور إقلاع التطبيق
  ensureWhatsAppServerRunning();
  // ── تفعيل معالج بروتوكول app المحلي لخدمة ملفات المنظومة ونماذج AI محلياً ──
  try {
    protocol.handle('app', (request) => {
      try {
        const reqUrl = new URL(request.url);
        let pathname = decodeURIComponent(reqUrl.pathname);
        if (pathname.startsWith('/')) pathname = pathname.slice(1);
        if (!pathname || pathname === '/') pathname = 'index.html';

        const distDir = path.normalize(path.join(__dirname, '../dist'));
        const filePath = path.normalize(path.join(distDir, pathname));

        if (!filePath.startsWith(distDir)) {
          return new Response('Forbidden', { status: 403 });
        }

        if (fs.existsSync(filePath)) {
          return net.fetch(url.pathToFileURL(filePath).toString());
        }

        // في حال المسارات الديناميكية للـ SPA، يتم التوجيه لـ index.html
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          return net.fetch(url.pathToFileURL(indexPath).toString());
        }

        return new Response('File not found', { status: 404 });
      } catch (e) {
        console.error('[Protocol Handler Error]:', e);
        return new Response('Internal Server Error', { status: 500 });
      }
    });
  } catch (protoErr) {
    console.warn('[Protocol Handler Init Warning]:', protoErr.message);
  }

  createMainWindow();
  setupAutoUpdater();

  // استشعار استيقاظ الحاسوب من السكون وتنبيه الواجهة وفحص التحديثات الفورية
  try {
    powerMonitor.on('resume', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app:system-resume');
        setTimeout(() => {
          checkForAppUpdates(false);
        }, 2000);
      }
    });
  } catch {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  if (waChildProcess) {
    try {
      console.log('[WhatsApp Gateway] Cleaning up child process before quit...');
      if (typeof waChildProcess.kill === 'function') {
        waChildProcess.kill();
      }
    } catch {}
    waChildProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
