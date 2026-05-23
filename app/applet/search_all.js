const fs = require('fs');
const path = require('path');

console.log("=== SEARCH ALL FILE SYSTEM ===");
const ignoreDirs = new Set(['proc', 'sys', 'dev', 'node_modules', '.next', '.git', 'etc', 'lib', 'lib64', 'var', 'bin', 'sbin', 'usr', 'boot']);

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (ignoreDirs.has(file)) continue;
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        if (file === 'GISMap.tsx' || file === 'page.tsx' || file.endsWith('.tsx') || file === 'package.json') {
          console.log("Found:", fullPath);
        }
      }
    }
  } catch (e) {
    // skip
  }
}

scan('/');
console.log("=== FINISHED SEARCH ===");
