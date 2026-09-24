import React, { useState, useEffect } from 'react';
import { Building2, Package, CheckCircle, Clock, DollarSign, RefreshCw, ChevronRight } from 'lucide-react';
import { outstockGetOwnerOverview, outstockGetBranchStock } from '../../../utils/outstockApiClient';

/**
 * OwnerBranchOrdersTab.jsx
 * شاشة طلبات الفروع والأرصدة للمالك والمشرف العام
 * - متابعة طلبات كل فرع ونسب التسليم
 * - متابعة رصيد أصناف النواقص المحتجزة داخل كل فرع
 */
export default function OwnerBranchOrdersTab({ showToast }) {
  const [overview, setOverview] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchStock, setSelectedBranchStock] = useState(null);
  const [branchStockList, setBranchStockList] = useState([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  const fetchOverview = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOwnerOverview();
      if (res?.success) {
        setOverview(res);
      }
    } catch (e) {
      console.warn('Fetch owner overview error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleViewBranchStock = async (branch) => {
    setSelectedBranchStock(branch);
    setIsLoadingStock(true);
    try {
      const res = await outstockGetBranchStock(branch.id);
      if (res?.success && Array.isArray(res.stock)) {
        setBranchStockList(res.stock);
      } else {
        setBranchStockList([]);
      }
    } catch (e) {
      setBranchStockList([]);
    } finally {
      setIsLoadingStock(false);
    }
  };

  const summary = overview?.summary || {};
  const branches = overview?.branches || [];

  return (
    <div>
      {/* ── ملخص أداء الفروع ── */}
      <div className="outstock-stats-grid">
        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>إجمالي طلبات الفروع المسجلة</p>
            <h3 style={{ color: '#0f766e' }}>{summary.total_orders || 0} طلب</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#ccfbf1', color: '#0f766e' }}>
            <Building2 size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>الطلبات المسلمة للعملاء</p>
            <h3 style={{ color: '#16a34a' }}>{summary.delivered_orders || 0} مكتمل</h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>الطلبات قيد المتابعة والتجهيز</p>
            <h3 style={{ color: '#d97706' }}>
              {(parseInt(summary.pending_procurement_orders || 0, 10) + parseInt(summary.ready_orders || 0, 10))} معلق
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
            <Clock size={24} />
          </div>
        </div>

        <div className="outstock-stat-card">
          <div className="outstock-stat-info">
            <p>عربونات نقدية محصلة</p>
            <h3 style={{ color: '#0284c7' }}>
              {parseFloat(summary.total_deposits_collected || 0).toFixed(2)} ج.م
            </h3>
          </div>
          <div className="outstock-stat-icon" style={{ background: '#e0f2fe', color: '#0284c7' }}>
            <DollarSign size={24} />
          </div>
        </div>
      </div>

      {/* ── جدول أداء كل فرع ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>🏢 كشف طلبات وأرصدة الفروع والصيدليات</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({branches.length} فرع)
            </span>
          </h3>

          <button
            type="button"
            className="outstock-btn outstock-btn-secondary"
            onClick={fetchOverview}
            title="تحديث البيانات"
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري فحص مؤشرات الفروع...
          </div>
        ) : branches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            لا توجد فروع مسجلة بالنظام حتى الآن
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>اسم الفرع</th>
                  <th>الهاتف</th>
                  <th>إجمالي الطلبات</th>
                  <th>الطلبات المسلمة</th>
                  <th>الطلبات المعلقة</th>
                  <th>نسبة الإنجاز</th>
                  <th>العربون المحصل</th>
                  <th>المتبقي للتحصيل</th>
                  <th>رصيد الأصناف بالفرع</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => {
                  const total = parseInt(b.total_orders || 0, 10);
                  const delivered = parseInt(b.delivered_orders || 0, 10);
                  const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;

                  return (
                    <tr key={b.id}>
                      <td>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>{b.name}</strong>
                      </td>
                      <td>{b.phone || '—'}</td>
                      <td><strong>{total}</strong></td>
                      <td>
                        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{delivered}</span>
                      </td>
                      <td>
                        <span style={{ color: '#d97706', fontWeight: 'bold' }}>{b.active_orders || 0}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            flex: 1,
                            minWidth: '60px',
                            height: '6px',
                            background: '#e2e8f0',
                            borderRadius: '99px',
                            overflow: 'hidden'
                          }}>
                            <div style={{ width: `${rate}%`, height: '100%', background: rate >= 70 ? '#10b981' : '#f59e0b' }} />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{rate}%</span>
                        </div>
                      </td>
                      <td>{parseFloat(b.paid_amount || 0).toFixed(2)} ج.م</td>
                      <td>
                        <strong style={{ color: '#dc2626' }}>{parseFloat(b.remaining_amount || 0).toFixed(2)} ج.م</strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          style={{ padding: '5px 12px', fontSize: '12px' }}
                          onClick={() => handleViewBranchStock(b)}
                        >
                          <Package size={13} />
                          <span>عرض الرصيد</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── نافذة استعراض رصيد أصناف الفرع ── */}
      {selectedBranchStock && (
        <div className="outstock-modal-backdrop" onClick={() => setSelectedBranchStock(null)}>
          <div className="outstock-modal-panel modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="outstock-modal-drag-handle" />
            <div className="outstock-modal-header">
              <h3>
                📦 رصيد أصناف النواقص في: <strong>{selectedBranchStock.name}</strong>
              </h3>
              <button className="outstock-modal-close" onClick={() => setSelectedBranchStock(null)}>
                ×
              </button>
            </div>

            <div className="outstock-modal-body">
              {isLoadingStock ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  جاري جلب بيانات الرصيد...
                </div>
              ) : branchStockList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  لا يوجد رصيد أصناف محتجز حالياً في هذا الفرع.
                </div>
              ) : (
                <div className="outstock-table-wrap">
                  <table className="outstock-table">
                    <thead>
                      <tr>
                        <th>صنف الدواء</th>
                        <th>الوحدة</th>
                        <th>الرصيد المتاح حالياً</th>
                        <th>الكمية المسلمة للعملاء</th>
                        <th>آخر تاريخ توريد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchStockList.map((stk, idx) => (
                        <tr key={idx}>
                          <td><strong>{stk.medication_name}</strong></td>
                          <td>{stk.unit_type === 'strip' ? 'شريط' : 'علبة'}</td>
                          <td>
                            <strong style={{ color: '#16a34a', fontSize: '14px' }}>
                              {stk.available_quantity}
                            </strong>
                          </td>
                          <td>{stk.delivered_quantity || 0}</td>
                          <td>
                            {stk.last_procured_at ? new Date(stk.last_procured_at).toLocaleDateString('ar-EG') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="outstock-modal-footer">
              <button type="button" className="outstock-btn outstock-btn-secondary" onClick={() => setSelectedBranchStock(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
