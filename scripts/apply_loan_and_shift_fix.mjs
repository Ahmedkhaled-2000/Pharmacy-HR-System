import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { autoSettlePeriodLoans } from '../src/utils/loansEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const statePath = path.resolve(__dirname, '../scratch_reconciled_full_state.json');

const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

// 1. Settle loans for cycle 2026-10
const res = autoSettlePeriodLoans('2026-10', state);
console.log('Settled loans count for 2026-10:', res.settledCount);

// 2. Fix Sabry shift
const updatedShifts = [...(res.updatedShifts || state.shifts)];
const sabryShiftIdx = updatedShifts.findIndex(s => s.id === 'shift_emp_1789143997322_1790283839766');

if (sabryShiftIdx >= 0) {
  const oldS = updatedShifts[sabryShiftIdx];
  updatedShifts[sabryShiftIdx] = {
    ...oldS,
    date: '2026-09-24',
    timeIn: '23:57',
    timeOut: '09:00',
    hours: 9.05,
    actualWorkedHours: 9.05,
    regularHours: 9.00,
    overtimeHours: 0.05,
    isOvertimeApproved: true,
    overtimeStatus: 'approved',
    status: 'completed',
    statusLabel: 'حضور معتمد (مع إضافي معتمد)',
    note: 'تسجيل معتمد للوردية المقررة بالروستر مع إضافي معتمد (+0.05 س)',
    notes: 'تسجيل معتمد للوردية المقررة بالروستر مع إضافي معتمد (+0.05 س)',
    adminApproved: true,
    unlinkPriorRequests: true,
    decoupledDay: true,
    updatedAt: new Date().toISOString()
  };
  console.log('✅ Updated Sabry shift to 2026-09-24 (23:57 to 09:00)');
} else {
  console.log('⚠️ Could not find shift_emp_1789143997322_1790283839766');
}

const updatedOrgSettings = {
  ...(state.orgSettings || {}),
  payrollLoanSettlements: {
    ...(state.orgSettings?.payrollLoanSettlements || {}),
    '2026-10': {
      settled: true,
      settledAt: new Date().toISOString(),
      settledCount: res.settledCount,
      totalDeducted: 17400,
      note: 'تسوية آلية معتمدة عند انتهاء دورة أكتوبر 2026'
    }
  }
};

const finalState = {
  ...state,
  loans: res.updatedLoans,
  requests: res.updatedRequests,
  shifts: updatedShifts,
  orgSettings: updatedOrgSettings
};

fs.writeFileSync(statePath, JSON.stringify(finalState, null, 2), 'utf8');
console.log('✅ Successfully wrote updated authoritative state to scratch_reconciled_full_state.json');

// Calculate summary stats
let totalGiven = 0;
let totalPaid = 0;
finalState.loans.forEach(l => {
  if (l.status === 'approved' || l.status === 'partial' || l.status === 'paid') {
    const t = parseFloat(l.amount || l.totalAmount) || 0;
    const p = parseFloat(l.paidAmount) || 0;
    totalGiven += t;
    totalPaid += p;
  }
});
console.log('Financial summary:', {
  totalLoansGiven: totalGiven,
  totalPaid: totalPaid,
  remainingBalance: totalGiven - totalPaid
});
