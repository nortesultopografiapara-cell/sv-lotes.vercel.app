import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { listPendingSignatureAlerts } from '@/lib/saasContractSignatureService';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  const auth = await assertSuperAdmin(supabaseAdmin, userId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const { data: companies, error } = await supabaseAdmin
    .from('companies')
    .select('id, name')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = await listPendingSignatureAlerts(
    supabaseAdmin,
    (companies || []) as Array<{ id?: string; name?: string | null }>,
  );

  return NextResponse.json({ success: true, alerts });
}
