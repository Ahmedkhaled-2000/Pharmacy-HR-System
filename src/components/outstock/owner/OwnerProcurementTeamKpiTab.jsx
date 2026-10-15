import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Award,
  Search,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Building2,
  Package,
  DollarSign,
  Zap,
  ShieldCheck
} from 'lucide-react';
import { outstockGetOrders, outstockGetBranches } from '../../../utils/outstockApiClient';

/**
 * OwnerProcurementTeamKpiTab.jsx
 * شاشة تقييم ومتابعة أداء مسؤولي فريق المشتريات (الأفراد) - بوابة المالك
 * - كشف تفصيلي بمؤشرات إنجاز كل عضو في فريق المشتريات
 * - نسبة التلبية الفردية، عدد الأصناف المتوفرة، أصناف العجز، ومتوسط سرعة الرد
 */
export default function OwnerProcurementTeamKpiTab({ showToast = alert }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [dateRangeType, setDateRangeType] = useState('month');

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
      console.warn('Fetch procurement team KPI error:', e);
      showToast?.(`⚠️ خطأ في جلب بيانات أداء فريق المشتريات: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // تجميع الأداء حسب كل مسؤول مشتريات
  const teamPerformance = useMemo(() => {
    const map = new Map();

    orders.forEach((ord) => {
      const items = Array.isArray(ord.items) ? ord.items : [];
      items.forEach((it) => {
        const repliedBy = it.procurementRepliedBy || it.procurement_replied_by || ord.procurement_replied_by;
        if (!repliedBy || !String(repliedBy).trim()) return;

        const officerName = String(repliedBy).trim();

        if (!map.has(officerName)) {
          map.set(officerName, {
            name: officerName,
            totalHandled: 0,
            fulfilledCount: 0,
            unavailableCount: 0,
            pendingCount: 0,
            totalValueFulfilled: 0,
            totalResponseMinutes: 0,
            ordersRepliedCount: 0,
            items: []
          });
        }

        const entry = map.get(officerName);
        entry.totalHandled += 1;
        entry.items.push({ ...it, orderNumber: ord.order_number, branchName: ord.branch_name });

        const s = String(it.itemStatus || it.item_status || '').toLowerCase();
        const price = parseFloat(it.totalPrice || it.total_price || (it.quantity * it.unitPrice) || 0);

        if (s.includes('available') || s === 'delivered') {
          entry.fulfilledCount += 1;
          entry.totalValueFulfilled += price;
        } else if (s.includes('unavailable')) {
          entry.unavailableCount += 1;
        } else {
          entry.pendingCount += 1;
        }

        // قياس سرعة الرد
        const repliedAt = it.procurementRepliedAt || it.procurement_replied_at || ord.procurement_replied_at;
        const createdAt = it.sentToProcurementAt || ord.sent_to_procurement_at || ord.created_at;
        if (repliedAt && createdAt) {
          const diffMs = new Date(repliedAt).getTime() - new Date(createdAt).getTime();
          if (diffMs > 0) {
            entry.totalResponseMinutes += Math.round(diffMs / 60000);
            entry.ordersRepliedCount += 1;
          }
        }
      });
    });

    const list = Array.from(map.values()).map((emp) => {
      const fulfillmentRate = emp.totalHandled > 0 ? Math.round((emp.fulfilledCount / emp.totalHandled) * 100) : 0;
      const avgResponseMin = emp.ordersRepliedCount > 0 ? Math.round(emp.totalResponseMinutes / emp.ordersRepliedCount) : 0;

      return {
        ...emp,
        fulfillmentRate,
        avgResponseMin
      };
    });

    return list.sort((a, b) => b.fulfilledCount - a.fulfilledCount || b.fulfillmentRate - a.fulfillmentRate);
  }, [orders]);

  // تصفية مسؤولي المشتريات
  const filteredTeam = useMemo(() => {
    return teamPerformance.filter((emp) => {
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        return emp.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [teamPerformance, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── كروت التقييم والشرف لمسؤولي المشتريات ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #134e4a 0%, #042f2e 100%)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#ffffff',
          boxShadow: '0 10px 25px -5px rgba(19, 78, 74, 0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '10px', borderRadius: '12px' }}>
            <Award size={26} color="#5eead4" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
              👤 مصفوفة تقييم أداء مسؤولي إدارة المشتريات (Individual KPIs)
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#99f6e4', marginTop: '3px' }}>
              قياس كفاءة كل موظف في حسم النواقص، نسب التلبية المحققة، وسرعة الاستجابة للفروع
            </p>
          </div>
        </div>

        <button
          type="button"
          className="outstock-btn"
          style={{
            background: '#2dd4bf',
            color: '#042f2e',
            fontWeight: 800,
            fontSize: '12.5px',
            border: 'none',
            padding: '8px 14px',
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onClick={fetchData}
        >
          <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
          <span>تحديث الإحصائيات</span>
        </button>
      </div>

      {/* ── بطاقات الإحصائيات العامة ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عدد مسؤولي المشتريات المتفاعلين</p>
            <h3 style={{ color: '#0f766e' }}>{teamPerformance.length} مسؤول</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Users size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أعلى نسبة تلبية محققة</p>
            <h3 style={{ color: '#16a34a' }}>
              {teamPerformance.length > 0 ? `${teamPerformance[0].fulfillmentRate}%` : '0%'}
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي الأصناف التي تم تدبيرها</p>
            <h3 style={{ color: '#0284c7' }}>
              {teamPerformance.reduce((acc, t) => acc + t.fulfilledCount, 0)} صنف
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أسرع متوسط استجابة مسجل</p>
            <h3 style={{ color: '#d97706' }}>
              {teamPerformance.length > 0 ? `${Math.min(...teamPerformance.map(t => t.avgResponseMin || 999))} دقيقة` : '—'}
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* ── شريط البحث ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div className="outstock-search-bar" style={{ flex: '1 1 280px' }}>
            <Search size={16} className="outstock-search-icon" />
            <input
              type="text"
              placeholder="ابحث باسم مسؤول المشتريات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-search-input"
            />
          </div>

          <span style={{ fontSize: '13px', color: '#64748b' }}>
            مقارنة تقييم الأداء للأفراد بناءً على الأصناف التي تم حسمها
          </span>
        </div>
      </div>

      {/* ── جدول كشف أداء أعضاء المشتريات ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>📊 بطاقات تقييم مسؤولي المشتريات</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: 'bold' }}>
              ({filteredTeam.length} مسؤول)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 12px auto' }} />
            <p>جاري استخراج وتحليل مؤشرات أداء فريق المشتريات...</p>
          </div>
        ) : filteredTeam.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <Users size={36} style={{ opacity: 0.3, margin: '0 auto 10px auto' }} />
            <p style={{ fontWeight: 'bold' }}>لم يتم تسجيل ردود بالاسم لأعضاء المشتريات حتى الآن</p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>مسؤول المشتريات</th>
                  <th>إجمالي الأصناف المستلمة</th>
                  <th>تم توفيرها بنجاح</th>
                  <th>أصناف عجز سوقي</th>
                  <th>نسبة تلبية النواقص %</th>
                  <th>متوسط سرعة الرد</th>
                  <th>قيمة البضائع المدبرة</th>
                  <th>التقييم العام</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeam.map((officer, idx) => {
                  let ratingLabel = 'ممتاز 🌟';
                  let ratingColor = '#16a34a';

                  if (officer.fulfillmentRate < 50) {
                    ratingLabel = 'يحتاج تحسين ⚠️';
                    ratingColor = '#dc2626';
                  } else if (officer.fulfillmentRate < 70) {
                    ratingLabel = 'جيد 👍';
                    ratingColor = '#d97706';
                  }

                  return (
                    <tr key={idx}>
                      <td>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{officer.name}</strong>
                      </td>

                      <td>
                        <strong style={{ fontSize: '13.5px' }}>{officer.totalHandled}</strong> صنف
                      </td>

                      <td>
                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>
                          {officer.fulfilledCount} صنف
                        </span>
                      </td>

                      <td>
                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                          {officer.unavailableCount} صنف
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '55px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${officer.fulfillmentRate}%`, height: '100%', background: officer.fulfillmentRate >= 70 ? '#16a34a' : officer.fulfillmentRate >= 50 ? '#d97706' : '#dc2626' }} />
                          </div>
                          <strong style={{ fontSize: '13px' }}>{officer.fulfillmentRate}%</strong>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: officer.avgResponseMin <= 15 ? '#16a34a' : '#d97706' }}>
                          {officer.avgResponseMin > 0 ? `${officer.avgResponseMin} دقيقة` : 'فوري'}
                        </span>
                      </td>

                      <td>
                        <strong style={{ color: '#0284c7' }}>
                          {officer.totalValueFulfilled.toFixed(2)} ج.م
                        </strong>
                      </td>

                      <td>
                        <span style={{
                          background: officer.fulfillmentRate >= 70 ? '#dcfce7' : officer.fulfillmentRate >= 50 ? '#fef3c7' : '#fee2e2',
                          color: ratingColor,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '11.5px'
                        }}>
                          {ratingLabel}
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
    </div>
  );
}
