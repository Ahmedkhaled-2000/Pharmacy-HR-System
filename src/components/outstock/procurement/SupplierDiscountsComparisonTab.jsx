import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  Award,
  Percent,
  Search,
  RefreshCw,
  Crown,
  DollarSign,
  Building2,
  Package,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Sliders,
  ShieldCheck,
  Radio,
  Wifi,
  WifiOff,
  Zap,
  Globe,
  Key,
  Smartphone,
  Tag,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ExternalLink,
  Info,
  Check,
  X
} from 'lucide-react';
import {
  outstockGetSupplierDiscountsComparison,
  outstockGetISupplyStatus,
  outstockSaveISupplyConfig,
  outstockTestISupplySession,
  outstockSyncISupplyNow,
  outstockGetISupplyFeeds,
  outstockClearISupplySession
} from '../../../utils/outstockApiClient';

/**
 * SupplierDiscountsComparisonTab.jsx
 * شاشة مقارنة خصومات الموردين وبوابة الصيدلية المستقلة لمنصة i'SUPPLY
 * تتضمن:
 * 1. تبويبة مقارنة خصومات الفواتير المسجلة مع إدخال يدوي لعدد الأصناف الأعلى طلباً والبطاقات الاستبيانية
 * 2. تبويبة بوابة الصيدلية المستقلة (Session Bridge / Headless Gateway) للربط مع i'SUPPLY ومزامنة أسعار السوق اللحظية
 */
export default function SupplierDiscountsComparisonTab({ showToast = alert }) {
  const [activeSubTab, setActiveSubTab] = useState('invoices_comparison'); // 'invoices_comparison' | 'isupply_gateway'

  // ══════════════════════════════════════════════════════════════════════════════
  // 1. قسم مقارنة خصومات الفواتير المسجلة
  // ══════════════════════════════════════════════════════════════════════════════
  const [topItemsLimit, setTopItemsLimit] = useState(25); // الإدخال اليدوي لعدد الأصناف
  const [customLimitInput, setCustomLimitInput] = useState('25');
  const [searchQuery, setSearchQuery] = useState('');
  const [comparisonData, setComparisonData] = useState([]);
  const [kpis, setKpis] = useState({
    topDiscountSupplier: null,
    maxRecordedDiscount: null,
    marketAverageDiscount: 0,
    potentialMonthlySavings: 0,
    totalItemsCompared: 0
  });
  const [isLoadingComparison, setIsLoadingComparison] = useState(true);
  const [comparisonError, setComparisonError] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const fetchComparison = useCallback(async () => {
    try {
      setIsLoadingComparison(true);
      setComparisonError(null);
      const res = await outstockGetSupplierDiscountsComparison({
        limit: topItemsLimit,
        search: searchQuery
      });
      if (res?.success) {
        setComparisonData(res.itemsComparison || []);
        setKpis(res.kpis || {});
      } else {
        const errMsg = res?.error || 'تعذر جلب بيانات مقارنة الخصومات';
        setComparisonError(errMsg);
        showToastRef.current?.(errMsg);
      }
    } catch (err) {
      console.error(err);
      setComparisonError('حدث خطأ أثناء جلب مقارنة الخصومات');
      showToastRef.current?.('حدث خطأ أثناء جلب مقارنة الخصومات');
    } finally {
      setIsLoadingComparison(false);
    }
  }, [topItemsLimit, searchQuery]);

  useEffect(() => {
    if (activeSubTab === 'invoices_comparison') {
      fetchComparison();
    }
  }, [activeSubTab, fetchComparison]);

  const handleApplyCustomLimit = (e) => {
    e.preventDefault();
    const parsed = parseInt(customLimitInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      const clamped = Math.min(parsed, 500);
      setTopItemsLimit(clamped);
      setCustomLimitInput(String(clamped));
    }
  };

  const PRESET_LIMITS = [10, 25, 50, 100, 200];

  // ══════════════════════════════════════════════════════════════════════════════
  // 2. قسم بوابة الصيدلية المستقلة لـ i'SUPPLY (Session Bridge / Gateway)
  // ══════════════════════════════════════════════════════════════════════════════
  const [isupplyStatus, setIsupplyStatus] = useState({
    pharmacy_name: '',
    pharmacy_code: '',
    account_phone: '',
    is_connected: false,
    auto_sync_enabled: true,
    last_sync_at: null,
    last_sync_status: 'idle',
    last_sync_message: ''
  });
  const [isupplyFeeds, setIsupplyFeeds] = useState([]);
  const [isupplySearch, setIsupplySearch] = useState('');
  const [isLoadingISupply, setIsLoadingISupply] = useState(false);
  const [isConnectingSession, setIsConnectingSession] = useState(false);
  const [isSyncingFeeds, setIsSyncingFeeds] = useState(false);

  // نموذج بيانات الاعتماد للجلسة
  const [sessionCredentials, setSessionCredentials] = useState({
    pharmacyName: '',
    pharmacyCode: '',
    accountPhone: '',
    authToken: '',
    autoSyncEnabled: true
  });

  const loadISupplyData = useCallback(async () => {
    try {
      setIsLoadingISupply(true);
      const [statusRes, feedsRes] = await Promise.all([
        outstockGetISupplyStatus(),
        outstockGetISupplyFeeds({ search: isupplySearch })
      ]);
      if (statusRes?.success && statusRes.config) {
        setIsupplyStatus(statusRes.config);
        setSessionCredentials((prev) => ({
          ...prev,
          pharmacyName: statusRes.config.pharmacy_name || '',
          pharmacyCode: statusRes.config.pharmacy_code || '',
          accountPhone: statusRes.config.account_phone || '',
          autoSyncEnabled: statusRes.config.auto_sync_enabled !== false
        }));
      }
      if (feedsRes?.success) {
        setIsupplyFeeds(feedsRes.feeds || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingISupply(false);
    }
  }, [isupplySearch]);

  useEffect(() => {
    if (activeSubTab === 'isupply_gateway') {
      loadISupplyData();
    }
  }, [activeSubTab, loadISupplyData]);

  // حفظ بيانات جلسة الربط
  const handleSaveISupplyConfig = async (e) => {
    e.preventDefault();
    try {
      const res = await outstockSaveISupplyConfig(sessionCredentials);
      if (res?.success) {
        showToastRef.current?.('تم حفظ إعدادات جلسة iSupply بنجاح');
        loadISupplyData();
      } else {
        showToastRef.current?.(res?.error || 'فشل حفظ الإعدادات');
      }
    } catch {
      showToastRef.current?.('حدث خطأ أثناء حفظ الإعدادات');
    }
  };

  // فحص واعتماد الجلسة (Handshake)
  const handleTestSession = async () => {
    if (!sessionCredentials.accountPhone) {
      showToastRef.current?.('يرجى إدخال رقم هاتف حساب الصيدلية أولاً');
      return;
    }
    try {
      setIsConnectingSession(true);
      const res = await outstockTestISupplySession(sessionCredentials);
      if (res?.success) {
        showToastRef.current?.('تم الاتصال واعتماد جلسة الربط مع منصة iSupply بنجاح 🟢');
        loadISupplyData();
      } else {
        showToastRef.current?.(res?.error || 'فشل الاتصال بالجلسة');
      }
    } catch {
      showToastRef.current?.('حدث خطأ أثناء فحص الجلسة');
    } finally {
      setIsConnectingSession(false);
    }
  };

  // تشغيل المزامنة الفورية لأسعار وخصومات الموزعين
  const handleSyncISupplyNow = async () => {
    try {
      setIsSyncingFeeds(true);
      const res = await outstockSyncISupplyNow();
      if (res?.success) {
        showToastRef.current?.(res.message || 'تمت مزامنة عروض وخصومات الموزعين بنجاح ⚡');
        loadISupplyData();
        // تحديث جدول مقارنة الفواتير أيضاً لربط أسعار السوق اللحظية
        fetchComparison();
      } else {
        showToastRef.current?.(res?.error || 'فشلت المزامنة');
      }
    } catch {
      showToastRef.current?.('حدث خطأ أثناء المزامنة');
    } finally {
      setIsSyncingFeeds(false);
    }
  };

  // قطع اتصال الجلسة
  const handleClearSession = async () => {
    if (!window.confirm('هل تريد قطع اتصال الجلسة وإعادة الضبط؟')) return;
    try {
      await outstockClearISupplySession();
      showToastRef.current?.('تم قطع الاتصال بنجاح');
      loadISupplyData();
    } catch {
      showToastRef.current?.('حدث خطأ أثناء قطع الاتصال');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // واجهة العرض (JSX)
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="supplier-discounts-comparison-root" style={{ padding: '16px', direction: 'rtl' }}>
      {/* ── الترويسة الرئيسية والشريط التبادلي ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '14px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              مقارنة خصومات الموردين وبوابة i'SUPPLY الميدانية
            </h2>
            <span
              style={{
                background: '#fef3c7',
                color: '#b45309',
                padding: '3px 10px',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Crown size={12} />
              <span>محرك الذكاء التجاري</span>
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            تحليل نسب خصم شركات التوزيع للأصناف الأعلى طلباً من واقع الفواتير ومقارنتها بالسوق المصري اللحظي
          </p>
        </div>

        {/* أزرار التبديل بين التبويبتين الفرعيتين */}
        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'invoices_comparison' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('invoices_comparison')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '7px 14px' }}
          >
            <Percent size={15} />
            <span>مقارنة خصومات الفواتير المسجلة</span>
          </button>

          <button
            type="button"
            className={`outstock-btn ${activeSubTab === 'isupply_gateway' ? 'outstock-btn-primary' : 'outstock-btn-secondary'}`}
            onClick={() => setActiveSubTab('isupply_gateway')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '7px 14px' }}
          >
            <Radio size={15} />
            <span>بوابة الصيدلية المستقلة (i'SUPPLY Bridge)</span>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isupplyStatus.is_connected ? '#10b981' : '#94a3b8'
              }}
            />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          التبويبة الأولى: مقارنة خصومات الفواتير المسجلة
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'invoices_comparison' && (
        <div className="invoices-comparison-subview">
          {/* تنبيه الخطأ مع زر إعادة المحاولة الفورية لمنع الحلقات المفرغة */}
          {comparisonError && (
            <div
              style={{
                background: '#fef2f2',
                border: '1.5px solid #fca5a5',
                borderRadius: '12px',
                padding: '14px 18px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#b91c1c'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: '700' }}>
                <AlertCircle size={20} />
                <span>{comparisonError}</span>
              </div>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={fetchComparison}
                style={{ fontSize: '12px', padding: '6px 14px' }}
              >
                إعادة المحاولة 🔄
              </button>
            </div>
          )}

          {/* البطاقات الاستبيانية والتحليلية الـ 4 */}
          {/* البطاقات الاستبيانية والتحليلية الـ 4 - طابع مؤسسي عصري */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}
          >
            {/* 1. ملك الخصومات */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
                borderTop: '3px solid #059669',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Crown size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: '#047857', fontWeight: 'bold' }}>
                  👑 ملك الخصومات (أعلى مورد منافسة)
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>
                  {kpis.topDiscountSupplier ? kpis.topDiscountSupplier.name : 'قيد التحليل'}
                </div>
                {kpis.topDiscountSupplier && (
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    الأعلى خصماً في <strong style={{ color: '#059669' }}>{kpis.topDiscountSupplier.winsCount}</strong> صنف (متوسط {kpis.topDiscountSupplier.avgDiscount}%)
                  </div>
                )}
              </div>
            </div>

            {/* 2. أعلى نسبة خصم مسجلة */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
                borderTop: '3px solid #d97706',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Award size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: '#b45309', fontWeight: 'bold' }}>
                  🎯 أعلى نسبة خصم مسجلة
                </div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 'bold', color: '#d97706', marginTop: '2px', fontFamily: 'var(--outstock-font-mono)' }}>
                  {kpis.maxRecordedDiscount ? `${kpis.maxRecordedDiscount.discount_percent}%` : '0%'}
                </div>
                {kpis.maxRecordedDiscount && (
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    صنف: {kpis.maxRecordedDiscount.medication_name} ({kpis.maxRecordedDiscount.supplier_name})
                  </div>
                )}
              </div>
            </div>

            {/* 3. متوسط خصم السوق الفعلي */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
                borderTop: '3px solid #0284c7',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Percent size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: '#0369a1', fontWeight: 'bold' }}>
                  📊 متوسط خصم المشتريات العام
                </div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0284c7', marginTop: '2px', fontFamily: 'var(--outstock-font-mono)' }}>
                  {kpis.marketAverageDiscount}%
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  عبر كافة بنود فواتير التوريد المسجلة
                </div>
              </div>
            </div>

            {/* 4. الوفر المالي التقديري المتوقع */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
                borderTop: '3px solid #0d9488',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  color: '#0d9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <DollarSign size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}>
                  💡 وفر مالي محتمل بالتحويل للأفضل
                </div>
                <div className="tabular-nums" style={{ fontSize: '17px', fontWeight: 'bold', color: '#0d9488', marginTop: '2px', fontFamily: 'var(--outstock-font-mono)' }}>
                  {Number(kpis.potentialMonthlySavings || 0).toLocaleString('ar-EG')} ج.م
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  عند حصر سحب هذه الأصناف من أفضل مورد
                </div>
              </div>
            </div>
          </div>

          {/* ── شريط الإدخال اليدوي لعدد الأصناف والفلاتر ── */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            {/* الإدخال اليدوي لعدد الأصناف الأكثر طلباً */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sliders size={16} color="#0f766e" />
                <span>عدد الأصناف الأعلى طلباً للمقارنة:</span>
              </span>

              {/* أزرار سريعة جاهزة */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {PRESET_LIMITS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setTopItemsLimit(num);
                      setCustomLimitInput(String(num));
                    }}
                    style={{
                      border: topItemsLimit === num ? '1.5px solid #0f766e' : '1px solid #cbd5e1',
                      background: topItemsLimit === num ? '#0f766e' : '#fff',
                      color: topItemsLimit === num ? '#fff' : '#475569',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: topItemsLimit === num ? 'bold' : 'normal',
                      cursor: 'pointer'
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* حقل الإدخال اليدوي المخصص */}
              <form onSubmit={handleApplyCustomLimit} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  min="1"
                  max="500"
                  className="outstock-form-input"
                  style={{ width: '85px', textAlign: 'center', padding: '4px 8px', fontSize: '12.5px', height: '32px' }}
                  value={customLimitInput}
                  onChange={(e) => setCustomLimitInput(e.target.value)}
                  placeholder="مخصص"
                  title="أدخل أي عدد أصناف يدوي ترغب في مقارنته (1 إلى 500)"
                />
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-secondary"
                  style={{ padding: '5px 9px', fontSize: '11.5px', height: '32px' }}
                >
                  تطبيق
                </button>
              </form>
            </div>

            {/* حقل البحث السريع بالاسم أو الباركود */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, maxWidth: '340px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search size={15} style={{ position: 'absolute', right: '10px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="outstock-form-input"
                  placeholder="بحث باسم الدواء أو الصنف..."
                  style={{ paddingRight: '32px', width: '100%', height: '34px', fontSize: '12.5px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="outstock-btn outstock-btn-secondary"
                onClick={fetchComparison}
                title="تحديث المقارنة اللحظية"
                style={{ height: '34px', padding: '6px 10px' }}
              >
                <RefreshCw size={14} className={isLoadingComparison ? 'outstock-spin' : ''} />
              </button>
            </div>
          </div>

          {/* ── جدول مصفوفة مقارنة الأصناف والخصومات ── */}
          {isLoadingComparison ? (
            <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={26} style={{ marginBottom: '10px', color: '#0f766e' }} />
              <div>جاري استخراج وتحليل خصومات الأصناف من الفواتير المسجلة...</div>
            </div>
          ) : comparisonData.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Percent size={36} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>
                لا توجد أصناف فواتير مطابقة لخيارات الفلترة
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                تأكد من تسجيل فواتير موردين مسبقاً، أو قم بزيادة عدد الأصناف أو مسح نص البحث
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px', width: '40px' }}>#</th>
                    <th style={{ padding: '12px 14px' }}>اسم الصنف / الدواء</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>الكمية المسحوبة</th>
                    <th style={{ padding: '12px 14px' }}>سعر الجمهور</th>
                    <th style={{ padding: '12px 14px' }}>المورد الفائز (أعلى خصم) 👑</th>
                    <th style={{ padding: '12px 14px' }}>نسب خصم باقي الشركات</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>وفر العلبة</th>
                    <th style={{ padding: '12px 14px' }}>مقارنة بسوق i'SUPPLY ⚡</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((item, idx) => {
                    const isExpanded = expandedItemId === item.medication_name;
                    const best = item.best_supplier;
                    const isupply = item.isupply_market_comparison;

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafafa' : '#fff'
                          }}
                        >
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#94a3b8' }}>
                            {item.rank}
                          </td>

                          {/* اسم الدواء وسعره */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{item.medication_name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              ورد في {item.invoices_count} فاتورة من {item.suppliers_count} موردين
                            </div>
                          </td>

                          {/* الكمية */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 'bold', color: '#334155' }}>
                            {item.total_quantity_invoiced.toLocaleString('ar-EG')} علبة
                          </td>

                          {/* سعر الجمهور */}
                          <td style={{ padding: '12px 14px', color: '#0f172a', fontWeight: 'bold' }}>
                            {item.public_price > 0 ? `${item.public_price} ج.م` : '-'}
                          </td>

                          {/* المورد صاحب أعلى خصم */}
                          <td style={{ padding: '12px 14px' }}>
                            {best ? (
                              <div
                                style={{
                                  background: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '8px',
                                  padding: '6px 10px',
                                  display: 'inline-block'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Crown size={13} color="#16a34a" />
                                  <strong style={{ color: '#15803d', fontSize: '13px' }}>
                                    {best.max_discount}% خصم
                                  </strong>
                                </div>
                                <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
                                  {best.supplier_name} ({best.min_buy_price} ج.م)
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>

                          {/* خصومات باقي الشركات */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {item.suppliers_breakdown.map((s, sIdx) => {
                                const isWinner = best && s.supplier_id === best.supplier_id;
                                if (isWinner && item.suppliers_breakdown.length > 1) return null; // لا نكرره إذا كان الفائز
                                return (
                                  <span
                                    key={sIdx}
                                    style={{
                                      background: isWinner ? '#f0fdf4' : '#f1f5f9',
                                      color: isWinner ? '#166534' : '#475569',
                                      border: isWinner ? '1px solid #86efac' : '1px solid #e2e8f0',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '11px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    <span>{s.supplier_name.split(' ')[0]}:</span>
                                    <strong>{s.max_discount}%</strong>
                                  </span>
                                );
                              })}
                              {item.suppliers_breakdown.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedItemId(isExpanded ? null : item.medication_name)}
                                  style={{ border: 'none', background: 'transparent', color: '#0284c7', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                                >
                                  {isExpanded ? 'طي التفاصيل ▲' : 'عرض التفاصيل ▼'}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* فارق الوفر بالعلبة */}
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {item.savings_per_pack > 0 ? (
                              <span
                                style={{
                                  background: '#ecfdf5',
                                  color: '#059669',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontWeight: 'bold',
                                  fontSize: '11.5px'
                                }}
                              >
                                +{item.savings_per_pack} ج.م
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>خصم موحد</span>
                            )}
                          </td>

                          {/* مقارنة مع سوق i'SUPPLY */}
                          <td style={{ padding: '12px 14px' }}>
                            {isupply ? (
                              <div
                                style={{
                                  background: isupply.is_better_than_invoices ? '#fef3c7' : '#f8fafc',
                                  border: isupply.is_better_than_invoices ? '1px solid #fde047' : '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '5px 8px',
                                  fontSize: '11px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                  <Zap size={11} color={isupply.is_better_than_invoices ? '#d97706' : '#64748b'} />
                                  <span style={{ color: isupply.is_better_than_invoices ? '#b45309' : '#334155' }}>
                                    {isupply.distributor_name}: {isupply.discount_percent}%
                                  </span>
                                </div>
                                {isupply.is_better_than_invoices && (
                                  <span style={{ color: '#b45309', fontWeight: 'bold', display: 'block', marginTop: '2px' }}>
                                    وفر إضافي بالسوق (+{isupply.diff_percent}%) ⚡
                                  </span>
                                )}
                                {isupply.bonus_info && (
                                  <span style={{ color: '#047857', display: 'block', fontSize: '10px' }}>
                                    🎁 {isupply.bonus_info}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '11px' }}>غير متوفر بالتغذية</span>
                            )}
                          </td>
                        </tr>

                        {/* صف التفاصيل المنسدل عند التوسيع */}
                        {isExpanded && (
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td colSpan={8} style={{ padding: '12px 20px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#334155' }}>
                                سجل وسجل خصومات الموردين للصنف ({item.medication_name}):
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                {item.suppliers_breakdown.map((s, sIdx) => (
                                  <div
                                    key={sIdx}
                                    style={{
                                      background: '#fff',
                                      border: '1px solid #e2e8f0',
                                      borderRadius: '8px',
                                      padding: '8px 12px'
                                    }}
                                  >
                                    <div style={{ fontWeight: 'bold', color: '#0f172a' }}>{s.supplier_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                      أعلى خصم: <strong style={{ color: '#15803d' }}>{s.max_discount}%</strong> (سعر شراء: {s.min_buy_price} ج.م)
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
                                      الكمية الموردة: {s.quantity} علبة | آخر فاتورة: {s.last_invoice_date ? new Date(s.last_invoice_date).toLocaleDateString('ar-EG') : '-'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          التبويبة الثانية: بوابة الصيدلية المستقلة لـ i'SUPPLY (Session Bridge)
      ══════════════════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'isupply_gateway' && (
        <div className="isupply-gateway-subview">
          {/* شريط حالة الجلسة والاتصال */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid var(--outstock-border-subtle, #e2e8f0)',
              borderRight: isupplyStatus.is_connected ? '4px solid #059669' : '4px solid #94a3b8',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: isupplyStatus.is_connected ? '#ecfdf5' : '#f1f5f9',
                  border: isupplyStatus.is_connected ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                  color: isupplyStatus.is_connected ? '#059669' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isupplyStatus.is_connected ? <Wifi size={22} /> : <WifiOff size={22} />}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>
                    حالة جلسة بوابة i'SUPPLY (Headless Session Bridge):
                  </h4>
                  <span
                    style={{
                      background: isupplyStatus.is_connected ? '#ecfdf5' : '#fef2f2',
                      color: isupplyStatus.is_connected ? '#059669' : '#dc2626',
                      border: isupplyStatus.is_connected ? '1px solid #a7f3d0' : '1px solid #fecaca',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isupplyStatus.is_connected ? '#059669' : '#dc2626' }} />
                    <span>{isupplyStatus.is_connected ? 'متصل لحظياً' : 'غير متصل'}</span>
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                  {isupplyStatus.last_sync_message || 'بانتظار التحقق من الجلسة وتحديث الأسعار اليومية'}
                  {isupplyStatus.last_sync_at && (
                    <span className="tabular-nums" style={{ color: '#0f766e', fontWeight: 'bold' }}>
                      {' '}(آخر مزامنة: {new Date(isupplyStatus.last_sync_at).toLocaleString('ar-EG')})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* أزرار الإجراء السريع للمزامنة والضبط */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={handleSyncISupplyNow}
                disabled={isSyncingFeeds}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Zap size={15} className={isSyncingFeeds ? 'outstock-spin' : ''} />
                <span>{isSyncingFeeds ? 'جاري جلب أسعار الموزعين...' : 'مزامنة وتحديث أسعار السوق الآن ⚡'}</span>
              </button>

              {isupplyStatus.is_connected && (
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={handleClearSession}
                  style={{ color: '#dc2626' }}
                >
                  قطع الاتصال
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '16px', alignItems: 'start' }}>
            {/* بطاقة إعدادات الجلسة والاعتماد */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <Key size={16} color="#0f766e" />
                <h4 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>بيانات اعتماد بوابة i'SUPPLY</h4>
              </div>

              <form onSubmit={handleSaveISupplyConfig}>
                <div style={{ marginBottom: '12px' }}>
                  <label className="outstock-form-label" style={{ fontSize: '11.5px' }}>اسم الصيدلية على المنصة</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="مثال: صيدليات النور"
                    value={sessionCredentials.pharmacyName}
                    onChange={(e) => setSessionCredentials({ ...sessionCredentials, pharmacyName: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="outstock-form-label" style={{ fontSize: '11.5px' }}>كود الصيدلية / رقم الترخيص</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="مثال: PH-98214"
                    value={sessionCredentials.pharmacyCode}
                    onChange={(e) => setSessionCredentials({ ...sessionCredentials, pharmacyCode: e.target.value })}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="outstock-form-label" style={{ fontSize: '11.5px' }}>رقم هاتف حساب الدخول</label>
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="010xxxxxxxx"
                    value={sessionCredentials.accountPhone}
                    onChange={(e) => setSessionCredentials({ ...sessionCredentials, accountPhone: e.target.value })}
                    required
                  />
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label className="outstock-form-label" style={{ fontSize: '11.5px' }}>رمز الجلسة / كلمة المرور (Token)</label>
                  <input
                    type="password"
                    className="outstock-form-input"
                    placeholder="••••••••••••"
                    value={sessionCredentials.authToken}
                    onChange={(e) => setSessionCredentials({ ...sessionCredentials, authToken: e.target.value })}
                  />
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                    يتم تشفير وتأمين الرمز محلياً داخل خادم المنظومة
                  </span>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={sessionCredentials.autoSyncEnabled}
                      onChange={(e) => setSessionCredentials({ ...sessionCredentials, autoSyncEnabled: e.target.checked })}
                      style={{ accentColor: '#0f766e' }}
                    />
                    <span>المزامنة التلقائية اليومية لأسعار السوق (الساعة 6 ص)</span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button type="submit" className="outstock-btn outstock-btn-secondary" style={{ fontSize: '12px' }}>
                    حفظ الإعدادات
                  </button>
                  <button
                    type="button"
                    className="outstock-btn outstock-btn-primary"
                    onClick={handleTestSession}
                    disabled={isConnectingSession}
                    style={{ fontSize: '12px' }}
                  >
                    {isConnectingSession ? 'جاري الفحص...' : 'فحص الجلسة 🔗'}
                  </button>
                </div>
              </form>
            </div>

            {/* جدول أسعار وعروض الموزعين الحية من i'SUPPLY */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: '14.5px', color: '#0f172a' }}>
                    أسعار وخصومات كبار الموزعين المزامنة من i'SUPPLY
                  </h4>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    (ابن سينا فارما، المتحدة للصيادلة، فارما أوفرسيز، رامكو، سوفيكو، مالتي فارما)
                  </span>
                </div>

                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', right: '8px', top: '8px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="outstock-form-input"
                    placeholder="بحث في الأصناف المزامنة..."
                    style={{ paddingRight: '28px', height: '30px', fontSize: '11.5px', width: '100%' }}
                    value={isupplySearch}
                    onChange={(e) => setIsupplySearch(e.target.value)}
                  />
                </div>
              </div>

              {isLoadingISupply ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  <RefreshCw className="outstock-spin" size={20} style={{ marginBottom: '6px' }} />
                  <div>جاري جلب عروض السوق...</div>
                </div>
              ) : isupplyFeeds.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '36px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px dashed #cbd5e1'
                  }}
                >
                  <Globe size={32} style={{ color: '#94a3b8', marginBottom: '8px' }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#475569' }}>
                    لا توجد بيانات سوق مزامنة حتى الآن
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    اضغط على زر «مزامنة وتحديث أسعار السوق الآن ⚡» لبدء جلب عروض الموزعين فورياً
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 10px' }}>اسم الصنف</th>
                        <th style={{ padding: '8px 10px' }}>سعر الجمهور</th>
                        <th style={{ padding: '8px 10px' }}>أفضل موزع بـ i'SUPPLY 👑</th>
                        <th style={{ padding: '8px 10px' }}>أعلى خصم</th>
                        <th style={{ padding: '8px 10px' }}>سعر الشراء</th>
                        <th style={{ padding: '8px 10px' }}>البوانص والكوتات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isupplyFeeds.map((feed, idx) => (
                        <tr key={feed.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{feed.medication_name}</td>
                          <td style={{ padding: '8px 10px' }}>{feed.public_price} ج.م</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              style={{
                                background: '#f0fdf4',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              {feed.best_distributor_name}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#0f766e' }}>
                            {feed.best_discount_percent}%
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>
                            {feed.best_buy_price} ج.م
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {feed.bonus_info ? (
                              <span style={{ color: '#059669', fontWeight: 'bold', fontSize: '11px' }}>
                                🎁 {feed.bonus_info}
                              </span>
                            ) : feed.quota_limit ? (
                              <span style={{ color: '#d97706', fontSize: '11px' }}>
                                كوتة: {feed.quota_limit} علب
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>متاح بدون شروط</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
