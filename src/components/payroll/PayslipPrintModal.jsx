import React from 'react';
import { fmt, arabicWeekday, AR_MONTHS } from '../../utils/formatters';

export default function PayslipPrintModal({
  isOpen,
  onClose,
  emp,
  month,
  shifts = [],
  adjustments = [],
  orgSettings = {},
  computeEmpSummary
}) {
  if (!isOpen || !emp) return null;

  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const logoUrl = orgSettings.logoUrl || '';

  // Month label
  const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-');
  const monthName = AR_MONTHS[parseInt(m, 10) - 1] || m;
  const fullMonthLabel = `${monthName} ${y}`;

  // Filter shifts for this month
  const empShifts = shifts.filter((s) => s.employeeId === emp.id && s.date.startsWith(month));
  const empAdjs = adjustments.filter((a) => (a.employeeId === emp.id || a.employeeId === 'all') && a.date.startsWith(month));

  const totalHours = Math.round(empShifts.reduce((acc, s) => acc + (s.hours || 0), 0) * 100) / 100;
  const totalBreakHours = Math.round(empShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0) * 100) / 100;

  const baseSalary = emp.salary || 4000;
  const workHoursPerDay = emp.workHoursPerDay || emp.workHours || 8;
  const workDaysPerMonth = emp.workDaysPerMonth || emp.workDays || 26;

  const dailyRate = Math.round((baseSalary / workDaysPerMonth) * 100) / 100;
  const hourlyRate = Math.round((dailyRate / workHoursPerDay) * 100) / 100;
  const baseEarnings = Math.round(totalHours * hourlyRate * 100) / 100;

  const totalBonus = empAdjs.filter((a) => a.type === 'bonus').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
  const totalDeduction = empAdjs.filter((a) => a.type === 'deduction' || a.type === 'penalty').reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const netSalary = Math.round((baseEarnings + totalBonus - totalDeduction) * 100) / 100;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="modal-content payslip-modal-container" style={{ maxWidth: '900px', width: '95%', background: '#fff', padding: '0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Modal Action Bar (Hidden during print) */}
        <div
          className="no-print"
          style={{
            background: 'var(--surface-muted)',
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            borderRadius: '20px 20px 0 0',
            flexShrink: 0
          }}
        >
          <h4 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--text)' }}>
            📄 معاينة وتصدير كشف المرتب والبصمات الرسمي (PDF)
          </h4>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-start" onClick={handlePrint}>
              🖨️ طباعة / حفظ كـ PDF
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              ✕ إغلاق
            </button>
          </div>
        </div>

        {/* Printable Payslip Layout Body */}
        <div className="payslip-scroll-area" style={{ overflowY: 'auto', flex: 1 }}>
          <div id="printable-payslip" style={{ padding: '24px', fontFamily: "'Tajawal', sans-serif", color: '#1e293b', direction: 'rtl' }}>
          {/* Header Banner */}
          <div
            style={{
              display: 'flex',
              justify: 'space-between',
              alignItems: 'center',
              borderBottom: '3px solid #0d9488',
              paddingBottom: '16px',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ height: '60px', borderRadius: '8px' }} />
              ) : (
                <div style={{ width: '56px', height: '56px', background: '#0d9488', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
                  🏥
                </div>
              )}
              <div>
                <h2 style={{ margin: 0, fontFamily: 'Cairo', color: '#0f766e', fontSize: '22px' }}>{orgName}</h2>
                <span style={{ fontSize: '13px', color: '#64748b' }}>{gmName}</span>
              </div>
            </div>

            <div style={{ textAlign: 'left' }}>
              <div style={{ background: '#0d9488', color: '#fff', padding: '6px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', fontFamily: 'Cairo' }}>
                كشف مرتب شهر {fullMonthLabel}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                تاريخ الإصدار: {new Date().toISOString().slice(0, 10)}
              </div>
            </div>
          </div>

          {/* Employee Info Card */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
              fontSize: '13.5px'
            }}
          >
            <div>الموظف: <strong style={{ color: '#0f766e', fontSize: '15px' }}>{emp.name}</strong></div>
            <div>كود الموظف: <strong>{emp.code}</strong></div>
            <div>المسمى الوظيفي: <strong>{emp.jobTitle}</strong></div>
            <div>الفرع: <strong>{emp.branchName || 'المركز الرئيسي'}</strong></div>
            <div>رقم الهاتف: <strong>{emp.phone || '—'}</strong></div>
            <div>هاتف الطوارئ: <strong>{emp.relativePhone || emp.emergencyPhone || '—'}</strong></div>
          </div>

          {/* 1 & 2. Side-by-Side Calculation Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {/* احتساب سعر الساعة اليومي */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #cbd5e1' }}>
                ⚙️ احتساب سعر الساعة اليومي
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                  <span>سعر الساعة الشهرية (الراتب الأساسي)</span>
                  <strong>{fmt(baseSalary)} ج.م</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                  <span>ساعات العمل اليومية المحددة</span>
                  <strong>{workHoursPerDay} س / يوم</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                  <span>أيام العمل الشهرية المحددة</span>
                  <strong>{workDaysPerMonth} يوم / شهر</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                  <span>سعر اليوم (المحسوب)</span>
                  <strong>{fmt(dailyRate)} ج.م / يوم</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold', fontSize: '12.5px', paddingTop: '2px' }}>
                  <span>✅ سعر الساعة اليومي المحسوب</span>
                  <span>{fmt(hourlyRate)} ج.م / ساعة</span>
                </div>
              </div>
            </div>

            {/* ساعات العمل والمستحقات */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #cbd5e1' }}>
                ⏱️ ساعات العمل والمستحقات
              </div>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', flex: 1, justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '6px' }}>
                  <span>عدد ساعات العمل الفعلية المسجلة</span>
                  <strong>{fmt(totalHours)} ساعة</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold', fontSize: '13px', paddingTop: '4px' }}>
                  <span>✅ المستحقات الأساسية الفعلية</span>
                  <span>{fmt(baseEarnings)} ج.م</span>
                </div>
              </div>
            </div>
          </div>

          {/* Salary Financial Summary Box (Image 1 Style) */}
          <div style={{ background: '#0f766e', color: '#fff', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontFamily: 'Cairo', color: '#fff' }}>
              🏆 الملخص المالي النهائي لشهر {fullMonthLabel}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px', fontSize: '13px' }}>
              <div>المستحقات الأساسية: <strong>{fmt(baseEarnings)} ج.م</strong></div>
              <div>+ المكافآت والحوافز: <strong>+{fmt(totalBonus)} ج.م</strong></div>
              <div>- الخصومات والجزاءات: <strong>-{fmt(totalDeduction)} ج.م</strong></div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '8px', borderRadius: '6px', textAlign: 'center', fontSize: '16px', fontWeight: 'bold' }}>
              صافي المرتب المستحق: {fmt(netSalary)} ج.م
            </div>
          </div>

          {/* Attendance Punches Table */}
          <h4 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', color: '#0f766e', borderRight: '4px solid #0d9488', paddingRight: '8px', fontSize: '13.5px' }}>
            📋 تفاصيل سجل الحضور والبصمات ({empShifts.length} وردية)
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11.5px', textAlign: 'center' }}>
            <thead>
              <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>#</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>التاريخ</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>اليوم</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>وقت الدخول</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>وقت الخروج</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>البريك</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>ساعات العمل</th>
                <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>الأجر المستحق</th>
              </tr>
            </thead>
            <tbody>
              {empShifts.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '10px', border: '1px solid #cbd5e1', color: '#94a3b8' }}>
                    لا توجد بصمات مسجلة عن هذا الشهر
                  </td>
                </tr>
              ) : (
                empShifts.map((s, idx) => (
                  <tr key={s.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{idx + 1}</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{s.date}</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{arabicWeekday(s.date)}</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#16a34a' }}>{s.timeIn || '—'}</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#dc2626' }}>{s.timeOut || '—'}</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{fmt(s.breakHours)} س</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(s.hours)} س</td>
                    <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0d9488' }}>{fmt(s.hours * hourlyRate)} ج.م</td>
                  </tr>
                ))
              )}
            </tbody>
            {empShifts.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9', fontWeight: 'bold' }}>
                  <td colSpan="5" style={{ padding: '5px', border: '1px solid #cbd5e1', textAlign: 'right' }}>الإجمالي</td>
                  <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>{fmt(totalBreakHours)} س</td>
                  <td style={{ padding: '5px', border: '1px solid #cbd5e1' }}>{fmt(totalHours)} س</td>
                  <td style={{ padding: '5px', border: '1px solid #cbd5e1', color: '#0d9488' }}>{fmt(baseEarnings)} ج.م</td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* Adjustments (Bonuses & Deductions) Table */}
          {empAdjs.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', color: '#0f766e', borderRight: '4px solid #0d9488', paddingRight: '8px', fontSize: '13.5px' }}>
                📝 تفاصيل المكافآت والخصومات ({empAdjs.length} بند)
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>التاريخ</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>نوع الإجراء</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>المبلغ</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>السبب والبيان</th>
                  </tr>
                </thead>
                <tbody>
                  {empAdjs.map((a) => (
                    <tr key={a.id}>
                      <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{a.date}</td>
                      <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: a.type === 'bonus' ? '#16a34a' : '#dc2626' }}>
                        {a.type === 'bonus' ? '➕ مكافأة / حافز' : '➖ خصم / جزاء'}
                      </td>
                      <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(a.amount)} ج.م</td>
                      <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{a.reason || a.details || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Footer Signatures */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '10px', borderTop: '1px solid #cbd5e1', fontSize: '12px', textAlign: 'center' }}>
            <div>
              <div>توقيع الموظف المستلم</div>
              <div style={{ marginTop: '20px', borderBottom: '1px dashed #94a3b8', width: '130px', margin: '20px auto 0' }}></div>
            </div>
            <div>
              <div>توقيع المدير المسؤول</div>
              <div style={{ marginTop: '20px', borderBottom: '1px dashed #94a3b8', width: '130px', margin: '20px auto 0' }}></div>
            </div>
            <div>
              <div>اعتماد الإدارة العليا</div>
              <div style={{ marginTop: '20px', borderBottom: '1px dashed #94a3b8', width: '130px', margin: '20px auto 0' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
