import { NextResponse } from 'next/server';
import { assertSuperAdmin, createServiceSupabase } from '@/lib/apiSuperAdmin';
import { ensureSaasSubscription } from '@/lib/saasSubscriptionService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { client: supabaseAdmin, error: configError } = createServiceSupabase();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: configError }, { status: 500 });
  }

  const { id: companyId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const auth = await assertSuperAdmin(supabaseAdmin, body.userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const { data: company, error: companyErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    const result = await ensureSaasSubscription(supabaseAdmin, company);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscription: result.subscription });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
