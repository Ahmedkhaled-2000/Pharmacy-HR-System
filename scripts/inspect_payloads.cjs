const fs = require('fs');
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));
const req = state.requests.find(r => r.id === 'roster_req_emp_1789231413527_1792590931133_r97e');
console.log('Request:', {
  id: req?.id,
  type: req?.type,
  status: req?.status,
  adminApproved: req?.adminApproved,
  branchApproved: req?.branchApproved,
  isCancelled: req?.isCancelled,
  branchId: req?.branchId,
  branchName: req?.branchName,
  sched22: req?.schedule ? req.schedule['2026-10-22'] : null,
  sched25: req?.schedule ? req.schedule['2026-10-25'] : null,
  sched27: req?.schedule ? req.schedule['2026-10-27'] : null
});
