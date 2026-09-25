import { NextResponse } from 'next/server';
import { resolveApiTenantId } from '@/lib/apiTenantContext';
import { buildSafeAssistantContext } from '@/lib/assistant/context';
import { normalizeUserRole } from '@/lib/rolePermissions';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export type AssistantAuthOk = {
  ok: true;
  userId: string;
  tenantId: string | null;
  role: string;
  tenantName: string | null;
};

export type AssistantAuthDenied = {
  ok: false;
  status: 401 | 403 | 503;
  body: { error: string };
};

export async function authorizeAssistantAsk(request: Request): Promise<AssistantAuthOk | AssistantAuthDenied> {
  const { user, configError } = await getRequestAuthUser(request);
  if (!user) {
    return {
      ok: false,
      status: 401,
      body: { error: configError || 'Não autenticado.' },
    };
  }

  const { client: admin, configError: adminError } = createAdminSupabase();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      body: { error: adminError || 'Serviço indisponível.' },
    };
  }

  const profile = await resolveCallerProfile(admin, user.id);
  const role = normalizeUserRole(
    profile?.role ||
      (user.user_metadata as { role?: string } | undefined)?.role ||
      (user.app_metadata as { role?: string } | undefined)?.role,
  );
  if (!role) {
    return { ok: false, status: 403, body: { error: 'Perfil não identificado.' } };
  }

  const tenantId = await resolveApiTenantId({
    admin,
    authUser: user,
    profile,
  });

  let tenantName: string | null = null;
  if (tenantId) {
    const { data: company } = await admin.from('companies').select('name').eq('id', tenantId).maybeSingle();
    tenantName = company?.name ? String(company.name).slice(0, 120) : null;
  }

  return {
    ok: true,
    userId: user.id,
    tenantId,
    role,
    tenantName,
  };
}

export function unauthorizedJson() {
  return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
}

export function buildAssistantServerContext(input: {
  role: string;
  tenantName: string | null;
  pathname: string;
  projectName?: string | null;
  contractModel?: string | null;
  impersonatingTenant?: boolean;
  flags?: { clientPortal?: boolean; bankingUi?: boolean };
}) {
  return buildSafeAssistantContext({
    pathname: input.pathname,
    role: input.role,
    tenantName: input.tenantName,
    projectName: input.projectName,
    contractModel: input.contractModel,
    impersonatingTenant: input.impersonatingTenant,
    flags: input.flags,
  });
}
