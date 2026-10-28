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

export const INVOICE_TYPES = {
  otc: { id: 'otc', label: 'OTC', icon: '🟢', color: '#10b981', badgeClass: 'pos-badge-otc', desc: 'أدوية ومستلزمات البيع المباشر' },
  rx: { id: 'rx', label: 'روشتة', icon: '💊', color: '#0ea5e9', badgeClass: 'pos-badge-rx', desc: 'صرف وصفة وتذكرة طبية معتمدة' },
  customer_order: { id: 'customer_order', label: 'طلب عميل', icon: '📋', color: '#f59e0b', badgeClass: 'pos-badge-order', desc: 'توفير طلب ونواقص مخصوصة لعميل' },
  delivery: { id: 'delivery', label: 'توصيل', icon: '🛵', color: '#8b5cf6', badgeClass: 'pos-badge-delivery', desc: 'فاتورة مرسلة مع طيار التوصيل' }
};

// قاموس الأعراض والمؤشرات الدوائية واللهجة المصرية للبحث الذكي السريري
const INDICATION_KEYWORDS = {
  'صداع': ['paracetamol', 'ibuprofen', 'aspirin', 'بانادول', 'كتافلام', 'بروفين', 'بنادول', 'أدول', 'سيتال'],
  'شقيقة': ['triptan', 'ergotamine', 'ميجريكتيك', 'سيرفام'],
  'مسكن': ['paracetamol', 'ibuprofen', 'ketoprofen', 'diclofenac', 'بروفين', 'كتافلام', 'بانادول', 'فولتارين', 'باي الكوفان'],
  'ألم': ['paracetamol', 'ibuprofen', 'diclofenac', 'فولتارين', 'كتافلام', 'بروفين'],
  'وجع': ['paracetamol', 'ibuprofen', 'diclofenac', 'بروفين', 'كتافلام'],
  'سخونية': ['paracetamol', 'ibuprofen', 'بانادول', 'بروفين', 'سيتال', 'كونترافيفر'],
  'حرارة': ['paracetamol', 'ibuprofen', 'بانادول', 'بروفين', 'سيتال'],
  'حمى': ['paracetamol', 'ibuprofen', 'سيتال'],
  'كحة': ['cough', 'bronchicum', 'ophiocordyceps', 'برونكوتك', 'بلسم', 'توسكان', 'سيلجون', 'أوبلكس', 'كوديلار'],
  'سعال': ['cough', 'bronchicum', 'توسكان', 'سيلجون', 'أوبلكس'],
  'بلغم': ['mucolytic', 'acetylcysteine', 'ambroxol', 'bromhexine', 'فلوموسيل', 'استيل سستايين', 'ميوكوسول', 'ميوكوفللين'],
  'برد': ['flurest', 'congestion', 'كومتركس', 'كونجستال', 'فلورست', '123', 'بنادول كولد اند فلو'],
  'زكام': ['flurest', 'congestion', 'كونجستال', 'كومتركس', 'أوتريفين'],
  'رشح': ['flurest', 'cetirizine', 'pseudoephedrine', 'كونجستال', 'تلفاست', 'زيرتك'],
  'احتقان': ['otrivin', 'decongestant', 'أوتريفين', 'زايلومتامولين', 'ديكوزال'],
  'مغص': ['antispasmodic', 'drotaverine', 'hyoscine', 'بسكوبان', 'سبازموبيرالجين', 'كولونا', 'فيسرالجين'],
  'تقلصات': ['antispasmodic', 'drotaverine', 'hyoscine', 'بسكوبان', 'سبازموبيرالجين'],
  'حموضة': ['omeprazole', 'pantoprazole', 'esomeprazole', 'antacid', 'كونترولوك', 'نيكسيوم', 'انتودين', 'مالوكس', 'جافيسكون'],
  'حرقان': ['omeprazole', 'pantoprazole', 'antacid', 'كونترولوك', 'نيكسيوم', 'جافيسكون'],
  'ارتجاع': ['esomeprazole', 'omeprazole', 'نيكسيوم', 'كونترولوك', 'جافيسكون'],
  'قولون': ['mebeverine', 'spasmocanulase', 'colona', 'كولونا', 'دوسباتالين', 'سبازموكانيوليز', 'كولوفيرين'],
  'انتفاخ': ['simethicone', 'disflatyl', 'دوفلاك', 'ديسفلاتيل', 'اوكاربون'],
  'غازات': ['simethicone', 'charcoal', 'ديسفلاتيل', 'اوكاربون'],
  'إسهال': ['antinal', 'streptoquin', 'loperamide', 'أنتينال', 'ستربتوكين', 'إيموديوم', 'دياكس'],
  'اسهال': ['antinal', 'streptoquin', 'أنتينال', 'ستربتوكين', 'إيموديوم'],
  'إمساك': ['laxative', 'lactulose', 'bisacodyl', 'دوفلاك', 'لاكتيلوز', 'بيكولاكس', 'مينالاكس'],
  'امساك': ['laxative', 'lactulose', 'دوفلاك', 'لاكتيلوز', 'بيكولاكس'],
  'ترجيع': ['domperidone', 'ondansetron', 'motilium', 'موتيليوم', 'دانست', 'زوران', 'برمبران'],
  'قيء': ['domperidone', 'metoclopramide', 'موتيليوم', 'برمبران'],
  'غثيان': ['domperidone', 'ondansetron', 'موتيليوم', 'فوماتوب'],
  'دوخة': ['betahistine', 'cinnarizine', 'بيتاسيرك', 'ستوجيرون', 'فيرسيرك'],
  'دوار': ['betahistine', 'بيتاسيرك', 'ستوجيرون'],
  'ضغط': ['bisoprolol', 'amlodipine', 'valsartan', 'كونكور', 'بيسوكارد', 'إكسفورج', 'نورفاسك', 'كابوتين'],
  'سكر': ['metformin', 'glimepiride', 'سيدوفاج', 'جلوكوفاج', 'اماريل', 'جانوفيا', 'دياميكرون'],
  'سيولة': ['aspirin', 'warfarin', 'clopidogrel', 'أسبرين بروتكت', 'جوسبرين', 'بلافيكس', 'ماريفان'],
  'مضاد': ['amoxicillin', 'clavulanic', 'ceftriaxone', 'أوجمنتين', 'كيورام', 'هاي بيوتك', 'سيفوتاكس', 'يوناسين', 'زيثروكان'],
  'حيوي': ['amoxicillin', 'clavulanic', 'ceftriaxone', 'أوجمنتين', 'كيورام', 'هاي بيوتك'],
  'حساسية': ['cetirizine', 'loratadine', 'fexofenadine', 'تلفاست', 'زيرتك', 'كلاريتين', 'فنستيل'],
  'هرش': ['cetirizine', 'hydrocortisone', 'زيرتك', 'تلفاست', 'كورتيديرم'],
  'حكة': ['cetirizine', 'calamine', 'تلفاست', 'كلامين'],
  'معدة': ['omeprazole', 'pantoprazole', 'esomeprazole', 'كونترولوك', 'نيكسيوم', 'انتودين'],
  'عظام': ['nsaid', 'meloxicam', 'celecoxib', 'موفيكس', 'سيليبركس', 'كتافلام', 'فولتارين'],
  'مفاصل': ['glucosamine', 'celecoxib', 'جينوفيل', 'سيليبركس', 'دوروفين'],
  'خشونة': ['glucosamine', 'chondroitin', 'جينوفيل', 'دوروفين', 'سي اتش الفا'],
  'شد': ['muscle relaxant', 'chlorzoxazone', 'ديمرا', 'ميولجين', 'مارك فاست'],
  'باسط': ['muscle relaxant', 'chlorzoxazone', 'ديمرا', 'ميولجين'],
  'أعصاب': ['vitamin b', 'mecobalamin', 'ميلجا', 'نيوروتون', 'نيوروفيت', 'بيفيت'],
  'تنميل': ['vitamin b', 'ميلجا', 'نيوروتون'],
  'عين': ['tears', 'carboxymethylcellulose', 'تيرز جارد', 'سيستان', 'هاي فريش'],
  'أذن': ['wax', 'ear drops', 'اوتوكالم', 'ريموفاكس'],
  'حروق': ['silver sulfadiazine', 'mebo', 'ميبو', 'ديرمازين'],
  'جروح': ['betadine', 'bivacyn', 'بيتادين', 'بيفاثين', 'فيوسيدين'],
  'مرهم': ['fucidic', 'bepanthen', 'فيوسيدين', 'كيناكومب', 'بيبانثين'],
  'كريم': ['fucidic', 'panthenol', 'فيوسيدين', 'بانثينول'],
  'فيتامين': ['multivitamin', 'zinc', 'iron', 'سنترم', 'ليميتلس', 'زنكترون', 'فيروجلوبين'],
  'حديد': ['ferrous', 'ferroglobin', 'فيروجلوبين', 'فيروترون'],
  'أنيميا': ['iron', 'folic', 'فيروجلوبين', 'فيروترون'],
  'أرق': ['melatonin', 'night', 'نايت كالم', 'ميلاتونين'],
  'مهدئ': ['calm', 'relax', 'نايت كالم']
};

/**
 * 4. البحث الدوائي الفوري بالباركود أو الاسم العربي أو الإنجليزي أو المادة الفعالة أو العرض الطبي
 */
/**
 * دالة حساب مسافة التعديل (Levenshtein Distance) للتسامح مع الأخطاء الإملائية
 */
function calculateLevenshtein(a, b) {
  if (!a || !b) return (a || '').length + (b || '').length;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return 0;
  if (s1.length > 30 || s2.length > 30) return 99; // حماية الأداء للكلمات الطويلة جداً

  const row = [];
  for (let j = 0; j <= s2.length; j++) row[j] = j;

  for (let i = 1; i <= s1.length; i++) {
    let prev = i;
    for (let j = 1; j <= s2.length; j++) {
      let val;
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }
  return row[s2.length];
}

/**
 * 4. البحث الدوائي الفوري الذكي بالباركود أو الاسم أو المادة الفعالة مع التسامح الإملائي وترتيب أصناف الفرع أولاً
 */
export function searchProducts(catalog, query) {
  if (!query || !query.trim()) return [];
  const cleanQ = normalizePosSearchText(query);
  const rawQ = query.trim().toLowerCase();
  const qPrefix3 = cleanQ.length >= 3 ? cleanQ.slice(0, 3) : null;
  const rawPrefix3 = rawQ.length >= 3 ? rawQ.slice(0, 3) : null;

  // فحص الكلمات الدلالية للأعراض (صداع، مسكن، ضغط...)
  const matchingIndicationTerms = Object.entries(INDICATION_KEYWORDS)
    .filter(([key]) => cleanQ.includes(key));

  const existingIds = new Set((catalog || []).map((p) => p?.id));
  const mergedCatalog = [...(catalog || [])];
  for (const fastItem of PHARMA_FAST_OTC_ITEMS) {
    if (!existingIds.has(fastItem.id)) {
      mergedCatalog.push(fastItem);
    }
  }

  const scoredResults = [];

  for (const prod of mergedCatalog) {
    if (!prod) continue;

    // حساب الرصيد الفعلي المتوفر في الفرع الحالي
    const branchStockCount = (prod.batches || []).reduce((sum, b) => sum + (parseFloat(b.qtyBase) || 0), 0) +
      (parseFloat(prod.stock) || 0) + (parseFloat(prod.branchStock) || 0);
    const hasBranchStock = branchStockCount > 0;

    let score = 0;
    let matchFound = false;

    // 1. تطابق الباركود المباشر الدقيق (الأولوية القصوى المطلقة)
    if (prod.barcode === rawQ || (prod.barcodes && prod.barcodes.includes(rawQ))) {
      score += 2000;
      matchFound = true;
    } else if (prod.barcode && rawQ.length > 7 && (rawQ.includes(prod.barcode) || prod.barcode.includes(rawQ))) {
      score += 1500;
      matchFound = true;
    }

    const normAr = normalizePosSearchText(prod.tradeNameAr);
    const normEn = (prod.tradeNameEn || '').toLowerCase();
    const normGen = normalizePosSearchText(prod.genericName);
    const rawGen = (prod.genericName || '').toLowerCase();

    // 2. تطابق مباشر بالاسم العربي أو الإنجليزي
    if (normAr === cleanQ || normEn === rawQ) {
      score += 1000;
      matchFound = true;
    } else if (normAr.startsWith(cleanQ) || normEn.startsWith(rawQ)) {
      score += 600;
      matchFound = true;
    } else if (normAr.includes(cleanQ) || normEn.includes(rawQ)) {
      score += 400;
      matchFound = true;
    }

    // 3. تطابق المادة الفعالة
    if (normGen.includes(cleanQ) || rawGen.includes(rawQ)) {
      score += 300;
      matchFound = true;
    }

    // 4. تطابق بادئة أول 3 حروف (3-Letter Prefix Trigger)
    if (!matchFound && qPrefix3) {
      const arTokens = normAr.split(/\s+/);
      const enTokens = normEn.split(/\s+/);
      const genTokens = rawGen.split(/\s+/);

      if (
        arTokens.some((t) => t.startsWith(qPrefix3)) ||
        enTokens.some((t) => t.startsWith(rawPrefix3)) ||
        genTokens.some((t) => t.startsWith(rawPrefix3))
      ) {
        score += 200;
        matchFound = true;
      }
    }

    // 5. التسامح الإملائي الفائق (Typo Tolerance & Fuzzy Search) للكلمات من 3 حروف فأكثر
    if (!matchFound && cleanQ.length >= 3) {
      const arTokens = normAr.split(/\s+/);
      const enTokens = normEn.split(/\s+/);

      // فحص قرب المسافة لأي كلمة من كلمات اسم الدواء
      const maxAllowedDist = cleanQ.length <= 4 ? 1 : 2;
      const fuzzyMatchAr = arTokens.some((tok) => Math.abs(tok.length - cleanQ.length) <= 2 && calculateLevenshtein(tok, cleanQ) <= maxAllowedDist);
      const fuzzyMatchEn = enTokens.some((tok) => Math.abs(tok.length - rawQ.length) <= 2 && calculateLevenshtein(tok, rawQ) <= maxAllowedDist);

      if (fuzzyMatchAr || fuzzyMatchEn) {
        score += 150;
        matchFound = true;
      }
    }

    // 6. تطابق الأعراض والمؤشرات الدلالية
    if (matchingIndicationTerms.length > 0) {
      const pCombined = `${prod.tradeNameAr} ${prod.tradeNameEn} ${prod.genericName}`.toLowerCase();
      if (matchingIndicationTerms.some(([key, terms]) => terms.some((t) => pCombined.includes(t.toLowerCase())))) {
        score += 120;
        matchFound = true;
      }
    }

    // 7. مضاعفة النقاط للأصناف المتوفرة بالفرع (Branch Inventory Prioritization)
    // هذا يضمن صعود الأصناف الموجودة على رفوف الفرع الحالي إلى مقدمة نتائج البحث
    if (hasBranchStock) {
      score += 800; // أسبقية ساحقة للأصناف المتوفرة برصيد فعلي بالفرع
    }

    if (matchFound) {
      scoredResults.push({
        ...prod,
        branchStockCount,
        hasBranchStock,
        searchScore: score
      });
    }
  }

  // ترتيب النتائج تنازلياً حسب درجة المطابقة وأسبقية مخزون الفرع
  scoredResults.sort((a, b) => b.searchScore - a.searchScore);

  return scoredResults;
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
export function calculateCartItemLine(product, unitType = 'base', qty = 1, customDiscount = 0, customItemType = null) {
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

  // تحديد تصنيف البند (OTC أم روشتة أم طلب عميل)
  const itemType = customItemType || (product.itemType ? product.itemType : (product.isTableDrug || product.isChronic ? 'rx' : 'otc'));

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
    chronicDailyDose: product.chronicDailyDose || 1,
    itemType // 'otc' | 'rx' | 'customer_order'
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

/**
 * 10. قائمة الأصناف السريعة الأكثر مبيعاً والأدوية الشائعة (Fast OTC & Counter Items)
 */
export const FAST_OTC_CATEGORIES = [
  { id: 'all', label: '🌟 الكل', icon: '⚡' },
  { id: 'pain', label: '💊 مسكنات وحرارة', icon: '🌡️' },
  { id: 'cold', label: '🤧 برد وإنفلونزا', icon: '❄️' },
  { id: 'supplies', label: '🩹 مستلزمات وإسعافات', icon: '💉' },
  { id: 'digestive', label: '👶 جهاز هضمي وأطفال', icon: '🫄' }
];

export const PHARMA_FAST_OTC_ITEMS = [
  // ── 1. مسكنات وخافضات حرارة ──
  {
    id: 'fast-panadol-extra',
    barcode: '6221008001011',
    barcodes: ['6221008001011', 'PANADOL_EXTRA'],
    tradeNameAr: 'بانادول إكسترا أقراص',
    tradeNameEn: 'Panadol Extra Tablets',
    genericName: 'Paracetamol + Caffeine',
    category: 'مسكنات وخافضات حرارة',
    group: 'pain',
    dosageForm: 'أقراص',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 12,
    publicPrice: 42.00,
    subUnitPrice: 21.00,
    costPrice: 32.00,
    commissionPct: 2.5,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_pan_ext', batchNo: 'GSK-FAST', expiryDate: '2028-06-30', qtyBase: 65 }]
  },
  {
    id: 'fast-panadol-advance',
    barcode: '6221008001028',
    barcodes: ['6221008001028', 'PANADOL_ADVANCE'],
    tradeNameAr: 'بانادول أدفانس أزرق',
    tradeNameEn: 'Panadol Advance Blue',
    genericName: 'Paracetamol 500mg',
    category: 'مسكنات وخافضات حرارة',
    group: 'pain',
    dosageForm: 'أقراص',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 12,
    publicPrice: 34.00,
    subUnitPrice: 17.00,
    costPrice: 26.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_pan_adv', batchNo: 'GSK-FAST2', expiryDate: '2028-08-15', qtyBase: 50 }]
  },
  {
    id: 'fast-brufen-400',
    barcode: '6221008001035',
    barcodes: ['6221008001035', 'BRUFEN400'],
    tradeNameAr: 'بروفين 400 مجم أقراص',
    tradeNameEn: 'Brufen 400mg Tablets',
    genericName: 'Ibuprofen 400mg',
    category: 'مسكنات ومضادات التهاب',
    group: 'pain',
    dosageForm: 'أقراص مغلفة',
    packSize: 3,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 63.00,
    subUnitPrice: 21.00,
    costPrice: 48.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_bru_400', batchNo: 'ABT-882', expiryDate: '2027-11-20', qtyBase: 40 }]
  },
  {
    id: 'fast-catafast-50',
    barcode: '6221008001042',
    barcodes: ['6221008001042', 'CATAFAST50'],
    tradeNameAr: 'كتافاست 50 مجم أكياس فوار',
    tradeNameEn: 'Catafast 50mg Sachets',
    genericName: 'Diclofenac Potassium 50mg',
    category: 'مسكنات سريعة',
    group: 'pain',
    dosageForm: 'أكياس فوار',
    packSize: 9,
    baseUnit: 'علبة',
    subUnit: 'كيس',
    piecesPerSubUnit: 1,
    publicPrice: 72.00,
    subUnitPrice: 8.00,
    costPrice: 54.00,
    commissionPct: 3.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_cat_50', batchNo: 'NOV-092', expiryDate: '2027-09-10', qtyBase: 35 }]
  },

  // ── 2. نزلات البرد والإنفلونزا ──
  {
    id: 'fast-congestal',
    barcode: '6221008002018',
    barcodes: ['6221008002018', 'CONGESTAL'],
    tradeNameAr: 'كونجستال أقراص للبرد',
    tradeNameEn: 'Congestal Cold Tablets',
    genericName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'علاج البرد والإنفلونزا',
    group: 'cold',
    dosageForm: 'أقراص',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 38.00,
    subUnitPrice: 19.00,
    costPrice: 28.50,
    commissionPct: 2.5,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_cong_tab', batchNo: 'SIG-441', expiryDate: '2028-01-30', qtyBase: 55 }]
  },
  {
    id: 'fast-onetwothree',
    barcode: '6221008002025',
    barcodes: ['6221008002025', '123_COLD'],
    tradeNameAr: '1 2 3 أقراص للبرد (وان تو ثري)',
    tradeNameEn: '1, 2, 3 Cold Tablets',
    genericName: 'Paracetamol + Pseudoephedrine + Chlorpheniramine',
    category: 'علاج البرد والإنفلونزا',
    group: 'cold',
    dosageForm: 'أقراص',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 33.00,
    subUnitPrice: 16.50,
    costPrice: 25.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_123_tab', batchNo: 'HKM-221', expiryDate: '2027-10-15', qtyBase: 42 }]
  },
  {
    id: 'fast-c-retard',
    barcode: '6221008002032',
    barcodes: ['6221008002032', 'CRETARD500'],
    tradeNameAr: 'سي ريتارد 500 مجم كبسول',
    tradeNameEn: 'C-Retard 500mg Capsules',
    genericName: 'Vitamin C (Ascorbic Acid 500mg)',
    category: 'فيتامينات ومناعة',
    group: 'cold',
    dosageForm: 'كبسولات ممتدة المفعول',
    packSize: 1,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 28.00,
    subUnitPrice: 28.00,
    costPrice: 21.00,
    commissionPct: 3.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_cret_500', batchNo: 'HKM-902', expiryDate: '2028-04-10', qtyBase: 30 }]
  },
  {
    id: 'fast-otrivin-adult',
    barcode: '6221008002049',
    barcodes: ['6221008002049', 'OTRIVIN_ADULT'],
    tradeNameAr: 'أوتريفين بخاخ أنف كبار',
    tradeNameEn: 'Otrivin 0.1% Adult Nasal Spray',
    genericName: 'Xylometazoline HCl 0.1%',
    category: 'احتقان الأنف',
    group: 'cold',
    dosageForm: 'بخاخ أنف',
    packSize: 1,
    baseUnit: 'علبة',
    subUnit: 'علبة',
    piecesPerSubUnit: 1,
    publicPrice: 25.00,
    subUnitPrice: 25.00,
    costPrice: 19.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_otri_ad', batchNo: 'GSK-661', expiryDate: '2027-12-01', qtyBase: 25 }]
  },
  {
    id: 'fast-strepsils-honey',
    barcode: '6221008002056',
    barcodes: ['6221008002056', 'STREPSILS_HONEY'],
    tradeNameAr: 'ستربسيلز عسل وليمون استحلاب',
    tradeNameEn: 'Strepsils Honey & Lemon Lozenges',
    genericName: 'Dichlorobenzyl Alcohol + Amylmetacresol',
    category: 'التهاب الحلق',
    group: 'cold',
    dosageForm: 'أقراص استحلاب',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 8,
    publicPrice: 145.00,
    subUnitPrice: 72.50,
    costPrice: 110.00,
    commissionPct: 3.5,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_str_hon', batchNo: 'REC-332', expiryDate: '2028-05-18', qtyBase: 20 }]
  },

  // ── 3. مستلزمات طبية وإسعافات أولية ──
  {
    id: 'fast-syringes-3ml',
    barcode: '6221009001018',
    barcodes: ['6221009001018', 'SYRINGE3ML'],
    tradeNameAr: 'سرنجة 3 سم معقمة سن ناعم',
    tradeNameEn: 'Sterile Syringe 3ml',
    genericName: 'Medical Syringe 3ml',
    category: 'مستلزمات طبية',
    group: 'supplies',
    dosageForm: 'قطعة',
    packSize: 1,
    baseUnit: 'قطعة',
    subUnit: 'قطعة',
    piecesPerSubUnit: 1,
    publicPrice: 4.50,
    subUnitPrice: 4.50,
    costPrice: 2.80,
    commissionPct: 1.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_syr_3', batchNo: 'MED-331', expiryDate: '2029-12-31', qtyBase: 300 }]
  },
  {
    id: 'fast-syringes-5ml',
    barcode: '6221009001025',
    barcodes: ['6221009001025', 'SYRINGE5ML'],
    tradeNameAr: 'سرنجة 5 سم معقمة سن أزرق',
    tradeNameEn: 'Sterile Syringe 5ml',
    genericName: 'Medical Syringe 5ml',
    category: 'مستلزمات طبية',
    group: 'supplies',
    dosageForm: 'قطعة',
    packSize: 1,
    baseUnit: 'قطعة',
    subUnit: 'قطعة',
    piecesPerSubUnit: 1,
    publicPrice: 5.00,
    subUnitPrice: 5.00,
    costPrice: 3.10,
    commissionPct: 1.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_syr_5', batchNo: 'MED-551', expiryDate: '2029-12-31', qtyBase: 250 }]
  },
  {
    id: 'fast-alcohol-70',
    barcode: '6221009001032',
    barcodes: ['6221009001032', 'ALCOHOL70'],
    tradeNameAr: 'كحول إيثيلي 70% بخاخ 250 مل',
    tradeNameEn: 'Ethyl Alcohol 70% Spray 250ml',
    genericName: 'Ethanol 70%',
    category: 'مطهرات ومستلزمات',
    group: 'supplies',
    dosageForm: 'زجاجة بخاخ',
    packSize: 1,
    baseUnit: 'زجاجة',
    subUnit: 'زجاجة',
    piecesPerSubUnit: 1,
    publicPrice: 35.00,
    subUnitPrice: 35.00,
    costPrice: 22.00,
    commissionPct: 4.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_alc_70', batchNo: 'ALC-771', expiryDate: '2029-06-30', qtyBase: 80 }]
  },
  {
    id: 'fast-cotton-100',
    barcode: '6221009001049',
    barcodes: ['6221009001049', 'COTTON100G'],
    tradeNameAr: 'قطن طبي معقم 100 جم',
    tradeNameEn: 'Medical Absorbent Cotton 100g',
    genericName: 'Absorbent Cotton Wool',
    category: 'مطهرات ومستلزمات',
    group: 'supplies',
    dosageForm: 'كيس',
    packSize: 1,
    baseUnit: 'كيس',
    subUnit: 'كيس',
    piecesPerSubUnit: 1,
    publicPrice: 22.00,
    subUnitPrice: 22.00,
    costPrice: 15.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_cot_100', batchNo: 'COT-101', expiryDate: '2030-01-01', qtyBase: 45 }]
  },
  {
    id: 'fast-gauze-sterile',
    barcode: '6221009001056',
    barcodes: ['6221009001056', 'GAUZE10X10'],
    tradeNameAr: 'شاش طبي معقم 10×10 سم (5 قطع)',
    tradeNameEn: 'Sterile Gauze Swabs 10x10',
    genericName: 'Sterile Gauze Pad',
    category: 'مطهرات ومستلزمات',
    group: 'supplies',
    dosageForm: 'باكت',
    packSize: 1,
    baseUnit: 'باكت',
    subUnit: 'باكت',
    piecesPerSubUnit: 1,
    publicPrice: 18.00,
    subUnitPrice: 18.00,
    costPrice: 11.50,
    commissionPct: 2.5,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_gauze', batchNo: 'GAU-882', expiryDate: '2029-09-30', qtyBase: 60 }]
  },

  // ── 4. جهاز هضمي وأطفال ──
  {
    id: 'fast-antinal',
    barcode: '6221008003015',
    barcodes: ['6221008003015', 'ANTINAL200'],
    tradeNameAr: 'أنتينال 200 مجم كبسول',
    tradeNameEn: 'Antinal 200mg Capsules',
    genericName: 'Nifuroxazide 200mg',
    category: 'مطهر معوي ومضاد إسهال',
    group: 'digestive',
    dosageForm: 'كبسولات',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 12,
    publicPrice: 38.00,
    subUnitPrice: 19.00,
    costPrice: 28.50,
    commissionPct: 2.5,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_ant_cap', batchNo: 'AMN-449', expiryDate: '2028-02-28', qtyBase: 45 }]
  },
  {
    id: 'fast-flagyl-500',
    barcode: '6221008003022',
    barcodes: ['6221008003022', 'FLAGYL500'],
    tradeNameAr: 'فلاجيل 500 مجم أقراص',
    tradeNameEn: 'Flagyl 500mg Tablets',
    genericName: 'Metronidazole 500mg',
    category: 'مطهر معوي وطفيليات',
    group: 'digestive',
    dosageForm: 'أقراص مغلفة',
    packSize: 2,
    baseUnit: 'علبة',
    subUnit: 'شريط',
    piecesPerSubUnit: 10,
    publicPrice: 35.00,
    subUnitPrice: 17.50,
    costPrice: 26.00,
    commissionPct: 2.0,
    isTableDrug: false,
    isChronic: false,
    batches: [{ id: 'b_flg_500', batchNo: 'SNF-112', expiryDate: '2027-12-15', qtyBase: 35 }]
  }
];
