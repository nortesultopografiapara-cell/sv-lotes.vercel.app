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
    const query = 'blocks?block_name=in.("01","03")&lot_number=in.("2","12","14","31")';
    const data = await fetch(query);
    console.log(`Found ${data.length} lots:`);
    const formatted = data.map(l => ({
      id: l.id,
      block_name: l.block_name,
      lot_number: l.lot_number,
      frente: l.frente,
      fundo: l.fundo,
      lado_direito: l.lado_direito,
      lado_esquerdo: l.lado_esquerdo,
      area: l.area
    }));
    console.log(JSON.stringify(formatted, null, 2));
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
