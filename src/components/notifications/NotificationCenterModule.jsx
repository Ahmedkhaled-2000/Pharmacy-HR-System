import React, { useState, useMemo } from 'react';
import { fmt, todayStr } from '../../utils/formatters';

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
  onWaiveEarlyExit
}) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'today_punches' | 'today_absences' | 'requests' | 'penalties' | 'unread'
  const [branchFilter, setBranchFilter] = useState('all');
  const [empFilter, setEmpFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const todayDate = todayStr();
  const effectiveDate = dateFilter || todayDate;
  const employees = state.employees || [];
  const branches = state.branches || [];
  const shifts = state.shifts || [];
  const activeShifts = state.activeShifts || {};
  const requests = state.requests || [];
  const loans = state.loans || [];
  const rosters = state.rosters || [];
  const currentMonth = todayDate.slice(0, 7);

  // Helper: employee branch matching
  const empBelongsToBranch = (emp, branchId) => {
    if (!branchId || branchId === 'all') return true;
    if (emp.branchId === branchId) return true;
    if (emp.branchesDetails && Array.isArray(emp.branchesDetails)) {
      return emp.branchesDetails.some((bd) => bd.branchId === branchId);
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
        if (!(s.date || '').startsWith(effectiveDate)) return false;
        if (empFilter !== 'all' && String(s.employeeId) !== String(empFilter)) return false;
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
  }, [shifts, employees, branches, activeShifts, effectiveDate, empFilter]);

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
        if (dateFilter) {
          const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.date || r.startDate || ''));
          if (!rDate.startsWith(dateFilter)) return false;
        }
        return true;
      });
  }, [requests, employees, branches, empFilter, dateFilter]);

  // 4. Branch Manager Submitted Penalties (Bylaws)
  const branchPenalties = useMemo(() => {
    return requests
      .filter((r) => r.type === 'penalty' || r.type === 'early_exit' || r.type === 'overtime')
      .map((r) => {
        const emp = employees.find((e) => String(e.id) === String(r.employeeId));
        const branchObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));

        return {
          ...r,
          employeeName: emp?.name || r.employeeName || 'موظف',
          employeeCode: emp?.code || '—',
          branchName: branchObj?.name || 'الفرع الرئيسي',
          ruleTitle: r.ruleTitle || r.reason || 'مخالفة لائحية',
          impactDesc: r.impactType === 'deduction_days' ? `خصم ${r.impactVal} يوم من الراتب` : (r.amount ? `خصم مبلغ ${r.amount} ج.م` : `خصم مبلغ ${r.impactVal || 50} ج.م`)
        };
      })
      .filter((r) => {
        if (empFilter !== 'all' && String(r.employeeId) !== String(empFilter)) return false;
        if (dateFilter) {
          const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.date || ''));
          if (!rDate.startsWith(dateFilter)) return false;
        }
        return true;
      });
  }, [requests, employees, branches, empFilter, dateFilter]);

  // General Notification Handlers
  const notifications = (state.notifications || []).filter((n) => {
    if (empFilter !== 'all' && String(n.empId || n.employeeId) !== String(empFilter)) return false;
    if (dateFilter) {
      const nDate = (n.date || (n.timestamp ? n.timestamp.slice(0, 10) : ''));
      if (!nDate.startsWith(dateFilter)) return false;
    }
    return true;
  });
  const handleMarkAsRead = async (id) => {
    const updated = (state.notifications || []).map((n) => (n.id === id ? { ...n, read: true } : n));
    const updatedState = { ...state, notifications: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleMarkAllRead = async () => {
    const updated = (state.notifications || []).map((n) => ({ ...n, read: true }));
    const updatedState = { ...state, notifications: updated };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✓ تم تحديد جميع الإشعارات كـ تمت القراءة');
  };

  const handleClearNotifications = async () => {
    if (!window.confirm('هل أنت متأكد من حذف جميع الإشعارات القديمة؟')) return;
    const updatedState = { ...state, notifications: [] };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم مسح قائمة الإشعارات بنجاح');
  };

  // KPI Counts
  const presentCount = todayPunches.length;
  const absentCount = todayAbsencesAndDelays.filter((a) => !a.isLeave && a.isScheduled).length;
  const leavesCount = todayAbsencesAndDelays.filter((a) => a.isLeave).length;
  const pendingCount = pendingRequests.length;
  const penaltiesCount = branchPenalties.filter((p) => p.status === 'pending' || !p.adminApproved).length;
  const unreadCount = notifications.filter((n) => !n.read).length;

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
            متابعة فورية للحضور والانصراف، الغيابات، طلبات الموظفين، والجزاءات ({effectiveDate})
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
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
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

          {notifications.length > 0 && (
            <button className="btn btn-outline" style={{ color: '#dc2626', borderColor: '#fca5a5', fontSize: '13px' }} onClick={handleClearNotifications}>
              🗑️ مسح الأرشيف
            </button>
          )}
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

        {/* Branch Penalties */}
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
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#6b21a8' }}>⚖️ جزاءات مدير الفرع</span>
            <span style={{ fontSize: '20px' }}>⚠️</span>
          </div>
          <h3 style={{ margin: '8px 0 0', fontSize: '24px', fontWeight: '900', color: '#7c3aed' }}>
            {penaltiesCount} جزاء معلق
          </h3>
        </div>
      </div>

      {/* Filter Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <button className={`btn ${filterType === 'all' ? 'btn-start' : 'btn-ghost'}`} onClick={() => setFilterType('all')}>
          🌐 جميع الإشعارات والأنشطة ({presentCount + absentCount + pendingCount + notifications.length})
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
          ⚖️ جزاءات اللائحة ({branchPenalties.length})
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

      {/* ── 4. Tab: Branch Manager Penalties (الجزاءات والمخالفات اللائحية) ── */}
      {(filterType === 'all' || filterType === 'penalties') && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#6b21a8', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚖️ الجزاءات والمخالفات اللائحية المرفوعة من مديري الفروع ({branchPenalties.length})
            </h4>
            <button className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => onNavigateTab?.('bylaws')}>
              الانتقال لسجل اللائحة 🔗
            </button>
          </div>

          {branchPenalties.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              لا توجد أي جزاءات مسجلة حالياً.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {branchPenalties
                .filter((p) => branchFilter === 'all' || String(p.branchId) === String(branchFilter))
                .map((p) => {
                  const isApproved = p.status === 'approved' || p.adminApproved;
                  const isRejected = p.status === 'rejected';
                  const isCancelled = p.status === 'cancelled';
                  const isPending = !isApproved && !isRejected && !isCancelled;

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'var(--surface)',
                        border: isApproved ? '1px solid #e9d5ff' : isRejected ? '1px solid #fed7aa' : '1px solid #fbcfe8',
                        borderRight: isApproved ? '4px solid #a855f7' : isRejected ? '4px solid #f97316' : '4px solid #ec4899',
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
                          <span style={{ fontSize: '18px' }}>⚖️</span>
                          <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>
                            {p.ruleTitle} — 👤 {p.employeeName} ({p.employeeCode})
                          </h4>
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>• فرع {p.branchName}</span>
                          {isApproved ? (
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
                          📅 تاريخ المخالفة: {p.date || p.createdAt?.slice(0, 10) || todayDate}
                        </span>
                      </div>

                      {isPending && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── 5. System Notifications Archive ── */}
      {filterType === 'unread' && (
        <div>
          <h4 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--text)' }}>
            🔔 قائمة الإشعارات غير المقروءة ({unreadCount})
          </h4>
          {notifications.filter((n) => !n.read).length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              🎉 لا توجد إشعارات غير مقروءة جديدة.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {notifications.filter((n) => !n.read).map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleMarkAsRead(item.id)}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    background: 'rgba(13, 148, 136, 0.06)',
                    border: '1px solid rgba(13, 148, 136, 0.3)',
                    borderRight: '4px solid var(--primary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '14.5px', color: 'var(--text)' }}>{item.title}</h4>
                    <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--text-muted)' }}>{item.message || item.body}</p>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>🕒 {item.date || item.timestamp}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={(e) => { e.stopPropagation(); handleMarkAsRead(item.id); }}>
                    ✓ تم
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
