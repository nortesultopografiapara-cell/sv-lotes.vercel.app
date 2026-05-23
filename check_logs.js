const fs = require('fs');
const path = require('path');

console.log("=== SCANNING /var/log ===");
function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
         scan(fullPath);
      } else {
         console.log("Log Resource:", fullPath);
         if (file.endsWith('.log')) {
           try {
             const content = fs.readFileSync(fullPath, 'utf8');
             console.log(`--- Content of ${fullPath} ---`);
             console.log(content.substring(content.length - 2000));
           } catch (e) {
             console.log("Error reading file", fullPath, e.message);
           }
         }
      }
    }
  } catch(e) {
    console.log("Error scanning", dir, e.message);
  }
}
scan('/var/log');
console.log("=== DONE SCANNING /var/log ===");
