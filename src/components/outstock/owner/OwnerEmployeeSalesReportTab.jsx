import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  Users,
  Search,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
  PackageCheck,
  Clock,
  Building2,
  Phone,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Gift,
  HelpCircle,
  Eye,
  X
} from 'lucide-react';
import { outstockGetOrders, outstockGetBranches } from '../../../utils/outstockApiClient';

/**
 * OwnerEmployeeSalesReportTab.jsx
 * تقرير مبيعات وحجوزات موظفي وصيادلة الفروع - بوابة المالك والمشرف العام
 * - متابعة عدد وتفاصيل الطلبات المحجوزة لكل موظف بكوده (order_receiver_code)
 * - تتبع مبيعات وتسليمات الموظفين (delivered_by_code)
 * - إمكانية البحث بالكود، اسم الموظف، اسم العميل، والهاتف
 * - محرك حوافز وعمولات النواقص التفاعلي (Incentive Engine)
 * - لوحة شرف أفضل الصيادلة (Top Performers Leaderboard)
 */
export default function OwnerEmployeeSalesReportTab({ showToast = alert }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── الفلاتر والبحث ──
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');
  const [searchCustomerQuery, setSearchCustomerQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all'); // 'all' | 'delivered' | 'pending' | 'cancelled'
  const [dateRangeType, setDateRangeType] = useState('month'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

  // ── محرك العمولات والحوافز المخصص للمالك ──
  const [commissionType, setCommissionType] = useState('fixed'); // 'fixed' (مبلغ ثابت للطلب) | 'percentage' (نسبة من الإجمالي)
  const [commissionValue, setCommissionValue] = useState(5); // 5 ج.م افتراضياً لكل طلب مسلم
  const [showIncentivesPanel, setShowIncentivesPanel] = useState(false);

  // ── نافذة تفاصيل الطلب المحدد ──
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

  // جلب الطلبات والفروع
  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      const [ordersRes, branchRes] = await Promise.all([
        outstockGetOrders({ limit: 1000 }),
        outstockGetBranches().catch(() => null)
      ]);

      if (ordersRes?.success && Array.isArray(ordersRes.orders)) {
        setOrders(ordersRes.orders);
      }
      if (branchRes?.success && Array.isArray(branchRes.branches)) {
        setBranches(branchRes.branches);
      }
    } catch (e) {
      console.warn('Fetch employee sales report error:', e);
      showToast?.(`⚠️ خطأ في جلب بيانات التقرير: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  // تصفية الطلبات بناءً على التاريخ
  const dateFilteredOrders = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    return orders.filter((o) => {
      const orderDateStr = (o.created_at || '').slice(0, 10);
      if (!orderDateStr) return true;

      if (dateRangeType === 'today') {
        return orderDateStr === todayStr;
      }
      if (dateRangeType === 'week') {
        const past = new Date();
        past.setDate(past.getDate() - 7);
        const pastStr = past.toISOString().slice(0, 10);
        return orderDateStr >= pastStr && orderDateStr <= todayStr;
      }
      if (dateRangeType === 'month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        return orderDateStr >= firstDay && orderDateStr <= todayStr;
      }
      if (dateRangeType === 'custom') {
        if (customFromDate && orderDateStr < customFromDate) return false;
        if (customToDate && orderDateStr > customToDate) return false;
      }
      return true;
    });
  }, [orders, dateRangeType, customFromDate, customToDate]);

  // تطبيق باقي الفلاتر (الفرع، الحالة، كود الموظف، واسم العميل)
  const filteredOrders = useMemo(() => {
    return dateFilteredOrders.filter((o) => {
      // فلتر الفرع
      if (selectedBranch !== 'all' && o.branch_id !== selectedBranch) {
        return false;
      }

      // فلتر الحالة
      const status = String(o.order_status || o.orderStatus || '').toLowerCase();
      if (selectedStatusFilter === 'delivered' && status !== 'delivered') return false;
      if (selectedStatusFilter === 'cancelled' && status !== 'cancelled') return false;
      if (selectedStatusFilter === 'pending' && (status === 'delivered' || status === 'cancelled')) return false;

      // بحث بالموظف (كود الموظف أو اسمه)
      if (searchEmployeeQuery && String(searchEmployeeQuery).trim()) {
        const q = String(searchEmployeeQuery).trim().toLowerCase();
        const code = String(o.order_receiver_code || '').toLowerCase();
        const name = String(o.order_receiver_name || o.responsible_pharmacist || '').toLowerCase();
        const delCode = String(o.delivered_by_code || '').toLowerCase();
        const delName = String(o.delivered_by_name || '').toLowerCase();

        const match = code.includes(q) || name.includes(q) || delCode.includes(q) || delName.includes(q);
        if (!match) return false;
      }

      // بحث بالعميل (الاسم، الهاتف، رقم الطلب)
      if (searchCustomerQuery && String(searchCustomerQuery).trim()) {
        const q = String(searchCustomerQuery).trim().toLowerCase();
        const cName = String(o.customer_name || '').toLowerCase();
        const cPhone = String(o.customer_phone || '').toLowerCase();
        const ordNum = String(o.order_number || '').toLowerCase();

        const match = cName.includes(q) || cPhone.includes(q) || ordNum.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [dateFilteredOrders, selectedBranch, selectedStatusFilter, searchEmployeeQuery, searchCustomerQuery]);

  // ── التجميع الإحصائي لمبيعات وأداء كل موظف ──
  const employeePerformanceList = useMemo(() => {
    const map = new Map();

    filteredOrders.forEach((o) => {
      // المفتاح هو كود الموظف أو اسمه
      const empCode = o.order_receiver_code || 'بدون كود';
      const empName = o.order_receiver_name || o.responsible_pharmacist || 'صيدلي الفرع';
      const key = `${empCode}___${empName}`;

      if (!map.has(key)) {
        map.set(key, {
          code: empCode,
          name: empName,
          branchName: o.branch_name || 'الفرع',
          totalOrders: 0,
          deliveredOrders: 0,
          pendingOrders: 0,
          cancelledOrders: 0,
          totalSalesAmount: 0,
          totalDepositAmount: 0,
          deliveredSalesAmount: 0,
          itemsCount: 0,
          orders: []
        });
      }

      const entry = map.get(key);
      entry.totalOrders += 1;
      entry.orders.push(o);

      const netAmt = parseFloat(o.net_amount || o.total_amount || 0);
      const paidAmt = parseFloat(o.paid_amount || 0);
      const itemsLen = Array.isArray(o.items) ? o.items.length : 1;

      entry.totalSalesAmount += netAmt;
      entry.totalDepositAmount += paidAmt;
      entry.itemsCount += itemsLen;

      const st = String(o.order_status || o.orderStatus || '').toLowerCase();
      if (st === 'delivered') {
        entry.deliveredOrders += 1;
        entry.deliveredSalesAmount += netAmt;
      } else if (st === 'cancelled') {
        entry.cancelledOrders += 1;
      } else {
        entry.pendingOrders += 1;
      }
    });

    const list = Array.from(map.values()).map((emp) => {
      const conversionRate = emp.totalOrders > 0 ? Math.round((emp.deliveredOrders / emp.totalOrders) * 100) : 0;
      const avgOrderValue = emp.totalOrders > 0 ? Math.round(emp.totalSalesAmount / emp.totalOrders) : 0;

      // احتساب العمولة المستحقة
      let commissionEarned = 0;
      if (commissionType === 'fixed') {
        commissionEarned = emp.deliveredOrders * (parseFloat(commissionValue) || 0);
      } else {
        commissionEarned = (emp.deliveredSalesAmount * (parseFloat(commissionValue) || 0)) / 100;
      }

      return {
        ...emp,
        conversionRate,
        avgOrderValue,
        commissionEarned
      };
    });

    // الترتيب حسب أعلى عدد طلبات محجوزة ثم أعلى مبيعات
    return list.sort((a, b) => b.deliveredOrders - a.deliveredOrders || b.totalSalesAmount - a.totalSalesAmount);
  }, [filteredOrders, commissionType, commissionValue]);

  // إجمالي الإحصائيات العامة
  const overallStats = useMemo(() => {
    let totalBooked = filteredOrders.length;
    let totalDelivered = 0;
    let totalSales = 0;
    let totalDeposits = 0;

    filteredOrders.forEach((o) => {
      const net = parseFloat(o.net_amount || o.total_amount || 0);
      const paid = parseFloat(o.paid_amount || 0);
      totalSales += net;
      totalDeposits += paid;
      if (String(o.order_status || o.orderStatus || '').toLowerCase() === 'delivered') {
        totalDelivered += 1;
      }
    });

    const overallFulfillmentRate = totalBooked > 0 ? Math.round((totalDelivered / totalBooked) * 100) : 0;

    return {
      totalBooked,
      totalDelivered,
      totalSales,
      totalDeposits,
      overallFulfillmentRate
    };
  }, [filteredOrders]);

  // تصدير التقرير كملف CSV
  const handleExportCSV = () => {
    if (employeePerformanceList.length === 0) {
      showToast?.('⚠️ لا توجد بيانات للتصدير في هذا التقرير');
      return;
    }

    const headers = [
      'كود الموظف',
      'اسم الموظف / الصيدلي',
      'الفرع',
      'إجمالي المحجوز',
      'الطلبات المسلمة',
      'الطلبات قيد التنفيذ',
      'الطلبات الملغاة',
      'نسبة التسليم %',
      'إجمالي المبيعات (ج.م)',
      'العربونات المحصلة (ج.م)',
      'العمولة المستحقة (ج.م)'
    ];

    const rows = employeePerformanceList.map((emp) => [
      emp.code,
      `"${emp.name}"`,
      `"${emp.branchName}"`,
      emp.totalOrders,
      emp.deliveredOrders,
      emp.pendingOrders,
      emp.cancelledOrders,
      `${emp.conversionRate}%`,
      emp.totalSalesAmount.toFixed(2),
      emp.totalDepositAmount.toFixed(2),
      emp.commissionEarned.toFixed(2)
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `تقرير_مبيعات_الموظفين_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── لوحة الشرف: أفضل 3 صيادلة حجزاً ومبيعات للنواقص ── */}
      {employeePerformanceList.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, #042f2e 0%, #0f766e 100%)',
            borderRadius: '16px',
            padding: '20px 24px',
            color: '#ffffff',
            boxShadow: '0 10px 25px -5px rgba(15, 118, 110, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px', borderRadius: '10px' }}>
                <Award size={24} color="#fef08a" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  🏆 لوحة الشرف وأبطال مبيعات النواقص بالمجموعة
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#ccfbf1', marginTop: '2px' }}>
                  ترتيب صيادلة وكاشير الفروع الأكثر إنقاذاً لبيعات الأدوية الناقصة وتحقيقاً للأرباح
                </p>
              </div>
            </div>

            <button
              type="button"
              className="outstock-btn"
              style={{
                background: showIncentivesPanel ? '#fef08a' : 'rgba(255,255,255,0.2)',
                color: showIncentivesPanel ? '#0f766e' : '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                fontSize: '12px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setShowIncentivesPanel((prev) => !prev)}
            >
              <Gift size={14} />
              <span>{showIncentivesPanel ? 'إخفاء حاسبة الحوافز' : '⚙️ ضبط حوافز وعمولات النواقص'}</span>
            </button>
          </div>

          {/* أفضل 3 موظفين */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {employeePerformanceList.slice(0, 3).map((topEmp, idx) => {
              const medalColor = idx === 0 ? '#fef08a' : idx === 1 ? '#e2e8f0' : '#fed7aa';
              const rankLabel = idx === 0 ? '🥇 المركز الأول' : idx === 1 ? '🥈 المركز الثاني' : '🥉 المركز الثالث';

              return (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: medalColor }}>
                      {rankLabel}
                    </span>
                    <span style={{ background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                      كود: {topEmp.code}
                    </span>
                  </div>

                  <strong style={{ fontSize: '15px' }}>{topEmp.name}</strong>
                  <span style={{ fontSize: '11.5px', color: '#ccfbf1' }}>🏢 {topEmp.branchName}</span>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
                    <span>سلم: <strong>{topEmp.deliveredOrders}</strong> من {topEmp.totalOrders}</span>
                    <span>المبيعات: <strong>{topEmp.deliveredSalesAmount.toFixed(0)} ج.م</strong></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* لوحة ضبط محرك الحوافز المنسدلة */}
          {showIncentivesPanel && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '16px',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px'
              }}
            >
              <div>
                <strong style={{ fontSize: '14px', display: 'block', color: '#0f766e' }}>
                  💡 محرك احتساب حوافز وعمولات النواقص للصيادلة
                </strong>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  خصص مكافأة أو عمولة لكل طلب دواء ناقص ينجح الصيدلي في حجزه وتسليمه لتحفيز عدم خروج أي عميل بدون تلبية دوائه
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={commissionType}
                  onChange={(e) => setCommissionType(e.target.value)}
                  className="outstock-form-select"
                  style={{ height: '36px', fontSize: '12.5px' }}
                >
                  <option value="fixed">مبلغ ثابت لكل طلب مسلم (ج.م)</option>
                  <option value="percentage">نسبة مئوية من قيمة المبيعات (%)</option>
                </select>

                <input
                  type="number"
                  min="0"
                  step="any"
                  value={commissionValue}
                  onChange={(e) => setCommissionValue(e.target.value)}
                  className="outstock-form-input"
                  style={{ width: '90px', height: '36px', fontWeight: 'bold' }}
                />

                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f766e' }}>
                  {commissionType === 'fixed' ? 'ج.م / طلب' : '%'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── بطاقات المؤشرات الرقمية العامة ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي الطلبات المحجوزة</p>
            <h3 style={{ color: '#0d9488' }}>{overallStats.totalBooked} طلب</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Calendar size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>طلبات تم تسليمها بنجاح للعميل</p>
            <h3 style={{ color: '#16a34a' }}>{overallStats.totalDelivered} طلب</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <PackageCheck size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي قيمة المبيعات المحققة</p>
            <h3 style={{ color: '#0284c7' }}>{overallStats.totalSales.toFixed(2)} ج.م</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <DollarSign size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>معدل التسليم والتحويل (Fulfillment)</p>
            <h3 style={{ color: overallStats.overallFulfillmentRate >= 70 ? '#16a34a' : '#d97706' }}>
              {overallStats.overallFulfillmentRate}%
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث المتقدم ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
            {/* بحث بكود أو اسم الموظف */}
            <div className="outstock-search-bar" style={{ flex: '1 1 200px' }}>
              <Search size={16} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="ابحث بكود الموظف أو اسم الصيدلي..."
                value={searchEmployeeQuery}
                onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* بحث باسم العميل أو هاتفه أو رقم الطلب */}
            <div className="outstock-search-bar" style={{ flex: '1 1 200px' }}>
              <Search size={16} className="outstock-search-icon" style={{ color: '#0284c7' }} />
              <input
                type="text"
                placeholder="ابحث باسم العميل أو الهاتف أو رقم الطلب..."
                value={searchCustomerQuery}
                onChange={(e) => setSearchCustomerQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* فلتر الفرع */}
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '150px', height: '40px' }}
            >
              <option value="all">🏢 جميع الفروع ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* فلتر حالة الطلب */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '140px', height: '40px' }}
            >
              <option value="all">كل حالات الطلبات</option>
              <option value="delivered">تم التسليم بنجاح ✅</option>
              <option value="pending">قيد التوريد والتنفيذ ⏳</option>
              <option value="cancelled">طلبات ملغاة ❌</option>
            </select>

            {/* فلتر الفترة الزمنية */}
            <select
              value={dateRangeType}
              onChange={(e) => setDateRangeType(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '130px', height: '40px' }}
            >
              <option value="today">طلبات اليوم</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">الشهر الحالي</option>
              <option value="all">كل الأوقات</option>
              <option value="custom">نطاق مخصص...</option>
            </select>

            {dateRangeType === 'custom' && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="outstock-form-input"
                  style={{ height: '40px', fontSize: '12px' }}
                />
                <span style={{ fontSize: '12px' }}>إلى</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="outstock-form-input"
                  style={{ height: '40px', fontSize: '12px' }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchReportData}
              title="تحديث البيانات اللحظية"
            >
              <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportCSV}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              title="تصدير التقرير لملف Excel / CSV"
            >
              <FileSpreadsheet size={15} color="#16a34a" />
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── جدول أداء ومبيعات الموظفين المجمع ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>👥 مصفوفة مبيعات وحجوزات الصيادلة والموظفين (حسب كود الموظف)</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: 800 }}>
              ({employeePerformanceList.length} موظف مسجل)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 12px auto' }} />
            <p>جاري تجميع وتحليل سجلات مبيعات وحجوزات الموظفين...</p>
          </div>
        ) : employeePerformanceList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <Users size={36} style={{ opacity: 0.3, margin: '0 auto 10px auto' }} />
            <p style={{ fontWeight: 'bold' }}>لا توجد طلبات تطابق خيارات البحث والفلترة المحددة</p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>كود الموظف</th>
                  <th>اسم الموظف / الصيدلي</th>
                  <th>الفرع</th>
                  <th>إجمالي المحجوز</th>
                  <th>تم التسليم</th>
                  <th>قيد التنفيذ</th>
                  <th>ملغي</th>
                  <th>نسبة الإغلاق %</th>
                  <th>إجمالي المبيعات</th>
                  <th>العربونات المحصلة</th>
                  <th>العمولة المستحقة</th>
                  <th>الطلبات</th>
                </tr>
              </thead>
              <tbody>
                {employeePerformanceList.map((emp, idx) => (
                  <tr key={idx}>
                    <td>
                      <span style={{
                        background: '#f1f5f9',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        color: '#0f172a'
                      }}>
                        {emp.code}
                      </span>
                    </td>

                    <td>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{emp.name}</strong>
                    </td>

                    <td>
                      <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 'bold' }}>
                        {emp.branchName}
                      </span>
                    </td>

                    <td>
                      <strong style={{ fontSize: '13px' }}>{emp.totalOrders}</strong>
                    </td>

                    <td>
                      <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                        {emp.deliveredOrders}
                      </span>
                    </td>

                    <td>
                      <span style={{ color: '#d97706', fontWeight: 'bold' }}>
                        {emp.pendingOrders}
                      </span>
                    </td>

                    <td>
                      <span style={{ color: '#dc2626' }}>
                        {emp.cancelledOrders}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '45px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${emp.conversionRate}%`, height: '100%', background: emp.conversionRate >= 70 ? '#16a34a' : '#d97706' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{emp.conversionRate}%</span>
                      </div>
                    </td>

                    <td>
                      <strong style={{ color: '#0284c7' }}>{emp.totalSalesAmount.toFixed(2)} ج.م</strong>
                    </td>

                    <td>
                      <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{emp.totalDepositAmount.toFixed(2)} ج.م</span>
                    </td>

                    <td>
                      <span style={{
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        color: '#065f46',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: '800',
                        fontSize: '12px'
                      }}>
                        {emp.commissionEarned.toFixed(2)} ج.م
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="outstock-btn outstock-btn-secondary"
                        style={{ padding: '3px 8px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '3px' }}
                        onClick={() => {
                          if (emp.orders.length > 0) {
                            setSelectedOrderDetails(emp.orders[0]);
                          }
                        }}
                      >
                        <Eye size={12} />
                        <span>كشف الطلبات</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── كشف سجل الطلبات التفصيلي الفردي ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>📋 السجل التفصيلي لحجوزات العملاء المنسوبة للموظفين</span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              ({filteredOrders.length} طلب مطابق للبحث)
            </span>
          </h3>
        </div>

        <div className="outstock-table-wrap">
          <table className="outstock-table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>كود الموظف الحاجز</th>
                <th>اسم الصيدلي الحاجز</th>
                <th>العميل والهاتف</th>
                <th>الفرع</th>
                <th>الأصناف المحجوزة</th>
                <th>المبلغ الإجمالي</th>
                <th>العربون</th>
                <th>الحالة</th>
                <th>تاريخ الحجز</th>
                <th>الموظف المسلّم</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.slice(0, 100).map((ord) => (
                <tr
                  key={ord.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedOrderDetails(ord)}
                >
                  <td>
                    <span style={{ fontWeight: 'bold', color: '#0f172a' }}>
                      {ord.order_number}
                    </span>
                  </td>

                  <td>
                    <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px' }}>
                      {ord.order_receiver_code || '—'}
                    </span>
                  </td>

                  <td>
                    <span style={{ color: '#0f766e', fontWeight: 'bold' }}>
                      {ord.order_receiver_name || ord.responsible_pharmacist || 'صيدلي الفرع'}
                    </span>
                  </td>

                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 'bold', color: '#0f172a' }}>{ord.customer_name}</span>
                      <span style={{ fontSize: '11px', color: '#0284c7', direction: 'ltr', textAlign: 'right' }}>
                        {ord.customer_phone}
                      </span>
                    </div>
                  </td>

                  <td>{ord.branch_name}</td>

                  <td>
                    <span style={{ fontSize: '12px' }}>
                      {Array.isArray(ord.items) && ord.items.length > 0
                        ? ord.items.map((i) => i.medication_name || i.medicationName).join(' ، ')
                        : '—'}
                    </span>
                  </td>

                  <td>
                    <strong style={{ color: '#0f172a' }}>{parseFloat(ord.net_amount || ord.total_amount || 0).toFixed(2)} ج.م</strong>
                  </td>

                  <td>
                    <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                      {parseFloat(ord.paid_amount || 0).toFixed(2)} ج.م
                    </span>
                  </td>

                  <td>
                    <span className={`outstock-badge ${ord.order_status === 'delivered' ? 'success' : ord.order_status === 'cancelled' ? 'danger' : 'info'}`}>
                      {ord.order_status === 'delivered' ? 'تم التسليم' : ord.order_status === 'cancelled' ? 'ملغي' : 'قيد التوريد'}
                    </span>
                  </td>

                  <td>{new Date(ord.created_at).toLocaleDateString('ar-EG')}</td>

                  <td>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {ord.delivered_by_code ? `${ord.delivered_by_name || 'مسلّم'} (${ord.delivered_by_code})` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── نافذة استعراض تفاصيل الطلب والأصناف ── */}
      {selectedOrderDetails && (
        <div className="outstock-modal-backdrop" onClick={() => setSelectedOrderDetails(null)}>
          <div className="outstock-modal-panel" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-header">
              <h3>
                🔍 تفاصيل الطلب #{selectedOrderDetails.order_number}
              </h3>
              <button className="outstock-modal-close" onClick={() => setSelectedOrderDetails(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="outstock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px'
              }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>الموظف الحاجز للطلب:</span>
                  <div style={{ fontWeight: 'bold', color: '#0f766e' }}>
                    {selectedOrderDetails.order_receiver_name || selectedOrderDetails.responsible_pharmacist || 'صيدلي الفرع'}
                    {selectedOrderDetails.order_receiver_code && ` (كود: ${selectedOrderDetails.order_receiver_code})`}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>الفرع:</span>
                  <div style={{ fontWeight: 'bold' }}>{selectedOrderDetails.branch_name}</div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>اسم العميل:</span>
                  <div style={{ fontWeight: 'bold' }}>{selectedOrderDetails.customer_name} ({selectedOrderDetails.customer_phone})</div>
                </div>

                <div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>تاريخ ووقت الحجز:</span>
                  <div style={{ fontWeight: 'bold' }}>{new Date(selectedOrderDetails.created_at).toLocaleString('ar-EG')}</div>
                </div>

                {selectedOrderDetails.delivered_at && (
                  <div>
                    <span style={{ fontSize: '11px', color: '#16a34a' }}>تم التسليم بواسطة:</span>
                    <div style={{ fontWeight: 'bold', color: '#16a34a' }}>
                      {selectedOrderDetails.delivered_by_name || 'صيدلي الفرع'} ({selectedOrderDetails.delivered_by_code || 'مسلّم'})
                    </div>
                  </div>
                )}
              </div>

              {/* جدول بنود الأدوية */}
              <div>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  الأصناف المسجلة بالطلب:
                </strong>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table className="outstock-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>اسم الصنف</th>
                        <th>الكمية</th>
                        <th>سعر الوحدة</th>
                        <th>الإجمالي</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrderDetails.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td><strong>{it.medicationName || it.medication_name}</strong></td>
                          <td>{it.quantity} علبة</td>
                          <td>{it.unitPrice || it.unit_price} ج.م</td>
                          <td>{it.totalPrice || it.total_price} ج.م</td>
                          <td>
                            <span className={`outstock-badge ${it.itemStatus === 'available' || it.itemStatus === 'delivered' ? 'success' : 'info'}`}>
                              {it.itemStatus || 'معلق'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                <span>الإجمالي الصافي: <strong>{selectedOrderDetails.net_amount || selectedOrderDetails.total_amount} ج.م</strong></span>
                <span>العربون المدفوع: <strong style={{ color: '#16a34a' }}>{selectedOrderDetails.paid_amount || 0} ج.م</strong></span>
                <span>المتبقي: <strong style={{ color: '#dc2626' }}>{selectedOrderDetails.remaining_amount || 0} ج.م</strong></span>
              </div>
            </div>

            <div className="outstock-modal-footer">
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={() => setSelectedOrderDetails(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
