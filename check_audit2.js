require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('audit_log').select('*').limit(1).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
