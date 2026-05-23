const fs = require('fs');
try {
  console.log("=== START.SH ===");
  console.log(fs.readFileSync('/app/start.sh', 'utf8'));
} catch (e) {
  console.log("Error reading start.sh:", e.message);
}
