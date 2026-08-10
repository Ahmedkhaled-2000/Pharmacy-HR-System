/**
 * offlineSync.js
 * مزامنة البيانات مع Supabase عند عودة الإنترنت
 */

import { db, STORAGE_KEY } from './supabaseClient';
import {
  saveStateLocally,
  loadStateLocally,
  getPendingQueue,
  removePendingItem,
  clearPendingQueue
} from './offlineStorage';

// ── حالة الاتصال ─────────────────────────────────────────────────────────
export function isOnline() {
  return navigator.onLine;
}

// ── حفظ الحالة: محلياً أولاً، ثم Supabase إن كان الإنترنت متاحاً ─────────
export async function smartSaveState(updatedState, options = {}) {
  const { onSyncSuccess, onSyncFail, onQueuedOffline } = options;

  // 1. حفظ محلي فوري دائماً (حتى مع الإنترنت - للنسخ الاحتياطي)
  await saveStateLocally(updatedState);

  if (isOnline()) {
    // 2. محاولة حفظ في Supabase مباشرة
    try {
      const { error } = await db
        .from('app_settings')
        .upsert({ key: STORAGE_KEY, value: updatedState });

      if (error) {
        console.error('[Sync] Supabase error:', error);
        // فشل الحفظ - أضف للقائمة المنتظرة
        onSyncFail?.(error.message);
        return { success: false, queued: false, error: error.message };
      }

      onSyncSuccess?.();
      return { success: true, queued: false };
    } catch (e) {
      console.error('[Sync] Network error:', e);
      onSyncFail?.(e.message);
      return { success: false, queued: false, error: e.message };
    }
  } else {
    // 3. غير متصل: سيتم التزامن لاحقاً عند عودة الإنترنت
    console.log('[Sync] Offline - state saved locally, will sync when online');
    onQueuedOffline?.();
    
    // تسجيل لدى Service Worker للمزامنة
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-app-state');
      } catch (e) {
        console.warn('[Sync] Background sync registration failed:', e);
      }
    }

    return { success: false, queued: true };
  }
}

// ── مزامنة يدوية: إرسال الحالة المحلية إلى Supabase ─────────────────────
export async function syncNow(onProgress) {
  if (!isOnline()) {
    return { success: false, reason: 'offline' };
  }

  try {
    onProgress?.('جاري المزامنة...');
    const localState = await loadStateLocally();

    if (!localState) {
      return { success: false, reason: 'no_local_data' };
    }

    const { error } = await db
      .from('app_settings')
      .upsert({ key: STORAGE_KEY, value: localState });

    if (error) {
      console.error('[Sync] Manual sync error:', error);
      return { success: false, reason: error.message };
    }

    await clearPendingQueue();
    onProgress?.('تمت المزامنة بنجاح ✅');
    return { success: true };
  } catch (e) {
    console.error('[Sync] Manual sync failed:', e);
    return { success: false, reason: e.message };
  }
}

// ── استماع لأحداث الاتصال ────────────────────────────────────────────────
export function listenToConnectionChanges(onOnline, onOffline) {
  const handleOnline = async () => {
    console.log('[Sync] Connection restored - syncing...');
    await syncNow();
    onOnline?.();
  };

  const handleOffline = () => {
    console.log('[Sync] Connection lost');
    onOffline?.();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // إرجاع دالة لإلغاء الاشتراك
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ── تحميل الحالة: من Supabase أو الـ Cache المحلي ──────────────────────
export async function smartLoadState() {
  if (isOnline()) {
    try {
      const { data, error } = await db
        .from('app_settings')
        .select('value')
        .eq('key', STORAGE_KEY)
        .single();

      if (!error && data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        // تحديث النسخة المحلية بآخر بيانات من السحابة
        await saveStateLocally(parsed);
        return { data: parsed, source: 'cloud' };
      }
    } catch (e) {
      console.warn('[Sync] Cloud load failed, falling back to local:', e);
    }
  }

  // استخدام النسخة المحلية
  const localData = await loadStateLocally();
  if (localData) {
    return { data: localData, source: 'local' };
  }

  return { data: null, source: 'none' };
}
