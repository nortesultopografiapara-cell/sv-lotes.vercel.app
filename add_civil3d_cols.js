const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: `
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS block_name VARCHAR(100);
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS number VARCHAR(50);
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS lot_number VARCHAR(50);
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS area DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS perimeter DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS frente DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS fundo DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS lado_direito DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS lado_esquerdo DECIMAL;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS segments_json JSONB;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS coordinates_utm_json JSONB;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS geometry JSONB;
    ALTER TABLE public.blocks ADD COLUMN IF NOT EXISTS source_import VARCHAR(50);
  ` });
  console.log('Result blocks:', error || 'OK');
}
check();
