import React, { useState, useEffect } from 'react';
import {
  X,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Building2,
  Pill,
  Tag,
  DollarSign,
  Copy,
  Check,
  Printer,
  Sparkles,
  Camera,
  ExternalLink
} from 'lucide-react';

/**
 * ProcurementReplyModal.jsx
 * نافذة منبثقة فائقة الجمال لمعاينة رد وقرار إدارة المشتريات على طلبات الاستعلام وتصحيح الأصناف
 */
export default function ProcurementReplyModal({
  isOpen,
  onClose,
  requestItem = null,
  showToast = (msg) => alert(typeof msg === 'object' ? msg.message : msg)
}) {
  const [copied, setCopied] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // منع تمرير خلفية الصفحة
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !requestItem) return null;

  // استخراج بيانات الرد من JSONB أو الحقول المباشرة
  const replyData = typeof requestItem.procurement_reply === 'object' && requestItem.procurement_reply !== null
    ? requestItem.procurement_reply
    : (typeof requestItem.procurement_reply === 'string'
      ? (() => {
          try { return JSON.parse(requestItem.procurement_reply); } catch { return {}; }
        })()
      : {});

  const replierName = requestItem.responded_by || requestItem.replied_by || replyData.repliedBy || 'إدارة المشتريات';
  const repliedAt = requestItem.replied_at || requestItem.updated_at || replyData.repliedAt;
  const replyNotes = requestItem.response_notes || replyData.notes || replyData.message || (requestItem.status === 'approved' ? 'تم اعتماد الصنف وإدراجه رسمياً بكتالوج الأدوية.' : 'تم تسجيل الرد والاعتماد من قبل إدارة المشتريات.');
  const propData = requestItem.proposed_data || {};
  const isApproved = requestItem.status === 'approved';
  const isRejected = requestItem.status === 'rejected';
  const isReplied = requestItem.status === 'replied' || requestItem.status === 'resolved';

  const typeLabels = {
    inquiry: { label: 'استعلام سعر وتوفر', color: '#0369a1', bg: '#e0f2fe' },
    correction: { label: 'تصحيح بيانات صنف', color: '#b45309', bg: '#fef3c7' },
    new_item: { label: 'اعتماد صنف جديد بالكتالوج', color: '#15803d', bg: '#dcfce7' }
  };
  const currentType = typeLabels[requestItem.request_type] || { label: 'معاملة مشتريات', color: '#475569', bg: '#f1f5f9' };

  // نسخ الرد
  const handleCopyReply = () => {
    const textToCopy = `📋 *إفادة إدارة المشتريات بخصوص: ${requestItem.medication_name}*\n` +
      `🏢 الفرع: ${requestItem.branch_name || 'الفرع'}\n` +
      `👤 المسؤول: ${replierName}\n` +
      `💬 الرد: "${replyNotes}"\n` +
      (replyData.approvedPrice ? `💵 السعر المعتمد: ${replyData.approvedPrice} ج.م\n` : '') +
      `📅 التاريخ: ${repliedAt ? new Date(repliedAt).toLocaleString('ar-EG') : 'الآن'}`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      showToast?.('تم نسخ نص رد المشتريات للحافظة بنجاح 📋');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // طباعة مصغرة
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
        direction: 'rtl'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          animation: 'modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* ── رأس النافذة ── */}
        <div
          style={{
            padding: '18px 22px',
            background: isApproved
              ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
              : isRejected
              ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)'
              : 'linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: isApproved ? '#10b981' : isRejected ? '#ef4444' : '#0284c7',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              {isApproved ? <CheckCircle2 size={24} /> : isRejected ? <AlertCircle size={24} /> : <MessageSquare size={24} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  معاينة رد وقرار إدارة المشتريات
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: currentType.bg,
                    color: currentType.color
                  }}
                >
                  {currentType.label}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                طلب رقم: #{requestItem.id?.slice(-8) || '—'} • {requestItem.branch_name || 'فرع الصيدلية'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.05)',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            title="إغلاق (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── محتوى النافذة القابل للتمرير ── */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* بطاقة الصنف والطلب الأصلية */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  الصنف المستعلم عنه:
                </span>
                <strong style={{ fontSize: '16px', color: '#0f172a' }}>
                  {requestItem.medication_name}
                </strong>
                {propData.active_ingredient && (
                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                    المادة الفعالة: <span style={{ fontWeight: 700 }}>{propData.active_ingredient}</span>
                  </div>
                )}
              </div>

              {/* الصورة المرفقة إن وجدت */}
              {requestItem.attachment_url && (
                <div>
                  <button
                    type="button"
                    onClick={() => setImagePreview(requestItem.attachment_url)}
                    style={{
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#0284c7',
                      cursor: 'pointer'
                    }}
                  >
                    <Camera size={14} />
                    <span>الصورة المرفقة</span>
                  </button>
                </div>
              )}
            </div>

            {/* تفاصيل مقدم الطلب وتاريخه */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px dashed #e2e8f0',
                fontSize: '12px',
                color: '#64748b'
              }}
            >
              <div>
                🏢 الفرع: <strong style={{ color: '#1e293b' }}>{requestItem.branch_name || 'الفرع'}</strong>
              </div>
              <div>
                👤 مقدم الطلب: <strong style={{ color: '#1e293b' }}>{requestItem.employee_name || requestItem.submitted_by || 'الصيدلي'}</strong>
              </div>
              <div>
                📅 تاريخ الطلب: <strong style={{ color: '#1e293b' }}>{requestItem.created_at ? new Date(requestItem.created_at).toLocaleDateString('ar-EG') : '—'}</strong>
              </div>
              {requestItem.notes && (
                <div style={{ gridColumn: '1 / -1', background: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                  💬 ملحوظة الفرع: <span style={{ color: '#334155', fontStyle: 'italic' }}>"{requestItem.notes}"</span>
                </div>
              )}
            </div>
          </div>

          {/* 🌟 صندوق رد المشتريات المعتمد (القسم الأبرز) 🌟 */}
          <div
            style={{
              background: isApproved
                ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                : isRejected
                ? 'linear-gradient(135deg, #fff5f5 0%, #fef2f2 100%)'
                : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              border: isApproved
                ? '2px solid #86efac'
                : isRejected
                ? '2px solid #fca5a5'
                : '2px solid #7dd3fc',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.04)',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>
                  {isApproved ? '⭐' : isRejected ? '❌' : '💬'}
                </span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 900,
                    color: isApproved ? '#166534' : isRejected ? '#991b1b' : '#0369a1'
                  }}
                >
                  {isApproved ? 'القرار: معتمد رسمياً بالكتالوج' : isRejected ? 'القرار: مرفوض' : 'إفادة ورد إدارة المشتريات الرسمية:'}
                </span>
              </div>

              {/* شارة المسؤول ووقت الرد */}
              <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                <span>{repliedAt ? new Date(repliedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
              </div>
            </div>

            {/* نص الرد التفصيلي */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                padding: '14px 16px',
                fontSize: '13.5px',
                color: '#1e293b',
                lineHeight: '1.7',
                fontWeight: 600,
                whiteSpace: 'pre-wrap',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              {replyNotes}
            </div>

            {/* تفاصيل الأسعار والبدائل إن وجدت في الرد */}
            {(replyData.approvedPrice || replyData.price || replyData.substitutes || propData.public_price) && (
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '12px',
                  flexWrap: 'wrap'
                }}
              >
                {(replyData.approvedPrice || replyData.price || propData.public_price) && (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#15803d',
                      fontWeight: 700
                    }}
                  >
                    <DollarSign size={14} />
                    <span>السعر المعتمد: {parseFloat(replyData.approvedPrice || replyData.price || propData.public_price).toFixed(2)} ج.م</span>
                  </div>
                )}

                {replyData.substitutes && (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #fed7aa',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#c2410c',
                      fontWeight: 700
                    }}
                  >
                    <Tag size={14} />
                    <span>البديل المقترح: {replyData.substitutes}</span>
                  </div>
                )}
              </div>
            )}

            {/* توقيع المسؤول القائم بالرد */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '14px',
                paddingTop: '10px',
                borderTop: '1px dashed rgba(0,0,0,0.08)',
                fontSize: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                <User size={13} color="#0284c7" />
                <span>المسؤول المعتمد: <strong style={{ color: '#0f172a' }}>{replierName}</strong></span>
              </div>

              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: isApproved ? '#15803d' : '#0369a1',
                  background: isApproved ? '#dcfce7' : '#e0f2fe',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                {isApproved ? 'معتمد رسمياً' : 'رد رسمي موثق'}
              </span>
            </div>
          </div>
        </div>

        {/* ── أسفل النافذة والأزرار ── */}
        <div
          style={{
            padding: '14px 22px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleCopyReply}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: copied ? '#ecfdf5' : '#ffffff',
                color: copied ? '#059669' : '#334155',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              <span>{copied ? 'تم النسخ!' : 'نسخ نص الرد'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Printer size={14} />
              <span>طباعة</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="outstock-btn outstock-btn-secondary"
            style={{ padding: '8px 18px', fontWeight: 800 }}
          >
            إغلاق
          </button>
        </div>
      </div>

      {/* نافذة تكبير الصورة المرفقة إن وجدت */}
      {imagePreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setImagePreview(null)}
        >
          <div style={{ maxWidth: '90%', maxHeight: '90%', position: 'relative' }}>
            <img
              src={imagePreview}
              alt="صورة مرفقة"
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain' }}
            />
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
