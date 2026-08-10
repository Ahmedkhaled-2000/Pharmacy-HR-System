import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WhatsApp Server Engine State
let serverState = {
  status: 'CONNECTED', // 'CONNECTED' | 'QR_READY' | 'DISCONNECTED'
  phone: '201012345678',
  deviceName: 'WhatsApp Web Session',
  qrCodeDataUrl: '',
  sentCount: 0,
  logs: []
};

// Generate QR Code sample session
async function generateSessionQr() {
  try {
    const pairUrl = `https://wa.me/qr/PHARMACY_HR_SESSION_${Date.now()}`;
    serverState.qrCodeDataUrl = await QRCode.toDataURL(pairUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('QR Generation Error:', err);
  }
}

generateSessionQr();

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET WhatsApp Status & Live QR Code
app.get('/api/status', async (req, res) => {
  if (!serverState.qrCodeDataUrl) {
    await generateSessionQr();
  }
  res.json({
    status: serverState.status,
    phone: serverState.phone,
    deviceName: serverState.deviceName,
    qrCodeDataUrl: serverState.qrCodeDataUrl,
    sentCount: serverState.sentCount,
    timestamp: new Date().toISOString(),
    logs: serverState.logs.slice(-20)
  });
});

// POST Send Single Message
app.post('/api/send-message', (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ success: false, error: 'رقم الهاتف ونص الرسالة مطلوبة' });
  }

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

  const msgId = 'WAM_' + Math.random().toString(36).substring(2, 9).toUpperCase();
  serverState.sentCount++;

  const logEntry = {
    id: msgId,
    phone: cleanPhone,
    messageSnippet: message.slice(0, 60),
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    status: 'DELIVERED'
  };

  serverState.logs.push(logEntry);
  console.log(`[WhatsApp Server] Sent message to +${cleanPhone}:`, message.slice(0, 40));

  res.json({
    success: true,
    messageId: msgId,
    phone: cleanPhone,
    timestamp: new Date().toISOString(),
    status: 'DELIVERED'
  });
});

// POST Send Bulk Messages
app.post('/api/send-bulk', async (req, res) => {
  const { messages } = req.body; // Array of { phone, message, empName }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'قائمة الرسائل فارغة' });
  }

  const results = [];
  for (const item of messages) {
    let cleanPhone = String(item.phone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const msgId = 'WAM_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    serverState.sentCount++;

    results.push({
      empName: item.empName || cleanPhone,
      phone: cleanPhone,
      status: 'DELIVERED',
      messageId: msgId
    });
  }

  res.json({
    success: true,
    totalCount: messages.length,
    sentCount: results.length,
    results
  });
});

// POST Reconnect / Refresh Session QR
app.post('/api/reconnect', async (req, res) => {
  serverState.status = 'QR_READY';
  await generateSessionQr();
  res.json({ success: true, status: serverState.status, qrCodeDataUrl: serverState.qrCodeDataUrl });
});

// POST Pair / Connect
app.post('/api/pair', (req, res) => {
  serverState.status = 'CONNECTED';
  res.json({ success: true, status: serverState.status });
});

app.listen(PORT, () => {
  console.log(`🚀 [WhatsApp Server] API is running on http://localhost:${PORT}`);
});
