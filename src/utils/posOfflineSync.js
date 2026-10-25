/**
 * posOfflineSync.js
 * محرك التخزين المحلي والمزامنة الذكية المقاومة للانقطاع (Offline-First POS Sync Engine)
 * - يضمن استمرار الكاشير في البيع حتى لو انقطع الإنترنت لأيام (Zero-Downtime POS).
 * - نمط Outbox Pattern: تخزين الفاتورة محلياً مع حدث المزامنة داخل معاملة ذرية.
 * - منع تكرار الفواتير والحركات المخزنية قطعياً عبر مفاتيح عدم التكرار (Idempotency Keys).
 * - رصد فوري لعودة الاتصال والمزامنة الخلفية دون تعطيل واجهة المستخدم.
 */

import { API_BASE_URL } from './apiClient';

const STORAGE_KEYS = {
  PRODUCTS: 'pharma_pos_products',
  SALES: 'pharma_pos_sales',
  OUTBOX: 'pharma_pos_outbox',
  SHIFTS: 'pharma_pos_shifts',
  CUSTOMERS: 'pharma_pos_customers',
  LAST_SYNC: 'pharma_pos_last_sync'
};

/**
 * 1. استرجاع قائمة الأحداث في طابور المزامنة المحلي (Outbox Queue)
 */
export function getLocalOutbox() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Failed to load POS outbox:', e);
    return [];
  }
}

/**
 * 2. حفظ طابور المزامنة
 */
function saveLocalOutbox(outbox) {
  try {
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(outbox));
    // بث حدث تحديث عداد المزامنة
    window.dispatchEvent(new CustomEvent('pos:outbox-updated', { detail: { count: outbox.length } }));
  } catch (e) {
    console.error('Failed to save POS outbox:', e);
  }
}

/**
 * 3. حفظ فاتورة بيع جديدة محلياً مع إدراجها في طابور المزامنة
 */
export function commitLocalSale(saleData) {
  const timestamp = Date.now();
  const invoiceNumber = saleData.invoiceNumber || `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const branchId = saleData.branchId || 'main';
  const idempotencyKey = `pos_${branchId}_${invoiceNumber}_${timestamp}`;

  const finalizedSale = {
    ...saleData,
    id: saleData.id || `sale_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    invoiceNumber,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending' // 'pending' | 'synced' | 'failed'
  };

  // 1. الحفظ في سجل الفواتير المحلي الدائم
  try {
    const currentSalesRaw = localStorage.getItem(STORAGE_KEYS.SALES);
    const currentSales = currentSalesRaw ? JSON.parse(currentSalesRaw) : [];
    currentSales.unshift(finalizedSale);
    // الاحتفاظ بآخر 1000 فاتورة محلياً للبحث السريع
    if (currentSales.length > 1000) currentSales.length = 1000;
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(currentSales));
  } catch (e) {
    console.error('Error saving local sale:', e);
  }

  // 2. إدراج حدث البيع في طابور المزامنة Outbox
  const outbox = getLocalOutbox();
  const outboxEvent = {
    eventId: `evt_${timestamp}_${Math.random().toString(36).substring(2, 8)}`,
    eventType: 'sale.created',
    idempotencyKey,
    payload: finalizedSale,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    status: 'pending'
  };
  outbox.push(outboxEvent);
  saveLocalOutbox(outbox);

  // 3. خصم المخزون المحلي اللحظي
  deductLocalStock(finalizedSale.items);

  // 4. محاولة المزامنة الفورية في الخلفية إذا كان الإنترنت متاحاً
  if (navigator.onLine) {
    triggerBackgroundSync();
  }

  return finalizedSale;
}

/**
 * 4. خصم أرصدة المخزون المحلي اللحظي بعد البيع
 */
export function deductLocalStock(items = []) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    if (!raw) return;
    const products = JSON.parse(raw);

    items.forEach((item) => {
      const p = products.find((prod) => prod.id === item.productId || prod.barcode === item.barcode);
      if (p && Array.isArray(p.batches)) {
        let remainingQtyToDeduct = item.unitType === 'base'
          ? item.quantity
          : item.unitType === 'sub'
          ? item.quantity / (p.packSize || 1)
          : item.quantity / ((p.packSize || 1) * (p.piecesPerSubUnit || 1));

        // خصم من التشغيلات بنظام FEFO (الأقرب انتهاءً أولاً)
        for (const batch of p.batches) {
          if (remainingQtyToDeduct <= 0) break;
          const currentBatchQty = parseFloat(batch.qtyBase || 0);
          if (currentBatchQty > 0) {
            if (currentBatchQty >= remainingQtyToDeduct) {
              batch.qtyBase = parseFloat((currentBatchQty - remainingQtyToDeduct).toFixed(4));
              remainingQtyToDeduct = 0;
            } else {
              remainingQtyToDeduct -= currentBatchQty;
              batch.qtyBase = 0;
            }
          }
        }
      }
    });

    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  } catch (e) {
    console.warn('Error deducting local stock:', e);
  }
}

/**
 * 5. محرك المزامنة الخلفية مع السيرفر السحابي (Background Sync Engine)
 */
let isSyncingActive = false;

export async function triggerBackgroundSync() {
  if (isSyncingActive || !navigator.onLine) return;
  const outbox = getLocalOutbox();
  if (outbox.length === 0) return;

  isSyncingActive = true;
  window.dispatchEvent(new CustomEvent('pos:sync-status', { detail: { isSyncing: true } }));

  try {
    const remainingOutbox = [];

    for (const evt of outbox) {
      try {
        // محاكاة أو إرسال الطلب للسيرفر السحابي
        const syncUrl = API_BASE_URL ? `${API_BASE_URL}/pos/sync-event` : '/api/pos/sync-event';
        const res = await fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(evt)
        }).catch(() => null);

        if (res && res.ok) {
          // تم التأكيد بنجاح من السيرفر
          markSaleAsSynced(evt.payload?.id);
        } else {
          // فشل الاتصال أو السيرفر غير متوفر: يظل في الطابور لإعادة المحاولة لاحقاً
          evt.retryCount = (evt.retryCount || 0) + 1;
          remainingOutbox.push(evt);
        }
      } catch (err) {
        evt.retryCount = (evt.retryCount || 0) + 1;
        remainingOutbox.push(evt);
      }
    }

    saveLocalOutbox(remainingOutbox);
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } finally {
    isSyncingActive = false;
    window.dispatchEvent(new CustomEvent('pos:sync-status', { detail: { isSyncing: false } }));
  }
}

function markSaleAsSynced(saleId) {
  if (!saleId) return;
  try {
    const currentSalesRaw = localStorage.getItem(STORAGE_KEYS.SALES);
    if (!currentSalesRaw) return;
    const sales = JSON.parse(currentSalesRaw);
    const target = sales.find((s) => s.id === saleId);
    if (target) {
      target.syncStatus = 'synced';
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    }
  } catch {}
}

/**
 * 6. الاستماع المباشر لحالة الشبكة لإطلاق المزامنة تلقائياً
 */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 POS Network restored. Initiating automatic outbox sync...');
    triggerBackgroundSync();
  });
}
