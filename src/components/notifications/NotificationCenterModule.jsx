import React, { useState, useMemo } from 'react';
import { fmt, getRealTodayStr, getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';
import { isApprovedPermissionForDate } from '../../utils/latePenaltyEngine';
import { filterAdminNotifications, filterBranchManagerNotifications, getNotificationTargetTab, getNotificationTabLabel } from '../../utils/notificationEngine';

export default function NotificationCenterModule({
  state,
  setState,
  saveState,
  showToast,
  onNavigateTab,
  onApproveRequest,
  onRejectRequest,
  onApproveLoan,
  onRejectLoan,
  onSendEarlyExitEmail,
  onWaiveEarlyExit,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = '',
  currentBranch = null,
  authRole = 'admin'
}) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'today_punches' | 'today_absences' | 'requests' | 'penalties' | 'unread'
  const [branchFilter, setBranchFilter] = useState(() => (authRole === 'branch' && currentBranch?.id ? currentBranch.id : 'all'));
  const [empFilter, setEmpFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const todayDate = getRealTodayStr();
  const isCustom = (filterMode === 'custom' || filterMode === 'range') && customFrom && customTo;
  const periodDisplayLabel = dateFilter 
    ? `بتاريخ: ${dateFilter}` 
    : (isCustom ? `الفترة المخصصة: من ${customFrom} إلى ${customTo}` : (monthPicker ? `دورة شهر (${monthPicker})` : todayDate));

  const activePeriodFn = (d) => {
    if (!d) return true;
    const dateStr = String(d).slice(0, 10);
    if (dateFilter) return dateStr.startsWith(dateFilter);
    if (isCustom && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo;
      const to = customFrom <= customTo ? customTo : customFrom;
      return dateStr >= from && dateStr <= to;
    }
    if (typeof filterFn === 'function') return filterFn(dateStr);
    if (monthPicker) return dateStr.startsWith(monthPicker);
    return true;
  };

  const employees = state.employees || [];
  const branches = state.branches || [];
  const shifts = state.shifts || [];
  const activeShifts = state.activeShifts || {};
  const requests = useMemo(() => {
    const list = [...(state.requests || [])];
    const seen = new Set(list.map((r) => String(r.id)));
    (state.leaveRequests || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: r.type || 'leave' }); seen.add(String(r.id)); } });
    (state.shiftSwaps || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: 'swap' }); seen.add(String(r.id)); } });
    (state.loans || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: r.type || 'loan' }); seen.add(String(r.id)); } });
    (state.resignationRequests || []).forEach((r) => { if (r && !seen.has(String(r.id))) { list.push({ ...r, type: 'resignation' }); seen.add(String(r.id)); } });
    return list;
  }, [state.requests, state.leaveRequests, state.shiftSwaps, state.loans, state.resignationRequests]);
  const loans = state.loans || [];
  const rosters = state.rosters || [];
  const currentMonth = (monthPicker || todayDate).slice(0, 7);

  // Helper: employee branch matching
  const empBelongsToBranch = (emp, bId) => {
    if (!bId || bId === 'all') return true;
    if (emp.branchId === bId) return true;
    if (emp.branchesDetails && Array.isArray(emp.branchesDetails)) {
      return emp.branchesDetails.some((bd) => bd.branchId === bId);
    }
    return false;
  };

  // Helper: Arabic Day name
  const getArabicDayName = (dateString) => {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const d = new Date(dateString);
    return days[d.getDay()] || '';
  };
  const todayDayName = getArabicDayName(todayDate);

  // 1. Live Attendance & Punches
  const todayPunches = useMemo(() => {
    return shifts
      .filter((s) => {
        if (!activePeriodFn(s.date)) return false;
        if (empFilter !== 'all' && String(s.employeeId) !== String(empFilter)) return false;
        const targetB = branchFilter !== 'all' ? branchFilter : (authRole === 'branch' && currentBranch?.id ? currentBranch.id : null);
        if (targetB && String(s.branchId) !== String(targetB)) return false;
        return true;
      })
      .map((s) => {
        const emp = employees.find((e) => String(e.id) === String(s.employeeId));
        const branchObj = branches.find((b) => String(b.id) === String(s.branchId || emp?.branchId));
        const activeObj = activeShifts[s.employeeId];
        
        let statusText = 'انصرف (تم إغلاق الوردية)';
        let statusColor = '#64748b';
        let statusBg = '#f1f5f9';

        if (activeObj) {
          if (activeObj.isOnBreak) {
            statusText = '⏸️ في استراحة';
            statusColor = '#b45309';
            statusBg = '#fef3c7';
          } else {
            statusText = '🟢 حاضر بالصيدلية حالياً';
            statusColor = '#15803d';
            statusBg = '#dcfce7';
          }
        } else if (!s.timeOut) {
          statusText = '🟢 حاضر بالوردية';
          statusColor = '#15803d';
          statusBg = '#dcfce7';
        }

        return {
          id: s.id,
          employeeId: s.employeeId,
          employeeName: emp?.name || s.employeeName || 'موظف',
          employeeCode: emp?.code || '—',
          jobTitle: emp?.jobTitle || 'صيدلي / كادر',
          branchName: branchObj?.name || 'الفرع الرئيسي',
          branchId: s.branchId || emp?.branchId,
          timeIn: s.timeIn || '—',
          timeOut: s.timeOut || '—',
          hours: s.hours || 0,
          breakHours: s.breakHours || 0,
          statusText,
          statusColor,
          statusBg,
          note: s.note || ''
        };
      });
  }, [shifts, employees, branches, activeShifts, empFilter, branchFilter, authRole, currentBranch, activePeriodFn]);

  // 2. Absences & Delays Today
  const todayAbsencesAndDelays = useMemo(() => {
    const allLeaves = [...(state.leaveRequests || []), ...(state.requests || [])];
    const punchEmpIds = new Set(todayPunches.map((p) => String(p.employeeId)));
    Object.keys(activeShifts).forEach((id) => punchEmpIds.add(String(id)));

    const result = [];

    employees.forEach((emp) => {
      const empId = String(emp.id);
      const branchObj = branches.find((b) => empBelongsToBranch(emp, b.id));

      // Check Roster if scheduled to work today
      const empRoster = rosters.find((r) => String(r.employeeId) === empId && r.month === currentMonth && r.status === 'approved');
      const todaySchedule = empRoster?.schedule?.[todayDayName] || empRoster?.schedule?.[todayDate];
      const isScheduledToday = todaySchedule ? todaySchedule.type !== 'off' : true;

      // Check if on approved leave
      const approvedLeave = allLeaves.find(
        (r) =>
          String(r.employeeId) === empId &&
          (r.status === 'approved' || r.adminApproved) &&
          (r.type === 'leave' || r.type === 'leave_request' || r.type === 'annual_leave' || r.type === 'sick_leave' || r.type === 'emergency_leave') &&
          r.startDate <= todayDate &&
          r.endDate >= todayDate
      );

      // Check if has approved permission today
      const approvedPermission = allLeaves.find(
        (r) =>
          String(r.employeeId) === empId &&
          (r.status === 'approved' || r.adminApproved) &&
          r.type === 'permission' &&
          (r.date === todayDate || r.startDate === todayDate)
      );

      const hasPunched = punchEmpIds.has(empId);

      if (!hasPunched) {
        let absenceType = 'غائب بدون عذر / لم يبصم';
        let badgeColor = '#dc2626';
        let badgeBg = '#fee2e2';
        let isLeave = false;

        if (approvedLeave) {
          isLeave = true;
          if (approvedLeave.leaveType === 'annual' || approvedLeave.type === 'annual_leave') {
            absenceType = '🏖️ إجازة سنوية معتمدة';
            badgeColor = '#0284c7';
            badgeBg = '#e0f2fe';
          } else if (approvedLeave.leaveType === 'sick' || approvedLeave.type === 'sick_leave') {
            absenceType = '🩺 إجازة مرضية معتمدة';
            badgeColor = '#7c3aed';
            badgeBg = '#f3e8ff';
          } else if (approvedLeave.leaveType === 'unpaid') {
            absenceType = '🚫 إجازة غير مدفوعة الأجر';
            badgeColor = '#d97706';
            badgeBg = '#fef3c7';
          } else {
            absenceType = '🏖️ إجازة اعتيادية معتمدة';
            badgeColor = '#0284c7';
            badgeBg = '#e0f2fe';
          }
        } else if (approvedPermission) {
          absenceType = `⏱️ إذن رسمي معتمد (${approvedPermission.hours || 2} س)`;
          badgeColor = '#059669';
          badgeBg = '#d1fae5';
        } else if (!isScheduledToday) {
          absenceType = '🛋️ راحة أسبوعية مجدولة (Off)';
          badgeColor = '#64748b';
          badgeBg = '#f1f5f9';
        }

        result.push({
          id: `abs_${emp.id}`,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.code,
          jobTitle: emp.jobTitle || 'موظف',
          branchName: branchObj?.name || 'الفرع الرئيسي',
          branchId: emp.branchId,
          absenceType,
          badgeColor,
          badgeBg,
          isLeave,
          isScheduled: isScheduledToday,
          details: approvedLeave?.reason || approvedPermission?.reason || (isScheduledToday ? 'تخلف عن تسجيل بصمة الحضور في موعد الوردية' : 'راحة رسمية وفق الجدول المعتمد')
        });
      }
    });

    return result;
  }, [employees, branches, todayPunches, activeShifts, rosters, currentMonth, todayDate, todayDayName, state.leaveRequests, state.requests]);

  // 3. Pending Requests of All Types
  const pendingRequests = useMemo(() => {
    return requests
      .filter((r) => (r.status === 'pending' || r.status === 'pending_admin') && r.status !== 'rejected' && r.status !== 'cancelled')
      .map((r) => {
        const emp = employees.find((e) => String(e.id) === String(r.employeeId));
        const branchObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));

        let typeLabel = 'طلب إداري';
        let icon = '📋';
        if (r.type === 'leave' || r.type === 'leave_request') {
          typeLabel = `طلب إجازة (${r.leaveType === 'annual' ? 'سنوية' : r.leaveType === 'sick' ? 'مرضية' : 'اعتيادية'})`;
          icon = '🏖️';
        } else if (r.type === 'loan' || r.type === 'advance') {
          typeLabel = `طلب سلفة (${r.loanType === 'installment' ? 'مقسطة' : 'شهرية'})`;
          icon = '💳';
        } else if (r.type === 'meds' || r.type === 'credit_medicine') {
          typeLabel = 'طلب أدوية ومشتريات آجل';
          icon = '💊';
        } else if (r.type === 'permission') {
          typeLabel = `طلب إذن (${r.hours || 2} س)`;
          icon = '⏱️';
        } else if (r.type === 'swap' || r.type === 'shift_swap') {
          typeLabel = 'طلب تبديل وردية';
          icon = '🔄';
        } else if (r.type === 'penalty') {
          if (r.subType === 'lateness') {
            typeLabel = `🚨 طلب جزاء تأخير (${r.latenessMinutes || ''} دقيقة)`;
            icon = '🏃‍♂️';
          } else {
            typeLabel = 'مخالفة وجزاء لائحي مرفوع';
            icon = '⚖️';
          }
        } else if (r.type === 'early_exit' || r.subType === 'early_exit') {
          typeLabel = `⚠️ تنبيه انصراف مبكر (${r.earlyMinutes || ''} دقيقة مبكراً)`;
          icon = '🏃‍♂️';
        } else if (r.type === 'overtime') {
          typeLabel = `⏱️ طلب اعتماد ساعات إضافية (+${r.hours || ''} س)`;
          icon = '⭐';
        } else if (r.type === 'roster_update') {
          typeLabel = 'طلب اعتماد جدول شهري';
          icon = '🗓️';
        } else if (r.type === 'resignation' || r.type === 'resignation_request') {
          const mgrDecided = r.managerStatus === 'approved' || r.managerStatus === 'rejected';
          typeLabel = `🚪 طلب استقالة (${mgrDecided ? (r.managerStatus === 'approved' ? 'موافق عليه من الفرع' : 'مرفوض من الفرع') : 'بانتظار رد مدير الفرع'})`;
          icon = '🚪';
        } else if (r.type === 'withdraw' || r.type === 'resignation_withdraw') {
          typeLabel = '↩️ طلب تراجع عن استقالة';
          icon = '↩️';
        }

        return {
          ...r,
          employeeName: emp?.name || r.employeeName || 'موظف',
          employeeCode: emp?.code || '—',
          branchName: branchObj?.name || 'الفرع الرئيسي',
          typeLabel,
          icon
        };
      })
      .filter((r) => {
        if (empFilter !== 'all' && String(r.employeeId) !== String(empFilter)) return false;
        const targetB = branchFilter !== 'all' ? branchFilter : (authRole === 'branch' && currentBranch?.id ? currentBranch.id : null);
        if (targetB && String(r.branchId) !== String(targetB)) return false;
        const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.date || r.startDate || ''));
        if (rDate && !activePeriodFn(rDate)) return false;
        return true;
      });
  }, [requests, employees, branches, empFilter, branchFilter, authRole, currentBranch, activePeriodFn]);

  // 4. Lateness Penalties & Violations from Bylaws (Automated engine late incidents & Branch Manager submitted penalties)
  const allBylawsPenalties = useMemo(() => {
    const targetB = branchFilter !== 'all' ? branchFilter : (authRole === 'branch' && currentBranch?.id ? currentBranch.id : null);
    const autoIncidents = (state.lateIncidents || [])
      .filter((inc) => {
        if (inc.status === 'cancelled' || inc.status === 'approved_permission_exempt' || inc.actionType === 'grace') return false;
        if (isApprovedPermissionForDate(inc.employeeId, inc.date, state)) return false;
        if (!inc.deductionMinutes && !inc.penaltyAmount) return false;
        if (empFilter !== 'all' && String(inc.employeeId) !== String(empFilter)) return false;
        if (targetB && String(inc.branchId) !== String(targetB)) return false;
        if (!activePeriodFn(inc.date)) return false;
        return true;
      })
      .map((inc) => {
        const emp = employees.find((e) => String(e.id) === String(inc.employeeId));
        const branchObj = branches.find((b) => String(b.id) === String(inc.branchId || emp?.branchId));
        return {
          id: inc.id,
          employeeId: inc.employeeId,
          employeeName: emp?.name || inc.employeeName || 'موظف',
          employeeCode: emp?.code || inc.employeeCode || '—',
          branchName: branchObj?.name || inc.branchName || 'الفرع الرئيسي',
          branchId: inc.branchId || emp?.branchId,
          ruleTitle: `تأخير لائحى: ${inc.tierName || 'تأخير عن موعد الوردية'} (${inc.lateMinutes} دقيقة - المرة ${inc.occurrenceNumber})`,
          impactDesc: `خصم ${inc.deductionMinutes} دقيقة (${inc.penaltyAmount || 0} ج.م) • ${inc.actionLabel}`,
          details: `الموعد المجدول: ${inc.scheduledStartTime || '—'} | البصمة الفعلية: ${inc.actualPunchInTime || '—'}`,
          date: inc.date,
          status: inc.status || 'approved',
          read: Boolean(inc.read),
          isAutoBylaw: true,
          adminApproved: true,
          icon: '📜'
        };
      });

    const manualPenalties = requests
      .filter((r) => r.type === 'penalty' || r.type === 'early_exit' || r.type === 'overtime' || r.type === 'disciplinary_penalty' || r.subType === 'disciplinary_penalty')
      .map((r) => {
        const emp = employees.find((e) => String(e.id) === String(r.employeeId));
        const branchObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));

        return {
          ...r,
          employeeName: emp?.name || r.employeeName || 'موظف',
          employeeCode: emp?.code || '—',
          branchName: branchObj?.name || 'الفرع الرئيسي',
          ruleTitle: r.ruleTitle || r.actionTitle || r.reason || 'مخالفة تأديبية',
          impactDesc: r.actionTitle ? `${r.actionTitle}${r.amount > 0 ? ` (${r.amount} ج.م)` : ''}` : (r.impactType === 'deduction_days' ? `خصم ${r.impactVal} يوم من الراتب` : (r.amount ? `خصم مبلغ ${r.amount} ج.م` : `خصم مبلغ ${r.impactVal || 50} ج.م`)),
          isAutoBylaw: false,
          read: Boolean(r.read),
          icon: '⚖️'
        };
      })
      .filter((r) => {
        if (empFilter !== 'all' && String(r.employeeId) !== String(empFilter)) return false;
        if (targetB && String(r.branchId) !== String(targetB)) return false;
        const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.date || ''));
        if (rDate && !activePeriodFn(rDate)) return false;
        return true;
      });

    return [...autoIncidents, ...manualPenalties];
  }, [state.lateIncidents, state.requests, requests, employees, branches, empFilter, branchFilter, authRole, currentBranch, activePeriodFn]);

  // Unread Bylaws Penalties
  const unreadBylawsPenalties = useMemo(() => {
    return allBylawsPenalties.filter(
      (p) => !p.read && p.status !== 'cancelled' && p.status !== 'approved_permission_exempt'
    );
  }, [allBylawsPenalties]);

  // General Notification Handlers
  const baseNotifications = authRole === 'branch'
    ? filterBranchManagerNotifications(
        state.notifications || [],
        currentBranch,
        (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.id,
        state
      )
    : filterAdminNotifications(state.notifications || []);

  const notifications = baseNotifications.filter((n) => {
    if (!n) return false;
    if (empFilter !== 'all' && String(n.empId || n.employeeId) !== String(empFilter)) return false;
    const nDate = (n.date || (n.timestamp ? n.timestamp.slice(0, 10) : ''));
    // Unread notifications are ALWAYS kept visible until read
    if (!n.read) return true;
    if (nDate && !activePeriodFn(nDate)) return false;
    return true;
  });

  const handleMarkAsRead = async (id) => {
    const updated = (state.notifications || []).map((n) => (n.id === id ? { ...n, read: true } : n));
    const updatedState = { ...state, notifications: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleAcknowledgeLateIncident = async (incidentId) => {
    const updatedLateIncidents = (state.lateIncidents || []).map((inc) =>
      inc.id === incidentId ? { ...inc, read: true, readAt: new Date().toISOString() } : inc
    );
    const updatedRequests = (state.requests || []).map((r) =>
      r.id === incidentId ? { ...r, read: true } : r
    );
    const updatedNotifications = (state.notifications || []).map((n) =>
      (n.id === incidentId || n.id === `notif_late_${incidentId}`) ? { ...n, read: true } : n
    );
    const updatedState = {
      ...state,
      lateIncidents: updatedLateIncidents,
      requests: updatedRequests,
      notifications: updatedNotifications
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✓ تم تأكيد وقراءة إشعار الجزاء اللائحي');
  };

  const handleMarkAllRead = async () => {
    const updatedNotifs = (state.notifications || []).map((n) => ({ ...n, read: true }));
    const updatedLateIncidents = (state.lateIncidents || []).map((inc) => ({ ...inc, read: true, readAt: new Date().toISOString() }));
    const updatedRequests = (state.requests || []).map((r) => ({ ...r, read: true }));
    const updatedState = {
      ...state,
      notifications: updatedNotifs,
      lateIncidents: updatedLateIncidents,
      requests: updatedRequests
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✓ تم تحديد جميع الإشعارات وتأخيرات اللائحة كمقروءة');
  };

  const handleClearNotifications = async () => {
    if (!window.confirm('هل أنت متأكد من مسح وتفريغ جميع سجلات الإشعارات والأرشيف نهائياً؟')) return;

    const clearedNow = new Date().toISOString();
    const currentDeleted = new Set(state._deletedIds || []);
    (state.notifications || []).forEach((n) => {
      if (n && n.id) currentDeleted.add(n.id);
    });

    const updatedState = {
      ...state,
      notifications: [],
      _notificationsClearedAt: clearedNow,
      _deletedIds: Array.from(currentDeleted).slice(-3000)
    };

    try {
      localStorage.removeItem('app_notifications');
      sessionStorage.removeItem('app_notifications');
    } catch {}

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم مسح وتفريغ الأرشيف نهائياً ولن يعود للظهور مرة أخرى');
  };

  // KPI Counts
  const presentCount = todayPunches.length;
  const absentCount = todayAbsencesAndDelays.filter((a) => !a.isLeave && a.isScheduled).length;
  const leavesCount = todayAbsencesAndDelays.filter((a) => a.isLeave).length;
  const pendingCount = pendingRequests.length;
  const penaltiesCount = allBylawsPenalties.length;
  const unreadCount = notifications.filter((n) => !n.read).length + unreadBylawsPenalties.length;

  return (
    <div className="bylaws-card fade-in" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header Title & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            🔔 مركز الإشعارات والتنبيهات والرقابة الحية
            {(unreadCount > 0 || pendingCount > 0) && (
              <span className="badge danger" style={{ fontSize: '13px' }}>
                {unreadCount + pendingCount} تنبيه معلق
              </span>
            )}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            متابعة فورية للحضور والانصراف، الغيابات، طلبات الموظفين، والجزاءات ({periodDisplayLabel})
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
          >
            <option value="all">🏢 جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>🏢 فرع {b.name}</option>
            ))}
          </select>

          <select
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}
          >
            <option value="all">👤 جميع الموظفين</option>
            {employees.filter(isEmployeeActive).map((e) => (
              <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code})</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
            />
            {dateFilter && (
              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => setDateFilter('')}>✕ اليوم</button>
            )}
          </div>

          {unreadCount > 0 && (
            <button className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={handleMarkAllRead}>
              ✓ تحديد الكل كمقروء
            </button>
          )}

          <button className="btn btn-outline" style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '13px', background: '#fff5f5' }} onClick={handleClearNotifications}>
            🗑️ مسح الأرشيف
          </button>
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {/* Present Today */}
        <div
          onClick={() => setFilterType('today_punches')}
          style={{
            background: filterType === 'today_punches' ? '#dcfce7' : 'var(--surface)',
            border: filterType === 'today_punches' ? '2px solid #16a34a' : '1px solid var(--border)',
            padding: '14px 18px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534' }}>🟢 بصمات وحضور اليوم</span>
            <span style={{ fontSize: '20px' }}>⏱️</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#15803d' }}>
            {presentCount} موظف
          </h3>
        </div>

        {/* Absences Today */}
        <div
          onClick={() => setFilterType('today_absences')}
          style={{
            background: filterType === 'today_absences' ? '#fee2e2' : 'var(--surface)',
            border: filterType === 'today_absences' ? '2px solid #dc2626' : '1px solid var(--border)',
            padding: '14px 18px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>🚨 غياب اليوم بدون إذن</span>
            <span style={{ fontSize: '20px' }}>🔴</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#b91c1c' }}>
            {absentCount} غائب
          </h3>
        </div>

        {/* Approved Leaves Today */}
        <div
          onClick={() => setFilterType('today_absences')}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '14px 18px',
            borderRadius: '12px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#0369a1' }}>🏖️ إجازات معتمدة اليوم</span>
            <span style={{ fontSize: '20px' }}>🏖️</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#0284c7' }}>
            {leavesCount} موظف
          </h3>
        </div>

        {/* Pending Requests */}
        <div
          onClick={() => setFilterType('requests')}
          style={{
            background: filterType === 'requests' ? '#fef3c7' : 'var(--surface)',
            border: filterType === 'requests' ? '2px solid #d97706' : '1px solid var(--border)',
            padding: '14px 18px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e' }}>📋 طلبات بانتظار الاعتماد</span>
            <span style={{ fontSize: '20px' }}>⏳</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#d97706' }}>
            {pendingCount} طلب
          </h3>
        </div>

        {/* Bylaws & Lateness Penalties */}
        <div
          onClick={() => setFilterType('penalties')}
          style={{
            background: filterType === 'penalties' ? '#f3e8ff' : 'var(--surface)',
            border: filterType === 'penalties' ? '2px solid #7c3aed' : '1px solid var(--border)',
            padding: '14px 18px',
            borderRadius: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8' }}>📜 جزاءات وتأخيرات اللائحة</span>
            <span style={{ fontSize: '20px' }}>📜</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#7c3aed' }}>
            {penaltiesCount} واقعة وجزاء
          </h3>
        </div>
      </div>

      {/* Filter Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <button className={`btn ${filterType === 'all' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('all')}>
          🌐 جميع الأنشطة والإشعارات ({presentCount + absentCount + pendingCount + penaltiesCount + notifications.length})
        </button>
        <button className={`btn ${filterType === 'system_notifs' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('system_notifs')}>
          📢 إشعارات وتنبيهات النظام ({notifications.length})
        </button>
        <button className={`btn ${filterType === 'today_punches' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('today_punches')}>
          ⏱️ حضور وبصمات اليوم ({presentCount})
        </button>
        <button className={`btn ${filterType === 'today_absences' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('today_absences')}>
          🚨 غياب وإجازات اليوم ({absentCount + leavesCount})
        </button>
        <button className={`btn ${filterType === 'requests' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('requests')}>
          📋 طلبات الموظفين ({pendingCount})
        </button>
        <button className={`btn ${filterType === 'penalties' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('penalties')}>
          📜 جزاءات وتأخيرات اللائحة ({penaltiesCount})
        </button>
        <button className={`btn ${filterType === 'unread' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('unread')}>
          🔴 إشعارات جديدة ({unreadCount})
        </button>
      </div>

      {/* ── 1. Tab: Today Punches (حضور وبصمات اليوم) ── */}
      {(filterType === 'all' || filterType === 'today_punches') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#166534', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⏱️ سجل الحضور والبصمات المسجلة اليوم ({todayDate} - {todayDayName})
            </h4>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>إجمالي الحاضرين: {todayPunches.length} موظف</span>
          </div>

          {todayPunches.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              لم يتم تسجيل أي بصمة دخول حتى الآن اليوم.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="bylaws-table" style={{ fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#f0fdf4', color: '#166534' }}>
                    <th>#</th>
                    <th>اسم الموظف</th>
                    <th>الفرع</th>
                    <th>وقت الدخول</th>
                    <th>وقت الخروج</th>
                    <th>ساعات العمل</th>
                    <th>الحالة الحية</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {todayPunches
                    .filter((p) => branchFilter === 'all' || String(p.branchId) === String(branchFilter))
                    .map((p, idx) => (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ fontWeight: '800', color: 'var(--primary-dark)' }}>
                          👤 {p.employeeName} <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>({p.employeeCode})</span>
                        </td>
                        <td>🏢 {p.branchName}</td>
                        <td>
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                            {p.timeIn}
                          </span>
                        </td>
                        <td>
                          {p.timeOut !== '—' ? (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: '6px', fontWeight: '700' }}>
                              {p.timeOut}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>لم يخرج بعد</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '700', color: '#0d9488' }}>{fmt(p.hours)} س</td>
                        <td>
                          <span style={{ background: p.statusBg, color: p.statusColor, padding: '3px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            {p.statusText}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--muted)' }}>{p.note || 'بصمة عادية'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Tab: Today Absences & Leaves (الغيابات والإجازات اليوم) ── */}
      {(filterType === 'all' || filterType === 'today_absences') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#991b1b', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚨 سجل الغياب وتصنيف الحالات اليوم ({todayDate} - {todayDayName})
            </h4>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>إجمالي الحالات: {todayAbsencesAndDelays.length}</span>
          </div>

          {todayAbsencesAndDelays.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#15803d', background: '#dcfce7', borderRadius: '10px', fontWeight: 'bold' }}>
              🟢 ممتاز! جميع الموظفين مسجلون في وردياتهم اليوم.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="bylaws-table" style={{ fontSize: '13.5px' }}>
                <thead>
                  <tr style={{ background: '#fef2f2', color: '#991b1b' }}>
                    <th>#</th>
                    <th>اسم الموظف</th>
                    <th>الفرع</th>
                    <th>نوع الغياب / الحالة</th>
                    <th>الجدول الشهري</th>
                    <th>التفاصيل والملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAbsencesAndDelays
                    .filter((a) => branchFilter === 'all' || String(a.branchId) === String(branchFilter))
                    .map((a, idx) => (
                      <tr key={a.id}>
                        <td style={{ color: 'var(--muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ fontWeight: '800', color: 'var(--text)' }}>
                          👤 {a.employeeName} <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>({a.employeeCode})</span>
                        </td>
                        <td>🏢 {a.branchName}</td>
                        <td>
                          <span style={{ background: a.badgeBg, color: a.badgeColor, padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            {a.absenceType}
                          </span>
                        </td>
                        <td>
                          {a.isScheduled ? (
                            <span style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '12px' }}>⚠️ لديه وردية مقررة</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '12px' }}>راحة أسبوعية</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{a.details}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Tab: Pending Employee Requests (الطلبات المعلقة) ── */}
      {(filterType === 'all' || filterType === 'requests') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#92400e', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 طلبات الموظفين المعلقة بانتظار قرار الإدارة ({pendingRequests.length})
            </h4>
            <button className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => onNavigateTab?.('requests')}>
              الانتقال لمركز الطلبات 🔗
            </button>
          </div>

          {pendingRequests.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              لا توجد أي طلبات معلقة حالياً بانتظار الاعتماد.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingRequests
                .filter((r) => branchFilter === 'all' || String(r.branchId) === String(branchFilter))
                .map((r) => (
                  <div
                    key={r.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid #fde68a',
                      borderRight: '4px solid #f59e0b',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>{r.icon}</span>
                        <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                          {r.typeLabel} — 👤 {r.employeeName} ({r.employeeCode})
                        </h4>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• فرع {r.branchName}</span>
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: '13.5px', color: 'var(--text-muted)' }}>
                        {r.details || r.reason || r.notes || 'طلب معلق بانتظار الاعتماد'}
                      </p>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                        📅 تاريخ التقديم: {r.date || r.createdAt?.slice(0, 10) || todayDate}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {r.type === 'early_exit' || r.subType === 'early_exit' ? (
                        <>
                          {onApproveRequest && (
                            <button
                              className="btn btn-start"
                              style={{ fontSize: '12px', padding: '6px 12px', background: '#dc2626' }}
                              onClick={() => onApproveRequest(r.id)}
                              title="تطبيق الجزاء والخصم المالي في حساب الرواتب"
                            >
                              ⚖️ تطبيق الجزاء اللائحي {r.amount ? `(${r.amount} ج.م)` : ''}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid #cbd5e1' }}
                            onClick={() => onWaiveEarlyExit ? onWaiveEarlyExit(r.id) : onRejectRequest?.(r.id)}
                            title="إعفاء الموظف بدون خصم مالي"
                          >
                            🛡️ إعفاء من الخصم
                          </button>
                          {onSendEarlyExitEmail && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '12px', padding: '6px 12px', color: '#d97706', borderColor: '#fde68a' }}
                              onClick={() => onSendEarlyExitEmail(r.id)}
                              title="إرسال تنبيه ولفت نظر رسمي لبريد الموظف"
                            >
                              📧 إرسال إشعار للموظف
                            </button>
                          )}
                        </>
                      ) : r.type === 'overtime' ? (
                        <>
                          {onApproveRequest && (
                            <button
                              className="btn btn-start"
                              style={{ fontSize: '12px', padding: '6px 14px', background: '#16a34a' }}
                              onClick={() => onApproveRequest(r.id)}
                              title="اعتماد الساعات الإضافية واحتسابها ضمن الراتب"
                            >
                              ✅ اعتماد الساعات الإضافية (+{r.hours} س بالراتب)
                            </button>
                          )}
                          {onRejectRequest && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '12px', padding: '6px 14px', color: '#dc2626', borderColor: '#fca5a5' }}
                              onClick={() => onRejectRequest(r.id)}
                              title="استبعاد الساعات الإضافية وعدم احتسابها بالأجر"
                            >
                              ❌ استبعاد الإضافي من الأجر
                            </button>
                          )}
                        </>
                      ) : (r.type === 'penalty' || r.subType === 'lateness') ? (
                        <>
                          {onApproveRequest && (
                            <button
                              className="btn btn-start"
                              style={{ fontSize: '12px', padding: '6px 14px', background: '#dc2626' }}
                              onClick={() => onApproveRequest(r.id)}
                              title="تطبيق الخصم الجزاء الموضوع من قائمة الجزاءات فوراً على راتب الموظف"
                            >
                              ⚖️ تطبيق الخصم الجزاء {r.amount ? `(${r.amount} ج.م)` : (r.impactVal ? `(خصم ${r.impactVal} يوم)` : '')}
                            </button>
                          )}
                          {onRejectRequest && (
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: '12px', padding: '6px 14px', border: '1px solid #cbd5e1' }}
                              onClick={() => onRejectRequest(r.id)}
                              title="عدم تطبيق الخصم وقبول العذر بدون أي استقطاع مالي"
                            >
                              🛡️ عدم تطبيق الخصم (قبول العذر)
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {onApproveRequest && (
                            <button
                              className="btn btn-start"
                              style={{ fontSize: '12px', padding: '6px 14px' }}
                              onClick={() => onApproveRequest(r.id)}
                            >
                              ✅ اعتماد الطلب
                            </button>
                          )}
                          {onRejectRequest && (
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: '12px', padding: '6px 14px', color: '#dc2626', borderColor: '#fca5a5' }}
                              onClick={() => onRejectRequest(r.id)}
                            >
                              ❌ رفض
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. Tab: Bylaws & Lateness Penalties (الجزاءات وتأخيرات لائحة العمل) ── */}
      {(filterType === 'all' || filterType === 'penalties') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#6b21a8', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📜 وقائع التأخير وجزاءات لائحة العمل والجزاءات ({allBylawsPenalties.length})
            </h4>
            <button className="btn btn-ghost" style={{ fontSize: '12px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', fontWeight: 'bold' }} onClick={() => onNavigateTab?.('bylaws')}>
              الانتقال لسجل لائحة العمل 📜
            </button>
          </div>

          {allBylawsPenalties.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              لا توجد أي وقائع تأخير أو جزاءات مسجلة حالياً.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allBylawsPenalties
                .filter((p) => branchFilter === 'all' || String(p.branchId) === String(branchFilter))
                .map((p) => {
                  const isAuto = p.isAutoBylaw;
                  const isApproved = p.status === 'approved' || p.adminApproved || isAuto;
                  const isRejected = p.status === 'rejected';
                  const isCancelled = p.status === 'cancelled';
                  const isPending = !isApproved && !isRejected && !isCancelled;

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'var(--surface)',
                        border: isAuto ? '1px solid #ddd6fe' : (isApproved ? '1px solid #e9d5ff' : isRejected ? '1px solid #fed7aa' : '1px solid #fbcfe8'),
                        borderRight: isAuto ? '4px solid #7c3aed' : (isApproved ? '4px solid #a855f7' : isRejected ? '4px solid #f97316' : '4px solid #ec4899'),
                        padding: '14px 18px',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '18px' }}>{p.icon || (isAuto ? '📜' : '⚖️')}</span>
                          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                            {p.ruleTitle} — 👤 {p.employeeName} ({p.employeeCode})
                          </h4>
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• فرع {p.branchName}</span>
                          {isAuto ? (
                            <span style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              📜 جزاء لائحة العمل معتمد
                            </span>
                          ) : isApproved ? (
                            <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              🟢 معتمد ومخصوم من الأجر
                            </span>
                          ) : isRejected ? (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              🔴 تم رفض الجزاء (بدون خصم)
                            </span>
                          ) : isCancelled ? (
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              ⚪ ملغي (معفى)
                            </span>
                          ) : (
                            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                              ⏳ بانتظار موافقة الإدارة العليا
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '0 0 4px', fontSize: '13.5px', color: '#7c3aed', fontWeight: 'bold' }}>
                          الأثر المالي: {p.impactDesc} {p.details ? `• ${p.details}` : ''}
                        </p>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                          📅 تاريخ الوردية / الواقعة: {p.date || p.createdAt?.slice(0, 10) || todayDate}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {isAuto ? (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '12px', padding: '6px 12px', background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', fontWeight: 'bold' }}
                            onClick={() => onNavigateTab?.('bylaws')}
                          >
                            عرض باللائحة 📜
                          </button>
                        ) : isPending ? (
                          <>
                            {onApproveRequest && (
                              <button
                                className="btn btn-start"
                                style={{ fontSize: '12px', padding: '6px 14px' }}
                                onClick={() => onApproveRequest(p.id)}
                              >
                                ✅ موافقة وتطبيق الخصم فوراً
                              </button>
                            )}
                            {onRejectRequest && (
                              <button
                                className="btn btn-outline"
                                style={{ fontSize: '12px', padding: '6px 14px', color: '#dc2626', borderColor: '#fca5a5' }}
                                onClick={() => onRejectRequest(p.id)}
                              >
                                ❌ رفض الجزاء
                              </button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── 5. System Notifications Feed (إشعارات وتنبيهات النظام) ── */}
      {(filterType === 'all' || filterType === 'system_notifs') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📢 سجل إشعارات وتنبيهات النظام والرسائل ({notifications.length})
            </h4>
            {notifications.some(n => !n.read) && (
              <button className="btn btn-ghost" style={{ fontSize: '12px', fontWeight: 'bold' }} onClick={handleMarkAllRead}>
                ✓ تحديد الكل كمقروء
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              لا توجد إشعارات مسجلة في هذا السجل حالياً.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications.map((item) => {
                const isUnread = !item.read;
                const targetTab = getNotificationTargetTab(item, authRole);
                const tabLabel = getNotificationTabLabel(targetTab, authRole);

                const handleNavigateToItem = () => {
                  if (isUnread) handleMarkAsRead(item.id);
                  if (onNavigateTab) {
                    onNavigateTab(targetTab);
                    showToast?.(`الانتقال إلى: ${tabLabel}`);
                  }
                };

                return (
                  <div
                    key={`gen_notif_${item.id}`}
                    onClick={handleNavigateToItem}
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: isUnread ? 'rgba(13, 148, 136, 0.07)' : 'var(--surface)',
                      border: isUnread ? '1px solid rgba(13, 148, 136, 0.4)' : '1px solid var(--border)',
                      borderRight: isUnread ? '4px solid var(--primary)' : '4px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    className="notif-card-hover"
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '18px' }}>{item.icon || '🔔'}</span>
                        <h4 style={{ margin: 0, fontSize: '14.5px', color: 'var(--text)', fontWeight: isUnread ? 800 : 600 }}>
                          {item.title || item.typeLabel || 'إشعار إداري'}
                        </h4>
                        {isUnread && (
                          <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '8px' }}>
                            جديد
                          </span>
                        )}
                        {item.employeeName && (
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• 👤 {item.employeeName}</span>
                        )}
                        {item.branchName && (
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• 🏢 {item.branchName}</span>
                        )}
                      </div>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {item.message || item.body || item.details || ''}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          🕒 {item.date || (item.timestamp ? item.timestamp.slice(0, 10) : todayDate)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>
                          • فتح القسم: {tabLabel}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {isUnread && (
                        <button
                          className="btn btn-start"
                          style={{ fontSize: '12px', padding: '5px 14px' }}
                          onClick={() => handleMarkAsRead(item.id)}
                        >
                          ✓ تحديد كمقروء
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)', background: 'var(--surface-muted)', fontWeight: 'bold' }}
                        onClick={handleNavigateToItem}
                      >
                        الانتقال للقسم 🔗
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 6. Unread Notifications & Bylaws Penalties (غير المقروء فقط) ── */}
      {filterType === 'unread' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔔 قائمة الإشعارات والجزاءات اللائحية غير المقروءة ({unreadCount})
            </h4>
            {unreadCount > 0 && (
              <button className="btn btn-start" style={{ fontSize: '12px', padding: '6px 14px' }} onClick={handleMarkAllRead}>
                ✓ تحديد الكل كمقروء وتأكيد الاطلاع
              </button>
            )}
          </div>

          {unreadCount === 0 ? (
            <div style={{ padding: '35px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              🎉 لا توجد أي إشعارات أو جزاءات غير مقروءة جديدة. تم الاطلاع على كافة التنبيهات.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 1. Unread Bylaws Penalties */}
              {unreadBylawsPenalties.map((item) => (
                <div
                  key={`unread_bylaw_${item.id}`}
                  onClick={() => {
                    handleAcknowledgeLateIncident(item.id);
                    onNavigateTab?.('bylaws');
                    showToast?.('الانتقال إلى: لائحة العمل والجزاءات 📜');
                  }}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'rgba(124, 58, 237, 0.05)',
                    border: '1px solid rgba(124, 58, 237, 0.3)',
                    borderRight: '5px solid #7c3aed',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '18px' }}>📜</span>
                      <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                        {item.ruleTitle} — 👤 {item.employeeName} ({item.employeeCode})
                      </h4>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• فرع {item.branchName}</span>
                      <span style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                        🔴 تنبيه جزاء لائحى غير مؤكد
                      </span>
                    </div>
                    <p style={{ margin: '0 0 4px', fontSize: '13.5px', color: '#7c3aed', fontWeight: 'bold' }}>
                      الأثر المالي: {item.impactDesc} {item.details ? `• ${item.details}` : ''}
                    </p>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                      📅 تاريخ الوردية / الواقعة: {item.date || todayDate}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '12px', padding: '6px 12px', background: '#faf5ff', color: '#7c3aed', border: '1px solid #e9d5ff', fontWeight: 'bold' }}
                      onClick={() => {
                        handleAcknowledgeLateIncident(item.id);
                        onNavigateTab?.('bylaws');
                      }}
                    >
                      عرض باللائحة 📜
                    </button>
                    <button
                      className="btn btn-start"
                      style={{ fontSize: '12px', padding: '6px 16px' }}
                      onClick={() => handleAcknowledgeLateIncident(item.id)}
                    >
                      ✓ تم
                    </button>
                  </div>
                </div>
              ))}

              {/* 2. Unread General Notifications */}
              {notifications.filter((n) => !n.read).map((item) => {
                const targetTab = getNotificationTargetTab(item, authRole);
                const tabLabel = getNotificationTabLabel(targetTab, authRole);

                const handleNavigateUnread = () => {
                  handleMarkAsRead(item.id);
                  if (onNavigateTab) {
                    onNavigateTab(targetTab);
                    showToast?.(`الانتقال إلى: ${tabLabel}`);
                  }
                };

                return (
                  <div
                    key={`unread_gen_${item.id}`}
                    onClick={handleNavigateUnread}
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'rgba(13, 148, 136, 0.06)',
                      border: '1px solid rgba(13, 148, 136, 0.3)',
                      borderRight: '4px solid var(--primary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '14.5px', color: 'var(--text)' }}>{item.title}</h4>
                      <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>{item.message || item.body}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>🕒 {item.date || item.timestamp}</span>
                        <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 'bold' }}>• فتح: {tabLabel}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)' }} onClick={handleNavigateUnread}>
                        انتقال 🔗
                      </button>
                      <button className="btn btn-start" style={{ fontSize: '12px', padding: '5px 14px' }} onClick={() => handleMarkAsRead(item.id)}>
                        ✓ تم
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
