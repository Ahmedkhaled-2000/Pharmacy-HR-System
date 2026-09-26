/**
 * outstockMedicationAiExtractor.js
 * محرك الذكاء الاصطناعي لاستخراج بيانات وتحديث أسعار الأدوية من المستندات والصور
 * يدعم:
 * 1. ملفات إكسل (Excel .xlsx, .xls)
 * 2. مستندات وفواتير PDF (.pdf)
 * 3. صور الكشوف والفواتير والروشتات (PNG, JPG, WebP)
 * يستخدم Google Gemini Vision AI مع التحقق الرقابي ومنع التكرار
 */

import { parseMedicationExcelFile } from './outstockExcelExporter';

const MEDICATION_AI_PROMPT = `أنت خبير صيدلي واستشاري تسعير أدوية معتمد بهيئة الدواء المصرية (EDA) ونظام دراج آي.
قم بفحص وتحليل المستند/الصورة المرفقة واستخراج جميع الأصناف الدوائية والبيانات الصيدلانية والتسعيرة الرسمية بدقة متناهية.
تأكد من استخراج البيانات وتصنيفها وإرجاعها في هيئة مصفوفة JSON نقية فقط دون أي شروحات أو Markdown خارج JSON:

[
  {
    "gtin_barcode": "الباركود الدولي إن وجد وإلا فارغ",
    "trade_name_ar": "اسم الدواء التجاري بالعربي",
    "trade_name_en": "اسم الدواء التجاري بالإنجليزي",
    "generic_name": "المادة الفعالة",
    "dosage_form": "الشكل الصيدلاني (أقراص / كبسولات / شراب / معلق / أمبولات / مرهم / كريم / نقط)",
    "strength": "التركيز مثل 500 mg أو 1g",
    "pack_size": 3,
    "unit_name": "شريط",
    "public_price": 87.00,
    "manufacturer": "الشركة المصنعة",
    "is_table_drug": false,
    "is_refrigerated": false
  }
]

شروط حاسمة:
1. "public_price": سعر بيع العلبة للجمهور (رقم عشري بالجنيه المصري).
2. "pack_size": عدد الشرائط أو الأمبولات داخل العلبة الواحدة (رقم صحيح، إذا كان شراب أو زجاجة ضع 1).
3. "is_table_drug": ضع true إذا كان الدواء يتبع أدوية الجدول أو المؤثرات العقلية (مثل ترامادول، زولام، ليريكا، إلخ).
4. "is_refrigerated": ضع true إذا كان دواء ثلاجة (أنسولين، تطعيمات، بعض قطرات العين).
5. عدم تكرار أي صنف داخل القائمة.`;

/**
 * الحصول على مفاتيح Gemini المتاحة من إعدادات النظام
 */
async function getEffectiveGeminiKeys() {
  const keys = [];

  // 1. Env vars
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    keys.push(import.meta.env.VITE_GEMINI_API_KEY);
  }

  // 2. Local storage
  try {
    const rawArchive = localStorage.getItem('archive_settings') || localStorage.getItem('app_archive_settings');
    if (rawArchive) {
      const parsed = JSON.parse(rawArchive);
      if (parsed.GEMINI_API_KEY) keys.push(parsed.GEMINI_API_KEY);
      if (parsed.geminiApiKey) keys.push(parsed.geminiApiKey);
    }
  } catch {}

  try {
    const rawOutstock = localStorage.getItem('outstock_settings');
    if (rawOutstock) {
      const parsed = JSON.parse(rawOutstock);
      if (parsed.GEMINI_API_KEY) keys.push(parsed.GEMINI_API_KEY);
    }
  } catch {}

  // 3. Server Archive settings endpoint fallback
  try {
    const res = await fetch('/api/archive/settings');
    if (res.ok) {
      const data = await res.json();
      if (data?.settings?.GEMINI_API_KEY) {
        keys.push(data.settings.GEMINI_API_KEY);
      }
    }
  } catch {}

  // إزالة التكرار والفراغات
  const uniqueKeys = Array.from(new Set(keys.map(k => String(k || '').trim()))).filter(Boolean);
  return uniqueKeys;
}

/**
 * تحويل ملف إلى Base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * استخراج الأدوية باستخدام الذكاء الاصطناعي من ملف إكسل أو PDF أو صورة
 * @param {File} file
 * @param {Function} onProgress
 */
export async function extractMedicationsWithAi(file, onProgress = () => {}) {
  if (!file) throw new Error('يرجى اختيار ملف');

  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet') || file.type.includes('excel');
  const isPdf = fileName.endsWith('.pdf') || file.type.includes('pdf');
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(fileName);

  // ── الحالة الأولى: ملف إكسل (تحليل مباشر وسريع أولاً عبر محلل الإكسل الملكي) ──
  if (isExcel) {
    onProgress('جاري فحص وتدقيق أعمدة ملف الإكسل ومنع التكرار...');
    try {
      const excelResult = await parseMedicationExcelFile(file);
      if (excelResult.success && excelResult.items.length > 0) {
        return {
          success: true,
          method: 'excel_direct',
          items: excelResult.items,
          duplicatesCount: excelResult.duplicatesCount,
          warnings: excelResult.warnings
        };
      }
    } catch (excelErr) {
      console.warn('Standard excel parse failed, falling back to AI:', excelErr);
    }
  }

  // ── الحالة الثانية: تحليل ذكي عبر Google Gemini Vision للملفات والصور والـ PDF ──
  onProgress('جاري معالجة المستند وتجهيزه للتحليل الذكي...');
  const base64Data = await fileToBase64(file);
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

  let mimeType = file.type || 'image/jpeg';
  if (isPdf) mimeType = 'application/pdf';
  else if (isExcel) mimeType = 'application/octet-stream';

  const apiKeys = await getEffectiveGeminiKeys();
  if (apiKeys.length === 0) {
    // إذا لم يتوفر مفتاح Gemini، وكان ملف إكسل
    if (isExcel) {
      return await parseMedicationExcelFile(file);
    }
    throw new Error('يرجى إضافة مفتاح Google Gemini API في إعدادات المنظومة لتفعيل استخراج المستندات والصور بالذكاء الاصطناعي.');
  }

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];

  let lastError = null;

  for (const apiKey of apiKeys) {
    for (const model of candidateModels) {
      try {
        onProgress(`جاري التحليل واستخراج كروت الأصناف عبر الذكاء الاصطناعي (${model})...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
          contents: [
            {
              parts: [
                { text: MEDICATION_AI_PROMPT },
                {
                  inline_data: {
                    mime_type: mimeType.includes('pdf') ? 'application/pdf' : mimeType,
                    data: cleanBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Gemini ${model} returned ${response.status}:`, errText);
          continue;
        }

        const resData = await response.json();
        let rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

        const jsonStart = rawText.indexOf('[');
        const jsonEnd = rawText.lastIndexOf(']');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          rawText = rawText.substring(jsonStart, jsonEnd + 1);
        }

        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // تدقيق الأصناف المستخرجة واحتساب سعر الشريط ومنع التكرار
          const seen = new Set();
          const cleanItems = [];
          let dupCount = 0;

          parsed.forEach((med, i) => {
            const nameAr = String(med.trade_name_ar || med.trade_name_en || '').trim();
            const nameEn = String(med.trade_name_en || med.trade_name_ar || '').trim();
            const barcode = String(med.gtin_barcode || '').replace(/\s+/g, '');
            const price = parseFloat(med.public_price || 0);

            if (!nameAr && !nameEn) return;

            const key = barcode || `${nameAr.toLowerCase()}|${nameEn.toLowerCase()}`;
            if (seen.has(key)) {
              dupCount++;
              return;
            }
            seen.add(key);

            const packSize = Math.max(1, parseInt(med.pack_size || 1, 10));
            const unitPrice = parseFloat((price / packSize).toFixed(2));

            cleanItems.push({
              rowNumber: i + 1,
              gtin_barcode: barcode,
              trade_name_ar: nameAr,
              trade_name_en: nameEn,
              generic_name: String(med.generic_name || '').trim(),
              dosage_form: String(med.dosage_form || 'أقراص').trim(),
              strength: String(med.strength || '').trim(),
              pack_size: packSize,
              unit_name: String(med.unit_name || 'شريط').trim(),
              public_price: price,
              unit_price: unitPrice,
              manufacturer: String(med.manufacturer || '').trim(),
              is_table_drug: Boolean(med.is_table_drug),
              is_refrigerated: Boolean(med.is_refrigerated)
            });
          });

          return {
            success: true,
            method: 'gemini_vision',
            items: cleanItems,
            duplicatesCount: dupCount,
            warnings: []
          };
        }
      } catch (err) {
        lastError = err;
        console.warn(`Error trying ${model}:`, err.message);
      }
    }
  }

  throw new Error(lastError?.message || 'تعذر استخراج بيانات الأدوية من الملف المرفق. تأكد من وضوح المستند ومفتاح Gemini API.');
}
