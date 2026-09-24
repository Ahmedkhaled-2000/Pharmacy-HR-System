import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Send, Search, Building2, Package, Check, AlertCircle } from 'lucide-react';
import { outstockGetProcurementAggregated, outstockProcurementItemAction } from '../../../utils/outstockApiClient';

/**
 * ProcurementOrdersTab.jsx
 * شاشة طلبات الفروع المجمعة لإدارة المشتريات
 * - استلام أصناف مجمعة لكل فرع على حدة (Aggregated Item Model)
 * - تحديد ما تم توفيره بالفرع وما هو غير متوفر بالسوق
 * - شحن الأصناف المتوفرة لرصيد الفرع، أو شطب غير المتوفر وتحويله لنواقص الصيدلية
 */
export default function ProcurementOrdersTab({ showToast }) {
  const [aggregatedData, setAggregatedData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // قرارات الشراء المعلقة قبل الإرسال (Staged Decisions)
  // Map of `${branchId}_${medicationName}_${unitType}` -> 'available' | 'unavailable'
  const [decisions, setDecisions] = useState({});

  const fetchAggregatedOrders = async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetProcurementAggregated();
      if (res?.success && Array.isArray(res.aggregated)) {
        setAggregatedData(res.aggregated);
      }
    } catch (e) {
      console.warn('Fetch aggregated orders error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAggregatedOrders();
  }, []);

  // استخراج قائمة الفروع الفريدة
  const branchesList = useMemo(() => {
    const map = new Map();
    aggregatedData.forEach(item => {
      if (item.branch_id && !map.has(item.branch_id)) {
        map.set(item.branch_id, item.branch_name || item.branch_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [aggregatedData]);

  // تعيين قرار لصنف معين
  const handleSetDecision = (key, action) => {
    setDecisions(prev => ({
      ...prev,
      [key]: prev[key] === action ? undefined : action
    }));
  };

  // إرسال قرار فردي فوري
  const handleQuickAction = async (item, action) => {
    const actionLabel = action === 'available' ? 'توفير الصنف وشحنه لرصيد الفرع' : 'تحديد الصنف كغير متوفر وشطبه من الفواتير';
    if (!window.confirm(`هل أنت متأكد من ${actionLabel} (${item.medication_name}) لفرع (${item.branch_name})؟`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const res = await outstockProcurementItemAction({
        branchId: item.branch_id,
        medicationName: item.medication_name,
        unitType: item.unit_type,
        action,
        itemIds: (item.item_details || []).map(d => d.itemId)
      });

      if (res?.success) {
        showToast?.(`✅ ${res.message || 'تم تحديث حالة الصنف بنجاح'}`);
        fetchAggregatedOrders();
      } else {
        showToast?.(`⚠️ ${res?.error || 'تعذر تطبيق القرار'}`);
      }
    } catch (err) {
      showToast?.('حدث خطأ أثناء إرسال التحديث');
    } finally {
      setIsProcessing(false);
    }
  };

  // إرسال دفعة القرارات المحددة معاً للفرع
  const handleBatchSubmit = async () => {
    const keys = Object.keys(decisions).filter(k => decisions[k]);
    if (keys.length === 0) {
      showToast?.('يرجى تحديد قرار (متوفر أو غير متوفر) لصنف واحد على الأقل أولاً');
      return;
    }

    if (!window.confirm(`هل تريد إرسال (${keys.length}) قرار دفعة واحدة للفروع المعنية والمزامنة اللحظية؟`)) {
      return;
    }

    setIsProcessing(true);
    try {
      let successCount = 0;
      for (const item of filteredItems) {
        const key = `${item.branch_id}_${item.medication_name}_${item.unit_type}`;
        const action = decisions[key];
        if (action) {
          await outstockProcurementItemAction({
            branchId: item.branch_id,
            medicationName: item.medication_name,
            unitType: item.unit_type,
            action,
            itemIds: (item.item_details || []).map(d => d.itemId)
          });
          successCount++;
        }
      }

      showToast?.(`✅ تم إرسال وتطبيق (${successCount}) تحديث بنجاح ومزامنتها مع الفروع فورياً`);
      setDecisions({});
      fetchAggregatedOrders();
    } catch (err) {
      showToast?.('حدث خطأ أثناء إرسال الدفعة');
    } finally {
      setIsProcessing(false);
    }
  };

  // تطبيق الفلاتر
  const filteredItems = useMemo(() => {
    return aggregatedData.filter(item => {
      if (selectedBranchId !== 'all' && item.branch_id !== selectedBranchId) {
        return false;
      }
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase();
        const med = String(item.medication_name || '').toLowerCase();
        const bName = String(item.branch_name || '').toLowerCase();
        return med.includes(q) || bName.includes(q);
      }
      return true;
    });
  }, [aggregatedData, selectedBranchId, searchQuery]);

  return (
    <div>
      {/* ── شريط الفلاتر واختيار الفرع ── */}
      <div className="outstock-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
            <div className="outstock-search-bar" style={{ flex: 1 }}>
              <Search size={18} className="outstock-search-icon" />
              <input
                type="text"
                placeholder="🔍 ابحث باسم الدواء أو الفرع..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="outstock-search-input"
              />
            </div>

            {/* قائمة اختيار الفرع المحدد */}
            <div style={{ minWidth: '180px' }}>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="outstock-form-select"
                style={{ height: '42px' }}
              >
                <option value="all">🏢 جميع الفروع ({branchesList.length})</option>
                {branchesList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={fetchAggregatedOrders}
              title="تحديث البيانات"
            >
              <RefreshCw size={15} />
              <span>تحديث</span>
            </button>

            {Object.keys(decisions).filter(k => decisions[k]).length > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                className="outstock-btn outstock-btn-primary"
                onClick={handleBatchSubmit}
              >
                <Send size={15} />
                <span>إرسال القرارات المحددة ({Object.keys(decisions).filter(k => decisions[k]).length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── جدول الطلبات المجمعة لكل فرع ── */}
      <div className="outstock-card">
        <div className="outstock-card-header">
          <h3 className="outstock-card-title">
            <span>📦 طلبات الأدوية المجمعة حسب الفرع</span>
            <span style={{ fontSize: '13px', color: '#0d9488', fontWeight: '800' }}>
              ({filteredItems.length} صنف مطلوب للشراء)
            </span>
          </h3>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            جاري تجميع طلبات الفروع...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#64748b' }}>
            <div style={{ fontSize: '42px', marginBottom: '10px' }}>✨</div>
            <h4 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '16px', fontWeight: '800' }}>
              لا توجد طلبات أدوية جديدة معلقة من الفروع
            </h4>
            <p style={{ margin: 0, fontSize: '13px' }}>
              تم الرد على وتوريد كافة طلبات الأدوية الواردة من الصيدليات بنجاح.
            </p>
          </div>
        ) : (
          <div className="outstock-table-wrap">
            <table className="outstock-table">
              <thead>
                <tr>
                  <th>الفرع الطالب</th>
                  <th>صنف الدواء</th>
                  <th>الوحدة المطلوبة</th>
                  <th>إجمالي الكمية</th>
                  <th>عدد طلبات العملاء</th>
                  <th>القرار السريع لإدارة المشتريات</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const key = `${item.branch_id}_${item.medication_name}_${item.unit_type}`;
                  const decision = decisions[key];

                  return (
                    <tr
                      key={idx}
                      style={{
                        background: decision === 'available' ? '#f0fdf4' : decision === 'unavailable' ? '#fef2f2' : 'inherit'
                      }}
                    >
                      <td>
                        <span style={{
                          background: '#f1f5f9',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontWeight: '800',
                          fontSize: '12.5px',
                          color: '#0f766e'
                        }}>
                          <Building2 size={12} style={{ display: 'inline' }} /> {item.branch_name || item.branch_id}
                        </span>
                      </td>

                      <td>
                        <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>
                          {item.medication_name}
                        </strong>
                      </td>

                      <td>
                        {item.unit_type === 'strip' ? (
                          <span style={{ color: '#0284c7', fontWeight: 'bold' }}>شريط 💊</span>
                        ) : (
                          <span style={{ color: '#059669', fontWeight: 'bold' }}>علبة كاملة 📦</span>
                        )}
                      </td>

                      <td>
                        <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                          {item.total_requested_qty}
                        </strong>
                      </td>

                      <td>
                        <span className="outstock-badge partial">
                          {item.orders_count} عملاء
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {/* زر التوفير */}
                          <button
                            type="button"
                            disabled={isProcessing}
                            className={`outstock-btn ${decision === 'available' ? 'outstock-btn-success' : 'outstock-btn-secondary'}`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12.5px',
                              borderColor: '#10b981'
                            }}
                            onClick={() => handleSetDecision(key, 'available')}
                            title="تحديد لتوفيره وإضافته لرصيد الفرع"
                          >
                            <CheckCircle2 size={14} color={decision === 'available' ? '#ffffff' : '#16a34a'} />
                            <span>متوفر بالفرع</span>
                          </button>

                          {/* زر عدم التوفر */}
                          <button
                            type="button"
                            disabled={isProcessing}
                            className={`outstock-btn ${decision === 'unavailable' ? 'outstock-btn-danger' : 'outstock-btn-secondary'}`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12.5px',
                              borderColor: '#ef4444'
                            }}
                            onClick={() => handleSetDecision(key, 'unavailable')}
                            title="تحديد كصنف ناقص بالسوق وشطبه من الفاتورة"
                          >
                            <XCircle size={14} color={decision === 'unavailable' ? '#ffffff' : '#dc2626'} />
                            <span>غير متوفر بالسوق</span>
                          </button>

                          {/* خيار الإرسال الفوري المباشر لهذا الصنف */}
                          <button
                            type="button"
                            disabled={isProcessing || !decision}
                            className="outstock-btn outstock-btn-primary"
                            style={{
                              padding: '6px 10px',
                              fontSize: '11.5px',
                              opacity: decision ? 1 : 0.4,
                              cursor: decision ? 'pointer' : 'not-allowed'
                            }}
                            onClick={() => handleQuickAction(item, decision)}
                            title="إرسال القرار فوراً للفرع الآن"
                          >
                            <Send size={12} />
                            <span>إرسال للفرع</span>
                          </button>
                        </div>
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
