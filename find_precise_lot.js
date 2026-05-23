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
    const blocks1 = await fetch('blocks?frente=eq.38.05');
    console.log("=== BLOCKS WITH frente = 38.05 ===");
    console.log(JSON.stringify(blocks1, null, 2));

    const projects = await fetch('projects');
    console.log("\n=== ALL PROJECTS IN DATABASE ===");
    console.log(JSON.stringify(projects.map(p => ({ id: p.id, name: p.name })), null, 2));
  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
