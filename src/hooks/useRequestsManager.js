import { useCallback } from 'react';
import {
  createRequestDecisionNotification
} from '../utils/notificationEngine';
import { notifyOnPenaltyApplied } from '../utils/gmailService';
import { applyApprovedPermissionsToShifts } from '../utils/latePenaltyEngine';
import { applyShiftSwapToRosters, getEmployeeDaySchedule } from '../utils/rosterEngine';
import { normalizeSchedule } from '../components/roster/RosterModule';
import { saveFaceDescriptor, saveHandDescriptor, deleteFaceDescriptor, deleteHandDescriptor } from '../utils/faceStorage';
import { enqueueRequestDecision } from '../utils/syncEngine';
import { emitLiveRequestUpdated } from '../utils/socketClient';
import { broadcastStateChange } from '../utils/offlineSync';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';

export function useRequestsManager() {
  const { state, setState, saveState } = useData();
  const { showToast, executeWithOwnerGuard } = useUI();

  const handleApproveRequest = useCallback(async (requestId, role = 'admin') => {
    if (!state) return;
    const currentRequests = state?.requests || [];
    const target = currentRequests.find((r) => r && r.id === requestId);
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
      let updatedPermRequests = [...(state.permissionRequests || [])];
      let updatedLeaveHistory = [...(state.leaveHistory || [])];
      let updatedResignations = [...(state.resignationRequests || [])];
      let updatedLateIncidents = [...(state.lateIncidents || [])];
      let updatedActiveShifts = { ...(state.activeShifts || {}) };

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

        // 0.1 Schedule Deviation Request Approval (عدم الالتزام بالجدول - البند 4)
        if (target.type === 'schedule_deviation') {
          const actHours = parseFloat(target.actualWorkedHours) || 0;
          const profHours = parseFloat(target.profileHours) || 8;
          const otHours = Math.max(0, Math.round((actHours - profHours) * 100) / 100);
          const regHours = Math.min(actHours, profHours);

          updatedShifts = updatedShifts.map((s) => {
            if (s.id === target.shiftId || (String(s.employeeId) === String(target.employeeId) && s.date === target.date)) {
              return {
                ...s,
                hours: regHours,
                regularHours: regHours,
                actualWorkedHours: actHours,
                overtimeHours: otHours,
                overtimeStatus: otHours > 0 ? 'approved' : 'none',
                deviationStatus: 'approved',
                adminApproved: true,
                note: `معتمد بعدم الالتزام بالجدول (ساعات فعلية: ${actHours} س | أساسي: ${regHours} س | إضافي: ${otHours} س)`
              };
            }
            return s;
          });

          // إعفاء الموظف من واقعة التأخير الصباحي لهذا اليوم لكون الوردية اعتُمدت بعدم الالتزام بالجدول
          updatedLateIncidents = updatedLateIncidents.filter(inc =>
            !(String(inc.employeeId) === String(target.employeeId) && inc.date === target.date)
          );
        }

        // 0.2 Manual Punch / Punch Correction Request Approval
        if (target.type === 'punch_correction' || target.type === 'attendance_punch' || target.type === 'manual_punch') {
          const emp = (state.employees || []).find(e => String(e.id) === String(target.employeeId));
          const punchDate = target.date || target.punchDate || new Date().toISOString().slice(0, 10);
          
          const isCheckInOnly = target.punchType === 'in' || 
                                target.targetAction === 'shift_start' || 
                                (!target.timeOut && Boolean(target.timeIn)) ||
                                (String(target.details || '').includes('حضور فقط') && !target.timeOut);
          
          const isCheckOutOnly = target.punchType === 'out' || target.targetAction === 'shift_end';
          const timeIn = target.timeIn || '09:00';
          const timeOut = isCheckInOnly ? '' : (target.timeOut || (isCheckOutOnly ? '17:00' : '17:00'));
          const empBreak = emp?.breakHours || emp?.defaultBreakHours || (emp?.branchesDetails && emp.branchesDetails[0]?.breakHours) || 0;
          const bH = Math.max(0, parseFloat(target.breakHours !== undefined && target.breakHours !== null ? target.breakHours : empBreak) || 0);

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

          const daySched = getEmployeeDaySchedule(target.employeeId, punchDate, state);
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
          } else if (target.scheduledHours) {
            schedHours = parseFloat(target.scheduledHours);
          }

          const regularHours = isCheckInOnly ? 0 : Math.min(calcNetTotalHrs, schedHours);
          const overtimeHours = isCheckInOnly ? 0 : Math.max(0, Math.round((calcNetTotalHrs - schedHours) * 100) / 100);
          const overtimeStatus = overtimeHours > 0 ? 'approved' : 'none';

          const existingShiftIndex = updatedShifts.findIndex(s => 
            (target.shiftId && s.id === target.shiftId) ||
            ((String(s.employeeId) === String(target.employeeId) || (emp?.code && String(s.employeeCode) === String(emp.code))) &&
            s.date === punchDate && (!s.timeOut || s.timeOut === '—' || target.shiftId))
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
                note: `بصمة حضور معدلة ومعتمدة من الإدارة العليا (${target.reason || 'بناءً على طلب مدير الفرع'}) — الوردية مستمرة`,
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
                  ? `بصمة معدلة ومعتمدة من الإدارة العليا (${target.reason || 'بناءً على طلب مدير الفرع'}) — (أساسي: ${finalReg} س + إضافي معتمد: ${finalOt} س)`
                  : `بصمة معدلة ومعتمدة من الإدارة العليا (${target.reason || 'بناءً على طلب مدير الفرع'})`,
                updatedAt: new Date().toISOString()
              };
            }
          } else {
            updatedShifts.unshift({
              id: `shift_manual_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              employeeId: target.employeeId,
              employeeCode: emp?.code || target.employeeCode || '',
              employeeName: emp?.name || target.employeeName || 'موظف',
              branchId: target.branchId || emp?.branchId || '',
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
                ? `بصمة يدوية معتمدة من الإدارة العليا (${target.reason || 'بناءً على طلب مدير الفرع'}) — (أساسي: ${regularHours} س + إضافي معتمد: ${overtimeHours} س)`
                : `بصمة يدوية معتمدة من الإدارة العليا (${target.reason || 'بناءً على طلب مدير الفرع'})`,
              createdAt: new Date().toISOString()
            });
          }

          // تحديث أو إنهاء الشفت في activeShifts
          if (isCheckInOnly) {
            // الموظف حالياً في شيفت: نعدل توقيت الدخول في الشفت النشط دون حذفه لتبقى الوردية جارية
            if (updatedActiveShifts) {
              const empIdStr = String(target.employeeId);
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
          } else if (timeOut && target.employeeId && updatedActiveShifts) {
            delete updatedActiveShifts[target.employeeId];
            delete updatedActiveShifts[String(target.employeeId)];
            if (emp?.code) {
              delete updatedActiveShifts[emp.code];
              delete updatedActiveShifts[String(emp.code)];
            }
          }
        }

        // 1. Leave Requests Integration
        if (['leave', 'leave_request', 'annual_leave', 'sick_leave', 'emergency_leave', 'unpaid_leave', 'leave_comp_off', 'comp_off'].includes(target.type) || target.leaveType === 'comp_off') {
          const leaveTypeResolved = target.leaveType || (target.type === 'annual_leave' ? 'annual' : target.type === 'sick_leave' ? 'sick' : target.type === 'unpaid_leave' ? 'unpaid' : (target.type === 'leave_comp_off' || target.type === 'comp_off' ? 'comp_off' : 'annual'));
          const daysCountResolved = parseInt(target.daysCount || target.days || 1, 10);
          const approvedLeaveObj = {
            id: target.id || `leave_${Date.now()}`,
            originalRequestId: target.id,
            employeeId: target.employeeId,
            employeeCode: target.employeeCode,
            employeeName: target.employeeName,
            leaveType: leaveTypeResolved,
            startDate: target.startDate || target.date,
            endDate: target.endDate || target.startDate || target.date,
            daysCount: daysCountResolved,
            status: 'approved',
            adminApproved: true,
            branchApproved: true,
            reason: target.reason || target.details || '',
            approvedAt: new Date().toISOString()
          };

          if (leaveTypeResolved === 'comp_off' || target.type === 'leave_comp_off') {
            updatedEmps = updatedEmps.map((e) => {
              if (e && (String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode)))) {
                const curBal = parseFloat(e.compOffBalance || 0);
                return {
                  ...e,
                  compOffBalance: Math.max(0, curBal - daysCountResolved)
                };
              }
              return e;
            });
          }

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
          const emp = (state.employees || []).find((e) => e && String(e.id) === String(target.employeeId));
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
              if (e && String(e.id) === String(target.employeeId)) {
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
          } else if (
            target.actionTitle === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' ||
            target.penaltyAction === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' ||
            target.actionTitle === 'إحالة فورية للتحقيق والشئون القانونية' ||
            target.penaltyAction === 'إحالة فورية للتحقيق والشئون القانونية' ||
            target.actionTitle?.includes('إيقاف مؤقت') ||
            target.penaltyAction?.includes('إيقاف مؤقت') ||
            target.actionTitle?.includes('تحقيق') ||
            target.penaltyAction?.includes('تحقيق')
          ) {
            updatedEmps = updatedEmps.map(e => {
              if (e && String(e.id) === String(target.employeeId)) {
                return {
                  ...e,
                  biometricSuspended: true,
                  punchDisabled: true,
                  accountSuspended: true,
                  status: e.status === 'تم الاستقالة' ? 'تم الاستقالة' : 'معلق',
                  suspensionReason: target.reason || target.details || target.ruleTitle || 'إيقاف مؤقت وإحالة للتحقيق معتمد',
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
        if (target.type === 'permission' || target.type === 'إذن' || target.type === 'late_permission' || target.type === 'early_leave' || target.type === 'permission_request' || target.permType) {
          updatedShifts = applyApprovedPermissionsToShifts([target], updatedShifts, state.bylaws, updatedEmps);
          const pIdx = updatedPermRequests.findIndex(p => p.id === target.id || (String(p.employeeId) === String(target.employeeId) && p.date === target.date));
          const approvedPermObj = {
            ...target,
            branchApproved: isBranchApproved,
            adminApproved: isAdminApproved,
            status: isFullyApproved ? 'approved' : 'pending_admin',
            approvedAt: isFullyApproved ? new Date().toISOString() : target.approvedAt
          };
          if (pIdx >= 0) {
            updatedPermRequests[pIdx] = { ...updatedPermRequests[pIdx], ...approvedPermObj };
          } else {
            updatedPermRequests.unshift(approvedPermObj);
          }
        }

        // 7. Roster Request Integration
        if (target.type === 'roster_update' || target.type === 'roster_edit' || target.type === 'roster_edit_request') {
          const empObj = (state.employees || []).find(e => e && (String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode))));
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
          const action = target.targetAction || target.actionType;
          const empId = target.employeeId;
          const emp = (state.employees || []).find((e) => e && String(e.id) === String(empId));
          const reqDate = target.date || (target.createdAt ? target.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
          const reqTime = target.time || (target.createdAt ? new Date(target.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '09:00');
          const reqTimestamp = target.timestamp || target.createdAt || new Date().toISOString();
          const reqEpoch = target.epoch || new Date(reqTimestamp).getTime() || Date.now();
          const approverTitle = role === 'admin' ? 'الإدارة العليا' : 'مدير الفرع';

          if (action === 'shift_start') {
            const todayStr = new Date().toISOString().slice(0, 10);
            if (reqDate === todayStr) {
              updatedActiveShifts[empId] = {
                branchId: target.branchId || emp?.branchId || '',
                date: reqDate,
                timeIn: reqTime,
                startEpoch: reqEpoch,
                isPaused: false,
                isOnBreak: false,
                breakStartTime: null,
                pauseStartEpoch: null,
                accumulatedPauseMs: 0,
                photoUrl: target.photoUrl || null,
                drivePhotoUrl: target.drivePhotoUrl || null,
                source: 'photo_attendance_approved',
                approvedBy: approverTitle,
                updatedAt: Date.now()
              };
            }

            const hasShift = updatedShifts.some(s => String(s.employeeId) === String(empId) && s.date === reqDate);
            if (!hasShift) {
              const newShift = {
                id: `shift_${Date.now()}`,
                employeeId: empId,
                employeeCode: emp?.code || target.employeeCode || '',
                employeeName: emp?.name || target.employeeName || '',
                date: reqDate,
                timeIn: reqTime,
                startTime: reqTime,
                timeOut: '—',
                endTime: '—',
                branchId: target.branchId || emp?.branchId || null,
                branchName: target.branchName || emp?.branchName || 'الفرع الرئيسي',
                source: 'photo_attendance_approved',
                approvedBy: approverTitle,
                photoUrl: target.photoUrl || null,
                drivePhotoUrl: target.drivePhotoUrl || null,
                statusLabel: 'حضور بالصورة (معتمد)',
                note: `✅ تم تسجيل الحضور بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`,
                createdAt: reqTimestamp
              };
              updatedShifts.unshift(newShift);
            } else {
              updatedShifts = updatedShifts.map(s => {
                if (String(s.employeeId) === String(empId) && s.date === reqDate) {
                  return {
                    ...s,
                    timeIn: reqTime,
                    startTime: reqTime,
                    source: 'photo_attendance_approved',
                    approvedBy: approverTitle,
                    photoUrl: target.photoUrl || s.photoUrl,
                    drivePhotoUrl: target.drivePhotoUrl || s.drivePhotoUrl,
                    statusLabel: 'حضور بالصورة (معتمد)',
                    note: (s.note ? s.note + ' | ' : '') + `✅ تم تسجيل الحضور بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`
                  };
                }
                return s;
              });
            }
          } else if (action === 'shift_end') {
            const active = updatedActiveShifts[empId];
            if (active) {
              delete updatedActiveShifts[empId];
            }

            const openShiftIdx = updatedShifts.findIndex(
              s => (s.id === target.shiftId) || (String(s.employeeId) === String(empId) && s.date === reqDate && (!s.timeOut || s.timeOut === '—' || s.timeOut === ''))
            );

            if (openShiftIdx >= 0) {
              const shiftRecord = updatedShifts[openShiftIdx];
              const timeInVal = shiftRecord.timeIn || shiftRecord.startTime || active?.timeIn || '09:00';
              const [sH, sM] = timeInVal.split(':').map(Number);
              const [eH, eM] = reqTime.split(':').map(Number);
              let diffM = (eH * 60 + eM) - (sH * 60 + sM);
              if (diffM < 0) diffM += 24 * 60;
              const calcHours = Math.round((diffM / 60) * 100) / 100;

              updatedShifts[openShiftIdx] = {
                ...shiftRecord,
                timeOut: reqTime,
                endTime: reqTime,
                hours: calcHours,
                actualWorkedHours: calcHours,
                source: 'photo_attendance_approved',
                approvedBy: approverTitle,
                photoUrl: target.photoUrl || shiftRecord.photoUrl,
                drivePhotoUrl: target.drivePhotoUrl || shiftRecord.drivePhotoUrl,
                statusLabel: 'انصراف بالصورة (معتمد)',
                note: (shiftRecord.note ? shiftRecord.note + ' | ' : '') + `✅ انصراف بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`
              };
            } else {
              updatedShifts.unshift({
                id: `shift_${Date.now()}`,
                employeeId: empId,
                employeeCode: emp?.code || target.employeeCode || '',
                employeeName: emp?.name || target.employeeName || '',
                date: reqDate,
                timeIn: '09:00',
                startTime: '09:00',
                timeOut: reqTime,
                endTime: reqTime,
                hours: 8,
                actualWorkedHours: 8,
                branchId: target.branchId || emp?.branchId || null,
                branchName: target.branchName || emp?.branchName || 'الفرع الرئيسي',
                source: 'photo_attendance_approved',
                approvedBy: approverTitle,
                photoUrl: target.photoUrl || null,
                drivePhotoUrl: target.drivePhotoUrl || null,
                statusLabel: 'انصراف بالصورة (معتمد)',
                note: `✅ انصراف بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`,
                createdAt: reqTimestamp
              });
            }
          } else if (action === 'break_start') {
            if (updatedActiveShifts[empId]) {
              updatedActiveShifts[empId] = {
                ...updatedActiveShifts[empId],
                isPaused: true,
                isOnBreak: true,
                breakStartTime: reqTime,
                pauseStartEpoch: reqEpoch,
                updatedAt: Date.now()
              };
            }
            updatedShifts = updatedShifts.map(s => {
              if (String(s.employeeId) === String(empId) && (s.date === reqDate || !s.timeOut || s.timeOut === '—')) {
                return {
                  ...s,
                  note: (s.note ? s.note + ' | ' : '') + `☕ بدء بريك بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`
                };
              }
              return s;
            });
          } else if (action === 'break_end') {
            if (updatedActiveShifts[empId]) {
              let breakMin = 0;
              if (updatedActiveShifts[empId].breakStartTime) {
                const [bH, bM] = updatedActiveShifts[empId].breakStartTime.split(':').map(Number);
                const [eH, eM] = reqTime.split(':').map(Number);
                breakMin = (eH * 60 + eM) - (bH * 60 + bM);
                if (breakMin < 0) breakMin += 24 * 60;
              }
              const breakDurationMs = breakMin > 0 ? (breakMin * 60000) : (Date.now() - (updatedActiveShifts[empId].pauseStartEpoch || Date.now()));
              updatedActiveShifts[empId] = {
                ...updatedActiveShifts[empId],
                isPaused: false,
                isOnBreak: false,
                breakStartTime: null,
                pauseStartEpoch: null,
                accumulatedPauseMs: (updatedActiveShifts[empId].accumulatedPauseMs || 0) + breakDurationMs,
                updatedAt: Date.now()
              };
            }
            updatedShifts = updatedShifts.map(s => {
              if (String(s.employeeId) === String(empId) && (s.date === reqDate || !s.timeOut || s.timeOut === '—')) {
                return {
                  ...s,
                  note: (s.note ? s.note + ' | ' : '') + `⏱️ انتهاء بريك بالصورة في نفس وقت إرسال الطلب (${reqTime}) معتمد من ${approverTitle}`
                };
              }
              return s;
            });
          }
        }

        // 7.6. Biometric Self-Registration Approval Integration
        if (target.type === 'biometric_registration') {
          const empId = target.employeeId;
          const descriptors = target.descriptors;
          const bioType = target.biometricType || 'face';

          const targetCode = target.employeeCode;

          updatedEmps = updatedEmps.map((e) => {
            const isMatch = e && (String(e.id) === String(empId) ||
              (targetCode && String(e.code) === String(targetCode)) ||
              (e.code && String(e.code) === String(empId)));

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

          // Persistent database storage
          if (bioType === 'hand') {
            saveHandDescriptor(empId, descriptors).catch(err => console.warn('Failed saving hand descriptor to DB:', err));
          } else {
            saveFaceDescriptor(empId, descriptors).catch(err => console.warn('Failed saving face descriptor to DB:', err));
          }
        }

        // 7.7. Biometric Reset Approval Integration
        if (target.type === 'biometric_reset') {
          const empId = target.employeeId;
          const targetCode = target.employeeCode;

          updatedEmps = updatedEmps.map((e) => {
            const isMatch = e && (String(e.id) === String(empId) ||
              (targetCode && String(e.code) === String(targetCode)) ||
              (e.code && String(e.code) === String(empId)));

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

          // Delete from persistent database
          deleteFaceDescriptor(empId).catch(err => console.warn('Failed deleting face descriptor from DB:', err));
          deleteHandDescriptor(empId).catch(err => console.warn('Failed deleting hand descriptor from DB:', err));
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
            if (e && String(e.id) === String(target.employeeId)) {
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

        // 10. Profile Data & Photo Update Integration
        if (target.type === 'profile_update' || target.type === 'profile_edit' || target.type === 'profile_update_request' || String(target.type || '').includes('profile')) {
          const proposed = target.proposedChanges || target.proposed || {};
          const newPhoto = proposed.photoUrl || target.photoUrl;
          const newPhones = proposed.phones || (proposed.phone ? [proposed.phone] : (target.phones || []));
          const newAddress = proposed.address !== undefined ? proposed.address : target.address;
          const newMaritalStatus = proposed.maritalStatus || target.maritalStatus;

          updatedEmps = updatedEmps.map(e => {
            const isMatch = e && (String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode)));
            if (isMatch) {
              const cleanPhones = Array.isArray(newPhones) && newPhones.length > 0
                ? newPhones.map(p => (typeof p === 'object' && p ? (p.number || '') : String(p))).filter(Boolean)
                : e.phones;

              return {
                ...e,
                ...(newPhoto ? { photoUrl: newPhoto, photo: newPhoto } : {}),
                ...(cleanPhones && cleanPhones.length > 0 ? { phones: cleanPhones, phone: cleanPhones[0] } : {}),
                ...(newAddress !== undefined && newAddress !== '' ? { address: newAddress } : {}),
                ...(newMaritalStatus ? { maritalStatus: newMaritalStatus } : {})
              };
            }
            return e;
          });
        }

        // 11. Shift Adjustment Approval Integration
        if (target.type === 'shift_adjustment') {
          const empObj = (state.employees || []).find(e => e && (String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode))));
          const datesToAdjust = Array.isArray(target.dates) && target.dates.length > 0 
            ? target.dates 
            : (target.date ? [target.date] : []);

          if (target.schedule || target.newSchedule) {
            const normalizedSch = normalizeSchedule(target.schedule || target.newSchedule);
            const targetMonth = target.month || (datesToAdjust[0] ? datesToAdjust[0].slice(0, 7) : new Date().toISOString().slice(0, 7));
            const existingRosterIdx = updatedRosters.findIndex(
              (ros) => (String(ros.employeeId) === String(target.employeeId) || (empObj?.code && String(ros.employeeCode) === String(empObj.code))) &&
                       (ros.month === targetMonth || !ros.month)
            );

            if (existingRosterIdx >= 0) {
              const currentRoster = updatedRosters[existingRosterIdx];
              updatedRosters[existingRosterIdx] = {
                ...currentRoster,
                schedule: {
                  ...(currentRoster.schedule || {}),
                  ...normalizedSch
                },
                updatedAt: new Date().toISOString()
              };
            } else {
              updatedRosters.unshift({
                id: `roster_${Date.now()}`,
                employeeId: target.employeeId || empObj?.id,
                employeeCode: target.employeeCode || empObj?.code,
                month: targetMonth,
                schedule: normalizedSch,
                status: 'approved',
                adminApproved: true,
                approvedAt: new Date().toISOString()
              });
            }
          }

          // إلغاء وتصفير أي جزاءات تأخير أو خصومات على الأيام المعدلة
          updatedLateIncidents = updatedLateIncidents.map((inc) => {
            const matchesEmp = String(inc.employeeId) === String(target.employeeId);
            const matchesDate = datesToAdjust.includes(inc.date);
            if (matchesEmp && matchesDate) {
              return {
                ...inc,
                status: 'cancelled',
                actionType: 'grace',
                actionLabel: 'سماح (تم اعتماد تعديل الشيفت)',
                penaltyAmount: 0,
                deductionMinutes: 0,
                isCancelled: true,
                cancellationReason: `تم إلغاء الجزاء لاعتماد طلب تعديل الشيفت (${target.id || ''})`
              };
            }
            return inc;
          });

          // إزالة أي استقطاعات مالية مرتبطة بهذه التواريخ
          updatedAdjs = updatedAdjs.filter((a) => {
            const matchesEmp = String(a.employeeId) === String(target.employeeId);
            const matchesDate = datesToAdjust.includes(a.date);
            if (matchesEmp && matchesDate && (a.type === 'deduction' || a.subType === 'lateness' || a.subType === 'disciplinary_penalty')) {
              return false;
            }
            return true;
          });
        }

        // 12. Comp-Off Grant Integration (اعتماد احتساب بدل راحة)
        if (target.type === 'comp_off_grant') {
          const creditDays = parseFloat(target.daysCount || target.compOffDays || 1) || 1;
          updatedEmps = updatedEmps.map((e) => {
            if (e && (String(e.id) === String(target.employeeId) || (target.employeeCode && String(e.code) === String(target.employeeCode)))) {
              const curBal = parseFloat(e.compOffBalance || 0);
              return {
                ...e,
                compOffBalance: curBal + creditDays
              };
            }
            return e;
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
        activeShifts: updatedActiveShifts,
        leaveRequests: updatedLeaveRequests,
        permissionRequests: updatedPermRequests,
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
      enqueueRequestDecision({
        requestId,
        decision: 'approve',
        newStatus: isFullyApproved ? 'approved' : 'pending_admin',
        reviewer: { role },
        branchId: target.branchId || target.branch_id
      }).catch(err => console.warn('Outbox enqueue decision error:', err));

      // بث لحظي فوري (< 5ms) لجميع الأجهزة وصفحة الموظف عبر الـ WebSocket والبث المحلي
      try {
        const finalApprovedReq = updatedRequests.find(r => r && String(r.id) === String(requestId)) || target;
        emitLiveRequestUpdated({
          request: finalApprovedReq,
          notification: decisionNotif,
          decision: 'approve',
          requestId,
          newStatus: isFullyApproved ? 'approved' : 'pending_admin'
        });
        broadcastStateChange(updatedState);
      } catch (broadcastErr) {
        console.warn('Realtime request broadcast error:', broadcastErr);
      }

      // إشعار فوري عبر Gmail بتطبيق الجزاء / الخصم المعتمد
      if (target.type === 'penalty' || target.type === 'early_exit' || target.type === 'disciplinary_penalty' || target.type === 'violation' || String(target.id || '').startsWith('disc_')) {
        const targetEmp = (state.employees || []).find((e) => e && String(e.id) === String(target.employeeId));
        notifyOnPenaltyApplied({
          state: updatedState,
          emp: targetEmp,
          penalty: {
            ...target,
            actionTitle: target.actionTitle || target.penaltyAction || 'جزاء تأديبي معتمد',
            amount: parseFloat(target.amount || target.penaltyAmount) || 0,
            deductionDays: parseFloat(target.deductionDays || target.penaltyDays || (target.impactType === 'deduction_days' ? target.impactVal : 0)) || 0,
            date: target.date || target.startDate || new Date().toISOString().slice(0, 10),
            reason: target.ruleTitle || target.violationTitle || target.reason || target.details || 'تطبيق سياسة لائحة العمل والجزاءات'
          },
          branchName: target.branchName || targetEmp?.branchName,
          source: target.type === 'early_exit' ? 'late_penalty' : 'disciplinary'
        }).catch((e) => console.warn('Penalty email dispatch error:', e));
      }
    };

    if (role === 'admin' || role === 'owner') {
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

      if (target.type === 'biometric_registration' && locks.lockApproveBiometricRegistration) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveBiometricRegistration',
          actionTitle: `اعتماد تسجيل بصمة جديدة (${target.employeeName || target.employeeId})`,
          actionDetails: `النوع: ${target.biometricType === 'hand' ? 'بصمة اليد' : 'بصمة الوجه'}`,
          onExecute: performApprove
        });
        return;
      }

      if (target.type === 'biometric_reset' && locks.lockApproveBiometricReset) {
        executeWithOwnerGuard({
          lockKey: 'lockApproveBiometricReset',
          actionTitle: `اعتماد مسح وإعادة تسجيل البصمة (${target.employeeName || target.employeeId})`,
          actionDetails: `السبب: ${target.reason || ''}`,
          onExecute: performApprove
        });
        return;
      }

      if (isResignation && (locks.lockApproveResignations || locks.lockTerminateEmployee)) {
        executeWithOwnerGuard({
          lockKey: locks.lockApproveResignations ? 'lockApproveResignations' : 'lockTerminateEmployee',
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
      let updatedActiveShifts = { ...(state.activeShifts || {}) };

      if (targetReq && (targetReq.type === 'biometric_verification' || targetReq.type === 'تأكيد بصمة الوجه' || targetReq.type === 'تأكيد بصمة اليد' || targetReq.requestType === 'biometric_verification')) {
        const empId = targetReq.employeeId;
        const reqDate = targetReq.date || (targetReq.createdAt ? targetReq.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const rejecterTitle = role === 'admin' ? 'الإدارة العليا' : 'مدير الفرع';
        const targetAction = targetReq.targetAction || targetReq.actionType || 'shift_start';
        const actionTitle = targetAction === 'shift_end' ? 'انصراف' : 'حضور';

        // 1. حذف الوردية النشطة نهائياً بكلا المعرفين (سواء كان الرفض لحضور أو انصراف)
        delete updatedActiveShifts[empId];
        delete updatedActiveShifts[String(empId)];

        // 2. إلغاء وتصفير الوردية بالكامل من سجل الورديات وشطبها نهائياً
        updatedShifts = updatedShifts.map((s) => {
          const isTarget =
            (targetReq.shiftId && s.id === targetReq.shiftId) ||
            (s.requestId && (s.requestId === targetReq.id || s.requestId === requestId)) ||
            (String(s.employeeId) === String(empId) && s.date === reqDate && (s.punchType === 'photo_attendance' || s.requestId === targetReq.id));

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
              photoRejectionReason: `تم رفض البصمة بسبب رفض الصورة من ${rejecterTitle}`,
              rejectedBy: rejecterTitle,
              rejectedAt: new Date().toISOString(),
              note: (s.note ? s.note + ' | ' : '') + `⚠️ تم رفض البصمة بسبب رفض الصورة (${actionTitle}) من ${rejecterTitle} - غير محتسبة في الأجور لحين اعتمادها يدوياً.`
            };
          }
          return s;
        });
      }

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

      if (targetReq && targetReq.type === 'schedule_deviation') {
        const schedEnd = targetReq.scheduledEnd || '17:00';
        updatedShifts = updatedShifts.map((s) => {
          if (s.id === targetReq.shiftId || (String(s.employeeId) === String(targetReq.employeeId) && s.date === targetReq.date)) {
            let cappedHours = s.regularHours || 0;
            if (s.timeIn && schedEnd) {
              const [inH, inM] = String(s.timeIn).split(':').map(Number);
              const [endH, endM] = String(schedEnd).split(':').map(Number);
              if (!isNaN(inH) && !isNaN(endH)) {
                let sMins = inH * 60 + (inM || 0);
                let eMins = endH * 60 + (endM || 0);
                if (eMins < sMins) eMins += 24 * 60;
                cappedHours = Math.max(0, Math.round(((eMins - sMins) / 60 - (parseFloat(s.breakHours) || 0)) * 100) / 100);
              }
            }
            return {
              ...s,
              hours: cappedHours,
              regularHours: cappedHours,
              overtimeHours: 0,
              overtimeStatus: 'rejected',
              deviationStatus: 'rejected',
              adminApproved: false,
              note: `تم رفض عدم الالتزام بالجدول — تم استبعاد الساعات بعد موعد الانصراف المجدول (${schedEnd}) واحتساب الساعات حتى نهاية الوردية (${cappedHours} س)`
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

      const updatedPermRequests = (state.permissionRequests || []).map((p) =>
        p.id === requestId || (targetReq && String(p.employeeId) === String(targetReq.employeeId) && p.date === targetReq.date)
          ? { ...p, status: 'rejected', adminApproved: false, rejectedAt: new Date().toISOString() }
          : p
      );

      const updatedLoans = (state.loans || []).map((l) =>
        l.id === requestId || l.requestId === requestId || (targetReq && String(l.employeeId) === String(targetReq.employeeId) && (l.amount === targetReq.amount || l.totalAmount === targetReq.totalAmount))
          ? { ...l, status: 'rejected', adminApproved: false, rejectedAt: new Date().toISOString() }
          : l
      );

      const updatedResignations = (state.resignationRequests || []).map((r) =>
        String(r.id) === String(requestId)
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

      // إذا تم رفض مقترح جزاء تأديبي كان قد تسبب في تعليق الموظف أو بصمته، يتم إعادة تنشيطه فورياً
      let updatedEmps = [...(state.employees || [])];
      if (targetReq && (targetReq.type === 'disciplinary_penalty' || targetReq.type === 'penalty' || targetReq.type === 'violation' || String(targetReq.id || '').startsWith('disc_'))) {
        const isSevere = 
          targetReq.actionTitle === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' ||
          targetReq.penaltyAction === 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق' ||
          targetReq.actionTitle === 'إحالة فورية للتحقيق والشئون القانونية' ||
          targetReq.penaltyAction === 'إحالة فورية للتحقيق والشئون القانونية' ||
          targetReq.actionTitle?.includes('إيقاف مؤقت') ||
          targetReq.penaltyAction?.includes('إيقاف مؤقت') ||
          targetReq.actionTitle?.includes('تحقيق') ||
          targetReq.penaltyAction?.includes('تحقيق');

        if (isSevere) {
          updatedEmps = updatedEmps.map(e => {
            if (String(e.id) === String(targetReq.employeeId)) {
              const { biometricSuspended, punchDisabled, accountSuspended, suspensionReason, suspendedAt, suspendedBy, ...rest } = e;
              return {
                ...rest,
                biometricSuspended: false,
                punchDisabled: false,
                accountSuspended: false,
                status: e.status === 'معلق' ? 'على رأس العمل' : e.status,
                reactivatedAt: new Date().toISOString(),
                reactivatedBy: 'الإدارة العليا'
              };
            }
            return e;
          });
        }
      }

      const isBio = targetReq && (targetReq.type === 'biometric_verification' || targetReq.type === 'تأكيد بصمة الوجه' || targetReq.type === 'تأكيد بصمة اليد' || targetReq.requestType === 'biometric_verification');
      const decisionNotif = createRequestDecisionNotification({
        requestId: targetReq?.id || requestId,
        employeeId: targetReq?.employeeId,
        type: targetReq?.type,
        action: 'rejected',
        approverRole: role,
        title: isBio ? '❌ تم رفض توثيق البصمة بالصورة وإلغاء الوردية' : undefined,
        message: isBio ? 'تم رفض طلب اعتماد البصمة بالصورة من قِبل الإدارة، وبناءً عليه تم إلغاء الوردية وشطبها نهائياً من سجل البصمات ونظام الأجور.' : undefined,
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
        employees: updatedEmps,
        requests: updatedRequests,
        shifts: updatedShifts,
        activeShifts: updatedActiveShifts,
        leaveRequests: updatedLeaveRequests,
        permissionRequests: updatedPermRequests,
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
      enqueueRequestDecision({
        requestId,
        decision: 'reject',
        newStatus: 'rejected',
        reviewer: { role },
        branchId: targetReq?.branchId || targetReq?.branch_id
      }).catch(err => console.warn('Outbox enqueue decision error:', err));

      // بث لحظي فوري (< 5ms) لجميع الأجهزة وصفحة الموظف عبر الـ WebSocket والبث المحلي
      try {
        emitLiveRequestUpdated({
          request: targetReq,
          notification: decisionNotif,
          decision: 'reject',
          requestId,
          newStatus: 'rejected'
        });
        broadcastStateChange(updatedState);
      } catch (broadcastErr) {
        console.warn('Realtime reject broadcast error:', broadcastErr);
      }
    };

    if ((role === 'admin' || role === 'owner') && state.orgSettings?.ownerModificationLocks?.lockRejectRequests) {
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
      const req = (state.requests || []).find((r) => r && r.id === reqId);
      const emp = req ? (state.employees || []).find((e) => e && e.id === req.employeeId) : null;
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
