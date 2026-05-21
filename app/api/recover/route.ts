import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
       return NextResponse.json({ error: 'environment missing'}, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const email = 'severino@nortesultopografia.com.br';
    const password = '12345678';

    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) return NextResponse.json({ error: listError });

    let user = users.users.find(u => u.email === email);

    if (!user) {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: 'Severino (Master)' }
      });
      if (createError) return NextResponse.json({ error: createError });
      user = newUser.user;
    } else {
      const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
        password: password
      });
      if (updateError) return NextResponse.json({ error: updateError });
    }

    const { data: dbUser } = await supabase.from('users').select('*').eq('email', email).single();

    if (dbUser) {
       await supabase.from('users').update({
         role: 'SUPER_ADMIN',
         name: 'Severino (Master)',
         is_super_admin: true,
         onboarding_completed: true
       }).eq('email', email);
    } else {
       await supabase.from('users').insert({
         id: user.id,
         email,
         role: 'SUPER_ADMIN',
         name: 'Severino (Master)',
         is_super_admin: true,
         onboarding_completed: true
       });
    }

    return NextResponse.json({ success: true, newPassword: password });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
