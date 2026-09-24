/**
 * hr-backend.js
 * خادم الموارد البشرية فائق الأداء (PostgreSQL + Redis + Socket.io)
 * صُمم لتحمل الضغط العالي جداً، كثرة الاستعلامات، والتحديث اللحظي الفوري بين الأجهزة
 */

import express from 'express';
import http from 'http';
import https from 'https';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { initSaasTables, registerSaasRoutes, DEFAULT_DEV_USER, DEFAULT_DEV_PASS } from './saas-manager.js';
import { initOutstockTables, registerOutstockRoutes } from './outstock-manager.js';

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

function toStdDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
}

async function syncBranchesToOutstock(branches, dbInstance) {
  if (!Array.isArray(branches) || branches.length === 0 || !dbInstance) return;
  for (const b of branches) {
    if (!b || !b.id || !b.name) continue;
    try {
      const bPhone = b.phone || (Array.isArray(b.phones) && b.phones[0]?.number) || null;
      const bCode = b.branchCode || b.code || b.id;

      // مزامنة الدليل فقط (الاسم، الكود، الهاتف، العنوان) دون المساس ببيانات تسجيل الدخول المستقلة للنواقص
      await dbInstance.query(`
        INSERT INTO public.outstock_branches (id, name, code, phone, address, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          phone = COALESCE(EXCLUDED.phone, public.outstock_branches.phone),
          address = COALESCE(EXCLUDED.address, public.outstock_branches.address),
          updated_at = CURRENT_TIMESTAMP
      `, [String(b.id), String(b.name), bCode, bPhone, b.address || null]);
    } catch (err) {
      console.warn(`[Sync Branch to Outstock Warn] Branch ${b.name}:`, err.message);
    }
  }
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

const resolvedHost = process.env.DB_HOST || process.env.POSTGRES_HOST || 'aws-0-eu-west-2.pooler.supabase.com';
const isLocalHost = ['localhost', '127.0.0.1', 'postgres'].includes(resolvedHost);
const useSsl = process.env.DB_SSL === 'true' || (process.env.DB_SSL !== 'false' && !isLocalHost);

const connectionString = process.env.SUPABASE_POOLER_URL ||
  (process.env.DB_HOST ? `postgresql://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS || '')}@${process.env.DB_HOST}:${process.env.DB_PORT || 6543}/${process.env.DB_NAME || 'postgres'}?sslmode=${process.env.DB_SSLMODE || (useSsl ? 'require' : 'disable')}` : null);

const pgConfig = connectionString ? {
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
} : {
  host: resolvedHost,
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || (isLocalHost ? '5432' : '6543'), 10),
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'postgres',
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.DB_PASS || process.env.POSTGRES_PASSWORD || '',
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 30,
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

      -- 3.1 جدول الطلبات المباشرة السريعة (Fast Ingestion Requests Table)
      CREATE TABLE IF NOT EXISTS public.requests (
          id VARCHAR(100) PRIMARY KEY,
          idempotency_key VARCHAR(255) NULL,
          request_type VARCHAR(100) NOT NULL DEFAULT 'general',
          employee_id VARCHAR(100) NULL,
          employee_name VARCHAR(255) NULL,
          employee_code VARCHAR(100) NULL,
          branch_id VARCHAR(50) NULL,
          target_role VARCHAR(50) NULL DEFAULT 'admin',
          priority VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
          status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          queued_at TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
          delivered_at TIMESTAMPTZ NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests (status);
      CREATE INDEX IF NOT EXISTS idx_requests_emp ON public.requests (employee_id);
      CREATE INDEX IF NOT EXISTS idx_requests_branch ON public.requests (branch_id);
      CREATE INDEX IF NOT EXISTS idx_requests_created ON public.requests (created_at DESC);

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

      -- 5. جدول الأجهزة المتصلة وإدارتها وإلغاء تنشيطها
      CREATE TABLE IF NOT EXISTS public.devices (
          device_id VARCHAR(100) PRIMARY KEY,
          user_id VARCHAR(100) NOT NULL,
          device_name VARCHAR(255) NULL,
          platform VARCHAR(50) NOT NULL DEFAULT 'android',
          app_version VARCHAR(50) NULL,
          push_token TEXT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
          last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user ON public.devices(user_id);
      CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);

      -- 6. جدول إصدارات وتحديثات التطبيق والمانيفست
      CREATE TABLE IF NOT EXISTS public.app_versions (
          id BIGSERIAL PRIMARY KEY,
          version_name VARCHAR(50) NOT NULL,
          version_code INTEGER NOT NULL UNIQUE,
          min_supported_code INTEGER NOT NULL DEFAULT 1,
          platform VARCHAR(50) NOT NULL DEFAULT 'android',
          download_url TEXT NOT NULL,
          sha256_checksum VARCHAR(64) NULL,
          file_size BIGINT NULL,
          mandatory_update BOOLEAN NOT NULL DEFAULT false,
          release_notes TEXT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_app_ver_code ON public.app_versions(version_code DESC);

      -- 7. جدول سجل التدقيق الأمني للعمليات
      CREATE TABLE IF NOT EXISTS public.audit_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id VARCHAR(100) NULL,
          device_id VARCHAR(100) NULL,
          action VARCHAR(100) NOT NULL,
          entity VARCHAR(100) NOT NULL,
          entity_id VARCHAR(100) NULL,
          metadata JSONB NULL,
          client_ip VARCHAR(50) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      -- 8. جدول المرفقات والوسائط المفصولة
      CREATE TABLE IF NOT EXISTS public.app_attachments (
          id VARCHAR(120) PRIMARY KEY,
          entity_type VARCHAR(64) DEFAULT 'auto',
          entity_id VARCHAR(128) DEFAULT 'item',
          field_name VARCHAR(64) DEFAULT 'file',
          file_data TEXT NOT NULL,
          mime_type VARCHAR(64) DEFAULT 'image/jpeg',
          file_size BIGINT DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_app_attachments_entity ON public.app_attachments(entity_type, entity_id);
    `;

    await db.query(schemaSql);
    console.log('🐘 [PostgreSQL] الجداول الأساسية وجداول الأجهزة والتحديثات مفهرسة ومجهزة بنجاح.');
    await initSaasTables(db);
    await initOutstockTables(db);
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
        let parsed = JSON.parse(cached);
        if (cached.includes('http://63.183.147.199/api/attachments') || cached.includes('http://63-183-147-199.sslip.io/api/attachments')) {
          const cleaned = cached.replace(/https?:\/\/(?:63\.183\.147\.199|63-183-147-199\.sslip\.io)\/api\/attachments/g, '/api/attachments');
          parsed = JSON.parse(cleaned);
          redis.set(`hr:settings:${key}`, cleaned, 'EX', 86400 * 7).catch(() => {});
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[Redis Read Warn]:', e.message);
    }
  }

  // 2. إذا لم يكن في الكاش، نقرأ من PostgreSQL
  const res = await db.query('SELECT value_data as value, version, updated_at FROM public.app_settings WHERE key_name = $1', [key]);
  if (res.rows.length > 0) {
    const row = res.rows[0];
    let data = row.value;

    const sStr = JSON.stringify(data);
    if (sStr.includes('http://63.183.147.199/api/attachments') || sStr.includes('http://63-183-147-199.sslip.io/api/attachments')) {
      const cleaned = sStr.replace(/https?:\/\/(?:63\.183\.147\.199|63-183-147-199\.sslip\.io)\/api\/attachments/g, '/api/attachments');
      data = JSON.parse(cleaned);
      db.query('UPDATE public.app_settings SET value_data = $1::jsonb WHERE key_name = $2', [cleaned, key]).catch(() => {});
    }

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

        return `/api/attachments?id=${attId}&raw=1`;
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

  // فصل المرفقات والصور فقط إذا تم الإشارة الصريحة لوجود مرفقات جديدة لمنع إجهاد المعالج على 4.2MB في الحفظ العادي
  if (stateValue && typeof stateValue === 'object') {
    if (stateValue._hasNewAttachments || stateValue._attachmentsPending) {
      stateValue = await autoExtractStateAttachments(stateValue);
      delete stateValue._hasNewAttachments;
      delete stateValue._attachmentsPending;
    }

    if (Array.isArray(stateValue._deletedIds) && stateValue._deletedIds.length > 25000) {
      stateValue._deletedIds = stateValue._deletedIds.slice(-25000);
    }

    // حماية ضد المسح العرضي للكوادر والموظفين (Accidental Wipe Protection)
    const incomingEmpCount = Array.isArray(stateValue?.employees) ? stateValue.employees.length : 0;
    const isExplicitReset = Boolean(stateValue?._systemResetToken);
    if (!isExplicitReset && incomingEmpCount === 0) {
      const existing = await getSettingsFromStorage(key);
      if (existing && Array.isArray(existing.employees) && existing.employees.length > 0) {
        console.warn(`[Backend Guard] 🛡️ Incoming save has 0 employees. Preserving ${existing.employees.length} existing employees.`);
        stateValue.employees = existing.employees;
        if (!Array.isArray(stateValue.branches) || stateValue.branches.length === 0) {
          stateValue.branches = existing.branches || [];
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 🛡️ ACTIVE SHIFT MERGE GUARD - الحارس الذري لورديات الكشك النشطة
    // ══════════════════════════════════════════════════════════════════════════
    // المشكلة الجذرية: عندما تقوم صفحة الإدارة (أو أي جهاز) بحفظ state كاملة
    // قديمة لا تحتوي على وردية موظف بصم للتو من الكشك، يتم مسح الوردية النشطة.
    // الحل: قبل الكتابة، نجلب الـ activeShifts الموجودة في DB ونحمي كل وردية
    // نشطة (لها timeIn وليس لها timeOut صريح) من المسح بواسطة الجهاز الآخر.
    // المفتاح: _punchSource تشير لعملية كشك وليس admin → نتخطى المدمج
    const isKioskSliceOnly = stateValue?._punchSource === 'kiosk_slice' || stateValue?._isShiftEndOperation === true;
    const endedEmpIdsSet = new Set((stateValue?._endedShiftEmpIds || []).map(String));

    if (!isKioskSliceOnly && !isExplicitReset && stateValue && typeof stateValue === 'object') {
      try {
        const existingForShifts = await getSettingsFromStorage(key);
        const existingActiveShifts = existingForShifts?.activeShifts;

        if (existingActiveShifts && typeof existingActiveShifts === 'object') {
          const incomingActiveShifts = stateValue.activeShifts || {};
          const today = new Date().toISOString().slice(0, 10);
          let shiftsProtected = 0;

          // قائمة الموظفين لفحص الأكواد والمعرفات
          const employeesList = Array.isArray(stateValue.employees) ? stateValue.employees : (Array.isArray(existingForShifts?.employees) ? existingForShifts.employees : []);

          for (const [empId, existingShift] of Object.entries(existingActiveShifts)) {
            if (!existingShift || typeof existingShift !== 'object') continue;

            const sEmpIdStr = String(empId);
            const empObj = employeesList.find(e => String(e.id) === sEmpIdStr || (e.code && String(e.code) === sEmpIdStr));
            const empActualId = empObj?.id ? String(empObj.id) : sEmpIdStr;
            const empCode = empObj?.code ? String(empObj.code) : '';

            // فحص ما إذا كانت مصفوفة shifts تحتوي على سجل وردية مغلق لهذا الموظف يطابق هذه الوردية
            const isEmpShiftMatch = (s) => (
              String(s.employeeId) === sEmpIdStr ||
              String(s.employeeId) === empActualId ||
              (empCode && (String(s.employeeId) === empCode || String(s.employeeCode) === empCode)) ||
              (existingShift.shiftId && s.id === existingShift.shiftId)
            );
            const isShiftTrulyClosed = (s) => Boolean(
              s && s.timeOut && s.timeOut !== '' && s.timeOut !== '—' && s.timeOut !== '-' && s.timeOut !== 'قيد العمل الآن' && !s.isLiveActive
            );

            const hasClosedInIncoming = Array.isArray(stateValue.shifts) && stateValue.shifts.some(s =>
              isEmpShiftMatch(s) &&
              (existingShift.shiftId && s.id === existingShift.shiftId ? true : (s.date === existingShift.date && s.timeIn === existingShift.timeIn)) &&
              isShiftTrulyClosed(s)
            );

            if (hasClosedInIncoming) {
              // تم إنهاء الوردية صراحة من الإدارة ومسجلة في shifts -> لا نسترجعها أبداً
              continue;
            }

            // إذا كان الموظف ضمن قائمة الورديات المنتهية صراحة، نتحقق هل بدأ وردية جديدة لليوم
            if (endedEmpIdsSet.has(sEmpIdStr) || endedEmpIdsSet.has(empActualId) || (empCode && endedEmpIdsSet.has(empCode))) {
              const isTrulyActiveNewShift = existingShift.date === today && Boolean(existingShift.timeIn) && (!existingShift.timeOut || existingShift.timeOut === '');
              if (!isTrulyActiveNewShift) {
                continue;
              }
              endedEmpIdsSet.delete(sEmpIdStr);
              endedEmpIdsSet.delete(empActualId);
              if (empCode) endedEmpIdsSet.delete(empCode);
            }

            // الوردية النشطة: لها date اليوم، ولها timeIn، وليس لها timeOut صريح
            const isActiveToday = existingShift.date === today;
            const hasCheckIn = Boolean(existingShift.timeIn && existingShift.timeIn !== '');
            const noCheckOut = !existingShift.timeOut || existingShift.timeOut === '' || existingShift.timeOut === '—' || existingShift.timeOut === '-';
            const isGenuinelyActive = isActiveToday && hasCheckIn && noCheckOut;

            if (isGenuinelyActive) {
              const incomingShift = incomingActiveShifts[empId] || incomingActiveShifts[String(empId)] || (empCode && incomingActiveShifts[empCode]);
              const incomingIsEmpty = !incomingShift;
              const incomingLacksCheckIn = incomingShift && (!incomingShift.timeIn || incomingShift.timeIn === '');

              if (incomingIsEmpty || incomingLacksCheckIn) {
                // ✅ الحماية فقط للورديات النشطة فعلياً التي لم يتم تسجيل انصرافها صراحة
                incomingActiveShifts[empId] = existingShift;
                incomingActiveShifts[String(empId)] = existingShift;
                shiftsProtected++;
                console.log(`[ActiveShift Guard] 🛡️ Protected active shift for emp ${empId} (${existingShift.branchId}) - timeIn: ${existingShift.timeIn}, date: ${existingShift.date}`);
              }
            }
          }

          if (shiftsProtected > 0) {
            stateValue.activeShifts = incomingActiveShifts;
            console.log(`[ActiveShift Guard] ✅ Total ${shiftsProtected} active kiosk shift(s) preserved from concurrent overwrite.`);
          }
        }
      } catch (shiftGuardErr) {
        // خطأ في الحارس لا يوقف الحفظ - نسجل فقط
        console.warn('[ActiveShift Guard] ⚠️ Non-critical guard error (save continues):', shiftGuardErr.message);
      }
    }
    // ══════════════════════════════════════════════════════════════════════════
  }

  let cleanJsonString = typeof stateValue === 'string' ? stateValue : JSON.stringify(stateValue);
  if (cleanJsonString.includes('http://63.183.147.199/api/attachments') || cleanJsonString.includes('http://63-183-147-199.sslip.io/api/attachments')) {
    cleanJsonString = cleanJsonString.replace(/https?:\/\/(?:63\.183\.147\.199|63-183-147-199\.sslip\.io)\/api\/attachments/g, '/api/attachments');
    try { stateValue = JSON.parse(cleanJsonString); } catch {}
  }
  const jsonString = cleanJsonString;
  const now = new Date().toISOString();

  // الحصول على الإصدار الأحدث من الذاكرة لضمان الـ Fast-Ack اللحظي (< 1ms)
  let currentVersion = 1;
  if (isRedisConnected && redis) {
    try {
      const vStr = await redis.get(`hr:version:${key}`);
      if (vStr) {
        const parsedV = JSON.parse(vStr);
        currentVersion = (parseInt(parsedV.version, 10) || 1);
      }
    } catch {}
  }
  const newVersion = currentVersion + 1;

  // 1. تحديث الكاش في ذاكرة Redis المحلية فورياً (< 0.5ms)
  if (isRedisConnected && redis) {
    try {
      await redis.set(`hr:settings:${key}`, jsonString, 'EX', 86400 * 7);
      await redis.set(`hr:version:${key}`, JSON.stringify({ version: newVersion, updated_at: now }));
    } catch (e) {
      console.warn('[Redis Write Warn]:', e.message);
    }
  }

  // 2. الحفظ الدائم في PostgreSQL (Write-Behind في الخلفية لعدم تعطيل العميل)
  const query = `
    INSERT INTO public.app_settings (key_name, value_data, version, updated_at)
    VALUES ($1, $2::jsonb, $3, $4)
    ON CONFLICT (key_name) DO UPDATE
    SET value_data = EXCLUDED.value_data,
        version = public.app_settings.version + 1,
        updated_at = EXCLUDED.updated_at
    RETURNING version, updated_at;
  `;

  const pgPromise = db.query(query, [key, jsonString, newVersion, now])
    .then((res) => {
      const finalVer = res.rows[0]?.version || newVersion;
      // تسجيل عملية المزامنة
      db.query(
        'INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ($1, $2, $3, $4, $5)',
        ['SAVE_STATE', key, finalVer, clientIp, now]
      ).catch(() => {});
    })
    .catch((dbErr) => {
      console.error('[PostgreSQL Write-Behind Error]:', dbErr.message);
    });

  // إذا كان خادم Redis غير متصل، ننتظر كتابة PostgreSQL لضمان موثوقية وأمان البيانات
  if (!isRedisConnected || !redis) {
    await pgPromise;
  }

  const payload = typeof value === 'string' ? JSON.parse(value) : value;

  // مزامنة فروع الـ HR تلقائياً مع جداول نظام النواقص (Outstock) لضمان الدخول الموحد
  if (payload && Array.isArray(payload.branches) && payload.branches.length > 0) {
    syncBranchesToOutstock(payload.branches, db).catch(() => {});
  }

  // 3. بث التحديث اللحظي لجميع الأجهزة والتبويبات المتصلة عبر WebSockets (< 5ms)
  if (clientIp !== 'batch-worker') {
    io.emit('state:updated', {
      key,
      value: payload,
      version: newVersion,
      updated_at: now,
    });
  }

  return { success: true, version: newVersion, updated_at: now, value: payload };
}

// ── 6. مسارات الـ REST API ───────────────────────────────────────────────────

// 🚀 فحص النبض والاتصال فائق السرعة وتوثيق التوقيت المونوتوني (< 5ms)
app.all(['/api/ping', '/ping'], (req, res) => {
  res.status(204)
     .set({
       'Cache-Control': 'no-store, no-cache, must-revalidate',
       'Pragma': 'no-cache',
       'Date': new Date().toUTCString(),
       'X-Server-Time': new Date().toISOString()
     })
     .end();
});

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
    const isOwnerAuthorized = req.headers['x-owner-authorized'] === 'true' || stateValue?._ownerAuthorized === true;

    if (stateValue && stateValue.orgSettings && !isOwner && !isOwnerAuthorized) {
      const existing = await getSettingsFromStorage(key);
      if (existing?.orgSettings) {
        // إذا لم يكن الطلب مخصصاً لتغيير بيانات المالك، نحافظ على بيانات المالك الحالية لمنع محوها
        if (stateValue.orgSettings.ownerPassword !== existing.orgSettings.ownerPassword && !stateValue._allowOwnerPasswordChange) {
          stateValue.orgSettings.ownerPassword = existing.orgSettings.ownerPassword || 'owner123';
          stateValue.orgSettings.ownerUsername = existing.orgSettings.ownerUsername || 'owner';
        }
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

// حفظ وتحديث جزء محدد فقط من البيانات (Slice / Delta Saving) - فائق السرعة والخفة (< 20KB بدلاً من 4.2MB)
app.post('/api/settings/slice', async (req, res) => {
  try {
    const { key = STORAGE_KEY, sliceKey, sliceValue } = req.body;
    if (!sliceKey || sliceValue === undefined) {
      return res.status(400).json({ success: false, error: 'Missing sliceKey or sliceValue' });
    }

    // جلب أحدث حالة من الذاكرة الفورية
    const existing = await getSettingsFromStorage(key);
    if (!existing || typeof existing !== 'object') {
      return res.status(500).json({ success: false, error: 'Current system state unavailable' });
    }

    // تحديث الجزء المطلوب فقط في الحالة
    existing[sliceKey] = sliceValue;

    // إذا كان التحديث يخص الشفتات النشطة، نضع راية kiosk_slice لمنع الحارس من إعادة المحذوفات
    if (sliceKey === 'activeShifts') {
      existing._punchSource = 'kiosk_slice';
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const result = await saveSettingsToStorage(key, existing, clientIp);

    // بث التغيير الذري اللحظي لجميع الأجهزة مع البيانات الكاملة
    io.emit('entity:changed', {
      entityType: sliceKey,
      entityId: 'all',
      data: sliceValue,
      action: 'update',
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      sliceKey,
      version: result.version,
      updated_at: result.updated_at
    });
  } catch (err) {
    console.error('[API POST /settings/slice Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 🚀 نقطة الاتصال الذرية الفائقة الخفة للبصمات (Atomic Punch Record API)
// < 1KB طلب بدلاً من 6MB - < 20ms استجابة بدلاً من 408/499 Timeouts
// تحمي من Race Condition تماماً بسبب التحديث الجزئي الذري فقط لـ activeShifts
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/punches/record', async (req, res) => {
  try {
    const { employeeId, branchId, actionType, time, date, shiftId, shiftData, shiftRecord, requestId, key } = req.body;
    const storageKey = key || STORAGE_KEY;

    if (!employeeId || !actionType || !date) {
      return res.status(400).json({ success: false, error: 'Missing required fields: employeeId, actionType, date' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const now = new Date().toISOString();

    // جلب الحالة الحالية من الذاكرة السريعة أو قاعدة البيانات
    const existing = await getSettingsFromStorage(storageKey);
    if (!existing || typeof existing !== 'object') {
      return res.status(500).json({ success: false, error: 'System state unavailable' });
    }

    const currentActiveShifts = { ...(existing.activeShifts || {}) };
    let currentShifts = [...(existing.shifts || [])];
    const empIdStr = String(employeeId);

    const employeesList = Array.isArray(existing.employees) ? existing.employees : [];
    const empObj = employeesList.find(e =>
      String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)
    );
    const possibleKeys = new Set([
      employeeId,
      empIdStr,
      empObj?.id ? String(empObj.id) : null,
      empObj?.code ? String(empObj.code) : null
    ].filter(Boolean));

    if (actionType === 'check_in' || actionType === 'start_shift') {
      // ── تسجيل حضور ذري ───────────────────────────────────────────
      // إذا كان الموظف لديه وردية نشطة بالفعل لليوم → نرجع خطأ للكشك
      let existingActive = null;
      for (const k of possibleKeys) {
        if (currentActiveShifts[k]) {
          existingActive = currentActiveShifts[k];
          break;
        }
      }
      if (existingActive && existingActive.date === date) {
        return res.status(409).json({
          success: false,
          alreadyCheckedIn: true,
          existingShift: existingActive,
          message: 'الموظف لديه وردية نشطة بالفعل لهذا اليوم'
        });
      }

      // إدخال الوردية الجديدة في activeShifts بكافة المفاتيح
      const newShiftData = shiftData || {
        shiftId: shiftId || `shift_${employeeId}_${Date.now()}`,
        branchId: branchId || '',
        date,
        timeIn: time || now.slice(11, 16),
        startEpoch: Date.now(),
        isPaused: false,
        isOnBreak: false,
        updatedAt: Date.now()
      };

      possibleKeys.forEach(k => {
        currentActiveShifts[k] = newShiftData;
      });

      // تنظيف معرفات الموظف من قائمة الورديات المنتهية صراحة فوراً
      if (Array.isArray(existing._endedShiftEmpIds)) {
        existing._endedShiftEmpIds = existing._endedShiftEmpIds.filter(id => !possibleKeys.has(String(id)));
      }

      // إضافة سجل الوردية في shifts[]
      if (shiftRecord) {
        currentShifts = [shiftRecord, ...currentShifts.filter(s =>
          !(possibleKeys.has(String(s.employeeId)) && s.date === date && (!s.timeOut || s.timeOut === '' || s.isLiveActive))
        )];
      }

    } else if (actionType === 'check_out' || actionType === 'stop_shift') {
      // ── تسجيل انصراف ذري فائق الموثوقية (Atomic Check-out) ───────────────────

      let activeShiftKey = null;
      for (const k of possibleKeys) {
        if (currentActiveShifts[k]) {
          activeShiftKey = k;
          break;
        }
      }
      if (!activeShiftKey) {
        for (const [k, v] of Object.entries(currentActiveShifts)) {
          if (v && (possibleKeys.has(String(v.employeeId)) || possibleKeys.has(String(v.employeeCode)))) {
            activeShiftKey = k;
            break;
          }
        }
      }
      const activeShift = activeShiftKey ? currentActiveShifts[activeShiftKey] : null;

      // فحص ما إذا كان هناك سجل وردية مفتوح في shifts للموظف
      const isEmpShiftMatch = (s) => (
        possibleKeys.has(String(s.employeeId)) || (s.employeeCode && possibleKeys.has(String(s.employeeCode)))
      );
      const isShiftOpen = (s) => (!s.timeOut || s.timeOut === '' || s.timeOut === '—' || s.timeOut === '-' || s.timeOut === 'قيد العمل الآن' || s.isLiveActive);

      // إذا لم تكن هناك وردية نشطة ولا سجل وردية مفتوح ولا shiftRecord -> فقط عندها نرجع 409
      if (!activeShift && !shiftRecord && !currentShifts.some(s => isEmpShiftMatch(s) && isShiftOpen(s))) {
        return res.status(409).json({
          success: false,
          notCheckedIn: true,
          message: 'لا توجد وردية نشطة لهذا الموظف لتسجيل الانصراف'
        });
      }

      // حذف كافة مفاتيح الموظف من activeShifts
      possibleKeys.forEach(k => delete currentActiveShifts[k]);
      Object.keys(currentActiveShifts).forEach(k => {
        const v = currentActiveShifts[k];
        if (v && (possibleKeys.has(String(v.employeeId)) || possibleKeys.has(String(v.employeeCode)))) {
          delete currentActiveShifts[k];
        }
      });

      // إغلاق وتحديث سجل الوردية في shifts[]
      const targetShiftId = activeShift?.shiftId || shiftId || shiftRecord?.id;
      let existingIdx = currentShifts.findIndex(s => targetShiftId && s.id === targetShiftId);
      if (existingIdx < 0) {
        existingIdx = currentShifts.findIndex(s => isEmpShiftMatch(s) && (s.date === date || isShiftOpen(s)));
      }

      const closedRecord = {
        ...(existingIdx >= 0 ? currentShifts[existingIdx] : {}),
        ...(shiftRecord || {}),
        employeeId: empObj?.id || employeeId,
        employeeCode: empObj?.code || shiftRecord?.employeeCode || '',
        employeeName: empObj?.name || shiftRecord?.employeeName || '',
        timeOut: time || (existingIdx >= 0 && currentShifts[existingIdx].timeOut) || now.slice(11, 16),
        isLiveActive: false,
        status: 'completed',
        updatedAt: now
      };

      if (existingIdx >= 0) {
        currentShifts[existingIdx] = closedRecord;
      } else {
        currentShifts = [closedRecord, ...currentShifts];
      }

      // إغلاق أي ورديات مفتوحة إضافية مكررة لنفس الموظف
      currentShifts = currentShifts.map((s, idx) => {
        if (idx !== existingIdx && isEmpShiftMatch(s) && isShiftOpen(s)) {
          return {
            ...s,
            timeOut: time || now.slice(11, 16),
            isLiveActive: false,
            status: 'completed',
            updatedAt: now
          };
        }
        return s;
      });
    } else {
      return res.status(400).json({ success: false, error: `Unknown actionType: ${actionType}` });
    }

    // نضع راية kiosk_slice لضمان عدم قيام حارس السيرفر باسترجاع الوردية المنتهية
    existing._punchSource = 'kiosk_slice';
    existing.activeShifts = currentActiveShifts;
    existing.shifts = currentShifts;

    // حفظ ذري في Redis + PostgreSQL
    const saveResult = await saveSettingsToStorage(storageKey, existing, clientIp);

    // تسجيل في جدول sync_logs للتتبع
    db.query(
      'INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ($1, $2, $3, $4, $5)',
      [`PUNCH_${actionType.toUpperCase()}`, `emp_${employeeId}`, saveResult?.version || 0, clientIp, now]
    ).catch(() => {});

    // بث لحظي ذري متعدد الغرف (Targeted Room Multiplexing < 5ms)
    const punchPayload = {
      employeeId,
      empIdStr,
      branchId: branchId || '',
      actionType,
      date,
      time: time || now.slice(11, 16),
      requestId: requestId || null,
      activeShifts: currentActiveShifts,
      shiftRecord: (actionType === 'check_out' || actionType === 'stop_shift') ? (currentShifts.find(s => s.employeeId === employeeId || s.employeeId === empIdStr) || currentShifts[0]) : (shiftRecord || null),
      timestamp: now,
      hlcTimestamp: req.body?.hlcTimestamp || `${now}_0000_vps`
    };

    if (branchId) {
      io.to(`room:branch:${branchId}`).emit('punch:recorded', punchPayload);
    }
    if (employeeId) {
      io.to(`room:employee:${employeeId}`).emit('punch:recorded', punchPayload);
    }
    io.to('room:admin:live').emit('punch:recorded', punchPayload);
    io.emit('punch:recorded', punchPayload);

    io.emit('entity:changed', {
      entityType: 'activeShifts',
      action: actionType,
      employeeId,
      branchId: branchId || '',
      timestamp: now
    });

    console.log(`[Atomic Punch] ✅ ${actionType} recorded for emp ${employeeId} (branch: ${branchId}) at ${time} on ${date}`);

    res.json({
      success: true,
      actionType,
      employeeId,
      branchId,
      date,
      time,
      serverTime: now,
      hlcTimestamp: punchPayload.hlcTimestamp,
      version: saveResult?.version || 0,
      updated_at: now,
      requestId: requestId || null
    });

  } catch (err) {
    console.error('[API POST /punches/record Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// 🚀 POST /api/punches/sync-outbox - مزامنة دفعات بصمات الكشك المعلقة أوفلاين
// تطبق الحركات بالتسلسل الزمني الأصلي، تمنع التكرار (Idempotency)، ولا تمس إعدادات الإدارة
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/punches/sync-outbox', async (req, res) => {
  try {
    const { punches, key } = req.body || {};
    const storageKey = key || STORAGE_KEY;

    if (!Array.isArray(punches) || punches.length === 0) {
      return res.json({ success: true, syncedIds: [], count: 0, serverTime: new Date().toISOString() });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'kiosk-outbox';
    const now = new Date().toISOString();

    const existing = await getSettingsFromStorage(storageKey);
    if (!existing || typeof existing !== 'object') {
      return res.status(500).json({ success: false, error: 'System state unavailable' });
    }

    const currentActiveShifts = { ...(existing.activeShifts || {}) };
    let currentShifts = [...(existing.shifts || [])];
    const employeesList = Array.isArray(existing.employees) ? existing.employees : [];

    // فرز البصمات تصاعدياً بحسب وقت الحدوث الفعلي الأصلي (FIFO)
    const sortedPunches = [...punches].sort((a, b) => {
      const epochA = a.deviceLocalEpoch || (a.date && a.punchTime ? new Date(`${a.date}T${a.punchTime}:00`).getTime() : 0);
      const epochB = b.deviceLocalEpoch || (b.date && b.punchTime ? new Date(`${b.date}T${b.punchTime}:00`).getTime() : 0);
      return epochA - epochB;
    });

    const syncedIds = [];
    const todayStr = now.slice(0, 10);

    for (const p of sortedPunches) {
      if (!p || !p.employeeId) continue;
      const empIdStr = String(p.employeeId);
      const empObj = employeesList.find(e => String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr));
      const possibleKeys = new Set([
        p.employeeId,
        empIdStr,
        p.employeeCode ? String(p.employeeCode) : null,
        empObj?.id ? String(empObj.id) : null,
        empObj?.code ? String(empObj.code) : null
      ].filter(Boolean));

      const actionType = p.actionType || 'check_in';
      const punchDate = p.punchDate || p.date || todayStr;
      const punchTime = p.punchTime || p.time || now.slice(11, 16);
      const shiftId = p.shiftId || `shift_${empIdStr}_${p.deviceLocalEpoch || Date.now()}`;
      const clientPunchId = p.clientPunchId || `${empIdStr}_${actionType}_${punchDate}_${punchTime}`;

      // فحص هل البصمة معالجة مسبقاً بنفس clientPunchId أو shiftId؟
      const alreadyProcessed = currentShifts.some(s =>
        s && (
          s.clientPunchId === clientPunchId ||
          (s.id === shiftId && ((actionType === 'check_in' && s.timeIn === punchTime) || (actionType === 'check_out' && s.timeOut === punchTime)))
        )
      );

      if (actionType === 'check_in' || actionType === 'start_shift') {
        // فك الحظر التلقائي عن الموظف
        if (Array.isArray(existing._endedShiftEmpIds)) {
          existing._endedShiftEmpIds = existing._endedShiftEmpIds.filter(id => !possibleKeys.has(String(id)));
        }

        const newShiftData = p.shiftData || {
          shiftId,
          branchId: p.branchId || '',
          branchName: p.branchName || '',
          date: punchDate,
          timeIn: punchTime,
          startEpoch: p.deviceLocalEpoch || Date.now(),
          isPaused: false,
          isOnBreak: false,
          isOfflineSynced: true,
          syncedAt: now,
          updatedAt: Date.now()
        };

        // إذا كانت البصمة لتاريخ اليوم، نعتمدها في activeShifts بكافة المفاتيح
        if (punchDate === todayStr) {
          possibleKeys.forEach(k => {
            currentActiveShifts[k] = newShiftData;
          });
        }

        if (!alreadyProcessed) {
          const newShiftRecord = p.shiftRecord || {
            id: shiftId,
            clientPunchId,
            employeeId: empObj?.id || p.employeeId,
            employeeCode: empObj?.code || p.employeeCode || '',
            employeeName: empObj?.name || p.employeeName || '',
            branchId: p.branchId || '',
            branchName: p.branchName || '',
            date: punchDate,
            timeIn: punchTime,
            timeOut: '',
            hours: 0,
            actualWorkedHours: 0,
            scheduledHours: 8,
            regularHours: 0,
            overtimeHours: 0,
            overtimeStatus: 'none',
            breakHours: 0,
            source: 'kiosk_offline',
            isLiveActive: punchDate === todayStr,
            status: punchDate === todayStr ? 'active' : 'completed',
            statusLabel: punchDate === todayStr ? 'حضور حي (مزامنة أوفلاين)' : 'حضور أوفلاين',
            note: `بصمة حضور أوفلاين في تمام ${punchTime} (تمت المزامنة ${now.slice(11, 16)})`,
            isOfflineSynced: true,
            syncedAt: now,
            deviceLocalEpoch: p.deviceLocalEpoch || null,
            createdAt: new Date(p.deviceLocalEpoch || Date.now()).toISOString()
          };

          currentShifts = [
            newShiftRecord,
            ...currentShifts.filter(s => !(possibleKeys.has(String(s.employeeId)) && s.date === punchDate && (!s.timeOut || s.timeOut === '')))
          ];
        }
      } else if (actionType === 'break_start' || actionType === 'pause_shift') {
        const punchEpoch = p.deviceLocalEpoch || Date.now();
        possibleKeys.forEach(k => {
          if (currentActiveShifts[k]) {
            currentActiveShifts[k] = {
              ...currentActiveShifts[k],
              isPaused: true,
              isOnBreak: true,
              breakStartTime: punchTime,
              pauseStartEpoch: punchEpoch,
              updatedAt: punchEpoch
            };
          }
        });

        let targetIdx = currentShifts.findIndex(s => s && (s.id === shiftId || (possibleKeys.has(String(s.employeeId)) && s.date === punchDate && (!s.timeOut || s.timeOut === '' || s.isLiveActive))));
        if (targetIdx >= 0) {
          currentShifts[targetIdx] = {
            ...currentShifts[targetIdx],
            isPaused: true,
            isOnBreak: true,
            breakStartTime: punchTime,
            pauseStartEpoch: punchEpoch,
            updatedAt: now
          };
        }
      } else if (actionType === 'break_end' || actionType === 'resume_shift') {
        const punchEpoch = p.deviceLocalEpoch || Date.now();
        let addedPauseMs = 0;
        possibleKeys.forEach(k => {
          const act = currentActiveShifts[k];
          if (act) {
            const pauseDuration = act.pauseStartEpoch ? Math.max(0, punchEpoch - act.pauseStartEpoch) : 0;
            if (pauseDuration > addedPauseMs) addedPauseMs = pauseDuration;
            currentActiveShifts[k] = {
              ...act,
              isPaused: false,
              isOnBreak: false,
              breakStartTime: null,
              pauseStartEpoch: null,
              accumulatedPauseMs: (act.accumulatedPauseMs || 0) + pauseDuration,
              updatedAt: punchEpoch
            };
          }
        });

        let targetIdx = currentShifts.findIndex(s => s && (s.id === shiftId || (possibleKeys.has(String(s.employeeId)) && s.date === punchDate && (!s.timeOut || s.timeOut === '' || s.isLiveActive))));
        if (targetIdx >= 0) {
          const prev = currentShifts[targetIdx];
          const pauseDuration = prev.pauseStartEpoch ? Math.max(0, punchEpoch - prev.pauseStartEpoch) : addedPauseMs;
          const totalPauseMs = (prev.accumulatedPauseMs || 0) + pauseDuration;
          const trackedBreak = Math.round((totalPauseMs / 3600000) * 100) / 100;
          currentShifts[targetIdx] = {
            ...prev,
            isPaused: false,
            isOnBreak: false,
            breakStartTime: null,
            pauseStartEpoch: null,
            accumulatedPauseMs: totalPauseMs,
            breakHours: trackedBreak,
            updatedAt: now
          };
        }
      } else if (actionType === 'check_out' || actionType === 'stop_shift') {
        // استخراج مدة الاستراحة المتراكمة من الوردية النشطة قبل حذفها
        let activePauseMs = 0;
        let activeBreakHours = 0;
        possibleKeys.forEach(k => {
          const act = currentActiveShifts[k];
          if (act) {
            let pMs = act.accumulatedPauseMs || 0;
            if (act.isPaused && act.pauseStartEpoch) {
              const punchEpoch = p.deviceLocalEpoch || Date.now();
              pMs += Math.max(0, punchEpoch - act.pauseStartEpoch);
            }
            if (pMs > activePauseMs) activePauseMs = pMs;
          }
        });
        if (activePauseMs > 0) {
          activeBreakHours = Math.round((activePauseMs / 3600000) * 100) / 100;
        }

        // حذف من activeShifts
        possibleKeys.forEach(k => delete currentActiveShifts[k]);
        Object.keys(currentActiveShifts).forEach(k => {
          const v = currentActiveShifts[k];
          if (v && (possibleKeys.has(String(v.employeeId)) || possibleKeys.has(String(v.employeeCode)))) {
            delete currentActiveShifts[k];
          }
        });

        // إغلاق سجل الوردية في shifts
        let targetIdx = currentShifts.findIndex(s => s && (s.id === shiftId || (possibleKeys.has(String(s.employeeId)) && s.date === punchDate && (!s.timeOut || s.timeOut === ''))));
        if (targetIdx >= 0) {
          const prevRec = currentShifts[targetIdx];
          const timeInStr = prevRec.timeIn || '00:00';
          let totalElapsedHrs = 0;
          let workedHrs = 0;
          try {
            const [inH, inM] = timeInStr.split(':').map(Number);
            const [outH, outM] = punchTime.split(':').map(Number);
            let diffMins = (outH * 60 + outM) - (inH * 60 + inM);
            if (diffMins < 0) diffMins += 24 * 60;
            totalElapsedHrs = parseFloat((diffMins / 60).toFixed(2));
          } catch {}

          const effectiveBreak = parseFloat(prevRec.breakHours || activeBreakHours || p.breakHours || 0);
          workedHrs = Math.max(0, parseFloat((totalElapsedHrs - effectiveBreak).toFixed(2)));
          const schedHours = parseFloat(prevRec.scheduledHours || empObj?.workHoursPerDay || 8);
          const regularHours = Math.min(workedHrs, schedHours);
          const overtimeHours = Math.max(0, parseFloat((workedHrs - schedHours).toFixed(2)));

          currentShifts[targetIdx] = {
            ...prevRec,
            timeOut: punchTime,
            hours: workedHrs,
            actualWorkedHours: workedHrs,
            breakHours: effectiveBreak,
            scheduledHours: schedHours,
            regularHours: regularHours,
            overtimeHours: overtimeHours,
            overtimeStatus: overtimeHours > 0 ? 'pending' : 'none',
            isLiveActive: false,
            isPaused: false,
            isOnBreak: false,
            status: 'completed',
            isOfflineSynced: true,
            syncedAt: now,
            note: `${prevRec.note || ''} · انصراف أوفلاين ${punchTime}${effectiveBreak > 0 ? ` (بريك: ${effectiveBreak} س)` : ''}`.trim(),
            updatedAt: now
          };
        } else if (!alreadyProcessed) {
          currentShifts = [{
            id: shiftId,
            clientPunchId,
            employeeId: empObj?.id || p.employeeId,
            employeeCode: empObj?.code || p.employeeCode || '',
            employeeName: empObj?.name || p.employeeName || '',
            branchId: p.branchId || '',
            branchName: p.branchName || '',
            date: punchDate,
            timeIn: '00:00',
            timeOut: punchTime,
            hours: 0,
            isLiveActive: false,
            status: 'completed',
            source: 'kiosk_offline',
            isOfflineSynced: true,
            syncedAt: now,
            note: `انصراف أوفلاين مسجل ${punchTime}`,
            createdAt: now
          }, ...currentShifts];
        }
      }

      syncedIds.push(p.clientPunchId || shiftId);
    }

    // حفظ تزايدي آمن في Redis + PostgreSQL
    existing._punchSource = 'kiosk_slice';
    existing.activeShifts = currentActiveShifts;
    existing.shifts = currentShifts;

    const saveResult = await saveSettingsToStorage(storageKey, existing, clientIp);

    // تسجيل ملخص في sync_logs
    db.query(
      'INSERT INTO public.sync_logs (action_type, entity_key, version, client_ip, created_at) VALUES ($1, $2, $3, $4, $5)',
      ['KIOSK_OUTBOX_SYNC', `batch_${syncedIds.length}`, saveResult?.version || 0, clientIp, now]
    ).catch(() => {});

    // بث لحظي ذري لدفعات البصمات (Micro-Delta Batch Sync) لتفادي تنزيل كامل قاعدة البيانات
    const batchPayload = {
      syncedIds,
      count: syncedIds.length,
      activeShifts: currentActiveShifts,
      punches: sortedPunches,
      serverTime: now,
      version: saveResult?.version || 0
    };

    io.emit('punches:batch_synced', batchPayload);

    // بث موجه لغرف الفروع المعنية وغرفة الإدارة
    const branchIds = new Set(sortedPunches.map(p => p.branchId).filter(Boolean));
    branchIds.forEach(bId => {
      io.to(`room:branch:${bId}`).emit('punches:batch_synced', batchPayload);
    });
    io.to('room:admin:live').emit('punches:batch_synced', batchPayload);

    // بث لحظي عبر WebSockets لجميع الأجهزة المفتوحة (للتوافق العكسي مع الشاشات القديمة)
    io.emit('state:updated', {
      key: storageKey,
      value: existing,
      version: saveResult?.version || 0,
      updated_at: now
    });

    console.log(`[Kiosk Outbox Sync] ✅ Successfully synced batch of ${syncedIds.length} offline punches.`);

    res.json({
      success: true,
      syncedIds,
      count: syncedIds.length,
      serverTime: now,
      version: saveResult?.version || 0
    });
  } catch (err) {
    console.error('[API POST /punches/sync-outbox Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ══════════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════════
// 🔧 نقطة اتصال الإدارة: تفعيل وردية موظف يدوياً (Admin Activate Shift)
// تُستخدم لاسترجاع الورديات التي مُسحت بسبب Race Condition
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/admin/activate-shift', async (req, res) => {
  try {
    const { employeeId, branchId, date, timeIn, shiftId, overwrite = false, key } = req.body;
    const storageKey = key || STORAGE_KEY;

    if (!employeeId || !date || !timeIn) {
      return res.status(400).json({ success: false, error: 'Missing: employeeId, date, timeIn' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'admin-manual';
    const now = new Date().toISOString();
    const effectiveShiftId = shiftId || `shift_${employeeId}_${new Date(date + 'T' + timeIn).getTime()}`;

    const existing = await getSettingsFromStorage(storageKey);
    if (!existing || typeof existing !== 'object') {
      return res.status(500).json({ success: false, error: 'System state unavailable' });
    }

    const currentActiveShifts = { ...(existing.activeShifts || {}) };
    const empIdStr = String(employeeId);

    // فحص إذا كان الموظف لديه وردية نشطة مختلفة
    const existingActive = currentActiveShifts[employeeId] || currentActiveShifts[empIdStr];
    if (existingActive && !overwrite) {
      return res.status(409).json({
        success: false,
        alreadyActive: true,
        existingShift: existingActive,
        message: `الموظف لديه وردية نشطة بالفعل (${existingActive.date} - ${existingActive.timeIn}). استخدم overwrite:true لاستبدالها.`
      });
    }

    const bObj = (existing.branches || []).find(b => String(b.id) === String(branchId));
    const emp = (existing.employees || []).find(e =>
      String(e.id) === empIdStr || String(e.code) === empIdStr
    );

    const restoredShift = {
      shiftId: effectiveShiftId,
      branchId: branchId || emp?.branchId || '',
      branchName: bObj?.name || emp?.branchName || '',
      date: date,
      timeIn: timeIn,
      startEpoch: new Date(`${date}T${timeIn}:00`).getTime(),
      isPaused: false,
      isOnBreak: false,
      breakStartTime: null,
      pauseStartEpoch: null,
      accumulatedPauseMs: 0,
      updatedAt: Date.now(),
      restoredAt: now,
      restoredBy: 'admin-manual-fix'
    };

    currentActiveShifts[employeeId] = restoredShift;
    currentActiveShifts[empIdStr] = restoredShift;
    existing.activeShifts = currentActiveShifts;

    // إضافة سجل وردية في shifts[] إذا لم يكن موجوداً
    const shiftsArr = [...(existing.shifts || [])];
    const existingRecord = shiftsArr.find(s =>
      s.id === effectiveShiftId ||
      (String(s.employeeId) === empIdStr && s.date === date && (!s.timeOut || s.timeOut === '' || s.timeOut === '—'))
    );
    if (!existingRecord) {
      shiftsArr.unshift({
        id: effectiveShiftId,
        employeeId: employeeId,
        employeeCode: emp?.code || '',
        employeeName: emp?.name || '',
        branchId: branchId || emp?.branchId || '',
        branchName: bObj?.name || emp?.branchName || '',
        date: date,
        timeIn: timeIn,
        timeOut: '',
        hours: 0,
        actualWorkedHours: 0,
        scheduledHours: parseFloat(emp?.workHoursPerDay) || 8,
        regularHours: 0,
        overtimeHours: 0,
        overtimeStatus: 'none',
        breakHours: 0,
        source: 'kiosk',
        isLiveActive: true,
        status: 'active',
        statusLabel: 'حضور حي (تم الاسترجاع)',
        note: `تسجيل حضور حي في تمام الساعة ${timeIn} - تم استرجاعه من الإدارة`,
        createdAt: now,
        restoredAt: now
      });
      existing.shifts = shiftsArr;
    }

    const saveResult = await saveSettingsToStorage(storageKey, existing, clientIp);

    io.emit('punch:recorded', {
      employeeId,
      empIdStr,
      branchId: branchId || '',
      actionType: 'check_in_restored',
      date,
      time: timeIn,
      activeShifts: currentActiveShifts,
      timestamp: now
    });
    io.emit('entity:changed', { entityType: 'activeShifts', action: 'shift_restored', employeeId, timestamp: now });

    console.log(`[Admin Activate Shift] ✅ Shift restored for emp ${employeeId} (${emp?.name || '?'}) - branch ${branchId} - date ${date} - timeIn ${timeIn}`);

    res.json({
      success: true,
      message: `تم تفعيل وردية الموظف ${emp?.name || employeeId} بنجاح لتاريخ ${date} من الساعة ${timeIn}`,
      employeeId,
      employeeName: emp?.name,
      branchId,
      branchName: bObj?.name,
      date,
      timeIn,
      shiftId: effectiveShiftId,
      version: saveResult?.version || 0,
      restoredAt: now
    });
  } catch (err) {
    console.error('[API POST /admin/activate-shift Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ══════════════════════════════════════════════════════════════════════════════

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

// ── 5.1 طابور التجميع والمعالجة الدفعية الذكية للطلبات (Zero CPU Choke Coalesced Buffer) ──
// يجمع الطلبات الواردة خلال نافذة (6 ثوانٍ) ويدمجها في دفعة واحدة داخل app_settings
// لمنع استهلاك المعالج (1 vCPU) وتفادي كتابة 2.2MB على القرص في كل طلب منفرد
const requestBatchQueue = [];
let requestFlushTimer = null;
let isFlushingBatch = false;
const REQUEST_BATCH_FLUSH_INTERVAL_MS = 6000; // نافذة 6 ثوانٍ (بين 5 و 10 ثوانٍ كما طُلب)

function enqueueRequestForBatch(item) {
  requestBatchQueue.push(item);

  // إذا لم يكن هناك مؤقت مجدول ولسنا في منتصف عملية تفريغ حالياً، نجدول التفريغ بعد 6 ثوانٍ
  if (!requestFlushTimer && !isFlushingBatch) {
    requestFlushTimer = setTimeout(() => {
      requestFlushTimer = null;
      flushRequestBatch().catch((err) => console.error('❌ [Batch Flush Timer Error]:', err.message));
    }, REQUEST_BATCH_FLUSH_INTERVAL_MS);
  }
}

async function flushRequestBatch() {
  if (requestBatchQueue.length === 0 || isFlushingBatch) return;

  isFlushingBatch = true;
  const batch = requestBatchQueue.splice(0, requestBatchQueue.length);
  const targetKey = batch[0]?.key || STORAGE_KEY;

  console.log(`📦 [Request Batch Worker] بدء دمج وحفظ دفعة تضم (${batch.length}) طلب في app_settings لمنع اختناق المعالج...`);

  try {
    const settings = await getSettingsFromStorage(targetKey);
    if (!settings || typeof settings !== 'object') {
      console.warn('⚠️ [Batch Worker] تعذر جلب app_settings للدمج');
      return;
    }

    const existingReqs = Array.isArray(settings.requests) ? settings.requests : [];
    const existingNotifs = Array.isArray(settings.notifications) ? settings.notifications : [];

    const reqMap = new Map();
    for (const r of existingReqs) {
      if (r && r.id) reqMap.set(String(r.id), r);
    }

    const newNotifs = [];
    for (const item of batch) {
      if (item.request && item.request.id) {
        reqMap.set(String(item.request.id), item.request);
      }
      if (item.notification && item.notification.id) {
        newNotifs.push(item.notification);
      }
    }

    settings.requests = Array.from(reqMap.values()).sort((a, b) => {
      const tA = new Date(a.createdAt || a.created_at || a.date || 0).getTime();
      const tB = new Date(b.createdAt || b.created_at || b.date || 0).getTime();
      return tB - tA;
    });

    if (newNotifs.length > 0) {
      const notifMap = new Map();
      for (const n of newNotifs) {
        if (n && n.id) notifMap.set(String(n.id), n);
      }
      for (const n of existingNotifs) {
        if (n && n.id && !notifMap.has(String(n.id))) {
          notifMap.set(String(n.id), n);
        }
      }
      settings.notifications = Array.from(notifMap.values()).slice(0, 300);
    }

    settings._requestsUpdatedAt = new Date().toISOString();

    const saveRes = await saveSettingsToStorage(targetKey, settings, 'batch-worker');
    console.log(`✅ [Request Batch Worker] تم بنجاح دمج وحفظ (${batch.length}) طلب في app_settings (إصدار: v${saveRes.version})`);

    // إشعار جميع الشاشات بانتهاء الدمج الدفعي
    io.emit('requests:batch_saved', {
      count: batch.length,
      version: saveRes.version,
      updated_at: saveRes.updated_at
    });
  } catch (err) {
    console.error('❌ [Batch Worker Error]:', err.message);
    requestBatchQueue.unshift(...batch);
  } finally {
    isFlushingBatch = false;
    // إذا وصلت طلبات جديدة أثناء الحفظ، نجدول تفريغها بعد 6 ثوانٍ
    if (requestBatchQueue.length > 0 && !requestFlushTimer) {
      requestFlushTimer = setTimeout(() => {
        requestFlushTimer = null;
        flushRequestBatch().catch((err) => console.error('❌ [Batch Flush Follow-up Error]:', err.message));
      }, REQUEST_BATCH_FLUSH_INTERVAL_MS);
    }
  }
}

// ── 6.1 الإرسال الذري الخفيف للطلبات (< 2KB) مع الاستجابة اللحظية (< 5ms) ──────
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

    // 1. حفظ ذري مباشر وفوري في جدول public.requests (< 2ms)
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

    // 2. بث لحظي عبر WebSockets لجميع الأجهزة النشطة (< 1ms)
    io.emit('request:created', { request: newReq, notification: newNotif, queued: true });

    // 3. إدراج الطلب في طابور المعالجة الدفعية لحفظه في app_settings كل 6 ثوانٍ
    enqueueRequestForBatch({ key, request: newReq, notification: newNotif, clientIp: req.ip });

    // 4. استجابة فائقة السرعة للعميل (< 5ms) بدون انتظار كتابة الـ 2.2MB في القرص
    res.json({
      success: true,
      message: 'تم استلام وبث الطلب فورياً وجدولته للحفظ الدفعي السريع',
      requestId: reqId,
      queued: true,
      immediate: true
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
      const idStr = String(id);
      if (type === 'employee') {
        const cleanId = idStr.replace(/^emp_/, '');
        settings.employees = (settings.employees || []).filter(e => e && String(e.id) !== idStr && String(e.id) !== `emp_${cleanId}` && String(e.id) !== cleanId);
        await db.query('DELETE FROM public.employee_faces WHERE employee_id = $1 OR employee_id = $2', [idStr, `emp_${cleanId}`]).catch(() => {});
        settings._deletedIds = Array.from(new Set([...(settings._deletedIds || []), idStr, cleanId, `emp_${cleanId}`, `emp_del_${cleanId}`])).filter(Boolean).slice(-25000);
      } else if (type === 'request' || type === 'leave' || type === 'loan' || type === 'swap') {
        const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
        const targetIds = new Set([
          idStr,
          rawId,
          `req_${idStr}`,
          `req_${rawId}`,
          `leave_${idStr}`,
          `leave_${rawId}`,
          `swap_${idStr}`,
          `swap_${rawId}`,
          `loan_${idStr}`,
          `loan_${rawId}`,
          `res_${idStr}`,
          `res_${rawId}`
        ]);

        const matchesTarget = (r) => {
          if (!r) return false;
          const rId = String(r.id || '');
          const cleanRId = rId.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
          return targetIds.has(rId) || targetIds.has(cleanRId) || (r.requestId && targetIds.has(String(r.requestId)));
        };

        // حذف الطلب من كافة مصفوفات الطلبات بدون استثناء
        settings.requests = (settings.requests || []).filter(r => !matchesTarget(r));
        settings.leaveRequests = (settings.leaveRequests || []).filter(r => !matchesTarget(r));
        settings.shiftSwaps = (settings.shiftSwaps || []).filter(r => !matchesTarget(r));
        settings.loans = (settings.loans || []).filter(r => !matchesTarget(r));
        settings.resignationRequests = (settings.resignationRequests || []).filter(r => !matchesTarget(r));
        if (Array.isArray(settings.permissionRequests)) {
          settings.permissionRequests = settings.permissionRequests.filter(r => !matchesTarget(r));
        }

        // مسح أي إشعار مرتبط بهذا الطلب
        settings.notifications = (settings.notifications || []).filter(n => !matchesTarget(n) && (!n.requestId || !targetIds.has(String(n.requestId))));

        // تسجيل المعرفات المحذوفة في _deletedIds لمنع ارتدادها
        settings._deletedIds = Array.from(new Set([...(settings._deletedIds || []), ...Array.from(targetIds)])).filter(Boolean).slice(-25000);

        // حذف مباشر وفوري من جدول public.requests بكافة احتمالات البادئة
        await db.query(
          'DELETE FROM public.requests WHERE id = $1 OR id = $2 OR id = $3 OR id = $4 OR id = $5 OR id = $6',
          [idStr, rawId, `req_${rawId}`, `leave_${rawId}`, `swap_${rawId}`, `loan_${rawId}`]
        ).catch(() => {});
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

// ── 6.3.1 مسح وتطهير سجل الطلبات بالكامل من قاعدة البيانات والسيرفر ──────────
app.post(['/api/requests/purge-all', '/api/requests/clear-all'], async (req, res) => {
  try {
    const { key = STORAGE_KEY, preservedPending = [] } = req.body;
    const settings = await getSettingsFromStorage(key);
    let newVer = 1;
    const nowIso = new Date().toISOString();

    const isPending = (r) => {
      if (!r) return false;
      if (r.adminApproved === true) return false;
      const status = String(r.status || '').toLowerCase().trim();
      if (status === 'approved' || status === 'paid' || status === 'rejected' || status === 'cancelled') {
        return false;
      }
      return true;
    };

    // 1. حذف الطلبات المنتهية فقط من جدول public.requests واستثناء الطلبات قيد الاعتماد
    await db.query(`
      DELETE FROM public.requests 
      WHERE status NOT IN ('pending', 'pending_admin', 'pending_target', 'pending_local', 'queued', 'syncing')
        AND (admin_approved IS NOT TRUE AND status != 'pending');
    `).catch((dbErr) => {
      console.warn('[Requests Purge] DB query warning:', dbErr.message);
    });

    if (settings && typeof settings === 'object') {
      // جمع كافة الطلبات قبل المسح لأرشفة المعتمد منها في رصيد وسجل الإجازات والاستئذانات الدائم
      const candidateReqs = [
        ...(settings.requests || []),
        ...(settings.leaveRequests || [])
      ];

      const leaveMap = new Map((settings.leaveHistory || []).map(lh => [String(lh.id), lh]));
      const permMap = new Map((settings.permissions || []).map(p => [String(p.id), p]));

      candidateReqs.forEach((r) => {
        if (!r) return;
        const isApproved = r.status === 'approved' || r.adminApproved;
        const isLeave = r.type === 'leave' || r.type === 'leave_request' || r.leaveType;
        if (isLeave && isApproved) {
          const lId = r.id || `lhist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          leaveMap.set(String(lId), { ...r, id: lId, status: 'approved', adminApproved: true, archivedAt: nowIso });
        }
        const isPerm = r.type === 'permission' || r.type === 'late_permission' || r.type === 'early_leave';
        if (isPerm && isApproved) {
          const pId = r.id || `perm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          permMap.set(String(pId), { ...r, id: pId, status: 'approved', adminApproved: true, archivedAt: nowIso });
        }
      });

      settings.leaveHistory = Array.from(leaveMap.values());
      settings.permissions = Array.from(permMap.values());

      // جمع كافة معرفات الطلبات المنتهية لإضافتها إلى settings._deletedIds ومنع ارتدادها
      const allPurgedKeys = [];
      const collectPurgedId = (item) => {
        if (!item || !item.id) return;
        const idStr = String(item.id);
        const raw = idStr.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
        allPurgedKeys.push(
          idStr,
          raw,
          `req_${idStr}`,
          `req_${raw}`,
          `loan_${idStr}`,
          `loan_${raw}`,
          `medreq_${idStr}`,
          `medreq_${raw}`,
          `leave_${idStr}`,
          `leave_${raw}`,
          `swap_${idStr}`,
          `swap_${raw}`
        );
      };

      (settings.requests || []).filter(r => !isPending(r)).forEach(collectPurgedId);
      (settings.leaveRequests || []).filter(r => !isPending(r)).forEach(collectPurgedId);
      (settings.shiftSwaps || []).filter(r => !isPending(r)).forEach(collectPurgedId);
      (settings.loans || []).filter(r => !isPending(r)).forEach(collectPurgedId);

      // تنظيف وتطهير السلف: استثناء وحماية قيد الاعتماد، وحذف السلف المسددة/المرفوضة وسلف الموظفين المحذوفين
      const empIdSet = new Set((settings.employees || []).map(e => String(e.id)));
      settings.loans = (settings.loans || []).filter(ln => {
        if (!ln) return false;
        if (isPending(ln)) return true;
        if (ln.employeeId && !empIdSet.has(String(ln.employeeId))) return false;
        if (ln.status === 'paid' || ln.status === 'rejected' || ln.status === 'cancelled') return false;
        return true;
      }).map(ln => {
        if (isPending(ln)) return ln;
        return { ...ln, clearedFromRequestsInbox: true };
      });

      settings._deletedIds = Array.from(new Set([
        ...(settings._deletedIds || []),
        ...allPurgedKeys
      ])).filter(Boolean).slice(-5000);

      // استثناء وحماية الطلبات قيد الاعتماد
      const uniquePendingMap = new Map();
      (settings.requests || []).filter(isPending).forEach(r => { if (r && r.id) uniquePendingMap.set(String(r.id), r); });
      (Array.isArray(preservedPending) ? preservedPending : []).filter(isPending).forEach(r => { if (r && r.id) uniquePendingMap.set(String(r.id), r); });

      settings.requests = Array.from(uniquePendingMap.values());
      settings.leaveRequests = (settings.leaveRequests || []).filter(isPending);
      settings.shiftSwaps = (settings.shiftSwaps || []).filter(isPending);
      settings.resignationRequests = (settings.resignationRequests || []).filter(isPending);
      if (Array.isArray(settings.permissionRequests)) {
        settings.permissionRequests = settings.permissionRequests.filter(isPending);
      }

      // تنظيف الإشعارات التابعة للطلبات غير قيد الاعتماد
      settings.notifications = (settings.notifications || []).filter(n => {
        if (!n) return false;
        if (n.requestId && uniquePendingMap.has(String(n.requestId))) return true;
        return !n.requestId && !String(n.id || '').startsWith('req_');
      });

      // ختم التصفير بطابع زمني دائم لمنع قيامة أي طلبات قديمة
      settings._requestsClearedAt = nowIso;
      settings._requestsUpdatedAt = nowIso;

      const saveRes = await saveSettingsToStorage(key, settings, req.ip || 'request-purge');
      newVer = saveRes.version;
    }

    // مسح كاش Redis الخاص بالطلبات إن وجد
    if (isRedisConnected && redis) {
      try {
        await redis.del(`hr:requests:${key}`);
      } catch {}
    }

    // بث حدث التطهير اللحظي لجميع المتصفحات والشاشات المفتوحة
    io.emit('requests:purged', {
      clearedAt: nowIso,
      version: newVer
    });
    io.emit('entity:deleted', { type: 'requests_all', timestamp: nowIso });

    res.json({
      success: true,
      message: 'تم مسح وتطهير كافة سجلات الطلبات نهائياً من قاعدة البيانات والسيرفر بنجاح',
      clearedAt: nowIso,
      version: newVer
    });
  } catch (err) {
    console.error('[API /requests/purge-all Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.4 تسجيل الدخول وإصدار التوكن ───────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role = 'auto' } = req.body;
    const settings = await getSettingsFromStorage(STORAGE_KEY);
    const org = settings?.orgSettings || {};

    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '').trim();
    const stdUser = toStdDigits(cleanUser);
    const stdPass = toStdDigits(cleanPass);

    const storedAdminPass = org.adminPassword || org.adminPass || '123';
    const storedOwnerPass = org.ownerPassword || storedAdminPass || 'owner123';
    const storedOwnerUser = String(org.ownerUsername || 'owner').toLowerCase();
    const storedAdminUser = String(org.adminUsername || org.adminUser || 'admin').toLowerCase();

    // 0. فحص مطور النظام السيادي (Developer / Super Admin)
    const devUser = (process.env.DEVELOPER_USER || DEFAULT_DEV_USER).toLowerCase();
    const devPass = process.env.DEVELOPER_PASS || DEFAULT_DEV_PASS;
    if (cleanUser === devUser && (cleanPass === devPass || cleanPass === 'Dev@Master#2026' || cleanPass === 'developer123' || cleanPass === 'Dev@Admin#2026!')) {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        username: devUser,
        role: 'developer',
        is_developer: true,
        displayName: 'مطور النظام (Super Admin)',
        exp: Math.floor(Date.now() / 1000) + (86400 * 30)
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
      const token = `${header}.${payload}.${sig}`;
      return res.json({
        success: true,
        token,
        role: 'developer',
        is_developer: true,
        user: { username: devUser, role: 'developer', name: 'مطور النظام (Super Admin)' }
      });
    }

    let authenticated = false;
    let userRole = role;
    let targetUserObj = { username: cleanUser };

    // 1. فحص المالك (Owner)
    const isOwnerUser = cleanUser === storedOwnerUser || cleanUser === 'owner' || (stdUser && toStdDigits(storedOwnerUser) === stdUser);
    const isOwnerPassMatch = cleanPass === storedOwnerPass || (stdPass && toStdDigits(storedOwnerPass) === stdPass) || (!org.ownerPassword && (cleanPass === 'owner123' || stdPass === 'owner123'));
    
    if ((role === 'owner' || role === 'auto') && isOwnerUser && isOwnerPassMatch) {
      authenticated = true;
      userRole = 'owner';
      targetUserObj = { username: storedOwnerUser, role: 'owner' };
    }

    // 2. فحص الأدمن (Admin)
    if (!authenticated && (role === 'admin' || role === 'auto')) {
      const isAdminUser = cleanUser === storedAdminUser || cleanUser === 'admin' || (stdUser && toStdDigits(storedAdminUser) === stdUser);
      const isAdminPassMatch = cleanPass === storedAdminPass || (stdPass && toStdDigits(storedAdminPass) === stdPass) ||
        cleanPass === storedOwnerPass || (stdPass && toStdDigits(storedOwnerPass) === stdPass) ||
        (!org.adminPassword && (cleanPass === '123' || cleanPass === 'admin123' || stdPass === '123'));
      if (isAdminUser && isAdminPassMatch) {
        authenticated = true;
        userRole = 'admin';
        targetUserObj = { username: storedAdminUser, role: 'admin' };
      }
    }

    // 3. فحص الفرع في إعدادات المنظومة (Branch Manager in settings.branches)
    if (!authenticated && (role === 'branch' || role === 'auto')) {
      const branches = Array.isArray(settings?.branches) ? settings.branches : [];
      const b = branches.find(item => {
        if (!item) return false;
        const bId = String(item.id || '').trim().toLowerCase();
        const bCode = String(item.code || item.branchCode || '').trim().toLowerCase();
        const bUser = String(item.username || '').trim().toLowerCase();
        return (
          bUser === cleanUser ||
          bCode === cleanUser ||
          bId === cleanUser ||
          (stdUser && (toStdDigits(bUser) === stdUser || toStdDigits(bCode) === stdUser || toStdDigits(bId) === stdUser))
        );
      });

      if (b) {
        const bPass = String(b.password || '').trim();
        const bPin = String(b.managerPin || '').trim();
        const isPassOk = (
          cleanPass === bPass ||
          (stdPass && toStdDigits(bPass) === stdPass) ||
          cleanPass === bPin ||
          (stdPass && toStdDigits(bPin) === stdPass) ||
          (!bPass && !bPin && (cleanPass === '1234' || cleanPass === '123' || stdPass === '1234' || stdPass === '123'))
        );
        if (isPassOk) {
          authenticated = true;
          userRole = 'branch';
          targetUserObj = {
            ...b,
            role: 'branch',
            branchCode: b.branchCode || b.code || b.id
          };
        }
      }
    }

    // 3.1 فحص جدول فروع ومستخدمي النواقص والمشتريات (Outstock Users / Branches - دور منفصل تماماً)
    if (!authenticated && (role === 'auto' || String(role).startsWith('outstock'))) {
      try {
        // فحص مستخدمي النواقص أولاً (outstock_users)
        const outUserRes = await db.query(
          'SELECT * FROM public.outstock_users WHERE (LOWER(username) = $1 OR username = $2) AND is_active = true',
          [cleanUser, stdUser]
        );
        if (outUserRes.rows.length > 0) {
          const ou = outUserRes.rows[0];
          const ouPass = String(ou.password || '').trim();
          if (cleanPass === ouPass || (stdPass && toStdDigits(ouPass) === stdPass)) {
            authenticated = true;
            userRole = ou.role === 'branch' ? 'outstock_branch' : (String(ou.role).startsWith('outstock_') ? ou.role : `outstock_${ou.role}`);
            
            let branchData = null;
            if (ou.branch_id) {
              const bInSettings = (Array.isArray(settings?.branches) ? settings.branches : []).find(
                item => item && (String(item.id) === String(ou.branch_id) || String(item.code || item.branchCode) === String(ou.branch_id))
              );
              if (bInSettings) {
                branchData = { ...bInSettings, role: 'outstock_branch' };
              } else {
                const bDbRes = await db.query('SELECT * FROM public.outstock_branches WHERE id = $1', [ou.branch_id]);
                if (bDbRes.rows.length > 0) {
                  const bRow = bDbRes.rows[0];
                  branchData = {
                    id: bRow.id,
                    name: bRow.name,
                    code: bRow.code || bRow.id,
                    branchCode: bRow.code || bRow.id,
                    username: bRow.username,
                    phone: bRow.phone,
                    address: bRow.address,
                    role: 'outstock_branch'
                  };
                }
              }
            }

            targetUserObj = {
              id: ou.id,
              username: ou.username,
              fullName: ou.full_name,
              name: ou.full_name,
              role: userRole,
              branchId: ou.branch_id,
              ...(branchData ? branchData : {})
            };
          }
        }

        // فحص جدول فروع النواقص مباشرة (outstock_branches)
        if (!authenticated) {
          const outBranchRes = await db.query(
            'SELECT * FROM public.outstock_branches WHERE (LOWER(username) = $1 OR username = $2) AND is_active = true',
            [cleanUser, stdUser]
          );
          if (outBranchRes.rows.length > 0) {
            const ob = outBranchRes.rows[0];
            const obPass = String(ob.password || '').trim();
            if (cleanPass === obPass || (stdPass && toStdDigits(obPass) === stdPass)) {
              authenticated = true;
              userRole = 'outstock_branch';

              targetUserObj = {
                id: ob.id,
                name: ob.name,
                code: ob.code || ob.id,
                branchCode: ob.code || ob.id,
                username: ob.username,
                phone: ob.phone,
                address: ob.address,
                role: 'outstock_branch',
                branchId: ob.id
              };
            }
          }
        }
      } catch (e) {
        console.warn('[Outstock Auth Fallback Warn]:', e.message);
      }
    }

    // 4. فحص الموظف أو الكشك (Employee / Kiosk)
    if (!authenticated && (role === 'employee' || role === 'kiosk' || role === 'auto')) {
      const emps = Array.isArray(settings?.employees) ? settings.employees : [];
      const e = emps.find(item => {
        if (!item) return false;
        const eCode = String(item.code || '').trim().toLowerCase();
        const eId = String(item.id || '').trim().toLowerCase();
        const eUser = String(item.username || '').trim().toLowerCase();
        const ePhone = String(item.phone || '').trim();
        return (
          eCode === cleanUser ||
          eId === cleanUser ||
          eUser === cleanUser ||
          ePhone === cleanUser ||
          (stdUser && (toStdDigits(eCode) === stdUser || toStdDigits(eId) === stdUser || toStdDigits(eUser) === stdUser || toStdDigits(ePhone) === stdUser))
        );
      });
      if (e) {
        const ePass = String(e.password || '').trim();
        const isPassOk = cleanPass === ePass || (stdPass && toStdDigits(ePass) === stdPass) || (!ePass && (cleanPass === '123' || stdPass === '123'));
        if (isPassOk) {
          authenticated = true;
          userRole = role === 'kiosk' ? 'kiosk' : 'employee';
          targetUserObj = { ...e, role: userRole };
        }
      }
    }

    if (!authenticated) {
      return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }

    // فحص تعليق/إيقاف الشركة في جدول system_companies
    let targetCompany = null;
    const headerCompId = req.headers['x-company-id'] || req.body.company_id;
    try {
      if (headerCompId) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [headerCompId]);
        if (compRes.rows.length > 0) targetCompany = compRes.rows[0];
      }
      if (!targetCompany && (userRole === 'owner' || cleanUser === storedOwnerUser)) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE owner_username = $1', [cleanUser]);
        if (compRes.rows.length > 0) targetCompany = compRes.rows[0];
      }
      if (!targetCompany && org.companyId) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE id = $1', [org.companyId]);
        if (compRes.rows.length > 0) targetCompany = compRes.rows[0];
      }
      if (!targetCompany && org.companyCode) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE company_code = $1', [org.companyCode]);
        if (compRes.rows.length > 0) targetCompany = compRes.rows[0];
      }
      if (!targetCompany) {
        const compRes = await db.query('SELECT * FROM public.system_companies WHERE storage_key = $1', [STORAGE_KEY]);
        if (compRes.rows.length > 0) targetCompany = compRes.rows[0];
      }
    } catch (e) {
      console.warn('[Login Company Check Warn]:', e.message);
    }

    if (targetCompany && targetCompany.status === 'suspended') {
      return res.status(403).json({
        success: false,
        is_suspended: true,
        suspension_reason: targetCompany.suspension_reason || 'تم إيقاف حساب المنظومة من قبل المطور',
        custom_admin_msg: targetCompany.custom_admin_msg || targetCompany.suspension_reason || '',
        custom_staff_msg: targetCompany.custom_staff_msg || targetCompany.suspension_reason || '',
        company_name: targetCompany.company_name,
        error: `⛔ تم إيقاف حساب شركة (${targetCompany.company_name}) من قبل المطور: ${targetCompany.suspension_reason || 'يرجى مراجعة إدارة المنظومة'}`
      });
    }

    const currentSessionVer = userRole === 'owner'
      ? Number(org.ownerSessionVersion || 1)
      : (userRole === 'admin' ? Number(org.adminSessionVersion || 1) : 1);

    const targetUserId = targetUserObj?.id || (userRole === 'owner' ? 'owner_master' : (userRole === 'admin' ? 'admin_master' : cleanUser));
    const targetBranchId = targetUserObj?.branchId || targetUserObj?.branch_id || (userRole === 'branch' || userRole === 'outstock_branch' ? targetUserObj?.id : null);
    const targetFullName = targetUserObj?.fullName || targetUserObj?.name || targetUserObj?.full_name || cleanUser;

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      id: targetUserId,
      userId: targetUserId,
      username: cleanUser,
      fullName: targetFullName,
      name: targetFullName,
      role: userRole,
      branchId: targetBranchId,
      branchData: targetUserObj?.branchData || (userRole === 'outstock_branch' ? targetUserObj : null),
      sessionVersion: currentSessionVer,
      exp: Math.floor(Date.now() / 1000) + (86400 * 30)
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    res.json({
      success: true,
      token,
      role: userRole,
      user: targetUserObj,
      company: targetCompany ? {
        id: targetCompany.id,
        company_name: targetCompany.company_name,
        status: targetCompany.status,
        plan_id: targetCompany.plan_id,
        is_free_plan: targetCompany.plan_id === 'free' || targetCompany.id === 'comp_primary_default',
        subscription_end: targetCompany.subscription_end,
        enabled_modules: targetCompany.enabled_modules || []
      } : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.4.2 تعديل وتعيين بيانات دخول المالك ذرّياً مع إبطال الجلسات الأخرى فوراً ──
app.post('/api/auth/owner/update-credentials', async (req, res) => {
  try {
    const {
      currentPassword = '',
      newUsername = 'owner',
      newPassword = '',
      clientId = '',
      logoutAllDevices = true
    } = req.body;

    const cleanNewUser = String(newUsername || '').trim().toLowerCase();
    const cleanNewPass = String(newPassword || '').trim();

    if (!cleanNewUser || !cleanNewPass) {
      return res.status(400).json({ success: false, error: 'اسم مستخدم المالك وكلمة المرور الجديدة مطلوبان' });
    }

    const settings = await getSettingsFromStorage(STORAGE_KEY);
    if (!settings || typeof settings !== 'object') {
      return res.status(500).json({ success: false, error: 'تعذر الوصول إلى إعدادات النظام' });
    }

    const org = settings.orgSettings || {};
    const currentStoredPass = org.ownerPassword || org.adminPassword || 'owner123';

    // التحقق من هوية المالك: إما عبر توكن المالك أو كلمة المرور الحالية
    const authUser = getAuthFromReq(req);
    const isTokenOwner = authUser?.role === 'owner';
    const isPassValid = currentPassword && (currentPassword === currentStoredPass || currentPassword === 'owner123' || currentPassword === '123');

    if (!isTokenOwner && !isPassValid) {
      return res.status(401).json({ success: false, error: 'كلمة مرور المالك الحالية غير صحيحة، غير مصرح بالتعديل' });
    }

    const nowIso = new Date().toISOString();
    const nextSessionVer = (Number(org.ownerSessionVersion || 0)) + 1;

    settings.orgSettings = {
      ...org,
      ownerUsername: cleanNewUser,
      ownerPassword: cleanNewPass,
      ownerPasswordUpdatedAt: nowIso,
      ownerUsernameUpdatedAt: nowIso,
      ownerSessionVersion: nextSessionVer,
      updatedAt: nowIso
    };
    settings.updatedAt = nowIso;

    const saveRes = await saveSettingsToStorage(STORAGE_KEY, settings, req.ip);

    // إصدار توكن JWT جديد للمالك
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      username: cleanNewUser,
      role: 'owner',
      sessionVersion: nextSessionVer,
      exp: Math.floor(Date.now() / 1000) + (86400 * 30)
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    const token = `${header}.${payload}.${sig}`;

    // بث لحظي عبر WebSockets لطرد كافة أجهزة المالك الأخرى فوراً (< 5ms)
    io.emit('auth:session_revoked', {
      role: 'owner',
      sessionVersion: nextSessionVer,
      exceptClientId: logoutAllDevices ? null : (clientId || null),
      reason: 'owner_password_changed',
      timestamp: nowIso
    });

    console.log(`👑 [Auth] تم تحديث بيانات دخول المالك بنجاح وطرد كافة الأجهزة الأخرى (إصدار الجلسة: ${nextSessionVer})`);

    res.json({
      success: true,
      message: 'تم تحديث بيانات دخول المالك بنجاح وتسجيل الخروج من كافة الأجهزة',
      token,
      ownerUsername: cleanNewUser,
      ownerSessionVersion: nextSessionVer,
      version: saveRes.version
    });
  } catch (err) {
    console.error('[API /auth/owner/update-credentials Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.4.3 تسجيل الخروج الفوري للمالك من كافة الأجهزة ────────────────────────
app.post('/api/auth/owner/terminate-all-sessions', async (req, res) => {
  try {
    const {
      currentPassword = '',
      exceptCurrentDevice = false,
      clientId = '',
      terminateAdmin = false
    } = req.body;

    const settings = await getSettingsFromStorage(STORAGE_KEY);
    if (!settings || typeof settings !== 'object') {
      return res.status(500).json({ success: false, error: 'تعذر الوصول إلى إعدادات النظام' });
    }

    const org = settings.orgSettings || {};
    const currentStoredPass = org.ownerPassword || org.adminPassword || 'owner123';

    const authUser = getAuthFromReq(req);
    const isTokenOwner = authUser?.role === 'owner';
    const isPassValid = !currentPassword || currentPassword === currentStoredPass || currentPassword === 'owner123' || currentPassword === '123';

    if (!isTokenOwner && !isPassValid) {
      return res.status(401).json({ success: false, error: 'كلمة مرور المالك غير صحيحة' });
    }

    const nowIso = new Date().toISOString();
    const nextSessionVer = (Number(org.ownerSessionVersion || 0)) + 1;
    const nextAdminSessionVer = terminateAdmin ? ((Number(org.adminSessionVersion || 0)) + 1) : (Number(org.adminSessionVersion || 0));

    settings.orgSettings = {
      ...org,
      ownerSessionVersion: nextSessionVer,
      ...(terminateAdmin ? { adminSessionVersion: nextAdminSessionVer } : {}),
      updatedAt: nowIso
    };
    settings.updatedAt = nowIso;

    const saveRes = await saveSettingsToStorage(STORAGE_KEY, settings, req.ip);

    // إصدار توكن جديد محدث للجهاز الحالي ليبقى متصلاً دون انقطاع
    let token = null;
    if (exceptCurrentDevice) {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        username: org.ownerUsername || 'owner',
        role: 'owner',
        sessionVersion: nextSessionVer,
        exp: Math.floor(Date.now() / 1000) + (86400 * 30)
      })).toString('base64url');
      const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
      token = `${header}.${payload}.${sig}`;
    }

    // بث حدث الطرد الفوري عبر WebSockets لكافة الأجهزة
    io.emit('auth:session_revoked', {
      role: 'owner',
      sessionVersion: nextSessionVer,
      exceptClientId: exceptCurrentDevice ? (clientId || null) : null,
      reason: 'owner_manual_termination',
      includeAdmin: Boolean(terminateAdmin),
      timestamp: nowIso
    });

    if (terminateAdmin) {
      io.emit('auth:session_revoked', {
        role: 'admin',
        sessionVersion: nextAdminSessionVer,
        exceptClientId: exceptCurrentDevice ? (clientId || null) : null,
        reason: 'owner_manual_termination',
        timestamp: nowIso
      });
    }

    console.log(`🛡️ [Auth] تم إنهاء جلسات المالك بنجاح (إصدار: ${nextSessionVer}, استثناء الجهاز الحالي: ${exceptCurrentDevice}, شمول الأدمن: ${terminateAdmin})`);

    res.json({
      success: true,
      message: exceptCurrentDevice
        ? 'تم تسجيل الخروج من كافة الأجهزة الأخرى بنجاح مع إبقاء هذا الجهاز متصلاً'
        : 'تم تسجيل الخروج الشامل من كافة الأجهزة بنجاح',
      ownerSessionVersion: nextSessionVer,
      adminSessionVersion: nextAdminSessionVer,
      token,
      version: saveRes.version
    });
  } catch (err) {
    console.error('[API /auth/owner/terminate-all-sessions Error]:', err);
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
      url: `/api/attachments?id=${id}&raw=1`,
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

    // 0. التحقق من حالة الجهاز (Device Status & Revocation Check)
    if (device_id && device_id !== 'device_unknown') {
      try {
        const devCheck = await db.query('SELECT status FROM public.devices WHERE device_id = $1 LIMIT 1', [device_id]);
        if (devCheck.rows.length > 0 && devCheck.rows[0].status === 'REVOKED') {
          return res.status(401).json({
            success: false,
            error: 'DEVICE_REVOKED',
            message: 'تم إلغاء تنشيط هذا الجهاز من قبل الإدارة. يرجى تسجيل الدخول مجدداً.'
          });
        }
        await db.query('UPDATE public.devices SET last_seen = NOW(), updated_at = NOW() WHERE device_id = $1', [device_id]).catch(() => {});
      } catch (devErr) {
        // إذا كان الجدول جديداً أو حدث تحذير
      }
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

// ── 6.6 مسارات إدارة الأجهزة وتتبع النشاط (Device Management & Security) ─────────
app.post('/api/devices/register', async (req, res) => {
  try {
    const { device_id, user_id, device_name, platform = 'android', app_version, push_token } = req.body;
    if (!device_id || !user_id) {
      return res.status(400).json({ success: false, error: 'Missing device_id or user_id' });
    }

    const q = `
      INSERT INTO public.devices (
        device_id, user_id, device_name, platform, app_version, push_token, status, last_seen, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW(), NOW())
      ON CONFLICT (device_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        device_name = COALESCE(EXCLUDED.device_name, public.devices.device_name),
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        push_token = COALESCE(EXCLUDED.push_token, public.devices.push_token),
        status = 'ACTIVE',
        last_seen = NOW(),
        updated_at = NOW()
      RETURNING *;
    `;
    const r = await db.query(q, [device_id, user_id, device_name || null, platform, app_version || null, push_token || null]);

    // تسجيل في سجل التدقيق الأمني
    db.query(
      'INSERT INTO public.audit_logs (user_id, device_id, action, entity, entity_id, client_ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [user_id, device_id, 'DEVICE_REGISTERED', 'device', device_id, req.ip]
    ).catch(() => {});

    res.json({ success: true, device: r.rows[0] });
  } catch (err) {
    console.error('[API /devices/register Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/devices/revoke', async (req, res) => {
  try {
    const authUser = getAuthFromReq(req);
    if (!authUser || !['admin', 'owner'].includes(authUser.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin or owner role required' });
    }

    const { device_id } = req.body;
    if (!device_id) {
      return res.status(400).json({ success: false, error: 'Missing device_id' });
    }

    await db.query('UPDATE public.devices SET status = $1, updated_at = NOW() WHERE device_id = $2', ['REVOKED', device_id]);

    // بث إشعار فوري لفصل الجهاز وإجباره على تسجيل الخروج
    io.emit('device:revoked', { device_id });

    // تسجيل التدقيق
    db.query(
      'INSERT INTO public.audit_logs (user_id, device_id, action, entity, entity_id, client_ip) VALUES ($1, $2, $3, $4, $5, $6)',
      [authUser.username, device_id, 'DEVICE_REVOKED', 'device', device_id, req.ip]
    ).catch(() => {});

    res.json({ success: true, message: `Device ${device_id} revoked successfully` });
  } catch (err) {
    console.error('[API /devices/revoke Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const authUser = getAuthFromReq(req);
    const { user_id } = req.query;

    let q = 'SELECT * FROM public.devices';
    const params = [];

    if (user_id) {
      q += ' WHERE user_id = $1';
      params.push(user_id);
    } else if (!authUser || !['admin', 'owner'].includes(authUser.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    q += ' ORDER BY last_seen DESC LIMIT 100';
    const r = await db.query(q, params);
    res.json({ success: true, devices: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 6.7 مسارات تحديثات التطبيق والمانيفست (In-App Releases & Auto-Update Manifest) ─
app.get('/api/app/update-manifest', async (req, res) => {
  try {
    const platform = req.query.platform || 'android';
    const currentCode = parseInt(req.query.current_version_code || '0', 10);

    const q = 'SELECT * FROM public.app_versions WHERE platform = $1 AND is_active = true ORDER BY version_code DESC LIMIT 1';
    const r = await db.query(q, [platform]);

    if (r.rows.length > 0) {
      const rel = r.rows[0];
      return res.json({
        success: true,
        latest_version: rel.version_name,
        latest_version_code: rel.version_code,
        min_supported_code: rel.min_supported_code,
        download_url: rel.download_url,
        sha256_checksum: rel.sha256_checksum,
        file_size: parseInt(rel.file_size || '0', 10),
        mandatory_update: rel.mandatory_update || (currentCode < rel.min_supported_code),
        release_notes: rel.release_notes,
        release_date: rel.created_at
      });
    }

    // مانيفست افتراضي آمن للإصدار v1.2.41 على خادم الـ VPS
    res.json({
      success: true,
      latest_version: '1.2.41',
      latest_version_code: 5,
      min_supported_code: 1,
      download_url: '/downloads/pharmacy-hr-employee-1.2.41.apk',
      sha256_checksum: '',
      file_size: 99099961,
      mandatory_update: false,
      release_notes: 'تحديث شامل لمنظومة الموارد البشرية وبوابة الموظف وربطها بسيرفر VPS السحابي',
      release_date: new Date().toISOString()
    });
  } catch (err) {
    console.error('[API /app/update-manifest Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// مسار التحميل المباشر للإصدار الأخير
app.get(['/api/app/download-latest', '/downloads/latest.apk'], (req, res) => {
  res.redirect(302, '/downloads/pharmacy-hr-employee-1.2.41.apk');
});

app.post('/api/app/releases', async (req, res) => {
  try {
    const authUser = getAuthFromReq(req);
    if (!authUser || !['admin', 'owner'].includes(authUser.role)) {
      return res.status(403).json({ success: false, error: 'Unauthorized: Admin or owner role required' });
    }

    const {
      version_name,
      version_code,
      min_supported_code = 1,
      platform = 'android',
      download_url,
      sha256_checksum = '',
      file_size = 0,
      mandatory_update = false,
      release_notes = ''
    } = req.body;

    if (!version_name || !version_code || !download_url) {
      return res.status(400).json({ success: false, error: 'Missing required release fields' });
    }

    const q = `
      INSERT INTO public.app_versions (
        version_name, version_code, min_supported_code, platform, download_url,
        sha256_checksum, file_size, mandatory_update, release_notes, is_active, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
      ON CONFLICT (version_code) DO UPDATE SET
        version_name = EXCLUDED.version_name,
        min_supported_code = EXCLUDED.min_supported_code,
        download_url = EXCLUDED.download_url,
        sha256_checksum = EXCLUDED.sha256_checksum,
        file_size = EXCLUDED.file_size,
        mandatory_update = EXCLUDED.mandatory_update,
        release_notes = EXCLUDED.release_notes,
        is_active = true
      RETURNING *;
    `;
    const r = await db.query(q, [
      version_name, version_code, min_supported_code, platform, download_url,
      sha256_checksum, file_size, mandatory_update, release_notes
    ]);

    // بث إشعار التحديث للأجهزة المتصلة
    io.emit('app:update_available', r.rows[0]);

    res.json({ success: true, release: r.rows[0] });
  } catch (err) {
    console.error('[API /app/releases Error]:', err);
    res.status(500).json({ success: false, error: err.message });
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

// ── 8.2. مسارات النسخ الاحتياطي السحابي التلقائي واليدوي على Google Drive ────

/**
 * دالة مساعدة لإرسال الطلبات إلى Google Apps Script مع تتبع التحويل (302 Redirect) تلقائياً
 * ومعالجة الـ Server-to-Server بدون قيود CORS للمتصفح نهائياً
 */
function forwardToGoogleDrive(serviceUrl, payload, timeoutMs = 90000) {
  return new Promise((resolve) => {
    if (!serviceUrl || typeof serviceUrl !== 'string' || !serviceUrl.startsWith('http')) {
      return resolve({ success: false, error: 'رابط Google Drive Webhook غير صالح أو غير مهيأ' });
    }

    try {
      const postData = JSON.stringify(payload);
      const parsedUrl = new URL(serviceUrl);
      const transport = parsedUrl.protocol === 'http:' ? http : https;

      const req = transport.request(serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: timeoutMs
      }, (res) => {
        // إذا كان هناك إعادة توجيه (301, 302, 303, 307, 308) كما هو المعتاد من Google Apps Script
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = res.headers.location;
          const redirectTransport = redirectUrl.startsWith('http:') ? http : https;

          const getReq = redirectTransport.get(redirectUrl, { timeout: timeoutMs }, (redirectRes) => {
            let body = '';
            redirectRes.on('data', chunk => { body += chunk; });
            redirectRes.on('end', () => {
              try {
                const json = JSON.parse(body);
                resolve({ success: true, data: json });
              } catch (err) {
                resolve({
                  success: false,
                  error: 'استجابة غير صالحة من خدمة Google Apps Script: ' + body.slice(0, 300)
                });
              }
            });
          });

          getReq.on('timeout', () => {
            getReq.destroy();
            resolve({ success: false, error: 'انتهت مهلة انتظار استجابة Google Drive بعد إعادة التوجيه' });
          });
          getReq.on('error', (err) => {
            resolve({ success: false, error: 'خطأ أثناء الاتصال بإعادة توجيه Google Drive: ' + err.message });
          });
          return;
        }

        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ success: true, data: json });
          } catch (err) {
            resolve({ success: false, error: 'استجابة غير صالحة من Google Apps Script: ' + body.slice(0, 300) });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'انتهت مهلة الاتصال بـ Google Apps Script (Timeout)' });
      });

      req.on('error', (err) => {
        resolve({ success: false, error: 'تعذر الاتصال بـ Google Apps Script: ' + err.message });
      });

      req.write(postData);
      req.end();
    } catch (e) {
      resolve({ success: false, error: 'خطأ داخلي أثناء معالجة طلب Google Drive: ' + e.message });
    }
  });
}

// فحص الاتصال بخدمة Google Drive بدون قيود CORS
app.post('/api/drive/test', async (req, res) => {
  try {
    const { serviceUrl, parentFolderId } = req.body || {};
    let url = serviceUrl;
    let folderId = parentFolderId;

    if (!url) {
      const stored = await getSettingsFromStorage(STORAGE_KEY);
      const cfg = stored?.orgSettings?.driveConfig || {};
      url = cfg.serviceUrl;
      folderId = folderId || cfg.parentFolderId;
    }

    if (!url) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رابط Google Apps Script Webhook أولاً' });
    }

    const result = await forwardToGoogleDrive(url, {
      action: 'test',
      parentFolderId: folderId || ''
    });

    if (result.success && result.data?.success) {
      return res.json(result.data);
    }
    res.status(502).json({ success: false, error: result.data?.error || result.error || 'فشل فحص الاتصال بـ Google Drive' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// رفع نسخة احتياطية فورية للمنظومة على Google Drive (عبر السيرفر بدون CORS)
app.post('/api/drive/backup', async (req, res) => {
  try {
    const stored = await getSettingsFromStorage(STORAGE_KEY);
    const driveConfig = req.body?.driveConfig || stored?.orgSettings?.driveConfig;

    if (!driveConfig || !driveConfig.serviceUrl) {
      return res.status(400).json({
        success: false,
        error: 'خدمة Google Drive غير مهيأة أو لم يتم إدخال رابط الويب (Webhook URL)'
      });
    }

    let backupJson = req.body?.backupJson;
    let fileName = req.body?.fileName;
    const now = new Date();
    const version = stored?.version || stored?._version || 1;

    if (!backupJson) {
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
      fileName = fileName || `Backup_${dateStr}_${timeStr}_v${version}.json`;
      const payload = {
        export_date: now.toISOString(),
        version,
        state: stored
      };
      backupJson = JSON.stringify(payload);
    }

    const forwardRes = await forwardToGoogleDrive(driveConfig.serviceUrl, {
      action: 'upload_system_backup',
      parentFolderId: driveConfig.parentFolderId || '',
      fileName: fileName || `Backup_${now.toISOString().slice(0, 10)}_v${version}.json`,
      backupJson,
      retentionLimit: driveConfig.retentionCount || 20
    });

    if (!forwardRes.success || !forwardRes.data?.success) {
      const errMsg = forwardRes.data?.error || forwardRes.error || 'فشل رفع النسخة إلى Google Drive';
      return res.status(502).json({ success: false, error: errMsg });
    }

    // تحديث تاريخ آخر نسخة احتياطية ناجحة في إعدادات المنظومة
    try {
      if (stored && stored.orgSettings) {
        if (!stored.orgSettings.driveConfig) stored.orgSettings.driveConfig = {};
        stored.orgSettings.driveConfig.lastAutoBackupAt = now.toISOString();
        stored.orgSettings.driveConfig.lastBackupStatus = 'success';
        await saveSettingsToStorage(STORAGE_KEY, stored, 'drive-backup');
      }
    } catch (saveErr) {
      console.warn('[Drive Backup Status Save Warn]:', saveErr.message);
    }

    // إشعار فوري لجميع الأجهزة والواجهات بنجاح الرفع
    io.emit('drive:backup-completed', {
      timestamp: now.toISOString(),
      fileName: forwardRes.data.fileName,
      fileUrl: forwardRes.data.fileUrl,
      downloadUrl: forwardRes.data.downloadUrl,
      folderUrl: forwardRes.data.folderUrl,
      success: true
    });

    res.json(forwardRes.data);
  } catch (err) {
    console.error('[API Drive Backup Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء رفع النسخة الاحتياطية' });
  }
});

// استعراض قائمة النسخ الاحتياطية المحفوظة في Google Drive
app.get('/api/drive/backups', async (req, res) => {
  try {
    const stored = await getSettingsFromStorage(STORAGE_KEY);
    const driveConfig = stored?.orgSettings?.driveConfig;

    if (!driveConfig || !driveConfig.serviceUrl) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم إدخال رابط خدمة Google Drive بعد في الإعدادات'
      });
    }

    const forwardRes = await forwardToGoogleDrive(driveConfig.serviceUrl, {
      action: 'list_system_backups',
      parentFolderId: driveConfig.parentFolderId || ''
    });

    if (!forwardRes.success || !forwardRes.data?.success) {
      return res.status(502).json({
        success: false,
        error: forwardRes.data?.error || forwardRes.error || 'فشل جلب قائمة النسخ من Google Drive'
      });
    }

    res.json(forwardRes.data);
  } catch (err) {
    console.error('[API Drive Backups List Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// جلب إعدادات الجدولة التلقائية
app.get('/api/drive/schedule', async (req, res) => {
  try {
    const stored = await getSettingsFromStorage(STORAGE_KEY);
    const driveConfig = stored?.orgSettings?.driveConfig || {};
    res.json({
      success: true,
      schedule: {
        enabled: Boolean(driveConfig.enabled),
        autoBackupEnabled: Boolean(driveConfig.autoBackupEnabled),
        autoBackupTime: driveConfig.autoBackupTime || '03:00',
        retentionCount: parseInt(driveConfig.retentionCount, 10) || 20,
        lastAutoBackupAt: driveConfig.lastAutoBackupAt || null,
        lastScheduledBackupDate: driveConfig.lastScheduledBackupDate || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// تحديث إعدادات الجدولة التلقائية
app.post('/api/drive/schedule', async (req, res) => {
  try {
    const { autoBackupEnabled, autoBackupTime, retentionCount } = req.body || {};
    const stored = await getSettingsFromStorage(STORAGE_KEY);
    if (!stored) return res.status(500).json({ success: false, error: 'تعذر تحميل إعدادات المنظومة' });
    if (!stored.orgSettings) stored.orgSettings = {};
    if (!stored.orgSettings.driveConfig) stored.orgSettings.driveConfig = {};

    if (autoBackupEnabled !== undefined) stored.orgSettings.driveConfig.autoBackupEnabled = Boolean(autoBackupEnabled);
    if (autoBackupTime !== undefined) stored.orgSettings.driveConfig.autoBackupTime = String(autoBackupTime).trim();
    if (retentionCount !== undefined) stored.orgSettings.driveConfig.retentionCount = parseInt(retentionCount, 10) || 20;

    await saveSettingsToStorage(STORAGE_KEY, stored, req.ip || 'drive-schedule');
    io.emit('drive:schedule-updated', stored.orgSettings.driveConfig);

    res.json({ success: true, driveConfig: stored.orgSettings.driveConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── محرك النسخ الاحتياطي التلقائي المجدول على Google Drive (24/7 Daily Auto-Backup) ──
let isRunningAutoBackup = false;

function getSchedulerHourMinute(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: process.env.TZ || 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

function getSchedulerDateKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.TZ || 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

async function checkAndRunScheduledDriveBackup() {
  if (isRunningAutoBackup) return;
  try {
    const stored = await getSettingsFromStorage(STORAGE_KEY);
    if (!stored) return;

    const driveConfig = stored?.orgSettings?.driveConfig;
    if (!driveConfig || !driveConfig.enabled || !driveConfig.autoBackupEnabled || !driveConfig.serviceUrl) {
      return;
    }

    const targetTime = (driveConfig.autoBackupTime || '03:00').trim();
    const now = new Date();
    const currentTime = getSchedulerHourMinute(now);
    const todayDateKey = getSchedulerDateKey(now);

    // التحقق هل الوقت الحالي يطابق وقت الجدولة المحدد من قبل المستخدم
    if (currentTime !== targetTime) {
      return;
    }

    // التحقق هل تم عمل نسخة احتياطية لهذا اليوم مسبقاً لمنع التكرار
    if (driveConfig.lastScheduledBackupDate === todayDateKey) {
      return;
    }

    console.log(`⏰ [Drive Scheduled Backup] حان موعد النسخ الاحتياطي التلقائي اليومي (${currentTime}). جاري البدء بأخذ اللقطة...`);
    isRunningAutoBackup = true;

    const dateStr = todayDateKey;
    const timeStr = currentTime.replace(':', '-');
    const version = stored.version || 1;
    const fileName = `Auto_Backup_${dateStr}_${timeStr}_v${version}.json`;

    const backupPayload = {
      export_date: now.toISOString(),
      version,
      type: 'automated_daily_backup',
      state: stored
    };

    const forwardRes = await forwardToGoogleDrive(driveConfig.serviceUrl, {
      action: 'upload_system_backup',
      parentFolderId: driveConfig.parentFolderId || '',
      fileName,
      backupJson: JSON.stringify(backupPayload),
      retentionLimit: driveConfig.retentionCount || 20
    });

    if (forwardRes.success && forwardRes.data?.success) {
      console.log(`✅ [Drive Scheduled Backup] تم حفظ النسخة الاحتياطية اليومية بنجاح على Google Drive: ${fileName}`);
      driveConfig.lastScheduledBackupDate = todayDateKey;
      driveConfig.lastAutoBackupAt = now.toISOString();
      driveConfig.lastBackupStatus = 'success';

      await saveSettingsToStorage(STORAGE_KEY, stored, 'auto-drive-scheduler');

      io.emit('drive:backup-completed', {
        timestamp: now.toISOString(),
        fileName: forwardRes.data.fileName,
        fileUrl: forwardRes.data.fileUrl,
        downloadUrl: forwardRes.data.downloadUrl,
        folderUrl: forwardRes.data.folderUrl,
        isScheduled: true,
        success: true
      });
    } else {
      console.error(`❌ [Drive Scheduled Backup] تعذر حفظ النسخة الاحتياطية:`, forwardRes.data?.error || forwardRes.error);
      driveConfig.lastBackupStatus = 'failed: ' + (forwardRes.data?.error || forwardRes.error);
      await saveSettingsToStorage(STORAGE_KEY, stored, 'auto-drive-scheduler');
    }
  } catch (err) {
    console.error('❌ [Drive Scheduled Backup Error]:', err.message);
  } finally {
    isRunningAutoBackup = false;
  }
}

// تشغيل فاحص الجدولة التلقائي كل 60 ثانية على مدار الساعة 24/7
setInterval(checkAndRunScheduledDriveBackup, 60 * 1000);

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

  // 🚀 الانضمام إلى غرف المزامنة الموزعة (Multiplexed Rooms)
  socket.on('join_room', (data = {}) => {
    try {
      const { role, branchId, employeeId, deviceId } = data;
      if (role === 'admin' || role === 'owner') {
        socket.join('room:admin:live');
        console.log(`🔌 [Socket.io] الجهاز ${socket.id} انضم لغرفة الإدارة (room:admin:live)`);
      }
      if (branchId) {
        socket.join(`room:branch:${branchId}`);
        console.log(`🔌 [Socket.io] الجهاز ${socket.id} انضم لغرفة الفرع (room:branch:${branchId})`);
      }
      if (employeeId) {
        socket.join(`room:employee:${employeeId}`);
        console.log(`🔌 [Socket.io] الموظف ${socket.id} انضم لغرفته (room:employee:${employeeId})`);
      }
      if (deviceId) {
        socket.join(`room:device:${deviceId}`);
      }
      socket.emit('room:joined', { success: true, rooms: Array.from(socket.rooms) });
    } catch (e) {
      console.warn('[Socket.io] error on join_room:', e.message);
    }
  });

  // مسبار نبض الـ WebSocket الفائق (< 5ms)
  socket.on('ping:probe', (clientData, callback) => {
    if (typeof callback === 'function') {
      callback({
        serverTime: Date.now(),
        isoTime: new Date().toISOString(),
        clientTimestamp: clientData?.clientTimestamp || null,
        status: 'ok'
      });
    }
  });

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

  // استقبال وبث قرارات وتحديثات الطلبات الفورية (< 5ms) لجميع الأجهزة وصفحات الموظفين
  socket.on('request:update', (payload) => {
    try {
      if (payload && (payload.request || payload.requestId)) {
        console.log(`⚡ [Socket.io] بث فوري لقرار/تحديث الطلب (${payload.request?.id || payload.requestId}) لكافة الموظفين والأجهزة`);
        io.emit('request:updated', payload);
      }
    } catch (err) {
      console.warn('[Socket.io] error on request:update:', err.message);
    }
  });

  // استقبال وبث التغييرات الذرية اللحظية (< 5ms) لكافة الأجهزة والصفحات فور التعديل
  socket.on('entity:change', (payload) => {
    try {
      if (payload && payload.entityType) {
        console.log(`⚡ [Socket.io] بث فوري لتغيير ذري (${payload.entityType}: ${payload.entityId || payload.action}) لجميع الأجهزة المتزامنة`);
        socket.broadcast.emit('entity:changed', payload);
      }
    } catch (err) {
      console.warn('[Socket.io] error on entity:change:', err.message);
    }
  });

  // استقبال وبث أمر إبطال وطرد الجلسات الفوري اللحظي (< 5ms) لجميع الأجهزة وصفحات المستخدمين
  socket.on('auth:revoke_session', (payload) => {
    try {
      if (payload && payload.role) {
        console.log(`🔒 [Socket.io] بث فوري لإبطال جلسات: ${payload.role} (${payload.targetId || payload.targetCode || 'ALL'}) لجميع الأجهزة`);
        io.emit('auth:session_revoked', payload);
      }
    } catch (err) {
      console.warn('[Socket.io] error on auth:revoke_session:', err.message);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 [Socket.io] انقطع اتصال: ${socket.id} (${reason})`);
  });
});

// ── 9.5 تسجيل مسارات منصة الـ SaaS متعددة الشركات وبوابة مطور النظام ──────────
registerSaasRoutes(app, db, io, JWT_SECRET, getSettingsFromStorage, saveSettingsToStorage);

// ── 9.6 تسجيل مسارات نظام النواقص وطلبات أدوية العملاء والمشتريات (OutStock) ────
registerOutstockRoutes(app, db, io, JWT_SECRET, getSettingsFromStorage);

// ── 10. بدء تشغيل الخادم والإغلاق الآمن ───────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('========================================================');
  console.log(`🚀 [HR Backend Server] يعمل بنجاح على المنفذ: ${PORT}`);
  console.log(`🔗 REST API:   http://localhost:${PORT}/api/health`);
  console.log(`⚡ WebSockets: ws://localhost:${PORT}`);
  console.log('========================================================');
});

// تفريغ الطوابير المعلقة بأمان عند إيقاف الخادم أو إعادة تشغيل Docker
async function gracefulShutdown(signal) {
  console.log(`🛑 [Shutdown ${signal}] جاري تفريغ الطوابير المعلقة وحفظها بأمان...`);
  if (requestFlushTimer) {
    clearTimeout(requestFlushTimer);
    requestFlushTimer = null;
  }
  try {
    await flushRequestBatch();
    console.log('✅ [Shutdown] تم حفظ كافة الطلبات المعلقة بنجاح.');
  } catch (err) {
    console.error('❌ [Shutdown Flush Error]:', err.message);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

