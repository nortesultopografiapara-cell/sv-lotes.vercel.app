require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('users').select('*').eq('email', 'severino@nortesultopografia.com.br').then(res => console.log(JSON.stringify(res.data, null, 2))).catch(console.error);
