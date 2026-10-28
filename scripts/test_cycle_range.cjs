import fs from 'fs';
const state = JSON.parse(fs.readFileSync('scratch_live_state.json', 'utf8'));

function getCycleForDate(dateStr) {
  if (!dateStr || dateStr.length < 10) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (d >= 21) {
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

const dates = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
const cycles = new Set(dates.map(getCycleForDate));
console.log('Target cycles for dates:', Array.from(cycles));
// All dates are in 2026-11!
