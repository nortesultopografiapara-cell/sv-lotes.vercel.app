const fs = require('fs');
const path = require('path');

function scan(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.next' || file === '.git' || file === 'dist') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        console.log("File:", fullPath);
      }
    }
  } catch (e) {
    console.log("Error reading directory", dir, e.message);
  }
}

scan('app');
