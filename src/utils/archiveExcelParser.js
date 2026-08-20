/**
 * archiveExcelParser.js
 * Comprehensive Excel & CSV Smart Parser Engine for Pharmacy Archive System
 * 100% Identical Algorithms & Capabilities as Standalone Archive System
 * 
 * Features:
 * - Dynamic table header detection (detectHeaderRowIndex)
 * - Free-form top metadata mining for invoice #, supplier, and date (mineHeaderMetadata)
 * - Broad Arabic & English column aliases (COLUMN_ALIASES)
 * - Custom per-supplier column mappings support (findBestFieldMatch)
 * - Multi-sheet parsing & multi-invoice splitting (parseExcelOrCsvMultiInvoices)
 * - Robust Arabic digit conversion, currency stripping, number & date normalization
 */

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Common Arabic/English column headers for smart auto-mapping
export const COLUMN_ALIASES = {
  productName: [
    'اسم الصنف', 'اسم المنتج', 'الصنف', 'الاسم', 'المنتج', 'اسم المستحضر', 'product', 'item', 
    'description', 'name', 'اسم الدواء', 'الأصناف', 'الاصناف', 'اسم المستحضرات', 'دواء', 
    'البيان', 'المادة', 'trade name', 'drug', 'drug name', 'item name', 'الصنف / البيان'
  ],
  quantity: [
    'الكمية', 'العدد', 'كمية', 'qty', 'quantity', 'count', 'الوارد', 'الكميه', 
    'عدد العلب', 'قطع', 'الوحدات', 'units', 'unit', 'الكمية الواردة'
  ],
  unitPrice: [
    'سعر الوحدة', 'السعر', 'سعر الشراء', 'سعر التكلفة', 'price', 'unit price', 'cost', 
    'سعر', 'سعر الفاتورة', 'سعر الجملة', 'سعر الوحدة بعد الخصم', 'rate', 'unit cost', 'سعر القطعة'
  ],
  sellingPrice: [
    'سعر البيع', 'سعر الجمهور', 'سعر البيع للجمهور', 'selling price', 'retail price', 
    'rrp', 'الجمهور', 'سعر رسمي', 'سعر المستهلك', 'retail', 'public price', 'price public'
  ],
  discount: [
    'الخصم', 'خصم', 'نسبة الخصم', 'discount', 'disc', 'خصم %', 'قيمة الخصم', 'الخصم %', 
    'disc %', 'disc%', 'نسبه الخصم'
  ],
  totalPrice: [
    'الإجمالي', 'الصافي بعد الخصم', 'المجموع', 'الصافي', 'total', 'amount', 'net', 'القيمة', 
    'القيمة الصافية', 'المبلغ (ج.م)', 'net amount', 'total price', 'صافي المبلغ'
  ],
  batchNumber: [
    'رقم التشغيلة', 'التشغيلة', 'رقم الباتش', 'الباتش', 'batch', 'batch no', 'lot', 
    'lot no', 'التشغيله', 'رقم الوجبة', 'batch_no', 'رقم الشحنة'
  ],
  expiryDate: [
    'تاريخ الصلاحية', 'الصلاحية', 'تاريخ الانتهاء', 'الانتهاء', 'expiry', 'exp date', 
    'exp', 'الصلاحيه', 'تاريخ النفاذ', 'exp_date', 'expiration', 'تاريخ الصلاحية (شهر/سنة)'
  ],

  // Header metadata fields
  invoiceNumber: [
    'رقم الفاتورة', 'الفاتورة', 'رقم المستند', 'فاتورة رقم', 'رقم الفاتوره', 'invoice number', 
    'inv no', 'invoice_no', 'invoice_id', 'رقم السند', 'رقم الإذن', 'رقم الفاتورة الإلكترونية'
  ],
  supplierName: [
    'المورد', 'الشركة', 'اسم المورد', 'شركة الأدوية', 'اسم الشركة', 'المورد / الشركة', 
    'supplier', 'company', 'vendor', 'اسم العميل', 'الفرع'
  ],
  invoiceDate: [
    'تاريخ الفاتورة', 'التاريخ', 'تاريخ المستند', 'تاريخ', 'invoice date', 'date', 
    'تاريخ الإذن', 'تاريخ الإرسال'
  ],
};

export function convertArabicDigitsToEnglish(str) {
  if (!str) return '';
  return str.toString().replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

export function normalizeHeader(header) {
  if (!header) return '';
  const converted = convertArabicDigitsToEnglish(header.toString());
  return converted.trim().toLowerCase().replace(/[_\s\-\.]+/g, '');
}

export function findBestFieldMatch(headerName, customMappings = null) {
  if (!headerName) return null;
  const rawClean = headerName.toString().trim();
  
  // 1. Check supplier-specific custom mappings first
  if (customMappings && customMappings[rawClean]) {
    return customMappings[rawClean];
  }

  const norm = normalizeHeader(rawClean);
  if (!norm) return null;

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias);
      if (norm === normAlias || norm.includes(normAlias)) {
        return field;
      }
    }
  }
  return null;
}

export function parseCleanNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = convertArabicDigitsToEnglish(String(val)).trim();
  // Strip currency symbols & text (ج.م, ريال, EGP, $, LE, %)
  str = str.replace(/(ج\.م|ريال|egp|\$|le|جنيه|ر\.س|%)/gi, '').trim();
  // Strip commas used as thousands separators
  str = str.replace(/,/g, '');
  
  const match = str.match(/[-+]?\d*\.?\d+/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
}

export function parseCleanDate(val) {
  if (val === undefined || val === null || val === '') return undefined;

  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return val.toISOString().split('T')[0];
    }
    return undefined;
  }

  // Handle Excel Serial Date (e.g. 45231)
  if (typeof val === 'number' && val > 20000 && val < 60000) {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (e) {}
  }

  let str = convertArabicDigitsToEnglish(String(val)).trim();
  if (!str) return undefined;

  // Handle standard formats: YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [p1, p2, p3] = parts.map((p) => p.trim());
    if (p1.length === 4) {
      // YYYY-MM-DD
      const m = p2.padStart(2, '0');
      const d = p3.padStart(2, '0');
      return `${p1}-${m}-${d}`;
    } else if (p3.length === 4) {
      // DD-MM-YYYY
      const d = p1.padStart(2, '0');
      const m = p2.padStart(2, '0');
      return `${p3}-${m}-${d}`;
    }
  }

  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().split('T')[0];
  }

  return undefined;
}

/**
 * Mines the top rows (before the item table header) for invoice-level metadata.
 */
export function mineHeaderMetadata(rawRows, headerRowIndex) {
  let minedInvoiceNumber = null;
  let minedSupplierName = null;
  let minedInvoiceDate = null;

  const topRowsLimit = Math.min(headerRowIndex, 10);

  for (let r = 0; r < topRowsLimit; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] || '').trim();
      if (!cellText) continue;

      const norm = normalizeHeader(cellText);

      // Check for Invoice Number in cell or next cell
      if (!minedInvoiceNumber && COLUMN_ALIASES.invoiceNumber.some((alias) => norm.includes(normalizeHeader(alias)))) {
        const nextCell = String(row[c + 1] || '').trim();
        const inlineMatch = cellText.match(/(?:رقم الفاتورة|فاتورة|inv|invoice|سند)\s*[:#\-]?\s*([A-Za-z0-9\-]+)/i);
        if (inlineMatch) {
          minedInvoiceNumber = inlineMatch[1];
        } else if (nextCell) {
          minedInvoiceNumber = nextCell;
        }
      }

      // Check for Supplier Name in cell or next cell
      if (!minedSupplierName && COLUMN_ALIASES.supplierName.some((alias) => norm.includes(normalizeHeader(alias)))) {
        const nextCell = String(row[c + 1] || '').trim();
        const inlineMatch = cellText.match(/(?:المورد|الشركة|supplier|company)\s*[:#\-]?\s*([^\n\r,]+)/i);
        if (inlineMatch) {
          minedSupplierName = inlineMatch[1].trim();
        } else if (nextCell) {
          minedSupplierName = nextCell;
        }
      }

      // Check for Invoice Date in cell or next cell
      if (!minedInvoiceDate && COLUMN_ALIASES.invoiceDate.some((alias) => norm.includes(normalizeHeader(alias)))) {
        const nextCell = row[c + 1];
        const parsedNextDate = parseCleanDate(nextCell);
        if (parsedNextDate) {
          minedInvoiceDate = parsedNextDate;
        } else {
          const parsedCellDate = parseCleanDate(cellText);
          if (parsedCellDate) minedInvoiceDate = parsedCellDate;
        }
      }
    }
  }

  return {
    minedInvoiceNumber,
    minedSupplierName,
    minedInvoiceDate,
  };
}

/**
 * Automatically detects the dynamic table header row index by scoring each row.
 */
export function detectHeaderRowIndex(rawRows, customMappings = null) {
  let bestRowIndex = 0;
  let maxMatches = 0;
  let bestFieldMapping = {};
  let bestRawHeaders = {};

  const scanLimit = Math.min(rawRows.length, 25);

  for (let r = 0; r < scanLimit; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let currentMatches = 0;
    const currentMapping = {};
    const currentRawHeaders = {};

    row.forEach((cell, colIdx) => {
      const cellText = String(cell || '').trim();
      if (!cellText) return;

      currentRawHeaders[colIdx] = cellText;
      const matchedField = findBestFieldMatch(cellText, customMappings);
      if (matchedField) {
        currentMapping[colIdx] = matchedField;
        currentMatches++;
      }
    });

    const hasCoreField = Object.values(currentMapping).some((f) =>
      ['productName', 'quantity', 'unitPrice', 'totalPrice', 'sellingPrice'].includes(f)
    );

    if (hasCoreField && currentMatches > maxMatches) {
      maxMatches = currentMatches;
      bestRowIndex = r;
      bestFieldMapping = currentMapping;
      bestRawHeaders = currentRawHeaders;
    }
  }

  // Fallback to row 0 if no clear header row matched
  if (maxMatches === 0 && rawRows.length > 0) {
    const firstRow = rawRows[0] || [];
    firstRow.forEach((cell, colIdx) => {
      const cellText = String(cell || '').trim();
      if (!cellText) return;
      bestRawHeaders[colIdx] = cellText;
      const matchedField = findBestFieldMatch(cellText, customMappings);
      if (matchedField) bestFieldMapping[colIdx] = matchedField;
    });
  }

  return {
    headerRowIndex: bestRowIndex,
    fieldMapping: bestFieldMapping,
    rawHeaderNames: bestRawHeaders,
  };
}

/**
 * Parses an Excel or CSV file (Buffer, ArrayBuffer, or string) and extracts ALL invoices contained within.
 * Groups items sharing the same invoice number (or supplier + invoice number) into single invoices.
 */
export async function parseExcelOrCsvMultiInvoices(
  fileData,
  fileName,
  options = {}
) {
  const opts = typeof options === 'string'
    ? { defaultSupplierName: options }
    : (options || {});

  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  
  // Sheet data collection: sheetName -> 2D array rawRows
  const sheetMap = {};

  if (ext === 'csv') {
    let csvString = '';
    if (typeof fileData === 'string') {
      csvString = fileData;
    } else if (fileData instanceof ArrayBuffer) {
      csvString = new TextDecoder('utf-8').decode(fileData);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(fileData)) {
      csvString = fileData.toString('utf-8');
    } else if (fileData instanceof Uint8Array) {
      csvString = new TextDecoder('utf-8').decode(fileData);
    }

    const parsed = Papa.parse(csvString, { header: false, skipEmptyLines: true });
    sheetMap['Sheet1'] = parsed.data || [];
  } else {
    // Excel file (.xlsx, .xls)
    let workbook;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
      workbook = XLSX.read(base64Data, { type: 'base64', cellDates: true });
    } else if (fileData instanceof ArrayBuffer || fileData instanceof Uint8Array) {
      workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
    } else {
      workbook = XLSX.read(fileData, { cellDates: true });
    }

    for (const sheetName of workbook.SheetNames) {
      if (sheetName.includes('غير محدد') || sheetName.includes('Instructions')) continue;
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (rawRows && rawRows.length > 0) {
        sheetMap[sheetName] = rawRows;
      }
    }
  }

  const allInvoicesMap = new Map();
  let defaultInvoiceCounter = 1;

  for (const [sheetName, rawRows] of Object.entries(sheetMap)) {
    if (!rawRows || rawRows.length === 0) continue;

    // 1. Detect dynamic table header row index and column mappings
    const { headerRowIndex, fieldMapping, rawHeaderNames } = detectHeaderRowIndex(rawRows, opts.customMappings);

    // 2. Mine top header block for fallback metadata
    const { minedInvoiceNumber, minedSupplierName, minedInvoiceDate } = mineHeaderMetadata(rawRows, headerRowIndex);

    const sheetSupplierName = opts.defaultSupplierName || minedSupplierName || sheetName;
    const sheetInvoiceNumber = minedInvoiceNumber || '';
    const sheetInvoiceDate = minedInvoiceDate || '';

    const warnings = [];
    if (!Object.values(fieldMapping).includes('productName')) {
      warnings.push(`ورقة العمل (${sheetName}): تم تعيين الأعمدة تلقائياً بدون تطابق مباشر لاسم الصنف.`);
    }

    // 3. Process table data rows below headerRowIndex
    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || !Array.isArray(row) || row.every((c) => c === '' || c === null || c === undefined)) {
        continue;
      }

      let rowProductName = '';
      let rowQuantity = 1;
      let rowUnitPrice = 0;
      let rowDiscount = 0;
      let rowTotalPrice = 0;
      let rowSellingPrice = undefined;
      let rowBatchNumber = undefined;
      let rowExpiryDate = undefined;

      let rowInvoiceNumber = '';
      let rowSupplierName = '';
      let rowInvoiceDate = '';

      for (const [colIdxStr, stdField] of Object.entries(fieldMapping)) {
        const colIdx = parseInt(colIdxStr, 10);
        const val = row[colIdx];
        if (val === undefined || val === null || val === '') continue;

        if (stdField === 'productName') {
          rowProductName = String(val).trim();
        } else if (stdField === 'quantity') {
          rowQuantity = parseCleanNumber(val) || 1;
        } else if (stdField === 'unitPrice') {
          rowUnitPrice = parseCleanNumber(val);
        } else if (stdField === 'discount') {
          rowDiscount = parseCleanNumber(val);
        } else if (stdField === 'totalPrice') {
          rowTotalPrice = parseCleanNumber(val);
        } else if (stdField === 'sellingPrice') {
          rowSellingPrice = parseCleanNumber(val) || undefined;
        } else if (stdField === 'batchNumber') {
          rowBatchNumber = String(val).trim();
        } else if (stdField === 'expiryDate') {
          rowExpiryDate = parseCleanDate(val);
        } else if (stdField === 'invoiceNumber') {
          rowInvoiceNumber = String(val).trim();
        } else if (stdField === 'supplierName') {
          rowSupplierName = String(val).trim();
        } else if (stdField === 'invoiceDate') {
          rowInvoiceDate = parseCleanDate(val) || '';
        }
      }

      // Fallback: if no mapped productName column, check if text cell exists
      if (!rowProductName) {
        const textCell = row.find((c) => typeof c === 'string' && c.trim().length > 3 && !/^\d+$/.test(c.trim()));
        if (textCell) {
          rowProductName = String(textCell).trim();
        }
      }

      if (!rowProductName || rowProductName.length < 2) continue; // Skip non-item or total summary rows

      // Resolve final composite values
      const finalSupplier = rowSupplierName || sheetSupplierName || 'مورد غير محدد';
      const finalInvoiceNumber = rowInvoiceNumber || sheetInvoiceNumber || `INV-${sheetName}-${defaultInvoiceCounter}`;
      const finalInvoiceDate = rowInvoiceDate || sheetInvoiceDate || new Date().toISOString().split('T')[0];

      const invoiceKey = `${finalSupplier}_${finalInvoiceNumber}`;

      if (rowTotalPrice === 0 && rowUnitPrice > 0) {
        rowTotalPrice = rowUnitPrice * rowQuantity - rowDiscount;
      }

      const newItem = {
        id: `item_${Date.now()}_${r}`,
        productName: rowProductName,
        quantity: rowQuantity > 0 ? rowQuantity : 1,
        unitPrice: rowUnitPrice,
        discount: rowDiscount,
        totalPrice: rowTotalPrice,
        sellingPrice: rowSellingPrice || null,
        batchNumber: rowBatchNumber || '',
        expiryDate: rowExpiryDate || '',
      };

      if (allInvoicesMap.has(invoiceKey)) {
        const existingInv = allInvoicesMap.get(invoiceKey);
        existingInv.items.push(newItem);
        existingInv.totalAmount += (rowTotalPrice + rowDiscount);
        existingInv.discount += rowDiscount;
        existingInv.netAmount += rowTotalPrice;
        existingInv.itemsCount = existingInv.items.length;
      } else {
        allInvoicesMap.set(invoiceKey, {
          invoiceNumber: finalInvoiceNumber,
          supplierName: finalSupplier,
          invoiceDate: finalInvoiceDate,
          totalAmount: rowTotalPrice + rowDiscount,
          discount: rowDiscount,
          netAmount: rowTotalPrice,
          itemsCount: 1,
          items: [newItem],
          sheetName,
          detectedHeaderRowIndex: headerRowIndex,
          mappedFieldsCount: Object.keys(fieldMapping).length,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }
    }
    defaultInvoiceCounter++;
  }

  const invoices = Array.from(allInvoicesMap.values()).map((inv) => ({
    ...inv,
    itemsCount: inv.items.length,
    totalAmount: Math.round(inv.totalAmount * 100) / 100,
    discount: Math.round(inv.discount * 100) / 100,
    netAmount: Math.round(inv.netAmount * 100) / 100,
  }));

  if (invoices.length === 0) {
    throw new Error('لم يتم العثور على أي بنود فواتير صالحة في ملف الإكسل.');
  }

  return invoices;
}

/**
 * Parse single invoice helper
 */
export async function parseExcelOrCsvInvoice(fileData, fileName, supplierName) {
  const invoices = await parseExcelOrCsvMultiInvoices(fileData, fileName, { defaultSupplierName: supplierName });
  return invoices[0];
}
