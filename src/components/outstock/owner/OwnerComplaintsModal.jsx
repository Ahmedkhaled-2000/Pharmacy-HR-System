import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle2, Clock, Package, User, Phone, Building2, MessageSquare, Send, Check } from 'lucide-react';
import { outstockGetOwnerComplaints, outstockUpdateComplaintStatus } from '../../../utils/outstockApiClient';

export default function OwnerComplaintsModal({ onClose, showToast }) {
  const [complaints, setComplaints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending'); // 'all' | 'pending' | 'resolved'
  const [resolvingId, setResolvingId] = useState(null);
  const [ownerNotes, setOwnerNotes] = useState('');

  const fetchComplaints = async () => {
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
      console.warn('Fetch complaints error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [filterStatus]);

  const handleResolve = async (complaintId) => {
    try {
      const res = await outstockUpdateComplaintStatus(complaintId, {
        status: 'resolved',
        ownerNotes: ownerNotes.trim()
      });
      if (res?.success) {
        showToast?.('✅ تم تحديث حالة الشكوى وحلها');
        setResolvingId(null);
        setOwnerNotes('');
        fetchComplaints();
      } else {
        showToast?.('❌ ' + (res?.error || 'فشل التحديث'));
      }
    } catch {
      showToast?.('❌ حدث خطأ');
    }
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel"
        style={{ maxWidth: '800px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="outstock-modal-drag-handle" />

        <div className="outstock-modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={20} color="#dc2626" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#991b1b' }}>
                🚨 شكاوى الفروع المصعدة للمالك
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                تأخير الرد أو عدم توفر الأصناف بالرغم من موافقة المشتريات
              </p>
            </div>
          </div>

          <button className="outstock-modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {/* فلاتر الحالة */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', background: '#f8fafc' }}>
          <button
            type="button"
            onClick={() => setFilterStatus('pending')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              border: filterStatus === 'pending' ? '2px solid #dc2626' : '1px solid #cbd5e1',
              background: filterStatus === 'pending' ? '#fee2e2' : '#ffffff',
              color: filterStatus === 'pending' ? '#b91c1c' : '#64748b'
            }}
          >
            شكاوى معلقة بانتظار الحل ⏳
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              border: filterStatus === 'resolved' ? '2px solid #16a34a' : '1px solid #cbd5e1',
              background: filterStatus === 'resolved' ? '#f0fdf4' : '#ffffff',
              color: filterStatus === 'resolved' ? '#15803d' : '#64748b'
            }}
          >
            شكاوى تم حلها ومراجعتها ✅
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '800',
              cursor: 'pointer',
              border: filterStatus === 'all' ? '2px solid #475569' : '1px solid #cbd5e1',
              background: filterStatus === 'all' ? '#f1f5f9' : '#ffffff',
              color: filterStatus === 'all' ? '#1e293b' : '#64748b'
            }}
          >
            كافة الشكاوى
          </button>
        </div>

        <div className="outstock-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              جاري تحميل الشكاوى...
            </div>
          ) : complaints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
              <strong>لا توجد شكاوى في هذا القسم</strong>
            </div>
          ) : (
            complaints.map((comp) => {
              const isPending = comp.status === 'pending';
              const createdStr = comp.created_at ? new Date(comp.created_at).toLocaleString('ar-EG') : '';

              return (
                <div
                  key={comp.id}
                  style={{
                    background: '#ffffff',
                    border: isPending ? '1.5px solid #fca5a5' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    boxShadow: isPending ? '0 2px 8px rgba(220, 38, 38, 0.08)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#fef2f2', color: '#b91c1c', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', fontSize: '12.5px' }}>
                        طلب: #{comp.order_number}
                      </span>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                        فرع: {comp.branch_name}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          background: isPending ? '#fee2e2' : '#f0fdf4',
                          color: isPending ? '#b91c1c' : '#15803d',
                          fontWeight: '800',
                          fontSize: '11.5px',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {isPending ? 'معلقة ⏳' : 'تم الحل ✅'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{createdStr}</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '12.5px', color: '#b91c1c', fontWeight: '800', marginBottom: '6px' }}>
                    نوع الشكوى: {comp.complaint_type === 'delayed_response' ? '⏱️ تأخر الرد على الطلب' : comp.complaint_type === 'available_but_not_arrived' ? '🚚 أفادت المشتريات بالتوفر ولكن لم يصل الصنف للفرع' : '❌ الصنف لم يتوفر بالرغم من موافقة المشتريات'}
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: '#334155', marginBottom: '8px' }}>
                    <div>العميل: <strong>{comp.customer_name || '—'}</strong> | الهاتف: <span style={{ direction: 'ltr', display: 'inline-block' }}>{comp.customer_phone || '—'}</span></div>
                    <div>مقدم الشكوى بالفرع: <strong>{comp.pharmacist_name || 'الصيدلي'}</strong></div>
                    {comp.notes && (
                      <div style={{ marginTop: '4px', color: '#0f172a', fontWeight: '700' }}>
                        📝 ملاحظات الفرع: "{comp.notes}"
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div>
                      {resolvingId === comp.id ? (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <textarea
                            rows={2}
                            placeholder="ملاحظات المالك أو التوجيه للمشتريات/الفرع..."
                            value={ownerNotes}
                            onChange={(e) => setOwnerNotes(e.target.value)}
                            className="outstock-form-textarea"
                            style={{ fontSize: '12.5px' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-secondary"
                              onClick={() => setResolvingId(null)}
                              style={{ fontSize: '12px', padding: '5px 10px' }}
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              className="outstock-btn outstock-btn-success"
                              onClick={() => handleResolve(comp.id)}
                              style={{ fontSize: '12px', padding: '5px 14px', fontWeight: '800' }}
                            >
                              <Check size={13} />
                              <span>تأكيد حل الشكوى ✅</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="outstock-btn outstock-btn-secondary"
                          onClick={() => {
                            setResolvingId(comp.id);
                            setOwnerNotes('');
                          }}
                          style={{ fontSize: '12px', padding: '5px 12px', fontWeight: '800' }}
                        >
                          <CheckCircle2 size={13} color="#16a34a" />
                          <span>اتخاذ إجراء وحل الشكوى</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
