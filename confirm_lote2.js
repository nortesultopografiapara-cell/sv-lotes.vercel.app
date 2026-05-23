const https = require('https');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fetch(path) {
  return new Promise((resolve, reject) => {
    const url = `${supabaseUrl}/rest/v1/${path}`;
    const options = {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
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
    const blocks = await fetch('blocks?lot_number=eq.2&block_name=eq.01&limit=1');
    console.log("=== CONFIRMATION OF LOTE 2 VALUES ===");
    console.log(JSON.stringify(blocks, null, 2));
  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
