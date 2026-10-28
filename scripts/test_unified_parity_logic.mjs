import fs from 'fs';
import { isApprovedPermissionForDate, computeLatenessFinancialAmount } from '../src/utils/latePenaltyEngine.js';

async function main() {
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const state = (await res.json()).value;
  const employees = state.employees || [];
  const selectedMonth = '2026-10';

  console.log(`Testing Unified Parity Logic for ${employees.length} employees...\n`);

  // Unified function for getting penalties (to be used in both Admin and Portal)
  function getUnifiedPenalties(empId, state, options = {}) {
    const { branchId = null, filterFn = null } = options;
    const emp = employees.find(e => String(e.id) === String(empId));
    if (!emp) return [];

    const defaultFilterFn = (d) => d && ((d >= '2026-09-21' && d <= '2026-10-20') || d.startsWith(selectedMonth));
    const effectiveFilter = filterFn || defaultFilterFn;

    const list = [];
    const seenReqIds = new Set();
    const seenLateKeys = new Set();

    // 1. Requests (disciplinary penalties & late penalties recorded via requests)
    (state.requests || []).forEach(r => {
      if (!r || String(r.employeeId) !== String(empId)) return;
      if (r.status === 'cancelled' || r.status === 'rejected') return;
      if (r.type !== 'penalty' && r.type !== 'disciplinary_penalty') return;
      if (branchId && r.branchId && String(r.branchId) !== String(branchId)) return;
      const dateStr = r.date || r.createdAt?.slice(0, 10);
      if (!effectiveFilter(dateStr)) return;

      const amt = parseFloat(r.amount || r.impactVal) || 0;
      if (amt <= 0) return;

      seenReqIds.add(String(r.id));
      if (r.id.startsWith('req_late_inc_')) {
        const rawId = r.id.replace(/^req_/, '');
        seenReqIds.add(rawId);
      }
      if (dateStr) seenLateKeys.add(`${empId}_${dateStr}`);

      list.push({
        id: String(r.id),
        date: dateStr,
        reason: r.reason || r.ruleTitle || 'جزاء إداري',
        amount: amt,
        branchId: r.branchId || emp.branchId,
        source: 'request'
      });
    });

    // 2. Late incidents
    (state.lateIncidents || []).forEach(inc => {
      if (!inc || String(inc.employeeId) !== String(empId)) return;
      if (
        inc.status === 'cancelled' ||
        inc.isCancelled ||
        inc.objection?.status === 'approved' ||
        inc.status === 'approved_permission_exempt' ||
        inc.actionType === 'grace' ||
        isApprovedPermissionForDate(inc.employeeId, inc.date, state)
      ) return;

      if ((inc.deductionMinutes || 0) <= 0 && (parseFloat(inc.penaltyAmount) || 0) <= 0) return;
      if (branchId && inc.branchId && String(inc.branchId) !== String(branchId)) return;
      if (!effectiveFilter(inc.date)) return;

      const incIdStr = String(inc.id);
      const cleanIncId = incIdStr.replace(/^late_inc_/, '');
      if (
        seenReqIds.has(incIdStr) ||
        seenReqIds.has(cleanIncId) ||
        seenReqIds.has(`req_${incIdStr}`) ||
        seenReqIds.has(`req_late_inc_${cleanIncId}`) ||
        (inc.date && seenLateKeys.has(`${empId}_${inc.date}`))
      ) return;

      seenReqIds.add(incIdStr);
      if (inc.date) seenLateKeys.add(`${empId}_${inc.date}`);

      const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
      const amt = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);
      if (amt <= 0) return;

      const bObj = (state.branches || []).find(b => String(b.id) === String(inc.branchId));
      const branchLabel = bObj?.name ? ` — ${bObj.name}` : '';

      list.push({
        id: `late_inc_${cleanIncId}`,
        date: inc.date,
        reason: `⏱️ تأخير بصمة (${inc.deductionMinutes || inc.delayMinutes || 0} دقيقة)${branchLabel} - ${inc.tierName || 'لائحة الجزاءات'}`,
        amount: amt,
        deductionMinutes: inc.deductionMinutes || 0,
        branchId: inc.branchId || emp.branchId,
        source: 'late_incident'
      });
    });

    // 3. Adjustments (direct financial deductions)
    (state.adjustments || []).forEach(a => {
      if (!a || (String(a.employeeId) !== String(empId) && a.employeeId !== 'all')) return;
      if (a.type !== 'deduction' && a.type !== 'penalty') return;
      if (branchId && a.branchId && String(a.branchId) !== String(branchId)) return;
      if (!effectiveFilter(a.date)) return;

      const amt = parseFloat(a.amount) || 0;
      if (amt <= 0) return;

      // Skip if linked to an already seen request
      const isLinkedToReq = Array.from(seenReqIds).some(
        (reqId) => a.id === `adj_pen_${reqId}` || a.id === `adj_disc_${reqId}` || a.id === reqId || a.id === `adj_${reqId}` || a.requestId === reqId
      );
      if (isLinkedToReq) return;

      list.push({
        id: String(a.id),
        date: a.date,
        reason: a.reason || a.description || 'خصم مباشر',
        amount: amt,
        branchId: a.branchId || emp.branchId,
        source: 'adjustment'
      });
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  // Audit all employees
  let totalPenalties = 0;
  let totalAmount = 0;
  let empsWithPenalties = 0;

  employees.forEach(emp => {
    const penalties = getUnifiedPenalties(emp.id, state);
    if (penalties.length > 0) {
      empsWithPenalties++;
      const sum = penalties.reduce((acc, p) => acc + p.amount, 0);
      totalPenalties += penalties.length;
      totalAmount += sum;
      console.log(`[${emp.code}] ${emp.name}: ${penalties.length} penalties (${sum.toFixed(2)} EGP)`);
      penalties.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.date} | ${p.reason} | ${p.amount.toFixed(2)} EGP [${p.source}]`);
      });
    }
  });

  console.log('\n========================================');
  console.log(`Total employees with penalties: ${empsWithPenalties}`);
  console.log(`Total penalty items: ${totalPenalties}`);
  console.log(`Total penalty amount: ${totalAmount.toFixed(2)} EGP`);
  console.log('========================================');
}

main().catch(console.error);
