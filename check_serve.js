const fs = require('fs');
try {
  const stat = fs.lstatSync('/serve');
  console.log('/serve isSymbolicLink:', stat.isSymbolicLink());
  if (stat.isSymbolicLink()) {
    console.log('/serve target:', fs.readlinkSync('/serve'));
  } else {
    console.log('/serve size:', stat.size);
  }
} catch (e) {
  console.log('Error lstat /serve:', e.message);
}
