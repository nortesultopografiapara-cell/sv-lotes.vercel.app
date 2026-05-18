import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Erro de infraestrutura: SUPABASE_SERVICE_ROLE_KEY ausente.' }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  let authUserId: string | null = null;

  try {
    const body = await req.json();
    const { fullName, email, phone, tenantId, role } = body;

    // Verify calling user is ADMIN or SUPER_ADMIN
    // For now we trust the payload but ideally extract from token

    if (!tenantId) {
      throw new Error("O tenantId é obrigatório para cadastrar um corretor.");
    }

    const temporaryPassword = generateTempPassword(8);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: role || 'CORRETOR',
        tenant_id: tenantId
      }
    });

    if (authError) {
      throw new Error(`Erro ao criar conta: ${authError.message}`);
    }

    authUserId = authUser.user.id;

    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: authUserId,
        tenant_id: tenantId,
        full_name: fullName,
        email: email,
        role: role || 'CORRETOR',
        status: 'ACTIVE',
        phone: phone,
        force_password_change: true
      }, { onConflict: 'id' });

    if (userError) {
      throw new Error(`Erro ao criar perfil de sistema: ${userError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      temporaryPassword,
      userId: authUserId
    });

  } catch (error: any) {
    if (authUserId) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    }
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}

function generateTempPassword(length = 8) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}
