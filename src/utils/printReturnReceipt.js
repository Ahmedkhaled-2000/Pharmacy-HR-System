/**
 * printReturnReceipt.js
 * طباعة إيصال استلام مرتجع حراري عالي الدقة (80mm / 58mm) لطلبات الصيدلية
 * مدعوم بالمحرك الحراري المركزي thermalReceiptEngine لمنع القص الميكانيكي وتأمين أرقام المبالغ
 */

import { getEffectiveOrgName } from './outstockLogoHelper.js';
import { resolveBranchThermalDetails } from './thermalReceiptEngine.js';

export function printReturnReceipt({
  returnId,
  orderNumber,
  branchName = 'الفرع الرئيسي',
  customerName = '',
  customerPhone = '',
  items = [],
  totalRefundAmount = 0,
  downPaymentRefund = 0,
  generalReturnReason = '',
  refundDestination = 'wallet',
  employeeCode = '',
  employeeName = '',
  date = new Date()
}) {
  const branchDetails = resolveBranchThermalDetails({ name: branchName });
  const orgLogo = branchDetails.logoUrl;
  const orgName = getEffectiveOrgName('مجموعة الصيدليات');
  const formattedDate = new Date(date).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const destLabel = refundDestination === 'wallet' 
    ? 'إضافة لرصيد محفظة العميل الإلكترونية' 
    : refundDestination === 'cash' 
      ? 'استرداد نقدي فوري من الخزينة' 
      : 'تسوية حساب العميل';

  const itemsRows = (items || []).map((it, idx) => `
    <tr>
      <td style="padding: 3px 2px; border-bottom: 1.5px dashed #000; text-align: right; word-break: break-word; font-weight: 900; color: #000;">${idx + 1}. ${it.medicationName || it.name}</td>
      <td style="padding: 3px 1px; border-bottom: 1.5px dashed #000; text-align: center; font-weight: 900; color: #000;">${it.quantity}</td>
      <td style="padding: 3px 1px; border-bottom: 1.5px dashed #000; text-align: left; direction: ltr; unicode-bidi: isolate; white-space: nowrap; font-weight: 900; color: #000; -webkit-text-stroke: 0.35px #000;">${Number(it.totalPrice || it.unitPrice * it.quantity).toFixed(2)}</td>
    </tr>
    ${it.returnReason ? `
      <tr>
        <td colspan="3" style="font-size: 9px; font-weight: 900; color: #000; padding-bottom: 3px; border-bottom: 1.5px dashed #000; text-align: right;">
          سبب الإرجاع: ${it.returnReason}
        </td>
      </tr>
    ` : ''}
  `).join('');

  const effectiveRefundAmount = Number(downPaymentRefund > 0 ? downPaymentRefund : totalRefundAmount);
  const refundTitle = downPaymentRefund > 0 ? 'مبلغ العربون المدفوع المسترد' : 'إجمالي القيمة المستردة';

  const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إيصال مرتجع - ${returnId || orderNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0 !important; }
    * {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      width: 72mm !important;
      max-width: 72mm !important;
      margin: 0 auto !important;
      padding: 1mm 2mm 18mm 2mm !important;
      color: #000 !important;
      background: #fff !important;
      font-family: 'Cairo', 'Segoe UI', Tahoma, 'Arial Black', Arial, sans-serif !important;
      font-size: 11px !important;
      font-weight: 900 !important;
      line-height: 1.35 !important;
      direction: rtl !important;
      text-align: right !important;
      -webkit-font-smoothing: antialiased;
      -webkit-text-stroke: 0.35px #000;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 7px;
    }
    .header h1 {
      font-size: 14px;
      font-weight: 900;
      margin-bottom: 2px;
      -webkit-text-stroke: 0.4px #000;
    }
    .header-logo {
      max-height: 60px;
      max-width: 150px;
      object-fit: contain;
      margin: 0 auto 5px;
      display: block;
      filter: grayscale(100%) contrast(300%) brightness(90%);
      -webkit-filter: grayscale(100%) contrast(300%) brightness(90%);
      image-rendering: crisp-edges;
    }
    .badge {
      display: inline-block;
      margin: 3px auto;
      padding: 2px 8px;
      font-size: 11.5px;
      font-weight: 900;
      border: 2px solid #000;
      border-radius: 4px;
      -webkit-text-stroke: 0.35px #000;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
      font-size: 10.5px;
      font-weight: 900;
      border-bottom: 1.5px dashed #000;
    }
    .info-row strong, .info-row span {
      font-weight: 900 !important;
      color: #000 !important;
    }
    .items-table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 10.5px;
      font-weight: 900;
    }
    .items-table th {
      border-bottom: 2px solid #000;
      padding: 3px 2px;
      font-weight: 900;
      -webkit-text-stroke: 0.35px #000;
    }
    .items-table td {
      border-bottom: 1.5px dashed #000 !important;
      font-weight: 900 !important;
    }
    .total-box {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 5px;
      margin: 7px 0;
      text-align: center;
      background: #fafafa;
      font-weight: 900;
    }
    .total-box .val {
      font-size: 15px;
      font-weight: 900;
      direction: ltr;
      unicode-bidi: isolate;
      margin-top: 2px;
      -webkit-text-stroke: 0.4px #000;
    }
    .footer {
      border-top: 2px dashed #000;
      padding-top: 5px;
      margin-top: 7px;
      text-align: center;
      font-size: 9.5px;
      font-weight: 900;
      line-height: 1.3;
      -webkit-text-stroke: 0.3px #000;
    }
  </style>
</head>
<body>
  <div class="header">
    ${orgLogo ? `<img src="${orgLogo}" alt="Logo" class="header-logo" />` : ''}
    <h1>${branchDetails.branchName || orgName}</h1>
    ${branchDetails.phonesFormatted ? `<div style="font-size: 10px; font-weight: bold; margin: 2px 0;">${branchDetails.phonesFormatted}</div>` : ''}
    ${branchDetails.branchAddress ? `<div style="font-size: 9.5px; margin: 1px 0;">📍 ${branchDetails.branchAddress}</div>` : ''}
    <div class="badge">إشعار استلام مرتجع مبيعات</div>
  </div>

  <div class="info-row">
    <span>رقم الطلب الأصلي:</span>
    <strong>#${orderNumber}</strong>
  </div>
  <div class="info-row">
    <span>رقم إشعار المرتجع:</span>
    <strong>${returnId || ('RET-' + Date.now().toString().slice(-6))}</strong>
  </div>
  <div class="info-row">
    <span>التاريخ والوقت:</span>
    <span>${formattedDate}</span>
  </div>
  <div class="info-row">
    <span>العميل:</span>
    <strong>${customerName || 'عميل نقدي'}</strong>
  </div>
  <div class="info-row">
    <span>الهاتف:</span>
    <span style="direction: ltr; unicode-bidi: isolate;">${customerPhone || '—'}</span>
  </div>
  <div class="info-row">
    <span>الموظف المستلم:</span>
    <strong>${employeeName || 'مسؤول الفرع'}</strong>
  </div>
  <div class="info-row">
    <span>وجهة الاسترداد:</span>
    <strong>${destLabel}</strong>
  </div>

  <table class="items-table">
    <colgroup>
      <col style="width: 55%;" />
      <col style="width: 20%;" />
      <col style="width: 25%;" />
    </colgroup>
    <thead>
      <tr>
        <th style="text-align: right;">الصنف المرتجع</th>
        <th style="text-align: center;">الكمية</th>
        <th style="text-align: left;">القيمة</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="total-box">
    <div style="font-size: 11px; font-weight: 900;">${refundTitle}</div>
    <div class="val" style="font-size: 16px; font-weight: 900;">${effectiveRefundAmount.toFixed(2)} ج.م</div>
    ${downPaymentRefund > 0 ? `
      <div style="font-size: 9.5px; margin-top: 3px; font-weight: bold; color: #333;">(استرداد نقدي / محفظة لمبلغ عربون الطلب فقط)</div>
    ` : ''}
  </div>

  ${generalReturnReason ? `
    <div style="font-size: 10px; padding: 4px; background: #fafafa; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 6px;">
      <strong>سبب الإرجاع:</strong> ${generalReturnReason}
    </div>
  ` : ''}

  <div class="footer">
    <div>تم استلام الأصناف وفحصها بنجاح وحفظها بدفتر المرتجعات.</div>
    <div style="font-weight: bold; margin-top: 3px;">نسعد دائماً بخدمتكم ورعايتكم ✨</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>
  `;

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.zIndex = '-9999';
  document.body.appendChild(printFrame);

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(receiptHtml);
  doc.close();

  setTimeout(() => {
    try {
      document.body.removeChild(printFrame);
    } catch (_) {}
  }, 10000);
}
