/**
 * eda-drugeye-catalog.js
 * قاعدة بيانات ومحرك البحث الدوائي المصري المعتمد (EDA & Drug Eye Catalog Engine)
 * يتضمن:
 * 1. كتالوج شامل لأشهر الأدوية المصرية المتداولة مع الأسعار الرسمية وأحجام العلب وعدد الشرائط.
 * 2. خوارزمية تطبيع نصي متقدمة للغة العربية والإنجليزية (Phonetic Arabic & Fuzzy Match).
 * 3. حاسبة الأسعار التلقائية (علبة / شريط / أمبول / كيس فوار).
 * 4. محرك استرجاع المثائل والبدائل (Generic Equivalents & Substitutes).
 * 5. دعم المزامنة الدورية وقوائم التسعير الجبري الصادرة عن هيئة الدواء المصرية.
 */

// ── 1. خوارزمية تطبيع النصوص للبحث الذكي ─────────────────────────────────────
export function normalizeDrugSearchText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    // إزالة علامات التشكيل العربية
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // تطبيع الألف بأنواعها
    .replace(/[أإآٱ]/g, 'ا')
    // تطبيع الياء والألف اللينة
    .replace(/[ىي]/g, 'ي')
    // تطبيع التاء المربوطة والهاء
    .replace(/[ة]/g, 'ه')
    // إزالة المسافات الزائدة والرموز الخاصة
    .replace(/[-_./\\(),+]/g, ' ')
    .replace(/\s+/g, ' ');
}

// ── 2. قاعدة بيانات الأدوية المصرية المبدئية (EDA & Drug Eye Seed Dataset) ────
export const SEED_EDA_DRUG_EYE_MEDICATIONS = [
  // ── المضادات الحيوية (Antibiotics) ──
  {
    eda_reg_no: 'EDA-ANT-001',
    trade_name_en: 'Augmentin 1g Tablets',
    trade_name_ar: 'أوجمنتين 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2, // 2 شريط (14 قرص)
    unit_name: 'شريط',
    public_price: 130.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001011'
  },
  {
    eda_reg_no: 'EDA-ANT-002',
    trade_name_en: 'Augmentin 625mg Tablets',
    trade_name_ar: 'أوجمنتين 625 مجم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '625 mg',
    pack_size: 2, // 2 شريط (10 أقراص)
    unit_name: 'شريط',
    public_price: 95.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001028'
  },
  {
    eda_reg_no: 'EDA-ANT-003',
    trade_name_en: 'Augmentin 457mg Suspension',
    trade_name_ar: 'أوجمنتين 457 مجم معلق للشرب',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'معلق للشرب',
    strength: '457 mg / 5ml',
    pack_size: 1, // زجاجة غير قابلة للتجزئة
    unit_name: 'زجاجة',
    public_price: 75.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    category: 'مضاد حيوي واسع المجال للأطفال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001035'
  },
  {
    eda_reg_no: 'EDA-ANT-004',
    trade_name_en: 'Curam 1g Tablets',
    trade_name_ar: 'كيورام 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2, // 2 شريط
    unit_name: 'شريط',
    public_price: 115.00,
    manufacturer: 'Sandoz',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001042'
  },
  {
    eda_reg_no: 'EDA-ANT-005',
    trade_name_en: 'Curam 625mg Tablets',
    trade_name_ar: 'كيورام 625 مجم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '625 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 90.00,
    manufacturer: 'Sandoz',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001059'
  },
  {
    eda_reg_no: 'EDA-ANT-006',
    trade_name_en: 'Megamox 1g Tablets',
    trade_name_ar: 'ميجاموكس 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 105.00,
    manufacturer: 'Hikma Pharma',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001066'
  },
  {
    eda_reg_no: 'EDA-ANT-007',
    trade_name_en: 'Hibiotic 1g Tablets',
    trade_name_ar: 'هاي بيوتك 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2, // 16 قرص (2 شريط)
    unit_name: 'شريط',
    public_price: 100.00,
    manufacturer: 'Amoun Pharmaceuticals',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001073'
  },
  {
    eda_reg_no: 'EDA-ANT-008',
    trade_name_en: 'E-Moxclav 1g Tablets',
    trade_name_ar: 'إي-موكسكلاف 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 98.00,
    manufacturer: 'EIPICO',
    category: 'مضاد حيوي واسع المجال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001080'
  },
  {
    eda_reg_no: 'EDA-ANT-009',
    trade_name_en: 'Zithromax 500mg Capsules',
    trade_name_ar: 'زيثروماكس 500 مجم كبسولات',
    generic_name: 'Azithromycin',
    dosage_form: 'كبسولات',
    strength: '500 mg',
    pack_size: 1, // شريط واحد 3 كبسولات
    unit_name: 'شريط',
    public_price: 85.00,
    manufacturer: 'Pfizer',
    category: 'مضاد حيوي ماكروليد',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001097'
  },
  {
    eda_reg_no: 'EDA-ANT-010',
    trade_name_en: 'Xithrone 500mg Tablets',
    trade_name_ar: 'زيثرون 500 مجم أقراص',
    generic_name: 'Azithromycin',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 1, // شريط واحد 3 أقراص
    unit_name: 'شريط',
    public_price: 45.00,
    manufacturer: 'Amoun',
    category: 'مضاد حيوي ماكروليد',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001103'
  },
  {
    eda_reg_no: 'EDA-ANT-011',
    trade_name_en: 'Ciprofar 500mg Tablets',
    trade_name_ar: 'سيبروفار 500 مجم أقراص',
    generic_name: 'Ciprofloxacin',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 1, // 10 أقراص في شريط
    unit_name: 'شريط',
    public_price: 42.00,
    manufacturer: 'Pharco',
    category: 'مضاد حيوي فلوروكينولون',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001110'
  },
  {
    eda_reg_no: 'EDA-ANT-012',
    trade_name_en: 'Cefaxone 1g IV/IM Vial',
    trade_name_ar: 'سيفاكسون 1 جم حقن',
    generic_name: 'Ceftriaxone',
    dosage_form: 'حقن (فيال + مذيب)',
    strength: '1000 mg',
    pack_size: 1,
    unit_name: 'حقنة',
    public_price: 45.00,
    manufacturer: 'Novartis',
    category: 'مضاد حيوي سيفالوسبورين',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001127'
  },
  {
    eda_reg_no: 'EDA-ANT-013',
    trade_name_en: 'Cefotax 1g Vial',
    trade_name_ar: 'سيفوتاكس 1 جم حقن',
    generic_name: 'Cefotaxime',
    dosage_form: 'حقن (فيال + مذيب)',
    strength: '1000 mg',
    pack_size: 1,
    unit_name: 'حقنة',
    public_price: 35.00,
    manufacturer: 'EIPICO',
    category: 'مضاد حيوي سيفالوسبورين',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001134'
  },
  {
    eda_reg_no: 'EDA-ANT-014',
    trade_name_en: 'Flagyl 500mg Tablets',
    trade_name_ar: 'فلاجيل 500 مجم أقراص',
    generic_name: 'Metronidazole',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2, // 2 شريط (20 قرص)
    unit_name: 'شريط',
    public_price: 30.00,
    manufacturer: 'Sanofi',
    category: 'مضاد للطفيليات والبكتيريا اللاهوائية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001141'
  },
  {
    eda_reg_no: 'EDA-ANT-015',
    trade_name_en: 'Antinal 200mg Capsules',
    trade_name_ar: 'أنتينال 200 مجم كبسولات',
    generic_name: 'Nifuroxazide',
    dosage_form: 'كبسولات',
    strength: '200 mg',
    pack_size: 2, // 24 كبسولة (2 شريط)
    unit_name: 'شريط',
    public_price: 42.00,
    manufacturer: 'Amoun',
    category: 'مطهر معوي ومضاد للإسهال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001158'
  },
  {
    eda_reg_no: 'EDA-ANT-016',
    trade_name_en: 'Drotazide Capsules',
    trade_name_ar: 'دروتازيد كبسولات',
    generic_name: 'Nifuroxazide + Drotaverine',
    dosage_form: 'كبسولات',
    strength: '200 mg / 40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 35.00,
    manufacturer: 'SEDICO',
    category: 'مطهر معوي ومسكن للمغص',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221001001165'
  },

  // ── المسكنات وخافضات الحرارة (Analgesics & NSAIDs) ──
  {
    eda_reg_no: 'EDA-ANAL-001',
    trade_name_en: 'Panadol Advance 500mg',
    trade_name_ar: 'بنادول أدفانس أزرق 500 مجم',
    generic_name: 'Paracetamol',
    dosage_form: 'أقراص سريعة المفعول',
    strength: '500 mg',
    pack_size: 2, // 24 قرص (2 شريط × 12)
    unit_name: 'شريط',
    public_price: 45.00,
    manufacturer: 'Haleon / GSK',
    category: 'مسكن وخافض للحرارة آمن',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001010'
  },
  {
    eda_reg_no: 'EDA-ANAL-002',
    trade_name_en: 'Panadol Extra',
    trade_name_ar: 'بنادول إكسترا أحمر',
    generic_name: 'Paracetamol + Caffeine',
    dosage_form: 'أقراص',
    strength: '500 mg / 65 mg',
    pack_size: 2, // 24 قرص (2 شريط)
    unit_name: 'شريط',
    public_price: 55.00,
    manufacturer: 'Haleon / GSK',
    category: 'مسكن قوي للصداع والآلام',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001027'
  },
  {
    eda_reg_no: 'EDA-ANAL-003',
    trade_name_en: 'Panadol Cold & Flu All in One',
    trade_name_ar: 'بنادول كولد أند فلو البرتقالي',
    generic_name: 'Paracetamol + Phenylephrine + Guaifenesin',
    dosage_form: 'أقراص',
    strength: '500 mg / 6.1 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 60.00,
    manufacturer: 'Haleon / GSK',
    category: 'علاج نزلات البرد والاحتقان',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001034'
  },
  {
    eda_reg_no: 'EDA-ANAL-004',
    trade_name_en: 'Panadol Joint 665mg',
    trade_name_ar: 'بنادول جوينت للمفاصل 665 مجم',
    generic_name: 'Paracetamol Extended Release',
    dosage_form: 'أقراص ممتدة المفعول',
    strength: '665 mg',
    pack_size: 3, // 18 قرص (3 شرائط × 6)
    unit_name: 'شريط',
    public_price: 75.00,
    manufacturer: 'Haleon / GSK',
    category: 'مسكن ممتد لآلام المفاصل',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001041'
  },
  {
    eda_reg_no: 'EDA-ANAL-005',
    trade_name_en: 'Cetal 500mg Tablets',
    trade_name_ar: 'سيتال 500 مجم أقراص',
    generic_name: 'Paracetamol',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2, // 20 قرص (2 شريط)
    unit_name: 'شريط',
    public_price: 22.00,
    manufacturer: 'EIPICO',
    category: 'مسكن وخافض للحرارة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001058'
  },
  {
    eda_reg_no: 'EDA-ANAL-006',
    trade_name_en: 'Cetal Syrup 120ml',
    trade_name_ar: 'سيتال شراب خافض حرارة للأطفال',
    generic_name: 'Paracetamol',
    dosage_form: 'شراب',
    strength: '250 mg / 5ml',
    pack_size: 1,
    unit_name: 'زجاجة',
    public_price: 18.00,
    manufacturer: 'EIPICO',
    category: 'خافض حرارة للأطفال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001065'
  },
  {
    eda_reg_no: 'EDA-ANAL-007',
    trade_name_en: 'Cataflam 50mg Tablets',
    trade_name_ar: 'كتافلام 50 مجم أقراص',
    generic_name: 'Diclofenac Potassium',
    dosage_form: 'أقراص سريعة الامتصاص',
    strength: '50 mg',
    pack_size: 2, // 20 قرص (2 شريط × 10)
    unit_name: 'شريط',
    public_price: 58.00,
    manufacturer: 'Novartis',
    category: 'مضاد للالتهاب ومسكن قوي وسريع',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001072'
  },
  {
    eda_reg_no: 'EDA-ANAL-008',
    trade_name_en: 'Voltaren 100mg SR Tablets',
    trade_name_ar: 'فولتارين 100 مجم أقراص ممتدة المفعول',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أقراص ممتدة المفعول',
    strength: '100 mg',
    pack_size: 2, // 20 قرص (2 شريط × 10)
    unit_name: 'شريط',
    public_price: 75.00,
    manufacturer: 'Novartis',
    category: 'مضاد للالتهاب ومسكن للعظام والروماتيزم',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001089'
  },
  {
    eda_reg_no: 'EDA-ANAL-009',
    trade_name_en: 'Voltaren 75mg/3ml Ampoules',
    trade_name_ar: 'فولتارين 75 مجم حقن عضل',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أمبولات حقن',
    strength: '75 mg / 3ml',
    pack_size: 6, // علبة بها 6 أمبولات
    unit_name: 'أمبول',
    public_price: 60.00,
    manufacturer: 'Novartis',
    category: 'مسكن فوري قوي للحقن',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001096'
  },
  {
    eda_reg_no: 'EDA-ANAL-010',
    trade_name_en: 'Brufen 400mg Tablets',
    trade_name_ar: 'بروفين 400 مجم أقراص',
    generic_name: 'Ibuprofen',
    dosage_form: 'أقراص مغلفة',
    strength: '400 mg',
    pack_size: 3, // 30 قرص (3 شرائط × 10)
    unit_name: 'شريط',
    public_price: 48.00,
    manufacturer: 'Abbott',
    category: 'مسكن للآلام وخافض للحرارة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001102'
  },
  {
    eda_reg_no: 'EDA-ANAL-011',
    trade_name_en: 'Brufen 600mg Tablets',
    trade_name_ar: 'بروفين 600 مجم أقراص',
    generic_name: 'Ibuprofen',
    dosage_form: 'أقراص مغلفة',
    strength: '600 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 58.00,
    manufacturer: 'Abbott',
    category: 'مسكن قوي لآلام الأسنان والعظام',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001119'
  },
  {
    eda_reg_no: 'EDA-ANAL-012',
    trade_name_en: 'Ketofan 50mg Capsules',
    trade_name_ar: 'كيتوفان 50 مجم كبسولات',
    generic_name: 'Ketoprofen',
    dosage_form: 'كبسولات',
    strength: '50 mg',
    pack_size: 2, // 20 كبسولة (2 شريط)
    unit_name: 'شريط',
    public_price: 35.00,
    manufacturer: 'Amoun',
    category: 'مسكن ومضاد للالتهاب',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001126'
  },
  {
    eda_reg_no: 'EDA-ANAL-013',
    trade_name_en: 'Ketolac Ampoules',
    trade_name_ar: 'كيتولاك حقن مسكنة للآلام الشديدة',
    generic_name: 'Ketorolac Tromethamine',
    dosage_form: 'أمبولات حقن',
    strength: '30 mg / 2ml',
    pack_size: 5, // 5 أمبولات
    unit_name: 'أمبول',
    public_price: 45.00,
    manufacturer: 'Amoun',
    category: 'مسكن قوي لآلام المغص والعمليات',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221002001133'
  },

  // ── أدوية الضغط والقلب والسيولة (Cardiovascular & Anticoagulants) ──
  {
    eda_reg_no: 'EDA-CARD-001',
    trade_name_en: 'Concor 5mg Tablets',
    trade_name_ar: 'كونكور 5 مجم أقراص',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص مغلفة',
    strength: '5 mg',
    pack_size: 3, // 30 قرص (3 شرائط × 10)
    unit_name: 'شريط',
    public_price: 75.00,
    manufacturer: 'Merck Healthcare',
    category: 'علاج ضغط الدم وتنظيم ضربات القلب',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001019'
  },
  {
    eda_reg_no: 'EDA-CARD-002',
    trade_name_en: 'Concor 2.5mg Tablets',
    trade_name_ar: 'كونكور 2.5 مجم أقراص (كور)',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص مغلفة',
    strength: '2.5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 60.00,
    manufacturer: 'Merck Healthcare',
    category: 'علاج قصور عضلة القلب وضغط الدم',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001026'
  },
  {
    eda_reg_no: 'EDA-CARD-003',
    trade_name_en: 'Concor 10mg Tablets',
    trade_name_ar: 'كونكور 10 مجم أقراص',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص مغلفة',
    strength: '10 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 95.00,
    manufacturer: 'Merck Healthcare',
    category: 'علاج ارتفاع ضغط الدم',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001033'
  },
  {
    eda_reg_no: 'EDA-CARD-004',
    trade_name_en: 'Concor Plus 5/12.5mg',
    trade_name_ar: 'كونكور بلس 5/12.5 مجم أقراص',
    generic_name: 'Bisoprolol + Hydrochlorothiazide',
    dosage_form: 'أقراص',
    strength: '5 mg / 12.5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 85.00,
    manufacturer: 'Merck Healthcare',
    category: 'مخفض ضغط الدم مع مدر للبول',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001040'
  },
  {
    eda_reg_no: 'EDA-CARD-005',
    trade_name_en: 'Bisocard 5mg Tablets',
    trade_name_ar: 'بيسوكارد 5 مجم أقراص',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص',
    strength: '5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 45.00,
    manufacturer: 'Global Napi',
    category: 'بديل كونكور لضغط الدم والقلب',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001057'
  },
  {
    eda_reg_no: 'EDA-CARD-006',
    trade_name_en: 'Norvasc 5mg Tablets',
    trade_name_ar: 'نورفاسك 5 مجم أقراص',
    generic_name: 'Amlodipine',
    dosage_form: 'أقراص',
    strength: '5 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 110.00,
    manufacturer: 'Pfizer',
    category: 'علاج ارتفاع ضغط الدم والذبحة الصدرية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001064'
  },
  {
    eda_reg_no: 'EDA-CARD-007',
    trade_name_en: 'Exforge 5/160mg Tablets',
    trade_name_ar: 'إكسفوردج 5/160 مجم أقراص',
    generic_name: 'Amlodipine + Valsartan',
    dosage_form: 'أقراص مغلفة',
    strength: '5 mg / 160 mg',
    pack_size: 2, // 28 قرص (شريطين × 14)
    unit_name: 'شريط',
    public_price: 210.00,
    manufacturer: 'Novartis',
    category: 'علاج مركب لضغط الدم المرتفع',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001071'
  },
  {
    eda_reg_no: 'EDA-CARD-008',
    trade_name_en: 'Ator 20mg Tablets',
    trade_name_ar: 'أتور 20 مجم أقراص كوليسترول',
    generic_name: 'Atorvastatin',
    dosage_form: 'أقراص مغلفة',
    strength: '20 mg',
    pack_size: 3, // 21 قرص (3 شرائط × 7)
    unit_name: 'شريط',
    public_price: 65.00,
    manufacturer: 'EIPICO',
    category: 'تخفيض الكوليسترول والدهون الثلاثية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001088'
  },
  {
    eda_reg_no: 'EDA-CARD-009',
    trade_name_en: 'Lipitor 20mg Tablets',
    trade_name_ar: 'ليبيتور 20 مجم أقراص كوليسترول',
    generic_name: 'Atorvastatin',
    dosage_form: 'أقراص مغلفة',
    strength: '20 mg',
    pack_size: 4, // 28 قرص (4 شرائط × 7)
    unit_name: 'شريط',
    public_price: 185.00,
    manufacturer: 'Pfizer',
    category: 'تخفيض الكوليسترول والوقاية من الجلطات',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001095'
  },
  {
    eda_reg_no: 'EDA-CARD-010',
    trade_name_en: 'Crestor 10mg Tablets',
    trade_name_ar: 'كريستور 10 مجم أقراص كوليسترول',
    generic_name: 'Rosuvastatin',
    dosage_form: 'أقراص مغلفة',
    strength: '10 mg',
    pack_size: 2, // 28 قرص (شريطين × 14)
    unit_name: 'شريط',
    public_price: 195.00,
    manufacturer: 'AstraZeneca',
    category: 'مخفض كوليسترول قوي وفعال',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001101'
  },
  {
    eda_reg_no: 'EDA-CARD-011',
    trade_name_en: 'Aspocid 75mg Chewable',
    trade_name_ar: 'أسبوسيد أطفال 75 مجم للمضغ',
    generic_name: 'Acetylsalicylic Acid (Aspirin)',
    dosage_form: 'أقراص للمضغ',
    strength: '75 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 18.00,
    manufacturer: 'CID',
    category: 'سيولة الدم والوقاية من الجلطات',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001118'
  },
  {
    eda_reg_no: 'EDA-CARD-012',
    trade_name_en: 'Plavix 75mg Tablets',
    trade_name_ar: 'بلافيكس 75 مجم أقراص سيولة',
    generic_name: 'Clopidogrel',
    dosage_form: 'أقراص مغلفة',
    strength: '75 mg',
    pack_size: 2, // 28 قرص (شريطين)
    unit_name: 'شريط',
    public_price: 240.00,
    manufacturer: 'Sanofi',
    category: 'مانع لتجلط الصفائح الدموية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001125'
  },
  {
    eda_reg_no: 'EDA-CARD-013',
    trade_name_en: 'Clexane 40mg (0.4ml) Syringes',
    trade_name_ar: 'كليكسان 40 مجم حقن تحت الجلد',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '40 mg / 0.4 ml',
    pack_size: 2, // علبة بها سرنجتان جاهزتان
    unit_name: 'سرنجة',
    public_price: 145.00,
    manufacturer: 'Sanofi',
    category: 'هيبارين منخفض الوزن الجزيئي للسيولة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001132'
  },
  {
    eda_reg_no: 'EDA-CARD-014',
    trade_name_en: 'Clexane 60mg (0.6ml) Syringes',
    trade_name_ar: 'كليكسان 60 مجم حقن تحت الجلد',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '60 mg / 0.6 ml',
    pack_size: 2,
    unit_name: 'سرنجة',
    public_price: 195.00,
    manufacturer: 'Sanofi',
    category: 'سيولة عالية للحوامل وحالات التجلط',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221003001149'
  },

  // ── أدوية السكري (Diabetes) ──
  {
    eda_reg_no: 'EDA-DIAB-001',
    trade_name_en: 'Glucophage 1000mg Tablets',
    trade_name_ar: 'جلوكوفاج 1000 مجم أقراص',
    generic_name: 'Metformin Hydrochloride',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 65.00,
    manufacturer: 'Merck Healthcare',
    category: 'منظم السكر بالدم وضبط حساسية الإنسولين',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001018'
  },
  {
    eda_reg_no: 'EDA-DIAB-002',
    trade_name_en: 'Glucophage 500mg Tablets',
    trade_name_ar: 'جلوكوفاج 500 مجم أقراص',
    generic_name: 'Metformin Hydrochloride',
    dosage_form: 'أقراص مغلفة',
    strength: '500 mg',
    pack_size: 5, // 50 قرص (5 شرائط × 10)
    unit_name: 'شريط',
    public_price: 45.00,
    manufacturer: 'Merck Healthcare',
    category: 'منظم السكر وتكيس المبايض',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001025'
  },
  {
    eda_reg_no: 'EDA-DIAB-003',
    trade_name_en: 'Amaryl 2mg Tablets',
    trade_name_ar: 'أماريل 2 مجم أقراص سكر',
    generic_name: 'Glimepiride',
    dosage_form: 'أقراص',
    strength: '2 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 65.00,
    manufacturer: 'Sanofi',
    category: 'محفز إفراز الإنسولين لمرضى السكري',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001032'
  },
  {
    eda_reg_no: 'EDA-DIAB-004',
    trade_name_en: 'Amaryl 3mg Tablets',
    trade_name_ar: 'أماريل 3 مجم أقراص سكر',
    generic_name: 'Glimepiride',
    dosage_form: 'أقراص',
    strength: '3 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 75.00,
    manufacturer: 'Sanofi',
    category: 'علاج السكري من النوع الثاني',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001049'
  },
  {
    eda_reg_no: 'EDA-DIAB-005',
    trade_name_en: 'Janumet 50/1000mg Tablets',
    trade_name_ar: 'جانوميت 50/1000 مجم أقراص',
    generic_name: 'Sitagliptin + Metformin',
    dosage_form: 'أقراص مغلفة',
    strength: '50 mg / 1000 mg',
    pack_size: 4, // 56 قرص (4 شرائط × 14)
    unit_name: 'شريط',
    public_price: 340.00,
    manufacturer: 'MSD (Merck Sharp & Dohme)',
    category: 'علاج سكر حديث ثنائي الفعالية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001056'
  },
  {
    eda_reg_no: 'EDA-DIAB-006',
    trade_name_en: 'Jardiance 10mg Tablets',
    trade_name_ar: 'جارديانس 10 مجم أقراص سكر وحماية القلب',
    generic_name: 'Empagliflozin',
    dosage_form: 'أقراص مغلفة',
    strength: '10 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 450.00,
    manufacturer: 'Boehringer Ingelheim',
    category: 'مدر للسكر عبر الكلى وحامي للقلب والكلى',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221004001063'
  },
  {
    eda_reg_no: 'EDA-DIAB-007',
    trade_name_en: 'Lantus SoloStar 100 IU/ml Pens',
    trade_name_ar: 'لانتوس سولوستار أقلام إنسولين طويل المفعول',
    generic_name: 'Insulin Glargine',
    dosage_form: 'أقلام إنسولين جاهزة',
    strength: '100 IU / ml',
    pack_size: 5, // 5 أقلام بالعلبة
    unit_name: 'قلم',
    public_price: 720.00,
    manufacturer: 'Sanofi',
    category: 'إنسولين قاعدي ممتد المفعول 24 ساعة',
    is_table_drug: false,
    is_refrigerated: true,
    gtin_barcode: '6221004001070'
  },

  // ── أدوية الجهاز الهضمي والمعدة (Gastrointestinal & Ulcer) ──
  {
    eda_reg_no: 'EDA-GIT-001',
    trade_name_en: 'Nexium 40mg Tablets',
    trade_name_ar: 'نيكسيوم 40 مجم أقراص حموضة',
    generic_name: 'Esomeprazole',
    dosage_form: 'أقراص مقاومة لإفراز حمض المعدة',
    strength: '40 mg',
    pack_size: 2, // 14 قرص (شريطين × 7)
    unit_name: 'شريط',
    public_price: 160.00,
    manufacturer: 'AstraZeneca',
    category: 'مثبط مضخة البروتون لقرحة المعدة والارتجاع',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001017'
  },
  {
    eda_reg_no: 'EDA-GIT-002',
    trade_name_en: 'Nexium 20mg Tablets',
    trade_name_ar: 'نيكسيوم 20 مجم أقراص حموضة',
    generic_name: 'Esomeprazole',
    dosage_form: 'أقراص',
    strength: '20 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 115.00,
    manufacturer: 'AstraZeneca',
    category: 'علاج ارتجاع المريء والوقاية من القرحة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001024'
  },
  {
    eda_reg_no: 'EDA-GIT-003',
    trade_name_en: 'Controloc 40mg Tablets',
    trade_name_ar: 'كونترولوك 40 مجم أقراص',
    generic_name: 'Pantoprazole',
    dosage_form: 'أقراص مغلفة معوياً',
    strength: '40 mg',
    pack_size: 2, // 14 قرص (شريطين × 7)
    unit_name: 'شريط',
    public_price: 110.00,
    manufacturer: 'Takeda',
    category: 'علاج التهابات وقرح المعدة والمريء',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001031'
  },
  {
    eda_reg_no: 'EDA-GIT-004',
    trade_name_en: 'Zurcal 40mg Tablets',
    trade_name_ar: 'زوركال 40 مجم أقراص معدة',
    generic_name: 'Pantoprazole',
    dosage_form: 'أقراص معوية',
    strength: '40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 68.00,
    manufacturer: 'Multi-Apex',
    category: 'بديل اقتصادي فعال لكونترولوك',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001048'
  },
  {
    eda_reg_no: 'EDA-GIT-005',
    trade_name_en: 'Antodine 40mg Tablets',
    trade_name_ar: 'أنتودين 40 مجم أقراص',
    generic_name: 'Famotidine',
    dosage_form: 'أقراص مغلفة',
    strength: '40 mg',
    pack_size: 3, // 30 قرص (3 شرائط × 10)
    unit_name: 'شريط',
    public_price: 65.00,
    manufacturer: 'Amoun',
    category: 'مضاد لمستقبلات الهيستامين H2 للحموضة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001055'
  },
  {
    eda_reg_no: 'EDA-GIT-006',
    trade_name_en: 'Spasmo-Digestin Tablets',
    trade_name_ar: 'سبازمو ديجستين أقراص هضم وتقلصات',
    generic_name: 'Papain + Sanzyme + Dicyclomine + Simethicone',
    dosage_form: 'أقراص مغلفة',
    strength: 'مركب هاضم ومضاد للتقلصات',
    pack_size: 3, // 30 قرص (3 شرائط × 10)
    unit_name: 'شريط',
    public_price: 45.00,
    manufacturer: 'Pharco',
    category: 'مهضم وملين للغازات والانتفاخ',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001062'
  },
  {
    eda_reg_no: 'EDA-GIT-007',
    trade_name_en: 'Duspatalin Retard 200mg',
    trade_name_ar: 'دسباتالين ريتارد 200 مجم كبسول للقولون',
    generic_name: 'Mebeverine Hydrochloride',
    dosage_form: 'كبسولات ممتدة المفعول',
    strength: '200 mg',
    pack_size: 3, // 30 كبسولة (3 شرائط)
    unit_name: 'شريط',
    public_price: 95.00,
    manufacturer: 'Abbott',
    category: 'مهدئ ومضاد لتشنجات القولون العصبي',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001079'
  },
  {
    eda_reg_no: 'EDA-GIT-008',
    trade_name_en: 'Coloverin A Tablets',
    trade_name_ar: 'كولوفيرين أ أقراص للقولون العصبي التوتري',
    generic_name: 'Mebeverine + Chlordiazepoxide',
    dosage_form: 'أقراص مغلفة',
    strength: '135 mg / 5 mg',
    pack_size: 3, // 30 قرص (3 شرائط)
    unit_name: 'شريط',
    public_price: 55.00,
    manufacturer: 'Chemipharm',
    category: 'علاج تقلصات القولون العصبي المصحوبة بالقلق',
    is_table_drug: true, // صنف جدول ومؤثرات عقلية لاحتوائه على كلورديازيبوكسيد
    is_refrigerated: false,
    gtin_barcode: '6221005001086'
  },
  {
    eda_reg_no: 'EDA-GIT-009',
    trade_name_en: 'Coloverin D Tablets',
    trade_name_ar: 'كولوفيرين د أقراص للقولون والغازات',
    generic_name: 'Mebeverine + Dimethicone',
    dosage_form: 'أقراص مغلفة',
    strength: '135 mg / 40 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 52.00,
    manufacturer: 'Chemipharm',
    category: 'علاج القولون والانتفاخ بدون جدول',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001093'
  },
  {
    eda_reg_no: 'EDA-GIT-010',
    trade_name_en: 'Visceralgine Ampoules',
    trade_name_ar: 'فيسرالجين حقن للمغص الشديد',
    generic_name: 'Tiemonium Methylsulfate',
    dosage_form: 'أمبولات حقن',
    strength: '5 mg / 2ml',
    pack_size: 6, // 6 أمبولات
    unit_name: 'أمبول',
    public_price: 38.00,
    manufacturer: 'SEDICO',
    category: 'مضاد فوري لتقلصات البطن والمغص الكلوي',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221005001109'
  },

  // ── الحساسية والجهاز التنفسي (Allergy & Respiratory) ──
  {
    eda_reg_no: 'EDA-RESP-001',
    trade_name_en: 'Aerius 5mg Tablets',
    trade_name_ar: 'إيريوس 5 مجم أقراص حساسية',
    generic_name: 'Desloratadine',
    dosage_form: 'أقراص مغلفة',
    strength: '5 mg',
    pack_size: 2, // 20 قرص (شريطين)
    unit_name: 'شريط',
    public_price: 85.00,
    manufacturer: 'Bayer',
    category: 'مضاد للحساسية لا يسبب النعاس',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221006001016'
  },
  {
    eda_reg_no: 'EDA-RESP-002',
    trade_name_en: 'Telfast 120mg Tablets',
    trade_name_ar: 'تلفاست 120 مجم أقراص حساسية',
    generic_name: 'Fexofenadine Hydrochloride',
    dosage_form: 'أقراص مغلفة',
    strength: '120 mg',
    pack_size: 2, // 20 قرص (شريطين)
    unit_name: 'شريط',
    public_price: 90.00,
    manufacturer: 'Sanofi',
    category: 'مضاد حساسية الجيوب الأنفية والجلدية',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221006001023'
  },
  {
    eda_reg_no: 'EDA-RESP-003',
    trade_name_en: 'Telfast 180mg Tablets',
    trade_name_ar: 'تلفاست 180 مجم أقراص أرتيكاريا',
    generic_name: 'Fexofenadine Hydrochloride',
    dosage_form: 'أقراص مغلفة',
    strength: '180 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 110.00,
    manufacturer: 'Sanofi',
    category: 'مضاد قوي لحساسية الجلد والأرتيكاريا',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221006001030'
  },
  {
    eda_reg_no: 'EDA-RESP-004',
    trade_name_en: 'Ventolin Inhaler 100mcg',
    trade_name_ar: 'فنتولين بخاخ صدر 100 ميكروجرام',
    generic_name: 'Salbutamol',
    dosage_form: 'بخاخ استنشاق فموي',
    strength: '100 mcg / dose (200 doses)',
    pack_size: 1,
    unit_name: 'بخاخة',
    public_price: 55.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    category: 'موسع للشعب الهوائية لأزمات الربو',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221006001047'
  },
  {
    eda_reg_no: 'EDA-RESP-005',
    trade_name_en: 'Otrivin 0.1% Adult Nasal Drops',
    trade_name_ar: 'أوتريفين نقط أنف للكبار 0.1%',
    generic_name: 'Xylometazoline',
    dosage_form: 'نقط للأنف',
    strength: '0.1%',
    pack_size: 1,
    unit_name: 'زجاجة',
    public_price: 22.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    category: 'مزيل لاحتقان وانسداد الأنف',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221006001054'
  },

  // ── الفيتامينات والمعادن وأدوية الأعصاب (Vitamins & Neurological / Table Drugs) ──
  {
    eda_reg_no: 'EDA-VIT-001',
    trade_name_en: 'Neurovit Tablets',
    trade_name_ar: 'نيوروفيت أقراص للأعصاب والأنيميا',
    generic_name: 'Vitamin B1 + B6 + B12',
    dosage_form: 'أقراص مغلفة',
    strength: 'فيتامين ب المركب المقوي للأعصاب',
    pack_size: 3, // 30 قرص (3 شرائط × 10)
    unit_name: 'شريط',
    public_price: 52.00,
    manufacturer: 'Amoun',
    category: 'مقوي للأعصاب الطرفية لمرضى السكري',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221007001015'
  },
  {
    eda_reg_no: 'EDA-VIT-002',
    trade_name_en: 'Neurobion Ampoules',
    trade_name_ar: 'نيوروبيون حقن أعصاب ب المركب',
    generic_name: 'Vitamin B1 + B6 + B12',
    dosage_form: 'أمبولات حقن عضل',
    strength: 'فيتامين ب عالي التركيز',
    pack_size: 6, // 6 أمبولات
    unit_name: 'أمبول',
    public_price: 48.00,
    manufacturer: 'Merck Healthcare',
    category: 'علاج التهابات الأعصاب الشديدة',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221007001022'
  },
  {
    eda_reg_no: 'EDA-VIT-003',
    trade_name_en: 'Feroglobin B12 Capsules',
    trade_name_ar: 'فيروجلوبين ب12 كبسولات حديد ولعلاج الأنيميا',
    generic_name: 'Iron + Zinc + Copper + Folic Acid + B12',
    dosage_form: 'كبسولات لطيفة على المعدة',
    strength: 'حديد متطور متعدد الفيتامينات',
    pack_size: 3, // 30 كبسولة (3 شرائط)
    unit_name: 'شريط',
    public_price: 95.00,
    manufacturer: 'Vitabiotics',
    category: 'علاج فقر الدم والأنيميا والإرهاق',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221007001039'
  },
  {
    eda_reg_no: 'EDA-TAB-001',
    trade_name_en: 'Neurontin 300mg Capsules',
    trade_name_ar: 'نيورونتين 300 مجم كبسولات (صنف جدول)',
    generic_name: 'Gabapentin',
    dosage_form: 'كبسولات',
    strength: '300 mg',
    pack_size: 5, // 50 كبسولة (5 شرائط × 10)
    unit_name: 'شريط',
    public_price: 195.00,
    manufacturer: 'Pfizer',
    category: 'علاج آلام الأعصاب والصرع (مؤثر عقلي)',
    is_table_drug: true, // صنف جدول ومؤثر عقلي يخضع للرقابة
    is_refrigerated: false,
    gtin_barcode: '6221008001014'
  },
  {
    eda_reg_no: 'EDA-TAB-002',
    trade_name_en: 'Lyrica 75mg Capsules',
    trade_name_ar: 'ليريكا 75 مجم كبسولات (صنف جدول أول)',
    generic_name: 'Pregabalin',
    dosage_form: 'كبسولات',
    strength: '75 mg',
    pack_size: 1, // 14 كبسولة في شريط
    unit_name: 'شريط',
    public_price: 185.00,
    manufacturer: 'Pfizer',
    category: 'مهدئ للآلام العصبية الشديدة (صنف جدول رسمي)',
    is_table_drug: true, // صنف جدول صارم
    is_refrigerated: false,
    gtin_barcode: '6221008001021'
  },
  {
    eda_reg_no: 'EDA-TAB-003',
    trade_name_en: 'Tegretol 200mg CR Tablets',
    trade_name_ar: 'تجريتول 200 مجم سي آر أقراص (صنف جدول)',
    generic_name: 'Carbamazepine',
    dosage_form: 'أقراص ممتدة المفعول',
    strength: '200 mg',
    pack_size: 5, // 50 قرص (5 شرائط)
    unit_name: 'شريط',
    public_price: 65.00,
    manufacturer: 'Novartis',
    category: 'علاج الصرع والعصب الخامس (صنف جدول)',
    is_table_drug: true,
    is_refrigerated: false,
    gtin_barcode: '6221008001038'
  }
];

// ── 3. دوال تهيئة قاعدة البيانات وغرس الأدوية (Database Init & Seeding) ─────────
export async function initEdaMedicationTables(db) {
  try {
    const ddl = `
      -- 1. جدول كتالوج الأدوية المصرية (EDA & Drug Eye Central Index)
      CREATE TABLE IF NOT EXISTS public.outstock_medications (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          eda_reg_no VARCHAR(100) NULL,
          trade_name_en VARCHAR(255) NOT NULL,
          trade_name_ar VARCHAR(255) NOT NULL,
          generic_name VARCHAR(255) NOT NULL,
          dosage_form VARCHAR(100) NOT NULL,
          strength VARCHAR(100) NULL,
          pack_size INTEGER NOT NULL DEFAULT 1,
          unit_name VARCHAR(50) NOT NULL DEFAULT 'شريط',
          public_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
          manufacturer VARCHAR(150) NULL,
          category VARCHAR(150) NULL,
          is_table_drug BOOLEAN NOT NULL DEFAULT false,
          is_refrigerated BOOLEAN NOT NULL DEFAULT false,
          gtin_barcode VARCHAR(50) NULL,
          market_status VARCHAR(50) NOT NULL DEFAULT 'available',
          search_normalized TEXT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_outstock_med_ar ON public.outstock_medications (trade_name_ar);
      CREATE INDEX IF NOT EXISTS idx_outstock_med_en ON public.outstock_medications (trade_name_en);
      CREATE INDEX IF NOT EXISTS idx_outstock_med_generic ON public.outstock_medications (generic_name);
      CREATE INDEX IF NOT EXISTS idx_outstock_med_search ON public.outstock_medications (search_normalized);
      CREATE INDEX IF NOT EXISTS idx_outstock_med_barcode ON public.outstock_medications (gtin_barcode);

      -- 2. جدول سجل تغيرات الأسعار الرسمية (EDA Price Revision History)
      CREATE TABLE IF NOT EXISTS public.outstock_price_audit_logs (
          id BIGSERIAL PRIMARY KEY,
          medication_id VARCHAR(36) NOT NULL,
          trade_name VARCHAR(255) NOT NULL,
          old_public_price NUMERIC(10, 2) NOT NULL,
          new_public_price NUMERIC(10, 2) NOT NULL,
          old_unit_price NUMERIC(10, 2) NOT NULL,
          new_unit_price NUMERIC(10, 2) NOT NULL,
          revision_source VARCHAR(100) NOT NULL DEFAULT 'EDA Official Decree',
          decree_number VARCHAR(100) NULL,
          changed_by VARCHAR(100) NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_outstock_price_audit_med ON public.outstock_price_audit_logs (medication_id);
    `;

    await db.query(ddl);

    // التحقق من وجود بيانات وغرس الأدوية التأسيسية إن كانت فارغة
    const countRes = await db.query('SELECT COUNT(*) FROM public.outstock_medications');
    const count = parseInt(countRes.rows[0]?.count || 0, 10);

    if (count === 0) {
      console.log('🌱 [EDA/DrugEye Engine] جاري غرس الأدوية المصرية الأساسية وأسعارها الرسمية...');
      await seedEdaMedications(db, SEED_EDA_DRUG_EYE_MEDICATIONS);
      console.log(`✅ [EDA/DrugEye Engine] تم بنجاح غرس ${SEED_EDA_DRUG_EYE_MEDICATIONS.length} صنفاً دوائياً متداولاً في السوق المصري.`);
    } else {
      console.log(`💊 [EDA/DrugEye Engine] كتالوج الأدوية جاهز ونشط ويحتوي على ${count} صنف دوائي مسجل.`);
    }
  } catch (err) {
    console.error('❌ [EDA/DrugEye Engine Init Error]:', err.message);
  }
}

// ── 4. غرس وتحديث الأدوية (Bulk Upsert Helper) ───────────────────────────────
export async function seedEdaMedications(db, medsList) {
  for (const med of medsList) {
    const packSize = Math.max(1, parseInt(med.pack_size || 1, 10));
    const publicPrice = parseFloat(med.public_price || 0);
    // حساب سعر الوحدة (الشريط أو الأمبول أو الكيس) بدقة:
    const calculatedUnitPrice = parseFloat((publicPrice / packSize).toFixed(2));

    const normalized = normalizeDrugSearchText(
      `${med.trade_name_en} ${med.trade_name_ar} ${med.generic_name} ${med.manufacturer || ''}`
    );

    await db.query(`
      INSERT INTO public.outstock_medications (
        eda_reg_no, trade_name_en, trade_name_ar, generic_name, dosage_form,
        strength, pack_size, unit_name, public_price, unit_price, manufacturer,
        category, is_table_drug, is_refrigerated, gtin_barcode, market_status,
        search_normalized, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `, [
      med.eda_reg_no || null,
      med.trade_name_en,
      med.trade_name_ar,
      med.generic_name,
      med.dosage_form,
      med.strength || null,
      packSize,
      med.unit_name || 'شريط',
      publicPrice,
      calculatedUnitPrice,
      med.manufacturer || null,
      med.category || null,
      Boolean(med.is_table_drug),
      Boolean(med.is_refrigerated),
      med.gtin_barcode || null,
      med.market_status || 'available',
      normalized
    ]);
  }
}

// ── 5. البحث اللحظي السريع في كتالوج الأدوية (Fast Realtime Autocomplete) ──────
export async function searchEdaMedications(db, queryTerm, limit = 15) {
  const clean = String(queryTerm || '').trim();
  if (!clean || clean.length < 2) return [];

  const normalized = normalizeDrugSearchText(clean);
  const pattern = `%${normalized}%`;
  const rawPattern = `%${clean.toLowerCase()}%`;

  const sql = `
    SELECT
      id, eda_reg_no, trade_name_en, trade_name_ar, generic_name,
      dosage_form, strength, pack_size, unit_name, public_price,
      unit_price, manufacturer, category, is_table_drug, is_refrigerated,
      gtin_barcode, market_status
    FROM public.outstock_medications
    WHERE
      search_normalized LIKE $1
      OR LOWER(trade_name_en) LIKE $2
      OR LOWER(trade_name_ar) LIKE $2
      OR LOWER(generic_name) LIKE $2
      OR gtin_barcode = $3
    ORDER BY
      CASE
        WHEN LOWER(trade_name_en) = LOWER($4) OR LOWER(trade_name_ar) = LOWER($4) THEN 1
        WHEN LOWER(trade_name_en) LIKE $5 OR LOWER(trade_name_ar) LIKE $5 THEN 2
        WHEN search_normalized LIKE $6 THEN 3
        ELSE 4
      END,
      trade_name_en ASC
    LIMIT $7
  `;

  const values = [
    pattern,
    rawPattern,
    clean,
    clean.toLowerCase(),
    `${clean.toLowerCase()}%`,
    `${normalized}%`,
    Math.min(30, Math.max(1, limit))
  ];

  const res = await db.query(sql, values);
  return res.rows.map(r => ({
    ...r,
    public_price: parseFloat(r.public_price || 0),
    unit_price: parseFloat(r.unit_price || 0),
    pack_size: parseInt(r.pack_size || 1, 10),
    displayName: `${r.trade_name_ar} (${r.trade_name_en})`
  }));
}

// ── 6. محرك استرجاع المثائل والبدائل الدوائية (Drug Eye Substitutes Engine) ────
export async function getDrugEyeSubstitutes(db, genericName, excludeId = null) {
  if (!genericName || String(genericName).trim().length < 3) return [];

  const cleanGeneric = String(genericName).trim();
  const res = await db.query(`
    SELECT
      id, trade_name_en, trade_name_ar, generic_name, dosage_form,
      strength, pack_size, unit_name, public_price, unit_price,
      manufacturer, is_table_drug, market_status
    FROM public.outstock_medications
    WHERE LOWER(generic_name) = LOWER($1)
      ${excludeId ? 'AND id <> $2' : ''}
    ORDER BY public_price ASC
    LIMIT 10
  `, excludeId ? [cleanGeneric, excludeId] : [cleanGeneric]);

  return res.rows.map(r => ({
    ...r,
    public_price: parseFloat(r.public_price || 0),
    unit_price: parseFloat(r.unit_price || 0),
    pack_size: parseInt(r.pack_size || 1, 10)
  }));
}

// ── 7. استيراد وتحديث التسعيرة وقوائم هيئة الدواء (EDA Sync & Price Revisions) ──
export async function syncOrUpdateMedications(db, medicationsList, revisionSource = 'تحديث التسعيرة الجبرية الرسمية') {
  if (!Array.isArray(medicationsList) || medicationsList.length === 0) {
    return { success: false, error: 'قائمة الأدوية فارغة' };
  }

  let updatedCount = 0;
  let insertedCount = 0;
  let priceChangesCount = 0;

  for (const med of medicationsList) {
    if (!med.trade_name_en && !med.trade_name_ar) continue;

    const packSize = Math.max(1, parseInt(med.pack_size || 1, 10));
    const newPublicPrice = parseFloat(med.public_price || 0);
    const newUnitPrice = parseFloat((newPublicPrice / packSize).toFixed(2));

    const normalized = normalizeDrugSearchText(
      `${med.trade_name_en || ''} ${med.trade_name_ar || ''} ${med.generic_name || ''} ${med.manufacturer || ''}`
    );

    // البحث عن الدواء إذا كان مسجلاً مسبقاً لمقارنة السعر
    const existingRes = await db.query(`
      SELECT id, public_price, unit_price, trade_name_ar
      FROM public.outstock_medications
      WHERE (eda_reg_no IS NOT NULL AND eda_reg_no = $1)
         OR (LOWER(trade_name_en) = LOWER($2) AND dosage_form = $3)
      LIMIT 1
    `, [med.eda_reg_no || '__none__', med.trade_name_en || '', med.dosage_form || '']);

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      const oldPublic = parseFloat(existing.public_price || 0);
      const oldUnit = parseFloat(existing.unit_price || 0);

      // إذا حدث تغير في السعر الرسمي لهيئة الدواء
      if (Math.abs(oldPublic - newPublicPrice) > 0.05) {
        priceChangesCount++;
        await db.query(`
          INSERT INTO public.outstock_price_audit_logs (
            medication_id, trade_name, old_public_price, new_public_price,
            old_unit_price, new_unit_price, revision_source, decree_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          existing.id,
          existing.trade_name_ar || med.trade_name_ar,
          oldPublic,
          newPublicPrice,
          oldUnit,
          newUnitPrice,
          revisionSource,
          med.decree_number || null
        ]);
      }

      await db.query(`
        UPDATE public.outstock_medications
        SET
          trade_name_ar = COALESCE($1, trade_name_ar),
          generic_name = COALESCE($2, generic_name),
          strength = COALESCE($3, strength),
          pack_size = $4,
          unit_name = COALESCE($5, unit_name),
          public_price = $6,
          unit_price = $7,
          manufacturer = COALESCE($8, manufacturer),
          category = COALESCE($9, category),
          is_table_drug = COALESCE($10, is_table_drug),
          is_refrigerated = COALESCE($11, is_refrigerated),
          market_status = COALESCE($12, market_status),
          search_normalized = $13,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $14
      `, [
        med.trade_name_ar,
        med.generic_name,
        med.strength,
        packSize,
        med.unit_name || 'شريط',
        newPublicPrice,
        newUnitPrice,
        med.manufacturer,
        med.category,
        med.is_table_drug !== undefined ? Boolean(med.is_table_drug) : null,
        med.is_refrigerated !== undefined ? Boolean(med.is_refrigerated) : null,
        med.market_status,
        normalized,
        existing.id
      ]);

      updatedCount++;
    } else {
      // إدراج دواء جديد في الكتالوج
      await db.query(`
        INSERT INTO public.outstock_medications (
          eda_reg_no, trade_name_en, trade_name_ar, generic_name, dosage_form,
          strength, pack_size, unit_name, public_price, unit_price, manufacturer,
          category, is_table_drug, is_refrigerated, gtin_barcode, market_status,
          search_normalized, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
      `, [
        med.eda_reg_no || null,
        med.trade_name_en,
        med.trade_name_ar,
        med.generic_name,
        med.dosage_form,
        med.strength || null,
        packSize,
        med.unit_name || 'شريط',
        newPublicPrice,
        newUnitPrice,
        med.manufacturer || null,
        med.category || null,
        Boolean(med.is_table_drug),
        Boolean(med.is_refrigerated),
        med.gtin_barcode || null,
        med.market_status || 'available',
        normalized
      ]);
      insertedCount++;
    }
  }

  return {
    success: true,
    insertedCount,
    updatedCount,
    priceChangesCount,
    totalProcessed: medicationsList.length
  };
}
