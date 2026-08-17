import React, { useState } from 'react';
import { applyShiftSwapToRosters, arabicWeekday } from '../../utils/formatters';
import { notifyEmployeeEarlyExitWarning } from '../../utils/gmailService';

export function getFormattedRequestBadge(type, leaveType) {
  if (type === 'leave') {
    if (leaveType === 'annual') return <span className="badge badge-success">🏖️ إجازة سنوية</span>;
    if (leaveType === 'unpaid') return <span className="badge badge-warning">⏱️ إجازة غير مدفوعة</span>;
    if (leaveType === 'sick') return <span className="badge badge-danger">🏥 إجازة مرضية</span>;
    return <span className="badge badge-success">🏖️ طلب إجازة</span>;
  }
  if (type === 'loan' || type === 'advance') return <span className="badge badge-primary">💳 سلفة مالية</span>;
  if (type === 'meds' || type === 'credit_medicine') return <span className="badge badge-primary">💊 أدوية آجل</span>;
  if (type === 'permission') return <span className="badge badge-warning">⏰ إذن / خروج</span>;
  if (type === 'swap' || type === 'shift_swap') return <span className="badge badge-primary">🔄 تبديل شيفت</span>;
  if (type === 'roster_update' || type === 'roster_edit' || type === 'roster_edit_request') return <span className="badge badge-warning">📅 تعديل جدول شهري</span>;
  if (type === 'bonus') return <span className="badge badge-success">🏆 إضافة مكافأة</span>;
  if (type === 'penalty') return <span className="badge badge-danger">⚠️ خصم / جزاء مالي</span>;
  if (type === 'early_exit') return <span className="badge badge-danger">⚠️ انصراف مبكر</span>;
  if (type === 'overtime') return <span className="badge badge-success">⭐ ساعات إضافية</span>;
  if (type === 'eval_edit_request' || type === 'complaint') return <span className="badge badge-warning">📋 شكوى / ملاحظة</span>;
  if (type === 'punch_correction' || type === 'تأكيد بصمة الوجه') return <span className="badge badge-primary">📸 تأكيد بصمة الوجه</span>;
  return <span className="badge badge-primary">{type || 'طلب إداري'}</span>;
}

export default function RequestsModule({
  state,
  setState,
  saveState,
  showToast,
  startShift,
  pauseShift,
  resumeShift,
  stopShift
}) {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [previewModalReq, setPreviewModalReq] = useState(null);

  const requests = state.requests || [];
  const employees = state.employees || [];

  const formatDateStr = (dateVal) => {
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return String(dateVal);
      return d.toLocaleDateString('ar-EG');
    } catch {
      return String(dateVal);
    }
  };

  const formatTimeStr = (dateVal) => {
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (!r) return false;
    if (filterType !== 'all') {
      if (filterType === 'loan') {
        if (r.type !== 'loan' && r.type !== 'advance') return false;
      } else if (filterType === 'meds') {
        if (r.type !== 'meds' && r.type !== 'credit_medicine') return false;
      } else if (filterType === 'swap') {
        if (r.type !== 'swap' && r.type !== 'shift_swap') return false;
      } else if (filterType === 'roster_edit') {
        if (r.type !== 'roster_update' && r.type !== 'roster_edit' && r.type !== 'roster_edit_request') return false;
      } else if (filterType === 'complaint') {
        if (r.type !== 'complaint' && r.type !== 'eval_edit_request') return false;
      } else if (r.type !== filterType) {
        return false;
      }
    }
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterEmp !== 'all') {
      if (String(r.employeeId) !== String(filterEmp)) return false;
    }
    if (filterDate) {
      const rDate = (r.createdAt ? r.createdAt.slice(0, 10) : (r.date || r.startDate || ''));
      if (!rDate.startsWith(filterDate)) return false;
    }
    return true;
  });

  const handleApprove = async (reqId) => {
    let targetReq = null;
    let updatedRosters = [...(state.rosters || [])];
    let updatedAdjustments = [...(state.adjustments || [])];
    let updatedShifts = [...(state.shifts || [])];

    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        targetReq = { ...r, status: 'approved', adminApproved: true, branchApproved: true };
        if (targetReq.photoUrl) delete targetReq.photoUrl;
        return targetReq;
      }
      return r;
    });

    if (!targetReq) return;

    // 0. Overtime Request Approval
    if (targetReq.type === 'overtime') {
      const overtimeHrs = parseFloat(targetReq.hours) || 0;
      updatedShifts = updatedShifts.map((s) => {
        if (s.id === targetReq.shiftId || (String(s.employeeId) === String(targetReq.employeeId) && s.date === targetReq.date)) {
          const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || s.hours);
          const fullHours = s.actualWorkedHours || (regHours + overtimeHrs);
          return {
            ...s,
            overtimeStatus: 'approved',
            hours: fullHours,
            note: `ساعات عمل معتمدة (أساسي: ${regHours} س + إضافي: ${overtimeHrs} س)`
          };
        }
        return s;
      });
    }

    if (targetReq.type === 'penalty' || targetReq.type === 'early_exit') {
      const emp = (state.employees || []).find((e) => String(e.id) === String(targetReq.employeeId));
      let amount = 0;
      if (targetReq.impactType === 'deduction_days') {
        const salary = emp ? parseFloat(emp.salary) || 0 : 0;
        const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
        const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
        const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
        amount = Math.round(dailyRate * (parseFloat(targetReq.impactVal) || 1) * 100) / 100;
      } else if (targetReq.impactType === 'fixed_amount') {
        amount = parseFloat(targetReq.impactVal) || 0;
      } else if (targetReq.amount) {
        amount = parseFloat(targetReq.amount) || 0;
      }

      if (amount > 0) {
        const ruleTitle = targetReq.ruleTitle || targetReq.reason || targetReq.details || 'مخالفة لائحية';
        const penaltyDesc = `خصم جزاء لائحى: ${ruleTitle} (${targetReq.impactType === 'deduction_days' ? `خصم ${targetReq.impactVal} يوم` : `${amount} ج.م`})`;
        updatedAdjustments.push({
          id: `adj_pen_${Date.now()}`,
          employeeId: targetReq.employeeId,
          type: 'deduction',
          amount,
          description: penaltyDesc,
          notes: penaltyDesc,
          reason: penaltyDesc,
          date: targetReq.date || targetReq.startDate || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString()
        });
      }
    }

    if (targetReq.type === 'bonus') {
      updatedAdjustments.push({
        id: `adj_${Date.now()}`,
        employeeId: targetReq.employeeId,
        type: 'bonus',
        amount: parseFloat(targetReq.amount) || 0,
        description: targetReq.details || targetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
        notes: targetReq.details || targetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
        reason: targetReq.reason || targetReq.details || 'مكافأة معتمدة من الإدارة العليا',
        date: targetReq.date || targetReq.startDate || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });
    }

    if (targetReq.type === 'loan' || targetReq.type === 'advance' || targetReq.type === 'meds' || targetReq.type === 'credit_medicine') {
      const totalAmount = parseFloat(targetReq.amount || targetReq.totalAmount) || 0;
      const monthsCount = parseInt(targetReq.monthsCount || targetReq.installments, 10) || 1;
      const monthlyInstallment = parseFloat(targetReq.monthlyDeduction || targetReq.installmentAmount) || (monthsCount > 1 ? Math.ceil(totalAmount / monthsCount) : totalAmount);

      const isMeds = targetReq.type === 'meds' || targetReq.type === 'credit_medicine';
      const isInstallment = targetReq.loanType === 'installment' || monthsCount > 1;

      let loanTypeTitle = isMeds ? 'مشتريات أدوية آجل' : isInstallment ? `سلفة مقسطة (${monthsCount} أقساط)` : 'سلفة شهرية';
      const deductionDesc = isInstallment 
        ? `خصم قسط ${loanTypeTitle} (قسط شهري) — مبلغ ${monthlyInstallment} ج.م من إجمالي ${totalAmount} ج.م`
        : `خصم ${loanTypeTitle} — مبلغ ${monthlyInstallment} ج.م`;

      updatedAdjustments.push({
        id: `adj_loan_${Date.now()}`,
        employeeId: targetReq.employeeId,
        type: 'deduction',
        amount: monthlyInstallment,
        description: deductionDesc,
        notes: deductionDesc,
        reason: deductionDesc,
        date: targetReq.date || new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString()
      });
    }

    if (targetReq.type === 'swap' || targetReq.type === 'shift_swap' || targetReq.type === 'shift_edit') {
      updatedRosters = applyShiftSwapToRosters(targetReq, updatedRosters, state.employees || []);
    }

    if (targetReq.type === 'permission') {
      const permDate = targetReq.date || targetReq.startDate;
      const permHours = parseFloat(targetReq.hours) || 0;

      if (permDate && permHours > 0) {
        const existingShiftIdx = updatedShifts.findIndex(
          (s) => String(s.employeeId) === String(targetReq.employeeId) && s.date === permDate
        );

        if (existingShiftIdx >= 0) {
          const s = updatedShifts[existingShiftIdx];
          updatedShifts[existingShiftIdx] = {
            ...s,
            hours: (s.hours || 0) + permHours,
            approvedPermissionHours: permHours,
            note: (s.note ? s.note + ' · ' : '') + `تم إضافة ${permHours} س إذن معتمد`
          };
        } else {
          updatedShifts.push({
            id: `shift_perm_${Date.now()}`,
            employeeId: targetReq.employeeId,
            date: permDate,
            timeIn: '09:00',
            timeOut: '17:00',
            hours: permHours,
            breakHours: 0,
            approvedPermissionHours: permHours,
            note: `إذن دخول/خروج معتمد (${permHours} ساعة)`
          });
        }
      }
    }

    if (targetReq.type === 'roster_update' || targetReq.type === 'roster_edit' || targetReq.type === 'roster_edit_request') {
      const existingIdx = updatedRosters.findIndex(
        (ros) => ros.employeeId === targetReq.employeeId && ros.month === targetReq.month && (String(ros.branchId || '') === String(targetReq.branchId || ''))
      );
      const activeRosterObj = {
        id: targetReq.id,
        employeeId: targetReq.employeeId,
        branchId: targetReq.branchId || null,
        month: targetReq.month,
        fromDate: targetReq.fromDate,
        toDate: targetReq.toDate,
        schedule: targetReq.schedule,
        status: 'approved',
        approvedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        updatedRosters[existingIdx] = activeRosterObj;
      } else {
        updatedRosters.push(activeRosterObj);
      }
    }

    let updatedLeaveRequests = [...(state.leaveRequests || [])];
    if (targetReq.type === 'leave' || targetReq.type === 'leave_request') {
      updatedLeaveRequests = updatedLeaveRequests.map((lr) => {
        if (lr.id === targetReq.id || (String(lr.employeeId) === String(targetReq.employeeId) && lr.startDate === targetReq.startDate)) {
          return { ...lr, status: 'approved', adminApproved: true, branchApproved: true };
        }
        return lr;
      });
    }

    const updatedShiftSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === reqId ? { ...s, status: 'approved', adminApproved: true, branchApproved: true, approvedAt: new Date().toISOString() } : s
    );

    const updatedState = {
      ...state,
      requests: updatedRequests,
      rosters: updatedRosters,
      adjustments: updatedAdjustments,
      shifts: updatedShifts,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedShiftSwaps
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('✅ تم اعتماد موافقة الطلب وتطبيق التأثير فوراً على الأجور والجداول');

    if (targetReq.type === 'تأكيد بصمة الوجه' || targetReq.type === 'تأكيد بصمة اليد') {
      const empId = targetReq.employeeId;
      const actionType = targetReq.targetAction;

      if (actionType === 'shift_start' && startShift) startShift(empId, 'admin');
      else if (actionType === 'break_start' && pauseShift) pauseShift(empId, 'admin');
      else if (actionType === 'break_end' && resumeShift) resumeShift(empId, 'admin');
      else if (actionType === 'shift_end' && stopShift) stopShift(empId, 'admin');
    }
  };

  const handleReject = async (reqId) => {
    let targetReq = null;
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        targetReq = { ...r, status: 'rejected', adminApproved: false };
        if (targetReq.photoUrl) delete targetReq.photoUrl;
        return targetReq;
      }
      return r;
    });

    let updatedShifts = [...(state.shifts || [])];
    if (targetReq && targetReq.type === 'overtime') {
      updatedShifts = updatedShifts.map((s) => {
        if (s.id === targetReq.shiftId || (String(s.employeeId) === String(targetReq.employeeId) && s.date === targetReq.date)) {
          const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || 8);
          return {
            ...s,
            overtimeStatus: 'rejected',
            hours: regHours,
            note: `ساعات الوردية الأساسية (${regHours} س) — تم استبعاد الإضافي (${targetReq.hours} س)`
          };
        }
        return s;
      });
    }

    let updatedLeaveRequests = [...(state.leaveRequests || [])];
    if (targetReq && (targetReq.type === 'leave' || targetReq.type === 'leave_request')) {
      updatedLeaveRequests = updatedLeaveRequests.map((lr) => {
        if (lr.id === targetReq.id || (String(lr.employeeId) === String(targetReq.employeeId) && lr.startDate === targetReq.startDate)) {
          return { ...lr, status: 'rejected', adminApproved: false };
        }
        return lr;
      });
    }

    const updatedShiftSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === reqId ? { ...s, status: 'rejected', adminApproved: false } : s
    );

    const updatedState = {
      ...state,
      requests: updatedRequests,
      shifts: updatedShifts,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedShiftSwaps
    };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('❌ تم رفض الطلب واستبعاد الإجراء');
  };

  const handleWaive = async (reqId) => {
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        return { ...r, status: 'waived', adminApproved: true, details: `${r.details || ''} (🛡️ تم إعفاء الموظف من الخصم)` };
      }
      return r;
    });
    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🛡️ تم إعفاء الموظف من الخصم المالي بنجاح');
  };

  const handleSendWarningEmail = async (reqId) => {
    const target = requests.find((r) => r.id === reqId);
    if (!target) return;
    const emp = (state.employees || []).find((e) => String(e.id) === String(target.employeeId));
    if (!emp) return;

    const res = await notifyEmployeeEarlyExitWarning({
      state,
      emp,
      branchName: target.branchName,
      earlyMinutes: target.earlyMinutes || 0,
      scheduledEnd: target.scheduledEnd || '—',
      timeOut: target.actualOut || '—',
      dateStr: target.date || new Date().toISOString().slice(0, 10),
      notes: 'تنبيه ولفت نظر بضرورة الالتزام بمواعيد انتظام الوردية.',
      actionType: target.suggestedAction || 'لفت نظر إداري'
    });

    if (res?.success) {
      showToast?.(`📧 تم إرسال إشعار ولفت النظر إلى بريد الموظف (${emp.name}) بنجاح`);
    } else {
      showToast?.(`⚠️ ${res?.reason || 'تعذر إرسال البريد — يرجى التحقق من إعدادات Gmail'}`);
    }
  };

  const handleDeleteOldRequest = async (reqId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب القديم نهائياً من السجل؟')) return;
    const updatedRequests = requests.filter((r) => r.id !== reqId);
    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف الطلب القديم بنجاح');
  };

  const handleApprovePenaltyObjection = async (reqId) => {
    let empId = null;
    let ruleTitle = '';
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        empId = r.employeeId;
        ruleTitle = r.ruleTitle;
        return {
          ...r,
          status: 'cancelled',
          isCancelled: true,
          cancelledAt: new Date().toISOString(),
          objection: {
            ...(r.objection || {}),
            status: 'approved',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedAdjustments = (state.adjustments || []).filter((a) => {
      if (a.id === reqId || a.id === `adj_${reqId}` || a.id === `adj_penalty_${reqId}`) return false;
      if (empId && String(a.employeeId) === String(empId) && (a.type === 'penalty' || a.type === 'deduction') && (a.reason === ruleTitle || a.details === ruleTitle)) return false;
      return true;
    });

    const updatedState = { ...state, requests: updatedRequests, adjustments: updatedAdjustments };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (previewModalReq?.id === reqId) {
      setPreviewModalReq(prev => ({ ...prev, status: 'cancelled', isCancelled: true, objection: { ...prev.objection, status: 'approved' } }));
    }
    showToast?.('✅ تم قبول اعتراض الموظف وإلغاء الجزاء والخصم المالي تلقائياً');
  };

  const handleRejectPenaltyObjection = async (reqId, reply = '') => {
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          objection: {
            ...(r.objection || {}),
            status: 'rejected',
            adminReply: reply || 'تمت دراسة مبررات الاعتراض وتثبيت الجزاء المالي',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (previewModalReq?.id === reqId) {
      setPreviewModalReq(prev => ({ ...prev, objection: { ...prev.objection, status: 'rejected', adminReply: reply } }));
    }
    showToast?.('❌ تم رفض الاعتراض وتثبيت الجزاء المالي');
  };

  return (
    <div className="bylaws-card fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📋 مركز إدارة طلبات الموظفين الموحد
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            معاينة كافة الطلبات، الإجازات، الأذون، السلف، الأدوية، وتبديل الورديات واتخاذ قرارات الموافقة المزدوجة
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>👤 الموظف:</label>
          <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}>
            <option value="all">-- جميع الموظفين --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>📅 التاريخ:</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
          />
          {filterDate && (
            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => setFilterDate('')}>✕ مسح</button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>نوع الطلب:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <option value="all">-- جميع أنواع الطلبات --</option>
            <option value="leave">🏖️ إجازات</option>
            <option value="permission">⏰ أذون خروج/دخول</option>
            <option value="loan">💳 سلف مالية</option>
            <option value="meds">💊 أدوية آجل</option>
            <option value="swap">🔄 تبديل شفتات</option>
            <option value="roster_edit">📅 تعديل جدول شهري</option>
            <option value="complaint">📋 شكاوي وملاحظات</option>
            <option value="penalty">⚠️ جزاءات ومخالفات لائحية</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>حالة الاعتماد:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            <option value="all">-- جميع الحالات --</option>
            <option value="pending">⏳ قيد الاعتماد</option>
            <option value="pending_admin">🟡 بانتظار الإدارة العليا</option>
            <option value="approved">🟢 معتمد نهائياً</option>
            <option value="rejected">🔴 مرفوض</option>
          </select>
        </div>
      </div>

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th>تاريخ ووقت الإرسال</th>
              <th>الموظف المقدم</th>
              <th>نوع الطلب</th>
              <th>موافقة مدير الفرع</th>
              <th>حالة الإدارة العليا</th>
              <th>الإجراءات والعمليات</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد طلبات تطابق خيارات التصفية.</td></tr>
            ) : (
              filteredRequests.map((req) => {
                const isOldProcessed = req.status === 'approved' || req.status === 'rejected';

                return (
                  <tr key={req.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '3px', background: 'var(--surface-muted)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: '900', color: 'var(--primary-dark)', fontSize: '13px' }}>
                          📅 {formatDateStr(req.createdAt || req.date || req.startDate)}
                        </span>
                        <span style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '12px' }}>
                          ⏰ {formatTimeStr(req.createdAt || req.time)}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: '800' }}>{req.employeeName || 'موظف'}</td>
                    <td>{getFormattedRequestBadge(req.type, req.leaveType)}</td>
                    <td>
                      {(req.targetApproval === 'admin_only' || req.targetApproval === 'admin' || ['loan', 'advance', 'credit_medicine', 'eval_edit_request', 'complaint'].includes(req.type) || req.branchNotRequired || req.isDirectToAdmin) ? (
                        <span style={{ color: 'var(--muted)', fontSize: '12px', background: 'rgba(148, 163, 184, 0.14)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', border: '1px solid var(--border)' }}>
                          🔒 غير موجهة لمدير الفرع
                        </span>
                      ) : req.branchApproved ? (
                        <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من الفرع</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار الفرع</span>
                      )}
                    </td>
                    <td>
                      {req.status === 'approved' && <span className="approval-status-badge approved">🟢 معتمد نهائياً</span>}
                      {req.status === 'pending_admin' && <span className="approval-status-badge pending">🟡 قيد اعتماد الإدارة العليا</span>}
                      {req.status === 'pending' && <span className="approval-status-badge pending">⏳ قيد المراجعة</span>}
                      {req.status === 'rejected' && <span className="approval-status-badge rejected">🔴 مرفوض</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          onClick={() => setPreviewModalReq(req)}
                        >
                          👁️ معاينة الطلب
                        </button>

                        {req.status !== 'approved' && (
                          <button
                            className="btn btn-start"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => handleApprove(req.id)}
                          >
                            ✓ موافقة
                          </button>
                        )}

                        {req.status !== 'rejected' && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                            onClick={() => handleReject(req.id)}
                          >
                            ✕ رفض
                          </button>
                        )}

                        {isOldProcessed && (
                          <button
                            className="del-btn"
                            style={{ padding: '4px 8px', fontSize: '11.5px' }}
                            title="حذف الطلب القديم من السجل"
                            onClick={() => handleDeleteOldRequest(req.id)}
                          >
                            🗑️ حذف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {previewModalReq && (() => {
        const empObj = employees.find(e => String(e.id) === String(previewModalReq.employeeId));
        const branches = state.branches || [];
        const branchObj = branches.find(b => b.id === (previewModalReq.branchId || empObj?.branchId));
        const targetEmpObj = employees.find(e => String(e.id) === String(previewModalReq.targetEmpId || previewModalReq.targetEmployeeId || previewModalReq.peerEmployeeId));

        // Calculate leave days count accurately
        const calculateLeaveDays = () => {
          if (previewModalReq.daysCount) return previewModalReq.daysCount;
          if (previewModalReq.days) return previewModalReq.days;
          if (previewModalReq.startDate && previewModalReq.endDate) {
            const s = new Date(previewModalReq.startDate);
            const e = new Date(previewModalReq.endDate);
            if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
              const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
              return diff > 0 ? diff : 1;
            }
          }
          return 1;
        };

        const isLeave = ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave'].includes(previewModalReq.type);
        const isLoan = ['loan', 'advance', 'meds', 'credit_medicine'].includes(previewModalReq.type);
        const isPermission = previewModalReq.type === 'permission';
        const isSwap = ['swap', 'shift_swap', 'shift_edit'].includes(previewModalReq.type);
        const isPunch = ['punch_correction', 'تأكيد بصمة الوجه', 'تأكيد بصمة اليد'].includes(previewModalReq.type);
        const isPenalty = previewModalReq.type === 'penalty';
        const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request'].includes(previewModalReq.type);
        const isComplaint = ['complaint', 'eval_edit_request'].includes(previewModalReq.type);

        const totalAmount = parseFloat(previewModalReq.amount) || 0;
        const monthlyDed = parseFloat(previewModalReq.monthlyDeduction || previewModalReq.installmentAmount) || 0;
        const isInstallment = previewModalReq.loanType === 'installments' || previewModalReq.isInstallment || (monthlyDed > 0 && monthlyDed < totalAmount) || (parseInt(previewModalReq.installmentsCount, 10) > 1);
        const installmentsCount = previewModalReq.installmentsCount || previewModalReq.monthsCount || (monthlyDed > 0 ? Math.ceil(totalAmount / monthlyDed) : 1);

        const isBranchNotReq = previewModalReq.targetApproval === 'admin_only' || previewModalReq.targetApproval === 'admin' || isLoan || isComplaint || previewModalReq.branchNotRequired || previewModalReq.isDirectToAdmin;

        return (
          <div className="modal-overlay" onClick={() => setPreviewModalReq(null)} style={{ zIndex: 1100 }}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', width: '92%', maxHeight: '90vh', overflowY: 'auto', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
              
              {/* Modal Top Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '2px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>👁️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--primary-dark)', fontWeight: 'bold' }}>
                      تفاصيل ومعاينة الطلب الكاملة
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      معرف الطلب: #{previewModalReq.id}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getFormattedRequestBadge(previewModalReq.type, previewModalReq.leaveType)}
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '14px' }} onClick={() => setPreviewModalReq(null)}>✕ إغلاق</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13.5px' }}>
                
                {/* 1. Employee & Branch Information Card */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👤 بيانات الموظف ومقدم الطلب:
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>اسم الموظف:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '14px' }}>
                        {previewModalReq.employeeName || empObj?.name || 'غير معروف'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>الكود الوظيفي:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        {previewModalReq.employeeCode || empObj?.code || '—'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>الفرع:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        🏢 {branchObj?.name ? `فرع ${branchObj.name}` : 'الفرع الرئيسي'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>المسمى الوظيفي:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                        💼 {empObj?.jobTitle || 'كادر وظيفي'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>تاريخ ووقت الإرسال:</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                        📅 {formatDateStr(previewModalReq.createdAt || previewModalReq.date)} • ⏰ {formatTimeStr(previewModalReq.createdAt || previewModalReq.time)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Approvals Status Bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف موافقة مدير الفرع:</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {isBranchNotReq ? (
                        <span style={{ color: '#475569' }}>🔒 موجهة للإدارة العليا فقط (لا تتطلب موافقة الفرع)</span>
                      ) : previewModalReq.branchApproved ? (
                        <span style={{ color: '#16a34a' }}>🟢 معتمد وموافق عليه من مدير الفرع</span>
                      ) : (
                        <span style={{ color: '#d97706' }}>⏳ بانتظار مراجعة واعتماد مدير الفرع</span>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف اعتماد الإدارة العليا:</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {previewModalReq.status === 'approved' ? (
                        <span style={{ color: '#16a34a' }}>🟢 معتمد نهائياً ومطبق بالنظام</span>
                      ) : previewModalReq.status === 'rejected' ? (
                        <span style={{ color: '#dc2626' }}>🔴 مرفوض من الإدارة</span>
                      ) : (
                        <span style={{ color: '#d97706' }}>🟡 بانتظار قرار واعتماد الإدارة العليا</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Specific Details Based on Request Type */}
                
                {/* ── LEAVE DETAILS ── */}
                {isLeave && (
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏖️ تفاصيل الإجازة المطلوبة:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>نوع الإجازة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d', fontSize: '14px' }}>
                          {previewModalReq.leaveType === 'annual' ? 'إجازة سنوية اعتيادية' : previewModalReq.leaveType === 'sick' ? 'إجازة مرضية' : previewModalReq.leaveType === 'unpaid' ? 'إجازة بدون أجر' : 'إجازة رسمية'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>تاريخ البدء:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.startDate || '—'} {previewModalReq.startDate && `(${arabicWeekday(previewModalReq.startDate)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>تاريخ الانتهاء:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.endDate || '—'} {previewModalReq.endDate && `(${arabicWeekday(previewModalReq.endDate)})`}
                        </div>
                      </div>
                      <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>إجمالي عدد أيام الإجازة:</span>
                        <div style={{ fontWeight: '900', color: '#15803d', fontSize: '16px' }}>
                          ⏱️ {calculateLeaveDays()} أيام
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── LOAN / ADVANCE / MEDS DETAILS ── */}
                {isLoan && (
                  <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#1e40af', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💳 تفاصيل السلفة / الدواء الآجل:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#dbeafe', padding: '10px 14px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                        <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 'bold' }}>إجمالي المبلغ المطلوب:</span>
                        <div style={{ fontWeight: '900', color: '#1d4ed8', fontSize: '17px' }}>
                          💰 {totalAmount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>نظام السداد والخصم:</span>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '13.5px' }}>
                          {isInstallment ? '📆 سلفة مقسطة على عدة شهور' : '💵 سلفة شهرية (خصم دفعة واحدة)'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>عدد الأقساط الشهرية:</span>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                          {installmentsCount} شهر / قسط
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>قيمة الخصم الشهري (القسط):</span>
                        <div style={{ fontWeight: 'bold', color: '#1d4ed8', fontSize: '14px' }}>
                          {monthlyDed > 0 ? `${monthlyDed} ج.م / شهر` : `${totalAmount} ج.م`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PERMISSION DETAILS ── */}
                {isPermission && (
                  <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#92400e', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⏰ تفاصيل إذن الخروج / التأخير:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#92400e' }}>يوم وتاريخ الإذن:</span>
                        <div style={{ fontWeight: 'bold', color: '#78350f' }}>
                          📅 {previewModalReq.date || previewModalReq.startDate || '—'} { (previewModalReq.date || previewModalReq.startDate) && `(${arabicWeekday(previewModalReq.date || previewModalReq.startDate)})` }
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#92400e' }}>فترة الإذن بالساعات:</span>
                        <div style={{ fontWeight: 'bold', color: '#78350f', fontSize: '14px' }}>
                          من <strong>{previewModalReq.startTime || previewModalReq.fromTime || '09:00'}</strong> إلى <strong>{previewModalReq.endTime || previewModalReq.toTime || '17:00'}</strong>
                        </div>
                      </div>
                      <div style={{ background: '#fef3c7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold' }}>إجمالي عدد الساعات:</span>
                        <div style={{ fontWeight: '900', color: '#b45309', fontSize: '16px' }}>
                          ⏱️ {previewModalReq.hours || '—'} ساعة
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SHIFT SWAP DETAILS ── */}
                {isSwap && (
                  <div style={{ background: '#f5f3ff', padding: '16px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#5b21b6', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔄 تفاصيل تبديل الشيفت والراحات بين الموظفين:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #c4b5fd' }}>
                        <span style={{ fontSize: '12px', color: '#5b21b6', fontWeight: 'bold' }}>1. الموظف الطالب (الطرف الأول):</span>
                        <div style={{ fontWeight: 'bold', color: '#4c1d95', marginTop: '2px' }}>
                          {previewModalReq.employeeName || empObj?.name || 'مقدم الطلب'} {empObj?.code ? `(كود: ${empObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6d28d9', marginTop: '4px' }}>
                          📅 تاريخ شيفت الموظف: <strong>{previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date || '—'}</strong> { (previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date) && `(${arabicWeekday(previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date)})` }
                        </div>
                      </div>

                      <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #c4b5fd' }}>
                        <span style={{ fontSize: '12px', color: '#5b21b6', fontWeight: 'bold' }}>2. الزميل البديل (الطرف الثاني):</span>
                        <div style={{ fontWeight: 'bold', color: '#4c1d95', marginTop: '2px' }}>
                          {previewModalReq.targetEmpName || targetEmpObj?.name || 'الزميل البديل'} {targetEmpObj?.code ? `(كود: ${targetEmpObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6d28d9', marginTop: '4px' }}>
                          📅 تاريخ شيفت الزميل: <strong>{previewModalReq.targetDate || previewModalReq.peerDate || '—'}</strong> { (previewModalReq.targetDate || previewModalReq.peerDate) && `(${arabicWeekday(previewModalReq.targetDate || previewModalReq.peerDate)})` }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PUNCH CORRECTION DETAILS ── */}
                {isPunch && (
                  <div style={{ background: '#fdf2f8', padding: '16px', borderRadius: '12px', border: '1px solid #fbcfe8' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#9d174d', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📸 تفاصيل بصمة الوجه / الحضور:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>نوع العملية:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          {previewModalReq.targetAction === 'shift_start' ? 'تسجيل بداية وردية (حضور)' : previewModalReq.targetAction === 'shift_end' ? 'تسجيل نهاية وردية (انصراف)' : previewModalReq.targetAction === 'break_start' ? 'بدء استراحة' : previewModalReq.targetAction === 'break_end' ? 'عودة من استراحة' : 'بصمة حضور وانصراف'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#9d174d' }}>توقيت التقاط البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: '#831843' }}>
                          ⏰ {previewModalReq.time || formatTimeStr(previewModalReq.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PENALTY DETAILS ── */}
                {isPenalty && (
                  <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#991b1b', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ تفاصيل الخصم / الجزاء الإداري:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: previewModalReq.objection ? '14px' : '0' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#991b1b' }}>نوع البند:</span>
                        <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>
                          {previewModalReq.subType === 'lateness' ? '🏃‍♂️ تأخير عن موعد العمل المجدول' : 'مخالفة لائحة'}
                        </div>
                      </div>
                      {previewModalReq.latenessMinutes && (
                        <div>
                          <span style={{ fontSize: '12px', color: '#991b1b' }}>مدة التأخير:</span>
                          <div style={{ fontWeight: 'bold', color: '#7f1d1d' }}>
                            ⏱️ {previewModalReq.latenessMinutes} دقيقة
                          </div>
                        </div>
                      )}
                      <div>
                        <span style={{ fontSize: '12px', color: '#991b1b' }}>مبلغ الخصم:</span>
                        <div style={{ fontWeight: '900', color: '#b91c1c', fontSize: '16px' }}>
                          💸 {previewModalReq.amount || '0'} ج.م
                        </div>
                      </div>
                    </div>

                    {previewModalReq.objection && (
                      <div style={{ background: '#fff', border: '1px solid #f59e0b', borderRadius: '10px', padding: '12px', marginTop: '10px' }}>
                        <div style={{ fontWeight: 'bold', color: '#b45309', marginBottom: '6px', fontSize: '13.5px' }}>
                          ✋ اعتراض مقدم من الموظف:
                        </div>
                        <div style={{ fontSize: '13px', color: '#1e293b', background: '#fef3c7', padding: '8px 12px', borderRadius: '6px', marginBottom: '10px' }}>
                          "{previewModalReq.objection.reason}"
                        </div>
                        {previewModalReq.objection.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-start"
                              style={{ background: '#16a34a', fontSize: '12px', padding: '5px 12px' }}
                              onClick={() => handleApprovePenaltyObjection(previewModalReq.id)}
                            >
                              ✅ قبول الاعتراض وإلغاء الجزاء والخصم
                            </button>
                            <button
                              type="button"
                              className="btn btn-start"
                              style={{ background: '#dc2626', fontSize: '12px', padding: '5px 12px' }}
                              onClick={() => handleRejectPenaltyObjection(previewModalReq.id)}
                            >
                              ❌ رفض الاعتراض وتثبيت الجزاء
                            </button>
                          </div>
                        ) : previewModalReq.objection.status === 'approved' ? (
                          <span className="badge badge-success">✅ تم قبول الاعتراض وإلغاء الخصم</span>
                        ) : (
                          <span className="badge badge-danger">❌ تم رفض الاعتراض ({previewModalReq.objection.adminReply || 'مثبت'})</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── ROSTER EDIT DETAILS & COMPARISON (الجدول السابق مقابل الجديد) ── */}
                {isRoster && (() => {
                  const existingRoster = (state.rosters || []).find(r => 
                    String(r.employeeId) === String(previewModalReq.employeeId) &&
                    (!previewModalReq.month || r.month === previewModalReq.month)
                  );

                  const prevSchedule = previewModalReq.oldSchedule || previewModalReq.previousSchedule || existingRoster?.schedule || {};
                  const newSchedule = previewModalReq.schedule || previewModalReq.newSchedule || {};

                  const daysOfWeek = [
                    { key: 'saturday', label: 'السبت' },
                    { key: 'sunday', label: 'الأحد' },
                    { key: 'monday', label: 'الإثنين' },
                    { key: 'tuesday', label: 'الثلاثاء' },
                    { key: 'wednesday', label: 'الأربعاء' },
                    { key: 'thursday', label: 'الخميس' },
                    { key: 'friday', label: 'الجمعة' },
                  ];

                  const customDateKeys = Object.keys(newSchedule).filter(k => !daysOfWeek.some(d => d.key === k));
                  const hasCustomDates = customDateKeys.length > 0;

                  const displayList = hasCustomDates 
                    ? customDateKeys.sort().map(dateKey => ({ key: dateKey, label: `${dateKey} (${arabicWeekday(dateKey)})` }))
                    : daysOfWeek;

                  return (
                    <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          📅 مقارنة ومعاينة تعديل الجدول الشهري (الجدول السابق مقابل الجديد):
                        </h4>
                        <span style={{ fontSize: '12px', background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                          الشهر: {previewModalReq.month || 'الشهر الحالي'}
                        </span>
                      </div>

                      {previewModalReq.details && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: '#334155' }}>
                          <strong>📝 تفاصيل التعديل المطلوبة: </strong> {previewModalReq.details}
                        </div>
                      )}

                      <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        <table className="table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#e2e8f0', color: '#1e293b' }}>
                              <th style={{ padding: '8px 10px' }}>اليوم</th>
                              <th style={{ padding: '8px 10px', background: '#fee2e2', color: '#991b1b' }}>⏮️ الجدول السابق (قبل التعديل)</th>
                              <th style={{ padding: '8px 10px', background: '#dcfce7', color: '#166534' }}>⏭️ الجدول الجديد (بعد التعديل)</th>
                              <th style={{ padding: '8px 10px' }}>موقف التغيير</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayList.map((dayItem) => {
                              const oldDay = prevSchedule[dayItem.key] || { isOff: dayItem.key === 'friday', checkIn: '09:00', checkOut: '17:00', hours: empObj?.workHoursPerDay || 8 };
                              const newDay = newSchedule[dayItem.key] || oldDay;

                              const isOldOff = oldDay.isOff || oldDay.type === 'off';
                              const isNewOff = newDay.isOff || newDay.type === 'off';

                              const oldStart = oldDay.checkIn || oldDay.start || oldDay.startTime || (isOldOff ? '—' : '09:00');
                              const oldEnd = oldDay.checkOut || oldDay.end || oldDay.endTime || (isOldOff ? '—' : '17:00');

                              const newStart = newDay.checkIn || newDay.start || newDay.startTime || (isNewOff ? '—' : '09:00');
                              const newEnd = newDay.checkOut || newDay.end || newDay.endTime || (isNewOff ? '—' : '17:00');

                              const isChanged = (isOldOff !== isNewOff) || (oldStart !== newStart) || (oldEnd !== newEnd);

                              return (
                                <tr key={dayItem.key} style={{ background: isChanged ? '#fffbeb' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ fontWeight: 'bold', color: '#334155' }}>{dayItem.label}</td>
                                  
                                  {/* Previous Schedule */}
                                  <td style={{ background: isOldOff ? '#fef2f2' : 'transparent' }}>
                                    {isOldOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: '#475569' }}>
                                          من <strong>{oldStart}</strong> إلى <strong>{oldEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* New Schedule */}
                                  <td style={{ background: isNewOff ? '#fef2f2' : 'transparent' }}>
                                    {isNewOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: '#15803d', fontWeight: 'bold' }}>
                                          من <strong>{newStart}</strong> إلى <strong>{newEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Change Status */}
                                  <td>
                                    {isChanged ? (
                                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', display: 'inline-block' }}>
                                        ⚡ تم التعديل
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>مطابق</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Reason, Notes and Description Card */}
                <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--primary-dark)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📝 شرح الطلب والسبب المذكور:
                  </h4>
                  <div style={{ lineHeight: 1.7, color: '#334155', background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap' }}>
                    {previewModalReq.reason || previewModalReq.details || previewModalReq.notes || previewModalReq.subject || 'لا يوجد شرح أو سبب إضافي مذكور'}
                  </div>

                  {previewModalReq.photoUrl && (
                    <div style={{ marginTop: '14px' }}>
                      <h5 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--primary)' }}>📷 المرفقات والصور المسجلة:</h5>
                      <div style={{ textAlign: 'center', background: '#000', padding: '8px', borderRadius: '8px' }}>
                        <img src={previewModalReq.photoUrl} alt="صورة المرفق" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '6px' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                  onClick={() => setPreviewModalReq(null)}
                >
                  إغلاق النافذة
                </button>

                {/* ── EARLY EXIT / OVERTIME MODAL ACTIONS ── */}
                {previewModalReq.type === 'early_exit' && previewModalReq.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-start"
                      style={{ padding: '8px 18px', fontSize: '13px', background: '#dc2626' }}
                      onClick={() => {
                        handleApprove(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                    >
                      ⚖️ تطبيق الجزاء اللائحي {previewModalReq.amount ? `(${previewModalReq.amount} ج.م)` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '8px 16px', fontSize: '13px', border: '1px solid #cbd5e1' }}
                      onClick={() => {
                        handleWaive(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                    >
                      🛡️ إعفاء من الخصم
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: '8px 16px', fontSize: '13px', color: '#d97706', borderColor: '#fde68a' }}
                      onClick={() => {
                        handleSendWarningEmail(previewModalReq.id);
                      }}
                    >
                      📧 إرسال إشعار للموظف بالإيميل
                    </button>
                  </div>
                ) : previewModalReq.type === 'overtime' && previewModalReq.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-start"
                      style={{ padding: '8px 20px', fontSize: '13px', background: '#16a34a' }}
                      onClick={() => {
                        handleApprove(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                    >
                      ✅ اعتماد الساعات الإضافية (+{previewModalReq.hours} س بالراتب)
                    </button>
                    <button
                      type="button"
                      className="del-btn"
                      style={{ padding: '8px 18px', fontSize: '13px' }}
                      onClick={() => {
                        handleReject(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                    >
                      ❌ استبعاد الإضافي من الأجر
                    </button>
                  </div>
                ) : (previewModalReq.type === 'penalty' || previewModalReq.subType === 'lateness') && previewModalReq.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-start"
                      style={{ padding: '8px 18px', fontSize: '13px', background: '#dc2626' }}
                      onClick={() => {
                        handleApprove(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                      title="تطبيق الخصم الجزاء المحدد باللائحة فوراً في الرواتب"
                    >
                      ⚖️ تطبيق الخصم الجزاء {previewModalReq.amount ? `(${previewModalReq.amount} ج.م)` : ''}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '8px 16px', fontSize: '13px', border: '1px solid #cbd5e1' }}
                      onClick={() => {
                        handleReject(previewModalReq.id);
                        setPreviewModalReq(null);
                      }}
                      title="عدم تطبيق الخصم وقبول العذر بدون أي استقطاع مالي"
                    >
                      🛡️ عدم تطبيق الخصم (قبول العذر)
                    </button>
                  </div>
                ) : (
                  <>
                    {previewModalReq.status !== 'rejected' && (
                      <button
                        type="button"
                        className="del-btn"
                        style={{ padding: '8px 18px', fontSize: '13px' }}
                        onClick={() => {
                          handleReject(previewModalReq.id);
                          setPreviewModalReq(null);
                        }}
                      >
                        ✕ رفض الطلب
                      </button>
                    )}

                    {previewModalReq.status !== 'approved' && (
                      <button
                        type="button"
                        className="btn btn-start"
                        style={{ padding: '8px 22px', fontSize: '13.5px', fontWeight: 'bold' }}
                        onClick={() => {
                          handleApprove(previewModalReq.id);
                          setPreviewModalReq(null);
                        }}
                      >
                        ✓ اعتماد وموافقة الطلب فوراً
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
