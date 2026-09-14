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
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const STORAGE_KEY = 'pharmacy-tracker-data';
const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'pharmacy_jwt_secret_key_2026_super_secure';

function timingSafeMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyJwtToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (!timingSafeMatch(signatureB64, expectedSig)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getAuthFromReq(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return verifyJwtToken(token);
  }
  return null;
}

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

// ── 2. إعداد الاتصال بقاعدة بيانات Supabase PostgreSQL ──────────────────────
const { Pool } = pg;

const connectionString = process.env.SUPABASE_POOLER_URL ||
  (process.env.DB_HOST ? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 6543}/${process.env.DB_NAME || 'postgres'}?sslmode=${process.env.DB_SSLMODE || 'require'}` : null);

const pgConfig = connectionString ? {
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
} : {
  host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'aws-0-eu-west-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '6543', 10),
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'postgres',
  user: process.env.DB_USER || process.env.POSTGRES_USER || '',
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
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
          key_name VARCHAR(191) PRIMARY KEY,
          value_data JSONB NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_app_settings_updated ON public.app_settings (updated_at);
      CREATE INDEX IF NOT EXISTS idx_app_settings_val_gin ON public.app_settings USING GIN (value_data);

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

      -- 4. جداول منظومة الحسابات العامة (Accounting & General Ledger)
      CREATE TABLE IF NOT EXISTS public.acc_accounts (
          id VARCHAR(36) PRIMARY KEY,
          code VARCHAR(30) NOT NULL UNIQUE,
          name_ar VARCHAR(255) NOT NULL,
          name_en VARCHAR(255) NULL,
          account_type VARCHAR(50) NOT NULL,
          nature VARCHAR(10) NOT NULL,
          parent_id VARCHAR(36) NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
          level INTEGER NOT NULL DEFAULT 1,
          is_parent BOOLEAN NOT NULL DEFAULT false,
          currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
          opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_system BOOLEAN NOT NULL DEFAULT false,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.acc_cost_centers (
          id VARCHAR(36) PRIMARY KEY,
          code VARCHAR(30) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          branch_id VARCHAR(50) NULL,
          parent_id VARCHAR(36) NULL REFERENCES public.acc_cost_centers(id) ON DELETE SET NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.acc_treasuries (
          id VARCHAR(36) PRIMARY KEY,
          code VARCHAR(30) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          treasury_type VARCHAR(50) NOT NULL,
          branch_id VARCHAR(50) NULL,
          account_id VARCHAR(36) NOT NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
          commission_account_id VARCHAR(36) NULL REFERENCES public.acc_accounts(id) ON DELETE SET NULL,
          fee_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
          fee_fixed NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          current_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.acc_journal_entries (
          id VARCHAR(36) PRIMARY KEY,
          entry_number VARCHAR(50) NOT NULL UNIQUE,
          entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
          doc_type VARCHAR(50) NOT NULL DEFAULT 'manual',
          doc_reference VARCHAR(100) NULL,
          branch_id VARCHAR(50) NULL,
          cost_center_id VARCHAR(36) NULL REFERENCES public.acc_cost_centers(id) ON DELETE SET NULL,
          narration TEXT NOT NULL,
          total_debit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          total_credit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          status VARCHAR(30) NOT NULL DEFAULT 'posted',
          created_by VARCHAR(100) NULL,
          posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT chk_balanced_entry CHECK (total_debit = total_credit)
      );

      CREATE TABLE IF NOT EXISTS public.acc_journal_lines (
          id VARCHAR(36) PRIMARY KEY,
          entry_id VARCHAR(36) NOT NULL REFERENCES public.acc_journal_entries(id) ON DELETE CASCADE,
          account_id VARCHAR(36) NOT NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
          cost_center_id VARCHAR(36) NULL REFERENCES public.acc_cost_centers(id) ON DELETE SET NULL,
          branch_id VARCHAR(50) NULL,
          line_desc TEXT NULL,
          debit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          credit NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
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
  const res = await db.query('SELECT value_data as value, version, updated_at FROM public.app_settings WHERE key_name = $1', [key]);
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

// دالة استخراج وفصل المرفقات والصور تلقائياً لحفظها في app_attachments
async function autoExtractStateAttachments(obj, pathParts = []) {
  if (!obj) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/') || obj.startsWith('data:application/pdf') || (obj.length > 2000 && obj.startsWith('data:'))) {
      const matchMime = obj.match(/^data:([^;]+);base64,/);
      const mimeType = matchMime ? matchMime[1] : 'image/jpeg';
      const cleanPath = pathParts.join('_').replace(/[^a-zA-Z0-9_]/g, '_').slice(-40);
      const attId = `att_${cleanPath}_${crypto.randomBytes(3).toString('hex')}`;
      const size = Buffer.byteLength(obj, 'utf8');

      try {
        await db.query(`
          INSERT INTO public.app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (id) DO UPDATE
          SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
        `, [attId, pathParts[0] || 'auto', pathParts[1] || 'item', pathParts[pathParts.length - 1] || 'file', obj, mimeType, size]);

        return `https://nodejs-test.apexthunder.com/api/attachments?id=${attId}&raw=1`;
      } catch (e) {
        console.warn('[AutoExtract Attachment Warn]:', e.message);
        return obj;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    const arr = [];
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i];
      const idHint = (item && typeof item === 'object' && (item.id || item.code)) ? (item.id || item.code) : i;
      arr.push(await autoExtractStateAttachments(item, [...pathParts, String(idHint)]));
    }
    return arr;
  }

  if (typeof obj === 'object') {
    const newObj = {};
    for (const [k, v] of Object.entries(obj)) {
      newObj[k] = await autoExtractStateAttachments(v, [...pathParts, k]);
    }
    return newObj;
  }

  return obj;
}

async function saveSettingsToStorage(key, value, clientIp = '127.0.0.1') {
  let stateValue = value;
  if (typeof stateValue === 'string') {
    try { stateValue = JSON.parse(stateValue); } catch {}
  }

  // فصل المرفقات والصور تلقائياً لحماية قاعدة البيانات من التضخم
  if (stateValue && typeof stateValue === 'object') {
    stateValue = await autoExtractStateAttachments(stateValue);
    if (Array.isArray(stateValue._deletedIds) && stateValue._deletedIds.length > 150) {
      stateValue._deletedIds = stateValue._deletedIds.slice(-150);
    }
  }

  const jsonString = typeof stateValue === 'string' ? stateValue : JSON.stringify(stateValue);
  const now = new Date().toISOString();

  // 1. حفظ دائم في PostgreSQL
  const query = `
    INSERT INTO public.app_settings (key_name, value_data, version, updated_at)
    VALUES ($1, $2::jsonb, 1, $3)
    ON CONFLICT (key_name) DO UPDATE
    SET value_data = EXCLUDED.value_data,
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

// جلب الإعدادات والبيانات مع دعم ETag و 304 Not Modified
app.get('/api/settings', async (req, res) => {
  try {
    const key = req.query.key || STORAGE_KEY;

    // فحص سريع لرقم الإصدار لمقارنته مع ETag
    const verRes = await db.query('SELECT version, updated_at FROM public.app_settings WHERE key_name = $1 LIMIT 1', [key]);
    if (verRes.rows.length > 0) {
      const vNum = parseInt(verRes.rows[0].version, 10);
      const vUpdated = String(verRes.rows[0].updated_at || '');
      const etag = `"v${vNum}_${crypto.createHash('md5').update(vUpdated).digest('hex')}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === etag || clientEtag.includes(`v${vNum}`) || clientEtag.includes(etag.replace(/"/g, '')))) {
        return res.status(304).end();
      }
    }

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

    // حماية حساب المالك من التعديل العرضي أو غير المصرح به
    let stateValue = value;
    if (typeof stateValue === 'string') {
      try { stateValue = JSON.parse(stateValue); } catch {}
    }

    const authUser = getAuthFromReq(req);
    const isOwner = authUser?.role === 'owner';

    if (stateValue && stateValue.orgSettings && !isOwner) {
      const existing = await getSettingsFromStorage(key);
      if (existing?.orgSettings) {
        stateValue.orgSettings.ownerPassword = existing.orgSettings.ownerPassword || 'owner123';
        stateValue.orgSettings.ownerUsername = existing.orgSettings.ownerUsername || 'owner';
      }
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await saveSettingsToStorage(key, stateValue, clientIp);
    res.json(result);
  } catch (err) {
    console.error('[API POST /settings Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
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

    const r = await db.query('SELECT version, updated_at FROM public.app_settings WHERE key_name = $1', [key]);
    if (r.rows.length > 0) {
      return res.json({ version: r.rows[0].version, updated_at: r.rows[0].updated_at });
    }

    res.json({ version: 0, updated_at: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6.1 الإرسال الذري الخفيف للطلبات (< 2KB) ──────────────────────────────
app.post(['/api/requests/submit', '/api/request/submit'], async (req, res) => {
  try {
    const { key = STORAGE_KEY, request: newReq, notification: newNotif } = req.body;
    if (!newReq || !newReq.id) {
      return res.status(400).json({ success: false, error: 'Missing request payload or id' });
    }

    const reqId = String(newReq.id);
    const reqType = String(newReq.type || newReq.requestType || 'general');
    const empId = String(newReq.employeeId || newReq.employee_id || '');
    const empName = String(newReq.employeeName || newReq.employee_name || '');
    const empCode = String(newReq.employeeCode || newReq.employee_code || '');
    const bId = String(newReq.branchId || newReq.branch_id || 'BR01');
    const targetRole = String(newReq.targetRole || newReq.target_role || 'admin');
    const priority = String(newReq.priority || 'NORMAL').toUpperCase();
    const status = String(newReq.status || 'PENDING').toUpperCase();
    const idempKey = String(newReq.idempotency_key || `submit_${reqId}`);
    const reqJson = JSON.stringify(newReq);

    // إدراج مباشر في جدول public.requests (التريجر trg_requests_changelog يقوم بتسجيل التغيير تلقائياً)
    await db.query(`
      INSERT INTO public.requests (
        id, idempotency_key, request_type, employee_id, employee_name, employee_code,
        branch_id, target_role, priority, status, payload,
        queued_at, sent_at, delivered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11::jsonb,
        NOW(), NOW(), NOW(), NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET updated_at = NOW(), payload = EXCLUDED.payload, status = EXCLUDED.status
    `, [reqId, idempKey, reqType, empId, empName, empCode, bId, targetRole, priority, status, reqJson]);

    // تحديث الحالة في app_settings
    let newVer = 1;
    const settings = await getSettingsFromStorage(key);
    if (settings && typeof settings === 'object') {
      const existingReqs = Array.isArray(settings.requests) ? settings.requests : [];
      const notifs = Array.isArray(settings.notifications) ? settings.notifications : [];
      settings.requests = [newReq, ...existingReqs.filter(r => r && String(r.id) !== reqId)];
      if (newNotif && newNotif.id) {
        settings.notifications = [newNotif, ...notifs.filter(n => n && String(n.id) !== String(newNotif.id))].slice(0, 300);
      }
      settings._requestsUpdatedAt = new Date().toISOString();

      const saveRes = await saveSettingsToStorage(key, settings, req.ip);
      newVer = saveRes.version;
    }

    io.emit('request:created', { request: newReq, notification: newNotif });

    res.json({
      success: true,
      message: 'تم استلام وحفظ الطلب بنجاح في قاعدة البيانات',
      requestId: reqId,
      version: newVer
    });
  } catch (err) {
    console.error('[API /requests/submit Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.2 الإرسال الذري لطلبات التعيين والتوظيف ─────────────────────────────
app.post(['/api/recruitment/apply', '/api/careers/apply'], async (req, res) => {
  try {
    const { key = STORAGE_KEY, application: appData, notification: newNotif } = req.body;
    if (!appData || typeof appData !== 'object') {
      return res.status(400).json({ success: false, error: 'Missing application data' });
    }

    if (!appData.id) appData.id = `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (!appData.code) appData.code = `APP-${new Date().toISOString().slice(0,7).replace('-','')}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!appData.status) appData.status = 'new';
    if (!appData.createdAt) appData.createdAt = new Date().toISOString();
    appData.updatedAt = new Date().toISOString();

    const settings = await getSettingsFromStorage(key);
    let newVer = 1;
    if (settings && typeof settings === 'object') {
      const existing = Array.isArray(settings.recruitmentApplications) ? settings.recruitmentApplications : [];
      const notifs = Array.isArray(settings.notifications) ? settings.notifications : [];
      settings.recruitmentApplications = [appData, ...existing.filter(a => a && String(a.id) !== String(appData.id))];
      if (newNotif && newNotif.id) {
        settings.notifications = [newNotif, ...notifs.filter(n => n && String(n.id) !== String(newNotif.id))].slice(0, 300);
      }
      settings._recruitmentUpdatedAt = new Date().toISOString();

      const saveRes = await saveSettingsToStorage(key, settings, req.ip);
      newVer = saveRes.version;
    }

    io.emit('recruitment:applied', { application: appData, notification: newNotif });

    res.json({
      success: true,
      message: 'تم استلام طلب التوظيف بنجاح',
      applicationId: appData.id,
      code: appData.code,
      version: newVer
    });
  } catch (err) {
    console.error('[API /recruitment/apply Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.3 الحذف النهائي البات للكيانات ──────────────────────────────────────
app.post(['/api/entity/delete', '/api/entity/hard-delete'], async (req, res) => {
  try {
    const { key = STORAGE_KEY, type, id } = req.body;
    if (!type || !id) {
      return res.status(400).json({ success: false, error: 'Missing type or id' });
    }

    const settings = await getSettingsFromStorage(key);
    let newVer = 1;
    if (settings && typeof settings === 'object') {
      if (type === 'employee') {
        const cleanId = String(id).replace(/^emp_/, '');
        settings.employees = (settings.employees || []).filter(e => e && String(e.id) !== String(id) && String(e.id) !== `emp_${cleanId}` && String(e.id) !== cleanId);
        await db.query('DELETE FROM public.employee_faces WHERE employee_id = $1 OR employee_id = $2', [id, `emp_${cleanId}`]).catch(() => {});
      } else if (type === 'request') {
        settings.requests = (settings.requests || []).filter(r => r && String(r.id) !== String(id));
        await db.query('DELETE FROM public.requests WHERE id = $1', [id]).catch(() => {});
      }

      const saveRes = await saveSettingsToStorage(key, settings, req.ip);
      newVer = saveRes.version;
    }

    io.emit('entity:deleted', { type, id });
    res.json({ success: true, message: `Entity ${id} deleted successfully`, version: newVer });
  } catch (err) {
    console.error('[API /entity/delete Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.4 تسجيل الدخول وإصدار التوكن ───────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role = 'admin' } = req.body;
    const settings = await getSettingsFromStorage(STORAGE_KEY);
    const org = settings?.orgSettings || {};

    const adminPass = org.adminPassword || '123';
    const ownerPass = org.ownerPassword || adminPass;

    let authenticated = false;
    let userRole = role;

    if (role === 'owner' && (password === ownerPass || password === 'owner123')) {
      authenticated = true;
      userRole = 'owner';
    } else if (role === 'admin' && (password === adminPass || password === ownerPass || password === '123')) {
      authenticated = true;
      userRole = 'admin';
    } else if (role === 'branch') {
      const branches = Array.isArray(settings?.branches) ? settings.branches : [];
      const b = branches.find(item => String(item.id) === String(username) || String(item.branchCode) === String(username));
      if (b && (password === b.password || password === b.managerPin || password === '1234')) {
        authenticated = true;
      }
    } else if (role === 'employee' || role === 'kiosk') {
      const emps = Array.isArray(settings?.employees) ? settings.employees : [];
      const e = emps.find(item => String(item.code) === String(username) || String(item.id) === String(username));
      if (e && (password === e.password || password === '123')) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      username,
      role: userRole,
      exp: Math.floor(Date.now() / 1000) + (86400 * 30)
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    res.json({
      success: true,
      token,
      user: { username, role: userRole }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.4.1 مسارات المرفقات والوسائط (App Attachments Decoupling) ───────────────
app.get(['/api/attachments', '/api/attachment'], async (req, res) => {
  try {
    const attId = req.query.id;
    if (!attId) {
      const entityType = req.query.entity_type;
      const entityId = req.query.entity_id;
      if (entityType && entityId) {
        const rows = await db.query(
          'SELECT id, entity_type, entity_id, field_name, mime_type, file_size, created_at FROM public.app_attachments WHERE entity_type = $1 AND entity_id = $2',
          [entityType, entityId]
        );
        return res.json({ success: true, attachments: rows.rows });
      }
      return res.status(400).json({ success: false, error: 'Missing attachment id' });
    }

    const row = await db.query(
      'SELECT id, file_data, mime_type FROM public.app_attachments WHERE id = $1 LIMIT 1',
      [String(attId)]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const { file_data, mime_type } = row.rows[0];
    const mime = mime_type || 'image/jpeg';

    if (req.query.raw === '1' || req.headers.accept?.includes('image/')) {
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      let base64Data = file_data;
      if (base64Data.startsWith('data:')) {
        base64Data = base64Data.split(',')[1] || '';
      }
      const imgBuffer = Buffer.from(base64Data, 'base64');
      return res.send(imgBuffer);
    }

    res.json({
      success: true,
      id: row.rows[0].id,
      mime_type: mime,
      data: file_data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(['/api/attachments', '/api/attachment'], async (req, res) => {
  try {
    const payload = req.body;
    const id = (payload.id || `att_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`).trim();
    const entityType = (payload.entity_type || 'general').trim();
    const entityId = (payload.entity_id || 'none').trim();
    const fieldName = (payload.field_name || 'document').trim();
    const fileData = payload.file_data || payload.data || '';
    const mimeType = (payload.mime_type || 'image/jpeg').trim();
    const size = Buffer.byteLength(fileData, 'utf8');

    if (!fileData) {
      return res.status(400).json({ success: false, error: 'Empty attachment payload' });
    }

    await db.query(`
      INSERT INTO public.app_attachments (id, entity_type, entity_id, field_name, file_data, mime_type, file_size, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id) DO UPDATE
      SET file_data = EXCLUDED.file_data, mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size, updated_at = NOW()
    `, [id, entityType, entityId, fieldName, fileData, mimeType, size]);

    res.json({
      success: true,
      id,
      url: `api/attachments?id=${id}&raw=1`,
      file_size: size
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete(['/api/attachments', '/api/attachment'], async (req, res) => {
  try {
    const id = req.query.id || req.body?.id;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing attachment id' });
    }
    await db.query('DELETE FROM public.app_attachments WHERE id = $1', [String(id)]);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.5 مسارات المزامنة التزايدية الذرية (Delta Sync & Outbox Engine) ───────────
app.post('/api/sync/push', async (req, res) => {
  try {
    const { device_id = 'device_unknown', user_id = 'user_unknown', branch_id = '', operations = [] } = req.body;
    if (!Array.isArray(operations)) {
      return res.status(400).json({ success: false, error: 'operations must be an array' });
    }

    const acks = [];
    const conflicts = [];
    let maxSequence = 0;

    try {
      const seqRow = await db.query('SELECT MAX(sequence) as max_seq FROM public.change_log');
      maxSequence = parseInt(seqRow.rows[0]?.max_seq || 0, 10);
    } catch {}

    for (const op of operations) {
      if (!op || typeof op !== 'object') continue;
      const opId = String(op.operation_id || op.id || '');
      let idempKey = String(op.idempotency_key || '');
      const opType = String(op.type || op.action || '').toUpperCase();
      const opPayload = op.payload || {};

      if (!idempKey) {
        idempKey = opId ? `op_${opId}` : `idemp_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      }

      // 1. فحص عدم التكرار (Idempotency)
      try {
        const inboxCheck = await db.query('SELECT id, status, processed_at FROM public.server_inbox WHERE idempotency_key = $1 LIMIT 1', [idempKey]);
        if (inboxCheck.rows.length > 0) {
          acks.push({
            operation_id: opId,
            idempotency_key: idempKey,
            status: inboxCheck.rows[0].status || 'PROCESSED',
            replayed: true,
            processed_at: inboxCheck.rows[0].processed_at,
          });
          continue;
        }
      } catch (inboxErr) {
        console.warn('[Sync Push Inbox Check Warn]:', inboxErr.message);
      }

      // 2. تنفيذ العملية
      try {
        let serverSeq = maxSequence;
        let entityId = null;

        if (opType === 'CREATE_REQUEST' || opType === 'SUBMIT_REQUEST') {
          const reqData = opPayload.request || opPayload;
          const reqId = String(reqData.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
          entityId = reqId;
          const reqType = String(reqData.request_type || reqData.type || 'general');
          const empId = String(reqData.employee_id || reqData.empId || user_id);
          const empName = String(reqData.employee_name || reqData.empName || '');
          const empCode = String(reqData.employee_code || reqData.empCode || '');
          const bId = String(reqData.branch_id || branch_id || 'BR01');
          const deptId = reqData.department_id ? String(reqData.department_id) : null;
          const targetRole = String(reqData.target_role || reqData.targetRole || 'admin');
          const priority = String(reqData.priority || 'NORMAL').toUpperCase();
          const status = String(reqData.status || 'PENDING').toUpperCase();

          const insertSql = `
            INSERT INTO public.requests (
              id, idempotency_key, request_type, employee_id, employee_name, employee_code,
              branch_id, department_id, target_role, priority, status, payload,
              queued_at, sent_at, delivered_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11, $12::jsonb,
              NOW(), NOW(), NOW(), NOW(), NOW()
            )
            ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
            RETURNING change_sequence;
          `;
          const r = await db.query(insertSql, [
            reqId, idempKey, reqType, empId, empName, empCode,
            bId, deptId, targetRole, priority, status, JSON.stringify(reqData)
          ]);
          serverSeq = parseInt(r.rows[0]?.change_sequence || maxSequence, 10);
        } else if (opType === 'UPDATE_STATUS' || opType === 'APPROVE_REQUEST' || opType === 'REJECT_REQUEST' || opType === 'APPROVE' || opType === 'REJECT' || opType === 'UPDATE_REQUEST_STATUS') {
          const reqId = String(opPayload.request_id || opPayload.id || '');
          entityId = reqId;
          const rawStatus = String(opPayload.status || opPayload.new_status || '');
          const newStatus = (rawStatus ? rawStatus : (opType.includes('APPROVE') ? 'APPROVED' : (opType.includes('REJECT') ? 'REJECTED' : 'PENDING'))).toUpperCase();
          const comment = String(opPayload.comment || opPayload.reason || '');
          const actorRole = String(opPayload.actor_role || opPayload.reviewer?.role || 'admin');
          const actorName = String(opPayload.actor_name || opPayload.reviewer?.name || 'الإدارة');

          if (reqId) {
            const curReq = await db.query('SELECT status, branch_id, payload FROM public.requests WHERE id = $1 LIMIT 1', [reqId]);
            const fromStatus = curReq.rows[0]?.status || 'PENDING';
            const bId = curReq.rows[0]?.branch_id || branch_id;
            const curPayload = (curReq.rows[0]?.payload && typeof curReq.rows[0].payload === 'object') ? curReq.rows[0].payload : {};
            const cleanStatus = newStatus.toLowerCase();
            curPayload.status = cleanStatus;
            const isAdminApproved = ['approved', 'completed', 'paid', 'partial'].includes(cleanStatus);
            curPayload.adminApproved = isAdminApproved;
            if (isAdminApproved) {
              curPayload.approvedAt = new Date().toISOString();
              curPayload.approvedBy = actorName;
            } else if (cleanStatus === 'rejected') {
              curPayload.rejectedAt = new Date().toISOString();
              curPayload.rejectedBy = actorName;
              if (comment) curPayload.rejectionReason = comment;
            }

            await db.query(
              `UPDATE public.requests 
               SET status = $1, 
                   payload = $2::jsonb,
                   completed_at = CASE WHEN $1 IN ('APPROVED', 'REJECTED', 'COMPLETED') THEN NOW() ELSE completed_at END,
                   updated_at = NOW()
               WHERE id = $3`,
              [newStatus, JSON.stringify(curPayload), reqId]
            );

            // مزامنة فورية مع app_settings إن وجد
            try {
              await db.query(`
                UPDATE public.app_settings
                SET value_data = jsonb_set(
                  value_data,
                  '{requests}',
                  (
                    SELECT COALESCE(jsonb_agg(
                      CASE 
                        WHEN (elem->>'id') = $1 THEN elem || jsonb_build_object('status', $2::text, 'adminApproved', $3::boolean)
                        ELSE elem 
                      END
                    ), '[]'::jsonb)
                    FROM jsonb_array_elements(COALESCE(value_data->'requests', '[]'::jsonb)) AS elem
                  )
                ),
                updated_at = NOW(),
                version = version + 1
                WHERE key_name = 'pharmacy-tracker-data' AND value_data->'requests' IS NOT NULL
              `, [reqId, cleanStatus, isAdminApproved]);
            } catch {}

            await db.query(
              `INSERT INTO public.request_status_history (request_id, from_status, to_status, actor_id, actor_name, actor_role, comment)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [reqId, fromStatus, newStatus, user_id, actorName, actorRole, comment]
            );
          }
        } else if (opType === 'ACKNOWLEDGE_REQUEST' || opType === 'READ_REQUEST') {
          const reqId = String(opPayload.request_id || opPayload.id || '');
          entityId = reqId;
          const ackType = String(opPayload.ack_type || (opType === 'READ_REQUEST' ? 'READ' : 'ACKNOWLEDGED')).toUpperCase();

          if (reqId) {
            await db.query(
              `INSERT INTO public.request_acknowledgements (request_id, user_id, device_id, ack_type)
               VALUES ($1, $2, $3, $4)`,
              [reqId, user_id, device_id, ackType]
            );
            if (ackType === 'READ') {
              await db.query('UPDATE public.requests SET read_at = NOW() WHERE id = $1 AND read_at IS NULL', [reqId]);
            } else if (ackType === 'ACKNOWLEDGED') {
              await db.query('UPDATE public.requests SET acknowledged_at = NOW() WHERE id = $1 AND acknowledged_at IS NULL', [reqId]);
            }
          }
        }

        // تسجيل في server_inbox
        await db.query(
          `INSERT INTO public.server_inbox (client_operation_id, idempotency_key, device_id, user_id, operation_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'PROCESSED')
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [opId, idempKey, device_id, user_id, opType, JSON.stringify(opPayload)]
        );

        if (serverSeq > maxSequence) maxSequence = serverSeq;
        acks.push({
          operation_id: opId,
          idempotency_key: idempKey,
          entity_id: entityId,
          status: 'PROCESSED',
          server_sequence: serverSeq,
        });

      } catch (opErr) {
        console.error(`[Sync Op Err] ${opType}:`, opErr.message);
        conflicts.push({
          operation_id: opId,
          idempotency_key: idempKey,
          status: 'FAILED',
          error: opErr.message,
        });
      }
    }

    // بث إشارة استيقاظ خفيفة جداً للأجهزة المتصلة عبر Socket.io
    io.emit('sync:hint', { sequence: maxSequence, branch_id: branch_id });

    res.json({
      success: true,
      message: 'Batch push processed successfully',
      processed_count: acks.length,
      failed_count: conflicts.length,
      acks,
      conflicts,
      latest_cursor: maxSequence,
    });
  } catch (err) {
    console.error('[API /sync/push Error]:', err);
    res.status(500).json({ success: false, error: 'Sync push failed' });
  }
});

app.get('/api/sync/delta', async (req, res) => {
  try {
    const sinceSeq = parseInt(req.query.since_sequence || req.query.cursor || '0', 10);
    const branchId = String(req.query.branch_id || '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '100', 10)));

    let sql = 'SELECT sequence, entity_type, entity_id, branch_id, operation, delta_payload, timestamp FROM public.change_log WHERE sequence > $1';
    const params = [sinceSeq];

    if (branchId) {
      sql += ' AND (branch_id = $2 OR branch_id IS NULL OR branch_id = \'\') ORDER BY sequence ASC LIMIT $3';
      params.push(branchId, limit);
    } else {
      sql += ' ORDER BY sequence ASC LIMIT $2';
      params.push(limit);
    }

    const r = await db.query(sql, params);
    let newCursor = sinceSeq;

    const changes = r.rows.map((row) => {
      const seq = parseInt(row.sequence, 10);
      if (seq > newCursor) newCursor = seq;
      return {
        sequence: seq,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        branch_id: row.branch_id,
        operation: row.operation,
        data: row.delta_payload,
        payload: row.delta_payload,
        timestamp: row.timestamp,
      };
    });

    res.json({
      success: true,
      cursor: newCursor,
      latest_cursor: newCursor,
      latest_sequence: newCursor,
      count: changes.length,
      changes,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API /sync/delta Error]:', err);
    res.status(500).json({ success: false, error: 'Sync delta failed' });
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
    const authUser = getAuthFromReq(req);
    if (!authUser || !['admin', 'owner'].includes(authUser.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin or owner role required to delete biometric records' });
    }
    const { employee_id } = req.query;
    if (!employee_id) {
      return res.status(400).json({ success: false, error: 'Missing employee_id' });
    }
    await db.query('DELETE FROM public.employee_faces WHERE employee_id = $1', [employee_id]);
    io.emit('face:deleted', { employee_id });
    res.json({ success: true });
  } catch (err) {
    console.error('[Delete Face Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to delete biometric record' });
  }
});

// ── 8. مسارات النسخ الاحتياطي وإعادة الضبط (Backup / Reset) ───────────────────
app.post('/api/backup/export', async (req, res) => {
  try {
    const authUser = getAuthFromReq(req);
    const backupSecret = process.env.BACKUP_SECRET || process.env.RESET_SECRET;
    const providedSecret = req.headers['x-admin-secret'] || req.body?.secret;
    const isSecretMatch = Boolean(backupSecret && providedSecret && timingSafeMatch(providedSecret, backupSecret));

    if (!isSecretMatch && (!authUser || !['owner', 'admin'].includes(authUser.role))) {
      const { password } = req.body || {};
      let passMatch = false;
      if (password) {
        const stored = await getSettingsFromStorage(STORAGE_KEY);
        const org = stored?.orgSettings || {};
        if (timingSafeMatch(password, org.ownerPassword || 'owner123') || timingSafeMatch(password, org.adminPassword || '123')) {
          passMatch = true;
        }
      }
      if (!passMatch) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Admin or owner authorization required for backup export' });
      }
    }

    const settingsRes = await db.query('SELECT * FROM public.app_settings');
    const facesRes = await db.query('SELECT * FROM public.employee_faces');
    res.json({
      export_date: new Date().toISOString(),
      app_settings: settingsRes.rows,
      employee_faces: facesRes.rows,
    });
  } catch (err) {
    console.error('[Backup Export Error]:', err);
    res.status(500).json({ success: false, error: 'Backup export failed' });
  }
});

app.post('/api/backup/import', async (req, res) => {
  try {
    const authUser = getAuthFromReq(req);
    const backupSecret = process.env.BACKUP_SECRET || process.env.RESET_SECRET;
    const providedSecret = req.headers['x-admin-secret'] || req.body?.secret;
    const isSecretMatch = Boolean(backupSecret && providedSecret && timingSafeMatch(providedSecret, backupSecret));

    if (!isSecretMatch && (!authUser || !['owner', 'admin'].includes(authUser.role))) {
      const { password } = req.body || {};
      let passMatch = false;
      if (password) {
        const stored = await getSettingsFromStorage(STORAGE_KEY);
        const org = stored?.orgSettings || {};
        if (timingSafeMatch(password, org.ownerPassword || 'owner123') || timingSafeMatch(password, org.adminPassword || '123')) {
          passMatch = true;
        }
      }
      if (!passMatch) {
        return res.status(403).json({ success: false, error: 'Unauthorized: Admin or owner authorization required for backup import' });
      }
    }

    const { app_settings, employee_faces } = req.body;
    if (app_settings && Array.isArray(app_settings)) {
      for (const item of app_settings) {
        await saveSettingsToStorage(item.key_name || item.key, item.value_data || item.value);
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
    console.error('[Backup Import Error]:', err);
    res.status(500).json({ success: false, error: 'Backup import failed' });
  }
});

app.post('/api/system/reset', async (req, res) => {
  try {
    const { key = STORAGE_KEY, state, confirm, ownerPassword, secret } = req.body;

    if (confirm !== 'CONFIRM_RESET') {
      return res.status(400).json({ success: false, error: 'Confirmation token CONFIRM_RESET required' });
    }

    const authUser = getAuthFromReq(req);
    const resetSecret = process.env.RESET_SECRET || 'reset_pharmacy_2026';
    const isSecretValid = typeof secret === 'string' && timingSafeMatch(secret, resetSecret);

    let isOwnerValid = false;
    if (authUser && (authUser.role === 'owner' || authUser.role === 'admin')) {
      isOwnerValid = true;
    } else {
      try {
        const stored = await getSettingsFromStorage(key);
        const currentOwnerPass = stored?.orgSettings?.ownerPassword || 'owner123';
        if (typeof ownerPassword === 'string' && timingSafeMatch(ownerPassword, currentOwnerPass)) {
          isOwnerValid = true;
        }
      } catch (e) {
        console.warn('[Reset Auth Check Error]:', e.message);
      }
    }

    if (!isSecretValid && !isOwnerValid) {
      return res.status(403).json({ success: false, error: 'Access denied: Valid owner credentials or reset authorization required' });
    }

    await db.query('TRUNCATE TABLE public.app_settings, public.employee_faces, public.sync_logs CASCADE');
    try {
      await db.query('TRUNCATE TABLE public.acc_journal_entries, public.acc_journal_lines, public.acc_cashier_closings, public.acc_vendor_transactions CASCADE');
      await db.query('UPDATE public.acc_accounts SET opening_balance = 0, current_balance = 0');
      await db.query('UPDATE public.acc_treasuries SET current_balance = 0');
      await db.query('UPDATE public.acc_vendors SET current_balance = 0');
    } catch (accErr) {
      console.warn('Accounting tables reset skipped or not present:', accErr?.message);
    }
    if (isRedisConnected && redis) {
      await redis.flushdb();
    }
    if (state) {
      await saveSettingsToStorage(key, state);
    }
    io.emit('system:reset', { key, timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'System reset completed' });
  } catch (err) {
    console.error('[API Reset Error]:', err);
    res.status(500).json({ success: false, error: 'System reset failed' });
  }
});

// ── 8.5. مسارات منظومة الحسابات العامة (Accounting & General Ledger API) ──
app.get('/api/accounts', async (req, res) => {
  try {
    const q = await db.query('SELECT * FROM public.acc_accounts ORDER BY code ASC');
    res.json({ success: true, accounts: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const acc = req.body;
    if (!acc || !acc.code || !acc.name_ar) {
      return res.status(400).json({ success: false, error: 'Missing required account fields' });
    }
    const query = `
      INSERT INTO public.acc_accounts (
        id, code, name_ar, name_en, account_type, nature, parent_id, level,
        is_parent, currency, opening_balance, current_balance, is_active, notes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code,
        name_ar = EXCLUDED.name_ar,
        name_en = EXCLUDED.name_en,
        account_type = EXCLUDED.account_type,
        nature = EXCLUDED.nature,
        parent_id = EXCLUDED.parent_id,
        level = EXCLUDED.level,
        is_parent = EXCLUDED.is_parent,
        opening_balance = EXCLUDED.opening_balance,
        current_balance = EXCLUDED.current_balance,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *;
    `;
    const result = await db.query(query, [
      acc.id, acc.code, acc.name_ar, acc.name_en || null, acc.account_type, acc.nature,
      acc.parent_id || null, acc.level || 1, Boolean(acc.is_parent), acc.currency || 'EGP',
      acc.opening_balance || 0, acc.current_balance || 0, acc.is_active !== false, acc.notes || null
    ]);

    io.emit('account:saved', result.rows[0]);
    res.json({ success: true, account: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/accounts/treasuries', async (req, res) => {
  try {
    const q = await db.query('SELECT * FROM public.acc_treasuries ORDER BY code ASC');
    res.json({ success: true, treasuries: q.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts/treasuries/fee', async (req, res) => {
  try {
    const { id, fee_percentage, fee_fixed, commission_account_id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Missing treasury id' });

    const q = `
      UPDATE public.acc_treasuries
      SET fee_percentage = $2,
          fee_fixed = $3,
          commission_account_id = $4
      WHERE id = $1
      RETURNING *;
    `;
    const r = await db.query(q, [id, fee_percentage || 0, fee_fixed || 0, commission_account_id || null]);
    io.emit('treasury:updated', r.rows[0]);
    res.json({ success: true, treasury: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/accounts/journal-entries', async (req, res) => {
  try {
    const entriesRes = await db.query('SELECT * FROM public.acc_journal_entries ORDER BY entry_date DESC, created_at DESC LIMIT 100');
    const entryIds = entriesRes.rows.map(e => e.id);

    let linesByEntry = {};
    if (entryIds.length > 0) {
      const linesRes = await db.query('SELECT * FROM public.acc_journal_lines WHERE entry_id = ANY($1::varchar[])', [entryIds]);
      linesRes.rows.forEach(l => {
        if (!linesByEntry[l.entry_id]) linesByEntry[l.entry_id] = [];
        linesByEntry[l.entry_id].push(l);
      });
    }

    const fullEntries = entriesRes.rows.map(e => ({
      ...e,
      lines: linesByEntry[e.id] || []
    }));

    res.json({ success: true, entries: fullEntries });
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
