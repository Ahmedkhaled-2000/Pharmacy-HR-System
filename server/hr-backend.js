/**
 * hr-backend.js
 * خادم الموارد البشرية فائق الأداء (PostgreSQL + Redis + Socket.io)
 * صُمم لتحمل الضغط العالي جداً، كثرة الاستعلامات، والتحديث اللحظي الفوري بين الأجهزة
 */

import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const STORAGE_KEY = 'pharmacy-tracker-data';

// ── 1. إعداد تطبيق Express وخادم الـ WebSockets (Socket.io) ─────────────────
const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match', 'Cache-Control', 'Pragma'],
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 15000,
  transports: ['websocket', 'polling'],
});

// ── 2. إعداد الاتصال بقاعدة بيانات PostgreSQL ──────────────────────────────
const { Pool } = pg;
const pgConfig = {
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres_hr_2026',
  max: 30, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const db = new Pool(pgConfig);

db.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]:', err.message);
});

// ── 3. إعداد الاتصال بـ Redis (In-Memory Caching & Pub/Sub) ─────────────────
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: 3,
};

let redis;
let isRedisConnected = false;

try {
  redis = new Redis(redisConfig);
  redis.on('connect', () => {
    isRedisConnected = true;
    console.log('⚡ [Redis] متصل بنجاح - الذاكرة العشوائية السريعة جاهزة (< 1ms)');
  });
  redis.on('error', (err) => {
    isRedisConnected = false;
    console.warn('⚠️ [Redis Warning] تعذر الاتصال بـ Redis، سيتم الاعتماد المباشر على PostgreSQL:', err.message);
  });
} catch (e) {
  console.warn('⚠️ [Redis Init Error]:', e.message);
}

// ── 4. تهيئة الجداول تلقائياً في PostgreSQL ─────────────────────────────────
async function initDatabaseTables() {
  try {
    const schemaSql = `
      -- 1. جدول إعدادات وحالة التطبيق (JSONB)
      CREATE TABLE IF NOT EXISTS public.app_settings (
          key VARCHAR(191) PRIMARY KEY,
          value JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_app_settings_updated ON public.app_settings (updated_at);
      CREATE INDEX IF NOT EXISTS idx_app_settings_val_gin ON public.app_settings USING GIN (value);

      -- 2. جدول البصمات الحيوية
      CREATE TABLE IF NOT EXISTS public.employee_faces (
          employee_id VARCHAR(100) PRIMARY KEY,
          descriptor JSONB NULL,
          hand_descriptor JSONB NULL,
          biometric_type VARCHAR(50) NOT NULL DEFAULT 'face',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_employee_faces_type ON public.employee_faces (biometric_type);
      CREATE INDEX IF NOT EXISTS idx_employee_faces_updated ON public.employee_faces (updated_at);

      -- 3. جدول سجلات المزامنة
      CREATE TABLE IF NOT EXISTS public.sync_logs (
          id BIGSERIAL PRIMARY KEY,
          action_type VARCHAR(50) NOT NULL,
          entity_key VARCHAR(191) NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          client_ip VARCHAR(45) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sync_logs_key_date ON public.sync_logs (entity_key, created_at DESC);
    `;

    await db.query(schemaSql);
    console.log('🐘 [PostgreSQL] الجداول الأساسية مفهرسة ومجهزة بنجاح.');
  } catch (err) {
    console.error('❌ [PostgreSQL Init Error]:', err.message);
  }
}

initDatabaseTables();

// ── 5. دوال مساعدة للكاشينج والمزامنة ─────────────────────────────────────────
async function getSettingsFromStorage(key) {
  // 1. محاولة القراءة فائقة السرعة من Redis أولاً (< 1ms)
  if (isRedisConnected && redis) {
    try {
      const cached = await redis.get(`hr:settings:${key}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('[Redis Read Warn]:', e.message);
    }
  }

  // 2. إذا لم يكن في الكاش، نقرأ من PostgreSQL
  const res = await db.query('SELECT value, version, updated_at FROM public.app_settings WHERE key = $1', [key]);
  if (res.rows.length > 0) {
    const row = res.rows[0];
    const data = row.value;

    // تحديث الكاش في Redis لاستعلامات المرات القادمة
    if (isRedisConnected && redis) {
      try {
        await redis.set(`hr:settings:${key}`, JSON.stringify(data), 'EX', 86400 * 7);
        await redis.set(`hr:version:${key}`, JSON.stringify({ version: row.version, updated_at: row.updated_at }));
      } catch {}
    }

    return data;
  }

  return null;
}

async function saveSettingsToStorage(key, value, clientIp = '127.0.0.1') {
  const jsonString = typeof value === 'string' ? value : JSON.stringify(value);
  const now = new Date().toISOString();

  // 1. حفظ دائم في PostgreSQL
  const query = `
    INSERT INTO public.app_settings (key, value, version, updated_at)
    VALUES ($1, $2::jsonb, 1, $3)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        version = public.app_settings.version + 1,
        updated_at = EXCLUDED.updated_at
    RETURNING version, updated_at;
  `;
  const res = await db.query(query, [key, jsonString, now]);
  const newVersion = res.rows[0]?.version || 1;
  const updatedAt = res.rows[0]?.updated_at || now;

  // 2. تحديث الكاش في Redis فورياً
  if (isRedisConnected && redis) {
    try {
      await redis.set(`hr:settings:${key}`, jsonString, 'EX', 86400 * 7);
      await redis.set(`hr:version:${key}`, JSON.stringify({ version: newVersion, updated_at: updatedAt }));
    } catch (e) {
      console.warn('[Redis Write Warn]:', e.message);
    }
  }

  // 3. تسجيل عملية المزامنة
  db.query(
    'INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ($1, $2, $3, $4, $5)',
    ['SAVE_STATE', key, newVersion, clientIp, now]
  ).catch(() => {});

  // 4. بث التحديث اللحظي لجميع الأجهزة والتبويبات المتصلة عبر WebSockets (< 5ms)
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  io.emit('state:updated', {
    key,
    value: payload,
    version: newVersion,
    updated_at: updatedAt,
  });

  return { success: true, version: newVersion, updated_at: updatedAt, value: payload };
}

// ── 6. مسارات الـ REST API ───────────────────────────────────────────────────

// فحص الحالة والصحة
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    const dbRes = await db.query('SELECT 1 as ok');
    dbOk = dbRes.rows.length > 0;
  } catch {}

  res.json({
    status: 'ok',
    postgres: dbOk ? 'connected' : 'error',
    redis: isRedisConnected ? 'connected (< 1ms cache)' : 'offline (postgres fallback)',
    connected_sockets: io.engine.clientsCount,
    timestamp: new Date().toISOString(),
  });
});

// جلب الإعدادات والبيانات
app.get('/api/settings', async (req, res) => {
  try {
    const key = req.query.key || STORAGE_KEY;
    const data = await getSettingsFromStorage(key);
    if (!data) {
      return res.status(200).json({ success: true, value: null });
    }
    return res.json({ success: true, value: data });
  } catch (err) {
    console.error('[API GET /settings Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// حفظ وتحديث الإعدادات والبيانات
app.post('/api/settings', async (req, res) => {
  try {
    const { key = STORAGE_KEY, value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'Missing value field' });
    }
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await saveSettingsToStorage(key, value, clientIp);
    res.json(result);
  } catch (err) {
    console.error('[API POST /settings Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// فحص الإصدار للمزامنة الخفيفة
app.get('/api/sync/version', async (req, res) => {
  try {
    const key = req.query.key || STORAGE_KEY;

    if (isRedisConnected && redis) {
      const v = await redis.get(`hr:version:${key}`);
      if (v) {
        return res.json(JSON.parse(v));
      }
    }

    const r = await db.query('SELECT version, updated_at FROM public.app_settings WHERE key = $1', [key]);
    if (r.rows.length > 0) {
      return res.json({ version: r.rows[0].version, updated_at: r.rows[0].updated_at });
    }

    res.json({ version: 0, updated_at: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 7. مسارات البصمات الحيوية (Faces / Biometrics) ───────────────────────────
app.get('/api/faces', async (req, res) => {
  try {
    const { employee_id } = req.query;
    if (employee_id) {
      const q = await db.query('SELECT * FROM public.employee_faces WHERE employee_id = $1', [employee_id]);
      return res.json({ success: true, data: q.rows[0] || null });
    }
    const q = await db.query('SELECT * FROM public.employee_faces');
    res.json({ success: true, data: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/faces', async (req, res) => {
  try {
    const { employee_id, descriptor, hand_descriptor, biometric_type = 'face' } = req.body;
    if (!employee_id) {
      return res.status(400).json({ success: false, error: 'Missing employee_id' });
    }

    const query = `
      INSERT INTO public.employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
      ON CONFLICT (employee_id) DO UPDATE
      SET descriptor = COALESCE(EXCLUDED.descriptor, public.employee_faces.descriptor),
          hand_descriptor = COALESCE(EXCLUDED.hand_descriptor, public.employee_faces.hand_descriptor),
          biometric_type = EXCLUDED.biometric_type,
          updated_at = NOW()
      RETURNING *;
    `;

    const result = await db.query(query, [
      employee_id,
      descriptor ? JSON.stringify(descriptor) : null,
      hand_descriptor ? JSON.stringify(hand_descriptor) : null,
      biometric_type,
    ]);

    // بث التحديث اللحظي للبصمة
    io.emit('face:updated', { employee_id, data: result.rows[0] });

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/faces', async (req, res) => {
  try {
    const { employee_id } = req.query;
    if (!employee_id) {
      return res.status(400).json({ success: false, error: 'Missing employee_id' });
    }
    await db.query('DELETE FROM public.employee_faces WHERE employee_id = $1', [employee_id]);
    io.emit('face:deleted', { employee_id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 8. مسارات النسخ الاحتياطي وإعادة الضبط (Backup / Reset) ───────────────────
app.post('/api/backup/export', async (req, res) => {
  try {
    const settingsRes = await db.query('SELECT * FROM public.app_settings');
    const facesRes = await db.query('SELECT * FROM public.employee_faces');
    res.json({
      export_date: new Date().toISOString(),
      app_settings: settingsRes.rows,
      employee_faces: facesRes.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/backup/import', async (req, res) => {
  try {
    const { app_settings, employee_faces } = req.body;
    if (app_settings && Array.isArray(app_settings)) {
      for (const item of app_settings) {
        await saveSettingsToStorage(item.key, item.value);
      }
    }
    if (employee_faces && Array.isArray(employee_faces)) {
      for (const face of employee_faces) {
        await db.query(
          `INSERT INTO public.employee_faces (employee_id, descriptor, hand_descriptor, biometric_type, updated_at)
           VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
           ON CONFLICT (employee_id) DO UPDATE SET descriptor = EXCLUDED.descriptor, hand_descriptor = EXCLUDED.hand_descriptor;`,
          [face.employee_id, JSON.stringify(face.descriptor), JSON.stringify(face.hand_descriptor), face.biometric_type || 'face']
        );
      }
    }
    res.json({ success: true, message: 'Backup imported successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/system/reset', async (req, res) => {
  try {
    const { key = STORAGE_KEY, state } = req.body;
    await db.query('TRUNCATE TABLE public.app_settings, public.employee_faces, public.sync_logs CASCADE');
    if (isRedisConnected && redis) {
      await redis.flushdb();
    }
    if (state) {
      await saveSettingsToStorage(key, state);
    }
    io.emit('system:reset', { key, timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'System reset completed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 9. معالجة اتصالات الـ WebSockets (Socket.io) ──────────────────────────────
io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`🔌 [Socket.io] جهاز متصل جديد: ${socket.id} (IP: ${clientIp})`);

  // طلب مزامنة فورية عند فتح التطبيق
  socket.on('sync:request', async (key = STORAGE_KEY) => {
    try {
      const data = await getSettingsFromStorage(key);
      socket.emit('sync:response', { key, value: data });
    } catch (e) {
      socket.emit('sync:error', { error: e.message });
    }
  });

  // حفظ وبث الحالة مباشرة من WebSocket
  socket.on('state:save', async ({ key = STORAGE_KEY, value }) => {
    try {
      await saveSettingsToStorage(key, value, clientIp);
    } catch (e) {
      socket.emit('state:save:error', { error: e.message });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 [Socket.io] انقطع اتصال: ${socket.id} (${reason})`);
  });
});

// ── 10. بدء تشغيل الخادم ────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log(`🚀 [HR Backend Server] يعمل بنجاح على المنفذ: ${PORT}`);
  console.log(`🔗 REST API:   http://localhost:${PORT}/api/health`);
  console.log(`⚡ WebSockets: ws://localhost:${PORT}`);
  console.log('========================================================');
});
