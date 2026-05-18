const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: cData, error: cErr } = await supabase.from('contracts').select('id').limit(1);
  const { data: fData, error: fErr } = await supabase.from('finance_receipts').select('id').limit(1);
  
  console.log('contracts:', cErr ? cErr.message : 'exists');
  console.log('finance_receipts:', fErr ? fErr.message : 'exists');
}
check();
