import React, { useState } from 'react';
import { arabicWeekday, todayStr, fmt } from '../../utils/formatters';

export default function Dashboard({
  state,
  setState,
  saveState,
  monthPicker,
  setMonthPicker,
  exportAllPayrollExcel,
  showToast,
  onApproveRequest,
  onRejectRequest,
  onSendEarlyExitEmail,
  onWaiveEarlyExit
}) {
  // Filter Period State (Persisted in localStorage)
  const [filterPeriod, setFilterPeriod] = useState(() => {
    try {
      return localStorage.getItem('dash_filter_period') || 'current';
    } catch {
      return 'current';
    }
  });

  const [customStartDate, setCustomStartDate] = useState(() => {
    try {
      return localStorage.getItem('dash_custom_start') || new Date().toISOString().slice(0, 8) + '01';
    } catch {
      return new Date().toISOString().slice(0, 8) + '01';
    }
  });

  const [customEndDate, setCustomEndDate] = useState(() => {
    try {
      return localStorage.getItem('dash_custom_end') || new Date().toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem('dash_filter_period', filterPeriod);
      localStorage.setItem('dash_custom_start', customStartDate);
      localStorage.setItem('dash_custom_end', customEndDate);
    } catch {}
  }, [filterPeriod, customStartDate, customEndDate]);

  const orgSettings = state.orgSettings || {};
  const employees = state.employees || [];
  const branches = state.branches || [];
  const punches = state.shifts || [];
  const transactions = state.finances || state.transactions || [];

  // General Manager Name fallback
  const gmName = orgSettings.generalManagerName || 'د. أحمد خالد - المدير العام للصيدليات';
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const orgLogo = orgSettings.logoUrl || '';

  // Branch employee helper
  const empBelongsToBranch = (emp, branchId) => {
    if (emp.branchId === branchId) return true;
    if (emp.branchesDetails && Array.isArray(emp.branchesDetails)) {
      return emp.branchesDetails.some((bd) => bd.branchId === branchId);
    }
    return false;
  };

  // Branch employee counts
  const branchCounts = branches.map((b) => {
    const count = employees.filter((e) => empBelongsToBranch(e, b.id)).length;
    return { ...b, count };
  });

  const unassignedCount = employees.filter((e) => !e.branchId && (!e.branchesDetails || e.branchesDetails.length === 0)).length;

  // Live Punches per Branch (Today)
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayPunches = punches.filter((p) => (p.date || p.timestamp || '').startsWith(todayDate));

  // Date Range Matcher for Financial Summary
  const matchesFilterDate = (dateStr) => {
    if (!dateStr) return false;
    const d = String(dateStr).slice(0, 10);
    if (filterPeriod === 'custom') {
      if (customStartDate && d < customStartDate) return false;
      if (customEndDate && d > customEndDate) return false;
      return true;
    }
    // Monthly cutoff calculation
    const sDay = orgSettings.payrollPayoutStartDay || 27;
    const eDay = orgSettings.payrollPayoutEndDay || (orgSettings.payrollPayoutDay || 26);
    if (!monthPicker || monthPicker.length !== 7) return d.startsWith(todayDate.slice(0, 7));
    const [y, m] = monthPicker.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) { prevM = 12; prevY = y - 1; }
    const fromDate = `${prevY}-${String(prevM).padStart(2, '0')}-${String(sDay).padStart(2, '0')}`;
    const toDate = `${y}-${String(m).padStart(2, '0')}-${String(eDay).padStart(2, '0')}`;
    return d >= fromDate && d <= toDate;
  };

  // Filtered Shifts
  const periodShifts = punches.filter((p) => matchesFilterDate(p.date || p.timestamp));
  const totalWorkHours = periodShifts.reduce((acc, p) => acc + (parseFloat(p.hours) || parseFloat(p.workHours) || 0), 0);

  // Dynamic Base Earnings Calculation based on Employee Hourly Rates
  const totalBaseEarnings = periodShifts.reduce((acc, p) => {
    const emp = employees.find((e) => String(e.id) === String(p.employeeId));
    let dailyHourlyRate = 0;
    if (emp) {
      if (emp.branchesDetails && emp.branchesDetails.length > 0) {
        const bDetail = emp.branchesDetails.find((bd) => bd.branchId === p.branchId) || emp.branchesDetails[0];
        const salary = parseFloat(bDetail?.salary) || 0;
        const workHours = parseFloat(bDetail?.workHoursPerDay) || 8;
        const workDays = parseFloat(bDetail?.workDaysPerMonth) || 26;
        const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
        dailyHourlyRate = workHours > 0 ? dailyRate / workHours : (workDays > 0 ? salary / workDays : salary);
      } else {
        const salary = parseFloat(emp.salary) || 0;
        const workHours = parseFloat(emp.workHoursPerDay) || 8;
        const workDays = parseFloat(emp.workDaysPerMonth) || 26;
        const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
        dailyHourlyRate = workHours > 0 ? dailyRate / workHours : (workDays > 0 ? salary / workDays : salary);
      }
    }
    const h = parseFloat(p.hours) || 0;
    return acc + (h * dailyHourlyRate);
  }, 0);

  // Filtered Adjustments
  const periodAdjustments = (state.adjustments || []).filter((a) => matchesFilterDate(a.date));
  const totalBonuses = periodAdjustments
    .filter((a) => a.type === 'bonus')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalDeductions = periodAdjustments
    .filter((a) => a.type === 'deduction' || a.type === 'penalty')
    .reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);

  const totalNetSalaries = totalBaseEarnings + totalBonuses - totalDeductions;

  // Income & Expenses for the filtered period
  const totalIncome = transactions
    .filter((t) => matchesFilterDate(t.date || t.timestamp) && t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = transactions
    .filter((t) => matchesFilterDate(t.date || t.timestamp) && t.type === 'expense')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  return (
    <div style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }} className="fade-in-page">
      {/* ── 1. Top Header: Pharmacy Name, Logo, GM Name ── */}
      <div className="card settings-card fade-in" style={{ padding: '20px', marginBottom: '20px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0d9488, #0f766e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '28px',
              fontWeight: 'bold',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(13,148,136,0.3)'
            }}>
              {orgLogo ? <img src={orgLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🏥'}
            </div>

            <div>
              <h2 style={{ margin: 0, fontFamily: 'Cairo', color: 'var(--text)', fontSize: '22px' }}>
                {orgName}
              </h2>
              <p style={{ margin: '4px 0 0 0', color: 'var(--primary)', fontWeight: '700', fontSize: '14.5px' }}>
                👤 {gmName}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>الشهر المعروض:</label>
            <input
              type="month"
              value={monthPicker}
              onChange={(e) => setMonthPicker(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Employee Summary Cards Breakdown ── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e293b' }}>
        📊 إحصائيات الموظفين وتوزيع الفروع والإدارات
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: '#fff', padding: '16px', borderRadius: '12px' }}>
          <span style={{ fontSize: '12.5px', opacity: 0.9 }}>👥 عدد الموظفين الكلي بالشركة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{employees.length} موظف</h3>
        </div>

        {branchCounts.map((b) => (
          <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>🏢 {b.name}</span>
            <h3 style={{ margin: '6px 0 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--primary)' }}>
              {b.count} موظف
            </h3>
          </div>
        ))}

        {unassignedCount > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>🏢 الإدارة العامة / المركز الرئيسي</span>
            <h3 style={{ margin: '6px 0 0 0', fontSize: '22px', fontWeight: '800', color: 'var(--text)' }}>
              {unassignedCount} موظف
            </h3>
          </div>
        )}
      </div>

      {/* ── 3. Separate Live Punch Cards for Every Branch ── */}
      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#1e293b' }}>
        ⏱️ بطاقات الحضور والبصمات الحية لكل فرع منفصل ({todayDate})
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {branches.map((b) => {
          const branchEmps = employees.filter((e) => empBelongsToBranch(e, b.id));
          const branchTodayPunches = todayPunches.filter((p) => {
            if (p.branchId) return String(p.branchId) === String(b.id);
            return String(branchEmps.find((e) => String(e.id) === String(p.employeeId))?.branchId || '') === String(b.id);
          });
          const branchActiveCount = branchEmps.filter((e) => {
            const act = state.activeShifts?.[e.id];
            return act && String(act.branchId || e.branchId) === String(b.id);
          }).length;
          const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];

          return (
            <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '15px' }}>🏢 فرع {b.name}</h4>
                <span className="badge badge-success">{branchTodayPunches.length + branchActiveCount} بصمة حية بالفرع</span>
              </div>

              <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {branchEmps.length === 0 ? (
                  <span style={{ color: 'var(--muted)' }}>لا يوجد موظفين مسجلين بهذا الفرع.</span>
                ) : (
                  branchEmps.map((emp) => {
                    const activeShift = state.activeShifts?.[emp.id];
                    const isActiveInThisBranch = activeShift && (String(activeShift.branchId || emp.branchId) === String(b.id));
                    const isActiveInOtherBranch = activeShift && !isActiveInThisBranch;

                    const empTodayPunchesInThisBranch = todayPunches.filter((p) => {
                      if (String(p.employeeId) !== String(emp.id)) return false;
                      if (p.branchId) return String(p.branchId) === String(b.id);
                      return String(emp.branchId) === String(b.id);
                    });

                    const onLeaveToday = allLeaves.some(
                      (r) => String(r.employeeId) === String(emp.id) && (r.status === 'approved' || r.adminApproved) && (r.type === 'leave' || r.type === 'leave_request') && r.startDate <= todayDate && r.endDate >= todayDate
                    );

                    let statusText = '🔴 لم يبصم بهذا الفرع';
                    let statusColor = '#dc2626';

                    if (isActiveInThisBranch) {
                      if (activeShift.isOnBreak || activeShift.isPaused) {
                        statusText = '⏸️ في استراحة';
                        statusColor = '#d97706';
                      } else {
                        statusText = '🟢 حاضر حالياً';
                        statusColor = '#16a34a';
                      }
                    } else if (isActiveInOtherBranch) {
                      const otherBranchObj = branches.find((br) => String(br.id) === String(activeShift.branchId));
                      statusText = `🏢 بوردية بفرع آخر (${otherBranchObj ? otherBranchObj.name : 'آخر'})`;
                      statusColor = '#64748b';
                    } else if (empTodayPunchesInThisBranch.length > 0) {
                      statusText = '🟢 تم الحضور اليوم بهذا الفرع';
                      statusColor = '#0284c7';
                    } else if (onLeaveToday) {
                      statusText = '🏖️ إجازة معتمدة';
                      statusColor = '#16a34a';
                    }

                    return (
                      <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>👤 {emp.name}</span>
                        <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 3.5 Absent Employees Card Today ── */}
      {(() => {
        const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];
        const absentEmpsToday = employees.filter((emp) => {
          const activeShift = state.activeShifts?.[emp.id];
          if (activeShift) return false;
          const hasPunchedToday = todayPunches.some((p) => String(p.employeeId) === String(emp.id));
          if (hasPunchedToday) return false;
          const onLeaveToday = allLeaves.some(
            (r) => String(r.employeeId) === String(emp.id) && (r.status === 'approved' || r.adminApproved) && (r.type === 'leave' || r.type === 'leave_request') && r.startDate <= todayDate && r.endDate >= todayDate
          );
          if (onLeaveToday) return false;
          return true;
        });

        return (
          <div className="card settings-card" style={{ padding: '20px', marginBottom: '24px', border: '2px solid #fecaca', background: '#fff5f5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🚨 الموظفون الغائبون / لم يبصموا اليوم ({todayDate})
              </h4>
              <span style={{ background: '#ef4444', color: '#ffffff', padding: '4px 12px', borderRadius: '99px', fontSize: '13px', fontWeight: 'bold' }}>
                {absentEmpsToday.length} موظف غائب
              </span>
            </div>

            {absentEmpsToday.length === 0 ? (
              <div style={{ background: '#dcfce7', color: '#166534', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>
                🟢 لا يوجد موظفين غائبين اليوم - جميع الكوادر مسجلة في وردياتها أو في إجازات معتمدة.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                {absentEmpsToday.map((emp) => {
                  const branchObj = branches.find((b) => empBelongsToBranch(emp, b.id));
                  return (
                    <div key={emp.id} style={{ background: '#ffffff', border: '1px solid #fca5a5', padding: '12px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        {emp.name.charAt(0)}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontWeight: '700', fontSize: '13.5px', color: '#7f1d1d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name} ({emp.code})</div>
                        <div style={{ fontSize: '11.5px', color: '#991b1b' }}>{emp.jobTitle} • {branchObj ? `فرع ${branchObj.name}` : 'الإدارة العامة'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 3.5 Today's Late Employees Card (تتجدد بتغير اليوم وتجاوز فترة السماح) ── */}
      {(() => {
        const gracePeriod = orgSettings.latenessGracePeriodMinutes !== undefined
          ? parseInt(orgSettings.latenessGracePeriodMinutes)
          : 15;
        const monthKey = todayDate.slice(0, 7);
        const arDay = arabicWeekday(todayDate);

        const lateEmployeesToday = [];

        employees.forEach((emp) => {
          // Check if employee punched in today or has active shift today
          const punchToday = punches.find((p) => String(p.employeeId) === String(emp.id) && (p.date || p.timestamp || '').startsWith(todayDate));
          const activeShiftToday = state.activeShifts?.[emp.id];
          const timeIn = punchToday?.timeIn || activeShiftToday?.timeIn;

          if (!timeIn) return;

          // Find approved roster
          const approvedRosters = (state.rosters || []).filter(
            (r) => String(r.employeeId) === String(emp.id) && (r.month === monthKey || !r.month) && r.status === 'approved'
          );
          if (approvedRosters.length === 0) return;

          let daySchedule = null;
          let targetRoster = null;
          for (const ros of approvedRosters) {
            if (ros.schedule) {
              const sched = ros.schedule[arDay] || Object.entries(ros.schedule).find(([k]) => k.replace(/[\u0625\u0623\u0622]/g, 'ا') === arDay.replace(/[\u0625\u0623\u0622]/g, 'ا'))?.[1];
              if (sched && sched.type !== 'off' && sched.start) {
                daySchedule = sched;
                targetRoster = ros;
                break;
              }
            }
          }

          if (!daySchedule || !daySchedule.start) return;

          const [sH, sM] = daySchedule.start.split(':').map(Number);
          const [iH, iM] = timeIn.split(':').map(Number);
          const diffMinutes = (iH * 60 + iM) - (sH * 60 + sM);

          if (diffMinutes > gracePeriod) {
            const reqId = `req_late_${emp.id}_${todayDate}`;
            const penaltyReq = (state.requests || []).find((r) => r.id === reqId || (r.employeeId === emp.id && r.date === todayDate && r.subType === 'lateness'));

            // Calculate penalty from bylaws rules or request
            const resetDays = state.bylaws?.resetPeriodDays || 30;
            const cutoffDate = new Date(Date.now() - resetDays * 86400000).toISOString().slice(0, 10);
            const pastOccurrences = (state.requests || []).filter(
              (r) => String(r.employeeId) === String(emp.id) && (r.subType === 'lateness' || (r.type === 'penalty' && r.subType === 'lateness')) && (r.date >= cutoffDate || r.createdAt >= cutoffDate)
            ).length;
            const occurrenceNumber = pastOccurrences + 1;
            const penaltyRules = state.bylaws?.latePenalties || [
              { occurrence: 1, action: 'تنبيه', deductionFraction: 0 },
              { occurrence: 2, action: 'إنذار كتابي', deductionFraction: 0 },
              { occurrence: 3, action: 'خصم ¼ يوم', deductionFraction: 0.25 },
              { occurrence: 4, action: 'خصم ½ يوم', deductionFraction: 0.5 },
              { occurrence: 5, action: 'خصم يوم', deductionFraction: 1.0 }
            ];
            const rule = penaltyRules.find((p) => p.occurrence === occurrenceNumber) || penaltyRules[penaltyRules.length - 1];
            const impactVal = penaltyReq?.impactVal !== undefined ? penaltyReq.impactVal : (rule ? rule.deductionFraction : (diffMinutes > 30 ? 0.5 : 0.25));
            const actionTitle = penaltyReq?.suggestedAction || (rule ? rule.action : 'خصم جزاء تأخير');

            const salary = parseFloat(emp.salary) || 0;
            const workHours = parseFloat(emp.workHoursPerDay) || 8;
            const workDays = parseFloat(emp.workDaysPerMonth) || 26;
            const dailyRate = workDays > 0 ? (salary * workHours) / workDays : 0;
            const penaltyAmount = penaltyReq?.amount !== undefined ? penaltyReq.amount : Math.round(dailyRate * impactVal * 100) / 100;

            const branchObj = branches.find((b) => b.id === (targetRoster?.branchId || emp.branchId)) || branches.find((b) => empBelongsToBranch(emp, b.id));

            lateEmployeesToday.push({
              emp,
              branchName: branchObj ? branchObj.name : 'الفرع الرئيسي',
              scheduledStart: daySchedule.start,
              timeIn,
              diffMinutes,
              exceededMinutes: diffMinutes - gracePeriod,
              impactVal,
              penaltyAmount,
              actionTitle,
              penaltyReq,
              reqId
            });
          }
        });

        return (
          <div className="card settings-card" style={{ padding: '20px', marginBottom: '24px', border: '2px solid #fdba74', background: '#fffaf5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', color: '#c2410c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🏃‍♂️ موظفو اليوم المتأخرون عن مواعيد العمل المجدولة ({todayDate})
                </h4>
                <span style={{ fontSize: '12.5px', color: '#9a3412', marginTop: '3px', display: 'block' }}>
                  فترة السماح المعتمدة من الإدارة: <strong>{gracePeriod} دقيقة</strong> (تحديد نوع الإجراء: تطبيق الخصم الجزاء أو عدم تطبيق الخصم وقبول العذر)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: lateEmployeesToday.length > 0 ? '#ea580c' : '#16a34a', color: '#ffffff', padding: '4px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 'bold' }}>
                  {lateEmployeesToday.length} موظف متأخر اليوم
                </span>
              </div>
            </div>

            {lateEmployeesToday.length === 0 ? (
              <div style={{ background: '#dcfce7', color: '#166534', padding: '14px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>
                🟢 ممتاز! لا توجد أي حالات تأخير مسجلة اليوم — جميع الموظفين الذين حضروا التزموا بالمواعيد وفترة السماح المعتمدة ({gracePeriod} دقيقة).
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'center', background: '#ffffff', borderRadius: '10px', overflow: 'hidden', border: '1px solid #fed7aa' }}>
                  <thead>
                    <tr style={{ background: '#ffedd5', color: '#9a3412', fontWeight: 'bold' }}>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>#</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>الموظف</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>المسمى والفرع</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>الموعد المجدول</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>وقت البصمة</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>مقدار التأخير</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>الجزاء والخصم المقترح</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>حالة الطلب</th>
                      <th style={{ padding: '10px 8px', borderBottom: '2px solid #fdba74' }}>إجراء الإدارة العليا</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateEmployeesToday.map((item, idx) => {
                      const isApproved = item.penaltyReq?.status === 'approved' || item.penaltyReq?.adminApproved;
                      const isRejected = item.penaltyReq?.status === 'rejected' || item.penaltyReq?.status === 'waived';
                      const isPending = !isApproved && !isRejected;

                      return (
                        <tr key={item.emp.id} style={{ borderBottom: '1px solid #ffedd5' }}>
                          <td style={{ padding: '10px 8px', color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '10px 8px', fontWeight: '800', color: '#9a3412' }}>
                            {item.emp.name} ({item.emp.code})
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ display: 'block', fontWeight: '600' }}>{item.emp.jobTitle}</span>
                            <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>📍 {item.branchName}</span>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                              {item.scheduledStart}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                              {item.timeIn}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', color: '#c2410c', fontWeight: '800' }}>
                            +{item.diffMinutes} دقيقة
                            <span style={{ display: 'block', fontSize: '11px', color: '#ea580c', fontWeight: 'normal' }}>
                              (تجاوز السماح بـ {item.exceededMinutes} دقيقة)
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', fontWeight: '800', color: '#b91c1c' }}>
                            {item.actionTitle} {item.penaltyAmount > 0 ? `(خصم ${item.penaltyAmount} ج.م)` : '(بدون خصم)'}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {isApproved ? (
                              <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                                ✅ تم تطبيق الخصم الجزاء
                              </span>
                            ) : isRejected ? (
                              <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                                🛡️ تم قبول العذر (بدون خصم)
                              </span>
                            ) : (
                              <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                                ⏳ قيد انتظار قرار الإدارة
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {isPending && item.penaltyReq && (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button
                                  className="btn btn-start"
                                  style={{ padding: '4px 10px', fontSize: '12px', background: '#dc2626' }}
                                  onClick={() => onApproveRequest?.(item.penaltyReq.id)}
                                  title="تطبيق الخصم الجزاء الموضوع من قائمة الجزاءات فوراً على راتب الموظف"
                                >
                                  ⚖️ تطبيق الخصم الجزاء {item.penaltyAmount > 0 ? `(${item.penaltyAmount} ج.م)` : ''}
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                  onClick={() => onRejectRequest?.(item.penaltyReq.id)}
                                  title="عدم تطبيق الخصم وقبول العذر بدون أي استقطاع مالي"
                                >
                                  🛡️ عدم تطبيق الخصم (قبول العذر)
                                </button>
                              </div>
                            )}
                            {isApproved && (
                              <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>
                                💸 تم خصم {item.penaltyAmount} ج.م بنجاح
                              </span>
                            )}
                            {isRejected && (
                              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
                                🕊️ معفى — لا يوجد خصم
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 3.7 Early Exit & Overtime Approval Cards Today ── */}
      {(() => {
        const earlyExitRequests = (state.requests || []).filter(
          (r) => (r.type === 'early_exit' || r.subType === 'early_exit') && (r.date === todayDate || r.status === 'pending')
        );

        const overtimeRequests = (state.requests || []).filter(
          (r) => r.type === 'overtime' && (r.date === todayDate || r.status === 'pending')
        );

        if (earlyExitRequests.length === 0 && overtimeRequests.length === 0) return null;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {/* Early Exit Card */}
            {earlyExitRequests.length > 0 && (
              <div className="card settings-card" style={{ padding: '18px', border: '2px solid #fecdd3', background: '#fff1f2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏃‍♂️ رصد الانصراف المبكر عن موعد الوردية ({earlyExitRequests.length})
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {earlyExitRequests.map((req) => {
                    const isApproved = req.status === 'approved' || req.adminApproved;
                    const isWaived = req.status === 'waived';
                    const isPending = req.status === 'pending';

                    return (
                      <div key={req.id} style={{ background: '#ffffff', border: '1px solid #fecdd3', borderRadius: '10px', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ color: '#9f1239', fontSize: '14px' }}>👤 {req.employeeName}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '6px' }}>• فرع {req.branchName}</span>
                            <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px' }}>
                              {req.details || req.reason}
                            </div>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#be123c', fontWeight: 'bold' }}>
                            {req.earlyMinutes} دقيقة مبكراً
                          </span>
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isPending ? (
                            <>
                              <button
                                className="btn btn-start"
                                style={{ padding: '4px 10px', fontSize: '12px', background: '#dc2626' }}
                                onClick={() => onApproveRequest?.(req.id)}
                                title="تطبيق الجزاء والخصم المالي في حساب الراتب"
                              >
                                ⚖️ تطبيق الخصم اللائحي {req.amount ? `(${req.amount} ج.م)` : ''}
                              </button>
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid #cbd5e1' }}
                                onClick={() => onWaiveEarlyExit ? onWaiveEarlyExit(req.id) : onRejectRequest?.(req.id)}
                                title="إعفاء الموظف بدون خصم مالي"
                              >
                                🛡️ إعفاء من الخصم
                              </button>
                              {onSendEarlyExitEmail && (
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '4px 10px', fontSize: '12px', color: '#d97706', borderColor: '#fde68a' }}
                                  onClick={() => onSendEarlyExitEmail(req.id)}
                                  title="إرسال تنبيه رسمي لبريد الموظف"
                                >
                                  📧 إرسال إشعار للموظف
                                </button>
                              )}
                            </>
                          ) : isApproved ? (
                            <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 'bold' }}>✅ تم تطبيق الخصم اللائحي</span>
                          ) : isWaived ? (
                            <span style={{ color: '#0284c7', fontSize: '12px', fontWeight: 'bold' }}>🛡️ معفى من الخصم المالي</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 'bold' }}>❌ مرفوض</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Overtime Card */}
            {overtimeRequests.length > 0 && (
              <div className="card settings-card" style={{ padding: '18px', border: '2px solid #bbf7d0', background: '#f0fdf4' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⏱️ طلبات اعتماد الساعات الإضافية ({overtimeRequests.length})
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {overtimeRequests.map((req) => {
                    const isApproved = req.status === 'approved' || req.adminApproved;
                    const isRejected = req.status === 'rejected';
                    const isPending = req.status === 'pending';

                    return (
                      <div key={req.id} style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <strong style={{ color: '#14532d', fontSize: '14px' }}>👤 {req.employeeName}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '6px' }}>• فرع {req.branchName}</span>
                            <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '4px' }}>
                              {req.details || req.reason}
                            </div>
                          </div>
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                            +{req.hours} س إضافي
                          </span>
                        </div>

                        <div style={{ marginTop: '10px', display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isPending ? (
                            <>
                              <button
                                className="btn btn-start"
                                style={{ padding: '4px 12px', fontSize: '12px', background: '#16a34a' }}
                                onClick={() => onApproveRequest?.(req.id)}
                                title="اعتماد الساعات الإضافية واحتسابها ضمن أجر الراتب"
                              >
                                ✅ اعتماد الساعات الإضافية (+{req.hours} س بالراتب)
                              </button>
                              <button
                                className="btn btn-outline"
                                style={{ padding: '4px 10px', fontSize: '12px', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => onRejectRequest?.(req.id)}
                                title="استبعاد الإضافي وعدم احتسابه بالأجر"
                              >
                                ❌ استبعاد الإضافي
                              </button>
                            </>
                          ) : isApproved ? (
                            <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 'bold' }}>✅ تم اعتماد الساعات واحتسابها بالراتب</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 'bold' }}>❌ تم استبعاد الساعات الإضافية من الأجر</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 4. Financial Summary & Reports (Matching Image 1 Specifications) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '18px', color: '#1e293b' }}>
            إجمالي الرواتب والتقارير المالية لجميع الموظفين بالشركة
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
            {filterPeriod === 'custom' 
              ? `📊 الفترة المخصصة المحددة: من ${customStartDate || '...'} إلى ${customEndDate || '...'}`
              : `📊 دورة تقفيل شهر (${monthPicker})`}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}>
            <option value="current">📅 الشهر الحالي ({monthPicker})</option>
            <option value="custom">📅 تصفية الفترة المخصصة</option>
          </select>

          {filterPeriod === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>إلى</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
            </div>
          )}

          <button className="btn btn-start" onClick={exportAllPayrollExcel} style={{ padding: '6px 14px', fontSize: '13px' }}>
            📊 تصدير شيت إكسيل مخصص بالفترة
          </button>
        </div>
      </div>

      {/* Financial Cards Grid (Matching Image 1 EXACT layout) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
        {/* Card 1: Total Work Hours */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي ساعات العمل</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#0d9488', textAlign: 'left' }}>
            {totalWorkHours} ساعة
          </h3>
        </div>

        {/* Card 2: Total Base Earnings */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي المستحقات الأساسية</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#0d9488', textAlign: 'left' }}>
            {totalBaseEarnings.toFixed(2)} ج.م
          </h3>
        </div>

        {/* Card 3: Total Bonuses */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي المكافآت</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#10b981', textAlign: 'left' }}>
            +{totalBonuses.toFixed(2)} ج.م
          </h3>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '14px', marginBottom: '24px' }}>
        {/* Card 4: Solid Teal Banner - Total Paid Net Salaries */}
        <div style={{ background: '#0d9488', color: '#fff', padding: '18px 24px', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '13px', opacity: 0.9, fontWeight: '700', textAlign: 'left' }}>إجمالي رواتب الشركة المدفوعة (صافي المرتبات)</span>
          <h2 style={{ margin: '8px 0 0 0', fontSize: '32px', fontWeight: '900', textAlign: 'left' }}>
            {totalNetSalaries.toFixed(2)} ج.م
          </h2>
        </div>

        {/* Card 5: Total Deductions */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', padding: '16px', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: '600', display: 'block', textAlign: 'left' }}>إجمالي الخصومات</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: '900', color: '#ef4444', textAlign: 'left' }}>
            -{totalDeductions.toFixed(2)} ج.م
          </h3>
        </div>
      </div>

      {/* Income & Expenses Summary Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>🟢 إجمالي الإيرادات المسجلة</span>
          <h4 style={{ margin: '4px 0 0 0', color: '#16a34a', fontWeight: '800' }}>{totalIncome.toLocaleString()} ج.م</h4>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '14px', borderRadius: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>🔴 إجمالي المصروفات المسجلة</span>
          <h4 style={{ margin: '4px 0 0 0', color: '#dc2626', fontWeight: '800' }}>{totalExpenses.toLocaleString()} ج.م</h4>
        </div>
      </div>
    </div>
  );
}
