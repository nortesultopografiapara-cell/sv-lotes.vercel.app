const fs = require('fs');
const path = require('path');

console.log("=== SCANNING /workspace ===");
function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        console.log("Workspace File:", fullPath);
      }
    }
  } catch (e) {
    console.log("Error reading", dir, e.message);
  }
}
scan('/workspace');
console.log("=== DONE SCANNING /workspace ===");
