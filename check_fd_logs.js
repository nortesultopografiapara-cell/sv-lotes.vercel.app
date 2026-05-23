const fs = require('fs');
try {
  const fds = fs.readdirSync('/proc/6/fd');
  console.log("Fds for pid 6:", fds);
  for (const fd of fds) {
    try {
      const link = fs.readlinkSync(`/proc/6/fd/${fd}`);
      console.log(`  fd ${fd} -> ${link}`);
    } catch (e) {
      console.log(`  fd ${fd} error: ${e.message}`);
    }
  }
} catch (e) {
  console.log("Error:", e.message);
}
