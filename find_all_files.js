const fs = require('fs');
const path = require('path');

const ignore = new Set(['.next', 'node_modules', '.git', 'proc', 'sys', 'dev', 'lib', 'lib64', 'bin', 'sbin', 'usr', 'var', 'etc']);

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (ignore.has(f)) continue;
      const full = path.join(dir, f);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
         scan(full);
      } else {
         if (f.endsWith('.tsx') || f.endsWith('.ts') || f === 'package.json') {
           console.log(full);
         }
      }
    }
  } catch (e) {}
}

scan('/');
console.log("=== SCAN DONE ===");
