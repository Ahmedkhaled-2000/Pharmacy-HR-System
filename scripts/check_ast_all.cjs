const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const files = [];
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') walk(full);
    } else if (full.endsWith('.js') || full.endsWith('.jsx')) {
      files.push(full);
    }
  }
}
walk('src');

const standardGlobals = new Set([
  'window', 'document', 'navigator', 'console', 'localStorage', 'sessionStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'Headers',
  'Request', 'Response', 'FormData', 'Blob', 'File', 'FileReader', 'URL', 'URLSearchParams',
  'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'Promise', 'Map',
  'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
  'alert', 'confirm', 'prompt', 'Intl', 'btoa', 'atob', 'performance', 'location',
  'history', 'screen', 'Image', 'Audio', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'crypto', 'process', 'global', 'Buffer', 'requestAnimationFrame', 'cancelAnimationFrame',
  'CustomEvent', 'Event', 'EventSource', 'WebSocket', 'Worker', 'indexedDB', 'open', 'close',
  'focus', 'blur', 'print', 'scrollTo', 'scrollBy', 'undefined', 'NaN', 'Infinity'
]);

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    });

    traverse(ast, {
      Identifier(p) {
        const name = p.node.name;
        if (standardGlobals.has(name)) return;
        if (p.isReferencedIdentifier()) {
          const binding = p.scope.getBinding(name);
          if (!binding) {
            // Check if it's a global or JSX element or imported
            // Ignore React if in JSX
            if (name === 'React') return;
            console.log(`[UNDECLARED ${name}] in ${file}:${p.node.loc?.start.line}`);
          }
        }
      }
    });
  } catch (err) {
    // Ignore parse errors or report them
  }
}
