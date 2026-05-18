import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("No credentials found in process.env, maybe you need to load them?");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking bucket 'company-assets'...");
  const { data, error } = await supabase.storage.getBucket('company-assets');
  if (error && error.message.includes('not found')) {
    console.log("Creating bucket 'company-assets'...");
    const { error: createError } = await supabase.storage.createBucket('company-assets', { public: true });
    if (createError) console.error("Error creating bucket:", createError);
    else console.log("Created successfully!");
  } else if (error) {
    console.error("Error fetching bucket:", error);
  } else {
    console.log("Bucket already exists.");
    const { error: updateError } = await supabase.storage.updateBucket('company-assets', { public: true });
    if (updateError) console.error("Error updating bucket:", updateError);
    else console.log("Updated bucket successfully.");
  }
}

run();
