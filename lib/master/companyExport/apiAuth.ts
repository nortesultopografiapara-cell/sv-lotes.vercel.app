import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';

export function getCompanyExportAdmin() {
  return createServiceSupabase();
}

export async function authorizeCompanyExport(
  supabaseAdmin: SupabaseClient,
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

  const userId = String(params.userId || '').trim();
  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error || 'Permissão negada.' }, { status: 403 }),
    };
  }
  return { ok: true, userId };
}

export function companyIdFromParams(params: { id?: string }): string {
  return String(params.id || '').trim();
}
