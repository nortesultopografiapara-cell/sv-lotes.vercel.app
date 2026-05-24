const fs = require('fs');
console.log('CWD:', process.cwd());
console.log('DEV:', fs.readdirSync('/dev').length);
