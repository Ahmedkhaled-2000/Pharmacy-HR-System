import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Calendar,
  Building2,
  User,
  Phone,
  FileText,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Printer,
  Send,
  MessageSquare,
  Check,
  X
} from 'lucide-react';
import {
  outstockGetOrderReturns,
  outstockReplyOrderReturn,
  outstockGetBranches
} from '../../../utils/outstockApiClient';
import { printReturnReceipt } from '../../../utils/printReturnReceipt';

export default function ProcurementReturnsTab({ showToast, categoryScope = null }) {
  const [returns, setReturns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeStatusFilter, setActiveStatusFilter] = useState('pending_procurement'); // 'all' | 'pending_procurement' | 'approved' | 'rejected'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [branches, setBranches] = useState([]);

  // نافذة رفض المرتجع
  const [rejectingReturn, setRejectingReturn] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // تحميل قائمة الفروع
  useEffect(() => {
    outstockGetBranches().then((res) => {
      if (res?.success && Array.isArray(res.branches)) {
        setBranches(res.branches);
      }
    }).catch(() => {});
  }, []);

  // جلب المرتجعات
  const fetchReturns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (selectedBranchId !== 'all') {
        params.branchId = selectedBranchId;
      }
      if (activeStatusFilter !== 'all') {
        params.status = activeStatusFilter;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await outstockGetOrderReturns(params);
      if (res?.success && Array.isArray(res.returns)) {
        setReturns(res.returns);
      } else {
        setReturns([]);
      }
    } catch (err) {
      console.error('[ProcurementReturnsTab Error]:', err);
      showToast?.('تعذر تحميل طلبات المرتجعات');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBranchId, activeStatusFilter, searchQuery, showToast]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  // إحصائيات سريعة
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let totalRefundSum = 0;

    returns.forEach((r) => {
      const st = r.status || 'pending_procurement';
      if (st === 'pending_procurement') pending++;
      else if (st === 'approved') approved++;
      else if (st === 'rejected') rejected++;

      totalRefundSum += parseFloat(r.total_refund_amount || 0);
    });

    return {
      total: returns.length,
      pending,
      approved,
      rejected,
      totalRefundSum
    };
  }, [returns]);

  // تصفية المرتجعات محلياً عند البحث
  const filteredReturns = useMemo(() => {
    if (!searchQuery.trim()) return returns;
    const q = searchQuery.toLowerCase().trim();
    return returns.filter((r) => {
      const ordNum = String(r.order_number || '').toLowerCase();
      const retId = String(r.id || '').toLowerCase();
      const cName = String(r.customer_name || '').toLowerCase();
      const cPhone = String(r.customer_phone || '').toLowerCase();
      const bName = String(r.branch_name || '').toLowerCase();
      const empName = String(r.created_by_name || '').toLowerCase();
      return (
        ordNum.includes(q) ||
        retId.includes(q) ||
        cName.includes(q) ||
        cPhone.includes(q) ||
        bName.includes(q) ||
        empName.includes(q)
      );
    });
  }, [returns, searchQuery]);

  // اعتماد المرتجع
  const handleApprove = async (ret) => {
    const downPayment = parseFloat(ret.down_payment_refund || 0);
    const confirmMsg = downPayment > 0
      ? `هل أنت متأكد من اعتماد طلب المرتجع #${ret.order_number}؟\nسيتم تسوية المخزون وإيداع العربون (${downPayment} ج.م) تلقائياً في محفظة العميل.`
      : `هل أنت متأكد من اعتماد طلب المرتجع #${ret.order_number} وتسوية الأصناف من عهدة الفرع؟`;

    if (!window.confirm(confirmMsg)) return;

    setIsSubmittingReply(true);
    try {
      const res = await outstockReplyOrderReturn(ret.id, {
        action: 'approve'
      });

      if (res?.success) {
        showToast?.('✅ تم اعتماد طلب المرتجع بنجاح وتسوية الرصيد والمخزون');
        fetchReturns();
      } else {
        showToast?.(res?.error || 'فشل اعتماد المرتجع');
      }
    } catch {
      showToast?.('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // فتح نافذة الرفض
  const handleOpenReject = (ret) => {
    setRejectingReturn(ret);
    setRejectionReason('');
  };

  // تأكيد الرفض مع إشعار المالك بالواتساب
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      showToast?.('⚠️ يرجى تدوين سبب الرفض بالتفصيل');
      return;
    }

    setIsSubmittingReply(true);
    try {
      const res = await outstockReplyOrderReturn(rejectingReturn.id, {
        action: 'reject',
        rejectionReason: rejectionReason.trim()
      });

      if (res?.success) {
        showToast?.('🚨 تم تسجيل رفض المرتجع وإخطار مالك المنظومة بالسبب عبر واتساب');
        setRejectingReturn(null);
        fetchReturns();
      } else {
        showToast?.(res?.error || 'فشل تسجيل الرفض');
      }
    } catch {
      showToast?.('حدث خطأ أثناء رفض المرتجع');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // طباعة إيصال المرتجع
  const handlePrint = (ret) => {
    try {
      printReturnReceipt({
        returnId: ret.id,
        orderNumber: ret.order_number,
        branchName: ret.branch_name || 'الفرع',
        customerName: ret.customer_name || '',
        customerPhone: ret.customer_phone || '',
        items: Array.isArray(ret.items) ? ret.items : [],
        totalRefundAmount: parseFloat(ret.total_refund_amount || 0),
        downPaymentRefund: parseFloat(ret.down_payment_refund || 0),
        generalReturnReason: ret.general_return_reason || '',
        refundDestination: ret.refund_destination || 'wallet',
        employeeCode: ret.created_by_code || '',
        employeeName: ret.created_by_name || '',
        date: ret.created_at
      });
    } catch (e) {
      console.error(e);
      showToast?.('فشل تشغيل أمر الطباعة الحرارية');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '6px 2px' }}>
      {/* ── 1. الهيدر والإحصائيات ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          padding: '20px 24px',
          color: '#ffffff',
          boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(236, 72, 153, 0.2)',
                border: '1px solid rgba(236, 72, 153, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotateCcw size={22} color="#f472b6" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900', color: '#f8fafc' }}>
                إدارة مرتجعات العملاء من الفروع ↩️
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94a3b8' }}>
                مراجعة واعتماد أو رفض طلبات المرتجعات، تسوية عهدة الفروع، وتحويل العربون تلقائياً لمحفظة العميل
              </p>
            </div>
          </div>
        </div>

        {/* بطاقات الإحصائيات السريعة */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '10px 16px',
              textAlign: 'center',
              minWidth: '95px'
            }}
          >
            <div style={{ fontSize: '11px', color: '#cbd5e1' }}>قيد الانتظار</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#fbbf24' }}>{stats.pending}</div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '10px 16px',
              textAlign: 'center',
              minWidth: '95px'
            }}
          >
            <div style={{ fontSize: '11px', color: '#cbd5e1' }}>معتمدة</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#4ade80' }}>{stats.approved}</div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '10px 16px',
              textAlign: 'center',
              minWidth: '95px'
            }}
          >
            <div style={{ fontSize: '11px', color: '#cbd5e1' }}>مرفوضة</div>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#f87171' }}>{stats.rejected}</div>
          </div>
        </div>
      </div>

      {/* ── 2. شريط الفلاتر والبحث ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}
      >
        {/* أزرار الحالات */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'pending_procurement', label: 'قيد انتظار المشتريات ⏳', count: stats.pending, color: '#f59e0b' },
            { id: 'approved', label: 'معتمدة ✅', count: stats.approved, color: '#10b981' },
            { id: 'rejected', label: 'مرفوضة ❌', count: stats.rejected, color: '#ef4444' },
            { id: 'all', label: 'الكل', count: stats.total, color: '#64748b' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStatusFilter(tab.id)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: '800',
                cursor: 'pointer',
                border: activeStatusFilter === tab.id ? `2px solid ${tab.color}` : '1px solid #e2e8f0',
                background: activeStatusFilter === tab.id ? `${tab.color}15` : '#ffffff',
                color: activeStatusFilter === tab.id ? tab.color : '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  background: activeStatusFilter === tab.id ? tab.color : '#e2e8f0',
                  color: activeStatusFilter === tab.id ? '#ffffff' : '#475569',
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* فلاتر البحث والفرع والتحديث */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: '1', justifyContent: 'flex-end' }}>
          {/* فلتر الفرع */}
          <select
            className="outstock-form-select"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            style={{ width: 'auto', minWidth: '160px', padding: '7px 10px', fontSize: '12.5px' }}
          >
            <option value="all">كافة الفروع 🏢</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name || b.branchName}</option>
            ))}
          </select>

          {/* حقل البحث */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="بحث بالطلب، العميل، الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="outstock-form-input"
              style={{ paddingRight: '30px', paddingLeft: '8px', fontSize: '12px', height: '34px' }}
            />
          </div>

          <button
            type="button"
            onClick={fetchReturns}
            className="outstock-btn outstock-btn-secondary"
            title="تحديث البيانات"
            style={{ padding: '7px 11px', height: '34px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'outstock-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 3. قائمة كروت المرتجعات ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <RefreshCw size={32} className="outstock-spin" style={{ marginBottom: '10px', color: '#f472b6' }} />
          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>جاري استرجاع طلبات المرتجعات...</div>
        </div>
      ) : filteredReturns.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#ffffff',
            borderRadius: '16px',
            border: '2px dashed #cbd5e1'
          }}
        >
          <RotateCcw size={44} style={{ color: '#cbd5e1', marginBottom: '12px' }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: '#475569' }}>لا توجد طلبات مرتجعات مطابقة</h3>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#94a3b8' }}>
            {activeStatusFilter === 'pending_procurement'
              ? 'ممتاز! لا توجد طلبات مرتجعات معلقة بحاجة لاعتمادك حالياً.'
              : 'لم يتم العثور على أي طلبات في هذه الحالة.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredReturns.map((ret) => {
            const items = Array.isArray(ret.items) ? ret.items : [];
            const isPending = ret.status === 'pending_procurement';
            const isApproved = ret.status === 'approved';
            const isRejected = ret.status === 'rejected';

            return (
              <div
                key={ret.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  border: '1.5px solid',
                  borderColor: isPending ? '#fde68a' : isApproved ? '#bbf7d0' : '#fecaca',
                  padding: '16px 20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* رأس الكارت */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        background: '#0f172a',
                        color: '#ffffff',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: '900',
                        letterSpacing: '0.5px'
                      }}
                    >
                      طلب رقم: #{ret.order_number}
                    </span>

                    <span
                      style={{
                        background: '#f1f5f9',
                        color: '#334155',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Building2 size={13} color="#0284c7" />
                      <span>{ret.branch_name || 'الفرع'}</span>
                    </span>

                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      {new Date(ret.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>

                  {/* بادج الحالة */}
                  <div>
                    {isPending && (
                      <span
                        style={{
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Clock size={13} />
                        <span>قيد انتظار رد المشتريات ⏳</span>
                      </span>
                    )}

                    {isApproved && (
                      <span
                        style={{
                          background: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <CheckCircle2 size={13} />
                        <span>معتمد من المشتريات ✅</span>
                      </span>
                    )}

                    {isRejected && (
                      <span
                        style={{
                          background: '#fef2f2',
                          color: '#991b1b',
                          border: '1px solid #fca5a5',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '800',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <XCircle size={13} />
                        <span>مرفوض من المشتريات ❌</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* بيانات العميل والموظف */}
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '12.5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <User size={13} color="#64748b" />
                      <span>العميل: <strong style={{ color: '#0f172a' }}>{ret.customer_name || 'غير محدد'}</strong></span>
                    </div>

                    {ret.customer_phone && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={13} color="#64748b" />
                        <span dir="ltr">{ret.customer_phone}</span>
                      </div>
                    )}

                    <div style={{ color: '#475569' }}>
                      نوع المرتجع: <strong>{ret.return_type === 'full' ? 'مرتجع كلي للطلب' : 'مرتجع جزئي للأصناف'}</strong>
                    </div>
                  </div>

                  <div style={{ color: '#64748b', fontSize: '11.5px' }}>
                    مسجل المرتجع بالفرع: <strong style={{ color: '#334155' }}>{ret.created_by_name}</strong> (كود: {ret.created_by_code})
                  </div>
                </div>

                {/* جدول الأصناف المرتجعة */}
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '8px 12px' }}>الصنف</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>الكمية</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>سعر الوحدة</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>إجمالي القيمة</th>
                        <th style={{ padding: '8px 12px' }}>سبب الإرجاع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#0f172a' }}>
                            {it.medicationName || it.name}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                            {it.quantity}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {parseFloat(it.unitPrice || 0).toFixed(2)} ج.م
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: '900', color: '#0d9488' }}>
                            {parseFloat(it.totalPrice || (it.unitPrice * it.quantity) || 0).toFixed(2)} ج.م
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {it.returnReason || ret.general_return_reason || 'غير محدد'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* الملخص المالي والسبب العام وملاحظات الرد */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
                    <div>
                      إجمالي قيمة الأصناف المرتجعة: <strong>{parseFloat(ret.total_refund_amount || 0).toFixed(2)} ج.م</strong>
                    </div>

                    {parseFloat(ret.down_payment_refund || 0) > 0 && (
                      <div
                        style={{
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 'bold'
                        }}
                      >
                        العربون المحول للمحفظة: <strong>{parseFloat(ret.down_payment_refund).toFixed(2)} ج.م</strong>
                        {ret.wallet_credited && <span style={{ marginRight: '6px', color: '#16a34a' }}>✓ تم الإيداع بالمحفظة</span>}
                      </div>
                    )}

                    <div style={{ color: '#64748b', fontSize: '12px' }}>
                      السبب العام: <em>{ret.general_return_reason}</em>
                    </div>
                  </div>

                  {/* أزرار الإجراءات */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handlePrint(ret)}
                      className="outstock-btn outstock-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title="طباعة إيصال مرتجع حراري"
                    >
                      <Printer size={14} />
                      <span>طباعة إيصال</span>
                    </button>

                    {isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApprove(ret)}
                          disabled={isSubmittingReply}
                          className="outstock-btn outstock-btn-success"
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Check size={14} />
                          <span>اعتماد المرتجع ✅</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenReject(ret)}
                          disabled={isSubmittingReply}
                          className="outstock-btn outstock-btn-danger"
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <X size={14} />
                          <span>رفض المرتجع ❌</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* تفاصيل رد المشتريات إن وجد */}
                {(isApproved || isRejected) && (
                  <div
                    style={{
                      background: isApproved ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${isApproved ? '#bbf7d0' : '#fca5a5'}`,
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: isApproved ? '#166534' : '#991b1b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <strong>رد المشتريات: </strong>
                      {isApproved ? 'تمت الموافقة وتسوية العهدة وسحب الأصناف.' : `تم الرفض بسبب: "${ret.procurement_rejection_reason || 'غير محدد'}"`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      بواسطة: {ret.procurement_replied_by || 'المشتريات'} في {new Date(ret.procurement_replied_at || ret.updated_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 4. نافذة رفض المرتجع مع إشعار المالك ── */}
      {rejectingReturn && (
        <div className="outstock-modal-overlay">
          <div className="outstock-modal-card" style={{ maxWidth: '480px', width: '92%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#dc2626" />
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>
                  رفض طلب مرتجع الطلب #{rejectingReturn.order_number}
                </h3>
              </div>
              <button
                type="button"
                className="outstock-btn-close"
                onClick={() => setRejectingReturn(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmReject}>
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#991b1b',
                  marginBottom: '14px'
                }}
              >
                🚨 <strong>تنبيه هندسي وأمان سيادي:</strong> عند رفض المرتجع، سيقوم النظام تلقائياً بإرسال رسالة واتساب فورية لمالك المنظومة بالسبب، لإحكام الرقابة وضمان عدم تعسف الإدارة في رفض مرتجعات الفروع.
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="outstock-form-label">سبب الرفض الإجباري *</label>
                <textarea
                  className="outstock-form-textarea"
                  rows={4}
                  required
                  placeholder="اكتب بالتفصيل سبب رفض إرجاع هذا الصنف..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ width: '100%', fontSize: '13px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="outstock-btn outstock-btn-secondary"
                  onClick={() => setRejectingReturn(null)}
                  disabled={isSubmittingReply}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="outstock-btn outstock-btn-danger"
                  disabled={isSubmittingReply}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSubmittingReply ? <RefreshCw size={14} className="outstock-spin" /> : <XCircle size={14} />}
                  <span>تأكيد الرفض وإشعار المالك 🚨</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
