const fs = require('fs');
const path = require('path');

console.log("=== SCAN /tmp ===");
function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        console.log("Tmp File:", fullPath);
      }
    }
  } catch (e) {
    // ignore
  }
}
scan('/tmp');
console.log("=== DONE SCAN /tmp ===");
