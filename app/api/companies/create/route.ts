import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usamos a SUPABASE_SERVICE_ROLE_KEY para ignorar o RLS e poder criar usuários no auth.users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Função auxiliar para gerar senha aleatória
function generateTempPassword(length = 8) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, cnpj, phone, email, plan, adminName, adminEmail, adminPhone, sendEmail } = body;

    // TODO: Verify if the user making the request is a SUPER_ADMIN
    // For now we trust the caller, but in production we should extract the JWT from headers
    // and verify their role.
    
    // 1. Create the tenant in public.companies
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const { data: newCompany, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug: slug + '-' + Math.floor(Math.random() * 1000),
        cnpj,
        phone,
        email,
        plan,
        active: true
      })
      .select()
      .single();

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 400 });
    }

    // 2. Create the admin user in Supabase Auth
    const temporaryPassword = generateTempPassword();

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: temporaryPassword,
      email_confirm: true, // Auto confirm
      user_metadata: {
        full_name: adminName,
        role: 'ADMIN' // We set role in metadata for convenience, but the truth is in public.users
      }
    });

    if (authError) {
      // Rollback company creation if auth fails
      await supabaseAdmin.from('companies').delete().eq('id', newCompany.id);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 3. Insert the user into public.users with force_password_change = true
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUser.user.id,
        tenant_id: newCompany.id,
        full_name: adminName,
        email: adminEmail,
        role: 'ADMIN',
        status: 'ACTIVE',
        phone: adminPhone,
        force_password_change: true
      });

    if (userError) {
      // Important to keep data consistent, if we can't create public.user, we might want to delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      await supabaseAdmin.from('companies').delete().eq('id', newCompany.id);
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    // 4. Send email (Mock for now, in production use Resend, Sendgrid, etc)
    if (sendEmail) {
      console.log('--------------------------------------------------');
      console.log(`[MOCK EMAIL] Sending welcome email to ${adminEmail}...`);
      console.log(`Subject: Bem-vindo ao sistema - Acesso Administrativo`);
      console.log(`Body:`);
      console.log(`Olá, ${adminName}.`);
      console.log(`A empresa ${name} foi cadastrada com sucesso no sistema.`);
      console.log(`Seu login é: ${adminEmail}`);
      console.log(`Sua senha provisória é: ${temporaryPassword}`);
      console.log(`Acesse o sistema e redefina sua senha no primeiro login.`);
      console.log('--------------------------------------------------');
    }

    return NextResponse.json({ 
      success: true, 
      companyId: newCompany.id,
      temporaryPassword 
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
