/**
 * offlineStorage.js
 * قاعدة بيانات محلية مرنة (Dual-Tier: IndexedDB + LocalStorage + In-Memory)
 * تعمل بكفاءة 100% عبر كافة المتصفحات بما فيها وضع التصفح المتخفي (Private/Incognito) ومتصفحات الهواتف
 */

const DB_NAME = 'pharmacy-offline-db';
const DB_VERSION = 2;
const LOCAL_STORAGE_MIRROR_KEY = 'pharmacy-tracker-data-mirror';
const LOCAL_PENDING_QUEUE_KEY = 'pharmacy-pending-queue-mirror';

const STORES = {
  APP_STATE: 'app_state',          // الحالة الكاملة للتطبيق
  PENDING_QUEUE: 'pending_queue',    // العمليات المنتظرة للمزامنة
  SNAPSHOTS: 'backup_snapshots'      // سجل النسخ واللقطات الاحتياطية التلقائية
};

// ذاكرة وصول عشوائي مؤقتة في حال حظر التخزين تماماً
const memoryStore = new Map();

// ── فحص دعم وصلاحية IndexedDB ─────────────────────────────────────────────
function isIndexedDBAvailable() {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch {
    return false;
  }
}

// ── فتح قاعدة البيانات بأمان تام ───────────────────────────────────────────
function openDB() {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB is not supported or accessible'));
  }

  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        try {
          const db = event.target.result;

          if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
            db.createObjectStore(STORES.APP_STATE, { keyPath: 'key' });
          }

          if (!db.objectStoreNames.contains(STORES.PENDING_QUEUE)) {
            const store = db.createObjectStore(STORES.PENDING_QUEUE, {
              keyPath: 'id',
              autoIncrement: true
            });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }

          if (!db.objectStoreNames.contains(STORES.SNAPSHOTS)) {
            const snapStore = db.createObjectStore(STORES.SNAPSHOTS, {
              keyPath: 'id'
            });
            snapStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        } catch (upgradeErr) {
          console.warn('[OfflineDB] Upgrade warning:', upgradeErr);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    } catch (e) {
      reject(e);
    }
  });
}

// ── حفظ حالة التطبيق محلياً (IndexedDB + LocalStorage Mirror) ───────────────
export async function saveStateLocally(state) {
  if (!state) return false;

  // 1. حفظ فوري في LocalStorage كمرآة أمان للمتصفحات المقيدة
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_MIRROR_KEY, JSON.stringify({
        value: state,
        updatedAt: Date.now()
      }));
    }
  } catch (lsErr) {
    // في حال امتلاء LocalStorage، يتم الحفظ في الذاكرة
    memoryStore.set('app_state', { value: state, updatedAt: Date.now() });
  }

  // 2. حفظ في IndexedDB
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.APP_STATE, 'readwrite');
      const store = tx.objectStore(STORES.APP_STATE);
      store.put({ key: 'pharmacy-tracker-data', value: state, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    // IndexedDB فشل، ولكن تم الحفظ في LocalStorage كبديل
    return true;
  }
}

// ── قراءة الحالة المحفوظة محلياً مع التراجع التلقائي ───────────────────────
export async function loadStateLocally() {
  // 1. محاولة القراءة من IndexedDB أولاً
  try {
    const db = await openDB();
    const result = await new Promise((resolve) => {
      const tx = db.transaction(STORES.APP_STATE, 'readonly');
      const store = tx.objectStore(STORES.APP_STATE);
      const request = store.get('pharmacy-tracker-data');
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => resolve(null);
    });

    if (result && typeof result === 'object') {
      return result;
    }
  } catch {
    // متابعة للتراجع إلى LocalStorage
  }

  // 2. التراجع إلى LocalStorage Mirror
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_MIRROR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.value && typeof parsed.value === 'object') {
          return parsed.value;
        }
      }
    }
  } catch {}

  // 3. التراجع إلى Memory Store
  const mem = memoryStore.get('app_state');
  if (mem?.value && typeof mem.value === 'object') {
    return mem.value;
  }

  return null;
}

// ── إضافة لقطة احتياطية تلقائية ─────────────────────────────────────────
export async function saveBackupSnapshot(snapshot) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      store.put(snapshot);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

// ── جلب جميع اللقطات الاحتياطية التلقائية ───────────────────────────────
export async function getBackupSnapshots() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readonly');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result || [];
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results.slice(0, 20));
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

// ── حذف لقطة احتياطية قديمة ─────────────────────────────────────────────
export async function deleteBackupSnapshot(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

// ── إضافة عملية للقائمة المنتظرة للمزامنة ────────────────────────────────
export async function addToPendingQueue(operation) {
  const item = {
    ...operation,
    timestamp: Date.now(),
    retries: 0
  };

  // LocalStorage queue mirror
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_PENDING_QUEUE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push(item);
      localStorage.setItem(LOCAL_PENDING_QUEUE_KEY, JSON.stringify(list.slice(-50)));
    }
  } catch {}

  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      store.add(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return true;
  }
}

// ── قراءة قائمة العمليات المنتظرة ────────────────────────────────────────
export async function getPendingQueue() {
  try {
    const db = await openDB();
    const results = await new Promise((resolve) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readonly');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    if (Array.isArray(results) && results.length > 0) {
      return results;
    }
  } catch {}

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_PENDING_QUEUE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}

  return [];
}

// ── حذف عملية من القائمة بعد نجاح المزامنة ──────────────────────────────
export async function removePendingItem(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

// ── حذف كل القائمة بعد مزامنة ناجحة ────────────────────────────────────
export async function clearPendingQueue() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_PENDING_QUEUE_KEY);
    }
  } catch {}

  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      tx.objectStore(STORES.PENDING_QUEUE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return true;
  }
}

// ── عدد العمليات المنتظرة ─────────────────────────────────────────────────
export async function getPendingCount() {
  const queue = await getPendingQueue();
  return queue.length;
}

// ── تفريغ كامل لقاعدة البيانات المحلية المؤقتة (عند التصفير الشامل) ─────────
export async function clearLocalDatabase() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_MIRROR_KEY);
      localStorage.removeItem(LOCAL_PENDING_QUEUE_KEY);
    }
  } catch {}
  try {
    memoryStore.clear();
    const db = await openDB();
    const tx = db.transaction([STORES.APP_STATE, STORES.PENDING_QUEUE], 'readwrite');
    tx.objectStore(STORES.APP_STATE).clear();
    tx.objectStore(STORES.PENDING_QUEUE).clear();
  } catch {}
}
