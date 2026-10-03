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

// ── 2.1 موظفو الفروع ────────────────────────────────────────────────────────
export async function outstockGetEmployees(branchId = '') {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
  const res = await outstockRequest(`employees${qs}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.employees)) {
    try {
      localStorage.setItem(`outstock_cached_employees_${branchId || 'all'}`, JSON.stringify(res.employees));
    } catch {}
    return res;
  }
  try {
    const cached = localStorage.getItem(`outstock_cached_employees_${branchId || 'all'}`) || localStorage.getItem('outstock_cached_employees_all');
    if (cached) {
      return { success: true, employees: JSON.parse(cached), isFromCache: true };
    }
  } catch {}
  return res || { success: false, employees: [] };
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
  if (params.orderType) qs.append('orderType', params.orderType);
  if (params.search) qs.append('search', params.search);
  if (params.dateFrom) qs.append('dateFrom', params.dateFrom);
  if (params.dateTo) qs.append('dateTo', params.dateTo);
  if (params.limit) qs.append('limit', String(params.limit));
  if (params.transferredOnly) qs.append('transferredOnly', String(params.transferredOnly));
  if (params.transferDirection) qs.append('transferDirection', params.transferDirection);

  const res = await outstockRequest(`orders?${qs.toString()}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.orders)) {
    if (params.branchId && !params.orderType && !params.dateFrom && !params.transferredOnly) {
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
      if (params.orderType) {
        filtered = filtered.filter(o => (o.order_type || o.orderType || 'customer') === params.orderType);
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

export async function outstockGetTransferredOrders(params = {}) {
  return outstockGetOrders({
    ...params,
    transferredOnly: true
  });
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

export async function outstockDeliverOrder(orderId, settlementData = {}) {
  return await outstockRequest(`orders/${orderId}/deliver`, {
    method: 'POST',
    body: JSON.stringify(settlementData)
  });
}

export const outstockSettleAndDeliverOrder = outstockDeliverOrder;

export async function outstockMarkWhatsappNotified(orderId) {
  return await outstockRequest(`orders/${orderId}/whatsapp`, {
    method: 'POST'
  });
}

// ── 6. إدارة المشتريات ──────────────────────────────────────────────────────
export async function outstockGetProcurementAggregated(params = {}) {
  const qs = new URLSearchParams();
  if (params.category || params.itemType) qs.append('category', params.category || params.itemType);
  if (params.branchId) qs.append('branchId', params.branchId);
  return await outstockRequest(`procurement/aggregated?${qs.toString()}`, { method: 'GET' });
}

export async function outstockProcurementItemAction(payload) {
  return await outstockRequest('procurement/item-action', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function outstockGetProcurementTracking(params = {}) {
  const qs = new URLSearchParams();
  if (params.branchId) qs.append('branchId', params.branchId);
  if (params.status) qs.append('status', params.status);
  if (params.category || params.itemType) qs.append('category', params.category || params.itemType);
  if (params.dateFrom) qs.append('dateFrom', params.dateFrom);
  if (params.dateTo) qs.append('dateTo', params.dateTo);
  return await outstockRequest(`procurement/delivery-tracking?${qs.toString()}`, { method: 'GET' });
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

export async function outstockAddManualUnavailableItem(payload) {
  return await outstockRequest('procurement/unavailable-items', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function outstockImportUnavailableItems(payload) {
  return await outstockRequest('procurement/unavailable-items/import', {
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

// ── 9. كتالوج أدوية هيئة الدواء المصرية ودراج آي (EDA & Drug Eye Catalog) ───
export async function outstockSearchMedications(term, limit = 15) {
  const clean = String(term || '').trim();
  if (!clean || clean.length < 2) return { success: true, medications: [] };

  const qs = new URLSearchParams({ q: clean, limit: String(limit) });
  const res = await outstockRequest(`medications/search?${qs.toString()}`, { method: 'GET' });
  if (res?.success && Array.isArray(res.medications)) {
    return res;
  }
  return { success: false, medications: [], error: res?.error || 'فشل البحث في كتالوج الأدوية' };
}

export async function outstockGetSubstitutes(genericName, excludeId = null) {
  if (!genericName) return { success: true, substitutes: [] };
  const qs = new URLSearchParams({ generic: genericName });
  if (excludeId) qs.append('excludeId', excludeId);

  return await outstockRequest(`medications/substitutes?${qs.toString()}`, { method: 'GET' });
}

export async function outstockSyncMedications(medications, source) {
  return await outstockRequest('medications/sync', {
    method: 'POST',
    body: JSON.stringify({ medications, source })
  });
}

export async function outstockGetMedicationStats() {
  return await outstockRequest('medications/stats', { method: 'GET' });
}

export async function outstockUpdateMedicationPrice({ medicationId, newPublicPrice, packSize, reason, decreeNumber }) {
  return await outstockRequest('medications/update-price', {
    method: 'POST',
    body: JSON.stringify({ medicationId, newPublicPrice, packSize, reason, decreeNumber })
  });
}

export async function outstockBulkUpdatePrices({ items, source, decreeNumber }) {
  return await outstockRequest('medications/bulk-price-update', {
    method: 'POST',
    body: JSON.stringify({ items, source, decreeNumber })
  });
}

export async function outstockSyncCloudCatalog() {
  return await outstockRequest('medications/sync-cloud', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function outstockGetPriceAuditLogs({ page = 1, limit = 50, search = '' } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) qs.append('search', search);
  return await outstockRequest(`medications/price-audit-logs?${qs.toString()}`, { method: 'GET' });
}

// ── 10. إعدادات وهوية الصيدلية والشعار بالفاتورة ─────────────────────────────
export async function outstockGetSettings() {
  const res = await outstockRequest('settings', { method: 'GET' });
  if (res?.success && res.settings) {
    try {
      localStorage.setItem('outstock_general_settings', JSON.stringify(res.settings));
    } catch {}
    return res;
  }

  // دعم استرجاع الإعدادات من التخزين المحلي في حال عدم توفر الاتصال
  try {
    const cached = localStorage.getItem('outstock_general_settings');
    if (cached) {
      return { success: true, settings: JSON.parse(cached), isFromCache: true };
    }
  } catch {}

  return res;
}

export async function outstockSaveSettings(settingsData) {
  const res = await outstockRequest('settings', {
    method: 'POST',
    body: JSON.stringify(settingsData)
  });

  if (res?.success && res.settings) {
    try {
      localStorage.setItem('outstock_general_settings', JSON.stringify(res.settings));
    } catch {}
  }

  return res;
}

// ── 11. كارتة الصنف، إضافة وتعديل الأدوية والتقارير المالية ──────────────
export async function outstockGetMedicationMasterCard(medicationId) {
  return await outstockRequest(`medications/${medicationId}/master-card`, { method: 'GET' });
}

export async function outstockAddNewMedication(medicationData) {
  return await outstockRequest('medications', {
    method: 'POST',
    body: JSON.stringify(medicationData)
  });
}

export async function outstockDeleteMedication(medicationId) {
  return await outstockRequest(`medications/${medicationId}`, {
    method: 'DELETE'
  });
}

export async function outstockUpdateMedicationDetails(medicationId, updateData) {
  return await outstockRequest(`medications/${medicationId}`, {
    method: 'PUT',
    body: JSON.stringify(updateData)
  });
}

export async function outstockGetFinancialReports({ branchId, fromDate, toDate } = {}) {
  const qs = new URLSearchParams();
  if (branchId) qs.append('branchId', branchId);
  if (fromDate) qs.append('fromDate', fromDate);
  if (toDate) qs.append('toDate', toDate);
  return await outstockRequest(`reports/financial?${qs.toString()}`, { method: 'GET' });
}

// ── 12. التحقق من كود الموظف السري (طلب العميل وتسليم الطلب) ───────────────────
export async function outstockVerifyEmployeeCode(code) {
  return await outstockRequest('verify-employee-code', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
}

// ── 13. البحث عن المواد الفعالة ──────────────────────────────────────────────
export async function outstockSearchActiveIngredients(query, limit = 30) {
  const qs = new URLSearchParams({ query: query || '', limit: String(limit) });
  return await outstockRequest(`active-ingredients?${qs.toString()}`, { method: 'GET' });
}

// ── 14. فريق المشتريات وصلاحيات الأعضاء ───────────────────────────────────────
export async function outstockGetProcurementTeam() {
  return await outstockRequest('procurement-team', { method: 'GET' });
}

export async function outstockAddProcurementTeamMember(userData) {
  return await outstockRequest('procurement-team', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

export async function outstockUpdateProcurementTeamMember(id, userData) {
  return await outstockRequest(`procurement-team/${id}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  });
}

export async function outstockDeleteProcurementTeamMember(id) {
  return await outstockRequest(`procurement-team/${id}`, { method: 'DELETE' });
}

export async function outstockUpdateProcurementManagerProfile(profileData) {
  return await outstockRequest('procurement-manager/profile', {
    method: 'POST',
    body: JSON.stringify(profileData)
  });
}

// ── 15. صلاحيات الفروع (تعديل الأسعار والخصومات) ─────────────────────────────
export async function outstockGetBranchPermissions() {
  return await outstockRequest('settings/branch-permissions', { method: 'GET' });
}

export async function outstockSaveBranchPermissions(permissions) {
  return await outstockRequest('settings/branch-permissions', {
    method: 'POST',
    body: JSON.stringify(permissions)
  });
}

// ── 16. طلبات الاستعلام وتعديل وإضافة الأصناف ────────────────────────────────
export async function outstockGetMedicationRequests(params = {}) {
  const qs = new URLSearchParams();
  if (params.branchId) qs.append('branchId', params.branchId);
  if (params.status) qs.append('status', params.status);
  if (params.requestType) qs.append('requestType', params.requestType);
  return await outstockRequest(`medication-requests?${qs.toString()}`, { method: 'GET' });
}

export async function outstockCreateMedicationRequest(requestData) {
  return await outstockRequest('medication-requests', {
    method: 'POST',
    body: JSON.stringify(requestData)
  });
}

export async function outstockReplyMedicationRequest(id, replyData) {
  return await outstockRequest(`medication-requests/${id}/reply`, {
    method: 'PUT',
    body: JSON.stringify(replyData)
  });
}

export async function outstockApproveNewItemRequest(id, medicationData) {
  return await outstockRequest(`medication-requests/${id}/approve-new-item`, {
    method: 'POST',
    body: JSON.stringify({ medicationData })
  });
}

// ── 17. الموردين وحسابات الأجل ────────────────────────────────────────────────
export async function outstockGetSuppliers(params = {}) {
  const qs = new URLSearchParams();
  if (params?.month) qs.append('month', params.month);
  const qStr = qs.toString() ? `?${qs.toString()}` : '';
  return await outstockRequest(`suppliers${qStr}`, { method: 'GET' });
}

export async function outstockRolloverSupplierLimits({ targetMonth, previousMonth, supplierId } = {}) {
  return await outstockRequest('suppliers/rollover-credit-limits', {
    method: 'POST',
    body: JSON.stringify({ targetMonth, previousMonth, supplierId })
  });
}

export async function outstockSaveSupplierMonthlyLimit(supplierId, limitData) {
  return await outstockRequest(`suppliers/${supplierId}/monthly-limit`, {
    method: 'PUT',
    body: JSON.stringify(limitData)
  });
}

export async function outstockSaveSupplier(supplierData) {
  return await outstockRequest('suppliers', {
    method: 'POST',
    body: JSON.stringify(supplierData)
  });
}

export async function outstockUpdateSupplier(id, supplierData) {
  return await outstockRequest(`suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(supplierData)
  });
}

export async function outstockDeleteSupplier(id) {
  return await outstockRequest(`suppliers/${id}`, { method: 'DELETE' });
}

export async function outstockGetSupplierWithdrawals(supplierId, params = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.append('search', params.search);
  if (params.month) qs.append('month', params.month);
  return await outstockRequest(`suppliers/${supplierId}/withdrawals?${qs.toString()}`, { method: 'GET' });
}

export async function outstockAddSupplierWithdrawal(supplierId, withdrawalData) {
  return await outstockRequest(`suppliers/${supplierId}/withdrawals`, {
    method: 'POST',
    body: JSON.stringify(withdrawalData)
  });
}

export async function outstockSettleSupplierClaim(supplierId, paymentData) {
  return await outstockRequest(`suppliers/${supplierId}/settle`, {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });
}

export async function outstockGetSupplierPayments(supplierId) {
  return await outstockRequest(`suppliers/${supplierId}/payments`, { method: 'GET' });
}

// ── 18. فواتير الموردين والربط مع Google Drive ────────────────────────────────
export async function outstockGetSupplierInvoices(params = {}) {
  const qs = new URLSearchParams();
  if (params.supplierId) qs.append('supplierId', params.supplierId);
  if (params.dateFrom) qs.append('dateFrom', params.dateFrom);
  if (params.dateTo) qs.append('dateTo', params.dateTo);
  if (params.paymentStatus) qs.append('paymentStatus', params.paymentStatus);
  if (params.search) qs.append('search', params.search);
  if (params.limit) qs.append('limit', String(params.limit));
  return await outstockRequest(`supplier-invoices?${qs.toString()}`, { method: 'GET' });
}

export async function outstockGetSupplierInvoiceDetails(id) {
  return await outstockRequest(`supplier-invoices/${id}`, { method: 'GET' });
}

export async function outstockSaveSupplierInvoice(invoiceData) {
  return await outstockRequest('supplier-invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData)
  });
}

export async function outstockUpdateSupplierInvoice(id, invoiceData) {
  return await outstockRequest(`supplier-invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(invoiceData)
  });
}

export async function outstockUploadInvoiceToDrive(data) {
  return await outstockRequest('supplier-invoices/upload-drive', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

// ── 19. مسحوبات الفروع الشهرية ────────────────────────────────────────────────
export async function outstockGetBranchWithdrawals(params = {}) {
  const qs = new URLSearchParams();
  if (params.monthPeriod) qs.append('monthPeriod', params.monthPeriod);
  if (params.branchId) qs.append('branchId', params.branchId);
  return await outstockRequest(`branch-withdrawals?${qs.toString()}`, { method: 'GET' });
}

export async function outstockSaveBranchWithdrawal(withdrawalData) {
  return await outstockRequest('branch-withdrawals', {
    method: 'POST',
    body: JSON.stringify(withdrawalData)
  });
}

export async function outstockUpdateBranchWithdrawal(id, withdrawalData) {
  return await outstockRequest(`branch-withdrawals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(withdrawalData)
  });
}

export async function outstockDeleteBranchWithdrawal(id) {
  return await outstockRequest(`branch-withdrawals/${id}`, {
    method: 'DELETE'
  });
}

// ── 20. مقارنة خصومات الموردين المستخرجة من الفواتير ─────────────────────────
export async function outstockGetSupplierDiscountsComparison({ limit = 25, search = '' } = {}) {
  const qs = new URLSearchParams();
  if (limit) qs.append('limit', String(limit));
  if (search) qs.append('search', search);
  return await outstockRequest(`suppliers/discounts-comparison?${qs.toString()}`, { method: 'GET' });
}

// ── 21. بوابة الصيدلية المستقلة لمنصة i'SUPPLY ─────────────────────────────────
export async function outstockGetISupplyStatus() {
  return await outstockRequest('isupply/status', { method: 'GET' });
}

export async function outstockSaveISupplyConfig(configData) {
  return await outstockRequest('isupply/config', {
    method: 'POST',
    body: JSON.stringify(configData)
  });
}

export async function outstockTestISupplySession(credentials) {
  return await outstockRequest('isupply/test-session', {
    method: 'POST',
    body: JSON.stringify(credentials || {})
  });
}

export async function outstockSyncISupplyNow() {
  return await outstockRequest('isupply/sync-now', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export async function outstockGetISupplyFeeds(params = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.append('search', params.search);
  if (params.warehouse) qs.append('warehouse', params.warehouse);
  if (params.stockStatus) qs.append('stockStatus', params.stockStatus);
  if (params.minDiscount) qs.append('minDiscount', String(params.minDiscount));
  return await outstockRequest(`isupply/feeds?${qs.toString()}`, { method: 'GET' });
}

export async function outstockClearISupplySession() {
  return await outstockRequest('isupply/clear', {
    method: 'POST',
    body: JSON.stringify({})
  });
}

// ── 22. ملخص الإشعارات والعدادات الحية ─────────────────────────────────────────
export async function outstockGetNotificationsSummary(branchId = '') {
  const qs = new URLSearchParams();
  if (branchId) {
    qs.append('branch_id', branchId);
    qs.append('branchId', branchId);
  }
  return await outstockRequest(`notifications/summary?${qs.toString()}`, { method: 'GET' });
}

// ── 23. استلام الطلبيات من الموردين (Order Receipts Management) ─────────────────
export async function outstockSaveOrderReceipt(receiptData) {
  return await outstockRequest('order-receipts', {
    method: 'POST',
    body: JSON.stringify(receiptData)
  });
}

export async function outstockGetSupplierOrderReceiptsSummary() {
  return await outstockRequest('order-receipts/supplier-summary', { method: 'GET' });
}

export async function outstockGetOrderReceipts(params = {}) {
  const qs = new URLSearchParams();
  if (params.supplierId) qs.append('supplierId', params.supplierId);
  if (params.search) qs.append('search', params.search);
  if (params.medicationName) qs.append('medicationName', params.medicationName);
  if (params.barcode) qs.append('barcode', params.barcode);
  if (params.invoiceNumber) qs.append('invoiceNumber', params.invoiceNumber);
  if (params.employeeCode) qs.append('employeeCode', params.employeeCode);
  if (params.dateFrom) qs.append('dateFrom', params.dateFrom);
  if (params.dateTo) qs.append('dateTo', params.dateTo);
  if (params.limit) qs.append('limit', String(params.limit));
  return await outstockRequest(`order-receipts?${qs.toString()}`, { method: 'GET' });
}

export async function outstockGetOrderReceiptDetails(id) {
  return await outstockRequest(`order-receipts/${id}`, { method: 'GET' });
}

export async function outstockDeleteOrderReceipt(id) {
  return await outstockRequest(`order-receipts/${id}`, { method: 'DELETE' });
}

export async function outstockUpdateOrderReceipt(id, receiptData) {
  return await outstockRequest(`order-receipts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(receiptData)
  });
}

export async function outstockGetMedicationByBarcode(barcode) {
  return await outstockRequest(`medications/barcode/${encodeURIComponent(barcode)}`, {
    method: 'GET'
  });
}

// ── 24. المزامنة اللحظية بين النوافذ والتبويبات (Instant Cross-Tab Sync) ─────────
const OUTSTOCK_SYNC_CHANNEL_NAME = 'outstock_realtime_sync_channel';

export function broadcastOutstockLocalMessage(payload) {
  try {
    if (typeof window !== 'undefined') {
      // 1. BroadcastChannel API
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel(OUTSTOCK_SYNC_CHANNEL_NAME);
        bc.postMessage(payload);
        bc.close();
      }
      // 2. LocalStorage Event (cross-tab fallback)
      localStorage.setItem('outstock_last_sync_signal', JSON.stringify({
        ...payload,
        _t: Date.now()
      }));
      // 3. In-tab CustomEvent
      window.dispatchEvent(new CustomEvent('outstock:sync_event', { detail: payload }));
    }
  } catch (err) {
    console.warn('[Outstock Sync] Failed to broadcast local message:', err);
  }
}

export function listenToOutstockLocalMessages(callback) {
  if (typeof window === 'undefined') return () => {};

  let bc = null;
  const channelListener = (event) => {
    if (event?.data) callback(event.data);
  };

  if ('BroadcastChannel' in window) {
    try {
      bc = new BroadcastChannel(OUTSTOCK_SYNC_CHANNEL_NAME);
      bc.onmessage = channelListener;
    } catch (_) {}
  }

  const storageListener = (e) => {
    if (e.key === 'outstock_last_sync_signal' && e.newValue) {
      try {
        const data = JSON.parse(e.newValue);
        callback(data);
      } catch (_) {}
    }
  };

  const customEventListener = (e) => {
    if (e.detail) callback(e.detail);
  };

  window.addEventListener('storage', storageListener);
  window.addEventListener('outstock:sync_event', customEventListener);

  return () => {
    if (bc) {
      try {
        bc.close();
      } catch (_) {}
    }
    window.removeEventListener('storage', storageListener);
    window.removeEventListener('outstock:sync_event', customEventListener);
  };
}

export const outstockListenBroadcast = listenToOutstockLocalMessages;
if (typeof window !== 'undefined') {
  window.outstockListenBroadcast = listenToOutstockLocalMessages;
}

// ==========================================
// PharmaFly ERP Integration Client APIs
// ==========================================

export async function outstockGetPharmaflyBranches() {
  return outstockRequest('pharmafly/branches');
}

export async function outstockGeneratePharmaflyKey(branchId) {
  return outstockRequest(`pharmafly/branches/${encodeURIComponent(branchId)}/generate-key`, {
    method: 'POST'
  });
}

export async function outstockTogglePharmaflyBranch(branchId, isEnabled) {
  return outstockRequest(`pharmafly/branches/${encodeURIComponent(branchId)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ isEnabled })
  });
}

export async function outstockGetPharmaflyStock(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.branch_id) query.set('branch_id', params.branch_id);
  if (params.in_stock) query.set('in_stock', params.in_stock);
  if (params.limit) query.set('limit', params.limit);
  return outstockRequest(`pharmafly/stock?${query.toString()}`);
}

export async function outstockGetPharmaflyLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.branch_id) query.set('branch_id', params.branch_id);
  if (params.limit) query.set('limit', params.limit);
  return outstockRequest(`pharmafly/logs?${query.toString()}`);
}

// ── 10. العملاء والشكاوى والأصناف التي أعيد توافرها ─────────────────────────────
export async function outstockDeleteCustomer(customerId) {
  return outstockRequest(`customers/${encodeURIComponent(customerId)}`, {
    method: 'DELETE'
  });
}

export async function outstockSendOrderComplaint(orderId, payload) {
  return outstockRequest(`orders/${encodeURIComponent(orderId)}/complaint`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function outstockGetOwnerComplaints(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.branchId) query.set('branchId', params.branchId);
  return outstockRequest(`owner/complaints?${query.toString()}`);
}

export async function outstockUpdateComplaintStatus(complaintId, payload) {
  return outstockRequest(`owner/complaints/${encodeURIComponent(complaintId)}/status`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function outstockGetRestockedItems(params = {}) {
  const query = new URLSearchParams();
  if (params.branchId) query.set('branchId', params.branchId);
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  return outstockRequest(`pharmacy/restocked-items?${query.toString()}`);
}

export async function outstockMarkRestockedContacted(deficiencyId, payload = {}) {
  return outstockRequest(`pharmacy/restocked-items/${encodeURIComponent(deficiencyId)}/contacted`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

