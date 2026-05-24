const { execSync } = require('child_process');
try { console.log(execSync('find / -name "page.tsx" -type f 2>/dev/null').toString()); } catch(e) {}
