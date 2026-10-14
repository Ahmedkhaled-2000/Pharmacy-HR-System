import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, Clock, CheckCircle2, MessageSquare, Send, RefreshCw, Package, User, Building2, ChevronDown, Check, Pill } from 'lucide-react';
import { outstockGetOwnerComplaints, outstockReplyComplaintProcurement, outstockListenBroadcast, listenToOutstockLocalMessages } from '../../../utils/outstockApiClient';
import { getSocket } from '../../../utils/socketClient';

/**
 * ProcurementComplaintsTab.jsx
 * تبويبة "شكاوى الفروع" في بوابة إدارة المشتريات
 * تم تصحيح الفلاتر لمنع التذبذب والتحميل المتكرر مع الفلترة الفورية في الواجهة
 */
export default function ProcurementComplaintsTab({ currentUser, showToast }) {
  const [allComplaints, setAllComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending_procurement'); // default: 'pending_procurement'
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debounceTimerRef = useRef(null);

  // جلب كافة الشكاوى دفعة واحدة لحساب العدادات بدقة ومنع تذبذب الفلاتر
  const fetchComplaints = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      const res = await outstockGetOwnerComplaints({ status: 'all' });
      if (res?.success && Array.isArray(res.complaints)) {
        setAllComplaints(res.complaints);
      } else {
        setAllComplaints([]);
      }
    } catch (e) {
      console.warn('Fetch procurement complaints error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComplaints(true);
  }, [fetchComplaints]);

  // استماع للتحديثات الحية مع Debounce
  useEffect(() => {
    const handleUpdate = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        fetchComplaints(false);
      }, 500);
    };

    const socket = getSocket();
    if (socket) {
      socket.on('outstock:complaint_updated', handleUpdate);
      socket.on('outstock:procurement_alert', handleUpdate);
      socket.on('outstock:owner_complaint_escalation', handleUpdate);
    }
    const unsubLocal = (typeof outstockListenBroadcast === 'function' ? outstockListenBroadcast : listenToOutstockLocalMessages)(() => {
      handleUpdate();
    });

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
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
        fetchComplaints(false);
      } else {
        showToast?.('❌ ' + (res?.error || 'تعذر حفظ الرد'));
      }
    } catch {
      showToast?.('❌ حدث خطأ أثناء إرسال الرد');
    } finally {
      setIsSubmitting(false);
    }
  };

  // إحصائيات ثابتة ومستقرة تماماً لا تتذبذب باختيار الفلتر
  const pendingProcurementCount = useMemo(() => {
    return allComplaints.filter(c => !c.procurement_reply && c.status !== 'resolved').length;
  }, [allComplaints]);

  const pendingOwnerCount = useMemo(() => {
    return allComplaints.filter(c => c.procurement_reply && c.status !== 'resolved').length;
  }, [allComplaints]);

  const resolvedCount = useMemo(() => {
    return allComplaints.filter(c => c.status === 'resolved').length;
  }, [allComplaints]);

  const totalCount = allComplaints.length;

  // فلترة الشكاوى المعروضة لحظياً على الواجهة دون إعادة تحميل الصفحة
  const displayedComplaints = useMemo(() => {
    if (filterStatus === 'pending_procurement') {
      return allComplaints.filter(c => !c.procurement_reply && c.status !== 'resolved');
    }
    if (filterStatus === 'pending_owner') {
      return allComplaints.filter(c => c.procurement_reply && c.status !== 'resolved');
    }
    if (filterStatus === 'resolved') {
      return allComplaints.filter(c => c.status === 'resolved');
    }
    return allComplaints;
  }, [allComplaints, filterStatus]);

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
            onClick={() => fetchComplaints(true)}
            disabled={isLoading}
            className="outstock-btn outstock-btn-secondary"
            style={{ fontSize: '12.5px', padding: '7px 14px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>
        </div>

        {/* فلاتر الحالات السريعة بدون أي تذبذب */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('pending_procurement')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'pending_procurement' ? '2.5px solid #ea580c' : '1px solid #fed7aa',
              background: filterStatus === 'pending_procurement' ? '#fff7ed' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800,
              boxShadow: filterStatus === 'pending_procurement' ? '0 2px 8px rgba(234, 88, 12, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ color: '#9a3412', fontSize: '13px' }}>⏳ بانتظار رد المشتريات</span>
            <span style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 900 }}>
              {pendingProcurementCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('pending_owner')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'pending_owner' ? '2.5px solid #0284c7' : '1px solid #bae6fd',
              background: filterStatus === 'pending_owner' ? '#f0f9ff' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800,
              boxShadow: filterStatus === 'pending_owner' ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ color: '#0369a1', fontSize: '13px' }}>👑 بانتظار قرار المالك</span>
            <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 900 }}>
              {pendingOwnerCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'resolved' ? '2.5px solid #16a34a' : '1px solid #bbf7d0',
              background: filterStatus === 'resolved' ? '#f0fdf4' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800,
              boxShadow: filterStatus === 'resolved' ? '0 2px 8px rgba(22, 163, 74, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ color: '#15803d', fontSize: '13px' }}>✅ شكاوى محلولة ومعتمدة</span>
            <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 900 }}>
              {resolvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: filterStatus === 'all' ? '2.5px solid #475569' : '1px solid #cbd5e1',
              background: filterStatus === 'all' ? '#f8fafc' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 800,
              boxShadow: filterStatus === 'all' ? '0 2px 8px rgba(71, 85, 105, 0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ color: '#334155', fontSize: '13px' }}>📋 كافة الشكاوى</span>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 900 }}>
              {totalCount}
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
        ) : displayedComplaints.length === 0 ? (
          <div className="outstock-card" style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <CheckCircle2 size={36} style={{ color: '#22c55e', margin: '0 auto 10px' }} />
            <h3 style={{ margin: '0 0 6px', color: '#334155', fontSize: '16px', fontWeight: 800 }}>
              لا توجد شكاوى مطابقة لهذا الفلتر حالياً
            </h3>
            <p style={{ margin: 0, fontSize: '13px' }}>
              كافة طلبات الفروع منتظمة ومستقرة، أو تم الرد عليها وحلها.
            </p>
          </div>
        ) : (
          displayedComplaints.map(c => {
            const hasProcReply = Boolean(c.procurement_reply);
            const isResolved = c.status === 'resolved';

            return (
              <div
                key={c.id}
                className="outstock-card"
                style={{
                  padding: '16px 20px',
                  borderRadius: '14px',
                  border: isResolved ? '1.5px solid #86efac' : (!hasProcReply ? '2px solid #f97316' : '1px solid #e2e8f0'),
                  background: isResolved ? '#fcfdfd' : (!hasProcReply ? '#fffaf5' : '#ffffff'),
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}
              >
                {/* رأس كارت الشكوى */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#0f172a' }}>
                        🏢 فرع: {c.branch_name || 'غير محدد'}
                      </span>
                      <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        طلب رقم #{c.order_number}
                      </span>
                      <span style={{ background: c.complaint_type === 'delayed_response' ? '#fee2e2' : '#fef3c7', color: c.complaint_type === 'delayed_response' ? '#991b1b' : '#92400e', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        {c.complaint_type === 'delayed_response' ? '⏳ تأخر الرد على الطلب' : '⚠️ الصنف غير متوفر رغم الموافقة'}
                      </span>
                      {c.medication_name && (
                        <span style={{ background: '#ede9fe', color: '#6d28d9', fontSize: '11.5px', padding: '2px 9px', borderRadius: '6px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #ddd6fe' }}>
                          <Pill size={12} /> الصنف المعني: {c.medication_name}
                        </span>
                      )}
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
                      <span style={{ background: '#ffedd5', color: '#c2410c', border: '1.5px solid #f97316', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 900 }}>
                        ⚠️ بانتظار رد وتوضيح المشتريات
                      </span>
                    )}
                  </div>
                </div>

                {/* قائمة الأصناف المشمولة بالطلب والشكوى */}
                {(() => {
                  let parsedSelected = [];
                  try {
                    if (Array.isArray(c.selected_items)) parsedSelected = c.selected_items;
                    else if (typeof c.selected_items === 'string') parsedSelected = JSON.parse(c.selected_items);
                  } catch (_) {}
                  const selectedIds = new Set(parsedSelected.map(p => String(p.id)));
                  const allItems = Array.isArray(c.order_items) ? c.order_items : [];

                  if (allItems.length === 0 && parsedSelected.length === 0 && !c.medication_name) return null;

                  return (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Package size={14} color="#0f766e" />
                          <span>الأصناف المشمولة بالطلب والشكوى:</span>
                        </span>
                        {parsedSelected.length > 0 && (
                          <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: '99px', fontWeight: 800 }}>
                            محدد بالشكوى: {parsedSelected.length} صنف
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {allItems.length > 0 ? (
                          allItems.map((it, idx) => {
                            const isSpecific = selectedIds.has(String(it.id)) || (c.item_id && String(c.item_id) === String(it.id));
                            const uLabel = it.unit_type === 'strip' ? 'شريط' : 'علبة';
                            return (
                              <span
                                key={it.id || idx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: isSpecific ? '#fef2f2' : '#ffffff',
                                  border: isSpecific ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                                  color: isSpecific ? '#991b1b' : '#334155',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  fontWeight: isSpecific ? 900 : 700
                                }}
                              >
                                <span>{isSpecific ? '⚠️' : '💊'}</span>
                                <span>{it.medication_name}</span>
                                <span style={{ fontSize: '10px', opacity: 0.8 }}>({it.quantity || 1} {uLabel})</span>
                                {isSpecific && (
                                  <span style={{ fontSize: '10px', background: '#dc2626', color: '#fff', padding: '0 4px', borderRadius: '4px' }}>
                                    صنف الشكوى
                                  </span>
                                )}
                              </span>
                            );
                          })
                        ) : parsedSelected.length > 0 ? (
                          parsedSelected.map((it, idx) => (
                            <span
                              key={it.id || idx}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: '#fef2f2',
                                border: '1.5px solid #ef4444',
                                color: '#991b1b',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 900
                              }}
                            >
                              <span>⚠️</span>
                              <span>{it.medicationName || it.medication_name}</span>
                              <span style={{ fontSize: '10px', opacity: 0.8 }}>({it.quantity || 1} {it.unitType === 'strip' ? 'شريط' : 'علبة'})</span>
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#6d28d9', background: '#ede9fe', padding: '3px 8px', borderRadius: '6px' }}>
                            💊 {c.medication_name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

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
                      <span style={{ fontSize: '12px', fontWeight: 900, color: '#1e293b' }}>
                        👑 قرار وتوجيه المالك:
                      </span>
                      {c.owner_replied_at && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          {new Date(c.owner_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 700, lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {c.owner_reply}
                    </div>
                  </div>
                )}

                {/* صندوق كتابة الرد لمدير المشتريات إن لم يكن رد بعد */}
                {!isResolved && (
                  <div>
                    {replyingId === c.id ? (
                      <div style={{ marginTop: '12px', background: '#f8fafc', border: '1.5px solid #ea580c', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#9a3412', marginBottom: '8px' }}>
                          💬 كتابة رد وتوضيح المشتريات (سيصل للمالك وللفرع فوراً):
                        </div>
                        <textarea
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="مثال: جاري التواصل مع المورد الرئيسي لتسليم الدواء خلال ساعتين، أو الصنف مسجل كشحنة مستعجلة..."
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            padding: '10px',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            resize: 'vertical'
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                          <button
                            type="button"
                            onClick={() => { setReplyingId(null); setReplyText(''); }}
                            className="outstock-btn outstock-btn-secondary"
                            style={{ fontSize: '12px', padding: '6px 12px' }}
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={isSubmitting || !replyText.trim()}
                            onClick={() => handleSendReply(c.id)}
                            className="outstock-btn outstock-btn-primary"
                            style={{ fontSize: '12px', padding: '6px 16px', background: '#ea580c', borderColor: '#ea580c' }}
                          >
                            <Send size={13} />
                            <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال الرد وإحالة الشكوى للمالك'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingId(c.id);
                            setReplyText(c.procurement_reply || '');
                          }}
                          className="outstock-btn"
                          style={{
                            fontSize: '12.5px',
                            padding: '6px 14px',
                            background: hasProcReply ? '#f1f5f9' : '#ea580c',
                            color: hasProcReply ? '#334155' : '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <MessageSquare size={14} />
                          <span>{hasProcReply ? 'تعديل توضيح المشتريات' : 'الرد وتوضيح المشتريات'}</span>
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
