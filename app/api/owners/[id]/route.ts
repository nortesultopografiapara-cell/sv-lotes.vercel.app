import { NextResponse } from 'next/server';
import {
  assertOwnerBelongsToTenant,
  resolveOwnersAdminContextFromRequest,
  saveOwnerProjectAccessEntries,
  OWNERS_SESSION_EXPIRED_MESSAGE,
} from '@/lib/ownersAdmin';
import { isValidOwnerProfileType } from '@/lib/ownerProfiles';
import type { OwnerProjectAccessInput } from '@/lib/ownerProjectAccess';
import {
  createAdminSupabase,
  logSupabaseConfigDebug,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  logSupabaseConfigDebug('API PATCH /api/owners/[id]');

  const { client: admin } = createAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const { id: ownerId } = await params;

  try {
    const body = await request.json();
    const ctx = await resolveOwnersAdminContextFromRequest(request, admin, {
      callerUserId: body.callerUserId,
      tenantId: body.tenantId,
      impersonatingTenantId: body.impersonatingTenantId,
    });
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error || OWNERS_SESSION_EXPIRED_MESSAGE }, { status: ctx.status || 403 });
    }

    const tenantId = ctx.tenantId!;
    const ownership = await assertOwnerBelongsToTenant(admin, ownerId, tenantId);
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status || 403 });
    }

    const patch: Record<string, unknown> = { role: 'OWNER' };

    if (body.fullName !== undefined || body.name !== undefined) {
      const fullName = String(body.fullName || body.name || '').trim();
      if (!fullName) {
        return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 });
      }
      patch.full_name = fullName;
    }

    if (body.phone !== undefined) {
      patch.phone = body.phone ? String(body.phone).trim() : null;
    }

    if (body.ownerDocument !== undefined) {
      patch.owner_document = body.ownerDocument ? String(body.ownerDocument).trim() : null;
    }

    if (body.ownerProfileType !== undefined || body.owner_profile_type !== undefined) {
      const ownerProfileType = String(body.ownerProfileType || body.owner_profile_type || '').trim();
      if (!isValidOwnerProfileType(ownerProfileType)) {
        return NextResponse.json({ error: 'Tipo de sócio/proprietário inválido.' }, { status: 400 });
      }
      patch.owner_profile_type = ownerProfileType;
    }

    if (body.status !== undefined) {
      const normalized = String(body.status || '').trim().toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(normalized)) {
        return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
      }
      patch.status = normalized;
    }

    if (Object.keys(patch).length > 1) {
      const { error } = await admin.from('users').update(patch).eq('id', ownerId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (Array.isArray(body.entries)) {
      await saveOwnerProjectAccessEntries(admin, {
        userId: ownerId,
        tenantId,
        entries: body.entries as OwnerProjectAccessInput[],
      });
    }

    const { data: owner } = await admin
      .from('users')
      .select(
        'id, full_name, email, phone, role, status, owner_profile_type, owner_document, created_at',
      )
      .eq('id', ownerId)
      .single();

    const { data: accessRows } = await admin
      .from('owner_project_access')
      .select('project_id, can_view_dashboard, can_view_map, can_view_finance, can_view_contracts')
      .eq('tenant_id', tenantId)
      .eq('user_id', ownerId);

    const { data: projects } = await admin
      .from('projects')
      .select('id, name')
      .or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);

    const projectNameById = new Map((projects || []).map((project) => [project.id, project.name]));

    return NextResponse.json({
      success: true,
      owner: {
        ...owner,
        name: owner?.full_name,
        projects: (accessRows || []).map((row) => ({
          project_id: row.project_id,
          project_name: projectNameById.get(row.project_id) || 'Empreendimento',
          can_view_dashboard: row.can_view_dashboard,
          can_view_map: row.can_view_map,
          can_view_finance: row.can_view_finance,
          can_view_contracts: row.can_view_contracts,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao atualizar sócio/proprietário';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
