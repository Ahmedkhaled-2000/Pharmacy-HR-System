import React, { useMemo } from 'react';
import { getEmpDisplayName } from '../../utils/formatters';
import { normalizeSchedule } from '../../utils/rosterEngine';
import { triggerDirectPrint } from '../../utils/printHelper';
import { formatTime12H } from '../branches/BranchMonthlyRosterModule';

const STANDARD_DAYS = [
  { key: 'السبت', label: 'السبت' },
  { key: 'الأحد', label: 'الأحد' },
  { key: 'الاثنين', label: 'الاثنين' },
  { key: 'الثلاثاء', label: 'الثلاثاء' },
  { key: 'الأربعاء', label: 'الأربعاء' },
  { key: 'الخميس', label: 'الخميس' },
  { key: 'الجمعة', label: 'الجمعة' }
];

export default function PendingRosterModal({
  isOpen,
  onClose,
  pendingReq,
  emp,
  state,
  selectedMonth,
  cycleRange
}) {
  if (!isOpen || !pendingReq) return null;

  const branchId = pendingReq.branchId || emp?.branchId;
  const branchObj = (state?.branches || []).find(b => String(b.id) === String(branchId) || b.name === branchId);
  const branchName = branchObj ? branchObj.name : (branchId ? `فرع ${branchId}` : 'الفرع الرئيسي');

  // Normalize submitted schedule
  const submittedSchedule = useMemo(() => {
    return normalizeSchedule(pendingReq.schedule);
  }, [pendingReq.schedule]);

  // Check if there was an existing approved roster to offer comparison
  const existingRoster = useMemo(() => {
    return (state?.rosters || []).find(r =>
      (String(r.employeeId) === String(emp?.id) || (emp?.code && String(r.employeeCode) === String(emp?.code))) &&
      (!pendingReq.month || r.month === pendingReq.month || r.month === selectedMonth) &&
      (String(r.branchId || '') === String(branchId || '') || !r.branchId)
    );
  }, [state?.rosters, emp, pendingReq, selectedMonth, branchId]);

  // Compute stats for submitted schedule
  const stats = useMemo(() => {
    let totalHours = 0;
    let workDays = 0;
    let offDays = 0;

    STANDARD_DAYS.forEach(d => {
      const dayConf = submittedSchedule[d.key];
      const isOff = !dayConf || dayConf.type === 'off' || dayConf.isOff === true;
      if (isOff) {
        offDays += 1;
      } else if (dayConf.start && dayConf.end) {
        workDays += 1;
        const [sh, sm] = dayConf.start.split(':').map(Number);
        const [eh, em] = dayConf.end.split(':').map(Number);
        let h = eh - sh + (em - sm) / 60;
        if (h <= 0) h += 24;
        totalHours += h;
      } else {
        offDays += 1;
      }
    });

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      workDays,
      offDays
    };
  }, [submittedSchedule]);

  const isDirectAdmin = pendingReq.isDirectToAdmin || pendingReq.branchNotRequired || pendingReq.targetApproval === 'admin_only';
  const branchApproved = Boolean(pendingReq.branchApproved);
  const adminApproved = Boolean(pendingReq.adminApproved || pendingReq.status === 'approved');
  const isRejected = pendingReq.status === 'rejected';

  const formattedCreatedDate = pendingReq.createdAt 
    ? new Date(pendingReq.createdAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  // Handler for printing submitted schedule
  const handlePrintSchedule = () => {
    const companyName = state?.orgSettings?.companyName || 'مجموعة صيدليات د. منار الكومي';
    const empName = emp ? getEmpDisplayName(emp) : (pendingReq.employeeName || 'الموظف');

    const rowsHTML = STANDARD_DAYS.map(d => {
      const conf = submittedSchedule[d.key];
      const isOff = !conf || conf.type === 'off' || conf.isOff === true;
      const start12 = conf?.start ? formatTime12H(conf.start) : '';
      const end12 = conf?.end ? formatTime12H(conf.end) : '';

      let hours = 0;
      if (!isOff && conf?.start && conf?.end) {
        const [sh, sm] = conf.start.split(':').map(Number);
        const [eh, em] = conf.end.split(':').map(Number);
        let h = eh - sh + (em - sm) / 60;
        if (h <= 0) h += 24;
        hours = Math.round(h * 10) / 10;
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${isOff ? '#fefce8' : '#ffffff'};">
          <td style="padding: 8px 10px; font-weight: 800; color: #1e293b;">${d.label}</td>
          <td style="padding: 8px 10px; text-align: center;">
            ${isOff 
              ? '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">🏖️ راحة أسبوعية (OFF)</span>' 
              : '<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">🟢 وردية عمل</span>'
            }
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: ${isOff ? '#94a3b8' : '#0f766e'}; white-space: nowrap; direction: rtl;">
            ${isOff ? '—' : `من <strong>${start12}</strong> إلى <strong>${end12}</strong>`}
          </td>
          <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: #0f172a;">
            ${isOff ? '0 س' : `${hours} س`}
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <div style="direction: rtl; font-family: 'Cairo', 'Tajawal', sans-serif; padding: 12px;">
        <div style="border-bottom: 2.5px solid #0284c7; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 12px; font-weight: 800; color: #0284c7;">${companyName}</div>
            <h1 style="margin: 2px 0 0 0; font-size: 16px; font-weight: 900; color: #0f172a;">
              نموذج الجدول الشهري المرسل للاعتماد — شهر (${pendingReq.month || selectedMonth})
            </h1>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">
              الموظف: <strong>${empName}</strong> | الفرع: <strong>${branchName}</strong>
            </div>
          </div>
          <div style="text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 8px; font-size: 10.5px;">
            <div>حالة الطلب: <strong style="color: #d97706;">قيد المراجعة والاعتماد</strong></div>
            <div style="color: #64748b; margin-top: 2px;">تاريخ التقديم: ${formattedCreatedDate}</div>
          </div>
        </div>

        <div style="margin-bottom: 12px; padding: 8px 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; font-size: 11px; color: #0369a1; display: flex; justify-content: space-between;">
          <span>دورة الرواتب: <strong>${cycleRange?.label || selectedMonth}</strong></span>
          <span>إجمالي ساعات العمل: <strong>${stats.totalHours} س/أسبوع</strong></span>
          <span>أيام العمل: <strong>${stats.workDays}</strong> | الراحات: <strong>${stats.offDays}</strong></span>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px 10px; text-align: right;">اليوم</th>
              <th style="padding: 8px 10px; text-align: center;">الحالة</th>
              <th style="padding: 8px 10px; text-align: center;">أوقات الدوام (12H)</th>
              <th style="padding: 8px 10px; text-align: center;">الساعات اليومية</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>

        <div style="margin-top: 20px; border-top: 1.5px solid #cbd5e1; padding-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
          <div style="border: 1px dashed #cbd5e1; padding: 8px; border-radius: 6px; background: #f8fafc;">
            <div style="font-size: 10.5px; font-weight: 800; margin-bottom: 16px;">توقيع الموظف (مقدم الطلب)</div>
            <div style="border-bottom: 1px solid #94a3b8; width: 70%; margin: 0 auto 4px auto;"></div>
            <div style="font-size: 9px; color: #64748b;">${empName}</div>
          </div>
          <div style="border: 1px dashed #cbd5e1; padding: 8px; border-radius: 6px; background: #f8fafc;">
            <div style="font-size: 10.5px; font-weight: 800; margin-bottom: 16px;">اعتماد مدير الفرع</div>
            <div style="border-bottom: 1px solid #94a3b8; width: 70%; margin: 0 auto 4px auto;"></div>
            <div style="font-size: 9px; color: #64748b;">التاريخ: .... / .... / 2026</div>
          </div>
          <div style="border: 1px dashed #cbd5e1; padding: 8px; border-radius: 6px; background: #f8fafc;">
            <div style="font-size: 10.5px; font-weight: 800; margin-bottom: 16px;">اعتماد الإدارة العليا</div>
            <div style="border-bottom: 1px solid #94a3b8; width: 70%; margin: 0 auto 4px auto;"></div>
            <div style="font-size: 9px; color: #64748b;">الختم والتوقيع الرسمي</div>
          </div>
        </div>
      </div>
    `;

    triggerDirectPrint(html, `جدول_شهري_مرسل_${emp?.name || 'موظف'}_${pendingReq.month || selectedMonth}`);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '750px',
          width: '94%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
          borderRadius: '16px',
          border: '1.5px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
        }}
      >
        {/* ── Modal Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>📋</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-dark)', fontWeight: 800 }}>
                تفاصيل الجدول الشهري المرسل للاعتماد
              </h3>
              <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
                شهر ({pendingReq.month || selectedMonth}) — فرع {branchName}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 800
            }}>
              ⏳ قيد المراجعة والاعتماد
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px' }}
              onClick={onClose}
            >
              ✕ إغلاق
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ── 1. Request & Employee Metadata ── */}
          <div style={{ background: 'var(--surface-muted)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>اسم الموظف:</span>
                <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '14px', marginTop: '1px' }}>
                  {emp ? getEmpDisplayName(emp) : (pendingReq.employeeName || 'الموظف')}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>الكود والوظيفة:</span>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginTop: '1px' }}>
                  كود: {emp?.code || pendingReq.employeeCode || '—'} | {emp?.jobTitle || 'موظف'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>الفرع المجدول عليه:</span>
                <div style={{ fontWeight: 800, color: '#0f766e', marginTop: '1px' }}>
                  🏢 {branchName}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>تاريخ ووقت التقديم:</span>
                <div style={{ fontWeight: 700, color: '#2563eb', marginTop: '1px' }}>
                  🕒 {formattedCreatedDate}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>دورة الرواتب المعتمدة:</span>
                <div style={{ fontWeight: 700, color: '#0f766e', marginTop: '1px' }}>
                  🗓️ {cycleRange?.label || `${pendingReq.month || selectedMonth}`}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>معرف الطلب:</span>
                <div style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                  #{pendingReq.id}
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Approval Status Pipeline ── */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>
              🚦 مسار واعتماد الطلب المزدوج:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              
              {/* Step 1: Employee Submission */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>1. الموظف (التقديم):</div>
                <div style={{ fontWeight: 800, color: '#15803d', fontSize: '12.5px', marginTop: '2px' }}>
                  🟢 تم إرسال وتأكيد الجدول بنجاح
                </div>
              </div>

              {/* Step 2: Branch Manager */}
              <div style={{
                background: isDirectAdmin ? '#f8fafc' : (branchApproved ? '#f0fdf4' : '#fffbeb'),
                border: `1px solid ${isDirectAdmin ? '#e2e8f0' : (branchApproved ? '#bbf7d0' : '#fde68a')}`,
                borderRadius: '8px',
                padding: '10px 12px'
              }}>
                <div style={{ fontSize: '11px', color: isDirectAdmin ? '#64748b' : (branchApproved ? '#166534' : '#92400e'), fontWeight: 700 }}>
                  2. مدير الفرع:
                </div>
                <div style={{ fontWeight: 800, color: isDirectAdmin ? '#64748b' : (branchApproved ? '#15803d' : '#b45309'), fontSize: '12.5px', marginTop: '2px' }}>
                  {isDirectAdmin 
                    ? '🔒 موجه للإدارة العليا مباشرة' 
                    : branchApproved 
                      ? '🟢 تم اعتماد وموافقة مدير الفرع' 
                      : '⏳ بانتظار مراجعة وموافقة مدير الفرع'
                  }
                </div>
              </div>

              {/* Step 3: Senior Admin */}
              <div style={{
                background: adminApproved ? '#f0fdf4' : (isRejected ? '#fef2f2' : '#fffbeb'),
                border: `1px solid ${adminApproved ? '#bbf7d0' : (isRejected ? '#fecaca' : '#fde68a')}`,
                borderRadius: '8px',
                padding: '10px 12px'
              }}>
                <div style={{ fontSize: '11px', color: adminApproved ? '#166534' : (isRejected ? '#991b1b' : '#92400e'), fontWeight: 700 }}>
                  3. الإدارة العليا:
                </div>
                <div style={{ fontWeight: 800, color: adminApproved ? '#15803d' : (isRejected ? '#b91c1c' : '#b45309'), fontSize: '12.5px', marginTop: '2px' }}>
                  {adminApproved 
                    ? '🟢 معتمد نهائياً ومفعل بالنظام' 
                    : isRejected 
                      ? '🔴 تم رفض الطلب' 
                      : '⏳ بانتظار الاعتماد النهائي من الإدارة'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Schedule Summary Badges ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)',
            border: '1.5px solid #5eead4',
            padding: '12px 18px',
            borderRadius: '12px',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>⏱️</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f766e' }}>
                  إجمالي الساعات الأسبوعية المخططة: <strong>{stats.totalHours} ساعة</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#115e59', marginTop: '1px' }}>
                  موزعة على <strong>{stats.workDays}</strong> أيام عمل | <strong>{stats.offDays}</strong> أيام راحة أسبوعية
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrintSchedule}
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                background: '#ffffff',
                border: '1px solid #99f6e4',
                color: '#0f766e',
                fontWeight: 800,
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              🖨️ طباعة الجدول المرسل
            </button>
          </div>

          {/* ── 4. Detailed 7 Days Schedule Cards ── */}
          <div>
            <h4 style={{ margin: '0 0 10px', fontSize: '14px', color: 'var(--text)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🗓️</span>
              <span>توزيع الورديات للأسبوع بالكامل (السبت إلى الجمعة):</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px' }}>
              {STANDARD_DAYS.map((day) => {
                const conf = submittedSchedule[day.key];
                const isOff = !conf || conf.type === 'off' || conf.isOff === true;
                const isFriday = day.key === 'الجمعة';

                let shiftHours = 0;
                if (!isOff && conf?.start && conf?.end) {
                  const [sh, sm] = conf.start.split(':').map(Number);
                  const [eh, em] = conf.end.split(':').map(Number);
                  let h = eh - sh + (em - sm) / 60;
                  if (h <= 0) h += 24;
                  shiftHours = Math.round(h * 10) / 10;
                }

                return (
                  <div
                    key={day.key}
                    style={{
                      background: isOff ? '#fefce8' : '#ffffff',
                      border: `1.5px solid ${isOff ? '#fde68a' : '#cbd5e1'}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: isOff ? 'none' : '0 1px 3px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13.5px', color: isFriday ? '#92400e' : '#1e293b' }}>
                        {isFriday ? '🕌' : '🗓️'} يوم {day.label}
                      </span>
                      {isOff ? (
                        <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                          🏖️ راحة (OFF)
                        </span>
                      ) : (
                        <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                          🟢 وردية عمل
                        </span>
                      )}
                    </div>

                    {isOff ? (
                      <div style={{ fontSize: '12px', color: '#a16207', padding: '6px 0' }}>
                        عطلة وراحة أسبوعية معتمدة
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f766e', direction: 'rtl', whiteSpace: 'nowrap' }}>
                          ⏱️ من <strong>{formatTime12H(conf.start)}</strong> إلى <strong>{formatTime12H(conf.end)}</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>مدة الشيفت:</span>
                          <strong style={{ color: '#0f172a' }}>{shiftHours} ساعة</strong>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 5. Reassurance and Instructions Notice ── */}
          <div style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12.5px',
            color: '#1e40af',
            lineHeight: 1.6
          }}>
            💡 <strong>ملاحظة هامة للموظف:</strong> هذا هو الجدول المقترح الذي قمت بتقديمه وهو حالياً قيد المراجعة والموافقة من مدير الفرع والإدارة العليا. بمجرد اعتماده سيصبح هو الجدول الرسمي المعمول به في حسابك، وستظهر أوقات حضورك وانصرافك بالبصمة وفقاً لهذه المواعيد.
          </div>

        </div>

        {/* ── Modal Footer ── */}
        <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handlePrintSchedule}
            style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px' }}
          >
            🖨️ طباعة نسخة من الطلب
          </button>
          <button
            type="button"
            className="btn btn-start"
            onClick={onClose}
            style={{ fontSize: '13px', padding: '8px 20px', borderRadius: '8px' }}
          >
            ✓ حسناً، إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
