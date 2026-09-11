import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers
} from '@whiskeysockets/baileys';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.join(__dirname, 'whatsapp-auth');

if (!fs.existsSync(AUTH_DIR)) {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create AUTH_DIR:', err);
  }
}

const app = express();
const PORT = process.env.PORT || 3100;

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

// إرسال رسالة فردية مع محاكاة بشرية لمكافحة الحظر
app.post('/api/send-message', async (req, res) => {
  const { phone, message, pdfBase64, fileName } = req.body;

  if (!phone || (!message && !pdfBase64)) {
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
    // محاكاة كتابة بشرية (1.2 ثانية) لمنع خوارزميات الحظر
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await sock.sendPresenceUpdate('paused', jid);
    } catch {}

    let sent;
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64, 'base64');
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
      messageSnippet: (message || (pdfBase64 ? '📎 [ملف PDF مرفق]' : '')).slice(0, 60),
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      status: 'DELIVERED'
    };
    serverState.logs.push(logEntry);

    console.log(`[WhatsApp Gateway] ✅ Sent to +${jid.split('@')[0]}`);
    res.json({
      success: true,
      messageId: sent.key?.id,
      phone: jid.split('@')[0],
      status: 'DELIVERED'
    });
  } catch (err) {
    console.error(`[WhatsApp Gateway] Error sending to +${jid}:`, err);
    res.status(500).json({ success: false, error: err.message || 'فشل إرسال الرسالة عبر الواتساب.' });
  }
});

// إرسال جماعي ذكي مع طابور زمني آمن ودعم إرفاق ملفات الـ PDF
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
    message: `بدأت عملية إرسال ${messages.length} رسالة بأمان في الخلفية مع فواصل مكافحة الحظر.`,
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

        if (item.pdfBase64) {
          const pdfBuffer = Buffer.from(item.pdfBase64, 'base64');
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
          messageSnippet: (item.message || (item.pdfBase64 ? '📎 [ملف PDF مرفق]' : '')).slice(0, 50),
          timestamp: new Date().toLocaleTimeString('ar-EG'),
          status: 'DELIVERED'
        });

        console.log(`[WhatsApp Bulk] (${i + 1}/${messages.length}) Sent to ${item.empName || jid}`);
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
      try { sock.end(new Error('Manual Restart Triggered')); } catch {}
    }
  } catch {}

  serverState.status = 'CONNECTING';
  isConnecting = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToWhatsApp, 1500);

  res.json({ success: true, message: 'جاري إعادة تهيئة واتصال خادم الواتساب...' });
});

// تسجيل الخروج وإعادة توليد رمز الاقتران
app.post('/api/logout', async (req, res) => {
  console.log('[WhatsApp Gateway] 🚪 Logout requested...');
  try {
    if (sock) {
      await sock.logout();
    }
  } catch {}

  serverState.status = 'DISCONNECTED';
  serverState.phone = '';
  serverState.deviceName = '';
  serverState.qrCodeDataUrl = '';
  isConnecting = false;

  try {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {}

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToWhatsApp, 2000);

  res.json({ success: true, message: 'تم تسجيل الخروج وإعادة ضبط رمز الاقتران.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [WhatsApp Gateway] Production Baileys Engine running on http://localhost:${PORT}`);
});
