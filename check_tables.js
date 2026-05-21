require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
const fetch=require('node-fetch'); // you can use fetch

const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

sb.rpc('get_tables').then(res => console.log(res)).catch(console.error);
