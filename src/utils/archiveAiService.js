/**
 * archiveAiService.js
 * Multi-Tier AI Invoice Extraction Engine for Pharmacy Archive System
 * 100% Matching Architecture & Algorithms as Standalone Archive System
 * 
 * Pipeline:
 * 1. Ultra-fast 100% Free Groq Vision AI (Llama 3.2 11B Vision)
 * 2. Multi-Key & Multi-Model Google Gemini AI (gemini-2.5-flash, 2.0-flash, 1.5-flash, etc.)
 * 3. Robust Offline Regex Fallback Parser
 */

export const INVOICE_EXTRACTION_PROMPT = `أنت خبير فحص وتدقيق فواتير صيدلية متقدم ونظام OCR للمستندات والبيانات الصيدلانية.
قم بتحليل مستند/صورة الفاتورة المرفقة واستخراج البيانات بدقة متناهية وإرجاعها في بنية JSON فقط دون أي نصوص أو markdown:

الحقول المطلوبة بدقة:
1. invoiceNumber: رقم الفاتورة (مثال: PF-2401 أو INV-100 أو 12345)
2. supplierName: اسم المورد أو الشركة (مثال: شركة المتحدة للصيادلة أو ابن سينا)
3. invoiceDate: تاريخ الفاتورة بصيغة YYYY-MM-DD
4. totalAmount: الإجمالي قبل الخصم (رقم)
5. discount: إجمالي الخصم (رقم)
6. netAmount: الصافي النهائي (الإجمالي بعد الخصم) (رقم)
7. itemsCount: عدد بنود الأدوية في الفاتورة (رقم)
8. items: مصفوفة كاملة بالأصناف/الأدوية المذكورة في الفاتورة، كل صنف يتضمن:
   - productName: اسم الدواء/الصنف التجاري بالكامل
   - quantity: الكمية (رقم)
   - unitPrice: سعر الوحدة (رقم)
   - discount: قيمة الخصم إن وجد (رقم)
   - totalPrice: الإجمالي للصنف (رقم)
   - sellingPrice: سعر الجمهور إن وجد (رقم)
   - batchNumber: رقم التشغيلة/الباتش إن وجد
   - expiryDate: تاريخ الصلاحية YYYY-MM-DD إن وجد

قم بإرجاع JSON نقي ومباشر على هذا النمط فقط:
{
  "invoiceNumber": "string",
  "supplierName": "string",
  "invoiceDate": "YYYY-MM-DD",
  "totalAmount": 0.00,
  "discount": 0.00,
  "netAmount": 0.00,
  "itemsCount": 0,
  "items": [
    {
      "productName": "اسم الصنف",
      "quantity": 1,
      "unitPrice": 0.00,
      "discount": 0.00,
      "totalPrice": 0.00,
      "sellingPrice": 0.00,
      "batchNumber": "string",
      "expiryDate": "YYYY-MM-DD"
    }
  ]
}`;

/**
 * Local offline invoice text parser (Regex based) when AI is rate limited or offline.
 */
export function fallbackLocalInvoiceExtract(text = '', defaultName = 'مورد عام') {
  const lines = text ? text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean) : [];

  // Extract Invoice Number
  let invoiceNumber = '';
  const invMatch = text.match(/(?:رقم الفاتورة|فاتورة رقم|INV|Invoice|Doc|رقم السند|رقم الإذن)\s*[:#\-]?\s*([A-Za-z0-9\-]+)/i);
  if (invMatch) invoiceNumber = invMatch[1];
  if (!invoiceNumber) invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  // Extract Date YYYY-MM-DD or DD/MM/YYYY
  const dateMatch = text.match(/(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/);
  let invoiceDate = new Date().toISOString().split('T')[0];
  if (dateMatch) {
    const rawDate = dateMatch[1].replace(/\//g, '-');
    const parts = rawDate.split('-');
    if (parts[0].length === 4) invoiceDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    else if (parts[2].length === 4) invoiceDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  // Extract Supplier Name
  const supplierMatch = text.match(/(?:شركة|مورد|العميل|Supplier|Vendor|مؤسسة)\s*[:#\-]?\s*([^\n\r,]+)/i);
  const supplierName = supplierMatch ? supplierMatch[1].trim().slice(0, 40) : defaultName;

  // Extract Line Items (Products, Quantities, Unit Prices, Totals)
  const items = [];
  
  for (const line of lines) {
    if (/^(الإجمالي|الصافي|الخصم|الضريبة|العدد|التاريخ|المستلم|Page|Total|Invoice|Subtotal)/i.test(line)) continue;

    const numbers = line.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      const productName = line.replace(/[\d\.\,]+$/g, '').trim();
      if (productName.length > 2 && !/^(إذن|فاتورة|سند|تاريخ)/i.test(productName)) {
        const qty = parseInt(numbers[0], 10) || 1;
        const unitPrice = parseFloat(numbers[1]) || 0;
        const totalPrice = numbers.length >= 3 ? parseFloat(numbers[2]) : qty * unitPrice;

        items.push({
          id: `item_${Date.now()}_${items.length}`,
          productName,
          quantity: qty,
          unitPrice,
          totalPrice,
          discount: 0,
          sellingPrice: null,
          batchNumber: '',
          expiryDate: ''
        });
      }
    }
  }

  // Extract Amounts
  const totalMatch = text.match(/(?:الإجمالي|المجموع|Subtotal|Total)\s*[:#\-]?\s*([\d\.\,]+)/i);
  let totalAmount = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) || 0 : 0;

  const discMatch = text.match(/(?:الخصم|قيمة الخصم|Discount)\s*[:#\-]?\s*([\d\.\,]+)/i);
  const discount = discMatch ? parseFloat(discMatch[1].replace(/,/g, '')) || 0 : 0;

  const netMatch = text.match(/(?:الصافي|المطلوب|Net Amount|Total Net)\s*[:#\-]?\s*([\d\.\,]+)/i);
  let netAmount = netMatch ? parseFloat(netMatch[1].replace(/,/g, '')) || 0 : 0;

  if (netAmount === 0 && items.length > 0) {
    netAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);
  }
  if (totalAmount === 0) {
    totalAmount = netAmount + discount;
  }

  return {
    invoiceNumber,
    supplierName,
    invoiceDate,
    totalAmount: Math.round(totalAmount * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    itemsCount: items.length,
    items,
  };
}

/**
 * Ultra-fast Groq AI Vision (Llama 3.2 11B Vision) extraction
 */
export async function extractWithGroq(base64Data, mimeType, apiKey = '') {
  const groqApiKey = apiKey && typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!groqApiKey) return null;

  try {
    const isPng = (mimeType || '').includes('png');
    const imageMime = isPng ? 'image/png' : 'image/jpeg';
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const dataUrl = `data:${imageMime};base64,${cleanBase64}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: INVOICE_EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.warn('Groq Vision non-OK:', res.status);
      return null;
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    const parsed = JSON.parse(content);
    if (parsed.invoiceNumber || parsed.supplierName || (parsed.items && parsed.items.length > 0)) {
      return formatExtractedData(parsed);
    }
  } catch (err) {
    console.warn('Groq Vision extraction error:', err?.message);
  }
  return null;
}

/**
 * Multi-key & Multi-model Google Gemini Vision Extraction
 */
export async function extractWithGemini(base64Data, mimeType, rawApiKeys = '') {
  if (!rawApiKeys || rawApiKeys.trim() === '') {
    throw new Error('مفتاح Google Gemini API غير متوفر. يرجى إضافته في إعدادات الأرشيف.');
  }

  const apiKeys = rawApiKeys
    .split(/[,;\r\n]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  if (apiKeys.length === 0) {
    throw new Error('مفتاح Google Gemini API غير صالح.');
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro'
  ];

  let lastError = null;

  for (const apiKey of apiKeys) {
    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [
            {
              parts: [
                { text: INVOICE_EXTRACTION_PROMPT },
                {
                  inline_data: {
                    mime_type: (mimeType || 'image/jpeg').includes('pdf') ? 'application/pdf' : (mimeType || 'image/jpeg'),
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          if (res.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          throw new Error(`Gemini Error (${res.status}): ${errText}`);
        }

        const data = await res.json();
        const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          const cleaned = textContent.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.invoiceNumber || parsed.supplierName || (parsed.items && parsed.items.length > 0)) {
            return formatExtractedData(parsed);
          }
        }
      } catch (err) {
        console.warn(`Model ${model} failed with key starting '${apiKey.substring(0, 8)}...':`, err?.message);
        lastError = err;
        if (err?.message?.includes('429')) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }
  }

  throw lastError || new Error('فشل الاستخراج عبر كافة نماذج Google Gemini');
}

/**
 * Format and calibrate extracted data ensuring complete mathematical consistency
 */
export function formatExtractedData(data) {
  let totalAmount = parseFloat(data.totalAmount) || 0;
  let discount = parseFloat(data.discount) || 0;
  let netAmount = parseFloat(data.netAmount) || 0;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems.map((item, idx) => {
    const qty = parseInt(item.quantity, 10) || 1;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const itemDisc = parseFloat(item.discount) || 0;
    const totalPrice = parseFloat(item.totalPrice) || (qty * unitPrice - itemDisc);

    return {
      id: `item_${Date.now()}_${idx}`,
      productName: item.productName || item.product_name || item.name || `صنف ${idx + 1}`,
      quantity: qty > 0 ? qty : 1,
      unitPrice: Math.round(unitPrice * 100) / 100,
      discount: Math.round(itemDisc * 100) / 100,
      totalPrice: Math.round(totalPrice * 100) / 100,
      sellingPrice: item.sellingPrice ? Math.round(parseFloat(item.sellingPrice) * 100) / 100 : null,
      batchNumber: item.batchNumber || item.batch_number || '',
      expiryDate: item.expiryDate || item.expiry_date || '',
    };
  });

  if (netAmount === 0 && items.length > 0) {
    netAmount = items.reduce((sum, it) => sum + it.totalPrice, 0);
  }
  if (totalAmount === 0 && netAmount > 0) {
    totalAmount = netAmount + discount;
  }
  if (netAmount === 0 && totalAmount > 0) {
    netAmount = totalAmount - discount;
  }

  return {
    invoiceNumber: data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
    supplierName: data.supplierName || 'مورد عام',
    invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
    totalAmount: Math.round(totalAmount * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    itemsCount: items.length,
    items,
  };
}

/**
 * Universal Multi-Tier Extraction Orchestrator
 */
export async function performSmartExtraction(file, base64Data, settings = {}, suppliers = [], onStatusUpdate = () => {}) {
  const mimeType = file?.type || 'image/jpeg';

  // 1. First Priority: Ultra-Fast Groq Vision AI (Llama 3.2 11B Vision)
  try {
    onStatusUpdate('جاري التحليل السريع والفوري بالذكاء الاصطناعي (Groq Vision)...');
    const groqResult = await extractWithGroq(base64Data, mimeType, settings?.GROQ_API_KEY);
    if (groqResult && (groqResult.items.length > 0 || groqResult.totalAmount > 0)) {
      return matchSupplierWithList(groqResult, suppliers);
    }
  } catch (groqErr) {
    console.warn('Groq Vision tier skipped:', groqErr);
  }

  // 2. Second Priority: Google Gemini Multi-Key / Multi-Model AI
  if (settings?.GEMINI_API_KEY) {
    try {
      onStatusUpdate('جاري التحليل العميق واستخراج الأصناف عبر Google Gemini AI...');
      const geminiResult = await extractWithGemini(base64Data, mimeType, settings.GEMINI_API_KEY);
      if (geminiResult) {
        return matchSupplierWithList(geminiResult, suppliers);
      }
    } catch (geminiErr) {
      console.warn('Gemini Vision tier failed:', geminiErr);
    }
  }

  // 3. Third Priority: Local Regex Offline Parser
  onStatusUpdate('جاري الاستخراج والمعالجة بنظام التحليل الاحتياطي...');
  const localResult = fallbackLocalInvoiceExtract('', file?.name || 'مورد عام');
  return matchSupplierWithList(localResult, suppliers);
}

function matchSupplierWithList(extractedData, suppliers = []) {
  if (!extractedData) return extractedData;

  const rawName = (extractedData.supplierName || '').trim().toLowerCase();
  if (!rawName || !Array.isArray(suppliers) || suppliers.length === 0) {
    return extractedData;
  }

  const matched = suppliers.find((s) => {
    const sName = (s.name || '').trim().toLowerCase();
    return sName === rawName || sName.includes(rawName) || rawName.includes(sName);
  });

  if (matched) {
    extractedData.supplierId = matched.id;
    extractedData.supplierName = matched.name;
  }

  return extractedData;
}
