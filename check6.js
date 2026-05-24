const { execSync } = require('child_process');
try { console.log(execSync('df -h').toString()); } catch(e) {}
