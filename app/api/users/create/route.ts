import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  assertBrokerModuleRole,
  BROKER_USER_ROLE,
  isCompanyAdminAccessLevel,
} from '@/lib/brokerAccessLevels';
import { canCreateBroker } from '@/lib/saasPlanEnforcement';
import { isPlatformAdmin } from '@/lib/rls';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { normalizeUserRole } from '@/lib/rolePermissions';

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
    const { fullName, email, phone, tenantId, role, password } = body;

    if (isCompanyAdminAccessLevel(role)) {
      return NextResponse.json(
        {
          error:
            'Administrador da empresa deve ser cadastrado em Configurações > Usuários Administradores.',
        },
        { status: 400 },
      );
    }

    assertBrokerModuleRole(role || BROKER_USER_ROLE);
    const brokerUserRole = BROKER_USER_ROLE;

    // Verify calling user is ADMIN or SUPER_ADMIN
    // For now we trust the payload but ideally extract from token

    if (!tenantId) {
      throw new Error("O tenantId é obrigatório para cadastrar um corretor.");
    }

    const { user: caller, configError: authConfigError } = await getRequestAuthUser(req);
    let callerRole = 'USER';
    if (caller) {
      const { client: adminLookup } = createAdminSupabase();
      if (adminLookup) {
        const { data: profile } = await adminLookup
          .from('users')
          .select('role')
          .eq('id', caller.id)
          .maybeSingle();
        callerRole = normalizeUserRole(profile?.role || caller.user_metadata?.role);
      }
    } else if (authConfigError) {
      console.warn('[users/create] auth lookup:', authConfigError);
    }

    const skipBrokerLimit = isPlatformAdmin(callerRole);
    if (!skipBrokerLimit) {
      const enforcement = await canCreateBroker(supabaseAdmin, tenantId, {
        isPlatformAdmin: false,
      });
      if (!enforcement.allowed) {
        return NextResponse.json(
          { error: enforcement.message, code: enforcement.code || 'SAAS_BROKER_LIMIT' },
          { status: 403 },
        );
      }
    }

    let temporaryPassword = password;
    let authUserId: string | null = null;
    let isExisting = false;

    if (!temporaryPassword) {
      temporaryPassword = generateTempPassword(8);
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: brokerUserRole,
        tenant_id: tenantId
      }
    });

    if (authError) {
       if (authError.message.includes('already been registered') || (authError as any).status === 422) {
           isExisting = true;
           // Try to find by iterating
           let page = 1;
           while(true) {
              const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
              if (!data?.users || data.users.length === 0) break;
              const f = data.users.find((u: any) => u.email === email);
              if (f) {
                 authUserId = f.id;
                 break;
              }
              if (data.users.length < 1000) break;
              page++;
           }
           if (!authUserId) {
              throw new Error("Erro ao localizar ID de e-mail já registrado (Não encontrado).");
           }
       } else {
         throw new Error(`Erro ao criar conta: ${authError.message}`);
       }
    } else {
       authUserId = authUser.user.id;
    }

    // Now update or insert public.users
    const { data: existingUser } = await supabaseAdmin.from('users').select('*').eq('id', authUserId).maybeSingle();

    if (existingUser) {
        if (existingUser.tenant_id && existingUser.tenant_id !== tenantId) {
            throw new Error("Este e-mail já está vinculado a outra empresa. Use outro e-mail ou solicite transferência.");
        }
        if (isCompanyAdminAccessLevel(String(existingUser.role))) {
            throw new Error('Este e-mail já é administrador desta empresa.');
        }
        // update role and details
        const { error: userError } = await supabaseAdmin.from('users').update({
            role: brokerUserRole,
            full_name: fullName,
            phone: phone,
            tenant_id: tenantId
        }).eq('id', authUserId);
        if (userError) throw new Error(`Erro ao atualizar perfil de sistema: ${userError.message}`);
    } else {
        const { error: userError } = await supabaseAdmin.from('users').insert({
            id: authUserId,
            tenant_id: tenantId,
            full_name: fullName,
            email: email,
            role: brokerUserRole,
            status: 'ACTIVE',
            phone: phone,
            force_password_change: !isExisting // force password change only if new
        });
        if (userError) throw new Error(`Erro ao criar perfil de sistema: ${userError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      temporaryPassword: isExisting ? null : temporaryPassword,
      userId: authUserId,
      isExisting
    });

  } catch (error: any) {
    if (authUserId && !isExisting) {
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
