/**
 * offlineStorage.js
 * قاعدة بيانات محلية IndexedDB لحفظ بيانات التطبيق وسجل اللقطات الاحتياطية أوف لاين
 */

const DB_NAME = 'pharmacy-offline-db';
const DB_VERSION = 2;
const STORES = {
  APP_STATE: 'app_state',          // الحالة الكاملة للتطبيق
  PENDING_QUEUE: 'pending_queue',    // العمليات المنتظرة للمزامنة
  SNAPSHOTS: 'backup_snapshots'      // سجل النسخ واللقطات الاحتياطية التلقائية
};

// ── فتح قاعدة البيانات ────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // جدول الحالة الكاملة للتطبيق
      if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
        db.createObjectStore(STORES.APP_STATE, { keyPath: 'key' });
      }

      // جدول العمليات المنتظرة
      if (!db.objectStoreNames.contains(STORES.PENDING_QUEUE)) {
        const store = db.createObjectStore(STORES.PENDING_QUEUE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // جدول اللقطات الاحتياطية التلقائية
      if (!db.objectStoreNames.contains(STORES.SNAPSHOTS)) {
        const snapStore = db.createObjectStore(STORES.SNAPSHOTS, {
          keyPath: 'id'
        });
        snapStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── حفظ حالة التطبيق محلياً ───────────────────────────────────────────────
export async function saveStateLocally(state) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.APP_STATE, 'readwrite');
      const store = tx.objectStore(STORES.APP_STATE);
      store.put({ key: 'pharmacy-tracker-data', value: state, updatedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error saving state locally:', e);
    return false;
  }
}

// ── قراءة الحالة المحفوظة محلياً ─────────────────────────────────────────
export async function loadStateLocally() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.APP_STATE, 'readonly');
      const store = tx.objectStore(STORES.APP_STATE);
      const request = store.get('pharmacy-tracker-data');
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error loading state:', e);
    return null;
  }
}

// ── إضافة لقطة احتياطية تلقائية ─────────────────────────────────────────
export async function saveBackupSnapshot(snapshot) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      store.put(snapshot);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error saving snapshot:', e);
    return false;
  }
}

// ── جلب جميع اللقطات الاحتياطية التلقائية ───────────────────────────────
export async function getBackupSnapshots() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readonly');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      const request = store.getAll();
      request.onsuccess = () => {
        const results = request.result || [];
        // ترتيب من الأحدث إلى الأقدم
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results.slice(0, 20)); // الاحتفاظ بآخر 20 لقطة
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error getting snapshots:', e);
    return [];
  }
}

// ── حذف لقطة احتياطية قديمة ─────────────────────────────────────────────
export async function deleteBackupSnapshot(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORES.SNAPSHOTS);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error deleting snapshot:', e);
    return false;
  }
}

// ── إضافة عملية للقائمة المنتظرة ─────────────────────────────────────────
export async function addToPendingQueue(operation) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      store.add({
        ...operation,
        timestamp: Date.now(),
        retries: 0
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error adding to queue:', e);
    return false;
  }
}

// ── قراءة قائمة العمليات المنتظرة ────────────────────────────────────────
export async function getPendingQueue() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readonly');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error getting queue:', e);
    return [];
  }
}

// ── حذف عملية من القائمة بعد نجاح المزامنة ──────────────────────────────
export async function removePendingItem(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.PENDING_QUEUE);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error removing item:', e);
    return false;
  }
}

// ── حذف كل القائمة بعد مزامنة ناجحة ────────────────────────────────────
export async function clearPendingQueue() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PENDING_QUEUE, 'readwrite');
      tx.objectStore(STORES.PENDING_QUEUE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('[OfflineDB] Error clearing queue:', e);
    return false;
  }
}

// ── عدد العمليات المنتظرة ─────────────────────────────────────────────────
export async function getPendingCount() {
  const queue = await getPendingQueue();
  return queue.length;
}
