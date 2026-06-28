const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const {
  FINANCE_RECEIPTS_LIST_SELECT,
} = require('./lib/finance/financeReceiptsEmbed');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRuntime() {
    const { data, error } = await supabase.from('finance_receipts')
        .select(FINANCE_RECEIPTS_LIST_SELECT)
        .limit(1);
    
    console.log("Error:", error);
    console.log("Data:", JSON.stringify(data, null, 2));
}

testRuntime();
