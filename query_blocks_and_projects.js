const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fetch(path) {
  return new Promise((resolve, reject) => {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const options = {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error(`HTML/text response: ${data.substring(0, 500)}`));
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  try {
    console.log("=== COMPANIES ===");
    console.log(await fetch('companies?limit=2'));

    console.log("=== PROJECTS ===");
    console.log(await fetch('projects?limit=2'));

    console.log("=== BLOCKS ===");
    console.log(await fetch('blocks?limit=2'));

    console.log("=== SALES ===");
    console.log(await fetch('sales?limit=2'));

    console.log("=== STREET GUIDES ===");
    console.log(await fetch('street_guides?limit=2'));

  } catch(e) {
    console.log("Error during query:", e.message);
  }
}

run();
