const fs = require('fs');
const path = require('path');

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f === 'node_modules' || f === '.next' || f === '.git') continue;
      const full = path.join(dir, f);
      console.log(full);
      try {
        if (fs.statSync(full).isDirectory()) {
          scan(full);
        }
      } catch (e) {}
    }
  } catch(e) {}
}

console.log("=== SCANNING /app ===");
scan('/app');
console.log("=== DONE ===");
