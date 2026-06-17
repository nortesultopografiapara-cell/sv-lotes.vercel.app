import { NextResponse } from 'next/server';
import {
  insertCompanyAdminAuditLog,
  resetCompanyAdminPassword,
  resolveActorDisplayName,
  resolveCompanyAdminContextFromRequest,
} from '@/lib/companyAdminUsers';
import { createAdminSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const { id: adminId } = await params;
  const body = await request.json();
  const url = new URL(request.url);
  const authInput = {
    callerUserId: body.callerUserId || url.searchParams.get('callerUserId'),
    tenantId: body.tenantId || url.searchParams.get('tenantId'),
    impersonatingTenantId:
      body.impersonatingTenantId || url.searchParams.get('impersonatingTenantId'),
  };

  const ctx = await resolveCompanyAdminContextFromRequest(request, admin, authInput);
  if (!ctx.ok || !ctx.tenantId || !ctx.callerId) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status || 403 });
  }

  try {
    const actorName = await resolveActorDisplayName(admin, ctx.callerId);
    const result = await resetCompanyAdminPassword(admin, {
      tenantId: ctx.tenantId,
      adminId,
      password: body.password,
    });

    await insertCompanyAdminAuditLog(admin, {
      action: 'COMPANY_ADMIN_PASSWORD_RESET',
      tenantId: ctx.tenantId,
      actorUserId: ctx.callerId,
      actorName,
      targetAdminId: adminId,
      description: `${actorName} redefiniu a senha de um administrador da empresa`,
    });

    return NextResponse.json({
      success: true,
      temporaryPassword: result.temporaryPassword,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao redefinir senha.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
