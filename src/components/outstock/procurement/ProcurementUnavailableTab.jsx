import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Send,
  Users,
  Building2,
  Search,
  CheckCircle,
  Phone,
  X,
  PlusCircle,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  Barcode,
  Sparkles,
  Check,
  Package,
  Layers,
  HelpCircle,
  Info
} from 'lucide-react';
import {
  outstockGetUnavailableItems,
  outstockNotifyRestocked,
  outstockAddManualUnavailableItem,
  outstockImportUnavailableItems,
  outstockGetBranches
} from '../../../utils/outstockApiClient';
import {
  exportUnavailableItemsExcel,
  parseUnavailableItemsExcel,
  downloadUnavailableItemsTemplateExcel
} from '../../../utils/outstockExcelExporter';
import MedicationAutocompleteInput from '../pharmacy/MedicationAutocompleteInput';
import OutstockConfirmModal from '../common/OutstockConfirmModal';

/**
 * ProcurementUnavailableTab.jsx
 * شاشة الأصناف غير المتوفرة بالسوق (إدارة المشتريات)
 * - تجميع الأصناف النواقص مصنفة بالفرع أو عجز عام
 * - تصدير شيت إكسل احترافي بالأصناف النواقص
 * - استرداد شيت إكسل للنواقص مع معاينة ذكية
 * - تسجيل أصناف ناقصة يدوياً بنافذة احترافية تدعم البحث الذكي والباركود
 * - عند توفر الصنف لاحقاً بالسوق: زر "أصبح متوفراً الآن" لإشعار الفرع
 */
export default function ProcurementUnavailableTab({ showToast }) {
  const [unavailableItems, setUnavailableItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [isNotifyingKey, setIsNotifyingKey] = useState(null);

  // نافذة معاينة العملاء المسترجعين بعد إشعار التوفر
  const [restockedResult, setRestockedResult] = useState(null);

  // نافذة تأكيد التوفر
  const [confirmItem, setConfirmItem] = useState(null);

  // ── نافذة إضافة صنف ناقص يدوياً ──
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    medication_name: '',
    barcode: '',
    unit_type: 'pack',
    requested_quantity: 1,
    branch_id: 'all',
    notes: '',
    selectedMed: null
  });

  // ── نافذة استيراد من إكسل ──
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importedItemsPreview, setImportedItemsPreview] = useState([]);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [importFallbackBranch, setImportFallbackBranch] = useState('all');
  const fileInputRef = useRef(null);

  // جلب البيانات
  const fetchUnavailable = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetUnavailableItems();
      if (res?.success && Array.isArray(res.unavailableItems)) {
        setUnavailableItems(res.unavailableItems);
      }
    } catch (e) {
      console.warn('Fetch unavailable items error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await outstockGetBranches();
      if (res?.success && Array.isArray(res.branches)) {
        setBranches(res.branches);
      }
    } catch (e) {
      console.warn('Fetch branches error:', e);
    }
  };

  useEffect(() => {
    fetchUnavailable();
    fetchBranches();
  }, []);

  // ── فلترة الأصناف ──
  const filteredItems = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    return unavailableItems.filter(item => {
      // فلترة بالفرع
      if (branchFilter !== 'all') {
        const itemBranch = String(item.branch_id || '');
        if (itemBranch !== branchFilter && itemBranch !== 'all') return false;
      }

      if (!q) return true;

      const med = String(item.medication_name || '').toLowerCase();
      const branch = String(item.branch_name || '').toLowerCase();
      const barcode = String(item.barcode || '').toLowerCase();
      const notes = String(item.notes || '').toLowerCase();

      return med.includes(q) || branch.includes(q) || barcode.includes(q) || notes.includes(q);
    });
  }, [unavailableItems, searchQuery, branchFilter]);

  // ── تصدير إكسل ──
  const handleExportExcel = () => {
    try {
      if (filteredItems.length === 0) {
        showToast?.('⚠️ لا توجد أصناف لتصديرها في القائمة الحالية');
        return;
      }
      exportUnavailableItemsExcel(filteredItems, {
        title: 'تقرير الأصناف غير المتوفرة بالسوق (نواقص معلقة)'
      });
      showToast?.(`✅ تم تصدير ${filteredItems.length} صنف إلى شيت الإكسل بنجاح`);
    } catch (e) {
      console.error('Export Excel error:', e);
      showToast?.('حدث خطأ أثناء تصدير شيت الإكسل');
    }
  };

  // ── تنزيل نموذج إكسل فارغ ──
  const handleDownloadTemplate = () => {
    try {
      downloadUnavailableItemsTemplateExcel();
      showToast?.('✅ تم تنزيل نموذج شيت الإكسل بنجاح');
    } catch (e) {
      console.error('Download template error:', e);
      showToast?.('تعذر تنزيل النموذج');
    }
  };

  // ── فتح نافذة الإضافة اليدوية ──
  const openAddModal = () => {
    setManualForm({
      medication_name: '',
      barcode: '',
      unit_type: 'pack',
      requested_quantity: 1,
      branch_id: 'all',
      notes: '',
      selectedMed: null
    });
    setIsAddModalOpen(true);
  };

  // ── حفظ الصنف الناقص يدوياً ──
  const handleSaveManualItem = async (e) => {
    e?.preventDefault?.();
    const name = String(manualForm.medication_name || '').trim();
    if (!name) {
      showToast?.('⚠️ يرجى إدخال أو اختيار اسم الدواء الناقص');
      return;
    }

    const qty = parseInt(manualForm.requested_quantity, 10);
    if (isNaN(qty) || qty < 1) {
      showToast?.('⚠️ الكمية المطلوبة يجب أن تكون 1 على الأقل');
      return;
    }

    setIsSavingManual(true);
    try {
      const res = await outstockAddManualUnavailableItem({
        medication_name: name,
        barcode: manualForm.barcode?.trim?.() || null,
        unit_type: manualForm.unit_type || 'pack',
        requested_quantity: qty,
        branch_id: manualForm.branch_id || 'all',
        notes: manualForm.notes?.trim?.() || null
      });

      if (res?.success) {
        showToast?.(`✅ تم تسجيل الصنف الناقص (${name}) بنجاح`);
        setIsAddModalOpen(false);
        fetchUnavailable();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر تسجيل الصنف'}`);
      }
    } catch (err) {
      console.error('Save manual item error:', err);
      showToast?.('حدث خطأ أثناء حفظ الصنف الناقص');
    } finally {
      setIsSavingManual(false);
    }
  };

  // ── معالجة ملف استيراد الإكسل ──
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setIsParsingImport(true);
    try {
      const parsed = await parseUnavailableItemsExcel(file);
      if (parsed.length === 0) {
        showToast?.('⚠️ لم يتم العثور على أي أصناف صالحة في ملف الإكسل');
        setImportedItemsPreview([]);
      } else {
        setImportedItemsPreview(parsed);
        showToast?.(`✅ تم قراءة ${parsed.length} صنف بنجاح من الشيت، يمكنك معاينتها أدناه`);
      }
    } catch (err) {
      console.error('Parse Excel error:', err);
      showToast?.(`⚠️ خطأ في قراءة ملف الإكسل: ${err.message || 'الملف غير صالح'}`);
      setImportedItemsPreview([]);
    } finally {
      setIsParsingImport(false);
    }
  };

  // ── تنفيذ الاستيراد الفعلي ──
  const handleConfirmImport = async () => {
    if (!importedItemsPreview || importedItemsPreview.length === 0) {
      showToast?.('⚠️ لا توجد أصناف مستخرجة للاستيراد');
      return;
    }

    setIsSubmittingImport(true);
    try {
      const res = await outstockImportUnavailableItems({
        items: importedItemsPreview,
        fallbackBranchId: importFallbackBranch
      });

      if (res?.success) {
        showToast?.(`🎉 تم استيراد وحفظ ${res.insertedCount || importedItemsPreview.length} صنف ناقص بنجاح!`);
        setIsImportModalOpen(false);
        setImportFile(null);
        setImportedItemsPreview([]);
        fetchUnavailable();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر استكمال الاستيراد'}`);
      }
    } catch (err) {
      console.error('Import API error:', err);
      showToast?.('حدث خطأ أثناء إرسال الأصناف إلى الخادم');
    } finally {
      setIsSubmittingImport(false);
    }
  };

  // ── إشعار توفر الصنف ──
  const handleNotifyRestocked = (item) => {
    setConfirmItem(item);
  };

  const executeNotifyRestocked = async () => {
    if (!confirmItem) return;
    const item = confirmItem;
    const key = `${item.branch_id}_${item.medication_name}`;
    setIsNotifyingKey(key);
    try {
      const res = await outstockNotifyRestocked({
        branchId: item.branch_id,
        medicationName: item.medication_name,
        unitType: item.unit_type
      });

      if (res?.success) {
        showToast?.('✅ تم إشعار الفرع بنجاح واسترجاع بيانات العملاء للتواصل معهم');
        setRestockedResult({
          medicationName: item.medication_name,
          branchName: item.branch_name,
          waitingCustomers: res.waitingCustomers || item.waiting_customers || []
        });
        fetchUnavailable();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر إرسال الإشعار'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء إشعار الفرع');
    } finally {
      setIsNotifyingKey(null);
      setConfirmItem(null);
    }
  };

  return (
    <div>
      {/* ── شريط العمليات والفلترة العلوي ── */}
      <div className="outstock-card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          {/* الجانب الأيمن: شريط البحث وتحديد الفرع */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px' }}>
            <div className="outstock-search-bar" style={{ flex: 1 }}>
              <Search size={18} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="🔍 ابحث بالدواء، الباركود، الفرع، أو الملاحظات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '4px'
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* فلتر الفروع */}
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="outstock-form-select"
              style={{
                width: 'auto',
                minWidth: '150px',
                padding: '8px 12px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '700',
                borderColor: '#cbd5e1',
                backgroundColor: '#ffffff'
              }}
            >
              <option value="all">🏢 جميع الفروع والعجز العام</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name || b.branch_name}
                </option>
              ))}
            </select>
          </div>

          {/* الجانب الأيسر: أزرار العمليات (إضافة يدوية - إكسل - تحديث) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* زر إضافة صنف ناقص جديد يدوياً */}
            <button
              type="button"
              className="outstock-btn outstock-btn-primary"
              onClick={openAddModal}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: '800',
                padding: '9px 16px',
                borderRadius: '10px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)'
              }}
            >
              <PlusCircle size={16} />
              <span>إضافة صنف ناقص جديد</span>
            </button>

            {/* زر استيراد من إكسل */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={() => {
                setImportFile(null);
                setImportedItemsPreview([]);
                setIsImportModalOpen(true);
              }}
              style={{
                background: '#f8fafc',
                border: '1.5px solid #0284c7',
                color: '#0284c7',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '10px'
              }}
              title="استيراد أصناف النواقص من شيت إكسل"
            >
              <Upload size={15} />
              <span>استرداد من إكسل</span>
            </button>

            {/* زر تصدير إكسل */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportExcel}
              style={{
                background: '#f0fdf4',
                border: '1.5px solid #16a34a',
                color: '#15803d',
                fontWeight: '800',
                padding: '8px 14px',
                borderRadius: '10px'
              }}
              title="تصدير القائمة الحالية إلى شيت إكسل بتنسيق احترافي"
            >
              <FileSpreadsheet size={15} />
              <span>تصدير إكسل</span>
            </button>

            {/* تنزيل النموذج */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleDownloadTemplate}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '8px 11px',
                borderRadius: '10px'
              }}
              title="تحميل نموذج إكسل فارغ جاهز للتعبئة"
            >
              <FileText size={15} />
              <span style={{ fontSize: '12px' }}>النموذج</span>
            </button>

            {/* زر التحديث */}
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchUnavailable}
              title="تحديث البيانات"
              style={{ padding: '8px 12px', borderRadius: '10px' }}
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* ── بطاقة جدول الأصناف غير المتوفرة بالسوق ── */}
      <div className="outstock-card">
        <div className="outstock-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="outstock-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <span>❌ أرشيف أصناف الأدوية غير المتوفرة بالسوق (نواقص معلقة)</span>
            <span style={{
              fontSize: '12.5px',
              color: '#dc2626',
              fontWeight: '800',
              background: '#fef2f2',
              padding: '3px 10px',
              borderRadius: '20px',
              border: '1px solid #fecaca'
            }}>
              {filteredItems.length} صنف عجز سوقي
            </span>
          </h3>

          <div style={{ fontSize: '12.5px', color: '#64748b' }}>
            <span>إجمالي الكمية المطلوبة بالسوق: </span>
            <strong style={{ color: '#0f172a' }}>
              {filteredItems.reduce((acc, curr) => acc + (parseInt(curr.total_wanted_qty || 0, 10) || 0), 0)}
            </strong>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '8px', color: '#0284c7' }} />
            <div>جاري فحص وتحديث أرشيف النواقص بالسوق...</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>🎉</div>
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد أصناف غير متوفرة بالسوق مطابقة للبحث حالياً
            </h4>
            <p style={{ margin: '0 0 16px', fontSize: '13px' }}>
              كافة الأصناف المطلوبة إما تم توفيرها، أو يمكنك تسجيل صنف ناقص جديد يدوياً أو استيراد شيت إكسل.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={openAddModal}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                <PlusCircle size={15} />
                <span>+ تسجيل صنف ناقص جديد</span>
              </button>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setIsImportModalOpen(true)}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                <Upload size={15} />
                <span>استرداد من إكسل</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>الفرع الطالب</th>
                  <th>صنف الدواء الناقص / الباركود</th>
                  <th style={{ width: '90px' }}>الوحدة</th>
                  <th style={{ width: '130px' }}>عدد المنتظرين</th>
                  <th style={{ width: '100px' }}>إجمالي الكمية</th>
                  <th>الملاحظات / المصدر</th>
                  <th style={{ width: '190px' }}>إجراء التوفر بالسوق</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const key = `${item.branch_id}_${item.medication_name}`;
                  const isNotifying = isNotifyingKey === key;
                  const isGeneralShortage = !item.branch_id || item.branch_id === 'all';

                  return (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#fef2f2' }}>
                      {/* الفرع */}
                      <td>
                        {isGeneralShortage ? (
                          <span style={{
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontWeight: '800',
                            fontSize: '12px',
                            color: '#92400e',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Building2 size={12} /> عجز عام (كل الفروع)
                          </span>
                        ) : (
                          <span style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontWeight: '800',
                            fontSize: '12px',
                            color: '#166534',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Building2 size={12} /> {item.branch_name}
                          </span>
                        )}
                      </td>

                      {/* اسم الدواء والباركود */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <strong style={{ fontSize: '14.5px', color: '#991b1b', lineHeight: '1.4' }}>
                            {item.medication_name}
                          </strong>

                          {item.barcode && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              color: '#475569',
                              background: '#f1f5f9',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              width: 'fit-content'
                            }}>
                              <Barcode size={12} />
                              <span>{item.barcode}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* الوحدة */}
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: item.unit_type === 'strip' ? '#fdf4ff' : '#f0f9ff',
                          color: item.unit_type === 'strip' ? '#86198f' : '#0369a1',
                          fontWeight: '700',
                          fontSize: '12px'
                        }}>
                          {item.unit_type === 'strip' ? 'شريط 💊' : 'علبة 📦'}
                        </span>
                      </td>

                      {/* عدد العملاء المنتظرين */}
                      <td>
                        {item.customers_waiting_count > 0 ? (
                          <span className="outstock-badge unavailable" style={{ fontSize: '12px' }}>
                            <Users size={12} />
                            <span>{item.customers_waiting_count} عميل</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            تسجيل مسبق
                          </span>
                        )}
                      </td>

                      {/* إجمالي الكمية المطلوبة */}
                      <td>
                        <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                          {item.total_wanted_qty || 1}
                        </strong>
                      </td>

                      {/* الملاحظات والمصدر */}
                      <td>
                        <div style={{ fontSize: '12px', color: '#475569', maxWidth: '240px' }}>
                          {item.notes ? (
                            <span style={{ color: '#334155' }}>{item.notes}</span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>لا توجد ملاحظات</span>
                          )}

                          {item.source && (
                            <div style={{ marginTop: '3px' }}>
                              <span style={{
                                fontSize: '10.5px',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: item.source === 'excel_import' ? '#ecfdf5' : item.source === 'manual_procurement' ? '#eff6ff' : '#f1f5f9',
                                color: item.source === 'excel_import' ? '#047857' : item.source === 'manual_procurement' ? '#1d4ed8' : '#64748b',
                                fontWeight: '700'
                              }}>
                                {item.source === 'excel_import' ? '📥 استيراد إكسل' : item.source === 'manual_procurement' ? '✍️ تسجيل يدوي' : '📋 طلب عميل'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* زر أصبح متوفراً الآن */}
                      <td>
                        <button
                          type="button"
                          disabled={isNotifying}
                          className="outstock-btn outstock-btn-primary"
                          style={{
                            padding: '7px 14px',
                            fontSize: '12.5px',
                            width: '100%',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderColor: '#059669'
                          }}
                          onClick={() => handleNotifyRestocked(item)}
                        >
                          <Send size={13} />
                          <span>{isNotifying ? 'جاري الإشعار...' : '🔄 أصبح متوفراً الآن!'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة إضافة صنف ناقص جديد يدوياً (Manual Add Modal) ── */}
      {isAddModalOpen && (
        <div className="outstock-modal-backdrop" onClick={() => !isSavingManual && setIsAddModalOpen(false)}>
          <div
            className="outstock-modal-panel modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '680px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="outstock-modal-header" style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              padding: '16px 20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <PlusCircle size={22} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#ffffff' }}>
                    تسجيل صنف ناقص جديد بالسوق
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#e0f2fe' }}>
                    بحث ذكي بكتالوج الأدوية المصري (3 حروف، باركود، اسم عربي أو إنجليزي)
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSavingManual}
                style={{ color: '#ffffff' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManualItem}>
              <div className="outstock-modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* حقل البحث الذكي واختيار الدواء */}
                <div className="outstock-form-group">
                  <label className="outstock-form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>
                      <strong style={{ color: '#dc2626' }}>*</strong> صنف الدواء الناقص:
                    </span>
                    <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Sparkles size={12} /> بحث ذكي بـ 3 حروف أو الباركود
                    </span>
                  </label>

                  <MedicationAutocompleteInput
                    value={manualForm.medication_name}
                    unitType={manualForm.unit_type}
                    selectedMed={manualForm.selectedMed}
                    placeholder="ابحث باسم الدواء (عربي أو إنجليزي) أو امسح الباركود..."
                    onMedicationSelect={(med) => {
                      if (!med) return;
                      const medAr = med.trade_name_ar || '';
                      const medEn = med.trade_name_en || '';
                      let nameToUse = medAr && medEn ? `${medAr} (${medEn})` : (medAr || medEn || med.displayName || '');
                      setManualForm(prev => ({
                        ...prev,
                        medication_name: nameToUse,
                        barcode: med.gtin_barcode || med.barcode || prev.barcode,
                        selectedMed: med
                      }));
                    }}
                    onTextChange={(val) => {
                      setManualForm(prev => ({
                        ...prev,
                        medication_name: val
                      }));
                    }}
                    required={true}
                  />
                </div>

                {/* صف الباركود والوحدة */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* الباركود الدولي */}
                  <div className="outstock-form-group">
                    <label className="outstock-form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Barcode size={14} color="#64748b" />
                      <span>الباركود الدولي (اختياري / يدعم الماسح):</span>
                    </label>
                    <input
                      type="text"
                      className="outstock-form-input"
                      dir="ltr"
                      placeholder="6221025030733..."
                      value={manualForm.barcode}
                      onChange={(e) => setManualForm({ ...manualForm, barcode: e.target.value })}
                      style={{ fontFamily: 'monospace', fontWeight: '600' }}
                    />
                  </div>

                  {/* نوع الوحدة */}
                  <div className="outstock-form-group">
                    <label className="outstock-form-label">
                      الوحدة المطلوبة:
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setManualForm({ ...manualForm, unit_type: 'pack' })}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: manualForm.unit_type === 'pack' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: manualForm.unit_type === 'pack' ? '#eff6ff' : '#ffffff',
                          color: manualForm.unit_type === 'pack' ? '#0284c7' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Package size={15} />
                        <span>علبة 📦</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setManualForm({ ...manualForm, unit_type: 'strip' })}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: manualForm.unit_type === 'strip' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: manualForm.unit_type === 'strip' ? '#eff6ff' : '#ffffff',
                          color: manualForm.unit_type === 'strip' ? '#0284c7' : '#475569',
                          fontWeight: '800',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Layers size={15} />
                        <span>شريط 💊</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* صف الكمية والفرع */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {/* الكمية المطلوبة */}
                  <div className="outstock-form-group">
                    <label className="outstock-form-label">
                      الكمية المطلوبة بالسوق:
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="outstock-form-input"
                      value={manualForm.requested_quantity}
                      onChange={(e) => setManualForm({ ...manualForm, requested_quantity: e.target.value })}
                      required
                    />
                  </div>

                  {/* الفرع الطالب أو عجز عام */}
                  <div className="outstock-form-group">
                    <label className="outstock-form-label">
                      الفرع الطالب (أو عجز عام بالسوق):
                    </label>
                    <select
                      className="outstock-form-select"
                      value={manualForm.branch_id}
                      onChange={(e) => setManualForm({ ...manualForm, branch_id: e.target.value })}
                    >
                      <option value="all">🏢 جميع الفروع (عجز سوقي عام)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name || b.branch_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ملاحظات النقص وسبب العجز */}
                <div className="outstock-form-group">
                  <label className="outstock-form-label">
                    ملاحظات النقص / سبب عدم التوفر بالسوق:
                  </label>
                  <textarea
                    rows={2}
                    className="outstock-form-input"
                    placeholder="مثال: عجز مصنع حتى نهاية الشهر، يوجد طلب متكرر من العملاء، بديل مقترح..."
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="outstock-modal-footer" style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSavingManual}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-primary"
                  disabled={isSavingManual}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    minWidth: '150px'
                  }}
                >
                  {isSavingManual ? (
                    <>
                      <RefreshCw size={14} className="spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>حفظ وتسجيل الصنف</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── نافذة استيراد النواقص من شيت إكسل (Excel Import Modal) ── */}
      {isImportModalOpen && (
        <div className="outstock-modal-backdrop" onClick={() => !isSubmittingImport && setIsImportModalOpen(false)}>
          <div
            className="outstock-modal-panel modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '800px', borderRadius: '16px', overflow: 'hidden' }}
          >
            <div className="outstock-modal-header" style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              color: '#ffffff',
              padding: '16px 20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Upload size={22} color="#ffffff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#ffffff' }}>
                    استرداد أصناف النواقص من شيت إكسل
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#d1fae5' }}>
                    استيراد مباشر لملفات Excel (.xlsx / .xls) وتعيين الفروع والكميات تلقائياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="outstock-modal-close"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isSubmittingImport}
                style={{ color: '#ffffff' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="outstock-modal-body" style={{ padding: '20px' }}>
              {/* منطقة رفع الملف */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".xlsx, .xls"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed #10b981',
                  borderRadius: '14px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: '#f0fdf4',
                  transition: 'background 0.2s',
                  marginBottom: '16px'
                }}
              >
                <FileSpreadsheet size={40} color="#059669" style={{ marginBottom: '8px' }} />
                <h4 style={{ margin: '0 0 6px', color: '#065f46', fontSize: '15px', fontWeight: '800' }}>
                  {importFile ? importFile.name : 'اضغط هنا لاختيار شيت الإكسل أو اسحب الملف إلى هنا'}
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#047857' }}>
                  يقبل ملفات Excel بصيغة (.xlsx أو .xls) مع التعرف التلقائي على الأعمدة باللغة العربية والإنجليزية
                </p>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#0284c7', background: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  <Info size={14} />
                  <span>الأعمدة المدعومة: اسم الصنف، الباركود، الوحدة، الكمية، الفرع، الملاحظات</span>
                </div>
              </div>

              {/* شريط أدوات النموذج والفرع الاحتياطي */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>
                    الفرع الافتراضي للأصناف غير المحددة بالشيت:
                  </span>
                  <select
                    className="outstock-form-select"
                    value={importFallbackBranch}
                    onChange={(e) => setImportFallbackBranch(e.target.value)}
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '12.5px' }}
                  >
                    <option value="all">🏢 جميع الفروع (عجز سوقي عام)</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name || b.branch_name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="outstock-btn outstock-btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  <Download size={13} />
                  <span>تحميل نموذج إكسل استرشادي</span>
                </button>
              </div>

              {/* معاينة الأصناف المقروءة */}
              {isParsingImport ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                  <RefreshCw size={24} className="spin" style={{ color: '#059669', marginBottom: '8px' }} />
                  <div>جاري فحص وقراءة بيانات الإكسل بدقة...</div>
                </div>
              ) : importedItemsPreview.length > 0 ? (
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#0f172a' }}>
                      📋 معاينة الأصناف المستخرجة من الشيت:
                      <span style={{ color: '#059669', marginRight: '6px' }}>
                        ({importedItemsPreview.length} صنف)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setImportFile(null);
                        setImportedItemsPreview([]);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#dc2626',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontWeight: '700'
                      }}
                    >
                      مسح واختيار ملف آخر
                    </button>
                  </div>

                  <div style={{
                    maxHeight: '260px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}>
                    <table className="outstock-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>اسم الدواء</th>
                          <th>الباركود</th>
                          <th>الوحدة</th>
                          <th>الكمية</th>
                          <th>الفرع</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedItemsPreview.slice(0, 50).map((row, idx) => (
                          <tr key={idx}>
                            <td>{idx + 1}</td>
                            <td><strong style={{ color: '#0f172a' }}>{row.medication_name}</strong></td>
                            <td style={{ fontFamily: 'monospace' }}>{row.barcode || '-'}</td>
                            <td>{row.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                            <td><strong>{row.requested_quantity || 1}</strong></td>
                            <td>{row.branch_name || (importFallbackBranch === 'all' ? 'عجز عام' : 'الفرع المحدد')}</td>
                            <td style={{ color: '#64748b' }}>{row.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importedItemsPreview.length > 50 && (
                    <div style={{ textAlign: 'center', fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
                      يتم عرض أول 50 صنفاً فقط للمعاينة، وسيتم استيراد كافة الـ {importedItemsPreview.length} صنف بالكامل.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="outstock-modal-footer" style={{
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              padding: '14px 20px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isSubmittingImport}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={handleConfirmImport}
                disabled={isSubmittingImport || importedItemsPreview.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  minWidth: '170px'
                }}
              >
                {isSubmittingImport ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>جاري الاستيراد...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>تأكيد واستيراد ({importedItemsPreview.length}) صنف</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة استرجاع بيانات العملاء بعد إشعار التوفر ── */}
      {restockedResult && (
        <div className="outstock-modal-backdrop" onClick={() => setRestockedResult(null)}>
          <div className="outstock-modal-panel modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                🎉 تم إشعار الفرع بتوفر الصنف: <strong>{restockedResult.medicationName}</strong>
              </h3>
              <button className="outstock-modal-close" onClick={() => setRestockedResult(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="outstock-modal-body">
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#065f46',
                fontSize: '13.5px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle size={18} />
                <span>تم إرسال إشعار فوري لفرع ({restockedResult.branchName || 'الصيدلية'}) ليظهر بالفرع أن هذا الصنف أصبح متوفراً!</span>
              </div>

              {restockedResult.waitingCustomers?.length > 0 ? (
                <>
                  <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#1e293b', marginTop: '12px', marginBottom: '8px' }}>
                    بيانات العملاء الذين طلبوا هذا الصنف (ليتمكن الفرع من التواصل معهم فوراً):
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {restockedResult.waitingCustomers.map((cust, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: '800', color: '#0f172a' }}>{cust.customerName || cust.full_name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>الكمية المطلوبة: {cust.requestedQuantity || cust.requested_quantity || 1}</div>
                        </div>

                        <a
                          href={`tel:${cust.customerPhone || cust.whatsapp_phone}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#e0f2fe',
                            color: '#0369a1',
                            fontSize: '13px',
                            fontWeight: '800',
                            textDecoration: 'none'
                          }}
                        >
                          <Phone size={13} />
                          <span dir="ltr">{cust.customerPhone || cust.whatsapp_phone}</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '13px' }}>
                  ℹ️ تم تسجيل التوفر بنجاح، ولم يكن هناك عملاء مسجلين بأرقام هواتف لهذا الصنف.
                </div>
              )}
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-primary" onClick={() => setRestockedResult(null)}>
                تم وحفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── نافذة التأكيد المنبثقة الاحترافية ── */}
      <OutstockConfirmModal
        isOpen={Boolean(confirmItem)}
        title="تأكيد توفر الصنف وإشعار الفرع"
        message={`هل الصنف (${confirmItem?.medication_name}) أصبح متوفراً الآن بالسوق وتريد إشعار فرع (${confirmItem?.branch_name || 'الفروع المعنية'}) وتحديث حالة النواقص؟`}
        iconType="success"
        confirmText="نعم، أصبح متوفراً (إشعار الفرع)"
        cancelText="تراجع"
        confirmBtnStyle="success"
        badge={confirmItem?.branch_name}
        details={confirmItem ? [
          { label: 'اسم الدواء', value: confirmItem.medication_name },
          { label: 'الفرع الطالب', value: confirmItem.branch_name || 'عجز عام بالسوق' },
          { label: 'العملاء بانتظار الصنف', value: `${confirmItem.waiting_customers?.length || 0} عميل` }
        ] : null}
        isProcessing={Boolean(isNotifyingKey)}
        onConfirm={executeNotifyRestocked}
        onClose={() => setConfirmItem(null)}
      />
    </div>
  );
}
