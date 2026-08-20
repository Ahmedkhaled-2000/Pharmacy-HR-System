/**
 * archiveApiClient.js
 * Unified API Client for Pharmacy Archive System (Embedded & Standalone)
 * Full API Endpoints & Multi-Environment Support
 */

const ARCHIVE_TOKEN_KEY = 'pharmacy_archive_token';
const ARCHIVE_USER_KEY = 'pharmacy_archive_user';

export function getArchiveToken() {
  return localStorage.getItem(ARCHIVE_TOKEN_KEY) || '';
}

export function setArchiveSession(token, username) {
  if (token) localStorage.setItem(ARCHIVE_TOKEN_KEY, token);
  if (username) localStorage.setItem(ARCHIVE_USER_KEY, username);
}

export function clearArchiveSession() {
  localStorage.removeItem(ARCHIVE_TOKEN_KEY);
  localStorage.removeItem(ARCHIVE_USER_KEY);
}

export function getArchiveUsername() {
  return localStorage.getItem(ARCHIVE_USER_KEY) || 'admin';
}

function resolveApiBaseUrl() {
  if (typeof window === 'undefined') return '/api';
  const origin = window.location.origin;
  const path = window.location.pathname;

  if (window.location.port === '5173') {
    return 'http://localhost/HR%20New/api';
  }

  if (path.includes('/HR%20New') || path.includes('/hr-new') || path.includes('/HR_New')) {
    const basePath = path.substring(0, path.toLowerCase().indexOf('/hr') + 7);
    return `${origin}${basePath.replace(/\/$/, '')}/api`;
  }

  return `${origin}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();

async function archiveFetch(endpoint, options = {}) {
  const token = getArchiveToken();
  const cleanBase = API_BASE_URL.replace(/\/$/, '');
  const cleanEndpoint = endpoint.replace(/^\//, '');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const primaryUrl = `${cleanBase}/index.php?endpoint=archive/${cleanEndpoint}`;

  try {
    const res = await fetch(primaryUrl, {
      ...options,
      headers,
    });

    if (res.status === 404 || res.status === 405) {
      const altUrl = `${cleanBase}/archive/${cleanEndpoint}`;
      const altRes = await fetch(altUrl, {
        ...options,
        headers,
      });
      return await altRes.json();
    }

    return await res.json();
  } catch (err) {
    try {
      const altUrl = `${cleanBase}/archive/${cleanEndpoint}`;
      const altRes = await fetch(altUrl, {
        ...options,
        headers,
      });
      return await altRes.json();
    } catch {
      throw err;
    }
  }
}

// 1. Authentication API
export async function apiArchiveLogin(username, password) {
  const res = await archiveFetch('auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (res.success && res.token) {
    setArchiveSession(res.token, res.username || username);
  } else if (res.success && !res.token) {
    const token = 'session_' + Date.now();
    setArchiveSession(token, username);
    res.token = token;
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
  if (filters.search || filters.q) params.append('search', filters.search || filters.q);
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
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return await res.json().catch(() => ({ success: false, invoices: [] }));
}

export async function apiArchiveGetInvoiceById(invoiceId) {
  return await archiveFetch(`invoices&id=${encodeURIComponent(invoiceId)}`, {
    method: 'GET',
  });
}

export async function apiArchiveSaveInvoice(invoiceData) {
  return await archiveFetch('invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  });
}

export async function apiArchiveSaveBatchInvoices(invoices) {
  return await archiveFetch('invoices/batch', {
    method: 'POST',
    body: JSON.stringify({ invoices }),
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

export async function apiArchiveGetInvoiceExcelData(invoiceId) {
  return await archiveFetch(`invoices/${encodeURIComponent(invoiceId)}/excel-data`, {
    method: 'GET',
  });
}

export async function apiArchiveAttachInvoiceFile(invoiceId, fileData) {
  return await archiveFetch(`invoices/${encodeURIComponent(invoiceId)}/attach`, {
    method: 'POST',
    body: JSON.stringify(fileData),
  });
}

export async function apiArchiveRemoveInvoiceFile(invoiceId) {
  return await archiveFetch(`invoices/${encodeURIComponent(invoiceId)}/attach`, {
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
  return await archiveFetch(`suppliers/mappings&supplierId=${encodeURIComponent(supplierId)}`, {
    method: 'GET',
  });
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

export async function apiArchiveGetEmployeeInvoices(empId) {
  return await archiveFetch(`employees/${encodeURIComponent(empId)}/invoices`, {
    method: 'GET',
  });
}

// 5. Settings API
export async function apiArchiveGetSettings() {
  return await archiveFetch('settings', { method: 'GET' });
}

export async function apiArchiveSaveSettings(settingsData) {
  return await archiveFetch('settings', {
    method: 'POST',
    body: JSON.stringify(settingsData),
  });
}

export async function apiArchiveCheckGoogleStatus() {
  return await archiveFetch('settings/google-status', { method: 'GET' });
}

export async function apiArchiveTestDrive() {
  return await archiveFetch('settings/google-status', { method: 'GET' });
}

// 6. Direct File Upload API
export async function apiArchiveUploadFile(fileName, fileType, base64Data) {
  return await archiveFetch('upload', {
    method: 'POST',
    body: JSON.stringify({
      fileName,
      fileType,
      base64: base64Data,
    }),
  });
}
