const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRuntime() {
    const { data, error } = await supabase.from('finance_receipts')
        .select(`
               *,
               customers!finance_receipts_customer_id_fkey(*),
               sales:sale_id(id, installments_count, projects(name), contracts(contract_number)),
               projects:project_id(*),
               blocks:block_id(*)
        `)
        .limit(1);
    
    console.log("Error:", error);
    console.log("Data:", JSON.stringify(data, null, 2));
}

testRuntime();
