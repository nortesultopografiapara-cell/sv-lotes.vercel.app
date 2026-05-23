const fs = require('fs');
try {
  console.log("Root files/dirs:", fs.readdirSync('/'));
} catch (e) {
  console.log("Error:", e.message);
}
