const fs = require('fs');
const path = require('path');

console.log("=== ROOT UNRESTRICTED SEARCH ===");
const ignoreRoots = new Set(['/proc', '/sys', '/dev', '/lib', '/lib32', '/lib64', '/libx32', '/bin', '/sbin', '/usr/share', '/usr/lib', '/usr/lib64', '/usr/include']);

const found = [];

function search(dir, depth = 0) {
  if (depth > 6) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.next' || file === '.git') continue;
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
        if (file === 'page.tsx' || file === 'GISMap.tsx' || (file === 'package.json' && !fullPath.includes('yarn-v1'))) {
          found.push(fullPath);
          console.log("FOUND:", fullPath);
        }
      }
    }
  } catch (e) {
    // ignore
  }
}

search('/');
console.log("Found files:", found);
console.log("=== FINISHED ===");
