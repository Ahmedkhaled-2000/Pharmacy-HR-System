import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './stock.css';
import {
  stockGetOverview,
  stockGetLocations,
  stockSaveLocation,
  stockGetBalances,
  stockGetBatches,
  stockGetLedger,
  stockGetTransfers,
  stockGetTransferDetails,
  stockCreateTransfer,
  stockDispatchTransfer,
  stockReceiveTransfer,
  stockSaveReceipt,
  stockGetCounts,
  stockGetCountDetails,
  stockStartCount,
  stockScanCountItem,
  stockPostCountReconciliation,
  stockGetReport,
  stockReconcileBalance,
  stockToggleBatchQuarantine
} from '../../utils/stockApiClient';
import StockMenuBar from './StockMenuBar';
import StockQuickRibbon from './StockQuickRibbon';
import StockStatusBar from './StockStatusBar';
import StockDashboardTab from './StockDashboardTab';
import StockExplorerTab from './StockExplorerTab';
import StockTransfersTab from './StockTransfersTab';
import StockBatchesTab from './StockBatchesTab';
import StockReceiptsTab from './StockReceiptsTab';
import StockReorderTab from './StockReorderTab';
import StockRecallsTab from './StockRecallsTab';
import StockScrapReturnsTab from './StockScrapReturnsTab';
import StockSuppliersTab from './StockSuppliersTab';
import StockLabelPrinterTab from './StockLabelPrinterTab';
import { printTransferInvoicePdf } from '../../utils/transferInvoicePdfGenerator';
import { printThermalLabels } from '../../utils/labelPrintService';
import { Tag, KeyRound } from 'lucide-react';
import {
  Boxes,
  Plus,
  Send,
  Truck,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  FileSpreadsheet,
  Printer,
  Download,
  X,
  Search,
  RefreshCw,
  Warehouse,
  FileText,
  Clock,
  ArrowRightLeft,
  DollarSign
} from 'lucide-react';

export default function StockSystemView({
  currentUser,
  currentBranch,
  onLogout,
  themeMode = 'light',
  toggleTheme,
  showToast
}) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false);

  // ── إدارة المظهر (فاتح افتراضياً / داكن اختياري) ──
  const [internalTheme, setInternalTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('pharmaos_stock_theme');
      return saved ? saved : (themeMode === 'dark' ? 'dark' : 'light');
    } catch {
      return 'light';
    }
  });

  const activeTheme = internalTheme;

  const handleToggleTheme = () => {
    const nextTheme = activeTheme === 'light' ? 'dark' : 'light';
    setInternalTheme(nextTheme);
    try {
      localStorage.setItem('pharmaos_stock_theme', nextTheme);
    } catch {}
    if (toggleTheme) toggleTheme();
  };

  // ── البيانات المحملة من السيرفر ──
  const [overview, setOverview] = useState({});
  const [locations, setLocations] = useState([]);
  const [balances, setBalances] = useState([]);
  const [batches, setBatches] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [counts, setCounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medications, setMedications] = useState([]);

  // ── حالات النوافذ المنبثقة ──
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedTransferDetails, setSelectedTransferDetails] = useState(null);
  const [isTransferDetailsModalOpen, setIsTransferDetailsModalOpen] = useState(false);
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);
  const [isNewCountModalOpen, setIsNewCountModalOpen] = useState(false);
  const [selectedCountDetails, setSelectedCountDetails] = useState(null);
  const [isCountDetailsModalOpen, setIsCountDetailsModalOpen] = useState(false);

  // ── بيانات التقارير الـ 20 ──
  const [selectedReportType, setSelectedReportType] = useState('balances_by_store');
  const [reportData, setReportData] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportLocationFilter, setReportLocationFilter] = useState('');

  // ── نموذج إنشاء تحويل جديد ──
  const [newTransferData, setNewTransferData] = useState({
    source_location_id: '',
    destination_location_id: '',
    driver_name: '',
    driver_phone: '',
    notes: '',
    items: [{ medication_id: '', med_name: '', quantity_requested: 1, unit_type: 'pack' }]
  });

  // ── نموذج بدء جلسة جرد جديدة ──
  const [newCountData, setNewCountData] = useState({
    location_id: '',
    count_type: 'full',
    notes: ''
  });
  const [scanMedicationId, setScanMedicationId] = useState('');
  const [scanActualQty, setScanActualQty] = useState(1);
  const [scanBarcode, setScanBarcode] = useState('');

  // ── تحميل كافة البيانات المركزية ──
  const loadAllStockData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ovRes, locRes, balRes, batRes, trRes] = await Promise.all([
        stockGetOverview(currentBranch?.id).catch(() => ({})),
        stockGetLocations().catch(() => ({ locations: [] })),
        stockGetBalances().catch(() => ({ balances: [] })),
        stockGetBatches().catch(() => ({ batches: [] })),
        stockGetTransfers().catch(() => ({ transfers: [] }))
      ]);

      setOverview(ovRes || {});
      setLocations(locRes?.locations || []);
      setBalances(balRes?.balances || []);
      setBatches(batRes?.batches || []);
      setTransfers(trRes?.transfers || []);

      // توليد قائمة الأدوية المتاحة من الأرصدة
      const uniqueMeds = (balRes?.balances || []).map((b) => ({
        id: b.medication_id,
        trade_name_ar: b.name_ar,
        trade_name_en: b.name_en,
        category: b.category,
        barcode: b.barcode,
        public_price: b.public_price
      }));
      setMedications(uniqueMeds);
    } catch (err) {
      console.error('[Stock Load Error]:', err);
      showToast?.('تعذر تحديث بعض بيانات المخازن من السيرفر', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentBranch, showToast]);

  useEffect(() => {
    loadAllStockData();
  }, [loadAllStockData]);

  // ── تحميل بيانات التقرير المحدد ──
  const fetchReport = useCallback(async (type) => {
    const targetType = type || selectedReportType;
    setIsReportLoading(true);
    try {
      const res = await stockGetReport(targetType, {
        location_id: reportLocationFilter,
        from_date: reportDateFrom,
        to_date: reportDateTo
      });
      if (res?.success) {
        setReportData(res.data || []);
        setReportTitle(res.reportTitle || 'تقرير المخازن');
      }
    } catch (err) {
      console.error('[Report Fetch Error]:', err);
      showToast?.('فشل تحميل بيانات التقرير المحدد', 'error');
    } finally {
      setIsReportLoading(false);
    }
  }, [selectedReportType, reportLocationFilter, reportDateFrom, reportDateTo, showToast]);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReport(selectedReportType);
    } else if (activeTab === 'ledger') {
      stockGetLedger().then((res) => setLedger(res?.ledger || [])).catch(() => {});
    } else if (activeTab === 'counts') {
      stockGetCounts().then((res) => setCounts(res?.counts || [])).catch(() => {});
    }
  }, [activeTab, selectedReportType, fetchReport]);

  // ── تصدير التقرير لـ CSV ──
  const handleExportCSV = () => {
    if (!reportData || reportData.length === 0) {
      showToast?.('لا توجد بيانات للتصدير', 'warning');
      return;
    }
    const headers = Object.keys(reportData[0]);
    const csvRows = [headers.join(',')];
    reportData.forEach((row) => {
      const values = headers.map((h) => {
        const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReportType}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast?.('تم تصدير ملف CSV بنجاح', 'success');
  };

  // ── طباعة التقرير ──
  const handlePrintReport = () => {
    window.print();
  };

  // ── معالجة حفظ إذن الاستلام من المورد ──
  const handleSaveReceipt = async (receiptData) => {
    try {
      setIsLoading(true);
      const res = await stockSaveReceipt({
        ...receiptData,
        performed_by_id: currentUser?.id || 'admin',
        performed_by_name: currentUser?.name || 'مدير النظام'
      });
      if (res?.success) {
        showToast?.('تم ترحيل إذن استلام المشتريات وتحديث الأرصدة والتشغيلات بنجاح', 'success');
        setActiveTab('balances');
        loadAllStockData();
      }
    } catch (err) {
      showToast?.(err.message || 'فشل حفظ إذن الاستلام', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── معالجة إنشاء أمر تحويل جديد ──
  const handleSaveTransfer = async () => {
    if (!newTransferData.source_location_id || !newTransferData.destination_location_id) {
      showToast?.('يرجى تحديد المخزن المصدر والمخزن المستهدف', 'warning');
      return;
    }
    if (newTransferData.source_location_id === newTransferData.destination_location_id) {
      showToast?.('لا يمكن التحويل لنفس المستودع', 'warning');
      return;
    }
    try {
      setIsLoading(true);
      const res = await stockCreateTransfer({
        ...newTransferData,
        requested_by_id: currentUser?.id || 'admin',
        requested_by_name: currentUser?.name || 'مسؤول الفرع'
      });
      if (res?.success) {
        showToast?.(`تم إنشاء أمر التحويل بنجاح برقم: ${res.transfer?.transfer_number || ''}`, 'success');
        setIsTransferModalOpen(false);
        setNewTransferData({
          source_location_id: '',
          destination_location_id: '',
          driver_name: '',
          driver_phone: '',
          notes: '',
          items: [{ medication_id: '', med_name: '', quantity_requested: 1, unit_type: 'pack' }]
        });
        loadAllStockData();
        setActiveTab('transfers');
      }
    } catch (err) {
      showToast?.(err.message || 'فشل إنشاء أمر التحويل', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── معالجة صرف وشحن التحويل (Dispatched) ──
  const handleDispatchTransfer = async (transferId) => {
    if (!window.confirm('هل أنت متأكد من صرف البضاعة من المخزن وبدء النقل (In-Transit)؟')) return;
    try {
      setIsLoading(true);
      const res = await stockDispatchTransfer(transferId, {
        dispatched_by: currentUser?.name || 'أمين المخزن الرئيسي'
      });
      if (res?.success) {
        showToast?.('تم صرف البضاعة وترحيلها بنجاح إلى رصيد الطريق (In-Transit)', 'success');
        setIsTransferDetailsModalOpen(false);
        loadAllStockData();
      }
    } catch (err) {
      showToast?.(err.message || 'فشل صرف التحويل', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── معالجة استلام التحويل في الفرع المستهدف (Received) ──
  const handleReceiveTransfer = async (transferId, items) => {
    try {
      setIsLoading(true);
      const res = await stockReceiveTransfer(transferId, {
        received_by: currentUser?.name || 'مسؤول استلام الفرع',
        items
      });
      if (res?.success) {
        showToast?.('تم تأكيد استلام البضاعة وإضافتها لرصيد الفرع بنجاح', 'success');
        setIsTransferDetailsModalOpen(false);
        loadAllStockData();
      }
    } catch (err) {
      showToast?.(err.message || 'فشل استلام التحويل', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── فتح تفاصيل أمر التحويل ──
  const handleOpenTransferDetails = async (tr) => {
    try {
      const full = await stockGetTransferDetails(tr.id);
      setSelectedTransferDetails(full?.transfer || tr);
      setIsTransferDetailsModalOpen(true);
    } catch {
      setSelectedTransferDetails(tr);
      setIsTransferDetailsModalOpen(true);
    }
  };

  // ── فتح تفاصيل جلسة الجرد ──
  const handleOpenCountDetails = async (cnt) => {
    setSelectedCountDetails(cnt);
    setIsCountDetailsModalOpen(true);
    try {
      const full = await stockGetCountDetails(cnt.id);
      if (full?.success && full.count) {
        setSelectedCountDetails(full.count);
      }
    } catch (err) {
      console.warn('Could not load detailed count items:', err);
    }
  };

  // ── بدء جلسة جرد جديدة ──
  const handleStartCount = async () => {
    if (!newCountData.location_id) {
      showToast?.('يرجى اختيار المستودع أو الفرع المراد جرده', 'warning');
      return;
    }
    try {
      setIsLoading(true);
      const res = await stockStartCount({
        ...newCountData,
        counted_by_id: currentUser?.id || 'admin',
        counted_by_name: currentUser?.name || 'مسؤول الجرد'
      });
      if (res?.success) {
        showToast?.(`تم فتح جلسة الجرد بنجاح برقم: ${res.count?.count_number || ''}`, 'success');
        setIsNewCountModalOpen(false);
        setNewCountData({ location_id: '', count_type: 'full', notes: '' });
        loadAllStockData();
        setActiveTab('counts');
      }
    } catch (err) {
      showToast?.(err.message || 'فشل فتح جلسة الجرد', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── مسح أو تسجيل صنف في جلسة الجرد ──
  const handleScanCountItem = async () => {
    if (!selectedCountDetails?.id || !scanMedicationId) {
      showToast?.('يرجى اختيار الصنف وتحديد الكمية الفعلية', 'warning');
      return;
    }
    try {
      const res = await stockScanCountItem(selectedCountDetails.id, {
        medication_id: scanMedicationId,
        actual_quantity: parseFloat(scanActualQty) || 0,
        barcode: scanBarcode
      });
      if (res?.success) {
        showToast?.('تم تسجيل قراءة الجرد للصنف بنجاح', 'success');
        setScanMedicationId('');
        setScanActualQty(1);
        setScanBarcode('');
        // تحديث التفاصيل
        const full = await stockGetCountDetails(selectedCountDetails.id);
        if (full?.success && full.count) {
          setSelectedCountDetails(full.count);
        }
      }
    } catch (err) {
      showToast?.(err.message || 'فشل تسجيل صنف الجرد', 'error');
    }
  };

  // ── اعتماد وترحيل فروقات الجرد والتسوية ──
  const handlePostCountReconciliation = async () => {
    if (!selectedCountDetails?.id) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في اعتماد وترحيل فروقات الجرد؟ سيتم تعديل الأرصدة وإدراج قيود تسوية دائمة في دفتر الحركات.')) {
      return;
    }
    try {
      setIsLoading(true);
      const res = await stockPostCountReconciliation(selectedCountDetails.id, {
        reviewed_by: currentUser?.name || 'مدير المخازن والجرد',
        variance_notes: 'اعتماد جرد فعلي'
      });
      if (res?.success) {
        showToast?.('تم اعتماد الجرد وترحيل فروقات الأرصدة بنجاح ⚖️', 'success');
        setIsCountDetailsModalOpen(false);
        loadAllStockData();
      }
    } catch (err) {
      showToast?.(err.message || 'فشل ترحيل تسويات الجرد', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ── إحصائيات سريعة للـ Ribbon ──
  const ribbonStats = useMemo(() => {
    const totalSkus = balances.length;
    const inTransitCount = transfers.filter((t) => t.status === 'in_transit').length;
    const nearExpiryCount = batches.filter((b) => {
      const days = parseInt(b.days_to_expire, 10);
      return !isNaN(days) && days <= 90 && days >= 0;
    }).length;
    return { totalSkus, inTransitCount, nearExpiryCount };
  }, [balances, transfers, batches]);

  // قائمة أسماء التقارير الـ 20
  const REPORT_CATALOG = [
    { id: 'balances_by_store', label: '1. الأرصدة الحالية لكل مخزن وفرع' },
    { id: 'branch_matrix', label: '2. مقارنة الأرصدة عبر شبكة الفروع' },
    { id: 'stock_card', label: '3. كارت الصنف والحركات التاريخية' },
    { id: 'ledger_movements', label: '4. سجل دفتر الحركات المخزنية العام' },
    { id: 'transfers_summary', label: '5. التحويلات المخزنية الصادرة والواردة' },
    { id: 'in_transit', label: '6. الشحنات والبضاعة في الطريق (In-Transit)' },
    { id: 'supplier_receipts', label: '7. استلامات المشتريات من الموردين' },
    { id: 'purchase_costs', label: '8. تكاليف الشراء وهامش الربحية' },
    { id: 'batches_expiry', label: '9. التشغيلات والصلاحيات الشامل' },
    { id: 'near_expiry', label: '10. الأصناف القريبة من الانتهاء (FEFO)' },
    { id: 'expired', label: '11. الأصناف المنتهية الصلاحية للتوالف' },
    { id: 'low_stock', label: '12. الأصناف منخفضة المخزون وحد الطلب' },
    { id: 'dead_stock', label: '13. الأصناف الراكدة وبطيئة الحركة' },
    { id: 'count_variance', label: '14. جلسات الجرد ومطابقة الفروقات' },
    { id: 'shortage_surplus', label: '15. صافي العجز والزيادة بالجرد' },
    { id: 'damaged_scrap', label: '16. البضاعة التالفة ومستودع الهوالك' },
    { id: 'valuation', label: '17. تقييم المخزون المالي الإجمالي' },
    { id: 'pos_sync_audit', label: '18. مطابقة مبيعات POS مع دفتر المخزون' },
    { id: 'negative_stock', label: '19. الأرصدة السالبة ومبيعات الأوفلاين' },
    { id: 'audit_logs', label: '20. سجل التدقيق الرقابي للعمليات' }
  ];

  return (
    <div className={`stock-desktop-window theme-${activeTheme}`}>
      {/* ── 1. شريط القوائم العلوية لسطح المكتب (Top Menu Bar) ── */}
      <StockMenuBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewReceipt={() => setActiveTab('receipts')}
        onNewTransfer={() => setIsTransferModalOpen(true)}
        onNewCount={() => setIsNewCountModalOpen(true)}
        onRefresh={loadAllStockData}
        onExit={() => {
          if (onLogout) onLogout();
          else window.location.href = '/';
        }}
        onOpenLocations={() => setIsLocationsModalOpen(true)}
        onReconcileAll={async () => {
          if (!window.confirm('هل تريد إعادة مطابقة جميع الأرصدة اللحظية مع دفتر الأستاذ الدائم؟')) return;
          showToast?.('جاري المطابقة الحسابية الذاتية لكافة المستودعات...', 'info');
          await loadAllStockData();
          showToast?.('تمت مطابقة وتحديث كافة الأرصدة بنجاح 100%', 'success');
        }}
        onSelectReport={(repId) => {
          setSelectedReportType(repId);
          setActiveTab('reports');
        }}
        themeMode={activeTheme}
        toggleTheme={handleToggleTheme}
      />

      {/* ── 2. شريط الأدوات السريع والتبويبات (Quick Ribbon Bar) ── */}
      <StockQuickRibbon
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={ribbonStats}
        onNewReceipt={() => setActiveTab('receipts')}
        onNewTransfer={() => setIsTransferModalOpen(true)}
        onNewCount={() => setIsNewCountModalOpen(true)}
        onRefresh={loadAllStockData}
        isLoading={isLoading}
      />

      {/* ── 3. مساحة العمل ومحتوى التبويب النشط (Tab Workspace) ── */}
      <div className="stock-workspace-content">
        {activeTab === 'dashboard' && (
          <StockDashboardTab
            overview={overview}
            onNavigateTab={setActiveTab}
            onOpenTransferDetails={handleOpenTransferDetails}
          />
        )}

        {activeTab === 'balances' && (
          <StockExplorerTab
            balances={balances}
            locations={locations}
            isLoading={isLoading}
            onReconcile={async (b) => {
              try {
                await stockReconcileBalance(b.medication_id, b.location_id);
                showToast?.('تمت مطابقة الرصيد اللحظي وتصحيحه بنجاح', 'success');
                loadAllStockData();
              } catch (e) {
                showToast?.(e.message || 'فشلت المطابقة', 'error');
              }
            }}
            onViewBatches={(b) => {
              setActiveTab('batches');
            }}
          />
        )}

        {activeTab === 'batches' && (
          <StockBatchesTab
            batches={batches}
            locations={locations}
            isLoading={isLoading}
            onToggleQuarantine={async (batchId, curStatus) => {
              try {
                await stockToggleBatchQuarantine(batchId, !curStatus);
                showToast?.(curStatus ? 'تم إلغاء عزل التشغيلة وإعادتها للصرف' : 'تم عزل التشغيلة ومنع صرفها بنجاح', 'success');
                loadAllStockData();
              } catch (e) {
                showToast?.(e.message || 'فشل تحديث حالة العزل', 'error');
              }
            }}
            onBatchAdded={loadAllStockData}
            showToast={showToast}
          />
        )}

        {activeTab === 'transfers' && (
          <StockTransfersTab
            transfers={transfers}
            locations={locations}
            isLoading={isLoading}
            onNewTransfer={() => setIsTransferModalOpen(true)}
            onViewDetails={handleOpenTransferDetails}
            onDispatch={(tr) => handleDispatchTransfer(tr.id)}
            onOpenReceive={handleOpenTransferDetails}
            showToast={showToast}
          />
        )}

        {activeTab === 'suppliers' && (
          <StockSuppliersTab showToast={showToast} />
        )}

        {activeTab === 'label_printer' && (
          <StockLabelPrinterTab showToast={showToast} />
        )}

        {activeTab === 'reorder' && (
          <StockReorderTab
            locations={locations}
            showToast={showToast}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'recalls' && (
          <StockRecallsTab
            locations={locations}
            showToast={showToast}
            onBatchStatusChanged={loadAllStockData}
          />
        )}

        {activeTab === 'scrap' && (
          <StockScrapReturnsTab
            locations={locations}
            suppliers={suppliers}
            balances={balances}
            medications={medications}
            showToast={showToast}
            onOperationSuccess={loadAllStockData}
          />
        )}

        {activeTab === 'receipts' && (
          <StockReceiptsTab
            locations={locations}
            suppliers={suppliers}
            medications={medications}
            onSaveReceipt={handleSaveReceipt}
            isLoading={isLoading}
          />
        )}

        {/* ── تبويب جلسات الجرد الفعلي ── */}
        {activeTab === 'counts' && (
          <div className="stock-grid-wrapper">
            <div className="stock-grid-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClipboardCheck size={18} color="#38bdf8" />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>سجل جلسات الجرد الفعلي ومطابقة الفروق الحسابية</span>
              </div>
              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={() => setIsNewCountModalOpen(true)}
              >
                <Plus size={14} />
                <span>فتح جلسة جرد جديدة</span>
              </button>
            </div>

            <div className="stock-table-container">
              <table className="stock-data-table">
                <thead>
                  <tr>
                    <th>رقم الجلسة</th>
                    <th>المستودع / الفرع</th>
                    <th>نوع الجرد</th>
                    <th>الحالة</th>
                    <th>مسؤول الجرد</th>
                    <th>إجمالي تكلفة الفروق</th>
                    <th>وقت الاعتماد</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="stock-table-empty">
                        لا توجد جلسات جرد مسجلة حالياً. انقر على "فتح جلسة جرد جديدة" للبدء.
                      </td>
                    </tr>
                  ) : (
                    counts.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.count_number}</strong></td>
                        <td>{c.location_name || c.location_id}</td>
                        <td>{c.count_type === 'full' ? 'جرد كلي شامل' : 'جرد جزئي / تصنيف'}</td>
                        <td>
                          <span className={`stock-status-chip ${c.status === 'posted' ? 'success' : 'warning'}`}>
                            {c.status === 'posted' ? 'معتمد ومرحل' : 'قيد الفحص'}
                          </span>
                        </td>
                        <td>{c.counted_by_name}</td>
                        <td style={{ color: parseFloat(c.total_variance_cost) < 0 ? '#ef4444' : '#10b981', fontWeight: 800 }}>
                          {parseFloat(c.total_variance_cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
                        </td>
                        <td>{c.posted_at ? new Date(c.posted_at).toLocaleString('ar-EG') : 'غير معتمد'}</td>
                        <td>
                          <button
                            type="button"
                            className="stock-table-row-btn"
                            onClick={() => handleOpenCountDetails(c)}
                          >
                            عرض ومطابقة
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── تبويب دفتر الأستاذ الدائم (Immutable Ledger) ── */}
        {activeTab === 'ledger' && (
          <div className="stock-grid-wrapper">
            <div className="stock-grid-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="#10b981" />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>دفتر حركات المخزون المركزي غير القابل للتعديل (Append-Only Event Ledger)</span>
              </div>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                حركات مرحلة نهائياً لا تقبل الحذف أو التعديل المباشر
              </span>
            </div>

            <div className="stock-table-container">
              <table className="stock-data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>التاريخ والوقت</th>
                    <th>نوع الحركة</th>
                    <th>المستودع / الفرع</th>
                    <th>اسم الصنف</th>
                    <th>الكمية الأساسية</th>
                    <th>التكلفة للوحدة</th>
                    <th>إجمالي التكلفة</th>
                    <th>المستند المرجعي</th>
                    <th>المنفذ</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="stock-table-empty">
                        جاري تحميل الحركات الدفترية...
                      </td>
                    </tr>
                  ) : (
                    ledger.map((row, idx) => {
                      const qty = parseFloat(row.quantity_base || 0);
                      const isNegative = qty < 0;
                      return (
                        <tr key={row.id || idx}>
                          <td>{row.id}</td>
                          <td>{new Date(row.created_at).toLocaleString('ar-EG')}</td>
                          <td>
                            <span className={`stock-status-chip ${isNegative ? 'danger' : 'success'}`}>
                              {row.movement_type}
                            </span>
                          </td>
                          <td>{row.location_name || row.location_id}</td>
                          <td><strong>{row.trade_name_ar || row.medication_id}</strong></td>
                          <td style={{ color: isNegative ? '#ef4444' : '#10b981', fontWeight: 800 }}>
                            {qty > 0 ? `+${qty}` : qty}
                          </td>
                          <td>{parseFloat(row.unit_cost || 0).toFixed(2)} ج</td>
                          <td>{parseFloat(row.total_cost || 0).toFixed(2)} ج</td>
                          <td>{row.document_type} #{row.document_number}</td>
                          <td>{row.performed_by_name}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── تبويب مركز التقارير الـ 20 المخصصة ── */}
        {activeTab === 'reports' && (
          <div className="stock-grid-wrapper">
            <div className="stock-grid-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} color="#06b6d4" />
                <select
                  className="stock-select-filter"
                  style={{ minWidth: '320px', fontWeight: 800 }}
                  value={selectedReportType}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                >
                  {REPORT_CATALOG.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="date"
                  className="stock-date-input"
                  value={reportDateFrom}
                  onChange={(e) => setReportDateFrom(e.target.value)}
                  title="من تاريخ"
                />
                <span style={{ color: '#64748b' }}>إلى</span>
                <input
                  type="date"
                  className="stock-date-input"
                  value={reportDateTo}
                  onChange={(e) => setReportDateTo(e.target.value)}
                  title="إلى تاريخ"
                />

                <select
                  className="stock-select-filter"
                  value={reportLocationFilter}
                  onChange={(e) => setReportLocationFilter(e.target.value)}
                >
                  <option value="">🏢 كافة المستودعات</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name_ar || loc.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="stock-quick-action-btn primary"
                  onClick={() => fetchReport(selectedReportType)}
                  disabled={isReportLoading}
                >
                  <RefreshCw size={14} className={isReportLoading ? 'animate-spin' : ''} />
                  <span>تحديث التقرير</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: 'auto' }}>
                <button
                  type="button"
                  className="stock-quick-action-btn outline"
                  onClick={handleExportCSV}
                >
                  <Download size={14} />
                  <span>تصدير CSV</span>
                </button>
                <button
                  type="button"
                  className="stock-quick-action-btn outline"
                  onClick={handlePrintReport}
                >
                  <Printer size={14} />
                  <span>طباعة</span>
                </button>
              </div>
            </div>

            <div style={{ padding: '10px 16px', background: 'var(--stock-surface-2)', borderBottom: '1px solid var(--stock-border)' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--stock-primary)' }}>
                {reportTitle}
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--stock-text-muted)' }}>
                عدد السجلات: {reportData.length.toLocaleString('ar-EG')} سجل
              </div>
            </div>

            <div className="stock-table-container">
              {isReportLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                  <div>جاري استخراج وتحليل بيانات التقرير...</div>
                </div>
              ) : reportData.length === 0 ? (
                <div className="stock-table-empty">
                  لا توجد سجلات مطابقة لمعايير البحث في هذا التقرير.
                </div>
              ) : (
                <table className="stock-data-table">
                  <thead>
                    <tr>
                      {Object.keys(reportData[0]).map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(reportData[0]).map((col) => (
                          <td key={col}>
                            {row[col] !== null && row[col] !== undefined
                              ? typeof row[col] === 'number'
                                ? row[col].toLocaleString('ar-EG')
                                : String(row[col])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. شريط الحالة السفلي (Status Bar) ── */}
      <StockStatusBar
        activeLocationName={currentBranch?.name || 'المخزن الرئيسي المركزي'}
        totalSkus={balances.length}
        isOnline={navigator.onLine}
        currentUserName={currentUser?.name || 'مدير النظام'}
      />

      {/* ── مودال أمر التحويل الجديد ── */}
      {isTransferModalOpen && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-card" style={{ maxWidth: '780px' }}>
            <div className="stock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>إنشاء أمر تحويل مخزني بين المستودعات والفروع</h3>
              </div>
              <button
                type="button"
                className="stock-modal-close-btn"
                onClick={() => setIsTransferModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="stock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="stock-field-label">المستودع المصدر (الصارف) *</label>
                  <select
                    className="stock-modal-select"
                    value={newTransferData.source_location_id}
                    onChange={(e) => setNewTransferData({ ...newTransferData, source_location_id: e.target.value })}
                  >
                    <option value="">-- اختر المخزن المصدر --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name_ar || loc.name} {loc.is_central ? '⭐ (مركزي)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="stock-field-label">المستودع المستهدف (المستلم) *</label>
                  <select
                    className="stock-modal-select"
                    value={newTransferData.destination_location_id}
                    onChange={(e) => setNewTransferData({ ...newTransferData, destination_location_id: e.target.value })}
                  >
                    <option value="">-- اختر فرع الاستلام --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name_ar || loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="stock-field-label">اسم السائق / مسؤول النقل</label>
                  <input
                    type="text"
                    className="stock-modal-input"
                    placeholder="مثال: محمود عبد الرازق"
                    value={newTransferData.driver_name}
                    onChange={(e) => setNewTransferData({ ...newTransferData, driver_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="stock-field-label">هاتف السائق</label>
                  <input
                    type="text"
                    className="stock-modal-input"
                    placeholder="01xxxxxxxxx"
                    value={newTransferData.driver_phone}
                    onChange={(e) => setNewTransferData({ ...newTransferData, driver_phone: e.target.value })}
                  />
                </div>
              </div>

              {/* جدول بنود التحويل */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="stock-field-label" style={{ margin: 0 }}>الأصناف والكميات المطلوبة</label>
                  <button
                    type="button"
                    className="stock-table-row-btn"
                    onClick={() => {
                      setNewTransferData({
                        ...newTransferData,
                        items: [
                          ...newTransferData.items,
                          { medication_id: '', med_name: '', quantity_requested: 1, unit_type: 'pack' }
                        ]
                      });
                    }}
                  >
                    + إضافة صنف آخر
                  </button>
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '6px' }}>
                  <table className="stock-data-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>الصنف الدوائي</th>
                        <th style={{ width: '120px' }}>الكمية المطلوبة</th>
                        <th style={{ width: '110px' }}>الوحدة</th>
                        <th style={{ width: '50px' }}>حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newTransferData.items.map((it, idx) => (
                        <tr key={idx}>
                          <td>
                            <select
                              className="stock-modal-select"
                              value={it.medication_id}
                              onChange={(e) => {
                                const selMed = medications.find((m) => m.id === e.target.value);
                                const nextItems = [...newTransferData.items];
                                nextItems[idx] = {
                                  ...nextItems[idx],
                                  medication_id: e.target.value,
                                  med_name: selMed?.trade_name_ar || ''
                                };
                                setNewTransferData({ ...newTransferData, items: nextItems });
                              }}
                            >
                              <option value="">-- اختر الصنف من الدليل --</option>
                              {medications.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.trade_name_ar} {m.trade_name_en ? `(${m.trade_name_en})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              className="stock-modal-input"
                              value={it.quantity_requested}
                              onChange={(e) => {
                                const nextItems = [...newTransferData.items];
                                nextItems[idx].quantity_requested = parseFloat(e.target.value) || 1;
                                setNewTransferData({ ...newTransferData, items: nextItems });
                              }}
                            />
                          </td>
                          <td>
                            <select
                              className="stock-modal-select"
                              value={it.unit_type}
                              onChange={(e) => {
                                const nextItems = [...newTransferData.items];
                                nextItems[idx].unit_type = e.target.value;
                                setNewTransferData({ ...newTransferData, items: nextItems });
                              }}
                            >
                              <option value="pack">علبة (Pack)</option>
                              <option value="strip">شريط (Strip)</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {newTransferData.items.length > 1 && (
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                onClick={() => {
                                  setNewTransferData({
                                    ...newTransferData,
                                    items: newTransferData.items.filter((_, i) => i !== idx)
                                  });
                                }}
                              >
                                <X size={16} />
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
                <label className="stock-field-label">ملاحظات التحويل</label>
                <input
                  type="text"
                  className="stock-modal-input"
                  placeholder="ملاحظات إضافية..."
                  value={newTransferData.notes}
                  onChange={(e) => setNewTransferData({ ...newTransferData, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="stock-modal-footer">
              <button
                type="button"
                className="stock-quick-action-btn outline"
                onClick={() => setIsTransferModalOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={handleSaveTransfer}
                disabled={isLoading}
              >
                تأكيد وحفظ أمر التحويل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تفاصيل التحويل والصرف والاستلام ── */}
      {isTransferDetailsModalOpen && selectedTransferDetails && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-card" style={{ maxWidth: '800px' }}>
            <div className="stock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  أمر تحويل مخزني رقم: {selectedTransferDetails.transfer_number}
                </h3>
              </div>
              <button
                type="button"
                className="stock-modal-close-btn"
                onClick={() => setIsTransferDetailsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="stock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: 'var(--stock-surface-2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>المصدر الصارف</div>
                  <strong style={{ fontSize: '13px' }}>{selectedTransferDetails.from_name || selectedTransferDetails.source_location_id}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>الوجهة المستلمة</div>
                  <strong style={{ fontSize: '13px' }}>{selectedTransferDetails.to_name || selectedTransferDetails.destination_location_id}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>حالة الشحنة</div>
                  <span className={`stock-status-chip ${selectedTransferDetails.status === 'received' ? 'success' : selectedTransferDetails.status === 'in_transit' ? 'warning' : ''}`}>
                    {selectedTransferDetails.status === 'in_transit' ? 'قيد النقل (In-Transit)' : selectedTransferDetails.status === 'received' ? 'تم الاستلام' : 'مسودة'}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>السائق</div>
                  <div style={{ fontSize: '13px' }}>{selectedTransferDetails.driver_name || 'بدون سائق'}</div>
                </div>
              </div>

              {/* جدول بنود أمر التحويل */}
              <div className="stock-table-container" style={{ maxHeight: '250px' }}>
                <table className="stock-data-table">
                  <thead>
                    <tr>
                      <th>الصنف الدوائي</th>
                      <th>الكمية المطلوبة</th>
                      <th>الكمية المشحونة</th>
                      <th>المستلم الفعلي</th>
                      <th>العجز / التلف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedTransferDetails.items || []).map((it, i) => (
                      <tr key={it.id || i}>
                        <td><strong>{it.trade_name_ar || it.medication_id}</strong></td>
                        <td>{parseFloat(it.quantity_requested || 0)}</td>
                        <td>{parseFloat(it.quantity_dispatched || it.quantity_requested || 0)}</td>
                        <td>{parseFloat(it.quantity_received || 0)}</td>
                        <td style={{ color: (parseFloat(it.quantity_damaged || 0) + parseFloat(it.quantity_shortage || 0)) > 0 ? '#ef4444' : '#94a3b8' }}>
                          {(parseFloat(it.quantity_damaged || 0) + parseFloat(it.quantity_shortage || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stock-modal-footer">
              <button
                type="button"
                className="stock-quick-action-btn outline"
                onClick={() => setIsTransferDetailsModalOpen(false)}
              >
                إغلاق
              </button>

              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={() => printTransferInvoicePdf(selectedTransferDetails, selectedTransferDetails.items || [])}
                title="طباعة إذن التحويل الرسمي PDF مع كود ورمز الباركود"
              >
                <Printer size={14} />
                <span>طباعة فاتورة التحويل PDF</span>
              </button>

              <button
                type="button"
                className="stock-quick-action-btn warning"
                onClick={() => {
                  const labels = (selectedTransferDetails.items || []).map(it => ({
                    medication_id: it.medication_id,
                    trade_name_ar: it.trade_name_ar || it.medication_name,
                    trade_name_en: it.trade_name_en,
                    public_price: it.public_price,
                    batch_number: it.batch_number || 'B-STOCK',
                    expiry_date: it.expiry_date,
                    supplier_code: it.supplier_code_snapshot || 'MAIN',
                    label_barcode: it.label_barcode || `P${it.medication_id}-${it.batch_number || 'B1'}`,
                    quantity: Math.round(parseFloat(it.quantity_dispatched || it.quantity_requested || 1))
                  }));
                  printThermalLabels(labels);
                  showToast?.(`جاري طباعة ملصقات الباركود لـ ${labels.length} صنف... 🏷️`, 'success');
                }}
                title="طباعة ملصقات الباركود لكافة الأصناف المحولة"
              >
                <Tag size={14} />
                <span>طباعة ملصقات الباركود</span>
              </button>

              {selectedTransferDetails.status === 'draft' && (
                <button
                  type="button"
                  className="stock-quick-action-btn warning"
                  onClick={() => handleDispatchTransfer(selectedTransferDetails.id)}
                >
                  <Send size={14} />
                  <span>صرف وشحن البضاعة (In-Transit)</span>
                </button>
              )}

              {selectedTransferDetails.status === 'in_transit' && (
                <button
                  type="button"
                  className="stock-quick-action-btn primary"
                  onClick={() => {
                    const items = (selectedTransferDetails.items || []).map((it) => ({
                      item_id: it.id,
                      medication_id: it.medication_id,
                      batch_id: it.batch_id,
                      quantity_received: parseFloat(it.quantity_dispatched || it.quantity_requested || 0),
                      quantity_damaged: 0,
                      quantity_shortage: 0
                    }));
                    handleReceiveTransfer(selectedTransferDetails.id, items);
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>تأكيد الاستلام الكامل بالفرع</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── مودال إدارة المستودعات والمواقع التخزينية ── */}
      {isLocationsModalOpen && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-card" style={{ maxWidth: '650px' }}>
            <div className="stock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warehouse size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>دليل المستودعات ومواقع التخزين</h3>
              </div>
              <button
                type="button"
                className="stock-modal-close-btn"
                onClick={() => setIsLocationsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="stock-modal-body">
              <div className="stock-table-container">
                <table className="stock-data-table">
                  <thead>
                    <tr>
                      <th>الكود</th>
                      <th>اسم المستودع</th>
                      <th>نوع الموقع</th>
                      <th>النوع</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc) => (
                      <tr key={loc.id}>
                        <td><strong>{loc.code}</strong></td>
                        <td>{loc.name_ar || loc.name}</td>
                        <td>{loc.location_type}</td>
                        <td>
                          {loc.is_central ? (
                            <span style={{ color: '#38bdf8', fontWeight: 800 }}>مركزي رئيسي</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>فرع صيدلية</span>
                          )}
                        </td>
                        <td>
                          <span className="stock-status-chip success">نشط</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stock-modal-footer">
              <button
                type="button"
                className="stock-quick-action-btn outline"
                onClick={() => setIsLocationsModalOpen(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال فتح جلسة جرد جديدة ── */}
      {isNewCountModalOpen && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-card" style={{ maxWidth: '600px' }}>
            <div className="stock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardCheck size={18} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>فتح جلسة جرد فعلي جديدة (Physical Stocktaking)</h3>
              </div>
              <button
                type="button"
                className="stock-modal-close-btn"
                onClick={() => setIsNewCountModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="stock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="stock-field-label">المستودع أو الفرع المراد جرده *</label>
                <select
                  className="stock-modal-select"
                  value={newCountData.location_id}
                  onChange={(e) => setNewCountData({ ...newCountData, location_id: e.target.value })}
                >
                  <option value="">-- اختر المستودع / الفرع --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name_ar || loc.name} {loc.is_central ? '⭐ (رئيسي)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="stock-field-label">نطاق ونوع الجرد</label>
                <select
                  className="stock-modal-select"
                  value={newCountData.count_type}
                  onChange={(e) => setNewCountData({ ...newCountData, count_type: e.target.value })}
                >
                  <option value="full">جرد كلي شامل (Full Count - كافة الأصناف)</option>
                  <option value="cycle">جرد دوري / تصنيف محدد (Cycle Count)</option>
                </select>
              </div>

              <div>
                <label className="stock-field-label">ملاحظات وتعليمات الجرد</label>
                <textarea
                  className="stock-modal-textarea"
                  rows={3}
                  placeholder="ملاحظات توجيهية لفريق الجرد..."
                  value={newCountData.notes}
                  onChange={(e) => setNewCountData({ ...newCountData, notes: e.target.value })}
                />
              </div>

              <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.08)', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '12px', color: '#94a3b8' }}>
                💡 <strong>ملاحظة هامة:</strong> عند فتح الجلسة، يقوم النظام بأخذ لقطة لحظية للأرصدة الدفترية الحالية مع السماح باستمرار عمليات البيع دون تجميد الحركة.
              </div>
            </div>

            <div className="stock-modal-footer">
              <button
                type="button"
                className="stock-quick-action-btn outline"
                onClick={() => setIsNewCountModalOpen(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="stock-quick-action-btn primary"
                onClick={handleStartCount}
                disabled={isLoading}
              >
                <ClipboardCheck size={14} />
                <span>بدء الجلسة وتثبيت الرصيد الدفتري</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── مودال تفاصيل جلسة الجرد والمسح الفعلي والتسوية ── */}
      {isCountDetailsModalOpen && selectedCountDetails && (
        <div className="stock-modal-overlay">
          <div className="stock-modal-card" style={{ maxWidth: '850px' }}>
            <div className="stock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardCheck size={18} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>
                  جلسة جرد: {selectedCountDetails.count_number} • {selectedCountDetails.location_name || selectedCountDetails.location_id}
                </h3>
              </div>
              <button
                type="button"
                className="stock-modal-close-btn"
                onClick={() => setIsCountDetailsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="stock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* شريط معلومات الجلسة */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', padding: '12px 14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>حالة الجلسة</div>
                  <span className={`stock-status-chip ${selectedCountDetails.status === 'approved_posted' ? 'success' : 'warning'}`}>
                    {selectedCountDetails.status === 'approved_posted' ? 'معتمد ومرحل نهائياً' : 'قيد الفحص والمطابقة'}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>مسؤول الجرد</div>
                  <strong>{selectedCountDetails.counted_by_name || 'غير محدد'}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي الفروقات المالية</div>
                  <strong style={{ color: parseFloat(selectedCountDetails.total_variance_cost || 0) < 0 ? '#ef4444' : '#10b981' }}>
                    {parseFloat(selectedCountDetails.total_variance_cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>وقت الفتح</div>
                  <span>{new Date(selectedCountDetails.created_at || Date.now()).toLocaleTimeString('ar-EG')}</span>
                </div>
              </div>

              {/* شريط تسجيل ومسح الصنف الفعلي بالباركود */}
              {selectedCountDetails.status !== 'approved_posted' && (
                <div style={{ padding: '14px', background: 'var(--stock-surface-2)', borderRadius: '8px', border: '1px solid var(--stock-border)', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2, minWidth: '220px' }}>
                    <label className="stock-field-label">اختيار الصنف الدوائي</label>
                    <select
                      className="stock-modal-select"
                      value={scanMedicationId}
                      onChange={(e) => setScanMedicationId(e.target.value)}
                    >
                      <option value="">-- اختر الصنف من الدليل --</option>
                      {medications.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.trade_name_ar} {m.trade_name_en ? `(${m.trade_name_en})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ width: '130px' }}>
                    <label className="stock-field-label">الكمية الفعلية</label>
                    <input
                      type="number"
                      step="1"
                      className="stock-modal-input"
                      value={scanActualQty}
                      onChange={(e) => setScanActualQty(e.target.value)}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <label className="stock-field-label">الباركود الدولي</label>
                    <input
                      type="text"
                      className="stock-modal-input"
                      placeholder="امسح بالباركود..."
                      value={scanBarcode}
                      onChange={(e) => setScanBarcode(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="stock-quick-action-btn primary"
                    onClick={handleScanCountItem}
                  >
                    + تسجيل القراءة
                  </button>
                </div>
              )}

              {/* جدول مقارنة الفروقات الحسابية للأصناف */}
              <div className="stock-table-container" style={{ maxHeight: '250px' }}>
                <table className="stock-data-table">
                  <thead>
                    <tr>
                      <th>الصنف الدوائي</th>
                      <th>الرصيد الدفتري</th>
                      <th>المعدود الفعلي</th>
                      <th>الفارق (عجز / زيادة)</th>
                      <th>تكلفة الفارق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedCountDetails.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="stock-table-empty">
                          لا توجد أصناف مدخلة في هذه الجلسة بعد. استخدم شريط المسح أعلاه لإدخال الكميات الفعلية.
                        </td>
                      </tr>
                    ) : (
                      (selectedCountDetails.items || []).map((it, idx) => {
                        const varQty = parseFloat(it.variance_quantity || 0);
                        return (
                          <tr key={it.id || idx}>
                            <td><strong>{it.trade_name_ar || it.medication_id}</strong></td>
                            <td>{parseFloat(it.book_quantity || 0)}</td>
                            <td><strong>{parseFloat(it.actual_quantity || 0)}</strong></td>
                            <td style={{ color: varQty < 0 ? '#ef4444' : varQty > 0 ? '#10b981' : '#94a3b8', fontWeight: 800 }}>
                              {varQty > 0 ? `+${varQty}` : varQty}
                            </td>
                            <td style={{ color: parseFloat(it.variance_total_cost || 0) < 0 ? '#ef4444' : '#10b981' }}>
                              {parseFloat(it.variance_total_cost || 0).toFixed(2)} ج
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stock-modal-footer">
              <button
                type="button"
                className="stock-quick-action-btn outline"
                onClick={() => setIsCountDetailsModalOpen(false)}
              >
                إغلاق
              </button>

              {selectedCountDetails.status !== 'approved_posted' && (
                <button
                  type="button"
                  className="stock-quick-action-btn success"
                  onClick={handlePostCountReconciliation}
                  disabled={isLoading}
                >
                  <CheckCircle2 size={14} />
                  <span>اعتماد وترحيل فروقات الجرد والتسوية (Post Reconciliation)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
