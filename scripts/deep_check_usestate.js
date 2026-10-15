import fs from 'fs';
import path from 'path';

function checkFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  if (!code.includes('useState')) return;

  // Does it call bare useState?
  const callsBareUseState = /(?<!\.)\buseState\s*\(/.test(code);
  if (!callsBareUseState) return;

  // Does it explicitly import useState?
  // import ... { ... useState ... } from 'react'
  const hasNamedImport = /import\s+[^;]*\{[^}]*\buseState\b[^}]*\}[^;]*from\s+['"]react['"]/.test(code);
  const hasDestructure = /const\s+\{[^}]*\buseState\b[^}]*\}\s*=\s*React/.test(code);
  const hasLocalDef = /(?:const|let|var)\s+\buseState\b/.test(code);

  if (!hasNamedImport && !hasDestructure && !hasLocalDef) {
    console.log(`[FOUND MISSING useState IMPORT]: ${file}`);
  }
}

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== 'dist' && item.name !== '.git') {
        walk(full);
      }
    } else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
      checkFile(full);
    }
  }
}

console.log('Scanning for files that call bare useState without named import...');
walk('src');
console.log('Done.');
