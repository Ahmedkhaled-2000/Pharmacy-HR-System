/**
 * syncEngine.js
 * محرك المزامنة التزايدية الذكية والـ Transactional Outbox
 * يضمن تحديث فوري محلياً (0ms UI)، عدم فقدان أي طلب، منع التكرار، والعمل بكفاءة دون اتصال
 */

import {
  putRequest,
  putRequestsBatch,
  getRequestById,
  getAllLocalRequests,
  deleteRequestLocal,
  enqueueOutboxOperation,
  getPendingOutboxBatch,
  updateOutboxStatus,
  removeOutboxOperation,
  moveToDeadLetter,
  getSyncCursor,
  setSyncCursor,
  hasProcessedInbox,
  markProcessedInbox
} from './localDatabase';

import {
  REQUEST_STATES,
  generateIdempotencyKey,
  normalizeLifecycleState
} from './requestLifecycle';

import { apiPushSyncBatch, apiFetchDeltaSync } from './apiClient';
import { subscribeToSyncHints, emitSyncHint } from './socketClient';

// ── قناة البث للمزامنة الفورية بين التبويبات المتعددة في نفس المتصفح ─────────────
const deltaSyncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('pharmacy-delta-sync-channel')
  : null;

// ── حالات الإقفال (Mutex Locks) لمنع تداخل العمليات ───────────────────────────
let isOutboxSyncing = false;
let isDeltaPulling = false;
let consecutiveSyncErrors = 0;
let circuitCoolingUntil = 0;

// ── نظام الاشتراكات والتنبيهات للواجهة (Event Listeners) ──────────────────────
const syncEventListeners = new Set();

export function subscribeToSyncEngine(listener) {
  if (typeof listener !== 'function') return () => {};
  syncEventListeners.add(listener);
  return () => syncEventListeners.delete(listener);
}

function notifySubscribers(event) {
  try {
    syncEventListeners.forEach((listener) => {
      try { listener(event); } catch (e) { console.warn('[SyncEngine] Listener error:', e); }
    });
  } catch {}
}

// ── حساب وقت المحاولة القادمة مع التراجع الأسي والتشويش العشوائي ──────────────────
function calculateNextRetry(retryCount) {
  const baseMs = 2000;
  const maxMs = 60000;
  const exp = Math.min(maxMs, baseMs * Math.pow(2, retryCount));
  const jitter = Math.floor(Math.random() * 1000);
  return Date.now() + exp + jitter;
}

// ── إضافة طلب جديد محلياً وضمه لصندوق الإرسال فوراً (0ms Optimistic UI) ──────────
export async function enqueueNewRequest(requestData, branchId = null) {
  if (!requestData) throw new Error('Request data is required');

  const now = new Date().toISOString();
  const idempotencyKey = requestData.idempotency_key || generateIdempotencyKey();
  const requestId = requestData.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const localRequest = {
    ...requestData,
    id: String(requestId),
    idempotency_key: idempotencyKey,
    branch_id: branchId || requestData.branchId || requestData.branch_id || null,
    status: requestData.status || REQUEST_STATES.PENDING_LOCAL,
    created_at: requestData.created_at || requestData.createdAt || now,
    updated_at: now,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    acknowledged_at: null,
    lifecycle_history: [
      {
        from_status: null,
        to_status: REQUEST_STATES.PENDING_LOCAL,
        changed_at: now,
        reason: 'تم إنشاء الطلب محلياً في انتظار المزامنة'
      }
    ]
  };

  // 1. حفظ الطلب في المتجر المحلي للطلبات
  await putRequest(localRequest);

  // 2. إدراجه في صندوق الإرسال غير المتزامن
  await enqueueOutboxOperation({
    idempotency_key: idempotencyKey,
    action: 'create_request',
    entity_type: 'request',
    entity_id: localRequest.id,
    branch_id: localRequest.branch_id,
    payload: localRequest
  });

  // 3. إشعار الواجهة والتبويبات
  notifySubscribers({
    type: 'REQUEST_CREATED_OPTIMISTIC',
    request: localRequest
  });

  if (deltaSyncChannel) {
    try {
      deltaSyncChannel.postMessage({ type: 'LOCAL_REQUEST_CREATED', request: localRequest });
    } catch {}
  }

  // 4. إطلاق المزامنة في الخلفية فوراً دون انتظار
  scheduleBackgroundSync();

  return localRequest;
}

// ── اتخاذ قرار بشأن طلب (اعتماد / رفض / تعديل حالة) محلياً وضمه للـ Outbox ───────
export async function enqueueRequestDecision({
  requestId,
  decision, // 'approve' | 'reject' | 'status_change'
  newStatus,
  reason = '',
  reviewer = {},
  branchId = null,
  additionalData = {}
}) {
  if (!requestId) throw new Error('Request ID is required');

  const now = new Date().toISOString();
  const idempotencyKey = generateIdempotencyKey();

  // جلب الطلب الحالي وتحديثه محلياً
  const existing = await getRequestById(requestId);
  const targetStatus = newStatus || (decision === 'approve' ? REQUEST_STATES.COMPLETED : REQUEST_STATES.REJECTED);

  const updatedRequest = {
    ...(existing || {}),
    ...additionalData,
    id: String(requestId),
    status: targetStatus,
    updated_at: now,
    decision_reason: reason || existing?.decision_reason || '',
    decided_by: reviewer.name || reviewer.id || 'Admin',
    decided_at: now
  };

  await putRequest(updatedRequest);

  await enqueueOutboxOperation({
    idempotency_key: idempotencyKey,
    action: decision === 'approve' ? 'approve_request' : decision === 'reject' ? 'reject_request' : 'update_status',
    entity_type: 'request',
    entity_id: String(requestId),
    branch_id: branchId || updatedRequest.branch_id || null,
    payload: {
      request_id: String(requestId),
      new_status: targetStatus,
      decision,
      reason,
      reviewer,
      additional_data: additionalData,
      updated_at: now
    }
  });

  notifySubscribers({
    type: 'REQUEST_UPDATED_OPTIMISTIC',
    request: updatedRequest
  });

  if (deltaSyncChannel) {
    try {
      deltaSyncChannel.postMessage({ type: 'LOCAL_REQUEST_UPDATED', request: updatedRequest });
    } catch {}
  }

  scheduleBackgroundSync();

  return updatedRequest;
}

// ── معالجة وإرسال دفعات الـ Outbox للخادم ──────────────────────────────────────
export async function processOutbox() {
  if (isOutboxSyncing) return { inProgress: true };
  if (Date.now() < circuitCoolingUntil) {
    return { coolingDown: true, coolUntil: circuitCoolingUntil };
  }

  isOutboxSyncing = true;
  let processedCount = 0;

  try {
    const pendingBatch = await getPendingOutboxBatch(50);
    if (!pendingBatch || pendingBatch.length === 0) {
      isOutboxSyncing = false;
      return { count: 0 };
    }

    // تحديث حالة العمليات في الدفعة إلى 'syncing'
    await Promise.all(
      pendingBatch.map((op) => updateOutboxStatus(op.idempotency_key, { status: 'syncing' }))
    );

    // إرسال الدفعة عبر الـ API
    const response = await apiPushSyncBatch(pendingBatch);

    if (response && response.success && Array.isArray(response.results)) {
      consecutiveSyncErrors = 0; // تصفير عداد الأخطاء

      for (const res of response.results) {
        const matchingOp = pendingBatch.find((op) => op.idempotency_key === res.idempotency_key);
        if (!matchingOp) continue;

        if (res.processed || res.status === 'processed' || res.status === 'already_processed') {
          // نجاح العملية -> حذفها من صندوق الإرسال وتحديث حالة الطلب محلياً إلى 'sent'
          await removeOutboxOperation(res.idempotency_key);

          const localReq = await getRequestById(matchingOp.entity_id);
          if (localReq && (localReq.status === REQUEST_STATES.PENDING_LOCAL || localReq.status === REQUEST_STATES.QUEUED || localReq.status === REQUEST_STATES.SYNCING)) {
            const updated = {
              ...localReq,
              status: REQUEST_STATES.SENT,
              sent_at: new Date().toISOString(),
              change_sequence: res.server_sequence || localReq.change_sequence
            };
            await putRequest(updated);
            notifySubscribers({ type: 'REQUEST_SENT_CONFIRMED', request: updated });
          }

          processedCount++;
        } else if (res.terminal || res.code === 'TERMINAL_ERROR') {
          // خطأ بات غير قابل للإعادة (مثل خطأ في التحقق من البيانات) -> نقل لـ Dead Letter
          await moveToDeadLetter(matchingOp, {
            code: res.code || 'TERMINAL_ERROR',
            message: res.error || 'Server rejected operation'
          });
          notifySubscribers({ type: 'OPERATION_DEAD_LETTER', operation: matchingOp, error: res.error });
        } else {
          // خطأ مؤقت -> إعادة جدولة
          const nextRetry = calculateNextRetry(matchingOp.retry_count + 1);
          await updateOutboxStatus(res.idempotency_key, {
            status: 'failed',
            retry_count: matchingOp.retry_count + 1,
            next_retry_at: nextRetry,
            last_error: res.error || 'Server reported retryable failure'
          });
        }
      }
    } else {
      throw new Error(response?.error || 'Push sync failed');
    }
  } catch (err) {
    consecutiveSyncErrors++;
    if (consecutiveSyncErrors >= 5) {
      circuitCoolingUntil = Date.now() + 30000; // تبريد لمدة 30 ثانية
      console.warn('[SyncEngine] Circuit breaker active for 30s due to 5 consecutive errors');
    }

    // إعادة جدولة جميع العمليات المتعثرة في الدفعة
    const pending = await getPendingOutboxBatch(50);
    await Promise.all(
      pending.map((op) => {
        const nextRetry = calculateNextRetry(op.retry_count + 1);
        return updateOutboxStatus(op.idempotency_key, {
          status: 'failed',
          retry_count: op.retry_count + 1,
          next_retry_at: nextRetry,
          last_error: err.message
        });
      })
    );
  } finally {
    isOutboxSyncing = false;
  }

  return { count: processedCount };
}

// ── سحب التحديثات التزايدية الخفيفة (Delta Pull) ────────────────────────────────
export async function pullDeltaSync(branchId = null) {
  if (isDeltaPulling) return { inProgress: true };

  isDeltaPulling = true;
  const cursorKey = branchId ? `cursor_branch_${branchId}` : 'cursor_global';

  try {
    const sinceSeq = await getSyncCursor(cursorKey);
    const res = await apiFetchDeltaSync(sinceSeq, branchId);

    if (res && res.success && Array.isArray(res.changes)) {
      let appliedCount = 0;

      for (const change of res.changes) {
        if (change.operation === 'DELETE') {
          await deleteRequestLocal(change.entity_id);
          appliedCount++;
        } else if (change.operation === 'INSERT' || change.operation === 'UPDATE') {
          let payload = change.payload;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { payload = null; }
          }

          if (payload && payload.id) {
            // التحقق من منع معالجة التكرار
            const alreadyDone = await hasProcessedInbox(change.idempotency_key);
            if (!alreadyDone) {
              await putRequest(payload);
              await markProcessedInbox(change.idempotency_key, change.sequence);
              appliedCount++;
            }
          }
        }
      }

      if (res.latest_sequence !== undefined && res.latest_sequence !== null) {
        await setSyncCursor(cursorKey, res.latest_sequence);
      }

      if (appliedCount > 0) {
        notifySubscribers({
          type: 'DELTA_CHANGES_APPLIED',
          appliedCount,
          latestSequence: res.latest_sequence
        });
      }

      return { success: true, count: appliedCount, latestSequence: res.latest_sequence };
    }
  } catch (err) {
    console.warn('[SyncEngine] Delta pull warning:', err.message);
  } finally {
    isDeltaPulling = false;
  }

  return { success: false };
}

// ── المزامنة الكاملة ثنائية الاتجاه (Push Outbox + Pull Delta) ─────────────────
export async function executeFullSync(branchId = null) {
  const pushRes = await processOutbox();
  const pullRes = await pullDeltaSync(branchId);
  return { push: pushRes, pull: pullRes };
}

// ── جدولة ذكية في الخلفية ──────────────────────────────────────────────────
let backgroundTimer = null;
function scheduleBackgroundSync(delayMs = 50) {
  if (backgroundTimer) clearTimeout(backgroundTimer);
  backgroundTimer = setTimeout(() => {
    executeFullSync();
  }, delayMs);
}

// ── تفعيل الاستماع للأحداث والشبكة ──────────────────────────────────────────
let isInitialized = false;
export function initSyncEngine(getBranchIdFn = null) {
  if (isInitialized) return;
  isInitialized = true;

  // 1. الاستماع لعودة الإنترنت
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('🌐 [SyncEngine] تم استعادة الاتصال بالإنترنت - بدء مزامنة الطابور');
      const bId = getBranchIdFn ? getBranchIdFn() : null;
      executeFullSync(bId);
    });

    window.addEventListener('focus', () => {
      const bId = getBranchIdFn ? getBranchIdFn() : null;
      pullDeltaSync(bId);
    });
  }

  // 2. الاستماع لإشارات WebSockets اللحظية فائقة الخفة (< 50 bytes)
  subscribeToSyncHints((hint) => {
    const currentBranchId = getBranchIdFn ? getBranchIdFn() : null;
    if (!hint || !hint.branch_id || !currentBranchId || String(hint.branch_id) === String(currentBranchId)) {
      pullDeltaSync(currentBranchId);
    }
  });

  // 3. الاستماع لرسائل التبويبات الأخرى
  if (deltaSyncChannel) {
    deltaSyncChannel.addEventListener('message', (event) => {
      if (event.data && (event.data.type === 'LOCAL_REQUEST_CREATED' || event.data.type === 'LOCAL_REQUEST_UPDATED')) {
        notifySubscribers({ type: 'CROSS_TAB_REQUEST_SYNC', request: event.data.request });
      }
    });
  }

  // 4. فحص دوري خفيف (كل 60 ثانية بدلاً من Polling مكثف كل 10 ثوانٍ)
  setInterval(() => {
    const bId = getBranchIdFn ? getBranchIdFn() : null;
    pullDeltaSync(bId);
    processOutbox();
  }, 60000);

  // تشغيل المزامنة الأولية بعد بدء التشغيل
  setTimeout(() => {
    const bId = getBranchIdFn ? getBranchIdFn() : null;
    executeFullSync(bId);
  }, 1000);
}
