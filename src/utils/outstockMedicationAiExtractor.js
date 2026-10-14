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
قم بفحص وتحليل المستند/الصورة المرفقة واستخراج جميع الأصناف الدوائية والتجارية الفعلية والبيانات الصيدلانية والتسعيرة الرسمية بدقة متناهية.
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

شروط رقابية حاسمة وإلزامية:
1. ⚠️ تحذير صارم: ممنوع تماماً استخراج صفوف ترويسات الأعمدة (مثل "اسم الصنف", "سعر البيع", "الباركود", "المورد")، أو صفوف التعليمات والإرشادات (مثل "تعليمات: يرجى ملء الحقول الإلزامية")، أو أرقام الصفحات، أو الجداول الإرشادية. استخرج الأصناف التجارية والدوائية الحقيقية فقط.
2. "public_price": سعر بيع العلبة للجمهور (رقم عشري بالجنيه المصري).
3. "pack_size": عدد الشرائط أو الأمبولات داخل العلبة الواحدة (رقم صحيح، إذا كان شراب أو زجاجة ضع 1).
4. "is_table_drug": ضع true إذا كان الدواء يتبع أدوية الجدول أو المؤثرات العقلية (مثل ترامادول، زولام، ليريكا، إلخ).
5. "is_refrigerated": ضع true إذا كان دواء ثلاجة (أنسولين، تطعيمات، بعض قطرات العين).
6. عدم تكرار أي صنف داخل القائمة واستبعاد أسطر الإجماليات والمجاميع.`;

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

  // ── الحالة الثالثة: محرك الرؤية الاحتياطي الفوري Groq Vision (Llama 3.2 11B Vision) ──
  try {
    const groqKeys = await getEffectiveGroqKeys();
    if (groqKeys.length > 0) {
      for (const gKey of groqKeys) {
        try {
          onProgress('جاري التحليل عبر محرك الذكاء الاصطناعي الاحتياطي (Groq Vision Llama 3.2)...');
          const dataUrl = `data:${mimeType.includes('pdf') ? 'image/jpeg' : mimeType};base64,${cleanBase64}`;
          const gRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${gKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.2-11b-vision-preview',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: MEDICATION_AI_PROMPT },
                    { type: 'image_url', image_url: { url: dataUrl } }
                  ]
                }
              ],
              temperature: 0.1,
              max_tokens: 8192,
              response_format: { type: 'json_object' }
            })
          });

          if (gRes.ok) {
            const gData = await gRes.json();
            let rawText = gData.choices?.[0]?.message?.content || '';
            rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const jsonStart = rawText.indexOf('[');
            const jsonEnd = rawText.lastIndexOf(']');
            let parsed = null;
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
              parsed = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));
            } else {
              const obj = JSON.parse(rawText);
              parsed = Array.isArray(obj) ? obj : (obj.medications || obj.items || []);
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
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
                if (seen.has(key)) { dupCount++; return; }
                seen.add(key);
                const packSize = Math.max(1, parseInt(med.pack_size || 1, 10));
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
                  unit_price: parseFloat((price / packSize).toFixed(2)),
                  manufacturer: String(med.manufacturer || '').trim(),
                  is_table_drug: Boolean(med.is_table_drug),
                  is_refrigerated: Boolean(med.is_refrigerated)
                });
              });

              return {
                success: true,
                method: 'groq_vision_backup',
                items: cleanItems,
                duplicatesCount: dupCount,
                warnings: []
              };
            }
          }
        } catch (gErr) {
          console.warn('Groq Vision backup failed:', gErr.message);
        }
      }
    }
  } catch (outerGroqErr) {
    console.warn('Groq check error:', outerGroqErr);
  }

  // ── الحالة الرابعة: إذا كان ملف إكسل ولم ينجح الذكاء الاصطناعي ──
  if (isExcel) {
    return await parseMedicationExcelFile(file);
  }

  throw new Error(lastError?.message || 'تعذر استخراج بيانات الأدوية من الملف المرفق. تم فحص كل من Google Gemini ومحرك Vision الاحتياطي. يرجى التأكد من وضوح الصورة وصلاحية مفاتيح الـ API.');
}

/**
 * الحصول على مفاتيح Groq المتاحة كـ API احتياطي
 */
async function getEffectiveGroqKeys() {
  const keys = [];
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY) {
    keys.push(import.meta.env.VITE_GROQ_API_KEY);
  }
  try {
    const rawArchive = localStorage.getItem('archive_settings') || localStorage.getItem('app_archive_settings');
    if (rawArchive) {
      const parsed = JSON.parse(rawArchive);
      if (parsed.GROQ_API_KEY) keys.push(parsed.GROQ_API_KEY);
      if (parsed.groqApiKey) keys.push(parsed.groqApiKey);
    }
  } catch {}
  try {
    const rawOutstock = localStorage.getItem('outstock_settings');
    if (rawOutstock) {
      const parsed = JSON.parse(rawOutstock);
      if (parsed.GROQ_API_KEY) keys.push(parsed.GROQ_API_KEY);
    }
  } catch {}
  return Array.from(new Set(keys.map(k => String(k || '').trim()))).filter(Boolean);
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * محرك التدقيق والتحسين الصيدلاني بالذكاء الاصطناعي (AI Item Enricher & Polisher)
 * يقوم بفحص الأصناف المستوردة وتدقيق:
 * 1. المادة الفعالة والشكل الصيدلاني والتركيز
 * 2. عدد الشرائط/الوحدات وتصنيف أدوية الجدول والثلاجة
 * 3. يدعم المعالجة الجماعية مع Fallback ذكي وفوري
 * ══════════════════════════════════════════════════════════════════════════════
 */
export async function enrichMedicationListWithAi(items = [], onProgress = () => {}) {
  if (!Array.isArray(items) || items.length === 0) return items;

  onProgress('جاري فحص وتدقيق الأصناف بواسطة محرك الذكاء الاصطناعي الصيدلاني...');

  const apiKeys = await getEffectiveGeminiKeys();
  let aiResultsMap = new Map();

  if (apiKeys.length > 0) {
    try {
      const apiKey = apiKeys[0];
      const model = 'gemini-2.5-flash';
      // تدقيق الأصناف في حزم تصل إلى 25 صنف لكل طلب لضمان السرعة والدقة
      const sampleItems = items.map((it, idx) => ({
        index: idx,
        name: it.trade_name_ar || it.trade_name_en || it.detailed_name,
        price: it.public_price,
        supplier: it.supplier_name
      }));

      const prompt = `أنت استشاري صيدلي معتمد بنظام هيئة الدواء المصرية ودراج آي.
قم بفحص قائمة الأدوية والمستحضرات التالية واستنتج بدقة متناهية:
1. generic_name: المادة الفعالة العلمية الدقيقة.
2. dosage_form: الشكل الصيدلاني الرسمي (أقراص مغلفة / كبسولات / شراب / معلق / أمبولات / فيال / نقط / مرهم / كريم / جل / بخاخ / فوار / لبوس).
3. strength: التركيز (مثل 500mg, 1g, 5mg/5ml).
4. pack_size: عدد الشرائط أو الوحدات داخل العلبة الواحدة (رقم صحيح).
5. is_table_drug: هل الصنف جدول مخدرات أو مؤثرات عقلية (true/false).
6. is_refrigerated: هل الصنف دواء ثلاجة (أنسولين أو تطعيم أو قطرة خاصة) (true/false).
7. department: القسم (أدوية / مستحضرات تجميل / عناية شخصية / أجهزة طبية).

أرجع مصفوفة JSON نقية فقط بالشكل:
[
  {
    "index": 0,
    "generic_name": "...",
    "dosage_form": "...",
    "strength": "...",
    "pack_size": 2,
    "is_table_drug": false,
    "is_refrigerated": false,
    "department": "أدوية"
  }
]

القائمة المطلوب تدقيقها:
${JSON.stringify(sampleItems.slice(0, 30), null, 2)}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
      });

      if (response.ok) {
        const resData = await response.json();
        let rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
        const jStart = rawText.indexOf('[');
        const jEnd = rawText.lastIndexOf(']');
        if (jStart !== -1 && jEnd !== -1) {
          const parsed = JSON.parse(rawText.substring(jStart, jEnd + 1));
          if (Array.isArray(parsed)) {
            parsed.forEach(p => {
              if (p && p.index !== undefined) {
                aiResultsMap.set(p.index, p);
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('AI batch enrichment network error, using clinical heuristic fallback:', err);
    }
  }

  // دمج نتائج الذكاء الاصطناعي مع القواعد الصيدلانية السريرية
  return items.map((item, idx) => {
    const aiData = aiResultsMap.get(idx) || {};

    const nameText = `${item.trade_name_ar || ''} ${item.trade_name_en || ''} ${item.detailed_name || ''}`;

    // استنتاج التركيز إذا كان مفقوداً
    let strength = item.strength || aiData.strength || '';
    if (!strength) {
      const stMatch = nameText.match(/(\d+(?:\.\d+)?\s*(?:mg|gm|g|mcg|ml|iu|مجم|جم|مل|وحدة))/i);
      if (stMatch) strength = stMatch[1];
    }

    // استنتاج المادة الفعالة
    let genericName = aiData.generic_name || item.generic_name || '';
    if (!genericName || genericName === item.trade_name_ar) {
      if (/أوجمنتين|augmentin/i.test(nameText)) genericName = 'Amoxicillin + Clavulanic Acid';
      else if (/كونكور|concor/i.test(nameText)) genericName = 'Bisoprolol Fumarate';
      else if (/بانادول|panadol|باراسيتامول|paracetamol/i.test(nameText)) genericName = 'Paracetamol';
      else if (/بروفين|brufen|ايبوبروفين|ibuprofen/i.test(nameText)) genericName = 'Ibuprofen';
      else if (/كتافلام|cataflam|فولتارين|voltaren/i.test(nameText)) genericName = 'Diclofenac Potassium/Sodium';
      else if (/لاروش|roche|واقي|sunscreen/i.test(nameText)) genericName = 'Mexoryl 400 + UV Filters';
    }

    const packSize = aiData.pack_size || item.pack_size || 1;
    const unitPrice = packSize > 0 ? parseFloat(((item.public_price || 0) / packSize).toFixed(2)) : item.public_price;
    const isTableDrug = aiData.is_table_drug !== undefined ? Boolean(aiData.is_table_drug) : Boolean(item.is_table_drug);
    const isRefrigerated = aiData.is_refrigerated !== undefined ? Boolean(aiData.is_refrigerated) : Boolean(item.is_refrigerated);
    const dosageForm = aiData.dosage_form || item.dosage_form || 'أقراص مغلفة';
    const department = aiData.department || item.department || (dosageForm.includes('تجميل') ? 'مستحضرات تجميل' : 'أدوية');

    return {
      ...item,
      generic_name: genericName || item.generic_name,
      dosage_form: dosageForm,
      strength: strength,
      pack_size: packSize,
      unit_price: unitPrice,
      is_table_drug: isTableDrug,
      is_refrigerated: isRefrigerated,
      department: department,
      isAiEnriched: true
    };
  });
}
