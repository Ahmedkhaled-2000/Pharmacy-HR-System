import fs from 'fs';
import { getResolvedEmployeeRoster, getEmployeeDaySchedule } from '../src/utils/rosterEngine.js';

const state = JSON.parse(fs.readFileSync('./scratch_live_state.json', 'utf8'));
const empId = 'emp_1789231413527';
const emp = (state.employees || []).find(e => e.id === empId || e.code === '107');

const selectedMonth = '2026-10';
const medinaBranchId = 'branch_1789241578010';

const bRoster = getResolvedEmployeeRoster(emp, medinaBranchId, selectedMonth, state);
console.log('bRoster found:', !!bRoster);
console.log('bRoster fromDate:', bRoster?.fromDate, 'toDate:', bRoster?.toDate);
console.log('bRoster schedule keys:', Object.keys(bRoster?.schedule || {}));

const WEEKDAY_AR_MAP = {
  'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6
};

function getDayScheduleFromSchedule(schedule, dateStr, arDayName) {
  if (!schedule || typeof schedule !== 'object') return null;
  if (schedule[dateStr]) return schedule[dateStr];
  if (schedule[arDayName]) return schedule[arDayName];
  return null;
}

function buildMonthCalendar(selectedMonth, schedule, fromDate, toDate, empId, state, targetBranchId) {
  const result = [];
  const hasApprovedSchedule = Boolean(schedule && typeof schedule === 'object' && Object.keys(schedule).length > 0);

  if (fromDate && toDate) {
    let current = new Date(fromDate);
    const end = new Date(toDate);
    if (!isNaN(current) && !isNaN(end) && current <= end) {
      while (current <= end) {
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        const d = current.getDate();
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const jsDay = current.getDay();
        const arDayName = Object.keys(WEEKDAY_AR_MAP).find(k => WEEKDAY_AR_MAP[k] === jsDay) || '';
        
        let daySchedule = null;
        if (hasApprovedSchedule) {
          daySchedule = getDayScheduleFromSchedule(schedule, dateStr, arDayName);
        }
        if (empId && state) {
          const dynamicSchedule = getEmployeeDaySchedule(empId, dateStr, state, targetBranchId);
          if (dynamicSchedule) {
            if (targetBranchId) {
              daySchedule = dynamicSchedule;
            } else if (!daySchedule) {
              daySchedule = dynamicSchedule;
            }
          }
        }

        result.push({ date: dateStr, day: d, arDayName, daySchedule });
        current.setDate(current.getDate() + 1);
      }
      return result;
    }
  }
  return result;
}

const bCalendar = buildMonthCalendar(
  selectedMonth,
  bRoster?.schedule,
  bRoster?.fromDate,
  bRoster?.toDate,
  emp.id,
  state,
  medinaBranchId
);

console.log('bCalendar length:', bCalendar.length);
const workDays = bCalendar.filter(d => d.daySchedule && d.daySchedule.type !== 'off' && !d.daySchedule.isOff).length;
const offDays = bCalendar.filter(d => d.daySchedule && (d.daySchedule.type === 'off' || d.daySchedule.isOff)).length;
console.log('workDays:', workDays, 'offDays:', offDays);

console.log('Sample days:');
bCalendar.slice(0, 10).forEach(d => {
  console.log(d.date, d.arDayName, d.daySchedule ? { type: d.daySchedule.type, isOff: d.daySchedule.isOff, start: d.daySchedule.start, end: d.daySchedule.end, label: d.daySchedule.label } : 'NO SCHED');
});
