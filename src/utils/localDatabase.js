/**
 * localDatabase.js
 * طبقة التخزين المحلي المتقدمة (IndexedDB Engine) لإدارة الطلبات والمزامنة التزايدية
 * تدعم الـ Transactional Outbox والـ Delta Sync Cursor والعمل دون اتصال بنسبة 100%
 */

const DB_NAME = 'pharmacy_requests_db';
const DB_VERSION = 1;

export const STORES = {
  REQUESTS: 'requests',
  OUTBOX: 'outbox',
  INBOX: 'inbox',
  SYNC_STATE: 'sync_state',
  DEAD_LETTER: 'dead_letter',
  REFERENCE_CACHE: 'reference_cache'
};

// ذاكرة احتياطية سريعة في حال تعذر فتح IndexedDB (Private Browsing / Blocked Storage)
const memoryFallback = {
  [STORES.REQUESTS]: new Map(),
  [STORES.OUTBOX]: new Map(),
  [STORES.INBOX]: new Map(),
  [STORES.SYNC_STATE]: new Map(),
  [STORES.DEAD_LETTER]: new Map(),
  [STORES.REFERENCE_CACHE]: new Map()
};

let dbInstance = null;

function isIndexedDBAvailable() {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

export function openLocalDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB not supported or accessible'));
  }

  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. متجر الطلبات المحلي (requests)
        if (!db.objectStoreNames.contains(STORES.REQUESTS)) {
          const reqStore = db.createObjectStore(STORES.REQUESTS, { keyPath: 'id' });
          reqStore.createIndex('idempotency_key', 'idempotency_key', { unique: false });
          reqStore.createIndex('status', 'status', { unique: false });
          reqStore.createIndex('branch_id', 'branch_id', { unique: false });
          reqStore.createIndex('employee_id', 'employee_id', { unique: false });
          reqStore.createIndex('type', 'type', { unique: false });
          reqStore.createIndex('created_at', 'created_at', { unique: false });
          reqStore.createIndex('change_sequence', 'change_sequence', { unique: false });
        }

        // 2. صندوق الإرسال غير المتزامن (outbox)
        if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
          const outboxStore = db.createObjectStore(STORES.OUTBOX, { keyPath: 'idempotency_key' });
          outboxStore.createIndex('status', 'status', { unique: false });
          outboxStore.createIndex('created_at', 'created_at', { unique: false });
          outboxStore.createIndex('next_retry_at', 'next_retry_at', { unique: false });
          outboxStore.createIndex('retry_count', 'retry_count', { unique: false });
        }

        // 3. صندوق الوارد لتسجيل العمليات المعالجة ومنع التكرار (inbox)
        if (!db.objectStoreNames.contains(STORES.INBOX)) {
          const inboxStore = db.createObjectStore(STORES.INBOX, { keyPath: 'idempotency_key' });
          inboxStore.createIndex('server_seq', 'server_seq', { unique: false });
          inboxStore.createIndex('processed_at', 'processed_at', { unique: false });
        }

        // 4. حالة المزامنة ومؤشرات التسلسل (sync_state)
        if (!db.objectStoreNames.contains(STORES.SYNC_STATE)) {
          db.createObjectStore(STORES.SYNC_STATE, { keyPath: 'key' });
        }

        // 5. صندوق العمليات الميتة بعد استنفاد المحاولات (dead_letter)
        if (!db.objectStoreNames.contains(STORES.DEAD_LETTER)) {
          const deadStore = db.createObjectStore(STORES.DEAD_LETTER, { keyPath: 'idempotency_key' });
          deadStore.createIndex('failed_at', 'failed_at', { unique: false });
          deadStore.createIndex('error_code', 'error_code', { unique: false });
        }

        // 6. كاش البيانات المرجعية للعمل دون اتصال (reference_cache)
        if (!db.objectStoreNames.contains(STORES.REFERENCE_CACHE)) {
          db.createObjectStore(STORES.REFERENCE_CACHE, { keyPath: 'key' });
        }
      };

      req.onsuccess = () => {
        dbInstance = req.result;
        dbInstance.onclose = () => {
          dbInstance = null;
        };
        resolve(dbInstance);
      };

      req.onerror = () => {
        reject(req.error || new Error('Failed to open pharmacy_requests_db'));
      };

      req.onblocked = () => {
        console.warn('[LocalDB] Database open blocked by another tab');
      };
    } catch (err) {
      reject(err);
    }
  });
}

// ── دوال عمليات متجر الطلبات (Requests Store) ──────────────────────────────────

export async function putRequest(reqObj) {
  if (!reqObj || !reqObj.id) return null;
  const normalized = {
    ...reqObj,
    id: String(reqObj.id),
    updated_at: reqObj.updated_at || new Date().toISOString()
  };

  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readwrite');
      const store = tx.objectStore(STORES.REQUESTS);
      store.put(normalized);
      tx.oncomplete = () => resolve(normalized);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    memoryFallback[STORES.REQUESTS].set(normalized.id, normalized);
    return normalized;
  }
}

export async function putRequestsBatch(requestsArray) {
  if (!Array.isArray(requestsArray) || requestsArray.length === 0) return [];
  const normalizedList = requestsArray.map((r) => ({
    ...r,
    id: String(r.id),
    updated_at: r.updated_at || new Date().toISOString()
  }));

  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readwrite');
      const store = tx.objectStore(STORES.REQUESTS);
      normalizedList.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve(normalizedList);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    normalizedList.forEach((item) => memoryFallback[STORES.REQUESTS].set(item.id, item));
    return normalizedList;
  }
}

export async function getRequestById(id) {
  if (!id) return null;
  const key = String(id);
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readonly');
      const store = tx.objectStore(STORES.REQUESTS);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return memoryFallback[STORES.REQUESTS].get(key) || null;
  }
}

export async function getAllLocalRequests() {
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readonly');
      const store = tx.objectStore(STORES.REQUESTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return Array.from(memoryFallback[STORES.REQUESTS].values());
  }
}

export async function deleteRequestLocal(id) {
  if (!id) return false;
  const key = String(id);
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REQUESTS, 'readwrite');
      const store = tx.objectStore(STORES.REQUESTS);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryFallback[STORES.REQUESTS].delete(key);
    return true;
  }
}

// ── دوال صندوق الإرسال المعاملاتي (Transactional Outbox) ────────────────────────

export async function enqueueOutboxOperation(operation) {
  if (!operation || !operation.idempotency_key) {
    throw new Error('Outbox operation requires an idempotency_key');
  }

  const record = {
    idempotency_key: String(operation.idempotency_key),
    action: operation.action || 'create_request',
    entity_type: operation.entity_type || 'request',
    entity_id: operation.entity_id ? String(operation.entity_id) : null,
    branch_id: operation.branch_id ? String(operation.branch_id) : null,
    payload: operation.payload || {},
    status: 'pending', // 'pending' | 'syncing' | 'failed' | 'dead_letter'
    retry_count: operation.retry_count || 0,
    created_at: operation.created_at || new Date().toISOString(),
    next_retry_at: operation.next_retry_at || Date.now(),
    last_error: null
  };

  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OUTBOX, 'readwrite');
      const store = tx.objectStore(STORES.OUTBOX);
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    memoryFallback[STORES.OUTBOX].set(record.idempotency_key, record);
    return record;
  }
}

export async function getPendingOutboxBatch(limit = 50) {
  const now = Date.now();
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OUTBOX, 'readonly');
      const store = tx.objectStore(STORES.OUTBOX);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const eligible = all
          .filter((item) => (item.status === 'pending' || item.status === 'failed') && item.next_retry_at <= now)
          .sort((a, b) => (a.next_retry_at || 0) - (b.next_retry_at || 0))
          .slice(0, limit);
        resolve(eligible);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    const all = Array.from(memoryFallback[STORES.OUTBOX].values());
    return all
      .filter((item) => (item.status === 'pending' || item.status === 'failed') && item.next_retry_at <= now)
      .slice(0, limit);
  }
}

export async function updateOutboxStatus(idempotencyKey, updates) {
  if (!idempotencyKey) return false;
  const key = String(idempotencyKey);
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OUTBOX, 'readwrite');
      const store = tx.objectStore(STORES.OUTBOX);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        if (!getReq.result) return resolve(false);
        const updated = { ...getReq.result, ...updates };
        store.put(updated);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = memoryFallback[STORES.OUTBOX].get(key);
    if (existing) {
      memoryFallback[STORES.OUTBOX].set(key, { ...existing, ...updates });
      return true;
    }
    return false;
  }
}

export async function removeOutboxOperation(idempotencyKey) {
  if (!idempotencyKey) return false;
  const key = String(idempotencyKey);
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.OUTBOX, 'readwrite');
      const store = tx.objectStore(STORES.OUTBOX);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryFallback[STORES.OUTBOX].delete(key);
    return true;
  }
}

export async function moveToDeadLetter(operation, errorInfo) {
  if (!operation || !operation.idempotency_key) return false;
  const deadRecord = {
    ...operation,
    failed_at: new Date().toISOString(),
    error_code: errorInfo?.code || 'TERMINAL_ERROR',
    error_message: errorInfo?.message || String(errorInfo),
    terminal: true
  };

  try {
    const db = await openLocalDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.OUTBOX, STORES.DEAD_LETTER], 'readwrite');
      tx.objectStore(STORES.OUTBOX).delete(operation.idempotency_key);
      tx.objectStore(STORES.DEAD_LETTER).put(deadRecord);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    memoryFallback[STORES.OUTBOX].delete(operation.idempotency_key);
    memoryFallback[STORES.DEAD_LETTER].set(operation.idempotency_key, deadRecord);
    return true;
  }
}

export async function getDeadLetterOperations() {
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.DEAD_LETTER, 'readonly');
      const store = tx.objectStore(STORES.DEAD_LETTER);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return Array.from(memoryFallback[STORES.DEAD_LETTER].values());
  }
}

// ── دوال مؤشرات المزامنة التزايدية (Sync State & Cursors) ─────────────────────────

export async function getSyncCursor(key) {
  if (!key) return 0;
  try {
    const db = await openLocalDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.SYNC_STATE, 'readonly');
      const store = tx.objectStore(STORES.SYNC_STATE);
      const req = store.get(String(key));
      req.onsuccess = () => resolve(req.result ? req.result.value : 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    const item = memoryFallback[STORES.SYNC_STATE].get(String(key));
    return item ? item.value : 0;
  }
}

export async function setSyncCursor(key, value) {
  if (!key) return false;
  const record = {
    key: String(key),
    value: Number(value) || 0,
    updated_at: new Date().toISOString()
  };

  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SYNC_STATE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_STATE);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryFallback[STORES.SYNC_STATE].set(record.key, record);
    return true;
  }
}

// ── دوال منع التكرار للوارد (Inbox Deduplication) ───────────────────────────────

export async function hasProcessedInbox(idempotencyKey) {
  if (!idempotencyKey) return false;
  const key = String(idempotencyKey);
  try {
    const db = await openLocalDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.INBOX, 'readonly');
      const store = tx.objectStore(STORES.INBOX);
      const req = store.get(key);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  } catch {
    return memoryFallback[STORES.INBOX].has(key);
  }
}

export async function markProcessedInbox(idempotencyKey, serverSeq = 0) {
  if (!idempotencyKey) return false;
  const record = {
    idempotency_key: String(idempotencyKey),
    server_seq: Number(serverSeq) || 0,
    processed_at: new Date().toISOString()
  };

  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.INBOX, 'readwrite');
      const store = tx.objectStore(STORES.INBOX);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryFallback[STORES.INBOX].set(record.idempotency_key, record);
    return true;
  }
}

// ── دوال كاش البيانات المرجعية (Reference Cache) ───────────────────────────────

export async function cacheReferenceData(key, data) {
  if (!key) return false;
  const record = {
    key: String(key),
    data,
    updated_at: new Date().toISOString()
  };
  try {
    const db = await openLocalDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.REFERENCE_CACHE, 'readwrite');
      const store = tx.objectStore(STORES.REFERENCE_CACHE);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    memoryFallback[STORES.REFERENCE_CACHE].set(record.key, record);
    return true;
  }
}

export async function getReferenceData(key) {
  if (!key) return null;
  try {
    const db = await openLocalDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.REFERENCE_CACHE, 'readonly');
      const store = tx.objectStore(STORES.REFERENCE_CACHE);
      const req = store.get(String(key));
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    const item = memoryFallback[STORES.REFERENCE_CACHE].get(String(key));
    return item ? item.data : null;
  }
}
