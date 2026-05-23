const { createClient } = require('@supabase/supabase-client');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== SUPABASE TABLES AND SCHEMAS ===");
  try {
    // List tables using PostgreSQL system views
    const { data, error } = await supabase.rpc('get_tables_info');
    if (error) {
      console.log("RPC get_tables_info failed, trying direct queries:", error.message);
    } else {
      console.log("Tables info:", data);
    }

    // Since RPC might not exist, let's try reading from known tables
    // Common tables: projects, lots, contracts, land_plots, etc.
    const knownTables = ['projects', 'lots', 'contracts', 'clients', 'brokers', 'sellers', 'reports'];
    for (const table of knownTables) {
      try {
        console.log(`\n--- Fetching from: ${table} ---`);
        const { data: records, error: fetchErr } = await supabase.from(table).select('*').limit(3);
        if (fetchErr) {
          console.log(`Failed to fetch from ${table}:`, fetchErr.message);
        } else {
          console.log(`Records in ${table} (count ${records.length}):`, JSON.stringify(records, null, 2));
        }
      } catch (e) {
        console.log(`Exception on table ${table}:`, e.message);
      }
    }
  } catch (err) {
    console.log("General Error:", err.message);
  }
}

run();
