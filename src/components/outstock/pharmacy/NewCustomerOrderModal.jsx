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
  Building2
} from 'lucide-react';
import {
  outstockGetCustomers,
  outstockCreateOrder,
  outstockGetEmployees,
  outstockGetBranches
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

// فحص هل الصنف عبوة واحدة غير قابلة للتجزئة (شراب، نقط، مرهم، إلخ)
const isSingleUnitMed = (med) => {
  if (!med) return false;
  if (parseInt(med.pack_size || 1, 10) <= 1) return true;
  return /(شراب|معلق|نقط|مرهم|كريم|بخاخ|زجاجة|شامبو|لوشن|susp|syrup|drop|cream|oint)/i.test(med.dosage_form || '');
};

const getUnitOptionLabel = (med) => {
  if (!med) return 'شريط 💊';
  const name = (med.unit_name || '').trim();
  if (name) {
    if (name === 'أمبول' || name === 'فيال' || name === 'سرنجة جاهزة') return `${name} 💉`;
    if (name === 'كيس فوار' || name === 'كيس') return `${name} ✉️`;
    if (name === 'بخاخة') return `${name} 💨`;
    if (name === 'زجاجة' || name === 'نقط') return `${name} 🧴`;
    if (name === 'أنبوبة') return `${name} 🧴`;
    if (name === 'قلم إنسولين') return `${name} 🖊️`;
    return `${name} 💊`;
  }
  if (/(حقن|أمبول|ampoule)/i.test(med.dosage_form || '')) return 'أمبول 💉';
  if (/(فوار|أكياس|sachet)/i.test(med.dosage_form || '')) return 'كيس فوار ✉️';
  return 'شريط 💊';
};

const DELIVERY_ROLE_REGEX = /(طيار|دليفري|توصيل|سائق|مندوب توصيل|delivery|driver)/i;

/**
 * NewCustomerOrderModal.jsx
 * نافذة تسجيل طلب عميل جديد مع:
 * - تصميم فسيح وعصري (880px)
 * - إمكانية تعديل الصنف (العلبة والشرائط والسعر)
 * - إضافة دواء غير مسجل واختياره فوراً
 * - تحديد المنطقة / الحي من إعدادات المالك
 * - تحديد الصيدلي المسؤول من موظفي الفرع باستثناء عمال الدليفري
 * - تركيز المؤشر تلقائياً على حقل البحث عند إضافة بند جديد
 */
export default function NewCustomerOrderModal({ branchId, defaultPharmacist = '', onClose, onOrderCreated }) {
  // ── 1. حالة العميل ──
  const [searchPhone, setSearchPhone] = useState('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // حقول العميل الجديد
  const [customerName, setCustomerName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [landlinePhone, setLandlinePhone] = useState('');
  const [address, setAddress] = useState('');

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
  const [selectedZone, setSelectedZone] = useState('');

  // ── 3. بنود الأدوية ──
  const [items, setItems] = useState([
    { medicationName: '', unitType: 'pack', quantity: 1, unitPrice: '', selectedMed: null }
  ]);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [inlineEditData, setInlineEditData] = useState({ pack_size: 1, unit_name: 'شريط', public_price: '' });

  // مراجع حقول الإدخال للتركيز التلقائي
  const itemInputRefs = useRef([]);

  // ── 4. إضافة دواء غير مسجل ──
  const [isAddMedModalOpen, setIsAddMedModalOpen] = useState(false);
  const [addMedTargetIndex, setAddMedTargetIndex] = useState(null);
  const [addMedInitialName, setAddMedInitialName] = useState('');

  // ── 5. موظفو الفرع المستحقون (استبعاد عمال الدليفري والطيارين) ──
  const [serverEmployees, setServerEmployees] = useState([]);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [deliveryType, setDeliveryType] = useState('branch_pickup'); // 'branch_pickup' | 'home_delivery' | 'other_branch_pickup'
  const [deliveryTargetBranch, setDeliveryTargetBranch] = useState('');
  const [isCustomUnitSelected, setIsCustomUnitSelected] = useState(false);

  // جلب موظفي الفرع المتاحين من الخادم والفروع النشطة
  useEffect(() => {
    let isMounted = true;
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

  // تعيين أول منطقة افتراضية
  useEffect(() => {
    if (!selectedZone && deliveryZones.length > 0) {
      setSelectedZone(deliveryZones[0]);
    }
  }, [deliveryZones, selectedZone]);

  // بحث ذكي عن العميل عند كتابة رقم الهاتف أو الاسم
  const handleSearchCustomer = async (term) => {
    const clean = String(term || '').trim();
    if (!clean || clean.length < 3) return;

    setIsSearchingCustomer(true);
    setErrorMsg('');
    try {
      const res = await outstockGetCustomers({ search: clean });
      if (res?.success && Array.isArray(res.customers) && res.customers.length > 0) {
        const found = res.customers[0];
        setSelectedCustomer(found);
        setCustomerName(found.full_name);
        setWhatsappPhone(found.whatsapp_phone);
        setLandlinePhone(found.landline_phone || '');
        setAddress(found.address || '');
        if (found.zone) setSelectedZone(found.zone);
        setIsNewCustomer(false);
      } else {
        setSelectedCustomer(null);
        setIsNewCustomer(true);
        if (/^\d+$/.test(clean)) {
          setWhatsappPhone(clean);
        } else {
          setCustomerName(clean);
        }
      }
    } catch (e) {
      console.warn('Search customer error:', e);
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  // التحكم في قائمة الأصناف مع التركيز التلقائي
  const handleAddItem = () => {
    const newIdx = items.length;
    setItems((prev) => [
      ...prev,
      { medicationName: '', unitType: 'pack', quantity: 1, unitPrice: '', selectedMed: null }
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

  // اختيار دواء من القائمة
  const handleMedicationSelect = (index, displayName, medObj) => {
    setItems((prev) => {
      const next = [...prev];
      const isSingle = isSingleUnitMed(medObj);
      const targetUnitType = isSingle ? 'pack' : next[index]?.unitType || 'pack';

      let autoPrice = '';
      if (medObj) {
        if (targetUnitType === 'strip') {
          autoPrice = String(
            medObj.unit_price ?? (medObj.public_price / (medObj.pack_size || 1)).toFixed(2)
          );
        } else {
          autoPrice = String(medObj.public_price ?? '');
        }
      }

      next[index] = {
        ...next[index],
        medicationName: displayName,
        unitType: targetUnitType,
        unitPrice: autoPrice,
        selectedMed: medObj
      };
      return next;
    });
  };

  // التبديل بين سعر العلبة والشريط
  const handleUnitTypeChange = (index, newUnitType) => {
    setItems((prev) => {
      const next = [...prev];
      const it = next[index];
      let newPrice = it.unitPrice;

      if (it.selectedMed) {
        if (newUnitType === 'strip') {
          newPrice = String(
            it.selectedMed.unit_price ?? (it.selectedMed.public_price / (it.selectedMed.pack_size || 1)).toFixed(2)
          );
        } else {
          newPrice = String(it.selectedMed.public_price ?? '');
        }
      }

      next[index] = {
        ...it,
        unitType: newUnitType,
        unitPrice: newPrice
      };
      return next;
    });
  };

  // فتح درج تعديل بيانات الصنف (حجم العبوة والسعر)
  const handleToggleInlineEdit = (idx) => {
    if (editingItemIndex === idx) {
      setEditingItemIndex(null);
      setIsCustomUnitSelected(false);
    } else {
      const it = items[idx];
      setEditingItemIndex(idx);
      const uName = (it.selectedMed?.unit_name || 'شريط').trim();
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
    const unitPrice = !isNaN(pub) && pack > 0 ? (pub / pack).toFixed(2) : '0.00';
    const finalUnitName = (inlineEditData.unit_name || 'شريط').trim();

    setItems((prev) => {
      const next = [...prev];
      const current = next[idx];
      const updatedMed = {
        ...(current.selectedMed || {}),
        pack_size: pack,
        unit_name: finalUnitName,
        public_price: isNaN(pub) ? 0 : pub,
        unit_price: parseFloat(unitPrice)
      };

      next[idx] = {
        ...current,
        selectedMed: updatedMed,
        unitPrice: current.unitType === 'strip' ? unitPrice : String(isNaN(pub) ? current.unitPrice : pub)
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

  // احتساب الإجماليات
  const totalAmount = items.reduce((sum, it) => {
    const qty = parseInt(it.quantity || 1, 10);
    const price = parseFloat(it.unitPrice || 0);
    return sum + qty * price;
  }, 0);

  const discVal = parseFloat(discountValue || 0);
  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = (totalAmount * discVal) / 100;
  } else if (discountType === 'amount') {
    discountAmount = discVal;
  }

  const netAmount = Math.max(0, totalAmount - discountAmount);
  const paid = parseFloat(paidAmount || 0);
  const remainingAmount = Math.max(0, netAmount - paid);

  // إرسال الطلب
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const finalName = String(customerName || '').trim();
    const finalPhone = String(whatsappPhone || '').replace(/\D/g, '');

    if (!finalName) {
      setErrorMsg('يرجى إدخال اسم العميل');
      return;
    }
    if (!finalPhone || finalPhone.length < 9) {
      setErrorMsg('يرجى إدخال رقم هاتف واتساب صالح للعميل (9 أرقام على الأقل)');
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

    const finalPharmacist =
      responsiblePharmacist === '__custom__'
        ? customPharmacist.trim() || 'د. صيدلي الفرع'
        : responsiblePharmacist;

    setIsSubmitting(true);
    try {
      const payload = {
        branchId,
        customer: {
          id: selectedCustomer?.id || null,
          fullName: finalName,
          whatsappPhone: finalPhone,
          landlinePhone: landlinePhone ? String(landlinePhone).trim() : null,
          address: address ? String(address).trim() : null,
          zone: selectedZone || null
        },
        items: validItems.map((it) => ({
          medicationName: String(it.medicationName).trim(),
          unitType: it.unitType || 'pack',
          quantity: parseInt(it.quantity || 1, 10),
          unitPrice: parseFloat(it.unitPrice || 0)
        })),
        paidAmount: paid,
        discountType,
        discountValue: discVal,
        expectedPickupDate,
        expectedPickupTime,
        responsiblePharmacist: finalPharmacist,
        customerNotes,
        zone: selectedZone || null,
        deliveryType,
        deliveryTargetBranch: deliveryType === 'other_branch_pickup' ? deliveryTargetBranch : null
      };

      const res = await outstockCreateOrder(payload);
      if (res?.success && res.order) {
        onOrderCreated(res.order);
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
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '22px',
          width: '100%',
          maxWidth: '880px',
          maxHeight: '94vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
          direction: 'rtl',
          border: '1px solid rgba(226, 232, 240, 0.8)'
        }}
      >
        {/* رأس النافذة العصري */}
        <div
          style={{
            padding: '18px 24px',
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(13, 148, 136, 0.25)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Pill size={22} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900' }}>
                تسجيل طلب عميل جديد (نواقص أدوية)
              </h3>
              <p style={{ margin: 0, fontSize: '12.5px', opacity: 0.9, marginTop: '2px' }}>
                ربط ذكي بكتالوج الأدوية، حسابات دقيقة للمقدم والمتبقي، وإرسال فوري للمشتريات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'rgba(255, 255, 255, 0.18)',
              border: 'none',
              borderRadius: '10px',
              color: '#ffffff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '8px',
              display: 'flex'
            }}
          >
            <X size={20} />
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
          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1.5px solid #fecaca',
                borderRadius: '12px',
                padding: '12px 16px',
                color: '#b91c1c',
                fontSize: '13px',
                fontWeight: '800'
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

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
                  type="text"
                  required
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
                  type="tel"
                  required
                  placeholder="01xxxxxxxxx"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="outstock-form-input"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
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
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="outstock-form-select"
                  style={{ fontWeight: '700' }}
                >
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
          </div>

          {/* ── 2. بنود الأدوية (الأدوية المطلوبة) ── */}
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
                <span>الأدوية المطلوبة في هذا الطلب ({items.length})</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="outstock-btn outstock-btn-secondary"
                style={{ fontSize: '13px', padding: '7px 16px', fontWeight: '800' }}
              >
                <Plus size={16} />
                <span>إضافة دواء آخر</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map((it, idx) => {
                const singleUnit = isSingleUnitMed(it.selectedMed);
                const optionLabel = getUnitOptionLabel(it.selectedMed);
                const isEditingThisItem = editingItemIndex === idx;

                return (
                  <div
                    key={idx}
                    className="outstock-med-item-card"
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '14px',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                      position: 'relative',
                      zIndex: items.length - idx
                    }}
                  >
                    <div className="outstock-med-top-line" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <MedicationAutocompleteInput
                          inputRef={(el) => (itemInputRefs.current[idx] = el)}
                          value={it.medicationName}
                          unitType={it.unitType}
                          selectedMed={it.selectedMed}
                          onMedicationSelect={(displayName, medObj) => handleMedicationSelect(idx, displayName, medObj)}
                          onTextChange={(text) => handleItemChange(idx, 'medicationName', text)}
                          onAddNewMedication={(typedText) => handleOpenAddMedModal(idx, typedText)}
                          placeholder="ابحث باسم الدواء، المادة الفعالة، أو الباركود..."
                          required
                        />
                      </div>

                      {/* زر تعديل بيانات الصنف السريع (تعديل السعر/الشرائط إذا كان الكتالوج به خطأ) */}
                      <button
                        type="button"
                        onClick={() => handleToggleInlineEdit(idx)}
                        style={{
                          width: '38px',
                          height: '40px',
                          borderRadius: '10px',
                          border: isEditingThisItem ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                          background: isEditingThisItem ? '#f0fdfa' : '#f8fafc',
                          color: isEditingThisItem ? '#0d9488' : '#475569',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        title="تعديل حجم العبوة أو السعر لهذا الصنف"
                      >
                        <Edit3 size={16} />
                      </button>

                      {/* زر حذف الصنف */}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length === 1}
                        style={{
                          width: '38px',
                          height: '40px',
                          borderRadius: '10px',
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                          opacity: items.length === 1 ? 0.35 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                        title="حذف هذا الصنف"
                      >
                        <Trash2 size={16} color="#ef4444" />
                      </button>
                    </div>

                    {/* درج التعديل السريع للصنف (إذا فتح الصيدلي زر التعديل) */}
                    {isEditingThisItem && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '12px 14px',
                          background: '#f0fdfa',
                          border: '1.5px dashed #0d9488',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Edit3 size={14} />
                          <span>تعديل مواصفات وتسعير هذا الصنف:</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                              عدد الشرائط/الوحدات:
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={inlineEditData.pack_size}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, pack_size: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontSize: '13px' }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '11px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                              اسم الوحدة:
                            </label>
                            <select
                              value={
                                isCustomUnitSelected
                                  ? '__custom__'
                                  : STANDARD_MED_UNITS.includes(inlineEditData.unit_name)
                                  ? inlineEditData.unit_name
                                  : (inlineEditData.unit_name ? '__custom__' : 'شريط')
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__custom__') {
                                  setIsCustomUnitSelected(true);
                                } else {
                                  setIsCustomUnitSelected(false);
                                  setInlineEditData({ ...inlineEditData, unit_name: val });
                                }
                              }}
                              className="outstock-form-select"
                              style={{ minHeight: '36px', fontSize: '13px', fontWeight: '700' }}
                            >
                              {STANDARD_MED_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {unit}
                                </option>
                              ))}
                              <option value="__custom__">-- وحدة أخرى (كتابة يدوية) --</option>
                            </select>

                            {isCustomUnitSelected && (
                              <input
                                type="text"
                                placeholder="اكتب اسم الوحدة يدوياً..."
                                value={inlineEditData.unit_name}
                                onChange={(e) => setInlineEditData({ ...inlineEditData, unit_name: e.target.value })}
                                className="outstock-form-input"
                                style={{ minHeight: '34px', fontSize: '12px', marginTop: '5px' }}
                                autoFocus
                              />
                            )}
                          </div>

                          <div>
                            <label style={{ fontSize: '11px', color: '#047857', fontWeight: '800', display: 'block', marginBottom: '3px' }}>
                              سعر العبوة الرسمي (ج.م):
                            </label>
                            <input
                              type="number"
                              step="0.25"
                              value={inlineEditData.public_price}
                              onChange={(e) => setInlineEditData({ ...inlineEditData, public_price: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontSize: '13px', fontWeight: 'bold' }}
                            />
                          </div>

                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(idx)}
                              style={{
                                flex: 1,
                                height: '36px',
                                background: '#059669',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: '800',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <Check size={14} />
                              <span>تطبيق</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingItemIndex(null)}
                              style={{
                                height: '36px',
                                padding: '0 12px',
                                background: '#e2e8f0',
                                color: '#334155',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: '700',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* تفاصيل الوحدة والكمية والسعر */}
                    <div className="outstock-med-sub-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '10px', marginTop: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          الوحدة المطلوبة
                        </label>
                        <select
                          value={it.unitType}
                          onChange={(e) => handleUnitTypeChange(idx, e.target.value)}
                          className="outstock-form-select"
                          style={{ minHeight: '40px', fontSize: '13px', fontWeight: '700' }}
                        >
                          <option value="pack">علبة كاملة 📦</option>
                          {!singleUnit && <option value="strip">{optionLabel}</option>}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          الكمية
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

                      <div>
                        <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', marginBottom: '3px', display: 'block' }}>
                          {it.selectedMed ? 'السعر الرسمي (تلقائي ⚡)' : 'سعر الوحدة (ج.م)'}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="السعر (ج.م)"
                          value={it.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                          className="outstock-form-input"
                          style={{
                            minHeight: '40px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                            borderColor: it.selectedMed ? '#0d9488' : undefined,
                            backgroundColor: it.selectedMed ? '#f0fdfa' : undefined
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 3. الحسابات المالية والعربون ── */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px 18px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: '900', color: '#334155', marginBottom: '12px' }}>
              💰 الحساب المالي والعربون
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  المبلغ المدفوع (عربون العميل):
                </label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="0.00"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="outstock-form-input"
                  style={{ fontWeight: 'bold', color: '#059669', fontSize: '15px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  نوع الخصم:
                </label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                  className="outstock-form-select"
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
                    step="0.5"
                    placeholder="القيمة"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="outstock-form-input"
                  />
                </div>
              )}
            </div>

            {/* بطاقات ملخص الحسابات */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginTop: '14px'
              }}
            >
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>إجمالي الأصناف</span>
                <strong style={{ fontSize: '16px', color: '#1e293b' }}>{totalAmount.toFixed(2)} ج.م</strong>
              </div>

              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>الصافي بعد الخصم</span>
                <strong style={{ fontSize: '16px', color: '#0d9488' }}>{netAmount.toFixed(2)} ج.م</strong>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#15803d', display: 'block' }}>المدفوع (عربون)</span>
                <strong style={{ fontSize: '16px', color: '#059669' }}>{paid.toFixed(2)} ج.م</strong>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 14px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#b91c1c', display: 'block' }}>المتبقي عند الاستلام</span>
                <strong style={{ fontSize: '17px', color: '#dc2626' }}>{remainingAmount.toFixed(2)} ج.م</strong>
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
                  <option value="other_branch_pickup">🔄 استلام من فرع آخر للصيدلية</option>
                </select>
              </div>

              {deliveryType === 'other_branch_pickup' && (
                <div>
                  <select
                    value={deliveryTargetBranch}
                    onChange={(e) => setDeliveryTargetBranch(e.target.value)}
                    className="outstock-form-select"
                    style={{ fontWeight: '700', borderColor: !deliveryTargetBranch ? '#f59e0b' : '#0d9488' }}
                    required
                  >
                    <option value="">-- اختر الفرع المراد تحويل الاستلام إليه --</option>
                    {availableBranches.map((b) => (
                      <option key={b.id || b.name} value={b.name}>
                        {b.name} {b.address ? `(${b.address})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f766e', display: 'block', marginBottom: '4px' }}>
                <User size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> الصيدلي المسؤول متلقي الطلب * :
              </label>
              <select
                value={responsiblePharmacist}
                onChange={(e) => setResponsiblePharmacist(e.target.value)}
                className="outstock-form-select"
                style={{ fontWeight: '700' }}
              >
                {eligiblePharmacists.map((emp) => (
                  <option key={emp.id} value={emp.name}>
                    {emp.name} {emp.jobTitle ? `(${emp.jobTitle})` : ''}
                  </option>
                ))}
                <option value="__custom__">-- صيدلي آخر (كتابة يدوية) --</option>
              </select>

              {responsiblePharmacist === '__custom__' && (
                <input
                  type="text"
                  placeholder="اكتب اسم الصيدلي المسؤول هنا..."
                  value={customPharmacist}
                  onChange={(e) => setCustomPharmacist(e.target.value)}
                  className="outstock-form-input"
                  style={{ marginTop: '6px' }}
                  required
                />
              )}
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                ملاحظات العميل أو الطلب:
              </label>
              <input
                type="text"
                placeholder="أي توصيات خاصة بالجرعة أو الشركة"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                className="outstock-form-input"
              />
            </div>
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
                fontSize: '14.5px',
                fontWeight: '900',
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
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
    </div>
  );
}
