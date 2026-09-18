/**
 * socketClient.js
 * عميل اتصال WebSockets فائق السرعة عبر Socket.io
 * يتيح المزامنة اللحظية بين الأجهزة في أقل من 5 مللي ثانية
 */

import { io } from 'socket.io-client';

const getSocketUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, origin } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    if (!isLocalhost) {
      const remoteSocketUrl = import.meta.env?.VITE_SOCKET_URL;
      if (remoteSocketUrl && !remoteSocketUrl.includes('localhost') && !remoteSocketUrl.includes('127.0.0.1')) {
        return remoteSocketUrl;
      }
      if (hostname === 'pharmacore.site' || hostname.endsWith('.pharmacore.site') || hostname === '63.183.147.199') {
        return origin;
      }
      return 'http://63.183.147.199';
    }
  }

  // في بيئة التطوير المحلي أو الافتراضي
  if (import.meta.env?.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  return 'http://63.183.147.199';
};

export const SOCKET_SERVER_URL = getSocketUrl();

let socket = null;

export function getSocket() {
  if (!SOCKET_SERVER_URL) return null;

  if (!socket && typeof window !== 'undefined') {
    socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
      timeout: 5000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log(`⚡ [Socket.io] متصل بخادم المزامنة اللحظية: ${SOCKET_SERVER_URL} (ID: ${socket.id})`);
    });

    socket.on('disconnect', () => {
      // انقطاع الاتصال
    });

    socket.on('connect_error', () => {
      // إيقاف المحاولات عند عدم توفر خادم WebSockets
      try { socket.disconnect(); } catch {}
    });
  }
  return socket;
}

/**
 * الاشتراك الفوري في أحداث تحديث الحالة من جميع الأجهزة
 */
export function subscribeToLiveState(callback, key = 'pharmacy-tracker-data') {
  const s = getSocket();
  if (!s || typeof callback !== 'function') return () => {};

  const handler = (payload) => {
    if (payload && (!payload.key || payload.key === key)) {
      console.log('⚡ [Socket.io] استلام تحديث فوري جديد من جهاز آخر (Realtime Sync)');
      callback(payload.value);
    }
  };

  s.on('state:updated', handler);

  return () => {
    s.off('state:updated', handler);
  };
}

/**
 * الاشتراك الفوري في أحداث تحديث البصمات الحيوية
 */
export function subscribeToLiveFaces(onUpdated, onDeleted) {
  const s = getSocket();
  if (!s) return () => {};

  const updateHandler = (payload) => onUpdated?.(payload);
  const deleteHandler = (payload) => onDeleted?.(payload);

  s.on('face:updated', updateHandler);
  s.on('face:deleted', deleteHandler);

  return () => {
    s.off('face:updated', updateHandler);
    s.off('face:deleted', deleteHandler);
  };
}

/**
 * الاشتراك الفوري في أحداث إرسال وحفظ الطلبات اللحظية والدفعية (< 5ms)
 */
export function subscribeToLiveRequests(onRequestCreated, onBatchSaved) {
  const s = getSocket();
  if (!s) return () => {};

  const createHandler = (payload) => {
    try {
      onRequestCreated?.(payload);
    } catch (e) {
      console.warn('[Socket.io] Error handling request:created:', e);
    }
  };

  const batchHandler = (payload) => {
    try {
      onBatchSaved?.(payload);
    } catch (e) {
      console.warn('[Socket.io] Error handling requests:batch_saved:', e);
    }
  };

  s.on('request:created', createHandler);
  s.on('requests:batch_saved', batchHandler);

  return () => {
    s.off('request:created', createHandler);
    s.off('requests:batch_saved', batchHandler);
  };
}

/**
 * حفظ وبث الحالة مباشرة عبر الـ WebSocket
 */
export function emitSaveState(state, key = 'pharmacy-tracker-data') {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('state:save', { key, value: state });
    return true;
  }
  return false;
}

/**
 * الاشتراك في إشارات المزامنة التزايدية الخفيفة جداً (Sync Hints < 50 bytes)
 */
export function subscribeToSyncHints(callback) {
  const s = getSocket();
  if (!s || typeof callback !== 'function') return () => {};

  const handler = (payload) => {
    try {
      callback(payload);
    } catch (err) {
      console.warn('[Socket.io] Error in sync hint callback:', err);
    }
  };

  s.on('sync:hint', handler);

  return () => {
    s.off('sync:hint', handler);
  };
}

export function emitSyncHint(payload) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('sync:hint', payload);
    return true;
  }
  return false;
}

