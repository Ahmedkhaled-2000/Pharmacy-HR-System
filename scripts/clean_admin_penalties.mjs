import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const apiUrl = process.env.VITE_API_URL || 'https://169-58-214-20.sslip.io/api';

async function main() {
  console.log('1. Fetching live state from VPS API...');
  const res = await fetch(`${apiUrl}/settings?key=pharmacy-tracker-data`);
  const json = await res.json();
  if (!json.success || !json.value) {
    throw new Error('Failed to fetch pharmacy-tracker-data');
  }

  const state = json.value;
  const timestamp = Date.now();

  // 2. Save full local backup
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `backup_before_admin_penalties_cleanup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(state, null, 2), 'utf8');
  console.log(`2. Full local backup saved to: ${backupPath}`);

  const existingDeleted = new Set((state._deletedIds || []).map(String));
  const removedAdjIds = [];
  const cancelledReqIds = [];

  // 3. Clean Adjustments (Remove administrative & inventory shortage adjustments, preserve loans, meds, bonuses, lateness)
  const cleanedAdjustments = (state.adjustments || []).filter(a => {
    if (!a) return false;
    const aId = String(a.id || '');

    // Loans and meds must be preserved
    const isLoanOrMeds = a.isLoan || a.loanId || a.type === 'loan' || a.type === 'loan_installment' || a.type === 'meds' ||
      (a.reason && (a.reason.includes('سلفة') || a.reason.includes('أدوية') || a.reason.includes('قسط')));
    if (isLoanOrMeds) return true;

    // Bonuses must be preserved
    if (a.type === 'bonus' || a.type === 'مكافأة') return true;

    // Lateness adjustments (if any exist) must be preserved
    const isLateness = aId.startsWith('adj_late_') || a.source === 'late_penalty_engine' || (a.reason && a.reason.includes('تأخير'));
    if (isLateness) return true;

    // Administrative penalties, disciplinary deductions, inventory shortages
    const isShortage = a.type === 'shortage' || a.isInventoryShortage || aId.startsWith('adj-inv-shortage-') ||
      (a.reason && (a.reason.includes('عجز') || a.reason.includes('جرد')));
    const isDisciplinaryOrAdmin = a.type === 'penalty' || a.type === 'deduction' || a.type === 'خصم' ||
      aId.startsWith('adj_pen_') || aId.startsWith('adj_disc_') || a.subType === 'disciplinary_penalty' ||
      (a.reason && (a.reason.includes('جزاء') || a.reason.includes('مخالفة') || a.reason.includes('تأديبي')));

    if (isShortage || isDisciplinaryOrAdmin) {
      removedAdjIds.push(aId);
      const raw = aId.replace(/^(adj_|req_|late_inc_|adj_pen_|adj_disc_|pen_|disc_)/, '');
      [aId, raw, `adj_${raw}`, `adj_pen_${raw}`, `adj_disc_${raw}`, `req_${raw}`, `disc_${raw}`].forEach(k => {
        if (k) existingDeleted.add(k);
      });
      return false; // Remove from adjustments
    }

    return true;
  });

  // 4. Clean Requests (Cancel administrative penalties and disciplinary requests, KEEP ALL lateness/attendance requests)
  const cleanedRequests = (state.requests || []).map(r => {
    if (!r) return r;
    const rId = String(r.id || '');

    // PRESERVE all lateness / attendance requests
    const isLateOrAttendance = (
      rId.startsWith('req_late_inc_') ||
      rId.startsWith('req_late_') ||
      rId.startsWith('late_inc_') ||
      rId.startsWith('req_early_') ||
      r.type === 'lateness' ||
      r.type === 'late_penalty' ||
      r.type === 'early_exit' ||
      r.subType === 'lateness' ||
      r.subType === 'early_exit' ||
      r.source === 'late_penalty_engine' ||
      r.source === 'system_lateness' ||
      (typeof r.ruleTitle === 'string' && r.ruleTitle.includes('تأخير')) ||
      (typeof r.reason === 'string' && (r.reason.includes('تأخر الموظف') || r.reason.includes('جزاء تأخير')))
    );
    if (isLateOrAttendance) {
      return r; // KEEP INTACT!
    }

    // Cancel disciplinary and shortage requests
    const isDiscOrShortage = (
      r.type === 'disciplinary_penalty' ||
      r.subType === 'disciplinary_penalty' ||
      r.type === 'shortage' ||
      rId.startsWith('disc_') ||
      (r.type === 'penalty' && r.subType !== 'lateness') ||
      (r.type === 'deduction' && !r.reason?.includes('سلفة') && !r.isLoan) ||
      (r.reason && (r.reason.includes('عجز') || r.reason.includes('جرد') || r.reason.includes('تأديبي')))
    );

    if (isDiscOrShortage) {
      cancelledReqIds.push(rId);
      const raw = rId.replace(/^(req_|adj_|late_inc_|disc_)/, '');
      [rId, raw, `req_${raw}`, `adj_${raw}`, `adj_disc_${raw}`, `disc_${raw}`].forEach(k => {
        if (k) existingDeleted.add(k);
      });
      return {
        ...r,
        status: 'cancelled',
        isCancelled: true,
        clearedAt: new Date().toISOString()
      };
    }

    return r;
  });

  // 5. Update state
  state.adjustments = cleanedAdjustments;
  state.requests = cleanedRequests;
  state.disciplinaryRecords = [];
  state.disciplinaryDecisions = [];
  state._deletedIds = Array.from(existingDeleted);
  state._adminPenaltiesClearedAt = new Date().toISOString();

  console.log(`3. Adjustments purged (${removedAdjIds.length}):`, removedAdjIds);
  console.log(`4. Requests cancelled (${cancelledReqIds.length}):`, cancelledReqIds);
  console.log(`5. Late incidents preserved: ${(state.lateIncidents || []).filter(i => !i.isCancelled && i.status !== 'cancelled').length}`);

  // 6. Post cleaned state to VPS
  console.log('6. Saving cleaned state to VPS API...');
  const postRes = await fetch(`${apiUrl}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Role': 'admin',
      'X-App-Password': '123',
      'x-device-token': 'desktop-app-sync-token-2026',
      'x-app-version': '1.2.69'
    },
    body: JSON.stringify({ key: 'pharmacy-tracker-data', value: state })
  });

  const postJson = await postRes.json();
  console.log('7. VPS API Response:', postJson);
  if (!postJson.success) {
    throw new Error('Save failed: ' + JSON.stringify(postJson));
  }
  console.log('SUCCESS: All administrative & inventory shortage penalties removed from all employees, with lateness penalties 100% preserved!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
