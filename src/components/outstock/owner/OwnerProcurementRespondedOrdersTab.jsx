import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Building2,
  Users,
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  Truck,
  DollarSign,
  AlertTriangle,
  ArrowRightLeft,
  Tag,
  Package
} from 'lucide-react';
import { outstockGetOrders, outstockGetBranches } from '../../../utils/outstockApiClient';

/**
 * OwnerProcurementRespondedOrdersTab.jsx
 * أرشيف وسجل جميع الطلبات التي تم الرد عليها من إدارة المشتريات - بوابة المالك
 * - كشف تفصيلي بقرارات التوريد الصادرة من المشتريات
 * - متابعة أسماء الموردين المعتمدين والأسعار وتكلفة الشراء ومسؤول الرد
 * - فلترة متقدمة بالفرع، الصنف، نوع القرار، والتاريخ
 */
export default function OwnerProcurementRespondedOrdersTab({ showToast = alert }) {
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── الفلاتر ──
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedDecision, setSelectedDecision] = useState('all'); // 'all' | 'available' | 'unavailable' | 'pending'
  const [dateRangeType, setDateRangeType] = useState('month');
  const [customFromDate, setCustomFromDate] = useState('');
  const [customToDate, setCustomToDate] = useState('');

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
      console.warn('Fetch responded orders error:', e);
      showToast?.(`⚠️ خطأ في جلب أرشيف الردود: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // تفكيك الطلبات إلى بنود فردية تم الرد عليها
  const respondedItems = useMemo(() => {
    const list = [];

    orders.forEach((ord) => {
      const items = Array.isArray(ord.items) ? ord.items : [];
      items.forEach((it) => {
        // نعتبر البند تم الرد عليه إذا كان له procurementRepliedAt أو procurement_replied_at أو تغيرت حالته عن pending
        const isReplied = Boolean(
          it.procurementRepliedAt ||
          it.procurement_replied_at ||
          ord.procurement_replied_at ||
          (it.itemStatus && it.itemStatus !== 'pending') ||
          (it.item_status && it.item_status !== 'pending')
        );

        if (isReplied) {
          list.push({
            orderId: ord.id,
            orderNumber: ord.order_number,
            branchId: ord.branch_id,
            branchName: ord.branch_name || 'الفرع',
            customerName: ord.customer_name,
            customerPhone: ord.customer_phone,
            pharmacistName: ord.order_receiver_name || ord.responsible_pharmacist || 'صيدلي الفرع',
            pharmacistCode: ord.order_receiver_code,
            itemId: it.id,
            medicationName: it.medicationName || it.medication_name,
            quantity: it.quantity || 1,
            unitType: it.unitType || it.unit_type || 'علبة',
            unitPrice: it.unitPrice || it.unit_price || 0,
            itemType: it.itemType || it.item_type || 'medication',
            itemStatus: it.itemStatus || it.item_status || 'pending',
            procurementNotes: it.procurementNotes || it.procurement_notes,
            procurementRepliedBy: it.procurementRepliedBy || it.procurement_replied_by || ord.procurement_replied_by || 'إدارة المشتريات',
            procurementRepliedAt: it.procurementRepliedAt || it.procurement_replied_at || ord.procurement_replied_at || ord.created_at,
            createdAt: ord.created_at,
            supplierName: it.supplier_name || it.supplierName || 'المخزن / مورد معتمد'
          });
        }
      });
    });

    return list;
  }, [orders]);

  // تطبيق الفلاتر
  const filteredItems = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    return respondedItems.filter((item) => {
      // فلتر الفرع
      if (selectedBranch !== 'all' && item.branchId !== selectedBranch) return false;

      // فلتر القرار
      const st = String(item.itemStatus || '').toLowerCase();
      if (selectedDecision === 'available' && !st.includes('available') && st !== 'delivered') return false;
      if (selectedDecision === 'unavailable' && !st.includes('unavailable')) return false;

      // فلتر التاريخ
      const itemDateStr = (item.procurementRepliedAt || item.createdAt || '').slice(0, 10);
      if (itemDateStr) {
        if (dateRangeType === 'today' && itemDateStr !== todayStr) return false;
        if (dateRangeType === 'week') {
          const past = new Date();
          past.setDate(past.getDate() - 7);
          const pastStr = past.toISOString().slice(0, 10);
          if (itemDateStr < pastStr || itemDateStr > todayStr) return false;
        }
        if (dateRangeType === 'month') {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
          if (itemDateStr < firstDay || itemDateStr > todayStr) return false;
        }
        if (dateRangeType === 'custom') {
          if (customFromDate && itemDateStr < customFromDate) return false;
          if (customToDate && itemDateStr > customToDate) return false;
        }
      }

      // البحث
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const med = String(item.medicationName || '').toLowerCase();
        const ord = String(item.orderNumber || '').toLowerCase();
        const cust = String(item.customerName || '').toLowerCase();
        const resp = String(item.procurementRepliedBy || '').toLowerCase();
        const supp = String(item.supplierName || '').toLowerCase();

        return med.includes(q) || ord.includes(q) || cust.includes(q) || resp.includes(q) || supp.includes(q);
      }

      return true;
    });
  }, [respondedItems, selectedBranch, selectedDecision, dateRangeType, customFromDate, customToDate, searchQuery]);

  // إحصائيات القرارات
  const stats = useMemo(() => {
    const total = filteredItems.length;
    let fulfilled = 0;
    let unavailable = 0;
    let other = 0;

    filteredItems.forEach((it) => {
      const s = String(it.itemStatus || '').toLowerCase();
      if (s.includes('available') || s === 'delivered') fulfilled += 1;
      else if (s.includes('unavailable')) unavailable += 1;
      else other += 1;
    });

    const fulfillmentRate = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
    return { total, fulfilled, unavailable, other, fulfillmentRate };
  }, [filteredItems]);

  // تصدير لملف CSV
  const handleExportCSV = () => {
    if (filteredItems.length === 0) {
      showToast?.('⚠️ لا توجد بيانات للتصدير');
      return;
    }

    const headers = [
      'رقم الطلب',
      'الفرع',
      'الصيدلي المحرر',
      'اسم الدواء',
      'الكمية',
      'سعر الوحدة (ج.م)',
      'قرار المشتريات',
      'مسؤول المشتريات',
      'المورد المعتمد',
      'تاريخ ووقت الرد',
      'ملاحظات المشتريات'
    ];

    const rows = filteredItems.map((it) => [
      it.orderNumber,
      `"${it.branchName}"`,
      `"${it.pharmacistName}"`,
      `"${it.medicationName}"`,
      it.quantity,
      it.unitPrice,
      `"${it.itemStatus}"`,
      `"${it.procurementRepliedBy}"`,
      `"${it.supplierName}"`,
      `"${new Date(it.procurementRepliedAt).toLocaleString('ar-EG')}"`,
      `"${it.procurementNotes || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `أرشيف_ردود_المشتريات_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── بطاقات الإحصائيات المركزية ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي الأصناف التي تم الرد عليها</p>
            <h3 style={{ color: '#0f766e' }}>{stats.total} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Package size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف تم توفيرها بنجاح (Available)</p>
            <h3 style={{ color: '#16a34a' }}>{stats.fulfilled} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircle2 size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>أصناف غير متوفرة بالسوق (عجز سوقي)</p>
            <h3 style={{ color: '#dc2626' }}>{stats.unavailable} صنف</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <XCircle size={22} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>نسبة نجاح التلبية العامة</p>
            <h3 style={{ color: stats.fulfillmentRate >= 60 ? '#16a34a' : '#d97706' }}>
              {stats.fulfillmentRate}%
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <DollarSign size={22} />
          </div>
        </div>
      </div>

      {/* ── شريط الفلاتر والبحث ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
            <div className="outstock-search-bar" style={{ flex: '1 1 240px' }}>
              <Search size={16} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="ابحث باسم الدواء، رقم الطلب، العميل، أو مسؤول المشتريات..."
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

            {/* فلتر قرار المشتريات */}
            <select
              value={selectedDecision}
              onChange={(e) => setSelectedDecision(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '160px', height: '40px' }}
            >
              <option value="all">كافة قرارات المشتريات</option>
              <option value="available">تم التوفير بنجاح ✅</option>
              <option value="unavailable">عجز سوقي غير متوفر ❌</option>
            </select>

            {/* فلتر التاريخ */}
            <select
              value={dateRangeType}
              onChange={(e) => setDateRangeType(e.target.value)}
              className="outstock-form-select"
              style={{ minWidth: '130px', height: '40px' }}
            >
              <option value="today">اليوم</option>
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
              onClick={fetchData}
              title="تحديث البيانات"
            >
              <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={handleExportCSV}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              title="تصدير لملف Excel"
            >
              <FileSpreadsheet size={15} color="#16a34a" />
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── جدول كشف ردود المشتريات التفصيلي ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>🗄️ سجل وأرشيف الأصناف التي تم حسمها والرد عليها</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: 'bold' }}>
              ({filteredItems.length} صنف مسجل)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <RefreshCw size={24} className="outstock-spin" style={{ margin: '0 auto 12px auto' }} />
            <p>جاري استرجاع سجلات وقرارات المشتريات...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748b' }}>
            <CheckCircle2 size={36} style={{ opacity: 0.3, margin: '0 auto 10px auto' }} />
            <p style={{ fontWeight: 'bold' }}>لا توجد طلبات تم الرد عليها تطابق خيارات الفلترة المحددة</p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>الفرع الطالب</th>
                  <th>صنف الدواء</th>
                  <th>الكمية</th>
                  <th>السعر</th>
                  <th>قرار المشتريات</th>
                  <th>مسؤول المشتريات</th>
                  <th>المورد المعتمد</th>
                  <th>تاريخ ووقت الرد</th>
                  <th>ملاحظات المشتريات</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => {
                  const s = String(it.itemStatus || '').toLowerCase();
                  const isAvailable = s.includes('available') || s === 'delivered';
                  const isUnavailable = s.includes('unavailable');

                  return (
                    <tr key={idx}>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{it.orderNumber}</strong>
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: '#0f766e' }}>
                          {it.branchName}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '10.5px',
                            background: it.itemType === 'cosmetics' ? '#fce7f3' : '#e0f2fe',
                            color: it.itemType === 'cosmetics' ? '#be185d' : '#0369a1',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 'bold'
                          }}>
                            {it.itemType === 'cosmetics' ? '💄 مستحضر' : '💊 دواء'}
                          </span>
                          <strong style={{ color: '#0f172a' }}>{it.medicationName}</strong>
                        </div>
                      </td>

                      <td>
                        <strong>{it.quantity}</strong> {it.unitType}
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: '#0284c7' }}>
                          {parseFloat(it.unitPrice || 0).toFixed(2)} ج.م
                        </span>
                      </td>

                      <td>
                        <span
                          className={`outstock-badge ${isAvailable ? 'success' : isUnavailable ? 'danger' : 'info'}`}
                          style={{ fontWeight: 800 }}
                        >
                          {isAvailable ? 'تم التوفير بنجاح ✅' : isUnavailable ? 'غير متوفر بالسوق ❌' : 'قيد التوريد'}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontWeight: 'bold', color: '#334155' }}>
                          {it.procurementRepliedBy}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Truck size={11} /> {it.supplierName}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                          {new Date(it.procurementRepliedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {it.procurementNotes || '—'}
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
