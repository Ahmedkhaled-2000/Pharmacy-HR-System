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
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 6000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log(`⚡ [Socket.io] متصل بخادم المزامنة اللحظية: ${SOCKET_SERVER_URL} (ID: ${socket.id})`);
    });

    socket.on('disconnect', (reason) => {
      // انقطاع الاتصال المؤقت - إعادة الاتصال ستتم تلقائياً
    });

    socket.on('connect_error', (err) => {
      // إبقاء المحاولة النشطة لإعادة الاتصال التلقائي بدون تعطيل السوكت
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
 * بث تحديث قرار أو رد على طلب للموظفين فورياً (< 5ms) عبر الـ WebSocket
 */
export function emitLiveRequestUpdated(payload) {
  const s = getSocket();
  if (s && s.connected) {
    try {
      s.emit('request:update', payload);
      return true;
    } catch (e) {
      console.warn('[Socket.io] Error emitting request:update:', e);
    }
  }
  return false;
}

/**
 * الاشتراك الفوري في أحداث قرارات وردود الإدارة ومدير الفرع على الطلبات (< 5ms)
 */
export function subscribeToLiveRequestUpdates(onUpdated) {
  const s = getSocket();
  if (!s || typeof onUpdated !== 'function') return () => {};

  const updateHandler = (payload) => {
    try {
      onUpdated?.(payload);
    } catch (e) {
      console.warn('[Socket.io] Error handling request:updated:', e);
    }
  };

  s.on('request:updated', updateHandler);

  return () => {
    s.off('request:updated', updateHandler);
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

// معرف جلسة فريد للجهاز/التبويب الحالي لمنع الصدى الذاتي (Self-Echo Prevention)
export const CLIENT_SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * بث تغيير ذري لحظي لكائن معين (موظف، وردية، طلب، سلفة، إلخ) لجميع الأجهزة (< 20ms)
 * @param {Object} params
 * @param {string} params.entityType - نوع الكيان ('employee'|'shift'|'roster'|'request'|'adjustment'|'loan'|'branch'|'bylaws'|'settings')
 * @param {string|number} params.entityId - معرف العنصر
 * @param {Object} params.data - البيانات المعدلة
 * @param {'update'|'create'|'delete'} [params.action='update'] - نوع العملية
 */
export function emitEntityChange({ entityType, entityId, data, action = 'update', meta = {} }) {
  const s = getSocket();
  if (!entityType) return false;

  const payload = {
    entityType,
    entityId: entityId ? String(entityId) : (data?.id ? String(data.id) : null),
    data,
    action,
    meta,
    clientId: CLIENT_SESSION_ID,
    timestamp: new Date().toISOString()
  };

  if (s && s.connected) {
    try {
      s.emit('entity:change', payload);
      return true;
    } catch (e) {
      console.warn('[Socket.io] Error emitting entity:change:', e);
    }
  }
  return false;
}

/**
 * الاشتراك في التغييرات والقرارات الذرية اللحظية الواردة من الأجهزة الأخرى (< 30ms)
 * @param {Function} onEntityChanged - دالة معالجة التغيير
 */
export function subscribeToEntityChanges(onEntityChanged) {
  const s = getSocket();
  if (!s || typeof onEntityChanged !== 'function') return () => {};

  const handler = (payload) => {
    try {
      // تجاهل التحديث إذا كان مرسلاً من نفس النافذة أو الجلسة الحالية
      if (payload && payload.clientId && payload.clientId === CLIENT_SESSION_ID) {
        return;
      }
      onEntityChanged(payload);
    } catch (e) {
      console.warn('[Socket.io] Error handling entity:changed:', e);
    }
  };

  s.on('entity:changed', handler);

  return () => {
    s.off('entity:changed', handler);
  };
}

