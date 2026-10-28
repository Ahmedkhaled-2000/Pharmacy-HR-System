import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

// Test what happens when getScheduledShiftForDate ignores superseded/cancelled requests and prioritizes rosterEngine
import { getEmployeeDaySchedule } from '../src/utils/rosterEngine.js';

function fixedGetScheduledShiftForDate(employeeId, dateStr, state, targetBranchId = null) {
  if (!employeeId || !dateStr || !state) return null;
  const empIdStr = String(employeeId);
  const emp = (state.employees || []).find((e) => e && (String(e.id) === empIdStr || (e.code && String(e.code) === empIdStr)));
  const empCodeStr = emp?.code ? String(emp.code) : '';

  // 1. فحص طلبات تعديل الشيفت المعتمدة أولاً - مع استبعاد أي طلبات superseded أو ملغاة والتأكد من مطابقة الفرع
  const approvedShiftAdj = (state.requests || []).find(
    (r) => {
      if (!r) return false;
      if (r.status === 'superseded' || r.supersededByAdmin || r.status === 'cancelled' || r.isCancelled || r.status === 'rejected') return false;
      const isEmp = (String(r.employeeId) === empIdStr || (empCodeStr && String(r.employeeId) === empCodeStr));
      if (!isEmp) return false;
      const isShiftAdjType = (r.type === 'shift_adjustment' || r.type === 'roster_edit' || r.type === 'roster_update' || r.type === 'roster_edit_request' || r.type === 'schedule_edit');
      if (!isShiftAdjType) return false;
      const isApproved = (r.status === 'approved' || r.adminApproved || (r.branchApproved && r.isDirectToAdmin));
      if (!isApproved) return false;
      // مطابقة الفرع إذا تم تحديد فرع
      if (targetBranchId && r.branchId && String(r.branchId).trim() !== String(targetBranchId).trim()) return false;
      return (r.date === dateStr || (Array.isArray(r.dates) && r.dates.includes(dateStr)) || (r.schedule && r.schedule[dateStr]) || (r.newSchedule && r.newSchedule[dateStr]) || r.replacementRestDate === dateStr);
    }
  );

  if (approvedShiftAdj) {
    const schedItem = (approvedShiftAdj.schedule && approvedShiftAdj.schedule[dateStr]) ||
                      (approvedShiftAdj.newSchedule && approvedShiftAdj.newSchedule[dateStr]);
    if (schedItem) {
      const isOff = schedItem.type === 'off' || schedItem.isOff === true;
      if (isOff) return { type: 'off', isOff: true, start: '', end: '', branchId: emp?.branchId || '', source: 'shift_adjustment' };
      return {
        start: schedItem.start?.slice(0, 5) || '',
        end: schedItem.end?.slice(0, 5) || '',
        type: schedItem.type || 'work',
        isOff: false,
        branchId: approvedShiftAdj.branchId || schedItem.branchId || emp?.branchId || '',
        rosterId: approvedShiftAdj.id,
        source: 'shift_adjustment'
      };
    }
    if (approvedShiftAdj.actionType === 'set_rest_day' || approvedShiftAdj.replacementRestDate === dateStr) {
      return { type: 'off', isOff: true, start: '', end: '', branchId: emp?.branchId || '', source: 'shift_adjustment' };
    }
    if (approvedShiftAdj.newStartTime) {
      return {
        start: approvedShiftAdj.newStartTime?.slice(0, 5),
        end: approvedShiftAdj.newEndTime?.slice(0, 5) || '',
        type: 'work',
        isOff: false,
        branchId: approvedShiftAdj.branchId || emp?.branchId || '',
        rosterId: approvedShiftAdj.id,
        source: 'shift_adjustment'
      };
    }
  }

  // 2. جدول الموظف المركزي من rosterEngine
  try {
    const daySchedule = getEmployeeDaySchedule(empIdStr, dateStr, state, targetBranchId);
    if (daySchedule) {
      const isOff = daySchedule.type === 'off' || daySchedule.isOff === true;
      if (isOff) {
        return { type: 'off', isOff: true, start: '', end: '', branchId: daySchedule.branchId || emp?.branchId || '', source: 'roster_off' };
      }
      return {
        start: daySchedule.start ? daySchedule.start.slice(0, 5) : '',
        end: daySchedule.end ? daySchedule.end.slice(0, 5) : '',
        type: daySchedule.type || 'work',
        isOff: false,
        branchId: daySchedule.branchId || emp?.branchId || '',
        rosterId: daySchedule.id || daySchedule.rosterId,
        source: 'rosterEngine'
      };
    }
  } catch (e) {
    console.error(e);
  }

  return null;
}

const emp = state.employees.find(e => String(e.code) === '107');
['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'].forEach(d => {
  const sched = fixedGetScheduledShiftForDate(emp.id, d, state, emp.branchId);
  console.log(`fixedGetScheduledShiftForDate(${d}) = `, sched);
});
