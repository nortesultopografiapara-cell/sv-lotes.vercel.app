import { NextResponse } from 'next/server';
import { insertProjectWithFallback } from '@/lib/projects-insert';
import {
  createAdminSupabase,
  getRequestAuthUser,
  logSupabaseConfigDebug,
} from '@/lib/supabase/server';
import { getServerConfigErrorMessage } from '@/lib/supabase-config';
import {
  canCreateProject,
} from '@/lib/saasPlanEnforcement';
import {
  logSaasCompanyContext,
} from '@/lib/saasPlans';

export const runtime = 'nodejs';

type CreateProjectBody = {
  name?: string;
  city?: string;
  uf?: string;
  neighborhood?: string | null;
  address?: string | null;
  forum_city?: string | null;
  impersonatingTenantId?: string | null;
  contract_model?: string | null;
};

async function resolveTenantForUser(
  admin: ReturnType<typeof createAdminSupabase>['client'],
  authUserId: string,
  role: string,
  impersonatingTenantId?: string | null,
): Promise<{ tenantId: string | null; error?: string }> {
  if (!admin) return { tenantId: null, error: 'Cliente admin indisponível.' };

  const { data: profile } = await admin
    .from('users')
    .select('tenant_id, role')
    .eq('id', authUserId)
    .maybeSingle();

  const effectiveRole = (profile?.role || role || '').toUpperCase();
  let tenantId = profile?.tenant_id || null;

  if (
    impersonatingTenantId &&
    effectiveRole === 'SUPER_ADMIN'
  ) {
    tenantId = impersonatingTenantId;
  }

  return { tenantId, error: tenantId ? undefined : 'tenant_missing' };
}

export async function POST(request: Request) {
  logSupabaseConfigDebug('API POST /api/projects');

  const serverConfigError = getServerConfigErrorMessage();
  if (serverConfigError) {
    console.error('[API /api/projects] Config:', serverConfigError);
    return NextResponse.json(
      {
        error: serverConfigError,
        code: 'SUPABASE_CONFIG',
        hint: 'Defina as variáveis em .env.local (dev) ou no painel da Vercel (produção) e reinicie o servidor.',
      },
      { status: 503 },
    );
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    console.error('[API /api/projects] Admin client:', adminError);
    return NextResponse.json(
      { error: adminError || 'Supabase admin indisponível.', code: 'SUPABASE_ADMIN' },
      { status: 503 },
    );
  }

  const { user, configError: authConfigError } = await getRequestAuthUser(request);
  if (authConfigError && !user) {
    console.error('[API /api/projects] Auth config:', authConfigError);
    return NextResponse.json(
      { error: authConfigError, code: 'AUTH_CONFIG' },
      { status: 503 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { error: 'Não autenticado. Faça login novamente.', code: 'UNAUTHORIZED' },
      { status: 401 },
    );
  }

  let body: CreateProjectBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Corpo da requisição inválido (JSON esperado).', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const name = (body.name || '').trim();
  const city = (body.city || '').trim();
  const uf = (body.uf || '').trim().toUpperCase();

  if (!name) {
    return NextResponse.json({ error: 'Nome do projeto é obrigatório.', code: 'VALIDATION' }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ error: 'Cidade é obrigatória.', code: 'VALIDATION' }, { status: 400 });
  }
  if (!uf || uf.length !== 2) {
    return NextResponse.json({ error: 'UF deve ter 2 letras.', code: 'VALIDATION' }, { status: 400 });
  }

  const { data: callerProfile } = await admin
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  const callerRole = (callerProfile?.role || 'USER').toUpperCase();

  if (callerRole === 'OWNER') {
    return NextResponse.json(
      { error: 'Proprietários não podem criar empreendimentos.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const { tenantId, error: tenantResolveError } = await resolveTenantForUser(
    admin,
    user.id,
    callerRole,
    body.impersonatingTenantId,
  );

  if (tenantResolveError === 'tenant_missing' || !tenantId) {
    const msg =
      callerRole === 'SUPER_ADMIN'
        ? 'Nenhuma empresa ativa. Use "Entrar como Empresa" antes de criar o projeto.'
        : 'Empresa (tenant) não vinculada ao seu usuário.';
    return NextResponse.json({ error: msg, code: 'TENANT_REQUIRED' }, { status: 400 });
  }

  const location = [city, uf].filter(Boolean).join(' - ');

  if (callerRole !== 'SUPER_ADMIN') {
    const enforcement = await canCreateProject(admin, tenantId, {
      isPlatformAdmin: false,
    });

    logSaasCompanyContext(tenantId, null, enforcement.usage?.projects);

    if (!enforcement.allowed) {
      return NextResponse.json(
        {
          error: enforcement.message,
          code: enforcement.code || 'SAAS_PROJECT_LIMIT',
        },
        { status: 403 },
      );
    }
  }

  try {
    const { data, error } = await insertProjectWithFallback(admin, {
      name,
      city,
      uf,
      neighborhood: body.neighborhood?.trim() || null,
      address: body.address?.trim() || null,
      forum_city: body.forum_city?.trim() || city,
      location,
      tenant_id: tenantId,
      contract_model: body.contract_model?.trim() || null,
    });

    if (error) {
      console.error('[API /api/projects] Insert error:', {
        message: error.message,
        code: error.code,
        tenantId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          error: error.message || 'Falha ao inserir projeto.',
          code: error.code || 'DB_INSERT',
          details: process.env.NODE_ENV === 'development' ? error : undefined,
        },
        { status: 422 },
      );
    }

    console.log('[API /api/projects] Created', { projectId: data?.id, tenantId, userId: user.id });

    return NextResponse.json({
      success: true,
      project: data,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isFetch =
      message.includes('fetch failed') ||
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED');

    console.error('[API /api/projects] Exception:', err);

    return NextResponse.json(
      {
        error: isFetch
          ? 'Não foi possível conectar ao Supabase. Verifique NEXT_PUBLIC_SUPABASE_URL e a rede.'
          : message,
        code: isFetch ? 'NETWORK' : 'SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? String(err) : undefined,
      },
      { status: 500 },
    );
  }
}

/** Diagnóstico rápido: GET /api/projects */
export async function GET() {
  const serverError = getServerConfigErrorMessage();
  return NextResponse.json({
    ok: !serverError,
    endpoint: '/api/projects',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 40)}...`
      : null,
    hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serverError,
  });
}
