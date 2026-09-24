/**
 * outstockOfflineStorage.js
 * طبقة التخزين المحلي والأوفلاين لنظام إدارة النواقص والمشتريات (OutStock Handling)
 * 1. دعم كامل للعمل بدون إنترنت (Offline-First) للصيدليات والكاشير
 * 2. طابور محلي ذري للطلبات المنشأة أثناء انقطاع الشبكة (Pending Offline Outbox)
 * 3. كاش فوري ذكي للطلبات والعملاء والنواقص لتسريع التحميل وتجنب الشاشات البيضاء
 * 4. قناة بث لحظي بين النوافذ والتبويبات المفتوحة (BroadcastChannel)
 */

const QUEUE_STORAGE_KEY = 'outstock_pending_orders_queue';
const CACHE_ORDERS_PREFIX = 'outstock_cache_orders_';
const CACHE_CUSTOMERS_KEY = 'outstock_cache_customers';
const CACHE_DEFICIENCIES_PREFIX = 'outstock_cache_deficiencies_';
const BROADCAST_CHANNEL_NAME = 'outstock_tab_sync_channel';

// ── 1. قناة البث المباشر بين تبويبات المتصفح (Cross-Tab BroadcastChannel) ───
let broadcastChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  }
} catch (e) {
  console.warn('[Outstock Sync] BroadcastChannel init warning:', e);
}

export function broadcastOutstockLocalMessage(message) {
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage(message);
    }
    // أيضاً نرسل CustomEvent للنافذة الحالية
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('outstock:local_broadcast', { detail: message }));
    }
  } catch (e) {
    console.warn('[Outstock Local Broadcast Warning]:', e);
  }
}

export function listenToOutstockLocalMessages(callback) {
  if (!callback || typeof callback !== 'function') return () => {};

  const handleMessage = (event) => {
    try {
      callback(event.data);
    } catch (err) {
      console.warn('[Outstock Local Broadcast Listener Error]:', err);
    }
  };

  const handleLocalEvent = (event) => {
    try {
      callback(event.detail);
    } catch (err) {
      console.warn('[Outstock Local Event Listener Error]:', err);
    }
  };

  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('outstock:local_broadcast', handleLocalEvent);
  }

  return () => {
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('outstock:local_broadcast', handleLocalEvent);
    }
  };
}

// ── 2. إدارة طابور الطلبات غير المتصلة (Offline Outbox Queue) ─────────────────

export function getOfflineOrdersQueue() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[Outstock getOfflineOrdersQueue Err]:', err);
    return [];
  }
}

export function saveOfflineOrdersQueue(queue) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.warn('[Outstock saveOfflineOrdersQueue Err]:', err);
  }
}

/**
 * حفظ طلب تم إنشاؤه في وضع الأوفلاين داخل الطابور والكاش
 * وتوليد إيصال فوري صالح للطباعة بالكاشير بدون توقف العمل
 */
export function enqueueOfflineOrder(orderPayload) {
  try {
    const queue = getOfflineOrdersQueue();
    const branchId = orderPayload.branchId || 'main';
    const cleanPhone = String(orderPayload.customer?.whatsappPhone || '').replace(/\D/g, '');
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const tempId = `ord_off_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const tempOrderNumber = `ORD-${String(branchId).slice(0, 4).toUpperCase()}-OFF-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
    const barcodeData = cleanPhone ? `${cleanPhone}-${tempOrderNumber.slice(-4)}` : tempOrderNumber;

    // بنود الأصناف
    const formattedItems = (orderPayload.items || []).map((it, idx) => {
      const qty = parseInt(it.quantity || 1, 10);
      const price = parseFloat(it.unitPrice || 0);
      const total = qty * price;
      return {
        id: `item_off_${Date.now()}_${idx}`,
        orderId: tempId,
        order_id: tempId,
        medicationName: it.medicationName,
        medication_name: it.medicationName,
        unitType: it.unitType || 'pack',
        unit_type: it.unitType || 'pack',
        quantity: qty,
        unitPrice: price,
        unit_price: price,
        totalPrice: total,
        total_price: total,
        itemStatus: 'pending',
        item_status: 'pending',
        prunedFromBill: false,
        pruned_from_bill: false
      };
    });

    const netAmount = parseFloat(orderPayload.netAmount || 0);
    const paidAmount = parseFloat(orderPayload.paidAmount || 0);
    const remainingAmount = Math.max(0, netAmount - paidAmount);

    const offlineOrder = {
      id: tempId,
      tempOfflineId: tempId,
      orderNumber: tempOrderNumber,
      order_number: tempOrderNumber,
      branchId,
      branch_id: branchId,
      customerId: orderPayload.customer?.id || `cust_off_${Date.now()}`,
      customer_id: orderPayload.customer?.id || `cust_off_${Date.now()}`,
      customerName: orderPayload.customer?.fullName,
      customer_name: orderPayload.customer?.fullName,
      customerPhone: cleanPhone,
      customer_phone: cleanPhone,
      customerAddress: orderPayload.customer?.address || '',
      customer_address: orderPayload.customer?.address || '',
      totalAmount: parseFloat(orderPayload.totalAmount || 0),
      total_amount: parseFloat(orderPayload.totalAmount || 0),
      paidAmount,
      paid_amount: paidAmount,
      remainingAmount,
      remaining_amount: remainingAmount,
      netAmount,
      net_amount: netAmount,
      discountType: orderPayload.discountType || 'none',
      discount_type: orderPayload.discountType || 'none',
      discountValue: parseFloat(orderPayload.discountValue || 0),
      discount_value: parseFloat(orderPayload.discountValue || 0),
      orderStatus: 'pending_procurement',
      order_status: 'pending_procurement',
      expectedPickupDate: orderPayload.expectedPickupDate,
      expected_pickup_date: orderPayload.expectedPickupDate,
      expectedPickupTime: orderPayload.expectedPickupTime,
      expected_pickup_time: orderPayload.expectedPickupTime,
      responsiblePharmacist: orderPayload.responsiblePharmacist || 'الصيدلي',
      responsible_pharmacist: orderPayload.responsiblePharmacist || 'الصيدلي',
      customerNotes: orderPayload.customerNotes || null,
      customer_notes: orderPayload.customerNotes || null,
      barcodeData,
      barcode_data: barcodeData,
      items: formattedItems,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      is_offline_pending: true // علامة مميزة للأوفلاين
    };

    // حفظ في طابور الترحيل
    queue.push({
      tempId,
      orderPayload,
      offlineOrder,
      enqueuedAt: Date.now()
    });
    saveOfflineOrdersQueue(queue);

    // إضافة للكاش المحلي لفرع الصيدلية فوراً حتى يظهر في القائمة
    addOrderToLocalCache(branchId, offlineOrder);

    // إشعار التطبيق محلياً
    broadcastOutstockLocalMessage({
      type: 'offline_order_enqueued',
      branchId,
      order: offlineOrder
    });

    return offlineOrder;
  } catch (err) {
    console.error('[Outstock enqueueOfflineOrder Error]:', err);
    throw err;
  }
}

export function dequeueOfflineOrder(tempId) {
  try {
    const queue = getOfflineOrdersQueue();
    const nextQueue = queue.filter(item => item.tempId !== tempId);
    saveOfflineOrdersQueue(nextQueue);
  } catch (err) {
    console.warn('[Outstock dequeueOfflineOrder Err]:', err);
  }
}

export function getOfflineQueueStats() {
  const queue = getOfflineOrdersQueue();
  const count = queue.length;
  const pendingAmount = queue.reduce((sum, item) => sum + (parseFloat(item.offlineOrder?.netAmount || 0)), 0);
  return { count, pendingAmount };
}

// ── 3. كاش الطلبات المحلي (Local Orders Cache) ──────────────────────────────

export function cacheOrders(branchId, orders) {
  try {
    if (typeof localStorage === 'undefined' || !branchId) return;
    const key = `${CACHE_ORDERS_PREFIX}${branchId}`;
    localStorage.setItem(key, JSON.stringify({
      orders: orders || [],
      cachedAt: Date.now()
    }));
  } catch (err) {
    console.warn('[Outstock cacheOrders Err]:', err);
  }
}

export function getCachedOrders(branchId) {
  try {
    if (typeof localStorage === 'undefined' || !branchId) return [];
    const key = `${CACHE_ORDERS_PREFIX}${branchId}`;
    const raw = localStorage.getItem(key);
    let serverOrders = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.orders)) {
        serverOrders = parsed.orders;
      }
    }

    // دمج الطلبات المحفوظة أوفلاين التي لم ترحل بعد حتى تظهر أعلى القائمة
    const queue = getOfflineOrdersQueue();
    const offlineForBranch = queue
      .filter(q => String(q.offlineOrder?.branchId || q.offlineOrder?.branch_id) === String(branchId))
      .map(q => q.offlineOrder);

    // استبعاد التكرار إن وُجد
    const offlineIds = new Set(offlineForBranch.map(o => o.id));
    const cleanServer = serverOrders.filter(o => !offlineIds.has(o.id));

    return [...offlineForBranch, ...cleanServer];
  } catch (err) {
    console.warn('[Outstock getCachedOrders Err]:', err);
    return [];
  }
}

export function addOrderToLocalCache(branchId, order) {
  try {
    const existing = getCachedOrders(branchId);
    const filtered = existing.filter(o => o.id !== order.id);
    const updated = [order, ...filtered];
    cacheOrders(branchId, updated);
  } catch (err) {
    console.warn('[Outstock addOrderToLocalCache Err]:', err);
  }
}

export function updateCachedOrder(branchId, updatedOrder) {
  try {
    const existing = getCachedOrders(branchId);
    const updated = existing.map(o => {
      if (o.id === updatedOrder.id || (updatedOrder.tempOfflineId && o.id === updatedOrder.tempOfflineId)) {
        return { ...o, ...updatedOrder, is_offline_pending: false };
      }
      return o;
    });
    cacheOrders(branchId, updated);
  } catch (err) {
    console.warn('[Outstock updateCachedOrder Err]:', err);
  }
}

// ── 4. كاش العملاء المحلي (Local Customers Cache) ───────────────────────────

export function cacheCustomers(customers) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_CUSTOMERS_KEY, JSON.stringify({
      customers: customers || [],
      cachedAt: Date.now()
    }));
  } catch (err) {
    console.warn('[Outstock cacheCustomers Err]:', err);
  }
}

export function getCachedCustomers() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CACHE_CUSTOMERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.customers) ? parsed.customers : [];
  } catch (err) {
    return [];
  }
}

// ── 5. كاش النواقص المحلي (Local Deficiencies Cache) ────────────────────────

export function cacheDeficiencies(branchId, deficiencies) {
  try {
    if (typeof localStorage === 'undefined' || !branchId) return;
    const key = `${CACHE_DEFICIENCIES_PREFIX}${branchId}`;
    localStorage.setItem(key, JSON.stringify({
      deficiencies: deficiencies || [],
      cachedAt: Date.now()
    }));
  } catch (err) {
    console.warn('[Outstock cacheDeficiencies Err]:', err);
  }
}

export function getCachedDeficiencies(branchId) {
  try {
    if (typeof localStorage === 'undefined' || !branchId) return [];
    const key = `${CACHE_DEFICIENCIES_PREFIX}${branchId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.deficiencies) ? parsed.deficiencies : [];
  } catch (err) {
    return [];
  }
}
