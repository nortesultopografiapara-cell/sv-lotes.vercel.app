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
    const pid = '9087e9c2-3ede-40ed-be01-71273f04ba34';
    const lots = await fetch(`blocks?project_id=eq.${pid}`);
    console.log(`=== ALL LOTS FOR PROJECT LOTEAMENTO MARTINE II E SAMIA (Total ${lots.length}) ===`);
    for (const lot of lots) {
      console.log(`Lote ${lot.lot_number} (Quadra ${lot.block_name}):`);
      console.log(`  Area: ${lot.area}, Price: ${lot.price}`);
      console.log(`  Frente: ${lot.frente}, Fundo: ${lot.fundo}, Dir: ${lot.lado_direito}, Esq: ${lot.lado_esquerdo}`);
      console.log(`  Frente Oficial: ${lot.frente_oficial}, Fundo Oficial: ${lot.fundo_oficial}, Dir Oficial: ${lot.dir_oficial}, Esq Oficial: ${lot.esq_oficial}`);
    }
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
