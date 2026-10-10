import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, CheckCircle2, MessageSquare, RefreshCw, Check, ArrowRight, User, Package, Calendar } from 'lucide-react';
import { outstockGetOwnerComplaints, outstockListenBroadcast, listenToOutstockLocalMessages } from '../../../utils/outstockApiClient';
import { getSocket } from '../../../utils/socketClient';

/**
 * PharmacyComplaintsTab.jsx
 * صفحة "الشكاوى" في بوابة الصيدلية
 * تستعرض كافة الشكاوى المرسلة من هذا الفرع مع تتبع حي لردود المشتريات وقرار المالك
 */
export default function PharmacyComplaintsTab({ branchId, branch, currentPharmacist = '', showToast }) {
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending'); // default: 'pending' (قيد الانتظار)

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await outstockGetOwnerComplaints({
        branchId,
        status: filterStatus === 'all' ? undefined : filterStatus
      });
      if (res?.success && Array.isArray(res.complaints)) {
        setComplaints(res.complaints);
      } else {
        setComplaints([]);
      }
    } catch (err) {
      console.warn('Fetch pharmacy complaints error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, filterStatus]);

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

  const pendingCount = complaints.filter(c => c.status !== 'resolved').length;
  const resolvedCount = complaints.filter(c => c.status === 'resolved').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>
      {/* الترويسة والإحصائيات */}
      <div className="outstock-card" style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '1.5px solid #fecaca' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)' }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: '#991b1b' }}>
                سجل شكاوى الفرع والمتابعة 🚨
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#b91c1c' }}>
                متابعة مباشرة للشكاوى المصعدة للمالك وإدارة المشتريات والاطلاع على التوضيحات والقرارات الصادرة
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

        {/* فلاتر سريعة */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'all' ? '2px solid #dc2626' : '1px solid #fca5a5',
              background: filterStatus === 'all' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'all' ? '#991b1b' : '#475569'
            }}
          >
            كافة الشكاوى ({complaints.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'pending' ? '2px solid #ea580c' : '1px solid #fca5a5',
              background: filterStatus === 'pending' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'pending' ? '#c2410c' : '#475569'
            }}
          >
            ⏳ قيد المتابعة والرد ({pendingCount})
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              border: filterStatus === 'resolved' ? '2px solid #16a34a' : '1px solid #fca5a5',
              background: filterStatus === 'resolved' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
              color: filterStatus === 'resolved' ? '#15803d' : '#475569'
            }}
          >
            ✅ تم الحل والاعتماد ({resolvedCount})
          </button>
        </div>
      </div>

      {/* قائمة الشكاوى */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {isLoading ? (
          <div className="outstock-card" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: '15px', fontWeight: 800 }}>جاري تحميل شكاوى الفرع...</div>
          </div>
        ) : complaints.length === 0 ? (
          <div className="outstock-card" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', background: '#f8fafc' }}>
            <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 10px' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1e293b' }}>لا توجد شكاوى مسجلة</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>لم يتم رفع أي شكوى من هذا الفرع حالياً</p>
          </div>
        ) : (
          complaints.map((c) => {
            const hasProcReply = Boolean(c.procurement_reply);
            const isResolved = c.status === 'resolved';

            return (
              <div
                key={c.id}
                className="outstock-card"
                style={{
                  padding: '16px 20px',
                  border: isResolved ? '1.5px solid #86efac' : '1.5px solid #fecaca',
                  background: isResolved ? '#fcfdfd' : '#ffffff'
                }}
              >
                {/* رأس الكارت */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                        طلب رقم #{c.order_number}
                      </span>
                      <span style={{ background: c.complaint_type === 'delayed_response' ? '#fee2e2' : '#fef3c7', color: c.complaint_type === 'delayed_response' ? '#991b1b' : '#92400e', fontSize: '11.5px', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                        {c.complaint_type === 'delayed_response' ? '⏳ تأخر رد المشتريات' : '⚠️ الصنف لم يتوفر رغم الموافقة'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      تاريخ رفع الشكوى: {new Date(c.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })} • الصيدلي: {c.pharmacist_name || 'صيدلي الفرع'}
                    </div>
                  </div>

                  <div>
                    {isResolved ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={14} /> تم الحل واعتماد المالك
                      </span>
                    ) : hasProcReply ? (
                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                        👑 تم رد المشتريات • بانتظار قرار المالك
                      </span>
                    ) : (
                      <span style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', padding: '5px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 800 }}>
                        ⏳ بانتظار رد وتوضيح إدارة المشتريات
                      </span>
                    )}
                  </div>
                </div>

                {/* مسار المتابعة الزمني التفاعلي (Timeline) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  {/* خطوة 1: شكوى الفرع */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900, fontSize: '12px' }}>
                      1
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#991b1b' }}>
                        ملاحظات وشكوى الفرع:
                      </div>
                      <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px', lineHeight: '1.4' }}>
                        {c.notes || 'لا يوجد شرح إضافي'}
                      </div>
                    </div>
                  </div>

                  {/* خطوة 2: رد وتوضيح إدارة المشتريات */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: hasProcReply ? '#dbeafe' : '#f1f5f9', color: hasProcReply ? '#0284c7' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900, fontSize: '12px' }}>
                      2
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: hasProcReply ? '#0369a1' : '#64748b' }}>
                          رد وتوضيح إدارة المشتريات ({c.procurement_responder_name || 'مدير المشتريات'}):
                        </span>
                        {c.procurement_replied_at && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {new Date(c.procurement_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        )}
                      </div>
                      {hasProcReply ? (
                        <div style={{ fontSize: '13px', color: '#0c4a6e', marginTop: '2px', lineHeight: '1.4', background: '#f0f9ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                          {c.procurement_reply}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#e11d48', marginTop: '4px', fontStyle: 'italic', fontWeight: 700 }}>
                          ⏳ لم يتم الرد من مدير المشتريات بعد — تم تصعيد الشكوى للمالك
                        </div>
                      )}
                    </div>
                  </div>

                  {/* خطوة 3: قرار واعتماد المالك */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isResolved ? '#dcfce7' : '#f1f5f9', color: isResolved ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900, fontSize: '12px' }}>
                      3
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 900, color: isResolved ? '#15803d' : '#64748b' }}>
                          👑 قرار واعتماد المالك (سيف):
                        </span>
                        {c.owner_replied_at && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {new Date(c.owner_replied_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        )}
                      </div>
                      {c.owner_reply ? (
                        <div style={{ fontSize: '13px', color: '#14532d', marginTop: '2px', lineHeight: '1.4', background: '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #86efac', fontWeight: 700 }}>
                          {c.owner_reply}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                          بانتظار قرار واعتماد المالك النهائي
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
