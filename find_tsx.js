const fs = require('fs');
const path = require('path');

console.log("=== SCANNING FOR TSX FILES IN THE SYSTEM ===");
function findTSX(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.next' || file === 'proc' || file === 'sys' || file === 'dev') continue;
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        findTSX(fullPath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        console.log("Found:", fullPath);
      }
    }
  } catch (e) {
    // ignore
  }
}
findTSX('/');
console.log("=== FINISHED SCAN ===");
