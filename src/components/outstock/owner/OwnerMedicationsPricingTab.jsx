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
  Cpu
} from 'lucide-react';
import {
  outstockSearchMedications,
  outstockGetMedicationStats,
  outstockUpdateMedicationPrice,
  outstockBulkUpdatePrices,
  outstockSyncCloudCatalog,
  outstockGetPriceAuditLogs,
  outstockGetMedicationMasterCard,
  outstockAddNewMedication
} from '../../../utils/outstockApiClient';
import { generateBarcodeSvgString } from '../../../utils/invoicePdfGenerator';
import {
  exportMedicationCatalogTemplateExcel,
  parseMedicationExcelFile
} from '../../../utils/outstockExcelExporter';
import { extractMedicationsWithAi } from '../../../utils/outstockMedicationAiExtractor';
import MedicationMasterCardModal from '../common/MedicationMasterCardModal';
import AddMedicationModal from '../common/AddMedicationModal';

export default function OwnerMedicationsPricingTab({ showToast = alert }) {
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

  // ── 6. إضافة صنف جديد بالكتالوج ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
  const handleSearch = async (term) => {
    const q = String(term !== undefined ? term : searchTerm).trim();
    setIsSearching(true);
    try {
      const res = await outstockSearchMedications(q, 40);
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
        showToast(`✅ اكتملت المزامنة بنجاح! تم فحص ${res.totalChecked} صنف وتحديث ${res.priceChanges} تغير في الأسعار.`);
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
          background: 'linear-gradient(135deg, #0d9488, #0f766e)',
          borderRadius: '16px',
          padding: '18px 20px',
          color: '#ffffff',
          boxShadow: '0 10px 24px rgba(13, 148, 136, 0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '13px', opacity: 0.9, fontWeight: '700' }}>إجمالي الأدوية المسجلة</div>
            <div style={{ fontSize: '28px', fontWeight: '900', marginTop: '4px' }}>
              {(stats.total_medications || 26633).toLocaleString('ar-EG')} صنف
            </div>
            <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
              قاعدة بيانات هيئة الدواء المصرية ودراج آي
            </div>
          </div>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Pill size={26} color="#ffffff" />
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
              onClick={() => setIsAddModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 18px',
                minHeight: '46px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
              }}
            >
              <Plus size={16} />
              <span>إضافة صنف جديد</span>
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
                          <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13.5px' }}>
                            {med.trade_name_ar}
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
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          <div style={{ fontWeight: '600', maxWidth: '240px', wordBreak: 'break-word' }}>
                            {med.generic_name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                            {med.manufacturer || 'شركة معتمدة'}
                          </div>
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
                              onClick={() => handleOpenMasterCard(med.id)}
                              className="outstock-btn outstock-btn-secondary"
                              style={{
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe'
                              }}
                              title="عرض كارتة الصنف والبدائل وسجل الأسعار"
                            >
                              <FileText size={13} />
                              <span>كارتة الصنف</span>
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setBarcodeMedToPrint(null);
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
                background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
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
                    background: '#1e293b',
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

      {/* ── 7. نافذة إضافة صنف دوائي جديد (Owner Add Medication Modal) ── */}
      <AddMedicationModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSaveSuccess={(createdMed) => {
          showToast?.(`✅ تم إضافة صنف "${createdMed.trade_name_ar}" للكتالوج المركزي بنجاح`);
          handleSearch(searchTerm || '');
        }}
      />
    </div>
  );
}
