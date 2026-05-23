const fs = require('fs');
const path = require('path');

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
         console.log("Subdir:", fullPath);
         scan(fullPath);
      } else {
         console.log("File:", fullPath);
      }
    }
  } catch (e) {
    console.log("Error reading directory", dir, e.message);
  }
}
console.log("=== SCANNING /app/applet/app ===");
scan('/app/applet/app');
