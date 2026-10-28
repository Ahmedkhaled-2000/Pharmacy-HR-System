const fs = require('fs');
const path = require('path');

const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') walk(full);
    } else if (full.endsWith('.js') || full.endsWith('.jsx')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes('dailyRate')) files.push(full);
    }
  }
}
walk('src');

console.log('Files with dailyRate:', files.length);

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Look for standalone dailyRate variable usage
    const regex = /(^|[^a-zA-Z0-9_$.])dailyRate([^a-zA-Z0-9_$:(]|$)/;
    if (regex.test(line)) {
      const trimmed = line.trim();
      if (
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.includes('const dailyRate') &&
        !trimmed.includes('let dailyRate') &&
        !trimmed.includes('var dailyRate') &&
        !trimmed.includes('dailyRate =') &&
        !trimmed.includes('dailyRate:') &&
        !trimmed.includes('dailyRate?') &&
        !trimmed.includes('passedDailyRate')
      ) {
        console.log(`${path.basename(f)}:${idx + 1}: ${trimmed}`);
      }
    }
  });
});
