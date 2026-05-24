const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('blocks').insert([{ 
    tenant_id: 'db35b603-5cd2-43bb-a5a5-4eb8bf08f6eb', 
    project_id: '8647acae-acbf-4a9f-aef6-63e8a6493630', 
    name: "test",
    source_import: "TXT" 
  }]);
  console.log(error);
}
test();
