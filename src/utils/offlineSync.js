/**
 * offlineSync.js
 * مزامنة ودمج البيانات بذكاء مع Supabase لحماية البيانات من التداخل والمسح بين الأجهزة
 */

import { db, STORAGE_KEY } from './supabaseClient';
import {
  saveStateLocally,
  loadStateLocally,
  addToPendingQueue,
  getPendingQueue,
  removePendingItem,
  clearPendingQueue
} from './offlineStorage';
import { smartMergeStates } from './stateMerger';
import { normalizeState } from './formatters';

// ── حالة الاتصال ─────────────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine;
}

// ── جلب أحدث نسخة سحابية من Supabase ──────────────────────────────────────
export async function fetchRemoteState() {
  try {
    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', STORAGE_KEY)
      .single();

    if (!error && data?.value) {
      const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      return normalizeState(raw);
    }
  } catch (e) {
    console.warn('[Sync] Failed to fetch remote state:', e);
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
      const finalStateToSave = remoteState ? normalizeState(smartMergeStates(cleanUpdated, remoteState)) : cleanUpdated;

      // 4. حفظ النسخة المدمجة في Supabase
      const { error } = await db
        .from('app_settings')
        .upsert({ key: STORAGE_KEY, value: finalStateToSave });

      if (error) {
        console.error('[Sync] Supabase upsert error:', error);
        await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState });
        onSyncFail?.(error.message);
        return { success: false, queued: false, error: error.message, mergedState: updatedState };
      }

      // 5. تحديث النسخة المحلية بالنسخة المدمجة
      await saveStateLocally(finalStateToSave);
      onSyncSuccess?.(finalStateToSave);
      return { success: true, queued: false, mergedState: finalStateToSave };
    } catch (e) {
      console.error('[Sync] Network error during save:', e);
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
    onProgress?.('جاري المزامنة والدمج الذكي...');
    const localState = await loadStateLocally();

    if (!localState) {
      return { success: false, reason: 'no_local_data' };
    }

    // جلب النسخة السحابية ودمجها مع المحلية
    const remoteState = await fetchRemoteState();
    const mergedState = remoteState ? smartMergeStates(localState, remoteState) : localState;

    const { error } = await db
      .from('app_settings')
      .upsert({ key: STORAGE_KEY, value: mergedState });

    if (error) {
      console.error('[Sync] Manual sync error:', error);
      return { success: false, reason: error.message };
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
