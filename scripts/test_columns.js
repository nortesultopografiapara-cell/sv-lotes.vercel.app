import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: cols, error: err2 } = await supabase.rpc('get_columns', { table_name: 'blocks' });
    console.log("RPC:", cols, err2);
    
    // Alternative hack to see columns
    const { data, error } = await supabase.from('blocks').select('*').limit(1);
    if (data && data.length > 0) {
        console.log("BLOCK COLUMNS:", Object.keys(data[0]));
        console.log("BLOCK DATA:", data[0]);
    } else {
        console.log("NO BLOCKS");
    }
}
run();
