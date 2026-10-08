/**
 * printReturnReceipt.js
 * طباعة إيصال استلام مرتجع حراري (80mm / 58mm) لطلبات الصيدلية
 */

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
      <td style="padding: 3px 1px; border-bottom: 1px dotted #ccc;">${idx + 1}. ${it.medicationName || it.name}</td>
      <td style="padding: 3px 1px; border-bottom: 1px dotted #ccc; text-align: center;">${it.quantity}</td>
      <td style="padding: 3px 1px; border-bottom: 1px dotted #ccc; text-align: left;" dir="ltr">${Number(it.totalPrice || it.unitPrice * it.quantity).toFixed(2)}</td>
    </tr>
    ${it.returnReason ? `
      <tr>
        <td colspan="3" style="font-size: 9.5px; color: #555; padding-bottom: 3px; border-bottom: 1px dotted #eee;">
          سبب الإرجاع: ${it.returnReason}
        </td>
      </tr>
    ` : ''}
  `).join('');

  const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إيصال مرتجع - ${returnId || orderNumber}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
    body {
      width: 78mm;
      margin: 0 auto;
      padding: 8px 4px 14px 4px;
      color: #000;
      background: #fff;
      font-size: 12px;
      line-height: 1.35;
      text-align: right;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .header h1 { font-size: 15px; font-weight: 900; }
    .badge {
      display: inline-block;
      margin: 4px auto;
      padding: 3px 8px;
      font-size: 12.5px;
      font-weight: bold;
      border: 1.5px solid #000;
      border-radius: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 2.5px 0;
      font-size: 11px;
      border-bottom: 1px dotted #eee;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 11px;
    }
    .items-table th {
      border-bottom: 1px solid #000;
      padding: 3px 1px;
      font-weight: bold;
    }
    .total-box {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 6px;
      margin: 8px 0;
      text-align: center;
    }
    .total-box .val {
      font-size: 17px;
      font-weight: 900;
      direction: ltr;
    }
    .footer {
      border-top: 2px dashed #000;
      padding-top: 6px;
      margin-top: 8px;
      text-align: center;
      font-size: 9.5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>مجموعة صيدليات د. سيف الدين</h1>
    <div style="font-size: 11px; font-weight: 600;">${branchName}</div>
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
    <strong>${formattedDate}</strong>
  </div>
  <div class="info-row">
    <span>العميل:</span>
    <strong>${customerName || 'عميل نقدي'}</strong>
  </div>
  <div class="info-row">
    <span>الهاتف:</span>
    <strong dir="ltr">${customerPhone || '—'}</strong>
  </div>
  <div class="info-row">
    <span>الموظف المستلم:</span>
    <strong>${employeeName || 'مسؤول الفرع'} (${employeeCode || '—'})</strong>
  </div>
  <div class="info-row">
    <span>وجهة الاسترداد:</span>
    <strong style="color: #000;">${destLabel}</strong>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="text-align: right;">الصنف المرتجع</th>
        <th style="text-align: center; width: 35px;">الكمية</th>
        <th style="text-align: left; width: 55px;">القيمة</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="total-box">
    <div style="font-size: 11px; font-weight: bold;">إجمالي القيمة المستردة</div>
    <div class="val">${Number(totalRefundAmount).toFixed(2)} ج.م</div>
    ${downPaymentRefund > 0 ? `
      <div style="font-size: 10px; margin-top: 2px;">شامل استرداد عربون: ${Number(downPaymentRefund).toFixed(2)} ج.م</div>
    ` : ''}
  </div>

  ${generalReturnReason ? `
    <div style="font-size: 10.5px; padding: 4px; background: #fafafa; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 6px;">
      <strong>السبب العام للمرتجع:</strong> ${generalReturnReason}
    </div>
  ` : ''}

  <div class="footer">
    <div>تم استلام الأصناف وفحصها وإحالتها للمشتريات للاعتماد.</div>
    <div style="font-weight: bold; margin-top: 2px;">صيدليات د. سيف الدين - في خدمتكم دائماً</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
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
