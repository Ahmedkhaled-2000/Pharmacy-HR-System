import fs from 'fs';

const state = JSON.parse(fs.readFileSync('./scratch_validated_state.json', 'utf8'));
const emp = state.employees.find(e => String(e.code) === '107');

const incs107 = (state.lateIncidents || []).filter(i => 
  String(i.employeeId) === String(emp.id) &&
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  i.actionType !== 'grace' &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);

console.log(`Emp 107 valid deduction incidents in validated state: ${incs107.length}`);
incs107.forEach((i, idx) => {
  console.log(`${idx+1}. Date: ${i.date} | branch: ${i.branchName} (${i.branchId}) | late: ${i.lateMinutes}m | deduct: ${i.deductionMinutes}m | amt: ${i.penaltyAmount} | action: ${i.actionLabel}`);
});

const totalMins = incs107.reduce((sum, i) => sum + (i.deductionMinutes || 0), 0);
const totalAmt = incs107.reduce((sum, i) => sum + (parseFloat(i.penaltyAmount) || 0), 0);
console.log(`Total Mins: ${totalMins} (Target: 1530)`);
console.log(`Total Amt: ${totalAmt.toFixed(2)} (Target: 1176.57)`);

// Check all other employees
const otherDeducts = (state.lateIncidents || []).filter(i => 
  String(i.employeeId) !== String(emp.id) &&
  i.status !== 'cancelled' &&
  !i.isCancelled &&
  i.actionType !== 'grace' &&
  (i.deductionMinutes > 0 || i.penaltyAmount > 0)
);
console.log(`\nOther employees deduction incidents: ${otherDeducts.length}`);
