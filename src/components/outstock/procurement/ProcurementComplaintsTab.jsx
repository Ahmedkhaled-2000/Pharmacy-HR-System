import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, CheckCircle2, MessageSquare, Send, RefreshCw, Package, User, Building2, ChevronDown, Check } from 'lucide-react';
import { outstockGetOwnerComplaints, outstockReplyComplaintProcurement, outstockListenBroadcast, listenToOutstockLocalMessages } from '../../../utils/outstockApiClient';
import { getSocket } from '../../../utils/socketClient';

/**
 * ProcurementComplaintsTab.jsx
 * تبويبة "شكاوى الفروع" في بوابة إدارة المشتريات
 * تمكن مدير المشتريات من:
 * 1. الاطلاع الفوري على الشكاوى المصعدة من الفروع
 * 2. كتابة وإرسال رد وتوضيح المشتريات الرسمي
 * 3. إحالة الشكوى مع الرد للمالك لاتخاذ القرار النهائي
 */
export default function ProcurementComplaintsTab({ currentUser, showToast }) {
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending_procurement' | 'pending_owner' | 'resolved'
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
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
      console.warn('Fetch procurement complaints error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // استماع للتحديثات الحية
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => fetchComplaints();
    if (socket) {
      socket.on('outstock:complaint_updated', handleUpdate);
      socket.on('outstock:procurement_alert', handleUpdate);
      socket.on('outstock:owner_complaint_escalation', handleUpdate);
    }
    const unsubLocal = (typeof outstockListenBroadcast === 'function' ? outstockListenBroadcast : listenToOutstockLocalMessages)(() => {
      fetchComplaints();
    });
    return () => {
      if (socket) {
        socket.off('outstock:complaint_updated', handleUpdate);
        socket.off('outstock:procurement_alert', handleUpdate);
        socket.off('outstock:owner_complaint_escalation', handleUpdate);
      }
      unsubLocal?.();
    };
  }, [fetchComplaints]);

  const handleSendReply = async (complaintId) => {
    if (!replyText.trim()) {
      showToast?.('⚠️ يرجى كتابة رد وتوضيح مدير المشتريات أولاً');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await outstockReplyComplaintProcurement(complaintId, {
        procurementReply: replyText.trim(),
        responderName: currentUser?.fullName || currentUser?.name || 'مدير المشتريات'
      });
      if (res?.success) {
        showToast?.('✅ تم إرسال رد وتوضيح المشتريات بنجاح وإحالة الشكوى للمالك');
        setReplyingId(null);
        setReplyText('');
        fetchComplaints();
      } else {
        showToast?.('❌ ' + (res?.error || 'تعذر حفظ الرد'));
      }
    } catch {
      showToast?.('❌ حدث خطأ أثناء إرسال الرد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingProcurementCount = complaints.filter(c => !c.procurement_reply).length;
  const pendingOwnerCount = complaints.filter(c => c.procurement_reply && c.status !== 'resolved').length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* الترويسة والإحصائيات */}
      <div className="outstock-card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '1.5px solid #fed7aa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#9a3412' }}>
                شكاوى الفروع الواردة للمشتريات 🚨
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#c2410c' }}>
                متابعة وتوضيح شكاوى الفروع بخصوص تأخر الرد أو النواقص والرد عليها قبل اعتماد المالك
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

        {/* فلاتر الحالات السريعة */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('pending_procurement')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'pending_procurement' ? '2px solid #ea580c' : '1px solid #fed7aa',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800
            }}
          >
            <span style={{ color: '#9a3412', fontSize: '13px' }}>⏳ بانتظار رد المشتريات</span>
            <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
              {pendingProcurementCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('pending_owner')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'pending_owner' ? '2px solid #0284c7' : '1px solid #bae6fd',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800
            }}
          >
            <span style={{ color: '#0369a1', fontSize: '13px' }}>👑 بانتظار قرار المالك</span>
            <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
              {pendingOwnerCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'resolved' ? '2px solid #16a34a' : '1px solid #bbf7d0',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800
            }}
          >
            <span style={{ color: '#15803d', fontSize: '13px' }}>✅ شكاوى محلولة ومعتمدة</span>
            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
              {resolvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'all' ? '2px solid #64748b' : '1px solid #cbd5e1',
              background: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800
            }}
          >
            <span style={{ color: '#334155', fontSize: '13px' }}>📋 كافة الشكاوى</span>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
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
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>لا توجد شكاوى مطابقة</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>كافة طلبات الفروع تسير بانتظام ودون شكاوى معلقة</p>
          </div>
        ) : (
          complaints.map((c) => {
            const hasProcReply = Boolean(c.procurement_reply);
            const isResolved = c.status === 'resolved';
            const isReplying = replyingId === c.id;

            return (
              <div
                key={c.id}
                className="outstock-card"
                style={{
                  padding: '16px 20px',
                  border: isResolved ? '1.5px solid #86efac' : (!hasProcReply ? '2px solid #f97316' : '1px solid #e2e8f0'),
                  background: isResolved ? '#fcfdfd' : (!hasProcReply ? '#fffaf5' : '#ffffff')
                }}
              >
                {/* رأس كارت الشكوى */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                        🏢 فرع: {c.branch_name || 'غير محدد'}
                      </span>
                      <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        طلب رقم #{c.order_number}
                      </span>
                      <span style={{ background: c.complaint_type === 'delayed_response' ? '#fee2e2' : '#fef3c7', color: c.complaint_type === 'delayed_response' ? '#991b1b' : '#92400e', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        {c.complaint_type === 'delayed_response' ? '⏳ تأخر الرد على الطلب' : '⚠️ الصنف غير متوفر رغم الموافقة'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      مقدم الشكوى: <strong>{c.pharmacist_name || 'الصيدلي'}</strong> • وقت الإرسال: {new Date(c.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>

                  <div>
                    {isResolved ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={14} /> تم الحل واعتماد المالك
                      </span>
                    ) : hasProcReply ? (
                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                        👑 تم إرسال ردكم • بانتظار قرار المالك
                      </span>
                    ) : (
                      <span style={{ background: '#ffedd5', color: '#c2410c', border: '1.5px solid #f97316', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 900, animation: 'pulse 2s infinite' }}>
                        ⚠️ بانتظار رد وتوضيح المشتريات
                      </span>
                    )}
                  </div>
                </div>

                {/* نص شكوى الفرع */}
                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b', marginBottom: '4px' }}>
                    📝 شرح وملاحظات الصيدلية بالفرع:
                  </div>
                  <div style={{ fontSize: '13.5px', color: '#7f1d1d', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {c.notes || 'لا يوجد شرح إضافي مسجل.'}
                  </div>
                </div>

                {/* رد وتوضيح المشتريات إن وجد */}
                {hasProcReply && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>
                        💬 رد وتوضيح إدارة المشتريات ({c.procurement_responder_name || 'مدير المشتريات'}):
                      </span>
                      {c.procurement_replied_at && (
                        <span style={{ fontSize: '11px', color: '#15803d' }}>
                          {new Date(c.procurement_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13.5px', color: '#14532d', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {c.procurement_reply}
                    </div>
                  </div>
                )}

                {/* قرار ورد المالك إن وجد */}
                {c.owner_reply && (
                  <div style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#0f172a' }}>
                        👑 قرار واعتماد المالك (سيف):
                      </span>
                      {c.owner_replied_at && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(c.owner_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: '1.5', fontWeight: 700 }}>
                      {c.owner_reply}
                    </div>
                  </div>
                )}

                {/* نموذج كتابة الرد لمدير المشتريات */}
                {!isResolved && (
                  <div style={{ marginTop: '10px' }}>
                    {isReplying ? (
                      <div style={{ background: '#f8fafc', border: '1.5px solid #fed7aa', borderRadius: '12px', padding: '14px' }}>
                        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#9a3412', marginBottom: '6px' }}>
                          ✍️ رد وتوضيح مدير المشتريات (سيظهر للمالك والفرع):
                        </label>
                        <textarea
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="اكتب التوضيح الفني هنا (مثلاً: تم مراجعة المورد وجاري شحن الصنف خلال ساعتين / الصنف به كوتة بالشركة وتم التواصل مع وكيل بديل)..."
                          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => { setReplyingId(null); setReplyText(''); }}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ fontSize: '12.5px', padding: '6px 14px' }}
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSendReply(c.id)}
                            className="outstock-btn"
                            style={{ background: '#ea580c', color: '#fff', fontSize: '12.5px', padding: '6px 18px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Send size={14} />
                            <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال التوضيح وإحالة للمالك'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId(c.id);
                            setReplyText(c.procurement_reply || '');
                          }}
                          className="outstock-btn"
                          style={{
                            background: hasProcReply ? '#f1f5f9' : '#ea580c',
                            color: hasProcReply ? '#334155' : '#ffffff',
                            fontSize: '12.5px',
                            padding: '6px 16px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <MessageSquare size={14} />
                          <span>{hasProcReply ? 'تعديل توضيح المشتريات ✏️' : 'إضافة رد وتوضيح المشتريات 💬'}</span>
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
