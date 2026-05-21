require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const email = 'severino@nortesultopografia.com.br';
const password = '12345678';

async function recover() {
  console.log('Buscando usuario no Auth...');
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Erro listando usuarios auth:', listError);
    return;
  }
  
  let user = users.users.find(u => u.email === email);
  
  if (!user) {
    console.log('Criando usuario no Auth...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: 'Severino (Master)' }
    });
    if (createError) {
      console.error('Erro criando usuario auth:', createError);
      return;
    }
    user = newUser.user;
    console.log('Usuario criado no auth:', user.id);
  } else {
    console.log('Usuario ja existe no auth:', user.id);
    console.log('Atualizando senha...');
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password
    });
    if (updateError) {
       console.error('Erro atualizando senha:', updateError);
       return;
    }
    console.log('Senha atualizada.');
  }
  
  console.log('Buscando usuario na tabela users...');
  const { data: dbUser, error: dbError } = await supabase.from('users').select('*').eq('email', email).single();
  
  if (dbError && dbError.code !== 'PGRST116') {
     console.error('Erro buscando na tabela users:', dbError);
  }
  
  if (dbUser) {
     console.log('Usuario ja existe na tabela users, atualizando dados admin...');
     await supabase.from('users').update({
       id: user.id,
       role: 'SUPER_ADMIN',
       name: 'Severino (Master)',
       is_super_admin: true,
       onboarding_completed: true
     }).eq('email', email);
     console.log('Dados do admin atualizados.');
  } else {
     console.log('Usuario não existe na tabela users, inserindo...');
     await supabase.from('users').insert({
       id: user.id,
       email,
       role: 'SUPER_ADMIN',
       name: 'Severino (Master)',
       is_super_admin: true,
       onboarding_completed: true
     });
     console.log('Admin inserido.');
  }
  
  console.log('Recuperacao finalizada com sucesso. Nova senha:', password);
}

recover();
