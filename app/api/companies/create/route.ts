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

    // 0. Pre-validar se o CNPJ, Slug ou Email já existem na tabela public.companies ou public.users
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 10000);
    
    const [ { data: existingUser }, { data: existingCnpj } ] = await Promise.all([
       supabaseAdmin.from('users').select('id').eq('email', adminEmail).maybeSingle(),
       supabaseAdmin.from('companies').select('id').eq('cnpj', cnpj).maybeSingle()
    ]);

    if (existingUser) {
       console.log('[ERRO] Usuário já existe na tabela public.users.');
       throw new Error('Este e-mail já possui cadastro no sistema.');
    }

    if (existingCnpj) {
       console.log('[ERRO] CNPJ já cadastrado na public.companies.');
       throw new Error('Falha ao criar empresa: CNPJ já possui cadastro no sistema.');
    }

    // 1. Criar Empresa (Tenant) primeiro
    console.log(`[ETAPA 1] Criando tenant na tabela public.companies... Nome: ${name}`);
    
    // Calcular limites do plano
    const planLimits = {
        'Básico': { broker_limit: 5, admin_limit: 1 },
        'Standard': { broker_limit: 10, admin_limit: 3 },
        'Professional': { broker_limit: 100, admin_limit: 10 }
    };
    const limits = planLimits[plan as keyof typeof planLimits] || planLimits['Básico'];

    const { data: newCompany, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug,
        cnpj,
        email: email || adminEmail,
        phone: phone || adminPhone,
        plan: plan,
        module: plan.toLowerCase(),
        status: 'active',
        active: true,
        ...limits
      })
      .select()
      .single();

    if (companyError) {
      console.error('[ERRO] Falha ao criar empresa em public.companies:', companyError.message, 'Código:', companyError.code, companyError);
      
      if (companyError.code === 'PGRST204' || companyError.message.includes('Could not find')) {
        throw new Error(`Erro na estrutura do banco: O banco de dados ainda não possui as colunas módulo/limites. Por favor, execute a migration no SQL Editor. Detalhe: ${companyError.message}`);
      }

      if (companyError.code === '23505' || companyError.message.includes('unique')) {
         if (companyError.message.includes('cnpj')) {
           throw new Error('Falha ao criar empresa: CNPJ já possui cadastro no sistema.');
         }
         if (companyError.message.includes('slug')) {
           throw new Error('Falha ao criar empresa: O nome da empresa gerou um identificador único já existente. Tente modificar um pouco o nome.');
         }
      }
      throw new Error(`Falha ao criar empresa: ${companyError.message}`);
    }

    newCompanyId = newCompany.id;
    console.log(`[SUCESSO] Empresa criada! ID: ${newCompanyId}`);

    // 2. Criar usuário no auth.users
    const password = body.password || generateTempPassword(8);
    console.log(`[ETAPA 2] Verificando e criando usuário master (Administrador) no auth.users... Email: ${adminEmail}`);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: 'ADMIN',
        tenant_id: newCompanyId
      }
    });

    if (authError) {
      console.error('[ERRO] Falha ao criar usuário na auth.users:', authError);
      
      let errMsg = `Erro interno no AUTH (${authError.message})`;
      if (authError.message.includes('already registered') || authError.status === 422) {
         errMsg = 'Este e-mail já possui cadastro no sistema (preso no Auth. Tente usar a função limpar testes).';
      }
      
      // Como a empresa foi criada no Passo 1, vamos fazer rollback dela aqui
      throw new Error(errMsg);
    }

    authUserId = authUser.user.id;
    console.log(`[SUCESSO] Usuário criado na auth.users! ID: ${authUserId}`);

    // 3. Cadastrando perfil em public.users e vinculando à empresa
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
      console.error('[ERRO] Falha ao criar perfil em public.users:', userError.message, userError.code, userError);
      throw new Error(`Falha ao criar administrador: ${userError.message}`);
    }

    console.log(`[SUCESSO] Perfil criado em public.users e vinculado à empresa!`);

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
