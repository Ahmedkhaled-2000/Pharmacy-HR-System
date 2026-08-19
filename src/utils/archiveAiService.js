/**
 * archiveAiService.js
 * Multi-Tier AI Invoice Extraction Engine
 * Supports: Google Gemini 2.5 Flash / Groq Llama 3.2 Vision / Local Offline Regex
 */

export const INVOICE_JSON_PROMPT = `أنت خبير فحص وتدقيق فواتير أدوية ومستلزمات صيدلية متقدم.
قم باستخراج البيانات التالية بدقة من صورة/مستند الفاتورة المرفقة، وأرجع الناتج بتنسيق JSON نظيف وصالح فقط بدون أي نصوص أو markdown إضافية:
{
  "invoiceNumber": "رقم الفاتورة",
  "supplierName": "اسم الشركة أو المورد",
  "invoiceDate": "YYYY-MM-DD",
  "totalAmount": 0.00,
  "discount": 0.00,
  "netAmount": 0.00,
  "items": [
    {
      "productName": "اسم الصنف أو الدواء بالكامل",
      "quantity": 1,
      "unitPrice": 0.00,
      "discount": 0.00,
      "totalPrice": 0.00,
      "sellingPrice": 0.00,
      "batchNumber": "رقم التشغيلة إن وجد",
      "expiryDate": "YYYY-MM-DD إن وجد"
    }
  ]
}

قواعد مهمة:
1. تأكد من أن netAmount = totalAmount - discount.
2. إذا لم تجد رقم الفاتورة فأنشئ رمزاً تقريبياً مثل INV-xxxx.
3. إذا لم تجد التاريخ فضعه تاريخ اليوم بتنسيق YYYY-MM-DD.
4. استخرج أكبر قدر ممكن من بنود الأدوية والكميات والأسعار بدقة بالغة.`;

/**
 * محرك استخراج الفاتورة بالذكاء الاصطناعي عبر Google Gemini API
 */
export async function extractWithGemini(base64Data, mimeType, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('مفتاح Google Gemini API غير متوفر. يرجى إضافته في إعدادات الأرشيف.');
  }

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const models = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: INVOICE_JSON_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini Error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textContent) {
        const cleaned = textContent.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        return formatExtractedData(parsed);
      }
    } catch (err) {
      console.warn(`Model ${model} failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('فشل الاستخراج عبر كافة نماذج Gemini');
}

/**
 * محرك استخراج الفاتورة الفائق السرعة عبر Groq Vision (Llama 3.2 11B Vision)
 */
export async function extractWithGroq(base64Data, mimeType, apiKey) {
  const groqKey = apiKey ? apiKey.trim() : '';
  if (!groqKey) return null;

  try {
    const isPng = (mimeType || '').includes('png');
    const imageMime = isPng ? 'image/png' : 'image/jpeg';
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const dataUrl = `data:${imageMime};base64,${cleanBase64}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: INVOICE_JSON_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) return null;

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    const parsed = JSON.parse(content);
    return formatExtractedData(parsed);
  } catch (err) {
    console.warn('Groq extraction error:', err);
    return null;
  }
}

/**
 * محرك الاستخراج المحلي دون إنترنت (Regex Fallback Parser)
 */
export function fallbackLocalInvoiceExtract(text = '', defaultName = 'مورد عام') {
  const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

  let invoiceNumber = '';
  const invMatch = text.match(/(?:رقم الفاتورة|فاتورة رقم|INV|Invoice|Doc|رقم السند|رقم الإذن)\s*[:#\-]?\s*([A-Za-z0-9\-]+)/i);
  if (invMatch) invoiceNumber = invMatch[1];
  if (!invoiceNumber) invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  let invoiceDate = new Date().toISOString().split('T')[0];
  const dateMatch = text.match(/(\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/);
  if (dateMatch) {
    const raw = dateMatch[1].replace(/\//g, '-');
    const parts = raw.split('-');
    if (parts[0].length === 4) invoiceDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    else if (parts[2].length === 4) invoiceDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }

  const supplierMatch = text.match(/(?:شركة|مورد|العميل|Supplier|Vendor|مؤسسة)\s*[:#\-]?\s*([^\n\r,]+)/i);
  const supplierName = supplierMatch ? supplierMatch[1].trim().slice(0, 40) : defaultName;

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
    totalAmount,
    discount,
    netAmount,
    items
  };
}

/**
 * دالة تنسيق ومعايرة البيانات المستخرجة
 */
function formatExtractedData(data) {
  const result = {
    invoiceNumber: data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
    supplierName: data.supplierName || 'مورد عام',
    invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
    totalAmount: parseFloat(data.totalAmount) || 0,
    discount: parseFloat(data.discount) || 0,
    netAmount: parseFloat(data.netAmount) || 0,
    items: []
  };

  if (result.netAmount === 0 && result.totalAmount > 0) {
    result.netAmount = result.totalAmount - result.discount;
  }
  if (result.totalAmount === 0 && result.netAmount > 0) {
    result.totalAmount = result.netAmount + result.discount;
  }

  if (Array.isArray(data.items)) {
    result.items = data.items.map((item, idx) => {
      const qty = parseInt(item.quantity, 10) || 1;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const discount = parseFloat(item.discount) || 0;
      const totalPrice = parseFloat(item.totalPrice) || (qty * unitPrice - discount);
      return {
        id: `item_${Date.now()}_${idx}`,
        productName: item.productName || item.name || `صنف ${idx + 1}`,
        quantity: qty,
        unitPrice,
        discount,
        totalPrice,
        sellingPrice: item.sellingPrice ? parseFloat(item.sellingPrice) : null,
        batchNumber: item.batchNumber || '',
        expiryDate: item.expiryDate || ''
      };
    });
  }

  return result;
}

/**
 * الواجهة الموحدة الشاملة للاستخراج الذكي (Multi-Tier Orchestrator)
 */
export async function performSmartExtraction(base64Data, mimeType, settings = {}, onStatusUpdate = () => {}) {
  // 1. تجربة Groq Vision أولاً للسرعة القصوى
  if (settings.GROQ_API_KEY) {
    try {
      onStatusUpdate('جاري الاستخراج السريع عبر Groq Vision...');
      const groqResult = await extractWithGroq(base64Data, mimeType, settings.GROQ_API_KEY);
      if (groqResult && (groqResult.items.length > 0 || groqResult.totalAmount > 0)) {
        return groqResult;
      }
    } catch (e) {
      console.warn('Groq Vision tier bypassed:', e);
    }
  }

  // 2. تجربة Google Gemini Vision
  if (settings.GEMINI_API_KEY) {
    try {
      onStatusUpdate('جاري التحليل الدقيق عبر Google Gemini AI...');
      const geminiResult = await extractWithGemini(base64Data, mimeType, settings.GEMINI_API_KEY);
      if (geminiResult) return geminiResult;
    } catch (e) {
      console.warn('Gemini Vision tier failed:', e);
    }
  }

  // 3. Fallback للتحليل المحلي
  onStatusUpdate('جاري المعالجة المحلية...');
  return fallbackLocalInvoiceExtract('', 'مورد عام');
}
