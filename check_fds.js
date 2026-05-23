const fs = require('fs');
const { execSync } = require('child_process');

try {
  console.log("=== FDS OF PID 6 ===");
  const fds = fs.readdirSync('/proc/6/fd');
  for (const fd of fds) {
    try {
      const link = fs.readlinkSync(`/proc/6/fd/${fd}`);
      console.log(`${fd} -> ${link}`);
    } catch(e) {}
  }
} catch (e) {
  console.log("Error PID 6:", e.message);
}

try {
  console.log("=== PS AUX ===");
  console.log(execSync('ps aux', { encoding: 'utf8' }));
} catch (e) {}
