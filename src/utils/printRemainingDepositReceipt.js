/**
 * printRemainingDepositReceipt.js
 * طباعة إيصال استلام عربون الصنف المتبقي (قيد انتظار المشتريات) بعد التسليم الجزئي
 * يدعم طابعات الكاشير الحرارية القياسية (80mm و 58mm) بنسخة مزدوجة (نسخة العميل + نسخة الصيدلية)
 */

import { getEffectiveOrgName } from './outstockLogoHelper.js';
import { resolveBranchThermalDetails } from './thermalReceiptEngine.js';

export function printRemainingDepositReceipt({
  orderNumber = '',
  customerName = '',
  customerPhone = '',
  remainingItems = [], // [{ medicationName, quantity, unitType, unitPrice, itemType }]
  depositAmount = 0,
  previousDeposit = 0,
  totalDepositNow = 0,
  remainingAmountDue = 0,
  paymentMethod = 'cash',
  employeeName = '',
  employeeCode = '',
  branchName = 'صيدلية الفرع',
  notes = '',
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
    wallet: 'محفظة الصيدلية',
    vodafone_cash: 'محفظة إلكترونية',
    instapay: 'إنستاباي (InstaPay)',
    delayed: 'آجل'
  };
  const paymentLabel = paymentMethodLabels[paymentMethod] || paymentMethod || 'نقدي';

  const itemsRowsHtml = (remainingItems || []).map((it, idx) => {
    const name = it.medicationName || it.medication_name || 'صنف دوائي';
    const qty = it.quantity || 1;
    const unit = it.unitType === 'strip' || it.unit_type === 'strip' ? 'شريط' : 'علبة';
    const price = parseFloat(it.unitPrice || it.unit_price || 0);
    const total = price > 0 ? (price * qty).toFixed(2) + ' ج.م' : 'يحدد لاحقاً';
    return `
      <tr>
        <td style="padding: 4px; text-align: center; border-bottom: 1px dashed #ccc;">${idx + 1}</td>
        <td style="padding: 4px; font-weight: bold; border-bottom: 1px dashed #ccc;">${name}</td>
        <td style="padding: 4px; text-align: center; border-bottom: 1px dashed #ccc;">${qty} ${unit}</td>
        <td style="padding: 4px; text-align: left; border-bottom: 1px dashed #ccc;">${total}</td>
      </tr>
    `;
  }).join('');

  const renderSingleReceipt = (isCustomerCopy = true) => `
    <div class="receipt-section ${!isCustomerCopy ? 'page-break' : ''}">
      <div class="header">
        ${orgLogo ? `<img src="${orgLogo}" alt="Logo" class="header-logo" />` : ''}
        <h1>${branchDetails.branchName || orgName}</h1>
        ${branchDetails.phonesFormatted ? `<div style="font-size: 10px; font-weight: bold; margin: 2px 0;">${branchDetails.phonesFormatted}</div>` : ''}
        ${branchDetails.branchAddress ? `<div style="font-size: 9.5px; margin: 1px 0;">📍 ${branchDetails.branchAddress}</div>` : ''}
        <div class="badge ${isCustomerCopy ? 'badge-cust' : 'badge-pharm'}">
          ${isCustomerCopy ? 'إيصال عربون صنف قيد التوفير (نسخة العميل)' : 'إيصال توريد نقدية عربون (نسخة الصيدلية)'}
        </div>
      </div>

      <div class="meta-row">
        <span>رقم الطلب الأصلي: <strong>#${orderNumber || '---'}</strong></span>
        <span>التاريخ: <strong>${formattedDate}</strong></span>
      </div>

      <div class="cust-box">
        <div>العميل: <strong>${customerName || 'عميل نقدي'}</strong></div>
        ${customerPhone ? `<div>الهاتف: <strong dir="ltr">${customerPhone}</strong></div>` : ''}
      </div>

      <div style="font-size: 11px; font-weight: bold; margin: 8px 0 4px 0; color: #1e293b; border-bottom: 1px solid #1e293b; padding-bottom: 2px;">
        الأصناف المتبقية قيد المتابعة مع إدارة المشتريات:
      </div>

      <table class="items-table" style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 8px;">
        <thead>
          <tr style="background: #f1f5f9; border-bottom: 1.5px solid #000;">
            <th style="padding: 3px; width: 25px;">م</th>
            <th style="padding: 3px; text-align: right;">الصنف</th>
            <th style="padding: 3px; text-align: center; width: 55px;">الكمية</th>
            <th style="padding: 3px; text-align: left; width: 65px;">السعر التقديري</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml || '<tr><td colspan="4" style="text-align: center; padding: 4px;">صنف قيد المتابعة</td></tr>'}
        </tbody>
      </table>

      <div class="financial-summary" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>العربون المسدد الآن:</span>
          <strong style="color: #047857; font-size: 13px;">${parseFloat(depositAmount || 0).toFixed(2)} ج.م</strong>
        </div>
        ${previousDeposit > 0 ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px; color: #64748b; font-size: 10px;">
            <span>عربون مرحل سابقاً:</span>
            <strong>${parseFloat(previousDeposit).toFixed(2)} ج.م</strong>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px; border-top: 1px dashed #cbd5e1; padding-top: 3px;">
          <span>إجمالي العربون المحجوز للصنف:</span>
          <strong style="color: #0369a1; font-weight: 800;">${parseFloat(totalDepositNow || depositAmount || 0).toFixed(2)} ج.م</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10.5px;">
          <span>وسيلة السداد:</span>
          <span>${paymentLabel}</span>
        </div>
      </div>

      <div class="footer-box" style="margin-top: 8px; border-top: 1px dashed #94a3b8; padding-top: 6px; font-size: 10px; color: #475569;">
        <div style="display: flex; justify-content: space-between;">
          <span>المحرر: <strong>${employeeName || 'صيدلي الفرع'}</strong> ${employeeCode ? `[#${employeeCode}]` : ''}</span>
          <span>الفرع: <strong>${branchName}</strong></span>
        </div>
        <div style="text-align: center; margin-top: 5px; font-weight: bold; color: #0f172a;">
          🔔 تم حجز طلبكم وجاري توفيره عبر إدارة المشتريات وسيتم إشعاركم فور وصوله
        </div>
      </div>
    </div>
  `;

  const fullHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <title>إيصال عربون صنف متبقي - ${orderNumber || 'REC'}</title>
      <style>
        @page {
          size: auto;
          margin: 0;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 6px;
          background: #fff;
          color: #000;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt-section {
          width: 72mm;
          margin: 0 auto 15px auto;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          margin-bottom: 6px;
        }
        .header-logo {
          max-height: 48px;
          max-width: 140px;
          object-fit: contain;
          margin-bottom: 4px;
        }
        .header h1 {
          font-size: 14px;
          margin: 0 0 2px 0;
          font-weight: 900;
        }
        .badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 4px;
          margin-top: 3px;
        }
        .badge-cust {
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #7dd3fc;
        }
        .badge-pharm {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }
        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 9.5px;
          margin: 4px 0;
          border-bottom: 1px dashed #cbd5e1;
          padding-bottom: 3px;
        }
        .cust-box {
          font-size: 10.5px;
          margin: 4px 0;
          background: #f8fafc;
          padding: 4px 6px;
          border-radius: 4px;
        }
        .page-break {
          page-break-before: always;
          border-top: 1px dashed #64748b;
          padding-top: 12px;
          margin-top: 15px;
        }
        @media print {
          .page-break {
            page-break-before: always;
          }
        }
      </style>
    </head>
    <body>
      ${renderSingleReceipt(true)}
      ${renderSingleReceipt(false)}
      <script>
        window.onload = function() {
          try {
            window.focus();
            window.print();
          } catch(e) {}
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=420,height=650');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  }
}
