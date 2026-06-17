import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import {
  createCompanyAdminUser,
  insertCompanyAdminAuditLog,
  listCompanyAdminUsers,
  resetCompanyAdminPassword,
  resolveActorDisplayName,
  updateCompanyAdminUser,
  updateCompanyAdminUsersLimit,
} from '@/lib/companyAdminUsers';

export const runtime = 'nodejs';

function readInput(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  return {
    userId: (body?.userId as string | undefined) || url.searchParams.get('userId'),
    companyId:
      (body?.companyId as string | undefined) ||
      (body?.tenantId as string | undefined) ||
      url.searchParams.get('companyId') ||
      url.searchParams.get('tenantId'),
  };
}

export async function GET(request: Request) {
  const { client: admin, error: configError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: configError || 'Service role não configurada.' }, { status: 500 });
  }

  const { userId, companyId } = readInput(request);
  const auth = await assertSuperAdmin(admin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'companyId é obrigatório.' }, { status: 400 });
  }

  try {
    const result = await listCompanyAdminUsers(admin, companyId);
    return NextResponse.json({ success: true, ...result, companyId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar administradores.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { client: admin, error: configError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: configError || 'Service role não configurada.' }, { status: 500 });
  }

  const body = await request.json();
  const { userId, companyId } = readInput(request, body);
  const auth = await assertSuperAdmin(admin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'companyId é obrigatório.' }, { status: 400 });
  }

  const action = String(body.action || 'create').trim();

  try {
    const actorName = userId ? await resolveActorDisplayName(admin, userId) : 'Super Admin';

    if (action === 'update_limit') {
      const limit = Number(body.adminUsersLimit ?? body.limit);
      if (!Number.isFinite(limit)) {
        return NextResponse.json({ error: 'Limite inválido.' }, { status: 400 });
      }
      const normalized = await updateCompanyAdminUsersLimit(admin, companyId, limit);
      await insertCompanyAdminAuditLog(admin, {
        action: 'COMPANY_ADMIN_LIMIT_CHANGED',
        tenantId: companyId,
        actorUserId: userId!,
        actorName,
        description: `${actorName} alterou o limite de administradores para ${normalized}`,
        metadata: { admin_users_limit: normalized },
      });
      const result = await listCompanyAdminUsers(admin, companyId);
      return NextResponse.json({ success: true, limit: normalized, ...result });
    }

    if (action === 'reset_password') {
      const adminId = String(body.adminId || '').trim();
      if (!adminId) {
        return NextResponse.json({ error: 'adminId é obrigatório.' }, { status: 400 });
      }
      const result = await resetCompanyAdminPassword(admin, {
        tenantId: companyId,
        adminId,
        password: body.password,
      });
      await insertCompanyAdminAuditLog(admin, {
        action: 'COMPANY_ADMIN_PASSWORD_RESET',
        tenantId: companyId,
        actorUserId: userId!,
        actorName,
        targetAdminId: adminId,
        description: `${actorName} redefiniu senha de administrador (Master)`,
      });
      return NextResponse.json({ success: true, temporaryPassword: result.temporaryPassword });
    }

    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim();
    if (!fullName || !email) {
      return NextResponse.json({ error: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
    }

    const created = await createCompanyAdminUser(admin, {
      tenantId: companyId,
      createdBy: userId!,
      fullName,
      email,
      phone: body.phone,
      jobTitle: body.jobTitle,
      password: body.password,
    });

    await insertCompanyAdminAuditLog(admin, {
      action: 'COMPANY_ADMIN_CREATED',
      tenantId: companyId,
      actorUserId: userId!,
      actorName,
      targetAdminId: created.admin.id,
      targetName: created.admin.full_name || created.admin.email,
      description: `${actorName} cadastrou administrador via Master`,
    });

    const result = await listCompanyAdminUsers(admin, companyId);
    return NextResponse.json({
      success: true,
      admin: created.admin,
      temporaryPassword: created.temporaryPassword,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro na operação Master.';
    const status = message.includes('Limite') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const { client: admin, error: configError } = createServiceSupabase();
  if (!admin) {
    return NextResponse.json({ error: configError || 'Service role não configurada.' }, { status: 500 });
  }

  const body = await request.json();
  const { userId, companyId } = readInput(request, body);
  const auth = await assertSuperAdmin(admin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }
  if (!companyId) {
    return NextResponse.json({ error: 'companyId é obrigatório.' }, { status: 400 });
  }

  const adminId = String(body.adminId || '').trim();
  if (!adminId) {
    return NextResponse.json({ error: 'adminId é obrigatório.' }, { status: 400 });
  }

  try {
    const actorName = userId ? await resolveActorDisplayName(admin, userId) : 'Super Admin';
    const updated = await updateCompanyAdminUser(admin, {
      tenantId: companyId,
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
      tenantId: companyId,
      actorUserId: userId!,
      actorName,
      targetAdminId: updated.id,
      targetName: updated.full_name || updated.email,
      description: `${actorName} atualizou administrador via Master`,
    });

    const result = await listCompanyAdminUsers(admin, companyId);
    return NextResponse.json({ success: true, admin: updated, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar administrador.';
    const status = message.includes('Limite') ? 409 : 500;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
