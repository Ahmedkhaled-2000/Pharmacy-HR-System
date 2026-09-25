import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';

// ── منع انهيار خادم Node بسبب أي استثناءات غير متوقعة في مكتبة Baileys ───────────
process.on('uncaughtException', (err) => {
  console.error('[WhatsApp Multi-Gateway UncaughtException]:', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WhatsApp Multi-Gateway UnhandledRejection]:', reason?.stack || reason?.message || reason);
});
process.on('exit', (code) => {
  console.error('[WhatsApp Multi-Gateway Process Exited]: Code =', code);
});

// ── محرك تحويل HTML إلى ملفات PDF احترافية باستخدام متصفح Chromium المتاح ────────
function findBrowserBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function renderHtmlToPdfBuffer(htmlContent) {
  const binary = findBrowserBinary();
  if (!binary) {
    throw new Error('لم يتم العثور على متصفح Chromium على النظام لتوليد الـ PDF.');
  }

  const tmpDir = os.tmpdir();
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const htmlPath = path.join(tmpDir, `payslip_${id}.html`);
  const pdfPath = path.join(tmpDir, `payslip_${id}.pdf`);

  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  return new Promise((resolve, reject) => {
    execFile(binary, [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath,
      htmlPath
    ], (err) => {
      try {
        if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
      } catch {}

      if (err) {
        try {
          if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        } catch {}
        return reject(err);
      }

      if (!fs.existsSync(pdfPath)) {
        return reject(new Error('PDF output file was not created.'));
      }

      try {
        const buffer = fs.readFileSync(pdfPath);
        fs.unlinkSync(pdfPath);
        resolve(buffer);
      } catch (readErr) {
        reject(readErr);
      }
    });
  });
}

// ── إعداد مسارات تخزين الجلسات المتعددة ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_BASE_DIR = process.env.WA_AUTH_PATH || path.join(__dirname, 'whatsapp-auth');

if (!fs.existsSync(AUTH_BASE_DIR)) {
  try {
    fs.mkdirSync(AUTH_BASE_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create AUTH_BASE_DIR:', err);
  }
}

// تطهير وتوحيد اسم الجلسة لمنع اختراق المسارات
export function sanitizeSessionId(rawId) {
  if (!rawId || typeof rawId !== 'string') return 'hr_main';
  const clean = rawId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!clean || clean === 'default' || clean === 'main') return 'hr_main';
  return clean.slice(0, 64);
}

// هجرة تلقائية ذكية: نقل ملفات الجلسة الأحادية السابقة إلى مجلد 'hr_main' دون فقدان الاقتران
function migrateLegacySessionIfNeeded() {
  try {
    const legacyCreds = path.join(AUTH_BASE_DIR, 'creds.json');
    if (fs.existsSync(legacyCreds)) {
      console.log('[WhatsApp Gateway] 🔄 Migrating legacy root session to "hr_main"...');
      const targetDir = path.join(AUTH_BASE_DIR, 'hr_main');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const entries = fs.readdirSync(AUTH_BASE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const src = path.join(AUTH_BASE_DIR, entry.name);
          const dst = path.join(targetDir, entry.name);
          try {
            fs.copyFileSync(src, dst);
            fs.unlinkSync(src);
          } catch (mErr) {
            console.warn(`[Migration Warn] ${entry.name}:`, mErr.message);
          }
        }
      }
      console.log('[WhatsApp Gateway] ✅ Legacy session successfully migrated to "hr_main".');
    }
  } catch (err) {
    console.warn('[WhatsApp Gateway Migration Warning]:', err.message);
  }
}
migrateLegacySessionIfNeeded();

// استكشاف عناوين الـ IP الخاصة بالشبكة المحلية
function getLocalNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    if (name.startsWith('docker') || name.startsWith('br-') || name.startsWith('veth')) continue;
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (/^172\.(17|18|19)\./.test(iface.address)) continue;
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  return ips;
}

// تنسيق وتوحيد رقم الهاتف بالصيغة الدولية لواتساب
function formatWhatsAppNumber(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return null;
  if (clean.startsWith('01') && clean.length === 11) {
    clean = '2' + clean; // الأرقام المصرية
  }
  return `${clean}@s.whatsapp.net`;
}

// ── فئة إدارة جلسة الواتساب المنفصلة (WhatsAppSession) ───────────────────────────
class WhatsAppSession {
  constructor(sessionId, sessionDir) {
    this.sessionId = sessionId;
    this.sessionDir = sessionDir;
    this.sock = null;
    this.status = 'DISCONNECTED'; // 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'DISCONNECTED'
    this.phone = '';
    this.deviceName = '';
    this.qrCodeDataUrl = '';
    this.sentCount = 0;
    this.logs = [];
    this.lastError = null;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.consecutiveFailures = 0;
    this.uptime = Date.now();
  }

  // تنظيف مجلد اعتمادات الجلسة
  purgeSessionDir() {
    try {
      if (fs.existsSync(this.sessionDir)) {
        const entries = fs.readdirSync(this.sessionDir);
        for (const entry of entries) {
          try {
            fs.rmSync(path.join(this.sessionDir, entry), { recursive: true, force: true });
          } catch (fileErr) {
            console.warn(`[WhatsApp:${this.sessionId}] Warning deleting ${entry}:`, fileErr.message);
          }
        }
      } else {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }
      console.log(`[WhatsApp:${this.sessionId}] 🧹 Session auth purged successfully.`);
    } catch (err) {
      console.warn(`[WhatsApp:${this.sessionId}] Warning purging sessionDir:`, err.message);
    }
  }

  // التحقق من وجود ملف creds.json سليم
  hasValidCreds() {
    try {
      const credsFile = path.join(this.sessionDir, 'creds.json');
      if (!fs.existsSync(credsFile)) return false;
      JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      return true;
    } catch {
      return false;
    }
  }

  // الاتصال بمحرك Baileys
  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      if (this.sock) {
        try { this.sock.ev.removeAllListeners(); } catch {}
        try { this.sock.end(undefined); } catch {}
        this.sock = null;
      }

      // فحص سلامة ملف الاعتمادات
      const credsFile = path.join(this.sessionDir, 'creds.json');
      if (fs.existsSync(credsFile)) {
        try {
          JSON.parse(fs.readFileSync(credsFile, 'utf8'));
        } catch {
          console.warn(`[WhatsApp:${this.sessionId}] ⚠️ Corrupted creds.json, purging session...`);
          this.purgeSessionDir();
        }
      }

      console.log(`[WhatsApp:${this.sessionId}] 🔄 Initializing connection...`);
      this.status = 'CONNECTING';

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      let waVersion = [2, 3000, 1043857760];
      try {
        const fetched = await fetchLatestBaileysVersion();
        if (fetched?.version) waVersion = fetched.version;
      } catch {}

      const sessionBrowserName = this.sessionId.startsWith('branch_')
        ? `Pharmacy Branch (${this.sessionId.replace('branch_', '')})`
        : (this.sessionId === 'procurement' ? 'Procurement Center' : 'HR Management Hub');

      this.sock = makeWASocket({
        version: waVersion,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.appropriate(sessionBrowserName),
        syncFullHistory: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        markOnlineOnConnect: true
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 1. التقاط رمز الـ QR وتوليد DataURL
        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              width: 320,
              color: {
                dark: '#0F172A',
                light: '#FFFFFF'
              }
            });
            this.status = 'QR_READY';
            this.lastError = null;
            this.consecutiveFailures = 0;
            console.log(`[WhatsApp:${this.sessionId}] 📸 QR Code ready for scan.`);
          } catch (err) {
            console.error(`[WhatsApp:${this.sessionId}] QR generation error:`, err);
          }
        }

        // 2. حالة الاتصال
        if (connection === 'connecting') {
          this.status = 'CONNECTING';
        }

        // 3. نجاح الاتصال والاقتران
        if (connection === 'open') {
          this.isConnecting = false;
          this.consecutiveFailures = 0;
          this.status = 'CONNECTED';
          this.qrCodeDataUrl = '';
          this.lastError = null;

          const rawJid = this.sock.user?.id || '';
          const cleanPhone = rawJid.split(':')[0].replace(/\D/g, '') || rawJid.split('@')[0];
          this.phone = cleanPhone;
          this.deviceName = this.sock.user?.name || `WhatsApp Linked (+${cleanPhone})`;

          console.log(`[WhatsApp:${this.sessionId}] 🎉 CONNECTED! Linked Phone: +${cleanPhone}`);
        }

        // 4. انقطاع الاتصال
        if (connection === 'close') {
          this.isConnecting = false;
          const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.status;
          const errorMessage = lastDisconnect?.error?.message || '';

          // مهلة انتهاء الـ QR (Code 408)
          if (statusCode === 408 || errorMessage.includes('QR refs') || errorMessage.includes('timed out')) {
            console.log(`[WhatsApp:${this.sessionId}] ⏱️ QR expired. Refreshing...`);
            this.consecutiveFailures = 0;
            this.status = 'QR_READY';
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 1200);
            return;
          }

          const isExplicitLoggedOut = statusCode === DisconnectReason.loggedOut;
          console.warn(`[WhatsApp:${this.sessionId}] ⚠️ Connection closed (statusCode: ${statusCode}, isLoggedOut: ${isExplicitLoggedOut})`);

          if (isExplicitLoggedOut) {
            console.warn(`[WhatsApp:${this.sessionId}] 🔄 Logged out from device. Purging session...`);
            this.status = 'DISCONNECTED';
            this.phone = '';
            this.deviceName = '';
            this.qrCodeDataUrl = '';
            this.consecutiveFailures = 0;
            this.purgeSessionDir();

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 2500);
          } else {
            this.consecutiveFailures++;
            this.status = this.phone ? 'CONNECTING' : 'DISCONNECTED';
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            const delay = Math.min(2000 * Math.max(1, this.consecutiveFailures), 15000);
            console.log(`[WhatsApp:${this.sessionId}] ⏳ Reconnecting in ${delay / 1000}s (attempt: ${this.consecutiveFailures})...`);
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
          }
        }
      });

    } catch (err) {
      this.isConnecting = false;
      this.consecutiveFailures++;
      this.status = this.phone ? 'CONNECTING' : 'DISCONNECTED';
      this.lastError = err.message;
      console.error(`[WhatsApp:${this.sessionId}] Connection initialization error:`, err);

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      const delay = Math.min(3000 * Math.max(1, this.consecutiveFailures), 20000);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
  }

  // إعادة التشغيل يدوياً
  async restart() {
    try {
      if (this.sock) {
        try { this.sock.ev.removeAllListeners(); } catch {}
        try { this.sock.end(undefined); } catch {}
      }
    } catch {}
    this.sock = null;
    this.status = 'CONNECTING';
    this.isConnecting = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 1500);
  }

  // تسجيل الخروج وفك الارتباط
  async logout() {
    try {
      if (this.sock) {
        try { this.sock.ev.removeAllListeners(); } catch {}
        await Promise.race([
          this.sock.logout().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
        try { this.sock.end(undefined); } catch {}
      }
    } catch (err) {
      console.warn(`[WhatsApp:${this.sessionId}] Logout cleanup warning:`, err.message);
    }
    this.sock = null;
    this.status = 'DISCONNECTED';
    this.phone = '';
    this.deviceName = '';
    this.qrCodeDataUrl = '';
    this.isConnecting = false;

    this.purgeSessionDir();

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 1500);
  }

  // تصفير الجلسة وتوليد رمز QR فوري
  async forceReset() {
    try {
      if (this.sock) {
        try { this.sock.ev.removeAllListeners(); } catch {}
        try { this.sock.end(undefined); } catch {}
      }
    } catch {}
    this.sock = null;
    this.status = 'CONNECTING';
    this.phone = '';
    this.deviceName = '';
    this.qrCodeDataUrl = '';
    this.lastError = null;
    this.consecutiveFailures = 0;
    this.isConnecting = false;

    this.purgeSessionDir();

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 800);
  }

  getStatusObject() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      phone: this.phone,
      deviceName: this.deviceName,
      qrCodeDataUrl: this.qrCodeDataUrl,
      sentCount: this.sentCount,
      lastError: this.lastError,
      timestamp: new Date().toISOString(),
      logs: this.logs.slice(-30)
    };
  }
}

// ── سجل الجلسات المتعددة (Multi-Session Registry) ──────────────────────────────
const sessionRegistry = new Map();

function getOrCreateSession(rawId, autoConnect = true) {
  const sessionId = sanitizeSessionId(rawId);
  if (!sessionRegistry.has(sessionId)) {
    const sessionDir = path.join(AUTH_BASE_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const session = new WhatsAppSession(sessionId, sessionDir);
    sessionRegistry.set(sessionId, session);

    if (autoConnect || session.hasValidCreds()) {
      session.connect();
    }
  }
  return sessionRegistry.get(sessionId);
}

// تشغيل الجلسات الموجودة مسبقاً تلقائياً عند إقلاع الخادم
function bootExistingSessions() {
  try {
    // 1. التأكد من وجود جلسة hr_main دائماً
    getOrCreateSession('hr_main', true);

    // 2. فحص المجلدات الفرعية في AUTH_BASE_DIR
    const entries = fs.readdirSync(AUTH_BASE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sId = sanitizeSessionId(entry.name);
        const credsFile = path.join(AUTH_BASE_DIR, entry.name, 'creds.json');
        if (fs.existsSync(credsFile)) {
          console.log(`[Session Boot] Found existing paired session: "${sId}". Auto-booting...`);
          getOrCreateSession(sId, true);
        }
      }
    }
  } catch (err) {
    console.error('[Session Boot Error]:', err.message);
  }
}
bootExistingSessions();

// ── حارس ذاتي ذكي لكل الجلسات (24/7 Watchdog Loop) ─────────────────────────────
setInterval(() => {
  for (const session of sessionRegistry.values()) {
    try {
      if (session.status !== 'CONNECTED' && !session.isConnecting && session.hasValidCreds()) {
        console.log(`[Watchdog] 🛡️ Auto-reconnecting paired session "${session.sessionId}"...`);
        session.connect();
      }
    } catch (err) {
      console.warn(`[Watchdog] Warning for "${session.sessionId}":`, err.message);
    }
  }
}, 30000);

// ── إعداد خادم Express ومسارات الـ REST API ────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3100;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, bypass-tunnel-reminder, ngrok-skip-browser-warning, accept, origin, x-session-id');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// مستخرج معرف الجلسة الذكي من الطلب
function extractSessionId(req) {
  const fromQuery = req.query?.sessionId;
  const fromBody = req.body?.sessionId;
  const fromHeader = req.headers?.['x-session-id'];
  return sanitizeSessionId(fromQuery || fromBody || fromHeader || 'hr_main');
}

// 1. فحص الصحة العام (Global Health Check)
app.get(['/health', '/api/health'], (req, res) => {
  const sessionsSummary = Array.from(sessionRegistry.values()).map(s => ({
    sessionId: s.sessionId,
    status: s.status,
    phone: s.phone,
    sentCount: s.sentCount
  }));

  res.json({
    status: 'ok',
    mode: 'multi-session',
    activeSessionsCount: sessionRegistry.size,
    sessions: sessionsSummary,
    uptimeSeconds: Math.floor((Date.now() - (sessionRegistry.get('hr_main')?.uptime || Date.now())) / 1000)
  });
});

// 2. دليل وتفاصيل جميع الجلسات النشطة (Sessions Directory)
app.get(['/sessions', '/api/sessions'], (req, res) => {
  const result = [];
  for (const session of sessionRegistry.values()) {
    result.push({
      sessionId: session.sessionId,
      status: session.status,
      phone: session.phone,
      deviceName: session.deviceName,
      sentCount: session.sentCount,
      hasQr: Boolean(session.qrCodeDataUrl)
    });
  }
  res.json({ success: true, sessions: result });
});

// 3. فحص حالة الجلسة المعنية مع إيقاظ تلقائي ورمز QR
app.get(['/status', '/api/status'], (req, res) => {
  const sId = extractSessionId(req);
  const session = getOrCreateSession(sId, true);

  if (session.status === 'DISCONNECTED' && !session.sock && !session.isConnecting) {
    console.log(`[WhatsApp:${sId}] ⚡ Dormant session probe, auto-waking up...`);
    session.connect();
  }

  res.json(session.getStatusObject());
});

// 4. استكشاف الشبكة المحلية ومعلومات الجلسة
app.get(['/network-info', '/api/network-info'], (req, res) => {
  const sId = extractSessionId(req);
  const session = getOrCreateSession(sId, false);

  const isHttps = req.headers['x-forwarded-proto'] === 'https';
  const host = req.headers['host'] || '';
  const ips = getLocalNetworkIps();
  const primaryIp = ips[0]?.address || '127.0.0.1';
  const suggestedLanUrl = (isHttps && host)
    ? `https://${host}/whatsapp`
    : (primaryIp !== '127.0.0.1' ? `http://${primaryIp}:${PORT}` : `http://127.0.0.1:${PORT}`);

  res.json({
    sessionId: sId,
    status: session.status,
    port: PORT,
    localIps: ips,
    primaryIp,
    suggestedLanUrl,
    phone: session.phone,
    deviceName: session.deviceName
  });
});

// 5. تحويل HTML إلى PDF Base64
app.post(['/render-pdf', '/api/render-pdf'], async (req, res) => {
  const { html } = req.body;
  if (!html) {
    return res.status(400).json({ success: false, error: 'كود HTML مطلوب للتحويل.' });
  }
  try {
    const pdfBuffer = await renderHtmlToPdfBuffer(html);
    res.json({
      success: true,
      pdfBase64: pdfBuffer.toString('base64'),
      size: pdfBuffer.length
    });
  } catch (err) {
    console.error('[Render PDF Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. إرسال رسالة فردية أو فاتورة PDF عبر جلسة محددة
app.post(['/send', '/api/send', '/send-message', '/api/send-message'], async (req, res) => {
  const sId = extractSessionId(req);
  const session = getOrCreateSession(sId, false);

  const { phone, message, pdfBase64, pdfHtml, fileName } = req.body;

  if (!phone || (!message && !pdfBase64 && !pdfHtml)) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف ونص الرسالة أو ملف PDF مطلوبان.' });
  }

  if (session.status !== 'CONNECTED' || !session.sock) {
    const sessionLabel = sId.startsWith('branch_')
      ? `فرع الصيدلية (#${sId.replace('branch_', '')})`
      : (sId === 'procurement' ? 'إدارة المشتريات' : 'إدارة الـ HR');

    return res.status(503).json({
      success: false,
      error: `واتساب ${sessionLabel} غير متصل بالهاتف حالياً. يرجى مسح رمز الـ QR الخاص بهذا القسم للاقتران أولاً.`,
      sessionId: sId,
      status: session.status
    });
  }

  const jid = formatWhatsAppNumber(phone);
  if (!jid) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح.' });
  }

  try {
    let pdfBuffer = null;
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, 'base64');
    } else if (pdfHtml) {
      try {
        console.log(`[WhatsApp:${sId}] 📄 Rendering PDF from HTML for +${jid}...`);
        pdfBuffer = await renderHtmlToPdfBuffer(pdfHtml);
      } catch (renderErr) {
        console.error(`[WhatsApp:${sId}] PDF rendering error:`, renderErr.message);
      }
    }

    // محاكاة كتابة بشرية لمنع خوارزميات الحظر
    try {
      await session.sock.sendPresenceUpdate('composing', jid);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await session.sock.sendPresenceUpdate('paused', jid);
    } catch {}

    let sent;
    if (pdfBuffer) {
      sent = await session.sock.sendMessage(jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName || 'مستند_رسمي.pdf',
        caption: message || ''
      });
    } else {
      sent = await session.sock.sendMessage(jid, { text: message });
    }
    session.sentCount++;

    const logEntry = {
      id: sent.key?.id || 'WAM_' + Date.now(),
      phone: jid.split('@')[0],
      messageSnippet: (message || (pdfBuffer ? '📎 [ملف PDF مرفق]' : '')).slice(0, 60),
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      status: 'DELIVERED',
      hasPdf: Boolean(pdfBuffer),
      sessionId: sId
    };
    session.logs.push(logEntry);

    console.log(`[WhatsApp:${sId}] ✅ Sent to +${jid.split('@')[0]} ${pdfBuffer ? '📎 [مع PDF]' : ''}`);
    res.json({
      success: true,
      sessionId: sId,
      messageId: sent.key?.id,
      phone: jid.split('@')[0],
      status: 'DELIVERED',
      hasPdf: Boolean(pdfBuffer)
    });
  } catch (err) {
    console.error(`[WhatsApp:${sId}] Error sending to +${jid}:`, err);
    res.status(500).json({ success: false, error: err.message || 'فشل إرسال الرسالة عبر الواتساب.' });
  }
});

// 7. إرسال جماعي ذكي مع طابور زمني آمن لجلسة محددة
app.post(['/send-bulk', '/api/send-bulk'], async (req, res) => {
  const sId = extractSessionId(req);
  const session = getOrCreateSession(sId, false);

  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'قائمة الرسائل فارغة.' });
  }

  if (session.status !== 'CONNECTED' || !session.sock) {
    return res.status(503).json({
      success: false,
      error: `خادم الواتساب (${sId}) غير متصل بالهاتف حالياً. يرجى مسح رمز الـ QR للاقتران أولاً.`
    });
  }

  res.json({
    success: true,
    sessionId: sId,
    message: `بدأت عملية إرسال ${messages.length} رسالة بأمان عبر جلسة (${sId}).`,
    totalCount: messages.length
  });

  (async () => {
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      const jid = formatWhatsAppNumber(item.phone);
      if (!jid) continue;

      try {
        const delayMs = 2500 + Math.floor(Math.random() * 2000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        await session.sock.sendPresenceUpdate('composing', jid);
        await new Promise((resolve) => setTimeout(resolve, 800));
        await session.sock.sendPresenceUpdate('paused', jid);

        let pdfBuffer = null;
        if (item.pdfBase64) {
          pdfBuffer = Buffer.from(item.pdfBase64, 'base64');
        } else if (item.pdfHtml) {
          try {
            console.log(`[WhatsApp:${sId} Bulk] 📄 Rendering PDF for (${item.empName || jid})...`);
            pdfBuffer = await renderHtmlToPdfBuffer(item.pdfHtml);
          } catch (renderErr) {
            console.error(`[WhatsApp:${sId} Bulk PDF Render Error for ${item.empName}]:`, renderErr.message);
          }
        }

        if (pdfBuffer) {
          await session.sock.sendMessage(jid, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: item.fileName || `مستند_${item.empName || 'رسمي'}.pdf`,
            caption: item.message || ''
          });
        } else {
          await session.sock.sendMessage(jid, { text: item.message });
        }
        session.sentCount++;

        session.logs.push({
          id: 'WAM_' + Date.now(),
          phone: jid.split('@')[0],
          empName: item.empName || '',
          messageSnippet: (item.message || (pdfBuffer ? '📎 [ملف PDF مرفق]' : '')).slice(0, 50),
          timestamp: new Date().toLocaleTimeString('ar-EG'),
          status: 'DELIVERED',
          hasPdf: Boolean(pdfBuffer),
          sessionId: sId
        });

        console.log(`[WhatsApp:${sId} Bulk] (${i + 1}/${messages.length}) Sent to ${item.empName || jid}`);
      } catch (err) {
        console.error(`[WhatsApp:${sId} Bulk] Error sending to ${item.empName || jid}:`, err.message);
      }
    }
  })();
});

// 8. إعادة تشغيل الجلسة المعنية يدوياً
app.post(['/restart', '/api/restart'], async (req, res) => {
  const sId = extractSessionId(req);
  console.log(`[WhatsApp:${sId}] 🔄 Manual restart requested...`);
  const session = getOrCreateSession(sId, false);
  await session.restart();
  res.json({ success: true, sessionId: sId, message: `جاري إعادة تهيئة واتصال جلسة (${sId})...` });
});

// 9. تسجيل الخروج وفك الارتباط لجلسة محددة
app.post(['/logout', '/api/logout'], async (req, res) => {
  const sId = extractSessionId(req);
  console.log(`[WhatsApp:${sId}] 🚪 Logout requested...`);
  const session = getOrCreateSession(sId, false);
  await session.logout();
  res.json({ success: true, sessionId: sId, message: `تم تسجيل الخروج وفك ارتباط الرقم لجلسة (${sId}) بنجاح.` });
});

// 10. تصفير الجلسة تماماً وتوليد رمز QR جديد فوري
app.post(['/force-reset', '/api/force-reset'], async (req, res) => {
  const sId = extractSessionId(req);
  console.log(`[WhatsApp:${sId}] ⚡ Force reset requested...`);
  const session = getOrCreateSession(sId, false);
  await session.forceReset();
  res.json({ success: true, sessionId: sId, message: `تم تصفير جلسة (${sId}) بنجاح وجاري توليد رمز الاقتران الجديد.` });
});

// ── بدء تشغيل الخادم ──────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [WhatsApp Multi-Gateway] Production Engine running on http://localhost:${PORT}`);
  console.log(`⚡ Multi-Session Architecture active with base directory: ${AUTH_BASE_DIR}`);
  const ips = getLocalNetworkIps();
  if (ips.length > 0) {
    console.log('🌐 [WhatsApp Gateway] Available on network:');
    ips.forEach(ip => console.log(`   👉 http://${ip.address}:${PORT}`));
  }
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[WhatsApp Gateway] ⚠️ Port ${PORT} is already in use by another instance.`);
    try {
      const httpModule = await import('http');
      const testReq = httpModule.default.get(`http://127.0.0.1:${PORT}/health`, { timeout: 1500 }, (testRes) => {
        if (testRes.statusCode === 200) {
          console.log(`[WhatsApp Gateway] Active healthy instance already running on port ${PORT}. Cleanly exiting duplicate.`);
          process.exit(0);
        }
      });
      testReq.on('error', () => {});
    } catch {}
  } else {
    console.error('[WhatsApp Gateway Server Error]:', err);
  }
});

export { app, server, sessionRegistry, getOrCreateSession };
