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
    const contracts = await fetch('contracts');
    console.log(`Total contracts found: ${contracts.length}`);
    const martineContracts = contracts.filter(c => c.project_name_snapshot && c.project_name_snapshot.includes('MARTINE'));
    console.log(`Martine contracts found: ${martineContracts.length}`);
    if (martineContracts.length > 0) {
      console.log(JSON.stringify(martineContracts, null, 2));
    } else {
      console.log("No contracts found with MARTINE in project_name_snapshot.");
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

run();
