const fs = require('fs');
const path = require('path');

function listRecursive(dir, depth = 0) {
  if (depth > 4) return;
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const full = path.join(dir, f);
      console.log(' '.repeat(depth * 2) + '- ' + f + (fs.statSync(full).isDirectory() ? '/' : ''));
      if (fs.statSync(full).isDirectory() && f !== 'node_modules' && f !== '.next' && f !== '.git') {
        listRecursive(full, depth + 1);
      }
    }
  } catch(e) {
    console.log("Error at " + dir + ": " + e.message);
  }
}

console.log("=== Listing /app ===");
listRecursive('/app');
console.log("=== Listing process.cwd() ===");
listRecursive(process.cwd());
