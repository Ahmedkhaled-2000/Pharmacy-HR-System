/**
 * printAccountingReport.js
 * وحدة الطباعة المعزولة الاحترافية لمنظومة الحسابات العامة
 * تقوم بطباعة كشوف الحسابات والقوائم المالية في بيئة معزولة تماماً (Isolated A4 Print Engine)
 * بدون أي تداخل مع واجهة البرنامج أو النوافذ المنبثقة
 */

export function printIsolatedReport({
  title = 'كشف حساب رسمي',
  subtitle = '',
  documentNumber = '',
  date = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }),
  metadata = [], // Array of { label: string, value: string }
  summaryCards = [], // Array of { title: string, value: string, color?: string }
  headers = [], // Array of string column headers
  rows = [], // Array of row arrays: [ [col1, col2, ...], ... ]
  footerNotes = 'تم استخراج هذا التقرير آلياً من منظومة الحسابات العامة وشجرة الحسابات (ERP Enterprise).',
  companyName = 'مجموعة صيدليات الإدارة الطبية',
}) {
  // Create hidden iframe for totally isolated printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;

  // Build Metadata HTML
  const metadataHtml = metadata.length > 0
    ? `<div class="meta-grid">
        ${metadata.map((m) => `
          <div class="meta-item">
            <span class="meta-label">${m.label}:</span>
            <strong class="meta-val">${m.value}</strong>
          </div>
        `).join('')}
      </div>`
    : '';

  // Build Summary Cards HTML
  const summaryCardsHtml = summaryCards.length > 0
    ? `<div class="summary-cards">
        ${summaryCards.map((c) => `
          <div class="summary-card" style="border-top-color: ${c.color || '#0d9488'};">
            <div class="card-title">${c.title}</div>
            <div class="card-value" style="color: ${c.color || '#0f172a'};" dir="ltr">${c.value}</div>
          </div>
        `).join('')}
      </div>`
    : '';

  // Build Table HTML
  const theadHtml = `
    <thead>
      <tr>
        ${headers.map((h) => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
  `;

  const tbodyHtml = `
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${headers.length}" style="text-align: center; padding: 24px; color: #64748b;">لا توجد حركات مسجلة</td></tr>`
        : rows.map((row) => `
          <tr>
            ${row.map((cell, idx) => {
              const isNumeric = typeof cell === 'string' && (cell.includes('ج.م') || cell.includes('.') || !isNaN(cell));
              return `<td ${isNumeric ? 'class="numeric-cell"' : ''}>${cell}</td>`;
            }).join('')}
          </tr>
        `).join('')
      }
    </tbody>
  `;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>${title} - ${companyName}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 14mm 16mm 14mm 16mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #0f172a;
          background: #ffffff;
          font-size: 11.5px;
          line-height: 1.4;
          direction: rtl;
        }

        /* ── Official Header ── */
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2.5px solid #0d9488;
          padding-bottom: 12px;
          margin-bottom: 14px;
        }
        .header-brand h1 {
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
        }
        .header-brand p {
          margin: 2px 0 0;
          font-size: 11px;
          color: #475569;
        }
        .header-meta {
          text-align: left;
          font-size: 10.5px;
          color: #475569;
          line-height: 1.6;
        }
        .header-meta strong {
          color: #0f172a;
        }

        /* ── Report Title Banner ── */
        .report-title-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .report-title-banner h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 800;
          color: #0f766e;
        }
        .report-title-banner .doc-num {
          font-family: monospace;
          background: #e2e8f0;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
        }

        /* ── Meta Grid ── */
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 14px;
          font-size: 11px;
        }
        .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .meta-label {
          color: #64748b;
        }
        .meta-val {
          color: #0f172a;
        }

        /* ── Summary Cards ── */
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .summary-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-top: 3px solid #0d9488;
          border-radius: 8px;
          padding: 8px 12px;
        }
        .card-title {
          font-size: 10.5px;
          color: #64748b;
          margin-bottom: 4px;
        }
        .card-value {
          font-size: 14px;
          font-weight: 800;
          font-family: monospace;
        }

        /* ── Table ── */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
          font-size: 10.5px;
        }
        th {
          background: #f1f5f9;
          color: #1e293b;
          font-weight: 800;
          text-align: right;
          padding: 7px 10px;
          border: 1px solid #cbd5e1;
        }
        td {
          padding: 6px 10px;
          border: 1px solid #e2e8f0;
          color: #334155;
        }
        tr:nth-child(even) {
          background: #fafafa;
        }
        .numeric-cell {
          font-family: monospace;
          direction: ltr;
          text-align: left;
          font-weight: 600;
        }

        /* ── Signatures & Footer ── */
        .report-signatures {
          display: flex;
          justify-content: space-between;
          margin-top: 24px;
          padding-top: 14px;
          border-top: 1px dashed #cbd5e1;
          page-break-inside: avoid;
        }
        .sig-box {
          text-align: center;
          width: 180px;
        }
        .sig-box .sig-title {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 30px;
        }
        .sig-box .sig-line {
          border-bottom: 1px solid #94a3b8;
          margin-bottom: 4px;
        }

        .report-footer {
          margin-top: 18px;
          text-align: center;
          font-size: 9.5px;
          color: #94a3b8;
          border-top: 1px solid #f1f5f9;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="report-header">
        <div class="header-brand">
          <h1>${companyName}</h1>
          <p>الإدارة المالية والمحاسبية · منظومة ERP الشاملة</p>
        </div>
        <div class="header-meta">
          <div>تاريخ الطباعة: <strong>${date}</strong></div>
          <div>النظام: <strong>ERP Enterprise 2026</strong></div>
        </div>
      </div>

      <!-- Title Banner -->
      <div class="report-title-banner">
        <div>
          <h2>${title}</h2>
          ${subtitle ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${subtitle}</div>` : ''}
        </div>
        ${documentNumber ? `<span class="doc-num">${documentNumber}</span>` : ''}
      </div>

      <!-- Metadata -->
      ${metadataHtml}

      <!-- Summary Cards -->
      ${summaryCardsHtml}

      <!-- Transactions / Data Table -->
      <table>
        ${theadHtml}
        ${tbodyHtml}
      </table>

      <!-- Signatures -->
      <div class="report-signatures">
        <div class="sig-box">
          <div class="sig-title">المحاسب المسؤول</div>
          <div class="sig-line"></div>
          <div style="font-size: 9px; color: #94a3b8;">التوقيع والتاريخ</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">المراجع المالي</div>
          <div class="sig-line"></div>
          <div style="font-size: 9px; color: #94a3b8;">التوقيع والاعتماد</div>
        </div>
        <div class="sig-box">
          <div class="sig-title">المدير المالي العام</div>
          <div class="sig-line"></div>
          <div style="font-size: 9px; color: #94a3b8;">الختم والمصادقة</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="report-footer">
        ${footerNotes}
      </div>
    </body>
    </html>
  `);
  doc.close();

  // Trigger print cleanly in iframe
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    // Clean up iframe after user completes/cancels print
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }, 350);
}
