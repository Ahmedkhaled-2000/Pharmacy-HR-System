/**
 * outstockApiClient.js
 * عميل الواجهة الأمامية لنظام النواقص والمشتريات (OutStock Handling System)
 * يتواصل مع مسارات /api/outstock/* ويدعم استرجاع وحفظ التوكن
 */

import { API_BASE_URL } from './apiClient';
import {
  enqueueOfflineOrder,
  cacheOrders,
  getCachedOrders,
  cacheCustomers,
  getCachedCustomers,
  cacheDeficiencies,
  getCachedDeficiencies
} from './outstockOfflineStorage';

export function getOutstockToken() {
  try {
    return localStorage.getItem('outstock_token') || localStorage.getItem('app_auth_token') || '';
  } catch {
    return '';
  }
}

export function setOutstockToken(token) {
  try {
    if (token) localStorage.setItem('outstock_token', token);
    else localStorage.removeItem('outstock_token');
  } catch {}
}

async function outstockRequest(endpoint, options = {}) {
  const token = getOutstockToken();
  const url = `${API_BASE_URL}/outstock/${endpoint.replace(/^\/+/, '')}`;

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store'
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errorMsg = data?.error || `خطأ في الخادم (${res.status})`;
      return { success: false, error: errorMsg, status: res.status };
    }

    return data || { success: true };
  } catch (err) {
    console.warn('[OutstockApiClient Error]:', err.message);
    return { success: false, error: 'تعذر الاتصال بالخادم، يرجى التحقق من الشبكة', networkError: true };
  }
}

// ── 1. المصادقة ─────────────────────────────────────────────────────────────
export async function outstockLogin(username, password) {
  const res = await outstockRequest('login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  if (res?.success && res?.token) {
    setOutstockToken(res.token);
  }
  return res;
}

export async function outstockGetMe() {
  return await outstockRequest('me', { method: 'GET' });
}

export async function outstockChangePassword(oldPassword, newPassword) {
  return await outstockRequest('change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}

// ── 2. الفروع ────────────────────────────────────────────────────────────────
export async function outstockGetBranches() {
  return await outstockRequest('branches', { method: 'GET' });
}

export async function outstockSaveBranch(branchData) {
  return await outstockRequest('branches', {
    method: 'POST',
    body: JSON.stringify(branchData)
  });
}

// ── 3. المستخدمين ───────────────────────────────────────────────────────────
export async function outstockGetUsers() {
  return await outstockRequest('users', { method: 'GET' });
}

export async function outstockSaveUser(userData) {
  return await outstockRequest('users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

// ── 4. العملاء ──────────────────────────────────────────────────────────────
export async function outstockGetCustomers(params = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.append('search', params.search);
  if (params.branchId) qs.append('branchId', params.branchId);

  const res = await outstockRequest(`customers?${qs.toString()}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.customers)) {
    cacheCustomers(res.customers);
    return res;
  }

  // دعم الأوفلاين: استرجاع من الكاش المحلي
  if (res?.networkError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    const cached = getCachedCustomers();
    if (cached && cached.length > 0) {
      let filtered = cached;
      if (params.search) {
        const s = String(params.search).toLowerCase().trim();
        filtered = filtered.filter(c =>
          (c.full_name && c.full_name.toLowerCase().includes(s)) ||
          (c.whatsapp_phone && c.whatsapp_phone.includes(s)) ||
          (c.customer_code && c.customer_code.toLowerCase().includes(s))
        );
      }
      return { success: true, customers: filtered, isFromCache: true };
    }
  }

  return res;
}

export async function outstockGetCustomerHistory(customerId) {
  return await outstockRequest(`customers/${customerId}/history`, { method: 'GET' });
}

export async function outstockSaveCustomer(customerData) {
  return await outstockRequest('customers', {
    method: 'POST',
    body: JSON.stringify(customerData)
  });
}

// ── 5. طلبات العملاء ────────────────────────────────────────────────────────
export async function outstockGetOrders(params = {}) {
  const qs = new URLSearchParams();
  if (params.branchId) qs.append('branchId', params.branchId);
  if (params.status) qs.append('status', params.status);
  if (params.search) qs.append('search', params.search);
  if (params.limit) qs.append('limit', String(params.limit));

  const res = await outstockRequest(`orders?${qs.toString()}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.orders)) {
    if (params.branchId) {
      cacheOrders(params.branchId, res.orders);
      return { success: true, orders: getCachedOrders(params.branchId) };
    }
    return res;
  }

  // استرجاع الكاش المحلي فورا عند انقطاع الشبكة مع دمج طلبات الأوفلاين
  if (params.branchId && (res?.networkError || (typeof navigator !== 'undefined' && !navigator.onLine))) {
    const cached = getCachedOrders(params.branchId);
    if (cached && cached.length > 0) {
      let filtered = cached;
      if (params.status === 'active') {
        filtered = filtered.filter(o => {
          const st = o.order_status || o.orderStatus;
          return st !== 'delivered' && st !== 'cancelled';
        });
      }
      if (params.search) {
        const s = String(params.search).toLowerCase().trim();
        filtered = filtered.filter(o =>
          (o.order_number && o.order_number.toLowerCase().includes(s)) ||
          (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
          (o.customer_phone && o.customer_phone.includes(s)) ||
          (o.barcode_data && o.barcode_data.includes(s))
        );
      }
      return { success: true, orders: filtered, isFromCache: true };
    }
  }

  return res;
}

export async function outstockCreateOrder(orderData) {
  // إذا كان الجهاز في وضع عدم الاتصال حالياً، يتم الحفظ في طابور الأوفلاين مباشرة
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      const offlineOrder = enqueueOfflineOrder(orderData);
      return {
        success: true,
        order: offlineOrder,
        isOffline: true,
        message: 'تم حفظ الطلب محلياً بنجاح (وضع عدم الاتصال)، وسيتم مزامنته تلقائياً فور عودة الاتصال'
      };
    } catch (e) {
      return { success: false, error: 'تعذر الحفظ محلياً: ' + e.message };
    }
  }

  const res = await outstockRequest('orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });

  // إذا فشل الطلب بسبب انقطاع مفاجئ في الشبكة، نحفظه كأوفلاين بدون خسارة بيانات العميل
  if (res?.networkError) {
    try {
      const offlineOrder = enqueueOfflineOrder(orderData);
      return {
        success: true,
        order: offlineOrder,
        isOffline: true,
        message: 'تعذر الوصول للخادم - تم حفظ الطلب محلياً بنجاح وسيتم إرساله تلقائياً فور توفر الشبكة'
      };
    } catch (e) {
      return res;
    }
  }

  return res;
}

export async function outstockDeliverOrder(orderId) {
  return await outstockRequest(`orders/${orderId}/deliver`, {
    method: 'POST'
  });
}

export async function outstockMarkWhatsappNotified(orderId) {
  return await outstockRequest(`orders/${orderId}/whatsapp`, {
    method: 'POST'
  });
}

// ── 6. إدارة المشتريات ──────────────────────────────────────────────────────
export async function outstockGetProcurementAggregated() {
  return await outstockRequest('procurement/aggregated', { method: 'GET' });
}

export async function outstockProcurementItemAction(payload) {
  return await outstockRequest('procurement/item-action', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function outstockGetProcurementTracking() {
  return await outstockRequest('procurement/delivery-tracking', { method: 'GET' });
}

export async function outstockGetUnavailableItems() {
  return await outstockRequest('procurement/unavailable-items', { method: 'GET' });
}

export async function outstockNotifyRestocked(payload) {
  return await outstockRequest('procurement/notify-restocked', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// ── 7. أدوية النواقص والرصيد ────────────────────────────────────────────────
export async function outstockGetDeficiencies(params = {}) {
  const qs = new URLSearchParams();
  if (params.branchId) qs.append('branchId', params.branchId);
  if (params.search) qs.append('search', params.search);

  const res = await outstockRequest(`deficiencies?${qs.toString()}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.deficiencies)) {
    if (params.branchId) cacheDeficiencies(params.branchId, res.deficiencies);
    return res;
  }

  // دعم الأوفلاين للنواقص
  if (params.branchId && (res?.networkError || (typeof navigator !== 'undefined' && !navigator.onLine))) {
    const cached = getCachedDeficiencies(params.branchId);
    if (cached && cached.length > 0) {
      let filtered = cached;
      if (params.search) {
        const s = String(params.search).toLowerCase().trim();
        filtered = filtered.filter(d =>
          (d.medication_name && d.medication_name.toLowerCase().includes(s))
        );
      }
      return { success: true, deficiencies: filtered, isFromCache: true };
    }
  }

  return res;
}

export async function outstockReorderDeficiency(deficiencyId, responsiblePharmacist) {
  return await outstockRequest('deficiencies/reorder', {
    method: 'POST',
    body: JSON.stringify({ deficiencyId, responsiblePharmacist })
  });
}

export async function outstockGetBranchStock(branchId = '') {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  return await outstockRequest(`branch-stock${qs}`, { method: 'GET' });
}

// ── 8. لوحة المالك ──────────────────────────────────────────────────────────
export async function outstockGetOwnerOverview() {
  return await outstockRequest('owner/overview', { method: 'GET' });
}
