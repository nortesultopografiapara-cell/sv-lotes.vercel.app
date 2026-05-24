const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS rg VARCHAR(50);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profession VARCHAR(100);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS marital_status VARCHAR(50);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS civil_state VARCHAR(50);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS city VARCHAR(100);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state VARCHAR(50);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS state_uf VARCHAR(10);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cep VARCHAR(20);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_id UUID;
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id UUID;
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS project_id UUID;
    ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS customer_id UUID;
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_id UUID;
  ` });
  console.log('Result:', error || 'OK');
}
check();
