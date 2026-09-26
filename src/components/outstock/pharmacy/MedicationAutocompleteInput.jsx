import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Pill, Search, AlertTriangle, Snowflake, Sparkles, Check, ChevronDown, RefreshCw, Layers, Plus } from 'lucide-react';
import { outstockSearchMedications, outstockGetSubstitutes } from '../../../utils/outstockApiClient';

// ── كتالوج محلي فائق السرعة لضمان العمل اللحظي دون أي تأخير ───────────────
const LOCAL_FALLBACK_MEDS = [
  {
    id: 'eg-441',
    trade_name_en: 'alphintern 30 f.c.tabs',
    trade_name_ar: 'الفنترن 30 قرص',
    generic_name: 'chymotrypsin+trypsin',
    dosage_form: 'أقراص',
    strength: '',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 87.00,
    unit_price: 29.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    gtin_barcode: '6221025030733',
    displayName: 'الفنترن 30 قرص (alphintern 30 f.c.tabs)'
  },
  {
    id: 'f-1',
    trade_name_en: 'Augmentin 1g Tablets',
    trade_name_ar: 'أوجمنتين 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 130.00,
    unit_price: 65.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 1 جم أقراص (Augmentin 1g Tab)'
  },
  {
    id: 'f-2',
    trade_name_en: 'Augmentin 625mg Tablets',
    trade_name_ar: 'أوجمنتين 625 مجم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '625 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 95.00,
    unit_price: 47.50,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 625 مجم أقراص (Augmentin 625mg)'
  },
  {
    id: 'f-3',
    trade_name_en: 'Augmentin 457mg Suspension',
    trade_name_ar: 'أوجمنتين 457 مجم معلق للشرب',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'معلق للشرب',
    strength: '457 mg / 5ml',
    pack_size: 1,
    unit_name: 'زجاجة',
    public_price: 75.00,
    unit_price: 75.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أوجمنتين 457 مجم معلق للشرب (Augmentin 457mg Susp)'
  },
  {
    id: 'f-4',
    trade_name_en: 'Curam 1g Tablets',
    trade_name_ar: 'كيورام 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 115.00,
    unit_price: 57.50,
    manufacturer: 'Sandoz',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كيورام 1 جم أقراص (Curam 1g Tab)'
  },
  {
    id: 'f-5',
    trade_name_en: 'Megamox 1g Tablets',
    trade_name_ar: 'ميجاموكس 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 105.00,
    unit_price: 52.50,
    manufacturer: 'Hikma Pharma',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'ميجاموكس 1 جم أقراص (Megamox 1g)'
  },
  {
    id: 'f-6',
    trade_name_en: 'Hibiotic 1g Tablets',
    trade_name_ar: 'هاي بيوتك 1 جم أقراص',
    generic_name: 'Amoxicillin + Clavulanic Acid',
    dosage_form: 'أقراص مغلفة',
    strength: '1000 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 100.00,
    unit_price: 50.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'هاي بيوتك 1 جم أقراص (Hibiotic 1g)'
  },
  {
    id: 'f-7',
    trade_name_en: 'Panadol Advance 500mg',
    trade_name_ar: 'بنادول أدفانس أزرق 500 مجم',
    generic_name: 'Paracetamol',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 45.00,
    unit_price: 22.50,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول أدفانس أزرق (Panadol Advance 500mg)'
  },
  {
    id: 'f-8',
    trade_name_en: 'Panadol Extra',
    trade_name_ar: 'بنادول إكسترا أحمر',
    generic_name: 'Paracetamol + Caffeine',
    dosage_form: 'أقراص',
    strength: '500 mg / 65 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 55.00,
    unit_price: 27.50,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول إكسترا أحمر (Panadol Extra)'
  },
  {
    id: 'f-9',
    trade_name_en: 'Panadol Cold & Flu All in One',
    trade_name_ar: 'بنادول كولد أند فلو البرتقالي',
    generic_name: 'Paracetamol + Phenylephrine',
    dosage_form: 'أقراص',
    strength: '500 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 60.00,
    unit_price: 30.00,
    manufacturer: 'Haleon / GSK',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'بنادول كولد أند فلو (Panadol Cold & Flu)'
  },
  {
    id: 'f-10',
    trade_name_en: 'Cataflam 50mg Tablets',
    trade_name_ar: 'كتافلام 50 مجم أقراص',
    generic_name: 'Diclofenac Potassium',
    dosage_form: 'أقراص',
    strength: '50 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 58.00,
    unit_price: 29.00,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كتافلام 50 مجم أقراص (Cataflam 50mg)'
  },
  {
    id: 'f-11',
    trade_name_en: 'Voltaren 100mg SR Tablets',
    trade_name_ar: 'فولتارين 100 مجم أقراص ممتدة المفعول',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أقراص',
    strength: '100 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 75.00,
    unit_price: 37.50,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فولتارين 100 مجم ريتارد (Voltaren 100mg SR)'
  },
  {
    id: 'f-12',
    trade_name_en: 'Voltaren 75mg Ampoules',
    trade_name_ar: 'فولتارين 75 مجم حقن عضل',
    generic_name: 'Diclofenac Sodium',
    dosage_form: 'أمبولات حقن',
    strength: '75 mg',
    pack_size: 6,
    unit_name: 'أمبول',
    public_price: 60.00,
    unit_price: 10.00,
    manufacturer: 'Novartis',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فولتارين 75 مجم حقن (Voltaren 75mg Amp)'
  },
  {
    id: 'f-13',
    trade_name_en: 'Concor 5mg Tablets',
    trade_name_ar: 'كونكور 5 مجم أقراص',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص',
    strength: '5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 75.00,
    unit_price: 25.00,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونكور 5 مجم أقراص (Concor 5mg)'
  },
  {
    id: 'f-14',
    trade_name_en: 'Concor 2.5mg Tablets',
    trade_name_ar: 'كونكور 2.5 مجم أقراص (كور)',
    generic_name: 'Bisoprolol Fumarate',
    dosage_form: 'أقراص',
    strength: '2.5 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 60.00,
    unit_price: 20.00,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونكور 2.5 مجم كور (Concor 2.5mg Cor)'
  },
  {
    id: 'f-15',
    trade_name_en: 'Clexane 40mg Syringes',
    trade_name_ar: 'كليكسان 40 مجم حقن سيولة',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '40 mg / 0.4 ml',
    pack_size: 2,
    unit_name: 'سرنجة',
    public_price: 145.00,
    unit_price: 72.50,
    manufacturer: 'Sanofi',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كليكسان 40 مجم حقن (Clexane 40mg Syringe)'
  },
  {
    id: 'f-16',
    trade_name_en: 'Clexane 60mg Syringes',
    trade_name_ar: 'كليكسان 60 مجم حقن سيولة',
    generic_name: 'Enoxaparin Sodium',
    dosage_form: 'حقن جاهزة تحت الجلد',
    strength: '60 mg / 0.6 ml',
    pack_size: 2,
    unit_name: 'سرنجة',
    public_price: 195.00,
    unit_price: 97.50,
    manufacturer: 'Sanofi',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كليكسان 60 مجم حقن (Clexane 60mg Syringe)'
  },
  {
    id: 'f-17',
    trade_name_en: 'Glucophage 1000mg Tablets',
    trade_name_ar: 'جلوكوفاج 1000 مجم أقراص',
    generic_name: 'Metformin Hydrochloride',
    dosage_form: 'أقراص',
    strength: '1000 mg',
    pack_size: 3,
    unit_name: 'شريط',
    public_price: 65.00,
    unit_price: 21.67,
    manufacturer: 'Merck Healthcare',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'جلوكوفاج 1000 مجم أقراص (Glucophage 1000mg)'
  },
  {
    id: 'f-18',
    trade_name_en: 'Antinal 200mg Capsules',
    trade_name_ar: 'أنتينال 200 مجم كبسولات مطهر معوي',
    generic_name: 'Nifuroxazide',
    dosage_form: 'كبسولات',
    strength: '200 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 42.00,
    unit_price: 21.00,
    manufacturer: 'Amoun',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'أنتينال 200 مجم كبسول (Antinal 200mg)'
  },
  {
    id: 'f-19',
    trade_name_en: 'Nexium 40mg Tablets',
    trade_name_ar: 'نيكسيوم 40 مجم أقراص حموضة',
    generic_name: 'Esomeprazole',
    dosage_form: 'أقراص',
    strength: '40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 160.00,
    unit_price: 80.00,
    manufacturer: 'AstraZeneca',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'نيكسيوم 40 مجم أقراص (Nexium 40mg)'
  },
  {
    id: 'f-20',
    trade_name_en: 'Controloc 40mg Tablets',
    trade_name_ar: 'كونترولوك 40 مجم أقراص معدة',
    generic_name: 'Pantoprazole',
    dosage_form: 'أقراص',
    strength: '40 mg',
    pack_size: 2,
    unit_name: 'شريط',
    public_price: 110.00,
    unit_price: 55.00,
    manufacturer: 'Takeda',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'كونترولوك 40 مجم أقراص (Controloc 40mg)'
  },
  {
    id: 'f-21',
    trade_name_en: 'Ventolin Inhaler 100mcg',
    trade_name_ar: 'فنتولين بخاخ صدر 100 ميكروجرام',
    generic_name: 'Salbutamol',
    dosage_form: 'بخاخ فموي',
    strength: '100 mcg',
    pack_size: 1,
    unit_name: 'بخاخة',
    public_price: 55.00,
    unit_price: 55.00,
    manufacturer: 'GlaxoSmithKline (GSK)',
    is_table_drug: false,
    is_refrigerated: false,
    displayName: 'فنتولين بخاخ صدر (Ventolin Inhaler)'
  },
  {
    id: 'f-22',
    trade_name_en: 'Neurontin 300mg Capsules',
    trade_name_ar: 'نيورونتين 300 مجم كبسولات (صنف جدول)',
    generic_name: 'Gabapentin',
    dosage_form: 'كبسولات',
    strength: '300 mg',
    pack_size: 5,
    unit_name: 'شريط',
    public_price: 195.00,
    unit_price: 39.00,
    manufacturer: 'Pfizer',
    is_table_drug: true,
    is_refrigerated: false,
    displayName: 'نيورونتين 300 مجم كبسول (Neurontin 300mg) 🚨 جدول'
  }
];

// دالة تظليل الحروف المطابقة أثناء البحث لتسهيل القراءة وراحة العين
const highlightMatch = (text, query) => {
  if (!text || !query) return text;
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerText.indexOf(lowerQ);
  if (idx === -1) return text;
  return (
    <span>
      {text.substring(0, idx)}
      <mark style={{
        background: '#fef08a',
        color: '#854d0e',
        padding: '0 2px',
        borderRadius: '3px',
        fontWeight: '900'
      }}>
        {text.substring(idx, idx + q.length)}
      </mark>
      {text.substring(idx + q.length)}
    </span>
  );
};

export default function MedicationAutocompleteInput({
  value = '',
  unitType = 'pack',
  selectedMed = null,
  onMedicationSelect,
  onTextChange,
  placeholder = 'اسم الدواء أو التركيز (مثل: أوجمنتين 1 جم)...',
  required = true,
  disabled = false,
  inputRef = null,
  onAddNewMedication = null
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [substitutes, setSubstitutes] = useState([]);
  const [isLoadingSubs, setIsLoadingSubs] = useState(false);
  const [showSubstitutesModal, setShowSubstitutesModal] = useState(false);

  // إحداثيات وأبعاد القائمة المنسدلة الموسعة لضمان التنسيق العريض وملاءمة الشاشة
  const [dropdownCoords, setDropdownCoords] = useState({
    width: 720,
    right: 0
  });

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const itemRefs = useRef([]);

  // حساب دقيق لعرض وموضع القائمة المنسدلة الموسعة لظهورها بشكل عريض ومريح للعين
  const calculateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    // العرض المستهدف الموسع: 720px إلى 740px أو عرض الشاشة المتاح
    const maxAllowedWidth = Math.max(300, viewportWidth - 28);
    const targetWidth = Math.min(740, maxAllowedWidth);

    // في الواجهة RTL تثبيت الحافة اليمنى الافتراضية عند rect.right
    // الحافة اليسرى ستكون عند: rect.right - targetWidth
    const leftEdge = rect.right - targetWidth;
    let rightOffset = 0;

    // إذا كانت الحافة اليسرى ستتعدى حدود الشاشة من اليسار
    if (leftEdge < 14) {
      rightOffset = -(14 - leftEdge);
    }

    // التأكد من عدم تجاوز الحافة اليمنى لحدود الشاشة من اليمين
    const currentRight = rect.right - rightOffset;
    if (currentRight > viewportWidth - 14) {
      rightOffset += (currentRight - (viewportWidth - 14));
    }

    setDropdownCoords({
      width: Math.round(targetWidth),
      right: Math.round(rightOffset)
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    calculateDropdownPosition();
    const handleRecalc = () => calculateDropdownPosition();

    window.addEventListener('resize', handleRecalc);
    window.addEventListener('scroll', handleRecalc, true);

    return () => {
      window.removeEventListener('resize', handleRecalc);
      window.removeEventListener('scroll', handleRecalc, true);
    };
  }, [isOpen, calculateDropdownPosition, suggestions.length]);

  // التمرير التلقائي اللحظي في القائمة المنسدلة عند النزول والصعود بالأسهم
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [activeIndex]);

  // مزامنة القيمة عند تغيرها خارجياً
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // إغلاق القائمة المنسدلة عند النقر خارج المكوّن
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // دالة البحث التلقائي مع Debounce
  const handleInputChange = (e) => {
    const text = e.target.value;
    setInputValue(text);
    if (onTextChange) onTextChange(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const clean = text.trim();
    if (clean.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        // 1. الاستعلام من خادم الـ API لهيئة الدواء ودراج آي
        const res = await outstockSearchMedications(clean, 12);
        if (res?.success && Array.isArray(res.medications) && res.medications.length > 0) {
          setSuggestions(res.medications);
          setIsOpen(true);
          setActiveIndex(-1);
        } else {
          // 2. استخدام الفلترة المحلية السريعة كـ Fallback
          const s = clean.toLowerCase();
          const localMatched = LOCAL_FALLBACK_MEDS.filter(m =>
            m.trade_name_en.toLowerCase().includes(s) ||
            m.trade_name_ar.includes(clean) ||
            m.generic_name.toLowerCase().includes(s)
          );
          setSuggestions(localMatched);
          setIsOpen(true);
          setActiveIndex(-1);
        }
      } catch (err) {
        console.warn('Medication autocomplete search error:', err);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    }, 180);
  };

  // اختيار صنف من القائمة
  const handleSelectMedication = (med) => {
    const finalDisplayName = med.displayName || `${med.trade_name_ar} (${med.trade_name_en})`;
    setInputValue(finalDisplayName);
    setIsOpen(false);
    setSuggestions([]);

    if (onMedicationSelect) {
      onMedicationSelect(finalDisplayName, med);
    }
  };

  // التنقل بالأسهم واختيار بزر Enter
  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        handleSelectMedication(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // استعراض البدائل والمثائل للصنف الحالي (Drug Eye Equivalents)
  const handleFetchSubstitutes = async () => {
    if (!selectedMed?.generic_name) return;
    setIsLoadingSubs(true);
    setShowSubstitutesModal(true);
    try {
      const res = await outstockGetSubstitutes(selectedMed.generic_name, selectedMed.id);
      if (res?.success && Array.isArray(res.substitutes)) {
        setSubstitutes(res.substitutes);
      } else {
        // Fallback من القائمة المحلية
        const localSubs = LOCAL_FALLBACK_MEDS.filter(m =>
          m.generic_name.toLowerCase() === selectedMed.generic_name.toLowerCase() &&
          m.trade_name_en !== selectedMed.trade_name_en
        );
        setSubstitutes(localSubs);
      }
    } catch (err) {
      console.warn('Failed to fetch substitutes:', err);
    } finally {
      setIsLoadingSubs(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', flex: 1, zIndex: isOpen ? 9999 : 'auto' }}>
      {/* حقل الإدخال الذكي */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0 || (onAddNewMedication && inputValue.trim().length >= 1)) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          className="outstock-form-input"
          style={{
            paddingRight: '36px',
            paddingLeft: selectedMed ? '100px' : '36px',
            minHeight: '40px',
            fontSize: '13px',
            fontWeight: '600',
            borderColor: selectedMed ? '#0d9488' : undefined,
            backgroundColor: selectedMed ? '#f0fdfa' : undefined
          }}
        />

        {/* أيقونة البحث / التحميل في البداية */}
        <div style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: selectedMed ? '#0d9488' : '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none'
        }}>
          {isLoading ? (
            <RefreshCw size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Pill size={16} />
          )}
        </div>

        {/* شارة السعر السريع أو زر استعراض البدائل داخل الحقل */}
        {selectedMed && (
          <div style={{
            position: 'absolute',
            left: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={handleFetchSubstitutes}
              title="عرض المثائل والبدائل المعتمدة (Drug Eye)"
              style={{
                background: '#e0f2fe',
                color: '#0369a1',
                border: '1px solid #bae6fd',
                borderRadius: '6px',
                padding: '2px 7px',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <Sparkles size={12} />
              <span>بدائل</span>
            </button>
          </div>
        )}
      </div>

      {/* شارة تنبيه أدوية الجدول أو الحفظ في الثلاجة تحت الحقل */}
      {selectedMed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
          {selectedMed.is_table_drug && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#dc2626'
            }}>
              <AlertTriangle size={12} />
              صنف جدول ومؤثرات عقلية (EDA Controlled)
            </span>
          )}

          {selectedMed.is_refrigerated && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: '#2563eb'
            }}>
              <Snowflake size={12} />
              يحفظ بالثلاجة (2-8°C)
            </span>
          )}

          {selectedMed.pack_size > 1 && (
            <span style={{
              fontSize: '11px',
              color: '#64748b',
              fontWeight: '600'
            }}>
              📦 العلبة تحتوي على {selectedMed.pack_size} {selectedMed.unit_name || 'شرائط'} (سعر الشريط: {selectedMed.unit_price} ج.م)
            </span>
          )}
        </div>
      )}

      {/* ── القائمة المنسدلة الذكية الموسعة (Expanded High-Comfort Autocomplete Dropdown) ── */}
      {isOpen && (suggestions.length > 0 || (onAddNewMedication && inputValue.trim().length >= 1)) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: `${dropdownCoords.right}px`,
            width: `${dropdownCoords.width}px`,
            maxWidth: 'calc(100vw - 20px)',
            background: '#ffffff',
            border: '1.5px solid #0d9488',
            borderRadius: '16px',
            boxShadow: '0 22px 50px -10px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(13, 148, 136, 0.15)',
            maxHeight: '440px',
            overflowY: 'auto',
            zIndex: 99999,
            padding: '10px',
            direction: 'rtl'
          }}
        >
          {suggestions.length > 0 ? (
            <>
              {/* شريط معلومات رأس القائمة الذكي */}
              <div
                style={{
                  padding: '9px 14px',
                  fontSize: '12px',
                  fontWeight: '800',
                  color: '#334155',
                  background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)',
                  borderRadius: '11px',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid #ccfbf1',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0f766e' }}>
                  <Pill size={15} color="#0d9488" />
                  <span>نتائج كتالوج الأدوية المعتمد (هيئة الدواء المصرية & Drug Eye) — {suggestions.length} صنف</span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#475569',
                  background: '#ffffff',
                  padding: '3px 10px',
                  borderRadius: '7px',
                  border: '1px solid #e2e8f0',
                  fontWeight: '700'
                }}>
                  استخدم الأسهم ⬇️ ⬆️ للتنقل • اضغط <strong style={{ color: '#0d9488' }}>Enter</strong> للاختيار • <span style={{ color: '#94a3b8' }}>Esc</span> للإلغاء
                </div>
              </div>

              {suggestions.map((med, idx) => {
                const isSelected = activeIndex === idx;
                const packPrice = parseFloat(med.public_price || 0);
                const unitPrice = parseFloat(med.unit_price || (packPrice / (med.pack_size || 1))).toFixed(2);

                return (
                  <div
                    key={med.id || idx}
                    ref={(el) => (itemRefs.current[idx] = el)}
                    onClick={() => handleSelectMedication(med)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#f0fdfa' : '#ffffff',
                      border: isSelected ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
                      borderRight: isSelected ? '5px solid #0d9488' : '1px solid #e2e8f0',
                      boxShadow: isSelected ? '0 4px 14px rgba(13, 148, 136, 0.15)' : 'none',
                      marginBottom: '6px',
                      transition: 'all 0.12s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    {/* ── السطر الأول: الاسم التجاري العربي والإنجليزي + شارات الجدول/الثلاجة + الأسعار الرسمية ── */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}>
                      {/* الجانب الأيمن: الأيقونة والأسماء والشارات */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, minWidth: '240px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: isSelected ? '#ccfbf1' : '#f1f5f9',
                          color: isSelected ? '#0d9488' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <Pill size={17} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontWeight: '900',
                            fontSize: '14.5px',
                            color: isSelected ? '#0f766e' : '#0f172a',
                            letterSpacing: '-0.2px'
                          }}>
                            {highlightMatch(med.trade_name_ar, inputValue)}
                          </span>

                          <span style={{
                            fontSize: '12px',
                            color: '#475569',
                            direction: 'ltr',
                            fontWeight: '700',
                            background: isSelected ? '#ffffff' : '#f8fafc',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                          }}>
                            {highlightMatch(med.trade_name_en, inputValue)}
                          </span>

                          {med.is_table_drug && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '900'
                            }}>
                              <AlertTriangle size={12} />
                              <span>صنف جدول</span>
                            </span>
                          )}

                          {med.is_refrigerated && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 7px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '800'
                            }}>
                              <Snowflake size={12} />
                              <span>ثلاجة (2-8°C)</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* الجانب الأيسر: بطاقات الأسعار الرسمية البارزة */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexShrink: 0
                      }}>
                        <div style={{
                          background: '#ecfdf5',
                          color: '#065f46',
                          border: '1.5px solid #a7f3d0',
                          padding: '4px 11px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: '#047857' }}>سعر العلبة:</span>
                          <span style={{ fontSize: '13.5px', fontWeight: '900' }}>{packPrice} ج.م</span>
                        </div>

                        {med.pack_size > 1 && (
                          <div style={{
                            background: '#f0f9ff',
                            color: '#0369a1',
                            border: '1.5px solid #bae6fd',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: '700' }}>{med.unit_name || 'شريط'}:</span>
                            <span style={{ fontSize: '13px', fontWeight: '900', color: '#075985' }}>{unitPrice} ج.م</span>
                            <span style={{ fontSize: '10.5px', color: '#64748b' }}>({med.pack_size} شرائط)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── السطر الثاني: التفاصيل العلمية والصيدلانية في صف عريض مريح للعين ── */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.9)' : '#f8fafc',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #f1f5f9',
                      fontSize: '11.5px',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                        {/* المادة الفعالة */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ color: '#64748b', fontWeight: '700' }}>🧬 المادة الفعالة:</span>
                          <span style={{
                            color: '#0369a1',
                            fontWeight: '800',
                            background: '#e0f2fe',
                            padding: '1px 8px',
                            borderRadius: '5px'
                          }}>
                            {highlightMatch(med.generic_name || 'غير محدد', inputValue)}
                          </span>
                        </span>

                        {/* الشكل الصيدلي والتركيز */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ color: '#64748b', fontWeight: '700' }}>💊 الشكل والتركيز:</span>
                          <span style={{ color: '#334155', fontWeight: '800' }}>
                            {med.dosage_form || 'أقراص'}{med.strength ? ` (${med.strength})` : ''}
                          </span>
                        </span>

                        {/* الشركة المصنعة */}
                        {med.manufacturer && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ color: '#64748b', fontWeight: '700' }}>🏢 الشركة:</span>
                            <span style={{ color: '#475569', fontWeight: '700' }}>{med.manufacturer}</span>
                          </span>
                        )}
                      </div>

                      {/* مؤشر الاختيار السريع عند التمرير بالماوس أو الأسهم */}
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '800',
                        color: isSelected ? '#0d9488' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0
                      }}>
                        <span>اضغط للاختيار</span>
                        <span style={{
                          background: '#ccfbf1',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10.5px'
                        }}>↵ Enter</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <div style={{ marginBottom: '6px', fontWeight: '800', color: '#334155', fontSize: '14px' }}>
                🔍 لا توجد أدوية مطابقة لـ "{inputValue.trim()}" في الكتالوج المعتمد
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                يمكنك الضغط على الزر أدناه لتسجيل هذا الدواء فوراً باسمه وسعره وطلبه للعميل
              </div>
            </div>
          )}

          {/* زر إضافة دواء غير مسجل */}
          {onAddNewMedication && inputValue.trim().length >= 1 && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onAddNewMedication(inputValue.trim());
              }}
              style={{
                marginTop: '8px',
                padding: '12px 16px',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1.5px dashed #10b981',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#dcfce7'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: '800', fontSize: '13.5px' }}>
                <Plus size={18} color="#059669" />
                <span>+ تسجيل وإضافة دواء غير مسجل: <strong style={{ textDecoration: 'underline' }}>"{inputValue.trim()}"</strong></span>
              </div>
              <span
                style={{
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: '800',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                }}
              >
                تسجيل فوري بالكتالوج والطلب ⚡
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── نافذة استعراض المثائل والبدائل الدوائية (Drug Eye Modal) ── */}
      {showSubstitutesModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '1.5px solid #cbd5e1'
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={18} color="#0284c7" />
                  <span>المثائل والبدائل المعتمدة (منظومة Drug Eye)</span>
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                  المادة الفعالة: <strong style={{ color: '#0369a1' }}>{selectedMed?.generic_name}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubstitutesModal(false)}
                className="outstock-modal-close"
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
              {isLoadingSubs ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                  <div>جاري البحث عن البدائل والمثائل في قاعدة بيانات الأدوية...</div>
                </div>
              ) : substitutes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {substitutes.map((sub, idx) => (
                    <div
                      key={sub.id || idx}
                      style={{
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#ffffff',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '800', fontSize: '13.5px', color: '#0f172a' }}>
                          {sub.trade_name_ar} ({sub.trade_name_en})
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          {sub.dosage_form} • الشركة: {sub.manufacturer || 'محلية'}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#0d9488', marginTop: '4px' }}>
                          علبة: {sub.public_price} ج.م {sub.pack_size > 1 && `(شريط: ${sub.unit_price} ج.م)`}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          handleSelectMedication(sub);
                          setShowSubstitutesModal(false);
                        }}
                        className="outstock-btn outstock-btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px', flexShrink: 0 }}
                      >
                        <Check size={14} />
                        <span>اختيار البديل</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'left', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                type="button"
                onClick={() => setShowSubstitutesModal(false)}
                className="outstock-btn outstock-btn-secondary"
                style={{ padding: '6px 16px', fontSize: '12.5px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
