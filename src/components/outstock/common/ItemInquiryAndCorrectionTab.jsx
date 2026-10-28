import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle,
  Edit,
  PlusCircle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Building2,
  Pill,
  Send,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  FileText,
  User,
  ShieldCheck,
  Tag,
  Camera,
  UploadCloud,
  AlertTriangle,
  Eye,
  Phone,
  Printer,
  ShoppingBag,
  Coins,
  CreditCard,
  Layers,
  Sparkle,
  Trash2,
  CheckCircle,
  FileEdit,
  PackagePlus
} from 'lucide-react';
import {
  outstockGetMedicationRequests,
  outstockCreateMedicationRequest,
  outstockReplyMedicationRequest,
  outstockApproveNewItemRequest,
  outstockUpdateMedicationDetails,
  outstockSearchMedications,
  outstockSendInquiryComplaint,
  outstockGetCustomers,
  outstockSendMedicationRequestWhatsApp,
  outstockConvertMedicationRequestToOrder,
  outstockMarkMedicationRequestsRead,
  outstockMarkMedicationRequestRead
} from '../../../utils/outstockApiClient';
import MedicationAutocompleteInput from '../pharmacy/MedicationAutocompleteInput';
import NewCustomerOrderModal from '../pharmacy/NewCustomerOrderModal';
import EmployeeCodeAuthModal from './EmployeeCodeAuthModal';
import ProcurementReplyModal from './ProcurementReplyModal';
import { printInquiryReceipt } from '../../../utils/printInquiryReceipt';
import { useDeliveryZones } from '../../../utils/deliveryZonesService';

/**
 * ItemInquiryAndCorrectionTab.jsx
 * وحدة الاستعلامات، تصحيح بيانات الأصناف، واعتماد الأصناف الجديدة
 * نظام تبادلي متقدم يربط فروع الصيدليات بإدارة المشتريات:
 * 1. استعلام عن سعر / توفر صنف مع بيانات العميل والعربون
 * 2. إيصال استلام عربون حراري مزدوج (نسخة العميل + نسخة الصيدلية)
 * 3. تحويل الاستعلام المجاب عنه مباشرة لطلب عميل مسبق الحجز
 * 4. زر تفاعلي للصيدلي لإرسال إشعار الواتساب للعميل يدوياً
 */
export default function ItemInquiryAndCorrectionTab({
  userRole = 'branch', // 'branch' | 'procurement_manager' | 'procurement_officer' | 'owner'
  branchId = null,
  currentBranch = null,
  currentUser = null,
  showToast = (msg) => {
    if (typeof window !== 'undefined') {
      const detail = typeof msg === 'object' ? msg : { message: String(msg) };
      window.dispatchEvent(new CustomEvent('outstock:notify', { detail }));
    }
  },
  categoryScope = null
}) {
  const isProcurement = userRole === 'procurement_manager' || userRole === 'procurement_officer' || userRole === 'owner';

  const [activeSubTab, setActiveSubTab] = useState('all'); // 'all' | 'inquiry' | 'correction' | 'new_item'
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending'); // default: 'pending' (في انتظار رد المشتريات)
  const [previewReplyRequest, setPreviewReplyRequest] = useState(null); // نافذة معاينة رد المشتريات المفصلة

  // التحقق من كود الموظف قبل فتح الاستعلام أو التصحيح
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState(null);

  // نافذة تقديم طلب جديد (للفرع)
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [newRequestType, setNewRequestType] = useState('inquiry'); // 'inquiry' | 'correction' | 'new_item'
  const [selectedMed, setSelectedMed] = useState(null);
  const [medicationName, setMedicationName] = useState('');
  const [notes, setNotes] = useState('');
  const [attachmentImage, setAttachmentImage] = useState(null); // base64 string
  const [attachmentName, setAttachmentName] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState(null); // Lightbox
  const defaultCorrectionFields = {
    trade_name_en: '',
    trade_name_ar: '',
    invoice_display_name: '',
    public_price: '',
    dosage_form: '',
    pack_size: 1,
    unit_name: 'علبة',
    strength: '',
    active_ingredient: '',
    manufacturer: '',
    barcode: '',
    brand: '',
    category: '',
    skin_type: '',
    size_volume: ''
  };

  const defaultNewItemCard = {
    item_type: 'medication',
    trade_name_en: '',
    trade_name_ar: '',
    invoice_display_name: '',
    dosage_form: 'أقراص',
    pack_size: 1,
    unit_name: 'علبة',
    strength: '',
    active_ingredient: '',
    public_price: '',
    manufacturer: '',
    barcode: '',
    storage_condition: 'room_temp',
    brand: '',
    category: 'عناية بالبشرة',
    skin_type: 'جميع أنواع البشرة',
    size_volume: ''
  };

  const [proposedData, setProposedData] = useState({
    public_price: '',
    pack_size: 1,
    dosage_form: '',
    manufacturer: '',
    active_ingredient: '',
    invoice_display_name: ''
  });
  const [correctionOldValues, setCorrectionOldValues] = useState(defaultCorrectionFields);
  const [correctionNewValues, setCorrectionNewValues] = useState(defaultCorrectionFields);
  const [newItemCard, setNewItemCard] = useState(defaultNewItemCard);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── قائمة المناطق المعتمدة من إعدادات المالك ──
  const deliveryZones = useDeliveryZones();

  // ── بيانات العميل والعربون وتوجيه الصنف ──
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerZone, setCustomerZone] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [itemType, setItemType] = useState('medication'); // 'medication' | 'cosmetics'
  const [requestedQuantity, setRequestedQuantity] = useState(1);
  const [requestedUnit, setRequestedUnit] = useState('pack'); // 'pack' | 'strip' | 'ampoule' | 'unit'
  const [printThermalReceipt, setPrintThermalReceipt] = useState(true);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

  // ── تفريغ نموذج الاستعلام الجديد تماماً لمنع بقاء أي بيانات سابقة ──
  const resetNewRequestForm = () => {
    setMedicationName('');
    setSelectedMed(null);
    setNotes('');
    setAttachmentImage(null);
    setAttachmentName('');
    setCustomerPhone('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerZone('');
    setCustomerId(null);
    setDepositAmount('');
    setPaymentMethod('cash');
    setRequestedQuantity(1);
    setRequestedUnit('pack');
    setCorrectionOldValues(defaultCorrectionFields);
    setCorrectionNewValues(defaultCorrectionFields);
    setNewItemCard(defaultNewItemCard);
    setProposedData({
      public_price: '',
      pack_size: 1,
      dosage_form: '',
      manufacturer: '',
      active_ingredient: '',
      invoice_display_name: ''
    });
  };

  // ── تحويل الاستعلام لطلب عميل وإرسال واتساب يدوي ──
  const [orderModalPrefill, setOrderModalPrefill] = useState(null);
  const [inquiryToConvert, setInquiryToConvert] = useState(null);
  const [sendingWhatsAppId, setSendingWhatsAppId] = useState(null);

  // نافذة الرد على الطلب (للمشتريات)
  const [replyTargetRequest, setReplyTargetRequest] = useState(null);
  const [replyNotes, setReplyNotes] = useState('');
  const [replyStatus, setReplyStatus] = useState('resolved');
  const [replyItems, setReplyItems] = useState([]);
  const [isReplying, setIsReplying] = useState(false);
  const [correctionRejectionReason, setCorrectionRejectionReason] = useState('');
  const [correctionEditableNewVals, setCorrectionEditableNewVals] = useState(null);
  const [newItemReplyData, setNewItemReplyData] = useState(null);
  const [showRejectBox, setShowRejectBox] = useState(false);

  // المصادقة الأمنية بكود الموظف قبل تحويل الاستعلام لطلب عميل
  const [isConvertAuthModalOpen, setIsConvertAuthModalOpen] = useState(false);
  const [inquiryPendingConversion, setInquiryPendingConversion] = useState(null);
  const [orderReceiverEmployee, setOrderReceiverEmployee] = useState(null);

  // تصعيد شكوى لعدم الرد على الاستعلام
  const [complaintTargetInquiry, setComplaintTargetInquiry] = useState(null);
  const [complaintNotes, setComplaintNotes] = useState('');
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalatedInquiryIds, setEscalatedInquiryIds] = useState(new Set());

  // جلب الطلبات
  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (!isProcurement && branchId) {
        params.branchId = branchId;
      }
      if (activeSubTab !== 'all') {
        params.requestType = activeSubTab;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (categoryScope) {
        params.categoryScope = categoryScope;
        params.category_scope = categoryScope;
      }
      const res = await outstockGetMedicationRequests(params);
      if (res?.success && Array.isArray(res.requests)) {
        setRequests(res.requests);
        // للفرع: إذا وجدت استعلامات تم الرد عليها ولم تُعلم كمقروءة، تعليمها كمقروءة وإسقاط الإشعار الوهمي
        if (!isProcurement && branchId) {
          const hasUnreadReplies = res.requests.some(r =>
            (r.status === 'resolved' || r.status === 'approved' || r.status === 'replied') &&
            (r.is_read_by_branch === false || r.is_read_by_branch === null || r.is_read_by_branch === undefined)
          );
          if (hasUnreadReplies) {
            outstockMarkMedicationRequestsRead(branchId).then(() => {
              window.dispatchEvent(new CustomEvent('outstock:refresh_notifications'));
            }).catch(() => {});
          }
        }
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.warn('Fetch medication requests error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [activeSubTab, statusFilter, branchId, categoryScope]);

  // عند نجاح التحقق من كود الموظف
  const handleAuthSuccess = (emp) => {
    resetNewRequestForm();
    setAuthenticatedEmployee(emp);
    setIsAuthModalOpen(false);
    setIsNewRequestModalOpen(true);
  };

  // ── البحث التلقائي الدقيق عن العميل برقم الهاتف ──
  const handleCustomerPhoneChange = async (val) => {
    const digits = String(val || '').replace(/\D/g, '').slice(0, 11);
    setCustomerPhone(digits);

    // إذا تم تعديل أو مسح الرقم: تفريغ هوية العميل والاسم والعنوان فوراً لمنع بقاء أي اسم ثابت
    if (customerId || !digits || digits.length < 11) {
      setCustomerId(null);
      setCustomerName('');
      setCustomerAddress('');
      setCustomerZone('');
    }

    if (digits.length === 11) {
      setIsSearchingCustomer(true);
      try {
        const res = await outstockGetCustomers({ phone: digits });
        if (res?.success && Array.isArray(res.customers) && res.customers.length > 0) {
          // التحقق الصارم من تطابق الرقم مع بيانات العميل المسترجعة دون السقوط على عميل عشوائي
          const matched = res.customers.find((c) => {
            const p1 = String(c.whatsapp_phone || '').replace(/\D/g, '');
            const p2 = String(c.landline_phone || '').replace(/\D/g, '');
            return (p1 && (p1 === digits || (p1.length >= 10 && digits.endsWith(p1.slice(-10))) || (digits.length >= 10 && p1.endsWith(digits.slice(-10))))) ||
                   (p2 && (p2 === digits || (p2.length >= 10 && digits.endsWith(p2.slice(-10)))));
          });

          if (matched) {
            const resolvedName = matched.full_name || matched.name || matched.customer_name || '';
            setCustomerName(resolvedName);
            setCustomerAddress(matched.address || matched.customer_address || '');
            setCustomerZone(matched.zone || matched.customer_zone || '');
            setCustomerId(matched.id || null);
            showToast(`✨ تم التعرف على العميل: ${resolvedName || 'عميل مسجل'}`);
            return;
          }
        }
        setCustomerId(null);
        setCustomerName('');
        setCustomerAddress('');
        setCustomerZone('');
        showToast(`ℹ️ رقم الهاتف غير مسجل مسبقاً، يمكنك كتابة بيانات العميل الجديد بحرية`);
      } catch (_) {
        setCustomerId(null);
        setCustomerName('');
        setCustomerAddress('');
        setCustomerZone('');
      } finally {
        setIsSearchingCustomer(false);
      }
    }
  };

  // إرسال طلب جديد
  const handleCreateRequest = async (e) => {
    e.preventDefault();

    let finalMedicationName = medicationName.trim();
    let finalProposedData = null;

    if (newRequestType === 'inquiry') {
      if (!finalMedicationName) {
        showToast('⚠️ يرجى إدخال اسم الدواء أو الصنف المستعلم عنه');
        return;
      }
      if (customerPhone && customerPhone.length > 0 && customerPhone.length < 11) {
        showToast('⚠️ رقم هاتف العميل يجب أن يتكون من 11 رقماً');
        return;
      }
    } else if (newRequestType === 'correction') {
      if (!selectedMed) {
        showToast('⚠️ يرجى اختيار الصنف المراد تصحيح بياناته من قائمة الأصناف المسجلة');
        return;
      }
      if (!notes.trim()) {
        showToast('⚠️ يرجى كتابة سبب طلب تصحيح بيانات الصنف لتوثيقه لإدارة المشتريات');
        return;
      }
      finalMedicationName = selectedMed.trade_name || selectedMed.tradeName || selectedMed.name || finalMedicationName;

      // حساب الفروقات فقط
      const diff = {};
      Object.keys(correctionNewValues).forEach((key) => {
        const oldV = String(correctionOldValues[key] ?? '').trim();
        const newV = String(correctionNewValues[key] ?? '').trim();
        if (newV && newV !== oldV) {
          diff[key] = { old: oldV, new: newV };
        }
      });

      finalProposedData = {
        item_type: itemType,
        old_values: correctionOldValues,
        new_values: correctionNewValues,
        diff,
        public_price: correctionNewValues.public_price,
        pack_size: correctionNewValues.pack_size,
        dosage_form: correctionNewValues.dosage_form,
        manufacturer: correctionNewValues.manufacturer,
        active_ingredient: correctionNewValues.active_ingredient,
        invoice_display_name: correctionNewValues.invoice_display_name,
        barcode: correctionNewValues.barcode
      };
    } else if (newRequestType === 'new_item') {
      if (itemType === 'medication') {
        if (!newItemCard.trade_name_en.trim()) {
          showToast('⚠️ يرجى إدخال الاسم التجاري الإنجليزي للصنف الدوائي');
          return;
        }
        if (!newItemCard.public_price || parseFloat(newItemCard.public_price) <= 0) {
          showToast('⚠️ يرجى إدخال السعر الرسمي للجمهور');
          return;
        }
        finalMedicationName = newItemCard.trade_name_en.trim();
      } else {
        if (!newItemCard.trade_name_ar.trim() && !newItemCard.trade_name_en.trim()) {
          showToast('⚠️ يرجى إدخال اسم منتج التجميل');
          return;
        }
        if (!newItemCard.brand.trim()) {
          showToast('⚠️ يرجى إدخال اسم الماركة أو البراند');
          return;
        }
        if (!newItemCard.public_price || parseFloat(newItemCard.public_price) <= 0) {
          showToast('⚠️ يرجى إدخال السعر الرسمي للجمهور');
          return;
        }
        finalMedicationName = newItemCard.trade_name_ar.trim() || newItemCard.trade_name_en.trim();
      }

      finalProposedData = {
        ...newItemCard,
        tradeName: newItemCard.trade_name_en,
        arabicName: newItemCard.trade_name_ar,
        price: newItemCard.public_price,
        dosageForm: newItemCard.dosage_form,
        packSize: newItemCard.pack_size,
        unitName: newItemCard.unit_name,
        activeIngredients: newItemCard.active_ingredient,
        company: newItemCard.manufacturer
      };
    }

    setIsSubmitting(true);
    try {
      const payload = {
        branchId: branchId || currentBranch?.id || null,
        requestType: newRequestType,
        medicationId: selectedMed?.id || null,
        medicationName: finalMedicationName,
        proposedData: finalProposedData,
        requestedData: finalProposedData,
        notes: notes.trim(),
        pharmacistNotes: notes.trim(),
        requestedBy: authenticatedEmployee?.name || currentUser?.name || currentUser?.full_name || 'صيدلي الفرع',
        employeeCode: authenticatedEmployee?.code || null,
        employeeName: authenticatedEmployee?.name || null,
        attachmentUrl: attachmentImage || null,
        attachmentName: attachmentName || null,
        itemType,
        customerName: newRequestType === 'inquiry' ? (customerName.trim() || null) : null,
        customerPhone: newRequestType === 'inquiry' ? (customerPhone.trim() || null) : null,
        customerAddress: newRequestType === 'inquiry' ? (customerZone ? (customerAddress.trim() ? `${customerZone} - ${customerAddress.trim()}` : customerZone) : (customerAddress.trim() || null)) : null,
        customerZone: newRequestType === 'inquiry' ? (customerZone.trim() || null) : null,
        customerId: newRequestType === 'inquiry' ? (customerId || null) : null,
        depositAmount: newRequestType === 'inquiry' ? (parseFloat(depositAmount) || 0) : 0,
        paymentMethod: newRequestType === 'inquiry' ? paymentMethod : 'cash',
        requestedQuantity: newRequestType === 'inquiry' ? (parseInt(requestedQuantity, 10) || 1) : 1,
        requestedUnit: newRequestType === 'inquiry' ? requestedUnit : 'pack'
      };

      const res = await outstockCreateMedicationRequest(payload);
      if (res?.success) {
        showToast(
          newRequestType === 'correction'
            ? '✅ تم إرسال طلب تصحيح بيانات الصنف لإدارة المشتريات بنجاح!'
            : newRequestType === 'new_item'
            ? '✅ تم إرسال طلب اعتماد الصنف الجديد بالكتالوج المركزي بنجاح!'
            : '✅ تم إرسال الاستعلام لإدارة المشتريات بنجاح!'
        );

        // 🖨️ طباعة إيصال استلام العربون الحراري المزدوج (نسخة العميل + نسخة الصيدلية)
        if (newRequestType === 'inquiry' && (parseFloat(depositAmount) > 0 || (printThermalReceipt && customerName.trim()))) {
          try {
            printInquiryReceipt({
              inquiryId: res.request?.id || res.id,
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim(),
              customerAddress: customerZone ? `${customerZone} - ${customerAddress.trim()}` : customerAddress.trim(),
              medicationName: finalMedicationName,
              requestedQuantity: parseInt(requestedQuantity, 10) || 1,
              requestedUnit: requestedUnit === 'strip' ? 'شريط' : (requestedUnit === 'pack' ? 'علبة' : requestedUnit),
              itemType,
              depositAmount: parseFloat(depositAmount) || 0,
              paymentMethod,
              pharmacistNotes: notes.trim(),
              employeeName: authenticatedEmployee?.name || currentUser?.name || 'صيدلي الفرع',
              employeeCode: authenticatedEmployee?.code || '',
              branchName: currentBranch?.name || 'فرع الصيدلية'
            });
          } catch (printErr) {
            console.warn('Inquiry receipt print error:', printErr);
          }
        }

        setIsNewRequestModalOpen(false);
        setAuthenticatedEmployee(null);
        resetNewRequestForm();
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر إرسال الطلب'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🛍️ طلب التحقق من كود الموظف أولاً قبل فتح نافذة إنشاء طلب العميل
  const handleConvertToOrder = (reqItem) => {
    setInquiryPendingConversion(reqItem);
    setIsConvertAuthModalOpen(true);
  };

  // بعد نجاح التحقق من كود الصيدلي
  const handleConvertAuthSuccess = (emp) => {
    setOrderReceiverEmployee(emp);
    setIsConvertAuthModalOpen(false);
    if (inquiryPendingConversion) {
      openOrderModalWithPrefill(inquiryPendingConversion, emp);
    }
  };

  // فتح نافذة الطلب وتعبئة البيانات تلقائياً
  const openOrderModalWithPrefill = (reqItem, emp) => {
    setInquiryToConvert(reqItem);
    const replyData = typeof reqItem.procurement_reply === 'object' && reqItem.procurement_reply !== null
      ? reqItem.procurement_reply
      : (typeof reqItem.procurement_reply === 'string'
        ? (() => { try { return JSON.parse(reqItem.procurement_reply); } catch { return {}; } })()
        : {});

    const itemsFromReply = Array.isArray(replyData.items) && replyData.items.length > 0
      ? replyData.items
      : null;

    let prefilledItems = [];
    if (itemsFromReply) {
      prefilledItems = itemsFromReply.map((it, idx) => ({
        id: `item_${Date.now()}_${idx}`,
        medicationName: it.medicationName || reqItem.medication_name,
        unitType: it.unit || reqItem.requested_unit || 'pack',
        quantity: parseInt(it.quantity || reqItem.requested_quantity || 1, 10),
        unitPrice: it.price !== undefined && it.price !== null && it.price !== '' ? String(it.price) : '',
        isPriceEstimated: false,
        itemType: reqItem.item_type || 'medication',
        imageUrl: reqItem.attachment_url || '',
        itemStatus: it.isAvailable !== false ? 'available_by_procurement' : 'pending'
      }));
    } else {
      const replyPrice = replyData.approvedPrice || replyData.price || replyData.current_price || reqItem.proposed_data?.public_price || '';
      prefilledItems = [
        {
          id: `item_${Date.now()}`,
          medicationName: reqItem.medication_name,
          unitType: reqItem.requested_unit || 'pack',
          quantity: reqItem.requested_quantity || 1,
          unitPrice: replyPrice ? String(replyPrice) : '',
          isPriceEstimated: false,
          itemType: reqItem.item_type || 'medication',
          imageUrl: reqItem.attachment_url || '',
          itemStatus: replyData.isAvailable !== false ? 'available_by_procurement' : 'pending'
        }
      ];
    }

    setOrderModalPrefill({
      customer_name: reqItem.customer_name || '',
      customer_phone: reqItem.customer_phone || '',
      customer_address: reqItem.customer_address || '',
      customer_id: reqItem.customer_id || null,
      paid_amount: reqItem.deposit_amount ? String(reqItem.deposit_amount) : '',
      payment_method: reqItem.payment_method || 'cash',
      customer_notes: `تحويل من استعلام #${reqItem.id?.slice(-6) || ''}: ${reqItem.pharmacist_notes || reqItem.notes || ''}`,
      items: prefilledItems
    });
  };

  // 📲 إرسال رسالة واتساب تفاعلية للعميل بطلب يدوي من الصيدلي بعد رد المشتريات
  const handleSendWhatsAppToCustomer = async (reqItem) => {
    if (!reqItem.customer_phone) {
      showToast('⚠️ لا يوجد رقم هاتف مسجل للعميل في هذا الاستعلام');
      return;
    }
    setSendingWhatsAppId(reqItem.id);
    try {
      const res = await outstockSendMedicationRequestWhatsApp(reqItem.id);
      if (res?.success) {
        if (res?.sent) {
          showToast(res.message || '✅ تم إرسال رسالة الواتساب للعميل بنجاح عبر رقم الفرع المقترن 📲');
        } else {
          showToast('⚠️ جلسة واتساب الفرع غير متصلة حالياً، تم فتح المحادثة المجهزة للعميل مباشرة 📲');
          if (res?.whatsappUrl) {
            window.open(res.whatsappUrl, '_blank');
          }
        }
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر إرسال الواتساب'}`);
        if (res?.whatsappUrl) {
          window.open(res.whatsappUrl, '_blank');
        }
      }
    } catch (err) {
      showToast(`❌ خطأ في إرسال الواتساب: ${err.message}`);
    } finally {
      setSendingWhatsAppId(null);
    }
  };

  // 🖨️ إعادة طباعة إيصال استلام العربون والاستعلام
  const handleReprintInquiryReceipt = (reqItem) => {
    printInquiryReceipt({
      inquiryId: reqItem.id,
      customerName: reqItem.customer_name || '',
      customerPhone: reqItem.customer_phone || '',
      customerAddress: reqItem.customer_address || '',
      medicationName: reqItem.medication_name,
      requestedQuantity: reqItem.requested_quantity || 1,
      requestedUnit: reqItem.requested_unit === 'strip' ? 'شريط' : (reqItem.requested_unit === 'pack' ? 'علبة' : reqItem.requested_unit || 'علبة'),
      itemType: reqItem.item_type || 'medication',
      depositAmount: parseFloat(reqItem.deposit_amount || 0),
      paymentMethod: reqItem.payment_method || 'cash',
      pharmacistNotes: reqItem.pharmacist_notes || reqItem.notes || '',
      employeeName: reqItem.employee_name || reqItem.requested_by || 'صيدلي الفرع',
      employeeCode: reqItem.employee_code || '',
      branchName: reqItem.branch_name || currentBranch?.name || 'فرع الصيدلية',
      date: reqItem.created_at || new Date()
    });
  };

  // فتح نافذة الرد مع تهيئة جدول الأصناف أو كارتة الصنف أو جدول المقارنة
  const handleOpenReplyModal = (reqItem) => {
    setReplyTargetRequest(reqItem);
    setCorrectionRejectionReason('');
    setShowRejectBox(false);
    const prop = reqItem.proposed_data || reqItem.requested_data || {};

    if (reqItem.request_type === 'correction') {
      const newV = prop.new_values || prop || {};
      setCorrectionEditableNewVals({ ...defaultCorrectionFields, ...newV });
    } else if (reqItem.request_type === 'new_item') {
      setNewItemReplyData({
        ...defaultNewItemCard,
        ...prop,
        tradeName: prop.trade_name_en || prop.tradeName || reqItem.medication_name || '',
        arabicName: prop.trade_name_ar || prop.arabicName || '',
        price: prop.public_price || prop.price || '',
        dosageForm: prop.dosage_form || prop.dosageForm || 'أقراص',
        packSize: prop.pack_size || prop.packSize || 1,
        unitName: prop.unit_name || prop.unitName || 'علبة',
        strength: prop.strength || '',
        activeIngredients: prop.active_ingredient || prop.activeIngredients || '',
        company: prop.manufacturer || prop.company || '',
        barcode: prop.barcode || '',
        storage_condition: prop.storage_condition || 'room_temp'
      });
    }

    const replyData = typeof reqItem.procurement_reply === 'object' && reqItem.procurement_reply !== null
      ? reqItem.procurement_reply
      : (typeof reqItem.procurement_reply === 'string'
        ? (() => { try { return JSON.parse(reqItem.procurement_reply); } catch { return {}; } })()
        : {});

    const existingNotes = reqItem.response_notes || replyData.notes || replyData.message || '';
    setReplyNotes(existingNotes);
    setReplyStatus(reqItem.status === 'pending' ? 'resolved' : reqItem.status);

    const initialItems = Array.isArray(replyData.items) && replyData.items.length > 0
      ? replyData.items.map((it) => ({
          medicationName: it.medicationName || reqItem.medication_name,
          quantity: it.quantity || reqItem.requested_quantity || 1,
          unit: it.unit || reqItem.requested_unit || 'علبة',
          price: it.price !== undefined && it.price !== null ? String(it.price) : '',
          isAvailable: it.isAvailable !== false,
          notes: it.notes || ''
        }))
      : [{
          medicationName: reqItem.medication_name,
          quantity: reqItem.requested_quantity || 1,
          unit: reqItem.requested_unit === 'strip' ? 'شريط' : (reqItem.requested_unit === 'pack' ? 'علبة' : (reqItem.requested_unit || 'علبة')),
          price: replyData.approvedPrice || replyData.price || reqItem.proposed_data?.public_price ? String(replyData.approvedPrice || replyData.price || reqItem.proposed_data?.public_price) : '',
          isAvailable: replyData.isAvailable !== false,
          notes: ''
        }];
    setReplyItems(initialItems);
  };

  // 1. اعتماد وتطبيق تصحيح بيانات الصنف على الكتالوج المركزي
  const handleApproveCorrection = async () => {
    if (!replyTargetRequest) return;
    setIsReplying(true);
    try {
      const valsToApply = correctionEditableNewVals || replyTargetRequest.proposed_data?.new_values || replyTargetRequest.proposed_data || {};

      if (replyTargetRequest.medication_id) {
        const updatePayload = {
          arabic_name: valsToApply.trade_name_ar || undefined,
          trade_name: valsToApply.trade_name_en || undefined,
          invoice_display_name: valsToApply.invoice_display_name || undefined,
          public_price: valsToApply.public_price ? parseFloat(valsToApply.public_price) : undefined,
          dosage_form: valsToApply.dosage_form || undefined,
          pack_size: valsToApply.pack_size ? parseInt(valsToApply.pack_size, 10) : undefined,
          unit_name: valsToApply.unit_name || undefined,
          strength: valsToApply.strength || undefined,
          active_ingredient: valsToApply.active_ingredient || undefined,
          manufacturer: valsToApply.manufacturer || undefined,
          barcode: valsToApply.barcode || undefined
        };
        await outstockUpdateMedicationDetails(replyTargetRequest.medication_id, updatePayload);
      }

      const note = replyNotes.trim() || 'تم مراجعة وتعديل بيانات الصنف واعتمادها بالكتالوج المركزي بنجاح.';
      const res = await outstockReplyMedicationRequest(replyTargetRequest.id, {
        status: 'approved',
        notes: note,
        responseNotes: note,
        respondedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast('✅ تم اعتماد تعديل بيانات الصنف وتطبيقها على الكتالوج المركزي وإشعار الفرع!');
        setReplyTargetRequest(null);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر اعتماد التعديل'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // 2. رفض التعديل وإرسال سبب الخطأ للفرع
  const handleRejectCorrection = async () => {
    if (!replyTargetRequest) return;
    if (!correctionRejectionReason.trim()) {
      showToast('⚠️ يرجى كتابة سبب الخطأ في التعديل المرسل لتوضيحه للفرع');
      return;
    }
    setIsReplying(true);
    try {
      const errText = `التعديل المرسل خطأ: ${correctionRejectionReason.trim()}`;
      const res = await outstockReplyMedicationRequest(replyTargetRequest.id, {
        status: 'rejected',
        notes: errText,
        responseNotes: errText,
        rejectionReason: correctionRejectionReason.trim(),
        respondedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast('❌ تم تسجيل أن التعديل المرسل خطأ وإشعار الفرع بالسبب بنجاح');
        setReplyTargetRequest(null);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر تسجيل الرفض'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // 3. اعتماد وإضافة الصنف الجديد للكتالوج المركزي
  const handleApproveNewItemWithData = async () => {
    if (!replyTargetRequest) return;
    setIsReplying(true);
    try {
      const cardData = newItemReplyData || replyTargetRequest.proposed_data || {};
      const res = await outstockApproveNewItemRequest(replyTargetRequest.id, {
        approvedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات',
        medicationData: cardData
      });
      if (res?.success) {
        showToast(`✅ تم اعتماد وإضافة الصنف "${replyTargetRequest.medication_name}" بالكتالوج المركزي بنجاح!`);
        setReplyTargetRequest(null);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر اعتماد الصنف'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // 4. رفض طلب إضافة صنف جديد
  const handleRejectNewItem = async () => {
    if (!replyTargetRequest) return;
    if (!correctionRejectionReason.trim()) {
      showToast('⚠️ يرجى كتابة سبب رفض إضافة الصنف');
      return;
    }
    setIsReplying(true);
    try {
      const errText = `رفض إضافة الصنف: ${correctionRejectionReason.trim()}`;
      const res = await outstockReplyMedicationRequest(replyTargetRequest.id, {
        status: 'rejected',
        notes: errText,
        responseNotes: errText,
        respondedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast('❌ تم رفض طلب إضافة الصنف وإشعار الفرع');
        setReplyTargetRequest(null);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر رفض الطلب'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // إرسال رد المشتريات
  const handleSendReply = async () => {
    if (!replyTargetRequest) return;
    setIsReplying(true);
    try {
      const sanitizedItems = replyItems.map((it) => ({
        medicationName: String(it.medicationName || '').trim(),
        quantity: parseInt(it.quantity || 1, 10),
        unit: String(it.unit || 'علبة').trim(),
        price: it.price !== '' && it.price !== null && it.price !== undefined ? parseFloat(it.price) : null,
        isAvailable: it.isAvailable !== false,
        notes: String(it.notes || '').trim()
      }));

      const firstPrice = sanitizedItems[0]?.price !== null ? sanitizedItems[0]?.price : null;
      const firstAvail = sanitizedItems[0]?.isAvailable !== undefined ? sanitizedItems[0]?.isAvailable : true;

      const res = await outstockReplyMedicationRequest(replyTargetRequest.id, {
        status: replyStatus,
        notes: replyNotes.trim(),
        responseNotes: replyNotes.trim(),
        items: sanitizedItems,
        approvedPrice: firstPrice,
        isAvailable: firstAvail,
        respondedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast('✅ تم تسجيل رد المشتريات واعتماد الأصناف بنجاح!');
        setReplyTargetRequest(null);
        setReplyNotes('');
        setReplyItems([]);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر تسجيل الرد'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsReplying(false);
    }
  };

  // اعتماد صنف جديد كلياً للكتالوج من قبل المشتريات
  const handleApproveNewItem = async (reqItem) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في اعتماد الصنف "${reqItem.medication_name}" وإضافته فوراً للكتالوج المركزي؟`)) {
      return;
    }
    try {
      const res = await outstockApproveNewItemRequest(reqItem.id, {
        approvedBy: currentUser?.name || currentUser?.full_name || 'إدارة المشتريات'
      });
      if (res?.success) {
        showToast(`✅ تم اعتماد وإضافة الصنف "${reqItem.medication_name}" للكتالوج المركزي بنجاح!`);
        fetchRequests();
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر اعتماد الصنف'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    }
  };

  // تصعيد شكوى لعدم الرد على الاستعلام للمالك والمشتريات
  const handleSendComplaint = async (e) => {
    e?.preventDefault();
    if (!complaintTargetInquiry) return;
    setIsEscalating(true);
    try {
      const pharmacist = currentUser?.name || authenticatedEmployee?.name || 'صيدلي الفرع';
      const res = await outstockSendInquiryComplaint(complaintTargetInquiry.id, {
        notes: complaintNotes,
        pharmacistName: pharmacist
      });
      if (res?.success) {
        setEscalatedInquiryIds((prev) => new Set(prev).add(complaintTargetInquiry.id));
        showToast?.(res?.message || '🚨 تم تصعيد شكوى عدم الرد للمالك وإدارة المشتريات بنجاح');
        setComplaintTargetInquiry(null);
        setComplaintNotes('');
      } else {
        showToast?.(res?.error || 'تعذر تصعيد الشكوى');
      }
    } catch (err) {
      showToast?.('حدث خطأ في الاتصال أثناء تصعيد الشكوى');
    } finally {
      setIsEscalating(false);
    }
  };

  // تصفية الطلبات المعروضة
  const filteredRequests = useMemo(() => {
    let list = requests;
    if (categoryScope === 'cosmetics') {
      list = list.filter((r) => {
        const itemType = r.item_type || r.itemType;
        const cat = String(r.requested_data?.category || '').toLowerCase();
        const name = String(r.medication_name || '').toLowerCase();
        return itemType === 'cosmetics' || cat.includes('تجميل') || cat.includes('cosmetic') || name.includes('شامبو') || name.includes('سيروم') || name.includes('كريم');
      });
    } else if (categoryScope === 'medication') {
      list = list.filter((r) => {
        const itemType = r.item_type || r.itemType;
        return itemType !== 'cosmetics';
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => {
        const name = String(r.medication_name || '').toLowerCase();
        const branch = String(r.branch_name || '').toLowerCase();
        const by = String(r.requested_by || '').toLowerCase();
        return name.includes(q) || branch.includes(q) || by.includes(q);
      });
    }
    return list;
  }, [requests, categoryScope, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
      {/* ── الرأس التعريفي - مظهر فاتح مؤسسي راقي ── */}
      <div
        className="outstock-card"
        style={{
          padding: '20px 24px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          color: '#0f172a',
          borderRadius: '16px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: '#e0f2fe',
                border: '1px solid #bae6fd',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <HelpCircle size={26} color="#0284c7" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
                مركز الاستعلامات، تصحيح الأصناف، واعتماد الأدوية
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                قناة تواصل فورية بين الصيدليات وإدارة المشتريات للتحقق من الأسعار وتحديث الكتالوج المركزي
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={fetchRequests}
              className="outstock-btn outstock-btn-secondary"
              style={{ padding: '9px 16px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}
            >
              <RefreshCw size={15} />
              <span>تحديث</span>
            </button>

            {!isProcurement && (
              <button
                type="button"
                onClick={() => {
                  if (authenticatedEmployee) {
                    setIsNewRequestModalOpen(true);
                  } else {
                    setIsAuthModalOpen(true);
                  }
                }}
                className="outstock-btn outstock-btn-primary"
                style={{
                  padding: '9px 20px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)'
                }}
              >
                <PlusCircle size={16} />
                <span>إرسال استفسار / طلب تصحيح</span>
              </button>
            )}
          </div>
        </div>

        {/* التبويبات الفرعية */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '16px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'كافة المعاملات', icon: FileText },
            { id: 'inquiry', label: 'استعلامات الأسعار والتوفر', icon: HelpCircle },
            { id: 'correction', label: 'طلبات تصحيح بيانات صنف', icon: Edit },
            { id: 'new_item', label: 'طلبات اعتماد صنف جديد', icon: PlusCircle }
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  background: active ? '#0284c7' : '#f8fafc',
                  color: active ? '#ffffff' : '#475569',
                  border: active ? '1px solid #0284c7' : '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── شريط البحث والفلترة ── */}
      <div className="outstock-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div className="outstock-search-bar" style={{ flex: 1, minWidth: '260px' }}>
          <Search size={18} className="outstock-search-icon" />
          <input
            type="text"
            placeholder="ابحث باسم الصنف، الفرع، أو الصيدلي المسؤول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="outstock-search-input"
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#475569' }}>الحالة:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="outstock-form-select"
            style={{ minHeight: '38px', fontSize: '13px', fontWeight: 'bold' }}
          >
            <option value="all">الكل</option>
            <option value="pending">⏳ قيد المراجعة</option>
            <option value="resolved">✅ تم الرد / المعالجة</option>
            <option value="approved">⭐ تم الاعتماد</option>
            <option value="rejected">❌ مرفوض</option>
          </select>
        </div>
      </div>

      {/* ── جدول وقائمة الطلبات ── */}
      <div className="outstock-card" style={{ padding: '0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ marginBottom: '8px' }} />
            <div>جاري تحميل الاستعلامات والطلبات...</div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
            <HelpCircle size={40} color="#cbd5e1" style={{ marginBottom: '10px' }} />
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد طلبات أو استعلامات مطابقة
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              {isProcurement ? 'لم يتم إرسال طلبات من الفروع حالياً' : 'يمكنك الضغط على زر "إرسال استفسار / طلب تصحيح" للتواصل مع المشتريات'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="outstock-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#475569', fontSize: '12.5px' }}>
                  <th style={{ padding: '12px 16px' }}>نوع المعاملة</th>
                  <th style={{ padding: '12px 16px' }}>الصنف المطلوب</th>
                  <th style={{ padding: '12px 16px' }}>الفرع ومقدم الطلب</th>
                  <th style={{ padding: '12px 16px' }}>البيانات والملاحظات</th>
                  <th style={{ padding: '12px 16px' }}>الحالة</th>
                  <th style={{ padding: '12px 16px' }}>رد المشتريات</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((reqItem) => {
                  const typeBadge =
                    reqItem.request_type === 'inquiry'
                      ? { label: 'استعلام سعر/توفر', bg: '#e0f2fe', color: '#0369a1' }
                      : reqItem.request_type === 'correction'
                      ? { label: 'تصحيح بيانات صنف', bg: '#fef3c7', color: '#b45309' }
                      : { label: 'اعتماد صنف جديد', bg: '#dcfce7', color: '#15803d' };

                  const replyObj = typeof reqItem.procurement_reply === 'object' && reqItem.procurement_reply !== null
                    ? reqItem.procurement_reply
                    : (typeof reqItem.procurement_reply === 'string'
                      ? (() => { try { return JSON.parse(reqItem.procurement_reply); } catch { return {}; } })()
                      : {});
                  const replyText = reqItem.response_notes || replyObj.notes || replyObj.message || (reqItem.status === 'approved' ? 'تم اعتماد الصنف وإدراجه رسمياً بكتالوج الأدوية' : '');
                  const replierName = reqItem.responded_by || reqItem.replied_by || replyObj.repliedBy || 'المشتريات';
                  const isItemReplied = reqItem.status === 'resolved' || reqItem.status === 'replied' || reqItem.status === 'approved' || Boolean(replyText);

                  const statusBadge =
                    reqItem.status === 'approved'
                      ? { label: 'معتمد بالكتالوج ⭐', bg: '#dbeafe', color: '#1d4ed8' }
                      : (reqItem.status === 'resolved' || reqItem.status === 'replied' || isItemReplied)
                      ? { label: 'تم الرد بنجاح 🟢', bg: '#dcfce7', color: '#15803d' }
                      : reqItem.status === 'rejected'
                      ? { label: 'مرفوض ❌', bg: '#fee2e2', color: '#b91c1c' }
                      : { label: 'قيد الانتظار ⏳', bg: '#f1f5f9', color: '#64748b' };

                  const propData = reqItem.proposed_data || {};

                  return (
                    <tr key={reqItem.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {/* نوع المعاملة */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: typeBadge.bg,
                            color: typeBadge.color
                          }}
                        >
                          {typeBadge.label}
                        </span>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          {reqItem.created_at ? new Date(reqItem.created_at).toLocaleDateString('ar-EG') : ''}
                        </div>
                      </td>

                      {/* الصنف */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: '800',
                              padding: '2px 7px',
                              borderRadius: '6px',
                              background: reqItem.item_type === 'cosmetics' ? '#fdf2f8' : '#eff6ff',
                              color: reqItem.item_type === 'cosmetics' ? '#db2777' : '#0284c7',
                              border: reqItem.item_type === 'cosmetics' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                            }}
                          >
                            {reqItem.item_type === 'cosmetics' ? '💄 تجميل' : '💊 دواء'}
                          </span>
                          {reqItem.requested_quantity && (
                            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                              (الكمية: {reqItem.requested_quantity} {reqItem.requested_unit === 'strip' ? 'شريط' : (reqItem.requested_unit === 'pack' ? 'علبة' : reqItem.requested_unit || 'وحدة')})
                            </span>
                          )}
                        </div>
                        <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'block' }}>
                          {reqItem.medication_name}
                        </strong>
                        {propData.active_ingredient && (
                          <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                            المادة: {propData.active_ingredient}
                          </span>
                        )}
                      </td>

                      {/* الفرع ومقدم الطلب */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#334155', fontSize: '12.5px' }}>
                          {reqItem.branch_name || 'فرع الصيدلية'}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <User size={12} />
                          <span>بواسطة: <strong>{reqItem.employee_name || reqItem.requested_by || 'الصيدلي'}</strong></span>
                        </div>
                        {reqItem.employee_code && (
                          <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 'bold', marginTop: '1px' }}>
                            كود: {reqItem.employee_code}
                          </div>
                        )}
                      </td>

                      {/* البيانات المقترحة / الملاحظات */}
                      <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                        {/* بيانات العميل والعربون (تظهر للفرع فقط لحماية الخصوصية) */}
                        {!isProcurement && (reqItem.customer_name || reqItem.customer_phone || parseFloat(reqItem.deposit_amount) > 0) && (
                          <div
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '8px',
                              padding: '7px 10px',
                              marginBottom: '6px',
                              fontSize: '11.5px',
                              lineHeight: '1.4'
                            }}
                          >
                            {reqItem.customer_name && (
                              <div style={{ fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <User size={12} color="#0284c7" />
                                <span>العميل: {reqItem.customer_name}</span>
                              </div>
                            )}
                            {reqItem.customer_phone && (
                              <div style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                                <Phone size={12} color="#16a34a" />
                                <span style={{ direction: 'ltr', unicodeBidi: 'isolate', fontWeight: '700' }}>{reqItem.customer_phone}</span>
                              </div>
                            )}
                            {reqItem.customer_address && (
                              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                                📍 {reqItem.customer_address}
                              </div>
                            )}
                            {parseFloat(reqItem.deposit_amount) > 0 && (
                              <div style={{ color: '#15803d', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                                <Coins size={12} color="#16a34a" />
                                <span>العربون: {parseFloat(reqItem.deposit_amount).toFixed(2)} ج.م ({reqItem.payment_method === 'cash' ? 'كاش' : (reqItem.payment_method || 'نقدي')})</span>
                              </div>
                            )}
                            {reqItem.whatsapp_notified_at && (
                              <div style={{ color: '#059669', fontSize: '10.5px', marginTop: '3px', fontWeight: 'bold' }}>
                                📲 تم إشعار العميل بالواتساب ({new Date(reqItem.whatsapp_notified_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                              </div>
                            )}
                            {reqItem.converted_order_id && (
                              <div style={{ color: '#0284c7', fontSize: '10.5px', marginTop: '3px', fontWeight: '800' }}>
                                🛍️ محول لطلب عميل (#{reqItem.converted_order_id.slice(-6)})
                              </div>
                            )}
                          </div>
                        )}

                        {reqItem.notes && (
                          <div style={{ fontSize: '12.5px', color: '#1e293b', marginBottom: '4px' }}>
                            "{reqItem.notes}"
                          </div>
                        )}
                        {reqItem.request_type !== 'inquiry' && propData.public_price && (
                          <div style={{ fontSize: '11.5px', color: '#047857', fontWeight: 'bold' }}>
                            السعر المقترح: {parseFloat(propData.public_price).toFixed(2)} ج.م (حجم: {propData.pack_size || 1})
                          </div>
                        )}
                        {reqItem.attachment_url && (
                          <div style={{ marginTop: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(reqItem.attachment_url)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                fontSize: '11.5px',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="عرض الصورة المرفقة مع الطلب"
                            >
                              <Camera size={13} color="#2563eb" />
                              <span>📷 عرض الصورة المرفقة</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* الحالة */}
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: statusBadge.bg,
                            color: statusBadge.color
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* رد المشتريات */}
                      <td style={{ padding: '12px 16px', maxWidth: '250px' }}>
                        {isItemReplied ? (
                          <div
                            onClick={() => setPreviewReplyRequest(reqItem)}
                            style={{
                              fontSize: '12.5px',
                              color: '#0369a1',
                              background: '#f0f9ff',
                              padding: '7px 10px',
                              borderRadius: '9px',
                              border: '1px solid #bae6fd',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="انقر للمعاينة الموسعة للرد والقرار"
                          >
                            <div style={{ maxHeight: '42px', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                              {replyText || 'تم حفظ القرار والرد من المشتريات.'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#0284c7', marginTop: '3px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>— {replierName}</span>
                              <span style={{ color: '#0284c7', textDecoration: 'underline' }}>معاينة التفاصيل 👁️</span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>في انتظار رد المشتريات...</span>
                        )}
                      </td>

                      {/* الإجراء */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {isProcurement ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {reqItem.request_type === 'new_item' && reqItem.status !== 'approved' && (
                              <button
                                type="button"
                                onClick={() => handleApproveNewItem(reqItem)}
                                style={{
                                  background: '#dcfce7',
                                  color: '#15803d',
                                  border: '1px solid #86efac',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  cursor: 'pointer'
                                }}
                                title="اعتماد الصنف وإضافته فوراً للكتالوج المركزي"
                              >
                                اعتماد صنف ⭐
                              </button>
                            )}

                            {isItemReplied && (
                              <button
                                type="button"
                                onClick={() => setPreviewReplyRequest(reqItem)}
                                style={{
                                  background: '#f0fdf4',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '6px',
                                  padding: '5px 9px',
                                  fontSize: '11.5px',
                                  fontWeight: '800',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="معاينة الرد المعتمد"
                              >
                                <Eye size={13} />
                                <span>معاينة</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenReplyModal(reqItem)}
                              style={{
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '12px',
                                fontWeight: '800',
                                cursor: 'pointer'
                              }}
                            >
                              {isItemReplied ? 'تعديل الرد' : 'رد / تحديث'}
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            {isItemReplied ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', minWidth: '150px' }}>
                                <button
                                  type="button"
                                  onClick={() => setPreviewReplyRequest(reqItem)}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#0284c7',
                                    border: '1.5px solid #38bdf8',
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    fontSize: '11.5px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.1)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="معاينة قرار ورد إدارة المشتريات في نافذة مفصلة"
                                >
                                  <Eye size={13} color="#0284c7" />
                                  <span>معاينة رد المشتريات 👁️</span>
                                </button>

                                {reqItem.status !== 'converted_to_order' && !reqItem.converted_order_id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleConvertToOrder(reqItem)}
                                    style={{
                                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '8px',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '800',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title="فتح نافذة طلب عميل جديد ممتلئة تلقائياً ببيانات العميل والصنف والعربون"
                                  >
                                    <ShoppingBag size={13} color="#ffffff" />
                                    <span>إنشاء طلب العميل 🛍️</span>
                                  </button>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      border: '1px solid #86efac',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      fontWeight: '800',
                                      textAlign: 'center'
                                    }}
                                  >
                                    تم التحويل لطلب عميل ✅
                                  </span>
                                )}

                                {reqItem.customer_phone && (
                                  <button
                                    type="button"
                                    disabled={sendingWhatsAppId === reqItem.id}
                                    onClick={() => handleSendWhatsAppToCustomer(reqItem)}
                                    style={{
                                      background: reqItem.whatsapp_notified_at ? '#f0fdf4' : '#ecfdf5',
                                      color: '#065f46',
                                      border: '1.5px solid #10b981',
                                      borderRadius: '8px',
                                      padding: '5px 10px',
                                      fontSize: '11.5px',
                                      fontWeight: '800',
                                      cursor: sendingWhatsAppId === reqItem.id ? 'wait' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '5px',
                                      boxShadow: '0 1px 3px rgba(16, 185, 129, 0.15)',
                                      transition: 'all 0.15s ease'
                                    }}
                                    title="إرسال رسالة واتساب تفاعلية للعميل بالرد وموقف الصنف"
                                  >
                                    <Send size={13} color="#059669" />
                                    <span>
                                      {sendingWhatsAppId === reqItem.id
                                        ? 'جاري الإرسال...'
                                        : reqItem.whatsapp_notified_at
                                        ? 'إعادة إرسال واتساب 📲'
                                        : 'إرسال واتساب للعميل 📲'}
                                    </span>
                                  </button>
                                )}

                                {parseFloat(reqItem.deposit_amount) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleReprintInquiryReceipt(reqItem)}
                                    style={{
                                      background: '#f8fafc',
                                      color: '#334155',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '8px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px'
                                    }}
                                    title="إعادة طباعة إيصال استلام العربون (نسخة العميل + نسخة الصيدلية)"
                                  >
                                    <Printer size={12} color="#475569" />
                                    <span>طباعة إيصال العربون 🖨️</span>
                                  </button>
                                )}
                              </div>
                            ) : reqItem.has_complaint || escalatedInquiryIds.has(reqItem.id) ? (
                              <span
                                style={{
                                  fontSize: '11px',
                                  background: '#fef2f2',
                                  color: '#dc2626',
                                  border: '1px solid #fecaca',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  fontWeight: '800',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="تم تصعيد شكوى للمالك وإدارة المشتريات لعدم الرد"
                              >
                                <AlertTriangle size={12} />
                                <span>تم التصعيد 🚨</span>
                              </span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setComplaintTargetInquiry(reqItem);
                                    setComplaintNotes('');
                                  }}
                                  style={{
                                    background: '#fff1f2',
                                    color: '#e11d48',
                                    border: '1px solid #fecdd3',
                                    borderRadius: '6px',
                                    padding: '5px 9px',
                                    fontSize: '11.5px',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title="تصعيد شكوى للمالك والمشتريات لعدم الرد على هذا الاستعلام"
                                >
                                  <AlertTriangle size={13} color="#e11d48" />
                                  <span>تصعيد شكوى لعدم الرد 🚨</span>
                                </button>
                                {parseFloat(reqItem.deposit_amount) > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleReprintInquiryReceipt(reqItem)}
                                    style={{
                                      background: '#f8fafc',
                                      color: '#334155',
                                      border: '1px solid #cbd5e1',
                                      borderRadius: '6px',
                                      padding: '4px 8px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px'
                                    }}
                                    title="طباعة إيصال استلام العربون (نسخة العميل + نسخة الصيدلية)"
                                  >
                                    <Printer size={12} color="#475569" />
                                    <span>إيصال العربون 🖨️</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 1. نافذة تقديم استفسار / تصحيح بيانات / صنف جديد (للصيدلية) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {isNewRequestModalOpen && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isSubmitting && setIsNewRequestModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            className="outstock-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '860px',
              width: '100%',
              minHeight: '620px',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              overflow: 'hidden'
            }}
          >
            {/* رأس النافذة */}
            <div style={{ padding: '16px 22px', background: newRequestType === 'correction' ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' : newRequestType === 'new_item' ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {newRequestType === 'correction' ? <Edit size={20} /> : newRequestType === 'new_item' ? <PlusCircle size={20} /> : <HelpCircle size={20} />}
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                  {newRequestType === 'correction'
                    ? 'طلب تصحيح بيانات صنف مسجل بالكتالوج (مقارنة مباشرة)'
                    : newRequestType === 'new_item'
                    ? 'طلب اعتماد وإضافة صنف جديد كلياً بالكتالوج المركزي (Master Card)'
                    : 'تقديم استعلام سعر وتوفر دواء / مستحضر'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewRequestModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, minHeight: '520px' }}>
              {/* شارة التحقق من الموظف */}
              {authenticatedEmployee && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', fontSize: '13px', color: '#065f46' }}>
                  <ShieldCheck size={18} style={{ color: '#059669', flexShrink: 0 }} />
                  <div>
                    تم التحقق من هوية مقدم الطلب: <strong>{authenticatedEmployee.name}</strong> (كود: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{authenticatedEmployee.code}</span>)
                  </div>
                </div>
              )}

              {/* اختيار نوع الطلب الثلاثي */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  حدد نوع الطلب المطلوب:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'inquiry', label: 'استعلام سعر / توفر 🔍', color: '#0284c7', bg: '#e0f2fe' },
                    { id: 'correction', label: 'تصحيح بيانات صنف 📝', color: '#d97706', bg: '#fef3c7' },
                    { id: 'new_item', label: 'طلب صنف جديد كلياً 🌟', color: '#059669', bg: '#dcfce7' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setNewRequestType(t.id);
                        if (t.id === 'new_item' && selectedMed) {
                          setSelectedMed(null);
                          setMedicationName('');
                        }
                      }}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: newRequestType === t.id ? `2px solid ${t.color}` : '1px solid #cbd5e1',
                        background: newRequestType === t.id ? t.bg : '#f8fafc',
                        color: newRequestType === t.id ? t.color : '#475569',
                        boxShadow: newRequestType === t.id ? `0 2px 6px ${t.color}25` : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ══════════════════════════════════════════════════════════════ */}
              {/* ── 1. نموذج استعلام سعر وتوفر دواء / مستحضر ── */}
              {/* ══════════════════════════════════════════════════════════════ */}
              {newRequestType === 'inquiry' && (
                <>
                  {/* تصنيف الصنف وتوجيه الطلب */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                      تصنيف الصنف والجهة المختصة بالرد:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setItemType('medication')}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '9px',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          border: itemType === 'medication' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: itemType === 'medication' ? '#e0f2fe' : '#f8fafc',
                          color: itemType === 'medication' ? '#0369a1' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Pill size={16} color={itemType === 'medication' ? '#0284c7' : '#64748b'} />
                        <span>صنف دوائي (إدارة المشتريات) 💊</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setItemType('cosmetics')}
                        style={{
                          padding: '9px 12px',
                          borderRadius: '9px',
                          fontSize: '12px',
                          fontWeight: '800',
                          cursor: 'pointer',
                          border: itemType === 'cosmetics' ? '2px solid #ec4899' : '1px solid #cbd5e1',
                          background: itemType === 'cosmetics' ? '#fdf2f8' : '#f8fafc',
                          color: itemType === 'cosmetics' ? '#be185d' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Sparkles size={16} color={itemType === 'cosmetics' ? '#ec4899' : '#64748b'} />
                        <span>مستحضرات تجميل (مسؤول التجميل) 💄</span>
                      </button>
                    </div>
                  </div>

                  {/* اسم الصنف مع إكمال تلقائي */}
                  <div style={{ position: 'relative', zIndex: 100 }}>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                      اسم الصنف المستعلم عنه * :
                    </label>
                    <MedicationAutocompleteInput
                      value={medicationName}
                      selectedMed={selectedMed}
                      onMedicationSelect={(name, med) => {
                        setMedicationName(name);
                        setSelectedMed(med);
                        if (med) {
                          if (med.item_type) setItemType(med.item_type);
                          else if (med.category?.includes('تجميل')) setItemType('cosmetics');
                        }
                      }}
                      onTextChange={(val) => setMedicationName(val)}
                      placeholder="ابحث بالاسم التجاري أو الباركود..."
                      required
                    />
                  </div>

                  {/* الكمية والوحدة المطلوبة */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                        الكمية المطلوبة:
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={requestedQuantity}
                        onChange={(e) => setRequestedQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="outstock-form-input"
                        style={{ minHeight: '38px', fontWeight: 'bold' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                        الوحدة:
                      </label>
                      <select
                        value={requestedUnit}
                        onChange={(e) => setRequestedUnit(e.target.value)}
                        className="outstock-form-select"
                        style={{ minHeight: '38px', fontWeight: 'bold' }}
                      >
                        <option value="pack">علبة كاملة 📦</option>
                        <option value="strip">شريط 💊</option>
                        <option value="ampoule">أمبول / فيال 💉</option>
                        <option value="unit">وحدة / قطعة 🧴</option>
                      </select>
                    </div>
                  </div>

                  {/* بيانات العميل */}
                  <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <User size={15} color="#0284c7" />
                        <span>بيانات العميل (لحجز الصنف وإشعاره بالواتساب):</span>
                      </div>
                      {isSearchingCustomer && (
                        <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 'bold' }}>جاري البحث عن بيانات العميل...</span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          رقم هاتف العميل (11 رقم):
                        </label>
                        <input
                          type="tel"
                          maxLength={11}
                          placeholder="01xxxxxxxxx"
                          value={customerPhone}
                          onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '36px', direction: 'ltr', textAlign: 'right' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          اسم العميل:
                        </label>
                        <input
                          type="text"
                          placeholder="اكتب اسم العميل..."
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '36px' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          المنطقة / الحي المعتمد (من إعدادات المالك):
                        </label>
                        <select
                          value={customerZone}
                          onChange={(e) => setCustomerZone(e.target.value)}
                          className="outstock-form-select"
                          style={{ minHeight: '36px' }}
                        >
                          <option value="">-- اختر المنطقة / الحي --</option>
                          {deliveryZones.map((z) => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          تفاصيل الشارع / العنوان:
                        </label>
                        <input
                          type="text"
                          placeholder="الشارع، رقم العمارة، الشقة..."
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '36px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* العربون والدفع */}
                  <div style={{ background: '#f0fdf4', padding: '14px', borderRadius: '12px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Coins size={15} color="#15803d" />
                      <span>مبلغ العربون المستلم وطريقة الدفع:</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#166534', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          مبلغ العربون المسلم بالصيدلية (ج.م):
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0.00"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="outstock-form-input"
                          style={{ minHeight: '36px', fontWeight: 'bold', color: '#15803d' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11.5px', color: '#166534', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                          طريقة دفع العربون:
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="outstock-form-select"
                          style={{ minHeight: '36px', fontWeight: 'bold' }}
                        >
                          <option value="cash">نقدي (كاش) 💵</option>
                          <option value="card">بطاقة بنكية / فيزا 💳</option>
                          <option value="wallet">محفظة إلكترونية / إنستاباي 📱</option>
                          <option value="vodafone_cash">فودافون كاش 📱</option>
                          <option value="delayed">آجل ⏳</option>
                        </select>
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>
                      <input
                        type="checkbox"
                        checked={printThermalReceipt}
                        onChange={(e) => setPrintThermalReceipt(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                      />
                      <span>طباعة نسختين من الإيصال الحراري فور الإرسال (نسخة للعميل + نسخة للصيدلية) 🖨️</span>
                    </label>
                  </div>
                </>
              )}

              {/* ══════════════════════════════════════════════════════════════ */}
              {/* ── 2. نموذج طلب تصحيح بيانات صنف مسجل (مقارنة القديم بالجديد) ── */}
              {/* ══════════════════════════════════════════════════════════════ */}
              {newRequestType === 'correction' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* تحديد التصنيف */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setItemType('medication')}
                      style={{
                        padding: '9px 12px',
                        borderRadius: '9px',
                        fontSize: '12px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: itemType === 'medication' ? '2px solid #b45309' : '1px solid #cbd5e1',
                        background: itemType === 'medication' ? '#fef3c7' : '#f8fafc',
                        color: itemType === 'medication' ? '#92400e' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Pill size={16} color={itemType === 'medication' ? '#b45309' : '#64748b'} />
                      <span>صنف دوائي (كارتة أدوية) 💊</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('cosmetics')}
                      style={{
                        padding: '9px 12px',
                        borderRadius: '9px',
                        fontSize: '12px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: itemType === 'cosmetics' ? '2px solid #ec4899' : '1px solid #cbd5e1',
                        background: itemType === 'cosmetics' ? '#fdf2f8' : '#f8fafc',
                        color: itemType === 'cosmetics' ? '#be185d' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Sparkles size={16} color={itemType === 'cosmetics' ? '#ec4899' : '#64748b'} />
                      <span>مستحضرات تجميل (كارتة عناية وتجميل) 💄</span>
                    </button>
                  </div>

                  {/* البحث عن الصنف المسجل */}
                  <div style={{ position: 'relative', zIndex: 100 }}>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                      اختر الصنف المراد تصحيح بياناته من الكتالوج * :
                    </label>
                    <MedicationAutocompleteInput
                      value={medicationName}
                      selectedMed={selectedMed}
                      onMedicationSelect={(name, med) => {
                        setMedicationName(name);
                        setSelectedMed(med);
                        if (med) {
                          const oldVals = {
                            trade_name_en: med.trade_name || med.tradeName || med.name || name || '',
                            trade_name_ar: med.arabic_name || med.arabicName || '',
                            invoice_display_name: med.invoice_display_name || med.invoiceDisplayName || '',
                            public_price: med.public_price || med.price || '',
                            dosage_form: med.dosage_form || med.dosageForm || '',
                            pack_size: med.pack_size || med.packSize || 1,
                            unit_name: med.unit_name || med.unitName || 'علبة',
                            strength: med.strength || '',
                            active_ingredient: med.active_ingredient || med.activeIngredients || '',
                            manufacturer: med.manufacturer || med.company || '',
                            barcode: med.barcode || '',
                            brand: med.brand || '',
                            category: med.category || '',
                            skin_type: med.skin_type || '',
                            size_volume: med.size_volume || ''
                          };
                          setCorrectionOldValues(oldVals);
                          setCorrectionNewValues({ ...oldVals });
                          if (med.item_type) setItemType(med.item_type);
                          else if (med.category?.includes('تجميل')) setItemType('cosmetics');
                        }
                      }}
                      onTextChange={(val) => setMedicationName(val)}
                      placeholder="ابحث بالاسم التجاري أو الباركود لتحميل البيانات الحالية..."
                      required
                    />
                  </div>

                  {/* جدول المقارنة جنباً إلى جنب بين البند القديم والجديد */}
                  {selectedMed ? (
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                      <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                          <Tag size={15} color="#b45309" />
                          <span>كارتة المقارنة المباشرة: (البند القديم المخزن ↔ البند الجديد المراد تعديله)</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          عدّل فقط البنود المراد تصحيحها وسيتم إبرازها تلقائياً
                        </span>
                      </div>

                      {(() => {
                        const isCosm = itemType === 'cosmetics';
                        const fields = isCosm ? [
                          { id: 'trade_name_ar', label: 'الاسم التجاري (عربي)', type: 'text' },
                          { id: 'trade_name_en', label: 'الاسم التجاري (إنجليزي)', type: 'text' },
                          { id: 'brand', label: 'الماركة / البراند', type: 'text' },
                          { id: 'category', label: 'التصنيف', type: 'text' },
                          { id: 'skin_type', label: 'نوع البشرة / الاستخدام', type: 'text' },
                          { id: 'public_price', label: 'سعر الجمهور الرسمي (ج.م)', type: 'number', step: '0.25' },
                          { id: 'size_volume', label: 'الحجم / السعة', type: 'text' },
                          { id: 'manufacturer', label: 'الشركة / بلد المنشأ', type: 'text' },
                          { id: 'barcode', label: 'الباركود الدولي', type: 'text' }
                        ] : [
                          { id: 'trade_name_ar', label: 'الاسم التجاري (عربي)', type: 'text' },
                          { id: 'trade_name_en', label: 'الاسم التجاري (إنجليزي)', type: 'text' },
                          { id: 'invoice_display_name', label: 'الاسم المختصر بالفاتورة', type: 'text' },
                          { id: 'public_price', label: 'سعر الجمهور الرسمي (ج.م)', type: 'number', step: '0.25' },
                          { id: 'dosage_form', label: 'الشكل الدوائي', type: 'select', options: ['أقراص', 'كبسولات', 'شراب', 'معلق', 'أمبولات', 'فيال', 'مرهم', 'كريم', 'جل', 'نقط عين', 'نقط أذن', 'نقط أنف', 'بخاخ', 'فوار / أكياس', 'لبوس', 'محلول'] },
                          { id: 'pack_size', label: 'حجم العبوة (عدد الوحدات)', type: 'number', step: '1' },
                          { id: 'unit_name', label: 'وحدة البيع', type: 'select', options: ['علبة', 'شريط', 'أمبول', 'زجاجة', 'قطعة', 'كيس'] },
                          { id: 'strength', label: 'التركيز', type: 'text' },
                          { id: 'active_ingredient', label: 'المادة الفعالة', type: 'text' },
                          { id: 'manufacturer', label: 'الشركة المصنعة', type: 'text' },
                          { id: 'barcode', label: 'الباركود الدولي', type: 'text' }
                        ];

                        return (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="outstock-diff-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                                  <th style={{ padding: '8px 12px', fontWeight: 800 }}>البند والمواصفة</th>
                                  <th style={{ padding: '8px 12px', fontWeight: 800, color: '#64748b' }}>البند القديم المخزن بالنظام</th>
                                  <th style={{ padding: '8px 12px', fontWeight: 800, color: '#0369a1' }}>البند الجديد المراد تعديله</th>
                                  <th style={{ padding: '8px 8px', fontWeight: 800, textAlign: 'center', width: '70px' }}>الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {fields.map((f) => {
                                  const oldVal = correctionOldValues[f.id] !== undefined && correctionOldValues[f.id] !== null && correctionOldValues[f.id] !== '' ? String(correctionOldValues[f.id]) : '—';
                                  const newVal = correctionNewValues[f.id] !== undefined && correctionNewValues[f.id] !== null ? String(correctionNewValues[f.id]) : '';
                                  const isChanged = newVal && newVal !== oldVal && oldVal !== '—';

                                  return (
                                    <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9', background: isChanged ? '#f0fdf4' : 'transparent' }}>
                                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>
                                        {f.label}
                                      </td>
                                      <td style={{ padding: '8px 12px', color: '#64748b' }}>
                                        <span className="outstock-diff-old-val">
                                          {f.id === 'public_price' && oldVal !== '—' ? `${parseFloat(oldVal).toFixed(2)} ج.م` : oldVal}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 12px' }}>
                                        {f.type === 'select' ? (
                                          <select
                                            value={newVal}
                                            onChange={(e) => setCorrectionNewValues({ ...correctionNewValues, [f.id]: e.target.value })}
                                            className="outstock-form-select"
                                            style={{
                                              minHeight: '32px',
                                              fontSize: '12px',
                                              fontWeight: isChanged ? '800' : '600',
                                              borderColor: isChanged ? '#10b981' : '#cbd5e1',
                                              background: isChanged ? '#ecfdf5' : '#ffffff'
                                            }}
                                          >
                                            <option value="">-- اختر --</option>
                                            {f.options.map((opt) => (
                                              <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                          </select>
                                        ) : (
                                          <input
                                            type={f.type}
                                            step={f.step}
                                            value={newVal}
                                            onChange={(e) => setCorrectionNewValues({ ...correctionNewValues, [f.id]: e.target.value })}
                                            placeholder={`أدخل ${f.label}...`}
                                            className="outstock-form-input"
                                            style={{
                                              minHeight: '32px',
                                              fontSize: '12px',
                                              fontWeight: isChanged ? '800' : '600',
                                              borderColor: isChanged ? '#10b981' : '#cbd5e1',
                                              background: isChanged ? '#ecfdf5' : '#ffffff',
                                              color: isChanged ? '#047857' : '#0f172a'
                                            }}
                                          />
                                        )}
                                      </td>
                                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                        {isChanged ? (
                                          <span style={{ fontSize: '10.5px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                            معدل ✨
                                          </span>
                                        ) : (
                                          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>مطابق</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ background: '#fffbeb', border: '1px dashed #fde68a', borderRadius: '10px', padding: '16px', textAlign: 'center', color: '#92400e', fontSize: '12.5px' }}>
                      👆 يرجى البحث واختيار الصنف المراد تصحيح بياناته من الكتالوج أعلاه لعرض كارتة المقارنة جنباً إلى جنب
                    </div>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════ */}
              {/* ── 3. نموذج طلب اعتماد صنف جديد كلياً (Master Card كاملة) ── */}
              {/* ══════════════════════════════════════════════════════════════ */}
              {newRequestType === 'new_item' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* تبويب التصنيف: دواء أو تجميل */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setItemType('medication');
                        setNewItemCard({ ...newItemCard, item_type: 'medication' });
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: itemType === 'medication' ? '2px solid #059669' : '1px solid #cbd5e1',
                        background: itemType === 'medication' ? '#dcfce7' : '#f8fafc',
                        color: itemType === 'medication' ? '#065f46' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Pill size={16} color={itemType === 'medication' ? '#059669' : '#64748b'} />
                      <span>صنف دوائي (كارتة أدوية) 💊</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setItemType('cosmetics');
                        setNewItemCard({ ...newItemCard, item_type: 'cosmetics' });
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        border: itemType === 'cosmetics' ? '2px solid #ec4899' : '1px solid #cbd5e1',
                        background: itemType === 'cosmetics' ? '#fdf2f8' : '#f8fafc',
                        color: itemType === 'cosmetics' ? '#be185d' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Sparkles size={16} color={itemType === 'cosmetics' ? '#ec4899' : '#64748b'} />
                      <span>مستحضرات تجميل (كارتة عناية) 💄</span>
                    </button>
                  </div>

                  {/* حقول كارتة الصنف الكاملة (Master Card) */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pill size={16} color="#059669" />
                      <span>بيانات كارتة الصنف الكاملة (Master Card):</span>
                    </div>

                    {itemType === 'medication' ? (
                      /* حقول الدواء الكاملة */
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الاسم التجاري (إنجليزي) * :
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="مثال: Panadol Extra 500mg"
                              value={newItemCard.trade_name_en}
                              onChange={(e) => {
                                setNewItemCard({ ...newItemCard, trade_name_en: e.target.value });
                                setMedicationName(e.target.value);
                              }}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الاسم التجاري (عربي):
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: بنادول إكسترا أقراص"
                              value={newItemCard.trade_name_ar}
                              onChange={(e) => setNewItemCard({ ...newItemCard, trade_name_ar: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الاسم المختصر بالفاتورة:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: Panadol Extra"
                              value={newItemCard.invoice_display_name}
                              onChange={(e) => setNewItemCard({ ...newItemCard, invoice_display_name: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الشكل الدوائي:
                            </label>
                            <select
                              value={newItemCard.dosage_form}
                              onChange={(e) => setNewItemCard({ ...newItemCard, dosage_form: e.target.value })}
                              className="outstock-form-select"
                              style={{ minHeight: '36px' }}
                            >
                              {['أقراص', 'كبسولات', 'شراب', 'معلق', 'أمبولات', 'فيال', 'مرهم', 'كريم', 'جل', 'نقط عين', 'نقط أذن', 'نقط أنف', 'بخاخ', 'فوار / أكياس', 'لبوس', 'محلول'].map((df) => (
                                <option key={df} value={df}>{df}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              سعر الجمهور الرسمي (ج.م) * :
                            </label>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              required
                              placeholder="0.00"
                              value={newItemCard.public_price}
                              onChange={(e) => setNewItemCard({ ...newItemCard, public_price: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontWeight: 'bold', color: '#059669' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              حجم العبوة (عدد الوحدات):
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={newItemCard.pack_size}
                              onChange={(e) => setNewItemCard({ ...newItemCard, pack_size: parseInt(e.target.value, 10) || 1 })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              وحدة البيع:
                            </label>
                            <select
                              value={newItemCard.unit_name}
                              onChange={(e) => setNewItemCard({ ...newItemCard, unit_name: e.target.value })}
                              className="outstock-form-select"
                              style={{ minHeight: '36px' }}
                            >
                              <option value="علبة">علبة 📦</option>
                              <option value="شريط">شريط 💊</option>
                              <option value="أمبول">أمبول 💉</option>
                              <option value="زجاجة">زجاجة 🍾</option>
                              <option value="قطعة">قطعة 🧴</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              المادة الفعالة:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: Paracetamol + Caffeine"
                              value={newItemCard.active_ingredient}
                              onChange={(e) => setNewItemCard({ ...newItemCard, active_ingredient: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              التركيز:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: 500mg / 65mg"
                              value={newItemCard.strength}
                              onChange={(e) => setNewItemCard({ ...newItemCard, strength: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الشركة المصنعة / الموزع:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: GlaxoSmithKline (GSK)"
                              value={newItemCard.manufacturer}
                              onChange={(e) => setNewItemCard({ ...newItemCard, manufacturer: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الباركود الدولي:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: 6221234567890"
                              value={newItemCard.barcode}
                              onChange={(e) => setNewItemCard({ ...newItemCard, barcode: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontFamily: 'monospace' }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                            ظروف التخزين:
                          </label>
                          <select
                            value={newItemCard.storage_condition}
                            onChange={(e) => setNewItemCard({ ...newItemCard, storage_condition: e.target.value })}
                            className="outstock-form-select"
                            style={{ minHeight: '36px' }}
                          >
                            <option value="room_temp">درجة حرارة الغرفة (أقل من 30 درجة مئوية) 🌡️</option>
                            <option value="fridge">ثلاجة (2 - 8 درجات مئوية) ❄️</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      /* حقول مستحضرات التجميل الكاملة */
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              اسم المنتج (عربي) * :
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="مثال: لاروش بوزيه إيفاكلار غسول"
                              value={newItemCard.trade_name_ar}
                              onChange={(e) => {
                                setNewItemCard({ ...newItemCard, trade_name_ar: e.target.value });
                                setMedicationName(e.target.value);
                              }}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              اسم المنتج (إنجليزي):
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: La Roche-Posay Effaclar Gel"
                              value={newItemCard.trade_name_en}
                              onChange={(e) => setNewItemCard({ ...newItemCard, trade_name_en: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              البراند / الماركة * :
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="مثال: La Roche-Posay / Cerave / Vichy"
                              value={newItemCard.brand}
                              onChange={(e) => setNewItemCard({ ...newItemCard, brand: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              التصنيف:
                            </label>
                            <select
                              value={newItemCard.category}
                              onChange={(e) => setNewItemCard({ ...newItemCard, category: e.target.value })}
                              className="outstock-form-select"
                              style={{ minHeight: '36px' }}
                            >
                              {['عناية بالبشرة', 'عناية بالشعر', 'واقي شمس', 'مرطبات', 'تفتيح ونضارة', 'عناية بالطفل', 'مكياج وتجميل', 'عطور ومزيلات عرق', 'عناية شخصية'].map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              سعر الجمهور (ج.م) * :
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              required
                              placeholder="0.00"
                              value={newItemCard.public_price}
                              onChange={(e) => setNewItemCard({ ...newItemCard, public_price: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontWeight: 'bold', color: '#be185d' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الحجم / السعة:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: 200ml / 50g"
                              value={newItemCard.size_volume}
                              onChange={(e) => setNewItemCard({ ...newItemCard, size_volume: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              نوع البشرة / الاستخدام:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: للبشرة الدهنية والحساسة"
                              value={newItemCard.skin_type}
                              onChange={(e) => setNewItemCard({ ...newItemCard, skin_type: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الشركة / بلد المنشأ:
                            </label>
                            <input
                              type="text"
                              placeholder="مثال: France / L'Oréal"
                              value={newItemCard.manufacturer}
                              onChange={(e) => setNewItemCard({ ...newItemCard, manufacturer: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                              الباركود الدولي:
                            </label>
                            <input
                              type="text"
                              placeholder="الباركود..."
                              value={newItemCard.barcode}
                              onChange={(e) => setNewItemCard({ ...newItemCard, barcode: e.target.value })}
                              className="outstock-form-input"
                              style={{ minHeight: '36px', fontFamily: 'monospace' }}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ملاحظات واستفسار */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '4px' }}>
                  {newRequestType === 'correction'
                    ? 'سبب طلب تصحيح بيانات الصنف * (إلزامي لتوثيق التعديل لإدارة المشتريات):'
                    : newRequestType === 'new_item'
                    ? 'ملاحظات إضافية حول الصنف الجديد ومصدر التسعيرة:'
                    : 'ملاحظات أو تفاصيل الاستفسار:'}
                </label>
                <textarea
                  rows={2}
                  required={newRequestType === 'correction'}
                  placeholder={
                    newRequestType === 'correction'
                      ? 'اكتب سبب التعديل بدقة (مثل: منشور تسعيرة رسمي جديد من هيئة الدواء، تصحيح عدد أشرطة العبوة، تحديث الباركود)...'
                      : 'اكتب أي ملاحظات للمشتريات...'
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="outstock-form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* إرفاق صورة للصنف أو الروشتة أو مستند التسعيرة */}
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Camera size={16} color="#0284c7" />
                  <span>
                    {newRequestType === 'correction'
                      ? 'إرفاق صورة للعبوة أو مستند التسعيرة / الباركود (اختياري ومستحسن):'
                      : newRequestType === 'new_item'
                      ? 'إرفاق صورة عبوة الصنف الجديد والباركود:'
                      : 'إرفاق صورة للصنف أو الروشتة (اختياري):'}
                  </span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1.5px dashed #94a3b8',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    <UploadCloud size={16} color="#0284c7" />
                    <span>{attachmentImage ? 'تغيير الصورة المرفقة' : 'رفع صورة (كاميرا أو ملف)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          showToast('⚠️ حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
                          return;
                        }
                        setAttachmentName(file.name);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setAttachmentImage(event.target.result);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>

                  {attachmentImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '8px' }}>
                      <img
                        src={attachmentImage}
                        alt="معاينة"
                        onClick={() => setPreviewImageUrl(attachmentImage)}
                        style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid #86efac' }}
                        title="انقر لتكبير الصورة"
                      />
                      <span style={{ fontSize: '11px', color: '#166534', fontWeight: 'bold' }}>
                        {attachmentName || 'تم إرفاق الصورة'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachmentImage(null);
                          setAttachmentName('');
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="حذف الصورة"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* الأزرار */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  disabled={isSubmitting}
                  className="outstock-btn outstock-btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="outstock-btn outstock-btn-primary"
                  style={{
                    background: newRequestType === 'correction'
                      ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
                      : newRequestType === 'new_item'
                      ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
                      : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  }}
                >
                  {isSubmitting
                    ? 'جاري الإرسال...'
                    : newRequestType === 'correction'
                    ? 'إرسال طلب التصحيح للمشتريات 📝'
                    : newRequestType === 'new_item'
                    ? 'إرسال طلب اعتماد الصنف الجديد 🌟'
                    : 'إرسال الاستعلام للمشتريات ✉️'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 2. نافذة الرد وتحديث الحالة (لإدارة المشتريات) ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* ── 3. نافذة تسجيل رد المشتريات وجدول تسعير وتوفير الأصناف ── */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {replyTargetRequest && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isReplying && setReplyTargetRequest(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          {replyTargetRequest.request_type === 'correction' ? (
            /* ══════════════════════════════════════════════════════════════════ */
            /* ── 1. نموذج رد المشتريات: مراجعة وتدقيق طلب تصحيح بيانات الصنف ── */
            /* ══════════════════════════════════════════════════════════════════ */
            <div
              className="outstock-modal-panel"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '840px', width: '100%', background: '#ffffff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}
            >
              <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileEdit size={22} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                      تدقيق واعتماد تصحيح بيانات الصنف: {replyTargetRequest.medication_name}
                    </h3>
                    <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
                      مقارنة دقيقة بين البيانات الحالية بالكتالوج والتعديل المقترح من الفرع
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTargetRequest(null)}
                  style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '82vh', overflowY: 'auto' }}>
                {/* شريط معلومات الفرع والطلب */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#92400e', fontWeight: '700' }}>🏢 الفرع الطالب: </span>
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{replyTargetRequest.branch_name || 'فرع الصيدلية'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#92400e', fontWeight: '700' }}>👤 الصيدلي: </span>
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{replyTargetRequest.employee_name || replyTargetRequest.requested_by || 'صيدلي الفرع'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#92400e', fontWeight: '700' }}>🕒 تاريخ الطلب: </span>
                    <span style={{ fontWeight: '700', color: '#475569' }}>
                      {replyTargetRequest.created_at ? new Date(replyTargetRequest.created_at).toLocaleString('ar-EG') : 'الآن'}
                    </span>
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #fde68a', paddingTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#92400e', fontWeight: '800' }}>📝 سبب طلب التصحيح: </span>
                      <span style={{ color: '#78350f', fontWeight: '700' }}>
                        {replyTargetRequest.pharmacist_notes || replyTargetRequest.notes || 'لم يحدد سبب نصي'}
                      </span>
                    </div>
                    {replyTargetRequest.attachment_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(replyTargetRequest.attachment_url)}
                        className="outstock-btn"
                        style={{ padding: '4px 10px', fontSize: '11px', background: '#ffffff', border: '1px solid #f59e0b', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Camera size={13} />
                        <span>معاينة صورة المستند / العبوة 📷</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* جدول مقارنة الفروق Side-by-Side Diff Table */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={16} color="#d97706" />
                      <span>جدول مقارنة البيانات (القديم المخزن بالكتالوج vs التعديل المقترح):</span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      💡 يمكنك تعديل وتدقيق القيم المقترحة مباشرة قبل اعتمادها
                    </span>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '9px 12px', fontWeight: '800', width: '25%' }}>البيان / الحقل</th>
                          <th style={{ padding: '9px 12px', fontWeight: '800', width: '32%', background: '#f1f5f9' }}>
                            القيمة الحالية المخزنة بالنظام
                          </th>
                          <th style={{ padding: '9px 12px', fontWeight: '800', width: '33%' }}>
                            التعديل المقترح (قابل للتدقيق)
                          </th>
                          <th style={{ padding: '9px 10px', fontWeight: '800', width: '10%', textAlign: 'center' }}>
                            الحالة
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const oldV = replyTargetRequest.proposed_data?.old_values || {};
                          const newV = correctionEditableNewVals || replyTargetRequest.proposed_data?.new_values || {};
                          const isCosm = replyTargetRequest.item_type === 'cosmetics' || replyTargetRequest.proposed_data?.item_category === 'cosmetics';

                          const fieldsList = isCosm
                            ? [
                                { key: 'trade_name_ar', label: 'اسم المنتج (عربي)', icon: '💄' },
                                { key: 'trade_name_en', label: 'اسم المنتج (إنجليزي)', icon: '🔤' },
                                { key: 'public_price', label: 'سعر الجمهور الرسمي (ج.م)', icon: '💰', isNumeric: true },
                                { key: 'dosage_form', label: 'التصنيف / النوع', icon: '🧴' },
                                { key: 'pack_size', label: 'حجم العبوة (الحجم/السعة)', icon: '📦' },
                                { key: 'unit_name', label: 'الوحدة الصغرى', icon: '📏' },
                                { key: 'manufacturer', label: 'البراند / الماركة', icon: '🏢' },
                                { key: 'barcode', label: 'الباركود الدولي', icon: '📊' }
                              ]
                            : [
                                { key: 'trade_name_ar', label: 'اسم الصنف (عربي)', icon: '💊' },
                                { key: 'trade_name_en', label: 'اسم الصنف (إنجليزي)', icon: '🔤' },
                                { key: 'invoice_display_name', label: 'الاسم المطبوع بالفاتورة', icon: '🧾' },
                                { key: 'public_price', label: 'سعر الجمهور الرسمي (ج.م)', icon: '💰', isNumeric: true },
                                { key: 'dosage_form', label: 'الشكل الصيدلي', icon: '🧪' },
                                { key: 'pack_size', label: 'حجم العبوة (أشرطة/وحدات)', icon: '📦', isNumeric: true },
                                { key: 'unit_name', label: 'اسم الوحدة الصغرى', icon: '📏' },
                                { key: 'strength', label: 'التركيز', icon: '⚡' },
                                { key: 'active_ingredient', label: 'المادة الفعالة', icon: '🔬' },
                                { key: 'manufacturer', label: 'الشركة المصنعة / الموزع', icon: '🏢' },
                                { key: 'barcode', label: 'الباركود الدولي', icon: '📊' }
                              ];

                          return fieldsList.map((fld) => {
                            const oldVal = oldV[fld.key] !== undefined && oldV[fld.key] !== null ? String(oldV[fld.key]) : '';
                            const newVal = newV[fld.key] !== undefined && newV[fld.key] !== null ? String(newV[fld.key]) : '';
                            const isChanged = oldVal.trim() !== newVal.trim() && newVal.trim() !== '';

                            return (
                              <tr
                                key={fld.key}
                                style={{
                                  borderBottom: '1px solid #f1f5f9',
                                  background: isChanged ? '#fffbeb' : '#ffffff',
                                  transition: 'background 0.2s ease'
                                }}
                              >
                                <td style={{ padding: '8px 12px', fontWeight: '700', color: '#334155' }}>
                                  <span style={{ marginLeft: '6px' }}>{fld.icon}</span>
                                  {fld.label}
                                </td>
                                <td style={{ padding: '8px 12px', background: '#f8fafc', color: '#475569', fontFamily: fld.isNumeric ? 'monospace' : 'inherit' }}>
                                  {oldVal || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>غير محدد</span>}
                                </td>
                                <td style={{ padding: '6px 12px' }}>
                                  <input
                                    type={fld.isNumeric ? 'number' : 'text'}
                                    step={fld.key === 'public_price' ? '0.5' : undefined}
                                    value={newV[fld.key] !== undefined ? newV[fld.key] : ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setCorrectionEditableNewVals((prev) => ({
                                        ...(prev || {}),
                                        [fld.key]: val
                                      }));
                                    }}
                                    placeholder={oldVal || 'القيمة الجديدة...'}
                                    className="outstock-form-input"
                                    style={{
                                      minHeight: '30px',
                                      fontSize: '12px',
                                      fontWeight: isChanged ? '800' : 'normal',
                                      color: isChanged ? '#b45309' : '#1e293b',
                                      borderColor: isChanged ? '#f59e0b' : '#cbd5e1',
                                      background: isChanged ? '#ffffff' : '#fcfdfe'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  {isChanged ? (
                                    <span style={{ fontSize: '10.5px', fontWeight: '800', background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                      ⚡ مُعدل
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>مطابق</span>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ملاحظات المشتريات */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    ملاحظات إضافية وتوجيهات للفرع (اختياري):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="اكتب أي ملاحظات للفرع أو توجيهات حول تسعير وتوفير الصنف..."
                    value={replyNotes}
                    onChange={(e) => setReplyNotes(e.target.value)}
                    className="outstock-form-input"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {/* صندوق إدخال سبب الخطأ عند النقر على "التعديل المرسل خطأ" */}
                {showRejectBox && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: '800', fontSize: '13px' }}>
                      <AlertTriangle size={16} />
                      <span>سبب الخطأ في التعديل المرسل (إلزامي لإشعار الفرع به):</span>
                    </div>
                    <textarea
                      rows={2}
                      required
                      placeholder="وضح سبب خطأ التعديل بدقة للفرع (مثال: التسعيرة الرسمية للعلبة لا تزال 45 ج.م حسب منشور الإدارة المركزية للشؤون الصيدلية، أو عدد الأشرطة بالكتالوج سليم)..."
                      value={correctionRejectionReason}
                      onChange={(e) => setCorrectionRejectionReason(e.target.value)}
                      className="outstock-form-input"
                      style={{ borderColor: '#ef4444', background: '#ffffff', color: '#7f1d1d' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setShowRejectBox(false)}
                        className="outstock-btn outstock-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                      >
                        إلغاء التراجع
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectCorrection}
                        disabled={isReplying || !correctionRejectionReason.trim()}
                        className="outstock-btn"
                        style={{ background: '#dc2626', color: '#ffffff', padding: '6px 14px', fontSize: '12px', fontWeight: '800' }}
                      >
                        {isReplying ? 'جاري الإرسال...' : 'تأكيد إشعار الفرع بأن التعديل خطأ ❌'}
                      </button>
                    </div>
                  </div>
                )}

                {/* شريط القرارات الصريحة المطلوبة */}
                {!showRejectBox && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setReplyTargetRequest(null)}
                      disabled={isReplying}
                      className="outstock-btn outstock-btn-secondary"
                    >
                      إغلاق
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowRejectBox(true)}
                        disabled={isReplying}
                        className="outstock-btn"
                        style={{
                          background: '#fff1f2',
                          color: '#be123c',
                          border: '1.5px solid #fecdd3',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <XCircle size={16} />
                        <span>التعديل المرسل خطأ ❌</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveCorrection}
                        disabled={isReplying}
                        className="outstock-btn"
                        style={{
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          color: '#ffffff',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                        }}
                      >
                        <CheckCircle size={16} />
                        <span>{isReplying ? 'جاري الاعتماد والتطبيق...' : 'تم التعديل واعتماد البيانات بالكتالوج ✅'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : replyTargetRequest.request_type === 'new_item' ? (
            /* ══════════════════════════════════════════════════════════════════ */
            /* ── 2. نموذج رد المشتريات: مراجعة واعتماد إضافة صنف جديد بالكتالوج ── */
            /* ══════════════════════════════════════════════════════════════════ */
            <div
              className="outstock-modal-panel"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '840px', width: '100%', background: '#ffffff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}
            >
              <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <PackagePlus size={22} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                      تدقيق واعتماد إضافة صنف جديد بالكتالوج: {replyTargetRequest.medication_name}
                    </h3>
                    <div style={{ fontSize: '11.5px', opacity: 0.9, marginTop: '2px' }}>
                      مراجعة كارتة الصنف الرئيسية (Master Card) قبل حفظها وإشعار الفرع
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTargetRequest(null)}
                  style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '82vh', overflowY: 'auto' }}>
                {/* شريط معلومات الطلب والفرع */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: '#166534', fontWeight: '700' }}>🏢 الفرع الطالب: </span>
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{replyTargetRequest.branch_name || 'فرع الصيدلية'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#166534', fontWeight: '700' }}>👤 الصيدلي: </span>
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{replyTargetRequest.employee_name || replyTargetRequest.requested_by || 'صيدلي الفرع'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#166534', fontWeight: '700' }}>🕒 تاريخ الطلب: </span>
                    <span style={{ fontWeight: '700', color: '#475569' }}>
                      {replyTargetRequest.created_at ? new Date(replyTargetRequest.created_at).toLocaleString('ar-EG') : 'الآن'}
                    </span>
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #bbf7d0', paddingTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ color: '#166534', fontWeight: '800' }}>📝 ملاحظات الصيدلي ومصدر الصنف: </span>
                      <span style={{ color: '#14532d', fontWeight: '700' }}>
                        {replyTargetRequest.pharmacist_notes || replyTargetRequest.notes || 'لم يحدد ملاحظات'}
                      </span>
                    </div>
                    {replyTargetRequest.attachment_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(replyTargetRequest.attachment_url)}
                        className="outstock-btn"
                        style={{ padding: '4px 10px', fontSize: '11px', background: '#ffffff', border: '1px solid #10b981', color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <Camera size={13} />
                        <span>معاينة صورة الصنف / الباركود 📷</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* كارتة الصنف الرئيسية Master Card للتدقيق */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Pill size={16} color="#059669" />
                    <span>مراجعة وتدقيق حقول كارتة الصنف (Master Card) قبل الحفظ بالكتالوج:</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        الاسم التجاري (عربي) * :
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.trade_name_ar || newItemReplyData?.arabicName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, trade_name_ar: val, arabicName: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px', fontWeight: 'bold' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        الاسم التجاري (إنجليزي) * :
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.trade_name_en || newItemReplyData?.tradeName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, trade_name_en: val, tradeName: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        سعر الجمهور الرسمي (ج.م) * :
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={newItemReplyData?.public_price || newItemReplyData?.price || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, public_price: val, price: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px', fontWeight: 'bold', color: '#15803d' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        الشكل الصيدلي:
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.dosage_form || newItemReplyData?.dosageForm || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, dosage_form: val, dosageForm: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        حجم العبوة (أشرطة/وحدات):
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newItemReplyData?.pack_size || newItemReplyData?.packSize || 1}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 1;
                          setNewItemReplyData((prev) => ({ ...prev, pack_size: val, packSize: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        المادة الفعالة:
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.active_ingredient || newItemReplyData?.activeIngredients || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, active_ingredient: val, activeIngredients: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        التركيز:
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.strength || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, strength: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        الشركة المصنعة / الموزع:
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.manufacturer || newItemReplyData?.company || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, manufacturer: val, company: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>
                        الباركود الدولي:
                      </label>
                      <input
                        type="text"
                        value={newItemReplyData?.barcode || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItemReplyData((prev) => ({ ...prev, barcode: val }));
                        }}
                        className="outstock-form-input"
                        style={{ minHeight: '34px', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                {/* صندوق سبب الرفض عند النقر على "رفض إضافة الصنف" */}
                {showRejectBox && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: '800', fontSize: '13px' }}>
                      <AlertTriangle size={16} />
                      <span>سبب رفض إضافة الصنف (إلزامي لإشعار الفرع به):</span>
                    </div>
                    <textarea
                      rows={2}
                      required
                      placeholder="وضح سبب رفض الصنف للفرع (مثال: صنف مهرب غير مسجل بهيئة الدواء، أو الصنف موجود بالفعل بالكتالوج باسم تجاري آخر)..."
                      value={correctionRejectionReason}
                      onChange={(e) => setCorrectionRejectionReason(e.target.value)}
                      className="outstock-form-input"
                      style={{ borderColor: '#ef4444', background: '#ffffff', color: '#7f1d1d' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setShowRejectBox(false)}
                        className="outstock-btn outstock-btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                      >
                        إلغاء التراجع
                      </button>
                      <button
                        type="button"
                        onClick={handleRejectNewItem}
                        disabled={isReplying || !correctionRejectionReason.trim()}
                        className="outstock-btn"
                        style={{ background: '#dc2626', color: '#ffffff', padding: '6px 14px', fontSize: '12px', fontWeight: '800' }}
                      >
                        {isReplying ? 'جاري الإرسال...' : 'تأكيد رفض إضافة الصنف ❌'}
                      </button>
                    </div>
                  </div>
                )}

                {/* أزرار القرار */}
                {!showRejectBox && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setReplyTargetRequest(null)}
                      disabled={isReplying}
                      className="outstock-btn outstock-btn-secondary"
                    >
                      إغلاق
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowRejectBox(true)}
                        disabled={isReplying}
                        className="outstock-btn"
                        style={{
                          background: '#fff1f2',
                          color: '#be123c',
                          border: '1.5px solid #fecdd3',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <XCircle size={16} />
                        <span>رفض إضافة الصنف ❌</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApproveNewItemWithData}
                        disabled={isReplying}
                        className="outstock-btn"
                        style={{
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          color: '#ffffff',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                        }}
                      >
                        <CheckCircle size={16} />
                        <span>{isReplying ? 'جاري الاعتماد والإضافة...' : 'اعتماد وإضافة الصنف للكتالوج المركزي وإشعار الفرع 🚀'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════════════ */
            /* ── 3. نموذج رد المشتريات: جدول تسعير وتوفير أصناف الاستعلام ── */
            /* ══════════════════════════════════════════════════════════════════ */
            <div
              className="outstock-modal-panel"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '680px', width: '100%', background: '#ffffff', borderRadius: '18px', overflow: 'hidden' }}
            >
              <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pill size={20} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                    رد إدارة المشتريات وتسعير الأصناف: {replyTargetRequest.medication_name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTargetRequest(null)}
                  style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                    تحديث حالة المعاملة:
                  </label>
                  <select
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value)}
                    className="outstock-form-select"
                    style={{ fontWeight: 'bold' }}
                  >
                    <option value="resolved">✅ تم الرد والمعالجة بنجاح</option>
                    <option value="approved">⭐ معتمد رسمياً</option>
                    <option value="rejected">❌ رفض الطلب</option>
                  </select>
                </div>

                {/* 📋 جدول الأصناف للتسعير وتحديد إمكانية التوفير 📋 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Pill size={16} color="#0284c7" />
                      <span>جدول الأصناف لتحديد السعر وإمكانية التوفير:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyItems((prev) => [
                          ...prev,
                          { medicationName: '', quantity: 1, unit: 'علبة', price: '', isAvailable: true, notes: '' }
                        ]);
                      }}
                      style={{
                        background: '#eff6ff',
                        color: '#0284c7',
                        border: '1px solid #bfdbfe',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: '800',
                        cursor: 'pointer'
                      }}
                    >
                      + إضافة صنف / بديل إضافي
                    </button>
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '8px 10px', fontWeight: 800 }}>الصنف الدوائي</th>
                          <th style={{ padding: '8px 8px', fontWeight: 800, width: '90px' }}>الكمية</th>
                          <th style={{ padding: '8px 8px', fontWeight: 800, width: '125px', textAlign: 'center' }}>سعر الصنف (ج.م)</th>
                          <th style={{ padding: '8px 8px', fontWeight: 800, width: '135px', textAlign: 'center' }}>إمكانية التوفير</th>
                          <th style={{ padding: '8px 6px', fontWeight: 800, width: '32px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {replyItems.map((itemRow, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: itemRow.isAvailable ? '#ffffff' : '#fff5f5' }}>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                value={itemRow.medicationName}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReplyItems((prev) => prev.map((it, i) => (i === idx ? { ...it, medicationName: val } : it)));
                                }}
                                placeholder="اسم الصنف..."
                                className="outstock-form-input"
                                style={{ minHeight: '32px', fontSize: '12px', fontWeight: 'bold' }}
                              />
                              <input
                                type="text"
                                value={itemRow.notes || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReplyItems((prev) => prev.map((it, i) => (i === idx ? { ...it, notes: val } : it)));
                                }}
                                placeholder="ملاحظات المشتريات / البديل المقترح..."
                                className="outstock-form-input"
                                style={{ minHeight: '26px', fontSize: '11px', marginTop: '4px', color: '#64748b' }}
                              />
                            </td>
                            <td style={{ padding: '8px 6px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={itemRow.quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 1;
                                    setReplyItems((prev) => prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it)));
                                  }}
                                  className="outstock-form-input"
                                  style={{ minHeight: '30px', fontSize: '11.5px', textAlign: 'center' }}
                                />
                                <span style={{ fontSize: '10.5px', color: '#64748b', textAlign: 'center' }}>{itemRow.unit || 'علبة'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <div style={{ position: 'relative' }}>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  placeholder="0.00"
                                  value={itemRow.price}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setReplyItems((prev) => prev.map((it, i) => (i === idx ? { ...it, price: val } : it)));
                                  }}
                                  className="outstock-form-input"
                                  style={{ minHeight: '32px', fontSize: '12.5px', fontWeight: '800', textAlign: 'center', color: '#15803d', borderColor: '#86efac' }}
                                />
                                <span style={{ position: 'absolute', left: '6px', top: '7px', fontSize: '10px', color: '#64748b' }}>ج.م</span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplyItems((prev) => prev.map((it, i) => (i === idx ? { ...it, isAvailable: !it.isAvailable } : it)));
                                }}
                                style={{
                                  width: '100%',
                                  minHeight: '32px',
                                  borderRadius: '6px',
                                  border: itemRow.isAvailable ? '1.5px solid #10b981' : '1.5px solid #ef4444',
                                  background: itemRow.isAvailable ? '#ecfdf5' : '#fef2f2',
                                  color: itemRow.isAvailable ? '#065f46' : '#991b1b',
                                  fontSize: '11px',
                                  fontWeight: '800',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '3px',
                                  transition: 'all 0.15s ease'
                                }}
                                title="انقر لتبديل حالة التوفير"
                              >
                                {itemRow.isAvailable ? (
                                  <>
                                    <CheckCircle2 size={13} color="#10b981" />
                                    <span>متاح للتوفير 🟢</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle size={13} color="#ef4444" />
                                    <span>غير متاح 🔴</span>
                                  </>
                                )}
                              </button>
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              {replyItems.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyItems((prev) => prev.filter((_, i) => i !== idx));
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    padding: '4px'
                                  }}
                                  title="حذف هذا الصنف"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>
                    نص تعليق رد المشتريات العام وتوجيهات الفرع:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="مثال: الصنف متوفر لدى شركة ابن سينا بخصم 20%، السعر الرسمي الجديد 45 ج.م وتم تحديثه..."
                    value={replyNotes}
                    onChange={(e) => setReplyNotes(e.target.value)}
                    className="outstock-form-input"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setReplyTargetRequest(null)}
                    disabled={isReplying}
                    className="outstock-btn outstock-btn-secondary"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={isReplying}
                    className="outstock-btn outstock-btn-primary"
                  >
                    {isReplying ? 'جاري الحفظ...' : 'حفظ وإرسال الرد للفرع'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* نافذة التحقق من كود الموظف */}
      <EmployeeCodeAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(emp) => {
          setAuthenticatedEmployee(emp);
          setIsAuthModalOpen(false);
          setIsNewRequestModalOpen(true);
        }}
        title="التحقق من هوية الصيدلي / الموظف"
        actionDescription="تقديم استفسار، تصحيح صنف، أو طلب إضافة دواء جديد للمشتريات"
      />

      {/* نافذة معاينة الصورة بالحجم الكامل (Lightbox) */}
      {previewImageUrl && (
        <div
          className="outstock-modal-backdrop"
          style={{ zIndex: 99999, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0284c7" />
                <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '14px' }}>معاينة الصورة المرفقة بالطلب</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewImageUrl}
              alt="معاينة الصورة"
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                borderRadius: '8px',
                objectFit: 'contain',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
          </div>
        </div>
      )}

      {/* ── نافذة تصعيد شكوى لعدم الرد ── */}
      {complaintTargetInquiry && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => !isEscalating && setComplaintTargetInquiry(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            className="outstock-modal-panel"
            style={{ maxWidth: '480px', width: '92%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header" style={{ background: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#e11d48" />
                <h3 style={{ margin: 0, color: '#9f1239', fontSize: '15px', fontWeight: '900' }}>
                  تصعيد شكوى لعدم الرد (للمالك والمشتريات) 🚨
                </h3>
              </div>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => !isEscalating && setComplaintTargetInquiry(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendComplaint}>
              <div className="outstock-modal-body" style={{ padding: '16px 20px', fontSize: '13px' }}>
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 12px', color: '#9a3412', marginBottom: '14px', fontSize: '12.5px' }}>
                  ⚠️ سيتم تصعيد هذا الاستعلام فوراً إلى <strong>المالك والمشرف العام</strong> مع إشعار إدارة المشتريات للتنبيه على التأخر في الرد.
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div>الصنف: <strong style={{ color: '#0f172a' }}>{complaintTargetInquiry.medication_name}</strong></div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    تاريخ إرسال الاستعلام: {complaintTargetInquiry.created_at ? new Date(complaintTargetInquiry.created_at).toLocaleString('ar-EG') : 'غير محدد'}
                  </div>
                </div>

                <div className="outstock-form-group">
                  <label style={{ fontWeight: '700', color: '#1e293b', fontSize: '12.5px' }}>
                    ملاحظات إضافية على الشكوى (اختياري):
                  </label>
                  <textarea
                    rows={3}
                    value={complaintNotes}
                    onChange={(e) => setComplaintNotes(e.target.value)}
                    placeholder="مثال: العميل متواجد بالصيدلية ومستعجل جداً ولم يتم الرد منذ ساعتين..."
                    className="outstock-form-textarea"
                    style={{ fontSize: '13px' }}
                  />
                </div>
              </div>

              <div className="outstock-modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setComplaintTargetInquiry(null)}
                  disabled={isEscalating}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isEscalating}
                  className="outstock-btn"
                  style={{
                    background: '#e11d48',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 18px',
                    fontWeight: '800',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>{isEscalating ? 'جاري التصعيد...' : 'تأكيد تصعيد الشكوى 🚨'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── نافذة معاينة رد المشتريات المفصلة ── */}
      <ProcurementReplyModal
        isOpen={Boolean(previewReplyRequest)}
        onClose={() => setPreviewReplyRequest(null)}
        requestItem={previewReplyRequest}
        showToast={showToast}
        onConvertToOrder={!isProcurement ? (reqItem) => {
          setPreviewReplyRequest(null);
          handleConvertToOrder(reqItem);
        } : null}
        onSendWhatsApp={!isProcurement ? (reqItem) => {
          handleSendWhatsAppToCustomer(reqItem);
        } : null}
      />

      {/* ── نافذة التحقق من كود الصيدلي لتحويل الاستعلام لطلب عميل ── */}
      <EmployeeCodeAuthModal
        isOpen={isConvertAuthModalOpen}
        onClose={() => {
          setIsConvertAuthModalOpen(false);
          setInquiryPendingConversion(null);
        }}
        onSuccess={handleConvertAuthSuccess}
        title="التحقق من كود الصيدلي لتحويل الاستعلام لطلب عميل"
        subtitle="يرجى إدخال كود الموظف المسجل لتثبيته كصيدلي مستلم للطلب ومتابعة الإجراء"
        actionLabel="تأكيد الهوية ومتابعة إنشاء الطلب"
      />

      {/* ── 4. نافذة إنشاء طلب العميل المنبثقة عند التحويل من استعلام ── */}
      {orderModalPrefill && (
        <NewCustomerOrderModal
          branchId={branchId || currentBranch?.id}
          branch={currentBranch}
          defaultPharmacist={orderReceiverEmployee?.name || currentUser?.name || currentUser?.full_name || 'د. الصيدلي'}
          orderReceiver={orderReceiverEmployee}
          editingOrder={orderModalPrefill}
          onClose={() => {
            setOrderModalPrefill(null);
            setInquiryToConvert(null);
            setOrderReceiverEmployee(null);
          }}
          onOrderCreated={async (createdOrder) => {
            if (inquiryToConvert?.id) {
              try {
                await outstockConvertMedicationRequestToOrder(inquiryToConvert.id, {
                  orderId: createdOrder?.id
                });
                showToast('✅ تم تحويل الاستعلام لطلب عميل رسمي بنجاح!');
                fetchRequests();
              } catch (_) {}
            }
            setOrderModalPrefill(null);
            setInquiryToConvert(null);
            setOrderReceiverEmployee(null);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}
