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
    // Let's find blocks associated with Martine projects
    console.log("=== LOTEAMENTO MARTINE II BLOCKS ===");
    
    // Project IDs: '11d51bc2-560b-4ce2-bc9f-354a72a99faf' and '9087e9c2-3ede-40ed-be01-71273f04ba34'
    const projectIds = ['11d51bc2-560b-4ce2-bc9f-354a72a99faf', '9087e9c2-3ede-40ed-be01-71273f04ba34'];
    for (const pid of projectIds) {
      console.log(`\n--- Project ${pid} ---`);
      const blocks = await fetch(`blocks?project_id=eq.${pid}&limit=10`);
      console.log(`Lots count in DB: ${blocks.length}`);
      if (blocks.length > 0) {
        console.log("Sample blocks:", JSON.stringify(blocks.slice(0, 3), null, 2));
      }
    }

  } catch(e) {
    console.log("Error during query:", e.message);
  }
}

run();
