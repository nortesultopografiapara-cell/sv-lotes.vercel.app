const fs = require('fs');
try {
  console.log("Files in /root:", fs.readdirSync('/root'));
  console.log("Files in /app:", fs.readdirSync('/app'));
} catch (e) {
  console.log("Error:", e.message);
}
