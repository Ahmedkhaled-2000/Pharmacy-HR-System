import fs from 'fs';
import path from 'path';

function scanDir(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const f of files) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'node_modules' && f.name !== 'dist' && f.name !== '.git') {
        scanDir(full);
      }
    } else if (f.name.endsWith('.jsx') || f.name.endsWith('.js')) {
      const code = fs.readFileSync(full, 'utf8');
      if (code.includes('useState')) {
        const hasUseStateImport = /import\s+[^;]*\buseState\b[^;]*from/.test(code) || /const\s+[^;]*\buseState\b/.test(code) || /React\.useState/.test(code);
        const callsUseState = /\buseState\s*\(/.test(code);
        if (callsUseState && !hasUseStateImport) {
          console.log('MISSING useState import in:', full);
        }
      }
    }
  }
}

console.log('Scanning all src...');
scanDir('src');
console.log('Scan completed.');
