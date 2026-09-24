/**
 * outstockApiClient.js
 * عميل الواجهة الأمامية لنظام النواقص والمشتريات (OutStock Handling System)
 * يتواصل مع مسارات /api/outstock/* ويدعم استرجاع وحفظ التوكن
 */

import { API_BASE_URL } from './apiClient';

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
  return await outstockRequest(`customers?${qs.toString()}`, { method: 'GET' });
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
  return await outstockRequest(`orders?${qs.toString()}`, { method: 'GET' });
}

export async function outstockCreateOrder(orderData) {
  return await outstockRequest('orders', {
    method: 'POST',
    body: JSON.stringify(orderData)
  });
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
  return await outstockRequest(`deficiencies?${qs.toString()}`, { method: 'GET' });
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
