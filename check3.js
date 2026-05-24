const fs = require('fs');
try { console.log('/:', fs.readdirSync('/')); } catch(e) { }
try { console.log('/app:', fs.readdirSync('/app')); } catch(e) {}
