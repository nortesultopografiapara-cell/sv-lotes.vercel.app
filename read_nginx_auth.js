const fs = require('fs');
try {
  console.log("=== NGINX AUTH INCLUDE ===");
  try {
    console.log(fs.readFileSync('/etc/nginx/nginx_auth.conf.include', 'utf8'));
  } catch (e) {
    console.log("Error:", e.message);
  }

  console.log("\n=== USER AUTH VERIFICATION LUA ===");
  try {
    console.log(fs.readFileSync('/etc/nginx/user_auth_verification.lua', 'utf8'));
  } catch (e) {
    console.log("Error:", e.message);
  }
} catch (e) {
  console.log("Error:", e.message);
}
