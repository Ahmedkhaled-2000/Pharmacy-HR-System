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
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';

// منع انهيار خادم Node بسبب أي استثناءات غير متوقعة في مكتبة Baileys أو اتصالات الشبكة
process.on('uncaughtException', (err) => {
  console.error('[WhatsApp Gateway UncaughtException]:', err?.stack || err?.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[WhatsApp Gateway UnhandledRejection]:', reason?.stack || reason?.message || reason);
});
process.on('exit', (code) => {
  console.error('[WhatsApp Gateway Process Exited]: Code =', code);
});

// محرك تحويل HTML إلى ملفات PDF احترافية باستخدام متصفح Chromium المتاح على النظام
function findBrowserBinary() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function renderHtmlToPdfBuffer(htmlContent) {
  const binary = findBrowserBinary();
  if (!binary) {
    throw new Error('لم يتم العثور على متصفح Chromium (Edge أو Chrome) على النظام لتوليد الـ PDF.');
  }

  const tmpDir = os.tmpdir();
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const htmlPath = path.join(tmpDir, `payslip_${id}.html`);
  const pdfPath = path.join(tmpDir, `payslip_${id}.pdf`);

  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  return new Promise((resolve, reject) => {
    execFile(binary, [
      '--headless',
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = process.env.WA_AUTH_PATH || path.join(__dirname, 'whatsapp-auth');

if (!fs.existsSync(AUTH_DIR)) {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create AUTH_DIR:', err);
  }
}

function getLocalNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ interface: name, address: iface.address });
      }
    }
  }
  return ips;
}

const app = express();
const PORT = process.env.PORT || 3100;

// سماح بالوصول الكامل لجميع الأجهزة على الشبكة المحلية وخارجها مع دعم Private Network Access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, bypass-tunnel-reminder, accept, origin');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// حالة محرك الواتساب
let serverState = {
  status: 'DISCONNECTED', // 'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'DISCONNECTED'
  phone: '',
  deviceName: '',
  qrCodeDataUrl: '',
  sentCount: 0,
  logs: [],
  lastError: null,
  uptime: Date.now()
};

let sock = null;
let isConnecting = false;
let reconnectTimer = null;

// تنسيق وتوحيد رقم الهاتف بالصيغة الدولية لواتساب
function formatWhatsAppNumber(phone) {
  let clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return null;
  if (clean.startsWith('01') && clean.length === 11) {
    clean = '2' + clean; // الأرقام المصرية
  }
  return `${clean}@s.whatsapp.net`;
}

// دالة الاتصال بمحرك Baileys
async function connectToWhatsApp() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    if (sock) {
      try { sock.ev.removeAllListeners(); } catch {}
      try { sock.end(undefined); } catch {}
      sock = null;
    }

    console.log('[WhatsApp Gateway] 🔄 Initializing connection to WhatsApp multi-device...');
    serverState.status = 'CONNECTING';

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.windows('Desktop'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: false,
      markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. التقاط رمز الـ QR وتحديثه في الواجهة
      if (qr) {
        try {
          serverState.qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: {
              dark: '#0F172A',
              light: '#FFFFFF'
            }
          });
          serverState.status = 'QR_READY';
          serverState.lastError = null;
          console.log('[WhatsApp Gateway] 📸 Live QR Code generated successfully.');
        } catch (err) {
          console.error('[WhatsApp Gateway] QR generation error:', err);
        }
      }

      // 2. تحديث حالة الاتصال
      if (connection === 'connecting') {
        serverState.status = 'CONNECTING';
      }

      // 3. نجاح الاقتران والاتصال
      if (connection === 'open') {
        isConnecting = false;
        serverState.status = 'CONNECTED';
        serverState.qrCodeDataUrl = '';
        serverState.lastError = null;

        const rawJid = sock.user?.id || '';
        const cleanPhone = rawJid.split(':')[0].replace(/\D/g, '') || rawJid.split('@')[0];
        serverState.phone = cleanPhone;
        serverState.deviceName = sock.user?.name || `WhatsApp Linked Phone (+${cleanPhone})`;

        console.log(`[WhatsApp Gateway] 🎉 CONNECTED! Linked Phone: +${cleanPhone}`);
      }

      // 4. انقطاع الاتصال
      if (connection === 'close') {
        isConnecting = false;
        const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.status;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        console.warn(`[WhatsApp Gateway] ⚠️ Connection closed (statusCode: ${statusCode}, isLoggedOut: ${isLoggedOut})`);

        if (isLoggedOut) {
          serverState.status = 'DISCONNECTED';
          serverState.phone = '';
          serverState.deviceName = '';
          serverState.qrCodeDataUrl = '';
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch {}

          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectToWhatsApp, 2500);
        } else {
          serverState.status = 'DISCONNECTED';
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectToWhatsApp, 4000);
        }
      }
    });

  } catch (err) {
    isConnecting = false;
    serverState.status = 'DISCONNECTED';
    serverState.lastError = err.message;
    console.error('[WhatsApp Gateway] Connection initialization error:', err);

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectToWhatsApp, 5000);
  }
}

// بدء الاتصال تلقائياً
connectToWhatsApp();

// ── مسارات الـ REST API ───────────────────────────────────────────────────

// فحص الصحة (Health Check)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    waStatus: serverState.status,
    phone: serverState.phone,
    uptimeSeconds: Math.floor((Date.now() - serverState.uptime) / 1000)
  });
});

// استعلام حالة السيرفر ورمز الـ QR المباشر
app.get('/api/status', (req, res) => {
  res.json({
    status: serverState.status,
    phone: serverState.phone,
    deviceName: serverState.deviceName,
    qrCodeDataUrl: serverState.qrCodeDataUrl,
    sentCount: serverState.sentCount,
    lastError: serverState.lastError,
    timestamp: new Date().toISOString(),
    logs: serverState.logs.slice(-30)
  });
});

// نقطة فحص عناوين الشبكة المحلية لربط الأجهزة الأخرى (الموبايلات وأجهزة الصيدلية)
app.get('/api/network-info', (req, res) => {
  const ips = getLocalNetworkIps();
  const primaryIp = ips[0]?.address || '127.0.0.1';
  res.json({
    status: serverState.status,
    port: PORT,
    localIps: ips,
    primaryIp,
    suggestedLanUrl: `http://${primaryIp}:${PORT}`,
    phone: serverState.phone,
    deviceName: serverState.deviceName
  });
});

// تحويل HTML إلى PDF Base64
app.post('/api/render-pdf', async (req, res) => {
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

// إرسال رسالة فردية مع محاكاة بشرية لمكافحة الحظر ودعم PDF مباشر
app.post('/api/send-message', async (req, res) => {
  const { phone, message, pdfBase64, pdfHtml, fileName } = req.body;

  if (!phone || (!message && !pdfBase64 && !pdfHtml)) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف ونص الرسالة أو ملف PDF مطلوبان.' });
  }

  if (serverState.status !== 'CONNECTED' || !sock) {
    return res.status(503).json({
      success: false,
      error: 'خادم الواتساب غير متصل بالهاتف حالياً. يرجى مسح رمز الـ QR للاقتران أولاً.'
    });
  }

  const jid = formatWhatsAppNumber(phone);
  if (!jid) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف غير صالح.' });
  }

  try {
    // تجهيز ملف الـ PDF إما من Base64 الجاهز أو بتحويل الـ HTML فوراً
    let pdfBuffer = null;
    if (pdfBase64) {
      pdfBuffer = Buffer.from(pdfBase64, 'base64');
    } else if (pdfHtml) {
      try {
        console.log(`[WhatsApp Gateway] 📄 Rendering PDF from HTML for +${jid}...`);
        pdfBuffer = await renderHtmlToPdfBuffer(pdfHtml);
      } catch (renderErr) {
        console.error('[WhatsApp Gateway] PDF rendering error:', renderErr.message);
      }
    }

    // محاكاة كتابة بشرية (1.2 ثانية) لمنع خوارزميات الحظر
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await sock.sendPresenceUpdate('paused', jid);
    } catch {}

    let sent;
    if (pdfBuffer) {
      sent = await sock.sendMessage(jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: fileName || 'كشف_المرتب.pdf',
        caption: message || ''
      });
    } else {
      sent = await sock.sendMessage(jid, { text: message });
    }
    serverState.sentCount++;

    const logEntry = {
      id: sent.key?.id || 'WAM_' + Date.now(),
      phone: jid.split('@')[0],
      messageSnippet: (message || (pdfBuffer ? '📎 [ملف PDF مرفق]' : '')).slice(0, 60),
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      status: 'DELIVERED',
      hasPdf: Boolean(pdfBuffer)
    };
    serverState.logs.push(logEntry);

    console.log(`[WhatsApp Gateway] ✅ Sent to +${jid.split('@')[0]} ${pdfBuffer ? '📎 [مع ملف PDF]' : ''}`);
    res.json({
      success: true,
      messageId: sent.key?.id,
      phone: jid.split('@')[0],
      status: 'DELIVERED',
      hasPdf: Boolean(pdfBuffer)
    });
  } catch (err) {
    console.error(`[WhatsApp Gateway] Error sending to +${jid}:`, err);
    res.status(500).json({ success: false, error: err.message || 'فشل إرسال الرسالة عبر الواتساب.' });
  }
});

// إرسال جماعي ذكي مع طابور زمني آمن وتوليد وتضمين ملفات الـ PDF تلقائياً
app.post('/api/send-bulk', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'قائمة الرسائل فارغة.' });
  }

  if (serverState.status !== 'CONNECTED' || !sock) {
    return res.status(503).json({
      success: false,
      error: 'خادم الواتساب غير متصل بالهاتف حالياً. يرجى مسح رمز الـ QR للاقتران أولاً.'
    });
  }

  res.json({
    success: true,
    message: `بدأت عملية إرسال ${messages.length} رسالة بأمان في الخلفية مع توليد ملفات الـ PDF وفواصل مكافحة الحظر.`,
    totalCount: messages.length
  });

  // معالجة الخلفية
  (async () => {
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      const jid = formatWhatsAppNumber(item.phone);
      if (!jid) continue;

      try {
        const delayMs = 2500 + Math.floor(Math.random() * 2000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        await sock.sendPresenceUpdate('composing', jid);
        await new Promise((resolve) => setTimeout(resolve, 800));
        await sock.sendPresenceUpdate('paused', jid);

        // تجهيز ملف الـ PDF إما من Base64 أو عبر محرك Chromium
        let pdfBuffer = null;
        if (item.pdfBase64) {
          pdfBuffer = Buffer.from(item.pdfBase64, 'base64');
        } else if (item.pdfHtml) {
          try {
            console.log(`[WhatsApp Bulk] 📄 Rendering PDF for (${item.empName || jid})...`);
            pdfBuffer = await renderHtmlToPdfBuffer(item.pdfHtml);
          } catch (renderErr) {
            console.error(`[WhatsApp Bulk PDF Render Error for ${item.empName}]:`, renderErr.message);
          }
        }

        if (pdfBuffer) {
          await sock.sendMessage(jid, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: item.fileName || `كشف_مرتب_${item.empName || 'موظف'}.pdf`,
            caption: item.message || ''
          });
        } else {
          await sock.sendMessage(jid, { text: item.message });
        }
        serverState.sentCount++;

        serverState.logs.push({
          id: 'WAM_' + Date.now(),
          phone: jid.split('@')[0],
          empName: item.empName || '',
          messageSnippet: (item.message || (pdfBuffer ? '📎 [ملف PDF مرفق]' : '')).slice(0, 50),
          timestamp: new Date().toLocaleTimeString('ar-EG'),
          status: 'DELIVERED',
          hasPdf: Boolean(pdfBuffer)
        });

        console.log(`[WhatsApp Bulk] (${i + 1}/${messages.length}) Sent to ${item.empName || jid} ${pdfBuffer ? '📎 [مع PDF]' : ''}`);
      } catch (err) {
        console.error(`[WhatsApp Bulk] Error sending to ${item.empName || jid}:`, err.message);
      }
    }
  })();
});

// إعادة تشغيل الاتصال يدوياً بضغطة زر
app.post('/api/restart', async (req, res) => {
  console.log('[WhatsApp Gateway] 🔄 Manual restart requested...');
  try {
    if (sock) {
      try { sock.ev.removeAllListeners(); } catch {}
      try { sock.end(undefined); } catch {}
    }
  } catch {}
  sock = null;

  serverState.status = 'CONNECTING';
  isConnecting = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToWhatsApp, 1500);

  res.json({ success: true, message: 'جاري إعادة تهيئة واتصال خادم الواتساب...' });
});

// تسجيل الخروج وإعادة توليد رمز الاقتران لتبديل الرقم
app.post('/api/logout', async (req, res) => {
  console.log('[WhatsApp Gateway] 🚪 Logout requested to change connected phone number...');
  try {
    if (sock) {
      try { sock.ev.removeAllListeners(); } catch {}
      await Promise.race([
        sock.logout().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1500))
      ]);
      try { sock.end(undefined); } catch {}
    }
  } catch (err) {
    console.warn('[WhatsApp Gateway] Logout socket cleanup warning:', err.message);
  }
  sock = null;

  serverState.status = 'DISCONNECTED';
  serverState.phone = '';
  serverState.deviceName = '';
  serverState.qrCodeDataUrl = '';
  isConnecting = false;

  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.warn('[WhatsApp Gateway] Failed to reset AUTH_DIR:', err.message);
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToWhatsApp, 1500);

  res.json({ success: true, message: 'تم تسجيل الخروج وفك ارتباط الرقم بنجاح، وجاري توليد رمز الاقتران الجديد.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [WhatsApp Gateway] Production Baileys Engine running on http://localhost:${PORT}`);
  const ips = getLocalNetworkIps();
  if (ips.length > 0) {
    console.log('🌐 [WhatsApp Gateway] Available on local network for other devices at:');
    ips.forEach(ip => console.log(`   👉 http://${ip.address}:${PORT}`));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[WhatsApp Gateway] ⚠️ Port ${PORT} is already in use by an active instance. Gateway continues running.`);
  } else {
    console.error('[WhatsApp Gateway Server Error]:', err);
  }
});
