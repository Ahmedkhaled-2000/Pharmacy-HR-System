/**
 * posDeliveryService.js
 * نظام إدارة وتشغيل وتتبع طلبات التوصيل الصيدلاني (PharmaOS Delivery Dispatch Engine)
 * - إدارة الطيارين والمندوبين وأرقام هواتفهم
 * - تتبع مراحل الطلب (قيد التجهيز -> مع الطيار -> تم التسليم والتحصيل -> مرتجع)
 * - احتساب وتسوية عهدة ونقدية الطيارين وعمولات التوصيل
 * - إرسال تفاصيل الفاتورة والموقع للطيار والعميل عبر الواتساب بنقرة واحدة
 * - توليد وطباعة بوليصة الشحن الحرارية 80mm
 */

const STORAGE_KEYS = {
  SALES: 'pharma_pos_sales',
  PILOTS: 'pharma_pos_delivery_pilots',
  ZONES: 'pharma_pos_delivery_zones',
  SETTLEMENTS: 'pharma_pos_delivery_settlements'
};

// الطيارون الافتراضيون للفرع
export const DEFAULT_PILOTS = [
  { id: 'pilot-1', name: 'كابتن أحمد حسن', phone: '01012345678', vehicle: 'موتوسيكل', status: 'available', commissionPerOrder: 10 },
  { id: 'pilot-2', name: 'كابتن محمود علي', phone: '01123456789', vehicle: 'موتوسيكل', status: 'available', commissionPerOrder: 10 },
  { id: 'pilot-3', name: 'كابتن إسلام سمير', phone: '01234567890', vehicle: 'سكوتر', status: 'available', commissionPerOrder: 12 },
  { id: 'pilot-4', name: 'كابتن مصطفى رجب', phone: '01512345678', vehicle: 'عجلة / مشي', status: 'available', commissionPerOrder: 8 }
];

// مناطق التوصيل القياسية ورسوم الخدمة
export const DEFAULT_ZONES = [
  { id: 'zone-1', name: 'المنطقة المحيطة (نطاق الصيدلية)', fee: 5 },
  { id: 'zone-2', name: 'المنطقة الداخلية (حتى 2 كم)', fee: 10 },
  { id: 'zone-3', name: 'المنطقة المتوسطة (2 - 5 كم)', fee: 15 },
  { id: 'zone-4', name: 'المنطقة البعيدة (+5 كم)', fee: 25 }
];

/**
 * جلب قائمة الطيارين
 */
export function getDeliveryPilots() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PILOTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  saveDeliveryPilots(DEFAULT_PILOTS);
  return DEFAULT_PILOTS;
}

/**
 * حفظ قائمة الطيارين
 */
export function saveDeliveryPilots(pilots) {
  try {
    localStorage.setItem(STORAGE_KEYS.PILOTS, JSON.stringify(pilots));
  } catch (e) {
    console.error('Failed to save delivery pilots:', e);
  }
}

/**
 * جلب مناطق التوصيل
 */
export function getDeliveryZones() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ZONES);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_ZONES;
}

/**
 * جلب كافة طلبات وفواتير الدليفري المخزنة محلياً
 */
export function getDeliveryOrders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SALES);
    const sales = raw ? JSON.parse(raw) : [];
    return sales.filter((s) => s.invoiceType === 'delivery' || s.deliveryDetails?.isDelivery);
  } catch (e) {
    console.error('Failed to load delivery orders:', e);
    return [];
  }
}

/**
 * تحديث حالة طلب دليفري (قيد التجهيز -> مع الطيار -> تم التسليم -> مرتجع)
 */
export function updateDeliveryOrderStatus(orderId, newStatus, extraData = {}) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SALES);
    if (!raw) return null;
    const sales = JSON.parse(raw);
    const idx = sales.findIndex((s) => s.id === orderId || s.invoiceNumber === orderId);
    if (idx === -1) return null;

    const order = sales[idx];
    const prevStatus = order.deliveryStatus || 'pending';
    
    order.deliveryStatus = newStatus;
    order.deliveryStatusUpdatedAt = new Date().toISOString();
    
    if (!order.deliveryDetails) order.deliveryDetails = {};
    Object.assign(order.deliveryDetails, extraData);

    // إذا تم التسليم يتم تسجيل وقت التحصيل
    if (newStatus === 'delivered' && !order.deliveredAt) {
      order.deliveredAt = new Date().toISOString();
      order.isPaid = true;
    }

    sales[idx] = order;
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));

    // إشعار التطبيق بالتحديث
    window.dispatchEvent(new CustomEvent('pos:delivery-updated', { detail: { orderId, prevStatus, newStatus } }));
    return order;
  } catch (e) {
    console.error('Failed to update delivery order status:', e);
    return null;
  }
}

/**
 * احتساب ملخص ومحفظة كل طيار للطلبات المسندة إليه
 */
export function calculatePilotsSummary(orders, pilots) {
  const summaryMap = {};

  // تهيئة
  pilots.forEach((p) => {
    summaryMap[p.id] = {
      pilot: p,
      totalOrders: 0,
      pendingOrders: 0,
      onWayOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      totalCashToCollect: 0,
      totalCashCollected: 0,
      totalCommissionEarned: 0,
      orders: []
    };
  });

  // مجهول أو بدون طيار
  summaryMap['unassigned'] = {
    pilot: { id: 'unassigned', name: 'غير مسند لطيار', phone: '' },
    totalOrders: 0,
    pendingOrders: 0,
    onWayOrders: 0,
    deliveredOrders: 0,
    returnedOrders: 0,
    totalCashToCollect: 0,
    totalCashCollected: 0,
    totalCommissionEarned: 0,
    orders: []
  };

  orders.forEach((o) => {
    const pilotId = o.deliveryDetails?.pilotId || (o.deliveryDetails?.pilotName ? pilots.find(p => p.name === o.deliveryDetails.pilotName)?.id : null) || 'unassigned';
    const target = summaryMap[pilotId] || summaryMap['unassigned'];
    const totalAmount = parseFloat(o.totalAmount || 0);
    const status = o.deliveryStatus || 'pending';

    target.totalOrders += 1;
    target.orders.push(o);

    if (status === 'pending') target.pendingOrders += 1;
    else if (status === 'on_way') {
      target.onWayOrders += 1;
      target.totalCashToCollect += totalAmount;
    } else if (status === 'delivered') {
      target.deliveredOrders += 1;
      target.totalCashCollected += totalAmount;
      const commission = target.pilot?.commissionPerOrder || 10;
      target.totalCommissionEarned += commission;
    } else if (status === 'returned') {
      target.returnedOrders += 1;
    }
  });

  return Object.values(summaryMap);
}

/**
 * تقفيل وتصفية عهدة الطيار وتوريد المبالغ المحصلة لدرج الصيدلية
 */
export function settlePilotCash(pilotId, pilotName, collectedAmount, commissionAmount, shiftId) {
  try {
    const rawSettlements = localStorage.getItem(STORAGE_KEYS.SETTLEMENTS);
    const settlements = rawSettlements ? JSON.parse(rawSettlements) : [];

    const settlementRecord = {
      id: `settle_${Date.now()}`,
      pilotId,
      pilotName,
      shiftId: shiftId || 'current',
      settledAt: new Date().toISOString(),
      collectedAmount: parseFloat(collectedAmount || 0),
      commissionAmount: parseFloat(commissionAmount || 0),
      netToCashierDrawer: parseFloat(collectedAmount || 0) - parseFloat(commissionAmount || 0),
      notes: `تصفية نقدية الطيار ${pilotName} وتوريدها للدرج`
    };

    settlements.unshift(settlementRecord);
    localStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(settlements));

    // تحديث حالة الطلبات المسلمة لتصبح تمت تصفيتها
    const rawSales = localStorage.getItem(STORAGE_KEYS.SALES);
    if (rawSales) {
      const sales = JSON.parse(rawSales);
      sales.forEach((s) => {
        if (
          (s.deliveryDetails?.pilotId === pilotId || s.deliveryDetails?.pilotName === pilotName) &&
          s.deliveryStatus === 'delivered' &&
          !s.deliverySettled
        ) {
          s.deliverySettled = true;
          s.deliverySettledId = settlementRecord.id;
        }
      });
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    }

    window.dispatchEvent(new CustomEvent('pos:pilot-settled', { detail: settlementRecord }));
    return settlementRecord;
  } catch (e) {
    console.error('Failed to settle pilot cash:', e);
    return null;
  }
}

/**
 * توليد نص رسالة الواتساب للطيار تشمل تفاصيل الطلب والموقع
 */
export function generatePilotWhatsAppMessage(order, pharmacyName = 'صيدلية فارماكور') {
  const delivery = order.deliveryDetails || {};
  const itemsText = (order.items || [])
    .map((item, idx) => `${idx + 1}. ${item.tradeNameAr || item.tradeNameEn || item.name} [${item.qty} ${item.unit || 'علبة'}]`)
    .join('\n');

  const total = parseFloat(order.totalAmount || 0).toFixed(2);
  const fee = parseFloat(delivery.deliveryFee || 0).toFixed(2);
  const grandTotal = (parseFloat(total) + parseFloat(fee)).toFixed(2);

  const address = delivery.address || order.customerAddress || 'غير محدد';
  const notes = delivery.notes ? `\n📝 ملاحظات العنوان: ${delivery.notes}` : '';

  return `🛵 *أوردر دليفري جديد - ${pharmacyName}*
━━━━━━━━━━━━━━━━━━
📄 *رقم الفاتورة:* #${order.invoiceNumber}
👤 *العميل:* ${order.customerName || 'عميل نقدي'}
📞 *هاتف العميل:* ${order.customerPhone || 'لا يوجد'}
📍 *العنوان:* ${address}${notes}
━━━━━━━━━━━━━━━━━━
📦 *الأصناف:*
${itemsText}
━━━━━━━━━━━━━━━━━━
💵 *قيمة الأدوية:* ${total} ج.م
🛵 *خدمة التوصيل:* ${fee} ج.م
💰 *المطلوب تحصيله من العميل:* *${grandTotal} ج.م*
━━━━━━━━━━━━━━━━━━
⚠️ برجاء التأكد من فحص الباكت ومطابقة المبلغ عند الاستلام.`;
}

/**
 * توليد نص رسالة الواتساب للعميل لإشعاره بخروج الطلب
 */
export function generateCustomerWhatsAppMessage(order, pilotName = 'طيار الصيدلية', pharmacyName = 'صيدلية فارماكور') {
  const delivery = order.deliveryDetails || {};
  const total = (parseFloat(order.totalAmount || 0) + parseFloat(delivery.deliveryFee || 0)).toFixed(2);

  return `مرحباً بك يا فندم 🌸
طلبك رقم *#${order.invoiceNumber}* من *${pharmacyName}* تم تجهيزه وخرج للتوصيل الآن مع الكابتن *${pilotName}* 🛵.
💰 المبلغ المطلوب تحصيله عند الاستلام: *${total} ج.م*.
نتمنى لكم دوام الصحة والعافية! 💊`;
}

/**
 * فتح محادثة واتساب عبر الرابط المباشر
 */
export function openWhatsAppChat(phone, message) {
  if (!phone) return false;
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '2' + cleanPhone;
  else if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  return true;
}

/**
 * طباعة بوليصة التوصيل الحرارية 80mm للطيار
 */
export function printDeliveryWaybill(order, pharmacyInfo = {}) {
  const delivery = order.deliveryDetails || {};
  const pharmacyName = pharmacyInfo.name || 'مجموعة صيدليات فارماكور';
  const pharmacyPhone = pharmacyInfo.phone || '03-5555555 / 01000000000';
  const pilotName = delivery.pilotName || 'طيار الفرع';
  const pilotPhone = delivery.pilotPhone || '';
  const total = parseFloat(order.totalAmount || 0).toFixed(2);
  const fee = parseFloat(delivery.deliveryFee || 0).toFixed(2);
  const netCollect = (parseFloat(total) + parseFloat(fee)).toFixed(2);

  const itemsHtml = (order.items || [])
    .map(
      (it, i) => `
      <tr>
        <td style="padding: 4px 2px; border-bottom: 1px dashed #ccc; font-size: 11px;">${i + 1}. ${it.tradeNameAr || it.name}</td>
        <td style="padding: 4px 2px; border-bottom: 1px dashed #ccc; text-align: center; font-size: 11px;">${it.qty}</td>
        <td style="padding: 4px 2px; border-bottom: 1px dashed #ccc; text-align: left; font-size: 11px;">${(it.lineTotal || (it.price * it.qty)).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  const waybillHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>بوليصة شحن دليفري #${order.invoiceNumber}</title>
      <style>
        @page { size: 80mm auto; margin: 3mm; }
        body {
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          width: 74mm;
          margin: 0 auto;
          padding: 4px;
          direction: rtl;
          color: #000;
          font-size: 12px;
          line-height: 1.35;
        }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px; }
        .title { font-size: 16px; font-weight: 900; }
        .subtitle { font-size: 13px; font-weight: 700; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px; }
        .box { border: 1.5px solid #000; border-radius: 6px; padding: 6px; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11.5px; }
        .highlight { font-size: 18px; font-weight: 900; text-align: center; padding: 4px; background: #eee; border: 1.5px dashed #000; margin: 6px 0; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .footer { text-align: center; font-size: 10px; margin-top: 8px; border-top: 1px solid #000; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print(); window.close();">
      <div class="header">
        <div class="title">${pharmacyName}</div>
        <div style="font-size: 11px;">خدمة التوصيل السريع للمنازل</div>
        <div class="subtitle">بوليصة استلام وتسليم دليفري 🛵</div>
      </div>

      <div class="row">
        <span>رقم الفاتورة: <strong>#${order.invoiceNumber}</strong></span>
        <span>${new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="row">
        <span>التاريخ: ${new Date(order.createdAt).toISOString().slice(0, 10)}</span>
        <span>الطيار: <strong>${pilotName}</strong></span>
      </div>

      <div class="box">
        <div style="font-weight: 900; font-size: 13px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;">
          بيانات العميل والتوصيل:
        </div>
        <div style="font-size: 13px; font-weight: 900;">👤 ${order.customerName || 'عميل نقدي'}</div>
        <div style="font-size: 14px; font-weight: 900; direction: ltr; text-align: right; margin: 3px 0;">📞 ${order.customerPhone || 'بدون هاتف'}</div>
        <div style="font-size: 12px; margin-top: 4px;">📍 <strong>العنوان:</strong> ${delivery.address || order.customerAddress || 'مسجل هاتفياً'}</div>
        ${delivery.notes ? `<div style="font-size: 11px; margin-top: 2px; color: #333;">📝 ملاحظات: ${delivery.notes}</div>` : ''}
      </div>

      <table>
        <thead>
          <tr style="border-bottom: 1.5px solid #000; font-size: 11px;">
            <th style="text-align: right;">الصنف</th>
            <th style="text-align: center;">العدد</th>
            <th style="text-align: left;">القيمة</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top: 1px solid #000; padding-top: 4px;">
        <div class="row">
          <span>قيمة الأدوية والمستلزمات:</span>
          <span>${total} ج.م</span>
        </div>
        <div class="row">
          <span>رسوم خدمة التوصيل:</span>
          <span>${fee} ج.م</span>
        </div>
      </div>

      <div class="highlight">
        المبلغ المطلوب تحصيله:<br/>
        <span style="font-size: 22px;">${netCollect} ج.م</span>
      </div>

      <div class="box" style="font-size: 10.5px; text-align: center;">
        في حال وجود أي استفسار أو مرتجع دوائي يرجى الاتصال على الخط الساخن:<br/>
        <strong>${pharmacyPhone}</strong>
      </div>

      <div class="footer">
        شكراً لاختياركم صيدليتكم الموثوقة • طُبع بواسطة نظام PharmaOS
      </div>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=450,height=600');
  if (win) {
    win.document.write(waybillHtml);
    win.document.close();
  }
}
