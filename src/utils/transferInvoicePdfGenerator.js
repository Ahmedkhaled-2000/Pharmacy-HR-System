/**
 * transferInvoicePdfGenerator.js
 * محرك توليد وطباعة فواتير التحويل المخزني الرسمية (PDF Transfer Vouchers)
 * يتضمن:
 * 1. كود التحويل السري الفريد ورمز الباركود العريض للاستلام السريع في الفرع.
 * 2. جدول البنود التفصيلي مع أرقام التشغيلات وتواريخ الصلاحية.
 * 3. ملخص الكميات والتكلفة وأماكن التوقيعات الرسمية.
 */

import { renderCode128Svg } from './labelPrintService';

export function generateTransferInvoiceHtml(transfer, items = [], companyInfo = {}) {
  const transferNumber = transfer.transfer_number || transfer.id || 'TRF-0000';
  const verificationCode = transfer.verification_code || transferNumber;
  const sourceName = transfer.source_name || transfer.source_location_name || 'المخزن الرئيسي';
  const destName = transfer.destination_name || transfer.destination_location_name || 'فرع الصيدلية';
  const dateStr = transfer.dispatched_at || transfer.created_at
    ? new Date(transfer.dispatched_at || transfer.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

  const barcodeSvg = renderCode128Svg(verificationCode, { height: 44, barWidth: 1.4 });

  let totalQty = 0;
  let totalPublicValue = 0;

  const rowsHtml = items.map((item, idx) => {
    const qty = parseFloat(item.quantity_dispatched || item.quantity_approved || item.quantity_requested || 0);
    const publicPrice = parseFloat(item.public_price || 0);
    const lineTotal = qty * publicPrice;
    totalQty += qty;
    totalPublicValue += lineTotal;

    const expStr = item.expiry_date ? String(item.expiry_date).slice(0, 7) : '-';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 8px 6px; text-align: center; font-weight: bold; color: #475569;">${idx + 1}</td>
        <td style="padding: 8px 6px; text-align: right;">
          <div style="font-weight: 700; color: #0f172a;">${item.trade_name_ar || item.medication_name || 'اسم الصنف'}</div>
          ${item.trade_name_en ? `<div style="font-size: 9.5px; color: #64748b; direction: ltr; text-align: right;">${item.trade_name_en}</div>` : ''}
        </td>
        <td style="padding: 8px 6px; text-align: center; font-family: monospace; font-weight: 600;">${item.batch_number || 'B-STOCK'}</td>
        <td style="padding: 8px 6px; text-align: center; color: #0369a1; font-weight: bold;">${expStr}</td>
        <td style="padding: 8px 6px; text-align: center;">${item.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
        <td style="padding: 8px 6px; text-align: center; font-weight: 800; font-size: 12px; color: #047857;">${qty}</td>
        <td style="padding: 8px 6px; text-align: left; font-weight: 600;">${publicPrice.toFixed(2)}</td>
        <td style="padding: 8px 6px; text-align: left; font-weight: 800; color: #0f172a;">${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>إذن تحويل مخزني - ${transferNumber}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          background: #fff;
          color: #0f172a;
          padding: 10px;
        }
        .header-card {
          border-bottom: 2px solid #0f766e;
          padding-bottom: 12px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
        }
        .barcode-box {
          border: 2px dashed #0f766e;
          background: #f0fdfa;
          border-radius: 8px;
          padding: 8px 16px;
          text-align: center;
          display: inline-block;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background: #0f766e;
          color: #fff;
          padding: 8px 6px;
          font-size: 11.5px;
          font-weight: 700;
          text-align: center;
        }
        .summary-card {
          display: flex;
          justify-content: flex-end;
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-badge {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 14px;
          text-align: center;
        }
        .signatures {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 40px;
          border-top: 1px dashed #cbd5e1;
          padding-top: 15px;
        }
        .sig-box {
          text-align: center;
          font-size: 11px;
          color: #334155;
        }
        .sig-line {
          height: 45px;
          border-bottom: 1px solid #94a3b8;
          margin-bottom: 6px;
        }
      </style>
    </head>
    <body>
      <div class="header-card">
        <div>
          <h1 style="font-size: 20px; color: #0f766e; margin-bottom: 4px;">إذن تحويل بضاعة بين الفروع والمخازن</h1>
          <div style="font-size: 12px; color: #475569;">رقم الإذن: <strong style="color: #0f172a;">${transferNumber}</strong></div>
          <div style="font-size: 11px; color: #64748b;">تاريخ الصرف: ${dateStr}</div>
        </div>
        <div class="barcode-box">
          <div style="font-size: 10px; font-weight: bold; color: #0f766e; margin-bottom: 2px;">كود الاستلام السريع بالفرع (Scan / Enter PIN)</div>
          <div style="max-width: 200px; margin: 0 auto;">${barcodeSvg}</div>
          <div style="font-size: 12px; font-weight: 900; letter-spacing: 1px; color: #047857; margin-top: 2px;">* ${verificationCode} *</div>
        </div>
      </div>

      <div class="meta-grid">
        <div>
          <div style="font-size: 11px; color: #64748b;">الموقع المُرسِل (المصدر):</div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a;">🏢 ${sourceName}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 4px;">المسؤول عن الصرف: ${transfer.dispatched_by_name || transfer.requested_by_name || 'أمين المخزن'}</div>
        </div>
        <div>
          <div style="font-size: 11px; color: #64748b;">الموقع المُستلِم (الوجهة):</div>
          <div style="font-size: 13px; font-weight: 800; color: #0f172a;">🏪 ${destName}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 4px;">السائق / المندوب: ${transfer.driver_name || 'مندوب النقل الداخلي'} ${transfer.driver_phone ? `(${transfer.driver_phone})` : ''}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th style="text-align: right;">الصنف الدوائي</th>
            <th style="width: 80px;">رقم التشغيلة</th>
            <th style="width: 75px;">الصلاحية</th>
            <th style="width: 50px;">الوحدة</th>
            <th style="width: 60px;">الكمية</th>
            <th style="width: 70px;">سعر الجمهور</th>
            <th style="width: 80px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="summary-card">
        <div class="stat-badge">
          <div style="font-size: 10.5px; color: #64748b;">عدد الأصناف المختلفة</div>
          <div style="font-size: 15px; font-weight: 800; color: #0f172a;">${items.length} صنف</div>
        </div>
        <div class="stat-badge">
          <div style="font-size: 10.5px; color: #64748b;">إجمالي عدد العلب / الوحدات</div>
          <div style="font-size: 15px; font-weight: 900; color: #047857;">${totalQty} علبة</div>
        </div>
        <div class="stat-badge">
          <div style="font-size: 10.5px; color: #64748b;">إجمالي القيمة بسعر الجمهور</div>
          <div style="font-size: 15px; font-weight: 900; color: #0f766e;">${totalPublicValue.toFixed(2)} ج.م</div>
        </div>
      </div>

      <div class="signatures">
        <div class="sig-box">
          <div>أمين المخزن المُسلِّم</div>
          <div class="sig-line"></div>
          <div>الاسم والتوقيع: .....................</div>
        </div>
        <div class="sig-box">
          <div>مندوب التوصيل / السائق</div>
          <div class="sig-line"></div>
          <div>الاسم والتوقيع: .....................</div>
        </div>
        <div class="sig-box">
          <div>صيدلي الفرع المُستلِم</div>
          <div class="sig-line"></div>
          <div>الاسم وخاتم الفرع: .................</div>
        </div>
      </div>

      <div style="margin-top: 25px; text-align: center; font-size: 9.5px; color: #94a3b8; border-top: 0.5px solid #e2e8f0; padding-top: 6px;">
        نظام إدارة سلاسل الصيدليات الموحد PharmaOS • تم التوليد آلياً بتاريخ ${dateStr} • كود الاستلام: ${verificationCode}
      </div>

      <script>
        window.addEventListener('load', () => {
          setTimeout(() => { window.print(); }, 250);
        });
      </script>
    </body>
    </html>
  `;
}

export function printTransferInvoicePdf(transfer, items = [], companyInfo = {}) {
  const html = generateTransferInvoiceHtml(transfer, items, companyInfo);
  const printWin = window.open('', '_blank', 'width=900,height=800');
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  }
}
