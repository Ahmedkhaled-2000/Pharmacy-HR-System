import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  PackageCheck,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  FileText,
  Barcode,
  UserCheck,
  Clock,
  RefreshCw,
  Eye,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ChevronDown,
  Pill,
  Lock
} from 'lucide-react';
import {
  outstockGetSuppliers,
  outstockSaveOrderReceipt,
  outstockGetSupplierOrderReceiptsSummary,
  outstockGetOrderReceipts,
  outstockGetOrderReceiptDetails,
  outstockDeleteOrderReceipt
} from '../../../utils/outstockApiClient';
import EmployeeCodeAuthModal from '../common/EmployeeCodeAuthModal';
import AddMedicationModal from '../common/AddMedicationModal';
import MedicationAutocompleteInput from '../pharmacy/MedicationAutocompleteInput';

/**
 * ProcurementOrderReceivingTab.jsx
 * صفحة استلام الطلبات وتسجيل الأصناف المستلمة لكل فاتورة توريد
 */
export default function ProcurementOrderReceivingTab({ showToast = alert }) {
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const [suppliers, setSuppliers] = useState([]);
  const [supplierSummaries, setSupplierSummaries] = useState([]);
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);
  const [cardsSearchQuery, setCardsSearchQuery] = useState('');

  // نافذة التحقق من كود الموظف المستلم (مشفر كـ Password)
  const [isEmployeeAuthOpen, setIsEmployeeAuthOpen] = useState(false);
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);

  // نافذة استلام طلبية جديدة
  const [isNewReceiptModalOpen, setIsNewReceiptModalOpen] = useState(false);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    supplier_id: '',
    invoice_number: '',
    receipt_date: new Date().toISOString().slice(0, 10),
    notes: '',
    items: [
      {
        temp_id: 'row_1',
        medication_id: null,
        medication_name: '',
        trade_name_en: '',
        barcode: '',
        unit_name: 'علبة',
        quantity_received: '1',
        public_price: '',
        batch_number: '',
        expiry_date: '',
        notes: ''
      }
    ]
  });

  // كارتة إضافة صنف جديد إذا لم يكن موجوداً بقاعدة بيانات الأدوية
  const [isAddNewMedModalOpen, setIsAddNewMedModalOpen] = useState(false);
  const [activeItemRowIndexForNewMed, setActiveItemRowIndexForNewMed] = useState(null);

  // نافذة سجل الطلبيات المستلمة الشامل
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySupplierFilter, setHistorySupplierFilter] = useState('all');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyReceipts, setHistoryReceipts] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // نافذة عرض تفاصيل طلبية مستلمة
  const [selectedReceiptDetails, setSelectedReceiptDetails] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // 1. تحميل قائمة الموردين وملخص البطاقات
  const loadData = useCallback(async () => {
    try {
      setIsLoadingSummaries(true);
      const [suppRes, sumRes] = await Promise.all([
        outstockGetSuppliers(),
        outstockGetSupplierOrderReceiptsSummary()
      ]);

      if (suppRes?.success) {
        setSuppliers(suppRes.suppliers || []);
      }
      if (sumRes?.success) {
        setSupplierSummaries(sumRes.summaries || []);
      }
    } catch (err) {
      console.error('Error loading order receiving data:', err);
      showToastRef.current?.('تعذر تحميل بيانات استلام الطلبيات');
    } finally {
      setIsLoadingSummaries(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. تصفية بطاقات الموردين في الواجهة
  const filteredSummaries = useMemo(() => {
    const q = cardsSearchQuery.trim().toLowerCase();
    if (!q) return supplierSummaries;
    return supplierSummaries.filter(
      (s) =>
        s.supplier_name?.toLowerCase().includes(q) ||
        s.supplier_code?.toLowerCase().includes(q) ||
        s.supplier_phone?.includes(q)
    );
  }, [supplierSummaries, cardsSearchQuery]);

  // إجمالي الإحصائيات العامة
  const globalStats = useMemo(() => {
    let totalReceipts = 0;
    let totalItems = 0;
    let totalUnits = 0;
    let activeSuppliers = 0;

    supplierSummaries.forEach((s) => {
      const recCount = parseInt(s.total_receipts_count || 0, 10);
      if (recCount > 0) activeSuppliers++;
      totalReceipts += recCount;
      totalItems += parseInt(s.total_items_count || 0, 10);
      totalUnits += parseInt(s.total_quantity_received || 0, 10);
    });

    return { totalReceipts, totalItems, totalUnits, activeSuppliers };
  }, [supplierSummaries]);

  // ══════════════════════════════════════════════════════════════════════════
  // تدفق استلام طلبية جديدة
  // ══════════════════════════════════════════════════════════════════════════

  // 1) الضغط على زر استلام طلبية جديدة يفتح التحقق من كود الموظف أولاً
  const handleStartNewReceipt = () => {
    setVerifiedEmployee(null);
    setIsEmployeeAuthOpen(true);
  };

  // 2) عند نجاح التحقق من كود الموظف
  const handleEmployeeVerified = (emp) => {
    setVerifiedEmployee(emp);
    setIsEmployeeAuthOpen(false);

    // فتح نافذة الاستلام وتعيين المورد الافتراضي
    const defaultSup = suppliers[0] || null;
    setReceiptForm({
      supplier_id: defaultSup?.id || '',
      invoice_number: '',
      receipt_date: new Date().toISOString().slice(0, 10),
      notes: '',
      items: [
        {
          temp_id: `row_${Date.now()}`,
          medication_id: null,
          medication_name: '',
          trade_name_en: '',
          barcode: '',
          unit_name: 'علبة',
          quantity_received: '1',
          public_price: '',
          batch_number: '',
          expiry_date: '',
          notes: ''
        }
      ]
    });
    setIsNewReceiptModalOpen(true);
  };

  // إضافة صف صنف جديد في جدول الطلبية
  const handleAddItemRow = () => {
    setReceiptForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          temp_id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          medication_id: null,
          medication_name: '',
          trade_name_en: '',
          barcode: '',
          unit_name: 'علبة',
          quantity_received: '1',
          public_price: '',
          batch_number: '',
          expiry_date: '',
          notes: ''
        }
      ]
    }));
  };

  // حذف صف صنف
  const handleRemoveItemRow = (idx) => {
    if (receiptForm.items.length <= 1) return;
    setReceiptForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  // تحديث حقل داخل صف صنف
  const handleItemFieldChange = (idx, field, value) => {
    setReceiptForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[idx] = { ...nextItems[idx], [field]: value };
      return { ...prev, items: nextItems };
    });
  };

  // اختيار صنف من محرك البحث التلقائي
  const handleSelectMedicationForRow = (idx, med) => {
    if (!med) return;
    setReceiptForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[idx] = {
        ...nextItems[idx],
        medication_id: med.id || null,
        medication_name: med.trade_name_ar || med.displayName || med.trade_name_en || '',
        trade_name_en: med.trade_name_en || '',
        barcode: med.gtin_barcode || med.barcode || nextItems[idx].barcode || '',
        unit_name: med.unit_name || nextItems[idx].unit_name || 'علبة',
        public_price: med.public_price ? String(med.public_price) : nextItems[idx].public_price
      };
      return { ...prev, items: nextItems };
    });
  };

  // فتح كارتة إضافة صنف جديد في قاعدة بيانات الأدوية
  const handleOpenAddNewMedication = (idx) => {
    setActiveItemRowIndexForNewMed(idx);
    setIsAddNewMedModalOpen(true);
  };

  // عند نجاح حفظ الصنف الجديد في كارتة الأدوية
  const handleNewMedicationSaved = (newMed) => {
    if (activeItemRowIndexForNewMed !== null && newMed) {
      handleSelectMedicationForRow(activeItemRowIndexForNewMed, newMed);
      showToastRef.current?.(`تم إضافة صنف "${newMed.trade_name_ar || newMed.trade_name_en}" وإدراجه في الطلبية بنجاح`);
    }
    setIsAddNewMedModalOpen(false);
    setActiveItemRowIndexForNewMed(null);
  };

  // حفظ الطلبية المستلمة بالكامل
  const handleSaveOrderReceipt = async (e) => {
    e.preventDefault();
    if (!receiptForm.supplier_id) {
      showToastRef.current?.('⚠️ يرجى تحديد المورد');
      return;
    }
    if (!receiptForm.invoice_number?.trim()) {
      showToastRef.current?.('⚠️ يرجى إدخال رقم الفاتورة أو إذن الاستلام');
      return;
    }

    const validItems = receiptForm.items.filter((it) => it.medication_name && it.medication_name.trim());
    if (validItems.length === 0) {
      showToastRef.current?.('⚠️ يرجى إضافة صنف واحد على الأقل مع تحديد اسمه');
      return;
    }

    try {
      setIsSubmittingReceipt(true);
      const payload = {
        supplierId: receiptForm.supplier_id,
        invoiceNumber: receiptForm.invoice_number.trim(),
        receiptDate: receiptForm.receipt_date,
        receivingEmployeeCode: verifiedEmployee?.code || 'EMP-GEN',
        receivingEmployeeName: verifiedEmployee?.name || verifiedEmployee?.fullName || 'مسؤول الاستلام',
        notes: receiptForm.notes,
        items: validItems
      };

      const res = await outstockSaveOrderReceipt(payload);
      if (res?.success) {
        showToastRef.current?.('✅ تم حفظ استلام الطلبية وتوثيق أصناف الفاتورة بنجاح');
        setIsNewReceiptModalOpen(false);
        loadData();
      } else {
        showToastRef.current?.(res?.error || 'فشل حفظ الطلبية');
      }
    } catch (err) {
      console.error('Error submitting order receipt:', err);
      showToastRef.current?.('حدث خطأ أثناء حفظ الطلبية');
    } finally {
      setIsSubmittingReceipt(false);
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // نافذة سجل الطلبيات المستلمة
  // ══════════════════════════════════════════════════════════════════════════
  const handleOpenHistoryModal = (supplierId = 'all') => {
    setHistorySupplierFilter(supplierId);
    setHistorySearchQuery('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    setIsHistoryModalOpen(true);
  };

  const fetchHistoryReceipts = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const params = {};
      if (historySupplierFilter && historySupplierFilter !== 'all') {
        params.supplierId = historySupplierFilter;
      }
      if (historyDateFrom) params.dateFrom = historyDateFrom;
      if (historyDateTo) params.dateTo = historyDateTo;
      if (historySearchQuery.trim()) params.search = historySearchQuery.trim();

      const res = await outstockGetOrderReceipts(params);
      if (res?.success) {
        setHistoryReceipts(res.receipts || []);
      }
    } catch (err) {
      console.error('Error fetching history receipts:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historySupplierFilter, historyDateFrom, historyDateTo, historySearchQuery]);

  useEffect(() => {
    if (isHistoryModalOpen) {
      fetchHistoryReceipts();
    }
  }, [isHistoryModalOpen, fetchHistoryReceipts]);

  // عرض تفاصيل طلبية
  const handleViewReceiptDetails = async (rec) => {
    try {
      const res = await outstockGetOrderReceiptDetails(rec.id);
      if (res?.success) {
        setSelectedReceiptDetails(res.receipt);
        setIsDetailsModalOpen(true);
      }
    } catch (err) {
      showToastRef.current?.('تعذر تحميل تفاصيل الطلبية');
    }
  };

  // حذف طلبية
  const handleDeleteReceipt = async (rec) => {
    if (!window.confirm(`هل أنت متأكد من حذف سجل الطلبية رقم "${rec.invoice_number}"؟`)) return;
    try {
      const res = await outstockDeleteOrderReceipt(rec.id);
      if (res?.success) {
        showToastRef.current?.('تم حذف سجل الطلبية بنجاح');
        fetchHistoryReceipts();
        loadData();
      } else {
        showToastRef.current?.(res?.error || 'فشل الحذف');
      }
    } catch (err) {
      showToastRef.current?.('حدث خطأ أثناء الحذف');
    }
  };

  // تصدير سجل الطلبيات إلى Excel
  const handleExportHistoryExcel = () => {
    if (historyReceipts.length === 0) return;
    try {
      let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
      csvContent += 'رقم الفاتورة,تاريخ الاستلام,المورد,كود الموظف المستلم,اسم الموظف المستلم,اسم الصنف,الباركود,الكمية المستلمة,الوحدة,سعر الجمهور\n';

      historyReceipts.forEach((r) => {
        const items = r.items || [];
        items.forEach((it) => {
          const row = [
            `"${r.invoice_number}"`,
            `"${r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('ar-EG') : ''}"`,
            `"${r.supplier_name || ''}"`,
            `"${r.receiving_employee_code || ''}"`,
            `"${r.receiving_employee_name || ''}"`,
            `"${it.medication_name || ''}"`,
            `"${it.barcode || ''}"`,
            `"${it.quantity_received || 1}"`,
            `"${it.unit_name || 'علبة'}"`,
            `"${it.public_price || ''}"`
          ].join(',');
          csvContent += row + '\n';
        });
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `سجل_استلام_الطلبيات_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToastRef.current?.('تم تصدير سجل الطلبيات بنجاح');
    } catch (e) {
      showToastRef.current?.('فشل تصدير ملف الإكسل');
    }
  };

  return (
    <div className="outstock-order-receiving-page" style={{ direction: 'rtl', padding: '16px', color: '#1e293b' }}>
      {/* ── 1. الترويسة الرئيسية وشريط الإجراءات والعدادات ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '18px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.05)',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #059669, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
            }}
          >
            <PackageCheck size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#0f172a' }}>
              استلام الطلبات ومطابقة الأصناف الموردة
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              تسجيل الأصناف والكميات المستلمة وتوثيق كود الموظف المستلم وفواتير التوريد
            </p>
          </div>
        </div>

        {/* أزرار الإجراء الرئيسية */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={() => handleOpenHistoryModal('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: '800'
            }}
          >
            <Clock size={16} color="#0284c7" />
            <span>سجل الطلبيات المستلمة</span>
          </button>

          <button
            type="button"
            className="outstock-btn outstock-btn-primary"
            onClick={handleStartNewReceipt}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: '900',
              background: 'linear-gradient(135deg, #059669, #047857)',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
            }}
          >
            <Plus size={18} />
            <span>استلام طلبية جديدة</span>
          </button>
        </div>
      </div>

      {/* ── 2. شريط البطاقات الإحصائية السريعة ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px'
        }}
      >
        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '14px 18px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>إجمالي الطلبيات المستلمة</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a', marginTop: '4px' }}>
            {globalStats.totalReceipts} طلبية
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '14px 18px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>الموردين النشطين بالاستلام</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0284c7', marginTop: '4px' }}>
            {globalStats.activeSuppliers} مورد
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '14px 18px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>إجمالي الأصناف المستلمة</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#059669', marginTop: '4px' }}>
            {globalStats.totalItems} صنف
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '14px 18px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>إجمالي الوحدات المستلمة</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#7c3aed', marginTop: '4px' }}>
            {globalStats.totalUnits} عبوة / وحدة
          </div>
        </div>
      </div>

      {/* ── 3. شريط البحث بين بطاقات الموردين ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
          <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            className="outstock-form-input"
            placeholder="بحث باسم المورد أو كود المورد..."
            value={cardsSearchQuery}
            onChange={(e) => setCardsSearchQuery(e.target.value)}
            style={{ paddingRight: '36px', height: '40px', fontSize: '13px', width: '100%' }}
          />
        </div>

        <button
          type="button"
          className="outstock-btn outstock-btn-secondary"
          onClick={loadData}
          title="تحديث بطاقات الموردين"
          style={{ height: '40px', padding: '0 14px' }}
        >
          <RefreshCw size={15} className={isLoadingSummaries ? 'outstock-spin' : ''} />
          <span style={{ marginRight: '6px' }}>تحديث</span>
        </button>
      </div>

      {/* ── 4. شبكة بطاقات الموردين (Supplier Cards Grid) ── */}
      {isLoadingSummaries ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <RefreshCw className="outstock-spin" size={28} style={{ marginBottom: '10px' }} />
          <div>جاري تحميل بطاقات الموردين وسجل الاستلام...</div>
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '50px 20px',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px dashed #cbd5e1'
          }}
        >
          <Building2 size={40} color="#94a3b8" style={{ marginBottom: '10px' }} />
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#334155' }}>لا توجد بطاقات موردين مطابقة</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
            اضغط على "استلام طلبية جديدة" لتسجيل أول استلام وتفعيل بطاقة المورد تلقائياً
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}
        >
          {filteredSummaries.map((s) => {
            const receiptsCount = parseInt(s.total_receipts_count || 0, 10);
            const itemsCount = parseInt(s.total_items_count || 0, 10);
            const unitsCount = parseInt(s.total_quantity_received || 0, 10);
            const lastDate = s.last_receipt_date ? new Date(s.last_receipt_date).toLocaleDateString('ar-EG') : 'لا يوجد استلامات بعد';

            return (
              <div
                key={s.supplier_id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.04)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
              >
                <div>
                  {/* رأس بطاقة المورد */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '6px'
                          }}
                        >
                          {s.supplier_code || 'SUP'}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: '900', color: '#0f172a' }}>
                          {s.supplier_name}
                        </h3>
                      </div>
                      {s.supplier_phone && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          هاتف: {s.supplier_phone}
                        </div>
                      )}
                    </div>

                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '800',
                        background: receiptsCount > 0 ? '#dcfce7' : '#f1f5f9',
                        color: receiptsCount > 0 ? '#15803d' : '#64748b'
                      }}
                    >
                      {receiptsCount > 0 ? `${receiptsCount} طلبية` : 'جديد'}
                    </span>
                  </div>

                  {/* إحصائيات المورد */}
                  <div
                    style={{
                      background: '#f8fafc',
                      borderRadius: '12px',
                      padding: '12px',
                      marginBottom: '16px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي الأصناف:</div>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: '#0f766e' }}>
                        {itemsCount} صنف
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>الكميات المستلمة:</div>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: '#2563eb' }}>
                        {unitsCount} وحدة
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2', borderTop: '1px solid #e2e8f0', paddingTop: '6px', marginTop: '2px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>آخر استلام:</div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                        {lastDate}
                      </div>
                    </div>
                  </div>
                </div>

                {/* زر فتح سجل طلبيات المورد */}
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => handleOpenHistoryModal(s.supplier_id)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12.5px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a'
                  }}
                >
                  <Eye size={15} color="#2563eb" />
                  <span>سجل طلبيات المورد ({receiptsCount})</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة التحقق من كود الموظف المستلم (مشفر كـ Password)
      ══════════════════════════════════════════════════════════════════════ */}
      <EmployeeCodeAuthModal
        isOpen={isEmployeeAuthOpen}
        title="التحقق من كود الموظف المستلم"
        subtitle="أدخل كود الموظف السري لتوثيق مسؤوليته عن استلام وفحص أصناف الطلبية"
        actionLabel="تأكيد المستلم والمتابعة"
        onClose={() => setIsEmployeeAuthOpen(false)}
        onSuccess={handleEmployeeVerified}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة استلام طلبية جديدة
      ══════════════════════════════════════════════════════════════════════ */}
      {isNewReceiptModalOpen && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingReceipt) setIsNewReceiptModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '920px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              direction: 'rtl',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* ترويسة النافذة */}
            <div
              style={{
                padding: '16px 20px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#059669'
                  }}
                >
                  <PackageCheck size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                    استلام طلبية جديدة وتوثيق الأصناف
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        background: '#dcfce7',
                        color: '#166534',
                        padding: '1px 8px',
                        borderRadius: '6px',
                        fontWeight: '800'
                      }}
                    >
                      المستلم: {verifiedEmployee?.name || '---'} (كود: {verifiedEmployee?.code || '---'})
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNewReceiptModalOpen(false)}
                disabled={isSubmittingReceipt}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* نموذج البيانات */}
            <form onSubmit={handleSaveOrderReceipt} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {/* 1) حقول الترويسة الرئيسية */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                    marginBottom: '20px',
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div>
                    <label className="outstock-form-label">المورد *</label>
                    <select
                      className="outstock-form-select"
                      value={receiptForm.supplier_id}
                      onChange={(e) => setReceiptForm({ ...receiptForm, supplier_id: e.target.value })}
                      required
                    >
                      <option value="">اختر المورد...</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code || s.supplier_code || '---'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="outstock-form-label">تاريخ الطلبية والاستلام *</label>
                    <input
                      type="date"
                      className="outstock-form-input"
                      value={receiptForm.receipt_date}
                      onChange={(e) => setReceiptForm({ ...receiptForm, receipt_date: e.target.value })}
                      required
                    >
                    </input>
                  </div>

                  <div>
                    <label className="outstock-form-label">رقم الفاتورة / إذن الاستلام *</label>
                    <input
                      type="text"
                      className="outstock-form-input"
                      placeholder="مثال: INV-98231 / إذن 104"
                      value={receiptForm.invoice_number}
                      onChange={(e) => setReceiptForm({ ...receiptForm, invoice_number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* 2) جدول الأصناف المستلمة التفاعلي */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Pill size={16} color="#059669" />
                      <span style={{ fontSize: '14px', fontWeight: '900', color: '#0f172a' }}>
                        الأصناف المستلمة بالطلبية ({receiptForm.items.length})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#047857',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '800',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} />
                      <span>إدخال صنف آخر (+)</span>
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '8px 10px', width: '35px', textAlign: 'center' }}>#</th>
                          <th style={{ padding: '8px 10px', width: '42%' }}>اسم الصنف (بحث عربي / إنجليزي 3 أحرف) *</th>
                          <th style={{ padding: '8px 10px', width: '20%' }}>الباركود الدولي</th>
                          <th style={{ padding: '8px 10px', width: '14%', textAlign: 'center' }}>الكمية المستلمة *</th>
                          <th style={{ padding: '8px 10px', width: '14%', textAlign: 'center' }}>الوحدة</th>
                          <th style={{ padding: '8px 10px', width: '10%', textAlign: 'center' }}>إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptForm.items.map((row, idx) => (
                          <tr key={row.temp_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '700', color: '#94a3b8' }}>
                              {idx + 1}
                            </td>

                            {/* اسم الصنف مع محرك البحث التلقائي وزر إضافة صنف جديد */}
                            <td style={{ padding: '6px 8px' }}>
                              <MedicationAutocompleteInput
                                value={row.medication_name}
                                placeholder="اكتب أول 3 حروف من الصنف (عربي أو إنجليزي)..."
                                onChange={(val) => handleItemFieldChange(idx, 'medication_name', val)}
                                onMedicationSelect={(med) => handleSelectMedicationForRow(idx, med)}
                                onAddNewMedication={() => handleOpenAddNewMedication(idx)}
                              />
                            </td>

                            {/* الباركود */}
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="outstock-form-input"
                                placeholder="الباركود الدولي..."
                                value={row.barcode}
                                onChange={(e) => handleItemFieldChange(idx, 'barcode', e.target.value)}
                                style={{ height: '34px', fontSize: '12px' }}
                              />
                            </td>

                            {/* الكمية المستلمة */}
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                required
                                className="outstock-form-input"
                                value={row.quantity_received}
                                onChange={(e) => handleItemFieldChange(idx, 'quantity_received', e.target.value)}
                                style={{
                                  height: '34px',
                                  fontSize: '13px',
                                  fontWeight: '900',
                                  textAlign: 'center',
                                  color: '#047857'
                                }}
                              />
                            </td>

                            {/* الوحدة */}
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <select
                                className="outstock-form-select"
                                value={row.unit_name}
                                onChange={(e) => handleItemFieldChange(idx, 'unit_name', e.target.value)}
                                style={{ height: '34px', fontSize: '11.5px', textAlign: 'center' }}
                              >
                                <option value="علبة">علبة</option>
                                <option value="شريط">شريط</option>
                                <option value="أمبول">أمبول</option>
                                <option value="فيال">فيال</option>
                                <option value="زجاجة">زجاجة</option>
                                <option value="أنبوبة">أنبوبة</option>
                                <option value="كيس">كيس</option>
                              </select>
                            </td>

                            {/* حذف الصف */}
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveItemRow(idx)}
                                disabled={receiptForm.items.length <= 1}
                                style={{
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  color: '#dc2626',
                                  borderRadius: '6px',
                                  padding: '5px',
                                  cursor: receiptForm.items.length <= 1 ? 'not-allowed' : 'pointer',
                                  opacity: receiptForm.items.length <= 1 ? 0.3 : 1
                                }}
                                title="حذف هذا الصنف"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ملاحظات إضافية */}
                <div>
                  <label className="outstock-form-label">ملاحظات الاستلام والفحص</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="ملاحظات حول حالة الشحنة أو التوريد (اختياري)..."
                    value={receiptForm.notes}
                    onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* أزرار الحفظ والإغلاق */}
              <div
                style={{
                  padding: '14px 20px',
                  background: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                  عدد البنود: {receiptForm.items.length} صنف
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-secondary"
                    onClick={() => setIsNewReceiptModalOpen(false)}
                    disabled={isSubmittingReceipt}
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    className="outstock-btn outstock-btn-primary"
                    disabled={isSubmittingReceipt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      background: 'linear-gradient(135deg, #059669, #047857)'
                    }}
                  >
                    {isSubmittingReceipt ? (
                      <>
                        <RefreshCw size={16} className="outstock-spin" />
                        <span>جاري حفظ الاستلام...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>تأكيد استلام الطلبية</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          كارتة إضافة صنف جديد في قاعدة بيانات الأدوية
      ══════════════════════════════════════════════════════════════════════ */}
      {isAddNewMedModalOpen && (
        <AddMedicationModal
          isOpen={isAddNewMedModalOpen}
          creatorEmployee={verifiedEmployee}
          onClose={() => {
            setIsAddNewMedModalOpen(false);
            setActiveItemRowIndexForNewMed(null);
          }}
          onSaveSuccess={handleNewMedicationSaved}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة سجل الطلبيات المستلمة الشامل
      ══════════════════════════════════════════════════════════════════════ */}
      {isHistoryModalOpen && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsHistoryModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '1050px',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              direction: 'rtl',
              border: '1px solid #e2e8f0'
            }}
          >
            {/* رأس النافذة */}
            <div
              style={{
                padding: '16px 20px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb'
                  }}
                >
                  <Clock size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                    سجل طلبيات التوريد المستلمة
                  </h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    بحث شامل باسم الصنف، الباركود العالمي، رقم الفاتورة، أو كود الموظف
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={handleExportHistoryExcel}
                  disabled={historyReceipts.length === 0}
                  style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <FileSpreadsheet size={15} color="#15803d" />
                  <span>تصدير Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* شريط الفلاتر والبحث متعدد الحقول */}
            <div
              style={{
                padding: '12px 20px',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}
            >
              {/* بحث ذكي شامل */}
              <div style={{ minWidth: '240px', flex: 1.5 }}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={15}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                  />
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="بحث باسم الصنف، الباركود، الفاتورة، كود الموظف..."
                    value={historySearchQuery}
                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                    style={{ paddingRight: '32px', height: '36px', fontSize: '12px', width: '100%' }}
                  />
                </div>
              </div>

              {/* اختيار المورد */}
              <div style={{ minWidth: '160px', flex: 1 }}>
                <select
                  className="outstock-form-select"
                  value={historySupplierFilter}
                  onChange={(e) => setHistorySupplierFilter(e.target.value)}
                  style={{ height: '36px', fontSize: '12px', width: '100%' }}
                >
                  <option value="all">كافة الموردين</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* من تاريخ */}
              <div style={{ minWidth: '125px' }}>
                <input
                  type="date"
                  className="outstock-form-input"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  style={{ height: '36px', fontSize: '11.5px' }}
                />
              </div>

              {/* إلى تاريخ */}
              <div style={{ minWidth: '125px' }}>
                <input
                  type="date"
                  className="outstock-form-input"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  style={{ height: '36px', fontSize: '11.5px' }}
                />
              </div>

              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={fetchHistoryReceipts}
                style={{ height: '36px', padding: '0 10px' }}
                title="تحديث النتائج"
              >
                <RefreshCw size={14} className={isLoadingHistory ? 'outstock-spin' : ''} />
              </button>
            </div>

            {/* جدول سجل الطلبيات */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
                  <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
                  <div>جاري تحميل سجل الطلبيات...</div>
                </div>
              ) : historyReceipts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
                  <FileText size={36} color="#94a3b8" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: '800' }}>لا توجد طلبيات مسجلة مطابقة للبحث</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                    جرب تغيير خيارات الفلترة أو رقم الفاتورة
                  </div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 5 }}>
                      <th style={{ padding: '10px 12px' }}>رقم الفاتورة</th>
                      <th style={{ padding: '10px 12px' }}>تاريخ الاستلام</th>
                      <th style={{ padding: '10px 12px' }}>المورد</th>
                      <th style={{ padding: '10px 12px' }}>الموظف المستلم</th>
                      <th style={{ padding: '10px 12px' }}>الأصناف المستلمة (عينة)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>الكميات</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyReceipts.map((r) => {
                      const items = r.items || [];
                      const formattedDate = r.receipt_date ? new Date(r.receipt_date).toLocaleDateString('ar-EG') : '---';

                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '800', color: '#0f172a' }}>
                            {r.invoice_number}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {formattedDate}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f766e' }}>
                            {r.supplier_name}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <UserCheck size={14} color="#0284c7" />
                              <span style={{ fontWeight: '700' }}>{r.receiving_employee_name}</span>
                              <span
                                style={{
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  fontSize: '10.5px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontWeight: '800'
                                }}
                              >
                                {r.receiving_employee_code}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '280px' }}>
                              {items.slice(0, 3).map((it, i) => (
                                <span
                                  key={i}
                                  style={{
                                    background: '#f1f5f9',
                                    color: '#334155',
                                    fontSize: '11px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                  }}
                                >
                                  {it.medication_name} ({it.quantity_received} {it.unit_name || 'علبة'})
                                </span>
                              ))}
                              {items.length > 3 && (
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>
                                  +{items.length - 3} صنف آخر
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '900', color: '#2563eb' }}>
                            {r.total_quantity || 0} وحدة
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="outstock-btn outstock-btn-secondary"
                                onClick={() => handleViewReceiptDetails(r)}
                                title="عرض التفاصيل الكاملة"
                                style={{ padding: '5px 8px' }}
                              >
                                <Eye size={14} />
                              </button>
                              <button
                                type="button"
                                className="outstock-btn outstock-btn-secondary"
                                onClick={() => handleDeleteReceipt(r)}
                                title="حذف السجل"
                                style={{ padding: '5px 8px', color: '#dc2626' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          نافذة تفاصيل الطلبية المستلمة المحددة
      ══════════════════════════════════════════════════════════════════════ */}
      {isDetailsModalOpen && selectedReceiptDetails && (
        <div
          className="outstock-modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 110000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDetailsModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              direction: 'rtl',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>
                  تفاصيل استلام الفاتورة: {selectedReceiptDetails.invoice_number}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                  المورد: {selectedReceiptDetails.supplier_name} • التاريخ: {new Date(selectedReceiptDetails.receipt_date).toLocaleDateString('ar-EG')}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12.5px'
                }}
              >
                <span>الموظف المستلم: <strong>{selectedReceiptDetails.receiving_employee_name} ({selectedReceiptDetails.receiving_employee_code})</strong></span>
                <span>إجمالي الكميات: <strong>{selectedReceiptDetails.total_quantity} وحدة</strong></span>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 10px' }}>اسم الصنف</th>
                    <th style={{ padding: '8px 10px' }}>الباركود</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>الكمية المستلمة</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>الوحدة</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>سعر الجمهور</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReceiptDetails.items || []).map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: '800' }}>{it.medication_name}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b', fontFamily: 'monospace' }}>{it.barcode || '---'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '900', color: '#047857' }}>{it.quantity_received}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.unit_name || 'علبة'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>{it.public_price ? `${it.public_price} ج.م` : '---'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedReceiptDetails.notes && (
                <div style={{ marginTop: '14px', fontSize: '12px', color: '#475569' }}>
                  <strong>ملاحظات:</strong> {selectedReceiptDetails.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
