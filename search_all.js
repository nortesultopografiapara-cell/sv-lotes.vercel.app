const fs = require('fs');
const path = require('path');

console.log("=== SCAN FROM /app/applet ===");
try {
  const files = fs.readdirSync('.');
  console.log("Files:", files);
} catch (e) {
  console.log("Error readdirSync('.')", e.message);
}

console.log("=== SEARCH ALL FILE SYSTEM (recursively) ===");
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
         // only go deep in certain folders to avoid hanging
         if (dir === '/' && !['app', 'home', 'root', 'workspace', 'tmp'].includes(file)) {
            continue;
         }
         scan(fullPath);
      } else {
        if (file === 'GISMap.tsx' || file === 'page.tsx' || file === 'package.json') {
          console.log("Found file:", fullPath);
        }
      }
    }
  } catch (e) {
    // skip
  }
}

scan('/');
console.log("=== FINISHED SEARCH ===");
