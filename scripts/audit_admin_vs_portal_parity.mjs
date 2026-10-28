import fs from 'fs';
import { isApprovedPermissionForDate, computeLatenessFinancialAmount } from '../src/utils/latePenaltyEngine.js';

async function main() {
  const res = await fetch('http://169.58.214.20:5000/api/settings?key=pharmacy-tracker-data');
  const state = (await res.json()).value;
  const employees = state.employees || [];
  const selectedMonth = '2026-10';

  console.log(`Auditing Admin vs Portal parity for ${employees.length} employees in cycle ${selectedMonth}...\n`);

  // 1. Replicate Admin BylawsModule records logic for each employee
  // From BylawsModule.jsx lines 1010-1113:
  const getAdminPenaltiesForEmp = (empId) => {
    const list = [];
    const seenReqIds = new Set();
    const seenLateKeys = new Set();

    // A. requests of type penalty / disciplinary_penalty
    (state.requests || []).forEach(r => {
      if (!r || String(r.employeeId) !== String(empId)) return;
      if (r.status === 'cancelled' || r.status === 'rejected') return;
      if (r.type !== 'penalty' && r.type !== 'disciplinary_penalty') return;
      if (r.date && !r.date.startsWith(selectedMonth) && !(r.date >= '2026-09-21' && r.date <= '2026-10-20')) return;

      seenReqIds.add(String(r.id));
      if (r.date) seenLateKeys.add(`${empId}_${r.date}`);

      list.push({
        id: r.id,
        date: r.date || r.createdAt?.slice(0, 10),
        reason: r.reason || r.ruleTitle || 'جزاء إداري',
        amount: parseFloat(r.amount || r.impactVal) || 0,
        source: 'request'
      });
    });

    // B. lateIncidents
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

      if (inc.date && !(inc.date >= '2026-09-21' && inc.date <= '2026-10-20') && !inc.date.startsWith(selectedMonth)) return;

      const emp = employees.find(e => String(e.id) === String(empId));
      const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
      const amt = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);

      list.push({
        id: inc.id,
        date: inc.date,
        reason: `⏱️ تأخير (${inc.deductionMinutes || 0} د)`,
        amount: amt,
        deductionMinutes: inc.deductionMinutes || 0,
        source: 'late_incident'
      });
    });

    // C. adjustments
    (state.adjustments || []).forEach(a => {
      if (!a || (String(a.employeeId) !== String(empId) && a.employeeId !== 'all')) return;
      if (a.type !== 'deduction' && a.type !== 'penalty') return;
      if (a.date && !(a.date >= '2026-09-21' && a.date <= '2026-10-20') && !a.date.startsWith(selectedMonth)) return;

      list.push({
        id: a.id,
        date: a.date,
        reason: a.reason || a.description || 'خصم مباشر',
        amount: parseFloat(a.amount) || 0,
        source: 'adjustment'
      });
    });

    return list;
  };

  // 2. Replicate EmployeePortalView deductions logic for each employee (all branches mode)
  // From EmployeePortalView.jsx lines 1600-1730:
  const getPortalPenaltiesForEmp = (empId) => {
    const emp = employees.find(e => String(e.id) === String(empId));
    if (!emp) return [];
    const filterFn = (d) => d && ((d >= '2026-09-21' && d <= '2026-10-20') || d.startsWith(selectedMonth));
    const map = new Map();

    // A. Adjustments
    (state.adjustments || [])
      .filter(a => (String(a.employeeId) === String(empId) || a.employeeId === 'all') && filterFn(a.date))
      .forEach(a => {
        if (a.type === 'deduction' || a.type === 'penalty') {
          map.set(String(a.id), {
            id: a.id,
            date: a.date,
            reason: a.reason || a.description || 'خصم مباشر',
            amount: parseFloat(a.amount) || 0,
            source: 'adjustment'
          });
        }
      });

    // B. Requests
    (state.requests || [])
      .filter(r => {
        if (String(r.employeeId) !== String(empId)) return false;
        if (r.status === 'cancelled' || r.status === 'rejected') return false;
        if (r.type !== 'penalty' && r.type !== 'disciplinary_penalty') return false;
        return filterFn(r.date || r.createdAt?.slice(0, 10));
      })
      .forEach(r => {
        const amt = parseFloat(r.amount || r.impactVal) || 0;
        map.set(String(r.id), {
          id: r.id,
          date: r.date || r.createdAt?.slice(0, 10),
          reason: r.reason || r.ruleTitle || 'جزاء إداري',
          amount: amt,
          source: 'request'
        });
      });

    // C. Late incidents
    (state.lateIncidents || [])
      .filter(inc => {
        if (String(inc.employeeId) !== String(empId)) return false;
        if (inc.status === 'cancelled' || inc.isCancelled || inc.status === 'approved_permission_exempt' || inc.actionType === 'grace') return false;
        if (inc.objection?.status === 'approved') return false;
        if (isApprovedPermissionForDate(empId, inc.date, state)) return false;
        if ((inc.deductionMinutes || 0) <= 0 && (inc.penaltyAmount || 0) <= 0) return false;
        return filterFn(inc.date);
      })
      .forEach(inc => {
        const dynamicAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
        const amt = dynamicAmt > 0 ? dynamicAmt : (parseFloat(inc.penaltyAmount) || 0);
        const lateId = `late_inc_${inc.id}`;
        if (!map.has(lateId)) {
          map.set(lateId, {
            id: lateId,
            date: inc.date,
            reason: `⏱️ تأخير (${inc.deductionMinutes || 0} د)`,
            amount: amt,
            deductionMinutes: inc.deductionMinutes || 0,
            source: 'late_incident'
          });
        }
      });

    return Array.from(map.values());
  };

  let discrepanciesCount = 0;
  employees.forEach(emp => {
    const adminList = getAdminPenaltiesForEmp(emp.id);
    const portalList = getPortalPenaltiesForEmp(emp.id);

    if (adminList.length > 0 || portalList.length > 0) {
      const adminSum = adminList.reduce((s, p) => s + p.amount, 0);
      const portalSum = portalList.reduce((s, p) => s + p.amount, 0);
      const match = adminList.length === portalList.length && Math.abs(adminSum - portalSum) < 0.05;

      console.log(`[${emp.code}] ${emp.name}: Admin=${adminList.length} items (${adminSum.toFixed(2)} EGP) | Portal=${portalList.length} items (${portalSum.toFixed(2)} EGP) -> ${match ? '✅ MATCH' : '❌ MISMATCH'}`);

      if (!match) {
        discrepanciesCount++;
        console.log('   Admin items:', adminList.map(a => `${a.date}: ${a.reason} (${a.amount}) [${a.source}]`));
        console.log('   Portal items:', portalList.map(p => `${p.date}: ${p.reason} (${p.amount}) [${p.source}]`));
      }
    }
  });

  console.log(`\nTotal discrepancies found: ${discrepanciesCount}`);
}

main().catch(console.error);
