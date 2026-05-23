const fs = require('fs');
try {
  console.log("=== DEV.ENV.JSON ===");
  console.log(fs.readFileSync('/app/.dev.env.json', 'utf8'));
} catch (e) {
  console.log("Error:", e.message);
}
