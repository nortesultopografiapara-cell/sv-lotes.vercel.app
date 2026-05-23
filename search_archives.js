const fs = require('fs');
const path = require('path');

const ignoreRoots = new Set(['/proc', '/sys', '/dev', '/lib', '/lib32', '/lib64', '/libx32', '/bin', '/sbin', '/usr/share', '/usr/lib', '/usr/lib64', '/usr/include']);

function search(dir, depth = 0) {
  if (depth > 6) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (ignoreRoots.has(fullPath)) continue;
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        search(fullPath, depth + 1);
      } else {
        if (file.endsWith('.zip') || file.endsWith('.tar') || file.endsWith('.tgz') || file.endsWith('.tar.gz') || file.endsWith('.rar')) {
          console.log("FOUND ARCHIVE:", fullPath);
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

search('/');
console.log("=== DONE SEARCHING ARCHIVES ===");
