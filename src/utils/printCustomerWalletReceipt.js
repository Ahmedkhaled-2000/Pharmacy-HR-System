/**
 * printCustomerWalletReceipt.js
 * طباعة إيصال استلام حراري فائق الدقة (80mm / 58mm) لعمليات شحن وسحب محفظة العميل
 * مدعوم بالمحرك الحراري المركزي thermalReceiptEngine لحماية الأرقام ومنع القص الميكانيكي
 */

import { getEffectiveOrgName } from './outstockLogoHelper.js';
import { resolveBranchThermalDetails } from './thermalReceiptEngine.js';

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
  const branchDetails = resolveBranchThermalDetails({ name: branchName });
  const orgLogo = branchDetails.logoUrl;
  const orgName = getEffectiveOrgName('مجموعة الصيدليات');
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
      margin: 0 !important;
    }
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
      font-weight: 800 !important;
      line-height: 1.35 !important;
      direction: rtl !important;
      text-align: right !important;
      -webkit-font-smoothing: antialiased;
      -webkit-text-stroke: 0.35px #000;
    }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .header {
      text-align: center;
      border-bottom: 1.5px dashed #000;
      padding-bottom: 6px;
      margin-bottom: 7px;
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
    .header h1 {
      font-size: 14px;
      font-weight: 900;
      margin-bottom: 2px;
    }
    .header .subtitle {
      font-size: 10px;
      font-weight: 600;
      color: #222;
    }
    .badge {
      display: inline-block;
      margin: 3px auto;
      padding: 2px 9px;
      font-size: 11.5px;
      font-weight: bold;
      border: 1.5px solid #000;
      border-radius: 4px;
      text-align: center;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 2px 0;
      font-size: 10.5px;
      border-bottom: 1px dotted #ddd;
    }
    .info-row strong {
      font-weight: 700;
    }
    .amount-box {
      border: 1.5px solid #000;
      border-radius: 6px;
      padding: 6px;
      margin: 7px 0;
      text-align: center;
      background: #fafafa;
    }
    .amount-box .label {
      font-size: 10.5px;
      font-weight: bold;
    }
    .amount-box .val {
      font-size: 17px;
      font-weight: 900;
      direction: ltr;
      unicode-bidi: isolate;
      display: inline-block;
      margin-top: 2px;
    }
    .balances-table {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0;
      font-size: 10.5px;
    }
    .balances-table td {
      padding: 3px 2px;
    }
    .footer {
      border-top: 1.5px dashed #000;
      padding-top: 6px;
      margin-top: 8px;
      text-align: center;
      font-size: 9.5px;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="header">
    ${orgLogo ? `<img src="${orgLogo}" alt="Logo" class="header-logo" />` : ''}
    <h1>${branchDetails.branchName || orgName}</h1>
    <div class="subtitle">خدمات رعاية العملاء والمحفظة الذكية</div>
    ${branchDetails.phonesFormatted ? `<div style="font-size: 10px; font-weight: bold; margin: 2px 0;">${branchDetails.phonesFormatted}</div>` : ''}
    ${branchDetails.branchAddress ? `<div style="font-size: 9.5px; margin: 1px 0;">📍 ${branchDetails.branchAddress}</div>` : ''}
    <div class="badge">${typeLabel}</div>
  </div>

  <div class="info-row">
    <span>رقم السند:</span>
    <strong>${receiptNumber || ('RCP-' + Date.now().toString().slice(-6))}</strong>
  </div>
  <div class="info-row">
    <span>التاريخ والوقت:</span>
    <span>${formattedDate}</span>
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
    <span style="direction: ltr; unicode-bidi: isolate;">${customer?.whatsapp_phone || customer?.phone || '—'}</span>
  </div>
  <div class="info-row">
    <span>الموظف المسؤول:</span>
    <strong>${employeeName || 'مسؤول الفرع'}</strong>
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
      <td class="text-left" style="font-weight: bold; direction: ltr; unicode-bidi: isolate;">${prevFormatted} ج.م</td>
    </tr>
    <tr style="border-top: 1px solid #000; font-weight: bold;">
      <td>الرصيد الجديد الحالي:</td>
      <td class="text-left" style="font-weight: 900; font-size: 13px; direction: ltr; unicode-bidi: isolate;">${newFormatted} ج.م</td>
    </tr>
  </table>

  ${notes ? `
  <div style="margin: 5px 0; font-size: 10px; padding: 4px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 4px;">
    <strong>ملاحظات:</strong> ${notes}
  </div>` : ''}

  <div class="footer">
    <div>رصيد المحفظة صالح للاستخدام والخصم في كافة فروعنا.</div>
    <div style="font-weight: bold; margin-top: 3px;">نسعد دائماً بخدمتكم وتوفير احتياجاتكم ✨</div>
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
