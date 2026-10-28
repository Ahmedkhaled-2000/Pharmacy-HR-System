const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') {
        searchDir(full);
      }
    } else if (f.endsWith('.js') || f.endsWith('.jsx')) {
      const txt = fs.readFileSync(full, 'utf8');
      if (txt.includes('إجمالي الخصم المالي') || txt.includes('دقيقة =')) {
        console.log('Found match in:', full);
      }
    }
  }
}

searchDir('src');
console.log('Search completed.');
