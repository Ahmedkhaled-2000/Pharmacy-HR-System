/**
 * stock-manager.js
 * منظومة PharmaOS Stock - المحرك المركزي لإدارة المخازن المركزية ومخازن الفروع
 * هندسة مؤسسية متكاملة (Enterprise Double-Entry Inventory Engine):
 * 1. دفتر الحركات المركزي غير القابل للتعديل (Immutable Append-Only Ledger).
 * 2. عزل متعدد المواقع (المخزن الرئيسي، مخازن الفروع، رصيد في الطريق In-Transit، الهوالك).
 * 3. تتبع التشغيلات (Batches)، تواريخ الانتهاء، ومبدأ FEFO.
 * 4. التحويلات ثنائية الأطراف مع معالجة التلف والعجز أثناء النقل.
 * 5. المشتريات والاستلام واحتساب التكلفة الفعلية.
 * 6. الجرد والتسويات مع معالجة التزامن مع مبيعات نقاط البيع.
 * 7. الربط الآمن مع مبيعات ومرتجعات PharmaOS POS.
 */

import crypto from 'crypto';
import { normalizeDrugSearchText } from './eda-drugeye-catalog.js';

// ── 1. تهيئة جداول منظومة المخازن في قاعدة البيانات ────────────────────────
export async function initStockTables(db) {
  try {
    const ddl = `
      -- 1. جدول المواقع ونقاط التخزين
      
      -- أعمدة إضافية للتشغيلات والتحويلات
      ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS label_barcode VARCHAR(100) UNIQUE NULL;
      ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS supplier_code_snapshot VARCHAR(50) NULL;
      CREATE INDEX IF NOT EXISTS idx_batches_label_barcode ON public.inventory_batches (label_barcode);

      ALTER TABLE public.inventory_transfers ADD COLUMN IF NOT EXISTS verification_code VARCHAR(32) UNIQUE NULL;
      ALTER TABLE public.inventory_transfers ADD COLUMN IF NOT EXISTS pdf_document_url TEXT NULL;
      ALTER TABLE public.inventory_transfers ADD COLUMN IF NOT EXISTS dispatch_notes TEXT NULL;
      CREATE INDEX IF NOT EXISTS idx_transfers_verify_code ON public.inventory_transfers (verification_code);

      -- جدول قوالب وتكوينات طابعات الملصقات الحرارية
      CREATE TABLE IF NOT EXISTS public.inventory_label_templates (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL DEFAULT 'الملصق الافتراضي 50x25',
          is_default BOOLEAN NOT NULL DEFAULT true,
          width_mm INTEGER NOT NULL DEFAULT 50,
          height_mm INTEGER NOT NULL DEFAULT 25,
          font_size_pt INTEGER NOT NULL DEFAULT 8,
          show_pharmacy_name BOOLEAN NOT NULL DEFAULT true,
          pharmacy_header_text VARCHAR(150) NULL DEFAULT 'صيدليات الشفاء',
          show_trade_name_ar BOOLEAN NOT NULL DEFAULT true,
          show_trade_name_en BOOLEAN NOT NULL DEFAULT true,
          show_public_price BOOLEAN NOT NULL DEFAULT true,
          show_expiry_date BOOLEAN NOT NULL DEFAULT true,
          show_batch_number BOOLEAN NOT NULL DEFAULT true,
          show_supplier_code BOOLEAN NOT NULL DEFAULT true,
          barcode_symbology VARCHAR(30) NOT NULL DEFAULT 'CODE128',
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS public.inventory_locations (
          id VARCHAR(50) PRIMARY KEY,
          code VARCHAR(50) NOT NULL UNIQUE,
          name_ar VARCHAR(255) NOT NULL,
          location_type VARCHAR(50) NOT NULL, -- 'central_warehouse', 'branch_store', 'in_transit', 'quarantine', 'scrap'
          branch_id VARCHAR(50) NULL,
          is_central BOOLEAN NOT NULL DEFAULT false,
          manager_employee_id VARCHAR(100) NULL,
          manager_name VARCHAR(150) NULL,
          allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inv_loc_type ON public.inventory_locations (location_type);
      CREATE INDEX IF NOT EXISTS idx_inv_loc_branch ON public.inventory_locations (branch_id);

      -- 2. جدول التشغيلات وتواريخ الصلاحية وتكلفة الشراء
      CREATE TABLE IF NOT EXISTS public.inventory_batches (
          id VARCHAR(64) PRIMARY KEY,
          medication_id VARCHAR(36) NOT NULL REFERENCES public.outstock_medications(id) ON DELETE RESTRICT,
          batch_number VARCHAR(100) NOT NULL,
          expiry_date DATE NOT NULL,
          production_date DATE NULL,
          cost_price NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
          public_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
          supplier_id VARCHAR(36) NULL REFERENCES public.outstock_suppliers(id) ON DELETE SET NULL,
          receipt_reference_id VARCHAR(64) NULL,
          is_quarantined BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_med_batch_cost UNIQUE (medication_id, batch_number, expiry_date, cost_price)
      );
      CREATE INDEX IF NOT EXISTS idx_batches_med_exp ON public.inventory_batches (medication_id, expiry_date ASC);
      CREATE INDEX IF NOT EXISTS idx_batches_num ON public.inventory_batches (batch_number);

      -- 3. دفتر حركات المخزون المركزي (Append-Only Event Ledger)
      CREATE TABLE IF NOT EXISTS public.inventory_ledger (
          id BIGSERIAL PRIMARY KEY,
          transaction_id VARCHAR(64) NOT NULL,
          idempotency_key VARCHAR(191) NOT NULL UNIQUE,
          movement_type VARCHAR(50) NOT NULL,
          location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          medication_id VARCHAR(36) NOT NULL REFERENCES public.outstock_medications(id) ON DELETE RESTRICT,
          batch_id VARCHAR(64) NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
          quantity_base NUMERIC(14, 4) NOT NULL,
          unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
          total_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          document_type VARCHAR(50) NOT NULL,
          document_number VARCHAR(100) NOT NULL,
          document_id VARCHAR(100) NULL,
          source_branch_id VARCHAR(50) NULL,
          target_branch_id VARCHAR(50) NULL,
          performed_by_id VARCHAR(100) NOT NULL,
          performed_by_name VARCHAR(150) NOT NULL,
          performed_by_role VARCHAR(50) NOT NULL,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_loc_med ON public.inventory_ledger (location_id, medication_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_batch ON public.inventory_ledger (batch_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_doc ON public.inventory_ledger (document_type, document_number);
      CREATE INDEX IF NOT EXISTS idx_ledger_created ON public.inventory_ledger (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_movement ON public.inventory_ledger (movement_type);

      -- 4. جدول الأرصدة اللحظية المجمعة (Materialized Snapshot Cache)
      CREATE TABLE IF NOT EXISTS public.inventory_balances (
          id VARCHAR(120) PRIMARY KEY,
          location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          medication_id VARCHAR(36) NOT NULL REFERENCES public.outstock_medications(id) ON DELETE RESTRICT,
          batch_id VARCHAR(64) NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
          quantity_on_hand NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          quantity_reserved NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          avg_unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
          last_movement_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_inv_balance_target UNIQUE (location_id, medication_id, batch_id)
      );
      CREATE INDEX IF NOT EXISTS idx_balances_loc_qty ON public.inventory_balances (location_id, quantity_on_hand);
      CREATE INDEX IF NOT EXISTS idx_balances_med ON public.inventory_balances (medication_id);

      -- 5. جدول أوامر التحويلات بين المخازن والفروع
      CREATE TABLE IF NOT EXISTS public.inventory_transfers (
          id VARCHAR(64) PRIMARY KEY,
          transfer_number VARCHAR(50) NOT NULL UNIQUE,
          transfer_type VARCHAR(30) NOT NULL DEFAULT 'main_to_branch',
          source_location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          destination_location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          in_transit_location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          status VARCHAR(30) NOT NULL DEFAULT 'draft',
          requested_by_id VARCHAR(100) NOT NULL,
          requested_by_name VARCHAR(150) NOT NULL,
          approved_by_id VARCHAR(100) NULL,
          approved_by_name VARCHAR(150) NULL,
          dispatched_by_id VARCHAR(100) NULL,
          dispatched_by_name VARCHAR(150) NULL,
          received_by_id VARCHAR(100) NULL,
          received_by_name VARCHAR(150) NULL,
          total_requested_items INTEGER NOT NULL DEFAULT 0,
          total_received_items INTEGER NOT NULL DEFAULT 0,
          total_cost_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
          driver_name VARCHAR(100) NULL,
          driver_phone VARCHAR(50) NULL,
          notes TEXT NULL,
          dispatched_at TIMESTAMPTZ NULL,
          received_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.inventory_transfers (status);
      CREATE INDEX IF NOT EXISTS idx_transfers_source ON public.inventory_transfers (source_location_id);
      CREATE INDEX IF NOT EXISTS idx_transfers_dest ON public.inventory_transfers (destination_location_id);

      -- 6. جدول بنود أمر التحويل المخزني
      CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
          id VARCHAR(64) PRIMARY KEY,
          transfer_id VARCHAR(64) NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
          medication_id VARCHAR(36) NOT NULL REFERENCES public.outstock_medications(id) ON DELETE RESTRICT,
          batch_id VARCHAR(64) NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
          unit_type VARCHAR(20) NOT NULL DEFAULT 'pack',
          quantity_requested NUMERIC(10, 2) NOT NULL,
          quantity_approved NUMERIC(10, 2) NOT NULL DEFAULT 0,
          quantity_dispatched NUMERIC(10, 2) NOT NULL DEFAULT 0,
          quantity_received NUMERIC(10, 2) NOT NULL DEFAULT 0,
          quantity_damaged NUMERIC(10, 2) NOT NULL DEFAULT 0,
          quantity_shortage NUMERIC(10, 2) NOT NULL DEFAULT 0,
          unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
          item_status VARCHAR(30) NOT NULL DEFAULT 'pending',
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_transfer_items_parent ON public.inventory_transfer_items (transfer_id);

      -- 7. جدول جلسات الجرد الفعلي
      CREATE TABLE IF NOT EXISTS public.inventory_counts (
          id VARCHAR(64) PRIMARY KEY,
          count_number VARCHAR(50) NOT NULL UNIQUE,
          location_id VARCHAR(50) NOT NULL REFERENCES public.inventory_locations(id) ON DELETE RESTRICT,
          count_type VARCHAR(30) NOT NULL DEFAULT 'full',
          status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
          counted_by_id VARCHAR(100) NOT NULL,
          counted_by_name VARCHAR(150) NOT NULL,
          reviewed_by_id VARCHAR(100) NULL,
          reviewed_by_name VARCHAR(150) NULL,
          snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          total_variance_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
          notes TEXT NULL,
          posted_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_counts_loc_status ON public.inventory_counts (location_id, status);

      -- 8. جدول بنود الجرد الفعلي ومقارنة الفروق
      CREATE TABLE IF NOT EXISTS public.inventory_count_items (
          id VARCHAR(64) PRIMARY KEY,
          count_id VARCHAR(64) NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
          medication_id VARCHAR(36) NOT NULL REFERENCES public.outstock_medications(id) ON DELETE RESTRICT,
          batch_id VARCHAR(64) NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
          book_quantity NUMERIC(14, 4) NOT NULL,
          actual_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          variance_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
          variance_total_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
          barcode_scanned VARCHAR(100) NULL,
          notes TEXT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_count_items_parent ON public.inventory_count_items (count_id);

      -- 9. جدول سجل التدقيق الرقابي للعمليات المخزنية
      CREATE TABLE IF NOT EXISTS public.inventory_audit_logs (
          id BIGSERIAL PRIMARY KEY,
          action_type VARCHAR(100) NOT NULL,
          target_entity VARCHAR(50) NOT NULL,
          target_id VARCHAR(100) NOT NULL,
          location_id VARCHAR(50) NULL,
          performed_by_id VARCHAR(100) NULL,
          performed_by_name VARCHAR(150) NULL,
          details JSONB NULL,
          client_ip VARCHAR(45) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_inv_audit_created ON public.inventory_audit_logs (created_at DESC);
    `;

    await db.query(ddl);

    // ── 2. زرع المواقع الأساسية (المخزن الرئيسي، بضاعة في الطريق، موقع التوالف) ──
    await db.query(`
      INSERT INTO public.inventory_locations (id, code, name_ar, location_type, is_central, allow_negative_stock)
      VALUES 
        ('loc_central_main', 'WH-MAIN', 'المخزن الرئيسي المركزي', 'central_warehouse', true, false),
        ('loc_in_transit', 'WH-TRANSIT', 'بضاعة في الطريق (In-Transit)', 'in_transit', false, false),
        ('loc_damaged', 'WH-DAMAGED', 'مستودع التوالف والهوالك', 'scrap', false, false)
      ON CONFLICT (id) DO NOTHING;
    `);

    // ── 3. مزامنة فروع الصيدلية وتحويل كل فرع إلى موقع تخزين مستقل ──
    try {
      const branchesRes = await db.query('SELECT id, name, code FROM public.outstock_branches');
      for (const b of branchesRes.rows) {
        const locId = `loc_branch_${b.id}`;
        const locCode = b.code ? `BR-${b.code}` : `BR-${b.id}`;
        await db.query(`
          INSERT INTO public.inventory_locations (
            id, code, name_ar, location_type, branch_id, is_central, allow_negative_stock
          ) VALUES ($1, $2, $3, 'branch_store', $4, false, true)
          ON CONFLICT (id) DO UPDATE SET
            name_ar = EXCLUDED.name_ar,
            branch_id = EXCLUDED.branch_id;
        `, [locId, locCode, `مخزن ${b.name}`, b.id]);
      }
    } catch (brLocErr) {
      console.warn('⚠️ [Stock Manager] Sync branch locations note:', brLocErr.message);
    }

    console.log('✅ [PharmaOS Stock] تم تهيئة وتأكيد جداول منظومة المخازن ودفتر الحركات المركزي بنجاح.');
  } catch (err) {
    console.error('❌ [PharmaOS Stock Init Error]:', err.message);
  }
}

// ── 2. الدوال الذرية الأساسية لتسجيل الحركات وتحديث الأرصدة ─────────────────

/**
 * تسجيل حركة في دفتر المخزون وتحديث رصيد الصنف والتشغيلة داخل Transaction
 */
export async function recordLedgerMovement(client, movement) {
  const {
    transactionId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    idempotencyKey,
    movementType,
    locationId,
    medicationId,
    batchId = null,
    quantityBase,
    unitCost = 0,
    documentType,
    documentNumber,
    documentId = null,
    sourceBranchId = null,
    targetBranchId = null,
    performedById = 'SYSTEM',
    performedByName = 'النظام الآلي',
    performedByRole = 'system',
    notes = null
  } = movement;

  if (!idempotencyKey) {
    throw new Error('idempotencyKey إلزامي لتسجيل حركة المخزون ومنع التكرار.');
  }
  if (!locationId || !medicationId || quantityBase === undefined) {
    throw new Error('الموقع والصنف والكمية حقول إلزامية.');
  }

  const numQty = parseFloat(quantityBase);
  const numUnitCost = parseFloat(unitCost) || 0;
  const numTotalCost = parseFloat((numQty * numUnitCost).toFixed(4));

  // 1. إدراج في دفتر الحركات مع منع التكرار قطيعاً (ON CONFLICT DO NOTHING)
  const insertRes = await client.query(`
    INSERT INTO public.inventory_ledger (
      transaction_id, idempotency_key, movement_type, location_id,
      medication_id, batch_id, quantity_base, unit_cost, total_cost,
      document_type, document_number, document_id, source_branch_id,
      target_branch_id, performed_by_id, performed_by_name,
      performed_by_role, notes, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id;
  `, [
    transactionId, idempotencyKey, movementType, locationId,
    medicationId, batchId, numQty, numUnitCost, numTotalCost,
    documentType, String(documentNumber), documentId, sourceBranchId,
    targetBranchId, performedById, performedByName,
    performedByRole, notes
  ]);

  const isNewMovement = insertRes.rows.length > 0;
  if (!isNewMovement) {
    return { success: true, isDuplicate: true, message: 'حركة مسجلة مسبقاً (تم تخطي التكرار بأمان).' };
  }

  // 2. تحديث رصيد الموقع والتشغيلة في جدول الأرصدة اللحظية (UPSERT)
  const balanceId = `${locationId}_${medicationId}_${batchId || 'default'}`;
  await client.query(`
    INSERT INTO public.inventory_balances (
      id, location_id, medication_id, batch_id, quantity_on_hand, avg_unit_cost, last_movement_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (location_id, medication_id, batch_id) DO UPDATE SET
      quantity_on_hand = public.inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
      avg_unit_cost = CASE 
        WHEN (public.inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand) > 0 AND EXCLUDED.quantity_on_hand > 0 
        THEN ((public.inventory_balances.quantity_on_hand * public.inventory_balances.avg_unit_cost) + (EXCLUDED.quantity_on_hand * EXCLUDED.avg_unit_cost)) / (public.inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand)
        ELSE public.inventory_balances.avg_unit_cost
      END,
      last_movement_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP;
  `, [balanceId, locationId, medicationId, batchId, numQty, numUnitCost]);

  return { success: true, isDuplicate: false, ledgerId: insertRes.rows[0].id };
}

/**
 * خصم صنف من المخزون بنظام FEFO (الأقرب انتهاءً أولاً)
 */
export async function deductStockAtomic(client, {
  locationId,
  medicationId,
  quantity,
  documentType,
  documentNumber,
  idempotencyKey,
  user = {},
  allowNegative = false,
  specifiedBatchId = null,
  notes = null
}) {
  let remainingToDeduct = parseFloat(quantity) || 0;
  if (remainingToDeduct <= 0) return { success: true, deducted: 0 };

  // 1. إذا تم تحديد تشغيلة معينة بالاسم
  if (specifiedBatchId) {
    const batchRes = await client.query('SELECT * FROM public.inventory_batches WHERE id = $1', [specifiedBatchId]);
    const batch = batchRes.rows[0];
    const unitCost = batch ? parseFloat(batch.cost_price || 0) : 0;

    await recordLedgerMovement(client, {
      idempotencyKey: `${idempotencyKey}_${specifiedBatchId}`,
      movementType: documentType === 'pos_invoice' ? 'pos_sale' : 'stock_adjustment_minus',
      locationId,
      medicationId,
      batchId: specifiedBatchId,
      quantityBase: -remainingToDeduct,
      unitCost,
      documentType,
      documentNumber,
      performedById: user.id || 'SYSTEM',
      performedByName: user.name || user.username || 'المستخدم',
      performedByRole: user.role || 'cashier',
      notes
    });

    return { success: true, deducted: remainingToDeduct, batchAllocations: [{ batchId: specifiedBatchId, qty: remainingToDeduct }] };
  }

  // 2. البحث عن التشغيلات المتاحة بنظام FEFO (الأقرب انتهاءً والمتاحة في نفس الموقع)
  const availableBatchesRes = await client.query(`
    SELECT b.id as balance_id, b.batch_id, b.quantity_on_hand, ib.expiry_date, ib.cost_price
    FROM public.inventory_balances b
    LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
    WHERE b.location_id = $1 AND b.medication_id = $2 AND b.quantity_on_hand > 0
    ORDER BY COALESCE(ib.expiry_date, '2099-12-31'::date) ASC, b.quantity_on_hand DESC
  `, [locationId, medicationId]);

  const allocations = [];

  for (const bRow of availableBatchesRes.rows) {
    if (remainingToDeduct <= 0) break;
    const availableInBatch = parseFloat(bRow.quantity_on_hand);
    const takeFromBatch = Math.min(availableInBatch, remainingToDeduct);

    allocations.push({
      batchId: bRow.batch_id,
      quantity: takeFromBatch,
      unitCost: parseFloat(bRow.cost_price || 0)
    });

    remainingToDeduct -= takeFromBatch;
  }

  // 3. إذا تبقى رصيد مطلوب خصمه (أكبر من المخزون المتوفر في التشغيلات)
  if (remainingToDeduct > 0) {
    if (!allowNegative) {
      // فحص ما إذا كان الموقع يسمح بالمخزون السالب
      const locRes = await client.query('SELECT allow_negative_stock FROM public.inventory_locations WHERE id = $1', [locationId]);
      const locAllows = locRes.rows[0]?.allow_negative_stock;
      if (!locAllows) {
        throw new Error(`الرصيد المتاح غير كافٍ للصنف. المتبقي غير متوفر: ${remainingToDeduct}`);
      }
    }

    // إدراج المتبقي كخصم مفتوح
    allocations.push({
      batchId: null,
      quantity: remainingToDeduct,
      unitCost: 0
    });
  }

  // 4. تسجيل الحركات في الدفتر لكل تشغيلة مخصومة
  let idx = 0;
  for (const alloc of allocations) {
    idx++;
    await recordLedgerMovement(client, {
      idempotencyKey: `${idempotencyKey}_alloc_${idx}_${alloc.batchId || 'gen'}`,
      movementType: documentType === 'pos_invoice' ? 'pos_sale' : 'stock_adjustment_minus',
      locationId,
      medicationId,
      batchId: alloc.batchId,
      quantityBase: -alloc.quantity,
      unitCost: alloc.unitCost,
      documentType,
      documentNumber,
      performedById: user.id || 'SYSTEM',
      performedByName: user.name || user.username || 'المستخدم',
      performedByRole: user.role || 'cashier',
      notes: notes || (alloc.batchId ? null : 'خصم رصيد سالب تلقائي لمبيعات أوفلاين')
    });
  }

  return { success: true, deducted: quantity, batchAllocations: allocations };
}

/**
 * إعادة حساب وتطابق رصيد الصنف في موقع معين بمقارنة الدفتر (Self-Healing Reconcile)
 */
export async function reconcileBalance(db, locationId, medicationId) {
  const sumRes = await db.query(`
    SELECT batch_id, COALESCE(SUM(quantity_base), 0) as total_qty
    FROM public.inventory_ledger
    WHERE location_id = $1 AND medication_id = $2
    GROUP BY batch_id;
  `, [locationId, medicationId]);

  for (const r of sumRes.rows) {
    const balId = `${locationId}_${medicationId}_${r.batch_id || 'default'}`;
    const qty = parseFloat(r.total_qty || 0);

    await db.query(`
      INSERT INTO public.inventory_balances (id, location_id, medication_id, batch_id, quantity_on_hand, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (location_id, medication_id, batch_id) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        updated_at = CURRENT_TIMESTAMP;
    `, [balId, locationId, medicationId, r.batch_id, qty]);
  }

  return { success: true, reconciledBatches: sumRes.rows.length };
}

// ── 3. تسجيل مسارات الـ API لمنظومة PharmaOS Stock ──────────────────────────
export function registerStockRoutes(app, db, io, JWT_SECRET, getSettingsFromStorage, saveSettingsToStorage) {

  // دالة بث موحدة عبر السوكت
  const broadcastStock = (event, data) => {
    try {
      if (io && typeof io.emit === 'function') {
        io.emit(event, data);
      }
    } catch (_) {}
  };

  // وسيط المصادقة المشترك
  const authMiddleware = async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      let token = '';
      if (authHeader.startsWith('Bearer ')) token = authHeader.substring(7).trim();
      else if (req.headers['x-auth-token']) token = req.headers['x-auth-token'];

      // دعم التوكن الداخلي لنقاط البيع
      if (!token && req.headers['x-pos-terminal']) {
        req.stockUser = { id: `pos_${req.headers['x-pos-terminal']}`, role: 'pos', name: 'محطة كاشير' };
        return next();
      }

      if (!token) {
        return res.status(401).json({ success: false, error: 'مطلوب تسجيل الدخول والتوكن' });
      }

      let payload = null;
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        }
      } catch (e) {}

      if (!payload) {
        return res.status(401).json({ success: false, error: 'توكن غير صالح' });
      }

      req.stockUser = {
        id: payload.id || payload.userId || payload.username || 'usr_unknown',
        username: payload.username || '',
        name: payload.fullName || payload.name || payload.username || 'المستخدم',
        role: String(payload.role || '').toLowerCase().replace('outstock_', ''),
        branchId: payload.branchId || payload.branch_id || null,
        permissions: payload.permissions || {}
      };

      next();
    } catch (err) {
      res.status(401).json({ success: false, error: 'فشل التحقق من الجلسة' });
    }
  };

  // ── 1. لوحة القيادة والمؤشرات الحيوية (Executive Dashboard Overview) ──
  app.get('/api/stock/overview', authMiddleware, async (req, res) => {
    try {
      const { branchId } = req.query;
      let locFilter = '';
      const params = [];

      if (branchId && branchId !== 'all') {
        params.push(`loc_branch_${branchId}`);
        locFilter = `WHERE b.location_id = $${params.length}`;
      }

      // إجمالي قيمة المخزون بسعر التكلفة وبسعر البيع الرسمي
      const valuationQuery = `
        SELECT 
          COALESCE(SUM(b.quantity_on_hand * COALESCE(ib.cost_price, m.unit_price * 0.75, 0)), 0) as total_cost_value,
          COALESCE(SUM(b.quantity_on_hand * COALESCE(m.public_price, 0)), 0) as total_public_value,
          COUNT(DISTINCT b.medication_id) as total_skus,
          COALESCE(SUM(CASE WHEN b.quantity_on_hand < 5 THEN 1 ELSE 0 END), 0) as low_stock_count,
          COALESCE(SUM(CASE WHEN b.quantity_on_hand < 0 THEN 1 ELSE 0 END), 0) as negative_stock_count
        FROM public.inventory_balances b
        JOIN public.outstock_medications m ON b.medication_id = m.id
        LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
        ${locFilter}
      `;
      const valRes = await db.query(valuationQuery, params);

      // الأصناف القريبة من الانتهاء (أقل من 90 يوماً)
      const nearExpiryRes = await db.query(`
        SELECT COUNT(DISTINCT b.medication_id) as near_expiry_count
        FROM public.inventory_balances b
        JOIN public.inventory_batches ib ON b.batch_id = ib.id
        WHERE b.quantity_on_hand > 0 
          AND ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days')
          AND ib.expiry_date >= CURRENT_DATE
      `);

      // الأصناف منتهية الصلاحية
      const expiredRes = await db.query(`
        SELECT COUNT(DISTINCT b.medication_id) as expired_count
        FROM public.inventory_balances b
        JOIN public.inventory_batches ib ON b.batch_id = ib.id
        WHERE b.quantity_on_hand > 0 AND ib.expiry_date < CURRENT_DATE
      `);

      // التحويلات المعلقة
      const pendingTransfersRes = await db.query(`
        SELECT COUNT(*) as pending_count
        FROM public.inventory_transfers
        WHERE status IN ('pending_approval', 'approved', 'in_preparation', 'dispatched', 'in_transit')
      `);

      // رصيد البضاعة في الطريق
      const inTransitRes = await db.query(`
        SELECT 
          COALESCE(SUM(b.quantity_on_hand * COALESCE(ib.cost_price, 0)), 0) as in_transit_cost_value,
          COALESCE(SUM(b.quantity_on_hand), 0) as in_transit_quantity
        FROM public.inventory_balances b
        LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
        WHERE b.location_id = 'loc_in_transit' AND b.quantity_on_hand > 0
      `);

      // آخر 10 حركات في الدفتر
      const recentMovementsRes = await db.query(`
        SELECT l.*, m.trade_name_ar, m.trade_name_en, loc.name_ar as location_name
        FROM public.inventory_ledger l
        JOIN public.outstock_medications m ON l.medication_id = m.id
        JOIN public.inventory_locations loc ON l.location_id = loc.id
        ORDER BY l.created_at DESC
        LIMIT 10
      `);

      res.json({
        success: true,
        metrics: {
          ...valRes.rows[0],
          near_expiry_count: nearExpiryRes.rows[0]?.near_expiry_count || 0,
          expired_count: expiredRes.rows[0]?.expired_count || 0,
          pending_transfers_count: pendingTransfersRes.rows[0]?.pending_count || 0,
          in_transit: inTransitRes.rows[0] || { in_transit_cost_value: 0, in_transit_quantity: 0 }
        },
        recentMovements: recentMovementsRes.rows
      });
    } catch (err) {
      console.error('[Stock Overview Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 2. إدارة المواقع والمخازن (Locations CRUD) ──
  app.get('/api/stock/locations', authMiddleware, async (req, res) => {
    try {
      const locsRes = await db.query(`
        SELECT l.*, b.name as branch_name,
          (SELECT COUNT(DISTINCT medication_id) FROM public.inventory_balances WHERE location_id = l.id AND quantity_on_hand > 0) as distinct_skus,
          (SELECT COALESCE(SUM(quantity_on_hand), 0) FROM public.inventory_balances WHERE location_id = l.id) as total_units
        FROM public.inventory_locations l
        LEFT JOIN public.outstock_branches b ON l.branch_id = b.id
        ORDER BY l.is_central DESC, l.created_at ASC
      `);
      res.json({ success: true, locations: locsRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/locations', authMiddleware, async (req, res) => {
    try {
      const { code, name_ar, location_type = 'branch_store', branch_id, manager_name, allow_negative_stock = false } = req.body;
      if (!code || !name_ar) return res.status(400).json({ success: false, error: 'الكود واسم الموقع حقول إلزامية' });

      const id = `loc_${code.toLowerCase().replace(/[^a-z0-9_]/g, '_')}_${Date.now()}`;
      await db.query(`
        INSERT INTO public.inventory_locations (id, code, name_ar, location_type, branch_id, manager_name, allow_negative_stock)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, code, name_ar, location_type, branch_id || null, manager_name || null, Boolean(allow_negative_stock)]);

      res.json({ success: true, message: 'تم إنشاء موقع التخزين بنجاح', locationId: id });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 3. رصيد الأصناف والبحث التفاعلي (Stock Balances Explorer) ──
  app.get('/api/stock/balances', authMiddleware, async (req, res) => {
    try {
      const {
        locationId,
        search = '',
        category,
        filter = 'all', // 'all', 'low', 'expired', 'near_expiry', 'negative'
        page = 1,
        limit = 50
      } = req.query;

      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const params = [];
      let where = 'WHERE 1=1';

      if (locationId && locationId !== 'all') {
        params.push(locationId);
        where += ` AND b.location_id = $${params.length}`;
      }

      if (search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        where += ` AND (LOWER(m.trade_name_ar) LIKE $${params.length} OR LOWER(m.trade_name_en) LIKE $${params.length} OR LOWER(m.generic_name) LIKE $${params.length} OR m.gtin_barcode LIKE $${params.length})`;
      }

      if (category && category !== 'all') {
        params.push(category);
        where += ` AND m.category = $${params.length}`;
      }

      if (filter === 'low') {
        where += ` AND b.quantity_on_hand <= 5 AND b.quantity_on_hand >= 0`;
      } else if (filter === 'negative') {
        where += ` AND b.quantity_on_hand < 0`;
      } else if (filter === 'expired') {
        where += ` AND ib.expiry_date < CURRENT_DATE AND b.quantity_on_hand > 0`;
      } else if (filter === 'near_expiry') {
        where += ` AND ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days') AND ib.expiry_date >= CURRENT_DATE AND b.quantity_on_hand > 0`;
      }

      const countSql = `
        SELECT COUNT(*) as total
        FROM public.inventory_balances b
        JOIN public.outstock_medications m ON b.medication_id = m.id
        LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
        ${where}
      `;
      const countRes = await db.query(countSql, params);
      const total = parseInt(countRes.rows[0]?.total || 0, 10);

      const dataSql = `
        SELECT 
          b.id as balance_id,
          b.location_id,
          loc.name_ar as location_name,
          loc.code as location_code,
          b.medication_id,
          m.trade_name_ar,
          m.trade_name_en,
          m.generic_name,
          m.dosage_form,
          m.pack_size,
          m.unit_name,
          m.public_price,
          m.gtin_barcode,
          m.category,
          b.batch_id,
          ib.batch_number,
          ib.expiry_date,
          COALESCE(ib.cost_price, b.avg_unit_cost, m.unit_price * 0.75) as unit_cost,
          b.quantity_on_hand,
          b.quantity_reserved,
          (b.quantity_on_hand - b.quantity_reserved) as quantity_available,
          (b.quantity_on_hand * COALESCE(ib.cost_price, b.avg_unit_cost, m.unit_price * 0.75)) as total_cost,
          (b.quantity_on_hand * COALESCE(m.public_price, 0)) as total_public_value,
          b.last_movement_at
        FROM public.inventory_balances b
        JOIN public.outstock_medications m ON b.medication_id = m.id
        JOIN public.inventory_locations loc ON b.location_id = loc.id
        LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
        ${where}
        ORDER BY b.last_movement_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      params.push(parseInt(limit, 10), offset);
      const dataRes = await db.query(dataSql, params);

      res.json({
        success: true,
        balances: dataRes.rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (err) {
      console.error('[Stock Balances Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 4. دليل التشغيلات والصلاحيات (Batches & FEFO Inspector) ──
  app.get('/api/stock/batches', authMiddleware, async (req, res) => {
    try {
      const { medicationId, status = 'all' } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (medicationId) {
        params.push(medicationId);
        where += ` AND ib.medication_id = $${params.length}`;
      }

      if (status === 'near_expiry') {
        where += ` AND ib.expiry_date <= (CURRENT_DATE + INTERVAL '90 days') AND ib.expiry_date >= CURRENT_DATE`;
      } else if (status === 'expired') {
        where += ` AND ib.expiry_date < CURRENT_DATE`;
      }

      const batchesRes = await db.query(`
        SELECT 
          ib.*,
          m.trade_name_ar,
          m.trade_name_en,
          m.pack_size,
          s.name as supplier_name,
          COALESCE(SUM(b.quantity_on_hand), 0) as total_stock_on_hand
        FROM public.inventory_batches ib
        JOIN public.outstock_medications m ON ib.medication_id = m.id
        LEFT JOIN public.outstock_suppliers s ON ib.supplier_id = s.id
        LEFT JOIN public.inventory_balances b ON ib.id = b.batch_id
        ${where}
        GROUP BY ib.id, m.id, s.name
        ORDER BY ib.expiry_date ASC
      `, params);

      res.json({ success: true, batches: batchesRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 5. دفتر حركات المخزون المركزي (Central Ledger Audit Explorer) ──
  app.get('/api/stock/ledger', authMiddleware, async (req, res) => {
    try {
      const {
        locationId,
        medicationId,
        movementType,
        documentNumber,
        dateFrom,
        dateTo,
        page = 1,
        limit = 50
      } = req.query;

      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
      const params = [];
      let where = 'WHERE 1=1';

      if (locationId && locationId !== 'all') {
        params.push(locationId);
        where += ` AND l.location_id = $${params.length}`;
      }
      if (medicationId) {
        params.push(medicationId);
        where += ` AND l.medication_id = $${params.length}`;
      }
      if (movementType && movementType !== 'all') {
        params.push(movementType);
        where += ` AND l.movement_type = $${params.length}`;
      }
      if (documentNumber) {
        params.push(`%${documentNumber.trim()}%`);
        where += ` AND l.document_number ILIKE $${params.length}`;
      }
      if (dateFrom) {
        params.push(dateFrom);
        where += ` AND l.created_at >= $${params.length}::timestamptz`;
      }
      if (dateTo) {
        params.push(dateTo);
        where += ` AND l.created_at <= ($${params.length}::timestamptz + INTERVAL '1 day')`;
      }

      const countRes = await db.query(`SELECT COUNT(*) as total FROM public.inventory_ledger l ${where}`, params);
      const total = parseInt(countRes.rows[0]?.total || 0, 10);

      const dataSql = `
        SELECT 
          l.*,
          m.trade_name_ar,
          m.trade_name_en,
          m.pack_size,
          m.unit_name,
          loc.name_ar as location_name,
          ib.batch_number,
          ib.expiry_date
        FROM public.inventory_ledger l
        JOIN public.outstock_medications m ON l.medication_id = m.id
        JOIN public.inventory_locations loc ON l.location_id = loc.id
        LEFT JOIN public.inventory_batches ib ON l.batch_id = ib.id
        ${where}
        ORDER BY l.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(parseInt(limit, 10), offset);
      const dataRes = await db.query(dataSql, params);

      res.json({
        success: true,
        movements: dataRes.rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit, 10))
        }
      });
    } catch (err) {
      console.error('[Stock Ledger Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 6. دورة أوامر التحويلات المخزنية (Transfers Workflow) ──

  // 6.1 إنشاء طلب تحويل جديد
  app.post('/api/stock/transfers', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        source_location_id,
        destination_location_id,
        transfer_type = 'main_to_branch',
        driver_name,
        driver_phone,
        notes,
        items = []
      } = req.body;

      if (!source_location_id || !destination_location_id || items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'الموقع المصدر والهدف وبند واحد على الأقل حقول إلزامية' });
      }

      const transferId = `trf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const transferNumber = `TRF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      await client.query(`
        INSERT INTO public.inventory_transfers (
          id, transfer_number, transfer_type, source_location_id, destination_location_id,
          in_transit_location_id, status, requested_by_id, requested_by_name,
          total_requested_items, driver_name, driver_phone, notes
        ) VALUES ($1, $2, $3, $4, $5, 'loc_in_transit', 'pending_approval', $6, $7, $8, $9, $10, $11)
      `, [
        transferId, transferNumber, transfer_type, source_location_id, destination_location_id,
        req.stockUser.id, req.stockUser.name, items.length, driver_name || null, driver_phone || null, notes || null
      ]);

      for (const item of items) {
        const itemId = `trfi_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await client.query(`
          INSERT INTO public.inventory_transfer_items (
            id, transfer_id, medication_id, batch_id, unit_type,
            quantity_requested, quantity_approved, unit_cost, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          itemId, transferId, item.medication_id, item.batch_id || null, item.unit_type || 'pack',
          parseFloat(item.quantity_requested || 1), parseFloat(item.quantity_requested || 1),
          parseFloat(item.unit_cost || 0), item.notes || null
        ]);
      }

      await client.query('COMMIT');
      broadcastStock('stock:transfer_created', { transferId, transferNumber });
      res.json({ success: true, message: 'تم إنشاء طلب التحويل بنجاح', transferId, transferNumber });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Create Transfer Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 6.2 جلب قائمة التحويلات
  app.get('/api/stock/transfers', authMiddleware, async (req, res) => {
    try {
      const { status, locationId } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (status && status !== 'all') {
        params.push(status);
        where += ` AND t.status = $${params.length}`;
      }
      if (locationId && locationId !== 'all') {
        params.push(locationId);
        where += ` AND (t.source_location_id = $${params.length} OR t.destination_location_id = $${params.length})`;
      }

      const transfersRes = await db.query(`
        SELECT 
          t.*,
          src.name_ar as source_name,
          dest.name_ar as destination_name,
          (SELECT COUNT(*) FROM public.inventory_transfer_items WHERE transfer_id = t.id) as items_count
        FROM public.inventory_transfers t
        JOIN public.inventory_locations src ON t.source_location_id = src.id
        JOIN public.inventory_locations dest ON t.destination_location_id = dest.id
        ${where}
        ORDER BY t.created_at DESC
      `, params);

      res.json({ success: true, transfers: transfersRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6.3 جلب تفاصيل أمر تحويل محدد وبنوده
  app.get('/api/stock/transfers/:id', authMiddleware, async (req, res) => {
    try {
      const transferRes = await db.query(`
        SELECT t.*, src.name_ar as source_name, dest.name_ar as destination_name
        FROM public.inventory_transfers t
        JOIN public.inventory_locations src ON t.source_location_id = src.id
        JOIN public.inventory_locations dest ON t.destination_location_id = dest.id
        WHERE t.id = $1
      `, [req.params.id]);

      if (transferRes.rows.length === 0) return res.status(404).json({ success: false, error: 'أمر التحويل غير موجود' });

      const itemsRes = await db.query(`
        SELECT ti.*, m.trade_name_ar, m.trade_name_en, m.pack_size, ib.batch_number, ib.expiry_date
        FROM public.inventory_transfer_items ti
        JOIN public.outstock_medications m ON ti.medication_id = m.id
        LEFT JOIN public.inventory_batches ib ON ti.batch_id = ib.id
        WHERE ti.transfer_id = $1
      `, [req.params.id]);

      res.json({ success: true, transfer: transferRes.rows[0], items: itemsRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6.4 اعتماد وصرف أمر التحويل (خصم المصدر ⬅️ إضافة للبضاعة في الطريق In-Transit)
  app.post('/api/stock/transfers/:id/dispatch', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const transferId = req.params.id;
      const { driver_name, driver_phone, dispatched_items } = req.body;

      const trfRes = await client.query('SELECT * FROM public.inventory_transfers WHERE id = $1 FOR UPDATE', [transferId]);
      if (trfRes.rows.length === 0) throw new Error('أمر التحويل غير موجود');
      const transfer = trfRes.rows[0];

      if (['dispatched', 'in_transit', 'received_fully', 'closed'].includes(transfer.status)) {
        throw new Error('تم صرف أمر التحويل هذا مسبقاً.');
      }

      // قراءة البنود
      const itemsRes = await client.query('SELECT * FROM public.inventory_transfer_items WHERE transfer_id = $1', [transferId]);
      let totalCostSum = 0;

      for (const item of itemsRes.rows) {
        const qtyToDispatch = parseFloat(item.quantity_approved || item.quantity_requested || 0);
        if (qtyToDispatch <= 0) continue;

        // 1. خصم من الموقع المصدر
        const deductKey = `trf_out_${transferId}_${item.id}_${item.medication_id}`;
        await recordLedgerMovement(client, {
          idempotencyKey: deductKey,
          movementType: 'branch_transfer_out',
          locationId: transfer.source_location_id,
          medicationId: item.medication_id,
          batchId: item.batch_id,
          quantityBase: -qtyToDispatch,
          unitCost: item.unit_cost,
          documentType: 'transfer_order',
          documentNumber: transfer.transfer_number,
          documentId: transferId,
          targetBranchId: transfer.destination_location_id,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: `صرف تحويل إلى ${transfer.destination_location_id}`
        });

        // 2. إضافة إلى موقع البضاعة في الطريق (loc_in_transit)
        const transitKey = `trf_transit_${transferId}_${item.id}_${item.medication_id}`;
        await recordLedgerMovement(client, {
          idempotencyKey: transitKey,
          movementType: 'branch_transfer_in',
          locationId: 'loc_in_transit',
          medicationId: item.medication_id,
          batchId: item.batch_id,
          quantityBase: qtyToDispatch,
          unitCost: item.unit_cost,
          documentType: 'transfer_order',
          documentNumber: transfer.transfer_number,
          documentId: transferId,
          sourceBranchId: transfer.source_location_id,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: 'شحنة في عهدة النقل'
        });

        // تحديث البند
        await client.query(`
          UPDATE public.inventory_transfer_items
          SET quantity_dispatched = $1, item_status = 'in_transit'
          WHERE id = $2
        `, [qtyToDispatch, item.id]);

        totalCostSum += (qtyToDispatch * parseFloat(item.unit_cost || 0));
      }

      // تحديث حالة أمر التحويل
      await client.query(`
        UPDATE public.inventory_transfers
        SET status = 'in_transit',
            dispatched_by_id = $1,
            dispatched_by_name = $2,
            driver_name = COALESCE($3, driver_name),
            driver_phone = COALESCE($4, driver_phone),
            total_cost_amount = $5,
            dispatched_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
      `, [req.stockUser.id, req.stockUser.name, driver_name || null, driver_phone || null, totalCostSum, transferId]);

      await client.query('COMMIT');
      broadcastStock('stock:transfer_dispatched', { transferId, transferNumber: transfer.transfer_number });
      res.json({ success: true, message: 'تم صرف أمر التحويل بنجاح، والشحنة الآن مسجلة كبضاعة في الطريق 🚚' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Dispatch Transfer Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 6.5 استلام الشحنة في الموقع المستهدف (خصم In-Transit ⬅️ إضافة للمخزن المستهدف)
  app.post('/api/stock/transfers/:id/receive', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const transferId = req.params.id;
      const { received_items = [] } = req.body;

      const trfRes = await client.query('SELECT * FROM public.inventory_transfers WHERE id = $1 FOR UPDATE', [transferId]);
      if (trfRes.rows.length === 0) throw new Error('أمر التحويل غير موجود');
      const transfer = trfRes.rows[0];

      if (['received_fully', 'closed'].includes(transfer.status)) {
        throw new Error('تم استلام هذا التحويل مسبقاً.');
      }
      if (transfer.status !== 'in_transit') {
        throw new Error('لا يمكن استلام تحويل لم يتم صرفه بعد.');
      }

      const itemsRes = await client.query('SELECT * FROM public.inventory_transfer_items WHERE transfer_id = $1', [transferId]);
      let allFullyReceived = true;

      for (const origItem of itemsRes.rows) {
        const itemInput = received_items.find(it => it.item_id === origItem.id) || {};
        const qtyReceived = itemInput.quantity_received !== undefined ? parseFloat(itemInput.quantity_received) : parseFloat(origItem.quantity_dispatched);
        const qtyDamaged = parseFloat(itemInput.quantity_damaged || 0);
        const qtyDispatched = parseFloat(origItem.quantity_dispatched || 0);
        const qtyShortage = Math.max(0, qtyDispatched - qtyReceived - qtyDamaged);

        if (qtyShortage > 0 || qtyDamaged > 0) allFullyReceived = false;

        // 1. خصم الكمية المسلمة بالكامل من موقع البضاعة في الطريق
        const clearTransitKey = `trf_clear_transit_${transferId}_${origItem.id}`;
        await recordLedgerMovement(client, {
          idempotencyKey: clearTransitKey,
          movementType: 'branch_transfer_out',
          locationId: 'loc_in_transit',
          medicationId: origItem.medication_id,
          batchId: origItem.batch_id,
          quantityBase: -qtyDispatched,
          unitCost: origItem.unit_cost,
          documentType: 'transfer_order',
          documentNumber: transfer.transfer_number,
          documentId: transferId,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: 'إفراغ الشحنة من عهدة الطريق'
        });

        // 2. إضافة الكمية السليمة للمخزن المستهدف
        if (qtyReceived > 0) {
          const receiveKey = `trf_rec_dest_${transferId}_${origItem.id}`;
          await recordLedgerMovement(client, {
            idempotencyKey: receiveKey,
            movementType: 'branch_transfer_in',
            locationId: transfer.destination_location_id,
            medicationId: origItem.medication_id,
            batchId: origItem.batch_id,
            quantityBase: qtyReceived,
            unitCost: origItem.unit_cost,
            documentType: 'transfer_order',
            documentNumber: transfer.transfer_number,
            documentId: transferId,
            sourceBranchId: transfer.source_location_id,
            performedById: req.stockUser.id,
            performedByName: req.stockUser.name,
            performedByRole: req.stockUser.role,
            notes: 'استلام بضاعة واردة بالفرع'
          });
        }

        // 3. إذا كان هناك تلف: نقله إلى موقع الهوالك (loc_damaged)
        if (qtyDamaged > 0) {
          const scrapKey = `trf_scrap_${transferId}_${origItem.id}`;
          await recordLedgerMovement(client, {
            idempotencyKey: scrapKey,
            movementType: 'scrap_expired',
            locationId: 'loc_damaged',
            medicationId: origItem.medication_id,
            batchId: origItem.batch_id,
            quantityBase: qtyDamaged,
            unitCost: origItem.unit_cost,
            documentType: 'transfer_order',
            documentNumber: transfer.transfer_number,
            documentId: transferId,
            performedById: req.stockUser.id,
            performedByName: req.stockUser.name,
            performedByRole: req.stockUser.role,
            notes: `بضاعة تالفة أثناء النقل بموجب تحويل #${transfer.transfer_number}`
          });
        }

        // تحديث حالة السطر
        await client.query(`
          UPDATE public.inventory_transfer_items
          SET quantity_received = $1, quantity_damaged = $2, quantity_shortage = $3, item_status = 'received'
          WHERE id = $4
        `, [qtyReceived, qtyDamaged, qtyShortage, origItem.id]);
      }

      const finalStatus = allFullyReceived ? 'received_fully' : 'partially_received';
      await client.query(`
        UPDATE public.inventory_transfers
        SET status = $1,
            received_by_id = $2,
            received_by_name = $3,
            received_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [finalStatus, req.stockUser.id, req.stockUser.name, transferId]);

      await client.query('COMMIT');
      broadcastStock('stock:transfer_received', { transferId, status: finalStatus });
      res.json({ success: true, message: `تم تأكيد استلام الشحنة بنجاح [${finalStatus === 'received_fully' ? 'استلام مطابق كامل' : 'استلام جزئي مع إثبات الفروق'}]` });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Receive Transfer Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 7. المشتريات والاستلام من الموردين (Supplier Receipts & Lot Entry) ──
  app.post('/api/stock/receipts', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        supplier_id,
        invoice_number,
        receipt_date = new Date().toISOString().slice(0, 10),
        target_location_id = 'loc_central_main',
        notes,
        items = []
      } = req.body;

      if (!supplier_id || !invoice_number || items.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'المورد ورقم الفاتورة وبند واحد على الأقل حقول إلزامية' });
      }

      const receiptId = `rec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      let totalQtySum = 0;
      let totalCostSum = 0;

      // 1. تسجيل ترويسة إذن الاستلام في outstock_order_receipts لضمان التكامل مع الأنظمة السابقة
      await client.query(`
        INSERT INTO public.outstock_order_receipts (
          id, supplier_id, invoice_number, receipt_date,
          receiving_employee_code, receiving_employee_name,
          items_count, total_quantity, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        receiptId, supplier_id, String(invoice_number).trim(), receipt_date,
        req.stockUser.id, req.stockUser.name, items.length, 0, notes || null
      ]);

      // 2. معالجة كل بند: إنشاء التشغيلة، إدراج البند، وتسجيل حركة الدفتر
      let idx = 0;
      for (const item of items) {
        idx++;
        const medId = item.medication_id;
        const qtyReceived = parseFloat(item.quantity_received || item.quantity || 1);
        const publicPrice = parseFloat(item.public_price || 0);
        const costPrice = parseFloat(item.cost_price || item.unit_price || (publicPrice * 0.75));
        const batchNo = String(item.batch_number || 'DEFAULT').trim().toUpperCase();
        const expDate = item.expiry_date || '2028-12-31';

        totalQtySum += qtyReceived;
        totalCostSum += (qtyReceived * costPrice);

        // إنشاء أو مطابقة معرف التشغيلة الفريد
        const batchHashId = `batch_${medId}_${batchNo.replace(/[^A-Z0-9]/g, '')}_${expDate}`;
        await client.query(`
          INSERT INTO public.inventory_batches (
            id, medication_id, batch_number, expiry_date, cost_price, public_price, supplier_id, receipt_reference_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (medication_id, batch_number, expiry_date, cost_price) DO UPDATE SET
            public_price = EXCLUDED.public_price,
            updated_at = CURRENT_TIMESTAMP;
        `, [batchHashId, medId, batchNo, expDate, costPrice, publicPrice, supplier_id, receiptId]);

        // إدراج بند الاستلام في outstock_order_receipt_items
        const recItemId = `reci_${Date.now()}_${idx}_${crypto.randomBytes(3).toString('hex')}`;
        await client.query(`
          INSERT INTO public.outstock_order_receipt_items (
            id, order_receipt_id, medication_id, medication_name, barcode, unit_name,
            quantity_received, public_price, batch_number, expiry_date, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          recItemId, receiptId, medId, item.medication_name || 'صنف دوائي', item.barcode || null,
          item.unit_name || 'علبة', qtyReceived, publicPrice, batchNo, expDate, item.notes || null
        ]);

        // تسجيل حركة الدفتر الذرية بنوع 'purchase_receipt'
        const ledgerIdempKey = `receipt_${receiptId}_${medId}_${batchHashId}_${idx}`;
        await recordLedgerMovement(client, {
          idempotencyKey: ledgerIdempKey,
          movementType: 'purchase_receipt',
          locationId: target_location_id,
          medicationId: medId,
          batchId: batchHashId,
          quantityBase: qtyReceived,
          unitCost: costPrice,
          documentType: 'supplier_receipt',
          documentNumber: String(invoice_number),
          documentId: receiptId,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: `استلام توريد من المورد [فاتورة #${invoice_number}]`
        });
      }

      // تحديث إجمالي الكمية في ترويسة الطلبية
      await client.query(`
        UPDATE public.outstock_order_receipts
        SET total_quantity = $1
        WHERE id = $2
      `, [totalQtySum, receiptId]);

      await client.query('COMMIT');
      broadcastStock('stock:receipt_created', { receiptId, invoiceNumber: invoice_number, itemsCount: items.length });
      res.json({ success: true, message: `تم تسجيل واستلام البضاعة وإضافتها لدفتر المخزون المركزي بنجاح 📦`, receiptId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Supplier Receipt Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 8. الجرد الفعلي والتسويات المخزنية (Inventory Counts & Variance) ──

  // 8.1 بدء جلسة جرد جديدة وتجميد الرصيد الدفتري (Snapshot)
  app.post('/api/stock/counts', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { location_id, count_type = 'full', notes } = req.body;
      if (!location_id) return res.status(400).json({ success: false, error: 'الموقع المطلوب جرده حقل إلزامي' });

      const countId = `cnt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const countNumber = `CNT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. تسجيل ترويسة الجلسة
      await client.query(`
        INSERT INTO public.inventory_counts (
          id, count_number, location_id, count_type, status, counted_by_id, counted_by_name, notes
        ) VALUES ($1, $2, $3, $4, 'in_progress', $5, $6, $7)
      `, [countId, countNumber, location_id, count_type, req.stockUser.id, req.stockUser.name, notes || null]);

      // 2. أخذ لقطة فورية (Snapshot) لكافة الأصناف والتشغيلات الموجودة حالياً بالموقع
      const balancesRes = await client.query(`
        SELECT b.medication_id, b.batch_id, b.quantity_on_hand, COALESCE(ib.cost_price, b.avg_unit_cost, 0) as unit_cost
        FROM public.inventory_balances b
        LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
        WHERE b.location_id = $1
      `, [location_id]);

      for (const row of balancesRes.rows) {
        const itemId = `cnti_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await client.query(`
          INSERT INTO public.inventory_count_items (
            id, count_id, medication_id, batch_id, book_quantity, actual_quantity, variance_quantity, unit_cost, variance_total_cost
          ) VALUES ($1, $2, $3, $4, $5, 0, -$5, $6, (-$5 * $6))
        `, [itemId, countId, row.medication_id, row.batch_id, parseFloat(row.quantity_on_hand), parseFloat(row.unit_cost)]);
      }

      await client.query('COMMIT');
      res.json({ success: true, message: 'تم فتح جلسة الجرد وتجميد الرصيد الدفتري بنجاح', countId, countNumber });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Start Count Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 8.2 جلب جلسات الجرد
  app.get('/api/stock/counts', authMiddleware, async (req, res) => {
    try {
      const { locationId, status } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (locationId && locationId !== 'all') {
        params.push(locationId);
        where += ` AND c.location_id = $${params.length}`;
      }
      if (status && status !== 'all') {
        params.push(status);
        where += ` AND c.status = $${params.length}`;
      }

      const countsRes = await db.query(`
        SELECT c.*, loc.name_ar as location_name,
          (SELECT COUNT(*) FROM public.inventory_count_items WHERE count_id = c.id) as items_count
        FROM public.inventory_counts c
        JOIN public.inventory_locations loc ON c.location_id = loc.id
        ${where}
        ORDER BY c.created_at DESC
      `, params);

      res.json({ success: true, counts: countsRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8.3 جلب تفاصيل جلسة جرد وبنودها
  app.get('/api/stock/counts/:id', authMiddleware, async (req, res) => {
    try {
      const countRes = await db.query(`
        SELECT c.*, loc.name_ar as location_name
        FROM public.inventory_counts c
        JOIN public.inventory_locations loc ON c.location_id = loc.id
        WHERE c.id = $1
      `, [req.params.id]);

      if (countRes.rows.length === 0) return res.status(404).json({ success: false, error: 'جلسة الجرد غير موجودة' });

      const itemsRes = await db.query(`
        SELECT ci.*, m.trade_name_ar, m.trade_name_en, m.pack_size, m.public_price, ib.batch_number, ib.expiry_date
        FROM public.inventory_count_items ci
        JOIN public.outstock_medications m ON ci.medication_id = m.id
        LEFT JOIN public.inventory_batches ib ON ci.batch_id = ib.id
        WHERE ci.count_id = $1
        ORDER BY ABS(ci.variance_quantity) DESC
      `, [req.params.id]);

      res.json({ success: true, count: countRes.rows[0], items: itemsRes.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8.4 تسجيل الصنف الفعلي الممسوح بالباركود في جلسة الجرد
  const handleCountScanItem = async (req, res) => {
    try {
      const countId = req.params.id;
      const { medication_id, batch_id, actual_quantity, barcode } = req.body;

      if (!medication_id) return res.status(400).json({ success: false, error: 'معرّف الصنف مطلوب' });

      const countItemRes = await db.query(`
        SELECT * FROM public.inventory_count_items 
        WHERE count_id = $1 AND medication_id = $2 AND (batch_id = $3 OR (batch_id IS NULL AND $3 IS NULL))
      `, [countId, medication_id, batch_id || null]);

      const actQty = parseFloat(actual_quantity || 0);

      if (countItemRes.rows.length > 0) {
        const item = countItemRes.rows[0];
        const variance = actQty - parseFloat(item.book_quantity);
        const cost = parseFloat(item.unit_cost || 0);
        await db.query(`
          UPDATE public.inventory_count_items
          SET actual_quantity = $1, variance_quantity = $2, variance_total_cost = ($2 * $3), barcode_scanned = COALESCE($4, barcode_scanned)
          WHERE id = $5
        `, [actQty, variance, cost, barcode || null, item.id]);
      } else {
        // صنف زائد تم العثور عليه ولم يكن له رصيد دفتري
        const medRes = await db.query('SELECT public_price, unit_price FROM public.outstock_medications WHERE id = $1', [medication_id]);
        const cost = medRes.rows[0] ? parseFloat(medRes.rows[0].unit_price * 0.75) : 0;
        const newItemId = `cnti_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        await db.query(`
          INSERT INTO public.inventory_count_items (
            id, count_id, medication_id, batch_id, book_quantity, actual_quantity, variance_quantity, unit_cost, variance_total_cost, barcode_scanned
          ) VALUES ($1, $2, $3, $4, 0, $5, $5, $6, ($5 * $6), $7)
        `, [newItemId, countId, medication_id, batch_id || null, actQty, cost, barcode || null]);
      }

      res.json({ success: true, message: 'تم حفظ قراءة الجرد الفعلي للصنف بنجاح' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
  app.post('/api/stock/counts/:id/scan-item', authMiddleware, handleCountScanItem);
  app.post('/api/stock/counts/:id/scan', authMiddleware, handleCountScanItem);

  // 8.5 اعتماد الجرد وترحيل التسويات المخزنية آلياً
  const handleCountPostReconciliation = async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const countId = req.params.id;

      const cntRes = await client.query('SELECT * FROM public.inventory_counts WHERE id = $1 FOR UPDATE', [countId]);
      if (cntRes.rows.length === 0) throw new Error('جلسة الجرد غير موجودة');
      const count = cntRes.rows[0];

      if (count.status === 'approved_posted') throw new Error('تم ترحيل واعتماد هذه الجلسة مسبقاً.');

      const itemsRes = await client.query('SELECT * FROM public.inventory_count_items WHERE count_id = $1', [countId]);
      let totalVarianceCost = 0;

      for (const it of itemsRes.rows) {
        const variance = parseFloat(it.variance_quantity || 0);
        if (variance === 0) continue;

        totalVarianceCost += parseFloat(it.variance_total_cost || 0);
        const movType = variance > 0 ? 'stock_adjustment_plus' : 'stock_adjustment_minus';
        const idempKey = `count_adj_${countId}_${it.id}_${it.medication_id}`;

        await recordLedgerMovement(client, {
          idempotencyKey: idempKey,
          movementType: movType,
          locationId: count.location_id,
          medicationId: it.medication_id,
          batchId: it.batch_id,
          quantityBase: variance, // موجب للزيادة وسالب للعجز
          unitCost: it.unit_cost,
          documentType: 'inventory_count',
          documentNumber: count.count_number,
          documentId: countId,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: `تسوية جرد دوري معتمد [${variance > 0 ? 'فائض مخزني' : 'عجز مخزني'}]`
        });
      }

      await client.query(`
        UPDATE public.inventory_counts
        SET status = 'approved_posted',
            reviewed_by_id = $1,
            reviewed_by_name = $2,
            total_variance_cost = $3,
            posted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [req.stockUser.id, req.stockUser.name, totalVarianceCost, countId]);

      await client.query('COMMIT');
      broadcastStock('stock:count_posted', { countId, countNumber: count.count_number });
      res.json({ success: true, message: 'تم ترحيل واعتماد فروق الجرد وتسوية أرصدة المخزن بنجاح ⚖️' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Post Count Reconciliation Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  };
  app.post('/api/stock/counts/:id/post-reconciliation', authMiddleware, handleCountPostReconciliation);
  app.post('/api/stock/counts/:id/post', authMiddleware, handleCountPostReconciliation);

  // ── 9. محرك التقارير العشرين المتخصصة (The 20 Specialized Inventory Reports) ──
  const handleStockReport = async (req, res) => {
    try {
      const reportType = req.params.reportType || req.query.report_type || req.query.reportType || 'balances_by_store';
      const { locationId, dateFrom, dateTo, medicationId, branchId } = req.query;

      let reportData = [];
      let reportTitle = 'تقرير مخزني';

      switch (reportType) {
        // 1. تقرير الأرصدة الحالية لكل مخزن وفرع
        case 'balances_by_store':
        case 'current_balances': {
          reportTitle = 'تقرير الأرصدة الحالية لكل مخزن وفرع';
          const params = [];
          let whereClause = 'WHERE b.quantity_on_hand <> 0';
          if (locationId) {
            params.push(locationId);
            whereClause += ` AND b.location_id = $${params.length}`;
          }
          const r1 = await db.query(`
            SELECT loc.name_ar as location_name, loc.location_type, m.trade_name_ar, m.trade_name_en, m.category,
                   m.gtin_barcode as barcode, b.quantity_on_hand, b.avg_unit_cost,
                   (b.quantity_on_hand * b.avg_unit_cost) as total_cost,
                   (b.quantity_on_hand * m.public_price) as total_public,
                   b.last_movement_at
            FROM public.inventory_balances b
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            ${whereClause}
            ORDER BY loc.name_ar, m.trade_name_ar
          `, params);
          reportData = r1.rows;
          break;
        }

        // 2. تقرير أرصدة الأصناف حسب الفروع (Matrix)
        case 'branch_matrix':
        case 'branch_stock_matrix': {
          reportTitle = 'تقرير مقارنة أرصدة الأصناف عبر شبكة الفروع والمستودعات';
          const r2 = await db.query(`
            SELECT m.trade_name_ar, m.trade_name_en, m.gtin_barcode as barcode,
                   loc.name_ar as branch_name, loc.id as branch_loc_id, b.quantity_on_hand,
                   m.public_price
            FROM public.inventory_balances b
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            WHERE loc.location_type IN ('central_warehouse', 'branch_store') AND b.quantity_on_hand <> 0
            ORDER BY m.trade_name_ar, loc.name_ar
            LIMIT 500
          `);
          reportData = r2.rows;
          break;
        }

        // 3. تقرير حركة صنف بالتفصيل (كارت الصنف الزمني)
        case 'stock_card': {
          reportTitle = 'تقرير كارت الصنف التفصيلي والحركات التاريخية';
          const params = [];
          let whereCond = 'WHERE 1=1';
          if (medicationId) {
            params.push(medicationId);
            whereCond += ` AND l.medication_id = $${params.length}`;
          }
          if (locationId) {
            params.push(locationId);
            whereCond += ` AND l.location_id = $${params.length}`;
          }
          const r3 = await db.query(`
            SELECT l.id, l.created_at, l.movement_type, loc.name_ar as location_name,
                   m.trade_name_ar, ib.batch_number, l.quantity_base, l.unit_cost, l.total_cost,
                   l.document_type, l.document_number, l.performed_by_name, l.notes
            FROM public.inventory_ledger l
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            JOIN public.outstock_medications m ON l.medication_id = m.id
            LEFT JOIN public.inventory_batches ib ON l.batch_id = ib.id
            ${whereCond}
            ORDER BY l.created_at DESC
            LIMIT 300
          `, params);
          reportData = r3.rows;
          break;
        }

        // 4. تقرير جميع الحركات المخزنية خلال فترة
        case 'ledger_movements': {
          reportTitle = 'تقرير سجل دفتر الحركات المخزنية العام';
          const params = [];
          let whereL = 'WHERE 1=1';
          if (dateFrom) {
            params.push(dateFrom);
            whereL += ` AND l.created_at >= $${params.length}::timestamptz`;
          }
          if (dateTo) {
            params.push(dateTo);
            whereL += ` AND l.created_at <= $${params.length}::timestamptz`;
          }
          const r4 = await db.query(`
            SELECT l.id, l.created_at, l.movement_type, loc.name_ar as location_name,
                   m.trade_name_ar, l.quantity_base, l.unit_cost, l.total_cost,
                   l.document_type, l.document_number, l.performed_by_name
            FROM public.inventory_ledger l
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            JOIN public.outstock_medications m ON l.medication_id = m.id
            ${whereL}
            ORDER BY l.created_at DESC
            LIMIT 300
          `, params);
          reportData = r4.rows;
          break;
        }

        // 5. تقرير التحويلات الصادرة والواردة
        case 'transfers_summary': {
          reportTitle = 'تقرير التحويلات المخزنية الصادرة والواردة';
          const r5 = await db.query(`
            SELECT t.transfer_number, t.transfer_type, t.status, src.name_ar as source_name,
                   dest.name_ar as dest_name, t.requested_by_name, t.dispatched_by_name,
                   t.received_by_name, t.total_requested_items, t.total_received_items,
                   t.total_cost_amount, t.dispatched_at, t.received_at, t.created_at
            FROM public.inventory_transfers t
            JOIN public.inventory_locations src ON t.source_location_id = src.id
            JOIN public.inventory_locations dest ON t.destination_location_id = dest.id
            ORDER BY t.created_at DESC
            LIMIT 200
          `);
          reportData = r5.rows;
          break;
        }

        // 6. تقرير التحويلات المعلقة والمتأخرة في الطريق (In-Transit)
        case 'in_transit': {
          reportTitle = 'تقرير الشحنات والبضاعة في الطريق (In-Transit)';
          const r6 = await db.query(`
            SELECT t.transfer_number, src.name_ar as source_name, dest.name_ar as destination_name,
                   t.driver_name, t.driver_phone, t.dispatched_at, m.trade_name_ar,
                   ti.quantity_requested, ti.quantity_dispatched, ti.unit_cost,
                   ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.dispatched_at)) / 3600, 1) as hours_in_transit
            FROM public.inventory_transfers t
            JOIN public.inventory_locations src ON t.source_location_id = src.id
            JOIN public.inventory_locations dest ON t.destination_location_id = dest.id
            JOIN public.inventory_transfer_items ti ON t.id = ti.transfer_id
            JOIN public.outstock_medications m ON ti.medication_id = m.id
            WHERE t.status = 'in_transit'
            ORDER BY t.dispatched_at ASC
          `);
          reportData = r6.rows;
          break;
        }

        // 7. تقرير الاستلامات من الموردين (GRN Summary)
        case 'supplier_receipts': {
          reportTitle = 'تقرير استلام البضائع والمشتريات من الموردين';
          const r7 = await db.query(`
            SELECT l.created_at as receipt_date, l.document_number as invoice_num,
                   loc.name_ar as location_name, m.trade_name_ar, ib.batch_number,
                   ib.expiry_date, l.quantity_base, l.unit_cost, l.total_cost,
                   l.performed_by_name
            FROM public.inventory_ledger l
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            JOIN public.outstock_medications m ON l.medication_id = m.id
            LEFT JOIN public.inventory_batches ib ON l.batch_id = ib.id
            WHERE l.movement_type = 'supplier_receipt'
            ORDER BY l.created_at DESC
            LIMIT 200
          `);
          reportData = r7.rows;
          break;
        }

        // 8. تقرير المشتريات وتكاليف الاستلام الفعلية
        case 'purchase_costs': {
          reportTitle = 'تقرير المشتريات والتكلفة الفعلية للأدوية';
          const r8 = await db.query(`
            SELECT m.trade_name_ar, m.manufacturer, ib.batch_number, ib.expiry_date,
                   ib.cost_price, m.public_price,
                   ROUND(((m.public_price - ib.cost_price) / NULLIF(m.public_price, 0)) * 100, 1) as margin_pct,
                   b.quantity_on_hand, (b.quantity_on_hand * ib.cost_price) as total_holding_cost
            FROM public.inventory_batches ib
            JOIN public.outstock_medications m ON ib.medication_id = m.id
            LEFT JOIN public.inventory_balances b ON b.batch_id = ib.id
            WHERE ib.cost_price > 0
            ORDER BY ib.created_at DESC
            LIMIT 250
          `);
          reportData = r8.rows;
          break;
        }

        // 9. تقرير التشغيلات وتواريخ الصلاحية الشامل
        case 'batches_expiry': {
          reportTitle = 'تقرير التشغيلات وتواريخ الصلاحية لكافة الأصناف';
          const r9 = await db.query(`
            SELECT loc.name_ar as location_name, m.trade_name_ar, ib.batch_number,
                   ib.expiry_date, ib.cost_price, b.quantity_on_hand,
                   (ib.expiry_date - CURRENT_DATE) as days_remaining,
                   CASE WHEN ib.expiry_date < CURRENT_DATE THEN 'منتهي'
                        WHEN ib.expiry_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'قريب الانتهاء'
                        ELSE 'ساري' END as batch_status
            FROM public.inventory_balances b
            JOIN public.inventory_batches ib ON b.batch_id = ib.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand > 0
            ORDER BY ib.expiry_date ASC
            LIMIT 300
          `);
          reportData = r9.rows;
          break;
        }

        // 10. تقرير الأصناف القريبة من انتهاء الصلاحية
        case 'near_expiry': {
          reportTitle = 'تقرير الأصناف القريبة من انتهاء الصلاحية (FEFO Watch)';
          const r10 = await db.query(`
            SELECT m.trade_name_ar, m.trade_name_en, loc.name_ar as location_name,
                   ib.batch_number, ib.expiry_date, b.quantity_on_hand, ib.cost_price,
                   (ib.expiry_date - CURRENT_DATE) as days_remaining
            FROM public.inventory_balances b
            JOIN public.inventory_batches ib ON b.batch_id = ib.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand > 0 AND ib.expiry_date <= (CURRENT_DATE + INTERVAL '120 days')
                  AND ib.expiry_date >= CURRENT_DATE
            ORDER BY ib.expiry_date ASC
          `);
          reportData = r10.rows;
          break;
        }

        // 11. تقرير الأصناف المنتهية الصلاحية
        case 'expired': {
          reportTitle = 'تقرير الأصناف المنتهية الصلاحية الواجب استبعادها';
          const r11 = await db.query(`
            SELECT m.trade_name_ar, loc.name_ar as location_name, ib.batch_number, ib.expiry_date,
                   b.quantity_on_hand, (b.quantity_on_hand * ib.cost_price) as loss_cost,
                   (CURRENT_DATE - ib.expiry_date) as days_expired
            FROM public.inventory_balances b
            JOIN public.inventory_batches ib ON b.batch_id = ib.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand > 0 AND ib.expiry_date < CURRENT_DATE
            ORDER BY ib.expiry_date ASC
          `);
          reportData = r11.rows;
          break;
        }

        // 12. تقرير الأصناف منخفضة المخزون وحد الطلب
        case 'low_stock': {
          reportTitle = 'تقرير الأصناف منخفضة المخزون ونواقص الفروع';
          const r12 = await db.query(`
            SELECT m.trade_name_ar, m.trade_name_en, loc.name_ar as location_name,
                   b.quantity_on_hand, m.public_price, m.manufacturer
            FROM public.inventory_balances b
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand <= 5 AND b.quantity_on_hand >= 0
            ORDER BY b.quantity_on_hand ASC
          `);
          reportData = r12.rows;
          break;
        }

        // 13. تقرير الأصناف الراكدة
        case 'dead_stock': {
          reportTitle = 'تقرير الأصناف الراكدة وبطيئة الحركة (Dead Stock)';
          const r13 = await db.query(`
            SELECT m.trade_name_ar, loc.name_ar as location_name, b.quantity_on_hand,
                   b.avg_unit_cost, (b.quantity_on_hand * b.avg_unit_cost) as capital_locked,
                   b.last_movement_at,
                   ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b.last_movement_at)) / 86400, 0) as inactive_days
            FROM public.inventory_balances b
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand > 0 AND b.last_movement_at <= (CURRENT_TIMESTAMP - INTERVAL '45 days')
            ORDER BY b.last_movement_at ASC
            LIMIT 200
          `);
          reportData = r13.rows;
          break;
        }

        // 14. تقرير الجرد وفروق الجرد
        case 'count_variance': {
          reportTitle = 'تقرير جلسات الجرد ومطابقة الأرصدة الدفترية والفعلية';
          const r14 = await db.query(`
            SELECT c.count_number, loc.name_ar as location_name, m.trade_name_ar,
                   ci.book_quantity, ci.actual_quantity, ci.variance_quantity, ci.variance_total_cost,
                   c.counted_by_name, c.posted_at
            FROM public.inventory_counts c
            JOIN public.inventory_locations loc ON c.location_id = loc.id
            JOIN public.inventory_count_items ci ON c.id = ci.count_id
            JOIN public.outstock_medications m ON ci.medication_id = m.id
            WHERE ci.variance_quantity <> 0
            ORDER BY c.posted_at DESC, ABS(ci.variance_total_cost) DESC
          `);
          reportData = r14.rows;
          break;
        }

        // 15. تقرير صافي العجز والزيادة
        case 'shortage_surplus': {
          reportTitle = 'تقرير صافي فروق الجرد (العجز والزيادة)';
          const r15 = await db.query(`
            SELECT c.count_number, loc.name_ar as location_name,
                   SUM(CASE WHEN ci.variance_quantity > 0 THEN ci.variance_quantity ELSE 0 END) as total_surplus_units,
                   SUM(CASE WHEN ci.variance_quantity < 0 THEN ABS(ci.variance_quantity) ELSE 0 END) as total_shortage_units,
                   SUM(ci.variance_total_cost) as net_variance_cost,
                   c.posted_at
            FROM public.inventory_counts c
            JOIN public.inventory_locations loc ON c.location_id = loc.id
            JOIN public.inventory_count_items ci ON c.id = ci.count_id
            GROUP BY c.count_number, loc.name_ar, c.posted_at
            ORDER BY c.posted_at DESC
          `);
          reportData = r15.rows;
          break;
        }

        // 16. تقرير التالف والهالك
        case 'damaged_scrap': {
          reportTitle = 'تقرير البضاعة التالفة والهالكة ومستودع التوالف';
          const r16 = await db.query(`
            SELECT loc.name_ar as location_name, m.trade_name_ar, l.quantity_base,
                   l.unit_cost, l.total_cost, l.document_type, l.document_number,
                   l.notes, l.created_at
            FROM public.inventory_ledger l
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            JOIN public.outstock_medications m ON l.medication_id = m.id
            WHERE l.movement_type IN ('transfer_loss', 'scrap_expired') OR loc.location_type = 'scrap'
            ORDER BY l.created_at DESC
            LIMIT 200
          `);
          reportData = r16.rows;
          break;
        }

        // 17. تقرير تقييم المخزون المالي
        case 'valuation': {
          reportTitle = 'تقرير تقييم المخزون المالي الإجمالي بالتكلفة والبيع';
          const r17 = await db.query(`
            SELECT loc.name_ar as location_name,
                   COUNT(DISTINCT b.medication_id) as items_count,
                   SUM(b.quantity_on_hand) as total_units,
                   SUM(b.quantity_on_hand * COALESCE(ib.cost_price, b.avg_unit_cost, m.unit_price * 0.75)) as total_cost_valuation,
                   SUM(b.quantity_on_hand * m.public_price) as total_public_valuation
            FROM public.inventory_balances b
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            JOIN public.outstock_medications m ON b.medication_id = m.id
            LEFT JOIN public.inventory_batches ib ON b.batch_id = ib.id
            GROUP BY loc.name_ar
          `);
          reportData = r17.rows;
          break;
        }

        // 18. تقرير حركة المخزون المرتبطة بمبيعات POS ومرتجعاته
        case 'pos_sync_audit': {
          reportTitle = 'تقرير تدقيق ومطابقة مبيعات POS مع دفتر المخزون';
          const r18 = await db.query(`
            SELECT l.created_at, l.movement_type, loc.name_ar as location_name,
                   m.trade_name_ar, l.quantity_base, l.document_number as invoice_number,
                   l.performed_by_name as cashier_name
            FROM public.inventory_ledger l
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            JOIN public.outstock_medications m ON l.medication_id = m.id
            WHERE l.movement_type IN ('pos_sale', 'pos_return')
            ORDER BY l.created_at DESC
            LIMIT 300
          `);
          reportData = r18.rows;
          break;
        }

        // 19. تقرير الأرصدة السالبة وأسبابها
        case 'negative_stock': {
          reportTitle = 'تقرير الأرصدة السالبة ومبيعات الأوفلاين المعلقة';
          const r19 = await db.query(`
            SELECT m.trade_name_ar, loc.name_ar as location_name, b.quantity_on_hand,
                   b.last_movement_at, m.public_price
            FROM public.inventory_balances b
            JOIN public.outstock_medications m ON b.medication_id = m.id
            JOIN public.inventory_locations loc ON b.location_id = loc.id
            WHERE b.quantity_on_hand < 0
            ORDER BY b.quantity_on_hand ASC
          `);
          reportData = r19.rows;
          break;
        }

        // 20. تقرير سجل المستخدمين والعمليات الحساسة
        case 'audit_logs': {
          reportTitle = 'تقرير سجل التدقيق الرقابي للعمليات المخزنية الحساسة';
          const r20 = await db.query(`
            SELECT a.id, a.action_type, a.target_entity, a.target_id, a.performed_by_name,
                   loc.name_ar as location_name, a.details, a.client_ip, a.created_at
            FROM public.inventory_audit_logs a
            LEFT JOIN public.inventory_locations loc ON a.location_id = loc.id
            ORDER BY a.created_at DESC
            LIMIT 250
          `);
          reportData = r20.rows;
          break;
        }

        default: {
          const rDef = await db.query(`
            SELECT l.*, m.trade_name_ar, loc.name_ar as location_name
            FROM public.inventory_ledger l
            JOIN public.outstock_medications m ON l.medication_id = m.id
            JOIN public.inventory_locations loc ON l.location_id = loc.id
            ORDER BY l.created_at DESC LIMIT 100
          `);
          reportTitle = 'تقرير حركات المخزون العامة';
          reportData = rDef.rows;
          break;
        }
      }

      res.json({
        success: true,
        reportType,
        reportTitle,
        generatedAt: new Date().toISOString(),
        data: reportData
      });
    } catch (err) {
      console.error('[Stock Report Error]:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  };

  app.get('/api/stock/reports', authMiddleware, handleStockReport);
  app.get('/api/stock/reports/:reportType', authMiddleware, handleStockReport);

  // ── 10. دالة المطابقة الذاتية لإعادة احتساب الأرصدة ──
  app.post('/api/stock/reconcile', authMiddleware, async (req, res) => {
    try {
      const { locationId, medicationId } = req.body;
      if (!locationId || !medicationId) {
        return res.status(400).json({ success: false, error: 'الموقع والصنف مطلوبان للمطابقة' });
      }
      const result = await reconcileBalance(db, locationId, medicationId);
      res.json({ success: true, message: 'تمت مطابقة وتحديث الرصيد اللحظي وفق الدفتر المركزي بنجاح', result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 11. محرك الاستدعاء الدوائي وحجر التشغيلات (Drug Recall & Quarantine Engine) ──
  app.get('/api/stock/recalls/search', authMiddleware, async (req, res) => {
    try {
      const { query = '' } = req.query;
      const cleanQ = String(query).trim();
      if (!cleanQ) {
        return res.json({ success: true, results: [] });
      }

      const qResult = await db.query(`
        SELECT 
          ib.id as batch_id,
          ib.batch_number,
          ib.expiry_date,
          ib.production_date,
          ib.cost_price,
          ib.public_price,
          ib.is_quarantined,
          m.id as medication_id,
          m.trade_name_ar,
          m.trade_name_en,
          m.barcode,
          m.unit_type,
          loc.id as location_id,
          loc.code as location_code,
          loc.name_ar as location_name,
          loc.location_type,
          COALESCE(bal.quantity_on_hand, 0) as quantity_on_hand
        FROM public.inventory_batches ib
        JOIN public.outstock_medications m ON m.id = ib.medication_id
        LEFT JOIN public.inventory_balances bal ON bal.batch_id = ib.id
        LEFT JOIN public.inventory_locations loc ON loc.id = bal.location_id
        WHERE 
          ib.batch_number ILIKE $1 
          OR m.trade_name_ar ILIKE $1 
          OR m.trade_name_en ILIKE $1 
          OR m.barcode = $2
        ORDER BY ib.expiry_date ASC, loc.is_central DESC;
      `, [`%${cleanQ}%`, cleanQ]);

      // تجميع النتائج لكل تشغيلة مع توزيع الفروع والمخازن
      const batchesMap = new Map();
      for (const row of qResult.rows) {
        if (!batchesMap.has(row.batch_id)) {
          batchesMap.set(row.batch_id, {
            batch_id: row.batch_id,
            batch_number: row.batch_number,
            expiry_date: row.expiry_date,
            production_date: row.production_date,
            cost_price: parseFloat(row.cost_price || 0),
            public_price: parseFloat(row.public_price || 0),
            is_quarantined: Boolean(row.is_quarantined),
            medication_id: row.medication_id,
            trade_name_ar: row.trade_name_ar,
            trade_name_en: row.trade_name_en,
            barcode: row.barcode,
            unit_type: row.unit_type,
            total_quantity: 0,
            locations: []
          });
        }

        const bData = batchesMap.get(row.batch_id);
        const qty = parseFloat(row.quantity_on_hand || 0);
        if (row.location_id) {
          bData.locations.push({
            location_id: row.location_id,
            location_code: row.location_code,
            location_name: row.location_name,
            location_type: row.location_type,
            quantity: qty
          });
          bData.total_quantity += qty;
        }
      }

      res.json({
        success: true,
        count: batchesMap.size,
        results: Array.from(batchesMap.values())
      });
    } catch (err) {
      console.error('[Drug Recall Search Error]:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/recalls/quarantine', authMiddleware, async (req, res) => {
    try {
      const { batchId, batchNumber, reason = 'أمر سحب رقابي من هيئة الدواء المصرية', medicationId } = req.body;
      if (!batchId && !batchNumber) {
        return res.status(400).json({ success: false, error: 'رقم أو معرّف التشغيلة مطلوب' });
      }

      const updateRes = await db.query(`
        UPDATE public.inventory_batches
        SET is_quarantined = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 OR batch_number = $2
        RETURNING id, batch_number, medication_id;
      `, [batchId || 'non-existent', batchNumber || 'non-existent']);

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'التشغيلة المحددة غير موجودة' });
      }

      const quarantinedBatch = updateRes.rows[0];

      // تسجيل العملية في سجل التدقيق الرقابي
      await db.query(`
        INSERT INTO public.inventory_audit_logs (
          action_type, target_entity, target_id, performed_by_id, performed_by_name, details
        ) VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        'batch_quarantined_recall',
        'inventory_batch',
        quarantinedBatch.id,
        req.stockUser.id,
        req.stockUser.name,
        JSON.stringify({
          batch_number: quarantinedBatch.batch_number,
          medication_id: quarantinedBatch.medication_id,
          reason,
          quarantined_at: new Date().toISOString()
        })
      ]);

      // إرسال إشعار فوري لجميع شاشات الكاشير والمخازن لتجميد البيع فوراً
      broadcastStock('stock:batch_quarantined', {
        batchId: quarantinedBatch.id,
        batchNumber: quarantinedBatch.batch_number,
        medicationId: quarantinedBatch.medication_id,
        reason,
        performedBy: req.stockUser.name
      });

      res.json({
        success: true,
        message: `تم فرض الحجر الفوري على التشغيلة #${quarantinedBatch.batch_number} ومنع صرفها في جميع الفروع والمخازن بنجاح.`,
        batch: quarantinedBatch
      });
    } catch (err) {
      console.error('[Quarantine Batch Error]:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/recalls/unquarantine', authMiddleware, async (req, res) => {
    try {
      const { batchId, batchNumber, reason = 'إلغاء الحجر بعد التحقق الرسمي' } = req.body;
      const updateRes = await db.query(`
        UPDATE public.inventory_batches
        SET is_quarantined = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 OR batch_number = $2
        RETURNING id, batch_number, medication_id;
      `, [batchId || 'non-existent', batchNumber || 'non-existent']);

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'التشغيلة المحددة غير موجودة' });
      }

      const unquarantined = updateRes.rows[0];

      await db.query(`
        INSERT INTO public.inventory_audit_logs (
          action_type, target_entity, target_id, performed_by_id, performed_by_name, details
        ) VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        'batch_unquarantined',
        'inventory_batch',
        unquarantined.id,
        req.stockUser.id,
        req.stockUser.name,
        JSON.stringify({
          batch_number: unquarantined.batch_number,
          reason,
          unquarantined_at: new Date().toISOString()
        })
      ]);

      broadcastStock('stock:batch_unquarantined', {
        batchId: unquarantined.id,
        batchNumber: unquarantined.batch_number,
        medicationId: unquarantined.medication_id
      });

      res.json({
        success: true,
        message: `تم إلغاء حجر التشغيلة #${unquarantined.batch_number} وإعادتها للصرف الطبيعي.`,
        batch: unquarantined
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 12. محرك الذكاء التحليلي لإعادة الطلب وتخطيط الاحتياجات (Smart Reorder Engine) ──
  app.get('/api/stock/reorder/suggestions', authMiddleware, async (req, res) => {
    try {
      const {
        locationId = 'loc_central',
        lookbackDays = '30',
        leadTimeDays = '7',
        targetBufferDays = '14'
      } = req.query;

      const lookback = Math.max(7, parseInt(lookbackDays, 10) || 30);
      const leadTime = Math.max(1, parseInt(leadTimeDays, 10) || 7);
      const bufferDays = Math.max(7, parseInt(targetBufferDays, 10) || 14);

      // استعلام تحليلي ذكي يربط الرصيد الحالي بمعدل المبيعات والاستهلاك الفعلي
      const suggestionsQuery = `
        WITH current_stocks AS (
          SELECT 
            b.medication_id,
            COALESCE(SUM(b.quantity_on_hand), 0) as current_qty
          FROM public.inventory_balances b
          WHERE b.location_id = $1
          GROUP BY b.medication_id
        ),
        central_stocks AS (
          SELECT 
            b.medication_id,
            COALESCE(SUM(b.quantity_on_hand), 0) as central_qty
          FROM public.inventory_balances b
          WHERE b.location_id = 'loc_central'
          GROUP BY b.medication_id
        ),
        outflow_stats AS (
          SELECT 
            l.medication_id,
            COALESCE(SUM(ABS(l.quantity_base)), 0) as total_consumed
          FROM public.inventory_ledger l
          WHERE l.location_id = $1
            AND l.quantity_base < 0
            AND l.created_at >= (CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL)
          GROUP BY l.medication_id
        )
        SELECT 
          m.id as medication_id,
          m.trade_name_ar,
          m.trade_name_en,
          m.barcode,
          m.category,
          m.unit_type,
          m.unit_price,
          m.public_price,
          COALESCE(cs.current_qty, 0) as current_stock,
          COALESCE(cent.central_qty, 0) as central_available_stock,
          COALESCE(os.total_consumed, 0) as total_consumed,
          ROUND((COALESCE(os.total_consumed, 0) / $2::NUMERIC), 2) as daily_run_rate
        FROM public.outstock_medications m
        LEFT JOIN current_stocks cs ON cs.medication_id = m.id
        LEFT JOIN central_stocks cent ON cent.medication_id = m.id
        LEFT JOIN outflow_stats os ON os.medication_id = m.id
        WHERE (COALESCE(cs.current_qty, 0) < 20 OR COALESCE(os.total_consumed, 0) > 0)
        ORDER BY 
          CASE WHEN COALESCE(cs.current_qty, 0) <= 0 THEN 0 ELSE 1 END ASC,
          ROUND((COALESCE(os.total_consumed, 0) / $2::NUMERIC), 2) DESC
        LIMIT 100;
      `;

      const qRes = await db.query(suggestionsQuery, [locationId, lookback]);

      const items = qRes.rows.map(row => {
        const curStock = parseFloat(row.current_stock || 0);
        const centralStock = parseFloat(row.central_available_stock || 0);
        const dailyRate = Math.max(0.1, parseFloat(row.daily_run_rate || 0));
        const safetyStock = Math.ceil(dailyRate * 3);
        const reorderPoint = Math.ceil((dailyRate * leadTime) + safetyStock);
        const daysOfStockLeft = curStock <= 0 ? 0 : Math.round(curStock / dailyRate);

        // كمية التوريد المقترحة لتغطية فترة الأمان والتوريد
        const targetStock = Math.ceil((dailyRate * (leadTime + bufferDays)) + safetyStock);
        const suggestedQty = Math.max(0, targetStock - curStock);

        let urgency = 'optimal';
        if (curStock <= 0 || daysOfStockLeft <= 2) urgency = 'critical';
        else if (curStock <= reorderPoint || daysOfStockLeft <= 5) urgency = 'warning';

        // اقتراح مصدر الإمداد
        const isBranch = locationId !== 'loc_central';
        let recommendedSource = 'supplier_order';
        if (isBranch && centralStock >= suggestedQty && suggestedQty > 0) {
          recommendedSource = 'central_transfer';
        }

        return {
          medication_id: row.medication_id,
          trade_name_ar: row.trade_name_ar,
          trade_name_en: row.trade_name_en,
          barcode: row.barcode,
          category: row.category,
          unit_type: row.unit_type,
          public_price: parseFloat(row.public_price || 0),
          cost_price: parseFloat(row.unit_price || 0),
          current_stock: curStock,
          central_available_stock: centralStock,
          daily_run_rate: dailyRate,
          days_of_stock_left: daysOfStockLeft,
          safety_stock: safetyStock,
          reorder_point: reorderPoint,
          suggested_qty: suggestedQty,
          urgency,
          recommended_source: recommendedSource,
          estimated_cost: parseFloat((suggestedQty * (row.unit_price || 0)).toFixed(2))
        };
      }).filter(it => it.urgency === 'critical' || it.urgency === 'warning' || it.suggested_qty > 0);

      res.json({
        success: true,
        locationId,
        lookbackDays: lookback,
        leadTimeDays: leadTime,
        totalSuggestions: items.length,
        criticalCount: items.filter(i => i.urgency === 'critical').length,
        warningCount: items.filter(i => i.urgency === 'warning').length,
        items
      });
    } catch (err) {
      console.error('[Smart Reorder Error]:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // إنشاء مسودة أمر تحويل دفعة واحدة من مقترحات إعادة الطلب
  app.post('/api/stock/reorder/create-batch-transfer', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        source_location_id = 'loc_central',
        destination_location_id,
        items = [],
        notes = 'أمر تحويل آلي مولد عبر محرك تخطيط الاحتياجات وإعادة الطلب PharmaOS Reorder AI'
      } = req.body;

      if (!destination_location_id) {
        throw new Error('موقع الفرع المستهدف مطلوب');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('قائمة الأصناف المطلوبة فارغة');
      }

      const transferId = `trf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const transferNumber = `TRF-AUTO-${Date.now().toString(36).toUpperCase()}`;

      await client.query(`
        INSERT INTO public.inventory_transfers (
          id, transfer_number, transfer_type, source_location_id, destination_location_id,
          in_transit_location_id, status, requested_by_id, requested_by_name,
          total_requested_items, notes, created_at, updated_at
        ) VALUES (
          $1, $2, 'main_to_branch', $3, $4, 'loc_in_transit', 'draft',
          $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
      `, [
        transferId, transferNumber, source_location_id, destination_location_id,
        req.stockUser.id, req.stockUser.name, items.length, notes
      ]);

      for (const it of items) {
        const itemId = `trfi_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        await client.query(`
          INSERT INTO public.inventory_transfer_items (
            id, transfer_id, medication_id, unit_type, quantity_requested,
            quantity_approved, unit_cost, item_status
          ) VALUES ($1, $2, $3, $4, $5, $5, $6, 'pending');
        `, [
          itemId, transferId, it.medication_id, it.unit_type || 'pack',
          parseFloat(it.quantity || 1), parseFloat(it.cost_price || 0)
        ]);
      }

      await client.query('COMMIT');

      broadcastStock('stock:transfer_created', { transferId, transferNumber, destination_location_id });

      res.json({
        success: true,
        message: `تم إنشاء أمر التحويل الآلي #${transferNumber} بنجاح وإدراجه في قائمة التحويلات كمسودة للاعتماد والصرف.`,
        transferId,
        transferNumber
      });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 13. مركز الهوالك والتوالف وإعدام الأدوية منتهية الصلاحية (Scrap & Disposal Center) ──
  app.post('/api/stock/scrap', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        location_id,
        items = [],
        reason = 'expired', // 'expired', 'damaged', 'broken', 'recalled'
        notes = ''
      } = req.body;

      if (!location_id) throw new Error('موقع التخزين المراد استبعاد التوالف منه مطلوب');
      if (!Array.isArray(items) || items.length === 0) throw new Error('قائمة الأصناف المراد استبعادها فارغة');

      const scrapDocNum = `SCRAP-${Date.now().toString(36).toUpperCase()}`;
      let totalScrapCost = 0;

      for (const item of items) {
        const qty = parseFloat(item.quantity || 0);
        if (qty <= 0) continue;

        const unitCost = parseFloat(item.unit_cost || 0);
        const itemTotal = qty * unitCost;
        totalScrapCost += itemTotal;

        // 1. حركة خروج من المستودع الأصلي
        const outKey = `scrap_out_${scrapDocNum}_${item.medication_id}_${item.batch_id || 'default'}`;
        await recordLedgerMovement(client, {
          idempotencyKey: outKey,
          movementType: 'scrap_expired',
          locationId: location_id,
          medicationId: item.medication_id,
          batchId: item.batch_id || null,
          quantityBase: -qty,
          unitCost,
          documentType: 'scrap_order',
          documentNumber: scrapDocNum,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: `إعدام وإهلاك مخزني (${reason}): ${notes}`
        });

        // 2. حركة قيد في مستودع الهوالك loc_damaged
        const inKey = `scrap_in_${scrapDocNum}_${item.medication_id}_${item.batch_id || 'default'}`;
        await recordLedgerMovement(client, {
          idempotencyKey: inKey,
          movementType: 'scrap_expired',
          locationId: 'loc_damaged',
          medicationId: item.medication_id,
          batchId: item.batch_id || null,
          quantityBase: qty,
          unitCost,
          documentType: 'scrap_order',
          documentNumber: scrapDocNum,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: `استقبال تالف إلى حساب الهوالك بموجب إذن إعدام #${scrapDocNum}`
        });
      }

      await client.query('COMMIT');

      broadcastStock('stock:scrap_logged', { scrapDocNum, location_id, totalScrapCost });

      res.json({
        success: true,
        message: `تم تسجيل إذن الهوالك والإعدام المخزني #${scrapDocNum} بقيمة ${totalScrapCost.toFixed(2)} ج بنجاح وتم ترحيل الأرصدة فوراً.`,
        scrapDocNum,
        totalScrapCost
      });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 14. مركز المرتجعات (Branch Returns & Supplier Returns) ──
  app.post('/api/stock/returns', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        return_type = 'branch_to_central', // 'branch_to_central' or 'central_to_supplier'
        source_location_id,
        supplier_id,
        items = [],
        notes = ''
      } = req.body;

      if (!source_location_id) throw new Error('موقع الإرجاع مطلوب');
      if (!Array.isArray(items) || items.length === 0) throw new Error('قائمة أصناف المرتجع فارغة');

      const returnNumber = `RET-${Date.now().toString(36).toUpperCase()}`;

      if (return_type === 'branch_to_central') {
        // إنشاء أمر تحويل عكسي من الفرع للمخزن المركزي
        const transferId = `trf_ret_${Date.now()}`;
        await client.query(`
          INSERT INTO public.inventory_transfers (
            id, transfer_number, transfer_type, source_location_id, destination_location_id,
            in_transit_location_id, status, requested_by_id, requested_by_name,
            total_requested_items, notes, created_at, updated_at
          ) VALUES (
            $1, $2, 'branch_to_main', $3, 'loc_central', 'loc_in_transit', 'draft',
            $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          );
        `, [
          transferId, returnNumber, source_location_id,
          req.stockUser.id, req.stockUser.name, items.length,
          `مرتجع بضاعة من الفرع إلى المخزن الرئيسي: ${notes}`
        ]);

        for (const it of items) {
          const itemId = `trfi_ret_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          await client.query(`
            INSERT INTO public.inventory_transfer_items (
              id, transfer_id, medication_id, batch_id, unit_type, quantity_requested,
              quantity_approved, unit_cost, item_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, 'pending');
          `, [
            itemId, transferId, it.medication_id, it.batch_id || null, it.unit_type || 'pack',
            parseFloat(it.quantity || 1), parseFloat(it.unit_cost || 0)
          ]);
        }

        await client.query('COMMIT');
        broadcastStock('stock:transfer_created', { transferId, transferNumber: returnNumber });

        return res.json({
          success: true,
          message: `تم إنشاء إذن مرتجع فرعي #${returnNumber} بنجاح كمسودة تحويل عكسي للمخزن الرئيسي.`,
          returnNumber,
          transferId
        });
      } else {
        // مرتجع مباشر إلى المورد من المخزن المركزي
        for (const item of items) {
          const qty = parseFloat(item.quantity || 0);
          if (qty <= 0) continue;
          const unitCost = parseFloat(item.unit_cost || 0);

          const retKey = `sup_ret_${returnNumber}_${item.medication_id}_${item.batch_id || 'default'}`;
          await recordLedgerMovement(client, {
            idempotencyKey: retKey,
            movementType: 'supplier_return',
            locationId: source_location_id,
            medicationId: item.medication_id,
            batchId: item.batch_id || null,
            quantityBase: -qty,
            unitCost,
            documentType: 'supplier_return_invoice',
            documentNumber: returnNumber,
            performedById: req.stockUser.id,
            performedByName: req.stockUser.name,
            performedByRole: req.stockUser.role,
            notes: `مرتجع إلى المورد: ${notes}`
          });
        }

        await client.query('COMMIT');
        broadcastStock('stock:supplier_return_logged', { returnNumber, source_location_id });

        return res.json({
          success: true,
          message: `تم تسجيل إذن مرتجع للمورد #${returnNumber} وخصم الكميات من المخزن المركزي بنجاح.`,
          returnNumber
        });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 15. البحث السريع في دليل الأدوية مع الرصيد الحالي والتشغيلات (PharmaFly & OutStock) ──
  app.get('/api/stock/medications/search', authMiddleware, async (req, res) => {
    try {
      const { q = '', locationId = '', branchId = '' } = req.query;
      const cleanQ = String(q).trim();

      if (!cleanQ || cleanQ.length < 2) {
        return res.json({ success: true, medications: [] });
      }

      // 1. فحص باركود التشغيلة الذكي PharmaFly مباشرة أو الباركود الدولي
      let isBarcodeMatch = false;
      let barcodeRow = null;
      if (cleanQ.startsWith('P') || cleanQ.length >= 8) {
        const batchBarcodeRes = await db.query(
          `SELECT b.*, m.id as medication_id, m.trade_name_ar, m.trade_name_en, m.public_price, m.generic_name, m.pack_size,
                  s.supplier_code as supplier_code_snapshot
           FROM public.inventory_batches b
           JOIN public.outstock_medications m ON m.id = b.medication_id
           LEFT JOIN public.outstock_suppliers s ON s.id = b.supplier_id
           WHERE b.label_barcode = $1 OR m.gtin_barcode = $1 OR m.barcode = $1
           LIMIT 1`,
          [cleanQ]
        );
        if (batchBarcodeRes.rows.length > 0) {
          isBarcodeMatch = true;
          barcodeRow = batchBarcodeRes.rows[0];
        }
      }

      const normalized = typeof normalizeDrugSearchText === 'function' ? normalizeDrugSearchText(cleanQ) : cleanQ.toLowerCase();
      const pattern = `%${normalized}%`;
      const rawPattern = `%${cleanQ.toLowerCase()}%`;

      let queryStr = `
        SELECT 
          m.id,
          m.trade_name_ar,
          m.trade_name_en,
          COALESCE(m.gtin_barcode, m.barcode) as barcode,
          m.generic_name,
          m.category,
          m.unit_type,
          m.pack_size,
          m.unit_price as cost_price,
          m.public_price,
          COALESCE(SUM(bal.quantity_on_hand), 0) as available_qty
        FROM public.outstock_medications m
        LEFT JOIN public.inventory_balances bal ON bal.medication_id = m.id ${locationId ? 'AND bal.location_id = $4' : ''}
        WHERE 
          (m.search_normalized LIKE $1 
           OR LOWER(m.trade_name_ar) LIKE $2 
           OR LOWER(m.trade_name_en) LIKE $2 
           OR LOWER(COALESCE(m.generic_name, '')) LIKE $2
           OR m.gtin_barcode = $3
           OR m.barcode = $3)
      `;
      const params = [pattern, rawPattern, cleanQ];
      if (locationId) {
        params.push(locationId);
      }

      queryStr += ` GROUP BY m.id ORDER BY m.trade_name_ar ASC LIMIT 35;`;

      const results = await db.query(queryStr, params);

      // جلب تشغيلات الأدوية المسترجعة وترتيبها حسب FEFO (الأقرب انتهاءً أولاً)
      const medIds = results.rows.map(r => r.id);
      let batchesMap = {};
      if (medIds.length > 0) {
        const batchesRes = await db.query(
          `SELECT 
             b.id, b.medication_id, b.batch_number, b.expiry_date, b.cost_price, b.public_price,
             b.label_barcode, s.supplier_code as supplier_code_snapshot, s.name as supplier_name,
             COALESCE(bal.quantity_on_hand, 0) as batch_qty
           FROM public.inventory_batches b
           LEFT JOIN public.outstock_suppliers s ON s.id = b.supplier_id
           LEFT JOIN public.inventory_balances bal ON bal.batch_id = b.id ${locationId ? 'AND bal.location_id = $2' : ''}
           WHERE b.medication_id = ANY($1) AND b.is_quarantined = false
           ORDER BY b.expiry_date ASC`,
          locationId ? [medIds, locationId] : [medIds]
        );
        for (const b of batchesRes.rows) {
          if (!batchesMap[b.medication_id]) batchesMap[b.medication_id] = [];
          batchesMap[b.medication_id].push(b);
        }
      }

      const medications = results.rows.map(m => ({
        ...m,
        public_price: parseFloat(m.public_price || 0),
        cost_price: parseFloat(m.cost_price || 0),
        pack_size: parseInt(m.pack_size || 1, 10),
        available_qty: parseFloat(m.available_qty || 0),
        batches: batchesMap[m.id] || []
      }));

      res.json({
        success: true,
        isBarcodeMatch,
        barcodeMatchedBatch: barcodeRow,
        medications
      });
    } catch (err) {
      console.error('[Stock Medications Search Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

    // ── 16. إدارة الموردين (Suppliers Management API) ────────────────────
  app.get('/api/stock/suppliers', authMiddleware, async (req, res) => {
    try {
      const { search = '' } = req.query;
      let queryStr = 'SELECT * FROM public.outstock_suppliers WHERE 1=1';
      const params = [];
      if (search.trim()) {
        params.push(`%${search.trim()}%`);
        queryStr += ` AND (name ILIKE $1 OR supplier_code ILIKE $1 OR phone ILIKE $1)`;
      }
      queryStr += ' ORDER BY name ASC';
      const result = await db.query(queryStr, params);
      res.json({ success: true, suppliers: result.rows });
    } catch (err) {
      console.error('[Stock Suppliers GET Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/suppliers', authMiddleware, async (req, res) => {
    try {
      const {
        supplier_code,
        name,
        phone,
        address,
        account_type = 'credit',
        credit_limit = 0,
        credit_duration_days = 30,
        notes
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'اسم المورد مطلوب' });
      }

      const suppId = `supp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const suppCode = supplier_code?.trim() || `SUP-${Math.floor(100 + Math.random() * 900)}`;

      const insertSql = `
        INSERT INTO public.outstock_suppliers (
          id, supplier_code, name, phone, address, account_type,
          credit_limit, credit_duration_days, notes, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          account_type = EXCLUDED.account_type,
          credit_limit = EXCLUDED.credit_limit,
          credit_duration_days = EXCLUDED.credit_duration_days,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;

      const result = await db.query(insertSql, [
        suppId, suppCode, name.trim(), phone || null, address || null,
        account_type, parseFloat(credit_limit || 0), parseInt(credit_duration_days || 30, 10),
        notes || null
      ]);

      broadcastStock('stock:supplier_updated', { supplier: result.rows[0] });
      res.json({ success: true, message: 'تم حفظ بيانات المورد بنجاح', supplier: result.rows[0] });
    } catch (err) {
      console.error('[Stock Suppliers POST Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/stock/suppliers/:id', authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        supplier_code,
        name,
        phone,
        address,
        account_type,
        credit_limit,
        credit_duration_days,
        notes,
        is_active
      } = req.body;

      const updateSql = `
        UPDATE public.outstock_suppliers
        SET
          supplier_code = COALESCE($1, supplier_code),
          name = COALESCE($2, name),
          phone = COALESCE($3, phone),
          address = COALESCE($4, address),
          account_type = COALESCE($5, account_type),
          credit_limit = COALESCE($6, credit_limit),
          credit_duration_days = COALESCE($7, credit_duration_days),
          notes = COALESCE($8, notes),
          is_active = COALESCE($9, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
        RETURNING *;
      `;

      const result = await db.query(updateSql, [
        supplier_code || null, name || null, phone || null, address || null,
        account_type || null, credit_limit !== undefined ? parseFloat(credit_limit) : null,
        credit_duration_days !== undefined ? parseInt(credit_duration_days, 10) : null,
        notes !== undefined ? notes : null, is_active !== undefined ? Boolean(is_active) : null,
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'المورد غير موجود' });
      }

      broadcastStock('stock:supplier_updated', { supplier: result.rows[0] });
      res.json({ success: true, message: 'تم تحديث المورد بنجاح', supplier: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 17. إعدادات طابعات الملصقات الحرارية (Label Printer Settings API) ──
  app.get('/api/stock/label-templates', authMiddleware, async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM public.inventory_label_templates ORDER BY is_default DESC, created_at DESC LIMIT 10');
      let template = result.rows[0];
      if (!template) {
        template = {
          id: 'default_template',
          name: 'الملصق الافتراضي 50x25',
          is_default: true,
          width_mm: 50,
          height_mm: 25,
          font_size_pt: 8,
          show_pharmacy_name: true,
          pharmacy_header_text: 'صيدليات الشفاء',
          show_trade_name_ar: true,
          show_trade_name_en: true,
          show_public_price: true,
          show_expiry_date: true,
          show_batch_number: true,
          show_supplier_code: true,
          barcode_symbology: 'CODE128'
        };
      }
      res.json({ success: true, template, templates: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/label-templates', authMiddleware, async (req, res) => {
    try {
      const {
        id = 'default_template',
        name = 'الملصق الافتراضي 50x25',
        width_mm = 50,
        height_mm = 25,
        font_size_pt = 8,
        show_pharmacy_name = true,
        pharmacy_header_text = 'صيدليات الشفاء',
        show_trade_name_ar = true,
        show_trade_name_en = true,
        show_public_price = true,
        show_expiry_date = true,
        show_batch_number = true,
        show_supplier_code = true,
        barcode_symbology = 'CODE128'
      } = req.body;

      const upsertSql = `
        INSERT INTO public.inventory_label_templates (
          id, name, is_default, width_mm, height_mm, font_size_pt,
          show_pharmacy_name, pharmacy_header_text, show_trade_name_ar,
          show_trade_name_en, show_public_price, show_expiry_date,
          show_batch_number, show_supplier_code, barcode_symbology, updated_at
        ) VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          width_mm = EXCLUDED.width_mm,
          height_mm = EXCLUDED.height_mm,
          font_size_pt = EXCLUDED.font_size_pt,
          show_pharmacy_name = EXCLUDED.show_pharmacy_name,
          pharmacy_header_text = EXCLUDED.pharmacy_header_text,
          show_trade_name_ar = EXCLUDED.show_trade_name_ar,
          show_trade_name_en = EXCLUDED.show_trade_name_en,
          show_public_price = EXCLUDED.show_public_price,
          show_expiry_date = EXCLUDED.show_expiry_date,
          show_batch_number = EXCLUDED.show_batch_number,
          show_supplier_code = EXCLUDED.show_supplier_code,
          barcode_symbology = EXCLUDED.barcode_symbology,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;

      const result = await db.query(upsertSql, [
        id, name, parseInt(width_mm, 10), parseInt(height_mm, 10),
        parseInt(font_size_pt, 10), Boolean(show_pharmacy_name),
        pharmacy_header_text, Boolean(show_trade_name_ar),
        Boolean(show_trade_name_en), Boolean(show_public_price),
        Boolean(show_expiry_date), Boolean(show_batch_number),
        Boolean(show_supplier_code), barcode_symbology
      ]);

      res.json({ success: true, message: 'تم حفظ قالب إعدادات الملصق بنجاح', template: result.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── 18. استلام التحويل بالفرع عن طريق كود التحويل السري (Verify & Receive by Code) ──
  app.get('/api/stock/transfers/by-code/:code', authMiddleware, async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      if (!code) {
        return res.status(400).json({ success: false, error: 'كود التحويل مطلوب' });
      }

      const trfRes = await db.query(`
        SELECT 
          t.*,
          src.name_ar as source_name,
          dest.name_ar as destination_name
        FROM public.inventory_transfers t
        LEFT JOIN public.inventory_locations src ON src.id = t.source_location_id
        LEFT JOIN public.inventory_locations dest ON dest.id = t.destination_location_id
        WHERE UPPER(t.verification_code) = UPPER($1) OR UPPER(t.transfer_number) = UPPER($1) OR t.id = $1
      `, [code]);

      if (trfRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'لم يتم العثور على أمر تحويل مطابق لهذا الكود' });
      }

      const transfer = trfRes.rows[0];

      // جلب بنود التحويل مع أسماء الأدوية والتشغيلات
      const itemsRes = await db.query(`
        SELECT 
          ti.*,
          m.trade_name_ar,
          m.trade_name_en,
          m.public_price,
          m.gtin_barcode,
          b.batch_number,
          b.expiry_date,
          b.label_barcode,
          s.supplier_code as supplier_code_snapshot
        FROM public.inventory_transfer_items ti
        JOIN public.outstock_medications m ON m.id = ti.medication_id
        LEFT JOIN public.inventory_batches b ON b.id = ti.batch_id
        LEFT JOIN public.outstock_suppliers s ON s.id = b.supplier_id
        WHERE ti.transfer_id = $1
      `, [transfer.id]);

      res.json({
        success: true,
        transfer,
        items: itemsRes.rows
      });
    } catch (err) {
      console.error('[Get Transfer by Code Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock/transfers/receive-by-code', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { verification_code, received_items = [] } = req.body;
      const cleanCode = String(verification_code || '').trim();

      const trfRes = await client.query(`
        SELECT * FROM public.inventory_transfers 
        WHERE (UPPER(verification_code) = UPPER($1) OR UPPER(transfer_number) = UPPER($1) OR id = $1)
        FOR UPDATE
      `, [cleanCode]);

      if (trfRes.rows.length === 0) throw new Error('أمر التحويل غير موجود أو كود التحقق غير صحيح');
      const transfer = trfRes.rows[0];

      if (['received_fully', 'closed'].includes(transfer.status)) {
        throw new Error('تم استلام هذا التحويل بالكامل مسبقاً.');
      }

      const itemsRes = await client.query(`
        SELECT 
          ti.*,
          m.trade_name_ar,
          m.trade_name_en,
          m.public_price,
          b.batch_number,
          b.expiry_date,
          b.label_barcode,
          s.supplier_code as supplier_code_snapshot
        FROM public.inventory_transfer_items ti
        JOIN public.outstock_medications m ON m.id = ti.medication_id
        LEFT JOIN public.inventory_batches b ON b.id = ti.batch_id
        LEFT JOIN public.outstock_suppliers s ON s.id = b.supplier_id
        WHERE ti.transfer_id = $1
      `, [transfer.id]);

      const printableLabels = [];

      for (const origItem of itemsRes.rows) {
        const itemInput = received_items.find(it => it.item_id === origItem.id) || {};
        const qtyReceived = itemInput.quantity_received !== undefined ? parseFloat(itemInput.quantity_received) : parseFloat(origItem.quantity_dispatched || origItem.quantity_requested || 0);
        const qtyDamaged = parseFloat(itemInput.quantity_damaged || 0);
        const qtyDispatched = parseFloat(origItem.quantity_dispatched || origItem.quantity_requested || 0);

        // خصم من عهدة الطريق
        const clearTransitKey = `trf_clear_transit_${transfer.id}_${origItem.id}`;
        await recordLedgerMovement(client, {
          idempotencyKey: clearTransitKey,
          movementType: 'branch_transfer_out',
          locationId: 'loc_in_transit',
          medicationId: origItem.medication_id,
          batchId: origItem.batch_id,
          quantityBase: -qtyDispatched,
          unitCost: origItem.unit_cost,
          documentType: 'transfer_order',
          documentNumber: transfer.transfer_number,
          documentId: transfer.id,
          performedById: req.stockUser.id,
          performedByName: req.stockUser.name,
          performedByRole: req.stockUser.role,
          notes: 'إفراغ الشحنة المستلمة بالكود'
        });

        // إضافة للفرع المستلم
        if (qtyReceived > 0) {
          const recKey = `trf_rec_code_${transfer.id}_${origItem.id}`;
          await recordLedgerMovement(client, {
            idempotencyKey: recKey,
            movementType: 'branch_transfer_in',
            locationId: transfer.destination_location_id,
            medicationId: origItem.medication_id,
            batchId: origItem.batch_id,
            quantityBase: qtyReceived,
            unitCost: origItem.unit_cost,
            documentType: 'transfer_order',
            documentNumber: transfer.transfer_number,
            documentId: transfer.id,
            sourceBranchId: transfer.source_location_id,
            performedById: req.stockUser.id,
            performedByName: req.stockUser.name,
            performedByRole: req.stockUser.role,
            notes: `استلام بضاعة بكود التحقق ${cleanCode}`
          });

          // تجميع الملصقات للطباعة التلقائية
          printableLabels.push({
            medication_id: origItem.medication_id,
            trade_name_ar: origItem.trade_name_ar,
            trade_name_en: origItem.trade_name_en,
            public_price: origItem.public_price,
            batch_number: origItem.batch_number || 'B-STOCK',
            expiry_date: origItem.expiry_date ? String(origItem.expiry_date).slice(0, 7) : '',
            supplier_code: origItem.supplier_code_snapshot || 'MAIN',
            label_barcode: origItem.label_barcode || `P${origItem.medication_id}-${origItem.batch_number || 'B1'}`,
            quantity: Math.round(qtyReceived)
          });
        }

        // تحديث بند التحويل
        await client.query(`
          UPDATE public.inventory_transfer_items
          SET quantity_received = $1, quantity_damaged = $2, item_status = 'received'
          WHERE id = $3
        `, [qtyReceived, qtyDamaged, origItem.id]);
      }

      await client.query(`
        UPDATE public.inventory_transfers
        SET status = 'received_fully',
            received_by_id = $1,
            received_by_name = $2,
            received_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [req.stockUser.id, req.stockUser.name, transfer.id]);

      await client.query('COMMIT');
      broadcastStock('stock:transfer_received', { transferId: transfer.id, transferNumber: transfer.transfer_number });

      res.json({
        success: true,
        message: 'تم استلام الشحنة وإضافتها لأرصدة الفرع بنجاح! 📦✨',
        transferId: transfer.id,
        transferNumber: transfer.transfer_number,
        printableLabels
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Receive Transfer by Code Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // ── 19. إضافة رصيد افتتاحي / تشغيلة مباشرة للفرع ──────────────────────────
  app.post('/api/stock/branch-balance/batch-entry', authMiddleware, async (req, res) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const {
        location_id,
        medication_id,
        batch_number,
        expiry_date,
        quantity,
        cost_price = 0,
        public_price = 0,
        supplier_id = null
      } = req.body;

      if (!location_id || !medication_id || !batch_number || !expiry_date || !quantity) {
        throw new Error('الموقع والصنف والتشغيلة وتاريخ الصلاحية والكمية حقول إلزامية');
      }

      // البحث أو إنشاء التشغيلة
      const batchId = `batch_${medication_id}_${batch_number.trim().replace(/\s+/g, '_')}_${expiry_date.slice(0, 7)}`;
      const expDateClean = expiry_date.length === 7 ? `${expiry_date}-01` : expiry_date;

      // توليد باركود الملصق الذكي PharmaFly
      const expYYMM = expDateClean.slice(2, 4) + expDateClean.slice(5, 7);
      const suppCode = supplier_id ? String(supplier_id).slice(-4) : 'S01';
      const labelBarcode = `P${medication_id.slice(-6)}-${batch_number.trim()}-${expYYMM}-${suppCode}`;

      await client.query(`
        INSERT INTO public.inventory_batches (
          id, medication_id, batch_number, expiry_date, cost_price, public_price,
          supplier_id, label_barcode, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          public_price = EXCLUDED.public_price,
          cost_price = EXCLUDED.cost_price,
          label_barcode = COALESCE(public.inventory_batches.label_barcode, EXCLUDED.label_barcode),
          updated_at = CURRENT_TIMESTAMP;
      `, [
        batchId, medication_id, batch_number.trim(), expDateClean,
        parseFloat(cost_price || 0), parseFloat(public_price || 0),
        supplier_id || null, labelBarcode
      ]);

      // قيد حركة الرصيد
      const ledgerKey = `direct_entry_${location_id}_${batchId}_${Date.now()}`;
      await recordLedgerMovement(client, {
        idempotencyKey: ledgerKey,
        movementType: 'opening_balance',
        locationId: location_id,
        medicationId: medication_id,
        batchId: batchId,
        quantityBase: parseFloat(quantity),
        unitCost: parseFloat(cost_price || 0),
        documentType: 'manual_batch_entry',
        documentNumber: `OPN-${Date.now().toString().slice(-6)}`,
        performedById: req.stockUser.id,
        performedByName: req.stockUser.name,
        performedByRole: req.stockUser.role,
        notes: `إدخال رصيد تشغيلة مباشرة: ${batch_number} (صلاحية: ${expDateClean})`
      });

      await client.query('COMMIT');
      broadcastStock('stock:balance_updated', { location_id, medication_id, batchId });

      res.json({
        success: true,
        message: 'تم إضافة رصيد التشغيلة للفرع بنجاح وتوليد ملصق الباركود الذكي',
        batchId,
        labelBarcode
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Branch Batch Entry Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

}