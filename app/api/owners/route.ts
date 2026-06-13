import { NextResponse } from 'next/server';
import {
  createOwnerAccount,
  resolveOwnersAdminContextFromRequest,
  validateOwnerCreatePayload,
  OWNERS_SESSION_EXPIRED_MESSAGE,
  OWNERS_SESSION_CONFIRM_MESSAGE,
  logOwnersCreate,
  logOwnersCreateError,
} from '@/lib/ownersAdmin';
import type { OwnerProjectAccessInput } from '@/lib/ownerProjectAccess';
import {
  createAdminSupabase,
  logSupabaseConfigDebug,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function loadOwnersForTenant(admin: NonNullable<ReturnType<typeof createAdminSupabase>['client']>, tenantId: string) {
  const { data: owners, error } = await admin
    .from('users')
    .select(
      'id, full_name, email, phone, role, status, owner_profile_type, owner_document, created_at',
    )
    .eq('role', 'OWNER')
    .eq('tenant_id', tenantId)
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);

  const ownerIds = (owners || []).map((owner) => owner.id);
  if (!ownerIds.length) {
    return [];
  }

  const [{ data: accessRows }, { data: projects }] = await Promise.all([
    admin
      .from('owner_project_access')
      .select('user_id, project_id, can_view_dashboard, can_view_map, can_view_finance, can_view_contracts')
      .eq('tenant_id', tenantId)
      .in('user_id', ownerIds),
    admin.from('projects').select('id, name').or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`),
  ]);

  const projectNameById = new Map((projects || []).map((project) => [project.id, project.name]));

  return (owners || []).map((owner) => {
    const ownerAccess = (accessRows || []).filter((row) => row.user_id === owner.id);
    return {
      ...owner,
      name: owner.full_name,
      projects: ownerAccess.map((row) => ({
        project_id: row.project_id,
        project_name: projectNameById.get(row.project_id) || 'Empreendimento',
        can_view_dashboard: row.can_view_dashboard,
        can_view_map: row.can_view_map,
        can_view_finance: row.can_view_finance,
        can_view_contracts: row.can_view_contracts,
      })),
    };
  });
}

function readAuthInputFromUrl(request: Request) {
  const url = new URL(request.url);
  return {
    callerUserId: url.searchParams.get('callerUserId'),
    tenantId: url.searchParams.get('tenantId'),
    impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
  };
}

export async function GET(request: Request) {
  logSupabaseConfigDebug('API GET /api/owners');

  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const authInput = readAuthInputFromUrl(request);
  const ctx = await resolveOwnersAdminContextFromRequest(request, admin, authInput);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status || 403 });
  }

  try {
    const owners = await loadOwnersForTenant(admin, ctx.tenantId!);
    return NextResponse.json({ success: true, owners, tenantId: ctx.tenantId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao listar sócios/proprietários';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  logSupabaseConfigDebug('API POST /api/owners');

  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const validationError = validateOwnerCreatePayload(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const ctx = await resolveOwnersAdminContextFromRequest(request, admin, {
      callerUserId: body.callerUserId,
      tenantId: body.tenantId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!ctx.ok) {
      return NextResponse.json(
        { error: ctx.error || OWNERS_SESSION_CONFIRM_MESSAGE },
        { status: ctx.status || 403 },
      );
    }

    const tenantId = ctx.tenantId!;
    const fullName = String(body.fullName || body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = body.phone ? String(body.phone).trim() : null;
    const ownerDocument = body.ownerDocument ? String(body.ownerDocument).trim() : null;
    const ownerProfileType = String(body.ownerProfileType || body.owner_profile_type || '').trim();
    const status = body.status || 'ACTIVE';
    const entries = (body.entries || []) as OwnerProjectAccessInput[];

    logOwnersCreate('api_post_validated', {
      tenantId,
      email,
      fullName,
      entriesCount: entries.length,
      callerId: ctx.callerId,
    });

    const created = await createOwnerAccount(admin, {
      tenantId,
      fullName,
      email,
      phone,
      ownerDocument,
      ownerProfileType,
      status,
      password: body.password ? String(body.password).trim() : null,
      entries,
    });

    const owners = await loadOwnersForTenant(admin, tenantId);
    const saved = owners.find((owner) => owner.id === created.authUserId);

    logOwnersCreate('api_post_complete', {
      tenantId,
      email,
      authUserId: created.authUserId,
      listed: Boolean(saved),
      isExisting: created.isExisting,
      recoveredOrphan: created.recoveredOrphan,
    });

    return NextResponse.json({
      success: true,
      isExisting: created.isExisting,
      recoveredOrphan: created.recoveredOrphan,
      owner: saved,
      temporaryPassword: created.temporaryPassword,
    });
  } catch (err) {
    logOwnersCreateError('api_post_failed', err, {});
    const message = err instanceof Error ? err.message : 'Erro ao cadastrar sócio/proprietário';
    const status =
      message.includes('outro perfil') || message.includes('outra empresa') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
