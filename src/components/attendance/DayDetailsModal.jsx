import React from 'react';
import { createPortal } from 'react-dom';
import { arabicWeekday } from '../../utils/formatters';

export default function DayDetailsModal({ details, onClose }) {
  if (!details) return null;

  const {
    punch = {},
    date = '',
    dayName = '',
    employee = {},
    hourlyRate = 0,
    regH = 0,
    otH = 0,
    totalH = 0,
    breakH = 0,
    shiftEarned = 0,
    pendingOtAmount = 0,
    hasPerm = false,
    perm = null,
    permHours = 0,
    effectiveOtStatus = null,
    effectiveOtHours = 0,
    effectivePenaltyStatus = null,
    linkedPenaltyReq = null,
    linkedOtReq = null,
    isManualShift = false,
    isRejectedPhoto = false,
    cleanNotes = '',
    source = 'kiosk'
  } = details;

  const empName = employee?.name || punch?.employeeName || 'الموظف';
  const empCode = employee?.code || punch?.employeeCode || '';
  const dateStr = date || punch?.date || '';
  const resolvedDayName = dayName || (dateStr ? arabicWeekday(dateStr) : '');
  const rateVal = parseFloat(hourlyRate) || 0;

  // Calculations for financial breakdown
  const earnedBase = parseFloat(shiftEarned) || (parseFloat(regH || totalH || 0) * rateVal);
  const otHoursVal = parseFloat(effectiveOtHours || otH || 0);
  const earnedOt = effectiveOtStatus === 'approved' ? (otHoursVal * rateVal) : 0;
  const penaltyAmount = linkedPenaltyReq ? parseFloat(linkedPenaltyReq.amount || linkedPenaltyReq.details?.penaltyAmount || 0) : 0;
  const netEarnedDay = Math.max(0, earnedBase + earnedOt - penaltyAmount);

  const modalJSX = (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999999,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
    >
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          background: 'var(--surface, #ffffff)',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          border: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '2px solid var(--border, #e2e8f0)',
          background: 'var(--surface-muted, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📋</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--primary-dark, #0f172a)' }}>
                تفاصيل اليوم — {resolvedDayName} ({dateStr})
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                الموظف: {empName} {empCode ? `(كود: ${empCode})` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              fontSize: '15px',
              border: '1px solid var(--border, #cbd5e1)',
              borderRadius: '8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Section 1: ساعات العمل والورديات */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#f1f5f9',
              padding: '10px 14px',
              fontWeight: 800,
              fontSize: '13.5px',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid #cbd5e1'
            }}>
              <span>⏱️</span>
              <span>ساعات العمل والحضور الفعلي</span>
            </div>
            <div style={{ padding: '8px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>وقت الحضور المسجل:</span>
                <span style={{ fontWeight: 700, color: '#15803d' }}>🟢 {punch?.timeIn || punch?.checkIn || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>وقت الانصراف المسجل:</span>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>🔴 {punch?.timeOut || punch?.checkOut || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>ساعات الاستراحة (البريك):</span>
                <span style={{ fontWeight: 700 }}>{breakH ? `${breakH} ساعة` : 'لا يوجد'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>ساعات العمل الفعلية:</span>
                <span style={{ fontWeight: 800, color: '#0d9488' }}>{totalH ? `${totalH} ساعة` : '—'}</span>
              </div>
              {otHoursVal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>ساعات العمل الإضافي (Overtime):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800, color: '#b45309' }}>{otHoursVal} ساعة</span>
                    {effectiveOtStatus === 'approved' && (
                      <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>معتمد</span>
                    )}
                    {effectiveOtStatus === 'rejected' && (
                      <span style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>مرفوض</span>
                    )}
                    {(!effectiveOtStatus || effectiveOtStatus === 'pending') && (
                      <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>قيد الاعتماد</span>
                    )}
                  </div>
                </div>
              )}
              {hasPerm && permHours > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>ساعات الإذن المعتمد:</span>
                  <span style={{ fontWeight: 800, color: '#0284c7' }}>{permHours} ساعة</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: التفاصيل المالية والاستحقاقات */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#f0fdf4',
              padding: '10px 14px',
              fontWeight: 800,
              fontSize: '13.5px',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid #bbf7d0'
            }}>
              <span>💰</span>
              <span>التفاصيل المالية والاستحقاق لليوم</span>
            </div>
            <div style={{ padding: '8px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>سعر الساعة المعتمد:</span>
                <span style={{ fontWeight: 700 }}>{rateVal.toFixed(2)} ج.م / ساعة</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>مستحق ساعات العمل الأساسية:</span>
                <span style={{ fontWeight: 700, color: isRejectedPhoto ? '#dc2626' : '#16a34a' }}>
                  {isRejectedPhoto ? '0.00 ج.م (صورة مرفوضة)' : `${earnedBase.toFixed(2)} ج.م`}
                </span>
              </div>
              {otHoursVal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>مستحق الساعات الإضافية:</span>
                  <span style={{ fontWeight: 700, color: effectiveOtStatus === 'approved' ? '#16a34a' : '#b45309' }}>
                    {effectiveOtStatus === 'approved' ? `${earnedOt.toFixed(2)} ج.م` : `(${(otHoursVal * rateVal).toFixed(2)} ج.م معلق)`}
                  </span>
                </div>
              )}
              {penaltyAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '13px' }}>
                  <span style={{ color: '#991b1b' }}>خصومات وجزاءات اليوم:</span>
                  <span style={{ fontWeight: 800, color: '#dc2626' }}>-{penaltyAmount.toFixed(2)} ج.م</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: '14px', fontWeight: 800, color: '#166534' }}>
                <span>صافي المستحق النهائي لليوم:</span>
                <span style={{ fontSize: '16px' }}>{isRejectedPhoto ? '0.00 ج.م' : `${netEarnedDay.toFixed(2)} ج.م`}</span>
              </div>
            </div>
          </div>

          {/* Section 3: الملاحظات والإجراءات التوثيقية (كل إجراء في صف مستقل) */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: '#f8fafc',
              padding: '10px 14px',
              fontWeight: 800,
              fontSize: '13.5px',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid #cbd5e1'
            }}>
              <span>📝</span>
              <span>سجل الإجراءات والملاحظات</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Row 1: طريقة البصمة */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                <span style={{ fontSize: '16px' }}>📌</span>
                <span style={{ fontWeight: 700, color: '#334155' }}>طريقة التسجيل:</span>
                <span>{isManualShift ? 'بصمة يدوية معتمدة' : (punch?.isOfflineSynced ? 'مزامنة أوفلاين' : 'بصمة كشك اعتيادية')}</span>
              </div>

              {/* Row 2: إذن معتمد إن وجد */}
              {hasPerm && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a', fontSize: '13px', color: '#854d0e' }}>
                  <span style={{ fontSize: '16px' }}>⏰</span>
                  <span style={{ fontWeight: 800 }}>إذن خروج معتمد:</span>
                  <span>من {perm?.startTime || '—'} إلى {perm?.endTime || '—'} (المدة: {permHours} س)</span>
                </div>
              )}

              {/* Row 3: جزاء إن وجد */}
              {linkedPenaltyReq && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '13px', color: '#991b1b' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <span style={{ fontWeight: 800 }}>جزاء / خصم لائحى:</span>
                  <span>{linkedPenaltyReq.reason || linkedPenaltyReq.details?.penaltyReason || 'مخالفة لائحية'} {penaltyAmount > 0 ? `(مبلغ: ${penaltyAmount} ج.م)` : ''}</span>
                </div>
              )}

              {/* Row 4: رفض الصورة إن وجد */}
              {isRejectedPhoto && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '13px', color: '#991b1b' }}>
                  <span style={{ fontSize: '16px' }}>🚫</span>
                  <span style={{ fontWeight: 800 }}>حالة الصورة:</span>
                  <span>تم رفض البصمة لعدم مطابقة صورة الحضور، وتم استبعاد الوردية من الأجر.</span>
                </div>
              )}

              {/* Row 5: الملاحظات النصية */}
              {cleanNotes && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <span style={{ fontSize: '16px' }}>💬</span>
                  <div>
                    <span style={{ fontWeight: 700, color: '#334155' }}>ملاحظات الوردية: </span>
                    <span style={{ color: '#475569' }}>{cleanNotes}</span>
                  </div>
                </div>
              )}

              {!hasPerm && !linkedPenaltyReq && !isRejectedPhoto && !cleanNotes && (
                <div style={{ fontSize: '12.5px', color: 'var(--muted, #64748b)', padding: '4px 0' }}>
                  لا توجد إجراءات استثنائية أو ملاحظات مسجلة على هذا اليوم.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border, #e2e8f0)',
          background: 'var(--surface-muted, #f8fafc)',
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0
        }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{
              padding: '7px 20px',
              fontSize: '13.5px',
              background: '#0d9488',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalJSX, document.body);
  }
  return modalJSX;
}
