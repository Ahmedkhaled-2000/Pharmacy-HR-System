import React, { useState, useEffect, useRef } from 'react';
import {
  Pill,
  Search,
  RefreshCw,
  Upload,
  History,
  DollarSign,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  FileSpreadsheet,
  Edit3,
  Layers,
  Sparkles,
  Barcode,
  Building2,
  Calendar,
  X,
  Printer,
  Plus,
  FileText,
  Tag,
  Download,
  CheckSquare,
  Square,
  Trash2,
  CheckCircle2,
  FileCheck,
  Cpu,
  FlaskConical,
  Filter,
  Calculator,
  ShieldCheck,
  Package
} from 'lucide-react';
import {
  outstockSearchMedications,
  outstockGetMedicationStats,
  outstockUpdateMedicationPrice,
  outstockBulkUpdatePrices,
  outstockSyncCloudCatalog,
  outstockGetPriceAuditLogs,
  outstockGetMedicationMasterCard,
  outstockAddNewMedication,
  outstockDeleteMedication
} from '../../../utils/outstockApiClient';
import { generateBarcodeSvgString } from '../../../utils/invoicePdfGenerator';
import {
  exportMedicationCatalogTemplateExcel,
  parseMedicationExcelFile
} from '../../../utils/outstockExcelExporter';
import {
  extractMedicationsWithAi,
  enrichMedicationListWithAi
} from '../../../utils/outstockMedicationAiExtractor';
import MedicationMasterCardModal from '../common/MedicationMasterCardModal';
import AddMedicationModal from '../common/AddMedicationModal';
import CosmeticsProductModal from '../common/CosmeticsProductModal';

export default function OwnerMedicationsPricingTab({
  showToast = (msg) => {
    if (typeof window !== 'undefined') {
      const detail = typeof msg === 'object' ? msg : { message: String(msg) };
      window.dispatchEvent(new CustomEvent('outstock:notify', { detail }));
    }
  },
  categoryScope = null
}) {
  // ── 1. الحالات العامة ──
  const [stats, setStats] = useState({
    total_medications: 26633,
    table_drugs_count: 0,
    refrigerated_count: 0,
    total_price_revisions: 0
  });
  const [activeSubTab, setActiveSubTab] = useState('catalog'); // 'catalog' | 'history' | 'bulk_upload'
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // ── 2. حالة البحث في الكتالوج ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // ── 3. حالة تعديل سعر صنف منفرد ──
  const [selectedMedToEdit, setSelectedMedToEdit] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [editPackSize, setEditPackSize] = useState('1');
  const [editReason, setEditReason] = useState('منشور التسعيرة الجبرية الرسمي - هيئة الدواء');
  const [editDecreeNumber, setEditDecreeNumber] = useState('');
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // ── 4. كارتة الصنف ──
  const [masterCardMedId, setMasterCardMedId] = useState(null);
  const [masterCardData, setMasterCardData] = useState(null);
  const [isLoadingMasterCard, setIsLoadingMasterCard] = useState(false);

  // ── 5. طباعة الباركود الحراري ──
  const [barcodeMedToPrint, setBarcodeMedToPrint] = useState(null);
  const [barcodeLabelSize, setBarcodeLabelSize] = useState('38x25'); // '38x25' | '50x25'
  const [barcodeCopies, setBarcodeCopies] = useState(1);

  // ── 6. إضافة صنف جديد بالكتالوج واختيار نوع الكارتة ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [newItemType, setNewItemType] = useState('medication'); // 'medication' | 'cosmetics'
  const [catalogItemTypeFilter, setCatalogItemTypeFilter] = useState('all'); // 'all' | 'medication' | 'cosmetics'
  const [isCosmeticsModalOpen, setIsCosmeticsModalOpen] = useState(false);
  const [selectedCosmeticsItem, setSelectedCosmeticsItem] = useState(null);
  const [cosmeticsModalMode, setCosmeticsModalMode] = useState('add');
  const [activeIngredientModalMed, setActiveIngredientModalMed] = useState(null);
  const [newMedForm, setNewMedForm] = useState({
    trade_name_ar: '',
    trade_name_en: '',
    generic_name: '',
    dosage_form: 'أقراص (Tablets)',
    strength: '',
    pack_size: 1,
    unit_name: 'شريط',
    public_price: '',
    manufacturer: '',
    category: '',
    gtin_barcode: '',
    is_table_drug: false,
    is_refrigerated: false
  });
  const [isSavingNewMed, setIsSavingNewMed] = useState(false);

  // ── 6.1 حالة وتأكيد حذف صنف من الكتالوج ──
  const [medToDelete, setMedToDelete] = useState(null);
  const [isDeletingMed, setIsDeletingMed] = useState(false);

  const handleConfirmDeleteMedication = async () => {
    if (!medToDelete) return;
    try {
      setIsDeletingMed(true);
      const res = await outstockDeleteMedication(medToDelete.id);
      if (res?.success) {
        showToast?.(res.message || 'تم حذف الصنف من كتالوج الأدوية بنجاح');
        setSearchResults(prev => prev.filter(m => m.id !== medToDelete.id));
        setStats(prev => ({
          ...prev,
          total_medications: Math.max(0, (prev.total_medications || 0) - 1)
        }));
        setMedToDelete(null);
      } else {
        showToast?.(res?.error || 'تعذر حذف الصنف');
      }
    } catch (err) {
      console.error('Delete medication error:', err);
      showToast?.('حدث خطأ أثناء محاولة حذف الصنف');
    } finally {
      setIsDeletingMed(false);
    }
  };

  // ── 7. حالة سجل التدقيق التاريخي ──
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // ── 8. حالة الرفع الجماعي للأسعار (Bulk Re-Pricer) مع إكسل والذكاء الاصطناعي ──
  const [bulkSource, setBulkSource] = useState('منشور التسعيرة الجبرية - هيئة الدواء المصرية');
  const [bulkDecree, setBulkDecree] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // حالة استيراد الإكسل والتحليل بالذكاء الاصطناعي
  const [bulkPreviewItems, setBulkPreviewItems] = useState([]);
  const [selectedPreviewIndices, setSelectedPreviewIndices] = useState(new Set());
  const [previewDuplicatesCount, setPreviewDuplicatesCount] = useState(0);
  const [previewWarnings, setPreviewWarnings] = useState([]);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(null); // 'excel' | 'ai'
  const [isExcelPreviewModalOpen, setIsExcelPreviewModalOpen] = useState(false);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewDeptFilter, setPreviewDeptFilter] = useState('ALL');

  const excelFileInputRef = useRef(null);
  const aiFileInputRef = useRef(null);

  // جلب الإحصائيات عند التحميل
  const fetchStats = async () => {
    try {
      const res = await outstockGetMedicationStats();
      if (res?.success && res.stats) {
        setStats(res.stats);
      }
    } catch (e) {
      console.warn('Failed to load medication stats:', e);
    }
  };

  useEffect(() => {
    fetchStats();
    handleSearch('');
  }, []);

  // دالة البحث في الأدوية
  const handleSearch = async (term, typeFilter = null) => {
    const q = String(term !== undefined ? term : searchTerm).trim();
    const effectiveType = typeFilter !== null ? typeFilter : catalogItemTypeFilter;
    setIsSearching(true);
    try {
      const res = await outstockSearchMedications(q, 40, effectiveType);
      if (res?.success && Array.isArray(res.medications)) {
        setSearchResults(res.medications);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.warn('Med search error:', e);
    } finally {
      setIsSearching(false);
    }
  };

  // 1. تصدير نموذج إكسل فارغ واحترافي
  const handleExportExcelTemplate = async () => {
    try {
      await exportMedicationCatalogTemplateExcel();
      showToast('✅ تم تحميل نموذج الإكسل الاحترافي بنجاح');
    } catch (err) {
      showToast(`❌ فشل التصدير: ${err.message}`);
    }
  };

  // 2. استيراد ملف إكسل مملوء بالأسعار
  const handleExcelFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsBulkProcessing(true);
    try {
      const res = await parseMedicationExcelFile(file);
      if (res.success && res.items.length > 0) {
        setBulkPreviewItems(res.items);
        setSelectedPreviewIndices(new Set(res.items.map((_, i) => i)));
        setPreviewDuplicatesCount(res.duplicatesCount || 0);
        setPreviewWarnings(res.warnings || []);
        setBulkMode('excel');
        setBulkResult(null);
        setIsExcelPreviewModalOpen(true);
        showToast(`🎉 تم قراءة ${res.items.length} صنف من ملف الإكسل (تم استبعاد ${res.duplicatesCount || 0} تكرار)`);
      } else {
        showToast('⚠️ لم يتم العثور على أسطر صالحة بالملف');
      }
    } catch (err) {
      showToast(`❌ تعذر قراءة ملف الإكسل: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
      if (excelFileInputRef.current) excelFileInputRef.current.value = '';
    }
  };

  // 3. تحليل بالذكاء الاصطناعي (Excel / PDF / صورة)
  const handleAiFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAiAnalyzing(true);
    setAiStatusMsg('جاري بدء التحليل الذكي...');
    try {
      const res = await extractMedicationsWithAi(file, (msg) => setAiStatusMsg(msg));
      if (res.success && res.items.length > 0) {
        setBulkPreviewItems(res.items);
        setSelectedPreviewIndices(new Set(res.items.map((_, i) => i)));
        setPreviewDuplicatesCount(res.duplicatesCount || 0);
        setPreviewWarnings(res.warnings || []);
        setBulkMode('ai');
        setBulkResult(null);
        setIsExcelPreviewModalOpen(true);
        showToast(`✨ تم استخراج ${res.items.length} صنف بالذكاء الاصطناعي بنجاح!`);
      } else {
        showToast('⚠️ لم يتعرف الذكاء الاصطناعي على أصناف واضحة في المستند');
      }
    } catch (err) {
      showToast(`❌ فشل التحليل بالذكاء الاصطناعي: ${err.message}`);
    } finally {
      setIsAiAnalyzing(false);
      setAiStatusMsg('');
      if (aiFileInputRef.current) aiFileInputRef.current.value = '';
    }
  };

  // 4. التحكم في صفوف المعاينة
  const handleTogglePreviewRow = (idx) => {
    setSelectedPreviewIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleToggleAllPreview = () => {
    if (selectedPreviewIndices.size === bulkPreviewItems.length) {
      setSelectedPreviewIndices(new Set());
    } else {
      setSelectedPreviewIndices(new Set(bulkPreviewItems.map((_, i) => i)));
    }
  };

  const handleRemovePreviewRow = (idx) => {
    setBulkPreviewItems(prev => prev.filter((_, i) => i !== idx));
    setSelectedPreviewIndices(prev => {
      const next = new Set();
      prev.forEach(i => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  };

  // تحديث صنف مباشر داخل جدول المعاينة قبل الحفظ
  const handleUpdatePreviewItem = (idx, field, value) => {
    setBulkPreviewItems(prev => {
      const copy = [...prev];
      if (!copy[idx]) return prev;
      const updatedItem = { ...copy[idx], [field]: value };

      // تحديث سعر الوحدة تلقائياً عند تغيير سعر البيع أو عدد الأجزاء
      if (field === 'public_price' || field === 'pack_size') {
        const p = parseFloat(field === 'public_price' ? value : updatedItem.public_price) || 0;
        const s = parseInt(field === 'pack_size' ? value : updatedItem.pack_size, 10) || 1;
        updatedItem.unit_price = s > 0 ? parseFloat((p / s).toFixed(2)) : p;
      }

      // تحديث هامش الربح تلقائياً عند تغيير سعر البيع أو سعر التكلفة
      if (field === 'public_price' || field === 'last_cost_price') {
        const p = parseFloat(field === 'public_price' ? value : updatedItem.public_price) || 0;
        const c = parseFloat(field === 'last_cost_price' ? value : updatedItem.last_cost_price) || 0;
        if (p > 0 && c > 0) {
          updatedItem.profit_margin_percent = parseFloat((((p - c) / p) * 100).toFixed(2));
        }
      }

      // ضبط نوع الصنف تلقائياً عند اختيار القسم
      if (field === 'department') {
        if (value === 'أدوية' || value === 'أدوية بشرية') {
          updatedItem.item_type = 'medicine';
        } else if (value === 'مستحضرات تجميل' || value === 'عناية بالبشرة' || value === 'عناية بالشعر' || value === 'عناية شخصية') {
          updatedItem.item_type = 'cosmetics';
        }
      }

      copy[idx] = updatedItem;
      return copy;
    });
  };

  const [isAiEnriching, setIsAiEnriching] = useState(false);

  // إضافة سطر صنف فارغ وجديد إلى جدول المعاينة
  const handleAddBlankPreviewRow = () => {
    const newBlankItem = {
      trade_name_ar: '',
      trade_name_en: '',
      detailed_name: '',
      public_price: 0,
      unit_price: 0,
      supplier_name: '',
      discount_percent: 0,
      extra_discount_percent: 0,
      apply_vat: false,
      department: 'أدوية',
      category: 'أدوية علاجية',
      item_type: 'medicine',
      is_cost_calculated: true,
      last_cost_price: 0,
      pack_size: 1,
      max_sale_discount: 0,
      current_stock: 0,
      avg_cost_price: 0,
      profit_margin_percent: 0,
      apply_expiry_date: true,
      print_stickers: true,
      is_imported: false,
      gtin_barcode: '',
      isValid: false
    };
    setBulkPreviewItems(prev => [newBlankItem, ...prev]);
    setSelectedPreviewIndices(prev => {
      const next = new Set();
      next.add(0);
      prev.forEach(i => next.add(i + 1));
      return next;
    });
    showToast('➕ تم إضافة سطر صنف جديد في بداية جدول المعاينة');
  };

  // تدقيق وتحسين بيانات الأصناف بالذكاء الاصطناعي
  const handleAiEnrichPreviewItems = async () => {
    if (bulkPreviewItems.length === 0) return;
    setIsAiEnriching(true);
    try {
      showToast('✨ جاري تدقيق وتحسين بيانات الأصناف عبر محرك الذكاء الاصطناعي...');
      const enriched = await enrichMedicationListWithAi(bulkPreviewItems, (status) => {
        showToast(status);
      });
      setBulkPreviewItems(enriched);
      showToast('🎉 تم تدقيق بيانات الأصناف واستنتاج الأشكال والشرائط والمواد الفعالة بنجاح!');
    } catch (err) {
      showToast(`❌ تعذر التدقيق بالذكاء الاصطناعي: ${err.message}`);
    } finally {
      setIsAiEnriching(false);
    }
  };

  // إعادة ضبط واحتساب أسعار الوحدات وهوامش الأرباح لجميع الأصناف تلقائياً
  const handleAutoRecalculatePrices = () => {
    setBulkPreviewItems(prev => prev.map(item => {
      const p = parseFloat(item.public_price || 0);
      const s = Math.max(1, parseInt(item.pack_size || 1, 10));
      const unitPrice = s > 0 ? parseFloat((p / s).toFixed(2)) : p;
      let lastCost = parseFloat(item.last_cost_price || 0);
      if (lastCost === 0 && (item.discount_percent > 0 || item.extra_discount_percent > 0) && p > 0) {
        const totalDisc = Math.min(90, (item.discount_percent || 0) + (item.extra_discount_percent || 0));
        lastCost = parseFloat((p * (1 - totalDisc / 100)).toFixed(2));
      }
      let profitMargin = parseFloat(item.profit_margin_percent || 0);
      if (lastCost > 0 && p > 0) {
        profitMargin = parseFloat((((p - lastCost) / p) * 100).toFixed(1));
      }
      return {
        ...item,
        unit_price: unitPrice,
        last_cost_price: lastCost,
        profit_margin_percent: profitMargin,
        isValid: (item.trade_name_ar || '').trim().length >= 2 && p > 0
      };
    }));
    showToast('⚡ تم إعادة احتساب أسعار الوحدات، التكاليف، وهوامش الأرباح بنجاح');
  };

  // حذف الأصناف غير المحددة لتنظيف الجدول
  const handleRemoveUncheckedPreviewRows = () => {
    setBulkPreviewItems(prev => {
      const kept = prev.filter((_, i) => selectedPreviewIndices.has(i));
      setSelectedPreviewIndices(new Set(kept.map((_, i) => i)));
      return kept;
    });
    showToast('🧹 تم إزالة الأصناف غير المحددة من جدول المعاينة');
  };

  // 5. تأكيد وحفظ التحديث الجماعي
  const handleConfirmBulkSave = async () => {
    const itemsToSave = bulkPreviewItems.filter((_, i) => selectedPreviewIndices.has(i));
    if (itemsToSave.length === 0) {
      showToast('⚠️ يرجى تحديد صنف واحد على الأقل للحفظ');
      return;
    }

    setIsBulkProcessing(true);
    try {
      const res = await outstockBulkUpdatePrices({
        items: itemsToSave,
        source: bulkSource,
        decreeNumber: bulkDecree
      });

      if (res?.success) {
        setBulkResult(res);
        setBulkPreviewItems([]);
        setSelectedPreviewIndices(new Set());
        setIsExcelPreviewModalOpen(false);
        showToast(`🎉 تم بنجاح تحديث وتعميم ${res.updatedCount || itemsToSave.length} صنف وإضافة ${res.insertedCount || 0} صنف جديد!`);
        fetchStats();
        handleSearch('');
      } else {
        showToast(`❌ خطأ في المعالجة: ${res?.error}`);
      }
    } catch (err) {
      showToast(`❌ فشل التحديث الجماعي: ${err.message}`);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // جلب سجل التدقيق الرقابي
  const fetchAuditLogs = async (page = 1, search = '') => {
    setIsLoadingAudit(true);
    try {
      const res = await outstockGetPriceAuditLogs({ page, limit: 25, search });
      if (res?.success) {
        setAuditLogs(res.logs || []);
        setAuditTotalPages(res.totalPages || 1);
        setAuditPage(res.page || 1);
      }
    } catch (e) {
      console.warn('Audit logs fetch error:', e);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchAuditLogs(1, auditSearch);
    }
  }, [activeSubTab]);

  // المزامنة السحابية الفورية
  const handleCloudSync = async () => {
    if (!window.confirm('هل تريد بدء المزامنة السحابية لكتالوج هيئة الدواء المصرية وتحديث فروق الأسعار تلقائياً؟')) {
      return;
    }
    setIsSyncing(true);
    try {
      const res = await outstockSyncCloudCatalog();
      if (res?.success) {
        const timeSec = res.durationMs ? ` خلال ${(res.durationMs / 1000).toFixed(1)} ثانية` : '';
        showToast(`✅ اكتملت المزامنة السحابية الفائقة بنجاح${timeSec}! تم فحص ${res.totalChecked?.toLocaleString('ar-EG') || res.totalChecked} صنف، وتحديث ${res.priceChanges?.toLocaleString('ar-EG') || res.priceChanges} تعديل سعري جديد.`);
        fetchStats();
        handleSearch(searchTerm);
      } else {
        showToast(`❌ فشلت المزامنة: ${res?.error || 'خطأ غير معروف'}`);
      }
    } catch (e) {
      showToast(`❌ خطأ أثناء المزامنة: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // فتح نافذة تعديل سعر صنف
  const handleOpenEditModal = (med) => {
    setSelectedMedToEdit(med);
    setEditPrice(String(med.public_price || ''));
    setEditPackSize(String(med.pack_size || '1'));
    setEditReason('تعديل رسمي وفق منشور هيئة الدواء');
    setEditDecreeNumber('');
  };

  // حفظ وتعميم السعر الجديد
  const handleSavePrice = async (e) => {
    e.preventDefault();
    if (!selectedMedToEdit || !editPrice) return;
    const numPrice = parseFloat(editPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      showToast('يرجى إدخال سعر صالح');
      return;
    }

    setIsSavingPrice(true);
    try {
      const res = await outstockUpdateMedicationPrice({
        medicationId: selectedMedToEdit.id,
        newPublicPrice: numPrice,
        packSize: parseInt(editPackSize || '1', 10),
        reason: editReason,
        decreeNumber: editDecreeNumber
      });

      if (res?.success) {
        showToast(`✅ تم تحديث وتعميم السعر بنجاح! السعر الجديد: ${res.new_public_price} ج.م (الشريط: ${res.new_unit_price} ج.م)`);
        setSelectedMedToEdit(null);
        fetchStats();
        handleSearch(searchTerm);
      } else {
        showToast(`❌ فشل التحديث: ${res?.error || 'خطأ'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSavingPrice(false);
    }
  };

  // فتح كارتة الصنف الشاملة
  const handleOpenMasterCard = async (medId) => {
    setMasterCardMedId(medId);
    setIsLoadingMasterCard(true);
    try {
      const res = await outstockGetMedicationMasterCard(medId);
      if (res?.success) {
        setMasterCardData(res);
      } else {
        showToast(`⚠️ ${res?.error || 'تعذر جلب كارتة الصنف'}`);
        setMasterCardMedId(null);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
      setMasterCardMedId(null);
    } finally {
      setIsLoadingMasterCard(false);
    }
  };

  // فتح نافذة طباعة ملصق الباركود الحراري
  const handleOpenBarcodePrint = (med) => {
    setBarcodeMedToPrint(med);
    setBarcodeCopies(1);
  };

  // حفظ صنف جديد بالكتالوج
  const handleSaveNewMedication = async (e) => {
    e.preventDefault();
    if (!newMedForm.trade_name_ar.trim() || !newMedForm.public_price) {
      showToast('يرجى ملء الحقول الإلزامية (اسم الصنف بالعربي والسعر الرسمي)');
      return;
    }

    setIsSavingNewMed(true);
    try {
      const res = await outstockAddNewMedication(newMedForm);
      if (res?.success) {
        showToast(`✅ تم إضافة الدواء (${res.medication?.displayName || newMedForm.trade_name_ar}) بنجاح إلى الكتالوج المركزي.`);
        setIsAddModalOpen(false);
        setNewMedForm({
          trade_name_ar: '',
          trade_name_en: '',
          generic_name: '',
          dosage_form: 'أقراص (Tablets)',
          strength: '',
          pack_size: 1,
          unit_name: 'شريط',
          public_price: '',
          manufacturer: '',
          category: '',
          gtin_barcode: '',
          is_table_drug: false,
          is_refrigerated: false
        });
        fetchStats();
        setSearchTerm(res.medication?.trade_name_ar || '');
        handleSearch(res.medication?.trade_name_ar || '');
      } else {
        showToast(`❌ تعذر إضافة الصنف: ${res?.error || 'خطأ'}`);
      }
    } catch (err) {
      showToast(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSavingNewMed(false);
    }
  };

  // تصدير الكتالوج الحالي إلى CSV
  const handleExportCatalogCsv = () => {
    if (!searchResults || searchResults.length === 0) {
      showToast('لا توجد أصناف معروضة للتصدير');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    csvContent += 'الاسم التجاري عربي,الاسم التجاري إنجليزي,المادة الفعالة,الشكل الدوائي,عدد الشرائط,سعر العبوة (ج.م),سعر الشريط (ج.م),الباركود,الشركة المصنعة,صنف جدول,ثلاجة\n';

    searchResults.forEach((m) => {
      csvContent += `"${m.trade_name_ar}","${m.trade_name_en || ''}","${m.generic_name || ''}","${m.dosage_form || ''}",${m.pack_size || 1},${m.public_price},${m.unit_price},"${m.gtin_barcode || ''}","${m.manufacturer || ''}",${m.is_table_drug ? 'نعم' : 'لا'},${m.is_refrigerated ? 'نعم' : 'لا'}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medications_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ تم تصدير الكتالوج إلى CSV بنجاح');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── بطاقات الإحصائيات العلوية ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '16px 20px',
          border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
          borderTop: '3px solid #059669',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '700' }}>إجمالي الأدوية المسجلة</div>
            <div className="tabular-nums" style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', marginTop: '4px', fontFamily: 'var(--outstock-font-mono)' }}>
              {(stats.total_medications || 26633).toLocaleString('ar-EG')} صنف
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: '600', marginTop: '2px' }}>
              قاعدة بيانات هيئة الدواء المصرية ودراج آي
            </div>
          </div>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Pill size={22} />
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '700' }}>تعديلات الأسعار الموثقة</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
              {(stats.total_price_revisions || 0).toLocaleString('ar-EG')} حركة
            </div>
            <div style={{ fontSize: '11.5px', color: '#10b981', fontWeight: '700', marginTop: '2px' }}>
              سجل رقابي مؤمن للأسعار
            </div>
          </div>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#ecfdf5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <TrendingUp size={24} color="#059669" />
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1.5px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '700' }}>أدوية الجداول والمخدرات</div>
            <div style={{ fontSize: '26px', fontWeight: '900', color: '#dc2626', marginTop: '4px' }}>
              {(stats.table_drugs_count || 124).toLocaleString('ar-EG')} صنف
            </div>
            <div style={{ fontSize: '11.5px', color: '#ef4444', fontWeight: '700', marginTop: '2px' }}>
              تخضع للرقابة الصيدلية المشددة
            </div>
          </div>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertTriangle size={24} color="#dc2626" />
          </div>
        </div>
      </div>

      {/* ── شريط التنقل بين التبويبات الفرعية ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('catalog')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              background: activeSubTab === 'catalog' ? '#0d9488' : '#f1f5f9',
              color: activeSubTab === 'catalog' ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease'
            }}
          >
            <Pill size={16} />
            <span>كتالوج الأدوية والأسعار ({searchResults.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              background: activeSubTab === 'history' ? '#0d9488' : '#f1f5f9',
              color: activeSubTab === 'history' ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease'
            }}
          >
            <History size={16} />
            <span>سجل تدقيق تحريك الأسعار</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('bulk_upload')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              background: activeSubTab === 'bulk_upload' ? '#0d9488' : '#f1f5f9',
              color: activeSubTab === 'bulk_upload' ? '#ffffff' : '#475569',
              transition: 'all 0.15s ease'
            }}
          >
            <Upload size={16} />
            <span>مستورد الأسعار الجماعي (Bulk Re-Pricer)</span>
          </button>
        </div>

        {/* زر المزامنة السحابية اليومية */}
        <button
          type="button"
          onClick={handleCloudSync}
          disabled={isSyncing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            borderRadius: '10px',
            border: '1.5px solid #0d9488',
            background: isSyncing ? '#f1f5f9' : '#f0fdfa',
            color: '#0d9488',
            fontWeight: '800',
            fontSize: '13px',
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="مزامنة الأسعار الرسمية الصادرة عن هيئة الدواء مع السحابة"
        >
          <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
          <span>{isSyncing ? 'جاري المزامنة السحابية...' : 'مزامنة الأسعار السحابية (EDA Sync)'}</span>
        </button>
      </div>

      {/* ── 1. تبويب الكتالوج والبحث والتعديل الفوري ── */}
      {activeSubTab === 'catalog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* شريط البحث الميداني السريع */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="ابحث بالاسم العربي، الإنجليزي، المادة الفعالة، أو الباركود الدولي (مثل: alphintern, الفنترن, 6221025030733)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  handleSearch(e.target.value);
                }}
                className="outstock-form-input"
                style={{
                  minHeight: '46px',
                  paddingRight: '40px',
                  fontSize: '14px',
                  borderColor: '#0d9488',
                  boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)'
                }}
              />
              <Search
                size={18}
                color="#0d9488"
                style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>
            <button
              type="button"
              onClick={() => handleSearch(searchTerm)}
              className="outstock-btn outstock-btn-primary"
              style={{ minHeight: '46px', padding: '0 22px' }}
            >
              <span>{isSearching ? 'جاري البحث...' : 'بحث'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (categoryScope === 'cosmetics') {
                  setNewItemType('cosmetics');
                  setSelectedCosmeticsItem(null);
                  setCosmeticsModalMode('add');
                  setIsCosmeticsModalOpen(true);
                } else {
                  setIsChoiceModalOpen(true);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 18px',
                minHeight: '46px',
                borderRadius: '10px',
                background: categoryScope === 'cosmetics'
                  ? 'linear-gradient(135deg, #db2777 0%, #be185d 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: categoryScope === 'cosmetics'
                  ? '0 2px 8px rgba(219, 39, 119, 0.25)'
                  : '0 2px 8px rgba(5, 150, 105, 0.25)'
              }}
            >
              <Plus size={16} />
              <span>{categoryScope === 'cosmetics' ? 'إضافة صنف مستحضرات 💄' : 'إضافة صنف جديد'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCatalogCsv}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 16px',
                minHeight: '46px',
                borderRadius: '10px',
                background: '#f8fafc',
                color: '#334155',
                border: '1.5px solid #cbd5e1',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer'
              }}
              title="تصدير نتائج البحث الحالية لملف إكسل / CSV"
            >
              <FileSpreadsheet size={16} color="#059669" />
              <span>تصدير إكسل</span>
            </button>
          </div>

          {/* أزرار الفلترة: الكل / أدوية / مستحضرات تجميل */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '-4px', marginBottom: '2px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }}>تصنيف العرض:</span>
            {[
              { id: 'all', label: 'الكل (شامل) 📦' },
              { id: 'medication', label: 'الأدوية فقط 💊' },
              { id: 'cosmetics', label: 'مستحضرات التجميل فقط 💄' }
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setCatalogItemTypeFilter(pill.id);
                  handleSearch(searchTerm, pill.id);
                }}
                style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: catalogItemTypeFilter === pill.id ? '800' : '600',
                  cursor: 'pointer',
                  border: catalogItemTypeFilter === pill.id ? '1.5px solid #0d9488' : '1px solid #cbd5e1',
                  background: catalogItemTypeFilter === pill.id ? (pill.id === 'cosmetics' ? '#fdf2f8' : '#f0fdfa') : '#ffffff',
                  color: catalogItemTypeFilter === pill.id ? (pill.id === 'cosmetics' ? '#db2777' : '#0f766e') : '#64748b',
                  boxShadow: catalogItemTypeFilter === pill.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* جدول عرض الأدوية */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)'
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '800' }}>اسم المستحضر</th>
                    <th style={{ padding: '12px 14px', fontWeight: '800' }}>المادة الفعالة والشركة</th>
                    <th style={{ padding: '12px 14px', fontWeight: '800' }}>الشكل والوحدة</th>
                    <th style={{ padding: '12px 14px', fontWeight: '800' }}>الباركود الدولي</th>
                    <th style={{ padding: '12px 14px', fontWeight: '800' }}>سعر العلبة</th>
                    <th style={{ padding: '12px 14px', fontWeight: '800' }}>سعر الشريط</th>
                    <th style={{ padding: '12px 16px', fontWeight: '800', textAlign: 'center' }}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        {isSearching ? 'جاري استرجاع النتائج فائق السرعة...' : 'لا توجد أدوية مطابقة للبحث الحالي. جرب البحث باسم صنف آخر.'}
                      </td>
                    </tr>
                  ) : (
                    searchResults.map((med, idx) => (
                      <tr
                        key={med.id || idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background-color 0.12s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '13.5px' }}>
                              {med.trade_name_ar}
                            </span>
                            {(med.item_type === 'cosmetics' || med.item_type === 'cosmetic' || (med.category && med.category.includes('تجميل')) || (med.department && med.department.includes('تجميل'))) ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800',
                                background: '#fdf2f8',
                                color: '#db2777',
                                border: '1px solid #fbcfe8'
                              }}>
                                💄 مستحضرات تجميل
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '800',
                                background: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #a7f3d0'
                              }}>
                                💊 صنف دوائي
                              </span>
                            )}
                          </div>
                          <div style={{ color: '#475569', fontSize: '12px', direction: 'ltr', textAlign: 'right', fontWeight: '600' }}>
                            {med.trade_name_en}
                          </div>
                          {med.is_table_drug && (
                            <span style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              background: '#fee2e2',
                              color: '#b91c1c',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              fontWeight: 'bold',
                              marginTop: '2px'
                            }}>
                              جدول 🚨
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setActiveIngredientModalMed(med)}
                            className="outstock-btn"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: '800',
                              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                              color: '#15803d',
                              border: '1.5px solid #bbf7d0',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(21, 128, 61, 0.1)'
                            }}
                            title="عرض قائمة المواد الفعالة والشركة المصنعة"
                          >
                            <FlaskConical size={14} color="#15803d" />
                            <span>المادة الفعالة والشركة 🔬</span>
                          </button>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '3px 8px',
                            background: '#f1f5f9',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '700',
                            color: '#334155'
                          }}>
                            {med.dosage_form}
                          </span>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                            {med.pack_size > 1 ? `العلبة: ${med.pack_size} ${med.unit_name || 'شرائط'}` : 'عبوة كاملة'}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#475569' }}>
                          {med.gtin_barcode || '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: '#ecfdf5',
                            color: '#065f46',
                            borderRadius: '8px',
                            fontWeight: '900',
                            fontSize: '13.5px',
                            border: '1px solid #a7f3d0'
                          }}>
                            {med.public_price} ج.م
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: '#f8fafc',
                            color: '#1e293b',
                            borderRadius: '8px',
                            fontWeight: '800',
                            fontSize: '13px',
                            border: '1px solid #e2e8f0'
                          }}>
                            {med.unit_price} ج.م
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (med.item_type === 'cosmetics') {
                                  setSelectedCosmeticsItem(med);
                                  setCosmeticsModalMode('edit');
                                  setIsCosmeticsModalOpen(true);
                                } else {
                                  handleOpenMasterCard(med.id);
                                }
                              }}
                              className="outstock-btn outstock-btn-secondary"
                              style={{
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: med.item_type === 'cosmetics' ? '#fdf2f8' : '#eff6ff',
                                color: med.item_type === 'cosmetics' ? '#be185d' : '#1d4ed8',
                                border: med.item_type === 'cosmetics' ? '1px solid #fbcfe8' : '1px solid #bfdbfe'
                              }}
                              title="عرض كارتة الصنف والبدائل وسجل الأسعار"
                            >
                              {med.item_type === 'cosmetics' ? <Sparkles size={13} /> : <FileText size={13} />}
                              <span>{med.item_type === 'cosmetics' ? 'كارتة التجميل 💄' : 'كارتة الصنف'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenBarcodePrint(med)}
                              className="outstock-btn outstock-btn-secondary"
                              style={{
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#f8fafc',
                                color: '#334155',
                                border: '1px solid #cbd5e1'
                              }}
                              title="طباعة ملصق باركود حراري (38x25mm أو 50x25mm)"
                            >
                              <Barcode size={13} />
                              <span>باركود</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(med)}
                              className="outstock-btn outstock-btn-secondary"
                              style={{
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="تعديل السعر الرسمي وتعميمه"
                            >
                              <Edit3 size={13} />
                              <span>تعديل السعر</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setMedToDelete(med)}
                              className="outstock-btn"
                              style={{
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fecaca'
                              }}
                              title="حذف هذا الصنف من كتالوج الأدوية نهائياً"
                            >
                              <Trash2 size={13} />
                              <span>حذف</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. تبويب سجل تدقيق تحريك وتعديل الأسعار (Audit Logs) ── */}
      {activeSubTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="ابحث باسم الدواء أو مصدر التعديل..."
              value={auditSearch}
              onChange={(e) => {
                setAuditSearch(e.target.value);
                fetchAuditLogs(1, e.target.value);
              }}
              className="outstock-form-input"
              style={{ flex: 1, minHeight: '42px' }}
            />
            <button
              type="button"
              onClick={() => fetchAuditLogs(1, auditSearch)}
              className="outstock-btn outstock-btn-secondary"
            >
              <RefreshCw size={15} />
              <span>تحديث السجل</span>
            </button>
          </div>

          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px', fontWeight: '800' }}>اسم الدواء</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>السعر السابق</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>السعر الجديد</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>الفارق</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>المصدر والقرار</th>
                  <th style={{ padding: '12px 14px', fontWeight: '800' }}>المسؤول</th>
                  <th style={{ padding: '12px 16px', fontWeight: '800' }}>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                      {isLoadingAudit ? 'جاري تحميل سجل الأسعار...' : 'لا توجد حركات تحريك أسعار مسجلة حتى الآن.'}
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: '800', color: '#0f172a' }}>
                        {log.trade_name}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>
                        {log.old_public_price} ج.م
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: '800', color: '#059669' }}>
                        {log.new_public_price} ج.م
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: '800',
                          fontSize: '12px',
                          background: log.price_diff > 0 ? '#ecfdf5' : '#fee2e2',
                          color: log.price_diff > 0 ? '#059669' : '#dc2626'
                        }}>
                          {log.price_diff > 0 ? `+${log.price_diff}` : log.price_diff} ج.م
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        <div>{log.revision_source}</div>
                        {log.decree_number && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{log.decree_number}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontWeight: '600' }}>
                        {log.changed_by || 'النظام التلقائي'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                        {new Date(log.created_at).toLocaleString('ar-EG')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3. تبويب مستورد وتحديث الأسعار الجماعي الذكي (Bulk Re-Pricer) ── */}
      {activeSubTab === 'bulk_upload' && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
        }}>
          {/* ترويسة التبويب */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={22} color="#0d9488" />
                <span>مستورد وتحديث الأسعار الجماعي الذكي (Bulk Re-Pricer)</span>
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                تصدير نموذج إكسل رسمي فارغ بكافة بيانات كارتة الصنف، أو الاستيراد المباشر من ملفات الإكسل، أو التحليل الشامل بالذكاء الاصطناعي مع منع التكرار.
              </p>
            </div>

            {bulkResult && (
              <div style={{
                padding: '8px 16px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '10px',
                color: '#065f46',
                fontSize: '13px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle2 size={16} />
                <span>تم بنجاح تحديث {bulkResult.updatedCount} صنف دوائي!</span>
              </div>
            )}
          </div>

          {/* حقول مصدر التحديث والقرار الوزاري */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div className="outstock-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>مصدر التعديل أو المنشور</label>
              <input
                type="text"
                value={bulkSource}
                onChange={(e) => setBulkSource(e.target.value)}
                placeholder="مثلاً: منشور لجنة التسعير الجبري الرسمي - هيئة الدواء"
                className="outstock-form-input"
              />
            </div>
            <div className="outstock-form-group">
              <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>رقم القرار الوزاري / المنشور (اختياري)</label>
              <input
                type="text"
                value={bulkDecree}
                onChange={(e) => setBulkDecree(e.target.value)}
                placeholder="EDA-PRICE-2026-09"
                className="outstock-form-input"
              />
            </div>
          </div>

          {/* ── بطاقات الإجراءات الثلاث الفاخرة (Export Template, Import Excel, AI Analyzer) ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px'
          }}>
            {/* 1. بطاقة تصدير نموذج الإكسل الفارغ */}
            <div style={{
              background: '#f0fdfa',
              border: '1.5px solid #99f6e4',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e', fontWeight: '900', fontSize: '14.5px', marginBottom: '6px' }}>
                  <Download size={18} />
                  <span>1. تصدير نموذج إكسل فارغ</span>
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.45 }}>
                  تحميل ملف إكسل رسمي منسق باحترافية يحتوي على كافة حقول كارتة الصنف وأمثلة إرشادية لملئه بالأسعار الجديدة.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportExcelTemplate}
                className="outstock-btn outstock-btn-primary"
                style={{ width: '100%', padding: '10px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Download size={16} />
                <span>تحميل نموذج الإكسل الفارغ (.xlsx)</span>
              </button>
            </div>

            {/* 2. بطاقة استيراد وتحديث من ملف إكسل */}
            <div style={{
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d4ed8', fontWeight: '900', fontSize: '14.5px', marginBottom: '6px' }}>
                  <Upload size={18} />
                  <span>2. استيراد وتحديث من إكسل</span>
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.45 }}>
                  رفع ملف الإكسل المعبأ من قبل المسؤول لاستخراج وتدقيق وتحديث الأسعار جماعياً مع منع تام لتكرار الأصناف.
                </p>
              </div>

              {/* مدخل ملف مخفي */}
              <input
                type="file"
                ref={excelFileInputRef}
                accept=".xlsx, .xls"
                style={{ display: 'none' }}
                onChange={handleExcelFileSelect}
              />

              <button
                type="button"
                onClick={() => excelFileInputRef.current?.click()}
                disabled={isBulkProcessing}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: isBulkProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Upload size={16} />
                <span>{isBulkProcessing && bulkMode === 'excel' ? 'جاري قراءة الإكسل...' : 'استيراد وتدقيق ملف إكسل'}</span>
              </button>
            </div>

            {/* 3. بطاقة التحليل بالذكاء الاصطناعي (AI Document Analyzer) */}
            <div style={{
              background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
              border: '1.5px solid #d8b4fe',
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#7e22ce', fontWeight: '900', fontSize: '14.5px', marginBottom: '6px' }}>
                  <Sparkles size={18} color="#9333ea" />
                  <span>3. تحليل بالذكاء الاصطناعي</span>
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', lineHeight: 1.45 }}>
                  تحليل ذكي فوري لأي ملف إكسل أو مستند PDF أو صورة فاتورة/كشف لاستخراج الأصناف والبيانات والتسعيرة مع منع التكرار.
                </p>
              </div>

              {/* مدخل ملف ذكاء اصطناعي مخفي */}
              <input
                type="file"
                ref={aiFileInputRef}
                accept=".xlsx, .xls, .pdf, image/*"
                style={{ display: 'none' }}
                onChange={handleAiFileSelect}
              />

              <button
                type="button"
                onClick={() => aiFileInputRef.current?.click()}
                disabled={isAiAnalyzing}
                style={{
                  background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: '800',
                  cursor: isAiAnalyzing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(147, 51, 234, 0.28)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Sparkles size={16} />
                <span>{isAiAnalyzing ? 'جاري التحليل بالذكاء الاصطناعي...' : 'تحليل ذكي (Excel / PDF / صورة)'}</span>
              </button>
            </div>
          </div>

          {/* مؤشر حالة تحليل الذكاء الاصطناعي */}
          {isAiAnalyzing && (
            <div style={{
              background: '#fdf4ff',
              border: '1.5px solid #f0abfc',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#86198f',
              fontSize: '13.5px',
              fontWeight: '700'
            }}>
              <RefreshCw size={18} className="spin" color="#a21caf" />
              <span>{aiStatusMsg || 'جاري استخراج بيانات الأدوية والأسعار بالذكاء الاصطناعي...'}</span>
            </div>
          )}

          {/* تنبيهات التكرار إن وجدت */}
          {previewDuplicatesCount > 0 && (
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '10px 14px',
              color: '#92400e',
              fontSize: '12.5px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} color="#d97706" />
              <span>تم رصد واستبعاد {previewDuplicatesCount} صنف مكرر تلقائياً لضمان سلامة قاعدة البيانات وعدم تكرار الأصناف.</span>
            </div>
          )}

          {/* ── جدول المعاينة والتأكيد قبل الحفظ (Interactive Pre-Save Preview) ── */}
          {bulkPreviewItems.length > 0 && (
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #0d9488',
              borderRadius: '16px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 8px 24px rgba(13, 148, 136, 0.08)'
            }}>
              {/* شريط أدوات المعاينة */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>
                    معاينة الأصناف المستخرجة قبل الاعتماد ({selectedPreviewIndices.size} محدد من {bulkPreviewItems.length})
                  </span>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '800',
                    background: bulkMode === 'ai' ? '#f3e8ff' : '#eff6ff',
                    color: bulkMode === 'ai' ? '#7e22ce' : '#1d4ed8',
                    border: '1px solid',
                    borderColor: bulkMode === 'ai' ? '#d8b4fe' : '#bfdbfe'
                  }}>
                    {bulkMode === 'ai' ? '✨ استخراج بالذكاء الاصطناعي' : '📊 مستورد من ملف إكسل'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setIsExcelPreviewModalOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(13, 148, 136, 0.25)'
                    }}
                  >
                    <Edit3 size={14} />
                    <span>نافذة المعاينة والتعديل الشاملة (20 عمود) 🔍</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleAllPreview}
                    className="outstock-btn outstock-btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    {selectedPreviewIndices.size === bulkPreviewItems.length ? 'إلغاء تحديد الكل' : 'تحديد جميع الأصناف'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('هل تريد إلغاء المعاينة وتفريغ القائمة؟')) {
                        setBulkPreviewItems([]);
                        setSelectedPreviewIndices(new Set());
                      }
                    }}
                    className="outstock-btn outstock-btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px', color: '#dc2626' }}
                  >
                    إلغاء المعاينة
                  </button>
                </div>
              </div>

              {/* الجدول التفاعلي */}
              <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPreviewIndices.size === bulkPreviewItems.length && bulkPreviewItems.length > 0}
                          onChange={handleToggleAllPreview}
                        />
                      </th>
                      <th style={{ padding: '10px 10px', width: '45px', textAlign: 'center' }}>#</th>
                      <th style={{ padding: '10px 12px' }}>الباركود الدولي</th>
                      <th style={{ padding: '10px 12px' }}>اسم الدواء التجاري</th>
                      <th style={{ padding: '10px 12px' }}>المادة الفعالة</th>
                      <th style={{ padding: '10px 12px' }}>الشكل والتركيز</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>الشرائط</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>سعر العلبة</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>سعر الشريط</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>الرقابة</th>
                      <th style={{ padding: '10px 10px', textAlign: 'center' }}>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreviewItems.map((item, idx) => {
                      const isChecked = selectedPreviewIndices.has(idx);
                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isChecked ? '#ffffff' : '#f8fafc',
                            opacity: isChecked ? 1 : 0.6
                          }}
                        >
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePreviewRow(idx)}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '12px', color: '#334155' }}>
                            {item.gtin_barcode || '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: '800', color: '#0f172a' }}>{item.trade_name_ar}</div>
                            {item.trade_name_en && (
                              <div style={{ fontSize: '11.5px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                                {item.trade_name_en}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#475569', fontSize: '12px' }}>
                            {item.generic_name || '—'}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#475569' }}>
                            {item.dosage_form} {item.strength || ''}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 'bold' }}>
                            {item.pack_size}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '900', color: '#0f766e' }}>
                            {parseFloat(item.public_price || 0).toFixed(2)} ج.م
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>
                            {parseFloat(item.unit_price || 0).toFixed(2)} ج.م
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                              {item.is_table_drug && (
                                <span style={{ padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontSize: '10px', fontWeight: 'bold' }}>
                                  جدول 🚨
                                </span>
                              )}
                              {item.is_refrigerated && (
                                <span style={{ padding: '1px 5px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: 'bold' }}>
                                  ثلاجة ❄️
                                </span>
                              )}
                              {!item.is_table_drug && !item.is_refrigerated && (
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>عادي</span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemovePreviewRow(idx)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '6px'
                              }}
                              title="حذف من المعاينة"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* زر الحفظ النهائي المعتمد */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '8px' }}>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: '700' }}>
                  سيتم تطبيق ونشر الأسعار الرسمية فوراً على قاعدة بيانات الكتالوج المركزي وتوثيقها في سجل التدقيق الرقابي.
                </div>

                <button
                  type="button"
                  onClick={handleConfirmBulkSave}
                  disabled={isBulkProcessing || selectedPreviewIndices.size === 0}
                  className="outstock-btn outstock-btn-primary"
                  style={{ padding: '11px 26px', fontSize: '14px', fontWeight: '800' }}
                >
                  <CheckCircle2 size={18} />
                  <span>
                    {isBulkProcessing
                      ? 'جاري حفظ وتعميم الأسعار...'
                      : `تأكيد واعتماد وتحديث (${selectedPreviewIndices.size}) صنف الآن 🚀`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. نافذة منبثقة لتعديل سعر صنف منفرد (Edit Price Modal) ── */}
      {selectedMedToEdit && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            position: 'relative'
          }}>
            <button
              type="button"
              onClick={() => setSelectedMedToEdit(null)}
              style={{
                position: 'absolute',
                left: '20px',
                top: '20px',
                border: 'none',
                background: '#f1f5f9',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>

            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'inline-flex', padding: '4px 10px', background: '#f0fdfa', color: '#0d9488', borderRadius: '8px', fontSize: '12px', fontWeight: '800', marginBottom: '8px' }}>
                تحديث السعر الرسمي للصنف
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
                {selectedMedToEdit.trade_name_ar}
              </h3>
              <div style={{ fontSize: '13px', color: '#64748b', direction: 'ltr', textAlign: 'right', marginTop: '2px' }}>
                ({selectedMedToEdit.trade_name_en})
              </div>
            </div>

            <form onSubmit={handleSavePrice} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="outstock-form-group">
                  <label>سعر العلبة الجديد (ج.م) *</label>
                  <input
                    type="number"
                    step="0.25"
                    required
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="outstock-form-input"
                    style={{ fontSize: '16px', fontWeight: '900', color: '#0d9488' }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    السعر السابق: {selectedMedToEdit.public_price} ج.م
                  </div>
                </div>

                <div className="outstock-form-group">
                  <label>عدد الشرائط بالعلبة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editPackSize}
                    onChange={(e) => setEditPackSize(e.target.value)}
                    className="outstock-form-input"
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    سعر الشريط الجديد: {editPrice ? (parseFloat(editPrice) / Math.max(1, parseInt(editPackSize || '1', 10))).toFixed(2) : '0.00'} ج.م
                  </div>
                </div>
              </div>

              <div className="outstock-form-group">
                <label>سبب التعديل أو المصدر</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="منشور التسعيرة الجبرية - هيئة الدواء"
                  className="outstock-form-input"
                />
              </div>

              <div className="outstock-form-group">
                <label>رقم القرار / المنشور (إن وجد)</label>
                <input
                  type="text"
                  value={editDecreeNumber}
                  onChange={(e) => setEditDecreeNumber(e.target.value)}
                  placeholder="مثلاً: EDA-2026-AUG-15"
                  className="outstock-form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSavingPrice}
                  className="outstock-btn outstock-btn-primary"
                  style={{ flex: 1, minHeight: '44px' }}
                >
                  <CheckCircle size={16} />
                  <span>{isSavingPrice ? 'جاري الحفظ والتعميم...' : 'حفظ وتعميم السعر على جميع الفروع'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMedToEdit(null)}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ minHeight: '44px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. نافذة كارتة الصنف والبدائل (Item Master Card Modal) ── */}
      <MedicationMasterCardModal
        medicationId={masterCardMedId}
        masterCardData={masterCardData}
        isLoading={isLoadingMasterCard}
        onClose={() => setMasterCardMedId(null)}
        onSelectSubstitute={(subId) => handleOpenMasterCard(subId)}
      />

      {/* ── 6. نافذة طباعة ملصق الباركود الحراري (Barcode Label Printing Modal) ── */}
      {barcodeMedToPrint && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
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
              maxWidth: '480px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Barcode size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>طباعة ملصق باركود حراري</h3>
                  <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>Code 128 قياسي متوافق مع كافة طابعات الباركود</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeMedToPrint(null)}
                style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '6px', color: '#ffffff', cursor: 'pointer', padding: '5px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* إعدادات المقاس والنسخ */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    مقاس الملصق الحراري:
                  </label>
                  <select
                    value={barcodeLabelSize}
                    onChange={(e) => setBarcodeLabelSize(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="38x25">38 × 25 ملم (القياسي)</option>
                    <option value="50x25">50 × 25 ملم (عريض)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    عدد الملصقات:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={barcodeCopies}
                    onChange={(e) => setBarcodeCopies(parseInt(e.target.value || 1, 10))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* معاينة الملصق المطبوع */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                  معاينة الملصق الفعلي:
                </span>
                <div
                  id="outstock-barcode-thermal-label"
                  style={{
                    display: 'inline-block',
                    width: barcodeLabelSize === '50x25' ? '190px' : '150px',
                    padding: '8px',
                    border: '1.5px dashed #94a3b8',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#000000',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: '800', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {barcodeMedToPrint.trade_name_ar}
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: '700', color: '#475569', direction: 'ltr', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {barcodeMedToPrint.trade_name_en}
                  </div>

                  <div
                    style={{ margin: '4px auto', maxWidth: '100%' }}
                    dangerouslySetInnerHTML={{
                      __html: generateBarcodeSvgString(
                        barcodeMedToPrint.gtin_barcode || barcodeMedToPrint.eda_reg_no || barcodeMedToPrint.id,
                        { height: 32 }
                      )
                    }}
                  />

                  <div style={{ fontSize: '12px', fontWeight: '900', marginTop: '2px' }}>
                    السعر: {parseFloat(barcodeMedToPrint.public_price || 0).toFixed(2)} ج.م
                  </div>
                  {barcodeMedToPrint.pack_size > 1 && (
                    <div style={{ fontSize: '8.5px', color: '#64748b' }}>
                      سعر {barcodeMedToPrint.unit_name || 'الشريط'}: {parseFloat(barcodeMedToPrint.unit_price || 0).toFixed(2)} ج.م
                    </div>
                  )}
                </div>
              </div>

              {/* أزرار الطباعة */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const printContents = document.getElementById('outstock-barcode-thermal-label')?.innerHTML;
                    const printWindow = window.open('', '_blank', 'width=400,height=300');
                    if (printWindow) {
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html dir="rtl">
                        <head>
                          <meta charset="utf-8" />
                          <title>طباعة ملصق باركود</title>
                          <style>
                            @page {
                              size: ${barcodeLabelSize === '50x25' ? '50mm 25mm' : '38mm 25mm'};
                              margin: 0;
                            }
                            body {
                              margin: 0;
                              padding: 2mm;
                              font-family: Arial, sans-serif;
                              display: flex;
                              flex-direction: column;
                              align-items: center;
                              justify-content: center;
                              text-align: center;
                            }
                            svg { max-width: 100%; height: auto; }
                          </style>
                        </head>
                        <body>
                          ${Array(barcodeCopies).fill(printContents).join('<div style="page-break-after: always;"></div>')}
                          <script>
                            window.onload = function() {
                              window.print();
                              window.onafterprint = function() { window.close(); };
                            };
                          </script>
                        </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '800',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Printer size={16} />
                  <span>إرسال للطابعة الحرارية ({barcodeCopies} ملصق)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBarcodeMedToPrint(null)}
                  style={{ padding: '12px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. نافذة إضافة صنف دوائي / مستحضرات جديد (Owner Add Medication Modal) ── */}
      <AddMedicationModal
        isOpen={isAddModalOpen}
        initialData={{
          item_type: newItemType,
          category: newItemType === 'cosmetics' ? 'مستحضرات تجميل' : 'أدوية علاجية'
        }}
        onClose={() => setIsAddModalOpen(false)}
        onSaveSuccess={(createdMed) => {
          showToast?.(`✅ تم إضافة صنف "${createdMed.trade_name_ar || createdMed.tradeName}" للكتالوج المركزي بنجاح`);
          handleSearch(searchTerm || '');
        }}
      />

      {/* ── 7.1 نافذة التخيير بين كارتة صنف دوائي وكارتة صنف مستحضرات (Choice Modal) ── */}
      {isChoiceModalOpen && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => setIsChoiceModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130000,
            padding: '20px'
          }}
        >
          <div
            className="outstock-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              direction: 'rtl',
              textAlign: 'right'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                    تحديد نوع الصنف الجديد 📦
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    اختر نوع الكارتة المطلوبة لفتح الحقول والمواصفات المناسبة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChoiceModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              {/* خيار 1: كارتة صنف دوائي */}
              <button
                type="button"
                onClick={() => {
                  setNewItemType('medication');
                  setIsChoiceModalOpen(false);
                  setIsAddModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '16px 18px',
                  borderRadius: '14px',
                  border: '2px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.18s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#059669';
                  e.currentTarget.style.background = '#f0fdf4';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#f8fafc';
                }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Pill size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '800', fontSize: '14.5px', color: '#0f172a' }}>
                    💊 كارتة صنف دوائي (Medication)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', lineHeight: '1.4' }}>
                    أقراص، كبسولات، حقن، شراب، والتحكم في الجرعات والتسعيرة الجبرية وجدول المخدرات
                  </div>
                </div>
              </button>

              {/* خيار 2: كارتة صنف مستحضرات */}
              <button
                type="button"
                onClick={() => {
                  setNewItemType('cosmetics');
                  setIsChoiceModalOpen(false);
                  setSelectedCosmeticsItem(null);
                  setCosmeticsModalMode('add');
                  setIsCosmeticsModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '16px 18px',
                  borderRadius: '14px',
                  border: '2px solid #fce7f3',
                  background: '#fdf2f8',
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.18s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#db2777';
                  e.currentTarget.style.background = '#fce7f3';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#fce7f3';
                  e.currentTarget.style.background = '#fdf2f8';
                }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fbcfe8', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '800', fontSize: '14.5px', color: '#be185d' }}>
                    💄 كارتة صنف مستحضرات تجميل (Cosmetics)
                  </div>
                  <div style={{ fontSize: '12px', color: '#9d174d', marginTop: '3px', lineHeight: '1.4' }}>
                    عناية بالبشرة، عناية بالشعر، لوشن، واقي شمس، ومستحضرات تجميلية بأسعار حرة
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7.2 نافذة تفاصيل المادة الفعالة والشركة المصنعة ── */}
      {activeIngredientModalMed && (
        <div
          className="outstock-modal-backdrop"
          onClick={() => setActiveIngredientModalMed(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130000,
            padding: '20px'
          }}
        >
          <div
            className="outstock-modal-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
              direction: 'rtl',
              textAlign: 'right'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FlaskConical size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                    {activeIngredientModalMed.trade_name_ar || activeIngredientModalMed.trade_name_en}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b', direction: 'ltr', textAlign: 'right' }}>
                    {activeIngredientModalMed.trade_name_en}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveIngredientModalMed(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
              {/* قسم المادة الفعالة */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <FlaskConical size={14} />
                  <span>المادة الفعالة والتركيب العلمي (Active Ingredients)</span>
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a', lineHeight: '1.6', wordBreak: 'break-word' }}>
                  {activeIngredientModalMed.generic_name || 'غير محدد'}
                </div>
                {activeIngredientModalMed.strength && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    التركيز الدوائي: <strong>{activeIngredientModalMed.strength}</strong>
                  </div>
                )}
                {Array.isArray(activeIngredientModalMed.active_ingredients_list) && activeIngredientModalMed.active_ingredients_list.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {activeIngredientModalMed.active_ingredients_list.map((ing, i) => (
                      <span
                        key={i}
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}
                      >
                        {typeof ing === 'object' ? `${ing.name || ''} ${ing.concentration || ''}` : String(ing)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* قسم الشركة المصنعة */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: '800', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Building2 size={14} />
                  <span>الشركة المصنعة وجهة الإنتاج (Manufacturer)</span>
                </div>
                <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0f172a' }}>
                  {activeIngredientModalMed.manufacturer || 'شركة معتمدة بهيئة الدواء المصرية'}
                </div>
                {activeIngredientModalMed.category && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    التصنيف: <strong>{activeIngredientModalMed.category}</strong>
                  </div>
                )}
              </div>

              {/* قسم المواصفات الصيدلية والباركود */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#f1f5f9', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block' }}>الشكل والوحدة:</span>
                  <strong style={{ fontSize: '12.5px', color: '#1e293b' }}>
                    {activeIngredientModalMed.dosage_form} ({activeIngredientModalMed.pack_size > 1 ? `${activeIngredientModalMed.pack_size} ${activeIngredientModalMed.unit_name || 'شرائط'}` : 'عبوة كاملة'})
                  </strong>
                </div>
                <div style={{ background: '#f1f5f9', padding: '10px 12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block' }}>الباركود الدولي (GTIN):</span>
                  <strong style={{ fontSize: '12.5px', color: '#1e293b' }}>{activeIngredientModalMed.gtin_barcode || 'لا يوجد'}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setActiveIngredientModalMed(null)}
                className="outstock-btn outstock-btn-primary"
                style={{ padding: '8px 22px' }}
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── 8. نافذة تأكيد حذف الصنف من الكتالوج ── */}
      {medToDelete && (
        <div className="outstock-modal-backdrop" style={{ zIndex: 10005 }}>
          <div className="outstock-modal-panel modal-sm" style={{ padding: '24px', maxWidth: '440px' }}>
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Trash2 size={28} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>
                تأكيد حذف الصنف من الكتالوج
              </h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b', lineHeight: '1.6' }}>
                هل أنت متأكد من رغبتك في حذف صنف{' '}
                <strong style={{ color: '#b91c1c' }}>{medToDelete.trade_name_ar || medToDelete.trade_name_en}</strong>{' '}
                نهائياً من كتالوج الأدوية المركزي؟
              </p>
              <div style={{
                marginTop: '12px',
                background: '#f8fafc',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '12.5px',
                color: '#475569',
                textAlign: 'right'
              }}>
                <div>السعر الرسمي: <strong>{medToDelete.public_price} ج.م</strong></div>
                {medToDelete.generic_name && <div style={{ marginTop: '4px' }}>المادة الفعالة: {medToDelete.generic_name}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setMedToDelete(null)}
                disabled={isDeletingMed}
                style={{ flex: 1 }}
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                className="outstock-btn"
                onClick={handleConfirmDeleteMedication}
                disabled={isDeletingMed}
                style={{
                  flex: 1,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: '800'
                }}
              >
                {isDeletingMed ? 'جاري الحذف...' : 'نعم، حذف نهائي 🗑️'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 9. نافذة كارتة مستحضرات التجميل (إضافة / تعديل / استعراض) ── */}
      {isCosmeticsModalOpen && (
        <CosmeticsProductModal
          isOpen={isCosmeticsModalOpen}
          mode={cosmeticsModalMode}
          item={selectedCosmeticsItem}
          onClose={() => {
            setIsCosmeticsModalOpen(false);
            setSelectedCosmeticsItem(null);
          }}
          onSaved={() => {
            setIsCosmeticsModalOpen(false);
            setSelectedCosmeticsItem(null);
            handleSearch(searchTerm);
            fetchStats();
          }}
          showToast={showToast}
        />
      )}

      {/* ── 10. نافذة منبثقة تفاعلية للمعاينة والتدقيق الذكي بالذكاء الاصطناعي قبل الحفظ والاسترداد ── */}
      {isExcelPreviewModalOpen && (() => {
        const totalItemsCount = bulkPreviewItems.length;
        const validItemsCount = bulkPreviewItems.filter(it => (it.trade_name_ar || '').trim().length >= 2 && parseFloat(it.public_price || 0) > 0).length;
        const warningItemsCount = bulkPreviewItems.filter(it => !(it.trade_name_ar || '').trim() || parseFloat(it.public_price || 0) <= 0).length;
        const medItemsCount = bulkPreviewItems.filter(it => it.item_type !== 'cosmetics' && it.department !== 'مستحضرات تجميل').length;
        const cosItemsCount = bulkPreviewItems.filter(it => it.item_type === 'cosmetics' || it.department === 'مستحضرات تجميل').length;
        const avgPriceVal = totalItemsCount > 0
          ? (bulkPreviewItems.reduce((acc, it) => acc + (parseFloat(it.public_price) || 0), 0) / totalItemsCount).toFixed(2)
          : '0.00';

        const filteredList = bulkPreviewItems
          .map((item, origIdx) => ({ item, origIdx }))
          .filter(({ item }) => {
            if (previewDeptFilter === 'medicine' && (item.item_type === 'cosmetics' || item.department === 'مستحضرات تجميل')) return false;
            if (previewDeptFilter === 'cosmetics' && item.item_type !== 'cosmetics' && item.department !== 'مستحضرات تجميل') return false;
            if (previewDeptFilter === 'warning' && (item.trade_name_ar || '').trim().length >= 2 && parseFloat(item.public_price || 0) > 0) return false;
            if (previewDeptFilter !== 'ALL' && previewDeptFilter !== 'medicine' && previewDeptFilter !== 'cosmetics' && previewDeptFilter !== 'warning' && item.department !== previewDeptFilter) return false;

            if (!previewSearchTerm.trim()) return true;
            const q = previewSearchTerm.trim().toLowerCase();
            const hay = `${item.trade_name_ar || ''} ${item.trade_name_en || ''} ${item.detailed_name || ''} ${item.gtin_barcode || ''} ${item.supplier_name || ''}`.toLowerCase();
            return hay.includes(q);
          });

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10010,
            padding: '12px'
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '24px',
              width: '98vw',
              maxWidth: '1620px',
              height: '94vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 30px 90px -15px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              border: '1px solid #cbd5e1'
            }}>
              {/* ── 1. رأس النافذة الفاخر الملكي ── */}
              <div style={{
                padding: '16px 24px',
                background: 'linear-gradient(135deg, #042f2e 0%, #0f172a 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                borderBottom: '2px solid #0d9488'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #0d9488, #14b8a6)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 14px rgba(13, 148, 136, 0.4)'
                  }}>
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '19px', fontWeight: '900', letterSpacing: '-0.3px', color: '#f8fafc' }}>
                        مركز المعاينة والتدقيق الذكي للأصناف ({totalItemsCount} صنف)
                      </h3>
                      <span style={{
                        padding: '3px 12px',
                        borderRadius: '20px',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        background: 'rgba(20, 184, 166, 0.2)',
                        color: '#5eead4',
                        border: '1px solid rgba(45, 212, 191, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <ShieldCheck size={14} />
                        تم استبعاد التعليمات والترويسات تلقائياً
                      </span>
                      <span style={{
                        padding: '3px 12px',
                        borderRadius: '20px',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        background: bulkMode === 'ai' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                        color: bulkMode === 'ai' ? '#d8b4fe' : '#93c5fd',
                        border: '1px solid',
                        borderColor: bulkMode === 'ai' ? 'rgba(192, 132, 252, 0.35)' : 'rgba(147, 197, 253, 0.35)'
                      }}>
                        {bulkMode === 'ai' ? '✨ استخراج بالذكاء الاصطناعي' : '📊 مستورد من ملف إكسل'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                      يمكنك تدقيق وتعديل كروت الأصناف الـ 20 حقلاً، حساب أسعار الشرائط وهوامش الربح، وتطبيق التدقيق الصيدلاني الذكي قبل الاعتماد النهائي.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setIsExcelPreviewModalOpen(false)}
                    style={{
                      border: 'none',
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      borderRadius: '10px',
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                    title="إغلاق النافذة"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* ── 2. شريط مؤشرات الـ KPI والبطاقات الذكية ── */}
              <div style={{
                padding: '10px 24px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px'
              }}>
                <div style={{
                  background: '#ffffff',
                  padding: '9px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>إجمالي الأصناف المكتشفة</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#0f172a' }}>{totalItemsCount} صنف حقيقي</div>
                  </div>
                </div>

                <div style={{
                  background: '#ffffff',
                  padding: '9px 14px',
                  borderRadius: '12px',
                  border: '1px solid #dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>أصناف مكتملة وجاهزة</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#15803d' }}>{validItemsCount} صنف</div>
                  </div>
                </div>

                <div
                  onClick={() => setPreviewDeptFilter(prev => prev === 'warning' ? 'ALL' : 'warning')}
                  style={{
                    background: warningItemsCount > 0 ? '#fffbeb' : '#ffffff',
                    padding: '9px 14px',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: warningItemsCount > 0 ? '#fde68a' : '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer'
                  }}
                  title="انقر لتصفية الأصناف التي تحتاج مراجعة"
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#b45309', fontWeight: '800' }}>تنبيهات السعر والنواقص</div>
                    <div style={{ fontSize: '15px', fontWeight: '900', color: '#92400e' }}>
                      {warningItemsCount > 0 ? `${warningItemsCount} صنف بحاجة لمراجعة` : 'لا توجد أخطاء ✅'}
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#ffffff',
                  padding: '9px 14px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pill size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>التوزيع الدوائي والتجميلي</div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>
                      💊 {medItemsCount} دواء • 💄 {cosItemsCount} تجميل
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 3. شريط التحكم والأدوات ومحرك الذكاء الاصطناعي ── */}
              <div style={{
                padding: '12px 24px',
                borderBottom: '1px solid #e2e8f0',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                {/* البحث والفلترة */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px', maxWidth: '680px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={15} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="بحث فوري بالاسم، الاسم التفصيلي، الباركود، المورد..."
                      value={previewSearchTerm}
                      onChange={(e) => setPreviewSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 34px 8px 12px',
                        fontSize: '12.5px',
                        borderRadius: '9px',
                        border: '1.5px solid #cbd5e1',
                        background: '#f8fafc',
                        outline: 'none',
                        transition: 'border 0.15s ease'
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#0d9488'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; }}
                    />
                    {previewSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setPreviewSearchTerm('')}
                        style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Filter size={15} color="#64748b" />
                    <select
                      value={previewDeptFilter}
                      onChange={(e) => setPreviewDeptFilter(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        borderRadius: '9px',
                        border: '1.5px solid #cbd5e1',
                        background: '#ffffff',
                        outline: 'none',
                        color: '#0f172a',
                        fontWeight: '800'
                      }}
                    >
                      <option value="ALL">جميع الأقسام ({totalItemsCount})</option>
                      <option value="medicine">💊 أصناف دوائية ({medItemsCount})</option>
                      <option value="cosmetics">💄 مستحضرات تجميل ({cosItemsCount})</option>
                      {warningItemsCount > 0 && (
                        <option value="warning">⚠️ تحتاج تدقيق ومراجعة ({warningItemsCount})</option>
                      )}
                      <option value="أدوية">قسم: أدوية</option>
                      <option value="مستحضرات تجميل">قسم: مستحضرات تجميل</option>
                      <option value="عناية شخصية">قسم: عناية شخصية</option>
                      <option value="أجهزة طبية">قسم: أجهزة طبية</option>
                      <option value="مستلزمات">قسم: مستلزمات</option>
                    </select>
                  </div>
                </div>

                {/* أزرار العمليات الذكية ومحرك الذكاء الاصطناعي */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* زر الذكاء الاصطناعي للتدقيق والتحسين */}
                  <button
                    type="button"
                    onClick={handleAiEnrichPreviewItems}
                    disabled={isAiEnriching || totalItemsCount === 0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '9px',
                      padding: '8px 15px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: isAiEnriching ? 'not-allowed' : 'pointer',
                      boxShadow: '0 3px 10px rgba(124, 58, 237, 0.3)',
                      transition: 'all 0.15s ease',
                      opacity: isAiEnriching ? 0.7 : 1
                    }}
                    title="استخدام محرك الذكاء الاصطناعي لاستنتاج الأشكال والشرائط والمواد الفعالة وتدقيق الأسماء"
                  >
                    <Sparkles size={15} className={isAiEnriching ? 'animate-spin' : ''} />
                    <span>{isAiEnriching ? 'جاري التدقيق بالذكاء الاصطناعي...' : '✨ تدقيق بالذكاء الاصطناعي'}</span>
                  </button>

                  {/* زر إعادة احتساب الأسعار والهوامش */}
                  <button
                    type="button"
                    onClick={handleAutoRecalculatePrices}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#f0fdfa',
                      color: '#0d9488',
                      border: '1.5px solid #5eead4',
                      borderRadius: '9px',
                      padding: '8px 13px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                    title="إعادة احتساب سعر الوحدة، التكاليف، وهوامش الأرباح لجميع الأصناف"
                  >
                    <Calculator size={15} />
                    <span>⚡ احتساب الأسعار والهوامش</span>
                  </button>

                  {/* زر إضافة سطر جديد فارغ */}
                  <button
                    type="button"
                    onClick={handleAddBlankPreviewRow}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#ecfdf5',
                      color: '#059669',
                      border: '1.5px solid #6ee7b7',
                      borderRadius: '9px',
                      padding: '8px 13px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={15} />
                    <span>إضافة سطر صنف جديد</span>
                  </button>

                  {/* زر تحديد الكل / إلغاء التحديد */}
                  <button
                    type="button"
                    onClick={handleToggleAllPreview}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#f1f5f9',
                      color: '#334155',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '9px',
                      padding: '8px 13px',
                      fontSize: '12px',
                      fontWeight: '800',
                      cursor: 'pointer'
                    }}
                  >
                    {selectedPreviewIndices.size === totalItemsCount ? (
                      <>
                        <Square size={14} />
                        <span>إلغاء تحديد الكل</span>
                      </>
                    ) : (
                      <>
                        <CheckSquare size={14} />
                        <span>تحديد الكل ({totalItemsCount})</span>
                      </>
                    )}
                  </button>

                  {/* زر تنظيف الأسطر غير المحددة */}
                  {selectedPreviewIndices.size > 0 && selectedPreviewIndices.size < totalItemsCount && (
                    <button
                      type="button"
                      onClick={handleRemoveUncheckedPreviewRows}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '9px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      title="حذف الأسطر غير المحددة من جدول المعاينة"
                    >
                      <Trash2 size={14} />
                      <span>حذف غير المحدد ({totalItemsCount - selectedPreviewIndices.size})</span>
                    </button>
                  )}

                  <div style={{
                    padding: '7px 14px',
                    borderRadius: '9px',
                    background: '#042f2e',
                    border: '1px solid #0d9488',
                    fontSize: '12px',
                    fontWeight: '900',
                    color: '#2dd4bf'
                  }}>
                    المحدد للحفظ: {selectedPreviewIndices.size} من {totalItemsCount}
                  </div>
                </div>
              </div>

              {/* ── 4. الجدول التفاعلي الشامل (DataGrid) ذو التنسيق الملكي ── */}
              <div style={{
                flex: 1,
                overflow: 'auto',
                background: '#f8fafc'
              }}>
                <table style={{
                  width: '100%',
                  minWidth: '2700px',
                  borderCollapse: 'collapse',
                  textAlign: 'right',
                  fontSize: '12px',
                  background: '#ffffff'
                }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0f172a', color: '#f8fafc' }}>
                    <tr style={{ borderBottom: '2.5px solid #0d9488' }}>
                      {/* 1. Checkbox (مُثبت) */}
                      <th style={{ padding: '12px 8px', textAlign: 'center', width: '46px', position: 'sticky', right: 0, background: '#0f172a', zIndex: 25 }}>
                        <input
                          type="checkbox"
                          checked={selectedPreviewIndices.size === totalItemsCount && totalItemsCount > 0}
                          onChange={handleToggleAllPreview}
                          style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                        />
                      </th>
                      {/* 2. # (مُثبت) */}
                      <th style={{ padding: '12px 6px', textAlign: 'center', width: '42px', position: 'sticky', right: '46px', background: '#0f172a', zIndex: 25 }}>#</th>
                      {/* 3. حالة الفحص (مُثبت) */}
                      <th style={{ padding: '12px 10px', width: '105px', textAlign: 'center', position: 'sticky', right: '88px', background: '#0f172a', zIndex: 25 }}>حالة الفحص</th>
                      {/* 4. اسم الصنف التجاري (مُثبت) */}
                      <th style={{ padding: '12px 12px', minWidth: '220px', position: 'sticky', right: '193px', background: '#0f172a', zIndex: 25 }}>اسم الصنف التجاري *</th>
                      {/* 5. فئة الصنف (مُثبت) */}
                      <th style={{ padding: '12px 10px', minWidth: '135px', textAlign: 'center', position: 'sticky', right: '413px', background: '#0f172a', zIndex: 25 }}>نوع الصنف</th>

                      {/* بقية الأعمدة المتحركة */}
                      <th style={{ padding: '12px 10px', minWidth: '180px' }}>الاسم التفصيلي والتركيز</th>
                      <th style={{ padding: '12px 10px', minWidth: '115px', textAlign: 'center' }}>سعر البيع (ج.م) *</th>
                      <th style={{ padding: '12px 8px', minWidth: '85px', textAlign: 'center' }}>الشرائط / الأجزاء</th>
                      <th style={{ padding: '12px 8px', minWidth: '100px', textAlign: 'center' }}>سعر الشريط</th>
                      <th style={{ padding: '12px 10px', minWidth: '140px' }}>المورد / الشركة</th>
                      <th style={{ padding: '12px 8px', minWidth: '85px', textAlign: 'center' }}>خصم %</th>
                      <th style={{ padding: '12px 8px', minWidth: '90px', textAlign: 'center' }}>خصم إضافي %</th>
                      <th style={{ padding: '12px 8px', minWidth: '95px', textAlign: 'center' }}>تطبيق ض.ق.م</th>
                      <th style={{ padding: '12px 10px', minWidth: '130px' }}>القسم</th>
                      <th style={{ padding: '12px 10px', minWidth: '150px' }}>فئة التصنيف</th>
                      <th style={{ padding: '12px 8px', minWidth: '105px', textAlign: 'center' }}>بحساب سعر التكلفة</th>
                      <th style={{ padding: '12px 8px', minWidth: '110px', textAlign: 'center' }}>آخر سعر تكلفة</th>
                      <th style={{ padding: '12px 8px', minWidth: '100px', textAlign: 'center' }}>أقصى خصم مبيعات %</th>
                      <th style={{ padding: '12px 8px', minWidth: '90px', textAlign: 'center' }}>الرصيد الحالي</th>
                      <th style={{ padding: '12px 8px', minWidth: '110px', textAlign: 'center' }}>متوسط سعر التكلفة</th>
                      <th style={{ padding: '12px 8px', minWidth: '95px', textAlign: 'center' }}>% الربح</th>
                      <th style={{ padding: '12px 8px', minWidth: '105px', textAlign: 'center' }}>تاريخ صلاحية</th>
                      <th style={{ padding: '12px 8px', minWidth: '85px', textAlign: 'center' }}>طباعة لواصق</th>
                      <th style={{ padding: '12px 8px', minWidth: '85px', textAlign: 'center' }}>صنف مستورد</th>
                      <th style={{ padding: '12px 8px', minWidth: '110px', textAlign: 'center' }}>أدوية جدول/ثلاجة</th>
                      <th style={{ padding: '12px 10px', minWidth: '150px' }}>الباركود الدولي</th>
                      <th style={{ padding: '12px 8px', minWidth: '60px', textAlign: 'center' }}>حذف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.length === 0 ? (
                      <tr>
                        <td colSpan={27} style={{ padding: '45px 20px', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <Package size={36} color="#94a3b8" />
                            <div style={{ fontSize: '15px', fontWeight: '800', color: '#334155' }}>لم يتم العثور على أسطر تطابق معايير الفلترة الحالية</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>جرب إلغاء كلمة البحث أو تغيير القسم المختار</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredList.map(({ item, origIdx }) => {
                        const isChecked = selectedPreviewIndices.has(origIdx);
                        const isCosmetic = item.item_type === 'cosmetics' || item.department === 'مستحضرات تجميل';
                        const price = parseFloat(item.public_price || 0);
                        const hasValidPrice = price > 0;
                        const hasValidName = (item.trade_name_ar || '').trim().length >= 2;
                        const isComplete = hasValidPrice && hasValidName;

                        return (
                          <tr
                            key={origIdx}
                            style={{
                              borderBottom: '1px solid #e2e8f0',
                              background: isChecked ? (origIdx % 2 === 0 ? '#ffffff' : '#fafafa') : '#f1f5f9',
                              opacity: isChecked ? 1 : 0.6,
                              transition: 'all 0.12s ease'
                            }}
                          >
                            {/* 1. Checkbox */}
                            <td style={{ padding: '8px 8px', textAlign: 'center', position: 'sticky', right: 0, background: isChecked ? '#ffffff' : '#f1f5f9', zIndex: 10 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePreviewRow(origIdx)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 2. # */}
                            <td style={{ padding: '8px 6px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: '800', position: 'sticky', right: '46px', background: isChecked ? '#ffffff' : '#f1f5f9', zIndex: 10 }}>
                              {origIdx + 1}
                            </td>

                            {/* 3. حالة الفحص */}
                            <td style={{ padding: '8px 8px', textAlign: 'center', position: 'sticky', right: '88px', background: isChecked ? '#ffffff' : '#f1f5f9', zIndex: 10 }}>
                              {item.isAiEnriched ? (
                                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: '800', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe' }}>
                                  ✨ ذكاء اصطناعي
                                </span>
                              ) : isComplete ? (
                                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: '800', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                  🟢 جاهز
                                </span>
                              ) : (
                                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: '800', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                                  🟡 بدون سعر
                                </span>
                              )}
                            </td>

                            {/* 4. اسم الصنف */}
                            <td style={{ padding: '8px 10px', position: 'sticky', right: '193px', background: isChecked ? '#ffffff' : '#f1f5f9', zIndex: 10 }}>
                              <input
                                type="text"
                                value={item.trade_name_ar || ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'trade_name_ar', e.target.value)}
                                placeholder="اسم الصنف التجاري بالعربية *"
                                style={{
                                  width: '100%',
                                  padding: '6px 9px',
                                  fontSize: '12px',
                                  fontWeight: '900',
                                  color: '#0f172a',
                                  border: '1.5px solid',
                                  borderColor: !hasValidName ? '#f87171' : '#cbd5e1',
                                  borderRadius: '7px',
                                  outline: 'none',
                                  background: '#ffffff'
                                }}
                              />
                              {item.trade_name_en && (
                                <div style={{ fontSize: '10px', color: '#64748b', direction: 'ltr', textAlign: 'right', marginTop: '2px', fontWeight: '700' }}>
                                  {item.trade_name_en}
                                </div>
                              )}
                            </td>

                            {/* 5. فئة الصنف */}
                            <td style={{ padding: '8px 8px', textAlign: 'center', position: 'sticky', right: '413px', background: isChecked ? '#ffffff' : '#f1f5f9', zIndex: 10 }}>
                              <select
                                value={item.item_type || 'medicine'}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'item_type', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  fontSize: '11px',
                                  fontWeight: '900',
                                  border: '1.5px solid',
                                  borderColor: isCosmetic ? '#f472b6' : '#93c5fd',
                                  background: isCosmetic ? '#fdf2f8' : '#eff6ff',
                                  color: isCosmetic ? '#be185d' : '#1d4ed8',
                                  borderRadius: '7px',
                                  outline: 'none'
                                }}
                              >
                                <option value="medicine">💊 صنف دوائي</option>
                                <option value="cosmetics">💄 مستحضرات تجميل</option>
                              </select>
                            </td>

                            {/* 6. الاسم التفصيلي */}
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                value={item.detailed_name || ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'detailed_name', e.target.value)}
                                placeholder="الاسم التفصيلي والتركيز"
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  fontSize: '11.5px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 7. سعر البيع */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.25"
                                value={item.public_price ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'public_price', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '95px',
                                  padding: '6px 6px',
                                  fontSize: '13px',
                                  fontWeight: '900',
                                  color: '#0d9488',
                                  textAlign: 'center',
                                  border: '1.5px solid #0d9488',
                                  borderRadius: '7px',
                                  outline: 'none',
                                  background: '#f0fdfa'
                                }}
                              />
                            </td>

                            {/* 8. الشرائط / الأجزاء */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.pack_size || 1}
                                  onChange={(e) => handleUpdatePreviewItem(origIdx, 'pack_size', parseInt(e.target.value, 10) || 1)}
                                  style={{
                                    width: '50px',
                                    padding: '5px 4px',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                    fontWeight: '800',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    outline: 'none'
                                  }}
                                />
                                <span style={{ fontSize: '10.5px', color: '#64748b' }}>{item.unit_name || 'شريط'}</span>
                              </div>
                            </td>

                            {/* 9. سعر الشريط المحسوب */}
                            <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: '900', color: '#059669', fontSize: '12px' }}>
                              {(parseFloat(item.unit_price) || (item.pack_size > 0 ? (item.public_price / item.pack_size) : item.public_price) || 0).toFixed(2)} ج.م
                            </td>

                            {/* 10. المورد */}
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                value={item.supplier_name || ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'supplier_name', e.target.value)}
                                placeholder="اسم المورد / الشركة"
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  fontSize: '11.5px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 11. خصم % */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.5"
                                value={item.discount_percent ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'discount_percent', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '65px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  fontWeight: '800',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 12. خصم إضافي % */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.5"
                                value={item.extra_discount_percent ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'extra_discount_percent', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '65px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  fontWeight: '800',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 13. تطبيق ض.ق.م */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!item.apply_vat}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'apply_vat', e.target.checked)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 14. القسم */}
                            <td style={{ padding: '8px 10px' }}>
                              <select
                                value={item.department || 'أدوية'}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'department', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '5px 7px',
                                  fontSize: '11.5px',
                                  fontWeight: '700',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none',
                                  background: '#ffffff'
                                }}
                              >
                                <option value="أدوية">أدوية</option>
                                <option value="مستحضرات تجميل">مستحضرات تجميل</option>
                                <option value="عناية شخصية">عناية شخصية</option>
                                <option value="عناية بالبشرة">عناية بالبشرة</option>
                                <option value="عناية بالشعر">عناية بالشعر</option>
                                <option value="أجهزة طبية">أجهزة طبية</option>
                                <option value="مستلزمات">مستلزمات</option>
                                <option value="حليب وأغذية أطفال">حليب وأغذية أطفال</option>
                                <option value="أخرى">أخرى</option>
                              </select>
                            </td>

                            {/* 15. فئة التصنيف */}
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="text"
                                value={item.category || ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'category', e.target.value)}
                                placeholder="فئة التصنيف"
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  fontSize: '11.5px',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 16. بحساب سعر التكلفة */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={item.is_cost_calculated !== false}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'is_cost_calculated', e.target.checked)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 17. آخر سعر تكلفة */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.25"
                                value={item.last_cost_price ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'last_cost_price', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '85px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  color: '#b45309',
                                  fontWeight: '800',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 18. أقصى خصم مبيعات % */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.5"
                                value={item.max_sale_discount ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'max_sale_discount', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '65px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 19. الرصيد الحالي */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                value={item.current_stock ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'current_stock', parseInt(e.target.value, 10) || 0)}
                                style={{
                                  width: '70px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  fontWeight: '800',
                                  textAlign: 'center',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 20. متوسط سعر التكلفة */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.25"
                                value={item.avg_cost_price ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'avg_cost_price', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '80px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '6px',
                                  outline: 'none'
                                }}
                              />
                            </td>

                            {/* 21. % الربح */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.1"
                                value={item.profit_margin_percent ?? ''}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'profit_margin_percent', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '65px',
                                  padding: '5px 4px',
                                  fontSize: '12px',
                                  textAlign: 'center',
                                  fontWeight: '900',
                                  color: '#16a34a',
                                  border: '1px solid #86efac',
                                  borderRadius: '6px',
                                  outline: 'none',
                                  background: '#f0fdf4'
                                }}
                              />
                            </td>

                            {/* 22. تطبيق تاريخ صلاحية */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={item.apply_expiry_date !== false}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'apply_expiry_date', e.target.checked)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 23. طباعة لواصق */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={item.print_stickers !== false}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'print_stickers', e.target.checked)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 24. صنف مستورد */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!item.is_imported}
                                onChange={(e) => handleUpdatePreviewItem(origIdx, 'is_imported', e.target.checked)}
                                style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#0d9488' }}
                              />
                            </td>

                            {/* 25. أدوية جدول وثلاجة */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', color: item.is_table_drug ? '#dc2626' : '#64748b' }} title="دواء جدول مخدرات">
                                  <input
                                    type="checkbox"
                                    checked={!!item.is_table_drug}
                                    onChange={(e) => handleUpdatePreviewItem(origIdx, 'is_table_drug', e.target.checked)}
                                  />
                                  <span>جدول</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', cursor: 'pointer', color: item.is_refrigerated ? '#2563eb' : '#64748b' }} title="دواء ثلاجة وتبريد">
                                  <input
                                    type="checkbox"
                                    checked={!!item.is_refrigerated}
                                    onChange={(e) => handleUpdatePreviewItem(origIdx, 'is_refrigerated', e.target.checked)}
                                  />
                                  <span>ثلاجة</span>
                                </label>
                              </div>
                            </td>

                            {/* 26. الباركود الدولي */}
                            <td style={{ padding: '8px 10px' }}>
                              <div style={{ position: 'relative' }}>
                                <Barcode size={13} style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                  type="text"
                                  value={item.gtin_barcode || ''}
                                  onChange={(e) => handleUpdatePreviewItem(origIdx, 'gtin_barcode', e.target.value)}
                                  placeholder="باركود دولي 622..."
                                  style={{
                                    width: '100%',
                                    padding: '5px 26px 5px 6px',
                                    fontSize: '11.5px',
                                    fontFamily: 'monospace',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    outline: 'none'
                                  }}
                                />
                              </div>
                            </td>

                            {/* 27. إجراء: حذف */}
                            <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewRow(origIdx)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  padding: '5px',
                                  borderRadius: '6px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                title="حذف من المعاينة"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── 5. ذيل النافذة: الاعتماد النهائي والإحصائيات ── */}
              <div style={{
                padding: '14px 24px',
                borderTop: '1.5px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#475569', fontWeight: '800' }}>
                  <span>🚀 المحدد للاعتماد والمزامنة:</span>
                  <span style={{ color: '#0d9488', fontSize: '14px', fontWeight: '900' }}>
                    {selectedPreviewIndices.size} صنف
                  </span>
                  <span>من أصل {totalItemsCount} صنف مكتشف.</span>
                  {warningItemsCount > 0 && selectedPreviewIndices.size > 0 && (
                    <span style={{ color: '#b45309', fontSize: '12px', fontWeight: '800', background: '#fef3c7', padding: '3px 8px', borderRadius: '6px' }}>
                      ⚠️ يرجى التأكد من تسعير الأصناف ذات السعر 0 قبل الاعتماد
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setIsExcelPreviewModalOpen(false)}
                    className="outstock-btn outstock-btn-secondary"
                    style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '800', borderRadius: '9px' }}
                  >
                    إغلاق ومتابعة لاحقاً
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmBulkSave}
                    disabled={isBulkProcessing || selectedPreviewIndices.size === 0}
                    className="outstock-btn outstock-btn-primary"
                    style={{
                      padding: '11px 26px',
                      fontSize: '14px',
                      fontWeight: '900',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderRadius: '10px',
                      background: selectedPreviewIndices.size === 0 ? '#94a3b8' : 'linear-gradient(135deg, #0d9488, #059669)',
                      boxShadow: selectedPreviewIndices.size === 0 ? 'none' : '0 4px 15px rgba(13, 148, 136, 0.4)',
                      cursor: (isBulkProcessing || selectedPreviewIndices.size === 0) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <CheckCircle2 size={19} />
                    <span>
                      {isBulkProcessing
                        ? 'جاري حفظ وتعميم الأصناف بالكتالوج...'
                        : `اعتماد واستيراد (${selectedPreviewIndices.size}) صنف الآن بالكتالوج المركزي 🚀`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
