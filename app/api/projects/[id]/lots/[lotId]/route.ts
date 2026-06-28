import { NextResponse } from 'next/server';
import { canEditProject } from '@/lib/projectEditAccess';
import { deleteIndividualLot } from '@/lib/gis/deleteIndividualLot';
import {
  canManageGisProject,
  isBrokerRole,
  isOwnerRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';
import {
  createAdminSupabase,
  getRequestAuthUser,
  logSupabaseConfigDebug,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import { getServerConfigErrorMessage } from '@/lib/supabase-config';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; lotId: string }> };

function readImpersonatingTenantId(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get('impersonatingTenantId');
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id: projectId, lotId } = await context.params;
  logSupabaseConfigDebug(`API DELETE /api/projects/${projectId}/lots/${lotId}`);

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

  if (!projectId?.trim() || !lotId?.trim()) {
    return NextResponse.json(
      { error: 'Projeto e lote são obrigatórios.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const callerRole = normalizeUserRole(profile?.role || user.user_metadata?.role);

  if (isOwnerRole(callerRole) || isBrokerRole(callerRole) || !canManageGisProject(callerRole)) {
    return NextResponse.json(
      {
        error: 'Sem permissão para excluir lotes.',
        code: 'FORBIDDEN',
      },
      { status: 403 },
    );
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, tenant_id')
    .eq('id', projectId.trim())
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      { error: projectError.message, code: 'PROJECT_LOOKUP' },
      { status: 500 },
    );
  }

  if (!project?.id) {
    return NextResponse.json(
      { error: 'Projeto não encontrado.', code: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const access = canEditProject(
    {
      id: user.id,
      role: callerRole,
      tenant_id: profile?.tenant_id || profile?.company_id || null,
    },
    project,
    { impersonatingTenantId: readImpersonatingTenantId(request) },
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason || 'Sem permissão para este projeto.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  try {
    const result = await deleteIndividualLot(
      admin,
      projectId.trim(),
      lotId.trim(),
      {
        id: user.id,
        role: callerRole,
        tenant_id: profile?.tenant_id || profile?.company_id || null,
      },
    );

    return NextResponse.json({
      ok: true,
      lotId: result.lotId,
      blockName: result.blockName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao excluir lote.';
    const lower = message.toLowerCase();
    const status =
      lower.includes('não encontrado') || lower.includes('nao encontrado')
        ? 404
        : lower.includes('permiss') ||
            lower.includes('vendido') ||
            lower.includes('reservado') ||
            lower.includes('vincul')
          ? 409
          : 400;

    return NextResponse.json({ error: message, code: 'LOT_DELETE_FAILED' }, { status });
  }
}
