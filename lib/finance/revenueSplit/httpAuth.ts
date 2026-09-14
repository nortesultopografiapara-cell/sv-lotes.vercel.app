import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';
import { resolveOwnersAdminContextFromRequest } from '@/lib/ownersAdmin';
import { createRevenueSplitService } from './service';
import { createSupabaseRevenueSplitStore } from './supabaseStore';
import { RevenueSplitError } from './types';

export async function authorizeRevenueSplitAdmin(
  request: Request,
  extra?: { impersonatingTenantId?: string | null; tenantId?: string | null },
) {
  const { client: admin, configError } = createAdminSupabase();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: configError || 'Serviço indisponível.' },
        { status: 503 },
      ),
    };
  }

  const url = new URL(request.url);
  const ctx = await resolveOwnersAdminContextFromRequest(request, admin, {
    impersonatingTenantId:
      extra?.impersonatingTenantId || url.searchParams.get('impersonatingTenantId'),
    tenantId: extra?.tenantId || url.searchParams.get('tenantId'),
  });

  if (!ctx.ok || !ctx.callerId || !ctx.tenantId) {
    return {
      error: NextResponse.json({ error: ctx.error || 'Permissão negada.' }, { status: ctx.status || 403 }),
    };
  }

  return {
    admin,
    userId: ctx.callerId,
    role: ctx.callerRole,
    tenantId: ctx.tenantId,
    service: createRevenueSplitService(createSupabaseRevenueSplitStore(admin)),
  };
}

export function revenueSplitErrorResponse(err: unknown): NextResponse {
  if (err instanceof RevenueSplitError) {
    const status =
      err.code === 'PERMISSION_DENIED' || err.code.includes('TENANT_MISMATCH')
        ? 403
        : err.code.endsWith('_NOT_FOUND')
          ? 404
          : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  console.error('[revenue-split]', err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Erro ao processar Split de Recebimentos.' },
    { status: 500 },
  );
}
