import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';

export function getCorporateFinanceServiceClient() {
  return createServiceSupabase();
}

export async function authorizeCorporateFinance(
  request: Request,
  params: {
    userId?: string | null;
    impersonatingTenantId?: string | null;
  },
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  if (params.impersonatingTenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Financeiro Corporativo Master indisponível durante impersonation.' },
        { status: 403 },
      ),
    };
  }
  const auth = await authorizePlatformAdminRequest(request, params.userId);
  if (!auth.ok) {
    return { ok: false, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  return { ok: true, userId: auth.userId };
}
