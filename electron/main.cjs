/**
 * electron/main.cjs
 * العملية الرئيسية لنظام سطح المكتب لنظام Windows
 * تشمل إدارة النوافذ، قاعدة البيانات المحلية المحمية، ومحرك التحديث التلقائي الصامت
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, powerMonitor, net, protocol, utilityProcess, shell, session, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const http = require('http');
const { execFile } = require('child_process');

// ── تسجيل معرّف التطبيق في نظام ويندوز لتثبيت إشعارات Action Center و Toast بالصوت والشعار ──
app.setAppUserModelId('com.pharmacy.hr.system');

// ── تهيئة سويتشات الكروميوم للصلاحيات الكاملة وبصمة الويندوز WebAuthn و Windows Hello ──────
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer,WebAuthentication');
app.commandLine.appendSwitch('enable-web-authentication-testing-api');
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
const DESKTOP_CONFIG_FILE = path.join(userDataPath, 'desktop_config.json');

// ── 1.2. محرك إدارة إعدادات وتخصيصات تطبيق الويندوز (Desktop Customization Config) ──
const DEFAULT_DESKTOP_CONFIG = {
  appName: 'منظومة إدارة الموارد البشرية والرواتب',
  customLogoPath: null,
  customIcoPath: null,
  zoomFactor: 0.92,
  enableNotifications: true,
  notificationSound: true,
  autoLaunch: false
};

function getDesktopConfig() {
  try {
    if (fs.existsSync(DESKTOP_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(DESKTOP_CONFIG_FILE, 'utf8'));
      const merged = { ...DEFAULT_DESKTOP_CONFIG, ...data };
      if (merged.customLogoPath && fs.existsSync(merged.customLogoPath)) {
        try {
          const imgBuf = fs.readFileSync(merged.customLogoPath);
          const ext = path.extname(merged.customLogoPath).toLowerCase();
          const mime = ext === '.ico' ? 'image/x-icon' : ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '') || 'png'}`;
          merged.logoBase64 = `data:${mime};base64,${imgBuf.toString('base64')}`;
        } catch {}
      }
      return merged;
    }
  } catch (err) {
    console.warn('[Desktop Config] Failed to read config:', err.message);
  }
  return { ...DEFAULT_DESKTOP_CONFIG };
}

function saveDesktopConfig(newConfig) {
  try {
    const current = getDesktopConfig();
    const updated = { ...current, ...newConfig };
    // لا نحفظ logoBase64 في الملف لتفادي تضخيم الـ JSON
    const toSave = { ...updated };
    delete toSave.logoBase64;
    fs.writeFileSync(DESKTOP_CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    return { success: true, config: updated };
  } catch (err) {
    console.error('[Desktop Config] Failed to save config:', err);
    return { success: false, error: err.message };
  }
}

/**
 * توليد هيكل ملف ICO قياسي متوافق مع كافة إصدارات ويندوز من بيانات PNG ثنائية
 */
function generateIcoFromPngBuffer(pngBuffer) {
  const header = Buffer.alloc(22);
  // ICONDIR
  header.writeUInt16LE(0, 0);   // Reserved
  header.writeUInt16LE(1, 2);   // ICO type: 1
  header.writeUInt16LE(1, 4);   // Count: 1 image

  // ICONDIRENTRY
  header.writeUInt8(0, 6);       // Width: 0 (256px)
  header.writeUInt8(0, 7);       // Height: 0 (256px)
  header.writeUInt8(0, 8);       // Color count: 0 (no palette)
  header.writeUInt8(0, 9);       // Reserved
  header.writeUInt16LE(1, 10);   // Color planes: 1
  header.writeUInt16LE(32, 12);  // Bits per pixel: 32
  header.writeUInt32LE(pngBuffer.length, 14); // Image size
  header.writeUInt32LE(22, 18);  // Image offset (22 bytes header)

  return Buffer.concat([header, pngBuffer]);
}

/**
 * تحويل أي ملف صورة إلى ملف .ico أصلي صالح لنظام تشغيل ويندوز واختصارات سطح المكتب
 */
function createIcoFromImage(imagePath, targetIcoPath) {
  try {
    if (!fs.existsSync(imagePath)) return false;

    if (path.extname(imagePath).toLowerCase() === '.ico') {
      fs.copyFileSync(imagePath, targetIcoPath);
      return true;
    }

    let nImg = nativeImage.createFromPath(imagePath);
    if (nImg.isEmpty()) {
      const fileBuf = fs.readFileSync(imagePath);
      nImg = nativeImage.createFromBuffer(fileBuf);
    }

    if (nImg.isEmpty()) {
      return false;
    }

    const pngBuf = nImg.resize({ width: 256, height: 256 }).toPNG();
    const icoBuf = generateIcoFromPngBuffer(pngBuf);
    fs.writeFileSync(targetIcoPath, icoBuf);
    return true;
  } catch (err) {
    console.error('[Create ICO Error]:', err);
    return false;
  }
}

/**
 * تحديث اختصارات سطح المكتب وقائمة ابدأ في نظام ويندوز باسم التطبيق وشعاره
 * وتنبيه Windows Explorer لإعادة رسم الأيقونات فوراً
 * يستخدم واجهة IShellLinkW القياسية عبر ملف UTF-8 مع BOM لضمان الدعم الكامل للأسماء العربية
 */
function updateWindowsDesktopShortcuts(customIcoPath, customAppName) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ success: true, message: 'Non-windows platform' });
    }

    try {
      const config = getDesktopConfig();
      const appName = (customAppName || config.appName || 'منظومة الموارد البشرية والرواتب').trim();

      // إنشاء مجلد آمن للملفات ومسار خالي من مشاكل الترميز
      const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
      const safeDir = path.join(localAppData, 'pharmacy-hr-system');
      if (!fs.existsSync(safeDir)) {
        try { fs.mkdirSync(safeDir, { recursive: true }); } catch {}
      }

      // تجهيز ملف الأيقونة .ico في المسار الآمن
      const safeIcoPath = path.join(safeDir, 'app_icon.ico');
      const defaultIco = path.join(__dirname, '../assets/icon.ico');
      const srcIco = (customIcoPath && fs.existsSync(customIcoPath)) ? customIcoPath : defaultIco;

      if (fs.existsSync(srcIco)) {
        try { fs.copyFileSync(srcIco, safeIcoPath); } catch {}
      }

      const finalIcoPath = fs.existsSync(safeIcoPath) ? safeIcoPath : srcIco;

      // تحديد مسار الملف التنفيذي الفعلي
      let targetExe = process.execPath;
      const installedDir = 'C:\\Program Files\\pharmacy-hr-system';
      if (!app.isPackaged && fs.existsSync(installedDir)) {
        try {
          const files = fs.readdirSync(installedDir);
          const foundExe = files.find(f => f.endsWith('.exe') && !f.startsWith('Uninstall'));
          if (foundExe) {
            targetExe = path.join(installedDir, foundExe);
          }
        } catch {}
      }

      const workingDir = path.dirname(targetExe);

      // كتابة ملف Payload بصيغة UTF-8 JSON لمنع أي مشاكل ترميز في الرموز العربية
      const payload = {
        appName,
        targetExe,
        workingDir,
        iconPath: finalIcoPath,
        description: appName
      };

      const payloadFile = path.join(safeDir, 'shortcut_sync.json');
      fs.writeFileSync(payloadFile, JSON.stringify(payload, null, 2), 'utf8');

      // سكربت PowerShell يعتمد على IShellLinkW الأصلي
      const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$payloadFile = "${payloadFile.replace(/\\/g, '\\\\')}"
if (-not (Test-Path $payloadFile)) { exit 0 }
$data = Get-Content -Raw -Path $payloadFile -Encoding UTF8 | ConvertFrom-Json

$source = @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
public class ShellLink {}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

public static class ShortcutHelper {
    public static void SaveLink(string lnkPath, string target, string workDir, string icon, string desc) {
        ShellLink link = new ShellLink();
        IShellLinkW shellLink = (IShellLinkW)link;
        shellLink.SetPath(target);
        if (!string.IsNullOrEmpty(workDir)) shellLink.SetWorkingDirectory(workDir);
        if (!string.IsNullOrEmpty(icon)) shellLink.SetIconLocation(icon, 0);
        if (!string.IsNullOrEmpty(desc)) shellLink.SetDescription(desc);
        IPersistFile file = (IPersistFile)link;
        file.Save(lnkPath, true);
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp

$userDesktop = [Environment]::GetFolderPath('Desktop')
$userPrograms = [Environment]::GetFolderPath('Programs')
$pubDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$pubPrograms = [Environment]::GetFolderPath('CommonPrograms')
$linkName = "$($data.appName).lnk"

# 1. تنظيف أي اختصارات سابقة للبرنامج على سطح مكتب المستخدم بأسماء قديمة
if (Test-Path $userDesktop) {
  Get-ChildItem -Path $userDesktop -Filter '*.lnk' | ForEach-Object {
    if ($_.Name -ne $linkName -and ($_.Name -like '*منظومة*' -or $_.Name -like '*Pharmacy*' -or $_.Name -like 'PharmaHR*')) {
      try {
        $_.Attributes = 'Normal'
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      } catch {}
    }
  }

  $userLnk = Join-Path $userDesktop $linkName
  [ShortcutHelper]::SaveLink($userLnk, $data.targetExe, $data.workingDir, $data.iconPath, $data.description)
  try { [System.IO.File]::SetLastWriteTime($userLnk, [DateTime]::Now) } catch {}
}

# 2. تحديث قائمة ابدأ الخاصة بالمستخدم
if (Test-Path $userPrograms) {
  Get-ChildItem -Path $userPrograms -Filter '*.lnk' -Recurse | ForEach-Object {
    if ($_.Name -ne $linkName -and ($_.Name -like '*منظومة*' -or $_.Name -like '*Pharmacy*' -or $_.Name -like 'PharmaHR*')) {
      try {
        $_.Attributes = 'Normal'
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      } catch {}
    }
  }

  $startLnk = Join-Path $userPrograms $linkName
  [ShortcutHelper]::SaveLink($startLnk, $data.targetExe, $data.workingDir, $data.iconPath, $data.description)
  try { [System.IO.File]::SetLastWriteTime($startLnk, [DateTime]::Now) } catch {}
}

# 3. إزالة أو تحديث أي اختصارات من سطح المكتب العام (Public Desktop)
if (Test-Path $pubDesktop) {
  Get-ChildItem -Path $pubDesktop -Filter '*.lnk' | ForEach-Object {
    if ($_.Name -ne $linkName -and ($_.Name -like '*منظومة*' -or $_.Name -like '*Pharmacy*' -or $_.Name -like 'PharmaHR*')) {
      try {
        $_.Attributes = 'Normal'
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      } catch {}
    }
  }
  $pubLnk = Join-Path $pubDesktop $linkName
  if (Test-Path $pubLnk) {
    try {
      [ShortcutHelper]::SaveLink($pubLnk, $data.targetExe, $data.workingDir, $data.iconPath, $data.description)
      [System.IO.File]::SetLastWriteTime($pubLnk, [DateTime]::Now)
    } catch {}
  }
}

# 4. إزالة أو تحديث أي اختصارات من قائمة ابدأ العامة (Common Programs)
if (Test-Path $pubPrograms) {
  Get-ChildItem -Path $pubPrograms -Filter '*.lnk' -Recurse | ForEach-Object {
    if ($_.Name -ne $linkName -and ($_.Name -like '*منظومة*' -or $_.Name -like '*Pharmacy*' -or $_.Name -like 'PharmaHR*')) {
      try {
        $_.Attributes = 'Normal'
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      } catch {}
    }
  }
  $pubStartLnk = Join-Path $pubPrograms $linkName
  if (Test-Path $pubStartLnk) {
    try {
      [ShortcutHelper]::SaveLink($pubStartLnk, $data.targetExe, $data.workingDir, $data.iconPath, $data.description)
      [System.IO.File]::SetLastWriteTime($pubStartLnk, [DateTime]::Now)
    } catch {}
  }
}

# 5. إنعاش كاش أيقونات مستكشف ملفات ويندوز فوراً
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellNotifier {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@ -ErrorAction SilentlyContinue

[ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
try { & ie4uinit.exe -show } catch {}
`;

      const psFile = path.join(safeDir, 'update_shortcuts.ps1');
      fs.writeFileSync(psFile, '\uFEFF' + psScript, 'utf8');

      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          console.warn('[Desktop Shortcuts] PowerShell error:', err.message);
          return resolve({ success: false, error: err.message });
        }
        console.log('[Desktop Shortcuts] Successfully refreshed:', appName, finalIcoPath);
        resolve({ success: true, appName, iconPath: finalIcoPath });
      });
    } catch (e) {
      console.error('[Desktop Shortcuts] Exception:', e);
      resolve({ success: false, error: e.message });
    }
  });
}

// ── 1.5. خادم الويب المحلي فائق السرعة لدعم بصمة الويندوز WebAuthn / Windows Hello ──
let localStaticServer = null;
let localStaticPort = 5858;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.webm': 'video/webm'
};

function startLocalStaticServer(distDir) {
  return new Promise((resolve) => {
    if (localStaticServer) return resolve(localStaticPort);

    localStaticServer = http.createServer((req, res) => {
      try {
        let reqPath = decodeURIComponent(url.parse(req.url).pathname || '/');
        if (reqPath === '/' || !reqPath) reqPath = '/index.html';

        let filePath = path.normalize(path.join(distDir, reqPath));
        if (!filePath.startsWith(distDir)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

        fs.readFile(filePath, (err, data) => {
          if (err) {
            const fallbackPath = path.join(distDir, 'index.html');
            if (filePath !== fallbackPath && fs.existsSync(fallbackPath)) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return fs.readFile(fallbackPath, (_fallbackErr, fallbackData) => {
                if (_fallbackErr) {
                  res.writeHead(500);
                  return res.end('Internal Server Error');
                }
                res.writeHead(200);
                res.end(fallbackData);
              });
            }
            res.writeHead(404);
            return res.end('Not Found');
          }
          res.writeHead(200);
          res.end(data);
        });
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error');
      }
    });

    localStaticServer.on('error', (err) => {
      console.warn('[LocalStaticServer] Port 5858 busy, selecting random available port:', err.message);
      localStaticServer.listen(0, '127.0.0.1', () => {
        localStaticPort = localStaticServer.address().port;
        console.log(`[LocalStaticServer] Serving dist on http://127.0.0.1:${localStaticPort}`);
        resolve(localStaticPort);
      });
    });

    localStaticServer.listen(5858, '127.0.0.1', () => {
      localStaticPort = 5858;
      console.log(`[LocalStaticServer] Serving dist on http://127.0.0.1:5858`);
      resolve(5858);
    });
  });
}

// دالة جلب البيانات المركزية المباشرة من خادم VPS السحابي
function fetchCloudDataDirect() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://63.183.147.199/api/settings?key=pharmacy-tracker-data', { timeout: 2500 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          let val = json?.value;
          if (typeof val === 'string') val = JSON.parse(val);
          resolve(val);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// التأكد من ملء قاعدة البيانات المحلية عند بدء التشغيل لمنع فتح برنامج فارغ (0 موظف)
async function ensureLocalStatePopulated() {
  try {
    let needsFetch = true;
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      try {
        const raw = fs.readFileSync(LOCAL_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.employees) && parsed.employees.length > 0) {
          needsFetch = false;
        }
      } catch {}
    }

    if (needsFetch) {
      console.log('[Desktop State] Local state empty or missing. Fetching from VPS (63.183.147.199)...');
      const cloudData = await fetchCloudDataDirect();
      if (cloudData && Array.isArray(cloudData.employees) && cloudData.employees.length > 0) {
        fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(cloudData), 'utf8');
        console.log(`[Desktop State] Successfully seeded local state with ${cloudData.employees.length} employees from VPS.`);
      }
    }
  } catch (err) {
    console.warn('[Desktop State] Could not seed from VPS at startup:', err.message);
  }
}

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
  const desktopConfig = getDesktopConfig();

  let resolvedIcon = undefined;
  if (desktopConfig.customIcoPath && fs.existsSync(desktopConfig.customIcoPath)) {
    resolvedIcon = desktopConfig.customIcoPath;
  } else if (desktopConfig.customLogoPath && fs.existsSync(desktopConfig.customLogoPath)) {
    resolvedIcon = desktopConfig.customLogoPath;
  } else {
    const iconPath = path.join(__dirname, '../assets/icon.ico');
    const fallbackIconPath = path.join(__dirname, '../assets/icon.png');
    resolvedIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIconPath) ? fallbackIconPath : undefined);
  }

  const appTitle = desktopConfig.appName || 'منظومة إدارة الموارد البشرية والرواتب';

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: appTitle,
    icon: resolvedIcon,
    backgroundColor: '#0f172a',
    frame: false, // نافذة مخصصة لإتاحة وضع عناصر شريط العنوان المكتبي بدقة (عنوان يميناً، أزرار يساراً)
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // للسماح بتحميل نماذج الذكاء الاصطناعي وبصمة الوجه وملفات WASM المحلية
      allowRunningInsecureContent: true,
      spellcheck: false,
      backgroundThrottling: false, // يمنع تجميد أو إبطاء المؤقتات واستطلاع المزامنة عند تشغيل التطبيق في الخلفية
    },
  });

  // معالجة فتح النوافذ والروابط الخارجية لمنع فتح شاشات بيضاء فارغة
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl && (targetUrl.startsWith('http:') || targetUrl.startsWith('https:'))) {
      shell.openExternal(targetUrl).catch(() => {});
    }
    return { action: 'deny' }; // منع فتح أي نوافذ Electron بيضاء فارغة نهائياً
  });

  // إخفاء شريط القوائم الافتراضي لإعطاء مظهر برمجي عالمي فخم
  Menu.setApplicationMenu(null);

  // إظهار النافذة بسلاسة بمجرد اكتمال تجهيز المحتوى الأولي
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // ضبط نسبة العرض (Zoom Factor) من الإعدادات المحفوظة
    try {
      const zoom = Number(desktopConfig.zoomFactor) || 0.92;
      mainWindow.webContents.setZoomFactor(zoom);
    } catch {}
    if (isDev) {
      // mainWindow.webContents.openDevTools();
    }
    // مزامنة ذاتية هادئة لاختصارات وأيقونة سطح المكتب بعد إقلاع التطبيق (Self-healing Desktop Shortcut Sync)
    setTimeout(async () => {
      try {
        const cfg = getDesktopConfig();
        const icoToUse = cfg.customIcoPath || cfg.customLogoPath;
        await updateWindowsDesktopShortcuts(icoToUse, cfg.appName);
      } catch (e) {
        console.warn('[Desktop Startup Sync Warning]:', e.message);
      }
    }, 2500);

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

  // معالجة فشل التحميل التلقائي والانتقال فوراً وبسلاسة إلى بروتوكول app:// المحلي
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[MainWindow did-fail-load] code: ${errorCode}, desc: ${errorDescription}, url: ${validatedURL}`);
    if (validatedURL && (validatedURL.includes('127.0.0.1') || validatedURL.includes('localhost'))) {
      console.log('[MainWindow Fallback] Switching to direct local protocol app://-/index.html ...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL('app://-/index.html').catch(e => {
            console.error('[Protocol fallback error]:', e.message);
          });
        }
      }, 300);
    }
  });

  // تحميل مسار الواجهة عبر 127.0.0.1 لدعم WebAuthn وبصمة Windows Hello بدون الاعتماد على الـ DNS
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${localStaticPort}/index.html`);
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

// المزامنة المركزية المباشرة مع خادم VPS
ipcMain.handle('cloud:sync-state', async () => {
  try {
    const cloudData = await fetchCloudDataDirect();
    if (cloudData && Array.isArray(cloudData.employees) && cloudData.employees.length > 0) {
      fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(cloudData), 'utf8');
      return { success: true, data: cloudData };
    }
    return { success: false, error: 'Empty cloud data' };
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
    path.join(app.getAppPath(), 'server', 'whatsapp-server.js'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'pharmacy-hr-system', 'resources', 'app.asar.unpacked', 'server', 'whatsapp-server.js'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'pharmacy-hr-system', 'resources', 'app.asar.unpacked', 'server', 'whatsapp-server.js'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'pharmacy-hr-system', 'resources', 'app.asar.unpacked', 'server', 'whatsapp-server.js'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'منظومة الموارد البشرية', 'resources', 'app.asar.unpacked', 'server', 'whatsapp-server.js')
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

    const unpackedNodeModules = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules');
    const localNodeModules = path.join(__dirname, '../node_modules');
    const nodePathParts = [unpackedNodeModules, localNodeModules].filter(p => fs.existsSync(p));
    if (process.env.NODE_PATH) nodePathParts.push(process.env.NODE_PATH);

    const env = {
      ...process.env,
      PORT: '3100',
      WA_AUTH_PATH: waAuthDir,
      NODE_PATH: nodePathParts.join(path.delimiter),
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

function ensureFirewallPortAllowed() {
  if (process.platform !== 'win32') return;
  try {
    exec('netsh advfirewall firewall show rule name="WhatsApp_Server_3100"', (err, stdout) => {
      if (err || !stdout || !stdout.includes('WhatsApp_Server_3100')) {
        console.log('[Firewall] WhatsApp_Server_3100 rule not found. Attempting to add inbound rule for port 3100...');
        exec('netsh advfirewall firewall add rule name="WhatsApp_Server_3100" dir=in action=allow protocol=TCP localport=3100 profile=any description="Allow incoming WhatsApp Gateway connections on port 3100"', (addErr) => {
          if (!addErr) {
            console.log('[Firewall] ✅ WhatsApp_Server_3100 inbound rule added successfully!');
          }
        });
      } else {
        console.log('[Firewall] ✅ WhatsApp_Server_3100 inbound rule is active.');
      }
    });
  } catch {}
}

async function ensureWhatsAppServerRunning() {
  try {
    const health = await checkWhatsAppServerHealth();
    if (health.online) {
      console.log('[WhatsApp Gateway] 🟢 WhatsApp Server is already running.');
      return { success: true, alreadyRunning: true, health };
    }

    if (isWhatsAppServerStarting) {
      return { success: false, busy: true };
    }
    isWhatsAppServerStarting = true;

    // 1. محاولة التشغيل كعملية فرعية مخصصة
    launchWhatsAppServerProcess();

    // فحص إتمام التشغيل مع مهلة سريعة (3 ثوانٍ)
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 800));
      const h = await checkWhatsAppServerHealth();
      if (h.online) {
        isWhatsAppServerStarting = false;
        console.log('[WhatsApp Gateway] ✅ WhatsApp Server process successfully booted.');
        return { success: true, health: h };
      }
    }

    // 2. صمام أمان فوري فائق القوة: تشغيل الخادم مباشرة داخل معالج Electron (In-Process Fallback)
    console.log('[WhatsApp Gateway] ⚡ Child process not responding yet, attempting in-process server fallback...');
    const inProcStarted = await startWhatsAppServerInProcess();
    if (inProcStarted) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 600));
        const h = await checkWhatsAppServerHealth();
        if (h.online) {
          isWhatsAppServerStarting = false;
          console.log('[WhatsApp Gateway] ✅ In-process WhatsApp server verified online on port 3100.');
          return { success: true, health: h, inProcess: true };
        }
      }
    }

    isWhatsAppServerStarting = false;
    return { success: false, health: await checkWhatsAppServerHealth() };
  } catch (err) {
    isWhatsAppServerStarting = false;
    console.error('[WhatsApp Gateway Check Error]:', err);
    return { success: false, error: err.message };
  }
}

// مراقبة دورية كل 30 ثانية لضمان بقاء خادم الواتساب قيد التشغيل وإعادة إطلاقه تلقائياً عند أي سقوط مفاجئ
setInterval(async () => {
  try {
    const health = await checkWhatsAppServerHealth();
    if (!health.online && !isWhatsAppServerStarting) {
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

ipcMain.handle('whatsapp:allow-firewall', async () => {
  ensureFirewallPortAllowed();
  return true;
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

ipcMain.handle('whatsapp:force-reset', async () => {
  return new Promise((resolve) => {
    try {
      const postReq = http.request('http://127.0.0.1:3100/api/force-reset', { method: 'POST', timeout: 4000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ success: true, message: 'تم تصفير الجلسة وتوليد رمز الاقتران الجديد' });
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

// ── 5.5. إدارة إعدادات وتخصيصات تطبيق الويندوز وإشعارات النظام (Desktop Settings & Native Windows Notifications) ──

// 1. استرجاع إعدادات المنظومة المكتبية
ipcMain.handle('desktop:get-config', async () => {
  return getDesktopConfig();
});

// 2. حفظ إعدادات المنظومة المكتبية
ipcMain.handle('desktop:save-config', async (_event, newConfig) => {
  const currentConfig = getDesktopConfig();
  const result = saveDesktopConfig(newConfig);

  if (result.success) {
    const updated = result.config;

    // تحديث عنوان نافذة البرنامج في الوقت الفعلي
    if (newConfig.appName && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(newConfig.appName);
    }

    // مزامنة وتحديث اختصار سطح المكتب والاسم فوراً وبشكل متزامن
    const icoToUse = updated.customIcoPath || updated.customLogoPath;
    try {
      await updateWindowsDesktopShortcuts(icoToUse, updated.appName);
    } catch (scErr) {
      console.warn('[Desktop Shortcuts Sync Error]:', scErr.message);
    }

    if (newConfig.autoLaunch !== undefined) {
      try {
        app.setLoginItemSettings({
          openAtLogin: Boolean(newConfig.autoLaunch),
          path: process.execPath
        });
      } catch (e) {
        console.warn('[AutoLaunch] Could not set login item settings:', e.message);
      }
    }
  }
  return result;
});

// 3. تغيير نسبة التكبير لحظياً للمعاينة في الوقت الفعلي
ipcMain.handle('desktop:set-zoom', async (_event, factor) => {
  const num = Number(factor);
  if (mainWindow && !mainWindow.isDestroyed() && !isNaN(num) && num >= 0.5 && num <= 2.5) {
    try {
      mainWindow.webContents.setZoomFactor(num);
      return { success: true, zoom: num };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Invalid zoom factor' };
});

// 4. اختيار وحفظ شعار جديد للتطبيق
ipcMain.handle('desktop:select-logo', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر شعار المنظومة الجديد',
      buttonLabel: 'تعيين كشعار للبرنامج',
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'svg', 'webp'] }
      ],
      properties: ['openFile']
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedPath = filePaths[0];
    const ext = path.extname(selectedPath) || '.png';
    const targetFile = path.join(userDataPath, `app_logo${ext}`);
    const targetIco = path.join(userDataPath, 'app_icon.ico');

    fs.copyFileSync(selectedPath, targetFile);

    // توليد ملف ICO صالح لويندوز وسطح المكتب
    createIcoFromImage(targetFile, targetIco);

    const config = getDesktopConfig();
    const updatedAppName = config.appName || 'منظومة إدارة الموارد البشرية والرواتب';

    // تحديث الإعدادات المحفوظة
    saveDesktopConfig({
      customLogoPath: targetFile,
      customIcoPath: fs.existsSync(targetIco) ? targetIco : targetFile
    });

    // تحديث اختصارات سطح المكتب وأيقونات الويندوز فوراً
    await updateWindowsDesktopShortcuts(targetIco, updatedAppName);

    // قراءة محتوى الصورة كـ Base64 ليتسنى للواجهة عرضها فوراً
    const imageBuffer = fs.readFileSync(targetFile);
    const mimeType = ext === '.ico' ? 'image/x-icon' : ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`;
    const base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    // تحديث أيقونة النافذة الحالية مباشرة
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const liveIcon = fs.existsSync(targetIco) ? targetIco : targetFile;
        mainWindow.setIcon(liveIcon);
      }
    } catch {}

    return {
      success: true,
      filePath: targetFile,
      icoPath: targetIco,
      base64Data: base64Data
    };
  } catch (err) {
    console.error('[Select Logo Error]:', err);
    return { success: false, error: err.message };
  }
});

// 5. استعادة الشعار الافتراضي للمنظومة
ipcMain.handle('desktop:reset-logo', async () => {
  try {
    const defaultIconPng = path.join(__dirname, '../assets/icon.png');
    const defaultIconIco = path.join(__dirname, '../assets/icon.ico');

    const icoFile = path.join(userDataPath, 'app_icon.ico');
    if (fs.existsSync(icoFile)) {
      try { fs.unlinkSync(icoFile); } catch {}
    }

    saveDesktopConfig({ customLogoPath: null, customIcoPath: null });

    const config = getDesktopConfig();
    await updateWindowsDesktopShortcuts(defaultIconIco, config.appName);

    try {
      if (fs.existsSync(defaultIconPng) && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIcon(defaultIconPng);
      }
    } catch {}

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 5.5. مزامنة يدوية فورية لاختصارات وأيقونة سطح المكتب
ipcMain.handle('desktop:sync-desktop-shortcut', async () => {
  try {
    const config = getDesktopConfig();
    const icoPath = (config.customIcoPath && fs.existsSync(config.customIcoPath))
      ? config.customIcoPath
      : path.join(__dirname, '../assets/icon.ico');
    const res = await updateWindowsDesktopShortcuts(icoPath, config.appName);
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 6. إعادة تشغيل نظيفة للتطبيق لتطبيق التعديلات على مستوى الويندوز
ipcMain.handle('desktop:relaunch-app', async () => {
  try {
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 7. إطلاق إشعار ويندوز أصلي (Windows Action Center & Toast Notification)
ipcMain.handle('desktop:show-notification', async (_event, { title, body, icon, silent = false }) => {
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications not supported on this platform' };
    }

    const config = getDesktopConfig();
    if (config.enableNotifications === false) {
      return { success: false, reason: 'disabled_in_settings' };
    }

    // تحديد أيقونة الإشعار
    let notifIcon = undefined;
    if (icon && typeof icon === 'string' && fs.existsSync(icon)) {
      notifIcon = icon;
    } else if (config.customLogoPath && fs.existsSync(config.customLogoPath)) {
      notifIcon = config.customLogoPath;
    } else {
      const defaultIcon = path.join(__dirname, '../assets/icon.png');
      if (fs.existsSync(defaultIcon)) notifIcon = defaultIcon;
    }

    const notifTitle = title || config.appName || 'منظومة إدارة الموارد البشرية والرواتب';
    const notifBody = body || '';
    const isSilent = silent || config.notificationSound === false;

    const notification = new Notification({
      title: notifTitle,
      body: notifBody,
      icon: notifIcon,
      silent: isSilent,
      urgency: 'normal'
    });

    // عند نقر المستخدم على الإشعار من أي مكان في نظام ويندوز يتم التركيز على نافذة البرنامج
    notification.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();
    return { success: true };
  } catch (err) {
    console.error('[Show Notification Error]:', err);
    return { success: false, error: err.message };
  }
});

// 8. فحص وتعيين التشغيل التلقائي مع إقلاع ويندوز
ipcMain.handle('desktop:get-auto-launch', async () => {
  try {
    const settings = app.getLoginItemSettings();
    return { enabled: settings.openAtLogin };
  } catch {
    return { enabled: false };
  }
});

ipcMain.handle('desktop:set-auto-launch', async (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath
    });
    saveDesktopConfig({ autoLaunch: Boolean(enabled) });
    return { success: true, enabled: Boolean(enabled) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 9. تنظيف الكاش والذاكرة المؤقتة للديسكتوب
ipcMain.handle('desktop:clear-cache', async () => {
  try {
    const ses = session.defaultSession;
    await ses.clearCache();
    await ses.clearStorageData({
      storages: ['cachestorage', 'serviceworkers', 'shadercache']
    });
    return { success: true, message: 'تم تنظيف الذاكرة المؤقتة بنجاح' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── 6. دورة حياة التطبيق (App Lifecycle) ──────────────────────────────────
app.whenReady().then(async () => {
  // تفريغ مخازن الـ Service Workers والكاش لحماية تطبيق الويندوز من الشاشة السوداء
  try {
    const ses = session.defaultSession;
    await ses.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
    console.log('[Desktop Session] Successfully cleared serviceworkers & cachestorage.');
  } catch (sesErr) {
    console.warn('[Desktop Session Clear Warning]:', sesErr.message);
  }

  // فحص وإتاحة المنفذ 3100 في جدار حماية ويندوز لربط باقي الأجهزة بالصيدلية
  ensureFirewallPortAllowed();
  // تشغيل خادم الواتساب تلقائياً في الخلفية فور إقلاع التطبيق
  ensureWhatsAppServerRunning();

  const distDir = path.normalize(path.join(__dirname, '../dist'));

  // تشغيل خادم الويب المحلي لخدمة الواجهة وتفعيل بصمة Windows Hello و WebAuthn
  if (!isDev) {
    try {
      await startLocalStaticServer(distDir);
    } catch (e) {
      console.warn('[LocalStaticServer Error]:', e.message);
    }
  }

  // التأكد من ملء قاعدة البيانات المحلية من سيرفر VPS لحماية التطبيق من الظهور بدون موظفين
  try {
    await ensureLocalStatePopulated();
  } catch (e) {
    console.warn('[LocalState Init Error]:', e.message);
  }

  // ── تفعيل معالج بروتوكول app المحلي لخدمة ملفات المنظومة ونماذج AI محلياً ──
  try {
    protocol.handle('app', (request) => {
      try {
        const reqUrl = new URL(request.url);
        let pathname = decodeURIComponent(reqUrl.pathname);
        pathname = pathname.replace(/^\/?(?:-\/)?/, '');
        if (!pathname || pathname === '/') pathname = 'index.html';

        const distDir = path.normalize(path.join(__dirname, '../dist'));
        const filePath = path.normalize(path.join(distDir, pathname));

        if (!filePath.startsWith(distDir)) {
          return new Response('Forbidden', { status: 403 });
        }

        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
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
  // الحفاظ على خادم الواتساب قيد التشغيل في الخلفية لخدمة الهواتف الذكية ومتصفحات الويب 24/7
  console.log('[WhatsApp Gateway] Electron app closing, leaving 24/7 background WhatsApp gateway active.');
  waChildProcess = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
