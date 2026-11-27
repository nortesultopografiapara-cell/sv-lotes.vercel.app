import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';

export function getCompanyExportAdmin() {
  return createServiceSupabase();
}

export async function authorizeCompanyExport(
  request: Request,
  params: {
    userId?: string | null;
    impersonatingTenantId?: string | null;
  },
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const impersonating = String(params.impersonatingTenantId || '').trim();
  if (impersonating) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Exportação indisponível durante impersonation. Saia do modo empresa.' },
        { status: 403 },
      ),
    };
  }

  const auth = await authorizePlatformAdminRequest(request, params.userId);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }
  return { ok: true, userId: auth.userId };
}

export function companyIdFromParams(params: { id?: string }): string {
  return String(params.id || '').trim();
}
