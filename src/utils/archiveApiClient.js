/**
 * archiveApiClient.js
 * عميل HTTP المخصص للاتصال بنظام أرشيف الصيدلية وإدارة الفواتير وقاعدة بيانات MariaDB
 */

import { API_BASE_URL } from './apiClient';

const ARCHIVE_TOKEN_KEY = 'pharmacy_archive_token';
const ARCHIVE_USER_KEY = 'pharmacy_archive_user';

export function getArchiveToken() {
  try {
    return localStorage.getItem(ARCHIVE_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setArchiveSession(token, username) {
  try {
    if (token) localStorage.setItem(ARCHIVE_TOKEN_KEY, token);
    if (username) localStorage.setItem(ARCHIVE_USER_KEY, username);
  } catch {}
}

export function clearArchiveSession() {
  try {
    localStorage.removeItem(ARCHIVE_TOKEN_KEY);
    localStorage.removeItem(ARCHIVE_USER_KEY);
  } catch {}
}

export function getArchiveUsername() {
  try {
    return localStorage.getItem(ARCHIVE_USER_KEY) || 'admin';
  } catch {
    return 'admin';
  }
}

async function archiveFetch(endpoint, options = {}) {
  const token = getArchiveToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const url = `${API_BASE_URL}?endpoint=archive/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({ success: false, error: 'فشل تحليل استجابة الخادم' }));

  if (!response.ok && !data.error) {
    data.error = `خطأ في الخادم (${response.status})`;
  }

  return data;
}

// 1. Auth API
export async function apiArchiveLogin(username, password) {
  const res = await archiveFetch('auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (res.success && res.token) {
    setArchiveSession(res.token, res.username || username);
  }
  return res;
}

export async function apiArchiveGetSession() {
  return await archiveFetch('auth/session', { method: 'GET' });
}

export async function apiArchiveChangeCredentials(currentPassword, newUsername, newPassword) {
  return await archiveFetch('auth/change-credentials', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newUsername, newPassword }),
  });
}

// 2. Invoices API
export async function apiArchiveGetInvoices(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.append('q', filters.q);
  if (filters.supplierId) params.append('supplierId', filters.supplierId);
  if (filters.receiverId) params.append('receiverId', filters.receiverId);
  if (filters.entryClerkId) params.append('entryClerkId', filters.entryClerkId);
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.id) params.append('id', filters.id);

  const queryStr = params.toString() ? `&${params.toString()}` : '';
  const token = getArchiveToken();
  const url = `${API_BASE_URL}?endpoint=archive/invoices${queryStr}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  return await res.json().catch(() => ({ success: false, invoices: [] }));
}

export async function apiArchiveSaveInvoice(invoiceData) {
  return await archiveFetch('invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });
}

export async function apiArchiveUpdateInvoice(invoiceData) {
  return await archiveFetch('invoices', {
    method: 'PUT',
    body: JSON.stringify(invoiceData),
  });
}

export async function apiArchiveDeleteInvoice(invoiceId) {
  return await archiveFetch(`invoices&id=${encodeURIComponent(invoiceId)}`, {
    method: 'DELETE',
  });
}

// 3. Suppliers API
export async function apiArchiveGetSuppliers(id = null) {
  const endpoint = id ? `suppliers&id=${encodeURIComponent(id)}` : 'suppliers';
  return await archiveFetch(endpoint, { method: 'GET' });
}

export async function apiArchiveSaveSupplier(supplierData) {
  const method = supplierData.id ? 'PUT' : 'POST';
  return await archiveFetch('suppliers', {
    method,
    body: JSON.stringify(supplierData),
  });
}

export async function apiArchiveDeleteSupplier(supplierId) {
  return await archiveFetch(`suppliers&id=${encodeURIComponent(supplierId)}`, {
    method: 'DELETE',
  });
}

export async function apiArchiveGetSupplierMappings(supplierId) {
  return await archiveFetch(`suppliers/mappings&supplierId=${encodeURIComponent(supplierId)}`, { method: 'GET' });
}

export async function apiArchiveSaveSupplierMappings(supplierId, mappings) {
  return await archiveFetch('suppliers/mappings', {
    method: 'POST',
    body: JSON.stringify({ supplierId, mappings }),
  });
}

// 4. Employees API
export async function apiArchiveGetEmployees() {
  return await archiveFetch('employees', { method: 'GET' });
}

export async function apiArchiveSaveEmployee(empData) {
  const method = empData.id ? 'PUT' : 'POST';
  return await archiveFetch('employees', {
    method,
    body: JSON.stringify(empData),
  });
}

export async function apiArchiveDeleteEmployee(empId) {
  return await archiveFetch(`employees&id=${encodeURIComponent(empId)}`, {
    method: 'DELETE',
  });
}

// 5. Settings API
export async function apiArchiveGetSettings() {
  return await archiveFetch('settings', { method: 'GET' });
}

export async function apiArchiveSaveSettings(settingsObj) {
  return await archiveFetch('settings', {
    method: 'POST',
    body: JSON.stringify(settingsObj),
  });
}

// 6. File Upload API
export async function apiArchiveUploadFile(fileOrBase64, fileName = '') {
  if (typeof fileOrBase64 === 'string') {
    return await archiveFetch('upload', {
      method: 'POST',
      body: JSON.stringify({ base64: fileOrBase64, fileName }),
    });
  }

  const formData = new FormData();
  formData.append('file', fileOrBase64);
  const token = getArchiveToken();

  const res = await fetch(`${API_BASE_URL}?endpoint=archive/upload`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });

  return await res.json().catch(() => ({ success: false, error: 'فشل الرفع' }));
}
