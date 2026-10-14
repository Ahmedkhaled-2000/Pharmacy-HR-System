import React, { useState, useMemo, useEffect } from 'react';
import { X, AlertTriangle, Clock, Send, CheckCircle2, Package, User, Phone, Building2, Check } from 'lucide-react';
import { outstockSendOrderComplaint } from '../../../utils/outstockApiClient';

/**
 * OrderComplaintModal.jsx
 * نافذة تصعيد شكوى للمالك مباشرة في حال:
 * 1. تأخر مسؤول المشتريات في الرد على طلب أدوية العميل
 * 2. تم الرد أن الصنف متوفر ولكن لم يصل إلى الصيدلية
 * 3. الصنف لم يتوفر بالرغم من موافقة المشتريات على توفيره
 * 
 * - ترسل الشكوى للمالك مباشرة مع تفاصيل الطلب وتوقيت الإرسال والرد
 * - ترسل تنبيهاً فورياً للمشتريات بأن الصنف لم يتوفر بالرغم من موافقتهم
 */
export default function OrderComplaintModal({
  order,
  branch,
  currentPharmacist = '',
  onClose,
  onSuccess,
  showToast
}) {
  const [complaintType, setComplaintType] = useState('delayed_response');
  // دعم التحديد المتعدد للأصناف المعنية بالشكوى (صنف واحد، أصناف محددة، أو كامل الطلب)
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [notes, setNotes] = useState('');
  const [pharmacistName, setPharmacistName] = useState(
    currentPharmacist || order?.responsible_pharmacist || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // إغلاق النافذة بزر Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (!isSubmitting) {
          onClose?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting, onClose]);

  // منع تمرير خلفية الصفحة
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // 1. حساب توقيتات الطلب ومدة التأخير
  const timingInfo = useMemo(() => {
    if (!order) return { createdStr: '—', repliedStr: 'لم يتم الرد بعد', durationStr: '—' };

    const createdAt = order.created_at ? new Date(order.created_at) : null;
    const repliedAt = order.procurement_replied_at ? new Date(order.procurement_replied_at) : null;
    const now = new Date();

    const createdStr = createdAt
      ? createdAt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
      : 'غير محدد';

    const repliedStr = repliedAt
      ? repliedAt.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
      : 'لم يتم الرد من المشتريات بعد ⏳';

    let diffMs = 0;
    if (createdAt) {
      const endTime = repliedAt || now;
      diffMs = Math.max(0, endTime.getTime() - createdAt.getTime());
    }

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;

    let durationStr = '';
    if (days > 0) {
      durationStr = `${days} يوم و ${remHours} ساعة و ${minutes} دقيقة`;
    } else if (hours > 0) {
      durationStr = `${hours} ساعة و ${minutes} دقيقة`;
    } else {
      durationStr = `${minutes} دقيقة`;
    }

    return { createdStr, repliedStr, durationStr, isReplied: Boolean(repliedAt) };
  }, [order]);

  const toggleItemSelection = (itId) => {
    if (isAllSelected) {
      setIsAllSelected(false);
      setSelectedItemIds([itId]);
      return;
    }

    if (selectedItemIds.includes(itId)) {
      const next = selectedItemIds.filter(id => id !== itId);
      if (next.length === 0) {
        setIsAllSelected(true);
        setSelectedItemIds([]);
      } else {
        setSelectedItemIds(next);
      }
    } else {
      setSelectedItemIds([...selectedItemIds, itId]);
    }
  };

  const handleSelectAll = () => {
    setIsAllSelected(true);
    setSelectedItemIds([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!complaintType) {
      setErrorMsg('يرجى تحديد نوع الشكوى');
      return;
    }
    if (!notes.trim()) {
      setErrorMsg('يرجى كتابة ملاحظات وتفاصيل الشكوى ليتمكن المالك من مراجعتها');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      let selectedItemsPayload = [];
      let medicationNameString = null;
      let primaryItemId = null;

      if (!isAllSelected && selectedItemIds.length > 0 && Array.isArray(order?.items)) {
        selectedItemsPayload = order.items
          .filter(it => selectedItemIds.includes(String(it.id || '')))
          .map(it => ({
            id: it.id,
            medicationName: it.medication_name || it.medicationName,
            quantity: it.quantity,
            unitType: it.unit_type
          }));
        
        medicationNameString = selectedItemsPayload.map(i => i.medicationName).filter(Boolean).join('، ');
        primaryItemId = selectedItemIds[0];
      }

      const res = await outstockSendOrderComplaint(order.id, {
        complaintType,
        notes: notes.trim(),
        pharmacistName: pharmacistName.trim(),
        itemId: primaryItemId,
        itemIds: selectedItemIds,
        selectedItems: selectedItemsPayload,
        medicationName: medicationNameString
      });

      if (res?.success) {
        showToast?.('🚨 تم إرسال الشكوى للمالك مباشرة وتنبيه إدارة المشتريات بنجاح');
        onSuccess?.(order.id, notes.trim());
        onClose?.();
      } else {
        setErrorMsg(res?.error || 'تعذر إرسال الشكوى، يرجى المحاولة مرة أخرى');
      }
    } catch (err) {
      console.error('Complaint submit error:', err);
      setErrorMsg('حدث خطأ في الشبكة أثناء إرسال الشكوى');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="outstock-modal-backdrop" onClick={onClose}>
      <div
        className="outstock-modal-panel"
        style={{ maxWidth: '640px', width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="outstock-modal-drag-handle" />

        <div className="outstock-modal-header" style={{ borderBottom: '1px solid #fee2e2', background: '#fff5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={22} color="#dc2626" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#991b1b' }}>
                تصعيد شكوى للمالك مباشرة 🚨
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b91c1c' }}>
                تأخير الرد أو عدم وصول الصنف بالرغم من موافقة المشتريات
              </p>
            </div>
          </div>

          <button className="outstock-modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="outstock-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {errorMsg && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  fontWeight: '700'
                }}
              >
                ⚠️ {errorMsg}
              </div>
            )}

            {/* كارت ملخص الطلب */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Package size={16} color="#0f766e" />
                  <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                    طلب رقم: #{order?.order_number || order?.orderNumber}
                  </strong>
                </div>

                <span
                  style={{
                    background: '#e0f2fe',
                    color: '#0369a1',
                    fontSize: '11.5px',
                    fontWeight: '800',
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {branch?.name || order?.branch_name || 'الفرع'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12.5px' }}>
                <div style={{ color: '#475569' }}>
                  <User size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                  العميل: <strong style={{ color: '#1e293b' }}>{order?.customer_name || order?.customerName || 'عميل نقدي'}</strong>
                </div>
                <div style={{ color: '#475569' }}>
                  <Phone size={13} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                  الهاتف: <strong style={{ color: '#0284c7', direction: 'ltr', display: 'inline-block' }}>{order?.customer_phone || order?.customerPhone || '—'}</strong>
                </div>
              </div>

              {/* اختيار وتحديد الصنف المعني بالشكوى (دعم التحديد المتعدد) */}
              {Array.isArray(order?.items) && order.items.length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '900', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>💊</span>
                      <span>حدد الأصناف التي تخصها الشكوى (يمكنك اختيار أكثر من صنف):</span>
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: isAllSelected ? '#64748b' : '#dc2626' }}>
                      {isAllSelected ? 'الشكوى على كامل الطلب' : `تم تحديد (${selectedItemIds.length}) من ${order.items.length}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      style={{
                        background: isAllSelected ? '#fee2e2' : '#ffffff',
                        border: isAllSelected ? '2px solid #dc2626' : '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '800',
                        color: isAllSelected ? '#991b1b' : '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Package size={14} />
                      <span>كامل الطلب (جميع الأصناف)</span>
                      {isAllSelected && <Check size={13} color="#dc2626" />}
                    </button>

                    {order.items.map((it, idx) => {
                      const itId = String(it.id || idx);
                      const isSelected = !isAllSelected && selectedItemIds.includes(itId);
                      const itName = it.medication_name || it.medicationName || 'صنف';
                      const uLabel = it.unit_type === 'strip' ? 'شريط' : 'علبة';

                      return (
                        <button
                          key={itId}
                          type="button"
                          onClick={() => toggleItemSelection(itId)}
                          style={{
                            background: isSelected ? '#fee2e2' : '#ffffff',
                            border: isSelected ? '2px solid #dc2626' : '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '800',
                            color: isSelected ? '#991b1b' : '#334155',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isSelected ? '0 2px 6px rgba(220, 38, 38, 0.15)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent button onClick
                            style={{ margin: 0, cursor: 'pointer', accentColor: '#dc2626' }}
                          />
                          <span>💊</span>
                          <span>{itName}</span>
                          <span style={{ fontSize: '10.5px', background: isSelected ? '#ffffff' : '#f1f5f9', padding: '1px 6px', borderRadius: '4px', color: '#64748b' }}>
                            ({it.quantity || 1} {uLabel})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* تفاصيل التوقيت ومدة التأخير */}
            <div
              style={{
                background: '#fffbeb',
                border: '1.5px solid #fde68a',
                borderRadius: '12px',
                padding: '14px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#92400e', fontWeight: '800', fontSize: '13px' }}>
                <Clock size={16} />
                <span>سجل المواعيد واحتساب مدة التأخير:</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#78350f', display: 'block', marginBottom: '2px' }}>
                    ⏰ موعد إرسال الطلب للمشتريات:
                  </span>
                  <strong style={{ color: '#451a03', fontSize: '12.5px' }}>
                    {timingInfo.createdStr}
                  </strong>
                </div>

                <div>
                  <span style={{ color: '#78350f', display: 'block', marginBottom: '2px' }}>
                    💬 موعد رد مسؤول المشتريات:
                  </span>
                  <strong style={{ color: timingInfo.isReplied ? '#065f46' : '#b45309', fontSize: '12.5px' }}>
                    {timingInfo.repliedStr}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  marginTop: '10px',
                  paddingTop: '10px',
                  borderTop: '1px dashed #fcd34d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ fontSize: '12.5px', fontWeight: '800', color: '#92400e' }}>
                  ⏳ إجمالي مدة التأخير المنقضية:
                </span>
                <span
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: '800'
                  }}
                >
                  {timingInfo.durationStr}
                </span>
              </div>
            </div>

            {/* تحديد سبب / نوع الشكوى */}
            <div className="outstock-form-group">
              <label style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                سبب الشكوى المصعدة * :
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: complaintType === 'delayed_response' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: complaintType === 'delayed_response' ? '#fef2f2' : '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="complaintType"
                    value="delayed_response"
                    checked={complaintType === 'delayed_response'}
                    onChange={(e) => setComplaintType(e.target.value)}
                  />
                  <div>
                    <strong style={{ fontSize: '13px', color: '#991b1b', display: 'block' }}>
                      ⏱️ تأخر مسؤول المشتريات في الرد على الطلب
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      الطلب معلق منذ فترة طويلة ولم تقم إدارة المشتريات بالرد بالتوفر أو الشطب
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: complaintType === 'available_but_not_arrived' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: complaintType === 'available_but_not_arrived' ? '#fef2f2' : '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="complaintType"
                    value="available_but_not_arrived"
                    checked={complaintType === 'available_but_not_arrived'}
                    onChange={(e) => setComplaintType(e.target.value)}
                  />
                  <div>
                    <strong style={{ fontSize: '13px', color: '#991b1b', display: 'block' }}>
                      🚚 تم الرد أن الصنف متوفر ولكن لم يصل إلى الصيدلية
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      أفادت المشتريات بتوفير الصنف ولم يتم تسليمه أو شحنه للفرع حتى الآن
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: complaintType === 'approved_but_unavailable' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: complaintType === 'approved_but_unavailable' ? '#fef2f2' : '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="radio"
                    name="complaintType"
                    value="approved_but_unavailable"
                    checked={complaintType === 'approved_but_unavailable'}
                    onChange={(e) => setComplaintType(e.target.value)}
                  />
                  <div>
                    <strong style={{ fontSize: '13px', color: '#991b1b', display: 'block' }}>
                      ❌ الصنف لم يتوفر بالرغم من موافقة المشتريات على توفيره
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                      سيتم إرسال تنبيه عاجل للمشتريات: "الصنف لم يتوفر بالرغم أنك وافقت على توفيره"
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* تفاصيل الملاحظة */}
            <div className="outstock-form-group">
              <label style={{ fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '6px', display: 'block' }}>
                تفاصيل الشكوى والملاحظات للمالك * :
              </label>
              <textarea
                required
                rows={3}
                placeholder="اكتب تفاصيل التأخير أو تواصلك مع المشتريات أو رغبة العميل المستعجلة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="outstock-form-textarea"
                style={{ fontSize: '13px', lineHeight: '1.5' }}
              />
            </div>

            {/* الصيدلي مقدم الشكوى */}
            <div className="outstock-form-group">
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>
                الصيدلي المسؤول مقدم الشكوى:
              </label>
              <input
                type="text"
                value={pharmacistName}
                onChange={(e) => setPharmacistName(e.target.value)}
                className="outstock-form-input"
                placeholder="اسم الصيدلي"
                style={{ fontSize: '13px' }}
              />
            </div>
          </div>

          <div
            className="outstock-modal-footer"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}
          >
            <button
              type="button"
              className="outstock-btn outstock-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="outstock-btn"
              style={{
                background: '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: '800',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)'
              }}
            >
              <Send size={15} />
              <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال الشكوى للمالك وتنبيه المشتريات 🚨'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
