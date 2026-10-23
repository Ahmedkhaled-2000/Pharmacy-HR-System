import React, { useState, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  calculateShiftReports,
  calculateDailySalesJournal,
  calculateItemizedSales,
  calculateHourlyTraffic,
  calculateSecurityAudit,
  calculateCashierKpis,
  exportPosReportToExcel,
  formatThermalShiftReport
} from '../../utils/posReportsEngine';
import { getLocalAuditLogs } from '../../utils/posAuditLogger';
import {
  FileText,
  Clock,
  ShoppingCart,
  ShieldAlert,
  RotateCcw,
  TrendingUp,
  Download,
  Printer,
  Calendar,
  User,
  Building2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  Zap
} from 'lucide-react';

export default function PosReportsCenter({ isOpen, onClose }) {
  const { currentShift, productsCatalog } = usePOS();
  const { currentBranch, currentEmpUser } = useAuth?.() || {};
  const { state } = useData?.() || {};

  const [activeTab, setActiveTab] = useState('shifts'); // 'shifts' | 'sales' | 'items' | 'traffic' | 'security' | 'returns' | 'kpis'
  const [selectedBranch, setSelectedBranch] = useState(currentBranch?.id || 'all');
  const [selectedCashier, setSelectedCashier] = useState('all');
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  const [customFrom, setCustomFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // نافذة معاينة الطباعة الحرارية 80mm
  const [thermalPreviewText, setThermalPreviewText] = useState(null);

  // تحميل البيانات الحية من التخزين المحلي
  const allSales = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isOpen]);

  const allReturns = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_returns');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isOpen]);

  const allAuditLogs = useMemo(() => {
    return getLocalAuditLogs();
  }, [isOpen]);

  // تجهيز نطاق التاريخ
  const filterParams = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let dateFrom = today;
    let dateTo = today;

    if (dateFilter === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      dateFrom = y.toISOString().slice(0, 10);
      dateTo = dateFrom;
    } else if (dateFilter === 'week') {
      const w = new Date();
      w.setDate(w.getDate() - 7);
      dateFrom = w.toISOString().slice(0, 10);
    } else if (dateFilter === 'month') {
      dateFrom = today.slice(0, 7) + '-01';
    } else if (dateFilter === 'custom') {
      dateFrom = customFrom;
      dateTo = customTo;
    }

    return {
      branchId: selectedBranch,
      cashierEmpCode: selectedCashier,
      dateFrom,
      dateTo,
      search: searchQuery.trim()
    };
  }, [selectedBranch, selectedCashier, dateFilter, customFrom, customTo, searchQuery]);

  // حسابات التقارير المختلفة
  const shiftReportData = useMemo(() => {
    return calculateShiftReports(allSales, currentShift, allReturns, allAuditLogs, filterParams);
  }, [allSales, currentShift, allReturns, allAuditLogs, filterParams]);

  const dailySalesJournal = useMemo(() => {
    return calculateDailySalesJournal(allSales, filterParams);
  }, [allSales, filterParams]);

  const itemizedSales = useMemo(() => {
    return calculateItemizedSales(allSales, filterParams);
  }, [allSales, filterParams]);

  const hourlyTraffic = useMemo(() => {
    return calculateHourlyTraffic(allSales, filterParams);
  }, [allSales, filterParams]);

  const securityAuditLogs = useMemo(() => {
    return calculateSecurityAudit(allAuditLogs, filterParams);
  }, [allAuditLogs, filterParams]);

  const cashierKpis = useMemo(() => {
    return calculateCashierKpis(allSales, state?.employees || [], filterParams);
  }, [allSales, state?.employees, filterParams]);

  if (!isOpen) return null;

  // معالجة تصدير الإكسيل التلقائي بحسب التبويب النشط
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      if (activeTab === 'shifts') {
        await exportPosReportToExcel({
          reportTitle: `تقرير الوردية وحركة الدرج - ${shiftReportData.branchName}`,
          fileName: `تقرير-الوردية-والدرج`,
          columns: [
            { header: 'البيان', key: 'label', width: 30, align: 'right' },
            { header: 'القيمة (ج.م)', key: 'value', width: 20, align: 'center' }
          ],
          rows: [
            { label: 'رصيد بداية الدرج (العهدة)', value: shiftReportData.openingCash.toFixed(2) },
            { label: 'إجمالي المبيعات النقدية (Cash)', value: shiftReportData.cashSales.toFixed(2) },
            { label: 'مبيعات بطاقات الائتمان (Visa)', value: shiftReportData.cardSales.toFixed(2) },
            { label: 'محافظ إلكترونية وإنستاباي', value: (shiftReportData.instapaySales + shiftReportData.vodafoneCashSales).toFixed(2) },
            { label: 'صافي مبيعات الوردية بالكامل', value: shiftReportData.totalSalesNet.toFixed(2) },
            { label: 'المرتجعات النقدية من الدرج', value: shiftReportData.totalReturnsCash.toFixed(2) },
            { label: 'مصروفات نثرية سريعة', value: shiftReportData.pettyExpenses.toFixed(2) },
            { label: 'توريدات للخزنة (Safe Drops)', value: shiftReportData.safeDrops.toFixed(2) },
            { label: 'النقدية المحسوبة المفترضة بالدرج', value: shiftReportData.expectedCashInDrawer.toFixed(2) },
            { label: 'الجرد الفعلي للكاشير (التقفيل الأعمى)', value: shiftReportData.countedCash !== null ? shiftReportData.countedCash.toFixed(2) : 'وردية جارية' },
            { label: 'فارق الدرج (عجز / زيادة)', value: shiftReportData.cashDifference.toFixed(2) }
          ]
        });
      } else if (activeTab === 'sales') {
        await exportPosReportToExcel({
          reportTitle: `شريط المبيعات الكرونولوجي اليومي`,
          fileName: `شريط-المبيعات-اليومي`,
          columns: [
            { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 16 },
            { header: 'الوقت', key: 'time', width: 14 },
            { header: 'كود البائع', key: 'cashierEmpCode', width: 14 },
            { header: 'اسم الصيدلي', key: 'cashierEmpName', width: 22 },
            { header: 'اسم العميل', key: 'customerName', width: 20 },
            { header: 'عدد الأصناف', key: 'itemsCount', width: 12 },
            { header: 'طريقة الدفع', key: 'paymentMethod', width: 14 },
            { header: 'الخصم', key: 'discountAmount', width: 12 },
            { header: 'صافي الفاتورة', key: 'netTotal', width: 16 }
          ],
          rows: dailySalesJournal.map((s) => ({
            ...s,
            time: new Date(s.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          }))
        });
      } else if (activeTab === 'items') {
        await exportPosReportToExcel({
          reportTitle: `تقرير مبيعات الأصناف وتجزئة العلب والشرائط`,
          fileName: `مبيعات-الأصناف-التفصيلي`,
          columns: [
            { header: 'اسم الصنف', key: 'tradeNameAr', width: 28 },
            { header: 'الباركود', key: 'barcode', width: 16 },
            { header: 'الوحدة المباعة', key: 'unitLabel', width: 14 },
            { header: 'سعر الوحدة', key: 'unitPrice', width: 14 },
            { header: 'الكمية المباعة', key: 'totalQuantitySold', width: 14 },
            { header: 'إجمالي المبيعات', key: 'totalRevenue', width: 16 },
            { header: 'مجمل الربح', key: 'totalProfit', width: 16 }
          ],
          rows: itemizedSales
        });
      } else if (activeTab === 'security') {
        await exportPosReportToExcel({
          reportTitle: `سجل الرقابة الأمنية ورادار التلاعب بالكاشير`,
          fileName: `سجل-الرقابة-والتلاعب`,
          columns: [
            { header: 'التوقيت', key: 'time', width: 18 },
            { header: 'نوع الحركة الرقابية', key: 'actionType', width: 24 },
            { header: 'كود الموظف', key: 'cashierEmpCode', width: 14 },
            { header: 'اسم الموظف', key: 'cashierEmpName', width: 20 },
            { header: 'الصنف المرتبط', key: 'productName', width: 24 },
            { header: 'السبب / الملاحظات', key: 'reason', width: 30 }
          ],
          rows: securityAuditLogs.map((l) => ({
            ...l,
            time: new Date(l.timestamp).toLocaleTimeString('ar-EG') + ' ' + new Date(l.timestamp).toLocaleDateString('ar-EG')
          }))
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  // فتح معاينة وطباعة الريسيت الحراري (X-Report أو Z-Report)
  const handlePrintThermal = (isZ = false) => {
    const text = formatThermalShiftReport(shiftReportData, isZ);
    setThermalPreviewText(text);
  };

  const executeBrowserPrintThermal = () => {
    const win = window.open('', '_blank', 'width=380,height=600');
    if (!win) return;
    win.document.write(`
      <html dir="rtl">
        <head>
          <title>طباعة تقرير حراري 80mm</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 13px; font-weight: bold; padding: 10px; margin: 0; white-space: pre-wrap; line-height: 1.4; color: #000; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${thermalPreviewText}
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'rtl'
      }}
    >
      <div
        style={{
          background: 'var(--surface, #111A28)',
          border: '1.5px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: '20px',
          width: '95%',
          maxWidth: '1240px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}
      >
        {/* ── الرأس العلوي لمركز التقارير ── */}
        <div
          style={{
            padding: '16px 24px',
            background: 'linear-gradient(135deg, rgba(13,148,136,0.15) 0%, rgba(17,26,40,0.95) 100%)',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'var(--primary, #0d9488)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(13,148,136,0.4)'
              }}
            >
              <FileText size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--text, #ffffff)' }}>
                مركز تقارير نقطة البيع والرقابة الحصرية (POS-Only Reporting Hub)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #94a3b8)' }}>
                رصد حركة النقدية، الفواتير، الأصناف، إغلاق الورديات، وكشف التلاعب أمام الكاشير
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Download size={16} />
              {isExporting ? 'جاري التصدير...' : 'تصدير إكسيل (.xlsx)'}
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: 'var(--muted, #94a3b8)',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── شريط الفلاتر السريعة ── */}
        <div
          style={{
            padding: '12px 24px',
            background: 'rgba(255,255,255,0.02)',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          {/* اختيار الفرع */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={16} color="var(--primary, #0d9488)" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                background: 'var(--surface-hover, #1a2638)',
                color: 'var(--text, #ffffff)',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12.5px'
              }}
            >
              <option value="all">كل الفروع</option>
              {(state?.branches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* اختيار الفترة */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} color="var(--primary, #0d9488)" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                background: 'var(--surface-hover, #1a2638)',
                color: 'var(--text, #ffffff)',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12.5px'
              }}
            >
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">الشهر الحالي</option>
              <option value="custom">فترة مخصصة</option>
            </select>
          </div>

          {dateFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ background: '#1a2638', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' }}
              />
              <span>إلى</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ background: '#1a2638', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' }}
              />
            </div>
          )}

          {/* بحث سريع */}
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة، اسم الصنف، أو هاتف العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--surface-hover, #1a2638)',
                color: 'var(--text, #ffffff)',
                border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: '8px',
                padding: '6px 32px 6px 12px',
                fontSize: '12.5px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* ── أشرطة التبويبات السبعة ── */}
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto'
          }}
        >
          {[
            { id: 'shifts', label: 'الورديات ودرج النقدية (X/Z Report)', icon: '⏱️' },
            { id: 'sales', label: 'شريط المبيعات والفواتير', icon: '🧾' },
            { id: 'items', label: 'مبيعات الأصناف والتجزئة', icon: '💊' },
            { id: 'traffic', label: 'ساعات الذروة والكثافة', icon: '📈' },
            { id: 'security', label: 'الرقابة ورادار التلاعب (Anti-Skimming)', icon: '🛡️' },
            { id: 'kpis', label: 'كفاءة البائعين ومتوسط السلة', icon: '🎯' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary, #0d9488)' : 'rgba(255,255,255,0.05)',
                color: activeTab === tab.id ? '#ffffff' : 'var(--text, #cbd5e1)',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── محتوى التبويبات ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* 1. تقرير الوردية والدرج */}
          {activeTab === 'shifts' && (
            <div>
              {/* كروت الملخص السريع */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: 600 }}>إجمالي مبيعات الوردية</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {shiftReportData.totalSalesNet.toFixed(2)} <span style={{ fontSize: '13px' }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                    {shiftReportData.invoicesCount} فاتورة مصدرة
                  </div>
                </div>

                <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>النقدية المتوقعة بالدرج</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {shiftReportData.expectedCashInDrawer.toFixed(2)} <span style={{ fontSize: '13px' }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                    عهدة افتتاحية: {shiftReportData.openingCash.toFixed(2)} ج.م
                  </div>
                </div>

                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 600 }}>مبيعات إلكترونية (فيزا ومحافظ)</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {(shiftReportData.cardSales + shiftReportData.instapaySales + shiftReportData.vodafoneCashSales).toFixed(2)} <span style={{ fontSize: '13px' }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                    فيزا: {shiftReportData.cardSales.toFixed(2)} | إنستاباي: {shiftReportData.instapaySales.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>مرتجع ونثريات خارجة</div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    {(shiftReportData.totalReturnsCash + shiftReportData.pettyExpenses).toFixed(2)} <span style={{ fontSize: '13px' }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', marginTop: '2px' }}>
                    مرتجع: {shiftReportData.totalReturnsCash.toFixed(2)} | نثريات: {shiftReportData.pettyExpenses.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* أزرار طباعة الـ X و Z على رول حراري */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => handlePrintThermal(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    background: 'var(--surface-hover, #1e293b)',
                    color: '#ffffff',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={16} color="var(--primary, #0d9488)" />
                  طباعة قراءة الوردية اللحظية (X-Report 80mm)
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintThermal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    background: 'rgba(217,119,6,0.15)',
                    color: '#f59e0b',
                    border: '1px solid rgba(217,119,6,0.3)',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={16} color="#f59e0b" />
                  طباعة تقرير تقفيل الدرج (Z-Report 80mm)
                </button>
              </div>

              {/* تفاصيل الدرج والوسائل */}
              <div style={{ background: 'var(--surface-hover, #1a2638)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '13px' }}>البند المحاسبي للدرج</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>القيمة المالية</th>
                      <th style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '13px' }}>ملاحظات التوثيق</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>💵 رصيد بداية الدرج (العهدة الافتتاحية)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>{shiftReportData.openingCash.toFixed(2)} ج.م</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>الفكة المستلمة عند فتح الشيفت</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>🟢 إجمالي المقبوضات النقدية (Cash In)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#10b981' }}>+{shiftReportData.cashSales.toFixed(2)} ج.م</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>مبيعات نقدية دخلت الدرج فعلياً</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>🔴 إجمالي المرتجعات النقدية (Cash Out)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#ef4444' }}>-{shiftReportData.totalReturnsCash.toFixed(2)} ج.م</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>نقدية خرجت من الدرج لمرتجع عملاء</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>🧾 نثريات ومصروفات سريعة من الدرج</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#f59e0b' }}>-{shiftReportData.pettyExpenses.toFixed(2)} ج.م</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>فواتير مياه/شاي/إكراميات موثقة</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>🏦 توريدات الخزينة الفولاذية (Safe Drops)</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#8b5cf6' }}>-{shiftReportData.safeDrops.toFixed(2)} ج.م</td>
                      <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>تحويلات نقدية أثناء الشيفت لتقليل المخاطر</td>
                    </tr>
                    <tr style={{ background: 'rgba(13,148,136,0.1)', borderTop: '2px solid rgba(13,148,136,0.3)' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#0d9488' }}>💰 النقدية المحسوبة المفترض وجودها بالدرج</td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, fontSize: '16px', color: '#0d9488' }}>
                        {shiftReportData.expectedCashInDrawer.toFixed(2)} ج.م
                      </td>
                      <td style={{ padding: '14px 16px', color: '#cbd5e1', fontSize: '12px', fontWeight: 700 }}>
                        {shiftReportData.countedCash !== null
                          ? `الجرد الفعلي: ${shiftReportData.countedCash.toFixed(2)} ج.م (فارق: ${shiftReportData.cashDifference.toFixed(2)} ج.م)`
                          : 'في انتظار التقفيل الأعمى للشيفت'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. شريط المبيعات والفواتير */}
          {activeTab === 'sales' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#94a3b8' }}>
                عرض <span style={{ color: '#fff', fontWeight: 800 }}>{dailySalesJournal.length}</span> فاتورة مرتبة بالثانية والدقيقة:
              </div>
              <div style={{ background: 'var(--surface-hover, #1a2638)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>رقم الفاتورة</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>التوقيت</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>البائع (الموظف)</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>العميل</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>الأصناف</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>طريقة الدفع</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>الخصم</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySalesJournal.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                          لا توجد فواتير مطابقة لخيارات الفرز الحالية.
                        </td>
                      </tr>
                    ) : (
                      dailySalesJournal.map((sale) => (
                        <tr key={sale.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0d9488' }}>
                            #{sale.invoiceNumber}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {new Date(sale.createdAt).toLocaleTimeString('ar-EG')}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                            {sale.cashierEmpName} <span style={{ fontSize: '11px', color: '#94a3b8' }}>({sale.cashierEmpCode})</span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {sale.customerName}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {sale.itemsCount} صنف
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>
                              {sale.paymentMethod === 'cash' ? 'نقدي' : sale.paymentMethod === 'card' ? 'فيزا' : sale.paymentMethod}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: sale.discountAmount > 0 ? '#f59e0b' : '#94a3b8' }}>
                            {sale.discountAmount > 0 ? `${sale.discountAmount.toFixed(2)} ج.م` : '-'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#10b981' }}>
                            {sale.netTotal.toFixed(2)} ج.م
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. مبيعات الأصناف والتجزئة */}
          {activeTab === 'items' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#94a3b8' }}>
                تحليل حركة <span style={{ color: '#fff', fontWeight: 800 }}>{itemizedSales.length}</span> صنف بيع بوحدات مختلفة:
              </div>
              <div style={{ background: 'var(--surface-hover, #1a2638)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>اسم الصنف</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>الباركود</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>الوحدة المباعة</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>سعر الوحدة</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>الكمية المباعة</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>إجمالي الإيراد</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>مجمل الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemizedSales.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 800 }}>{it.tradeNameAr}</td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontFamily: 'monospace' }}>{it.barcode}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '6px', background: it.unitType === 'piece' ? 'rgba(245,158,11,0.15)' : it.unitType === 'sub' ? 'rgba(59,130,246,0.15)' : 'rgba(13,148,136,0.15)', color: it.unitType === 'piece' ? '#fbbf24' : it.unitType === 'sub' ? '#60a5fa' : '#2dd4bf', fontSize: '11px', fontWeight: 700 }}>
                            {it.unitLabel}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>{it.unitPrice.toFixed(2)} ج.م</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800 }}>{it.totalQuantitySold}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#10b981' }}>{it.totalRevenue.toFixed(2)} ج.م</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#38bdf8' }}>{it.totalProfit.toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. ساعات الذروة وكثافة الكاشير */}
          {activeTab === 'traffic' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#94a3b8' }}>
                توزيع ضغط الفواتير والمبيعات على مدار 24 ساعة لجدولة الصيادلة:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                {hourlyTraffic.map((h) => {
                  const hasSales = h.invoicesCount > 0;
                  return (
                    <div
                      key={h.hour}
                      style={{
                        background: hasSales ? 'rgba(13,148,136,0.1)' : 'rgba(255,255,255,0.02)',
                        border: hasSales ? '1.5px solid rgba(13,148,136,0.3)' : '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '12px 10px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{h.label}</div>
                      <div style={{ fontSize: '16px', fontWeight: 900, color: hasSales ? '#2dd4bf' : '#64748b', marginTop: '4px' }}>
                        {h.invoicesCount} فواتير
                      </div>
                      <div style={{ fontSize: '11px', color: hasSales ? '#fff' : '#475569', marginTop: '2px', fontWeight: 700 }}>
                        {h.totalSales.toFixed(0)} ج.م
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. الرقابة الأمنية ورادار التلاعب */}
          {activeTab === 'security' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                <ShieldAlert size={16} />
                سجل الحركات الحساسة (الأصناف المحذوفة بعد المسح، تعديل الأسعار، فتح الدرج بدون بيع):
              </div>
              <div style={{ background: 'var(--surface-hover, #1a2638)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>التوقيت</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>نوع الحركة الرقابية</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>الموظف المسجل</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>الصنف المرتبط</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>التفاصيل والسبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                          ✅ ممتاز! لا توجد أي مخالفات أو حركات مشبوهة مسجلة خلال الفترة المحددة.
                        </td>
                      </tr>
                    ) : (
                      securityAuditLogs.map((log) => {
                        const isLineVoid = log.actionType === 'LINE_ITEM_VOID';
                        return (
                          <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isLineVoid ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                            <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                              {new Date(log.timestamp).toLocaleTimeString('ar-EG')} {new Date(log.timestamp).toLocaleDateString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ padding: '3px 8px', borderRadius: '6px', background: isLineVoid ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: isLineVoid ? '#f87171' : '#fbbf24', fontSize: '11px', fontWeight: 800 }}>
                                {log.actionType === 'LINE_ITEM_VOID' ? 'حذف صنف بعد المسح (Skimming Radar)' : log.actionType === 'NO_SALE_DRAWER_OPEN' ? 'فتح درج بدون بيع' : log.actionType}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                              {log.cashierEmpName} ({log.cashierEmpCode})
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                              {log.productName || '-'}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                              {log.reason || 'إجراء تلقائي مرصود'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. كفاءة البائعين ومتوسط السلة */}
          {activeTab === 'kpis' && (
            <div>
              <div style={{ marginBottom: '14px', fontSize: '13px', color: '#94a3b8' }}>
                تقييم سرعة الصيادلة ومتوسط قيمة السلة (Basket Value) والأصناف لكل فاتورة (IPT):
              </div>
              <div style={{ background: 'var(--surface-hover, #1a2638)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>كود الموظف</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8' }}>اسم الصيدلي</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>عدد الفواتير</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>إجمالي المبيعات</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>متوسط الفاتورة (Basket)</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>أصناف/فاتورة (IPT)</th>
                      <th style={{ padding: '10px 14px', color: '#94a3b8', textAlign: 'center' }}>العمولات المكتسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierKpis.map((kpi) => (
                      <tr key={kpi.cashierCode} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0d9488' }}>{kpi.cashierCode}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{kpi.cashierName}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800 }}>{kpi.invoicesCount}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#10b981' }}>{kpi.totalSales.toFixed(2)} ج.م</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#38bdf8' }}>{kpi.averageBasketValue.toFixed(2)} ج.م</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#fbbf24' }}>{kpi.itemsPerTicket.toFixed(1)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: '#a855f7' }}>{kpi.totalCommissions.toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── مودال معاينة الريسيت الحراري 80mm ── */}
        {thermalPreviewText && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.85)',
              zIndex: 2600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              direction: 'rtl'
            }}
          >
            <div
              style={{
                background: '#ffffff',
                color: '#000000',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '440px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '85vh',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>معاينة الطباعة الحرارية (80mm Thermal Receipt)</h3>
                <button type="button" onClick={() => setThermalPreviewText(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  fontFamily: 'Courier New, monospace',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.45,
                  border: '1px solid #cbd5e1'
                }}
              >
                {thermalPreviewText}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={executeBrowserPrintThermal}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#0d9488',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  🖨️ إرسال أمر الطباعة للطابعة الحرارية الآن
                </button>
                <button
                  type="button"
                  onClick={() => setThermalPreviewText(null)}
                  style={{
                    padding: '10px 16px',
                    background: '#e2e8f0',
                    color: '#334155',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
