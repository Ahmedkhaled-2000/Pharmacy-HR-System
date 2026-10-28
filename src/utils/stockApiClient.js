/**
 * stockApiClient.js
 * محرك الاتصال المركزي بنظام إدارة المخازن PharmaOS Stock
 * يربط واجهة المستخدم لسطح المكتب بجميع نقاط النهاية API والعمليات الذرية
 */

import { API_BASE_URL } from './apiClient';

/**
 * الحصول على توكن المصادقة وترويسات الطلب الرسمية
 */
function getAuthHeaders() {
  const token =
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('app_auth_token') ||
        localStorage.getItem('outstock_token') ||
        localStorage.getItem('archive_token'))) ||
    '';

  const role = (typeof localStorage !== 'undefined' && localStorage.getItem('app_auth_role')) || 'owner';

  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-App-Role': role
  };
}

/**
 * دالة طلب عامة وآمنة مع معالجة الأخطاء
 */
async function stockFetch(endpoint, options = {}) {
  const cleanUrl = `${API_BASE_URL}/stock/${endpoint.replace(/^\/+/, '')}`;
  const config = {
    method: options.method || 'GET',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    },
    ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
  };

  try {
    const response = await fetch(cleanUrl, config);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `HTTP ${response.status}: فشل الاتصال بخادم المخازن`;
      throw new Error(errorMsg);
    }

    return data || { success: true };
  } catch (error) {
    console.error(`[StockApiClient] Error in ${endpoint}:`, error.message);
    throw error;
  }
}

// ── 1. لوحة المؤشرات الإحصائية العامة ──────────────────────────────
export async function stockGetOverview(branchId = '') {
  const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
  return await stockFetch(`overview${query}`);
}

// ── 2. إدارة مواقع ومستودعات المنظومة ──────────────────────────────
export async function stockGetLocations() {
  return await stockFetch('locations');
}

export async function stockSaveLocation(locationData) {
  return await stockFetch('locations', {
    method: 'POST',
    body: locationData
  });
}

// ── 3. كشاف الأرصدة والكميات متعدد المستودعات ──────────────────────
export async function stockGetBalances(params = {}) {
  const q = new URLSearchParams();
  if (params.location_id) q.append('location_id', params.location_id);
  if (params.branch_id) q.append('branch_id', params.branch_id);
  if (params.search) q.append('search', params.search);
  if (params.category) q.append('category', params.category);
  if (params.low_stock) q.append('low_stock', '1');
  if (params.negative_stock) q.append('negative_stock', '1');
  if (params.limit) q.append('limit', String(params.limit));
  if (params.offset) q.append('offset', String(params.offset));

  const queryStr = q.toString() ? `?${q.toString()}` : '';
  return await stockFetch(`balances${queryStr}`);
}

export async function stockReconcileBalance(medication_id, location_id) {
  return await stockFetch('balances/reconcile', {
    method: 'POST',
    body: { medication_id, location_id }
  });
}

// ── 4. مفتش التشغيلات وتواريخ الصلاحية (FEFO & Batches) ────────────
export async function stockGetBatches(params = {}) {
  const q = new URLSearchParams();
  if (params.medication_id) q.append('medication_id', params.medication_id);
  if (params.location_id) q.append('location_id', params.location_id);
  if (params.days_to_expire) q.append('days_to_expire', String(params.days_to_expire));
  if (params.status) q.append('status', params.status);

  const queryStr = q.toString() ? `?${q.toString()}` : '';
  return await stockFetch(`batches${queryStr}`);
}

export async function stockToggleBatchQuarantine(batch_id, is_quarantined) {
  return await stockFetch('batches/quarantine', {
    method: 'POST',
    body: { batch_id, is_quarantined }
  });
}

// ── 5. دفتر الأستاذ المخزني الدائم (Immutable Stock Ledger) ─────────
export async function stockGetLedger(params = {}) {
  const q = new URLSearchParams();
  if (params.medication_id) q.append('medication_id', params.medication_id);
  if (params.location_id) q.append('location_id', params.location_id);
  if (params.movement_type) q.append('movement_type', params.movement_type);
  if (params.from_date) q.append('from_date', params.from_date);
  if (params.to_date) q.append('to_date', params.to_date);
  if (params.limit) q.append('limit', String(params.limit));
  if (params.offset) q.append('offset', String(params.offset));

  const queryStr = q.toString() ? `?${q.toString()}` : '';
  return await stockFetch(`ledger${queryStr}`);
}

// ── 6. أوامر وتحويلات البضاعة بين الفروع والمستودعات ─────────────────
export async function stockGetTransfers(params = {}) {
  const q = new URLSearchParams();
  if (params.status) q.append('status', params.status);
  if (params.from_location_id) q.append('from_location_id', params.from_location_id);
  if (params.to_location_id) q.append('to_location_id', params.to_location_id);
  if (params.limit) q.append('limit', String(params.limit));
  if (params.offset) q.append('offset', String(params.offset));

  const queryStr = q.toString() ? `?${q.toString()}` : '';
  return await stockFetch(`transfers${queryStr}`);
}

export async function stockGetTransferDetails(transferId) {
  return await stockFetch(`transfers/${transferId}`);
}

export async function stockCreateTransfer(transferData) {
  return await stockFetch('transfers', {
    method: 'POST',
    body: transferData
  });
}

export async function stockDispatchTransfer(transferId, { dispatched_by, tracking_number } = {}) {
  return await stockFetch(`transfers/${transferId}/dispatch`, {
    method: 'POST',
    body: { dispatched_by, tracking_number }
  });
}

export async function stockReceiveTransfer(transferId, { received_by, items } = {}) {
  return await stockFetch(`transfers/${transferId}/receive`, {
    method: 'POST',
    body: { received_by, items }
  });
}

// ── 7. استلام المشتريات وتوريد البضائع من الموردين ────────────────────
export async function stockSaveReceipt(receiptData) {
  return await stockFetch('receipts', {
    method: 'POST',
    body: receiptData
  });
}

// ── 8. جلسات الجرد الفعلي ومطابقة الفروقات (Physical Inventory) ─────
export async function stockGetCounts(params = {}) {
  const q = new URLSearchParams();
  if (params.location_id) q.append('location_id', params.location_id);
  if (params.status) q.append('status', params.status);

  const queryStr = q.toString() ? `?${q.toString()}` : '';
  return await stockFetch(`counts${queryStr}`);
}

export async function stockGetCountDetails(countId) {
  return await stockFetch(`counts/${countId}`);
}

export async function stockStartCount(countData) {
  return await stockFetch('counts', {
    method: 'POST',
    body: countData
  });
}

export async function stockScanCountItem(countId, scanData) {
  return await stockFetch(`counts/${countId}/scan`, {
    method: 'POST',
    body: scanData
  });
}

export async function stockPostCountReconciliation(countId, { reviewed_by, variance_notes } = {}) {
  return await stockFetch(`counts/${countId}/post`, {
    method: 'POST',
    body: { reviewed_by, variance_notes }
  });
}

// ── 9. التقارير الإدارية والمحاسبية الـ 20 المتقدمة ──────────────────
export async function stockGetReport(reportType, params = {}) {
  const q = new URLSearchParams({ report_type: reportType });
  if (params.location_id) q.append('location_id', params.location_id);
  if (params.from_date) q.append('from_date', params.from_date);
  if (params.to_date) q.append('to_date', params.to_date);

  return await stockFetch(`reports?${q.toString()}`);
}

// ── 10. محرك الاستدعاء الدوائي وحظر التشغيلات (Drug Recalls) ─────────
export async function stockSearchRecalls(query) {
  const q = new URLSearchParams({ query: query || '' });
  return await stockFetch(`recalls/search?${q.toString()}`);
}

export async function stockQuarantineBatch({ batchId, batchNumber, reason, medicationId }) {
  return await stockFetch('recalls/quarantine', {
    method: 'POST',
    body: { batchId, batchNumber, reason, medicationId }
  });
}

export async function stockUnquarantineBatch({ batchId, batchNumber, reason }) {
  return await stockFetch('recalls/unquarantine', {
    method: 'POST',
    body: { batchId, batchNumber, reason }
  });
}

// ── 11. محرك الذكاء التحليلي لإعادة الطلب والتخطيط (Smart Reorder) ────
export async function stockGetReorderSuggestions(params = {}) {
  const q = new URLSearchParams();
  if (params.locationId) q.append('locationId', params.locationId);
  if (params.lookbackDays) q.append('lookbackDays', String(params.lookbackDays));
  if (params.leadTimeDays) q.append('leadTimeDays', String(params.leadTimeDays));
  if (params.targetBufferDays) q.append('targetBufferDays', String(params.targetBufferDays));

  return await stockFetch(`reorder/suggestions?${q.toString()}`);
}

export async function stockCreateBatchTransfer(transferData) {
  return await stockFetch('reorder/create-batch-transfer', {
    method: 'POST',
    body: transferData
  });
}

// ── 12. مركز التوالف والهوالك وإعدام الأدوية (Scrap & Disposal) ──────
export async function stockLogScrap(scrapData) {
  return await stockFetch('scrap', {
    method: 'POST',
    body: scrapData
  });
}

// ── 13. مركز المرتجعات (Branch & Supplier Returns) ──────────────────
export async function stockCreateReturn(returnData) {
  return await stockFetch('returns', {
    method: 'POST',
    body: returnData
  });
}

// ── 14. البحث السريع في دليل الأدوية مع الرصيد ───────────────────────
export async function stockSearchMedications(params = {}) {
  const q = new URLSearchParams();
  if (params.q) q.append('q', params.q);
  if (params.locationId) q.append('locationId', params.locationId);

  return await stockFetch(`medications/search?${q.toString()}`);
}


// ── 15. إدارة الموردين ───────────────────────────────────────────────
export async function stockGetSuppliers(search = '') {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return await stockFetch(`suppliers${q}`);
}

export async function stockSaveSupplier(supplierData) {
  return await stockFetch('suppliers', {
    method: 'POST',
    body: supplierData
  });
}

export async function stockUpdateSupplier(id, supplierData) {
  return await stockFetch(`suppliers/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: supplierData
  });
}

// ── 16. إعدادات وقوالب طابعات الملصقات الحرارية ──────────────────────
export async function stockGetLabelTemplate() {
  return await stockFetch('label-templates');
}

export async function stockSaveLabelTemplate(templateData) {
  return await stockFetch('label-templates', {
    method: 'POST',
    body: templateData
  });
}

// ── 17. استلام التحويل بالفرع عن طريق كود التحويل والباركود ──────────
export async function stockGetTransferByCode(code) {
  return await stockFetch(`transfers/by-code/${encodeURIComponent(code)}`);
}

export async function stockReceiveTransferByCode(payload) {
  return await stockFetch('transfers/receive-by-code', {
    method: 'POST',
    body: payload
  });
}

// ── 18. إدخال رصيد تشغيلة مباشرة للفرع ─────────────────────────────────
export async function stockAddBranchBatch(payload) {
  return await stockFetch('branch-balance/batch-entry', {
    method: 'POST',
    body: payload
  });
}
