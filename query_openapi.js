const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.log("Missing Supabase variables");
  process.exit(1);
}

const url = `${supabaseUrl}/rest/v1/`;
const options = {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const doc = JSON.parse(data);
      console.log("=== TABLE NAMES ===");
      if (doc.paths) {
        const paths = Object.keys(doc.paths);
        console.log("Exposed REST paths:", paths);
      } else {
        console.log("Unexpected response format:", Object.keys(doc));
      }
    } catch (e) {
      console.log("Error parsing JSON:", e.message, data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.log("Error fetching:", err.message);
});
