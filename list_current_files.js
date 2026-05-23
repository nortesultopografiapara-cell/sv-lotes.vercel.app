const fs = require('fs');

console.log("=== CHECKING FILES UNDER ROOT / ===");
try {
  console.log("Root files:", fs.readdirSync('/'));
} catch (e) {
  console.log("Error:", e.message);
}

console.log("=== CHECKING FILES UNDER /app/applet ===");
try {
  console.log("Applet files:", fs.readdirSync('/app/applet'));
} catch (e) {
  console.log("Error:", e.message);
}
