import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { assertCorporateFinanceAccess } from '@/lib/master/corporateFinance/service';

export function getCorporateFinanceServiceClient() {
  return createServiceSupabase();
}

export async function authorizeCorporateFinance(
  supabaseAdmin: SupabaseClient,
  params: {
    userId?: string | null;
    impersonatingTenantId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const access = assertCorporateFinanceAccess(params);
  if (!access.ok) {
    return { ok: false, response: NextResponse.json({ error: access.error }, { status: 403 }) };
  }
  const auth = await assertSuperAdmin(supabaseAdmin, params.userId);
  if (!auth.ok) {
    return { ok: false, response: NextResponse.json({ error: auth.error }, { status: 403 }) };
  }
  return { ok: true };
}
