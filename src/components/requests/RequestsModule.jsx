import React, { useState, useMemo } from 'react';
import { applyShiftSwapToRosters, arabicWeekday, shouldShowRequestToBranch, getEmpDisplayName, isEmployeeActive, normalizeState, fmt } from '../../utils/formatters';
import { notifyEmployeeEarlyExitWarning } from '../../utils/gmailService';
import { recalculateEmployeeCycleLateness, applyApprovedPermissionsToShifts, isApprovedPermissionForDate } from '../../utils/latePenaltyEngine';
import { shouldRouteDirectToAdmin, isBranchWithoutManager } from '../../utils/jobsHelper';
import { normalizeSchedule } from '../roster/RosterModule';
import { syncNow, fetchRemoteState } from '../../utils/offlineSync';
import { createRequestDecisionNotification } from '../../utils/notificationEngine';

export function getFormattedRequestBadge(type, leaveType) {
  const cleanType = String(type || '').trim().toLowerCase();
  const cleanLeaveType = String(leaveType || '').trim().toLowerCase();

  if (cleanType === 'leave' || cleanType === 'leave_request' || cleanType === 'annual_leave' || cleanType === 'sick_leave' || cleanType === 'unpaid_leave') {
    if (cleanLeaveType === 'annual' || cleanType === 'annual_leave') return <span className="badge badge-success">🏖️ إجازة سنوية</span>;
    if (cleanLeaveType === 'unpaid' || cleanType === 'unpaid_leave') return <span className="badge badge-warning">⏱️ إجازة غير مدفوعة</span>;
    if (cleanLeaveType === 'sick' || cleanType === 'sick_leave') return <span className="badge badge-danger">🏥 إجازة مرضية</span>;
    if (cleanLeaveType === 'casual') return <span className="badge badge-info">🌴 إجازة عارضة</span>;
    if (cleanLeaveType === 'marriage') return <span className="badge badge-primary">💍 إجازة زواج</span>;
    if (cleanLeaveType === 'maternity') return <span className="badge badge-primary">👶 إجازة وضع</span>;
    if (cleanLeaveType === 'bereavement') return <span className="badge badge-secondary">🖤 إجازة وفاة</span>;
    return <span className="badge badge-success">🏖️ طلب إجازة</span>;
  }

  if (cleanType === 'penalty_objection' || cleanType === 'objection' || cleanType === 'تظلم' || cleanType === 'اعتراض') {
    return <span className="badge badge-danger" style={{ background: '#7c3aed', color: '#fff', border: '1px solid #6d28d9' }}>✋ تظلم على جزاء لائحى</span>;
  }
  if (cleanType === 'disciplinary_penalty' || cleanType === 'violation' || cleanType === 'disciplinary') {
    return <span className="badge badge-danger">⚠️ جزاء تأديبي لائحي</span>;
  }
  if (cleanType === 'penalty' || cleanType === 'deduction' || cleanType === 'late_penalty') {
    return <span className="badge badge-danger">⚠️ خصم / جزاء مالي</span>;
  }
  if (cleanType === 'early_exit' || cleanType === 'early_leave') {
    return <span className="badge badge-danger">⚠️ انصراف مبكر</span>;
  }
  if (cleanType === 'late_permission' || cleanType === 'late_excuse') {
    return <span className="badge badge-warning">⏰ إذن تأخير صباحي</span>;
  }
  if (cleanType === 'permission' || cleanType === 'إذن') {
    return <span className="badge badge-warning">⏰ إذن خروج / تأخير</span>;
  }
  if (cleanType === 'loan' || cleanType === 'advance' || cleanType === 'سلفة') {
    return <span className="badge badge-primary">💳 سلفة مالية</span>;
  }
  if (cleanType === 'meds' || cleanType === 'credit_medicine' || cleanType === 'أدوية') {
    return <span className="badge badge-primary">💊 أدوية آجل</span>;
  }
  if (cleanType === 'swap' || cleanType === 'shift_swap' || cleanType === 'تبديل') {
    return <span className="badge badge-primary">🔄 تبديل وردية</span>;
  }
  if (cleanType === 'roster_update' || cleanType === 'roster_edit' || cleanType === 'roster_edit_request' || cleanType === 'schedule_edit') {
    return <span className="badge badge-warning">📅 تعديل جدول شهري</span>;
  }
  if (cleanType === 'bonus' || cleanType === 'reward' || cleanType === 'مكافأة') {
    return <span className="badge badge-success">🏆 إضافة مكافأة</span>;
  }
  if (cleanType === 'overtime' || cleanType === 'overtime_request' || cleanType === 'إضافي') {
    return <span className="badge badge-success">⭐ ساعات إضافية</span>;
  }
  if (cleanType === 'eval_edit_request' || cleanType === 'complaint' || cleanType === 'شكوى') {
    return <span className="badge badge-warning">📋 شكوى / ملاحظة</span>;
  }
  if (cleanType === 'resignation' || cleanType === 'resignation_request' || cleanType === 'استقالة') {
    return <span className="badge badge-danger">🚪 طلب استقالة</span>;
  }
  if (cleanType === 'withdraw' || cleanType === 'resignation_withdraw' || cleanType === 'تراجع') {
    return <span className="badge badge-primary">↩️ تراجع عن استقالة</span>;
  }
  if (cleanType === 'punch_correction' || cleanType === 'attendance_punch' || cleanType === 'تأكيد بصمة الوجه') {
    return <span className="badge badge-primary">📸 تأكيد بصمة الوجه</span>;
  }
  if (cleanType === 'adjustment') {
    return <span className="badge badge-info">⚖️ تعديل إداري / مالي</span>;
  }

  // إذا كان النص يحتوي على حروف إنجليزية ولم يطابق ما سبق
  if (/[a-zA-Z]/.test(type)) {
    return <span className="badge badge-primary">📋 طلب إداري</span>;
  }

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
  stopShift,
  filterFn = null,
  monthPicker = null,
  filterMode = 'month',
  customFrom = '',
  customTo = '',
  currentBranch = null,
  authRole = 'admin',
  currentRole = 'admin',
  executeWithOwnerGuard
}) {
  const effectiveRole = currentRole || authRole || 'admin';
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [previewModalReq, setPreviewModalReq] = useState(null);

  // Loan Modification State for Higher Management before approval
  const [loanCustomAmount, setLoanCustomAmount] = useState('');
  const [loanCustomType, setLoanCustomType] = useState('monthly'); // 'monthly' | 'installment'
  const [loanCustomMonths, setLoanCustomMonths] = useState('1');
  const [loanCustomMonthlyDed, setLoanCustomMonthlyDed] = useState('');
  const [loanCustomNotes, setLoanCustomNotes] = useState('');
  const [isEditingLoan, setIsEditingLoan] = useState(false);

  const [showHiddenAdminRequests, setShowHiddenAdminRequests] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await syncNow();
      if (res.success && res.mergedState) {
        if (setState) setState(normalizeState(res.mergedState));
        showToast?.('✅ تم تحديث وجلب أحدث الطلبات بنجاح');
      } else {
        const remote = await fetchRemoteState();
        if (remote && !remote.notModified) {
          if (setState) setState(normalizeState(remote));
          showToast?.('✅ تم تحديث وجلب أحدث الطلبات من السحابة بنجاح');
        } else {
          showToast?.('ℹ️ السجل محدث بالفعل مع أحدث بيانات السحابة');
        }
      }
    } catch (err) {
      showToast?.('تعذر جلب التحديثات: ' + (err.message || 'خطأ في الشبكة'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenPreview = (req) => {
    setPreviewModalReq(req);
    if (req && (req.type === 'loan' || req.type === 'advance' || req.type === 'meds' || req.type === 'credit_medicine')) {
      const amt = req.amount || req.totalAmount || '';
      const isInst = req.loanType === 'installments' || req.loanType === 'installment' || req.isInstallment || (parseInt(req.installmentsCount || req.monthsCount, 10) > 1);
      const months = String(req.installmentsCount || req.monthsCount || (isInst ? '2' : '1'));
      const monthly = req.monthlyDeduction || req.installmentAmount || (isInst && amt && months ? Math.ceil(parseFloat(amt) / parseInt(months, 10)) : amt);
      setLoanCustomAmount(String(amt));
      setLoanCustomType(isInst ? 'installment' : 'monthly');
      setLoanCustomMonths(months);
      setLoanCustomMonthlyDed(String(monthly));
      setLoanCustomNotes(req.adminNotes || '');
      setIsEditingLoan(false);
    }
  };

  const isBranch = authRole === 'branch';
  const cIdStr = String(currentBranch?.id || '');
  const branchEmpIdSet = useMemo(() => {
    if (!isBranch || !cIdStr) return new Set();
    return new Set(
      (state.employees || [])
        .filter((e) => String(e.branchId || '') === cIdStr || (e.branchesDetails && e.branchesDetails.some((bd) => String(bd.branchId) === cIdStr)))
        .flatMap((e) => [String(e.id), String(e.code || '')])
        .filter(Boolean)
    );
  }, [state.employees, isBranch, cIdStr]);

  const deletedIdsSet = useMemo(() => {
    return new Set((state._deletedIds || []).map(String));
  }, [state._deletedIds]);

  const allRequests = useMemo(() => {
    const list = [...(state.requests || [])];
    const existingIds = new Set(list.map((r) => String(r.id)));

    (state.leaveRequests || []).forEach((lr) => {
      if (lr && !existingIds.has(String(lr.id))) {
        list.push({ ...lr, type: lr.type || 'leave' });
        existingIds.add(String(lr.id));
      }
    });

    (state.shiftSwaps || []).forEach((sw) => {
      if (sw && !existingIds.has(String(sw.id))) {
        list.push({ ...sw, type: 'swap' });
        existingIds.add(String(sw.id));
      }
    });

    (state.loans || []).forEach((ln) => {
      if (ln && !existingIds.has(String(ln.id))) {
        list.push({ ...ln, type: ln.type || 'loan' });
        existingIds.add(String(ln.id));
      }
    });

    (state.resignationRequests || []).forEach((res) => {
      if (res && !existingIds.has(String(res.id))) {
        list.push({ ...res, type: 'resignation' });
        existingIds.add(String(res.id));
      }
    });

    // Aggregate any pending/resolved employee penalty objections from late incidents
    (state.lateIncidents || []).forEach((inc) => {
      if (inc && inc.objection && (inc.objection.status || inc.status === 'objection_pending')) {
        const objReqId = `obj_inc_${inc.id}`;
        if (!existingIds.has(objReqId) && !existingIds.has(String(inc.id))) {
          const emp = (state.employees || []).find((e) => String(e.id) === String(inc.employeeId) || (inc.employeeCode && String(e.code) === String(inc.employeeCode)));
          list.push({
            id: objReqId,
            penaltyId: inc.id,
            sourceType: 'late_incident',
            type: 'penalty_objection',
            typeLabel: 'تظلم على جزاء لائحى',
            employeeId: inc.employeeId || emp?.id,
            employeeCode: inc.employeeCode || emp?.code,
            employeeName: inc.employeeName || emp?.name,
            branchId: inc.branchId || emp?.branchId,
            date: inc.date,
            reason: inc.objection.reason || 'تظلم على واقعة تأخير / جزاء لائحى',
            details: `تظلم على جزاء (${inc.penaltyAmount || 0} ج.م / ${inc.deductionMinutes || 0} دقيقة تأخير) — مبررات الموظف: ${inc.objection.reason || '—'}`,
            penaltyAmount: inc.penaltyAmount || 0,
            deductionMinutes: inc.deductionMinutes || 0,
            violationTitle: inc.violationTitle || `تأخير (${inc.lateMinutes || 0} دقيقة)`,
            status: inc.objection.status || (inc.status === 'objection_pending' ? 'pending' : 'pending'),
            adminApproved: inc.objection.status === 'approved',
            createdAt: inc.objection.submittedAt || inc.date || new Date().toISOString()
          });
          existingIds.add(objReqId);
        }
      }
    });

    // Aggregate any employee objections from financial adjustments
    (state.adjustments || []).forEach((adj) => {
      if (adj && adj.objection && adj.objection.status) {
        const objReqId = `obj_adj_${adj.id}`;
        if (!existingIds.has(objReqId) && !existingIds.has(String(adj.id))) {
          const emp = (state.employees || []).find((e) => String(e.id) === String(adj.employeeId) || (adj.employeeCode && String(e.code) === String(adj.employeeCode)));
          list.push({
            id: objReqId,
            penaltyId: adj.id,
            sourceType: 'adjustment',
            type: 'penalty_objection',
            typeLabel: 'تظلم على خصم مالي',
            employeeId: adj.employeeId || emp?.id,
            employeeCode: adj.employeeCode || emp?.code,
            employeeName: adj.employeeName || emp?.name,
            branchId: adj.branchId || emp?.branchId,
            date: adj.date,
            reason: adj.objection.reason || 'تظلم على خصم مالي',
            details: `تظلم على خصم (${adj.amount || 0} ج.م) — مبررات الموظف: ${adj.objection.reason || '—'}`,
            penaltyAmount: adj.amount || 0,
            status: adj.objection.status || 'pending',
            adminApproved: adj.objection.status === 'approved',
            createdAt: adj.objection.submittedAt || adj.date || new Date().toISOString()
          });
          existingIds.add(objReqId);
        }
      }
    });

    const loansList = state.loans || [];

    return list.map((r) => {
      if (!r) return r;
      const isLoanType = r.type === 'loan' || r.type === 'meds' || r.type === 'credit_medicine' || r.type === 'advance';
      if (isLoanType) {
        const rIdStr = String(r.id || '');
        const rAmt = parseFloat(r.amount || r.totalAmount) || 0;
        const matchingLoan = loansList.find((l) => {
          if (!l) return false;
          if (String(l.id) === rIdStr || String(l.requestId) === rIdStr || String(r.requestId) === String(l.id)) return true;
          if (String(l.employeeId) === String(r.employeeId)) {
            const lAmt = parseFloat(l.amount || l.totalAmount) || 0;
            if (rAmt > 0 && lAmt > 0 && Math.abs(rAmt - lAmt) < 0.01) return true;
          }
          return false;
        });

        if (matchingLoan) {
          const isApprovedOrPaid = matchingLoan.status === 'approved' ||
                                   matchingLoan.status === 'paid' ||
                                   matchingLoan.status === 'partial' ||
                                   matchingLoan.adminApproved === true ||
                                   (parseFloat(matchingLoan.paidAmount) > 0) ||
                                   (Array.isArray(matchingLoan.paymentsHistory) && matchingLoan.paymentsHistory.length > 0);

          if (isApprovedOrPaid) {
            const mPaid = Math.max(parseFloat(matchingLoan.paidAmount) || 0, parseFloat(r.paidAmount) || 0);
            const totalAmt = parseFloat(matchingLoan.amount || r.amount || rAmt) || 0;
            const status = mPaid >= totalAmt && totalAmt > 0 ? 'paid' : (mPaid > 0 ? 'partial' : (matchingLoan.status || 'approved'));
            const history = (Array.isArray(matchingLoan.paymentsHistory) && matchingLoan.paymentsHistory.length > 0)
              ? matchingLoan.paymentsHistory
              : (Array.isArray(r.paymentsHistory) ? r.paymentsHistory : []);

            return {
              ...r,
              ...matchingLoan,
              status,
              adminApproved: true,
              paidAmount: mPaid,
              paymentsHistory: history
            };
          }
        } else if (parseFloat(r.paidAmount) > 0 || (Array.isArray(r.paymentsHistory) && r.paymentsHistory.length > 0)) {
          const mPaid = parseFloat(r.paidAmount) || 0;
          const totalAmt = parseFloat(r.amount || r.totalAmount) || 0;
          return {
            ...r,
            status: mPaid >= totalAmt && totalAmt > 0 ? 'paid' : 'partial',
            adminApproved: true
          };
        }
      }
      return r;
    }).filter((r) => {
      if (!r || !r.id) return false;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
      if (deletedIdsSet.has(idStr) || (rawId && (deletedIdsSet.has(rawId) || deletedIdsSet.has(`req_${rawId}`)))) {
        return false;
      }
      if (isBranch) {
        if (!shouldShowRequestToBranch(r, state)) return false;
        const reqBranchId = r.branchId || (state.employees || []).find((e) => String(e.id) === String(r.employeeId))?.branchId;
        const isMatch = (reqBranchId && String(reqBranchId) === cIdStr) || (r.employeeId && branchEmpIdSet.has(String(r.employeeId)));
        return isMatch;
      }
      return true;
    });
  }, [state.requests, state.leaveRequests, state.shiftSwaps, state.loans, state.resignationRequests, state.lateIncidents, state.adjustments, state.employees, state.approvalRules, isBranch, cIdStr, branchEmpIdSet, deletedIdsSet]);

  const hiddenAdminCount = isBranch ? 0 : allRequests.filter(r => r && r.hiddenFromAdmin).length;
  
  // Higher management view: hide items with hiddenFromAdmin unless user toggles showHiddenAdminRequests
  const visibleAdminRequests = isBranch
    ? allRequests
    : allRequests.filter((r) => {
        if (!r) return false;
        if (showHiddenAdminRequests) return true;
        return !r.hiddenFromAdmin;
      });

  const requests = visibleAdminRequests;
  const employees = state.employees || [];

  const getRequestDate = (r) => {
    if (!r) return '';
    if (r.createdAt && typeof r.createdAt === 'string') return r.createdAt.slice(0, 10);
    if (r.date && typeof r.date === 'string') return r.date.slice(0, 10);
    if (r.startDate && typeof r.startDate === 'string') return r.startDate.slice(0, 10);
    if (r.timestamp && typeof r.timestamp === 'string') return r.timestamp.slice(0, 10);
    if (r.requestDate && typeof r.requestDate === 'string') return r.requestDate.slice(0, 10);
    if (r.submissionDate && typeof r.submissionDate === 'string') return r.submissionDate.slice(0, 10);
    if (r.effectiveDate && typeof r.effectiveDate === 'string') return r.effectiveDate.slice(0, 10);
    if (r.month && typeof r.month === 'string') return `${r.month}-01`;
    if (r.id) {
      const parts = String(r.id).split('_');
      for (const p of parts) {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num > 1000000000000) {
          try {
            return new Date(num).toISOString().slice(0, 10);
          } catch {}
        }
      }
    }
    return '';
  };

  const getRequestTime = (r) => {
    if (!r) return '—';
    if (r.createdAt && typeof r.createdAt === 'string' && r.createdAt.includes('T')) {
      try {
        const d = new Date(r.createdAt);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      } catch {}
    }
    if (r.timestamp && typeof r.timestamp === 'string' && r.timestamp.includes('T')) {
      try {
        const d = new Date(r.timestamp);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      } catch {}
    }
    if (r.time) return String(r.time);
    if (r.id) {
      const parts = String(r.id).split('_');
      for (const p of parts) {
        const num = parseInt(p, 10);
        if (!isNaN(num) && num > 1000000000000) {
          try {
            return new Date(num).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
          } catch {}
        }
      }
    }
    return '—';
  };

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

  const formatTimeStr = (timeVal) => {
    if (!timeVal) return '—';
    if (typeof timeVal === 'object') return getRequestTime(timeVal);
    if (typeof timeVal === 'string' && timeVal.includes('T')) {
      try {
        const d = new Date(timeVal);
        if (!isNaN(d.getTime())) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      } catch {}
    }
    return String(timeVal);
  };

  const filteredRequests = requests.filter((r) => {
    if (!r) return false;
    if (filterType !== 'all') {
      if (filterType === 'long_leave') {
        if (r.type !== 'long_leave' && !r.isLongLeave && parseFloat(r.daysCount || r.days || 0) <= 3) return false;
      } else if (filterType === 'loan') {
        if (r.type !== 'loan' && r.type !== 'advance') return false;
      } else if (filterType === 'meds') {
        if (r.type !== 'meds' && r.type !== 'credit_medicine') return false;
      } else if (filterType === 'swap') {
        if (r.type !== 'swap' && r.type !== 'shift_swap') return false;
      } else if (filterType === 'roster_edit') {
        if (r.type !== 'roster_update' && r.type !== 'roster_edit' && r.type !== 'roster_edit_request') return false;
      } else if (filterType === 'complaint') {
        if (r.type !== 'complaint' && r.type !== 'eval_edit_request') return false;
      } else if (filterType === 'penalty_objection') {
        if (r.type !== 'penalty_objection' && r.type !== 'objection' && !r.penaltyId && !r.objection) return false;
      } else if (r.type !== filterType) {
        return false;
      }
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'pending') {
        if (r.status === 'approved' || r.status === 'paid' || r.status === 'partial' || r.adminApproved === true || r.status === 'rejected' || r.status === 'cancelled') return false;
      } else if (filterStatus === 'approved') {
        if (r.status !== 'approved' && r.status !== 'paid' && r.status !== 'partial' && r.adminApproved !== true) return false;
      } else if (filterStatus === 'pending_admin') {
        if (r.status !== 'pending_admin' || r.adminApproved === true) return false;
      } else if (r.status !== filterStatus) {
        return false;
      }
    }
    if (filterEmp !== 'all') {
      if (String(r.employeeId) !== String(filterEmp)) return false;
    }

    const rDate = getRequestDate(r);
    const isPending = !r.status || r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_target';
    
    // Period & Date Filtering (Custom Period / Month Cycle / Specific Date)
    if (filterDate) {
      if (rDate && !rDate.startsWith(filterDate)) return false;
    } else if (!isPending) {
      // الطلبات المعالجة والمنتهية فقط تخضع لتصفية دورة الشهر عند عدم تحديد تاريخ خاص
      if ((filterMode === 'custom' || filterMode === 'range') && customFrom && customTo) {
        const from = customFrom <= customTo ? customFrom : customTo;
        const to = customFrom <= customTo ? customTo : customFrom;
        if (rDate && (rDate < from || rDate > to)) return false;
      } else if (typeof filterFn === 'function' && rDate) {
        if (!filterFn(rDate)) return false;
      }
    }
    return true;
  });

  // Sort descending by newest request first
  filteredRequests.sort((a, b) => {
    const getT = (r) => {
      if (!r) return 0;
      if (r.createdAt) { const t = new Date(r.createdAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.updatedAt) { const t = new Date(r.updatedAt).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.id) {
        const parts = String(r.id).split('_');
        for (const p of parts) {
          const num = parseInt(p, 10);
          if (!isNaN(num) && num > 1000000000000) return num;
        }
      }
      if (r.date) { const t = new Date(r.date).getTime(); if (!isNaN(t) && t > 0) return t; }
      if (r.startDate) { const t = new Date(r.startDate).getTime(); if (!isNaN(t) && t > 0) return t; }
      return 0;
    };
    return getT(b) - getT(a);
  });

  const handleApprove = async (reqId, customLoanData = null) => {
    let targetReq = (state.requests || []).find((r) => r.id === reqId) ||
                    (state.leaveRequests || []).find((r) => r.id === reqId) ||
                    (state.shiftSwaps || []).find((r) => r.id === reqId) ||
                    (state.loans || []).find((r) => r.id === reqId) ||
                    allRequests.find((r) => r.id === reqId);

    if (!targetReq) {
      showToast?.('لم يتم العثور على الطلب');
      return;
    }

    const performApprove = async () => {
      let approvedTargetReq = {
        ...targetReq,
        status: 'approved',
        adminApproved: true,
        approvedAt: new Date().toISOString()
      };
      if (approvedTargetReq.photoUrl) delete approvedTargetReq.photoUrl;

      // Apply any loan modifications decided by Higher Management
      if (customLoanData) {
        const originalAmt = approvedTargetReq.originalAmount || approvedTargetReq.amount || approvedTargetReq.totalAmount;
        const newAmt = parseFloat(customLoanData.amount) || parseFloat(approvedTargetReq.amount) || 0;
        const isInst = customLoanData.loanType === 'installment';
        const months = isInst ? Math.max(2, parseInt(customLoanData.installmentsCount, 10) || 2) : 1;
        const monthly = parseFloat(customLoanData.monthlyDeduction) || (isInst ? Math.ceil(newAmt / months) : newAmt);

        approvedTargetReq.amount = newAmt;
        approvedTargetReq.totalAmount = newAmt;
        approvedTargetReq.originalAmount = originalAmt;
        approvedTargetReq.loanType = isInst ? 'installment' : 'monthly';
        approvedTargetReq.installmentsCount = months;
        approvedTargetReq.monthsCount = months;
        approvedTargetReq.monthlyDeduction = monthly;
        approvedTargetReq.installmentAmount = monthly;
        approvedTargetReq.adminNotes = customLoanData.adminNotes || '';
        approvedTargetReq.adminModified = (parseFloat(originalAmt) !== newAmt) || Boolean(customLoanData.isModified);
      }

      let updatedRequests = [...(state.requests || [])];
      const rIdx = updatedRequests.findIndex((r) => r.id === reqId);
      if (rIdx >= 0) {
        updatedRequests[rIdx] = approvedTargetReq;
      } else {
        updatedRequests.unshift(approvedTargetReq);
      }

      let updatedRosters = [...(state.rosters || [])];
      let updatedAdjustments = [...(state.adjustments || [])];
      let updatedShifts = [...(state.shifts || [])];

      // 0. Overtime Request Approval
      if (approvedTargetReq.type === 'overtime') {
        const overtimeHrs = parseFloat(approvedTargetReq.hours) || 0;
        updatedShifts = updatedShifts.map((s) => {
          if (s.id === approvedTargetReq.shiftId || (String(s.employeeId) === String(approvedTargetReq.employeeId) && s.date === approvedTargetReq.date)) {
            const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || s.hours);
            return {
              ...s,
              overtimeStatus: 'approved',
              overtimeHours: overtimeHrs,
              adminApproved: true,
              note: `ساعات عمل وإضافي معتمد (أساسي: ${regHours} س + إضافي: ${overtimeHrs} س)`
            };
          }
          return s;
        });
      }

      // 0.1 Manual Punch / Punch Correction Request Approval
      if (approvedTargetReq.type === 'punch_correction' || approvedTargetReq.type === 'attendance_punch' || approvedTargetReq.type === 'manual_punch') {
        const emp = (state.employees || []).find(e => String(e.id) === String(approvedTargetReq.employeeId));
        const punchDate = approvedTargetReq.date || approvedTargetReq.punchDate || new Date().toISOString().slice(0, 10);
        const timeIn = approvedTargetReq.timeIn || '09:00';
        const timeOut = approvedTargetReq.timeOut || '17:00';
        const empBreak = emp?.breakHours || emp?.defaultBreakHours || (emp?.branchesDetails && emp.branchesDetails[0]?.breakHours) || 0;
        const bH = Math.max(0, parseFloat(approvedTargetReq.breakHours !== undefined && approvedTargetReq.breakHours !== null ? approvedTargetReq.breakHours : empBreak) || 0);

        const [inH, inM] = timeIn.split(':').map(Number);
        const [outH, outM] = timeOut.split(':').map(Number);
        let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
        if (diff < 0) diff += 24 * 60;
        const grossHrs = Math.round((diff / 60) * 100) / 100;
        const hrs = Math.max(0, Math.round((grossHrs - bH) * 100) / 100);

        const existingShiftIndex = updatedShifts.findIndex(s => 
          (String(s.employeeId) === String(approvedTargetReq.employeeId) || (emp?.code && String(s.employeeCode) === String(emp.code))) &&
          s.date === punchDate
        );

        if (existingShiftIndex >= 0) {
          updatedShifts[existingShiftIndex] = {
            ...updatedShifts[existingShiftIndex],
            timeIn,
            timeOut,
            breakHours: bH,
            hours: hrs,
            workHours: hrs,
            netHours: hrs,
            actualWorkedHours: hrs,
            grossHours: grossHrs,
            isManual: true,
            manualPunch: true,
            source: 'manual_admin',
            adminApproved: true,
            note: `بصمة يدوية معتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'})`,
            updatedAt: new Date().toISOString()
          };
        } else {
          updatedShifts.unshift({
            id: `shift_manual_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            employeeId: approvedTargetReq.employeeId,
            employeeCode: emp?.code || approvedTargetReq.employeeCode || '',
            employeeName: emp?.name || approvedTargetReq.employeeName || 'موظف',
            branchId: approvedTargetReq.branchId || emp?.branchId || '',
            date: punchDate,
            timeIn,
            timeOut,
            breakHours: bH,
            hours: hrs,
            workHours: hrs,
            netHours: hrs,
            actualWorkedHours: hrs,
            grossHours: grossHrs,
            isManual: true,
            manualPunch: true,
            source: 'manual_admin',
            adminApproved: true,
            statusLabel: 'بصمة يدوية معتمدة',
            note: `بصمة يدوية معتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'})`,
            createdAt: new Date().toISOString()
          });
        }
      }

      if (approvedTargetReq.type === 'penalty' || approvedTargetReq.type === 'early_exit') {
        const emp = (state.employees || []).find((e) => String(e.id) === String(approvedTargetReq.employeeId));
        let amount = 0;
        if (approvedTargetReq.impactType === 'deduction_days') {
          const salary = emp ? parseFloat(emp.salary) || 0 : 0;
          const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
          const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
          const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
          amount = Math.round(dailyRate * (parseFloat(approvedTargetReq.impactVal) || 1) * 100) / 100;
        } else if (approvedTargetReq.impactType === 'fixed_amount') {
          amount = parseFloat(approvedTargetReq.impactVal) || 0;
        } else if (approvedTargetReq.amount) {
          amount = parseFloat(approvedTargetReq.amount) || 0;
        }

        if (amount > 0) {
          const ruleTitle = approvedTargetReq.ruleTitle || approvedTargetReq.reason || approvedTargetReq.details || 'مخالفة لائحية';
          const penaltyDesc = `خصم جزاء لائحى: ${ruleTitle} (${approvedTargetReq.impactType === 'deduction_days' ? `خصم ${approvedTargetReq.impactVal} يوم` : `${amount} ج.م`})`;
          updatedAdjustments.push({
            id: `adj_pen_${Date.now()}`,
            employeeId: approvedTargetReq.employeeId,
            type: 'deduction',
            amount,
            description: penaltyDesc,
            notes: penaltyDesc,
            reason: penaltyDesc,
            date: approvedTargetReq.date || approvedTargetReq.startDate || new Date().toISOString().slice(0, 10),
            createdAt: new Date().toISOString()
          });
        }
      }

      if (approvedTargetReq.type === 'bonus') {
        updatedAdjustments.push({
          id: `adj_${Date.now()}`,
          employeeId: approvedTargetReq.employeeId,
          type: 'bonus',
          amount: parseFloat(approvedTargetReq.amount) || 0,
          description: approvedTargetReq.details || approvedTargetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
          notes: approvedTargetReq.details || approvedTargetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
          reason: approvedTargetReq.reason || approvedTargetReq.details || 'مكافأة معتمدة من الإدارة العليا',
          date: approvedTargetReq.date || approvedTargetReq.startDate || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString()
        });
      }

      let updatedLoans = [...(state.loans || [])];
      if (approvedTargetReq.type === 'loan' || approvedTargetReq.type === 'advance' || approvedTargetReq.type === 'meds' || approvedTargetReq.type === 'credit_medicine') {
        const totalAmount = parseFloat(approvedTargetReq.amount || approvedTargetReq.totalAmount) || 0;
        const monthsCount = parseInt(approvedTargetReq.monthsCount || approvedTargetReq.installmentsCount || approvedTargetReq.installments, 10) || 1;
        const monthlyInstallment = parseFloat(approvedTargetReq.monthlyDeduction || approvedTargetReq.installmentAmount) || (monthsCount > 1 ? Math.ceil(totalAmount / monthsCount) : totalAmount);

        const isMeds = approvedTargetReq.type === 'meds' || approvedTargetReq.type === 'credit_medicine';
        const isInstallment = approvedTargetReq.loanType === 'installment' || approvedTargetReq.loanType === 'installments' || monthsCount > 1;

        const approvedLoanObj = {
          id: approvedTargetReq.id,
          employeeId: approvedTargetReq.employeeId,
          employeeCode: approvedTargetReq.employeeCode,
          employeeName: approvedTargetReq.employeeName,
          type: isMeds ? 'meds' : 'loan',
          loanType: isInstallment ? 'installment' : 'monthly',
          amount: totalAmount,
          totalAmount: totalAmount,
          paidAmount: parseFloat(approvedTargetReq.paidAmount) || 0,
          monthlyDeduction: monthlyInstallment,
          installmentAmount: monthlyInstallment,
          installmentsCount: monthsCount,
          monthsCount: monthsCount,
          medicines: approvedTargetReq.medicines || approvedTargetReq.medsItems || approvedTargetReq.items || [],
          medsItems: approvedTargetReq.medicines || approvedTargetReq.medsItems || approvedTargetReq.items || [],
          notes: approvedTargetReq.reason || approvedTargetReq.details || approvedTargetReq.adminNotes || (isMeds ? 'مشتريات أدوية آجل معتمدة' : 'سلفة مالية معتمدة'),
          date: approvedTargetReq.date || (approvedTargetReq.createdAt ? approvedTargetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          status: 'approved',
          adminApproved: true,
          approvedAt: new Date().toISOString()
        };

        const lIdx = updatedLoans.findIndex((l) => String(l.id) === String(approvedTargetReq.id));
        if (lIdx >= 0) {
          updatedLoans[lIdx] = { ...updatedLoans[lIdx], ...approvedLoanObj };
        } else {
          updatedLoans.unshift(approvedLoanObj);
        }
      }

      if (approvedTargetReq.type === 'swap' || approvedTargetReq.type === 'shift_swap' || approvedTargetReq.type === 'shift_edit') {
        updatedRosters = applyShiftSwapToRosters(approvedTargetReq, updatedRosters, state.employees || []);
      }

      if (approvedTargetReq.type === 'permission' || approvedTargetReq.type === 'إذن' || approvedTargetReq.type === 'late_permission' || approvedTargetReq.type === 'early_leave' || approvedTargetReq.permType === 'late' || approvedTargetReq.permType === 'early') {
        const permDate = approvedTargetReq.date || approvedTargetReq.startDate;
        updatedShifts = applyApprovedPermissionsToShifts({
          ...state,
          requests: updatedRequests,
          shifts: updatedShifts
        });

        // Cancel any late penalties on this date and employee
        updatedRequests = updatedRequests.map((r) => {
          if (
            String(r.employeeId) === String(approvedTargetReq.employeeId) &&
            r.date === permDate &&
            (r.subType === 'lateness' || r.type === 'late_penalty' || String(r.id).startsWith('req_late_inc_'))
          ) {
            return {
              ...r,
              status: 'approved_permission_exempt',
              isCancelled: true,
              amount: 0,
              deductionMinutes: 0,
              actionType: 'grace',
              cancellationReason: `تم إلغاء الجزاء تلقائياً لوجود إذن معتمد بتاريخ ${permDate}`
            };
          }
          return r;
        });

        // Remove adjustments linked to late penalties on this date
        updatedAdjustments = updatedAdjustments.filter((a) => {
          if (
            String(a.employeeId) === String(approvedTargetReq.employeeId) &&
            a.date === permDate &&
            (a.type === 'penalty' || a.type === 'deduction' || String(a.id).startsWith('adj_pen_') || String(a.id).startsWith('adj_disc_'))
          ) {
            return false;
          }
          return true;
        });
      }

      if (approvedTargetReq.type === 'roster_update' || approvedTargetReq.type === 'roster_edit' || approvedTargetReq.type === 'roster_edit_request') {
        const targetEmp = (state.employees || []).find(e => String(e.id) === String(approvedTargetReq.employeeId));
        const targetBStr = approvedTargetReq.branchId ? String(approvedTargetReq.branchId) : (targetEmp?.branchId ? String(targetEmp.branchId) : '');

        const normalizedSch = normalizeSchedule(approvedTargetReq.schedule || approvedTargetReq.newSchedule);

        const activeRosterObj = {
          id: approvedTargetReq.id || `roster_${Date.now()}`,
          employeeId: approvedTargetReq.employeeId,
          branchId: targetBStr || approvedTargetReq.branchId || null,
          month: approvedTargetReq.month || new Date().toISOString().slice(0, 7),
          fromDate: approvedTargetReq.fromDate,
          toDate: approvedTargetReq.toDate,
          schedule: normalizedSch,
          status: 'approved',
          approvedAt: new Date().toISOString()
        };

        const existingIdx = updatedRosters.findIndex(
          (ros) => String(ros.employeeId) === String(approvedTargetReq.employeeId) && 
                   (ros.month === approvedTargetReq.month || !approvedTargetReq.month || !ros.month) && 
                   (String(ros.branchId || '') === targetBStr || (!ros.branchId && !targetBStr))
        );

        if (existingIdx >= 0) {
          updatedRosters[existingIdx] = activeRosterObj;
        } else {
          updatedRosters = updatedRosters.filter(
            (ros) => !(String(ros.employeeId) === String(approvedTargetReq.employeeId) && String(ros.branchId || '') === targetBStr && (ros.month === approvedTargetReq.month || !targetReq.month || !ros.month))
          );
          updatedRosters.unshift(activeRosterObj);
        }
      }

      let updatedLeaveRequests = [...(state.leaveRequests || [])];
      let updatedLeaveHistory = [...(state.leaveHistory || [])];
      if (approvedTargetReq.type === 'leave' || approvedTargetReq.type === 'leave_request') {
        const approvedLeaveObj = {
          id: approvedTargetReq.id || `leave_${Date.now()}`,
          originalRequestId: approvedTargetReq.id,
          employeeId: approvedTargetReq.employeeId,
          employeeCode: approvedTargetReq.employeeCode,
          employeeName: approvedTargetReq.employeeName,
          leaveType: approvedTargetReq.leaveType || 'annual',
          startDate: approvedTargetReq.startDate || approvedTargetReq.date,
          endDate: approvedTargetReq.endDate || approvedTargetReq.startDate || approvedTargetReq.date,
          daysCount: parseInt(approvedTargetReq.daysCount || approvedTargetReq.days || 1, 10),
          status: 'approved',
          adminApproved: true,
          branchApproved: true,
          reason: approvedTargetReq.reason || approvedTargetReq.details || '',
          approvedAt: new Date().toISOString()
        };

        updatedLeaveRequests = updatedLeaveRequests.map((lr) => {
          if (lr.id === approvedTargetReq.id || (String(lr.employeeId) === String(approvedTargetReq.employeeId) && lr.startDate === approvedTargetReq.startDate)) {
            return { ...lr, ...approvedLeaveObj };
          }
          return lr;
        });

        const existingHistIdx = updatedLeaveHistory.findIndex(lh => lh.id === approvedLeaveObj.id || (String(lh.employeeId) === String(approvedLeaveObj.employeeId) && lh.startDate === approvedLeaveObj.startDate));
        if (existingHistIdx >= 0) {
          updatedLeaveHistory[existingHistIdx] = approvedLeaveObj;
        } else {
          updatedLeaveHistory.unshift(approvedLeaveObj);
        }
      }

      let updatedLateIncidents = [...(state.lateIncidents || [])];

      // Penalty Objection Approval: Cancel violation penalty and remove financial deduction
      if (approvedTargetReq.type === 'penalty_objection' || approvedTargetReq.penaltyId || approvedTargetReq.sourceType === 'late_incident') {
        const targetPenId = approvedTargetReq.penaltyId || String(approvedTargetReq.id).replace(/^obj_(inc|adj|req)_/, '');
        const cleanPenId = String(targetPenId).replace(/^req_/, '');

        // 1. Cancel the penalty in lateIncidents
        updatedLateIncidents = updatedLateIncidents.map((inc) => {
          const incIdStr = String(inc.id);
          const isTarget =
            incIdStr === String(targetPenId) ||
            incIdStr === cleanPenId ||
            incIdStr === `late_inc_${cleanPenId}` ||
            (String(inc.employeeId) === String(approvedTargetReq.employeeId) && inc.date === approvedTargetReq.date);

          if (isTarget) {
            return {
              ...inc,
              status: 'cancelled',
              actionType: 'grace',
              actionLabel: 'سماح (تم قبول التظلم وإلغاء الخصم)',
              deductionMinutes: 0,
              deductionHours: 0,
              penaltyAmount: 0,
              isCancelled: true,
              cancellationReason: 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
              objection: {
                ...(inc.objection || {}),
                status: 'approved',
                resolvedAt: new Date().toISOString()
              }
            };
          }
          return inc;
        });

        // 2. Cancel the penalty in requests
        updatedRequests = updatedRequests.map((r) => {
          const rIdStr = String(r.id);
          const isTarget =
            rIdStr === String(targetPenId) ||
            rIdStr === `req_${cleanPenId}` ||
            rIdStr === cleanPenId ||
            r.penaltyId === targetPenId ||
            r.penaltyId === cleanPenId ||
            (String(r.employeeId) === String(approvedTargetReq.employeeId) && r.date === approvedTargetReq.date && (r.subType === 'lateness' || r.type === 'penalty'));

          if (isTarget && r.id !== approvedTargetReq.id) {
            return {
              ...r,
              status: 'cancelled',
              isCancelled: true,
              cancelledAt: new Date().toISOString(),
              cancelledBy: 'الإدارة العليا',
              cancellationReason: 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
              amount: 0,
              deductionMinutes: 0,
              objection: {
                ...(r.objection || {}),
                status: 'approved',
                resolvedAt: new Date().toISOString()
              }
            };
          }
          return r;
        });

        // 3. Remove any financial adjustment
        updatedAdjustments = updatedAdjustments.filter((a) => {
          const aIdStr = String(a.id);
          if (
            aIdStr === String(targetPenId) ||
            aIdStr === cleanPenId ||
            aIdStr === `adj_${targetPenId}` ||
            aIdStr === `adj_disc_${targetPenId}` ||
            aIdStr === `adj_disc_${cleanPenId}` ||
            a.requestId === targetPenId ||
            a.requestId === cleanPenId
          ) return false;
          if (
            String(a.employeeId) === String(approvedTargetReq.employeeId) &&
            a.date === approvedTargetReq.date &&
            (a.type === 'penalty' || a.type === 'deduction')
          ) return false;
          return true;
        });
      } else if (approvedTargetReq && approvedTargetReq.employeeId && approvedTargetReq.type !== 'loan' && approvedTargetReq.type !== 'advance') {
        try {
          const { incidents, updatedRequests: recalcedRequests } = recalculateEmployeeCycleLateness({
            employeeId: approvedTargetReq.employeeId,
            cycleFilterFn: null,
            state: { ...state, requests: updatedRequests, shifts: updatedShifts, lateIncidents: updatedLateIncidents },
            payrollCycleId: (approvedTargetReq.date || new Date().toISOString()).slice(0, 7)
          });
          if (recalcedRequests) {
            updatedRequests = recalcedRequests;
          }
          const incidentIds = new Set(incidents.map((i) => i.id));
          updatedLateIncidents = [
            ...updatedLateIncidents.filter((i) => !incidentIds.has(i.id) && String(i.employeeId) !== String(approvedTargetReq.employeeId)),
            ...incidents
          ];
        } catch (e) {
          console.error('Error auto-syncing late incidents upon request approval:', e);
        }
      }

      const shiftSwaps = (state.shiftSwaps || []).map((s) =>
        s.id === reqId ? { ...s, status: 'approved', adminApproved: true, branchApproved: true, approvedAt: new Date().toISOString() } : s
      );

      const decisionNotif = createRequestDecisionNotification({
        requestId: approvedTargetReq.id,
        employeeId: approvedTargetReq.employeeId,
        type: approvedTargetReq.type,
        action: 'approved',
        approverRole: 'admin',
        title: approvedTargetReq.type === 'penalty_objection' ? '✅ تم قبول تظلمك وإلغاء الجزاء' : undefined,
        message: approvedTargetReq.type === 'penalty_objection' ? 'تم قبول تظلمك من قِبل الإدارة العليا وإلغاء الجزاء والخصم المالي' : undefined,
        details: approvedTargetReq.details || approvedTargetReq.reason || (approvedTargetReq.amount ? `${approvedTargetReq.amount} ج.م` : '')
      });

      const updatedNotifications = [
        decisionNotif,
        ...(state.notifications || []).map(n => String(n.requestId) === String(reqId) ? { ...n, read: true } : n)
      ];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        loans: updatedLoans,
        rosters: updatedRosters,
        adjustments: updatedAdjustments,
        shifts: updatedShifts,
        leaveRequests: updatedLeaveRequests,
        leaveHistory: updatedLeaveHistory,
        shiftSwaps,
        lateIncidents: updatedLateIncidents,
        notifications: updatedNotifications
      };
      if (setState) setState(updatedState);
      showToast?.('✅ تم اعتماد موافقة الطلب وتطبيق التأثير فوراً على الأجور والجداول');
      if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error:', err));
      }

      if (approvedTargetReq.type === 'تأكيد بصمة الوجه' || approvedTargetReq.type === 'تأكيد بصمة اليد') {
        const empId = approvedTargetReq.employeeId;
        const actionType = approvedTargetReq.targetAction;

        if (actionType === 'shift_start' && startShift) startShift(empId, 'admin');
        else if (actionType === 'break_start' && pauseShift) pauseShift(empId, 'admin');
        else if (actionType === 'break_end' && resumeShift) resumeShift(empId, 'admin');
        else if (actionType === 'shift_end' && stopShift) stopShift(empId, 'admin');
      }
    };

    if (effectiveRole === 'admin' || effectiveRole === 'owner') {
      if (targetReq.type === 'loan' || targetReq.type === 'advance' || targetReq.type === 'meds' || targetReq.type === 'credit_medicine') {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveLoans',
          actionTitle: `اعتماد طلب سلفة / أدوية آجل (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `المبلغ: ${targetReq.amount || targetReq.totalAmount} ج.م`,
          onExecute: performApprove
        });
        return;
      }
      if (targetReq.type === 'bonus' || targetReq.type === 'penalty' || targetReq.type === 'early_exit') {
        executeWithOwnerGuard?.({
          lockKey: 'lockDirectBonusDeduction',
          actionTitle: `اعتماد تسوية مالية (${targetReq.type === 'bonus' ? 'مكافأة' : 'خصم/جزاء'})`,
          actionDetails: `الموظف: ${targetReq.employeeName || targetReq.employeeId}`,
          onExecute: performApprove
        });
        return;
      }
    }

    performApprove();
  };

  const handleReject = async (reqId) => {
    let targetReq = (state.requests || []).find((r) => r.id === reqId) ||
                    (state.leaveRequests || []).find((r) => r.id === reqId) ||
                    (state.shiftSwaps || []).find((r) => r.id === reqId) ||
                    (state.loans || []).find((r) => r.id === reqId) ||
                    allRequests.find((r) => r.id === reqId);

    let rejectedTargetReq = targetReq ? { ...targetReq, status: 'rejected', adminApproved: false, rejectedAt: new Date().toISOString() } : null;

    let updatedRequests = [...(state.requests || [])];
    const rIdx = updatedRequests.findIndex((r) => r.id === reqId);
    if (rIdx >= 0) {
      updatedRequests[rIdx] = rejectedTargetReq;
    } else if (rejectedTargetReq) {
      updatedRequests.unshift(rejectedTargetReq);
    }

    let updatedLateIncidents = [...(state.lateIncidents || [])];
    let updatedAdjustments = [...(state.adjustments || [])];

    if (rejectedTargetReq && (rejectedTargetReq.type === 'penalty_objection' || rejectedTargetReq.penaltyId || rejectedTargetReq.sourceType === 'late_incident')) {
      const targetPenId = rejectedTargetReq.penaltyId || String(rejectedTargetReq.id).replace(/^obj_(inc|adj|req)_/, '');
      const cleanPenId = String(targetPenId).replace(/^req_/, '');

      updatedLateIncidents = updatedLateIncidents.map((inc) => {
        const incIdStr = String(inc.id);
        const isTarget =
          incIdStr === String(targetPenId) ||
          incIdStr === cleanPenId ||
          incIdStr === `late_inc_${cleanPenId}` ||
          (String(inc.employeeId) === String(rejectedTargetReq.employeeId) && inc.date === rejectedTargetReq.date);

        if (isTarget) {
          return {
            ...inc,
            status: 'approved',
            objection: {
              ...(inc.objection || {}),
              status: 'rejected',
              resolvedAt: new Date().toISOString()
            }
          };
        }
        return inc;
      });

      updatedRequests = updatedRequests.map((r) => {
        const rIdStr = String(r.id);
        const isTarget =
          rIdStr === String(targetPenId) ||
          rIdStr === `req_${cleanPenId}` ||
          rIdStr === cleanPenId ||
          r.penaltyId === targetPenId ||
          r.penaltyId === cleanPenId ||
          (String(r.employeeId) === String(rejectedTargetReq.employeeId) && r.date === rejectedTargetReq.date && (r.subType === 'lateness' || r.type === 'penalty'));

        if (isTarget && r.id !== rejectedTargetReq.id) {
          return {
            ...r,
            objection: {
              ...(r.objection || {}),
              status: 'rejected',
              resolvedAt: new Date().toISOString()
            }
          };
        }
        return r;
      });

      updatedAdjustments = updatedAdjustments.map((a) => {
        if (String(a.id) === String(targetPenId) || String(a.id) === String(rejectedTargetReq.penaltyId)) {
          return {
            ...a,
            objection: {
              ...(a.objection || {}),
              status: 'rejected',
              resolvedAt: new Date().toISOString()
            }
          };
        }
        return a;
      });
    }

    let updatedShifts = [...(state.shifts || [])];
    if (rejectedTargetReq && rejectedTargetReq.type === 'overtime') {
      updatedShifts = updatedShifts.map((s) => {
        if (s.id === rejectedTargetReq.shiftId || (String(s.employeeId) === String(rejectedTargetReq.employeeId) && s.date === rejectedTargetReq.date)) {
          const regHours = s.regularHours !== undefined ? s.regularHours : (s.scheduledHours || 8);
          return {
            ...s,
            overtimeStatus: 'rejected',
            adminApproved: false,
            note: `ساعات الوردية الأساسية (${regHours} س) — تم استبعاد الإضافي (${rejectedTargetReq.hours} س) بواسطة الإدارة`
          };
        }
        return s;
      });
    }

    const updatedLeaveRequests = (state.leaveRequests || []).map((lr) =>
      lr.id === reqId || (rejectedTargetReq && String(lr.employeeId) === String(rejectedTargetReq.employeeId) && lr.startDate === rejectedTargetReq.startDate)
        ? { ...lr, status: 'rejected', adminApproved: false }
        : lr
    );

    const updatedShiftSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === reqId ? { ...s, status: 'rejected', adminApproved: false } : s
    );

    const decisionNotif = createRequestDecisionNotification({
      requestId: rejectedTargetReq?.id || reqId,
      employeeId: rejectedTargetReq?.employeeId,
      type: rejectedTargetReq?.type,
      action: 'rejected',
      approverRole: 'admin',
      title: rejectedTargetReq?.type === 'penalty_objection' ? '❌ تم رفض التظلم وتثبيت الجزاء' : undefined,
      message: rejectedTargetReq?.type === 'penalty_objection' ? 'تمت دراسة التظلم ورؤي عدم كفاية المبررات وتثبيت القرار التأديبي' : undefined,
      details: rejectedTargetReq?.reason || rejectedTargetReq?.details || ''
    });

    const updatedNotifications = [
      decisionNotif,
      ...(state.notifications || []).map((n) =>
        String(n.requestId) === String(reqId) ? { ...n, read: true } : n
      )
    ];

    const updatedState = {
      ...state,
      requests: updatedRequests,
      lateIncidents: updatedLateIncidents,
      adjustments: updatedAdjustments,
      shifts: updatedShifts,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedShiftSwaps,
      notifications: updatedNotifications
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
    showToast?.('🛡️ تم إعفاء الموظف من الخصم المالي بنجاح');
    if (saveState) {
      saveState(updatedState).catch(err => console.error('Background save error:', err));
    }
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

  const handleDeleteSingleRequest = async (reqId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً من سجلات النظام بالكامل؟')) return;
    const idStr = String(reqId);
    const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
    const updatedDeleted = Array.from(new Set([
      ...(state._deletedIds || []),
      idStr,
      rawId,
      `req_${idStr}`,
      `req_${rawId}`,
      `leave_${idStr}`,
      `leave_${rawId}`,
      `swap_${idStr}`,
      `swap_${rawId}`,
      `res_${idStr}`,
      `res_${rawId}`,
      `loan_${idStr}`,
      `loan_${rawId}`,
      `notif_${idStr}`,
      `notif_${rawId}`
    ])).filter(Boolean).slice(-5000);

    const matchesId = (item) => {
      if (!item) return false;
      const itemIdStr = String(item.id || '');
      const itemRaw = itemIdStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
      return itemIdStr === idStr || itemIdStr === rawId || itemRaw === idStr || (rawId && itemRaw === rawId) || (item.originalRequestId && (String(item.originalRequestId) === idStr || String(item.originalRequestId) === rawId));
    };

    const updatedState = {
      ...state,
      requests: (state.requests || []).filter((r) => !matchesId(r)),
      leaveRequests: (state.leaveRequests || []).filter((r) => !matchesId(r)),
      shiftSwaps: (state.shiftSwaps || []).filter((r) => !matchesId(r)),
      loans: (state.loans || []).filter((r) => !matchesId(r)),
      resignationRequests: (state.resignationRequests || []).filter((r) => !matchesId(r)),
      leaveHistory: (state.leaveHistory || []).filter((r) => !matchesId(r)),
      notifications: (state.notifications || []).filter((n) => !matchesId(n) && String(n.requestId || '') !== idStr && String(n.requestId || '') !== rawId),
      _deletedIds: updatedDeleted
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (previewModalReq?.id === reqId || matchesId(previewModalReq)) setPreviewModalReq(null);
    showToast?.('🗑️ تم حذف الطلب نهائياً بنجاح');
  };

  const handleApprovePenaltyObjection = async (reqId) => {
    const performApproveObjection = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDirectBonusDeduction',
        actionTitle: 'قبول اعتراض وإلغاء جزاء مالي',
        actionDetails: 'إلغاء الخصم المالي للجزاء من راتب الموظف',
        onExecute: performApproveObjection
      });
    } else {
      await performApproveObjection();
    }
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

  const handleReplyObjection = async (reqId, reply, isAccepted) => {
    const updatedRequests = requests.map((r) => {
      if (r.id === reqId) {
        return {
          ...r,
          objection: {
            ...r.objection,
            status: isAccepted ? 'accepted' : 'rejected',
            adminReply: reply,
            repliedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedState = { ...state, requests: updatedRequests };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (previewModalReq?.id === reqId) {
      setPreviewModalReq(prev => ({
        ...prev,
        objection: { ...prev.objection, status: isAccepted ? 'accepted' : 'rejected', adminReply: reply }
      }));
    }
    showToast?.(isAccepted ? '✅ تم قبول الاعتراض وإلغاء الجزاء' : '❌ تم رفض الاعتراض وتثبيت الجزاء');
  };

  // 1. Clear / Hide requests from Higher Management screen ONLY (Does NOT affect Employee or Branch Manager screens)
  const handleClearAdminViewOnly = async () => {
    if (visibleAdminRequests.length === 0) {
      alert('لا توجد أي طلبات ظاهرة حالياً لمسحها من شاشة الإدارة');
      return;
    }
    const isConfirmed = window.confirm(
      `🧹 تأكيد تفريغ شاشة الإدارة العليا (${visibleAdminRequests.length} طلب):\n\nهل تريد مسح وإخفاء هذه الطلبات من شاشة الإدارة العليا فقط لترتيب وتنظيف الشاشة؟\n\n✅ ملاحظة هامة:\n1. لن يتم حذف الطلبات نهائياً من النظام، وتظل محفوظة في سجلات الموظف والفرع.\n2. يمكنك في أي وقت الضغط على زر "عرض المؤرشف" لاستعادتها أو معاينتها.`
    );
    if (!isConfirmed) return;

    const visibleIds = new Set(visibleAdminRequests.map((r) => String(r.id)));

    const hideItem = (item) => {
      if (item && item.id && visibleIds.has(String(item.id))) {
        return { ...item, hiddenFromAdmin: true };
      }
      return item;
    };

    const updatedState = {
      ...state,
      requests: (state.requests || []).map(hideItem),
      leaveRequests: (state.leaveRequests || []).map(hideItem),
      shiftSwaps: (state.shiftSwaps || []).map(hideItem),
      loans: (state.loans || []).map(hideItem),
      resignationRequests: (state.resignationRequests || []).map(hideItem)
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🧹 تم مسح وإخفاء الطلبات من شاشة الإدارة العليا بنجاح');
  };

  // Restore Hidden Requests in Higher Management screen
  const handleRestoreAdminView = async () => {
    const unhideItem = (item) => (item ? { ...item, hiddenFromAdmin: false } : item);

    const updatedState = {
      ...state,
      requests: (state.requests || []).map(unhideItem),
      leaveRequests: (state.leaveRequests || []).map(unhideItem),
      shiftSwaps: (state.shiftSwaps || []).map(unhideItem),
      loans: (state.loans || []).map(unhideItem),
      resignationRequests: (state.resignationRequests || []).map(unhideItem)
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    setShowHiddenAdminRequests(false);
    showToast?.('↩️ تم استعادة كافة الطلبات للظهور في شاشة الإدارة العليا');
  };

  // 2. Clear / Delete Requests List from the ENTIRE system permanently
  const handleClearAllRequests = async () => {
    const currentReqs = allRequests || [];
    if (currentReqs.length === 0) {
      alert('لا توجد أي طلبات حالياً في النظام لمسحها');
      return;
    }
    const isConfirmed = window.confirm(
      `⚠️ تحذير: مسح السجل العام لكافة الطلبات:\n\nهل تريد حذف كافة الطلبات (${currentReqs.length} طلب) نهائياً من النظام بالكامل لجميع الشاشات؟\n\n(ملاحظة: إذا كنت ترغب في تفريغ شاشة الإدارة العليا فقط دون التأثير على الموظف والفرع، اضغط Cancel واستخدم زر "مسح شاشة الإدارة فقط").`
    );
    if (!isConfirmed) return;

    const performClearAllRequests = async () => {
      // 1. استخراج وأرشفة كافة الإجازات المعتمدة في leaveHistory لضمان عدم تصفير رصيد الإجازات المأخوذة
      const existingLeaveHistory = state.leaveHistory || [];
      const leaveMap = new Map();
      existingLeaveHistory.forEach(lh => { if (lh && lh.id) leaveMap.set(String(lh.id), lh); });

      // فحص كافة الطلبات قبل مسحها وحفظ المعتمد منها في الأرشيف الدائم
      const allCandidateLeaves = [...(state.leaveRequests || []), ...(state.requests || []), ...currentReqs];
      allCandidateLeaves.forEach((r) => {
        if (!r) return;
        const isLeave = r.type === 'leave' || r.type === 'leave_request' || r.leaveType || r.type === 'annual_leave';
        const isApproved = r.status === 'approved' || r.adminApproved;
        if (isLeave && isApproved) {
          const leaveId = r.id || `lhist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const archivedLeave = {
            ...r,
            id: leaveId,
            status: 'approved',
            adminApproved: true,
            archivedAt: r.archivedAt || new Date().toISOString()
          };
          leaveMap.set(String(leaveId), archivedLeave);
        }
      });
      const updatedLeaveHistory = Array.from(leaveMap.values());
      const preservedLeaveIds = new Set(updatedLeaveHistory.map(lh => String(lh.id)));

      // 2. استخراج وأرشفة الاستئذانات المعتمدة لضمان عدم إلغاء الإعفاءات
      const existingPermissions = state.permissions || [];
      const permMap = new Map();
      existingPermissions.forEach(p => { if (p && p.id) permMap.set(String(p.id), p); });

      allCandidateLeaves.forEach((r) => {
        if (!r) return;
        const isPerm = r.type === 'permission' || r.type === 'late_permission' || r.type === 'early_leave' || r.type === 'إذن';
        const isApproved = r.status === 'approved' || r.adminApproved;
        if (isPerm && isApproved) {
          const permId = r.id || `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const archivedPerm = {
            ...r,
            id: permId,
            status: 'approved',
            adminApproved: true,
            archivedAt: r.archivedAt || new Date().toISOString()
          };
          permMap.set(String(permId), archivedPerm);
        }
      });
      const updatedPermissions = Array.from(permMap.values());
      const preservedPermIds = new Set(updatedPermissions.map(p => String(p.id)));

      // 3. الحفاظ على السلف المالية المعتمدة
      const reqLoanIds = new Set(currentReqs.filter(r => r.type === 'loan' || r.type === 'advance' || r.type === 'meds' || r.type === 'credit_medicine').map(r => String(r.id)));
      const updatedLoans = state.loans || [];
      const preservedLoanIds = new Set(updatedLoans.map(ln => String(ln.id)));

      // 4. بناء قائمة المعرفات المحذوفة مع حماية الإجازات والاستئذانات والسلف المحفوظة
      const allDeletedKeys = [];
      const allReqIdsSet = new Set();

      currentReqs.forEach((r) => {
        if (r && r.id) {
          const idStr = String(r.id);
          // إذا كان الطلب معتمداً وتم حفظه في الإجازات أو الاستئذانات أو السلف، لا نضيفه لـ _deletedIds
          if (preservedLeaveIds.has(idStr) || preservedPermIds.has(idStr) || preservedLoanIds.has(idStr)) {
            return;
          }
          const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
          allReqIdsSet.add(idStr);
          if (rawId) allReqIdsSet.add(rawId);
          allDeletedKeys.push(
            idStr,
            rawId,
            `req_${idStr}`,
            `req_${rawId}`,
            `swap_${idStr}`,
            `swap_${rawId}`,
            `res_${idStr}`,
            `res_${rawId}`,
            `notif_${idStr}`,
            `notif_${rawId}`
          );
        }
      });

      const updatedDeleted = Array.from(new Set([...(state._deletedIds || []), ...allDeletedKeys])).filter(Boolean).slice(-5000);

      // 5. ربط الإجازات المعتمدة بملفات الموظفين
      const updatedEmployees = (state.employees || []).map(emp => {
        const empApprovedLeaves = updatedLeaveHistory.filter(lh =>
          String(lh.employeeId) === String(emp.id) || (emp.code && String(lh.employeeCode) === String(emp.code))
        );
        return {
          ...emp,
          leaveHistory: empApprovedLeaves
        };
      });

      const updatedState = {
        ...state,
        employees: updatedEmployees,
        requests: [],
        leaveRequests: [],
        shiftSwaps: [],
        loans: updatedLoans,
        leaveHistory: updatedLeaveHistory,
        permissions: updatedPermissions,
        resignationRequests: [],
        notifications: (state.notifications || []).filter(n => !n.requestId || (!allReqIdsSet.has(String(n.requestId)) && !allReqIdsSet.has(String(n.id)))),
        _deletedIds: updatedDeleted
      };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('🗑️ تم مسح وتفريغ قائمة الطلبات بنجاح مع الاحتفاظ التام برصيد وسجلات الإجازات والاستئذانات المعتمدة!');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockFactoryReset',
        actionTitle: 'مسح وحذف سجل الطلبات العام نهائياً',
        actionDetails: `إجمالي الطلبات المراد حذفها: ${currentReqs.length} طلب`,
        onExecute: performClearAllRequests
      });
    } else {
      await performClearAllRequests();
    }
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Button: Instant Cloud Sync & Refresh */}
          <button
            type="button"
            className="btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            style={{
              background: isRefreshing ? 'var(--surface-muted)' : '#059669',
              color: '#ffffff',
              border: '1px solid #047857',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '800',
              borderRadius: '8px',
              cursor: isRefreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              transition: 'all 0.2s ease'
            }}
            title="تحديث ومزامنة أحدث الطلبات من قاعدة البيانات السحابية فوراً"
          >
            <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s ease' }}>🔄</span>
            <span>{isRefreshing ? 'جاري المزامنة...' : 'تحديث الطلبات'}</span>
          </button>

          {/* Button: Toggle Hidden/Archived Requests */}
          {hiddenAdminCount > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => setShowHiddenAdminRequests(!showHiddenAdminRequests)}
              style={{
                background: showHiddenAdminRequests ? '#8b5cf6' : '#f5f3ff',
                color: showHiddenAdminRequests ? '#ffffff' : '#6d28d9',
                border: '1px solid #c4b5fd',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: '800',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{showHiddenAdminRequests ? '👁️‍🗨️ إخفاء المؤرشف' : '👁️ عرض المؤرشف'}</span>
              <span style={{ background: 'rgba(0,0,0,0.15)', padding: '2px 7px', borderRadius: '99px', fontSize: '11px' }}>
                {hiddenAdminCount}
              </span>
            </button>
          )}

          {/* Button 1: Clear Admin View Only (New Requested Button) */}
          <button
            type="button"
            className="btn"
            onClick={handleClearAdminViewOnly}
            disabled={visibleAdminRequests.length === 0}
            style={{
              background: visibleAdminRequests.length > 0 ? '#2563eb' : 'var(--surface-muted)',
              color: visibleAdminRequests.length > 0 ? '#ffffff' : 'var(--muted)',
              border: '1px solid ' + (visibleAdminRequests.length > 0 ? '#1d4ed8' : 'var(--border)'),
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '800',
              borderRadius: '8px',
              cursor: visibleAdminRequests.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: visibleAdminRequests.length > 0 ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
            title="مسح وتفريغ الطلبات من شاشة الإدارة العليا فقط دون حذفها أو التأثير على شاشة الموظف أو مدير الفرع"
          >
            <span>🧹 مسح شاشة الإدارة فقط</span>
            <span style={{
              background: visibleAdminRequests.length > 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)',
              padding: '2px 7px',
              borderRadius: '99px',
              fontSize: '11px'
            }}>
              {visibleAdminRequests.length}
            </span>
          </button>

          {/* Button 2: Clear Entire System Requests List */}
          <button
            type="button"
            className="btn"
            onClick={handleClearAllRequests}
            disabled={allRequests.length === 0}
            style={{
              background: allRequests.length > 0 ? '#ef4444' : 'var(--surface-muted)',
              color: allRequests.length > 0 ? '#ffffff' : 'var(--muted)',
              border: '1px solid ' + (allRequests.length > 0 ? '#dc2626' : 'var(--border)'),
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '800',
              borderRadius: '8px',
              cursor: allRequests.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: allRequests.length > 0 ? '0 2px 8px rgba(239, 68, 68, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
            title="مسح وتفريغ السجل العام للطلبات نهائياً من كافة شاشات النظام"
          >
            <span>🗑️ مسح السجل العام للطلبات</span>
            <span style={{
              background: allRequests.length > 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)',
              padding: '2px 7px',
              borderRadius: '99px',
              fontSize: '11px'
            }}>
              {allRequests.length}
            </span>
          </button>

          {/* Toggle / Restore Hidden Requests if any */}
          {hiddenAdminCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowHiddenAdminRequests(!showHiddenAdminRequests)}
              style={{
                fontSize: '12px',
                fontWeight: '700',
                padding: '6px 12px',
                color: showHiddenAdminRequests ? '#2563eb' : 'var(--muted)',
                border: '1px dashed var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="عرض أو إخفاء الطلبات التي تم مسحها من شاشة الإدارة سابقاً"
            >
              <span>{showHiddenAdminRequests ? '👁️ إخفاء الممسوح من الإدارة' : `👁️ عرض الممسوح من الإدارة (${hiddenAdminCount})`}</span>
            </button>
          )}

          {hiddenAdminCount > 0 && showHiddenAdminRequests && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleRestoreAdminView}
              style={{
                fontSize: '11px',
                fontWeight: '700',
                padding: '5px 10px',
                color: '#10b981',
                border: '1px solid #10b981',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              title="إعادة كافة الطلبات الممسوحة للظهور في شاشة الإدارة"
            >
              ↩️ استعادة للظهور دائماً
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '14px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>👤 الموظف:</label>
          <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}>
            <option value="all">-- جميع الموظفين --</option>
            {employees.filter(isEmployeeActive).map((e) => (
              <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code})</option>
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
            <option value="penalty_objection">✋ تظلمات الجزاءات واللائحة</option>
            <option value="leave">🏖️ إجازات (&lt;= 3 أيام)</option>
            <option value="long_leave">🏖️ إجازات أكثر من 3 أيام</option>
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
                          📅 {formatDateStr(getRequestDate(req))}
                        </span>
                        <span style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '12px' }}>
                          ⏰ {getRequestTime(req)}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: '800' }}>
                      {(() => {
                        const emp = employees.find(e => e.id === req.employeeId || e.code === req.employeeCode);
                        return emp ? getEmpDisplayName(emp) : (req.employeeName || 'موظف');
                      })()}
                    </td>
                    <td>{getFormattedRequestBadge(req.type, req.leaveType)}</td>
                    <td>
                      {(() => {
                        const emp = employees.find(e => e.id === req.employeeId || e.code === req.employeeCode);
                        const effectiveBranchId = req.branchId || emp?.branchesDetails?.[0]?.branchId || emp?.branchId;
                        const isDirectAdmin = req.targetApproval === 'admin_only' ||
                          req.targetApproval === 'admin' ||
                          ['loan', 'advance', 'credit_medicine', 'eval_edit_request', 'complaint', 'penalty_objection', 'objection'].includes(req.type) ||
                          req.branchNotRequired ||
                          req.isDirectToAdmin ||
                          shouldRouteDirectToAdmin(emp, effectiveBranchId, state) ||
                          isBranchWithoutManager(effectiveBranchId, state);

                        if (req.type === 'disciplinary_penalty' || req.createdRole === 'branch' || req.createdRole === 'branch_manager' || req.submittedByBranchManager || req.branchApprovalStatus === 'approved') {
                          return (
                            <span style={{ color: '#15803d', fontWeight: '800', background: '#f0fdf4', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '12px' }}>
                              ✓ مرسل من مدير الفرع
                            </span>
                          );
                        }
                        if (isDirectAdmin) {
                          return (
                            <span style={{ color: 'var(--muted)', fontSize: '12px', background: 'rgba(148, 163, 184, 0.14)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', border: '1px solid var(--border)' }}>
                              🔒 غير موجهة لمدير الفرع
                            </span>
                          );
                        }
                        if (req.branchApproved) {
                          return <span style={{ color: '#16a34a', fontWeight: '700' }}>🟢 معتمد من الفرع</span>;
                        }
                        return <span style={{ color: '#d97706', fontWeight: '700' }}>⏳ بانتظار الفرع</span>;
                      })()}
                    </td>
                    <td>
                      {(req.status === 'approved' || req.adminApproved === true || req.status === 'paid' || req.status === 'partial') ? (
                        <span className="approval-status-badge approved">
                          {parseFloat(req.paidAmount) >= (parseFloat(req.amount || req.totalAmount) || 0) && (parseFloat(req.amount || req.totalAmount) || 0) > 0
                            ? '🟢 مسدد بالكامل'
                            : (parseFloat(req.paidAmount) > 0 ? '🟢 سلفة معتمدة (سداد جزئي)' : '🟢 معتمد نهائياً')}
                        </span>
                      ) : req.status === 'pending_admin' ? (
                        <span className="approval-status-badge pending">🟡 قيد اعتماد الإدارة العليا</span>
                      ) : req.status === 'rejected' ? (
                        <span className="approval-status-badge rejected">🔴 مرفوض</span>
                      ) : req.status === 'cancelled' ? (
                        <span className="approval-status-badge cancelled">⚪ ملغي</span>
                      ) : (
                        <span className="approval-status-badge pending">⏳ قيد المراجعة</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '12px', border: '1px solid var(--border)' }}
                          onClick={() => handleOpenPreview(req)}
                        >
                          👁️ معاينة الطلب
                        </button>

                        {req.status !== 'approved' && req.status !== 'paid' && req.status !== 'partial' && !req.adminApproved && req.status !== 'cancelled' && (
                          <button
                            className="btn btn-start"
                            style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => handleApprove(req.id)}
                          >
                            ✓ موافقة
                          </button>
                        )}

                        {req.status !== 'rejected' && req.status !== 'cancelled' && !req.adminApproved && req.status !== 'approved' && req.status !== 'paid' && req.status !== 'partial' && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                            onClick={() => handleReject(req.id)}
                          >
                            ✕ رفض
                          </button>
                        )}

                        <button
                          className="del-btn"
                          style={{ padding: '4px 8px', fontSize: '11.5px' }}
                          title="حذف الطلب نهائياً من السجل"
                          onClick={() => handleDeleteSingleRequest(req.id)}
                        >
                          🗑️ حذف
                        </button>
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
        const empObj = employees.find(e => String(e.id) === String(previewModalReq.employeeId) || (previewModalReq.employeeCode && String(e.code) === String(previewModalReq.employeeCode)));
        const branches = state.branches || [];
        const effectiveReqBranchId = previewModalReq.branchId || empObj?.branchesDetails?.[0]?.branchId || empObj?.branchId;
        const branchObj = branches.find(b => String(b.id) === String(effectiveReqBranchId) || String(b.branchCode) === String(effectiveReqBranchId) || b.name === effectiveReqBranchId);
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
        const isDisciplinaryViolation = previewModalReq.type === 'disciplinary_penalty' ||
          previewModalReq.type === 'violation' ||
          previewModalReq.subType === 'disciplinary_penalty' ||
          String(previewModalReq.id || '').startsWith('disc_');
        const isPenalty = previewModalReq.type === 'penalty' || isDisciplinaryViolation;
        const isPenaltyObjection = previewModalReq.type === 'penalty_objection' || previewModalReq.type === 'objection' || Boolean(previewModalReq.penaltyId) || Boolean(previewModalReq.objection);
        const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request'].includes(previewModalReq.type);
        const isComplaint = ['complaint', 'eval_edit_request'].includes(previewModalReq.type);

        const totalAmount = parseFloat(previewModalReq.amount) || 0;
        const monthlyDed = parseFloat(previewModalReq.monthlyDeduction || previewModalReq.installmentAmount) || 0;
        const isInstallment = previewModalReq.loanType === 'installments' || previewModalReq.isInstallment || (monthlyDed > 0 && monthlyDed < totalAmount) || (parseInt(previewModalReq.installmentsCount, 10) > 1);
        const installmentsCount = previewModalReq.installmentsCount || previewModalReq.monthsCount || (monthlyDed > 0 ? Math.ceil(totalAmount / monthlyDed) : 1);

        const isBranchNotReq = previewModalReq.targetApproval === 'admin_only' ||
          previewModalReq.targetApproval === 'admin' ||
          isLoan ||
          isComplaint ||
          isPenaltyObjection ||
          previewModalReq.branchNotRequired ||
          previewModalReq.isDirectToAdmin ||
          shouldRouteDirectToAdmin(empObj, effectiveReqBranchId, state) ||
          isBranchWithoutManager(effectiveReqBranchId, state);

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
                        {empObj ? getEmpDisplayName(empObj) : (previewModalReq.employeeName || 'غير معروف')}
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
                        🏢 {branchObj?.name ? (branchObj.name.startsWith('فرع') ? branchObj.name : `فرع ${branchObj.name}`) : (previewModalReq.branchName || empObj?.branchName || 'الفرع الرئيسي')}
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

                {/* ── LOAN / ADVANCE / MEDS DETAILS (مع إمكانية تعديل الإدارة العليا قبل الاعتماد) ── */}
                {isLoan && (
                  <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#1e40af', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        💳 تفاصيل السلفة / الدواء الآجل المطلوب:
                      </h4>
                      {previewModalReq.status !== 'approved' && previewModalReq.status !== 'rejected' && (
                        <button
                          type="button"
                          className="btn"
                          style={{
                            padding: '5px 12px',
                            fontSize: '12px',
                            background: isEditingLoan ? '#2563eb' : '#fff',
                            color: isEditingLoan ? '#fff' : '#1d4ed8',
                            border: '1px solid #93c5fd',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          onClick={() => setIsEditingLoan(!isEditingLoan)}
                        >
                          {isEditingLoan ? '✕ إلغاء التعديل واستعادة الطلب الأصلي' : '✏️ تعديل مبلغ أو أقساط السلفة قبل الاعتماد'}
                        </button>
                      )}
                    </div>

                    {/* Summary Card */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: isEditingLoan ? '14px' : '0' }}>
                      <div style={{ background: '#dbeafe', padding: '10px 14px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                        <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 'bold' }}>المبلغ المطلوب من الموظف:</span>
                        <div style={{ fontWeight: '900', color: '#1d4ed8', fontSize: '17px' }}>
                          💰 {previewModalReq.originalAmount || previewModalReq.amount || previewModalReq.totalAmount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>نظام السداد المطلوب:</span>
                        <div style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '13.5px' }}>
                          {isInstallment ? '📆 سلفة مقسطة على عدة شهور' : '💵 سلفة شهرية (خصم دفعة واحدة)'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#1e40af' }}>عدد الأقساط:</span>
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

                    {/* Medicines Detail Table if Credit Medicine */}
                    {(() => {
                      const medItemsList = previewModalReq.medicines || previewModalReq.medsItems || previewModalReq.items || previewModalReq.medsDetails || [];
                      if (medItemsList.length === 0) return null;

                      return (
                        <div style={{ marginTop: '14px', background: '#fff', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #0d9488', boxShadow: '0 2px 5px rgba(13,148,136,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <h5 style={{ margin: 0, color: '#0f766e', fontSize: '13.5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>💊</span>
                              <span>بيان وقائمة الأصناف والأدوية المطلوبة بالآجل ({medItemsList.length} صنف):</span>
                            </h5>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f766e', background: '#ccfbf1', padding: '3px 10px', borderRadius: '6px' }}>
                              إجمالي تكلفة الأصناف: {fmt(previewModalReq.totalAmount || previewModalReq.amount || totalAmount)} ج.م
                            </span>
                          </div>
                          <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                              <thead>
                                <tr style={{ background: '#f0fdfa', color: '#134e4a', fontWeight: 'bold' }}>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '6%' }}>#</th>
                                  <th style={{ padding: '6px 12px', border: '1px solid #99f6e4', width: '42%', textAlign: 'right' }}>اسم الدواء / الصنف</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '18%' }}>سعر الوحدة</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '14%' }}>الكمية</th>
                                  <th style={{ padding: '6px', border: '1px solid #99f6e4', width: '20%' }}>الإجمالي الصافي</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medItemsList.map((item, idx) => {
                                  const itemPrice = parseFloat(item.price) || 0;
                                  const itemQty = parseFloat(item.qty || item.quantity) || 1;
                                  const itemTotal = itemPrice * itemQty;
                                  return (
                                    <tr key={item.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f0fdfa' }}>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{idx + 1}</td>
                                      <td style={{ padding: '6px 12px', border: '1px solid #99f6e4', textAlign: 'right', fontWeight: 'bold', color: '#0f766e' }}>
                                        {item.name || item.title || 'دواء / صنف'}
                                      </td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4' }}>{fmt(itemPrice)} ج.م</td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold' }}>{itemQty}</td>
                                      <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: 'bold', color: '#0d9488' }}>
                                        {fmt(itemTotal)} ج.م
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: '#ccfbf1', fontWeight: 'bold', color: '#0f766e', fontSize: '12.5px' }}>
                                  <td colSpan="4" style={{ padding: '6px 12px', border: '1px solid #99f6e4', textAlign: 'right' }}>
                                    المجموع الكلي المطلوب للأدوية:
                                  </td>
                                  <td style={{ padding: '6px', border: '1px solid #99f6e4', fontWeight: '900', color: '#0f766e' }}>
                                    {fmt(previewModalReq.totalAmount || previewModalReq.amount || totalAmount)} ج.م
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Badge if Modified by Admin */}
                    {previewModalReq.adminModified && (
                      <div style={{ marginTop: '12px', background: '#fef3c7', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: '#92400e' }}>
                        <strong>⚠️ قرار وتعديل الإدارة العليا: </strong>
                        تم تعديل المبلغ المعتمد إلى <strong>{previewModalReq.amount} ج.م</strong>
                        {previewModalReq.adminNotes && ` — (${previewModalReq.adminNotes})`}
                      </div>
                    )}

                    {/* Interactive Admin Edit Form */}
                    {isEditingLoan && (
                      <div style={{ marginTop: '14px', background: '#fff', border: '2px solid #3b82f6', padding: '14px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: '#1e40af', fontWeight: 'bold', fontSize: '13.5px' }}>
                          <span>✏️</span>
                          <span>لوحة تعديل وتخصيص السلفة المعتمدة من الإدارة العليا:</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                              المبلغ المعتمد النهائي (ج.م) *
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={loanCustomAmount}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLoanCustomAmount(val);
                                if (loanCustomType === 'installment' && parseInt(loanCustomMonths, 10) > 1 && val) {
                                  setLoanCustomMonthlyDed(String(Math.ceil(parseFloat(val) / parseInt(loanCustomMonths, 10))));
                                } else {
                                  setLoanCustomMonthlyDed(val);
                                }
                              }}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1.5px solid #3b82f6', fontWeight: 'bold', fontSize: '14px', color: '#1e40af', background: '#f0f7ff' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                              نظام السداد والخصم
                            </label>
                            <select
                              value={loanCustomType}
                              onChange={(e) => {
                                const t = e.target.value;
                                setLoanCustomType(t);
                                if (t === 'monthly') {
                                  setLoanCustomMonths('1');
                                  setLoanCustomMonthlyDed(loanCustomAmount);
                                } else {
                                  const m = loanCustomMonths === '1' ? '2' : loanCustomMonths;
                                  setLoanCustomMonths(m);
                                  if (loanCustomAmount) {
                                    setLoanCustomMonthlyDed(String(Math.ceil(parseFloat(loanCustomAmount) / parseInt(m, 10))));
                                  }
                                }
                              }}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                            >
                              <option value="monthly">💵 سلفة شهرية (خصم دفعة واحدة بالراتب)</option>
                              <option value="installment">📆 سلفة مقسطة على عدة شهور</option>
                            </select>
                          </div>

                          {loanCustomType === 'installment' && (
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                عدد الأقساط (شهور)
                              </label>
                              <input
                                type="number"
                                min="2"
                                max="36"
                                value={loanCustomMonths}
                                onChange={(e) => {
                                  const m = e.target.value;
                                  setLoanCustomMonths(m);
                                  if (loanCustomAmount && parseInt(m, 10) > 0) {
                                    setLoanCustomMonthlyDed(String(Math.ceil(parseFloat(loanCustomAmount) / parseInt(m, 10))));
                                  }
                                }}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                              />
                            </div>
                          )}

                          {loanCustomType === 'installment' && (
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                                القسط الشهري المستقطع (ج.م)
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={loanCustomMonthlyDed}
                                onChange={(e) => setLoanCustomMonthlyDed(e.target.value)}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold', color: '#166534' }}
                              />
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: '10px' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>
                            📝 ملاحظة / توجيه الإدارة العليا بخصوص التعديل (تظهر للموظف وفي مسير الرواتب):
                          </label>
                          <input
                            type="text"
                            placeholder="مثال: تمت الموافقة على 700 ج.م بدلاً من 1000 ج.م بناءً على تعليمات الإدارة"
                            value={loanCustomNotes}
                            onChange={(e) => setLoanCustomNotes(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PERMISSION DETAILS ── */}
                {isPermission && (() => {
                  const permDurationTxt = (() => {
                    if (previewModalReq.durationText) return previewModalReq.durationText;
                    if (previewModalReq.durationMinutes) {
                      const hrs = Math.floor(previewModalReq.durationMinutes / 60);
                      const mins = previewModalReq.durationMinutes % 60;
                      let txt = '';
                      if (hrs > 0) txt += `${hrs} ساعة `;
                      if (mins > 0) txt += `${mins} دقيقة`;
                      return txt || `${previewModalReq.durationMinutes} دقيقة`;
                    }
                    if (previewModalReq.hours) return `${previewModalReq.hours} ساعة`;
                    const st = previewModalReq.startTime || previewModalReq.fromTime;
                    const et = previewModalReq.endTime || previewModalReq.toTime;
                    if (st && et) {
                      const [h1, m1] = st.split(':').map(Number);
                      const [h2, m2] = et.split(':').map(Number);
                      let start = (h1 || 0) * 60 + (m1 || 0);
                      let end = (h2 || 0) * 60 + (m2 || 0);
                      if (end <= start) end += 24 * 60;
                      const diff = end - start;
                      const hrs = Math.floor(diff / 60);
                      const mins = diff % 60;
                      let txt = '';
                      if (hrs > 0) txt += `${hrs} ساعة `;
                      if (mins > 0) txt += `${mins} دقيقة`;
                      return txt || `${diff} دقيقة`;
                    }
                    return '—';
                  })();

                  const permTypeLabel = previewModalReq.permType === 'early' ? 'إذن انصراف مبكر' : (previewModalReq.permType === 'late' ? 'إذن تأخير عن الوردية' : 'إذن خروج / تأخير');

                  return (
                    <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ margin: 0, color: '#92400e', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          ⏰ تفاصيل إذن الخروج / التأخير:
                        </h4>
                        <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          {permTypeLabel}
                        </span>
                      </div>
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
                          <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold' }}>إجمالي مدة الإذن:</span>
                          <div style={{ fontWeight: '900', color: '#b45309', fontSize: '16px' }}>
                            ⏱️ {permDurationTxt}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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

                {/* ── PUNCH CORRECTION / MANUAL PUNCH DETAILS ── */}
                {isPunch && (
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🖐️ تفاصيل تسجيل / تعديل البصمة اليدوية:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>نوع البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          {previewModalReq.punchType === 'full' ? 'حضور وانصراف (وردية كاملة)' : previewModalReq.punchType === 'in' ? 'تسجيل حضور فقط' : previewModalReq.punchType === 'out' ? 'تسجيل انصراف فقط' : 'تعديل توقيت بصمة'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>تاريخ البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.date || '—'} {previewModalReq.date && `(${arabicWeekday(previewModalReq.date)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>وقت الحضور والانصراف:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          من <strong>{previewModalReq.timeIn || '—'}</strong> إلى <strong>{previewModalReq.timeOut || '—'}</strong>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#166534' }}>ساعات البريك المخصومة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          ☕ {previewModalReq.breakHours !== undefined ? previewModalReq.breakHours : 0} ساعة
                        </div>
                      </div>
                      {previewModalReq.hours && (
                        <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                          <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>صافي ساعات العمل المحسوبة:</span>
                          <div style={{ fontWeight: '900', color: '#15803d', fontSize: '16px' }}>
                            ⏱️ {previewModalReq.hours} ساعة
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── BONUS DETAILS ── */}
                {previewModalReq.type === 'bonus' && (
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #86efac' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#15803d', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🎁 تفاصيل طلب المكافأة / الحافز:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div style={{ background: '#dcfce7', padding: '10px 14px', borderRadius: '8px', border: '1px solid #86efac' }}>
                        <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 'bold' }}>مبلغ المكافأة المقترح:</span>
                        <div style={{ fontWeight: '900', color: '#166534', fontSize: '18px' }}>
                          💰 {previewModalReq.amount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#15803d' }}>تاريخ الاستحقاق:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ fontSize: '12px', color: '#15803d' }}>مبررات وأسباب المكافأة:</span>
                        <div style={{ fontWeight: 'bold', color: '#14532d', background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', marginTop: '4px' }}>
                          {previewModalReq.reason || previewModalReq.details || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── DISCIPLINARY VIOLATION & BRANCH MANAGER DECISION DETAILS (جزاء تأديبي ومخالفة موثقة من الفرع) ── */}
                {isDisciplinaryViolation && (
                  <div style={{ background: '#fff1f2', padding: '18px', borderRadius: '14px', border: '1.5px solid #fecdd3', boxShadow: '0 2px 10px rgba(225,29,72,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#9f1239', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                        <span>⚠️</span>
                        <span>تفاصيل المخالفة التأديبية وقرار مدير الفرع:</span>
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {previewModalReq.occurrenceNumber && (
                          <span style={{ background: '#ffe4e6', color: '#be123c', border: '1px solid #fda4af', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                            🔁 التكرار: المرة {previewModalReq.occurrenceNumber === 1 ? 'الأولى' : previewModalReq.occurrenceNumber === 2 ? 'الثانية' : previewModalReq.occurrenceNumber === 3 ? 'الثالثة' : previewModalReq.occurrenceNumber === 4 ? 'الرابعة' : `${previewModalReq.occurrenceNumber}`}
                          </span>
                        )}
                        {previewModalReq.categoryCode && (
                          <span style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700 }}>
                            كود اللائحة: {previewModalReq.categoryCode}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Violation Details Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fecdd3' }}>
                        <span style={{ fontSize: '12px', color: '#9f1239', fontWeight: 600 }}>بند / مسمى المخالفة:</span>
                        <div style={{ fontWeight: 800, color: '#881337', fontSize: '14px', marginTop: '2px' }}>
                          ⚖️ {previewModalReq.ruleTitle || previewModalReq.violationTitle || previewModalReq.categoryName || previewModalReq.reason || 'مخالفة لائحية'}
                        </div>
                      </div>

                      <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '10px', border: '1px solid #fecdd3' }}>
                        <span style={{ fontSize: '12px', color: '#9f1239', fontWeight: 600 }}>تصنيف لائحة العمل:</span>
                        <div style={{ fontWeight: 700, color: '#881337', fontSize: '13.5px', marginTop: '2px' }}>
                          📜 {previewModalReq.categoryName || 'لائحة الجزاءات والانضباط'}
                        </div>
                      </div>

                      <div style={{ background: '#ffe4e6', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #fda4af' }}>
                        <span style={{ fontSize: '12px', color: '#be123c', fontWeight: 700 }}>قرار وعقوبة مدير الفرع:</span>
                        <div style={{ fontWeight: 900, color: '#9f1239', fontSize: '15px', marginTop: '2px' }}>
                          🚨 {previewModalReq.actionTitle || previewModalReq.penaltyAction || 'لفت نظر / خصم تأديبي'}
                        </div>
                      </div>

                      {(parseFloat(previewModalReq.amount || previewModalReq.penaltyAmount) > 0 || parseFloat(previewModalReq.deductionDays || previewModalReq.penaltyDays) > 0) && (
                        <div style={{ background: '#fef2f2', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid #fca5a5' }}>
                          <span style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 700 }}>الأثر المالي للخصم:</span>
                          <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '16px', marginTop: '2px' }}>
                            💸 {previewModalReq.deductionDays ? `خصم ${previewModalReq.deductionDays} يوم ` : ''}
                            {previewModalReq.amount ? `(${previewModalReq.amount} ج.م)` : ''}
                          </div>
                        </div>
                      )}

                      <div>
                        <span style={{ fontSize: '12px', color: '#9f1239' }}>تاريخ حدوث الواقعة:</span>
                        <div style={{ fontWeight: 700, color: '#881337', fontSize: '13.5px', marginTop: '2px' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '12px', color: '#9f1239' }}>موثق المخالفة:</span>
                        <div style={{ fontWeight: 700, color: '#881337', fontSize: '13.5px', marginTop: '2px' }}>
                          👔 {previewModalReq.createdByName || 'مدير الفرع'}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Incident Notes */}
                    {previewModalReq.details && (
                      <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fecdd3', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#9f1239', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                          📝 تفاصيل ووقائع المخالفة المسجلة:
                        </span>
                        <div style={{ color: '#1e293b', lineHeight: 1.6, fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                          {previewModalReq.details}
                        </div>
                      </div>
                    )}

                    {/* Investigation Notes if present */}
                    {previewModalReq.investigationNotes && (
                      <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#475569', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                          🔍 ملخص التحقيق وأقوال الموظف:
                        </span>
                        <div style={{ color: '#334155', lineHeight: 1.6, fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                          {previewModalReq.investigationNotes}
                        </div>
                      </div>
                    )}

                    {/* Override reason if present */}
                    {previewModalReq.overrideReason && (
                      <div style={{ background: '#fffbeb', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 700, display: 'block' }}>
                          ⚠️ مبررات الاستثناء وتجاوز التدرج اللائحي:
                        </span>
                        <div style={{ color: '#78350f', fontSize: '12.5px', marginTop: '3px' }}>
                          {previewModalReq.overrideReason}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PENALTY OBJECTION DETAILS ── */}
                {isPenaltyObjection && (
                  <div style={{ background: '#fdf4ff', padding: '16px', borderRadius: '12px', border: '1px solid #f0abfc' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#86198f', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✋ تفاصيل تظلم الموظف من الجزاء:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#701a75' }}>مسمى المخالفة / الجزاء:</span>
                        <div style={{ fontWeight: 'bold', color: '#581c87', fontSize: '14px' }}>
                          ⚖️ {previewModalReq.violationTitle || previewModalReq.title || (previewModalReq.subType === 'lateness' ? 'تأخير عن العمل' : 'جزاء تأديبي لائحي')}
                        </div>
                      </div>
                      {(previewModalReq.latenessMinutes || previewModalReq.deductionMinutes) && (
                        <div>
                          <span style={{ fontSize: '12px', color: '#701a75' }}>مدة / دقائق التأخير:</span>
                          <div style={{ fontWeight: 'bold', color: '#581c87' }}>
                            ⏱️ {previewModalReq.latenessMinutes || previewModalReq.deductionMinutes} دقيقة
                          </div>
                        </div>
                      )}
                      <div>
                        <span style={{ fontSize: '12px', color: '#701a75' }}>قيمة الخصم المالي:</span>
                        <div style={{ fontWeight: '900', color: '#b91c1c', fontSize: '16px' }}>
                          💸 {previewModalReq.penaltyAmount || previewModalReq.amount || '0'} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: '#701a75' }}>تاريخ الواقعة:</span>
                        <div style={{ fontWeight: 'bold', color: '#581c87' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Objection reasons box */}
                    <div style={{ background: '#fff', border: '1px solid #e879f9', borderRadius: '10px', padding: '14px', marginTop: '10px' }}>
                      <div style={{ fontWeight: 'bold', color: '#86198f', marginBottom: '6px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✋</span>
                        <span>أسباب ومبررات التظلم المقدمة من الموظف:</span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#1e293b', background: '#fae8ff', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', lineHeight: '1.6' }}>
                        "{previewModalReq.reason || (typeof previewModalReq.objection === 'object' ? previewModalReq.objection.reason : previewModalReq.objection) || previewModalReq.details || '—'}"
                      </div>
                      {previewModalReq.status === 'pending' || previewModalReq.objection?.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ background: '#16a34a', color: '#fff', fontSize: '13px', padding: '8px 16px', fontWeight: 'bold', borderRadius: '8px' }}
                            onClick={() => {
                              handleApprove(previewModalReq.id);
                              setPreviewModalReq(null);
                            }}
                          >
                            ✅ قبول التظلم وإلغاء الجزاء وسحب الخصم
                          </button>
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ background: '#dc2626', color: '#fff', fontSize: '13px', padding: '8px 16px', fontWeight: 'bold', borderRadius: '8px' }}
                            onClick={() => {
                              handleReject(previewModalReq.id);
                              setPreviewModalReq(null);
                            }}
                          >
                            ❌ رفض التظلم وتثبيت الجزاء
                          </button>
                        </div>
                      ) : previewModalReq.status === 'approved' || previewModalReq.objection?.status === 'approved' ? (
                        <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: '13px' }}>✅ تم قبول التظلم وإلغاء الخصم بنجاح</span>
                      ) : (
                        <span className="badge badge-danger" style={{ padding: '6px 12px', fontSize: '13px' }}>❌ تم رفض التظلم وتثبيت الجزاء</span>
                      )}
                    </div>
                  </div>
                )}

                {/* ── OVERTIME REQUEST DETAILS ── */}
                {previewModalReq.type === 'overtime' && (
                  <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #86efac' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⏱️ تفاصيل الساعات الإضافية ومقارنة الوردية:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>الوردية المقررة بالجدول:</span>
                        <strong style={{ color: '#1e293b' }}>{previewModalReq.regularHours || previewModalReq.scheduledHours || 8} ساعات ({previewModalReq.scheduledStart || '—'} ➔ {previewModalReq.scheduledEnd || '—'})</strong>
                      </div>
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                        <span style={{ color: '#64748b', fontSize: '11.5px', display: 'block' }}>البصمة وساعات العمل الفعلية:</span>
                        <strong style={{ color: '#1e293b' }}>{previewModalReq.totalShiftHours || previewModalReq.actualWorkedHours || '—'} ساعات ({previewModalReq.actualIn || '—'} ➔ {previewModalReq.actualOut || '—'})</strong>
                      </div>
                      <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                        <span style={{ color: '#166534', fontSize: '11.5px', display: 'block' }}>الساعات الإضافية المطلوب اعتمادها:</span>
                        <strong style={{ color: '#15803d', fontSize: '14px' }}>+{previewModalReq.hours} ساعة إضافية</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ROSTER EDIT DETAILS & COMPARISON (الجدول السابق مقابل الجديد) ── */}
                {isRoster && (() => {
                  const existingRoster = (state.rosters || []).find(r => 
                    String(r.employeeId) === String(previewModalReq.employeeId) &&
                    (!previewModalReq.month || r.month === previewModalReq.month)
                  );

                  const prevSchedule = normalizeSchedule(previewModalReq.oldSchedule || previewModalReq.previousSchedule || existingRoster?.schedule);
                  const newSchedule = normalizeSchedule(previewModalReq.schedule || previewModalReq.newSchedule);

                  const standardDays = [
                    { key: 'السبت', label: 'السبت' },
                    { key: 'الأحد', label: 'الأحد' },
                    { key: 'الاثنين', label: 'الاثنين' },
                    { key: 'الثلاثاء', label: 'الثلاثاء' },
                    { key: 'الأربعاء', label: 'الأربعاء' },
                    { key: 'الخميس', label: 'الخميس' },
                    { key: 'الجمعة', label: 'الجمعة' },
                  ];

                  const isIsoDate = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
                  const customDateKeys = Object.keys(previewModalReq.schedule || {}).filter(isIsoDate);
                  const hasCustomDates = customDateKeys.length > 0;

                  const displayList = hasCustomDates 
                    ? customDateKeys.sort().map(dateKey => {
                        const d = new Date(dateKey);
                        const arDay = !isNaN(d.getTime()) ? d.toLocaleDateString('ar-EG', { weekday: 'long' }) : '';
                        return { key: dateKey, label: arDay ? `${dateKey} (${arDay})` : dateKey };
                      })
                    : standardDays;

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
                              const oldDay = prevSchedule[dayItem.key] || { type: dayItem.key === 'الجمعة' ? 'off' : 'shift', start: '08:00', end: '16:00' };
                              const newDay = newSchedule[dayItem.key] || oldDay;

                              const isOldOff = oldDay.type === 'off' || oldDay.isOff === true;
                              const isNewOff = newDay.type === 'off' || newDay.isOff === true;

                              const oldStart = oldDay.start || oldDay.checkIn || (isOldOff ? '—' : '08:00');
                              const oldEnd = oldDay.end || oldDay.checkOut || (isOldOff ? '—' : '16:00');

                              const newStart = newDay.start || newDay.checkIn || (isNewOff ? '—' : '08:00');
                              const newEnd = newDay.end || newDay.checkOut || (isNewOff ? '—' : '16:00');

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

                  {(() => {
                    const attData = previewModalReq.attachmentData || previewModalReq.photoUrl || previewModalReq.videoUrl || previewModalReq.attachment || previewModalReq.fileData || previewModalReq.fileUrl || previewModalReq.mediaUrl;
                    const attName = previewModalReq.attachmentName || previewModalReq.fileName || (typeof attData === 'string' && attData.startsWith('data:video/') ? 'فيديو توثيق المخالفة.mp4' : typeof attData === 'string' && attData.startsWith('data:application/pdf') ? 'مستند_التحقيق.pdf' : 'مستند / مرفق رسمي');
                    const attType = previewModalReq.attachmentType || (
                      (typeof attData === 'string' && (attData.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(attData) || previewModalReq.photoUrl)) ? 'image' :
                      (typeof attData === 'string' && (attData.startsWith('data:application/pdf') || /\.pdf$/i.test(attData) || /\.pdf$/i.test(attName))) ? 'pdf' :
                      (typeof attData === 'string' && (attData.startsWith('data:video/') || /\.(mp4|webm|mov|ogg)$/i.test(attData) || previewModalReq.videoUrl)) ? 'video' :
                      'image'
                    );

                    if (!attData) return null;

                    return (
                      <div style={{ marginTop: '14px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
                        <h5 style={{ margin: '0 0 10px', fontSize: '13.5px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}>
                          <span>📎</span>
                          <span>المرفق التوثيقي المرفوع (صورة / فيديو / مستند):</span>
                          {attName && <span style={{ color: '#2563eb', fontSize: '12px', fontWeight: 600 }}>({attName})</span>}
                        </h5>

                        {attType === 'image' && (
                          <div style={{ textAlign: 'center', background: '#0f172a', padding: '10px', borderRadius: '8px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                            <img
                              src={attData}
                              alt={attName}
                              style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '6px', cursor: 'pointer' }}
                              onClick={() => window.open(attData, '_blank')}
                              title="انقر لفتح الصورة بالحجم الكامل"
                            />
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>🔍 انقر على الصورة لفتحها بالحجم الكامل</div>
                          </div>
                        )}

                        {attType === 'pdf' && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef2f2', padding: '12px 16px', borderRadius: '10px', border: '1.5px solid #fecaca', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '28px' }}>📄</span>
                              <div>
                                <strong style={{ color: '#991b1b', fontSize: '13.5px', display: 'block' }}>{attName || 'مستند PDF رسمي'}</strong>
                                <span style={{ fontSize: '11.5px', color: '#7f1d1d' }}>مستند PDF رسمي مرفق من مدير الفرع</span>
                              </div>
                            </div>
                            <a
                              href={attData}
                              download={attName || 'investigation_doc.pdf'}
                              target="_blank"
                              rel="noreferrer"
                              className="btn"
                              style={{ fontSize: '12.5px', padding: '6px 14px', background: '#dc2626', color: '#ffffff', fontWeight: 'bold', borderRadius: '8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              👁️ فتح / تحميل ملف PDF
                            </a>
                          </div>
                        )}

                        {attType === 'video' && (
                          <div style={{ textAlign: 'center', background: '#0f172a', padding: '10px', borderRadius: '8px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
                            <video
                              controls
                              src={attData}
                              style={{ maxHeight: '280px', maxWidth: '100%', borderRadius: '6px' }}
                            />
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>🎥 مشغل فيديو توثيق المخالفة</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                        style={{
                          padding: '8px 22px',
                          fontSize: '13.5px',
                          fontWeight: 'bold',
                          background: (isLoan && (isEditingLoan || (loanCustomAmount && parseFloat(loanCustomAmount) !== parseFloat(previewModalReq.amount)))) ? '#2563eb' : undefined
                        }}
                        onClick={() => {
                          if (isLoan && (isEditingLoan || (loanCustomAmount && parseFloat(loanCustomAmount) !== parseFloat(previewModalReq.amount)))) {
                            handleApprove(previewModalReq.id, {
                              amount: loanCustomAmount,
                              loanType: loanCustomType,
                              installmentsCount: loanCustomMonths,
                              monthlyDeduction: loanCustomMonthlyDed,
                              adminNotes: loanCustomNotes,
                              isModified: true
                            });
                          } else {
                            handleApprove(previewModalReq.id);
                          }
                          setPreviewModalReq(null);
                        }}
                      >
                        {isLoan && (isEditingLoan || (loanCustomAmount && parseFloat(loanCustomAmount) !== parseFloat(previewModalReq.amount)))
                          ? `✓ اعتماد السلفة بالمبلغ المعتمد (${loanCustomAmount || previewModalReq.amount} ج.م)`
                          : '✓ اعتماد وموافقة الطلب فوراً'}
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
