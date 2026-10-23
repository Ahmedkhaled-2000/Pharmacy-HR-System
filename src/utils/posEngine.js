/**
 * posEngine.js
 * المحرك المركزي الموحد لنظام نقاط البيع الصيدلانية (PharmaOS Core Engine)
 * المرجع الأول والمصدر الموثوق (Single Source of Truth) لكافة قواعد:
 * 1. وحدات التجزئة والتسعير الكسري (علبة / شريط / قرص / أمبول / كيس / بخاخة).
 * 2. إدارة التشغيلات والصلاحيات بنظام FEFO (الأقرب انتهاءً أولاً) ومنع بيع المنتهي.
 * 3. رادار التفاعلات الدوائية الخطيرة (Drug-Drug Clinical Interaction Radar).
 * 4. محرك البدائل الذكية المرتبة بهامش الربحية والأقرب للصلاحية.
 * 5. أتمتة حسابات جرعات الأمراض المزمنة ورسائل الواتساب.
 * 6. احتساب حوافز وعمولات الكاشير اللحظية (Gamified Spiffs).
 */

// ── 1. قاموس التفاعلات الدوائية السريرية الحرجة (Clinical Interactions Database) ──
export const CRITICAL_DRUG_INTERACTIONS = [
  {
    pair: ['sildenafil', 'nitroglycerin'],
    pairAr: ['سيلدينافيل (فياجرا)', 'نيتروجلسرين (نيتروماك/مونوماك)'],
    severity: 'fatal',
    severityAr: 'خطير وقاتل ⛔',
    message: 'تعارض مميت يؤدي إلى هبوط حاد وفوري وضغط دم لا يمكن السيطرة عليه.'
  },
  {
    pair: ['tadalafil', 'isosorbide'],
    pairAr: ['تادالافيل (سيالس)', 'إيزوسوربيد دينترات/مونونيترات'],
    severity: 'fatal',
    severityAr: 'خطير وقاتل ⛔',
    message: 'هبوط حاد وقاتل في الدورة الدموية.'
  },
  {
    pair: ['warfarin', 'aspirin'],
    pairAr: ['وارفارين (ماريفان)', 'أسبرين'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'مضاعفة سيولة الدم وزيادة هائلة في احتمالية النزيف الداخلي الحاد.'
  },
  {
    pair: ['warfarin', 'ibuprofen'],
    pairAr: ['وارفارين (ماريفان)', 'إيبوبروفين (بروفين)'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'تثبيط وظائف الصفائح الدموية ومخاطر تقرح ونزيف في المعدة.'
  },
  {
    pair: ['methotrexate', 'ibuprofen'],
    pairAr: ['ميثوتريكسات', 'مضادات الالتهاب غير الستيرويدية (بروفين/كتافلام)'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'تسمم ميثوتريكسات حاد نتيجة تقليل إخراجه عن طريق الكلى.'
  },
  {
    pair: ['tramadol', 'escitalopram'],
    pairAr: ['ترامادول', 'إسيتالوبرام (سيبرالكس)'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'خطر حدوث متلازمة السيروتونين الخطيرة (Serotonin Syndrome) ونوبات صرع.'
  },
  {
    pair: ['clarithromycin', 'simvastatin'],
    pairAr: ['كلاريثروميسين (كلاسيد)', 'سيمفاستاتين (زوكس)'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'ارتفاع سمية الستاتين وتدمير العضلات وانحلال الربيدات (Rhabdomyolysis).'
  },
  {
    pair: ['ciprofloxacin', 'theophylline'],
    pairAr: ['سيبروفلوكساسين (سيبروباي)', 'ثيوفيللين (كيوبرون)'],
    severity: 'medium',
    severityAr: 'متوسط الخطورة ⚠️',
    message: 'ارتفاع حاد في تركيز الثيوفيللين في الدم مما يسبب تشنجات وتسارع ضربات القلب.'
  },
  {
    pair: ['metformin', 'contrast'],
    pairAr: ['ميتفورمين (سيدوفاج/جلوكوفاج)', 'صبغات الأشعة الميودنة'],
    severity: 'high',
    severityAr: 'عالي الخطورة ⚠️',
    message: 'خطر حدوث الحماض اللاكتيكي (Lactic Acidosis) والفشل الكلوي الحاد.'
  },
  {
    pair: ['spironolactone', 'lisinopril'],
    pairAr: ['سبيرونولاكتون (ألداكتون)', 'ليزينوبريل (زيستريل)'],
    severity: 'medium',
    severityAr: 'متوسط الخطورة ⚠️',
    message: 'خطر ارتفاع نسبة البوتاسيوم في الدم (Hyperkalemia) واضطراب كهربية القلب.'
  }
];

// ── 2. الكتالوج الدوائي المصري المعتمد والموسع (EDA Seed Catalog) ──
export const INITIAL_PHARMA_PRODUCTS = [
  {
    id: 'med-001',
    barcode: '6221001001011',
    barcodes: ['6221001001011', '0106221001001011', '6221001001011-BOX'],
    tradeNameAr: 'أوجمنتين 1 جم أقراص',
    tradeNameEn: 'Augmentin 1g Tablets',
    genericName: 'Amoxicillin + Clavulanic Acid',
    activeIngredients: ['Amoxicillin', 'Clavulanic Acid'],
    category: 'مضادات حيوية',
    dosageForm: 'أقراص مغلفة',
    strength: '1000 mg',
    packSize: 2, // 2 شريط بالعلبة (14 قرص)
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 7, // 7 أقراص بالشريط
    publicPrice: 130.00,
    costPrice: 98.00,
    subUnitPrice: 65.00,
    minStockLimit: 10,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 2.0, // نسبة عمولة تحفيزية
    manufacturer: 'GSK',
    batches: [
      { id: 'b-001-1', batchNo: 'GSK24901', expiryDate: '2027-08-30', qtyBase: 24, unitCost: 98.00 },
      { id: 'b-001-2', batchNo: 'GSK24550', expiryDate: '2026-12-15', qtyBase: 6, unitCost: 98.00 }
    ]
  },
  {
    id: 'med-002',
    barcode: '6221001001042',
    barcodes: ['6221001001042', '0106221001001042'],
    tradeNameAr: 'كيورام 1 جم أقراص',
    tradeNameEn: 'Curam 1g Tablets',
    genericName: 'Amoxicillin + Clavulanic Acid',
    activeIngredients: ['Amoxicillin', 'Clavulanic Acid'],
    category: 'مضادات حيوية',
    dosageForm: 'أقراص مغلفة',
    strength: '1000 mg',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 7,
    publicPrice: 115.00,
    costPrice: 82.00, // هامش ربح أعلى للصيدلية (33 ج بدلاً من 32 ج)
    subUnitPrice: 57.50,
    minStockLimit: 8,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 3.5, // عمولة أعلى
    manufacturer: 'Sandoz',
    batches: [
      { id: 'b-002-1', batchNo: 'SND8812', expiryDate: '2027-05-20', qtyBase: 18, unitCost: 82.00 }
    ]
  },
  {
    id: 'med-003',
    barcode: '6221001001059',
    barcodes: ['6221001001059'],
    tradeNameAr: 'هاي بيوتك 1 جم أقراص',
    tradeNameEn: 'Hibiotic 1g Tablets',
    genericName: 'Amoxicillin + Clavulanic Acid',
    activeIngredients: ['Amoxicillin', 'Clavulanic Acid'],
    category: 'مضادات حيوية',
    dosageForm: 'أقراص مغلفة',
    strength: '1000 mg',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 8,
    publicPrice: 109.00,
    costPrice: 75.00, // هامش ربح ممتاز (34 ج)
    subUnitPrice: 54.50,
    minStockLimit: 12,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 4.0,
    manufacturer: 'Amoun',
    batches: [
      { id: 'b-003-1', batchNo: 'AMN901', expiryDate: '2026-11-10', qtyBase: 8, unitCost: 75.00 } // أقرب انتهاءً
    ]
  },
  {
    id: 'med-004',
    barcode: '6221002002012',
    barcodes: ['6221002002012', 'CONCOR5MG'],
    tradeNameAr: 'كونكور 5 مجم أقراص',
    tradeNameEn: 'Concor 5mg Tablets',
    genericName: 'Bisoprolol Fumarate',
    activeIngredients: ['Bisoprolol Fumarate'],
    category: 'أدوية القلب والضغط',
    dosageForm: 'أقراص مغلفة',
    strength: '5 mg',
    packSize: 3, // 3 شرائط (30 قرص)
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 65.00,
    costPrice: 48.00,
    subUnitPrice: 21.67,
    minStockLimit: 15,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: true, // دواء أمراض مزمنة
    chronicDailyDose: 1, // قرص يومياً (تكفي 30 يوماً)
    commissionPct: 1.5,
    manufacturer: 'Merck',
    batches: [
      { id: 'b-004-1', batchNo: 'MCK774', expiryDate: '2028-02-15', qtyBase: 45, unitCost: 48.00 }
    ]
  },
  {
    id: 'med-005',
    barcode: '6221002002029',
    barcodes: ['6221002002029'],
    tradeNameAr: 'بيسوكارد 5 مجم أقراص',
    tradeNameEn: 'Bisocard 5mg Tablets',
    genericName: 'Bisoprolol Fumarate',
    activeIngredients: ['Bisoprolol Fumarate'],
    category: 'أدوية القلب والضغط',
    dosageForm: 'أقراص مغلفة',
    strength: '5 mg',
    packSize: 3,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 45.00,
    costPrice: 28.00, // هامش ربح أعلى (17 ج بدلاً من 17 ج على سعر أقل)
    subUnitPrice: 15.00,
    minStockLimit: 10,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: true,
    chronicDailyDose: 1,
    commissionPct: 3.0,
    manufacturer: 'EVA Pharma',
    batches: [
      { id: 'b-005-1', batchNo: 'EVA331', expiryDate: '2027-09-12', qtyBase: 30, unitCost: 28.00 }
    ]
  },
  {
    id: 'med-006',
    barcode: '6221003003013',
    barcodes: ['6221003003013', 'GLUCOPHAGE1000'],
    tradeNameAr: 'جلوكوفاج 1000 مجم أقراص',
    tradeNameEn: 'Glucophage 1000mg Tablets',
    genericName: 'Metformin Hydrochloride',
    activeIngredients: ['Metformin Hydrochloride'],
    category: 'أدوية السكر',
    dosageForm: 'أقراص ممتدة المفعول',
    strength: '1000 mg',
    packSize: 3, // 30 قرص
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 70.00,
    costPrice: 52.00,
    subUnitPrice: 23.33,
    minStockLimit: 20,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: true,
    chronicDailyDose: 2, // قرصين يومياً (تكفي 15 يوماً)
    commissionPct: 1.5,
    manufacturer: 'Merck',
    batches: [
      { id: 'b-006-1', batchNo: 'GLU908', expiryDate: '2028-01-20', qtyBase: 60, unitCost: 52.00 }
    ]
  },
  {
    id: 'med-007',
    barcode: '6221003003020',
    barcodes: ['6221003003020'],
    tradeNameAr: 'سيدوفاج 1000 مجم أقراص',
    tradeNameEn: 'Cidophage 1000mg Tablets',
    genericName: 'Metformin Hydrochloride',
    activeIngredients: ['Metformin Hydrochloride'],
    category: 'أدوية السكر',
    dosageForm: 'أقراص',
    strength: '1000 mg',
    packSize: 3,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 42.00,
    costPrice: 28.00,
    subUnitPrice: 14.00,
    minStockLimit: 25,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: true,
    chronicDailyDose: 2,
    commissionPct: 2.5,
    manufacturer: 'CID',
    batches: [
      { id: 'b-007-1', batchNo: 'CID442', expiryDate: '2027-11-15', qtyBase: 40, unitCost: 28.00 }
    ]
  },
  {
    id: 'med-008',
    barcode: '6221004004014',
    barcodes: ['6221004004014', 'PANADOLBLUE'],
    tradeNameAr: 'بانادول أزرق 500 مجم',
    tradeNameEn: 'Panadol Advance 500mg',
    genericName: 'Paracetamol',
    activeIngredients: ['Paracetamol'],
    category: 'مسكنات وخافض حرارة',
    dosageForm: 'أقراص مغلفة',
    strength: '500 mg',
    packSize: 2, // 24 قرص (شريطين x 12)
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 12,
    publicPrice: 45.00,
    costPrice: 35.00,
    subUnitPrice: 22.50,
    minStockLimit: 30,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 1.0,
    manufacturer: 'GSK',
    batches: [
      { id: 'b-008-1', batchNo: 'PAN112', expiryDate: '2028-06-30', qtyBase: 120, unitCost: 35.00 }
    ]
  },
  {
    id: 'med-009',
    barcode: '6221004004021',
    barcodes: ['6221004004021'],
    tradeNameAr: 'سيتال 500 مجم أقراص',
    tradeNameEn: 'Cetal 500mg Tablets',
    genericName: 'Paracetamol',
    activeIngredients: ['Paracetamol'],
    category: 'مسكنات وخافض حرارة',
    dosageForm: 'أقراص',
    strength: '500 mg',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 24.00,
    costPrice: 15.00, // هامش ربح أعلى كنسبة مئوية
    subUnitPrice: 12.00,
    minStockLimit: 20,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 3.0,
    manufacturer: 'EIPICO',
    batches: [
      { id: 'b-009-1', batchNo: 'CET889', expiryDate: '2027-10-10', qtyBase: 80, unitCost: 15.00 }
    ]
  },
  {
    id: 'med-010',
    barcode: '6221005005015',
    barcodes: ['6221005005015', 'VOLTAREN75'],
    tradeNameAr: 'فولتارين 75 مجم أمبول',
    tradeNameEn: 'Voltaren 75mg/3ml Ampoules',
    genericName: 'Diclofenac Sodium',
    activeIngredients: ['Diclofenac Sodium'],
    category: 'مسكنات ومضادات التهاب',
    dosageForm: 'أمبولات حقن عضل',
    strength: '75 mg / 3ml',
    packSize: 6, // 6 أمبولات
    baseUnit: 'علبة',
    subUnit: 'أمبول',
    piecesPerSubUnit: 1,
    publicPrice: 66.00,
    costPrice: 50.00,
    subUnitPrice: 11.00,
    minStockLimit: 15,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 2.0,
    manufacturer: 'Novartis',
    batches: [
      { id: 'b-010-1', batchNo: 'NVR440', expiryDate: '2027-04-15', qtyBase: 35, unitCost: 50.00 }
    ]
  },
  {
    id: 'med-011',
    barcode: '6221006006016',
    barcodes: ['6221006006016', 'CATAFLAM50'],
    tradeNameAr: 'كتافلام 50 مجم أقراص',
    tradeNameEn: 'Cataflam 50mg Tablets',
    genericName: 'Diclofenac Potassium',
    activeIngredients: ['Diclofenac Potassium'],
    category: 'مسكنات ومضادات التهاب',
    dosageForm: 'أقراص ملبسة سريعة المفعول',
    strength: '50 mg',
    packSize: 2, // 20 قرص
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 58.00,
    costPrice: 44.00,
    subUnitPrice: 29.00,
    minStockLimit: 25,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 1.5,
    manufacturer: 'Novartis',
    batches: [
      { id: 'b-011-1', batchNo: 'CAT991', expiryDate: '2027-07-22', qtyBase: 50, unitCost: 44.00 }
    ]
  },
  {
    id: 'med-012',
    barcode: '6221007007017',
    barcodes: ['6221007007017'],
    tradeNameAr: 'سيلدين 100 مجم أقراص',
    tradeNameEn: 'Silden 100mg Tablets',
    genericName: 'Sildenafil',
    activeIngredients: ['Sildenafil'],
    category: 'صحة الرجال',
    dosageForm: 'أقراص مغلفة',
    strength: '100 mg',
    packSize: 1, // 4 أقراص
    baseUnit: 'علبة',
    subUnit: 'قرص',
    piecesPerSubUnit: 4,
    publicPrice: 40.00,
    costPrice: 24.00,
    subUnitPrice: 10.00,
    minStockLimit: 10,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 5.0, // عمولة مرتفعة
    manufacturer: 'EVA Pharma',
    batches: [
      { id: 'b-012-1', batchNo: 'SIL554', expiryDate: '2028-03-30', qtyBase: 25, unitCost: 24.00 }
    ]
  },
  {
    id: 'med-013',
    barcode: '6221008008018',
    barcodes: ['6221008008018'],
    tradeNameAr: 'نيتروماك ريتارد 2.5 مجم',
    tradeNameEn: 'Nitromak Retard 2.5mg',
    genericName: 'Nitroglycerin',
    activeIngredients: ['Nitroglycerin'],
    category: 'أدوية القلب والذبحة',
    dosageForm: 'كبسولات ممتدة المفعول',
    strength: '2.5 mg',
    packSize: 3, // 30 كبسولة
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 38.00,
    costPrice: 27.00,
    subUnitPrice: 12.67,
    minStockLimit: 5,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: true,
    chronicDailyDose: 2,
    commissionPct: 2.0,
    manufacturer: 'October Pharma',
    batches: [
      { id: 'b-013-1', batchNo: 'NIT102', expiryDate: '2027-01-18', qtyBase: 15, unitCost: 27.00 }
    ]
  },
  {
    id: 'med-014',
    barcode: '6221009009019',
    barcodes: ['6221009009019', 'LAROCHE-EFFACLAR'],
    tradeNameAr: 'لاروش إيفاكلار غسول للبشرة 200 مل',
    tradeNameEn: 'La Roche-Posay Effaclar Purifying Gel 200ml',
    genericName: 'Zinc PCA + Thermal Water Face Wash',
    activeIngredients: ['Zinc PCA', 'Thermal Spring Water'],
    category: 'مستحضرات تجميل وعناية',
    dosageForm: 'جل منظف للبشرة',
    strength: '200 ml',
    packSize: 1,
    baseUnit: 'عبوة',
    subUnit: 'عبوة',
    piecesPerSubUnit: 1,
    publicPrice: 420.00,
    costPrice: 310.00, // هامش ربح ضخم 110 ج
    subUnitPrice: 420.00,
    minStockLimit: 4,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 6.0, // عمولة ممتازة للصيدلي (25.20 ج لكل علبة مباعة)
    manufacturer: 'L\'Oréal',
    batches: [
      { id: 'b-014-1', batchNo: 'LRP998', expiryDate: '2028-11-30', qtyBase: 12, unitCost: 310.00 }
    ]
  },
  {
    id: 'med-015',
    barcode: '6221010010020',
    barcodes: ['6221010010020', 'CERAVE-MOIST-177'],
    tradeNameAr: 'سيرافي لوشن مرطب للبشرة 236 مل',
    tradeNameEn: 'CeraVe Daily Moisturizing Lotion 236ml',
    genericName: 'Ceramides + Hyaluronic Acid Lotion',
    activeIngredients: ['Ceramides 1, 3, 6-II', 'Hyaluronic Acid'],
    category: 'مستحضرات تجميل وعناية',
    dosageForm: 'لوشن مرطب',
    strength: '236 ml',
    packSize: 1,
    baseUnit: 'عبوة',
    subUnit: 'عبوة',
    piecesPerSubUnit: 1,
    publicPrice: 380.00,
    costPrice: 285.00, // هامش ربح 95 ج
    subUnitPrice: 380.00,
    minStockLimit: 5,
    isTableDrug: false,
    isRefrigerated: false,
    isChronic: false,
    commissionPct: 5.5,
    manufacturer: 'CeraVe',
    batches: [
      { id: 'b-015-1', batchNo: 'CRV667', expiryDate: '2028-09-15', qtyBase: 10, unitCost: 285.00 }
    ]
  }
];

// ── 3. دوال التطبيع والتطابق النصي ──
export function normalizePosSearchText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // تشكيل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[-_./\\(),+]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * 4. البحث الدوائي الفوري بالباركود أو الاسم العربي أو الإنجليزي أو المادة الفعالة
 */
export function searchProducts(catalog, query) {
  if (!query || !query.trim()) return [];
  const cleanQ = normalizePosSearchText(query);
  const rawQ = query.trim().toLowerCase();

  return (catalog || []).filter((prod) => {
    if (!prod) return false;

    // تطابق الباركود المباشر الدقيق (الأولوية الأولى لمسح الباركود)
    if (prod.barcode === rawQ || (prod.barcodes && prod.barcodes.includes(rawQ))) {
      return true;
    }

    // فحص الباركود الدولي GS1 DataMatrix الجزئي
    if (prod.barcode && rawQ.length > 8 && (rawQ.includes(prod.barcode) || prod.barcode.includes(rawQ))) {
      return true;
    }

    // تطابق الاسم التجاري العربي
    const normAr = normalizePosSearchText(prod.tradeNameAr);
    if (normAr.includes(cleanQ)) return true;

    // تطابق الاسم التجاري الإنجليزي
    const normEn = (prod.tradeNameEn || '').toLowerCase();
    if (normEn.includes(rawQ)) return true;

    // تطابق المادة الفعالة
    const normGen = normalizePosSearchText(prod.genericName);
    if (normGen.includes(cleanQ) || (prod.genericName || '').toLowerCase().includes(rawQ)) {
      return true;
    }

    // تطابق الشركة المصنعة
    if ((prod.manufacturer || '').toLowerCase().includes(rawQ)) return true;

    return false;
  });
}

/**
 * 5. فحص التفاعلات الدوائية الخطيرة بالسلة (Drug-Drug Interaction Radar)
 */
export function detectCartDrugInteractions(cartItems = []) {
  if (!cartItems || cartItems.length < 2) return [];

  const foundInteractions = [];
  const activeList = cartItems
    .map((item) => {
      const g = (item.genericName || '').toLowerCase();
      const name = item.tradeNameAr || item.tradeNameEn;
      return { id: item.id, name, generic: g };
    })
    .filter((i) => i.generic);

  CRITICAL_DRUG_INTERACTIONS.forEach((rule) => {
    const [d1, d2] = rule.pair;
    const match1 = activeList.find((i) => i.generic.includes(d1));
    const match2 = activeList.find((i) => i.generic.includes(d2) && i.id !== match1?.id);

    if (match1 && match2) {
      foundInteractions.push({
        ...rule,
        item1: match1.name,
        item2: match2.name,
        timestamp: Date.now()
      });
    }
  });

  return foundInteractions;
}

/**
 * 6. محرك استرجاع وترتيب البدائل الذكية (Smart Substitutes & Profit Engine)
 * يرتب حسب: (هامش الربحية للصيدلية * 0.6) + (أقرب صلاحية بالمخزن * 0.4)
 */
export function findSmartSubstitutes(targetProduct, allProducts = []) {
  if (!targetProduct || !targetProduct.genericName) return [];

  const targetGeneric = normalizePosSearchText(targetProduct.genericName);

  // إيجاد كافة الأدوية التي تشترك في نفس المادة الفعالة (أو جزء منها)
  const matches = (allProducts || []).filter((p) => {
    if (p.id === targetProduct.id) return false;
    const pGeneric = normalizePosSearchText(p.genericName);
    return pGeneric === targetGeneric || pGeneric.includes(targetGeneric) || targetGeneric.includes(pGeneric);
  });

  // حساب درجة الأولوية الذكية لكل بديل
  const scored = matches.map((item) => {
    // هامش الربح النقدي
    const profitMargin = Math.max(0, (item.publicPrice || 0) - (item.costPrice || 0));
    const profitPct = item.publicPrice > 0 ? (profitMargin / item.publicPrice) * 100 : 0;

    // أقرب تاريخ صلاحية متاح بالمخزن
    const batches = item.batches || [];
    let nearestExpiryDays = 9999;
    let totalStock = 0;

    batches.forEach((b) => {
      totalStock += parseFloat(b.qtyBase) || 0;
      if (b.expiryDate) {
        const diff = Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (diff > 0 && diff < nearestExpiryDays) {
          nearestExpiryDays = diff;
        }
      }
    });

    // كلما كانت الصلاحية أقرب (مع عدم انتهائها)، تزيد أولوية البيع للتخلص منها ومنع الخسارة
    const expiryUrgencyScore = nearestExpiryDays <= 120 ? 100 : nearestExpiryDays <= 240 ? 70 : 30;

    // المؤشر المركب النهائي
    const compositeScore = (profitPct * 0.6) + (expiryUrgencyScore * 0.4);

    return {
      ...item,
      profitMargin,
      profitPct: profitPct.toFixed(1),
      totalStock,
      nearestExpiryDays,
      compositeScore
    };
  });

  // فرز تنازلي حسب الدرجة المركبة
  return scored.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * 7. محرك حساب بند السلة واختيار وحدة البيع (علبة / شريط / قرص)
 */
export function calculateCartItemLine(product, unitType = 'base', qty = 1, customDiscount = 0) {
  const packSize = parseInt(product.packSize || 1, 10);
  const piecesPerSubUnit = parseInt(product.piecesPerSubUnit || 1, 10);
  const publicPrice = parseFloat(product.publicPrice || 0);
  const costPrice = parseFloat(product.costPrice || 0);

  let unitPrice = publicPrice;
  let unitCost = costPrice;
  let unitLabel = product.baseUnit || 'علبة';

  if (unitType === 'sub') {
    // بيع بالشريط
    unitPrice = parseFloat(product.subUnitPrice || (publicPrice / packSize).toFixed(2));
    unitCost = parseFloat((costPrice / packSize).toFixed(2));
    unitLabel = product.subUnit || 'شريط';
  } else if (unitType === 'piece') {
    // بيع بالقرص / الأمبول المفرد
    const totalPiecesInBox = packSize * piecesPerSubUnit;
    unitPrice = parseFloat((publicPrice / totalPiecesInBox).toFixed(2));
    unitCost = parseFloat((costPrice / totalPiecesInBox).toFixed(2));
    unitLabel = 'قرص/وحدة';
  }

  const quantity = Math.max(0.1, parseFloat(qty) || 1);
  const discountPct = Math.min(100, Math.max(0, parseFloat(customDiscount) || 0));

  const rawSubtotal = unitPrice * quantity;
  const discountAmount = (rawSubtotal * (discountPct / 100));
  const lineTotal = Math.max(0, rawSubtotal - discountAmount);

  // احتساب العمولة اللحظية (Spiff) للصيدلي
  const commPct = parseFloat(product.commissionPct || 0);
  const instantCommission = (lineTotal * (commPct / 100));

  return {
    productId: product.id,
    tradeNameAr: product.tradeNameAr,
    tradeNameEn: product.tradeNameEn,
    genericName: product.genericName,
    barcode: product.barcode,
    category: product.category,
    unitType,
    unitLabel,
    quantity,
    unitPrice,
    unitCost,
    discountPct,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    lineTotal: parseFloat(lineTotal.toFixed(2)),
    instantCommission: parseFloat(instantCommission.toFixed(2)),
    isChronic: Boolean(product.isChronic),
    chronicDailyDose: product.chronicDailyDose || 1
  };
}

/**
 * 8. فحص تاريخ الصلاحية
 */
export function checkBatchExpiryStatus(expiryDateStr) {
  if (!expiryDateStr) return { isExpired: false, isNearExpiry: false, daysLeft: 999 };
  const expDate = new Date(expiryDateStr);
  const now = new Date();
  const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return { isExpired: true, isNearExpiry: false, daysLeft: diffDays, label: 'منتهي الصلاحية ⛔' };
  }
  if (diffDays <= 120) {
    return { isExpired: false, isNearExpiry: true, daysLeft: diffDays, label: `أوشك على الانتهاء (${diffDays} يوم) ⚠️` };
  }
  return { isExpired: false, isNearExpiry: false, daysLeft: diffDays, label: 'صالح ✅' };
}

/**
 * 9. إنشاء نص رسالة الواتساب التلقائية للأمراض المزمنة (Chronic Refill Template)
 */
export function buildChronicWhatsAppRefillMessage({
  customerName = 'عزيزنا العميل',
  medicationName = '',
  branchName = 'مجموعة الصيدليات',
  branchPhone = ''
}) {
  return `السلام عليكم ورحمة الله وبركاته، أهلاً بك أستاذ ${customerName} 🌸

نود إحاطتكم علماً من ${branchName} بأنه وفقاً لجدول العلاج المعتمد، فإن دواء:
💊 *(${medicationName})*
أوشك على الانتهاء خلال أيام قليلة.

حرصاً منا على استقرار حالتكم الصحية وعدم انقطاع الجرعة، يسعدنا تحضير العبوة الجديدة وإرسالها لكم فوراً مع خدمة التوصيل السريع (الدليفري).

للتأكيد والاستلام، تفضل بالرد على هذه الرسالة أو التواصل معنا على: ${branchPhone} 📞
نسأل الله لكم دوام الصحة والعافية! ❤️`;
}
