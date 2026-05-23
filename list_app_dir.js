const fs = require('fs');
try {
  console.log("App entries:", fs.readdirSync('/app'));
} catch (e) {
  console.log("Error:", e.message);
}
