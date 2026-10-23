/**
 * 🛡️ محرك الرقابة الأمنية الصارمة وكشف التلاعب في نقاط البيع
 * POS Security & Anti-Skimming Audit Engine
 * 
 * يسجل كافة الحركات الحساسة على شاشة الكاشير:
 * 1. LINE_ITEM_VOID: رادار الأصناف الممسوحة بالباركود والمحذوفة قبل الحفظ لمنع السرقة
 * 2. INVOICE_VOID: الفواتير الملغاة أو المعدلة بعد الطباعة
 * 3. NO_SALE_DRAWER_OPEN: فتح درج النقدية دون بيع
 * 4. PRICE_OVERRIDE: تعديل الأسعار يدوياً
 * 5. DISCOUNT_OVERRIDE: تجاوز سقف الخصم المسموح
 * 6. BLIND_REFUND: مرتجع بدون فاتورة أصلية
 * 7. HOLD_BILL: تعليق واسترجاع الفواتير
 */

const AUDIT_LOGS_STORAGE_KEY = 'pharma_pos_audit_logs';

export function getLocalAuditLogs() {
  try {
    const raw = localStorage.getItem(AUDIT_LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logPosSecurityAction({
  actionType,
  branchId = 'main',
  branchName = 'الفرع الرئيسي',
  shiftId = 'current_shift',
  cashierEmpCode = 'CASHIER',
  cashierEmpName = 'الكاشير',
  productId = null,
  productName = null,
  barcode = null,
  priceBefore = 0,
  priceAfter = 0,
  reason = '',
  managerAuthCode = null,
  metadata = {}
}) {
  const auditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    actionType, // 'LINE_ITEM_VOID' | 'INVOICE_VOID' | 'NO_SALE_DRAWER_OPEN' | 'PRICE_OVERRIDE' | 'DISCOUNT_OVERRIDE' | 'BLIND_REFUND' | 'HOLD_BILL'
    branchId,
    branchName,
    shiftId,
    cashierEmpCode,
    cashierEmpName,
    productId,
    productName,
    barcode,
    priceBefore: parseFloat(priceBefore) || 0,
    priceAfter: parseFloat(priceAfter) || 0,
    reason: reason || '',
    managerAuthCode: managerAuthCode || null,
    metadata,
    timestamp: new Date().toISOString()
  };

  try {
    const logs = getLocalAuditLogs();
    logs.unshift(auditEntry);
    // الاحتفاظ بآخر 2000 سجل رقابي محلياً
    const trimmed = logs.slice(0, 2000);
    localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(trimmed));

    // إطلاق حدث محلي لتحديث الواجهة الحية
    window.dispatchEvent(new CustomEvent('pos:audit-logged', { detail: auditEntry }));
  } catch (err) {
    console.warn('[POS Audit Logger Error]:', err);
  }

  return auditEntry;
}
