const fs = require('fs');
try {
  console.log("Opt entries:", fs.readdirSync('/opt'));
} catch (e) {
  console.log("Error:", e.message);
}
