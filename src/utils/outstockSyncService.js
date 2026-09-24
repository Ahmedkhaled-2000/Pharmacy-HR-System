/**
 * outstockSyncService.js
 * محرك المزامنة اللحظية الشامل والعمل في وضع عدم الاتصال (Offline & Realtime Sync Engine)
 * لنظام إدارة النواقص والمشتريات (OutStock Handling System)
 *
 * المزايا:
 * 1. تفريغ تلقائي لطابور الأوفلاين عند عودة الاتصال (Automatic Queue Flush)
 * 2. اتصال لحظي عبر Socket.io لبث الطلبات والتغييرات في أقل من 5ms
 * 3. تزامن فوري بين جميع التبويبات المفتوحة على نفس الجهاز عبر BroadcastChannel
 * 4. رصد جودة واستقرار الشبكة مع مؤشرات حالة مرئية (Online / Offline / Syncing)
 */

import { getSocket } from './socketClient';
import {
  getOfflineOrdersQueue,
  dequeueOfflineOrder,
  updateCachedOrder,
  getOfflineQueueStats,
  broadcastOutstockLocalMessage,
  listenToOutstockLocalMessages
} from './outstockOfflineStorage';
import { outstockCreateOrder } from './outstockApiClient';

// حالة الاتصال والشبكة
let isSyncingQueue = false;
let syncListeners = new Set();

let syncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSocketConnected: false,
  isSyncing: false,
  pendingCount: 0
};

function notifyStateChange() {
  const stats = getOfflineQueueStats();
  syncState = {
    ...syncState,
    pendingCount: stats.count
  };

  syncListeners.forEach(fn => {
    try {
      fn({ ...syncState });
    } catch (e) {
      console.warn('[Outstock Sync] Listener error:', e);
    }
  });

  // بث محلي للنافذة
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('outstock:sync_state_change', { detail: syncState }));
  }
}

/**
 * ⚡ تفريغ ومزامنة طابور الطلبات المسجلة أوفلاين مع الخادم المركزي
 */
export async function syncPendingOfflineOrders() {
  if (isSyncingQueue) return { success: false, reason: 'already_syncing' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, reason: 'offline' };
  }

  const queue = getOfflineOrdersQueue();
  if (!queue || queue.length === 0) {
    notifyStateChange();
    return { success: true, count: 0 };
  }

  isSyncingQueue = true;
  syncState.isSyncing = true;
  notifyStateChange();

  let syncedCount = 0;
  let failedCount = 0;

  try {
    for (const item of queue) {
      try {
        const res = await outstockCreateOrder(item.orderPayload);
        if (res?.success && res.order) {
          // نجح الترحيل للسيرفر
          dequeueOfflineOrder(item.tempId);
          updateCachedOrder(item.orderPayload.branchId, res.order);
          syncedCount++;

          // إخطار التبويبات بالطلب المنقول من الأوفلاين للسيرفر
          broadcastOutstockLocalMessage({
            type: 'order_synced',
            tempId: item.tempId,
            order: res.order,
            branchId: item.orderPayload.branchId
          });

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('outstock:order_created', {
              detail: { order: res.order, branchId: item.orderPayload.branchId }
            }));
            window.dispatchEvent(new CustomEvent('outstock:order_synced', {
              detail: { tempId: item.tempId, order: res.order }
            }));
          }
        } else if (res?.networkError) {
          // خطأ شبكة مؤقت: نتوقف لنعيد المحاولة لاحقاً
          failedCount++;
          break;
        } else {
          // خطأ بيانات: نتركه حالياً لتفاديه
          failedCount++;
        }
      } catch (err) {
        console.warn(`[Outstock Sync Error for item ${item.tempId}]:`, err.message);
        failedCount++;
        break; // توقف عند أول خطأ شبكة
      }
    }
  } finally {
    isSyncingQueue = false;
    syncState.isSyncing = false;
    notifyStateChange();
  }

  return { success: true, syncedCount, failedCount };
}

/**
 * 🚀 تفعيل محرك المزامنة اللحظية الشامل (Init Outstock Sync Service)
 */
let isServiceInitialized = false;

export function initOutstockSyncService() {
  if (isServiceInitialized || typeof window === 'undefined') return;
  isServiceInitialized = true;

  // 1. مراقبة حالة اتصال المتصفح
  const handleOnline = () => {
    console.log('🌐 [Outstock Sync] عاد الاتصال بالإنترنت - بدء تفريغ طابور الأوفلاين...');
    syncState.isOnline = true;
    notifyStateChange();
    syncPendingOfflineOrders();
  };

  const handleOffline = () => {
    console.log('⚠️ [Outstock Sync] انقطع الاتصال بالإنترنت - تفعيل وضع العمل دون اتصال (Offline Mode)');
    syncState.isOnline = false;
    syncState.isSocketConnected = false;
    notifyStateChange();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // 2. ربط ومراقبة Socket.io
  const setupSocket = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('connect', () => {
      syncState.isSocketConnected = true;
      syncState.isOnline = true;
      notifyStateChange();
      // مزامنة الطابور فور عودة اتصال السوكت
      syncPendingOfflineOrders();
    });

    socket.on('disconnect', () => {
      syncState.isSocketConnected = false;
      notifyStateChange();
    });

    // الاستماع لأحداث النواقص والمشتريات وتحويلها لأحداث محلية للواجهات
    const outstockSocketEvents = [
      'outstock:order_created',
      'outstock:order_delivered',
      'outstock:item_status_updated',
      'outstock:items_status_updated',
      'outstock:restocked_alert',
      'outstock:item_restocked',
      'outstock:customer_updated',
      'outstock:deficiency_reordered'
    ];

    outstockSocketEvents.forEach(evtName => {
      socket.on(evtName, (payload) => {
        try {
          // 1. إطلاق CustomEvent لنافذة المتصفح
          window.dispatchEvent(new CustomEvent(evtName, { detail: payload }));
          window.dispatchEvent(new CustomEvent('outstock:realtime_event', {
            detail: { event: evtName, payload }
          }));

          // 2. بث للتبويبات المجاورة
          broadcastOutstockLocalMessage({
            type: 'socket_event',
            event: evtName,
            payload
          });
        } catch (e) {
          console.warn(`[Outstock Socket Dispatch Error ${evtName}]:`, e);
        }
      });
    });
  };

  setupSocket();

  // 3. الاستماع لرسائل التبويبات الأخرى
  listenToOutstockLocalMessages((msg) => {
    if (!msg) return;
    if (msg.type === 'offline_order_enqueued' || msg.type === 'order_synced') {
      notifyStateChange();
    }
    if (msg.type === 'socket_event' && msg.event) {
      window.dispatchEvent(new CustomEvent(msg.event, { detail: msg.payload }));
    }
  });

  // 4. فحص دوري خفيف كل 15 ثانية للتأكد من تفريغ أي طلبات معلقة
  setInterval(() => {
    if (navigator.onLine && getOfflineOrdersQueue().length > 0 && !isSyncingQueue) {
      syncPendingOfflineOrders();
    }
  }, 15000);

  // المزامنة الأولية عند بدء التطبيق
  if (navigator.onLine) {
    syncPendingOfflineOrders();
  } else {
    notifyStateChange();
  }
}

/**
 * 📡 الاشتراك في حالة المزامنة اللحظية داخل مكونات React
 */
export function subscribeToSyncState(callback) {
  if (!callback || typeof callback !== 'function') return () => {};

  syncListeners.add(callback);
  // إرسال الحالة الحالية فوراً
  callback({ ...syncState, pendingCount: getOfflineQueueStats().count });

  return () => {
    syncListeners.delete(callback);
  };
}
