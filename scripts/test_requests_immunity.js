import assert from 'node:assert';
import { mergeArrays } from '../src/utils/stateMerger.js';

console.log('🧪 Starting Terminal Decision Immunity Tests for Requests...');

// 1. طلب محلي معتمد ضد طلب سحابي معلق
const localApproved = [
  { id: 'req_1', type: 'leave', status: 'approved', adminApproved: true, approvedAt: '2026-09-14T12:00:00Z', updatedAt: '2026-09-14T11:00:00Z' }
];
const remotePending = [
  { id: 'req_1', type: 'leave', status: 'pending', adminApproved: false, updatedAt: '2026-09-14T13:00:00Z' } // توقيت السحابة أحدث
];

let res = mergeArrays(localApproved, remotePending, { prefix: 'req' });
assert.strictEqual(res.length, 1);
assert.strictEqual(res[0].status, 'approved', 'Local approved request MUST NOT revert to remote pending, even if remote is newer');
assert.strictEqual(res[0].adminApproved, true);
console.log('✅ Test 1 Passed: Local approved wins against newer remote pending');

// 2. طلب محلي مرفوض ضد طلب سحابي معلق
const localRejected = [
  { id: 'req_2', type: 'res', status: 'rejected', rejectionReason: 'غير مستوفي الشروط', rejectedAt: '2026-09-14T12:00:00Z', updatedAt: '2026-09-14T11:00:00Z' }
];
const remotePending2 = [
  { id: 'req_2', type: 'res', status: 'pending', updatedAt: '2026-09-14T14:00:00Z' } // توقيت السحابة أحدث
];

res = mergeArrays(localRejected, remotePending2, { prefix: 'res' });
assert.strictEqual(res[0].status, 'rejected', 'Local rejected request MUST NOT revert to remote pending');
assert.strictEqual(res[0].rejectionReason, 'غير مستوفي الشروط');
console.log('✅ Test 2 Passed: Local rejected wins against newer remote pending');

// 3. طلب سحابي معتمد ضد طلب محلي معلق كاش قديم
const localStalePending = [
  { id: 'req_3', type: 'swap', status: 'pending', updatedAt: '2026-09-14T15:00:00Z' }
];
const remoteApproved = [
  { id: 'req_3', type: 'swap', status: 'approved', adminApproved: true, approvedAt: '2026-09-14T14:00:00Z', updatedAt: '2026-09-14T14:00:00Z' }
];

res = mergeArrays(localStalePending, remoteApproved, { prefix: 'swap' });
assert.strictEqual(res[0].status, 'approved', 'Remote approved request MUST NOT be overwritten by local pending');
assert.strictEqual(res[0].adminApproved, true);
console.log('✅ Test 3 Passed: Remote approved wins against newer local pending');

// 4. طلب سحابي مرفوض ضد طلب محلي معلق
const localStalePending2 = [
  { id: 'req_4', type: 'perm', status: 'pending', updatedAt: '2026-09-14T16:00:00Z' }
];
const remoteRejected = [
  { id: 'req_4', type: 'perm', status: 'rejected', rejectionReason: 'تم رفض الإذن', updatedAt: '2026-09-14T14:00:00Z' }
];

res = mergeArrays(localStalePending2, remoteRejected, { prefix: 'perm' });
assert.strictEqual(res[0].status, 'rejected', 'Remote rejected request MUST NOT be overwritten by local pending');
console.log('✅ Test 4 Passed: Remote rejected wins against newer local pending');

// 5. سلفة مسددة أو معتمدة
const localLoan = [
  { id: 'loan_1', type: 'loan', amount: 5000, paidAmount: 5000, status: 'paid', adminApproved: true, updatedAt: '2026-09-14T10:00:00Z' }
];
const remoteLoanPending = [
  { id: 'loan_1', type: 'loan', amount: 5000, paidAmount: 0, status: 'pending', updatedAt: '2026-09-14T17:00:00Z' }
];

res = mergeArrays(localLoan, remoteLoanPending, { prefix: 'loan' });
assert.strictEqual(res[0].status, 'paid', 'Loan paid status must be preserved');
assert.strictEqual(res[0].adminApproved, true);
console.log('✅ Test 5 Passed: Loan paid status immunity verified');

console.log('\n🎉 ALL 5 IMMUNITY TESTS PASSED PERFECTLY!\n');
