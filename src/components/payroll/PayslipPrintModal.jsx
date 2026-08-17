import React from 'react';
import { fmt, arabicWeekday, AR_MONTHS } from '../../utils/formatters';

export default function PayslipPrintModal({
  isOpen,
  onClose,
  emp,
  month,
  shifts = [],
  adjustments = [],
  branches = [],
  orgSettings = {},
  computeEmpSummary,
  selectedBranchId = null,
  state
}) {
  if (!isOpen || !emp) return null;

  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const logoUrl = orgSettings.logoUrl || '';

  // Month label
  const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-');
  const monthName = AR_MONTHS[parseInt(m, 10) - 1] || m;
  const fullMonthLabel = `${monthName} ${y}`;

  // Branches list for multi-branch employee
  const isMultiBranch = emp.branchesDetails && emp.branchesDetails.length > 1;
  const targetBranchDetails = selectedBranchId
    ? emp.branchesDetails?.find((b) => b.branchId === selectedBranchId)
    : (emp.branchesDetails?.[0] || null);

  const baseSalary = targetBranchDetails ? (parseFloat(targetBranchDetails.salary) || 0) : (parseFloat(emp.salary) || 0);
  const workHoursPerDay = targetBranchDetails ? (parseFloat(targetBranchDetails.workHoursPerDay) || 8) : (parseFloat(emp.workHoursPerDay) || 8);
  const workDaysPerMonth = targetBranchDetails ? (parseFloat(targetBranchDetails.workDaysPerMonth) || 26) : (parseFloat(emp.workDaysPerMonth) || 26);

  // Calculate cutoff range for this month
  const pType = orgSettings?.payrollPeriodType || state?.orgSettings?.payrollPeriodType || (() => { try { return localStorage.getItem('payroll_period_type') || 'cycle'; } catch { return 'cycle'; } })();
  const customFrom = orgSettings?.payrollCustomFrom || state?.orgSettings?.payrollCustomFrom || (() => { try { return localStorage.getItem('payroll_custom_from') || ''; } catch { return ''; } })();
  const customTo = orgSettings?.payrollCustomTo || state?.orgSettings?.payrollCustomTo || (() => { try { return localStorage.getItem('payroll_custom_to') || ''; } catch { return ''; } })();

  let startCutoff, endCutoff;
  if (pType === 'custom' && customFrom && customTo) {
    startCutoff = customFrom <= customTo ? customFrom : customTo;
    endCutoff = customFrom <= customTo ? customTo : customFrom;
  } else {
    const sDay = orgSettings?.payrollPayoutStartDay || state?.orgSettings?.payrollPayoutStartDay || 26;
    const eDay = orgSettings?.payrollPayoutEndDay || state?.orgSettings?.payrollPayoutEndDay || 25;
    const [cutoffY, cutoffM] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    let prevY = cutoffY;
    let prevM = cutoffM - 1;
    if (prevM < 1) { prevM = 12; prevY = cutoffY - 1; }
    startCutoff = `${prevY}-${String(prevM).padStart(2, '0')}-${String(sDay).padStart(2, '0')}`;
    endCutoff = `${cutoffY}-${String(cutoffM).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
  }

  // Filter shifts and adjustments for this cutoff period
  const empShifts = shifts.filter((s) => s.employeeId === emp.id && s.date >= startCutoff && s.date <= endCutoff);
  const empAdjs = adjustments.filter((a) => (a.employeeId === emp.id || a.employeeId === 'all') && a.date >= startCutoff && a.date <= endCutoff);

  // Use computeEmpSummary for accurate calculations including branch selection
  const summary = computeEmpSummary
    ? computeEmpSummary(emp.id, null, month, selectedBranchId)
    : { hours: 0, dailyRate: 0, rate: 0, baseEarnings: 0, totalBonus: 0, totalDeduction: 0, absenceDeduction: 0, netSalary: 0, perBranch: {} };

  const totalHours = summary.hours || 0;
  const totalBreakHours = Math.round(empShifts.reduce((acc, s) => acc + (s.breakHours || 0), 0) * 100) / 100;

  const hourlyRate = summary.rate || (parseFloat(baseSalary) || 0);
  const dailyRate = summary.dailyRate || (hourlyRate * workHoursPerDay);
  const baseEarnings = summary.baseEarnings || 0;

  const totalBonus = summary.totalBonus || 0;
  const totalDeduction = summary.totalDeduction || 0;
  const absenceDeduction = summary.absenceDeduction || 0;
  const netSalary = summary.netSalary || 0;

  const handlePrint = () => {
    window.print();
  };

  const getBranchName = (bId) => {
    const b = (branches || orgSettings.branches || []).find((br) => br.id === bId);
    return b ? b.name : (bId === emp.branchId ? (emp.branchName || 'الفرع الرئيسي') : `فرع ${bId}`);
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
                <div style={{ fontSize: '12px', color: '#0f766e', marginTop: '4px', fontWeight: 'bold' }}>
                  الفترة: من {startCutoff} إلى {endCutoff}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  تاريخ الطباعة: {new Date().toISOString().slice(0, 10)}
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
              <div>الفرع / الفروع: <strong>{selectedBranchId ? getBranchName(selectedBranchId) : (isMultiBranch ? emp.branchesDetails.map(bd => getBranchName(bd.branchId)).join(' + ') : (emp.branchName || 'المركز الرئيسي'))}</strong></div>
              <div>رقم الهاتف: <strong>{emp.phone || '—'}</strong></div>
              <div>هاتف الطوارئ: <strong>{emp.relativePhone || emp.emergencyPhone || '—'}</strong></div>
            </div>

            {/* If multi-branch and no specific branch selected, show breakdown for each branch separately */}
            {isMultiBranch && !selectedBranchId ? (
              <div>
                <h4 style={{ margin: '0 0 10px 0', fontFamily: 'Cairo', color: '#0f766e', borderRight: '4px solid #0d9488', paddingRight: '8px', fontSize: '15px' }}>
                  🏢 تفاصيل راتب وبصمات الموظف لكل فرع على حدة
                </h4>

                {emp.branchesDetails.map((bd) => {
                  const bId = bd.branchId;
                  const bName = getBranchName(bId);
                  const bSummary = summary.perBranch?.[bId] || {
                    salary: bd.salary || 0,
                    workHoursPerDay: bd.workHoursPerDay || 8,
                    workDaysPerMonth: bd.workDaysPerMonth || 26,
                    rate: parseFloat(bd.salary) || 0,
                    dailyRate: (parseFloat(bd.salary) || 0) * (parseFloat(bd.workHoursPerDay) || 8),
                    hours: 0,
                    baseEarnings: 0
                  };

                  const bShifts = empShifts.filter((s) => s.branchId === bId || (!s.branchId && emp.branchesDetails[0].branchId === bId));

                  return (
                    <div key={bId} style={{ marginBottom: '24px', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px', background: '#fafafa' }}>
                      <h5 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#0f766e', borderBottom: '2px solid #0d9488', paddingBottom: '6px' }}>
                        📍 فرع {bName}
                      </h5>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                          <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #cbd5e1' }}>
                            ⚙️ احتساب سعر الساعة
                          </div>
                          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>سعر الساعة بالفرع:</span>
                              <strong>{fmt(bd.salary)} ج.م / ساعة</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>ساعات العمل اليومية:</span>
                              <strong>{bd.workHoursPerDay || 8} س/يوم</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>أيام العمل الشهرية:</span>
                              <strong>{bd.workDaysPerMonth || 26} يوم/شهر</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>الراتب الأساسي الشهري بالفرع:</span>
                              <strong>{fmt(bSummary.monthlySalary || ((parseFloat(bd.salary) || 0) * (parseFloat(bd.workHoursPerDay) || 8) * (parseFloat(bd.workDaysPerMonth) || 26)))} ج.م</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold' }}>
                              <span>سعر الساعة المحسوب:</span>
                              <span>{fmt(bSummary.rate || bd.salary)} ج.م / ساعة</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                          <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '12.5px', borderBottom: '1px solid #cbd5e1' }}>
                            ⏱️ ساعات العمل والمستحقات
                          </div>
                          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>ساعات العمل الفعلية بهذا الفرع:</span>
                              <strong>{fmt(bSummary.hours)} ساعة</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold', fontSize: '13px' }}>
                              <span>المستحقات الأساسية للفرع:</span>
                              <span>{fmt(bSummary.baseEarnings)} ج.م</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <h6 style={{ margin: '0 0 6px 0', fontSize: '12.5px', color: '#334155' }}>
                        📋 بصمات ورشيات فرع {bName} ({bShifts.length} وردية)
                      </h6>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center', background: '#fff' }}>
                        <thead>
                          <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>#</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>التاريخ</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>اليوم</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>الدخول</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>الخروج</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>البريك</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>الساعات</th>
                            <th style={{ padding: '4px', border: '1px solid #cbd5e1' }}>الأجر المستحق</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bShifts.length === 0 ? (
                            <tr>
                              <td colSpan="8" style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#94a3b8' }}>
                                لا توجد بصمات مسجلة بهذا الفرع عن هذا الشهر
                              </td>
                            </tr>
                          ) : (
                            bShifts.map((s, idx) => (
                              <tr key={s.id || idx}>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{idx + 1}</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{s.date}</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{arabicWeekday(s.date)}</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#16a34a' }}>{s.timeIn || '—'}</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1', color: '#dc2626' }}>{s.timeOut || '—'}</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1' }}>{fmt(s.breakHours)} س</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(s.hours)} س</td>
                                <td style={{ padding: '3px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0d9488' }}>{fmt(s.hours * (bSummary.rate || 0))} ج.م</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single branch / Specific branch view */
              <>
                {/* 1 & 2. Side-by-Side Calculation Boxes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  {/* احتساب سعر الساعة وأجر اليوم */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #cbd5e1' }}>
                      ⚙️ احتساب سعر الساعة وأجر اليوم وفق المعادلة المعتمدة
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                        <span>1. سعر الساعة الشهري (المدخل من الإدارة)</span>
                        <strong>{fmt(baseSalary)} ج.م</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                        <span>2. ساعات العمل اليومية المدخلة</span>
                        <strong>{workHoursPerDay} س / يوم</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                        <span>3. أيام العمل الشهرية المدخلة</span>
                        <strong>{workDaysPerMonth} يوم / شهر</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '3px' }}>
                        <span>4. سعر اليوم = ({fmt(baseSalary)} × {workHoursPerDay}) ÷ {workDaysPerMonth}</span>
                        <strong style={{ color: '#0d9488' }}>{fmt(dailyRate)} ج.م / يوم</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold', fontSize: '12.5px', paddingTop: '2px' }}>
                        <span>✅ 5. سعر الساعة اليومي = {fmt(dailyRate)} ÷ {workHoursPerDay}</span>
                        <span>{fmt(hourlyRate)} ج.م / ساعة</span>
                      </div>
                    </div>
                  </div>

                  {/* ساعات العمل والمستحقات */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ background: '#f0fdf4', padding: '6px 12px', color: '#166534', fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #cbd5e1' }}>
                      ⏱️ ساعات العمل وأجر اليوم / المستحقات
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: '6px' }}>
                        <span>عدد ساعات العمل الفعلية المسجلة</span>
                        <strong>{fmt(totalHours)} ساعة</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 'bold', fontSize: '13px', paddingTop: '4px' }}>
                        <span>✅ المستحقات الأساسية ({fmt(totalHours)} س × {fmt(hourlyRate)} ج.م)</span>
                        <span>{fmt(baseEarnings)} ج.م</span>
                      </div>
                    </div>
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
                      empShifts.map((s, idx) => {
                        const shiftRate = (summary.perBranch?.[s.branchId]?.rate) || hourlyRate;
                        return (
                          <tr key={s.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{idx + 1}</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{s.date}</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{arabicWeekday(s.date)}</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#16a34a' }}>{s.timeIn || '—'}</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', color: '#dc2626' }}>{s.timeOut || '—'}</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{fmt(s.breakHours)} س</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(s.hours)} س</td>
                            <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: '#0d9488' }}>{fmt(s.hours * shiftRate)} ج.م</td>
                          </tr>
                        );
                      })
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
              </>
            )}

            {/* Salary Financial Summary Box (Image 1 Style) */}
            <div style={{ background: '#0f766e', color: '#fff', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontFamily: 'Cairo', color: '#fff' }}>
                🏆 الملخص المالي النهائي لشهر {fullMonthLabel} {isMultiBranch && !selectedBranchId ? '(شامل لكافة الفروع)' : ''}
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

            {/* Construct Full Breakdown of Bonuses, Loans, and Absence Deductions */}
            {(() => {
              const manualItems = empAdjs.map((a) => ({
                id: a.id,
                date: a.date,
                typeLabel: a.type === 'bonus' ? '➕ مكافأة / حافز' : '➖ خصم / جزاء مالى',
                amount: parseFloat(a.amount) || 0,
                details: a.reason || a.details || '—',
                color: a.type === 'bonus' ? '#16a34a' : '#dc2626'
              }));

              const allLoansAndRequests = [...(state?.loans || []), ...(state?.requests || [])];
              const empLoans = allLoansAndRequests.filter(
                (r) =>
                  String(r.employeeId) === String(emp.id) &&
                  (r.status === 'approved' || r.adminApproved) &&
                  (r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine') &&
                  (r.date || (r.createdAt ? r.createdAt.slice(0, 10) : '')).startsWith(month)
              );

              const loanItems = empLoans.map((l) => ({
                id: l.id,
                date: l.date || (l.createdAt ? l.createdAt.slice(0, 10) : month + '-01'),
                typeLabel: (l.type === 'meds' || l.type === 'credit_medicine') ? '💳 خصم أدوية ومشتريات آجل' : '💳 خصم سلفة مالية شخصية',
                amount: parseFloat(l.amount) || 0,
                details: l.reason || l.details || l.notes || 'خصم سلفة مالية معتمدة رسمياً',
                color: '#dc2626'
              }));

              const absenceDaysCount = summary.absenceDaysCount || 0;
              const absenceDeductionTotal = summary.absenceDeduction || 0;
              const absenceItem = absenceDaysCount > 0 ? [{
                id: 'absence_summary',
                date: `${month} (إجمالي غيابات الشهر)`,
                typeLabel: '🚫 خصم غيابات بدون إذن',
                amount: absenceDeductionTotal,
                details: `خصم عدد ${absenceDaysCount} يوم غياب بدون إذن رسمياً عن الوردية (بسعر يوم ${fmt(dailyRate)} ج.م)`,
                color: '#b91c1c'
              }] : [];

              const allBreakdownItems = [...manualItems, ...loanItems, ...absenceItem];

              if (allBreakdownItems.length === 0) return null;

              return (
                <>
                  <h4 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', color: '#0f766e', borderRight: '4px solid #0d9488', paddingRight: '8px', fontSize: '13.5px' }}>
                    📝 تفاصيل المكافآت والخصومات والغيابات السلوكية ({allBreakdownItems.length} بند)
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '11.5px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                        <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>التاريخ</th>
                        <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>نوع الإجراء / الخصم</th>
                        <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>المبلغ</th>
                        <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>السبب والبيان بالتفصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBreakdownItems.map((item) => (
                        <tr key={item.id}>
                          <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{item.date}</td>
                          <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: item.color }}>
                            {item.typeLabel}
                          </td>
                          <td style={{ padding: '4px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{fmt(item.amount)} ج.م</td>
                          <td style={{ padding: '4px', border: '1px solid #cbd5e1' }}>{item.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}

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

