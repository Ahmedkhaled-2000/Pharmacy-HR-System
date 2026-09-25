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
  Tag
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
  const [searchTerm, setSearchTerm] = useState('alphintern');
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

  // ── 8. حالة الرفع الجماعي للأسعار (Bulk Re-Pricer) ──
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkSource, setBulkSource] = useState('منشور التسعيرة الجبرية - هيئة الدواء المصرية');
  const [bulkDecree, setBulkDecree] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

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
    handleSearch('alphintern');
  }, []);

  // دالة البحث في الأدوية
  const handleSearch = async (term) => {
    const q = String(term !== undefined ? term : searchTerm).trim();
    if (!q || q.length < 2) return;
    setIsSearching(true);
    try {
      const res = await outstockSearchMedications(q, 30);
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

  // معالجة التحديث الجماعي من النص أو CSV
  const handleProcessBulk = async () => {
    if (!bulkCsvText.trim()) {
      showToast('يرجى لصق بيانات الأسعار أو الباركود');
      return;
    }

    const lines = bulkCsvText.trim().split('\n');
    const items = [];

    for (const line of lines) {
      const parts = line.split(/[,\t;|]+/).map(p => p.trim());
      if (parts.length >= 2) {
        // إذا كان العمود الأول باركود أو اسم
        const col1 = parts[0];
        const col2 = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
        const col3 = parts[2] ? parseInt(parts[2], 10) : 1;

        if (!isNaN(col2)) {
          if (/^\d{10,14}$/.test(col1)) {
            items.push({ barcode: col1, newPublicPrice: col2, pack_size: col3 });
          } else {
            items.push({ tradeName: col1, newPublicPrice: col2, pack_size: col3 });
          }
        }
      }
    }

    if (items.length === 0) {
      showToast('لم يتم العثور على أسطر صالحة. التنسيق المطلوب: الباركود أو اسم الدواء، ثم السعر الجديد');
      return;
    }

    setIsBulkProcessing(true);
    try {
      const res = await outstockBulkUpdatePrices({
        items,
        source: bulkSource,
        decreeNumber: bulkDecree
      });

      if (res?.success) {
        setBulkResult(res);
        showToast(`🎉 تم تحديث ${res.updatedCount} صنف بنجاح! تم رصد ${res.priceIncreasesCount} زيادة في الأسعار.`);
        fetchStats();
      } else {
        showToast(`❌ خطأ في المعالجة: ${res?.error}`);
      }
    } catch (e) {
      showToast(`❌ فشل التحديث الجماعي: ${e.message}`);
    } finally {
      setIsBulkProcessing(false);
    }
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

      {/* ── 3. تبويب مستورد الأسعار الجماعي من Excel / CSV ── */}
      {activeSubTab === 'bulk_upload' && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1.5px solid #e2e8f0',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a', margin: '0 0 6px 0' }}>
              مستورد قوائم التسعيرة الجبرية الجماعي (Bulk Excel & CSV Re-Pricer)
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              يتيح لمدير المشتريات والمالك تحديث آلاف الأدوية دفعة واحدة عن طريق نسخ ولصق أعمدة الإكسل (الباركود والسعر الجديد) أو من منشورات هيئة الدواء.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div className="outstock-form-group">
              <label>مصدر التعديل أو المنشور</label>
              <input
                type="text"
                value={bulkSource}
                onChange={(e) => setBulkSource(e.target.value)}
                placeholder="مثلاً: منشور لجنة التسعير الجبري رقم 12"
                className="outstock-form-input"
              />
            </div>
            <div className="outstock-form-group">
              <label>رقم القرار الوزاري / المنشور (اختياري)</label>
              <input
                type="text"
                value={bulkDecree}
                onChange={(e) => setBulkDecree(e.target.value)}
                placeholder="EDA-PRICE-2026-09"
                className="outstock-form-input"
              />
            </div>
          </div>

          <div className="outstock-form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>انسخ والصق أعمدة الإكسل هنا (الباركود أو اسم الدواء ثم السعر الجديد)</span>
              <span style={{ color: '#0d9488', fontSize: '12px' }}>مثال: 6221025030733, 87.00, 3</span>
            </label>
            <textarea
              rows={8}
              value={bulkCsvText}
              onChange={(e) => setBulkCsvText(e.target.value)}
              placeholder={`6221025030733, 87.00, 3\n6221025032362, 99.00, 3\n6221025022431, 52.00, 2`}
              className="outstock-form-input"
              style={{ fontFamily: 'monospace', fontSize: '13px', direction: 'ltr', textAlign: 'left' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              onClick={handleProcessBulk}
              disabled={isBulkProcessing}
              className="outstock-btn outstock-btn-primary"
              style={{ padding: '10px 24px', fontSize: '14px' }}
            >
              <Upload size={17} />
              <span>{isBulkProcessing ? 'جاري المعالجة السريعة وتحديث الأسعار...' : 'بدء تحديث وتعميم الأسعار فوراً'}</span>
            </button>

            {bulkResult && (
              <div style={{
                padding: '8px 16px',
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '8px',
                color: '#065f46',
                fontSize: '13px',
                fontWeight: '800'
              }}>
                تم بنجاح تحديث {bulkResult.updatedCount} صنف دوائي!
              </div>
            )}
          </div>
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
      {masterCardMedId && (
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
            if (e.target === e.currentTarget) setMasterCardMedId(null);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
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
                <FileText size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>كارتة الصنف الشاملة والبدائل الدوائية</h3>
                  <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
                    هيئة الدواء المصرية ودليل دراج آي الشامل
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMasterCardMedId(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '5px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {isLoadingMasterCard || !masterCardData ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  <RefreshCw size={28} className="outstock-spin" style={{ margin: '0 auto 8px' }} />
                  <p>جاري استرجاع بيانات كارتة الصنف والبدائل...</p>
                </div>
              ) : (
                <>
                  <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                          {masterCardData.medication.trade_name_ar}
                        </h2>
                        <div style={{ fontSize: '14px', color: '#0d9488', fontWeight: '700', direction: 'ltr', textAlign: 'right' }}>
                          {masterCardData.medication.trade_name_en}
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>السعر الرسمي</span>
                        <strong style={{ fontSize: '20px', color: '#065f46' }}>
                          {masterCardData.medication.public_price.toFixed(2)} ج.م
                        </strong>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '14px', fontSize: '12.5px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>المادة الفعالة:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.generic_name || 'غير محدد'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الشكل والتركيز:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.dosage_form} {masterCardData.medication.strength || ''}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>حجم العبوة:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.pack_size} {masterCardData.medication.unit_name || 'شريط'} (الشريط: {masterCardData.medication.unit_price.toFixed(2)} ج.م)</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الشركة المصنعة:</span>
                        <strong style={{ color: '#0f172a' }}>{masterCardData.medication.manufacturer || 'غير مسجلة'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>الباركود الدولي:</span>
                        <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{masterCardData.medication.gtin_barcode || 'لا يوجد'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>رقم التسجيل (EDA):</span>
                        <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{masterCardData.medication.eda_reg_no || 'غير مسجل'}</strong>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={16} color="#0d9488" />
                      <span>المثائل والبدائل بنفس المادة الفعالة ({masterCardData.substitutes?.length || 0}):</span>
                    </h4>

                    {Array.isArray(masterCardData.substitutes) && masterCardData.substitutes.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right' }}>
                              <th style={{ padding: '8px 12px' }}>اسم البديل</th>
                              <th style={{ padding: '8px 12px' }}>الشكل</th>
                              <th style={{ padding: '8px 12px' }}>الشركة</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left' }}>سعر العبوة</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center' }}>إجراء</th>
                            </tr>
                          </thead>
                          <tbody>
                            {masterCardData.substitutes.map((sub) => {
                              const diff = sub.public_price - masterCardData.medication.public_price;
                              return (
                                <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '8px 12px', fontWeight: '700', color: '#1e293b' }}>
                                    {sub.trade_name_ar}
                                    <span style={{ fontSize: '11.5px', color: '#64748b', display: 'block', direction: 'ltr', textAlign: 'right' }}>
                                      {sub.trade_name_en}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: '#475569' }}>{sub.dosage_form}</td>
                                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{sub.manufacturer || '-'}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>
                                    <span style={{ color: diff < 0 ? '#15803d' : diff > 0 ? '#b91c1c' : '#0d9488' }}>
                                      {sub.public_price.toFixed(2)} ج.م
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenMasterCard(sub.id)}
                                      style={{
                                        background: '#f1f5f9',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        fontSize: '11.5px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        color: '#334155'
                                      }}
                                    >
                                      عرض
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        لا توجد بدائل مسجلة بنفس المادة الفعالة حالياً.
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <History size={16} color="#059669" />
                      <span>سجل تحريك وتغيرات الأسعار:</span>
                    </h4>

                    {Array.isArray(masterCardData.priceHistory) && masterCardData.priceHistory.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', color: '#475569', textAlign: 'right' }}>
                              <th style={{ padding: '8px 10px' }}>التاريخ</th>
                              <th style={{ padding: '8px 10px' }}>السابق</th>
                              <th style={{ padding: '8px 10px' }}>الجديد</th>
                              <th style={{ padding: '8px 10px' }}>المصدر والقرار</th>
                              <th style={{ padding: '8px 10px' }}>المعدل</th>
                            </tr>
                          </thead>
                          <tbody>
                            {masterCardData.priceHistory.map((h, i) => (
                              <tr key={h.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px 10px', color: '#475569' }}>
                                  {new Date(h.created_at).toLocaleDateString('ar-EG')}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b', textDecoration: 'line-through' }}>
                                  {h.old_public_price?.toFixed(2)} ج.م
                                </td>
                                <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#059669' }}>
                                  {h.new_public_price?.toFixed(2)} ج.م
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155' }}>
                                  {h.revision_source || h.decree_number || 'تعديل رسمي'}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b' }}>{h.changed_by || 'الإدارة'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', color: '#64748b', fontSize: '12.5px' }}>
                        لا توجد تعديلات سعرية سابقة مسجلة.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', textAlign: 'left' }}>
              <button
                type="button"
                onClick={() => setMasterCardMedId(null)}
                style={{ padding: '8px 18px', borderRadius: '8px', background: '#e2e8f0', color: '#334155', border: 'none', fontWeight: '700', cursor: 'pointer' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

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
      {isAddModalOpen && (
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
            if (e.target === e.currentTarget && !isSavingNewMed) setIsAddModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              direction: 'rtl'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Plus size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800' }}>إضافة دواء جديد للكتالوج المركزي</h3>
                  <p style={{ margin: 0, fontSize: '12px', opacity: 0.9 }}>
                    يتم الحفظ في قاعدة البيانات ويظهر فوراً لكافة الفروع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSavingNewMed}
                style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', borderRadius: '6px', color: '#ffffff', cursor: 'pointer', padding: '5px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveNewMedication} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                    اسم الصنف بالعربي * :
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ألفانترن أقراص"
                    value={newMedForm.trade_name_ar}
                    onChange={(e) => setNewMedForm({ ...newMedForm, trade_name_ar: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                    الاسم بالإنجليزي (Trade Name):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alphintern 30 Tabs"
                    value={newMedForm.trade_name_en}
                    onChange={(e) => setNewMedForm({ ...newMedForm, trade_name_en: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', direction: 'ltr' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                  المادة الفعالة (Generic Name):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chymotrypsin + Trypsin"
                  value={newMedForm.generic_name}
                  onChange={(e) => setNewMedForm({ ...newMedForm, generic_name: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', direction: 'ltr' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    الشكل الدوائي:
                  </label>
                  <select
                    value={newMedForm.dosage_form}
                    onChange={(e) => setNewMedForm({ ...newMedForm, dosage_form: e.target.value })}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="أقراص (Tablets)">أقراص (Tablets)</option>
                    <option value="كبسولات (Capsules)">كبسولات (Capsules)</option>
                    <option value="شراب (Syrup)">شراب (Syrup)</option>
                    <option value="حقن (Injection)">حقن (Injection)</option>
                    <option value="مرهم / كريم (Ointment/Cream)">مرهم / كريم</option>
                    <option value="نقط (Drops)">نقط (Drops)</option>
                    <option value="فوار / أكياس (Sachets)">فوار / أكياس</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    عدد الشرائط/الوحدات:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newMedForm.pack_size}
                    onChange={(e) => setNewMedForm({ ...newMedForm, pack_size: parseInt(e.target.value || 1, 10) })}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>
                    اسم الوحدة:
                  </label>
                  <input
                    type="text"
                    value={newMedForm.unit_name}
                    onChange={(e) => setNewMedForm({ ...newMedForm, unit_name: e.target.value })}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#047857', display: 'block', marginBottom: '4px' }}>
                    السعر الرسمي للعبوة (ج.م) * :
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    placeholder="مثال: 87.00"
                    value={newMedForm.public_price}
                    onChange={(e) => setNewMedForm({ ...newMedForm, public_price: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '2px solid #059669', fontSize: '14px', fontWeight: 'bold', boxSizing: 'border-box' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                    الباركود الدولي (Barcode):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 6221025030733"
                    value={newMedForm.gtin_barcode}
                    onChange={(e) => setNewMedForm({ ...newMedForm, gtin_barcode: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    الشركة المصنعة (Manufacturer):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: Amoun / Eva / Novartis"
                    value={newMedForm.manufacturer}
                    onChange={(e) => setNewMedForm({ ...newMedForm, manufacturer: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                    التصنيف الدوائي (Category):
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: مضاد للتورم والالتهاب"
                    value={newMedForm.category}
                    onChange={(e) => setNewMedForm({ ...newMedForm, category: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#991b1b' }}>
                  <input
                    type="checkbox"
                    checked={newMedForm.is_table_drug}
                    onChange={(e) => setNewMedForm({ ...newMedForm, is_table_drug: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#dc2626' }}
                  />
                  <span>صنف جدول رقابة دوائية</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#0369a1' }}>
                  <input
                    type="checkbox"
                    checked={newMedForm.is_refrigerated}
                    onChange={(e) => setNewMedForm({ ...newMedForm, is_refrigerated: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: '#0284c7' }}
                  />
                  <span>يحفظ بالثلاجة ❄️</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={isSavingNewMed}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '800',
                    cursor: isSavingNewMed ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {isSavingNewMed ? 'جاري الحفظ في الكتالوج...' : 'حفظ وإضافة الصنف للكتالوج المركزي'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSavingNewMed}
                  style={{ padding: '12px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
