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
export async function smartSaveState(updatedState, options = {}) {
  const { onSyncSuccess, onSyncFail, onQueuedOffline } = options;
  const cleanUpdated = normalizeState(updatedState);

  // 1. تحديث الكاش المحلي وبث التغيير لكافة التبويبات فورياً (0ms)
  await saveStateLocally(cleanUpdated);
  broadcastStateChange(cleanUpdated);

  if (isOnline()) {
    try {
      // 2. إرسال النسخة النظيفة إلى السحابة مباشرة
      const res = await apiSaveSettings(STORAGE_KEY, cleanUpdated, { timeout: 12000 });

      if (!res?.success) {
        throw new Error(res?.error || 'Failed to save to MariaDB');
      }

      onSyncSuccess?.(cleanUpdated);
      return { success: true, queued: false, mergedState: cleanUpdated };
    } catch (e) {
      console.error('[Sync] Network/Server error during save:', e);
      await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState });
      onSyncFail?.(e.message);
      return { success: false, queued: true, error: e.message, mergedState: updatedState };
    }
  } else {
    // 3. غير متصل: جدولة المزامنة عند عودة الإنترنت
    console.log('[Sync] Offline - state saved locally, will merge & sync when online');
    await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState });
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
      const remote = await fetchRemoteState();
      if (remote && !remote.notModified) {
        await saveStateLocally(remote);
        return { success: true, mergedState: remote };
      }
      return { success: false, reason: 'no_data' };
    }

    // جلب النسخة السحابية ودمجها مع المحلية
    const remoteState = await fetchRemoteState();
    const validRemote = remoteState && !remoteState.notModified ? remoteState : null;
    const mergedState = validRemote ? smartMergeStates(localState, validRemote) : localState;

    const res = await apiSaveSettings(STORAGE_KEY, mergedState);
    if (!res?.success) {
      throw new Error(res?.error || 'Manual sync save failed');
    }

    await saveStateLocally(mergedState);
    await clearPendingQueue();
    broadcastStateChange(mergedState);
    onProgress?.('تمت المزامنة والدمج بنجاح ✅');
    return { success: true, mergedState };
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
    if (localData) {
      return normalizeState(localData);
    }
  } catch (e) {
    console.warn('[Sync] Local storage load error:', e);
  }
  return null;
}

// ── تحميل الحالة السحابية فائق السرعة مع مهلة ذكية (Smart Fast Load) ─────
export async function smartLoadState() {
  // 1. فحص وجود بيانات سريعة محلياً
  const localCache = await loadLocalStateFast();

  if (isOnline()) {
    try {
      // محاولة جلب أحدث نسخة حية من السحابة بمهلة قصيرة ذكية (3 ثوان كحد أقصى)
      const remoteData = await fetchRemoteState({ timeout: 3500, useETag: true });
      
      if (remoteData && !remoteData.notModified) {
        const normalized = normalizeState(remoteData);
        // إذا كان لدينا كاش محلي، ندمجهما بذكاء لحماية البيانات
        const merged = localCache ? smartMergeStates(localCache, normalized) : normalized;
        await saveStateLocally(merged);
        return { data: merged, source: 'cloud' };
      } else if (remoteData && remoteData.notModified) {
        // لم تتغير البيانات في السحابة -> استخدام الكاش المحلي الفوري
        if (localCache) {
          return { data: localCache, source: 'cloud_cached_304' };
        }
      }
    } catch (e) {
      console.warn('[Sync] Cloud load timed out or failed, using local storage cache:', e);
    }
  }

  // إذا كنا أوف لاين أو حدث بطء في الشبكة، استخدام الكاش المحلي مباشرة
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
