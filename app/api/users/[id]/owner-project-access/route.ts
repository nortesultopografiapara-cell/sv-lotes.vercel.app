import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isTenantAdminRole,
  type OwnerProjectAccessInput,
} from '@/lib/ownerProjectAccess';
import { isPlatformAdmin } from '@/lib/rls';

export const runtime = 'nodejs';

function createServiceSupabase(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function assertCallerCanManage(
  client: SupabaseClient,
  callerUserId?: string | null,
): Promise<{ ok: boolean; error?: string; tenantId?: string }> {
  if (!callerUserId) {
    return { ok: false, error: 'callerUserId é obrigatório.' };
  }
  const { data, error } = await client
    .from('users')
    .select('id, role, tenant_id, company_id')
    .eq('id', callerUserId)
    .single();
  if (error || !data) {
    return { ok: false, error: 'Usuário autenticador não encontrado.' };
  }
  const role = String(data.role || '').toUpperCase();
  if (!isPlatformAdmin(role) && !isTenantAdminRole(role)) {
    return { ok: false, error: 'Permissão negada. Apenas administradores da empresa.' };
  }
  const tenantId = data.tenant_id || data.company_id;
  if (!tenantId && !isPlatformAdmin(role)) {
    return { ok: false, error: 'Empresa não vinculada ao administrador.' };
  }
  return { ok: true, tenantId: tenantId || undefined };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = createServiceSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const { id: userId } = await params;
  const url = new URL(request.url);
  const callerUserId = url.searchParams.get('callerUserId');

  const auth = await assertCallerCanManage(client, callerUserId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  let query = client
    .from('owner_project_access')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, access: data || [] });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = createServiceSupabase();
  if (!client) {
    return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
  }

  const { id: userId } = await params;

  try {
    const body = await request.json();
    const callerUserId = body.callerUserId as string | undefined;
    const tenantId = body.tenantId as string | undefined;
    const entries = (body.entries || []) as OwnerProjectAccessInput[];

    const auth = await assertCallerCanManage(client, callerUserId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const effectiveTenantId = tenantId || auth.tenantId;
    if (!effectiveTenantId) {
      return NextResponse.json({ error: 'tenantId é obrigatório.' }, { status: 400 });
    }

    const { data: targetUser, error: targetErr } = await client
      .from('users')
      .select('id, role, tenant_id, company_id')
      .eq('id', userId)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: 'Usuário alvo não encontrado.' }, { status: 404 });
    }

    const targetTenant = targetUser.tenant_id || targetUser.company_id;
    if (targetTenant !== effectiveTenantId) {
      return NextResponse.json({ error: 'Usuário pertence a outra empresa.' }, { status: 403 });
    }

    if (String(targetUser.role || '').toUpperCase() !== 'OWNER') {
      await client.from('users').update({ role: 'OWNER' }).eq('id', userId);
    }

    const projectIds = entries.map((entry) => entry.project_id).filter(Boolean);
    if (projectIds.length > 0) {
      const { data: projects, error: projectsErr } = await client
        .from('projects')
        .select('id, tenant_id, company_id')
        .in('id', projectIds);

      if (projectsErr) {
        return NextResponse.json({ error: projectsErr.message }, { status: 500 });
      }

      const invalid = (projects || []).some((project) => {
        const projectTenant = project.tenant_id || project.company_id;
        return projectTenant !== effectiveTenantId;
      });

      if (invalid || (projects || []).length !== projectIds.length) {
        return NextResponse.json(
          { error: 'Um ou mais empreendimentos não pertencem à empresa.' },
          { status: 400 },
        );
      }
    }

    const { error: deleteErr } = await client
      .from('owner_project_access')
      .delete()
      .eq('user_id', userId)
      .eq('tenant_id', effectiveTenantId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (entries.length > 0) {
      const payload = entries.map((entry) => ({
        tenant_id: effectiveTenantId,
        user_id: userId,
        project_id: entry.project_id,
        can_view_dashboard: entry.can_view_dashboard !== false,
        can_view_map: entry.can_view_map !== false,
        can_view_finance: entry.can_view_finance !== false,
        can_view_contracts: entry.can_view_contracts !== false,
      }));

      const { error: insertErr } = await client.from('owner_project_access').insert(payload);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    const { data: saved } = await client
      .from('owner_project_access')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', effectiveTenantId);

    return NextResponse.json({ success: true, access: saved || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao salvar acesso';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
