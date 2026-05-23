const https = require('https');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const url = `${supabaseUrl}/rest/v1/`;
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
      const doc = JSON.parse(data);
      if (doc.paths) {
        console.log("Paths found:", Object.keys(doc.paths).filter(p => !p.includes('{id}')));
      } else {
        console.log("Raw doc keys:", Object.keys(doc));
      }
    } catch(e) {
      console.log("Parsing error:", e.message, data.substring(0, 400));
    }
  });
});
