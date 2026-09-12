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
  clearLocalDatabase,
} from './offlineStorage';
export { clearLocalDatabase, saveStateLocally };
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

// ── حالة الاتصال الحقيقية ومسبار النبض النشط (Active Reachability Engine) ───
let isNetworkOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let activeSyncPromise = null;
let heartbeatTimerId = null;

export function isOnline() {
  // لا نعتمد بشكل أعمى على navigator.onLine وحده في ويندوز كروميوم
  if (typeof navigator !== 'undefined' && navigator.onLine === false && isNetworkOffline) {
    return false;
  }
  return true;
}

export function setConnectionStatus(online) {
  isNetworkOffline = !online;
}

/**
 * فحص الاتصال الفعلي الخفيف جداً (Fast Ping Probe < 50ms)
 * يضمن التأكد من وصول الحزم للإنترنت وليس فقط الاتصال بالراوتر المحلي
 */
export async function verifyRealConnection(timeoutMs = 3000) {
  try {
    const vRes = await apiFetchVersion(STORAGE_KEY, { timeout: timeoutMs, isBackground: true });
    if (vRes !== undefined && vRes !== null) {
      isNetworkOffline = false;
      return true;
    }
  } catch (e) {
    // محاولة إضافية سريعة
  }
  return false;
}

// ── جلب أحدث نسخة سحابية من MariaDB عبر PHP API ──────────────────────────
export async function fetchRemoteState(options = {}) {
  try {
    const rawData = await apiFetchSettings(STORAGE_KEY, options);
    if (rawData && rawData.notModified) {
      return { notModified: true };
    }
    if (rawData) {
      let parsed = rawData;
      if (typeof rawData === 'string') {
        try { parsed = JSON.parse(rawData); } catch { parsed = null; }
      }
      if (parsed === 'null' || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return normalizeState(parsed);
    }
  } catch (e) {
    console.warn('[Sync] Failed to fetch remote state from Cloud API:', e);
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

  // نحاول الحفظ مباشرة حتى لو كان navigator.onLine يزعم الأوفلاين
  try {
    const res = await apiSaveSettings(STORAGE_KEY, cleanUpdated, { timeout: 15000 });

    if (!res?.success) {
      throw new Error(res?.error || 'Failed to save to Database');
    }

    isNetworkOffline = false;
    const finalState = res?.value && typeof res.value === 'object' ? normalizeState(res.value) : cleanUpdated;
    saveStateLocally(finalState).catch(() => {});
    clearPendingQueue().catch(() => {});
    broadcastStateChange(finalState);

    onSyncSuccess?.(finalState);
    return { success: true, queued: false, mergedState: finalState };
  } catch (e) {
    isNetworkOffline = true;
    console.warn('[Sync] Network error during save, queued for auto-sync:', e.message);
    await addToPendingQueue({ type: 'SAVE_STATE', state: updatedState }).catch(() => {});
    onQueuedOffline?.();
    return { success: false, queued: true, error: e.message, mergedState: updatedState };
  }
}

// ── مزامنة يدوية مع دمج ذكي عند عودة الاتصال مع قفل التزامن (Concurrency Mutex) ──
export async function syncNow(onProgress) {
  // إذا كانت هناك عملية مزامنة جارية حالياً، نعيد نفس الوعد لمنع الازدواجية
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      onProgress?.('جاري المزامنة والدمج الذكي مع قاعدة البيانات...');
      const localState = await loadStateLocally();

      // محاولة مباشرة لجلب النسخة السحابية
      const remoteState = await fetchRemoteState({ timeout: 10000, useETag: false });
      
      if (!remoteState && isNetworkOffline) {
        return { success: false, reason: 'offline' };
      }

      isNetworkOffline = false;

      if (!localState) {
        if (remoteState && !remoteState.notModified) {
          await saveStateLocally(remoteState);
          return { success: true, mergedState: remoteState };
        }
        return { success: false, reason: 'no_data' };
      }

      const validRemote = remoteState && !remoteState.notModified ? remoteState : null;
      const mergedState = validRemote ? smartMergeStates(localState, validRemote) : localState;

      const res = await apiSaveSettings(STORAGE_KEY, mergedState, { timeout: 15000 });
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
      console.warn('[Sync] Sync attempt encountered network issue:', e.message);
      isNetworkOffline = true;
      return { success: false, reason: e.message };
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

// ── استماع متطور لأحداث الاتصال ومسبار النبض السريع ───────────────────────
export function listenToConnectionChanges(onOnline, onOffline) {
  let isProbing = false;

  const triggerInstantReconnection = async () => {
    if (isProbing) return;
    isProbing = true;
    console.log('[Sync] Network connection detected, executing instant sync...');
    const syncRes = await syncNow();
    if (syncRes.success) {
      isNetworkOffline = false;
      onOnline?.(syncRes.mergedState);
    }
    isProbing = false;
  };

  const handleOnlineEvent = () => {
    triggerInstantReconnection();
  };

  const handleOfflineEvent = () => {
    console.log('[Sync] Native offline event triggered');
    isNetworkOffline = true;
    onOffline?.();
  };

  window.addEventListener('online', handleOnlineEvent);
  window.addEventListener('offline', handleOfflineEvent);

  // مسبار نبض نشط دوري كل 2.5 ثانية عند انقطاع الإنترنت (Fast Heartbeat Probe)
  // يكتشف عودة الإنترنت فوراً حتى لو لم يطلق الويندوز حدث 'online'
  const probeInterval = setInterval(async () => {
    if (isNetworkOffline) {
      const isActuallyOnline = await verifyRealConnection(2000);
      if (isActuallyOnline) {
        console.log('[Sync] Active probe discovered internet is back! Syncing now...');
        await triggerInstantReconnection();
      }
    }
  }, 2500);

  // الاستماع لحدث استيقاظ الجهاز من السكون في سطح المكتب Electron
  let unsubDesktopResume = null;
  if (typeof window !== 'undefined' && window.desktopAPI?.onSystemResume) {
    unsubDesktopResume = window.desktopAPI.onSystemResume(() => {
      console.log('[Sync] Desktop OS resumed from sleep, checking connection...');
      triggerInstantReconnection();
    });
  }

  return () => {
    window.removeEventListener('online', handleOnlineEvent);
    window.removeEventListener('offline', handleOfflineEvent);
    clearInterval(probeInterval);
    if (unsubDesktopResume) unsubDesktopResume();
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
export async function smartLoadState(options = {}) {
  const onProgress = options.onProgress;
  const isCurrentlyOnline = isOnline();

  // 1. فحص وجود بيانات سريعة محلياً لاستخدامها كواجهة فورية
  const localCache = await loadLocalStateFast();

  if (isCurrentlyOnline) {
    onProgress?.('جاري الاتصال بالسحابة ومزامنة البيانات...');
    try {
      // محاولة مباشرة لجلب أحدث وأدق نسخة حية من السحابة بدون كاش
      const remoteData = await fetchRemoteState({ timeout: 12000, useETag: false, isBackground: true });
      
      if (remoteData && !remoteData.notModified) {
        const normalized = normalizeState(remoteData);
        // حفظ الحالة السحابية النظيفة في التخزين المحلي لتحديثه فوراً
        await saveStateLocally(normalized);
        return { data: normalized, source: 'cloud' };
      }
    } catch (e) {
      console.warn('[Sync] Cloud fetch attempt failed, falling back to local storage:', e.message);
    }
  }

  // 2. إذا كنا أوفلاين ولم نحصل على بيانات سحابية، نستخدم الكاش المحلي
  if (localCache) {
    return { data: localCache, source: 'local_offline' };
  }

  return { data: null, source: 'none' };
}

// ── استطلاع ذكي متكيف في الخلفية (Adaptive Background Smart Polling) ────────
export function startSmartPolling({ onRemoteUpdate, intervalActive = 3500, intervalIdle = 15000 }) {
  let lastKnownVersion = null;
  let timerId = null;
  let isFetching = false;
  let pollFailures = 0;

  const checkVersion = async () => {
    if (!isOnline() || isFetching) return;
    
    try {
      isFetching = true;
      const vRes = await apiFetchVersion(STORAGE_KEY, { timeout: 3500, isBackground: true });
      const currentVer = typeof vRes?.version === 'number' ? vRes.version : (vRes?.updated_at || vRes?.timestamp);

      if (currentVer) {
        pollFailures = 0;
        if (lastKnownVersion !== null && currentVer !== lastKnownVersion) {
          const freshData = await fetchRemoteState({ timeout: 8000, useETag: false, isBackground: true });
          if (freshData && !freshData.notModified) {
            const localCurrent = await loadLocalStateFast();
            const merged = localCurrent ? smartMergeStates(localCurrent, freshData) : freshData;
            onRemoteUpdate?.(merged);
            await saveStateLocally(merged);
          }
        }
        lastKnownVersion = currentVer;
      }
    } catch (err) {
      pollFailures++;
    } finally {
      isFetching = false;
    }
  };

  const scheduleNext = () => {
    const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
    let delay = isVisible ? intervalActive : intervalIdle;
    if (pollFailures > 0) {
      delay = Math.min(45000, 3500 * Math.pow(1.8, Math.min(pollFailures, 6)));
    }
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
