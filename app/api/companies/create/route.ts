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

    console.log(`[ETAPA 1] Criando tenant na tabela public.companies... Nome: ${name}`);
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 10000);
    
    const { data: newCompany, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug,
        cnpj,
        phone,
        email,
        plan,
        active: true
      })
      .select()
      .single();

    if (companyError) {
      console.error('[ERRO] Falha ao criar empresa:', companyError.message);
      return NextResponse.json({ error: `Erro ao criar empresa: ${companyError.message}` }, { status: 400 });
    }

    newCompanyId = newCompany.id;
    console.log(`[SUCESSO] Empresa criada! ID: ${newCompanyId}`);

    console.log(`[ETAPA 2] Criando usuário master (Administrador) no auth.users... Email: ${adminEmail}`);
    const temporaryPassword = generateTempPassword(8);

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: adminName,
        role: 'ADMIN',
        tenant_id: newCompanyId
      }
    });

    if (authError) {
      console.error('[ERRO] Falha ao criar usuário na auth.users:', authError.message);
      throw new Error(`Erro ao criar conta de usuário: ${authError.message}`);
    }

    authUserId = authUser.user.id;
    console.log(`[SUCESSO] Usuário criado na auth.users! ID: ${authUserId}`);

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

    console.log(`[ETAPA 4] Envio de e-mail com credenciais...`);
    if (sendEmail) {
      if (!process.env.RESEND_API_KEY) {
        console.warn('[AVISO] RESEND_API_KEY não configurada. E-mail de credenciais não foi enviado.');
      } else {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          
          await resend.emails.send({
            from: 'SV LOTES <onboarding@seusistema.com.br>', // Altere para seu domínio verificado
            to: [adminEmail],
            subject: 'Bem-vindo ao sistema SV LOTES - Acesso Administrativo',
            html: `
              <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                <h2>Olá, ${adminName}.</h2>
                <p>A empresa <strong>${name}</strong> foi cadastrada com sucesso.</p>
                <p>Você é o administrador do sistema. Seguem seus dados de acesso:</p>
                <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin: 24px 0;">
                  <p style="margin: 0;"><strong>Link de Acesso:</strong> <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://svlotes.com.br'}">${process.env.NEXT_PUBLIC_SITE_URL || 'https://svlotes.com.br'}</a></p>
                  <p style="margin: 8px 0 0 0;"><strong>E-mail:</strong> ${adminEmail}</p>
                  <p style="margin: 8px 0 0 0;"><strong>Senha Provisória:</strong> <code style="color: #06b6d4; font-size: 16px;">${temporaryPassword}</code></p>
                </div>
                <p style="color: #ef4444; font-size: 14px;">Importante: Por questões de segurança, sua senha deverá ser alterada no primeiro acesso obrigatório.</p>
              </div>
            `
          });
          console.log(`[SUCESSO] Email enviado via Resend para ${adminEmail}.`);
        } catch (emailErr: any) {
          console.error('[ERRO EMAIL] O envio de email falhou, mas a criação de empresa prosseguiu:', emailErr.message);
          // Não fazemos rollback por causa de erro no email
        }
      }
    } else {
      console.log(`[INFO] Envio de e-mail não foi solicitado.`);
    }

    console.log('[PROVISIONAMENTO CONCLUÍDO COM SUCESSO]');
    
    return NextResponse.json({ 
      success: true, 
      companyId: newCompanyId,
      temporaryPassword 
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
