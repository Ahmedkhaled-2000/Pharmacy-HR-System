/**
 * offlineSync.js
 * مزامنة ودمج البيانات بذكاء مع MariaDB & PHP API لحماية البيانات من التداخل والمسح بين الأجهزة
 * مجهز بتقنيات الـ Ultra-Low Latency, Adaptive Polling, والـ Optimistic UI
 */

import {
  STORAGE_KEY,
  apiFetchSettings,
  apiSaveSettings,
  apiFetchVersion,
} from './apiClient';
import {
  saveStateLocally,
  loadStateLocally,
  addToPendingQueue,
  clearPendingQueue,
  getPendingCount,
} from './offlineStorage';
import { smartMergeStates } from './stateMerger';
import { normalizeState } from './formatters';

// ── قناة البث للمزامنة الفورية بين التبويبات والأجهزة ─────────────────────
const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('pharmacy-hr-live-sync')
  : null;

export function broadcastStateChange(state) {
  try {
    if (syncChannel && state) {
      syncChannel.postMessage({ type: 'STATE_UPDATED', state, timestamp: Date.now() });
    }
  } catch {}
}

export function listenToLiveBroadcasts(callback) {
  if (!syncChannel || typeof callback !== 'function') return () => {};
  const handler = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATED') {
      callback(event.data.state);
    }
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel.removeEventListener('message', handler);
}

// ── حالة الاتصال ─────────────────────────────────────────────────────────
export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ── جلب أحدث نسخة سحابية من MariaDB عبر PHP API ──────────────────────────
export async function fetchRemoteState(options = {}) {
  try {
    const rawData = await apiFetchSettings(STORAGE_KEY, options);
    if (rawData && rawData.notModified) {
      return { notModified: true };
    }
    if (rawData) {
      const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      return normalizeState(parsed);
    }
  } catch (e) {
    console.warn('[Sync] Failed to fetch remote state from MariaDB API:', e);
  }
  return null;
}

// ── حفظ الحالة بدمج ذكي يمنع مسح طلبات الأجهزة الأخرى ───────────────────
let saveQueueTimer = null;
let latestQueuedState = null;

export async function smartSaveState(updatedState, options = {}) {
  const { onSyncSuccess, onSyncFail, onQueuedOffline } = options;
  const cleanUpdated = normalizeState(updatedState);

  // 1. بث التغيير لكافة التبويبات فورياً في نفس الجهاز (0ms Instant Broadcast)
  broadcastStateChange(cleanUpdated);

  // 2. تحديث الكاش المحلي بشكل غير معطل للواجهة
  saveStateLocally(cleanUpdated).catch((err) => {
    console.warn('[Sync] Local storage async write warning:', err);
  });

  if (isOnline()) {
    try {
      // 3. إرسال النسخة النظيفة إلى السحابة مباشرة مع الدمج الخادمي
      const res = await apiSaveSettings(STORAGE_KEY, cleanUpdated, { timeout: 15000 });

      if (!res?.success) {
        throw new Error(res?.error || 'Failed to save to Database');
      }

      // إذا أعاد الخادم حالة مدمجة، نعتمدها ونحدث التخزين المحلي
      const finalState = res?.value && typeof res.value === 'object' ? normalizeState(res.value) : cleanUpdated;
      saveStateLocally(finalState).catch(() => {});
      broadcastStateChange(finalState);

      onSyncSuccess?.(finalState);
      return { success: true, queued: false, mergedState: finalState };
    } catch (e) {
      console.error('[Sync] Network/Server error during save:', e);
      await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState }).catch(() => {});
      onSyncFail?.(e.message);
      return { success: false, queued: true, error: e.message, mergedState: updatedState };
    }
  } else {
    // 4. غير متصل: جدولة المزامنة عند عودة الإنترنت
    console.log('[Sync] Offline - state saved locally, will merge & sync when online');
    await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState }).catch(() => {});
    onQueuedOffline?.();

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-app-state');
      } catch (e) {
        console.warn('[Sync] Background sync registration failed:', e);
      }
    }

    return { success: false, queued: true, mergedState: updatedState };
  }
}

// ── مزامنة يدوية مع دمج ذكي عند عودة الاتصال ────────────────────────────
export async function syncNow(onProgress) {
  if (!isOnline()) {
    return { success: false, reason: 'offline' };
  }

  try {
    onProgress?.('جاري المزامنة والدمج الذكي مع قاعدة البيانات...');
    const localState = await loadStateLocally();

    if (!localState) {
      const remote = await fetchRemoteState({ timeout: 10000, useETag: false });
      if (remote && !remote.notModified) {
        await saveStateLocally(remote);
        return { success: true, mergedState: remote };
      }
      return { success: false, reason: 'no_data' };
    }

    // جلب النسخة السحابية ودمجها مع المحلية
    const remoteState = await fetchRemoteState({ timeout: 10000, useETag: false });
    const validRemote = remoteState && !remoteState.notModified ? remoteState : null;
    const mergedState = validRemote ? smartMergeStates(localState, validRemote) : localState;

    const res = await apiSaveSettings(STORAGE_KEY, mergedState);
    if (!res?.success) {
      throw new Error(res?.error || 'Manual sync save failed');
    }

    const finalState = res?.value && typeof res.value === 'object' ? normalizeState(res.value) : mergedState;
    await saveStateLocally(finalState);
    await clearPendingQueue();
    broadcastStateChange(finalState);
    onProgress?.('تمت المزامنة والدمج بنجاح ✅');
    return { success: true, mergedState: finalState };
  } catch (e) {
    console.error('[Sync] Manual sync failed:', e);
    return { success: false, reason: e.message };
  }
}

// ── استماع لأحداث الاتصال ────────────────────────────────────────────────
export function listenToConnectionChanges(onOnline, onOffline) {
  const handleOnline = async () => {
    console.log('[Sync] Connection restored - merging & syncing...');
    const syncRes = await syncNow();
    onOnline?.(syncRes.mergedState);
  };

  const handleOffline = () => {
    console.log('[Sync] Connection lost');
    onOffline?.();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ── قراءة الحالة المحلية فورياً بدون أي تأخير (0ms Instant Load) ───────────
export async function loadLocalStateFast() {
  try {
    const localData = await loadStateLocally();
    if (localData && typeof localData === 'object') {
      return normalizeState(localData);
    }
  } catch (e) {
    console.warn('[Sync] Local storage load error:', e);
  }
  return null;
}

// ── تحميل الحالة السحابية فائق السرعة مع مهلة ذكية وإعادة محاولة تلقائية ─────
export async function smartLoadState() {
  // 1. فحص وجود بيانات سريعة محلياً
  const localCache = await loadLocalStateFast();
  const pendingCount = await getPendingCount().catch(() => 0);

  if (isOnline()) {
    try {
      // محاولة أولى سريعة لجلب أحدث نسخة حية من السحابة
      const remoteData = await fetchRemoteState({ timeout: 5000, useETag: Boolean(localCache) });
      
      if (remoteData && !remoteData.notModified) {
        const normalized = normalizeState(remoteData);
        // إذا كان هناك تعديلات أوف لاين معلقة فقط، ندمجها؛ وإلا فإن السحابة هي المصدر الموثوق
        const merged = (localCache && pendingCount > 0) ? smartMergeStates(localCache, normalized) : normalized;
        await saveStateLocally(merged);
        return { data: merged, source: 'cloud' };
      } else if (remoteData && remoteData.notModified) {
        // لم تتغير البيانات في السحابة
        if (localCache) {
          return { data: localCache, source: 'cloud_cached_304' };
        }
      }
    } catch (e) {
      console.warn('[Sync] Cloud fast load warning, attempting robust fetch:', e.message);
    }

    // 2. إذا لم تكن هناك بيانات محلية، نقوم بإجراء محاولة ثانية قوية فوراً لتجنب بقاء النظام فارغاً
    if (!localCache) {
      try {
        const retryData = await fetchRemoteState({ timeout: 12000, useETag: false });
        if (retryData && !retryData.notModified) {
          const normalized = normalizeState(retryData);
          await saveStateLocally(normalized);
          return { data: normalized, source: 'cloud_retry' };
        }
      } catch (retryErr) {
        console.error('[Sync] Robust cloud load attempt failed:', retryErr);
      }
    }
  }

  // 3. إذا كنا أوف لاين أو حدث بطء، استخدام الكاش المحلي مباشرة
  if (localCache) {
    return { data: localCache, source: 'local_offline' };
  }

  return { data: null, source: 'none' };
}

// ── استطلاع ذكي متكيف في الخلفية (Adaptive Background Smart Polling) ────────
export function startSmartPolling({ onRemoteUpdate, intervalActive = 15000, intervalIdle = 60000 }) {
  let lastKnownVersion = null;
  let timerId = null;
  let isFetching = false;

  const checkVersion = async () => {
    if (!isOnline() || isFetching) return;
    
    try {
      isFetching = true;
      const vRes = await apiFetchVersion(STORAGE_KEY, { timeout: 4000 });
      const currentVer = vRes?.version || vRes?.updated_at || vRes?.timestamp;

      if (currentVer) {
        if (lastKnownVersion && currentVer !== lastKnownVersion) {
          console.log('[Sync Polling] New cloud version detected:', currentVer, 'Old:', lastKnownVersion);
          const freshData = await fetchRemoteState({ timeout: 7000 });
          if (freshData && !freshData.notModified) {
            onRemoteUpdate?.(freshData);
            await saveStateLocally(freshData);
          }
        }
        lastKnownVersion = currentVer;
      }
    } catch (err) {
      // خطأ صامت في استطلاع الخلفية لتجنب إزعاج المستخدم
    } finally {
      isFetching = false;
    }
  };

  const scheduleNext = () => {
    const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
    const delay = isVisible ? intervalActive : intervalIdle;
    timerId = setTimeout(async () => {
      await checkVersion();
      scheduleNext();
    }, delay);
  };

  // بدء الجدولة
  scheduleNext();

  // ضبط التوقيت فور عودة التبويب للواجهة
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(timerId);
      checkVersion().then(() => scheduleNext());
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    clearTimeout(timerId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
