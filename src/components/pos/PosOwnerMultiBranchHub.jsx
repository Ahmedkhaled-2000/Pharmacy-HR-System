import React, { useState, useEffect, useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  Crown,
  Building2,
  DollarSign,
  TrendingUp,
  Receipt,
  Users,
  Clock,
  RefreshCw,
  X,
  ExternalLink,
  ChevronRight,
  Bike,
  Sparkles,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

export default function PosOwnerMultiBranchHub() {
  const { isOwnerHubOpen, setIsOwnerHubOpen, setIsReportsModalOpen } = usePOS();
  const { authRole } = useAuth?.() || {};
  const { state } = useData?.() || {};

  const [dateFilter, setDateFilter] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month'
  const [isLoading, setIsLoading] = useState(false);
  const [networkSummary, setNetworkSummary] = useState(null);
  const [recentSales, setRecentSales] = useState([]);

  const branchesList = useMemo(() => {
    return state?.branches || [
      { id: 'branch-1', name: 'الفرع الرئيسي - التحرير', code: 'MAIN-01' },
      { id: 'branch-2', name: 'فرع مدينة نصر', code: 'NASR-02' },
      { id: 'branch-3', name: 'فرع المعادي', code: 'MAADI-03' },
      { id: 'branch-4', name: 'فرع الدقي', code: 'DOKKI-04' },
      { id: 'branch-5', name: 'فرع الشيخ زايد', code: 'ZAYED-05' }
    ];
  }, [state?.branches]);

  // جلب بيانات ملخص شبكة الفروع من السيرفر
  const fetchNetworkSummary = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/pos/sales-summary?date=${dateFilter === 'today' ? '' : dateFilter}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setNetworkSummary(data.summary);
          setRecentSales(data.recentSales || []);
        }
      }
    } catch (e) {
      console.warn('Network summary fetch fallback to local cache:', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOwnerHubOpen) {
      fetchNetworkSummary();
    }
  }, [isOwnerHubOpen, dateFilter]);

  // إغلاق المودال بزر Esc
  useEffect(() => {
    if (!isOwnerHubOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOwnerHubOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOwnerHubOpen, setIsOwnerHubOpen]);

  // حساب توزيع مبيعات الفروع التقديري والتصنيفات
  const localSales = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharma_pos_sales');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }, [isOwnerHubOpen]);

  const totalRevenue = networkSummary?.total_revenue
    ? parseFloat(networkSummary.total_revenue)
    : localSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

  const totalInvoices = networkSummary?.total_invoices
    ? parseInt(networkSummary.total_invoices, 10)
    : localSales.length;

  const otcCount = networkSummary?.otc_count || localSales.filter((s) => s.invoiceType === 'otc').length;
  const rxCount = networkSummary?.rx_count || localSales.filter((s) => s.invoiceType === 'rx').length;
  const customerOrderCount = networkSummary?.customer_order_count || localSales.filter((s) => s.invoiceType === 'customer_order').length;
  const deliveryCount = networkSummary?.delivery_count || localSales.filter((s) => s.invoiceType === 'delivery').length;

  // فتح تقارير فرع محدد بالتفصيل
  const handleOpenBranchReport = (branchId) => {
    setIsOwnerHubOpen(false);
    setIsReportsModalOpen(true);
    // إرسال تنبيه لاختيار الفرع داخل شاشة التقارير
    window.dispatchEvent(new CustomEvent('pos:filter-branch', { detail: { branchId } }));
  };

  if (!isOwnerHubOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
      onClick={() => setIsOwnerHubOpen(false)}
    >
      <div
        style={{
          background: '#ffffff',
          color: '#0f172a',
          border: '1px solid #cbd5e1',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط رأس المودال الفخم */}
        <div
          style={{
            padding: '20px 28px',
            background: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                boxShadow: '0 6px 18px rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <Crown size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#ffffff' }}>
                  رادار المالك اللحظي لمتابعة كافة الفروع (Owner Multi-Branch Radar)
                </h2>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: '99px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid #10b981',
                    color: '#34d399',
                    fontSize: '11px',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }}></span>
                  مباشر عبر السحابة
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                مراقبة مبيعات الصيدليات، حركة الأدراج، تصنيفات الفواتير، ونشاط الكاشيرات لحظة بلحظة
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* اختيار الفترة */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '3px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {[
                { id: 'today', label: 'اليوم' },
                { id: 'yesterday', label: 'أمس' },
                { id: 'week', label: 'هذا الأسبوع' },
                { id: 'month', label: 'هذا الشهر' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDateFilter(tab.id)}
                  style={{
                    background: dateFilter === tab.id ? '#f59e0b' : 'transparent',
                    color: dateFilter === tab.id ? '#000000' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '7px',
                    padding: '5px 12px',
                    fontSize: '11.5px',
                    fontWeight: dateFilter === tab.id ? 900 : 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={fetchNetworkSummary}
              disabled={isLoading}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="تحديث البيانات لحظياً"
            >
              <RefreshCw size={16} className={isLoading ? 'spin-slow' : ''} />
            </button>

            <button
              type="button"
              onClick={() => setIsOwnerHubOpen(false)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94a3b8',
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

        {/* محتوى الرادار */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {/* 1. الشريط الرئيسي للمؤشرات المالية المجمعة (Consolidated Network KPIs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(15,23,42,0.9) 100%)', border: '1.5px solid rgba(16, 185, 129, 0.4)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 800 }}>إجمالي مبيعات الفروع المجمعة</span>
                <DollarSign size={18} color="#10b981" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '8px' }}>
                {totalRevenue.toFixed(2)} <span style={{ fontSize: '13px', color: '#34d399' }}>ج.م</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                صافي الإيراد الفعلي بعد الخصومات
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.18) 0%, rgba(15,23,42,0.9) 100%)', border: '1.5px solid rgba(56, 189, 248, 0.4)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 800 }}>إجمالي الفواتير الصادرة</span>
                <Receipt size={18} color="#38bdf8" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '8px' }}>
                {totalInvoices} <span style={{ fontSize: '13px', color: '#38bdf8' }}>فاتورة</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                متوسط الفاتورة: {totalInvoices > 0 ? (totalRevenue / totalInvoices).toFixed(1) : '0.0'} ج.م
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(15,23,42,0.9) 100%)', border: '1.5px solid rgba(245, 158, 11, 0.4)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 800 }}>الفروع النشطة على الخط</span>
                <Building2 size={18} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '8px' }}>
                {branchesList.length} <span style={{ fontSize: '13px', color: '#fbbf24' }}>فرع متصل</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                مزامنة البيانات السحابية لحظية 100%
              </div>
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.18) 0%, rgba(15,23,42,0.9) 100%)', border: '1.5px solid rgba(139, 92, 246, 0.4)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 800 }}>طلبات الدليفري والتوصيل</span>
                <Bike size={18} color="#a78bfa" />
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '8px' }}>
                {deliveryCount} <span style={{ fontSize: '13px', color: '#c4b5fd' }}>طلب منازل</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                تتبع حركة الطيارين والتحصيل
              </div>
            </div>
          </div>

          {/* 2. رادار تصنيفات الفواتير (OTC vs Rx vs الطلبات vs الدليفري) */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', padding: '18px 22px', marginBottom: '26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart3 size={17} color="#f59e0b" />
                تحليل نوعية المبيعات عبر الفروع (Sales Classification Radar)
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                إجمالي حركة التصنيف: {totalInvoices} حركة
              </span>
            </div>

            {/* شريط النسب المتناسب التفاعلي */}
            <div style={{ display: 'flex', height: '14px', borderRadius: '99px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', marginBottom: '14px' }}>
              <div style={{ width: `${totalInvoices > 0 ? (otcCount / totalInvoices) * 100 : 25}%`, background: '#10b981' }} title={`OTC: ${otcCount}`} />
              <div style={{ width: `${totalInvoices > 0 ? (rxCount / totalInvoices) * 100 : 25}%`, background: '#0ea5e9' }} title={`Rx: ${rxCount}`} />
              <div style={{ width: `${totalInvoices > 0 ? (customerOrderCount / totalInvoices) * 100 : 25}%`, background: '#f59e0b' }} title={`طلبات عملاء: ${customerOrderCount}`} />
              <div style={{ width: `${totalInvoices > 0 ? (deliveryCount / totalInvoices) * 100 : 25}%`, background: '#8b5cf6' }} title={`دليفري: ${deliveryCount}`} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10b981' }}></span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>🟢 OTC لا وصفية:</span>
                <strong style={{ fontSize: '13px', color: '#10b981' }}>{otcCount}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#0ea5e9' }}></span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>💊 روشتات طبية (Rx):</span>
                <strong style={{ fontSize: '13px', color: '#38bdf8' }}>{rxCount}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#f59e0b' }}></span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>📋 طلبات عملاء ونواقص:</span>
                <strong style={{ fontSize: '13px', color: '#fbbf24' }}>{customerOrderCount}</strong>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#8b5cf6' }}></span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>🛵 توصيل دليفري منازل:</span>
                <strong style={{ fontSize: '13px', color: '#c4b5fd' }}>{deliveryCount}</strong>
              </div>
            </div>
          </div>

          {/* 3. كروت الفروع الحية (Live Branch Performance Cards) */}
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} color="#f59e0b" />
              متابعة كل فرع على حدة (Branch-by-Branch Live Command)
            </h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>انقر على أي فرع لفتح ملف تقاريره التفصيلي</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '26px' }}>
            {branchesList.map((branch, index) => {
              // تقدير مبيعات الفرع
              const branchSalesCount = localSales.filter((s) => s.branchId === branch.id).length;
              const branchRev = localSales
                .filter((s) => s.branchId === branch.id)
                .reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);

              return (
                <div
                  key={branch.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                          {branch.name}
                        </h4>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                        {branch.code || `POS-0${index + 1}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '10px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>إيراد الفرع اليوم</div>
                        <div style={{ fontSize: '17px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>
                          {branchRev.toFixed(2)} ج.م
                        </div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>الفواتير المعتمدة</div>
                        <div style={{ fontSize: '17px', fontWeight: 900, color: '#38bdf8', marginTop: '2px' }}>
                          {branchSalesCount} فاتورة
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '11.5px', color: '#34d399', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={13} />
                      وردية متصلة الآن
                    </span>

                    <button
                      type="button"
                      onClick={() => handleOpenBranchReport(branch.id)}
                      style={{
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        color: '#fbbf24',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>عرض تقارير الفرع</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. سجل أحدث العمليات المباشرة عبر الشبكة */}
          {recentSales.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                ⚡ أحدث حركات البيع المباشرة الصادرة من الفروع (Live Sales Feed)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recentSales.slice(0, 8).map((sale) => (
                  <div
                    key={sale.id || sale.invoice_number}
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, color: '#f59e0b' }}>#{sale.invoice_number}</span>
                      <span style={{ color: '#cbd5e1' }}>{sale.branch_name || 'الفرع'}</span>
                      <span style={{ color: '#94a3b8' }}>كاشير: {sale.cashier_name || 'صيدلي'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{ color: '#94a3b8' }}>
                        {new Date(sale.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontWeight: 900, color: '#10b981' }}>
                        {parseFloat(sale.total_amount || 0).toFixed(2)} ج.م
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
