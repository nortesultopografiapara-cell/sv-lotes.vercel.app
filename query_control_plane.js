const http = require('http');

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: path,
      method: 'GET',
      headers: headers
    };
    http.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("=== TRYING TO FETCH FROM CONTROL PLANE ON PORT 8000 ===");
  try {
    const paths = ['/health', '/api/v1/files', '/api/files', '/files', '/api/v1/status', '/api/status'];
    for (const path of paths) {
      console.log(`\n--- Fetching ${path} ---`);
      const res = await request(path);
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      console.log(`Body (first 500 chars):`, res.body.substring(0, 500));
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
