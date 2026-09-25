import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { applyShiftSwapToRosters, arabicWeekday, shouldShowRequestToBranch, getEmpDisplayName, isEmployeeActive, normalizeState, fmt } from '../../utils/formatters';
import { normalizeSchedule, getEmployeeDaySchedule } from '../../utils/rosterEngine';
import { notifyEmployeeEarlyExitWarning, notifyOnPenaltyApplied } from '../../utils/gmailService';
import { recalculateEmployeeCycleLateness, applyApprovedPermissionsToShifts, isApprovedPermissionForDate } from '../../utils/latePenaltyEngine';
import { shouldRouteDirectToAdmin, isBranchWithoutManager, isDualApprovalRequest, isEmployeeBranchManager, isUpperManagementEmp } from '../../utils/jobsHelper';
import { syncNow, fetchRemoteState, hardDeleteEntityFast, purgeAllRequestsCloudAndLocal } from '../../utils/offlineSync';
import { putRequestsBatch } from '../../utils/localDatabase';
import { createRequestDecisionNotification } from '../../utils/notificationEngine';
import { useUI } from '../../context/UIContext';
import { saveFaceDescriptor, saveHandDescriptor, deleteFaceDescriptor, deleteHandDescriptor } from '../../utils/faceStorage';
import { enqueueRequestDecision, executeFullSync } from '../../utils/syncEngine';
import { getLifecycleBadge, REQUEST_STATES } from '../../utils/requestLifecycle';

export function isPendingRequest(r) {
  if (!r) return false;
  if (r.adminApproved === true) return false;
  const status = String(r.status || '').toLowerCase().trim();
  if (status === 'approved' || status === 'paid' || status === 'rejected' || status === 'cancelled') {
    return false;
  }
  return true;
}

export function getFormattedRequestBadge(type, leaveType, targetAction, fullReq = null) {
  let reqObj = null;
  let resolvedType = type;
  let resolvedLeaveType = leaveType;
  let resolvedAction = targetAction;

  if (type && typeof type === 'object') {
    reqObj = type;
    resolvedType = type.type || type.requestType;
    resolvedLeaveType = type.leaveType;
    resolvedAction = type.targetAction || type.actionType || targetAction;
  } else if (fullReq && typeof fullReq === 'object') {
    reqObj = fullReq;
  }

  const cleanType = String(resolvedType || '').trim().toLowerCase();
  const cleanLeaveType = String(resolvedLeaveType || '').trim().toLowerCase();
  const cleanAction = String(resolvedAction || '').trim().toLowerCase();

  // فحص ما إذا كان الطلب تعديل بصمة موظف أو تسجيل بصمة يدوي من مدير الفرع أو الإدارة
  const isBranchPunch = Boolean(
    reqObj?.submittedByBranchManager ||
    reqObj?.subType === 'punch_correction' ||
    reqObj?.subType === 'manual_punch_request' ||
    String(reqObj?.id || '').startsWith('req_punch_') ||
    cleanType === 'branch_punch_edit' ||
    cleanType === 'manual_punch' ||
    (cleanType === 'punch_correction' && !reqObj?.photoUrl && !reqObj?.drivePhotoUrl && cleanType !== 'biometric_verification')
  );

  if (isBranchPunch) {
    const punchAction = String(reqObj?.punchType || cleanAction || '').toLowerCase();
    const isCheckIn = punchAction === 'in' || punchAction === 'shift_start' || punchAction === 'دخول' || punchAction === 'حضور' || String(reqObj?.details || '').includes('حضور فقط') || String(reqObj?.typeLabel || '').includes('حضور');
    const isCheckOut = punchAction === 'out' || punchAction === 'shift_end' || punchAction === 'خروج' || punchAction === 'انصراف' || String(reqObj?.details || '').includes('انصراف فقط') || String(reqObj?.typeLabel || '').includes('انصراف');
    const isEdit = Boolean(reqObj?.shiftId || reqObj?.subType === 'punch_correction' || String(reqObj?.details || '').includes('طلب تعديل بصمة') || String(reqObj?.typeLabel || '').includes('تعديل بصمة'));

    if (isCheckIn) {
      return <span className="badge" style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🟢 تعديل بصمة حضور (مدير الفرع)</span>;
    }
    if (isCheckOut) {
      return <span className="badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🔴 تعديل بصمة انصراف (مدير الفرع)</span>;
    }
    if (isEdit) {
      return <span className="badge" style={{ background: '#0d9488', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🖐️ طلب تعديل بصمة مسجلة</span>;
    }
    return <span className="badge" style={{ background: '#0d9488', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🖐️ طلب تسجيل بصمة يدوي</span>;
  }

  if (cleanType === 'leave' || cleanType === 'leave_request' || cleanType === 'annual_leave' || cleanType === 'sick_leave' || cleanType === 'unpaid_leave' || cleanType === 'weekly_rest') {
    if (cleanLeaveType === 'weekly_rest' || cleanType === 'weekly_rest') return <span className="badge badge-info" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>🛋️ راحة أسبوعية</span>;
    if (cleanLeaveType === 'annual' || cleanType === 'annual_leave') return <span className="badge badge-success">🏖️ إجازة سنوية</span>;
    if (cleanLeaveType === 'unpaid' || cleanType === 'unpaid_leave') return <span className="badge badge-warning">⏱️ إجازة غير مدفوعة</span>;
    if (cleanLeaveType === 'sick' || cleanType === 'sick_leave') return <span className="badge badge-danger">🏥 إجازة مرضية</span>;
    if (cleanLeaveType === 'casual') return <span className="badge badge-info">🌴 إجازة عارضة</span>;
    if (cleanLeaveType === 'marriage') return <span className="badge badge-primary">💍 إجازة زواج</span>;
    if (cleanLeaveType === 'maternity') return <span className="badge badge-primary">👶 إجازة وضع</span>;
    if (cleanLeaveType === 'bereavement') return <span className="badge badge-secondary">🖤 إجازة وفاة</span>;
    return <span className="badge badge-success">🏖️ طلب إجازة</span>;
  }

  if (cleanType === 'expense' || cleanType === 'financial_expense' || cleanType === 'invoice' || cleanType === 'financial' || cleanType === 'financial_alert') {
    return <span className="badge" style={{ background: '#e11d48', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>📑 اعتماد فاتورة / مصروف</span>;
  }
  if (cleanType === 'income' || cleanType === 'financial_income') {
    return <span className="badge" style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>💵 اعتماد إيراد مالي</span>;
  }
  if (cleanType === 'advance' || cleanType === 'loan' || cleanType === 'سلفة') {
    return <span className="badge badge-warning">💰 طلب سلفة</span>;
  }
  if (cleanType === 'meds' || cleanType === 'credit_medicine' || cleanType === 'أدوية') {
    return <span className="badge badge-warning" style={{ background: '#7c3aed', color: '#fff' }}>💊 سحب أدوية آجل</span>;
  }
  if (cleanType === 'permission' || cleanType === 'إذن' || cleanType === 'late_permission' || cleanType === 'early_leave') {
    return <span className="badge badge-info">⏳ طلب إذن</span>;
  }
  if (cleanType === 'penalty' || cleanType === 'early_exit' || cleanType === 'disciplinary_penalty' || cleanType === 'violation' || String(type || '').startsWith('disc_')) {
    return <span className="badge badge-danger">⚠️ جزاء تأديبي</span>;
  }
  if (cleanType === 'penalty_objection' || cleanType === 'objection' || cleanType === 'تظلم') {
    return <span className="badge badge-warning" style={{ background: '#b45309', color: '#fff' }}>⚖️ تظلم على جزاء</span>;
  }
  if (cleanType === 'swap' || cleanType === 'shift_swap' || cleanType === 'تبديل') {
    return <span className="badge badge-primary">🔄 تبديل وردية</span>;
  }
  if (cleanType === 'shift_adjustment' || cleanType === 'تعديل شيفت') {
    return <span className="badge" style={{ background: '#7c3aed', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🔄 تعديل موعد شيفت</span>;
  }
  if (cleanType === 'comp_off_grant') {
    return <span className="badge" style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🛋️ احتساب بدل راحة</span>;
  }
  if (cleanType === 'leave_comp_off' || cleanType === 'comp_off') {
    return <span className="badge" style={{ background: '#0891b2', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🛋️ إجازة بدل راحة</span>;
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
  if (cleanType === 'schedule_deviation' || cleanType === 'deviation' || cleanType === 'عدم الالتزام بالجدول') {
    return <span className="badge" style={{ background: '#f59e0b', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>⚠️ عدم الالتزام بالجدول</span>;
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
  if (cleanType === 'punch_correction') {
    if (cleanAction === 'shift_start' || cleanAction === 'دخول' || cleanAction === 'حضور') {
      return <span className="badge" style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🟢 تعديل بصمة دخول</span>;
    }
    if (cleanAction === 'shift_end' || cleanAction === 'خروج' || cleanAction === 'انصراف') {
      return <span className="badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🔴 تعديل بصمة انصراف</span>;
    }
    return <span className="badge" style={{ background: '#0d9488', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🖐️ طلب تعديل بصمة</span>;
  }
  if (cleanType === 'attendance_punch' || cleanType === 'تأكيد بصمة الوجه' || cleanType === 'تأكيد بصمة اليد' || cleanType === 'biometric_verification') {
    if (cleanAction === 'shift_start' || cleanAction === 'دخول' || cleanAction === 'حضور') {
      return <span className="badge" style={{ background: '#059669', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🟢 بصمة دخول (بالصورة)</span>;
    }
    if (cleanAction === 'shift_end' || cleanAction === 'خروج' || cleanAction === 'انصراف') {
      return <span className="badge" style={{ background: '#dc2626', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>🔴 بصمة خروج (بالصورة)</span>;
    }
    if (cleanAction === 'break_start' || cleanAction === 'بدء بريك' || cleanAction === 'بريك') {
      return <span className="badge" style={{ background: '#d97706', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>☕ بدء بريك (بالصورة)</span>;
    }
    if (cleanAction === 'break_end' || cleanAction === 'انتهاء بريك') {
      return <span className="badge" style={{ background: '#2563eb', color: '#fff', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>⏱️ انتهاء بريك (بالصورة)</span>;
    }
    return <span className="badge badge-primary" style={{ background: '#0284c7', color: '#fff', fontWeight: 700 }}>📸 اعتماد حضور بالصورة</span>;
  }
  if (cleanType === 'biometric_registration') {
    return <span className="badge badge-success" style={{ background: '#0d9488', color: '#fff', border: '1px solid #0f766e' }}>📸 تسجيل بصمة جديدة</span>;
  }
  if (cleanType === 'biometric_reset') {
    return <span className="badge badge-warning" style={{ background: '#d97706', color: '#fff', border: '1px solid #b45309' }}>🔄 طلب إعادة تسجيل بصمة</span>;
  }
  if (cleanType === 'adjustment') {
    return <span className="badge badge-info">⚖️ تعديل إداري / مالي</span>;
  }
  if (cleanType === 'profile_update' || cleanType === 'profile_edit' || cleanType === 'profile_update_request' || cleanType.includes('profile')) {
    return <span className="badge badge-primary" style={{ background: '#0d9488', color: '#fff', border: '1px solid #0f766e', fontWeight: 700 }}>👤 طلب تحديث بيانات شخصية</span>;
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
  const { showConfirm } = useUI();
  const [inboxTab, setInboxTab] = useState('pending'); // 'all' | 'pending' | 'urgent' | 'completed' | 'rejected' | 'outbox'
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('pending'); // افتراضي قيد الاعتماد بناءً على طلب الإدارة
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewModalReq, setPreviewModalReq] = useState(null);

  // Modern In-App Lightbox & Photo Comparison State (Zero window.open)
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [showSideBySide, setShowSideBySide] = useState(false);

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
      // 1. مزامنة تزايدية خفيفة فورية عبر Delta Sync + Outbox
      const syncRes = await executeFullSync(currentBranch?.id);
      if (syncRes?.pull?.count > 0 || syncRes?.push?.count > 0) {
        showToast?.(`✅ تمت المزامنة التزايدية: ${syncRes.push.count || 0} مرسل، ${syncRes.pull.count || 0} تحديث وارد`);
      } else {
        const res = await syncNow();
        if (res.success && res.mergedState) {
          if (setState) setState(normalizeState(res.mergedState));
          showToast?.('✅ تم تحديث وجلب أحدث الطلبات بنجاح');
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
    const isIdDeleted = (id, reqObj = null) => {
      if (!id) return false;
      // الطلبات قيد الاعتماد لا تعتبر محذوفة أبداً ومحمية من الحذف
      if (reqObj && isPendingRequest(reqObj)) return false;
      const s = String(id);
      const raw = s.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_)/, '');
      return (
        deletedIdsSet.has(s) ||
        deletedIdsSet.has(`req_${s}`) ||
        deletedIdsSet.has(`req_${raw}`) ||
        deletedIdsSet.has(`leave_${raw}`) ||
        deletedIdsSet.has(`swap_${raw}`) ||
        deletedIdsSet.has(`loan_${raw}`) ||
        deletedIdsSet.has(`medreq_${raw}`) ||
        deletedIdsSet.has(`obj_inc_${raw}`) ||
        deletedIdsSet.has(raw)
      );
    };

    const existingIds = new Set();
    const seenSignatures = new Set();
    const list = [];

    const addIfUnique = (r, defaultType = null) => {
      if (!r || !r.id) return;
      const idStr = String(r.id);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_)/, '');

      if (isIdDeleted(idStr, r) || isIdDeleted(`req_${rawId}`, r)) return;
      if (existingIds.has(idStr) || existingIds.has(`req_${rawId}`)) return;

      // Resignations are managed exclusively in their dedicated module
      if (r.type === 'resignation' || r.type === 'withdraw' || r.type === 'resignation_request' || idStr.startsWith('res_')) return;

      // Exclude auto-approved system penalties from the requests page (they are managed in bylaws tab)
      const isAutoSystemPenalty =
        (r.type === 'penalty' || r.type === 'late_penalty' || r.subType === 'lateness' || idStr.startsWith('req_late_inc_') || idStr.startsWith('req_inc_')) &&
        (r.source === 'system' || r.source === 'late_penalty_engine' || r.subType === 'lateness' || idStr.startsWith('req_late_inc_') || r.adminApproved || r.status === 'approved');

      // Preserve employee penalty objections (e.g. penalty_objection or obj_inc_...)
      if (isAutoSystemPenalty && r.type !== 'penalty_objection' && !idStr.startsWith('obj_')) {
        return;
      }

      // Semantic deduplication for double submissions / rapid multi-clicks
      const empKey = String(r.employeeId || r.employeeCode || '');
      const typeKey = String(r.type || defaultType || 'gen');
      const dateKey = String(r.date || r.startDate || (r.createdAt ? r.createdAt.substring(0, 10) : ''));
      const timeKey = r.time ? String(r.time).substring(0, 4) : (r.createdAt ? r.createdAt.substring(11, 16) : '');
      const amtKey = String(r.amount || r.totalAmount || r.leaveType || r.targetEmployeeId || '');
      const sigKey = `${empKey}_${typeKey}_${dateKey}_${timeKey}_${amtKey}`;

      if (sigKey.length > 8 && seenSignatures.has(sigKey)) {
        return;
      }

      existingIds.add(idStr);
      existingIds.add(rawId);
      if (sigKey.length > 8) seenSignatures.add(sigKey);

      list.push(defaultType && !r.type ? { ...r, type: defaultType } : r);
    };

    (state.requests || []).forEach((r) => addIfUnique(r));
    (state.leaveRequests || []).forEach((lr) => addIfUnique(lr, 'leave'));
    (state.shiftSwaps || []).forEach((sw) => addIfUnique(sw, 'swap'));
    (state.loans || []).forEach((ln) => addIfUnique(ln, 'loan'));

    // Aggregate any pending/resolved employee penalty objections from late incidents
    (state.lateIncidents || []).forEach((inc) => {
      if (inc && inc.objection && (inc.objection.status || inc.status === 'objection_pending')) {
        const objReqId = `obj_inc_${inc.id}`;
        if (!existingIds.has(objReqId) && !existingIds.has(String(inc.id)) && !isIdDeleted(objReqId)) {
          const emp = (state.employees || []).find((e) => String(e.id) === String(inc.employeeId) || (inc.employeeCode && String(e.code) === String(inc.employeeCode)));
          addIfUnique({
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
        }
      }
    });

    // Aggregate any employee objections from financial adjustments
    (state.adjustments || []).forEach((adj) => {
      if (adj && adj.objection && adj.objection.status) {
        const objReqId = `obj_adj_${adj.id}`;
        if (!existingIds.has(objReqId) && !existingIds.has(String(adj.id)) && !isIdDeleted(objReqId)) {
          const emp = (state.employees || []).find((e) => String(e.id) === String(adj.employeeId) || (adj.employeeCode && String(e.code) === String(adj.employeeCode)));
          addIfUnique({
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
        }
      }
    });

    // Aggregate any branch invoices / expenses from finances and transactions
    const allFinances = [
      ...(Array.isArray(state.finances) ? state.finances : []),
      ...(Array.isArray(state.transactions) ? state.transactions : [])
    ];
    allFinances.forEach((tx) => {
      if (!tx || !tx.id) return;
      const txId = String(tx.id);
      if (tx.approvalStatus || tx.createdByRole === 'branch' || tx.attachmentData || tx.attachmentName || tx.subType === 'invoice' || tx.type === 'expense' || tx.type === 'financial_expense') {
        const isExpense = tx.type === 'expense' || !tx.type;
        const bName = tx.branchName || 'الفرع';
        addIfUnique({
          id: txId,
          transactionId: txId,
          type: isExpense ? 'expense' : 'income',
          subType: 'invoice',
          typeLabel: isExpense ? 'فاتورة مصروف فرع' : 'حركة إيراد للفرع',
          employeeName: tx.createdByName || `مدير فرع ${bName}`,
          employeeId: tx.createdBy || tx.branchId,
          branchId: tx.branchId,
          branchName: bName,
          category: tx.category,
          amount: tx.amount,
          totalAmount: tx.amount,
          date: tx.date || (tx.createdAt ? tx.createdAt.slice(0, 10) : ''),
          createdAt: tx.createdAt,
          reason: tx.notes || tx.category || 'فاتورة مصروف',
          details: `${tx.category || 'مصروف'} — بمبلغ ${tx.amount} ج.م ${tx.notes ? `(${tx.notes})` : ''}`,
          notes: tx.notes,
          status: tx.approvalStatus === 'approved' ? 'approved' : (tx.approvalStatus === 'rejected' ? 'rejected' : 'pending'),
          adminApproved: tx.approvalStatus === 'approved',
          attachmentData: tx.attachmentData,
          attachmentName: tx.attachmentName,
          attachmentType: tx.attachmentType,
          driveFileId: tx.driveFileId,
          driveFileUrl: tx.driveFileUrl,
          driveWebViewLink: tx.driveWebViewLink,
          driveMonthFolderUrl: tx.driveMonthFolderUrl,
          submittedByBranchManager: true,
          isDirectToAdmin: true
        }, isExpense ? 'expense' : 'income');
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
      if (isIdDeleted(idStr, r)) {
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
  }, [state.requests, state.leaveRequests, state.shiftSwaps, state.loans, state.resignationRequests, state.lateIncidents, state.adjustments, state.employees, state.approvalRules, state.finances, state.transactions, isBranch, cIdStr, branchEmpIdSet, deletedIdsSet]);

  const adminHiddenSet = useMemo(() => {
    return new Set((state.adminHiddenRequestIds || []).map(String));
  }, [state.adminHiddenRequestIds]);

  const isHiddenFromAdmin = (r) => {
    if (!r) return false;
    const rId = String(r.id || '');
    return Boolean(r.hiddenFromAdmin || adminHiddenSet.has(rId));
  };

  const hiddenAdminCount = isBranch ? 0 : allRequests.filter(isHiddenFromAdmin).length;
  
  // Higher management view: hide items with hiddenFromAdmin unless user toggles showHiddenAdminRequests
  const visibleAdminRequests = isBranch
    ? allRequests
    : allRequests.filter((r) => {
        if (!r) return false;
        if (showHiddenAdminRequests) return true;
        return !isHiddenFromAdmin(r);
      });

  const requests = visibleAdminRequests;

  const clearableAdminRequestsCount = useMemo(() => {
    return visibleAdminRequests.filter(r => !isPendingRequest(r)).length;
  }, [visibleAdminRequests]);

  const clearableAllRequestsCount = useMemo(() => {
    return allRequests.filter(r => !isPendingRequest(r)).length;
  }, [allRequests]);

  useEffect(() => {
    const handleSetFilter = (e) => {
      if (e?.detail?.filterType) {
        setFilterType(e.detail.filterType);
      }
      if (e?.detail?.inboxTab) {
        setInboxTab(e.detail.inboxTab);
      }
      if (e?.detail?.requestId || e?.detail?.filterType === 'expense') {
        const rId = e?.detail?.requestId ? String(e.detail.requestId) : '';
        const bName = e?.detail?.branchName ? String(e.detail.branchName) : '';
        setTimeout(() => {
          let match = null;
          if (rId) {
            match = allRequests.find(r => 
              String(r.id) === rId || 
              String(r.transactionId) === rId || 
              String(r.requestId) === rId ||
              rId.includes(String(r.id)) ||
              String(r.id).includes(rId)
            );
          }
          if (!match && (e?.detail?.filterType === 'expense' || rId.includes('notif_fin_') || rId.includes('trx_'))) {
            match = allRequests.find(r => 
              (r.type === 'expense' || r.type === 'financial_expense' || r.type === 'invoice') &&
              (r.status === 'pending' || !r.adminApproved) &&
              (!bName || String(r.branchName || '').includes(bName) || bName.includes(String(r.branchName || '')))
            ) || allRequests.find(r => 
              (r.type === 'expense' || r.type === 'financial_expense' || r.type === 'invoice') &&
              (r.status === 'pending' || !r.adminApproved)
            );
          }
          if (match) {
            handleOpenPreview(match);
          }
        }, 120);
      }
    };
    window.addEventListener('requests:set-filter-type', handleSetFilter);
    return () => window.removeEventListener('requests:set-filter-type', handleSetFilter);
  }, [allRequests]);

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

    // Filter by Modern Inbox Tab
    if (inboxTab !== 'all') {
      const isPending = !r.status || r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_target' || r.status === 'pending_local' || r.status === 'queued' || r.status === 'syncing';
      const isApproved = r.status === 'approved' || r.status === 'paid' || r.status === 'partial' || r.adminApproved === true;
      const isRejected = r.status === 'rejected';
      const isUrgent = r.type === 'complaint' || r.type === 'penalty_objection' || r.type === 'biometric_verification' || r.urgent;
      const isOutbox = r.status === 'pending_local' || r.status === 'queued' || r.status === 'syncing';

      if (inboxTab === 'pending' && !isPending) return false;
      if (inboxTab === 'completed' && !isApproved) return false;
      if (inboxTab === 'rejected' && !isRejected) return false;
      if (inboxTab === 'urgent' && !isUrgent) return false;
      if (inboxTab === 'outbox' && !isOutbox) return false;
    }

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
      } else if (filterType === 'biometric') {
        const isBio = r.type === 'biometric_verification' || r.type === 'biometric_registration' || r.type === 'biometric_reset' || r.type === 'تأكيد بصمة الوجه' || r.type === 'تأكيد بصمة اليد';
        if (!isBio) return false;
      } else if (filterType === 'shift_adjustment') {
        if (r.type !== 'shift_adjustment') return false;
      } else if (filterType === 'comp_off') {
        if (r.type !== 'comp_off_grant' && r.type !== 'leave_comp_off' && r.leaveType !== 'comp_off') return false;
      } else if (filterType === 'expense' || filterType === 'financial' || filterType === 'invoice') {
        const isExp = r.type === 'expense' || r.type === 'financial_expense' || r.type === 'invoice' || r.type === 'financial_alert' || r.subType === 'invoice';
        if (!isExp) return false;
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

    // Live Search across Employee Name, Code, Request ID, Branch, Details
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const emp = (state.employees || []).find(e => String(e.id) === String(r.employeeId) || (r.employeeCode && String(e.code) === String(r.employeeCode)));
      const empName = (emp ? getEmpDisplayName(emp) : (r.employeeName || '')).toLowerCase();
      const empCode = String(r.employeeCode || emp?.code || '').toLowerCase();
      const reqIdStr = String(r.id || '').toLowerCase();
      const detailsStr = String(r.details || r.reason || r.typeLabel || r.type || '').toLowerCase();
      const branchStr = String(r.branchName || emp?.branchName || '').toLowerCase();
      const matchesSearch = empName.includes(q) || empCode.includes(q) || reqIdStr.includes(q) || detailsStr.includes(q) || branchStr.includes(q);
      if (!matchesSearch) return false;
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

  // Calculate Executive KPI Stats across visible requests (matching active scope and date cycle)
  const kpis = useMemo(() => {
    let pendingCount = 0;
    let biometricCount = 0;
    let approvedMonthCount = 0;
    let todayLeavePermCount = 0;
    let pendingLoansCount = 0;
    let urgentCount = 0;
    let completedCount = 0;
    let rejectedCount = 0;
    let outboxCount = 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = todayStr.slice(0, 7);

    const passDateScope = (r) => {
      const isPending = !r.status || r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_target';
      if (isPending) return true;
      const rDate = getRequestDate(r);
      if (filterDate) {
        return rDate && rDate.startsWith(filterDate);
      }
      if ((filterMode === 'custom' || filterMode === 'range') && customFrom && customTo) {
        const from = customFrom <= customTo ? customFrom : customTo;
        const to = customFrom <= customTo ? customTo : customFrom;
        return Boolean(rDate && rDate >= from && rDate <= to);
      }
      if (typeof filterFn === 'function' && rDate) {
        return filterFn(rDate);
      }
      return true;
    };

    (requests || []).forEach((r) => {
      if (!r) return;
      const isPending = !r.status || r.status === 'pending' || r.status === 'pending_admin' || r.status === 'pending_target' || r.status === 'pending_local' || r.status === 'queued' || r.status === 'syncing';
      const isApproved = r.status === 'approved' || r.status === 'paid' || r.status === 'partial' || r.adminApproved;
      const isRejected = r.status === 'rejected';
      const isUrgent = r.type === 'complaint' || r.type === 'penalty_objection' || r.type === 'biometric_verification' || r.urgent;
      const isOutbox = r.status === 'pending_local' || r.status === 'queued' || r.status === 'syncing';
      const rDate = getRequestDate(r);
      const isBio = r.type === 'biometric_verification' || r.type === 'biometric_registration' || r.type === 'biometric_reset' || r.type === 'تأكيد بصمة الوجه' || r.type === 'تأكيد بصمة اليد';
      const inScope = passDateScope(r);

      if (isPending) pendingCount++;
      if (isBio && isPending) biometricCount++;
      if (isApproved && rDate && rDate.startsWith(thisMonthStr)) approvedMonthCount++;
      if (isApproved && inScope) completedCount++;
      if (isRejected && inScope) rejectedCount++;
      if (isUrgent && isPending) urgentCount++;
      if (isOutbox) outboxCount++;
      if ((r.type === 'leave' || r.type === 'permission' || r.type === 'late_permission') && (r.startDate === todayStr || r.date === todayStr)) todayLeavePermCount++;
      if ((r.type === 'loan' || r.type === 'advance' || r.type === 'meds') && isPending) pendingLoansCount++;
    });

    const scopedTotal = (requests || []).filter(passDateScope).length;

    return {
      pendingCount,
      biometricCount,
      approvedMonthCount,
      todayLeavePermCount,
      pendingLoansCount,
      urgentCount,
      completedCount,
      rejectedCount,
      outboxCount,
      totalCount: scopedTotal
    };
  }, [requests, filterDate, filterMode, customFrom, customTo, filterFn]);

  // Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map(r => r.id)));
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      let updatedEmployees = [...(state.employees || [])];
      let updatedActiveShifts = { ...(state.activeShifts || {}) };

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
        
        const isCheckInOnly = approvedTargetReq.punchType === 'in' || 
                              approvedTargetReq.targetAction === 'shift_start' || 
                              (!approvedTargetReq.timeOut && Boolean(approvedTargetReq.timeIn)) ||
                              (String(approvedTargetReq.details || '').includes('حضور فقط') && !approvedTargetReq.timeOut);
        
        const isCheckOutOnly = approvedTargetReq.punchType === 'out' || approvedTargetReq.targetAction === 'shift_end';
        const timeIn = approvedTargetReq.timeIn || '09:00';
        const timeOut = isCheckInOnly ? '' : (approvedTargetReq.timeOut || (isCheckOutOnly ? '17:00' : '17:00'));
        const empBreak = emp?.breakHours || emp?.defaultBreakHours || (emp?.branchesDetails && emp.branchesDetails[0]?.breakHours) || 0;
        const bH = Math.max(0, parseFloat(approvedTargetReq.breakHours !== undefined && approvedTargetReq.breakHours !== null ? approvedTargetReq.breakHours : empBreak) || 0);

        let calcGrossHrs = 0;
        let calcNetTotalHrs = 0;
        if (!isCheckInOnly && timeIn && timeOut) {
          const [inH, inM] = timeIn.split(':').map(Number);
          const [outH, outM] = timeOut.split(':').map(Number);
          let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
          if (diff < 0) diff += 24 * 60;
          calcGrossHrs = Math.round((diff / 60) * 100) / 100;
          calcNetTotalHrs = Math.max(0, Math.round((calcGrossHrs - bH) * 100) / 100);
        }

        const daySched = getEmployeeDaySchedule(approvedTargetReq.employeeId, punchDate, state);
        const profileHours = parseFloat(emp?.workHoursPerDay || emp?.workHours) || 8;
        let schedHours = profileHours;
        if (daySched && daySched.start && daySched.end && daySched.type !== 'off') {
          const [sH, sM] = daySched.start.split(':').map(Number);
          const [eH, eM] = daySched.end.split(':').map(Number);
          let sMins = sH * 60 + (sM || 0);
          let eMins = eH * 60 + (eM || 0);
          if (eMins <= sMins) eMins += 24 * 60;
          schedHours = Math.round(((eMins - sMins) / 60) * 100) / 100;
        } else if (daySched && daySched.hours && daySched.type !== 'off') {
          schedHours = parseFloat(daySched.hours) || profileHours;
        } else if (approvedTargetReq.scheduledHours) {
          schedHours = parseFloat(approvedTargetReq.scheduledHours);
        }

        const regularHours = isCheckInOnly ? 0 : Math.min(calcNetTotalHrs, schedHours);
        const overtimeHours = isCheckInOnly ? 0 : Math.max(0, Math.round((calcNetTotalHrs - schedHours) * 100) / 100);
        const overtimeStatus = overtimeHours > 0 ? 'approved' : 'none';

        const existingShiftIndex = updatedShifts.findIndex(s => 
          (approvedTargetReq.shiftId && s.id === approvedTargetReq.shiftId) ||
          ((String(s.employeeId) === String(approvedTargetReq.employeeId) || (emp?.code && String(s.employeeCode) === String(emp.code))) &&
          s.date === punchDate && (!s.timeOut || s.timeOut === '—' || approvedTargetReq.shiftId))
        );

        if (existingShiftIndex >= 0) {
          const existingShift = updatedShifts[existingShiftIndex];
          const hasExistingTimeOut = existingShift.timeOut && existingShift.timeOut !== '—';

          if (isCheckInOnly && !hasExistingTimeOut) {
            // الموظف حالياً في شيفت ولم ينتهِ: تعديل وقت الدخول فقط دون تسجيل خروج ودون إنهاء الوردية
            updatedShifts[existingShiftIndex] = {
              ...existingShift,
              timeIn,
              timeOut: '',
              isManual: true,
              manualPunch: true,
              source: 'manual_admin',
              adminApproved: true,
              statusLabel: 'وردية نشطة (بصمة حضور معدلة)',
              note: `بصمة حضور معدلة ومعتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'}) — الوردية مستمرة`,
              updatedAt: new Date().toISOString()
            };
          } else {
            const effectiveTimeOut = isCheckInOnly ? existingShift.timeOut : timeOut;
            const effectiveTimeIn = isCheckOutOnly ? (existingShift.timeIn || timeIn) : timeIn;

            let finalGross = calcGrossHrs;
            let finalNet = calcNetTotalHrs;
            if (effectiveTimeIn && effectiveTimeOut) {
              const [inH, inM] = effectiveTimeIn.split(':').map(Number);
              const [outH, outM] = effectiveTimeOut.split(':').map(Number);
              let diff = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
              if (diff < 0) diff += 24 * 60;
              finalGross = Math.round((diff / 60) * 100) / 100;
              finalNet = Math.max(0, Math.round((finalGross - bH) * 100) / 100);
            }
            const finalReg = Math.min(finalNet, schedHours);
            const finalOt = Math.max(0, Math.round((finalNet - schedHours) * 100) / 100);

            updatedShifts[existingShiftIndex] = {
              ...existingShift,
              timeIn: effectiveTimeIn,
              timeOut: effectiveTimeOut,
              breakHours: bH,
              hours: finalReg,
              workHours: finalReg,
              netHours: finalReg,
              regularHours: finalReg,
              actualWorkedHours: finalNet,
              grossHours: finalGross,
              scheduledHours: schedHours,
              overtimeHours: finalOt,
              overtimeStatus: finalOt > 0 ? 'approved' : 'none',
              isManual: true,
              manualPunch: true,
              source: 'manual_admin',
              adminApproved: true,
              note: finalOt > 0
                ? `بصمة معدلة ومعتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'}) — (أساسي: ${finalReg} س + إضافي معتمد: ${finalOt} س)`
                : `بصمة معدلة ومعتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'})`,
              updatedAt: new Date().toISOString()
            };
          }
        } else {
          updatedShifts.unshift({
            id: `shift_manual_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            employeeId: approvedTargetReq.employeeId,
            employeeCode: emp?.code || approvedTargetReq.employeeCode || '',
            employeeName: emp?.name || approvedTargetReq.employeeName || 'موظف',
            branchId: approvedTargetReq.branchId || emp?.branchId || '',
            date: punchDate,
            timeIn,
            timeOut: isCheckInOnly ? '' : timeOut,
            breakHours: bH,
            hours: regularHours,
            workHours: regularHours,
            netHours: regularHours,
            regularHours: regularHours,
            actualWorkedHours: calcNetTotalHrs,
            grossHours: calcGrossHrs,
            scheduledHours: schedHours,
            overtimeHours: overtimeHours,
            overtimeStatus: overtimeStatus,
            isManual: true,
            manualPunch: true,
            source: 'manual_admin',
            adminApproved: true,
            statusLabel: isCheckInOnly ? 'وردية نشطة (بصمة حضور معدلة)' : 'بصمة يدوية معتمدة',
            note: overtimeHours > 0
              ? `بصمة يدوية معتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'}) — (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)`
              : `بصمة يدوية معتمدة من الإدارة العليا (${approvedTargetReq.reason || 'بناءً على طلب مدير الفرع'})`,
            createdAt: new Date().toISOString()
          });
        }

        // تحديث أو إنهاء الشفت في activeShifts
        if (isCheckInOnly) {
          // الموظف حالياً في شيفت: نعدل توقيت الدخول في الشفت النشط دون حذفه لتبقى الوردية جارية
          if (updatedActiveShifts) {
            const empIdStr = String(approvedTargetReq.employeeId);
            const empCodeStr = emp?.code ? String(emp.code) : '';
            const activeKey = updatedActiveShifts[empIdStr] 
              ? empIdStr 
              : (empCodeStr && updatedActiveShifts[empCodeStr] ? empCodeStr : empIdStr);
            if (updatedActiveShifts[activeKey]) {
              updatedActiveShifts[activeKey] = {
                ...updatedActiveShifts[activeKey],
                timeIn: timeIn,
                startTime: `${punchDate}T${timeIn}:00`,
                date: punchDate,
                isModified: true
              };
            }
          }
        } else if (timeOut && approvedTargetReq.employeeId && updatedActiveShifts) {
          delete updatedActiveShifts[approvedTargetReq.employeeId];
          delete updatedActiveShifts[String(approvedTargetReq.employeeId)];
          if (emp?.code) {
            delete updatedActiveShifts[emp.code];
            delete updatedActiveShifts[String(emp.code)];
          }
        }
      }

      // 0.2 Biometric Photo Verification Approval
      if (approvedTargetReq.type === 'biometric_verification' || approvedTargetReq.requestType === 'biometric_verification') {
        const empId = approvedTargetReq.employeeId;
        const reqDate = approvedTargetReq.date || (approvedTargetReq.createdAt ? approvedTargetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const actionType = approvedTargetReq.targetAction || approvedTargetReq.actionType;

        updatedShifts = updatedShifts.map(s => {
          const isMatch = (s.id === approvedTargetReq.shiftId) ||
            ((String(s.employeeId) === String(empId) || (approvedTargetReq.employeeCode && String(s.employeeCode) === String(approvedTargetReq.employeeCode))) && s.date === reqDate);
          if (isMatch) {
            const isStart = actionType === 'shift_start';
            return {
              ...s,
              statusLabel: isStart ? 'حضور بالصورة (معتمد)' : 'انصراف بالصورة (معتمد)',
              adminApproved: true,
              approvedBy: 'الإدارة العليا',
              approvedAt: new Date().toISOString(),
              photoUrl: approvedTargetReq.photoUrl || s.photoUrl,
              drivePhotoUrl: approvedTargetReq.drivePhotoUrl || s.drivePhotoUrl,
              note: (s.note ? s.note.replace('بانتظار اعتماد الإدارة', 'معتمد من الإدارة العليا') : '')
            };
          }
          return s;
        });
      }

      // ── Penalty, Early Exit, Disciplinary Violation, & Branch Adjustment Approval ──
      const isPenaltyType =
        approvedTargetReq.type === 'penalty' ||
        approvedTargetReq.type === 'early_exit' ||
        approvedTargetReq.type === 'disciplinary_penalty' ||
        approvedTargetReq.subType === 'disciplinary_penalty' ||
        approvedTargetReq.type === 'violation' ||
        approvedTargetReq.type === 'deduction' ||
        String(approvedTargetReq.id || '').startsWith('disc_') ||
        String(approvedTargetReq.id || '').startsWith('req_adj_');

      if (isPenaltyType) {
        const emp = (state.employees || []).find((e) => e && String(e.id) === String(approvedTargetReq.employeeId));
        let amount = 0;
        const workDays = emp ? (parseFloat(emp.workDaysPerMonth) || parseFloat(emp.workDays) || 26) : 26;
        const salary = emp ? (parseFloat(emp.salary) || 0) : 0;
        const dailyRate = approvedTargetReq.dailyRate ? parseFloat(approvedTargetReq.dailyRate) : (workDays > 0 ? (salary / workDays) : (salary / 30));

        if (approvedTargetReq.impactType === 'deduction_days' || approvedTargetReq.deductionDays || approvedTargetReq.penaltyDays) {
          const days = parseFloat(approvedTargetReq.impactVal || approvedTargetReq.deductionDays || approvedTargetReq.penaltyDays || 1);
          amount = Math.round(dailyRate * days * 100) / 100;
        } else if (approvedTargetReq.impactType === 'fixed_amount' || approvedTargetReq.deductionFixedAmount) {
          amount = parseFloat(approvedTargetReq.impactVal || approvedTargetReq.deductionFixedAmount) || 0;
        } else if (approvedTargetReq.amount || approvedTargetReq.penaltyAmount) {
          amount = parseFloat(approvedTargetReq.amount || approvedTargetReq.penaltyAmount) || 0;
        }

        if (amount > 0) {
          const ruleTitle = approvedTargetReq.ruleTitle || approvedTargetReq.violationTitle || approvedTargetReq.reason || approvedTargetReq.details || 'مخالفة لائحية';
          const actionName = approvedTargetReq.actionTitle || approvedTargetReq.penaltyAction || 'خصم من الراتب';
          const penaltyDesc = `خصم جزاء تأديبي لائحى: ${ruleTitle} (${actionName} - ${amount} ج.م)`;
          const reqDate = approvedTargetReq.date || approvedTargetReq.startDate || (approvedTargetReq.createdAt ? approvedTargetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));

          // Ensure adjustment exists in updatedAdjustments
          const existingAdjIdx = updatedAdjustments.findIndex(a => a.requestId === approvedTargetReq.id || a.id === `adj_pen_${approvedTargetReq.id}` || a.id === `adj_disc_${approvedTargetReq.id}`);
          const newAdj = {
            id: `adj_pen_${approvedTargetReq.id || Date.now()}`,
            requestId: approvedTargetReq.id,
            employeeId: approvedTargetReq.employeeId,
            employeeName: emp?.name || approvedTargetReq.employeeName,
            employeeCode: emp?.code || approvedTargetReq.employeeCode,
            branchId: approvedTargetReq.branchId || emp?.branchId || null,
            type: 'deduction',
            subType: 'disciplinary_penalty',
            amount,
            description: penaltyDesc,
            notes: penaltyDesc,
            reason: penaltyDesc,
            date: reqDate,
            createdAt: new Date().toISOString()
          };

          if (existingAdjIdx >= 0) {
            updatedAdjustments[existingAdjIdx] = { ...updatedAdjustments[existingAdjIdx], ...newAdj };
          } else {
            updatedAdjustments.unshift(newAdj);
          }
        }
      }

      if (approvedTargetReq.type === 'bonus') {
        const emp = (state.employees || []).find((e) => e && String(e.id) === String(approvedTargetReq.employeeId));
        const amount = parseFloat(approvedTargetReq.amount) || 0;
        const reqDate = approvedTargetReq.date || approvedTargetReq.startDate || (approvedTargetReq.createdAt ? approvedTargetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const existingAdjIdx = updatedAdjustments.findIndex(a => a.requestId === approvedTargetReq.id || a.id === `adj_bonus_${approvedTargetReq.id}`);
        const newBonusAdj = {
          id: `adj_bonus_${approvedTargetReq.id || Date.now()}`,
          requestId: approvedTargetReq.id,
          employeeId: approvedTargetReq.employeeId,
          employeeName: emp?.name || approvedTargetReq.employeeName,
          employeeCode: emp?.code || approvedTargetReq.employeeCode,
          branchId: approvedTargetReq.branchId || emp?.branchId || null,
          type: 'bonus',
          amount,
          description: approvedTargetReq.details || approvedTargetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
          notes: approvedTargetReq.details || approvedTargetReq.reason || 'مكافأة معتمدة من الإدارة العليا',
          reason: approvedTargetReq.reason || approvedTargetReq.details || 'مكافأة معتمدة من الإدارة العليا',
          date: reqDate,
          createdAt: new Date().toISOString()
        };
        if (existingAdjIdx >= 0) {
          updatedAdjustments[existingAdjIdx] = { ...updatedAdjustments[existingAdjIdx], ...newBonusAdj };
        } else {
          updatedAdjustments.unshift(newBonusAdj);
        }
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

      let updatedPermRequests = [...(state.permissionRequests || [])];
      if (approvedTargetReq.type === 'permission' || approvedTargetReq.type === 'إذن' || approvedTargetReq.type === 'late_permission' || approvedTargetReq.type === 'early_leave' || approvedTargetReq.permType === 'late' || approvedTargetReq.permType === 'early' || approvedTargetReq.type === 'permission_request') {
        const permDate = approvedTargetReq.date || approvedTargetReq.startDate;
        updatedShifts = applyApprovedPermissionsToShifts({
          ...state,
          requests: updatedRequests,
          shifts: updatedShifts
        });

        const pIdx = updatedPermRequests.findIndex(p => p.id === approvedTargetReq.id || (String(p.employeeId) === String(approvedTargetReq.employeeId) && p.date === permDate));
        const approvedPermObj = {
          ...approvedTargetReq,
          status: 'approved',
          adminApproved: true,
          approvedAt: new Date().toISOString()
        };
        if (pIdx >= 0) {
          updatedPermRequests[pIdx] = { ...updatedPermRequests[pIdx], ...approvedPermObj };
        } else {
          updatedPermRequests.unshift(approvedPermObj);
        }

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
            (ros) => !(String(ros.employeeId) === String(approvedTargetReq.employeeId) && String(ros.branchId || '') === targetBStr && (ros.month === approvedTargetReq.month || !approvedTargetReq.month || !ros.month))
          );
          updatedRosters.unshift(activeRosterObj);
        }
      }

      // Shift Adjustment Approval: Update Roster, Waive Penalties and Clear Late Deductions
      if (approvedTargetReq.type === 'shift_adjustment') {
        const targetEmp = (state.employees || []).find(e => String(e.id) === String(approvedTargetReq.employeeId));
        const datesToAdjust = Array.isArray(approvedTargetReq.dates) && approvedTargetReq.dates.length > 0
          ? approvedTargetReq.dates
          : (approvedTargetReq.date ? [approvedTargetReq.date] : []);

        const normalizedSch = normalizeSchedule(approvedTargetReq.schedule || approvedTargetReq.newSchedule);
        const targetMonth = approvedTargetReq.month || (datesToAdjust[0] ? datesToAdjust[0].slice(0, 7) : new Date().toISOString().slice(0, 7));

        if (normalizedSch && Object.keys(normalizedSch).length > 0) {
          const existingRosterIdx = updatedRosters.findIndex(
            (ros) => String(ros.employeeId) === String(approvedTargetReq.employeeId) &&
                     (ros.month === targetMonth || !ros.month)
          );

          if (existingRosterIdx >= 0) {
            updatedRosters[existingRosterIdx] = {
              ...updatedRosters[existingRosterIdx],
              schedule: {
                ...(updatedRosters[existingRosterIdx].schedule || {}),
                ...normalizedSch
              },
              updatedAt: new Date().toISOString()
            };
          } else {
            updatedRosters.unshift({
              id: `roster_${Date.now()}`,
              employeeId: approvedTargetReq.employeeId,
              branchId: targetEmp?.branchId || approvedTargetReq.branchId || null,
              month: targetMonth,
              schedule: normalizedSch,
              status: 'approved',
              approvedAt: new Date().toISOString()
            });
          }
        }

        // Cancel any late penalties on these dates for this employee
        updatedRequests = updatedRequests.map((r) => {
          if (
            String(r.employeeId) === String(approvedTargetReq.employeeId) &&
            datesToAdjust.includes(r.date) &&
            (r.subType === 'lateness' || r.type === 'late_penalty' || String(r.id).startsWith('req_late_inc_'))
          ) {
            return {
              ...r,
              status: 'cancelled',
              isCancelled: true,
              amount: 0,
              deductionMinutes: 0,
              actionType: 'grace',
              cancellationReason: `تم إلغاء الجزاء تلقائياً لاعتماد تعديل الشيفت (${approvedTargetReq.id || ''})`
            };
          }
          return r;
        });

        // Remove adjustments linked to penalties on these dates
        updatedAdjustments = updatedAdjustments.filter((a) => {
          if (
            String(a.employeeId) === String(approvedTargetReq.employeeId) &&
            datesToAdjust.includes(a.date) &&
            (a.type === 'penalty' || a.type === 'deduction' || String(a.id).startsWith('adj_pen_') || String(a.id).startsWith('adj_disc_'))
          ) {
            return false;
          }
          return true;
        });
      }

      // Comp-Off Grant Approval: Credit employee's compOffBalance
      if (approvedTargetReq.type === 'comp_off_grant') {
        const creditDays = parseFloat(approvedTargetReq.daysCount || approvedTargetReq.compOffDays || 1) || 1;
        updatedEmployees = updatedEmployees.map((e) => {
          if (e && String(e.id) === String(approvedTargetReq.employeeId)) {
            const curBal = parseFloat(e.compOffBalance || 0);
            return {
              ...e,
              compOffBalance: curBal + creditDays
            };
          }
          return e;
        });
      }

      let updatedLeaveRequests = [...(state.leaveRequests || [])];
      let updatedLeaveHistory = [...(state.leaveHistory || [])];
      if (['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave', 'leave_comp_off', 'comp_off'].includes(approvedTargetReq.type) || approvedTargetReq.leaveType === 'comp_off') {
        const leaveTypeResolved = approvedTargetReq.leaveType || (approvedTargetReq.type === 'leave_comp_off' || approvedTargetReq.type === 'comp_off' ? 'comp_off' : 'annual');
        const daysCountResolved = parseInt(approvedTargetReq.daysCount || approvedTargetReq.days || 1, 10);
        const approvedLeaveObj = {
          id: approvedTargetReq.id || `leave_${Date.now()}`,
          originalRequestId: approvedTargetReq.id,
          employeeId: approvedTargetReq.employeeId,
          employeeCode: approvedTargetReq.employeeCode,
          employeeName: approvedTargetReq.employeeName,
          leaveType: leaveTypeResolved,
          startDate: approvedTargetReq.startDate || approvedTargetReq.date,
          endDate: approvedTargetReq.endDate || approvedTargetReq.startDate || approvedTargetReq.date,
          daysCount: daysCountResolved,
          status: 'approved',
          adminApproved: true,
          branchApproved: true,
          reason: approvedTargetReq.reason || approvedTargetReq.details || '',
          approvedAt: new Date().toISOString()
        };

        if (leaveTypeResolved === 'comp_off' || approvedTargetReq.type === 'leave_comp_off') {
          updatedEmployees = updatedEmployees.map((e) => {
            if (e && String(e.id) === String(approvedTargetReq.employeeId)) {
              const curBal = parseFloat(e.compOffBalance || 0);
              return {
                ...e,
                compOffBalance: Math.max(0, curBal - daysCountResolved)
              };
            }
            return e;
          });
        }

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

      let updatedResignations = (state.resignationRequests || []).map((r) => {
        if (String(r.id) === String(reqId)) {
          return {
            ...r,
            status: 'approved',
            adminStatus: 'approved',
            adminApproved: true,
            adminApprovedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });

      if (approvedTargetReq.type === 'withdraw') {
        updatedResignations = updatedResignations.map((r) => {
          if (String(r.employeeId) === String(approvedTargetReq.employeeId) && r.type === 'resignation') {
            return {
              ...r,
              isCancelled: true,
              adminStatus: 'cancelled',
              status: 'cancelled',
              cancelledReason: 'تم إلغاء الاستقالة بسبب قبول طلب التراجع عن الاستقالة',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
      }

      // ── Biometric Self-Registration Approval Integration ──
      if (approvedTargetReq.type === 'biometric_registration' || approvedTargetReq.requestType === 'biometric_registration') {
        const empId = approvedTargetReq.employeeId;
        const targetCode = approvedTargetReq.employeeCode;
        const descriptors = approvedTargetReq.descriptors || approvedTargetReq.descriptor || approvedTargetReq.face_descriptor;
        const bioType = approvedTargetReq.biometricType || 'face';

        updatedEmployees = updatedEmployees.map((e) => {
          const isMatch = String(e.id) === String(empId) ||
            (targetCode && String(e.code) === String(targetCode)) ||
            (e.code && String(e.code) === String(empId));

          if (isMatch) {
            return {
              ...e,
              has_face_descriptor: bioType !== 'hand',
              face_descriptor: bioType !== 'hand' ? descriptors : e.face_descriptor,
              has_hand_descriptor: bioType === 'hand',
              hand_descriptor: bioType === 'hand' ? descriptors : e.hand_descriptor,
              preferred_biometric: bioType,
              biometricApprovedAt: new Date().toISOString(),
              biometricApprovedBy: 'الإدارة العليا'
            };
          }
          return e;
        });

        // Persistent database / IndexedDB storage
        if (bioType === 'hand') {
          saveHandDescriptor(empId, descriptors).catch(err => console.warn('[Biometric] Failed saving hand descriptor to DB:', err));
        } else {
          saveFaceDescriptor(empId, descriptors).catch(err => console.warn('[Biometric] Failed saving face descriptor to DB:', err));
        }
      }

      // ── Biometric Reset Approval Integration ──
      if (approvedTargetReq.type === 'biometric_reset' || approvedTargetReq.requestType === 'biometric_reset') {
        const empId = approvedTargetReq.employeeId;
        const targetCode = approvedTargetReq.employeeCode;

        updatedEmployees = updatedEmployees.map((e) => {
          const isMatch = String(e.id) === String(empId) ||
            (targetCode && String(e.code) === String(targetCode)) ||
            (e.code && String(e.code) === String(empId));

          if (isMatch) {
            const now = new Date().toISOString();
            return {
              ...e,
              has_face_descriptor: false,
              face_descriptor: null,
              has_hand_descriptor: false,
              hand_descriptor: null,
              biometricFaceResetAt: now,
              biometricHandResetAt: now,
              biometricResetAt: now
            };
          }
          return e;
        });

        // Delete from persistent database / IndexedDB
        deleteFaceDescriptor(empId).catch(() => {});
        deleteHandDescriptor(empId).catch(() => {});
      }

      const decisionNotif = createRequestDecisionNotification({
        requestId: approvedTargetReq.id,
        employeeId: approvedTargetReq.employeeId,
        type: approvedTargetReq.type,
        action: 'approved',
        approverRole: 'admin',
        title: approvedTargetReq.type === 'penalty_objection' ? '✅ تم قبول تظلمك وإلغاء الجزاء' :
               (approvedTargetReq.type === 'biometric_registration' ? '🎉 تم اعتماد وتفعيل بصمتك الذكية' :
               (approvedTargetReq.type === 'biometric_reset' ? '🔄 تمت الموافقة على إعادة تسجيل بصمتك' : undefined)),
        message: approvedTargetReq.type === 'penalty_objection' ? 'تم قبول تظلمك من قِبل الإدارة العليا وإلغاء الجزاء والخصم المالي' :
                 (approvedTargetReq.type === 'biometric_registration' ? 'تمت مراجعة بصمتك واعتمادها بنجاح، يمكنك الآن تسجيل الحضور والانصراف بها عبر الكشك الذكي' :
                 (approvedTargetReq.type === 'biometric_reset' ? 'تمت الموافقة على طلبك ومسح البصمة القديمة، يرجى تسجيل بصمتك الجديدة الآن' : undefined)),
        details: approvedTargetReq.details || approvedTargetReq.reason || (approvedTargetReq.amount ? `${approvedTargetReq.amount} ج.م` : '')
      });

      // Financial / Expense / Branch Invoice approval sync
      const isExpenseReq = Boolean(
        approvedTargetReq.type === 'expense' ||
        approvedTargetReq.type === 'financial_expense' ||
        approvedTargetReq.type === 'financial_alert' ||
        approvedTargetReq.type === 'invoice' ||
        approvedTargetReq.subType === 'invoice' ||
        approvedTargetReq.transactionId ||
        String(approvedTargetReq.id || '').startsWith('req_fin_') ||
        String(approvedTargetReq.id || '').startsWith('req_tx_')
      );

      let updatedFinances = [...(state.finances || [])];
      let updatedTransactions = [...(state.transactions || [])];

      if (isExpenseReq) {
        const targetTxId = approvedTargetReq.transactionId || approvedTargetReq.id;
        const cleanTxId = String(targetTxId).replace(/^req_(fin|tx)_/, '');

        updatedFinances = updatedFinances.map(f => {
          if (String(f.id) === String(targetTxId) || String(f.id) === String(cleanTxId) || String(f.requestId) === String(reqId)) {
            return {
              ...f,
              approvalStatus: 'approved',
              adminApproved: true,
              status: 'approved',
              approvedAt: new Date().toISOString()
            };
          }
          return f;
        });

        updatedTransactions = updatedTransactions.map(tx => {
          if (String(tx.id) === String(targetTxId) || String(tx.id) === String(cleanTxId) || String(tx.requestId) === String(reqId)) {
            return {
              ...tx,
              approvalStatus: 'approved',
              adminApproved: true,
              status: 'approved',
              approvedAt: new Date().toISOString()
            };
          }
          return tx;
        });

        const branchName = approvedTargetReq.branchName || approvedTargetReq.branch || 'الفرع';
        const expNotif = {
          id: `notif_exp_app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: '✅ اعتماد فاتورة / مصروف',
          message: `تم اعتماد الفاتورة / المصروف بقيمة ${approvedTargetReq.amount || 0} ج.م لفرع (${branchName}) بنجاح`,
          type: 'financial_approved',
          branchName: branchName,
          branchId: approvedTargetReq.branchId || approvedTargetReq.branch_id,
          timestamp: new Date().toISOString(),
          read: false,
          targetTab: 'income-expenses'
        };
        updatedNotifications.unshift(expNotif);
      }

      const updatedNotifications = [
        decisionNotif,
        ...(state.notifications || []).map(n => String(n.requestId) === String(reqId) ? { ...n, read: true } : n)
      ];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        employees: updatedEmployees,
        loans: updatedLoans,
        rosters: updatedRosters,
        adjustments: updatedAdjustments,
        shifts: updatedShifts,
        activeShifts: updatedActiveShifts,
        leaveRequests: updatedLeaveRequests,
        permissionRequests: updatedPermRequests,
        leaveHistory: updatedLeaveHistory,
        shiftSwaps,
        resignationRequests: updatedResignations,
        lateIncidents: updatedLateIncidents,
        finances: updatedFinances,
        transactions: updatedTransactions,
        notifications: updatedNotifications
      };
      if (setState) setState(updatedState);
      showToast?.('✅ تم اعتماد موافقة الطلب وتطبيق التأثير فوراً على الأجور والجداول');
      if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error:', err));
      }
      enqueueRequestDecision({
        requestId: reqId,
        decision: 'approve',
        newStatus: 'approved',
        reviewer: { role: effectiveRole, id: state.currentUser?.id || 'admin' },
        branchId: approvedTargetReq.branchId || approvedTargetReq.branch_id
      }).catch(err => console.warn('Outbox enqueue decision error:', err));

      // إشعار فوري عبر Gmail بتطبيق الجزاء / الخصم المعتمد
      const cleanReqType = String(approvedTargetReq.type || '').trim().toLowerCase();
      if (cleanReqType === 'penalty' || cleanReqType === 'early_exit' || cleanReqType === 'disciplinary_penalty' || cleanReqType === 'violation' || String(approvedTargetReq.id || '').startsWith('disc_')) {
        const targetEmp = (state.employees || []).find((e) => e && String(e.id) === String(approvedTargetReq.employeeId));
        notifyOnPenaltyApplied({
          state: updatedState,
          emp: targetEmp,
          penalty: {
            ...approvedTargetReq,
            actionTitle: approvedTargetReq.actionTitle || approvedTargetReq.penaltyAction || 'جزاء تأديبي معتمد',
            amount: parseFloat(approvedTargetReq.amount || approvedTargetReq.penaltyAmount) || 0,
            deductionDays: parseFloat(approvedTargetReq.deductionDays || approvedTargetReq.penaltyDays || (approvedTargetReq.impactType === 'deduction_days' ? approvedTargetReq.impactVal : 0)) || 0,
            date: approvedTargetReq.date || approvedTargetReq.startDate || new Date().toISOString().slice(0, 10),
            reason: approvedTargetReq.ruleTitle || approvedTargetReq.violationTitle || approvedTargetReq.reason || approvedTargetReq.details || 'تطبيق سياسة لائحة العمل والجزاءات'
          },
          branchName: approvedTargetReq.branchName || targetEmp?.branchName,
          source: cleanReqType === 'early_exit' ? 'late_penalty' : 'disciplinary'
        }).catch((e) => console.warn('Penalty email dispatch error:', e));
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
      const locks = state.orgSettings?.ownerModificationLocks || {};

      // 1. Master lock for all requests
      if (locks.lockApproveRequests) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveRequests',
          actionTitle: `اعتماد طلب (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `نوع الطلب: ${targetReq.typeLabel || targetReq.type || 'طلب عام'}`,
          onExecute: performApprove
        });
        return;
      }

      const reqType = String(targetReq.type || '').trim().toLowerCase();
      const isLeave = ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave', 'casual', 'marriage', 'maternity', 'bereavement'].includes(reqType);
      const isLoan = ['loan', 'advance', 'meds', 'credit_medicine', 'سلفة'].includes(reqType);
      const isPermission = ['permission', 'permission_request', 'إذن', 'late_permission', 'early_leave'].includes(reqType);
      const isDisc = reqType === 'disciplinary_penalty' || reqType === 'violation' || reqType === 'penalty' || reqType === 'early_exit' || String(targetReq.id || '').startsWith('disc_');
      const isSwap = ['swap', 'shift_swap', 'shift_edit', 'تبديل'].includes(reqType);
      const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request', 'schedule_edit'].includes(reqType);
      const isPunch = ['punch_correction', 'manual_punch', 'attendance_punch', 'تأكيد بصمة الوجه', 'تأكيد بصمة اليد', 'biometric_verification'].includes(reqType);
      const isBiometricReg = reqType === 'biometric_registration';
      const isBiometricReset = reqType === 'biometric_reset';
      const isResignation = ['resignation', 'resignation_request', 'استقالة'].includes(reqType);
      const isBonus = ['bonus', 'reward', 'overtime', 'مكافأة'].includes(reqType);
      const isComplaint = ['complaint', 'eval_edit_request', 'penalty_objection', 'objection', 'شكوى'].includes(reqType);

      if (isLeave && locks.lockApproveLeaves) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveLeaves',
          actionTitle: `اعتماد طلب إجازة (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `نوع الإجازة: ${targetReq.leaveType || 'سنوية'} · المدة: ${targetReq.daysCount || targetReq.days || 1} يوم`,
          onExecute: performApprove
        });
        return;
      }

      if (isLoan && locks.lockApproveLoans) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveLoans',
          actionTitle: `اعتماد طلب سلفة / أدوية آجل (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `المبلغ: ${targetReq.amount || targetReq.totalAmount} ج.م`,
          onExecute: performApprove
        });
        return;
      }

      if (isPermission && locks.lockApprovePermissions) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApprovePermissions',
          actionTitle: `اعتماد إذن استئذان (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `التاريخ: ${targetReq.date || ''} · الساعات: ${targetReq.hours || targetReq.time || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isDisc && locks.lockApproveDisciplinaryPenalties) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveDisciplinaryPenalties',
          actionTitle: `اعتماد جزاء تأديبي لائحى (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `المخالفة: ${targetReq.ruleTitle || targetReq.violationTitle || targetReq.reason || 'مخالفة لائحية'}`,
          onExecute: performApprove
        });
        return;
      }

      if (isSwap && locks.lockApproveShiftSwaps) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveShiftSwaps',
          actionTitle: `اعتماد تبديل وردية (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `التاريخ: ${targetReq.date || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isRoster && locks.lockApproveRosters) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveRosters',
          actionTitle: `اعتماد تعديل جدول شهري (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `الشهر: ${targetReq.month || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isPunch && (locks.lockApproveManualPunches || (reqType === 'biometric_verification' && locks.lockApproveBiometricVerification))) {
        executeWithOwnerGuard?.({
          lockKey: (reqType === 'biometric_verification' && locks.lockApproveBiometricVerification) ? 'lockApproveBiometricVerification' : 'lockApproveManualPunches',
          actionTitle: `اعتماد تسجيل/تصحيح بصمة (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `التاريخ: ${targetReq.date || ''} · الوقت: ${targetReq.time || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isBiometricReg && locks.lockApproveBiometricRegistration) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveBiometricRegistration',
          actionTitle: `اعتماد تسجيل بصمة جديدة (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `النوع: ${targetReq.biometricType === 'hand' ? 'بصمة اليد' : 'بصمة الوجه'}`,
          onExecute: performApprove
        });
        return;
      }

      if (isBiometricReset && locks.lockApproveBiometricReset) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveBiometricReset',
          actionTitle: `اعتماد مسح وإعادة تسجيل البصمة (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `السبب: ${targetReq.reason || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isResignation && (locks.lockApproveResignations || locks.lockTerminateEmployee)) {
        executeWithOwnerGuard?.({
          lockKey: locks.lockApproveResignations ? 'lockApproveResignations' : 'lockTerminateEmployee',
          actionTitle: `اعتماد طلب استقالة (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `تاريخ السريان: ${targetReq.date || targetReq.lastWorkingDate || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isBonus && (locks.lockApproveBonuses || locks.lockDirectBonusDeduction)) {
        executeWithOwnerGuard?.({
          lockKey: locks.lockApproveBonuses ? 'lockApproveBonuses' : 'lockDirectBonusDeduction',
          actionTitle: `اعتماد مكافأة مالية (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `المبلغ: ${targetReq.amount || 0} ج.م`,
          onExecute: performApprove
        });
        return;
      }

      if (isComplaint && locks.lockApproveComplaints) {
        executeWithOwnerGuard?.({
          lockKey: 'lockApproveComplaints',
          actionTitle: `اعتماد شكوى / تظلم (${targetReq.employeeName || targetReq.employeeId})`,
          actionDetails: `الموضوع: ${targetReq.subject || targetReq.title || 'تظلم'}`,
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

    const performReject = async () => {
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
    let updatedActiveShifts = { ...(state.activeShifts || {}) };

    if (
      rejectedTargetReq &&
      (rejectedTargetReq.type === 'biometric_verification' ||
       rejectedTargetReq.type === 'تأكيد بصمة الوجه' ||
       rejectedTargetReq.type === 'تأكيد بصمة اليد' ||
       rejectedTargetReq.requestType === 'biometric_verification')
    ) {
      const empId = rejectedTargetReq.employeeId;
      const reqDate = rejectedTargetReq.date || (rejectedTargetReq.createdAt ? rejectedTargetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
      const targetAction = rejectedTargetReq.targetAction || rejectedTargetReq.actionType || 'shift_start';
      const actionTitle = targetAction === 'shift_end' ? 'انصراف' : 'حضور';

      // 1. حذف الوردية النشطة نهائياً بكلا المعرفين
      delete updatedActiveShifts[empId];
      delete updatedActiveShifts[String(empId)];

      // 2. إلغاء وتصفير الوردية بالكامل من سجل الورديات وشطبها نهائياً
      updatedShifts = updatedShifts.map((s) => {
        const isTarget =
          (rejectedTargetReq.shiftId && s.id === rejectedTargetReq.shiftId) ||
          (s.requestId && (s.requestId === rejectedTargetReq.id || s.requestId === reqId)) ||
          (String(s.employeeId) === String(empId) && s.date === reqDate && (s.punchType === 'photo_attendance' || s.requestId === rejectedTargetReq.id));

        if (isTarget) {
          return {
            ...s,
            status: 'rejected_photo',
            isRejectedPhoto: true,
            isCancelled: false,
            isRejected: true,
            rejected: true,
            hours: 0,
            actualWorkedHours: 0,
            netHours: 0,
            workHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            overtimeStatus: 'rejected',
            statusLabel: 'مرفوضة (رفض الصورة)',
            photoRejectionReason: 'تم رفض البصمة بسبب رفض الصورة من قِبل الإدارة العليا',
            rejectedBy: 'الإدارة العليا',
            rejectedAt: new Date().toISOString(),
            note: (s.note ? s.note + ' | ' : '') + `⚠️ تم رفض البصمة بسبب رفض الصورة (${actionTitle}) من قِبل الإدارة العليا - غير محتسبة في الأجور لحين اعتمادها يدوياً.`
          };
        }
        return s;
      });
    }

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

    const updatedLoans = (state.loans || []).map((l) =>
      l.id === reqId || l.requestId === reqId || (rejectedTargetReq && String(l.employeeId) === String(rejectedTargetReq.employeeId) && (l.amount === rejectedTargetReq.amount || l.totalAmount === rejectedTargetReq.totalAmount))
        ? { ...l, status: 'rejected', adminApproved: false, rejectedAt: new Date().toISOString() }
        : l
    );

    const updatedPermRequests = (state.permissionRequests || []).map((p) =>
      p.id === reqId || (rejectedTargetReq && String(p.employeeId) === String(rejectedTargetReq.employeeId) && p.date === rejectedTargetReq.date)
        ? { ...p, status: 'rejected', adminApproved: false, rejectedAt: new Date().toISOString() }
        : p
    );

    const updatedShiftSwaps = (state.shiftSwaps || []).map((s) =>
      s.id === reqId ? { ...s, status: 'rejected', adminApproved: false } : s
    );

    const updatedResignations = (state.resignationRequests || []).map((r) =>
      String(r.id) === String(reqId)
        ? {
            ...r,
            status: 'rejected',
            adminStatus: 'rejected',
            adminApproved: false,
            rejectedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : r
    );

    const decisionNotif = createRequestDecisionNotification({
      requestId: rejectedTargetReq?.id || reqId,
      employeeId: rejectedTargetReq?.employeeId,
      type: rejectedTargetReq?.type,
      action: 'rejected',
      approverRole: 'admin',
      title: rejectedTargetReq?.type === 'penalty_objection' ? '❌ تم رفض التظلم وتثبيت الجزاء' :
             (rejectedTargetReq?.type === 'biometric_verification' || rejectedTargetReq?.type === 'تأكيد بصمة الوجه' || rejectedTargetReq?.type === 'تأكيد بصمة اليد' || rejectedTargetReq?.requestType === 'biometric_verification') ? '❌ تم رفض توثيق البصمة بالصورة وإلغاء الوردية' :
             (rejectedTargetReq?.type === 'biometric_registration' ? '❌ تم رفض طلب اعتماد البصمة' :
             (rejectedTargetReq?.type === 'biometric_reset' ? '❌ تم رفض طلب إعادة تسجيل البصمة' : undefined)),
      message: rejectedTargetReq?.type === 'penalty_objection' ? 'تمت دراسة التظلم ورؤي عدم كفاية المبررات وتثبيت القرار التأديبي' :
               (rejectedTargetReq?.type === 'biometric_verification' || rejectedTargetReq?.type === 'تأكيد بصمة الوجه' || rejectedTargetReq?.type === 'تأكيد بصمة اليد' || rejectedTargetReq?.requestType === 'biometric_verification') ? 'تم رفض طلب اعتماد البصمة بالصورة من قِبل الإدارة، وبناءً عليه تم إلغاء الوردية وشطبها نهائياً من سجل البصمات ونظام الأجور.' :
               (rejectedTargetReq?.type === 'biometric_registration' ? 'تم رفض اعتماد البصمة الملتقطة، يرجى إعادة تسجيل بصمة أوضح وفق الإرشادات' :
               (rejectedTargetReq?.type === 'biometric_reset' ? 'تم رفض طلب مسح البصمة من قِبل الإدارة العليا' : undefined)),
      details: rejectedTargetReq?.reason || rejectedTargetReq?.details || ''
    });

    // Financial / Expense / Branch Invoice rejection sync
    const isExpenseReq = Boolean(
      rejectedTargetReq && (
        rejectedTargetReq.type === 'expense' ||
        rejectedTargetReq.type === 'financial_expense' ||
        rejectedTargetReq.type === 'financial_alert' ||
        rejectedTargetReq.type === 'invoice' ||
        rejectedTargetReq.subType === 'invoice' ||
        rejectedTargetReq.transactionId ||
        String(rejectedTargetReq.id || '').startsWith('req_fin_') ||
        String(rejectedTargetReq.id || '').startsWith('req_tx_')
      )
    );

    let updatedFinances = [...(state.finances || [])];
    let updatedTransactions = [...(state.transactions || [])];

    if (isExpenseReq) {
      const targetTxId = rejectedTargetReq.transactionId || rejectedTargetReq.id;
      const cleanTxId = String(targetTxId).replace(/^req_(fin|tx)_/, '');

      updatedFinances = updatedFinances.map(f => {
        if (String(f.id) === String(targetTxId) || String(f.id) === String(cleanTxId) || String(f.requestId) === String(reqId)) {
          return {
            ...f,
            approvalStatus: 'rejected',
            adminApproved: false,
            status: 'rejected',
            rejectedAt: new Date().toISOString()
          };
        }
        return f;
      });

      updatedTransactions = updatedTransactions.map(tx => {
        if (String(tx.id) === String(targetTxId) || String(tx.id) === String(cleanTxId) || String(tx.requestId) === String(reqId)) {
          return {
            ...tx,
            approvalStatus: 'rejected',
            adminApproved: false,
            status: 'rejected',
            rejectedAt: new Date().toISOString()
          };
        }
        return tx;
      });

      const branchName = rejectedTargetReq.branchName || rejectedTargetReq.branch || 'الفرع';
      const expNotif = {
        id: `notif_exp_rej_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: '❌ رفض اعتماد فاتورة / مصروف',
        message: `تم رفض اعتماد الفاتورة / المصروف بقيمة ${rejectedTargetReq.amount || 0} ج.م لفرع (${branchName})`,
        type: 'financial_rejected',
        branchName: branchName,
        branchId: rejectedTargetReq.branchId || rejectedTargetReq.branch_id,
        timestamp: new Date().toISOString(),
        read: false,
        targetTab: 'income-expenses'
      };
      updatedNotifications.unshift(expNotif);
    }

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
      activeShifts: updatedActiveShifts,
      leaveRequests: updatedLeaveRequests,
      permissionRequests: updatedPermRequests,
      loans: updatedLoans,
      shiftSwaps: updatedShiftSwaps,
      resignationRequests: updatedResignations,
      finances: updatedFinances,
      transactions: updatedTransactions,
      notifications: updatedNotifications
    };

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      enqueueRequestDecision({
        requestId: reqId,
        decision: 'reject',
        newStatus: 'rejected',
        reviewer: { role: effectiveRole, id: state.currentUser?.id || 'admin' },
        branchId: rejectedTargetReq?.branchId || rejectedTargetReq?.branch_id
      }).catch(err => console.warn('Outbox enqueue decision error:', err));
      showToast?.('❌ تم رفض الطلب واستبعاد الإجراء');
    };

    if ((effectiveRole === 'admin' || effectiveRole === 'owner') && executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockRejectRequests',
        actionTitle: `رفض واستبعاد طلب (${targetReq?.employeeName || targetReq?.employeeId || reqId})`,
        actionDetails: `نوع الطلب: ${targetReq?.typeLabel || targetReq?.type || 'طلب عام'}`,
        onExecute: performReject
      });
    } else {
      await performReject();
    }
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
    const isConfirmed = await showConfirm({
      title: 'حذف الطلب نهائياً',
      message: 'هل أنت متأكد من حذف هذا الطلب نهائياً من سجلات النظام بالكامل؟\nلا يمكن التراجع عن هذا الإجراء.',
      confirmText: 'حذف نهائي',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    const performDelete = async () => {
      const idStr = String(reqId);
      const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
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
        `medreq_${idStr}`,
        `medreq_${rawId}`,
        `obj_inc_${idStr}`,
        `obj_inc_${rawId}`,
        `notif_${idStr}`,
        `notif_${rawId}`
      ])).filter(Boolean).slice(-5000);

      const matchesId = (item) => {
        if (!item) return false;
        const itemIdStr = String(item.id || '');
        const itemRaw = itemIdStr.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
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

      try {
        await hardDeleteEntityFast('request', reqId);
      } catch {}

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      if (previewModalReq?.id === reqId || matchesId(previewModalReq)) setPreviewModalReq(null);
      showToast?.('🗑️ تم حذف الطلب نهائياً بنجاح');
    };

    if ((effectiveRole === 'admin' || effectiveRole === 'owner') && executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDeleteRequests',
        actionTitle: 'حذف طلب وسجل نهائياً من الأرشيف',
        actionDetails: `معرف الطلب: ${reqId}`,
        onExecute: performDelete
      });
    } else {
      await performDelete();
    }
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
        lockKey: state.orgSettings?.ownerModificationLocks?.lockDeletePenalties ? 'lockDeletePenalties' : 'lockDirectBonusDeduction',
        actionTitle: 'قبول اعتراض وإلغاء جزاء مالي',
        actionDetails: 'إلغاء الخصم المالي للجزاء من راتب الموظف',
        onExecute: performApproveObjection
      });
    } else {
      await performApproveObjection();
    }
  };

  const handleRejectPenaltyObjection = async (reqId, reply = '') => {
    const performRejectObjection = async () => {
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

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockRejectRequests',
        actionTitle: 'رفض اعتراض وتثبيت الجزاء المالي',
        actionDetails: 'رفض التظلم وتثبيت الخصم المالي',
        onExecute: performRejectObjection
      });
    } else {
      await performRejectObjection();
    }
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

  // 1. Clear / Hide completed requests from Higher Management screen ONLY (Excludes pending requests)
  const handleClearAdminViewOnly = async () => {
    const clearableRequests = visibleAdminRequests.filter(r => !isPendingRequest(r));
    const pendingCount = visibleAdminRequests.length - clearableRequests.length;

    if (clearableRequests.length === 0) {
      showToast?.('ℹ️ جميع الطلبات المعروضة حالياً هي طلبات قيد الاعتماد ولا يمكن إخفاؤها لحين البت فيها.');
      return;
    }
    const isConfirmed = await showConfirm({
      title: 'تفريغ شاشة الإدارة العليا',
      message: `تأكيد تفريغ شاشة الإدارة العليا (${clearableRequests.length} طلب منجز ومرفوض):\n\n` +
        `• سيتم مسح وإخفاء الطلبات المنتهية فقط من شاشة الإدارة لترتيب الشاشة.\n` +
        (pendingCount > 0 ? `• ✅ تم استثناء وحماية (${pendingCount}) طلب قيد الاعتماد وستظل ظاهرة في شاشتك لمراجعتها.\n` : '') +
        `• لن يتم حذف أي طلبات نهائياً من النظام، ويمكنك في أي وقت الضغط على زر "عرض المؤرشف" لاستعادتها.`,
      confirmText: `تفريغ الشاشة (${clearableRequests.length})`,
      cancelText: 'إلغاء وتراجع',
      type: 'info',
      icon: '🧹'
    });
    if (!isConfirmed) return;

    const visibleIds = new Set();
    clearableRequests.forEach(r => {
      if (r && r.id) {
        const s = String(r.id);
        const raw = s.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
        visibleIds.add(s);
        if (raw) {
          visibleIds.add(raw);
          visibleIds.add(`loan_${raw}`);
          visibleIds.add(`medreq_${raw}`);
          visibleIds.add(`req_${raw}`);
        }
      }
    });
    const nowIso = new Date().toISOString();

    const hideItem = (item) => {
      // استثناء الطلبات قيد الاعتماد من الإخفاء دائماً
      if (item && isPendingRequest(item)) return item;
      if (item && item.id) {
        const s = String(item.id);
        const raw = s.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
        if (visibleIds.has(s) || (raw && visibleIds.has(raw))) {
          return { ...item, hiddenFromAdmin: true, updatedAt: nowIso };
        }
      }
      return item;
    };

    const updatedRequests = (state.requests || []).map(hideItem);
    const updatedLeaveRequests = (state.leaveRequests || []).map(hideItem);
    const updatedShiftSwaps = (state.shiftSwaps || []).map(hideItem);
    const updatedLoans = (state.loans || []).map(hideItem);
    const updatedResignations = (state.resignationRequests || []).map(hideItem);

    // تحديث الكاش المحلي في IndexedDB لضمان عدم ارتداد الطلبات بدون إخفاء
    putRequestsBatch(updatedRequests).catch(() => {});

    const updatedHiddenList = Array.from(new Set([
      ...(state.adminHiddenRequestIds || []),
      ...Array.from(visibleIds)
    ]));

    const updatedState = {
      ...state,
      adminHiddenRequestIds: updatedHiddenList,
      requests: updatedRequests,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedShiftSwaps,
      loans: updatedLoans,
      resignationRequests: updatedResignations
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.(`🧹 تم مسح وإخفاء (${clearableRequests.length}) طلب منجز مع الإبقاء على (${pendingCount}) طلب قيد الاعتماد.`);
  };

  // Restore Hidden Requests in Higher Management screen
  const handleRestoreAdminView = async () => {
    const nowIso = new Date().toISOString();
    const unhideItem = (item) => (item ? { ...item, hiddenFromAdmin: false, updatedAt: nowIso } : item);

    const updatedRequests = (state.requests || []).map(unhideItem);
    const updatedLeaveRequests = (state.leaveRequests || []).map(unhideItem);
    const updatedShiftSwaps = (state.shiftSwaps || []).map(unhideItem);
    const updatedLoans = (state.loans || []).map(unhideItem);
    const updatedResignations = (state.resignationRequests || []).map(unhideItem);

    putRequestsBatch(updatedRequests).catch(() => {});

    const updatedState = {
      ...state,
      adminHiddenRequestIds: [],
      requests: updatedRequests,
      leaveRequests: updatedLeaveRequests,
      shiftSwaps: updatedShiftSwaps,
      loans: updatedLoans,
      resignationRequests: updatedResignations
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    setShowHiddenAdminRequests(false);
    showToast?.('↩️ تم استعادة كافة الطلبات للظهور في شاشة الإدارة العليا');
  };

  // 2. Clear / Delete Requests List from the ENTIRE system permanently (EXCLUDES PENDING REQUESTS)
  const handleClearAllRequests = async () => {
    const currentReqs = allRequests || [];
    const clearableReqs = currentReqs.filter(r => !isPendingRequest(r));
    const pendingReqs = currentReqs.filter(isPendingRequest);

    if (clearableReqs.length === 0) {
      showToast?.('ℹ️ لا توجد أي طلبات سابقة منتهية لمسحها، وجميع الطلبات الحالية قيد الاعتماد ومحمية من الحذف.');
      return;
    }
    const isConfirmed = await showConfirm({
      title: 'مسح السجل العام للطلبات المنتهية',
      message: `⚠️ تأكيد مسح السجل العام للطلبات:\n\n` +
        `• سيتم حذف (${clearableReqs.length}) طلب منجز ومرفوض نهائياً من قاعدة البيانات والسيرفر.\n` +
        `• 🛡️ استثناء فوري: تم استثناء وحماية (${pendingReqs.length}) طلب قيد الاعتماد ولن يتم مسحها إطلاقاً لحين البت فيها.\n` +
        `• ✅ تم أرشفة رصيد وسجلات الإجازات والاستئذانات المعتمدة لضمان عدم تصفيرها.\n\n` +
        `هل تريد تأكيد مسح الطلبات المنتهية الآن؟`,
      confirmText: `مسح الطلبات المنتهية (${clearableReqs.length})`,
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🧹'
    });
    if (!isConfirmed) return;

    const performClearAllRequests = async () => {
      // 0. حصر واستخراج كافة الطلبات قيد الاعتماد بدقة لحمايتها من أي حذف
      const preservedPendingRequests = (state.requests || []).filter(isPendingRequest);
      const preservedPendingLeaves = (state.leaveRequests || []).filter(isPendingRequest);
      const preservedPendingSwaps = (state.shiftSwaps || []).filter(isPendingRequest);
      const preservedPendingLoans = (state.loans || []).filter(isPendingRequest);
      const preservedPendingResignations = (state.resignationRequests || []).filter(isPendingRequest);
      const preservedPendingPerms = (state.permissionRequests || []).filter(isPendingRequest);

      // مجموعة كافة معرفات الطلبات قيد الاعتماد لحمايتها التامة
      const pendingIdsSet = new Set();
      [
        ...preservedPendingRequests,
        ...preservedPendingLeaves,
        ...preservedPendingSwaps,
        ...preservedPendingLoans,
        ...preservedPendingResignations,
        ...preservedPendingPerms,
        ...pendingReqs
      ].forEach(r => {
        if (r && r.id) {
          const s = String(r.id);
          const raw = s.replace(/^(req_|leave_|swap_|res_|loan_|notif_)/, '');
          pendingIdsSet.add(s);
          if (raw) {
            pendingIdsSet.add(raw);
            pendingIdsSet.add(`req_${raw}`);
            pendingIdsSet.add(`leave_${raw}`);
            pendingIdsSet.add(`swap_${raw}`);
            pendingIdsSet.add(`res_${raw}`);
            pendingIdsSet.add(`loan_${raw}`);
          }
        }
      });

      // 1. استخراج وأرشفة كافة الإجازات المعتمدة في leaveHistory لضمان عدم تصفير رصيد الإجازات المأخوذة
      const existingLeaveHistory = state.leaveHistory || [];
      const leaveMap = new Map();
      existingLeaveHistory.forEach(lh => { if (lh && lh.id) leaveMap.set(String(lh.id), lh); });

      const allCandidateLeaves = [...(state.leaveRequests || []), ...(state.requests || []), ...currentReqs];
      allCandidateLeaves.forEach((r) => {
        if (!r) return;
        const isLeave = r.type === 'leave' || r.type === 'leave_request' || r.leaveType || r.type === 'annual_leave' || r.type === 'leave_comp_off';
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

      // 3. تنظيف السلف المالية: تطهير السلف المسددة والمرفوضة واليتيمة مع الحفاظ على السلف قيد الاعتماد
      const empIdSet = new Set((state.employees || []).map(e => String(e.id)));
      const preservedLoans = (state.loans || []).filter(ln => {
        if (!ln) return false;
        // حماية السلف قيد الاعتماد دائماً
        if (isPendingRequest(ln)) return true;
        // حذف سلف الموظفين المحذوفين من النظام نهائياً
        if (ln.employeeId && !empIdSet.has(String(ln.employeeId))) return false;
        // حذف السلف المسددة بالكامل أو المرفوضة أو الملغاة
        if (ln.status === 'paid' || ln.status === 'rejected' || ln.status === 'cancelled') return false;
        // السلف المعتمدة التي ما زالت تحت السداد: يتم الإبقاء عليها في ملف الموظف والراتب مع وسم إخلائها من صندوق الوارد
        return true;
      }).map(ln => {
        if (isPendingRequest(ln)) return ln;
        return { ...ln, clearedFromRequestsInbox: true };
      });

      // 4. بناء قائمة المعرفات المحذوفة مع حماية الطلبات قيد الاعتماد فقط
      const allDeletedKeys = [];
      const allReqIdsSet = new Set();

      clearableReqs.forEach((r) => {
        if (r && r.id) {
          const idStr = String(r.id);
          if (pendingIdsSet.has(idStr) || isPendingRequest(r)) {
            return;
          }
          const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|medreq_|perm_|lhist_|obj_inc_|obj_adj_|obj_|notif_)/, '');
          allReqIdsSet.add(idStr);
          if (rawId) allReqIdsSet.add(rawId);
          allDeletedKeys.push(
            idStr,
            rawId,
            `req_${idStr}`,
            `req_${rawId}`,
            `leave_${idStr}`,
            `leave_${rawId}`,
            `swap_${idStr}`,
            `swap_${rawId}`,
            `loan_${idStr}`,
            `loan_${rawId}`,
            `medreq_${idStr}`,
            `medreq_${rawId}`,
            `res_${idStr}`,
            `res_${rawId}`,
            `obj_inc_${idStr}`,
            `obj_inc_${rawId}`,
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

      const nowIso = new Date().toISOString();
      const updatedState = {
        ...state,
        employees: updatedEmployees,
        requests: preservedPendingRequests,
        leaveRequests: preservedPendingLeaves,
        shiftSwaps: preservedPendingSwaps,
        loans: preservedLoans,
        leaveHistory: updatedLeaveHistory,
        permissions: updatedPermissions,
        permissionRequests: preservedPendingPerms,
        resignationRequests: preservedPendingResignations,
        adminHiddenRequestIds: (state.adminHiddenRequestIds || []).filter(id => !pendingIdsSet.has(String(id))),
        notifications: (state.notifications || []).filter(n => {
          if (!n) return false;
          if (n.requestId && pendingIdsSet.has(String(n.requestId))) return true;
          return !n.requestId || (!allReqIdsSet.has(String(n.requestId)) && !allReqIdsSet.has(String(n.id)));
        }),
        _deletedIds: updatedDeleted,
        _requestsClearedAt: nowIso,
        _requestsUpdatedAt: nowIso
      };

      // تنفيذ التطهير الجذري السحابي والمحلي من قاعدة البيانات والسيرفر مع الحفاظ التام على الطلبات قيد الاعتماد
      try {
        const allPendingToPreserve = [
          ...preservedPendingRequests,
          ...preservedPendingLeaves,
          ...preservedPendingSwaps,
          ...preservedPendingLoans,
          ...preservedPendingResignations,
          ...preservedPendingPerms
        ];
        await purgeAllRequestsCloudAndLocal(allPendingToPreserve);
      } catch (purgeErr) {
        console.warn('[ClearAllRequests] Purge error:', purgeErr);
      }

      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.(`🗑️ تم مسح الطلبات المنتهية بنجاح، وتم استثناء وحفظ (${pendingReqs.length}) طلب قيد الاعتماد!`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockFactoryReset',
        actionTitle: 'مسح وحذف سجل الطلبات المنتهية',
        actionDetails: `الطلبات المنتهية المراد حذفها: ${clearableReqs.length} طلب (مع استثناء ${pendingReqs.length} طلب قيد الاعتماد)`,
        onExecute: performClearAllRequests
      });
    } else {
      await performClearAllRequests();
    }
  };

  // Batch Operations Handlers
  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    const isConfirmed = await showConfirm({
      title: 'اعتماد جماعي للطلبات',
      message: `هل أنت متأكد من اعتماد وموافقة جميع الطلبات المحددة (${selectedIds.size} طلب) دفعة واحدة؟`,
      confirmText: 'تأكيد الاعتماد الجماعي',
      cancelText: 'إلغاء',
      type: 'primary',
      icon: '✓'
    });
    if (!isConfirmed) return;
    const targetIds = Array.from(selectedIds);
    for (const id of targetIds) {
      await handleApprove(id);
    }
    setSelectedIds(new Set());
    showToast?.(`✅ تم اعتماد (${targetIds.length}) طلب بنجاح`);
  };

  const handleBatchReject = async () => {
    if (selectedIds.size === 0) return;
    const isConfirmed = await showConfirm({
      title: 'رفض جماعي للطلبات',
      message: `هل أنت متأكد من رفض جميع الطلبات المحددة (${selectedIds.size} طلب)؟`,
      confirmText: 'تأكيد الرفض',
      cancelText: 'إلغاء',
      type: 'danger',
      icon: '✕'
    });
    if (!isConfirmed) return;
    const targetIds = Array.from(selectedIds);
    for (const id of targetIds) {
      await handleReject(id);
    }
    setSelectedIds(new Set());
    showToast?.(`❌ تم رفض (${targetIds.length}) طلب`);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const isConfirmed = await showConfirm({
      title: 'حذف جماعي للطلبات',
      message: `هل أنت متأكد من حذف جميع الطلبات المحددة (${selectedIds.size} طلب) نهائياً من قاعدة البيانات والسجلات؟ لا يمكن التراجع.`,
      confirmText: 'تأكيد الحذف النهائي',
      cancelText: 'إلغاء',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    const targetIds = Array.from(selectedIds);
    for (const id of targetIds) {
      await handleDeleteSingleRequest(id);
    }
    setSelectedIds(new Set());
    showToast?.(`🗑️ تم حذف (${targetIds.length}) طلب نهائياً`);
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
          {/* Button: Instant Cloud Sync & Refresh (Green) */}
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

          {/* Button 1: Clear Admin View Only (Blue) */}
          <button
            type="button"
            className="btn"
            onClick={handleClearAdminViewOnly}
            disabled={clearableAdminRequestsCount === 0}
            style={{
              background: '#2563eb',
              color: '#ffffff',
              border: '1px solid #1d4ed8',
              opacity: clearableAdminRequestsCount === 0 ? 0.75 : 1,
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '800',
              borderRadius: '8px',
              cursor: clearableAdminRequestsCount > 0 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.2s ease'
            }}
            title={clearableAdminRequestsCount > 0 ? "مسح وتفريغ الطلبات المنتهية فقط من شاشة الإدارة العليا (مع استثناء وحفظ الطلبات قيد الاعتماد)" : "لا توجد طلبات منتهية لمسحها (الطلبات قيد الاعتماد محمية)"}
          >
            <span>🧹 مسح شاشة الإدارة فقط</span>
            <span style={{
              background: 'rgba(0,0,0,0.25)',
              padding: '2px 7px',
              borderRadius: '99px',
              fontSize: '11px'
            }}>
              {clearableAdminRequestsCount}
            </span>
          </button>

          {/* Button 2: Clear Entire System Requests List (Red) */}
          <button
            type="button"
            className="btn"
            onClick={handleClearAllRequests}
            disabled={clearableAllRequestsCount === 0}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: '1px solid #dc2626',
              opacity: clearableAllRequestsCount === 0 ? 0.75 : 1,
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: '800',
              borderRadius: '8px',
              cursor: clearableAllRequestsCount > 0 ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)',
              transition: 'all 0.2s ease'
            }}
            title={clearableAllRequestsCount > 0 ? "مسح وتفريغ سجل الطلبات المنتهية نهائياً من كافة شاشات النظام (مع استثناء وحفظ الطلبات قيد الاعتماد)" : "لا توجد طلبات منتهية لمسحها (الطلبات قيد الاعتماد محمية)"}
          >
            <span>🗑️ مسح السجل العام للطلبات</span>
            <span style={{
              background: 'rgba(0,0,0,0.25)',
              padding: '2px 7px',
              borderRadius: '99px',
              fontSize: '11px'
            }}>
              {clearableAllRequestsCount}
            </span>
          </button>

          {/* Button: Toggle Hidden/Archived Requests (Placed after the 3 fixed main buttons) */}
          {hiddenAdminCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowHiddenAdminRequests(!showHiddenAdminRequests)}
              style={{
                fontSize: '12px',
                fontWeight: '700',
                padding: '6px 12px',
                color: showHiddenAdminRequests ? '#8b5cf6' : '#6d28d9',
                border: '1px dashed #c4b5fd',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="عرض أو إخفاء الطلبات التي تم مسحها من شاشة الإدارة سابقاً"
            >
              <span>{showHiddenAdminRequests ? '👁️ إخفاء المؤرشف' : `👁️ عرض المؤرشف (${hiddenAdminCount})`}</span>
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

      {/* ── Modern Inbox Tabs Navigation Bar ── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '18px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'thin'
        }}
      >
        {[
          { id: 'all', label: 'كافة الطلبات', icon: '📋', count: kpis.totalCount, color: '#3b82f6' },
          { id: 'pending', label: 'قيد الاعتماد', icon: '⏳', count: kpis.pendingCount, color: '#f59e0b' },
          { id: 'urgent', label: 'عاجل وتظلمات', icon: '🚨', count: kpis.urgentCount, color: '#ef4444' },
          { id: 'completed', label: 'المعتمدة والمكتملة', icon: '✅', count: kpis.completedCount, color: '#10b981' },
          { id: 'rejected', label: 'المرفوضة', icon: '❌', count: kpis.rejectedCount, color: '#6b7280' },
          { id: 'outbox', label: 'طابور الأوفلاين والمزامنة', icon: '💾', count: kpis.outboxCount, color: '#8b5cf6' }
        ].map((tab) => {
          const isActive = inboxTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setInboxTab(tab.id);
                if (tab.id === 'pending') setFilterStatus('pending');
                else if (tab.id === 'completed') setFilterStatus('approved');
                else if (tab.id === 'rejected') setFilterStatus('rejected');
                else setFilterStatus('all');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                borderRadius: '10px',
                border: isActive ? `2px solid ${tab.color}` : '1.5px solid var(--border)',
                background: isActive ? `${tab.color}15` : 'var(--surface)',
                color: isActive ? tab.color : 'var(--text)',
                fontWeight: isActive ? '800' : '600',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? `0 2px 8px ${tab.color}25` : 'none'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                style={{
                  background: isActive ? tab.color : 'var(--surface-muted)',
                  color: isActive ? '#fff' : 'var(--muted)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '800'
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>



      {/* ── Search & Filter Controls Bar ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)' }}>
        {/* Instant Live Search */}
        <div style={{ flex: '1 1 240px', minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 بحث فوري بالاسم، الكود، الفرع، أو التفاصيل..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', background: 'var(--surface-muted)' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Employee */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>👤 الموظف:</label>
          <select value={filterEmp} onChange={(e) => setFilterEmp(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
            <option value="all">-- جميع الموظفين --</option>
            {employees.filter(isEmployeeActive).map((e) => (
              <option key={e.id} value={e.id}>{getEmpDisplayName(e)} ({e.code})</option>
            ))}
          </select>
        </div>

        {/* Filter Date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>📅 التاريخ:</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
          />
          {filterDate && (
            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--danger)' }} onClick={() => setFilterDate('')}>✕</button>
          )}
        </div>

        {/* Filter Type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>نوع الطلب:</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
            <option value="all">-- جميع أنواع الطلبات --</option>
            <option value="expense">📑 فواتير ومصروفات الفروع</option>
            <option value="biometric">📸 اعتمادات البصمة والكشك</option>
            <option value="leave">🏖️ إجازات (&lt;= 3 أيام)</option>
            <option value="long_leave">🏖️ إجازات أكثر من 3 أيام</option>
            <option value="permission">⏰ أذون خروج/دخول</option>
            <option value="loan">💳 سلف مالية</option>
            <option value="meds">💊 أدوية آجل</option>
            <option value="swap">🔄 تبديل شفتات</option>
            <option value="penalty_objection">✋ تظلمات الجزاءات واللائحة</option>
            <option value="roster_edit">📅 تعديل جدول شهري</option>
            <option value="shift_adjustment">🔄 طلبات تعديل الشيفت</option>
            <option value="comp_off">🛋️ إجازات وبدل راحة</option>
            <option value="complaint">📋 شكاوي وملاحظات</option>
            <option value="penalty">⚠️ جزاءات ومخالفات لائحية</option>
          </select>
        </div>

        {/* Filter Status (Default: pending) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold' }}>حالة الاعتماد:</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold', color: filterStatus === 'pending' ? '#b45309' : 'inherit' }}>
            <option value="pending">⏳ قيد الاعتماد (الافتراضي)</option>
            <option value="all">-- جميع الحالات --</option>
            <option value="pending_admin">🟡 بانتظار الإدارة العليا</option>
            <option value="approved">🟢 معتمد نهائياً</option>
            <option value="rejected">🔴 مرفوض</option>
          </select>
        </div>
      </div>

      {/* ── Batch Action Bar (العمليات الجماعية) ── */}
      {selectedIds.size > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
              تم تحديد ({selectedIds.size}) طلب
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn"
              onClick={handleBatchApprove}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12.5px', cursor: 'pointer' }}
            >
              ✓ اعتماد المحدد ({selectedIds.size})
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleBatchReject}
              style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12.5px', cursor: 'pointer' }}
            >
              ✕ رفض المحدد ({selectedIds.size})
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleBatchDelete}
              style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12.5px', cursor: 'pointer' }}
            >
              🗑️ حذف المحدد نهائياً
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedIds(new Set())}
              style={{ color: '#cbd5e1', border: '1px solid #475569', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="bylaws-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredRequests.length > 0 && selectedIds.size === filteredRequests.length}
                  onChange={handleToggleSelectAll}
                  style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                  title="تحديد الكل"
                />
              </th>
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
              <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد طلبات تطابق خيارات التصفية.</td></tr>
            ) : (
              filteredRequests.map((req) => {
                const isOldProcessed = req.status === 'approved' || req.status === 'rejected';

                return (
                  <tr key={req.id} style={{ background: selectedIds.has(req.id) ? 'rgba(59, 130, 246, 0.06)' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(req.id)}
                        onChange={() => handleToggleSelect(req.id)}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                    </td>
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
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {getFormattedRequestBadge(req)}
                        {(req.photoUrl || req.drivePhotoUrl || req.type === 'biometric_verification' || req.type === 'biometric_registration' || req.type === 'تأكيد بصمة الوجه' || req.type === 'تأكيد بصمة اليد') && (
                          <button
                            type="button"
                            onClick={() => {
                              const emp = employees.find(e => e.id === req.employeeId || e.code === req.employeeCode);
                              setLightboxPhoto({
                                url: req.photoUrl || req.drivePhotoUrl || emp?.photoUrl,
                                title: `معاينة بصمة وصورة: ${emp ? getEmpDisplayName(emp) : (req.employeeName || '')}`,
                                subtitle: `تاريخ التوثيق: ${getRequestDate(req)} • ${getRequestTime(req)}`,
                                compareUrl: emp?.photoUrl || null,
                                compareTitle: 'الصورة الرسمية المسجلة للموظف'
                              });
                            }}
                            title="معاينة الصورة الحية بالحجم الكامل ومطابقتها"
                            style={{ background: '#ccfbf1', border: '1px solid #0d9488', color: '#0f766e', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            📸 صورة
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const emp = employees.find(e => e.id === req.employeeId || e.code === req.employeeCode);
                        const effectiveBranchId = req.branchId || emp?.branchesDetails?.[0]?.branchId || emp?.branchId;
                        const noManager = isBranchWithoutManager(effectiveBranchId, state) || req.managerComment === 'الفرع بدون مدير' || req.branchApprovalStatus === 'skipped' || req.managerStatus === 'skipped';
                        const isDual = isDualApprovalRequest(req, state);
                        const isDirectAdmin = isDual
                          ? (noManager || (emp && (isEmployeeBranchManager(emp, effectiveBranchId, state) || isUpperManagementEmp(emp))))
                          : (
                              noManager ||
                              req.targetApproval === 'admin_only' ||
                              req.targetApproval === 'admin' ||
                              ['loan', 'advance', 'credit_medicine', 'eval_edit_request', 'complaint', 'penalty_objection', 'objection', 'biometric_registration', 'biometric_reset'].includes(req.type) ||
                              req.branchNotRequired ||
                              req.isDirectToAdmin ||
                              shouldRouteDirectToAdmin(emp, effectiveBranchId, state, req)
                            );

                        if (noManager) {
                          return (
                            <span style={{ color: '#0284c7', fontWeight: '800', background: '#e0f2fe', padding: '4px 8px', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '12px' }}>
                              🏢 الفرع بدون مدير
                            </span>
                          );
                        }
                        if (req.type === 'disciplinary_penalty' || req.createdRole === 'branch' || req.createdRole === 'branch_manager' || req.submittedByBranchManager) {
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
                        if (req.branchApproved || req.branchApprovalStatus === 'approved' || req.managerStatus === 'approved' || req.branchDecision === 'approved') {
                          return <span style={{ color: '#16a34a', fontWeight: '700', background: '#f0fdf4', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '12px' }}>🟢 معتمد من الفرع</span>;
                        }
                        if (req.branchRejected || req.branchApprovalStatus === 'rejected' || req.managerStatus === 'rejected' || req.branchDecision === 'rejected' || (req.branchApproved === false && (req.branchRejectedAt || req.branchDecision))) {
                          return <span style={{ color: '#dc2626', fontWeight: '700', background: '#fef2f2', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fecaca', fontSize: '12px' }}>❌ لم يوافق (محال للإدارة)</span>;
                        }
                        return <span style={{ color: '#d97706', fontWeight: '700', background: '#fffbeb', padding: '3px 8px', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '12px' }}>⏳ بانتظار الفرع</span>;
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        {(req.status === 'approved' || req.adminApproved === true || req.status === 'paid' || req.status === 'partial') ? (
                          <span className="approval-status-badge approved" style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            {parseFloat(req.paidAmount) >= (parseFloat(req.amount || req.totalAmount) || 0) && (parseFloat(req.amount || req.totalAmount) || 0) > 0
                              ? '🟢 مسدد بالكامل'
                              : (parseFloat(req.paidAmount) > 0 ? '🟢 سلفة معتمدة (سداد جزئي)' : '🟢 معتمد نهائياً')}
                          </span>
                        ) : req.status === 'rejected' ? (
                          <span className="approval-status-badge rejected" style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            🔴 مرفوض نهائياً
                          </span>
                        ) : req.status === 'cancelled' ? (
                          <span className="approval-status-badge cancelled">⚪ ملغي</span>
                        ) : (req.branchRejected || req.branchApprovalStatus === 'rejected' || req.managerStatus === 'rejected' || req.branchDecision === 'rejected') ? (
                          <span className="approval-status-badge pending" style={{ background: '#ffedd5', color: '#c2410c', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            ⏳ قيد نظر الإدارة (لم يوافق الفرع)
                          </span>
                        ) : (req.branchApproved || req.branchApprovalStatus === 'approved') ? (
                          <span className="approval-status-badge pending" style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>
                            🟡 بانتظار الإدارة العليا (وافق الفرع)
                          </span>
                        ) : (
                          <span className="approval-status-badge pending" style={{ background: '#fef9c3', color: '#a16207', padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}>⏳ قيد المراجعة</span>
                        )}

                        {/* Delivery / Outbox Receipt Indicator */}
                        {req.status === 'pending_local' ? (
                          <span style={{ fontSize: '10.5px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700' }}>
                            💾 أوفلاين (محفوظ محلياً)
                          </span>
                        ) : (req.status === 'queued' || req.status === 'syncing') ? (
                          <span style={{ fontSize: '10.5px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700' }}>
                            🔄 جارٍ المزامنة
                          </span>
                        ) : req.sent_at ? (
                          <span style={{ fontSize: '10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
                            📤 متزامن سحابياً
                          </span>
                        ) : null}
                      </div>
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

                        {/* Hide approve and reject buttons if request is already approved or rejected or cancelled */}
                        {!(req.status === 'approved' || req.status === 'paid' || req.status === 'partial' || req.adminApproved || req.status === 'rejected' || req.status === 'cancelled') && (
                          <>
                            <button
                              className="btn btn-start"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => handleApprove(req.id)}
                            >
                              ✓ موافقة
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--danger)' }}
                              onClick={() => handleReject(req.id)}
                            >
                              ✕ رفض
                            </button>
                          </>
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

        const isLeave = ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave', 'leave_comp_off', 'comp_off'].includes(previewModalReq.type) || previewModalReq.leaveType === 'comp_off';
        const isShiftAdjustment = previewModalReq.type === 'shift_adjustment';
        const isCompOffGrant = previewModalReq.type === 'comp_off_grant';
        const isPermission = ['permission', 'permission_request', 'إذن', 'late_permission', 'early_leave'].includes(previewModalReq.type) || Boolean(previewModalReq.permType);
        const isLoan = ['loan', 'advance', 'meds', 'credit_medicine'].includes(previewModalReq.type);
        const isSwap = ['swap', 'shift_swap', 'shift_edit'].includes(previewModalReq.type);
        const isPunch = ['punch_correction', 'manual_punch', 'attendance_punch', 'تأكيد بصمة الوجه', 'تأكيد بصمة اليد', 'biometric_verification'].includes(previewModalReq.type);
        const isBiometricVerification = previewModalReq.type === 'biometric_verification' || previewModalReq.type === 'تأكيد بصمة الوجه' || previewModalReq.type === 'تأكيد بصمة اليد';
        const isDisciplinaryViolation = previewModalReq.type === 'disciplinary_penalty' ||
          previewModalReq.type === 'violation' ||
          previewModalReq.subType === 'disciplinary_penalty' ||
          String(previewModalReq.id || '').startsWith('disc_');
        const isPenalty = previewModalReq.type === 'penalty' || isDisciplinaryViolation;
        const isPenaltyObjection = previewModalReq.type === 'penalty_objection' || previewModalReq.type === 'objection' || Boolean(previewModalReq.penaltyId) || Boolean(previewModalReq.objection);
        const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request', 'shift_adjustment'].includes(previewModalReq.type);
        const isComplaint = ['complaint', 'eval_edit_request'].includes(previewModalReq.type);
        const isProfileUpdate = ['profile_update', 'profile_edit', 'profile_update_request'].includes(previewModalReq.type) || String(previewModalReq.type || '').includes('profile');
        const isOvertime = previewModalReq.type === 'overtime' || previewModalReq.type === 'overtime_request' || previewModalReq.type === 'إضافي';
        const isScheduleDeviation = previewModalReq.type === 'schedule_deviation' || previewModalReq.type === 'عدم الالتزام بالجدول';
        const isExpense = ['expense', 'financial_expense', 'financial_alert', 'invoice'].includes(previewModalReq.type) ||
          previewModalReq.subType === 'invoice' ||
          Boolean(previewModalReq.transactionId) ||
          String(previewModalReq.id || '').startsWith('req_fin_') ||
          String(previewModalReq.id || '').startsWith('req_tx_');

        const totalAmount = parseFloat(previewModalReq.amount) || 0;
        const monthlyDed = parseFloat(previewModalReq.monthlyDeduction || previewModalReq.installmentAmount) || 0;
        const isInstallment = previewModalReq.loanType === 'installments' || previewModalReq.isInstallment || (monthlyDed > 0 && monthlyDed < totalAmount) || (parseInt(previewModalReq.installmentsCount, 10) > 1);
        const installmentsCount = previewModalReq.installmentsCount || previewModalReq.monthsCount || (monthlyDed > 0 ? Math.ceil(totalAmount / monthlyDed) : 1);

        const isDual = isDualApprovalRequest(previewModalReq, state);
        const isBranchNotReq = isDual
          ? (empObj && (isEmployeeBranchManager(empObj, effectiveReqBranchId, state) || isUpperManagementEmp(empObj)))
          : (
              previewModalReq.targetApproval === 'admin_only' ||
              previewModalReq.targetApproval === 'admin' ||
              isLoan ||
              isExpense ||
              isComplaint ||
              isPenaltyObjection ||
              isProfileUpdate ||
              previewModalReq.branchNotRequired ||
              previewModalReq.isDirectToAdmin ||
              shouldRouteDirectToAdmin(empObj, effectiveReqBranchId, state, previewModalReq)
            );

        const modalJSX = (
          <div
            className="modal-overlay"
            onClick={() => setPreviewModalReq(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              height: '100dvh',
              zIndex: 999999,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '14px 10px',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              boxSizing: 'border-box'
            }}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 'min(1000px, 96vw)',
                width: '96%',
                height: 'calc(100dvh - 28px)',
                maxHeight: 'calc(100dvh - 28px)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: 0,
                borderRadius: '16px',
                border: '1px solid var(--border)',
                margin: 'auto',
                background: 'var(--surface, #ffffff)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
            >
              
              {/* Modal Top Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border)', padding: '14px 20px', flexShrink: 0, background: 'var(--surface)', flexWrap: 'wrap', gap: '10px' }}>
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
                  {getFormattedRequestBadge(previewModalReq)}
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '14px' }} onClick={() => setPreviewModalReq(null)}>✕ إغلاق</button>
                </div>
              </div>

              {/* Scrollable Modal Body */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13.5px', WebkitOverflowScrolling: 'touch' }}>
                
                {/* 1. Employee & Branch Information Card */}
                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isExpense ? '🏢 بيانات الفرع ومقدم الفاتورة / المصروف:' : '👤 بيانات الموظف ومقدم الطلب:'}
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{isExpense ? 'مقدم الفاتورة / المسؤول:' : 'اسم الموظف:'}</span>
                      <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '14px' }}>
                        {previewModalReq.submittedBy || (empObj ? getEmpDisplayName(empObj) : (previewModalReq.employeeName || (isExpense ? 'مدير الفرع' : 'غير معروف')))}
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
                        💼 {isExpense ? (empObj?.jobTitle || 'مدير فرع') : (empObj?.jobTitle || 'كادر وظيفي')}
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
                  <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف موافقة مدير الفرع:</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {previewModalReq.managerComment === 'الفرع بدون مدير' || previewModalReq.managerStatus === 'skipped' || previewModalReq.branchApprovalStatus === 'skipped' || isBranchWithoutManager(effectiveReqBranchId, state) ? (
                        <span style={{ color: '#0284c7' }}>🏢 الفرع بدون مدير (محال للإدارة العليا مباشرة)</span>
                      ) : isBranchNotReq ? (
                        <span style={{ color: 'var(--muted)' }}>🔒 موجهة للإدارة العليا فقط (لا تتطلب موافقة الفرع)</span>
                      ) : (previewModalReq.branchApproved || previewModalReq.branchApprovalStatus === 'approved' || previewModalReq.managerStatus === 'approved' || previewModalReq.branchDecision === 'approved') ? (
                        <span style={{ color: 'var(--success)' }}>🟢 معتمد وموافق عليه من مدير الفرع</span>
                      ) : (previewModalReq.branchRejected || previewModalReq.branchApprovalStatus === 'rejected' || previewModalReq.managerStatus === 'rejected' || previewModalReq.branchDecision === 'rejected' || (previewModalReq.branchApproved === false && (previewModalReq.branchRejectedAt || previewModalReq.branchDecision))) ? (
                        <span style={{ color: 'var(--danger)' }}>❌ لم يوافق مدير الفرع (محال لقرار الإدارة العليا)</span>
                      ) : (
                        <span style={{ color: 'var(--accent)' }}>⏳ بانتظار مراجعة واعتماد مدير الفرع</span>
                      )}
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موقف اعتماد الإدارة العليا:</span>
                    <div style={{ marginTop: '4px', fontWeight: 'bold', fontSize: '13.5px' }}>
                      {previewModalReq.status === 'approved' || previewModalReq.adminApproved ? (
                        <span style={{ color: 'var(--success)' }}>🟢 معتمد نهائياً ومطبق بالنظام</span>
                      ) : previewModalReq.status === 'rejected' ? (
                        <span style={{ color: 'var(--danger)' }}>🔴 مرفوض من الإدارة العليا</span>
                      ) : (previewModalReq.branchRejected || previewModalReq.branchApprovalStatus === 'rejected' || previewModalReq.managerStatus === 'rejected' || previewModalReq.branchDecision === 'rejected') ? (
                        <span style={{ color: 'var(--accent)' }}>⏳ قيد نظر الإدارة العليا (لم يوافق الفرع)</span>
                      ) : (
                        <span style={{ color: 'var(--accent)' }}>🟡 بانتظار قرار واعتماد الإدارة العليا</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Specific Details Based on Request Type */}
                
                {/* ── LEAVE DETAILS ── */}
                {isLeave && (
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: 'var(--success)', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏖️ تفاصيل الإجازة المطلوبة:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>نوع الإجازة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '14px' }}>
                          {previewModalReq.leaveType === 'annual' ? 'إجازة سنوية اعتيادية' : previewModalReq.leaveType === 'sick' ? 'إجازة مرضية' : previewModalReq.leaveType === 'unpaid' ? 'إجازة بدون أجر' : 'إجازة رسمية'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ البدء:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          📅 {previewModalReq.startDate || '—'} {previewModalReq.startDate && `(${arabicWeekday(previewModalReq.startDate)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ الانتهاء:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          📅 {previewModalReq.endDate || '—'} {previewModalReq.endDate && `(${arabicWeekday(previewModalReq.endDate)})`}
                        </div>
                      </div>
                      <div style={{ background: 'var(--success-tint)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--success)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 'bold' }}>إجمالي عدد أيام الإجازة:</span>
                        <div style={{ fontWeight: '900', color: 'var(--success)', fontSize: '16px' }}>
                          ⏱️ {calculateLeaveDays()} أيام
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── LOAN / ADVANCE / MEDS DETAILS (مع إمكانية تعديل الإدارة العليا قبل الاعتماد) ── */}
                {isLoan && (
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        💳 تفاصيل السلفة / الدواء الآجل المطلوب:
                      </h4>
                      {previewModalReq.status !== 'approved' && previewModalReq.status !== 'rejected' && (
                        <button
                          type="button"
                          className="btn"
                          style={{
                            padding: '5px 12px',
                            fontSize: '12px',
                            background: isEditingLoan ? 'var(--primary)' : 'var(--surface)',
                            color: isEditingLoan ? '#fff' : 'var(--primary)',
                            border: '1px solid var(--primary)',
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
                      <div style={{ background: 'var(--primary-tint)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--primary)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 'bold' }}>المبلغ المطلوب من الموظف:</span>
                        <div style={{ fontWeight: '900', color: 'var(--primary)', fontSize: '17px' }}>
                          💰 {previewModalReq.originalAmount || previewModalReq.amount || previewModalReq.totalAmount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>نظام السداد المطلوب:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '13.5px' }}>
                          {isInstallment ? '📆 سلفة مقسطة على عدة شهور' : '💵 سلفة شهرية (خصم دفعة واحدة)'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>عدد الأقساط:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          {installmentsCount} شهر / قسط
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>قيمة الخصم الشهري (القسط):</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '14px' }}>
                          {monthlyDed > 0 ? `${monthlyDed} ج.م / شهر` : `${totalAmount} ج.م`}
                        </div>
                      </div>
                    </div>

                    {/* Medicines Detail Table if Credit Medicine */}
                    {(() => {
                      const medItemsList = previewModalReq.medicines || previewModalReq.medsItems || previewModalReq.items || previewModalReq.medsDetails || [];
                      if (medItemsList.length === 0) return null;

                      return (
                        <div style={{ marginTop: '14px', background: 'var(--surface)', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid var(--primary)', boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            <h5 style={{ margin: 0, color: 'var(--primary)', fontSize: '13.5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>💊</span>
                              <span>بيان وقائمة الأصناف والأدوية المطلوبة بالآجل ({medItemsList.length} صنف):</span>
                            </h5>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', background: 'var(--primary-tint)', padding: '3px 10px', borderRadius: '6px' }}>
                              إجمالي تكلفة الأصناف: {fmt(previewModalReq.totalAmount || previewModalReq.amount || totalAmount)} ج.م
                            </span>
                          </div>
                          <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                              <thead>
                                <tr style={{ background: 'var(--surface-muted)', color: 'var(--primary)', fontWeight: 'bold' }}>
                                  <th style={{ padding: '6px', border: '1px solid var(--border)', width: '6%' }}>#</th>
                                  <th style={{ padding: '6px 12px', border: '1px solid var(--border)', width: '42%', textAlign: 'right' }}>اسم الدواء / الصنف</th>
                                  <th style={{ padding: '6px', border: '1px solid var(--border)', width: '18%' }}>سعر الوحدة</th>
                                  <th style={{ padding: '6px', border: '1px solid var(--border)', width: '14%' }}>الكمية</th>
                                  <th style={{ padding: '6px', border: '1px solid var(--border)', width: '20%' }}>الإجمالي الصافي</th>
                                </tr>
                              </thead>
                              <tbody>
                                {medItemsList.map((item, idx) => {
                                  const itemPrice = parseFloat(item.price) || 0;
                                  const itemQty = parseFloat(item.qty || item.quantity) || 1;
                                  const itemTotal = itemPrice * itemQty;
                                  return (
                                    <tr key={item.id || idx} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)' }}>
                                      <td style={{ padding: '6px', border: '1px solid var(--border)' }}>{idx + 1}</td>
                                      <td style={{ padding: '6px 12px', border: '1px solid var(--border)', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                                        {item.name || item.title || 'دواء / صنف'}
                                      </td>
                                      <td style={{ padding: '6px', border: '1px solid var(--border)' }}>{fmt(itemPrice)} ج.م</td>
                                      <td style={{ padding: '6px', border: '1px solid var(--border)', fontWeight: 'bold' }}>{itemQty}</td>
                                      <td style={{ padding: '6px', border: '1px solid var(--border)', fontWeight: 'bold', color: 'var(--primary)' }}>
                                        {fmt(itemTotal)} ج.م
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: 'var(--surface-muted)', fontWeight: 'bold', color: 'var(--primary)', fontSize: '12.5px' }}>
                                  <td colSpan="4" style={{ padding: '6px 12px', border: '1px solid var(--border)', textAlign: 'right' }}>
                                    المجموع الكلي المطلوب للأدوية:
                                  </td>
                                  <td style={{ padding: '6px', border: '1px solid var(--border)', fontWeight: '900', color: 'var(--primary)' }}>
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
                      <div style={{ marginTop: '12px', background: 'var(--accent-tint)', border: '1px solid var(--accent)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--accent)' }}>
                        <strong>⚠️ قرار وتعديل الإدارة العليا: </strong>
                        تم تعديل المبلغ المعتمد إلى <strong>{previewModalReq.amount} ج.م</strong>
                        {previewModalReq.adminNotes && ` — (${previewModalReq.adminNotes})`}
                      </div>
                    )}

                    {/* Interactive Admin Edit Form */}
                    {isEditingLoan && (
                      <div style={{ marginTop: '14px', background: 'var(--surface)', border: '2px solid var(--primary)', padding: '14px', borderRadius: '10px', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: 'var(--primary)', fontWeight: 'bold', fontSize: '13.5px' }}>
                          <span>✏️</span>
                          <span>لوحة تعديل وتخصيص السلفة المعتمدة من الإدارة العليا:</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px' }}>
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
                              style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1.5px solid var(--primary)', fontWeight: 'bold', fontSize: '14px', color: 'var(--primary)', background: 'var(--surface-muted)' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px' }}>
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
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px' }}>
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
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px' }}>
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
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px' }}>
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
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#a855f7', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🔄 تفاصيل تبديل الشيفت والراحات بين الموظفين:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                      <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '12px', color: '#a855f7', fontWeight: 'bold' }}>1. الموظف الطالب (الطرف الأول):</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', marginTop: '2px' }}>
                          {previewModalReq.employeeName || empObj?.name || 'مقدم الطلب'} {empObj?.code ? `(كود: ${empObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                          📅 تاريخ شيفت الموظف: <strong>{previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date || '—'}</strong> { (previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date) && `(${arabicWeekday(previewModalReq.requesterDate || previewModalReq.startDate || previewModalReq.date)})` }
                        </div>
                      </div>

                      <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '12px', color: '#a855f7', fontWeight: 'bold' }}>2. الزميل البديل (الطرف الثاني):</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', marginTop: '2px' }}>
                          {previewModalReq.targetEmpName || targetEmpObj?.name || 'الزميل البديل'} {targetEmpObj?.code ? `(كود: ${targetEmpObj.code})` : ''}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                          📅 تاريخ شيفت الزميل: <strong>{previewModalReq.targetDate || previewModalReq.peerDate || '—'}</strong> { (previewModalReq.targetDate || previewModalReq.peerDate) && `(${arabicWeekday(previewModalReq.targetDate || previewModalReq.peerDate)})` }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── PUNCH CORRECTION / MANUAL PUNCH DETAILS ── */}
                {isPunch && (
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: 'var(--success)', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🖐️ تفاصيل تسجيل / تعديل البصمة اليدوية:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>نوع البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          {previewModalReq.punchType === 'full' ? 'حضور وانصراف (وردية كاملة)' : previewModalReq.punchType === 'in' ? 'تسجيل حضور فقط' : previewModalReq.punchType === 'out' ? 'تسجيل انصراف فقط' : 'تعديل توقيت بصمة'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ البصمة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          📅 {previewModalReq.date || '—'} {previewModalReq.date && `(${arabicWeekday(previewModalReq.date)})`}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>وقت الحضور والانصراف:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          من <strong>{previewModalReq.timeIn || '—'}</strong> إلى <strong>{previewModalReq.timeOut || '—'}</strong>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>ساعات البريك المخصومة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          ☕ {previewModalReq.breakHours !== undefined ? previewModalReq.breakHours : 0} ساعة
                        </div>
                      </div>
                      {previewModalReq.hours && (
                        <div style={{ background: 'var(--success-tint)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--success)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 'bold' }}>صافي ساعات العمل المحسوبة:</span>
                          <div style={{ fontWeight: '900', color: 'var(--success)', fontSize: '16px' }}>
                            ⏱️ {previewModalReq.hours} ساعة
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── BIOMETRIC VERIFICATION / PHOTO PUNCH DETAILS ── */}
                {isBiometricVerification && (
                  <div style={{ background: '#f0fdfa', padding: '18px', borderRadius: '14px', border: '1.5px solid #2dd4bf', boxShadow: '0 4px 14px rgba(13, 148, 136, 0.1)', marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#0f766e', fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📸 تفاصيل طلب اعتماد الحضور بالصورة الحية:
                      </h4>
                      <span style={{ background: '#ccfbf1', color: '#0f766e', border: '1px solid #99f6e4', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}>
                        {previewModalReq.actionBadge || previewModalReq.typeLabel || 'اعتماد بالصورة'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>نوع الإجراء المطلوب:</span>
                        <div style={{ fontWeight: 800, color: '#115e59', fontSize: '14px' }}>
                          {previewModalReq.targetAction === 'shift_start' ? '🟢 تسجيل دخول (بداية الوردية)' :
                           previewModalReq.targetAction === 'shift_end' ? '🔴 تسجيل خروج (نهاية الوردية)' :
                           previewModalReq.targetAction === 'break_start' ? '☕ بدء استراحة (بريك)' :
                           previewModalReq.targetAction === 'break_end' ? '⏱️ انتهاء استراحة (بريك)' :
                           (previewModalReq.actionLabel || previewModalReq.targetAction || 'بصمة حية')}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>وقت وتاريخ التوثيق بالكشك:</span>
                        <div style={{ fontWeight: 800, color: '#115e59' }}>
                          🕒 {previewModalReq.time || '—'} بتاريخ {previewModalReq.date || '—'}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>فرع التوثيق:</span>
                        <div style={{ fontWeight: 800, color: '#115e59' }}>
                          🏢 {previewModalReq.branchName || branchObj?.name || 'الفرع'}
                        </div>
                      </div>
                    </div>

                    {/* Side-by-Side Face Comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid #ccfbf1' }}>
                      {/* Enrolled Profile Photo */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          👤 الصورة الرسمية المسجلة للموظف:
                        </div>
                        {empObj?.photoUrl ? (
                          <img
                            src={empObj.photoUrl}
                            alt="الصورة الرسمية"
                            style={{ width: '130px', height: '130px', objectFit: 'cover', borderRadius: '12px', border: '2px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' }}
                            title="انقر لتكبير الصورة ومقارنتها"
                            onClick={() => setLightboxPhoto({
                              url: empObj.photoUrl,
                              title: `الصورة الرسمية المسجلة - ${empObj.name || previewModalReq.employeeName || ''}`,
                              compareUrl: (previewModalReq.photoUrl || previewModalReq.drivePhotoUrl) || null,
                              compareTitle: 'صورة الكشك الملتقطة'
                            })}
                          />
                        ) : (
                          <div style={{ width: '130px', height: '130px', borderRadius: '12px', background: '#f1f5f9', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto', border: '2px dashed #cbd5e1' }}>
                            👤
                          </div>
                        )}
                      </div>

                      {/* Captured Kiosk Live Photo */}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', padding: '0 8px' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e' }}>
                            📸 الصورة الملتقطة بالكشك:
                          </span>
                          {previewModalReq.drivePhotoUrl && (
                            <a href={previewModalReq.drivePhotoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#0284c7', textDecoration: 'none', fontWeight: 700 }}>
                              ☁️ فتح الدرايف ↗
                            </a>
                          )}
                        </div>
                        {(previewModalReq.photoUrl || previewModalReq.drivePhotoUrl) ? (
                          <img
                            src={previewModalReq.photoUrl || previewModalReq.drivePhotoUrl}
                            alt="صورة الكشك"
                            style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '12px', border: '2px solid #0d9488', background: '#000', cursor: 'pointer' }}
                            title="انقر لتكبير صورة الكشك ومقارنتها"
                            onClick={() => setLightboxPhoto({
                              url: previewModalReq.photoUrl || previewModalReq.drivePhotoUrl,
                              title: `صورة الكشك الحية - ${previewModalReq.employeeName || ''} (${previewModalReq.date || ''} ${previewModalReq.time || ''})`,
                              compareUrl: empObj?.photoUrl || null,
                              compareTitle: 'الصورة الرسمية للموظف'
                            })}
                          />
                        ) : (
                          <div style={{ height: '130px', borderRadius: '12px', background: '#f8fafc', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1' }}>
                            لا توجد صورة متوفرة
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── BONUS DETAILS ── */}
                {previewModalReq.type === 'bonus' && (
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: 'var(--success)', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🎁 تفاصيل طلب المكافأة / الحافز:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div style={{ background: 'var(--success-tint)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--success)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 'bold' }}>مبلغ المكافأة المقترح:</span>
                        <div style={{ fontWeight: '900', color: 'var(--success)', fontSize: '18px' }}>
                          💰 {previewModalReq.amount} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ الاستحقاق:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>مبررات وأسباب المكافأة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', background: 'var(--surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '4px' }}>
                          {previewModalReq.reason || previewModalReq.details || '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── DISCIPLINARY VIOLATION & BRANCH MANAGER DECISION DETAILS (جزاء تأديبي ومخالفة موثقة من الفرع) ── */}
                {isDisciplinaryViolation && (
                  <div style={{ background: 'var(--surface-muted)', padding: '18px', borderRadius: '14px', border: '1.5px solid var(--danger)', boxShadow: 'var(--shadow-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: 'var(--danger)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                        <span>⚠️</span>
                        <span>تفاصيل المخالفة التأديبية وقرار مدير الفرع:</span>
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {previewModalReq.occurrenceNumber && (
                          <span style={{ background: 'var(--danger-tint)', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                            🔁 التكرار: المرة {previewModalReq.occurrenceNumber === 1 ? 'الأولى' : previewModalReq.occurrenceNumber === 2 ? 'الثانية' : previewModalReq.occurrenceNumber === 3 ? 'الثالثة' : previewModalReq.occurrenceNumber === 4 ? 'الرابعة' : `${previewModalReq.occurrenceNumber}`}
                          </span>
                        )}
                        {previewModalReq.categoryCode && (
                          <span style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700 }}>
                            كود اللائحة: {previewModalReq.categoryCode}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Violation Details Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>بند / مسمى المخالفة:</span>
                        <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '14px', marginTop: '2px' }}>
                          ⚖️ {previewModalReq.ruleTitle || previewModalReq.violationTitle || previewModalReq.categoryName || previewModalReq.reason || 'مخالفة لائحية'}
                        </div>
                      </div>

                      <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>تصنيف لائحة العمل:</span>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '13.5px', marginTop: '2px' }}>
                          📜 {previewModalReq.categoryName || 'لائحة الجزاءات والانضباط'}
                        </div>
                      </div>

                      <div style={{ background: 'var(--danger-tint)', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--danger)' }}>
                        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 700 }}>قرار وعقوبة مدير الفرع:</span>
                        <div style={{ fontWeight: 900, color: 'var(--danger)', fontSize: '15px', marginTop: '2px' }}>
                          🚨 {previewModalReq.actionTitle || previewModalReq.penaltyAction || 'لفت نظر / خصم تأديبي'}
                        </div>
                      </div>

                      {(parseFloat(previewModalReq.amount || previewModalReq.penaltyAmount) > 0 || parseFloat(previewModalReq.deductionDays || previewModalReq.penaltyDays) > 0) && (
                        <div style={{ background: 'var(--danger-tint)', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--danger)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 700 }}>الأثر المالي للخصم:</span>
                          <div style={{ fontWeight: 900, color: 'var(--danger)', fontSize: '16px', marginTop: '2px' }}>
                            💸 {previewModalReq.deductionDays ? `خصم ${previewModalReq.deductionDays} يوم ` : ''}
                            {previewModalReq.amount ? `(${previewModalReq.amount} ج.م)` : ''}
                          </div>
                        </div>
                      )}

                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ حدوث الواقعة:</span>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '13.5px', marginTop: '2px' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>موثق المخالفة:</span>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '13.5px', marginTop: '2px' }}>
                          👔 {previewModalReq.createdByName || 'مدير الفرع'}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Incident Notes */}
                    {previewModalReq.details && (
                      <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                          📝 تفاصيل ووقائع المخالفة المسجلة:
                        </span>
                        <div style={{ color: 'var(--text)', lineHeight: 1.6, fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                          {previewModalReq.details}
                        </div>
                      </div>
                    )}

                    {/* Investigation Notes if present */}
                    {previewModalReq.investigationNotes && (
                      <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                          🔍 ملخص التحقيق وأقوال الموظف:
                        </span>
                        <div style={{ color: 'var(--text)', lineHeight: 1.6, fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                          {previewModalReq.investigationNotes}
                        </div>
                      </div>
                    )}

                    {/* Override reason if present */}
                    {previewModalReq.overrideReason && (
                      <div style={{ background: 'var(--accent-tint)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--accent)', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, display: 'block' }}>
                          ⚠️ مبررات الاستثناء وتجاوز التدرج اللائحي:
                        </span>
                        <div style={{ color: 'var(--accent)', fontSize: '12.5px', marginTop: '3px' }}>
                          {previewModalReq.overrideReason}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PENALTY OBJECTION DETAILS ── */}
                {isPenaltyObjection && (
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#a855f7', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✋ تفاصيل تظلم الموظف من الجزاء:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>مسمى المخالفة / الجزاء:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '14px' }}>
                          ⚖️ {previewModalReq.violationTitle || previewModalReq.title || (previewModalReq.subType === 'lateness' ? 'تأخير عن العمل' : 'جزاء تأديبي لائحي')}
                        </div>
                      </div>
                      {(previewModalReq.latenessMinutes || previewModalReq.deductionMinutes) && (
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>مدة / دقائق التأخير:</span>
                          <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                            ⏱️ {previewModalReq.latenessMinutes || previewModalReq.deductionMinutes} دقيقة
                          </div>
                        </div>
                      )}
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>قيمة الخصم المالي:</span>
                        <div style={{ fontWeight: '900', color: 'var(--danger)', fontSize: '16px' }}>
                          💸 {previewModalReq.penaltyAmount || previewModalReq.amount || '0'} ج.م
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>تاريخ الواقعة:</span>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                          📅 {previewModalReq.date || previewModalReq.createdAt?.slice(0, 10) || '—'}
                        </div>
                      </div>
                    </div>

                    {/* Objection reasons box */}
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginTop: '10px' }}>
                      <div style={{ fontWeight: 'bold', color: '#a855f7', marginBottom: '6px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✋</span>
                        <span>أسباب ومبررات التظلم المقدمة من الموظف:</span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: 'var(--text)', background: 'var(--surface-muted)', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', lineHeight: '1.6' }}>
                        "{previewModalReq.reason || (typeof previewModalReq.objection === 'object' ? previewModalReq.objection.reason : previewModalReq.objection) || previewModalReq.details || '—'}"
                      </div>
                      {previewModalReq.status === 'pending' || previewModalReq.objection?.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ background: 'var(--success)', color: '#fff', fontSize: '13px', padding: '8px 16px', fontWeight: 'bold', borderRadius: '8px' }}
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
                            style={{ background: 'var(--danger)', color: '#fff', fontSize: '13px', padding: '8px 16px', fontWeight: 'bold', borderRadius: '8px' }}
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
                  <div style={{ background: 'var(--surface-muted)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px', color: 'var(--success)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⏱️ تفاصيل الساعات الإضافية ومقارنة الوردية:
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      <div style={{ background: 'var(--surface)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block' }}>الوردية المقررة بالجدول:</span>
                        <strong style={{ color: 'var(--text)' }}>{previewModalReq.regularHours || previewModalReq.scheduledHours || 8} ساعات ({previewModalReq.scheduledStart || '—'} ➔ {previewModalReq.scheduledEnd || '—'})</strong>
                      </div>
                      <div style={{ background: 'var(--surface)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '11.5px', display: 'block' }}>البصمة وساعات العمل الفعلية:</span>
                        <strong style={{ color: 'var(--text)' }}>{previewModalReq.totalShiftHours || previewModalReq.actualWorkedHours || '—'} ساعات ({previewModalReq.actualIn || '—'} ➔ {previewModalReq.actualOut || '—'})</strong>
                      </div>
                      <div style={{ background: 'var(--success-tint)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--success)' }}>
                        <span style={{ color: 'var(--success)', fontSize: '11.5px', display: 'block' }}>الساعات الإضافية المطلوب اعتمادها:</span>
                        <strong style={{ color: 'var(--success)', fontSize: '14px' }}>+{previewModalReq.hours} ساعة إضافية</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── COMP-OFF GRANT DETAILS ── */}
                {isCompOffGrant && (
                  <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1.5px solid #10b981' }}>
                    <h4 style={{ margin: '0 0 10px', color: '#065f46', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🛋️ تفاصيل احتساب يوم بدل راحة (حضور في يوم راحة):
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '13px' }}>
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                        <span style={{ color: '#047857', fontSize: '11.5px', display: 'block' }}>تاريخ العمل في الراحة:</span>
                        <strong style={{ color: '#065f46' }}>{previewModalReq.date || '—'} {previewModalReq.date && `(${arabicWeekday(previewModalReq.date)})`}</strong>
                      </div>
                      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                        <span style={{ color: '#047857', fontSize: '11.5px', display: 'block' }}>ساعات العمل الفعلية المسجلة:</span>
                        <strong style={{ color: '#065f46' }}>{previewModalReq.actualWorkedHours || previewModalReq.hours || '—'} ساعات</strong>
                      </div>
                      <div style={{ background: '#d1fae5', padding: '8px 12px', borderRadius: '8px', border: '1px solid #10b981' }}>
                        <span style={{ color: '#047857', fontSize: '11.5px', display: 'block' }}>الرصيد المكتسب عند الاعتماد:</span>
                        <strong style={{ color: '#065f46', fontSize: '14px' }}>+{previewModalReq.daysCount || 1} يوم رصيد بدل راحة</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── ROSTER EDIT DETAILS & COMPARISON (الجدول السابق مقابل الجديد) ── */}
                {isRoster && (() => {
                  const existingRoster = (state.rosters || []).find(r => 
                    (String(r.employeeId) === String(previewModalReq.employeeId) || (previewModalReq.employeeCode && String(r.employeeCode) === String(previewModalReq.employeeCode))) &&
                    (!previewModalReq.month || r.month === previewModalReq.month)
                  );

                  const rawPrev = previewModalReq.oldSchedule || previewModalReq.previousSchedule || existingRoster?.schedule || {};
                  const rawNew = previewModalReq.schedule || previewModalReq.newSchedule || {};

                  const normPrev = normalizeSchedule(rawPrev);
                  const normNew = normalizeSchedule(rawNew);

                  const prevSchedule = normPrev || (typeof rawPrev === 'object' && rawPrev !== null ? rawPrev : {});
                  const newSchedule = normNew || (typeof rawNew === 'object' && rawNew !== null ? rawNew : {});

                  const standardDays = [
                    { key: 'السبت', label: 'السبت', isStandard: true },
                    { key: 'الأحد', label: 'الأحد', isStandard: true },
                    { key: 'الاثنين', label: 'الاثنين', isStandard: true },
                    { key: 'الثلاثاء', label: 'الثلاثاء', isStandard: true },
                    { key: 'الأربعاء', label: 'الأربعاء', isStandard: true },
                    { key: 'الخميس', label: 'الخميس', isStandard: true },
                    { key: 'الجمعة', label: 'الجمعة', isStandard: true },
                  ];

                  const isIsoDate = (k) => /^\d{4}-\d{2}-\d{2}$/.test(String(k).trim());
                  const customDateKeys = Array.from(new Set([
                    ...Object.keys(rawNew || {}).filter(isIsoDate),
                    ...Object.keys(rawPrev || {}).filter(isIsoDate),
                    ...((Array.isArray(previewModalReq.dates) ? previewModalReq.dates : []).filter(isIsoDate)),
                    ...(previewModalReq.date && isIsoDate(previewModalReq.date) ? [previewModalReq.date] : [])
                  ]));
                  const hasCustomDates = customDateKeys.length > 0;

                  const displayList = hasCustomDates 
                    ? customDateKeys.sort().map(dateKey => {
                        const d = new Date(dateKey + 'T00:00:00');
                        const arDay = !isNaN(d.getTime()) ? d.toLocaleDateString('ar-EG', { weekday: 'long' }) : '';
                        return { key: dateKey, label: arDay ? `${dateKey} (${arDay})` : dateKey, isDate: true };
                      })
                    : standardDays;

                  return (
                    <div style={{ background: 'var(--surface-muted)', padding: '18px', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: 'var(--text)', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isShiftAdjustment ? '🔄 مقارنة ومعاينة تعديل مواعيد الشيفت (الجدول المعتمد مقابل المعدل):' : '📅 مقارنة ومعاينة تعديل الجدول الشهري (الجدول السابق مقابل الجديد):'}
                        </h4>
                        <span style={{ fontSize: '12px', background: 'var(--primary-tint)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
                          الشهر: {previewModalReq.month || 'الشهر الحالي'}
                        </span>
                      </div>

                      {isShiftAdjustment && (
                        <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: '#6d28d9' }}>
                          <strong>⚡ إعفاء تلقائي من جزاءات التأخير: </strong>
                          عند موافقة الإدارة، يتم إلغاء وتصفير أي جزاء تأخير أو خصم مالي على التواريخ المعدلة وتحديث الروستر ومسير الرواتب تلقائياً.
                        </div>
                      )}

                      {previewModalReq.details && (
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', color: 'var(--text)' }}>
                          <strong>📝 تفاصيل التعديل المطلوبة: </strong> {previewModalReq.details}
                        </div>
                      )}

                      <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                        <table className="table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-muted)', color: 'var(--text)' }}>
                              <th style={{ padding: '8px 10px' }}>اليوم</th>
                              <th style={{ padding: '8px 10px', background: 'var(--danger-tint)', color: 'var(--danger)' }}>⏮️ الجدول السابق (قبل التعديل)</th>
                              <th style={{ padding: '8px 10px', background: 'var(--success-tint)', color: 'var(--success)' }}>⏭️ الجدول الجديد (بعد التعديل)</th>
                              <th style={{ padding: '8px 10px' }}>موقف التغيير</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayList.map((dayItem) => {
                              let oldDay = prevSchedule?.[dayItem.key];
                              if (!oldDay && dayItem.isDate) {
                                oldDay = getEmployeeDaySchedule(previewModalReq.employeeId, dayItem.key, state);
                              }
                              if (!oldDay) {
                                oldDay = { type: dayItem.key === 'الجمعة' ? 'off' : 'shift', start: '08:00', end: '16:00' };
                              }

                              const newDay = newSchedule?.[dayItem.key] || oldDay;

                              const isOldOff = oldDay.type === 'off' || oldDay.isOff === true;
                              const isNewOff = newDay.type === 'off' || newDay.isOff === true;

                              const oldStart = oldDay.start || oldDay.checkIn || (isOldOff ? '—' : '08:00');
                              const oldEnd = oldDay.end || oldDay.checkOut || (isOldOff ? '—' : '16:00');

                              const newStart = newDay.start || newDay.checkIn || (isNewOff ? '—' : '08:00');
                              const newEnd = newDay.end || newDay.checkOut || (isNewOff ? '—' : '16:00');

                              const isChanged = (isOldOff !== isNewOff) || (oldStart !== newStart) || (oldEnd !== newEnd);

                              return (
                                <tr key={dayItem.key} style={{ background: isChanged ? 'var(--accent-tint)' : 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ fontWeight: 'bold', color: 'var(--text)' }}>{dayItem.label}</td>
                                  
                                  {/* Previous Schedule */}
                                  <td style={{ background: isOldOff ? 'var(--danger-tint)' : 'transparent' }}>
                                    {isOldOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: 'var(--muted)' }}>
                                          من <strong>{oldStart}</strong> إلى <strong>{oldEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* New Schedule */}
                                  <td style={{ background: isNewOff ? 'var(--danger-tint)' : 'transparent' }}>
                                    {isNewOff ? (
                                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 راحة أسبوعية</span>
                                    ) : (
                                      <div>
                                        <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 وردية عمل</span>
                                        <div style={{ fontSize: '12px', marginTop: '3px', color: 'var(--success)', fontWeight: 'bold' }}>
                                          من <strong>{newStart}</strong> إلى <strong>{newEnd}</strong>
                                        </div>
                                      </div>
                                    )}
                                  </td>

                                  {/* Change Status */}
                                  <td>
                                    {isChanged ? (
                                      <span style={{ background: 'var(--accent-tint)', color: 'var(--accent)', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', display: 'inline-block' }}>
                                        ⚡ تم التعديل
                                      </span>
                                    ) : (
                                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>مطابق</span>
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

                {/* ── PROFILE UPDATE DETAILS & COMPARISON (البيانات السابقة مقابل الجديدة) ── */}
                {isProfileUpdate && (() => {
                  const proposed = previewModalReq.proposedChanges || previewModalReq.proposed || {};
                  const current = previewModalReq.currentData || {
                    phones: empObj?.phones || (empObj?.phone ? [empObj.phone] : []),
                    address: empObj?.address || '',
                    maritalStatus: empObj?.maritalStatus || 'أعزب',
                    photoUrl: empObj?.photoUrl || empObj?.photo || ''
                  };

                  const prevPhoto = current.photoUrl || empObj?.photoUrl || empObj?.photo || '';
                  const newPhoto = proposed.photoUrl || previewModalReq.photoUrl || '';
                  const hasPhotoChange = Boolean(newPhoto && newPhoto !== prevPhoto);

                  const normalizePhonesList = (list) => {
                    if (!list) return [];
                    if (Array.isArray(list)) {
                      return list.map(p => (typeof p === 'object' && p ? (p.number || '') : String(p))).filter(Boolean);
                    }
                    if (typeof list === 'string') return [list];
                    return [];
                  };

                  const prevPhones = normalizePhonesList(current.phones);
                  const newPhones = normalizePhonesList(proposed.phones || proposed.phone);
                  const hasPhonesChange = JSON.stringify(prevPhones) !== JSON.stringify(newPhones) && newPhones.length > 0;

                  const prevAddress = current.address || empObj?.address || '—';
                  const newAddress = proposed.address !== undefined ? proposed.address : '—';
                  const hasAddressChange = newAddress !== '—' && newAddress !== prevAddress;

                  const prevMarital = current.maritalStatus || empObj?.maritalStatus || 'أعزب';
                  const newMarital = proposed.maritalStatus || '—';
                  const hasMaritalChange = newMarital !== '—' && newMarital !== prevMarital;

                  return (
                    <div style={{ background: 'var(--surface-muted)', padding: '18px', borderRadius: '14px', border: '1.5px solid #0d9488' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                        <h4 style={{ margin: 0, color: '#0f766e', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                          <span>👤</span>
                          <span>مقارنة البيانات الشخصية المطلوبة (البيانات السابقة ⬅️ البيانات الجديدة):</span>
                        </h4>
                        <span style={{ fontSize: '12px', background: '#ccfbf1', color: '#0f766e', padding: '3px 10px', borderRadius: '6px', fontWeight: 700 }}>
                          تحديث ملف شخصي
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* 1. Profile Photo Comparison */}
                        <div style={{ background: hasPhotoChange ? '#f0fdf4' : 'var(--surface)', border: hasPhotoChange ? '1.5px solid #86efac' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>📷</span> الصورة الشخصية:
                            </span>
                            {hasPhotoChange ? (
                              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                ⚡ تم رفع صورة شخصية جديدة
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>لم يتم تعديل الصورة</span>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                            {/* Old Photo */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>الصورة السابقة (الحالية)</span>
                              <div style={{ width: '65px', height: '65px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #cbd5e1', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                                {prevPhoto ? (
                                  <img src={prevPhoto} alt="السابقة" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: '24px', color: '#94a3b8' }}>👤</span>
                                )}
                              </div>
                            </div>

                            <div style={{ fontSize: '20px', color: '#0d9488', fontWeight: 'bold' }}>➔</div>

                            {/* New Photo */}
                            <div style={{ textAlign: 'center' }}>
                              <span style={{ display: 'block', fontSize: '11px', color: hasPhotoChange ? '#15803d' : 'var(--muted)', fontWeight: 700, marginBottom: '4px' }}>
                                الصورة الجديدة المقترحة
                              </span>
                              <div
                                style={{ width: '65px', height: '65px', borderRadius: '50%', overflow: 'hidden', border: hasPhotoChange ? '3px solid #10b981' : '2px dashed #cbd5e1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: hasPhotoChange ? '0 4px 10px rgba(16,185,129,0.3)' : 'none', cursor: newPhoto ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (newPhoto) {
                                    setLightboxPhoto({
                                      url: newPhoto,
                                      title: `الصورة الشخصية الجديدة المقترحة - ${previewModalReq.employeeName || ''}`,
                                      compareUrl: prevPhoto || null,
                                      compareTitle: 'الصورة الحالية المسجلة'
                                    });
                                  }
                                }}
                                title={newPhoto ? 'انقر لتكبير الصورة ومقارنتها' : ''}
                              >
                                {newPhoto ? (
                                  <img src={newPhoto} alt="الجديدة" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>بدون تعديل</span>
                                )}
                              </div>
                              {newPhoto && (
                                <span
                                  style={{ fontSize: '10.5px', color: '#0d9488', display: 'block', marginTop: '3px', cursor: 'pointer' }}
                                  onClick={() => setLightboxPhoto({
                                    url: newPhoto,
                                    title: `الصورة الشخصية الجديدة المقترحة - ${previewModalReq.employeeName || ''}`,
                                    compareUrl: prevPhoto || null,
                                    compareTitle: 'الصورة الحالية المسجلة'
                                  })}
                                >
                                  🔍 تكبير ومقارنة الصورة
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 2. Phone Numbers Comparison */}
                        <div style={{ background: hasPhonesChange ? '#f0fdf4' : 'var(--surface)', border: hasPhonesChange ? '1.5px solid #86efac' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>📞</span> أرقام التواصل والهاتف:
                            </span>
                            {hasPhonesChange ? (
                              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                ⚡ تم تعديل أرقام الهاتف
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>مطابق</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                            <div style={{ background: 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>الأرقام السابقة:</span>
                              <strong style={{ color: '#64748b' }}>
                                {prevPhones.length > 0 ? prevPhones.join(' ، ') : 'لا يوجد أرقام مسجلة'}
                              </strong>
                            </div>
                            <div style={{ background: hasPhonesChange ? '#dcfce7' : 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: hasPhonesChange ? '#166534' : 'var(--muted)', display: 'block', fontSize: '11px', fontWeight: 700 }}>الأرقام الجديدة:</span>
                              <strong style={{ color: hasPhonesChange ? '#15803d' : 'var(--text)' }}>
                                {newPhones.length > 0 ? newPhones.join(' ، ') : (prevPhones.join(' ، ') || '—')}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* 3. Address Comparison */}
                        <div style={{ background: hasAddressChange ? '#f0fdf4' : 'var(--surface)', border: hasAddressChange ? '1.5px solid #86efac' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>📍</span> محل الإقامة / العنوان:
                            </span>
                            {hasAddressChange ? (
                              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                ⚡ تم تعديل العنوان
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>مطابق</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                            <div style={{ background: 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>العنوان السابق:</span>
                              <strong style={{ color: '#64748b' }}>{prevAddress}</strong>
                            </div>
                            <div style={{ background: hasAddressChange ? '#dcfce7' : 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: hasAddressChange ? '#166534' : 'var(--muted)', display: 'block', fontSize: '11px', fontWeight: 700 }}>العنوان الجديد:</span>
                              <strong style={{ color: hasAddressChange ? '#15803d' : 'var(--text)' }}>{newAddress !== '—' ? newAddress : prevAddress}</strong>
                            </div>
                          </div>
                        </div>

                        {/* 4. Marital Status Comparison */}
                        <div style={{ background: hasMaritalChange ? '#f0fdf4' : 'var(--surface)', border: hasMaritalChange ? '1.5px solid #86efac' : '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>💍</span> الحالة الاجتماعية:
                            </span>
                            {hasMaritalChange ? (
                              <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                                ⚡ تم تعديل الحالة الاجتماعية
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>مطابق</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                            <div style={{ background: 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>الحالة السابقة:</span>
                              <strong style={{ color: '#64748b' }}>{prevMarital}</strong>
                            </div>
                            <div style={{ background: hasMaritalChange ? '#dcfce7' : 'var(--surface-muted)', padding: '8px 12px', borderRadius: '6px' }}>
                              <span style={{ color: hasMaritalChange ? '#166534' : 'var(--muted)', display: 'block', fontSize: '11px', fontWeight: 700 }}>الحالة الجديدة:</span>
                              <strong style={{ color: hasMaritalChange ? '#15803d' : 'var(--text)' }}>{newMarital !== '—' ? newMarital : prevMarital}</strong>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}

                {/* ── SCHEDULE DEVIATION DETAILS (عدم الالتزام بالجدول) ── */}
                {isScheduleDeviation && (
                  <div style={{ background: '#fffbeb', padding: '18px', borderRadius: '14px', border: '1.5px solid #fde68a', boxShadow: '0 2px 10px rgba(245, 158, 11, 0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#92400e', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                        <span>⚠️</span>
                        <span>تفاصيل طلب عدم الالتزام بالجدول (حضور متأخر وانصراف متأخر):</span>
                      </h4>
                      <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                        تأخير حضور + استكمال بعد الوردية
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fde68a' }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>📅 الوردية المجدولة للموظف:</span>
                        <div style={{ fontWeight: 800, color: '#78350f', fontSize: '14px', marginTop: '4px' }}>
                          من <strong>{previewModalReq.scheduledStart || '—'}</strong> إلى <strong>{previewModalReq.scheduledEnd || '—'}</strong>
                        </div>
                        <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                          ساعات الوردية: {previewModalReq.scheduledHours || 8} ساعات
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fde68a' }}>
                        <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>⏱️ البصمة الفعلية المسجلة:</span>
                        <div style={{ fontWeight: 800, color: '#78350f', fontSize: '14px', marginTop: '4px' }}>
                          دخول: <strong>{previewModalReq.actualIn || previewModalReq.timeIn || '—'}</strong> ⬅️ خروج: <strong>{previewModalReq.actualOut || previewModalReq.timeOut || '—'}</strong>
                        </div>
                        <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px', fontWeight: 700 }}>
                          صافي الساعات الفعلية: {previewModalReq.actualWorkedHours || previewModalReq.hours || '—'} ساعة
                        </div>
                      </div>

                      <div style={{ background: '#fef2f2', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fca5a5' }}>
                        <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 700 }}>🏃‍♂️ مدة تأخير الحضور:</span>
                        <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '16px', marginTop: '4px' }}>
                          +{previewModalReq.lateArrivalMinutes || previewModalReq.latenessMinutes || 0} دقيقة
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#7f1d1d', marginTop: '2px' }}>
                          بعد بداية الوردية المجدولة
                        </div>
                      </div>

                      <div style={{ background: '#f0fdf4', padding: '12px 14px', borderRadius: '10px', border: '1px solid #86efac' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 700 }}>⏳ الاستمرار بعد نهاية الوردية:</span>
                        <div style={{ fontWeight: 900, color: '#15803d', fontSize: '16px', marginTop: '4px' }}>
                          +{previewModalReq.lateDepartureMinutes || 0} دقيقة
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '2px' }}>
                          بعد نهاية الوردية المجدولة
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#9a3412', marginBottom: '8px' }}>
                        📌 الأثر التشغيلي عند اتخاذ القرار:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                        <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#166534', lineHeight: 1.6 }}>
                          <strong style={{ display: 'block', marginBottom: '3px' }}>✓ في حالة الموافقة:</strong>
                          اعتماد صافي ساعات العمل الفعلية للموظف ({previewModalReq.actualWorkedHours || previewModalReq.hours || '—'} ساعة)، واحتساب أي ساعات زائدة عن ساعات العمل الأساسية كساعات إضافية، وإعفاء الموظف من جزاء التأخير لهذا اليوم.
                        </div>
                        <div style={{ background: '#fef2f2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fecaca', color: '#991b1b', lineHeight: 1.6 }}>
                          <strong style={{ display: 'block', marginBottom: '3px' }}>✕ في حالة الرفض:</strong>
                          استبعاد الساعات التي عملها الموظف بعد نهاية ورديته الرسمية، واحتساب الساعات الواقعة داخل نطاق الوردية فقط، مع إبقاء تطبيق لائحة جزاء التأخير.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── OVERTIME DETAILS (ساعات إضافية) ── */}
                {isOvertime && (
                  <div style={{ background: '#f0fdf4', padding: '18px', borderRadius: '14px', border: '1.5px solid #86efac', boxShadow: '0 2px 10px rgba(22, 101, 52, 0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#166534', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                        <span>⭐</span>
                        <span>تفاصيل ساعات العمل الإضافية:</span>
                      </h4>
                      <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
                        {previewModalReq.earlyOtHours > 0 && previewModalReq.lateOtHours > 0 ? 'إضافي قبل وبعد الوردية' : 'إضافي وردية'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>📅 الوردية المجدولة:</span>
                        <div style={{ fontWeight: 800, color: '#14532d', fontSize: '14px', marginTop: '4px' }}>
                          من <strong>{previewModalReq.scheduledStart || '—'}</strong> إلى <strong>{previewModalReq.scheduledEnd || '—'}</strong>
                        </div>
                        <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px' }}>
                          ساعات الوردية: {previewModalReq.scheduledHours || 8} ساعات
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>⏱️ البصمة الفعلية المسجلة:</span>
                        <div style={{ fontWeight: 800, color: '#14532d', fontSize: '14px', marginTop: '4px' }}>
                          دخول: <strong>{previewModalReq.timeIn || previewModalReq.actualIn || '—'}</strong> ⬅️ خروج: <strong>{previewModalReq.timeOut || previewModalReq.actualOut || '—'}</strong>
                        </div>
                        <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px' }}>
                          إجمالي الحضور الفعلي: {previewModalReq.actualWorkedHours || previewModalReq.netHours || '—'} ساعة
                        </div>
                      </div>

                      {(previewModalReq.earlyOtHours > 0 || previewModalReq.earlyArrivalMinutes > 0) && (
                        <div style={{ background: '#eff6ff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                          <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 700 }}>🌅 إضافي الحضور المبكر:</span>
                          <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: '16px', marginTop: '4px' }}>
                            +{previewModalReq.earlyOtHours || ((previewModalReq.earlyArrivalMinutes || 0) / 60).toFixed(2)} ساعة
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#1e40af', marginTop: '2px' }}>
                            تبكير {previewModalReq.earlyArrivalMinutes || 0} دقيقة قبل الوردية
                          </div>
                        </div>
                      )}

                      {(previewModalReq.lateOtHours > 0 || previewModalReq.lateDepartureMinutes > 0) && (
                        <div style={{ background: '#eff6ff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                          <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 700 }}>🌆 إضافي الانصراف المتأخر:</span>
                          <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: '16px', marginTop: '4px' }}>
                            +{previewModalReq.lateOtHours || ((previewModalReq.lateDepartureMinutes || 0) / 60).toFixed(2)} ساعة
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#1e40af', marginTop: '2px' }}>
                            تأخير {previewModalReq.lateDepartureMinutes || 0} دقيقة بعد الوردية
                          </div>
                        </div>
                      )}

                      <div style={{ background: '#dcfce7', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid #16a34a' }}>
                        <span style={{ fontSize: '12px', color: '#166534', fontWeight: 800 }}>⭐ إجمالي الساعات الإضافية:</span>
                        <div style={{ fontWeight: 900, color: '#15803d', fontSize: '18px', marginTop: '4px' }}>
                          +{previewModalReq.overtimeHours || previewModalReq.hours || 0} ساعة
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '2px' }}>
                          معتمدة على الوردية وملف الموظف
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── EXPENSE / INVOICE DETAILS (فواتير ومصروفات الفروع) ── */}
                {isExpense && (
                  <div style={{ background: '#fefce8', padding: '18px', borderRadius: '14px', border: '1.5px solid #fde047', boxShadow: '0 2px 10px rgba(161, 98, 7, 0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                      <h4 style={{ margin: 0, color: '#854d0e', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                        <span>📑</span>
                        <span>بيانات الفاتورة والمصروف المالي المطلوب اعتماده:</span>
                      </h4>
                      <span style={{
                        background: previewModalReq.status === 'approved' ? '#dcfce7' : previewModalReq.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                        color: previewModalReq.status === 'approved' ? '#15803d' : previewModalReq.status === 'rejected' ? '#b91c1c' : '#b45309',
                        border: '1px solid currentColor',
                        padding: '3px 12px',
                        borderRadius: '8px',
                        fontSize: '12.5px',
                        fontWeight: 800
                      }}>
                        {previewModalReq.status === 'approved' ? '🟢 معتمد ومسجل بالدفاتر' : previewModalReq.status === 'rejected' ? '🔴 تم رفض المصروف' : '⏳ بانتظار موافقة الإدارة العليا'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                        <span style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600 }}>💰 قيمة المبلغ:</span>
                        <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '19px', marginTop: '3px' }}>
                          {parseFloat(previewModalReq.amount || 0).toLocaleString()} ج.م
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                        <span style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600 }}>🏷️ بند الصرف / التصنيف:</span>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '14.5px', marginTop: '3px' }}>
                          {previewModalReq.category || previewModalReq.typeLabel || 'cash order'}
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                        <span style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600 }}>🏢 الفرع التابع له:</span>
                        <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '14px', marginTop: '3px' }}>
                          {previewModalReq.branchName || previewModalReq.branch || branchObj?.name || '—'}
                        </div>
                      </div>

                      <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #fef08a' }}>
                        <span style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600 }}>📅 تاريخ الفاتورة / القيد:</span>
                        <div style={{ fontWeight: 800, color: '#334155', fontSize: '14px', marginTop: '3px' }}>
                          {previewModalReq.date || (previewModalReq.createdAt ? previewModalReq.createdAt.slice(0, 10) : '—')}
                        </div>
                      </div>
                    </div>

                    {(previewModalReq.driveWebViewLink || previewModalReq.driveFileUrl || previewModalReq.driveLink || previewModalReq.googleDriveUrl) && (
                      <div style={{ marginTop: '10px', background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: 700 }}>
                          ☁️ ملف الفاتورة مرفوع على Google Drive:
                        </span>
                        <a
                          href={previewModalReq.driveWebViewLink || previewModalReq.driveFileUrl || previewModalReq.driveLink || previewModalReq.googleDriveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#2563eb',
                            color: '#ffffff',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}
                        >
                          📂 فتح الملف على Google Drive ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Reason, Notes and Description Card */}
                <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--primary-dark)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📝 شرح الطلب والسبب المذكور:
                  </h4>
                  <div style={{ lineHeight: 1.7, color: 'var(--text)', background: 'var(--surface-muted)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                    {previewModalReq.reason || previewModalReq.details || previewModalReq.notes || previewModalReq.subject || 'لا يوجد شرح أو سبب إضافي مذكور'}
                  </div>

                  {(() => {
                    const attData = previewModalReq.attachmentData || previewModalReq.photoUrl || previewModalReq.drivePhotoUrl || previewModalReq.videoUrl || previewModalReq.attachment || previewModalReq.fileData || previewModalReq.fileUrl || previewModalReq.mediaUrl;
                    const attName = previewModalReq.attachmentName || previewModalReq.fileName || (typeof attData === 'string' && attData.startsWith('data:video/') ? 'فيديو توثيق المخالفة.mp4' : typeof attData === 'string' && attData.startsWith('data:application/pdf') ? 'مستند_التحقيق.pdf' : 'مستند / مرفق رسمي');
                    const attType = previewModalReq.attachmentType || (
                      (typeof attData === 'string' && (attData.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(attData) || previewModalReq.photoUrl || previewModalReq.drivePhotoUrl)) ? 'image' :
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
                              onClick={() => setLightboxPhoto({
                                url: attData,
                                title: attName || `مرفق الطلب - ${previewModalReq.employeeName || ''}`,
                                compareUrl: null
                              })}
                              title="انقر لفتح الصورة بالحجم الكامل داخل التطبيق"
                            />
                            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '6px' }}>🔍 انقر على الصورة لفتحها بالحجم الكامل</div>
                            {previewModalReq.drivePhotoUrl && (
                              <div style={{ marginTop: '8px' }}>
                                <a
                                  href={previewModalReq.drivePhotoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="btn btn-ghost"
                                  style={{ color: '#38bdf8', fontSize: '12px', textDecoration: 'none', fontWeight: 800, background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  ☁️ فتح الصورة في Google Drive ↗
                                </a>
                              </div>
                            )}
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

              {/* Modal Actions Fixed Sticky Footer */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1.5px solid var(--border)',
                  background: 'var(--surface, #ffffff)',
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.03)'
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                  onClick={() => setPreviewModalReq(null)}
                >
                  ✕ إغلاق النافذة
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
                ) : (() => {
                  const isDecided = previewModalReq.status === 'approved' ||
                    previewModalReq.adminApproved ||
                    previewModalReq.status === 'paid' ||
                    previewModalReq.status === 'partial' ||
                    previewModalReq.status === 'rejected' ||
                    previewModalReq.status === 'cancelled';

                  if (isDecided) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {(previewModalReq.status === 'approved' || previewModalReq.adminApproved) ? (
                          <span className="approval-status-badge approved" style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 'bold' }}>
                            🟢 هذا الطلب معتمد وموافق عليه
                          </span>
                        ) : previewModalReq.status === 'rejected' ? (
                          <span className="approval-status-badge rejected" style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 'bold' }}>
                            🔴 هذا الطلب تم رفضه
                          </span>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                          : isExpense
                          ? '✓ موافقة واعتماد الفاتورة / المصروف'
                          : '✓ اعتماد وموافقة الطلب فوراً'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );

        if (typeof document !== 'undefined' && document.body) {
          return createPortal(modalJSX, document.body);
        }
        return modalJSX;
      })()}

      {/* ── HIGH-FIDELITY IN-APP LIGHTBOX & COMPARISON MODAL (Zero White Windows) ── */}
      {lightboxPhoto && (
        <div
          className="lightbox-overlay"
          onClick={() => { setLightboxPhoto(null); setPhotoZoom(1); setPhotoRotation(0); setShowSideBySide(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 15, 29, 0.92)',
            backdropFilter: 'blur(10px)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {/* Header Bar */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '920px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              color: '#fff',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>📸</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                  {lightboxPhoto.title || 'معاينة الصورة بالحجم الكامل'}
                </h4>
                {lightboxPhoto.compareUrl && (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {showSideBySide ? 'وضع المقارنة جنباً إلى جنب نشط' : 'يتوفر مقارنة مع الصورة الرسمية'}
                  </span>
                )}
              </div>
            </div>

            {/* Toolbar Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lightboxPhoto.compareUrl && (
                <button
                  type="button"
                  onClick={() => setShowSideBySide(!showSideBySide)}
                  className="btn"
                  style={{
                    background: showSideBySide ? '#0d9488' : 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.2)',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ⚖️ {showSideBySide ? 'إلغاء المقارنة' : 'مقارنة الصورتين'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPhotoZoom(z => Math.min(3, z + 0.25))}
                className="btn"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
                title="تكبير"
              >
                🔍+
              </button>
              <button
                type="button"
                onClick={() => setPhotoZoom(z => Math.max(0.5, z - 0.25))}
                className="btn"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
                title="تصغير"
              >
                🔍-
              </button>
              <button
                type="button"
                onClick={() => setPhotoRotation(r => (r + 90) % 360)}
                className="btn"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
                title="تدوير الصورة"
              >
                🔄
              </button>
              <button
                type="button"
                onClick={() => { setLightboxPhoto(null); setPhotoZoom(1); setPhotoRotation(0); setShowSideBySide(false); }}
                className="btn"
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
              >
                ✕ إغلاق
              </button>
            </div>
          </div>

          {/* Photo Container */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: showSideBySide ? '1100px' : '850px',
              maxHeight: '80vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              overflow: 'auto',
              padding: '10px'
            }}
          >
            {showSideBySide && lightboxPhoto.compareUrl ? (
              <>
                <div style={{ flex: 1, textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>
                    {lightboxPhoto.compareTitle || 'الصورة المسجلة الرسمية'}
                  </div>
                  <img
                    src={lightboxPhoto.compareUrl}
                    alt="الصورة المقارنة"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '65vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      transform: `scale(${photoZoom}) rotate(${photoRotation}deg)`,
                      transition: 'transform 0.2s ease'
                    }}
                  />
                </div>
                <div style={{ flex: 1, textAlign: 'center', background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '12px', border: '2px solid #0d9488' }}>
                  <div style={{ color: '#2dd4bf', fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>
                    📸 الصورة الحية / المطلوب اعتمادها
                  </div>
                  <img
                    src={lightboxPhoto.url}
                    alt="الصورة الحالية"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '65vh',
                      objectFit: 'contain',
                      borderRadius: '8px',
                      transform: `scale(${photoZoom}) rotate(${photoRotation}deg)`,
                      transition: 'transform 0.2s ease'
                    }}
                  />
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.title || 'صورة'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '75vh',
                    objectFit: 'contain',
                    borderRadius: '12px',
                    boxShadow: '0 10px 35px rgba(0,0,0,0.6)',
                    border: '2px solid rgba(255,255,255,0.15)',
                    transform: `scale(${photoZoom}) rotate(${photoRotation}deg)`,
                    transition: 'transform 0.2s ease'
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
