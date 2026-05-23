const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.log("Missing Supabase Url or Key in environment");
  process.exit(1);
}

function getSupabaseData(table) {
  return new Promise((resolve, reject) => {
    const url = `${supabaseUrl}/rest/v1/${table}?select=*&limit=10`;
    const options = {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Status: ${res.statusCode} - ${data}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("=== PURE HTTPS SUPABASE FETCH ===");
  const tables = ['projects', 'lots', 'contracts', 'config', 'settings'];
  for (const table of tables) {
    try {
      console.log(`\n--- Fetching from ${table} ---`);
      const data = await getSupabaseData(table);
      console.log(`Success! Found ${data.length} records:`);
      console.log(JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`Error on ${table}:`, e.message);
    }
  }
}

run();
