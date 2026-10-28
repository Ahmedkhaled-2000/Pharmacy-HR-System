/**
 * labelPrintService.js
 * محرك طباعة ملصقات الباركود الحرارية الذكية وتشفير باركود PharmaFly
 * يدعم:
 * 1. تشفير وفك تشفير باركود PharmaFly الذكي (الصنف + التشغيلة + الصلاحية + المورد).
 * 2. توليد باركود Code128 عالي الدقة بصيغة SVG خفيفة متوافقة مع دقة 203dpi/300dpi للطابعات الحرارية.
 * 3. معاينة وطباعة حرارية بأبعاد دقيقة بالمليمتر (50x25mm, 40x25mm, 38x25mm).
 * 4. طباعة صامتة فورية عبر Electron أو متصفح الويب (iframe).
 */

// ── 1. تشفير وفك تشفير باركود PharmaFly الذكي ──────────────────────────────
export function generatePharmaFlyBarcode({ medicationId, batchNumber, expiryDate, supplierCode }) {
  const cleanId = String(medicationId || '').replace(/\D/g, '').slice(-5) || '1001';
  const cleanBatch = String(batchNumber || 'B1').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'B1';

  let expYYMM = '2712';
  if (expiryDate) {
    const cleanExp = String(expiryDate).replace(/\D/g, '');
    if (cleanExp.length >= 4) {
      if (cleanExp.length >= 6) {
        // e.g. 2027-08 -> 2708
        expYYMM = cleanExp.slice(2, 4) + cleanExp.slice(4, 6);
      } else {
        expYYMM = cleanExp.slice(0, 4);
      }
    }
  }

  const cleanSupp = String(supplierCode || 'S01').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'S01';

  return `P${cleanId}-${cleanBatch}-${expYYMM}-${cleanSupp}`;
}

export function parsePharmaFlyBarcode(scannedText) {
  if (!scannedText) return null;
  const raw = String(scannedText).trim();

  // 1. نمط باركود PharmaFly: P1042-B24A-2708-U01
  const match = raw.match(/^P([0-9a-zA-Z]+)-([a-zA-Z0-9]+)-(\d{4})-([a-zA-Z0-9]+)$/i);
  if (match) {
    const [, medIdPart, batchPart, expYYMM, suppPart] = match;
    const year = `20${expYYMM.slice(0, 2)}`;
    const month = expYYMM.slice(2, 4);

    return {
      isPharmaFly: true,
      rawBarcode: raw,
      medicationIdPart: medIdPart,
      batchNumber: batchPart,
      expiryDate: `${year}-${month}`,
      expiryDateFormatted: `${month}/${year}`,
      supplierCode: suppPart
    };
  }

  // 2. نمط باركود التشغيلة والصلاحية ثنائي الأبعاد GS1 DataMatrix للأدوية: (01)...(17)YYMMDD(10)BATCH...
  const gs1ParenMatch = raw.match(/\(01\)(\d{14})\(17\)(\d{6})\(10\)([a-zA-Z0-9_-]+)/);
  if (gs1ParenMatch) {
    const [, gtin, expYYMMDD, batchPart] = gs1ParenMatch;
    const year = `20${expYYMMDD.slice(0, 2)}`;
    const month = expYYMMDD.slice(2, 4);
    const day = expYYMMDD.slice(4, 6);
    return {
      isPharmaFly: true,
      isGS1: true,
      rawBarcode: raw,
      medicationIdPart: gtin,
      batchNumber: batchPart,
      expiryDate: `${year}-${month}-${day}`,
      expiryDateFormatted: `${month}/${year}`,
      supplierCode: ''
    };
  }

  // GS1 بدون أقواس مع معرفات التطبيق 01 و 17 و 10
  const gs1RawMatch = raw.match(/^01(\d{14})17(\d{6})10([a-zA-Z0-9_-]+)/);
  if (gs1RawMatch) {
    const [, gtin, expYYMMDD, batchPart] = gs1RawMatch;
    const year = `20${expYYMMDD.slice(0, 2)}`;
    const month = expYYMMDD.slice(2, 4);
    const day = expYYMMDD.slice(4, 6);
    return {
      isPharmaFly: true,
      isGS1: true,
      rawBarcode: raw,
      medicationIdPart: gtin,
      batchNumber: batchPart,
      expiryDate: `${year}-${month}-${day}`,
      expiryDateFormatted: `${month}/${year}`,
      supplierCode: ''
    };
  }

  return null;
}

// ── 2. مولد باركود Code 128 خفيف ودقيق (SVG Vector Renderer) ───────────────
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export function renderCode128Svg(text, { height = 38, showText = true, barWidth = 1.3 } = {}) {
  const clean = String(text || '').trim();
  if (!clean) return '';

  // Code 128 Set B start code is 104
  let checksum = 104;
  const codes = [104];

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i) - 32;
    codes.push(charCode);
    checksum += charCode * (i + 1);
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(106); // Stop code

  let patternStr = '';
  for (const c of codes) {
    patternStr += CODE128_PATTERNS[c] || '';
  }

  // Draw bars
  let currentX = 10;
  const bars = [];
  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10) * barWidth;
    if (i % 2 === 0) {
      bars.push(`<rect x="${currentX.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="${height}" fill="#000" />`);
    }
    currentX += width;
  }

  const totalWidth = currentX + 10;
  const totalSvgHeight = showText ? height + 12 : height;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalSvgHeight}" width="100%" height="${totalSvgHeight}px" style="display:block;margin:0 auto;overflow:hidden;">
      ${bars.join('')}
      ${showText ? `<text x="${(totalWidth / 2).toFixed(1)}" y="${height + 10}" text-anchor="middle" font-family="'Cairo', monospace" font-size="9" font-weight="700" fill="#000">${clean}</text>` : ''}
    </svg>
  `;
}

// ── 3. توليد كود HTML الكامل لملصق أو شيت ملصقات حرارية ─────────────────────
export function generateThermalLabelHtml(label, template = {}) {
  const {
    width_mm = 50,
    height_mm = 25,
    show_pharmacy_name = true,
    pharmacy_header_text = 'صيدليات الشفاء',
    show_trade_name_ar = true,
    show_trade_name_en = true,
    show_public_price = true,
    show_expiry_date = true,
    show_batch_number = true,
    show_supplier_code = true
  } = template;

  const barcodeSvg = renderCode128Svg(label.label_barcode || label.barcode || 'P1001-B1-2712-S01', {
    height: Math.max(20, height_mm * 1.0),
    showText: false,
    barWidth: 1.15
  });

  const priceText = label.public_price ? `${parseFloat(label.public_price).toFixed(2)} ج.م` : '';
  const expText = label.expiry_date ? String(label.expiry_date).slice(0, 7) : '';

  return `
    <div class="pharma-label-sticker" style="
      width: ${width_mm}mm;
      height: ${height_mm}mm;
      max-width: ${width_mm}mm;
      max-height: ${height_mm}mm;
      padding: 1.5mm 2mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: stretch;
      overflow: hidden;
      page-break-after: always;
      font-family: 'Cairo', Tahoma, sans-serif;
      color: #000;
      background: #fff;
    ">
      ${show_pharmacy_name ? `
        <div style="font-size: 7pt; font-weight: 800; text-align: center; border-bottom: 0.5px solid #000; padding-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${pharmacy_header_text}
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 1px;">
        <div style="flex: 1; min-width: 0;">
          ${show_trade_name_ar ? `
            <div style="font-size: 8pt; font-weight: 900; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${label.trade_name_ar || label.name || 'اسم الصنف'}
            </div>
          ` : ''}
          ${show_trade_name_en && label.trade_name_en ? `
            <div style="font-size: 6.5pt; font-weight: 700; color: #222; direction: ltr; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${label.trade_name_en}
            </div>
          ` : ''}
        </div>
        ${show_public_price && priceText ? `
          <div style="font-size: 9pt; font-weight: 900; color: #000; white-space: nowrap; margin-left: 2px;">
            ${priceText}
          </div>
        ` : ''}
      </div>

      <!-- الباركود المطبوع -->
      <div style="width: 100%; margin: 1px 0; display: flex; justify-content: center;">
        ${barcodeSvg}
      </div>

      <!-- السطر السفلي: الصلاحية + التشغيلة + المورد -->
      <div style="display: flex; justify-content: space-between; font-size: 6.5pt; font-weight: 800; border-top: 0.5px solid #000; padding-top: 1px; direction: ltr;">
        ${show_expiry_date && expText ? `<span>Exp: ${expText}</span>` : '<span></span>'}
        ${show_batch_number && label.batch_number ? `<span>B: ${label.batch_number}</span>` : '<span></span>'}
        ${show_supplier_code && label.supplier_code ? `<span>S: ${label.supplier_code}</span>` : '<span></span>'}
      </div>
    </div>
  `;
}

// ── 4. طباعة الملصقات مباشرة (Silent Electron أو متصفح iframe) ──────────────
export function printThermalLabels(labelsList = [], template = {}) {
  if (!Array.isArray(labelsList) || labelsList.length === 0) return;

  const width_mm = template.width_mm || 50;
  const height_mm = template.height_mm || 25;

  // توليد بطاقات الملصقات المكررة حسب الكمية المطلوبة
  const fullHtmlContent = labelsList.map(item => {
    const qty = Math.max(1, parseInt(item.quantity || item.qty || 1, 10));
    const singleSticker = generateThermalLabelHtml(item, template);
    return Array(qty).fill(singleSticker).join('\n');
  }).join('\n');

  const fullDocumentHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>طباعة ملصقات الباركود - PharmaOS</title>
      <style>
        @page {
          size: ${width_mm}mm ${height_mm}mm;
          margin: 0;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          margin: 0;
          padding: 0;
          background: #fff;
        }
        .pharma-label-sticker {
          page-break-after: always;
          break-after: page;
        }
        @media screen {
          body {
            padding: 20px;
            background: #eee;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .pharma-label-sticker {
            border: 1px dashed #999;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
        }
      </style>
    </head>
    <body>
      ${fullHtmlContent}
      <script>
        window.addEventListener('load', () => {
          setTimeout(() => {
            window.print();
          }, 250);
        });
      </script>
    </body>
    </html>
  `;

  // الطباعة عبر iframe خفي
  try {
    const existingIframe = document.getElementById('pharma_silent_print_iframe');
    if (existingIframe) existingIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'pharma_silent_print_iframe';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.border = 'none';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(fullDocumentHtml);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) {
        console.warn('Iframe print failed:', e);
      }
    }, 400);
  } catch (err) {
    console.error('[Label Print Error]:', err);
    // Fallback: open print window
    const printWin = window.open('', '_blank', `width=600,height=400`);
    if (printWin) {
      printWin.document.write(fullDocumentHtml);
      printWin.document.close();
    }
  }
}

