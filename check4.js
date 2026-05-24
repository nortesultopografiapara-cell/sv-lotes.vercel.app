const fs = require('fs');
try { console.log('workspace:', fs.readdirSync('/workspace')); } catch(e) {}
