/**
 * offlineSync.js
 * مزامنة ودمج البيانات بذكاء مع MariaDB & PHP API لحماية البيانات من التداخل والمسح بين الأجهزة
 */

import {
  STORAGE_KEY,
  apiFetchSettings,
  apiSaveSettings,
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
export async function fetchRemoteState() {
  try {
    const rawData = await apiFetchSettings(STORAGE_KEY);
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

  // 1. حفظ محلي فوري دائماً للنسخ الاحتياطي
  await saveStateLocally(cleanUpdated);

  if (isOnline()) {
    try {
      // 2. جلب أحدث نسخة سحابية حالياً لدمجها قبل الكتابة
      const remoteState = await fetchRemoteState();

      // 3. تطبيق خوارزمية الدمج الذكي لحفظ كل بيانات الأجهزة الأخرى
      const finalStateToSave = remoteState
        ? normalizeState(smartMergeStates(cleanUpdated, remoteState))
        : cleanUpdated;

      // 4. حفظ النسخة المدمجة في MariaDB
      const res = await apiSaveSettings(STORAGE_KEY, finalStateToSave);

      if (!res?.success) {
        throw new Error(res?.error || 'Failed to save to MariaDB');
      }

      // 5. تحديث النسخة المحلية بالنسخة المدمجة
      await saveStateLocally(finalStateToSave);
      broadcastStateChange(finalStateToSave);
      onSyncSuccess?.(finalStateToSave);
      return { success: true, queued: false, mergedState: finalStateToSave };
    } catch (e) {
      console.error('[Sync] Network/Server error during save:', e);
      await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState });
      onSyncFail?.(e.message);
      return { success: false, queued: false, error: e.message, mergedState: updatedState };
    }
  } else {
    // 6. غير متصل: حفظ محلي وجدولة المزامنة عند عودة الإنترنت
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
      return { success: false, reason: 'no_local_data' };
    }

    // جلب النسخة السحابية ودمجها مع المحلية
    const remoteState = await fetchRemoteState();
    const mergedState = remoteState ? smartMergeStates(localState, remoteState) : localState;

    const res = await apiSaveSettings(STORAGE_KEY, mergedState);
    if (!res?.success) {
      throw new Error(res?.error || 'Manual sync save failed');
    }

    await saveStateLocally(mergedState);
    await clearPendingQueue();
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

// ── تحميل الحالة: جلب أحدث نسخة سحابية ودمجها مع المخزن المحلي ───────────
export async function smartLoadState() {
  const localData = await loadStateLocally();

  if (isOnline()) {
    try {
      const remoteData = await fetchRemoteState();
      if (remoteData) {
        // دمج محلي وسحابي لضمان عدم فقدان أي معاملة تمت أوفلاين أو على جهاز آخر
        const rawMerged = localData ? smartMergeStates(localData, remoteData) : remoteData;
        const merged = normalizeState(rawMerged);
        await saveStateLocally(merged);
        return { data: merged, source: 'cloud_merged' };
      }
    } catch (e) {
      console.warn('[Sync] Cloud load failed, falling back to local cache:', e);
    }
  }

  if (localData) {
    return { data: normalizeState(localData), source: 'local' };
  }

  return { data: null, source: 'none' };
}
