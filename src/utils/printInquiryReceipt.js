/**
 * printInquiryReceipt.js
 * طباعة إيصال استلام عربون الاستعلام الحراري المزدوج (نسخة العميل + نسخة الصيدلية)
 * مصمم لمعايير طابعات الكاشير 80mm و 58mm
 */

import { getEffectiveOrgName } from './outstockLogoHelper.js';
import { resolveBranchThermalDetails } from './thermalReceiptEngine.js';

export function printInquiryReceipt({
  inquiryId,
  customerName = '',
  customerPhone = '',
  customerAddress = '',
  medicationName = '',
  requestedQuantity = 1,
  requestedUnit = 'علبة',
  itemType = 'medication',
  depositAmount = 0,
  paymentMethod = 'cash',
  pharmacistNotes = '',
  employeeName = '',
  employeeCode = '',
  branchName = 'الفرع الرئيسي',
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

  const paymentMethodLabels = {
    cash: 'نقدي (كاش)',
    card: 'بطاقة ائتمانية / فيزا',
    wallet: 'محفظة إلكترونية / إنستاباي',
    vodafone_cash: 'فودافون كاش',
    instapay: 'انستاباي (InstaPay)',
    delayed: 'آجل'
  };
  const paymentLabel = paymentMethodLabels[paymentMethod] || paymentMethod || 'نقدي';
  const itemTypeLabel = itemType === 'cosmetics' ? '💄 مستحضرات تجميل وعناية' : '💊 صنف دوائي';
  const depFormatted = Number(depositAmount || 0).toFixed(2);

  // دالة توليد بطاقة ريسيت فردية
  const renderSingleReceipt = (isCustomerCopy = true) => `
    <div class="receipt-section ${!isCustomerCopy ? 'page-break' : ''}">
      <div class="header">
        ${orgLogo ? `<img src="${orgLogo}" alt="Logo" class="header-logo" />` : ''}
        <h1>${branchDetails.branchName || orgName}</h1>
        ${branchDetails.phonesFormatted ? `<div style="font-size: 10px; font-weight: bold; margin: 2px 0;">${branchDetails.phonesFormatted}</div>` : ''}
        ${branchDetails.branchAddress ? `<div style="font-size: 9.5px; margin: 1px 0;">📍 ${branchDetails.branchAddress}</div>` : ''}
        <div class="badge ${isCustomerCopy ? 'badge-cust' : 'badge-pharm'}">
          ${isCustomerCopy ? 'إشعار استلام عربون واستعلام (نسخة العميل)' : 'إيصال توريد نقدية / عربون (نسخة الصيدلية)'}
        </div>
      </div>

      <div class="info-row">
        <span>رقم التذكرة / الاستعلام:</span>
        <strong style="font-size: 11.5px; font-family: monospace;">#${inquiryId || ('INQ-' + Date.now().toString().slice(-6))}</strong>
      </div>
      <div class="info-row">
        <span>التاريخ والوقت:</span>
        <span>${formattedDate}</span>
      </div>
      <div class="info-row">
        <span>اسم العميل:</span>
        <strong>${customerName || 'عميل نقدي'}</strong>
      </div>
      <div class="info-row">
        <span>رقم الهاتف:</span>
        <span style="direction: ltr; unicode-bidi: isolate;">${customerPhone || '—'}</span>
      </div>
      ${customerAddress ? `
        <div class="info-row">
          <span>العنوان:</span>
          <span>${customerAddress}</span>
        </div>
      ` : ''}
      <div class="info-row">
        <span>التصنيف:</span>
        <strong>${itemTypeLabel}</strong>
      </div>
      <div class="info-row">
        <span>الصيدلي المستلم:</span>
        <strong>${employeeName || 'مسؤول الفرع'} ${employeeCode ? `(كود: ${employeeCode})` : ''}</strong>
      </div>

      <table class="items-table">
        <colgroup>
          <col style="width: 60%;" />
          <col style="width: 20%;" />
          <col style="width: 20%;" />
        </colgroup>
        <thead>
          <tr>
            <th style="text-align: right;">الصنف المستعلم عنه</th>
            <th style="text-align: center;">الكمية</th>
            <th style="text-align: center;">الوحدة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 4px 2px; border-bottom: 1.5px dashed #000; text-align: right; font-weight: 900; color: #000;">
              ${medicationName || 'صنف غير مسمى'}
            </td>
            <td style="padding: 4px 2px; border-bottom: 1.5px dashed #000; text-align: center; font-weight: 900; color: #000;">
              ${requestedQuantity || 1}
            </td>
            <td style="padding: 4px 2px; border-bottom: 1.5px dashed #000; text-align: center; font-weight: 900; color: #000;">
              ${requestedUnit || 'علبة'}
            </td>
          </tr>
        </tbody>
      </table>

      ${pharmacistNotes ? `
        <div style="font-size: 9.5px; padding: 4px; background: #fafafa; border: 1px dashed #ccc; border-radius: 4px; margin-bottom: 5px;">
          <strong>ملاحظات الطلب:</strong> ${pharmacistNotes}
        </div>
      ` : ''}

      <div class="total-box">
        <div style="font-size: 11px; font-weight: 900;">
          ${isCustomerCopy ? 'مبلغ العربون المدفوع' : 'المبلغ المحصل لدرج الكاشير (عربون)'}
        </div>
        <div class="val">${depFormatted} ج.م</div>
        <div style="font-size: 9.5px; margin-top: 3px; font-weight: bold; color: #333;">
          طريقة الدفع: ${paymentLabel}
        </div>
      </div>

      <div class="footer">
        ${isCustomerCopy ? `
          <div>تم استلام مبلغ العربون وجاري فحص وتوفير الصنف عبر إدارة المشتريات.</div>
          <div style="font-weight: bold; margin-top: 2px;">يتم إشعاركم هاتفياً أو عبر واتساب فور اعتماد توفر الطلب ✨</div>
        ` : `
          <div>توقيع الصيدلي المستلم: ..............................</div>
          <div style="font-size: 9px; margin-top: 2px; color: #555;">تحفظ هذه النسخة في درج الكاشير لتسوية وردية العمل</div>
        `}
      </div>
    </div>
  `;

  const receiptHtml = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>إيصال عربون استعلام - ${inquiryId || 'INQ'}</title>
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
      font-weight: 900 !important;
      line-height: 1.35 !important;
      direction: rtl !important;
      text-align: right !important;
      -webkit-font-smoothing: antialiased;
      -webkit-text-stroke: 0.35px #000;
    }
    .receipt-section {
      width: 100% !important;
      padding-bottom: 8px;
    }
    .page-break {
      page-break-before: always !important;
      break-before: page !important;
      border-top: 2px dashed #000;
      padding-top: 10px;
      margin-top: 10px;
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
      max-height: 55px;
      max-width: 140px;
      object-fit: contain;
      margin: 0 auto 4px;
      display: block;
      filter: grayscale(100%) contrast(300%) brightness(90%);
      -webkit-filter: grayscale(100%) contrast(300%) brightness(90%);
      image-rendering: crisp-edges;
    }
    .badge {
      display: inline-block;
      margin: 3px auto;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 900;
      border: 2px solid #000;
      border-radius: 4px;
      -webkit-text-stroke: 0.35px #000;
    }
    .badge-cust { background: #fff; color: #000; }
    .badge-pharm { background: #fff; color: #000; border: 2px solid #000; }
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
      padding: 6px;
      margin: 7px 0;
      text-align: center;
      background: #fff;
      font-weight: 900;
    }
    .total-box .val {
      font-size: 16px;
      font-weight: 900;
      direction: ltr;
      unicode-bidi: isolate;
      margin-top: 2px;
      -webkit-text-stroke: 0.4px #000;
    }
    .footer {
      border-top: 2px dashed #000;
      padding-top: 5px;
      margin-top: 6px;
      text-align: center;
      font-size: 9.5px;
      font-weight: 900;
      line-height: 1.3;
      -webkit-text-stroke: 0.3px #000;
    }
  </style>
</head>
<body>
  ${renderSingleReceipt(true)}
  ${renderSingleReceipt(false)}

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

  const printWindow = window.open('', '_blank', 'width=450,height=650');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  } else {
    // Fallback عبر iframe مخفي
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(receiptHtml);
    iframe.contentDocument.close();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 60000);
  }
}
