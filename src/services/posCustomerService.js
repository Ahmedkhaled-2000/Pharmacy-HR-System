/**
 * posCustomerService.js
 * خدمة الربط المركزي الموحد لبيانات العملاء بين نظام نقاط البيع (POS) ونظام النواقص والمخازن (OutStock)
 * قاعدة بيانات مركزية موحدة: PostgreSQL public.outstock_customers مع دعم العمل بدون إنترنت (Offline-First)
 */

const LOCAL_STORAGE_KEY = 'pharma_pos_customers';

/**
 * جلب رأس المصادقة المناسب للطلبات
 */
function getHeaders() {
  const token = localStorage.getItem('outstock_token') || localStorage.getItem('app_auth_token') || localStorage.getItem('app_token') || '';
  const terminal = localStorage.getItem('app_pos_terminal') || 'POS-01';
  const headers = {
    'Content-Type': 'application/json',
    'x-pos-terminal': terminal
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * تحديث الكاش المحلي للعملاء لسرعة الاستجابة ودعم العمل أوفلاين
 */
export function updateLocalCustomerCache(customer) {
  if (!customer) return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];

    const normPhone = (customer.whatsapp_phone || customer.phone || '').replace(/\D/g, '');
    const idx = list.findIndex(c => {
      const cPhone = (c.whatsapp_phone || c.phone || '').replace(/\D/g, '');
      return (customer.id && c.id === customer.id) || (normPhone && cPhone === normPhone);
    });

    const unified = {
      id: customer.id || `cust_${Date.now()}`,
      customer_code: customer.customer_code || `CUST-${normPhone.slice(-4) || '0000'}`,
      name: customer.full_name || customer.name,
      full_name: customer.full_name || customer.name,
      phone: customer.whatsapp_phone || customer.phone || '',
      whatsapp_phone: customer.whatsapp_phone || customer.phone || '',
      landline_phone: customer.landline_phone || customer.landlinePhone || '',
      address: customer.address || '',
      isChronic: Boolean(customer.is_chronic ?? customer.isChronic),
      is_chronic: Boolean(customer.is_chronic ?? customer.isChronic),
      walletBalance: parseFloat(customer.wallet_balance ?? customer.walletBalance ?? 0),
      wallet_balance: parseFloat(customer.wallet_balance ?? customer.walletBalance ?? 0),
      notes: customer.notes || '',
      zone: customer.zone || ''
    };

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...unified };
    } else {
      list.unshift(unified);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list.slice(0, 500)));
  } catch (e) {
    console.warn('Failed to update local customer cache:', e);
  }
}

/**
 * البحث الموحد عن العملاء بالاسم أو برقم الهاتف
 * يستعلم من قاعدة بيانات OutStock المركزية السحابية مع دمج الكاش المحلي
 */
export async function searchUnifiedCustomers(searchTerm) {
  if (!searchTerm || !searchTerm.trim()) return [];
  const clean = searchTerm.trim();
  const cleanDigits = clean.replace(/\D/g, '');

  let remoteCustomers = [];
  try {
    const url = `/api/outstock/customers?search=${encodeURIComponent(clean)}${cleanDigits ? `&phone=${encodeURIComponent(cleanDigits)}` : ''}`;
    const res = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.customers && Array.isArray(data.customers)) {
        remoteCustomers = data.customers;
        remoteCustomers.forEach(updateLocalCustomerCache);
      }
    }
  } catch (err) {
    // شبكة غير مستقرة، الاستمرار بالكاش المحلي
  }

  // دمج مع الكاش المحلي وتجنب التكرار
  const localList = (() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  const merged = [...remoteCustomers];
  const seenIds = new Set(remoteCustomers.map(c => String(c.id)));
  const seenPhones = new Set(remoteCustomers.map(c => (c.whatsapp_phone || c.phone || '').replace(/\D/g, '')).filter(Boolean));

  for (const localC of localList) {
    const cPhone = (localC.whatsapp_phone || localC.phone || '').replace(/\D/g, '');
    const cName = String(localC.full_name || localC.name || '').toLowerCase();
    const matchesSearch = cName.includes(clean.toLowerCase()) || (cleanDigits && cPhone.includes(cleanDigits));

    if (matchesSearch && !seenIds.has(String(localC.id)) && (!cPhone || !seenPhones.has(cPhone))) {
      merged.push({
        id: localC.id,
        customer_code: localC.customer_code,
        full_name: localC.name || localC.full_name,
        whatsapp_phone: localC.phone || localC.whatsapp_phone,
        address: localC.address,
        is_chronic: localC.isChronic ?? localC.is_chronic,
        wallet_balance: localC.walletBalance ?? localC.wallet_balance ?? 0
      });
      seenIds.add(String(localC.id));
      if (cPhone) seenPhones.add(cPhone);
    }
  }

  return merged;
}

/**
 * حفظ أو تسجيل عميل جديد مركزياً
 * يحفظ في PostgreSQL outstock_customers ويبث الحدث فورياً لنظام النواقص والـ POS
 */
export async function saveUnifiedCustomer(customerData, branchId = 'main') {
  const normPhone = String(customerData.phone || customerData.whatsappPhone || '').replace(/\D/g, '');
  const payload = {
    id: customerData.id || undefined,
    fullName: (customerData.name || customerData.fullName || '').trim(),
    whatsappPhone: normPhone,
    landlinePhone: customerData.landlinePhone || '',
    address: (customerData.address || '').trim(),
    branchId: branchId || 'main',
    isChronic: Boolean(customerData.isChronic ?? customerData.is_chronic),
    notes: customerData.notes || '',
    zone: customerData.zone || '',
    walletBalance: parseFloat(customerData.walletBalance ?? customerData.wallet_balance ?? 0),
    drugAllergies: customerData.drug_allergies || customerData.drugAllergies || '',
    chronicDiseases: customerData.chronic_diseases || customerData.chronicDiseases || '',
    clinicalNotes: customerData.clinical_notes || customerData.clinicalNotes || ''
  };

  try {
    const res = await fetch('/api/outstock/customers', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.customer) {
        updateLocalCustomerCache(data.customer);
        return { success: true, customer: data.customer, isOnline: true };
      }
      if (data.error) {
        return { success: false, error: data.error };
      }
    }
  } catch (err) {
    console.warn('Network save unified customer failed, falling back to local cache:', err);
  }

  // حالة انقطاع الاتصال (Offline Fallback)
  const fallbackCustomer = {
    id: customerData.id || `cust_${Date.now()}`,
    customer_code: `CUST-${normPhone.slice(-4) || '0000'}`,
    full_name: payload.fullName,
    whatsapp_phone: normPhone,
    address: payload.address,
    is_chronic: payload.isChronic,
    wallet_balance: parseFloat(customerData.walletBalance || 0),
    isOffline: true
  };

  updateLocalCustomerCache(fallbackCustomer);

  // إدراج العميل الجديد في طابور المزامنة الـ Outbox لرفعه للسيرفر فور عودة الاتصال
  try {
    const outboxRaw = localStorage.getItem('pharma_pos_sync_outbox');
    const outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    outbox.push({
      id: `outbox_cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'CUSTOMER_CREATE',
      endpoint: '/api/outstock/customers',
      payload,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('pharma_pos_sync_outbox', JSON.stringify(outbox));
  } catch (e) {}

  return { success: true, customer: fallbackCustomer, isOffline: true };
}

/**
 * خصم رصيد من محفظة العميل عند الشراء من الـ POS
 * يحدث الكاش المحلي ويرسل طلب التحديث للباك إند أو يضيفه للـ Outbox أوفلاين
 */
export async function deductCustomerWallet({
  customerId,
  amount,
  invoiceNumber = '',
  employeeCode = '101',
  employeeName = 'صيدلي الكاشير',
  branchId = 'main',
  branchName = 'الفرع الرئيسي'
}) {
  const deductVal = Math.abs(parseFloat(amount || 0));
  if (!customerId || deductVal <= 0) return { success: false, reason: 'invalid_amount_or_customer' };

  // 1. تحديث فوري للكاش المحلي للعملاء
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      let list = JSON.parse(raw);
      const idx = list.findIndex(c => String(c.id) === String(customerId));
      if (idx >= 0) {
        const currentBal = parseFloat(list[idx].walletBalance ?? list[idx].wallet_balance ?? 0);
        const newBal = Math.max(0, parseFloat((currentBal - deductVal).toFixed(2)));
        list[idx].walletBalance = newBal;
        list[idx].wallet_balance = newBal;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      }
    }
  } catch (e) {
    console.warn('Failed to deduct from local customer wallet cache:', e);
  }

  const payload = {
    amount: deductVal,
    type: 'withdraw',
    paymentMethod: 'wallet',
    notes: `خصم من محفظة العميل لسداد فاتورة POS #${invoiceNumber}`,
    employeeCode,
    employeeName,
    branchId,
    branchName,
    verificationMethod: 'employee_code'
  };

  // 2. إرسال طلب التحديث الذري للباك إند
  try {
    const res = await fetch(`/api/outstock/customers/${encodeURIComponent(customerId)}/wallet/adjust`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.customer) {
        updateLocalCustomerCache(data.customer);
      }
      return { success: true, isOnline: true };
    }
  } catch (err) {
    console.warn('Network wallet adjust failed, queueing for outbox sync:', err);
  }

  // 3. في حال انقطاع الشبكة، إدراج العملية في طابور الـ Outbox للمزامنة التلقائية
  try {
    const outboxRaw = localStorage.getItem('pharma_pos_sync_outbox');
    const outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    outbox.push({
      id: `outbox_wallet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'WALLET_ADJUST',
      endpoint: `/api/outstock/customers/${encodeURIComponent(customerId)}/wallet/adjust`,
      payload,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('pharma_pos_sync_outbox', JSON.stringify(outbox));
  } catch (e) {}

  return { success: true, isOffline: true };
}

