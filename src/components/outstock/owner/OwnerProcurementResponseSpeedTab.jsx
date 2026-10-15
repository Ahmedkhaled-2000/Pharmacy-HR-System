import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Sliders,
  Building2,
  Users,
  Search,
  Filter,
  RefreshCw,
  Zap,
  Flame,
  Calendar,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { outstockGetOrders, outstockGetBranches, outstockGetSettings, outstockSaveSettings } from '../../../utils/outstockApiClient';
import {
  calculateNetBusinessMinutes,
  formatSlaDuration,
  WEEK_DAYS_NAMES_AR,
  DEFAULT_SLA_WORKING_HOURS_CONFIG
} from '../../../utils/outstockSlaEngine';

/**
 * OwnerProcurementResponseSpeedTab.jsx
 * شاشة رادار ومتابعة سرعة رد إدارة المشتريات على طلبات الفروع (Procurement SLA Tracker)
 * - احتساب الفارق الزمني اللحظي بالدقائق بين رفع طلب الفرع ورد المشتريات
 * - مصفوفة السرعة (Speed SLA Buckets): فوري 🟢، قياسي 🟡، متأخر 🔴، حرج 🚨
 * - إمكانية تغيير أوقات مصفوفة السرعة (Speed SLA Buckets) من قبل المالك وحفظها بالمنظومة ⚙️
 * - تصنيف وتحليل سرعة الرد لكل فرع ولكل مسؤول مشتريات
 * - استبعاد العطلات الرسمية وساعات غير العمل من احتساب مدة الاستجابة 🕒
 */
export default function OwnerProcurementResponseSpeedTab({ showToast = alert }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── إعدادات مصفوفة السرعة المخصصة للمالك ──
  // القيمة الافتراضية: فوري <= 15 د، قياسي <= 45 د، متأخر <= 120 د، حرج > 120 د
  const [slaBuckets, setSlaBuckets] = useState(() => {
    try {
      const saved = localStorage.getItem('outstock_speed_sla_buckets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      fastMinutes: 15,
      standardMinutes: 45,
      lateMinutes: 120
    };
  });

  // ── إعدادات ساعات العمل والعطلات المستثناة من احتساب SLA ──
  const [workingHoursConfig, setWorkingHoursConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('outstock_procurement_working_hours');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_SLA_WORKING_HOURS_CONFIG;
  });

  // نافذة ضبط وتعديل أوقات مصفوفة السرعة وساعات العمل
  const [isSlaConfigModalOpen, setIsSlaConfigModalOpen] = useState(false);
  const [editFastMin, setEditFastMin] = useState(15);
  const [editStandardMin, setEditStandardMin] = useState(45);
  const [editLateMin, setEditLateMin] = useState(120);
  const [editExcludedDays, setEditExcludedDays] = useState([5]);
  const [editWorkStartHour, setEditWorkStartHour] = useState(9);
  const [editWorkEndHour, setEditWorkEndHour] = useState(18);
  const [editUseWorkingHoursOnly, setEditUseWorkingHoursOnly] = useState(true);
  const [isSavingSla, setIsSavingSla] = useState(false);

  // ── الفلاتر ──
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedSpeedFilter, setSelectedSpeedFilter] = useState('all'); // 'all' | 'fast' | 'standard' | 'late' | 'critical'
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeType, setDateRangeType] = useState('month');

  // جلب إعدادات المنظومة المخزنة
  useEffect(() => {
    outstockGetSettings().then((res) => {
      if (res?.success && res.settings) {
        if (res.settings.speedSlaBuckets) {
          setSlaBuckets(res.settings.speedSlaBuckets);
          try {
            localStorage.setItem('outstock_speed_sla_buckets', JSON.stringify(res.settings.speedSlaBuckets));
          } catch {}
        }
        if (res.settings.procurementSlaWorkingHours || res.settings.procurement_sla_working_hours) {
          const wh = res.settings.procurementSlaWorkingHours || res.settings.procurement_sla_working_hours;
          setWorkingHoursConfig(wh);
          try {
            localStorage.setItem('outstock_procurement_working_hours', JSON.stringify(wh));
          } catch {}
        }
      }
    }).catch(() => {});
  }, []);

  // جلب الطلبات
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [ordRes, bRes] = await Promise.all([
        outstockGetOrders({ limit: 1000 }),
        outstockGetBranches().catch(() => null)
      ]);

      if (ordRes?.success && Array.isArray(ordRes.orders)) {
        setOrders(ordRes.orders);
      }
      if (bRes?.success && Array.isArray(bRes.branches)) {
        setBranches(bRes.branches);
      }
    } catch (e) {
      console.warn('Fetch SLA orders error:', e);
      showToast?.(`⚠️ خطأ في جلب بيانات سرعة الرد: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // فتح نافذة ضبط معايير مصفوفة السرعة وساعات العمل
  const handleOpenSlaConfig = () => {
    setEditFastMin(slaBuckets.fastMinutes || 15);
    setEditStandardMin(slaBuckets.standardMinutes || 45);
    setEditLateMin(slaBuckets.lateMinutes || 120);

    setEditExcludedDays(workingHoursConfig.excludedDays || [5]);
    setEditWorkStartHour(workingHoursConfig.workStartHour ?? 9);
    setEditWorkEndHour(workingHoursConfig.workEndHour ?? 18);
    setEditUseWorkingHoursOnly(workingHoursConfig.useWorkingHoursOnly !== false);

    setIsSlaConfigModalOpen(true);
  };

  // حفظ معايير مصفوفة السرعة وساعات العمل الجديدة
  const handleSaveSlaConfig = async (e) => {
    e.preventDefault();
    const fast = parseInt(editFastMin, 10);
    const standard = parseInt(editStandardMin, 10);
    const late = parseInt(editLateMin, 10);

    if (isNaN(fast) || fast <= 0) {
      showToast?.('⚠️ يرجى إدخال حد زمني صحيح للرد الفوري');
      return;
    }
    if (isNaN(standard) || standard <= fast) {
      showToast?.('⚠️ الحد القياسي يجب أن يكون أكبر من الحد الفوري');
      return;
    }
    if (isNaN(late) || late <= standard) {
      showToast?.('⚠️ حد الرد المتأخر يجب أن يكون أكبر من الحد القياسي');
      return;
    }

    const newBuckets = { fastMinutes: fast, standardMinutes: standard, lateMinutes: late };
    const newWorkingHours = {
      excludedDays: editExcludedDays,
      workStartHour: parseInt(editWorkStartHour, 10) || 9,
      workStartMinute: 0,
      workEndHour: parseInt(editWorkEndHour, 10) || 18,
      workEndMinute: 0,
      useWorkingHoursOnly: Boolean(editUseWorkingHoursOnly)
    };

    setIsSavingSla(true);
    try {
      const res = await outstockSaveSettings({
        speedSlaBuckets: newBuckets,
        procurementSlaWorkingHours: newWorkingHours
      });
      if (res?.success) {
        setSlaBuckets(newBuckets);
        setWorkingHoursConfig(newWorkingHours);
        try {
          localStorage.setItem('outstock_speed_sla_buckets', JSON.stringify(newBuckets));
          localStorage.setItem('outstock_procurement_working_hours', JSON.stringify(newWorkingHours));
        } catch {}
        showToast?.('✅ تم حفظ وتحديث معايير مصفوفة سرعة الرد وساعات الدوام بنجاح!');
        setIsSlaConfigModalOpen(false);
      } else {
        showToast?.(`⚠️ فشل الحفظ: ${res?.error || 'خطأ غير معروف'}`);
      }
    } catch (err) {
      showToast?.(`❌ خطأ: ${err.message}`);
    } finally {
      setIsSavingSla(false);
    }
  };

  // تحليل الطلبات واحتساب أوقات الرد الفعلية بالدقائق وتصنيفها مستبعداً العطلات وساعات الإغلاق
  const analyzedOrders = useMemo(() => {
    const fastLimit = slaBuckets.fastMinutes || 15;
    const stdLimit = slaBuckets.standardMinutes || 45;
    const lateLimit = slaBuckets.lateMinutes || 120;

    return orders.map((o) => {
      const createdAt = new Date(o.sent_to_procurement_at || o.created_at);
      const repliedAt = o.procurement_replied_at ? new Date(o.procurement_replied_at) : null;

      let responseMinutes = null;
      let bucket = 'pending'; // 'fast' | 'standard' | 'late' | 'critical' | 'pending'

      if (repliedAt && !isNaN(repliedAt.getTime()) && !isNaN(createdAt.getTime())) {
        responseMinutes = calculateNetBusinessMinutes(createdAt, repliedAt, workingHoursConfig);

        if (responseMinutes <= fastLimit) {
          bucket = 'fast';
        } else if (responseMinutes <= stdLimit) {
          bucket = 'standard';
        } else if (responseMinutes <= lateLimit) {
          bucket = 'late';
        } else {
          bucket = 'critical';
        }
      } else {
        // طلب لم يتم الرد عليه بعد: نقيس مدة الانتظار الفعلية حتى اللحظة مستبعداً ساعات الإغلاق
        const waitMin = calculateNetBusinessMinutes(createdAt, new Date(), workingHoursConfig);
        responseMinutes = waitMin;
        if (waitMin > lateLimit) {
          bucket = 'critical';
        } else if (waitMin > stdLimit) {
          bucket = 'late';
        } else {
          bucket = 'pending';
        }
      }

      return {
        ...o,
        createdAt,
        repliedAt,
        responseMinutes,
        isReplied: Boolean(repliedAt),
        bucket
      };
    });
  }, [orders, slaBuckets, workingHoursConfig]);

  // تطبيق الفلاتر
  const filteredOrders = useMemo(() => {
    return analyzedOrders.filter((o) => {
      if (selectedBranch !== 'all' && o.branch_id !== selectedBranch) return false;
      if (selectedSpeedFilter !== 'all' && o.bucket !== selectedSpeedFilter) return false;

      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const num = String(o.order_number || '').toLowerCase();
        const bName = String(o.branch_name || '').toLowerCase();
        const cName = String(o.customer_name || '').toLowerCase();
        const respBy = String(o.procurement_replied_by || '').toLowerCase();

        return num.includes(q) || bName.includes(q) || cName.includes(q) || respBy.includes(q);
      }
      return true;
    });
  }, [analyzedOrders, selectedBranch, selectedSpeedFilter, searchQuery]);

  // إحصائيات المؤشرات القيادية
  const metrics = useMemo(() => {
    const repliedOnly = analyzedOrders.filter((o) => o.isReplied);
    const totalReplied = repliedOnly.length;

    let totalMinutes = 0;
    let fastCount = 0;
    let standardCount = 0;
    let lateCount = 0;
    let criticalCount = 0;

    repliedOnly.forEach((o) => {
      totalMinutes += o.responseMinutes;
      if (o.bucket === 'fast') fastCount += 1;
      else if (o.bucket === 'standard') standardCount += 1;
      else if (o.bucket === 'late') lateCount += 1;
      else if (o.bucket === 'critical') criticalCount += 1;
    });

    const avgMinutes = totalReplied > 0 ? Math.round(totalMinutes / totalReplied) : 0;
    const fastRate = totalReplied > 0 ? Math.round((fastCount / totalReplied) * 100) : 0;
    const lateRate = totalReplied > 0 ? Math.round(((lateCount + criticalCount) / totalReplied) * 100) : 0;

    return {
      totalReplied,
      avgMinutes,
      fastCount,
      standardCount,
      lateCount,
      criticalCount,
      fastRate,
      lateRate
    };
  }, [analyzedOrders]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── شريط الترويسة وأزرار التحكم بالمعايير ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px', borderRadius: '12px' }}>
            <Zap size={26} color="#fbbf24" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
              ⚡ رادار ومؤشر سرعة استجابة المشتريات (Procurement Response SLA)
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#c7d2fe', marginTop: '3px' }}>
              مراقبة سرعة الرد بالدقائق على طلبات الفروع مع تحكم كامل للمالك في أوقات مصفوفة السرعة
            </p>
          </div>
        </div>

        {/* زر ضبط معايير مصفوفة السرعة (Speed SLA Buckets) */}
        <button
          type="button"
          className="outstock-btn"
          style={{
            background: '#fbbf24',
            color: '#1e1b4b',
            border: 'none',
            fontWeight: 800,
            fontSize: '13px',
            padding: '8px 16px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
          }}
          onClick={handleOpenSlaConfig}
          title="تغيير أوقات وحدود مصفوفة السرعة (فوري / قياسي / متأخر)"
        >
          <Sliders size={16} />
          <span>⚙️ ضبط أوقات مصفوفة السرعة (SLA)</span>
        </button>
      </div>

      {/* ── بطاقات مصفوفة السرعة الأربعة المحدثة وفق إعداد المالك ── */}
      <div className="outstock-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>متوسط سرعة الرد العامة</p>
            <h3 style={{ color: metrics.avgMinutes <= slaBuckets.fastMinutes ? '#16a34a' : '#0284c7' }}>
              {metrics.avgMinutes} دقيقة
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <Clock size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>رد فوري ممتاز (≤ {slaBuckets.fastMinutes} دقيقة)</p>
            <h3 style={{ color: '#16a34a' }}>
              {metrics.fastCount} طلب ({metrics.fastRate}%)
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Zap size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>رد قياسي جيد ({slaBuckets.fastMinutes} - {slaBuckets.standardMinutes} دقيقة)</p>
            <h3 style={{ color: '#d97706' }}>{metrics.standardCount} طلب</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>ردود متأخرة أو حرجة (&gt; {slaBuckets.standardMinutes} دقيقة)</p>
            <h3 style={{ color: '#dc2626' }}>
              {metrics.lateCount + metrics.criticalCount} طلب ({metrics.lateRate}%)
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
            <div className="outstock-search-bar" style={{ flex: '1 1 240px' }}>
              <Search size={16} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="ابحث برقم الطلب، الفرع، العميل، أو مسؤول المشتريات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

            {/* فلتر تصنيف السرعة */}
            <select
              value={selectedSpeedFilter}
              onChange={(e) => setSelectedSpeedFilter(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '170px', height: '40px' }}
            >
              <option value="all">كافة مستويات السرعة</option>
              <option value="fast">🟢 رد فوري (≤ {slaBuckets.fastMinutes} دقيقة)</option>
              <option value="standard">🟡 رد قياسي ({slaBuckets.fastMinutes} - {slaBuckets.standardMinutes} دقيقة)</option>
              <option value="late">🔴 رد متأخر ({slaBuckets.standardMinutes} - {slaBuckets.lateMinutes} دقيقة)</option>
              <option value="critical">🚨 رد حرج جداً (&gt; {slaBuckets.lateMinutes} دقيقة)</option>
              <option value="pending">⏳ طلبات معلقة بانتظار الرد</option>
            </select>
          </div>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchData}
            title="تحديث البيانات اللحظية"
          >
            <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* ── جدول كشف سرعة الرد على الطلبات ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>⏱️ كشف أزمنة الرد التفصيلية لطلبات الفروع</span>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              ({filteredOrders.length} طلب معروض)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 12px auto' }} />
            <p>جاري قياس واحتساب أزمنة سرعة رد المشتريات...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <Clock size={36} style={{ opacity: 0.3, margin: '0 auto 10px auto' }} />
            <p style={{ fontWeight: 'bold' }}>لا توجد طلبات تطابق خيارات البحث ومستوى السرعة المحدد</p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>فرع الصيدلية</th>
                  <th>زمن الرد المستغرق</th>
                  <th>تصنيف السرعة (SLA)</th>
                  <th>تاريخ إرسال الطلب</th>
                  <th>تاريخ ووقت رد المشتريات</th>
                  <th>مسؤول المشتريات الذي رد</th>
                  <th>حالة الطلب</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => {
                  let badgeBg = '#f1f5f9';
                  let badgeColor = '#475569';
                  let label = 'معلق';

                  if (ord.bucket === 'fast') {
                    badgeBg = '#dcfce7';
                    badgeColor = '#15803d';
                    label = 'فوري ممتاز ⚡';
                  } else if (ord.bucket === 'standard') {
                    badgeBg = '#fef3c7';
                    badgeColor = '#b45309';
                    label = 'قياسي مقنع 👍';
                  } else if (ord.bucket === 'late') {
                    badgeBg = '#fee2e2';
                    badgeColor = '#b91c1c';
                    label = 'متأخر ⚠️';
                  } else if (ord.bucket === 'critical') {
                    badgeBg = '#450a0a';
                    badgeColor = '#fecaca';
                    label = 'حرج جداً 🚨';
                  }

                  return (
                    <tr key={ord.id}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{ord.order_number}</strong>
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: '#0f766e' }}>
                          {ord.branch_name}
                        </span>
                      </td>

                      <td>
                        <strong style={{ fontSize: '14px', color: ord.bucket === 'fast' ? '#16a34a' : ord.bucket === 'late' || ord.bucket === 'critical' ? '#dc2626' : '#d97706' }}>
                          {ord.responseMinutes} دقيقة
                        </strong>
                      </td>

                      <td>
                        <span style={{
                          background: badgeBg,
                          color: badgeColor,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '11.5px',
                          display: 'inline-block'
                        }}>
                          {label}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: '#475569' }}>
                          {ord.createdAt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: ord.repliedAt ? '#0f172a' : '#94a3b8' }}>
                          {ord.repliedAt ? ord.repliedAt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : 'بانتظار الرد...'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: '#334155' }}>
                          {ord.procurement_replied_by || '—'}
                        </span>
                      </td>

                      <td>
                        <span className={`outstock-badge ${ord.order_status === 'delivered' ? 'success' : ord.order_status === 'cancelled' ? 'danger' : 'info'}`}>
                          {ord.order_status === 'delivered' ? 'مسلم' : ord.order_status === 'cancelled' ? 'ملغي' : 'نشط'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة تعديل أوقات مصفوفة السرعة (Speed SLA Buckets Configuration Modal) ── */}
      {isSlaConfigModalOpen && (
        <div className="outstock-modal-backdrop" onClick={() => !isSavingSla && setIsSlaConfigModalOpen(false)}>
          <div className="outstock-modal-panel" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={20} color="#0f766e" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  تخصيص أوقات مصفوفة سرعة الرد (Speed SLA Thresholds)
                </h3>
              </div>
              <button
                className="outstock-modal-close"
                onClick={() => !isSavingSla && setIsSlaConfigModalOpen(false)}
                disabled={isSavingSla}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSlaConfig}>
              <div className="outstock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
                  بصفتك المالك، يمكنك تحديد المعايير الزمنية (بالدقائق) التي تُقاس عليها كفاءة إدارة المشتريات وتُصنف بها سرعة الرد:
                </p>

                {/* 1. حد الرد الفوري */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                  <label className="outstock-form-label" style={{ color: '#166534', fontWeight: 800 }}>
                    🟢 الحد الأقصى للرد الفوري (ممتاز):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      min="1"
                      className="outstock-form-input"
                      value={editFastMin}
                      onChange={(e) => setEditFastMin(e.target.value)}
                      required
                      disabled={isSavingSla}
                      style={{ width: '120px', fontWeight: 'bold' }}
                    />
                    <span style={{ fontSize: '13px', color: '#166534' }}>
                      دقيقة أو أقل (الافتراضي 15 دقيقة)
                    </span>
                  </div>
                </div>

                {/* 2. حد الرد القياسي */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px' }}>
                  <label className="outstock-form-label" style={{ color: '#92400e', fontWeight: 800 }}>
                    🟡 الحد الأقصى للرد القياسي (جيد):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      min={parseInt(editFastMin, 10) + 1 || 2}
                      className="outstock-form-input"
                      value={editStandardMin}
                      onChange={(e) => setEditStandardMin(e.target.value)}
                      required
                      disabled={isSavingSla}
                      style={{ width: '120px', fontWeight: 'bold' }}
                    />
                    <span style={{ fontSize: '13px', color: '#92400e' }}>
                      دقيقة (الافتراضي 45 دقيقة)
                    </span>
                  </div>
                </div>

                {/* 3. حد الرد المتأخر والحرج */}
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px' }}>
                  <label className="outstock-form-label" style={{ color: '#991b1b', fontWeight: 800 }}>
                    🔴 حد الرد المتأخر / الحرج جداً (تنبيه وإنذار):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="number"
                      min={parseInt(editStandardMin, 10) + 1 || 3}
                      className="outstock-form-input"
                      value={editLateMin}
                      onChange={(e) => setEditLateMin(e.target.value)}
                      required
                      disabled={isSavingSla}
                      style={{ width: '120px', fontWeight: 'bold' }}
                    />
                    <span style={{ fontSize: '13px', color: '#991b1b' }}>
                      دقيقة (أي طلب يتجاوز هذا الوقت يُصنف كـ حرج جداً 🚨)
                    </span>
                  </div>
                </div>

                {/* 4. قواعد استثناء العطلات وساعات غير العمل */}
                <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={16} color="#0f766e" />
                      <span>قواعد استثناء العطلات وساعات العمل (Business Hours SLA):</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 700, color: '#0f766e' }}>
                      <input
                        type="checkbox"
                        checked={editUseWorkingHoursOnly}
                        onChange={(e) => setEditUseWorkingHoursOnly(e.target.checked)}
                        style={{ accentColor: '#0f766e', width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>تفعيل استثناء العطلات وساعات الإغلاق</span>
                    </label>
                  </div>

                  {editUseWorkingHoursOnly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                      {/* اختيار أيام العطلات الأسبوعية */}
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                          أيام العطلات الأسبوعية المستثناة من احتساب زمن الرد:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {WEEK_DAYS_NAMES_AR.map((day) => {
                            const isExcluded = editExcludedDays.includes(day.id);
                            return (
                              <button
                                key={day.id}
                                type="button"
                                onClick={() => {
                                  setEditExcludedDays((prev) =>
                                    prev.includes(day.id) ? prev.filter((d) => d !== day.id) : [...prev, day.id]
                                  );
                                }}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: isExcluded ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                                  background: isExcluded ? '#fee2e2' : '#ffffff',
                                  color: isExcluded ? '#991b1b' : '#475569',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {day.name} {isExcluded ? '🛑 (عطلة)' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ساعات العمل اليومية الرسمية */}
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                          ساعات الدوام اليومي الرسمي للمشتريات:
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>من الساعة:</span>
                            <select
                              value={editWorkStartHour}
                              onChange={(e) => setEditWorkStartHour(parseInt(e.target.value, 10))}
                              className="outstock-form-input"
                              style={{ width: '120px', fontWeight: 'bold' }}
                            >
                              {Array.from({ length: 24 }).map((_, h) => (
                                <option key={h} value={h}>
                                  {String(h).padStart(2, '0')}:00 {h < 12 ? 'صباحاً' : 'مساءً'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>إلى الساعة:</span>
                            <select
                              value={editWorkEndHour}
                              onChange={(e) => setEditWorkEndHour(parseInt(e.target.value, 10))}
                              className="outstock-form-input"
                              style={{ width: '120px', fontWeight: 'bold' }}
                            >
                              {Array.from({ length: 24 }).map((_, h) => (
                                <option key={h} value={h}>
                                  {String(h).padStart(2, '0')}:00 {h < 12 ? 'صباحاً' : 'مساءً'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                          * الطلبات التي تُرفع خارج هذا النطاق الزمني أو أثناء أيام العطلات لا يُحتسب وقتها كمهلة تأخير.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="outstock-modal-footer">
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setIsSlaConfigModalOpen(false)}
                  disabled={isSavingSla}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-primary"
                  disabled={isSavingSla}
                >
                  {isSavingSla ? 'جاري الحفظ...' : 'حفظ وتطبيق المعايير فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
