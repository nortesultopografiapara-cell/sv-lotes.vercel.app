import { NextResponse } from 'next/server';
import { canEditProject } from '@/lib/projectEditAccess';
import {
  formatProjectUpdateDbError,
  updateProjectWithFallback,
} from '@/lib/projects-update';
import { mergeMundoNovoSellerPartyContacts } from '@/lib/mundoNovoContractSellers';
import {
  createAdminSupabase,
  getRequestAuthUser,
  logSupabaseConfigDebug,
} from '@/lib/supabase/server';
import { getServerConfigErrorMessage } from '@/lib/supabase-config';

export const runtime = 'nodejs';

type UpdateProjectBody = {
  name?: string;
  city?: string;
  uf?: string;
  neighborhood?: string | null;
  address?: string | null;
  forum_city?: string | null;
  impersonatingTenantId?: string | null;
  financial_account_id?: string | null;
  contract_model?: string | null;
  seller_party_contacts?: Array<{
    order?: number;
    name?: string;
    email?: string | null;
    phone?: string | null;
  }> | null;
};

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params;
  logSupabaseConfigDebug(`API PATCH /api/projects/${projectId}`);

  const serverConfigError = getServerConfigErrorMessage();
  if (serverConfigError) {
    return NextResponse.json(
      { error: serverConfigError, code: 'SUPABASE_CONFIG' },
      { status: 503 },
    );
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin || adminError) {
    return NextResponse.json(
      { error: adminError || 'Supabase admin indisponível.', code: 'SUPABASE_ADMIN' },
      { status: 503 },
    );
  }

  const { user, configError: authConfigError } = await getRequestAuthUser(request);
  if (authConfigError && !user) {
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

  if (!projectId?.trim()) {
    return NextResponse.json(
      { error: 'ID do projeto é obrigatório.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  let body: UpdateProjectBody;
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

  const { data: existing, error: fetchError } = await admin
    .from('projects')
    .select('id, tenant_id, name, seller_parties_json')
    .eq('id', projectId)
    .maybeSingle();

  if (fetchError) {
    console.error('[API PATCH /api/projects] Fetch project:', fetchError);
    return NextResponse.json(
      { error: 'Erro ao carregar projeto.', code: 'DB_FETCH' },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json(
      { error: 'Projeto não encontrado.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const { data: callerProfile } = await admin
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  const caller = {
    id: user.id,
    role: callerProfile?.role || 'USER',
    tenant_id: callerProfile?.tenant_id || null,
  };

  if (String(caller.role || '').toUpperCase() === 'OWNER') {
    return NextResponse.json(
      { error: 'Proprietários não podem editar empreendimentos.', code: 'OWNER_READ_ONLY' },
      { status: 403 },
    );
  }

  const access = canEditProject(caller, existing, {
    impersonatingTenantId: body.impersonatingTenantId,
  });

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason || 'Sem permissão para editar este projeto.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  const location = [city, uf].filter(Boolean).join(' - ');
  const forumCity = body.forum_city?.trim() || city;

  try {
    const { data, error } = await updateProjectWithFallback(admin, projectId, {
      name,
      city,
      uf,
      neighborhood: body.neighborhood?.trim() || null,
      address: body.address?.trim() || null,
      forum_city: forumCity,
      contract_city: forumCity,
      location,
      financial_account_id: body.financial_account_id?.trim() || null,
      contract_model:
        body.contract_model === undefined
          ? undefined
          : body.contract_model?.trim() || null,
      seller_parties_json:
        body.seller_party_contacts === undefined
          ? undefined
          : mergeMundoNovoSellerPartyContacts(
              (existing as { seller_parties_json?: unknown }).seller_parties_json,
              body.seller_party_contacts,
            ),
    });

    if (error) {
      console.error('[API PATCH /api/projects] Update error:', {
        message: error.message,
        code: error.code,
        projectId,
        userId: user.id,
      });
      return NextResponse.json(
        {
          error: formatProjectUpdateDbError(error.message),
          code: error.code || 'DB_UPDATE',
        },
        { status: 422 },
      );
    }

    console.log('[API PATCH /api/projects] Updated', { projectId, userId: user.id });

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

    console.error('[API PATCH /api/projects] Exception:', err);

    return NextResponse.json(
      {
        error: isFetch
          ? 'Não foi possível conectar ao Supabase. Verifique a configuração do servidor.'
          : message,
        code: isFetch ? 'NETWORK' : 'SERVER_ERROR',
      },
      { status: 500 },
    );
  }
}
