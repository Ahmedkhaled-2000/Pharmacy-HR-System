import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  UserCheck,
  UserPlus,
  Pill,
  DollarSign,
  Calendar,
  Clock,
  Printer,
  Edit3,
  MapPin,
  User,
  Check,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Truck,
  Building2,
  Camera,
  Image as ImageIcon,
  Lock,
  ShieldCheck,
  AlertCircle,
  Eye,
  CreditCard,
  Wallet,
  Coins,
  Tag,
  Link as LinkIcon,
  Zap,
  Smartphone
} from 'lucide-react';
import {
  outstockGetCustomers,
  outstockCreateOrder,
  outstockUpdateOrder,
  outstockGetEmployees,
  outstockGetBranches,
  outstockGetBranchPermissions,
  broadcastOutstockLocalMessage
} from '../../../utils/outstockApiClient';
import MedicationAutocompleteInput from './MedicationAutocompleteInput';
import AddMedicationModal from '../common/AddMedicationModal';

// قائمة أسماء الوحدات الدوائية المعتمدة للاختيار السريع
export const STANDARD_MED_UNITS = [
  'شريط',
  'أمبول',
  'فيال',
  'كيس فوار',
  'قرص',
  'كبسولة',
  'سرنجة جاهزة',
  'بخاخة',
  'نقط',
  'زجاجة',
  'أنبوبة',
  'قلم إنسولين',
  'لبوسة',
  'لزقة',
  'خرطوشة',
  'وحدة'
];

const DELIVERY_ROLE_REGEX = /(طيار|دليفري|توصيل|سائق|مندوب توصيل|delivery|driver)/i;

/**
 * NewCustomerOrderModal.jsx
 * نافذة تسجيل / تعديل طلب عميل جديد مع:
 * - تصميم فسيح وعصري (880px)
 * - كود الموظف المستلم مستور مثل الباسورد ومثبت في رأس الطلب 🔒
 * - تصنيف الطلب: دوائي / مستحضرات تجميل
 * - إرفاق صورة ولينك لكل صنف على حدة 📷
 * - إلغاء التعامل بالشريط: الوحدة هي العلبة كاملة فقط 📦
 * - السعر التقديري (من ... إلى ... ج.م) دون حساب متوسط حسابي رياضي
 * - طرق دفع متعددة ومقسمة (كاش، فيزا، محفظة إلكترونية/إنستاباي)
 * - تحديد المنطقة / الحي إجبارياً بدون اختيار افتراضي
 * - قصر رقم هاتف العميل على 11 رقماً حصراً وتنبيه فوري عند النقصان
 */
export default function NewCustomerOrderModal({
  branchId,
  branch,
  defaultPharmacist = '',
  orderReceiver = null, // { code: string, name: string }
  initialCustomerPhone = '',
  editingOrder = null,
  onClose,
  onOrderCreated,
  onOrderUpdated,
  onSuccess,
  showToast,
  availableBranches: propBranches = []
}) {
  // ── 0. كود الموظف المستلم ──

  // ── 1. حالة العميل ──
  const [searchPhone, setSearchPhone] = useState(
    editingOrder?.customer_phone || editingOrder?.customerPhone || initialCustomerPhone || ''
  );
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // حقول العميل
  const [customerName, setCustomerName] = useState(
    editingOrder?.customer_name || editingOrder?.customerName || ''
  );
  const [whatsappPhone, setWhatsappPhone] = useState(
    String(editingOrder?.customer_phone || editingOrder?.customerPhone || initialCustomerPhone || '').replace(/\D/g, '').slice(0, 11)
  );
  const [landlinePhone, setLandlinePhone] = useState(
    editingOrder?.customer_landline || editingOrder?.customerLandline || ''
  );
  const [address, setAddress] = useState(
    editingOrder?.customer_address || editingOrder?.customerAddress || ''
  );
  const [customerPermanentNotes, setCustomerPermanentNotes] = useState(
    editingOrder?.customer_permanent_notes || editingOrder?.customerPermanentNotes || ''
  );

  // ── 2. قائمة المناطق / الأحياء المعتمدة من إعدادات المالك ──
  const [deliveryZones] = useState(() => {
    try {
      const saved = localStorage.getItem('outstock_delivery_zones');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((z) => (typeof z === 'string' ? z : z.name)).filter(Boolean);
        }
      }
    } catch (e) {}
    return ['وسط البلد', 'حي الجامعة', 'المنطقة الأولى', 'المنطقة الثانية', 'حي النزهة', 'أخرى / خارج النطاق'];
  });
  // المنطقة خالية افتراضياً لإجبار الصيدلي على الاختيار
  const [selectedZone, setSelectedZone] = useState(
    editingOrder?.zone || editingOrder?.customer_zone || ''
  );

  // ── 3. صورة الدواء / الروشتة ──
  const [medicationImageUrl, setMedicationImageUrl] = useState(editingOrder?.medication_image_url || '');
  const [medicationImageName, setMedicationImageName] = useState('');
  const [previewModalImageUrl, setPreviewModalImageUrl] = useState('');
  const [isPreviewImageOpen, setIsPreviewImageOpen] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [directImageUrl, setDirectImageUrl] = useState('');
  const fileInputRef = useRef(null);

  // ── 4. بنود الأدوية (العلبة كاملة فقط 📦 - مع تصنيف لكل صنف وإرفاق صورة ورابط لكل صنف) ──
  const [items, setItems] = useState(() => {
    if (editingOrder?.items?.length > 0) {
      return editingOrder.items.map((it) => ({
        id: it.id,
        medicationName: it.medicationName || it.medication_name || '',
        unitType: 'pack',
        quantity: parseInt(it.quantity || 1, 10),
        unitPrice: String(it.unitPrice || it.unit_price || ''),
        isPriceEstimated: Boolean(it.is_price_estimated || it.isPriceEstimated),
        priceMin: it.price_min || it.priceMin || '',
        priceMax: it.price_max || it.priceMax || '',
        selectedMed: null,
        itemType: it.item_type || it.itemType || 'medication',
        imageUrl: it.image_url || it.imageUrl || '',
        itemLink: it.item_link || it.itemLink || ''
      }));
    }
    return [
      {
        medicationName: '',
        unitType: 'pack',
        quantity: 1,
        unitPrice: '',
        isPriceEstimated: false,
        priceMin: '',
        priceMax: '',
        selectedMed: null,
        itemType: '',
        imageUrl: '',
        itemLink: ''
      }
    ];
  });
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [inlineEditData, setInlineEditData] = useState({ pack_size: 1, unit_name: 'علبة', public_price: '' });

  // مراجع حقول الإدخال للتركيز التلقائي
  const itemInputRefs = useRef([]);

  // ── 5. إضافة دواء غير مسجل ──
  const [isAddMedModalOpen, setIsAddMedModalOpen] = useState(false);
  const [addMedTargetIndex, setAddMedTargetIndex] = useState(null);
  const [addMedInitialName, setAddMedInitialName] = useState('');

  // ── 6. موظفو الفرع المستحقون (استبعاد عمال الدليفري والطيارين) والفروع النشطة ──
  const [serverEmployees, setServerEmployees] = useState([]);
  const [availableBranches, setAvailableBranches] = useState(() => {
    if (Array.isArray(propBranches) && propBranches.length > 0) return propBranches;
    try {
      const saved = localStorage.getItem('app_branches') || localStorage.getItem('branches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [deliveryType, setDeliveryType] = useState('branch_pickup'); // 'branch_pickup' | 'home_delivery' | 'other_branch_pickup'
  const [deliveryTargetBranch, setDeliveryTargetBranch] = useState('');
  const [deliveryTargetBranchId, setDeliveryTargetBranchId] = useState('');
  const [isCustomUnitSelected, setIsCustomUnitSelected] = useState(false);
  const [isDiscountAllowed, setIsDiscountAllowed] = useState(true);

  // قائمة الفروع المستبعد منها الفرع الحالي لضمان عدم التحويل لنفس الفرع
  const targetBranchesList = useMemo(() => {
    if (!Array.isArray(availableBranches)) return [];
    return availableBranches.filter(b => {
      if (!b) return false;
      const bId = String(b.id || b.branchId || '');
      const bName = String(b.name || b.branch_name || '').trim().toLowerCase();
      const curId = String(branchId || '');
      const curName = String(branch?.name || '').trim().toLowerCase();

      if (curId && bId && curId === bId) return false;
      if (curName && bName && curName === bName) return false;
      return true;
    });
  }, [availableBranches, branchId, branch]);

  // جلب موظفي الفرع المتاحين من الخادم والفروع النشطة وصلاحيات الخصم
  useEffect(() => {
    let isMounted = true;

    outstockGetBranchPermissions()
      .then((res) => {
        if (isMounted && res?.success && res.permissions) {
          const p = res.permissions;
          const isGloballyDisabled = Boolean(p.global_discounts_disabled);
          const branchRule = p.branch_rules?.[branchId];
          const isBranchDisabled = branchRule?.can_apply_discount === false;
          if (isGloballyDisabled || isBranchDisabled) {
            setIsDiscountAllowed(false);
            setDiscountType('none');
            setDiscountValue('');
          } else {
            setIsDiscountAllowed(true);
          }
        }
      })
      .catch(() => {});
    outstockGetEmployees(branchId)
      .then((res) => {
        if (isMounted && res?.success && Array.isArray(res.employees)) {
          setServerEmployees(res.employees);
        }
      })
      .catch(() => {});

    outstockGetBranches()
      .then((res) => {
        if (isMounted && res?.success) {
          const list = res.branches || res.hrBranches || [];
          setAvailableBranches(list);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [branchId]);

  const eligiblePharmacists = useMemo(() => {
    // 1. الأولوية للموظفين العائدين من الخادم
    if (serverEmployees && serverEmployees.length > 0) {
      return serverEmployees;
    }

    // 2. الرجوع للكاش المحلي لمنظومة الرواتب
    try {
      const raw = localStorage.getItem('pharmacy-tracker-data');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const emps = Array.isArray(parsed?.employees) ? parsed.employees : [];

      const branchEmps = emps.filter((emp) => {
        if (!emp || emp.isTerminated || emp.status === 'تم الاستقالة' || emp.status === 'مفصول') return false;
        const job = `${emp.jobTitle || ''} ${emp.role || ''} ${emp.department || ''}`;
        if (DELIVERY_ROLE_REGEX.test(job)) return false;

        if (branchId) {
          return String(emp.branchId) === String(branchId) || String(emp.branch) === String(branchId);
        }
        return true;
      });

      if (branchEmps.length > 0) return branchEmps;

      return emps.filter((emp) => {
        if (!emp || emp.isTerminated || emp.status === 'تم الاستقالة' || emp.status === 'مفصول') return false;
        const job = `${emp.jobTitle || ''} ${emp.role || ''} ${emp.department || ''}`;
        return !DELIVERY_ROLE_REGEX.test(job);
      });
    } catch (e) {
      return [];
    }
  }, [serverEmployees, branchId]);

  // ── 6. الحسابات المالية وموعد الاستلام ──
  const [paidAmount, setPaidAmount] = useState('');
  const [discountType, setDiscountType] = useState('none'); // 'none' | 'amount' | 'percentage'
  const [discountValue, setDiscountValue] = useState('');
  const [expectedPickupDate, setExpectedPickupDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [expectedPickupTime, setExpectedPickupTime] = useState('مساءً (بعد 5:00 عصراً)');
  const [responsiblePharmacist, setResponsiblePharmacist] = useState(
    defaultPharmacist || (eligiblePharmacists.length > 0 ? eligiblePharmacists[0].name : 'د. صيدلي الفرع')
  );
  const [customPharmacist, setCustomPharmacist] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // تحديث الصيدلي المسؤول الافتراضي فور تحميل الموظفين
  useEffect(() => {
    if ((!responsiblePharmacist || responsiblePharmacist === 'د. صيدلي الفرع') && eligiblePharmacists.length > 0) {
      setResponsiblePharmacist(eligiblePharmacists[0].name);
    }
  }, [eligiblePharmacists, responsiblePharmacist]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // دالة مساعدة لتنبيه الحقل الخاطئ وتحريك الشاشة إليه بمربع أحمر نابض
  const highlightAndScrollTo = (elementId, message) => {
    setErrorMsg(message);
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus?.();
      el.classList.add('outstock-pulse-error');
      setTimeout(() => {
        el.classList.remove('outstock-pulse-error');
      }, 4500);
    }
  };

  // بحث دقيق عن العميل عند اكتمال 11 رقماً
  const handleSearchCustomer = async (term) => {
    const clean = String(term || '').replace(/\D/g, '').trim();
    if (clean.length !== 11) return;

    setIsSearchingCustomer(true);
    setErrorMsg('');
    try {
      const res = await outstockGetCustomers({ search: clean });
      if (res?.success && Array.isArray(res.customers)) {
        const found = res.customers.find(
          (c) => String(c.whatsapp_phone || '').replace(/\D/g, '') === clean
        );
        if (found) {
          setSelectedCustomer(found);
          setCustomerName(found.full_name || '');
          setWhatsappPhone(clean);
          setLandlinePhone(found.landline_phone || '');
          setAddress(found.address || '');
          if (found.zone) setSelectedZone(found.zone);
          setCustomerPermanentNotes(found.notes || '');
          setIsNewCustomer(false);
          return;
        }
      }
      // إذا لم يتطابق، نعينه كعميل جديد ونفرغ الاسم القديم لمنع الخلط بين العملاء
      setSelectedCustomer(null);
      setIsNewCustomer(true);
      setCustomerPermanentNotes('');
    } catch (e) {
      console.warn('Search customer error:', e);
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // معالجة كتابة رقم الهاتف (أرقام فقط + تنبيه فوري + تفريغ الحقول عند التغيير)
  const handlePhoneChange = (val) => {
    const digitsOnly = String(val || '').replace(/\D/g, '').slice(0, 11);
    setWhatsappPhone(digitsOnly);
    setSearchPhone(digitsOnly);
    setErrorMsg('');

    // تفريغ بيانات العميل السابق فوراً إذا تم تعديل الرقم
    if (selectedCustomer && digitsOnly !== String(selectedCustomer.whatsapp_phone || '').replace(/\D/g, '')) {
      setSelectedCustomer(null);
      setCustomerName('');
      setAddress('');
      setSelectedZone('');
      setCustomerPermanentNotes('');
      setLandlinePhone('');
    }

    // بحث فوري وتلقائي عند اكتمال 11 رقماً
    if (digitsOnly.length === 11) {
      handleSearchCustomer(digitsOnly);
    }
  };

  // بحث تلقائي برقم العميل الممرر عند الفتح
  useEffect(() => {
    if (initialCustomerPhone) {
      const clean = String(initialCustomerPhone).replace(/\D/g, '').slice(0, 11);
      setSearchPhone(clean);
      setWhatsappPhone(clean);
      if (clean.length === 11) {
        handleSearchCustomer(clean);
      }
    }
  }, [initialCustomerPhone]);

  // التحكم في قائمة الأصناف مع التركيز التلقائي
  const handleAddItem = () => {
    // عدم إضافة صنف جديد إلا بعد تحديد نوع الصنف الحالي
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.itemType) {
        highlightAndScrollTo(`field-item-type-${i}`, `يرجى تحديد نوع الصنف #${i + 1} (${it.medicationName || 'الصنف الحالي'}) (دوائي 💊 أو مستحضرات 💄) أولاً قبل إضافة صنف جديد`);
        return;
      }
    }
    setErrorMsg('');
    const newIdx = items.length;
    setItems((prev) => [
      ...prev,
      {
        medicationName: '',
        unitType: 'pack',
        quantity: 1,
        unitPrice: '',
        isPriceEstimated: false,
        priceMin: '',
        priceMax: '',
        selectedMed: null,
        itemType: '' // لا يوجد اختيار افتراضي - يجب تحديده مع كل صنف جديد
      }
    ]);
    setTimeout(() => {
      if (itemInputRefs.current[newIdx]) {
        itemInputRefs.current[newIdx].focus();
      }
    }, 60);
  };

  const handleRemoveItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    if (editingItemIndex === index) setEditingItemIndex(null);
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // تفعيل / إلغاء تفعيل السعر التقريبي
  const handleToggleEstimatePrice = (idx) => {
    setItems((prev) => {
      const next = [...prev];
      const it = next[idx];
      const willBeEstimated = !it.isPriceEstimated;
      let initialMin = it.priceMin;
      let initialMax = it.priceMax;

      if (willBeEstimated && (!initialMin || !initialMax)) {
        const p = Number(it.unitPrice || it.selectedMed?.public_price || 0);
        if (p > 0) {
          initialMin = (Math.round(p * 0.95 * 10) / 10).toFixed(2);
          initialMax = (Math.round(p * 1.05 * 10) / 10).toFixed(2);
        }
      }

      next[idx] = {
        ...it,
        isPriceEstimated: willBeEstimated,
        priceMin: willBeEstimated ? (initialMin || '') : '',
        priceMax: willBeEstimated ? (initialMax || '') : ''
      };
      return next;
    });
  };

  // اختيار دواء من القائمة
  const handleMedicationSelect = (index, displayName, medObj) => {
    setItems((prev) => {
      const next = [...prev];
      let autoPrice = '';
      if (medObj) {
        autoPrice = String(medObj.public_price ?? '');
      }

      next[index] = {
        ...next[index],
        medicationName: displayName,
        unitType: 'pack', // إلغاء الشريط والتعامل بالعلبة كاملة فقط 📦
        unitPrice: autoPrice,
        isPriceEstimated: false,
        priceMin: '',
        priceMax: '',
        selectedMed: medObj
      };
      return next;
    });
  };

  // معالجة ملف الصورة (من الرفع أو الإفلات أو اللصق)
  const handleProcessImageFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setMedicationImageUrl(event.target.result);
      setMedicationImageName(file.name || 'prescription_image.png');
      setErrorMsg('');
    };
    reader.onerror = () => {
      setErrorMsg('تعذر قراءة ملف الصورة');
    };
    reader.readAsDataURL(file);
  };

  // رفع صورة الدواء / الروشتة عبر مربع الاختيار
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleProcessImageFile(file);
  };

  // تطبيق رابط صورة مباشر
  const handleApplyDirectImageUrl = () => {
    if (!directImageUrl || !directImageUrl.trim()) return;
    setMedicationImageUrl(directImageUrl.trim());
    setMedicationImageName('رابط صورة مباشر');
    setShowImageUrlInput(false);
    setDirectImageUrl('');
    setErrorMsg('');
  };

  // دعم لصق الصورة مباشرة من الحافظة (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            handleProcessImageFile(file);
            e.preventDefault();
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleRemoveImage = () => {
    setMedicationImageUrl('');
    setMedicationImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // فتح درج تعديل بيانات الصنف (حجم العبوة والسعر)
  const handleToggleInlineEdit = (idx) => {
    if (editingItemIndex === idx) {
      setEditingItemIndex(null);
      setIsCustomUnitSelected(false);
    } else {
      const it = items[idx];
      setEditingItemIndex(idx);
      const uName = (it.selectedMed?.unit_name || 'علبة').trim();
      setInlineEditData({
        pack_size: it.selectedMed?.pack_size || 1,
        unit_name: uName,
        public_price: it.selectedMed?.public_price ? String(it.selectedMed.public_price) : it.unitPrice || ''
      });
      setIsCustomUnitSelected(!STANDARD_MED_UNITS.includes(uName) && Boolean(uName));
    }
  };

  // حفظ التعديلات السريعة على الصنف
  const handleSaveInlineEdit = (idx) => {
    const pub = parseFloat(inlineEditData.public_price);
    const pack = parseInt(inlineEditData.pack_size, 10) || 1;
    const finalUnitName = (inlineEditData.unit_name || 'علبة').trim();

    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      const updatedMed = {
        ...(current.selectedMed || {}),
        pack_size: pack,
        unit_name: finalUnitName,
        public_price: isNaN(pub) ? 0 : pub,
        unit_price: isNaN(pub) ? 0 : pub
      };

      next[idx] = {
        ...current,
        selectedMed: updatedMed,
        unitType: 'pack',
        unitPrice: String(isNaN(pub) ? current.unitPrice : pub)
      };
      return next;
    });

    setEditingItemIndex(null);
    setIsCustomUnitSelected(false);
  };

  // فتح نافذة إضافة دواء غير مسجل
  const handleOpenAddMedModal = (idx, typedText) => {
    setAddMedTargetIndex(idx);
    setAddMedInitialName(typedText || '');
    setIsAddMedModalOpen(true);
  };

  // عند نجاح إضافة دواء جديد بالكتالوج
  const handleMedicationAddedSuccess = (createdMed) => {
    if (addMedTargetIndex !== null && addMedTargetIndex >= 0 && addMedTargetIndex < items.length) {
      handleMedicationSelect(addMedTargetIndex, createdMed.trade_name_ar, createdMed);
    }
  };

  // ── طرق الدفع المتعددة والمقسمة ──
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState({
    cash: '',
    card: '',
    wallet: '',
    instapay: ''
  });

  // ── الحسابات المالية الدقيقة مع دعم السعر التقديري (من ... إلى ... ج.م) دون متوسط حسابي ──
  const hasEstimatedItems = items.some(
    (it) => it.isPriceEstimated && (parseFloat(it.priceMin || 0) > 0 || parseFloat(it.priceMax || 0) > 0)
  );

  let totalMin = 0;
  let totalMax = 0;

  items.forEach((it) => {
    const qty = parseInt(it.quantity || 1, 10);
    if (it.isPriceEstimated) {
      const pMin = parseFloat(it.priceMin || 0);
      const pMax = parseFloat(it.priceMax || pMin || 0);
      totalMin += qty * pMin;
      totalMax += qty * pMax;
    } else {
      const price = parseFloat(it.unitPrice || 0);
      totalMin += qty * price;
      totalMax += qty * price;
    }
  });

  const discVal = parseFloat(discountValue || 0);
  let discountMin = 0;
  let discountMax = 0;
  if (discountType === 'percentage') {
    discountMin = (totalMin * discVal) / 100;
    discountMax = (totalMax * discVal) / 100;
  } else if (discountType === 'amount') {
    discountMin = discVal;
    discountMax = discVal;
  }

  const netMin = Math.max(0, totalMin - discountMin);
  const netMax = Math.max(0, totalMax - discountMax);

  // احتساب إجمالي المدفوع
  const totalSplitPaid =
    parseFloat(paymentSplits.cash || 0) +
    parseFloat(paymentSplits.card || 0) +
    parseFloat(paymentSplits.wallet || 0) +
    parseFloat(paymentSplits.instapay || 0);

  const effectivePaid = useSplitPayment ? totalSplitPaid : parseFloat(paidAmount || 0);

  const remainingMin = Math.max(0, netMin - effectivePaid);
  const remainingMax = Math.max(0, netMax - effectivePaid);

  // إرسال / تحديث الطلب
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const finalName = String(customerName || '').trim();
    const finalPhone = String(whatsappPhone || '').replace(/\D/g, '');

    // 1. التحقق من رقم الهاتف (إجباري 11 رقماً حصراً)
    if (!finalPhone || finalPhone.length !== 11) {
      highlightAndScrollTo(
        'order-customer-phone',
        `رقم هاتف العميل غير مكتمل! يجب أن يتكون من 11 رقماً بالضبط (المُدخل حالياً: ${finalPhone.length} أرقام).`
      );
      return;
    }

    // 2. التحقق من اسم العميل
    if (!finalName) {
      highlightAndScrollTo('order-customer-name', 'يرجى إدخال اسم العميل');
      return;
    }

    // 3. التحقق من اختيار المنطقة / الحي إجبارياً
    if (!selectedZone) {
      highlightAndScrollTo('order-customer-zone', 'يرجى اختيار المنطقة / الحي للعميل إجبارياً قبل حفظ الطلب');
      return;
    }

    if (deliveryType === 'other_branch_pickup' && !deliveryTargetBranch) {
      setErrorMsg('يرجى تحديد الفرع الآخر المراد تحويل الاستلام إليه');
      return;
    }

    const validItems = items.filter((it) => it.medicationName && String(it.medicationName).trim().length > 0);
    if (validItems.length === 0) {
      setErrorMsg('يرجى إدخال اسم دواء واحد على الأقل في الطلب');
      return;
    }

    // 4. التحقق من تحديد نوع الصنف لكل صنف مضاف
    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      if (!it.itemType) {
        highlightAndScrollTo(
          `field-item-type-${i}`,
          `يرجى تحديد نوع الصنف #${i + 1} (${it.medicationName || 'الصنف'}) (دوائي 💊 أو مستحضرات 💄) إجبارياً`
        );
        return;
      }
    }

    // التحقق من الأسعار التقديرية
    for (const it of validItems) {
      if (it.isPriceEstimated) {
        const minP = parseFloat(it.priceMin || 0);
        const maxP = parseFloat(it.priceMax || 0);
        if (minP <= 0 && maxP <= 0) {
          setErrorMsg(`يرجى إدخال نطاق السعر التقديري (من ... إلى) للصنف "${it.medicationName}"`);
          return;
        }
      }
    }

    const finalPharmacist = orderReceiver?.name || defaultPharmacist || 'د. صيدلي الفرع';

    // حساب تصنيف الطلب التراكمي من تصنيفات البنود
    const hasCosmetics = validItems.some((it) => it.itemType === 'cosmetics');
    const hasMeds = validItems.some((it) => it.itemType === 'medication');
    const computedCategory = hasCosmetics && hasMeds ? 'mixed' : (hasCosmetics ? 'cosmetics' : 'medication');

    setIsSubmitting(true);
    try {
      const payload = {
        branchId,
        orderCategory: computedCategory, // 'medication' | 'cosmetics' | 'mixed'
        orderReceiverCode: orderReceiver?.code || null,
        orderReceiverName: orderReceiver?.name || finalPharmacist,
        medicationImageUrl: validItems[0]?.imageUrl || medicationImageUrl || null,
        paymentSplits: useSplitPayment ? paymentSplits : null,
        customer: {
          id: selectedCustomer?.id || null,
          fullName: finalName,
          whatsappPhone: finalPhone,
          landlinePhone: landlinePhone ? String(landlinePhone).trim() : null,
          address: address ? String(address).trim() : null,
          zone: selectedZone || null,
          notes: customerPermanentNotes ? String(customerPermanentNotes).trim() : null
        },
        items: validItems.map((it) => {
          const isEst = Boolean(it.isPriceEstimated);
          const pMin = isEst ? parseFloat(it.priceMin || 0) : null;
          const pMax = isEst ? parseFloat(it.priceMax || 0) : null;
          const avgP = isEst ? ((pMin + (pMax || pMin)) / 2) : parseFloat(it.unitPrice || 0);
          return {
            id: it.id || undefined,
            medicationName: String(it.medicationName).trim(),
            unitType: 'pack', // إلغاء الشريط: العلبة كاملة دائماً 📦
            quantity: parseInt(it.quantity || 1, 10),
            unitPrice: avgP,
            isPriceEstimated: isEst,
            priceMin: pMin,
            priceMax: pMax,
            itemType: it.itemType || 'medication',
            imageUrl: it.imageUrl || null,
            itemLink: it.itemLink || null
          };
        }),
        paidAmount: effectivePaid,
        discountType,
        discountValue: discVal,
        expectedPickupDate,
        expectedPickupTime,
        responsiblePharmacist: finalPharmacist,
        customerNotes,
        zone: selectedZone || null,
        deliveryType,
        deliveryTargetBranch: deliveryType === 'other_branch_pickup' ? deliveryTargetBranch : null,
        deliveryTargetBranchId: deliveryType === 'other_branch_pickup' ? deliveryTargetBranchId : null
      };

      const res = editingOrder
        ? await outstockUpdateOrder(editingOrder.id, payload)
        : await outstockCreateOrder(payload);

      if (res?.success && (res.order || editingOrder)) {
        const orderData = res.order || { ...editingOrder, ...payload };
        try {
          broadcastOutstockLocalMessage({
            type: editingOrder ? 'outstock:order_updated' : 'outstock:order_created',
            orderId: orderData.id,
            branchId: payload.branchId,
            timestamp: new Date().toISOString()
          });
          window.dispatchEvent(
            new CustomEvent(editingOrder ? 'outstock:order_updated' : 'outstock:order_created', { detail: orderData })
          );
        } catch (_) {}

        if (editingOrder) {
          onOrderUpdated?.(orderData);
          showToast?.('✅ تم تحديث بيانات الطلب بنجاح');
        } else {
          onOrderCreated?.(orderData);
          showToast?.('✅ تم تسجيل الطلب وإرساله لإدارة المشتريات بنجاح');
        }
        onSuccess?.(orderData);
        onClose();
      } else {
        setErrorMsg(res?.error || 'حدث خطأ أثناء حفظ الطلب، يرجى المحاولة ثانية');
      }
    } catch (err) {
      setErrorMsg('تعذر حفظ الطلب، تحقق من الاتصال بالخادم');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="outstock-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1040px',
          maxHeight: '94vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.3)',
          direction: 'rtl',
          border: '1px solid var(--outstock-border-subtle, #e2e8f0)'
        }}
      >
        {/* رأس النافذة العصري - تصميم مؤسسي فائق الأناقة */}
        <div
          style={{
            padding: '16px 24px',
            background: '#ffffff',
            borderBottom: '1px solid var(--outstock-border-subtle, #e2e8f0)',
            color: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Pill size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>
                تسجيل طلب عميل جديد (نواقص أدوية)
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                ربط ذكي بكتالوج الأدوية، حسابات دقيقة للمقدم والمتبقي، وإرسال فوري للمشتريات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#64748b',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* جسم النافذة */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflowY: 'auto',
            padding: '22px 26px',
            gap: '18px'
          }}
        >
          {/* ── 0. كود الموظف المستلم + تصنيف الطلب + رفع صورة الروشتة/الدواء ── */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            {/* شريط الموظف المستلم وتصنيف الأصناف */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '12.5px',
                    fontWeight: '800',
                    color: '#0f766e',
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} color="#0d9488" />
                  <span>تصنيف الأصناف: حدد نوع كل صنف بالأسفل (💊 دواء / 💄 مستحضرات)</span>
                </span>
              </div>

              {/* شارة كود الموظف المستلم الموثق */}
              {orderReceiver ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '10px',
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <ShieldCheck size={18} color="#16a34a" />
                  <div style={{ fontSize: '12.5px' }}>
                    <span style={{ color: '#166534', fontWeight: '700' }}>المحرر المستلم: </span>
                    <strong style={{ color: '#14532d' }}>{orderReceiver.name}</strong>
                    <span
                      style={{
                        marginRight: '6px',
                        background: '#dcfce7',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        color: '#15803d'
                      }}
                    >
                      كود: {orderReceiver.code} 🔒
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── 1. بيانات العميل والبحث الذكي ── */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 18px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: '900',
                  color: '#0f766e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Search size={16} />
                <span>بيانات العميل (بحث ذكي بالهاتف أو الاسم)</span>
              </span>
              {selectedCustomer ? (
                <span
                  style={{
                    fontSize: '12px',
                    color: '#059669',
                    fontWeight: '800',
                    background: '#dcfce7',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0'
                  }}
                >
                  <UserCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> عميل مسجل (
                  {selectedCustomer.customer_code})
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '12px',
                    color: '#0284c7',
                    fontWeight: '800',
                    background: '#e0f2fe',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    border: '1px solid #bae6fd'
                  }}
                >
                  <UserPlus size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> عميل جديد
                </span>
              )}
            </div>

            {/* تنبيه ملحوظة العميل المسجلة مسبقاً */}
            {selectedCustomer?.notes && (
              <div
                style={{
                  marginBottom: '14px',
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '2px solid #f59e0b',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
                }}
              >
                <div
                  style={{
                    background: '#fef3c7',
                    border: '1.5px solid #f59e0b',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <AlertCircle size={20} color="#b45309" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '900', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️ تنبيه: ملحوظة هامة مسجلة مسبقاً على هذا العميل:</span>
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#78350f', marginTop: '4px', lineHeight: 1.5, background: 'rgba(255,255,255,0.85)', padding: '6px 12px', borderRadius: '8px', border: '1px dashed #d97706' }}>
                    "{selectedCustomer.notes}"
                  </div>
                </div>
              </div>
            )}

            {/* مربع البحث السريع */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                placeholder="ابحث برقم هاتف الواتساب أو اسم العميل..."
                value={searchPhone}
                onChange={(e) => {
                  setSearchPhone(e.target.value);
                  handleSearchCustomer(e.target.value);
                }}
                className="outstock-form-input"
                style={{ flex: 1, borderColor: '#0d9488' }}
              />
              <button
                type="button"
                onClick={() => handleSearchCustomer(searchPhone)}
                className="outstock-btn outstock-btn-primary"
                style={{ padding: '0 18px', flexShrink: 0 }}
              >
                <Search size={16} />
                <span>{isSearchingCustomer ? '...' : 'بحث'}</span>
              </button>
            </div>

            {/* حقول بيانات العميل */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                  اسم العميل * :
                </label>
                <input
                  id="order-customer-name"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="الاسم ثلاثي أو ثنائي"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="outstock-form-input"
                />
              </div>

              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                  رقم هاتف الواتساب (فريد) * :
                </label>
                <input
                  id="order-customer-phone"
                  type="tel"
                  inputMode="numeric"
                  required
                  autoComplete="off"
                  placeholder="01xxxxxxxxx (11 رقماً)"
                  value={whatsappPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className="outstock-form-input"
                  dir="ltr"
                  style={{
                    textAlign: 'right',
                    borderColor: whatsappPhone && whatsappPhone.length < 11 ? '#ef4444' : whatsappPhone.length === 11 ? '#10b981' : undefined
                  }}
                />
                {whatsappPhone && whatsappPhone.length < 11 && (
                  <div
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: '#dc2626',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      marginTop: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>⚠️ رقم الهاتف ناقص (يجب إدخال 11 رقماً - المتبقي {11 - whatsappPhone.length} أرقام)</span>
                  </div>
                )}
                {whatsappPhone && whatsappPhone.length === 11 && (
                  <div
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: '#16a34a',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      marginTop: '5px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>✓ رقم الهاتف مكتمل وصحيح (11 رقماً)</span>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  رقم الهاتف الأرضي:
                </label>
                <input
                  type="tel"
                  placeholder="الهاتف الأرضي (إن وجد)"
                  value={landlinePhone}
                  onChange={(e) => setLandlinePhone(e.target.value)}
                  className="outstock-form-input"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>

              {/* حقل المنطقة / الحي الخاضع لإدارة المالك */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '4px' }}>
                  <MapPin size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> المنطقة / الحي * :
                </label>
                <select
                  id="order-customer-zone"
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="outstock-form-select"
                  style={{ fontWeight: '700' }}
                >
                  <option value="" disabled>-- اختر المنطقة / الحي إجبارياً --</option>
                  {deliveryZones.map((zoneName) => (
                    <option key={zoneName} value={zoneName}>
                      {zoneName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  عنوان السكن التفصيلي:
                </label>
                <input
                  type="text"
                  placeholder="الشارع، رقم العمارة، الشقة"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="outstock-form-input"
                />
              </div>
            </div>

            {/* ملحوظة العميل الدائمة */}
            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Tag size={13} color="#0d9488" />
                <span>ملحوظة خاصة بالعميل (تُحفظ في ملفه وتظهر كتنبيه عند أي طلب جديد له):</span>
              </label>
              <textarea
                rows={2}
                placeholder="اكتب أي ملاحظة تخص هذا العميل (مثلاً: حساس للبنسلين، يفضل الاستلام مساءً، عميل VIP، لا يقبل بدائل...)"
                value={customerPermanentNotes}
                onChange={(e) => setCustomerPermanentNotes(e.target.value)}
                className="outstock-form-input"
                style={{ resize: 'vertical', borderColor: customerPermanentNotes ? '#0d9488' : undefined }}
              />
            </div>
          </div>

          {/* ── 2. بنود الأدوية (العلبة كاملة فقط 📦 + السعر التقديري) ── */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label
                  style={{
                    fontSize: '14.5px',
                    fontWeight: '900',
                    color: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Pill size={17} color="#0d9488" />
                  <span>الأصناف المطلوبة في هذا الطلب ({items.length})</span>
                </label>
                <span
                  style={{
                    fontSize: '11px',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontWeight: '800'
                  }}
                >
                  📦 الطلب بالعلبة كاملة حصراً
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="outstock-btn outstock-btn-secondary"
                style={{ fontSize: '13px', padding: '7px 16px', fontWeight: '800' }}
              >
                <Plus size={16} />
                <span>إضافة صنف آخر</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map((it, idx) => {
                const isEditingThisItem = editingItemIndex === idx;

                return (
                  <div
                    key={idx}
                    className="outstock-med-item-card"
                    style={{
                      background: '#ffffff',
                      border: it.isPriceEstimated ? '1.5px solid #f59e0b' : '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                      position: 'relative',
                      zIndex: items.length - idx
                    }}
                  >
                    {/* الصف الأول: حقل اسم الصنف بعرض كامل وفسيح مع تصنيف نوع الصنف */}
                    <div style={{ width: '100%', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                        <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                          <Pill size={14} />
                          <span>اسم الصنف الدوائي / المستحضر * :</span>
                        </label>
                        {/* تصنيف الصنف: دوائي أو مستحضرات تجميل (إلزامي بدون اختيار افتراضي) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!it.itemType && (
                            <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: '800', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px', border: '1px dashed #f87171' }}>
                              ⚠️ حدد النوع *
                            </span>
                          )}
                          <div
                            id={"field-item-type-" + idx}
                            style={{ display: 'flex', gap: '4px', background: !it.itemType ? '#fff7ed' : '#f1f5f9', padding: '2px', borderRadius: '8px', border: !it.itemType ? '1.5px dashed #f97316' : '1px solid #cbd5e1' }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                handleItemChange(idx, 'itemType', 'medication');
                                setErrorMsg('');
                              }}
                              style={{
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: it.itemType === 'medication' ? '#059669' : 'transparent',
                                color: it.itemType === 'medication' ? '#ffffff' : '#64748b',
                                boxShadow: it.itemType === 'medication' ? '0 1px 3px rgba(5, 150, 105, 0.3)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Pill size={12} />
                              <span>💊 دواء</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleItemChange(idx, 'itemType', 'cosmetics');
                                setErrorMsg('');
                              }}
                              style={{
                                padding: '3px 10px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: it.itemType === 'cosmetics' ? '#db2777' : 'transparent',
                                color: it.itemType === 'cosmetics' ? '#ffffff' : '#64748b',
                                boxShadow: it.itemType === 'cosmetics' ? '0 1px 3px rgba(219, 39, 119, 0.3)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Sparkles size={12} />
                              <span>💄 مستحضرات</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <MedicationAutocompleteInput
                        inputRef={(el) => (itemInputRefs.current[idx] = el)}
                        value={it.medicationName}
                        unitType="pack"
                        selectedMed={it.selectedMed}
                        onMedicationSelect={(displayName, medObj) => handleMedicationSelect(idx, displayName, medObj)}
                        onTextChange={(text) => handleItemChange(idx, 'medicationName', text)}
                        onAddNewMedication={(typedText) => handleOpenAddMedModal(idx, typedText)}
                        placeholder="ابحث باسم الدواء، المادة الفعالة، أو الباركود..."
                        required
                      />
                    </div>

                    {/* الصف الثاني: تفاصيل الصنف (الوحدة، الكمية، سعر العلبة الرسمي (يُخفى بالسعر التقريبي لمنع التكرار)، إجمالي الصنف، وزر الحذف) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: it.isPriceEstimated ? '1.2fr 1fr 1.6fr auto' : '1.2fr 1fr 1.4fr 1.4fr auto',
                        gap: '10px',
                        alignItems: 'end'
                      }}
                    >
                      {/* الوحدة المطلوبة */}
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          الوحدة المطلوبة
                        </label>
                        <div
                          style={{
                            height: '40px',
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '12.5px',
                            color: '#0f766e',
                            gap: '4px'
                          }}
                        >
                          <span>علبة كاملة 📦</span>
                        </div>
                      </div>

                      {/* الكمية */}
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          الكمية (بالعلبة)
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          placeholder="الكمية"
                          value={it.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '40px', textAlign: 'center', fontWeight: 'bold' }}
                        />
                      </div>

                      {/* سعر العلبة الرسمي (يُخفى عند تفعيل السعر التقريبي لمنع التكرار مع نطاق من-إلى) */}
                      {!it.isPriceEstimated && (
                        <div>
                          <label style={{ fontSize: '11px', color: '#0369a1', fontWeight: '800', marginBottom: '3px', display: 'block' }}>
                            سعر العلبة الرسمي:
                          </label>
                          <div
                            style={{
                              height: '40px',
                              background: '#f0fdfa',
                              border: '1px solid #99f6e4',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '900',
                              fontSize: '13px',
                              color: '#0f766e',
                              padding: '0 4px'
                            }}
                            title="السعر معتمد رسمياً من الكتالوج ومحمي من التعديل العشوائي داخل الفرع"
                          >
                            {Number(it.unitPrice || it.selectedMed?.public_price || 0) > 0 ? (
                              <span>{Number(it.unitPrice || it.selectedMed?.public_price || 0).toFixed(2)} ج.م</span>
                            ) : (
                              <span style={{ color: '#d97706', fontSize: '11px' }}>بانتظار تسعير المشتريات</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* إجمالي الصنف */}
                      <div>
                        <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          إجمالي الصنف:
                        </label>
                        <div
                          style={{
                            height: '40px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '900',
                            fontSize: it.isPriceEstimated ? '11.5px' : '13px',
                            color: '#0f172a',
                            padding: '0 4px'
                          }}
                        >
                          {it.isPriceEstimated
                            ? `من ${(Number(it.quantity || 1) * Number(it.priceMin || 0)).toFixed(2)} إلى ${(Number(it.quantity || 1) * Number(it.priceMax || it.priceMin || 0)).toFixed(2)} ج.م`
                            : `${((Number(it.quantity) || 1) * Number(it.unitPrice || it.selectedMed?.public_price || 0)).toFixed(2)} ج.م`}
                        </div>
                      </div>

                      {/* زر حذف الصنف */}
                      <div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length === 1}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                            opacity: items.length === 1 ? 0.35 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="حذف هذا الصنف"
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </div>
                    </div>

                    {/* شريط السعر التقريبي وزر التفعيل/الإلغاء */}
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {/* زر تفعيل / إلغاء تفعيل السعر التقريبي */}
                      <button
                        type="button"
                        onClick={() => handleToggleEstimatePrice(idx)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          border: it.isPriceEstimated ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                          background: it.isPriceEstimated ? '#fef3c7' : '#f8fafc',
                          color: it.isPriceEstimated ? '#92400e' : '#475569'
                        }}
                      >
                        <Sparkles size={14} color={it.isPriceEstimated ? '#b45309' : '#64748b'} />
                        <span>{it.isPriceEstimated ? '✓ إلغاء السعر التقريبي' : '+ تفعيل وضع سعر تقريبي (من - إلى)'}</span>
                      </button>

                      {/* حقول إدخال من سعر وإلى سعر تظهر عند التفعيل */}
                      {it.isPriceEstimated ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '8px',
                            padding: '4px 12px'
                          }}
                        >
                          <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#92400e' }}>من:</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={it.priceMin}
                            onChange={(e) => handleItemChange(idx, 'priceMin', e.target.value)}
                            className="outstock-form-input"
                            style={{
                              width: '85px',
                              height: '32px',
                              padding: '2px 6px',
                              textAlign: 'center',
                              fontWeight: '900',
                              color: '#b45309',
                              background: '#ffffff',
                              border: '1px solid #fcd34d'
                            }}
                            required
                          />
                          <span style={{ fontSize: '11px', color: '#92400e', fontWeight: '700' }}>ج.م</span>

                          <span style={{ fontSize: '11.5px', fontWeight: '800', color: '#92400e', marginRight: '6px' }}>إلى:</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={it.priceMax}
                            onChange={(e) => handleItemChange(idx, 'priceMax', e.target.value)}
                            className="outstock-form-input"
                            style={{
                              width: '85px',
                              height: '32px',
                              padding: '2px 6px',
                              textAlign: 'center',
                              fontWeight: '900',
                              color: '#b45309',
                              background: '#ffffff',
                              border: '1px solid #fcd34d'
                            }}
                            required
                          />
                          <span style={{ fontSize: '11px', color: '#92400e', fontWeight: '700' }}>ج.م للعلبة</span>
                        </div>
                      ) : (
                        /* معلومة استرشادية عند عدم تفعيل السعر التقريبي */
                        (() => {
                          const p = Number(it.unitPrice || it.selectedMed?.public_price || 0);
                          if (p <= 0) return null;
                          const minP = Math.round(p * 0.95 * 10) / 10;
                          const maxP = Math.round(p * 1.05 * 10) / 10;
                          return (
                            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: '600' }}>
                              (متوسط النطاق التقديري: من {minP.toFixed(2)} إلى {maxP.toFixed(2)} ج.م)
                            </span>
                          );
                        })()
                      )}
                    </div>

                    {/* شريط المرفقات الخاص بالصنف: إرفاق صورة مباشرة أو رابط ويب خارجي */}
                    <div
                      style={{
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px dashed #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      {/* إرفاق صورة للصنف */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 12px',
                            background: it.imageUrl ? '#f0fdf4' : '#f8fafc',
                            border: it.imageUrl ? '1.5px solid #86efac' : '1.5px dashed #cbd5e1',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '700',
                            color: it.imageUrl ? '#166534' : '#475569'
                          }}
                        >
                          <Camera size={14} color={it.imageUrl ? '#16a34a' : '#64748b'} />
                          <span>{it.imageUrl ? '📷 تغيير صورة الصنف' : '📷 إرفاق صورة لهذا الصنف'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 5 * 1024 * 1024) {
                                  setErrorMsg('حجم صورة الصنف كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  handleItemChange(idx, 'imageUrl', ev.target.result);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>

                        {it.imageUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div
                              onClick={() => {
                                setPreviewModalImageUrl(it.imageUrl);
                                setIsPreviewImageOpen(true);
                              }}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                overflow: 'hidden',
                                border: '1.5px solid #0d9488',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="اضغط لمعاينة الصورة بالحجم الكامل"
                            >
                              <img src={it.imageUrl} alt="الصنف" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: '#16a34a' }}>تم الإرفاق ✅</span>
                            <button
                              type="button"
                              onClick={() => handleItemChange(idx, 'imageUrl', '')}
                              style={{
                                background: '#fee2e2',
                                border: '1px solid #fca5a5',
                                borderRadius: '6px',
                                color: '#b91c1c',
                                padding: '3px 8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '11px'
                              }}
                              title="حذف صورة الصنف"
                            >
                              <Trash2 size={12} />
                              <span>حذف</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* رابط الصنف على موقع/إنترنت */}
                      <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                          <LinkIcon size={13} color="#0284c7" />
                          <span>رابط الصنف (إن وجد):</span>
                        </label>
                        <input
                          type="url"
                          dir="ltr"
                          placeholder="https://..."
                          value={it.itemLink || ''}
                          onChange={(e) => handleItemChange(idx, 'itemLink', e.target.value)}
                          className="outstock-form-input"
                          style={{ height: '32px', fontSize: '12px', flex: 1 }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. الحسابات المالية وطرق الدفع المقسمة ── */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '900', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <DollarSign size={18} color="#0d9488" />
                <span>الحساب المالي، الخصم، وطرق الدفع</span>
              </div>

              {/* تبديل طرق الدفع المقسمة */}
              <button
                type="button"
                onClick={() => setUseSplitPayment(!useSplitPayment)}
                style={{
                  background: useSplitPayment ? '#dcfce7' : '#f1f5f9',
                  border: useSplitPayment ? '1.5px solid #86efac' : '1px solid #cbd5e1',
                  color: useSplitPayment ? '#15803d' : '#475569',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CreditCard size={14} />
                <span>{useSplitPayment ? '✓ دفع مقسم (كاش + فيزا)' : 'تفعيل الدفع المقسم (Multi-tender)'}</span>
              </button>
            </div>

            {/* صف الدفع والمقدم */}
            {!useSplitPayment ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    المبلغ المدفوع (عربون العميل كاش):
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="outstock-form-input"
                    style={{ fontWeight: 'bold', color: '#059669', fontSize: '15px' }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>
                      نوع الخصم:
                    </label>
                    {!isDiscountAllowed && (
                      <span style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Lock size={11} /> مقفل للفرع
                      </span>
                    )}
                  </div>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value)}
                    disabled={!isDiscountAllowed}
                    className="outstock-form-select"
                    style={{ opacity: !isDiscountAllowed ? 0.65 : 1, cursor: !isDiscountAllowed ? 'not-allowed' : 'pointer' }}
                  >
                    <option value="none">بدون خصم</option>
                    <option value="amount">مبلغ ثابت (ج.م)</option>
                    <option value="percentage">نسبة مئوية (%)</option>
                  </select>
                </div>

                {discountType !== 'none' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      قيمة الخصم:
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="القيمة"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="outstock-form-input"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* حقول الدفع المقسم (كاش / فيزا / محفظة إلكترونية / إنستاباي) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <Coins size={13} />
                      <span>مدفوع نقدي (كاش):</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={paymentSplits.cash}
                      onChange={(e) => setPaymentSplits({ ...paymentSplits, cash: e.target.value })}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', color: '#059669' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <CreditCard size={13} />
                      <span>فيزا / نقاط بيع:</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={paymentSplits.card}
                      onChange={(e) => setPaymentSplits({ ...paymentSplits, card: e.target.value })}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', color: '#0284c7' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <Smartphone size={13} />
                      <span>محفظة إلكترونية:</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={paymentSplits.wallet}
                      onChange={(e) => setPaymentSplits({ ...paymentSplits, wallet: e.target.value })}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', color: '#7c3aed' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                      <Zap size={13} />
                      <span>إنستاباي (InstaPay):</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={paymentSplits.instapay}
                      onChange={(e) => setPaymentSplits({ ...paymentSplits, instapay: e.target.value })}
                      className="outstock-form-input"
                      style={{ fontWeight: 'bold', color: '#d97706' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569' }}>
                        نوع الخصم:
                      </label>
                      {!isDiscountAllowed && (
                        <span style={{ fontSize: '10px', color: '#b91c1c', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Lock size={10} /> مقفل
                        </span>
                      )}
                    </div>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value)}
                      disabled={!isDiscountAllowed}
                      className="outstock-form-select"
                      style={{ minHeight: '36px', opacity: !isDiscountAllowed ? 0.65 : 1, cursor: !isDiscountAllowed ? 'not-allowed' : 'pointer' }}
                    >
                      <option value="none">بدون خصم</option>
                      <option value="amount">مبلغ ثابت (ج.م)</option>
                      <option value="percentage">نسبة مئوية (%)</option>
                    </select>
                  </div>

                  {discountType !== 'none' && (
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        قيمة الخصم:
                      </label>
                      <input
                        type="number"
                        step="any"
                        placeholder="القيمة"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="outstock-form-input"
                        style={{ minHeight: '36px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* بطاقات ملخص الحسابات (مع إظهار السعر التقديري ومتوسط السعر) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginTop: '14px'
              }}
            >
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: '600' }}>إجمالي الأصناف</span>
                <strong className="tabular-nums" style={{ fontSize: '14.5px', color: '#1e293b', fontFamily: 'var(--outstock-font-mono)' }}>
                  {hasEstimatedItems ? `من ${totalMin.toFixed(2)} إلى ${totalMax.toFixed(2)} ج.م` : `${totalMin.toFixed(2)} ج.م`}
                </strong>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', fontWeight: '600' }}>الصافي بعد الخصم</span>
                <strong className="tabular-nums" style={{ fontSize: '14.5px', color: '#059669', fontFamily: 'var(--outstock-font-mono)' }}>
                  {hasEstimatedItems ? `من ${netMin.toFixed(2)} إلى ${netMax.toFixed(2)} ج.م` : `${netMin.toFixed(2)} ج.م`}
                </strong>
              </div>

              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#047857', display: 'block', fontWeight: '600' }}>المدفوع (عربون)</span>
                <strong className="tabular-nums" style={{ fontSize: '15.5px', color: '#059669', fontFamily: 'var(--outstock-font-mono)' }}>{effectivePaid.toFixed(2)} ج.م</strong>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#b91c1c', display: 'block', fontWeight: '600' }}>المتبقي عند الاستلام</span>
                <strong className="tabular-nums" style={{ fontSize: '14.5px', color: '#dc2626', fontFamily: 'var(--outstock-font-mono)' }}>
                  {hasEstimatedItems ? `من ${remainingMin.toFixed(2)} إلى ${remainingMax.toFixed(2)} ج.م` : `${remainingMin.toFixed(2)} ج.م`}
                </strong>
              </div>
            </div>
          </div>

          {/* ── 4. طريقة تسليم الطلب للعميل (استلام من الفرع / دليفري / فرع آخر) ── */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 14px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Truck size={15} color="#0d9488" />
              <span>طريقة استلام / تسليم الطلب للعميل:</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: deliveryType === 'other_branch_pickup' ? '1.1fr 1.3fr' : '1fr', gap: '10px' }}>
              <div>
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  className="outstock-form-select"
                  style={{ fontWeight: '700' }}
                >
                  <option value="branch_pickup">🏪 استلام العميل من هذا الفرع</option>
                  <option value="home_delivery">🛵 توصيل دليفري للعميل (منزل/مقر العمل)</option>
                  <option value="other_branch_pickup">🔄 استلام من فرع آخر للصيدلية (تحويل طلب)</option>
                </select>
              </div>

              {deliveryType === 'other_branch_pickup' && (
                <div>
                  <select
                    value={deliveryTargetBranchId || deliveryTargetBranch}
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      const selectedObj = (availableBranches || []).find(
                        (b) => String(b.id || b.branchId) === String(selectedVal) || b.name === selectedVal
                      );
                      setDeliveryTargetBranchId(selectedObj ? String(selectedObj.id || selectedObj.branchId || '') : selectedVal);
                      setDeliveryTargetBranch(selectedObj ? (selectedObj.name || selectedObj.branch_name) : selectedVal);
                    }}
                    className="outstock-form-select"
                    style={{ fontWeight: '700', borderColor: (!deliveryTargetBranch && !deliveryTargetBranchId) ? '#f59e0b' : '#0d9488' }}
                    required
                  >
                    <option value="">-- اختر الفرع المراد تحويل الاستلام إليه --</option>
                    {targetBranchesList.map((b) => (
                      <option key={b.id || b.name} value={b.id || b.name}>
                        🏢 {b.name || b.branch_name} {b.address ? `(${b.address})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {deliveryType === 'other_branch_pickup' && (deliveryTargetBranch || deliveryTargetBranchId) && (
              <div
                style={{
                  marginTop: '10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '9px 14px',
                  fontSize: '12.5px',
                  color: '#1e40af',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Sparkles size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                <span>
                  🔄 سيتم إرسال هذا الطلب تلقائياً إلى فرع <strong>({deliveryTargetBranch})</strong>، وسيظهر في تبويبة <strong>"طلبات محولة من وإلى"</strong> في كلا الفرعين للمتابعة والتسليم للعميل.
                </span>
              </div>
            )}
          </div>

          {/* ── 5. موعد الاستلام ومسؤول الطلب (الصيادلة باستثناء الدليفري) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                تاريخ الاستلام المتوقع:
              </label>
              <input
                type="date"
                value={expectedPickupDate}
                onChange={(e) => setExpectedPickupDate(e.target.value)}
                className="outstock-form-input"
              />
            </div>

            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                فترة / وقت الاستلام:
              </label>
              <input
                type="text"
                placeholder="مثلاً: بعد العصر أو الساعة 7:00 م"
                value={expectedPickupTime}
                onChange={(e) => setExpectedPickupTime(e.target.value)}
                className="outstock-form-input"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
              ملاحظات العميل أو الطلب:
            </label>
            <input
              type="text"
              placeholder="أي توصيات خاصة بالجرعة، بدائل مقبولة، أو تعليمات التسليم..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="outstock-form-input"
            />
          </div>

          {/* ذيل النافذة */}
          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              marginTop: '8px'
            }}
          >
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: '12px 24px', fontWeight: '700' }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="outstock-btn outstock-btn-primary"
              style={{
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: '800',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
              }}
            >
              <span>{isSubmitting ? 'جاري الإرسال...' : 'حفظ وإرسال للمشتريات وطباعة الإيصال 🖨️'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* نافذة إضافة دواء غير مسجل المنبثقة من البحث */}
      <AddMedicationModal
        isOpen={isAddMedModalOpen}
        initialData={{ name: addMedInitialName }}
        onClose={() => setIsAddMedModalOpen(false)}
        onSaveSuccess={handleMedicationAddedSuccess}
      />

      {/* نافذة معاينة صورة الدواء بالحجم الكامل */}
      {isPreviewImageOpen && (previewModalImageUrl || medicationImageUrl) && (
        <div
          className="outstock-modal-backdrop"
          style={{ zIndex: 100000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => {
            setIsPreviewImageOpen(false);
            setPreviewModalImageUrl('');
          }}
        >
          <div
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setIsPreviewImageOpen(false);
                setPreviewModalImageUrl('');
              }}
              style={{
                position: 'absolute',
                top: '-14px',
                left: '-14px',
                background: '#ef4444',
                color: '#ffffff',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
              }}
            >
              <X size={18} />
            </button>
            <img
              src={previewModalImageUrl || medicationImageUrl}
              alt="Medication full size"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', objectFit: 'contain' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

