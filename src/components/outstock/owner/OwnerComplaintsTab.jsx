import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Package, User, Phone, Building2, MessageSquare, Send, Check, RefreshCw, Filter } from 'lucide-react';
import { outstockGetOwnerComplaints, outstockUpdateComplaintStatus, outstockListenBroadcast, listenToOutstockLocalMessages } from '../../../utils/outstockApiClient';
import { getSocket } from '../../../utils/socketClient';

/**
 * OwnerComplaintsTab.jsx
 * صفحة "شكاوى الفروع المصعدة للمالك" في بوابة المالك
 * تحولت من نافذة منبثقة (Modal) إلى صفحة رئيسية متكاملة
 * مزودة بفلاتر:
 * - قيد انتظار رد وقرار المالك
 * - تم الرد والاعتماد من قبل المالك
 * - كافة الشكاوى
 */
export default function OwnerComplaintsTab({ showToast }) {
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending_owner'); // 'all' | 'pending_owner' | 'resolved'
  const [resolvingId, setResolvingId] = useState(null);
  const [ownerReplyText, setOwnerReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOwnerComplaints({
        status: filterStatus === 'all' ? undefined : filterStatus
      });
      if (res?.success && Array.isArray(res.complaints)) {
        setComplaints(res.complaints);
      } else {
        setComplaints([]);
      }
    } catch (e) {
      console.warn('Fetch owner complaints error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => fetchComplaints();
    if (socket) {
      socket.on('outstock:complaint_updated', handleUpdate);
      socket.on('outstock:owner_complaint_escalation', handleUpdate);
    }
    const unsubLocal = (typeof outstockListenBroadcast === 'function' ? outstockListenBroadcast : listenToOutstockLocalMessages)(() => {
      fetchComplaints();
    });
    return () => {
      if (socket) {
        socket.off('outstock:complaint_updated', handleUpdate);
        socket.off('outstock:owner_complaint_escalation', handleUpdate);
      }
      unsubLocal?.();
    };
  }, [fetchComplaints]);

  const handleResolve = async (complaintId) => {
    if (!ownerReplyText.trim()) {
      showToast?.('⚠️ يرجى كتابة قرار وتوجيه المالك قبل الاعتماد');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await outstockUpdateComplaintStatus(complaintId, {
        status: 'resolved',
        ownerReply: ownerReplyText.trim(),
        ownerNotes: ownerReplyText.trim()
      });
      if (res?.success) {
        showToast?.('👑 تم اعتماد قرار المالك بنجاح وإغلاق الشكوى');
        setResolvingId(null);
        setOwnerReplyText('');
        fetchComplaints();
      } else {
        showToast?.('❌ ' + (res?.error || 'فشل التحديث'));
      }
    } catch {
      showToast?.('❌ حدث خطأ أثناء الاعتماد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingOwnerCount = complaints.filter(c => c.status !== 'resolved').length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* الترويسة الرئيسية */}
      <div className="outstock-card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)', border: '1.5px solid #fecdd3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e11d48', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(225, 29, 72, 0.3)' }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#881337' }}>
                شكاوى الفروع المصعدة للمالك 🚨
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#be123c' }}>
                الشكاوى المرفوعة للمالك بخصوص تأخر الرد أو النواقص مع الاطلاع على توضيح المشتريات واتخاذ القرار
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchComplaints}
            disabled={isLoading}
            className="outstock-btn outstock-btn-secondary"
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
        </div>

        {/* فلاتر الحالات */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('pending_owner')}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'pending_owner' ? '2px solid #e11d48' : '1px solid #fecdd3',
              background: filterStatus === 'pending_owner' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'pending_owner' ? '#881337' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>⏳ قيد رد وقرار المالك</span>
            <span style={{ background: '#ffe4e6', color: '#e11d48', padding: '2px 8px', borderRadius: '12px', fontSize: '11.5px' }}>
              {pendingOwnerCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'resolved' ? '2px solid #16a34a' : '1px solid #bbf7d0',
              background: filterStatus === 'resolved' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'resolved' ? '#15803d' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>✅ تم الرد والاعتماد من قبل المالك</span>
            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '11.5px' }}>
              {resolvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'all' ? '2px solid #64748b' : '1px solid #cbd5e1',
              background: filterStatus === 'all' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'all' ? '#334155' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📋 كافة الشكاوى</span>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '11.5px' }}>
              {complaints.length}
            </span>
          </button>
        </div>
      </div>

      {/* قائمة الشكاوى */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {isLoading ? (
          <div className="outstock-card" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: '15px', fontWeight: 800 }}>جاري تحميل شكاوى الفروع...</div>
          </div>
        ) : complaints.length === 0 ? (
          <div className="outstock-card" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', background: '#f8fafc' }}>
            <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 10px' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>لا توجد شكاوى في هذا القسم حالياً</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>كافة الشكاوى تم الفصل فيها أو لا توجد شكاوى معلقة</p>
          </div>
        ) : (
          complaints.map((c) => {
            const hasProcReply = Boolean(c.procurement_reply);
            const isResolved = c.status === 'resolved';
            const isResolving = resolvingId === c.id;

            return (
              <div
                key={c.id}
                className="outstock-card"
                style={{
                  padding: '18px 22px',
                  border: isResolved ? '1.5px solid #86efac' : (!hasProcReply ? '2px solid #f43f5e' : '1.5px solid #0284c7'),
                  background: isResolved ? '#fcfdfd' : (!hasProcReply ? '#fff8f8' : '#f0f9ff')
                }}
              >
                {/* رأس الكارت */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>
                        🏢 {c.branch_name || 'الفرع'}
                      </span>
                      <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '12px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        طلب رقم #{c.order_number}
                      </span>
                      <span style={{ background: c.complaint_type === 'delayed_response' ? '#fee2e2' : '#fef3c7', color: c.complaint_type === 'delayed_response' ? '#991b1b' : '#92400e', fontSize: '12px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        {c.complaint_type === 'delayed_response' ? '⏳ تأخر الرد على الطلب' : '⚠️ الصنف غير متوفر رغم الموافقة'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      الصيدلي مقدم الشكوى: <strong>{c.pharmacist_name || 'الصيدلي'}</strong> • وقت الإرسال: {new Date(c.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      {c.customer_name && ` | العميل: ${c.customer_name} (${c.customer_phone || ''})`}
                    </div>
                  </div>

                  <div>
                    {isResolved ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: '99px', fontSize: '12.5px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={15} /> تم الحل واعتماد قرار المالك
                      </span>
                    ) : hasProcReply ? (
                      <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1.5px solid #0284c7', padding: '6px 14px', borderRadius: '99px', fontSize: '12.5px', fontWeight: 900 }}>
                        💬 تم رد المشتريات • بانتظار قراركم
                      </span>
                    ) : (
                      <span style={{ background: '#ffe4e6', color: '#e11d48', border: '1.5px solid #f43f5e', padding: '6px 14px', borderRadius: '99px', fontSize: '12.5px', fontWeight: 900 }}>
                        ⚠️ لم يتم الرد من مدير المشتريات بعد
                      </span>
                    )}
                  </div>
                </div>

                {/* 1. نص شكوى الفرع */}
                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#991b1b', marginBottom: '4px' }}>
                    📝 شرح وملاحظات صيدلية الفرع:
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#7f1d1d', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {c.notes || 'لا يوجد شرح إضافي'}
                  </div>
                </div>

                {/* 2. رد وتوضيح إدارة المشتريات */}
                <div style={{ background: hasProcReply ? '#f0fdf4' : '#fffbeb', border: hasProcReply ? '1px solid #bbf7d0' : '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: hasProcReply ? '#166534' : '#b45309' }}>
                      💬 رد وتوضيح مدير المشتريات ({c.procurement_responder_name || 'مدير المشتريات'}):
                    </span>
                    {c.procurement_replied_at && (
                      <span style={{ fontSize: '11px', color: '#15803d' }}>
                        {new Date(c.procurement_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  {hasProcReply ? (
                    <div style={{ fontSize: '13.5px', color: '#14532d', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {c.procurement_reply}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', color: '#dc2626', fontWeight: 800 }}>
                      ⚠️ تنبيه للمالك: لم يقم مدير المشتريات بإدخال رده على هذه الشكوى بعد!
                    </div>
                  )}
                </div>

                {/* 3. قرار المالك الحالي إن وجد */}
                {c.owner_reply && (
                  <div style={{ background: '#ffffff', border: '2px solid #86efac', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#15803d' }}>
                        👑 قرار واعتماد المالك النهائي:
                      </span>
                      {c.owner_replied_at && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(c.owner_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.5', fontWeight: 800 }}>
                      {c.owner_reply}
                    </div>
                  </div>
                )}

                {/* 4. صندوق إجراء قرار المالك */}
                {!isResolved && (
                  <div style={{ marginTop: '12px' }}>
                    {isResolving ? (
                      <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px', padding: '14px' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, color: '#0f172a', marginBottom: '6px' }}>
                          👑 قرار واعتماد المالك النهائي (سيظهر للصيدلية وإدارة المشتريات):
                        </label>
                        <textarea
                          rows={3}
                          value={ownerReplyText}
                          onChange={(e) => setOwnerReplyText(e.target.value)}
                          placeholder="اكتب توجيه وقرار المالك هنا (مثال: تم التوجيه بتوفير الصنف فوراً ومحاسبة مسؤول المشتريات / تم توفير بديل مناسب والتواصل مع الصيدلي)..."
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #94a3b8', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => { setResolvingId(null); setOwnerReplyText(''); }}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ fontSize: '12.5px', padding: '6px 14px' }}
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleResolve(c.id)}
                            className="outstock-btn"
                            style={{ background: '#16a34a', color: '#fff', fontSize: '13px', padding: '7px 20px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <CheckCircle2 size={16} />
                            <span>{isSubmitting ? 'جاري الاعتماد...' : 'اعتماد قرار المالك وإغلاق الشكوى'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingId(c.id);
                            setOwnerReplyText(c.owner_reply || '');
                          }}
                          className="outstock-btn"
                          style={{
                            background: '#e11d48',
                            color: '#ffffff',
                            fontSize: '13px',
                            padding: '7px 20px',
                            fontWeight: 900,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(225, 29, 72, 0.3)'
                          }}
                        >
                          <CheckCircle2 size={16} />
                          <span>اتخاذ قرار المالك واعتماد الحل 👑</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
