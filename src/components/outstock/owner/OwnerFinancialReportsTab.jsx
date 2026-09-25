import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  PackageCheck,
  AlertTriangle,
  Clock,
  Building2,
  FileSpreadsheet,
  Printer,
  Calendar,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  User,
  CheckCircle,
  HelpCircle,
  ShieldCheck,
  BarChart3
} from 'lucide-react';
import { outstockGetFinancialReports, outstockGetBranches } from '../../../utils/outstockApiClient';

/**
 * OwnerFinancialReportsTab.jsx
 * شاشة المالك: متابعة التقارير المالية المركزية لمنظومة النواقص والمبيعات
 * - متابعة مبيعات الطلبات المسلمة والتحصيل اليومي
 * - متابعة العربونات المحصلة مسبقاً للطلبات النشطة
 * - متابعة الطلبات قيد التوفير والمتبقي للتحصيل
 * - رادار خسارة مبالغ الأصناف غير المتوفرة ونواقص السوق
 * - مصفوفة أداء الفروع وسجل التحصيلات اللحظية
 */
export default function OwnerFinancialReportsTab({ showToast = alert }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [dateRangeType, setDateRangeType] = useState('month'); // 'today' | 'week' | 'month' | 'custom'
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // جلب قائمة الفروع
  useEffect(() => {
    outstockGetBranches().then((res) => {
      if (res?.success && Array.isArray(res.branches)) {
        setBranches(res.branches);
      }
    }).catch(() => {});
  }, []);

  // احتساب التواريخ
  const calculateDates = () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (dateRangeType === 'today') {
      return { fromDate: todayStr, toDate: todayStr };
    }
    if (dateRangeType === 'week') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      return { fromDate: past.toISOString().slice(0, 10), toDate: todayStr };
    }
    if (dateRangeType === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { fromDate: firstDay.toISOString().slice(0, 10), toDate: todayStr };
    }
    return { fromDate: customFromDate || null, toDate: customToDate || null };
  };

  // جلب البيانات المالية
  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const { fromDate, toDate } = calculateDates();
      const res = await outstockGetFinancialReports({
        branchId: selectedBranch !== 'all' ? selectedBranch : null,
        fromDate,
        toDate
      });

      if (res?.success) {
        setReportData(res);
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر جلب التقارير المالية'}`);
      }
    } catch (err) {
      console.warn('Financial reports fetch error:', err);
      showToast?.(`❌ خطأ: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [selectedBranch, dateRangeType]);

  // الاستماع لأحداث التسليم وتحديث التقارير اللحظية
  useEffect(() => {
    const handleRefresh = () => fetchReports();
    window.addEventListener('outstock:order_delivered', handleRefresh);
    window.addEventListener('outstock:sale_recorded', handleRefresh);
    return () => {
      window.removeEventListener('outstock:order_delivered', handleRefresh);
      window.removeEventListener('outstock:sale_recorded', handleRefresh);
    };
  }, []);

  // تصدير كشف إكسل مبسط
  const handleExportCsv = () => {
    if (!reportData?.branchMatrix) return;

    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    csvContent += 'الفرع,إجمالي الطلبات,الطلبات المسلمة,المبيعات المسلمة (ج.م),العربونات المحصلة (ج.م),المتبقي للتحصيل (ج.م),مبيعات مفقودة لنواقص السوق (ج.م),نسبة التحصيل %\n';

    reportData.branchMatrix.forEach((b) => {
      csvContent += `"${b.branch_name}",${b.total_orders},${b.delivered_orders},${b.delivered_sales.toFixed(2)},${b.active_deposits.toFixed(2)},${b.pending_amount.toFixed(2)},${b.lost_revenue.toFixed(2)},${b.collection_rate}%\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_report_outstock_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast?.('✅ تم تصدير التقرير المالي بنجاح.');
  };

  // طباعة التقرير
  const handlePrint = () => {
    window.print();
  };

  const kpis = reportData?.kpis || {
    deliveredSales: 0,
    deliveredOrdersCount: 0,
    deliveredDiscounts: 0,
    activeDeposits: 0,
    pendingPipeline: 0,
    pendingRemaining: 0,
    activeOrdersCount: 0,
    lostRevenue: 0,
    lostItemsCount: 0
  };

  return (
    <div className="outstock-tab-container" style={{ direction: 'rtl', padding: '16px' }}>
      {/* ── الرأس وفلاتر التقرير ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '20px 24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
              }}
            >
              <BarChart3 size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>
                التقارير المالية والأرباح المركزية
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                متابعة مبيعات الفروع، الإيرادات المحصلة، العربونات، وتحليلات نزيف المبيعات للأصناف غير المتوفرة
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleExportCsv}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                borderRadius: '8px',
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <FileSpreadsheet size={16} color="#059669" />
              <span>تصدير إكسل</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                borderRadius: '8px',
                background: '#f8fafc',
                color: '#334155',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <Printer size={16} />
              <span>طباعة كشف</span>
            </button>

            <button
              type="button"
              onClick={fetchReports}
              disabled={isLoading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 14px',
                borderRadius: '8px',
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={15} className={isLoading ? 'outstock-spin' : ''} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* أشرطة الفلترة حسب الفرع والفترة الزمنية */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginTop: '18px',
            paddingTop: '16px',
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap'
          }}
        >
          {/* فلتر الفروع */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={16} color="#64748b" />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>الفرع:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                background: '#ffffff',
                fontWeight: '600'
              }}
            >
              <option value="all">كافة الفروع والصيدليات</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* فلتر الفترة الزمنية */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} color="#64748b" />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>الفترة:</span>
            {[
              { id: 'today', label: 'اليوم' },
              { id: 'week', label: 'آخر 7 أيام' },
              { id: 'month', label: 'هذا الشهر' },
              { id: 'custom', label: 'مخصص' }
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDateRangeType(p.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: dateRangeType === p.id ? '#059669' : '#cbd5e1',
                  background: dateRangeType === p.id ? '#ecfdf5' : '#ffffff',
                  color: dateRangeType === p.id ? '#059669' : '#475569',
                  fontWeight: dateRangeType === p.id ? '700' : '500',
                  fontSize: '12.5px',
                  cursor: 'pointer'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {dateRangeType === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>إلى</span>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={fetchReports}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                تطبيق
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── بطاقات المؤشرات المالية الرئيسية (Financial KPI Cards) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        {/* 1. مبيعات الطلبات المسلمة */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>
              إجمالي مبيعات الطلبات المسلمة
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PackageCheck size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#047857' }}>
              {kpis.deliveredSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              من إجمالي <strong>{kpis.deliveredOrdersCount}</strong> طلب مسلّم ومكتمل للعميل
            </div>
          </div>
        </div>

        {/* 2. العربونات المحصلة مسبقاً */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>
              العربونات المحصلة (أدراج الفروع)
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#f0f9ff',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CreditCard size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#0284c7' }}>
              {kpis.activeDeposits.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              تم استلامها مسبقاً لـ <strong>{kpis.activeOrdersCount}</strong> طلب نشط قيد التوفير
            </div>
          </div>
        </div>

        {/* 3. إجمالي قيمة الطلبات قيد التوفير والمتبقي */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '18px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>
              المتبقي للتحصيل عند التسليم
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fffbeb',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clock size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#d97706' }}>
              {kpis.pendingRemaining.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              إجمالي قيمة الطلبات المعلقة: <strong>{kpis.pendingPipeline.toFixed(2)} ج.م</strong>
            </div>
          </div>
        </div>

        {/* 4. نزيف المبيعات للأصناف غير المتوفرة */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            padding: '18px',
            border: '1.5px solid #fecaca',
            boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>
              خسارة مبيعات نواقص السوق
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={20} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: '#dc2626' }}>
              {kpis.lostRevenue.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px' }}>ج.م</span>
            </div>
            <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px' }}>
              بسبب <strong>{kpis.lostItemsCount}</strong> صنف غير متوفر أو ملغي بالطلبات
            </div>
          </div>
        </div>
      </div>

      {/* ── مصفوفة مقارنة الفروع المالية (Branch Matrix Table) ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={18} color="#0284c7" />
            <span>مصفوفة المقارنة المالية للفروع والصيدليات:</span>
          </h3>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            مرتبة حسب أعلى الفروع تحقيقاً للإيرادات المسلمة
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px' }}>اسم الفرع</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>الطلبات المسلمة</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>المبيعات المسلمة</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>العربونات المحصلة</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>المتبقي للتحصيل</th>
                <th style={{ padding: '10px 14px', textAlign: 'left' }}>نزيف نواقص السوق</th>
                <th style={{ padding: '10px 14px', textAlign: 'center' }}>نسبة التحصيل</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(reportData?.branchMatrix) && reportData.branchMatrix.length > 0 ? (
                reportData.branchMatrix.map((b) => (
                  <tr key={b.branch_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '700', color: '#1e293b' }}>
                      {b.branch_name}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '600' }}>
                      <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '6px' }}>
                        {b.delivered_orders} / {b.total_orders}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '800', color: '#047857' }}>
                      {b.delivered_sales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#0284c7' }}>
                      {b.active_deposits.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '600', color: '#d97706' }}>
                      {b.pending_amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: '700', color: '#dc2626' }}>
                      {b.lost_revenue > 0 ? `${b.lost_revenue.toFixed(2)} ج.م` : '0.00'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '800' }}>
                      <span
                        style={{
                          color: b.collection_rate >= 80 ? '#059669' : b.collection_rate >= 50 ? '#d97706' : '#dc2626',
                          background: b.collection_rate >= 80 ? '#f0fdf4' : b.collection_rate >= 50 ? '#fffbeb' : '#fef2f2',
                          padding: '3px 10px',
                          borderRadius: '8px'
                        }}
                      >
                        {b.collection_rate}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                    لا توجد بيانات مسجلة للفترة المختارة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── شبكة سفلية: رادار الأصناف الأكثر نزيفاً للإيراد + سجل التحصيلات اللحظية ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        {/* أ) رادار الأصناف الأكثر خسارة للمبيعات */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="#dc2626" />
              <span>أعلى 10 أصناف تسببت في نزيف الإيرادات (نواقص السوق):</span>
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#fef2f2', color: '#991b1b', textAlign: 'right' }}>
                  <th style={{ padding: '8px 10px' }}>اسم الصنف</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>الكمية المفقودة</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>متوسط السعر</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>إجمالي الخسارة</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(reportData?.topLostItems) && reportData.topLostItems.length > 0 ? (
                  reportData.topLostItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px', fontWeight: '700', color: '#1e293b' }}>
                        {item.medication_name}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 'bold', color: '#dc2626' }}>
                        {item.total_lost_qty}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'left', color: '#64748b' }}>
                        {item.avg_price.toFixed(2)} ج.م
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'left', fontWeight: '800', color: '#b91c1c' }}>
                        {item.total_lost_amount.toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                      لا توجد أصناف غير متوفرة مسجلة بالفترة المختارة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ب) سجل آخر عمليات التسليم والتحصيل المسجلة بالفروع */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#047857', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} color="#059669" />
              <span>آخر عمليات التسليم والتحصيل المسجلة بالفروع:</span>
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f0fdf4', color: '#166534', textAlign: 'right' }}>
                  <th style={{ padding: '8px 10px' }}>الفرع</th>
                  <th style={{ padding: '8px 10px' }}>العميل</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>المحصل الآن</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>طريقة الدفع</th>
                  <th style={{ padding: '8px 10px' }}>الكاشير</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(reportData?.recentSales) && reportData.recentSales.length > 0 ? (
                  reportData.recentSales.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: '600', color: '#334155' }}>
                        {s.branch_name || s.branch_id}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#1e293b' }}>
                        {s.customer_name || 'عميل نقدي'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', color: '#047857' }}>
                        {parseFloat(s.net_collected_now || s.remaining_collected || 0).toFixed(2)} ج.م
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background:
                              s.payment_method === 'cash'
                                ? '#ecfdf5'
                                : s.payment_method === 'card'
                                ? '#eff6ff'
                                : '#faf5ff',
                            color:
                              s.payment_method === 'cash'
                                ? '#059669'
                                : s.payment_method === 'card'
                                ? '#2563eb'
                                : '#9333ea'
                          }}
                        >
                          {s.payment_method === 'cash'
                            ? 'نقدي'
                            : s.payment_method === 'card'
                            ? 'فيزا'
                            : s.payment_method === 'wallet'
                            ? 'محفظة'
                            : 'آجل'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>
                        {s.collected_by || 'الصيدلي'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
                      لا توجد عمليات تحصيل مسجلة بالفترة
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
