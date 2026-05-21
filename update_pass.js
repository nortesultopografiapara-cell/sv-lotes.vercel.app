require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.auth.admin.updateUserById('8b767f81-0526-42a9-8959-9706de9e1698', { password: '12345678' })
  .then(res => console.log('Password set to 12345678'))
  .catch(console.error);
