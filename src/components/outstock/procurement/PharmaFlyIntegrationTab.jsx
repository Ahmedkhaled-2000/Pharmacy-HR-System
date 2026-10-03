import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  Key,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  FileText,
  Search,
  Building2,
  Layers,
  ArrowRightLeft,
  Download,
  HelpCircle,
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  Activity,
  ToggleLeft,
  ToggleRight,
  Database,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import {
  outstockGetPharmaflyBranches,
  outstockGeneratePharmaflyKey,
  outstockTogglePharmaflyBranch,
  outstockGetPharmaflyStock,
  outstockGetPharmaflyLogs
} from '../../../utils/outstockApiClient';

/**
 * PharmaFlyIntegrationTab.jsx
 * بوابة التكامل والمزامنة الحية مع برنامج الصيدليات فارما فلاي (Pharma Fly ERP)
 * - ربط الفروع المتعددة بمفاتيح API آمنة
 * - استعلام المخزون الحي لحظياً مع اقتراح التحويل بين الفروع
 * - مزامنة فواتير المشتريات تلقائياً
 * - سجل التدقيق والمراقبة ودليل التفعيل الميداني
 */
export default function PharmaFlyIntegrationTab({ currentUser = null, showToast = alert }) {
  // التبويبات الداخلية
  const [activeSubSection, setActiveSubSection] = useState('branches'); // 'branches' | 'cross_stock' | 'sync_logs'
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  // بيانات الفروع والربط
  const [branches, setBranches] = useState([]);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);

  // بيانات المخزون الموحد
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [selectedStockBranch, setSelectedStockBranch] = useState('all');
  const [stockFilterType, setStockFilterType] = useState('all'); // 'all' | 'in_stock' | 'zero_stock'
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  // سجل المزامنة
  const [syncLogs, setSyncLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // ══════════════════════════════════════════════════════════════════════════════
  // تحميل قائمة الفروع وتكوينات فارما فلاي
  // ══════════════════════════════════════════════════════════════════════════════
  const loadBranches = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await outstockGetPharmaflyBranches();
      if (res?.success) {
        setBranches(res.branches || []);
      } else {
        showToast(res?.error || 'تعذر تحميل بيانات فروع فارما فلاي');
      }
    } catch (err) {
      console.error('Failed to load PharmaFly branches:', err);
      showToast('خطأ في الاتصال أثناء تحميل الفروع');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // ══════════════════════════════════════════════════════════════════════════════
  // توليد مفتاح API جديد لفرع
  // ══════════════════════════════════════════════════════════════════════════════
  const handleGenerateKey = async (branchId, branchName) => {
    const confirmMsg = `هل تريد بالتأكيد توليد مفتاح ربط جديد لفرع (${branchName})؟\nإذا كان هناك سكريبت مزامنة يعمل حالياً سيتوجب عليك تحديث المفتاح فيه.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await outstockGeneratePharmaflyKey(branchId);
      if (res?.success) {
        showToast(`✅ تم توليد مفتاح ربط جديد لـ ${branchName}`);
        loadBranches();
      } else {
        showToast(res?.error || 'تعذر توليد المفتاح');
      }
    } catch (err) {
      showToast('خطأ أثناء توليد المفتاح');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // تفعيل / إيقاف مزامنة فرع
  // ══════════════════════════════════════════════════════════════════════════════
  const handleToggleBranch = async (branchId, currentStatus, branchName) => {
    const nextStatus = !currentStatus;
    try {
      const res = await outstockTogglePharmaflyBranch(branchId, nextStatus);
      if (res?.success) {
        showToast(`تم ${nextStatus ? 'تفعيل' : 'تعطيل'} مزامنة فرع (${branchName}) بنجاح`);
        loadBranches();
      } else {
        showToast(res?.error || 'فشل تعديل حالة الفرع');
      }
    } catch (err) {
      showToast('خطأ في تعديل حالة المزامنة');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // نسخ المفتاح إلى الحافظة
  // ══════════════════════════════════════════════════════════════════════════════
  const handleCopyKey = (key, branchId) => {
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKeyId(branchId);
      setTimeout(() => setCopiedKeyId(null), 2500);
      showToast('📋 تم نسخ مفتاح الربط إلى الحافظة');
    }).catch(() => {
      showToast('تعذر نسخ المفتاح، يرجى التحديد والنسخ يدوياً');
    });
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // تحميل المخزون الحي متعدد الفروع
  // ══════════════════════════════════════════════════════════════════════════════
  const loadStock = useCallback(async () => {
    try {
      setIsLoadingStock(true);
      const params = {
        search: stockSearch.trim(),
        branch_id: selectedStockBranch === 'all' ? '' : selectedStockBranch,
        in_stock: stockFilterType === 'in_stock' ? 'true' : stockFilterType === 'zero_stock' ? 'false' : '',
        limit: 100
      };
      const res = await outstockGetPharmaflyStock(params);
      if (res?.success) {
        setStockItems(res.items || []);
      } else {
        showToast(res?.error || 'تعذر استرجاع المخزون');
      }
    } catch (err) {
      console.error('Failed to load stock:', err);
      showToast('خطأ في جلب بيانات المخزون');
    } finally {
      setIsLoadingStock(false);
    }
  }, [stockSearch, selectedStockBranch, stockFilterType, showToast]);

  useEffect(() => {
    if (activeSubSection === 'cross_stock') {
      const timer = setTimeout(() => {
        loadStock();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeSubSection, stockSearch, selectedStockBranch, stockFilterType, loadStock]);

  // ══════════════════════════════════════════════════════════════════════════════
  // تحميل سجلات المزامنة
  // ══════════════════════════════════════════════════════════════════════════════
  const loadLogs = useCallback(async () => {
    try {
      setIsLoadingLogs(true);
      const res = await outstockGetPharmaflyLogs({ limit: 100 });
      if (res?.success) {
        setSyncLogs(res.logs || []);
      } else {
        showToast(res?.error || 'تعذر تحميل سجل المزامنة');
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeSubSection === 'sync_logs') {
      loadLogs();
    }
  }, [activeSubSection, loadLogs]);

  // حساب إحصائيات سريعة
  const summaryStats = useMemo(() => {
    const totalBranches = branches.length;
    const connectedBranches = branches.filter((b) => b.is_connected).length;
    const totalSyncedItems = branches.reduce((sum, b) => sum + Number(b.synced_items_count || 0), 0);
    const totalSyncedInvoices = branches.reduce((sum, b) => sum + Number(b.synced_invoices_count || 0), 0);
    return { totalBranches, connectedBranches, totalSyncedItems, totalSyncedInvoices };
  }, [branches]);

  // تجميع المخزون لاكتشاف فرص التحويل الداخلي بين الفروع
  // إذا كان صنف له رصيد 0 في فرع، وله رصيد > 3 في فرع آخر
  const branchStockMap = useMemo(() => {
    const map = {};
    stockItems.forEach(item => {
      const nameKey = (item.medication_name || '').toLowerCase().trim();
      if (!nameKey) return;
      if (!map[nameKey]) map[nameKey] = [];
      map[nameKey].push(item);
    });
    return map;
  }, [stockItems]);

  return (
    <div className="pharmafly-integration-container" style={{ padding: '4px 0' }}>
      {/* ── 1. الهيدر والبانر الترحيبي الذكي ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#fff',
          marginBottom: '22px',
          boxShadow: '0 8px 24px rgba(6, 78, 59, 0.18)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(8px)',
                  padding: '8px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Server size={26} style={{ color: '#6ee7b7' }} />
              </div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', letterSpacing: '-0.3px' }}>
                بوابة المزامنة الحية مع برنامج فارما فلاي (Pharma Fly ERP)
              </h2>
              <span
                style={{
                  background: '#10b981',
                  color: '#fff',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Zap size={12} />
                <span>إصدار الربط السحابي v1.0</span>
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#d1fae5', maxWidth: '780px', lineHeight: 1.6 }}>
              ربط مباشر وآمن مع قواعد بيانات SQL Server لفروع الصيدلية لجلب فواتير المشتريات اليومية تلقائياً، وتتبع المخزون اللحظي عبر الفروع لتوجيه النواقص وتحويلها داخلياً قبل الشراء الخارجي.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href="/downloads/pharmafly-agent.zip"
              download="pharmafly-agent.zip"
              style={{
                background: '#047857',
                color: '#fff',
                border: '1.5px solid #34d399',
                borderRadius: '10px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
              title="تحميل حزمة الربط والمزامنة لوضعها على جهاز سيرفر الفرع"
            >
              <Download size={17} style={{ color: '#a7f3d0' }} />
              <span>تحميل حزمة الربط (Agent.zip) 📥</span>
            </a>

            <button
              type="button"
              onClick={() => setIsActivationModalOpen(true)}
              style={{
                background: '#fff',
                color: '#065f46',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
              }}
            >
              <HelpCircle size={17} style={{ color: '#059669' }} />
              <span>خطوات التفعيل وما المطلوب 🚀</span>
            </button>

            <button
              type="button"
              onClick={loadBranches}
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="تحديث البيانات"
            >
              <RefreshCw size={16} className={isLoading ? 'outstock-spin' : ''} />
              <span>تحديث الحالة</span>
            </button>
          </div>
        </div>

        {/* مؤشرات سريعة في أسفل البانر */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#a7f3d0' }}>الفروع النشطة</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {summaryStats.connectedBranches} / {summaryStats.totalBranches} فروع
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={18} style={{ color: '#a7f3d0' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#a7f3d0' }}>إجمالي الأصناف المزامنة</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {summaryStats.totalSyncedItems.toLocaleString('ar-EG')} صنف
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: '#a7f3d0' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#a7f3d0' }}>فواتير الشراء المستوردة</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {summaryStats.totalSyncedInvoices.toLocaleString('ar-EG')} فاتورة
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={18} style={{ color: '#a7f3d0' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#a7f3d0' }}>نوع البروتوكول</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>قراءة آمنة فقط (Read-Only)</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. أزرار التنقل بين الأقسام الداخلية الثلاثة ── */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '12px',
          flexWrap: 'wrap'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubSection('branches')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeSubSection === 'branches' ? '#0f766e' : '#f8fafc',
            color: activeSubSection === 'branches' ? '#fff' : '#475569',
            boxShadow: activeSubSection === 'branches' ? '0 4px 10px rgba(15, 118, 110, 0.25)' : 'none'
          }}
        >
          <Building2 size={17} />
          <span>حالة الفروع ومفاتيح الربط ({branches.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubSection('cross_stock')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeSubSection === 'cross_stock' ? '#0f766e' : '#f8fafc',
            color: activeSubSection === 'cross_stock' ? '#fff' : '#475569',
            boxShadow: activeSubSection === 'cross_stock' ? '0 4px 10px rgba(15, 118, 110, 0.25)' : 'none'
          }}
        >
          <Layers size={17} />
          <span>استعلام المخزون الموحد واقتراح التحويل الداخلي 🔄</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubSection('sync_logs')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '13.5px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: activeSubSection === 'sync_logs' ? '#0f766e' : '#f8fafc',
            color: activeSubSection === 'sync_logs' ? '#fff' : '#475569',
            boxShadow: activeSubSection === 'sync_logs' ? '0 4px 10px rgba(15, 118, 110, 0.25)' : 'none'
          }}
        >
          <Activity size={17} />
          <span>سجل المزامنة الحية والمراقبة</span>
        </button>
      </div>

      {/* ── 3. محتوى التبويب 1: حالة الفروع ومفاتيح الربط ── */}
      {activeSubSection === 'branches' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '18px' }}>
            {branches.map((b) => {
              const isConn = Boolean(b.is_connected);
              const isEnabled = b.is_enabled !== false;

              return (
                <div
                  key={b.branch_id}
                  style={{
                    background: '#fff',
                    borderRadius: '14px',
                    border: isConn ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    padding: '20px',
                    position: 'relative'
                  }}
                >
                  {/* رأس بطاقة الفرع */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                          {b.branch_name}
                        </h3>
                        <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '6px' }}>
                          ID: {b.branch_id}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        {b.branch_code ? `كود الفرع: ${b.branch_code}` : 'فرع صيدلية مسجل'}
                      </div>
                    </div>

                    {/* شارة الاتصال */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          background: isConn ? '#ecfdf5' : '#fef2f2',
                          color: isConn ? '#059669' : '#dc2626',
                          border: `1px solid ${isConn ? '#a7f3d0' : '#fecaca'}`,
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11.5px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isConn ? '#10b981' : '#ef4444'
                          }}
                        />
                        <span>{isConn ? 'متصل لحظياً' : 'غير متصل'}</span>
                      </span>
                    </div>
                  </div>

                  {/* إحصائيات الفرع السريعة */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '10px',
                      marginBottom: '16px',
                      border: '1px solid #f1f5f9'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>أصناف المخزون الحالية</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f766e' }}>
                        {(Number(b.synced_items_count) || 0).toLocaleString('ar-EG')} صنف
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>فواتير الشراء المستوردة</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0369a1' }}>
                        {(Number(b.synced_invoices_count) || 0).toLocaleString('ar-EG')} فاتورة
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2', borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '2px' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        <span>آخر مزامنة ناجحة:</span>
                        <strong style={{ color: '#334155' }}>
                          {b.last_sync_at ? new Date(b.last_sync_at).toLocaleString('ar-EG') : 'لم تتم أي مزامنة بعد'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* حقل مفتاح الربط للفرع (API Key) */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Key size={13} style={{ color: '#0f766e' }} />
                        <span>مفتاح الربط الآمن (Branch API Key)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleGenerateKey(b.branch_id, b.branch_name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284c7',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          padding: 0
                        }}
                      >
                        توليد مفتاح جديد 🔑
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="text"
                        readOnly
                        value={b.api_key || 'لم يتم توليد مفتاح بعد'}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          color: '#334155',
                          direction: 'ltr',
                          textAlign: 'left'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyKey(b.api_key, b.branch_id)}
                        disabled={!b.api_key}
                        style={{
                          background: copiedKeyId === b.branch_id ? '#10b981' : '#0f766e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0 12px',
                          cursor: b.api_key ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                        title="نسخ المفتاح لوضعه في سكريبت المزامنة"
                      >
                        {copiedKeyId === b.branch_id ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedKeyId === b.branch_id ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                  </div>

                  {/* تذييل البطاقة: تشغيل / تعطيل المزامنة */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleBranch(b.branch_id, isEnabled, b.branch_name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: isEnabled ? '#059669' : '#94a3b8',
                          fontWeight: 'bold',
                          fontSize: '12px'
                        }}
                      >
                        {isEnabled ? <ToggleRight size={26} style={{ color: '#10b981' }} /> : <ToggleLeft size={26} />}
                        <span>{isEnabled ? 'المزامنة مفعلة' : 'المزامنة متوقفة مؤقتاً'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStockBranch(b.branch_id);
                        setActiveSubSection('cross_stock');
                      }}
                      style={{
                        background: '#f0fdf4',
                        color: '#15803d',
                        border: '1px solid #bbf7d0',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>عرض المخزون</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. محتوى التبويب 2: استعلام المخزون الحي واقتراح التحويل الداخلي ── */}
      {activeSubSection === 'cross_stock' && (
        <div>
          {/* شريط البحث والفلترة */}
          <div
            style={{
              background: '#fff',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              marginBottom: '16px',
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <div style={{ flex: '1 1 260px', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', right: '12px', top: '12px', color: '#94a3b8' }} />
              <input
                type="text"
                className="outstock-form-input"
                placeholder="ابحث باسم الصنف بالعربي / الإنجليزي أو الباركود العالمي بالسكانر..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                style={{ paddingRight: '36px', width: '100%' }}
              />
            </div>

            <div style={{ minWidth: '180px' }}>
              <select
                className="outstock-form-select"
                value={selectedStockBranch}
                onChange={(e) => setSelectedStockBranch(e.target.value)}
              >
                <option value="all">كافة الفروع المتصلة</option>
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: '150px' }}>
              <select
                className="outstock-form-select"
                value={stockFilterType}
                onChange={(e) => setStockFilterType(e.target.value)}
              >
                <option value="all">كافة الحالات</option>
                <option value="in_stock">متوفر في المخزون فقط (&gt; 0)</option>
                <option value="zero_stock">الأرصدة الصفرية فقط (0)</option>
              </select>
            </div>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={loadStock}
              title="تحديث قائمة المخزون"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={isLoadingStock ? 'outstock-spin' : ''} />
              <span>تحديث</span>
            </button>
          </div>

          {/* جدول المخزون */}
          {isLoadingStock ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '12px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري استرجاع المخزون الموحد من الفروع...</div>
            </div>
          ) : stockItems.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <Package size={40} style={{ color: '#94a3b8', marginBottom: '10px' }} />
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#475569' }}>لا توجد أصناف تطابق معايير البحث</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                تأكد من تشغيل سكريبت المزامنة في جهاز سيرفر الفرع، أو جرّب البحث بكلمة أخرى
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '12px 14px' }}>الصنف / الدواء</th>
                    <th style={{ padding: '12px 14px' }}>الباركود</th>
                    <th style={{ padding: '12px 14px' }}>الفرع</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>الرصيد المتاح</th>
                    <th style={{ padding: '12px 14px' }}>سعر الجمهور</th>
                    <th style={{ padding: '12px 14px' }}>سعر التكلفة</th>
                    <th style={{ padding: '12px 14px' }}>التشغيلة والصلاحية</th>
                    <th style={{ padding: '12px 14px' }}>فرص التحويل الداخلي 💡</th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems.map((item, idx) => {
                    const qty = Number(item.quantity || 0);
                    const nameKey = (item.medication_name || '').toLowerCase().trim();
                    const allBranchesForThisMed = branchStockMap[nameKey] || [];
                    // هل يوجد فرع آخر لديه رصيد أكثر من 2 وهذا الفرع رصيده 0 أو منخفض؟
                    const otherBranchesWithStock = allBranchesForThisMed.filter(
                      (other) => other.branch_id !== item.branch_id && Number(other.quantity || 0) > 2
                    );

                    return (
                      <tr
                        key={`${item.branch_id}-${item.item_code}-${idx}`}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: idx % 2 === 1 ? '#fafafa' : '#fff'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                          <div>{item.medication_name}</div>
                          {item.item_code && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>كود: {item.item_code}</div>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: '#475569' }}>
                          {item.barcode || '-'}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 'bold'
                            }}
                          >
                            {item.branch_name || item.branch_id}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              background: qty > 5 ? '#ecfdf5' : qty > 0 ? '#fef3c7' : '#fee2e2',
                              color: qty > 5 ? '#047857' : qty > 0 ? '#b45309' : '#b91c1c',
                              padding: '4px 10px',
                              borderRadius: '16px',
                              fontSize: '12.5px',
                              fontWeight: '800'
                            }}
                          >
                            {qty} {item.unit || 'علبة'}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#334155' }}>
                          {Number(item.public_price || 0) > 0 ? `${Number(item.public_price).toFixed(2)} ج.م` : '-'}
                        </td>

                        <td style={{ padding: '12px 14px', color: '#059669', fontWeight: 'bold' }}>
                          {Number(item.buy_price || 0) > 0 ? `${Number(item.buy_price).toFixed(2)} ج.م` : '-'}
                        </td>

                        <td style={{ padding: '12px 14px', fontSize: '11.5px', color: '#475569' }}>
                          <div>{item.batch_number ? `تشغيلة: ${item.batch_number}` : '-'}</div>
                          {item.expiry_date && (
                            <div style={{ color: '#b45309', fontWeight: 'bold' }}>
                              صلاحية: {item.expiry_date.slice(0, 7)}
                            </div>
                          )}
                        </td>

                        {/* فرص التحويل الداخلي بين الفروع */}
                        <td style={{ padding: '12px 14px' }}>
                          {qty <= 1 && otherBranchesWithStock.length > 0 ? (
                            <div
                              style={{
                                background: '#f0fdf4',
                                border: '1px solid #86efac',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '11.5px',
                                color: '#166534',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <ArrowRightLeft size={14} style={{ color: '#15803d', flexShrink: 0 }} />
                              <div>
                                <strong>متوفر في: </strong>
                                {otherBranchesWithStock.map((o) => `${o.branch_name} (${o.quantity})`).join(', ')}
                              </div>
                            </div>
                          ) : qty > 5 ? (
                            <span style={{ fontSize: '11.5px', color: '#059669' }}>✅ مخزون وفير</span>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 5. محتوى التبويب 3: سجل عمليات المزامنة الحية ── */}
      {activeSubSection === 'sync_logs' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} style={{ color: '#0f766e' }} />
              <span>سجل التدقيق والمزامنة الحية للفروع (Sync Audit Logs)</span>
            </h3>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={loadLogs}
              title="تحديث السجلات"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={isLoadingLogs ? 'outstock-spin' : ''} />
              <span>تحديث السجل</span>
            </button>
          </div>

          {isLoadingLogs ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <RefreshCw className="outstock-spin" size={24} style={{ marginBottom: '8px' }} />
              <div>جاري تحميل السجلات...</div>
            </div>
          ) : syncLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
              لم يتم تسجيل أي عمليات مزامنة بعد
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '10px 12px' }}>الوقت والتاريخ</th>
                    <th style={{ padding: '10px 12px' }}>الفرع</th>
                    <th style={{ padding: '10px 12px' }}>نوع العملية</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>عناصر المخزون</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>فواتير الشراء</th>
                    <th style={{ padding: '10px 12px' }}>الحالة</th>
                    <th style={{ padding: '10px 12px' }}>عنوان IP والتفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#475569', fontFamily: 'monospace' }}>
                        {new Date(log.created_at).toLocaleString('ar-EG')}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>
                        {log.branch_name || log.branch_id}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            background: log.sync_type === 'sync_stock' ? '#e0f2fe' : log.sync_type === 'sync_invoices' ? '#fef3c7' : '#f1f5f9',
                            color: log.sync_type === 'sync_stock' ? '#0369a1' : log.sync_type === 'sync_invoices' ? '#b45309' : '#475569',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            fontSize: '11px'
                          }}
                        >
                          {log.sync_type === 'sync_stock' ? 'مزامنة مخزون' : log.sync_type === 'sync_invoices' ? 'مزامنة فواتير' : log.sync_type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                        {log.items_count || 0}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                        {log.invoices_count || 0}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {log.status === 'success' ? (
                          <span style={{ color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} />
                            <span>ناجحة</span>
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertCircle size={13} />
                            <span>فشلت: {log.error_message || 'خطأ'}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 6. نافذة دليل خطوات التفعيل وما المطلوب (Activation Guide Modal) ── */}
      {isActivationModalOpen && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '850px', width: '94%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1.5px solid #e2e8f0',
                paddingBottom: '14px',
                marginBottom: '18px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    background: '#ecfdf5',
                    color: '#059669',
                    padding: '8px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Server size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                    دليل خطوات التفعيل والربط الميداني لبرنامج Pharma Fly
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    كل ما تحتاجه لتشغيل المزامنة اللحظية في فروع الصيدلية خلال 5 دقائق
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => setIsActivationModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {/* محتوى الدليل التفاعلي */}
            <div style={{ lineHeight: 1.7, fontSize: '13.5px', color: '#334155' }}>
              {/* قسم 1: ما المطلوب في الصيدلية */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '18px'
                }}
              >
                <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} />
                  <span>1. ما المطلوب في كل فرع صيدلية؟ (Requirements)</span>
                </h4>
                <ul style={{ margin: 0, paddingRight: '22px' }}>
                  <li>
                    <strong>جهاز كمبيوتر السيرفر الرئيسي للفرع:</strong> الجهاز الذي يحتوي على قاعدة بيانات SQL Server لبرنامج فارما فلاي.
                  </li>
                  <li>
                    <strong>نظام التشغيل:</strong> Windows 10 أو 11 أو Windows 7/8 (يعمل تلقائياً بدون الحاجة لتثبيت أي برامج إضافية مثل Node.js أو Python).
                  </li>
                  <li>
                    <strong>اتصال إنترنت:</strong> إنترنت الصيدلية العادي (حجم البيانات المرسلة خفيف جداً ولا يستهلك باقة النت).
                  </li>
                  <li>
                    <strong>صلاحيات القراءة:</strong> السكريبت يقرأ البيانات فقط (Read-Only) ولا يعدل أو يمس إطلاقاً فواتير البيع أو حركة الكاشير في الصيدلية.
                  </li>
                </ul>
              </div>

              {/* قسم 2: خطوات التفعيل الخمسة */}
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '18px'
                }}
              >
                <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} />
                  <span>2. خطوات التفعيل البسيطة (5 دقائق فقط لكل فرع)</span>
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                      1
                    </div>
                    <div>
                      <strong>نسخ مفتاح الفرع (Branch API Key):</strong>
                      <div>
                        من هذه الصفحة، اختر بطاقة الفرع المطلوب واضغط على زر <strong>"نسخ"</strong> لمفتاح الربط الخاص به.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                      2
                    </div>
                    <div>
                      <strong>تنزيل حزمة الربط (PharmaFly Sync Agent):</strong>
                      <div>
                        انسخ مجلد <code>pharmafly-agent</code> إلى جهاز سيرفر الفرع (مثلاً على <code>C:\pharmafly-agent</code>).
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                      3
                    </div>
                    <div>
                      <strong>فحص قاعدة بيانات فارما فلاي تلقائياً:</strong>
                      <div>
                        اضغط كليك يمين على <code>probe-pharmafly.bat</code> واختر تشغيل كمسؤول (Run as Admin). ستقوم الأداة باكتشاف اسم قاعدة بيانات فارما فلاي والاتصال بنجاح.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                      4
                    </div>
                    <div>
                      <strong>تعديل ملف الإعدادات <code>config.json</code>:</strong>
                      <div>
                        ضع كود الفرع ومفتاح الربط (Branch API Key) المنسوخ من اللوحة داخل الملف.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}>
                      5
                    </div>
                    <div>
                      <strong>بدء المزامنة والتثبيت التلقائي:</strong>
                      <div>
                        اضغط كليك مرتين على <code>install-service.bat</code>، سيتم جدولة المزامنة لتعمل تلقائياً في الخلفية كل 10 دقائق دون أن تظهر أي شاشات أمام الكاشير أو تؤثر على سرعة الجهاز.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* قسم 3: الفوائد التشغيلية والمالية */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 20px'
                }}
              >
                <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowRightLeft size={18} />
                  <span>3. ماذا سيحدث فور اكتمال التفعيل؟</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 'bold', color: '#0f766e', marginBottom: '4px' }}>📦 استعلام مخزون الفروع</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      رؤية رصيد أي صنف دوائي في كافة الفروع بضغطة زر أو بالسكانر.
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 'bold', color: '#0369a1', marginBottom: '4px' }}>💡 تحويل النواقص داخلياً</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      توجيه طلبات العميل للفرع الذي يملك مخزون راكد بدلاً من الشراء الخارجي.
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontWeight: 'bold', color: '#d97706', marginBottom: '4px' }}>🧾 استيراد فواتير الشراء</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      فواتير الموردين المسجلة في فارما فلاي تنزل تلقائياً في حسابات الموردين بالنظام.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="outstock-btn outstock-btn-primary"
                onClick={() => setIsActivationModalOpen(false)}
                style={{ padding: '8px 24px', fontWeight: 'bold' }}
              >
                فهمت، جاهز للتطبيق 👍
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
