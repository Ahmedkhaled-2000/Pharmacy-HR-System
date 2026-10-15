/**
 * thermalReceiptEngine.js
 * المحرك الهندسي المركزي الشامل لطباعة ريسيتات الكاشير الحرارية (POS Thermal Printing Engine)
 * مصمم لمعايير طابعات الكاشير 80mm و 58mm (Epson, Xprinter, Rongta, Sunmi, Bixolon وغيرها)
 * 
 * المزايا الهندسية الفائقة:
 * 1. ضبط مساحة الطباعة الآمنة (Safe Printable Area): 72mm لطابعات 80mm و 48mm لطابعات 58mm لمنع قص أطراف الورقة أو ضياع الأرقام.
 * 2. محرك استخراج ودمج هواتف الفرع الشامل: سحب الهواتف الأرضية والموبايل والواتساب من بيانات الفرع وقاعدة البيانات المركزية.
 * 3. معالجة الشعار الحراري عالي التباين (1-Bit High-Contrast Thermal Logo): تحويل الشعار إلى أحادي اللون فائق الحدة بدون تشتت نقطي باهت.
 * 4. تأمين أرقام الإجماليات والأسعار (Anti-Clipping Protection): هوامش أمان داخلية وتوجيه رقمي LTR محمي لمنع تآكل الأرقام على الحافة اليسرى.
 * 5. منطقة أمان القاطع التلقائي (Auto-Cut Safety Buffer): تغذية ورق 18mm لمنع قطع شفرة الطابعة للباركود أو النصوص.
 */

import { getEffectiveOrgLogo } from './outstockLogoHelper';

/**
 * 1. استخراج ودمج كافة بيانات وهواتف وعنوان الفرع بدقة بالغة
 * يبحث في كائن الفرع الممرر، وفي كاش المتصفح outstock_branches، وفي بيانات الـ HR المركزية
 */
export function resolveBranchThermalDetails(branch, order = null, fallbackSettings = null) {
  let branchName = (branch?.name || order?.branch_name || '').trim();
  let branchAddress = (branch?.address || branch?.branchData?.address || order?.branch_address || '').trim();
  let branchLogo = branch?.logoUrl || branch?.photoUrl || branch?.image || '';

  // تجميع كافة الأرقام المتاحة دون تكرار
  const rawPhones = [];

  const addPhone = (num, type = 'phone') => {
    if (!num) return;
    const clean = String(num).replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, '').trim();
    if (clean && clean.length >= 7 && !rawPhones.some(p => p.number === clean)) {
      rawPhones.push({ number: clean, type });
    }
  };

  // أ) فحص كائن الفرع المباشر
  if (Array.isArray(branch?.phones)) {
    branch.phones.forEach(p => {
      if (typeof p === 'string') addPhone(p, 'phone');
      else if (p && p.number) addPhone(p.number, p.type || 'phone');
    });
  }
  if (branch?.phone) addPhone(branch.phone, 'landline');
  if (branch?.whatsapp_phone || branch?.whatsappPhone) addPhone(branch.whatsapp_phone || branch.whatsappPhone, 'whatsapp');
  if (branch?.mobile) addPhone(branch.mobile, 'mobile');
  if (branch?.landline) addPhone(branch.landline, 'landline');
  if (branch?.branchData) {
    const bd = branch.branchData;
    if (bd.phone) addPhone(bd.phone, 'landline');
    if (bd.whatsapp_phone || bd.whatsappPhone) addPhone(bd.whatsapp_phone || bd.whatsappPhone, 'whatsapp');
    if (Array.isArray(bd.phones)) bd.phones.forEach(p => addPhone(p?.number || p, p?.type || 'phone'));
    if (!branchAddress && bd.address) branchAddress = bd.address.trim();
  }

  // ب) فحص كائن الطلب المباشر
  if (order?.branch_phone || order?.branchPhone) addPhone(order.branch_phone || order.branchPhone, 'phone');
  if (order?.branch_whatsapp) addPhone(order.branch_whatsapp, 'whatsapp');

  // ج) البحث في كاش فروع النواقص outstock_branches وفي بيانات الـ HR المركزية
  if (typeof localStorage !== 'undefined') {
    try {
      // 1. فحص outstock_branches
      const cachedOutstockBranches = localStorage.getItem('outstock_branches');
      if (cachedOutstockBranches) {
        const parsed = JSON.parse(cachedOutstockBranches);
        if (Array.isArray(parsed)) {
          const targetId = branch?.id || order?.branch_id || order?.branchId;
          const matched = parsed.find(b => 
            (targetId && (String(b.id) === String(targetId) || String(b.code) === String(targetId))) ||
            (branchName && b.name && (b.name.includes(branchName) || branchName.includes(b.name)))
          );
          if (matched) {
            if (!branchName) branchName = matched.name;
            if (!branchAddress && matched.address) branchAddress = matched.address.trim();
            if (matched.phone) addPhone(matched.phone, 'landline');
            if (matched.whatsapp_phone) addPhone(matched.whatsapp_phone, 'whatsapp');
            if (Array.isArray(matched.phones)) matched.phones.forEach(p => addPhone(p?.number || p, p?.type || 'phone'));
          }
        }
      }

      // 2. فحص بيانات الـ HR المركزية (pharmacy-tracker-data -> branches)
      const cachedTracker = localStorage.getItem('pharmacy-tracker-data');
      if (cachedTracker) {
        const parsedTracker = JSON.parse(cachedTracker);
        const hrBranches = parsedTracker?.branches || [];
        if (Array.isArray(hrBranches)) {
          const targetId = branch?.id || order?.branch_id || order?.branchId;
          const matchedHr = hrBranches.find(b => 
            (targetId && (String(b.id) === String(targetId) || String(b.branchCode) === String(targetId))) ||
            (branchName && b.name && (b.name.includes(branchName) || branchName.includes(b.name)))
          );
          if (matchedHr) {
            if (!branchName) branchName = matchedHr.name;
            if (!branchAddress && matchedHr.address) branchAddress = matchedHr.address.trim();
            if (!branchLogo && (matchedHr.logoUrl || matchedHr.photoUrl)) branchLogo = matchedHr.logoUrl || matchedHr.photoUrl;
            if (Array.isArray(matchedHr.phones)) {
              matchedHr.phones.forEach(p => addPhone(p?.number || p, p?.type || 'phone'));
            }
            if (matchedHr.phone) addPhone(matchedHr.phone, 'landline');
            if (matchedHr.whatsappPhone || matchedHr.whatsapp_phone) addPhone(matchedHr.whatsappPhone || matchedHr.whatsapp_phone, 'whatsapp');
          }
        }
      }
    } catch (_) {}
  }

  // د) السقوط الاحتياطي على إعدادات الصيدلية العامة إذا لم يتوفر أي هاتف للفرع
  if (rawPhones.length === 0 && fallbackSettings) {
    if (fallbackSettings.phone) addPhone(fallbackSettings.phone, 'phone');
    if (fallbackSettings.whatsappNumber || fallbackSettings.whatsappPhone) {
      addPhone(fallbackSettings.whatsappNumber || fallbackSettings.whatsappPhone, 'whatsapp');
    }
  }

  // فرز وتنسيق الهواتف بشكل احترافي
  const landlines = [];
  const mobiles = [];
  const whatsapps = [];

  rawPhones.forEach(p => {
    const num = p.number;
    const isMobile = num.startsWith('01') || num.startsWith('+201') || num.startsWith('201');
    if (p.type === 'whatsapp') {
      whatsapps.push(num);
    } else if (p.type === 'landline' || !isMobile) {
      landlines.push(num);
    } else {
      mobiles.push(num);
    }
  });

  // بناء نص العرض الموحد
  const phoneDisplayParts = [];
  if (landlines.length > 0) {
    phoneDisplayParts.push(`📞 أرضي: ${landlines.join(' - ')}`);
  }
  if (mobiles.length > 0) {
    phoneDisplayParts.push(`📱 موبايل: ${mobiles.join(' - ')}`);
  }
  if (whatsapps.length > 0 && !mobiles.some(m => whatsapps.includes(m))) {
    phoneDisplayParts.push(`💬 واتساب: ${whatsapps.join(' - ')}`);
  }
  if (phoneDisplayParts.length === 0 && rawPhones.length > 0) {
    phoneDisplayParts.push(`📞 هاتف: ${rawPhones.map(p => p.number).join(' - ')}`);
  }

  const phonesFormatted = phoneDisplayParts.join(' | ');

  // الشعار الفعال عالي التباين
  const effectiveLogo = getEffectiveOrgLogo(branchLogo || fallbackSettings?.pharmacyLogo || fallbackSettings?.logoUrl || '');

  return {
    branchName: branchName || 'صيدلية النور والشفاء',
    branchAddress: branchAddress || '',
    phonesFormatted,
    phonesList: rawPhones,
    primaryPhone: rawPhones[0]?.number || '',
    whatsappPhone: whatsapps[0] || mobiles[0] || '',
    logoUrl: effectiveLogo
  };
}

/**
 * 2. توليد أكواد CSS المعيارية للطباعة الحرارية المانعة للقص
 */
export function getThermalReceiptStyles(profile = 'pos80') {
  const is58 = profile === 'pos58';
  const paperWidth = is58 ? '58mm' : '80mm';
  const printableWidth = is58 ? '48mm' : '72mm';
  const baseFontSize = is58 ? '10px' : '11.5px';
  const headerFontSize = is58 ? '13px' : '15px';
  const totalFontSize = is58 ? '11.5px' : '13px';

  return `
    @page {
      size: ${paperWidth} auto;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      direction: rtl !important;
      text-align: right !important;
      font-family: 'Cairo', 'Segoe UI', Tahoma, 'Arial Black', Arial, sans-serif !important;
      font-size: ${baseFontSize} !important;
      line-height: 1.35 !important;
      font-weight: 900 !important;
      -webkit-font-smoothing: antialiased;
      -webkit-text-stroke: 0.35px #000;
    }
    body {
      width: ${printableWidth} !important;
      max-width: ${printableWidth} !important;
      margin: 0 auto !important;
      padding: 1mm 2mm 18mm 2mm !important; /* 18mm buffer أسفل الريسيت لتجاوز شفرة القاطع التلقائي */
    }
    .receipt-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 auto !important;
    }
    .receipt-copy {
      padding-bottom: 6px;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    /* ── ترويسة الريسيت والشعار ── */
    .receipt-header {
      text-align: center;
      margin-bottom: 7px;
      border-bottom: 2px dashed #000 !important;
      padding-bottom: 6px;
    }
    .receipt-logo-wrapper {
      text-align: center;
      margin-bottom: 5px;
    }
    .receipt-logo-img {
      max-height: ${is58 ? '50px' : '65px'} !important;
      max-width: ${is58 ? '130px' : '160px'} !important;
      object-fit: contain !important;
      display: inline-block !important;
      /* فلتر التباين الفائق لتحويل الشعار إلى 1-bit أسود ناصع للطابعات الحرارية */
      filter: grayscale(100%) contrast(300%) brightness(90%) !important;
      -webkit-filter: grayscale(100%) contrast(300%) brightness(90%) !important;
      image-rendering: -webkit-optimize-contrast !important;
      image-rendering: crisp-edges !important;
    }
    .receipt-header h3 {
      margin: 0 0 3px;
      font-size: ${headerFontSize};
      font-weight: 900 !important;
      color: #000000 !important;
      letter-spacing: -0.2px;
      -webkit-text-stroke: 0.4px #000;
    }
    .receipt-subtitle {
      margin: 2px 0 3px;
      font-size: ${is58 ? '9.5px' : '11px'};
      font-weight: 900 !important;
      color: #000000 !important;
      -webkit-text-stroke: 0.35px #000;
    }
    .receipt-branch-phones {
      margin: 2px 0;
      font-size: ${is58 ? '9px' : '10.5px'};
      font-weight: 900 !important;
      color: #000000 !important;
      line-height: 1.3;
    }
    .receipt-branch-address {
      margin: 2px 0 0;
      font-size: ${is58 ? '8.5px' : '10px'};
      font-weight: 900 !important;
      color: #000000 !important;
      line-height: 1.25;
    }

    /* ── بيانات الإيصال (Meta) ── */
    .receipt-meta {
      margin-bottom: 7px;
      font-size: ${is58 ? '9.5px' : '11px'};
      line-height: 1.4;
      border-bottom: 2px dashed #000 !important;
      padding-bottom: 5px;
      font-weight: 900 !important;
    }
    .receipt-meta > div {
      display: flex;
      justify-content: space-between;
      margin: 1.5px 0;
    }
    .receipt-meta strong, .receipt-meta span {
      font-weight: 900 !important;
      color: #000000 !important;
      -webkit-text-stroke: 0.35px #000;
    }

    /* ── جدول الأصناف المحكم الثابت (Fixed Column Zero-Clip Table) ── */
    .receipt-table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      font-size: ${is58 ? '9px' : '10.5px'} !important;
      margin-bottom: 7px !important;
      font-weight: 900 !important;
    }
    .receipt-table th, .receipt-table td {
      padding: 3px 1px;
      vertical-align: middle;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      font-weight: 900 !important;
      color: #000000 !important;
    }
    .receipt-table th {
      border-bottom: 2px solid #000 !important;
      font-weight: 900 !important;
      text-align: center;
      -webkit-text-stroke: 0.35px #000;
    }
    .receipt-table td {
      border-bottom: 1.5px dashed #000 !important;
    }
    .receipt-table th.col-name, .receipt-table td.col-name {
      text-align: right;
    }
    .receipt-table th.col-num, .receipt-table td.col-num {
      text-align: center;
    }
    .receipt-table th.col-price, .receipt-table td.col-price {
      text-align: left;
      direction: ltr !important;
      unicode-bidi: isolate !important;
      font-weight: 900 !important;
      white-space: nowrap;
      -webkit-text-stroke: 0.35px #000;
    }

    /* ── جدول ومربعات الإجماليات الآمنة (Anti-Edge Clipping) ── */
    .receipt-totals {
      border-top: 2px dashed #000 !important;
      padding: 5px 3px 2px 3px;
      margin-bottom: 8px;
      font-weight: 900 !important;
    }
    .receipt-totals .row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      margin: 2.5px 0 !important;
      font-size: ${is58 ? '9.5px' : '11px'};
      font-weight: 900 !important;
      color: #000000 !important;
    }
    .receipt-totals .row span:first-child {
      text-align: right;
      font-weight: 900 !important;
    }
    .receipt-totals .row span:last-child {
      text-align: left !important;
      direction: ltr !important;
      unicode-bidi: isolate !important;
      font-weight: 900 !important;
      white-space: nowrap !important;
      padding-left: 2px;
      -webkit-text-stroke: 0.35px #000;
    }
    .receipt-totals .row.grand-total {
      font-size: ${totalFontSize} !important;
      font-weight: 900 !important;
      border-top: 2px solid #000 !important;
      border-bottom: 2px solid #000 !important;
      padding: 3px 0;
      margin: 4px 0 !important;
      -webkit-text-stroke: 0.4px #000;
    }
    .receipt-totals .row.grand-total span:last-child {
      font-size: ${totalFontSize} !important;
      font-weight: 900 !important;
      -webkit-text-stroke: 0.4px #000;
    }
    .receipt-totals .row.remaining-highlight, .receipt-totals .row.deposit-highlight, .deposit-highlight {
      font-weight: 900 !important;
      color: #000 !important;
      border: 2px solid #000 !important;
      padding: 3px 4px;
      border-radius: 4px;
      margin: 4px 0 !important;
      -webkit-text-stroke: 0.35px #000;
    }

    /* ── الباركود والكيو آر والذيل ── */
    .receipt-barcode {
      text-align: center;
      margin: 8px 0 4px;
      font-weight: 900 !important;
    }
    .receipt-barcode svg {
      max-width: 100%;
    }
    .receipt-footer-notes {
      text-align: center;
      font-size: ${is58 ? '8.5px' : '9.5px'};
      font-weight: 900 !important;
      color: #000000 !important;
      margin-top: 5px;
      border-top: 2px dashed #000 !important;
      padding-top: 5px;
      line-height: 1.3;
      -webkit-text-stroke: 0.3px #000;
    }
    .receipt-cut-separator {
      text-align: center;
      font-size: 9.5px;
      font-weight: 900 !important;
      color: #000000 !important;
      margin: 14px 0 10px;
      border-top: 2px dashed #000 !important;
      padding-top: 4px;
      page-break-after: always !important;
      break-after: page !important;
    }
  `;
}

/**
 * 3. توليد الشعار الحراري النقي عالي الوضوح
 */
export function renderThermalLogo(logoUrl, branchName = 'صيدلية النور والشفاء') {
  if (logoUrl) {
    return `
      <div class="receipt-logo-wrapper">
        <img src="${logoUrl}" alt="شعار المؤسسة" class="receipt-logo-img" />
      </div>
    `;
  }

  // شعار خطي هندسي بديع عالي التباين عند عدم توفر صورة
  return `
    <div style="text-align: center; margin-bottom: 6px;">
      <div style="display: inline-block; border: 2px solid #000; padding: 3px 12px; border-radius: 6px; font-weight: 900; font-size: 13.5px; letter-spacing: 0.5px;">
        ❖ ${branchName} ❖
      </div>
    </div>
  `;
}

/**
 * 4. محرك تنفيذ مهمة الطباعة المعزولة المباشرة للطابعات الحرارية
 */
export function executeThermalPrintJob(innerHtmlContent, jobTitle = 'Receipt', profile = 'pos80') {
  return new Promise((resolve) => {
    const oldFrame = document.getElementById('isolated-thermal-print-frame');
    if (oldFrame) {
      try { document.body.removeChild(oldFrame); } catch {}
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'isolated-thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const isA4 = profile === 'a4';
    const pageStyles = isA4
      ? `
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        body {
          width: 100%;
          max-width: 180mm;
          margin: 0 auto;
          padding: 8px;
          font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          direction: rtl;
        }
      `
      : getThermalReceiptStyles(profile);

    const htmlDocument = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${jobTitle}</title>
        <style>
          ${pageStyles}
        </style>
      </head>
      <body>
        <div class="receipt-container">
          ${innerHtmlContent}
        </div>
      </body>
      </html>
    `;

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlDocument);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.warn('Iframe print focus error:', err);
      }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
        resolve(true);
      }, 1200);
    }, 380);
  });
}
