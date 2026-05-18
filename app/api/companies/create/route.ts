import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export async function POST(req: Request) {
  console.log('[PROVISIONAMENTO MULTI-TENANT] Iniciando criação de empresa...');
  
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ERRO FATAL] SUPABASE_SERVICE_ROLE_KEY não configurada no backend.');
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

  let newCompanyId: string | null = null;
  let authUserId: string | null = null;

  try {
    const body = await req.json();
    const { name, cnpj, phone, email, plan, adminName, adminEmail, adminPhone, sendEmail } = body;

    // 1. Criar/Verificar usuário no auth.users PRIMEIRO para evitar empresas orfãs
    const password = body.password || generateTempPassword(8);
    console.log(`[ETAPA 1] Criando usuário master (Administrador) no auth.users... Email: ${adminEmail}`);
    
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: 'ADMIN'
      }
    });

    if (authError) {
      console.error('[ERRO] Falha ao criar usuário na auth.users:', authError.message);
      throw new Error(`E-mail já está em uso ou inválido (${authError.message})`);
    }

    authUserId = authUser.user.id;
    console.log(`[SUCESSO] Usuário criado (ou convite enviado) na auth.users! ID: ${authUserId}`);

    // 2. Create the tenant in public.companies
    console.log(`[ETAPA 2] Criando tenant na tabela public.companies... Nome: ${name}`);
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 10000);
    
    // Calcular limites do plano
    const planLimits = {
        'Básico': { broker_limit: 5, project_limit: 2, admin_limit: 1 },
        'Standard': { broker_limit: 10, project_limit: 10, admin_limit: 3 },
        'Professional': { broker_limit: 100, project_limit: 9999, admin_limit: 9999 }
    };
    const limits = planLimits[plan as keyof typeof planLimits] || planLimits['Básico'];

    const { data: newCompany, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug,
        cnpj,
        plan,
        active: true,
        ...limits
      })
      .select()
      .single();

    if (companyError) {
      console.error('[ERRO] Falha ao criar empresa:', companyError.message);
      throw new Error(`Erro ao criar empresa: ${companyError.message}`);
    }

    newCompanyId = newCompany.id;
    console.log(`[SUCESSO] Empresa criada! ID: ${newCompanyId}`);

    // Atualizar metadata do auth.user com o tenant_id agora que sabemos qual é
    await supabaseAdmin.auth.admin.updateUserById(authUserId, {
       user_metadata: {
         full_name: adminName,
         role: 'ADMIN',
         tenant_id: newCompanyId
       }
    });

    // 3. Cadastrando perfil em public.users
    console.log(`[ETAPA 3] Cadastrando perfil em public.users...`);

    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authUserId,
        tenant_id: newCompanyId,
        full_name: adminName,
        email: adminEmail,
        role: 'ADMIN',
        status: 'ACTIVE',
        phone: adminPhone,
        force_password_change: true
      });

    if (userError) {
      console.error('[ERRO] Falha ao criar perfil em public.users:', userError.message);
      throw new Error(`Erro ao criar perfil de sistema: ${userError.message}`);
    }

    console.log(`[SUCESSO] Perfil criado em public.users!`);

    console.log(`[ETAPA 4] Conclusão...`);
    // Agora o e-mail é enviado nativamente pelo Supabase via inviteUserByEmail.
    console.log('[PROVISIONAMENTO CONCLUÍDO COM SUCESSO]');
    
    return NextResponse.json({ 
      success: true, 
      companyId: newCompanyId,
      message: 'Empresa criada com sucesso. Um convite por e-mail foi enviado ao administrador.'
    });

  } catch (error: any) {
    console.error('[ROLLBACK INICIADO] Ocorreu um erro no processo de criação:', error.message);
    
    // Executando rollbacks
    try {
      if (authUserId) {
        console.log(`[ROLLBACK] Removendo auth.user ID: ${authUserId}`);
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
    } catch (rbAuthErr: any) {
      console.error('[ROLLBACK ERRO] Falha ao remover auth.user:', rbAuthErr.message);
    }
    
    try {
      if (newCompanyId) {
        console.log(`[ROLLBACK] Removendo company ID: ${newCompanyId}`);
        await supabaseAdmin.from('companies').delete().eq('id', newCompanyId);
      }
    } catch (rbCompErr: any) {
      console.error('[ROLLBACK ERRO] Falha ao remover company:', rbCompErr.message);
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
