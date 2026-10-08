/**
 * printCustomerWalletReceipt.js
 * طباعة إيصال استلام حراري (80mm / 58mm) لعمليات شحن وسحب محفظة العميل
 */

export function printCustomerWalletReceipt({
  receiptNumber,
  customer,
  transactionType = 'deposit',
  amount = 0,
  previousBalance = 0,
  newBalance = 0,
  paymentMethod = 'cash',
  employeeCode = '',
  employeeName = '',
  branchName = 'الفرع الرئيسي',
  notes = '',
  date = new Date()
}) {
  const isDeposit = transactionType === 'deposit' || transactionType === 'refund_to_wallet';
  const typeLabel = isDeposit ? 'سند إيداع نقدي بالمحفظة' : 'سند صرف / خصم من المحفظة';
  const amountFormatted = Number(amount).toFixed(2);
  const prevFormatted = Number(previousBalance).toFixed(2);
  const newFormatted = Number(newBalance).toFixed(2);
  const formattedDate = new Date(date).toLocaleString('ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const paymentMethodLabels = {
    cash: 'نقدي (كاش)',
    card: 'بطاقة ائتمانية / فيزا',
    vodafone_cash: 'فودافون كاش',
    instapay: 'انستاباي (InstaPay)',
    return_settlement: 'تسوية مرتجع صيدلية'
  };

  const paymentLabel = paymentMethodLabels[paymentMethod] || paymentMethod || 'نقدي';

  const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إيصال محفظة - ${receiptNumber || 'RCP'}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
    }
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
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .header h1 {
      font-size: 16px;
      font-weight: 900;
      margin-bottom: 2px;
    }
    .header .subtitle {
      font-size: 11px;
      font-weight: 600;
      color: #333;
    }
    .badge {
      display: inline-block;
      margin: 4px auto;
      padding: 3px 10px;
      font-size: 13px;
      font-weight: bold;
      border: 1.5px solid #000;
      border-radius: 4px;
      text-align: center;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 11.5px;
      border-bottom: 1px dotted #ccc;
    }
    .info-row strong {
      font-weight: 700;
    }
    .amount-box {
      border: 2px solid #000;
      border-radius: 6px;
      padding: 8px 6px;
      margin: 8px 0;
      text-align: center;
      background: #fdfdfd;
    }
    .amount-box .label {
      font-size: 11px;
      font-weight: bold;
    }
    .amount-box .val {
      font-size: 19px;
      font-weight: 900;
      direction: ltr;
      display: inline-block;
    }
    .balances-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
    }
    .balances-table td {
      padding: 4px 2px;
      font-size: 11.5px;
    }
    .footer {
      border-top: 2px dashed #000;
      padding-top: 8px;
      margin-top: 10px;
      text-align: center;
      font-size: 10px;
      line-height: 1.3;
    }
    .qr-box {
      margin: 6px auto;
      text-align: center;
    }
    @media print {
      body { width: 100%; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>مجموعة صيدليات د. سيف الدين</h1>
    <div class="subtitle">منظومة النواقص والمشتريات الذكية</div>
    <div style="font-size: 12px; font-weight: bold; margin-top: 3px;">${branchName}</div>
    <div class="badge">${typeLabel}</div>
  </div>

  <div class="info-row">
    <span>رقم السند:</span>
    <strong>${receiptNumber || ('RCP-' + Date.now().toString().slice(-6))}</strong>
  </div>
  <div class="info-row">
    <span>التاريخ والوقت:</span>
    <strong>${formattedDate}</strong>
  </div>
  <div class="info-row">
    <span>اسم العميل:</span>
    <strong>${customer?.full_name || customer?.name || 'عميل نقدي'}</strong>
  </div>
  <div class="info-row">
    <span>كود العميل:</span>
    <strong>${customer?.customer_code || customer?.customerCode || '—'}</strong>
  </div>
  <div class="info-row">
    <span>رقم الهاتف:</span>
    <strong dir="ltr">${customer?.whatsapp_phone || customer?.phone || '—'}</strong>
  </div>
  <div class="info-row">
    <span>الموظف المسؤول:</span>
    <strong>${employeeName || 'مسؤول الفرع'} (${employeeCode || '—'})</strong>
  </div>
  <div class="info-row">
    <span>طريقة الدفع:</span>
    <strong>${paymentLabel}</strong>
  </div>

  <div class="amount-box">
    <div class="label">${isDeposit ? 'المبلغ المودع بالمحفظة' : 'المبلغ المخصوم من المحفظة'}</div>
    <div class="val">${amountFormatted} ج.م</div>
  </div>

  <table class="balances-table">
    <tr>
      <td>الرصيد السابق:</td>
      <td class="text-left" style="font-weight: bold;" dir="ltr">${prevFormatted} ج.م</td>
    </tr>
    <tr style="border-top: 1px solid #000; font-weight: bold; font-size: 12.5px;">
      <td>الرصيد الجديد الحالي:</td>
      <td class="text-left" style="font-weight: 900; font-size: 14px;" dir="ltr">${newFormatted} ج.م</td>
    </tr>
  </table>

  ${notes ? `
  <div style="margin: 6px 0; font-size: 11px; padding: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;">
    <strong>ملاحظات:</strong> ${notes}
  </div>` : ''}

  <div class="footer">
    <div>رصيد المحفظة صالح للاستخدام والخصم في كافة فروعنا.</div>
    <div style="font-weight: bold; margin-top: 2px;">شكراً لاختياركم صيدليات د. سيف الدين</div>
    <div style="margin-top: 3px; font-size: 9px; color: #555;">طبع بواسطة المنظومة الإلكترونية الموحدة</div>
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

  // طباعة عبر نافذة منبثقة أو iframe مخفي
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
