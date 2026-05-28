import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { saasLimitsDbPayload } from '@/lib/saasPlans';
import {
  buildCompanySubscriptionDatePayload,
  defaultNewCompanySubscriptionDates,
} from '@/lib/companySubscriptionDates';
import { ensureSaasSubscription } from '@/lib/saasSubscriptionService';

function generateSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

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

    // 0. Pre-validar se o CNPJ ou Email já existem na tabela public.companies ou public.users
    const baseSlug = generateSlug(name);
    let uniqueSlug = baseSlug;
    let isSlugUnique = false;
    let suffix = 0;

    while (!isSlugUnique) {
      const { data: existingSlug } = await supabaseAdmin.from('companies').select('id').eq('slug', uniqueSlug).maybeSingle();
      if (!existingSlug) {
        isSlugUnique = true;
      } else {
        suffix = Math.floor(Math.random() * 10000);
        uniqueSlug = `${baseSlug}-${suffix}`;
      }
    }
    
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
    
    const planSource = body.plan_type || plan || 'basic';
    const limits = saasLimitsDbPayload(planSource);

    const companyPayload: any = {
      name,
      slug: uniqueSlug,
      cnpj,
      email: email || adminEmail,
      phone: phone || adminPhone,
      plan: limits.plan,
      plan_type: limits.plan,
      status_operacional: body.status_operacional || 'Ativa',
      project_limit: limits.project_limit,
      broker_limit: limits.broker_limit,
      max_projects: limits.max_projects,
      max_brokers: limits.max_brokers,
    };

    if (body.address) companyPayload.address = body.address;
    if (body.city) companyPayload.city = body.city;
    if (body.state) companyPayload.state = body.state;
    if (body.cep) companyPayload.cep = body.cep;
    
    companyPayload.is_test_company = body.is_test_company === true;

    if (!companyPayload.is_test_company) {
      const subDates = body.subscription_start_date
        ? buildCompanySubscriptionDatePayload({
            subscription_start_date: body.subscription_start_date,
            subscription_due_day: body.subscription_due_day,
            next_payment_date: body.next_payment_date,
          })
        : defaultNewCompanySubscriptionDates();
      companyPayload.subscription_start_date = subDates.subscription_start_date;
      companyPayload.subscription_due_day = subDates.subscription_due_day;
      companyPayload.next_payment_date = subDates.next_payment_date;
    }

    if (body.custom_price_enabled === true) {
      const custom = Number(body.custom_monthly_price);
      if (!Number.isFinite(custom) || custom < 0) {
        throw new Error('Valor personalizado inválido.');
      }
      companyPayload.custom_price_enabled = true;
      companyPayload.custom_monthly_price = Math.round(custom * 100) / 100;
      companyPayload.custom_price_badge = body.custom_price_badge || 'desconto_especial';
    } else {
      companyPayload.custom_price_enabled = false;
      companyPayload.custom_monthly_price = null;
      companyPayload.custom_price_badge = null;
    }

    let { data: newCompany, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert(companyPayload)
      .select()
      .single();

    if (companyError && (companyError.code === 'PGRST204' || companyError.message.includes('schema cache'))) {
        console.warn("Retrying minimal payload due to structure mismatch", companyError);
        const minimalPayload = {
            name,
            slug: uniqueSlug,
            cnpj,
            status_operacional: body.status_operacional || 'Ativa',
            is_test_company: body.is_test_company === true
        };
        const retryResult = await supabaseAdmin.from('companies').insert(minimalPayload).select().single();
        newCompany = retryResult.data;
        companyError = retryResult.error;
    }

    if (companyError) {
      console.error('[ERRO] Falha ao criar empresa em public.companies:', companyError.message, 'Código:', companyError.code, companyError);
      console.error("PAYLOAD_COMPANY_CREATE", companyPayload);
      throw new Error(`Erro Real no Create: ${companyError.code} - ${companyError.message}`);
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
      .upsert({
        id: authUserId,
        tenant_id: newCompanyId,
        full_name: adminName,
        email: adminEmail,
        role: 'ADMIN',
        status: 'ACTIVE',
        phone: adminPhone,
        force_password_change: true
      }, { onConflict: 'id' });

    if (userError) {
      console.error('[ERRO] Falha ao criar perfil em public.users:', userError.message, userError.code, userError);
      throw new Error(`Falha ao criar administrador: ${userError.message}`);
    }

    console.log(`[SUCESSO] Perfil criado em public.users e vinculado à empresa!`);

    if (!companyPayload.is_test_company && newCompany) {
      console.log('[ETAPA 4] Provisionando assinatura SaaS e contrato...');
      const subResult = await ensureSaasSubscription(supabaseAdmin, newCompany);
      if (subResult.error) {
        console.warn('[SAAS_SUBSCRIPTION] Aviso ao provisionar:', subResult.error);
      } else {
        console.log('[SAAS_SUBSCRIPTION] Assinatura e contrato (se dados completos) provisionados.', subResult.subscription?.id);
      }
    }

    console.log(`[ETAPA 5] Conclusão...`);
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
