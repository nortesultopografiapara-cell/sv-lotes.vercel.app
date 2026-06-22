import { NextResponse } from 'next/server';
import {
  createCompanyAdminUser,
  insertCompanyAdminAuditLog,
  listCompanyAdminUsers,
  resolveActorDisplayName,
  resolveCompanyAdminContextFromRequest,
  updateCompanyAdminUser,
} from '@/lib/companyAdminUsers';
import { createAdminSupabase } from '@/lib/supabase/server';
import { rejectIfDemoCaller } from '@/lib/demoServerGuard';

export const runtime = 'nodejs';

function readAuthInput(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  return {
    callerUserId:
      (body?.callerUserId as string | undefined) || url.searchParams.get('callerUserId'),
    tenantId: (body?.tenantId as string | undefined) || url.searchParams.get('tenantId'),
    impersonatingTenantId:
      (body?.impersonatingTenantId as string | undefined) ||
      url.searchParams.get('impersonatingTenantId'),
  };
}

export async function GET(request: Request) {
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const authInput = readAuthInput(request);
  const ctx = await resolveCompanyAdminContextFromRequest(request, admin, authInput);
  if (!ctx.ok || !ctx.tenantId) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status || 403 });
  }

  try {
    const result = await listCompanyAdminUsers(admin, ctx.tenantId);
    return NextResponse.json({ success: true, ...result, tenantId: ctx.tenantId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar administradores.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const body = await request.json();
  const authInput = readAuthInput(request, body);
  const ctx = await resolveCompanyAdminContextFromRequest(request, admin, authInput);
  if (!ctx.ok || !ctx.tenantId || !ctx.callerId) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status || 403 });
  }

  const demoBlock = await rejectIfDemoCaller(admin, ctx.callerId);
  if (demoBlock) return demoBlock;

  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim();
  if (!fullName || !email) {
    return NextResponse.json({ error: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
  }

  try {
    const actorName = await resolveActorDisplayName(admin, ctx.callerId);
    const created = await createCompanyAdminUser(admin, {
      tenantId: ctx.tenantId,
      createdBy: ctx.callerId,
      fullName,
      email,
      phone: body.phone,
      jobTitle: body.jobTitle,
      password: body.password,
    });

    await insertCompanyAdminAuditLog(admin, {
      action: 'COMPANY_ADMIN_CREATED',
      tenantId: ctx.tenantId,
      actorUserId: ctx.callerId,
      actorName,
      targetAdminId: created.admin.id,
      targetName: created.admin.full_name || created.admin.email,
      description: `${actorName} cadastrou o administrador ${created.admin.full_name || created.admin.email}`,
    });

    const { meta } = await listCompanyAdminUsers(admin, ctx.tenantId);

    return NextResponse.json({
      success: true,
      admin: created.admin,
      temporaryPassword: created.temporaryPassword,
      isExisting: created.isExisting,
      meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar administrador.';
    const status = message.includes('Limite') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const body = await request.json();
  const authInput = readAuthInput(request, body);
  const ctx = await resolveCompanyAdminContextFromRequest(request, admin, authInput);
  if (!ctx.ok || !ctx.tenantId || !ctx.callerId) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status || 403 });
  }

  const demoBlock = await rejectIfDemoCaller(admin, ctx.callerId);
  if (demoBlock) return demoBlock;

  const adminId = String(body.adminId || '').trim();
  if (!adminId) {
    return NextResponse.json({ error: 'adminId é obrigatório.' }, { status: 400 });
  }

  try {
    const actorName = await resolveActorDisplayName(admin, ctx.callerId);
    const updated = await updateCompanyAdminUser(admin, {
      tenantId: ctx.tenantId,
      adminId,
      fullName: body.fullName,
      phone: body.phone,
      jobTitle: body.jobTitle,
      status: body.status,
    });

    let action = 'COMPANY_ADMIN_UPDATED';
    if (body.status === 'INACTIVE') action = 'COMPANY_ADMIN_DISABLED';
    if (body.status === 'ACTIVE') action = 'COMPANY_ADMIN_ENABLED';

    await insertCompanyAdminAuditLog(admin, {
      action,
      tenantId: ctx.tenantId,
      actorUserId: ctx.callerId,
      actorName,
      targetAdminId: updated.id,
      targetName: updated.full_name || updated.email,
      description: `${actorName} atualizou o administrador ${updated.full_name || updated.email}`,
    });

    const { meta } = await listCompanyAdminUsers(admin, ctx.tenantId);
    return NextResponse.json({ success: true, admin: updated, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar administrador.';
    const status = message.includes('Limite') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
