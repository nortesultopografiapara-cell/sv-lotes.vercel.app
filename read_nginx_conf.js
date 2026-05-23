const fs = require('fs');
try {
  console.log("=== NGINX CONF ===");
  console.log(fs.readFileSync('/etc/nginx/nginx.conf', 'utf8'));
} catch (e) {
  console.log("Error:", e.message);
}
