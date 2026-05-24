import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking bucket...");
  const { data, error } = await supabase.storage.getBucket('company-assets');
  if (error && error.message.includes('not found')) {
    console.log("Bucket not found, creating it...");
    const { error: createError } = await supabase.storage.createBucket('company-assets', { public: true });
    if (createError) {
      console.error("Error creating bucket:", createError);
    } else {
      console.log("Bucket created successfully.");
    }
  } else if (error) {
    console.error("Other error:", error);
  } else {
    console.log("Bucket exists. Making sure it is public.");
    await supabase.storage.updateBucket('company-assets', { public: true });
  }

  // we can also create contract_templates using rest api or by creating an api route and calling it
}
run();
