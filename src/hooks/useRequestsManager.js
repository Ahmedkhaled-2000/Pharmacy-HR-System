import { useCallback } from 'react';
import {
  createRequestDecisionNotification
} from '../utils/notificationEngine';
import { applyApprovedPermissionsToShifts } from '../utils/latePenaltyEngine';
import { applyShiftSwapToRosters } from '../utils/rosterEngine';
import { normalizeSchedule } from '../components/roster/RosterModule';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useRequestsManager() {
  const { state, setState, saveState } = useData();
  const { showToast, executeWithOwnerGuard } = useUI();

  const handleApproveRequest = useCallback(async (requestId, role = 'admin') => {
    if (!state) return;
    const currentRequests = state?.requests || [];
    const target = currentRequests.find((r) => r.id === requestId);
    if (!target) return;

    const performApprove = async () => {
      let isBranchApproved = target.branchApproved;
      let isAdminApproved = target.adminApproved;

      if (role === 'admin') {
        isAdminApproved = true;
        isBranchApproved = true;
      } else if (role === 'branch') {
        isBranchApproved = true;
      }

      const isFullyApproved = role === 'admin' || (isBranchApproved && isAdminApproved);

      const updatedRequests = currentRequests.map((r) => {
        if (r.id === requestId) {
          return {
            ...r,
            branchApproved: isBranchApproved,
            adminApproved: isAdminApproved,
            status: isFullyApproved ? 'approved' : 'pending_admin',
            approvedAt: isFullyApproved ? new Date().toISOString() : r.approvedAt
          };
        }
        return r;
      });

      let updatedAdjs = [...(state.adjustments || [])];
      let updatedLoans = [...(state.loans || [])];
      let updatedRosters = [...(state.rosters || [])];
      let updatedSwaps = [...(state.shiftSwaps || [])];
      let updatedEmps = [...(state.employees || [])];
      let updatedShifts = [...(state.shifts || [])];
      let updatedLeaveRequests = [...(state.leaveRequests || [])];
      let updatedLeaveHistory = [...(state.leaveHistory || [])];
      let updatedResignations = [...(state.resignationRequests || [])];
      let updatedLateIncidents = [...(state.lateIncidents || [])];

      if (isFullyApproved) {
        // 0. Overtime Request Approval
        if (target.type === 'overtime') {
          const overtimeHrs = parseFloat(target.hours) || 0;
          updatedShifts = updatedShifts.map((s) => {
            if (s.id === target.shiftId || (String(s.employeeId) === String(target.employeeId) && s.date === target.date)) {
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

        // 1. Leave Requests Integration
        if (['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave'].includes(target.type)) {
          const approvedLeaveObj = {
            id: target.id || `leave_${Date.now()}`,
            originalRequestId: target.id,
            employeeId: target.employeeId,
            employeeCode: target.employeeCode,
            employeeName: target.employeeName,
            leaveType: target.leaveType || (target.type === 'annual_leave' ? 'annual' : target.type === 'sick_leave' ? 'sick' : target.type === 'unpaid_leave' ? 'unpaid' : 'annual'),
            startDate: target.startDate || target.date,
            endDate: target.endDate || target.startDate || target.date,
            daysCount: parseInt(target.daysCount || target.days || 1, 10),
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            reason: target.reason || target.details || '',
            approvedAt: new Date().toISOString()
          };

          const lIdx = updatedLeaveRequests.findIndex(
            (lr) => lr.id === target.id || (String(lr.employeeId) === String(target.employeeId) && lr.startDate === target.startDate)
          );
          if (lIdx >= 0) {
            updatedLeaveRequests[lIdx] = { ...updatedLeaveRequests[lIdx], ...approvedLeaveObj };
          } else {
            updatedLeaveRequests.unshift(approvedLeaveObj);
          }

          const hIdx = updatedLeaveHistory.findIndex(
            (lh) => lh.id === approvedLeaveObj.id || (String(lh.employeeId) === String(approvedLeaveObj.employeeId) && lh.startDate === approvedLeaveObj.startDate)
          );
          if (hIdx >= 0) {
            updatedLeaveHistory[hIdx] = approvedLeaveObj;
          } else {
            updatedLeaveHistory.unshift(approvedLeaveObj);
          }
        }

        // 2. Penalty / Early Exit / Disciplinary Violation Integration
        if (target.type === 'penalty' || target.type === 'early_exit' || target.type === 'disciplinary_penalty' || target.type === 'violation' || String(target.id || '').startsWith('disc_')) {
          const emp = (state.employees || []).find((e) => String(e.id) === String(target.employeeId));
          let amount = 0;
          if (target.impactType === 'deduction_days' || target.deductionDays) {
            const days = parseFloat(target.impactVal || target.deductionDays || target.penaltyDays) || 1;
            const salary = emp ? parseFloat(emp.salary) || 0 : 0;
            const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
            const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
            const dailyRate = target.dailyRate ? parseFloat(target.dailyRate) : (workDays > 0 ? (salary * workHours) / workDays : salary);
            amount = Math.round(dailyRate * days * 100) / 100;
          } else if (target.impactType === 'fixed_amount' || target.deductionFixedAmount) {
            amount = parseFloat(target.impactVal || target.deductionFixedAmount) || 0;
          } else if (target.amount || target.penaltyAmount) {
            amount = parseFloat(target.amount || target.penaltyAmount) || 0;
          }

          if (amount > 0) {
            const ruleTitle = target.ruleTitle || target.violationTitle || target.reason || target.details || 'مخالفة لائحية';
            const actionName = target.actionTitle || target.penaltyAction || 'خصم من الراتب';
            const penaltyDesc = `خصم جزاء تأديبي لائحى: ${ruleTitle} (${actionName} - ${amount} ج.م)`;

            const existingAdj = updatedAdjs.some(a => a.requestId === target.id || (a.id && a.id === `adj_disc_${target.id}`));
            if (!existingAdj) {
              updatedAdjs.push({
                id: `adj_pen_${target.id || Date.now()}`,
                requestId: target.id,
                employeeId: target.employeeId,
                employeeName: target.employeeName,
                type: 'deduction',
                subType: 'disciplinary_penalty',
                amount,
                description: penaltyDesc,
                notes: penaltyDesc,
                reason: penaltyDesc,
                date: target.date || target.startDate || new Date().toISOString().slice(0, 10),
                createdAt: new Date().toISOString()
              });
            }
          }

          if (target.actionTitle === 'إنهاء خدمة / فصل تأديبي' || target.penaltyAction === 'إنهاء خدمة / فصل تأديبي') {
            updatedEmps = updatedEmps.map(e => {
              if (String(e.id) === String(target.employeeId)) {
                return {
                  ...e,
                  status: 'تم الاستقالة',
                  is_active: false,
                  isTerminated: true,
                  terminationReason: target.reason || target.details || 'فصل تأديبي',
                  terminatedAt: new Date().toISOString(),
                  biometricSuspended: true,
                  suspensionReason: 'فصل تأديبي معتمد من الإدارة العليا'
                };
              }
              return e;
            });
          } else if (target.actionTitle === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' || target.penaltyAction === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق') {
            updatedEmps = updatedEmps.map(e => {
              if (String(e.id) === String(target.employeeId)) {
                return {
                  ...e,
                  biometricSuspended: true,
                  suspensionReason: target.reason || target.details || 'إيقاف مؤقت معتمد',
                  suspendedAt: new Date().toISOString(),
                  suspendedBy: 'الإدارة العليا'
                };
              }
              return e;
            });
          }
        }

        // 3. Bonus Integration
        if (target.type === 'bonus') {
          updatedAdjs.push({
            id: `adj_${Date.now()}`,
            employeeId: target.employeeId,
            type: 'bonus',
            amount: parseFloat(target.amount) || 0,
            description: target.details || target.reason || 'مكافأة معتمدة من الإدارة العليا',
            notes: target.details || target.reason || 'مكافأة معتمدة من الإدارة العليا',
            reason: target.reason || target.details || 'مكافأة معتمدة من الإدارة العليا',
            date: target.date || target.startDate || new Date().toISOString().slice(0, 10),
            createdAt: new Date().toISOString()
          });
        }

        // 4. Loans & Meds Integration
        if (target.type === 'loan' || target.type === 'advance' || target.type === 'meds' || target.type === 'credit_medicine') {
          const totalAmount = parseFloat(target.amount || target.totalAmount) || 0;
          const monthsCount = parseInt(target.monthsCount || target.installmentsCount || target.installments, 10) || 1;
          const monthlyInstallment = parseFloat(target.monthlyDeduction || target.installmentAmount) || (monthsCount > 1 ? Math.ceil(totalAmount / monthsCount) : totalAmount);

          const isMeds = target.type === 'meds' || target.type === 'credit_medicine';
          const isInstallment = target.loanType === 'installment' || target.loanType === 'installments' || monthsCount > 1;

          const approvedLoanObj = {
            id: target.id,
            employeeId: target.employeeId,
            employeeCode: target.employeeCode,
            employeeName: target.employeeName,
            type: isMeds ? 'meds' : 'loan',
            loanType: isInstallment ? 'installment' : 'monthly',
            amount: totalAmount,
            totalAmount: totalAmount,
            paidAmount: parseFloat(target.paidAmount) || 0,
            monthlyDeduction: monthlyInstallment,
            installmentAmount: monthlyInstallment,
            installmentsCount: monthsCount,
            monthsCount: monthsCount,
            medicines: target.medicines || target.medsItems || target.items || [],
            medsItems: target.medicines || target.medsItems || target.items || [],
            notes: target.reason || target.details || target.adminNotes || (isMeds ? 'مشتريات أدوية آجل معتمدة' : 'سلفة مالية معتمدة'),
            date: target.date || (target.createdAt ? target.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
            status: 'approved',
            adminApproved: true,
            approvedAt: new Date().toISOString()
          };

          const lIdx = updatedLoans.findIndex((l) => String(l.id) === String(target.id));
          if (lIdx >= 0) {
            updatedLoans[lIdx] = { ...updatedLoans[lIdx], ...approvedLoanObj };
          } else {
            updatedLoans.unshift(approvedLoanObj);
          }
        }

        // 5. Shift Swaps Integration
        if (target.type === 'swap' || target.type === 'shift_swap' || target.type === 'shift_edit') {
          updatedSwaps = updatedSwaps.map((s) =>
            s.id === target.id ? { ...s, status: 'approved', adminApproved: true, branchApproved: true, approvedAt: new Date().toISOString() } : s
          );
          updatedRosters = applyShiftSwapToRosters(target, updatedRosters, state.employees || []);
        }

        // 6. Approved Permissions Integration
        if (target.type === 'permission' || target.type === 'إذن' || target.type === 'late_permission' || target.type === 'early_leave') {
          updatedShifts = applyApprovedPermissionsToShifts([target], updatedShifts, state.bylaws, updatedEmps);
        }

        // 7. Roster Request Integration
        if (target.type === 'roster_update' || target.type === 'roster_edit' || target.type === 'roster_edit_request') {
          const empObj = (state.employees || []).find(e => String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode)));
          const targetBranch = target.branchId || empObj?.branchesDetails?.[0]?.branchId || empObj?.branchId || null;
          const normalizedSch = normalizeSchedule(target.schedule || target.newSchedule);

          const activeRosterObj = {
            id: target.id || `roster_${Date.now()}`,
            employeeId: target.employeeId || empObj?.id,
            employeeCode: target.employeeCode || empObj?.code,
            branchId: targetBranch,
            month: target.month || new Date().toISOString().slice(0, 7),
            fromDate: target.fromDate,
            toDate: target.toDate,
            schedule: normalizedSch,
            status: 'approved',
            adminApproved: true,
            approvedAt: new Date().toISOString()
          };

          const existingIdx = updatedRosters.findIndex(
            (ros) => (String(ros.employeeId) === String(target.employeeId) || (empObj?.code && String(ros.employeeCode) === String(empObj.code))) &&
                     (ros.month === target.month || !target.month || !ros.month) &&
                     (String(ros.branchId || '') === String(targetBranch || '') || (!ros.branchId && !targetBranch))
          );

          if (existingIdx >= 0) {
            updatedRosters = updatedRosters.map((ros, idx) => idx === existingIdx ? activeRosterObj : ros);
          } else {
            updatedRosters = [activeRosterObj, ...updatedRosters];
          }
        }

        // 7.5. Biometric Verification (Photo Attendance) Approval Integration
        if (target.type === 'biometric_verification' || target.type === 'تأكيد بصمة الوجه' || target.type === 'تأكيد بصمة اليد') {
          const action = target.targetAction;
          const empId = target.employeeId;
          const reqDate = target.date || new Date().toISOString().slice(0, 10);
          const reqTime = target.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
          const approverTitle = role === 'admin' ? 'الإدارة العليا' : 'مدير الفرع';

          if (action === 'shift_start') {
            const hasShiftToday = updatedShifts.some(s => String(s.employeeId) === String(empId) && s.date === reqDate && !s.endTime);
            if (!hasShiftToday) {
              const newShift = {
                id: `shift_${Date.now()}`,
                employeeId: empId,
                date: reqDate,
                startTime: reqTime,
                branchId: target.branchId || null,
                source: 'photo_attendance_approved',
                approvedBy: approverTitle,
                photoUrl: target.photoUrl || null,
                drivePhotoUrl: target.drivePhotoUrl || null,
                note: `✅ تم تسجيل الحضور بالصورة (معتمد من ${approverTitle})`
              };
              updatedShifts.unshift(newShift);
            }
          } else if (action === 'shift_end') {
            const openShiftIdx = updatedShifts.findIndex(s => String(s.employeeId) === String(empId) && (!s.endTime || s.endTime === '—'));
            if (openShiftIdx >= 0) {
              updatedShifts[openShiftIdx] = {
                ...updatedShifts[openShiftIdx],
                endTime: reqTime,
                photoUrl: target.photoUrl || updatedShifts[openShiftIdx].photoUrl,
                drivePhotoUrl: target.drivePhotoUrl || updatedShifts[openShiftIdx].drivePhotoUrl,
                note: (updatedShifts[openShiftIdx].note || '') + ` | ✅ انصراف بالصورة معتمد (${approverTitle})`
              };
            }
          }
        }

        // 8. Resignation Request Integration
        if (target.type === 'resignation') {
          updatedResignations = updatedResignations.map((r) => {
            if (String(r.id) === String(target.id)) {
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

          updatedEmps = updatedEmps.map((e) => {
            if (String(e.id) === String(target.employeeId)) {
              return {
                ...e,
                status: 'تم الاستقالة',
                is_active: false,
                isTerminated: true,
                terminationDate: target.date || target.lastWorkingDate || new Date().toISOString().slice(0, 10),
                terminationReason: target.reason || target.details || 'استقالة معتمدة'
              };
            }
            return e;
          });
        }

        // 9. Objection Approval Integration (Cancel Penalty)
        if (target.type === 'penalty_objection' || target.penaltyId || target.sourceType === 'late_incident') {
          const targetPenId = target.penaltyId || String(target.id).replace(/^obj_(inc|adj|req)_/, '');
          const cleanPenId = String(targetPenId).replace(/^req_/, '');

          updatedLateIncidents = updatedLateIncidents.map((inc) => {
            if (String(inc.id) === String(targetPenId) || String(inc.id) === cleanPenId || (String(inc.employeeId) === String(target.employeeId) && inc.date === target.date)) {
              return {
                ...inc,
                status: 'cancelled',
                actionType: 'grace',
                actionLabel: 'سماح (تم قبول التظلم وإلغاء الخصم)',
                penaltyAmount: 0,
                deductionMinutes: 0,
                isCancelled: true,
                cancellationReason: 'تم قبول تظلم الموظف وإلغاء الجزاء'
              };
            }
            return inc;
          });

          updatedAdjs = updatedAdjs.filter((a) => {
            const aIdStr = String(a.id);
            if (aIdStr === String(targetPenId) || aIdStr === cleanPenId || aIdStr === `adj_${targetPenId}` || aIdStr === `adj_disc_${targetPenId}` || a.requestId === targetPenId) {
              return false;
            }
            return true;
          });
        }
      }

      const decisionNotif = createRequestDecisionNotification({
        requestId: target.id,
        employeeId: target.employeeId,
        type: target.type,
        action: 'approved',
        approverRole: role,
        details: target.details || target.reason || (target.amount ? `${target.amount} ج.م` : '')
      });

      const updatedNotifications = [
        decisionNotif,
        ...(state.notifications || []).map(n => String(n.requestId) === String(requestId) ? { ...n, read: true } : n)
      ];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        adjustments: updatedAdjs,
        loans: updatedLoans,
        rosters: updatedRosters,
        shiftSwaps: updatedSwaps,
        employees: updatedEmps,
        shifts: updatedShifts,
        leaveRequests: updatedLeaveRequests,
        leaveHistory: updatedLeaveHistory,
        resignationRequests: updatedResignations,
        lateIncidents: updatedLateIncidents,
        notifications: updatedNotifications
      };

      setState(updatedState);
      showToast('✅ تمت الموافقة على الطلب بنجاح');
      if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error:', err));
      }
    };

    if (role === 'admin') {
      const locks = state.orgSettings?.ownerModificationLocks || {};

      if (locks.lockApproveRequests) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveRequests',
          actionTitle: `اعتماد طلب (${target.employeeName || target.employeeId})`,
          actionDetails: `نوع الطلب: ${target.typeLabel || target.type || 'طلب عام'}`,
          onExecute: performApprove
        });
        return;
      }

      const isLeave = ['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave'].includes(target.type);
      const isLoan = ['loan', 'advance', 'meds', 'credit_medicine'].includes(target.type);
      const isPermission = ['permission', 'permission_request'].includes(target.type);
      const isDisc = target.type === 'disciplinary_penalty' || target.type === 'violation' || target.type === 'penalty' || String(target.id || '').startsWith('disc_');
      const isSwap = ['swap', 'shift_swap', 'shift_edit'].includes(target.type);
      const isRoster = ['roster_update', 'roster_edit', 'roster_edit_request'].includes(target.type);
      const isPunch = ['punch_correction', 'manual_punch', 'attendance_punch', 'تأكيد بصمة الوجه', 'تأكيد بصمة اليد', 'biometric_verification'].includes(target.type);
      const isResignation = target.type === 'resignation';
      const isBonus = target.type === 'bonus';
      const isComplaint = ['complaint', 'eval_edit_request', 'penalty_objection', 'objection'].includes(target.type);

      if (isLeave && locks.lockApproveLeaves) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveLeaves',
          actionTitle: `اعتماد طلب إجازة (${target.employeeName || target.employeeId})`,
          actionDetails: `المدة: ${target.daysCount || target.days || 1} يوم`,
          onExecute: performApprove
        });
        return;
      }

      if (isLoan && locks.lockApproveLoans) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveLoans',
          actionTitle: `اعتماد طلب سلفة / أدوية آجل (${target.employeeName || target.employeeId})`,
          actionDetails: `المبلغ: ${target.amount || target.totalAmount} ج.م`,
          onExecute: performApprove
        });
        return;
      }

      if (isPermission && locks.lockApprovePermissions) {
        executeWithOwnerGuard({
          lockKey: 'lockApprovePermissions',
          actionTitle: `اعتماد إذن استئذان (${target.employeeName || target.employeeId})`,
          actionDetails: `تاريخ الإذن: ${target.date || ''} - الساعات: ${target.hours || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isDisc && locks.lockApproveDisciplinaryPenalties) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveDisciplinaryPenalties',
          actionTitle: `اعتماد جزاء تأديبي لائحى (${target.employeeName || target.employeeId})`,
          actionDetails: `المخالفة: ${target.ruleTitle || target.violationTitle || 'مخالفة لائحية'}`,
          onExecute: performApprove
        });
        return;
      }

      if (isSwap && locks.lockApproveShiftSwaps) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveShiftSwaps',
          actionTitle: `اعتماد تبديل وردية (${target.employeeName || target.employeeId})`,
          actionDetails: `التاريخ: ${target.date || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isRoster && locks.lockApproveRosters) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveRosters',
          actionTitle: `اعتماد تعديل جدول شهري (${target.employeeName || target.employeeId})`,
          actionDetails: `الشهر: ${target.month || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isPunch && (locks.lockApproveManualPunches || (target.type === 'biometric_verification' && locks.lockApproveBiometricVerification))) {
        executeWithOwnerGuard({
          lockKey: (target.type === 'biometric_verification' && locks.lockApproveBiometricVerification) ? 'lockApproveBiometricVerification' : 'lockApproveManualPunches',
          actionTitle: `اعتماد تسجيل/تصحيح بصمة (${target.employeeName || target.employeeId})`,
          actionDetails: `التاريخ: ${target.date || ''} - الوقت: ${target.time || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isResignation && locks.lockApproveResignations) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveResignations',
          actionTitle: `اعتماد طلب استقالة (${target.employeeName || target.employeeId})`,
          actionDetails: `تاريخ السريان: ${target.date || target.lastWorkingDate || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isBonus && (locks.lockApproveBonuses || locks.lockDirectBonusDeduction)) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveBonuses',
          actionTitle: `اعتماد مكافأة مالية (${target.employeeName || target.employeeId})`,
          actionDetails: `المبلغ: ${target.amount || 0} ج.م`,
          onExecute: performApprove
        });
        return;
      }

      if (isComplaint && locks.lockApproveComplaints) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveComplaints',
          actionTitle: `اعتماد شكوى / تظلم (${target.employeeName || target.employeeId})`,
          actionDetails: `الموضوع: ${target.subject || target.title || 'تظلم'}`,
          onExecute: performApprove
        });
        return;
      }
    }

    performApprove();
  }, [state, setState, saveState, showToast, executeWithOwnerGuard]);

  const handleRejectRequest = useCallback(async (requestId, role = 'admin') => {
    if (!state) return;
    const performReject = async () => {
      let targetReq = null;
      const updatedRequests = (state?.requests || []).map((r) => {
        if (r.id === requestId) {
          targetReq = {
            ...r,
            status: 'rejected',
            adminApproved: false,
            rejectedAt: new Date().toISOString()
          };
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
              adminApproved: false,
              note: `ساعات الوردية الأساسية (${regHours} س) — تم استبعاد الإضافي (${targetReq.hours} س) بواسطة الإدارة`
            };
          }
          return s;
        });
      }

      const updatedSwaps = (state.shiftSwaps || []).map((s) =>
        s.id === requestId ? { ...s, status: 'rejected', adminApproved: false } : s
      );

      const updatedLeaveRequests = (state.leaveRequests || []).map((lr) =>
        lr.id === requestId || (targetReq && String(lr.employeeId) === String(targetReq.employeeId) && lr.startDate === targetReq.startDate)
          ? { ...lr, status: 'rejected', adminApproved: false }
          : lr
      );

      const updatedLoans = (state.loans || []).map((l) =>
        l.id === requestId || l.requestId === requestId ? { ...l, status: 'rejected', adminApproved: false } : l
      );

      const updatedResignations = (state.resignationRequests || []).map((r) =>
        r.id === requestId ? { ...r, status: 'rejected', adminStatus: 'rejected', adminApproved: false } : r
      );

      const decisionNotif = createRequestDecisionNotification({
        requestId: targetReq?.id || requestId,
        employeeId: targetReq?.employeeId,
        type: targetReq?.type,
        action: 'rejected',
        approverRole: role,
        details: targetReq?.reason || targetReq?.details || ''
      });

      const updatedNotifications = [
        decisionNotif,
        ...(state.notifications || []).map((n) =>
          String(n.requestId) === String(requestId) ? { ...n, read: true } : n
        )
      ];

      const updatedState = {
        ...state,
        requests: updatedRequests,
        shifts: updatedShifts,
        leaveRequests: updatedLeaveRequests,
        loans: updatedLoans,
        shiftSwaps: updatedSwaps,
        resignationRequests: updatedResignations,
        notifications: updatedNotifications
      };
      setState(updatedState);
      showToast('❌ تم رفض الطلب وتحديث السجلات بنجاح');
      if (saveState) {
        saveState(updatedState).catch(err => console.error('Background save error:', err));
      }
    };

    if (role === 'admin' && state.orgSettings?.ownerModificationLocks?.lockRejectRequests) {
      const targetReq = (state.requests || []).find((r) => r.id === requestId);
      executeWithOwnerGuard({
        lockKey: 'lockRejectRequests',
        actionTitle: `رفض الطلب (${targetReq?.employeeName || targetReq?.employeeId || ''})`,
        actionDetails: `نوع الطلب: ${targetReq?.typeLabel || targetReq?.type || 'طلب عام'}`,
        onExecute: performReject
      });
      return;
    }

    performReject();
  }, [state, setState, saveState, showToast, executeWithOwnerGuard]);

  const handleSendEarlyExitEmail = async (reqId) => {
    try {
      const req = (state.requests || []).find((r) => r.id === reqId);
      const emp = req ? (state.employees || []).find((e) => e.id === req.employeeId) : null;
      showToast(`📧 تم إرسال تنبيه الانصراف المبكر ${emp ? `للموظف (${emp.name})` : ''}`);
    } catch {
      showToast('❌ حدث خطأ أثناء إرسال التنبيه');
    }
  };

  const handleWaiveEarlyExit = async (reqId) => {
    try {
      const updatedRequests = (state.requests || []).map((r) =>
        r.id === reqId ? { ...r, earlyExitWaived: true, status: 'approved', adminApproved: true, branchApproved: true } : r
      );
      const updatedState = { ...state, requests: updatedRequests };
      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم التجاوز عن الانصراف المبكر واعتماد الطلب');
    } catch {
      showToast('❌ حدث خطأ أثناء التجاوز عن الانصراف المبكر');
    }
  };

  const handleSaveBylaws = async (bylawsData) => {
    const performSave = async () => {
      const updatedState = { ...state, bylaws: bylawsData };
      setState(updatedState);
      await saveState(updatedState);
      showToast('📜 تم حفظ لائحة الجزاءات بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditSystemPermissions',
      actionTitle: 'تعديل لائحة الجزاءات والانضباط',
      actionDetails: 'تحديث قواعد ونصوص اللائحة الداخلية',
      onExecute: performSave
    });
  };

  const handleSaveApprovalRules = async (rulesData) => {
    const performSave = async () => {
      const updatedState = {
        ...state,
        approvalRules: rulesData,
        _approvalRulesUpdatedAt: new Date().toISOString()
      };
      setState(updatedState);
      await saveState(updatedState);
      showToast('⚙️ تم حفظ قواعد الموافقة والاعتماد');
    };

    executeWithOwnerGuard({
      lockKey: 'lockEditSystemPermissions',
      actionTitle: 'تعديل قواعد الموافقة المزدوجة',
      actionDetails: 'تحديث مصفوفة تسلسل الاعتمادات والموافقات',
      onExecute: performSave
    });
  };

  return {
    handleApproveRequest,
    handleRejectRequest,
    handleSendEarlyExitEmail,
    handleWaiveEarlyExit,
    handleSaveBylaws,
    handleSaveApprovalRules
  };
}
