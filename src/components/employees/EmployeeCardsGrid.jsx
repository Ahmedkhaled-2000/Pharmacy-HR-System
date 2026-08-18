import React from 'react';
import { fmt } from '../../utils/formatters';

export default function EmployeeCardsGrid({
  state,
  monthPicker,
  filterFn,
  computeEmpSummary,
  openEmpCard,
  openEditEmpModal,
  handleDeleteEmp,
  getActiveElapsedStr,
  getActiveBreakStr,
  pauseShift,
  resumeShift,
  stopShift,
  importEmployeesFromExcel,
  exportEmployeesToExcel,
  openAddEmpModal,
  openEmpPhonesModal
}) {
  const branches = state.branches || [];
  const employees = state.employees || [];
  const empRequests = state.resignationRequests || [];

  // Helper for resignation end date
  const calculateEndDate = (start, days) => {
    if (!start || !days) return '';
    const d = new Date(start);
    d.setDate(d.getDate() + parseInt(days, 10));
    return d.toISOString().split('T')[0];
  };

  // Group employees by branch
  const getBranchName = (bId) => {
    const b = branches.find((item) => item.id === bId);
    return b ? `${b.name} (${b.branchCode})` : 'المركز الرئيسي / بدون فرع';
  };

  // Grouping map
  const groupedEmployees = {};
  employees.forEach((emp) => {
    if (emp.branchesDetails && emp.branchesDetails.length > 0) {
      emp.branchesDetails.forEach((bd) => {
        const key = bd.branchId || 'main';
        if (!groupedEmployees[key]) groupedEmployees[key] = [];
        groupedEmployees[key].push(emp);
      });
    } else {
      const key = emp.branchId || 'main';
      if (!groupedEmployees[key]) groupedEmployees[key] = [];
      groupedEmployees[key].push(emp);
    }
  });

  return (
    <>
      {/* Section Header */}
      <div className="section-head" style={{ marginBottom: '20px' }}>
        <h2>👥 قائمة الموظفين الشاملة حسب الفروع ({employees.length} موظف)</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={openEmpPhonesModal}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid var(--primary-tint)',
              fontWeight: 800,
              fontSize: '13.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> أرقام الموظفين
          </button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer', margin: 0 }}>
            📤 استيراد الموظفين من Excel
            <input type="file" accept=".xlsx, .xls" onChange={importEmployeesFromExcel} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost" onClick={exportEmployeesToExcel}>
            📥 تصدير الموظفين إلى Excel
          </button>
          <button className="btn-add-job" onClick={openAddEmpModal}>
            + إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* Render Branch Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {Object.keys(groupedEmployees).map((branchKey) => {
          const branchEmps = groupedEmployees[branchKey];
          const branchTitle = getBranchName(branchKey);

          return (
            <div key={branchKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
              {/* Branch Header Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
                  color: '#fff',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '17px', color: '#fff' }}>
                  🏬 {branchTitle}
                </h3>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold' }}>
                  {branchEmps.length} موظف
                </span>
              </div>

              {/* Full Width Horizontal Rectangular Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {branchEmps.map((emp) => {
                  const active = state.activeShifts[emp.id];
                  const empSum = computeEmpSummary(emp.id, filterFn);
                  
                  const isEmpTarget = (r) => String(r.employeeId) === String(emp.id) || (emp.code && String(r.employeeId) === String(emp.code));
                  const hasApprovedWithdraw = empRequests.some(r => isEmpTarget(r) && r.type === 'withdraw' && (r.adminStatus === 'approved' || r.managerStatus === 'approved'));
                  
                  const empResignations = empRequests.filter(r => isEmpTarget(r) && r.type === 'resignation' && !r.isCancelled && r.adminStatus !== 'cancelled');
                  const activeResignation = empResignations.length > 0 ? empResignations.sort((a,b) => b.requestDate.localeCompare(a.requestDate))[0] : null;
                  
                  let resStatusBadge = null;
                  if (hasApprovedWithdraw) {
                    resStatusBadge = null;
                  } else if (emp.status === 'تم الاستقالة' || emp.is_active === false) {
                    resStatusBadge = (
                      <div style={{ background: 'var(--danger-light, #fee2e2)', color: 'var(--danger-dark, #991b1b)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>
                        🔴 تم إنهاء الخدمة / مستقيل {emp.suspension_reason ? `(${emp.suspension_reason})` : ''}
                      </div>
                    );
                  } else if (activeResignation) {
                    if (activeResignation.employeeConditionStatus === 'rejected') {
                      resStatusBadge = <div style={{ background: 'var(--danger-light)', color: 'var(--danger-dark)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>❌ استقالة مرفوضة من الموظف (تم الإيقاف)</div>;
                    } else if (activeResignation.adminStatus === 'rejected' || activeResignation.managerStatus === 'rejected') {
                      resStatusBadge = <div style={{ background: 'var(--danger-light)', color: 'var(--danger-dark)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>❌ استقالة مرفوضة إدارياً</div>;
                    } else if (activeResignation.adminStatus === 'approved' && activeResignation.conditionsDaysRemaining > 0) {
                      const endDate = calculateEndDate(activeResignation.conditionsStartDate, activeResignation.conditionsDaysRemaining);
                      resStatusBadge = <div style={{ background: 'var(--warning-light)', color: 'var(--warning-dark)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>⏳ استقالة مقبولة بفترة إشعار (متبقي {activeResignation.conditionsDaysRemaining} أيام) - تنتهي في {endDate}</div>;
                    } else if (activeResignation.adminStatus === 'approved' && activeResignation.conditionsDaysRemaining === 0) {
                      resStatusBadge = <div style={{ background: 'var(--danger-light)', color: 'var(--danger-dark)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>🔴 استقالة سارية (منفذة فورا)</div>;
                    } else {
                      resStatusBadge = <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block' }}>📝 استقالة قيد المراجعة</div>;
                    }
                  }

                  return (
                    <div
                      key={emp.id}
                      style={{
                        background: '#fff',
                        border: '1px solid var(--border)',
                        borderRadius: '14px',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'row',
                        justify: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '16px',
                        width: '100%',
                        boxSizing: 'border-box',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                      }}
                    >
                      {/* Left Block: Avatar, Name, Title & Code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '260px', flex: 1 }}>
                        <div className="emp-avatar-circle" style={{ width: '52px', height: '52px', flexShrink: 0 }}>
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt={emp.name} className="emp-img" />
                          ) : (
                            <span style={{ fontSize: '20px' }}>{emp.name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '17px' }}>{emp.name}</h3>
                            <span className="code-badge">كود: {emp.code}</span>
                            {emp.devices && emp.devices.some((d) => d.status === 'pending') && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  width: '10px',
                                  height: '10px',
                                  backgroundColor: '#ef4444',
                                  borderRadius: '50%',
                                  boxShadow: '0 0 0 4px #fee2e2'
                                }}
                                title="يوجد طلب اعتماد جهاز قيد الانتظار"
                              ></span>
                            )}
                          </div>
                          <span style={{ color: 'var(--muted)', fontSize: '13px', display: 'block' }}>
                            {emp.jobTitle} {emp.phone ? ` · 📞 ${emp.phone}` : ''}
                          </span>
                          {resStatusBadge}
                        </div>
                      </div>

                      {/* Middle Block: Live Punch Clock Status (Start Button Removed) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                        <span className={`dot ${active ? (active.isPaused ? 'paused' : 'live') : ''}`}></span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text)' }}>
                            {active ? getActiveElapsedStr(emp.id) : 'لا توجد وردية نشطة الآن'}
                          </div>
                          <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                            {active ? (
                              active.isPaused ? (
                                <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                                  موقفة مؤقتاً (بريك: {getActiveBreakStr(emp.id)})
                                </span>
                              ) : (
                                `جارية منذ ${active.timeIn}${getActiveBreakStr(emp.id) ? ` · (بريك: ${getActiveBreakStr(emp.id)})` : ''}`
                              )
                            ) : (
                              'تتم البصمة من بوابة الحضور / الكشك'
                            )}
                          </div>
                        </div>

                        {active && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {active.isPaused ? (
                              <button className="btn btn-resume" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => resumeShift(emp.id)}>
                                استئناف
                              </button>
                            ) : (
                              <button className="btn btn-pause" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => pauseShift(emp.id)}>
                                بريك
                              </button>
                            )}
                            <button className="btn btn-stop" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => stopShift(emp.id)}>
                              إنهاء
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right-Middle Block: Financial Summary */}
                      {(() => {
                        const bdObj = emp.branchesDetails?.find((b) => String(b.branchId) === String(branchKey));
                        const branchHourlyRate = bdObj ? parseFloat(bdObj.salary) || 0 : (parseFloat(emp.salary) || 0);
                        const branchSum = empSum.perBranch?.[branchKey] || empSum;
                        const branchMonthlySalary = branchSum.monthlySalary || (branchHourlyRate * (parseFloat(bdObj?.workHoursPerDay) || 8) * (parseFloat(bdObj?.workDaysPerMonth) || 26));
                        return (
                          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', background: 'var(--surface)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <div>سعر الساعة: <strong style={{ color: 'var(--primary-dark)' }}>{fmt(branchHourlyRate)} ج.م</strong></div>
                            <div>الراتب الأساسي: <strong style={{ color: 'var(--primary-dark)' }}>{fmt(branchMonthlySalary)} ج.م</strong></div>
                            <div>الساعات: <strong>{fmt(branchSum.hours)} س</strong></div>
                            <div>الصافي: <strong style={{ color: '#0d9488' }}>{fmt(branchSum.baseEarnings || empSum.netSalary)} ج.م</strong></div>
                          </div>
                        );
                      })()}

                      {/* Action Buttons (QR & Edit/Delete) */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="icon-btn" title="بطاقة الموظف والـ QR" onClick={() => openEmpCard(emp)}>
                          🪪 QR بطاقة
                        </button>
                        <button className="icon-btn" title="تعديل بيانات الموظف" onClick={() => openEditEmpModal(emp)}>
                          ✏️ تعديل
                        </button>
                        <button className="icon-btn danger" title="حذف" onClick={() => handleDeleteEmp(emp.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
