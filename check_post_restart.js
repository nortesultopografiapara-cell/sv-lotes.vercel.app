const fs = require('fs');
const path = require('path');

console.log("=== CHECKING FILES AGAIN AFTER DEV SERVER START ===");
function findTSX(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.next') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
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
findTSX('/app/applet');
console.log("=== FINISHED SCAN ===");
