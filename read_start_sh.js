const fs = require('fs');
try {
  console.log("=== START.SH CONTENT ===");
  console.log(fs.readFileSync('/app/start.sh', 'utf8'));
} catch (e) {
  console.log("Error:", e.message);
}
