const { execSync } = require('child_process');
try {
  console.log("=== GIT SYSTEM ===");
  try {
    console.log(execSync('git config --list', { encoding: 'utf8' }));
  } catch (e) {
    console.log("git config error:", e.message);
  }
  try {
    console.log(execSync('git status', { encoding: 'utf8' }));
  } catch (e) {
    console.log("git status error:", e.message);
  }
} catch (e) {
  console.log("Error:", e.message);
}
